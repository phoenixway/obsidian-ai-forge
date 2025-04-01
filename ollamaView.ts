import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  MarkdownRenderer,
  Notice, // Import Notice for user feedback
  debounce // Import debounce if needed, or use simple timeouts
} from "obsidian";
import OllamaPlugin from "./main";
import { MessageService } from "./messageService";

// --- Constants ---
export const VIEW_TYPE_OLLAMA = "ollama-chat-view";
// --- Existing CSS Class Constants ---
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
const CSS_CLASS_BUBBLE = "bubble";
const CSS_CLASS_USER_BUBBLE = "user-bubble";
const CSS_CLASS_OLLAMA_BUBBLE = "ollama-bubble";
// const CSS_CLASS_TAIL_USER = "user-message-tail"; // Tails removed in latest CSS
// const CSS_CLASS_TAIL_OLLAMA = "ollama-message-tail"; // Tails removed in latest CSS
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
const CSS_CLASS_TEXTAREA_EXPANDED = "expanded";
// const CSS_CLASS_BUTTONS_LOW = "low"; // This logic might be handled differently by positioning in CSS now
const CSS_CLASS_RECORDING = "recording";
const CSS_CLASS_DISABLED = "disabled"; // For disabled buttons
const CSS_CLASS_MESSAGE_ARRIVING = "message-arriving"; // For animation
const CSS_CLASS_DATE_SEPARATOR = "chat-date-separator"; // For date separator
const CSS_CLASS_AVATAR = "message-group-avatar"; // For avatars
const CSS_CLASS_AVATAR_USER = "user-avatar";
const CSS_CLASS_AVATAR_AI = "ai-avatar";
const CSS_CLASS_CODE_BLOCK_COPY_BUTTON = "code-block-copy-button"; // Copy btn in code blocks
const CSS_CLASS_NEW_MESSAGE_INDICATOR = "new-message-indicator"; // Scroll down indicator
const CSS_CLASS_VISIBLE = "visible"; // For making elements visible
const CSS_CLASS_MENU_SEPARATOR = "menu-separator"; // Menu separator
const CSS_CLASS_CLEAR_CHAT_OPTION = "clear-chat-option"; // Clear chat menu option


interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface RequestOptions {
  num_ctx?: number;
}

export class OllamaView extends ItemView {
  private readonly plugin: OllamaPlugin;
  private chatContainerEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private chatContainer!: HTMLElement;
  private sendButton!: HTMLButtonElement;
  private voiceButton!: HTMLButtonElement;
  private menuButton!: HTMLButtonElement;

  private menuDropdown!: HTMLElement;
  private clearChatOption!: HTMLElement; // Added menu option
  private settingsOption!: HTMLElement;
  private buttonsContainer!: HTMLElement;

  private messages: Message[] = [];
  private isProcessing: boolean = false;
  private scrollTimeout: NodeJS.Timeout | null = null;
  static instance: OllamaView | null = null;

  // Speech Recognition related
  private speechWorker: Worker | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;

  private messagesPairCount: number = 0;
  private readonly messageService: MessageService;
  private emptyStateEl: HTMLElement | null = null;

  // Debounce/Throttle timers
  private resizeTimeout: NodeJS.Timeout | null = null;
  private scrollListenerDebounced: () => void; // For debounced scroll handling

  // --- New State Variables for UI Improvements ---
  private lastMessageDate: Date | null = null; // For date separators
  private newMessagesIndicatorEl: HTMLElement | null = null; // For "New Msgs" btn
  private userScrolledUp: boolean = false; // Track if user scrolled away from bottom

  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin;

    // Singleton Logic (keep as is)
    if (OllamaView.instance && OllamaView.instance !== this) {
      console.warn("Replacing existing OllamaView instance.");
    }
    OllamaView.instance = this;

    this.messageService = new MessageService(plugin);
    this.messageService.setView(this);

    if (this.plugin.apiService) {
      this.plugin.apiService.setOllamaView(this);
    }

    this.initSpeechWorker();

    // Debounce scroll listener
    this.scrollListenerDebounced = debounce(this.handleScroll, 150, true);
  }

  // --- Obsidian View Lifecycle Methods ---

  getViewType(): string { return VIEW_TYPE_OLLAMA; }
  getDisplayText(): string { return "Ollama Chat"; }
  getIcon(): string { return "message-square"; } // Consider "bot" or a custom icon

  async onOpen(): Promise<void> {
    this.createUIElements();
    this.updateInputPlaceholder(this.plugin.settings.modelName);
    this.attachEventListeners();
    this.autoResizeTextarea();
    this.updateSendButtonState(); // Initial state check

    // Load history and reset date tracking
    this.lastMessageDate = null; // Reset date for history loading
    await this.loadAndRenderHistory();

    this.inputEl?.focus();
    this.guaranteedScrollToBottom(150, true); // Force scroll on open
    this.inputEl?.dispatchEvent(new Event('input'));
  }

  async onClose(): Promise<void> {
    // --- Cleanup remains the same ---
    console.log("OllamaView onClose: Cleaning up resources.");
    if (this.speechWorker) {
      this.speechWorker.terminate(); this.speechWorker = null; console.log("Speech worker terminated.");
    }
    this.stopVoiceRecording(false);
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop()); this.audioStream = null; console.log("Audio stream stopped.");
    }
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    if (OllamaView.instance === this) { OllamaView.instance = null; }
    // --- End of Cleanup ---
  }

  // --- UI Creation and Management ---

  private createUIElements(): void {
    this.contentEl.empty();
    this.chatContainerEl = this.contentEl.createDiv({ cls: CSS_CLASS_CONTAINER });
    this.chatContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_CHAT_CONTAINER });

    // --- New Message Indicator (Initially Hidden) ---
    this.newMessagesIndicatorEl = this.chatContainerEl.createDiv({ cls: CSS_CLASS_NEW_MESSAGE_INDICATOR });
    const indicatorIcon = this.newMessagesIndicatorEl.createSpan({ cls: "indicator-icon" });
    setIcon(indicatorIcon, "arrow-down"); // Use an arrow icon
    this.newMessagesIndicatorEl.createSpan({ text: " New Messages" }); // Add text


    const inputContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER });
    this.inputEl = inputContainer.createEl("textarea", {
      attr: { placeholder: `Text to ${this.plugin.settings.modelName}...` },
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
    this.menuDropdown.style.display = "none";

    // --- Add Clear Chat Option ---
    this.clearChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLEAR_CHAT_OPTION}` });
    const clearIcon = this.clearChatOption.createEl("span", { cls: "menu-option-icon" });
    setIcon(clearIcon, "trash-2"); // Use trash icon
    this.clearChatOption.createEl("span", { cls: "menu-option-text", text: "Clear Chat" });

    // --- Add Separator ---
    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    // --- Settings Option ---
    this.settingsOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_SETTINGS_OPTION}` });
    const settingsIcon = this.settingsOption.createEl("span", { cls: "menu-option-icon" });
    setIcon(settingsIcon, "settings");
    this.settingsOption.createEl("span", { cls: "menu-option-text", text: "Settings" });
  }

  private attachEventListeners(): void {
    // Input Handling
    this.inputEl.addEventListener("keydown", this.handleKeyDown);
    this.inputEl.addEventListener('input', this.handleInputForResize); // Also update send button state here

    // Button Clicks
    this.sendButton.addEventListener("click", this.handleSendClick);
    this.voiceButton.addEventListener("click", this.handleVoiceClick);
    this.menuButton.addEventListener("click", this.handleMenuClick);
    this.settingsOption.addEventListener("click", this.handleSettingsClick);
    this.clearChatOption.addEventListener("click", this.handleClearChatClick); // Add listener for clear chat

    // Auto-resize
    this.registerDomEvent(window, 'resize', this.handleWindowResize);
    this.registerEvent(this.app.workspace.on('resize', this.handleWindowResize));

    // Menu Handling
    this.registerDomEvent(document, 'click', this.handleDocumentClickForMenu);

    // Plugin Event Handling
    this.register(this.plugin.on('model-changed', this.handleModelChange));

    // Visibility & Focus Handling
    this.registerDomEvent(document, 'visibilitychange', this.handleVisibilityChange);
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange));

    // --- New Event Listeners ---
    // Scroll listener for "New Messages" indicator
    this.registerDomEvent(this.chatContainer, 'scroll', this.scrollListenerDebounced);
    // Click listener for "New Messages" indicator
    if (this.newMessagesIndicatorEl) {
      this.registerDomEvent(this.newMessagesIndicatorEl, 'click', this.handleNewMessageIndicatorClick);
    }
  }

  // --- Event Handlers ---

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey && !this.isProcessing && !this.sendButton.disabled) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  private handleSendClick = (): void => {
    if (!this.isProcessing && !this.sendButton.disabled) {
      this.sendMessage();
    }
  }

  private handleVoiceClick = (): void => { // No changes needed here for UI
    this.toggleVoiceRecognition();
  }

  private handleMenuClick = (e: MouseEvent): void => { // No changes needed here
    e.stopPropagation();
    const isHidden = this.menuDropdown.style.display === "none";
    this.menuDropdown.style.display = isHidden ? "block" : "none";
  }

  private handleSettingsClick = async (): Promise<void> => { // No changes needed here
    this.closeMenu();
    const setting = (this.app as any).setting;
    if (setting) {
      await setting.open();
      setting.openTabById("obsidian-ollama-duet");
    } else {
      new Notice("Could not open settings.");
    }
  }

  // --- New Handler for Clear Chat ---
  private handleClearChatClick = (): void => {
    this.closeMenu();
    // Confirmation could be added here
    this.clearChatContainer();
    new Notice("Chat history cleared.");
  }

  private handleDocumentClickForMenu = (e: MouseEvent): void => { // No changes needed here
    if (this.menuDropdown.style.display === 'block' &&
      !this.menuButton.contains(e.target as Node) &&
      !this.menuDropdown.contains(e.target as Node)) {
      this.closeMenu();
    }
  }

  private handleModelChange = (modelName: string): void => { // No changes needed here
    this.updateInputPlaceholder(modelName);
    if (this.messages.length > 0) {
      this.messageService.addSystemMessage(`Model changed to: ${modelName}`);
    }
  }

  private handleVisibilityChange = (): void => { // No changes needed here
    if (document.visibilityState === 'visible') {
      requestAnimationFrame(() => {
        this.guaranteedScrollToBottom(50);
        this.adjustTextareaHeight();
      });
    }
  }

  private handleActiveLeafChange = (): void => { // No changes needed here
    if (this.app.workspace.getActiveViewOfType(OllamaView) === this) {
      setTimeout(() => this.guaranteedScrollToBottom(100), 100);
      this.inputEl?.focus();
    }
  }

  // Combined handler for input and send button state update
  private handleInputForResize = (): void => {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 50);
    this.updateSendButtonState(); // Update button state on input
  };

  private handleWindowResize = (): void => { // No changes needed here
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 100);
  };

  // --- New Scroll Handler ---
  private handleScroll = (): void => {
    if (!this.chatContainer) return;
    const scrollThreshold = 150; // Increased threshold a bit
    const isScrolledToBottom = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight < scrollThreshold;

    if (!isScrolledToBottom) {
      this.userScrolledUp = true;
      // Don't show indicator immediately, only when new messages arrive while scrolled up
    } else {
      this.userScrolledUp = false;
      // Hide indicator if user scrolls back down manually
      this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
    }
  }

  // --- New Indicator Click Handler ---
  private handleNewMessageIndicatorClick = (): void => {
    this.guaranteedScrollToBottom(50, true); // Force scroll
    this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); // Hide after click
  }


  // --- UI Update Methods ---

  private updateInputPlaceholder(modelName: string): void { // No changes needed
    if (this.inputEl) { this.inputEl.placeholder = `Text to ${modelName}...`; }
  }

  private closeMenu(): void { // No changes needed
    if (this.menuDropdown) { this.menuDropdown.style.display = "none"; }
  }

  private autoResizeTextarea(): void { // No changes needed
    this.adjustTextareaHeight();
  }

  private adjustTextareaHeight = (): void => { // No changes needed (CSS handles button pos)
    requestAnimationFrame(() => {
      if (!this.inputEl || !this.buttonsContainer) return;
      const viewHeight = this.contentEl.clientHeight;
      const maxHeight = Math.max(100, viewHeight * 0.50); // Reduced max height slightly
      this.inputEl.style.height = 'auto';
      const scrollHeight = this.inputEl.scrollHeight;
      const newHeight = Math.min(scrollHeight, maxHeight);
      this.inputEl.style.height = `${newHeight}px`;
      this.inputEl.classList.toggle(CSS_CLASS_TEXTAREA_EXPANDED, scrollHeight > maxHeight);
      // Removed buttons low logic, assuming CSS handles it now
    });
  }

  // --- New: Update Send Button Enabled/Disabled State ---
  private updateSendButtonState(): void {
    if (!this.inputEl || !this.sendButton) return;
    const isDisabled = this.inputEl.value.trim() === '' || this.isProcessing;
    this.sendButton.disabled = isDisabled;
    this.sendButton.classList.toggle(CSS_CLASS_DISABLED, isDisabled);
  }


  public showEmptyState(): void { // No changes needed
    if (this.messages.length === 0 && !this.emptyStateEl && this.chatContainer) {
      this.chatContainer.empty();
      this.emptyStateEl = this.chatContainer.createDiv({ cls: CSS_CLASS_EMPTY_STATE });
      this.emptyStateEl.createDiv({ cls: "empty-state-message", text: "No messages yet" });
      this.emptyStateEl.createDiv({
        cls: "empty-state-tip",
        text: `Type a message or use voice input to chat with ${this.plugin.settings.modelName}`
      });
    }
  }

  public hideEmptyState(): void { // No changes needed
    if (this.emptyStateEl) {
      this.emptyStateEl.remove(); this.emptyStateEl = null;
    }
  }

  // --- Message Handling ---

  private async loadAndRenderHistory(): Promise<void> {
    this.lastMessageDate = null; // Reset date before rendering history
    try {
      await this.messageService.loadMessageHistory();
      if (this.messages.length === 0) {
        this.showEmptyState();
      } else {
        this.hideEmptyState();
        // Render all loaded messages (messageService should call renderMessage via internalAddMessage)
        // Re-rendering logic might be needed if messageService doesn't call back for each
        // this.messages.forEach(msg => this.renderMessage(msg)); // Ensure all are rendered if needed
      }
    } catch (error) {
      console.error("Error loading message history:", error);
      new Notice("Failed to load chat history.");
      this.showEmptyState();
    }
  }

  async saveMessageHistory(): Promise<void> { // No changes needed
    if (this.messages.length === 0) {
      // Optionally save an empty array explicitly
      // await this.plugin.saveMessageHistory("[]");
      return;
    }
    try {
      const serializedMessages = this.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
      }));
      const serializedData = JSON.stringify(this.messages.map(msg => ({ role: msg.role, content: msg.content, timestamp: msg.timestamp.toISOString() })));

      console.log(`OllamaView: Preparing to save (${this.messages.length} messages). Data:`, serializedData.substring(0, 200) + "..."); // Логуємо початок даних

      await this.plugin.saveMessageHistory(JSON.stringify(serializedMessages));
    } catch (error) {
      console.error("Error saving message history:", error);
      new Notice("Failed to save chat history.");
    }
  }

  async sendMessage(): Promise<void> {
    const content = this.inputEl.value.trim();
    // Check disabled state again just in case
    if (!content || this.isProcessing || this.sendButton.disabled) return;

    this.setLoadingState(true); // Set processing AND update button state
    this.hideEmptyState();
    const messageContent = this.inputEl.value; // Keep original formatting for display
    this.clearInputField(); // Clears input, triggers input event -> updateSendButtonState

    try {
      this.internalAddMessage("user", messageContent);
      await this.messageService.sendMessage(content);
    } catch (error) {
      console.error("Error sending message:", error);
      new Notice("Failed to send message. Please try again.");
      this.internalAddMessage("assistant", "Error: Could not send message.");
    } finally {
      this.setLoadingState(false); // Reset processing AND update button state
      this.inputEl.focus();
      // adjustTextareaHeight is called by clearInputField via input event
    }
  }

  public internalAddMessage(role: "user" | "assistant", content: string): void {
    const message: Message = {
      role,
      content,
      timestamp: new Date(),
    };
    this.messages.push(message);

    // Pair count logic (no changes needed)
    if (role === "assistant" && this.messages.length >= 2) {
      const prevMessage = this.messages[this.messages.length - 2];
      if (prevMessage && prevMessage.role === "user") { this.messagesPairCount++; }
    }

    this.renderMessage(message); // Render *before* checking scroll indicator
    this.hideEmptyState();
    this.saveMessageHistory();

    // --- Handle "New Messages" Indicator ---
    if (role === "assistant" && this.userScrolledUp && this.newMessagesIndicatorEl) {
      this.newMessagesIndicatorEl.classList.add(CSS_CLASS_VISIBLE);
    } else if (!this.userScrolledUp) {
      // If user isn't scrolled up, ensure we scroll down
      const forceScroll = role === "assistant";
      this.guaranteedScrollToBottom(forceScroll ? 100 : 50, forceScroll);
    }
    // Note: If user *is* scrolled up, we *don't* force scroll here, relying on the indicator.
  }

  // --- Rendering Logic (Modified for Date Separator, Avatar, Animation) ---
  renderMessage(message: Message): void {
    const isUser = message.role === "user";
    const messageIndex = this.messages.indexOf(message);
    if (messageIndex === -1) return;

    const prevMessage = messageIndex > 0 ? this.messages[messageIndex - 1] : null;
    const nextMessage = messageIndex < this.messages.length - 1 ? this.messages[messageIndex + 1] : null;

    const isFirstInGroup = !prevMessage || prevMessage.role !== message.role;
    const isLastInGroup = !nextMessage || nextMessage.role !== message.role;
    const isNewDay = !this.lastMessageDate || !this.isSameDay(this.lastMessageDate, message.timestamp);

    // --- Add Date Separator if it's a new day AND the first message being rendered OR first in its group ---
    if (isNewDay && messageIndex === 0) { // Always add if first message ever and it's a new "session"
      this.renderDateSeparator(message.timestamp);
    } else if (isNewDay && isFirstInGroup) { // Add if first of group on a new day
      this.renderDateSeparator(message.timestamp);
    }
    // Update last message date for next comparison *after* potential separator rendering
    if (isLastInGroup || messageIndex === this.messages.length - 1) { // Update after rendering the last part of a day's messages
      this.lastMessageDate = message.timestamp;
    }


    let messageGroup: HTMLElement;
    const lastGroup = this.chatContainer.lastElementChild as HTMLElement;

    if (isFirstInGroup || !lastGroup || !lastGroup.classList.contains(isUser ? CSS_CLASS_USER_GROUP : CSS_CLASS_OLLAMA_GROUP)) {
      messageGroup = this.chatContainer.createDiv({
        cls: `${CSS_CLASS_MESSAGE_GROUP} ${isUser ? CSS_CLASS_USER_GROUP : CSS_CLASS_OLLAMA_GROUP}`
      });
      // --- Add Avatar to the Group (only once per group) ---
      this.renderAvatar(messageGroup, isUser);
    } else {
      messageGroup = lastGroup;
      // Tails are removed in CSS, no need to remove classes
    }

    const messageEl = messageGroup.createDiv({
      // Add animation class here
      cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_MESSAGE_ARRIVING} ${isUser ? CSS_CLASS_USER_MESSAGE : CSS_CLASS_OLLAMA_MESSAGE}`
      // Removed Bubble classes as they might be redundant with role-specific classes
    });
    // Tails removed in CSS
    // if (isLastInGroup) {
    //   messageEl.classList.add(isUser ? CSS_CLASS_TAIL_USER : CSS_CLASS_TAIL_OLLAMA);
    // }

    const contentContainer = messageEl.createDiv({ cls: CSS_CLASS_CONTENT_CONTAINER });
    const contentEl = contentContainer.createDiv({ cls: CSS_CLASS_CONTENT });

    // --- Content Rendering ---
    if (message.role === "assistant") {
      this.renderAssistantContent(contentEl, message.content);
    } else {
      message.content.split("\n").forEach((line, index, array) => {
        contentEl.appendText(line);
        if (index < array.length - 1) { contentEl.createEl("br"); }
      });
    }

    // --- Copy Button ---
    const copyButton = contentContainer.createEl("button", { cls: CSS_CLASS_COPY_BUTTON, attr: { title: "Copy" } });
    setIcon(copyButton, "copy");
    copyButton.addEventListener("click", () => this.handleCopyClick(message.content, copyButton));

    // --- Timestamp (Render for all messages now, positioned by CSS) ---
    messageEl.createDiv({
      cls: CSS_CLASS_TIMESTAMP,
      text: this.formatTime(message.timestamp),
    });
    // We render timestamp always and rely on CSS to position it (e.g., at the bottom right of the bubble)
  }

  // --- New: Render Date Separator ---
  private renderDateSeparator(date: Date): void {
    if (!this.chatContainer) return;
    this.chatContainer.createDiv({ cls: CSS_CLASS_DATE_SEPARATOR, text: this.formatDateSeparator(date) });
  }

  // --- New: Render Avatar ---
  private renderAvatar(groupEl: HTMLElement, isUser: boolean): void {
    const avatarEl = groupEl.createDiv({ cls: `${CSS_CLASS_AVATAR} ${isUser ? CSS_CLASS_AVATAR_USER : CSS_CLASS_AVATAR_AI}` });
    // Simple text avatar (U/A) - could be replaced with icons or images based on settings
    avatarEl.textContent = isUser ? "U" : "A";
  }


  private renderAssistantContent(containerEl: HTMLElement, content: string): void {
    const decodedContent = this.decodeHtmlEntities(content);
    const hasThinking = this.detectThinkingTags(decodedContent);

    containerEl.empty(); // Clear container before rendering

    if (hasThinking.hasThinkingTags) {
      const processedHtml = this.processThinkingTags(decodedContent);
      containerEl.innerHTML = processedHtml; // Use innerHTML for complex structure
      this.addThinkingToggleListeners(containerEl);
      // Add copy buttons AFTER innerHTML is set
      this.addCodeBlockCopyButtons(containerEl);
    } else {
      // Render regular markdown
      MarkdownRenderer.renderMarkdown(content, containerEl, this.plugin.app.vault.getRoot().path, this);
      // Add copy buttons AFTER markdown is rendered
      this.addCodeBlockCopyButtons(containerEl);
    }
  }

  // --- New: Add Copy Buttons to Code Blocks ---
  private addCodeBlockCopyButtons(contentEl: HTMLElement): void {
    const preElements = contentEl.querySelectorAll("pre");
    preElements.forEach((pre) => {
      // Avoid adding multiple buttons if re-rendered somehow
      if (pre.querySelector(`.${CSS_CLASS_CODE_BLOCK_COPY_BUTTON}`)) return;

      const codeContent = pre.textContent || ""; // Get text content to copy
      const copyBtn = pre.createEl("button", { cls: CSS_CLASS_CODE_BLOCK_COPY_BUTTON });
      setIcon(copyBtn, "copy");
      copyBtn.setAttribute("title", "Copy Code");

      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent triggering other listeners if any
        navigator.clipboard.writeText(codeContent).then(() => {
          setIcon(copyBtn, "check");
          copyBtn.setAttribute("title", "Copied!");
          setTimeout(() => {
            setIcon(copyBtn, "copy");
            copyBtn.setAttribute("title", "Copy Code");
          }, 1500);
        }).catch(err => {
          console.error("Failed to copy code block:", err);
          new Notice("Failed to copy code.");
        });
      });
    });
  }


  private handleCopyClick(content: string, buttonEl: HTMLElement): void { // No changes needed here
    let textToCopy = content;
    if (this.detectThinkingTags(this.decodeHtmlEntities(content)).hasThinkingTags) {
      textToCopy = this.decodeHtmlEntities(content).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }
    navigator.clipboard.writeText(textToCopy).then(() => {
      setIcon(buttonEl, "check");
      buttonEl.setAttribute("title", "Copied!"); // Use attribute for tooltip consistency
      setTimeout(() => {
        setIcon(buttonEl, "copy");
        buttonEl.setAttribute("title", "Copy");
      }, 2000);
    }).catch(err => {
      console.error("Failed to copy text: ", err);
      new Notice("Failed to copy text.");
    });
  }

  private processThinkingTags(content: string): string { // No changes needed here
    const thinkingRegex = /<think>([\s\S]*?)<\/think>/g;
    let lastIndex = 0;
    const parts: string[] = [];
    let match;
    while ((match = thinkingRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(this.markdownToHtml(content.substring(lastIndex, match.index)));
      }
      const thinkingContent = match[1];
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
      lastIndex = thinkingRegex.lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push(this.markdownToHtml(content.substring(lastIndex)));
    }
    return parts.join("");
  }

  private markdownToHtml(markdown: string): string { // No changes needed
    if (!markdown || markdown.trim() === "") return "";
    const tempDiv = document.createElement("div");
    const contextFilePath = this.app.workspace.getActiveFile()?.path ?? "";
    MarkdownRenderer.renderMarkdown(markdown, tempDiv, contextFilePath, this);
    return tempDiv.innerHTML;
  }

  private addThinkingToggleListeners(contentEl: HTMLElement): void { // No changes needed
    const thinkingHeaders = contentEl.querySelectorAll<HTMLElement>(`.${CSS_CLASS_THINKING_HEADER}`);
    thinkingHeaders.forEach((header) => {
      header.addEventListener("click", () => {
        const content = header.nextElementSibling as HTMLElement;
        const toggleIcon = header.querySelector<HTMLElement>(`.${CSS_CLASS_THINKING_TOGGLE}`);
        if (!content || !toggleIcon) return;
        const isFolded = header.getAttribute("data-fold-state") === "folded";
        if (isFolded) {
          content.style.display = "block"; toggleIcon.textContent = "▼"; header.setAttribute("data-fold-state", "expanded");
        } else {
          content.style.display = "none"; toggleIcon.textContent = "►"; header.setAttribute("data-fold-state", "folded");
        }
      });
    });
  }

  private decodeHtmlEntities(text: string): string { // No changes needed
    if (typeof document === 'undefined') return text;
    const textArea = document.createElement("textarea");
    textArea.innerHTML = text;
    return textArea.value;
  }

  private detectThinkingTags(content: string): { hasThinkingTags: boolean; format: string } { // No changes needed
    if (/<think>[\s\S]*?<\/think>/gi.test(content)) { return { hasThinkingTags: true, format: "standard" }; }
    return { hasThinkingTags: false, format: "none" };
  }

  // --- Speech Recognition --- (No changes needed in this section for UI)
  private initSpeechWorker(): void { /* ... same as before ... */
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
  private setupSpeechWorkerHandlers(): void { /* ... same as before ... */
    if (!this.speechWorker) return;

    this.speechWorker.onmessage = (event) => {
      const data = event.data;

      // Check for error object from worker
      if (data && typeof data === 'object' && data.error) {
        console.error("Speech recognition error:", data.message);
        new Notice(`Speech Recognition Error: ${data.message}`);
        this.updateInputPlaceholder(this.plugin.settings.modelName); // Reset placeholder on error
        this.updateSendButtonState(); // Update button state as well
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
      this.updateSendButtonState(); // Update button state after processing
    };

    this.speechWorker.onerror = (error) => {
      console.error("Unhandled worker error:", error);
      new Notice("An unexpected error occurred in the speech recognition worker.");
      this.updateInputPlaceholder(this.plugin.settings.modelName); // Reset placeholder
      // Attempt to gracefully stop recording if it was active
      this.stopVoiceRecording(false); // This also updates placeholder and button state
    };
  }
  private insertTranscript(transcript: string): void { /* ... same as before ... */
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
    this.inputEl.dispatchEvent(new Event('input')); // Trigger resize calculation AND send button update
  }
  private async toggleVoiceRecognition(): Promise<void> { /* ... same as before ... */
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.stopVoiceRecording(true); // Stop and process
    } else {
      await this.startVoiceRecognition(); // Start new recording
    }
  }
  private async startVoiceRecognition(): Promise<void> { /* ... same as before ... */
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

    // Disable send button while recording? Maybe not necessary.

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
      this.mediaRecorder = new MediaRecorder(this.audioStream, recorderOptions);

      const audioChunks: Blob[] = []; // Масив для зберігання шматків аудіо

      // --- Оновлення UI для стану запису ---
      this.voiceButton?.classList.add(CSS_CLASS_RECORDING); // Додати клас для стилізації
      setIcon(this.voiceButton, "stop-circle"); // Змінити іконку на "стоп"
      this.inputEl.placeholder = "Recording... Speak now."; // Оновити плейсхолдер (English for consistency)

      // --- Налаштування слухачів подій MediaRecorder ---
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) { audioChunks.push(event.data); }
      };
      this.mediaRecorder.onstop = () => {
        console.log("MediaRecorder stopped.");
        if (this.speechWorker && audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          console.log(`Sending audio blob to worker: type=${audioBlob.type}, size=${audioBlob.size}`);
          this.inputEl.placeholder = "Processing speech..."; // Update placeholder
          this.speechWorker.postMessage({
            apiKey: this.plugin.settings.googleApiKey,
            audioBlob,
            languageCode: this.plugin.settings.speechLanguage || 'uk-UA'
          });
        } else if (audioChunks.length === 0) {
          console.log("No audio data recorded.");
          this.updateInputPlaceholder(this.plugin.settings.modelName); // Restore placeholder if nothing was recorded
          this.updateSendButtonState(); // Ensure button state is correct
        }
      };
      this.mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder Error:", event);
        new Notice("An error occurred during recording.");
        this.stopVoiceRecording(false); // Stop without processing on error
      };

      // --- Старт запису ---
      this.mediaRecorder.start();
      console.log("Recording started. MimeType:", this.mediaRecorder?.mimeType ?? 'default');

    } catch (error) {
      console.error("Error accessing microphone or starting recording:", error);
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        new Notice("Microphone access denied. Please grant permission.");
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        new Notice("Microphone not found. Please ensure it's connected and enabled.");
      } else {
        new Notice("Could not start voice recording.");
      }
      this.stopVoiceRecording(false); // Ensure cleanup even if start failed
    }
  }
  private stopVoiceRecording(processAudio: boolean): void { /* ... same as before ... */
    console.log(`Stopping voice recording. Process audio: ${processAudio}`);
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      // onstop handler will be triggered eventually to process if processAudio is true
      this.mediaRecorder.stop();
    } else if (!processAudio && this.mediaRecorder?.state === 'inactive') {
      // If already stopped and asked not to process, just clean up UI/stream
    }

    // UI Cleanup & Resource Release
    this.voiceButton?.classList.remove(CSS_CLASS_RECORDING);
    setIcon(this.voiceButton, "microphone");
    this.updateInputPlaceholder(this.plugin.settings.modelName);
    this.updateSendButtonState(); // Update button state

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
      console.log("Audio stream tracks stopped.");
    }
    this.mediaRecorder = null;
  }

  // --- Helpers & Utilities ---

  public getChatContainer(): HTMLElement { return this.chatContainer; }

  public clearChatContainer(): void { // Modified to reset date tracking
    this.messages = [];
    this.messagesPairCount = 0;
    this.lastMessageDate = null; // Reset last date
    if (this.chatContainer) {
      this.chatContainer.empty();
    }
    this.showEmptyState();
    this.saveMessageHistory(); // Save the empty state
    this.updateSendButtonState(); // Update button state as input is now effectively empty
  }

  public addLoadingIndicator(): HTMLElement { // No significant changes needed
    this.hideEmptyState();
    const messageGroup = this.chatContainer.createDiv({ cls: `${CSS_CLASS_MESSAGE_GROUP} ${CSS_CLASS_OLLAMA_GROUP}` });
    // Add AI Avatar to loading group
    this.renderAvatar(messageGroup, false); // 'false' for AI avatar
    const messageEl = messageGroup.createDiv({ cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_OLLAMA_MESSAGE}` /* Removed tail */ });
    const dotsContainer = messageEl.createDiv({ cls: CSS_CLASS_THINKING_DOTS });
    for (let i = 0; i < 3; i++) { dotsContainer.createDiv({ cls: CSS_CLASS_THINKING_DOT }); }
    this.guaranteedScrollToBottom(50, true);
    return messageGroup;
  }

  public removeLoadingIndicator(loadingEl: HTMLElement | null): void { // No changes needed
    if (loadingEl && loadingEl.parentNode) { loadingEl.remove(); }
  }

  public scrollToBottom(): void { this.guaranteedScrollToBottom(50, true); } // Default to force scroll

  public clearInputField(): void { // No changes needed
    if (this.inputEl) {
      this.inputEl.value = "";
      this.inputEl.dispatchEvent(new Event('input')); // Triggers resize and button state update
    }
  }

  // Element creation helpers (no changes needed)
  public createGroupElement(className: string): HTMLElement { return this.chatContainer.createDiv({ cls: className }); }
  public createMessageElement(parent: HTMLElement, className: string): HTMLElement { return parent.createDiv({ cls: className }); }
  public createContentContainer(parent: HTMLElement): HTMLElement { return parent.createDiv({ cls: CSS_CLASS_CONTENT_CONTAINER }); }
  public createContentElement(parent: HTMLElement): HTMLElement { return parent.createDiv({ cls: CSS_CLASS_CONTENT }); }

  // Guaranteed Scroll (already modified)
  guaranteedScrollToBottom(delay = 50, forceScroll = false): void {
    if (this.scrollTimeout) { clearTimeout(this.scrollTimeout); }
    this.scrollTimeout = setTimeout(() => {
      requestAnimationFrame(() => {
        if (this.chatContainer) {
          const scrollThreshold = 100;
          const isScrolledUpCheck = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight > scrollThreshold;
          // Update internal state if check differs from current state
          if (isScrolledUpCheck !== this.userScrolledUp) {
            this.userScrolledUp = isScrolledUpCheck;
            if (!this.userScrolledUp) {
              // Hide indicator immediately if scrolled back to bottom
              this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
            }
          }

          if (forceScroll || !this.userScrolledUp || this.isProcessing) {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
            // If we forced a scroll, user is no longer considered "scrolled up"
            if (forceScroll || this.isProcessing) {
              this.userScrolledUp = false;
              this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
            }
          }
        }
      });
    }, delay);
  }

  // Time formatting (No changes needed)
  formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  // --- New Helper: Format Date Separator ---
  formatDateSeparator(date: Date): string {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (this.isSameDay(date, now)) {
      return "Today";
    } else if (this.isSameDay(date, yesterday)) {
      return "Yesterday";
    } else {
      // Use a locale-aware format for older dates
      return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      // Or a shorter format:
      // return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric'});
    }
  }

  // --- New Helper: Check if two dates are on the same day ---
  isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate();
  }

  // --- Update Loading State (Modified for button state) ---
  public setLoadingState(isLoading: boolean): void {
    this.isProcessing = isLoading;
    // Disable input field while processing
    if (this.inputEl) this.inputEl.disabled = isLoading;
    // Update send button state (will be disabled if isLoading is true)
    this.updateSendButtonState();
    // Optionally disable other buttons too
    if (this.voiceButton) this.voiceButton.disabled = isLoading;
    if (this.menuButton) this.menuButton.disabled = isLoading;
    if (this.voiceButton) this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading);
    if (this.menuButton) this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading);

  }

}