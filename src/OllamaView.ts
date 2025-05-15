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
import { MicVAD } from "@ricky0123/vad-web";
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import OllamaPlugin from "./main";
import { AvatarType, LANGUAGES } from "./settings";
import { RoleInfo } from "./ChatManager";
import { Chat, ChatMetadata } from "./Chat";
import { SummaryModal } from "./SummaryModal";
import { AssistantMessage, Message, OllamaGenerateResponse, OllamaStreamChunk, ToolCall } from "./types";
import { MessageRole as MessageRoleTypeFromTypes } from "./types";

import { CSS_CLASSES } from "./constants";

import * as RendererUtils from "./MessageRendererUtils";
import { UserMessageRenderer } from "./renderers/UserMessageRenderer";
import { AssistantMessageRenderer } from "./renderers/AssistantMessageRenderer";
import { SystemMessageRenderer } from "./renderers/SystemMessageRenderer";
import { ErrorMessageRenderer } from "./renderers/ErrorMessageRenderer";
import { BaseMessageRenderer } from "./renderers/BaseMessageRenderer";
import { SidebarManager } from "./SidebarManager";
import { DropdownMenuManager } from "./DropdownMenuManager";
import { ToolMessageRenderer } from "./renderers/ToolMessageRenderer";
import { StreamChunk } from "./OllamaService";
import { parseAllTextualToolCalls } from "./utils/toolParser";
import { Logger } from "./Logger";

export const VIEW_TYPE_OLLAMA_PERSONAS = "ollama-personas-chat-view";

const SCROLL_THRESHOLD = 150;

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
const CSS_CLASS_VISIBLE = "visible";
const CSS_CLASS_CONTENT_COLLAPSED = "message-content-collapsed";
const CSS_CLASS_MENU_OPTION = "menu-option";

const CSS_ROLE_PANEL_ITEM = "ollama-role-panel-item";
const CSS_ROLE_PANEL_ITEM_ICON = "ollama-role-panel-item-icon";
const CSS_ROLE_PANEL_ITEM_TEXT = "ollama-role-panel-item-text";
const CSS_ROLE_PANEL_ITEM_ACTIVE = "is-active";
const CSS_ROLE_PANEL_ITEM_CUSTOM = "is-custom";
const CSS_ROLE_PANEL_ITEM_NONE = "ollama-role-panel-item-none";
const CSS_SIDEBAR_SECTION_ICON = "ollama-sidebar-section-icon";
const CSS_CHAT_ITEM_OPTIONS = "ollama-chat-item-options";
const CSS_CLASS_CHAT_LIST_ITEM = "ollama-chat-list-item";

const CSS_CLASS_RESIZER_HANDLE = "ollama-resizer-handle";
const CSS_CLASS_RESIZING = "is-resizing";

export type MessageRole = "user" | "assistant" | "system" | "error" | "tool";

export class OllamaView extends ItemView {
  private sidebarManager!: SidebarManager;
  private dropdownMenuManager!: DropdownMenuManager;

  private vad: MicVAD | null = null; // <--- ВЛАСТИВІСТЬ ДЛЯ VAD
  private vadSilenceTimer: NodeJS.Timeout | null = null; // <--- ТАЙМЕР ДЛЯ ТИШІ
  private readonly VAD_SILENCE_TIMEOUT_MS = 2000; // 2 секунди тиші для зупинки
  private readonly VAD_MIN_SPEECH_DURATION_MS = 250; // Мінімальна тривалість мовлення для початку (опціонально)
  private isVadSpeechDetected: boolean = false; // Прапорець, що мова була виявлена

  private vadWorkletJs: string | null = null; // Для зберігання коду ворклету
  private vadModelArrayBuffer: ArrayBuffer | null = null; // Для зберігання моделі
    private frameProcessedCounter = 0;
  private readonly FRAME_PROCESSED_LOG_INTERVAL = 30; // Логувати кожен 30-й фрейм (приблизно раз на секунду, якщо фрейми по 30мс)
  private vadObjectUrls: { model?: string, worklet?: string } = {};
private speechWorkerUrl: string | null = null;
  private readonly DEFAULT_PLACEHOLDER: string; 


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

  private rolePanelListEl!: HTMLElement;
  private mainChatAreaEl!: HTMLElement;

  private lastProcessedChatId: string | null = null;

  private chatPanelListEl!: HTMLElement;

  private chatPanelHeaderEl!: HTMLElement;
  private rolePanelHeaderEl!: HTMLElement;
  private scrollToBottomButton!: HTMLButtonElement;

  private stopGeneratingButton!: HTMLButtonElement;
  private currentAbortController: AbortController | null = null;

  private lastMessageElement: HTMLElement | null = null;
  private consecutiveErrorMessages: Message[] = [];
  private errorGroupElement: HTMLElement | null = null;
  private isSummarizingErrors = false;

  private isRegenerating: boolean = false;
  private messageAddedResolvers: Map<number, () => void> = new Map();

  private isChatListUpdateScheduled = false;
  private chatListUpdateTimeoutId: NodeJS.Timeout | null = null;

  private activePlaceholder: {
    timestamp: number;
    groupEl: HTMLElement;
    contentEl: HTMLElement;
    messageWrapper: HTMLElement;
  } | null = null;

  private sidebarRootEl!: HTMLElement;
  private resizerEl!: HTMLElement;
  private isResizing = false;
  private initialMouseX = 0;
  private initialSidebarWidth = 0;
  private boundOnDragMove: (event: MouseEvent) => void;
  private boundOnDragEnd: (event: MouseEvent) => void;
  private saveWidthDebounced: () => void;

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
    this.DEFAULT_PLACEHOLDER = "Type your message or use the voice input..."; // Або будь-яке інше значення

    this.saveWidthDebounced = debounce(() => {
      if (this.sidebarRootEl) {
        const newWidth = this.sidebarRootEl.offsetWidth;

        if (newWidth > 0 && newWidth !== this.plugin.settings.sidebarWidth) {
          this.plugin.settings.sidebarWidth = newWidth;

          this.plugin.saveSettings();
        }
      }
    }, 800);
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
    this.createUIElements();

    const savedWidth = this.plugin.settings.sidebarWidth;
    if (this.sidebarRootEl && savedWidth && typeof savedWidth === "number" && savedWidth > 50) {
      this.sidebarRootEl.style.width = `${savedWidth}px`;
      this.sidebarRootEl.style.minWidth = `${savedWidth}px`;
    } else if (this.sidebarRootEl) {
      let defaultWidth = 250;
      try {
        const cssVarWidth = getComputedStyle(this.sidebarRootEl).getPropertyValue("--ai-forge-sidebar-width").trim();
        if (cssVarWidth && cssVarWidth.endsWith("px")) {
          const parsedWidth = parseInt(cssVarWidth, 10);
          if (!isNaN(parsedWidth) && parsedWidth > 50) {
            defaultWidth = parsedWidth;
          }
        }
      } catch (e) {}
      this.sidebarRootEl.style.width = `${defaultWidth}px`;
      this.sidebarRootEl.style.minWidth = `${defaultWidth}px`;
      if (!savedWidth) {
      }
    }

    try {
      const initialRolePath = this.plugin.settings.selectedRolePath;
      const initialRoleName = await this.findRoleNameByPath(initialRolePath);
      const initialModelName = this.plugin.settings.modelName;
      const initialTemperature = this.plugin.settings.temperature;

      this.updateInputPlaceholder(initialRoleName);
      this.updateRoleDisplay(initialRoleName);
      this.updateModelDisplay(initialModelName);
      this.updateTemperatureIndicator(initialTemperature);
    } catch (error) {}

    this.attachEventListeners();

    this.autoResizeTextarea();
    this.updateSendButtonState();

    try {
      await this.loadAndDisplayActiveChat();
    } catch (error) {
      this.showEmptyState();
    }
    await this.loadVadAssets();

    setTimeout(() => {
      if (this.inputEl && this.leaf.view === this && document.body.contains(this.inputEl)) {
        this.inputEl.focus();
      } else {
      }
    }, 150);

    if (this.inputEl) {
      this.inputEl.dispatchEvent(new Event("input"));
    }
  }

  private async loadVadAssets() {
    // Шляхи до файлів у теці assets вашого плагіна
    const workletFileName = "vad.worklet.bundle.min.js"; // Назва файлу ворклету
    const modelFileName = "silero_vad.onnx"; // Назва файлу моделі (або silero_vad_legacy.onnx)

    const workletPath = normalizePath(`${this.plugin.manifest.dir}/assets/${workletFileName}`);
    const modelPath = normalizePath(`${this.plugin.manifest.dir}/assets/${modelFileName}`);

    try {
      this.vadWorkletJs = await this.app.vault.adapter.read(workletPath);
      this.plugin.logger.debug("VAD worklet JS loaded successfully.");
    } catch (e) {
      this.plugin.logger.error(`Failed to load VAD worklet JS from ${workletPath}:`, e);
      new Notice("VAD worklet could not be loaded. Voice detection might be unstable or not work.");
    }

    try {
      this.vadModelArrayBuffer = await this.app.vault.adapter.readBinary(modelPath);
      this.plugin.logger.debug("VAD ONNX model loaded successfully.");
    } catch (e) {
      this.plugin.logger.error(`Failed to load VAD ONNX model from ${modelPath}:`, e);
      new Notice("VAD ONNX model could not be loaded. Voice detection might be unstable or not work.");
    }
  }

  async onClose(): Promise<void> {
    document.removeEventListener("mousemove", this.boundOnDragMove, { capture: true });
    document.removeEventListener("mouseup", this.boundOnDragEnd, { capture: true });

    if (document.body.classList.contains(CSS_CLASS_RESIZING)) {
      document.body.style.cursor = "";
      document.body.classList.remove(CSS_CLASS_RESIZING);
    }
    this.isResizing = false;

    if (this.speechWorker) {
      this.speechWorker.terminate();
      this.speechWorker = null;
    }
    this.stopVoiceRecording(false); // Переконайся, що VAD також зупиняється
      if (this.speechWorkerUrl) {
    URL.revokeObjectURL(this.speechWorkerUrl); // ВІДКЛИКАЄМО ТУТ
    this.speechWorkerUrl = null;
    this.plugin.logger.debug("Revoked inline SpeechWorker Object URL.");
  }
    this.revokeVadObjectUrls();
    if (this.vad) {
      try {
        await this.vad.destroy();
      } catch (e) {
        this.plugin.logger.error("Error destroying VAD on close:", e);
      }
      this.vad = null;
    }
    if (this.vadSilenceTimer) {
      clearTimeout(this.vadSilenceTimer);
      this.vadSilenceTimer = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(t => t.stop());
      this.audioStream = null;
    }
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.sidebarManager?.destroy();
    this.dropdownMenuManager?.destroy();
  }

  private createUIElements(): void {
    this.contentEl.empty();

    const flexContainer = this.contentEl.createDiv({ cls: "ollama-container" });

    const isSidebarLocation = !this.plugin.settings.openChatInTab;
    const isDesktop = Platform.isDesktop;

    this.sidebarManager = new SidebarManager(this.plugin, this.app, this);
    this.sidebarRootEl = this.sidebarManager.createSidebarUI(flexContainer);

    const shouldShowInternalSidebar = isDesktop && !isSidebarLocation;
    if (this.sidebarRootEl) {
      this.sidebarRootEl.classList.toggle("internal-sidebar-hidden", !shouldShowInternalSidebar);
    } else {
    }

    this.resizerEl = flexContainer.createDiv({ cls: CSS_CLASS_RESIZER_HANDLE });
    this.resizerEl.title = "Drag to resize sidebar";

    this.resizerEl.classList.toggle("internal-sidebar-hidden", !shouldShowInternalSidebar);

    this.mainChatAreaEl = flexContainer.createDiv({ cls: "ollama-main-chat-area" });

    this.mainChatAreaEl.classList.toggle("full-width", !shouldShowInternalSidebar);

    this.chatContainerEl = this.mainChatAreaEl.createDiv({ cls: "ollama-chat-area-content" });
    this.chatContainer = this.chatContainerEl.createDiv({ cls: "ollama-chat-container" });
    this.newMessagesIndicatorEl = this.chatContainerEl.createDiv({ cls: "new-message-indicator" });
    setIcon(this.newMessagesIndicatorEl.createSpan({ cls: "indicator-icon" }), "arrow-down");
    this.newMessagesIndicatorEl.createSpan({ text: " New Messages" });
    this.scrollToBottomButton = this.chatContainerEl.createEl("button", {
      cls: ["scroll-to-bottom-button", "clickable-icon"],
      attr: { "aria-label": "Scroll to bottom", title: "Scroll to bottom" },
    });
    setIcon(this.scrollToBottomButton, "arrow-down");
    const inputContainer = this.mainChatAreaEl.createDiv({ cls: "chat-input-container" });
    this.inputEl = inputContainer.createEl("textarea", {
      attr: { placeholder: `Enter message text here...`, rows: 1 },
    });
    const controlsContainer = inputContainer.createDiv({ cls: "input-controls-container" });
    const leftControls = controlsContainer.createDiv({ cls: "input-controls-left" });
    this.translateInputButton = leftControls.createEl("button", {
      cls: "translate-input-button",
      attr: { "aria-label": "Translate input to English" },
    });
    setIcon(this.translateInputButton, "languages");
    this.translateInputButton.title = "Translate input to English";
    this.modelDisplayEl = leftControls.createDiv({ cls: "model-display" });
    this.modelDisplayEl.setText("...");
    this.modelDisplayEl.title = "Click to select model";
    this.roleDisplayEl = leftControls.createDiv({ cls: "role-display" });
    this.roleDisplayEl.setText("...");
    this.roleDisplayEl.title = "Click to select role";
    this.temperatureIndicatorEl = leftControls.createDiv({ cls: "temperature-indicator" });
    this.temperatureIndicatorEl.setText("?");
    this.temperatureIndicatorEl.title = "Click to set temperature";
    this.buttonsContainer = controlsContainer.createDiv({ cls: `buttons-container input-controls-right` });
    this.stopGeneratingButton = this.buttonsContainer.createEl("button", {
      cls: ["stop-generating-button", "danger-option"],
      attr: { "aria-label": "Stop Generation", title: "Stop Generation" },
    });
    setIcon(this.stopGeneratingButton, "square");
    this.stopGeneratingButton.hide();
    this.sendButton = this.buttonsContainer.createEl("button", { cls: "send-button", attr: { "aria-label": "Send" } });
    setIcon(this.sendButton, "send");
    this.voiceButton = this.buttonsContainer.createEl("button", {
      cls: "voice-button",
      attr: { "aria-label": "Voice Input" },
    });
    setIcon(this.voiceButton, "mic");
    this.toggleLocationButton = this.buttonsContainer.createEl("button", {
      cls: "toggle-location-button",
      attr: { "aria-label": "Toggle View Location" },
    });
    this.menuButton = this.buttonsContainer.createEl("button", { cls: "menu-button", attr: { "aria-label": "Menu" } });
    setIcon(this.menuButton, "more-vertical");
    this.updateToggleLocationButton();
    this.dropdownMenuManager = new DropdownMenuManager(
      this.plugin,
      this.app,
      this,
      inputContainer,
      isSidebarLocation,
      isDesktop
    );
    this.dropdownMenuManager.createMenuUI();
  }

  private attachEventListeners(): void {
    if (this.resizerEl) {
      this.registerDomEvent(this.resizerEl, "mousedown", this.onDragStart);
    } else {
    }

    if (this.inputEl) {
      this.registerDomEvent(this.inputEl, "keydown", this.handleKeyDown);
      this.registerDomEvent(this.inputEl, "input", this.handleInputForResize);
    }
    if (this.sendButton) {
      this.registerDomEvent(this.sendButton, "click", this.handleSendClick);
    }
    if (this.stopGeneratingButton) {
      this.registerDomEvent(this.stopGeneratingButton, "click", this.cancelGeneration);
    }
    if (this.voiceButton) {
      this.registerDomEvent(this.voiceButton, "click", this.handleVoiceClick);
    }
    if (this.translateInputButton) {
      this.registerDomEvent(this.translateInputButton, "click", this.handleTranslateInputClick);
    }
    if (this.menuButton) {
      this.registerDomEvent(this.menuButton, "click", this.handleMenuButtonClick);
    }
    if (this.toggleLocationButton) {
      this.registerDomEvent(this.toggleLocationButton, "click", this.handleToggleViewLocationClick);
    }
    if (this.modelDisplayEl) {
      this.registerDomEvent(this.modelDisplayEl, "click", this.handleModelDisplayClick);
    }
    if (this.roleDisplayEl) {
      this.registerDomEvent(this.roleDisplayEl, "click", this.handleRoleDisplayClick);
    }
    if (this.temperatureIndicatorEl) {
      this.registerDomEvent(this.temperatureIndicatorEl, "click", this.handleTemperatureClick);
    }
    if (this.chatContainer) {
      this.registerDomEvent(this.chatContainer, "scroll", this.scrollListenerDebounced);
    }
    if (this.newMessagesIndicatorEl) {
      this.registerDomEvent(this.newMessagesIndicatorEl, "click", this.handleNewMessageIndicatorClick);
    }
    if (this.scrollToBottomButton) {
      this.registerDomEvent(this.scrollToBottomButton, "click", this.handleScrollToBottomClick);
    }
    this.registerDomEvent(window, "resize", this.handleWindowResize);
    this.registerDomEvent(document, "click", this.handleDocumentClickForMenu);
    this.registerDomEvent(document, "visibilitychange", this.handleVisibilityChange);
    this.registerEvent(this.app.workspace.on("active-leaf-change", this.handleActiveLeafChange));
    this.dropdownMenuManager?.attachEventListeners();
    this.register(this.plugin.on("model-changed", modelName => this.handleModelChange(modelName)));
    this.register(this.plugin.on("role-changed", roleName => this.handleRoleChange(roleName)));
    this.register(this.plugin.on("roles-updated", () => this.handleRolesUpdated()));
    this.register(this.plugin.on("message-added", data => this.handleMessageAdded(data)));
    this.register(this.plugin.on("active-chat-changed", data => this.handleActiveChatChanged(data)));
    this.register(this.plugin.on("messages-cleared", chatId => this.handleMessagesCleared(chatId)));
    this.register(this.plugin.on("chat-list-updated", () => this.handleChatListUpdated()));
    this.register(this.plugin.on("settings-updated", () => this.handleSettingsUpdated()));
    this.register(this.plugin.on("message-deleted", data => this.handleMessageDeleted(data)));
    this.register(this.plugin.on("ollama-connection-error", () => {}));
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
      return;
    }

    const timestampMs = data.timestamp.getTime();
    const selector = `.${CSS_CLASSES.MESSAGE_GROUP}[data-timestamp="${timestampMs}"]`;

    try {
      const messageGroupEl = this.chatContainer.querySelector(selector);

      if (messageGroupEl instanceof HTMLElement) {
        const currentScrollTop = this.chatContainer.scrollTop;
        const removedHeight = messageGroupEl.offsetHeight;
        const wasAboveViewport = messageGroupEl.offsetTop < currentScrollTop;

        messageGroupEl.remove();

        const initialLength = this.currentMessages.length;
        this.currentMessages = this.currentMessages.filter(msg => msg.timestamp.getTime() !== timestampMs);

        if (wasAboveViewport) {
          const newScrollTop = currentScrollTop - removedHeight;
          this.chatContainer.scrollTop = newScrollTop >= 0 ? newScrollTop : 0;
        } else {
          this.chatContainer.scrollTop = currentScrollTop;
        }

        if (this.currentMessages.length === 0) {
          this.showEmptyState();
        }
      } else if (messageGroupEl) {
        this.loadAndDisplayActiveChat();
      } else {
      }
    } catch (error) {
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

    if (newRolePath !== currentRolePath) {
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      try {
        if (activeChat) {
          await this.plugin.chatManager.updateActiveChatMetadata({
            selectedRolePath: newRolePath,
          });
        } else {
          this.plugin.settings.selectedRolePath = newRolePath;
          await this.plugin.saveSettings();

          this.plugin.emit("role-changed", roleNameForEvent);
          this.plugin.promptService?.clearRoleCache?.();
        }
      } catch (error) {
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
      new Notice("Input translation encountered an unexpected error.");
    } finally {
      setIcon(this.translateInputButton, "languages");

      this.translateInputButton.disabled = this.isProcessing;
      this.translateInputButton.classList.remove(CSS_CLASS_TRANSLATING_INPUT);

      this.translateInputButton.title = `Translate input to ${LANGUAGES[targetLang] || targetLang}`;
    }
  };

  public handleNewChatClick = async (): Promise<void> => {
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

    this.dropdownMenuManager?.closeMenu();

    if (!chatId || currentName === null) {
      new Notice("Could not initiate rename process.");
      return;
    }

    new PromptModal(this.app, "Rename Chat", `Enter new name for "${currentName}":`, currentName, async newName => {
      let noticeMessage = "Rename cancelled or name unchanged.";
      const trimmedName = newName?.trim();

      if (trimmedName && trimmedName !== "" && trimmedName !== currentName) {
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
              new Notice(`Error creating export folder. Saving to vault root.`);
              targetFolder = this.app.vault.getRoot();
            }
          } catch (err) {
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
    } catch (error) {}
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

  public handleClearCurrentChatClickFromMenu = async (): Promise<void> => {
    this.dropdownMenuManager?.closeMenu();

    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (activeChat) {
      const chatName = activeChat.metadata.name;
      new ConfirmModal(
        this.app,
        "Clear Current Chat",
        `Are you sure you want to clear all messages in the current chat "${chatName}"?\nThis action cannot be undone.`,
        async () => {
          try {
            await this.plugin.chatManager.clearActiveChatMessages();
            // Якщо clearActiveChatMessages не кинув помилку, вважаємо, що все пройшло добре.
            // Подія "messages-cleared" має обробити оновлення UI.
            // Можна додати Notice тут, якщо ChatManager не робить цього після успішного очищення.
            // Однак, handleMessagesCleared в OllamaView, ймовірно, вже відповідає за UI оновлення.
            // Щоб уникнути дублювання Notice, перевір логіку в ChatManager.clearActiveChatMessages
            // та OllamaView.handleMessagesCleared.
            // Для простоти, поки що припустимо, що ChatManager/події подбають про Notice.
            // Якщо ні, то: new Notice(`Messages cleared for chat "${chatName}".`);
          } catch (error) {
            this.plugin.logger.error("Error clearing current chat from menu:", error);
            new Notice(`Failed to clear messages for chat "${chatName}".`);
          }
        }
      ).open();
    } else {
      new Notice("No active chat to clear.");
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
      let renderer:
        | UserMessageRenderer
        | SystemMessageRenderer
        | AssistantMessageRenderer
        | ToolMessageRenderer
        | ErrorMessageRenderer
        | null = null;

      switch (message.role) {
        case "user":
          renderer = new UserMessageRenderer(this.app, this.plugin, message, this);
          break;
        case "assistant":
          renderer = new AssistantMessageRenderer(this.app, this.plugin, message as AssistantMessage, this);
          break;
        case "system":
          renderer = new SystemMessageRenderer(this.app, this.plugin, message, this);
          break;
        case "error":
          this.handleErrorMessage(message);
          return;

        case "tool":
          renderer = new ToolMessageRenderer(this.app, this.plugin, message, this);
          break;

        default:
          const unknownRoleGroup = this.chatContainer?.createDiv({ cls: CSS_CLASSES.MESSAGE_GROUP });
          if (unknownRoleGroup && this.chatContainer) {
            RendererUtils.renderAvatar(this.app, this.plugin, unknownRoleGroup, false);
            const wrapper = unknownRoleGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
            const msgBubble = wrapper.createDiv({ cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.SYSTEM_MESSAGE}` });
            msgBubble.createDiv({
              cls: CSS_CLASSES.SYSTEM_MESSAGE_TEXT || "system-message-text",
              text: `Internal Plugin Error: Unknown message role received by renderer: '${message.role}'. Message content was logged.`,
            });
                        const metaActionsWrapper = msgBubble.createDiv({ cls: "message-meta-actions-wrapper" });

            BaseMessageRenderer.addTimestampToElement(metaActionsWrapper, message.timestamp, this);
            this.chatContainer.appendChild(unknownRoleGroup);
            this.lastMessageElement = unknownRoleGroup;
          }
          return;
      }

      if (renderer) {
        const result = renderer.render();
        messageGroupEl = result instanceof Promise ? await result : result;
      } else {
        return;
      }

      if (messageGroupEl && this.chatContainer) {
        this.chatContainer.appendChild(messageGroupEl);
        this.lastMessageElement = messageGroupEl;
        if (!messageGroupEl.isConnected) {
        }

        messageGroupEl.classList.add(CSS_CLASSES.MESSAGE_ARRIVING || "message-arriving");
        setTimeout(() => messageGroupEl?.classList.remove(CSS_CLASSES.MESSAGE_ARRIVING || "message-arriving"), 500);

        const isUserMessage = message.role === "user";
        if (!isUserMessage && this.userScrolledUp && this.newMessagesIndicatorEl) {
          this.newMessagesIndicatorEl.classList.add(CSS_CLASSES.VISIBLE || "visible");
        } else if (!this.userScrolledUp) {
          const scrollDelay = this.isProcessing && message.role === "assistant" ? 30 : isUserMessage ? 50 : 100;

          const forceScroll =
            (this.isProcessing && message.role === "assistant") || message.role === "tool" ? true : !isUserMessage;
          this.guaranteedScrollToBottom(scrollDelay, forceScroll);
        }
        setTimeout(() => this.updateScrollStateAndIndicators(), 150);
      } else if (renderer) {
      }
    } catch (error: any) {
      try {
        const errorNotice = `Failed to render message (Role: ${message?.role}). Check console for details.`;

        const errorMsgObject: Message = {
          role: "error",
          content: errorNotice,
          timestamp: message.timestamp || new Date(),
        };
        this.handleErrorMessage(errorMsgObject);
      } catch (criticalError) {
        new Notice("Critical error displaying message. Check console.");
      }
    }
  }

  private handleMessagesCleared = (chatId: string): void => {
    if (chatId === this.plugin.chatManager?.getActiveChatId()) {
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
    if (!this.inputEl || !this.sendButton || !this.stopGeneratingButton) {
      return;
    }

    const generationInProgress = this.currentAbortController !== null;
    const isInputEmpty = this.inputEl.value.trim() === "";

    if (generationInProgress) {
      this.stopGeneratingButton.show();
      this.sendButton.hide();
      this.sendButton.disabled = true;
    } else {
      this.stopGeneratingButton.hide();
      this.sendButton.show();

      const sendShouldBeDisabled = isInputEmpty || this.isProcessing;
      this.sendButton.disabled = sendShouldBeDisabled;
      this.sendButton.classList.toggle(CSS_CLASSES.DISABLED, sendShouldBeDisabled);
    }
  }

  // OllamaView.ts

  // ... (інші частини класу) ...

  public showEmptyState(
    messageText: string = "No messages yet", // Текст за замовчуванням
    tipText?: string // Опціональний текст підказки
  ): void {
    // Очищаємо попередній emptyStateEl, якщо він є, щоб уникнути дублікатів
    if (this.emptyStateEl) {
      this.emptyStateEl.remove();
      this.emptyStateEl = null;
    }

    // Перевіряємо умови (можливо, this.currentMessages.length === 0 тут не потрібне,
    // бо ми викликаємо його, коли знаємо, що стан порожній)
    if (this.chatContainer) {
      // Переконуємося, що контейнер існує
      // this.chatContainer.empty(); // Очищаємо контейнер перед показом empty state
      // Якщо це не бажано (наприклад, якщо там є інші елементи), прибери цей рядок.
      // Але якщо chatContainer призначений тільки для повідомлень та emptyState, то це ок.

      this.emptyStateEl = this.chatContainer.createDiv({
        cls: CSS_CLASS_EMPTY_STATE, // Переконайся, що CSS_CLASS_EMPTY_STATE визначено
      });
      this.emptyStateEl.createEl("p", {
        // Використовуємо <p> для семантики
        cls: "empty-state-message",
        text: messageText,
      });

      const finalTipText =
        tipText !== undefined
          ? tipText
          : `Type a message or use the menu options to start interacting with ${
              this.plugin?.settings?.modelName || "the AI"
            }.`;

      if (finalTipText) {
        // Додаємо підказку, тільки якщо вона є
        this.emptyStateEl.createEl("p", {
          cls: "empty-state-tip",
          text: finalTipText,
        });
      }
    }
  }

  public hideEmptyState(): void {
    if (this.emptyStateEl) {
      this.emptyStateEl.remove();
      this.emptyStateEl = null;
    }
  }

  // ... (решта класу) ...

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

  private handleChatListUpdated = (): void => {
    this.scheduleSidebarChatListUpdate();

    if (this.dropdownMenuManager) {
      this.dropdownMenuManager
        .updateChatListIfVisible()
        .catch(e => this.plugin.logger.error("Error updating chat dropdown list:", e));
    }
  };

  public handleSettingsUpdated = async (): Promise<void> => {
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
      await this.sidebarManager
        .updateChatList()
        .catch(e => this.plugin.logger.error("Error updating chat panel list:", e));
    } else {
    }
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
        try {
          const deleteSuccess = await this.plugin.chatManager.deleteMessageByTimestamp(
            activeChat.metadata.id,
            messageToDelete.timestamp
          );

          if (deleteSuccess) {
            new Notice("Message deleted.");
          } else {
            new Notice("Failed to delete message.");
          }
        } catch (error) {
          new Notice("An error occurred while deleting the message.");
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
// Всередині методу initSpeechWorker в OllamaView.ts
const workerCode = `
  /**
   * Конвертує ArrayBuffer в рядок Base64.
   * @param {ArrayBuffer} buffer - ArrayBuffer для конвертації.
   * @returns {string} Рядок Base64.
   */
  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return self.btoa(binary);
  }

  self.onmessage = async (event) => {
    console.log("[InlineWorker] Received message:", event.data);
    const { apiKey, audioBlob, languageCode = 'uk-UA' } = event.data;

    if (!apiKey || apiKey.trim() === '') {
      console.error("[InlineWorker] Google API Key is missing.");
      self.postMessage({ success: false, error: 'Google API Key is not configured. Please add it in plugin settings.' });
      return;
    }

    if (!(audioBlob instanceof Blob)) {
        console.error("[InlineWorker] audioBlob is not a Blob:", audioBlob);
        self.postMessage({ success: false, error: 'Invalid audio data received by worker.' });
        return;
    }
    
    console.log("[InlineWorker] Blob type:", audioBlob.type, "Blob size:", audioBlob.size);

    const url = \`https://speech.googleapis.com/v1/speech:recognize?key=\${apiKey}\`; // Виправлено URL

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = arrayBufferToBase64(arrayBuffer);

      const requestPayload = {
        config: {
          encoding: 'WEBM_OPUS', 
          // sampleRateHertz: 48000, // ВИДАЛЕНО: не потрібен для WEBM_OPUS
          languageCode: languageCode,
          model: 'latest_long', 
          enableAutomaticPunctuation: true,
        },
        audio: { content: base64Audio },
      };

      console.log("[InlineWorker] Sending request to Google Speech API with config:", requestPayload.config);

      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(requestPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const responseText = await response.text(); // Отримуємо текст для кращого налагодження помилок
      
      if (!response.ok) {
        let errorMessage = \`HTTP error! status: \${response.status}\`;
        try {
            const errorData = JSON.parse(responseText);
            if (errorData && errorData.error && errorData.error.message) {
                errorMessage = \`Google API Error: \${errorData.error.message}\`;
            }
        } catch (e) { /* Ігноруємо помилку парсингу JSON, якщо відповідь не JSON */ }
        console.error("[InlineWorker]", errorMessage, "Response body:", responseText);
        self.postMessage({ success: false, error: errorMessage, details: responseText });
        return;
      }

      const responseData = JSON.parse(responseText);
      console.log("[InlineWorker] Speech recognition data:", responseData);

      if (responseData.results && responseData.results.length > 0) {
        const transcript = responseData.results
          .map(result => result.alternatives && result.alternatives.length > 0 ? result.alternatives[0].transcript : '')
          .join(' ')
          .trim();
        
        if (transcript) {
            console.log("[InlineWorker] Transcript:", transcript);
            self.postMessage({ success: true, transcript: transcript });
        } else {
            console.warn("[InlineWorker] No valid transcript found in alternatives:", responseData.results);
            self.postMessage({ success: false, error: 'No valid transcript found in alternatives.' , details: responseData });
        }
      } else {
        console.warn("[InlineWorker] No speech detected or recognized by API:", responseData);
        self.postMessage({ success: false, error: 'No speech detected or recognized.', details: responseData });
      }
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.error('[InlineWorker] Error processing speech recognition:', errorMessage, error);
      self.postMessage({ success: false, error: \`Error processing speech recognition: \${errorMessage}\`, details: String(error) });
    }
  };

  // Обробник для неперехоплених помилок у воркері
  self.onerror = (event) => {
    console.error('[InlineWorker] Uncaught worker error:', event);
    const errorMessage = (event instanceof ErrorEvent) ? event.message : 'Unknown worker error';
    self.postMessage({ success: false, error: \`Uncaught worker error: \${errorMessage}\` });
  };
`;
const workerBlob = new Blob([workerCode], { type: "application/javascript" });
    
    if (this.speechWorkerUrl) { // Відкликаємо попередній, якщо він був
        URL.revokeObjectURL(this.speechWorkerUrl);
    }
    this.speechWorkerUrl = URL.createObjectURL(workerBlob); // Зберігаємо новий
    
    this.speechWorker = new Worker(this.speechWorkerUrl);
    // НЕ ВІДКЛИКАЄМО ТУТ: URL.revokeObjectURL(this.speechWorkerUrl); 

    this.setupSpeechWorkerHandlers();
    } catch (error) {
      new Notice("Speech recognition feature failed to initialize.");
      this.speechWorker = null;
    }
  }
  
  // OllamaView.ts
// ... (інші імпорти, властивості, методи) ...

 private setupSpeechWorkerHandlers(): void {
    if (!this.speechWorker) return;

    this.speechWorker.onmessage = (event: MessageEvent<{success: boolean, transcript?: string, error?: string, details?: any}>) => {
        this.inputEl.placeholder = this.DEFAULT_PLACEHOLDER; 
        this.updateSendButtonState();

        const data = event.data;
        // Перевіряємо, що транскрипція існує, є рядком і не порожня
        if (data.success && typeof data.transcript === 'string' && data.transcript.trim() !== "") {
            // Після цієї перевірки, TypeScript знає, що data.transcript - це string
            const receivedTranscript: string = data.transcript; // Тепер receivedTranscript - це гарантовано string

            this.plugin.logger.info("Received transcript from inline worker:", receivedTranscript);
            
            const currentText = this.inputEl.value;
            const selectionStart = this.inputEl.selectionStart;
            const selectionEnd = this.inputEl.selectionEnd;    

            const newText = 
                currentText.substring(0, selectionStart) + 
                receivedTranscript + // Використовуємо нову змінну
                currentText.substring(selectionEnd);

            this.inputEl.value = newText;
            
            const newCursorPosition = selectionStart + receivedTranscript.length; // Використовуємо нову змінну
            this.inputEl.setSelectionRange(newCursorPosition, newCursorPosition);

            this.inputEl.focus(); 
            this.updateSendButtonState(); 

        } else if (data.success && (typeof data.transcript !== 'string' || data.transcript.trim() === "")) {
            // Обробляємо випадок, коли транскрипція успішна, але порожня або не рядок
            this.plugin.logger.info("Received successful but empty or non-string transcript. Nothing to insert.");
        }
        else if (!data.success) { // Явно обробляємо випадок помилки
            this.plugin.logger.error("Error from inline speech worker:", data.error, data.details);
            new Notice(`Speech recognition error: ${data.error || 'Unknown error'}`);
        }
    };
    this.speechWorker.onerror = (error: ErrorEvent) => {
        // ... (обробка помилок, як і раніше) ...
        this.plugin.logger.error("Unhandled error in inline speech worker:", error.message, error);
        new Notice(`Speech recognition worker failed: ${error.message}`);
        this.inputEl.placeholder = this.DEFAULT_PLACEHOLDER; 
        this.updateSendButtonState();
         if (this.speechWorker) { 
            this.speechWorker.terminate();
            this.speechWorker = null;
        }
        if (this.speechWorkerUrl) { 
            URL.revokeObjectURL(this.speechWorkerUrl);
            this.speechWorkerUrl = null;
        }
    };
  }

// ... (решта класу OllamaView) ...

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
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.plugin.logger.debug("VAD: Recording already in progress.");
      return;
    }

    if (!this.speechWorker) {
      new Notice("Speech recognition feature not available (worker not initialized).");
      this.plugin.logger.warn("Speech worker not initialized, aborting voice recognition.");
      return;
    }

    const speechApiKey = this.plugin.settings.googleApiKey;
    if (!speechApiKey) {
      new Notice("Google API Key for speech recognition not configured. Please add it in plugin settings.");
      this.plugin.logger.warn("Google API Key not configured, aborting voice recognition.");
      return;
    }
    
    // Перевірка та завантаження ресурсів VAD
    const needLocalModel = this.plugin.settings.vadUseLocalModelIfAvailable || !this.plugin.settings.allowVadMicVadModelFromCDN;
    const needLocalWorklet = this.plugin.settings.vadUseLocalWorkletIfAvailable; // Або якщо CDN для ворклету теж не варіант

    if ((needLocalModel && !this.vadModelArrayBuffer) || (needLocalWorklet && !this.vadWorkletJs)) {
        this.plugin.logger.debug("Attempting to load VAD assets as they are missing or preferred locally.");
        await this.loadVadAssets();
    }

    if (needLocalModel && !this.vadModelArrayBuffer) {
        new Notice("Required local VAD ONNX model not loaded. Voice detection cannot start.");
        this.plugin.logger.error("Local VAD ONNX model required but not available. Aborting voice recognition start.");
        return;
    }
    if (needLocalWorklet && !this.vadWorkletJs && !this.plugin.settings.allowVadMicVadModelFromCDN) { // Якщо ворклет локальний, але не завантажений, і CDN не дозволено
        new Notice("Required local VAD worklet not loaded, and CDN fallback disabled. Voice detection cannot start.");
        this.plugin.logger.error("Local VAD worklet required but not available, and CDN fallback for worklet disabled. Aborting voice recognition start.");
        return;
    }


    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (this.audioStream) {
        const audioTracks = this.audioStream.getAudioTracks();
        if (audioTracks.length > 0) {
          const settings = audioTracks[0].getSettings();
          this.plugin.logger.debug("AudioTrack settings from getUserMedia:", JSON.stringify(settings));
          if (settings.sampleRate) {
            this.plugin.logger.debug(`AudioStream sample rate: ${settings.sampleRate} Hz`);
          }
        } else {
            this.plugin.logger.warn("getUserMedia returned an audioStream with no audio tracks.");
            new Notice("Could not get an audio track from the microphone.");
            return;
        }
      } else {
          this.plugin.logger.error("getUserMedia did not return an audioStream.");
          new Notice("Could not access the microphone stream.");
          return;
      }

      let recorderOptions: MediaRecorderOptions | undefined;
      const preferredMimeType = "audio/webm;codecs=opus";
      if (MediaRecorder.isTypeSupported(preferredMimeType)) {
        recorderOptions = { mimeType: preferredMimeType };
        this.plugin.logger.debug("Using preferred MIME type for MediaRecorder:", preferredMimeType);
      } else {
        this.plugin.logger.debug("Preferred MIME type not supported, using default for MediaRecorder.");
      }

      this.mediaRecorder = new MediaRecorder(this.audioStream, recorderOptions);
      const audioChunks: Blob[] = [];

      this.voiceButton?.classList.add(CSS_CLASS_RECORDING);
      if (this.voiceButton) setIcon(this.voiceButton, "stop-circle");
      this.inputEl.placeholder = "Listening... Speak now.";
      this.isVadSpeechDetected = false;
      this.frameProcessedCounter = 0; 
      this.revokeVadObjectUrls(); // Звільняємо попередні Object URL, якщо вони були

      this.mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.plugin.logger.debug(`MediaRecorder stopped. Audio chunks count: ${audioChunks.length}. isVadSpeechDetected: ${this.isVadSpeechDetected}`);
        if (this.vad) {
          this.vad.pause(); // Пауза VAD, щоб він не обробляв далі, коли запис зупинено
          this.plugin.logger.debug("VAD paused on MediaRecorder stop.");
        }
        if (this.vadSilenceTimer) {
          clearTimeout(this.vadSilenceTimer);
          this.vadSilenceTimer = null;
        }

        if (this.speechWorker && audioChunks.length > 0 && this.isVadSpeechDetected) {
          const audioBlob = new Blob(audioChunks, {
            type: this.mediaRecorder?.mimeType || "audio/webm",
          });
          this.inputEl.placeholder = "Processing speech...";
          this.plugin.logger.debug("Sending audioBlob to speech worker for processing.");
          this.speechWorker.postMessage({
            apiKey: speechApiKey,
            audioBlob,
            languageCode: this.plugin.settings.speechLanguage || "uk-UA",
          });
        } else {
          this.plugin.logger.debug(`Not sending to worker. audioChunks.length: ${audioChunks.length}, isVadSpeechDetected: ${this.isVadSpeechDetected}`);
          this.getCurrentRoleDisplayName().then(roleName => this.updateInputPlaceholder(roleName));
          this.updateSendButtonState(); // Оновлюємо стан кнопки відправки, якщо нічого не розпізнано
        }
      };

      this.mediaRecorder.onerror = (event: Event) => {
        let errorMessage = 'Unknown MediaRecorder error';
        if (event instanceof ErrorEvent) { errorMessage = event.message; this.plugin.logger.error("MediaRecorder ErrorEvent:", event.error, event.message);
        } else if ((event as any).error) { errorMessage = (event as any).error.message || (event as any).error.name || 'MediaRecorder specific error'; this.plugin.logger.error("MediaRecorder specific error object:", (event as any).error);
        } else { this.plugin.logger.error("MediaRecorder unknown error event type:", event); }
        new Notice(`An error occurred during recording: ${errorMessage}`);
        this.stopVoiceRecording(false);
      };

      this.mediaRecorder.start(); // Починаємо запис даних з мікрофону
      this.plugin.logger.debug("MediaRecorder started.");

      try {
        if (this.vad) {
          this.plugin.logger.debug("Destroying previous VAD instance.");
          await this.vad.destroy();
          this.vad = null;
        }

        this.plugin.logger.debug("Attempting to initialize MicVAD...");
        
        const vadOptions: any = { 
          stream: this.audioStream, // Передаємо аудіопотік в VAD
          ortConfig: (ort: any) => {
            this.plugin.logger.debug("[VAD ortConfig] Attempting to configure ONNXRuntime-Web instance.");
            if (ort.env && ort.env.wasm) {
              this.plugin.logger.debug("[VAD ortConfig] WASM config before:", JSON.parse(JSON.stringify(ort.env.wasm)));
              ort.env.wasm.numThreads = 1;
              this.plugin.logger.debug("[VAD ortConfig] WASM config after (numThreads=1):", JSON.parse(JSON.stringify(ort.env.wasm)));
            } else {
              this.plugin.logger.warn("[VAD ortConfig] ort.env.wasm is not available for configuration during this call.");
            }
          },
          
          onFrameProcessed: (probabilities: any) => {
            this.frameProcessedCounter++;
            let probValue = -1;
            if (probabilities && typeof probabilities.isSpeech === 'number') {
                probValue = probabilities.isSpeech;
            } else if (typeof probabilities === 'number') {
                probValue = probabilities;
            }

            if (this.frameProcessedCounter % this.FRAME_PROCESSED_LOG_INTERVAL === 0) {
                if (probValue !== -1) {
                    this.plugin.logger.debug(`VAD Frame (${this.frameProcessedCounter}): isSpeech probability = ${probValue.toFixed(4)}`);
                } else {
                    this.plugin.logger.debug(`VAD Frame (${this.frameProcessedCounter}): received unexpected probability format:`, probabilities);
                }
            }
            if (probValue > 0.9 && !this.isVadSpeechDetected && (this.frameProcessedCounter % Math.floor(this.FRAME_PROCESSED_LOG_INTERVAL / 3) === 0)) { 
                 this.plugin.logger.warn(`VAD Frame: HIGH speech probability (${probValue.toFixed(4)}) but onSpeechStart not triggered yet. Current threshold: ${vadOptions.positiveSpeechThreshold}, minFrames: ${vadOptions.minSpeechFrames}`);
            }
          },

          onSpeechStart: () => {
            this.plugin.logger.error("VAD EVENT: !!! SPEECH START DETECTED !!! Setting isVadSpeechDetected = true.");
            this.isVadSpeechDetected = true;
            if (this.vadSilenceTimer) {
              clearTimeout(this.vadSilenceTimer);
              this.vadSilenceTimer = null;
              this.plugin.logger.debug("VAD EVENT: Cleared vadSilenceTimer on speech start.");
            }
          },
          onSpeechEnd: (/*audioChunk: Float32Array*/) => { 
            this.plugin.logger.error(`VAD EVENT: !!! SPEECH END DETECTED !!! isVadSpeechDetected: ${this.isVadSpeechDetected}`);
            if (this.isVadSpeechDetected && this.mediaRecorder && this.mediaRecorder.state === "recording") {
              if (this.vadSilenceTimer) clearTimeout(this.vadSilenceTimer);
              this.plugin.logger.debug("VAD EVENT: Setting vadSilenceTimer on speech end.");
              this.vadSilenceTimer = setTimeout(() => {
                this.plugin.logger.debug("VAD EVENT: vadSilenceTimer expired. Stopping voice recording.");
                this.stopVoiceRecording(true); 
              }, this.VAD_SILENCE_TIMEOUT_MS);
            } else {
                this.plugin.logger.debug("VAD EVENT: Speech ended, but not processing (isVadSpeechDetected false or recorder not recording).");
            }
          },
          // --- Параметри VAD для тестування (можеш змінювати) ---
          positiveSpeechThreshold: 0.4, 
          negativeSpeechThreshold: 0.3,  
          minSpeechFrames: 3,           
          // preSpeechPadFrames: 5,     
          // redemptionFrames: 8,      
        };
        
        // Встановлення modelURL, якщо локальна модель доступна і бажана
        if (this.vadModelArrayBuffer && (this.plugin.settings.vadUseLocalModelIfAvailable || !this.plugin.settings.allowVadMicVadModelFromCDN)) {
            try {
                const modelBlob = new Blob([this.vadModelArrayBuffer], { type: 'application/octet-stream' });
                this.vadObjectUrls.model = URL.createObjectURL(modelBlob);
                vadOptions.modelURL = this.vadObjectUrls.model; 
                this.plugin.logger.debug("Using local VAD ONNX model via Object URL:", this.vadObjectUrls.model);
            } catch(e) {
                this.plugin.logger.error("Error creating Object URL for local VAD model:", e);
            }
        }
        
        // Встановлення workletURL, якщо локальний ворклет доступний і бажаний
        if (this.vadWorkletJs && this.plugin.settings.vadUseLocalWorkletIfAvailable) { 
             try {
                const workletBlob = new Blob([this.vadWorkletJs], { type: 'application/javascript' });
                this.vadObjectUrls.worklet = URL.createObjectURL(workletBlob);
                vadOptions.workletURL = this.vadObjectUrls.worklet; 
                this.plugin.logger.debug("Using local VAD worklet via Object URL:", this.vadObjectUrls.worklet);
             } catch(e) {
                this.plugin.logger.error("Error creating Object URL for local VAD worklet:", e);
             }
        }

        this.vad = await MicVAD.new(vadOptions);
        this.plugin.logger.debug("VAD initialized (MicVAD.new called).");

         if (this.vad) {
            this.plugin.logger.debug("Attempting to explicitly call this.vad.start()...");
            this.vad.start(); // MicVAD.new має викликати це, якщо startImmediately:true (дефолт), але для певності.
                           // Це також має викликати audioContext.resume(), якщо він suspended.
            this.plugin.logger.debug("this.vad.start() called.");

            // Прямий доступ до audioContext або audioNode неможливий згідно з типами.
            // Ми не можемо надійно перевірити стан AudioContext ззовні.
            // Покладаємося на те, що this.vad.start() зробив свою роботу.
            this.plugin.logger.debug("Cannot directly check VAD AudioContext state due to encapsulation. Assuming start() handled it.");
        }

      } catch (vadError: any) {
        this.plugin.logger.error("Failed to initialize VAD (MicVAD.new error):", vadError, vadError.stack);
        if (vadError.message && vadError.message.includes("Worker is not a constructor")) {
            new Notice("Voice activity detection failed: Web Worker environment issue.");
        } else if (vadError.message && (vadError.message.includes("ORT Session") || vadError.message.includes("ONNX"))) {
            new Notice("Voice activity detection failed: Could not initialize ONNX model. Check console for details.");
        } else if (vadError.message && (vadError.message.includes("fetch") || vadError.message.includes("network error") || vadError.message.includes("load model"))) {
            new Notice("VAD Error: Could not load model or worklet. Check network or CDN/local file availability.");
        } else {
            new Notice(`Voice activity detection failed to start: ${vadError.message}`);
        }
        this.vad = null; 
        this.revokeVadObjectUrls(); // Звільняємо URL, якщо VAD не зміг ініціалізуватися
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") { new Notice("Microphone access denied. Please grant permission.");
      } else if (error instanceof DOMException && error.name === "NotFoundError") { new Notice("Microphone not found. Please ensure it's connected and enabled.");
      } else { new Notice("Could not start voice recording."); this.plugin.logger.error("Error starting voice recognition (getUserMedia or MediaRecorder):", error); }
      this.stopVoiceRecording(false); // Це також має викликати revokeVadObjectUrls, якщо він реалізований в stopVoiceRecording
    }
  }

 private revokeVadObjectUrls() {
    if (this.vadObjectUrls.model) {
      URL.revokeObjectURL(this.vadObjectUrls.model);
      this.plugin.logger.debug("Revoked VAD model Object URL:", this.vadObjectUrls.model);
      delete this.vadObjectUrls.model;
    }
    if (this.vadObjectUrls.worklet) {
      URL.revokeObjectURL(this.vadObjectUrls.worklet);
      this.plugin.logger.debug("Revoked VAD worklet Object URL:", this.vadObjectUrls.worklet);
      delete this.vadObjectUrls.worklet;
    }
  }



  private stopVoiceRecording(processAudio: boolean): void {
    this.plugin.logger.debug(`Stopping voice recording. Process audio: ${processAudio}`);
this.revokeVadObjectUrls(); // Звільняємо Object URL, якщо вони були створені
    if (this.vad) {
      this.vad.pause(); // Зупиняємо VAD від обробки нових даних
      // Не викликаємо destroy тут, щоб уникнути помилок, якщо onstop ще не спрацював
      // destroy буде викликаний в onClose або перед наступним стартом
    }
    if (this.vadSilenceTimer) {
      clearTimeout(this.vadSilenceTimer);
      this.vadSilenceTimer = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.stop(); // Це викличе onstop, де буде обробка audioChunks
      this.plugin.logger.debug("MediaRecorder.stop() called.");
    } else if (this.mediaRecorder && this.mediaRecorder.state === "inactive") {
      this.plugin.logger.debug("MediaRecorder was already inactive.");
      // Якщо не processAudio, а ми тут, значить, можливо, VAD не спрацював або була помилка
      // і потрібно просто оновити UI
      if (!processAudio) {
        this.getCurrentRoleDisplayName().then(roleName => this.updateInputPlaceholder(roleName));
        this.updateSendButtonState();
      }
    }

    this.voiceButton?.classList.remove(CSS_CLASS_RECORDING);
    if (this.voiceButton) setIcon(this.voiceButton, "mic");

    // Оновлення плейсхолдера та кнопки може відбуватися в onstop або тут,
    // якщо onstop не викликається (наприклад, через помилку)
    if (this.mediaRecorder?.state !== "recording" && !processAudio) {
      // Якщо запис точно не йде
      this.getCurrentRoleDisplayName().then(roleName => this.updateInputPlaceholder(roleName));
    }
    this.updateSendButtonState(); // Завжди оновлюємо стан кнопки

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
      this.plugin.logger.debug("Audio stream tracks stopped.");
    }
    // this.mediaRecorder = null; // Не скидаємо тут, onstop може ще ним користуватися
  }

    public checkAllMessagesForCollapsing(): void {
    this.plugin.logger.debug("[checkAllMessagesForCollapsing] Starting scan for messages to collapse/expand.");
    const messageGroups = this.chatContainer?.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.MESSAGE_GROUP}`);
    
    if (!messageGroups || messageGroups.length === 0) {
        this.plugin.logger.debug("[checkAllMessagesForCollapsing] No message groups found in chat container.");
        return;
    }
    this.plugin.logger.debug(`[checkAllMessagesForCollapsing] Found ${messageGroups.length} message groups.`);

    messageGroups.forEach((msgGroupEl, index) => {
      const groupTimestampAttr = msgGroupEl.getAttribute("data-timestamp");
      const groupPlaceholderTimestampAttr = msgGroupEl.getAttribute("data-placeholder-timestamp");
      const groupClasses = Array.from(msgGroupEl.classList).join(", ");
      
      this.plugin.logger.debug(`[checkAllMessagesForCollapsing] Processing group ${index + 1}/${messageGroups.length}:`, {
        timestamp: groupTimestampAttr,
        placeholderTimestamp: groupPlaceholderTimestampAttr,
        classes: groupClasses,
        isProcessing: this.isProcessing
      });

      const isStreamingPlaceholder = msgGroupEl.classList.contains("placeholder") && 
                                     msgGroupEl.hasAttribute("data-placeholder-timestamp") && 
                                     this.isProcessing; 

      if (isStreamingPlaceholder) {
        this.plugin.logger.debug(`[checkAllMessagesForCollapsing] Group ${index + 1} IS an active streaming placeholder. Hiding toggle button if exists.`);
        const toggleButton = msgGroupEl.querySelector<HTMLButtonElement>(`.${CSS_CLASSES.TOGGLE_COLLAPSE_BUTTON}`);
        if (toggleButton) {
            toggleButton.hide();
            this.plugin.logger.debug(`[checkAllMessagesForCollapsing] Group ${index + 1}: Streaming placeholder toggle button hidden.`);
        }
        const contentCollapsible = msgGroupEl.querySelector<HTMLElement>(`.${CSS_CLASSES.CONTENT_COLLAPSIBLE}`);
        if (contentCollapsible) {
          contentCollapsible.style.maxHeight = ""; 
          contentCollapsible.classList.remove(CSS_CLASSES.CONTENT_COLLAPSED);
          this.plugin.logger.debug(`[checkAllMessagesForCollapsing] Group ${index + 1}: Streaming placeholder content uncollapsed.`);
        }
        return; 
      }

      const hasTimestamp = msgGroupEl.hasAttribute("data-timestamp");
      const isPlaceholder = msgGroupEl.classList.contains("placeholder");
      const processingComplete = !this.isProcessing;

      const shouldProcess = hasTimestamp || (isPlaceholder && processingComplete);
      
      if (shouldProcess) {
        this.plugin.logger.debug(`[checkAllMessagesForCollapsing] Group ${index + 1} should be processed for collapsing. HasTimestamp: ${hasTimestamp}, IsPlaceholder: ${isPlaceholder}, ProcessingComplete: ${processingComplete}`);
        
        const messageElementExists = !!msgGroupEl.querySelector(`.${CSS_CLASSES.MESSAGE}`);
        if (messageElementExists) {
            this.plugin.logger.debug(`[checkAllMessagesForCollapsing] Group ${index + 1} has a .message element. Calling checkMessageForCollapsing.`);
            this.checkMessageForCollapsing(msgGroupEl);
        } else {
            this.plugin.logger.warn(`[checkAllMessagesForCollapsing] Group ${index + 1} SKIPPED (shouldProcess=true, but NO .message element).`, {
                timestamp: groupTimestampAttr,
                placeholderTimestamp: groupPlaceholderTimestampAttr,
                classes: groupClasses
            });
        }
      } else {
        this.plugin.logger.debug(`[checkAllMessagesForCollapsing] Group ${index + 1} will NOT be processed for collapsing. HasTimestamp: ${hasTimestamp}, IsPlaceholder: ${isPlaceholder}, ProcessingComplete: ${processingComplete}`);
      }
    });
    this.plugin.logger.debug("[checkAllMessagesForCollapsing] Finished scan.");
  }

  // src/OllamaView.ts

  public toggleMessageCollapse(contentEl: HTMLElement, buttonEl: HTMLButtonElement): void {
    const maxHeightLimit = this.plugin.settings.maxMessageHeight;
    if (maxHeightLimit <= 0) return; // Якщо згортання вимкнене

    const isCollapsed = contentEl.classList.contains(CSS_CLASSES.CONTENT_COLLAPSED);

    if (isCollapsed) { // Було згорнуто, тепер розгортаємо
      contentEl.style.maxHeight = ""; // Знімаємо обмеження
      contentEl.classList.remove(CSS_CLASSES.CONTENT_COLLAPSED);
      setIcon(buttonEl, "chevron-up");
      buttonEl.setAttribute("title", "Show Less");
      buttonEl.classList.add("explicitly-expanded"); // Позначаємо, що користувач розгорнув
    } else { // Було розгорнуто (або не було обмеження), тепер згортаємо
      contentEl.style.maxHeight = `${maxHeightLimit}px`;
      contentEl.classList.add(CSS_CLASSES.CONTENT_COLLAPSED);
      setIcon(buttonEl, "chevron-down");
      buttonEl.setAttribute("title", "Show More");
      buttonEl.classList.remove("explicitly-expanded"); // Знімаємо позначку

      // Плавна прокрутка до верху повідомлення, якщо воно згортається і може вийти за екран
      setTimeout(() => {
        const messageGroup = buttonEl.closest<HTMLElement>(`.${CSS_CLASSES.MESSAGE_GROUP}`);
        if (messageGroup && this.chatContainer) {
            const rect = messageGroup.getBoundingClientRect();
            const containerRect = this.chatContainer.getBoundingClientRect();

            // Якщо верхня частина повідомлення вище за видиму область контейнера
            if (rect.top < containerRect.top) { 
                 messageGroup.scrollIntoView({ behavior: "smooth", block: "start" });
            } 
            // Якщо нижня частина виходить за екран, і верхня частина не надто високо,
            // або якщо повідомлення повністю поза екраном знизу.
            else if (rect.bottom > containerRect.bottom && (rect.top > containerRect.top + (containerRect.height * 0.3) || rect.top >= containerRect.bottom) ) {
                 messageGroup.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        }
      }, 310); // Затримка має відповідати тривалості анімації max-height
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
        return fileName || "Unknown Role";
      }
    } catch (error) {
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
      } catch (e) {}
    });

    menu.addItem(item => {
      item
        .setTitle("Delete Chat")
        .setIcon("lucide-trash-2")
        .onClick(() => this.handleContextMenuDelete(chatMeta.id, chatMeta.name));
      try {
        (item as any).el.addClass("danger-option");
      } catch (e) {}
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

    public checkMessageForCollapsing(messageGroupEl: HTMLElement): void {
    const groupTimestampAttr = messageGroupEl.getAttribute("data-timestamp") || messageGroupEl.getAttribute("data-placeholder-timestamp");
    this.plugin.logger.debug(`[checkMessageForCollapsing] Entered for group with effective timestamp: ${groupTimestampAttr}.`);

    if (messageGroupEl.classList.contains("placeholder") && !messageGroupEl.hasAttribute("data-timestamp")) {
        this.plugin.logger.debug(`[checkMessageForCollapsing] Group (ts: ${groupTimestampAttr}) is a placeholder without final timestamp. Hiding toggle button.`);
        const tempToggleButton = messageGroupEl.querySelector<HTMLButtonElement>(`.${CSS_CLASSES.TOGGLE_COLLAPSE_BUTTON}`);
        if (tempToggleButton) tempToggleButton.hide();
        return;
    }
    
    const messageEl = messageGroupEl.querySelector<HTMLElement>(`.${CSS_CLASSES.MESSAGE}`);
    if (!messageEl) {
      this.plugin.logger.warn(`[checkMessageForCollapsing] No .message element found in group (ts: ${groupTimestampAttr}). Aborting for this group.`);
      return;
    }
    this.plugin.logger.debug(`[checkMessageForCollapsing] Found .message element for group (ts: ${groupTimestampAttr}).`);

    const contentCollapsible = messageEl.querySelector<HTMLElement>(`.${CSS_CLASSES.CONTENT_COLLAPSIBLE}`);
    const actionsWrapper = messageGroupEl.querySelector<HTMLElement>(`.${CSS_CLASSES.MESSAGE_ACTIONS}`);
    const toggleCollapseButton = actionsWrapper?.querySelector<HTMLButtonElement>(`.${CSS_CLASSES.TOGGLE_COLLAPSE_BUTTON}`);

    if (!toggleCollapseButton) {
        this.plugin.logger.debug(`[checkMessageForCollapsing] No TOGGLE_COLLAPSE_BUTTON found for group (ts: ${groupTimestampAttr}). Collapsing logic not applicable.`);
        if (contentCollapsible) {
            contentCollapsible.style.maxHeight = "";
            contentCollapsible.classList.remove(CSS_CLASSES.CONTENT_COLLAPSED);
             this.plugin.logger.debug(`[checkMessageForCollapsing] Ensured contentCollapsible is uncollapsed for group (ts: ${groupTimestampAttr}) as no button found.`);
        }
        return;
    }
     this.plugin.logger.debug(`[checkMessageForCollapsing] Found TOGGLE_COLLAPSE_BUTTON for group (ts: ${groupTimestampAttr}).`);

    if (!contentCollapsible) {
        this.plugin.logger.warn(`[checkMessageForCollapsing] No CONTENT_COLLAPSIBLE element found for group (ts: ${groupTimestampAttr}), but button exists. Hiding button.`);
        toggleCollapseButton.hide();
        toggleCollapseButton.classList.remove("explicitly-expanded");
        return;
    }
    this.plugin.logger.debug(`[checkMessageForCollapsing] Found CONTENT_COLLAPSIBLE for group (ts: ${groupTimestampAttr}).`);
    
    const maxH = this.plugin.settings.maxMessageHeight;
    this.plugin.logger.debug(`[checkMessageForCollapsing] maxMessageHeight setting: ${maxH} for group (ts: ${groupTimestampAttr}).`);

    const isStreamingNow = this.isProcessing && 
                           messageGroupEl.classList.contains("placeholder") && 
                           contentCollapsible.classList.contains("streaming-text");

    if (isStreamingNow) {
      this.plugin.logger.debug(`[checkMessageForCollapsing] Group (ts: ${groupTimestampAttr}) IS actively streaming. Hiding button, uncollapsing content.`);
      toggleCollapseButton.hide(); 
      contentCollapsible.style.maxHeight = ""; 
      contentCollapsible.classList.remove(CSS_CLASSES.CONTENT_COLLAPSED);
      return;
    }

    if (maxH <= 0) { 
      this.plugin.logger.debug(`[checkMessageForCollapsing] maxMessageHeight <= 0 for group (ts: ${groupTimestampAttr}). Hiding button, uncollapsing content.`);
      toggleCollapseButton.hide();
      toggleCollapseButton.classList.remove("explicitly-expanded");
      contentCollapsible.style.maxHeight = "";
      contentCollapsible.classList.remove(CSS_CLASSES.CONTENT_COLLAPSED);
      return;
    }

    this.plugin.logger.debug(`[checkMessageForCollapsing] Proceeding to rAF for group (ts: ${groupTimestampAttr}).`);
    requestAnimationFrame(() => {
      this.plugin.logger.debug(`[checkMessageForCollapsing rAF] Entered for group (ts: ${groupTimestampAttr}).`);
      if (!contentCollapsible.isConnected || !toggleCollapseButton.isConnected) {
        this.plugin.logger.debug(`[checkMessageForCollapsing rAF] Elements disconnected for group (ts: ${groupTimestampAttr}). Aborting rAF.`);
        return;
      }

      const wasExplicitlyExpanded = toggleCollapseButton.classList.contains("explicitly-expanded");
      this.plugin.logger.debug(`[checkMessageForCollapsing rAF] Group (ts: ${groupTimestampAttr}): wasExplicitlyExpanded = ${wasExplicitlyExpanded}.`);
      
      // Запам'ятовуємо стиль, якщо він був встановлений, ДО того як ми його скинемо
      // Це важливо, якщо rAF викликається кілька разів і вміст не змінився
      const currentMaxHeightStyle = contentCollapsible.style.maxHeight;
      const currentlyCollapsed = contentCollapsible.classList.contains(CSS_CLASSES.CONTENT_COLLAPSED);

      contentCollapsible.style.maxHeight = ""; // Знімаємо обмеження для вимірювання
      const scrollHeight = contentCollapsible.scrollHeight;
      this.plugin.logger.debug(`[checkMessageForCollapsing rAF] Group (ts: ${groupTimestampAttr}): scrollHeight = ${scrollHeight}, maxH = ${maxH}.`);
      
      if (scrollHeight > maxH) {
        this.plugin.logger.debug(`[checkMessageForCollapsing rAF] Group (ts: ${groupTimestampAttr}): scrollHeight > maxH. Button should be visible.`);
        toggleCollapseButton.show();
        
        if (wasExplicitlyExpanded) {
            this.plugin.logger.debug(`[checkMessageForCollapsing rAF] Group (ts: ${groupTimestampAttr}): Was explicitly expanded. Uncollapsing.`);
            contentCollapsible.style.maxHeight = ""; 
            contentCollapsible.classList.remove(CSS_CLASSES.CONTENT_COLLAPSED);
            setIcon(toggleCollapseButton, "chevron-up");
            toggleCollapseButton.setAttribute("title", "Show Less");
        } else {
            this.plugin.logger.debug(`[checkMessageForCollapsing rAF] Group (ts: ${groupTimestampAttr}): Not explicitly expanded. Collapsing.`);
            contentCollapsible.style.maxHeight = `${maxH}px`;
            contentCollapsible.classList.add(CSS_CLASSES.CONTENT_COLLAPSED);
            setIcon(toggleCollapseButton, "chevron-down");
            toggleCollapseButton.setAttribute("title", "Show More");
        }
      } else { 
        this.plugin.logger.debug(`[checkMessageForCollapsing rAF] Group (ts: ${groupTimestampAttr}): scrollHeight <= maxH. Button should be hidden.`);
        toggleCollapseButton.hide();
        if (wasExplicitlyExpanded) {
            toggleCollapseButton.classList.remove("explicitly-expanded");
            this.plugin.logger.debug(`[checkMessageForCollapsing rAF] Group (ts: ${groupTimestampAttr}): Removing 'explicitly-expanded' as content is now short.`);
        }
        contentCollapsible.style.maxHeight = ""; 
        contentCollapsible.classList.remove(CSS_CLASSES.CONTENT_COLLAPSED);
      }
      this.plugin.logger.debug(`[checkMessageForCollapsing rAF] Finished for group (ts: ${groupTimestampAttr}). Final state: button visible = ${toggleCollapseButton.style.display !== 'none'}, collapsed = ${contentCollapsible.classList.contains(CSS_CLASSES.CONTENT_COLLAPSED)}`);
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
        return;
      }

      contentContainer.empty();

      if (summary) {
        contentContainer.setText(`Multiple errors occurred. Summary:\n${summary}`);
      } else {
        this.displayErrorListFallback(targetGroupElement, errors);
      }
    } catch (error) {
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
      const responseData: OllamaGenerateResponse = await this.plugin.ollamaService.generateRaw(requestBody);
      if (responseData && responseData.response) {
        return responseData.response.trim();
      } else {
        return null;
      }
    } catch (error) {
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
      try {
      } catch {}
    }
  }

  async sendMessage(): Promise<void> {
    const userInputText = this.inputEl.value.trim();
    const requestTimestampId = Date.now();

    if (!userInputText || this.isProcessing || this.currentAbortController) {
      if (this.isProcessing || this.currentAbortController)
        new Notice("Please wait or cancel current operation.", 3000);
      return;
    }

    let activeChat = await this.plugin.chatManager.getActiveChat();
    if (!activeChat) {
      activeChat = await this.plugin.chatManager.createNewChat();
      if (!activeChat) {
        new Notice("Error: No active chat and could not create one.");
        this.setLoadingState(false); // Важливо скинути стан, якщо чат не створено
        return;
      }
      new Notice(`Started new chat: ${activeChat.metadata.name}`);
    }
    const userMessageTimestamp = new Date();

    this.clearInputField();
    this.currentAbortController = new AbortController();
    this.setLoadingState(true);
    this.hideEmptyState();

    const initialLlmResponsePlaceholderTs = Date.now();

    try {
      const userMessageAdded = await this.plugin.chatManager.addUserMessageAndAwaitRender(
        userInputText,
        userMessageTimestamp,
        requestTimestampId
      );
      if (!userMessageAdded) {
        throw new Error("User message processing failed in ChatManager.");
      }

      const chatStateForLlm = await this.plugin.chatManager.getActiveChatOrFail();

      if (!this.currentAbortController) {
        // Ця помилка не має виникати, якщо AbortController створюється вище
        this.plugin.logger.error(
          "CRITICAL: AbortController not initialized in sendMessage before LlmInteractionCycle call."
        );
        throw new Error("AbortController not initialized in sendMessage");
      }
      await this._handleLlmInteractionCycle(chatStateForLlm, requestTimestampId, this.currentAbortController.signal);
    } catch (error: any) {
      if (
        this.activePlaceholder &&
        this.activePlaceholder.timestamp === initialLlmResponsePlaceholderTs &&
        this.activePlaceholder.groupEl.classList.contains("placeholder")
      ) {
        if (this.activePlaceholder.groupEl.isConnected) this.activePlaceholder.groupEl.remove();
      }

      this.plugin.chatManager.rejectAndClearHMAResolver(
        userMessageTimestamp.getTime(),
        `Outer catch in sendMessage for user message (req: ${requestTimestampId})`
      );
      this.plugin.chatManager.rejectAndClearHMAResolver(
        initialLlmResponsePlaceholderTs,
        `Outer catch in sendMessage for initial placeholder (req: ${requestTimestampId})`
      );

      let errorMsgForChat: string;
      let errorMsgRole: MessageRole = "error";
      if (error.name === "AbortError" || error.message?.includes("aborted by user")) {
        errorMsgForChat = "Message generation stopped.";
        errorMsgRole = "system";
      } else {
        errorMsgForChat = `Error: ${error.message || "Unknown error during processing."}`;
        new Notice(errorMsgForChat, 7000);
      }
      const errorDisplayTimestamp = new Date();
      const errorDisplayMsg: Message = {
        role: errorMsgRole,
        content: errorMsgForChat,
        timestamp: errorDisplayTimestamp,
      };

      const hmaErrorPromise = new Promise<void>((resolve, reject) => {
        this.plugin.chatManager.registerHMAResolver(errorDisplayMsg.timestamp.getTime(), resolve, reject);
        setTimeout(() => {
          if (this.plugin.chatManager.messageAddedResolvers.has(errorDisplayMsg.timestamp.getTime())) {
            this.plugin.chatManager.rejectAndClearHMAResolver(
              errorDisplayMsg.timestamp.getTime(),
              "HMA timeout for error display msg in sendMessage"
            );
          }
        }, 10000);
      });
      await this.plugin.chatManager.addMessageToActiveChatPayload(errorDisplayMsg, true);
      try {
        await hmaErrorPromise;
      } catch (e_hma) {
        this.plugin.logger.warn("[SendMessage] HMA for error display message failed or timed out:", e_hma);
      }
    } finally {
      if (this.activePlaceholder && this.activePlaceholder.groupEl.classList.contains("placeholder")) {
        if (this.activePlaceholder.groupEl.isConnected) this.activePlaceholder.groupEl.remove();
      }
      this.activePlaceholder = null;
      this.currentAbortController = null;
      this.setLoadingState(false);
      requestAnimationFrame(() => this.updateSendButtonState());
      this.focusInput();
    }
  }

  private handleMenuButtonClick = (e: MouseEvent): void => {
    this.dropdownMenuManager?.toggleMenu(e);
  };

  private onDragStart = (event: MouseEvent): void => {
    if (event.button !== 0) return;

    this.isResizing = true;
    this.initialMouseX = event.clientX;

    this.initialSidebarWidth = this.sidebarRootEl?.offsetWidth || 250;

    event.preventDefault();
    event.stopPropagation();

    document.addEventListener("mousemove", this.boundOnDragMove, { capture: true });
    document.addEventListener("mouseup", this.boundOnDragEnd, { capture: true });

    document.body.style.cursor = "ew-resize";
    document.body.classList.add(CSS_CLASS_RESIZING);
  };

  private onDragMove = (event: MouseEvent): void => {
    if (!this.isResizing || !this.sidebarRootEl) return;

    requestAnimationFrame(() => {
      if (!this.isResizing || !this.sidebarRootEl) return;

      const currentMouseX = event.clientX;
      const deltaX = currentMouseX - this.initialMouseX;
      let newWidth = this.initialSidebarWidth + deltaX;

      const minWidth = 150;
      const containerWidth = this.contentEl.offsetWidth;

      const maxWidth = Math.max(minWidth + 50, containerWidth * 0.6);

      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;

      this.sidebarRootEl.style.width = `${newWidth}px`;
      this.sidebarRootEl.style.minWidth = `${newWidth}px`;
    });
  };

  private onDragEnd = (): void => {
    if (!this.isResizing) return;

    this.isResizing = false;

    document.removeEventListener("mousemove", this.boundOnDragMove, { capture: true });
    document.removeEventListener("mouseup", this.boundOnDragEnd, { capture: true });
    document.body.style.cursor = "";
    document.body.classList.remove(CSS_CLASS_RESIZING);

    this.saveWidthDebounced();
  };

  // src/OllamaView.ts

  // ... (інші імпорти та частина класу) ...

  private async handleMessageAdded(data: { chatId: string; message: Message }): Promise<void> {
    const messageForLog = data?.message;
    const messageTimestampForLog = messageForLog?.timestamp?.getTime(); // Використовуємо ?. для безпеки
    const messageRoleForLog = messageForLog?.role as MessageRole; // Припускаємо, що MessageRole з OllamaView

    // Логуємо вхідну подію
    this.plugin.logger.debug(
      `[handleMessageAdded] Received message event for chat ${data.chatId}. Message role: ${messageRoleForLog}, timestamp: ${messageTimestampForLog}`,
      {
        role: messageForLog?.role,
        contentPreview: messageForLog?.content?.substring(0, 50) + "...",
        tool_calls: (messageForLog as AssistantMessage)?.tool_calls,
      }
    );

    try {
      // 1. Базові перевірки на валідність даних
      if (!data || !data.message || !messageForLog || !messageTimestampForLog) {
        // Перевіряємо і messageTimestampForLog

        if (messageTimestampForLog) this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
        return;
      }

      const { chatId: eventChatId, message } = data; // message тут гарантовано є
      const messageTimestampMs = messageTimestampForLog; // Тепер це те саме, що message.timestamp.getTime()

      // Логування оброблюваного повідомлення
      this.plugin.logger.debug(`[handleMessageAdded] Processing message:`, {
        id: messageTimestampMs,
        role: message.role,
        content: message.content?.substring(0, 100) + (message.content && message.content.length > 100 ? "..." : ""),
        tool_calls: (message as AssistantMessage).tool_calls, // Приводимо до AssistantMessage для доступу до tool_calls
      });

      // 2. Перевірка наявності chatContainer та chatManager
      if (!this.chatContainer || !this.plugin.chatManager) {
        this.plugin.chatManager.invokeHMAResolver(messageTimestampMs);
        return;
      }

      // 3. Перевірка, чи повідомлення для активного чату
      const activeChatId = this.plugin.chatManager.getActiveChatId();
      if (eventChatId !== activeChatId) {
        this.plugin.chatManager.invokeHMAResolver(messageTimestampMs);
        return;
      }

      // 4. Визначення умов для спеціальної обробки
      const isAssistant = message.role === "assistant";
      const hasToolCalls = !!(
        (message as AssistantMessage).tool_calls && (message as AssistantMessage).tool_calls!.length > 0
      );
      // isActiveCycle: Перевіряємо, чи є активний AbortController (або інший індикатор активного LLM циклу)
      const isActiveCycle = !!this.currentAbortController; // Ти використовував currentAbortController

      // --- КЛЮЧОВА ЗМІНА ЛОГІКИ ---
      // 5. Пропуск рендерингу для повідомлень асистента з tool_calls
      // Це має відбуватися НЕЗАЛЕЖНО від isActiveCycle, якщо ми хочемо приховати їх і при перезавантаженні.
      if (isAssistant && hasToolCalls) {
        this.plugin.logger.info(
          `[handleMessageAdded] INTENDED SKIP: Skipping render for assistant message with tool_calls (role: ${message.role}, ts: ${messageTimestampMs}). This message is for tool execution only.`,
          {
            contentPreview: message.content?.substring(0, 70) + "...",
            tool_calls: (message as AssistantMessage).tool_calls,
          }
        );

        // Видаляємо плейсхолдер, якщо він був створений для цього конкретного повідомлення
        // (малоймовірно для assistant+tool_calls, але для повноти)
        if (this.activePlaceholder && this.activePlaceholder.timestamp === messageTimestampMs) {
          if (this.activePlaceholder.groupEl.isConnected) {
            this.activePlaceholder.groupEl.remove();
          }
          this.activePlaceholder = null;
        }
        // Також, якщо це повідомлення було в currentMessages (наприклад, додане ChatManager), але не буде рендеритися,
        // його можна прибрати, щоб не впливати на логіку "alreadyInLogicCache" для майбутніх повідомлень.
        // Або ж, якщо воно має бути в історії для логіки LLM, але не для UI.
        // Поки що залишимо його в this.currentMessages, якщо ChatManager його туди додає.

        this.plugin.chatManager.invokeHMAResolver(messageTimestampMs); // Завершуємо HMA
        return; // Повністю виходимо, не рендеримо це повідомлення
      }

      // 6. Запобігання повторному рендерингу вже існуючих повідомлень
      const existingRenderedMessage = this.chatContainer.querySelector(
        `.${CSS_CLASSES.MESSAGE_GROUP}:not(.placeholder)[data-timestamp="${messageTimestampMs}"]`
      );
      if (existingRenderedMessage) {
        this.plugin.chatManager.invokeHMAResolver(messageTimestampMs);
        return;
      }

      // 7. Перевірка, чи повідомлення вже є в логічному кеші (this.currentMessages)
      // Це може допомогти уникнути дублювання, якщо подія прийшла двічі до рендерингу.
      const isAlreadyInLogicCache = this.currentMessages.some(
        m => m.timestamp.getTime() === messageTimestampMs && m.role === message.role
        // Порівняння контенту може бути надлишковим і дорогим, якщо ID (timestamp) унікальний
        // && m.content === message.content
      );

      // Визначаємо, чи це повідомлення асистента призначене для оновлення активного плейсхолдера
      const isPotentiallyAssistantForPlaceholder =
        isAssistant && // Це повідомлення асистента
        !hasToolCalls && // І воно НЕ має tool_calls (бо такі ми вже пропустили)
        this.activePlaceholder?.timestamp === messageTimestampMs; // І є активний плейсхолдер для нього

      if (isAlreadyInLogicCache && !isPotentiallyAssistantForPlaceholder) {
        // Якщо повідомлення вже в кеші І воно не для оновлення плейсхолдера,
        // то, ймовірно, це дублікат або вже оброблена ситуація.

        this.plugin.chatManager.invokeHMAResolver(messageTimestampMs);
        return;
      }

      // Додаємо в логічний кеш, якщо ще не там (або якщо це для плейсхолдера, то воно вже може бути там)
      if (!isAlreadyInLogicCache) {
        this.currentMessages.push(message); // Зберігаємо оригінальне повідомлення з Date об'єктом
      }

      // 8. Логіка рендерингу: оновлення плейсхолдера або додавання нового повідомлення
      if (isPotentiallyAssistantForPlaceholder && this.activePlaceholder) {
        const placeholderToUpdate = this.activePlaceholder; // Зберігаємо посилання
        this.activePlaceholder = null; // Очищаємо activePlaceholder перед асинхронними операціями

        if (
          placeholderToUpdate.groupEl?.isConnected &&
          placeholderToUpdate.contentEl &&
          placeholderToUpdate.messageWrapper
        ) {
          placeholderToUpdate.groupEl.classList.remove("placeholder");
          placeholderToUpdate.groupEl.removeAttribute("data-placeholder-timestamp");
          placeholderToUpdate.groupEl.setAttribute("data-timestamp", messageTimestampMs.toString());

          const messageDomElement = placeholderToUpdate.groupEl.querySelector(
            `.${CSS_CLASSES.MESSAGE}`
          ) as HTMLElement | null;

          if (!messageDomElement) {
            if (placeholderToUpdate.groupEl.isConnected) placeholderToUpdate.groupEl.remove();
            // this.activePlaceholder = null; // Вже очищено
            await this.addMessageStandard(message);
          } else {
            placeholderToUpdate.contentEl.classList.remove("streaming-text");
            const dotsEl = placeholderToUpdate.contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
            if (dotsEl) dotsEl.remove();

            try {
              const displayContent = AssistantMessageRenderer.prepareDisplayContent(
                message.content || "",
                message as AssistantMessage, // message тут вже не має tool_calls, бо ми їх відфільтрували
                this.plugin,
                this
              );
              placeholderToUpdate.contentEl.empty(); // Очищаємо вміст перед новим рендерингом
              await RendererUtils.renderMarkdownContent(
                this.app,
                this,
                this.plugin,
                placeholderToUpdate.contentEl,
                displayContent
              );
              AssistantMessageRenderer.addAssistantActionButtons(
                messageDomElement,
                placeholderToUpdate.contentEl,
                message as AssistantMessage,
                this.plugin,
                this
              );
                  const metaActionsWrapper = messageDomElement.createDiv({ cls: "message-meta-actions-wrapper" });

              BaseMessageRenderer.addTimestampToElement(metaActionsWrapper, message.timestamp, this);

              this.lastMessageElement = placeholderToUpdate.groupEl;
              this.hideEmptyState();
              const finalMessageGroupElement = placeholderToUpdate.groupEl; // Зберігаємо для setTimeout
              // this.activePlaceholder = null; // Вже очищено

              // Асинхронна перевірка на згортання
              setTimeout(() => {
                if (finalMessageGroupElement?.isConnected) this.checkMessageForCollapsing(finalMessageGroupElement);
              }, 70);
              this.guaranteedScrollToBottom(100, true); // Прокрутка
            } catch (renderError: any) {
              if (placeholderToUpdate.groupEl.isConnected) placeholderToUpdate.groupEl.remove();
              // this.activePlaceholder = null; // Вже очищено
              this.handleErrorMessage({
                role: "error",
                content: `Failed to finalize display for ts ${messageTimestampMs}: ${renderError.message}`,
                timestamp: new Date(),
              });
            }
          }
        } else {
          // this.activePlaceholder = null; // Вже очищено
          await this.addMessageStandard(message);
        }
      } else {
        // Якщо не оновлення плейсхолдера, то стандартне додавання
        // Це включає повідомлення користувача, інструментів, помилок,
        // а також повідомлення асистента, якщо для них не було плейсхолдера (наприклад, при завантаженні історії)

        await this.addMessageStandard(message);
      }
    } catch (outerError: any) {
      this.handleErrorMessage({
        role: "error",
        content: `Internal error in handleMessageAdded for ${messageRoleForLog} msg (ts ${messageTimestampForLog}): ${
          outerError.message || "Unknown error"
        }`,
        timestamp: new Date(),
      });
    } finally {
      // Гарантовано викликаємо резолвер, якщо він ще існує
      if (messageTimestampForLog && this.plugin.chatManager.messageAddedResolvers.has(messageTimestampForLog)) {
        this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
      } else if (messageTimestampForLog) {
        // Якщо резолвера вже немає, логуємо це, щоб розуміти потік
      }
    }
  }

  // ... (решта коду класу) ...

  private scheduleSidebarChatListUpdate = (delay: number = 50): void => {
    if (this.chatListUpdateTimeoutId) {
      clearTimeout(this.chatListUpdateTimeoutId);
    } else {
      if (this.isChatListUpdateScheduled) {
        return;
      }
      this.isChatListUpdateScheduled = true;
    }

    this.chatListUpdateTimeoutId = setTimeout(() => {
      if (this.sidebarManager?.isSectionVisible("chats")) {
        this.sidebarManager
          .updateChatList()
          .catch(e => this.plugin.logger.error("Error updating chat panel list via scheduleSidebarChatListUpdate:", e));
      }

      this.chatListUpdateTimeoutId = null;
      this.isChatListUpdateScheduled = false;
    }, delay);
  };

  // src/OllamaView.ts

  // ... (припускаємо, що всі необхідні імпорти, CSS_CLASSES, RendererUtils, рендерери повідомлень, etc. вже є) ...

  async loadAndDisplayActiveChat(): Promise<{ metadataUpdated: boolean }> {
    let metadataUpdated = false;

    try {
      this.clearChatContainerInternal(); // Очищає this.chatContainer та this.currentMessages

      this.lastMessageElement = null;
      this.consecutiveErrorMessages = []; // Скидаємо лічильник послідовних помилок
      this.errorGroupElement = null; // Скидаємо групу помилок

      let activeChat: Chat | null = null;
      let availableModels: string[] = [];
      let finalModelName: string | null = null;
      let finalRolePath: string | null | undefined = undefined; // Дозволяємо undefined для початкового стану
      let finalRoleName: string = "None"; // Значення за замовчуванням
      let finalTemperature: number | null | undefined = undefined; // Дозволяємо undefined
      let errorOccurredLoadingData = false;

      // Блок завантаження даних чату та моделей
      try {
        if (!this.plugin.chatManager) {
          throw new Error("ChatManager is not initialized.");
        }
        activeChat = (await this.plugin.chatManager.getActiveChat()) || null;

        if (!this.plugin.ollamaService) {
          throw new Error("OllamaService is not initialized.");
        }
        availableModels = await this.plugin.ollamaService.getModels();

        // Визначаємо шлях та ім'я ролі
        finalRolePath =
          activeChat?.metadata?.selectedRolePath !== undefined // Спочатку з метаданих чату
            ? activeChat.metadata.selectedRolePath
            : this.plugin.settings.selectedRolePath; // Потім з налаштувань плагіна
        finalRoleName = await this.findRoleNameByPath(finalRolePath); // findRoleNameByPath має обробляти null/undefined
      } catch (error: any) {
        new Notice("Error connecting to Ollama or loading chat data.", 5000);
        errorOccurredLoadingData = true;

        // Встановлюємо значення за замовчуванням у разі помилки
        availableModels = availableModels || []; // Переконуємося, що це масив
        finalModelName = availableModels.includes(this.plugin.settings.modelName)
          ? this.plugin.settings.modelName
          : availableModels[0] ?? null; // Якщо модель з налаштувань недоступна, беремо першу або null
        finalTemperature = this.plugin.settings.temperature;
        finalRolePath = this.plugin.settings.selectedRolePath;
        finalRoleName = await this.findRoleNameByPath(finalRolePath); // Повторно, на випадок якщо попередня спроба не вдалася
        activeChat = null; // Скидаємо активний чат
      }

      // Визначення фінальної моделі та температури
      if (!errorOccurredLoadingData && activeChat) {
        let preferredModel = activeChat.metadata?.modelName || this.plugin.settings.modelName;
        if (availableModels.length > 0) {
          if (preferredModel && availableModels.includes(preferredModel)) {
            finalModelName = preferredModel;
          } else {
            // Якщо бажана модель недоступна, встановлюємо першу доступну
            finalModelName = availableModels[0];
          }
        } else {
          finalModelName = null; // Немає доступних моделей
        }

        // Оновлення метаданих чату, якщо модель змінилася
        if (activeChat.metadata.modelName !== finalModelName && finalModelName !== null) {
          try {
            if (!this.plugin.chatManager) throw new Error("ChatManager not available for metadata update.");
            const updateSuccess = await this.plugin.chatManager.updateActiveChatMetadata({ modelName: finalModelName });
            if (updateSuccess) {
              metadataUpdated = true;

              // Перезавантажуємо дані чату, щоб отримати оновлені метадані
              const potentiallyUpdatedChat = await this.plugin.chatManager.getChat(activeChat.metadata.id);
              if (potentiallyUpdatedChat) activeChat = potentiallyUpdatedChat;
            } else {
            }
          } catch (updateError) {}
        }
        finalTemperature = activeChat.metadata?.temperature ?? this.plugin.settings.temperature;
      } else if (!errorOccurredLoadingData && !activeChat) {
        // Якщо чат не завантажено, але не було помилки (наприклад, немає активного)
        finalModelName = availableModels.includes(this.plugin.settings.modelName)
          ? this.plugin.settings.modelName
          : availableModels[0] ?? null;
        finalTemperature = this.plugin.settings.temperature;
        // finalRolePath and finalRoleName вже встановлені раніше
      }

      // Рендеринг повідомлень
      if (activeChat && !errorOccurredLoadingData && activeChat.messages?.length > 0) {
        this.hideEmptyState();
        // this.currentMessages вже очищено в clearChatContainerInternal, заповнюємо його знову
        this.currentMessages = [...activeChat.messages];
        this.lastRenderedMessageDate = null; // Скидаємо для розділювачів дат

        for (const message of this.currentMessages) {
          let messageGroupEl: HTMLElement | null = null;

          // Перевірка на пропуск рендерингу для assistant + tool_calls
          const isAssistant = message.role === "assistant";
          const hasToolCalls = !!(
            (message as AssistantMessage).tool_calls && (message as AssistantMessage).tool_calls!.length > 0
          );

          if (isAssistant && hasToolCalls) {
            this.plugin.logger.info(
              `[loadAndDisplayActiveChat] SKIPPING RENDER for HISTORICAL assistant message with tool_calls (ts: ${message.timestamp.getTime()})`,
              {
                contentPreview: message.content?.substring(0, 70),
                tool_calls: (message as AssistantMessage).tool_calls,
              }
            );
            continue; // Пропускаємо решту циклу для цього повідомлення
          }

          // Логіка для розділювачів дат
          const isNewDay =
            !this.lastRenderedMessageDate || !this.isSameDay(this.lastRenderedMessageDate, message.timestamp);
          // isFirstMessageInContainer тепер перевіряє реальну кількість дітей в DOM, а не this.currentMessages.length
          const isFirstRenderedMessageInContainer = this.chatContainer.children.length === 0;

          if (isNewDay || isFirstRenderedMessageInContainer) {
            if (isNewDay && !isFirstRenderedMessageInContainer) {
              // Не додаємо розділювач перед першим повідомленням
              this.renderDateSeparator(message.timestamp);
            }
            this.lastRenderedMessageDate = message.timestamp; // Оновлюємо дату останнього ВІДРЕНДЕРЕНОГО повідомлення
          }

          // Створення та рендеринг повідомлення
          try {
            let renderer:
              | UserMessageRenderer
              | AssistantMessageRenderer
              | SystemMessageRenderer
              | ErrorMessageRenderer
              | ToolMessageRenderer
              | null = null;

            switch (message.role) {
              case "user":
                renderer = new UserMessageRenderer(this.app, this.plugin, message, this);
                break;
              case "assistant": // Це буде асистент БЕЗ tool_calls
                renderer = new AssistantMessageRenderer(this.app, this.plugin, message as AssistantMessage, this);
                break;
              case "system":
                renderer = new SystemMessageRenderer(this.app, this.plugin, message, this);
                break;
              case "error":
                this.handleErrorMessage(message); // Обробляє і додає до DOM
                messageGroupEl = this.errorGroupElement; // Якщо handleErrorMessage його встановлює
                break;
              case "tool":
                renderer = new ToolMessageRenderer(this.app, this.plugin, message, this);
                break;
              default:
                const unknownRoleGroup = this.chatContainer?.createDiv({ cls: CSS_CLASSES.MESSAGE_GROUP });
                if (unknownRoleGroup && this.chatContainer) {
                  RendererUtils.renderAvatar(this.app, this.plugin, unknownRoleGroup, false); // Аватар за замовчуванням
                  const wrapper = unknownRoleGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
                  const msgBubble = wrapper.createDiv({ cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.SYSTEM_MESSAGE}` });
                  msgBubble.createDiv({
                    cls: CSS_CLASSES.SYSTEM_MESSAGE_TEXT || "system-message-text",
                    text: `Unknown message role: ${(message as any).role}`, // Використовуємо as any для безпеки
                  });
                                    const metaActionsWrapper = msgBubble.createDiv({ cls: "message-meta-actions-wrapper" });

              BaseMessageRenderer.addTimestampToElement(metaActionsWrapper, message.timestamp, this);

                  messageGroupEl = unknownRoleGroup;
                }
                break;
            }

            if (renderer && message.role !== "error") {
              // Помилки обробляються окремо
              const result = renderer.render();
              messageGroupEl = result instanceof Promise ? await result : result;
            }
          } catch (renderError: any) {
            // Створюємо елемент помилки рендерингу
            const errorDiv = this.chatContainer.createDiv({ cls: CSS_CLASSES.ERROR_MESSAGE || "render-error" }); // Переконайся, що CSS_CLASSES.ERROR_MESSAGE визначено
            errorDiv.setText(`Error rendering message (role: ${message.role}): ${renderError.message}`);
            messageGroupEl = errorDiv;
          }

          if (messageGroupEl) {
            // Додаємо елемент, тільки якщо він ще не є дочірнім (наприклад, handleErrorMessage міг вже додати)
            if (messageGroupEl.parentElement !== this.chatContainer) {
              this.chatContainer.appendChild(messageGroupEl);
            }
            this.lastMessageElement = messageGroupEl;
          }
        } // Кінець циклу for

        // Асинхронні оновлення після рендерингу всіх повідомлень
        setTimeout(() => this.checkAllMessagesForCollapsing(), 100);
        setTimeout(() => {
          this.guaranteedScrollToBottom(100, true); // Чекаємо трохи, щоб DOM оновився
          setTimeout(() => {
            this.updateScrollStateAndIndicators(); // Оновлюємо індикатори прокрутки
          }, 150); // Додаткова затримка для стабілізації прокрутки
        }, 150);
      } else {
        // Якщо немає повідомлень або сталася помилка завантаження даних чату
        this.showEmptyState(errorOccurredLoadingData ? "Error loading chat." : "This chat is empty.");
        this.scrollToBottomButton?.classList.remove(CSS_CLASSES.VISIBLE || "visible"); // Переконайся, що CSS_CLASSES.VISIBLE визначено
      }

      // Оновлення елементів UI (заголовок, модель, температура і т.д.)
      this.updateInputPlaceholder(finalRoleName);
      this.updateRoleDisplay(finalRoleName);
      this.updateModelDisplay(finalModelName);
      this.updateTemperatureIndicator(finalTemperature);

      // Оновлення стану інпут поля та кнопки відправки
      if (finalModelName === null) {
        // Якщо немає доступних моделей
        if (this.inputEl) {
          this.inputEl.disabled = true;
          this.inputEl.placeholder = "No models available...";
        }
        if (this.sendButton) {
          this.sendButton.disabled = true;
          this.sendButton.classList.add(CSS_CLASSES.DISABLED || "disabled"); // Переконайся, що CSS_CLASSES.DISABLED визначено
        }
        if (this.isProcessing) this.setLoadingState(false); // Скидаємо стан завантаження, якщо він був активний
      } else {
        // Якщо моделі є
        if (this.inputEl && !this.isProcessing) {
          // Розблоковуємо інпут, якщо не йде обробка
          this.inputEl.disabled = false;
        }
        this.updateSendButtonState(); // Оновлюємо стан кнопки відправки
      }
    } catch (error: any) {
      this.clearChatContainerInternal(); // Очищаємо все
      this.showEmptyState("Fatal error."); // Показуємо стан помилки
      if (this.chatContainer) {
        this.chatContainer.createDiv({
          cls: "fatal-error-message", // Клас для повідомлення про фатальну помилку
          text: "A critical error occurred while loading the chat. Please check the console or try restarting.",
        });
      }
      // Тут не повертаємо metadataUpdated, бо сталася фатальна помилка
      return { metadataUpdated: false }; // Або можна кинути помилку далі
    } finally {
      // Можна додати логування завершення методу
    }

    return { metadataUpdated };
  }

  private handleActiveChatChanged = async (data: { chatId: string | null; chat: Chat | null }): Promise<void> => {
    if (this.isRegenerating && data.chatId === this.plugin.chatManager.getActiveChatId()) {
      this.lastProcessedChatId = data.chatId;
      return;
    }

    const chatSwitched = data.chatId !== this.lastProcessedChatId;
    let metadataWasUpdatedByLoad = false;

    if (chatSwitched || (data.chatId !== null && data.chat === null)) {
      this.lastProcessedChatId = data.chatId;

      const result = await this.loadAndDisplayActiveChat();
      metadataWasUpdatedByLoad = result.metadataUpdated;
    } else if (data.chatId !== null && data.chat !== null) {
      this.lastProcessedChatId = data.chatId;
      const chat = data.chat;

      const currentRolePath = chat.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;
      const currentRoleName = await this.findRoleNameByPath(currentRolePath);
      const currentModelName = chat.metadata?.modelName || this.plugin.settings.modelName;
      const currentTemperature = chat.metadata?.temperature ?? this.plugin.settings.temperature;

      this.updateModelDisplay(currentModelName);
      this.updateRoleDisplay(currentRoleName);
      this.updateInputPlaceholder(currentRoleName);
      this.updateTemperatureIndicator(currentTemperature);
    } else if (data.chatId === null) {
      this.lastProcessedChatId = null;
      this.clearDisplayAndState();
    } else {
      this.lastProcessedChatId = data.chatId;
    }

    if (!metadataWasUpdatedByLoad) {
      this.scheduleSidebarChatListUpdate();
    } else {
    }

    if (this.sidebarManager?.isSectionVisible("roles")) {
      this.sidebarManager
        .updateRoleList()
        .catch(e => this.plugin.logger.error("Error updating role panel list in handleActiveChatChanged:", e));
    }

    if (this.dropdownMenuManager) {
      this.dropdownMenuManager
        .updateRoleListIfVisible()
        .catch(e => this.plugin.logger.error("Error updating role dropdown list in handleActiveChatChanged:", e));
    }
  };

  private _managePlaceholder(turnTimestamp: number, requestTimestampId: number): void {
    if (this.activePlaceholder && this.activePlaceholder.timestamp !== turnTimestamp) {
      if (this.activePlaceholder.groupEl.classList.contains("placeholder")) {
        if (this.activePlaceholder.groupEl.isConnected) this.activePlaceholder.groupEl.remove();
      }
      this.activePlaceholder = null;
    }

    if (!this.activePlaceholder) {
      const placeholderGroupEl = this.chatContainer.createDiv({
        cls: `${CSS_CLASSES.MESSAGE_GROUP} ${CSS_CLASSES.OLLAMA_GROUP} placeholder`,
      });
      placeholderGroupEl.setAttribute("data-placeholder-timestamp", turnTimestamp.toString());
      RendererUtils.renderAvatar(this.app, this.plugin, placeholderGroupEl, false, "assistant");
      const wrapperEl = placeholderGroupEl.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
      wrapperEl.style.order = "2";
      const msgEl = wrapperEl.createDiv({ cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.OLLAMA_MESSAGE}` });
      const contentContainerEl = msgEl.createDiv({ cls: CSS_CLASSES.CONTENT_CONTAINER });
      const contentPlaceholderEl = contentContainerEl.createDiv({
        cls: `${CSS_CLASSES.CONTENT} ${CSS_CLASSES.CONTENT_COLLAPSIBLE} streaming-text`,
      });
      contentPlaceholderEl.empty();
      const dots = contentPlaceholderEl.createDiv({ cls: CSS_CLASSES.THINKING_DOTS });
      for (let i = 0; i < 3; i++) dots.createDiv({ cls: CSS_CLASSES.THINKING_DOT });
      this.activePlaceholder = {
        timestamp: turnTimestamp,
        groupEl: placeholderGroupEl,
        contentEl: contentPlaceholderEl,
        messageWrapper: wrapperEl,
      };
      placeholderGroupEl.classList.add(CSS_CLASSES.MESSAGE_ARRIVING || "message-arriving");
      setTimeout(() => placeholderGroupEl?.classList.remove(CSS_CLASSES.MESSAGE_ARRIVING || "message-arriving"), 500);
      this.guaranteedScrollToBottom(50, true);
    } else {
      this.activePlaceholder.contentEl.empty();
      const dots = this.activePlaceholder.contentEl.createDiv({ cls: CSS_CLASSES.THINKING_DOTS });
      for (let i = 0; i < 3; i++) dots.createDiv({ cls: CSS_CLASSES.THINKING_DOT });
      this.activePlaceholder.contentEl.classList.add("streaming-text");
      this.activePlaceholder.timestamp = turnTimestamp;
      this.activePlaceholder.groupEl.setAttribute("data-placeholder-timestamp", turnTimestamp.toString());
    }
  }

  private async _processLlmStream(
    llmStream: AsyncIterableIterator<OllamaStreamChunk>, // Тепер тип має бути сумісним
    timestampMs: number,
    requestTimestampId: number
  ): Promise<{
    accumulatedContent: string;
    nativeToolCalls: ToolCall[] | null;
    assistantMessageWithNativeCalls: AssistantMessage | null;
  }> {
    let accumulatedContent = "";
    let parsedToolCalls: ToolCall[] | null = null;
    let fullResponseBuffer = "";
    let toolCallIdCounter = 0;

    const toolCallStartTag = "<tool_call>";
    const toolCallEndTag = "</tool_call>";

    for await (const chunk of llmStream) {
      // this.plugin.logger.debug("[_processLlmStream] Received chunk:", chunk);

      let isLastChunk = false;

      if ("error" in chunk && chunk.error) {
        // OllamaErrorChunk
        this.plugin.logger.error("[_processLlmStream] Received error chunk:", chunk.error);
        throw new Error(`Ollama stream error: ${chunk.error}`);
      }
      // Перевіряємо на OllamaToolCallsChunk першим, якщо він має поле 'type'
      // Потрібно переконатися, що OllamaGenerateChunk не має 'type: "tool_calls"'
      // або додати 'type: "content"' до OllamaGenerateChunk
      else if ("type" in chunk && chunk.type === "tool_calls" && "calls" in chunk) {
        // OllamaToolCallsChunk
        this.plugin.logger.debug("[_processLlmStream] Received structured tool_calls chunk:", chunk.calls);
        if (!parsedToolCalls) parsedToolCalls = [];

        for (const call of chunk.calls) {
          // Додаємо перевірку, щоб уникнути дублювання, якщо ID вже існує
          if (!parsedToolCalls.some(existingCall => existingCall.id === call.id)) {
            parsedToolCalls.push({
              type: call.type || "function",
              id: call.id || `ollama-tc-${timestampMs}-${toolCallIdCounter++}`,
              function: call.function,
            });
          }
        }
        if (chunk.done) isLastChunk = true; // Якщо цей чанк може бути останнім
      } else if ("response" in chunk) {
        // OllamaGenerateChunk (текстовий контент)
        if (chunk.response) {
          accumulatedContent += chunk.response;
          fullResponseBuffer += chunk.response;
        }
        if (chunk.done) isLastChunk = true; // Цей текстовий чанк є останнім
      }
      // Якщо є інший спосіб визначити останній чанк (наприклад, спеціальний тип 'done' без 'response')
      // else if (chunk.type === "done_signal") { isLastChunk = true; }

      if (isLastChunk) {
        // Парсинг текстових <tool_call> з fullResponseBuffer (якщо вони є)
        // Ця логіка виконується ТІЛЬКИ ОДИН РАЗ в кінці.
        let lastIndex = 0;
        while (lastIndex < fullResponseBuffer.length) {
          const startIndex = fullResponseBuffer.indexOf(toolCallStartTag, lastIndex);
          if (startIndex === -1) break;

          const endIndex = fullResponseBuffer.indexOf(toolCallEndTag, startIndex + toolCallStartTag.length);
          if (endIndex === -1) {
            break;
          }

          const toolCallJsonString = fullResponseBuffer
            .substring(startIndex + toolCallStartTag.length, endIndex)
            .trim();

          try {
            const parsedJson = JSON.parse(toolCallJsonString);
            const callsArray = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
            if (!parsedToolCalls) parsedToolCalls = [];

            for (const callDef of callsArray) {
              if (callDef.name && typeof callDef.arguments !== "undefined") {
                // Додаємо, лише якщо схожого виклику ще немає (проста перевірка за іменем)
                // Для більш надійної перевірки на дублікати потрібні ID або більш глибоке порівняння
                if (!parsedToolCalls.some(ptc => ptc.function.name === callDef.name)) {
                  parsedToolCalls.push({
                    type: "function",
                    id: `ollama-txt-tc-${timestampMs}-${toolCallIdCounter++}`, // Інший префікс для текстових
                    function: {
                      name: callDef.name,
                      arguments:
                        typeof callDef.arguments === "string" ? callDef.arguments : JSON.stringify(callDef.arguments),
                    },
                  });
                }
              } else {
              }
            }
          } catch (e) {
            this.plugin.logger.error(
              "[_processLlmStream] Error parsing text-based tool call JSON:",
              e,
              toolCallJsonString
            );
          }
          lastIndex = endIndex + toolCallEndTag.length;
        }
        break;
      }
    }

    return {
      accumulatedContent: accumulatedContent,
      nativeToolCalls: parsedToolCalls,
      assistantMessageWithNativeCalls: null,
    };
  }

  // ... (решта методів)

  // src/OllamaView.ts

  // ... (інші імпорти та частина класу) ...

  private _determineToolCalls(
    nativeToolCallsFromStream: ToolCall[] | null,
    accumulatedContentFromStream: string,
    timestampMs: number,
    requestTimestampId: number // Цей аргумент зараз не використовується активно, але залишений для узгодженості
  ): { processedToolCallsThisTurn: ToolCall[] | null; assistantMessageForHistory: AssistantMessage } {
    let toolsToExecute: ToolCall[] | null = null;
    const finalContentForHistory = accumulatedContentFromStream.trim();

    const assistantMessageForHistory: AssistantMessage = {
      role: "assistant",
      content: finalContentForHistory,
      timestamp: new Date(timestampMs),
    };

    if (nativeToolCallsFromStream && nativeToolCallsFromStream.length > 0) {
      toolsToExecute = nativeToolCallsFromStream;
      assistantMessageForHistory.tool_calls = nativeToolCallsFromStream;
    } else {
    }

    return {
      processedToolCallsThisTurn: toolsToExecute,
      assistantMessageForHistory: assistantMessageForHistory,
    };
  }

  // src/OllamaView.ts

  // ...

  private async _executeAndRenderToolCycle(
    toolsToExecute: ToolCall[],
    assistantMessageIntent: AssistantMessage,
    requestTimestampId: number,
    signal: AbortSignal // Сигнал скасування
  ): Promise<void> {
    const currentViewInstance = this;

    for (const call of toolsToExecute) {
      if (signal.aborted) throw new Error("aborted by user");

      if (call.type === "function") {
        const toolName = call.function.name;
        let toolArgs = {};
        let toolResultContentForHistory: string = ""; // Ініціалізація для уникнення помилки
        let parseErrorOccurred = false;

        try {
          toolArgs = JSON.parse(call.function.arguments || "{}");
        } catch (e: any) {
          const errorContent = `Error parsing arguments for tool ${toolName}: ${e.message}. Arguments string: "${call.function.arguments}"`;
          this.plugin.logger.error(`[ToolCycle] Arg Parsing Error for ${toolName}: ${errorContent}`);
          toolResultContentForHistory = `[TOOL_ERROR]\n${errorContent}\n[/TOOL_ERROR]`;
          parseErrorOccurred = true;
        }

        if (!parseErrorOccurred) {
          if (signal.aborted) throw new Error("aborted by user"); // Перевірка перед виконанням інструменту
          const execResult = await currentViewInstance.plugin.agentManager.executeTool(toolName, toolArgs);
          if (execResult.success) {
            toolResultContentForHistory = `[TOOL_RESULT]\n${execResult.result}\n[/TOOL_RESULT]`;
          } else {
            toolResultContentForHistory = `[TOOL_ERROR]\nError executing tool ${toolName}: ${
              execResult.error || "Unknown tool error"
            }\n[/TOOL_ERROR]`;
          }
        }

        const toolResponseTimestamp = new Date();
        const toolResponseMsg: Message = {
          role: "tool" as MessageRole,
          tool_call_id: call.id,
          name: toolName,
          content: toolResultContentForHistory,
          timestamp: toolResponseTimestamp,
        };

        const toolResultHmaPromise = new Promise<void>((resolve, reject) => {
          currentViewInstance.plugin.chatManager.registerHMAResolver(
            toolResponseMsg.timestamp.getTime(),
            resolve,
            reject
          );
          setTimeout(() => {
            if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(toolResponseMsg.timestamp.getTime())) {
              currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(
                toolResponseMsg.timestamp.getTime(),
                `HMA Timeout for tool result: ${toolName} in _executeAndRenderToolCycle`
              );
            }
          }, 10000);
        });
        await currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(toolResponseMsg, true);
        try {
          await toolResultHmaPromise;
        } catch (hmaError) {}
      }
    }
  }

  // ... (решта методів OllamaView.ts) ...

  private async _renderFinalAssistantText(
    finalContent: string,
    responseTimestampMs: number,
    requestTimestampId: number
  ): Promise<void> {
    const currentViewInstance = this;

    if (finalContent.trim()) {
      const finalAssistantMsg: Message = {
        role: "assistant",
        content: finalContent,
        timestamp: new Date(responseTimestampMs),
      };
      const hmaPromise = new Promise<void>((resolve, reject) => {
        currentViewInstance.plugin.chatManager.registerHMAResolver(responseTimestampMs, resolve, reject);
        setTimeout(() => {
          if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(responseTimestampMs)) {
            currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(
              responseTimestampMs,
              "HMA Timeout for final assistant message"
            );
          }
        }, 10000);
      });
      await currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(finalAssistantMsg, true);
      await hmaPromise;
    } else if (!currentViewInstance.currentAbortController?.signal.aborted) {
      const emptyResponseMsgTimestamp = new Date();
      const emptyResponseMsg: Message = {
        role: "system",
        content: "Assistant provided an empty response.",
        timestamp: emptyResponseMsgTimestamp,
      };
      const hmaPromise = new Promise<void>((resolve, reject) => {
        currentViewInstance.plugin.chatManager.registerHMAResolver(
          emptyResponseMsg.timestamp.getTime(),
          resolve,
          reject
        );
        setTimeout(() => {
          if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(emptyResponseMsg.timestamp.getTime())) {
            currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(
              emptyResponseMsg.timestamp.getTime(),
              "HMA timeout for empty sys msg"
            );
          }
        }, 10000);
      });
      await currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(emptyResponseMsg, true);
      try {
        await hmaPromise;
      } catch (e_hma) {}
    }

    if (currentViewInstance.activePlaceholder?.timestamp === responseTimestampMs) {
      currentViewInstance.activePlaceholder = null;
    }
  }

  public async handleRegenerateClick(messageToRegenerateFrom: Message): Promise<void> {
    if (this.isRegenerating) {
      new Notice("Regeneration is already in progress. Please wait.", 3000);
      return;
    }

    if (this.currentAbortController) {
      new Notice("Another generation process is currently active. Please wait or cancel it first.", 4000);
      return;
    }

    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat) {
      new Notice("Cannot regenerate: No active chat found.");
      return;
    }
    const chatId = activeChat.metadata.id;

    let anchorMessageIndex = activeChat.messages.findIndex(
      msg =>
        msg.timestamp.getTime() === messageToRegenerateFrom.timestamp.getTime() &&
        msg.role === messageToRegenerateFrom.role
    );

    if (anchorMessageIndex === -1) {
      new Notice("Error: Could not find the message to regenerate from in the current chat history.");
      this.plugin.logger.warn("Regeneration failed: Anchor message not found for regeneration.", {
        targetTimestamp: messageToRegenerateFrom.timestamp.getTime(),
        targetRole: messageToRegenerateFrom.role,
        activeChatId: chatId,
        // Можна додати перші/останні кілька повідомлень з activeChat.messages для контексту, якщо потрібно
      });
      return;
    }

    let messageIndexToDeleteAfter = anchorMessageIndex;
    // Якщо регенеруємо відповідь асистента, то видаляємо повідомлення, починаючи з цього асистента.
    // Отже, "видаляти після" означає видаляти після повідомлення, що було *перед* цим асистентом.
    if (messageToRegenerateFrom.role === "assistant") {
      messageIndexToDeleteAfter = anchorMessageIndex - 1;
    }
    // Якщо messageToRegenerateFrom.role === "user", то anchorMessageIndex вже вказує на це повідомлення користувача,
    // і ми будемо видаляти все ПІСЛЯ нього.

    const hasMessagesAfterTargetPoint = activeChat.messages.length > messageIndexToDeleteAfter + 1;

    new ConfirmModal(
      this.app,
      "Confirm Regeneration",
      hasMessagesAfterTargetPoint
        ? "This will delete all messages after this point in the conversation and generate a new response. Are you sure you want to continue?"
        : "Are you sure you want to generate a new response for this prompt?",
      async () => {
        this.isRegenerating = true;
        const regenerationGlobalRequestId = Date.now();

        this.currentAbortController = new AbortController();
        this.setLoadingState(true);

        const initialLlmResponsePlaceholderTsForRegen = Date.now();

        try {
          if (hasMessagesAfterTargetPoint) {
            const deleteSuccess = await this.plugin.chatManager.deleteMessagesAfter(chatId, messageIndexToDeleteAfter);
            if (!deleteSuccess) {
              throw new Error("Failed to delete subsequent messages. Regeneration cannot proceed.");
            }
          }

          await this.loadAndDisplayActiveChat();
          this.guaranteedScrollToBottom(50, true);

          const chatStateForLlm = await this.plugin.chatManager.getActiveChatOrFail();
          if (!chatStateForLlm) {
            throw new Error("Failed to reload chat state after preparing for regeneration.");
          }

          if (!this.currentAbortController) {
            this.plugin.logger.error(
              "CRITICAL: AbortController not initialized in handleRegenerateClick before LlmInteractionCycle call."
            );
            throw new Error("AbortController not initialized in handleRegenerateClick");
          }
          await this._handleLlmInteractionCycle(
            chatStateForLlm,
            regenerationGlobalRequestId,
            this.currentAbortController.signal
          );
        } catch (error: any) {
          if (
            this.activePlaceholder &&
            this.activePlaceholder.timestamp === initialLlmResponsePlaceholderTsForRegen &&
            this.activePlaceholder.groupEl.classList.contains("placeholder")
          ) {
            if (this.activePlaceholder.groupEl.isConnected) this.activePlaceholder.groupEl.remove();
          }

          this.plugin.chatManager.rejectAndClearHMAResolver(
            initialLlmResponsePlaceholderTsForRegen,
            `Outer catch in handleRegenerateClick for initial placeholder (req: ${regenerationGlobalRequestId})`
          );

          let errorMsgForChat: string;
          let errorMsgRole: MessageRole = "error";
          if (error.name === "AbortError" || error.message?.includes("aborted by user")) {
            errorMsgForChat = "Regeneration process was stopped by the user.";
            errorMsgRole = "system";
          } else {
            errorMsgForChat = `Regeneration failed: ${error.message || "An unknown error occurred during processing."}`;
            new Notice(errorMsgForChat, 7000);
          }
          const errorDisplayTimestamp = new Date();
          const errorDisplayMsg: Message = {
            role: errorMsgRole,
            content: errorMsgForChat,
            timestamp: errorDisplayTimestamp,
          };

          const hmaErrorPromise = new Promise<void>((resolve, reject) => {
            this.plugin.chatManager.registerHMAResolver(errorDisplayMsg.timestamp.getTime(), resolve, reject);
            setTimeout(() => {
              if (this.plugin.chatManager.messageAddedResolvers.has(errorDisplayMsg.timestamp.getTime())) {
                this.plugin.chatManager.rejectAndClearHMAResolver(
                  errorDisplayMsg.timestamp.getTime(),
                  "HMA timeout for error display msg in handleRegenerateClick"
                );
              }
            }, 10000);
          });
          await this.plugin.chatManager.addMessageToActiveChatPayload(errorDisplayMsg, true);
          try {
            await hmaErrorPromise;
          } catch (e_hma) {}
        } finally {
          if (this.activePlaceholder && this.activePlaceholder.groupEl.classList.contains("placeholder")) {
            if (this.activePlaceholder.groupEl.isConnected) {
              this.activePlaceholder.groupEl.remove();
            }
          }
          this.activePlaceholder = null;

          this.currentAbortController = null;
          this.isRegenerating = false;
          this.setLoadingState(false);

          requestAnimationFrame(() => this.updateSendButtonState());
          this.focusInput();
        }
      }
    ).open();
  }

  private async _handleLlmInteractionCycle(
    initialChatState: Chat,
    globalInteractionRequestId: number,
    signal: AbortSignal // Сигнал скасування для цього циклу
  ): Promise<void> {
    let continueConversation = true;
    const maxTurns = 5; // Або з налаштувань this.plugin.settings.maxToolTurns
    let turns = 0;
    let currentTurnLlmResponseTsForCatch: number | null = null; // Для логування/відладки помилок
    let chatStateForLlm = initialChatState;

    try {
      while (continueConversation && turns < maxTurns && !signal.aborted) {
        turns++;
        const currentTurnLlmResponseTs = Date.now();
        currentTurnLlmResponseTsForCatch = currentTurnLlmResponseTs;

        const currentTurnRequestId = globalInteractionRequestId + turns;

        this._managePlaceholder(currentTurnLlmResponseTs, currentTurnRequestId);

        // Завжди отримуємо найсвіжіший стан чату
        chatStateForLlm = await this.plugin.chatManager.getActiveChatOrFail();

        const llmStream = this.plugin.ollamaService.generateChatResponseStream(
          chatStateForLlm,
          signal // Передаємо сигнал скасування в сервіс
        );

        const { accumulatedContent, nativeToolCalls, assistantMessageWithNativeCalls } = await this._processLlmStream(
          llmStream,
          currentTurnLlmResponseTs,
          currentTurnRequestId
          // _processLlmStream має внутрішньо обробляти сигнал, отриманий від ollamaService
        );

        if (signal.aborted) throw new Error("aborted by user");

        const toolCallCheckResult = this._determineToolCalls(
          nativeToolCalls, // 1. Розпарсені інструменти
          accumulatedContent, // 2. Весь текстовий контент
          currentTurnLlmResponseTs, // 3. Timestamp
          currentTurnRequestId // 4. Request ID (для логування/майбутнього)
        );

        if (
          toolCallCheckResult.processedToolCallsThisTurn &&
          toolCallCheckResult.processedToolCallsThisTurn.length > 0
        ) {
          const assistantMsgTsMs = toolCallCheckResult.assistantMessageForHistory.timestamp.getTime();
          const assistantHmaPromise = new Promise<void>((resolve, reject) => {
            this.plugin.chatManager.registerHMAResolver(assistantMsgTsMs, resolve, reject);
            setTimeout(() => {
              if (this.plugin.chatManager.messageAddedResolvers.has(assistantMsgTsMs)) {
                this.plugin.chatManager.rejectAndClearHMAResolver(
                  assistantMsgTsMs,
                  `HMA Timeout for assistant tool intent (ts: ${assistantMsgTsMs}) in _handleLlmInteractionCycle`
                );
              }
            }, 10000);
          });
          await this.plugin.chatManager.addMessageToActiveChatPayload(
            toolCallCheckResult.assistantMessageForHistory,
            true
          );
          await assistantHmaPromise;

          await this._executeAndRenderToolCycle(
            toolCallCheckResult.processedToolCallsThisTurn,
            toolCallCheckResult.assistantMessageForHistory,
            currentTurnRequestId,
            signal // Передаємо сигнал далі
          );

          continueConversation = true; // Продовжуємо, оскільки були викликані інструменти
        } else {
          // Немає більше викликів інструментів, рендеримо фінальний текст
          await this._renderFinalAssistantText(accumulatedContent, currentTurnLlmResponseTs, currentTurnRequestId);
          continueConversation = false; // Завершуємо цикл
        }
      }

      if (turns >= maxTurns && !signal.aborted) {
        const maxTurnsMsgTimestamp = new Date();
        const maxTurnsMsg: Message = {
          role: "system",
          content:
            "Max processing turns reached. If the task is not complete, please try rephrasing or breaking it down.",
          timestamp: maxTurnsMsgTimestamp,
        };
        const hmaMaxTurnsPromise = new Promise<void>((resolve, reject) => {
          this.plugin.chatManager.registerHMAResolver(maxTurnsMsg.timestamp.getTime(), resolve, reject);
          setTimeout(() => {
            if (this.plugin.chatManager.messageAddedResolvers.has(maxTurnsMsg.timestamp.getTime())) {
              this.plugin.chatManager.rejectAndClearHMAResolver(
                maxTurnsMsg.timestamp.getTime(),
                "HMA timeout for max turns msg in _handleLlmInteractionCycle"
              );
            }
          }, 10000);
        });
        await this.plugin.chatManager.addMessageToActiveChatPayload(maxTurnsMsg, true);
        try {
          await hmaMaxTurnsPromise;
        } catch (e_hma) {}
      }
    } catch (error) {
      // Помилка прокидається для обробки у викликаючому методі (sendMessage/handleRegenerateClick)
      throw error;
    }
  }
}
