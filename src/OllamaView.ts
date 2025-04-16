// OllamaView.ts
import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  MarkdownRenderer,
  Notice,
  debounce,
  normalizePath,
  TFolder,
  TFile,
  Menu,
} from "obsidian";
// Імпортуємо модальні вікна
import { ConfirmModal } from './ConfirmModal';
import { PromptModal } from './PromptModal';
import OllamaPlugin from "./main"; // Головний клас плагіна
import { AvatarType } from "./settings"; // Типи налаштувань
import { RoleInfo } from "./ChatManager"; // Тип RoleInfo
import { Chat, ChatMetadata } from "./Chat"; // Клас Chat та типи

// --- View Type ID ---
// Використовуйте унікальний ID, наприклад, на основі назви плагіна
export const VIEW_TYPE_OLLAMA_PERSONAS = "ollama-personas-chat-view";

// --- CSS Classes ---
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


const CSS_CLASS_INPUT_AREA_LEFT = "input-area-left";
const CSS_CLASS_MODEL_DISPLAY = "model-display";
const CSS_CLASS_INPUT_CONTROLS_CONTAINER = "input-controls-container";
const CSS_CLASS_INPUT_CONTROLS_LEFT = "input-controls-left";
const CSS_CLASS_INPUT_CONTROLS_RIGHT = "input-controls-right";


// --- Message Types ---
export type MessageRole = "user" | "assistant" | "system" | "error";
export interface Message { role: MessageRole; content: string; timestamp: Date; }

// --- Language List ---
const LANGUAGES: Record<string, string> = {
  "af": "Afrikaans", "sq": "Albanian", "am": "Amharic", "ar": "Arabic", "hy": "Armenian",
  "az": "Azerbaijani", "eu": "Basque", "be": "Belarusian", "bn": "Bengali", "bs": "Bosnian",
  "bg": "Bulgarian", "ca": "Catalan", "ceb": "Cebuano", "ny": "Chichewa", "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)", "co": "Corsican", "hr": "Croatian", "cs": "Czech", "da": "Danish",
  "nl": "Dutch", "en": "English", "eo": "Esperanto", "et": "Estonian", "tl": "Filipino",
  "fi": "Finnish", "fr": "French", "fy": "Frisian", "gl": "Galician", "ka": "Georgian",
  "de": "German", "el": "Greek", "gu": "Gujarati", "ht": "Haitian Creole", "ha": "Hausa",
  "haw": "Hawaiian", "iw": "Hebrew", "he": "Hebrew", "hi": "Hindi", "hmn": "Hmong",
  "hu": "Hungarian", "is": "Icelandic", "ig": "Igbo", "id": "Indonesian", "ga": "Irish",
  "it": "Italian", "ja": "Japanese", "jw": "Javanese", "kn": "Kannada", "kk": "Kazakh",
  "km": "Khmer", "rw": "Kinyarwanda", "ko": "Korean", "ku": "Kurdish (Kurmanji)", "ky": "Kyrgyz",
  "lo": "Lao", "la": "Latin", "lv": "Latvian", "lt": "Lithuanian", "lb": "Luxembourgish",
  "mk": "Macedonian", "mg": "Malagasy", "ms": "Malay", "ml": "Malayalam", "mt": "Maltese",
  "mi": "Maori", "mr": "Marathi", "mn": "Mongolian", "my": "Myanmar (Burmese)", "ne": "Nepali",
  "no": "Norwegian", "or": "Odia (Oriya)", "ps": "Pashto", "fa": "Persian", "pl": "Polish",
  "pt": "Portuguese", "pa": "Punjabi", "ro": "Romanian", "ru": "Russian", "sm": "Samoan",
  "gd": "Scots Gaelic", "sr": "Serbian", "st": "Sesotho", "sn": "Shona", "sd": "Sindhi",
  "si": "Sinhala", "sk": "Slovak", "sl": "Slovenian", "so": "Somali", "es": "Spanish",
  "su": "Sundanese", "sw": "Swahili", "sv": "Swedish", "tg": "Tajik", "ta": "Tamil",
  "tt": "Tatar", "te": "Telugu", "th": "Thai", "tr": "Turkish", "tk": "Turkmen",
  "uk": "Ukrainian", "ur": "Urdu", "ug": "Uyghur", "uz": "Uzbek", "vi": "Vietnamese",
  "cy": "Welsh", "xh": "Xhosa", "yi": "Yiddish", "yo": "Yoruba", "zu": "Zulu"
};

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

  private modelDisplayEl!: HTMLElement;


  // Властивості для кастомного меню
  private menuDropdown!: HTMLElement;
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
    // Переконуємось, що handleScroll визначено ПЕРЕД цим рядком
    this.scrollListenerDebounced = debounce(this.handleScroll, 150, true);
    console.log("[OllamaView] Constructed.");
  }

  // --- Getters ---
  /** Checks if the custom menu dropdown is currently visible */
  public isMenuOpen(): boolean {
    return !!this.menuDropdown && this.menuDropdown.style.display === 'block';
  }

  // --- Obsidian View Methods ---
  getViewType(): string { return VIEW_TYPE_OLLAMA_PERSONAS; }
  getDisplayText(): string { return "Ollama Personas"; }
  getIcon(): string { return "message-square"; }

  async onOpen(): Promise<void> {
    console.log("[OllamaView] onOpen START");
    this.createUIElements();
    // Оновлюємо плейсхолдер на основі ролі при відкритті
    this.getCurrentRoleDisplayName().then(roleName => {
      this.updateInputPlaceholder(roleName);
    });
    // Модель оновлюється окремо, можливо, з кешу налаштувань спочатку
    this.updateModelDisplay(this.plugin.settings.modelName);
    this.attachEventListeners();
    this.autoResizeTextarea();
    this.updateSendButtonState();
    try {
      // loadAndDisplayActiveChat тепер сам оновить і модель, і роль/плейсхолдер
      await this.loadAndDisplayActiveChat();
    } catch (error) {
      console.error("[OllamaView] Error during initial chat load:", error);
      this.showEmptyState();
      // Якщо завантаження чату не вдалось, все одно встановимо плейсхолдер і модель
      this.getCurrentRoleDisplayName().then(roleName => this.updateInputPlaceholder(roleName));
      this.updateModelDisplay(this.plugin.settings.modelName);
    }
    setTimeout(() => this.inputEl?.focus(), 150);
    if (this.inputEl) {
      this.inputEl.dispatchEvent(new Event('input'));
    }
    console.log("[OllamaView] onOpen END");
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

    // --- Input Container (Тепер містить textarea + controlsContainer) ---
    const inputContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER });

    // 1. Textarea (зверху)
    this.inputEl = inputContainer.createEl("textarea", { attr: { placeholder: `Text...`, rows: 1 } });
    // Забираємо зайвий padding-right, який був для старих кнопок
    // this.inputEl.style.paddingRight = '15px'; // Або залишити стандартний

    // 2. Контейнер для контролів (знизу)
    const controlsContainer = inputContainer.createDiv({ cls: CSS_CLASS_INPUT_CONTROLS_CONTAINER });

    // 2a. Ліва група контролів
    const leftControls = controlsContainer.createDiv({ cls: CSS_CLASS_INPUT_CONTROLS_LEFT });
    this.modelDisplayEl = leftControls.createDiv({ cls: CSS_CLASS_MODEL_DISPLAY });
    this.modelDisplayEl.setText("..."); // Початковий текст
    this.modelDisplayEl.title = "Click to select model";
    this.translateInputButton = leftControls.createEl("button", { cls: CSS_CLASS_TRANSLATE_INPUT_BUTTON, attr: { 'aria-label': 'Translate input to English' } });
    setIcon(this.translateInputButton, "replace");
    this.translateInputButton.title = "Translate input to English";

    // 2b. Права група контролів (старий buttonsContainer)
    this.buttonsContainer = controlsContainer.createDiv({ cls: `${CSS_CLASS_BUTTONS_CONTAINER} ${CSS_CLASS_INPUT_CONTROLS_RIGHT}` });
    this.voiceButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_VOICE_BUTTON, attr: { 'aria-label': 'Voice Input' } }); setIcon(this.voiceButton, "mic");
    this.menuButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_MENU_BUTTON, attr: { 'aria-label': 'Menu' } }); setIcon(this.menuButton, "more-vertical");
    this.sendButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_SEND_BUTTON, attr: { 'aria-label': 'Send' } }); setIcon(this.sendButton, "send");

    // --- Кастомне Випадаюче Меню (для кнопки "...") ---
    // Позиціонується відносно inputContainer або menuButton
    this.menuDropdown = inputContainer.createEl("div", { cls: [CSS_CLASS_MENU_DROPDOWN, "ollama-chat-menu"] });
    this.menuDropdown.style.display = "none"; // Приховано

    // Helper для секцій акордеону
    const createSubmenuSection = (title: string, icon: string, listContainerClass: string, sectionClass?: string): { header: HTMLElement, content: HTMLElement, section: HTMLElement } => {
      const section = this.menuDropdown.createDiv(); if (sectionClass) section.addClass(sectionClass);
      const header = section.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MENU_HEADER_ITEM}` });
      setIcon(header.createSpan({ cls: "menu-option-icon" }), icon); header.createSpan({ cls: "menu-option-text", text: title }); setIcon(header.createSpan({ cls: CSS_CLASS_SUBMENU_ICON }), "chevron-right");
      const content = section.createDiv({ cls: `${CSS_CLASS_SUBMENU_CONTENT} ${CSS_CLASS_SUBMENU_CONTENT_HIDDEN} ${listContainerClass}` });
      content.style.maxHeight = '0'; content.style.overflow = 'hidden'; content.style.transition = 'max-height 0.3s ease-out, padding 0.3s ease-out'; content.style.paddingTop = '0'; content.style.paddingBottom = '0';
      return { header, content, section };
    };

    // Створюємо секції акордеону
    // Секція Моделей буде прихована на десктопі через CSS
    const modelSection = createSubmenuSection("Select Model", "list-collapse", CSS_CLASS_MODEL_LIST_CONTAINER, "model-submenu-section"); this.modelSubmenuHeader = modelSection.header; this.modelSubmenuContent = modelSection.content;
    const roleSection = createSubmenuSection("Select Role", "users", CSS_CLASS_ROLE_LIST_CONTAINER); this.roleSubmenuHeader = roleSection.header; this.roleSubmenuContent = roleSection.content;
    const chatSection = createSubmenuSection("Load Chat", "messages-square", CSS_CLASS_CHAT_LIST_CONTAINER); this.chatSubmenuHeader = chatSection.header; this.chatSubmenuContent = chatSection.content;

    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });
    this.menuDropdown.createEl("div", { text: "Actions", cls: CSS_CLASS_MENU_HEADER });
    // ... (всі прямі опції меню: New Chat, Rename, Clone, Export, Clear, Delete, Settings) ...
    this.newChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_NEW_CHAT_OPTION}` }); setIcon(this.newChatOption.createSpan({ cls: "menu-option-icon" }), "plus-circle"); this.newChatOption.createSpan({ cls: "menu-option-text", text: "New Chat" });
    this.renameChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_RENAME_CHAT_OPTION}` }); setIcon(this.renameChatOption.createSpan({ cls: "menu-option-icon" }), "pencil"); this.renameChatOption.createSpan({ cls: "menu-option-text", text: "Rename Chat" });
    this.cloneChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLONE_CHAT_OPTION}` }); setIcon(this.cloneChatOption.createSpan({ cls: "menu-option-icon" }), "copy-plus"); this.cloneChatOption.createSpan({ cls: "menu-option-text", text: "Clone Chat" });
    this.exportChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_EXPORT_CHAT_OPTION}` }); setIcon(this.exportChatOption.createSpan({ cls: "menu-option-icon" }), "download"); this.exportChatOption.createSpan({ cls: "menu-option-text", text: "Export Chat" });
    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });
    this.clearChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLEAR_CHAT_OPTION} ${CSS_CLASS_DANGER_OPTION}` }); setIcon(this.clearChatOption.createSpan({ cls: "menu-option-icon" }), "trash"); this.clearChatOption.createSpan({ cls: "menu-option-text", text: "Clear Messages" });
    this.deleteChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_DELETE_CHAT_OPTION} ${CSS_CLASS_DANGER_OPTION}` }); setIcon(this.deleteChatOption.createSpan({ cls: "menu-option-icon" }), "trash-2"); this.deleteChatOption.createSpan({ cls: "menu-option-text", text: "Delete Chat" });
    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });
    this.settingsOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_SETTINGS_OPTION}` }); setIcon(this.settingsOption.createSpan({ cls: "menu-option-icon" }), "settings"); this.settingsOption.createSpan({ cls: "menu-option-text", text: "Settings" });
    // --- Кінець Кастомного Меню ---
  }

  // --- Event Listeners (with Custom Div Menu) ---
  private attachEventListeners(): void {
    console.log("[OllamaView Debug] Attaching event listeners START");
    // Перевірки існування елементів
    if (!this.inputEl) console.error("inputEl missing!"); else console.log("[OllamaView Debug] inputEl FOUND");
    if (!this.sendButton) console.error("sendButton missing!"); else console.log("[OllamaView Debug] sendButton FOUND");
    if (!this.menuButton) console.error("menuButton missing!"); else console.log("[OllamaView Debug] menuButton FOUND");
    if (!this.modelDisplayEl) console.error("modelDisplayEl missing!"); else console.log("[OllamaView Debug] modelDisplayEl FOUND");
    if (!this.translateInputButton) console.error("translateInputButton missing!"); else console.log("[OllamaView Debug] translateInputButton FOUND");

    // Слухачі поля вводу
    if (this.inputEl) {
      this.inputEl.addEventListener("keydown", this.handleKeyDown);
      this.inputEl.addEventListener('input', this.handleInputForResize);
    }

    // Слухачі кнопок
    if (this.sendButton) this.sendButton.addEventListener("click", this.handleSendClick);
    if (this.voiceButton) this.voiceButton.addEventListener("click", this.handleVoiceClick);
    if (this.translateInputButton) this.translateInputButton.addEventListener("click", this.handleTranslateInputClick);
    if (this.menuButton) this.menuButton.addEventListener("click", this.handleMenuClick); // Головне кастомне меню
    if (this.modelDisplayEl) this.registerDomEvent(this.modelDisplayEl, 'click', this.handleModelDisplayClick); // Спливаюче меню моделей

    // Слухачі для кастомного меню (акордеон)
    if (this.modelSubmenuHeader) this.registerDomEvent(this.modelSubmenuHeader, 'click', () => this.toggleSubmenu(this.modelSubmenuHeader, this.modelSubmenuContent, 'models')); else console.error("modelSubmenuHeader missing!");
    if (this.roleSubmenuHeader) this.registerDomEvent(this.roleSubmenuHeader, 'click', () => this.toggleSubmenu(this.roleSubmenuHeader, this.roleSubmenuContent, 'roles')); else console.error("roleSubmenuHeader missing!");
    if (this.chatSubmenuHeader) this.registerDomEvent(this.chatSubmenuHeader, 'click', () => this.toggleSubmenu(this.chatSubmenuHeader, this.chatSubmenuContent, 'chats')); else console.error("chatSubmenuHeader missing!");

    // Слухачі для прямих опцій меню
    if (this.settingsOption) this.settingsOption.addEventListener("click", this.handleSettingsClick); else console.error("settingsOption missing!");
    if (this.clearChatOption) this.clearChatOption.addEventListener("click", this.handleClearChatClick); else console.error("clearChatOption missing!");
    if (this.exportChatOption) this.exportChatOption.addEventListener("click", this.handleExportChatClick); else console.error("exportChatOption missing!");
    if (this.newChatOption) this.newChatOption.addEventListener("click", this.handleNewChatClick); else console.error("newChatOption missing!");
    if (this.renameChatOption) this.renameChatOption.addEventListener("click", this.handleRenameChatClick); else console.error("renameChatOption missing!");
    if (this.cloneChatOption) this.cloneChatOption.addEventListener("click", this.handleCloneChatClick); else console.error("cloneChatOption missing!");
    if (this.deleteChatOption) this.deleteChatOption.addEventListener("click", this.handleDeleteChatClick); else console.error("deleteChatOption missing!");

    if (this.settingsOption) this.settingsOption.addEventListener("click", this.handleSettingsClick); else console.error("settingsOption missing!");
    if (this.clearChatOption) this.clearChatOption.addEventListener("click", this.handleClearChatClick); else console.error("clearChatOption missing!");
    if (this.exportChatOption) this.exportChatOption.addEventListener("click", this.handleExportChatClick); else console.error("exportChatOption missing!");
    if (this.newChatOption) this.newChatOption.addEventListener("click", this.handleNewChatClick); else console.error("newChatOption missing!");
    if (this.renameChatOption) this.renameChatOption.addEventListener("click", this.handleRenameChatClick); else console.error("renameChatOption missing!");
    if (this.cloneChatOption) this.cloneChatOption.addEventListener("click", this.handleCloneChatClick); else console.error("cloneChatOption missing!");
    if (this.deleteChatOption) this.deleteChatOption.addEventListener("click", this.handleDeleteChatClick); else console.error("deleteChatOption missing!");
    // --- End Custom Menu Listeners ---

    // Window/Workspace/Document listeners
    this.registerDomEvent(window, 'resize', this.handleWindowResize);
    this.registerEvent(this.app.workspace.on('resize', this.handleWindowResize));
    this.registerDomEvent(document, 'click', this.handleDocumentClickForMenu);
    this.registerDomEvent(document, 'visibilitychange', this.handleVisibilityChange);
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange));
    if (this.chatContainer) { this.registerDomEvent(this.chatContainer, 'scroll', this.scrollListenerDebounced); console.log("[OllamaView] Attached listener to chatContainer scroll"); } else { console.error("chatContainer missing!") }
    if (this.newMessagesIndicatorEl) { this.registerDomEvent(this.newMessagesIndicatorEl, 'click', this.handleNewMessageIndicatorClick); }

    // Plugin/ChatManager Event Listeners
    this.register(this.plugin.on('model-changed', this.handleModelChange));
    this.register(this.plugin.on('role-changed', this.handleRoleChange));
    this.register(this.plugin.on('roles-updated', this.handleRolesUpdated));
    this.register(this.plugin.on('active-chat-changed', this.handleActiveChatChanged));
    this.register(this.plugin.on('message-added', this.handleMessageAdded));
    this.register(this.plugin.on('messages-cleared', this.handleMessagesCleared));
    this.register(this.plugin.on('chat-list-updated', this.handleChatListUpdated));
    console.log("[OllamaView Debug] Attaching event listeners END");
  }

  // OllamaView.ts -> handleModelDisplayClick

  private handleModelDisplayClick = async (event: MouseEvent) => {
    console.log("[OllamaView Debug] Model display clicked, creating native menu.");
    const menu = new Menu();
    let itemsAdded = false; // <-- Прапорець: чи додали ми щось до меню?

    const loadingNotice = new Notice("Loading models...", 0);

    try {
      const models = await this.plugin.ollamaService.getModels();
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      const currentModelName = activeChat?.metadata?.modelName || this.plugin.settings.modelName;

      loadingNotice.hide();

      if (models.length === 0) {
        menu.addItem(item => item.setTitle("No models found").setDisabled(true));
        itemsAdded = true; // <-- Позначили, що елемент додано
      } else {
        models.forEach((modelName) => {
          menu.addItem((item) =>
            item
              .setTitle(modelName)
              .setIcon(modelName === currentModelName ? "check" : "radio-button")
              .onClick(async () => {
                const chatToUpdate = await this.plugin.chatManager?.getActiveChat();
                const latestModelName = chatToUpdate?.metadata?.modelName || this.plugin.settings.modelName;
                if (modelName !== latestModelName) {
                  if (chatToUpdate) {
                    await this.plugin.chatManager.updateActiveChatMetadata({ modelName: modelName });
                  } else {
                    new Notice("Cannot set model: No active chat.");
                  }
                }
              })
          );
          itemsAdded = true; // <-- Позначили, що елемент(и) додано
        });
      }
    } catch (error) {
      loadingNotice.hide();
      console.error("Error loading models for model selection menu:", error);
      menu.addItem(item => item.setTitle("Error loading models").setDisabled(true));
      itemsAdded = true; // <-- Позначили, що елемент помилки додано
      new Notice("Failed to load models. Check Ollama connection.");
    } finally {
      // --- ЗМІНЕНО ---
      // Показуємо меню, ТІЛЬКИ ЯКЩО хоч один елемент було додано
      if (itemsAdded) {
        menu.showAtMouseEvent(event);
      } else {
        // Якщо нічого не додалося (малоймовірно, але можливо)
        console.warn("Model menu was not shown because no items were added.");
        // Можна показати сповіщення користувачу, якщо потрібно
        // new Notice("Could not display model menu.");
      }
      // --- КІНЕЦЬ ЗМІН ---
    }
  }

  private updateModelDisplay(modelName: string | null | undefined): void {
    if (this.modelDisplayEl) {
      const displayName = modelName || "Default"; // Або "Select Model"
      // Забираємо ':latest', якщо воно є, для коротшого відображення
      const shortName = displayName.replace(/:latest$/, '');
      this.modelDisplayEl.setText(shortName);
      this.modelDisplayEl.title = `Current model: ${displayName}. Click to change.`;
    }
  }

  // --- Event Handlers ---

  // Input & Sending
  private handleKeyDown = (e: KeyboardEvent): void => {
    console.log(`[OllamaView Debug] handleKeyDown FIRED: Key=<span class="math-inline">\{e\.key\}, Shift\=</span>{e.shiftKey}, isProcessing=<span class="math-inline">\{this\.isProcessing\}, sendButtonDisabled\=</span>{this.sendButton?.disabled}`);
    if (e.key === "Enter" && !e.shiftKey && !this.isProcessing && !this.sendButton?.disabled) {
      console.log("[OllamaView Debug] Enter condition met - sending.");
      e.preventDefault();
      this.sendMessage();
    }
  }
  private handleSendClick = (): void => {
    console.log(`[OllamaView Debug] handleSendClick FIRED: isProcessing=<span class="math-inline">\{this\.isProcessing\}, sendButtonDisabled\=</span>{this.sendButton?.disabled}`);
    if (!this.isProcessing && !this.sendButton?.disabled) {
      console.log("[OllamaView Debug] Send button clicked - sending message.");
      this.sendMessage();
    } else {
      console.log("[OllamaView Debug] Send button clicked, but ignored (processing or disabled).");
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
  private handleTranslateInputClick = async (): Promise<void> => {
    const currentText = this.inputEl.value; const targetLang = 'en';
    if (!currentText.trim()) { new Notice("Input empty..."); return; }
    if (!this.plugin.settings.enableTranslation) { new Notice("Translation disabled..."); return; }
    const apiKey = this.plugin.settings.googleTranslationApiKey; if (!apiKey) { new Notice("Translation API Key not set..."); return; }
    setIcon(this.translateInputButton, "loader"); this.translateInputButton.disabled = true; this.translateInputButton.classList.add(CSS_CLASS_TRANSLATING_INPUT); this.translateInputButton.title = "Translating...";
    try {
      const translatedText = await this.plugin.translationService.translate(currentText, targetLang); if (translatedText !== null) { this.inputEl.value = translatedText; this.inputEl.dispatchEvent(new Event('input')); this.inputEl.focus(); const end = translatedText.length; this.inputEl.setSelectionRange(end, end); } else { console.warn("Input translation failed."); }
    } catch (error) {
      console.error("Input translation error:", error); new Notice("Input translation error.");
    } finally { setIcon(this.translateInputButton, "replace"); this.translateInputButton.disabled = this.isProcessing; this.translateInputButton.classList.remove(CSS_CLASS_TRANSLATING_INPUT); this.translateInputButton.title = "Translate input to English"; }
  }

  // Menu Button Click (Toggles Custom Div)
  private handleMenuClick = (e: MouseEvent): void => {
    e.stopPropagation();
    if (!this.menuDropdown) { console.error("menuDropdown missing!"); return; } // Safety check
    const isHidden = this.menuDropdown.style.display === 'none';
    if (isHidden) {
      console.log("[OllamaView Debug] Opening menu...");
      this.menuDropdown.style.display = "block";
      this.collapseAllSubmenus(null); // Collapse all when opening main menu
    } else {
      console.log("[OllamaView Debug] Closing menu...");
      this.closeMenu();
    }
  }

  // Handles clicks on submenu headers (Model, Role, Chat)
  private async toggleSubmenu(headerEl: HTMLElement | null, contentEl: HTMLElement | null, type: 'models' | 'roles' | 'chats'): Promise<void> {
    if (!headerEl || !contentEl) return;
    const iconEl = headerEl.querySelector(`.${CSS_CLASS_SUBMENU_ICON}`);
    const isHidden = contentEl.style.maxHeight === '0px' || contentEl.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
    console.log(`[OllamaView Debug] Toggling submenu '${type}'. Hidden: ${isHidden}`);
    if (isHidden) { this.collapseAllSubmenus(contentEl); } // Collapse others first

    if (isHidden) {
      // --- Expand ---
      if (iconEl instanceof HTMLElement) setIcon(iconEl, 'chevron-down');
      contentEl.empty();
      contentEl.createDiv({ cls: "menu-loading", text: `Loading ${type}...` });
      contentEl.classList.remove(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
      contentEl.style.paddingTop = '5px'; contentEl.style.paddingBottom = '5px'; contentEl.style.maxHeight = '40px'; // For loading text
      try {
        switch (type) {
          case 'models': await this.renderModelList(); break; // Рендеримо в контейнер
          case 'roles': await this.renderRoleList(); break;
          case 'chats': await this.renderChatListMenu(); break;
        }
        requestAnimationFrame(() => { if (!contentEl.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN)) { contentEl.style.maxHeight = contentEl.scrollHeight + 'px'; } });
      } catch (error) { console.error(`Error rendering ${type} list:`, error); contentEl.empty(); contentEl.createDiv({ cls: "menu-error-text", text: `Error loading ${type}.` }); contentEl.style.maxHeight = '50px'; }
    } else {
      // --- Collapse ---
      contentEl.classList.add(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
      contentEl.style.maxHeight = '0'; contentEl.style.paddingTop = '0'; contentEl.style.paddingBottom = '0';
      if (iconEl instanceof HTMLElement) setIcon(iconEl, 'chevron-right');
    }
  }

  // Helper to collapse all submenus except the one potentially being opened
  private collapseAllSubmenus(exceptContent?: HTMLElement | null): void {
    const submenus = [
      { header: this.modelSubmenuHeader, content: this.modelSubmenuContent },
      { header: this.roleSubmenuHeader, content: this.roleSubmenuContent },
      { header: this.chatSubmenuHeader, content: this.chatSubmenuContent }
    ];
    submenus.forEach(submenu => {
      // Check elements exist before manipulating
      if (submenu.content && submenu.header && submenu.content !== exceptContent) {
        if (!submenu.content.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN)) {
          submenu.content.classList.add(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
          submenu.content.style.maxHeight = '0';
          submenu.content.style.paddingTop = '0';
          submenu.content.style.paddingBottom = '0';
          const iconEl = submenu.header.querySelector(`.${CSS_CLASS_SUBMENU_ICON}`);
          if (iconEl instanceof HTMLElement) { setIcon(iconEl, 'chevron-right'); }
        }
      }
    });
  }

  // --- Action Handlers (Must call closeMenu) ---
  private handleNewChatClick = async (): Promise<void> => { this.closeMenu(); console.log("[OllamaView Debug] Action: New Chat"); try { const newChat = await this.plugin.chatManager.createNewChat(); if (newChat) { new Notice(`Created new chat: ${newChat.metadata.name}`); this.focusInput(); } else { new Notice("Failed to create new chat."); } } catch (error) { new Notice("Error creating new chat."); } }
  private handleRenameChatClick = async (): Promise<void> => { this.closeMenu(); console.log("[OllamaView Debug] Action: Rename Chat"); const activeChat = await this.plugin.chatManager?.getActiveChat(); if (!activeChat) { new Notice("No active chat to rename."); return; } const currentName = activeChat.metadata.name; new PromptModal(this.app, 'Rename Chat', `Enter new name for "${currentName}":`, currentName, async (newName) => { let noticeMessage = "Rename cancelled or name unchanged."; if (newName && newName.trim() !== "" && newName.trim() !== currentName) { const success = await this.plugin.chatManager.renameChat(activeChat.metadata.id, newName.trim()); if (success) { noticeMessage = `Chat renamed to "${newName.trim()}"`; } else { noticeMessage = "Failed to rename chat."; } } else if (newName?.trim() === currentName) { noticeMessage = "Name unchanged."; } else { noticeMessage = "Rename cancelled or invalid name entered."; } new Notice(noticeMessage); this.focusInput(); }).open(); }
  private handleCloneChatClick = async (): Promise<void> => { this.closeMenu(); console.log("[OllamaView Debug] Action: Clone Chat"); const activeChat = await this.plugin.chatManager?.getActiveChat(); if (!activeChat) { new Notice("No active chat to clone."); return; } const originalName = activeChat.metadata.name; const cloningNotice = new Notice("Cloning chat...", 0); try { const clonedChat = await this.plugin.chatManager.cloneChat(activeChat.metadata.id); if (clonedChat) { new Notice(`Chat cloned as "${clonedChat.metadata.name}" and activated.`); } else { new Notice("Failed to clone chat."); } } catch (error) { new Notice("An error occurred while cloning the chat."); } finally { cloningNotice.hide(); } }
  private handleClearChatClick = async (): Promise<void> => { this.closeMenu(); console.log("[OllamaView Debug] Action: Clear Chat"); const activeChat = await this.plugin.chatManager?.getActiveChat(); if (activeChat) { const chatName = activeChat.metadata.name; new ConfirmModal(this.app, 'Clear Chat Messages', `Are you sure you want to clear all messages in chat "${chatName}"?\nThis action cannot be undone.`, () => { this.plugin.chatManager.clearActiveChatMessages(); }).open(); } else { new Notice("No active chat to clear."); } }
  private handleDeleteChatClick = async (): Promise<void> => { this.closeMenu(); console.log("[OllamaView Debug] Action: Delete Chat"); const activeChat = await this.plugin.chatManager?.getActiveChat(); if (activeChat) { const chatName = activeChat.metadata.name; new ConfirmModal(this.app, 'Delete Chat', `Are you sure you want to delete chat "${chatName}"?\nThis action cannot be undone.`, async () => { const success = await this.plugin.chatManager.deleteChat(activeChat.metadata.id); if (success) { new Notice(`Chat "${chatName}" deleted.`); } else { new Notice(`Failed to delete chat "${chatName}".`); } }).open(); } else { new Notice("No active chat to delete."); } }
  private handleExportChatClick = async (): Promise<void> => { this.closeMenu(); console.log("[OllamaView Debug] Action: Export Chat"); /* ... (export logic) ... */ const activeChat = await this.plugin.chatManager?.getActiveChat(); if (!activeChat || activeChat.messages.length === 0) { new Notice("Chat empty, nothing to export."); return; } try { const md = this.formatChatToMarkdown(activeChat.messages); const ts = new Date().toISOString().replace(/[:.]/g, '-'); const safeName = activeChat.metadata.name.replace(/[/\\?%*:|"<>]/g, '-'); const fName = `ollama-chat-<span class="math-inline">\{safeName\}\-</span>{ts}.md`; let targetFolderPath = this.plugin.settings.chatExportFolderPath?.trim(); let targetFolder: TFolder | null = null; if (targetFolderPath) { targetFolderPath = normalizePath(targetFolderPath); const abstractFile = this.app.vault.getAbstractFileByPath(targetFolderPath); if (!abstractFile) { try { await this.app.vault.createFolder(targetFolderPath); targetFolder = this.app.vault.getAbstractFileByPath(targetFolderPath) as TFolder; if (targetFolder) new Notice(`Created export folder: ${targetFolderPath}`); } catch (err) { new Notice(`Error creating export folder. Saving to vault root.`); targetFolder = this.app.vault.getRoot(); } } else if (abstractFile instanceof TFolder) { targetFolder = abstractFile; } else { new Notice(`Error: Export path not a folder. Saving to vault root.`); targetFolder = this.app.vault.getRoot(); } } else { targetFolder = this.app.vault.getRoot(); } if (!targetFolder) { new Notice("Error determining export folder."); return; } const filePath = normalizePath(`<span class="math-inline">\{targetFolder\.path\}/</span>{fName}`); const file = await this.app.vault.create(filePath, md); new Notice(`Chat exported to ${file.path}`); } catch (error) { new Notice("Error exporting chat."); console.error(error); } }
  private handleSettingsClick = async (): Promise<void> => { this.closeMenu(); console.log("[OllamaView Debug] Action: Settings"); (this.app as any).setting?.open?.(); (this.app as any).setting?.openTabById?.(this.plugin.manifest.id); }
  private handleDocumentClickForMenu = (e: MouseEvent): void => { if (this.isMenuOpen() && !this.menuButton?.contains(e.target as Node) && !this.menuDropdown?.contains(e.target as Node)) { this.closeMenu(); } }

  // --- Plugin Event Handlers ---
  // private handleModelChange = (modelName: string): void => { this.updateInputPlaceholder(modelName); if (this.currentMessages.length > 0) this.addMessageToDisplay("system", `Model changed to: ${modelName}`, new Date()); }
  private handleModelChange = (modelName: string): void => {
    // this.updateInputPlaceholder(modelName); // Більше не оновлюємо плейсхолдер тут
    this.updateModelDisplay(modelName); // Тільки дисплей моделі
    if (this.currentMessages.length > 0) {
      this.addMessageToDisplay("system", `Model changed to: ${modelName}`, new Date());
    }
  }
  // --- ЗМІНЕНО ---
  private handleRoleChange = (roleName: string): void => {
    const displayRole = roleName || "Default Assistant";
    // Оновлюємо плейсхолдер при зміні ролі
    this.updateInputPlaceholder(displayRole);
    if (this.currentMessages.length > 0) {
      this.addMessageToDisplay("system", `Role changed to: ${displayRole}`, new Date());
    } else {
      new Notice(`Role set to: ${displayRole}`);
    }
  }
  private handleRolesUpdated = (): void => { this.plugin.promptService?.clearRoleCache(); console.log("[OllamaView] Roles updated: Cleared prompt service role cache."); if (this.isMenuOpen()) { this.renderRoleList(); } }; // Refresh list if open
  private handleChatListUpdated = (): void => { console.log("[OllamaView] Chat list updated event received."); if (this.isMenuOpen()) { this.renderChatListMenu(); } }; // Refresh list if open
  private handleActiveChatChanged = (data: { chatId: string | null, chat: Chat | null }): void => { console.log(`[OllamaView] Active chat changed event received. New ID: ${data.chatId}`); this.loadAndDisplayActiveChat(); }
  private handleMessageAdded = (data: { chatId: string, message: Message }): void => { if (data.chatId === this.plugin.chatManager?.getActiveChatId()) { this.addMessageToDisplay(data.message.role, data.message.content, data.message.timestamp); if (this.isMenuOpen()) { this.renderChatListMenu(); } } } // Refresh list date if open
  private handleMessagesCleared = (chatId: string): void => { if (chatId === this.plugin.chatManager?.getActiveChatId()) { console.log("[OllamaView] Messages cleared event received."); this.clearChatContainerInternal(); this.currentMessages = []; this.showEmptyState(); } }

  // --- Window/Workspace State Handlers ---
  private handleVisibilityChange = (): void => { if (document.visibilityState === 'visible' && this.leaf.view === this) { requestAnimationFrame(() => { this.guaranteedScrollToBottom(50, true); this.adjustTextareaHeight(); this.inputEl?.focus(); }); } }
  private handleActiveLeafChange = (leaf: WorkspaceLeaf | null): void => { if (leaf?.view === this) { this.inputEl?.focus(); setTimeout(() => this.guaranteedScrollToBottom(150, true), 100); } }
  private handleWindowResize = (): void => { if (this.resizeTimeout) clearTimeout(this.resizeTimeout); this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 100); };

  // --- Scroll Handling ---
  private handleScroll = (): void => { if (!this.chatContainer || !this.newMessagesIndicatorEl) return; const threshold = 150; const atBottom = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight < threshold; const previousScrolledUp = this.userScrolledUp; this.userScrolledUp = !atBottom; if (previousScrolledUp && atBottom) { this.newMessagesIndicatorEl.classList.remove(CSS_CLASS_VISIBLE); } }
  private handleNewMessageIndicatorClick = (): void => { if (this.chatContainer) { this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: 'smooth' }); } this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); this.userScrolledUp = false; }

  // --- UI Update Methods ---
  private updateInputPlaceholder(roleName: string | null | undefined): void {
    if (this.inputEl) {
      const displayRole = roleName || "Assistant"; // Запасний варіант
      this.inputEl.placeholder = `Message ${displayRole}...`; // Новий формат
    }
  }
  private closeMenu(): void { if (this.menuDropdown) { this.menuDropdown.style.display = "none"; this.collapseAllSubmenus(null); } }
  private autoResizeTextarea(): void { this.adjustTextareaHeight(); }

  private adjustTextareaHeight = (): void => {
    // Використовуємо requestAnimationFrame для плавності
    requestAnimationFrame(() => {
      // Перевіряємо наявність textarea та її батька
      if (!this.inputEl || !this.inputEl.parentElement) return;

      const textarea = this.inputEl;
      const container = textarea.parentElement as HTMLElement; // Батько = .chat-input-container
      // Знаходимо контроли всередині батька
      const controlsContainer = container.querySelector(`.${CSS_CLASS_INPUT_CONTROLS_CONTAINER}`) as HTMLElement;

      // Додаткова перевірка наявності контейнера контролів
      if (!controlsContainer) {
        console.error("Controls container not found inside input container.");
        return;
      }

      const computedTextareaStyle = window.getComputedStyle(textarea);
      const computedContainerStyle = window.getComputedStyle(container);

      // Обмеження висоти для textarea з її CSS
      const minTextareaHeight = parseFloat(computedTextareaStyle.minHeight) || 40;
      const maxTextareaHeight = parseFloat(computedTextareaStyle.maxHeight); // max-height самої textarea

      console.log("adjustTextareaHeight BOTH: Fired.");

      const originalTextareaHeight = textarea.style.height;
      textarea.style.height = 'auto'; // Скидання для вимірювання

      // Вимірювання в наступному кадрі
      requestAnimationFrame(() => {
        if (!textarea || !container || !controlsContainer) return; // Повторна перевірка

        const scrollHeight = textarea.scrollHeight;
        // Можна прибрати відновлення originalTextareaHeight, оскільки ми все одно встановимо нову висоту
        // textarea.style.height = originalTextareaHeight;

        // --- 1. Обчислення висоти для Textarea ---
        let newTextareaHeight = Math.max(minTextareaHeight, scrollHeight);

        // Застосовуємо обмеження CSS max-height до textarea
        if (!isNaN(maxTextareaHeight) && newTextareaHeight > maxTextareaHeight) {
          newTextareaHeight = maxTextareaHeight;
          console.log(`adjustTextareaHeight BOTH: Textarea capped by CSS max-height (${maxTextareaHeight}px).`);
          // Переконуємося, що overflow увімкнено для textarea
          if (textarea.style.overflowY !== 'auto' && textarea.style.overflowY !== 'scroll') {
            textarea.style.overflowY = 'auto';
          }
        }

        // --- 2. Обчислення висоти для Контейнера ---
        const controlsHeight = controlsContainer.offsetHeight; // Реальна висота блоку контролів
        const containerPaddingTop = parseFloat(computedContainerStyle.paddingTop) || 0;
        const containerPaddingBottom = parseFloat(computedContainerStyle.paddingBottom) || 0;
        // Відступ між textarea та controls (зазвичай margin-bottom на textarea)
        const textareaMarginBottom = parseFloat(computedTextareaStyle.marginBottom) || 0;

        // Формула: Паддінг_Верх + Висота_Textarea + Марджін_Textarea + Висота_Контролів + Паддінг_Низ
        const newContainerHeight = containerPaddingTop + newTextareaHeight + textareaMarginBottom + controlsHeight + containerPaddingBottom;

        // --- 3. Встановлення ОБИДВОХ висот ---
        textarea.style.height = `${newTextareaHeight}px`;
        container.style.height = `${newContainerHeight}px`; // Встановлюємо висоту контейнера

        console.log(`adjustTextareaHeight BOTH: Set textarea H=${newTextareaHeight}px, container H=${newContainerHeight}px`);

        // Логування реальних розмірів після встановлення (для діагностики)
        const renderedTextareaHeight = textarea.clientHeight;
        const renderedContainerHeight = container.clientHeight;
        console.log(`adjustTextareaHeight BOTH: Rendered textarea H=${renderedTextareaHeight}, container H=${renderedContainerHeight}`);
      });
    });
  }
  private updateSendButtonState(): void { if (!this.inputEl || !this.sendButton) return; const isDisabled = this.inputEl.value.trim() === '' || this.isProcessing; this.sendButton.disabled = isDisabled; this.sendButton.classList.toggle(CSS_CLASS_DISABLED, isDisabled); }
  public showEmptyState(): void { if (this.currentMessages.length === 0 && !this.emptyStateEl && this.chatContainer) { this.chatContainer.empty(); this.emptyStateEl = this.chatContainer.createDiv({ cls: CSS_CLASS_EMPTY_STATE }); this.emptyStateEl.createDiv({ cls: "empty-state-message", text: "No messages yet" }); const modelName = this.plugin?.settings?.modelName || "the AI"; this.emptyStateEl.createDiv({ cls: "empty-state-tip", text: `Type a message or use the menu options to start interacting with ${modelName}.` }); } }
  public hideEmptyState(): void { if (this.emptyStateEl) { this.emptyStateEl.remove(); this.emptyStateEl = null; } }
  public setLoadingState(isLoading: boolean): void { console.log(`[OllamaView Debug] setLoadingState CALLED with: ${isLoading}`); this.isProcessing = isLoading; if (this.inputEl) this.inputEl.disabled = isLoading; this.updateSendButtonState(); if (this.voiceButton) { this.voiceButton.disabled = isLoading; this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } if (this.translateInputButton) { this.translateInputButton.disabled = isLoading; this.translateInputButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } if (this.menuButton) { this.menuButton.disabled = isLoading; this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } console.log(`[OllamaView Debug] isProcessing is now: ${this.isProcessing}`); }

  async loadAndDisplayActiveChat(): Promise<void> {
    console.log("[OllamaView] Loading and displaying active chat...");
    this.clearChatContainerInternal();
    this.currentMessages = [];
    this.lastRenderedMessageDate = null;

    let currentModelName = this.plugin.settings.modelName;
    // Викликаємо переписаний getCurrentRoleDisplayName, він сам визначить потрібну роль
    let currentRoleName = await this.getCurrentRoleDisplayName();

    try {
      const activeChat = await this.plugin.chatManager?.getActiveChat();

      if (activeChat) {
        // Отримуємо модель з метаданих активного чату
        currentModelName = activeChat.metadata.modelName || this.plugin.settings.modelName;
        // Роль вже визначена вище через getCurrentRoleDisplayName, яка враховує activeChat

        if (activeChat.messages.length > 0) {
          console.log(`[OllamaView] Active chat '${activeChat.metadata.name}' found with ${activeChat.messages.length} messages.`);
          this.hideEmptyState();
          this.renderMessages(activeChat.messages);
          this.checkAllMessagesForCollapsing();
          setTimeout(() => { this.guaranteedScrollToBottom(100, true); }, 150);
        } else {
          console.log(`[OllamaView] Active chat '${activeChat.metadata.name}' found but is empty.`);
          this.showEmptyState();
        }
      } else {
        console.warn("[OllamaView] No active chat found or failed to load.");
        this.showEmptyState();
        // Модель та роль вже встановлені на глобальні значення за замовчуванням вище
      }
    } catch (error) {
      console.error("[OllamaView] Error getting active chat:", error);
      this.showEmptyState();
      new Notice("Error loading chat history.");
      // Модель та роль вже встановлені на глобальні значення за замовчуванням вище
    } finally {
      // Оновлюємо плейсхолдер РОЛІ та дисплей МОДЕЛІ в кінці
      this.updateInputPlaceholder(currentRoleName);
      this.updateModelDisplay(currentModelName);
    }
  }

  /** Renders a list of messages to the chat container */
  private renderMessages(messagesToRender: Message[]): void {
    this.clearChatContainerInternal(); // Ensure container is empty first
    this.currentMessages = [...messagesToRender]; // Update local cache
    this.lastRenderedMessageDate = null; // Reset date separator logic

    messagesToRender.forEach(message => {
      this.renderMessageInternal(message, messagesToRender); // Render each message
    });
    //console.log(`[OllamaView] Rendered ${messagesToRender.length} messages.`);
  }

  /** Appends a single message to the display */
  addMessageToDisplay(role: MessageRole, content: string, timestamp: Date): void {
    // Avoid adding if container doesn't exist (e.g., during close)
    if (!this.chatContainer) return;

    const newMessage: Message = { role, content, timestamp };
    const currentContext = [...this.currentMessages]; // Capture context *before* adding

    // Render the new message using the captured context
    const messageEl = this.renderMessageInternal(newMessage, [...currentContext, newMessage]);

    // Update local cache AFTER rendering to ensure correct prevMessage context
    this.currentMessages.push(newMessage);

    if (messageEl) {
      this.checkMessageForCollapsing(messageEl); // Check height for collapsing
    }

    // Handle scrolling and new message indicator
    const isUserOrError = role === "user" || role === "error";
    if (!isUserOrError && this.userScrolledUp && this.newMessagesIndicatorEl) {
      this.newMessagesIndicatorEl.classList.add(CSS_CLASS_VISIBLE); // Show indicator
    } else if (!this.userScrolledUp) {
      // Scroll down if user is already at the bottom
      const forceScroll = !isUserOrError; // Force scroll more reliably for AI messages
      // Use slightly longer delay for AI messages to allow rendering
      this.guaranteedScrollToBottom(forceScroll ? 100 : 50, forceScroll);
    }

    this.hideEmptyState(); // Ensure empty state is hidden
  }

  /** Sends the user's input as a message and gets a response */
  async sendMessage(): Promise<void> {
    const content = this.inputEl.value.trim();
    if (!content || this.isProcessing || this.sendButton.disabled) return;

    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat) {
      new Notice("Error: No active chat session found.");
      return;
    }

    const userMessageContent = this.inputEl.value; // Keep original formatting
    this.clearInputField(); // Clear input immediately
    this.setLoadingState(true); // Disable UI, set processing state
    this.hideEmptyState();

    let loadingEl: HTMLElement | null = null; // To hold the loading indicator element

    try {
      // 1. Add user message to ChatManager (triggers 'message-added' event for display)
      const userMessage = await this.plugin.chatManager.addMessageToActiveChat('user', userMessageContent);
      if (!userMessage) throw new Error("Failed to add user message to history.");
      // User message appears via event handler

      // 2. Show loading indicator *after* user message is likely added
      loadingEl = this.addLoadingIndicator();
      this.guaranteedScrollToBottom(50, true); // Scroll to show indicator

      // 3. Call OllamaService to get AI response
      //console.log("[OllamaView] Requesting AI response...");
      const assistantMessage = await this.plugin.ollamaService.generateChatResponse(activeChat);
      //console.log("[OllamaView] Received response from service.");

      // Remove indicator BEFORE adding assistant message
      if (loadingEl) { this.removeLoadingIndicator(loadingEl); loadingEl = null; }

      // 4. Add assistant message to ChatManager (triggers 'message-added' event)
      if (assistantMessage) {
        await this.plugin.chatManager.addMessageToActiveChat(assistantMessage.role, assistantMessage.content);
        // Assistant message appears via event handler
      } else {
        //console.warn("[OllamaView] Service returned null assistant message.");
        // Add error directly to display (as ChatManager won't add a null message)
        this.addMessageToDisplay("error", "Assistant did not provide a response.", new Date());
      }

    } catch (error: any) {
      //console.error("[OllamaView] Send/receive cycle error:", error);
      if (loadingEl) { this.removeLoadingIndicator(loadingEl); loadingEl = null; } // Ensure indicator removed on error
      // Add error directly to display
      this.addMessageToDisplay("error", `Error: ${error.message || 'Unknown error.'}`, new Date());
    } finally {
      // Ensure indicator is removed in all cases (if somehow missed)
      if (loadingEl) { this.removeLoadingIndicator(loadingEl); }
      this.setLoadingState(false); // Re-enable UI
      this.focusInput(); // Return focus to input field
    }
  }

  // --- Core Rendering Logic ---

  /** Renders a single message bubble based on the message object and context */
  private renderMessageInternal(message: Message, messageContext: Message[]): HTMLElement | null {
    const messageIndex = messageContext.findIndex(m => m === message);
    if (messageIndex === -1) return null; // Should not happen

    const prevMessage = messageIndex > 0 ? messageContext[messageIndex - 1] : null;
    const isNewDay = !this.lastRenderedMessageDate || !this.isSameDay(this.lastRenderedMessageDate, message.timestamp);

    // --- Date Separator ---
    if (isNewDay) {
      this.renderDateSeparator(message.timestamp);
      this.lastRenderedMessageDate = message.timestamp;
    } else if (messageIndex === 0 && !this.lastRenderedMessageDate) {
      this.lastRenderedMessageDate = message.timestamp; // Set for the very first message
    }

    // --- Grouping Logic ---
    let messageGroup: HTMLElement | null = null;
    let groupClass = CSS_CLASS_MESSAGE_GROUP;
    let messageClass = `${CSS_CLASS_MESSAGE} ${CSS_CLASS_MESSAGE_ARRIVING}`;
    let showAvatar = true;
    let isUser = false;
    const isFirstInGroup = !prevMessage || prevMessage.role !== message.role || isNewDay;

    switch (message.role) {
      case "user": groupClass += ` ${CSS_CLASS_USER_GROUP}`; messageClass += ` ${CSS_CLASS_USER_MESSAGE}`; isUser = true; break;
      case "assistant": groupClass += ` ${CSS_CLASS_OLLAMA_GROUP}`; messageClass += ` ${CSS_CLASS_OLLAMA_MESSAGE}`; break;
      case "system": groupClass += ` ${CSS_CLASS_SYSTEM_GROUP}`; messageClass += ` ${CSS_CLASS_SYSTEM_MESSAGE}`; showAvatar = false; break;
      case "error": groupClass += ` ${CSS_CLASS_ERROR_GROUP}`; messageClass += ` ${CSS_CLASS_ERROR_MESSAGE}`; showAvatar = false; break;
    }

    const lastElement = this.chatContainer.lastElementChild as HTMLElement;
    if (isFirstInGroup || !lastElement || !lastElement.matches(`.${groupClass.split(' ')[1]}`)) {
      messageGroup = this.chatContainer.createDiv({ cls: groupClass });
      if (showAvatar) this.renderAvatar(messageGroup, isUser);
    } else {
      messageGroup = lastElement;
    }

    // --- Element Creation ---
    //TODO: checkit
    // const messageEl = messageGroup.createDiv({ cls: messageClass });

    let messageWrapper = messageGroup.querySelector('.message-wrapper') as HTMLElement;
    if (!messageWrapper) {
      messageWrapper = messageGroup.createDiv({ cls: 'message-wrapper' });
      // Ensure correct order relative to avatar based on group type
      if (messageGroup.classList.contains(CSS_CLASS_USER_GROUP)) {
        messageWrapper.style.order = '1'; // Messages first
      } else {
        messageWrapper.style.order = '2'; // Messages second
      }
    }
    const messageEl = messageWrapper.createDiv({ cls: messageClass }); // Append message to wrapper

    const contentContainer = messageEl.createDiv({ cls: CSS_CLASS_CONTENT_CONTAINER });
    const contentEl = contentContainer.createDiv({ cls: CSS_CLASS_CONTENT });

    // --- Render Content ---
    switch (message.role) {
      case "assistant":
      case "user":
        contentEl.addClass(CSS_CLASS_CONTENT_COLLAPSIBLE);
        if (message.role === 'assistant') {
          this.renderAssistantContent(contentEl, message.content);
        } else {
          message.content.split("\n").forEach((line, i, arr) => {
            contentEl.appendText(line);
            if (i < arr.length - 1) contentEl.createEl("br");
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

    // --- Action Buttons ---
    const buttonsWrapper = contentContainer.createDiv({ cls: 'message-actions-wrapper' });
    if (message.role !== "system" && message.role !== "error") {
      const copyBtn = buttonsWrapper.createEl("button", { cls: CSS_CLASS_COPY_BUTTON, attr: { title: "Copy", 'aria-label': "Copy message content" } });
      setIcon(copyBtn, "copy");
      this.registerDomEvent(copyBtn, "click", (e) => { e.stopPropagation(); this.handleCopyClick(message.content, copyBtn); });
    }
    if (this.plugin.settings.enableTranslation && this.plugin.settings.translationTargetLanguage && (message.role === "user" || message.role === "assistant")) {
      const targetLangName = LANGUAGES[this.plugin.settings.translationTargetLanguage] || this.plugin.settings.translationTargetLanguage;
      const translateBtn = buttonsWrapper.createEl("button", { cls: CSS_CLASS_TRANSLATE_BUTTON, attr: { title: `Translate to ${targetLangName}`, 'aria-label': "Translate message" } });
      setIcon(translateBtn, "languages");
      this.registerDomEvent(translateBtn, "click", (e) => { e.stopPropagation(); this.handleTranslateClick(message.content, contentEl, translateBtn); });
    }

    // --- Timestamp ---
    messageEl.createDiv({ cls: CSS_CLASS_TIMESTAMP, text: this.formatTime(message.timestamp) });

    // --- Animation Cleanup ---
    setTimeout(() => messageEl.classList.remove(CSS_CLASS_MESSAGE_ARRIVING), 500);

    return messageEl;
  }

  // --- Action Button Handlers ---
  private handleCopyClick(content: string, buttonEl: HTMLElement): void {
    let textToCopy = content;
    // Decode HTML and remove <think> tags before copying
    if (this.detectThinkingTags(this.decodeHtmlEntities(content)).hasThinkingTags) {
      textToCopy = this.decodeHtmlEntities(content).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }
    navigator.clipboard.writeText(textToCopy).then(() => {
      setIcon(buttonEl, "check"); buttonEl.setAttribute("title", "Copied!");
      setTimeout(() => { setIcon(buttonEl, "copy"); buttonEl.setAttribute("title", "Copy"); }, 2000);
    }).catch(err => {
      //console.error("Copy failed:", err); new Notice("Failed to copy text.");
    });
  }
  private async handleTranslateClick(originalContent: string, contentEl: HTMLElement, buttonEl: HTMLButtonElement): Promise<void> {
    const targetLang = this.plugin.settings.translationTargetLanguage;
    const apiKey = this.plugin.settings.googleTranslationApiKey;
    if (!targetLang || !apiKey) {
      new Notice("Translation not configured. Please check language and API key in settings.");
      return;
    }

    let textToTranslate = originalContent;
    if (this.detectThinkingTags(this.decodeHtmlEntities(originalContent)).hasThinkingTags) {
      textToTranslate = this.decodeHtmlEntities(originalContent).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }
    if (!textToTranslate) return; // Nothing to translate

    // Remove previous translation if exists
    contentEl.querySelector(`.${CSS_CLASS_TRANSLATION_CONTAINER}`)?.remove();

    // Set loading state
    setIcon(buttonEl, "loader"); buttonEl.disabled = true;
    buttonEl.classList.add(CSS_CLASS_TRANSLATION_PENDING); buttonEl.setAttribute("title", "Translating...");

    try {
      const translatedText = await this.plugin.translationService.translate(textToTranslate, targetLang);
      if (translatedText !== null) {
        const translationContainer = contentEl.createDiv({ cls: CSS_CLASS_TRANSLATION_CONTAINER });
        translationContainer.createDiv({ cls: CSS_CLASS_TRANSLATION_CONTENT, text: translatedText });
        const targetLangName = LANGUAGES[targetLang] || targetLang;
        translationContainer.createEl('div', { cls: 'translation-indicator', text: `[Translated to ${targetLangName}]` });
        this.guaranteedScrollToBottom(50, false); // Scroll if needed
      } // Error notice shown by service if null
    } catch (error) {
      //console.error("Error during translation click handling:", error);
      new Notice("An unexpected error occurred during translation.");
    } finally {
      // Restore button state
      setIcon(buttonEl, "languages"); buttonEl.disabled = false;
      buttonEl.classList.remove(CSS_CLASS_TRANSLATION_PENDING);
      const targetLangName = LANGUAGES[targetLang] || targetLang;
      buttonEl.setAttribute("title", `Translate to ${targetLangName}`);
    }
  }

  // --- Rendering Helpers ---
  private renderAvatar(groupEl: HTMLElement, isUser: boolean): void {
    const settings = this.plugin.settings;
    const avatarType = isUser ? settings.userAvatarType : settings.aiAvatarType;
    const avatarContent = isUser ? settings.userAvatarContent : settings.aiAvatarContent;
    const avatarClass = isUser ? CSS_CLASS_AVATAR_USER : CSS_CLASS_AVATAR_AI;
    const avatarEl = groupEl.createDiv({ cls: `${CSS_CLASS_AVATAR} ${avatarClass}` });

    if (avatarType === 'initials') {
      avatarEl.textContent = avatarContent || (isUser ? 'U' : 'A');
    } else if (avatarType === 'icon') {
      try {
        setIcon(avatarEl, avatarContent || (isUser ? 'user' : 'bot'));
      } catch (e) {
        //console.warn(`Failed to set avatar icon "${avatarContent}". Falling back to initials.`, e);
        avatarEl.textContent = isUser ? 'U' : 'A'; // Fallback
      }
    } else {
      avatarEl.textContent = isUser ? 'U' : 'A'; // Default fallback
    }
  }
  private renderDateSeparator(date: Date): void {
    if (!this.chatContainer) return;
    this.chatContainer.createDiv({ cls: CSS_CLASS_DATE_SEPARATOR, text: this.formatDateSeparator(date) });
  }
  private renderAssistantContent(containerEl: HTMLElement, content: string): void {
    // Decode entities first for tag detection and rendering
    const decodedContent = this.decodeHtmlEntities(content);
    const thinkingInfo = this.detectThinkingTags(decodedContent);

    containerEl.empty(); // Clear previous content

    if (thinkingInfo.hasThinkingTags) {
      // Process content with <think> tags
      const processedHtml = this.processThinkingTags(decodedContent);
      containerEl.innerHTML = processedHtml; // Set innerHTML for complex structure
      this.addThinkingToggleListeners(containerEl); // Add listeners for foldouts
      this.addCodeBlockEnhancements(containerEl); // Enhance code blocks within generated HTML
    } else {
      // Render standard Markdown content
      MarkdownRenderer.renderMarkdown(
        decodedContent, // Use decoded content for rendering
        containerEl,
        this.app.vault.getRoot()?.path ?? "", // Source path context
        this // Component context for links etc.
      );
      this.addCodeBlockEnhancements(containerEl); // Enhance standard code blocks
    }
  }
  private addCodeBlockEnhancements(contentEl: HTMLElement): void {
    contentEl.querySelectorAll("pre").forEach(pre => {
      // Prevent adding button multiple times
      if (pre.querySelector(`.${CSS_CLASS_CODE_BLOCK_COPY_BUTTON}`)) return;

      const code = pre.querySelector("code");
      if (!code) return;

      const codeText = code.textContent || "";

      // Add language identifier badge
      const langClass = Array.from(code.classList).find(cls => cls.startsWith("language-"));
      if (langClass) {
        const lang = langClass.replace("language-", "");
        if (lang) {
          // Check if language badge already exists (added robustness)
          if (!pre.querySelector(`.${CSS_CLASS_CODE_BLOCK_LANGUAGE}`)) {
            pre.createEl("span", { cls: CSS_CLASS_CODE_BLOCK_LANGUAGE, text: lang });
          }
        }
      }

      // Add copy button
      const copyBtn = pre.createEl("button", { cls: CSS_CLASS_CODE_BLOCK_COPY_BUTTON });
      setIcon(copyBtn, "copy");
      copyBtn.setAttribute("title", "Copy Code");
      copyBtn.setAttribute("aria-label", "Copy code block"); // Accessibility

      // Use registerDomEvent for reliable cleanup
      this.registerDomEvent(copyBtn, "click", e => {
        e.stopPropagation();
        navigator.clipboard.writeText(codeText).then(() => {
          setIcon(copyBtn, "check"); copyBtn.setAttribute("title", "Copied!");
          setTimeout(() => { setIcon(copyBtn, "copy"); copyBtn.setAttribute("title", "Copy Code"); }, 1500);
        }).catch(err => {
          //console.error("Code block copy failed:", err); 
          new Notice("Failed to copy code.");
        });
      });
    });
  }

  // --- Menu List Rendering (Accordion Style) ---
  private async renderModelList(): Promise<void> {
    const container = this.modelSubmenuContent; if (!container) return; container.empty();
    const modelIconMap: Record<string, string> = { 'llama': 'box-minimal', 'mistral': 'wind', /*...*/ }; const defaultIcon = 'box';
    try {
      const models = await this.plugin.ollamaService.getModels(); const activeChat = await this.plugin.chatManager?.getActiveChat(); const currentModelName = activeChat?.metadata?.modelName || this.plugin.settings.modelName;
      if (models.length === 0) { container.createEl("div", { cls: "menu-info-text", text: "No models." }); return; }
      models.forEach(modelName => {
        const optionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MODEL_OPTION}` }); const iconSpan = optionEl.createEl("span", { cls: "menu-option-icon" }); let iconToUse = defaultIcon;
        if (modelName === currentModelName) { iconToUse = "check"; optionEl.addClass("is-selected"); } else { const l = modelName.toLowerCase(); let f = false; for (const k in modelIconMap) { if (l.includes(k)) { iconToUse = modelIconMap[k]; f = true; break; } } if (!f) iconToUse = defaultIcon; }
        try { setIcon(iconSpan, iconToUse); } catch (e) { iconSpan.style.minWidth = "18px"; }
        optionEl.createEl("span", { cls: "menu-option-text", text: modelName });
        this.registerDomEvent(optionEl, 'click', async () => {
          if (modelName !== currentModelName) { const chat = await this.plugin.chatManager?.getActiveChat(); if (chat) await this.plugin.chatManager.updateActiveChatMetadata({ modelName: modelName }); else new Notice("No active chat."); } this.closeMenu();
        });
      });
      this.updateSubmenuHeight(container);
    } catch (error) { container.empty(); container.createEl("div", { cls: "menu-error-text", text: "Error models." }); this.updateSubmenuHeight(container); }
  }
  private async renderRoleList(): Promise<void> {
    const container = this.roleSubmenuContent; if (!container) return; container.empty();
    try {
      const roles = await this.plugin.listRoleFiles(true); const activeChat = await this.plugin.chatManager?.getActiveChat(); const currentChatRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;
      const noRoleOptionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}` }); const noRoleIconSpan = noRoleOptionEl.createEl("span", { cls: "menu-option-icon" }); if (!currentChatRolePath) { setIcon(noRoleIconSpan, "check"); noRoleOptionEl.addClass("is-selected"); } else { setIcon(noRoleIconSpan, "slash"); noRoleIconSpan.style.minWidth = "18px"; } noRoleOptionEl.createEl("span", { cls: "menu-option-text", text: "None (Default)" }); this.registerDomEvent(noRoleOptionEl, 'click', async () => { const nrp = ""; if (this.plugin.settings.selectedRolePath !== nrp || currentChatRolePath !== nrp) { this.plugin.settings.selectedRolePath = nrp; await this.plugin.saveSettings(); const chat = await this.plugin.chatManager?.getActiveChat(); if (chat && chat.metadata.selectedRolePath !== nrp) { await this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: nrp }); this.plugin.promptService?.clearRoleCache?.(); } this.plugin.emit('role-changed', "Default Assistant"); } this.closeMenu(); });
      if (roles.length > 0) container.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });
      roles.forEach(roleInfo => {
        const roleOptionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}` }); if (roleInfo.isCustom) roleOptionEl.addClass("is-custom"); const iconSpan = roleOptionEl.createEl("span", { cls: "menu-option-icon" }); if (roleInfo.path === currentChatRolePath) { setIcon(iconSpan, "check"); roleOptionEl.addClass("is-selected"); } else { setIcon(iconSpan, roleInfo.isCustom ? 'user' : 'box'); iconSpan.style.minWidth = "18px"; } roleOptionEl.createEl("span", { cls: "menu-option-text", text: roleInfo.name }); this.registerDomEvent(roleOptionEl, 'click', async () => { const nrp = roleInfo.path; if (this.plugin.settings.selectedRolePath !== nrp || currentChatRolePath !== nrp) { this.plugin.settings.selectedRolePath = nrp; await this.plugin.saveSettings(); const chat = await this.plugin.chatManager?.getActiveChat(); if (chat && chat.metadata.selectedRolePath !== nrp) { await this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: nrp }); this.plugin.promptService?.clearRoleCache?.(); } this.plugin.emit('role-changed', roleInfo.name); } this.closeMenu(); });
      });
      this.updateSubmenuHeight(container);
    } catch (error) { container.empty(); container.createEl("div", { cls: "menu-error-text", text: "Error roles." }); this.updateSubmenuHeight(container); }
  }
  private async renderChatListMenu(): Promise<void> {
    const container = this.chatSubmenuContent; if (!container) return; container.empty();
    try {
      const chats = this.plugin.chatManager?.listAvailableChats() || []; const currentActiveId = this.plugin.chatManager?.getActiveChatId();
      if (chats.length === 0) { container.createEl("div", { cls: "menu-info-text", text: "No saved chats." }); return; }
      chats.forEach(chatMeta => {
        const chatOptionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CHAT_OPTION}` }); const iconSpan = chatOptionEl.createEl("span", { cls: "menu-option-icon" }); if (chatMeta.id === currentActiveId) { setIcon(iconSpan, "check"); chatOptionEl.addClass("is-selected"); } else { setIcon(iconSpan, "message-square"); } const textSpan = chatOptionEl.createEl("span", { cls: "menu-option-text" }); textSpan.createEl('div', { cls: 'chat-option-name', text: chatMeta.name }); const dateText = this.formatRelativeDate(new Date(chatMeta.lastModified)); textSpan.createEl('div', { cls: 'chat-option-date', text: dateText }); this.registerDomEvent(chatOptionEl, 'click', async () => { if (chatMeta.id !== this.plugin.chatManager?.getActiveChatId()) { await this.plugin.chatManager.setActiveChat(chatMeta.id); } this.closeMenu(); });
      });
      this.updateSubmenuHeight(container);
    } catch (error) { container.empty(); container.createEl("div", { cls: "menu-error-text", text: "Error chats." }); this.updateSubmenuHeight(container); }
  }
  private updateSubmenuHeight(contentEl: HTMLElement | null): void { if (contentEl && !contentEl.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN)) { requestAnimationFrame(() => { contentEl.style.maxHeight = contentEl.scrollHeight + 'px'; }); } }

  // --- Speech Recognition Methods ---

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
                //console.error("Google Speech API Error:", responseData);
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
               //console.error("Error in speech worker processing:", error);
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
      //console.log("Speech worker initialized.");

    } catch (error) {
      //console.error("Failed to initialize speech worker:", error);
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
        //console.error("Speech recognition error:", data.message);
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
        //console.warn("Received unexpected data format from speech worker:", data);
      }
      // If data is an empty string, do nothing (might happen with short silence)
      this.updateSendButtonState(); // Update button state after processing
    };

    this.speechWorker.onerror = (error) => {
      //console.error("Unhandled worker error:", error);
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
      //console.error("Спроба розпочати розпізнавання голосу без ініціалізованого worker'а.");
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
        //console.log(`Використовується підтримуваний mimeType: ${preferredMimeType}`);
        recorderOptions = { mimeType: preferredMimeType }; // Призначаємо об'єкт опцій, якщо підтримується
      } else {
        //console.warn(`${preferredMimeType} не підтримується, використовується стандартний браузера.`);
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
        //console.log("MediaRecorder stopped.");
        if (this.speechWorker && audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          //console.log(`Sending audio blob to worker: type=${audioBlob.type}, size=${audioBlob.size}`);
          this.inputEl.placeholder = "Processing speech..."; // Update placeholder
          this.speechWorker.postMessage({
            apiKey: this.plugin.settings.googleApiKey,
            audioBlob,
            languageCode: this.plugin.settings.speechLanguage || 'uk-UA'
          });
        } else if (audioChunks.length === 0) {
          //console.log("No audio data recorded.");
          this.updateInputPlaceholder(this.plugin.settings.modelName); // Restore placeholder if nothing was recorded
          this.updateSendButtonState(); // Ensure button state is correct
        }
      };
      this.mediaRecorder.onerror = (event) => {
        //console.error("MediaRecorder Error:", event);
        new Notice("An error occurred during recording.");
        this.stopVoiceRecording(false); // Stop without processing on error
      };

      // --- Старт запису ---
      this.mediaRecorder.start();
      //console.log("Recording started. MimeType:", this.mediaRecorder?.mimeType ?? 'default');

    } catch (error) {
      //console.error("Error accessing microphone or starting recording:", error);
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
    //console.log(`Stopping voice recording. Process audio: ${processAudio}`);
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
      //console.log("Audio stream tracks stopped.");
    }
    this.mediaRecorder = null;
  }



  // --- Thinking Tag Handling ---
  private processThinkingTags(content: string): string { /* ... (Implementation from previous responses) ... */ const r = /<think>([\s\S]*?)<\/think>/g; let i = 0; const p: string[] = []; let m; while ((m = r.exec(content)) !== null) { if (m.index > i) p.push(this.markdownToHtml(content.substring(i, m.index))); const c = m[1]; const h = `<div class="${CSS_CLASS_THINKING_BLOCK}"><div class="${CSS_CLASS_THINKING_HEADER}" data-fold-state="folded"><div class="${CSS_CLASS_THINKING_TOGGLE}">►</div><div class="${CSS_CLASS_THINKING_TITLE}">Thinking</div></div><div class="${CSS_CLASS_THINKING_CONTENT}" style="display: none;">${this.markdownToHtml(c)}</div></div>`; p.push(h); i = r.lastIndex; } if (i < content.length) p.push(this.markdownToHtml(content.substring(i))); return p.join(""); }
  private markdownToHtml(markdown: string): string { /* ... (Implementation from previous responses) ... */ if (!markdown?.trim()) return ""; const d = document.createElement("div"); MarkdownRenderer.renderMarkdown(markdown, d, this.app.workspace.getActiveFile()?.path ?? "", this); return d.innerHTML; }
  private addThinkingToggleListeners(contentEl: HTMLElement): void { /* ... (Implementation from previous responses) ... */ const h = contentEl.querySelectorAll<HTMLElement>(`.${CSS_CLASS_THINKING_HEADER}`); h.forEach(hdr => { this.registerDomEvent(hdr, "click", () => { const c = hdr.nextElementSibling as HTMLElement; const t = hdr.querySelector<HTMLElement>(`.${CSS_CLASS_THINKING_TOGGLE}`); if (!c || !t) return; const f = hdr.getAttribute("data-fold-state") === "folded"; if (f) { c.style.display = "block"; t.textContent = "▼"; hdr.setAttribute("data-fold-state", "expanded"); } else { c.style.display = "none"; t.textContent = "►"; hdr.setAttribute("data-fold-state", "folded"); } }); }); }
  private decodeHtmlEntities(text: string): string { /* ... (Implementation from previous responses) ... */ if (typeof document === 'undefined') { return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); } const ta = document.createElement("textarea"); ta.innerHTML = text; return ta.value; }
  private detectThinkingTags(content: string): { hasThinkingTags: boolean; format: string } { /* ... (Implementation from previous responses) ... */ return /<think>[\s\S]*?<\/think>/gi.test(content) ? { hasThinkingTags: true, format: "standard" } : { hasThinkingTags: false, format: "none" }; }

  // --- Message Collapsing ---
  private checkMessageForCollapsing(messageEl: HTMLElement): void { /* ... (Implementation from previous responses) ... */ const c = messageEl.querySelector<HTMLElement>(`.${CSS_CLASS_CONTENT_COLLAPSIBLE}`); const h = this.plugin.settings.maxMessageHeight; if (!c || h <= 0) return; requestAnimationFrame(() => { const b = messageEl.querySelector(`.${CSS_CLASS_SHOW_MORE_BUTTON}`); b?.remove(); c.style.maxHeight = ''; c.classList.remove(CSS_CLASS_CONTENT_COLLAPSED); const sh = c.scrollHeight; if (sh > h) { c.style.maxHeight = `${h}px`; c.classList.add(CSS_CLASS_CONTENT_COLLAPSED); const smb = messageEl.createEl('button', { cls: CSS_CLASS_SHOW_MORE_BUTTON, text: 'Show More ▼' }); this.registerDomEvent(smb, 'click', () => this.toggleMessageCollapse(c, smb)); } }); }
  private checkAllMessagesForCollapsing(): void { /* ... (Implementation from previous responses) ... */ this.chatContainer?.querySelectorAll<HTMLElement>(`.${CSS_CLASS_MESSAGE}`).forEach(msgEl => { this.checkMessageForCollapsing(msgEl); }); }
  private toggleMessageCollapse(contentEl: HTMLElement, buttonEl: HTMLButtonElement): void { /* ... (Implementation from previous responses) ... */ const i = contentEl.classList.contains(CSS_CLASS_CONTENT_COLLAPSED); const h = this.plugin.settings.maxMessageHeight; if (i) { contentEl.style.maxHeight = ''; contentEl.classList.remove(CSS_CLASS_CONTENT_COLLAPSED); buttonEl.setText('Show Less ▲'); } else { contentEl.style.maxHeight = `${h}px`; contentEl.classList.add(CSS_CLASS_CONTENT_COLLAPSED); buttonEl.setText('Show More ▼'); } }

  // --- Helpers & Utilities ---
  public getChatContainer(): HTMLElement { return this.chatContainer; }
  private clearChatContainerInternal(): void {
    // Clears the visual display area and resets related state
    this.currentMessages = [];
    this.lastRenderedMessageDate = null;
    if (this.chatContainer) this.chatContainer.empty();
    this.hideEmptyState(); // Ensure empty state is managed correctly
  }
  public clearDisplayAndState(): void {
    // Public method to completely clear the view
    this.clearChatContainerInternal();
    this.showEmptyState();
    this.updateSendButtonState();
    setTimeout(() => this.focusInput(), 50); // Refocus after clear
    //console.log("[OllamaView] Display and internal state cleared.");
  }
  public addLoadingIndicator(): HTMLElement {
    // Adds the visual "thinking" dots indicator
    this.hideEmptyState();
    const group = this.chatContainer.createDiv({ cls: `${CSS_CLASS_MESSAGE_GROUP} ${CSS_CLASS_OLLAMA_GROUP}` });
    this.renderAvatar(group, false); // Render AI avatar
    const message = group.createDiv({ cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_OLLAMA_MESSAGE}` });
    const dots = message.createDiv({ cls: CSS_CLASS_THINKING_DOTS });
    for (let i = 0; i < 3; i++) dots.createDiv({ cls: CSS_CLASS_THINKING_DOT });
    this.guaranteedScrollToBottom(50, true); // Scroll to show it
    return group; // Return the group element containing the indicator
  }
  public removeLoadingIndicator(loadingEl: HTMLElement | null): void {
    // Removes the loading indicator element
    if (loadingEl?.parentNode) {
      loadingEl.remove();
    }
  }
  public scrollToBottom(): void { this.guaranteedScrollToBottom(50, true); }
  public clearInputField(): void { if (this.inputEl) { this.inputEl.value = ""; this.inputEl.dispatchEvent(new Event('input')); } } // Trigger resize/button update
  public focusInput(): void { setTimeout(() => { this.inputEl?.focus(); }, 0); } // Use setTimeout to ensure focus happens after potential UI updates

  /** Guarantees scroll to bottom after a delay, respecting user scroll position unless forced */
  guaranteedScrollToBottom(delay = 50, forceScroll = false): void {
    if (this.scrollTimeout) { clearTimeout(this.scrollTimeout); this.scrollTimeout = null; }
    this.scrollTimeout = setTimeout(() => {
      requestAnimationFrame(() => { // Use rAF for smooth browser rendering
        if (this.chatContainer) {
          const threshold = 100; // Threshold to consider "scrolled up"
          const isScrolledUp = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight > threshold;

          // Update userScrolledUp state if it changed
          if (isScrolledUp !== this.userScrolledUp) {
            this.userScrolledUp = isScrolledUp;
            // Hide indicator immediately if user scrolls down manually
            if (!isScrolledUp) this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
          }

          // Scroll if forced, or if user is not scrolled up, or if AI is processing
          if (forceScroll || !this.userScrolledUp || this.isProcessing) {
            // Use smooth scrolling for a better UX unless processing (instant scroll better then)
            const behavior = this.isProcessing ? 'auto' : 'smooth';
            this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: behavior });
            // If we force scroll, assume user is now at bottom
            if (forceScroll) {
              this.userScrolledUp = false;
              this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
            }
          }
        } else {
          //console.warn("[OllamaView] guaranteedScrollToBottom: chatContainer not found.");
        }
      });
      this.scrollTimeout = null;
    }, delay);
  }

  // Formatting Helpers
  formatTime(date: Date): string { return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } // Use locale default time format
  formatDateSeparator(date: Date): string {
    const now = new Date(); const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (this.isSameDay(date, now)) return "Today";
    else if (this.isSameDay(date, yesterday)) return "Yesterday";
    else return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); // Locale default full date
  }
  formatRelativeDate(date: Date): string {
    const now = new Date();
    const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
    const diffDays = Math.floor(diffSeconds / (60 * 60 * 24));
    if (diffDays === 0) {
      const diffHours = Math.floor(diffSeconds / (60 * 60));
      if (diffHours < 1) return "Just now";
      if (diffHours === 1) return "1 hour ago";
      if (diffHours < now.getHours()) return `${diffHours} hours ago`;
      else return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); // e.g., Apr 4
    }
  }
  isSameDay(date1: Date, date2: Date): boolean { return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate(); }

  // /** Sets the loading state for the UI (disables/enables input elements) */
  // public setLoadingState(isLoading: boolean): void {
  //   this.isProcessing = isLoading;
  //   if (this.inputEl) this.inputEl.disabled = isLoading;
  //   this.updateSendButtonState(); // Send button depends on both text and processing state
  //   if (this.voiceButton) { this.voiceButton.disabled = isLoading; this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); }
  //   if (this.translateInputButton) { this.translateInputButton.disabled = isLoading; this.translateInputButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); }
  //   if (this.menuButton) { this.menuButton.disabled = isLoading; this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); }
  // }

  // Formatting function used by export
  private formatChatToMarkdown(messagesToFormat: Message[]): string {
    let localLastDate: Date | null = null;
    const exportTimestamp = new Date();
    let markdown = `# Ollama Chat Export\n` +
      `> Exported on: ${exportTimestamp.toLocaleString(undefined)}\n\n`; // Use locale default date/time

    messagesToFormat.forEach(message => {
      if (localLastDate === null || !this.isSameDay(localLastDate, message.timestamp)) {
        if (localLastDate !== null) markdown += `***\n`; // Separator between days
        markdown += `**${this.formatDateSeparator(message.timestamp)}**\n***\n\n`;
      }
      localLastDate = message.timestamp;

      const time = this.formatTime(message.timestamp);
      let prefix = "";
      let contentPrefix = "";
      switch (message.role) {
        case 'user': prefix = `**User (${time}):**\n`; break;
        case 'assistant': prefix = `**Assistant (${time}):**\n`; break;
        case 'system': prefix = `> _[System (${time})]_ \n> `; contentPrefix = "> "; break; // Quote block
        case 'error': prefix = `> [!ERROR] Error (${time}):\n> `; contentPrefix = "> "; break; // Admonition block
      }
      markdown += prefix;
      let content = message.content.trim();
      if (contentPrefix) {
        markdown += content.split('\n').join(`\n${contentPrefix}`) + "\n\n"; // Add prefix to each line
      } else if (content.includes('```')) {
        // Ensure blank lines around code blocks for proper rendering
        content = content.replace(/(\n*)```/g, "\n\n```").replace(/```(\n*)/g, "```\n\n");
        markdown += content.trim() + "\n\n";
      } else {
        markdown += content + "\n\n";
      }
    });
    return markdown.trim();
  }

  // private handleRenameChatClick = async (): Promise<void> => {
  //   this.closeMenu();
  //   const activeChat = await this.plugin.chatManager?.getActiveChat();
  //   if (!activeChat) {
  //     new Notice("No active chat to rename.");
  //     return;
  //   }
  //   const currentName = activeChat.metadata.name;

  //   // --- Використання PromptModal ---
  //   new PromptModal(
  //     this.app,
  //     'Rename Chat', // Заголовок вікна
  //     `Enter new name for "${currentName}":`, // Текст підказки
  //     currentName, // Початкове значення
  //     async (newName) => { // Функція, що виконається при Submit
  //       if (newName && newName.trim() !== "" && newName.trim() !== currentName) {
  //         //console.log(`[OllamaView] Renaming chat <span class="math-inline">\{activeChat\.metadata\.id\} to "</span>{newName.trim()}"`);
  //         const success = await this.plugin.chatManager.renameChat(activeChat.metadata.id, newName.trim());
  //         if (success) { new Notice(`Chat renamed to "${newName.trim()}"`); }
  //         else { new Notice("Failed to rename chat."); }
  //       } else {
  //         // Порожнє ім'я або не змінилося (або користувач нічого не ввів і натиснув Submit)
  //         // Можна додати перевірку на порожнє значення в самому PromptModal перед onSubmit
  //         if (newName?.trim() === currentName) {
  //           new Notice("Name unchanged.");
  //         } else {
  //           new Notice("Rename cancelled or invalid name entered.");
  //         }
  //       }
  //     }
  //   ).open(); // Відкриваємо модальне вікно
  //   // --- Кінець використання PromptModal ---
  // }

  // private handleDeleteChatClick = async (): Promise<void> => {
  //   this.closeMenu();
  //   const activeChat = await this.plugin.chatManager?.getActiveChat();
  //   if (!activeChat) {
  //     new Notice("No active chat to delete.");
  //     return;
  //   }
  //   const chatName = activeChat.metadata.name;

  //   // --- Використання ConfirmModal ---
  //   new ConfirmModal(
  //     this.app,
  //     'Delete Chat', // Заголовок
  //     `Are you sure you want to delete chat "${chatName}"?\nThis action cannot be undone.`, // Повідомлення
  //     async () => { // Функція, що виконається при Confirm
  //       //console.log(`[OllamaView] Deleting chat <span class="math-inline">\{activeChat\.metadata\.id\} \("</span>{chatName}")`);
  //       const success = await this.plugin.chatManager.deleteChat(activeChat.metadata.id);
  //       if (success) { new Notice(`Chat "${chatName}" deleted.`); }
  //       else { new Notice(`Failed to delete chat "${chatName}".`); }
  //     }
  //   ).open(); // Відкриваємо модальне вікно
  //   // --- Кінець використання ConfirmModal ---
  // }
  // private handleCloneChatClick = async (): Promise<void> => {
  //   this.closeMenu();
  //   const activeChat = await this.plugin.chatManager?.getActiveChat();
  //   if (!activeChat) {
  //     new Notice("No active chat to clone.");
  //     return;
  //   }
  //   const originalName = activeChat.metadata.name;
  //   //console.log(`[OllamaView] Cloning chat ${activeChat.metadata.id} ("${originalName}")`);
  //   const cloningNotice = new Notice("Cloning chat...", 0); // Повідомлення без автозникання

  //   try {
  //     // Викликаємо новий метод в ChatManager
  //     const clonedChat = await this.plugin.chatManager.cloneChat(activeChat.metadata.id);

  //     if (clonedChat) {
  //       cloningNotice.hide(); // Ховаємо повідомлення про клонування
  //       new Notice(`Chat cloned as "${clonedChat.metadata.name}" and activated.`);
  //       // View оновить себе через подію 'active-chat-changed',
  //       // яку викличе setActiveChat всередині cloneChat.
  //     } else {
  //       cloningNotice.hide();
  //       new Notice("Failed to clone chat.");
  //     }
  //   } catch (error) {
  //     cloningNotice.hide();
  //     //console.error("Error cloning chat:", error);
  //     new Notice("An error occurred while cloning the chat.");
  //   }
  // }

  private async getCurrentRoleDisplayName(): Promise<string> {
    try {
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      // Визначаємо, який шлях до ролі використовувати: з чату чи глобальний
      const rolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;

      if (rolePath) {
        // Отримуємо список всіх доступних ролей
        // УВАГА: Це може бути неефективно, якщо listRoleFiles читає файли щоразу.
        // Розгляньте кешування списку ролей у майбутньому.
        const allRoles = await this.plugin.listRoleFiles(true); // true - включаючи кастомні

        // Знаходимо потрібну роль за шляхом
        const foundRole = allRoles.find(role => role.path === rolePath);

        if (foundRole) {
          return foundRole.name; // Повертаємо знайдене ім'я
        } else {
          console.warn(`Role with path "${rolePath}" not found in listRoleFiles results.`);
          // Якщо шлях є, але роль не знайдена (наприклад, файл видалено), повертаємо заглушку
          return rolePath.split('/').pop()?.replace('.md', '') || "Selected Role"; // Спробуємо отримати ім'я з шляху
        }
      }
    } catch (error) {
      console.error("Error getting current role display name:", error);
    }
    // Повертаємо стандартне ім'я, якщо роль не вибрана або сталася помилка
    return "Default Assistant";
  }
  // --- КІНЕЦЬ ПЕРЕПИСАНОЇ ФУНКЦІЇ ---


} // END OF OllamaView CLASS