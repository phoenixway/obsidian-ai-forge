import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  MarkdownRenderer,
  Notice,
  debounce,
  requireApiVersion,
  Menu // Використовується для типізації, хоча меню кастомне
} from "obsidian";
import OllamaPlugin from "./main";
import { AvatarType } from "./settings"; // Імпортуємо тип для аватара

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
const CSS_CLASS_SYSTEM_GROUP = "system-message-group";
const CSS_CLASS_ERROR_GROUP = "error-message-group";
const CSS_CLASS_MESSAGE = "message";
const CSS_CLASS_USER_MESSAGE = "user-message";
const CSS_CLASS_OLLAMA_MESSAGE = "ollama-message";
const CSS_CLASS_SYSTEM_MESSAGE = "system-message";
const CSS_CLASS_ERROR_MESSAGE = "error-message";
const CSS_CLASS_SYSTEM_ICON = "system-icon";
const CSS_CLASS_ERROR_ICON = "error-icon";
const CSS_CLASS_SYSTEM_TEXT = "system-message-text";
const CSS_CLASS_ERROR_TEXT = "error-message-text";
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
const CSS_CLASS_RECORDING = "recording";
const CSS_CLASS_DISABLED = "disabled";
const CSS_CLASS_MESSAGE_ARRIVING = "message-arriving";
const CSS_CLASS_DATE_SEPARATOR = "chat-date-separator";
const CSS_CLASS_AVATAR = "message-group-avatar";
const CSS_CLASS_AVATAR_USER = "user-avatar";
const CSS_CLASS_AVATAR_AI = "ai-avatar";
const CSS_CLASS_CODE_BLOCK_COPY_BUTTON = "code-block-copy-button";
const CSS_CLASS_CODE_BLOCK_LANGUAGE = "code-block-language";
const CSS_CLASS_NEW_MESSAGE_INDICATOR = "new-message-indicator";
const CSS_CLASS_VISIBLE = "visible";
const CSS_CLASS_MENU_SEPARATOR = "menu-separator";
const CSS_CLASS_CLEAR_CHAT_OPTION = "clear-chat-option";
const CSS_CLASS_CONTENT_COLLAPSIBLE = "message-content-collapsible";
const CSS_CLASS_CONTENT_COLLAPSED = "message-content-collapsed";
const CSS_CLASS_SHOW_MORE_BUTTON = "show-more-button";
const CSS_CLASS_MODEL_OPTION = "model-option";
const CSS_CLASS_MODEL_LIST_CONTAINER = "model-list-container";
const CSS_CLASS_MENU_HEADER = "menu-header";

// Типи ролей та повідомлень
export type MessageRole = "user" | "assistant" | "system" | "error";
export interface Message {
  role: MessageRole;
  content: string;
  timestamp: Date;
}
interface AddMessageOptions {
  saveHistory?: boolean;
  timestamp?: Date | string;
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
  private modelListContainerEl!: HTMLElement; // Контейнер для списку моделей
  private clearChatOption!: HTMLElement;
  private settingsOption!: HTMLElement;
  private buttonsContainer!: HTMLElement;

  private messages: Message[] = [];
  private isProcessing: boolean = false;
  private scrollTimeout: NodeJS.Timeout | null = null;
  static instance: OllamaView | null = null;

  // Speech Recognition related (Placeholders)
  private speechWorker: Worker | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;

  // State
  private messagesPairCount: number = 0;
  private emptyStateEl: HTMLElement | null = null;
  private resizeTimeout: NodeJS.Timeout | null = null;
  private scrollListenerDebounced: () => void;
  private lastMessageDate: Date | null = null;
  private newMessagesIndicatorEl: HTMLElement | null = null;
  private userScrolledUp: boolean = false;

  // Debounced save function
  private debouncedSaveMessageHistory = debounce(this.saveMessageHistory, 300, true);


  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin; // Store plugin reference

    // Singleton Logic
    if (OllamaView.instance && OllamaView.instance !== this) {
      console.warn("Replacing existing OllamaView instance.");
      // Optionally close the previous instance:
      // OllamaView.instance.leaf.detach();
    }
    OllamaView.instance = this;

    // Check Obsidian API version
    if (!requireApiVersion || !requireApiVersion("1.0.0")) {
      console.warn("Ollama Plugin: Current Obsidian API version might be outdated. Some features may not work correctly.");
    }

    this.initSpeechWorker(); // Placeholder
    this.scrollListenerDebounced = debounce(this.handleScroll, 150, true);
  }

  // --- Getters ---
  public getMessagesCount(): number { return this.messages.length; }
  public getMessagesPairCount(): number { return this.messagesPairCount; }
  public getMessages(): Message[] { return [...this.messages]; } // Return a copy

  // --- Obsidian View Methods ---
  getViewType(): string { return VIEW_TYPE_OLLAMA; }
  getDisplayText(): string { return "Ollama Chat"; }
  getIcon(): string { return "message-square"; } // Or choose another icon

  async onOpen(): Promise<void> {
    this.createUIElements(); // Creates elements, including model list container
    this.updateInputPlaceholder(this.plugin.settings.modelName);
    this.attachEventListeners();
    this.autoResizeTextarea();
    this.updateSendButtonState();
    this.lastMessageDate = null;

    // Load history AND initial model list
    await Promise.all([
      this.loadAndRenderHistory(),
      this.renderModelList() // Render model list on open
    ]);

    // Focus input AFTER loading and potential scrolling
    this.inputEl?.focus();
    this.inputEl?.dispatchEvent(new Event('input')); // Trigger initial size calculation
  }

  async onClose(): Promise<void> {
    console.log("OllamaView onClose: Cleaning up resources.");
    if (this.speechWorker) { this.speechWorker.terminate(); this.speechWorker = null; }
    this.stopVoiceRecording(false); // Placeholder
    if (this.audioStream) { this.audioStream.getTracks().forEach(track => track.stop()); this.audioStream = null; }
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    if (OllamaView.instance === this) { OllamaView.instance = null; }
  }

  // --- UI Creation ---
  private createUIElements(): void {
    this.contentEl.empty();
    this.chatContainerEl = this.contentEl.createDiv({ cls: CSS_CLASS_CONTAINER });
    this.chatContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_CHAT_CONTAINER });

    // New Message Indicator
    this.newMessagesIndicatorEl = this.chatContainerEl.createDiv({ cls: CSS_CLASS_NEW_MESSAGE_INDICATOR });
    const indicatorIcon = this.newMessagesIndicatorEl.createSpan({ cls: "indicator-icon" });
    setIcon(indicatorIcon, "arrow-down");
    this.newMessagesIndicatorEl.createSpan({ text: " New Messages" });

    // Input Area
    const inputContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER });
    this.inputEl = inputContainer.createEl("textarea", { attr: { placeholder: `Text to ${this.plugin.settings.modelName}...`, rows: 1 } });
    this.buttonsContainer = inputContainer.createDiv({ cls: CSS_CLASS_BUTTONS_CONTAINER });
    this.sendButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_SEND_BUTTON, attr: { 'aria-label': 'Send' } });
    setIcon(this.sendButton, "send");
    this.voiceButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_VOICE_BUTTON, attr: { 'aria-label': 'Voice Input' } });
    setIcon(this.voiceButton, "mic");
    this.menuButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_MENU_BUTTON, attr: { 'aria-label': 'Menu' } });
    setIcon(this.menuButton, "more-vertical");

    // Menu Dropdown Structure
    this.menuDropdown = inputContainer.createEl("div", { cls: CSS_CLASS_MENU_DROPDOWN });
    this.menuDropdown.style.display = "none"; // Initially hidden

    // Model Selection Section
    this.menuDropdown.createEl("div", { text: "Select Model", cls: CSS_CLASS_MENU_HEADER });
    this.modelListContainerEl = this.menuDropdown.createDiv({ cls: CSS_CLASS_MODEL_LIST_CONTAINER }); // Container for model list
    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR }); // Separator after model list

    // Clear Chat Option
    this.clearChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLEAR_CHAT_OPTION}` });
    const clearIcon = this.clearChatOption.createEl("span", { cls: "menu-option-icon" });
    setIcon(clearIcon, "trash-2");
    this.clearChatOption.createEl("span", { cls: "menu-option-text", text: "Clear Chat" });

    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR }); // Another separator

    // Settings Option
    this.settingsOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_SETTINGS_OPTION}` });
    const settingsIcon = this.settingsOption.createEl("span", { cls: "menu-option-icon" });
    setIcon(settingsIcon, "settings");
    this.settingsOption.createEl("span", { cls: "menu-option-text", text: "Settings" });
  }

  // --- Event Listeners ---
  private attachEventListeners(): void {
    this.inputEl.addEventListener("keydown", this.handleKeyDown);
    this.inputEl.addEventListener('input', this.handleInputForResize);
    this.sendButton.addEventListener("click", this.handleSendClick);
    this.voiceButton.addEventListener("click", this.handleVoiceClick); // Placeholder call
    this.menuButton.addEventListener("click", this.handleMenuClick);
    this.settingsOption.addEventListener("click", this.handleSettingsClick);
    this.clearChatOption.addEventListener("click", this.handleClearChatClick); // No confirm dialog
    this.registerDomEvent(window, 'resize', this.handleWindowResize);
    this.registerEvent(this.app.workspace.on('resize', this.handleWindowResize));
    this.registerDomEvent(document, 'click', this.handleDocumentClickForMenu);
    this.register(this.plugin.on('model-changed', this.handleModelChange)); // Listener for model changes
    this.registerDomEvent(document, 'visibilitychange', this.handleVisibilityChange);
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange));
    this.registerDomEvent(this.chatContainer, 'scroll', this.scrollListenerDebounced);
    if (this.newMessagesIndicatorEl) {
      this.registerDomEvent(this.newMessagesIndicatorEl, 'click', this.handleNewMessageIndicatorClick);
    }
  }

  // --- Event Handlers ---
  private handleKeyDown = (e: KeyboardEvent): void => { if (e.key === "Enter" && !e.shiftKey && !this.isProcessing && !this.sendButton.disabled) { e.preventDefault(); this.sendMessage(); } }
  private handleSendClick = (): void => { if (!this.isProcessing && !this.sendButton.disabled) { this.sendMessage(); } }
  private handleVoiceClick = (): void => { this.toggleVoiceRecognition(); } // Placeholder call
  private handleMenuClick = (e: MouseEvent): void => {
    e.stopPropagation();
    const isHidden = this.menuDropdown.style.display === "none";
    if (isHidden) {
      // Update model list BEFORE showing menu
      this.renderModelList(); // Async, but we don't await it here
      this.menuDropdown.style.display = "block";
      this.menuDropdown.style.animation = 'menu-fade-in 0.15s ease-out';
    } else {
      this.menuDropdown.style.display = "none";
    }
  }
  private handleSettingsClick = async (): Promise<void> => { this.closeMenu(); const setting = (this.app as any).setting; if (setting) { await setting.open(); setting.openTabById("ollama-chat-plugin"); } else { new Notice("Could not open settings."); } }
  private handleClearChatClick = (): void => {
    this.closeMenu();
    // No confirm dialog per user request
    this.plugin.clearMessageHistory();
  }
  private handleDocumentClickForMenu = (e: MouseEvent): void => { if (this.menuDropdown.style.display === 'block' && !this.menuButton.contains(e.target as Node) && !this.menuDropdown.contains(e.target as Node)) { this.closeMenu(); } }
  private handleModelChange = (modelName: string): void => { this.updateInputPlaceholder(modelName); if (this.messages.length > 0) { this.plugin.messageService.addSystemMessage(`Model changed to: ${modelName}`); } }
  private handleVisibilityChange = (): void => { if (document.visibilityState === 'visible' && this.leaf.view === this) { requestAnimationFrame(() => { this.guaranteedScrollToBottom(50, true); this.adjustTextareaHeight(); }); } }
  private handleActiveLeafChange = (leaf: WorkspaceLeaf | null): void => {
    if (leaf?.view === this) {
      console.log("[OllamaView] View became active.");
      this.inputEl?.focus(); // Focus input immediately
      // Force scroll down after a short delay
      setTimeout(() => this.guaranteedScrollToBottom(150, true), 100);
    }
  }
  private handleInputForResize = (): void => { if (this.resizeTimeout) clearTimeout(this.resizeTimeout); this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 50); this.updateSendButtonState(); };
  private handleWindowResize = (): void => { if (this.resizeTimeout) clearTimeout(this.resizeTimeout); this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 100); };
  private handleScroll = (): void => { if (!this.chatContainer) return; const t = 150; const bottom = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight < t; if (!bottom) this.userScrolledUp = true; else { this.userScrolledUp = false; this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } }
  private handleNewMessageIndicatorClick = (): void => { this.guaranteedScrollToBottom(50, true); this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); }


  // --- UI Update Methods ---
  private updateInputPlaceholder(modelName: string): void { if (this.inputEl) { this.inputEl.placeholder = `Text to ${modelName}...`; } }
  private closeMenu(): void { if (this.menuDropdown) { this.menuDropdown.style.display = "none"; } }
  private autoResizeTextarea(): void { this.adjustTextareaHeight(); }
  private adjustTextareaHeight = (): void => { requestAnimationFrame(() => { if (!this.inputEl || !this.buttonsContainer) return; const vh = this.contentEl.clientHeight; const mh = Math.max(100, vh * 0.50); this.inputEl.style.height = 'auto'; const sh = this.inputEl.scrollHeight; const nh = Math.min(sh, mh); this.inputEl.style.height = `${nh}px`; this.inputEl.classList.toggle(CSS_CLASS_TEXTAREA_EXPANDED, sh > mh); }); }
  private updateSendButtonState(): void { if (!this.inputEl || !this.sendButton) return; const d = this.inputEl.value.trim() === '' || this.isProcessing; this.sendButton.disabled = d; this.sendButton.classList.toggle(CSS_CLASS_DISABLED, d); }
  public showEmptyState(): void { if (this.messages.length === 0 && !this.emptyStateEl && this.chatContainer) { this.chatContainer.empty(); this.emptyStateEl = this.chatContainer.createDiv({ cls: CSS_CLASS_EMPTY_STATE }); this.emptyStateEl.createDiv({ cls: "empty-state-message", text: "No messages yet" }); this.emptyStateEl.createDiv({ cls: "empty-state-tip", text: `Type a message or use voice input to chat with ${this.plugin.settings.modelName}` }); } }
  public hideEmptyState(): void { if (this.emptyStateEl) { this.emptyStateEl.remove(); this.emptyStateEl = null; } }


  // --- Message Handling ---
  private async loadAndRenderHistory(): Promise<void> {
    this.lastMessageDate = null;
    this.clearChatContainerInternal();
    try {
      console.log("[OllamaView] Starting history loading...");
      await this.plugin.messageService.loadMessageHistory(); // Service calls internalAddMessage

      if (this.messages.length === 0) {
        this.showEmptyState();
        console.log("[OllamaView] History loaded, state is empty.");
      } else {
        this.hideEmptyState();
        console.log(`[OllamaView] History loaded (${this.messages.length} messages). Checking collapsing...`);
        this.checkAllMessagesForCollapsing(); // Check collapsing after rendering history

        // Delay scrolling slightly after initiating collapse checks
        setTimeout(() => {
          console.log("[OllamaView] Attempting scroll after collapse check initiation.");
          this.guaranteedScrollToBottom(200, true); // Use longer internal delay + force
        }, 150); // Delay before calling scroll
      }
    } catch (error) {
      console.error("OllamaView: Error during history loading process:", error);
      this.clearChatContainerInternal();
      this.showEmptyState();
    }
  }

  async saveMessageHistory(): Promise<void> {
    if (!this.plugin.settings.saveMessageHistory) return;
    const messagesToSave = this.messages.map(msg => ({ role: msg.role, content: msg.content, timestamp: msg.timestamp.toISOString() }));
    const dataToSave = JSON.stringify(messagesToSave);
    try { await this.plugin.saveMessageHistory(dataToSave); }
    catch (error) { console.error("OllamaView: Error saving history:", error); new Notice("Failed to save chat history."); }
  }

  async sendMessage(): Promise<void> {
    const content = this.inputEl.value.trim();
    if (!content || this.isProcessing || this.sendButton.disabled) return;
    const messageContent = this.inputEl.value;
    this.clearInputField();
    this.setLoadingState(true);
    this.hideEmptyState();
    this.internalAddMessage("user", messageContent); // Add user message immediately
    try { await this.plugin.messageService.sendMessage(content); }
    catch (error: any) { console.error("OllamaView: Error sending message:", error); this.internalAddMessage("error", `Failed to send: ${error.message || 'Unknown error'}`); this.setLoadingState(false); }
  }

  public internalAddMessage(role: MessageRole, content: string, options: AddMessageOptions = {}): void {
    const { saveHistory = true, timestamp } = options;
    let messageTimestamp: Date;
    if (timestamp) { try { messageTimestamp = typeof timestamp === 'string' ? new Date(timestamp) : timestamp; if (isNaN(messageTimestamp.getTime())) throw new Error("Invalid Date"); } catch (e) { console.warn("Invalid timestamp, using current:", timestamp, e); messageTimestamp = new Date(); } }
    else { messageTimestamp = new Date(); }
    const message: Message = { role, content, timestamp: messageTimestamp };
    this.messages.push(message);
    if (role === "assistant" && this.messages.length >= 2) { const prev = this.messages[this.messages.length - 2]; if (prev?.role === "user") this.messagesPairCount++; }
    const messageEl = this.renderMessage(message); // Get the rendered message element
    this.hideEmptyState();
    if (messageEl) { this.checkMessageForCollapsing(messageEl); } // Check height after rendering
    if (saveHistory && this.plugin.settings.saveMessageHistory) { this.debouncedSaveMessageHistory(); }
    if (role !== "user" && this.userScrolledUp && this.newMessagesIndicatorEl) { this.newMessagesIndicatorEl.classList.add(CSS_CLASS_VISIBLE); }
    else if (!this.userScrolledUp) { const forceScroll = role !== "user"; this.guaranteedScrollToBottom(forceScroll ? 100 : 50, forceScroll); }
  }

  // --- Rendering Logic ---
  renderMessage(message: Message): HTMLElement | null {
    const messageIndex = this.messages.indexOf(message); if (messageIndex === -1) return null;
    const prevMessage = messageIndex > 0 ? this.messages[messageIndex - 1] : null;
    const isNewDay = !this.lastMessageDate || !this.isSameDay(this.lastMessageDate, message.timestamp);
    if (isNewDay) { this.renderDateSeparator(message.timestamp); this.lastMessageDate = message.timestamp; }
    else if (messageIndex === 0) { this.lastMessageDate = message.timestamp; } // Set for the very first message
    let messageGroup: HTMLElement | null = null; let groupClass = CSS_CLASS_MESSAGE_GROUP; let messageClass = `${CSS_CLASS_MESSAGE} ${CSS_CLASS_MESSAGE_ARRIVING}`; let showAvatar = false; let isUser = false;
    const isFirstInGroup = !prevMessage || prevMessage.role !== message.role || isNewDay;
    switch (message.role) { case "user": groupClass += ` ${CSS_CLASS_USER_GROUP}`; messageClass += ` ${CSS_CLASS_USER_MESSAGE}`; showAvatar = true; isUser = true; break; case "assistant": groupClass += ` ${CSS_CLASS_OLLAMA_GROUP}`; messageClass += ` ${CSS_CLASS_OLLAMA_MESSAGE}`; showAvatar = true; break; case "system": groupClass += ` ${CSS_CLASS_SYSTEM_GROUP}`; messageClass += ` ${CSS_CLASS_SYSTEM_MESSAGE}`; break; case "error": groupClass += ` ${CSS_CLASS_ERROR_GROUP}`; messageClass += ` ${CSS_CLASS_ERROR_MESSAGE}`; break; }
    const lastElement = this.chatContainer.lastElementChild as HTMLElement;
    if (isFirstInGroup || !lastElement || !lastElement.matches(`.${groupClass.split(' ')[1]}`)) { messageGroup = this.chatContainer.createDiv({ cls: groupClass }); if (showAvatar) { this.renderAvatar(messageGroup, isUser); } }
    else { messageGroup = lastElement; }
    const messageEl = messageGroup.createDiv({ cls: messageClass }); const contentContainer = messageEl.createDiv({ cls: CSS_CLASS_CONTENT_CONTAINER }); const contentEl = contentContainer.createDiv({ cls: CSS_CLASS_CONTENT });
    switch (message.role) {
      case "assistant": case "user": contentEl.addClass(CSS_CLASS_CONTENT_COLLAPSIBLE); if (message.role === 'assistant') { this.renderAssistantContent(contentEl, message.content); } else { message.content.split("\n").forEach((line, i, arr) => { contentEl.appendText(line); if (i < arr.length - 1) contentEl.createEl("br"); }); } break;
      case "system": setIcon(contentEl.createSpan({ cls: CSS_CLASS_SYSTEM_ICON }), "info"); contentEl.createSpan({ cls: CSS_CLASS_SYSTEM_TEXT, text: message.content }); break;
      case "error": setIcon(contentEl.createSpan({ cls: CSS_CLASS_ERROR_ICON }), "alert-triangle"); contentEl.createSpan({ cls: CSS_CLASS_ERROR_TEXT, text: message.content }); break;
    }
    if (message.role !== "system") { const copyBtn = contentContainer.createEl("button", { cls: CSS_CLASS_COPY_BUTTON, attr: { title: "Copy" } }); setIcon(copyBtn, "copy"); copyBtn.addEventListener("click", () => this.handleCopyClick(message.content, copyBtn)); }
    messageEl.createDiv({ cls: CSS_CLASS_TIMESTAMP, text: this.formatTime(message.timestamp) });
    setTimeout(() => messageEl.classList.remove(CSS_CLASS_MESSAGE_ARRIVING), 500);
    return messageEl; // Return the created message element
  }

  private renderAvatar(groupEl: HTMLElement, isUser: boolean): void {
    const settings = this.plugin.settings; const type = isUser ? settings.userAvatarType : settings.aiAvatarType; const content = isUser ? settings.userAvatarContent : settings.aiAvatarContent; const cls = isUser ? CSS_CLASS_AVATAR_USER : CSS_CLASS_AVATAR_AI;
    const avatarEl = groupEl.createDiv({ cls: `${CSS_CLASS_AVATAR} ${cls}` });
    if (type === 'initials') { avatarEl.textContent = content || (isUser ? 'U' : 'A'); }
    else if (type === 'icon') { try { setIcon(avatarEl, content || (isUser ? 'user' : 'bot')); } catch (e) { console.warn(`Failed to set icon "${content}", using default.`, e); avatarEl.textContent = isUser ? 'U' : 'A'; } }
    else { avatarEl.textContent = isUser ? 'U' : 'A'; }
  }

  private renderDateSeparator(date: Date): void { if (!this.chatContainer) return; this.chatContainer.createDiv({ cls: CSS_CLASS_DATE_SEPARATOR, text: this.formatDateSeparator(date) }); }

  private renderAssistantContent(containerEl: HTMLElement, content: string): void {
    const decoded = this.decodeHtmlEntities(content); const thinking = this.detectThinkingTags(decoded); containerEl.empty();
    if (thinking.hasThinkingTags) { const html = this.processThinkingTags(decoded); containerEl.innerHTML = html; this.addThinkingToggleListeners(containerEl); this.addCodeBlockEnhancements(containerEl); }
    else { MarkdownRenderer.renderMarkdown(content, containerEl, this.plugin.app.vault.getRoot()?.path ?? "", this); this.addCodeBlockEnhancements(containerEl); }
  }

  private addCodeBlockEnhancements(contentEl: HTMLElement): void {
    const pres = contentEl.querySelectorAll("pre"); pres.forEach(pre => { if (pre.querySelector(`.${CSS_CLASS_CODE_BLOCK_COPY_BUTTON}`)) return; const code = pre.querySelector("code"); if (!code) return; const text = code.textContent || ""; const langClass = Array.from(code.classList).find(c => c.startsWith("language-")); if (langClass) { const lang = langClass.replace("language-", ""); if (lang) pre.createEl("span", { cls: CSS_CLASS_CODE_BLOCK_LANGUAGE, text: lang }); } const btn = pre.createEl("button", { cls: CSS_CLASS_CODE_BLOCK_COPY_BUTTON }); setIcon(btn, "copy"); btn.setAttribute("title", "Copy Code"); btn.addEventListener("click", e => { e.stopPropagation(); navigator.clipboard.writeText(text).then(() => { setIcon(btn, "check"); btn.setAttribute("title", "Copied!"); setTimeout(() => { setIcon(btn, "copy"); btn.setAttribute("title", "Copy Code"); }, 1500); }).catch(err => { console.error("Copy failed:", err); new Notice("Failed to copy code."); }); }); });
  }

  // --- Methods for handling long messages ---
  private checkMessageForCollapsing(messageEl: HTMLElement): void {
    const contentEl = messageEl.querySelector<HTMLElement>(`.${CSS_CLASS_CONTENT_COLLAPSIBLE}`);
    const maxHeight = this.plugin.settings.maxMessageHeight;
    if (!contentEl || maxHeight <= 0) return;
    requestAnimationFrame(() => {
      const btn = messageEl.querySelector(`.${CSS_CLASS_SHOW_MORE_BUTTON}`); btn?.remove();
      contentEl.style.maxHeight = ''; contentEl.classList.remove(CSS_CLASS_CONTENT_COLLAPSED);
      const h = contentEl.scrollHeight;
      if (h > maxHeight) {
        contentEl.style.maxHeight = `${maxHeight}px`; contentEl.classList.add(CSS_CLASS_CONTENT_COLLAPSED);
        const showMoreBtn = messageEl.createEl('button', { cls: CSS_CLASS_SHOW_MORE_BUTTON, text: 'Show More ▼' });
        this.registerDomEvent(showMoreBtn, 'click', () => this.toggleMessageCollapse(contentEl, showMoreBtn));
      }
    });
  }

  private checkAllMessagesForCollapsing(): void {
    this.chatContainer?.querySelectorAll<HTMLElement>(`.${CSS_CLASS_MESSAGE}`).forEach(msgEl => {
      this.checkMessageForCollapsing(msgEl);
    });
  }

  private toggleMessageCollapse(contentEl: HTMLElement, buttonEl: HTMLButtonElement): void {
    const isCollapsed = contentEl.classList.contains(CSS_CLASS_CONTENT_COLLAPSED);
    if (isCollapsed) { contentEl.style.maxHeight = ''; contentEl.classList.remove(CSS_CLASS_CONTENT_COLLAPSED); buttonEl.setText('Show Less ▲'); }
    else { const maxHeight = this.plugin.settings.maxMessageHeight; contentEl.style.maxHeight = `${maxHeight}px`; contentEl.classList.add(CSS_CLASS_CONTENT_COLLAPSED); buttonEl.setText('Show More ▼'); }
  }

  // --- Other Rendering Helpers ---
  private handleCopyClick(content: string, buttonEl: HTMLElement): void { let t = content; if (this.detectThinkingTags(this.decodeHtmlEntities(content)).hasThinkingTags) { t = this.decodeHtmlEntities(content).replace(/<think>[\s\S]*?<\/think>/g, "").trim(); } navigator.clipboard.writeText(t).then(() => { setIcon(buttonEl, "check"); buttonEl.setAttribute("title", "Copied!"); setTimeout(() => { setIcon(buttonEl, "copy"); buttonEl.setAttribute("title", "Copy"); }, 2000); }).catch(err => { console.error("Copy failed:", err); new Notice("Failed to copy."); }); }
  private processThinkingTags(content: string): string { const r = /<think>([\s\S]*?)<\/think>/g; let i = 0; const p: string[] = []; let m; while ((m = r.exec(content)) !== null) { if (m.index > i) p.push(this.markdownToHtml(content.substring(i, m.index))); const c = m[1]; const h = `<div class="${CSS_CLASS_THINKING_BLOCK}"><div class="${CSS_CLASS_THINKING_HEADER}" data-fold-state="folded"><div class="${CSS_CLASS_THINKING_TOGGLE}">►</div><div class="${CSS_CLASS_THINKING_TITLE}">Thinking</div></div><div class="${CSS_CLASS_THINKING_CONTENT}" style="display: none;">${this.markdownToHtml(c)}</div></div>`; p.push(h); i = r.lastIndex; } if (i < content.length) p.push(this.markdownToHtml(content.substring(i))); return p.join(""); }
  private markdownToHtml(markdown: string): string { if (!markdown?.trim()) return ""; const d = document.createElement("div"); MarkdownRenderer.renderMarkdown(markdown, d, this.app.workspace.getActiveFile()?.path ?? "", this); return d.innerHTML; }
  private addThinkingToggleListeners(contentEl: HTMLElement): void { const h = contentEl.querySelectorAll<HTMLElement>(`.${CSS_CLASS_THINKING_HEADER}`); h.forEach(hdr => { hdr.addEventListener("click", () => { const c = hdr.nextElementSibling as HTMLElement; const t = hdr.querySelector<HTMLElement>(`.${CSS_CLASS_THINKING_TOGGLE}`); if (!c || !t) return; const f = hdr.getAttribute("data-fold-state") === "folded"; if (f) { c.style.display = "block"; t.textContent = "▼"; hdr.setAttribute("data-fold-state", "expanded"); } else { c.style.display = "none"; t.textContent = "►"; hdr.setAttribute("data-fold-state", "folded"); } }); }); }
  private decodeHtmlEntities(text: string): string { if (typeof document === 'undefined') return text; const ta = document.createElement("textarea"); ta.innerHTML = text; return ta.value; }
  private detectThinkingTags(content: string): { hasThinkingTags: boolean; format: string } { return /<think>[\s\S]*?<\/think>/gi.test(content) ? { hasThinkingTags: true, format: "standard" } : { hasThinkingTags: false, format: "none" }; }


  // --- NEW METHOD: Renders the model list in the menu ---
  private async renderModelList(): Promise<void> {
    if (!this.modelListContainerEl) return; // Guard clause

    this.modelListContainerEl.empty(); // Clear previous list
    const loadingEl = this.modelListContainerEl.createEl("span", { text: "Loading models..." }); // Show loading state

    try {
      const models = await this.plugin.apiService.getModels();
      const currentModel = this.plugin.settings.modelName;
      this.modelListContainerEl.empty(); // Clear "Loading..."

      if (models.length === 0) {
        this.modelListContainerEl.createEl("span", { text: "No models available." }); // Show empty state
        return;
      }

      // Sort models alphabetically for consistency
      models.sort();

      models.forEach(modelName => {
        const modelOptionEl = this.modelListContainerEl.createDiv({
          cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MODEL_OPTION}`
        });
        const iconSpan = modelOptionEl.createEl("span", { cls: "menu-option-icon" });

        // Add checkmark for the currently selected model
        if (modelName === currentModel) {
          setIcon(iconSpan, "check");
          modelOptionEl.addClass("is-selected");
        } else {
          // Add a placeholder or set min-width to maintain alignment
          iconSpan.style.minWidth = "18px"; // Adjust size as needed
        }

        modelOptionEl.createEl("span", { cls: "menu-option-text", text: modelName });

        // Add click handler to select the model
        this.registerDomEvent(modelOptionEl, 'click', async () => {
          if (modelName !== this.plugin.settings.modelName) { // Only act if different model clicked
            console.log(`[OllamaView] Model selected via menu: ${modelName}`);
            this.plugin.settings.modelName = modelName;
            await this.plugin.saveSettings(); // Save the new setting
            this.plugin.emit('model-changed', modelName); // Emit event for UI updates
          }
          this.closeMenu(); // Close menu after selection
        });
      });

    } catch (error) {
      console.error("Error loading models for menu:", error);
      this.modelListContainerEl.empty();
      this.modelListContainerEl.createEl("span", { text: "Error loading models." }); // Show error state
    }
  }
  // --- END NEW METHOD ---


  // --- Speech Recognition Placeholders ---
  private initSpeechWorker(): void { /* Placeholder */ }
  private setupSpeechWorkerHandlers(): void { /* Placeholder */ }
  private insertTranscript(transcript: string): void { /* Placeholder */ }
  private async toggleVoiceRecognition(): Promise<void> { new Notice("Voice recognition not implemented yet."); /* Placeholder */ }
  private async startVoiceRecognition(): Promise<void> { /* Placeholder */ }
  private stopVoiceRecording(processAudio: boolean): void { /* Placeholder */ }


  // --- Helpers & Utilities ---
  public getChatContainer(): HTMLElement { return this.chatContainer; }
  private clearChatContainerInternal(): void { this.messages = []; this.messagesPairCount = 0; this.lastMessageDate = null; if (this.chatContainer) this.chatContainer.empty(); this.hideEmptyState(); }
  public clearDisplayAndState(): void { this.clearChatContainerInternal(); this.showEmptyState(); this.updateSendButtonState(); setTimeout(() => { this.inputEl?.focus(); console.log("OllamaView: Input focus attempted after clear."); }, 50); console.log("OllamaView: Display and internal state cleared."); }
  public addLoadingIndicator(): HTMLElement { this.hideEmptyState(); const grp = this.chatContainer.createDiv({ cls: `${CSS_CLASS_MESSAGE_GROUP} ${CSS_CLASS_OLLAMA_GROUP}` }); this.renderAvatar(grp, false); const msgEl = grp.createDiv({ cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_OLLAMA_MESSAGE}` }); const dots = msgEl.createDiv({ cls: CSS_CLASS_THINKING_DOTS }); for (let i = 0; i < 3; i++) dots.createDiv({ cls: CSS_CLASS_THINKING_DOT }); this.guaranteedScrollToBottom(50, true); return grp; }
  public removeLoadingIndicator(loadingEl: HTMLElement | null): void { if (loadingEl?.parentNode) { loadingEl.remove(); } }
  public scrollToBottom(): void { this.guaranteedScrollToBottom(50, true); }
  public clearInputField(): void { if (this.inputEl) { this.inputEl.value = ""; this.inputEl.dispatchEvent(new Event('input')); } }
  guaranteedScrollToBottom(delay = 50, forceScroll = false): void { if (this.scrollTimeout) { clearTimeout(this.scrollTimeout); this.scrollTimeout = null; } /* console.log(`[OllamaView] GScroll requested. Delay:${delay}, Force:${forceScroll}, UserScrolledUp:${this.userScrolledUp}`); */ this.scrollTimeout = setTimeout(() => { requestAnimationFrame(() => { if (this.chatContainer) { const t = 100; const sT = this.chatContainer.scrollTop; const sH = this.chatContainer.scrollHeight; const cH = this.chatContainer.clientHeight; const isUp = sH - sT - cH > t; if (isUp !== this.userScrolledUp) { this.userScrolledUp = isUp; if (!isUp) this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } if (forceScroll || !this.userScrolledUp || this.isProcessing) { /* console.log(`[OllamaView] Scrolling. Force:${forceScroll}, ScrolledUp:${this.userScrolledUp}, Processing:${this.isProcessing}`); */ this.chatContainer.scrollTop = sH; if (forceScroll || this.isProcessing) { if (this.userScrolledUp) { } this.userScrolledUp = false; this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } } else { /* console.log(`[OllamaView] Scroll skipped.`); */ } } else { console.warn("[OllamaView] GScroll: chatContainer not found."); } }); this.scrollTimeout = null; }, delay); }
  formatTime(date: Date): string { return date.toLocaleTimeString('en-US', { hour: "2-digit", minute: "2-digit" }); }
  formatDateSeparator(date: Date): string { const n = new Date(); const y = new Date(n); y.setDate(n.getDate() - 1); if (this.isSameDay(date, n)) return "Today"; else if (this.isSameDay(date, y)) return "Yesterday"; else return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
  isSameDay(date1: Date, date2: Date): boolean { return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate(); }
  public setLoadingState(isLoading: boolean): void { this.isProcessing = isLoading; if (this.inputEl) this.inputEl.disabled = isLoading; this.updateSendButtonState(); if (this.voiceButton) { this.voiceButton.disabled = isLoading; this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } if (this.menuButton) { this.menuButton.disabled = isLoading; this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } }

} // END OF OllamaView CLASS