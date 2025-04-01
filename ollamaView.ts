import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  MarkdownRenderer,
  Notice, // Import Notice for user feedback
} from "obsidian";
import OllamaPlugin from "./main";
import { MessageService } from "./messageService";

// --- Constants ---
export const VIEW_TYPE_OLLAMA = "ollama-chat-view";
const CSS_CLASS_CONTAINER = "ollama-container";
const CSS_CLASS_CHAT_CONTAINER = "ollama-chat-container";
const CSS_CLASS_INPUT_CONTAINER = "chat-input-container";
const CSS_CLASS_BUTTONS_CONTAINER = "buttons-container";
const CSS_CLASS_SEND_BUTTON = "send-button";
const CSS_CLASS_VOICE_BUTTON = "voice-button";
const CSS_CLASS_MENU_BUTTON = "menu-button";
const CSS_CLASS_MENU_DROPDOWN = "menu-dropdown";
const CSS_CLASS_MENU_OPTION = "menu-option";
const CSS_CLASS_SETTINGS_OPTION = "settings-option";
const CSS_CLASS_EMPTY_STATE = "ollama-empty-state";
const CSS_CLASS_MESSAGE_GROUP = "message-group";
const CSS_CLASS_USER_GROUP = "user-message-group";
const CSS_CLASS_OLLAMA_GROUP = "ollama-message-group";
const CSS_CLASS_MESSAGE = "message";
const CSS_CLASS_USER_MESSAGE = "user-message";
const CSS_CLASS_OLLAMA_MESSAGE = "ollama-message";
const CSS_CLASS_BUBBLE = "bubble"; // Combined bubble class
const CSS_CLASS_USER_BUBBLE = "user-bubble";
const CSS_CLASS_OLLAMA_BUBBLE = "ollama-bubble";
const CSS_CLASS_TAIL_USER = "user-message-tail";
const CSS_CLASS_TAIL_OLLAMA = "ollama-message-tail";
const CSS_CLASS_CONTENT_CONTAINER = "message-content-container";
const CSS_CLASS_CONTENT = "message-content";
const CSS_CLASS_THINKING_DOTS = "thinking-dots";
const CSS_CLASS_THINKING_DOT = "thinking-dot";
const CSS_CLASS_THINKING_BLOCK = "thinking-block";
const CSS_CLASS_THINKING_HEADER = "thinking-header";
const CSS_CLASS_THINKING_TOGGLE = "thinking-toggle";
const CSS_CLASS_THINKING_TITLE = "thinking-title";
const CSS_CLASS_THINKING_CONTENT = "thinking-content";
const CSS_CLASS_TIMESTAMP = "message-timestamp";
const CSS_CLASS_COPY_BUTTON = "copy-button";
const CSS_CLASS_TEXTAREA_EXPANDED = "expanded"; // For styling textarea height
const CSS_CLASS_BUTTONS_LOW = "low"; // For styling button position
const CSS_CLASS_RECORDING = "recording"; // For voice button state

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface RequestOptions {
  num_ctx?: number;
}

export class OllamaView extends ItemView {
  private readonly plugin: OllamaPlugin; // Make plugin readonly
  private chatContainerEl!: HTMLElement; // Use definite assignment assertion
  private inputEl!: HTMLTextAreaElement;
  private chatContainer!: HTMLElement;
  private sendButton!: HTMLButtonElement; // Change HTMLElement to HTMLButtonElement
  private voiceButton!: HTMLButtonElement; // Change HTMLElement to HTMLButtonElement
  private menuButton!: HTMLButtonElement;  // Change HTMLElement to HTMLButtonElement

  private menuDropdown!: HTMLElement;
  private settingsOption!: HTMLElement;
  private buttonsContainer!: HTMLElement; // Added for easier access

  // Use MessageService directly for messages if appropriate, or keep local copy
  // Assuming MessageService is the source of truth, potentially remove local `messages`
  // For this optimization, we'll keep the local `messages` array as the structure relies on it.
  private messages: Message[] = [];
  private isProcessing: boolean = false;
  private scrollTimeout: NodeJS.Timeout | null = null;
  static instance: OllamaView | null = null; // Keep singleton pattern as is

  // Speech Recognition related
  private speechWorker: Worker | null = null; // Initialize as null
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null; // Store stream for cleanup

  private messagesPairCount: number = 0; // Renamed for clarity from systemMessageInterval usage
  private readonly messageService: MessageService; // Make readonly
  private emptyStateEl: HTMLElement | null = null;

  // Debounce/Throttle timers
  private resizeTimeout: NodeJS.Timeout | null = null;


  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin;

    // Refined Singleton logic: Ensure only one instance exists *per workspace leaf* concept might be complex.
    // The original logic replaces the instance globally, which might be intended. Let's keep it simple.
    // If an instance exists, potentially focus it instead of replacing? Depends on desired UX.
    // For now, keep the replacement logic but log a warning if it happens unexpectedly.
    if (OllamaView.instance && OllamaView.instance !== this) {
      console.warn("Replacing existing OllamaView instance. This might indicate an issue if not intended.");
      // Optionally: OllamaView.instance.leaf.detach(); // Detach the old view
    }
    OllamaView.instance = this;

    // Initialize services
    this.messageService = new MessageService(plugin);
    this.messageService.setView(this); // Pass the current instance

    // Initialize API service link if available
    if (this.plugin.apiService) {
      this.plugin.apiService.setOllamaView(this);
    }

    this.initSpeechWorker(); // Initialize worker during construction
  }

  // --- Obsidian View Lifecycle Methods ---

  getViewType(): string {
    return VIEW_TYPE_OLLAMA;
  }

  getDisplayText(): string {
    return "Ollama Chat"; // Consider making dynamic (e.g., based on model)
  }

  getIcon(): string {
    return "message-square"; // Ollama or AI related icon might be better
  }

  async onOpen(): Promise<void> {
    this.createUIElements();
    this.updateInputPlaceholder(this.plugin.settings.modelName);
    this.attachEventListeners();
    this.autoResizeTextarea(); // Setup auto-resize

    // Defer history loading and UI updates slightly
    // to ensure the view is fully rendered in the DOM.
    await this.loadAndRenderHistory();

    // Initial focus and scroll after history is loaded
    this.inputEl?.focus();
    this.guaranteedScrollToBottom(150); // Slightly longer delay after history load
    this.inputEl?.dispatchEvent(new Event('input')); // Trigger initial resize calculation
  }

  // Cleanup resources when the view is closed
  async onClose(): Promise<void> {
    console.log("OllamaView onClose: Cleaning up resources.");

    // Terminate Web Worker
    if (this.speechWorker) {
      this.speechWorker.terminate();
      this.speechWorker = null;
      console.log("Speech worker terminated.");
    }

    // Stop media recorder and release media stream
    this.stopVoiceRecording(false); // Stop without processing if active
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
      console.log("Audio stream stopped.");
    }

    // Clear timeouts
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);

    // Remove instance reference if this is the active instance
    if (OllamaView.instance === this) {
      OllamaView.instance = null;
    }

    // Obsidian handles registered events/DOM events cleanup automatically
    // await super.onClose(); // No need to call super.onClose usually
  }

  // --- UI Creation and Management ---

  private createUIElements(): void {
    this.contentEl.empty(); // Clear previous content

    this.chatContainerEl = this.contentEl.createDiv({ cls: CSS_CLASS_CONTAINER });

    this.chatContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_CHAT_CONTAINER });

    const inputContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER });

    this.inputEl = inputContainer.createEl("textarea", {
      attr: { placeholder: `Text to ${this.plugin.settings.modelName}...` }, // Initial placeholder
    });

    this.buttonsContainer = inputContainer.createDiv({ cls: CSS_CLASS_BUTTONS_CONTAINER });

    this.sendButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_SEND_BUTTON });
    setIcon(this.sendButton, "send");

    this.voiceButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_VOICE_BUTTON });
    setIcon(this.voiceButton, "microphone");

    this.menuButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_MENU_BUTTON });
    setIcon(this.menuButton, "more-vertical");

    // --- Menu Dropdown ---
    this.menuDropdown = inputContainer.createEl("div", { cls: CSS_CLASS_MENU_DROPDOWN });
    this.menuDropdown.style.display = "none"; // Initially hidden

    this.settingsOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_SETTINGS_OPTION}` });
    const settingsIcon = this.settingsOption.createEl("span", { cls: "menu-option-icon" });
    setIcon(settingsIcon, "settings");
    this.settingsOption.createEl("span", { cls: "menu-option-text", text: "Settings" });
  }

  private attachEventListeners(): void {
    // Input Handling (Enter key)
    this.inputEl.addEventListener("keydown", this.handleKeyDown);

    // Button Clicks
    this.sendButton.addEventListener("click", this.handleSendClick);
    this.voiceButton.addEventListener("click", this.handleVoiceClick);
    this.menuButton.addEventListener("click", this.handleMenuClick);
    this.settingsOption.addEventListener("click", this.handleSettingsClick);

    // Input auto-resize
    this.inputEl.addEventListener('input', this.handleInputForResize);
    this.registerDomEvent(window, 'resize', this.handleWindowResize); // Use Obsidian's registration
    this.registerEvent(this.app.workspace.on('resize', this.handleWindowResize));

    // Handle clicks outside the menu to close it
    this.registerDomEvent(document, 'click', this.handleDocumentClickForMenu);

    // Plugin Event Handling (Model Change)
    this.register(this.plugin.on('model-changed', this.handleModelChange));

    // Visibility Change Handling (UX)
    this.registerDomEvent(document, 'visibilitychange', this.handleVisibilityChange);

    // Active Leaf Change Handling (UX)
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange)
    );
  }

  // --- Event Handlers ---

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey && !this.isProcessing) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  private handleSendClick = (): void => {
    if (!this.isProcessing) {
      this.sendMessage();
    }
  }

  private handleVoiceClick = (): void => {
    this.toggleVoiceRecognition();
  }

  private handleMenuClick = (e: MouseEvent): void => {
    e.stopPropagation(); // Prevent document click handler from closing immediately
    const isHidden = this.menuDropdown.style.display === "none";
    this.menuDropdown.style.display = isHidden ? "block" : "none";
  }

  private handleSettingsClick = async (): Promise<void> => {
    this.closeMenu(); // Close menu first
    const setting = (this.app as any).setting;
    if (setting) {
      await setting.open();
      setting.openTabById("obsidian-ollama-duet"); // Use plugin ID
    } else {
      new Notice("Could not open settings.");
    }
  }

  private handleDocumentClickForMenu = (e: MouseEvent): void => {
    // Close menu if clicked outside the menu button and dropdown
    if (this.menuDropdown.style.display === 'block' &&
      !this.menuButton.contains(e.target as Node) &&
      !this.menuDropdown.contains(e.target as Node)) {
      this.closeMenu();
    }
  }

  private handleModelChange = (modelName: string): void => {
    this.updateInputPlaceholder(modelName);
    // Consider if a system message is always needed here. Maybe only if chat isn't empty?
    if (this.messages.length > 0) {
      this.messageService.addSystemMessage(`Model changed to: ${modelName}`);
    }
  }

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      // Use requestAnimationFrame for smoother updates after visibility change
      requestAnimationFrame(() => {
        this.guaranteedScrollToBottom(50);
        this.adjustTextareaHeight(); // Recalculate height in case view size changed while hidden
      });
    }
  }

  private handleActiveLeafChange = (): void => {
    if (this.app.workspace.getActiveViewOfType(OllamaView) === this) {
      // Delay slightly to ensure layout is complete
      setTimeout(() => this.guaranteedScrollToBottom(100), 100);
      this.inputEl?.focus(); // Focus input when view becomes active
    }
  }

  // Debounced handlers for resize/input
  private handleInputForResize = (): void => {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 50);
  };

  private handleWindowResize = (): void => {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 100); // Longer debounce for resize
  };


  // --- UI Update Methods ---

  private updateInputPlaceholder(modelName: string): void {
    if (this.inputEl) {
      this.inputEl.placeholder = `Text to ${modelName}...`;
    }
  }

  private closeMenu(): void {
    if (this.menuDropdown) {
      this.menuDropdown.style.display = "none";
    }
  }

  private autoResizeTextarea(): void {
    // Initial adjustment
    this.adjustTextareaHeight();
    // Listeners are attached in attachEventListeners
  }

  // Renamed from adjustHeight for clarity
  private adjustTextareaHeight = (): void => {
    // Use rAF for smoothnes and accurate scrollHeight calculation
    requestAnimationFrame(() => {
      if (!this.inputEl || !this.buttonsContainer) return;

      const viewHeight = this.contentEl.clientHeight;
      // Max height relative to view, prevents excessive growth
      const maxHeight = Math.max(100, viewHeight * 0.60); // Ensure min height + relative max

      this.inputEl.style.height = 'auto'; // Temporarily shrink to measure scrollHeight
      const scrollHeight = this.inputEl.scrollHeight;
      const newHeight = Math.min(scrollHeight, maxHeight);

      this.inputEl.style.height = `${newHeight}px`;

      // Use classes for button positioning for better CSS management
      if (newHeight > 45) { // Adjust threshold as needed
        this.buttonsContainer.classList.add(CSS_CLASS_BUTTONS_LOW);
      } else {
        this.buttonsContainer.classList.remove(CSS_CLASS_BUTTONS_LOW);
      }

      // Indicate visually if max height is reached and scrolling is needed
      this.inputEl.classList.toggle(CSS_CLASS_TEXTAREA_EXPANDED, scrollHeight > maxHeight);
    });
  }


  public showEmptyState(): void {
    if (this.messages.length === 0 && !this.emptyStateEl && this.chatContainer) {
      this.chatContainer.empty(); // Clear any potential loading indicators first
      this.emptyStateEl = this.chatContainer.createDiv({ cls: CSS_CLASS_EMPTY_STATE });
      this.emptyStateEl.createDiv({ cls: "empty-state-message", text: "No messages yet" });
      this.emptyStateEl.createDiv({
        cls: "empty-state-tip",
        text: `Type a message or use voice input to chat with ${this.plugin.settings.modelName}`
      });
    }
  }

  public hideEmptyState(): void {
    if (this.emptyStateEl) {
      this.emptyStateEl.remove();
      this.emptyStateEl = null;
    }
  }

  // --- Message Handling ---

  private async loadAndRenderHistory(): Promise<void> {
    try {
      await this.messageService.loadMessageHistory();
      // The messageService calls back to render methods (renderMessage, showEmptyState etc.)
      // Ensure initial state is correct after loading
      if (this.messages.length === 0) {
        this.showEmptyState();
      } else {
        this.hideEmptyState();
      }
    } catch (error) {
      console.error("Error loading message history:", error);
      new Notice("Failed to load chat history.");
      this.showEmptyState(); // Show empty state on error
    }
  }

  async saveMessageHistory(): Promise<void> {
    if (this.messages.length === 0) return;

    try {
      // Use a stable serialization format
      const serializedMessages = this.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(), // ISO format is standard
      }));
      await this.plugin.saveMessageHistory(JSON.stringify(serializedMessages));
    } catch (error) {
      console.error("Error saving message history:", error);
      new Notice("Failed to save chat history."); // Inform user
    }
  }

  // Centralized message sending logic
  async sendMessage(): Promise<void> {
    const content = this.inputEl.value.trim();
    if (!content || this.isProcessing) return; // Prevent empty or duplicate sends

    this.isProcessing = true; // Set processing state
    this.hideEmptyState(); // Ensure empty state is hidden
    this.clearInputField(); // Clear input immediately for better UX

    try {
      // Add user message locally first (Optimistic UI update)
      this.internalAddMessage("user", content);

      // Let MessageService handle the actual API call and response
      await this.messageService.sendMessage(content);

    } catch (error) {
      console.error("Error sending message:", error);
      new Notice("Failed to send message. Please try again.");
      // Optional: Add an error message to the chat?
      this.internalAddMessage("assistant", "Error: Could not send message.");
    } finally {
      this.isProcessing = false; // Reset processing state
      this.guaranteedScrollToBottom(1000);
      this.inputEl.focus(); // Re-focus input
      this.adjustTextareaHeight(); // Adjust height after clearing

    }
  }

  // Internal method to add message to local state and render
  // Called by sendMessage (user) and MessageService (assistant/system)
  public internalAddMessage(role: "user" | "assistant", content: string): void {
    const message: Message = {
      role,
      content,
      timestamp: new Date(),
    };

    this.messages.push(message);

    // Update pair count for system prompt logic
    if (role === "assistant" && this.messages.length >= 2) {
      const prevMessage = this.messages[this.messages.length - 2];
      if (prevMessage && prevMessage.role === "user") {
        this.messagesPairCount++;
      }
    }

    this.renderMessage(message); // Render the newly added message
    this.hideEmptyState(); // Ensure empty state is hidden
    this.saveMessageHistory(); // Persist history

    this.guaranteedScrollToBottom(50);
  }

  // --- Rendering Logic ---

  // Combined logic to render any message type
  renderMessage(message: Message): void {
    const isUser = message.role === "user";
    const messageIndex = this.messages.indexOf(message); // Find index for group logic
    if (messageIndex === -1) return; // Should not happen

    const prevMessage = messageIndex > 0 ? this.messages[messageIndex - 1] : null;
    const nextMessage = messageIndex < this.messages.length - 1 ? this.messages[messageIndex + 1] : null;

    const isFirstInGroup = !prevMessage || prevMessage.role !== message.role;
    const isLastInGroup = !nextMessage || nextMessage.role !== message.role;

    let messageGroup: HTMLElement;
    const lastGroup = this.chatContainer.lastElementChild as HTMLElement;

    // Create new group if first in sequence or if the last group belongs to the other role
    if (isFirstInGroup || !lastGroup || !lastGroup.classList.contains(isUser ? CSS_CLASS_USER_GROUP : CSS_CLASS_OLLAMA_GROUP)) {
      messageGroup = this.chatContainer.createDiv({
        cls: `${CSS_CLASS_MESSAGE_GROUP} ${isUser ? CSS_CLASS_USER_GROUP : CSS_CLASS_OLLAMA_GROUP}`
      });
    } else {
      // Append to the existing last group
      messageGroup = lastGroup;
      // Remove tail class from previous message in the same group
      const prevMessageEl = messageGroup.lastElementChild;
      if (prevMessageEl) {
        prevMessageEl.classList.remove(CSS_CLASS_TAIL_USER, CSS_CLASS_TAIL_OLLAMA);
      }
    }

    const messageEl = messageGroup.createDiv({
      cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_BUBBLE} ${isUser ? CSS_CLASS_USER_MESSAGE + ' ' + CSS_CLASS_USER_BUBBLE : CSS_CLASS_OLLAMA_MESSAGE + ' ' + CSS_CLASS_OLLAMA_BUBBLE}`
    });
    // Add tail class only if it's the last message in its group currently
    if (isLastInGroup) {
      messageEl.classList.add(isUser ? CSS_CLASS_TAIL_USER : CSS_CLASS_TAIL_OLLAMA);
    }


    const contentContainer = messageEl.createDiv({ cls: CSS_CLASS_CONTENT_CONTAINER });
    const contentEl = contentContainer.createDiv({ cls: CSS_CLASS_CONTENT });

    // --- Content Rendering ---
    if (message.role === "assistant") {
      // Use helper to render assistant message content (handles Markdown, thinking tags)
      this.renderAssistantContent(contentEl, message.content);
    } else {
      // Simple text rendering for user messages, preserving line breaks
      message.content.split("\n").forEach((line, index, array) => {
        contentEl.appendText(line);
        if (index < array.length - 1) {
          contentEl.createEl("br");
        }
      });
    }

    // --- Copy Button ---
    const copyButton = contentContainer.createEl("button", {
      cls: CSS_CLASS_COPY_BUTTON,
      attr: { title: "Copy" }, // Use English or i18n
    });
    setIcon(copyButton, "copy");
    copyButton.addEventListener("click", () => this.handleCopyClick(message.content, copyButton));

    // --- Timestamp (only for last message in group) ---
    if (isLastInGroup) {
      messageEl.createDiv({
        cls: CSS_CLASS_TIMESTAMP,
        text: this.formatTime(message.timestamp),
      });
    }
  }

  private renderAssistantContent(containerEl: HTMLElement, content: string): void {
    // Decode HTML entities first to reliably detect tags like <think>
    const decodedContent = this.decodeHtmlEntities(content);
    const hasThinking = this.detectThinkingTags(decodedContent); // Use decoded content for detection

    if (hasThinking.hasThinkingTags) {
      // If tags are detected, process them using the *decoded* content
      const processedHtml = this.processThinkingTags(decodedContent);
      containerEl.innerHTML = processedHtml; // Set processed HTML
      this.addThinkingToggleListeners(containerEl); // Add listeners for folding
      // Potentially add a "Toggle All" button if needed (consider UX)
      // this.addToggleAllButton(contentContainer, contentEl);
    } else {
      // If no thinking tags, render the *original* content as Markdown
      // This preserves original formatting if no special tags were used
      MarkdownRenderer.renderMarkdown(content, containerEl, this.plugin.app.vault.getRoot().path, this);
    }
  }

  private handleCopyClick(content: string, buttonEl: HTMLElement): void {
    let textToCopy = content;
    // Remove thinking blocks before copying if they exist
    if (this.detectThinkingTags(this.decodeHtmlEntities(content)).hasThinkingTags) {
      textToCopy = this.decodeHtmlEntities(content).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
      buttonEl.setText("Copied!");
      setIcon(buttonEl, "check"); // Change icon to checkmark
      setTimeout(() => {
        // Revert button state after 2 seconds
        buttonEl.setText(""); // Clear text
        setIcon(buttonEl, "copy");
      }, 2000);
    }).catch(err => {
      console.error("Failed to copy text: ", err);
      new Notice("Failed to copy text.");
    });
  }


  // --- Thinking Tag Processing ---

  private processThinkingTags(content: string): string {
    // This regex assumes <think> tags are properly formed and not nested (usually safe assumption for LLM output)
    // Using 's' flag to make '.' match newline characters as well
    const thinkingRegex = /<think>([\s\S]*?)<\/think>/g;
    let lastIndex = 0;
    const parts: string[] = [];

    // Find all matches
    let match;
    while ((match = thinkingRegex.exec(content)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(this.markdownToHtml(content.substring(lastIndex, match.index)));
      }

      // Process the thinking content
      const thinkingContent = match[1]; // Content inside <think>...</think>
      const foldableHtml = `
            <div class="${CSS_CLASS_THINKING_BLOCK}">
                <div class="${CSS_CLASS_THINKING_HEADER}" data-fold-state="folded">
                    <div class="${CSS_CLASS_THINKING_TOGGLE}">►</div>
                    <div class="${CSS_CLASS_THINKING_TITLE}">Thinking</div>
                </div>
                <div class="${CSS_CLASS_THINKING_CONTENT}" style="display: none;">
                    ${this.markdownToHtml(thinkingContent)}
                </div>
            </div>
        `;
      parts.push(foldableHtml);
      lastIndex = thinkingRegex.lastIndex; // Update last index
    }

    // Add any remaining text after the last match
    if (lastIndex < content.length) {
      parts.push(this.markdownToHtml(content.substring(lastIndex)));
    }

    return parts.join(""); // Join all parts into a single HTML string
  }


  // Renders markdown to HTML (using Obsidian's renderer)
  private markdownToHtml(markdown: string): string {
    if (!markdown || markdown.trim() === "") return "";
    const tempDiv = document.createElement("div");
    // Use the current file path context if available, otherwise root.
    const contextFilePath = this.app.workspace.getActiveFile()?.path ?? "";
    MarkdownRenderer.renderMarkdown(markdown, tempDiv, contextFilePath, this);
    return tempDiv.innerHTML;
  }

  // Adds click listeners to thinking block headers
  private addThinkingToggleListeners(contentEl: HTMLElement): void {
    const thinkingHeaders = contentEl.querySelectorAll<HTMLElement>(`.${CSS_CLASS_THINKING_HEADER}`); // Use type assertion

    thinkingHeaders.forEach((header) => {
      // Use registerDomEvent for automatic cleanup if possible, or manage manually
      header.addEventListener("click", () => {
        const content = header.nextElementSibling as HTMLElement;
        const toggleIcon = header.querySelector<HTMLElement>(`.${CSS_CLASS_THINKING_TOGGLE}`); // Use type assertion

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
        // Optional: Scroll slightly to keep the content in view after expanding/collapsing
        // this.guaranteedScrollToBottom(50);
      });
    });
  }


  // Utility to decode HTML entities (safer than innerHTML)
  private decodeHtmlEntities(text: string): string {
    if (typeof document === 'undefined') return text; // Guard for non-browser environments
    const textArea = document.createElement("textarea");
    textArea.innerHTML = text;
    return textArea.value;
  }

  // Detects if thinking tags are present (checks common variations)
  private detectThinkingTags(content: string): { hasThinkingTags: boolean; format: string } {
    // Check for the standard <think> tag, potentially ignoring case
    if (/<think>[\s\S]*?<\/think>/gi.test(content)) {
      return { hasThinkingTags: true, format: "standard" };
    }
    // Add checks for other formats if necessary (e.g., escaped), but start simple
    // Example: /&lt;think&gt;[\s\S]*?&lt;\/think&gt;/gi.test(content)
    return { hasThinkingTags: false, format: "none" };
  }

  // --- Speech Recognition ---

  private initSpeechWorker(): void {
    // Use try-catch for robustness, especially with Blob URLs and Workers
    try {
      // Optimized Base64 encoding helper function
      const bufferToBase64 = (buffer: ArrayBuffer): string => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      };

      // Worker code as a template literal for better readability
      const workerCode = `
        // Worker Scope
        self.onmessage = async (event) => {
          const { apiKey, audioBlob, languageCode = 'uk-UA' } = event.data;

          if (!apiKey || apiKey.trim() === '') {
            self.postMessage({ error: true, message: 'Google API Key is not configured. Please add it in plugin settings.' });
            return;
          }

          const url = "https://speech.googleapis.com/v1/speech:recognize?key=" + apiKey;

          try {
            const arrayBuffer = await audioBlob.arrayBuffer();

            // Optimized Base64 Conversion (using helper if needed, or direct if worker supports TextDecoder efficiently)
            // Simpler approach: pass buffer directly if API allows, or use efficient base64:
            let base64Audio;
            if (typeof TextDecoder !== 'undefined') { // Browser environment check
                 // Modern approach (often faster if native)
                 const base64String = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                 base64Audio = base64String;

            } else {
                 // Fallback (similar to original, ensure correctness)
                 base64Audio = btoa(
                   new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                 );
            }


            const response = await fetch(url, {
              method: 'POST',
              body: JSON.stringify({
                config: {
                  encoding: 'WEBM_OPUS', // Ensure this matches MediaRecorder output
                  sampleRateHertz: 48000, // Match sample rate if possible
                  languageCode: languageCode,
                  model: 'latest_long', // Consider other models if needed
                  enableAutomaticPunctuation: true,
                },
                audio: { content: base64Audio },
              }),
              headers: { 'Content-Type': 'application/json' },
            });

            const responseData = await response.json();

            if (!response.ok) {
              console.error("Google Speech API Error:", responseData);
              self.postMessage({
                error: true,
                message: "Error from Google Speech API: " + (responseData.error?.message || response.statusText || 'Unknown error')
              });
              return;
            }

            if (responseData.results && responseData.results.length > 0) {
              const transcript = responseData.results
                .map(result => result.alternatives[0].transcript)
                .join(' ')
                .trim();
              self.postMessage(transcript); // Send back only the transcript string
            } else {
               // Handle cases where API returns ok but no results (e.g., silence)
               self.postMessage({ error: true, message: 'No speech detected or recognized.' });
            }
          } catch (error) {
             console.error("Error in speech worker processing:", error);
             self.postMessage({
               error: true,
               message: 'Error processing speech recognition: ' + (error instanceof Error ? error.message : String(error))
             });
          }
        };
      `;

      const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);
      this.speechWorker = new Worker(workerUrl);
      URL.revokeObjectURL(workerUrl); // Revoke URL immediately after worker creation

      this.setupSpeechWorkerHandlers(); // Setup message/error handlers
      console.log("Speech worker initialized.");

    } catch (error) {
      console.error("Failed to initialize speech worker:", error);
      new Notice("Speech recognition feature failed to initialize.");
      this.speechWorker = null; // Ensure worker is null if init fails
    }
  }

  private setupSpeechWorkerHandlers(): void {
    if (!this.speechWorker) return;

    this.speechWorker.onmessage = (event) => {
      const data = event.data;

      // Check for error object from worker
      if (data && typeof data === 'object' && data.error) {
        console.error("Speech recognition error:", data.message);
        new Notice(`Speech Recognition Error: ${data.message}`);
        this.updateInputPlaceholder(this.plugin.settings.modelName); // Reset placeholder on error
        return;
      }

      // Process valid transcript (should be a string)
      if (typeof data === 'string' && data.trim()) {
        const transcript = data.trim();
        this.insertTranscript(transcript);
      } else if (typeof data !== 'string') {
        console.warn("Received unexpected data format from speech worker:", data);
      }
      // If data is an empty string, do nothing (might happen with short silence)
    };

    this.speechWorker.onerror = (error) => {
      console.error("Unhandled worker error:", error);
      new Notice("An unexpected error occurred in the speech recognition worker.");
      this.updateInputPlaceholder(this.plugin.settings.modelName); // Reset placeholder
      // Attempt to gracefully stop recording if it was active
      this.stopVoiceRecording(false);
    };
  }

  // Inserts recognized text into the input field
  private insertTranscript(transcript: string): void {
    if (!this.inputEl) return;

    const currentVal = this.inputEl.value;
    const start = this.inputEl.selectionStart ?? currentVal.length; // Use length if null
    const end = this.inputEl.selectionEnd ?? currentVal.length;

    // Add spacing intelligently
    let textToInsert = transcript;
    const precedingChar = start > 0 ? currentVal[start - 1] : null;
    const followingChar = end < currentVal.length ? currentVal[end] : null;

    if (precedingChar && precedingChar !== ' ' && precedingChar !== '\n') {
      textToInsert = ' ' + textToInsert;
    }
    if (followingChar && followingChar !== ' ' && followingChar !== '\n' && !textToInsert.endsWith(' ')) {
      textToInsert += ' ';
    }


    const newValue = currentVal.substring(0, start) + textToInsert + currentVal.substring(end);
    this.inputEl.value = newValue;

    // Update cursor position
    const newCursorPos = start + textToInsert.length;
    this.inputEl.setSelectionRange(newCursorPos, newCursorPos);

    this.inputEl.focus();
    this.inputEl.dispatchEvent(new Event('input')); // Trigger resize calculation
  }


  // Toggles voice recording state
  private async toggleVoiceRecognition(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.stopVoiceRecording(true); // Stop and process
    } else {
      await this.startVoiceRecognition(); // Start new recording
    }
  }

  // Starts the voice recording process
  // Починає процес розпізнавання голосу
  private async startVoiceRecognition(): Promise<void> {
    // Перевірка наявності worker'а для розпізнавання
    if (!this.speechWorker) {
      new Notice("Функція розпізнавання мовлення недоступна (worker не ініціалізовано).");
      console.error("Спроба розпочати розпізнавання голосу без ініціалізованого worker'а.");
      return;
    }
    // Перевірка наявності ключа Google API
    if (!this.plugin.settings.googleApiKey) {
      new Notice("Ключ Google API не налаштовано. Будь ласка, додайте його в налаштуваннях плагіна для використання голосового вводу.");
      return;
    }

    try {
      // Запит доступу до мікрофона
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Визначення опцій для MediaRecorder залежно від підтримки mimeType
      let recorderOptions: MediaRecorderOptions | undefined; // Використовуємо конкретний тип або undefined
      const preferredMimeType = 'audio/webm;codecs=opus'; // Бажаний формат

      if (MediaRecorder.isTypeSupported(preferredMimeType)) {
        console.log(`Використовується підтримуваний mimeType: ${preferredMimeType}`);
        recorderOptions = { mimeType: preferredMimeType }; // Призначаємо об'єкт опцій, якщо підтримується
      } else {
        console.warn(`${preferredMimeType} не підтримується, використовується стандартний браузера.`);
        recorderOptions = undefined; // Явно використовуємо undefined для стандартних налаштувань браузера
      }

      // Створення екземпляру MediaRecorder з визначеними опціями
      // Конструктор приймає MediaRecorderOptions | undefined
      this.mediaRecorder = new MediaRecorder(this.audioStream, recorderOptions);

      const audioChunks: Blob[] = []; // Масив для зберігання шматків аудіо

      // --- Оновлення UI для стану запису ---
      this.voiceButton?.classList.add(CSS_CLASS_RECORDING); // Додати клас для стилізації
      setIcon(this.voiceButton, "stop-circle"); // Змінити іконку на "стоп"
      this.inputEl.placeholder = "Запис... Говоріть зараз."; // Оновити плейсхолдер

      // --- Налаштування слухачів подій MediaRecorder ---

      // Коли доступні дані (шматок аудіо)
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data); // Додати шматок до масиву
        }
      };

      // Коли запис зупинено
      this.mediaRecorder.onstop = () => {
        console.log("MediaRecorder зупинено.");
        // Логіка обробки відбувається тут, після зупинки запису

        // Перевірка, чи є worker і чи були записані дані
        if (this.speechWorker && audioChunks.length > 0) {
          // Створити єдиний Blob з усіх шматків
          const audioBlob = new Blob(audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          console.log(`Відправка аудіо blob до worker: type=${audioBlob.type}, size=${audioBlob.size}`);
          this.inputEl.placeholder = "Обробка мовлення..."; // Оновити плейсхолдер

          // Відправити дані до Web Worker для розпізнавання
          this.speechWorker.postMessage({
            apiKey: this.plugin.settings.googleApiKey,
            audioBlob,
            languageCode: this.plugin.settings.speechLanguage || 'uk-UA' // Використати мову з налаштувань або українську за замовчуванням
          });
        } else if (audioChunks.length === 0) {
          // Якщо дані не були записані (наприклад, тиша)
          console.log("Аудіодані не записано.");
          this.updateInputPlaceholder(this.plugin.settings.modelName); // Відновити стандартний плейсхолдер
        }
        // Очищення UI та ресурсів відбувається в stopVoiceRecording, яке викликається для зупинки
      };

      // У випадку помилки запису
      this.mediaRecorder.onerror = (event) => {
        console.error("Помилка MediaRecorder:", event);
        new Notice("Під час запису сталася помилка.");
        // Зупинити запис без обробки аудіо у випадку помилки
        this.stopVoiceRecording(false);
      };

      // --- Старт запису ---
      this.mediaRecorder.start(); // Почати запис
      // Логування типу MIME, який використовується
      console.log("Запис розпочато. MimeType:", this.mediaRecorder?.mimeType ?? 'стандартний');

      // Необов'язково: таймаут для автоматичної зупинки запису
      // setTimeout(() => {
      //   if (this.mediaRecorder?.state === 'recording') {
      //     console.log("Зупинка запису через таймаут.");
      //     this.stopVoiceRecording(true); // Зупинити та обробити аудіо
      //   }
      // }, 15000); // Наприклад, 15 секунд максимальної тривалості

    } catch (error) {
      // --- Обробка помилок під час налаштування ---
      console.error("Помилка доступу до мікрофона або запуску запису:", error);
      // Надати користувачу інформативне повідомлення про помилку
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        new Notice("Доступ до мікрофона заборонено. Будь ласка, надайте дозвіл у налаштуваннях браузера/системи.");
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        new Notice("Мікрофон не знайдено. Будь ласка, переконайтеся, що мікрофон підключено та увімкнено.");
      }
      else {
        new Notice("Не вдалося розпочати запис голосу.");
      }
      // Переконатися, що ресурси очищені, навіть якщо запуск не вдався
      this.stopVoiceRecording(false);
    }
  }

  // Stops the voice recording
  private stopVoiceRecording(processAudio: boolean): void {
    console.log(`Stopping voice recording. Process audio: ${processAudio}`);
    // Stop the recorder itself
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop(); // This triggers 'onstop' handler eventually
    }
    // Regardless of recorder state, perform UI cleanup and release resources
    this.voiceButton?.classList.remove(CSS_CLASS_RECORDING);
    setIcon(this.voiceButton, "microphone"); // Reset icon
    this.updateInputPlaceholder(this.plugin.settings.modelName); // Reset placeholder

    // Stop and release the audio stream tracks
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null; // Release reference
      console.log("Audio stream tracks stopped.");
    }

    this.mediaRecorder = null; // Release recorder instance

    // Note: Actual processing happens in the 'onstop' handler after recorder stops.
    // This function mainly handles UI state and stream cleanup.
  }

  // --- Helpers & Utilities ---

  public getChatContainer(): HTMLElement {
    return this.chatContainer;
  }

  public clearChatContainer(): void {
    this.messages = []; // Clear local message state
    this.messagesPairCount = 0; // Reset pair count
    if (this.chatContainer) {
      this.chatContainer.empty();
    }
    this.showEmptyState(); // Show the empty state after clearing
    this.saveMessageHistory(); // Save the cleared history (empty array)
  }

  // Add a loading indicator (dots animation)
  public addLoadingIndicator(): HTMLElement {
    this.hideEmptyState(); // Ensure empty state is hidden
    const messageGroup = this.chatContainer.createDiv({
      cls: `${CSS_CLASS_MESSAGE_GROUP} ${CSS_CLASS_OLLAMA_GROUP}`, // Belongs to assistant
    });

    const messageEl = messageGroup.createDiv({
      cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_OLLAMA_MESSAGE} ${CSS_CLASS_TAIL_OLLAMA}`, // Has tail initially
    });

    const dotsContainer = messageEl.createDiv({ cls: CSS_CLASS_THINKING_DOTS });
    for (let i = 0; i < 3; i++) {
      dotsContainer.createDiv({ cls: CSS_CLASS_THINKING_DOT });
    }

    this.guaranteedScrollToBottom(50);
    return messageGroup; // Return the group element so it can be removed later
  }

  public removeLoadingIndicator(loadingEl: HTMLElement | null): void {
    if (loadingEl && loadingEl.parentNode) {
      loadingEl.remove();
    }
  }


  public scrollToBottom(): void {
    this.guaranteedScrollToBottom();
  }

  public clearInputField(): void {
    if (this.inputEl) {
      this.inputEl.value = "";
      // Trigger input event to potentially readjust height via autoResizeTextarea
      this.inputEl.dispatchEvent(new Event('input'));
    }
  }

  // Creates elements for MessageService to populate
  // Consider if MessageService should be more passive (return data)
  // vs active (directly manipulating view elements via these methods)
  // Keeping existing pattern for now.
  public createGroupElement(className: string): HTMLElement {
    return this.chatContainer.createDiv({ cls: className });
  }

  public createMessageElement(parent: HTMLElement, className: string): HTMLElement {
    return parent.createDiv({ cls: className });
  }

  public createContentContainer(parent: HTMLElement): HTMLElement {
    return parent.createDiv({ cls: CSS_CLASS_CONTENT_CONTAINER });
  }

  public createContentElement(parent: HTMLElement): HTMLElement {
    return parent.createDiv({ cls: CSS_CLASS_CONTENT });
  }


  // Ensures scrolling happens after potential DOM updates
  guaranteedScrollToBottom(delay = 50): void {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    this.scrollTimeout = setTimeout(() => {
      requestAnimationFrame(() => { // Use rAF for smoother scrolling
        if (this.chatContainer) {
          // Check if user has scrolled up significantly
          const scrollThreshold = 100; // Pixels from bottom
          const isScrolledUp = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight > scrollThreshold;

          if (!isScrolledUp || this.isProcessing) { // Auto-scroll if near bottom or if processing new message
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
          }
        }
      });
    }, delay);
  }


  formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); // Use locale default
  }

  // --- Methods previously part of OllamaView called by MessageService ---
  // These methods now act more directly or are handled internally

  // No longer needed directly if MessageService calls internalAddMessage
  // public addMessage(role: "user" | "assistant", content: string): void {
  //   this.internalAddMessage(role, content);
  // }

  // Replaced by addLoadingIndicator/removeLoadingIndicator
  // public addLoadingMessage1(): HTMLElement {
  //     return this.addLoadingIndicator();
  // }

  // Method likely used by MessageService or API service to update view state
  public setLoadingState(isLoading: boolean): void {
    this.isProcessing = isLoading;
    // Maybe disable input/send button while loading?
    if (this.inputEl) this.inputEl.disabled = isLoading;
    if (this.sendButton) this.sendButton.disabled = isLoading;
  }

}