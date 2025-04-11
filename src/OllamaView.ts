// OllamaView.ts
import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  MarkdownRenderer,
  Notice,
  debounce,
  // requireApiVersion, // Можна видалити, якщо не використовуєте
  normalizePath,
  // Menu, // НЕ використовуємо Menu API
  TFolder,
  TFile
} from "obsidian";
import { ConfirmModal } from './ConfirmModal'; // Наші кастомні модалки
import { PromptModal } from './PromptModal';
import OllamaPlugin from "./main"; // Головний клас плагіна
import { AvatarType } from "./settings"; // Типи налаштувань
import { RoleInfo } from "./ChatManager"; // Тип RoleInfo
import { Chat, ChatMetadata } from "./Chat"; // Клас Chat та типи

// --- View Type ID ---
export const VIEW_TYPE_OLLAMA_PERSONAS = "ollama-personas-chat-view"; // Оновлений ID

// --- CSS Classes ---
// Додаємо класи для акордеон-меню
const CSS_CLASS_CONTAINER = "ollama-container";
const CSS_CLASS_CHAT_CONTAINER = "ollama-chat-container";
const CSS_CLASS_INPUT_CONTAINER = "chat-input-container";
const CSS_CLASS_BUTTONS_CONTAINER = "buttons-container";
const CSS_CLASS_SEND_BUTTON = "send-button";
const CSS_CLASS_VOICE_BUTTON = "voice-button";
const CSS_CLASS_TRANSLATE_INPUT_BUTTON = "translate-input-button";
const CSS_CLASS_TRANSLATING_INPUT = "translating-input";
const CSS_CLASS_MENU_BUTTON = "menu-button";
const CSS_CLASS_MENU_DROPDOWN = "menu-dropdown"; // Основний контейнер меню
const CSS_CLASS_MENU_OPTION = "menu-option"; // Для всіх клікабельних пунктів
const CSS_CLASS_MENU_HEADER_ITEM = "menu-header-item"; // Клікабельний заголовок "підменю"
const CSS_CLASS_SUBMENU_ICON = "submenu-icon"; // Іконка стрілки >/v
const CSS_CLASS_SUBMENU_CONTENT = "submenu-content"; // Контейнер для списку "підменю"
const CSS_CLASS_SUBMENU_CONTENT_HIDDEN = "submenu-content-hidden"; // Клас для прихованого контейнера
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
const CSS_CLASS_TRANSLATE_BUTTON = "translate-button";
const CSS_CLASS_TRANSLATION_CONTAINER = "translation-container";
const CSS_CLASS_TRANSLATION_CONTENT = "translation-content";
const CSS_CLASS_TRANSLATION_PENDING = "translation-pending";
const CSS_CLASS_BUTTON_SPACER = "button-spacer";
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
const CSS_CLASS_EXPORT_CHAT_OPTION = "export-chat-option";
const CSS_CLASS_CONTENT_COLLAPSIBLE = "message-content-collapsible";
const CSS_CLASS_CONTENT_COLLAPSED = "message-content-collapsed";
const CSS_CLASS_SHOW_MORE_BUTTON = "show-more-button";
const CSS_CLASS_MODEL_OPTION = "model-option"; // Стиль для елементів списку
const CSS_CLASS_MODEL_LIST_CONTAINER = "model-list-container"; // Специфічний клас для контейнера
const CSS_CLASS_ROLE_OPTION = "role-option";
const CSS_CLASS_ROLE_LIST_CONTAINER = "role-list-container";
const CSS_CLASS_CHAT_OPTION = "chat-option";
const CSS_CLASS_CHAT_LIST_CONTAINER = "chat-list-container";
const CSS_CLASS_MENU_HEADER = "menu-header"; // НЕ клікабельний заголовок секції
const CSS_CLASS_NEW_CHAT_OPTION = "new-chat-option";
const CSS_CLASS_RENAME_CHAT_OPTION = "rename-chat-option";
const CSS_CLASS_DELETE_CHAT_OPTION = "delete-chat-option";
const CSS_CLASS_CLONE_CHAT_OPTION = "clone-chat-option";
const CSS_CLASS_DANGER_OPTION = "danger-option"; // Для небезпечних дій

// --- Message Types ---
export type MessageRole = "user" | "assistant" | "system" | "error";
export interface Message { role: MessageRole; content: string; timestamp: Date; }
const LANGUAGES: Record<string, string> = { /* ... ваш список мов ... */ "en": "English", "uk": "Ukrainian", "de": "German" };

export class OllamaView extends ItemView {
  // --- Properties ---
  private readonly plugin: OllamaPlugin;
  private chatContainerEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private chatContainer!: HTMLElement;
  private sendButton!: HTMLButtonElement;
  private voiceButton!: HTMLButtonElement;
  private translateInputButton!: HTMLButtonElement;
  private menuButton!: HTMLButtonElement;
  private buttonsContainer!: HTMLElement;

  // Повертаємо властивості для кастомного меню
  private menuDropdown!: HTMLElement; // Головний контейнер меню
  private modelSubmenuHeader!: HTMLElement;
  private modelSubmenuContent!: HTMLElement;
  private roleSubmenuHeader!: HTMLElement;
  private roleSubmenuContent!: HTMLElement;
  private chatSubmenuHeader!: HTMLElement;
  private chatSubmenuContent!: HTMLElement;
  private newChatOption!: HTMLElement;
  private renameChatOption!: HTMLElement;
  private cloneChatOption!: HTMLElement;
  private clearChatOption!: HTMLElement;
  private exportChatOption!: HTMLElement;
  private deleteChatOption!: HTMLElement;
  private settingsOption!: HTMLElement;

  // --- State ---
  private isProcessing: boolean = false;
  private scrollTimeout: NodeJS.Timeout | null = null;
  private speechWorker: Worker | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private emptyStateEl: HTMLElement | null = null;
  private resizeTimeout: NodeJS.Timeout | null = null;
  private scrollListenerDebounced: () => void;
  private currentMessages: Message[] = [];
  private lastRenderedMessageDate: Date | null = null;
  private newMessagesIndicatorEl: HTMLElement | null = null;
  private userScrolledUp: boolean = false;

  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.initSpeechWorker();
    this.scrollListenerDebounced = debounce(this.handleScroll, 150, true);
    console.log("[OllamaView] Constructed.");
  }

  // --- Getters ---
  public isMenuOpen(): boolean { // Перевіряємо видимість нашого div-меню
    return this.menuDropdown?.style.display === 'block';
  }

  // --- Obsidian View Methods ---
  getViewType(): string { return VIEW_TYPE_OLLAMA_PERSONAS; }
  getDisplayText(): string { return "Ollama Personas"; }
  getIcon(): string { return "message-square"; }

  async onOpen(): Promise<void> {
    console.log("[OllamaView] onOpen called.");
    this.createUIElements();
    this.updateInputPlaceholder(this.plugin.settings.modelName);
    this.attachEventListeners();
    this.autoResizeTextarea();
    this.updateSendButtonState();
    try {
      await this.loadAndDisplayActiveChat();
    } catch (error) {
      console.error("[OllamaView] Error during initial chat load:", error);
      this.showEmptyState();
    }
    setTimeout(() => this.inputEl?.focus(), 150);
    this.inputEl?.dispatchEvent(new Event('input'));
  }

  async onClose(): Promise<void> {
    console.log("[OllamaView] onClose: Cleaning up...");
    if (this.speechWorker) { this.speechWorker.terminate(); this.speechWorker = null; }
    this.stopVoiceRecording(false);
    if (this.audioStream) { this.audioStream.getTracks().forEach(t => t.stop()); this.audioStream = null; }
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
  }

  // --- UI Creation (with Custom Div Menu & Accordion) ---
  private createUIElements(): void {
    this.contentEl.empty();
    this.chatContainerEl = this.contentEl.createDiv({ cls: CSS_CLASS_CONTAINER });
    this.chatContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_CHAT_CONTAINER });
    this.newMessagesIndicatorEl = this.chatContainerEl.createDiv({ cls: CSS_CLASS_NEW_MESSAGE_INDICATOR });
    setIcon(this.newMessagesIndicatorEl.createSpan({ cls: "indicator-icon" }), "arrow-down");
    this.newMessagesIndicatorEl.createSpan({ text: " New Messages" });

    const inputContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER });
    this.inputEl = inputContainer.createEl("textarea", { attr: { placeholder: `Text...`, rows: 1 } });
    this.buttonsContainer = inputContainer.createDiv({ cls: CSS_CLASS_BUTTONS_CONTAINER });

    // Input Buttons
    this.sendButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_SEND_BUTTON, attr: { 'aria-label': 'Send' } }); setIcon(this.sendButton, "send");
    this.voiceButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_VOICE_BUTTON, attr: { 'aria-label': 'Voice Input' } }); setIcon(this.voiceButton, "mic");
    this.translateInputButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_TRANSLATE_INPUT_BUTTON, attr: { 'aria-label': 'Translate input to English' } }); setIcon(this.translateInputButton, "replace"); this.translateInputButton.title = "Translate input to English";
    this.menuButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_MENU_BUTTON, attr: { 'aria-label': 'Menu' } }); setIcon(this.menuButton, "more-vertical");

    // --- Custom Menu Dropdown Structure (Accordion Style) ---
    this.menuDropdown = inputContainer.createEl("div", { cls: [CSS_CLASS_MENU_DROPDOWN, "ollama-chat-menu"] });
    this.menuDropdown.style.display = "none"; // Initially hidden

    // Helper function to create submenu sections
    const createSubmenuSection = (title: string, icon: string, listContainerClass: string): { header: HTMLElement, content: HTMLElement } => {
      // Clickable Header
      const header = this.menuDropdown.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MENU_HEADER_ITEM}` });
      setIcon(header.createSpan({ cls: "menu-option-icon" }), icon);
      header.createSpan({ cls: "menu-option-text", text: title });
      setIcon(header.createSpan({ cls: CSS_CLASS_SUBMENU_ICON }), "chevron-right"); // Initial state: collapsed

      // Content Container (initially hidden)
      const content = this.menuDropdown.createDiv({ cls: `${CSS_CLASS_SUBMENU_CONTENT} ${CSS_CLASS_SUBMENU_CONTENT_HIDDEN} ${listContainerClass}` });
      content.style.maxHeight = '0';
      content.style.overflow = 'hidden';
      content.style.transition = 'max-height 0.3s ease-out, padding 0.3s ease-out'; // Add padding transition
      content.style.paddingTop = '0';
      content.style.paddingBottom = '0';

      return { header, content };
    };

    // Create sections using the helper
    const modelSection = createSubmenuSection("Select Model", "list-collapse", CSS_CLASS_MODEL_LIST_CONTAINER);
    this.modelSubmenuHeader = modelSection.header;
    this.modelSubmenuContent = modelSection.content;

    const roleSection = createSubmenuSection("Select Role", "users", CSS_CLASS_ROLE_LIST_CONTAINER);
    this.roleSubmenuHeader = roleSection.header;
    this.roleSubmenuContent = roleSection.content;

    const chatSection = createSubmenuSection("Load Chat", "messages-square", CSS_CLASS_CHAT_LIST_CONTAINER);
    this.chatSubmenuHeader = chatSection.header;
    this.chatSubmenuContent = chatSection.content;

    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    // Action items (Directly in the menu)
    this.menuDropdown.createEl("div", { text: "Actions", cls: CSS_CLASS_MENU_HEADER });
    this.newChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_NEW_CHAT_OPTION}` }); setIcon(this.newChatOption.createSpan({ cls: "menu-option-icon" }), "plus-circle"); this.newChatOption.createSpan({ cls: "menu-option-text", text: "New Chat" });
    this.renameChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_RENAME_CHAT_OPTION}` }); setIcon(this.renameChatOption.createSpan({ cls: "menu-option-icon" }), "pencil"); this.renameChatOption.createSpan({ cls: "menu-option-text", text: "Rename Chat" });
    this.cloneChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLONE_CHAT_OPTION}` }); setIcon(this.cloneChatOption.createSpan({ cls: "menu-option-icon" }), "copy-plus"); this.cloneChatOption.createSpan({ cls: "menu-option-text", text: "Clone Chat" });
    this.exportChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_EXPORT_CHAT_OPTION}` }); setIcon(this.exportChatOption.createSpan({ cls: "menu-option-icon" }), "download"); this.exportChatOption.createSpan({ cls: "menu-option-text", text: "Export Chat" });

    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    // Danger Zone
    this.clearChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLEAR_CHAT_OPTION} ${CSS_CLASS_DANGER_OPTION}` }); setIcon(this.clearChatOption.createSpan({ cls: "menu-option-icon" }), "trash"); this.clearChatOption.createSpan({ cls: "menu-option-text", text: "Clear Messages" });
    this.deleteChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_DELETE_CHAT_OPTION} ${CSS_CLASS_DANGER_OPTION}` }); setIcon(this.deleteChatOption.createSpan({ cls: "menu-option-icon" }), "trash-2"); this.deleteChatOption.createSpan({ cls: "menu-option-text", text: "Delete Chat" });

    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    // Settings
    this.settingsOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_SETTINGS_OPTION}` }); setIcon(this.settingsOption.createSpan({ cls: "menu-option-icon" }), "settings"); this.settingsOption.createSpan({ cls: "menu-option-text", text: "Settings" });
    // --- End Custom Menu ---
  }

  // --- Event Listeners (with Custom Div Menu) ---
  private attachEventListeners(): void {
    // Input area listeners
    this.inputEl.addEventListener("keydown", this.handleKeyDown);
    this.inputEl.addEventListener('input', this.handleInputForResize);

    // Button listeners
    this.sendButton.addEventListener("click", this.handleSendClick);
    this.voiceButton.addEventListener("click", this.handleVoiceClick);
    this.translateInputButton.addEventListener("click", this.handleTranslateInputClick);
    this.menuButton.addEventListener("click", this.handleMenuClick); // Toggles main dropdown

    // --- Listeners for Custom Menu Items ---
    // Submenu Headers (for expanding/collapsing)
    this.registerDomEvent(this.modelSubmenuHeader, 'click', () => this.toggleSubmenu(this.modelSubmenuHeader, this.modelSubmenuContent, 'models'));
    this.registerDomEvent(this.roleSubmenuHeader, 'click', () => this.toggleSubmenu(this.roleSubmenuHeader, this.roleSubmenuContent, 'roles'));
    this.registerDomEvent(this.chatSubmenuHeader, 'click', () => this.toggleSubmenu(this.chatSubmenuHeader, this.chatSubmenuContent, 'chats'));

    // Action Items
    this.settingsOption.addEventListener("click", this.handleSettingsClick);
    this.clearChatOption.addEventListener("click", this.handleClearChatClick);
    this.exportChatOption.addEventListener("click", this.handleExportChatClick);
    this.newChatOption.addEventListener("click", this.handleNewChatClick);
    this.renameChatOption.addEventListener("click", this.handleRenameChatClick);
    this.cloneChatOption.addEventListener("click", this.handleCloneChatClick);
    this.deleteChatOption.addEventListener("click", this.handleDeleteChatClick);
    // --- End Custom Menu Listeners ---

    // Window/Workspace/Document listeners
    this.registerDomEvent(window, 'resize', this.handleWindowResize);
    this.registerEvent(this.app.workspace.on('resize', this.handleWindowResize));
    this.registerDomEvent(document, 'click', this.handleDocumentClickForMenu); // Close menu on outside click
    this.registerDomEvent(document, 'visibilitychange', this.handleVisibilityChange);
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange));
    this.registerDomEvent(this.chatContainer, 'scroll', this.scrollListenerDebounced);
    if (this.newMessagesIndicatorEl) {
      this.registerDomEvent(this.newMessagesIndicatorEl, 'click', this.handleNewMessageIndicatorClick);
    }

    // Plugin/ChatManager Event Listeners
    this.register(this.plugin.on('model-changed', this.handleModelChange));
    this.register(this.plugin.on('role-changed', this.handleRoleChange));
    this.register(this.plugin.on('roles-updated', this.handleRolesUpdated));
    this.register(this.plugin.on('active-chat-changed', this.handleActiveChatChanged));
    this.register(this.plugin.on('message-added', this.handleMessageAdded));
    this.register(this.plugin.on('messages-cleared', this.handleMessagesCleared));
    this.register(this.plugin.on('chat-list-updated', this.handleChatListUpdated));
  }

  // --- Event Handlers ---

  // Input & Sending
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
  private handleInputForResize = (): void => {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      this.adjustTextareaHeight();
      this.updateSendButtonState();
    }, 50);
  };

  // Input Area Buttons
  private handleVoiceClick = (): void => { this.toggleVoiceRecognition(); }
  private handleTranslateInputClick = async (): Promise<void> => { /* ... (logic is unchanged) ... */ }

  // Menu Button Click (Toggles Custom Div)
  private handleMenuClick = (e: MouseEvent): void => {
    e.stopPropagation();
    const isHidden = this.menuDropdown.style.display === 'none';
    if (isHidden) {
      this.menuDropdown.style.display = "block";
      this.collapseAllSubmenus(null); // Collapse all when opening main menu
      // Don't render lists here, render them on expand
    } else {
      this.closeMenu();
    }
  }

  // Handles clicks on submenu headers (Model, Role, Chat)
  private async toggleSubmenu(headerEl: HTMLElement, contentEl: HTMLElement, type: 'models' | 'roles' | 'chats'): Promise<void> {
    // Знаходимо іконку
    const iconEl = headerEl.querySelector(`.${CSS_CLASS_SUBMENU_ICON}`);
    const isHidden = contentEl.style.maxHeight === '0px' || contentEl.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);

    // Згортаємо інші підменю
    if (isHidden) {
      this.collapseAllSubmenus(contentEl);
    }

    if (isHidden) {
      // Розгортаємо поточне підменю
      contentEl.empty();
      contentEl.createDiv({ cls: "menu-loading", text: `Loading ${type}...` });

      // --- ВИПРАВЛЕНО: Перевірка типу перед setIcon ---
      if (iconEl instanceof HTMLElement) { // <--- Перевірка типу
        setIcon(iconEl, 'chevron-down');
      }
      // ---------------------------------------------

      contentEl.classList.remove(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
      contentEl.style.paddingTop = '5px';
      contentEl.style.paddingBottom = '5px';
      contentEl.style.maxHeight = '40px'; // Початкова висота для "Loading..."

      try {
        // Асинхронно рендеримо вміст
        switch (type) {
          case 'models': await this.renderModelList(); break;
          case 'roles': await this.renderRoleList(); break;
          case 'chats': await this.renderChatListMenu(); break;
        }

        // Оновлюємо висоту після рендерингу
        requestAnimationFrame(() => {
          if (!contentEl.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN)) {
            contentEl.style.maxHeight = contentEl.scrollHeight + 'px';
          }
        });
      } catch (error) {
        console.error(`Error rendering ${type} list:`, error);
        contentEl.empty();
        contentEl.createDiv({ cls: "menu-error-text", text: `Error loading ${type}.` });
        contentEl.style.maxHeight = '50px'; // Залишаємо трохи місця для помилки
      }
    } else {
      // Згортаємо поточне підменю
      contentEl.classList.add(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
      contentEl.style.maxHeight = '0';
      contentEl.style.paddingTop = '0';
      contentEl.style.paddingBottom = '0';

      // --- ВИПРАВЛЕНО: Перевірка типу перед setIcon ---
      if (iconEl instanceof HTMLElement) { // <--- Перевірка типу
        setIcon(iconEl, 'chevron-right');
      }
      // ---------------------------------------------
    }
  }



  // Helper to collapse all submenus except the one potentially being opened
  // OllamaView.ts -> collapseAllSubmenus method

  private collapseAllSubmenus(exceptContent?: HTMLElement | null): void {
    const submenus = [
      { header: this.modelSubmenuHeader, content: this.modelSubmenuContent },
      { header: this.roleSubmenuHeader, content: this.roleSubmenuContent },
      { header: this.chatSubmenuHeader, content: this.chatSubmenuContent }
    ];
    submenus.forEach(submenu => {
      if (submenu.content && submenu.header && submenu.content !== exceptContent) {
        submenu.content.classList.add(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
        submenu.content.style.maxHeight = '0';
        submenu.content.style.paddingTop = '0';
        submenu.content.style.paddingBottom = '0';
        const iconEl = submenu.header.querySelector(`.${CSS_CLASS_SUBMENU_ICON}`);
        // --- ВИПРАВЛЕНО: Перевірка типу перед setIcon ---
        if (iconEl instanceof HTMLElement) { // <--- Перевірка типу
          setIcon(iconEl, 'chevron-right');
        }
        // ---------------------------------------------
      }
    });
  }
  // Action Handlers (Must call closeMenu)
  private handleNewChatClick = async (): Promise<void> => { this.closeMenu(); /* ... (logic) ... */ }
  private handleRenameChatClick = async (): Promise<void> => { this.closeMenu(); /* ... (logic) ... */ this.focusInput(); }
  private handleCloneChatClick = async (): Promise<void> => { this.closeMenu(); /* ... (logic) ... */ }
  private handleClearChatClick = async (): Promise<void> => { this.closeMenu(); /* ... (logic) ... */ }
  private handleDeleteChatClick = async (): Promise<void> => { this.closeMenu(); /* ... (logic) ... */ }
  private handleExportChatClick = async (): Promise<void> => { this.closeMenu(); /* ... (logic) ... */ }
  private handleSettingsClick = async (): Promise<void> => { this.closeMenu(); /* ... (logic) ... */ }
  private handleDocumentClickForMenu = (e: MouseEvent): void => { // Handles closing custom menu
    if (this.isMenuOpen() && !this.menuButton.contains(e.target as Node) && !this.menuDropdown.contains(e.target as Node)) {
      this.closeMenu();
    }
  }

  // --- Plugin Event Handlers ---
  private handleModelChange = (modelName: string): void => { /* ... */ this.updateInputPlaceholder(modelName); if (this.currentMessages.length > 0) this.addMessageToDisplay("system", `Model changed to: ${modelName}`, new Date()); }
  private handleRoleChange = (roleName: string): void => { /* ... */ const displayRole = roleName || "Default Assistant"; if (this.currentMessages.length > 0) this.addMessageToDisplay("system", `Role changed to: ${displayRole}`, new Date()); else new Notice(`Role set to: ${displayRole}`); }
  private handleRolesUpdated = (): void => { this.plugin.promptService?.clearRoleCache(); console.log("Roles updated: Cleared prompt service role cache."); };
  private handleChatListUpdated = (): void => { console.log("Chat list updated event received."); };
  private handleActiveChatChanged = (data: { chatId: string | null, chat: Chat | null }): void => { this.loadAndDisplayActiveChat(); }
  private handleMessageAdded = (data: { chatId: string, message: Message }): void => { if (data.chatId === this.plugin.chatManager?.getActiveChatId()) { this.addMessageToDisplay(data.message.role, data.message.content, data.message.timestamp); } }
  private handleMessagesCleared = (chatId: string): void => { if (chatId === this.plugin.chatManager?.getActiveChatId()) { this.clearChatContainerInternal(); this.currentMessages = []; this.showEmptyState(); } }

  // --- Window/Workspace State Handlers ---
  private handleVisibilityChange = (): void => { /* ... */ if (document.visibilityState === 'visible' && this.leaf.view === this) { requestAnimationFrame(() => { this.guaranteedScrollToBottom(50, true); this.adjustTextareaHeight(); this.inputEl?.focus(); }); } }
  private handleActiveLeafChange = (leaf: WorkspaceLeaf | null): void => { /* ... */ if (leaf?.view === this) { this.inputEl?.focus(); setTimeout(() => this.guaranteedScrollToBottom(150, true), 100); } }
  private handleWindowResize = (): void => { /* ... */ if (this.resizeTimeout) clearTimeout(this.resizeTimeout); this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 100); };

  // --- Scroll Handling ---
  private handleScroll = (): void => { // <- Method definition
    if (!this.chatContainer || !this.newMessagesIndicatorEl) return;
    const threshold = 150;
    const atBottom = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight < threshold;
    const previousScrolledUp = this.userScrolledUp;
    this.userScrolledUp = !atBottom;
    if (previousScrolledUp && atBottom) { this.newMessagesIndicatorEl.classList.remove(CSS_CLASS_VISIBLE); }
  }
  private handleNewMessageIndicatorClick = (): void => { /* ... */ if (this.chatContainer) { this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: 'smooth' }); } this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); this.userScrolledUp = false; }

  // --- UI Update Methods ---
  private updateInputPlaceholder(modelName: string): void { // <- Method definition
    if (this.inputEl) { this.inputEl.placeholder = modelName ? `Text to ${modelName}...` : "Select a model..."; }
  }
  private closeMenu(): void { // <- Definition needed again
    if (this.menuDropdown) {
      this.menuDropdown.style.display = "none";
      this.collapseAllSubmenus(null); // Collapse all when closing main menu
    }
  }
  private autoResizeTextarea(): void { // <- Method definition
    this.adjustTextareaHeight();
  }
  private adjustTextareaHeight = (): void => { // <- Method definition
    requestAnimationFrame(() => {
      if (!this.inputEl || !this.buttonsContainer) return;
      const maxHeightPercentage = 0.50; const minHeight = 40; const viewHeight = this.contentEl.clientHeight; const maxHeight = Math.max(100, viewHeight * maxHeightPercentage);
      this.inputEl.style.height = 'auto'; const scrollHeight = this.inputEl.scrollHeight; const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
      this.inputEl.style.height = `${newHeight}px`;
      this.inputEl.classList.toggle(CSS_CLASS_TEXTAREA_EXPANDED, scrollHeight > maxHeight);
    });
  }
  private updateSendButtonState(): void { // <- Method definition
    if (!this.inputEl || !this.sendButton) return;
    const isDisabled = this.inputEl.value.trim() === '' || this.isProcessing;
    this.sendButton.disabled = isDisabled;
    this.sendButton.classList.toggle(CSS_CLASS_DISABLED, isDisabled);
  }
  public showEmptyState(): void { // <- Method definition
    if (this.currentMessages.length === 0 && !this.emptyStateEl && this.chatContainer) {
      this.chatContainer.empty(); this.emptyStateEl = this.chatContainer.createDiv({ cls: CSS_CLASS_EMPTY_STATE }); this.emptyStateEl.createDiv({ cls: "empty-state-message", text: "No messages yet" }); const modelName = this.plugin?.settings?.modelName || "the AI"; this.emptyStateEl.createDiv({ cls: "empty-state-tip", text: `Type a message or use the menu to start interacting with ${modelName}.` });
    }
  }
  public hideEmptyState(): void { /* ... */ if (this.emptyStateEl) { this.emptyStateEl.remove(); this.emptyStateEl = null; } }
  // public setLoadingS'tate(isLoading: boolean): void { /* ... */ this.isProcessing = isLoading; if (this.inputEl) this.inputEl.disabled = isLoading; this.updateSendButtonState(); if (this.voiceButton) { this.voiceButton.disabled = isLoading; this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } if (this.translateInputButton) { this.translateInputButton.disabled = isLoading; this.translateInputButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } if (this.menuButton) { this.menuButton.disabled = isLoading; this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } }

  // --- Message Handling & Rendering ---
  async loadAndDisplayActiveChat(): Promise<void> { /* ... */ }
  private renderMessages(messagesToRender: Message[]): void { /* ... */ }
  addMessageToDisplay(role: MessageRole, content: string, timestamp: Date): void { /* ... */ }
  async sendMessage(): Promise<void> { /* ... */ }

  // --- Core Rendering Logic ---
  private renderMessageInternal(message: Message, messageContext: Message[]): HTMLElement | null { /* ... */ return null; }
  private handleCopyClick(content: string, buttonEl: HTMLElement): void { /* ... */ }
  private async handleTranslateClick(originalContent: string, contentEl: HTMLElement, buttonEl: HTMLButtonElement): Promise<void> { /* ... */ }

  // --- Rendering Helpers ---
  private renderAvatar(groupEl: HTMLElement, isUser: boolean): void { /* ... */ }
  private renderDateSeparator(date: Date): void { /* ... */ }
  private renderAssistantContent(containerEl: HTMLElement, content: string): void { /* ... */ }
  private addCodeBlockEnhancements(contentEl: HTMLElement): void { /* ... */ }

  // --- Menu List Rendering (ПОТРІБНІ ЗНОВУ) ---
  private async renderModelList(): Promise<void> {
    const container = this.modelSubmenuContent;
    if (!container) return;
    container.empty(); // Clear previous items/loading text
    // container.createEl("div", { cls: "menu-loading", text: "Loading models..." }); // Can cause flicker

    const modelIconMap: Record<string, string> = { 'llama': 'box-minimal', 'mistral': 'wind', 'mixtral': 'blend', 'codellama': 'code', 'code': 'code', 'phi': 'sigma', 'phi3': 'sigma', 'gemma': 'gem', 'command-r': 'terminal', 'llava': 'image', 'star': 'star', 'wizard': 'wand', 'hermes': 'message-circle', 'dolphin': 'anchor', };
    const defaultIcon = 'box';

    try {
      const models = await this.plugin.ollamaService.getModels();
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      const currentModelName = activeChat?.metadata?.modelName || this.plugin.settings.modelName;
      // container.empty(); // Clear loading

      if (models.length === 0) { container.createEl("div", { cls: "menu-info-text", text: "No models available." }); return; }

      models.forEach(modelName => {
        const optionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MODEL_OPTION}` });
        // Indent items visually
        // optionEl.style.paddingLeft = "25px"; // Apply indentation via CSS instead
        const iconSpan = optionEl.createEl("span", { cls: "menu-option-icon" });
        let iconToUse = defaultIcon;
        if (modelName === currentModelName) { iconToUse = "check"; optionEl.addClass("is-selected"); }
        else { /* ... logic for other icons ... */ const lowerModelName = modelName.toLowerCase(); let foundIcon = false; for (const key in modelIconMap) { if (lowerModelName.includes(key)) { iconToUse = modelIconMap[key]; foundIcon = true; break; } } if (!foundIcon) iconToUse = defaultIcon; }
        try { setIcon(iconSpan, iconToUse); } catch (e) { iconSpan.style.minWidth = "18px"; }

        optionEl.createEl("span", { cls: "menu-option-text", text: modelName });
        // Use registerDomEvent for menu items inside custom structure
        this.registerDomEvent(optionEl, 'click', async () => {
          if (modelName !== currentModelName) {
            const chatToUpdate = await this.plugin.chatManager?.getActiveChat();
            if (chatToUpdate) {
              await this.plugin.chatManager.updateActiveChatMetadata({ modelName: modelName });
            } else { new Notice("Cannot set model: No active chat."); }
          }
          this.closeMenu(); // Close main menu after selection
        });
      });
      // Recalculate parent max-height after adding items
      this.updateSubmenuHeight(container);

    } catch (error) { /* ... error handling ... */ container.empty(); container.createEl("div", { cls: "menu-error-text", text: "Error loading models." }); this.updateSubmenuHeight(container); }
  }

  private async renderRoleList(): Promise<void> {
    const container = this.roleSubmenuContent;
    if (!container) return;
    container.empty();
    // container.createEl("div", { cls: "menu-loading", text: "Loading roles..." });

    try {
      const roles = await this.plugin.listRoleFiles(true); // Force refresh on expand
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      const currentChatRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;
      container.empty();

      // "None" option
      const noRoleOptionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}` });
      // noRoleOptionEl.style.paddingLeft = "25px"; // Indent via CSS
      const noRoleIconSpan = noRoleOptionEl.createEl("span", { cls: "menu-option-icon" });
      if (!currentChatRolePath) { setIcon(noRoleIconSpan, "check"); noRoleOptionEl.addClass("is-selected"); }
      else { setIcon(noRoleIconSpan, "slash"); noRoleIconSpan.style.minWidth = "18px"; }
      noRoleOptionEl.createEl("span", { cls: "menu-option-text", text: "None (Default Assistant)" });
      this.registerDomEvent(noRoleOptionEl, 'click', async () => { /* ... (logic to set role path to "") ... */ const newRolePath = ""; if (this.plugin.settings.selectedRolePath !== newRolePath || currentChatRolePath !== newRolePath) { this.plugin.settings.selectedRolePath = newRolePath; await this.plugin.saveSettings(); const chatToUpdate = await this.plugin.chatManager?.getActiveChat(); if (chatToUpdate && chatToUpdate.metadata.selectedRolePath !== newRolePath) { await this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath }); this.plugin.promptService?.clearRoleCache?.(); } this.plugin.emit('role-changed', "Default Assistant"); } this.closeMenu(); });

      // Roles list
      if (roles.length === 0) { container.createEl("div", { cls: "menu-info-text", text: "No custom roles found." }); }
      else {
        roles.forEach(roleInfo => {
          const roleOptionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}` });
          // roleOptionEl.style.paddingLeft = "25px"; // Indent via CSS
          if (roleInfo.isCustom) roleOptionEl.addClass("is-custom");
          const iconSpan = roleOptionEl.createEl("span", { cls: "menu-option-icon" });
          if (roleInfo.path === currentChatRolePath) { setIcon(iconSpan, "check"); roleOptionEl.addClass("is-selected"); }
          else { setIcon(iconSpan, roleInfo.isCustom ? 'user' : 'box'); iconSpan.style.minWidth = "18px"; }
          roleOptionEl.createEl("span", { cls: "menu-option-text", text: roleInfo.name });
          this.registerDomEvent(roleOptionEl, 'click', async () => { /* ... (logic to set role path) ... */ const newRolePath = roleInfo.path; if (this.plugin.settings.selectedRolePath !== newRolePath || currentChatRolePath !== newRolePath) { this.plugin.settings.selectedRolePath = newRolePath; await this.plugin.saveSettings(); const chatToUpdate = await this.plugin.chatManager?.getActiveChat(); if (chatToUpdate && chatToUpdate.metadata.selectedRolePath !== newRolePath) { await this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath }); this.plugin.promptService?.clearRoleCache?.(); } this.plugin.emit('role-changed', roleInfo.name); } this.closeMenu(); });
        });
      }
      this.updateSubmenuHeight(container);
    } catch (error) { /* ... error handling ... */ container.empty(); container.createEl("div", { cls: "menu-error-text", text: "Error loading roles." }); this.updateSubmenuHeight(container); }
  }

  private async renderChatListMenu(): Promise<void> {
    const container = this.chatSubmenuContent;
    if (!container) return;
    container.empty();
    // container.createEl("div", { cls: "menu-loading", text: "Loading chats..." });

    try {
      const chats = this.plugin.chatManager?.listAvailableChats() || [];
      const currentActiveId = this.plugin.chatManager?.getActiveChatId();
      container.empty();

      if (chats.length === 0) { container.createEl("div", { cls: "menu-info-text", text: "No saved chats found." }); return; }

      chats.forEach(chatMeta => {
        const chatOptionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CHAT_OPTION}` });
        // chatOptionEl.style.paddingLeft = "25px"; // Indent via CSS
        const iconSpan = chatOptionEl.createEl("span", { cls: "menu-option-icon" });
        if (chatMeta.id === currentActiveId) { setIcon(iconSpan, "check"); chatOptionEl.addClass("is-selected"); }
        else { setIcon(iconSpan, "message-square"); }

        const textSpan = chatOptionEl.createEl("span", { cls: "menu-option-text" });
        textSpan.createEl('div', { cls: 'chat-option-name', text: chatMeta.name });
        const dateText = this.formatRelativeDate(new Date(chatMeta.lastModified));
        textSpan.createEl('div', { cls: 'chat-option-date', text: dateText });

        this.registerDomEvent(chatOptionEl, 'click', async () => {
          if (chatMeta.id !== this.plugin.chatManager?.getActiveChatId()) {
            await this.plugin.chatManager.setActiveChat(chatMeta.id);
          }
          this.closeMenu();
        });
      });
      this.updateSubmenuHeight(container);
    } catch (error) { /* ... error handling ... */ container.empty(); container.createEl("div", { cls: "menu-error-text", text: "Error loading chats." }); this.updateSubmenuHeight(container); }
  }

  // Helper to update submenu height after content changes
  private updateSubmenuHeight(contentEl: HTMLElement | null) {
    if (contentEl && !contentEl.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN)) {
      requestAnimationFrame(() => {
        contentEl.style.maxHeight = contentEl.scrollHeight + 'px';
      });
    }
  }
  // --- End Menu List Rendering Functions ---


  // --- Speech Recognition Methods ---
  private initSpeechWorker(): void { /* ... */ }
  private setupSpeechWorkerHandlers(): void { /* ... */ }
  private insertTranscript(transcript: string): void { /* ... */ }
  private async toggleVoiceRecognition(): Promise<void> { /* ... */ }
  private async startVoiceRecognition(): Promise<void> { /* ... */ }
  private stopVoiceRecording(processAudio: boolean): void { /* ... */ }

  // --- Thinking Tag Handling ---
  private processThinkingTags(content: string): string { /* ... */ return ''; }
  private markdownToHtml(markdown: string): string { /* ... */ return ''; }
  private addThinkingToggleListeners(contentEl: HTMLElement): void { /* ... */ }
  private decodeHtmlEntities(text: string): string { /* ... */ return text; }
  private detectThinkingTags(content: string): { hasThinkingTags: boolean; format: string } { /* ... */ return { hasThinkingTags: false, format: 'none' }; }

  // --- Message Collapsing ---
  private checkMessageForCollapsing(messageEl: HTMLElement): void { /* ... */ }
  private checkAllMessagesForCollapsing(): void { /* ... */ }
  private toggleMessageCollapse(contentEl: HTMLElement, buttonEl: HTMLButtonElement): void { /* ... */ }

  // --- Helpers & Utilities ---
  public getChatContainer(): HTMLElement { return this.chatContainer; }
  private clearChatContainerInternal(): void { /* ... */ }
  public clearDisplayAndState(): void { /* ... */ }
  public addLoadingIndicator(): HTMLElement { /* ... */ return this.chatContainer.createDiv(); }
  public removeLoadingIndicator(loadingEl: HTMLElement | null): void { /* ... */ }
  public scrollToBottom(): void { /* ... */ }
  public clearInputField(): void { /* ... */ }
  public focusInput(): void { /* ... */ setTimeout(() => { this.inputEl?.focus(); }, 50); }
  guaranteedScrollToBottom(delay = 50, forceScroll = false): void { /* ... */ }
  formatTime(date: Date): string { /* ... */ return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  formatDateSeparator(date: Date): string { /* ... */ const now = new Date(); const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1); if (this.isSameDay(date, now)) return "Today"; else if (this.isSameDay(date, yesterday)) return "Yesterday"; else return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
  formatRelativeDate(date: Date): string { /* ... */ const now = new Date(); const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000); const diffDays = Math.floor(diffSeconds / (60 * 60 * 24)); if (diffDays === 0) { const diffHours = Math.floor(diffSeconds / (60 * 60)); if (diffHours < 1) return "Just now"; if (diffHours === 1) return "1 hour ago"; if (diffHours < now.getHours()) return `${diffHours} hours ago`; else return "Today"; } else if (diffDays === 1) { return "Yesterday"; } else if (diffDays < 7) { return `${diffDays} days ago`; } else { return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } }
  isSameDay(date1: Date, date2: Date): boolean { /* ... */ return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate(); }
  // setLoadingState definition is needed
  public setLoadingState(isLoading: boolean): void { // <- ADDED BACK
    this.isProcessing = isLoading; if (this.inputEl) this.inputEl.disabled = isLoading; this.updateSendButtonState(); if (this.voiceButton) { this.voiceButton.disabled = isLoading; this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } if (this.translateInputButton) { this.translateInputButton.disabled = isLoading; this.translateInputButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } if (this.menuButton) { this.menuButton.disabled = isLoading; this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); }
  }
  private formatChatToMarkdown(messagesToFormat: Message[]): string { /* ... */ return ''; }

} // END OF OllamaView CLASS