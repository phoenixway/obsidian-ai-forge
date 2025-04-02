import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  MarkdownRenderer,
  Notice,
  debounce,
  requireApiVersion // Для перевірки версії API Obsidian
} from "obsidian";
import OllamaPlugin from "./main";
import { AvatarType } from "./settings"; // Імпортуємо тип

// --- Constants ---
// (Залишаються без змін)
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
const CSS_CLASS_CODE_BLOCK_LANGUAGE = "code-block-language"; // Для назви мови
const CSS_CLASS_NEW_MESSAGE_INDICATOR = "new-message-indicator";
const CSS_CLASS_VISIBLE = "visible";
const CSS_CLASS_MENU_SEPARATOR = "menu-separator";
const CSS_CLASS_CLEAR_CHAT_OPTION = "clear-chat-option";
// --- Нові константи для довгих повідомлень ---
const CSS_CLASS_CONTENT_COLLAPSIBLE = "message-content-collapsible";
const CSS_CLASS_CONTENT_COLLAPSED = "message-content-collapsed";
const CSS_CLASS_SHOW_MORE_BUTTON = "show-more-button";


export type MessageRole = "user" | "assistant" | "system" | "error";

export interface Message { // Експортуємо для використання в інших файлах
  role: MessageRole;
  content: string;
  timestamp: Date;
}

interface AddMessageOptions {
  saveHistory?: boolean;
  timestamp?: Date | string;
}

export class OllamaView extends ItemView {
  // ... (поля класу без змін, крім додавання plugin) ...
  private readonly plugin: OllamaPlugin;
  private chatContainerEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private chatContainer!: HTMLElement;
  private sendButton!: HTMLButtonElement;
  private voiceButton!: HTMLButtonElement;
  private menuButton!: HTMLButtonElement;

  private menuDropdown!: HTMLElement;
  private clearChatOption!: HTMLElement;
  private settingsOption!: HTMLElement;
  private buttonsContainer!: HTMLElement;

  private messages: Message[] = [];
  private isProcessing: boolean = false;
  private scrollTimeout: NodeJS.Timeout | null = null;
  static instance: OllamaView | null = null;

  private speechWorker: Worker | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;

  private messagesPairCount: number = 0;
  private emptyStateEl: HTMLElement | null = null;

  private resizeTimeout: NodeJS.Timeout | null = null;
  private scrollListenerDebounced: () => void;

  private lastMessageDate: Date | null = null;
  private newMessagesIndicatorEl: HTMLElement | null = null;
  private userScrolledUp: boolean = false;

  private debouncedSaveMessageHistory = debounce(this.saveMessageHistory, 300, true);


  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin; // Зберігаємо посилання на плагін

    if (OllamaView.instance && OllamaView.instance !== this) {
      console.warn("Заміна існуючого екземпляра OllamaView.");
      // OllamaView.instance.leaf.detach(); // Можна розкоментувати для закриття старого вікна
    }
    OllamaView.instance = this;

    // Не створюємо тут ApiService, він у плагіні
    // if (this.plugin.apiService) {
    //   this.plugin.apiService.setOllamaView(this); // Встановлюємо view для ApiService в activateView
    // }

    // Перевірка версії API Obsidian для підтримки requireApiVersion
    if (!requireApiVersion || !requireApiVersion("1.0.0")) {
      console.warn("Ollama Plugin: Поточна версія Obsidian API може бути застарілою. Деякі функції можуть не працювати.");
      // Можна показати Notice користувачу
      // new Notice("Ваша версія Obsidian може бути застарілою для плагіна Ollama.");
    }


    this.initSpeechWorker(); // Якщо використовується
    this.scrollListenerDebounced = debounce(this.handleScroll, 150, true);
  }

  // --- Геттери ---
  public getMessagesCount(): number {
    return this.messages.length;
  }
  public getMessagesPairCount(): number {
    return this.messagesPairCount;
  }
  // Додаємо геттер для історії повідомлень
  public getMessages(): Message[] {
    // Повертаємо копію, щоб запобігти зовнішнім модифікаціям
    return [...this.messages];
  }

  // ... (getViewType, getDisplayText, getIcon без змін) ...
  getViewType(): string { return VIEW_TYPE_OLLAMA; }
  getDisplayText(): string { return "Ollama Chat"; }
  getIcon(): string { return "message-square"; } // Або інша іконка


  async onOpen(): Promise<void> {
    // ... (створення UI, слухачі - без значних змін) ...
    this.createUIElements();
    this.updateInputPlaceholder(this.plugin.settings.modelName);
    this.attachEventListeners();
    this.autoResizeTextarea();
    this.updateSendButtonState();

    this.lastMessageDate = null;
    await this.loadAndRenderHistory(); // Завантаження історії

    this.inputEl?.focus();
    // this.guaranteedScrollToBottom(150, true);
    this.inputEl?.dispatchEvent(new Event('input'));
  }

  async onClose(): Promise<void> {
    console.log("OllamaView onClose: Очищення ресурсів.");
    if (this.speechWorker) { this.speechWorker.terminate(); this.speechWorker = null; }
    this.stopVoiceRecording(false); // Якщо використовується
    if (this.audioStream) { this.audioStream.getTracks().forEach(track => track.stop()); this.audioStream = null; }
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    if (OllamaView.instance === this) { OllamaView.instance = null; }
  }

  // --- UI Creation ---
  private createUIElements(): void {
    // (Без змін, використовує ті ж константи)
    // ... (код створення елементів UI як у попередній версії) ...
    this.contentEl.empty();
    this.chatContainerEl = this.contentEl.createDiv({ cls: CSS_CLASS_CONTAINER });
    this.chatContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_CHAT_CONTAINER });

    this.newMessagesIndicatorEl = this.chatContainerEl.createDiv({ cls: CSS_CLASS_NEW_MESSAGE_INDICATOR });
    const indicatorIcon = this.newMessagesIndicatorEl.createSpan({ cls: "indicator-icon" });
    setIcon(indicatorIcon, "arrow-down");
    this.newMessagesIndicatorEl.createSpan({ text: " Нові повідомлення" }); // Додаємо пробіл

    const inputContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER });
    this.inputEl = inputContainer.createEl("textarea", { attr: { placeholder: `Напишіть до ${this.plugin.settings.modelName}...`, rows: 1 } }); // Додано rows=1
    this.buttonsContainer = inputContainer.createDiv({ cls: CSS_CLASS_BUTTONS_CONTAINER });
    this.sendButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_SEND_BUTTON, attr: { 'aria-label': 'Надіслати' } });
    setIcon(this.sendButton, "send");
    this.voiceButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_VOICE_BUTTON, attr: { 'aria-label': 'Голосовий ввід' } });
    setIcon(this.voiceButton, "mic"); // Змінено іконку на 'mic'
    this.menuButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_MENU_BUTTON, attr: { 'aria-label': 'Меню' } });
    setIcon(this.menuButton, "more-vertical");

    this.menuDropdown = inputContainer.createEl("div", { cls: CSS_CLASS_MENU_DROPDOWN });
    this.menuDropdown.style.display = "none"; // Початково приховане

    this.clearChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLEAR_CHAT_OPTION}` });
    const clearIcon = this.clearChatOption.createEl("span", { cls: "menu-option-icon" });
    setIcon(clearIcon, "trash-2");
    this.clearChatOption.createEl("span", { cls: "menu-option-text", text: "Очистити чат" });

    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR }); // Розділювач

    this.settingsOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_SETTINGS_OPTION}` });
    const settingsIcon = this.settingsOption.createEl("span", { cls: "menu-option-icon" });
    setIcon(settingsIcon, "settings");
    this.settingsOption.createEl("span", { cls: "menu-option-text", text: "Налаштування" });
  }

  // --- Event Listeners ---
  private attachEventListeners(): void {
    // (Без змін, всі слухачі залишаються)
    this.inputEl.addEventListener("keydown", this.handleKeyDown);
    this.inputEl.addEventListener('input', this.handleInputForResize);
    this.sendButton.addEventListener("click", this.handleSendClick);
    this.voiceButton.addEventListener("click", this.handleVoiceClick);
    this.menuButton.addEventListener("click", this.handleMenuClick);
    this.settingsOption.addEventListener("click", this.handleSettingsClick);
    this.clearChatOption.addEventListener("click", this.handleClearChatClick);
    this.registerDomEvent(window, 'resize', this.handleWindowResize);
    this.registerEvent(this.app.workspace.on('resize', this.handleWindowResize));
    this.registerDomEvent(document, 'click', this.handleDocumentClickForMenu);
    // Реєструємо обробник події зміни моделі з плагіна
    this.register(this.plugin.on('model-changed', this.handleModelChange));
    this.registerDomEvent(document, 'visibilitychange', this.handleVisibilityChange);
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange));
    this.registerDomEvent(this.chatContainer, 'scroll', this.scrollListenerDebounced);
    if (this.newMessagesIndicatorEl) {
      this.registerDomEvent(this.newMessagesIndicatorEl, 'click', this.handleNewMessageIndicatorClick);
    }
  }

  // --- Event Handlers ---
  // (Без змін, крім handleClearChatClick, який тепер не викликає messageService)
  private handleKeyDown = (e: KeyboardEvent): void => { if (e.key === "Enter" && !e.shiftKey && !this.isProcessing && !this.sendButton.disabled) { e.preventDefault(); this.sendMessage(); } }
  private handleSendClick = (): void => { if (!this.isProcessing && !this.sendButton.disabled) { this.sendMessage(); } }
  private handleVoiceClick = (): void => { this.toggleVoiceRecognition(); }
  private handleMenuClick = (e: MouseEvent): void => { e.stopPropagation(); const isHidden = this.menuDropdown.style.display === "none"; this.menuDropdown.style.display = isHidden ? "block" : "none"; if (!isHidden) this.menuDropdown.style.animation = 'menu-fade-in 0.15s ease-out'; } // Додано анімацію
  private handleSettingsClick = async (): Promise<void> => { this.closeMenu(); const setting = (this.app as any).setting; if (setting) { await setting.open(); setting.openTabById("ollama-plugin"); } else { new Notice("Не вдалося відкрити налаштування."); } } // ID вкладки з settings.ts
  private handleClearChatClick = (): void => {
    this.closeMenu();
    // Використовуємо confirm для підтвердження
    if (confirm("Ви впевнені, що хочете видалити всю історію чату? Цю дію неможливо скасувати.")) {
      this.plugin.clearMessageHistory(); // Викликаємо метод плагіна
      // new Notice("Історію чату очищено."); // Notice показується в plugin.clearMessageHistory
    }
  }
  private handleDocumentClickForMenu = (e: MouseEvent): void => { if (this.menuDropdown.style.display === 'block' && !this.menuButton.contains(e.target as Node) && !this.menuDropdown.contains(e.target as Node)) { this.closeMenu(); } }
  private handleModelChange = (modelName: string): void => { this.updateInputPlaceholder(modelName); if (this.messages.length > 0) { this.plugin.messageService.addSystemMessage(`Модель змінено на: ${modelName}`); } }
  private handleVisibilityChange = (): void => { if (document.visibilityState === 'visible') { requestAnimationFrame(() => { this.guaranteedScrollToBottom(50); this.adjustTextareaHeight(); }); } }
  // private handleActiveLeafChange = (leaf: WorkspaceLeaf | null): void => { if (leaf?.view === this) { setTimeout(() => this.guaranteedScrollToBottom(100), 100); this.inputEl?.focus(); } } // Перевіряємо конкретний view

  private handleActiveLeafChange = (leaf: WorkspaceLeaf | null): void => {
    // Перевіряємо, чи ЦЕЙ view став активним
    if (leaf?.view === this) {
      console.log("[OllamaView] View became active.");
      // Негайно фокусуємо поле вводу
      this.inputEl?.focus();
      // Примусово скролимо вниз з невеликою затримкою
      // Використовуємо forceScroll = true, щоб прокрутити, навіть якщо користувач скролив раніше
      setTimeout(() => this.guaranteedScrollToBottom(150, true), 100); // Затримка + примусовий скрол
    }
  }

  private handleInputForResize = (): void => { if (this.resizeTimeout) clearTimeout(this.resizeTimeout); this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 50); this.updateSendButtonState(); };
  private handleWindowResize = (): void => { if (this.resizeTimeout) clearTimeout(this.resizeTimeout); this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 100); };
  private handleScroll = (): void => { if (!this.chatContainer) return; const scrollThreshold = 150; const isScrolledToBottom = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight < scrollThreshold; if (!isScrolledToBottom) { this.userScrolledUp = true; } else { this.userScrolledUp = false; this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } }
  private handleNewMessageIndicatorClick = (): void => { this.guaranteedScrollToBottom(50, true); this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); }


  // --- UI Update Methods ---
  private updateInputPlaceholder(modelName: string): void { if (this.inputEl) { this.inputEl.placeholder = `Напишіть до ${modelName}...`; } }
  private closeMenu(): void { if (this.menuDropdown) { this.menuDropdown.style.display = "none"; } }
  private autoResizeTextarea(): void { this.adjustTextareaHeight(); }
  private adjustTextareaHeight = (): void => { requestAnimationFrame(() => { if (!this.inputEl || !this.buttonsContainer) return; const viewHeight = this.contentEl.clientHeight; const maxHeight = Math.max(100, viewHeight * 0.50); this.inputEl.style.height = 'auto'; const scrollHeight = this.inputEl.scrollHeight; const newHeight = Math.min(scrollHeight, maxHeight); this.inputEl.style.height = `${newHeight}px`; this.inputEl.classList.toggle(CSS_CLASS_TEXTAREA_EXPANDED, scrollHeight > maxHeight); }); }
  private updateSendButtonState(): void { if (!this.inputEl || !this.sendButton) return; const isDisabled = this.inputEl.value.trim() === '' || this.isProcessing; this.sendButton.disabled = isDisabled; this.sendButton.classList.toggle(CSS_CLASS_DISABLED, isDisabled); }
  public showEmptyState(): void { if (this.messages.length === 0 && !this.emptyStateEl && this.chatContainer) { this.chatContainer.empty(); this.emptyStateEl = this.chatContainer.createDiv({ cls: CSS_CLASS_EMPTY_STATE }); this.emptyStateEl.createDiv({ cls: "empty-state-message", text: "Повідомлень ще немає" }); this.emptyStateEl.createDiv({ cls: "empty-state-tip", text: `Напишіть повідомлення або використайте голосовий ввід для спілкування з ${this.plugin.settings.modelName}` }); } }
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
        // Запускаємо перевірку згортання
        this.checkAllMessagesForCollapsing();

        // Викликаємо прокрутку з більшою затримкою ПІСЛЯ запуску перевірки згортання.
        // Це дає шанс requestAnimationFrame всередині check... виконатись.
        // guaranteedScrollToBottom сам використовує setTimeout + requestAnimationFrame.
        setTimeout(() => {
          console.log("[OllamaView] Attempting scroll after collapse check initiation.");
          this.guaranteedScrollToBottom(200, true); // Збільшена внутрішня затримка + примусово
        }, 150); // Невелика затримка перед викликом scroll
      }
    } catch (error) {
      console.error("OllamaView: Error during history loading process:", error);
      this.clearChatContainerInternal();
      this.showEmptyState();
    }
  }
  async saveMessageHistory(): Promise<void> {
    if (!this.plugin.settings.saveMessageHistory) return;
    const messagesToSave = this.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp.toISOString(),
    }));
    const dataToSave = JSON.stringify(messagesToSave);
    try {
      await this.plugin.saveMessageHistory(dataToSave);
    } catch (error) {
      console.error("OllamaView: Помилка збереження історії:", error);
      new Notice("Не вдалося зберегти історію чату.");
    }
  }

  async sendMessage(): Promise<void> {
    const content = this.inputEl.value.trim();
    if (!content || this.isProcessing || this.sendButton.disabled) return;
    const messageContent = this.inputEl.value;
    this.clearInputField();
    this.setLoadingState(true);
    this.hideEmptyState();
    this.internalAddMessage("user", messageContent); // Додаємо відразу
    try {
      await this.plugin.messageService.sendMessage(content);
    } catch (error: any) { // Ловимо помилку і показуємо її
      console.error("OllamaView: Помилка надсилання повідомлення через MessageService:", error);
      this.internalAddMessage("error", `Не вдалося надіслати повідомлення: ${error.message || 'Невідома помилка'}`);
      this.setLoadingState(false); // Знімаємо завантаження при помилці
    }
  }

  public internalAddMessage(role: MessageRole, content: string, options: AddMessageOptions = {}): void {
    const { saveHistory = true, timestamp } = options;
    let messageTimestamp: Date;
    if (timestamp) {
      try {
        messageTimestamp = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
        if (isNaN(messageTimestamp.getTime())) throw new Error("Invalid Date");
      } catch (e) {
        console.warn("Неправильна мітка часу, використовується поточний час:", timestamp, e);
        messageTimestamp = new Date();
      }
    } else {
      messageTimestamp = new Date();
    }

    const message: Message = { role, content, timestamp: messageTimestamp };
    this.messages.push(message);

    if (role === "assistant" && this.messages.length >= 2) {
      const prevMessage = this.messages[this.messages.length - 2];
      if (prevMessage?.role === "user") this.messagesPairCount++;
    }

    const messageEl = this.renderMessage(message); // Отримуємо елемент повідомлення
    this.hideEmptyState();

    // Перевіряємо висоту доданого повідомлення
    if (messageEl) {
      this.checkMessageForCollapsing(messageEl);
    }


    if (saveHistory && this.plugin.settings.saveMessageHistory) { // Перевіряємо налаштування перед збереженням
      this.debouncedSaveMessageHistory();
    }

    if (role !== "user" && this.userScrolledUp && this.newMessagesIndicatorEl) {
      this.newMessagesIndicatorEl.classList.add(CSS_CLASS_VISIBLE);
    } else if (!this.userScrolledUp) {
      const forceScroll = role !== "user";
      this.guaranteedScrollToBottom(forceScroll ? 100 : 50, forceScroll);
    }
  }

  // --- Оновлений рендеринг повідомлення ---
  renderMessage(message: Message): HTMLElement | null {
    const messageIndex = this.messages.indexOf(message);
    if (messageIndex === -1) return null;

    const prevMessage = messageIndex > 0 ? this.messages[messageIndex - 1] : null;
    const isNewDay = !this.lastMessageDate || !this.isSameDay(this.lastMessageDate, message.timestamp);

    if (isNewDay) {
      this.renderDateSeparator(message.timestamp);
      this.lastMessageDate = message.timestamp;
    } else if (messageIndex === 0) {
      this.lastMessageDate = message.timestamp;
    }

    let messageGroup: HTMLElement | null = null;
    let groupClass = CSS_CLASS_MESSAGE_GROUP;
    let messageClass = `${CSS_CLASS_MESSAGE} ${CSS_CLASS_MESSAGE_ARRIVING}`;
    let showAvatar = false;
    let isUser = false;

    // Визначаємо, чи це перше повідомлення в групі (з урахуванням дати)
    const isFirstInGroup = !prevMessage || prevMessage.role !== message.role || isNewDay;

    switch (message.role) {
      case "user":
        groupClass += ` ${CSS_CLASS_USER_GROUP}`;
        messageClass += ` ${CSS_CLASS_USER_MESSAGE}`;
        showAvatar = true; isUser = true;
        break;
      case "assistant":
        groupClass += ` ${CSS_CLASS_OLLAMA_GROUP}`;
        messageClass += ` ${CSS_CLASS_OLLAMA_MESSAGE}`;
        showAvatar = true;
        break;
      case "system":
        groupClass += ` ${CSS_CLASS_SYSTEM_GROUP}`;
        messageClass += ` ${CSS_CLASS_SYSTEM_MESSAGE}`;
        break;
      case "error":
        groupClass += ` ${CSS_CLASS_ERROR_GROUP}`;
        messageClass += ` ${CSS_CLASS_ERROR_MESSAGE}`;
        break;
    }

    const lastElement = this.chatContainer.lastElementChild as HTMLElement;
    // Перевіряємо, чи потрібно створювати нову групу
    if (isFirstInGroup || !lastElement || !lastElement.matches(`.${groupClass.split(' ')[1]}`)) {
      messageGroup = this.chatContainer.createDiv({ cls: groupClass });
      if (showAvatar) {
        this.renderAvatar(messageGroup, isUser); // Передаємо isUser для налаштування
      }
    } else {
      messageGroup = lastElement;
    }

    const messageEl = messageGroup.createDiv({ cls: messageClass });
    const contentContainer = messageEl.createDiv({ cls: CSS_CLASS_CONTENT_CONTAINER });
    const contentEl = contentContainer.createDiv({ cls: CSS_CLASS_CONTENT });

    // --- Рендеринг вмісту ---
    switch (message.role) {
      case "assistant":
      case "user": // Тепер user теж може мати довгі повідомлення
        // Додаємо клас для потенційного згортання
        contentEl.addClass(CSS_CLASS_CONTENT_COLLAPSIBLE);
        if (message.role === 'assistant') {
          this.renderAssistantContent(contentEl, message.content);
        } else {
          // Простий рендеринг тексту для користувача, зберігаючи переноси рядків
          message.content.split("\n").forEach((line, index, array) => {
            contentEl.appendText(line);
            if (index < array.length - 1) contentEl.createEl("br");
          });
        }
        break;
      case "system":
        const sysIcon = contentEl.createSpan({ cls: CSS_CLASS_SYSTEM_ICON });
        setIcon(sysIcon, "info");
        contentEl.createSpan({ cls: CSS_CLASS_SYSTEM_TEXT, text: message.content });
        break;
      case "error":
        const errIcon = contentEl.createSpan({ cls: CSS_CLASS_ERROR_ICON });
        setIcon(errIcon, "alert-triangle"); // Іконка для помилки
        // Додаємо текст помилки, робимо його більш помітним
        contentEl.createSpan({ cls: CSS_CLASS_ERROR_TEXT, text: message.content });
        break;
    }

    // --- Кнопка копіювання (не для system) ---
    if (message.role !== "system") {
      const copyButton = contentContainer.createEl("button", { cls: CSS_CLASS_COPY_BUTTON, attr: { title: "Копіювати" } });
      setIcon(copyButton, "copy");
      copyButton.addEventListener("click", () => this.handleCopyClick(message.content, copyButton));
    }

    // --- Timestamp ---
    messageEl.createDiv({
      cls: CSS_CLASS_TIMESTAMP,
      text: this.formatTime(message.timestamp),
    });

    // Анімація появи
    setTimeout(() => messageEl.classList.remove(CSS_CLASS_MESSAGE_ARRIVING), 500);

    return messageEl; // Повертаємо створений елемент повідомлення
  }

  // --- Оновлений рендеринг аватара ---
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
        console.warn(`Не вдалося встановити іконку "${avatarContent}", використовується стандартна.`);
        avatarEl.textContent = isUser ? 'U' : 'A'; // Fallback to initials
      }
    } else {
      avatarEl.textContent = isUser ? 'U' : 'A'; // Default fallback
    }
  }


  // --- Методи рендерингу Markdown, кнопок коду, thinking tags (з додаванням назви мови) ---
  private renderDateSeparator(date: Date): void { if (!this.chatContainer) return; this.chatContainer.createDiv({ cls: CSS_CLASS_DATE_SEPARATOR, text: this.formatDateSeparator(date) }); }
  // renderAvatar оновлено вище
  private renderAssistantContent(containerEl: HTMLElement, content: string): void { const decodedContent = this.decodeHtmlEntities(content); const hasThinking = this.detectThinkingTags(decodedContent); containerEl.empty(); if (hasThinking.hasThinkingTags) { const processedHtml = this.processThinkingTags(decodedContent); containerEl.innerHTML = processedHtml; this.addThinkingToggleListeners(containerEl); this.addCodeBlockEnhancements(containerEl); } else { MarkdownRenderer.renderMarkdown(content, containerEl, this.plugin.app.vault.getRoot()?.path ?? "", this); this.addCodeBlockEnhancements(containerEl); } }

  // Оновлено: додає і назву мови, і кнопку копіювання
  private addCodeBlockEnhancements(contentEl: HTMLElement): void {
    const preElements = contentEl.querySelectorAll("pre");
    preElements.forEach((pre) => {
      // Запобігаємо дублюванню
      if (pre.querySelector(`.${CSS_CLASS_CODE_BLOCK_COPY_BUTTON}`)) return;

      const codeEl = pre.querySelector("code");
      if (!codeEl) return;

      const codeContent = codeEl.textContent || "";

      // Додаємо назву мови (якщо є)
      const languageClass = Array.from(codeEl.classList).find(cls => cls.startsWith("language-"));
      if (languageClass) {
        const language = languageClass.replace("language-", "");
        if (language) {
          pre.createEl("span", { cls: CSS_CLASS_CODE_BLOCK_LANGUAGE, text: language });
        }
      }

      // Додаємо кнопку копіювання
      const copyBtn = pre.createEl("button", { cls: CSS_CLASS_CODE_BLOCK_COPY_BUTTON });
      setIcon(copyBtn, "copy");
      copyBtn.setAttribute("title", "Копіювати Код");
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(codeContent).then(() => {
          setIcon(copyBtn, "check");
          copyBtn.setAttribute("title", "Скопійовано!");
          setTimeout(() => {
            setIcon(copyBtn, "copy");
            copyBtn.setAttribute("title", "Копіювати Код");
          }, 1500);
        }).catch(err => {
          console.error("Не вдалося скопіювати блок коду:", err);
          new Notice("Не вдалося скопіювати код.");
        });
      });
    });
  }

  // --- Методи для обробки довгих повідомлень ---
  private checkMessageForCollapsing(messageEl: HTMLElement): void {
    const contentEl = messageEl.querySelector<HTMLElement>(`.${CSS_CLASS_CONTENT_COLLAPSIBLE}`);
    const maxHeight = this.plugin.settings.maxMessageHeight;

    if (!contentEl || maxHeight <= 0) return; // Виходимо, якщо елемент не знайдено або згортання вимкнено

    // Використовуємо requestAnimationFrame для отримання точних розмірів після рендерингу
    requestAnimationFrame(() => {
      // Видаляємо кнопку "Show More", якщо вона існує, перед перевіркою
      const existingButton = messageEl.querySelector(`.${CSS_CLASS_SHOW_MORE_BUTTON}`);
      existingButton?.remove();
      // Скидаємо стиль max-height та клас, щоб отримати реальну висоту
      contentEl.style.maxHeight = '';
      contentEl.classList.remove(CSS_CLASS_CONTENT_COLLAPSED);


      const actualHeight = contentEl.scrollHeight;
      // console.log(`Message content height: ${actualHeight}px, Max height setting: ${maxHeight}px`);

      if (actualHeight > maxHeight) {
        // console.log("Applying collapsed styles and button.");
        contentEl.style.maxHeight = `${maxHeight}px`;
        contentEl.classList.add(CSS_CLASS_CONTENT_COLLAPSED);

        // Створюємо кнопку "Показати більше"
        const showMoreButton = messageEl.createEl('button', {
          cls: CSS_CLASS_SHOW_MORE_BUTTON,
          text: 'Показати більше ▼' // Текст кнопки
        });
        // Додаємо обробник події для кнопки
        this.registerDomEvent(showMoreButton, 'click', () => {
          this.toggleMessageCollapse(contentEl, showMoreButton);
          // Прокрутка до елемента після розгортання може бути корисною
          // setTimeout(() => messageEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
        });
      }
    });
  }

  private checkAllMessagesForCollapsing(): void {
    this.chatContainer.querySelectorAll<HTMLElement>(`.${CSS_CLASS_MESSAGE}`).forEach(msgEl => {
      this.checkMessageForCollapsing(msgEl);
    });
  }


  private toggleMessageCollapse(contentEl: HTMLElement, buttonEl: HTMLButtonElement): void {
    const isCollapsed = contentEl.classList.contains(CSS_CLASS_CONTENT_COLLAPSED);
    if (isCollapsed) {
      contentEl.style.maxHeight = ''; // Знімаємо обмеження висоти
      contentEl.classList.remove(CSS_CLASS_CONTENT_COLLAPSED);
      buttonEl.setText('Згорнути ▲');
    } else {
      const maxHeight = this.plugin.settings.maxMessageHeight;
      contentEl.style.maxHeight = `${maxHeight}px`; // Повертаємо обмеження
      contentEl.classList.add(CSS_CLASS_CONTENT_COLLAPSED);
      buttonEl.setText('Показати більше ▼');
      // Після згортання може знадобитися прокрутка, щоб кнопка була видима
      // setTimeout(() => buttonEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }
  }

  // --- Інші методи (handleCopyClick, processThinkingTags, etc. - без змін) ---
  private handleCopyClick(content: string, buttonEl: HTMLElement): void { let textToCopy = content; if (this.detectThinkingTags(this.decodeHtmlEntities(content)).hasThinkingTags) { textToCopy = this.decodeHtmlEntities(content).replace(/<think>[\s\S]*?<\/think>/g, "").trim(); } navigator.clipboard.writeText(textToCopy).then(() => { setIcon(buttonEl, "check"); buttonEl.setAttribute("title", "Скопійовано!"); setTimeout(() => { setIcon(buttonEl, "copy"); buttonEl.setAttribute("title", "Копіювати"); }, 2000); }).catch(err => { console.error("Не вдалося скопіювати текст: ", err); new Notice("Не вдалося скопіювати текст."); }); }
  private processThinkingTags(content: string): string { const thinkingRegex = /<think>([\s\S]*?)<\/think>/g; let lastIndex = 0; const parts: string[] = []; let match; while ((match = thinkingRegex.exec(content)) !== null) { if (match.index > lastIndex) { parts.push(this.markdownToHtml(content.substring(lastIndex, match.index))); } const thinkingContent = match[1]; const foldableHtml = `<div class="${CSS_CLASS_THINKING_BLOCK}"><div class="${CSS_CLASS_THINKING_HEADER}" data-fold-state="folded"><div class="${CSS_CLASS_THINKING_TOGGLE}">►</div><div class="${CSS_CLASS_THINKING_TITLE}">Роздуми</div></div><div class="${CSS_CLASS_THINKING_CONTENT}" style="display: none;">${this.markdownToHtml(thinkingContent)}</div></div>`; parts.push(foldableHtml); lastIndex = thinkingRegex.lastIndex; } if (lastIndex < content.length) { parts.push(this.markdownToHtml(content.substring(lastIndex))); } return parts.join(""); }
  private markdownToHtml(markdown: string): string { if (!markdown || markdown.trim() === "") return ""; const tempDiv = document.createElement("div"); const contextFilePath = this.app.workspace.getActiveFile()?.path ?? ""; MarkdownRenderer.renderMarkdown(markdown, tempDiv, contextFilePath, this); return tempDiv.innerHTML; }
  private addThinkingToggleListeners(contentEl: HTMLElement): void { const thinkingHeaders = contentEl.querySelectorAll<HTMLElement>(`.${CSS_CLASS_THINKING_HEADER}`); thinkingHeaders.forEach((header) => { header.addEventListener("click", () => { const content = header.nextElementSibling as HTMLElement; const toggleIcon = header.querySelector<HTMLElement>(`.${CSS_CLASS_THINKING_TOGGLE}`); if (!content || !toggleIcon) return; const isFolded = header.getAttribute("data-fold-state") === "folded"; if (isFolded) { content.style.display = "block"; toggleIcon.textContent = "▼"; header.setAttribute("data-fold-state", "expanded"); } else { content.style.display = "none"; toggleIcon.textContent = "►"; header.setAttribute("data-fold-state", "folded"); } }); }); }
  private decodeHtmlEntities(text: string): string { if (typeof document === 'undefined') return text; const textArea = document.createElement("textarea"); textArea.innerHTML = text; return textArea.value; }
  private detectThinkingTags(content: string): { hasThinkingTags: boolean; format: string } { if (/<think>[\s\S]*?<\/think>/gi.test(content)) { return { hasThinkingTags: true, format: "standard" }; } return { hasThinkingTags: false, format: "none" }; }

  // --- Speech Recognition Placeholder Methods ---
  private initSpeechWorker(): void { /* ... placeholder ... */ }
  private setupSpeechWorkerHandlers(): void { /* ... placeholder ... */ }
  private insertTranscript(transcript: string): void { /* ... placeholder ... */ }
  private async toggleVoiceRecognition(): Promise<void> { /* ... placeholder ... */ }
  private async startVoiceRecognition(): Promise<void> { /* ... placeholder ... */ }
  private stopVoiceRecording(processAudio: boolean): void { /* ... placeholder ... */ }


  // --- Helpers & Utilities ---
  public getChatContainer(): HTMLElement { return this.chatContainer; }
  private clearChatContainerInternal(): void {
    this.messages = [];
    this.messagesPairCount = 0;
    this.lastMessageDate = null;
    if (this.chatContainer) { this.chatContainer.empty(); }
    this.hideEmptyState();
  }
  // --- Доданий метод для очищення ззовні (з main.ts) ---
  public clearDisplayAndState(): void {
    this.clearChatContainerInternal(); // Очищає масив повідомлень та DOM
    this.showEmptyState(); // Показує порожній стан
    this.updateSendButtonState(); // Оновлює стан кнопок
    // setTimeout(() => {
    //   this.inputEl?.focus();
    //   console.log("OllamaView: Input focus attempted after clear."); // English log
    // }, 50); // Затримка 50ms (можна спробувати 0 або 100, якщо 50 не спрацює)
    console.log("OllamaView: Дисплей та внутрішній стан очищено.");
  }

  // --- Інші хелпери (addLoadingIndicator, etc. - без змін) ---
  public addLoadingIndicator(): HTMLElement { this.hideEmptyState(); const messageGroup = this.chatContainer.createDiv({ cls: `${CSS_CLASS_MESSAGE_GROUP} ${CSS_CLASS_OLLAMA_GROUP}` }); this.renderAvatar(messageGroup, false); const messageEl = messageGroup.createDiv({ cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_OLLAMA_MESSAGE}` }); const dotsContainer = messageEl.createDiv({ cls: CSS_CLASS_THINKING_DOTS }); for (let i = 0; i < 3; i++) { dotsContainer.createDiv({ cls: CSS_CLASS_THINKING_DOT }); } this.guaranteedScrollToBottom(50, true); return messageGroup; }
  public removeLoadingIndicator(loadingEl: HTMLElement | null): void { if (loadingEl?.parentNode) { loadingEl.remove(); } } // Додано перевірку loadingEl
  public scrollToBottom(): void { this.guaranteedScrollToBottom(50, true); }
  public clearInputField(): void { if (this.inputEl) { this.inputEl.value = ""; this.inputEl.dispatchEvent(new Event('input')); } }
  // guaranteedScrollToBottom(delay = 50, forceScroll = false): void { if (this.scrollTimeout) { clearTimeout(this.scrollTimeout); } this.scrollTimeout = setTimeout(() => { requestAnimationFrame(() => { if (this.chatContainer) { const scrollThreshold = 100; const isScrolledUpCheck = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight > scrollThreshold; if (isScrolledUpCheck !== this.userScrolledUp) { this.userScrolledUp = isScrolledUpCheck; if (!this.userScrolledUp) { this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } } if (forceScroll || !this.userScrolledUp || this.isProcessing) { this.chatContainer.scrollTop = this.chatContainer.scrollHeight; if (forceScroll || this.isProcessing) { this.userScrolledUp = false; this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } } } }); }, delay); }

  guaranteedScrollToBottom(delay = 50, forceScroll = false): void {
    // Скасовуємо попередній таймаут, якщо він є
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null; // Скидаємо
    }
    // console.log(`[OllamaView] guaranteedScrollToBottom called. Delay: ${delay}, Force: ${forceScroll}, UserScrolledUp: ${this.userScrolledUp}`);

    this.scrollTimeout = setTimeout(() => {
      requestAnimationFrame(() => {
        if (this.chatContainer) {
          const scrollThreshold = 100; // Поріг для визначення "нагорі"
          const currentScrollTop = this.chatContainer.scrollTop;
          const currentScrollHeight = this.chatContainer.scrollHeight;
          const currentClientHeight = this.chatContainer.clientHeight;

          const isScrolledUpCheck = currentScrollHeight - currentScrollTop - currentClientHeight > scrollThreshold;

          // Оновлюємо стан userScrolledUp, якщо він змінився
          if (isScrolledUpCheck !== this.userScrolledUp) {
            // console.log(`[OllamaView] User scroll state changed: ${this.userScrolledUp} -> ${isScrolledUpCheck}`);
            this.userScrolledUp = isScrolledUpCheck;
            if (!this.userScrolledUp) {
              this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
            }
          }

          // Виконуємо прокрутку, якщо:
          // 1. forceScroll = true (примусово, напр. після завантаження або відповіді AI)
          // 2. Користувач НЕ прокрутив вручну НАГОРУ
          // 3. Йде процес обробки повідомлення (щоб бачити індикатор завантаження)
          if (forceScroll || !this.userScrolledUp || this.isProcessing) {
            // console.log(`[OllamaView] Scrolling to bottom. Force: ${forceScroll}, UserScrolledUp: ${this.userScrolledUp}, Processing: ${this.isProcessing}`);
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
            // Якщо прокрутка була примусовою або під час обробки, вважаємо, що користувач тепер внизу
            if (forceScroll || this.isProcessing) {
              if (this.userScrolledUp) {
                // console.log("[OllamaView] Resetting userScrolledUp flag due to forced scroll.");
              }
              this.userScrolledUp = false;
              this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
            }
          } else {
            // console.log(`[OllamaView] Scroll skipped. Force: ${forceScroll}, UserScrolledUp: ${this.userScrolledUp}, Processing: ${this.isProcessing}`);
          }
        } else {
          console.warn("[OllamaView] guaranteedScrollToBottom: chatContainer not found during animation frame.");
        }
      });
      this.scrollTimeout = null; // Скидаємо таймаут після виконання
    }, delay); // Використовуємо передану затримку
  }


  formatTime(date: Date): string { return date.toLocaleTimeString('uk-UA', { hour: "2-digit", minute: "2-digit" }); } // Український формат
  formatDateSeparator(date: Date): string { const now = new Date(); const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1); if (this.isSameDay(date, now)) { return "Сьогодні"; } else if (this.isSameDay(date, yesterday)) { return "Вчора"; } else { return date.toLocaleDateString('uk-UA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); } } // Український формат
  isSameDay(date1: Date, date2: Date): boolean { return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate(); }
  public setLoadingState(isLoading: boolean): void { this.isProcessing = isLoading; if (this.inputEl) this.inputEl.disabled = isLoading; this.updateSendButtonState(); if (this.voiceButton) { this.voiceButton.disabled = isLoading; this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } if (this.menuButton) { this.menuButton.disabled = isLoading; this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } }
}