// import { ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer } from "obsidian";
import { ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer, TFile } from "obsidian";
import OllamaPlugin from "./main";

// import fetch from 'node-fetch';
// import * as fs from 'fs/promises';
// import * as faiss from 'faiss-node';
import { marked } from 'marked'; // Виправлений імпорт
import pdf from 'pdf-parse'; // Декларації типів повинні бути додані


export const VIEW_TYPE_OLLAMA = "ollama-chat-view";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface OllamaEmbeddingsResponse {
  embedding: number[];
}

interface OllamaGenerateResponse {
  response: string;
}

interface OllamaResponse {
  model: string;
  response: string;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

function isOllamaEmbeddingsResponse(obj: any): obj is OllamaEmbeddingsResponse {
  return typeof obj === 'object' && obj !== null &&
    Array.isArray(obj.embedding) && obj.embedding.every((item: number) => typeof item === 'number'); // Додаємо анотацію типу
}

function isOllamaGenerateResponse(obj: any): obj is OllamaGenerateResponse {
  return typeof obj === 'object' && obj !== null && typeof obj.response === 'string';
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


  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin;
    // Force singleton pattern
    if (OllamaView.instance) {
      return OllamaView.instance;
    }
    OllamaView.instance = this;
    this.speechWorker = new Worker(new URL('./speechWorker.js', import.meta.url));

  }

  // private index: faiss.IndexFlatL2 | undefined;
  // private documents: string[] = [];


  // private async readFileContent(filePath: string): Promise<string> {
  //   // Отримуємо файл з Obsidian vault
  //   const file = this.app?.vault.getAbstractFileByPath(filePath);

  //   if (!file || !(file instanceof TFile)) {
  //     throw new Error(`File not found: ${filePath}`);
  //   }

  //   if (filePath.endsWith('.md')) {
  //     return this.readMdFile(file);
  //   } else if (filePath.endsWith('.pdf')) {
  //     throw new Error("PDF reading not supported in browser environment");
  //     // PDF обробка потребує іншого підходу
  //   } else {
  //     return this.app.vault.read(file);
  //   }
  // }
  // private async readMdFile(file: TFile): Promise<string> {
  //   const mdContent = await this.app.vault.read(file);
  //   const textContent = await marked.parse(mdContent);
  //   return textContent.replace(/<[^>]*>?/gm, '');
  // }

  // private async readPdfFile(file: TFile): Promise<string> {
  //   throw new Error("PDF reading not supported in browser environment");
  //   // Тут потрібно буде реалізувати інший підхід для читання PDF
  // }



  // private findTopK(array: number[], k: number): number[] {
  //   return array
  //     .map((value, index) => ({ value, index }))
  //     .sort((a, b) => b.value - a.value)
  //     .slice(0, k)
  //     .map(item => item.index);
  // }

  // private cosineSimilarity(vecA: number[], vecB: number[]): number {
  //   let dotProduct = 0;
  //   let normA = 0;
  //   let normB = 0;

  //   for (let i = 0; i < vecA.length; i++) {
  //     dotProduct += vecA[i] * vecB[i];
  //     normA += vecA[i] * vecA[i];
  //     normB += vecB[i] * vecB[i];
  //   }

  //   normA = Math.sqrt(normA);
  //   normB = Math.sqrt(normB);

  //   if (normA === 0 || normB === 0) {
  //     return 0;
  //   }

  //   return dotProduct / (normA * normB);
  // }

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
    this.chatContainerEl = this.contentEl.createDiv({ cls: "ollama-container" });

    // Create chat messages container
    this.chatContainer = this.chatContainerEl.createDiv({ cls: "ollama-chat-container" });

    // Create input container
    const inputContainer = this.chatContainerEl.createDiv({ cls: "chat-input-container" });

    // Create textarea for input
    this.inputEl = inputContainer.createEl("textarea", {
      attr: {
        placeholder: "Type a message...",
      },
    });
    const voiceButton = inputContainer.createEl("button", {
      cls: "voice-button",
    });
    setIcon(voiceButton, "microphone");
    const sendButton = inputContainer.createEl("button", {
      cls: "send-button",
    });
    setIcon(sendButton, "send");
    // Create settings button (now after send button)
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
      setting.open('obsidian-ollama-duet');

    });

    // Handle send button click
    sendButton.addEventListener("click", () => {
      this.sendMessage();
    });

    voiceButton.addEventListener("click", () => {
      this.startVoiceRecognition();
    });
    // Load message history
    await this.loadMessageHistory();
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
            timestamp: new Date(msg.timestamp)
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
      const serializedMessages = this.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString()
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
      // console.log("Scroll Top:", this.chatContainer.scrollTop);
      // console.log("Scroll Height:", this.chatContainer.scrollHeight);

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
      timestamp: new Date()
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
          <div class="thinking-content">${this.markdownToHtml(thinkingContent)}</div>
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

    return parts.join('');
  }

  private markdownToHtml(markdown: string): string {
    if (!markdown || markdown.trim() === '') return '';

    const tempDiv = document.createElement('div');
    MarkdownRenderer.renderMarkdown(markdown, tempDiv, '', this as any);
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

    thinkingHeaders.forEach(header => {
      header.addEventListener("click", () => {
        const content = header.nextElementSibling as HTMLElement;
        const toggleIcon = header.querySelector(".thinking-toggle") as HTMLElement;

        if (!content || !toggleIcon) return;

        const isFolded = header.getAttribute('data-fold-state') === 'folded';

        if (isFolded) {
          // Expand
          content.style.display = "block";
          toggleIcon.textContent = "▼";
          header.setAttribute('data-fold-state', 'expanded');
        } else {
          // Fold
          content.style.display = "none";
          toggleIcon.textContent = "►";
          header.setAttribute('data-fold-state', 'folded');
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
      "%3Cthink%3E" // URL encoded
    ];
    
    return formats.some(format => content.includes(format));
  }
  /**
   * Add toggle all button for thinking blocks
   */
  private addToggleAllButton(contentContainer: HTMLElement, contentEl: HTMLElement): void {
    const toggleAllButton = contentContainer.createEl("button", {
      cls: "toggle-all-thinking-button",
      attr: { title: "Згорнути/розгорнути всі блоки thinking" }
    });
    toggleAllButton.textContent = "Toggle All Thinking";

    toggleAllButton.addEventListener("click", () => {
      const thinkingContents = contentEl.querySelectorAll(".thinking-content");
      const thinkingToggles = contentEl.querySelectorAll(".thinking-toggle");

      // Check if all blocks are collapsed or expanded
      let allHidden = true;
      thinkingContents.forEach(content => {
        if ((content as HTMLElement).style.display !== "none") {
          allHidden = false;
        }
      });

      // Toggle all blocks
      thinkingContents.forEach((content, index) => {
        (content as HTMLElement).style.display = allHidden ? "block" : "none";
        (thinkingToggles[index] as HTMLElement).textContent = allHidden ? "▼" : "►";
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
        cls: `message-group ${isUser ? "user-message-group" : "ollama-message-group"}`
      });
    } else {
      // Use the last group
      messageGroup = lastGroup as HTMLElement;
    }
  
    // Create message element
    const messageEl = messageGroup.createDiv({
      cls: `message ${isUser ? "user-message bubble user-bubble" : "ollama-message bubble ollama-bubble"} ${isLastInGroup ? (isUser ? "user-message-tail" : "ollama-message-tail") : ""}`
    });
  
    // Create message content container
    const contentContainer = messageEl.createDiv({ cls: "message-content-container" });
  
    // Add message content
    const contentEl = contentContainer.createDiv({
      cls: "message-content"
    });
  
    // Render markdown for assistant messages, plain text for user
    if (message.role === "assistant") {
      // Log raw message content
      console.log("Message content before rendering:", message.content);
      console.log("Contains thinking tags:", message.content.includes("<think>"));
      console.log("Rendering message, content:", message.content);
      const tagDetection = this.detectThinkingTags(message.content);
      console.log("Thinking tag detection in renderMessage:", tagDetection);
  
      // Check for encoded thinking tags too
      const decodedContent = this.decodeHtmlEntities(message.content);
      const hasThinkingTags = message.content.includes("<think>") ||
                             decodedContent.includes("<think>");
  
      if (hasThinkingTags) {
        // Use decoded content if needed
        const contentToProcess = hasThinkingTags && !message.content.includes("<thing>") ?
                                decodedContent : message.content;
  
        console.log("Processing content with thinking tags:", contentToProcess);
        const processedContent = this.processThinkingTags(contentToProcess);
        contentEl.innerHTML = processedContent;
  
        // Add event listeners
        this.addThinkingToggleListeners(contentEl);
      } else {
        // Regular markdown rendering
        MarkdownRenderer.renderMarkdown(message.content, contentEl, '', this as any);
      }
    } else {
      // For user messages, keep as plain text
      message.content.split('\n').forEach((line, index, array) => {
        contentEl.createSpan({ text: line });
        if (index < array.length - 1) {
          contentEl.createEl('br');
        }
      });
    }
  
    // Add copy button
    const copyButton = contentContainer.createEl("button", {
      cls: "copy-button",
      attr: { title: "Скопіювати" }
    });
    setIcon(copyButton, "copy");
  
    // Add copy functionality
    copyButton.addEventListener("click", () => {
      // For assistant messages with thinking tags, strip the thinking tags when copying
      let textToCopy = message.content;
      if (message.role === "assistant" && textToCopy.includes("<thinking>")) {
        textToCopy = textToCopy.replace(/<thinking>[\s\S]*?<\/thinking>/g, "");
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
        text: this.formatTime(message.timestamp)
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
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  private decodeHtmlEntities(text: string): string {
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;
    return textArea.value;
  } 
  private detectThinkingTags(content: string): { hasThinkingTags: boolean, format: string } {
    const formats = [
      { name: "standard", regex: /<think>[\s\S]*?<\/think>/g },
      { name: "escaped", regex: /&lt;think&gt;[\s\S]*?&lt;\/think&gt;/g },
      { name: "backslash-escaped", regex: /\\<think\\>[\s\S]*?\\<\/think\\>/g },
      { name: "url-encoded", regex: /%3Cthink%3E[\s\S]*?%3C\/think%3E/g }
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
        // Get context from RAG if enabled
        let prompt = content;

        if (this.plugin.settings.ragEnabled) {
          // Make sure documents are indexed
          if (this.plugin.ragService &&
            this.plugin.ragService.findRelevantDocuments("test").length === 0) {
            await this.plugin.ragService.indexDocuments();
          }

          // Get context based on the query
          const ragContext = this.plugin.ragService.prepareContext(content);
          if (ragContext) {
            // Combine context with prompt
            prompt = `${ragContext}\n\nUser Query: ${content}\n\nPlease respond to the user's query based on the provided context. If the context doesn't contain relevant information, please state that and answer based on your general knowledge.`;
          }
        }

        // Use the API service instead of direct fetch
        const data = await this.plugin.apiService.generateResponse(
          this.plugin.settings.modelName,
          prompt
        );

        // In processWithOllama function:
        // console.log("Raw Ollama response (stringified):", JSON.stringify(data.response));
        // console.log("Raw response type:", typeof data.response);

        // console.log("Contains literal thinking tag:", data.response.includes("<think>"));
        // console.log("Contains encoded thinking tag:", data.response.includes("&lt;think&gt;"));
        // console.log("Response type:", typeof data.response);
        // console.log("Response length:", data.response.length);

        const decodedResponse = this.decodeHtmlEntities(data.response);
        // console.log("Decoded response:", decodedResponse);
        // console.log("Decoded contains thinking tags:", decodedResponse.includes("<think>"));
        
        // Use the decoded response if it contains thinking tags
        const finalResponse = decodedResponse.includes("<think>") ? 
                              decodedResponse : data.response;
    
      // Check for thinking tags with different methods
      // const hasLiteralThinkingTags = data.response.includes("<think>");
      // const hasRegexMatch = /<think>[\s\S]*?<\/think>/g.test(data.response);
      
      // console.log("Has literal thinking tags:", hasLiteralThinkingTags);
      // console.log("Has regex match for thinking tags:", hasRegexMatch);
      
      // Try to find thinking tags using regex
      // const thinkingRegex = /<think>[\s\S]*?<\/think>/g;
      // const matches = data.response.match(thinkingRegex);
      // console.log("Regex matches:", matches);

      // const tagDetection = this.detectThinkingTags(data.response);
      // console.log("Thinking tag detection:", tagDetection);
      
      // If thinking tags are detected but in an alternative format
      // if (tagDetection.hasThinkingTags && tagDetection.format !== "standard") {
      //   console.log("Detected thinking tags in non-standard format:", tagDetection.format);
      // }

        // Update the UI
        if (loadingMessageEl && loadingMessageEl.parentNode) {
          loadingMessageEl.parentNode.removeChild(loadingMessageEl);
        }

        // Add the response to the messages
        this.addMessage("assistant", finalResponse);

        // Ensure thinking blocks are properly initialized
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
      const thinkingHeaders = this.chatContainer.querySelectorAll(".thinking-header");
  
      thinkingHeaders.forEach(header => {
        const content = header.nextElementSibling as HTMLElement;
        const toggleIcon = header.querySelector(".thinking-toggle") as HTMLElement;
  
        if (!content || !toggleIcon) return;
  
        // By default, thinking blocks are collapsed
        content.style.display = "none";
        toggleIcon.textContent = "►";
        header.setAttribute('data-fold-state', 'folded');
      });
    }, 100);
  }
  
  


  addLoadingMessage(): HTMLElement {
    const messageGroup = this.chatContainer.createDiv({
      cls: "message-group ollama-message-group"
    });

    const messageEl = messageGroup.createDiv({
      cls: "message ollama-message ollama-message-tail"
    });

    const dotsContainer = messageEl.createDiv({
      cls: "thinking-dots"
    });

    // Створюємо три точки
    for (let i = 0; i < 3; i++) {
      dotsContainer.createDiv({
        cls: "thinking-dot"
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        this.speechWorker.postMessage({ apiKey: 'AIzaSyCm9wPh6ZLy-KsDzr2arMSTQ1i-yTu8nR4', audioBlob });

        this.speechWorker.onmessage = (event) => {
          const transcript = event.data;
          this.inputEl.value = transcript;
        };
      };

      mediaRecorder.start();
      setTimeout(() => {
        mediaRecorder.stop();
      }, 5000); // Stop recording after 5 seconds
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  }

}