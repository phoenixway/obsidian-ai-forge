import {
  ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer, Notice, debounce, requireApiVersion, normalizePath, Menu
} from "obsidian";
import OllamaPlugin from "./main";
import { AvatarType } from "./settings";
import { RoleInfo } from "./ChatManager"; // Import RoleInfo type
import { Chat } from "./Chat"; // Import Chat class

// Constants (без змін)
export const VIEW_TYPE_OLLAMA = "ollama-chat-view";
const CSS_CLASS_CONTAINER = "ollama-container"; const CSS_CLASS_CHAT_CONTAINER = "ollama-chat-container"; const CSS_CLASS_INPUT_CONTAINER = "chat-input-container"; const CSS_CLASS_BUTTONS_CONTAINER = "buttons-container"; const CSS_CLASS_SEND_BUTTON = "send-button"; const CSS_CLASS_VOICE_BUTTON = "voice-button"; const CSS_CLASS_MENU_BUTTON = "menu-button"; const CSS_CLASS_MENU_DROPDOWN = "menu-dropdown"; const CSS_CLASS_MENU_OPTION = "menu-option"; const CSS_CLASS_SETTINGS_OPTION = "settings-option"; const CSS_CLASS_EMPTY_STATE = "ollama-empty-state"; const CSS_CLASS_MESSAGE_GROUP = "message-group"; const CSS_CLASS_USER_GROUP = "user-message-group"; const CSS_CLASS_OLLAMA_GROUP = "ollama-message-group"; const CSS_CLASS_SYSTEM_GROUP = "system-message-group"; const CSS_CLASS_ERROR_GROUP = "error-message-group"; const CSS_CLASS_MESSAGE = "message"; const CSS_CLASS_USER_MESSAGE = "user-message"; const CSS_CLASS_OLLAMA_MESSAGE = "ollama-message"; const CSS_CLASS_SYSTEM_MESSAGE = "system-message"; const CSS_CLASS_ERROR_MESSAGE = "error-message"; const CSS_CLASS_SYSTEM_ICON = "system-icon"; const CSS_CLASS_ERROR_ICON = "error-icon"; const CSS_CLASS_SYSTEM_TEXT = "system-message-text"; const CSS_CLASS_ERROR_TEXT = "error-message-text"; const CSS_CLASS_CONTENT_CONTAINER = "message-content-container"; const CSS_CLASS_CONTENT = "message-content"; const CSS_CLASS_THINKING_DOTS = "thinking-dots"; const CSS_CLASS_THINKING_DOT = "thinking-dot"; const CSS_CLASS_THINKING_BLOCK = "thinking-block"; const CSS_CLASS_THINKING_HEADER = "thinking-header"; const CSS_CLASS_THINKING_TOGGLE = "thinking-toggle"; const CSS_CLASS_THINKING_TITLE = "thinking-title"; const CSS_CLASS_THINKING_CONTENT = "thinking-content"; const CSS_CLASS_TIMESTAMP = "message-timestamp"; const CSS_CLASS_COPY_BUTTON = "copy-button"; const CSS_CLASS_TEXTAREA_EXPANDED = "expanded"; const CSS_CLASS_RECORDING = "recording"; const CSS_CLASS_DISABLED = "disabled"; const CSS_CLASS_MESSAGE_ARRIVING = "message-arriving"; const CSS_CLASS_DATE_SEPARATOR = "chat-date-separator"; const CSS_CLASS_AVATAR = "message-group-avatar"; const CSS_CLASS_AVATAR_USER = "user-avatar"; const CSS_CLASS_AVATAR_AI = "ai-avatar"; const CSS_CLASS_CODE_BLOCK_COPY_BUTTON = "code-block-copy-button"; const CSS_CLASS_CODE_BLOCK_LANGUAGE = "code-block-language"; const CSS_CLASS_NEW_MESSAGE_INDICATOR = "new-message-indicator"; const CSS_CLASS_VISIBLE = "visible"; const CSS_CLASS_MENU_SEPARATOR = "menu-separator"; const CSS_CLASS_CLEAR_CHAT_OPTION = "clear-chat-option"; const CSS_CLASS_EXPORT_CHAT_OPTION = "export-chat-option"; const CSS_CLASS_CONTENT_COLLAPSIBLE = "message-content-collapsible"; const CSS_CLASS_CONTENT_COLLAPSED = "message-content-collapsed"; const CSS_CLASS_SHOW_MORE_BUTTON = "show-more-button"; const CSS_CLASS_MODEL_OPTION = "model-option"; const CSS_CLASS_MODEL_LIST_CONTAINER = "model-list-container"; const CSS_CLASS_ROLE_OPTION = "role-option"; const CSS_CLASS_ROLE_LIST_CONTAINER = "role-list-container"; const CSS_CLASS_MENU_HEADER = "menu-header"; /* ... */

// Message types
export type MessageRole = "user" | "assistant" | "system" | "error";
export interface Message { role: MessageRole; content: string; timestamp: Date; }
interface AddMessageOptions { saveHistory?: boolean; timestamp?: Date | string; }


export class OllamaView extends ItemView {
  // --- Properties ---
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
  private exportChatOption!: HTMLElement;
  private settingsOption!: HTMLElement;
  private buttonsContainer!: HTMLElement;

  // --- State ---
  // messages array is REMOVED - data comes from ChatManager
  private isProcessing: boolean = false; // State for send/receive cycle
  private scrollTimeout: NodeJS.Timeout | null = null;
  static instance: OllamaView | null = null;
  private speechWorker: Worker | null = null; // Placeholder
  private mediaRecorder: MediaRecorder | null = null; // Placeholder
  private audioStream: MediaStream | null = null; // Placeholder
  private messagesPairCount: number = 0; // Keep for potential future use (e.g., prompt interval logic)
  private emptyStateEl: HTMLElement | null = null;
  private resizeTimeout: NodeJS.Timeout | null = null;
  private scrollListenerDebounced: () => void;
  private currentMessages: Message[] = []; // Local cache of messages being displayed
  private lastRenderedMessageDate: Date | null = null; // Used for rendering date separators
  private newMessagesIndicatorEl: HTMLElement | null = null;
  private userScrolledUp: boolean = false;
  // Debounced save is REMOVED - saving handled by ChatManager/Chat


  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin;
    if (OllamaView.instance && OllamaView.instance !== this) { console.warn("Replacing existing OllamaView instance."); } OllamaView.instance = this;
    if (!requireApiVersion || !requireApiVersion("1.0.0")) { console.warn("Ollama Plugin: Obsidian API version might be outdated."); }
    this.initSpeechWorker(); // Placeholder
    this.scrollListenerDebounced = debounce(this.handleScroll, 150, true);
  }

  // --- Getters ---
  // getMessagesCount, getMessagesPairCount, getMessages REMOVED - view doesn't own messages
  public isMenuOpen(): boolean { return this.menuDropdown?.style.display === 'block'; }


  // --- Obsidian View Methods ---
  getViewType(): string { return VIEW_TYPE_OLLAMA; }
  getDisplayText(): string { return "Ollama Chat"; } // Could potentially show active chat name later
  getIcon(): string { return "message-square"; }

  async onOpen(): Promise<void> {
    this.createUIElements();
    this.updateInputPlaceholder(this.plugin.settings.modelName); // Initial placeholder
    this.attachEventListeners();
    this.autoResizeTextarea();
    this.updateSendButtonState();

    // Load initial state (active chat, render lists)
    await this.loadAndDisplayActiveChat();
    await Promise.all([this.renderModelList(), this.renderRoleList()]);

    this.inputEl?.focus();
    this.inputEl?.dispatchEvent(new Event('input'));
  }

  async onClose(): Promise<void> {
    console.log("OllamaView onClose: Cleaning up."); /* ... cleanup ... */
    if (this.speechWorker) { this.speechWorker.terminate(); this.speechWorker = null; } this.stopVoiceRecording(false); if (this.audioStream) { this.audioStream.getTracks().forEach(t => t.stop()); this.audioStream = null; } if (this.scrollTimeout) clearTimeout(this.scrollTimeout); if (this.resizeTimeout) clearTimeout(this.resizeTimeout); if (OllamaView.instance === this) { OllamaView.instance = null; }
  }

  // --- UI Creation ---
  private createUIElements(): void {
    // ... (Code remains the same as previous response - creates all containers including model/role lists) ...
    this.contentEl.empty(); this.chatContainerEl = this.contentEl.createDiv({ cls: CSS_CLASS_CONTAINER }); this.chatContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_CHAT_CONTAINER }); this.newMessagesIndicatorEl = this.chatContainerEl.createDiv({ cls: CSS_CLASS_NEW_MESSAGE_INDICATOR }); setIcon(this.newMessagesIndicatorEl.createSpan({ cls: "indicator-icon" }), "arrow-down"); this.newMessagesIndicatorEl.createSpan({ text: " New Messages" }); const inputContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER }); this.inputEl = inputContainer.createEl("textarea", { attr: { placeholder: `Text to ${this.plugin.settings.modelName}...`, rows: 1 } }); this.buttonsContainer = inputContainer.createDiv({ cls: CSS_CLASS_BUTTONS_CONTAINER }); this.sendButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_SEND_BUTTON, attr: { 'aria-label': 'Send' } }); setIcon(this.sendButton, "send"); this.voiceButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_VOICE_BUTTON, attr: { 'aria-label': 'Voice Input' } }); setIcon(this.voiceButton, "mic"); this.menuButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_MENU_BUTTON, attr: { 'aria-label': 'Menu' } }); setIcon(this.menuButton, "more-vertical"); this.menuDropdown = inputContainer.createEl("div", { cls: [CSS_CLASS_MENU_DROPDOWN, "ollama-chat-menu"] }); this.menuDropdown.style.display = "none"; this.menuDropdown.createEl("div", { text: "Select Model", cls: CSS_CLASS_MENU_HEADER }); this.modelListContainerEl = this.menuDropdown.createDiv({ cls: CSS_CLASS_MODEL_LIST_CONTAINER }); this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR }); this.menuDropdown.createEl("div", { text: "Select Role", cls: CSS_CLASS_MENU_HEADER }); this.roleListContainerEl = this.menuDropdown.createDiv({ cls: CSS_CLASS_ROLE_LIST_CONTAINER }); this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR }); this.clearChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLEAR_CHAT_OPTION}` }); setIcon(this.clearChatOption.createEl("span", { cls: "menu-option-icon" }), "trash-2"); this.clearChatOption.createEl("span", { cls: "menu-option-text", text: "Clear Chat" }); this.exportChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_EXPORT_CHAT_OPTION}` }); setIcon(this.exportChatOption.createEl("span", { cls: "menu-option-icon" }), "download"); this.exportChatOption.createEl("span", { cls: "menu-option-text", text: "Export to Markdown" }); this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR }); this.settingsOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_SETTINGS_OPTION}` }); setIcon(this.settingsOption.createEl("span", { cls: "menu-option-icon" }), "settings"); this.settingsOption.createEl("span", { cls: "menu-option-text", text: "Settings" });
  }

  // --- Event Listeners ---
  private attachEventListeners(): void {
    this.inputEl.addEventListener("keydown", this.handleKeyDown);
    this.inputEl.addEventListener('input', this.handleInputForResize);
    this.sendButton.addEventListener("click", this.handleSendClick);
    this.voiceButton.addEventListener("click", this.handleVoiceClick);
    this.menuButton.addEventListener("click", this.handleMenuClick);
    this.settingsOption.addEventListener("click", this.handleSettingsClick);
    this.clearChatOption.addEventListener("click", this.handleClearChatClick);
    this.exportChatOption.addEventListener("click", this.handleExportChatClick);
    this.registerDomEvent(window, 'resize', this.handleWindowResize);
    this.registerEvent(this.app.workspace.on('resize', this.handleWindowResize));
    this.registerDomEvent(document, 'click', this.handleDocumentClickForMenu);
    // Listen for events from the plugin
    this.register(this.plugin.on('model-changed', this.handleModelChange)); // Updates placeholder
    this.register(this.plugin.on('role-changed', this.handleRoleChange)); // Adds system message
    this.register(this.plugin.on('roles-updated', this.handleRolesUpdated)); // Refreshes role menu if open
    this.register(this.plugin.on('active-chat-changed', this.handleActiveChatChanged)); // Load new chat data
    this.register(this.plugin.on('message-added', this.handleMessageAdded)); // Append new message
    this.register(this.plugin.on('messages-cleared', this.handleMessagesCleared)); // Clear view on event

    this.registerDomEvent(document, 'visibilitychange', this.handleVisibilityChange);
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange)); // Handles focus/scroll
    this.registerDomEvent(this.chatContainer, 'scroll', this.scrollListenerDebounced);
    if (this.newMessagesIndicatorEl) { this.registerDomEvent(this.newMessagesIndicatorEl, 'click', this.handleNewMessageIndicatorClick); }
  }

  // --- Event Handlers ---
  private handleKeyDown = (e: KeyboardEvent): void => { if (e.key === "Enter" && !e.shiftKey && !this.isProcessing && !this.sendButton.disabled) { e.preventDefault(); this.sendMessage(); } }
  private handleSendClick = (): void => { if (!this.isProcessing && !this.sendButton.disabled) { this.sendMessage(); } }
  private handleVoiceClick = (): void => { this.toggleVoiceRecognition(); } // Placeholder
  private handleMenuClick = (e: MouseEvent): void => { e.stopPropagation(); const isHidden = !this.isMenuOpen(); if (isHidden) { Promise.all([this.renderModelList(), this.renderRoleList()]); this.menuDropdown.style.display = "block"; this.menuDropdown.style.animation = 'menu-fade-in 0.15s ease-out'; } else { this.menuDropdown.style.display = "none"; } }
  private handleSettingsClick = async (): Promise<void> => { this.closeMenu(); const s = (this.app as any).setting; if (s) { await s.open(); s.openTabById("ollama-chat-plugin"); } else { new Notice("Could not open settings."); } }
  private handleClearChatClick = (): void => { this.closeMenu(); this.plugin.chatManager?.clearActiveChatMessages(); /* Ask manager to clear */ } // Changed

  private handleExportChatClick = async (): Promise<void> => {
    this.closeMenu();
    console.log("[OllamaView] Export to Markdown initiated.");

    // Отримуємо повідомлення з активного чату через ChatManager
    const activeChat = await this.plugin.chatManager?.getActiveChat();

    if (!activeChat || activeChat.messages.length === 0) {
      new Notice("Chat is empty, nothing to export.");
      return;
    }

    try {
      // Передаємо повідомлення активного чату у форматер
      const markdownContent = this.formatChatToMarkdown(activeChat.messages); // <--- Змінено тут

      // Формуємо ім'я файлу
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      // Очищуємо назву чату від символів, неприпустимих у іменах файлів
      const safeChatName = activeChat.metadata.name.replace(/[/\\?%*:|"<>]/g, '-');
      const defaultFileName = `ollama-chat-${safeChatName}-${timestamp}.md`;
      const defaultFolder = this.app.vault.getRoot();

      // Створюємо та зберігаємо файл
      const file = await this.app.vault.create(
        normalizePath(`${defaultFolder.path}/${defaultFileName}`),
        markdownContent
      );
      new Notice(`Chat exported successfully to ${file.path}`);
      console.log(`[OllamaView] Chat exported to ${file.path}`);

    } catch (error) {
      console.error("Error exporting chat to Markdown:", error);
      new Notice("Error exporting chat. Check console for details.");
    }
  }

  private handleDocumentClickForMenu = (e: MouseEvent): void => { if (this.isMenuOpen() && !this.menuButton.contains(e.target as Node) && !this.menuDropdown.contains(e.target as Node)) { this.closeMenu(); } }

  /**
  * Formats a given list of messages into a Markdown string.
  * @param messagesToFormat The array of Message objects to format.
  * @returns A string containing the formatted Markdown.
  */
  private formatChatToMarkdown(messagesToFormat: Message[]): string {
    // Використовуємо локальну змінну для дати, а не this.lastRenderedMessageDate
    let localLastDate: Date | null = null;
    // Додаємо заголовок з інформацією про експорт та поточну дату/час
    const exportTimestamp = new Date();
    let markdown = `# Ollama Chat Export\n` +
      `> Exported on: ${exportTimestamp.toLocaleString('en-US')}\n\n`; // English locale

    messagesToFormat.forEach(message => {
      // --- Логіка роздільника дат ---
      // Перевіряємо відносно localLastDate
      if (localLastDate === null || !this.isSameDay(localLastDate, message.timestamp)) {
        // Додаємо роздільник тільки якщо це не перше повідомлення І дата змінилася
        if (localLastDate !== null) {
          markdown += `***\n`; // Горизонтальна лінія між днями
        }
        markdown += `**${this.formatDateSeparator(message.timestamp)}**\n***\n\n`;
      }
      localLastDate = message.timestamp; // Оновлюємо локальну дату
      // --- Кінець логіки роздільника дат ---

      // Додаємо роль та час
      const time = this.formatTime(message.timestamp);
      switch (message.role) {
        case 'user':
          markdown += `**User (${time}):**\n`;
          break;
        case 'assistant':
          // Додаємо метадані моделі, якщо вони є для цього повідомлення (теоретично)
          // Наразі такої інформації немає, але можна додати в майбутньому
          // const modelInfo = message.model ? ` [${message.model}]` : "";
          markdown += `**Assistant (${time}):**\n`;
          break;
        case 'system':
          // Використовуємо формат цитати для системних повідомлень
          markdown += `> _[System (${time})]_ \n> `;
          break;
        case 'error':
          // Використовуємо формат блоку попередження/помилки Obsidian
          markdown += `> [!ERROR] Error (${time}):\n> `;
          break;
      }

      // Додаємо вміст повідомлення
      let content = message.content.trim(); // Обрізаємо зайві пробіли

      // Якщо це системне повідомлення або помилка, додаємо '>' на початку кожного рядка
      if (message.role === 'system' || message.role === 'error') {
        markdown += content.split('\n').join('\n> ') + "\n\n";
      }
      // Якщо це звичайне повідомлення з кодом, переконуємось у відступах
      else if (content.includes('```')) {
        // Додатково перевіряємо, чи є переноси рядків до/після блоків коду
        content = content.replace(/\n*```/g, "\n```").replace(/```\n*/g, "```\n");
        markdown += content + "\n\n";
      }
      // Для звичайних повідомлень просто додаємо вміст
      else {
        markdown += content + "\n\n";
      }
    });

    return markdown.trim(); // Видаляємо зайві порожні рядки в кінці
  }

  private handleModelChange = (modelName: string): void => {
    this.updateInputPlaceholder(modelName);
    if (this.currentMessages.length > 0) { // Check currentMessages instead of this.messages
      // Додаємо мітку часу
      this.addMessageToDisplay("system", `Model changed to: ${modelName}`, new Date());
    }
  }

  private handleRoleChange = (roleName: string): void => {
    const displayRole = roleName || "Default";
    if (this.currentMessages.length > 0) { // Check currentMessages
      // Додаємо мітку часу
      this.addMessageToDisplay("system", `Role changed to: ${displayRole}`, new Date());
    } else {
      new Notice(`Role set to: ${displayRole}`);
    }
  }
  private handleRolesUpdated = (): void => { if (this.isMenuOpen()) { this.renderRoleList(); } };
  private handleVisibilityChange = (): void => { if (document.visibilityState === 'visible' && this.leaf.view === this) { requestAnimationFrame(() => { this.guaranteedScrollToBottom(50, true); this.adjustTextareaHeight(); }); } }
  private handleActiveLeafChange = (leaf: WorkspaceLeaf | null): void => { if (leaf?.view === this) { this.inputEl?.focus(); setTimeout(() => this.guaranteedScrollToBottom(150, true), 100); } }
  private handleInputForResize = (): void => { if (this.resizeTimeout) clearTimeout(this.resizeTimeout); this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 50); this.updateSendButtonState(); };
  private handleWindowResize = (): void => { if (this.resizeTimeout) clearTimeout(this.resizeTimeout); this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 100); };
  private handleScroll = (): void => { if (!this.chatContainer) return; const t = 150; const bottom = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight < t; if (!bottom) this.userScrolledUp = true; else { this.userScrolledUp = false; this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } }
  private handleNewMessageIndicatorClick = (): void => { this.guaranteedScrollToBottom(50, true); this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); }


  // --- NEW Handlers for ChatManager events ---
  private handleActiveChatChanged = (chatId: string | null): void => { console.log(`[OllamaView] Active chat changed to: ${chatId}`); this.loadAndDisplayActiveChat(); if (this.isMenuOpen()) { this.renderModelList(); this.renderRoleList(); } }
  private handleMessageAdded = (data: { chatId: string, message: Message }): void => { if (data.chatId === this.plugin.chatManager?.getActiveChatId()) { this.addMessageToDisplay(data.message.role, data.message.content, data.message.timestamp); } }
  private handleMessagesCleared = (chatId: string): void => { if (chatId === this.plugin.chatManager?.getActiveChatId()) { console.log("[OllamaView] Clearing display for active chat."); this.clearChatContainerInternal(); this.currentMessages = []; this.showEmptyState(); } }
  // --- END NEW Handlers ---


  // --- UI Update Methods ---
  private updateInputPlaceholder(modelName: string): void { if (this.inputEl) { this.inputEl.placeholder = `Text to ${modelName}...`; } }
  private closeMenu(): void { if (this.menuDropdown) { this.menuDropdown.style.display = "none"; } }
  private autoResizeTextarea(): void { this.adjustTextareaHeight(); }
  private adjustTextareaHeight = (): void => { requestAnimationFrame(() => { if (!this.inputEl || !this.buttonsContainer) return; const vh = this.contentEl.clientHeight; const mh = Math.max(100, vh * 0.50); this.inputEl.style.height = 'auto'; const sh = this.inputEl.scrollHeight; const nh = Math.min(sh, mh); this.inputEl.style.height = `${nh}px`; this.inputEl.classList.toggle(CSS_CLASS_TEXTAREA_EXPANDED, sh > mh); }); }
  private updateSendButtonState(): void { if (!this.inputEl || !this.sendButton) return; const d = this.inputEl.value.trim() === '' || this.isProcessing; this.sendButton.disabled = d; this.sendButton.classList.toggle(CSS_CLASS_DISABLED, d); }
  /**
   * Displays the empty state message if no messages are currently shown.
   */
  public showEmptyState(): void {
    // Перевіряємо локальний кеш 'currentMessages' або чи порожній контейнер
    // Додаємо перевірку !this.emptyStateEl, щоб не створювати його повторно
    if (this.currentMessages.length === 0 && !this.emptyStateEl && this.chatContainer) {
      // Переконуємось, що контейнер справді порожній перед додаванням
      // Це може бути не обов'язково, якщо clearChatContainerInternal завжди викликається перед цим
      this.chatContainer.empty(); // Очищуємо контейнер на випадок залишків

      this.emptyStateEl = this.chatContainer.createDiv({ cls: CSS_CLASS_EMPTY_STATE });
      this.emptyStateEl.createDiv({ cls: "empty-state-message", text: "No messages yet" });
      // Можна показувати поточну модель, якщо вона відома, або загальний текст
      const modelName = this.plugin?.settings?.modelName || "the AI"; // Отримуємо назву моделі
      // Оновлено текст підказки для більшої універсальності
      this.emptyStateEl.createDiv({ cls: "empty-state-tip", text: `Type a message or use the menu options to start.` });
    }
  }

  /**
   * Hides the empty state message if it's currently visible.
   */
  public hideEmptyState(): void {
    if (this.emptyStateEl) {
      this.emptyStateEl.remove();
      this.emptyStateEl = null;
    }
  }
  // --- Message Handling & Rendering ---

  /** Loads the active chat session from ChatManager and displays it */
  async loadAndDisplayActiveChat(): Promise<void> {
    this.clearChatContainerInternal(); // Clear previous content
    this.currentMessages = [];
    this.lastRenderedMessageDate = null;
    this.messagesPairCount = 0; // Reset pair count for this session

    const activeChat = await this.plugin.chatManager?.getActiveChat(); // Get current chat data

    if (activeChat && activeChat.messages.length > 0) {
      this.hideEmptyState();
      this.renderMessages(activeChat.messages); // Render the loaded messages
      this.updateInputPlaceholder(activeChat.metadata.modelName || this.plugin.settings.modelName); // Update placeholder
      this.messagesPairCount = Math.floor(activeChat.messages.filter(m => m.role !== 'system' && m.role !== 'error').length / 2); // Recalculate pair count

      // Check collapsing and scroll after rendering
      this.checkAllMessagesForCollapsing();
      setTimeout(() => { this.guaranteedScrollToBottom(100, true); }, 150);

    } else if (activeChat) {
      // Chat exists but is empty
      this.showEmptyState();
      this.updateInputPlaceholder(activeChat.metadata.modelName || this.plugin.settings.modelName);
    }
    else {
      // No active chat found or failed to load
      this.showEmptyState();
      this.updateInputPlaceholder(this.plugin.settings.modelName); // Fallback placeholder
      console.warn("[OllamaView] No active chat to display.");
    }
  }

  /** Renders a list of messages to the chat container */
  private renderMessages(messagesToRender: Message[]): void {
    this.clearChatContainerInternal(); // Ensure container is empty first
    this.currentMessages = [...messagesToRender]; // Update local cache
    this.lastRenderedMessageDate = null; // Reset date separator logic

    messagesToRender.forEach(message => {
      // Call the refined renderMessage function for each message
      this.renderMessageInternal(message, messagesToRender);
    });
  }

  /** Appends a single message to the display (used by handleMessageAdded) */
  addMessageToDisplay(role: MessageRole, content: string, timestamp: Date): void {
    const newMessage: Message = { role, content, timestamp };
    // Не додаємо до this.messages напряму, керування в ChatManager
    // this.currentMessages.push(newMessage); // Додаємо до локального кешу для рендерингу

    // Рендеримо нове повідомлення
    const messageEl = this.renderMessageInternal(newMessage, [...this.currentMessages, newMessage]); // Передаємо оновлений контекст для renderMessageInternal

    // Оновлюємо локальний кеш ПІСЛЯ рендерингу, щоб renderMessageInternal мав правильний previousMessage
    this.currentMessages.push(newMessage);

    if (messageEl) {
      this.checkMessageForCollapsing(messageEl); // Check height
    }

    // Обробка прокрутки/індикатора
    if (role !== "user" && this.userScrolledUp && this.newMessagesIndicatorEl) {
      this.newMessagesIndicatorEl.classList.add(CSS_CLASS_VISIBLE);
    } else if (!this.userScrolledUp) {
      const forceScroll = role !== "user";
      this.guaranteedScrollToBottom(forceScroll ? 100 : 50, forceScroll);
    }
    this.hideEmptyState();
  }


  // saveMessageHistory REMOVED - Handled by Chat/ChatManager
  // sendMessage MODIFIED - Calls OllamaService via plugin
  async sendMessage(): Promise<void> {
    const content = this.inputEl.value.trim();
    if (!content || this.isProcessing || this.sendButton.disabled) return;

    // Переконуємося, що є активний чат
    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat) {
      new Notice("Error: No active chat session found.");
      return;
    }

    const userMessageContent = this.inputEl.value;
    this.clearInputField();
    this.setLoadingState(true);
    this.hideEmptyState();

    try {
      // 1. Додаємо повідомлення користувача до ChatManager (він генерує timestamp)
      const userMessage = await this.plugin.chatManager.addMessageToActiveChat('user', userMessageContent);
      if (!userMessage) throw new Error("Failed to add user message.");
      // View оновить себе через подію 'message-added', яка спрацює з ChatManager

      // 2. Викликаємо OllamaService для отримання відповіді
      // Передаємо весь об'єкт activeChat, щоб сервіс мав доступ до історії та метаданих
      const assistantMessage = await this.plugin.ollamaService.generateChatResponse(activeChat);

      // 3. Додаємо повідомлення асистента до ChatManager
      if (assistantMessage) {
        // --- ЗМІНЕНО ТУТ: Передаємо лише role та content ---
        await this.plugin.chatManager.addMessageToActiveChat(assistantMessage.role, assistantMessage.content);
        // ----------------------------------------------------
        // View оновить себе через подію 'message-added'
      } else {
        console.warn("[OllamaView] Service returned null assistant message.");
        // Додаємо помилку у View напряму (тут timestamp потрібен)
        this.addMessageToDisplay("error", "Assistant did not provide a response.", new Date());
      }

    } catch (error: any) {
      console.error("OllamaView: Send/receive cycle error:", error);
      // Додаємо помилку у View напряму (тут timestamp потрібен)
      this.addMessageToDisplay("error", `Error: ${error.message || 'Unknown error.'}`, new Date());
    } finally {
      this.setLoadingState(false);
      this.focusInput(); // Повертаємо фокус після завершення
    }
  }

  // internalAddMessage REMOVED - use addMessageToDisplay or ChatManager

  // --- Rendering Logic ---
  /** Renders a single message bubble based on the provided message object and context */
  private renderMessageInternal(message: Message, messageContext: Message[]): HTMLElement | null {
    const messageIndex = messageContext.findIndex(m => m === message); // Find index in the current context
    if (messageIndex === -1) return null;

    const prevMessage = messageIndex > 0 ? messageContext[messageIndex - 1] : null;
    const isNewDay = !this.lastRenderedMessageDate || !this.isSameDay(this.lastRenderedMessageDate, message.timestamp);

    // --- Date Separator Logic ---
    if (isNewDay) {
      this.renderDateSeparator(message.timestamp);
      this.lastRenderedMessageDate = message.timestamp;
    } else if (messageIndex === 0 && !this.lastRenderedMessageDate) {
      // Set date for the very first message if not already set
      this.lastRenderedMessageDate = message.timestamp;
    }

    let messageGroup: HTMLElement | null = null;
    let groupClass = CSS_CLASS_MESSAGE_GROUP;
    let messageClass = `${CSS_CLASS_MESSAGE} ${CSS_CLASS_MESSAGE_ARRIVING}`; // Add arriving animation class
    let showAvatar = true; // Show avatars by default for user/assistant
    let isUser = false;

    const isFirstInGroup = !prevMessage || prevMessage.role !== message.role || isNewDay;

    // Determine CSS classes based on role
    switch (message.role) {
      case "user": groupClass += ` ${CSS_CLASS_USER_GROUP}`; messageClass += ` ${CSS_CLASS_USER_MESSAGE}`; isUser = true; break;
      case "assistant": groupClass += ` ${CSS_CLASS_OLLAMA_GROUP}`; messageClass += ` ${CSS_CLASS_OLLAMA_MESSAGE}`; break;
      case "system": groupClass += ` ${CSS_CLASS_SYSTEM_GROUP}`; messageClass += ` ${CSS_CLASS_SYSTEM_MESSAGE}`; showAvatar = false; break; // No avatar for system
      case "error": groupClass += ` ${CSS_CLASS_ERROR_GROUP}`; messageClass += ` ${CSS_CLASS_ERROR_MESSAGE}`; showAvatar = false; break; // No avatar for error
    }

    // Find or create message group container
    const lastElement = this.chatContainer.lastElementChild as HTMLElement;
    if (isFirstInGroup || !lastElement || !lastElement.matches(`.${groupClass.split(' ')[1]}`)) {
      messageGroup = this.chatContainer.createDiv({ cls: groupClass });
      if (showAvatar) {
        this.renderAvatar(messageGroup, isUser);
      }
    } else {
      messageGroup = lastElement;
    }

    // Create message element and content containers
    const messageEl = messageGroup.createDiv({ cls: messageClass });
    const contentContainer = messageEl.createDiv({ cls: CSS_CLASS_CONTENT_CONTAINER });
    const contentEl = contentContainer.createDiv({ cls: CSS_CLASS_CONTENT });

    // Render content based on role
    switch (message.role) {
      case "assistant":
      case "user":
        contentEl.addClass(CSS_CLASS_CONTENT_COLLAPSIBLE); // Add class for potential collapsing
        if (message.role === 'assistant') {
          this.renderAssistantContent(contentEl, message.content);
        } else {
          // Render user text, preserving line breaks
          message.content.split("\n").forEach((line, index, array) => {
            contentEl.appendText(line);
            if (index < array.length - 1) contentEl.createEl("br");
          });
        }
        break;
      case "system":
        setIcon(contentEl.createSpan({ cls: CSS_CLASS_SYSTEM_ICON }), "info");
        contentEl.createSpan({ cls: CSS_CLASS_SYSTEM_TEXT, text: message.content });
        break;
      case "error":
        setIcon(contentEl.createSpan({ cls: CSS_CLASS_ERROR_ICON }), "alert-triangle");
        contentEl.createSpan({ cls: CSS_CLASS_ERROR_TEXT, text: message.content });
        break;
    }

    // Add copy button (not for system messages)
    if (message.role !== "system") {
      const copyBtn = contentContainer.createEl("button", { cls: CSS_CLASS_COPY_BUTTON, attr: { title: "Copy" } });
      setIcon(copyBtn, "copy");
      this.registerDomEvent(copyBtn, "click", () => this.handleCopyClick(message.content, copyBtn)); // Use registerDomEvent
    }

    // Add timestamp
    messageEl.createDiv({ cls: CSS_CLASS_TIMESTAMP, text: this.formatTime(message.timestamp) });

    // Remove animation class after delay
    setTimeout(() => messageEl.classList.remove(CSS_CLASS_MESSAGE_ARRIVING), 500);

    return messageEl; // Return the created element
  }

  // renderAvatar, renderAssistantContent, addCodeBlockEnhancements etc. remain the same
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

  // FIXME: bla
  private handleCopyClick(content: string, buttonEl: HTMLElement): void { let t = content; if (this.detectThinkingTags(this.decodeHtmlEntities(content)).hasThinkingTags) { t = this.decodeHtmlEntities(content).replace(/<think>[\s\S]*?<\/think>/g, "").trim(); } navigator.clipboard.writeText(t).then(() => { setIcon(buttonEl, "check"); buttonEl.setAttribute("title", "Copied!"); setTimeout(() => { setIcon(buttonEl, "copy"); buttonEl.setAttribute("title", "Copy"); }, 2000); }).catch(err => { console.error("Copy failed:", err); new Notice("Failed to copy."); }); }
  private processThinkingTags(content: string): string { const r = /<think>([\s\S]*?)<\/think>/g; let i = 0; const p: string[] = []; let m; while ((m = r.exec(content)) !== null) { if (m.index > i) p.push(this.markdownToHtml(content.substring(i, m.index))); const c = m[1]; const h = `<div class="${CSS_CLASS_THINKING_BLOCK}"><div class="${CSS_CLASS_THINKING_HEADER}" data-fold-state="folded"><div class="${CSS_CLASS_THINKING_TOGGLE}">►</div><div class="${CSS_CLASS_THINKING_TITLE}">Thinking</div></div><div class="${CSS_CLASS_THINKING_CONTENT}" style="display: none;">${this.markdownToHtml(c)}</div></div>`; p.push(h); i = r.lastIndex; } if (i < content.length) p.push(this.markdownToHtml(content.substring(i))); return p.join(""); }
  private markdownToHtml(markdown: string): string { if (!markdown?.trim()) return ""; const d = document.createElement("div"); MarkdownRenderer.renderMarkdown(markdown, d, this.app.workspace.getActiveFile()?.path ?? "", this); return d.innerHTML; }
  private addThinkingToggleListeners(contentEl: HTMLElement): void { const h = contentEl.querySelectorAll<HTMLElement>(`.${CSS_CLASS_THINKING_HEADER}`); h.forEach(hdr => { hdr.addEventListener("click", () => { const c = hdr.nextElementSibling as HTMLElement; const t = hdr.querySelector<HTMLElement>(`.${CSS_CLASS_THINKING_TOGGLE}`); if (!c || !t) return; const f = hdr.getAttribute("data-fold-state") === "folded"; if (f) { c.style.display = "block"; t.textContent = "▼"; hdr.setAttribute("data-fold-state", "expanded"); } else { c.style.display = "none"; t.textContent = "►"; hdr.setAttribute("data-fold-state", "folded"); } }); }); }
  private decodeHtmlEntities(text: string): string { if (typeof document === 'undefined') return text; const ta = document.createElement("textarea"); ta.innerHTML = text; return ta.value; }
  private detectThinkingTags(content: string): { hasThinkingTags: boolean; format: string } { return /<think>[\s\S]*?<\/think>/gi.test(content) ? { hasThinkingTags: true, format: "standard" } : { hasThinkingTags: false, format: "none" }; }


  // --- Menu List Rendering ---
  /**
   * Fetches available models and renders them as selectable options in the menu dropdown.
   * Marks the currently active chat's model with a checkmark.
   * Updates the active chat's model setting on click.
   */
  private async renderModelList(): Promise<void> {
    if (!this.modelListContainerEl) {
      console.error("[OllamaView] Model list container not found for rendering.");
      return; // Guard clause if container doesn't exist
    }

    this.modelListContainerEl.empty(); // Clear previous list/loading state
    // Show loading indicator immediately
    this.modelListContainerEl.createEl("span", { text: "Loading models..." });

    // Icon mapping for common models (using Obsidian icon names)
    const modelIconMap: Record<string, string> = {
      'llama': 'box-minimal', // Generic box for Llama family
      'mistral': 'wind',
      'mixtral': 'blend',
      'codellama': 'code',
      'code': 'code', // For models just named 'code...'
      'phi': 'sigma', // Greek letter Phi
      'phi3': 'sigma',
      'gemma': 'gem',
      'command-r': 'terminal', // Command prompt icon
      'llava': 'image', // For multi-modal
      'star': 'star', // For Starcoder etc.
      'wizard': 'wand', // For WizardLM etc.
      'hermes': 'message-circle', // For Hermes etc.
      'dolphin': 'anchor', // For Dolphin etc. (just an example)
      // Add more mappings here as needed
    };
    const defaultIcon = 'box'; // Default icon if no specific match

    try {
      // Get models from the OllamaService
      const models = await this.plugin.ollamaService.getModels(); // Use OllamaService
      this.modelListContainerEl.empty(); // Clear "Loading..."

      // Get the currently active chat to determine the selected model
      // Use optional chaining for safety
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      // Use the model from active chat's metadata, or fallback to global setting if no active chat
      const currentModelName = activeChat?.metadata?.modelName || this.plugin.settings.modelName;

      if (models.length === 0) {
        this.modelListContainerEl.createEl("span", { text: "No models available." });
        return;
      }

      // Render each model as an option
      models.forEach(modelName => {
        const modelOptionEl = this.modelListContainerEl.createDiv({
          cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MODEL_OPTION}`
        });
        const iconSpan = modelOptionEl.createEl("span", { cls: "menu-option-icon" });
        let iconToUse = defaultIcon;

        // Set checkmark or appropriate icon
        if (modelName === currentModelName) {
          iconToUse = "check";
          modelOptionEl.addClass("is-selected");
        } else {
          const lowerModelName = modelName.toLowerCase();
          let foundIcon = false;
          for (const key in modelIconMap) {
            if (lowerModelName.includes(key)) {
              iconToUse = modelIconMap[key];
              foundIcon = true;
              break; // Use first match
            }
          }
          if (!foundIcon) {
            iconToUse = defaultIcon;
          }
        }
        // Set the icon, handling potential errors if icon ID is invalid
        try { setIcon(iconSpan, iconToUse); }
        catch (e) {
          console.warn(`[OllamaView] Could not set icon '${iconToUse}' for model ${modelName}`);
          iconSpan.style.minWidth = "18px"; // Ensure alignment even if icon fails
        }

        // Add model name text
        modelOptionEl.createEl("span", { cls: "menu-option-text", text: modelName });

        // --- ЗМІНЕНО ТУТ: Обробник кліку ---
        // Add click handler to update the *active chat's* model via ChatManager
        this.registerDomEvent(modelOptionEl, 'click', async () => {
          const currentActiveChatOnClick = await this.plugin.chatManager?.getActiveChat(); // Get fresh active chat state
          const currentActiveModelOnClick = currentActiveChatOnClick?.metadata?.modelName || this.plugin.settings.modelName;

          if (modelName !== currentActiveModelOnClick) { // Only update if changed
            console.log(`[OllamaView] Model selected via menu for active chat: ${modelName}`);
            if (this.plugin.chatManager && currentActiveChatOnClick) {
              // Update metadata via ChatManager (this should handle saving the chat file)
              await this.plugin.chatManager.updateActiveChatMetadata({ modelName: modelName });
              // Emit event for other UI updates (like placeholder) handled by handleModelChange
              this.plugin.emit('model-changed', modelName);
            } else {
              console.error("[OllamaView] Cannot update model - no active chat found via ChatManager.");
              new Notice("Error: Could not find active chat to update model.");
            }
          }
          this.closeMenu(); // Close menu regardless
        });
        // --- КІНЕЦЬ ЗМІН ---
      });

    } catch (error) {
      console.error("Error loading models for menu:", error);
      this.modelListContainerEl.empty();
      this.modelListContainerEl.createEl("span", { text: "Error loading models." });
    }
  }

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

  // --- Speech Recognition Placeholders ---
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
  private clearChatContainerInternal(): void { this.currentMessages = []; this.lastRenderedMessageDate = null; if (this.chatContainer) this.chatContainer.empty(); this.hideEmptyState(); }
  public clearDisplayAndState(): void { this.clearChatContainerInternal(); this.showEmptyState(); this.updateSendButtonState(); setTimeout(() => { this.inputEl?.focus(); console.log("OllamaView: Input focus attempted after clear."); }, 50); console.log("OllamaView: Display and internal state cleared."); }
  public addLoadingIndicator(): HTMLElement { this.hideEmptyState(); const g = this.chatContainer.createDiv({ cls: `${CSS_CLASS_MESSAGE_GROUP} ${CSS_CLASS_OLLAMA_GROUP}` }); this.renderAvatar(g, false); const m = g.createDiv({ cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_OLLAMA_MESSAGE}` }); const d = m.createDiv({ cls: CSS_CLASS_THINKING_DOTS }); for (let i = 0; i < 3; i++)d.createDiv({ cls: CSS_CLASS_THINKING_DOT }); this.guaranteedScrollToBottom(50, true); return g; }
  public removeLoadingIndicator(loadingEl: HTMLElement | null): void { if (loadingEl?.parentNode) { loadingEl.remove(); } }
  public scrollToBottom(): void { this.guaranteedScrollToBottom(50, true); }
  public clearInputField(): void { if (this.inputEl) { this.inputEl.value = ""; this.inputEl.dispatchEvent(new Event('input')); } }
  public focusInput(): void { setTimeout(() => { this.inputEl?.focus(); }, 0); } // Public focus method
  guaranteedScrollToBottom(delay = 50, forceScroll = false): void { if (this.scrollTimeout) { clearTimeout(this.scrollTimeout); this.scrollTimeout = null; } /* console.log(`[OllamaView] GScroll requested. Delay:${delay}, Force:${forceScroll}, UserScrolledUp:${this.userScrolledUp}`); */ this.scrollTimeout = setTimeout(() => { requestAnimationFrame(() => { if (this.chatContainer) { const t = 100; const sT = this.chatContainer.scrollTop; const sH = this.chatContainer.scrollHeight; const cH = this.chatContainer.clientHeight; const isUp = sH - sT - cH > t; if (isUp !== this.userScrolledUp) { this.userScrolledUp = isUp; if (!isUp) this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } if (forceScroll || !this.userScrolledUp || this.isProcessing) { /* console.log(`[OllamaView] Scrolling. Force:${forceScroll}, ScrolledUp:${this.userScrolledUp}, Processing:${this.isProcessing}`); */ this.chatContainer.scrollTop = sH; if (forceScroll || this.isProcessing) { if (this.userScrolledUp) { } this.userScrolledUp = false; this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } } else { /* console.log(`[OllamaView] Scroll skipped.`); */ } } else { console.warn("[OllamaView] GScroll: chatContainer not found."); } }); this.scrollTimeout = null; }, delay); }
  formatTime(date: Date): string { return date.toLocaleTimeString('en-US', { hour: "2-digit", minute: "2-digit" }); }
  formatDateSeparator(date: Date): string { const n = new Date(); const y = new Date(n); y.setDate(n.getDate() - 1); if (this.isSameDay(date, n)) return "Today"; else if (this.isSameDay(date, y)) return "Yesterday"; else return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
  isSameDay(date1: Date, date2: Date): boolean { return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate(); }
  public setLoadingState(isLoading: boolean): void { this.isProcessing = isLoading; if (this.inputEl) this.inputEl.disabled = isLoading; this.updateSendButtonState(); if (this.voiceButton) { this.voiceButton.disabled = isLoading; this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } if (this.menuButton) { this.menuButton.disabled = isLoading; this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } }

} // END OF OllamaView CLASS