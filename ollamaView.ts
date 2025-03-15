import { ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer } from "obsidian";
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

  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin;
    // Force singleton pattern
    if (OllamaView.instance) {
      return OllamaView.instance;
    }
    OllamaView.instance = this;
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
    // Create send button (moved before settings button)
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
      console.log("Scroll Top:", this.chatContainer.scrollTop);
      console.log("Scroll Height:", this.chatContainer.scrollHeight);

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
      // Parse and render markdown
      MarkdownRenderer.renderMarkdown(
        message.content,
        contentEl,
        '',
        this as any
      );
    } else {
      // For user messages, use plain text with line breaks
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
      navigator.clipboard.writeText(message.content);

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

  async processWithOllama(content: string): Promise<void> {
    this.isProcessing = true;

    // Add a temporary "loading" message
    const loadingMessageEl = this.addLoadingMessage();

    // Execute the request in a background thread
    setTimeout(async () => {
      try {
        const serverUrl = this.plugin.getOllamaApiUrl();
        const response = await fetch(`${serverUrl}/api/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.plugin.settings.modelName,
            prompt: content,
            stream: false,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        // Update the UI in requestAnimationFrame
        requestAnimationFrame(() => {
          if (loadingMessageEl.parentNode) {
            loadingMessageEl.parentNode.removeChild(loadingMessageEl);
          }
          this.addMessage("assistant", data.response);
        });
      } catch (error) {
        console.error("Error processing request with Ollama:", error);

        requestAnimationFrame(() => {
          if (loadingMessageEl.parentNode) {
            loadingMessageEl.parentNode.removeChild(loadingMessageEl);
          }
          this.addMessage(
            "assistant",
            "Connection error with Ollama. Please check the settings and ensure the server is running."
          );
        });
      } finally {
        this.isProcessing = false;
      }
    }, 0);
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
}