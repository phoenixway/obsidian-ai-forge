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
const CSS_CLASS_MODEL_OPTION = "model-option";
const CSS_CLASS_MODEL_LIST_CONTAINER = "model-list-container";
const CSS_CLASS_ROLE_OPTION = "role-option";
const CSS_CLASS_ROLE_LIST_CONTAINER = "role-list-container";
const CSS_CLASS_MENU_HEADER = "menu-header";
const CSS_CLASS_EXPORT_CHAT_OPTION = "export-chat-option"; // New Constant

// Role & Message Types
export type MessageRole = "user" | "assistant" | "system" | "error";
export interface Message { role: MessageRole; content: string; timestamp: Date; }
interface AddMessageOptions { saveHistory?: boolean; timestamp?: Date | string; }

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
  private modelListContainerEl!: HTMLElement;
  private roleListContainerEl!: HTMLElement;
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
    if (OllamaView.instance && OllamaView.instance !== this) { console.warn("Replacing existing OllamaView instance."); } OllamaView.instance = this;
    if (!requireApiVersion || !requireApiVersion("1.0.0")) { console.warn("Ollama Plugin: Obsidian API version might be outdated."); }
    this.initSpeechWorker(); // Placeholder
    this.scrollListenerDebounced = debounce(this.handleScroll, 150, true);
  }

  // --- Getters ---
  public getMessagesCount(): number { return this.messages.length; }
  public getMessagesPairCount(): number { return this.messagesPairCount; }
  public getMessages(): Message[] { return [...this.messages]; } // Return a copy
  public isMenuOpen(): boolean { return this.menuDropdown?.style.display === 'block'; }


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
    await Promise.all([this.loadAndRenderHistory(), this.renderModelList(), this.renderRoleList()]);
    this.inputEl?.focus();
    this.inputEl?.dispatchEvent(new Event('input'));
  }

  async onClose(): Promise<void> { console.log("OllamaView onClose: Cleaning up resources."); if (this.speechWorker) { this.speechWorker.terminate(); this.speechWorker = null; } this.stopVoiceRecording(false); if (this.audioStream) { this.audioStream.getTracks().forEach(t => t.stop()); this.audioStream = null; } if (this.scrollTimeout) clearTimeout(this.scrollTimeout); if (this.resizeTimeout) clearTimeout(this.resizeTimeout); if (OllamaView.instance === this) { OllamaView.instance = null; } }


  // --- UI Creation ---
  private createUIElements(): void {
    this.contentEl.empty();
    this.chatContainerEl = this.contentEl.createDiv({ cls: CSS_CLASS_CONTAINER });
    this.chatContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_CHAT_CONTAINER });
    this.newMessagesIndicatorEl = this.chatContainerEl.createDiv({ cls: CSS_CLASS_NEW_MESSAGE_INDICATOR }); setIcon(this.newMessagesIndicatorEl.createSpan({ cls: "indicator-icon" }), "arrow-down"); this.newMessagesIndicatorEl.createSpan({ text: " New Messages" });
    const inputContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER });
    this.inputEl = inputContainer.createEl("textarea", { attr: { placeholder: `Text to ${this.plugin.settings.modelName}...`, rows: 1 } });
    this.buttonsContainer = inputContainer.createDiv({ cls: CSS_CLASS_BUTTONS_CONTAINER });
    this.sendButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_SEND_BUTTON, attr: { 'aria-label': 'Send' } }); setIcon(this.sendButton, "send");
    this.voiceButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_VOICE_BUTTON, attr: { 'aria-label': 'Voice Input' } }); setIcon(this.voiceButton, "mic");
    this.menuButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_MENU_BUTTON, attr: { 'aria-label': 'Menu' } }); setIcon(this.menuButton, "more-vertical");

    // Menu Dropdown Structure
    this.menuDropdown = inputContainer.createEl("div", { cls: [CSS_CLASS_MENU_DROPDOWN, "ollama-chat-menu"] });
    this.menuDropdown.style.display = "none";

    // Model Selection
    this.menuDropdown.createEl("div", { text: "Select Model", cls: CSS_CLASS_MENU_HEADER });
    this.modelListContainerEl = this.menuDropdown.createDiv({ cls: CSS_CLASS_MODEL_LIST_CONTAINER });
    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    // Role Selection
    this.menuDropdown.createEl("div", { text: "Select Role", cls: CSS_CLASS_MENU_HEADER });
    this.roleListContainerEl = this.menuDropdown.createDiv({ cls: CSS_CLASS_ROLE_LIST_CONTAINER });
    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    // Clear Chat Option
    this.clearChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLEAR_CHAT_OPTION}` });
    setIcon(this.clearChatOption.createEl("span", { cls: "menu-option-icon" }), "trash-2");
    this.clearChatOption.createEl("span", { cls: "menu-option-text", text: "Clear Chat" });

    // --- NEW: Export Chat Option ---
    this.exportChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_EXPORT_CHAT_OPTION}` });
    setIcon(this.exportChatOption.createEl("span", { cls: "menu-option-icon" }), "download"); // Use download icon
    this.exportChatOption.createEl("span", { cls: "menu-option-text", text: "Export to Markdown" });
    // -----------------------------

    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    // Settings Option
    this.settingsOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_SETTINGS_OPTION}` });
    setIcon(this.settingsOption.createEl("span", { cls: "menu-option-icon" }), "settings");
    this.settingsOption.createEl("span", { cls: "menu-option-text", text: "Settings" });
  }

  // --- Event Listeners ---
  private attachEventListeners(): void {
    // ... (previous listeners) ...
    this.inputEl.addEventListener("keydown", this.handleKeyDown);
    this.inputEl.addEventListener('input', this.handleInputForResize);
    this.sendButton.addEventListener("click", this.handleSendClick);
    this.voiceButton.addEventListener("click", this.handleVoiceClick);
    this.menuButton.addEventListener("click", this.handleMenuClick);
    this.settingsOption.addEventListener("click", this.handleSettingsClick);
    this.clearChatOption.addEventListener("click", this.handleClearChatClick);
    // --- NEW: Add listener for export ---
    this.exportChatOption.addEventListener("click", this.handleExportChatClick);
    // ----------------------------------
    this.registerDomEvent(window, 'resize', this.handleWindowResize);
    this.registerEvent(this.app.workspace.on('resize', this.handleWindowResize));
    this.registerDomEvent(document, 'click', this.handleDocumentClickForMenu);
    this.register(this.plugin.on('model-changed', this.handleModelChange));
    this.register(this.plugin.on('role-changed', this.handleRoleChange));
    this.register(this.plugin.on('roles-updated', this.handleRolesUpdated));
    this.registerDomEvent(document, 'visibilitychange', this.handleVisibilityChange);
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange));
    this.registerDomEvent(this.chatContainer, 'scroll', this.scrollListenerDebounced);
    if (this.newMessagesIndicatorEl) { this.registerDomEvent(this.newMessagesIndicatorEl, 'click', this.handleNewMessageIndicatorClick); }
  }

  // --- Event Handlers ---
  private handleKeyDown = (e: KeyboardEvent): void => { /* ... */ }
  private handleSendClick = (): void => { /* ... */ }
  private handleVoiceClick = (): void => { /* ... */ }
  private handleMenuClick = (e: MouseEvent): void => { /* ... */ }
  private handleSettingsClick = async (): Promise<void> => { /* ... */ }
  private handleClearChatClick = (): void => { /* ... */ }
  private handleDocumentClickForMenu = (e: MouseEvent): void => { /* ... */ }
  private handleModelChange = (modelName: string): void => { /* ... */ }
  private handleRoleChange = (roleName: string): void => { /* ... */ }
  private handleRolesUpdated = (): void => { /* ... */ };
  private handleVisibilityChange = (): void => { /* ... */ }
  private handleActiveLeafChange = (leaf: WorkspaceLeaf | null): void => { /* ... */ }
  private handleInputForResize = (): void => { /* ... */ };
  private handleWindowResize = (): void => { /* ... */ };
  private handleScroll = (): void => { /* ... */ }
  private handleNewMessageIndicatorClick = (): void => { /* ... */ }

  // --- NEW: Handler for Export Chat ---
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
  // ----------------------------------

  // --- UI Update Methods ---
  private updateInputPlaceholder(modelName: string): void { /* ... */ }
  private closeMenu(): void { /* ... */ }
  private autoResizeTextarea(): void { /* ... */ }
  private adjustTextareaHeight = (): void => { /* ... */ }
  private updateSendButtonState(): void { /* ... */ }
  public showEmptyState(): void { /* ... */ }
  public hideEmptyState(): void { /* ... */ }

  // --- Message Handling ---
  private async loadAndRenderHistory(): Promise<void> { /* ... */ }
  async saveMessageHistory(): Promise<void> { /* ... */ }
  async sendMessage(): Promise<void> { /* ... */ }
  public internalAddMessage(role: MessageRole, content: string, options: AddMessageOptions = {}): void { /* ... */ }

  // --- Rendering Logic ---
  renderMessage(message: Message): HTMLElement | null { /* ... */ return null; } // Placeholder implementation
  private renderAvatar(groupEl: HTMLElement, isUser: boolean): void { /* ... */ }
  private renderDateSeparator(date: Date): void { /* ... */ }
  private renderAssistantContent(containerEl: HTMLElement, content: string): void { /* ... */ }
  private addCodeBlockEnhancements(contentEl: HTMLElement): void { /* ... */ }
  private checkMessageForCollapsing(messageEl: HTMLElement): void { /* ... */ }
  private checkAllMessagesForCollapsing(): void { /* ... */ }
  private toggleMessageCollapse(contentEl: HTMLElement, buttonEl: HTMLButtonElement): void { /* ... */ }
  private handleCopyClick(content: string, buttonEl: HTMLElement): void { /* ... */ }
  private processThinkingTags(content: string): string { /* ... */ return ""; }
  private markdownToHtml(markdown: string): string { /* ... */ return ""; }
  private addThinkingToggleListeners(contentEl: HTMLElement): void { /* ... */ }
  private decodeHtmlEntities(text: string): string { /* ... */ return text; }
  private detectThinkingTags(content: string): { hasThinkingTags: boolean; format: string } { /* ... */ return { hasThinkingTags: false, format: "none" }; }


  // --- Menu List Rendering ---
  private async renderModelList(): Promise<void> { /* ... */ }
  public async renderRoleList(): Promise<void> { /* ... */ } // Make public if needed by main.ts still, otherwise private

  // --- Speech Recognition Placeholders ---
  private initSpeechWorker(): void { /* Placeholder */ }
  private setupSpeechWorkerHandlers(): void { /* Placeholder */ }
  private insertTranscript(transcript: string): void { /* Placeholder */ }
  private async toggleVoiceRecognition(): Promise<void> { new Notice("Voice recognition not implemented yet."); }
  private async startVoiceRecognition(): Promise<void> { /* Placeholder */ }
  private stopVoiceRecording(processAudio: boolean): void { /* Placeholder */ }


  // --- NEW HELPER: Format chat history to Markdown ---
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
  // --- END NEW HELPER ---


  // --- Other Helpers & Utilities ---
  public getChatContainer(): HTMLElement { return this.chatContainer; }
  private clearChatContainerInternal(): void { this.messages = []; this.messagesPairCount = 0; this.lastMessageDate = null; if (this.chatContainer) this.chatContainer.empty(); this.hideEmptyState(); }
  public clearDisplayAndState(): void { this.clearChatContainerInternal(); this.showEmptyState(); this.updateSendButtonState(); setTimeout(() => { this.inputEl?.focus(); console.log("OllamaView: Input focus attempted after clear."); }, 50); console.log("OllamaView: Display and internal state cleared."); }
  public addLoadingIndicator(): HTMLElement { this.hideEmptyState(); const g = this.chatContainer.createDiv({ cls: `${CSS_CLASS_MESSAGE_GROUP} ${CSS_CLASS_OLLAMA_GROUP}` }); this.renderAvatar(g, false); const m = g.createDiv({ cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_OLLAMA_MESSAGE}` }); const d = m.createDiv({ cls: CSS_CLASS_THINKING_DOTS }); for (let i = 0; i < 3; i++)d.createDiv({ cls: CSS_CLASS_THINKING_DOT }); this.guaranteedScrollToBottom(50, true); return g; }
  public removeLoadingIndicator(loadingEl: HTMLElement | null): void { if (loadingEl?.parentNode) { loadingEl.remove(); } }
  public scrollToBottom(): void { this.guaranteedScrollToBottom(50, true); }
  public clearInputField(): void { if (this.inputEl) { this.inputEl.value = ""; this.inputEl.dispatchEvent(new Event('input')); } }
  guaranteedScrollToBottom(delay = 50, forceScroll = false): void { if (this.scrollTimeout) { clearTimeout(this.scrollTimeout); this.scrollTimeout = null; } this.scrollTimeout = setTimeout(() => { requestAnimationFrame(() => { if (this.chatContainer) { const t = 100; const sT = this.chatContainer.scrollTop; const sH = this.chatContainer.scrollHeight; const cH = this.chatContainer.clientHeight; const isUp = sH - sT - cH > t; if (isUp !== this.userScrolledUp) { this.userScrolledUp = isUp; if (!isUp) this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } if (forceScroll || !this.userScrolledUp || this.isProcessing) { this.chatContainer.scrollTop = sH; if (forceScroll || this.isProcessing) { if (this.userScrolledUp) { } this.userScrolledUp = false; this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } } else { } } else { console.warn("[OllamaView] GScroll: chatContainer not found."); } }); this.scrollTimeout = null; }, delay); }
  formatTime(date: Date): string { return date.toLocaleTimeString('en-US', { hour: "2-digit", minute: "2-digit" }); }
  formatDateSeparator(date: Date): string { const n = new Date(); const y = new Date(n); y.setDate(n.getDate() - 1); if (this.isSameDay(date, n)) return "Today"; else if (this.isSameDay(date, y)) return "Yesterday"; else return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
  isSameDay(date1: Date, date2: Date): boolean { return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate(); }
  public setLoadingState(isLoading: boolean): void { this.isProcessing = isLoading; if (this.inputEl) this.inputEl.disabled = isLoading; this.updateSendButtonState(); if (this.voiceButton) { this.voiceButton.disabled = isLoading; this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } if (this.menuButton) { this.menuButton.disabled = isLoading; this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } }

  public focusInput(): void {
    // Невелика затримка гарантує, що поле вже enabled і готове до фокусу
    setTimeout(() => {
      this.inputEl?.focus();
      // console.log("[OllamaView] Input focused after response."); // Optional log
    }, 0); // setTimeout 0 або невелика затримка (напр. 10)
  }

} // END OF OllamaView CLASS