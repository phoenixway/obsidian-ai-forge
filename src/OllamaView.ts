//OllamaView.ts
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

import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import OllamaPlugin from "./main";
import { AvatarType, LANGUAGES } from "./settings";
import { RoleInfo } from "./ChatManager";
import { Chat, ChatMetadata } from "./Chat";
import { SummaryModal } from "./SummaryModal";
import { Message, OllamaGenerateResponse } from "./types";
import { CSS_CLASSES } from "./constants";

import * as RendererUtils from "./MessageRendererUtils";
import { UserMessageRenderer } from "./renderers/UserMessageRenderer";
import { AssistantMessageRenderer } from "./renderers/AssistantMessageRenderer";
import { SystemMessageRenderer } from "./renderers/SystemMessageRenderer";
import { ErrorMessageRenderer } from "./renderers/ErrorMessageRenderer";
import { BaseMessageRenderer } from "./renderers/BaseMessageRenderer";
import { SidebarManager } from "./SidebarManager";
import { DropdownMenuManager } from "./DropdownMenuManager";

export const VIEW_TYPE_OLLAMA_PERSONAS = "ollama-personas-chat-view";

const SCROLL_THRESHOLD = 150;

const CSS_CLASS_CONTAINER = "ollama-container";
const CSS_CLASS_CHAT_CONTAINER = "ollama-chat-container";
const CSS_CLASS_INPUT_CONTAINER = "chat-input-container";
const CSS_CLASS_BUTTONS_CONTAINER = "buttons-container";
const CSS_CLASS_SEND_BUTTON = "send-button";
const CSS_CLASS_VOICE_BUTTON = "voice-button";
const CSS_CLASS_TRANSLATE_INPUT_BUTTON = "translate-input-button";
const CSS_CLASS_TRANSLATING_INPUT = "translating-input";
const CSS_CLASS_EMPTY_STATE = "ollama-empty-state";
export const CSS_CLASS_MESSAGE = "message";
const CSS_CLASS_ERROR_TEXT = "error-message-text";
const CSS_CLASS_TRANSLATION_CONTAINER = "translation-container";
const CSS_CLASS_TRANSLATION_CONTENT = "translation-content";
const CSS_CLASS_TRANSLATION_PENDING = "translation-pending";
const CSS_CLASS_RECORDING = "recording";
const CSS_CLASS_DISABLED = "disabled";
const CSS_CLASS_DATE_SEPARATOR = "chat-date-separator";
const CSS_CLASS_NEW_MESSAGE_INDICATOR = "new-message-indicator";
const CSS_CLASS_VISIBLE = "visible";
const CSS_CLASS_CONTENT_COLLAPSED = "message-content-collapsed";
const CSS_CLASS_MENU_OPTION = "menu-option";
const CSS_CLASS_MODEL_DISPLAY = "model-display";
const CSS_CLASS_ROLE_DISPLAY = "role-display";
const CSS_CLASS_INPUT_CONTROLS_CONTAINER = "input-controls-container";
const CSS_CLASS_INPUT_CONTROLS_LEFT = "input-controls-left";
const CSS_CLASS_INPUT_CONTROLS_RIGHT = "input-controls-right";

const CSS_CLASS_TEMPERATURE_INDICATOR = "temperature-indicator";

const CSS_CLASS_TOGGLE_LOCATION_BUTTON = "toggle-location-button";

const CSS_ROLE_PANEL_ITEM = "ollama-role-panel-item";
const CSS_ROLE_PANEL_ITEM_ICON = "ollama-role-panel-item-icon";
const CSS_ROLE_PANEL_ITEM_TEXT = "ollama-role-panel-item-text";
const CSS_ROLE_PANEL_ITEM_ACTIVE = "is-active";
const CSS_ROLE_PANEL_ITEM_CUSTOM = "is-custom";
const CSS_ROLE_PANEL_ITEM_NONE = "ollama-role-panel-item-none";
const CSS_MAIN_CHAT_AREA = "ollama-main-chat-area";
const CSS_SIDEBAR_SECTION_ICON = "ollama-sidebar-section-icon";
const CSS_CHAT_ITEM_OPTIONS = "ollama-chat-item-options";
const CSS_CLASS_STOP_BUTTON = "stop-generating-button";
const CSS_CLASS_SCROLL_BOTTOM_BUTTON = "scroll-to-bottom-button";
const CSS_CLASS_CHAT_LIST_ITEM = "ollama-chat-list-item";
const CSS_CLASS_MENU_BUTTON = "menu-button";

const CSS_CLASS_RESIZER_HANDLE = "ollama-resizer-handle"; // Новий клас для роздільника
const CSS_CLASS_RESIZING = "is-resizing"; // Клас для body під час перетягування

export type MessageRole = "user" | "assistant" | "system" | "error";

export class OllamaView extends ItemView {
  private sidebarManager!: SidebarManager;
  private dropdownMenuManager!: DropdownMenuManager;

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

  private temperatureIndicatorEl!: HTMLElement;
  private toggleLocationButton!: HTMLButtonElement;
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

  private rolePanelEl!: HTMLElement;
  private rolePanelListEl!: HTMLElement;
  private mainChatAreaEl!: HTMLElement;

  private lastProcessedChatId: string | null = null;

  private chatPanelListEl!: HTMLElement;

  private chatPanelHeaderEl!: HTMLElement;
  private rolePanelHeaderEl!: HTMLElement;
  private rolesSectionContainerEl!: HTMLElement;
  private scrollToBottomButton!: HTMLButtonElement;

  private stopGeneratingButton!: HTMLButtonElement;
  private currentAbortController: AbortController | null = null;

  private lastMessageElement: HTMLElement | null = null;
  private consecutiveErrorMessages: Message[] = [];
  private errorGroupElement: HTMLElement | null = null;
  private isSummarizingErrors = false;

  private temporarilyDisableChatChangedReload = false;
  private activePlaceholder: {
    timestamp: number;
    groupEl: HTMLElement;
    contentEl: HTMLElement;
    messageWrapper: HTMLElement;
  } | null = null;

  private currentMessageAddedResolver: (() => void) | null = null;
  // --- Нові властивості ---
  private sidebarRootEl!: HTMLElement; // Посилання на кореневий div сайдбару
  private resizerEl!: HTMLElement;     // Посилання на div роздільника
  private isResizing = false;
  private initialMouseX = 0;
  private initialSidebarWidth = 0;
  private boundOnDragMove: (event: MouseEvent) => void; // Обробник руху миші
  private boundOnDragEnd: (event: MouseEvent) => void;   // Обробник відпускання миші
  private saveWidthDebounced: () => void; // Debounced функція для збереження ширини
  // --- Кінець нових властивостей ---

  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.app = plugin.app;

    this.initSpeechWorker();

    this.scrollListenerDebounced = debounce(this.handleScroll, 150, true);
    this.register(
      this.plugin.on("focus-input-request", () => {
        this.focusInput();
      })
    );
    this.boundOnDragMove = this.onDragMove.bind(this);
    this.boundOnDragEnd = this.onDragEnd.bind(this);

    this.saveWidthDebounced = debounce(() => {
        if (this.sidebarRootEl) {
            const newWidth = this.sidebarRootEl.offsetWidth;
            // Зберігаємо, тільки якщо ширина дійсна і змінилася
            if (newWidth > 0 && newWidth !== this.plugin.settings.sidebarWidth) {
                this.plugin.logger.debug(`Saving sidebar width: ${newWidth}`);
                this.plugin.settings.sidebarWidth = newWidth;
                // Не використовуємо await, debounce сам керує асинхронністю
                this.plugin.saveSettings();
            }
        }
    }, 800); // Затримка 800 мс після останньої зміни
  }

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
    this.plugin.logger.debug("[OllamaView] onOpen started.");
    // Спочатку створюємо UI, включаючи роздільник
    this.createUIElements();

    // --- Застосовуємо збережену/дефолтну ширину сайдбару ---
    const savedWidth = this.plugin.settings.sidebarWidth;
    // Перевіряємо наявність sidebarRootEl та валідність збереженої ширини
    if (this.sidebarRootEl && savedWidth && typeof savedWidth === 'number' && savedWidth > 50) {
         this.plugin.logger.debug(`Applying saved sidebar width: ${savedWidth}px`);
         this.sidebarRootEl.style.width = `${savedWidth}px`;
         this.sidebarRootEl.style.minWidth = `${savedWidth}px`; // Важливо для flex-shrink
    } else if (this.sidebarRootEl) {
         // Встановлюємо дефолтну ширину, якщо збереженої немає або вона невалідна
         // Спробуємо прочитати з CSS змінної або встановити фіксоване значення
         let defaultWidth = 250; // Значення за замовчуванням
         try {
             const cssVarWidth = getComputedStyle(this.sidebarRootEl).getPropertyValue('--ai-forge-sidebar-width').trim();
             if (cssVarWidth && cssVarWidth.endsWith('px')) {
                 const parsedWidth = parseInt(cssVarWidth, 10);
                 if (!isNaN(parsedWidth) && parsedWidth > 50) {
                     defaultWidth = parsedWidth;
                 }
             }
         } catch (e) {
             this.plugin.logger.warn("Could not read default width from CSS variable, using fallback.", e);
         }
         this.plugin.logger.debug(`Applying default sidebar width: ${defaultWidth}px`);
         this.sidebarRootEl.style.width = `${defaultWidth}px`;
         this.sidebarRootEl.style.minWidth = `${defaultWidth}px`;
    }
    // --- Кінець застосування ширини ---

    // Оновлюємо початкові елементи UI (плейсхолдер, роль, модель...)
    try {
        const initialRolePath = this.plugin.settings.selectedRolePath;
        const initialRoleName = await this.findRoleNameByPath(initialRolePath);
        this.updateInputPlaceholder(initialRoleName);
        this.updateRoleDisplay(initialRoleName);
        this.updateModelDisplay(this.plugin.settings.modelName);
        this.updateTemperatureIndicator(this.plugin.settings.temperature);
        this.plugin.logger.debug("[OllamaView] Initial UI elements updated based on settings.");
    } catch (error) {
         this.plugin.logger.error("[OllamaView] Error during initial UI update in onOpen:", error);
    }

    this.attachEventListeners(); // Тепер включає слухач для роздільника
    this.autoResizeTextarea();
    this.updateSendButtonState();

    // Завантажуємо чат
    try {
        this.plugin.logger.debug("[OllamaView] Calling loadAndDisplayActiveChat from onOpen...");
        await this.loadAndDisplayActiveChat(); // Цей метод вже НЕ викликає update*List сам
        this.plugin.logger.debug("[OllamaView] loadAndDisplayActiveChat completed successfully in onOpen.");
        // ЯВНО оновлюємо списки ПІСЛЯ завантаження чату
        this.sidebarManager?.updateChatList().catch(e => this.plugin.logger.error("Error updating chat list after initial load:", e));
        this.sidebarManager?.updateRoleList().catch(e => this.plugin.logger.error("Error updating role list after initial load:", e));

    } catch (error) {
         this.plugin.logger.error("[OllamaView] Error during initial chat load in onOpen:", error);
         this.showEmptyState(); // Показуємо порожній стан при помилці
          // Оновлюємо видимі панелі навіть при помилці
         const updatePromises = [];
         if (this.sidebarManager?.isSectionVisible("chats")) { updatePromises.push( this.sidebarManager.updateChatList().catch(e => this.plugin.logger.error("Error updating chat panel list in catch:", e)) ); }
         if (this.sidebarManager?.isSectionVisible("roles")) { updatePromises.push( this.sidebarManager.updateRoleList().catch(e => this.plugin.logger.error("Error updating role panel list in catch:", e)) ); }
         if (updatePromises.length > 0) { await Promise.all(updatePromises); }
    }

    // Фокус
    setTimeout(() => { this.inputEl?.focus(); this.plugin.logger.debug("[OllamaView] Input focused in onOpen."); }, 150);
    if (this.inputEl) { this.inputEl.dispatchEvent(new Event("input")); }
 }

 async onClose(): Promise<void> {
  // --- Додано очищення слухачів перетягування ---
  document.removeEventListener("mousemove", this.boundOnDragMove, { capture: true });
  document.removeEventListener("mouseup", this.boundOnDragEnd, { capture: true });
  // Перевіряємо, чи клас було додано перед видаленням
  if (document.body.classList.contains(CSS_CLASS_RESIZING)) {
       document.body.style.cursor = ""; // Повертаємо курсор
       document.body.classList.remove(CSS_CLASS_RESIZING);
  }
  this.isResizing = false; // Скидаємо стан про всяк випадок
  // ---

  // --- Існуючий код очищення ---
  if (this.speechWorker) {
     this.speechWorker.terminate();
     this.speechWorker = null;
  }
  this.stopVoiceRecording(false); // Зупиняємо запис без обробки
  if (this.audioStream) {
     this.audioStream.getTracks().forEach(t => t.stop());
     this.audioStream = null;
  }
  if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
  if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
  this.sidebarManager?.destroy(); // Викликаємо destroy для менеджера сайдбару
  this.dropdownMenuManager?.destroy(); // Викликаємо destroy для менеджера меню
  this.plugin.logger.info("Ollama View closed and resources cleaned up.");
}

  private createUIElements(): void {
    this.plugin.logger.debug("createUIElements: Starting UI creation.");
    this.contentEl.empty(); // Очищуємо основний контейнер View
    // Створюємо головний flex-контейнер для сайдбару та області чату
    const flexContainer = this.contentEl.createDiv({ cls: "ollama-container" }); // Використовуємо CSS_CLASS_CONTAINER
  
    // Визначаємо, де має бути View і чи це десктоп
    const isSidebarLocation = !this.plugin.settings.openChatInTab;
    const isDesktop = Platform.isDesktop;
    this.plugin.logger.debug(`[OllamaView] createUIElements Context: isDesktop=${isDesktop}, isSidebarLocation=${isSidebarLocation}`);
  
    // 1. Створюємо Сайдбар і ЗБЕРІГАЄМО ПОСИЛАННЯ на кореневий елемент
    this.sidebarManager = new SidebarManager(this.plugin, this.app, this);
    this.sidebarRootEl = this.sidebarManager.createSidebarUI(flexContainer); // Зберігаємо посилання
  
    // Встановлюємо видимість внутрішнього сайдбара
    const shouldShowInternalSidebar = isDesktop && !isSidebarLocation;
    if (this.sidebarRootEl) {
        // Додаємо або видаляємо клас для приховування/показу через CSS
        this.sidebarRootEl.classList.toggle('internal-sidebar-hidden', !shouldShowInternalSidebar);
        this.plugin.logger.debug(`[OllamaView] Internal sidebar visibility set (hidden: ${!shouldShowInternalSidebar}). Classes: ${this.sidebarRootEl.className}`);
    } else {
        this.plugin.logger.error("[OllamaView] sidebarRootEl is missing after creation!");
    }
  
    // --- ДОДАНО: Створюємо Роздільник між сайдбаром та чатом ---
    this.resizerEl = flexContainer.createDiv({ cls: CSS_CLASS_RESIZER_HANDLE });
    this.resizerEl.title = "Drag to resize sidebar";
    // Приховуємо роздільник разом із сайдбаром
    this.resizerEl.classList.toggle('internal-sidebar-hidden', !shouldShowInternalSidebar);
    this.plugin.logger.debug(`[OllamaView] Resizer element created (hidden: ${!shouldShowInternalSidebar}).`);
    // --- КІНЕЦЬ ДОДАНОГО ---
  
    // 2. Створюємо Основну Область Чату
    this.mainChatAreaEl = flexContainer.createDiv({ cls: "ollama-main-chat-area" }); // Використовуємо CSS_MAIN_CHAT_AREA
    // Додаємо клас, якщо сайдбар приховано, щоб область чату займала всю ширину
    this.mainChatAreaEl.classList.toggle('full-width', !shouldShowInternalSidebar);
    this.plugin.logger.debug(`[OllamaView] Main chat area class 'full-width' set: ${!shouldShowInternalSidebar}`);
  
    // --- Створення решти елементів UI всередині mainChatAreaEl ---
    this.chatContainerEl = this.mainChatAreaEl.createDiv({ cls: "ollama-chat-area-content" });
    this.chatContainer = this.chatContainerEl.createDiv({ cls: "ollama-chat-container"});
    this.newMessagesIndicatorEl = this.chatContainerEl.createDiv({ cls: "new-message-indicator" });
    setIcon(this.newMessagesIndicatorEl.createSpan({ cls: "indicator-icon" }), "arrow-down");
    this.newMessagesIndicatorEl.createSpan({ text: " New Messages" });
    this.scrollToBottomButton = this.chatContainerEl.createEl("button", { cls: ["scroll-to-bottom-button", "clickable-icon"], attr: { "aria-label": "Scroll to bottom", title: "Scroll to bottom" }, });
    setIcon(this.scrollToBottomButton, "arrow-down");
    const inputContainer = this.mainChatAreaEl.createDiv({ cls: "chat-input-container" });
    this.inputEl = inputContainer.createEl("textarea", { attr: { placeholder: `Enter message text here...`, rows: 1 } });
    const controlsContainer = inputContainer.createDiv({ cls: "input-controls-container" });
    const leftControls = controlsContainer.createDiv({ cls: "input-controls-left" });
    this.translateInputButton = leftControls.createEl("button", { cls: "translate-input-button", attr: { "aria-label": "Translate input to English" }, });
    setIcon(this.translateInputButton, "languages");
    this.translateInputButton.title = "Translate input to English";
    this.modelDisplayEl = leftControls.createDiv({ cls: "model-display" }); this.modelDisplayEl.setText("..."); this.modelDisplayEl.title = "Click to select model";
    this.roleDisplayEl = leftControls.createDiv({ cls: "role-display" }); this.roleDisplayEl.setText("..."); this.roleDisplayEl.title = "Click to select role";
    this.temperatureIndicatorEl = leftControls.createDiv({ cls: "temperature-indicator" }); this.temperatureIndicatorEl.setText("?"); this.temperatureIndicatorEl.title = "Click to set temperature";
    this.buttonsContainer = controlsContainer.createDiv({ cls: `buttons-container input-controls-right`});
    this.stopGeneratingButton = this.buttonsContainer.createEl("button", { cls: ["stop-generating-button", "danger-option"], attr: { "aria-label": "Stop Generation", title: "Stop Generation" }, }); // Використовуємо константу CSS_CLASSES.DANGER_OPTION
    setIcon(this.stopGeneratingButton, "square"); this.stopGeneratingButton.hide();
    this.sendButton = this.buttonsContainer.createEl("button", { cls: "send-button", attr: { "aria-label": "Send" }, }); setIcon(this.sendButton, "send");
    this.voiceButton = this.buttonsContainer.createEl("button", { cls: "voice-button", attr: { "aria-label": "Voice Input" }, }); setIcon(this.voiceButton, "mic");
    this.toggleLocationButton = this.buttonsContainer.createEl("button", { cls: "toggle-location-button", attr: { "aria-label": "Toggle View Location" }, });
    this.menuButton = this.buttonsContainer.createEl("button", { cls: "menu-button", attr: { "aria-label": "Menu" }, }); setIcon(this.menuButton, "more-vertical");
    this.updateToggleLocationButton(); // Встановлює іконку/title
    this.dropdownMenuManager = new DropdownMenuManager(this.plugin, this.app, this, inputContainer, isSidebarLocation, isDesktop);
    this.dropdownMenuManager.createMenuUI();
    this.plugin.logger.debug("createUIElements: Finished UI creation.");
  }

  private attachEventListeners(): void {
    this.plugin.logger.debug("[OllamaView] Attaching event listeners...");

    // --- ДОДАНО: Слухач для роздільника ---
    if (this.resizerEl) {
        // Додаємо слухач mousedown до роздільника
        this.registerDomEvent(this.resizerEl, "mousedown", this.onDragStart);
        this.plugin.logger.debug("Added mousedown listener to resizer handle.");
    } else {
         this.plugin.logger.error("Resizer element (resizerEl) not found during listener attachment!");
    }
    // ---

    // --- Реєстрація всіх інших слухачів як раніше ---
    if (this.inputEl) { this.registerDomEvent(this.inputEl, "keydown", this.handleKeyDown); this.registerDomEvent(this.inputEl, "input", this.handleInputForResize); }
    if (this.sendButton) { this.registerDomEvent(this.sendButton, "click", this.handleSendClick); }
    if (this.stopGeneratingButton) { this.registerDomEvent(this.stopGeneratingButton, "click", this.cancelGeneration); }
    if (this.voiceButton) { this.registerDomEvent(this.voiceButton, "click", this.handleVoiceClick); }
    if (this.translateInputButton) { this.registerDomEvent(this.translateInputButton, "click", this.handleTranslateInputClick); }
    if (this.menuButton) { this.registerDomEvent(this.menuButton, "click", this.handleMenuButtonClick); }
    if (this.toggleLocationButton) { this.registerDomEvent(this.toggleLocationButton, "click", this.handleToggleViewLocationClick); }
    if (this.modelDisplayEl) { this.registerDomEvent(this.modelDisplayEl, "click", this.handleModelDisplayClick); }
    if (this.roleDisplayEl) { this.registerDomEvent(this.roleDisplayEl, "click", this.handleRoleDisplayClick); }
    if (this.temperatureIndicatorEl) { this.registerDomEvent(this.temperatureIndicatorEl, "click", this.handleTemperatureClick); }
    if (this.chatContainer) { this.registerDomEvent(this.chatContainer, "scroll", this.scrollListenerDebounced); }
    if (this.newMessagesIndicatorEl) { this.registerDomEvent(this.newMessagesIndicatorEl, "click", this.handleNewMessageIndicatorClick); }
    if (this.scrollToBottomButton) { this.registerDomEvent(this.scrollToBottomButton, "click", this.handleScrollToBottomClick); }
    this.registerDomEvent(window, "resize", this.handleWindowResize);
    this.registerDomEvent(document, "click", this.handleDocumentClickForMenu);
    this.registerDomEvent(document, "visibilitychange", this.handleVisibilityChange);
    this.registerEvent(this.app.workspace.on("active-leaf-change", this.handleActiveLeafChange));
    this.dropdownMenuManager?.attachEventListeners();
    this.plugin.logger.debug("[OllamaView] Delegated listener attachment to DropdownMenuManager.");
    this.register(this.plugin.on("model-changed", modelName => this.handleModelChange(modelName)));
    this.register(this.plugin.on("role-changed", roleName => this.handleRoleChange(roleName)));
    this.register(this.plugin.on("roles-updated", () => this.handleRolesUpdated()));
    this.register(this.plugin.on("message-added", data => this.handleMessageAdded(data)));
    this.register(this.plugin.on("active-chat-changed", data => this.handleActiveChatChanged(data)));
    this.register(this.plugin.on("messages-cleared", chatId => this.handleMessagesCleared(chatId)));
    this.register(this.plugin.on("chat-list-updated", () => this.handleChatListUpdated()));
    this.register(this.plugin.on("settings-updated", () => this.handleSettingsUpdated()));
    this.register(this.plugin.on("message-deleted", data => this.handleMessageDeleted(data)));
    this.register(this.plugin.on("ollama-connection-error", message => { /* Можливо, показати щось у View? */ }));
    this.plugin.logger.debug("[OllamaView] All event listeners attached.");
  }

  private cancelGeneration = (): void => {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    } else {
    }
  };

  private handleMessageDeleted = (data: { chatId: string; timestamp: Date }): void => {
    const currentActiveChatId = this.plugin.chatManager?.getActiveChatId();

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

      if (messageGroupEl instanceof HTMLElement) {
        this.plugin.logger.debug(
          `handleMessageDeleted: Found message group HTMLElement to remove with selector: ${selector}`
        );

        const currentScrollTop = this.chatContainer.scrollTop;
        const removedHeight = messageGroupEl.offsetHeight;
        const wasAboveViewport = messageGroupEl.offsetTop < currentScrollTop;

        messageGroupEl.remove();

        const initialLength = this.currentMessages.length;
        this.currentMessages = this.currentMessages.filter(msg => msg.timestamp.getTime() !== timestampMs);
        this.plugin.logger.debug(
          `handleMessageDeleted: Updated local message cache from ${initialLength} to ${this.currentMessages.length} messages.`
        );

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

        if (this.currentMessages.length === 0) {
          this.showEmptyState();
        }
      } else if (messageGroupEl) {
        this.plugin.logger.error(
          `handleMessageDeleted: Found element with selector ${selector}, but it is not an HTMLElement. Forcing reload.`,
          messageGroupEl
        );
        this.loadAndDisplayActiveChat();
      } else {
        this.plugin.logger.warn(
          `handleMessageDeleted: Could not find message group element with selector: ${selector}. Maybe already removed or timestamp attribute missing?`
        );
      }
    } catch (error) {
      this.plugin.logger.error(
        `handleMessageDeleted: Error removing message element for timestamp ${timestampMs}:`,
        error
      );

      this.loadAndDisplayActiveChat();
    }
  };

  private updateRolePanelList = async (): Promise<void> => {
    const container = this.rolePanelListEl;
    if (!container || !this.plugin.chatManager) {
      return;
    }

    if (this.rolePanelHeaderEl?.getAttribute("data-collapsed") === "true") {
      return;
    }

    const currentScrollTop = container.scrollTop;
    container.empty();

    try {
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

  private handleRolePanelItemClick = async (
    roleInfo: RoleInfo | null,
    currentRolePath: string | null | undefined
  ): Promise<void> => {
    const newRolePath = roleInfo?.path ?? "";
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
          await this.plugin.saveSettings();

          this.plugin.emit("role-changed", roleNameForEvent);
          this.plugin.promptService?.clearRoleCache?.();
        }
      } catch (error) {
        this.plugin.logger.error(`[handleRolePanelItemClick] Error setting role to ${newRolePath}:`, error);
        new Notice("Failed to set the role.");
      }
    } else {
    }
  };

  private updateToggleLocationButton(): void {
    if (!this.toggleLocationButton) return;

    let iconName: string;
    let titleText: string;

    if (this.plugin.settings.openChatInTab) {
      iconName = "sidebar-right";
      titleText = "Move to Sidebar";
    } else {
      iconName = "layout-list";
      titleText = "Move to Tab";
    }
    setIcon(this.toggleLocationButton, iconName);
    this.toggleLocationButton.setAttribute("aria-label", titleText);
    this.toggleLocationButton.title = titleText;
  }

  private handleModelDisplayClick = async (event: MouseEvent) => {
    const menu = new Menu();
    let itemsAdded = false;

    const loadingNotice = new Notice("Loading models...", 0);

    try {
      const models = await this.plugin.ollamaService.getModels();
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      const currentModelName = activeChat?.metadata?.modelName || this.plugin.settings.modelName;

      loadingNotice.hide();

      if (models.length === 0) {
        menu.addItem(item => item.setTitle("No models found").setDisabled(true));
        itemsAdded = true;
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
          itemsAdded = true;
        });
      }
    } catch (error) {
      loadingNotice.hide();
      console.error("Error loading models for model selection menu:", error);
      menu.addItem(item => item.setTitle("Error loading models").setDisabled(true));
      itemsAdded = true;
      new Notice("Failed to load models. Check Ollama connection.");
    } finally {
      if (itemsAdded) {
        menu.showAtMouseEvent(event);
      } else {
        console.warn("Model menu was not shown because no items were added.");
      }
    }
  };

  private updateModelDisplay(modelName: string | null | undefined): void {
    if (this.modelDisplayEl) {
      if (modelName) {
        const displayName = modelName;
        const shortName = displayName.replace(/:latest$/, "");
        this.modelDisplayEl.setText(shortName);
        this.modelDisplayEl.title = `Current model: ${displayName}. Click to change.`;

        this.modelDisplayEl.removeClass("model-not-available");
      } else {
        this.modelDisplayEl.setText("Not available");
        this.modelDisplayEl.title =
          "No Ollama models detected. Check Ollama connection and ensure models are installed.";

        this.modelDisplayEl.addClass("model-not-available");
      }
    } else {
      console.error("[OllamaView] modelDisplayEl is missing!");
    }
  }

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
    }
  };
  private handleInputForResize = (): void => {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      this.adjustTextareaHeight();
      this.updateSendButtonState();
    }, 75);
  };

  private handleVoiceClick = (): void => {
    this.toggleVoiceRecognition();
  };

  private handleTranslateInputClick = async (): Promise<void> => {
    const currentText = this.inputEl.value;

    const targetLang = this.plugin.settings.translationTargetLanguage;

    if (!currentText.trim()) {
      new Notice("Input is empty, nothing to translate.");
      return;
    }

    if (!this.plugin.settings.enableTranslation || this.plugin.settings.translationProvider === "none") {
      new Notice("Translation disabled or provider not selected in settings.");
      return;
    }

    if (!targetLang) {
      new Notice("Target language for translation is not set in settings.");
      return;
    }

    setIcon(this.translateInputButton, "loader");
    this.translateInputButton.disabled = true;
    this.translateInputButton.classList.add(CSS_CLASS_TRANSLATING_INPUT);
    this.translateInputButton.title = "Translating...";

    try {
      const translatedText = await this.plugin.translationService.translate(currentText, "English");

      if (translatedText !== null) {
        this.inputEl.value = translatedText;
        this.inputEl.dispatchEvent(new Event("input"));
        this.inputEl.focus();

        if (translatedText) {
          const end = translatedText.length;
          this.inputEl.setSelectionRange(end, end);
        }
      } else {
      }
    } catch (error) {
      this.plugin.logger.error("[OllamaView] Unexpected error during input translation call:", error);
      new Notice("Input translation encountered an unexpected error.");
    } finally {
      setIcon(this.translateInputButton, "languages");

      this.translateInputButton.disabled = this.isProcessing;
      this.translateInputButton.classList.remove(CSS_CLASS_TRANSLATING_INPUT);

      this.translateInputButton.title = `Translate input to ${LANGUAGES[targetLang] || targetLang}`;
    }
  };

  public handleNewChatClick = async (): Promise<void> => {
    this.plugin.logger.error("!!! OllamaView: handleNewChatClick ENTERED !!!");
    this.dropdownMenuManager?.closeMenu();
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

  public handleRenameChatClick = async (chatIdToRename?: string, currentChatName?: string): Promise<void> => {
    this.plugin.logger.error("!!! OllamaView: handleRenameChatClick ENTERED !!!");
    let chatId: string | null = chatIdToRename ?? null;
    let currentName: string | null = currentChatName ?? null;

    if (!chatId || !currentName) {
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

    this.dropdownMenuManager?.closeMenu();

    if (!chatId || currentName === null) {
      this.plugin.logger.error("[handleRenameChatClick] Failed to determine chat ID or current name.");
      new Notice("Could not initiate rename process.");
      return;
    }

    new PromptModal(this.app, "Rename Chat", `Enter new name for "${currentName}":`, currentName, async newName => {
      let noticeMessage = "Rename cancelled or name unchanged.";
      const trimmedName = newName?.trim();

      if (trimmedName && trimmedName !== "" && trimmedName !== currentName) {
        this.plugin.logger.debug(`Attempting rename for chat ${chatId} to "${trimmedName}" via ChatManager.renameChat`);

        const success = await this.plugin.chatManager.renameChat(chatId!, trimmedName);

        if (success) {
          noticeMessage = `Chat renamed to "${trimmedName}"`;
        } else {
          noticeMessage = "Failed to rename chat.";
        }
      } else if (trimmedName && trimmedName === currentName) {
        noticeMessage = "Name unchanged.";
      } else if (newName === null || trimmedName === "") {
        noticeMessage = "Rename cancelled or invalid name entered.";
      }
      new Notice(noticeMessage);
      this.focusInput();
    }).open();
  };

  private handleContextMenuRename(chatId: string, currentName: string): void {
    this.handleRenameChatClick(chatId, currentName);
  }

  public handleCloneChatClick = async (): Promise<void> => {
    this.dropdownMenuManager?.closeMenu();
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
  public handleClearChatClick = async (): Promise<void> => {
    this.dropdownMenuManager?.closeMenu();
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
  public handleDeleteChatClick = async (): Promise<void> => {
    this.dropdownMenuManager?.closeMenu();
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

  public handleExportChatClick = async (): Promise<void> => {
    this.dropdownMenuManager?.closeMenu();
    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat || activeChat.messages.length === 0) {
      new Notice("Chat empty, nothing to export.");
      return;
    }
    try {
      const markdownContent = this.formatChatToMarkdown(activeChat.messages);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = activeChat.metadata.name.replace(/[\\/?:*"<>|]/g, "-");
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
            if (targetFolder) {
              new Notice(`Created export folder: ${targetFolderPath}`);
            } else {
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
          new Notice(`Error: Export path is not a folder. Saving to vault root.`);
          targetFolder = this.app.vault.getRoot();
        }
      } else {
        targetFolder = this.app.vault.getRoot();
      }

      if (!targetFolder) {
        this.plugin.logger.error("Failed to determine a valid target folder for export.");
        new Notice("Error determining export folder. Cannot save file.");
        return;
      }

      const filePath = normalizePath(`${targetFolder.path}/${filename}`);

      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      if (existingFile) {
      }

      const file = await this.app.vault.create(filePath, markdownContent);
      new Notice(`Chat exported to ${file.path}`);
    } catch (error) {
      this.plugin.logger.error("Error exporting chat:", error);

      if (error instanceof Error && error.message.includes("File already exists")) {
        new Notice("Error exporting chat: File already exists.");
      } else {
        new Notice("An unexpected error occurred during chat export.");
      }
    }
  };

  public handleSettingsClick = async (): Promise<void> => {
    this.dropdownMenuManager?.closeMenu();
    (this.app as any).setting?.open?.();
    (this.app as any).setting?.openTabById?.(this.plugin.manifest.id);
  };
  private handleDocumentClickForMenu = (e: MouseEvent): void => {
    this.dropdownMenuManager?.handleDocumentClick(e, this.menuButton);
  };

  private handleModelChange = async (modelName: string): Promise<void> => {
    this.updateModelDisplay(modelName);
    try {
      const chat = await this.plugin.chatManager?.getActiveChat();
      const temp = chat?.metadata?.temperature ?? this.plugin.settings.temperature;
      this.updateTemperatureIndicator(temp);

      if (chat && this.currentMessages.length > 0) {
        await this.plugin.chatManager?.addMessageToActiveChat("system", `Model changed to: ${modelName}`, new Date());
      }
    } catch (error) {
      this.plugin.logger.error("Error handling model change notification:", error);
    }
  };

  private handleRoleChange = async (roleName: string): Promise<void> => {
    const displayRole = roleName || "None";
    this.updateInputPlaceholder(displayRole);
    this.updateRoleDisplay(displayRole);

    try {
      const chat = await this.plugin.chatManager?.getActiveChat();

      if (chat && this.currentMessages.length > 0) {
        await this.plugin.chatManager?.addMessageToActiveChat("system", `Role changed to: ${displayRole}`, new Date());
      } else {
        new Notice(`Role set to: ${displayRole}`);
      }
    } catch (error) {
      this.plugin.logger.error("Error handling role change notification:", error);

      new Notice(`Role set to: ${displayRole}`);
    }
  };
  private handleRolesUpdated = (): void => {
    this.plugin.promptService?.clearRoleCache();

    if (this.dropdownMenuManager) {
      this.dropdownMenuManager
        .updateRoleListIfVisible()
        .catch(e => this.plugin.logger.error("Error updating role dropdown list:", e));
    }

    if (this.sidebarManager?.isSectionVisible("roles")) {
      this.sidebarManager.updateRoleList().catch(e => this.plugin.logger.error("Error updating role panel list:", e));
    } else {
    }
  };

  private async addMessageStandard(message: Message): Promise<void> {
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
      let renderer: UserMessageRenderer | SystemMessageRenderer | AssistantMessageRenderer | null = null;

      switch (message.role) {
        case "user":
          renderer = new UserMessageRenderer(this.app, this.plugin, message, this);
          break;
        case "system":
          renderer = new SystemMessageRenderer(this.app, this.plugin, message, this);
          break;
        case "error":
          this.handleErrorMessage(message);

          if (this.currentMessageAddedResolver) {
            this.currentMessageAddedResolver();
            this.currentMessageAddedResolver = null;
          }
          return;
        case "assistant":
          renderer = new AssistantMessageRenderer(this.app, this.plugin, message, this);
          break;
        default:
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
      }

      if (this.currentMessageAddedResolver) {
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

      this.handleErrorMessage({
        role: "error",
        content: `Failed to display ${message.role} message. Render Error: ${error.message}`,
        timestamp: new Date(),
      });

      if (this.currentMessageAddedResolver) {
        try {
          this.currentMessageAddedResolver();
        } catch (e) {
          this.plugin.logger.error("Error resolving promise after error:", e);
        }
        this.currentMessageAddedResolver = null;
      }
    }
  }

  private handleMessagesCleared = (chatId: string): void => {
    if (chatId === this.plugin.chatManager?.getActiveChatId()) {
      console.log("[OllamaView] Messages cleared event received.");
      this.clearChatContainerInternal();
      this.currentMessages = [];
      this.showEmptyState();
    }
  };

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
    if (!this.chatContainer || !this.newMessagesIndicatorEl || !this.scrollToBottomButton) return;

    const threshold = 150;
    const atBottom =
      this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight < threshold;

    const previousScrolledUp = this.userScrolledUp;
    this.userScrolledUp = !atBottom;

    if (previousScrolledUp && atBottom) {
      this.newMessagesIndicatorEl.classList.remove(CSS_CLASS_VISIBLE);
    }

    this.scrollToBottomButton.classList.toggle(CSS_CLASS_VISIBLE, this.userScrolledUp);
  };

  private handleNewMessageIndicatorClick = (): void => {
    if (this.chatContainer) {
      this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: "smooth" });
    }
    this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
    this.scrollToBottomButton?.classList.remove(CSS_CLASS_VISIBLE);
    this.userScrolledUp = false;
  };

  private handleScrollToBottomClick = (): void => {
    if (this.chatContainer) {
      this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: "smooth" });
    }
    this.scrollToBottomButton?.classList.remove(CSS_CLASS_VISIBLE);
    this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
    this.userScrolledUp = false;
  };

  private updateInputPlaceholder(roleName: string | null | undefined): void {
    if (this.inputEl) {
      this.inputEl.placeholder = `Enter message text here...`;
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

      const baseMinHeight = parseFloat(computedStyle.minHeight) || 40;
      const maxHeight = parseFloat(computedStyle.maxHeight);

      const currentScrollTop = textarea.scrollTop;
      textarea.style.height = "auto";

      const scrollHeight = textarea.scrollHeight;

      let targetHeight = Math.max(baseMinHeight, scrollHeight);
      let applyOverflow = false;

      if (!isNaN(maxHeight) && targetHeight > maxHeight) {
        targetHeight = maxHeight;
        applyOverflow = true;
      }

      textarea.style.height = `${targetHeight}px`;
      textarea.style.overflowY = applyOverflow ? "auto" : "hidden";
      textarea.scrollTop = currentScrollTop;
    });
  };

  private updateRoleDisplay(roleName: string | null | undefined): void {
    if (this.roleDisplayEl) {
      const displayName = roleName || "None";
      this.roleDisplayEl.setText(displayName);
      this.roleDisplayEl.title = `Current role: ${displayName}. Click to change.`;
    }
  }

  private updateSendButtonState(): void {
    if (!this.inputEl || !this.sendButton) return;

    const isDisabled = this.inputEl.value.trim() === "" || this.isProcessing || this.currentAbortController !== null;
    this.sendButton.disabled = isDisabled;
    this.sendButton.classList.toggle(CSS_CLASS_DISABLED, isDisabled);

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

  public setLoadingState(isLoading: boolean): void {
    this.isProcessing = isLoading;
    if (this.inputEl) this.inputEl.disabled = isLoading;
    this.updateSendButtonState();
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

    if (this.chatContainer) {
      if (isLoading) {
        this.chatContainer.querySelectorAll<HTMLButtonElement>(`.${CSS_CLASSES.SHOW_MORE_BUTTON}`).forEach(button => {
          button.style.display = "none";
        });
      } else {
        this.checkAllMessagesForCollapsing();
      }
    }
  }

  private isSidebarSectionVisible(type: "chats" | "roles"): boolean {
    const headerEl = type === "chats" ? this.chatPanelHeaderEl : this.rolePanelHeaderEl;
    return headerEl?.getAttribute("data-collapsed") === "false";
  }

  async loadAndDisplayActiveChat(): Promise<void> {
    this.plugin.logger.error("[LOAD_DISPLAY] >>>>> ENTERING loadAndDisplayActiveChat");
    try {
      this.clearChatContainerInternal();
      this.currentMessages = [];
      this.lastRenderedMessageDate = null;
      this.lastMessageElement = null;
      this.consecutiveErrorMessages = [];
      this.errorGroupElement = null;

      let activeChat: Chat | null = null;
      let availableModels: string[] = [];
      let finalModelName: string | null = null;
      let finalRolePath: string | null | undefined = undefined;
      let finalRoleName: string = "None";
      let finalTemperature: number | null | undefined = undefined;
      let errorOccurred = false;

      try {
        activeChat = (await this.plugin.chatManager?.getActiveChat()) || null;
        this.plugin.logger.debug(
          `[loadAndDisplayActiveChat] Active chat fetched: ${activeChat?.metadata?.id ?? "null"}`
        );
        availableModels = await this.plugin.ollamaService.getModels();

        finalRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;
        finalRoleName = await this.findRoleNameByPath(finalRolePath);
        this.plugin.logger.debug(
          `[loadAndDisplayActiveChat] Determined role: Path='${finalRolePath || "None"}', Name='${finalRoleName}'`
        );
      } catch (error) {
        this.plugin.logger.error("[loadAndDisplayActiveChat] Error fetching initial data:", error);
        new Notice("Error connecting to Ollama or loading chat data.", 5000);
        errorOccurred = true;

        finalModelName = availableModels.includes(this.plugin.settings.modelName)
          ? this.plugin.settings.modelName
          : availableModels[0] ?? null;
        finalTemperature = this.plugin.settings.temperature;
        finalRolePath = this.plugin.settings.selectedRolePath;
        finalRoleName = await this.findRoleNameByPath(finalRolePath);
        activeChat = null;
      }

      if (!errorOccurred && activeChat) {
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
        }

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
        finalModelName = availableModels.includes(this.plugin.settings.modelName)
          ? this.plugin.settings.modelName
          : availableModels[0] ?? null;
        finalTemperature = this.plugin.settings.temperature;
      }

      if (activeChat !== null && !errorOccurred && activeChat.messages?.length > 0) {
        this.hideEmptyState();
        this.currentMessages = [...activeChat.messages];
        this.lastRenderedMessageDate = null;

        for (const message of this.currentMessages) {
          let messageGroupEl: HTMLElement | null = null;

          const isNewDay =
            !this.lastRenderedMessageDate || !this.isSameDay(this.lastRenderedMessageDate, message.timestamp);
          const isFirstMessageInContainer = this.chatContainer.children.length === 0;

          if (isNewDay || isFirstMessageInContainer) {
            if (isNewDay) {
              this.renderDateSeparator(message.timestamp);
            }
            this.lastRenderedMessageDate = message.timestamp;
          }

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
                renderer = new ErrorMessageRenderer(this.app, this.plugin, message, this);

                this.lastMessageElement = null;
                this.errorGroupElement = null;
                this.consecutiveErrorMessages = [];
                break;
              default:
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

            const errorDiv = this.chatContainer.createDiv({ cls: "render-error" });
            errorDiv.setText(`Error rendering message (role: ${message.role})`);
            messageGroupEl = errorDiv;
          }

          if (messageGroupEl) {
            this.chatContainer.appendChild(messageGroupEl);
            this.lastMessageElement = messageGroupEl;
          }
        }

        setTimeout(() => this.checkAllMessagesForCollapsing(), 100);

        setTimeout(() => {
          this.guaranteedScrollToBottom(100, false);
          setTimeout(() => {
            this.updateScrollStateAndIndicators();
          }, 150);
        }, 150);
      } else {
        this.showEmptyState();
        this.scrollToBottomButton?.classList.remove(CSS_CLASSES.VISIBLE);
      }

      this.updateInputPlaceholder(finalRoleName);
      this.updateRoleDisplay(finalRoleName);
      this.updateModelDisplay(finalModelName);
      this.updateTemperatureIndicator(finalTemperature);
      this.plugin.logger.debug("[loadAndDisplayActiveChat] Updating visible sidebar panels via SidebarManager...");
      const panelUpdatePromises = [];
      if (this.sidebarManager?.isSectionVisible("chats")) {
        panelUpdatePromises.push(
          this.sidebarManager
            .updateChatList()
            .catch(e => this.plugin.logger.error("Error updating chat panel list:", e))
        );
      } else {
        this.plugin.logger.debug("[loadAndDisplayActiveChat] Chat panel collapsed, skipping update.");
      }
      if (this.sidebarManager?.isSectionVisible("roles")) {
        panelUpdatePromises.push(
          this.sidebarManager
            .updateRoleList()
            .catch(e => this.plugin.logger.error("Error updating role panel list:", e))
        );
      } else {
      }

      if (panelUpdatePromises.length > 0) {
        await Promise.all(panelUpdatePromises);
        this.plugin.logger.debug("[loadAndDisplayActiveChat] Sidebar panel updates finished.");
      }

      if (finalModelName === null) {
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
          this.inputEl.disabled = this.isProcessing;
        }
        this.updateSendButtonState();
      }
    } catch (error) {
      this.plugin.logger.error("[loadAndDisplayActiveChat] XXX ПОМИЛКА під час виконання XXX", error);
    } finally {
    }
    this.plugin.logger.error("[LOAD_DISPLAY] <<<<< EXITING loadAndDisplayActiveChat");
  }

// Обробник події зміни активного чату
private handleActiveChatChanged = async (data: { chatId: string | null; chat: Chat | null }): Promise<void> => {
  // Логування початку обробки (використовуємо ERROR для видимості)
  this.plugin.logger.error(`[HANDLER] handleActiveChatChanged FIRED for chat ID: ${data.chatId ?? 'null'}`);

  // Визначаємо, чи змінився ID чату порівняно з попереднім обробленим
  const chatSwitched = data.chatId !== this.lastProcessedChatId;
  this.plugin.logger.warn(`[handleActiveChatChanged] Calculated chatSwitched: ${chatSwitched}`);

  // --- Тимчасове вимкнення для тестування (можна видалити, якщо не використовується) ---
  // if (this.temporarilyDisableChatChangedReload) {
  //   this.plugin.logger.error("[handleActiveChatChanged] RELOAD DISABLED FOR TEST. Skipping logic.");
  //   this.lastProcessedChatId = data.chatId; // Оновлюємо ID
  //   return;
  // }
  // ---

  // --- Основна логіка ---
  if (chatSwitched || (data.chatId !== null && data.chat === null)) {
    // --- ВИПАДОК 1: Чат змінився (новий ID) АБО активний чат став null (наприклад, після видалення) ---
    this.plugin.logger.error(`[handleActiveChatChanged] !!! FULL CHAT RELOAD Condition Met !!! (switched: ${chatSwitched}, data.chat === null: ${data.chat === null}). Preparing to call loadAndDisplayActiveChat...`);
    const currentStack = new Error().stack;
    this.plugin.logger.error(`[handleActiveChatChanged] Stack trace for reload condition: ${currentStack}`);

    // Оновлюємо ID останнього обробленого чату
    this.lastProcessedChatId = data.chatId;
    // Викликаємо повне перезавантаження та відображення нового активного стану
    this.plugin.logger.error("[handleActiveChatChanged] CALLING loadAndDisplayActiveChat NOW!");
    await this.loadAndDisplayActiveChat();

  } else if (data.chatId !== null && data.chat !== null) {
    // --- ВИПАДОК 2: Чат той самий (ID не змінився), але його дані (chat object) оновилися (наприклад, змінилися метадані) ---
    this.plugin.logger.info(`[handleActiveChatChanged] Updating UI/Panels for existing chat ID: ${data.chatId}. NO FULL RELOAD.`);
    // Оновлюємо ID останнього обробленого чату (хоча він і не змінився, для консистентності)
    this.lastProcessedChatId = data.chatId;

    // Оновлюємо UI елементи, що відображають метадані цього чату
    const chat = data.chat;
    const currentRolePath = chat.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;
    const currentRoleName = await this.findRoleNameByPath(currentRolePath);
    const currentModelName = chat.metadata?.modelName || this.plugin.settings.modelName;
    const currentTemperature = chat.metadata?.temperature ?? this.plugin.settings.temperature;

    this.updateModelDisplay(currentModelName);
    this.updateRoleDisplay(currentRoleName);
    this.updateInputPlaceholder(currentRoleName);
    this.updateTemperatureIndicator(currentTemperature);

    // --- ВИДАЛЕНО ЯВНЕ ОНОВЛЕННЯ ПАНЕЛЕЙ ЗВІДСИ ---
    // Тепер оновлення панелей має відбуватися у відповідь на подію 'chat-list-updated',
    // яка генерується методом saveChatAndUpdateIndex в ChatManager після збереження метаданих.
    this.plugin.logger.info("[handleActiveChatChanged] SKIPPED explicit sidebar panel update call here. Relying on 'chat-list-updated' event.");
    /*
    const panelUpdatePromises = [];
    if (this.sidebarManager?.isSectionVisible("chats")) {
        panelUpdatePromises.push(this.sidebarManager.updateChatList().catch(e => this.plugin.logger.error("Error updating chat panel list:", e)));
    }
    if (this.sidebarManager?.isSectionVisible("roles")) {
        panelUpdatePromises.push(this.sidebarManager.updateRoleList().catch(e => this.plugin.logger.error("Error updating role panel list:", e)));
    }
    if (panelUpdatePromises.length > 0) { await Promise.all(panelUpdatePromises); }
    this.plugin.logger.debug("[handleActiveChatChanged] Sidebar panel updates finished.");
    */
    // --- КІНЕЦЬ ВИДАЛЕНОГО БЛОКУ ---

  } else {
    // --- ВИПАДОК 3: Непередбачений стан (наприклад, chatId === null, але chat не null?) ---
    this.plugin.logger.warn(`[handleActiveChatChanged] Entering UNHANDLED STATE: chatId=${data.chatId}, chatSwitched=${chatSwitched}.`);
    // Оновлюємо ID на випадок помилки
    this.lastProcessedChatId = data.chatId;
  }

  // Оновлення випадаючого меню ролей (не залежить від випадку)
  if (this.dropdownMenuManager) {
      this.dropdownMenuManager
          .updateRoleListIfVisible()
          .catch(e => this.plugin.logger.error("Error updating role dropdown list in handleActiveChatChanged:", e));
  }


  this.plugin.logger.error(`[HANDLER] handleActiveChatChanged FINISHED for chat ID: ${data.chatId ?? 'null'}`);
}; // Кінець handleActiveChatChanged

  private handleChatListUpdated = (): void => {
    this.plugin.logger.error("[HANDLER] handleChatListUpdated FIRED");
    if (this.dropdownMenuManager) {
      this.dropdownMenuManager
        .updateChatListIfVisible()
        .catch(e => this.plugin.logger.error("Error updating chat dropdown list:", e));
    }

    if (this.sidebarManager?.isSectionVisible("chats")) {
      this.plugin.logger.info("[OllamaView -> Sidebar] Chat panel is visible, requesting update from handleChatListUpdated.");
      this.sidebarManager.updateChatList().catch(error => {
        this.plugin.logger.error("[OllamaView -> Sidebar] Error updating chat panel list:", error);
      });
    } else {
      this.plugin.logger.info("[OllamaView -> Sidebar] Chat panel is collapsed, skipping update from handleChatListUpdated.");
    }
  };

  public handleSettingsUpdated = async (): Promise<void> => {
    this.plugin.logger.error("[HANDLER] handleSettingsUpdated FIRED");
    const activeChat = await this.plugin.chatManager?.getActiveChat();
    const currentModelName = activeChat?.metadata?.modelName || this.plugin.settings.modelName;
    const currentRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;
    const currentRoleName = await this.findRoleNameByPath(currentRolePath);
    const currentTemperature = activeChat?.metadata?.temperature ?? this.plugin.settings.temperature;

    this.updateModelDisplay(currentModelName);
    this.updateRoleDisplay(currentRoleName);
    this.updateInputPlaceholder(currentRoleName);
    this.updateTemperatureIndicator(currentTemperature);
    this.updateToggleViewLocationOption();
    this.updateToggleLocationButton();

    if (this.dropdownMenuManager) {
      this.dropdownMenuManager
        .updateRoleListIfVisible()
        .catch(e => this.plugin.logger.error("Error updating role dropdown list:", e));
      this.dropdownMenuManager
        .updateModelListIfVisible()
        .catch(e => this.plugin.logger.error("Error updating model dropdown list:", e));
      this.dropdownMenuManager.updateToggleViewLocationOption();
    }

    if (this.sidebarManager?.isSectionVisible("roles")) {
      await this.sidebarManager
        .updateRoleList()
        .catch(e => this.plugin.logger.error("Error updating role panel list:", e));
    } else {
    }

    if (this.sidebarManager?.isSectionVisible("chats")) {
      this.plugin.logger.debug("[handleSettingsUpdated -> Sidebar] Chat panel is visible, updating it.");
      await this.sidebarManager
        .updateChatList()
        .catch(e => this.plugin.logger.error("Error updating chat panel list:", e));
    } else {
      this.plugin.logger.debug("[handleSettingsUpdated -> Sidebar] Chat panel is collapsed, skipping update.");
    }
    this.plugin.logger.debug("[handleSettingsUpdated] UI updates finished.");
  };

  public async handleDeleteMessageClick(messageToDelete: Message): Promise<void> {
    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat) {
      new Notice("Cannot delete message: No active chat.");
      return;
    }

    new ConfirmModal(
      this.app,
      "Confirm Message Deletion",
      `Are you sure you want to delete this message?\n"${messageToDelete.content.substring(0, 100)}${
        messageToDelete.content.length > 100 ? "..." : ""
      }"\n\nThis action cannot be undone.`,
      async () => {
        this.plugin.logger.info(
          `User confirmed deletion for message timestamp: ${messageToDelete.timestamp.toISOString()} in chat ${
            activeChat.metadata.id
          }`
        );
        try {
          const deleteSuccess = await this.plugin.chatManager.deleteMessageByTimestamp(
            activeChat.metadata.id,
            messageToDelete.timestamp
          );

          if (deleteSuccess) {
            new Notice("Message deleted.");
          } else {
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

  // OllamaView.ts
  public async handleRegenerateClick(userMessage: Message): Promise<void> {

    this.plugin.logger.error(`[HANDLER] handleRegenerateClick FIRED for message timestamp: ${userMessage.timestamp.toISOString()}`);
    if (this.currentAbortController) {
      this.plugin.logger.warn(
        "Cannot regenerate while another generation is in progress. Cancelling current one first."
      );
      this.cancelGeneration();
      await new Promise(resolve => setTimeout(resolve, 250)); 
      if (this.currentAbortController) { 
        new Notice("Please wait for the current generation to stop completely.");
        return;
      }
    }

    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat) {
      new Notice("Cannot regenerate: No active chat found.");
      return;
    }
    const chatId = activeChat.metadata.id;
    const messageIndex = activeChat.messages.findIndex(
      msg => msg.timestamp.getTime() === userMessage.timestamp.getTime() && msg.role === userMessage.role
    );

    if (messageIndex === -1) {
      this.plugin.logger.error(
        "Could not find the user message in the active chat history for regeneration.",
        userMessage
      );
      new Notice("Error: Could not find the message to regenerate from.");
      return;
    }

    const hasMessagesAfter = activeChat.messages.length > messageIndex + 1;

    new ConfirmModal(
      this.app,
      "Confirm Regeneration",
      hasMessagesAfter ? "This will delete all messages after this prompt and generate a new response. Continue?" : "Generate a new response for this prompt?",
      async () => {
        this.currentAbortController = new AbortController();
        let accumulatedResponse = "";
        const responseStartTime = new Date();
        const responseStartTimeMs = responseStartTime.getTime();
        
        let currentLocalPlaceholderRef: typeof this.activePlaceholder = null;

        this.setLoadingState(true);
        this.stopGeneratingButton?.show();
        this.sendButton?.hide();

        let streamErrorOccurred: Error | null = null;

        try {
          this.plugin.logger.debug(`[Regenerate] Starting for message at index ${messageIndex} in chat ${chatId}. HasMessagesAfter: ${hasMessagesAfter}`);

          if (hasMessagesAfter) {
            const deleteSuccess = await this.plugin.chatManager.deleteMessagesAfter(chatId, messageIndex);
            if (!deleteSuccess) {
              throw new Error("Failed to delete subsequent messages for regeneration.");
            }
            this.plugin.logger.debug(`[Regenerate] Subsequent messages deleted.`);
          }

          await this.loadAndDisplayActiveChat(); 
          this.guaranteedScrollToBottom(50, true); 
          this.plugin.logger.debug(`[Regenerate] Chat reloaded to reflect deletions.`);

          this.plugin.logger.debug(`[Regenerate] Creating placeholder for new assistant response (timestamp: ${responseStartTimeMs}).`);
          const assistantPlaceholderGroupEl = this.chatContainer.createDiv({
            cls: `${CSS_CLASSES.MESSAGE_GROUP} ${CSS_CLASSES.OLLAMA_GROUP} placeholder`,
          });
          assistantPlaceholderGroupEl.setAttribute("data-placeholder-timestamp", responseStartTimeMs.toString());
          RendererUtils.renderAvatar(this.app, this.plugin, assistantPlaceholderGroupEl, false); 
          const messageWrapperEl = assistantPlaceholderGroupEl.createDiv({ cls: "message-wrapper" });
          messageWrapperEl.style.order = "2"; 
          const assistantMessageElement = messageWrapperEl.createDiv({
            cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.OLLAMA_MESSAGE}`,
          });
          const contentContainer = assistantMessageElement.createDiv({ cls: CSS_CLASSES.CONTENT_CONTAINER });
          const assistantContentEl = contentContainer.createDiv({
            cls: `${CSS_CLASSES.CONTENT} ${CSS_CLASSES.CONTENT_COLLAPSIBLE} streaming-text`,
          });
          assistantContentEl.empty(); 

          const dots = assistantContentEl.createDiv({ cls: CSS_CLASSES.THINKING_DOTS });
          for (let i = 0; i < 3; i++) dots.createDiv({ cls: CSS_CLASSES.THINKING_DOT });

          if (assistantPlaceholderGroupEl && assistantContentEl && messageWrapperEl) {
            this.activePlaceholder = { 
              timestamp: responseStartTimeMs,
              groupEl: assistantPlaceholderGroupEl,
              contentEl: assistantContentEl,
              messageWrapper: messageWrapperEl,
            };
            currentLocalPlaceholderRef = this.activePlaceholder; 
            this.plugin.logger.debug(`[Regenerate] Placeholder created and activePlaceholder set for ts: ${responseStartTimeMs}.`);
          } else {
            this.plugin.logger.error("[Regenerate] Failed to create all placeholder elements!");
            throw new Error("Failed to create placeholder elements for regeneration.");
          }

          assistantPlaceholderGroupEl.classList.add(CSS_CLASSES.MESSAGE_ARRIVING);
          setTimeout(() => assistantPlaceholderGroupEl?.classList.remove(CSS_CLASSES.MESSAGE_ARRIVING), 500);
          this.guaranteedScrollToBottom(50, true);

          // Отримуємо екземпляр Chat ПІСЛЯ того, як повідомлення були видалені.
          // Він повинен містити правильну (скорочену) історію.
          const chatForStreaming = await this.plugin.chatManager.getChat(chatId);
          if (!chatForStreaming) {
            throw new Error("Failed to get updated chat context for streaming regeneration.");
          }
          // Переконуємося, що chatForStreaming.messages справді відображає стан після видалення
          // і містить повідомлення тільки до userMessage включно (або порожній масив, якщо userMessage був першим).
          // Якщо deleteMessagesAfter видаляє повідомлення з індексу N+1, то chatForStreaming.messages 
          // повинен мати довжину N+1.

          this.plugin.logger.debug(`[Regenerate] Starting stream with ${chatForStreaming.messages.length} messages in context for chat ${chatId}.`);
          
          const stream = this.plugin.ollamaService.generateChatResponseStream(
            chatForStreaming, // Передаємо оновлений екземпляр Chat
            this.currentAbortController.signal
          );

          let firstChunk = true;
          for await (const chunk of stream) {
            if (this.currentAbortController.signal.aborted) {
              this.plugin.logger.debug("[Regenerate] Stream aborted by user during iteration.");
              throw new Error("aborted by user");
            }

            if ("error" in chunk && chunk.error) {
              if (!chunk.error.includes("aborted by user")) {
                this.plugin.logger.error(`[Regenerate] Stream error: ${chunk.error}`);
                throw new Error(chunk.error);
              } else {
                throw new Error("aborted by user");
              }
            }

            if ("response" in chunk && chunk.response) {
              if (this.activePlaceholder?.timestamp === responseStartTimeMs && this.activePlaceholder.contentEl) {
                if (firstChunk) {
                  const thinkingDots = this.activePlaceholder.contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
                  if (thinkingDots) thinkingDots.remove();
                  firstChunk = false;
                }
                accumulatedResponse += chunk.response;
                await AssistantMessageRenderer.renderAssistantContent(
                  this.activePlaceholder.contentEl,
                  accumulatedResponse,
                  this.app,
                  this.plugin,
                  this
                );
                this.guaranteedScrollToBottom(50, true);
                if (this.activePlaceholder.groupEl) { 
                     this.checkMessageForCollapsing(this.activePlaceholder.groupEl);
                }
              } else {
                 this.plugin.logger.warn(`[Regenerate] activePlaceholder mismatch or contentEl missing during stream. Current ts: ${this.activePlaceholder?.timestamp}, expected: ${responseStartTimeMs}. Accumulated chunk anyway.`);
                 accumulatedResponse += chunk.response;
              }
            }
            if ("done" in chunk && chunk.done) {
              this.plugin.logger.debug("[Regenerate] Stream finished (done chunk received).");
              break;
            }
          }
          this.plugin.logger.debug(
            `[Regenerate] Stream completed. Final response length: ${accumulatedResponse.length}. Placeholder still valid for this request: ${this.activePlaceholder?.timestamp === responseStartTimeMs}`
          );

          if (accumulatedResponse.trim()) {
            this.plugin.logger.debug(`[Regenerate] Adding assistant message to ChatManager: "${accumulatedResponse.substring(0,100)}..."`);
            this.plugin.chatManager.addMessageToActiveChat(
              "assistant",
              accumulatedResponse,
              responseStartTime, 
              false 
            );
          } else if (!this.currentAbortController.signal.aborted) {
            this.plugin.logger.warn("[Regenerate] Assistant provided an empty response, and not due to cancellation.");
            if (this.activePlaceholder?.timestamp === responseStartTimeMs && this.activePlaceholder.groupEl?.isConnected) {
                this.activePlaceholder.groupEl.remove();
            }
            if (this.activePlaceholder?.timestamp === responseStartTimeMs) {
                this.activePlaceholder = null;
            }
            await this.plugin.chatManager.addMessageToActiveChat(
              "system",
              "Assistant provided an empty response during regeneration.",
              new Date() 
            );
          }

        } catch (error: any) {
          streamErrorOccurred = error; 
          this.plugin.logger.error("[Regenerate] Error during regeneration process:", error);
          
          if (currentLocalPlaceholderRef?.groupEl?.isConnected && currentLocalPlaceholderRef.timestamp === responseStartTimeMs) {
            this.plugin.logger.debug(`[Regenerate] Removing local placeholder (ts: ${responseStartTimeMs}) due to error: ${error.message}`);
            currentLocalPlaceholderRef.groupEl.remove();
          }
          if (this.activePlaceholder?.timestamp === responseStartTimeMs) {
            this.activePlaceholder = null;
          }

          let errorMsgForChat: string;
          let errorMsgRole: "system" | "error" = "error";
          let savePartialResponseOnError = false;

          if (error.name === "AbortError" || error.message?.includes("aborted by user")) {
            this.plugin.logger.info("[Regenerate] Regeneration was stopped by user.");
            errorMsgForChat = "Regeneration stopped.";
            errorMsgRole = "system";
            if (accumulatedResponse.trim()) { 
              savePartialResponseOnError = true;
            }
          } else {
            errorMsgForChat = `Regeneration failed: ${error.message || "Unknown error"}`;
            new Notice(errorMsgForChat, 5000);
          }

          await this.plugin.chatManager.addMessageToActiveChat(errorMsgRole, errorMsgForChat, new Date());

          if (savePartialResponseOnError) {
            this.plugin.logger.debug("[Regenerate] Saving partial response after cancellation.");
            await this.plugin.chatManager.addMessageToActiveChat(
              "assistant",
              accumulatedResponse,
              responseStartTime, 
              false
            );
          }

        } finally {
          this.plugin.logger.debug(`[Regenerate] Entering finally block for request ${responseStartTimeMs}.`);
          
          if (this.activePlaceholder?.timestamp === responseStartTimeMs) {
             this.plugin.logger.warn(`[Regenerate] Active placeholder for ts ${responseStartTimeMs} was not cleared before  finally. Removing if connected.`);
             if (this.activePlaceholder.groupEl?.isConnected) {
                this.activePlaceholder.groupEl.remove();
             }
             this.activePlaceholder = null;
          }

          this.setLoadingState(false);
          this.stopGeneratingButton?.hide();
          this.sendButton?.show();
          this.currentAbortController = null;
          this.updateSendButtonState();
          this.focusInput();
          this.plugin.logger.debug(`[Regenerate] Process finished for request ${responseStartTimeMs}.`);
        }
      }
    ).open();
  }

  public handleCopyClick(content: string, buttonEl: HTMLElement): void {
    let textToCopy = content;

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

  public async handleTranslateClick(
    originalContent: string,
    contentEl: HTMLElement,
    buttonEl: HTMLButtonElement
  ): Promise<void> {
    const targetLang = this.plugin.settings.translationTargetLanguage;

    if (!this.plugin.settings.enableTranslation || this.plugin.settings.translationProvider === "none") {
      new Notice("Translation disabled or provider not selected in settings.");
      return;
    }

    if (!targetLang) {
      new Notice("Target language for translation is not set in settings.");
      return;
    }

    let textToTranslate = "";
    try {
      const decodedContent = RendererUtils.decodeHtmlEntities(originalContent);
      if (RendererUtils.detectThinkingTags(decodedContent).hasThinkingTags) {
        textToTranslate = decodedContent.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      } else {
        textToTranslate = decodedContent.trim();
      }

      if (!textToTranslate) {
        new Notice("Nothing to translate (content might be empty after removing internal tags).");
        return;
      }
    } catch (error) {
      this.plugin.logger.error("[handleTranslateClick] Error during text preprocessing:", error);
      new Notice("Failed to prepare text for translation.");
      return;
    }

    contentEl.querySelector(`.${CSS_CLASS_TRANSLATION_CONTAINER}`)?.remove();

    const originalIcon = buttonEl.querySelector(".svg-icon")?.getAttribute("icon-name") || "languages";
    setIcon(buttonEl, "loader");
    buttonEl.disabled = true;
    buttonEl.classList.add(CSS_CLASS_TRANSLATION_PENDING);
    const originalTitle = buttonEl.title;
    buttonEl.setAttribute("title", "Translating...");
    buttonEl.addClass("button-loading");

    try {
      const translatedText = await this.plugin.translationService.translate(textToTranslate, targetLang);

      if (!contentEl || !contentEl.isConnected) {
        this.plugin.logger.error(
          "[handleTranslateClick] contentEl is null or not connected to DOM when translation arrived."
        );

        return;
      }

      if (translatedText !== null) {
        const translationContainer = contentEl.createDiv({ cls: CSS_CLASS_TRANSLATION_CONTAINER });

        const translationContentEl = translationContainer.createDiv({ cls: CSS_CLASS_TRANSLATION_CONTENT });

        await MarkdownRenderer.render(
          this.app,
          translatedText,
          translationContentEl,
          this.plugin.app.vault.getRoot()?.path ?? "",
          this
        );

        RendererUtils.fixBrokenTwemojiImages(translationContentEl);

        const targetLangName = LANGUAGES[targetLang] || targetLang;
        translationContainer.createEl("div", {
          cls: "translation-indicator",
          text: `[Translated to ${targetLangName}]`,
        });

        this.guaranteedScrollToBottom(50, false);
      }
    } catch (error) {
      this.plugin.logger.error("[OllamaView] Unexpected error during message translation call:", error);
    } finally {
      if (buttonEl?.isConnected) {
        setIcon(buttonEl, originalIcon);
        buttonEl.disabled = false;
        buttonEl.classList.remove(CSS_CLASS_TRANSLATION_PENDING);
        buttonEl.setAttribute("title", originalTitle);
        buttonEl.removeClass("button-loading");
      }
    }
  }

  private renderDateSeparator(date: Date): void {
    if (!this.chatContainer) return;
    this.chatContainer.createDiv({
      cls: CSS_CLASS_DATE_SEPARATOR,
      text: this.formatDateSeparator(date),
    });
  }

  private initSpeechWorker(): void {
    try {
      const bufferToBase64 = (buffer: ArrayBuffer): string => {
        let binary = "";
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      };

      const workerCode = `
             
             self.onmessage = async (event) => {
                 const { apiKey, audioBlob, languageCode = 'uk-UA' } = event.data;

                 if (!apiKey || apiKey.trim() === '') {
                     self.postMessage({ error: true, message: 'Google API Key is not configured. Please add it in plugin settings.' });
                     return;
                 }

                 const url = "https:

                 try {
                     const arrayBuffer = await audioBlob.arrayBuffer();

                     
                     
                     let base64Audio;
                     if (typeof TextDecoder !== 'undefined') { 
                             
                             const base64String = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                             base64Audio = base64String;

                     } else {
                             
                             base64Audio = btoa(
                                 new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                             );
                     }


                     const response = await fetch(url, {
                         method: 'POST',
                         body: JSON.stringify({
                             config: {
                                 encoding: 'WEBM_OPUS', 
                                 sampleRateHertz: 48000, 
                                 languageCode: languageCode,
                                 model: 'latest_long', 
                                 enableAutomaticPunctuation: true,
                             },
                             audio: { content: base64Audio },
                         }),
                         headers: { 'Content-Type': 'application/json' },
                     });

                     const responseData = await response.json();

                     if (!response.ok) {
                         
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
                         self.postMessage(transcript); 
                     } else {
                         
                         self.postMessage({ error: true, message: 'No speech detected or recognized.' });
                     }
                 } catch (error) {
                     
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
      URL.revokeObjectURL(workerUrl);

      this.setupSpeechWorkerHandlers();
    } catch (error) {
      new Notice("Speech recognition feature failed to initialize.");
      this.speechWorker = null;
    }
  }
  private setupSpeechWorkerHandlers(): void {
    if (!this.speechWorker) return;

    this.speechWorker.onmessage = event => {
      const data = event.data;

      if (data && typeof data === "object" && data.error) {
        new Notice(`Speech Recognition Error: ${data.message}`);
        this.updateInputPlaceholder(this.plugin.settings.modelName);
        this.updateSendButtonState();
        return;
      }

      if (typeof data === "string" && data.trim()) {
        const transcript = data.trim();
        this.insertTranscript(transcript);
      } else if (typeof data !== "string") {
      }

      this.updateSendButtonState();
    };

    this.speechWorker.onerror = error => {
      new Notice("An unexpected error occurred in the speech recognition worker.");
      this.updateInputPlaceholder(this.plugin.settings.modelName);

      this.stopVoiceRecording(false);
    };
  }
  private insertTranscript(transcript: string): void {
    if (!this.inputEl) return;

    const currentVal = this.inputEl.value;
    const start = this.inputEl.selectionStart ?? currentVal.length;
    const end = this.inputEl.selectionEnd ?? currentVal.length;

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

    const newCursorPos = start + textToInsert.length;
    this.inputEl.setSelectionRange(newCursorPos, newCursorPos);

    this.inputEl.focus();
    this.inputEl.dispatchEvent(new Event("input"));
  }
  private async toggleVoiceRecognition(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.stopVoiceRecording(true);
    } else {
      await this.startVoiceRecognition();
    }
  }
  private async startVoiceRecognition(): Promise<void> {
    if (!this.speechWorker) {
      new Notice("Функція розпізнавання мовлення недоступна (worker не ініціалізовано).");

      return;
    }

    const speechApiKey = this.plugin.settings.googleApiKey;
    if (!speechApiKey) {
      new Notice(
        "Ключ Google API для розпізнавання мовлення не налаштовано. Будь ласка, додайте його в налаштуваннях плагіна."
      );
      return;
    }

    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      let recorderOptions: MediaRecorderOptions | undefined;
      const preferredMimeType = "audio/webm;codecs=opus";

      if (MediaRecorder.isTypeSupported(preferredMimeType)) {
        recorderOptions = { mimeType: preferredMimeType };
      } else {
        recorderOptions = undefined;
      }

      this.mediaRecorder = new MediaRecorder(this.audioStream, recorderOptions);

      const audioChunks: Blob[] = [];

      this.voiceButton?.classList.add(CSS_CLASS_RECORDING);
      setIcon(this.voiceButton, "stop-circle");
      this.inputEl.placeholder = "Recording... Speak now.";

      this.mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      this.mediaRecorder.onstop = () => {
        if (this.speechWorker && audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, {
            type: this.mediaRecorder?.mimeType || "audio/webm",
          });

          this.inputEl.placeholder = "Processing speech...";
          this.speechWorker.postMessage({
            apiKey: speechApiKey,
            audioBlob,
            languageCode: this.plugin.settings.speechLanguage || "uk-UA",
          });
        } else if (audioChunks.length === 0) {
          this.getCurrentRoleDisplayName().then(roleName => this.updateInputPlaceholder(roleName));
          this.updateSendButtonState();
        }
      };
      this.mediaRecorder.onerror = event => {
        new Notice("An error occurred during recording.");
        this.stopVoiceRecording(false);
      };

      this.mediaRecorder.start();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        new Notice("Microphone access denied. Please grant permission.");
      } else if (error instanceof DOMException && error.name === "NotFoundError") {
        new Notice("Microphone not found. Please ensure it's connected and enabled.");
      } else {
        new Notice("Could not start voice recording.");
      }
      this.stopVoiceRecording(false);
    }
  }
  private stopVoiceRecording(processAudio: boolean): void {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.stop();
    } else if (!processAudio && this.mediaRecorder?.state === "inactive") {
    }

    this.voiceButton?.classList.remove(CSS_CLASS_RECORDING);
    setIcon(this.voiceButton, "mic");

    this.getCurrentRoleDisplayName().then(roleName => this.updateInputPlaceholder(roleName));
    this.updateSendButtonState();

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    this.mediaRecorder = null;
  }

  public checkAllMessagesForCollapsing(): void {
    this.chatContainer?.querySelectorAll<HTMLElement>(`.${CSS_CLASS_MESSAGE}`).forEach(msgEl => {
      this.checkMessageForCollapsing(msgEl);
    });
  }

  private toggleMessageCollapse(contentEl: HTMLElement, buttonEl: HTMLButtonElement): void {
    const maxHeightLimit = this.plugin.settings.maxMessageHeight;

    const isInitialExpandedState = buttonEl.hasAttribute("data-initial-state");

    if (isInitialExpandedState) {
      buttonEl.removeAttribute("data-initial-state");

      contentEl.style.maxHeight = `${maxHeightLimit}px`;
      contentEl.classList.add(CSS_CLASS_CONTENT_COLLAPSED);
      buttonEl.setText("Show More ▼");

      setTimeout(() => {
        contentEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 310);
    } else {
      const isCollapsed = contentEl.classList.contains(CSS_CLASS_CONTENT_COLLAPSED);

      if (isCollapsed) {
        contentEl.style.maxHeight = "";
        contentEl.classList.remove(CSS_CLASS_CONTENT_COLLAPSED);
        buttonEl.setText("Show Less ▲");
      } else {
        contentEl.style.maxHeight = `${maxHeightLimit}px`;
        contentEl.classList.add(CSS_CLASS_CONTENT_COLLAPSED);
        buttonEl.setText("Show More ▼");

        setTimeout(() => {
          contentEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 310);
      }
    }
  }

  public getChatContainer(): HTMLElement {
    return this.chatContainer;
  }

  private clearChatContainerInternal(): void {
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
    this.clearChatContainerInternal();
    this.showEmptyState();
    this.updateSendButtonState();
    setTimeout(() => this.focusInput(), 50);
  }

  public scrollToBottom(): void {
    this.guaranteedScrollToBottom(50, true);
  }
  public clearInputField(): void {
    if (this.inputEl) {
      this.inputEl.value = "";
      this.inputEl.dispatchEvent(new Event("input"));
    }
  }
  public focusInput(): void {
    setTimeout(() => {
      this.inputEl?.focus();
    }, 0);
  }

  guaranteedScrollToBottom(delay = 50, forceScroll = false): void {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
    this.scrollTimeout = setTimeout(() => {
      requestAnimationFrame(() => {
        if (this.chatContainer) {
          const threshold = 100;
          const isScrolledUp =
            this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight >
            threshold;

          if (isScrolledUp !== this.userScrolledUp) {
            this.userScrolledUp = isScrolledUp;

            if (!isScrolledUp) this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
          }

          if (forceScroll || !this.userScrolledUp || this.isProcessing) {
            const behavior = this.isProcessing ? "auto" : "smooth";
            this.chatContainer.scrollTo({
              top: this.chatContainer.scrollHeight,
              behavior: behavior,
            });

            if (forceScroll) {
              this.userScrolledUp = false;
              this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
            }
          }
        } else {
        }
      });
      this.scrollTimeout = null;
    }, delay);
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
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
      });
  }
  formatRelativeDate(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return "Invalid date";
    }
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
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    }
  }
  isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  private formatChatToMarkdown(messagesToFormat: Message[]): string {
    let localLastDate: Date | null = null;
    const exportTimestamp = new Date();
    let markdown = `# AI Forge Chat Export\n` + `> Exported on: ${exportTimestamp.toLocaleString(undefined)}\n\n`;

    messagesToFormat.forEach(message => {
      if (!message.content?.trim()) return;

      if (localLastDate === null || !this.isSameDay(localLastDate, message.timestamp)) {
        if (localLastDate !== null) markdown += `***\n`;
        markdown += `**${this.formatDateSeparator(message.timestamp)}**\n***\n\n`;
      }
      localLastDate = message.timestamp;

      const time = this.formatTime(message.timestamp);
      let prefix = "";
      let contentPrefix = "";
      let content = message.content.trim();

      if (message.role === "assistant") {
        content = RendererUtils.decodeHtmlEntities(content)
          .replace(/<think>[\s\S]*?<\/think>/g, "")
          .trim();

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
          break;
        case "error":
          prefix = `> [!ERROR] Error (${time}):\n> `;
          contentPrefix = "> ";
          break;
      }
      markdown += prefix;
      if (contentPrefix) {
        markdown +=
          content
            .split("\n")
            .map(line => (line.trim() ? `${contentPrefix}${line}` : contentPrefix.trim()))
            .join(`\n`) + "\n\n";
      } else if (content.includes("```")) {
        content = content.replace(/(\n*\s*)```/g, "\n\n```").replace(/```(\s*\n*)/g, "```\n\n");
        markdown += content.trim() + "\n\n";
      } else {
        markdown +=
          content
            .split("\n")
            .map(line => (line.trim() ? line : ""))
            .join("\n") + "\n\n";
      }
    });
    return markdown.trim();
  }

  private async getCurrentRoleDisplayName(): Promise<string> {
    try {
      const activeChat = await this.plugin.chatManager?.getActiveChat();

      const rolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;

      if (rolePath) {
        const allRoles = await this.plugin.listRoleFiles(true);

        const foundRole = allRoles.find(role => role.path === rolePath);

        if (foundRole) {
          return foundRole.name;
        } else {
          console.warn(`Role with path "${rolePath}" not found in listRoleFiles results.`);

          return rolePath.split("/").pop()?.replace(".md", "") || "Selected Role";
        }
      }
    } catch (error) {
      console.error("Error getting current role display name:", error);
    }

    return "None";
  }

  private handleRoleDisplayClick = async (event: MouseEvent) => {
    const menu = new Menu();
    let itemsAdded = false;

    try {
      const roles = await this.plugin.listRoleFiles(true);
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      const currentRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;

      menu.addItem(item => {
        item
          .setTitle("None")
          .setIcon(!currentRolePath ? "check" : "slash")
          .onClick(async () => {
            const newRolePath = "";
            if (currentRolePath !== newRolePath) {
              if (activeChat) {
                await this.plugin.chatManager.updateActiveChatMetadata({
                  selectedRolePath: newRolePath,
                });
              } else {
                this.plugin.settings.selectedRolePath = newRolePath;
                await this.plugin.saveSettings();

                this.plugin.emit("role-changed", "None");
                this.plugin.promptService?.clearRoleCache?.();
              }
            }
          });
        itemsAdded = true;
      });

      if (roles.length > 0) {
        menu.addSeparator();
        itemsAdded = true;
      }

      roles.forEach(roleInfo => {
        menu.addItem(item => {
          item
            .setTitle(roleInfo.name)
            .setIcon(roleInfo.path === currentRolePath ? "check" : roleInfo.isCustom ? "user" : "file-text")
            .onClick(async () => {
              const newRolePath = roleInfo.path;
              if (currentRolePath !== newRolePath) {
                if (activeChat) {
                  await this.plugin.chatManager.updateActiveChatMetadata({
                    selectedRolePath: newRolePath,
                  });
                } else {
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
      console.error("Error loading roles for role selection menu:", error);

      if (!itemsAdded) {
        menu.addItem(item => item.setTitle("Error loading roles").setDisabled(true));
        itemsAdded = true;
      }
      new Notice("Failed to load roles.");
    } finally {
      if (itemsAdded) {
        menu.showAtMouseEvent(event);
      } else {
      }
    }
  };

  private handleTemperatureClick = async (): Promise<void> => {
    const activeChat = await this.plugin.chatManager?.getActiveChat();

    if (!activeChat) {
      new Notice("Select or create a chat to change temperature.");

      return;
    }

    const currentTemp = activeChat.metadata.temperature ?? this.plugin.settings.temperature;
    const currentTempString = currentTemp !== null && currentTemp !== undefined ? String(currentTemp) : "";

    new PromptModal(
      this.app,
      "Set Temperature",
      `Enter new temperature (e.g., 0.7). Higher values = more creative, lower = more focused.`,
      currentTempString,
      async newValue => {
        if (newValue === null || newValue.trim() === "") {
          new Notice("Temperature change cancelled.");
          return;
        }

        const newTemp = parseFloat(newValue.trim());

        if (isNaN(newTemp) || newTemp < 0 || newTemp > 2.0) {
          new Notice("Invalid temperature. Please enter a number between 0.0 and 2.0.", 4000);
          return;
        }

        try {
          await this.plugin.chatManager.updateActiveChatMetadata({
            temperature: newTemp,
          });
          this.updateTemperatureIndicator(newTemp);
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

    const tempValue = temperature ?? this.plugin.settings.temperature;

    const emoji = this.getTemperatureEmoji(tempValue);
    this.temperatureIndicatorEl.setText(emoji);
    this.temperatureIndicatorEl.title = `Temperature: ${tempValue.toFixed(1)}. Click to change.`;
  }

  private getTemperatureEmoji(temperature: number): string {
    if (temperature <= 0.4) {
      return "🧊";
    } else if (temperature > 0.4 && temperature <= 0.6) {
      return "🙂";
    } else {
      return "🤪";
    }
  }

  private updateToggleViewLocationOption(): void {
    this.dropdownMenuManager?.updateToggleViewLocationOption();
  }

  public handleToggleViewLocationClick = async (): Promise<void> => {
    this.dropdownMenuManager?.closeMenu();
    const currentSetting = this.plugin.settings.openChatInTab;
    const newSetting = !currentSetting;

    this.plugin.settings.openChatInTab = newSetting;
    await this.plugin.saveSettings();

    this.app.workspace.detachLeavesOfType(VIEW_TYPE_OLLAMA_PERSONAS);

    setTimeout(() => {
      this.plugin.activateView();
    }, 50);
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

  private updateChatPanelList = async (): Promise<void> => {
    const container = this.chatPanelListEl;
    if (!container || !this.plugin.chatManager) {
      return;
    }

    if (this.chatPanelHeaderEl?.getAttribute("data-collapsed") === "true") {
      return;
    }

    const currentScrollTop = container.scrollTop;
    container.empty();

    try {
      const chats: ChatMetadata[] = this.plugin.chatManager.listAvailableChats() || [];
      const currentActiveId = this.plugin.chatManager.getActiveChatId();

      if (chats.length === 0) {
        container.createDiv({ cls: "menu-info-text", text: "No saved chats yet." });
      } else {
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

          const lastModifiedDate = new Date(chatMeta.lastModified);

          const dateText = !isNaN(lastModifiedDate.getTime())
            ? this.formatRelativeDate(lastModifiedDate)
            : "Invalid date";
          if (dateText === "Invalid date") {
            this.plugin.logger.warn(
              `[updateChatPanelList] Invalid date parsed for chat ${chatMeta.id}, lastModified: ${chatMeta.lastModified}`
            );
          }
          textWrapper.createDiv({ cls: "chat-panel-item-date", text: dateText });

          const optionsBtn = chatOptionEl.createEl("button", {
            cls: [CSS_CHAT_ITEM_OPTIONS, "clickable-icon"],
            attr: { "aria-label": "Chat options", title: "More options" },
          });
          setIcon(optionsBtn, "lucide-more-horizontal");

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
    } catch (error) {
      this.plugin.logger.error("[updateChatPanelList] Error rendering chat panel list:", error);
      container.empty();
      container.createDiv({ text: "Error loading chats.", cls: "menu-error-text" });
    } finally {
      requestAnimationFrame(() => {
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
      if (otherHeaderEl.getAttribute("data-collapsed") === "false") {
        const otherIconEl = otherHeaderEl.querySelector<HTMLElement>(`.${CSS_SIDEBAR_SECTION_ICON}`);
        otherHeaderEl.setAttribute("data-collapsed", "true");
        if (otherIconEl) setIcon(otherIconEl, collapseIcon);
        otherContentEl.classList.remove(expandedClass);

        if (otherSectionType === "chats" && this.newChatSidebarButton) this.newChatSidebarButton.hide();
      }

      clickedHeaderEl.setAttribute("data-collapsed", "false");
      setIcon(iconEl, expandIcon);
      if (sectionType === "chats" && this.newChatSidebarButton) this.newChatSidebarButton.show();
      try {
        await updateFunction();

        contentEl.classList.add(expandedClass);
      } catch (error) {
        this.plugin.logger.error(`Error updating sidebar section ${sectionType}:`, error);
        contentEl.setText(`Error loading ${sectionType}.`);
        contentEl.classList.add(expandedClass);
      }
    } else {
      clickedHeaderEl.setAttribute("data-collapsed", "true");
      setIcon(iconEl, collapseIcon);

      contentEl.classList.remove(expandedClass);

      if (sectionType === "chats" && this.newChatSidebarButton) {
        this.newChatSidebarButton.hide();
      }
    }
  }

  private showChatContextMenu(event: MouseEvent, chatMeta: ChatMetadata): void {
    event.preventDefault();
    const menu = new Menu();

    menu.addItem(item =>
      item
        .setTitle("Clone Chat")
        .setIcon("lucide-copy-plus")
        .onClick(() => this.handleContextMenuClone(chatMeta.id))
    );

    menu.addItem(item =>
      item
        .setTitle("Rename Chat")
        .setIcon("lucide-pencil")
        .onClick(() => this.handleContextMenuRename(chatMeta.id, chatMeta.name))
    );

    menu.addItem(item =>
      item
        .setTitle("Export to Note")
        .setIcon("lucide-download")
        .onClick(() => this.exportSpecificChat(chatMeta.id))
    );

    menu.addSeparator();

    menu.addItem(item => {
      item
        .setTitle("Clear Messages")
        .setIcon("lucide-trash")
        .onClick(() => this.handleContextMenuClear(chatMeta.id, chatMeta.name));
      try {
        (item as any).el.addClass("danger-option");
      } catch (e) {
        this.plugin.logger.error("Failed to add danger class using item.el/dom:", e, item);
      }
    });

    menu.addItem(item => {
      item
        .setTitle("Delete Chat")
        .setIcon("lucide-trash-2")
        .onClick(() => this.handleContextMenuDelete(chatMeta.id, chatMeta.name));
      try {
        (item as any).el.addClass("danger-option");
      } catch (e) {
        this.plugin.logger.error("Failed to add danger class using item.el/dom:", e, item);
      }
    });

    menu.showAtMouseEvent(event);
  }

  private async handleContextMenuClone(chatId: string): Promise<void> {
    const cloningNotice = new Notice("Cloning chat...", 0);
    try {
      const clonedChat = await this.plugin.chatManager.cloneChat(chatId);
      if (clonedChat) {
        new Notice(`Chat cloned as "${clonedChat.metadata.name}" and activated.`);
      } else {
      }
    } catch (error) {
      this.plugin.logger.error(`Context menu: Error cloning chat ${chatId}:`, error);
      new Notice("Error cloning chat.");
    } finally {
      cloningNotice.hide();
    }
  }

  private async exportSpecificChat(chatId: string): Promise<void> {
    const exportingNotice = new Notice(`Exporting chat...`, 0);
    try {
      const chat = await this.plugin.chatManager.getChat(chatId);
      if (!chat || chat.messages.length === 0) {
        new Notice("Chat is empty or not found, nothing to export.");
        exportingNotice.hide();
        return;
      }

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
    new ConfirmModal(
      this.app,
      "Confirm Clear Messages",
      `Are you sure you want to clear all messages in chat "${chatName}"?\nThis action cannot be undone.`,
      async () => {
        const clearingNotice = new Notice("Clearing messages...", 0);
        try {
          const success = await this.plugin.chatManager.clearChatMessagesById(chatId);

          if (success) {
            new Notice(`Messages cleared for chat "${chatName}".`);
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
    new ConfirmModal(
      this.app,
      "Confirm Delete Chat",
      `Are you sure you want to delete chat "${chatName}"?\nThis action cannot be undone.`,
      async () => {
        const deletingNotice = new Notice("Deleting chat...", 0);
        try {
          const success = await this.plugin.chatManager.deleteChat(chatId);
          if (success) {
            new Notice(`Chat "${chatName}" deleted.`);
          } else {
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

  private isChatScrolledUp(): boolean {
    if (!this.chatContainer) return false;

    const scrollableDistance = this.chatContainer.scrollHeight - this.chatContainer.clientHeight;
    if (scrollableDistance <= 0) return false;

    const distanceFromBottom = scrollableDistance - this.chatContainer.scrollTop;
    return distanceFromBottom >= SCROLL_THRESHOLD;
  }

  private updateScrollStateAndIndicators(): void {
    if (!this.chatContainer) return;

    const wasScrolledUp = this.userScrolledUp;
    this.userScrolledUp = this.isChatScrolledUp();

    this.scrollToBottomButton?.classList.toggle(CSS_CLASS_VISIBLE, this.userScrolledUp);

    if (wasScrolledUp && !this.userScrolledUp) {
      this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
    }
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

  public async handleSummarizeClick(originalContent: string, buttonEl: HTMLButtonElement): Promise<void> {
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

    const originalIcon = buttonEl.querySelector(".svg-icon")?.getAttribute("icon-name") || "scroll-text";
    setIcon(buttonEl, "loader");
    buttonEl.disabled = true;
    const originalTitle = buttonEl.title;
    buttonEl.title = "Summarizing...";
    buttonEl.addClass(CSS_CLASS_DISABLED);

    buttonEl.addClass("button-loading");

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

      const responseData: OllamaGenerateResponse = await this.plugin.ollamaService.generateRaw(requestBody);

      if (responseData && responseData.response) {
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
      setIcon(buttonEl, originalIcon);
      buttonEl.disabled = false;
      buttonEl.title = originalTitle;
      buttonEl.removeClass(CSS_CLASS_DISABLED);
      buttonEl.removeClass("button-loading");
    }
  }

  /**
   * Створює нову групу для відображення помилок або оновлює існуючу.
   * Тепер використовує ErrorMessageRenderer для створення візуального блоку.
   * @param isContinuing Чи це продовження попередньої послідовності помилок.
   */
  private renderOrUpdateErrorGroup(isContinuing: boolean): void {
    if (!this.chatContainer) return;

    const errorsToDisplay = [...this.consecutiveErrorMessages];
    if (errorsToDisplay.length === 0) {
      return;
    }
    const errorCount = errorsToDisplay.length;
    const lastError = errorsToDisplay[errorCount - 1];

    let groupEl: HTMLElement;
    let contentContainer: HTMLElement | null = null;

    if (isContinuing && this.errorGroupElement) {
      groupEl = this.errorGroupElement;

      contentContainer = groupEl.querySelector(`.${CSS_CLASS_ERROR_TEXT}`);
      if (contentContainer) {
        contentContainer.empty();
      } else {
        this.plugin.logger.error("[renderOrUpdateErrorGroup] Could not find error text container in existing group!");

        return;
      }
      this.updateErrorGroupTimestamp(groupEl, lastError.timestamp);
    } else {
      this.hideEmptyState();
      this.isSummarizingErrors = false;

      const renderer = new ErrorMessageRenderer(this.app, this.plugin, lastError, this);
      groupEl = renderer.render();
      contentContainer = groupEl.querySelector(`.${CSS_CLASS_ERROR_TEXT}`);

      this.chatContainer.appendChild(groupEl);
      this.errorGroupElement = groupEl;
      this.lastMessageElement = groupEl;
    }

    if (contentContainer) {
      if (errorCount === 1) {
        contentContainer.setText(lastError.content);
      } else {
        contentContainer.setText(`Multiple errors occurred (${errorCount}). Summarizing...`);
        if (!this.isSummarizingErrors) {
          this.triggerErrorSummarization(groupEl, errorsToDisplay);
        }
      }
    } else {
      this.plugin.logger.error("[renderOrUpdateErrorGroup] Failed to find/create content container for error group.");
    }

    this.guaranteedScrollToBottom(50, true);
  }

  private updateErrorGroupTimestamp(groupEl: HTMLElement, timestamp: Date): void {
    groupEl.setAttribute("data-timestamp", timestamp.getTime().toString());
    const timestampEl = groupEl.querySelector(`.${CSS_CLASSES.TIMESTAMP}`);
    if (timestampEl) {
      timestampEl.setText(this.formatTime(timestamp));
    }
  }

  private async triggerErrorSummarization(targetGroupElement: HTMLElement, errors: Message[]): Promise<void> {
    const ENABLE_ERROR_SUMMARIZATION = false;

    if (!ENABLE_ERROR_SUMMARIZATION) {
      this.displayErrorListFallback(targetGroupElement, errors);

      return;
    }

    if (!this.plugin.settings.summarizationModelName || this.isSummarizingErrors) {
      if (!this.plugin.settings.summarizationModelName)
        if (this.isSummarizingErrors) this.displayErrorListFallback(targetGroupElement, errors);
      return;
    }

    this.isSummarizingErrors = true;

    try {
      const summary = await this.summarizeErrors(errors);
      const contentContainer = targetGroupElement.querySelector(`.${CSS_CLASSES.ERROR_TEXT}`) as HTMLElement;

      if (!contentContainer || !contentContainer.isConnected) {
        this.plugin.logger.warn(
          "[triggerErrorSummarization] Error content container disappeared before summarization finished."
        );

        return;
      }

      contentContainer.empty();

      if (summary) {
        contentContainer.setText(`Multiple errors occurred. Summary:\n${summary}`);
      } else {
        this.plugin.logger.warn(
          "[triggerErrorSummarization] Summarization failed or returned empty. Displaying list fallback."
        );
        this.displayErrorListFallback(targetGroupElement, errors);
      }
    } catch (error) {
      this.plugin.logger.error("[triggerErrorSummarization] Unexpected error during summarization process:", error);
      this.displayErrorListFallback(targetGroupElement, errors);
    } finally {
      this.isSummarizingErrors = false;
    }
  }

  private displayErrorListFallback(targetGroupElement: HTMLElement, errors: Message[]): void {
    const contentContainer = targetGroupElement.querySelector(`.${CSS_CLASSES.ERROR_TEXT}`) as HTMLElement;

    if (!contentContainer || !contentContainer.isConnected) {
      if (!targetGroupElement.isConnected) {
      }
      return;
    }

    contentContainer.empty();
    const uniqueErrors = Array.from(new Set(errors.map(e => e.content.trim())));
    contentContainer.createDiv({
      text: `Multiple errors occurred (${errors.length} total, ${uniqueErrors.length} unique):`,
      cls: "error-summary-header",
    });

    const listEl = contentContainer.createEl("ul");
    listEl.style.marginTop = "5px";
    listEl.style.paddingLeft = "20px";
    listEl.style.listStyle = "disc";

    uniqueErrors.forEach(errorMsg => {
      const listItem = listEl.createEl("li");
      listItem.textContent = errorMsg;
    });

    this.guaranteedScrollToBottom(50, true);
  }

  /**
   * Виконує сумаризацію списку повідомлень про помилки за допомогою Ollama.
   * @param errors Масив повідомлень про помилки.
   * @returns Рядок з сумаризацією або null у разі помилки.
   */
  private async summarizeErrors(errors: Message[]): Promise<string | null> {
    const modelName = this.plugin.settings.summarizationModelName;
    if (!modelName) return null;

    if (errors.length < 2) return errors[0]?.content || null;

    const uniqueErrorContents = Array.from(new Set(errors.map(e => e.content.trim())));
    const errorsText = uniqueErrorContents.map((msg, index) => `Error ${index + 1}: ${msg}`).join("\n");
    const prompt = `Concisely summarize the following ${uniqueErrorContents.length} unique error messages reported by the system. Focus on the core issue(s):\n\n${errorsText}\n\nSummary:`;

    const requestBody = {
      model: modelName,
      prompt: prompt,
      stream: false,
      temperature: 0.2,
      options: {
        num_ctx: this.plugin.settings.contextWindow > 1024 ? 1024 : this.plugin.settings.contextWindow,
      },
      system: "You are an assistant that summarizes lists of technical error messages accurately and concisely.",
    };

    try {
      this.plugin.logger.debug(
        `[summarizeErrors] Sending request to model ${modelName}. Prompt length: ${prompt.length}`
      );
      const responseData: OllamaGenerateResponse = await this.plugin.ollamaService.generateRaw(requestBody);
      if (responseData && responseData.response) {
        return responseData.response.trim();
      } else {
        return null;
      }
    } catch (error) {
      this.plugin.logger.error("[summarizeErrors] Failed to summarize errors:", error);
      return null;
    }
  }

  private handleErrorMessage(errorMessage: Message): void {
    if (errorMessage.role !== "error") {
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
      } catch {}
    }
  }

 // OllamaView.ts
 async sendMessage(): Promise<void> {
  const content = this.inputEl.value.trim();

  if (!content || this.isProcessing || this.sendButton.disabled || this.currentAbortController !== null) {
    this.plugin.logger.warn(
      `sendMessage: Aborted. Content: ${!!content}, Processing: ${this.isProcessing}, SendDisabled: ${
        this.sendButton.disabled // Додано перевірку this.sendButton перед доступом до disabled
      }, AbortCtrl: ${!!this.currentAbortController}`
    );
    return;
  }

  const activeChat = await this.plugin.chatManager?.getActiveChat();
  if (!activeChat) {
    new Notice("Error: No active chat session found.");
    this.plugin.logger.error("sendMessage: No active chat found.");
    return;
  }

  const userMessageContent = this.inputEl.value; 
  this.clearInputField();
  this.setLoadingState(true);
  this.hideEmptyState();

  this.currentAbortController = new AbortController();
  let accumulatedResponse = "";
  const responseStartTime = new Date(); // Час початку генерації відповіді ШІ
  const responseStartTimeMs = responseStartTime.getTime();

  this.stopGeneratingButton?.show();
  this.sendButton?.hide();

  let streamErrorOccurred: Error | null = null;
  // Зберігаємо посилання на placeholder, що створюється ЦИМ викликом sendMessage
  let currentLocalPlaceholderRef: typeof this.activePlaceholder = null;


  try {
    // Додавання повідомлення користувача.
    // `handleMessageAdded` відрендерить його. Ми чекаємо, щоб UI оновився.
    this.plugin.logger.debug(`[sendMessage] Adding user message to chat: "${userMessageContent.substring(0,50)}..."`);
    const userMessageTimestamp = new Date(); // Унікальний timestamp для повідомлення користувача
    const userMessageAddedPromise = new Promise<void>((resolve) => {
      this.currentMessageAddedResolver = resolve;
    });
    // Важливо передати новий Date() для повідомлення користувача, щоб уникнути конфлікту timestamp'ів
    await this.plugin.chatManager.addMessageToActiveChat("user", userMessageContent, userMessageTimestamp);
    await userMessageAddedPromise;
    this.plugin.logger.debug("[sendMessage] User message processed by handleMessageAdded.");


    // Створюємо плейсхолдер для відповіді ШІ
    this.plugin.logger.debug(`[sendMessage] Creating placeholder for assistant response (timestamp: ${responseStartTimeMs}).`);
    const assistantPlaceholderGroupEl = this.chatContainer.createDiv({
      cls: `${CSS_CLASSES.MESSAGE_GROUP} ${CSS_CLASSES.OLLAMA_GROUP} placeholder`,
    });
    assistantPlaceholderGroupEl.setAttribute("data-placeholder-timestamp", responseStartTimeMs.toString());
    RendererUtils.renderAvatar(this.app, this.plugin, assistantPlaceholderGroupEl, false); // false для асистента
    const messageWrapperEl = assistantPlaceholderGroupEl.createDiv({ cls: "message-wrapper" });
    messageWrapperEl.style.order = "2"; // Аватар зліва для асистента
    const assistantMessageElement = messageWrapperEl.createDiv({
      cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.OLLAMA_MESSAGE}`,
    });
    const contentContainer = assistantMessageElement.createDiv({ cls: CSS_CLASSES.CONTENT_CONTAINER });
    const assistantContentEl = contentContainer.createDiv({
      cls: `${CSS_CLASSES.CONTENT} ${CSS_CLASSES.CONTENT_COLLAPSIBLE} streaming-text`,
    });
    assistantContentEl.empty(); 

    const dots = assistantContentEl.createDiv({ cls: CSS_CLASSES.THINKING_DOTS });
    for (let i = 0; i < 3; i++) dots.createDiv({ cls: CSS_CLASSES.THINKING_DOT });

    if (assistantPlaceholderGroupEl && assistantContentEl && messageWrapperEl) {
      this.activePlaceholder = {
        timestamp: responseStartTimeMs,
        groupEl: assistantPlaceholderGroupEl,
        contentEl: assistantContentEl,
        messageWrapper: messageWrapperEl,
      };
      currentLocalPlaceholderRef = this.activePlaceholder; 
      this.plugin.logger.debug(`[sendMessage] Placeholder created and activePlaceholder set for ts: ${responseStartTimeMs}.`);
    } else {
      this.plugin.logger.error("sendMessage: Failed to create all placeholder elements!");
      throw new Error("Failed to create placeholder elements for AI response.");
    }

    assistantPlaceholderGroupEl.classList.add(CSS_CLASSES.MESSAGE_ARRIVING);
    setTimeout(() => assistantPlaceholderGroupEl?.classList.remove(CSS_CLASSES.MESSAGE_ARRIVING), 500);
    this.guaranteedScrollToBottom(50, true);

    const stream = this.plugin.ollamaService.generateChatResponseStream(
      activeChat, // activeChat вже містить повідомлення користувача
      this.currentAbortController.signal
    );

    let firstChunk = true;
    for await (const chunk of stream) {
      if (this.currentAbortController.signal.aborted) {
          this.plugin.logger.debug("[sendMessage] Stream aborted by user during iteration.");
          throw new Error("aborted by user"); 
      }

      if ("error" in chunk && chunk.error) {
        if (!chunk.error.includes("aborted by user")) {
          this.plugin.logger.error(`[sendMessage] Stream error: ${chunk.error}`);
          throw new Error(chunk.error);
        } else {
           throw new Error("aborted by user");
        }
      }

      if ("response" in chunk && chunk.response) {
        if (this.activePlaceholder?.timestamp === responseStartTimeMs && this.activePlaceholder.contentEl) {
          if (firstChunk) {
              const thinkingDots = this.activePlaceholder.contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
              if (thinkingDots) thinkingDots.remove();
              firstChunk = false;
          }
          accumulatedResponse += chunk.response;
          try {
            await AssistantMessageRenderer.renderAssistantContent(
              this.activePlaceholder.contentEl,
              accumulatedResponse,
              this.app,
              this.plugin,
              this
            );
          } catch (renderError: any) {
            this.plugin.logger.error("[sendMessage] Error during streaming render:", renderError);
            if (this.activePlaceholder?.contentEl) {
              this.activePlaceholder.contentEl.setText(
                `[Render Error: ${renderError.message}]`
              );
            }
          }
          this.guaranteedScrollToBottom(50, true); 
        } else {
          this.plugin.logger.warn(`[sendMessage] activePlaceholder mismatch or contentEl missing during stream. Current ts: ${this.activePlaceholder?.timestamp}, expected: ${responseStartTimeMs}. Accumulated chunk anyway.`);
          accumulatedResponse += chunk.response;
        }
      }
      if ("done" in chunk && chunk.done) {
        this.plugin.logger.debug("[sendMessage] Stream finished (done chunk received).");
        break;
      }
    }
  } catch (error: any) {
    streamErrorOccurred = error; 
    this.plugin.logger.error("[sendMessage] Error caught during stream OR user message add:", streamErrorOccurred);
  }

  // Обробка результатів стрімінгу (помилка або успішне завершення)
  try {
    if (streamErrorOccurred) {
      this.plugin.logger.error(`[sendMessage] Handling stream error: ${streamErrorOccurred.message}`);
      // Якщо плейсхолдер, створений ЦИМ запитом, ще існує, видаляємо його.
      if (currentLocalPlaceholderRef?.groupEl?.isConnected && currentLocalPlaceholderRef.timestamp === responseStartTimeMs) {
        this.plugin.logger.debug(`[sendMessage] Removing local placeholder (ts: ${responseStartTimeMs}) due to stream error.`);
        currentLocalPlaceholderRef.groupEl.remove();
      }
      // Скидаємо this.activePlaceholder, якщо він стосувався цього запиту
      if (this.activePlaceholder?.timestamp === responseStartTimeMs) {
          this.activePlaceholder = null;
      }


      let errorMsgContent = `Error: ${streamErrorOccurred.message || "Unknown streaming error."}`;
      let errorMsgRole: "system" | "error" = "error";
      let savePartial = false;

      if (streamErrorOccurred.message === "aborted by user") {
        errorMsgContent = "Generation stopped.";
        errorMsgRole = "system";
        if (accumulatedResponse.trim()) savePartial = true;
      } else {
          new Notice(errorMsgContent, 5000); 
      }

      const errorAddedPromise = new Promise<void>(resolve => { this.currentMessageAddedResolver = resolve; });
      // Додаємо нове повідомлення про помилку/скасування. handleMessageAdded його відрендерить.
      await this.plugin.chatManager.addMessageToActiveChat(errorMsgRole, errorMsgContent, new Date());
      await errorAddedPromise;


      if (savePartial) {
        this.plugin.logger.debug("[sendMessage] Saving partial assistant response after user cancellation.");
        const partialAddedPromise = new Promise<void>(resolve => { this.currentMessageAddedResolver = resolve; });
        await this.plugin.chatManager.addMessageToActiveChat("assistant", accumulatedResponse, responseStartTime, false);
        await partialAddedPromise;
      }
    } else if (!accumulatedResponse.trim()) {
      // Відповідь порожня, але помилки стріму не було.
      this.plugin.logger.warn("[sendMessage] Assistant provided an empty response (no stream error).");
      // Якщо плейсхолдер, створений ЦИМ запитом, ще існує, видаляємо його.
      if (currentLocalPlaceholderRef?.groupEl?.isConnected && currentLocalPlaceholderRef.timestamp === responseStartTimeMs) {
        this.plugin.logger.debug(`[sendMessage] Removing local placeholder (ts: ${responseStartTimeMs}) due to empty response.`);
        currentLocalPlaceholderRef.groupEl.remove();
      }
      if (this.activePlaceholder?.timestamp === responseStartTimeMs) {
          this.activePlaceholder = null;
      }
      
      const emptyRespPromise = new Promise<void>(resolve => { this.currentMessageAddedResolver = resolve; });
      await this.plugin.chatManager.addMessageToActiveChat("system", "Assistant provided an empty response.", new Date());
      await emptyRespPromise;

    } else {
      // Успішне завершення стрімінгу, є відповідь
      this.plugin.logger.debug(
        `[sendMessage] Stream successful. Accumulated response length: ${accumulatedResponse.length}. Adding to ChatManager.`
      );
      // Додавання повідомлення до ChatManager. handleMessageAdded оновить плейсхолдер.
      // НЕ ПОТРІБНО AWAIT тут, оскільки handleMessageAdded зробить UI оновлення.
      // Важливо, щоб responseStartTime був тим самим, що й у плейсхолдера.
      this.plugin.chatManager.addMessageToActiveChat("assistant", accumulatedResponse, responseStartTime, false);
    }
  } catch (error: any) {
    this.plugin.logger.error("[sendMessage] Error caught in final processing/error handling block:", error);
    try {
      const finalErrorPromise = new Promise<void>(resolve => { this.currentMessageAddedResolver = resolve; });
      await this.plugin.chatManager.addMessageToActiveChat(
        "error",
        `Internal error after stream: ${error.message}`,
        new Date()
      );
      await finalErrorPromise;
    } catch (finalErrorErr) {
      this.plugin.logger.error("Failed to even add the FINAL error message during sendMessage:", finalErrorErr);
    }
  } finally {
    this.plugin.logger.debug(`[sendMessage] Entering finally block for request ${responseStartTimeMs}.`);

    if (this.currentMessageAddedResolver) {
      this.plugin.logger.warn(`[sendMessage] currentMessageAddedResolver was not nullified for ts ${responseStartTimeMs}. Nullifying now.`);
      // Не викликаємо, бо це може призвести до подвійного виклику, якщо вже був викликаний.
      // Просто очищуємо.
      this.currentMessageAddedResolver = null;
    }

    // Якщо this.activePlaceholder все ще вказує на плейсхолдер ЦЬОГО запиту,
    // це означає, що handleMessageAdded не зміг його обробити (наприклад, через помилку ДО додавання в ChatManager).
    // Видаляємо його, щоб уникнути "зависання".
    if (this.activePlaceholder?.timestamp === responseStartTimeMs) {
      this.plugin.logger.warn(`[sendMessage] Active placeholder for ts ${responseStartTimeMs} was not handled. Removing it in finally.`);
      if (this.activePlaceholder.groupEl?.isConnected) {
          this.activePlaceholder.groupEl.remove();
      }
      this.activePlaceholder = null;
    }

    this.setLoadingState(false);
    this.stopGeneratingButton?.hide();
    this.sendButton?.show();
    this.currentAbortController = null;
    this.updateSendButtonState();
    this.focusInput();
    this.plugin.logger.debug(`[sendMessage] Finished for request ${responseStartTimeMs}.`);
  }
}

  // OllamaView.ts
  private async handleMessageAdded(data: { chatId: string; message: Message }): Promise<void> {
    // Зберігаємо resolver локально і очищуємо глобальний ВІДРАЗУ,
    // щоб уникнути повторного використання одного й того ж resolver'а, якщо HMA викликається швидко.
    const localResolver = this.currentMessageAddedResolver;
    this.currentMessageAddedResolver = null; 

    try {
      if (!data || !data.message) {
        this.plugin.logger.error("[HMA] Invalid data received in handleMessageAdded.", data);
        if (localResolver) localResolver();
        return;
      }
      const { chatId: eventChatId, message } = data;
      const messageTimestampMs = message.timestamp.getTime();

      this.plugin.logger.info(
        `[HMA] <<< ENTERED >>> Chat: ${eventChatId}, Role: ${message.role}, Ts: ${messageTimestampMs}, Content: "${message.content.substring(0,50)}..."`
      );

      if (!this.chatContainer || !this.plugin.chatManager) {
        this.plugin.logger.error("[HMA] CRITICAL: Context (chatContainer or chatManager) missing!");
        if (localResolver) localResolver();
        return;
      }

      const activeChatId = this.plugin.chatManager.getActiveChatId();
      if (eventChatId !== activeChatId) {
        this.plugin.logger.debug(`[HMA] Event for non-active chat ${eventChatId} (current is ${activeChatId}). Ignoring UI update.`);
        if (localResolver) localResolver();
        return;
      }

      // Перевірка на дублікат в DOM (за фінальним data-timestamp, не плейсхолдером)
      const existingMessageElInDom = this.chatContainer.querySelector(`.${CSS_CLASSES.MESSAGE_GROUP}:not(.placeholder)[data-timestamp="${messageTimestampMs}"]`);
      if (existingMessageElInDom) {
          this.plugin.logger.warn(`[HMA] Message with ts ${messageTimestampMs} (Role: ${message.role}) already exists in DOM and is NOT a placeholder. Skipping add.`);
          if (localResolver) localResolver();
          return;
      }
      
      // Перевірка на дублікат в currentMessages (більш надійний спосіб уникнути подвійного рендерингу)
      const alreadyInCache = this.currentMessages.some(
        m => m.timestamp.getTime() === messageTimestampMs && m.role === message.role && m.content === message.content // Порівнюємо і контент для більшої точності
      );
      if (alreadyInCache) {
         this.plugin.logger.warn(`[HMA] Message with ts ${messageTimestampMs} (Role: ${message.role}) is already in currentMessages. Likely duplicate event or already handled. Content: "${message.content.substring(0,30)}"`);
         if (localResolver) localResolver();
         return;
      }

      // Головна логіка: обробка плейсхолдера або стандартне додавання
      if (message.role === "assistant" && this.activePlaceholder?.timestamp === messageTimestampMs) {
        this.plugin.logger.debug(
          `[HMA] Assistant message (ts: ${messageTimestampMs}) matches active placeholder. Updating placeholder in place.`
        );
        const placeholderToUpdate = this.activePlaceholder; // Зберігаємо локально перед очищенням
        this.activePlaceholder = null; // Очищуємо активний плейсхолдер, оскільки ми його зараз обробимо

        if (placeholderToUpdate.groupEl && placeholderToUpdate.groupEl.isConnected && placeholderToUpdate.contentEl && placeholderToUpdate.messageWrapper) {
          placeholderToUpdate.groupEl.classList.remove("placeholder");
          placeholderToUpdate.groupEl.removeAttribute("data-placeholder-timestamp");
          placeholderToUpdate.groupEl.setAttribute("data-timestamp", messageTimestampMs.toString()); 

          const messageDomElement = placeholderToUpdate.groupEl.querySelector(`.${CSS_CLASSES.MESSAGE}`) as HTMLElement | null;

          if (!messageDomElement) {
            this.plugin.logger.error("[HMA] Critical: Could not find .message element within placeholder group. Removing placeholder and adding normally.");
            placeholderToUpdate.groupEl.remove(); 
            await this.addMessageStandard(message); 
            if (localResolver) localResolver();
            return;
          }

          placeholderToUpdate.contentEl.classList.remove("streaming-text");
          const dotsEl = placeholderToUpdate.contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
          if (dotsEl) dotsEl.remove();

          try {
            await AssistantMessageRenderer.renderAssistantContent(
              placeholderToUpdate.contentEl,
              message.content,
              this.app,
              this.plugin,
              this
            );
            AssistantMessageRenderer.addAssistantActionButtons(
              placeholderToUpdate.messageWrapper, 
              placeholderToUpdate.contentEl,      
              message,
              this.plugin,
              this
            );
            BaseMessageRenderer.addTimestamp(messageDomElement, message.timestamp, this);

            this.lastMessageElement = placeholderToUpdate.groupEl; 
            this.currentMessages.push(message); 
            this.hideEmptyState();

            setTimeout(() => {
              if (placeholderToUpdate.groupEl.isConnected) {
                this.checkMessageForCollapsing(placeholderToUpdate.groupEl);
              }
            }, 50); // Даємо час DOM оновитися перед перевіркою
             this.guaranteedScrollToBottom(100, false);

          } catch (renderError: any) {
            this.plugin.logger.error("[HMA] Error during final render/update of placeholder:", renderError);
            if (placeholderToUpdate.groupEl.isConnected) { // Перевіряємо перед видаленням
                placeholderToUpdate.groupEl.remove(); 
            }
            this.handleErrorMessage({
              role: "error",
              content: `Failed to finalize assistant message display: ${renderError.message}`,
              timestamp: new Date(),
            });
          }
        } else {
          this.plugin.logger.error(
            `[HMA] Active placeholder for ts ${messageTimestampMs} was matched, but its groupEl is not connected or contentEl/messageWrapper missing. groupEl connected: ${placeholderToUpdate.groupEl?.isConnected}. Adding message normally.`
          );
          // this.activePlaceholder вже null
          await this.addMessageStandard(message);
        }
      } else if (message.role === "assistant" && this.activePlaceholder && this.activePlaceholder.timestamp !== messageTimestampMs) {
        this.plugin.logger.warn(`[HMA] Received assistant message (ts: ${messageTimestampMs}) but active placeholder is for a DIFFERENT request (ts: ${this.activePlaceholder.timestamp}). Adding current message normally.`);
        await this.addMessageStandard(message); // Додасть в currentMessages
      }
       else {
        if (message.role === "assistant" && !this.activePlaceholder) {
            this.plugin.logger.debug(`[HMA] No active placeholder for assistant message (ts: ${messageTimestampMs}). Adding normally.`);
        } else if (message.role !== "assistant") {
             this.plugin.logger.debug(`[HMA] Message is not from assistant (Role: ${message.role}, Ts: ${messageTimestampMs}). Adding normally.`);
        }
        await this.addMessageStandard(message); // Додасть в currentMessages
      }

      if (localResolver) {
        localResolver();
      }
      this.plugin.logger.info(
        `[HMA] <<< EXITED (successfully) >>> Role: ${message.role}, Ts: ${messageTimestampMs}`
      );

    } catch (outerError: any) {
      this.plugin.logger.error("[HMA] <<< CAUGHT OUTER ERROR >>> in handleMessageAdded:", outerError, data);
      // Не додаємо тут повідомлення про помилку напряму в DOM,
      // бо це може призвести до рекурсії, якщо handleErrorMessage теж викличе HMA.
      // Натомість, просто логуємо. Якщо потрібно, sendMessage/handleRegenerateClick повинні обробити це.
      // Або, якщо це помилка рендерингу, то addMessageStandard сам її обробить.
      if (localResolver) {
        localResolver(); 
      }
    } 
    // `finally` тут не потрібен, бо localResolver обробляється на початку і в кінці try/catch.
  }

  private handleMenuButtonClick = (e: MouseEvent): void => {
    this.dropdownMenuManager?.toggleMenu(e);
  };

    // --- ДОДАНО: Методи для перетягування ---
    private onDragStart = (event: MouseEvent): void => {
      if (event.button !== 0) return; // Реагуємо тільки на ліву кнопку

      this.isResizing = true;
      this.initialMouseX = event.clientX;
      // Перевіряємо наявність sidebarRootEl перед доступом до offsetWidth
      this.initialSidebarWidth = this.sidebarRootEl?.offsetWidth || 250; // Запасне значення

      event.preventDefault();
      event.stopPropagation();

      // Додаємо глобальні слухачі ДОКУМЕНТА
      document.addEventListener("mousemove", this.boundOnDragMove, { capture: true }); // Використовуємо capture
      document.addEventListener("mouseup", this.boundOnDragEnd, { capture: true });

      document.body.style.cursor = "ew-resize";
      document.body.classList.add(CSS_CLASS_RESIZING);
      this.plugin.logger.debug(`Resizer drag started. Initial width: ${this.initialSidebarWidth}`);
  };

  private onDragMove = (event: MouseEvent): void => {
      if (!this.isResizing || !this.sidebarRootEl) return;

      // Використовуємо requestAnimationFrame для плавності
      requestAnimationFrame(() => {
          // Додаткова перевірка всередині rAF, оскільки стан міг змінитися
          if (!this.isResizing || !this.sidebarRootEl) return;

          const currentMouseX = event.clientX;
          const deltaX = currentMouseX - this.initialMouseX;
          let newWidth = this.initialSidebarWidth + deltaX;

          // Обмеження ширини
          const minWidth = 150; // Мінімальна ширина
          const containerWidth = this.contentEl.offsetWidth;
          // Максимальна ширина - 60% контейнера, але не менше ніж minWidth + 50px
          const maxWidth = Math.max(minWidth + 50, containerWidth * 0.6);

          if (newWidth < minWidth) newWidth = minWidth;
          if (newWidth > maxWidth) newWidth = maxWidth;

          // Застосовуємо стилі напряму
          this.sidebarRootEl.style.width = `${newWidth}px`;
          this.sidebarRootEl.style.minWidth = `${newWidth}px`; // Важливо для flex-shrink

          // Оновлення CSS змінної (опціонально, якщо ви її використовуєте для ширини)
          // this.contentEl.style.setProperty('--ai-forge-sidebar-width', `${newWidth}px`);
      });
  };

  private onDragEnd = (event: MouseEvent): void => {
      // Перевіряємо, чи ми дійсно перетягували
      if (!this.isResizing) return;

      this.isResizing = false;

      // Видаляємо глобальні слухачі з документа
      document.removeEventListener("mousemove", this.boundOnDragMove, { capture: true });
      document.removeEventListener("mouseup", this.boundOnDragEnd, { capture: true });
      document.body.style.cursor = ""; // Повертаємо курсор
      document.body.classList.remove(CSS_CLASS_RESIZING);

      this.plugin.logger.debug("Resizer drag ended.");

      // Зберігаємо ширину з debounce
      this.saveWidthDebounced();
  };
  // --- КІНЕЦЬ МЕТОДІВ ДЛЯ ПЕРЕТЯГУВАННЯ ---

}
