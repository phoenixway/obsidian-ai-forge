// src/SidebarManager.ts
import { App, setIcon, Menu, Notice, TFolder, normalizePath, debounce, MenuItem, TAbstractFile } from "obsidian";
import OllamaPlugin from "./main";
import { RoleInfo } from "./ChatManager";
import { ChatMetadata } from "./Chat";
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import * as RendererUtils from "./MessageRendererUtils";
import { Message } from "./types";
import { OllamaView } from "./OllamaView";
import { HierarchyNode, FolderNode, ChatNode } from "./ChatManager";

// --- CSS Classes ---
const CSS_SIDEBAR_CONTAINER = "ollama-sidebar-container";
const CSS_ROLE_PANEL = "ollama-role-panel";
const CSS_CHAT_PANEL = "ollama-chat-panel";
const CSS_ROLE_PANEL_HEADER = "ollama-role-panel-header";
const CSS_ROLE_PANEL_LIST = "ollama-role-panel-list";
const CSS_ROLE_PANEL_ITEM = "ollama-role-panel-item";
const CSS_ROLE_PANEL_ITEM_ICON = "ollama-role-panel-item-icon";
const CSS_ROLE_PANEL_ITEM_TEXT = "ollama-role-panel-item-text";
const CSS_ROLE_PANEL_ITEM_ACTIVE = "is-active";
const CSS_ROLE_PANEL_ITEM_CUSTOM = "is-custom";
const CSS_ROLE_PANEL_ITEM_NONE = "ollama-role-panel-item-none";

const CSS_CLASS_MENU_OPTION = "menu-option";
const CSS_SIDEBAR_SECTION_HEADER = "ollama-sidebar-section-header";
const CSS_SIDEBAR_SECTION_CONTENT = "ollama-sidebar-section-content";
// const CSS_SIDEBAR_SECTION_ICON = "ollama-sidebar-section-icon"; // Більше не використовується
const CSS_SECTION_TOGGLE_CHEVRON = "ollama-section-toggle-chevron"; // Новий клас для шеврона справа
const CSS_SIDEBAR_HEADER_ACTIONS = "ollama-sidebar-header-actions";
const CSS_SIDEBAR_HEADER_BUTTON = "ollama-sidebar-header-button";
const CSS_SIDEBAR_HEADER_LEFT = "ollama-sidebar-header-left";
const CSS_SIDEBAR_SECTION_CONTENT_HIDDEN = "ollama-sidebar-section-content-hidden";
const CSS_EXPANDED_CLASS = "is-expanded";

// Класи для списку чатів/папок
const CSS_CHAT_LIST_CONTAINER = "ollama-chat-list-container";
const CSS_HIERARCHY_ITEM = "ollama-hierarchy-item";
const CSS_FOLDER_ITEM = "ollama-folder-item";
const CSS_CHAT_ITEM = "ollama-chat-item";
const CSS_HIERARCHY_ITEM_CONTENT = "ollama-hierarchy-item-content";
const CSS_HIERARCHY_ITEM_CHILDREN = "ollama-hierarchy-item-children";
const CSS_HIERARCHY_ITEM_COLLAPSED = "is-collapsed";
const CSS_FOLDER_ICON = "ollama-folder-icon";
const CSS_HIERARCHY_ITEM_TEXT = "ollama-hierarchy-item-text";
const CSS_CHAT_ITEM_DETAILS = "ollama-chat-item-details";
const CSS_CHAT_ITEM_DATE = "ollama-chat-item-date";
const CSS_HIERARCHY_ITEM_OPTIONS = "ollama-hierarchy-item-options";
const CSS_HIERARCHY_INDENT_PREFIX = "ollama-indent-level-";
const CSS_FOLDER_ACTIVE_ANCESTOR = "is-active-ancestor";

// Меню та інше
const CSS_CLASS_MENU_SEPARATOR = "menu-separator";

// Іконки
// const COLLAPSE_ICON_ROLE = "lucide-folder"; // Замінено на шеврони
// const EXPAND_ICON_ROLE = "lucide-folder-open";   // Замінено на шеврони
const COLLAPSE_ICON_ACCORDION = "lucide-chevron-right"; // Іконка для згорнутої секції
const EXPAND_ICON_ACCORDION = "lucide-chevron-down"; // Іконка для розгорнутої секції
const FOLDER_ICON_CLOSED = "lucide-folder";
const FOLDER_ICON_OPEN = "lucide-folder-open";
const CHAT_ICON = "lucide-message-square";
const CHAT_ICON_ACTIVE = "lucide-check";
const CSS_SIDEBAR_SECTION_ICON = "ollama-sidebar-section-icon"; // Повертаємо клас лівої іконки
// ...

// --- Іконки ---
const CHATS_SECTION_ICON = "lucide-messages-square"; // Іконка для секції Chats
const ROLES_SECTION_ICON = "lucide-users"; // Іконка для секції Roles

export class SidebarManager {
  private plugin: OllamaPlugin;
  private app: App;
  private view: OllamaView;

  private rootDropZoneEl!: HTMLElement; 

  private draggedItemData: { type: 'chat' | 'folder'; id: string; path: string; name: string; } | null = null;
  private containerEl!: HTMLElement;
  private chatPanelHeaderEl!: HTMLElement;
  private chatPanelListContainerEl!: HTMLElement;
  private newChatSidebarButton!: HTMLElement;
  private newFolderSidebarButton!: HTMLElement;
  private rolePanelHeaderEl!: HTMLElement;
  private rolePanelListEl!: HTMLElement;

  private folderExpansionState: Map<string, boolean> = new Map();
  private updateCounter = 0;

  constructor(plugin: OllamaPlugin, app: App, view: OllamaView) {
    this.plugin = plugin;
    this.app = app;
    this.view = view;
  }
  
public createSidebarUI(parentElement: HTMLElement): HTMLElement {
  this.containerEl = parentElement.createDiv({ cls: CSS_SIDEBAR_CONTAINER });
  // this.plugin.logger.debug("[SidebarUI] Creating sidebar UI structure...");

  // --- Секція Чатів ---
  const chatPanel = this.containerEl.createDiv({ cls: CSS_CHAT_PANEL });

  // Заголовок секції чатів
  this.chatPanelHeaderEl = chatPanel.createDiv({
    cls: [CSS_SIDEBAR_SECTION_HEADER, CSS_CLASS_MENU_OPTION],
    attr: { "data-section-type": "chats", "data-collapsed": "false" }, // За замовчуванням розгорнуто
  });
  const chatHeaderLeft = this.chatPanelHeaderEl.createDiv({ cls: CSS_SIDEBAR_HEADER_LEFT });
  setIcon(chatHeaderLeft.createSpan({ cls: CSS_SIDEBAR_SECTION_ICON }), CHATS_SECTION_ICON);
  chatHeaderLeft.createSpan({ cls: "menu-option-text", text: "Chats" });

  const chatHeaderActions = this.chatPanelHeaderEl.createDiv({ cls: CSS_SIDEBAR_HEADER_ACTIONS });
  // Кнопка "Нова папка"
  this.newFolderSidebarButton = chatHeaderActions.createDiv({
    cls: [CSS_SIDEBAR_HEADER_BUTTON, "clickable-icon"],
    attr: { "aria-label": "New Folder", title: "New Folder" },
  });
  setIcon(this.newFolderSidebarButton, "lucide-folder-plus");
  // Кнопка "Новий чат"
  this.newChatSidebarButton = chatHeaderActions.createDiv({
    cls: [CSS_SIDEBAR_HEADER_BUTTON, "clickable-icon"],
    attr: { "aria-label": "New Chat", title: "New Chat" },
  });
  setIcon(this.newChatSidebarButton, "lucide-plus-circle");
  // Шеврон для розгортання/згортання секції чатів
  const chatChevron = chatHeaderActions.createSpan({ cls: [CSS_SECTION_TOGGLE_CHEVRON, "clickable-icon"] });
  setIcon(chatChevron, EXPAND_ICON_ACCORDION); // Іконка розгорнутої секції

  // Контейнер для списку чатів та папок
  this.chatPanelListContainerEl = chatPanel.createDiv({
    cls: [CSS_CHAT_LIST_CONTAINER, CSS_SIDEBAR_SECTION_CONTENT, CSS_EXPANDED_CLASS], // Починаємо з розгорнутого стану
  });

  // --- СПЕЦІАЛЬНА ЗОНА ДЛЯ СКИДАННЯ В КОРІНЬ ---
  // Цей елемент додається всередині chatPanel, ПІСЛЯ chatPanelListContainerEl
  this.rootDropZoneEl = chatPanel.createDiv({ cls: 'ollama-root-drop-zone' });
  // Опціональний текст-підказка (можна стилізувати через CSS content або додати span)
  // this.rootDropZoneEl.createSpan({ text: "Drop here to move to root" });

  // Прив'язуємо обробники Drag-and-Drop до цієї спеціальної зони
  this.view.registerDomEvent(this.rootDropZoneEl, 'dragover', this.handleDragOverRootZone.bind(this));
  this.view.registerDomEvent(this.rootDropZoneEl, 'dragenter', this.handleDragEnterRootZone.bind(this));
  this.view.registerDomEvent(this.rootDropZoneEl, 'dragleave', this.handleDragLeaveRootZone.bind(this));
  this.view.registerDomEvent(this.rootDropZoneEl, 'drop', this.handleDropRootZone.bind(this));
  // this.plugin.logger.debug("[SidebarUI] Root drop listeners attached to dedicated root drop zone element.");
  // --- КІНЕЦЬ СПЕЦІАЛЬНОЇ ЗОНИ ---

  // --- Секція Ролей ---
  const rolePanel = this.containerEl.createDiv({ cls: CSS_ROLE_PANEL });
  // Заголовок секції ролей
  this.rolePanelHeaderEl = rolePanel.createDiv({
    cls: [CSS_SIDEBAR_SECTION_HEADER, CSS_CLASS_MENU_OPTION],
    attr: { "data-section-type": "roles", "data-collapsed": "true" }, // За замовчуванням згорнуто
  });
  const roleHeaderLeft = this.rolePanelHeaderEl.createDiv({ cls: CSS_SIDEBAR_HEADER_LEFT });
  setIcon(roleHeaderLeft.createSpan({ cls: CSS_SIDEBAR_SECTION_ICON }), ROLES_SECTION_ICON);
  roleHeaderLeft.createSpan({ cls: "menu-option-text", text: "Roles" });

  const roleHeaderActions = this.rolePanelHeaderEl.createDiv({ cls: CSS_SIDEBAR_HEADER_ACTIONS });
  // Шеврон для розгортання/згортання секції ролей
  const roleChevron = roleHeaderActions.createSpan({ cls: [CSS_SECTION_TOGGLE_CHEVRON, "clickable-icon"] });
  setIcon(roleChevron, COLLAPSE_ICON_ACCORDION); // Іконка згорнутої секції

  // Контейнер для списку ролей
  this.rolePanelListEl = rolePanel.createDiv({
      cls: [CSS_ROLE_PANEL_LIST, CSS_SIDEBAR_SECTION_CONTENT] // За замовчуванням приховано
  });
  // Додаємо клас для приховування, якщо секція згорнута
  if (this.rolePanelHeaderEl.getAttribute("data-collapsed") === "true") {
      this.rolePanelListEl.addClass(CSS_SIDEBAR_SECTION_CONTENT_HIDDEN);
  }

  // Прив'язуємо основні слухачі подій для сайдбару (кліки на заголовки секцій, кнопки "новий чат/папка")
  this.attachSidebarEventListeners();

  // Початкове заповнення списку чатів, якщо секція видима (за замовчуванням вона видима)
  if (this.isSectionVisible("chats")) {
    // this.plugin.logger.debug("[SidebarUI] Initial chat list update scheduled because 'chats' section is visible.");
    this.updateChatList();
  } else {
      this.plugin.logger.debug("[SidebarUI] 'Chats' section initially collapsed, chat list update deferred.");
  }
  // Початкове заповнення списку ролей, якщо секція видима (за замовчуванням вона згорнута)
  if (this.isSectionVisible("roles")) {
    this.plugin.logger.debug("[SidebarUI] 'Roles' section initially visible, role list update scheduled.");
    this.updateRoleList();
  } else {
      this.plugin.logger.debug("[SidebarUI] 'Roles' section initially collapsed, role list update deferred.");
  }

  // this.plugin.logger.debug("[SidebarUI] Sidebar UI creation complete.");
  return this.containerEl;
} // --- Кінець createSidebarUI ---
  private attachSidebarEventListeners(): void {
    if (
      !this.chatPanelHeaderEl ||
      !this.rolePanelHeaderEl ||
      !this.newChatSidebarButton ||
      !this.newFolderSidebarButton
    ) {
      this.plugin.logger.error("[SidebarManager] Cannot attach listeners: UI elements missing.");
      return;
    }
    // Клік на весь заголовок (включаючи шеврон) тепер перемикає секцію
    this.view.registerDomEvent(this.chatPanelHeaderEl, "click", () => this.toggleSection(this.chatPanelHeaderEl));
    this.view.registerDomEvent(this.rolePanelHeaderEl, "click", () => this.toggleSection(this.rolePanelHeaderEl));

    // Кліки на кнопки дій (запобігаємо спливанню, щоб не згорнути секцію)
    this.view.registerDomEvent(this.newChatSidebarButton, "click", e => {
      e.stopPropagation();
      this.handleNewChatClick(this.plugin.chatManager.chatsFolderPath);
    });
    this.view.registerDomEvent(this.newFolderSidebarButton, "click", e => {
      e.stopPropagation();
      this.handleNewFolderClick(this.plugin.chatManager.chatsFolderPath);
    });
  }

  public isSectionVisible(type: "chats" | "roles"): boolean {
    const headerEl = type === "chats" ? this.chatPanelHeaderEl : this.rolePanelHeaderEl;
    return headerEl?.getAttribute("data-collapsed") === "false";
  }

  public updateChatList = async (): Promise<void> => {
    this.updateCounter++;
    const currentUpdateId = this.updateCounter;
    const container = this.chatPanelListContainerEl;
    if (!container || !this.plugin.chatManager) {
      return;
    }
    this.plugin.logger.info(
      // `[Update #${currentUpdateId}] >>>>> STARTING updateChatList (visible: ${this.isSectionVisible("chats")})`
    );
    container.classList.add("is-loading"); // Додаємо клас завантаження
    const currentScrollTop = container.scrollTop;
    container.empty();
    try {
      const hierarchy = await this.plugin.chatManager.getChatHierarchy();
      const currentActiveChatId = this.plugin.chatManager.getActiveChatId();
      const activeAncestorPaths = new Set<string>();
      if (currentActiveChatId) {
        const activeChat = await this.plugin.chatManager.getActiveChat();
        if (activeChat?.filePath) {
          let currentPath = activeChat.filePath;
          while (currentPath.includes("/")) {
            const parentPath = currentPath.substring(0, currentPath.lastIndexOf("/"));
            if (parentPath === "") {
              break;
            } else {
              const normalizedParentPath = normalizePath(parentPath);
              activeAncestorPaths.add(normalizedParentPath);
              currentPath = parentPath;
            }
          }
        } else if (activeChat) {
        }
      }
      if (hierarchy.length === 0) {
        container.createDiv({ cls: "menu-info-text", text: "No saved chats or folders yet." });
      } else {
        hierarchy.forEach(node =>
          this.renderHierarchyNode(node, container, 0, currentActiveChatId, activeAncestorPaths, currentUpdateId)
        );
      }
      // this.plugin.logger.info(`[Update #${currentUpdateId}] <<<<< FINISHED updateChatList (rendering done)`);
    } catch (error) {
      this.plugin.logger.error(`[Update #${currentUpdateId}] Error rendering hierarchy:`, error);
      container.empty();
      container.createDiv({ text: "Error loading chat structure.", cls: "menu-error-text" });
    } finally {
      container.classList.remove("is-loading");
      requestAnimationFrame(() => {
        if (container?.isConnected) {
          container.scrollTop = currentScrollTop;
        }
      });
    }
  };

  // src/SidebarManager.ts

private renderHierarchyNode(
  node: HierarchyNode,          // Вузол ієрархії (папка або чат)
  parentElement: HTMLElement,   // Батьківський HTML елемент
  level: number,                // Рівень вкладеності
  activeChatId: string | null,  // ID поточного активного чату
  activeAncestorPaths: Set<string>, // Шляхи до активних батьківських папок
  updateId: number              // ID поточного оновлення (для логів)
): void {
  // Створюємо основний контейнер для елемента списку
  const itemEl = parentElement.createDiv({ cls: [CSS_HIERARCHY_ITEM, `${CSS_HIERARCHY_INDENT_PREFIX}${level}`] });
  // Створюємо внутрішній контейнер для контенту (іконка, текст, кнопки)
  const itemContentEl = itemEl.createDiv({ cls: CSS_HIERARCHY_ITEM_CONTENT });

  // --- Drag-and-Drop: Робимо елемент перетягуваним та додаємо слухачі ---
  itemEl.setAttr('draggable', 'true');
  // Початок перетягування - зберігаємо дані про елемент
  this.view.registerDomEvent(itemEl, 'dragstart', (e) => this.handleDragStart(e, node));
  // Кінець перетягування (успішне чи ні) - очищаємо стилі/дані
  this.view.registerDomEvent(itemEl, 'dragend', (e) => this.handleDragEnd(e));
  // --- Кінець Drag-and-Drop для елемента, що перетягується ---

  // --- Логіка для ПАПОК ---
  if (node.type === 'folder') {
      itemEl.addClass(CSS_FOLDER_ITEM);
      itemEl.dataset.path = node.path; // Зберігаємо шлях папки для ідентифікації
      const isExpanded = this.folderExpansionState.get(node.path) ?? false;
      if (!isExpanded) {
          itemEl.addClass(CSS_HIERARCHY_ITEM_COLLAPSED); // Клас для згорнутої папки
      }
      if (activeAncestorPaths.has(node.path)) {
          itemEl.addClass(CSS_FOLDER_ACTIVE_ANCESTOR); // Клас для активного предка
      }

      // Іконка папки (відкрита/закрита)
      const folderIcon = itemContentEl.createSpan({ cls: CSS_FOLDER_ICON });
      setIcon(folderIcon, isExpanded ? FOLDER_ICON_OPEN : FOLDER_ICON_CLOSED);
      // Назва папки
      itemContentEl.createSpan({ cls: CSS_HIERARCHY_ITEM_TEXT, text: node.name });

      // Кнопка "..." (опції папки)
      const optionsBtn = itemContentEl.createEl("button", {
          cls: [CSS_HIERARCHY_ITEM_OPTIONS, "clickable-icon"],
          attr: { "aria-label": "Folder options", title: "More options" },
      });
      setIcon(optionsBtn, "lucide-more-horizontal");
      // Обробник кліку на кнопку опцій
      this.view.registerDomEvent(optionsBtn, "click", (e: MouseEvent) => {
          e.stopPropagation(); // Зупиняємо спливання, щоб не спрацював клік на папку
          this.showFolderContextMenu(e, node);
      });

      // --- Drag-and-Drop: Додаємо слухачі для папки як ЦІЛІ скидання ---
      this.view.registerDomEvent(itemEl, 'dragover', this.handleDragOver);
      this.view.registerDomEvent(itemEl, 'dragenter', (e) => this.handleDragEnter(e, node));
      this.view.registerDomEvent(itemEl, 'dragleave', this.handleDragLeave);
      this.view.registerDomEvent(itemEl, 'drop', (e) => this.handleDrop(e, node));
      // --- Кінець Drag-and-Drop для цілі скидання ---

      // Обробник контекстного меню на всю папку
      this.view.registerDomEvent(itemContentEl, "contextmenu", (e: MouseEvent) => {
          e.preventDefault();
          this.showFolderContextMenu(e, node);
      });
      // Обробник кліку на папку (для розгортання/згортання)
      this.view.registerDomEvent(itemContentEl, "click", (e: MouseEvent) => {
         // Перевіряємо, чи клік був не на кнопці опцій
         if (e.target instanceof Element && !e.target.closest(`.${CSS_HIERARCHY_ITEM_OPTIONS}`)) {
             this.handleToggleFolder(node.path);
         }
      });

      // Створюємо контейнер для дочірніх елементів
      const childrenContainer = itemEl.createDiv({ cls: CSS_HIERARCHY_ITEM_CHILDREN });
      // Рекурсивно рендеримо дочірні елементи, якщо вони є
      if (node.children && node.children.length > 0) {
          node.children.forEach(childNode =>
          this.renderHierarchyNode(childNode, childrenContainer, level + 1, activeChatId, activeAncestorPaths, updateId)
          );
      }
  }
  // --- Логіка для ЧАТІВ ---
  else if (node.type === 'chat') {
      itemEl.addClass(CSS_CHAT_ITEM);
      const chatMeta = node.metadata;
      itemEl.dataset.chatId = chatMeta.id; // Зберігаємо ID чату
      itemEl.dataset.filePath = node.filePath; // Зберігаємо шлях до файлу чату

      // Перевірка, чи чат активний
      const isActive = chatMeta.id === activeChatId;
      if (isActive) {
          itemEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE); // Клас для активного чату
      }

      // Іконка чату (звичайна або активна)
      const chatIcon = itemContentEl.createSpan({ cls: CSS_FOLDER_ICON }); // Можливо, варто змінити клас
      setIcon(chatIcon, isActive ? CHAT_ICON_ACTIVE : CHAT_ICON);
      // Назва чату
      itemContentEl.createSpan({ cls: CSS_HIERARCHY_ITEM_TEXT, text: chatMeta.name });

      // Контейнер для деталей (дата)
      const detailsWrapper = itemContentEl.createDiv({ cls: CSS_CHAT_ITEM_DETAILS });
      try {
          const lastModifiedDate = new Date(chatMeta.lastModified);
          const dateText = !isNaN(lastModifiedDate.getTime())
          ? this.formatRelativeDate(lastModifiedDate) // Використовуємо відносну дату
          : "Invalid date";
          if (dateText === "Invalid date") {
               this.plugin.logger.warn(`[Render] Invalid date for chat ${chatMeta.id}: ${chatMeta.lastModified}`);
          }
          detailsWrapper.createDiv({ cls: CSS_CHAT_ITEM_DATE, text: dateText });
      } catch (e) {
          this.plugin.logger.error(`Error formatting date for chat ${chatMeta.id}: `, e);
          detailsWrapper.createDiv({ cls: CSS_CHAT_ITEM_DATE, text: "Date error" });
      }

      // Кнопка "..." (опції чату)
      const optionsBtn = itemContentEl.createEl("button", {
          cls: [CSS_HIERARCHY_ITEM_OPTIONS, "clickable-icon"],
          attr: { "aria-label": "Chat options", title: "More options" },
      });
      setIcon(optionsBtn, "lucide-more-horizontal");
      // Обробник кліку на кнопку опцій
      this.view.registerDomEvent(optionsBtn, "click", (e: MouseEvent) => {
          e.stopPropagation(); // Зупиняємо спливання
          this.showChatContextMenu(e, chatMeta);
      });

      // Обробник кліку на чат (для активації)
      this.view.registerDomEvent(itemContentEl, "click", async (e: MouseEvent) => {
          // Перевіряємо, чи клік був не на кнопці опцій
          if (e.target instanceof Element && !e.target.closest(`.${CSS_HIERARCHY_ITEM_OPTIONS}`)) {
              if (chatMeta.id !== activeChatId) {
                  await this.plugin.chatManager.setActiveChat(chatMeta.id);
              }
          }
      });
      // Обробник контекстного меню на чат
      this.view.registerDomEvent(itemContentEl, "contextmenu", (e: MouseEvent) => {
          e.preventDefault();
          this.showChatContextMenu(e, chatMeta);
      });

      // Чат не може бути ціллю для скидання (drop target), тому обробники 'dragover', 'drop' etc. не додаються.
  }
} // --- Кінець методу renderHierarchyNode ---

  private handleToggleFolder(folderPath: string): void {
    const currentState = this.folderExpansionState.get(folderPath) ?? false;
    const newState = !currentState;
    this.folderExpansionState.set(folderPath, newState);

    const folderItemEl = this.chatPanelListContainerEl.querySelector<HTMLElement>(
      `.ollama-folder-item[data-path="${folderPath}"]`
    );
    if (!folderItemEl) {
      this.updateChatList();
      return;
    }
    folderItemEl.classList.toggle(CSS_HIERARCHY_ITEM_COLLAPSED, !newState);
    const folderIconEl = folderItemEl.querySelector<HTMLElement>("." + CSS_FOLDER_ICON);
    if (folderIconEl) {
      setIcon(folderIconEl, newState ? FOLDER_ICON_OPEN : FOLDER_ICON_CLOSED);
    }
  }

  // Метод для розгортання/згортання секцій Chats/Roles (акордеон)
  private async toggleSection(clickedHeaderEl: HTMLElement): Promise<void> {
    // Визначаємо тип секції, на яку клікнули ('chats' або 'roles')
    const sectionType = clickedHeaderEl.getAttribute("data-section-type") as "chats" | "roles";
    // Перевіряємо поточний стан (true, якщо секція зараз згорнута)
    const isCurrentlyCollapsed = clickedHeaderEl.getAttribute("data-collapsed") === "true";
    // Знаходимо елемент іконки-шеврона в клікнутому заголовку
    const iconEl = clickedHeaderEl.querySelector<HTMLElement>(`.${CSS_SECTION_TOGGLE_CHEVRON}`);

    // Визначаємо елементи DOM для поточної та іншої секції
    let contentEl: HTMLElement | null;
    let updateFunction: (() => Promise<void>) | null; // Функція для оновлення вмісту (updateChatList або updateRoleList)
    let otherHeaderEl: HTMLElement | null;
    let otherContentEl: HTMLElement | null;
    let otherSectionType: "chats" | "roles" | null = null;

    // Отримуємо посилання на основні елементи панелей
    const chatHeader = this.chatPanelHeaderEl;
    const chatContent = this.chatPanelListContainerEl;
    const roleHeader = this.rolePanelHeaderEl;
    const roleContent = this.rolePanelListEl;

    // Призначаємо змінні залежно від типу секції, на яку клікнули
    if (sectionType === "chats") {
      contentEl = chatContent;
      updateFunction = this.updateChatList;
      otherHeaderEl = roleHeader;
      otherContentEl = roleContent;
      otherSectionType = "roles";
    } else {
      // sectionType === "roles"
      contentEl = roleContent;
      updateFunction = this.updateRoleList;
      otherHeaderEl = chatHeader;
      otherContentEl = chatContent;
      otherSectionType = "chats";
    }

    // Перевірка, чи всі необхідні елементи знайдено
    if (!contentEl || !iconEl || !updateFunction || !otherHeaderEl || !otherContentEl || !otherSectionType) {
      this.plugin.logger.error("Could not find all required elements for sidebar accordion toggle:", sectionType);
      return; // Виходимо, якщо щось не знайдено
    }

    // Прив'язуємо контекст 'this' до функції оновлення для подальшого виклику
    const boundUpdateFunction = updateFunction.bind(this);

    // --- Логіка розгортання/згортання ---
    if (isCurrentlyCollapsed) {
      // === РОЗГОРТАЄМО ПОТОЧНУ СЕКЦІЮ ===

      // 1. Згортаємо ІНШУ секцію (якщо вона зараз розгорнута)
      if (otherHeaderEl.getAttribute("data-collapsed") === "false") {
        const otherIconEl = otherHeaderEl.querySelector<HTMLElement>(`.${CSS_SECTION_TOGGLE_CHEVRON}`);
        otherHeaderEl.setAttribute("data-collapsed", "true"); // Позначаємо іншу як згорнуту
        if (otherIconEl) setIcon(otherIconEl, COLLAPSE_ICON_ACCORDION); // Встановлюємо іконку згортання для іншої
        otherContentEl.classList.remove(CSS_EXPANDED_CLASS); // Видаляємо клас розгорнутого стану
        otherContentEl.classList.add(CSS_SIDEBAR_SECTION_CONTENT_HIDDEN); // Додаємо клас для миттєвого приховування (через CSS)

        // Ховаємо ТІЛЬКИ кнопки дій в іншій секції (шеврон залишається видимим)
        const otherHeaderButtons = otherHeaderEl.querySelectorAll<HTMLElement>(`.${CSS_SIDEBAR_HEADER_BUTTON}`);
        otherHeaderButtons.forEach(btn => (btn.style.display = "none"));
      }

      // 2. Розгортаємо ПОТОЧНУ секцію
      clickedHeaderEl.setAttribute("data-collapsed", "false"); // Позначаємо поточну як розгорнуту
      setIcon(iconEl, EXPAND_ICON_ACCORDION); // Встановлюємо іконку розгортання
      contentEl.classList.remove(CSS_SIDEBAR_SECTION_CONTENT_HIDDEN); // Видаляємо клас швидкого приховування

      // Показуємо кнопки дій в поточній секції
      const headerButtons = clickedHeaderEl.querySelectorAll<HTMLElement>(`.${CSS_SIDEBAR_HEADER_BUTTON}`);
      headerButtons.forEach(btn => (btn.style.display = "")); // Повертаємо стандартний display

      try {
        // Спочатку оновлюємо вміст секції (завантажуємо дані, рендеримо)
        await boundUpdateFunction();
        // Потім, у наступному кадрі анімації, додаємо клас 'is-expanded'.
        // CSS подбає про плавну анімацію розгортання.
        requestAnimationFrame(() => {
          if (contentEl?.isConnected && clickedHeaderEl.getAttribute("data-collapsed") === "false") {
            contentEl.classList.add(CSS_EXPANDED_CLASS);
          }
        });
      } catch (error) {
        // Обробка помилки під час оновлення вмісту
        this.plugin.logger.error(`Error updating sidebar section ${sectionType}:`, error);
        contentEl.setText(`Error loading ${sectionType}.`); // Показуємо повідомлення про помилку
        // Все одно додаємо клас, щоб показати помилку
        requestAnimationFrame(() => {
          if (contentEl?.isConnected && clickedHeaderEl.getAttribute("data-collapsed") === "false") {
            contentEl.classList.add(CSS_EXPANDED_CLASS);
          }
        });
      }
    } else {
      // === ЗГОРТАЄМО ПОТОЧНУ СЕКЦІЮ ===
      // Якщо клікнули на вже розгорнуту секцію

      clickedHeaderEl.setAttribute("data-collapsed", "true"); // Позначаємо як згорнуту
      setIcon(iconEl, COLLAPSE_ICON_ACCORDION); // Встановлюємо іконку згортання
      contentEl.classList.remove(CSS_EXPANDED_CLASS); // Видаляємо клас розгорнутого стану
      contentEl.classList.add(CSS_SIDEBAR_SECTION_CONTENT_HIDDEN); // Додаємо клас для миттєвого приховування

      // Ховаємо кнопки дій в поточній секції
      const headerButtons = clickedHeaderEl.querySelectorAll<HTMLElement>(`.${CSS_SIDEBAR_HEADER_BUTTON}`);
      headerButtons.forEach(btn => (btn.style.display = "none"));
    }
  } // --- Кінець методу toggleSection ---

  // --- Решта методів без змін ---
  private showFolderContextMenu(event: MouseEvent | PointerEvent, folderNode: FolderNode): void {
    event.preventDefault();
    event.stopPropagation();
    const menu = new Menu();
    menu.addItem(item =>
      item
        .setTitle("New Chat Here")
        .setIcon("lucide-plus-circle")
        .onClick(() => this.handleNewChatClick(folderNode.path))
    );
    menu.addItem(item =>
      item
        .setTitle("New Folder Here")
        .setIcon("lucide-folder-plus")
        .onClick(() => this.handleNewFolderClick(folderNode.path))
    );
    menu.addSeparator();
    menu.addItem(item =>
      item
        .setTitle("Rename Folder")
        .setIcon("lucide-pencil")
        .onClick(() => this.handleRenameFolder(folderNode))
    );
    menu.addItem(item => {
      item
        .setTitle("Delete Folder")
        .setIcon("lucide-trash-2")
        .onClick(() => this.handleDeleteFolder(folderNode)); /* Styling via CSS */
    });
    menu.showAtMouseEvent(event);
  }
  public updateRoleList = async (): Promise<void> => {
    const container = this.rolePanelListEl;
    if (!container || !this.plugin.chatManager) {
      return;
    }
    this.plugin.logger.debug(
      `[SidebarManager.updateRoleList] Updating role list content (visible: ${this.isSectionVisible("roles")})...`
    );
    const currentScrollTop = container.scrollTop;
    container.empty();
    try {
      const roles = await this.plugin.listRoleFiles(true);
      const activeChat = await this.plugin.chatManager.getActiveChat();
      const currentRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;
      const noneOptionEl = container.createDiv({
        cls: [CSS_ROLE_PANEL_ITEM, CSS_ROLE_PANEL_ITEM_NONE, CSS_CLASS_MENU_OPTION],
      });
      const noneIconSpan = noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
      noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: "None" });
      setIcon(noneIconSpan, !currentRolePath ? "check" : "slash");
      if (!currentRolePath) noneOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
      this.view.registerDomEvent(noneOptionEl, "click", () => this.handleRolePanelItemClick(null, currentRolePath));
      roles.forEach(roleInfo => {
        const roleOptionEl = container.createDiv({ cls: [CSS_ROLE_PANEL_ITEM, CSS_CLASS_MENU_OPTION] });
        const iconSpan = roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
        roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: roleInfo.name });
        if (roleInfo.isCustom) roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_CUSTOM);
        setIcon(iconSpan, roleInfo.path === currentRolePath ? "check" : roleInfo.isCustom ? "user" : "file-text");
        if (roleInfo.path === currentRolePath) roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
        this.view.registerDomEvent(roleOptionEl, "click", () =>
          this.handleRolePanelItemClick(roleInfo, currentRolePath)
        );
      });
    } catch (error) {
      this.plugin.logger.error("[SidebarManager.updateRoleList] Error rendering:", error);
      container.empty();
      container.createDiv({ text: "Error loading roles.", cls: "menu-error-text" });
    } finally {
      requestAnimationFrame(() => {
        if (container?.isConnected) {
          container.scrollTop = currentScrollTop;
        }
      });
    }
  };
  private handleRolePanelItemClick = async (
    roleInfo: RoleInfo | null,
    currentRolePath: string | null | undefined
  ): Promise<void> => {
    const newRolePath = roleInfo?.path ?? "";
    const roleNameForEvent = roleInfo?.name ?? "None";
    const normalizedCurrentRolePath = currentRolePath ?? "";
    if (newRolePath !== normalizedCurrentRolePath) {
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      try {
        if (activeChat) {
          await this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath || undefined });
        } else {
          this.plugin.settings.selectedRolePath = newRolePath || undefined;
          await this.plugin.saveSettings();
          this.plugin.emit("role-changed", roleNameForEvent);
          this.plugin.promptService?.clearRoleCache?.();
        }
        this.updateRoleList();
      } catch (error) {
        this.plugin.logger.error(`[SidebarManager] Error setting role to ${newRolePath}:`, error);
        new Notice("Failed to set the role.");
      }
    } else {
    }
  };
  
  // src/SidebarManager.ts
private handleNewChatClick = async (targetFolderPath?: string): Promise<void> => {
  const folderPath: string = targetFolderPath ?? this.plugin.chatManager.chatsFolderPath ?? "/";
  try {
    const newChat = await this.plugin.chatManager.createNewChat(undefined, folderPath);
    if (newChat) {
      new Notice(`Created new chat: ${newChat.metadata.name}`);
      this.plugin.emit("focus-input-request");
      const parentPath = folderPath.substring(0, folderPath.lastIndexOf("/"));

      // Розгортаємо батьківську папку, якщо чат створено всередині неї
      // і це не коренева папка чатів.
      const normalizedParentPath = normalizePath(parentPath);
      const normalizedChatsFolderPath = normalizePath(this.plugin.chatManager.chatsFolderPath ?? "/");

      if (parentPath && normalizedParentPath !== "/" && normalizedParentPath !== normalizedChatsFolderPath) {
         this.folderExpansionState.set(normalizedParentPath, true);
      }

      // РЕЛІЗ: Видалено прямий виклик this.updateChatList();
      // Тепер оновлення списку має відбуватися через подію (наприклад, 'active-chat-changed' або 'chat-list-updated'),
      // яку ChatManager.createNewChat() має згенерувати, а OllamaView обробити.
    }
  } catch (error) {
    this.plugin.logger.error("[SidebarManager] Error creating new chat:", error);
    new Notice(`Error creating new chat: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
};
  
  private handleNewFolderClick = async (parentFolderPath?: string): Promise<void> => {
    const targetParentPath: string = parentFolderPath ?? this.plugin.chatManager.chatsFolderPath ?? "/";
    new PromptModal(this.app, "Create New Folder", "Enter folder name:", "", async newName => {
      const trimmedName = newName?.trim();
      if (!trimmedName) {
        new Notice("Folder name cannot be empty.");
        return;
      }
      if (/[\\/?:*"<>|]/.test(trimmedName)) {
        new Notice("Folder name contains invalid characters.");
        return;
      }
      const newFolderPath = normalizePath(
        targetParentPath === "/" ? trimmedName : `${targetParentPath}/${trimmedName}`
      );
      try {
        const success = await this.plugin.chatManager.createFolder(newFolderPath);
        if (success) {
          new Notice(`Folder "${trimmedName}" created.`);
          if (targetParentPath && targetParentPath !== "/") {
            this.folderExpansionState.set(targetParentPath, true);
          }
          // this.updateChatList();
        }
      } catch (error) {
        this.plugin.logger.error(`[SidebarManager] Error creating folder ${newFolderPath}:`, error);
        new Notice(`Error creating folder: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }).open();
  };
  private handleRenameFolder = async (folderNode: FolderNode): Promise<void> => {
    const currentName = folderNode.name;
    const parentPath = folderNode.path.substring(0, folderNode.path.lastIndexOf("/")) || "/";
    new PromptModal(this.app, "Rename Folder", `New name for "${currentName}":`, currentName, async newName => {
      const trimmedName = newName?.trim();
      if (!trimmedName || trimmedName === currentName) {
        new Notice(trimmedName === currentName ? "Name unchanged." : "Rename cancelled.");
        return;
      }
      if (/[\\/?:*"<>|]/.test(trimmedName)) {
        new Notice("Folder name contains invalid characters.");
        return;
      }
      const newFolderPath = normalizePath(parentPath === "/" ? trimmedName : `${parentPath}/${trimmedName}`);
      try {
        const exists = await this.app.vault.adapter.exists(newFolderPath);
        if (exists) {
          new Notice(`A folder or file named "${trimmedName}" already exists here.`);
          return;
        }
      } catch (e) {}
      try {
        const success = await this.plugin.chatManager.renameFolder(folderNode.path, newFolderPath);
        if (success) {
          new Notice(`Folder renamed to "${trimmedName}".`);
          if (this.folderExpansionState.has(folderNode.path)) {
            const wasExpanded = this.folderExpansionState.get(folderNode.path);
            this.folderExpansionState.delete(folderNode.path);
            this.folderExpansionState.set(newFolderPath, wasExpanded!);
          }
          // this.updateChatList();
        }
      } catch (error) {
        this.plugin.logger.error(
          `[SidebarManager] Error renaming folder ${folderNode.path} to ${newFolderPath}:`,
          error
        );
        new Notice(`Error renaming folder: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }).open();
  };
  private handleDeleteFolder = async (folderNode: FolderNode): Promise<void> => {
    const folderName = folderNode.name;
    const folderPath = folderNode.path;
    if (folderPath === this.plugin.chatManager.chatsFolderPath) {
      new Notice("Cannot delete the main chat history folder.");
      return;
    }
    new ConfirmModal(
      this.app,
      "Delete Folder",
      `Delete folder "${folderName}" and ALL its contents (subfolders and chats)? This cannot be undone.`,
      async () => {
        const notice = new Notice(`Deleting folder "${folderName}"...`, 0);
        try {
          const success = await this.plugin.chatManager.deleteFolder(folderPath);
          if (success) {
            const keysToDelete = Array.from(this.folderExpansionState.keys()).filter(key => key.startsWith(folderPath));
            keysToDelete.forEach(key => this.folderExpansionState.delete(key));
            // this.updateChatList();
          }
        } catch (error) {
          this.plugin.logger.error(`[SidebarManager] Error deleting folder ${folderPath}:`, error);
          new Notice(`Error deleting folder: ${error instanceof Error ? error.message : "Unknown error"}`);
        } finally {
          notice.hide();
        }
      }
    ).open();
  };
  private showChatContextMenu(event: MouseEvent | PointerEvent, chatMeta: ChatMetadata): void {
    event.preventDefault();
    event.stopPropagation();
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
        .onClick(() => this.handleContextMenuClear(chatMeta.id, chatMeta.name)); /* Styling via CSS */
    });
    menu.addItem(item => {
      item
        .setTitle("Delete Chat")
        .setIcon("lucide-trash-2")
        .onClick(() => this.handleContextMenuDelete(chatMeta.id, chatMeta.name)); /* Styling via CSS */
    });
    menu.showAtMouseEvent(event);
  }
  private async handleContextMenuClone(chatId: string): Promise<void> {
    const notice = new Notice("Cloning chat...", 0);
    try {
      const c = await this.plugin.chatManager.cloneChat(chatId);
      if (c) {
        new Notice(`Chat cloned as "${c.metadata.name}"`);
        // this.updateChatList();
        this.plugin.emit("focus-input-request");
      }
    } catch (e) {
      this.plugin.logger.error(`Clone error:`, e);
    } finally {
      notice.hide();
    }
  }
  private async handleContextMenuRename(chatId: string, currentName: string): Promise<void> {
    new PromptModal(this.app, "Rename Chat", `New name for "${currentName}":`, currentName, async newName => {
      const trimmedName = newName?.trim();
      if (!trimmedName || trimmedName === currentName) {
        new Notice(trimmedName === currentName ? `Name unchanged.` : `Rename cancelled.`);
      } else if (/[\\/?:*"<>|]/.test(trimmedName)) {
        new Notice("Chat name contains invalid characters.");
      } else {
        const success = await this.plugin.chatManager.renameChat(chatId, trimmedName); /* UI update handled by event */
      }
      this.plugin.emit("focus-input-request");
    }).open();
  } // Видалено явний updateChatList
  private async exportSpecificChat(chatId: string): Promise<void> {
    const notice = new Notice(`Exporting chat...`, 0);
    try {
      const chat = await this.plugin.chatManager.getChat(chatId);
      if (!chat || chat.messages.length === 0) {
        new Notice("Chat is empty or not found, nothing to export.");
        notice.hide();
        return;
      }
      const md = this.formatChatToMarkdown(chat.messages, chat.metadata);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = chat.metadata.name.replace(/[\\/?:*"<>|]/g, "-");
      const filename = `ollama-chat-${safeName}-${ts}.md`;
      let fPath = this.plugin.settings.chatExportFolderPath?.trim();
      let fFolder: TFolder | null = null;
      if (fPath) {
        fPath = normalizePath(fPath);
        const af = this.app.vault.getAbstractFileByPath(fPath);
        if (!af) {
          try {
            await this.app.vault.createFolder(fPath);
            const newAf = this.app.vault.getAbstractFileByPath(fPath);
            if (newAf instanceof TFolder) {
              fFolder = newAf;
              new Notice(`Created export folder: ${fPath}`);
            } else {
              throw new Error("Failed to get created folder.");
            }
          } catch (err) {
            this.plugin.logger.error("Folder creation error during export:", err);
            new Notice(`Export folder error. Saving to vault root.`);
            fFolder = this.app.vault.getRoot();
          }
        } else if (af instanceof TFolder) {
          fFolder = af;
        } else {
          new Notice(`Export path is not a folder. Saving to vault root.`);
          fFolder = this.app.vault.getRoot();
        }
      } else {
        fFolder = this.app.vault.getRoot();
      }
      if (!fFolder) {
        this.plugin.logger.error("Target folder for export could not be determined.");
        new Notice("Export folder error.");
        notice.hide();
        return;
      }
      const filePath = normalizePath(`${fFolder.path}/${filename}`);
      const file = await this.app.vault.create(filePath, md);
      new Notice(`Chat exported to ${file.path}`);
    } catch (e) {
      this.plugin.logger.error(`Chat export error:`, e);
      new Notice("Chat export failed.");
    } finally {
      notice.hide();
    }
  }
  private async handleContextMenuClear(chatId: string, chatName: string): Promise<void> {
    new ConfirmModal(this.app, "Clear Messages", `Clear all messages in "${chatName}"?`, async () => {
      const notice = new Notice("Clearing messages...", 0);
      try {
        const success = await this.plugin.chatManager.clearChatMessagesById(chatId);
      } catch (e) {
        this.plugin.logger.error(`Clear messages error:`, e);
        new Notice("Failed to clear messages.");
      } finally {
        notice.hide();
      }
    }).open();
  }
  private async handleContextMenuDelete(chatId: string, chatName: string): Promise<void> {
    new ConfirmModal(this.app, "Delete Chat", `Delete chat "${chatName}"? This cannot be undone.`, async () => {
      const notice = new Notice("Deleting chat...", 0);
      try {
        const success = await this.plugin.chatManager.deleteChat(chatId);
      } catch (e) {
        this.plugin.logger.error(`Delete chat error:`, e);
        new Notice("Failed to delete chat.");
      } finally {
        notice.hide();
      }
    }).open();
  }
  private formatChatToMarkdown(messagesToFormat: Message[], metadata: ChatMetadata): string {
    let localLastDate: Date | null = null;
    const exportTimestamp = new Date();
    let markdown = `# AI Forge Chat: ${metadata.name}\n\n`;
    markdown += `* **Chat ID:** ${metadata.id}\n`;
    markdown += `* **Model:** ${metadata.modelName || "Default"}\n`;
    markdown += `* **Role Path:** ${metadata.selectedRolePath || "None"}\n`;
    markdown += `* **Temperature:** ${metadata.temperature ?? this.plugin.settings.temperature}\n`;
    markdown += `* **Created:** ${new Date(metadata.createdAt).toLocaleString()}\n`;
    markdown += `* **Last Modified:** ${new Date(metadata.lastModified).toLocaleString()}\n`;
    markdown += `* **Exported:** ${exportTimestamp.toLocaleString()}\n\n`;
    markdown += `***\n\n`;
    messagesToFormat.forEach(message => {
      if (!message || !message.content?.trim() || !message.timestamp) {
        return;
      }
      let messageTimestamp: Date;
      if (typeof message.timestamp === "string") {
        messageTimestamp = new Date(message.timestamp);
      } else if (message.timestamp instanceof Date) {
        messageTimestamp = message.timestamp;
      } else {
        return;
      }
      if (isNaN(messageTimestamp.getTime())) {
        return;
      }
      if (localLastDate === null || !this.isSameDay(localLastDate, messageTimestamp)) {
        if (localLastDate !== null) markdown += `***\n\n`;
        markdown += `**${this.formatDateSeparator(messageTimestamp)}**\n***\n\n`;
        localLastDate = messageTimestamp;
      }
      const time = this.formatTime(messageTimestamp);
      let prefix = "";
      let contentPrefix = "";
      let content = message.content.trim();
      if (message.role === "assistant") {
        try {
          content = RendererUtils.decodeHtmlEntities(content);
          if (RendererUtils.detectThinkingTags(content).hasThinkingTags) {
            content = content.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();
            content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
          }
        } catch (e) {}
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
        default:
          prefix = `**${message.role} (${time}):**\n`;
          break;
      }
      markdown += prefix;
      if (contentPrefix) {
        markdown +=
          content
            .split("\n")
            .map((line: string) => (line.trim() ? `${contentPrefix}${line}` : contentPrefix.trim()))
            .join(`\n`) + "\n\n";
      } else if (content.includes("```")) {
        content = content
          .replace(/(\r?\n)*```/g, "\n\n```")
          .replace(/```(\r?\n)*/g, "```\n\n")
          .trim();
        markdown += content + "\n\n";
      } else {
        markdown +=
          content
            .split("\n")
            .map((line: string) => (line.trim() ? line : ""))
            .join("\n") + "\n\n";
      }
    });
    return markdown.trim();
  }
  private formatTime(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "??:??";
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: false });
  }
  private formatDateSeparator(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "Unknown Date";
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (this.isSameDay(date, now)) return "Today";
    if (this.isSameDay(date, yesterday)) return "Yesterday";
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfGivenDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((startOfToday.getTime() - startOfGivenDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 1 && diffDays < 7) {
      return date.toLocaleDateString(undefined, { weekday: "long" });
    }
    return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }
  private formatRelativeDate(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return "Invalid date";
    }
    const now = new Date();
    const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffSeconds < 5) return "Just now";
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 2) return `1h ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }
  private isSameDay(date1: Date, date2: Date): boolean {
    if (!(date1 instanceof Date) || !(date2 instanceof Date) || isNaN(date1.getTime()) || isNaN(date2.getTime()))
      return false;
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }
  public destroy(): void {
    this.containerEl?.remove();
    this.folderExpansionState.clear();
  }

  // src/SidebarManager.ts

private handleDragStart(event: DragEvent, node: HierarchyNode): void {
  this.plugin.logger.error(
      `[DragStart CAPTURED NODE] Type: ${node.type}, Name: ${
      node.type === 'folder' ? node.name : node.metadata.name
      }, Path: ${node.type === 'folder' ? node.path : node.filePath}`
  );

  if (!event.dataTransfer) {
      this.plugin.logger.warn("[DragStart] No dataTransfer object in event.");
      return;
  }

  let id: string;
  let path: string;
  let name: string;

  if (node.type === 'chat') {
      id = node.metadata.id;
      path = node.filePath;
      name = node.metadata.name;
  } else { // node.type === 'folder'
      id = node.path;
      path = node.path;
      name = node.name;
  }

  this.draggedItemData = { type: node.type, id: id, path: path, name: name };

  event.dataTransfer.setData('text/plain', JSON.stringify(this.draggedItemData));
  event.dataTransfer.effectAllowed = 'move';

  if (event.target instanceof HTMLElement) {
    event.target.addClass('is-dragging');
  }
  this.plugin.logger.debug(`[DragStart SET DATA] draggedItemData now set to: ${JSON.stringify(this.draggedItemData)}`);

  // --- ДОДАНО: Робимо rootDropZone видимою ---
  if (this.containerEl) { // Переконуємось, що головний контейнер існує
      this.containerEl.classList.add('sidebar-drag-active');
      this.plugin.logger.debug("[DragStart] Added 'sidebar-drag-active' to main container.");
  }
  // --- КІНЕЦЬ ДОДАНОГО ---

  event.stopPropagation();
  this.plugin.logger.debug("[DragStart] Propagation stopped for this event.");
}


  // src/SidebarManager.ts

private handleDragEnd(event: DragEvent): void {
  // --- ДОДАНО: Ховаємо rootDropZone ---
  if (this.containerEl) { // Переконуємось, що головний контейнер існує
      this.containerEl.classList.remove('sidebar-drag-active');
      this.plugin.logger.debug("[DragEnd] Removed 'sidebar-drag-active' from main container.");
  }
  // Також прибираємо підсвічування з самої зони, якщо воно було
  if (this.rootDropZoneEl) {
      this.rootDropZoneEl.removeClass('drag-over-root-target');
  }
  // --- КІНЕЦЬ ДОДАНОГО ---


  // Очищаємо стилі з елемента, який перетягували
  if (event.target instanceof HTMLElement) {
    event.target.removeClass('is-dragging');
    // event.target.style.opacity = ''; // Якщо ви змінювали opacity напряму
  }
  // Очищаємо візуальне підсвічування з усіх можливих цілей (папок)
  this.containerEl?.querySelectorAll('.drag-over-target').forEach(el => el.removeClass('drag-over-target'));
  
  this.draggedItemData = null; // Скидаємо збережені дані про перетягуваний елемент
  this.plugin.logger.trace('Drag End: Cleaned up draggedItemData and styles.');
}

  private handleDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    event.stopPropagation(); // ДУЖЕ ВАЖЛИВО: зупиняємо спливання
    // this.plugin.logger.trace("[DragOver FolderItem] Event fired and propagation stopped.");
}

  private handleDragEnter(event: DragEvent, targetNode: FolderNode): void {
    event.preventDefault(); // Важливо для деяких браузерів
    const targetElement = event.currentTarget as HTMLElement;
    if (!targetElement || !this.draggedItemData) return;

    // Базова перевірка: чи можна скидати сюди?
    let canDrop = false;
    if (this.draggedItemData.type === 'chat') {
        // Чати можна скидати в будь-яку папку
        canDrop = true;
    } else if (this.draggedItemData.type === 'folder') {
        // Папку не можна скидати в себе або у своїх нащадків
        const draggedPath = this.draggedItemData.path;
        const targetPath = targetNode.path;
        if (draggedPath !== targetPath && !targetPath.startsWith(draggedPath + '/')) {
            canDrop = true;
        }
    }

    // Додаємо клас для візуального фідбеку, якщо скидання можливе
    if (canDrop) {
        targetElement.addClass('drag-over-target');
        // this.plugin.logger.trace(`Drag Enter: Target=${targetNode.path}, Can Drop=${canDrop}`);
    }
  }

  private handleDragLeave(event: DragEvent): void {
    // Прибираємо клас підсвічування
    // Потрібно бути обережним, щоб не прибрати його при вході в дочірній елемент
    // Простий варіант - просто прибрати
    const targetElement = event.currentTarget as HTMLElement;
    if (targetElement) {
        targetElement.removeClass('drag-over-target');
        // this.plugin.logger.trace(`Drag Leave: Target=${targetElement.dataset.path}`);
    }
  }

  

  private handleDragOverRoot(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
    }

    // Оскільки папки зупиняють спливання, цей event.target буде самим chatPanelListContainerEl
    // або дочірнім елементом, який НЕ є папкою (наприклад, чатом, який не є drop target).
    // Якщо event.target - це чат, то ми все одно хочемо, щоб корінь був ціллю.

    if (!this.draggedItemData) {
        (event.currentTarget as HTMLElement).removeClass('drag-over-root-target');
        return;
    }

    // Валідація: чи не перетягуємо елемент, що вже в корені, у корінь?
    const rootFolderPath = normalizePath(this.plugin.chatManager.chatsFolderPath);
    const draggedPath = this.draggedItemData.path;
    let sourceParentPath = normalizePath(draggedPath.substring(0, draggedPath.lastIndexOf('/')) || '/');

    // Спеціальна обробка для папок, що знаходяться безпосередньо в корені "/"
    if (this.draggedItemData.type === 'folder' && rootFolderPath === '/' && !draggedPath.includes('/')) {
        sourceParentPath = '/'; // Їхній батько - це корінь
    }


    if (sourceParentPath === rootFolderPath) {
        (event.currentTarget as HTMLElement).removeClass('drag-over-root-target');
        this.plugin.logger.trace("[DragOverRoot] Item already at root, no highlight for root.");
    } else {
        (event.currentTarget as HTMLElement).addClass('drag-over-root-target');
        this.plugin.logger.trace("[DragOverRoot] Over root empty space/non-folder child, item not at root. Added root highlight.");
    }
}

// Цей метод викликається, коли миша ВХОДИТЬ в межі chatPanelListContainerEl
// Може бути менш важливим, якщо handleDragOverRoot все коректно обробляє.
private handleDragEnterRoot(event: DragEvent): void {
  event.preventDefault(); // Потрібно для консистентності
  // Логіку підсвічування тепер краще перенести в handleDragOverRoot,
  // оскільки dragenter спрацьовує один раз, а dragover - постійно.
  // Можна просто логувати тут для відстеження.
  this.plugin.logger.trace(`[DragEnterRoot] Mouse entered root container bounds.`);
  // Спробуємо викликати логіку handleDragOverRoot, щоб встановити початковий стан підсвічування
  this.handleDragOverRoot(event);
}
  
private handleDragLeaveRoot(event: DragEvent): void {
  const listeningElement = event.currentTarget as HTMLElement;
  // relatedTarget - це елемент, на який переходить курсор.
  // Якщо курсор покинув контейнер повністю (relatedTarget не є дочірнім або null),
  // тоді прибираємо підсвічування.
  if (!event.relatedTarget || !(listeningElement.contains(event.relatedTarget as Node))) {
      listeningElement.removeClass('drag-over-root-target');
      this.plugin.logger.debug("[DragLeaveRoot] Mouse left root container bounds. Removed 'drag-over-root-target'.");
  } else {
       this.plugin.logger.trace("[DragLeaveRoot] Mouse moved to a child within root. Highlight persists or handled by child.");
  }
}

private async handleDrop(event: DragEvent, targetNode: FolderNode): Promise<void> {
  event.preventDefault(); // Забороняємо стандартну обробку
  event.stopPropagation(); // ДУЖЕ ВАЖЛИВО: зупиняємо спливання події до батьківських елементів (наприклад, chatPanel)

  const targetElement = event.currentTarget as HTMLElement;
  targetElement.removeClass('drag-over-target'); // Прибираємо візуальне підсвічування цілі

  // Перевіряємо, чи є дані про перетягуваний елемент
  if (!this.draggedItemData || !event.dataTransfer) {
      this.plugin.logger.warn("[FolderDrop] Drop event occurred without draggedItemData or dataTransfer. Aborting.");
      this.draggedItemData = null; // Очищаємо про всяк випадок
      return;
  }

  const draggedData = { ...this.draggedItemData }; // Копіюємо дані, бо оригінал зараз скинемо
  this.draggedItemData = null; // Очищаємо дані про перетягуваний елемент

  const targetFolderPath = targetNode.path; // Шлях до цільової папки
  this.plugin.logger.debug(`[FolderDrop] Event: Dragged=${JSON.stringify(draggedData)}, Target Folder Node=${targetNode.name} (Path: ${targetFolderPath})`);

  // --- ВАЛІДАЦІЯ ---
  // 1. Визначаємо батьківську папку елемента, що перетягується
  const sourceParentPath = normalizePath(draggedData.path.substring(0, draggedData.path.lastIndexOf('/')) || '/');

  // 2. Не можна скидати папку саму в себе
  if (draggedData.type === 'folder' && draggedData.path === targetFolderPath) {
      this.plugin.logger.debug("[FolderDrop] Skipped: Cannot drop folder onto itself.");
      return;
  }
  // 3. Не можна скидати чат в ту саму папку, де він вже є
  if (draggedData.type === 'chat' && sourceParentPath === normalizePath(targetFolderPath)) {
      this.plugin.logger.debug("[FolderDrop] Skipped: Chat is already in the target folder.");
      return;
  }
  // 4. Не можна скидати папку в її власну дочірню папку
  if (draggedData.type === 'folder' && targetFolderPath.startsWith(draggedData.path + '/')) {
      new Notice("Cannot move a folder inside itself or its descendants.");
      this.plugin.logger.warn("[FolderDrop] Prevented: Cannot move folder into its own descendant.");
      return;
  }

  // --- ВИКОНАННЯ ДІЇ ---
  let success = false;
  const noticeMessage = `Moving ${draggedData.type} "${draggedData.name}" to "${targetNode.name}"...`;
  const notice = new Notice(noticeMessage, 0); // Показуємо сповіщення про процес

  try {
      if (draggedData.type === 'chat') {
          // Переміщуємо чат
          this.plugin.logger.info(`[FolderDrop] Calling ChatManager.moveChat: id=${draggedData.id}, oldPath=${draggedData.path}, newFolder=${targetFolderPath}`);
          success = await this.plugin.chatManager.moveChat(draggedData.id, draggedData.path, targetFolderPath);
      } else if (draggedData.type === 'folder') {
          // Переміщуємо папку (використовуємо renameFolder, оскільки це зміна шляху)
          const folderName = draggedData.name; // Ім'я папки, що перетягується
          const newPath = normalizePath(`${targetFolderPath}/${folderName}`); // Новий повний шлях для папки

          this.plugin.logger.info(`[FolderDrop] Calling ChatManager.renameFolder (for move): oldPath=${draggedData.path}, newPath=${newPath}`);

          if (draggedData.path === newPath) { // Якщо шлях не змінився (мало б відфільтруватися раніше)
               this.plugin.logger.debug("[FolderDrop] Folder source and target path are identical after normalization. No move needed.");
               success = true;
          } else {
              // Перевірка на конфлікт імен у цільовій папці
              const exists = await this.app.vault.adapter.exists(newPath);
              if (exists) {
                  new Notice(`An item named "${folderName}" already exists in the folder "${targetNode.name}".`);
                  this.plugin.logger.warn(`[FolderDrop] Prevented: Target path ${newPath} for folder move already exists.`);
              } else {
                  success = await this.plugin.chatManager.renameFolder(draggedData.path, newPath);
                  // Оновлюємо стан розгорнутості папки, якщо вона була переміщена
                  if (success && this.folderExpansionState.has(draggedData.path)) {
                      const wasExpanded = this.folderExpansionState.get(draggedData.path);
                      this.folderExpansionState.delete(draggedData.path);
                      this.folderExpansionState.set(newPath, wasExpanded!);
                      this.plugin.logger.debug(`[FolderDrop] Transferred expansion state for folder from '${draggedData.path}' to '${newPath}'.`);
                  }
              }
          }
      }
  } catch(error) {
      this.plugin.logger.error(`[FolderDrop] Error during drop operation (moving ${draggedData.type} to folder ${targetNode.name}):`, error);
      new Notice(`Error moving ${draggedData.type}. Check console.`);
      success = false;
  } finally {
      notice.hide(); // Ховаємо сповіщення
      if (success) {
           this.plugin.logger.info(`[FolderDrop] Drop successful: Moved ${draggedData.type} '${draggedData.name}' to folder '${targetNode.name}'. UI update relies on events from ChatManager.`);
      } else {
          this.plugin.logger.warn(`[FolderDrop] Drop failed or was prevented for ${draggedData.type} '${draggedData.name}' to folder '${targetNode.name}'.`);
      }
      // Оновлення UI (списку чатів) відбудеться через подію 'chat-list-updated',
      // яку має згенерувати ChatManager після успішної операції moveChat або renameFolder.
  }
} // --- Кінець handleDrop (для окремих папок) ---


  
private handleDragOverRootParent(event: DragEvent): void {
  event.preventDefault(); // Завжди дозволяємо, якщо подія дійшла сюди
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }

  if (!this.draggedItemData) {
      this.chatPanelListContainerEl.removeClass('drag-over-root-target');
      return;
  }

  const directTarget = event.target as HTMLElement;

  // Якщо ми над заголовком секції чатів, не підсвічуємо для root drop
  if (this.chatPanelHeaderEl.contains(directTarget)) {
      this.chatPanelListContainerEl.removeClass('drag-over-root-target');
      this.plugin.logger.trace("[DragOverRootParent] Over chat panel header. No root highlight.");
      return;
  }

  // Якщо ми над папкою, її власний dragover мав зупинити спливання.
  // Якщо ця подія все ж тут, значить ми або над порожнім місцем chatPanel,
  // або над chatPanelListContainerEl, або над chatItem.

  // Перевірка, чи елемент вже в корені (логіка з попередніх версій)
  const rootFolderPath = normalizePath(this.plugin.chatManager.chatsFolderPath);
  const draggedPath = this.draggedItemData.path;
  let sourceParentPath = normalizePath(draggedPath.substring(0, draggedPath.lastIndexOf('/')) || '/');
  if (this.draggedItemData.type === 'folder' && rootFolderPath === '/' && !draggedPath.includes('/')) {
      sourceParentPath = '/';
  }
  // Додаткова перевірка для папок у вкладеному корені
  if (this.draggedItemData.type === 'folder' && rootFolderPath !== '/' &&
      draggedPath.startsWith(rootFolderPath) &&
      (draggedPath.substring(rootFolderPath.length+1).indexOf('/') === -1) &&
      sourceParentPath === rootFolderPath) {
        // isAlreadyAtRoot = true; // Для логіки нижче
  }

  if (sourceParentPath === rootFolderPath) {
      this.chatPanelListContainerEl.removeClass('drag-over-root-target');
      this.plugin.logger.trace("[DragOverRootParent] Item already at root, removing root highlight.");
  } else {
      this.chatPanelListContainerEl.addClass('drag-over-root-target');
      this.plugin.logger.trace("[DragOverRootParent] Valid root drop target area. Added root highlight to list container.");
  }
}

private handleDragEnterRootParent(event: DragEvent): void {
  event.preventDefault(); // Для консистентності
  this.plugin.logger.trace(`[DragEnterRootParent] Mouse entered chatPanel bounds.`);
  // Викликаємо handleDragOverRootParent, щоб встановити/прибрати підсвічування
  this.handleDragOverRootParent(event);
}

private handleDragLeaveRootParent(event: DragEvent): void {
  const listeningElement = event.currentTarget as HTMLElement; // Це chatPanel
  const relatedTarget = event.relatedTarget as Node | null;
  this.plugin.logger.trace(`[DragLeaveRootParent] Event fired from chatPanel. Related target: ${relatedTarget ? (relatedTarget as HTMLElement).className : 'null'}`);

  if (!relatedTarget || !listeningElement.contains(relatedTarget)) {
      this.chatPanelListContainerEl.removeClass('drag-over-root-target');
      this.plugin.logger.debug("[DragLeaveRootParent] Mouse left chatPanel bounds. Removed 'drag-over-root-target'.");
  }
}

private async handleDropRootParent(event: DragEvent): Promise<void> {
  event.preventDefault();
  this.chatPanelListContainerEl.removeClass('drag-over-root-target'); // Прибираємо підсвічування
  this.plugin.logger.debug("[DropRootParent] Event fired on chatPanel.");

  if (!this.draggedItemData) {
      this.plugin.logger.warn("[DropRootParent] No draggedItemData available. Aborting.");
      return;
  }

  const directTarget = event.target as HTMLElement;
  // Якщо скидання відбулося на заголовок, ігноруємо
  if (this.chatPanelHeaderEl.contains(directTarget)) {
      this.plugin.logger.info("[DropRootParent] Drop occurred on chat panel header. Aborting root drop.");
      this.draggedItemData = null; // Очистимо, бо drop відбувся
      return;
  }
  // Якщо скидання відбулося на папку, її власний обробник drop мав спрацювати і зупинити спливання.
  // Якщо подія дійшла сюди, це означає, що скидання було не на папку (яка є drop target).

  const draggedData = { ...this.draggedItemData };
  this.draggedItemData = null;

  const rootFolderPath = normalizePath(this.plugin.chatManager.chatsFolderPath);
  this.plugin.logger.info(`[DropRootParent] Attempting to drop: ${JSON.stringify(draggedData)} into root: ${rootFolderPath}`);

  // --- ВАЛІДАЦІЯ (така сама, як у handleDragOverRootParent) ---
  let sourceParentPath = normalizePath(draggedData.path.substring(0, draggedData.path.lastIndexOf('/')) || '/');
  if (draggedData.type === 'folder' && rootFolderPath === '/' && !draggedData.path.includes('/')) {
      sourceParentPath = '/';
  }
  // ... (додаткова перевірка для папок у вкладеному корені, якщо потрібно, але sourceParentPath має бути достатньо)

  if (sourceParentPath === rootFolderPath) {
      this.plugin.logger.info(`[DropRootParent] Item '${draggedData.name}' is already in the root folder. Drop cancelled.`);
      return;
  }

  // --- ВИКОНАННЯ ДІЇ (код такий самий, як у handleDropRoot з попередньої відповіді) ---
  let success = false;
  const notice = new Notice(`Moving ${draggedData.type} to root...`, 0);
  try {
      if (draggedData.type === 'chat') {
          success = await this.plugin.chatManager.moveChat(draggedData.id, draggedData.path, rootFolderPath);
      } else if (draggedData.type === 'folder') {
          const folderName = draggedData.name;
          const newPathAtRoot = normalizePath(rootFolderPath === '/' ? folderName : `${rootFolderPath}/${folderName}`);
          if (draggedData.path === newPathAtRoot) {
               success = true;
          } else {
              const exists = await this.app.vault.adapter.exists(newPathAtRoot);
              if (exists) {
                  new Notice(`An item named "${folderName}" already exists at the root.`);
              } else {
                  success = await this.plugin.chatManager.renameFolder(draggedData.path, newPathAtRoot);
                  if (success && this.folderExpansionState.has(draggedData.path)) {
                      const wasExpanded = this.folderExpansionState.get(draggedData.path);
                      this.folderExpansionState.delete(draggedData.path);
                      this.folderExpansionState.set(newPathAtRoot, wasExpanded!);
                  }
              }
          }
      }
  } catch (error) {
      this.plugin.logger.error(`[DropRootParent] Error during operation for ${draggedData.type} '${draggedData.name}':`, error);
      new Notice(`Error moving ${draggedData.type} to root. Check console.`);
      success = false;
  } finally {
      notice.hide();
      if (success) {
          this.plugin.logger.info(`[DropRootParent] Operation for ${draggedData.type} '${draggedData.name}' to root was successful. UI update relies on events.`);
      } else {
          this.plugin.logger.warn(`[DropRootParent] Operation for ${draggedData.type} '${draggedData.name}' to root failed or was prevented.`);
      }
  }
}

  // --- Обробники для СПЕЦІАЛЬНОЇ ЗОНИ СКИДАННЯ В КОРІНЬ ---

  private handleDragOverRootZone(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    // Тут не потрібно перевіряти event.target, бо ця подія спрацьовує лише на rootDropZoneEl
    // this.plugin.logger.trace("[DragOverRootZone] Fired.");
  }

  private handleDragEnterRootZone(event: DragEvent): void {
    event.preventDefault();
    const targetElement = event.currentTarget as HTMLElement; // Це this.rootDropZoneEl
    this.plugin.logger.debug(`[DragEnterRootZone] Event fired for target: ${targetElement.className}`);

    if (!this.draggedItemData) {
      this.plugin.logger.warn("[DragEnterRootZone] No draggedItemData available.");
      return;
    }

    // Валідація: чи не перетягуємо елемент, що вже в корені
    const rootFolderPath = normalizePath(this.plugin.chatManager.chatsFolderPath);
    const draggedPath = this.draggedItemData.path;
    let sourceParentPath = normalizePath(draggedPath.substring(0, draggedPath.lastIndexOf('/')) || '/');
    if (this.draggedItemData.type === 'folder' && rootFolderPath === '/' && !draggedPath.includes('/')) {
        sourceParentPath = '/';
    }

    if (sourceParentPath === rootFolderPath) {
        this.plugin.logger.debug(`[DragEnterRootZone] Item '${this.draggedItemData.name}' is already in the root folder. No highlight.`);
        targetElement.removeClass('drag-over-root-target'); // Забираємо, якщо випадково було
        return;
    }

    targetElement.addClass('drag-over-root-target');
    this.plugin.logger.debug("[DragEnterRootZone] Added 'drag-over-root-target' to root drop zone.");
  }

  private handleDragLeaveRootZone(event: DragEvent): void {
    const targetElement = event.currentTarget as HTMLElement; // Це this.rootDropZoneEl
    this.plugin.logger.trace(`[DragLeaveRootZone] Event fired.`);
    targetElement.removeClass('drag-over-root-target');
  }

  private async handleDropRootZone(event: DragEvent): Promise<void> {
    event.preventDefault();
    const targetElement = event.currentTarget as HTMLElement; // Це this.rootDropZoneEl
    targetElement.removeClass('drag-over-root-target');
    this.plugin.logger.debug("[DropRootZone] Event fired on dedicated root drop zone.");

    if (!this.draggedItemData) {
        this.plugin.logger.warn("[DropRootZone] No draggedItemData available on drop. Aborting.");
        return;
    }

    const draggedData = { ...this.draggedItemData };
    this.draggedItemData = null; // Очищаємо

    const rootFolderPath = normalizePath(this.plugin.chatManager.chatsFolderPath);
    this.plugin.logger.info(`[DropRootZone] Attempting to drop: ${JSON.stringify(draggedData)} into root: ${rootFolderPath}`);

    // --- ВАЛІДАЦІЯ (чи елемент вже в корені) ---
    let sourceParentPath = normalizePath(draggedData.path.substring(0, draggedData.path.lastIndexOf('/')) || '/');
    if (draggedData.type === 'folder' && rootFolderPath === '/' && !draggedData.path.includes('/')) {
        sourceParentPath = '/';
    }

    if (sourceParentPath === rootFolderPath) {
        this.plugin.logger.info(`[DropRootZone] Item '${draggedData.name}' is already in the root folder. Drop cancelled.`);
        return;
    }

    // --- ВИКОНАННЯ ДІЇ (логіка така сама, як у handleDropRootParent) ---
    let success = false;
    const notice = new Notice(`Moving ${draggedData.type} to root...`, 0);
    try {
        if (draggedData.type === 'chat') {
            success = await this.plugin.chatManager.moveChat(draggedData.id, draggedData.path, rootFolderPath);
        } else if (draggedData.type === 'folder') {
            const folderName = draggedData.name;
            const newPathAtRoot = normalizePath(rootFolderPath === '/' ? folderName : `${rootFolderPath}/${folderName}`);
            if (draggedData.path === newPathAtRoot) {
                 success = true;
            } else {
                const exists = await this.app.vault.adapter.exists(newPathAtRoot);
                if (exists) {
                    new Notice(`An item named "${folderName}" already exists at the root.`);
                } else {
                    success = await this.plugin.chatManager.renameFolder(draggedData.path, newPathAtRoot);
                    if (success && this.folderExpansionState.has(draggedData.path)) {
                        const wasExpanded = this.folderExpansionState.get(draggedData.path);
                        this.folderExpansionState.delete(draggedData.path);
                        this.folderExpansionState.set(newPathAtRoot, wasExpanded!);
                    }
                }
            }
        }
    } catch (error) {
        this.plugin.logger.error(`[DropRootZone] Error during operation for ${draggedData.type} '${draggedData.name}':`, error);
        new Notice(`Error moving ${draggedData.type} to root. Check console.`);
        success = false;
    } finally {
        notice.hide();
        if (success) {
            this.plugin.logger.info(`[DropRootZone] Operation for ${draggedData.type} '${draggedData.name}' to root was successful. UI update relies on events.`);
        } else {
            this.plugin.logger.warn(`[DropRootZone] Operation for ${draggedData.type} '${draggedData.name}' to root failed or was prevented.`);
        }
    }
  }


} // End of SidebarManager class
