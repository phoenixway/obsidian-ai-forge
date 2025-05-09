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
    this.containerEl = parentElement.createDiv({ cls: "ollama-sidebar-container" });

    // --- Секція Чатів ---
    const chatPanel = this.containerEl.createDiv({ cls: "ollama-chat-panel" });
    this.chatPanelHeaderEl = chatPanel.createDiv({
      cls: ["ollama-sidebar-section-header", "menu-option"],
      attr: { "data-section-type": "chats", "data-collapsed": "false" },
    });
    const chatHeaderLeft = this.chatPanelHeaderEl.createDiv({ cls: "ollama-sidebar-header-left" });
    // --- ДОДАНО: Ліва іконка для Chats ---
    setIcon(chatHeaderLeft.createSpan({ cls: CSS_SIDEBAR_SECTION_ICON }), CHATS_SECTION_ICON);
    // ---
    chatHeaderLeft.createSpan({ cls: "menu-option-text", text: "Chats" });

    const chatHeaderActions = this.chatPanelHeaderEl.createDiv({ cls: "ollama-sidebar-header-actions" });
    this.newFolderSidebarButton = chatHeaderActions.createDiv({
      cls: ["ollama-sidebar-header-button", "clickable-icon"],
      attr: { "aria-label": "New Folder", title: "New Folder" },
    });
    setIcon(this.newFolderSidebarButton, "lucide-folder-plus");
    this.newChatSidebarButton = chatHeaderActions.createDiv({
      cls: ["ollama-sidebar-header-button", "clickable-icon"],
      attr: { "aria-label": "New Chat", title: "New Chat" },
    });
    setIcon(this.newChatSidebarButton, "lucide-plus-circle");
    const chatChevron = chatHeaderActions.createSpan({ cls: [CSS_SECTION_TOGGLE_CHEVRON, "clickable-icon"] });
    setIcon(chatChevron, EXPAND_ICON_ACCORDION);

    this.chatPanelListContainerEl = chatPanel.createDiv({
      cls: ["ollama-chat-list-container", "ollama-sidebar-section-content", "is-expanded"],
    });

    // --- Секція Ролей ---
    const rolePanel = this.containerEl.createDiv({ cls: "ollama-role-panel" });
    this.rolePanelHeaderEl = rolePanel.createDiv({
      cls: ["ollama-sidebar-section-header", "menu-option"],
      attr: { "data-section-type": "roles", "data-collapsed": "true" },
    });
    const roleHeaderLeft = this.rolePanelHeaderEl.createDiv({ cls: "ollama-sidebar-header-left" });
    // --- ДОДАНО: Ліва іконка для Roles ---
    setIcon(roleHeaderLeft.createSpan({ cls: CSS_SIDEBAR_SECTION_ICON }), ROLES_SECTION_ICON);
    // ---
    roleHeaderLeft.createSpan({ cls: "menu-option-text", text: "Roles" });

    const roleHeaderActions = this.rolePanelHeaderEl.createDiv({ cls: "ollama-sidebar-header-actions" });
    const roleChevron = roleHeaderActions.createSpan({ cls: [CSS_SECTION_TOGGLE_CHEVRON, "clickable-icon"] });
    setIcon(roleChevron, COLLAPSE_ICON_ACCORDION);

    this.rolePanelListEl = rolePanel.createDiv({ cls: ["ollama-role-panel-list", "ollama-sidebar-section-content"] });

    this.attachSidebarEventListeners();
    if (this.isSectionVisible("chats")) {
      this.updateChatList();
    }
    return this.containerEl;
  }

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
      `[Update #${currentUpdateId}] >>>>> STARTING updateChatList (visible: ${this.isSectionVisible("chats")})`
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
      this.plugin.logger.info(`[Update #${currentUpdateId}] <<<<< FINISHED updateChatList (rendering done)`);
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

  private renderHierarchyNode(
    node: HierarchyNode,
    parentElement: HTMLElement,
    level: number,
    activeChatId: string | null,
    activeAncestorPaths: Set<string>,
    updateId: number
  ): void {
    const itemEl = parentElement.createDiv({ cls: [CSS_HIERARCHY_ITEM, `${CSS_HIERARCHY_INDENT_PREFIX}${level}`] });
    if (node.type === "folder") {
      itemEl.dataset.path = node.path;
    }
    const itemContentEl = itemEl.createDiv({ cls: CSS_HIERARCHY_ITEM_CONTENT });

    if (node.type === "folder") {
      itemEl.addClass(CSS_FOLDER_ITEM);
      const isExpanded = this.folderExpansionState.get(node.path) ?? false;
      if (!isExpanded) {
        itemEl.addClass(CSS_HIERARCHY_ITEM_COLLAPSED);
      }
      if (activeAncestorPaths.has(node.path)) {
        itemEl.addClass(CSS_FOLDER_ACTIVE_ANCESTOR);
      }
      const folderIcon = itemContentEl.createSpan({ cls: CSS_FOLDER_ICON });
      setIcon(folderIcon, isExpanded ? FOLDER_ICON_OPEN : FOLDER_ICON_CLOSED);
      itemContentEl.createSpan({ cls: CSS_HIERARCHY_ITEM_TEXT, text: node.name });
      const optionsBtn = itemContentEl.createEl("button", {
        cls: [CSS_HIERARCHY_ITEM_OPTIONS, "clickable-icon"],
        attr: { "aria-label": "Folder options", title: "More options" },
      });
      setIcon(optionsBtn, "lucide-more-horizontal");
      this.view.registerDomEvent(optionsBtn, "click", (e: MouseEvent) => {
        e.stopPropagation();
        this.showFolderContextMenu(e, node);
      });
      this.view.registerDomEvent(itemContentEl, "contextmenu", (e: MouseEvent) => {
        e.preventDefault();
        this.showFolderContextMenu(e, node);
      });
      this.view.registerDomEvent(itemContentEl, "click", () => {
        this.handleToggleFolder(node.path);
      });
      const childrenContainer = itemEl.createDiv({ cls: CSS_HIERARCHY_ITEM_CHILDREN });
      if (node.children && node.children.length > 0) {
        node.children.forEach(childNode =>
          this.renderHierarchyNode(childNode, childrenContainer, level + 1, activeChatId, activeAncestorPaths, updateId)
        );
      }
    } else if (node.type === "chat") {
      itemEl.addClass(CSS_CHAT_ITEM);
      const chatMeta = node.metadata;
      const isActive = chatMeta.id === activeChatId;
      if (isActive) {
        itemEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
      }
      const chatIcon = itemContentEl.createSpan({ cls: CSS_FOLDER_ICON });
      setIcon(chatIcon, isActive ? CHAT_ICON_ACTIVE : CHAT_ICON);
      itemContentEl.createSpan({ cls: CSS_HIERARCHY_ITEM_TEXT, text: chatMeta.name });
      const detailsWrapper = itemContentEl.createDiv({ cls: CSS_CHAT_ITEM_DETAILS });
      try {
        const lastModifiedDate = new Date(chatMeta.lastModified);
        const dateText = !isNaN(lastModifiedDate.getTime())
          ? this.formatRelativeDate(lastModifiedDate)
          : "Invalid date";
        if (dateText === "Invalid date") {
        }
        detailsWrapper.createDiv({ cls: CSS_CHAT_ITEM_DATE, text: dateText });
      } catch (e) {
        this.plugin.logger.error(`Error formatting date for chat ${chatMeta.id}: `, e);
        detailsWrapper.createDiv({ cls: CSS_CHAT_ITEM_DATE, text: "Date error" });
      }
      const optionsBtn = itemContentEl.createEl("button", {
        cls: [CSS_HIERARCHY_ITEM_OPTIONS, "clickable-icon"],
        attr: { "aria-label": "Chat options", title: "More options" },
      });
      setIcon(optionsBtn, "lucide-more-horizontal");
      this.view.registerDomEvent(optionsBtn, "click", (e: MouseEvent) => {
        e.stopPropagation();
        this.showChatContextMenu(e, chatMeta);
      });
      this.view.registerDomEvent(itemContentEl, "click", async (e: MouseEvent) => {
        if (e.target instanceof Element && e.target.closest(`.${CSS_HIERARCHY_ITEM_OPTIONS}`)) {
          return;
        }
        if (chatMeta.id !== activeChatId) {
          await this.plugin.chatManager.setActiveChat(chatMeta.id);
        }
      });
      this.view.registerDomEvent(itemContentEl, "contextmenu", (e: MouseEvent) => {
        e.preventDefault();
        this.showChatContextMenu(e, chatMeta);
      });
    }
  }

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
} // End of SidebarManager class
