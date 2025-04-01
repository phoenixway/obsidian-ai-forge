import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  MarkdownRenderer,
} from "obsidian";
import OllamaPlugin from "./main";
import { MessageService } from "./messageService";


export const VIEW_TYPE_OLLAMA = "ollama-chat-view";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface RequestOptions {
  num_ctx?: number;
}

export class OllamaView extends ItemView {
  private plugin: OllamaPlugin;
  private chatContainerEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private chatContainer: HTMLElement;
  private sendButton: HTMLElement;
  private voiceButton: HTMLElement;
  private menuButton: HTMLElement;
  private menuDropdown: HTMLElement;
  private settingsOption: HTMLElement;
  private messages: Message[] = [];
  private isProcessing: boolean = false;
  private historyLoaded: boolean = false;
  private scrollTimeout: NodeJS.Timeout | null = null;
  static instance: OllamaView | null = null;
  private speechWorker: Worker;
  private mediaRecorder: MediaRecorder | null = null;
  private systemMessageInterval: number = 0;
  private messagesPairCount: number = 0;
  private messageService: MessageService;
  private emptyStateEl: HTMLElement | null = null;


  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin;

    if (OllamaView.instance) {
      return OllamaView.instance;
    }
    OllamaView.instance = this;
    if (this.plugin.apiService) {
      this.plugin.apiService.setOllamaView(this);
    }

    this.mediaRecorder = null;

    try {
      const workerCode = `
onmessage = async (event) => {
    try {
      const { apiKey, audioBlob, languageCode = 'uk-UA' } = event.data;
      console.log("Worker received audioBlob:", audioBlob);
      
      if (!apiKey || apiKey.trim() === '') {
        postMessage({ error: true, message: 'Google API Key is not configured. Please add it in plugin settings.' });
        return;
      }

      const url = "https://speech.googleapis.com/v1/speech:recognize?key=" + apiKey;
      
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte), ''
        )
      );
      
      console.log("Audio converted to Base64");
  
      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
          config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 48000,
            languageCode: languageCode,
            model: 'latest_long',
            enableAutomaticPunctuation: true,
          },
          audio: {
            content: base64Audio
          },
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        console.error("API error details:", errorData);
        postMessage({ 
          error: true, 
          message: "Error from Google Speech API: " + (errorData.error?.message || response.status)
        });
        return;
      }
  
      const data = await response.json();
      console.log("Speech recognition data:", data);
      
      if (data.results && data.results.length > 0) {
        const transcript = data.results
          .map(result => result.alternatives[0].transcript)
          .join(' ')
          .trim();
        
        postMessage(transcript);
      } else {
        postMessage({ error: true, message: 'No speech detected' });
      }
    } catch (error) {
      console.error('Error in speech recognition:', error);
      postMessage({ 
        error: true, 
        message: 'Error processing speech recognition: ' + error.message 
      });
    }
};
  
onerror = (event) => {
  console.error('Worker error:', event);
};
`;
      const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);
      this.speechWorker = new Worker(workerUrl);
      // console.log("Worker initialized successfully:", this.speechWorker);
    } catch (error) {
      console.error("Failed to initialize worker:", error);
    }

    // In ollamaView.ts, modify the speechWorker.onmessage handler:
    this.speechWorker.onmessage = (event) => {
      const data = event.data;
      console.log("Received data from worker:", data);

      // Check if the response is an error object
      if (data && typeof data === 'object' && data.error) {
        console.error("Speech recognition error:", data.message);
        // Optionally display error message to user
        // this.plugin.showNotice(`Speech recognition error: ${data.message}`);
        return;
      }

      // Only process valid transcript text
      const transcript = typeof data === 'string' ? data : '';
      console.log("Received transcript from worker:", transcript);

      if (!transcript) {
        return; // Don't modify the input field if there's no transcript
      }

      const cursorPosition = this.inputEl.selectionStart || 0;
      const currentValue = this.inputEl.value;

      let insertText = transcript;
      if (cursorPosition > 0 && currentValue.charAt(cursorPosition - 1) !== ' ' && insertText.charAt(0) !== ' ') {
        insertText = ' ' + insertText;
      }

      const newValue = currentValue.substring(0, cursorPosition) +
        insertText +
        currentValue.substring(cursorPosition);

      this.inputEl.value = newValue;

      const newCursorPosition = cursorPosition + insertText.length;
      this.inputEl.setSelectionRange(newCursorPosition, newCursorPosition);

      this.inputEl.focus();
    };

    this.speechWorker.onerror = (error) => {
      console.error("Worker error:", error);
    };

    this.messageService = new MessageService(plugin);
    this.messageService.setView(this);
  }


  // New methods to support MessageService
  public getChatContainer(): HTMLElement {
    return this.chatContainer;
  }

  public clearChatContainer(): void {
    this.chatContainer.empty();
  }

  public scrollToBottom(): void {
    this.guaranteedScrollToBottom();
  }

  public clearInputField(): void {
    this.inputEl.value = "";
  }

  public createGroupElement(className: string): HTMLElement {
    return this.chatContainer.createDiv({
      cls: className,
    });
  }

  public createMessageElement(parent: HTMLElement, className: string): HTMLElement {
    return parent.createDiv({
      cls: className,
    });
  }

  public createContentContainer(parent: HTMLElement): HTMLElement {
    return parent.createDiv({
      cls: "message-content-container",
    });
  }

  public createContentElement(parent: HTMLElement): HTMLElement {
    return parent.createDiv({
      cls: "message-content",
    });
  }

  public addLoadingMessage1(): HTMLElement {
    const messageGroup = this.chatContainer.createDiv({
      cls: "message-group ollama-message-group",
    });

    const messageEl = messageGroup.createDiv({
      cls: "message ollama-message ollama-message-tail",
    });

    const dotsContainer = messageEl.createDiv({
      cls: "thinking-dots",
    });

    for (let i = 0; i < 3; i++) {
      dotsContainer.createDiv({
        cls: "thinking-dot",
      });
    }

    this.guaranteedScrollToBottom();

    return messageGroup;
  }

  getViewType(): string {
    return VIEW_TYPE_OLLAMA;
  }

  getDisplayText(): string {
    return "Ollama Chat";
  }

  getIcon(): string {
    return "message-square";
  }

  autoResizeTextarea(): void {
    const adjustHeight = () => {
      // Cache DOM elements and measurements to reduce reflows
      const buttonsContainer = this.contentEl.querySelector('.buttons-container') as HTMLElement;
      if (!buttonsContainer || !this.inputEl) return;

      const viewHeight = this.contentEl.clientHeight;
      const maxHeight = viewHeight * 0.66;

      // Batch DOM operations
      requestAnimationFrame(() => {
        // Reset height first
        this.inputEl.style.height = 'auto';

        // Set new height based on content
        const newHeight = Math.min(this.inputEl.scrollHeight, maxHeight);
        this.inputEl.style.height = newHeight + 'px';

        // Update button position
        if (newHeight > 40) {
          buttonsContainer.style.cssText = 'bottom: 10px; top: auto; transform: translateY(0);';
        } else {
          buttonsContainer.style.cssText = 'bottom: 50%; top: auto; transform: translateY(50%);';
        }

        // Add/remove expanded class
        this.inputEl.classList.toggle('expanded', this.inputEl.scrollHeight > maxHeight);
      });
    };

    // Throttle the input event handler to improve performance
    let resizeTimeout: NodeJS.Timeout;
    this.inputEl.addEventListener('input', () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(adjustHeight, 50) as unknown as NodeJS.Timeout;
    });

    // Initial adjustment after a short delay
    setTimeout(adjustHeight, 100);

    // Use one event listener for window resize
    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(adjustHeight, 50) as unknown as NodeJS.Timeout;
    };

    this.registerDomEvent(window, 'resize', handleResize);
    this.registerEvent(this.app.workspace.on('resize', handleResize));
  }

  // In the onOpen() method of ollamaView.ts, remove the reset option code
  // and only keep the settings option in the menu dropdown

  async onOpen(): Promise<void> {
    this.chatContainerEl = this.contentEl.createDiv({
      cls: "ollama-container",
    });

    this.chatContainer = this.chatContainerEl.createDiv({
      cls: "ollama-chat-container",
    });

    const inputContainer = this.chatContainerEl.createDiv({
      cls: "chat-input-container",
    });

    this.inputEl = inputContainer.createEl("textarea", {
      attr: {
        placeholder: `Text to ${this.plugin.settings.modelName}...`,
      },
    });

    const buttonsContainer = inputContainer.createDiv({
      cls: "buttons-container",
    });

    this.sendButton = buttonsContainer.createEl("button", {
      cls: "send-button",
    });
    setIcon(this.sendButton, "send");

    this.voiceButton = buttonsContainer.createEl("button", {
      cls: "voice-button",
    });
    setIcon(this.voiceButton, "microphone");

    this.menuButton = buttonsContainer.createEl("button", {
      cls: "menu-button",
    });
    setIcon(this.menuButton, "more-vertical");

    this.menuDropdown = inputContainer.createEl("div", {
      cls: "menu-dropdown",
    });
    this.menuDropdown.style.display = "none";

    this.settingsOption = this.menuDropdown.createEl("div", {
      cls: "menu-option settings-option",
    });
    const settingsIcon = this.settingsOption.createEl("span", { cls: "menu-option-icon" });
    setIcon(settingsIcon, "settings");
    this.settingsOption.createEl("span", {
      cls: "menu-option-text",
      text: "Settings",
    });

    this.autoResizeTextarea();

    await this.messageService.loadMessageHistory();
    this.showEmptyState();

    setTimeout(() => {
      this.forceInitialization();
      this.attachEventListeners();
    }, 500);

    const removeListener = this.plugin.on('model-changed', (modelName: string) => {
      this.updateInputPlaceholder(modelName);
      this.plugin.messageService.addSystemMessage(`Model changed to: ${modelName}`);
    });
    this.register(() => removeListener());
    this.registerDomEvent(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // When tab becomes visible again
        setTimeout(() => {
          this.guaranteedScrollToBottom();
          // Force textarea resize
          const event = new Event('input');
          this.inputEl.dispatchEvent(event);
        }, 200);
      }
    });

    // Also handle view activation specifically
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        if (this.app.workspace.getActiveViewOfType(this.constructor as any) === this) {
          setTimeout(() => this.guaranteedScrollToBottom(), 100);
        }
      })
    );
  }

  forceInitialization(): void {
    setTimeout(() => {
      this.guaranteedScrollToBottom();
      this.inputEl.focus();
      // Trigger resize event only once
      const event = new Event('input');
      this.inputEl.dispatchEvent(event);
    }, 200);
  }

  private attachEventListeners(): void {
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    this.sendButton.addEventListener("click", () => {
      this.sendMessage();
    });

    this.voiceButton.addEventListener("click", () => {
      this.startVoiceRecognition();
    });
    const closeMenu = () => {
      this.menuDropdown.style.display = "none";
      document.removeEventListener("click", closeMenu);
    };
    this.menuButton.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.menuDropdown.style.display === "none") {
        this.menuDropdown.style.display = "block";
        // Add a global click listener to close the menu when clicking outside
        setTimeout(() => {
          document.addEventListener("click", closeMenu);
        }, 0);
      } else {
        closeMenu();
      }
    });
    this.settingsOption.addEventListener("click", async () => {
      const setting = (this.app as any).setting;
      await setting.open();
      // await setting.open("obsidian-ollama-duet");
      setting.openTabById("obsidian-ollama-duet");
      closeMenu();
    });
  }

  private updateInputPlaceholder(modelName: string): void {
    if (this.inputEl) {
      this.inputEl.placeholder = `Text to ${modelName}...`;
    }
  }

  public showEmptyState(): void {
    // console.log("show empti state");

    if (this.messages.length === 0 && !this.emptyStateEl) {
      this.emptyStateEl = this.chatContainer.createDiv({
        cls: "ollama-empty-state",
      });

      const messageEl = this.emptyStateEl.createDiv({
        cls: "empty-state-message",
        text: "No messages yet"
      });

      const tipEl = this.emptyStateEl.createDiv({
        cls: "empty-state-tip",
        text: `Type a message to start chatting with ${this.plugin.settings.modelName}`
      });
    }
  }

  public hideEmptyState(): void {
    if (this.emptyStateEl && this.emptyStateEl.parentNode) {
      this.emptyStateEl.remove();
      this.emptyStateEl = null;
    }
  }

  async loadMessageHistory(): Promise<void> {
    this.messageService.loadMessageHistory();
  }

  async saveMessageHistory() {
    if (this.messages.length === 0) return;

    try {
      const serializedMessages = this.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
      }));
      await this.plugin.saveMessageHistory(JSON.stringify(serializedMessages));
    } catch (error) {
      console.error("Error saving message history:", error);
    }
  }

  guaranteedScrollToBottom(): void {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    // Use a single requestAnimationFrame for better performance
    this.scrollTimeout = setTimeout(() => {
      requestAnimationFrame(() => {
        if (!this.chatContainer) return;
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      });
    }, 50) as unknown as NodeJS.Timeout;
  }

  async sendMessage(): Promise<void> {
    const content = this.inputEl.value.trim();
    if (!content) return;

    this.messageService.sendMessage(content);
  }

  addMessage(role: "user" | "assistant", content: string): void {
    const message: Message = {
      role,
      content,
      timestamp: new Date(),
    };

    this.messages.push(message);
    this.renderMessage(message);

    if (role === "assistant" && this.messages.length >= 2) {
      if (this.messages[this.messages.length - 2].role === "user") {
        this.messagesPairCount++;
      }
    }

    this.saveMessageHistory();

    setTimeout(() => {
      this.guaranteedScrollToBottom();
    }, 100);
  }

  private processThinkingTags(content: string): string {
    if (!content.includes("<think>")) {
      return content;
    }

    const parts = [];
    let currentPosition = 0;
    const thinkingRegex = /<think>([\s\S]*?)<\/think>/g;
    let match;

    while ((match = thinkingRegex.exec(content)) !== null) {
      if (match.index > currentPosition) {
        const textBefore = content.substring(currentPosition, match.index);
        parts.push(this.markdownToHtml(textBefore));
      }

      const thinkingContent = match[1];

      const foldableHtml = `
        <div class="thinking-block">
          <div class="thinking-header" data-fold-state="expanded">
            <div class="thinking-toggle">▼</div>
            <div class="thinking-title">Thinking</div>
          </div>
          <div class="thinking-content">${this.markdownToHtml(
        thinkingContent
      )}</div>
        </div>
      `;

      parts.push(foldableHtml);
      currentPosition = match.index + match[0].length;
    }

    if (currentPosition < content.length) {
      const textAfter = content.substring(currentPosition);
      parts.push(this.markdownToHtml(textAfter));
    }

    return parts.join("");
  }

  private markdownToHtml(markdown: string): string {
    if (!markdown || markdown.trim() === "") return "";

    const tempDiv = document.createElement("div");
    MarkdownRenderer.renderMarkdown(markdown, tempDiv, "", this as any);
    return tempDiv.innerHTML;
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private addThinkingToggleListeners(contentEl: HTMLElement): void {
    const thinkingHeaders = contentEl.querySelectorAll(".thinking-header");

    thinkingHeaders.forEach((header) => {
      header.addEventListener("click", () => {
        const content = header.nextElementSibling as HTMLElement;
        const toggleIcon = header.querySelector(
          ".thinking-toggle"
        ) as HTMLElement;

        if (!content || !toggleIcon) return;

        const isFolded = header.getAttribute("data-fold-state") === "folded";

        if (isFolded) {
          content.style.display = "block";
          toggleIcon.textContent = "▼";
          header.setAttribute("data-fold-state", "expanded");
        } else {
          content.style.display = "none";
          toggleIcon.textContent = "►";
          header.setAttribute("data-fold-state", "folded");
        }
      });
    });
  }

  private hasThinkingTags(content: string): boolean {
    const formats = [
      "<think>",
      "&lt;think&gt;",
      "<think ",
      "\\<think\\>",
      "%3Cthink%3E",
    ];

    return formats.some((format) => content.includes(format));
  }

  private addToggleAllButton(
    contentContainer: HTMLElement,
    contentEl: HTMLElement
  ): void {
    const toggleAllButton = contentContainer.createEl("button", {
      cls: "toggle-all-thinking-button",
      attr: { title: "Згорнути/розгорнути всі блоки thinking" },
    });
    toggleAllButton.textContent = "Toggle All Thinking";

    toggleAllButton.addEventListener("click", () => {
      const thinkingContents = contentEl.querySelectorAll(".thinking-content");
      const thinkingToggles = contentEl.querySelectorAll(".thinking-toggle");

      let allHidden = true;
      thinkingContents.forEach((content) => {
        if ((content as HTMLElement).style.display !== "none") {
          allHidden = false;
        }
      });

      thinkingContents.forEach((content, index) => {
        (content as HTMLElement).style.display = allHidden ? "block" : "none";
        (thinkingToggles[index] as HTMLElement).textContent = allHidden
          ? "▼"
          : "►";
      });
    });
  }

  renderMessage(message: Message): void {
    const isUser = message.role === "user";
    const isFirstInGroup = this.isFirstMessageInGroup(message);
    const isLastInGroup = this.isLastMessageInGroup(message);

    let messageGroup: HTMLElement;
    const lastGroup = this.chatContainer.lastElementChild;

    if (isFirstInGroup) {
      messageGroup = this.chatContainer.createDiv({
        cls: `message-group ${isUser ? "user-message-group" : "ollama-message-group"
          }`,
      });
    } else {
      messageGroup = lastGroup as HTMLElement;
    }

    const messageEl = messageGroup.createDiv({
      cls: `message ${isUser
        ? "user-message bubble user-bubble"
        : "ollama-message bubble ollama-bubble"
        } ${isLastInGroup
          ? isUser
            ? "user-message-tail"
            : "ollama-message-tail"
          : ""
        }`,
    });

    const contentContainer = messageEl.createDiv({
      cls: "message-content-container",
    });

    const contentEl = contentContainer.createDiv({
      cls: "message-content",
    });

    if (message.role === "assistant") {
      const decodedContent = this.decodeHtmlEntities(message.content);
      const hasThinkingTags =
        message.content.includes("<think>") ||
        decodedContent.includes("<think>");

      if (hasThinkingTags) {
        const contentToProcess =
          hasThinkingTags && !message.content.includes("<thing>")
            ? decodedContent
            : message.content;

        const processedContent = this.processThinkingTags(contentToProcess);
        contentEl.innerHTML = processedContent;

        this.addThinkingToggleListeners(contentEl);
      } else {
        MarkdownRenderer.renderMarkdown(
          message.content,
          contentEl,
          "",
          this as any
        );
      }
    } else {
      message.content.split("\n").forEach((line, index, array) => {
        contentEl.createSpan({ text: line });
        if (index < array.length - 1) {
          contentEl.createEl("br");
        }
      });
    }

    const copyButton = contentContainer.createEl("button", {
      cls: "copy-button",
      attr: { title: "Скопіювати" },
    });
    setIcon(copyButton, "copy");

    copyButton.addEventListener("click", () => {
      let textToCopy = message.content;
      if (message.role === "assistant" && textToCopy.includes("<think>")) {
        textToCopy = textToCopy.replace(/<think>[\s\S]*?<\/think>/g, "");
      }

      navigator.clipboard.writeText(textToCopy);

      copyButton.setText("Copied!");
      setTimeout(() => {
        copyButton.empty();
        setIcon(copyButton, "copy");
      }, 2000);
    });

    if (isLastInGroup) {
      messageEl.createDiv({
        cls: "message-timestamp",
        text: this.formatTime(message.timestamp),
      });
    }
  }

  isFirstMessageInGroup(message: Message): boolean {
    const index = this.messages.indexOf(message);
    if (index === 0) return true;
    const prevMessage = this.messages[index - 1];
    return prevMessage.role !== message.role;
  }

  isLastMessageInGroup(message: Message): boolean {
    const index = this.messages.indexOf(message);
    if (index === this.messages.length - 1) return true;
    const nextMessage = this.messages[index + 1];
    return nextMessage.role !== message.role;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  private decodeHtmlEntities(text: string): string {
    const textArea = document.createElement("textarea");
    textArea.innerHTML = text;
    return textArea.value;
  }

  private detectThinkingTags(content: string): {
    hasThinkingTags: boolean;
    format: string;
  } {
    const formats = [
      { name: "standard", regex: /<think>[\s\S]*?<\/think>/g },
      { name: "escaped", regex: /&lt;think&gt;[\s\S]*?&lt;\/think&gt;/g },
      { name: "backslash-escaped", regex: /\\<think\\>[\s\S]*?\\<\/think\\>/g },
      { name: "url-encoded", regex: /%3Cthink%3E[\s\S]*?%3C\/think%3E/g },
    ];

    for (const format of formats) {
      if (format.regex.test(content)) {
        return { hasThinkingTags: true, format: format.name };
      }
    }

    return { hasThinkingTags: false, format: "none" };
  }

  async processWithOllama(content: string): Promise<void> {
    this.isProcessing = true;

    const loadingMessageEl = this.addLoadingMessage();

    setTimeout(async () => {
      try {
        const isNewConversation = this.messages.length <= 1;

        const systemPromptInterval = this.plugin.settings.systemPromptInterval || 0;
        let useSystemPrompt = false;

        if (systemPromptInterval === 0) {
          useSystemPrompt = true;
        } else if (systemPromptInterval > 0) {
          useSystemPrompt = this.messagesPairCount % systemPromptInterval === 0;
        }

        const formattedPrompt = await this.plugin.promptService.prepareFullPrompt(
          content,
          isNewConversation
        );

        const requestBody: {
          model: string;
          prompt: string;
          stream: boolean;
          temperature: number;
          system?: string;
          options?: RequestOptions;
        } = {
          model: this.plugin.settings.modelName,
          prompt: formattedPrompt,
          stream: false,
          temperature: this.plugin.settings.temperature || 0.2,
          options: {
            num_ctx: this.plugin.settings.contextWindow || 8192,
          }
        };

        if (useSystemPrompt) {
          const systemPrompt = this.plugin.promptService.getSystemPrompt();
          if (systemPrompt) {
            requestBody.system = systemPrompt;
            // console.log("processWithOllama: system prompt is used!");
          }
        }

        const data = await this.plugin.apiService.generateResponse(requestBody);

        if (loadingMessageEl && loadingMessageEl.parentNode) {
          loadingMessageEl.parentNode.removeChild(loadingMessageEl);
        }

        this.addMessage("assistant", data.response);
        this.initializeThinkingBlocks();
      } catch (error) {
        console.error("Error processing request with Ollama:", error);

        if (loadingMessageEl && loadingMessageEl.parentNode) {
          loadingMessageEl.parentNode.removeChild(loadingMessageEl);
        }

        this.addMessage(
          "assistant",
          "Connection error with Ollama. Please check the settings and ensure the server is running."
        );
      } finally {
        this.isProcessing = false;
      }
    }, 0);
  }

  private initializeThinkingBlocks(): void {
    setTimeout(() => {
      const thinkingHeaders =
        this.chatContainer.querySelectorAll(".thinking-header");

      thinkingHeaders.forEach((header) => {
        const content = header.nextElementSibling as HTMLElement;
        const toggleIcon = header.querySelector(
          ".thinking-toggle"
        ) as HTMLElement;

        if (!content || !toggleIcon) return;

        content.style.display = "none";
        toggleIcon.textContent = "►";
        header.setAttribute("data-fold-state", "folded");
      });
    }, 100);
  }

  addLoadingMessage(): HTMLElement {
    const messageGroup = this.chatContainer.createDiv({
      cls: "message-group ollama-message-group",
    });

    const messageEl = messageGroup.createDiv({
      cls: "message ollama-message ollama-message-tail",
    });

    const dotsContainer = messageEl.createDiv({
      cls: "thinking-dots",
    });

    for (let i = 0; i < 3; i++) {
      dotsContainer.createDiv({
        cls: "thinking-dot",
      });
    }

    this.guaranteedScrollToBottom();

    return messageGroup;
  }
  async clearChatMessages(): Promise<void> {
    this.messageService.clearChatMessages();
  }

  async startVoiceRecognition(): Promise<void> {
    const voiceButton = this.contentEl.querySelector('.voice-button');

    if (voiceButton?.classList.contains('recording')) {
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder = mediaRecorder;
      const audioChunks: Blob[] = [];

      voiceButton?.classList.add('recording');

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log("Recording stopped, chunks:", audioChunks.length);

        voiceButton?.classList.remove('recording');

        stream.getTracks().forEach(track => track.stop());

        this.updateInputPlaceholder(this.plugin.settings.modelName);

        if (audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
          console.log("Audio blob created, type:", mediaRecorder.mimeType, "size:", audioBlob.size);

          if (this.speechWorker) {
            this.speechWorker.postMessage({
              apiKey: this.plugin.settings.googleApiKey,
              audioBlob
            });
          }
        } else {
          console.error("No audio data recorded");
        }
      };

      mediaRecorder.start(100);
      console.log("Recording started with mime type:", mediaRecorder.mimeType);

      this.inputEl.placeholder = "Record...";

      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          console.log("Recording stopped after timeout");
        }
      }, 15000);
    } catch (error) {
      console.error("Error accessing microphone:", error);

      voiceButton?.classList.remove('recording');
    }
  }

  setSystemMessageInterval(interval: number): void {
    this.systemMessageInterval = interval;
  }

  onModelChanged(modelName: string): void {
    this.updateInputPlaceholder(modelName);
    // this.messageService.addSystemMessage(`Model changed to: ${modelName}`);
  }


}