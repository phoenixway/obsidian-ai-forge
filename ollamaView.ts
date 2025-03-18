import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  MarkdownRenderer,
} from "obsidian";
import OllamaPlugin from "./main";

export const VIEW_TYPE_OLLAMA = "ollama-chat-view";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export class OllamaView extends ItemView {
  private plugin: OllamaPlugin;
  private chatContainerEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private chatContainer: HTMLElement;
  private messages: Message[] = [];
  private isProcessing: boolean = false;
  private historyLoaded: boolean = false;
  private scrollTimeout: NodeJS.Timeout | null = null;
  static instance: OllamaView | null = null;
  // private embeddings: number[][] = [];
  private speechWorker: Worker;
  private mediaRecorder: MediaRecorder | null = null; // Додана нова змінна


  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin;
    // Force singleton pattern
    if (OllamaView.instance) {
      return OllamaView.instance;
    }
    OllamaView.instance = this;

    // Додати змінну для зберігання посилання на mediaRecorder
    this.mediaRecorder = null;

    try {
      // Варіант з використанням Blob API
      // Оновлений код воркера для speechWorker
      const workerCode = `
onmessage = async (event) => {
    try {
      const { apiKey, audioBlob, languageCode = 'uk-UA' } = event.data;
      console.log("Worker received audioBlob:", audioBlob);
      
      // Перевіряємо наявність API ключа
      if (!apiKey || apiKey.trim() === '') {
        postMessage({ error: true, message: 'Google API Key is not configured. Please add it in plugin settings.' });
        return;
      }

      const url = "https://speech.googleapis.com/v1/speech:recognize?key=" + apiKey;
      
      // Конвертуємо Blob у Base64
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
            languageCode: languageCode, // Використовуємо параметр мови
            model: 'latest_long', // Використовуємо модель для довгих записів
            enableAutomaticPunctuation: true, // Додаємо автоматичну пунктуацію
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
        // Об'єднуємо всі розпізнані фрагменти тексту
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
      console.log("Worker initialized successfully:", this.speechWorker);
    } catch (error) {
      console.error("Failed to initialize worker:", error);
    }

    // Оновлений обробник повідомлень від воркера
    this.speechWorker.onmessage = (event) => {
      const transcript = event.data;
      console.log("Received transcript from worker:", transcript);

      // Вставляємо текст у позицію курсора
      const cursorPosition = this.inputEl.selectionStart || 0;
      const currentValue = this.inputEl.value;

      // Додаємо пробіл перед текстом, якщо курсор не на початку рядка і попередній символ не пробіл
      let insertText = transcript;
      if (cursorPosition > 0 && currentValue.charAt(cursorPosition - 1) !== ' ' && insertText.charAt(0) !== ' ') {
        insertText = ' ' + insertText;
      }

      // Створюємо новий текст, вставляючи розпізнаний текст у позицію курсора
      const newValue = currentValue.substring(0, cursorPosition) +
        insertText +
        currentValue.substring(cursorPosition);

      // Оновлюємо значення поля вводу
      this.inputEl.value = newValue;

      // Переміщуємо курсор після вставленого тексту
      const newCursorPosition = cursorPosition + insertText.length;
      this.inputEl.setSelectionRange(newCursorPosition, newCursorPosition);

      // Фокусуємось на полі вводу
      this.inputEl.focus();
    };

    this.speechWorker.onerror = (error) => {
      console.error("Worker error:", error);
    };
  }

  getViewType(): string {
    return VIEW_TYPE_OLLAMA;
  }

  getDisplayText(): string {
    return "Ollama Chat";
  }

  getIcon(): string {
    return "message-square"; // Та сама іконка, що використовується в рібоні
  }

  async onOpen(): Promise<void> {
    // Create main container
    this.chatContainerEl = this.contentEl.createDiv({
      cls: "ollama-container",
    });

    // Create chat messages container
    this.chatContainer = this.chatContainerEl.createDiv({
      cls: "ollama-chat-container",
    });

    // Create input container
    const inputContainer = this.chatContainerEl.createDiv({
      cls: "chat-input-container",
    });

    // Create textarea for input
    this.inputEl = inputContainer.createEl("textarea", {
      attr: {
        placeholder: "Type a message...",
      },
    });

    const sendButton = inputContainer.createEl("button", {
      cls: "send-button",
    });
    setIcon(sendButton, "send");

    const voiceButton = inputContainer.createEl("button", {
      cls: "voice-button",
    });
    setIcon(voiceButton, "microphone");

    const resetButton = inputContainer.createEl("button", {
      cls: "reset-button",
    });
    setIcon(resetButton, "refresh-ccw");

    // Create settings button
    const settingsButton = inputContainer.createEl("button", {
      cls: "settings-button",
    });
    setIcon(settingsButton, "settings");

    // Handle enter key to send message
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    // Handle settings button click
    settingsButton.addEventListener("click", () => {
      const setting = (this.app as any).setting;
      // setting.open();
      // setting.openTabById('obsidian-ollama-duet');
      setting.open("obsidian-ollama-duet");
    });

    // Handle send button click
    sendButton.addEventListener("click", () => {
      this.sendMessage();
    });

    voiceButton.addEventListener("click", () => {
      this.startVoiceRecognition();
    });
    resetButton.addEventListener("click", () => {
      this.plugin.apiService.resetState();
      this.clearChatMessages();
      this.addMessage("assistant", "State reset. What would you like to do now?");
      setTimeout(() => {
        this.inputEl.focus();
      }, 100);
    });
  }

  async loadMessageHistory() {
    if (this.historyLoaded) return;

    try {
      const history = await this.plugin.loadMessageHistory();

      if (Array.isArray(history) && history.length > 0) {
        // Clear existing messages
        this.messages = [];
        this.chatContainer.empty();
        // Add each message from history
        for (const msg of history) {
          // Convert string timestamp to Date object
          const message = {
            ...msg,
            timestamp: new Date(msg.timestamp),
          };

          this.messages.push(message);
          this.renderMessage(message);
        }

        // Scroll to bottom after loading history
        this.guaranteedScrollToBottom();

        // Initialize thinking blocks to be collapsed
        this.initializeThinkingBlocks();
      }

      this.historyLoaded = true;
    } catch (error) {
      console.error("Error loading message history:", error);
    }
  }

  async saveMessageHistory() {
    if (this.messages.length === 0) return;

    try {
      // Convert messages to a serializable format
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
    // Clear any pending scroll operation
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    // Use requestAnimationFrame to ensure scroll happens after rendering
    requestAnimationFrame(() => {
      if (!this.chatContainer) return;

      // Log scroll values for debugging
      //
      //

      // Scroll to bottom
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    });
  }

  async sendMessage(): Promise<void> {
    if (this.isProcessing) return;

    const content = this.inputEl.value.trim();
    if (!content) return;

    // Add user message to chat
    this.addMessage("user", content);

    // Clear input
    this.inputEl.value = "";

    // Process with Ollama API
    await this.processWithOllama(content);
  }

  addMessage(role: "user" | "assistant", content: string): void {
    const message: Message = {
      role,
      content,
      timestamp: new Date(),
    };

    this.messages.push(message);
    this.renderMessage(message);

    // Save updated message history
    this.saveMessageHistory();

    // Guaranteed scroll to bottom after rendering
    setTimeout(() => {
      this.guaranteedScrollToBottom();
    }, 100); // Adjust timeout if necessary
  }
  private processThinkingTags(content: string): string {
    // Early return if no thinking tags
    if (!content.includes("<think>")) {
      return content;
    }

    const parts = [];
    let currentPosition = 0;
    // Use a more robust regex with the 's' flag for multi-line matching
    const thinkingRegex = /<think>([\s\S]*?)<\/think>/g;
    let match;

    while ((match = thinkingRegex.exec(content)) !== null) {
      // Add text before the thinking block
      if (match.index > currentPosition) {
        const textBefore = content.substring(currentPosition, match.index);
        parts.push(this.markdownToHtml(textBefore));
      }

      // Get the thinking content
      const thinkingContent = match[1];

      // Create foldable thinking block
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

    // Add remaining content after last thinking block
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

  /**
   * Escape HTML special characters
   */
  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private addThinkingToggleListeners(contentEl: HTMLElement): void {
    // Find all thinking headers
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
          // Expand
          content.style.display = "block";
          toggleIcon.textContent = "▼";
          header.setAttribute("data-fold-state", "expanded");
        } else {
          // Fold
          content.style.display = "none";
          toggleIcon.textContent = "►";
          header.setAttribute("data-fold-state", "folded");
        }
      });
    });
  }

  private hasThinkingTags(content: string): boolean {
    // Check for various possible formats of thinking tags
    const formats = [
      "<think>",
      "&lt;think&gt;",
      "<think ", // In case there are attributes
      "\\<think\\>",
      "%3Cthink%3E", // URL encoded
    ];

    return formats.some((format) => content.includes(format));
  }
  /**
   * Add toggle all button for thinking blocks
   */
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

      // Check if all blocks are collapsed or expanded
      let allHidden = true;
      thinkingContents.forEach((content) => {
        if ((content as HTMLElement).style.display !== "none") {
          allHidden = false;
        }
      });

      // Toggle all blocks
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

    // Check if we need to create a new message group
    let messageGroup: HTMLElement;
    const lastGroup = this.chatContainer.lastElementChild;

    if (isFirstInGroup) {
      // Create a new message group
      messageGroup = this.chatContainer.createDiv({
        cls: `message-group ${isUser ? "user-message-group" : "ollama-message-group"
          }`,
      });
    } else {
      // Use the last group
      messageGroup = lastGroup as HTMLElement;
    }

    // Create message element
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

    // Create message content container
    const contentContainer = messageEl.createDiv({
      cls: "message-content-container",
    });

    // Add message content
    const contentEl = contentContainer.createDiv({
      cls: "message-content",
    });

    // Render markdown for assistant messages, plain text for user
    if (message.role === "assistant") {
      // Log raw message content
      //
      //
      //
      // const tagDetection = this.detectThinkingTags(message.content);
      //

      // Check for encoded thinking tags too
      const decodedContent = this.decodeHtmlEntities(message.content);
      const hasThinkingTags =
        message.content.includes("<think>") ||
        decodedContent.includes("<think>");

      if (hasThinkingTags) {
        // Use decoded content if needed
        const contentToProcess =
          hasThinkingTags && !message.content.includes("<thing>")
            ? decodedContent
            : message.content;

        //
        const processedContent = this.processThinkingTags(contentToProcess);
        contentEl.innerHTML = processedContent;

        // Add event listeners
        this.addThinkingToggleListeners(contentEl);
      } else {
        // Regular markdown rendering
        MarkdownRenderer.renderMarkdown(
          message.content,
          contentEl,
          "",
          this as any
        );
      }
    } else {
      // For user messages, keep as plain text
      message.content.split("\n").forEach((line, index, array) => {
        contentEl.createSpan({ text: line });
        if (index < array.length - 1) {
          contentEl.createEl("br");
        }
      });
    }

    // Add copy button
    const copyButton = contentContainer.createEl("button", {
      cls: "copy-button",
      attr: { title: "Скопіювати" },
    });
    setIcon(copyButton, "copy");

    // Add copy functionality
    copyButton.addEventListener("click", () => {
      // For assistant messages with thinking tags, strip the thinking tags when copying
      let textToCopy = message.content;
      if (message.role === "assistant" && textToCopy.includes("<think>")) {
        textToCopy = textToCopy.replace(/<think>[\s\S]*?<\/think>/g, "");
      }

      navigator.clipboard.writeText(textToCopy);

      // Show feedback
      copyButton.setText("Copied!");
      setTimeout(() => {
        copyButton.empty();
        setIcon(copyButton, "copy");
      }, 2000);
    });

    // Add timestamp if last in group
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

    // Add a temporary "loading" message
    const loadingMessageEl = this.addLoadingMessage();

    // Execute the request
    setTimeout(async () => {
      try {
        // Check if this is a new conversation
        const isNewConversation = this.messages.length <= 1;

        // Use the API service to generate a response
        // All the prompt preparation is now handled inside the API service
        const data = await this.plugin.apiService.generateResponse(
          this.plugin.settings.modelName,
          content,
          isNewConversation
        );

        // Remove loading message
        if (loadingMessageEl && loadingMessageEl.parentNode) {
          loadingMessageEl.parentNode.removeChild(loadingMessageEl);
        }

        // Add the assistant's response to the chat
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
    // Find all thinking blocks and initialize them correctly
    setTimeout(() => {
      const thinkingHeaders =
        this.chatContainer.querySelectorAll(".thinking-header");

      thinkingHeaders.forEach((header) => {
        const content = header.nextElementSibling as HTMLElement;
        const toggleIcon = header.querySelector(
          ".thinking-toggle"
        ) as HTMLElement;

        if (!content || !toggleIcon) return;

        // By default, thinking blocks are collapsed
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

    // Створюємо три точки
    for (let i = 0; i < 3; i++) {
      dotsContainer.createDiv({
        cls: "thinking-dot",
      });
    }

    // Scroll to bottom after adding loading indicator
    this.guaranteedScrollToBottom();

    return messageGroup;
  }

  async clearChatMessages() {
    this.messages = [];
    this.chatContainer.empty();
    this.historyLoaded = false;
  }

  async startVoiceRecognition(): Promise<void> {
    // Знаходимо кнопку мікрофона
    const voiceButton = this.contentEl.querySelector('.voice-button');

    // Перевіряємо, чи вже йде запис
    if (voiceButton?.classList.contains('recording')) {
      // Якщо вже записуємо, зупиняємо запис
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Використовуємо підтримуваний формат без специфікації кодеку
      const mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder = mediaRecorder; // Зберігаємо посилання на mediaRecorder
      const audioChunks: Blob[] = [];

      // Додаємо клас recording для зміни стилю на синій
      voiceButton?.classList.add('recording');

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log("Data available, size:", event.data.size);
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log("Recording stopped, chunks:", audioChunks.length);

        // Видаляємо клас recording, коли запис зупинено
        voiceButton?.classList.remove('recording');

        // Зупиняємо всі треки потоку
        stream.getTracks().forEach(track => track.stop());

        this.inputEl.placeholder = "Type a message...";

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

      // Просимо MediaRecorder записувати частіше (для більш швидкої відповіді)
      mediaRecorder.start(100);
      console.log("Recording started with mime type:", mediaRecorder.mimeType);

      // Додайте візуальну індикацію запису
      this.inputEl.placeholder = "Record...";

      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          console.log("Recording stopped after timeout");
        }
      }, 5000);
    } catch (error) {
      console.error("Error accessing microphone:", error);

      // Прибираємо клас recording у разі помилки
      voiceButton?.classList.remove('recording');
    }
  }
}
