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
  Platform,
} from "obsidian";
// Імпортуємо модальні вікна
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import OllamaPlugin from "./main"; // Головний клас плагіна
import { AvatarType } from "./settings"; // Типи налаштувань
import { RoleInfo } from "./ChatManager"; // Тип RoleInfo
import { Chat, ChatMetadata } from "./Chat"; // Клас Chat та типи
import { SummaryModal } from "./SummaryModal";
import { Message, OllamaGenerateResponse } from "./types";
import { CSS_CLASSES } from "./constants";

import * as RendererUtils from "./MessageRendererUtils";
import { UserMessageRenderer } from "./renderers/UserMessageRenderer";
import { AssistantMessageRenderer } from "./renderers/AssistantMessageRenderer";
import { SystemMessageRenderer } from "./renderers/SystemMessageRenderer";
import { ErrorMessageRenderer } from "./renderers/ErrorMessageRenderer";
import { BaseMessageRenderer } from "./renderers/BaseMessageRenderer";
import { SidebarManager } from './SidebarManager'; // <--- Імпортуємо новий клас

export const VIEW_TYPE_OLLAMA_PERSONAS = "ollama-personas-chat-view";

const SCROLL_THRESHOLD = 150; // Поріг для визначення "прокручено вгору"

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
const CSS_CLASS_SETTINGS_OPTION = "settings-option";
const CSS_CLASS_EMPTY_STATE = "ollama-empty-state";
// export const CSS_CLASS_MESSAGE_GROUP = "message-group";
const CSS_CLASS_USER_GROUP = "user-message-group";

const CSS_CLASS_OLLAMA_GROUP = "ollama-message-group";
const CSS_CLASS_USER_MESSAGE = "user-message";
const CSS_CLASS_ERROR_GROUP = "error-message-group";
const CSS_CLASS_ERROR_MESSAGE = "error-message";
const CSS_CLASS_COPY_BUTTON = "copy-button";
const CSS_CLASS_TRANSLATE_BUTTON = "translate-button";
const CSS_CLASS_DELETE_MESSAGE_BUTTON = "delete-message-button";

// export const CSS_CLASS_SYSTEM_GROUP = "system-message-group";
export const CSS_CLASS_MESSAGE = "message";
// const CSS_CLASS_OLLAMA_MESSAGE = "ollama-message";
// export const CSS_CLASS_SYSTEM_MESSAGE = "system-message";
// export const CSS_CLASS_SYSTEM_ICON = "system-icon";
const CSS_CLASS_ERROR_ICON = "error-icon";
// export const CSS_CLASS_SYSTEM_TEXT = "system-message-text";
const CSS_CLASS_ERROR_TEXT = "error-message-text";
// export const CSS_CLASS_CONTENT_CONTAINER = "message-content-container";
const CSS_CLASS_CONTENT = "message-content";
const CSS_CLASS_THINKING_DOTS = "thinking-dots";
const CSS_CLASS_THINKING_DOT = "thinking-dot";
const CSS_CLASS_THINKING_BLOCK = "thinking-block";
const CSS_CLASS_THINKING_HEADER = "thinking-header";
const CSS_CLASS_THINKING_TOGGLE = "thinking-toggle";
const CSS_CLASS_THINKING_TITLE = "thinking-title";
const CSS_CLASS_THINKING_CONTENT = "thinking-content";
// export const CSS_CLASS_TIMESTAMP = "message-timestamp";

const CSS_CLASS_TRANSLATION_CONTAINER = "translation-container";
const CSS_CLASS_TRANSLATION_CONTENT = "translation-content";
const CSS_CLASS_TRANSLATION_PENDING = "translation-pending";
const CSS_CLASS_BUTTON_SPACER = "button-spacer";
const CSS_CLASS_TEXTAREA_EXPANDED = "expanded";
const CSS_CLASS_RECORDING = "recording";
const CSS_CLASS_DISABLED = "disabled";
const CSS_CLASS_MESSAGE_ARRIVING = "message-arriving";
const CSS_CLASS_DATE_SEPARATOR = "chat-date-separator";
// const CSS_CLASS_AVATAR = "message-group-avatar";
const CSS_CLASS_AVATAR_USER = "user-avatar";
// const CSS_CLASS_AVATAR_AI = "ai-avatar";
const CSS_CLASS_NEW_MESSAGE_INDICATOR = "new-message-indicator";
const CSS_CLASS_VISIBLE = "visible";
const CSS_CLASS_MENU_SEPARATOR = "menu-separator";
const CSS_CLASS_CLEAR_CHAT_OPTION = "clear-chat-option";
const CSS_CLASS_EXPORT_CHAT_OPTION = "export-chat-option"; // Назву класу залишаємо
// const CSS_CLASS_CONTENT_COLLAPSIBLE = "message-content-collapsible";
const CSS_CLASS_CONTENT_COLLAPSED = "message-content-collapsed";
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
// const CSS_CLASS_DANGER_OPTION = "danger-option"; // Для небезпечних дій

const CSS_CLASS_INPUT_AREA_LEFT = "input-area-left";
const CSS_CLASS_MODEL_DISPLAY = "model-display";
const CSS_CLASS_ROLE_DISPLAY = "role-display";
const CSS_CLASS_INPUT_CONTROLS_CONTAINER = "input-controls-container";
const CSS_CLASS_INPUT_CONTROLS_LEFT = "input-controls-left";
const CSS_CLASS_INPUT_CONTROLS_RIGHT = "input-controls-right";

const CSS_CLASS_CHAT_LIST_SCROLLABLE = "chat-list-scrollable";
const CSS_CLASS_TEMPERATURE_INDICATOR = "temperature-indicator";

const CSS_CLASS_DESKTOP_TOGGLE_VIEW_BUTTON = "desktop-toggle-view-button"; // Новий клас для кнопки
const CSS_CLASS_TOGGLE_LOCATION_BUTTON = "toggle-location-button"; // Для кнопки в панелі
const CSS_CLASS_TOGGLE_VIEW_LOCATION = "toggle-view-location-option";

const CHAT_LIST_MAX_HEIGHT = "250px";
const CSS_CLASS_REGENERATE_BUTTON = "regenerate-button";

const CSS_ROLE_PANEL = "ollama-role-panel";
const CSS_ROLE_PANEL_HEADER = "ollama-role-panel-header";
const CSS_ROLE_PANEL_LIST = "ollama-role-panel-list";
const CSS_ROLE_PANEL_ITEM = "ollama-role-panel-item"; // Можна використовувати спільно з menu-option
const CSS_ROLE_PANEL_ITEM_ICON = "ollama-role-panel-item-icon";
const CSS_ROLE_PANEL_ITEM_TEXT = "ollama-role-panel-item-text";
const CSS_ROLE_PANEL_ITEM_ACTIVE = "is-active";
const CSS_ROLE_PANEL_ITEM_CUSTOM = "is-custom";
const CSS_ROLE_PANEL_ITEM_NONE = "ollama-role-panel-item-none";
const CSS_MAIN_CHAT_AREA = "ollama-main-chat-area"; // Новий клас для обгортки чату+вводу

const CSS_SIDEBAR_SECTION_HEADER = "ollama-sidebar-section-header"; // Клікабельний заголовок секції
const CSS_SIDEBAR_SECTION_CONTENT = "ollama-sidebar-section-content"; // Контейнер списку
const CSS_SIDEBAR_SECTION_CONTENT_HIDDEN = "ollama-sidebar-section-content-hidden"; // Для прихованого стану
const CSS_SIDEBAR_SECTION_ICON = "ollama-sidebar-section-icon"; // Іконка ►/▼

const CSS_SIDEBAR_HEADER_BUTTON = "ollama-sidebar-header-button";
const CSS_CHAT_ITEM_MAIN = "ollama-chat-item-main"; // Обгортка для назви/дати
const CSS_CHAT_ITEM_OPTIONS = "ollama-chat-item-options"; // Кнопка "..."
const CSS_CLASS_STOP_BUTTON = "stop-generating-button"; // Новий клас
const CSS_CLASS_SCROLL_BOTTOM_BUTTON = "scroll-to-bottom-button"; // <--- Новий клас
const CSS_CLASS_CHAT_LIST_ITEM = "ollama-chat-list-item";

// const CSS_CLASS_SUMMARIZE_BUTTON = "summarize-button";

// --- Message Types ---
export type MessageRole = "user" | "assistant" | "system" | "error";
// export interface Message {
//   role: MessageRole;
//   content: string;
//   timestamp: Date;
// }

// --- Language List ---
const LANGUAGES: Record<string, string> = {
  af: "Afrikaans",
  sq: "Albanian",
  am: "Amharic",
  ar: "Arabic",
  hy: "Armenian",
  az: "Azerbaijani",
  eu: "Basque",
  be: "Belarusian",
  bn: "Bengali",
  bs: "Bosnian",
  bg: "Bulgarian",
  ca: "Catalan",
  ceb: "Cebuano",
  ny: "Chichewa",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  co: "Corsican",
  hr: "Croatian",
  cs: "Czech",
  da: "Danish",
  nl: "Dutch",
  en: "English",
  eo: "Esperanto",
  et: "Estonian",
  tl: "Filipino",
  fi: "Finnish",
  fr: "French",
  fy: "Frisian",
  gl: "Galician",
  ka: "Georgian",
  de: "German",
  el: "Greek",
  gu: "Gujarati",
  ht: "Haitian Creole",
  ha: "Hausa",
  haw: "Hawaiian",
  iw: "Hebrew",
  he: "Hebrew",
  hi: "Hindi",
  hmn: "Hmong",
  hu: "Hungarian",
  is: "Icelandic",
  ig: "Igbo",
  id: "Indonesian",
  ga: "Irish",
  it: "Italian",
  ja: "Japanese",
  jw: "Javanese",
  kn: "Kannada",
  kk: "Kazakh",
  km: "Khmer",
  rw: "Kinyarwanda",
  ko: "Korean",
  ku: "Kurdish (Kurmanji)",
  ky: "Kyrgyz",
  lo: "Lao",
  la: "Latin",
  lv: "Latvian",
  lt: "Lithuanian",
  lb: "Luxembourgish",
  mk: "Macedonian",
  mg: "Malagasy",
  ms: "Malay",
  ml: "Malayalam",
  mt: "Maltese",
  mi: "Maori",
  mr: "Marathi",
  mn: "Mongolian",
  my: "Myanmar (Burmese)",
  ne: "Nepali",
  no: "Norwegian",
  or: "Odia (Oriya)",
  ps: "Pashto",
  fa: "Persian",
  pl: "Polish",
  pt: "Portuguese",
  pa: "Punjabi",
  ro: "Romanian",
  ru: "Russian",
  sm: "Samoan",
  gd: "Scots Gaelic",
  sr: "Serbian",
  st: "Sesotho",
  sn: "Shona",
  sd: "Sindhi",
  si: "Sinhala",
  sk: "Slovak",
  sl: "Slovenian",
  so: "Somali",
  es: "Spanish",
  su: "Sundanese",
  sw: "Swahili",
  sv: "Swedish",
  tg: "Tajik",
  ta: "Tamil",
  tt: "Tatar",
  te: "Telugu",
  th: "Thai",
  tr: "Turkish",
  tk: "Turkmen",
  uk: "Ukrainian",
  ur: "Urdu",
  ug: "Uyghur",
  uz: "Uzbek",
  vi: "Vietnamese",
  cy: "Welsh",
  xh: "Xhosa",
  yi: "Yiddish",
  yo: "Yoruba",
  zu: "Zulu",
};

export class OllamaView extends ItemView {
  private sidebarManager!: SidebarManager; // <--- Нова властивість
  // --- Properties ---
  public readonly plugin: OllamaPlugin;
  private chatContainerEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private chatContainer!: HTMLElement;
  private sendButton!: HTMLButtonElement;
  private voiceButton!: HTMLButtonElement;
  private translateInputButton!: HTMLButtonElement;
  private menuButton!: HTMLButtonElement;
  private buttonsContainer!: HTMLElement;

  private modelDisplayEl!: HTMLElement;
  private roleDisplayEl!: HTMLElement;

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
  private exportChatOption!: HTMLElement; // Назва змінної залишається та ж
  private deleteChatOption!: HTMLElement;
  private settingsOption!: HTMLElement;
  private temperatureIndicatorEl!: HTMLElement;
  private toggleViewLocationOption!: HTMLElement;
  private toggleLocationButton!: HTMLButtonElement; // Кнопка в панелі (для десктопу)
  private newChatSidebarButton!: HTMLButtonElement;

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

  private rolePanelEl!: HTMLElement; // Нова властивість для панелі ролей
  private rolePanelListEl!: HTMLElement; // Нова властивість для списку в панелі
  private mainChatAreaEl!: HTMLElement; // Нова обгортка для чату та вводу

  private lastProcessedChatId: string | null = null; // Ця властивість вже має бути

  private chatPanelListEl!: HTMLElement; // <--- НОВА ВЛАСТИВІСТЬ для списку чатів у панелі

  private chatPanelHeaderEl!: HTMLElement; // Нова властивість для заголовка чатів
  private rolePanelHeaderEl!: HTMLElement; // Нова властивість для заголовка ролей
  private rolesSectionContainerEl!: HTMLElement; // <-- Нова властивість
  private scrollToBottomButton!: HTMLButtonElement; // <--- Нова властивість

  private stopGeneratingButton!: HTMLButtonElement; // Нова кнопка
  private currentAbortController: AbortController | null = null; // Для переривання запиту

  private lastMessageElement: HTMLElement | null = null; // Останній доданий елемент групи повідомлень
  private consecutiveErrorMessages: Message[] = []; // Масив для накопичення послідовних помилок
  private errorGroupElement: HTMLElement | null = null; // Посилання на активний контейнер групи помилок
  private isSummarizingErrors = false; // Прапорець, щоб уникнути одночасних сумаризацій

  private temporarilyDisableChatChangedReload = false;
  private activePlaceholder: {
    timestamp: number;
    groupEl: HTMLElement;
    contentEl: HTMLElement;
    messageWrapper: HTMLElement;
  } | null = null;

  private currentMessageAddedResolver: (() => void) | null = null;

  // private currentAssistantMessage: {
  //   // Для зберігання посилання на поточне повідомлення асистента
  //   groupEl: HTMLElement | null;
  //   contentEl: HTMLElement | null;
  //   fullContent: string; // Для накопичення повної відповіді
  //   timestamp: Date | null; // Зберігаємо час початку відповіді
  // } | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.sidebarManager = new SidebarManager(this.plugin); // <--- Ініціалізуємо тут
    this.initSpeechWorker();
    // Переконуємось, що handleScroll визначено ПЕРЕД цим рядком
    this.scrollListenerDebounced = debounce(this.handleScroll, 150, true);
    this.register(this.plugin.on('focus-input-request', () => {
      this.focusInput();
  }));
  }

  // --- Getters ---
  /** Checks if the custom menu dropdown is currently visible */
  public isMenuOpen(): boolean {
    return !!this.menuDropdown && this.menuDropdown.style.display === "block";
  }

  // --- Obsidian View Methods ---
  getViewType(): string {
    return VIEW_TYPE_OLLAMA_PERSONAS;
  }
  getDisplayText(): string {
    return "AI Forge";
  }
  getIcon(): string {
    return "brain-circuit";
  }

  async onOpen(): Promise<void> {
    // ... (код onOpen як у ПОПЕРЕДНІЙ відповіді)
    this.plugin.logger.debug("[OllamaView] onOpen started.");
    this.createUIElements();

    // Оновлюємо плейсхолдер та інші елементи НА ОСНОВІ ПОТОЧНИХ ГЛОБАЛЬНИХ НАЛАШТУВАНЬ СПОЧАТКУ
    // Це забезпечує швидше початкове відображення, не чекаючи завантаження чату.
    try {
      const initialRolePath = this.plugin.settings.selectedRolePath;
      // Використовуємо findRoleNameByPath, бо він обробляє null/undefined
      const initialRoleName = await this.findRoleNameByPath(initialRolePath);
      this.updateInputPlaceholder(initialRoleName);
      this.updateRoleDisplay(initialRoleName); // Оновлюємо індикатор ролі теж
      this.updateModelDisplay(this.plugin.settings.modelName);
      this.updateTemperatureIndicator(this.plugin.settings.temperature);
      this.plugin.logger.debug("[OllamaView] Initial UI elements updated based on settings.");
    } catch (error) {
      this.plugin.logger.error("[OllamaView] Error during initial UI update in onOpen:", error);
      // Продовжуємо роботу, навіть якщо тут виникла помилка
    }

    this.attachEventListeners();
    this.autoResizeTextarea();
    this.updateSendButtonState(); // Важливо оновити стан кнопки після встановлення початкових значень

    // ВАЖЛИВО: loadAndDisplayActiveChat тепер завантажить чат (якщо є)
    // і сам викличе update...List для видимих панелей (включаючи Chats за замовчуванням)
    try {
      this.plugin.logger.debug("[OllamaView] Calling loadAndDisplayActiveChat from onOpen...");
      await this.loadAndDisplayActiveChat();
      this.plugin.logger.debug("[OllamaView] loadAndDisplayActiveChat completed successfully in onOpen.");
    } catch (error) {
      this.plugin.logger.error("[OllamaView] Error during initial chat load in onOpen:", error);
      this.showEmptyState();
      // Оновлюємо видимі панелі навіть при помилці
      const updatePromises = [];
      if (this.isSidebarSectionVisible("chats")) {
        updatePromises.push(
          this.updateChatPanelList().catch(e => this.plugin.logger.error("Error updating chat panel list in catch:", e))
        );
      }
      if (this.isSidebarSectionVisible("roles")) {
        updatePromises.push(
          this.updateRolePanelList().catch(e => this.plugin.logger.error("Error updating role panel list in catch:", e))
        );
      }
      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
        // Немає потреби встановлювати висоту тут, update...List це зробить
      }
    }

    // Встановлюємо фокус
    setTimeout(() => {
      this.inputEl?.focus();
      this.plugin.logger.debug("[OllamaView] Input focused in onOpen.");
    }, 150);

    if (this.inputEl) {
      this.inputEl.dispatchEvent(new Event("input"));
    }
    this.plugin.logger.debug("[OllamaView] onOpen finished.");
  }

  async onClose(): Promise<void> {
    // ... (існуючий код очищення: speechWorker, mediaRecorder, etc.) ...
    if (this.speechWorker) {
        this.speechWorker.terminate();
        this.speechWorker = null;
    }
    this.stopVoiceRecording(false);
    if (this.audioStream) {
        this.audioStream.getTracks().forEach(t => t.stop());
        this.audioStream = null;
    }
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);


    // --- Додано очищення SidebarManager ---
    this.sidebarManager?.destroy();
    // ------------------------------------
    this.plugin.logger.debug("[OllamaView] onClose finished."); // Додамо лог
}

  // OllamaView.ts
// src/OllamaView.ts -> createUIElements

private createUIElements(): void {
  this.plugin.logger.debug("createUIElements: Starting UI creation.");
  this.contentEl.empty();
  const flexContainer = this.contentEl.createDiv({ cls: CSS_CLASS_CONTAINER }); // Головний flex контейнер

  // --- Створюємо бічну панель за допомогою SidebarManager ---
  // SidebarManager сам створить свій головний div (колишній rolePanelEl)
  // і додасть його до flexContainer.
  this.sidebarManager.createSidebarUI(flexContainer); // <--- ВИКЛИК МЕНЕДЖЕРА

  // --- Основна Область Чату (права частина) ---
  // Створюємо обгортку для чату та поля вводу
  this.mainChatAreaEl = flexContainer.createDiv({ cls: CSS_MAIN_CHAT_AREA }); // <-- Створюємо цю обгортку тут

  // Вміст основної області (чат + поле вводу) - БЕЗ ЗМІН, додається до mainChatAreaEl
  this.chatContainerEl = this.mainChatAreaEl.createDiv({ cls: "ollama-chat-area-content" });
  this.chatContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_CHAT_CONTAINER });
  // ... (створення newMessagesIndicatorEl, scrollToBottomButton) ...
   this.newMessagesIndicatorEl = this.chatContainerEl.createDiv({ cls: CSS_CLASS_NEW_MESSAGE_INDICATOR });
  setIcon(this.newMessagesIndicatorEl.createSpan({ cls: "indicator-icon" }), "arrow-down");
  this.newMessagesIndicatorEl.createSpan({ text: " New Messages" });

  this.scrollToBottomButton = this.chatContainerEl.createEl("button", {
      cls: [CSS_CLASS_SCROLL_BOTTOM_BUTTON, "clickable-icon"],
      attr: { "aria-label": "Scroll to bottom", title: "Scroll to bottom" },
  });
  setIcon(this.scrollToBottomButton, "arrow-down");


  // Контейнер вводу - БЕЗ ЗМІН, додається до mainChatAreaEl
  const inputContainer = this.mainChatAreaEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER });
  this.inputEl = inputContainer.createEl("textarea", { attr: { placeholder: `Text...`, rows: 1 } });
  // ... (створення controlsContainer, leftControls, rightControls, кнопок, індикаторів, меню) ...
   const controlsContainer = inputContainer.createDiv({ cls: CSS_CLASS_INPUT_CONTROLS_CONTAINER });
  const leftControls = controlsContainer.createDiv({ cls: CSS_CLASS_INPUT_CONTROLS_LEFT });
  this.translateInputButton = leftControls.createEl("button", {
      cls: CSS_CLASS_TRANSLATE_INPUT_BUTTON,
      attr: { "aria-label": "Translate input to English" },
  });
  setIcon(this.translateInputButton, "languages");
  this.translateInputButton.title = "Translate input to English";
  this.modelDisplayEl = leftControls.createDiv({ cls: CSS_CLASS_MODEL_DISPLAY });
  this.modelDisplayEl.setText("...");
  this.modelDisplayEl.title = "Click to select model";
  this.roleDisplayEl = leftControls.createDiv({ cls: CSS_CLASS_ROLE_DISPLAY });
  this.roleDisplayEl.setText("...");
  this.roleDisplayEl.title = "Click to select role";
  this.temperatureIndicatorEl = leftControls.createDiv({ cls: CSS_CLASS_TEMPERATURE_INDICATOR });
  this.temperatureIndicatorEl.setText("?");
  this.temperatureIndicatorEl.title = "Click to set temperature";

  this.buttonsContainer = controlsContainer.createDiv({
      cls: `${CSS_CLASS_BUTTONS_CONTAINER} ${CSS_CLASS_INPUT_CONTROLS_RIGHT}`,
  });
   this.stopGeneratingButton = this.buttonsContainer.createEl("button", {
      cls: [CSS_CLASS_STOP_BUTTON, CSS_CLASSES.DANGER_OPTION],
      attr: { "aria-label": "Stop Generation", title: "Stop Generation" },
  });
  setIcon(this.stopGeneratingButton, "square");
  this.stopGeneratingButton.hide();

  this.sendButton = this.buttonsContainer.createEl("button", {
      cls: CSS_CLASS_SEND_BUTTON,
      attr: { "aria-label": "Send" },
  });
  setIcon(this.sendButton, "send");
  this.voiceButton = this.buttonsContainer.createEl("button", {
      cls: CSS_CLASS_VOICE_BUTTON,
      attr: { "aria-label": "Voice Input" },
  });
  setIcon(this.voiceButton, "mic");
  this.toggleLocationButton = this.buttonsContainer.createEl("button", {
      cls: CSS_CLASS_TOGGLE_LOCATION_BUTTON,
      attr: { "aria-label": "Toggle View Location" },
  });
  this.menuButton = this.buttonsContainer.createEl("button", {
      cls: CSS_CLASS_MENU_BUTTON,
      attr: { "aria-label": "Menu" },
  });
  setIcon(this.menuButton, "more-vertical");
  this.updateToggleLocationButton();

  // Випадаюче меню (створюється як і раніше)
  this.menuDropdown = inputContainer.createEl("div", { cls: [CSS_CLASS_MENU_DROPDOWN, "ollama-chat-menu"] });
  this.menuDropdown.style.display = "none";
   // ... (код створення секцій та пунктів меню як був) ...
  // Секції випадаючого меню (моделі, ролі, чати)
  const modelSection = this.createSubmenuSection(
      "Select Model",
      "list-collapse",
      CSS_CLASS_MODEL_LIST_CONTAINER,
      "model-submenu-section"
  );
  this.modelSubmenuHeader = modelSection.header;
  this.modelSubmenuContent = modelSection.content;
  const roleDropdownSection = this.createSubmenuSection(
      "Select Role",
      "users",
      CSS_CLASS_ROLE_LIST_CONTAINER,
      "role-submenu-section"
  );
  this.roleSubmenuHeader = roleDropdownSection.header;
  this.roleSubmenuContent = roleDropdownSection.content;
  const chatDropdownSection = this.createSubmenuSection(
      "Load Chat",
      "messages-square",
      CSS_CLASS_CHAT_LIST_CONTAINER
  );
  this.chatSubmenuHeader = chatDropdownSection.header;
  this.chatSubmenuContent = chatDropdownSection.content;

  // Дії випадаючого меню
  this.menuDropdown.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });
  this.menuDropdown.createEl("div", { text: "Actions", cls: CSS_CLASS_MENU_HEADER });
  // New Chat
  this.newChatOption = this.menuDropdown.createEl("div", {
      cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_NEW_CHAT_OPTION}`,
  });
  setIcon(this.newChatOption.createSpan({ cls: "menu-option-icon" }), "plus-circle");
  this.newChatOption.createSpan({ cls: "menu-option-text", text: "New Chat" });
  // Rename Chat
  this.renameChatOption = this.menuDropdown.createEl("div", {
      cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_RENAME_CHAT_OPTION}`,
  });
  setIcon(this.renameChatOption.createSpan({ cls: "menu-option-icon" }), "pencil");
  this.renameChatOption.createSpan({ cls: "menu-option-text", text: "Rename Chat" });
  // Clone Chat
  this.cloneChatOption = this.menuDropdown.createEl("div", {
      cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLONE_CHAT_OPTION}`,
  });
  setIcon(this.cloneChatOption.createSpan({ cls: "menu-option-icon" }), "copy-plus");
  this.cloneChatOption.createSpan({ cls: "menu-option-text", text: "Clone Chat" });
  // Export Chat
  this.exportChatOption = this.menuDropdown.createEl("div", {
      cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_EXPORT_CHAT_OPTION}`,
  });
  setIcon(this.exportChatOption.createSpan({ cls: "menu-option-icon" }), "download");
  this.exportChatOption.createSpan({ cls: "menu-option-text", text: "Export Chat to Note" });
  // Separator
  this.menuDropdown.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });
  // Clear Messages
  this.clearChatOption = this.menuDropdown.createEl("div", {
      cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLEAR_CHAT_OPTION} ${CSS_CLASSES.DANGER_OPTION}`,
  });
  setIcon(this.clearChatOption.createSpan({ cls: "menu-option-icon" }), "trash");
  this.clearChatOption.createSpan({ cls: "menu-option-text", text: "Clear Messages" });
  // Delete Chat
  this.deleteChatOption = this.menuDropdown.createEl("div", {
      cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_DELETE_CHAT_OPTION} ${CSS_CLASSES.DANGER_OPTION}`,
  });
  setIcon(this.deleteChatOption.createSpan({ cls: "menu-option-icon" }), "trash-2");
  this.deleteChatOption.createSpan({ cls: "menu-option-text", text: "Delete Chat" });
  // Separator
  this.menuDropdown.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });
  // Toggle View Location
  this.toggleViewLocationOption = this.menuDropdown.createEl("div", {
      cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_TOGGLE_VIEW_LOCATION}`,
  });
  this.updateToggleViewLocationOption(); // Оновлюємо текст/іконку
  // Separator
  this.menuDropdown.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });
  // Settings
  this.settingsOption = this.menuDropdown.createEl("div", {
      cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_SETTINGS_OPTION}`,
  });
  setIcon(this.settingsOption.createSpan({ cls: "menu-option-icon" }), "settings");
  this.settingsOption.createSpan({ cls: "menu-option-text", text: "Settings" });


  this.plugin.logger.debug("createUIElements: Finished UI creation.");
}

  // Допоміжна функція для створення підменю (з попереднього коду)
  private createSubmenuSection = (
    title: string,
    icon: string,
    listContainerClass: string,
    sectionClass?: string
  ): { header: HTMLElement; content: HTMLElement; section: HTMLElement } => {
    const section = this.menuDropdown.createDiv();
    if (sectionClass) section.addClass(sectionClass);
    const header = section.createDiv({
      cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MENU_HEADER_ITEM}`,
    });
    setIcon(header.createSpan({ cls: "menu-option-icon" }), icon);
    header.createSpan({ cls: "menu-option-text", text: title });
    setIcon(header.createSpan({ cls: CSS_CLASS_SUBMENU_ICON }), "chevron-right");
    const isChatList = listContainerClass === CSS_CLASS_CHAT_LIST_CONTAINER;
    const content = section.createDiv({
      cls: `${CSS_CLASS_SUBMENU_CONTENT} ${CSS_CLASSES.SUBMENU_CONTENT_HIDDEN} ${listContainerClass} ${
        isChatList ? CSS_CLASS_CHAT_LIST_SCROLLABLE : ""
      }`,
    });
    content.style.maxHeight = "0";
    content.style.overflow = "hidden";
    content.style.transition = "max-height 0.3s ease-out, padding 0.3s ease-out";
    content.style.paddingTop = "0";
    content.style.paddingBottom = "0";
    return { header, content, section };
  };

  // --- Event Listeners (ПОВНА ВЕРСІЯ) ---
  private attachEventListeners(): void {
    // Null Checks for Required Elements
    if (!this.inputEl) console.error("OllamaView: inputEl missing during attachEventListeners!");
    if (!this.sendButton) console.error("OllamaView: sendButton missing during attachEventListeners!");
    if (!this.stopGeneratingButton)
      console.error("OllamaView: stopGeneratingButton missing during attachEventListeners!");
    if (!this.voiceButton) console.error("OllamaView: voiceButton missing during attachEventListeners!");
    if (!this.translateInputButton)
      console.error("OllamaView: translateInputButton missing during attachEventListeners!");
    if (!this.menuButton) console.error("OllamaView: menuButton missing during attachEventListeners!");
    if (!this.modelDisplayEl) console.error("OllamaView: modelDisplayEl missing during attachEventListeners!");
    if (!this.roleDisplayEl) console.error("OllamaView: roleDisplayEl missing during attachEventListeners!");
    if (!this.temperatureIndicatorEl)
      console.error("OllamaView: temperatureIndicatorEl missing during attachEventListeners!");
    if (!this.toggleLocationButton)
      console.error("OllamaView: toggleLocationButton missing during attachEventListeners!");
    if (!this.chatContainer) console.error("OllamaView: chatContainer missing during attachEventListeners!");
    if (!this.scrollToBottomButton)
      console.error("OllamaView: scrollToBottomButton missing during attachEventListeners!");
    if (!this.newMessagesIndicatorEl)
      console.error("OllamaView: newMessagesIndicatorEl missing during attachEventListeners!");
    if (!this.chatPanelHeaderEl) console.error("OllamaView: chatPanelHeaderEl missing during attachEventListeners!");
    if (!this.rolePanelHeaderEl) console.error("OllamaView: rolePanelHeaderEl missing during attachEventListeners!");
    if (!this.newChatSidebarButton)
      console.error("OllamaView: newChatSidebarButton missing during attachEventListeners!");
    if (!this.modelSubmenuHeader) console.error("OllamaView: modelSubmenuHeader missing during attachEventListeners!");
    if (!this.roleSubmenuHeader) console.error("OllamaView: roleSubmenuHeader missing during attachEventListeners!");
    if (!this.chatSubmenuHeader) console.error("OllamaView: chatSubmenuHeader missing during attachEventListeners!");
    if (!this.newChatOption) console.error("OllamaView: newChatOption missing during attachEventListeners!");
    if (!this.renameChatOption) console.error("OllamaView: renameChatOption missing during attachEventListeners!");
    if (!this.cloneChatOption) console.error("OllamaView: cloneChatOption missing during attachEventListeners!");
    if (!this.exportChatOption) console.error("OllamaView: exportChatOption missing during attachEventListeners!");
    if (!this.clearChatOption) console.error("OllamaView: clearChatOption missing during attachEventListeners!");
    if (!this.deleteChatOption) console.error("OllamaView: deleteChatOption missing during attachEventListeners!");
    if (!this.toggleViewLocationOption)
      console.error("OllamaView: toggleViewLocationOption missing during attachEventListeners!");
    if (!this.settingsOption) console.error("OllamaView: settingsOption missing during attachEventListeners!");

    // Input Textarea Listeners
    if (this.inputEl) {
      this.registerDomEvent(this.inputEl, "keydown", this.handleKeyDown);
      this.registerDomEvent(this.inputEl, "input", this.handleInputForResize);
    }

    // Input Control Buttons Listeners
    if (this.sendButton) {
      this.registerDomEvent(this.sendButton, "click", this.handleSendClick);
    }
    if (this.stopGeneratingButton) {
      this.registerDomEvent(this.stopGeneratingButton, "click", this.cancelGeneration);
    } // cancelGeneration - стрілкова функція
    if (this.voiceButton) {
      this.registerDomEvent(this.voiceButton, "click", this.handleVoiceClick);
    }
    if (this.translateInputButton) {
      this.registerDomEvent(this.translateInputButton, "click", this.handleTranslateInputClick);
    }
    if (this.menuButton) {
      this.registerDomEvent(this.menuButton, "click", this.handleMenuClick);
    }
    if (this.toggleLocationButton) {
      this.registerDomEvent(this.toggleLocationButton, "click", this.handleToggleViewLocationClick);
    }

    // Input Info Indicators Listeners
    if (this.modelDisplayEl) {
      this.registerDomEvent(this.modelDisplayEl, "click", this.handleModelDisplayClick);
    }
    if (this.roleDisplayEl) {
      this.registerDomEvent(this.roleDisplayEl, "click", this.handleRoleDisplayClick);
    }
    if (this.temperatureIndicatorEl) {
      this.registerDomEvent(this.temperatureIndicatorEl, "click", this.handleTemperatureClick);
    }

    // Dropdown Menu Listeners
    if (this.modelSubmenuHeader && this.modelSubmenuContent) {
      this.registerDomEvent(this.modelSubmenuHeader, "click", () =>
        this.toggleSubmenu(this.modelSubmenuHeader, this.modelSubmenuContent, "models")
      );
    }
    if (this.roleSubmenuHeader && this.roleSubmenuContent) {
      this.registerDomEvent(this.roleSubmenuHeader, "click", () =>
        this.toggleSubmenu(this.roleSubmenuHeader, this.roleSubmenuContent, "roles")
      );
    }
    if (this.chatSubmenuHeader && this.chatSubmenuContent) {
      this.registerDomEvent(this.chatSubmenuHeader, "click", () =>
        this.toggleSubmenu(this.chatSubmenuHeader, this.chatSubmenuContent, "chats")
      );
    }
    if (this.newChatOption) {
      this.registerDomEvent(this.newChatOption, "click", this.handleNewChatClick);
    }
    if (this.renameChatOption) {
      this.registerDomEvent(this.renameChatOption, "click", () => {
        this.handleRenameChatClick();
      });
    }
    if (this.cloneChatOption) {
      this.registerDomEvent(this.cloneChatOption, "click", this.handleCloneChatClick);
    }
    if (this.exportChatOption) {
      this.registerDomEvent(this.exportChatOption, "click", this.handleExportChatClick);
    }
    if (this.clearChatOption) {
      this.registerDomEvent(this.clearChatOption, "click", this.handleClearChatClick);
    }
    if (this.deleteChatOption) {
      this.registerDomEvent(this.deleteChatOption, "click", this.handleDeleteChatClick);
    }
    if (this.toggleViewLocationOption) {
      this.registerDomEvent(this.toggleViewLocationOption, "click", this.handleToggleViewLocationClick);
    }
    if (this.settingsOption) {
      this.registerDomEvent(this.settingsOption, "click", this.handleSettingsClick);
    }

    // Chat Area Listeners
    if (this.chatContainer) {
      this.registerDomEvent(this.chatContainer, "scroll", this.scrollListenerDebounced);
    }
    if (this.newMessagesIndicatorEl) {
      this.registerDomEvent(this.newMessagesIndicatorEl, "click", this.handleNewMessageIndicatorClick);
    }
    if (this.scrollToBottomButton) {
      this.registerDomEvent(this.scrollToBottomButton, "click", this.handleScrollToBottomClick);
    }

    // Window/Workspace/Document Listeners
    this.registerDomEvent(window, "resize", this.handleWindowResize);
    this.registerEvent(this.app.workspace.on("resize", this.handleWindowResize));
    this.registerDomEvent(document, "click", this.handleDocumentClickForMenu);
    this.registerDomEvent(document, "visibilitychange", this.handleVisibilityChange);
    this.registerEvent(this.app.workspace.on("active-leaf-change", this.handleActiveLeafChange));

    // Plugin Event Listeners (Using Arrow Functions for 'this' binding)
    this.register(this.plugin.on("model-changed", modelName => this.handleModelChange(modelName)));
    this.register(this.plugin.on("role-changed", roleName => this.handleRoleChange(roleName)));
    this.register(this.plugin.on("roles-updated", () => this.handleRolesUpdated()));
    this.register(
      this.plugin.on("roles-updated", () => {
        if (this.rolePanelHeaderEl?.getAttribute("data-collapsed") === "false") {
          this.updateRolePanelList();
        }
      })
    );
    this.register(this.plugin.on("active-chat-changed", data => this.handleActiveChatChanged(data)));
    // --- Listener, що викликає handleMessageAdded ---
    this.register(
      this.plugin.on("message-added", data => {
        this.plugin.logger.error(
          `[OllamaView Listener] 'message-added' listener called. Role: ${
            data?.message?.role
          }. Timestamp: ${data?.message?.timestamp?.getTime()}`
        );
        this.handleMessageAdded(data); // Викликаємо обробник
      })
    );
    // --- Кінець ---
    this.register(this.plugin.on("messages-cleared", chatId => this.handleMessagesCleared(chatId)));
    this.register(this.plugin.on("chat-list-updated", () => this.handleChatListUpdated()));
    this.register(this.plugin.on("settings-updated", () => this.handleSettingsUpdated()));
    this.register(this.plugin.on("message-deleted", data => this.handleMessageDeleted(data)));

    this.plugin.logger.debug("[OllamaView] All event listeners attached.");
  }

  private cancelGeneration = (): void => {
    if (this.currentAbortController) {
      // Тепер 'this.plugin' має бути доступним
      this.plugin.logger.info("[OllamaView] User requested generation cancellation.");
      this.currentAbortController.abort();
    } else {
      this.plugin.logger.warn("[OllamaView] Cancel generation called but no active AbortController found.");
    }
  };

  //   public handleSettingsUpdated = async (): Promise<void> => {
  //     this.plugin.logger.debug("[OllamaView] handleSettingsUpdated called");
  //     const activeChat = await this.plugin.chatManager?.getActiveChat();
  //     const currentModelName = activeChat?.metadata?.modelName || this.plugin.settings.modelName;
  //     // Отримуємо ім'я поточної ролі (з чату або глобальних налаштувань)
  //     const currentRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;
  //     const currentRoleName = await this.plugin.findRoleNameByPath(currentRolePath); // Використовуємо хелпер

  //     const currentTemperature = activeChat?.metadata?.temperature ?? this.plugin.settings.temperature;

  //     this.updateModelDisplay(currentModelName);
  //     this.updateRoleDisplay(currentRoleName); // Оновлення маленького індикатора ролі
  //     this.updateInputPlaceholder(currentRoleName);
  //     this.updateTemperatureIndicator(currentTemperature);
  //     this.updateToggleViewLocationOption();
  //     this.updateToggleLocationButton();

  //     // --- Оновлюємо список у бічній панелі ---
  //     await this.updateRolePanelList();
  //     // --- Оновлюємо список у випадаючому меню (якщо воно використовується) ---
  //     if (this.isMenuOpen() && this.roleSubmenuContent && !this.roleSubmenuContent.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
  //          this.plugin.logger.debug("[handleSettingsUpdated] Role submenu open, refreshing role list menu.");
  //          await this.renderRoleList();
  //     }
  // }

  // OllamaView.ts

  // OllamaView.ts

  // --- НОВИЙ МЕТОД: Обробник події видалення повідомлення (з виправленням типів) ---
  private handleMessageDeleted = (data: { chatId: string; timestamp: Date }): void => {
    this.plugin.logger.debug(
      `handleMessageDeleted: Received event for chat ${data.chatId}, timestamp ${data.timestamp.toISOString()}`
    );

    const currentActiveChatId = this.plugin.chatManager?.getActiveChatId();
    // Перевіряємо, чи це активний чат і чи існує контейнер
    if (data.chatId !== currentActiveChatId || !this.chatContainer) {
      this.plugin.logger.debug(
        `handleMessageDeleted: Event ignored (Event chat ${data.chatId} !== active chat ${currentActiveChatId} or container missing).`
      );
      return;
    }

    const timestampMs = data.timestamp.getTime();
    const selector = `.${CSS_CLASSES.MESSAGE_GROUP}[data-timestamp="${timestampMs}"]`;

    try {
      const messageGroupEl = this.chatContainer.querySelector(selector);

      // --- ЗМІНА: Перевіряємо, чи знайдений елемент є HTMLElement ---
      if (messageGroupEl instanceof HTMLElement) {
        // Type guard
        // Тепер TypeScript знає, що messageGroupEl це HTMLElement
        this.plugin.logger.debug(
          `handleMessageDeleted: Found message group HTMLElement to remove with selector: ${selector}`
        );

        const currentScrollTop = this.chatContainer.scrollTop;
        const removedHeight = messageGroupEl.offsetHeight; // OK
        const wasAboveViewport = messageGroupEl.offsetTop < currentScrollTop; // OK

        messageGroupEl.remove(); // Видаляємо елемент з DOM

        // Оновлюємо локальний кеш повідомлень
        const initialLength = this.currentMessages.length;
        this.currentMessages = this.currentMessages.filter(msg => msg.timestamp.getTime() !== timestampMs);
        this.plugin.logger.debug(
          `handleMessageDeleted: Updated local message cache from ${initialLength} to ${this.currentMessages.length} messages.`
        );

        // Спроба скоригувати скрол
        if (wasAboveViewport) {
          const newScrollTop = currentScrollTop - removedHeight;
          this.chatContainer.scrollTop = newScrollTop >= 0 ? newScrollTop : 0;
          this.plugin.logger.debug(
            `handleMessageDeleted: Adjusted scroll top from ${currentScrollTop} to ${this.chatContainer.scrollTop} (removed height: ${removedHeight})`
          );
        } else {
          this.chatContainer.scrollTop = currentScrollTop;
          this.plugin.logger.debug(
            `handleMessageDeleted: Message was not above viewport, scroll top remains at ${currentScrollTop}`
          );
        }

        // Перевіряємо, чи не залишилось повідомлень
        if (this.currentMessages.length === 0) {
          this.showEmptyState();
        }
      } else if (messageGroupEl) {
        // Елемент знайдено, але це не HTMLElement - це дуже дивно
        this.plugin.logger.error(
          `handleMessageDeleted: Found element with selector ${selector}, but it is not an HTMLElement. Forcing reload.`,
          messageGroupEl
        );
        this.loadAndDisplayActiveChat(); // Перезавантажуємо для безпеки
      } else {
        // Елемент не знайдено
        this.plugin.logger.warn(
          `handleMessageDeleted: Could not find message group element with selector: ${selector}. Maybe already removed or timestamp attribute missing?`
        );
        // Можливо, не потрібно нічого робити, або перезавантажити для консистентності
        // this.loadAndDisplayActiveChat();
      }
    } catch (error) {
      this.plugin.logger.error(
        `handleMessageDeleted: Error removing message element for timestamp ${timestampMs}:`,
        error
      );
      // У разі помилки краще перезавантажити весь чат
      this.loadAndDisplayActiveChat();
    }
  };
  // --- Кінець нового методу ---

  // --- Оновлений updateRolePanelList (БЕЗ ВСТАНОВЛЕННЯ max-height/overflow) ---
  private updateRolePanelList = async (): Promise<void> => {
    const container = this.rolePanelListEl;
    if (!container || !this.plugin.chatManager) {
      this.plugin.logger.debug("[updateRolePanelList] Skipping update: Container or ChatManager missing.");
      return;
    }
    // Перевірка видимості
    if (this.rolePanelHeaderEl?.getAttribute("data-collapsed") === "true") {
      this.plugin.logger.debug("[updateRolePanelList] Skipping update: Roles panel is collapsed.");
      return;
    }

    this.plugin.logger.debug("[updateRolePanelList] Updating role list content...");
    const currentScrollTop = container.scrollTop;
    container.empty();

    try {
      // ... (логіка рендерингу елементів списку як була) ...
      const roles = await this.plugin.listRoleFiles(true);
      const activeChat = await this.plugin.chatManager.getActiveChat();
      const currentRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;

      const noneOptionEl = container.createDiv({ cls: [CSS_ROLE_PANEL_ITEM, CSS_ROLE_PANEL_ITEM_NONE, "menu-option"] });
      const noneIconSpan = noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
      noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: "None" });
      if (!currentRolePath) {
        noneOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
        setIcon(noneIconSpan, "check");
      } else {
        setIcon(noneIconSpan, "slash");
      }
      this.registerDomEvent(noneOptionEl, "click", () => this.handleRolePanelItemClick(null, currentRolePath));

      roles.forEach(roleInfo => {
        const roleOptionEl = container.createDiv({ cls: [CSS_ROLE_PANEL_ITEM, "menu-option"] });
        const iconSpan = roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
        roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: roleInfo.name });
        if (roleInfo.isCustom) {
          roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_CUSTOM);
        }
        if (roleInfo.path === currentRolePath) {
          roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
          setIcon(iconSpan, "check");
        } else {
          setIcon(iconSpan, roleInfo.isCustom ? "user" : "file-text");
        }
        this.registerDomEvent(roleOptionEl, "click", () => this.handleRolePanelItemClick(roleInfo, currentRolePath));
      });
      this.plugin.logger.debug(`[updateRolePanelList] Finished rendering ${roles.length + 1} role items.`);

      // --- ВИДАЛЕНО ВСТАНОВЛЕННЯ max-height/overflow ЗВІДСИ ---
      // requestAnimationFrame(() => { ... }); // ВИДАЛЕНО
    } catch (error) {
      this.plugin.logger.error("[updateRolePanelList] Error rendering role panel list:", error);
      container.empty();
      container.createDiv({ text: "Error loading roles.", cls: "menu-error-text" });
    } finally {
      requestAnimationFrame(() => {
        container.scrollTop = currentScrollTop;
      });
    }
  };

  // --- Новий обробник кліку для ПАНЕЛІ ролей ---
  private handleRolePanelItemClick = async (
    roleInfo: RoleInfo | null,
    currentRolePath: string | null | undefined
  ): Promise<void> => {
    const newRolePath = roleInfo?.path ?? ""; // "" для "None"
    const roleNameForEvent = roleInfo?.name ?? "None";

    this.plugin.logger.debug(
      `[handleRolePanelItemClick] Clicked role: ${roleNameForEvent} (Path: ${newRolePath || "None"})`
    );

    if (newRolePath !== currentRolePath) {
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      try {
        if (activeChat) {
          this.plugin.logger.debug(
            `[handleRolePanelItemClick] Setting active role for chat ${activeChat.metadata.id} to: ${
              newRolePath || "None"
            }`
          );
          await this.plugin.chatManager.updateActiveChatMetadata({
            selectedRolePath: newRolePath,
          });
        } else {
          this.plugin.logger.debug(
            `[handleRolePanelItemClick] No active chat. Setting global default role to: ${newRolePath || "None"}`
          );
          this.plugin.settings.selectedRolePath = newRolePath;
          await this.plugin.saveSettings(); // Це викличе 'settings-updated', який оновить UI
          // Додатково генеруємо 'role-changed', бо ChatManager не викликався
          this.plugin.emit("role-changed", roleNameForEvent);
          this.plugin.promptService?.clearRoleCache?.();
        }
        // Оновлення UI (списку панелі) відбудеться через події 'active-chat-changed' або 'settings-updated'
      } catch (error) {
        this.plugin.logger.error(`[handleRolePanelItemClick] Error setting role to ${newRolePath}:`, error);
        new Notice("Failed to set the role.");
      }
    } else {
      this.plugin.logger.debug(`[handleRolePanelItemClick] Clicked role is already active.`);
    }
  };

  // --- Додано: Метод для оновлення кнопки перемикання ---
  private updateToggleLocationButton(): void {
    if (!this.toggleLocationButton) return;
    // Не очищуємо, просто міняємо іконку і title
    let iconName: string;
    let titleText: string;

    if (this.plugin.settings.openChatInTab) {
      // Зараз у вкладці -> дія "В панель"
      iconName = "sidebar-right";
      titleText = "Move to Sidebar";
    } else {
      // Зараз у панелі -> дія "У вкладку"
      iconName = "layout-list"; // Або 'panel-top'
      titleText = "Move to Tab";
    }
    setIcon(this.toggleLocationButton, iconName);
    this.toggleLocationButton.setAttribute("aria-label", titleText);
    this.toggleLocationButton.title = titleText; // Встановлюємо підказку
  }

  private handleModelDisplayClick = async (event: MouseEvent) => {
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
        models.forEach(modelName => {
          menu.addItem(item =>
            item
              .setTitle(modelName)
              .setIcon(modelName === currentModelName ? "check" : "radio-button")
              .onClick(async () => {
                const chatToUpdate = await this.plugin.chatManager?.getActiveChat();
                const latestModelName = chatToUpdate?.metadata?.modelName || this.plugin.settings.modelName;
                if (modelName !== latestModelName) {
                  if (chatToUpdate) {
                    await this.plugin.chatManager.updateActiveChatMetadata({
                      modelName: modelName,
                    });
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
  };

  private updateModelDisplay(modelName: string | null | undefined): void {
    if (this.modelDisplayEl) {
      if (modelName) {
        // Якщо модель є (не null і не undefined), відображаємо її ім'я
        const displayName = modelName; // "Default" тут більше не потрібен як запасний варіант
        const shortName = displayName.replace(/:latest$/, ""); // Прибираємо ':latest' для коротшого вигляду
        this.modelDisplayEl.setText(shortName);
        this.modelDisplayEl.title = `Current model: ${displayName}. Click to change.`;
        // Опціонально: прибираємо клас помилки, якщо він був
        this.modelDisplayEl.removeClass("model-not-available");
      } else {
        // Якщо modelName === null або undefined (тобто моделей немає або сталася помилка)
        this.modelDisplayEl.setText("Not available");
        this.modelDisplayEl.title =
          "No Ollama models detected. Check Ollama connection and ensure models are installed.";
        // Опціонально: додаємо клас для стилізації стану помилки/недоступності
        this.modelDisplayEl.addClass("model-not-available");
      }
    } else {
      console.error("[OllamaView] modelDisplayEl is missing!");
    }
  }

  // --- Event Handlers ---

  // Input & Sending
  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey && !this.isProcessing && !this.sendButton?.disabled) {
      e.preventDefault();
      this.sendMessage();
    }
  };
  private handleSendClick = (): void => {
    if (!this.isProcessing && !this.sendButton?.disabled) {
      this.sendMessage();
    } else {
      // console.log("Send button clicked but processing or disabled."); // Debug log
    }
  };
  private handleInputForResize = (): void => {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      this.adjustTextareaHeight();
      this.updateSendButtonState();
    }, 75);
  };

  // Input Area Buttons
  private handleVoiceClick = (): void => {
    this.toggleVoiceRecognition();
  };
  private handleTranslateInputClick = async (): Promise<void> => {
    const currentText = this.inputEl.value;
    const targetLang = "en";
    if (!currentText.trim()) {
      new Notice("Input empty...");
      return;
    }
    if (!this.plugin.settings.enableTranslation) {
      new Notice("Translation disabled...");
      return;
    }
    const apiKey = this.plugin.settings.googleTranslationApiKey;
    if (!apiKey) {
      new Notice("Translation API Key not set...");
      return;
    }
    setIcon(this.translateInputButton, "loader");
    this.translateInputButton.disabled = true;
    this.translateInputButton.classList.add(CSS_CLASS_TRANSLATING_INPUT);
    this.translateInputButton.title = "Translating...";
    try {
      const translatedText = await this.plugin.translationService.translate(currentText, targetLang);
      if (translatedText !== null) {
        this.inputEl.value = translatedText;
        this.inputEl.dispatchEvent(new Event("input"));
        this.inputEl.focus();
        const end = translatedText.length;
        this.inputEl.setSelectionRange(end, end);
      } else {
        console.warn("Input translation failed.");
      }
    } catch (error) {
      console.error("Input translation error:", error);
      new Notice("Input translation error.");
    } finally {
      setIcon(this.translateInputButton, "languages");
      this.translateInputButton.disabled = this.isProcessing;
      this.translateInputButton.classList.remove(CSS_CLASS_TRANSLATING_INPUT);
      this.translateInputButton.title = "Translate input to English";
    }
  };

  // Menu Button Click (Toggles Custom Div)
  private handleMenuClick = (e: MouseEvent): void => {
    e.stopPropagation();
    if (!this.menuDropdown) {
      console.error("menuDropdown missing!");
      return;
    } // Safety check
    const isHidden = this.menuDropdown.style.display === "none";
    if (isHidden) {
      this.menuDropdown.style.display = "block";
      this.collapseAllSubmenus(null); // Collapse all when opening main menu
    } else {
      this.closeMenu();
    }
  };

  // Handles clicks on submenu headers (Model, Role, Chat)
  // Змінено: Логіка розгортання підменю
  private async toggleSubmenu(
    headerEl: HTMLElement | null,
    contentEl: HTMLElement | null,
    type: "models" | "roles" | "chats"
  ): Promise<void> {
    if (!headerEl || !contentEl) return;
    const iconEl = headerEl.querySelector(`.${CSS_CLASS_SUBMENU_ICON}`);
    const isHidden =
      contentEl.style.maxHeight === "0px" || contentEl.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);

    if (isHidden) {
      this.collapseAllSubmenus(contentEl);
    } // Згортаємо інші перед розгортанням

    if (isHidden) {
      // --- Розгортання ---
      if (iconEl instanceof HTMLElement) setIcon(iconEl, "chevron-down");
      contentEl.empty();
      contentEl.createDiv({
        cls: "menu-loading",
        text: `Loading ${type}...`,
      });
      contentEl.classList.remove(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
      // Тимчасова висота для індикатора завантаження
      contentEl.style.maxHeight = "40px";
      contentEl.style.paddingTop = "5px";
      contentEl.style.paddingBottom = "5px";
      // Скидаємо overflow, поки завантажуємо
      contentEl.style.overflowY = "hidden";

      try {
        switch (type) {
          case "models":
            await this.renderModelList();
            break;
          case "roles":
            await this.renderRoleList();
            break;
          case "chats":
            await this.renderChatListMenu();
            break;
        }

        // Після рендерингу, обчислюємо потрібну висоту
        requestAnimationFrame(() => {
          if (!contentEl.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
            if (type === "chats") {
              // Для списку чатів: встановлюємо фіксовану max-height і дозволяємо скрол
              contentEl.style.maxHeight = CHAT_LIST_MAX_HEIGHT;
              contentEl.style.overflowY = "auto"; // Дозволяємо скрол
            } else {
              // Для інших списків: встановлюємо висоту за вмістом
              contentEl.style.maxHeight = contentEl.scrollHeight + "px";
              contentEl.style.overflowY = "hidden"; // Скрол не потрібен
            }
          }
        });
      } catch (error) {
        this.plugin.logger.error(`Error rendering ${type} list:`, error);
        contentEl.empty();
        contentEl.createDiv({
          cls: "menu-error-text",
          text: `Error loading ${type}.`,
        });
        contentEl.style.maxHeight = "50px"; // Висота для повідомлення про помилку
        contentEl.style.overflowY = "hidden";
      }
    } else {
      // --- Згортання ---
      contentEl.classList.add(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
      contentEl.style.maxHeight = "0";
      contentEl.style.paddingTop = "0";
      contentEl.style.paddingBottom = "0";
      contentEl.style.overflowY = "hidden"; // Приховуємо скрол при згортанні
      if (iconEl instanceof HTMLElement) setIcon(iconEl, "chevron-right");
    }
  }

  // Helper to collapse all submenus except the one potentially being opened
  private collapseAllSubmenus(exceptContent?: HTMLElement | null): void {
    const submenus = [
      {
        header: this.modelSubmenuHeader,
        content: this.modelSubmenuContent,
      },
      {
        header: this.roleSubmenuHeader,
        content: this.roleSubmenuContent,
      },
      {
        header: this.chatSubmenuHeader,
        content: this.chatSubmenuContent,
      },
    ];
    submenus.forEach(submenu => {
      // Check elements exist before manipulating
      if (submenu.content && submenu.header && submenu.content !== exceptContent) {
        if (!submenu.content.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
          submenu.content.classList.add(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
          submenu.content.style.maxHeight = "0";
          submenu.content.style.paddingTop = "0";
          submenu.content.style.paddingBottom = "0";
          const iconEl = submenu.header.querySelector(`.${CSS_CLASS_SUBMENU_ICON}`);
          if (iconEl instanceof HTMLElement) {
            setIcon(iconEl, "chevron-right");
          }
        }
      }
    });
  }

  // --- Action Handlers (Must call closeMenu) ---
  private handleNewChatClick = async (): Promise<void> => {
    this.closeMenu();
    try {
      const newChat = await this.plugin.chatManager.createNewChat();
      if (newChat) {
        new Notice(`Created new chat: ${newChat.metadata.name}`);
        this.focusInput();
      } else {
        new Notice("Failed to create new chat.");
      }
    } catch (error) {
      new Notice("Error creating new chat.");
    }
  };
  // У файлі src/OllamaView.ts

  private handleRenameChatClick = async (chatIdToRename?: string, currentChatName?: string): Promise<void> => {
    let chatId: string | null = chatIdToRename ?? null;
    let currentName: string | null = currentChatName ?? null;

    // Якщо ID не передано, отримуємо дані активного чату
    if (!chatId || !currentName) {
      this.plugin.logger.debug("[handleRenameChatClick] No chat ID provided, getting active chat...");
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      if (!activeChat) {
        new Notice("No active chat to rename.");
        return;
      }
      chatId = activeChat.metadata.id;
      currentName = activeChat.metadata.name;
    }
    this.plugin.logger.debug(
      `[handleRenameChatClick] Initiating rename for chat ${chatId} (current name: "${currentName}")`
    );
    // Закриваємо головне меню, якщо воно було відкрито (для виклику з нього)
    this.closeMenu();

    // Перевіряємо ще раз, чи отримали ми дані
    if (!chatId || currentName === null) {
      // currentName може бути порожнім рядком, це нормально
      this.plugin.logger.error("[handleRenameChatClick] Failed to determine chat ID or current name.");
      new Notice("Could not initiate rename process.");
      return;
    }

    // Показуємо модальне вікно для вводу нового імені
    new PromptModal(
      this.app,
      "Rename Chat",
      `Enter new name for "${currentName}":`,
      currentName, // Попередньо заповнене поле
      async newName => {
        let noticeMessage = "Rename cancelled or name unchanged.";
        const trimmedName = newName?.trim();

        if (trimmedName && trimmedName !== "" && trimmedName !== currentName) {
          this.plugin.logger.debug(
            `Attempting rename for chat ${chatId} to "${trimmedName}" via ChatManager.renameChat`
          );
          // --- ВИКЛИКАЄМО НОВИЙ МЕТОД МЕНЕДЖЕРА ---
          const success = await this.plugin.chatManager.renameChat(chatId!, trimmedName); // Використовуємо chatId!, бо ми його перевірили
          // ----------------------------------------
          if (success) {
            noticeMessage = `Chat renamed to "${trimmedName}"`;
            // UI оновиться через події 'chat-list-updated' та 'active-chat-changed' (якщо чат активний)
            // Додаткове оновлення списку в меню, якщо воно видиме (перенесено з попередньої версії)
            if (
              this.chatSubmenuContent &&
              !this.chatSubmenuContent.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)
            ) {
              this.plugin.logger.info("[handleRenameChatClick] Forcing chat list menu refresh after rename.");
              await this.renderChatListMenu();
            }
          } else {
            noticeMessage = "Failed to rename chat."; // Помилка оброблена в renameChat
          }
        } else if (trimmedName && trimmedName === currentName) {
          noticeMessage = "Name unchanged.";
        } else if (newName === null || trimmedName === "") {
          noticeMessage = "Rename cancelled or invalid name entered.";
        }
        new Notice(noticeMessage);
        this.focusInput();
      }
    ).open();
  };

  // --- НОВИЙ обробник для контекстного меню ---
  private handleContextMenuRename(chatId: string, currentName: string): void {
    this.plugin.logger.debug(`Context menu: Rename requested for chat ${chatId}`);
    // Просто викликаємо основний обробник, передаючи параметри
    this.handleRenameChatClick(chatId, currentName);
  }

  private handleCloneChatClick = async (): Promise<void> => {
    this.closeMenu();
    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat) {
      new Notice("No active chat to clone.");
      return;
    }
    const originalName = activeChat.metadata.name;
    const cloningNotice = new Notice("Cloning chat...", 0);
    try {
      const clonedChat = await this.plugin.chatManager.cloneChat(activeChat.metadata.id);
      if (clonedChat) {
        new Notice(`Chat cloned as "${clonedChat.metadata.name}" and activated.`);
      } else {
        new Notice("Failed to clone chat.");
      }
    } catch (error) {
      new Notice("An error occurred while cloning the chat.");
    } finally {
      cloningNotice.hide();
    }
  };
  private handleClearChatClick = async (): Promise<void> => {
    this.closeMenu();
    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (activeChat) {
      const chatName = activeChat.metadata.name;
      new ConfirmModal(
        this.app,
        "Clear Chat Messages",
        `Are you sure you want to clear all messages in chat "${chatName}"?\nThis action cannot be undone.`,
        () => {
          this.plugin.chatManager.clearActiveChatMessages();
        }
      ).open();
    } else {
      new Notice("No active chat to clear.");
    }
  };
  private handleDeleteChatClick = async (): Promise<void> => {
    this.closeMenu();
    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (activeChat) {
      const chatName = activeChat.metadata.name;
      new ConfirmModal(
        this.app,
        "Delete Chat",
        `Are you sure you want to delete chat "${chatName}"?\nThis action cannot be undone.`,
        async () => {
          const success = await this.plugin.chatManager.deleteChat(activeChat.metadata.id);
          if (success) {
            new Notice(`Chat "${chatName}" deleted.`);
          } else {
            new Notice(`Failed to delete chat "${chatName}".`);
          }
        }
      ).open();
    } else {
      new Notice("No active chat to delete.");
    }
  };

  // Цей обробник події викликається при натисканні на "Export to Note"
  private handleExportChatClick = async (): Promise<void> => {
    this.closeMenu();
    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat || activeChat.messages.length === 0) {
      new Notice("Chat empty, nothing to export.");
      return;
    }
    try {
      const markdownContent = this.formatChatToMarkdown(activeChat.messages);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = activeChat.metadata.name.replace(/[\\/?:*"<>|]/g, "-"); // Make filename safe
      const filename = `ollama-chat-${safeName}-${timestamp}.md`;

      let targetFolderPath = this.plugin.settings.chatExportFolderPath?.trim();
      let targetFolder: TFolder | null = null;

      // Determine target folder
      if (targetFolderPath) {
        targetFolderPath = normalizePath(targetFolderPath);
        const abstractFile = this.app.vault.getAbstractFileByPath(targetFolderPath);
        if (!abstractFile) {
          try {
            await this.app.vault.createFolder(targetFolderPath);
            targetFolder = this.app.vault.getAbstractFileByPath(targetFolderPath) as TFolder;
            if (targetFolder) {
              new Notice(`Created export folder: ${targetFolderPath}`);
            } else {
              // This case should ideally not happen if createFolder succeeds without error
              this.plugin.logger.error("Failed to get folder even after creation attempt:", targetFolderPath);
              new Notice(`Error creating export folder. Saving to vault root.`);
              targetFolder = this.app.vault.getRoot();
            }
          } catch (err) {
            this.plugin.logger.error("Error creating export folder:", err);
            new Notice(`Error creating export folder. Saving to vault root.`);
            targetFolder = this.app.vault.getRoot();
          }
        } else if (abstractFile instanceof TFolder) {
          targetFolder = abstractFile;
        } else {
          // The path exists but is not a folder
          new Notice(`Error: Export path is not a folder. Saving to vault root.`);
          targetFolder = this.app.vault.getRoot();
        }
      } else {
        // No folder path specified, use vault root
        targetFolder = this.app.vault.getRoot();
      }

      if (!targetFolder) {
        this.plugin.logger.error("Failed to determine a valid target folder for export.");
        new Notice("Error determining export folder. Cannot save file.");
        return;
      }

      // Create the file
      const filePath = normalizePath(`${targetFolder.path}/${filename}`);

      // Check if file already exists (optional, but good practice)
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      if (existingFile) {
        // Maybe prompt user or append timestamp/number? For now, log and overwrite.
        // If you want to avoid overwriting, handle it here (e.g., throw error, rename)
      }

      const file = await this.app.vault.create(filePath, markdownContent);
      new Notice(`Chat exported to ${file.path}`);
    } catch (error) {
      this.plugin.logger.error("Error exporting chat:", error);
      // Provide more specific error if possible
      if (error instanceof Error && error.message.includes("File already exists")) {
        new Notice("Error exporting chat: File already exists.");
      } else {
        new Notice("An unexpected error occurred during chat export.");
      }
    }
  };

  private handleSettingsClick = async (): Promise<void> => {
    this.closeMenu();
    (this.app as any).setting?.open?.();
    (this.app as any).setting?.openTabById?.(this.plugin.manifest.id);
  };
  private handleDocumentClickForMenu = (e: MouseEvent): void => {
    if (
      this.isMenuOpen() &&
      !this.menuButton?.contains(e.target as Node) &&
      !this.menuDropdown?.contains(e.target as Node)
    ) {
      this.closeMenu();
    }
  };

  private handleModelChange = async (modelName: string): Promise<void> => {
    // Added async/Promise
    this.updateModelDisplay(modelName);
    try {
      // Added try...catch
      const chat = await this.plugin.chatManager?.getActiveChat();
      const temp = chat?.metadata?.temperature ?? this.plugin.settings.temperature;
      this.updateTemperatureIndicator(temp);

      // Check if there are *any* messages or if a chat exists before adding system message
      if (chat && this.currentMessages.length > 0) {
        // Call ChatManager to add the system message
        await this.plugin.chatManager?.addMessageToActiveChat(
          "system",
          `Model changed to: ${modelName}`,
          new Date()
          // false // Optional: explicitly don't trigger event again from here if ChatManager does it internally
        );
        // UI update will happen via the 'message-added' event listener (handleMessageAdded)
      }
    } catch (error) {
      this.plugin.logger.error("Error handling model change notification:", error);
    }
  };

  private handleRoleChange = async (roleName: string): Promise<void> => {
    // Added async/Promise
    const displayRole = roleName || "None";
    this.updateInputPlaceholder(displayRole);
    this.updateRoleDisplay(displayRole);

    try {
      // Added try...catch
      const chat = await this.plugin.chatManager?.getActiveChat();
      // Check if there are *any* messages or if a chat exists before adding system message or notice
      if (chat && this.currentMessages.length > 0) {
        // Call ChatManager to add the system message
        await this.plugin.chatManager?.addMessageToActiveChat(
          "system",
          `Role changed to: ${displayRole}`,
          new Date()
          // false // Optional: explicitly don't trigger event again from here if ChatManager does it internally
        );
        // UI update will happen via the 'message-added' event listener (handleMessageAdded)
      } else {
        // If no messages/chat, just show a notice
        new Notice(`Role set to: ${displayRole}`);
      }
    } catch (error) {
      this.plugin.logger.error("Error handling role change notification:", error);
      // Show notice even on error?
      new Notice(`Role set to: ${displayRole}`);
    }
  };
  private handleRolesUpdated = (): void => {
    this.plugin.logger.info("[OllamaView] Received 'roles-updated' event.");
    this.plugin.promptService?.clearRoleCache(); // Очищуємо кеш ролей

    // Оновлюємо випадаюче меню (якщо відкрите)
    if (this.isMenuOpen()) {
         const isRoleSubmenuVisible =
            this.roleSubmenuContent && !this.roleSubmenuContent.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
         if(isRoleSubmenuVisible) {
            this.renderRoleList(); // Цей метод залишається в OllamaView для випадаючого меню
         }
    }

    // Оновлюємо бічну панель через SidebarManager
     if (this.sidebarManager?.isSectionVisible("roles")) {
        this.plugin.logger.info("[OllamaView -> Sidebar] Roles panel is visible, requesting update.");
        this.sidebarManager.updateRoleList().catch(e => this.plugin.logger.error("Error updating role panel list:", e));
    } else {
         this.plugin.logger.info("[OllamaView -> Sidebar] Roles panel is collapsed, skipping update.");
    }
};


  // OllamaView.ts

  // Допоміжний метод для стандартного додавання повідомлення (User, System, Error, Assistant-Fallback)
  private async addMessageStandard(message: Message): Promise<void> {
    this.plugin.logger.debug(`[addMessageStandard] Adding message standardly. Role: ${message.role}`);

    // Логіка роздільника дат
    const isNewDay = !this.lastRenderedMessageDate || !this.isSameDay(this.lastRenderedMessageDate, message.timestamp);
    if (isNewDay) {
      this.renderDateSeparator(message.timestamp);
      this.lastRenderedMessageDate = message.timestamp;
    } else if (!this.lastRenderedMessageDate && this.chatContainer?.children.length === 0) {
      this.lastRenderedMessageDate = message.timestamp;
    }
    this.hideEmptyState();

    let messageGroupEl: HTMLElement | null = null;
    try {
      let renderer: UserMessageRenderer | SystemMessageRenderer | AssistantMessageRenderer | null = null; // Assistant тут як fallback

      switch (message.role) {
        case "user":
          renderer = new UserMessageRenderer(this.app, this.plugin, message, this);
          break;
        case "system":
          renderer = new SystemMessageRenderer(this.app, this.plugin, message, this);
          break;
        case "error":
          // Помилки обробляються централізовано, включаючи додавання в DOM
          this.handleErrorMessage(message);
          // Потрібно резолвити Promise, якщо sendMessage його очікує для помилки
          if (this.currentMessageAddedResolver) {
            this.currentMessageAddedResolver();
            this.currentMessageAddedResolver = null;
          }
          return;
        case "assistant": // Використовується тільки якщо плейсхолдер не знайдено
          this.plugin.logger.warn(`[addMessageStandard] Rendering assistant message as fallback.`);
          renderer = new AssistantMessageRenderer(this.app, this.plugin, message, this);
          break;
        default:
          this.plugin.logger.warn(`[addMessageStandard] Unknown message role: ${message.role}`);
          return;
      }

      if (renderer) {
        const result = renderer.render();
        messageGroupEl = result instanceof Promise ? await result : result;
      }

      if (messageGroupEl && this.chatContainer) {
        this.chatContainer.appendChild(messageGroupEl);
        this.lastMessageElement = messageGroupEl;
        if (!messageGroupEl.isConnected) {
          this.plugin.logger.error(`[addMessageStandard] Node not connected! Role: ${message.role}`);
        }
        this.plugin.logger.debug(`[addMessageStandard] Appended message. Role: ${message.role}`);

        // Animation and scroll
        messageGroupEl.classList.add(CSS_CLASSES.MESSAGE_ARRIVING);
        setTimeout(() => messageGroupEl?.classList.remove(CSS_CLASSES.MESSAGE_ARRIVING), 500);
        const isUserMessage = message.role === "user";
        if (!isUserMessage && this.userScrolledUp && this.newMessagesIndicatorEl) {
          this.newMessagesIndicatorEl.classList.add(CSS_CLASSES.VISIBLE);
        } else if (!this.userScrolledUp) {
          this.guaranteedScrollToBottom(isUserMessage ? 50 : 100, !isUserMessage);
        }
        setTimeout(() => this.updateScrollStateAndIndicators(), 100);
      } else if (renderer) {
        this.plugin.logger.warn(`[addMessageStandard] messageGroupEl null after render. Role: ${message.role}`);
      }

      // Резолвимо Promise ТІЛЬКИ якщо він є і стосується цього стандартного додавання
      // (наприклад, для системних повідомлень або fallback асистента/помилки)
      if (this.currentMessageAddedResolver) {
        this.plugin.logger.warn(`[addMessageStandard] Resolving promise after standard add. Role: ${message.role}.`);
        try {
          this.currentMessageAddedResolver();
        } catch (e) {
          this.plugin.logger.error("Error resolving promise in addMessageStandard:", e);
        }
        this.currentMessageAddedResolver = null;
      }
    } catch (error: any) {
      this.plugin.logger.error(
        `[addMessageStandard] Error rendering/appending standard message. Role: ${message.role}`,
        error
      );
      // Якщо помилка рендерингу сталася тут, показуємо її
      this.handleErrorMessage({
        role: "error",
        content: `Failed to display ${message.role} message. Render Error: ${error.message}`,
        timestamp: new Date(),
      });
      // Резолвимо Promise, щоб sendMessage не завис
      if (this.currentMessageAddedResolver) {
        this.plugin.logger.warn(`[addMessageStandard] Resolving promise after catching error. Role: ${message.role}.`);
        try {
          this.currentMessageAddedResolver();
        } catch (e) {
          this.plugin.logger.error("Error resolving promise after error:", e);
        }
        this.currentMessageAddedResolver = null;
      }
    }
  } // Кінець addMessageStandard

  private handleMessagesCleared = (chatId: string): void => {
    if (chatId === this.plugin.chatManager?.getActiveChatId()) {
      console.log("[OllamaView] Messages cleared event received.");
      this.clearChatContainerInternal();
      this.currentMessages = [];
      this.showEmptyState();
    }
  };

  // --- Window/Workspace State Handlers ---
  private handleVisibilityChange = (): void => {
    if (document.visibilityState === "visible" && this.leaf.view === this) {
      requestAnimationFrame(() => {
        this.guaranteedScrollToBottom(50, true);
        this.adjustTextareaHeight();
        this.inputEl?.focus();
      });
    }
  };
  private handleActiveLeafChange = (leaf: WorkspaceLeaf | null): void => {
    if (leaf?.view === this) {
      this.inputEl?.focus();
      setTimeout(() => this.guaranteedScrollToBottom(150, true), 100);
    }
  };
  private handleWindowResize = (): void => {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 100);
  };

  private handleScroll = (): void => {
    if (!this.chatContainer || !this.newMessagesIndicatorEl || !this.scrollToBottomButton) return; // Додано scrollToBottomButton

    const threshold = 150; // Поріг, коли вважати, що користувач прокрутив вгору
    const atBottom =
      this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight < threshold;

    const previousScrolledUp = this.userScrolledUp;
    this.userScrolledUp = !atBottom;

    // Показуємо/ховаємо індикатор нових повідомлень
    if (previousScrolledUp && atBottom) {
      this.newMessagesIndicatorEl.classList.remove(CSS_CLASS_VISIBLE);
    }
    // (Логіка показу індикатора нових повідомлень залишається в addMessageToDisplay)

    // --- ДОДАНО: Показуємо/ховаємо кнопку "Прокрутити вниз" ---
    this.scrollToBottomButton.classList.toggle(CSS_CLASS_VISIBLE, this.userScrolledUp);
    // -------------------------------------------------------
  };

  private handleNewMessageIndicatorClick = (): void => {
    if (this.chatContainer) {
      this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: "smooth" });
    }
    this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
    this.scrollToBottomButton?.classList.remove(CSS_CLASS_VISIBLE); // Ховаємо кнопку прокрутки
    this.userScrolledUp = false; // Оновлюємо стан
  };

  private handleScrollToBottomClick = (): void => {
    if (this.chatContainer) {
      this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: "smooth" });
    }
    this.scrollToBottomButton?.classList.remove(CSS_CLASS_VISIBLE); // Ховаємо одразу
    this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
    this.userScrolledUp = false; // Оновлюємо стан
  };

  // --- UI Update Methods ---
  private updateInputPlaceholder(roleName: string | null | undefined): void {
    if (this.inputEl) {
      const displayRole = roleName || "Assistant"; // Запасний варіант
      this.inputEl.placeholder = `Message ${displayRole}...`; // Новий формат
    }
  }
  private closeMenu(): void {
    if (this.menuDropdown) {
      this.menuDropdown.style.display = "none";
      this.collapseAllSubmenus(null);
    }
  }
  private autoResizeTextarea(): void {
    this.adjustTextareaHeight();
  }
  private adjustTextareaHeight = (): void => {
    requestAnimationFrame(() => {
      if (!this.inputEl) return;
      const textarea = this.inputEl;
      const computedStyle = window.getComputedStyle(textarea);
      // Читаємо базовий min-height та max-height з CSS
      const baseMinHeight = parseFloat(computedStyle.minHeight) || 40;
      const maxHeight = parseFloat(computedStyle.maxHeight);

      // Тимчасово скидаємо height, щоб виміряти реальну висоту контенту
      const currentScrollTop = textarea.scrollTop; // Зберігаємо позицію скролу
      textarea.style.height = "auto";

      const scrollHeight = textarea.scrollHeight;

      // Обчислюємо цільову висоту, обмежену min/max
      let targetHeight = Math.max(baseMinHeight, scrollHeight);
      let applyOverflow = false;

      if (!isNaN(maxHeight) && targetHeight > maxHeight) {
        targetHeight = maxHeight;
        applyOverflow = true; // Потрібен скролбар
      }

      // Застосовуємо обчислену висоту та стиль overflow
      textarea.style.height = `${targetHeight}px`;
      textarea.style.overflowY = applyOverflow ? "auto" : "hidden";
      textarea.scrollTop = currentScrollTop; // Відновлюємо позицію скролу
    });
  };

  private updateRoleDisplay(roleName: string | null | undefined): void {
    if (this.roleDisplayEl) {
      const displayName = roleName || "None"; // Якщо роль не вибрана
      this.roleDisplayEl.setText(displayName);
      this.roleDisplayEl.title = `Current role: ${displayName}. Click to change.`;
    }
  }

  private updateSendButtonState(): void {
    if (!this.inputEl || !this.sendButton) return;
    // Кнопка відключена, якщо: поле порожнє АБО йде обробка АБО вже є активний запит (контролер не null)
    const isDisabled = this.inputEl.value.trim() === "" || this.isProcessing || this.currentAbortController !== null;
    this.sendButton.disabled = isDisabled;
    this.sendButton.classList.toggle(CSS_CLASS_DISABLED, isDisabled);

    // Кнопка Stop видима ТІЛЬКИ якщо є активний контролер
    this.stopGeneratingButton?.toggle(this.currentAbortController !== null);
  }

  public showEmptyState(): void {
    if (this.currentMessages.length === 0 && !this.emptyStateEl && this.chatContainer) {
      this.chatContainer.empty();
      this.emptyStateEl = this.chatContainer.createDiv({
        cls: CSS_CLASS_EMPTY_STATE,
      });
      this.emptyStateEl.createDiv({
        cls: "empty-state-message",
        text: "No messages yet",
      });
      const modelName = this.plugin?.settings?.modelName || "the AI";
      this.emptyStateEl.createDiv({
        cls: "empty-state-tip",
        text: `Type a message or use the menu options to start interacting with ${modelName}.`,
      });
    }
  }
  public hideEmptyState(): void {
    if (this.emptyStateEl) {
      this.emptyStateEl.remove();
      this.emptyStateEl = null;
    }
  }

  // --- State Management ---
  public setLoadingState(isLoading: boolean): void {
    this.isProcessing = isLoading;
    if (this.inputEl) this.inputEl.disabled = isLoading;
    this.updateSendButtonState(); // Updates Send/Stop visibility too
    if (this.voiceButton) {
      this.voiceButton.disabled = isLoading;
      this.voiceButton.classList.toggle(CSS_CLASSES.DISABLED, isLoading);
    }
    if (this.translateInputButton) {
      this.translateInputButton.disabled = isLoading;
      this.translateInputButton.classList.toggle(CSS_CLASSES.DISABLED, isLoading);
    }
    if (this.menuButton) {
      this.menuButton.disabled = isLoading;
      this.menuButton.classList.toggle(CSS_CLASSES.DISABLED, isLoading);
    }

    // Керування кнопками "Show More/Less"
    if (this.chatContainer) {
      if (isLoading) {
        this.chatContainer.querySelectorAll<HTMLButtonElement>(`.${CSS_CLASSES.SHOW_MORE_BUTTON}`).forEach(button => {
          button.style.display = "none";
        });
        this.plugin.logger.debug("[setLoadingState] Hid 'Show More' buttons.");
      } else {
        // --- ПОВЕРТАЄМО ВИКЛИК ---
        this.plugin.logger.debug("[setLoadingState] Re-checking message collapsing after operation finished.");
        this.checkAllMessagesForCollapsing(); // Перевіряємо згортання після завершення
        // --- КІНЕЦЬ ПОВЕРНЕННЯ ---
      }
    }
    this.plugin.logger.debug(`[OllamaView Debug] isProcessing is now: ${this.isProcessing}`);
  }

  // Load and Display Chat (Тепер оновлює і температуру)

  // В src/OllamaView.ts

  // --- ВАЖЛИВО: Переконайтесь, що цей метод також оновлений! ---
  // (Перевірив ваш код, він вже містить виклик updateRolePanelList, це добре)
  // OllamaView.ts

  // OllamaView.ts

  // Перевіряємо, чи видима секція бічної панелі
  private isSidebarSectionVisible(type: "chats" | "roles"): boolean {
    const headerEl = type === "chats" ? this.chatPanelHeaderEl : this.rolePanelHeaderEl;
    return headerEl?.getAttribute("data-collapsed") === "false";
  }

  async loadAndDisplayActiveChat(): Promise<void> {
    // ... (початок методу: очищення, отримання даних чату, моделей, ролі, температури) ...
    // Ця частина залишається переважно такою ж
    this.plugin.logger.error(
      "[loadAndDisplayActiveChat] >>> ВХІД: Починаємо повне перезавантаження/відображення чату <<<"
    ); // Помітний лог
    this.plugin.logger.debug("[loadAndDisplayActiveChat] Start loading/displaying active chat...");
    try {
      this.clearChatContainerInternal(); // Clear display and local state
      this.currentMessages = [];
      this.lastRenderedMessageDate = null;
      this.lastMessageElement = null; // Скидаємо останній елемент
      this.consecutiveErrorMessages = []; // Скидаємо буфер помилок
      this.errorGroupElement = null; // Скидаємо групу помилок

      let activeChat: Chat | null = null;
      let availableModels: string[] = [];
      let finalModelName: string | null = null;
      let finalRolePath: string | null | undefined = undefined;
      let finalRoleName: string = "None";
      let finalTemperature: number | null | undefined = undefined;
      let errorOccurred = false;

      // Step 1: Fetch essential data
      try {
        // ... (отримання activeChat, availableModels, finalRolePath, finalRoleName) ...
        activeChat = (await this.plugin.chatManager?.getActiveChat()) || null;
        this.plugin.logger.debug(
          `[loadAndDisplayActiveChat] Active chat fetched: ${activeChat?.metadata?.id ?? "null"}`
        );
        availableModels = await this.plugin.ollamaService.getModels(); // Get models early
        this.plugin.logger.debug(`[loadAndDisplayActiveChat] Available models fetched: ${availableModels.join(", ")}`);

        finalRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;
        finalRoleName = await this.findRoleNameByPath(finalRolePath);
        this.plugin.logger.debug(
          `[loadAndDisplayActiveChat] Determined role: Path='${finalRolePath || "None"}', Name='${finalRoleName}'`
        );
      } catch (error) {
        // ... (обробка помилки завантаження даних) ...
        this.plugin.logger.error("[loadAndDisplayActiveChat] Error fetching initial data:", error);
        new Notice("Error connecting to Ollama or loading chat data.", 5000);
        errorOccurred = true;
        // Set fallbacks based on global settings
        finalModelName = availableModels.includes(this.plugin.settings.modelName)
          ? this.plugin.settings.modelName
          : availableModels[0] ?? null;
        finalTemperature = this.plugin.settings.temperature;
        finalRolePath = this.plugin.settings.selectedRolePath;
        finalRoleName = await this.findRoleNameByPath(finalRolePath);
        activeChat = null;
      }

      // Steps 2, 3, 4: Determine final model/temp and update metadata if needed (only if chat loaded)
      if (!errorOccurred && activeChat) {
        // ... (визначення finalModelName та finalTemperature, оновлення метаданих) ...
        let preferredModel = activeChat.metadata?.modelName || this.plugin.settings.modelName;
        if (availableModels.length > 0) {
          if (preferredModel && availableModels.includes(preferredModel)) {
            finalModelName = preferredModel;
          } else {
            finalModelName = availableModels[0];
            this.plugin.logger.warn(
              `[loadAndDisplayActiveChat] Preferred model '${preferredModel}' not available. Using first available: '${finalModelName}'.`
            );
          }
        } else {
          finalModelName = null;
          this.plugin.logger.warn(`[loadAndDisplayActiveChat] No Ollama models detected.`);
        }
        // Update metadata if model differs (async in background)
        if (activeChat.metadata.modelName !== finalModelName && finalModelName !== null) {
          this.plugin.chatManager.updateActiveChatMetadata({ modelName: finalModelName }).catch(updateError => {
            this.plugin.logger.error(
              "[loadAndDisplayActiveChat] Background error updating chat model metadata:",
              updateError
            );
          });
        }
        finalTemperature = activeChat.metadata?.temperature ?? this.plugin.settings.temperature;
      } else if (!errorOccurred && !activeChat) {
        // Set model/temp based on global settings if no chat exists
        finalModelName = availableModels.includes(this.plugin.settings.modelName)
          ? this.plugin.settings.modelName
          : availableModels[0] ?? null;
        finalTemperature = this.plugin.settings.temperature;
      }
      // If an error occurred during initial fetch, finalModelName/Temp/Role are already set to fallbacks

      // --- Step 5: Render Messages Sequentially using Renderers (REFACTORED) ---
      if (activeChat !== null && !errorOccurred && activeChat.messages?.length > 0) {
        this.hideEmptyState();
        this.currentMessages = [...activeChat.messages]; // Ensure local cache matches
        this.lastRenderedMessageDate = null; // Reset date logic

        for (const message of this.currentMessages) {
          let messageGroupEl: HTMLElement | null = null;

          // Check if date separator needed BEFORE rendering this message
          const isNewDay =
            !this.lastRenderedMessageDate || !this.isSameDay(this.lastRenderedMessageDate, message.timestamp);
          const isFirstMessageInContainer = this.chatContainer.children.length === 0;

          if (isNewDay || isFirstMessageInContainer) {
            if (isNewDay) {
              this.renderDateSeparator(message.timestamp);
            }
            this.lastRenderedMessageDate = message.timestamp; // Update last date
          }

          // Render the message itself using appropriate renderer
          try {
            let renderer:
              | UserMessageRenderer
              | AssistantMessageRenderer
              | SystemMessageRenderer
              | ErrorMessageRenderer
              | null = null;
            switch (message.role) {
              case "user":
                renderer = new UserMessageRenderer(this.app, this.plugin, message, this);
                break;
              case "assistant":
                renderer = new AssistantMessageRenderer(this.app, this.plugin, message, this);
                break;
              case "system":
                renderer = new SystemMessageRenderer(this.app, this.plugin, message, this);
                break;
              case "error":
                // Якщо при завантаженні зустрічаємо помилку, рендеримо її як окрему групу
                renderer = new ErrorMessageRenderer(this.app, this.plugin, message, this);
                // Скидаємо логіку групування послідовних помилок при повному перезавантаженні
                this.lastMessageElement = null;
                this.errorGroupElement = null;
                this.consecutiveErrorMessages = [];
                break;
              default:
                this.plugin.logger.warn(`[loadAndDisplayActiveChat] Unknown message role: ${message.role}`);
            }

            if (renderer) {
              const result = renderer.render();
              if (result instanceof Promise) {
                messageGroupEl = await result;
              } else {
                messageGroupEl = result;
              }
            }
          } catch (renderError) {
            this.plugin.logger.error("Error rendering message during load:", renderError, message);
            // Optionally add an error message to the display here if desired
            const errorDiv = this.chatContainer.createDiv({ cls: "render-error" });
            errorDiv.setText(`Error rendering message (role: ${message.role})`);
            messageGroupEl = errorDiv; // Assign errorDiv to messageGroupEl to be appended
          }

          // Append the rendered element if successful
          if (messageGroupEl) {
            this.chatContainer.appendChild(messageGroupEl);
            this.lastMessageElement = messageGroupEl; // Оновлюємо посилання на останній елемент
          }
        } // End for loop

        // Check collapsing for all messages AFTER loop finishes and all are in DOM
        setTimeout(() => this.checkAllMessagesForCollapsing(), 100); // Затримка для розрахунку висоти

        // Scroll and update indicators after ALL messages are rendered
        setTimeout(() => {
          this.guaranteedScrollToBottom(100, false); // Scroll gently to bottom
          setTimeout(() => {
            this.updateScrollStateAndIndicators(); // Update buttons based on final scroll position
          }, 150);
        }, 150); // Delay to allow layout reflow
      } else {
        // No messages or chat loaded
        this.showEmptyState();
        this.scrollToBottomButton?.classList.remove(CSS_CLASSES.VISIBLE); // Hide scroll button
      }
      // --- End Refactored Step 5 ---

      // --- Step 6 & 7: Update other UI elements (залишається як було) ---
      this.plugin.logger.debug("[loadAndDisplayActiveChat] Updating final UI elements...");
      this.updateInputPlaceholder(finalRoleName);
      this.updateRoleDisplay(finalRoleName);
      this.updateModelDisplay(finalModelName);
      this.updateTemperatureIndicator(finalTemperature);

     // --- ОНОВЛЕНО: Update side panels via SidebarManager ---
     this.plugin.logger.debug("[loadAndDisplayActiveChat] Updating visible sidebar panels via SidebarManager...");
     const panelUpdatePromises = [];
     if (this.sidebarManager?.isSectionVisible("chats")) {
         panelUpdatePromises.push(
             this.sidebarManager.updateChatList().catch(e => this.plugin.logger.error("Error updating chat panel list:", e))
         );
     } else {
         this.plugin.logger.debug("[loadAndDisplayActiveChat] Chat panel collapsed, skipping update.");
     }
     if (this.sidebarManager?.isSectionVisible("roles")) {
         panelUpdatePromises.push(
             this.sidebarManager.updateRoleList().catch(e => this.plugin.logger.error("Error updating role panel list:", e))
         );
     } else {
         this.plugin.logger.debug("[loadAndDisplayActiveChat] Role panel collapsed, skipping update.");
     }

     if (panelUpdatePromises.length > 0) {
         await Promise.all(panelUpdatePromises);
         this.plugin.logger.debug("[loadAndDisplayActiveChat] Sidebar panel updates finished.");
     }
     // --- КІНЕЦЬ ОНОВЛЕННЯ ---
      // Set input state based on model availability
      if (finalModelName === null) {
        // ... (disable input if no model) ...
        this.plugin.logger.warn("[loadAndDisplayActiveChat] No model available. Disabling input.");
        if (this.inputEl) {
          this.inputEl.disabled = true;
          this.inputEl.placeholder = "No models available...";
        }
        if (this.sendButton) {
          this.sendButton.disabled = true;
          this.sendButton.classList.add(CSS_CLASSES.DISABLED);
        }
        this.setLoadingState(false);
      } else {
        if (this.inputEl) {
          this.inputEl.disabled = this.isProcessing; // Should be false initially
        }
        this.updateSendButtonState();
      }
    } catch (error) {
      this.plugin.logger.error("[loadAndDisplayActiveChat] XXX ПОМИЛКА під час виконання XXX", error);
    } finally {
      this.plugin.logger.error(
        "[loadAndDisplayActiveChat] <<< ВИХІД: Завершено повне перезавантаження/відображення чату >>>"
      ); // Помітний лог
    }

    this.plugin.logger.debug("[loadAndDisplayActiveChat] Finished.");
  }

  // OllamaView.ts

  // --- Оновлений handleActiveChatChanged з детальним логуванням ---
  private async handleActiveChatChanged(data: { chatId: string | null; chat: Chat | null }): Promise<void> {
    // Використовуємо ERROR для максимальної видимості в консолі
    this.plugin.logger.error(
      `[handleActiveChatChanged] <<< ОТРИМАНО ПОДІЮ >>> Новий ID: ${
        data.chatId
      }, Є дані чату: ${!!data.chat}, Попередній ID: ${this.lastProcessedChatId}`
    );

    const chatSwitched = data.chatId !== this.lastProcessedChatId;
    this.plugin.logger.warn(`[handleActiveChatChanged] Обчислено chatSwitched: ${chatSwitched}`); // WARN теж помітний

    // --- Тимчасове вимкнення для тестування ---
    if (this.temporarilyDisableChatChangedReload) {
      this.plugin.logger.error(
        "[handleActiveChatChanged] ПЕРЕЗАВАНТАЖЕННЯ ВИМКНЕНО ДЛЯ ТЕСТУ. Пропускаємо логіку оновлення/перезавантаження."
      );
      // Оновлюємо ID для наступних перевірок
      this.lastProcessedChatId = data.chatId;
      return; // Виходимо раніше
    }
    // --- Кінець тимчасового вимкнення ---

    if (chatSwitched || (data.chatId !== null && data.chat === null)) {
      // Логуємо умову перезавантаження як ERROR
      this.plugin.logger.error(
        `[handleActiveChatChanged] !!! УМОВА ПЕРЕЗАВАНТАЖЕННЯ ВИКОНАНА !!! (switched: ${chatSwitched}, data.chat === null: ${
          data.chat === null
        }). Готуємось викликати loadAndDisplayActiveChat...`
      );
      // Логуємо stack trace, щоб побачити, хто викликав подію, що призвела до перезавантаження
      const currentStack = new Error().stack;
      this.plugin.logger.error(`[handleActiveChatChanged] Stack trace для умови перезавантаження: ${currentStack}`);

      if (chatSwitched) {
        this.lastProcessedChatId = data.chatId;
      }
      this.plugin.logger.error("[handleActiveChatChanged] ВИКЛИКАЄМО loadAndDisplayActiveChat ЗАРАЗ!"); // Лог перед викликом
      await this.loadAndDisplayActiveChat(); // Повне перезавантаження
    } else if (data.chatId !== null && data.chat !== null) {
      // Лог для нормального оновлення метаданих
      this.plugin.logger.info(
        `[handleActiveChatChanged] Входимо в блок оновлення МЕТАДАНИХ/ПАНЕЛЕЙ (ID: ${data.chatId}). БЕЗ ПЕРЕЗАВАНТАЖЕННЯ.`
      );
      if (!chatSwitched) {
        // Переконуємось, що ID оновлено, якщо це той самий чат
        this.lastProcessedChatId = data.chatId;
      }
       // Оновлюємо основні елементи UI (індикатори моделі, ролі, температури)
       const chat = data.chat; // Вже отримали чат
       const currentRolePath = chat.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;
      const currentRoleName = await this.findRoleNameByPath(currentRolePath);
      const currentModelName = chat.metadata?.modelName || this.plugin.settings.modelName;
      const currentTemperature = chat.metadata?.temperature ?? this.plugin.settings.temperature;

      this.updateModelDisplay(currentModelName);
      this.updateRoleDisplay(currentRoleName);
      this.updateInputPlaceholder(currentRoleName);
      this.updateTemperatureIndicator(currentTemperature);

       // --- ОНОВЛЕНО: Оновлюємо панелі через SidebarManager ---
      this.plugin.logger.debug("[handleActiveChatChanged] Updating visible sidebar panels via SidebarManager...");
      const panelUpdatePromises = [];
      if (this.sidebarManager?.isSectionVisible("chats")) {
          panelUpdatePromises.push(
              this.sidebarManager.updateChatList().catch(e => this.plugin.logger.error("Error updating chat panel list:", e))
          );
      }
      if (this.sidebarManager?.isSectionVisible("roles")) {
          panelUpdatePromises.push(
              this.sidebarManager.updateRoleList().catch(e => this.plugin.logger.error("Error updating role panel list:", e))
          );
      }
      if (panelUpdatePromises.length > 0) {
          await Promise.all(panelUpdatePromises);
          this.plugin.logger.debug("[handleActiveChatChanged] Sidebar panel updates finished.");
      }
      // --- КІНЕЦЬ ОНОВЛЕННЯ ---    
      } else {
      // Лог для непередбаченого стану
      this.plugin.logger.warn(
        `[handleActiveChatChanged] Входимо в блок НЕОБРОБЛЕНОГО СТАНУ: chatId=${data.chatId}, chatSwitched=${chatSwitched}.`
      );
      this.lastProcessedChatId = data.chatId; // Оновлюємо на випадок помилки
    }

    // ... (Оновлення випадаючого меню ролей) ...

    this.plugin.logger.error(
      // Використовуємо ERROR для максимальної видимості
      `[handleActiveChatChanged] <<< ЗАВЕРШЕНО ОБРОБКУ ПОДІЇ >>> Для ID: ${data.chatId ?? "null"}`
    );
  }

  
private handleChatListUpdated = (): void => {
  this.plugin.logger.info("[OllamaView] Received 'chat-list-updated' event.");

  // Оновлюємо випадаюче меню (якщо відкрите) - ця логіка залишається тут
  const menuOpen = this.isMenuOpen();
  if (menuOpen) {
      const isChatSubmenuVisible =
          this.chatSubmenuContent && !this.chatSubmenuContent.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
      if (isChatSubmenuVisible) {
          this.renderChatListMenu().catch(error => {
               this.plugin.logger.error("[OllamaView] Error rendering chat list menu:", error);
          });
      }
  }

  // Оновлюємо бічну панель через SidebarManager
  if (this.sidebarManager?.isSectionVisible("chats")) { // Перевірка видимості через менеджер
      this.plugin.logger.info("[OllamaView -> Sidebar] Chat panel is visible, requesting update.");
      this.sidebarManager.updateChatList().catch(error => { // Виклик методу менеджера
          this.plugin.logger.error("[OllamaView -> Sidebar] Error updating chat panel list:", error);
      });
  } else {
      this.plugin.logger.info("[OllamaView -> Sidebar] Chat panel is collapsed, skipping update.");
  }
};;


public handleSettingsUpdated = async (): Promise<void> => {
  this.plugin.logger.debug("[OllamaView] Received 'settings-updated' event.");
  // ... (отримання даних як було: activeChat, model, role, temp) ...
   const activeChat = await this.plugin.chatManager?.getActiveChat();
  const currentModelName = activeChat?.metadata?.modelName || this.plugin.settings.modelName;
  const currentRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;
  const currentRoleName = await this.findRoleNameByPath(currentRolePath);
  const currentTemperature = activeChat?.metadata?.temperature ?? this.plugin.settings.temperature;


  // Оновлення основних елементів UI
  this.updateModelDisplay(currentModelName);
  this.updateRoleDisplay(currentRoleName);
  this.updateInputPlaceholder(currentRoleName);
  this.updateTemperatureIndicator(currentTemperature);
  this.updateToggleViewLocationOption();
  this.updateToggleLocationButton();

  // Оновлення випадаючого меню (якщо відкрите)
  if (this.isMenuOpen()) {
      // Оновити список ролей у випадаючому меню
      const isRoleSubmenuVisible =
          this.roleSubmenuContent && !this.roleSubmenuContent.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
      if (isRoleSubmenuVisible) {
          this.plugin.logger.debug("[handleSettingsUpdated] Role submenu open, refreshing role list menu.");
          await this.renderRoleList().catch(e => this.plugin.logger.error("Error updating role dropdown list:", e));
      }
       // Оновити список моделей у випадаючому меню
       const isModelSubmenuVisible =
          this.modelSubmenuContent && !this.modelSubmenuContent.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
      if (isModelSubmenuVisible) {
          this.plugin.logger.debug("[handleSettingsUpdated] Model submenu open, refreshing model list menu.");
          await this.renderModelList().catch(e => this.plugin.logger.error("Error updating model dropdown list:", e));
      }
  }


  // --- ОНОВЛЕНО: Оновлюємо панель ролей через SidebarManager (бо могла змінитися дефолтна роль) ---
  if (this.sidebarManager?.isSectionVisible("roles")) {
      this.plugin.logger.debug("[handleSettingsUpdated -> Sidebar] Roles panel is visible, updating it.");
      await this.sidebarManager.updateRoleList().catch(e => this.plugin.logger.error("Error updating role panel list:", e));
  } else {
      this.plugin.logger.debug("[handleSettingsUpdated -> Sidebar] Roles panel is collapsed, skipping update.");
  }
  // --- КІНЕЦЬ ОНОВЛЕННЯ ---

   // --- ОНОВЛЕНО: Оновлюємо панель чатів через SidebarManager (бо могла змінитися папка експорту або щось інше) ---
   if (this.sidebarManager?.isSectionVisible("chats")) {
      this.plugin.logger.debug("[handleSettingsUpdated -> Sidebar] Chat panel is visible, updating it.");
      await this.sidebarManager.updateChatList().catch(e => this.plugin.logger.error("Error updating chat panel list:", e));
  } else {
      this.plugin.logger.debug("[handleSettingsUpdated -> Sidebar] Chat panel is collapsed, skipping update.");
  }
   // --- КІНЕЦЬ ОНОВЛЕННЯ ---


  this.plugin.logger.debug("[handleSettingsUpdated] UI updates finished.");
};

  public async handleDeleteMessageClick(messageToDelete: Message): Promise<void> {
    this.plugin.logger.debug(`Delete requested for message timestamp: ${messageToDelete.timestamp.toISOString()}`);

    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat) {
      new Notice("Cannot delete message: No active chat.");
      return;
    }

    // --- Підтвердження видалення ---
    new ConfirmModal(
      this.app,
      "Confirm Message Deletion",
      `Are you sure you want to delete this message?\n"${messageToDelete.content.substring(0, 100)}${
        messageToDelete.content.length > 100 ? "..." : ""
      }"\n\nThis action cannot be undone.`,
      async () => {
        // Колбек при підтвердженні
        this.plugin.logger.info(
          `User confirmed deletion for message timestamp: ${messageToDelete.timestamp.toISOString()} in chat ${
            activeChat.metadata.id
          }`
        );
        try {
          // Викликаємо метод менеджера для видалення повідомлення
          // Важливо: Передаємо ID чату та унікальний ідентифікатор повідомлення (timestamp)
          const deleteSuccess = await this.plugin.chatManager.deleteMessageByTimestamp(
            activeChat.metadata.id,
            messageToDelete.timestamp
          );

          if (deleteSuccess) {
            new Notice("Message deleted.");
            // ChatManager має викликати подію 'active-chat-changed' після успішного видалення та збереження,
            // що призведе до автоматичного оновлення UI через handleActiveChatChanged -> loadAndDisplayActiveChat.
            // Якщо ChatManager не викликає подію, потрібно буде викликати оновлення вручну:
            // await this.loadAndDisplayActiveChat();
          } else {
            // Цей випадок не мав би статися, якщо deleteMessageByTimestamp кидає помилку при невдачі
            new Notice("Failed to delete message.");
            this.plugin.logger.warn(
              `deleteMessageByTimestamp returned false for chat ${
                activeChat.metadata.id
              }, timestamp ${messageToDelete.timestamp.toISOString()}`
            );
          }
        } catch (error) {
          this.plugin.logger.error(
            `Error deleting message (chat ${
              activeChat.metadata.id
            }, timestamp ${messageToDelete.timestamp.toISOString()}):`,
            error
          );
          new Notice("An error occurred while deleting the message.");
        }
      }
    ).open();
  }

  // OllamaView.ts (Повна виправлена версія методу handleRegenerateClick)

  // OllamaView.ts (Повна виправлена версія методу handleRegenerateClick)

  public async handleRegenerateClick(userMessage: Message): Promise<void> {
    this.plugin.logger.info(`Regenerate requested for user message timestamp: ${userMessage.timestamp.toISOString()}`);

    // --- Check for ongoing generation ---
    if (this.currentAbortController) {
      this.plugin.logger.warn(
        "Cannot regenerate while another generation is in progress. Cancelling current one first."
      );
      this.cancelGeneration(); // Attempt to cancel
      await new Promise(resolve => setTimeout(resolve, 150)); // Give time for cancellation
      if (this.currentAbortController) {
        // If still processing after delay
        this.plugin.logger.warn("Previous generation cancellation still processing. Please try again shortly.");
        new Notice("Please wait for the current generation to stop completely.");
        return;
      }
    }

    // --- Get active chat and message index ---
    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat) {
      new Notice("Cannot regenerate: No active chat found.");
      return;
    }
    const chatId = activeChat.metadata.id;
    const messageIndex = activeChat.messages.findIndex(
      msg => msg.timestamp.getTime() === userMessage.timestamp.getTime()
    );

    // --- Validate message index ---
    if (messageIndex === -1) {
      this.plugin.logger.error(
        "Could not find the user message in the active chat history for regeneration.",
        userMessage
      );
      new Notice("Error: Could not find the message to regenerate from.");
      return;
    }
    if (messageIndex === activeChat.messages.length - 1) {
      new Notice("This is the last message, nothing to regenerate after it.");
      return;
    }

    // --- Confirm with user ---
    new ConfirmModal(
      this.app,
      "Confirm Regeneration",
      "This will delete all messages after this prompt and generate a new response. Continue?",
      async () => {
        // --- Regeneration logic after confirmation ---
        this.plugin.logger.debug(`User confirmed regeneration for chat ${chatId} after index ${messageIndex}`);

        // Local variables for this regeneration process
        this.currentAbortController = new AbortController(); // New controller for this request
        let assistantPlaceholderGroupEl: HTMLElement | null = null; // Placeholder DOM element
        let assistantContentEl: HTMLElement | null = null; // Placeholder content DOM element
        let accumulatedResponse = ""; // Accumulated streaming response
        const responseStartTime = new Date(); // Timestamp for the new assistant message

        // Update UI to loading state
        this.setLoadingState(true);
        this.stopGeneratingButton?.show();
        this.sendButton?.hide();

        try {
          // 1. Delete messages after the target user message via ChatManager
          this.plugin.logger.debug(`Deleting messages after index ${messageIndex} in chat ${chatId}...`);
          const deleteSuccess = await this.plugin.chatManager.deleteMessagesAfter(chatId, messageIndex);
          if (!deleteSuccess) {
            throw new Error("Failed to delete subsequent messages.");
          }
          this.plugin.logger.debug("Subsequent messages deleted successfully.");

          // 2. Get the updated chat state (important!)
          const updatedChat = await this.plugin.chatManager.getActiveChat();
          if (!updatedChat || updatedChat.metadata.id !== chatId) {
            throw new Error(
              "Failed to get updated chat state after deleting messages or active chat changed unexpectedly."
            );
          }

          // 3. Reload the entire chat display based on the updated history
          // This ensures the UI accurately reflects the state before regeneration starts
          this.plugin.logger.debug("Reloading chat display after message deletion...");
          await this.loadAndDisplayActiveChat();
          this.scrollToBottom(); // Scroll down after reload

          // 4. Create the temporary streaming placeholder in the DOM
          this.plugin.logger.debug("Creating placeholder for regenerated assistant message...");
          assistantPlaceholderGroupEl = this.chatContainer.createDiv({
            cls: `${CSS_CLASSES.MESSAGE_GROUP} ${CSS_CLASSES.OLLAMA_GROUP}`,
          });
          // --- FIXED: Use RendererUtils.renderAvatar ---
          RendererUtils.renderAvatar(this.app, this.plugin, assistantPlaceholderGroupEl, false);
          // ------------------------------------------
          const messageWrapper = assistantPlaceholderGroupEl.createDiv({ cls: "message-wrapper" });
          messageWrapper.style.order = "2";
          const assistantMessageElement = messageWrapper.createDiv({
            cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.OLLAMA_MESSAGE}`,
          });
          const contentContainer = assistantMessageElement.createDiv({ cls: CSS_CLASSES.CONTENT_CONTAINER });
          assistantContentEl = contentContainer.createDiv({
            cls: `${CSS_CLASSES.CONTENT} ${CSS_CLASSES.CONTENT_COLLAPSIBLE}`,
          });
          // Add "thinking" dots indicator
          const dots = assistantContentEl.createDiv({ cls: CSS_CLASSES.THINKING_DOTS });
          for (let i = 0; i < 3; i++) dots.createDiv({ cls: CSS_CLASSES.THINKING_DOT });
          this.guaranteedScrollToBottom(50, true); // Scroll to show placeholder

          // 5. Start the streaming generation request using the updated history
          this.plugin.logger.info(`Starting regeneration stream request for chat ${chatId}...`);
          const stream = this.plugin.ollamaService.generateChatResponseStream(
            updatedChat, // Use the history *after* deletion
            this.currentAbortController.signal // Pass cancellation signal
          );

          // 6. Process the stream chunks
          let firstChunk = true;
          for await (const chunk of stream) {
            if ("error" in chunk && chunk.error) {
              if (!chunk.error.includes("aborted by user")) throw new Error(chunk.error);
            }
            if ("response" in chunk && chunk.response && assistantContentEl) {
              if (firstChunk) {
                assistantContentEl.empty(); // Remove thinking dots
                firstChunk = false;
              }
              accumulatedResponse += chunk.response;
              // --- FIXED: Use RendererUtils.renderAssistantContent ---
              // Update placeholder content using the utility function
              await RendererUtils.renderAssistantContent(
                this.app,
                this,
                this.plugin,
                assistantContentEl,
                accumulatedResponse
              );
              // --------------------------------------------------
              this.guaranteedScrollToBottom(50, false);
              this.checkMessageForCollapsing(assistantMessageElement);
            }
            if ("done" in chunk && chunk.done) {
              break; // Stream finished
            }
          }

          // 7. Stream completed successfully
          this.plugin.logger.debug(
            `Regeneration stream completed successfully. Final response length: ${accumulatedResponse.length}`
          );
          // Remove placeholder *before* adding final message via ChatManager event
          assistantPlaceholderGroupEl?.remove();
          assistantPlaceholderGroupEl = null;

          if (accumulatedResponse.trim()) {
            // Add the final message to history. The 'message-added' event will handle rendering.
            await this.plugin.chatManager.addMessageToActiveChat(
              "assistant",
              accumulatedResponse,
              responseStartTime,
              false // Event is triggered by ChatManager internally
            );
            this.plugin.logger.debug("Saved final regenerated message to chat history.");
          } else {
            // Handle empty response case
            this.plugin.logger.warn("[OllamaView] Regeneration stream finished but response empty.");
            // --- FIXED: Use ChatManager to add system message ---
            await this.plugin.chatManager.addMessageToActiveChat(
              "system",
              "Assistant provided an empty response during regeneration.",
              new Date()
            );
            // ---------------------------------------------------
          }
        } catch (error: any) {
          // 8. Handle errors during the regeneration process
          this.plugin.logger.error("Error during regeneration process:", error);
          // Ensure placeholder is removed if an error occurred
          assistantPlaceholderGroupEl?.remove();
          assistantPlaceholderGroupEl = null;

          if (
            error.name === "AbortError" ||
            error.message?.includes("aborted") ||
            error.message?.includes("aborted by user")
          ) {
            // Handle user cancellation
            this.plugin.logger.info("[OllamaView] Regeneration was cancelled by user.");
            // --- FIXED: Use ChatManager to add system message ---
            await this.plugin.chatManager.addMessageToActiveChat("system", "Regeneration stopped.", new Date());
            // ---------------------------------------------------
            if (accumulatedResponse.trim()) {
              // Save partial response if available
              this.plugin.logger.info("Saving partial response after regeneration cancellation...");
              // --- FIXED: Use ChatManager to add partial assistant message ---
              await this.plugin.chatManager.addMessageToActiveChat(
                "assistant",
                accumulatedResponse, // The partial content
                responseStartTime,
                false // Event triggered by manager
              );
              // ----------------------------------------------------------
            }
          } else {
            // Handle other errors
            new Notice(`Regeneration failed: ${error.message || "Unknown error"}`);
            // --- FIXED: Use ChatManager to add error message ---
            await this.plugin.chatManager.addMessageToActiveChat(
              "error",
              `Regeneration failed: ${error.message || "Unknown error"}`,
              new Date()
            );
            // -------------------------------------------------
          }
        } finally {
          // 9. Always execute cleanup
          this.plugin.logger.debug("[OllamaView] handleRegenerateClick finally block executing.");
          // Safety check to ensure placeholder is removed
          assistantPlaceholderGroupEl?.remove();
          // Reset loading state and buttons
          this.setLoadingState(false);
          this.stopGeneratingButton?.hide();
          this.sendButton?.show();
          this.currentAbortController = null; // Clear the abort controller
          this.updateSendButtonState();
          this.focusInput();
          this.plugin.logger.debug("[OllamaView] handleRegenerateClick finally block finished.");
        }
      } // End of ConfirmModal callback
    ).open();
  }

  public handleCopyClick(content: string, buttonEl: HTMLElement): void {
    // ... implementation remains the same ...
    let textToCopy = content;
    // Decode HTML and remove <think> tags before copying
    if (RendererUtils.detectThinkingTags(RendererUtils.decodeHtmlEntities(content)).hasThinkingTags) {
      textToCopy = RendererUtils.decodeHtmlEntities(content)
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .trim();
    }
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        setIcon(buttonEl, "check");
        buttonEl.setAttribute("title", "Copied!");
        setTimeout(() => {
          setIcon(buttonEl, "copy");
          buttonEl.setAttribute("title", "Copy");
        }, 2000);
      })
      .catch(err => {
        console.error("Copy failed:", err);
        new Notice("Failed to copy text.");
      });
  }

  // OllamaView.ts (Повна оновлена версія методу handleTranslateClick)

  public async handleTranslateClick(
    originalContent: string, // Оригінальний текст повідомлення (необроблений)
    contentEl: HTMLElement, // DOM-елемент ОРИГІНАЛЬНОГО контенту, куди додавати переклад
    buttonEl: HTMLButtonElement // Кнопка перекладу для оновлення стану
  ): Promise<void> {
    // 1. Перевірка налаштувань
    const targetLang = this.plugin.settings.translationTargetLanguage;
    const apiKey = this.plugin.settings.googleTranslationApiKey; // Ключ для Google Translate API
    if (!this.plugin.settings.enableTranslation || !targetLang || !apiKey) {
      new Notice("Translation feature or API key/target language is not configured in settings.");
      return;
    }

    // 2. Підготовка тексту до перекладу
    let textToTranslate = "";
    try {
      // Спочатку декодуємо HTML сутності, потім працюємо з тегами
      const decodedContent = RendererUtils.decodeHtmlEntities(originalContent);

      // Перевіряємо та видаляємо теги <think>, якщо вони є
      if (RendererUtils.detectThinkingTags(decodedContent).hasThinkingTags) {
        textToTranslate = decodedContent
          .replace(/<think>[\s\S]*?<\/think>/g, "") // Видаляємо теги та їх вміст
          .trim(); // Прибираємо зайві пробіли по краях
      } else {
        textToTranslate = decodedContent.trim(); // Якщо тегів немає, просто обрізаємо пробіли
      }

      // Перевірка, чи залишився текст після обробки
      if (!textToTranslate) {
        this.plugin.logger.warn(
          "[handleTranslateClick] Text to translate is empty after preprocessing (removing <think> tags?)."
        );
        new Notice("Nothing to translate (content might be empty after removing internal tags).");
        return;
      }
    } catch (error) {
      this.plugin.logger.error("[handleTranslateClick] Error during text preprocessing:", error);
      new Notice("Failed to prepare text for translation.");
      return;
    }

    // 3. Видалення попереднього контейнера перекладу, якщо він існує
    contentEl.querySelector(`.${CSS_CLASS_TRANSLATION_CONTAINER}`)?.remove();

    // 4. Встановлення стану завантаження для кнопки
    const originalIcon = buttonEl.querySelector(".svg-icon")?.getAttribute("icon-name") || "languages"; // Зберегти оригінальну іконку
    setIcon(buttonEl, "loader"); // Показати індикатор завантаження
    buttonEl.disabled = true;
    buttonEl.classList.add(CSS_CLASS_TRANSLATION_PENDING); // Додати клас для можливої стилізації
    const originalTitle = buttonEl.title; // Зберегти оригінальний title
    buttonEl.setAttribute("title", "Translating...");

    // 5. Виконання перекладу
    try {
      // Виклик сервісу перекладу
      const translatedText = await this.plugin.translationService.translate(textToTranslate, targetLang);

      // Перевірка, чи елемент контенту все ще існує в DOM
      if (!contentEl || !contentEl.isConnected) {
        this.plugin.logger.error(
          "[handleTranslateClick] contentEl is null or not connected to DOM when translation arrived."
        );
        new Notice("Translation failed: message element not found.");
        // Стан кнопки буде відновлено у finally
        return;
      }

      if (translatedText !== null) {
        // Створення контейнера для відображення перекладу
        const translationContainer = contentEl.createDiv({
          cls: CSS_CLASS_TRANSLATION_CONTAINER, // Потрібно мати цей клас
        });

        // Елемент для самого перекладеного тексту (відрендереного як Markdown)
        const translationContentEl = translationContainer.createDiv({
          cls: CSS_CLASS_TRANSLATION_CONTENT, // Потрібно мати цей клас
        });

        // Рендеринг перекладеного тексту як Markdown
        await MarkdownRenderer.render(
          this.app,
          translatedText,
          translationContentEl, // Рендеримо всередину спеціального контейнера
          this.plugin.app.vault.getRoot()?.path ?? "", // Шлях до файлу (не дуже важливий тут)
          this // Контекст компонента (OllamaView)
        );

        // --- ВИКЛИК УТИЛІТИ для виправлення Twemoji ---
        RendererUtils.fixBrokenTwemojiImages(translationContentEl);
        // -----------------------------------------

        // Додавання індикатора мови перекладу
        const targetLangName = LANGUAGES[targetLang] || targetLang; // Отримуємо повну назву мови
        translationContainer.createEl("div", {
          cls: "translation-indicator", // Клас для стилізації
          text: `[Translated to ${targetLangName}]`,
        });

        // Прокрутка до низу, щоб переклад був видимим (якщо потрібно)
        this.guaranteedScrollToBottom(50, false);
      }
      // Якщо translatedText === null, TranslationService мав показати Notice
    } catch (error) {
      // Обробка неочікуваних помилок під час перекладу
      this.plugin.logger.error("Error during translation click handling:", error);
      new Notice("An unexpected error occurred during translation.");
    } finally {
      // 6. Завжди відновлюємо стан кнопки
      // Перевіряємо, чи кнопка ще існує
      if (buttonEl && buttonEl.isConnected) {
        setIcon(buttonEl, originalIcon); // Відновлюємо іконку
        buttonEl.disabled = false;
        buttonEl.classList.remove(CSS_CLASS_TRANSLATION_PENDING);
        buttonEl.setAttribute("title", originalTitle); // Відновлюємо title
      }
    }
  }

  // --- Rendering Helpers ---
  private renderDateSeparator(date: Date): void {
    if (!this.chatContainer) return;
    this.chatContainer.createDiv({
      cls: CSS_CLASS_DATE_SEPARATOR,
      text: this.formatDateSeparator(date),
    });
  }

  // --- Menu List Rendering (Accordion Style) ---
  private async renderModelList(): Promise<void> {
    const container = this.modelSubmenuContent;
    if (!container) return;
    container.empty();
    const modelIconMap: Record<string, string> = {
      llama: "box-minimal",
      mistral: "wind" /*...*/,
    };
    const defaultIcon = "box";
    try {
      const models = await this.plugin.ollamaService.getModels();
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      const currentModelName = activeChat?.metadata?.modelName || this.plugin.settings.modelName;
      if (models.length === 0) {
        container.createEl("div", {
          cls: "menu-info-text",
          text: "No models.",
        });
        return;
      }
      models.forEach(modelName => {
        const optionEl = container.createDiv({
          cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MODEL_OPTION}`,
        });
        const iconSpan = optionEl.createEl("span", {
          cls: "menu-option-icon",
        });
        let iconToUse = defaultIcon;
        if (modelName === currentModelName) {
          iconToUse = "check";
          optionEl.addClass("is-selected");
        } else {
          const l = modelName.toLowerCase();
          let f = false;
          for (const k in modelIconMap) {
            if (l.includes(k)) {
              iconToUse = modelIconMap[k];
              f = true;
              break;
            }
          }
          if (!f) iconToUse = defaultIcon;
        }
        try {
          setIcon(iconSpan, iconToUse);
        } catch (e) {
          iconSpan.style.minWidth = "18px";
        }
        optionEl.createEl("span", {
          cls: "menu-option-text",
          text: modelName,
        });
        this.registerDomEvent(optionEl, "click", async () => {
          if (modelName !== currentModelName) {
            const chat = await this.plugin.chatManager?.getActiveChat();
            if (chat)
              await this.plugin.chatManager.updateActiveChatMetadata({
                modelName: modelName,
              });
            else new Notice("No active chat.");
          }
          this.closeMenu();
        });
      });
      this.updateSubmenuHeight(container);
    } catch (error) {
      container.empty();
      container.createEl("div", {
        cls: "menu-error-text",
        text: "Error models.",
      });
      this.updateSubmenuHeight(container);
    }
  }
  public async renderRoleList(): Promise<void> {
    const container = this.roleSubmenuContent;
    if (!container) return;
    container.empty();
    try {
      const roles = await this.plugin.listRoleFiles(true);
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      const currentChatRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;
      const noRoleOptionEl = container.createDiv({
        cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}`,
      });
      const noRoleIconSpan = noRoleOptionEl.createEl("span", {
        cls: "menu-option-icon",
      });
      if (!currentChatRolePath) {
        setIcon(noRoleIconSpan, "check");
        noRoleOptionEl.addClass("is-selected");
      } else {
        setIcon(noRoleIconSpan, "slash");
        noRoleIconSpan.style.minWidth = "18px";
      }
      noRoleOptionEl.createEl("span", {
        cls: "menu-option-text",
        text: "None",
      });
      this.registerDomEvent(noRoleOptionEl, "click", async () => {
        const nrp = "";
        if (this.plugin.settings.selectedRolePath !== nrp || currentChatRolePath !== nrp) {
          this.plugin.settings.selectedRolePath = nrp;
          await this.plugin.saveSettings();
          const chat = await this.plugin.chatManager?.getActiveChat();
          if (chat && chat.metadata.selectedRolePath !== nrp) {
            await this.plugin.chatManager.updateActiveChatMetadata({
              selectedRolePath: nrp,
            });
            this.plugin.promptService?.clearRoleCache?.();
          }
          this.plugin.emit("role-changed", "None");
        }
        this.closeMenu();
      });
      if (roles.length > 0) container.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });
      roles.forEach(roleInfo => {
        const roleOptionEl = container.createDiv({
          cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}`,
        });
        if (roleInfo.isCustom) roleOptionEl.addClass("is-custom");
        const iconSpan = roleOptionEl.createEl("span", {
          cls: "menu-option-icon",
        });
        if (roleInfo.path === currentChatRolePath) {
          setIcon(iconSpan, "check");
          roleOptionEl.addClass("is-selected");
        } else {
          setIcon(iconSpan, roleInfo.isCustom ? "user" : "box");
          iconSpan.style.minWidth = "18px";
        }
        roleOptionEl.createEl("span", {
          cls: "menu-option-text",
          text: roleInfo.name,
        });
        this.registerDomEvent(roleOptionEl, "click", async () => {
          const nrp = roleInfo.path;
          if (this.plugin.settings.selectedRolePath !== nrp || currentChatRolePath !== nrp) {
            this.plugin.settings.selectedRolePath = nrp;
            await this.plugin.saveSettings();
            const chat = await this.plugin.chatManager?.getActiveChat();
            if (chat && chat.metadata.selectedRolePath !== nrp) {
              await this.plugin.chatManager.updateActiveChatMetadata({
                selectedRolePath: nrp,
              });
              this.plugin.promptService?.clearRoleCache?.();
            }
            this.plugin.emit("role-changed", roleInfo.name);
          }
          this.closeMenu();
        });
      });
      this.updateSubmenuHeight(container);
    } catch (error) {
      container.empty();
      container.createEl("div", {
        cls: "menu-error-text",
        text: "Error roles.",
      });
      this.updateSubmenuHeight(container);
    }
  }
  public async renderChatListMenu(): Promise<void> {
    const container = this.chatSubmenuContent;
    if (!container) {
      this.plugin.logger.warn("[renderChatListMenu] Chat submenu container not found!"); // Log missing element
      return;
    }
    container.empty();
    try {
      const chats = this.plugin.chatManager?.listAvailableChats() || [];
      const currentActiveId = this.plugin.chatManager?.getActiveChatId();
      if (chats.length === 0) {
        container.createEl("div", {
          cls: "menu-info-text",
          text: "No saved chats.",
        });
        this.plugin.logger.debug("[renderChatListMenu] Rendered 'No saved chats.' message.");
        return;
      } else {
        // TODO: check it
        chats.forEach(chatMeta => {
          const chatOptionEl = container.createDiv({
            cls: [CSS_CLASS_MENU_OPTION, CSS_CLASS_CHAT_LIST_ITEM, CSS_CLASS_CHAT_OPTION],
          });
          // ... (іконка) ...
          const textSpan = chatOptionEl.createEl("span", { cls: "menu-option-text" });
          textSpan.createEl("div", { cls: "chat-option-name", text: chatMeta.name });

          // --- ВИПРАВЛЕННЯ (аналогічне) ---
          const lastModifiedDate = new Date(chatMeta.lastModified);
          const dateText = !isNaN(lastModifiedDate.getTime())
            ? this.formatRelativeDate(lastModifiedDate)
            : "Invalid date";
          if (dateText === "Invalid date") {
            this.plugin.logger.warn(
              `[renderChatListMenu] Invalid date parsed for chat ${chatMeta.id}, lastModified: ${chatMeta.lastModified}`
            );
          }
          textSpan.createEl("div", { cls: "chat-option-date", text: dateText });
          // --- КІНЕЦЬ ВИПРАВЛЕННЯ ---

          this.registerDomEvent(chatOptionEl, "click", async () => {
            if (chatMeta.id !== this.plugin.chatManager?.getActiveChatId()) {
              await this.plugin.chatManager.setActiveChat(chatMeta.id);
            }
            this.closeMenu();
          });
        });
      }
      chats.forEach(chatMeta => {
        const chatOptionEl = container.createDiv({
          cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CHAT_OPTION}`,
        });
        const iconSpan = chatOptionEl.createEl("span", {
          cls: "menu-option-icon",
        });
        if (chatMeta.id === currentActiveId) {
          setIcon(iconSpan, "check");
          chatOptionEl.addClass("is-selected");
        } else {
          setIcon(iconSpan, "message-square");
        }
        const textSpan = chatOptionEl.createEl("span", {
          cls: "menu-option-text",
        });
        textSpan.createEl("div", {
          cls: "chat-option-name",
          text: chatMeta.name,
        });
        const dateText = this.formatRelativeDate(new Date(chatMeta.lastModified));
        textSpan.createEl("div", {
          cls: "chat-option-date",
          text: dateText,
        });
        this.registerDomEvent(chatOptionEl, "click", async () => {
          if (chatMeta.id !== this.plugin.chatManager?.getActiveChatId()) {
            await this.plugin.chatManager.setActiveChat(chatMeta.id);
          }
          this.closeMenu();
        });
      });
      this.updateSubmenuHeight(container);
      this.plugin.logger.debug("[renderChatListMenu] Finished rendering chat list successfully."); // Log success end
    } catch (error) {
      this.plugin.logger.error("[renderChatListMenu] Error rendering chat list:", error); // Log error
      container.empty();
      container.createEl("div", {
        cls: "menu-error-text",
        text: "Error chats.",
      });
      this.updateSubmenuHeight(container);
    }
  }
  private updateSubmenuHeight(contentEl: HTMLElement | null): void {
    if (contentEl && !contentEl.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
      requestAnimationFrame(() => {
        contentEl.style.maxHeight = contentEl.scrollHeight + "px";
      });
    }
  }

  // --- Speech Recognition Methods ---

  // --- Speech Recognition Placeholders ---
  private initSpeechWorker(): void {
    /* ... same as before ... */
    // Use try-catch for robustness, especially with Blob URLs and Workers
    try {
      // Optimized Base64 encoding helper function
      const bufferToBase64 = (buffer: ArrayBuffer): string => {
        let binary = "";
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

      const workerBlob = new Blob([workerCode], {
        type: "application/javascript",
      });
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
  private setupSpeechWorkerHandlers(): void {
    /* ... same as before ... */
    if (!this.speechWorker) return;

    this.speechWorker.onmessage = event => {
      const data = event.data;

      // Check for error object from worker
      if (data && typeof data === "object" && data.error) {
        //console.error("Speech recognition error:", data.message);
        new Notice(`Speech Recognition Error: ${data.message}`);
        this.updateInputPlaceholder(this.plugin.settings.modelName); // Reset placeholder on error
        this.updateSendButtonState(); // Update button state as well
        return;
      }

      // Process valid transcript (should be a string)
      if (typeof data === "string" && data.trim()) {
        const transcript = data.trim();
        this.insertTranscript(transcript);
      } else if (typeof data !== "string") {
        //console.warn("Received unexpected data format from speech worker:", data);
      }
      // If data is an empty string, do nothing (might happen with short silence)
      this.updateSendButtonState(); // Update button state after processing
    };

    this.speechWorker.onerror = error => {
      //console.error("Unhandled worker error:", error);
      new Notice("An unexpected error occurred in the speech recognition worker.");
      this.updateInputPlaceholder(this.plugin.settings.modelName); // Reset placeholder
      // Attempt to gracefully stop recording if it was active
      this.stopVoiceRecording(false); // This also updates placeholder and button state
    };
  }
  private insertTranscript(transcript: string): void {
    /* ... same as before ... */
    if (!this.inputEl) return;

    const currentVal = this.inputEl.value;
    const start = this.inputEl.selectionStart ?? currentVal.length; // Use length if null
    const end = this.inputEl.selectionEnd ?? currentVal.length;

    // Add spacing intelligently
    let textToInsert = transcript;
    const precedingChar = start > 0 ? currentVal[start - 1] : null;
    const followingChar = end < currentVal.length ? currentVal[end] : null;

    if (precedingChar && precedingChar !== " " && precedingChar !== "\n") {
      textToInsert = " " + textToInsert;
    }
    if (followingChar && followingChar !== " " && followingChar !== "\n" && !textToInsert.endsWith(" ")) {
      textToInsert += " ";
    }

    const newValue = currentVal.substring(0, start) + textToInsert + currentVal.substring(end);
    this.inputEl.value = newValue;

    // Update cursor position
    const newCursorPos = start + textToInsert.length;
    this.inputEl.setSelectionRange(newCursorPos, newCursorPos);

    this.inputEl.focus();
    this.inputEl.dispatchEvent(new Event("input")); // Trigger resize calculation AND send button update
  }
  private async toggleVoiceRecognition(): Promise<void> {
    /* ... same as before ... */
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.stopVoiceRecording(true); // Stop and process
    } else {
      await this.startVoiceRecognition(); // Start new recording
    }
  }
  private async startVoiceRecognition(): Promise<void> {
    /* ... same as before ... */
    // Перевірка наявності worker'а для розпізнавання
    if (!this.speechWorker) {
      new Notice("Функція розпізнавання мовлення недоступна (worker не ініціалізовано).");
      //console.error("Спроба розпочати розпізнавання голосу без ініціалізованого worker'а.");
      return;
    }
    // Перевірка наявності ключа Google API
    // Важливо: ключ для Speech-to-Text може бути іншим, ніж для Translation
    const speechApiKey = this.plugin.settings.googleApiKey; // ПОТРІБНО ПЕРЕВІРИТИ НАЗВУ В НАЛАШТУВАННЯХ!
    if (!speechApiKey) {
      new Notice(
        "Ключ Google API для розпізнавання мовлення не налаштовано. Будь ласка, додайте його в налаштуваннях плагіна."
      );
      return;
    }

    // Disable send button while recording? Maybe not necessary.

    try {
      // Запит доступу до мікрофона
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      // Визначення опцій для MediaRecorder залежно від підтримки mimeType
      let recorderOptions: MediaRecorderOptions | undefined; // Використовуємо конкретний тип або undefined
      const preferredMimeType = "audio/webm;codecs=opus"; // Бажаний формат

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
      this.mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      this.mediaRecorder.onstop = () => {
        //console.log("MediaRecorder stopped.");
        if (this.speechWorker && audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, {
            type: this.mediaRecorder?.mimeType || "audio/webm",
          });
          //console.log(`Sending audio blob to worker: type=${audioBlob.type}, size=${audioBlob.size}`);
          this.inputEl.placeholder = "Processing speech..."; // Update placeholder
          this.speechWorker.postMessage({
            apiKey: speechApiKey, // Використовуємо правильний ключ
            audioBlob,
            languageCode: this.plugin.settings.speechLanguage || "uk-UA",
          });
        } else if (audioChunks.length === 0) {
          //console.log("No audio data recorded.");
          // Використовуємо getCurrentRoleDisplayName для відновлення плейсхолдера
          this.getCurrentRoleDisplayName().then(roleName => this.updateInputPlaceholder(roleName));
          this.updateSendButtonState(); // Ensure button state is correct
        }
      };
      this.mediaRecorder.onerror = event => {
        //console.error("MediaRecorder Error:", event);
        new Notice("An error occurred during recording.");
        this.stopVoiceRecording(false); // Stop without processing on error
      };

      // --- Старт запису ---
      this.mediaRecorder.start();
      //console.log("Recording started. MimeType:", this.mediaRecorder?.mimeType ?? 'default');
    } catch (error) {
      //console.error("Error accessing microphone or starting recording:", error);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        new Notice("Microphone access denied. Please grant permission.");
      } else if (error instanceof DOMException && error.name === "NotFoundError") {
        new Notice("Microphone not found. Please ensure it's connected and enabled.");
      } else {
        new Notice("Could not start voice recording.");
      }
      this.stopVoiceRecording(false); // Ensure cleanup even if start failed
    }
  }
  private stopVoiceRecording(processAudio: boolean): void {
    /* ... same as before ... */
    //console.log(`Stopping voice recording. Process audio: ${processAudio}`);
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      // onstop handler will be triggered eventually to process if processAudio is true
      this.mediaRecorder.stop();
    } else if (!processAudio && this.mediaRecorder?.state === "inactive") {
      // If already stopped and asked not to process, just clean up UI/stream
    }

    // UI Cleanup & Resource Release
    this.voiceButton?.classList.remove(CSS_CLASS_RECORDING);
    setIcon(this.voiceButton, "mic"); // <-- Змінено з microphone на mic

    // Використовуємо getCurrentRoleDisplayName для відновлення плейсхолдера
    this.getCurrentRoleDisplayName().then(roleName => this.updateInputPlaceholder(roleName));
    this.updateSendButtonState(); // Update button state

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
      //console.log("Audio stream tracks stopped.");
    }
    this.mediaRecorder = null;
  }

  public checkAllMessagesForCollapsing(): void {
    this.plugin.logger.debug("Running checkAllMessagesForCollapsing");
    this.chatContainer?.querySelectorAll<HTMLElement>(`.${CSS_CLASS_MESSAGE}`).forEach(msgEl => {
      this.checkMessageForCollapsing(msgEl);
    });
  }

  private toggleMessageCollapse(contentEl: HTMLElement, buttonEl: HTMLButtonElement): void {
    const maxHeightLimit = this.plugin.settings.maxMessageHeight;

    // --- НОВЕ: Перевірка початкового стану ---
    const isInitialExpandedState = buttonEl.hasAttribute("data-initial-state");

    if (isInitialExpandedState) {
      // Перший клік на кнопку "Show Less ▲"
      //  this.plugin.logger.trace("[toggleMessageCollapse] Initial collapse triggered.");
      buttonEl.removeAttribute("data-initial-state"); // Видаляємо атрибут

      // Згортаємо контент
      contentEl.style.maxHeight = `${maxHeightLimit}px`;
      contentEl.classList.add(CSS_CLASS_CONTENT_COLLAPSED);
      buttonEl.setText("Show More ▼"); // Змінюємо текст кнопки

      // Прокрутка до верху згорнутого блоку
      setTimeout(() => {
        contentEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 310);
    } else {
      // --- Стара логіка перемикання ---
      const isCollapsed = contentEl.classList.contains(CSS_CLASS_CONTENT_COLLAPSED);

      if (isCollapsed) {
        // Розгортаємо
        //  this.plugin.logger.trace("[toggleMessageCollapse] Expanding message.");
        contentEl.style.maxHeight = ""; // Знімаємо обмеження
        contentEl.classList.remove(CSS_CLASS_CONTENT_COLLAPSED);
        buttonEl.setText("Show Less ▲");
      } else {
        // Згортаємо (повторно, якщо користувач розгорнув)
        //  this.plugin.logger.trace("[toggleMessageCollapse] Collapsing message.");
        contentEl.style.maxHeight = `${maxHeightLimit}px`; // Встановлюємо ліміт
        contentEl.classList.add(CSS_CLASS_CONTENT_COLLAPSED);
        buttonEl.setText("Show More ▼");
        // Прокрутка до верху згорнутого блоку
        setTimeout(() => {
          contentEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 310);
      }
      // --- Кінець старої логіки ---
    }
  }

  // --- Helpers & Utilities ---
  public getChatContainer(): HTMLElement {
    return this.chatContainer;
  }

  private clearChatContainerInternal(): void {
    // Використовуємо WARN або ERROR, щоб цей лог було видно
    this.plugin.logger.warn("[clearChatContainerInternal] --- ОЧИЩЕННЯ КОНТЕЙНЕРА ЧАТУ ТА СТАНУ ---");
    this.currentMessages = [];
    this.lastRenderedMessageDate = null;
    if (this.chatContainer) this.chatContainer.empty();
    this.hideEmptyState();
    this.lastMessageElement = null;
    this.consecutiveErrorMessages = [];
    this.errorGroupElement = null;
    this.isSummarizingErrors = false;
  }

  public clearDisplayAndState(): void {
    // Public method to completely clear the view
    this.clearChatContainerInternal();
    this.showEmptyState();
    this.updateSendButtonState();
    setTimeout(() => this.focusInput(), 50); // Refocus after clear
  }
  // public addLoadingIndicator(): HTMLElement {
  //   // Adds the visual "thinking" dots indicator
  //   this.hideEmptyState();
  //   const group = this.chatContainer.createDiv({
  //     cls: `${CSS_CLASS_MESSAGE_GROUP} ${CSS_CLASS_OLLAMA_GROUP}`,
  //   });
  //   this.renderAvatar(group, false); // Render AI avatar
  //   const message = group.createDiv({
  //     cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_OLLAMA_MESSAGE}`,
  //   });
  //   const dots = message.createDiv({ cls: CSS_CLASS_THINKING_DOTS });
  //   for (let i = 0; i < 3; i++) dots.createDiv({ cls: CSS_CLASS_THINKING_DOT });
  //   this.guaranteedScrollToBottom(50, true); // Scroll to show it
  //   return group; // Return the group element containing the indicator
  // }
  // public removeLoadingIndicator(loadingEl: HTMLElement | null): void {
  //   // Removes the loading indicator element
  //   if (loadingEl?.parentNode) {
  //     loadingEl.remove();
  //   }
  // }
  public scrollToBottom(): void {
    this.guaranteedScrollToBottom(50, true);
  }
  public clearInputField(): void {
    if (this.inputEl) {
      this.inputEl.value = "";
      this.inputEl.dispatchEvent(new Event("input"));
    }
  } // Trigger resize/button update
  public focusInput(): void {
    setTimeout(() => {
      this.inputEl?.focus();
    }, 0);
  } // Use setTimeout to ensure focus happens after potential UI updates

  /** Guarantees scroll to bottom after a delay, respecting user scroll position unless forced */
  guaranteedScrollToBottom(delay = 50, forceScroll = false): void {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
    this.scrollTimeout = setTimeout(() => {
      requestAnimationFrame(() => {
        // Use rAF for smooth browser rendering
        if (this.chatContainer) {
          const threshold = 100; // Threshold to consider "scrolled up"
          const isScrolledUp =
            this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight >
            threshold;

          // Update userScrolledUp state if it changed
          if (isScrolledUp !== this.userScrolledUp) {
            this.userScrolledUp = isScrolledUp;
            // Hide indicator immediately if user scrolls down manually
            if (!isScrolledUp) this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
          }

          // Scroll if forced, or if user is not scrolled up, or if AI is processing
          if (forceScroll || !this.userScrolledUp || this.isProcessing) {
            // Use smooth scrolling for a better UX unless processing (instant scroll better then)
            const behavior = this.isProcessing ? "auto" : "smooth";
            this.chatContainer.scrollTo({
              top: this.chatContainer.scrollHeight,
              behavior: behavior,
            });
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
  formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } // Use locale default time format
  formatDateSeparator(date: Date): string {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (this.isSameDay(date, now)) return "Today";
    else if (this.isSameDay(date, yesterday)) return "Yesterday";
    else
      return date.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }); // Locale default full date
  }
  formatRelativeDate(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      this.plugin.logger.warn("[formatRelativeDate] Received Invalid Date object.");
      return "Invalid date";
    }
    const now = new Date();
    const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
    const diffDays = Math.floor(diffSeconds / (60 * 60 * 24));
    if (diffDays === 0) {
      const diffHours = Math.floor(diffSeconds / (60 * 60));
      if (diffHours < 1) return "Just now";
      if (diffHours === 1) return "1 hour ago";
      if (diffHours < now.getHours()) return `${diffHours} hours ago`; // Fixed: Compare diffHours with current hour
      else return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }); // e.g., Apr 4
    }
  }
  isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  // Formatting function used by export
  private formatChatToMarkdown(messagesToFormat: Message[]): string {
    let localLastDate: Date | null = null;
    const exportTimestamp = new Date();
    let markdown =
      `# AI Forge Chat Export\n` + // Можна змінити заголовок, якщо треба
      `> Exported on: ${exportTimestamp.toLocaleString(undefined)}\n\n`; // Use locale default date/time

    messagesToFormat.forEach(message => {
      // Skip empty messages if any exist (shouldn't normally happen)
      if (!message.content?.trim()) return;

      if (localLastDate === null || !this.isSameDay(localLastDate, message.timestamp)) {
        if (localLastDate !== null) markdown += `***\n`; // Separator between days
        markdown += `**${this.formatDateSeparator(message.timestamp)}**\n***\n\n`;
      }
      localLastDate = message.timestamp;

      const time = this.formatTime(message.timestamp);
      let prefix = "";
      let contentPrefix = "";
      let content = message.content.trim(); // Trim content initially

      // Remove <think> tags from assistant messages before formatting
      if (message.role === "assistant") {
        content = RendererUtils.decodeHtmlEntities(content)
          .replace(/<think>[\s\S]*?<\/think>/g, "")
          .trim();
        // Skip if content becomes empty after removing think tags
        if (!content) return;
      }

      switch (message.role) {
        case "user":
          prefix = `**User (${time}):**\n`;
          break;
        case "assistant":
          prefix = `**Assistant (${time}):**\n`;
          break;
        case "system":
          prefix = `> _[System (${time})]_ \n> `;
          contentPrefix = "> ";
          break; // Quote block
        case "error":
          prefix = `> [!ERROR] Error (${time}):\n> `;
          contentPrefix = "> ";
          break; // Admonition block
      }
      markdown += prefix;
      if (contentPrefix) {
        markdown +=
          content
            .split("\n")
            .map(line => (line.trim() ? `${contentPrefix}${line}` : contentPrefix.trim()))
            .join(`\n`) + "\n\n"; // Add prefix to each line, handle empty lines
      } else if (content.includes("```")) {
        // Ensure blank lines around code blocks for proper rendering
        // Improved regex to handle potential multiple empty lines
        content = content.replace(/(\n*\s*)```/g, "\n\n```").replace(/```(\s*\n*)/g, "```\n\n");
        markdown += content.trim() + "\n\n";
      } else {
        // Standard message content - ensure proper line breaks are kept
        markdown +=
          content
            .split("\n")
            .map(line => (line.trim() ? line : ""))
            .join("\n") + "\n\n";
      }
    });
    return markdown.trim(); // Trim final result
  }

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
          return rolePath.split("/").pop()?.replace(".md", "") || "Selected Role"; // Спробуємо отримати ім'я з шляху
        }
      }
    } catch (error) {
      console.error("Error getting current role display name:", error);
    }
    // Повертаємо стандартне ім'я, якщо роль не вибрана або сталася помилка
    return "None";
  }

  private handleRoleDisplayClick = async (event: MouseEvent) => {
    const menu = new Menu();
    let itemsAdded = false;

    // Опціонально: показати сповіщення про завантаження
    // const loadingNotice = new Notice("Loading roles...", 0);

    try {
      const roles = await this.plugin.listRoleFiles(true); // Отримуємо всі ролі
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      const currentRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;
      // loadingNotice?.hide();

      // --- 1. Додаємо опцію "None (Default)" ---
      menu.addItem(item => {
        item
          .setTitle("None")
          .setIcon(!currentRolePath ? "check" : "slash") // Перевірка чи шлях пустий
          .onClick(async () => {
            const newRolePath = ""; // Порожній шлях для "без ролі"
            if (currentRolePath !== newRolePath) {
              if (activeChat) {
                await this.plugin.chatManager.updateActiveChatMetadata({
                  selectedRolePath: newRolePath,
                });
              } else {
                // Якщо чату немає, змінюємо глобальне налаштування
                this.plugin.settings.selectedRolePath = newRolePath;
                await this.plugin.saveSettings();
                // Емітуємо подію зміни ролі вручну, бо менеджер чату не викликався
                this.plugin.emit("role-changed", "None");
                this.plugin.promptService?.clearRoleCache?.();
              }
            }
          });
        itemsAdded = true;
      });

      // --- 2. Додаємо роздільник, якщо є ролі ---
      if (roles.length > 0) {
        menu.addSeparator();
        itemsAdded = true; // Не потрібно, бо вже true, але для ясності
      }

      // --- 3. Додаємо список ролей ---
      roles.forEach(roleInfo => {
        menu.addItem(item => {
          item
            .setTitle(roleInfo.name)
            .setIcon(roleInfo.path === currentRolePath ? "check" : roleInfo.isCustom ? "user" : "file-text") // Іконки: обрана, кастомна, звичайна
            .onClick(async () => {
              const newRolePath = roleInfo.path;
              if (currentRolePath !== newRolePath) {
                if (activeChat) {
                  await this.plugin.chatManager.updateActiveChatMetadata({
                    selectedRolePath: newRolePath,
                  });
                } else {
                  // Якщо чату немає, змінюємо глобальне налаштування
                  this.plugin.settings.selectedRolePath = newRolePath;
                  await this.plugin.saveSettings();
                  this.plugin.emit("role-changed", roleInfo.name);
                  this.plugin.promptService?.clearRoleCache?.();
                }
              }
            });
          itemsAdded = true;
        });
      });
    } catch (error) {
      // loadingNotice?.hide();
      console.error("Error loading roles for role selection menu:", error);
      // Додаємо елемент помилки в меню, лише якщо нічого іншого не додалося
      if (!itemsAdded) {
        menu.addItem(item => item.setTitle("Error loading roles").setDisabled(true));
        itemsAdded = true;
      }
      new Notice("Failed to load roles.");
    } finally {
      if (itemsAdded) {
        menu.showAtMouseEvent(event); // Показуємо меню
      } else {
      }
    }
  };

  private handleTemperatureClick = async (): Promise<void> => {
    const activeChat = await this.plugin.chatManager?.getActiveChat();

    if (!activeChat) {
      new Notice("Select or create a chat to change temperature.");
      // Альтернативно: можна дозволити змінювати глобальну температуру
      // const currentTemp = this.plugin.settings.temperature;
      // ... відкрити модалку для зміни this.plugin.settings.temperature ...
      return;
    }

    const currentTemp = activeChat.metadata.temperature ?? this.plugin.settings.temperature;
    const currentTempString = currentTemp !== null && currentTemp !== undefined ? String(currentTemp) : "";

    new PromptModal(
      this.app,
      "Set Temperature",
      `Enter new temperature (e.g., 0.7). Higher values = more creative, lower = more focused.`,
      currentTempString, // Попередньо заповнюємо поточним значенням
      async newValue => {
        if (newValue === null || newValue.trim() === "") {
          new Notice("Temperature change cancelled.");
          return;
        }

        const newTemp = parseFloat(newValue.trim());

        if (isNaN(newTemp) || newTemp < 0 || newTemp > 2.0) {
          // Додамо перевірку діапазону
          new Notice("Invalid temperature. Please enter a number between 0.0 and 2.0.", 4000);
          return;
        }

        try {
          await this.plugin.chatManager.updateActiveChatMetadata({
            temperature: newTemp,
          });
          this.updateTemperatureIndicator(newTemp); // Оновлюємо UI
          new Notice(`Temperature set to ${newTemp} for chat "${activeChat.metadata.name}".`);
        } catch (error) {
          this.plugin.logger.error("Failed to update chat temperature:", error);
          new Notice("Error setting temperature.");
        }
      }
    ).open();
  };

  private updateTemperatureIndicator(temperature: number | null | undefined): void {
    if (!this.temperatureIndicatorEl) return;

    // Використовуємо глобальне значення за замовчуванням, якщо не передано конкретне
    const tempValue = temperature ?? this.plugin.settings.temperature;

    const emoji = this.getTemperatureEmoji(tempValue);
    this.temperatureIndicatorEl.setText(emoji);
    this.temperatureIndicatorEl.title = `Temperature: ${tempValue.toFixed(1)}. Click to change.`; // Показуємо значення
  }

  // --- Нова допоміжна функція для отримання емодзі температури ---
  private getTemperatureEmoji(temperature: number): string {
    if (temperature <= 0.4) {
      return "🧊"; // Strict/Focused (Monocle face)
    } else if (temperature > 0.4 && temperature <= 0.6) {
      return "🙂"; // Neutral (Slightly smiling face)
    } else {
      return "🤪"; // Creative/Wild (Fire)
    }
  }

  private updateToggleViewLocationOption(): void {
    if (!this.toggleViewLocationOption) return;
    this.toggleViewLocationOption.empty(); // Очищуємо перед оновленням
    const iconSpan = this.toggleViewLocationOption.createSpan({
      cls: "menu-option-icon",
    });
    const textSpan = this.toggleViewLocationOption.createSpan({
      cls: "menu-option-text",
    });

    if (this.plugin.settings.openChatInTab) {
      // Якщо зараз налаштовано відкриття у Вкладці, дія - "Перемістити в Бічну Панель"
      setIcon(iconSpan, "sidebar-right"); // Іконка бічної панелі
      textSpan.setText("Show in Sidebar");
      this.toggleViewLocationOption.title = "Close tab and reopen in sidebar";
    } else {
      // Якщо зараз налаштовано відкриття у Бічній Панелі, дія - "Перемістити у Вкладку"
      setIcon(iconSpan, "layout-list"); // Іконка вкладки/списку
      textSpan.setText("Show in Tab");
      this.toggleViewLocationOption.title = "Close sidebar panel and reopen in tab";
    }
    // Прибираємо сірий колір - кнопка завжди активна для перемикання
    // this.toggleViewLocationOption.removeClass(CSS_CLASS_INACTIVE_OPTION);
  }

  // --- Новий обробник кліку для перемикання ---
  private handleToggleViewLocationClick = async (): Promise<void> => {
    this.closeMenu(); // Закриваємо меню

    const currentSetting = this.plugin.settings.openChatInTab;
    const newSetting = !currentSetting; // Інвертуємо налаштування

    // this.plugin.logger.info(`Toggling view location setting from ${currentSetting} to ${newSetting}`);

    // Зберігаємо нове налаштування
    this.plugin.settings.openChatInTab = newSetting;
    await this.plugin.saveSettings(); // Зберігаємо (це також викличе подію 'settings-updated')

    // Закриваємо поточний(і) екземпляр(и) View
    // this.plugin.logger.debug("Detaching current view leaf/leaves...");
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_OLLAMA_PERSONAS);

    // Активуємо View знову (використовує оновлені налаштування)
    // Невелика затримка, щоб гарантувати завершення detach
    setTimeout(() => {
      this.plugin.logger.debug("Re-activating view with new setting...");
      this.plugin.activateView();
    }, 50); // 50 мс зазвичай достатньо
  };

  public async findRoleNameByPath(rolePath: string | null | undefined): Promise<string> {
    if (!rolePath) {
      return "None";
    }
    try {
      const allRoles = await this.plugin.listRoleFiles(true);
      const foundRole = allRoles.find(role => role.path === rolePath);
      if (foundRole) {
        return foundRole.name;
      } else {
        const fileName = rolePath.split("/").pop()?.replace(".md", "");
        this.plugin.logger.warn(
          `[findRoleNameByPath] Role not found for path "${rolePath}". Using derived name: "${fileName || "Unknown"}"`
        );
        return fileName || "Unknown Role";
      }
    } catch (error) {
      this.plugin.logger.error(`[findRoleNameByPath] Error fetching roles for path "${rolePath}":`, error);
      return "Error";
    }
  }

  // OllamaView.ts

  // OllamaView.ts

  // --- Оновлений updateChatPanelList (БЕЗ ВСТАНОВЛЕННЯ max-height/overflow) ---

  private updateChatPanelList = async (): Promise<void> => {
    const container = this.chatPanelListEl;
    if (!container || !this.plugin.chatManager) {
      this.plugin.logger.debug("[updateChatPanelList] Skipping update: Container or ChatManager missing.");
      return;
    }
    // Перевіряємо видимість контейнера перед оновленням
    if (this.chatPanelHeaderEl?.getAttribute("data-collapsed") === "true") {
      this.plugin.logger.debug("[updateChatPanelList] Skipping update: Chat panel is collapsed.");
      return;
    }

    this.plugin.logger.debug("[updateChatPanelList] Updating chat list content...");
    const currentScrollTop = container.scrollTop;
    container.empty(); // Очищуємо перед рендерингом

    try {
      const chats: ChatMetadata[] = this.plugin.chatManager.listAvailableChats() || [];
      const currentActiveId = this.plugin.chatManager.getActiveChatId();
      this.plugin.logger.debug(`[updateChatPanelList] Rendering ${chats.length} chats. Active ID: ${currentActiveId}`);

      if (chats.length === 0) {
        container.createDiv({ cls: "menu-info-text", text: "No saved chats yet." });
      } else {
        // Сортування вже відбувається в listAvailableChats
        chats.forEach(chatMeta => {
          const chatOptionEl = container.createDiv({
            cls: [CSS_ROLE_PANEL_ITEM, CSS_CLASS_MENU_OPTION, CSS_CLASS_CHAT_LIST_ITEM],
          });
          const iconSpan = chatOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
          if (chatMeta.id === currentActiveId) {
            setIcon(iconSpan, "check");
            chatOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
          } else {
            setIcon(iconSpan, "message-square");
          }

          const textWrapper = chatOptionEl.createDiv({ cls: "ollama-chat-item-text-wrapper" });
          textWrapper.createDiv({ cls: "chat-panel-item-name", text: chatMeta.name });

          // --- ВИПРАВЛЕННЯ: Передаємо рядок дати напряму в new Date() ---
          const lastModifiedDate = new Date(chatMeta.lastModified);
          // Додамо перевірку на валідність дати перед форматуванням
          const dateText = !isNaN(lastModifiedDate.getTime())
            ? this.formatRelativeDate(lastModifiedDate)
            : "Invalid date"; // Показуємо помилку, якщо дата невалідна
          if (dateText === "Invalid date") {
            this.plugin.logger.warn(
              `[updateChatPanelList] Invalid date parsed for chat ${chatMeta.id}, lastModified: ${chatMeta.lastModified}`
            );
          }
          textWrapper.createDiv({ cls: "chat-panel-item-date", text: dateText });
          // --- КІНЕЦЬ ВИПРАВЛЕННЯ ---

          const optionsBtn = chatOptionEl.createEl("button", {
            cls: [CSS_CHAT_ITEM_OPTIONS, "clickable-icon"],
            attr: { "aria-label": "Chat options", title: "More options" },
          });
          setIcon(optionsBtn, "lucide-more-horizontal");

          // Обробники подій
          this.registerDomEvent(chatOptionEl, "click", async e => {
            if (!(e.target instanceof Element && e.target.closest(`.${CSS_CHAT_ITEM_OPTIONS}`))) {
              if (chatMeta.id !== this.plugin.chatManager?.getActiveChatId()) {
                await this.plugin.chatManager.setActiveChat(chatMeta.id);
              }
            }
          });
          this.registerDomEvent(optionsBtn, "click", e => {
            e.stopPropagation();
            this.showChatContextMenu(e, chatMeta);
          });
          this.registerDomEvent(chatOptionEl, "contextmenu", e => {
            this.showChatContextMenu(e, chatMeta);
          });
        });
      }
      this.plugin.logger.debug(`[updateChatPanelList] Finished rendering ${chats.length} chat items.`);
      // Висота тепер керується виключно через toggleSidebarSection
    } catch (error) {
      this.plugin.logger.error("[updateChatPanelList] Error rendering chat panel list:", error);
      container.empty();
      container.createDiv({ text: "Error loading chats.", cls: "menu-error-text" });
    } finally {
      // Відновлення скролу
      requestAnimationFrame(() => {
        // Перевіряємо, чи існує контейнер, перш ніж встановлювати scrollTop
        if (container && container.isConnected) {
          container.scrollTop = currentScrollTop;
        }
      });
    }
  };

  private async toggleSidebarSection(clickedHeaderEl: HTMLElement): Promise<void> {
    const sectionType = clickedHeaderEl.getAttribute("data-section-type") as "chats" | "roles";
    const isCurrentlyCollapsed = clickedHeaderEl.getAttribute("data-collapsed") === "true";
    const iconEl = clickedHeaderEl.querySelector<HTMLElement>(`.${CSS_SIDEBAR_SECTION_ICON}`);

    let contentEl: HTMLElement | null = null;
    let updateFunction: (() => Promise<void>) | null = null;
    let otherHeaderEl: HTMLElement | null = null;
    let otherContentEl: HTMLElement | null = null;
    let otherSectionType: "chats" | "roles" | null = null;

    const collapseIcon = "lucide-folder";
    const expandIcon = "lucide-folder-open";
    const expandedClass = "is-expanded";

    // ... (визначення змінних як раніше) ...
    if (sectionType === "chats") {
      contentEl = this.chatPanelListEl;
      updateFunction = this.updateChatPanelList;
      otherHeaderEl = this.rolePanelHeaderEl;
      otherContentEl = this.rolePanelListEl;
      otherSectionType = "roles";
    } else if (sectionType === "roles") {
      contentEl = this.rolePanelListEl;
      updateFunction = this.updateRolePanelList;
      otherHeaderEl = this.chatPanelHeaderEl;
      otherContentEl = this.chatPanelListEl;
      otherSectionType = "chats";
    }

    if (!contentEl || !iconEl || !updateFunction || !otherHeaderEl || !otherContentEl || !otherSectionType) {
      this.plugin.logger.error("Could not find all required elements for sidebar accordion toggle:", sectionType);
      return;
    }

    if (isCurrentlyCollapsed) {
      // --- Розгортаємо поточну, згортаємо іншу ---
      // 1. Згортаємо іншу секцію
      if (otherHeaderEl.getAttribute("data-collapsed") === "false") {
        const otherIconEl = otherHeaderEl.querySelector<HTMLElement>(`.${CSS_SIDEBAR_SECTION_ICON}`);
        otherHeaderEl.setAttribute("data-collapsed", "true");
        if (otherIconEl) setIcon(otherIconEl, collapseIcon);
        otherContentEl.classList.remove(expandedClass); // Видаляємо клас
        // --- ЗМІНА: Не чіпаємо inline стилі ---
        // otherContentEl.style.maxHeight = '0px';
        // otherContentEl.style.paddingTop = '0';
        // otherContentEl.style.paddingBottom = '0';
        // otherContentEl.style.overflowY = 'hidden';
        if (otherSectionType === "chats" && this.newChatSidebarButton) this.newChatSidebarButton.hide();
      }

      // 2. Розгортаємо поточну секцію
      clickedHeaderEl.setAttribute("data-collapsed", "false");
      setIcon(iconEl, expandIcon);
      if (sectionType === "chats" && this.newChatSidebarButton) this.newChatSidebarButton.show();
      try {
        // Спочатку викликаємо оновлення, щоб контент був готовий
        await updateFunction();
        // Потім додаємо клас, CSS подбає про анімацію та висоту
        contentEl.classList.add(expandedClass);
        this.plugin.logger.debug(`Expanding sidebar section: ${sectionType}`);
      } catch (error) {
        this.plugin.logger.error(`Error updating sidebar section ${sectionType}:`, error);
        contentEl.setText(`Error loading ${sectionType}.`);
        contentEl.classList.add(expandedClass); // Показуємо помилку
      }
    } else {
      // --- Згортаємо поточну ---
      this.plugin.logger.debug(`Collapsing sidebar section: ${sectionType}`);
      clickedHeaderEl.setAttribute("data-collapsed", "true");
      setIcon(iconEl, collapseIcon);
      // --- ЗМІНА: Не чіпаємо inline стилі ---
      contentEl.classList.remove(expandedClass); // Видаляємо клас
      // contentEl.style.maxHeight = '0px';
      // contentEl.style.paddingTop = '0';
      // contentEl.style.paddingBottom = '0';
      // contentEl.style.overflowY = 'hidden';

      if (sectionType === "chats" && this.newChatSidebarButton) {
        this.newChatSidebarButton.hide();
      }
    }
  }

  // --- Оновлений метод показу контекстного меню ---
  private showChatContextMenu(event: MouseEvent, chatMeta: ChatMetadata): void {
    event.preventDefault();
    const menu = new Menu();

    // 1. Клонувати
    menu.addItem(item =>
      item
        .setTitle("Clone Chat")
        .setIcon("lucide-copy-plus")
        .onClick(() => this.handleContextMenuClone(chatMeta.id))
    );

    // --- ДОДАНО: Перейменувати ---
    menu.addItem(
      item =>
        item
          .setTitle("Rename Chat")
          .setIcon("lucide-pencil") // Іконка олівця
          .onClick(() => this.handleContextMenuRename(chatMeta.id, chatMeta.name)) // Викликаємо новий обробник
    );
    // --- КІНЕЦЬ ДОДАНОГО ---

    // 3. Експортувати
    menu.addItem(item =>
      item
        .setTitle("Export to Note")
        .setIcon("lucide-download")
        .onClick(() => this.exportSpecificChat(chatMeta.id))
    );

    menu.addSeparator();

    // 4. Очистити повідомлення
    menu.addItem(item => {
      item
        .setTitle("Clear Messages")
        .setIcon("lucide-trash")
        .onClick(() => this.handleContextMenuClear(chatMeta.id, chatMeta.name));
      try {
        (item as any).el.addClass("danger-option");
      } catch (e) {
        // Використовуємо .el або .dom
        this.plugin.logger.error("Failed to add danger class using item.el/dom:", e, item);
      }
    });

    // 5. Видалити чат
    menu.addItem(item => {
      item
        .setTitle("Delete Chat")
        .setIcon("lucide-trash-2")
        .onClick(() => this.handleContextMenuDelete(chatMeta.id, chatMeta.name));
      try {
        (item as any).el.addClass("danger-option");
      } catch (e) {
        // Використовуємо .el або .dom
        this.plugin.logger.error("Failed to add danger class using item.el/dom:", e, item);
      }
    });

    menu.showAtMouseEvent(event);
  }

  private async handleContextMenuClone(chatId: string): Promise<void> {
    this.plugin.logger.info(`Context menu: Clone requested for chat ${chatId}`);
    const cloningNotice = new Notice("Cloning chat...", 0);
    try {
      const clonedChat = await this.plugin.chatManager.cloneChat(chatId);
      if (clonedChat) {
        new Notice(`Chat cloned as "${clonedChat.metadata.name}" and activated.`);
        // UI оновиться через події від ChatManager
      } else {
        // Помилка вже мала бути показана в cloneChat
      }
    } catch (error) {
      this.plugin.logger.error(`Context menu: Error cloning chat ${chatId}:`, error);
      new Notice("Error cloning chat.");
    } finally {
      cloningNotice.hide();
    }
  }

  // Новий метод для експорту КОНКРЕТНОГО чату
  private async exportSpecificChat(chatId: string): Promise<void> {
    this.plugin.logger.info(`Context menu: Export requested for chat ${chatId}`);
    const exportingNotice = new Notice(`Exporting chat...`, 0);
    try {
      const chat = await this.plugin.chatManager.getChat(chatId); // Отримуємо дані чату
      if (!chat || chat.messages.length === 0) {
        new Notice("Chat is empty or not found, nothing to export.");
        exportingNotice.hide();
        return;
      }

      // Використовуємо існуючу логіку форматування та збереження
      const markdownContent = this.formatChatToMarkdown(chat.messages);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = chat.metadata.name.replace(/[\\/?:*"<>|]/g, "-");
      const filename = `ollama-chat-${safeName}-${timestamp}.md`;

      let targetFolderPath = this.plugin.settings.chatExportFolderPath?.trim();
      let targetFolder: TFolder | null = null;

      if (targetFolderPath) {
        targetFolderPath = normalizePath(targetFolderPath);
        const abstractFile = this.app.vault.getAbstractFileByPath(targetFolderPath);
        if (!abstractFile) {
          try {
            await this.app.vault.createFolder(targetFolderPath);
            targetFolder = this.app.vault.getAbstractFileByPath(targetFolderPath) as TFolder;
            if (targetFolder) new Notice(`Created export folder: ${targetFolderPath}`);
          } catch (err) {
            this.plugin.logger.error("Error creating export folder:", err);
            new Notice(`Error creating export folder. Saving to vault root.`);
            targetFolder = this.app.vault.getRoot();
          }
        } else if (abstractFile instanceof TFolder) {
          targetFolder = abstractFile;
        } else {
          new Notice(`Error: Export path is not a folder. Saving to vault root.`);
          targetFolder = this.app.vault.getRoot();
        }
      } else {
        targetFolder = this.app.vault.getRoot();
      }

      if (!targetFolder) {
        new Notice("Error determining export folder.");
        exportingNotice.hide();
        return;
      }

      const filePath = normalizePath(`${targetFolder.path}/${filename}`);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      if (existingFile) {
        /* Поки що просто перезаписуємо */
      }

      const file = await this.app.vault.create(filePath, markdownContent);
      new Notice(`Chat exported to ${file.path}`);
    } catch (error) {
      this.plugin.logger.error(`Context menu: Error exporting chat ${chatId}:`, error);
      new Notice("An error occurred during chat export.");
    } finally {
      exportingNotice.hide();
    }
  }

  private async handleContextMenuClear(chatId: string, chatName: string): Promise<void> {
    this.plugin.logger.debug(`Context menu: Clear requested for chat ${chatId} (${chatName})`);
    new ConfirmModal(
      this.app,
      "Confirm Clear Messages",
      `Are you sure you want to clear all messages in chat "${chatName}"?\nThis action cannot be undone.`,
      async () => {
        // Колбек підтвердження
        this.plugin.logger.info(`User confirmed clearing messages for chat ${chatId}`);
        const clearingNotice = new Notice("Clearing messages...", 0);
        try {
          // --- ПОТРІБНО РЕАЛІЗУВАТИ В ChatManager ---
          const success = await this.plugin.chatManager.clearChatMessagesById(chatId);
          // -----------------------------------------
          if (success) {
            new Notice(`Messages cleared for chat "${chatName}".`);
            // Якщо це був активний чат, UI оновиться через active-chat-changed
            // Якщо не активний, то нічого робити не треба візуально одразу
          } else {
            new Notice(`Failed to clear messages for chat "${chatName}".`);
          }
        } catch (error) {
          this.plugin.logger.error(`Context menu: Error clearing messages for chat ${chatId}:`, error);
          new Notice("Error clearing messages.");
        } finally {
          clearingNotice.hide();
        }
      }
    ).open();
  }

  private async handleContextMenuDelete(chatId: string, chatName: string): Promise<void> {
    this.plugin.logger.debug(`Context menu: Delete requested for chat ${chatId} (${chatName})`);
    new ConfirmModal(
      this.app,
      "Confirm Delete Chat",
      `Are you sure you want to delete chat "${chatName}"?\nThis action cannot be undone.`,
      async () => {
        // Колбек підтвердження
        this.plugin.logger.info(`User confirmed deletion for chat ${chatId}`);
        const deletingNotice = new Notice("Deleting chat...", 0);
        try {
          const success = await this.plugin.chatManager.deleteChat(chatId); // Використовуємо існуючий метод
          if (success) {
            new Notice(`Chat "${chatName}" deleted.`);
            // UI оновиться через події від ChatManager
          } else {
            // Помилка вже мала бути показана в deleteChat
          }
        } catch (error) {
          this.plugin.logger.error(`Context menu: Error deleting chat ${chatId}:`, error);
          new Notice("Error deleting chat.");
        } finally {
          deletingNotice.hide();
        }
      }
    ).open();
  }

  /** Перевіряє, чи користувач прокрутив чат вгору */
  private isChatScrolledUp(): boolean {
    if (!this.chatContainer) return false;
    // Перевіряємо, чи взагалі є що скролити
    const scrollableDistance = this.chatContainer.scrollHeight - this.chatContainer.clientHeight;
    if (scrollableDistance <= 0) return false; // Немає скролу - не може бути прокручено вгору

    // Перевіряємо, чи поточна позиція далека від низу
    const distanceFromBottom = scrollableDistance - this.chatContainer.scrollTop;
    return distanceFromBottom >= SCROLL_THRESHOLD;
  }

  /** Оновлює стан userScrolledUp та видимість кнопок/індикаторів, пов'язаних зі скролом */
  private updateScrollStateAndIndicators(): void {
    if (!this.chatContainer) return; // Перевірка контейнера

    const wasScrolledUp = this.userScrolledUp;
    this.userScrolledUp = this.isChatScrolledUp(); // Визначаємо поточний стан

    // Оновлюємо кнопку "Scroll to Bottom"
    this.scrollToBottomButton?.classList.toggle(CSS_CLASS_VISIBLE, this.userScrolledUp);

    // Оновлюємо індикатор нових повідомлень (ховаємо, якщо дійшли до низу)
    if (wasScrolledUp && !this.userScrolledUp) {
      this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
    }
    // Логіка показу індикатора нових повідомлень залишається в addMessageToDisplay
    this.plugin.logger.debug(`[updateScrollStateAndIndicators] User scrolled up: ${this.userScrolledUp}`);
  }

  public checkMessageForCollapsing(messageEl: HTMLElement): void {
    const contentCollapsible = messageEl.querySelector<HTMLElement>(`.${CSS_CLASSES.CONTENT_COLLAPSIBLE}`);
    const maxH = this.plugin.settings.maxMessageHeight;
    const isAssistantMessage = messageEl.classList.contains(CSS_CLASSES.OLLAMA_MESSAGE);

    if (!contentCollapsible) return;

    if (this.isProcessing && isAssistantMessage) {
      const existingButton = messageEl.querySelector<HTMLButtonElement>(`.${CSS_CLASSES.SHOW_MORE_BUTTON}`);
      existingButton?.remove();
      contentCollapsible.style.maxHeight = "";
      contentCollapsible.classList.remove(CSS_CLASS_CONTENT_COLLAPSED);
      return;
    }

    if (maxH <= 0) {
      const existingButton = messageEl.querySelector<HTMLButtonElement>(`.${CSS_CLASSES.SHOW_MORE_BUTTON}`);
      existingButton?.remove();
      contentCollapsible.style.maxHeight = "";
      contentCollapsible.classList.remove(CSS_CLASS_CONTENT_COLLAPSED);
      return;
    }

    requestAnimationFrame(() => {
      if (!contentCollapsible || !contentCollapsible.isConnected) return;

      const existingButton = messageEl.querySelector<HTMLButtonElement>(`.${CSS_CLASSES.SHOW_MORE_BUTTON}`);
      existingButton?.remove();

      const currentMaxHeight = contentCollapsible.style.maxHeight;
      contentCollapsible.style.maxHeight = "";
      const scrollHeight = contentCollapsible.scrollHeight;
      contentCollapsible.style.maxHeight = currentMaxHeight;

      if (scrollHeight > maxH) {
        const collapseButton = messageEl.createEl("button", {
          cls: CSS_CLASSES.SHOW_MORE_BUTTON,
          text: "Show Less ▲",
        });
        collapseButton.setAttribute("data-initial-state", "expanded");

        this.registerDomEvent(collapseButton, "click", () =>
          this.toggleMessageCollapse(contentCollapsible, collapseButton)
        );

        contentCollapsible.classList.remove(CSS_CLASS_CONTENT_COLLAPSED);
        contentCollapsible.style.maxHeight = "";
      } else {
        contentCollapsible.style.maxHeight = "";
        contentCollapsible.classList.remove(CSS_CLASS_CONTENT_COLLAPSED);
      }
    });
  }

  // OllamaView.ts

  // --- ОНОВЛЕНО: handleSummarizeClick з новим класом анімації ---
  public async handleSummarizeClick(originalContent: string, buttonEl: HTMLButtonElement): Promise<void> {
    this.plugin.logger.debug("Summarize button clicked.");
    const summarizationModel = this.plugin.settings.summarizationModelName;

    if (!summarizationModel) {
      new Notice("Please select a summarization model in AI Forge settings (Productivity section).");
      return;
    }

    let textToSummarize = originalContent;
    if (RendererUtils.detectThinkingTags(RendererUtils.decodeHtmlEntities(originalContent)).hasThinkingTags) {
      textToSummarize = RendererUtils.decodeHtmlEntities(originalContent)
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .trim();
    }

    if (!textToSummarize || textToSummarize.length < 50) {
      new Notice("Message is too short to summarize meaningfully.");
      return;
    }

    // Встановлюємо стан завантаження кнопки
    const originalIcon = buttonEl.querySelector(".svg-icon")?.getAttribute("icon-name") || "scroll-text";
    setIcon(buttonEl, "loader"); // Встановлюємо іконку завантаження
    buttonEl.disabled = true;
    const originalTitle = buttonEl.title;
    buttonEl.title = "Summarizing...";
    buttonEl.addClass(CSS_CLASS_DISABLED);
    // --- ВИКОРИСТОВУЄМО НОВИЙ КЛАС ---
    buttonEl.addClass("button-loading"); // Додаємо клас для анімації
    this.plugin.logger.debug("Added 'button-loading' class to summarize button");
    // -------------------------------

    try {
      const prompt = `Provide a concise summary of the following text:\n\n"""\n${textToSummarize}\n"""\n\nSummary:`;
      const requestBody = {
        model: summarizationModel,
        prompt: prompt,
        stream: false,
        temperature: 0.2,
        options: {
          num_ctx: this.plugin.settings.contextWindow > 2048 ? 2048 : this.plugin.settings.contextWindow,
        },
      };

      this.plugin.logger.info(`Requesting summarization using model: ${summarizationModel}`);
      const responseData: OllamaGenerateResponse = await this.plugin.ollamaService.generateRaw(requestBody);

      if (responseData && responseData.response) {
        this.plugin.logger.debug(`Summarization successful. Length: ${responseData.response.length}`);
        new SummaryModal(this.plugin, "Message Summary", responseData.response.trim()).open();
      } else {
        throw new Error("Received empty response from summarization model.");
      }
    } catch (error: any) {
      this.plugin.logger.error("Error during summarization:", error);
      let userMessage = "Summarization failed: ";
      if (error instanceof Error) {
        if (error.message.includes("404") || error.message.toLocaleLowerCase().includes("model not found")) {
          userMessage += `Model '${summarizationModel}' not found.`;
        } else if (error.message.includes("connect") || error.message.includes("fetch")) {
          userMessage += "Could not connect to Ollama server.";
        } else {
          userMessage += error.message;
        }
      } else {
        userMessage += "Unknown error occurred.";
      }
      new Notice(userMessage, 6000);
    } finally {
      // --- ВІДНОВЛЕННЯ СТАНУ КНОПКИ ---
      setIcon(buttonEl, originalIcon);
      buttonEl.disabled = false;
      buttonEl.title = originalTitle;
      buttonEl.removeClass(CSS_CLASS_DISABLED);
      buttonEl.removeClass("button-loading"); // <--- Видаляємо новий клас
      //  this.plugin.logger.debug("Removed 'button-loading' class from summarize button");
      //  this.plugin.logger.trace("Summarize button state restored.");
      // --- КІНЕЦЬ ВІДНОВЛЕННЯ ---
    }
  }

  // --- ОНОВЛЕНИЙ renderOrUpdateErrorGroup ---
  /**
   * Створює нову групу для відображення помилок або оновлює існуючу.
   * Тепер використовує ErrorMessageRenderer для створення візуального блоку.
   * @param isContinuing Чи це продовження попередньої послідовності помилок.
   */
  private renderOrUpdateErrorGroup(isContinuing: boolean): void {
    if (!this.chatContainer) return;

    const errorsToDisplay = [...this.consecutiveErrorMessages]; // Копія поточних помилок
    if (errorsToDisplay.length === 0) {
      this.plugin.logger.warn("[renderOrUpdateErrorGroup] Called with no errors in buffer.");
      return; // Нічого не робити, якщо немає помилок
    }
    const errorCount = errorsToDisplay.length;
    const lastError = errorsToDisplay[errorCount - 1]; // Остання помилка в буфері

    let groupEl: HTMLElement;
    let contentContainer: HTMLElement | null = null; // Може не існувати спочатку

    if (isContinuing && this.errorGroupElement) {
      // --- Оновлення існуючої групи ---
      this.plugin.logger.debug("[renderOrUpdateErrorGroup] Updating existing error group.");
      groupEl = this.errorGroupElement;
      // Знаходимо контейнер для контенту помилки
      contentContainer = groupEl.querySelector(`.${CSS_CLASS_ERROR_TEXT}`); // Використовуємо константу
      if (contentContainer) {
        contentContainer.empty(); // Очищаємо попередній вміст (сумарі або список)
      } else {
        // Це не повинно трапитися, якщо структура консистентна
        this.plugin.logger.error("[renderOrUpdateErrorGroup] Could not find error text container in existing group!");
        // Спробувати знайти/створити аварійно? Або просто ігнорувати оновлення?
        // Поки що просто вийдемо, щоб уникнути подальших помилок
        return;
      }
      this.updateErrorGroupTimestamp(groupEl, lastError.timestamp); // Оновлюємо час останньої помилки
    } else {
      // --- Створення нової групи за допомогою ErrorMessageRenderer ---
      this.plugin.logger.debug("[renderOrUpdateErrorGroup] Creating new error group using ErrorMessageRenderer.");
      this.hideEmptyState(); // Приховуємо порожній стан
      this.isSummarizingErrors = false; // Скидаємо прапорець сумаризації для нової групи

      // Використовуємо ErrorMessageRenderer для створення базової структури групи ОДНІЄЇ помилки (останньої)
      // Це дасть нам правильну структуру, іконку, мітку часу, кнопки.
      const renderer = new ErrorMessageRenderer(this.app, this.plugin, lastError, this);
      groupEl = renderer.render(); // render() синхронний для ErrorMessageRenderer
      contentContainer = groupEl.querySelector(`.${CSS_CLASS_ERROR_TEXT}`); // Знаходимо контейнер тексту

      // Додаємо нову групу в DOM і оновлюємо посилання
      this.chatContainer.appendChild(groupEl);
      this.errorGroupElement = groupEl; // Зберігаємо посилання на нову групу
      this.lastMessageElement = groupEl; // Встановлюємо як останній елемент
    }

    // --- Відображення контенту (одна помилка або сумарі/список) ---
    if (contentContainer) {
      // Переконуємося, що контейнер знайдено
      if (errorCount === 1) {
        // Показуємо текст єдиної помилки (він вже встановлений ErrorMessageRenderer)
        contentContainer.setText(lastError.content); // Перезаписуємо на випадок оновлення
      } else {
        // Показуємо індикатор завантаження і запускаємо сумаризацію (якщо ще не запущена)
        contentContainer.setText(`Multiple errors occurred (${errorCount}). Summarizing...`);
        if (!this.isSummarizingErrors) {
          // Передаємо САМЕ ЕЛЕМЕНТ ГРУПИ, а не контейнер тексту, бо fallback може змінити структуру
          this.triggerErrorSummarization(groupEl, errorsToDisplay);
        }
      }
    } else {
      this.plugin.logger.error("[renderOrUpdateErrorGroup] Failed to find/create content container for error group.");
    }

    // Прокрутка до низу, щоб показати/оновити групу помилок
    this.guaranteedScrollToBottom(50, true);
  }

  /** Оновлює атрибут та текст мітки часу для групи помилок */
  private updateErrorGroupTimestamp(groupEl: HTMLElement, timestamp: Date): void {
    groupEl.setAttribute("data-timestamp", timestamp.getTime().toString());
    const timestampEl = groupEl.querySelector(`.${CSS_CLASSES.TIMESTAMP}`);
    if (timestampEl) {
      timestampEl.setText(this.formatTime(timestamp));
    }
  }

  private async triggerErrorSummarization(targetGroupElement: HTMLElement, errors: Message[]): Promise<void> {
    // --- ТИМЧАСОВЕ ВИМКНЕННЯ СУМАРИЗАЦІЇ ---
    const ENABLE_ERROR_SUMMARIZATION = false; // Встановіть true, щоб увімкнути назад
    // -----------------------------------------

    if (!ENABLE_ERROR_SUMMARIZATION) {
      this.plugin.logger.info("[triggerErrorSummarization] Error summarization is disabled. Displaying list fallback.");
      this.displayErrorListFallback(targetGroupElement, errors);
      // Не встановлюємо isSummarizingErrors = true, бо процес не запускається
      return; // Виходимо одразу
    }

    // --- Оригінальна логіка (виконується, тільки якщо ENABLE_ERROR_SUMMARIZATION = true) ---
    if (!this.plugin.settings.summarizationModelName || this.isSummarizingErrors) {
      if (!this.plugin.settings.summarizationModelName)
        this.plugin.logger.warn("[triggerErrorSummarization] Summarization model not set, cannot summarize errors.");
      if (this.isSummarizingErrors)
        this.plugin.logger.debug("[triggerErrorSummarization] Summarization already in progress, skipping.");
      // Якщо сумаризація неможлива або вже йде, показуємо список
      this.displayErrorListFallback(targetGroupElement, errors);
      return;
    }

    this.isSummarizingErrors = true; // Встановлюємо прапорець ТІЛЬКИ якщо реально запускаємо
    this.plugin.logger.info(`[triggerErrorSummarization] Starting summarization for ${errors.length} errors.`);

    try {
      const summary = await this.summarizeErrors(errors);
      const contentContainer = targetGroupElement.querySelector(`.${CSS_CLASSES.ERROR_TEXT}`) as HTMLElement;

      if (!contentContainer || !contentContainer.isConnected) {
        this.plugin.logger.warn(
          "[triggerErrorSummarization] Error content container disappeared before summarization finished."
        );
        // this.isSummarizingErrors = false; // Скидається у finally
        return;
      }

      contentContainer.empty(); // Очищаємо "Summarizing..."

      if (summary) {
        contentContainer.setText(`Multiple errors occurred. Summary:\n${summary}`);
      } else {
        this.plugin.logger.warn(
          "[triggerErrorSummarization] Summarization failed or returned empty. Displaying list fallback."
        );
        this.displayErrorListFallback(targetGroupElement, errors); // Використовуємо fallback
      }
    } catch (error) {
      this.plugin.logger.error("[triggerErrorSummarization] Unexpected error during summarization process:", error);
      this.displayErrorListFallback(targetGroupElement, errors); // Fallback при будь-якій помилці
    } finally {
      this.isSummarizingErrors = false; // Завжди скидаємо прапорець
      this.plugin.logger.debug("[triggerErrorSummarization] Summarization process finished (or was bypassed).");
    }
    // --- Кінець оригінальної логіки ---
  }

  private displayErrorListFallback(targetGroupElement: HTMLElement, errors: Message[]): void {
    const contentContainer = targetGroupElement.querySelector(`.${CSS_CLASSES.ERROR_TEXT}`) as HTMLElement;
    // Додамо перевірку, чи контейнер існує і чи він є частиною DOM
    if (!contentContainer || !contentContainer.isConnected) {
      this.plugin.logger.warn("[displayErrorListFallback] Target content container not found or not connected.");
      // Якщо елемент групи ще існує, спробуємо знайти/створити контейнер знову? Або просто вийти.
      // Поки що просто виходимо, щоб уникнути помилок.
      if (!targetGroupElement.isConnected) {
        this.plugin.logger.warn("[displayErrorListFallback] Target group element also not connected.");
      }
      return;
    }

    contentContainer.empty(); // Очищуємо попередній вміст (наприклад, "Summarizing...")
    const uniqueErrors = Array.from(new Set(errors.map(e => e.content.trim())));
    contentContainer.createDiv({
      // Додаємо кількість унікальних помилок для ясності
      text: `Multiple errors occurred (${errors.length} total, ${uniqueErrors.length} unique):`,
      cls: "error-summary-header", // Додатковий клас для можливої стилізації
    });
    // Використовуємо <ul> для кращої семантики списку
    const listEl = contentContainer.createEl("ul");
    listEl.style.marginTop = "5px";
    listEl.style.paddingLeft = "20px"; // Відступ для списку
    listEl.style.listStyle = "disc"; // Стиль маркера

    uniqueErrors.forEach(errorMsg => {
      // Використовуємо textContent для безпечного відображення тексту помилки
      const listItem = listEl.createEl("li");
      listItem.textContent = errorMsg;
    });

    // Переконаємось, що група помилок видима після оновлення
    this.guaranteedScrollToBottom(50, true);
  }

  /**
   * Виконує сумаризацію списку повідомлень про помилки за допомогою Ollama.
   * @param errors Масив повідомлень про помилки.
   * @returns Рядок з сумаризацією або null у разі помилки.
   */
  private async summarizeErrors(errors: Message[]): Promise<string | null> {
    const modelName = this.plugin.settings.summarizationModelName;
    if (!modelName) return null; // Модель не налаштована

    if (errors.length < 2) return errors[0]?.content || null; // Немає сенсу сумаризувати менше 2

    // Форматуємо помилки для промпту
    const uniqueErrorContents = Array.from(new Set(errors.map(e => e.content.trim())));
    const errorsText = uniqueErrorContents.map((msg, index) => `Error ${index + 1}: ${msg}`).join("\n");
    const prompt = `Concisely summarize the following ${uniqueErrorContents.length} unique error messages reported by the system. Focus on the core issue(s):\n\n${errorsText}\n\nSummary:`;

    const requestBody = {
      model: modelName,
      prompt: prompt,
      stream: false,
      temperature: 0.2, // Низька температура для фактологічної сумаризації
      options: {
        num_ctx: this.plugin.settings.contextWindow > 1024 ? 1024 : this.plugin.settings.contextWindow, // Обмежуємо контекст для сумаризації
        // Можна додати stop tokens, якщо модель схильна продовжувати занадто довго
        // stop: ["Error"]
      },
      system: "You are an assistant that summarizes lists of technical error messages accurately and concisely.",
    };

    try {
      this.plugin.logger.debug(
        `[summarizeErrors] Sending request to model ${modelName}. Prompt length: ${prompt.length}`
      );
      const responseData: OllamaGenerateResponse = await this.plugin.ollamaService.generateRaw(requestBody);
      if (responseData && responseData.response) {
        this.plugin.logger.debug(`[summarizeErrors] Summarization successful.`);
        return responseData.response.trim();
      } else {
        this.plugin.logger.warn("[summarizeErrors] Received empty or invalid response from Ollama.");
        return null;
      }
    } catch (error) {
      this.plugin.logger.error("[summarizeErrors] Failed to summarize errors:", error);
      return null;
    }
  }

  // --- Error Handling (ПОВНА ВЕРСІЯ) ---
  private handleErrorMessage(errorMessage: Message): void {
    if (errorMessage.role !== "error") {
      this.plugin.logger.warn(`handleErrorMessage called with non-error message role: ${errorMessage.role}`);
      return;
    }
    this.consecutiveErrorMessages.push(errorMessage);
    const isContinuingError = this.lastMessageElement === this.errorGroupElement && this.errorGroupElement !== null;
    if (!isContinuingError) {
      this.errorGroupElement = null;
      this.consecutiveErrorMessages = [errorMessage];
    }
    try {
      this.renderOrUpdateErrorGroup(isContinuingError);
    } catch (error) {
      this.plugin.logger.error("[handleErrorMessage] Failed to render/update error group:", error);
      try {
        /* ... fallback text node ... */
      } catch {}
    }
  }

  // OllamaView.ts

  async sendMessage(): Promise<void> {
    const content = this.inputEl.value.trim();
    // Перевірки на початку
    if (!content || this.isProcessing || this.sendButton.disabled || this.currentAbortController !== null) {
      if (!content) this.plugin.logger.debug("sendMessage prevented: input empty.");
      if (this.isProcessing) this.plugin.logger.debug("sendMessage prevented: already processing.");
      if (this.sendButton.disabled) this.plugin.logger.debug("sendMessage prevented: send button disabled.");
      if (this.currentAbortController)
        this.plugin.logger.debug("sendMessage prevented: generation already in progress (AbortController exists).");
      return;
    }

    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat) {
      new Notice("Error: No active chat session found.");
      return;
    }

    const userMessageContent = this.inputEl.value;
    this.clearInputField();
    this.setLoadingState(true);
    this.hideEmptyState();

    this.currentAbortController = new AbortController();
    let assistantPlaceholderGroupEl: HTMLElement | null = null;
    let assistantContentEl: HTMLElement | null = null;
    let messageWrapperEl: HTMLElement | null = null; // Зберігаємо messageWrapper
    let accumulatedResponse = "";
    const responseStartTime = new Date();
    const responseStartTimeMs = responseStartTime.getTime();

    this.stopGeneratingButton?.show();
    this.sendButton?.hide();

    let handleMessageAddedPromise: Promise<void> | null = null; // Для помилок/системних/fallback
    let streamErrorOccurred: Error | null = null;
    let finalPlaceholderRef: typeof this.activePlaceholder = null;

    try {
      // 1. Додаємо повідомлення користувача
      this.plugin.logger.debug("sendMessage: Adding user message to ChatManager...");
      const userMessage = await this.plugin.chatManager.addMessageToActiveChat("user", userMessageContent);
      if (!userMessage) {
        throw new Error("Failed to add user message to history.");
      }
      this.plugin.logger.debug("sendMessage: User message added successfully.");

      // 2. Створюємо плейсхолдер
      this.plugin.logger.debug("sendMessage: Creating streaming placeholder...");
      assistantPlaceholderGroupEl = this.chatContainer.createDiv({
        cls: `${CSS_CLASSES.MESSAGE_GROUP} ${CSS_CLASSES.OLLAMA_GROUP} placeholder`,
      });
      assistantPlaceholderGroupEl.setAttribute("data-placeholder-timestamp", responseStartTimeMs.toString());
      RendererUtils.renderAvatar(this.app, this.plugin, assistantPlaceholderGroupEl, false);
      messageWrapperEl = assistantPlaceholderGroupEl.createDiv({ cls: "message-wrapper" });
      messageWrapperEl.style.order = "2";
      const assistantMessageElement = messageWrapperEl.createDiv({
        cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.OLLAMA_MESSAGE}`,
      });
      const contentContainer = assistantMessageElement.createDiv({ cls: CSS_CLASSES.CONTENT_CONTAINER });
      assistantContentEl = contentContainer.createDiv({
        cls: `${CSS_CLASSES.CONTENT} ${CSS_CLASSES.CONTENT_COLLAPSIBLE} streaming-text`,
      });
      assistantContentEl.empty(); // Очищуємо спочатку

      // --- ДОДАЄМО ІНДИКАТОР "ДУМАЄ..." ---
      this.plugin.logger.debug("sendMessage: Adding thinking indicator to placeholder.");
      // Переконуємось, що константи CSS_CLASSES.THINKING_DOTS та CSS_CLASSES.THINKING_DOT визначені
      const dots = assistantContentEl.createDiv({ cls: CSS_CLASSES.THINKING_DOTS });
      for (let i = 0; i < 3; i++) dots.createDiv({ cls: CSS_CLASSES.THINKING_DOT });
      // --- КІНЕЦЬ ДОДАВАННЯ ІНДИКАТОРА ---

      if (assistantPlaceholderGroupEl && assistantContentEl && messageWrapperEl) {
        this.activePlaceholder = {
          timestamp: responseStartTimeMs,
          groupEl: assistantPlaceholderGroupEl,
          contentEl: assistantContentEl,
          messageWrapper: messageWrapperEl,
        };
      } else {
        this.plugin.logger.error("sendMessage: Failed to create all placeholder elements!");
        throw new Error("Failed to create placeholder elements.");
      }
      // Анімація та скрол
      assistantPlaceholderGroupEl.classList.add(CSS_CLASSES.MESSAGE_ARRIVING);
      setTimeout(() => assistantPlaceholderGroupEl?.classList.remove(CSS_CLASSES.MESSAGE_ARRIVING), 500);
      this.guaranteedScrollToBottom(50, true);

      // 3. Запускаємо потоковий запит
      this.plugin.logger.info("[OllamaView] Starting stream request...");
      const stream = this.plugin.ollamaService.generateChatResponseStream(
        activeChat,
        this.currentAbortController.signal
      );

      // 4. Обробка потоку - РЕНДЕРИНГ MARKDOWN НА ЛЬОТУ
      accumulatedResponse = "";
      for await (const chunk of stream) {
        // Обробка помилок chunk, кидаємо помилку
        if ("error" in chunk && chunk.error) {
          if (!chunk.error.includes("aborted by user")) {
            throw new Error(chunk.error);
          } else {
            throw new Error("aborted by user");
          }
        }

        if ("response" in chunk && chunk.response) {
          accumulatedResponse += chunk.response;
          // Оновлюємо плейсхолдер рендерингом Markdown
          if (this.activePlaceholder?.timestamp === responseStartTimeMs && this.activePlaceholder.contentEl) {
            try {
              // Викликаємо СТАТИЧНИЙ метод рендерингу
              await AssistantMessageRenderer.renderAssistantContent(
                this.activePlaceholder.contentEl, // Передаємо елемент контенту плейсхолдера
                accumulatedResponse, // Передаємо накопичений текст
                this.app,
                this.plugin,
                this // Передаємо контекст
              );
            } catch (renderError) {
              this.plugin.logger.error("Error during streaming render:", renderError);
              if (this.activePlaceholder?.contentEl) {
                this.activePlaceholder.contentEl.setText(
                  `[Render Error: ${renderError instanceof Error ? renderError.message : String(renderError)}]`
                );
              }
            }
          }
          this.guaranteedScrollToBottom(50, true); // Примусовий скрол під час стрімінгу
          // this.guaranteedScrollToBottom(50, false);
        }
        if ("done" in chunk && chunk.done) {
          break;
        }
      }
      // Якщо цикл завершився без помилок
    } catch (error: any) {
      // Ловимо помилки стрімінгу (включаючи abort)
      streamErrorOccurred = error;
      this.plugin.logger.error("[OllamaView] Error caught during stream processing loop:", streamErrorOccurred);
    }

    // 5. Потік завершився
    this.plugin.logger.debug(`[OllamaView] Stream processing finished. Final length: ${accumulatedResponse.length}`);

    finalPlaceholderRef = this.activePlaceholder; // Зберігаємо посилання
    this.activePlaceholder = null; // Скидаємо активний

    const placeholderStillValid =
      finalPlaceholderRef?.timestamp === responseStartTimeMs && finalPlaceholderRef?.groupEl?.isConnected;

    try {
      // Блок для обробки логіки ПІСЛЯ стрімінгу
      if (streamErrorOccurred) {
        // --- Обробка помилки стрімінгу ---
        this.plugin.logger.error("sendMessage: Handling stream error.");
        if (placeholderStillValid && finalPlaceholderRef) {
          this.plugin.logger.debug("sendMessage: Removing placeholder due to stream error.");
          finalPlaceholderRef.groupEl.remove();
        }
        // Додаємо повідомлення про помилку/зупинку стандартним шляхом (з Promise)
        let errorMsgContent = `Error: ${streamErrorOccurred.message || "Unknown streaming error."}`;
        let errorMsgRole: "system" | "error" = "error";
        let savePartial = false;
        if (streamErrorOccurred.message === "aborted by user") {
          errorMsgContent = "Generation stopped.";
          errorMsgRole = "system";
          if (accumulatedResponse) savePartial = true;
        }

        let errorResolver: () => void;
        const errorMessagePromise = new Promise<void>(resolve => {
          errorResolver = resolve;
        });
        this.currentMessageAddedResolver = errorResolver!;
        this.plugin.chatManager.addMessageToActiveChat(errorMsgRole, errorMsgContent, new Date());
        await errorMessagePromise;

        if (savePartial) {
          let partialResolver: () => void;
          const partialMessagePromise = new Promise<void>(resolve => {
            partialResolver = resolve;
          });
          this.currentMessageAddedResolver = partialResolver!;
          this.plugin.chatManager.addMessageToActiveChat("assistant", accumulatedResponse, responseStartTime);
          await partialMessagePromise;
        }
        handleMessageAddedPromise = null; // Немає чого чекати після обробки помилки
      } else if (!placeholderStillValid) {
        // --- Плейсхолдер зник/змінився - додаємо стандартно ---
        this.plugin.logger.warn("sendMessage: Placeholder invalid/missing after stream. Adding message normally.");
        if (accumulatedResponse.trim()) {
          let resolver: () => void;
          handleMessageAddedPromise = new Promise<void>(resolve => {
            resolver = resolve;
          });
          this.currentMessageAddedResolver = resolver!;
          this.plugin.chatManager.addMessageToActiveChat("assistant", accumulatedResponse, responseStartTime);
          await handleMessageAddedPromise; // Чекаємо стандартної обробки
        }
      } else if (!accumulatedResponse.trim()) {
        // --- Відповідь порожня, плейсхолдер є ---
        this.plugin.logger.warn("[OllamaView] Stream finished successfully but response empty. Removing placeholder.");
        if (finalPlaceholderRef) {
          finalPlaceholderRef.groupEl.remove();
        }
        // Додаємо системне повідомлення стандартним чином (з Promise)
        let resolver: () => void;
        handleMessageAddedPromise = new Promise<void>(resolve => {
          resolver = resolve;
        });
        this.currentMessageAddedResolver = resolver!;
        this.plugin.chatManager.addMessageToActiveChat("system", "Assistant provided an empty response.", new Date());
        await handleMessageAddedPromise; // Чекаємо стандартної обробки
      } else {
        // --- УСПІХ: Плейсхолдер є, відповідь є ---
        this.plugin.logger.debug(
          "sendMessage: Stream successful, placeholder valid. Adding message to ChatManager (no await)..."
        );
        // Додаємо повідомлення БЕЗ await. handleMessageAdded оновить плейсхолдер.
        this.plugin.chatManager.addMessageToActiveChat("assistant", accumulatedResponse, responseStartTime);
        handleMessageAddedPromise = null; // Немає чого чекати тут
      }
    } catch (error: any) {
      // Ловимо помилки, що могли виникнути ПІСЛЯ стрімінгу
      this.plugin.logger.error("[OllamaView] Error caught AFTER stream processing:", error);
      // Додаємо повідомлення про цю помилку (з Promise)
      try {
        let finalErrorResolver: () => void;
        const finalErrorPromise = new Promise<void>(resolve => {
          finalErrorResolver = resolve;
        });
        this.currentMessageAddedResolver = finalErrorResolver!;
        this.plugin.chatManager.addMessageToActiveChat(
          "error",
          `Internal error after stream: ${error.message}`,
          new Date()
        );
        await finalErrorPromise; // Чекаємо стандартної обробки
      } catch (finalErrorErr) {
        console.error("Failed to even add the final error message:", finalErrorErr);
      }
      handleMessageAddedPromise = null; // Немає чого чекати після обробки помилки
    } finally {
      // --- Блок finally ---
      // Резолвер тепер використовується тільки для помилок/fallback/системних
      if (this.currentMessageAddedResolver) {
        this.plugin.logger.warn("[sendMessage finally] Clearing potentially unused resolver.");
        this.currentMessageAddedResolver = null;
      }
      this.activePlaceholder = null; // Завжди скидаємо активний плейсхолдер
      this.plugin.logger.debug("[OllamaView] sendMessage finally block executing.");
      this.setLoadingState(false); // Відновлюємо UI
      this.stopGeneratingButton?.hide();
      this.sendButton?.show();
      this.currentAbortController = null;
      this.updateSendButtonState();
      this.focusInput();
      this.plugin.logger.debug("[OllamaView] sendMessage finally block finished.");
    }
  } // --- Кінець sendMessage ---

  // OllamaView.ts

  private async handleMessageAdded(data: { chatId: string; message: Message }): Promise<void> {
    try {
      // Перевірки на початку
      if (!data || !data.message) {
        this.plugin.logger.error("[HMA] Invalid data.");
        return;
      }
      this.plugin.logger.info(
        `[HMA] <<< ENTERED >>> Role: ${data.message.role}, Ts: ${data.message.timestamp.getTime()}`
      );
      if (!this || !this.plugin || !this.chatContainer || !this.plugin.chatManager) {
        console.error("[HMA] CRITICAL: Context missing!");
        return;
      }
      if (data.chatId !== this.plugin.chatManager.getActiveChatId()) {
        this.plugin.logger.debug(`[HMA] Ignored: Different chat.`);
        return;
      }
      // Перевірка на дублікат (час + роль)
      if (
        this.currentMessages.some(
          m => m.timestamp.getTime() === data.message.timestamp.getTime() && m.role === data.message.role
        )
      ) {
        this.plugin.logger.warn(`[HMA] Ignored: Duplicate timestamp AND role.`);
        // Якщо є resolver, його треба резолвнути, щоб sendMessage не завис у випадку помилки/fallback
        if (this.currentMessageAddedResolver) {
          this.currentMessageAddedResolver();
          this.currentMessageAddedResolver = null;
        }
        return;
      }

      this.plugin.logger.debug(`[HMA] Passed initial checks. Role: ${data.message.role}`);
      this.currentMessages.push(data.message); // Додаємо в кеш одразу

      // --- СПЕЦІАЛЬНА ОБРОБКА АСИСТЕНТА (ОНОВЛЕННЯ ПЛЕЙСХОЛДЕРА) ---
      if (data.message.role === "assistant") {
        const timestampMs = data.message.timestamp.getTime(); // Час, з яким повідомлення збережено
        const placeholderSelector = `div.message-group.placeholder[data-placeholder-timestamp="${timestampMs}"]`;
        const placeholderGroupEl = this.chatContainer.querySelector(placeholderSelector) as HTMLElement | null;

        if (placeholderGroupEl && placeholderGroupEl.isConnected) {
          // Перевіряємо, чи елемент ще в DOM
          this.plugin.logger.debug(
            `[HMA] Found placeholder for assistant ts: ${timestampMs}. Updating in place with final render.`
          );
          // Оновлюємо атрибути та класи
          placeholderGroupEl.classList.remove("placeholder");
          placeholderGroupEl.removeAttribute("data-placeholder-timestamp");
          placeholderGroupEl.setAttribute("data-timestamp", timestampMs.toString()); // Встановлюємо фінальний timestamp

          const contentEl = placeholderGroupEl.querySelector(`.${CSS_CLASSES.CONTENT}`) as HTMLElement | null;
          const messageWrapper = placeholderGroupEl.querySelector(".message-wrapper") as HTMLElement | null;
          const messageEl = placeholderGroupEl.querySelector(`.${CSS_CLASSES.MESSAGE}`) as HTMLElement | null;

          if (contentEl && messageWrapper && messageEl) {
            contentEl.classList.remove("streaming-text"); // Прибираємо клас потокового тексту
            // contentEl.empty(); // renderAssistantContent сам очистить

            try {
              // --- ВИКЛИК СТАТИЧНИХ МЕТОДІВ ---
              // 1. Фінальний рендеринг Markdown
              this.plugin.logger.debug("[HMA] Calling static renderAssistantContent for final update...");
              await AssistantMessageRenderer.renderAssistantContent(
                contentEl,
                data.message.content,
                this.app,
                this.plugin,
                this
              );
              this.plugin.logger.debug("[HMA] Final render finished. Adding buttons and timestamp...");
              // 2. Додавання/Оновлення кнопок
              AssistantMessageRenderer.addAssistantActionButtons(
                messageWrapper,
                contentEl,
                data.message,
                this.plugin,
                this
              );
              // 3. Додавання/Оновлення мітки часу
              BaseMessageRenderer.addTimestamp(messageEl, data.message.timestamp, this);
              // --- КІНЕЦЬ ВИКЛИКІВ ---

              this.lastMessageElement = placeholderGroupEl; // Оновлюємо останній елемент
              // Перевірка на згортання
              setTimeout(() => {
                if (messageEl.isConnected) this.checkMessageForCollapsing(messageEl);
              }, 50);
            } catch (renderError) {
              this.plugin.logger.error("[HMA] Error during final render/update of placeholder:", renderError);
              contentEl.setText(
                `[Error rendering final content: ${
                  renderError instanceof Error ? renderError.message : String(renderError)
                }]`
              );
              // Якщо фінальний рендеринг не вдався, можливо, варто видалити плейсхолдер і додати помилку?
              placeholderGroupEl.remove();
              this.handleErrorMessage({
                role: "error",
                content: `Failed to finalize assistant message: ${renderError.message}`,
                timestamp: new Date(),
              });
            }
          } else {
            // Якщо не знайшли внутрішні елементи плейсхолдера
            this.plugin.logger.error(
              "[HMA] Could not find required elements inside placeholder! Removing placeholder and adding normally."
            );
            placeholderGroupEl.remove();
            await this.addMessageStandard(data.message); // Fallback
          }
          // Виходимо, оскільки обробили асистента
          this.plugin.logger.info(`[HMA] <<< EXITED (updated placeholder) >>> Role: assistant, Ts: ${timestampMs}`);
          // НЕ резолвимо Promise тут, бо sendMessage не чекає на нього в цьому випадку
          return; // ВАЖЛИВО: Вийти з функції тут
        } else {
          // Плейсхолдер не знайдено
          this.plugin.logger.warn(
            `[HMA] Placeholder not found or disconnected for assistant ts: ${timestampMs}. Adding normally.`
          );
          await this.addMessageStandard(data.message); // Fallback - ЦЕЙ ВИКЛИК МАЄ ОБРОБИТИ PROMISE!
          this.plugin.logger.info(`[HMA] <<< EXITED (added normally fallback) >>> Role: assistant, Ts: ${timestampMs}`);
          return; // ВАЖЛИВО: Вийти з функції тут
        }
      }
      // --- КІНЕЦЬ СПЕЦІАЛЬНОЇ ОБРОБКИ АСИСТЕНТА ---

      // --- Стандартна обробка для інших ролей (User, System, Error) ---
      await this.addMessageStandard(data.message); // Цей виклик обробить Promise, якщо він є
      this.plugin.logger.info(
        `[HMA] <<< EXITED (standard) >>> Role: ${data.message.role}, Ts: ${data.message.timestamp.getTime()}`
      );
    } catch (outerError: any) {
      this.plugin.logger.error("[HMA] <<< CAUGHT OUTER ERROR >>>", outerError);
      // Обробляємо помилку через стандартний механізм
      this.handleErrorMessage({
        role: "error",
        content: `Internal error in handleMessageAdded: ${outerError.message}`,
        timestamp: new Date(),
      });
      // Резолвимо Promise, якщо він є, щоб sendMessage не завис
      if (this.currentMessageAddedResolver) {
        this.currentMessageAddedResolver();
        this.currentMessageAddedResolver = null;
      }
    } finally {
      // Блок finally більше не потрібен для резолву в успішному випадку асистента
      this.plugin.logger.info(
        `[HMA] <<< EXITING finally block >>> Role: ${data?.message?.role}, Ts: ${data?.message?.timestamp?.getTime()}`
      );
    }
  } // Кінець handleMessageAdded
} // END OF OllamaView CLASS
