// ollamaView.ts

import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  MarkdownRenderer,
  Notice,
  debounce,
  requireApiVersion,
  normalizePath,
  Menu // For typing, though menu is custom
} from "obsidian";
import OllamaPlugin from "./main";
import { AvatarType } from "./settings"; // Import avatar type
import { RoleInfo } from "./main"; // Import RoleInfo type from main.ts

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
const CSS_CLASS_MODEL_OPTION = "model-option"; // Specific class for model option
const CSS_CLASS_MODEL_LIST_CONTAINER = "model-list-container"; // Container for model list
const CSS_CLASS_ROLE_OPTION = "role-option"; // Specific class for role option
const CSS_CLASS_ROLE_LIST_CONTAINER = "role-list-container"; // Container for role list
const CSS_CLASS_MENU_HEADER = "menu-header"; // Class for menu section headers
const CSS_CLASS_EXPORT_CHAT_OPTION = "export-chat-option";

// Role & Message Types
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
  // --- Class Properties ---
  private readonly plugin: OllamaPlugin;
  private chatContainerEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private chatContainer!: HTMLElement;
  private sendButton!: HTMLButtonElement;
  private voiceButton!: HTMLButtonElement;
  private menuButton!: HTMLButtonElement;
  private menuDropdown!: HTMLElement;
  private modelListContainerEl!: HTMLElement; // Container for models
  private roleListContainerEl!: HTMLElement; // Container for roles
  private clearChatOption!: HTMLElement;
  private exportChatOption!: HTMLElement; // New element reference
  private settingsOption!: HTMLElement;
  private buttonsContainer!: HTMLElement;

  private messages: Message[] = [];
  private isProcessing: boolean = false;
  private scrollTimeout: NodeJS.Timeout | null = null;
  static instance: OllamaView | null = null;

  // Speech Recognition (Placeholders)
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
    this.plugin = plugin;

    // Singleton Logic
    if (OllamaView.instance && OllamaView.instance !== this) {
      console.warn("Replacing existing OllamaView instance.");
    }
    OllamaView.instance = this;

    // Check Obsidian API version
    if (!requireApiVersion || !requireApiVersion("1.0.0")) {
      console.warn("Ollama Plugin: Current Obsidian API version might be outdated.");
    }

    this.initSpeechWorker(); // Placeholder
    this.scrollListenerDebounced = debounce(this.handleScroll, 150, true);
  }

  // --- Getters ---
  public getMessagesCount(): number { return this.messages.length; }
  public getMessagesPairCount(): number { return this.messagesPairCount; }
  public getMessages(): Message[] { return [...this.messages]; } // Return a copy
  // Helper to check if the custom menu is currently open
  public isMenuOpen(): boolean {
    return this.menuDropdown?.style.display === 'block';
  }


  // --- Obsidian View Methods ---
  getViewType(): string { return VIEW_TYPE_OLLAMA; }
  getDisplayText(): string { return "Ollama Chat"; }
  getIcon(): string { return "message-square"; }

  async onOpen(): Promise<void> {
    this.createUIElements();
    this.updateInputPlaceholder(this.plugin.settings.modelName);
    this.attachEventListeners();
    this.autoResizeTextarea();
    this.updateSendButtonState();
    this.lastMessageDate = null;

    // Load history AND initial model/role lists concurrently
    await Promise.all([
      this.loadAndRenderHistory(),
      this.renderModelList(),
      this.renderRoleList() // Render role list on open
    ]);

    this.inputEl?.focus();
    this.inputEl?.dispatchEvent(new Event('input'));
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

    this.newMessagesIndicatorEl = this.chatContainerEl.createDiv({ cls: CSS_CLASS_NEW_MESSAGE_INDICATOR });
    const indicatorIcon = this.newMessagesIndicatorEl.createSpan({ cls: "indicator-icon" });
    setIcon(indicatorIcon, "arrow-down");
    this.newMessagesIndicatorEl.createSpan({ text: " New Messages" });

    const inputContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER });
    this.inputEl = inputContainer.createEl("textarea", { attr: { placeholder: `Text to ${this.plugin.settings.modelName}...`, rows: 1 } });
    this.buttonsContainer = inputContainer.createDiv({ cls: CSS_CLASS_BUTTONS_CONTAINER });
    this.sendButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_SEND_BUTTON, attr: { 'aria-label': 'Send' } }); setIcon(this.sendButton, "send");
    this.voiceButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_VOICE_BUTTON, attr: { 'aria-label': 'Voice Input' } }); setIcon(this.voiceButton, "mic");
    this.menuButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_MENU_BUTTON, attr: { 'aria-label': 'Menu' } }); setIcon(this.menuButton, "more-vertical");

    // Menu Dropdown Structure
    this.menuDropdown = inputContainer.createEl("div", { cls: [CSS_CLASS_MENU_DROPDOWN, "ollama-chat-menu"] }); // Added specific class
    this.menuDropdown.style.display = "none";

    // --- Model Selection Section ---
    this.menuDropdown.createEl("div", { text: "Select Model", cls: CSS_CLASS_MENU_HEADER });
    this.modelListContainerEl = this.menuDropdown.createDiv({ cls: CSS_CLASS_MODEL_LIST_CONTAINER });
    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    // --- Role Selection Section ---
    this.menuDropdown.createEl("div", { text: "Select Role", cls: CSS_CLASS_MENU_HEADER });
    this.roleListContainerEl = this.menuDropdown.createDiv({ cls: CSS_CLASS_ROLE_LIST_CONTAINER }); // Container for roles
    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    // Clear Chat Option
    this.clearChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLEAR_CHAT_OPTION}` });
    const clearIcon = this.clearChatOption.createEl("span", { cls: "menu-option-icon" }); setIcon(clearIcon, "trash-2");
    this.clearChatOption.createEl("span", { cls: "menu-option-text", text: "Clear Chat" });
    this.exportChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_EXPORT_CHAT_OPTION}` });
    setIcon(this.exportChatOption.createEl("span", { cls: "menu-option-icon" }), "download"); // Use download icon
    this.exportChatOption.createEl("span", { cls: "menu-option-text", text: "Export to Markdown" });


    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    // Settings Option
    this.settingsOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_SETTINGS_OPTION}` });
    const settingsIcon = this.settingsOption.createEl("span", { cls: "menu-option-icon" }); setIcon(settingsIcon, "settings");
    this.settingsOption.createEl("span", { cls: "menu-option-text", text: "Settings" });
  }

  // --- Event Listeners ---
  private attachEventListeners(): void {
    this.inputEl.addEventListener("keydown", this.handleKeyDown);
    this.inputEl.addEventListener('input', this.handleInputForResize);
    this.sendButton.addEventListener("click", this.handleSendClick);
    this.voiceButton.addEventListener("click", this.handleVoiceClick); // Placeholder
    this.menuButton.addEventListener("click", this.handleMenuClick); // Handles models/roles refresh
    this.settingsOption.addEventListener("click", this.handleSettingsClick);
    this.clearChatOption.addEventListener("click", this.handleClearChatClick); // No confirm
    this.exportChatOption.addEventListener("click", this.handleExportChatClick);

    this.registerDomEvent(window, 'resize', this.handleWindowResize);
    this.registerEvent(this.app.workspace.on('resize', this.handleWindowResize));
    this.registerDomEvent(document, 'click', this.handleDocumentClickForMenu);
    // Listen for events from the plugin

    this.register(this.plugin.on('model-changed', this.handleModelChange));
    this.register(this.plugin.on('role-changed', this.handleRoleChange));
    this.register(this.plugin.on('roles-updated', this.handleRolesUpdated)); // Новий слухач


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
  private handleVoiceClick = (): void => { this.toggleVoiceRecognition(); } // Placeholder
  private handleMenuClick = (e: MouseEvent): void => {
    e.stopPropagation();
    const isHidden = this.menuDropdown.style.display === "none";
    if (isHidden) {
      // Refresh both lists BEFORE showing menu
      Promise.all([this.renderModelList(), this.renderRoleList()]); // Run concurrently
      this.menuDropdown.style.display = "block";
      this.menuDropdown.style.animation = 'menu-fade-in 0.15s ease-out';
    } else {
      this.menuDropdown.style.display = "none";
    }
  }
  private handleExportChatClick = async (): Promise<void> => {
    this.closeMenu();
    console.log("[OllamaView] Export to Markdown initiated.");

    if (this.messages.length === 0) {
      new Notice("Chat is empty, nothing to export.");
      return;
    }

    try {
      const markdownContent = this.formatChatToMarkdown();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // Simple timestamp for filename
      const defaultFileName = `ollama-chat-${timestamp}.md`;
      const defaultFolder = this.app.vault.getRoot(); // Save to vault root by default

      // Use create to save the file
      const file = await this.app.vault.create(
        normalizePath(`${defaultFolder.path}/${defaultFileName}`), // Use normalizePath
        markdownContent
      );
      new Notice(`Chat exported successfully to ${file.path}`);
      console.log(`[OllamaView] Chat exported to ${file.path}`);

    } catch (error) {
      console.error("Error exporting chat to Markdown:", error);
      new Notice("Error exporting chat. Check console for details.");
    }
  }
  private handleRolesUpdated = (): void => {
    // Оновлюємо список ролей в меню ТІЛЬКИ якщо меню зараз відкрите
    if (this.isMenuOpen()) {
      console.log("[OllamaView] Roles updated event received, refreshing menu list.");
      this.renderRoleList();
    }
  };
  private handleSettingsClick = async (): Promise<void> => { this.closeMenu(); const setting = (this.app as any).setting; if (setting) { await setting.open(); setting.openTabById("ollama-chat-plugin"); } else { new Notice("Could not open settings."); } }
  private handleClearChatClick = (): void => {
    this.closeMenu();
    this.plugin.clearMessageHistory(); // No confirmation dialog
  }
  private handleDocumentClickForMenu = (e: MouseEvent): void => { if (this.isMenuOpen() && !this.menuButton.contains(e.target as Node) && !this.menuDropdown.contains(e.target as Node)) { this.closeMenu(); } }
  private handleModelChange = (modelName: string): void => { this.updateInputPlaceholder(modelName); if (this.messages.length > 0) { this.plugin.messageService.addSystemMessage(`Model changed to: ${modelName}`); } }
  // --- NEW: Handler for Role Change ---
  private handleRoleChange = (roleName: string): void => {
    const displayRole = roleName || "Default"; // Show 'Default' if name is empty
    if (this.messages.length > 0) {
      this.plugin.messageService.addSystemMessage(`Role changed to: ${displayRole}`);
    } else {
      // Maybe show a notice if chat is empty?
      new Notice(`Role set to: ${displayRole}`);
    }
    // Potentially clear history or warn user if role significantly changes context? Optional.
  }
  // ------------------------------------
  private handleVisibilityChange = (): void => { if (document.visibilityState === 'visible' && this.leaf.view === this) { requestAnimationFrame(() => { this.guaranteedScrollToBottom(50, true); this.adjustTextareaHeight(); }); } }
  private handleActiveLeafChange = (leaf: WorkspaceLeaf | null): void => { if (leaf?.view === this) { console.log("[OllamaView] View became active."); this.inputEl?.focus(); setTimeout(() => this.guaranteedScrollToBottom(150, true), 100); } }
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
    // ... (code for loadAndRenderHistory from previous answer - calls collapse check & scrolls) ...
    this.lastMessageDate = null; this.clearChatContainerInternal(); try { console.log("[OllamaView] Starting history loading..."); await this.plugin.messageService.loadMessageHistory(); if (this.messages.length === 0) { this.showEmptyState(); console.log("[OllamaView] History loaded, empty."); } else { this.hideEmptyState(); console.log(`[OllamaView] History loaded (${this.messages.length} msgs). Checking collapsing...`); this.checkAllMessagesForCollapsing(); setTimeout(() => { console.log("[OllamaView] Attempting scroll after load."); this.guaranteedScrollToBottom(200, true); }, 150); } } catch (error) { console.error("OllamaView: Error loading history:", error); this.clearChatContainerInternal(); this.showEmptyState(); }
  }

  async saveMessageHistory(): Promise<void> {
    // ... (saveMessageHistory code without changes) ...
    if (!this.plugin.settings.saveMessageHistory) return; const m = this.messages.map(msg => ({ role: msg.role, content: msg.content, timestamp: msg.timestamp.toISOString() })); const d = JSON.stringify(m); try { await this.plugin.saveMessageHistory(d); } catch (e) { console.error("OllamaView: Error saving history:", e); new Notice("Failed to save chat history."); }
  }

  async sendMessage(): Promise<void> {
    // ... (sendMessage code without changes) ...
    const c = this.inputEl.value.trim(); if (!c || this.isProcessing || this.sendButton.disabled) return; const m = this.inputEl.value; this.clearInputField(); this.setLoadingState(true); this.hideEmptyState(); this.internalAddMessage("user", m); try { await this.plugin.messageService.sendMessage(c); } catch (e: any) { console.error("OllamaView: Error sending message:", e); this.internalAddMessage("error", `Failed to send: ${e.message || 'Unknown error'}`); this.setLoadingState(false); }
  }

  public internalAddMessage(role: MessageRole, content: string, options: AddMessageOptions = {}): void {
    // ... (internalAddMessage code without changes - calls render, collapse check etc.) ...
    const { saveHistory = true, timestamp } = options; let msgTs: Date; if (timestamp) { try { msgTs = typeof timestamp === 'string' ? new Date(timestamp) : timestamp; if (isNaN(msgTs.getTime())) throw new Error("Invalid Date"); } catch (e) { console.warn("Invalid timestamp, using current:", timestamp, e); msgTs = new Date(); } } else { msgTs = new Date(); } const message: Message = { role, content, timestamp: msgTs }; this.messages.push(message); if (role === "assistant" && this.messages.length >= 2) { const prev = this.messages[this.messages.length - 2]; if (prev?.role === "user") this.messagesPairCount++; } const msgEl = this.renderMessage(message); this.hideEmptyState(); if (msgEl) { this.checkMessageForCollapsing(msgEl); } if (saveHistory && this.plugin.settings.saveMessageHistory) { this.debouncedSaveMessageHistory(); } if (role !== "user" && this.userScrolledUp && this.newMessagesIndicatorEl) { this.newMessagesIndicatorEl.classList.add(CSS_CLASS_VISIBLE); } else if (!this.userScrolledUp) { const forceScroll = role !== "user"; this.guaranteedScrollToBottom(forceScroll ? 100 : 50, forceScroll); }
  }

  // --- Rendering Logic ---
  renderMessage(message: Message): HTMLElement | null {
    // ... (renderMessage code without changes - handles avatars, collapse class etc.) ...
    const i = this.messages.indexOf(message); if (i === -1) return null; const p = i > 0 ? this.messages[i - 1] : null; const d = !this.lastMessageDate || !this.isSameDay(this.lastMessageDate, message.timestamp); if (d) { this.renderDateSeparator(message.timestamp); this.lastMessageDate = message.timestamp; } else if (i === 0) { this.lastMessageDate = message.timestamp; } let g: HTMLElement | null = null; let gc = CSS_CLASS_MESSAGE_GROUP; let mc = `${CSS_CLASS_MESSAGE} ${CSS_CLASS_MESSAGE_ARRIVING}`; let sa = false; let iu = false; const f = !p || p.role !== message.role || d; switch (message.role) { case "user": gc += ` ${CSS_CLASS_USER_GROUP}`; mc += ` ${CSS_CLASS_USER_MESSAGE}`; sa = true; iu = true; break; case "assistant": gc += ` ${CSS_CLASS_OLLAMA_GROUP}`; mc += ` ${CSS_CLASS_OLLAMA_MESSAGE}`; sa = true; break; case "system": gc += ` ${CSS_CLASS_SYSTEM_GROUP}`; mc += ` ${CSS_CLASS_SYSTEM_MESSAGE}`; break; case "error": gc += ` ${CSS_CLASS_ERROR_GROUP}`; mc += ` ${CSS_CLASS_ERROR_MESSAGE}`; break; } const le = this.chatContainer.lastElementChild as HTMLElement; if (f || !le || !le.matches(`.${gc.split(' ')[1]}`)) { g = this.chatContainer.createDiv({ cls: gc }); if (sa) { this.renderAvatar(g, iu); } } else { g = le; } const me = g.createDiv({ cls: mc }); const cc = me.createDiv({ cls: CSS_CLASS_CONTENT_CONTAINER }); const ce = cc.createDiv({ cls: CSS_CLASS_CONTENT }); switch (message.role) { case "assistant": case "user": ce.addClass(CSS_CLASS_CONTENT_COLLAPSIBLE); if (message.role === 'assistant') { this.renderAssistantContent(ce, message.content); } else { message.content.split("\n").forEach((l, idx, a) => { ce.appendText(l); if (idx < a.length - 1) ce.createEl("br"); }); } break; case "system": setIcon(ce.createSpan({ cls: CSS_CLASS_SYSTEM_ICON }), "info"); ce.createSpan({ cls: CSS_CLASS_SYSTEM_TEXT, text: message.content }); break; case "error": setIcon(ce.createSpan({ cls: CSS_CLASS_ERROR_ICON }), "alert-triangle"); ce.createSpan({ cls: CSS_CLASS_ERROR_TEXT, text: message.content }); break; } if (message.role !== "system") { const cb = cc.createEl("button", { cls: CSS_CLASS_COPY_BUTTON, attr: { title: "Copy" } }); setIcon(cb, "copy"); cb.addEventListener("click", () => this.handleCopyClick(message.content, cb)); } me.createDiv({ cls: CSS_CLASS_TIMESTAMP, text: this.formatTime(message.timestamp) }); setTimeout(() => me.classList.remove(CSS_CLASS_MESSAGE_ARRIVING), 500); return me;
  }

  private renderAvatar(groupEl: HTMLElement, isUser: boolean): void {
    // ... (renderAvatar code without changes - reads settings) ...
    const s = this.plugin.settings; const t = isUser ? s.userAvatarType : s.aiAvatarType; const c = isUser ? s.userAvatarContent : s.aiAvatarContent; const l = isUser ? CSS_CLASS_AVATAR_USER : CSS_CLASS_AVATAR_AI; const a = groupEl.createDiv({ cls: `${CSS_CLASS_AVATAR} ${l}` }); if (t === 'initials') { a.textContent = c || (isUser ? 'U' : 'A'); } else if (t === 'icon') { try { setIcon(a, c || (isUser ? 'user' : 'bot')); } catch (e) { console.warn(`Icon "${c}" failed.`, e); a.textContent = isUser ? 'U' : 'A'; } } else { a.textContent = isUser ? 'U' : 'A'; }
  }

  private renderDateSeparator(date: Date): void { if (!this.chatContainer) return; this.chatContainer.createDiv({ cls: CSS_CLASS_DATE_SEPARATOR, text: this.formatDateSeparator(date) }); }

  private renderAssistantContent(containerEl: HTMLElement, content: string): void {
    // ... (renderAssistantContent code without changes) ...
    const d = this.decodeHtmlEntities(content); const t = this.detectThinkingTags(d); containerEl.empty(); if (t.hasThinkingTags) { const h = this.processThinkingTags(d); containerEl.innerHTML = h; this.addThinkingToggleListeners(containerEl); this.addCodeBlockEnhancements(containerEl); } else { MarkdownRenderer.renderMarkdown(content, containerEl, this.plugin.app.vault.getRoot()?.path ?? "", this); this.addCodeBlockEnhancements(containerEl); }
  }

  private addCodeBlockEnhancements(contentEl: HTMLElement): void {
    // ... (addCodeBlockEnhancements code without changes - adds lang & copy btn) ...
    const p = contentEl.querySelectorAll("pre"); p.forEach(pre => { if (pre.querySelector(`.${CSS_CLASS_CODE_BLOCK_COPY_BUTTON}`)) return; const c = pre.querySelector("code"); if (!c) return; const t = c.textContent || ""; const l = Array.from(c.classList).find(cls => cls.startsWith("language-")); if (l) { const lang = l.replace("language-", ""); if (lang) pre.createEl("span", { cls: CSS_CLASS_CODE_BLOCK_LANGUAGE, text: lang }); } const b = pre.createEl("button", { cls: CSS_CLASS_CODE_BLOCK_COPY_BUTTON }); setIcon(b, "copy"); b.setAttribute("title", "Copy Code"); b.addEventListener("click", e => { e.stopPropagation(); navigator.clipboard.writeText(t).then(() => { setIcon(b, "check"); b.setAttribute("title", "Copied!"); setTimeout(() => { setIcon(b, "copy"); b.setAttribute("title", "Copy Code"); }, 1500); }).catch(err => { console.error("Copy failed:", err); new Notice("Failed to copy code."); }); }); });
  }

  // --- Methods for handling long messages ---
  private checkMessageForCollapsing(messageEl: HTMLElement): void {
    // ... (checkMessageForCollapsing code without changes) ...
    const c = messageEl.querySelector<HTMLElement>(`.${CSS_CLASS_CONTENT_COLLAPSIBLE}`); const h = this.plugin.settings.maxMessageHeight; if (!c || h <= 0) return; requestAnimationFrame(() => { const b = messageEl.querySelector(`.${CSS_CLASS_SHOW_MORE_BUTTON}`); b?.remove(); c.style.maxHeight = ''; c.classList.remove(CSS_CLASS_CONTENT_COLLAPSED); const sh = c.scrollHeight; if (sh > h) { c.style.maxHeight = `${h}px`; c.classList.add(CSS_CLASS_CONTENT_COLLAPSED); const smb = messageEl.createEl('button', { cls: CSS_CLASS_SHOW_MORE_BUTTON, text: 'Show More ▼' }); this.registerDomEvent(smb, 'click', () => this.toggleMessageCollapse(c, smb)); } });
  }

  private checkAllMessagesForCollapsing(): void {
    // ... (checkAllMessagesForCollapsing code without changes) ...
    this.chatContainer?.querySelectorAll<HTMLElement>(`.${CSS_CLASS_MESSAGE}`).forEach(msgEl => { this.checkMessageForCollapsing(msgEl); });
  }

  private toggleMessageCollapse(contentEl: HTMLElement, buttonEl: HTMLButtonElement): void {
    // ... (toggleMessageCollapse code without changes) ...
    const i = contentEl.classList.contains(CSS_CLASS_CONTENT_COLLAPSED); if (i) { contentEl.style.maxHeight = ''; contentEl.classList.remove(CSS_CLASS_CONTENT_COLLAPSED); buttonEl.setText('Show Less ▲'); } else { const h = this.plugin.settings.maxMessageHeight; contentEl.style.maxHeight = `${h}px`; contentEl.classList.add(CSS_CLASS_CONTENT_COLLAPSED); buttonEl.setText('Show More ▼'); }
  }

  // --- Other Rendering Helpers ---
  private handleCopyClick(content: string, buttonEl: HTMLElement): void { /* ... */ }
  private processThinkingTags(content: string): string { /* ... */ return ""; }
  private markdownToHtml(markdown: string): string { /* ... */ return ""; }
  private addThinkingToggleListeners(contentEl: HTMLElement): void { /* ... */ }
  private decodeHtmlEntities(text: string): string { /* ... */ return text; }
  private detectThinkingTags(content: string): { hasThinkingTags: boolean; format: string } { /* ... */ return { hasThinkingTags: false, format: "none" }; }


  // --- NEW METHOD: Renders the model list in the menu ---
  private async renderModelList(): Promise<void> {
    if (!this.modelListContainerEl) return;

    this.modelListContainerEl.empty();
    const loadingEl = this.modelListContainerEl.createEl("span", { text: "Loading models..." });

    // Icon mapping (as defined before)
    const modelIconMap: Record<string, string> = { 'llama': 'box-minimal', 'mistral': 'wind', 'mixtral': 'blend', 'codellama': 'code', 'code': 'code', 'phi': 'sigma', 'phi3': 'sigma', 'gemma': 'gem', 'command-r': 'terminal', 'llava': 'image', 'star': 'star', 'wizard': 'wand', 'hermes': 'message-circle', 'dolphin': 'anchor' };
    const defaultIcon = 'box';

    try {
      const models = await this.plugin.apiService.getModels(); // Assumes sorted
      const currentModel = this.plugin.settings.modelName;
      this.modelListContainerEl.empty();

      if (models.length === 0) { this.modelListContainerEl.createEl("span", { text: "No models available." }); return; }

      models.forEach(modelName => {
        const optEl = this.modelListContainerEl.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MODEL_OPTION}` });
        const iconSpan = optEl.createEl("span", { cls: "menu-option-icon" });
        let iconToUse = defaultIcon;
        if (modelName === currentModel) { iconToUse = "check"; optEl.addClass("is-selected"); }
        else { const lmn = modelName.toLowerCase(); for (const key in modelIconMap) { if (lmn.includes(key)) { iconToUse = modelIconMap[key]; break; } } }
        try { setIcon(iconSpan, iconToUse); } catch (e) { iconSpan.style.minWidth = "18px"; } // Set icon or placeholder width
        optEl.createEl("span", { cls: "menu-option-text", text: modelName });
        this.registerDomEvent(optEl, 'click', async () => { if (modelName !== this.plugin.settings.modelName) { this.plugin.settings.modelName = modelName; await this.plugin.saveSettings(); this.plugin.emit('model-changed', modelName); } this.closeMenu(); });
      });

    } catch (error) { console.error("Error loading models for menu:", error); this.modelListContainerEl.empty(); this.modelListContainerEl.createEl("span", { text: "Error loading models." }); }
  }
  // --- END NEW METHOD ---


  public focusInput(): void {
    // Невелика затримка гарантує, що поле вже enabled і готове до фокусу
    setTimeout(() => {
      this.inputEl?.focus();
      // console.log("[OllamaView] Input focused after response."); // Optional log
    }, 0); // setTimeout 0 або невелика затримка (напр. 10)
  }

  // --- NEW METHOD: Renders the role list in the menu ---
  public async renderRoleList(): Promise<void> {
    if (!this.roleListContainerEl) return; // Guard clause

    this.roleListContainerEl.empty();
    const loadingEl = this.roleListContainerEl.createEl("span", { text: "Loading roles..." });

    try {
      // Use forceRefresh = false to use cache if available
      const roles = await this.plugin.listRoleFiles(false);
      const currentRolePath = this.plugin.settings.selectedRolePath;
      this.roleListContainerEl.empty(); // Clear "Loading..."

      // Add "No Role" option first
      const noRoleOptionEl = this.roleListContainerEl.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}` });
      const noRoleIconSpan = noRoleOptionEl.createEl("span", { cls: "menu-option-icon" });
      if (!currentRolePath) { // Check if no role is selected
        setIcon(noRoleIconSpan, "check");
        noRoleOptionEl.addClass("is-selected");
      } else {
        setIcon(noRoleIconSpan, "slash"); // Or 'x' or leave empty with min-width
        noRoleIconSpan.style.minWidth = "18px";
      }
      noRoleOptionEl.createEl("span", { cls: "menu-option-text", text: "None (Default Assistant)" });
      this.registerDomEvent(noRoleOptionEl, 'click', async () => {
        if (this.plugin.settings.selectedRolePath !== "") { // Only act if changed
          this.plugin.settings.selectedRolePath = ""; // Set to empty path
          await this.plugin.saveSettings();
          this.plugin.emit('role-changed', "Default Assistant"); // Emit event
        }
        this.closeMenu();
      });


      if (roles.length === 0 && !this.plugin.settings.userRolesFolderPath) {
        // No custom roles found and no folder specified
        // The "None" option is already there. Maybe add info text?
        this.roleListContainerEl.createEl("span", { text: "No custom roles found. Add path in settings." });
        return;
      } else if (roles.length === 0 && this.plugin.settings.userRolesFolderPath) {
        this.roleListContainerEl.createEl("span", { text: `No roles found in specified folders.` });
        return;
      }


      roles.forEach(roleInfo => {
        const roleOptionEl = this.roleListContainerEl.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}` });
        if (roleInfo.isCustom) {
          roleOptionEl.addClass("is-custom"); // Add class for potential styling
        }
        const iconSpan = roleOptionEl.createEl("span", { cls: "menu-option-icon" });

        if (roleInfo.path === currentRolePath) {
          setIcon(iconSpan, "check");
          roleOptionEl.addClass("is-selected");
        } else {
          // Use 'user' for custom, 'box' for default, or leave empty
          setIcon(iconSpan, roleInfo.isCustom ? 'user' : 'box'); // Example icons
        }

        roleOptionEl.createEl("span", { cls: "menu-option-text", text: roleInfo.name });

        // Add click handler to select the role
        this.registerDomEvent(roleOptionEl, 'click', async () => {
          if (roleInfo.path !== this.plugin.settings.selectedRolePath) {
            console.log(`[OllamaView] Role selected via menu: ${roleInfo.name} (${roleInfo.path})`);
            this.plugin.settings.selectedRolePath = roleInfo.path; // Save the full path
            await this.plugin.saveSettings();
            this.plugin.emit('role-changed', roleInfo.name); // Emit event with role name
          }
          this.closeMenu();
        });
      });

    } catch (error) {
      console.error("Error loading roles for menu:", error);
      this.roleListContainerEl.empty();
      this.roleListContainerEl.createEl("span", { text: "Error loading roles." });
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
  public addLoadingIndicator(): HTMLElement { this.hideEmptyState(); const g = this.chatContainer.createDiv({ cls: `${CSS_CLASS_MESSAGE_GROUP} ${CSS_CLASS_OLLAMA_GROUP}` }); this.renderAvatar(g, false); const m = g.createDiv({ cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_OLLAMA_MESSAGE}` }); const d = m.createDiv({ cls: CSS_CLASS_THINKING_DOTS }); for (let i = 0; i < 3; i++)d.createDiv({ cls: CSS_CLASS_THINKING_DOT }); this.guaranteedScrollToBottom(50, true); return g; }
  public removeLoadingIndicator(loadingEl: HTMLElement | null): void { if (loadingEl?.parentNode) { loadingEl.remove(); } }
  public scrollToBottom(): void { this.guaranteedScrollToBottom(50, true); }
  public clearInputField(): void { if (this.inputEl) { this.inputEl.value = ""; this.inputEl.dispatchEvent(new Event('input')); } }
  guaranteedScrollToBottom(delay = 50, forceScroll = false): void { if (this.scrollTimeout) { clearTimeout(this.scrollTimeout); this.scrollTimeout = null; } /* console.log(`[OllamaView] GScroll requested. Delay:${delay}, Force:${forceScroll}, UserScrolledUp:${this.userScrolledUp}`); */ this.scrollTimeout = setTimeout(() => { requestAnimationFrame(() => { if (this.chatContainer) { const t = 100; const sT = this.chatContainer.scrollTop; const sH = this.chatContainer.scrollHeight; const cH = this.chatContainer.clientHeight; const isUp = sH - sT - cH > t; if (isUp !== this.userScrolledUp) { this.userScrolledUp = isUp; if (!isUp) this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } if (forceScroll || !this.userScrolledUp || this.isProcessing) { /* console.log(`[OllamaView] Scrolling. Force:${forceScroll}, ScrolledUp:${this.userScrolledUp}, Processing:${this.isProcessing}`); */ this.chatContainer.scrollTop = sH; if (forceScroll || this.isProcessing) { if (this.userScrolledUp) { } this.userScrolledUp = false; this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } } else { /* console.log(`[OllamaView] Scroll skipped.`); */ } } else { console.warn("[OllamaView] GScroll: chatContainer not found."); } }); this.scrollTimeout = null; }, delay); }
  formatTime(date: Date): string { return date.toLocaleTimeString('en-US', { hour: "2-digit", minute: "2-digit" }); }
  formatDateSeparator(date: Date): string { const n = new Date(); const y = new Date(n); y.setDate(n.getDate() - 1); if (this.isSameDay(date, n)) return "Today"; else if (this.isSameDay(date, y)) return "Yesterday"; else return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
  isSameDay(date1: Date, date2: Date): boolean { return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate(); }
  public setLoadingState(isLoading: boolean): void { this.isProcessing = isLoading; if (this.inputEl) this.inputEl.disabled = isLoading; this.updateSendButtonState(); if (this.voiceButton) { this.voiceButton.disabled = isLoading; this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } if (this.menuButton) { this.menuButton.disabled = isLoading; this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } }
  private formatChatToMarkdown(): string {
    let markdown = `# Ollama Chat Export - ${new Date().toLocaleString('en-US')}\n\n`; // Use English locale
    let lastDate: Date | null = null;

    this.messages.forEach(message => {
      // Add date separator if needed
      if (!this.lastMessageDate || !this.isSameDay(this.lastMessageDate, message.timestamp)) {
        markdown += `***\n**${this.formatDateSeparator(message.timestamp)}**\n***\n\n`;
        this.lastMessageDate = message.timestamp;
      } else if (!lastDate) { // Ensure date is set for the very first message group
        this.lastMessageDate = message.timestamp;
      }
      lastDate = message.timestamp; // Update lastDate for next iteration check

      // Add role and timestamp
      const time = this.formatTime(message.timestamp);
      switch (message.role) {
        case 'user':
          markdown += `**User (${time}):**\n`;
          break;
        case 'assistant':
          markdown += `**Assistant (${time}):**\n`;
          break;
        case 'system':
          markdown += `> [System (${time})] \n> `; // Blockquote for system
          break;
        case 'error':
          markdown += `> [!ERROR] Error (${time}):\n> `; // Admonition-like blockquote for error
          break;
      }

      // Add content, escaping potential markdown issues if needed, handle code blocks
      let content = message.content;
      // Simple heuristic to detect code blocks and ensure proper formatting
      if (content.includes('```')) {
        // Assume content is already well-formed markdown with code blocks
        markdown += content + "\n\n";
      } else if (message.role === 'system' || message.role === 'error') {
        // Quote system/error messages line by line
        markdown += content.split('\n').join('\n> ') + "\n\n";
      }
      else {
        // Standard message content
        markdown += content + "\n\n";
      }
    });

    return markdown.trim();
  }
} // END OF OllamaView CLASS