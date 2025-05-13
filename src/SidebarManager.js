import { __awaiter } from "tslib";
// src/SidebarManager.ts
import { setIcon, Menu, Notice, TFolder, normalizePath } from "obsidian";
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import * as RendererUtils from "./MessageRendererUtils";
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
    constructor(plugin, app, view) {
        this.draggedItemData = null;
        this.folderExpansionState = new Map();
        this.updateCounter = 0;
        this.updateChatList = () => __awaiter(this, void 0, void 0, function* () {
            this.updateCounter++;
            const currentUpdateId = this.updateCounter;
            const container = this.chatPanelListContainerEl;
            if (!container || !this.plugin.chatManager) {
                return;
            }
            container.classList.add("is-loading"); // Додаємо клас завантаження
            const currentScrollTop = container.scrollTop;
            container.empty();
            try {
                const hierarchy = yield this.plugin.chatManager.getChatHierarchy();
                const currentActiveChatId = this.plugin.chatManager.getActiveChatId();
                const activeAncestorPaths = new Set();
                if (currentActiveChatId) {
                    const activeChat = yield this.plugin.chatManager.getActiveChat();
                    if (activeChat === null || activeChat === void 0 ? void 0 : activeChat.filePath) {
                        let currentPath = activeChat.filePath;
                        while (currentPath.includes("/")) {
                            const parentPath = currentPath.substring(0, currentPath.lastIndexOf("/"));
                            if (parentPath === "") {
                                break;
                            }
                            else {
                                const normalizedParentPath = normalizePath(parentPath);
                                activeAncestorPaths.add(normalizedParentPath);
                                currentPath = parentPath;
                            }
                        }
                    }
                    else if (activeChat) {
                    }
                }
                if (hierarchy.length === 0) {
                    container.createDiv({ cls: "menu-info-text", text: "No saved chats or folders yet." });
                }
                else {
                    hierarchy.forEach(node => this.renderHierarchyNode(node, container, 0, currentActiveChatId, activeAncestorPaths, currentUpdateId));
                }
            }
            catch (error) {
                container.empty();
                container.createDiv({ text: "Error loading chat structure.", cls: "menu-error-text" });
            }
            finally {
                container.classList.remove("is-loading");
                requestAnimationFrame(() => {
                    if (container === null || container === void 0 ? void 0 : container.isConnected) {
                        container.scrollTop = currentScrollTop;
                    }
                });
            }
        });
        this.updateRoleList = () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const container = this.rolePanelListEl;
            if (!container || !this.plugin.chatManager) {
                return;
            }
            const currentScrollTop = container.scrollTop;
            container.empty();
            try {
                const roles = yield this.plugin.listRoleFiles(true);
                const activeChat = yield this.plugin.chatManager.getActiveChat();
                const currentRolePath = (_b = (_a = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _a === void 0 ? void 0 : _a.selectedRolePath) !== null && _b !== void 0 ? _b : this.plugin.settings.selectedRolePath;
                const noneOptionEl = container.createDiv({
                    cls: [CSS_ROLE_PANEL_ITEM, CSS_ROLE_PANEL_ITEM_NONE, CSS_CLASS_MENU_OPTION],
                });
                const noneIconSpan = noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
                noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: "None" });
                setIcon(noneIconSpan, !currentRolePath ? "check" : "slash");
                if (!currentRolePath)
                    noneOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
                this.view.registerDomEvent(noneOptionEl, "click", () => this.handleRolePanelItemClick(null, currentRolePath));
                roles.forEach(roleInfo => {
                    const roleOptionEl = container.createDiv({ cls: [CSS_ROLE_PANEL_ITEM, CSS_CLASS_MENU_OPTION] });
                    const iconSpan = roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
                    roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: roleInfo.name });
                    if (roleInfo.isCustom)
                        roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_CUSTOM);
                    setIcon(iconSpan, roleInfo.path === currentRolePath ? "check" : roleInfo.isCustom ? "user" : "file-text");
                    if (roleInfo.path === currentRolePath)
                        roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
                    this.view.registerDomEvent(roleOptionEl, "click", () => this.handleRolePanelItemClick(roleInfo, currentRolePath));
                });
            }
            catch (error) {
                container.empty();
                container.createDiv({ text: "Error loading roles.", cls: "menu-error-text" });
            }
            finally {
                requestAnimationFrame(() => {
                    if (container === null || container === void 0 ? void 0 : container.isConnected) {
                        container.scrollTop = currentScrollTop;
                    }
                });
            }
        });
        this.handleRolePanelItemClick = (roleInfo, currentRolePath) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const newRolePath = (_a = roleInfo === null || roleInfo === void 0 ? void 0 : roleInfo.path) !== null && _a !== void 0 ? _a : "";
            const roleNameForEvent = (_b = roleInfo === null || roleInfo === void 0 ? void 0 : roleInfo.name) !== null && _b !== void 0 ? _b : "None";
            const normalizedCurrentRolePath = currentRolePath !== null && currentRolePath !== void 0 ? currentRolePath : "";
            if (newRolePath !== normalizedCurrentRolePath) {
                const activeChat = yield ((_c = this.plugin.chatManager) === null || _c === void 0 ? void 0 : _c.getActiveChat());
                try {
                    if (activeChat) {
                        yield this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath || undefined });
                    }
                    else {
                        this.plugin.settings.selectedRolePath = newRolePath || undefined;
                        yield this.plugin.saveSettings();
                        this.plugin.emit("role-changed", roleNameForEvent);
                        (_e = (_d = this.plugin.promptService) === null || _d === void 0 ? void 0 : _d.clearRoleCache) === null || _e === void 0 ? void 0 : _e.call(_d);
                    }
                    this.updateRoleList();
                }
                catch (error) {
                    new Notice("Failed to set the role.");
                }
            }
            else {
            }
        });
        // src/SidebarManager.ts
        this.handleNewChatClick = (targetFolderPath) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const folderPath = (_a = targetFolderPath !== null && targetFolderPath !== void 0 ? targetFolderPath : this.plugin.chatManager.chatsFolderPath) !== null && _a !== void 0 ? _a : "/";
            try {
                const newChat = yield this.plugin.chatManager.createNewChat(undefined, folderPath);
                if (newChat) {
                    new Notice(`Created new chat: ${newChat.metadata.name}`);
                    this.plugin.emit("focus-input-request");
                    const parentPath = folderPath.substring(0, folderPath.lastIndexOf("/"));
                    // Розгортаємо батьківську папку, якщо чат створено всередині неї
                    // і це не коренева папка чатів.
                    const normalizedParentPath = normalizePath(parentPath);
                    const normalizedChatsFolderPath = normalizePath((_b = this.plugin.chatManager.chatsFolderPath) !== null && _b !== void 0 ? _b : "/");
                    if (parentPath && normalizedParentPath !== "/" && normalizedParentPath !== normalizedChatsFolderPath) {
                        this.folderExpansionState.set(normalizedParentPath, true);
                    }
                    // РЕЛІЗ: Видалено прямий виклик this.updateChatList();
                    // Тепер оновлення списку має відбуватися через подію (наприклад, 'active-chat-changed' або 'chat-list-updated'),
                    // яку ChatManager.createNewChat() має згенерувати, а OllamaView обробити.
                }
            }
            catch (error) {
                new Notice(`Error creating new chat: ${error instanceof Error ? error.message : "Unknown error"}`);
            }
        });
        this.handleNewFolderClick = (parentFolderPath) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const targetParentPath = (_a = parentFolderPath !== null && parentFolderPath !== void 0 ? parentFolderPath : this.plugin.chatManager.chatsFolderPath) !== null && _a !== void 0 ? _a : "/";
            new PromptModal(this.app, "Create New Folder", "Enter folder name:", "", (newName) => __awaiter(this, void 0, void 0, function* () {
                const trimmedName = newName === null || newName === void 0 ? void 0 : newName.trim();
                if (!trimmedName) {
                    new Notice("Folder name cannot be empty.");
                    return;
                }
                if (/[\\/?:*"<>|]/.test(trimmedName)) {
                    new Notice("Folder name contains invalid characters.");
                    return;
                }
                const newFolderPath = normalizePath(targetParentPath === "/" ? trimmedName : `${targetParentPath}/${trimmedName}`);
                try {
                    const success = yield this.plugin.chatManager.createFolder(newFolderPath);
                    if (success) {
                        new Notice(`Folder "${trimmedName}" created.`);
                        if (targetParentPath && targetParentPath !== "/") {
                            this.folderExpansionState.set(targetParentPath, true);
                        }
                        // this.updateChatList();
                    }
                }
                catch (error) {
                    new Notice(`Error creating folder: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
            })).open();
        });
        this.handleRenameFolder = (folderNode) => __awaiter(this, void 0, void 0, function* () {
            const currentName = folderNode.name;
            const parentPath = folderNode.path.substring(0, folderNode.path.lastIndexOf("/")) || "/";
            new PromptModal(this.app, "Rename Folder", `New name for "${currentName}":`, currentName, (newName) => __awaiter(this, void 0, void 0, function* () {
                const trimmedName = newName === null || newName === void 0 ? void 0 : newName.trim();
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
                    const exists = yield this.app.vault.adapter.exists(newFolderPath);
                    if (exists) {
                        new Notice(`A folder or file named "${trimmedName}" already exists here.`);
                        return;
                    }
                }
                catch (e) { }
                try {
                    const success = yield this.plugin.chatManager.renameFolder(folderNode.path, newFolderPath);
                    if (success) {
                        new Notice(`Folder renamed to "${trimmedName}".`);
                        if (this.folderExpansionState.has(folderNode.path)) {
                            const wasExpanded = this.folderExpansionState.get(folderNode.path);
                            this.folderExpansionState.delete(folderNode.path);
                            this.folderExpansionState.set(newFolderPath, wasExpanded);
                        }
                        // this.updateChatList();
                    }
                }
                catch (error) {
                    new Notice(`Error renaming folder: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
            })).open();
        });
        this.handleDeleteFolder = (folderNode) => __awaiter(this, void 0, void 0, function* () {
            const folderName = folderNode.name;
            const folderPath = folderNode.path;
            if (folderPath === this.plugin.chatManager.chatsFolderPath) {
                new Notice("Cannot delete the main chat history folder.");
                return;
            }
            new ConfirmModal(this.app, "Delete Folder", `Delete folder "${folderName}" and ALL its contents (subfolders and chats)? This cannot be undone.`, () => __awaiter(this, void 0, void 0, function* () {
                const notice = new Notice(`Deleting folder "${folderName}"...`, 0);
                try {
                    const success = yield this.plugin.chatManager.deleteFolder(folderPath);
                    if (success) {
                        const keysToDelete = Array.from(this.folderExpansionState.keys()).filter(key => key.startsWith(folderPath));
                        keysToDelete.forEach(key => this.folderExpansionState.delete(key));
                        // this.updateChatList();
                    }
                }
                catch (error) {
                    new Notice(`Error deleting folder: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
                finally {
                    notice.hide();
                }
            })).open();
        });
        this.plugin = plugin;
        this.app = app;
        this.view = view;
    }
    createSidebarUI(parentElement) {
        this.containerEl = parentElement.createDiv({ cls: CSS_SIDEBAR_CONTAINER });
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
            this.updateChatList();
        }
        else {
        }
        // Початкове заповнення списку ролей, якщо секція видима (за замовчуванням вона згорнута)
        if (this.isSectionVisible("roles")) {
            this.updateRoleList();
        }
        else {
        }
        return this.containerEl;
    } // --- Кінець createSidebarUI ---
    attachSidebarEventListeners() {
        if (!this.chatPanelHeaderEl ||
            !this.rolePanelHeaderEl ||
            !this.newChatSidebarButton ||
            !this.newFolderSidebarButton) {
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
    isSectionVisible(type) {
        const headerEl = type === "chats" ? this.chatPanelHeaderEl : this.rolePanelHeaderEl;
        return (headerEl === null || headerEl === void 0 ? void 0 : headerEl.getAttribute("data-collapsed")) === "false";
    }
    // src/SidebarManager.ts
    renderHierarchyNode(node, // Вузол ієрархії (папка або чат)
    parentElement, // Батьківський HTML елемент
    level, // Рівень вкладеності
    activeChatId, // ID поточного активного чату
    activeAncestorPaths, // Шляхи до активних батьківських папок
    updateId // ID поточного оновлення (для логів)
    ) {
        var _a;
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
            const isExpanded = (_a = this.folderExpansionState.get(node.path)) !== null && _a !== void 0 ? _a : false;
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
            this.view.registerDomEvent(optionsBtn, "click", (e) => {
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
            this.view.registerDomEvent(itemContentEl, "contextmenu", (e) => {
                e.preventDefault();
                this.showFolderContextMenu(e, node);
            });
            // Обробник кліку на папку (для розгортання/згортання)
            this.view.registerDomEvent(itemContentEl, "click", (e) => {
                // Перевіряємо, чи клік був не на кнопці опцій
                if (e.target instanceof Element && !e.target.closest(`.${CSS_HIERARCHY_ITEM_OPTIONS}`)) {
                    this.handleToggleFolder(node.path);
                }
            });
            // Створюємо контейнер для дочірніх елементів
            const childrenContainer = itemEl.createDiv({ cls: CSS_HIERARCHY_ITEM_CHILDREN });
            // Рекурсивно рендеримо дочірні елементи, якщо вони є
            if (node.children && node.children.length > 0) {
                node.children.forEach(childNode => this.renderHierarchyNode(childNode, childrenContainer, level + 1, activeChatId, activeAncestorPaths, updateId));
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
                }
                detailsWrapper.createDiv({ cls: CSS_CHAT_ITEM_DATE, text: dateText });
            }
            catch (e) {
                detailsWrapper.createDiv({ cls: CSS_CHAT_ITEM_DATE, text: "Date error" });
            }
            // Кнопка "..." (опції чату)
            const optionsBtn = itemContentEl.createEl("button", {
                cls: [CSS_HIERARCHY_ITEM_OPTIONS, "clickable-icon"],
                attr: { "aria-label": "Chat options", title: "More options" },
            });
            setIcon(optionsBtn, "lucide-more-horizontal");
            // Обробник кліку на кнопку опцій
            this.view.registerDomEvent(optionsBtn, "click", (e) => {
                e.stopPropagation(); // Зупиняємо спливання
                this.showChatContextMenu(e, chatMeta);
            });
            // Обробник кліку на чат (для активації)
            this.view.registerDomEvent(itemContentEl, "click", (e) => __awaiter(this, void 0, void 0, function* () {
                // Перевіряємо, чи клік був не на кнопці опцій
                if (e.target instanceof Element && !e.target.closest(`.${CSS_HIERARCHY_ITEM_OPTIONS}`)) {
                    if (chatMeta.id !== activeChatId) {
                        yield this.plugin.chatManager.setActiveChat(chatMeta.id);
                    }
                }
            }));
            // Обробник контекстного меню на чат
            this.view.registerDomEvent(itemContentEl, "contextmenu", (e) => {
                e.preventDefault();
                this.showChatContextMenu(e, chatMeta);
            });
            // Чат не може бути ціллю для скидання (drop target), тому обробники 'dragover', 'drop' etc. не додаються.
        }
    } // --- Кінець методу renderHierarchyNode ---
    handleToggleFolder(folderPath) {
        var _a;
        const currentState = (_a = this.folderExpansionState.get(folderPath)) !== null && _a !== void 0 ? _a : false;
        const newState = !currentState;
        this.folderExpansionState.set(folderPath, newState);
        const folderItemEl = this.chatPanelListContainerEl.querySelector(`.ollama-folder-item[data-path="${folderPath}"]`);
        if (!folderItemEl) {
            this.updateChatList();
            return;
        }
        folderItemEl.classList.toggle(CSS_HIERARCHY_ITEM_COLLAPSED, !newState);
        const folderIconEl = folderItemEl.querySelector("." + CSS_FOLDER_ICON);
        if (folderIconEl) {
            setIcon(folderIconEl, newState ? FOLDER_ICON_OPEN : FOLDER_ICON_CLOSED);
        }
    }
    // Метод для розгортання/згортання секцій Chats/Roles (акордеон)
    toggleSection(clickedHeaderEl) {
        return __awaiter(this, void 0, void 0, function* () {
            // Визначаємо тип секції, на яку клікнули ('chats' або 'roles')
            const sectionType = clickedHeaderEl.getAttribute("data-section-type");
            // Перевіряємо поточний стан (true, якщо секція зараз згорнута)
            const isCurrentlyCollapsed = clickedHeaderEl.getAttribute("data-collapsed") === "true";
            // Знаходимо елемент іконки-шеврона в клікнутому заголовку
            const iconEl = clickedHeaderEl.querySelector(`.${CSS_SECTION_TOGGLE_CHEVRON}`);
            // Визначаємо елементи DOM для поточної та іншої секції
            let contentEl;
            let updateFunction; // Функція для оновлення вмісту (updateChatList або updateRoleList)
            let otherHeaderEl;
            let otherContentEl;
            let otherSectionType = null;
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
            }
            else {
                // sectionType === "roles"
                contentEl = roleContent;
                updateFunction = this.updateRoleList;
                otherHeaderEl = chatHeader;
                otherContentEl = chatContent;
                otherSectionType = "chats";
            }
            // Перевірка, чи всі необхідні елементи знайдено
            if (!contentEl || !iconEl || !updateFunction || !otherHeaderEl || !otherContentEl || !otherSectionType) {
                return; // Виходимо, якщо щось не знайдено
            }
            // Прив'язуємо контекст 'this' до функції оновлення для подальшого виклику
            const boundUpdateFunction = updateFunction.bind(this);
            // --- Логіка розгортання/згортання ---
            if (isCurrentlyCollapsed) {
                // === РОЗГОРТАЄМО ПОТОЧНУ СЕКЦІЮ ===
                // 1. Згортаємо ІНШУ секцію (якщо вона зараз розгорнута)
                if (otherHeaderEl.getAttribute("data-collapsed") === "false") {
                    const otherIconEl = otherHeaderEl.querySelector(`.${CSS_SECTION_TOGGLE_CHEVRON}`);
                    otherHeaderEl.setAttribute("data-collapsed", "true"); // Позначаємо іншу як згорнуту
                    if (otherIconEl)
                        setIcon(otherIconEl, COLLAPSE_ICON_ACCORDION); // Встановлюємо іконку згортання для іншої
                    otherContentEl.classList.remove(CSS_EXPANDED_CLASS); // Видаляємо клас розгорнутого стану
                    otherContentEl.classList.add(CSS_SIDEBAR_SECTION_CONTENT_HIDDEN); // Додаємо клас для миттєвого приховування (через CSS)
                    // Ховаємо ТІЛЬКИ кнопки дій в іншій секції (шеврон залишається видимим)
                    const otherHeaderButtons = otherHeaderEl.querySelectorAll(`.${CSS_SIDEBAR_HEADER_BUTTON}`);
                    otherHeaderButtons.forEach(btn => (btn.style.display = "none"));
                }
                // 2. Розгортаємо ПОТОЧНУ секцію
                clickedHeaderEl.setAttribute("data-collapsed", "false"); // Позначаємо поточну як розгорнуту
                setIcon(iconEl, EXPAND_ICON_ACCORDION); // Встановлюємо іконку розгортання
                contentEl.classList.remove(CSS_SIDEBAR_SECTION_CONTENT_HIDDEN); // Видаляємо клас швидкого приховування
                // Показуємо кнопки дій в поточній секції
                const headerButtons = clickedHeaderEl.querySelectorAll(`.${CSS_SIDEBAR_HEADER_BUTTON}`);
                headerButtons.forEach(btn => (btn.style.display = "")); // Повертаємо стандартний display
                try {
                    // Спочатку оновлюємо вміст секції (завантажуємо дані, рендеримо)
                    yield boundUpdateFunction();
                    // Потім, у наступному кадрі анімації, додаємо клас 'is-expanded'.
                    // CSS подбає про плавну анімацію розгортання.
                    requestAnimationFrame(() => {
                        if ((contentEl === null || contentEl === void 0 ? void 0 : contentEl.isConnected) && clickedHeaderEl.getAttribute("data-collapsed") === "false") {
                            contentEl.classList.add(CSS_EXPANDED_CLASS);
                        }
                    });
                }
                catch (error) {
                    // Обробка помилки під час оновлення вмісту
                    contentEl.setText(`Error loading ${sectionType}.`); // Показуємо повідомлення про помилку
                    // Все одно додаємо клас, щоб показати помилку
                    requestAnimationFrame(() => {
                        if ((contentEl === null || contentEl === void 0 ? void 0 : contentEl.isConnected) && clickedHeaderEl.getAttribute("data-collapsed") === "false") {
                            contentEl.classList.add(CSS_EXPANDED_CLASS);
                        }
                    });
                }
            }
            else {
                // === ЗГОРТАЄМО ПОТОЧНУ СЕКЦІЮ ===
                // Якщо клікнули на вже розгорнуту секцію
                clickedHeaderEl.setAttribute("data-collapsed", "true"); // Позначаємо як згорнуту
                setIcon(iconEl, COLLAPSE_ICON_ACCORDION); // Встановлюємо іконку згортання
                contentEl.classList.remove(CSS_EXPANDED_CLASS); // Видаляємо клас розгорнутого стану
                contentEl.classList.add(CSS_SIDEBAR_SECTION_CONTENT_HIDDEN); // Додаємо клас для миттєвого приховування
                // Ховаємо кнопки дій в поточній секції
                const headerButtons = clickedHeaderEl.querySelectorAll(`.${CSS_SIDEBAR_HEADER_BUTTON}`);
                headerButtons.forEach(btn => (btn.style.display = "none"));
            }
        });
    } // --- Кінець методу toggleSection ---
    // --- Решта методів без змін ---
    showFolderContextMenu(event, folderNode) {
        event.preventDefault();
        event.stopPropagation();
        const menu = new Menu();
        menu.addItem(item => item
            .setTitle("New Chat Here")
            .setIcon("lucide-plus-circle")
            .onClick(() => this.handleNewChatClick(folderNode.path)));
        menu.addItem(item => item
            .setTitle("New Folder Here")
            .setIcon("lucide-folder-plus")
            .onClick(() => this.handleNewFolderClick(folderNode.path)));
        menu.addSeparator();
        menu.addItem(item => item
            .setTitle("Rename Folder")
            .setIcon("lucide-pencil")
            .onClick(() => this.handleRenameFolder(folderNode)));
        menu.addItem(item => {
            item
                .setTitle("Delete Folder")
                .setIcon("lucide-trash-2")
                .onClick(() => this.handleDeleteFolder(folderNode)); /* Styling via CSS */
        });
        menu.showAtMouseEvent(event);
    }
    showChatContextMenu(event, chatMeta) {
        event.preventDefault();
        event.stopPropagation();
        const menu = new Menu();
        menu.addItem(item => item
            .setTitle("Clone Chat")
            .setIcon("lucide-copy-plus")
            .onClick(() => this.handleContextMenuClone(chatMeta.id)));
        menu.addItem(item => item
            .setTitle("Rename Chat")
            .setIcon("lucide-pencil")
            .onClick(() => this.handleContextMenuRename(chatMeta.id, chatMeta.name)));
        menu.addItem(item => item
            .setTitle("Export to Note")
            .setIcon("lucide-download")
            .onClick(() => this.exportSpecificChat(chatMeta.id)));
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
    handleContextMenuClone(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const notice = new Notice("Cloning chat...", 0);
            try {
                const c = yield this.plugin.chatManager.cloneChat(chatId);
                if (c) {
                    new Notice(`Chat cloned as "${c.metadata.name}"`);
                    // this.updateChatList();
                    this.plugin.emit("focus-input-request");
                }
            }
            catch (e) {
            }
            finally {
                notice.hide();
            }
        });
    }
    handleContextMenuRename(chatId, currentName) {
        return __awaiter(this, void 0, void 0, function* () {
            new PromptModal(this.app, "Rename Chat", `New name for "${currentName}":`, currentName, (newName) => __awaiter(this, void 0, void 0, function* () {
                const trimmedName = newName === null || newName === void 0 ? void 0 : newName.trim();
                if (!trimmedName || trimmedName === currentName) {
                    new Notice(trimmedName === currentName ? `Name unchanged.` : `Rename cancelled.`);
                }
                else if (/[\\/?:*"<>|]/.test(trimmedName)) {
                    new Notice("Chat name contains invalid characters.");
                }
                else {
                    const success = yield this.plugin.chatManager.renameChat(chatId, trimmedName); /* UI update handled by event */
                }
                this.plugin.emit("focus-input-request");
            })).open();
        });
    } // Видалено явний updateChatList
    exportSpecificChat(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const notice = new Notice(`Exporting chat...`, 0);
            try {
                const chat = yield this.plugin.chatManager.getChat(chatId);
                if (!chat || chat.messages.length === 0) {
                    new Notice("Chat is empty or not found, nothing to export.");
                    notice.hide();
                    return;
                }
                const md = this.formatChatToMarkdown(chat.messages, chat.metadata);
                const ts = new Date().toISOString().replace(/[:.]/g, "-");
                const safeName = chat.metadata.name.replace(/[\\/?:*"<>|]/g, "-");
                const filename = `ollama-chat-${safeName}-${ts}.md`;
                let fPath = (_a = this.plugin.settings.chatExportFolderPath) === null || _a === void 0 ? void 0 : _a.trim();
                let fFolder = null;
                if (fPath) {
                    fPath = normalizePath(fPath);
                    const af = this.app.vault.getAbstractFileByPath(fPath);
                    if (!af) {
                        try {
                            yield this.app.vault.createFolder(fPath);
                            const newAf = this.app.vault.getAbstractFileByPath(fPath);
                            if (newAf instanceof TFolder) {
                                fFolder = newAf;
                                new Notice(`Created export folder: ${fPath}`);
                            }
                            else {
                                throw new Error("Failed to get created folder.");
                            }
                        }
                        catch (err) {
                            new Notice(`Export folder error. Saving to vault root.`);
                            fFolder = this.app.vault.getRoot();
                        }
                    }
                    else if (af instanceof TFolder) {
                        fFolder = af;
                    }
                    else {
                        new Notice(`Export path is not a folder. Saving to vault root.`);
                        fFolder = this.app.vault.getRoot();
                    }
                }
                else {
                    fFolder = this.app.vault.getRoot();
                }
                if (!fFolder) {
                    new Notice("Export folder error.");
                    notice.hide();
                    return;
                }
                const filePath = normalizePath(`${fFolder.path}/${filename}`);
                const file = yield this.app.vault.create(filePath, md);
                new Notice(`Chat exported to ${file.path}`);
            }
            catch (e) {
                new Notice("Chat export failed.");
            }
            finally {
                notice.hide();
            }
        });
    }
    handleContextMenuClear(chatId, chatName) {
        return __awaiter(this, void 0, void 0, function* () {
            new ConfirmModal(this.app, "Clear Messages", `Clear all messages in "${chatName}"?`, () => __awaiter(this, void 0, void 0, function* () {
                const notice = new Notice("Clearing messages...", 0);
                try {
                    const success = yield this.plugin.chatManager.clearChatMessagesById(chatId);
                }
                catch (e) {
                    new Notice("Failed to clear messages.");
                }
                finally {
                    notice.hide();
                }
            })).open();
        });
    }
    handleContextMenuDelete(chatId, chatName) {
        return __awaiter(this, void 0, void 0, function* () {
            new ConfirmModal(this.app, "Delete Chat", `Delete chat "${chatName}"? This cannot be undone.`, () => __awaiter(this, void 0, void 0, function* () {
                const notice = new Notice("Deleting chat...", 0);
                try {
                    const success = yield this.plugin.chatManager.deleteChat(chatId);
                }
                catch (e) {
                    new Notice("Failed to delete chat.");
                }
                finally {
                    notice.hide();
                }
            })).open();
        });
    }
    formatChatToMarkdown(messagesToFormat, metadata) {
        var _a;
        let localLastDate = null;
        const exportTimestamp = new Date();
        let markdown = `# AI Forge Chat: ${metadata.name}\n\n`;
        markdown += `* **Chat ID:** ${metadata.id}\n`;
        markdown += `* **Model:** ${metadata.modelName || "Default"}\n`;
        markdown += `* **Role Path:** ${metadata.selectedRolePath || "None"}\n`;
        markdown += `* **Temperature:** ${(_a = metadata.temperature) !== null && _a !== void 0 ? _a : this.plugin.settings.temperature}\n`;
        markdown += `* **Created:** ${new Date(metadata.createdAt).toLocaleString()}\n`;
        markdown += `* **Last Modified:** ${new Date(metadata.lastModified).toLocaleString()}\n`;
        markdown += `* **Exported:** ${exportTimestamp.toLocaleString()}\n\n`;
        markdown += `***\n\n`;
        messagesToFormat.forEach(message => {
            var _a;
            if (!message || !((_a = message.content) === null || _a === void 0 ? void 0 : _a.trim()) || !message.timestamp) {
                return;
            }
            let messageTimestamp;
            if (typeof message.timestamp === "string") {
                messageTimestamp = new Date(message.timestamp);
            }
            else if (message.timestamp instanceof Date) {
                messageTimestamp = message.timestamp;
            }
            else {
                return;
            }
            if (isNaN(messageTimestamp.getTime())) {
                return;
            }
            if (localLastDate === null || !this.isSameDay(localLastDate, messageTimestamp)) {
                if (localLastDate !== null)
                    markdown += `***\n\n`;
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
                }
                catch (e) { }
                if (!content)
                    return;
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
                        .map((line) => (line.trim() ? `${contentPrefix}${line}` : contentPrefix.trim()))
                        .join(`\n`) + "\n\n";
            }
            else if (content.includes("```")) {
                content = content
                    .replace(/(\r?\n)*```/g, "\n\n```")
                    .replace(/```(\r?\n)*/g, "```\n\n")
                    .trim();
                markdown += content + "\n\n";
            }
            else {
                markdown +=
                    content
                        .split("\n")
                        .map((line) => (line.trim() ? line : ""))
                        .join("\n") + "\n\n";
            }
        });
        return markdown.trim();
    }
    formatTime(date) {
        if (!(date instanceof Date) || isNaN(date.getTime()))
            return "??:??";
        return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: false });
    }
    formatDateSeparator(date) {
        if (!(date instanceof Date) || isNaN(date.getTime()))
            return "Unknown Date";
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (this.isSameDay(date, now))
            return "Today";
        if (this.isSameDay(date, yesterday))
            return "Yesterday";
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfGivenDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diffDays = Math.floor((startOfToday.getTime() - startOfGivenDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 1 && diffDays < 7) {
            return date.toLocaleDateString(undefined, { weekday: "long" });
        }
        return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    }
    formatRelativeDate(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) {
            return "Invalid date";
        }
        const now = new Date();
        const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        if (diffSeconds < 5)
            return "Just now";
        if (diffSeconds < 60)
            return `${diffSeconds}s ago`;
        if (diffMinutes < 60)
            return `${diffMinutes}m ago`;
        if (diffHours < 2)
            return `1h ago`;
        if (diffHours < 24)
            return `${diffHours}h ago`;
        if (diffDays === 1)
            return "Yesterday";
        if (diffDays < 7)
            return `${diffDays}d ago`;
        return date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
        });
    }
    isSameDay(date1, date2) {
        if (!(date1 instanceof Date) || !(date2 instanceof Date) || isNaN(date1.getTime()) || isNaN(date2.getTime()))
            return false;
        return (date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate());
    }
    destroy() {
        var _a;
        (_a = this.containerEl) === null || _a === void 0 ? void 0 : _a.remove();
        this.folderExpansionState.clear();
    }
    // src/SidebarManager.ts
    handleDragStart(event, node) {
        if (!event.dataTransfer) {
            return;
        }
        let id;
        let path;
        let name;
        if (node.type === 'chat') {
            id = node.metadata.id;
            path = node.filePath;
            name = node.metadata.name;
        }
        else { // node.type === 'folder'
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
        // --- ДОДАНО: Робимо rootDropZone видимою ---
        if (this.containerEl) { // Переконуємось, що головний контейнер існує
            this.containerEl.classList.add('sidebar-drag-active');
        }
        // --- КІНЕЦЬ ДОДАНОГО ---
        event.stopPropagation();
    }
    // src/SidebarManager.ts
    handleDragEnd(event) {
        var _a;
        // --- ДОДАНО: Ховаємо rootDropZone ---
        if (this.containerEl) { // Переконуємось, що головний контейнер існує
            this.containerEl.classList.remove('sidebar-drag-active');
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
        (_a = this.containerEl) === null || _a === void 0 ? void 0 : _a.querySelectorAll('.drag-over-target').forEach(el => el.removeClass('drag-over-target'));
        this.draggedItemData = null; // Скидаємо збережені дані про перетягуваний елемент
        this.plugin.logger.trace('Drag End: Cleaned up draggedItemData and styles.');
    }
    handleDragOver(event) {
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
        event.stopPropagation(); // ДУЖЕ ВАЖЛИВО: зупиняємо спливання
        // this.plugin.logger.trace("[DragOver FolderItem] Event fired and propagation stopped.");
    }
    handleDragEnter(event, targetNode) {
        event.preventDefault(); // Важливо для деяких браузерів
        const targetElement = event.currentTarget;
        if (!targetElement || !this.draggedItemData)
            return;
        // Базова перевірка: чи можна скидати сюди?
        let canDrop = false;
        if (this.draggedItemData.type === 'chat') {
            // Чати можна скидати в будь-яку папку
            canDrop = true;
        }
        else if (this.draggedItemData.type === 'folder') {
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
    handleDragLeave(event) {
        // Прибираємо клас підсвічування
        // Потрібно бути обережним, щоб не прибрати його при вході в дочірній елемент
        // Простий варіант - просто прибрати
        const targetElement = event.currentTarget;
        if (targetElement) {
            targetElement.removeClass('drag-over-target');
            // this.plugin.logger.trace(`Drag Leave: Target=${targetElement.dataset.path}`);
        }
    }
    handleDragOverRoot(event) {
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
        // Оскільки папки зупиняють спливання, цей event.target буде самим chatPanelListContainerEl
        // або дочірнім елементом, який НЕ є папкою (наприклад, чатом, який не є drop target).
        // Якщо event.target - це чат, то ми все одно хочемо, щоб корінь був ціллю.
        if (!this.draggedItemData) {
            event.currentTarget.removeClass('drag-over-root-target');
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
            event.currentTarget.removeClass('drag-over-root-target');
            this.plugin.logger.trace("[DragOverRoot] Item already at root, no highlight for root.");
        }
        else {
            event.currentTarget.addClass('drag-over-root-target');
            this.plugin.logger.trace("[DragOverRoot] Over root empty space/non-folder child, item not at root. Added root highlight.");
        }
    }
    // Цей метод викликається, коли миша ВХОДИТЬ в межі chatPanelListContainerEl
    // Може бути менш важливим, якщо handleDragOverRoot все коректно обробляє.
    handleDragEnterRoot(event) {
        event.preventDefault(); // Потрібно для консистентності
        // Логіку підсвічування тепер краще перенести в handleDragOverRoot,
        // оскільки dragenter спрацьовує один раз, а dragover - постійно.
        // Можна просто логувати тут для відстеження.
        this.plugin.logger.trace(`[DragEnterRoot] Mouse entered root container bounds.`);
        // Спробуємо викликати логіку handleDragOverRoot, щоб встановити початковий стан підсвічування
        this.handleDragOverRoot(event);
    }
    handleDragLeaveRoot(event) {
        const listeningElement = event.currentTarget;
        // relatedTarget - це елемент, на який переходить курсор.
        // Якщо курсор покинув контейнер повністю (relatedTarget не є дочірнім або null),
        // тоді прибираємо підсвічування.
        if (!event.relatedTarget || !(listeningElement.contains(event.relatedTarget))) {
            listeningElement.removeClass('drag-over-root-target');
        }
        else {
            this.plugin.logger.trace("[DragLeaveRoot] Mouse moved to a child within root. Highlight persists or handled by child.");
        }
    }
    handleDrop(event, targetNode) {
        return __awaiter(this, void 0, void 0, function* () {
            event.preventDefault(); // Забороняємо стандартну обробку
            event.stopPropagation(); // ДУЖЕ ВАЖЛИВО: зупиняємо спливання події до батьківських елементів (наприклад, chatPanel)
            const targetElement = event.currentTarget;
            targetElement.removeClass('drag-over-target'); // Прибираємо візуальне підсвічування цілі
            // Перевіряємо, чи є дані про перетягуваний елемент
            if (!this.draggedItemData || !event.dataTransfer) {
                this.draggedItemData = null; // Очищаємо про всяк випадок
                return;
            }
            const draggedData = Object.assign({}, this.draggedItemData); // Копіюємо дані, бо оригінал зараз скинемо
            this.draggedItemData = null; // Очищаємо дані про перетягуваний елемент
            const targetFolderPath = targetNode.path; // Шлях до цільової папки
            // --- ВАЛІДАЦІЯ ---
            // 1. Визначаємо батьківську папку елемента, що перетягується
            const sourceParentPath = normalizePath(draggedData.path.substring(0, draggedData.path.lastIndexOf('/')) || '/');
            // 2. Не можна скидати папку саму в себе
            if (draggedData.type === 'folder' && draggedData.path === targetFolderPath) {
                return;
            }
            // 3. Не можна скидати чат в ту саму папку, де він вже є
            if (draggedData.type === 'chat' && sourceParentPath === normalizePath(targetFolderPath)) {
                return;
            }
            // 4. Не можна скидати папку в її власну дочірню папку
            if (draggedData.type === 'folder' && targetFolderPath.startsWith(draggedData.path + '/')) {
                new Notice("Cannot move a folder inside itself or its descendants.");
                return;
            }
            // --- ВИКОНАННЯ ДІЇ ---
            let success = false;
            const noticeMessage = `Moving ${draggedData.type} "${draggedData.name}" to "${targetNode.name}"...`;
            const notice = new Notice(noticeMessage, 0); // Показуємо сповіщення про процес
            try {
                if (draggedData.type === 'chat') {
                    // Переміщуємо чат
                    success = yield this.plugin.chatManager.moveChat(draggedData.id, draggedData.path, targetFolderPath);
                }
                else if (draggedData.type === 'folder') {
                    // Переміщуємо папку (використовуємо renameFolder, оскільки це зміна шляху)
                    const folderName = draggedData.name; // Ім'я папки, що перетягується
                    const newPath = normalizePath(`${targetFolderPath}/${folderName}`); // Новий повний шлях для папки
                    if (draggedData.path === newPath) { // Якщо шлях не змінився (мало б відфільтруватися раніше)
                        success = true;
                    }
                    else {
                        // Перевірка на конфлікт імен у цільовій папці
                        const exists = yield this.app.vault.adapter.exists(newPath);
                        if (exists) {
                            new Notice(`An item named "${folderName}" already exists in the folder "${targetNode.name}".`);
                        }
                        else {
                            success = yield this.plugin.chatManager.renameFolder(draggedData.path, newPath);
                            // Оновлюємо стан розгорнутості папки, якщо вона була переміщена
                            if (success && this.folderExpansionState.has(draggedData.path)) {
                                const wasExpanded = this.folderExpansionState.get(draggedData.path);
                                this.folderExpansionState.delete(draggedData.path);
                                this.folderExpansionState.set(newPath, wasExpanded);
                            }
                        }
                    }
                }
            }
            catch (error) {
                new Notice(`Error moving ${draggedData.type}. Check console.`);
                success = false;
            }
            finally {
                notice.hide(); // Ховаємо сповіщення
                if (success) {
                }
                else {
                }
                // Оновлення UI (списку чатів) відбудеться через подію 'chat-list-updated',
                // яку має згенерувати ChatManager після успішної операції moveChat або renameFolder.
            }
        });
    } // --- Кінець handleDrop (для окремих папок) ---
    handleDragOverRootParent(event) {
        event.preventDefault(); // Завжди дозволяємо, якщо подія дійшла сюди
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
        if (!this.draggedItemData) {
            this.chatPanelListContainerEl.removeClass('drag-over-root-target');
            return;
        }
        const directTarget = event.target;
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
            (draggedPath.substring(rootFolderPath.length + 1).indexOf('/') === -1) &&
            sourceParentPath === rootFolderPath) {
            // isAlreadyAtRoot = true; // Для логіки нижче
        }
        if (sourceParentPath === rootFolderPath) {
            this.chatPanelListContainerEl.removeClass('drag-over-root-target');
            this.plugin.logger.trace("[DragOverRootParent] Item already at root, removing root highlight.");
        }
        else {
            this.chatPanelListContainerEl.addClass('drag-over-root-target');
            this.plugin.logger.trace("[DragOverRootParent] Valid root drop target area. Added root highlight to list container.");
        }
    }
    handleDragEnterRootParent(event) {
        event.preventDefault(); // Для консистентності
        this.plugin.logger.trace(`[DragEnterRootParent] Mouse entered chatPanel bounds.`);
        // Викликаємо handleDragOverRootParent, щоб встановити/прибрати підсвічування
        this.handleDragOverRootParent(event);
    }
    handleDragLeaveRootParent(event) {
        const listeningElement = event.currentTarget; // Це chatPanel
        const relatedTarget = event.relatedTarget;
        this.plugin.logger.trace(`[DragLeaveRootParent] Event fired from chatPanel. Related target: ${relatedTarget ? relatedTarget.className : 'null'}`);
        if (!relatedTarget || !listeningElement.contains(relatedTarget)) {
            this.chatPanelListContainerEl.removeClass('drag-over-root-target');
        }
    }
    handleDropRootParent(event) {
        return __awaiter(this, void 0, void 0, function* () {
            event.preventDefault();
            this.chatPanelListContainerEl.removeClass('drag-over-root-target'); // Прибираємо підсвічування
            if (!this.draggedItemData) {
                return;
            }
            const directTarget = event.target;
            // Якщо скидання відбулося на заголовок, ігноруємо
            if (this.chatPanelHeaderEl.contains(directTarget)) {
                this.draggedItemData = null; // Очистимо, бо drop відбувся
                return;
            }
            // Якщо скидання відбулося на папку, її власний обробник drop мав спрацювати і зупинити спливання.
            // Якщо подія дійшла сюди, це означає, що скидання було не на папку (яка є drop target).
            const draggedData = Object.assign({}, this.draggedItemData);
            this.draggedItemData = null;
            const rootFolderPath = normalizePath(this.plugin.chatManager.chatsFolderPath);
            // --- ВАЛІДАЦІЯ (така сама, як у handleDragOverRootParent) ---
            let sourceParentPath = normalizePath(draggedData.path.substring(0, draggedData.path.lastIndexOf('/')) || '/');
            if (draggedData.type === 'folder' && rootFolderPath === '/' && !draggedData.path.includes('/')) {
                sourceParentPath = '/';
            }
            // ... (додаткова перевірка для папок у вкладеному корені, якщо потрібно, але sourceParentPath має бути достатньо)
            if (sourceParentPath === rootFolderPath) {
                return;
            }
            // --- ВИКОНАННЯ ДІЇ (код такий самий, як у handleDropRoot з попередньої відповіді) ---
            let success = false;
            const notice = new Notice(`Moving ${draggedData.type} to root...`, 0);
            try {
                if (draggedData.type === 'chat') {
                    success = yield this.plugin.chatManager.moveChat(draggedData.id, draggedData.path, rootFolderPath);
                }
                else if (draggedData.type === 'folder') {
                    const folderName = draggedData.name;
                    const newPathAtRoot = normalizePath(rootFolderPath === '/' ? folderName : `${rootFolderPath}/${folderName}`);
                    if (draggedData.path === newPathAtRoot) {
                        success = true;
                    }
                    else {
                        const exists = yield this.app.vault.adapter.exists(newPathAtRoot);
                        if (exists) {
                            new Notice(`An item named "${folderName}" already exists at the root.`);
                        }
                        else {
                            success = yield this.plugin.chatManager.renameFolder(draggedData.path, newPathAtRoot);
                            if (success && this.folderExpansionState.has(draggedData.path)) {
                                const wasExpanded = this.folderExpansionState.get(draggedData.path);
                                this.folderExpansionState.delete(draggedData.path);
                                this.folderExpansionState.set(newPathAtRoot, wasExpanded);
                            }
                        }
                    }
                }
            }
            catch (error) {
                new Notice(`Error moving ${draggedData.type} to root. Check console.`);
                success = false;
            }
            finally {
                notice.hide();
                if (success) {
                }
                else {
                }
            }
        });
    }
    // --- Обробники для СПЕЦІАЛЬНОЇ ЗОНИ СКИДАННЯ В КОРІНЬ ---
    handleDragOverRootZone(event) {
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
        // Тут не потрібно перевіряти event.target, бо ця подія спрацьовує лише на rootDropZoneEl
        // this.plugin.logger.trace("[DragOverRootZone] Fired.");
    }
    handleDragEnterRootZone(event) {
        event.preventDefault();
        const targetElement = event.currentTarget; // Це this.rootDropZoneEl
        if (!this.draggedItemData) {
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
            targetElement.removeClass('drag-over-root-target'); // Забираємо, якщо випадково було
            return;
        }
        targetElement.addClass('drag-over-root-target');
    }
    handleDragLeaveRootZone(event) {
        const targetElement = event.currentTarget; // Це this.rootDropZoneEl
        this.plugin.logger.trace(`[DragLeaveRootZone] Event fired.`);
        targetElement.removeClass('drag-over-root-target');
    }
    handleDropRootZone(event) {
        return __awaiter(this, void 0, void 0, function* () {
            event.preventDefault();
            const targetElement = event.currentTarget; // Це this.rootDropZoneEl
            targetElement.removeClass('drag-over-root-target');
            if (!this.draggedItemData) {
                return;
            }
            const draggedData = Object.assign({}, this.draggedItemData);
            this.draggedItemData = null; // Очищаємо
            const rootFolderPath = normalizePath(this.plugin.chatManager.chatsFolderPath);
            // --- ВАЛІДАЦІЯ (чи елемент вже в корені) ---
            let sourceParentPath = normalizePath(draggedData.path.substring(0, draggedData.path.lastIndexOf('/')) || '/');
            if (draggedData.type === 'folder' && rootFolderPath === '/' && !draggedData.path.includes('/')) {
                sourceParentPath = '/';
            }
            if (sourceParentPath === rootFolderPath) {
                return;
            }
            // --- ВИКОНАННЯ ДІЇ (логіка така сама, як у handleDropRootParent) ---
            let success = false;
            const notice = new Notice(`Moving ${draggedData.type} to root...`, 0);
            try {
                if (draggedData.type === 'chat') {
                    success = yield this.plugin.chatManager.moveChat(draggedData.id, draggedData.path, rootFolderPath);
                }
                else if (draggedData.type === 'folder') {
                    const folderName = draggedData.name;
                    const newPathAtRoot = normalizePath(rootFolderPath === '/' ? folderName : `${rootFolderPath}/${folderName}`);
                    if (draggedData.path === newPathAtRoot) {
                        success = true;
                    }
                    else {
                        const exists = yield this.app.vault.adapter.exists(newPathAtRoot);
                        if (exists) {
                            new Notice(`An item named "${folderName}" already exists at the root.`);
                        }
                        else {
                            success = yield this.plugin.chatManager.renameFolder(draggedData.path, newPathAtRoot);
                            if (success && this.folderExpansionState.has(draggedData.path)) {
                                const wasExpanded = this.folderExpansionState.get(draggedData.path);
                                this.folderExpansionState.delete(draggedData.path);
                                this.folderExpansionState.set(newPathAtRoot, wasExpanded);
                            }
                        }
                    }
                }
            }
            catch (error) {
                new Notice(`Error moving ${draggedData.type} to root. Check console.`);
                success = false;
            }
            finally {
                notice.hide();
                if (success) {
                }
                else {
                }
            }
        });
    }
} // End of SidebarManager class
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2lkZWJhck1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJTaWRlYmFyTWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsd0JBQXdCO0FBQ3hCLE9BQU8sRUFBTyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsYUFBYSxFQUFxQyxNQUFNLFVBQVUsQ0FBQztBQUlqSCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDOUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUM1QyxPQUFPLEtBQUssYUFBYSxNQUFNLHdCQUF3QixDQUFDO0FBS3hELHNCQUFzQjtBQUN0QixNQUFNLHFCQUFxQixHQUFHLDBCQUEwQixDQUFDO0FBQ3pELE1BQU0sY0FBYyxHQUFHLG1CQUFtQixDQUFDO0FBQzNDLE1BQU0sY0FBYyxHQUFHLG1CQUFtQixDQUFDO0FBQzNDLE1BQU0scUJBQXFCLEdBQUcsMEJBQTBCLENBQUM7QUFDekQsTUFBTSxtQkFBbUIsR0FBRyx3QkFBd0IsQ0FBQztBQUNyRCxNQUFNLG1CQUFtQixHQUFHLHdCQUF3QixDQUFDO0FBQ3JELE1BQU0sd0JBQXdCLEdBQUcsNkJBQTZCLENBQUM7QUFDL0QsTUFBTSx3QkFBd0IsR0FBRyw2QkFBNkIsQ0FBQztBQUMvRCxNQUFNLDBCQUEwQixHQUFHLFdBQVcsQ0FBQztBQUMvQyxNQUFNLDBCQUEwQixHQUFHLFdBQVcsQ0FBQztBQUMvQyxNQUFNLHdCQUF3QixHQUFHLDZCQUE2QixDQUFDO0FBRS9ELE1BQU0scUJBQXFCLEdBQUcsYUFBYSxDQUFDO0FBQzVDLE1BQU0sMEJBQTBCLEdBQUcsK0JBQStCLENBQUM7QUFDbkUsTUFBTSwyQkFBMkIsR0FBRyxnQ0FBZ0MsQ0FBQztBQUNyRSxnR0FBZ0c7QUFDaEcsTUFBTSwwQkFBMEIsR0FBRywrQkFBK0IsQ0FBQyxDQUFDLGdDQUFnQztBQUNwRyxNQUFNLDBCQUEwQixHQUFHLCtCQUErQixDQUFDO0FBQ25FLE1BQU0seUJBQXlCLEdBQUcsOEJBQThCLENBQUM7QUFDakUsTUFBTSx1QkFBdUIsR0FBRyw0QkFBNEIsQ0FBQztBQUM3RCxNQUFNLGtDQUFrQyxHQUFHLHVDQUF1QyxDQUFDO0FBQ25GLE1BQU0sa0JBQWtCLEdBQUcsYUFBYSxDQUFDO0FBRXpDLCtCQUErQjtBQUMvQixNQUFNLHVCQUF1QixHQUFHLDRCQUE0QixDQUFDO0FBQzdELE1BQU0sa0JBQWtCLEdBQUcsdUJBQXVCLENBQUM7QUFDbkQsTUFBTSxlQUFlLEdBQUcsb0JBQW9CLENBQUM7QUFDN0MsTUFBTSxhQUFhLEdBQUcsa0JBQWtCLENBQUM7QUFDekMsTUFBTSwwQkFBMEIsR0FBRywrQkFBK0IsQ0FBQztBQUNuRSxNQUFNLDJCQUEyQixHQUFHLGdDQUFnQyxDQUFDO0FBQ3JFLE1BQU0sNEJBQTRCLEdBQUcsY0FBYyxDQUFDO0FBQ3BELE1BQU0sZUFBZSxHQUFHLG9CQUFvQixDQUFDO0FBQzdDLE1BQU0sdUJBQXVCLEdBQUcsNEJBQTRCLENBQUM7QUFDN0QsTUFBTSxxQkFBcUIsR0FBRywwQkFBMEIsQ0FBQztBQUN6RCxNQUFNLGtCQUFrQixHQUFHLHVCQUF1QixDQUFDO0FBQ25ELE1BQU0sMEJBQTBCLEdBQUcsK0JBQStCLENBQUM7QUFDbkUsTUFBTSwyQkFBMkIsR0FBRyxzQkFBc0IsQ0FBQztBQUMzRCxNQUFNLDBCQUEwQixHQUFHLG9CQUFvQixDQUFDO0FBRXhELGVBQWU7QUFDZixNQUFNLHdCQUF3QixHQUFHLGdCQUFnQixDQUFDO0FBRWxELFNBQVM7QUFDVCxxRUFBcUU7QUFDckUsMEVBQTBFO0FBQzFFLE1BQU0sdUJBQXVCLEdBQUcsc0JBQXNCLENBQUMsQ0FBQyw4QkFBOEI7QUFDdEYsTUFBTSxxQkFBcUIsR0FBRyxxQkFBcUIsQ0FBQyxDQUFDLGdDQUFnQztBQUNyRixNQUFNLGtCQUFrQixHQUFHLGVBQWUsQ0FBQztBQUMzQyxNQUFNLGdCQUFnQixHQUFHLG9CQUFvQixDQUFDO0FBQzlDLE1BQU0sU0FBUyxHQUFHLHVCQUF1QixDQUFDO0FBQzFDLE1BQU0sZ0JBQWdCLEdBQUcsY0FBYyxDQUFDO0FBQ3hDLE1BQU0sd0JBQXdCLEdBQUcsNkJBQTZCLENBQUMsQ0FBQywrQkFBK0I7QUFDL0YsTUFBTTtBQUVOLGlCQUFpQjtBQUNqQixNQUFNLGtCQUFrQixHQUFHLHdCQUF3QixDQUFDLENBQUMsMEJBQTBCO0FBQy9FLE1BQU0sa0JBQWtCLEdBQUcsY0FBYyxDQUFDLENBQUMsMEJBQTBCO0FBRXJFLE1BQU0sT0FBTyxjQUFjO0lBbUJ6QixZQUFZLE1BQW9CLEVBQUUsR0FBUSxFQUFFLElBQWdCO1FBWnBELG9CQUFlLEdBQWdGLElBQUksQ0FBQztRQVNwRyx5QkFBb0IsR0FBeUIsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUN2RCxrQkFBYSxHQUFHLENBQUMsQ0FBQztRQWdJbkIsbUJBQWMsR0FBRyxHQUF3QixFQUFFO1lBQ2hELElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNyQixNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDO1lBQzNDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQztZQUNoRCxJQUFJLENBQUMsU0FBUyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDM0MsT0FBTztZQUNULENBQUM7WUFDRyxTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLDRCQUE0QjtZQUN2RSxNQUFNLGdCQUFnQixHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUM7WUFDN0MsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQztnQkFDSCxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQ25FLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQ3RFLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztnQkFDOUMsSUFBSSxtQkFBbUIsRUFBRSxDQUFDO29CQUN4QixNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDO29CQUNqRSxJQUFJLFVBQVUsYUFBVixVQUFVLHVCQUFWLFVBQVUsQ0FBRSxRQUFRLEVBQUUsQ0FBQzt3QkFDekIsSUFBSSxXQUFXLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQzt3QkFDdEMsT0FBTyxXQUFXLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7NEJBQ2pDLE1BQU0sVUFBVSxHQUFHLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQzs0QkFDMUUsSUFBSSxVQUFVLEtBQUssRUFBRSxFQUFFLENBQUM7Z0NBQ3RCLE1BQU07NEJBQ1IsQ0FBQztpQ0FBTSxDQUFDO2dDQUNOLE1BQU0sb0JBQW9CLEdBQUcsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dDQUN2RCxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQztnQ0FDOUMsV0FBVyxHQUFHLFVBQVUsQ0FBQzs0QkFDM0IsQ0FBQzt3QkFDSCxDQUFDO29CQUNILENBQUM7eUJBQU0sSUFBSSxVQUFVLEVBQUUsQ0FBQztvQkFDeEIsQ0FBQztnQkFDSCxDQUFDO2dCQUNELElBQUksU0FBUyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDM0IsU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsZ0NBQWdDLEVBQUUsQ0FBQyxDQUFDO2dCQUN6RixDQUFDO3FCQUFNLENBQUM7b0JBQ04sU0FBUyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUN2QixJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUUsZUFBZSxDQUFDLENBQ3hHLENBQUM7Z0JBQ0osQ0FBQztZQUNILENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNULFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDeEIsU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksRUFBRSwrQkFBK0IsRUFBRSxHQUFHLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1lBQ3pGLENBQUM7b0JBQVMsQ0FBQztnQkFDVCxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDekMscUJBQXFCLENBQUMsR0FBRyxFQUFFO29CQUN6QixJQUFJLFNBQVMsYUFBVCxTQUFTLHVCQUFULFNBQVMsQ0FBRSxXQUFXLEVBQUUsQ0FBQzt3QkFDM0IsU0FBUyxDQUFDLFNBQVMsR0FBRyxnQkFBZ0IsQ0FBQztvQkFDekMsQ0FBQztnQkFDSCxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7UUFDSCxDQUFDLENBQUEsQ0FBQztRQWtUSyxtQkFBYyxHQUFHLEdBQXdCLEVBQUU7O1lBQ2hELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUM7WUFDdkMsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQzNDLE9BQU87WUFDVCxDQUFDO1lBQ0csTUFBTSxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDO1lBQ2pELFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNsQixJQUFJLENBQUM7Z0JBQ0gsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDcEQsTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDakUsTUFBTSxlQUFlLEdBQUcsTUFBQSxNQUFBLFVBQVUsYUFBVixVQUFVLHVCQUFWLFVBQVUsQ0FBRSxRQUFRLDBDQUFFLGdCQUFnQixtQ0FBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDeEcsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQztvQkFDdkMsR0FBRyxFQUFFLENBQUMsbUJBQW1CLEVBQUUsd0JBQXdCLEVBQUUscUJBQXFCLENBQUM7aUJBQzVFLENBQUMsQ0FBQztnQkFDSCxNQUFNLFlBQVksR0FBRyxZQUFZLENBQUMsVUFBVSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsd0JBQXdCLEVBQUUsa0JBQWtCLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3RHLFlBQVksQ0FBQyxVQUFVLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyx3QkFBd0IsRUFBRSxrQkFBa0IsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO2dCQUMvRixPQUFPLENBQUMsWUFBWSxFQUFFLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUM1RCxJQUFJLENBQUMsZUFBZTtvQkFBRSxZQUFZLENBQUMsUUFBUSxDQUFDLDBCQUEwQixDQUFDLENBQUM7Z0JBQ3hFLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsSUFBSSxFQUFFLGVBQWUsQ0FBQyxDQUFDLENBQUM7Z0JBQzlHLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUU7b0JBQ3ZCLE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxxQkFBcUIsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDaEcsTUFBTSxRQUFRLEdBQUcsWUFBWSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLHdCQUF3QixFQUFFLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUNsRyxZQUFZLENBQUMsVUFBVSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsd0JBQXdCLEVBQUUsa0JBQWtCLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7b0JBQ3RHLElBQUksUUFBUSxDQUFDLFFBQVE7d0JBQUUsWUFBWSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO29CQUN6RSxPQUFPLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEtBQUssZUFBZSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUM7b0JBQzFHLElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxlQUFlO3dCQUFFLFlBQVksQ0FBQyxRQUFRLENBQUMsMEJBQTBCLENBQUMsQ0FBQztvQkFDekYsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUNyRCxJQUFJLENBQUMsd0JBQXdCLENBQUMsUUFBUSxFQUFFLGVBQWUsQ0FBQyxDQUN6RCxDQUFDO2dCQUNKLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ1QsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUN4QixTQUFTLENBQUMsU0FBUyxDQUFDLEVBQUUsSUFBSSxFQUFFLHNCQUFzQixFQUFFLEdBQUcsRUFBRSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7WUFDaEYsQ0FBQztvQkFBUyxDQUFDO2dCQUNULHFCQUFxQixDQUFDLEdBQUcsRUFBRTtvQkFDekIsSUFBSSxTQUFTLGFBQVQsU0FBUyx1QkFBVCxTQUFTLENBQUUsV0FBVyxFQUFFLENBQUM7d0JBQzNCLFNBQVMsQ0FBQyxTQUFTLEdBQUcsZ0JBQWdCLENBQUM7b0JBQ3pDLENBQUM7Z0JBQ0gsQ0FBQyxDQUFDLENBQUM7WUFDTCxDQUFDO1FBQ0gsQ0FBQyxDQUFBLENBQUM7UUFDTSw2QkFBd0IsR0FBRyxDQUNqQyxRQUF5QixFQUN6QixlQUEwQyxFQUMzQixFQUFFOztZQUNqQixNQUFNLFdBQVcsR0FBRyxNQUFBLFFBQVEsYUFBUixRQUFRLHVCQUFSLFFBQVEsQ0FBRSxJQUFJLG1DQUFJLEVBQUUsQ0FBQztZQUN6QyxNQUFNLGdCQUFnQixHQUFHLE1BQUEsUUFBUSxhQUFSLFFBQVEsdUJBQVIsUUFBUSxDQUFFLElBQUksbUNBQUksTUFBTSxDQUFDO1lBQ2xELE1BQU0seUJBQXlCLEdBQUcsZUFBZSxhQUFmLGVBQWUsY0FBZixlQUFlLEdBQUksRUFBRSxDQUFDO1lBQ3hELElBQUksV0FBVyxLQUFLLHlCQUF5QixFQUFFLENBQUM7Z0JBQzlDLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQSxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVywwQ0FBRSxhQUFhLEVBQUUsQ0FBQSxDQUFDO2dCQUNsRSxJQUFJLENBQUM7b0JBQ0gsSUFBSSxVQUFVLEVBQUUsQ0FBQzt3QkFDZixNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7b0JBQ3pHLENBQUM7eUJBQU0sQ0FBQzt3QkFDTixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsR0FBRyxXQUFXLElBQUksU0FBUyxDQUFDO3dCQUNqRSxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7d0JBQ2pDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO3dCQUNuRCxNQUFBLE1BQUEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLDBDQUFFLGNBQWMsa0RBQUksQ0FBQztvQkFDaEQsQ0FBQztvQkFDRCxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQ3hCLENBQUM7Z0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztvQkFDUCxJQUFJLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO2dCQUNoRCxDQUFDO1lBQ0gsQ0FBQztpQkFBTSxDQUFDO1lBQ1IsQ0FBQztRQUNILENBQUMsQ0FBQSxDQUFDO1FBRUYsd0JBQXdCO1FBQ2xCLHVCQUFrQixHQUFHLENBQU8sZ0JBQXlCLEVBQWlCLEVBQUU7O1lBQzlFLE1BQU0sVUFBVSxHQUFXLE1BQUEsZ0JBQWdCLGFBQWhCLGdCQUFnQixjQUFoQixnQkFBZ0IsR0FBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLG1DQUFJLEdBQUcsQ0FBQztZQUM5RixJQUFJLENBQUM7Z0JBQ0gsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQyxDQUFDO2dCQUNuRixJQUFJLE9BQU8sRUFBRSxDQUFDO29CQUNaLElBQUksTUFBTSxDQUFDLHFCQUFxQixPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7b0JBQ3pELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUM7b0JBQ3hDLE1BQU0sVUFBVSxHQUFHLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFFeEUsaUVBQWlFO29CQUNqRSxnQ0FBZ0M7b0JBQ2hDLE1BQU0sb0JBQW9CLEdBQUcsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO29CQUN2RCxNQUFNLHlCQUF5QixHQUFHLGFBQWEsQ0FBQyxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsbUNBQUksR0FBRyxDQUFDLENBQUM7b0JBRWhHLElBQUksVUFBVSxJQUFJLG9CQUFvQixLQUFLLEdBQUcsSUFBSSxvQkFBb0IsS0FBSyx5QkFBeUIsRUFBRSxDQUFDO3dCQUNwRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLG9CQUFvQixFQUFFLElBQUksQ0FBQyxDQUFDO29CQUM3RCxDQUFDO29CQUVELHVEQUF1RDtvQkFDdkQsaUhBQWlIO29CQUNqSCwwRUFBMEU7Z0JBQzVFLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDWCxJQUFJLE1BQU0sQ0FBQyw0QkFBNEIsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQztZQUN6RyxDQUFDO1FBQ0gsQ0FBQyxDQUFBLENBQUM7UUFFUSx5QkFBb0IsR0FBRyxDQUFPLGdCQUF5QixFQUFpQixFQUFFOztZQUNoRixNQUFNLGdCQUFnQixHQUFXLE1BQUEsZ0JBQWdCLGFBQWhCLGdCQUFnQixjQUFoQixnQkFBZ0IsR0FBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLG1DQUFJLEdBQUcsQ0FBQztZQUNwRyxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLG1CQUFtQixFQUFFLG9CQUFvQixFQUFFLEVBQUUsRUFBRSxDQUFNLE9BQU8sRUFBQyxFQUFFO2dCQUN2RixNQUFNLFdBQVcsR0FBRyxPQUFPLGFBQVAsT0FBTyx1QkFBUCxPQUFPLENBQUUsSUFBSSxFQUFFLENBQUM7Z0JBQ3BDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDakIsSUFBSSxNQUFNLENBQUMsOEJBQThCLENBQUMsQ0FBQztvQkFDM0MsT0FBTztnQkFDVCxDQUFDO2dCQUNELElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO29CQUNyQyxJQUFJLE1BQU0sQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO29CQUN2RCxPQUFPO2dCQUNULENBQUM7Z0JBQ0QsTUFBTSxhQUFhLEdBQUcsYUFBYSxDQUNqQyxnQkFBZ0IsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxnQkFBZ0IsSUFBSSxXQUFXLEVBQUUsQ0FDOUUsQ0FBQztnQkFDRixJQUFJLENBQUM7b0JBQ0gsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLENBQUM7b0JBQzFFLElBQUksT0FBTyxFQUFFLENBQUM7d0JBQ1osSUFBSSxNQUFNLENBQUMsV0FBVyxXQUFXLFlBQVksQ0FBQyxDQUFDO3dCQUMvQyxJQUFJLGdCQUFnQixJQUFJLGdCQUFnQixLQUFLLEdBQUcsRUFBRSxDQUFDOzRCQUNqRCxJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDO3dCQUN4RCxDQUFDO3dCQUNELHlCQUF5QjtvQkFDM0IsQ0FBQztnQkFDSCxDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ1AsSUFBSSxNQUFNLENBQUMsMEJBQTBCLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7Z0JBQzNHLENBQUM7WUFDSCxDQUFDLENBQUEsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1osQ0FBQyxDQUFBLENBQUM7UUFDTSx1QkFBa0IsR0FBRyxDQUFPLFVBQXNCLEVBQWlCLEVBQUU7WUFDM0UsTUFBTSxXQUFXLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQztZQUNwQyxNQUFNLFVBQVUsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUM7WUFDekYsSUFBSSxXQUFXLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLFdBQVcsSUFBSSxFQUFFLFdBQVcsRUFBRSxDQUFNLE9BQU8sRUFBQyxFQUFFO2dCQUN4RyxNQUFNLFdBQVcsR0FBRyxPQUFPLGFBQVAsT0FBTyx1QkFBUCxPQUFPLENBQUUsSUFBSSxFQUFFLENBQUM7Z0JBQ3BDLElBQUksQ0FBQyxXQUFXLElBQUksV0FBVyxLQUFLLFdBQVcsRUFBRSxDQUFDO29CQUNoRCxJQUFJLE1BQU0sQ0FBQyxXQUFXLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsbUJBQW1CLENBQUMsQ0FBQztvQkFDbEYsT0FBTztnQkFDVCxDQUFDO2dCQUNELElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO29CQUNyQyxJQUFJLE1BQU0sQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO29CQUN2RCxPQUFPO2dCQUNULENBQUM7Z0JBQ0QsTUFBTSxhQUFhLEdBQUcsYUFBYSxDQUFDLFVBQVUsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxVQUFVLElBQUksV0FBVyxFQUFFLENBQUMsQ0FBQztnQkFDdkcsSUFBSSxDQUFDO29CQUNILE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQztvQkFDbEUsSUFBSSxNQUFNLEVBQUUsQ0FBQzt3QkFDWCxJQUFJLE1BQU0sQ0FBQywyQkFBMkIsV0FBVyx3QkFBd0IsQ0FBQyxDQUFDO3dCQUMzRSxPQUFPO29CQUNULENBQUM7Z0JBQ0gsQ0FBQztnQkFBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUEsQ0FBQztnQkFDZCxJQUFJLENBQUM7b0JBQ0gsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxhQUFhLENBQUMsQ0FBQztvQkFDM0YsSUFBSSxPQUFPLEVBQUUsQ0FBQzt3QkFDWixJQUFJLE1BQU0sQ0FBQyxzQkFBc0IsV0FBVyxJQUFJLENBQUMsQ0FBQzt3QkFDbEQsSUFBSSxJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDOzRCQUNuRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQzs0QkFDbkUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7NEJBQ2xELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFdBQVksQ0FBQyxDQUFDO3dCQUM3RCxDQUFDO3dCQUNELHlCQUF5QjtvQkFDM0IsQ0FBQztnQkFDSCxDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ1AsSUFBSSxNQUFNLENBQUMsMEJBQTBCLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7Z0JBQzNHLENBQUM7WUFDSCxDQUFDLENBQUEsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1osQ0FBQyxDQUFBLENBQUM7UUFDTSx1QkFBa0IsR0FBRyxDQUFPLFVBQXNCLEVBQWlCLEVBQUU7WUFDM0UsTUFBTSxVQUFVLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQztZQUNuQyxNQUFNLFVBQVUsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDO1lBQ25DLElBQUksVUFBVSxLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUMzRCxJQUFJLE1BQU0sQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO2dCQUMxRCxPQUFPO1lBQ1QsQ0FBQztZQUNELElBQUksWUFBWSxDQUNkLElBQUksQ0FBQyxHQUFHLEVBQ1IsZUFBZSxFQUNmLGtCQUFrQixVQUFVLHVFQUF1RSxFQUNuRyxHQUFTLEVBQUU7Z0JBQ1QsTUFBTSxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsb0JBQW9CLFVBQVUsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNuRSxJQUFJLENBQUM7b0JBQ0gsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBQ3ZFLElBQUksT0FBTyxFQUFFLENBQUM7d0JBQ1osTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7d0JBQzVHLFlBQVksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7d0JBQ25FLHlCQUF5QjtvQkFDM0IsQ0FBQztnQkFDSCxDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ0wsSUFBSSxNQUFNLENBQUMsMEJBQTBCLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7Z0JBQzdHLENBQUM7d0JBQVMsQ0FBQztvQkFDVCxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2hCLENBQUM7WUFDSCxDQUFDLENBQUEsQ0FDRixDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1gsQ0FBQyxDQUFBLENBQUM7UUE1cEJBLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDbkIsQ0FBQztJQUVJLGVBQWUsQ0FBQyxhQUEwQjtRQUMvQyxJQUFJLENBQUMsV0FBVyxHQUFHLGFBQWEsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO1FBRTNFLHVCQUF1QjtRQUN2QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBRXRFLHlCQUF5QjtRQUN6QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQztZQUMzQyxHQUFHLEVBQUUsQ0FBQywwQkFBMEIsRUFBRSxxQkFBcUIsQ0FBQztZQUN4RCxJQUFJLEVBQUUsRUFBRSxtQkFBbUIsRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLEVBQUUsOEJBQThCO1NBQ2xHLENBQUMsQ0FBQztRQUNILE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO1FBQzFGLE9BQU8sQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLEVBQUUsR0FBRyxFQUFFLHdCQUF3QixFQUFFLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQzFGLGNBQWMsQ0FBQyxVQUFVLENBQUMsRUFBRSxHQUFHLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFFdEUsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLDBCQUEwQixFQUFFLENBQUMsQ0FBQztRQUNoRyxzQkFBc0I7UUFDdEIsSUFBSSxDQUFDLHNCQUFzQixHQUFHLGlCQUFpQixDQUFDLFNBQVMsQ0FBQztZQUN4RCxHQUFHLEVBQUUsQ0FBQyx5QkFBeUIsRUFBRSxnQkFBZ0IsQ0FBQztZQUNsRCxJQUFJLEVBQUUsRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7U0FDMUQsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQzNELHFCQUFxQjtRQUNyQixJQUFJLENBQUMsb0JBQW9CLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxDQUFDO1lBQ3RELEdBQUcsRUFBRSxDQUFDLHlCQUF5QixFQUFFLGdCQUFnQixDQUFDO1lBQ2xELElBQUksRUFBRSxFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRTtTQUN0RCxDQUFDLENBQUM7UUFDSCxPQUFPLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFDekQsZ0RBQWdEO1FBQ2hELE1BQU0sV0FBVyxHQUFHLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLDBCQUEwQixFQUFFLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzFHLE9BQU8sQ0FBQyxXQUFXLEVBQUUscUJBQXFCLENBQUMsQ0FBQyxDQUFDLDRCQUE0QjtRQUV6RSxzQ0FBc0M7UUFDdEMsSUFBSSxDQUFDLHdCQUF3QixHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUM7WUFDbEQsR0FBRyxFQUFFLENBQUMsdUJBQXVCLEVBQUUsMkJBQTJCLEVBQUUsa0JBQWtCLENBQUMsRUFBRSxpQ0FBaUM7U0FDbkgsQ0FBQyxDQUFDO1FBRUgsZ0RBQWdEO1FBQ2hELDRFQUE0RTtRQUM1RSxJQUFJLENBQUMsY0FBYyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLG9GQUFvRjtRQUNwRix5RUFBeUU7UUFFekUsK0RBQStEO1FBQy9ELElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3BHLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3RHLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3RHLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzVGLGtDQUFrQztRQUVsQyx1QkFBdUI7UUFDdkIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztRQUN0RSx5QkFBeUI7UUFDekIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUM7WUFDM0MsR0FBRyxFQUFFLENBQUMsMEJBQTBCLEVBQUUscUJBQXFCLENBQUM7WUFDeEQsSUFBSSxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxFQUFFLDRCQUE0QjtTQUMvRixDQUFDLENBQUM7UUFDSCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLHVCQUF1QixFQUFFLENBQUMsQ0FBQztRQUMxRixPQUFPLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsRUFBRSx3QkFBd0IsRUFBRSxDQUFDLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUMxRixjQUFjLENBQUMsVUFBVSxDQUFDLEVBQUUsR0FBRyxFQUFFLGtCQUFrQixFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBRXRFLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSwwQkFBMEIsRUFBRSxDQUFDLENBQUM7UUFDaEcsZ0RBQWdEO1FBQ2hELE1BQU0sV0FBVyxHQUFHLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLDBCQUEwQixFQUFFLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzFHLE9BQU8sQ0FBQyxXQUFXLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLDBCQUEwQjtRQUV6RSw2QkFBNkI7UUFDN0IsSUFBSSxDQUFDLGVBQWUsR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDO1lBQ3ZDLEdBQUcsRUFBRSxDQUFDLG1CQUFtQixFQUFFLDJCQUEyQixDQUFDLENBQUMsNkJBQTZCO1NBQ3hGLENBQUMsQ0FBQztRQUNILHNEQUFzRDtRQUN0RCxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUNuRSxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQ3RFLENBQUM7UUFFRCx1R0FBdUc7UUFDdkcsSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7UUFFbkMsdUZBQXVGO1FBQ3ZGLElBQUksSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDcEMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3ZCLENBQUM7YUFBTSxDQUFDO1FBQ0YsQ0FBQztRQUNQLHlGQUF5RjtRQUN6RixJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQy9CLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUM1QixDQUFDO2FBQU0sQ0FBQztRQUNGLENBQUM7UUFFUCxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDMUIsQ0FBQyxDQUFDLGlDQUFpQztJQUN6QiwyQkFBMkI7UUFDakMsSUFDRSxDQUFDLElBQUksQ0FBQyxpQkFBaUI7WUFDdkIsQ0FBQyxJQUFJLENBQUMsaUJBQWlCO1lBQ3ZCLENBQUMsSUFBSSxDQUFDLG9CQUFvQjtZQUMxQixDQUFDLElBQUksQ0FBQyxzQkFBc0IsRUFDNUIsQ0FBQztZQUNLLE9BQU87UUFDZixDQUFDO1FBQ0QsbUVBQW1FO1FBQ25FLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7UUFDOUcsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUU5RyxzRUFBc0U7UUFDdEUsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFO1lBQ2pFLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUNwQixJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDbkUsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLEVBQUU7WUFDbkUsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNyRSxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTSxnQkFBZ0IsQ0FBQyxJQUF1QjtRQUM3QyxNQUFNLFFBQVEsR0FBRyxJQUFJLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztRQUNwRixPQUFPLENBQUEsUUFBUSxhQUFSLFFBQVEsdUJBQVIsUUFBUSxDQUFFLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFLLE9BQU8sQ0FBQztJQUM5RCxDQUFDO0lBcURELHdCQUF3QjtJQUVsQixtQkFBbUIsQ0FDekIsSUFBbUIsRUFBVyxpQ0FBaUM7SUFDL0QsYUFBMEIsRUFBSSw0QkFBNEI7SUFDMUQsS0FBYSxFQUFpQixxQkFBcUI7SUFDbkQsWUFBMkIsRUFBRyw4QkFBOEI7SUFDNUQsbUJBQWdDLEVBQUUsdUNBQXVDO0lBQ3pFLFFBQWdCLENBQWMscUNBQXFDOzs7UUFFbkUsbURBQW1EO1FBQ25ELE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLDJCQUEyQixHQUFHLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2hILHNFQUFzRTtRQUN0RSxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLDBCQUEwQixFQUFFLENBQUMsQ0FBQztRQUU1RSx5RUFBeUU7UUFDekUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDcEMsc0RBQXNEO1FBQ3RELElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN0Riw2REFBNkQ7UUFDN0QsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUUsOERBQThEO1FBRTlELDJCQUEyQjtRQUMzQixJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDekIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUNqQyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsMENBQTBDO1lBQzNFLE1BQU0sVUFBVSxHQUFHLE1BQUEsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLG1DQUFJLEtBQUssQ0FBQztZQUNyRSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ2QsTUFBTSxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDLENBQUMsMkJBQTJCO1lBQzlFLENBQUM7WUFDRCxJQUFJLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDckMsTUFBTSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUMsNEJBQTRCO1lBQzdFLENBQUM7WUFFRCxrQ0FBa0M7WUFDbEMsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1lBQ3RFLE9BQU8sQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUN4RSxjQUFjO1lBQ2QsYUFBYSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsRUFBRSx1QkFBdUIsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7WUFFNUUsNkJBQTZCO1lBQzdCLE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFO2dCQUNoRCxHQUFHLEVBQUUsQ0FBQywwQkFBMEIsRUFBRSxnQkFBZ0IsQ0FBQztnQkFDbkQsSUFBSSxFQUFFLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUU7YUFDbEUsQ0FBQyxDQUFDO1lBQ0gsT0FBTyxDQUFDLFVBQVUsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1lBQzlDLGlDQUFpQztZQUNqQyxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFhLEVBQUUsRUFBRTtnQkFDOUQsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsc0RBQXNEO2dCQUMzRSxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3hDLENBQUMsQ0FBQyxDQUFDO1lBRUgsb0VBQW9FO1lBQ3BFLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDcEUsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3RGLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLFdBQVcsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDdEUsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzVFLGlEQUFpRDtZQUVqRCwwQ0FBMEM7WUFDMUMsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsYUFBYSxFQUFFLENBQUMsQ0FBYSxFQUFFLEVBQUU7Z0JBQ3ZFLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDbkIsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN4QyxDQUFDLENBQUMsQ0FBQztZQUNILHNEQUFzRDtZQUN0RCxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFhLEVBQUUsRUFBRTtnQkFDbEUsOENBQThDO2dCQUM5QyxJQUFJLENBQUMsQ0FBQyxNQUFNLFlBQVksT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSwwQkFBMEIsRUFBRSxDQUFDLEVBQUUsQ0FBQztvQkFDckYsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDdkMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1lBRUgsNkNBQTZDO1lBQzdDLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSwyQkFBMkIsRUFBRSxDQUFDLENBQUM7WUFDakYscURBQXFEO1lBQ3JELElBQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDNUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FDbEMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsRUFBRSxpQkFBaUIsRUFBRSxLQUFLLEdBQUcsQ0FBQyxFQUFFLFlBQVksRUFBRSxtQkFBbUIsRUFBRSxRQUFRLENBQUMsQ0FDN0csQ0FBQztZQUNOLENBQUM7UUFDTCxDQUFDO1FBQ0QsMkJBQTJCO2FBQ3RCLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUM1QixNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQy9CLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7WUFDL0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLHFCQUFxQjtZQUMxRCxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsZ0NBQWdDO1lBRXpFLDZCQUE2QjtZQUM3QixNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsRUFBRSxLQUFLLFlBQVksQ0FBQztZQUM5QyxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUNYLE1BQU0sQ0FBQyxRQUFRLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDLDBCQUEwQjtZQUMzRSxDQUFDO1lBRUQscUNBQXFDO1lBQ3JDLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxVQUFVLENBQUMsRUFBRSxHQUFHLEVBQUUsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDLDhCQUE4QjtZQUNuRyxPQUFPLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzNELGFBQWE7WUFDYixhQUFhLENBQUMsVUFBVSxDQUFDLEVBQUUsR0FBRyxFQUFFLHVCQUF1QixFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUVoRiwrQkFBK0I7WUFDL0IsTUFBTSxjQUFjLEdBQUcsYUFBYSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLENBQUM7WUFDL0UsSUFBSSxDQUFDO2dCQUNELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUN6RCxNQUFNLFFBQVEsR0FBRyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDbkQsQ0FBQyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLCtCQUErQjtvQkFDM0UsQ0FBQyxDQUFDLGNBQWMsQ0FBQztnQkFDakIsSUFBSSxRQUFRLEtBQUssY0FBYyxFQUFFLENBQUM7Z0JBQ25CLENBQUM7Z0JBQ2hCLGNBQWMsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDMUUsQ0FBQztZQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ0MsY0FBYyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQztZQUN4RixDQUFDO1lBRUQsNEJBQTRCO1lBQzVCLE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFO2dCQUNoRCxHQUFHLEVBQUUsQ0FBQywwQkFBMEIsRUFBRSxnQkFBZ0IsQ0FBQztnQkFDbkQsSUFBSSxFQUFFLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFO2FBQ2hFLENBQUMsQ0FBQztZQUNILE9BQU8sQ0FBQyxVQUFVLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztZQUM5QyxpQ0FBaUM7WUFDakMsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBYSxFQUFFLEVBQUU7Z0JBQzlELENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLHNCQUFzQjtnQkFDM0MsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUMxQyxDQUFDLENBQUMsQ0FBQztZQUVILHdDQUF3QztZQUN4QyxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsRUFBRSxPQUFPLEVBQUUsQ0FBTyxDQUFhLEVBQUUsRUFBRTtnQkFDdkUsOENBQThDO2dCQUM5QyxJQUFJLENBQUMsQ0FBQyxNQUFNLFlBQVksT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSwwQkFBMEIsRUFBRSxDQUFDLEVBQUUsQ0FBQztvQkFDckYsSUFBSSxRQUFRLENBQUMsRUFBRSxLQUFLLFlBQVksRUFBRSxDQUFDO3dCQUMvQixNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQzdELENBQUM7Z0JBQ0wsQ0FBQztZQUNMLENBQUMsQ0FBQSxDQUFDLENBQUM7WUFDSCxvQ0FBb0M7WUFDcEMsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsYUFBYSxFQUFFLENBQUMsQ0FBYSxFQUFFLEVBQUU7Z0JBQ3ZFLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDbkIsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUMxQyxDQUFDLENBQUMsQ0FBQztZQUVILDBHQUEwRztRQUM5RyxDQUFDO0lBQ0gsQ0FBQyxDQUFDLDRDQUE0QztJQUVwQyxrQkFBa0IsQ0FBQyxVQUFrQjs7UUFDM0MsTUFBTSxZQUFZLEdBQUcsTUFBQSxJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxtQ0FBSSxLQUFLLENBQUM7UUFDeEUsTUFBTSxRQUFRLEdBQUcsQ0FBQyxZQUFZLENBQUM7UUFDL0IsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFcEQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLGFBQWEsQ0FDOUQsa0NBQWtDLFVBQVUsSUFBSSxDQUNqRCxDQUFDO1FBQ0YsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN0QixPQUFPO1FBQ1QsQ0FBQztRQUNELFlBQVksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLDRCQUE0QixFQUFFLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDdkUsTUFBTSxZQUFZLEdBQUcsWUFBWSxDQUFDLGFBQWEsQ0FBYyxHQUFHLEdBQUcsZUFBZSxDQUFDLENBQUM7UUFDcEYsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNqQixPQUFPLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDMUUsQ0FBQztJQUNILENBQUM7SUFFRCxnRUFBZ0U7SUFDbEQsYUFBYSxDQUFDLGVBQTRCOztZQUN0RCwrREFBK0Q7WUFDL0QsTUFBTSxXQUFXLEdBQUcsZUFBZSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsQ0FBc0IsQ0FBQztZQUMzRiwrREFBK0Q7WUFDL0QsTUFBTSxvQkFBb0IsR0FBRyxlQUFlLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLEtBQUssTUFBTSxDQUFDO1lBQ3ZGLDBEQUEwRDtZQUMxRCxNQUFNLE1BQU0sR0FBRyxlQUFlLENBQUMsYUFBYSxDQUFjLElBQUksMEJBQTBCLEVBQUUsQ0FBQyxDQUFDO1lBRTVGLHVEQUF1RDtZQUN2RCxJQUFJLFNBQTZCLENBQUM7WUFDbEMsSUFBSSxjQUE0QyxDQUFDLENBQUMsbUVBQW1FO1lBQ3JILElBQUksYUFBaUMsQ0FBQztZQUN0QyxJQUFJLGNBQWtDLENBQUM7WUFDdkMsSUFBSSxnQkFBZ0IsR0FBNkIsSUFBSSxDQUFDO1lBRXRELGtEQUFrRDtZQUNsRCxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUM7WUFDMUMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDO1lBQ2xELE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztZQUMxQyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDO1lBRXpDLDhEQUE4RDtZQUM5RCxJQUFJLFdBQVcsS0FBSyxPQUFPLEVBQUUsQ0FBQztnQkFDNUIsU0FBUyxHQUFHLFdBQVcsQ0FBQztnQkFDeEIsY0FBYyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUM7Z0JBQ3JDLGFBQWEsR0FBRyxVQUFVLENBQUM7Z0JBQzNCLGNBQWMsR0FBRyxXQUFXLENBQUM7Z0JBQzdCLGdCQUFnQixHQUFHLE9BQU8sQ0FBQztZQUM3QixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sMEJBQTBCO2dCQUMxQixTQUFTLEdBQUcsV0FBVyxDQUFDO2dCQUN4QixjQUFjLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztnQkFDckMsYUFBYSxHQUFHLFVBQVUsQ0FBQztnQkFDM0IsY0FBYyxHQUFHLFdBQVcsQ0FBQztnQkFDN0IsZ0JBQWdCLEdBQUcsT0FBTyxDQUFDO1lBQzdCLENBQUM7WUFFRCxnREFBZ0Q7WUFDaEQsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLGNBQWMsSUFBSSxDQUFDLGFBQWEsSUFBSSxDQUFDLGNBQWMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQ2pHLE9BQU8sQ0FBQyxrQ0FBa0M7WUFDbEQsQ0FBQztZQUVELDBFQUEwRTtZQUMxRSxNQUFNLG1CQUFtQixHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFdEQsdUNBQXVDO1lBQ3ZDLElBQUksb0JBQW9CLEVBQUUsQ0FBQztnQkFDekIscUNBQXFDO2dCQUVyQyx3REFBd0Q7Z0JBQ3hELElBQUksYUFBYSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLE9BQU8sRUFBRSxDQUFDO29CQUM3RCxNQUFNLFdBQVcsR0FBRyxhQUFhLENBQUMsYUFBYSxDQUFjLElBQUksMEJBQTBCLEVBQUUsQ0FBQyxDQUFDO29CQUMvRixhQUFhLENBQUMsWUFBWSxDQUFDLGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsOEJBQThCO29CQUNwRixJQUFJLFdBQVc7d0JBQUUsT0FBTyxDQUFDLFdBQVcsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsMENBQTBDO29CQUMxRyxjQUFjLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsb0NBQW9DO29CQUN6RixjQUFjLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLENBQUMsc0RBQXNEO29CQUV4SCx3RUFBd0U7b0JBQ3hFLE1BQU0sa0JBQWtCLEdBQUcsYUFBYSxDQUFDLGdCQUFnQixDQUFjLElBQUkseUJBQXlCLEVBQUUsQ0FBQyxDQUFDO29CQUN4RyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ2xFLENBQUM7Z0JBRUQsZ0NBQWdDO2dCQUNoQyxlQUFlLENBQUMsWUFBWSxDQUFDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsbUNBQW1DO2dCQUM1RixPQUFPLENBQUMsTUFBTSxFQUFFLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxrQ0FBa0M7Z0JBQzFFLFNBQVMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGtDQUFrQyxDQUFDLENBQUMsQ0FBQyx1Q0FBdUM7Z0JBRXZHLHlDQUF5QztnQkFDekMsTUFBTSxhQUFhLEdBQUcsZUFBZSxDQUFDLGdCQUFnQixDQUFjLElBQUkseUJBQXlCLEVBQUUsQ0FBQyxDQUFDO2dCQUNyRyxhQUFhLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsaUNBQWlDO2dCQUV6RixJQUFJLENBQUM7b0JBQ0gsaUVBQWlFO29CQUNqRSxNQUFNLG1CQUFtQixFQUFFLENBQUM7b0JBQzVCLGtFQUFrRTtvQkFDbEUsOENBQThDO29CQUM5QyxxQkFBcUIsQ0FBQyxHQUFHLEVBQUU7d0JBQ3pCLElBQUksQ0FBQSxTQUFTLGFBQVQsU0FBUyx1QkFBVCxTQUFTLENBQUUsV0FBVyxLQUFJLGVBQWUsQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxPQUFPLEVBQUUsQ0FBQzs0QkFDekYsU0FBUyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQzt3QkFDOUMsQ0FBQztvQkFDSCxDQUFDLENBQUMsQ0FBQztnQkFDTCxDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ2YsMkNBQTJDO29CQUNuQyxTQUFTLENBQUMsT0FBTyxDQUFDLGlCQUFpQixXQUFXLEdBQUcsQ0FBQyxDQUFDLENBQUMscUNBQXFDO29CQUNqRyw4Q0FBOEM7b0JBQzlDLHFCQUFxQixDQUFDLEdBQUcsRUFBRTt3QkFDekIsSUFBSSxDQUFBLFNBQVMsYUFBVCxTQUFTLHVCQUFULFNBQVMsQ0FBRSxXQUFXLEtBQUksZUFBZSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLE9BQU8sRUFBRSxDQUFDOzRCQUN6RixTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO3dCQUM5QyxDQUFDO29CQUNILENBQUMsQ0FBQyxDQUFDO2dCQUNMLENBQUM7WUFDSCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sbUNBQW1DO2dCQUNuQyx5Q0FBeUM7Z0JBRXpDLGVBQWUsQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyx5QkFBeUI7Z0JBQ2pGLE9BQU8sQ0FBQyxNQUFNLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLGdDQUFnQztnQkFDMUUsU0FBUyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLG9DQUFvQztnQkFDcEYsU0FBUyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsa0NBQWtDLENBQUMsQ0FBQyxDQUFDLDBDQUEwQztnQkFFdkcsdUNBQXVDO2dCQUN2QyxNQUFNLGFBQWEsR0FBRyxlQUFlLENBQUMsZ0JBQWdCLENBQWMsSUFBSSx5QkFBeUIsRUFBRSxDQUFDLENBQUM7Z0JBQ3JHLGFBQWEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDN0QsQ0FBQztRQUNILENBQUM7S0FBQSxDQUFDLHNDQUFzQztJQUV4QyxpQ0FBaUM7SUFDekIscUJBQXFCLENBQUMsS0FBZ0MsRUFBRSxVQUFzQjtRQUNwRixLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDdkIsS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ3hCLE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUNsQixJQUFJO2FBQ0QsUUFBUSxDQUFDLGVBQWUsQ0FBQzthQUN6QixPQUFPLENBQUMsb0JBQW9CLENBQUM7YUFDN0IsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FDM0QsQ0FBQztRQUNGLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FDbEIsSUFBSTthQUNELFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQzthQUMzQixPQUFPLENBQUMsb0JBQW9CLENBQUM7YUFDN0IsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FDN0QsQ0FBQztRQUNGLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNwQixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQ2xCLElBQUk7YUFDRCxRQUFRLENBQUMsZUFBZSxDQUFDO2FBQ3pCLE9BQU8sQ0FBQyxlQUFlLENBQUM7YUFDeEIsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUN0RCxDQUFDO1FBQ0YsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUNsQixJQUFJO2lCQUNELFFBQVEsQ0FBQyxlQUFlLENBQUM7aUJBQ3pCLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztpQkFDekIsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMscUJBQXFCO1FBQzlFLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUE4TE8sbUJBQW1CLENBQUMsS0FBZ0MsRUFBRSxRQUFzQjtRQUNsRixLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDdkIsS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ3hCLE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUNsQixJQUFJO2FBQ0QsUUFBUSxDQUFDLFlBQVksQ0FBQzthQUN0QixPQUFPLENBQUMsa0JBQWtCLENBQUM7YUFDM0IsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FDM0QsQ0FBQztRQUNGLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FDbEIsSUFBSTthQUNELFFBQVEsQ0FBQyxhQUFhLENBQUM7YUFDdkIsT0FBTyxDQUFDLGVBQWUsQ0FBQzthQUN4QixPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQzNFLENBQUM7UUFDRixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQ2xCLElBQUk7YUFDRCxRQUFRLENBQUMsZ0JBQWdCLENBQUM7YUFDMUIsT0FBTyxDQUFDLGlCQUFpQixDQUFDO2FBQzFCLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQ3ZELENBQUM7UUFDRixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDcEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUNsQixJQUFJO2lCQUNELFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQztpQkFDMUIsT0FBTyxDQUFDLGNBQWMsQ0FBQztpQkFDdkIsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMscUJBQXFCO1FBQ2xHLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUNsQixJQUFJO2lCQUNELFFBQVEsQ0FBQyxhQUFhLENBQUM7aUJBQ3ZCLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztpQkFDekIsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMscUJBQXFCO1FBQ25HLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFDYSxzQkFBc0IsQ0FBQyxNQUFjOztZQUNqRCxNQUFNLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNoRCxJQUFJLENBQUM7Z0JBQ0gsTUFBTSxDQUFDLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzFELElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ04sSUFBSSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztvQkFDbEQseUJBQXlCO29CQUN6QixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO2dCQUMxQyxDQUFDO1lBQ0gsQ0FBQztZQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDUCxDQUFDO29CQUFTLENBQUM7Z0JBQ2YsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hCLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFDYSx1QkFBdUIsQ0FBQyxNQUFjLEVBQUUsV0FBbUI7O1lBQ3ZFLElBQUksV0FBVyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsYUFBYSxFQUFFLGlCQUFpQixXQUFXLElBQUksRUFBRSxXQUFXLEVBQUUsQ0FBTSxPQUFPLEVBQUMsRUFBRTtnQkFDdEcsTUFBTSxXQUFXLEdBQUcsT0FBTyxhQUFQLE9BQU8sdUJBQVAsT0FBTyxDQUFFLElBQUksRUFBRSxDQUFDO2dCQUNwQyxJQUFJLENBQUMsV0FBVyxJQUFJLFdBQVcsS0FBSyxXQUFXLEVBQUUsQ0FBQztvQkFDaEQsSUFBSSxNQUFNLENBQUMsV0FBVyxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUM7Z0JBQ3BGLENBQUM7cUJBQU0sSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7b0JBQzVDLElBQUksTUFBTSxDQUFDLHdDQUF3QyxDQUFDLENBQUM7Z0JBQ3ZELENBQUM7cUJBQU0sQ0FBQztvQkFDTixNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxnQ0FBZ0M7Z0JBQ2pILENBQUM7Z0JBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQztZQUMxQyxDQUFDLENBQUEsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1osQ0FBQztLQUFBLENBQUMsZ0NBQWdDO0lBQ3BCLGtCQUFrQixDQUFDLE1BQWM7OztZQUM3QyxNQUFNLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNsRCxJQUFJLENBQUM7Z0JBQ0gsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzNELElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ3hDLElBQUksTUFBTSxDQUFDLGdEQUFnRCxDQUFDLENBQUM7b0JBQzdELE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDZCxPQUFPO2dCQUNULENBQUM7Z0JBQ0QsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNuRSxNQUFNLEVBQUUsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQzFELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ2xFLE1BQU0sUUFBUSxHQUFHLGVBQWUsUUFBUSxJQUFJLEVBQUUsS0FBSyxDQUFDO2dCQUNwRCxJQUFJLEtBQUssR0FBRyxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG9CQUFvQiwwQ0FBRSxJQUFJLEVBQUUsQ0FBQztnQkFDOUQsSUFBSSxPQUFPLEdBQW1CLElBQUksQ0FBQztnQkFDbkMsSUFBSSxLQUFLLEVBQUUsQ0FBQztvQkFDVixLQUFLLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUM3QixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDdkQsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDO3dCQUNSLElBQUksQ0FBQzs0QkFDSCxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQzs0QkFDekMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsS0FBSyxDQUFDLENBQUM7NEJBQzFELElBQUksS0FBSyxZQUFZLE9BQU8sRUFBRSxDQUFDO2dDQUM3QixPQUFPLEdBQUcsS0FBSyxDQUFDO2dDQUNoQixJQUFJLE1BQU0sQ0FBQywwQkFBMEIsS0FBSyxFQUFFLENBQUMsQ0FBQzs0QkFDaEQsQ0FBQztpQ0FBTSxDQUFDO2dDQUNOLE1BQU0sSUFBSSxLQUFLLENBQUMsK0JBQStCLENBQUMsQ0FBQzs0QkFDbkQsQ0FBQzt3QkFDSCxDQUFDO3dCQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7NEJBQ0QsSUFBSSxNQUFNLENBQUMsNENBQTRDLENBQUMsQ0FBQzs0QkFDckUsT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO3dCQUNyQyxDQUFDO29CQUNILENBQUM7eUJBQU0sSUFBSSxFQUFFLFlBQVksT0FBTyxFQUFFLENBQUM7d0JBQ2pDLE9BQU8sR0FBRyxFQUFFLENBQUM7b0JBQ2YsQ0FBQzt5QkFBTSxDQUFDO3dCQUNOLElBQUksTUFBTSxDQUFDLG9EQUFvRCxDQUFDLENBQUM7d0JBQ2pFLE9BQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDckMsQ0FBQztnQkFDSCxDQUFDO3FCQUFNLENBQUM7b0JBQ04sT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNyQyxDQUFDO2dCQUNELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDTCxJQUFJLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO29CQUMzQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ2QsT0FBTztnQkFDVCxDQUFDO2dCQUNELE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxJQUFJLElBQUksUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDOUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUN2RCxJQUFJLE1BQU0sQ0FBQyxvQkFBb0IsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7WUFDOUMsQ0FBQztZQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ0wsSUFBSSxNQUFNLENBQUMscUJBQXFCLENBQUMsQ0FBQztZQUMxQyxDQUFDO29CQUFTLENBQUM7Z0JBQ1QsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hCLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFDYSxzQkFBc0IsQ0FBQyxNQUFjLEVBQUUsUUFBZ0I7O1lBQ25FLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsZ0JBQWdCLEVBQUUsMEJBQTBCLFFBQVEsSUFBSSxFQUFFLEdBQVMsRUFBRTtnQkFDOUYsTUFBTSxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsc0JBQXNCLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JELElBQUksQ0FBQztvQkFDSCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUM5RSxDQUFDO2dCQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQ0gsSUFBSSxNQUFNLENBQUMsMkJBQTJCLENBQUMsQ0FBQztnQkFDbEQsQ0FBQzt3QkFBUyxDQUFDO29CQUNULE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDaEIsQ0FBQztZQUNILENBQUMsQ0FBQSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDWixDQUFDO0tBQUE7SUFDYSx1QkFBdUIsQ0FBQyxNQUFjLEVBQUUsUUFBZ0I7O1lBQ3BFLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsYUFBYSxFQUFFLGdCQUFnQixRQUFRLDJCQUEyQixFQUFFLEdBQVMsRUFBRTtnQkFDeEcsTUFBTSxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pELElBQUksQ0FBQztvQkFDSCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDbkUsQ0FBQztnQkFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO29CQUNILElBQUksTUFBTSxDQUFDLHdCQUF3QixDQUFDLENBQUM7Z0JBQy9DLENBQUM7d0JBQVMsQ0FBQztvQkFDVCxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2hCLENBQUM7WUFDSCxDQUFDLENBQUEsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1osQ0FBQztLQUFBO0lBQ08sb0JBQW9CLENBQUMsZ0JBQTJCLEVBQUUsUUFBc0I7O1FBQzlFLElBQUksYUFBYSxHQUFnQixJQUFJLENBQUM7UUFDdEMsTUFBTSxlQUFlLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztRQUNuQyxJQUFJLFFBQVEsR0FBRyxvQkFBb0IsUUFBUSxDQUFDLElBQUksTUFBTSxDQUFDO1FBQ3ZELFFBQVEsSUFBSSxrQkFBa0IsUUFBUSxDQUFDLEVBQUUsSUFBSSxDQUFDO1FBQzlDLFFBQVEsSUFBSSxnQkFBZ0IsUUFBUSxDQUFDLFNBQVMsSUFBSSxTQUFTLElBQUksQ0FBQztRQUNoRSxRQUFRLElBQUksb0JBQW9CLFFBQVEsQ0FBQyxnQkFBZ0IsSUFBSSxNQUFNLElBQUksQ0FBQztRQUN4RSxRQUFRLElBQUksc0JBQXNCLE1BQUEsUUFBUSxDQUFDLFdBQVcsbUNBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxJQUFJLENBQUM7UUFDL0YsUUFBUSxJQUFJLGtCQUFrQixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQztRQUNoRixRQUFRLElBQUksd0JBQXdCLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDO1FBQ3pGLFFBQVEsSUFBSSxtQkFBbUIsZUFBZSxDQUFDLGNBQWMsRUFBRSxNQUFNLENBQUM7UUFDdEUsUUFBUSxJQUFJLFNBQVMsQ0FBQztRQUN0QixnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUU7O1lBQ2pDLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxDQUFBLE1BQUEsT0FBTyxDQUFDLE9BQU8sMENBQUUsSUFBSSxFQUFFLENBQUEsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDL0QsT0FBTztZQUNULENBQUM7WUFDRCxJQUFJLGdCQUFzQixDQUFDO1lBQzNCLElBQUksT0FBTyxPQUFPLENBQUMsU0FBUyxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUMxQyxnQkFBZ0IsR0FBRyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDakQsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxTQUFTLFlBQVksSUFBSSxFQUFFLENBQUM7Z0JBQzdDLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7WUFDdkMsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLE9BQU87WUFDVCxDQUFDO1lBQ0QsSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQUN0QyxPQUFPO1lBQ1QsQ0FBQztZQUNELElBQUksYUFBYSxLQUFLLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxFQUFFLGdCQUFnQixDQUFDLEVBQUUsQ0FBQztnQkFDL0UsSUFBSSxhQUFhLEtBQUssSUFBSTtvQkFBRSxRQUFRLElBQUksU0FBUyxDQUFDO2dCQUNsRCxRQUFRLElBQUksS0FBSyxJQUFJLENBQUMsbUJBQW1CLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxDQUFDO2dCQUN6RSxhQUFhLEdBQUcsZ0JBQWdCLENBQUM7WUFDbkMsQ0FBQztZQUNELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUMvQyxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7WUFDaEIsSUFBSSxhQUFhLEdBQUcsRUFBRSxDQUFDO1lBQ3ZCLElBQUksT0FBTyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDckMsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLFdBQVcsRUFBRSxDQUFDO2dCQUNqQyxJQUFJLENBQUM7b0JBQ0gsT0FBTyxHQUFHLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDcEQsSUFBSSxhQUFhLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLENBQUMsZUFBZSxFQUFFLENBQUM7d0JBQzlELE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLGlDQUFpQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO3dCQUN4RSxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQywyQkFBMkIsRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDcEUsQ0FBQztnQkFDSCxDQUFDO2dCQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQSxDQUFDO2dCQUNkLElBQUksQ0FBQyxPQUFPO29CQUFFLE9BQU87WUFDdkIsQ0FBQztZQUNELFFBQVEsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNyQixLQUFLLE1BQU07b0JBQ1QsTUFBTSxHQUFHLFdBQVcsSUFBSSxRQUFRLENBQUM7b0JBQ2pDLE1BQU07Z0JBQ1IsS0FBSyxXQUFXO29CQUNkLE1BQU0sR0FBRyxnQkFBZ0IsSUFBSSxRQUFRLENBQUM7b0JBQ3RDLE1BQU07Z0JBQ1IsS0FBSyxRQUFRO29CQUNYLE1BQU0sR0FBRyxlQUFlLElBQUksVUFBVSxDQUFDO29CQUN2QyxhQUFhLEdBQUcsSUFBSSxDQUFDO29CQUNyQixNQUFNO2dCQUNSLEtBQUssT0FBTztvQkFDVixNQUFNLEdBQUcscUJBQXFCLElBQUksUUFBUSxDQUFDO29CQUMzQyxhQUFhLEdBQUcsSUFBSSxDQUFDO29CQUNyQixNQUFNO2dCQUNSO29CQUNFLE1BQU0sR0FBRyxLQUFLLE9BQU8sQ0FBQyxJQUFJLEtBQUssSUFBSSxRQUFRLENBQUM7b0JBQzVDLE1BQU07WUFDVixDQUFDO1lBQ0QsUUFBUSxJQUFJLE1BQU0sQ0FBQztZQUNuQixJQUFJLGFBQWEsRUFBRSxDQUFDO2dCQUNsQixRQUFRO29CQUNOLE9BQU87eUJBQ0osS0FBSyxDQUFDLElBQUksQ0FBQzt5QkFDWCxHQUFHLENBQUMsQ0FBQyxJQUFZLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLGFBQWEsR0FBRyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7eUJBQ3ZGLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUM7WUFDM0IsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDbkMsT0FBTyxHQUFHLE9BQU87cUJBQ2QsT0FBTyxDQUFDLGNBQWMsRUFBRSxTQUFTLENBQUM7cUJBQ2xDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsU0FBUyxDQUFDO3FCQUNsQyxJQUFJLEVBQUUsQ0FBQztnQkFDVixRQUFRLElBQUksT0FBTyxHQUFHLE1BQU0sQ0FBQztZQUMvQixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sUUFBUTtvQkFDTixPQUFPO3lCQUNKLEtBQUssQ0FBQyxJQUFJLENBQUM7eUJBQ1gsR0FBRyxDQUFDLENBQUMsSUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQzt5QkFDaEQsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQztZQUMzQixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUN6QixDQUFDO0lBQ08sVUFBVSxDQUFDLElBQVU7UUFDM0IsSUFBSSxDQUFDLENBQUMsSUFBSSxZQUFZLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFBRSxPQUFPLE9BQU8sQ0FBQztRQUNyRSxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDbkcsQ0FBQztJQUNPLG1CQUFtQixDQUFDLElBQVU7UUFDcEMsSUFBSSxDQUFDLENBQUMsSUFBSSxZQUFZLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFBRSxPQUFPLGNBQWMsQ0FBQztRQUM1RSxNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ3ZCLE1BQU0sU0FBUyxHQUFHLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2hDLFNBQVMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDO1lBQUUsT0FBTyxPQUFPLENBQUM7UUFDOUMsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUM7WUFBRSxPQUFPLFdBQVcsQ0FBQztRQUN4RCxNQUFNLFlBQVksR0FBRyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLEVBQUUsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ2hGLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUN2RixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNHLElBQUksUUFBUSxHQUFHLENBQUMsSUFBSSxRQUFRLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDakMsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDakUsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztJQUNoRyxDQUFDO0lBQ08sa0JBQWtCLENBQUMsSUFBVTtRQUNuQyxJQUFJLENBQUMsQ0FBQyxJQUFJLFlBQVksSUFBSSxDQUFDLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDckQsT0FBTyxjQUFjLENBQUM7UUFDeEIsQ0FBQztRQUNELE1BQU0sR0FBRyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7UUFDdkIsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztRQUN4RSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUNqRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUMvQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUM1QyxJQUFJLFdBQVcsR0FBRyxDQUFDO1lBQUUsT0FBTyxVQUFVLENBQUM7UUFDdkMsSUFBSSxXQUFXLEdBQUcsRUFBRTtZQUFFLE9BQU8sR0FBRyxXQUFXLE9BQU8sQ0FBQztRQUNuRCxJQUFJLFdBQVcsR0FBRyxFQUFFO1lBQUUsT0FBTyxHQUFHLFdBQVcsT0FBTyxDQUFDO1FBQ25ELElBQUksU0FBUyxHQUFHLENBQUM7WUFBRSxPQUFPLFFBQVEsQ0FBQztRQUNuQyxJQUFJLFNBQVMsR0FBRyxFQUFFO1lBQUUsT0FBTyxHQUFHLFNBQVMsT0FBTyxDQUFDO1FBQy9DLElBQUksUUFBUSxLQUFLLENBQUM7WUFBRSxPQUFPLFdBQVcsQ0FBQztRQUN2QyxJQUFJLFFBQVEsR0FBRyxDQUFDO1lBQUUsT0FBTyxHQUFHLFFBQVEsT0FBTyxDQUFDO1FBQzVDLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsRUFBRTtZQUN4QyxLQUFLLEVBQUUsT0FBTztZQUNkLEdBQUcsRUFBRSxTQUFTO1lBQ2QsSUFBSSxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsS0FBSyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUztTQUN2RSxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQ08sU0FBUyxDQUFDLEtBQVcsRUFBRSxLQUFXO1FBQ3hDLElBQUksQ0FBQyxDQUFDLEtBQUssWUFBWSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxZQUFZLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQzFHLE9BQU8sS0FBSyxDQUFDO1FBQ2YsT0FBTyxDQUNMLEtBQUssQ0FBQyxXQUFXLEVBQUUsS0FBSyxLQUFLLENBQUMsV0FBVyxFQUFFO1lBQzNDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxLQUFLLENBQUMsUUFBUSxFQUFFO1lBQ3JDLEtBQUssQ0FBQyxPQUFPLEVBQUUsS0FBSyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQ3BDLENBQUM7SUFDSixDQUFDO0lBQ00sT0FBTzs7UUFDWixNQUFBLElBQUksQ0FBQyxXQUFXLDBDQUFFLE1BQU0sRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNwQyxDQUFDO0lBRUQsd0JBQXdCO0lBRWxCLGVBQWUsQ0FBQyxLQUFnQixFQUFFLElBQW1CO1FBRTNELElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDaEIsT0FBTztRQUNqQixDQUFDO1FBRUQsSUFBSSxFQUFVLENBQUM7UUFDZixJQUFJLElBQVksQ0FBQztRQUNqQixJQUFJLElBQVksQ0FBQztRQUVqQixJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDdkIsRUFBRSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ3RCLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO1lBQ3JCLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztRQUM5QixDQUFDO2FBQU0sQ0FBQyxDQUFDLHlCQUF5QjtZQUM5QixFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztZQUNmLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ2pCLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ3JCLENBQUM7UUFFRCxJQUFJLENBQUMsZUFBZSxHQUFHLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQztRQUUzRSxLQUFLLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUMvRSxLQUFLLENBQUMsWUFBWSxDQUFDLGFBQWEsR0FBRyxNQUFNLENBQUM7UUFFMUMsSUFBSSxLQUFLLENBQUMsTUFBTSxZQUFZLFdBQVcsRUFBRSxDQUFDO1lBQ3hDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7UUFFRCw4Q0FBOEM7UUFDOUMsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyw2Q0FBNkM7WUFDakUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDcEQsQ0FBQztRQUNQLDBCQUEwQjtRQUUxQixLQUFLLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDeEIsQ0FBQztJQUdELHdCQUF3QjtJQUVsQixhQUFhLENBQUMsS0FBZ0I7O1FBQ3BDLHVDQUF1QztRQUN2QyxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLDZDQUE2QztZQUNqRSxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUN2RCxDQUFDO1FBQ1AsOERBQThEO1FBQzlELElBQUksSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDN0QsQ0FBQztRQUNELDBCQUEwQjtRQUcxQiwrQ0FBK0M7UUFDL0MsSUFBSSxLQUFLLENBQUMsTUFBTSxZQUFZLFdBQVcsRUFBRSxDQUFDO1lBQ3hDLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ3hDLHdFQUF3RTtRQUMxRSxDQUFDO1FBQ0QsaUVBQWlFO1FBQ2pFLE1BQUEsSUFBSSxDQUFDLFdBQVcsMENBQUUsZ0JBQWdCLENBQUMsbUJBQW1CLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7UUFFMUcsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUMsQ0FBQyxvREFBb0Q7UUFDakYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGtEQUFrRCxDQUFDLENBQUM7SUFDL0UsQ0FBQztJQUVTLGNBQWMsQ0FBQyxLQUFnQjtRQUNyQyxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDdkIsSUFBSSxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDdkIsS0FBSyxDQUFDLFlBQVksQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDO1FBQ3pDLENBQUM7UUFDRCxLQUFLLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxvQ0FBb0M7UUFDN0QsMEZBQTBGO0lBQzlGLENBQUM7SUFFUyxlQUFlLENBQUMsS0FBZ0IsRUFBRSxVQUFzQjtRQUM5RCxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQywrQkFBK0I7UUFDdkQsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLGFBQTRCLENBQUM7UUFDekQsSUFBSSxDQUFDLGFBQWEsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlO1lBQUUsT0FBTztRQUVwRCwyQ0FBMkM7UUFDM0MsSUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDdkMsc0NBQXNDO1lBQ3RDLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFDbkIsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDaEQscURBQXFEO1lBQ3JELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDO1lBQzlDLE1BQU0sVUFBVSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUM7WUFDbkMsSUFBSSxXQUFXLEtBQUssVUFBVSxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDMUUsT0FBTyxHQUFHLElBQUksQ0FBQztZQUNuQixDQUFDO1FBQ0wsQ0FBQztRQUVELDhEQUE4RDtRQUM5RCxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1YsYUFBYSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQzNDLDBGQUEwRjtRQUM5RixDQUFDO0lBQ0gsQ0FBQztJQUVPLGVBQWUsQ0FBQyxLQUFnQjtRQUN0QyxnQ0FBZ0M7UUFDaEMsNkVBQTZFO1FBQzdFLG9DQUFvQztRQUNwQyxNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsYUFBNEIsQ0FBQztRQUN6RCxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ2hCLGFBQWEsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUM5QyxnRkFBZ0Y7UUFDcEYsQ0FBQztJQUNILENBQUM7SUFJTyxrQkFBa0IsQ0FBQyxLQUFnQjtRQUN6QyxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDdkIsSUFBSSxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDckIsS0FBSyxDQUFDLFlBQVksQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDO1FBQzNDLENBQUM7UUFFRCwyRkFBMkY7UUFDM0Ysc0ZBQXNGO1FBQ3RGLDJFQUEyRTtRQUUzRSxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3ZCLEtBQUssQ0FBQyxhQUE2QixDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQzFFLE9BQU87UUFDWCxDQUFDO1FBRUQsbUVBQW1FO1FBQ25FLE1BQU0sY0FBYyxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUM5RSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQztRQUM5QyxJQUFJLGdCQUFnQixHQUFHLGFBQWEsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxXQUFXLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7UUFFcEcsMEVBQTBFO1FBQzFFLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLGNBQWMsS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDakcsZ0JBQWdCLEdBQUcsR0FBRyxDQUFDLENBQUMsMkJBQTJCO1FBQ3ZELENBQUM7UUFHRCxJQUFJLGdCQUFnQixLQUFLLGNBQWMsRUFBRSxDQUFDO1lBQ3JDLEtBQUssQ0FBQyxhQUE2QixDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQzFFLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO1FBQzVGLENBQUM7YUFBTSxDQUFDO1lBQ0gsS0FBSyxDQUFDLGFBQTZCLENBQUMsUUFBUSxDQUFDLHVCQUF1QixDQUFDLENBQUM7WUFDdkUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGdHQUFnRyxDQUFDLENBQUM7UUFDL0gsQ0FBQztJQUNMLENBQUM7SUFFRCw0RUFBNEU7SUFDNUUsMEVBQTBFO0lBQ2xFLG1CQUFtQixDQUFDLEtBQWdCO1FBQzFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLCtCQUErQjtRQUN2RCxtRUFBbUU7UUFDbkUsaUVBQWlFO1FBQ2pFLDZDQUE2QztRQUM3QyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsc0RBQXNELENBQUMsQ0FBQztRQUNqRiw4RkFBOEY7UUFDOUYsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFTyxtQkFBbUIsQ0FBQyxLQUFnQjtRQUMxQyxNQUFNLGdCQUFnQixHQUFHLEtBQUssQ0FBQyxhQUE0QixDQUFDO1FBQzVELHlEQUF5RDtRQUN6RCxpRkFBaUY7UUFDakYsaUNBQWlDO1FBQ2pDLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxJQUFJLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLGFBQXFCLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDcEYsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDcEQsQ0FBQzthQUFNLENBQUM7WUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsNkZBQTZGLENBQUMsQ0FBQztRQUM3SCxDQUFDO0lBQ0gsQ0FBQztJQUVhLFVBQVUsQ0FBQyxLQUFnQixFQUFFLFVBQXNCOztZQUMvRCxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxpQ0FBaUM7WUFDekQsS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsMkZBQTJGO1lBRXBILE1BQU0sYUFBYSxHQUFHLEtBQUssQ0FBQyxhQUE0QixDQUFDO1lBQ3pELGFBQWEsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLDBDQUEwQztZQUV6RixtREFBbUQ7WUFDbkQsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ3pDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLENBQUMsNEJBQTRCO2dCQUMvRCxPQUFPO1lBQ1gsQ0FBQztZQUVELE1BQU0sV0FBVyxxQkFBUSxJQUFJLENBQUMsZUFBZSxDQUFFLENBQUMsQ0FBQywyQ0FBMkM7WUFDNUYsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUMsQ0FBQywwQ0FBMEM7WUFFdkUsTUFBTSxnQkFBZ0IsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMseUJBQXlCO1lBRW5FLG9CQUFvQjtZQUNwQiw2REFBNkQ7WUFDN0QsTUFBTSxnQkFBZ0IsR0FBRyxhQUFhLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7WUFFaEgsd0NBQXdDO1lBQ3hDLElBQUksV0FBVyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksV0FBVyxDQUFDLElBQUksS0FBSyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUNuRSxPQUFPO1lBQ2pCLENBQUM7WUFDRCx3REFBd0Q7WUFDeEQsSUFBSSxXQUFXLENBQUMsSUFBSSxLQUFLLE1BQU0sSUFBSSxnQkFBZ0IsS0FBSyxhQUFhLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDO2dCQUNoRixPQUFPO1lBQ2pCLENBQUM7WUFDRCxzREFBc0Q7WUFDdEQsSUFBSSxXQUFXLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN2RixJQUFJLE1BQU0sQ0FBQyx3REFBd0QsQ0FBQyxDQUFDO2dCQUMvRCxPQUFPO1lBQ2pCLENBQUM7WUFFRCx3QkFBd0I7WUFDeEIsSUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFDO1lBQ3BCLE1BQU0sYUFBYSxHQUFHLFVBQVUsV0FBVyxDQUFDLElBQUksS0FBSyxXQUFXLENBQUMsSUFBSSxTQUFTLFVBQVUsQ0FBQyxJQUFJLE1BQU0sQ0FBQztZQUNwRyxNQUFNLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxrQ0FBa0M7WUFFL0UsSUFBSSxDQUFDO2dCQUNELElBQUksV0FBVyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztvQkFDOUIsa0JBQWtCO29CQUNSLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztnQkFDbkgsQ0FBQztxQkFBTSxJQUFJLFdBQVcsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQ3ZDLDJFQUEyRTtvQkFDM0UsTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLCtCQUErQjtvQkFDcEUsTUFBTSxPQUFPLEdBQUcsYUFBYSxDQUFDLEdBQUcsZ0JBQWdCLElBQUksVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDLDhCQUE4QjtvQkFHbEcsSUFBSSxXQUFXLENBQUMsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDLENBQUMseURBQXlEO3dCQUN6RSxPQUFPLEdBQUcsSUFBSSxDQUFDO29CQUNuQyxDQUFDO3lCQUFNLENBQUM7d0JBQ0osOENBQThDO3dCQUM5QyxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7d0JBQzVELElBQUksTUFBTSxFQUFFLENBQUM7NEJBQ1QsSUFBSSxNQUFNLENBQUMsa0JBQWtCLFVBQVUsbUNBQW1DLFVBQVUsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO3dCQUNqRixDQUFDOzZCQUFNLENBQUM7NEJBQ3RCLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDOzRCQUNoRixnRUFBZ0U7NEJBQ2hFLElBQUksT0FBTyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7Z0NBQzdELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO2dDQUNwRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQ0FDbkQsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsV0FBWSxDQUFDLENBQUM7NEJBQ25DLENBQUM7d0JBQzNCLENBQUM7b0JBQ0wsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQztZQUFDLE9BQU0sS0FBSyxFQUFFLENBQUM7Z0JBQ04sSUFBSSxNQUFNLENBQUMsZ0JBQWdCLFdBQVcsQ0FBQyxJQUFJLGtCQUFrQixDQUFDLENBQUM7Z0JBQ3JFLE9BQU8sR0FBRyxLQUFLLENBQUM7WUFDcEIsQ0FBQztvQkFBUyxDQUFDO2dCQUNQLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLHFCQUFxQjtnQkFDcEMsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDSCxDQUFDO3FCQUFNLENBQUM7Z0JBQ1QsQ0FBQztnQkFDWCwyRUFBMkU7Z0JBQzNFLHFGQUFxRjtZQUN6RixDQUFDO1FBQ0gsQ0FBQztLQUFBLENBQUMsZ0RBQWdEO0lBSTFDLHdCQUF3QixDQUFDLEtBQWdCO1FBQy9DLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLDRDQUE0QztRQUNwRSxJQUFJLEtBQUssQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUN2QixLQUFLLENBQUMsWUFBWSxDQUFDLFVBQVUsR0FBRyxNQUFNLENBQUM7UUFDekMsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDeEIsSUFBSSxDQUFDLHdCQUF3QixDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQ25FLE9BQU87UUFDWCxDQUFDO1FBRUQsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLE1BQXFCLENBQUM7UUFFakQsb0VBQW9FO1FBQ3BFLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO1lBQ2hELElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxXQUFXLENBQUMsdUJBQXVCLENBQUMsQ0FBQztZQUNuRSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsaUVBQWlFLENBQUMsQ0FBQztZQUM1RixPQUFPO1FBQ1gsQ0FBQztRQUVELGtFQUFrRTtRQUNsRSx5RUFBeUU7UUFDekUsc0RBQXNEO1FBRXRELGtFQUFrRTtRQUNsRSxNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDOUUsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUM7UUFDOUMsSUFBSSxnQkFBZ0IsR0FBRyxhQUFhLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1FBQ3BHLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLGNBQWMsS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDakcsZ0JBQWdCLEdBQUcsR0FBRyxDQUFDO1FBQzNCLENBQUM7UUFDRCxvREFBb0Q7UUFDcEQsSUFBSSxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksY0FBYyxLQUFLLEdBQUc7WUFDaEUsV0FBVyxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUM7WUFDdEMsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3BFLGdCQUFnQixLQUFLLGNBQWMsRUFBRSxDQUFDO1lBQ3BDLDhDQUE4QztRQUNwRCxDQUFDO1FBRUQsSUFBSSxnQkFBZ0IsS0FBSyxjQUFjLEVBQUUsQ0FBQztZQUN0QyxJQUFJLENBQUMsd0JBQXdCLENBQUMsV0FBVyxDQUFDLHVCQUF1QixDQUFDLENBQUM7WUFDbkUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLHFFQUFxRSxDQUFDLENBQUM7UUFDcEcsQ0FBQzthQUFNLENBQUM7WUFDSixJQUFJLENBQUMsd0JBQXdCLENBQUMsUUFBUSxDQUFDLHVCQUF1QixDQUFDLENBQUM7WUFDaEUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLDJGQUEyRixDQUFDLENBQUM7UUFDMUgsQ0FBQztJQUNILENBQUM7SUFFTyx5QkFBeUIsQ0FBQyxLQUFnQjtRQUNoRCxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxzQkFBc0I7UUFDOUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLHVEQUF1RCxDQUFDLENBQUM7UUFDbEYsNkVBQTZFO1FBQzdFLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN2QyxDQUFDO0lBRU8seUJBQXlCLENBQUMsS0FBZ0I7UUFDaEQsTUFBTSxnQkFBZ0IsR0FBRyxLQUFLLENBQUMsYUFBNEIsQ0FBQyxDQUFDLGVBQWU7UUFDNUUsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLGFBQTRCLENBQUM7UUFDekQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLHFFQUFxRSxhQUFhLENBQUMsQ0FBQyxDQUFFLGFBQTZCLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBRW5LLElBQUksQ0FBQyxhQUFhLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUM5RCxJQUFJLENBQUMsd0JBQXdCLENBQUMsV0FBVyxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDakUsQ0FBQztJQUNULENBQUM7SUFFYSxvQkFBb0IsQ0FBQyxLQUFnQjs7WUFDakQsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxXQUFXLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLDJCQUEyQjtZQUUvRixJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUNsQixPQUFPO1lBQ2pCLENBQUM7WUFFRCxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsTUFBcUIsQ0FBQztZQUNqRCxrREFBa0Q7WUFDbEQsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7Z0JBQzFDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLENBQUMsNkJBQTZCO2dCQUNoRSxPQUFPO1lBQ1gsQ0FBQztZQUNELGtHQUFrRztZQUNsRyx3RkFBd0Y7WUFFeEYsTUFBTSxXQUFXLHFCQUFRLElBQUksQ0FBQyxlQUFlLENBQUUsQ0FBQztZQUNoRCxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztZQUU1QixNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUM7WUFFOUUsK0RBQStEO1lBQy9ELElBQUksZ0JBQWdCLEdBQUcsYUFBYSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxXQUFXLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1lBQzlHLElBQUksV0FBVyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksY0FBYyxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzdGLGdCQUFnQixHQUFHLEdBQUcsQ0FBQztZQUMzQixDQUFDO1lBQ0Qsa0hBQWtIO1lBRWxILElBQUksZ0JBQWdCLEtBQUssY0FBYyxFQUFFLENBQUM7Z0JBQ2hDLE9BQU87WUFDakIsQ0FBQztZQUVELHVGQUF1RjtZQUN2RixJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUM7WUFDcEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsVUFBVSxXQUFXLENBQUMsSUFBSSxhQUFhLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdEUsSUFBSSxDQUFDO2dCQUNELElBQUksV0FBVyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztvQkFDOUIsT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxFQUFFLEVBQUUsV0FBVyxDQUFDLElBQUksRUFBRSxjQUFjLENBQUMsQ0FBQztnQkFDdkcsQ0FBQztxQkFBTSxJQUFJLFdBQVcsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQ3ZDLE1BQU0sVUFBVSxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUM7b0JBQ3BDLE1BQU0sYUFBYSxHQUFHLGFBQWEsQ0FBQyxjQUFjLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUcsY0FBYyxJQUFJLFVBQVUsRUFBRSxDQUFDLENBQUM7b0JBQzdHLElBQUksV0FBVyxDQUFDLElBQUksS0FBSyxhQUFhLEVBQUUsQ0FBQzt3QkFDcEMsT0FBTyxHQUFHLElBQUksQ0FBQztvQkFDcEIsQ0FBQzt5QkFBTSxDQUFDO3dCQUNKLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQzt3QkFDbEUsSUFBSSxNQUFNLEVBQUUsQ0FBQzs0QkFDVCxJQUFJLE1BQU0sQ0FBQyxrQkFBa0IsVUFBVSwrQkFBK0IsQ0FBQyxDQUFDO3dCQUM1RSxDQUFDOzZCQUFNLENBQUM7NEJBQ0osT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsYUFBYSxDQUFDLENBQUM7NEJBQ3RGLElBQUksT0FBTyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7Z0NBQzdELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO2dDQUNwRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQ0FDbkQsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsV0FBWSxDQUFDLENBQUM7NEJBQy9ELENBQUM7d0JBQ0wsQ0FBQztvQkFDTCxDQUFDO2dCQUNMLENBQUM7WUFDTCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDUCxJQUFJLE1BQU0sQ0FBQyxnQkFBZ0IsV0FBVyxDQUFDLElBQUksMEJBQTBCLENBQUMsQ0FBQztnQkFDN0UsT0FBTyxHQUFHLEtBQUssQ0FBQztZQUNwQixDQUFDO29CQUFTLENBQUM7Z0JBQ1AsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNkLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ0osQ0FBQztxQkFBTSxDQUFDO2dCQUNSLENBQUM7WUFDZixDQUFDO1FBQ0gsQ0FBQztLQUFBO0lBRUMsMkRBQTJEO0lBRW5ELHNCQUFzQixDQUFDLEtBQWdCO1FBQzdDLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUN2QixJQUFJLEtBQUssQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUN2QixLQUFLLENBQUMsWUFBWSxDQUFDLFVBQVUsR0FBRyxNQUFNLENBQUM7UUFDekMsQ0FBQztRQUNELHlGQUF5RjtRQUN6Rix5REFBeUQ7SUFDM0QsQ0FBQztJQUVPLHVCQUF1QixDQUFDLEtBQWdCO1FBQzlDLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUN2QixNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsYUFBNEIsQ0FBQyxDQUFDLHlCQUF5QjtRQUVuRixJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3BCLE9BQU87UUFDZixDQUFDO1FBRUQsd0RBQXdEO1FBQ3hELE1BQU0sY0FBYyxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUM5RSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQztRQUM5QyxJQUFJLGdCQUFnQixHQUFHLGFBQWEsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxXQUFXLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7UUFDcEcsSUFBSSxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksY0FBYyxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNqRyxnQkFBZ0IsR0FBRyxHQUFHLENBQUM7UUFDM0IsQ0FBQztRQUVELElBQUksZ0JBQWdCLEtBQUssY0FBYyxFQUFFLENBQUM7WUFDOUIsYUFBYSxDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsaUNBQWlDO1lBQzdGLE9BQU87UUFDWCxDQUFDO1FBRUQsYUFBYSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFRyx1QkFBdUIsQ0FBQyxLQUFnQjtRQUM5QyxNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsYUFBNEIsQ0FBQyxDQUFDLHlCQUF5QjtRQUNuRixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLENBQUMsQ0FBQztRQUM3RCxhQUFhLENBQUMsV0FBVyxDQUFDLHVCQUF1QixDQUFDLENBQUM7SUFDckQsQ0FBQztJQUVhLGtCQUFrQixDQUFDLEtBQWdCOztZQUMvQyxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDdkIsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLGFBQTRCLENBQUMsQ0FBQyx5QkFBeUI7WUFDbkYsYUFBYSxDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBRW5ELElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQ2hCLE9BQU87WUFDbkIsQ0FBQztZQUVELE1BQU0sV0FBVyxxQkFBUSxJQUFJLENBQUMsZUFBZSxDQUFFLENBQUM7WUFDaEQsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUMsQ0FBQyxXQUFXO1lBRXhDLE1BQU0sY0FBYyxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUU5RSw4Q0FBOEM7WUFDOUMsSUFBSSxnQkFBZ0IsR0FBRyxhQUFhLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7WUFDOUcsSUFBSSxXQUFXLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxjQUFjLEtBQUssR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDN0YsZ0JBQWdCLEdBQUcsR0FBRyxDQUFDO1lBQzNCLENBQUM7WUFFRCxJQUFJLGdCQUFnQixLQUFLLGNBQWMsRUFBRSxDQUFDO2dCQUM5QixPQUFPO1lBQ25CLENBQUM7WUFFRCxzRUFBc0U7WUFDdEUsSUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFDO1lBQ3BCLE1BQU0sTUFBTSxHQUFHLElBQUksTUFBTSxDQUFDLFVBQVUsV0FBVyxDQUFDLElBQUksYUFBYSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3RFLElBQUksQ0FBQztnQkFDRCxJQUFJLFdBQVcsQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7b0JBQzlCLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQyxJQUFJLEVBQUUsY0FBYyxDQUFDLENBQUM7Z0JBQ3ZHLENBQUM7cUJBQU0sSUFBSSxXQUFXLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUN2QyxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDO29CQUNwQyxNQUFNLGFBQWEsR0FBRyxhQUFhLENBQUMsY0FBYyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHLGNBQWMsSUFBSSxVQUFVLEVBQUUsQ0FBQyxDQUFDO29CQUM3RyxJQUFJLFdBQVcsQ0FBQyxJQUFJLEtBQUssYUFBYSxFQUFFLENBQUM7d0JBQ3BDLE9BQU8sR0FBRyxJQUFJLENBQUM7b0JBQ3BCLENBQUM7eUJBQU0sQ0FBQzt3QkFDSixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7d0JBQ2xFLElBQUksTUFBTSxFQUFFLENBQUM7NEJBQ1QsSUFBSSxNQUFNLENBQUMsa0JBQWtCLFVBQVUsK0JBQStCLENBQUMsQ0FBQzt3QkFDNUUsQ0FBQzs2QkFBTSxDQUFDOzRCQUNKLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLGFBQWEsQ0FBQyxDQUFDOzRCQUN0RixJQUFJLE9BQU8sSUFBSSxJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dDQUM3RCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQ0FDcEUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7Z0NBQ25ELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFdBQVksQ0FBQyxDQUFDOzRCQUMvRCxDQUFDO3dCQUNMLENBQUM7b0JBQ0wsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ0wsSUFBSSxNQUFNLENBQUMsZ0JBQWdCLFdBQVcsQ0FBQyxJQUFJLDBCQUEwQixDQUFDLENBQUM7Z0JBQy9FLE9BQU8sR0FBRyxLQUFLLENBQUM7WUFDcEIsQ0FBQztvQkFBUyxDQUFDO2dCQUNQLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDZCxJQUFJLE9BQU8sRUFBRSxDQUFDO2dCQUNGLENBQUM7cUJBQU0sQ0FBQztnQkFDUixDQUFDO1lBQ2pCLENBQUM7UUFDSCxDQUFDO0tBQUE7Q0FHRixDQUFDLDhCQUE4QiIsInNvdXJjZXNDb250ZW50IjpbIi8vIHNyYy9TaWRlYmFyTWFuYWdlci50c1xuaW1wb3J0IHsgQXBwLCBzZXRJY29uLCBNZW51LCBOb3RpY2UsIFRGb2xkZXIsIG5vcm1hbGl6ZVBhdGgsIGRlYm91bmNlLCBNZW51SXRlbSwgVEFic3RyYWN0RmlsZSB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IE9sbGFtYVBsdWdpbiBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQgeyBSb2xlSW5mbyB9IGZyb20gXCIuL0NoYXRNYW5hZ2VyXCI7XG5pbXBvcnQgeyBDaGF0TWV0YWRhdGEgfSBmcm9tIFwiLi9DaGF0XCI7XG5pbXBvcnQgeyBDb25maXJtTW9kYWwgfSBmcm9tIFwiLi9Db25maXJtTW9kYWxcIjtcbmltcG9ydCB7IFByb21wdE1vZGFsIH0gZnJvbSBcIi4vUHJvbXB0TW9kYWxcIjtcbmltcG9ydCAqIGFzIFJlbmRlcmVyVXRpbHMgZnJvbSBcIi4vTWVzc2FnZVJlbmRlcmVyVXRpbHNcIjtcbmltcG9ydCB7IE1lc3NhZ2UgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgT2xsYW1hVmlldyB9IGZyb20gXCIuL09sbGFtYVZpZXdcIjtcbmltcG9ydCB7IEhpZXJhcmNoeU5vZGUsIEZvbGRlck5vZGUsIENoYXROb2RlIH0gZnJvbSBcIi4vQ2hhdE1hbmFnZXJcIjtcblxuLy8gLS0tIENTUyBDbGFzc2VzIC0tLVxuY29uc3QgQ1NTX1NJREVCQVJfQ09OVEFJTkVSID0gXCJvbGxhbWEtc2lkZWJhci1jb250YWluZXJcIjtcbmNvbnN0IENTU19ST0xFX1BBTkVMID0gXCJvbGxhbWEtcm9sZS1wYW5lbFwiO1xuY29uc3QgQ1NTX0NIQVRfUEFORUwgPSBcIm9sbGFtYS1jaGF0LXBhbmVsXCI7XG5jb25zdCBDU1NfUk9MRV9QQU5FTF9IRUFERVIgPSBcIm9sbGFtYS1yb2xlLXBhbmVsLWhlYWRlclwiO1xuY29uc3QgQ1NTX1JPTEVfUEFORUxfTElTVCA9IFwib2xsYW1hLXJvbGUtcGFuZWwtbGlzdFwiO1xuY29uc3QgQ1NTX1JPTEVfUEFORUxfSVRFTSA9IFwib2xsYW1hLXJvbGUtcGFuZWwtaXRlbVwiO1xuY29uc3QgQ1NTX1JPTEVfUEFORUxfSVRFTV9JQ09OID0gXCJvbGxhbWEtcm9sZS1wYW5lbC1pdGVtLWljb25cIjtcbmNvbnN0IENTU19ST0xFX1BBTkVMX0lURU1fVEVYVCA9IFwib2xsYW1hLXJvbGUtcGFuZWwtaXRlbS10ZXh0XCI7XG5jb25zdCBDU1NfUk9MRV9QQU5FTF9JVEVNX0FDVElWRSA9IFwiaXMtYWN0aXZlXCI7XG5jb25zdCBDU1NfUk9MRV9QQU5FTF9JVEVNX0NVU1RPTSA9IFwiaXMtY3VzdG9tXCI7XG5jb25zdCBDU1NfUk9MRV9QQU5FTF9JVEVNX05PTkUgPSBcIm9sbGFtYS1yb2xlLXBhbmVsLWl0ZW0tbm9uZVwiO1xuXG5jb25zdCBDU1NfQ0xBU1NfTUVOVV9PUFRJT04gPSBcIm1lbnUtb3B0aW9uXCI7XG5jb25zdCBDU1NfU0lERUJBUl9TRUNUSU9OX0hFQURFUiA9IFwib2xsYW1hLXNpZGViYXItc2VjdGlvbi1oZWFkZXJcIjtcbmNvbnN0IENTU19TSURFQkFSX1NFQ1RJT05fQ09OVEVOVCA9IFwib2xsYW1hLXNpZGViYXItc2VjdGlvbi1jb250ZW50XCI7XG4vLyBjb25zdCBDU1NfU0lERUJBUl9TRUNUSU9OX0lDT04gPSBcIm9sbGFtYS1zaWRlYmFyLXNlY3Rpb24taWNvblwiOyAvLyDQkdGW0LvRjNGI0LUg0L3QtSDQstC40LrQvtGA0LjRgdGC0L7QstGD0ZTRgtGM0YHRj1xuY29uc3QgQ1NTX1NFQ1RJT05fVE9HR0xFX0NIRVZST04gPSBcIm9sbGFtYS1zZWN0aW9uLXRvZ2dsZS1jaGV2cm9uXCI7IC8vINCd0L7QstC40Lkg0LrQu9Cw0YEg0LTQu9GPINGI0LXQstGA0L7QvdCwINGB0L/RgNCw0LLQsFxuY29uc3QgQ1NTX1NJREVCQVJfSEVBREVSX0FDVElPTlMgPSBcIm9sbGFtYS1zaWRlYmFyLWhlYWRlci1hY3Rpb25zXCI7XG5jb25zdCBDU1NfU0lERUJBUl9IRUFERVJfQlVUVE9OID0gXCJvbGxhbWEtc2lkZWJhci1oZWFkZXItYnV0dG9uXCI7XG5jb25zdCBDU1NfU0lERUJBUl9IRUFERVJfTEVGVCA9IFwib2xsYW1hLXNpZGViYXItaGVhZGVyLWxlZnRcIjtcbmNvbnN0IENTU19TSURFQkFSX1NFQ1RJT05fQ09OVEVOVF9ISURERU4gPSBcIm9sbGFtYS1zaWRlYmFyLXNlY3Rpb24tY29udGVudC1oaWRkZW5cIjtcbmNvbnN0IENTU19FWFBBTkRFRF9DTEFTUyA9IFwiaXMtZXhwYW5kZWRcIjtcblxuLy8g0JrQu9Cw0YHQuCDQtNC70Y8g0YHQv9C40YHQutGDINGH0LDRgtGW0LIv0L/QsNC/0L7QulxuY29uc3QgQ1NTX0NIQVRfTElTVF9DT05UQUlORVIgPSBcIm9sbGFtYS1jaGF0LWxpc3QtY29udGFpbmVyXCI7XG5jb25zdCBDU1NfSElFUkFSQ0hZX0lURU0gPSBcIm9sbGFtYS1oaWVyYXJjaHktaXRlbVwiO1xuY29uc3QgQ1NTX0ZPTERFUl9JVEVNID0gXCJvbGxhbWEtZm9sZGVyLWl0ZW1cIjtcbmNvbnN0IENTU19DSEFUX0lURU0gPSBcIm9sbGFtYS1jaGF0LWl0ZW1cIjtcbmNvbnN0IENTU19ISUVSQVJDSFlfSVRFTV9DT05URU5UID0gXCJvbGxhbWEtaGllcmFyY2h5LWl0ZW0tY29udGVudFwiO1xuY29uc3QgQ1NTX0hJRVJBUkNIWV9JVEVNX0NISUxEUkVOID0gXCJvbGxhbWEtaGllcmFyY2h5LWl0ZW0tY2hpbGRyZW5cIjtcbmNvbnN0IENTU19ISUVSQVJDSFlfSVRFTV9DT0xMQVBTRUQgPSBcImlzLWNvbGxhcHNlZFwiO1xuY29uc3QgQ1NTX0ZPTERFUl9JQ09OID0gXCJvbGxhbWEtZm9sZGVyLWljb25cIjtcbmNvbnN0IENTU19ISUVSQVJDSFlfSVRFTV9URVhUID0gXCJvbGxhbWEtaGllcmFyY2h5LWl0ZW0tdGV4dFwiO1xuY29uc3QgQ1NTX0NIQVRfSVRFTV9ERVRBSUxTID0gXCJvbGxhbWEtY2hhdC1pdGVtLWRldGFpbHNcIjtcbmNvbnN0IENTU19DSEFUX0lURU1fREFURSA9IFwib2xsYW1hLWNoYXQtaXRlbS1kYXRlXCI7XG5jb25zdCBDU1NfSElFUkFSQ0hZX0lURU1fT1BUSU9OUyA9IFwib2xsYW1hLWhpZXJhcmNoeS1pdGVtLW9wdGlvbnNcIjtcbmNvbnN0IENTU19ISUVSQVJDSFlfSU5ERU5UX1BSRUZJWCA9IFwib2xsYW1hLWluZGVudC1sZXZlbC1cIjtcbmNvbnN0IENTU19GT0xERVJfQUNUSVZFX0FOQ0VTVE9SID0gXCJpcy1hY3RpdmUtYW5jZXN0b3JcIjtcblxuLy8g0JzQtdC90Y4g0YLQsCDRltC90YjQtVxuY29uc3QgQ1NTX0NMQVNTX01FTlVfU0VQQVJBVE9SID0gXCJtZW51LXNlcGFyYXRvclwiO1xuXG4vLyDQhtC60L7QvdC60Lhcbi8vIGNvbnN0IENPTExBUFNFX0lDT05fUk9MRSA9IFwibHVjaWRlLWZvbGRlclwiOyAvLyDQl9Cw0LzRltC90LXQvdC+INC90LAg0YjQtdCy0YDQvtC90Lhcbi8vIGNvbnN0IEVYUEFORF9JQ09OX1JPTEUgPSBcImx1Y2lkZS1mb2xkZXItb3BlblwiOyAgIC8vINCX0LDQvNGW0L3QtdC90L4g0L3QsCDRiNC10LLRgNC+0L3QuFxuY29uc3QgQ09MTEFQU0VfSUNPTl9BQ0NPUkRJT04gPSBcImx1Y2lkZS1jaGV2cm9uLXJpZ2h0XCI7IC8vINCG0LrQvtC90LrQsCDQtNC70Y8g0LfQs9C+0YDQvdGD0YLQvtGXINGB0LXQutGG0ZbRl1xuY29uc3QgRVhQQU5EX0lDT05fQUNDT1JESU9OID0gXCJsdWNpZGUtY2hldnJvbi1kb3duXCI7IC8vINCG0LrQvtC90LrQsCDQtNC70Y8g0YDQvtC30LPQvtGA0L3Rg9GC0L7RlyDRgdC10LrRhtGW0ZdcbmNvbnN0IEZPTERFUl9JQ09OX0NMT1NFRCA9IFwibHVjaWRlLWZvbGRlclwiO1xuY29uc3QgRk9MREVSX0lDT05fT1BFTiA9IFwibHVjaWRlLWZvbGRlci1vcGVuXCI7XG5jb25zdCBDSEFUX0lDT04gPSBcImx1Y2lkZS1tZXNzYWdlLXNxdWFyZVwiO1xuY29uc3QgQ0hBVF9JQ09OX0FDVElWRSA9IFwibHVjaWRlLWNoZWNrXCI7XG5jb25zdCBDU1NfU0lERUJBUl9TRUNUSU9OX0lDT04gPSBcIm9sbGFtYS1zaWRlYmFyLXNlY3Rpb24taWNvblwiOyAvLyDQn9C+0LLQtdGA0YLQsNGU0LzQviDQutC70LDRgSDQu9GW0LLQvtGXINGW0LrQvtC90LrQuFxuLy8gLi4uXG5cbi8vIC0tLSDQhtC60L7QvdC60LggLS0tXG5jb25zdCBDSEFUU19TRUNUSU9OX0lDT04gPSBcImx1Y2lkZS1tZXNzYWdlcy1zcXVhcmVcIjsgLy8g0IbQutC+0L3QutCwINC00LvRjyDRgdC10LrRhtGW0ZcgQ2hhdHNcbmNvbnN0IFJPTEVTX1NFQ1RJT05fSUNPTiA9IFwibHVjaWRlLXVzZXJzXCI7IC8vINCG0LrQvtC90LrQsCDQtNC70Y8g0YHQtdC60YbRltGXIFJvbGVzXG5cbmV4cG9ydCBjbGFzcyBTaWRlYmFyTWFuYWdlciB7XG4gIHByaXZhdGUgcGx1Z2luOiBPbGxhbWFQbHVnaW47XG4gIHByaXZhdGUgYXBwOiBBcHA7XG4gIHByaXZhdGUgdmlldzogT2xsYW1hVmlldztcblxuICBwcml2YXRlIHJvb3REcm9wWm9uZUVsITogSFRNTEVsZW1lbnQ7IFxuXG4gIHByaXZhdGUgZHJhZ2dlZEl0ZW1EYXRhOiB7IHR5cGU6ICdjaGF0JyB8ICdmb2xkZXInOyBpZDogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgfSB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGNvbnRhaW5lckVsITogSFRNTEVsZW1lbnQ7XG4gIHByaXZhdGUgY2hhdFBhbmVsSGVhZGVyRWwhOiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSBjaGF0UGFuZWxMaXN0Q29udGFpbmVyRWwhOiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSBuZXdDaGF0U2lkZWJhckJ1dHRvbiE6IEhUTUxFbGVtZW50O1xuICBwcml2YXRlIG5ld0ZvbGRlclNpZGViYXJCdXR0b24hOiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSByb2xlUGFuZWxIZWFkZXJFbCE6IEhUTUxFbGVtZW50O1xuICBwcml2YXRlIHJvbGVQYW5lbExpc3RFbCE6IEhUTUxFbGVtZW50O1xuXG4gIHByaXZhdGUgZm9sZGVyRXhwYW5zaW9uU3RhdGU6IE1hcDxzdHJpbmcsIGJvb2xlYW4+ID0gbmV3IE1hcCgpO1xuICBwcml2YXRlIHVwZGF0ZUNvdW50ZXIgPSAwO1xuXG4gIGNvbnN0cnVjdG9yKHBsdWdpbjogT2xsYW1hUGx1Z2luLCBhcHA6IEFwcCwgdmlldzogT2xsYW1hVmlldykge1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICAgIHRoaXMuYXBwID0gYXBwO1xuICAgIHRoaXMudmlldyA9IHZpZXc7XG4gIH1cbiAgXG5wdWJsaWMgY3JlYXRlU2lkZWJhclVJKHBhcmVudEVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuICB0aGlzLmNvbnRhaW5lckVsID0gcGFyZW50RWxlbWVudC5jcmVhdGVEaXYoeyBjbHM6IENTU19TSURFQkFSX0NPTlRBSU5FUiB9KTtcblxuICAvLyAtLS0g0KHQtdC60YbRltGPINCn0LDRgtGW0LIgLS0tXG4gIGNvbnN0IGNoYXRQYW5lbCA9IHRoaXMuY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0hBVF9QQU5FTCB9KTtcblxuICAvLyDQl9Cw0LPQvtC70L7QstC+0Log0YHQtdC60YbRltGXINGH0LDRgtGW0LJcbiAgdGhpcy5jaGF0UGFuZWxIZWFkZXJFbCA9IGNoYXRQYW5lbC5jcmVhdGVEaXYoe1xuICAgIGNsczogW0NTU19TSURFQkFSX1NFQ1RJT05fSEVBREVSLCBDU1NfQ0xBU1NfTUVOVV9PUFRJT05dLFxuICAgIGF0dHI6IHsgXCJkYXRhLXNlY3Rpb24tdHlwZVwiOiBcImNoYXRzXCIsIFwiZGF0YS1jb2xsYXBzZWRcIjogXCJmYWxzZVwiIH0sIC8vINCX0LAg0LfQsNC80L7QstGH0YPQstCw0L3QvdGP0Lwg0YDQvtC30LPQvtGA0L3Rg9GC0L5cbiAgfSk7XG4gIGNvbnN0IGNoYXRIZWFkZXJMZWZ0ID0gdGhpcy5jaGF0UGFuZWxIZWFkZXJFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19TSURFQkFSX0hFQURFUl9MRUZUIH0pO1xuICBzZXRJY29uKGNoYXRIZWFkZXJMZWZ0LmNyZWF0ZVNwYW4oeyBjbHM6IENTU19TSURFQkFSX1NFQ1RJT05fSUNPTiB9KSwgQ0hBVFNfU0VDVElPTl9JQ09OKTtcbiAgY2hhdEhlYWRlckxlZnQuY3JlYXRlU3Bhbih7IGNsczogXCJtZW51LW9wdGlvbi10ZXh0XCIsIHRleHQ6IFwiQ2hhdHNcIiB9KTtcblxuICBjb25zdCBjaGF0SGVhZGVyQWN0aW9ucyA9IHRoaXMuY2hhdFBhbmVsSGVhZGVyRWwuY3JlYXRlRGl2KHsgY2xzOiBDU1NfU0lERUJBUl9IRUFERVJfQUNUSU9OUyB9KTtcbiAgLy8g0JrQvdC+0L/QutCwIFwi0J3QvtCy0LAg0L/QsNC/0LrQsFwiXG4gIHRoaXMubmV3Rm9sZGVyU2lkZWJhckJ1dHRvbiA9IGNoYXRIZWFkZXJBY3Rpb25zLmNyZWF0ZURpdih7XG4gICAgY2xzOiBbQ1NTX1NJREVCQVJfSEVBREVSX0JVVFRPTiwgXCJjbGlja2FibGUtaWNvblwiXSxcbiAgICBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIk5ldyBGb2xkZXJcIiwgdGl0bGU6IFwiTmV3IEZvbGRlclwiIH0sXG4gIH0pO1xuICBzZXRJY29uKHRoaXMubmV3Rm9sZGVyU2lkZWJhckJ1dHRvbiwgXCJsdWNpZGUtZm9sZGVyLXBsdXNcIik7XG4gIC8vINCa0L3QvtC/0LrQsCBcItCd0L7QstC40Lkg0YfQsNGCXCJcbiAgdGhpcy5uZXdDaGF0U2lkZWJhckJ1dHRvbiA9IGNoYXRIZWFkZXJBY3Rpb25zLmNyZWF0ZURpdih7XG4gICAgY2xzOiBbQ1NTX1NJREVCQVJfSEVBREVSX0JVVFRPTiwgXCJjbGlja2FibGUtaWNvblwiXSxcbiAgICBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIk5ldyBDaGF0XCIsIHRpdGxlOiBcIk5ldyBDaGF0XCIgfSxcbiAgfSk7XG4gIHNldEljb24odGhpcy5uZXdDaGF0U2lkZWJhckJ1dHRvbiwgXCJsdWNpZGUtcGx1cy1jaXJjbGVcIik7XG4gIC8vINCo0LXQstGA0L7QvSDQtNC70Y8g0YDQvtC30LPQvtGA0YLQsNC90L3Rjy/Qt9Cz0L7RgNGC0LDQvdC90Y8g0YHQtdC60YbRltGXINGH0LDRgtGW0LJcbiAgY29uc3QgY2hhdENoZXZyb24gPSBjaGF0SGVhZGVyQWN0aW9ucy5jcmVhdGVTcGFuKHsgY2xzOiBbQ1NTX1NFQ1RJT05fVE9HR0xFX0NIRVZST04sIFwiY2xpY2thYmxlLWljb25cIl0gfSk7XG4gIHNldEljb24oY2hhdENoZXZyb24sIEVYUEFORF9JQ09OX0FDQ09SRElPTik7IC8vINCG0LrQvtC90LrQsCDRgNC+0LfQs9C+0YDQvdGD0YLQvtGXINGB0LXQutGG0ZbRl1xuXG4gIC8vINCa0L7QvdGC0LXQudC90LXRgCDQtNC70Y8g0YHQv9C40YHQutGDINGH0LDRgtGW0LIg0YLQsCDQv9Cw0L/QvtC6XG4gIHRoaXMuY2hhdFBhbmVsTGlzdENvbnRhaW5lckVsID0gY2hhdFBhbmVsLmNyZWF0ZURpdih7XG4gICAgY2xzOiBbQ1NTX0NIQVRfTElTVF9DT05UQUlORVIsIENTU19TSURFQkFSX1NFQ1RJT05fQ09OVEVOVCwgQ1NTX0VYUEFOREVEX0NMQVNTXSwgLy8g0J/QvtGH0LjQvdCw0ZTQvNC+INC3INGA0L7Qt9Cz0L7RgNC90YPRgtC+0LPQviDRgdGC0LDQvdGDXG4gIH0pO1xuXG4gIC8vIC0tLSDQodCf0JXQptCG0JDQm9Cs0J3QkCDQl9Ce0J3QkCDQlNCb0K8g0KHQmtCY0JTQkNCd0J3QryDQkiDQmtCe0KDQhtCd0KwgLS0tXG4gIC8vINCm0LXQuSDQtdC70LXQvNC10L3RgiDQtNC+0LTQsNGU0YLRjNGB0Y8g0LLRgdC10YDQtdC00LjQvdGWIGNoYXRQYW5lbCwg0J/QhtCh0JvQryBjaGF0UGFuZWxMaXN0Q29udGFpbmVyRWxcbiAgdGhpcy5yb290RHJvcFpvbmVFbCA9IGNoYXRQYW5lbC5jcmVhdGVEaXYoeyBjbHM6ICdvbGxhbWEtcm9vdC1kcm9wLXpvbmUnIH0pO1xuICAvLyDQntC/0YbRltC+0L3QsNC70YzQvdC40Lkg0YLQtdC60YHRgi3Qv9GW0LTQutCw0LfQutCwICjQvNC+0LbQvdCwINGB0YLQuNC70ZbQt9GD0LLQsNGC0Lgg0YfQtdGA0LXQtyBDU1MgY29udGVudCDQsNCx0L4g0LTQvtC00LDRgtC4IHNwYW4pXG4gIC8vIHRoaXMucm9vdERyb3Bab25lRWwuY3JlYXRlU3Bhbih7IHRleHQ6IFwiRHJvcCBoZXJlIHRvIG1vdmUgdG8gcm9vdFwiIH0pO1xuXG4gIC8vINCf0YDQuNCyJ9GP0LfRg9GU0LzQviDQvtCx0YDQvtCx0L3QuNC60LggRHJhZy1hbmQtRHJvcCDQtNC+INGG0ZbRlNGXINGB0L/QtdGG0ZbQsNC70YzQvdC+0Zcg0LfQvtC90LhcbiAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5yb290RHJvcFpvbmVFbCwgJ2RyYWdvdmVyJywgdGhpcy5oYW5kbGVEcmFnT3ZlclJvb3Rab25lLmJpbmQodGhpcykpO1xuICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudCh0aGlzLnJvb3REcm9wWm9uZUVsLCAnZHJhZ2VudGVyJywgdGhpcy5oYW5kbGVEcmFnRW50ZXJSb290Wm9uZS5iaW5kKHRoaXMpKTtcbiAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5yb290RHJvcFpvbmVFbCwgJ2RyYWdsZWF2ZScsIHRoaXMuaGFuZGxlRHJhZ0xlYXZlUm9vdFpvbmUuYmluZCh0aGlzKSk7XG4gIHRoaXMudmlldy5yZWdpc3RlckRvbUV2ZW50KHRoaXMucm9vdERyb3Bab25lRWwsICdkcm9wJywgdGhpcy5oYW5kbGVEcm9wUm9vdFpvbmUuYmluZCh0aGlzKSk7XG4gIC8vIC0tLSDQmtCG0J3QldCm0Kwg0KHQn9CV0KbQhtCQ0JvQrNCd0J7QhyDQl9Ce0J3QmCAtLS1cblxuICAvLyAtLS0g0KHQtdC60YbRltGPINCg0L7Qu9C10LkgLS0tXG4gIGNvbnN0IHJvbGVQYW5lbCA9IHRoaXMuY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBDU1NfUk9MRV9QQU5FTCB9KTtcbiAgLy8g0JfQsNCz0L7Qu9C+0LLQvtC6INGB0LXQutGG0ZbRlyDRgNC+0LvQtdC5XG4gIHRoaXMucm9sZVBhbmVsSGVhZGVyRWwgPSByb2xlUGFuZWwuY3JlYXRlRGl2KHtcbiAgICBjbHM6IFtDU1NfU0lERUJBUl9TRUNUSU9OX0hFQURFUiwgQ1NTX0NMQVNTX01FTlVfT1BUSU9OXSxcbiAgICBhdHRyOiB7IFwiZGF0YS1zZWN0aW9uLXR5cGVcIjogXCJyb2xlc1wiLCBcImRhdGEtY29sbGFwc2VkXCI6IFwidHJ1ZVwiIH0sIC8vINCX0LAg0LfQsNC80L7QstGH0YPQstCw0L3QvdGP0Lwg0LfQs9C+0YDQvdGD0YLQvlxuICB9KTtcbiAgY29uc3Qgcm9sZUhlYWRlckxlZnQgPSB0aGlzLnJvbGVQYW5lbEhlYWRlckVsLmNyZWF0ZURpdih7IGNsczogQ1NTX1NJREVCQVJfSEVBREVSX0xFRlQgfSk7XG4gIHNldEljb24ocm9sZUhlYWRlckxlZnQuY3JlYXRlU3Bhbih7IGNsczogQ1NTX1NJREVCQVJfU0VDVElPTl9JQ09OIH0pLCBST0xFU19TRUNUSU9OX0lDT04pO1xuICByb2xlSGVhZGVyTGVmdC5jcmVhdGVTcGFuKHsgY2xzOiBcIm1lbnUtb3B0aW9uLXRleHRcIiwgdGV4dDogXCJSb2xlc1wiIH0pO1xuXG4gIGNvbnN0IHJvbGVIZWFkZXJBY3Rpb25zID0gdGhpcy5yb2xlUGFuZWxIZWFkZXJFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19TSURFQkFSX0hFQURFUl9BQ1RJT05TIH0pO1xuICAvLyDQqNC10LLRgNC+0L0g0LTQu9GPINGA0L7Qt9Cz0L7RgNGC0LDQvdC90Y8v0LfQs9C+0YDRgtCw0L3QvdGPINGB0LXQutGG0ZbRlyDRgNC+0LvQtdC5XG4gIGNvbnN0IHJvbGVDaGV2cm9uID0gcm9sZUhlYWRlckFjdGlvbnMuY3JlYXRlU3Bhbih7IGNsczogW0NTU19TRUNUSU9OX1RPR0dMRV9DSEVWUk9OLCBcImNsaWNrYWJsZS1pY29uXCJdIH0pO1xuICBzZXRJY29uKHJvbGVDaGV2cm9uLCBDT0xMQVBTRV9JQ09OX0FDQ09SRElPTik7IC8vINCG0LrQvtC90LrQsCDQt9Cz0L7RgNC90YPRgtC+0Zcg0YHQtdC60YbRltGXXG5cbiAgLy8g0JrQvtC90YLQtdC50L3QtdGAINC00LvRjyDRgdC/0LjRgdC60YMg0YDQvtC70LXQuVxuICB0aGlzLnJvbGVQYW5lbExpc3RFbCA9IHJvbGVQYW5lbC5jcmVhdGVEaXYoe1xuICAgICAgY2xzOiBbQ1NTX1JPTEVfUEFORUxfTElTVCwgQ1NTX1NJREVCQVJfU0VDVElPTl9DT05URU5UXSAvLyDQl9CwINC30LDQvNC+0LLRh9GD0LLQsNC90L3Rj9C8INC/0YDQuNGF0L7QstCw0L3QvlxuICB9KTtcbiAgLy8g0JTQvtC00LDRlNC80L4g0LrQu9Cw0YEg0LTQu9GPINC/0YDQuNGF0L7QstGD0LLQsNC90L3Rjywg0Y/QutGJ0L4g0YHQtdC60YbRltGPINC30LPQvtGA0L3Rg9GC0LBcbiAgaWYgKHRoaXMucm9sZVBhbmVsSGVhZGVyRWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1jb2xsYXBzZWRcIikgPT09IFwidHJ1ZVwiKSB7XG4gICAgICB0aGlzLnJvbGVQYW5lbExpc3RFbC5hZGRDbGFzcyhDU1NfU0lERUJBUl9TRUNUSU9OX0NPTlRFTlRfSElEREVOKTtcbiAgfVxuXG4gIC8vINCf0YDQuNCyJ9GP0LfRg9GU0LzQviDQvtGB0L3QvtCy0L3RliDRgdC70YPRhdCw0YfRliDQv9C+0LTRltC5INC00LvRjyDRgdCw0LnQtNCx0LDRgNGDICjQutC70ZbQutC4INC90LAg0LfQsNCz0L7Qu9C+0LLQutC4INGB0LXQutGG0ZbQuSwg0LrQvdC+0L/QutC4IFwi0L3QvtCy0LjQuSDRh9Cw0YIv0L/QsNC/0LrQsFwiKVxuICB0aGlzLmF0dGFjaFNpZGViYXJFdmVudExpc3RlbmVycygpO1xuXG4gIC8vINCf0L7Rh9Cw0YLQutC+0LLQtSDQt9Cw0L/QvtCy0L3QtdC90L3RjyDRgdC/0LjRgdC60YMg0YfQsNGC0ZbQsiwg0Y/QutGJ0L4g0YHQtdC60YbRltGPINCy0LjQtNC40LzQsCAo0LfQsCDQt9Cw0LzQvtCy0YfRg9Cy0LDQvdC90Y/QvCDQstC+0L3QsCDQstC40LTQuNC80LApXG4gIGlmICh0aGlzLmlzU2VjdGlvblZpc2libGUoXCJjaGF0c1wiKSkge1xuICAgdGhpcy51cGRhdGVDaGF0TGlzdCgpO1xuICB9IGVsc2Uge1xuICAgICAgICB9XG4gIC8vINCf0L7Rh9Cw0YLQutC+0LLQtSDQt9Cw0L/QvtCy0L3QtdC90L3RjyDRgdC/0LjRgdC60YMg0YDQvtC70LXQuSwg0Y/QutGJ0L4g0YHQtdC60YbRltGPINCy0LjQtNC40LzQsCAo0LfQsCDQt9Cw0LzQvtCy0YfRg9Cy0LDQvdC90Y/QvCDQstC+0L3QsCDQt9Cz0L7RgNC90YPRgtCwKVxuICBpZiAodGhpcy5pc1NlY3Rpb25WaXNpYmxlKFwicm9sZXNcIikpIHtcbiAgICAgICAgdGhpcy51cGRhdGVSb2xlTGlzdCgpO1xuICB9IGVsc2Uge1xuICAgICAgICB9XG5cbiAgcmV0dXJuIHRoaXMuY29udGFpbmVyRWw7XG59IC8vIC0tLSDQmtGW0L3QtdGG0YwgY3JlYXRlU2lkZWJhclVJIC0tLVxuICBwcml2YXRlIGF0dGFjaFNpZGViYXJFdmVudExpc3RlbmVycygpOiB2b2lkIHtcbiAgICBpZiAoXG4gICAgICAhdGhpcy5jaGF0UGFuZWxIZWFkZXJFbCB8fFxuICAgICAgIXRoaXMucm9sZVBhbmVsSGVhZGVyRWwgfHxcbiAgICAgICF0aGlzLm5ld0NoYXRTaWRlYmFyQnV0dG9uIHx8XG4gICAgICAhdGhpcy5uZXdGb2xkZXJTaWRlYmFyQnV0dG9uXG4gICAgKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vINCa0LvRltC6INC90LAg0LLQtdGB0Ywg0LfQsNCz0L7Qu9C+0LLQvtC6ICjQstC60LvRjtGH0LDRjtGH0Lgg0YjQtdCy0YDQvtC9KSDRgtC10L/QtdGAINC/0LXRgNC10LzQuNC60LDRlCDRgdC10LrRhtGW0Y5cbiAgICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudCh0aGlzLmNoYXRQYW5lbEhlYWRlckVsLCBcImNsaWNrXCIsICgpID0+IHRoaXMudG9nZ2xlU2VjdGlvbih0aGlzLmNoYXRQYW5lbEhlYWRlckVsKSk7XG4gICAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5yb2xlUGFuZWxIZWFkZXJFbCwgXCJjbGlja1wiLCAoKSA9PiB0aGlzLnRvZ2dsZVNlY3Rpb24odGhpcy5yb2xlUGFuZWxIZWFkZXJFbCkpO1xuXG4gICAgLy8g0JrQu9GW0LrQuCDQvdCwINC60L3QvtC/0LrQuCDQtNGW0LkgKNC30LDQv9C+0LHRltCz0LDRlNC80L4g0YHQv9C70LjQstCw0L3QvdGOLCDRidC+0LEg0L3QtSDQt9Cz0L7RgNC90YPRgtC4INGB0LXQutGG0ZbRjilcbiAgICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudCh0aGlzLm5ld0NoYXRTaWRlYmFyQnV0dG9uLCBcImNsaWNrXCIsIGUgPT4ge1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIHRoaXMuaGFuZGxlTmV3Q2hhdENsaWNrKHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmNoYXRzRm9sZGVyUGF0aCk7XG4gICAgfSk7XG4gICAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5uZXdGb2xkZXJTaWRlYmFyQnV0dG9uLCBcImNsaWNrXCIsIGUgPT4ge1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIHRoaXMuaGFuZGxlTmV3Rm9sZGVyQ2xpY2sodGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2hhdHNGb2xkZXJQYXRoKTtcbiAgICB9KTtcbiAgfVxuXG4gIHB1YmxpYyBpc1NlY3Rpb25WaXNpYmxlKHR5cGU6IFwiY2hhdHNcIiB8IFwicm9sZXNcIik6IGJvb2xlYW4ge1xuICAgIGNvbnN0IGhlYWRlckVsID0gdHlwZSA9PT0gXCJjaGF0c1wiID8gdGhpcy5jaGF0UGFuZWxIZWFkZXJFbCA6IHRoaXMucm9sZVBhbmVsSGVhZGVyRWw7XG4gICAgcmV0dXJuIGhlYWRlckVsPy5nZXRBdHRyaWJ1dGUoXCJkYXRhLWNvbGxhcHNlZFwiKSA9PT0gXCJmYWxzZVwiO1xuICB9XG5cbiAgcHVibGljIHVwZGF0ZUNoYXRMaXN0ID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgIHRoaXMudXBkYXRlQ291bnRlcisrO1xuICAgIGNvbnN0IGN1cnJlbnRVcGRhdGVJZCA9IHRoaXMudXBkYXRlQ291bnRlcjtcbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLmNoYXRQYW5lbExpc3RDb250YWluZXJFbDtcbiAgICBpZiAoIWNvbnRhaW5lciB8fCAhdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgICAgIGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwiaXMtbG9hZGluZ1wiKTsgLy8g0JTQvtC00LDRlNC80L4g0LrQu9Cw0YEg0LfQsNCy0LDQvdGC0LDQttC10L3QvdGPXG4gICAgY29uc3QgY3VycmVudFNjcm9sbFRvcCA9IGNvbnRhaW5lci5zY3JvbGxUb3A7XG4gICAgY29udGFpbmVyLmVtcHR5KCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldENoYXRIaWVyYXJjaHkoKTtcbiAgICAgIGNvbnN0IGN1cnJlbnRBY3RpdmVDaGF0SWQgPSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRBY3RpdmVDaGF0SWQoKTtcbiAgICAgIGNvbnN0IGFjdGl2ZUFuY2VzdG9yUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICAgIGlmIChjdXJyZW50QWN0aXZlQ2hhdElkKSB7XG4gICAgICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRBY3RpdmVDaGF0KCk7XG4gICAgICAgIGlmIChhY3RpdmVDaGF0Py5maWxlUGF0aCkge1xuICAgICAgICAgIGxldCBjdXJyZW50UGF0aCA9IGFjdGl2ZUNoYXQuZmlsZVBhdGg7XG4gICAgICAgICAgd2hpbGUgKGN1cnJlbnRQYXRoLmluY2x1ZGVzKFwiL1wiKSkge1xuICAgICAgICAgICAgY29uc3QgcGFyZW50UGF0aCA9IGN1cnJlbnRQYXRoLnN1YnN0cmluZygwLCBjdXJyZW50UGF0aC5sYXN0SW5kZXhPZihcIi9cIikpO1xuICAgICAgICAgICAgaWYgKHBhcmVudFBhdGggPT09IFwiXCIpIHtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjb25zdCBub3JtYWxpemVkUGFyZW50UGF0aCA9IG5vcm1hbGl6ZVBhdGgocGFyZW50UGF0aCk7XG4gICAgICAgICAgICAgIGFjdGl2ZUFuY2VzdG9yUGF0aHMuYWRkKG5vcm1hbGl6ZWRQYXJlbnRQYXRoKTtcbiAgICAgICAgICAgICAgY3VycmVudFBhdGggPSBwYXJlbnRQYXRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChhY3RpdmVDaGF0KSB7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChoaWVyYXJjaHkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibWVudS1pbmZvLXRleHRcIiwgdGV4dDogXCJObyBzYXZlZCBjaGF0cyBvciBmb2xkZXJzIHlldC5cIiB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGhpZXJhcmNoeS5mb3JFYWNoKG5vZGUgPT5cbiAgICAgICAgICB0aGlzLnJlbmRlckhpZXJhcmNoeU5vZGUobm9kZSwgY29udGFpbmVyLCAwLCBjdXJyZW50QWN0aXZlQ2hhdElkLCBhY3RpdmVBbmNlc3RvclBhdGhzLCBjdXJyZW50VXBkYXRlSWQpXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnRhaW5lci5lbXB0eSgpO1xuICAgICAgY29udGFpbmVyLmNyZWF0ZURpdih7IHRleHQ6IFwiRXJyb3IgbG9hZGluZyBjaGF0IHN0cnVjdHVyZS5cIiwgY2xzOiBcIm1lbnUtZXJyb3ItdGV4dFwiIH0pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShcImlzLWxvYWRpbmdcIik7XG4gICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgICBpZiAoY29udGFpbmVyPy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgIGNvbnRhaW5lci5zY3JvbGxUb3AgPSBjdXJyZW50U2Nyb2xsVG9wO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG5cbiAgLy8gc3JjL1NpZGViYXJNYW5hZ2VyLnRzXG5cbnByaXZhdGUgcmVuZGVySGllcmFyY2h5Tm9kZShcbiAgbm9kZTogSGllcmFyY2h5Tm9kZSwgICAgICAgICAgLy8g0JLRg9C30L7QuyDRltGU0YDQsNGA0YXRltGXICjQv9Cw0L/QutCwINCw0LHQviDRh9Cw0YIpXG4gIHBhcmVudEVsZW1lbnQ6IEhUTUxFbGVtZW50LCAgIC8vINCR0LDRgtGM0LrRltCy0YHRjNC60LjQuSBIVE1MINC10LvQtdC80LXQvdGCXG4gIGxldmVsOiBudW1iZXIsICAgICAgICAgICAgICAgIC8vINCg0ZbQstC10L3RjCDQstC60LvQsNC00LXQvdC+0YHRgtGWXG4gIGFjdGl2ZUNoYXRJZDogc3RyaW5nIHwgbnVsbCwgIC8vIElEINC/0L7RgtC+0YfQvdC+0LPQviDQsNC60YLQuNCy0L3QvtCz0L4g0YfQsNGC0YNcbiAgYWN0aXZlQW5jZXN0b3JQYXRoczogU2V0PHN0cmluZz4sIC8vINCo0LvRj9GF0Lgg0LTQviDQsNC60YLQuNCy0L3QuNGFINCx0LDRgtGM0LrRltCy0YHRjNC60LjRhSDQv9Cw0L/QvtC6XG4gIHVwZGF0ZUlkOiBudW1iZXIgICAgICAgICAgICAgIC8vIElEINC/0L7RgtC+0YfQvdC+0LPQviDQvtC90L7QstC70LXQvdC90Y8gKNC00LvRjyDQu9C+0LPRltCyKVxuKTogdm9pZCB7XG4gIC8vINCh0YLQstC+0YDRjtGU0LzQviDQvtGB0L3QvtCy0L3QuNC5INC60L7QvdGC0LXQudC90LXRgCDQtNC70Y8g0LXQu9C10LzQtdC90YLQsCDRgdC/0LjRgdC60YNcbiAgY29uc3QgaXRlbUVsID0gcGFyZW50RWxlbWVudC5jcmVhdGVEaXYoeyBjbHM6IFtDU1NfSElFUkFSQ0hZX0lURU0sIGAke0NTU19ISUVSQVJDSFlfSU5ERU5UX1BSRUZJWH0ke2xldmVsfWBdIH0pO1xuICAvLyDQodGC0LLQvtGA0Y7RlNC80L4g0LLQvdGD0YLRgNGW0YjQvdGW0Lkg0LrQvtC90YLQtdC50L3QtdGAINC00LvRjyDQutC+0L3RgtC10L3RgtGDICjRltC60L7QvdC60LAsINGC0LXQutGB0YIsINC60L3QvtC/0LrQuClcbiAgY29uc3QgaXRlbUNvbnRlbnRFbCA9IGl0ZW1FbC5jcmVhdGVEaXYoeyBjbHM6IENTU19ISUVSQVJDSFlfSVRFTV9DT05URU5UIH0pO1xuXG4gIC8vIC0tLSBEcmFnLWFuZC1Ecm9wOiDQoNC+0LHQuNC80L4g0LXQu9C10LzQtdC90YIg0L/QtdGA0LXRgtGP0LPRg9Cy0LDQvdC40Lwg0YLQsCDQtNC+0LTQsNGU0LzQviDRgdC70YPRhdCw0YfRliAtLS1cbiAgaXRlbUVsLnNldEF0dHIoJ2RyYWdnYWJsZScsICd0cnVlJyk7XG4gIC8vINCf0L7Rh9Cw0YLQvtC6INC/0LXRgNC10YLRj9Cz0YPQstCw0L3QvdGPIC0g0LfQsdC10YDRltCz0LDRlNC80L4g0LTQsNC90ZYg0L/RgNC+INC10LvQtdC80LXQvdGCXG4gIHRoaXMudmlldy5yZWdpc3RlckRvbUV2ZW50KGl0ZW1FbCwgJ2RyYWdzdGFydCcsIChlKSA9PiB0aGlzLmhhbmRsZURyYWdTdGFydChlLCBub2RlKSk7XG4gIC8vINCa0ZbQvdC10YbRjCDQv9C10YDQtdGC0Y/Qs9GD0LLQsNC90L3RjyAo0YPRgdC/0ZbRiNC90LUg0YfQuCDQvdGWKSAtINC+0YfQuNGJ0LDRlNC80L4g0YHRgtC40LvRli/QtNCw0L3RllxuICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudChpdGVtRWwsICdkcmFnZW5kJywgKGUpID0+IHRoaXMuaGFuZGxlRHJhZ0VuZChlKSk7XG4gIC8vIC0tLSDQmtGW0L3QtdGG0YwgRHJhZy1hbmQtRHJvcCDQtNC70Y8g0LXQu9C10LzQtdC90YLQsCwg0YnQviDQv9C10YDQtdGC0Y/Qs9GD0ZTRgtGM0YHRjyAtLS1cblxuICAvLyAtLS0g0JvQvtCz0ZbQutCwINC00LvRjyDQn9CQ0J/QntCaIC0tLVxuICBpZiAobm9kZS50eXBlID09PSAnZm9sZGVyJykge1xuICAgICAgaXRlbUVsLmFkZENsYXNzKENTU19GT0xERVJfSVRFTSk7XG4gICAgICBpdGVtRWwuZGF0YXNldC5wYXRoID0gbm9kZS5wYXRoOyAvLyDQl9Cx0LXRgNGW0LPQsNGU0LzQviDRiNC70Y/RhSDQv9Cw0L/QutC4INC00LvRjyDRltC00LXQvdGC0LjRhNGW0LrQsNGG0ZbRl1xuICAgICAgY29uc3QgaXNFeHBhbmRlZCA9IHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuZ2V0KG5vZGUucGF0aCkgPz8gZmFsc2U7XG4gICAgICBpZiAoIWlzRXhwYW5kZWQpIHtcbiAgICAgICAgICBpdGVtRWwuYWRkQ2xhc3MoQ1NTX0hJRVJBUkNIWV9JVEVNX0NPTExBUFNFRCk7IC8vINCa0LvQsNGBINC00LvRjyDQt9Cz0L7RgNC90YPRgtC+0Zcg0L/QsNC/0LrQuFxuICAgICAgfVxuICAgICAgaWYgKGFjdGl2ZUFuY2VzdG9yUGF0aHMuaGFzKG5vZGUucGF0aCkpIHtcbiAgICAgICAgICBpdGVtRWwuYWRkQ2xhc3MoQ1NTX0ZPTERFUl9BQ1RJVkVfQU5DRVNUT1IpOyAvLyDQmtC70LDRgSDQtNC70Y8g0LDQutGC0LjQstC90L7Qs9C+INC/0YDQtdC00LrQsFxuICAgICAgfVxuXG4gICAgICAvLyDQhtC60L7QvdC60LAg0L/QsNC/0LrQuCAo0LLRltC00LrRgNC40YLQsC/Qt9Cw0LrRgNC40YLQsClcbiAgICAgIGNvbnN0IGZvbGRlckljb24gPSBpdGVtQ29udGVudEVsLmNyZWF0ZVNwYW4oeyBjbHM6IENTU19GT0xERVJfSUNPTiB9KTtcbiAgICAgIHNldEljb24oZm9sZGVySWNvbiwgaXNFeHBhbmRlZCA/IEZPTERFUl9JQ09OX09QRU4gOiBGT0xERVJfSUNPTl9DTE9TRUQpO1xuICAgICAgLy8g0J3QsNC30LLQsCDQv9Cw0L/QutC4XG4gICAgICBpdGVtQ29udGVudEVsLmNyZWF0ZVNwYW4oeyBjbHM6IENTU19ISUVSQVJDSFlfSVRFTV9URVhULCB0ZXh0OiBub2RlLm5hbWUgfSk7XG5cbiAgICAgIC8vINCa0L3QvtC/0LrQsCBcIi4uLlwiICjQvtC/0YbRltGXINC/0LDQv9C60LgpXG4gICAgICBjb25zdCBvcHRpb25zQnRuID0gaXRlbUNvbnRlbnRFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG4gICAgICAgICAgY2xzOiBbQ1NTX0hJRVJBUkNIWV9JVEVNX09QVElPTlMsIFwiY2xpY2thYmxlLWljb25cIl0sXG4gICAgICAgICAgYXR0cjogeyBcImFyaWEtbGFiZWxcIjogXCJGb2xkZXIgb3B0aW9uc1wiLCB0aXRsZTogXCJNb3JlIG9wdGlvbnNcIiB9LFxuICAgICAgfSk7XG4gICAgICBzZXRJY29uKG9wdGlvbnNCdG4sIFwibHVjaWRlLW1vcmUtaG9yaXpvbnRhbFwiKTtcbiAgICAgIC8vINCe0LHRgNC+0LHQvdC40Log0LrQu9GW0LrRgyDQvdCwINC60L3QvtC/0LrRgyDQvtC/0YbRltC5XG4gICAgICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudChvcHRpb25zQnRuLCBcImNsaWNrXCIsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTsgLy8g0JfRg9C/0LjQvdGP0ZTQvNC+INGB0L/Qu9C40LLQsNC90L3Rjywg0YnQvtCxINC90LUg0YHQv9GA0LDRhtGO0LLQsNCyINC60LvRltC6INC90LAg0L/QsNC/0LrRg1xuICAgICAgICAgIHRoaXMuc2hvd0ZvbGRlckNvbnRleHRNZW51KGUsIG5vZGUpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIC0tLSBEcmFnLWFuZC1Ecm9wOiDQlNC+0LTQsNGU0LzQviDRgdC70YPRhdCw0YfRliDQtNC70Y8g0L/QsNC/0LrQuCDRj9C6INCm0IbQm9CGINGB0LrQuNC00LDQvdC90Y8gLS0tXG4gICAgICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudChpdGVtRWwsICdkcmFnb3ZlcicsIHRoaXMuaGFuZGxlRHJhZ092ZXIpO1xuICAgICAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQoaXRlbUVsLCAnZHJhZ2VudGVyJywgKGUpID0+IHRoaXMuaGFuZGxlRHJhZ0VudGVyKGUsIG5vZGUpKTtcbiAgICAgIHRoaXMudmlldy5yZWdpc3RlckRvbUV2ZW50KGl0ZW1FbCwgJ2RyYWdsZWF2ZScsIHRoaXMuaGFuZGxlRHJhZ0xlYXZlKTtcbiAgICAgIHRoaXMudmlldy5yZWdpc3RlckRvbUV2ZW50KGl0ZW1FbCwgJ2Ryb3AnLCAoZSkgPT4gdGhpcy5oYW5kbGVEcm9wKGUsIG5vZGUpKTtcbiAgICAgIC8vIC0tLSDQmtGW0L3QtdGG0YwgRHJhZy1hbmQtRHJvcCDQtNC70Y8g0YbRltC70ZYg0YHQutC40LTQsNC90L3RjyAtLS1cblxuICAgICAgLy8g0J7QsdGA0L7QsdC90LjQuiDQutC+0L3RgtC10LrRgdGC0L3QvtCz0L4g0LzQtdC90Y4g0L3QsCDQstGB0Y4g0L/QsNC/0LrRg1xuICAgICAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQoaXRlbUNvbnRlbnRFbCwgXCJjb250ZXh0bWVudVwiLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICB0aGlzLnNob3dGb2xkZXJDb250ZXh0TWVudShlLCBub2RlKTtcbiAgICAgIH0pO1xuICAgICAgLy8g0J7QsdGA0L7QsdC90LjQuiDQutC70ZbQutGDINC90LAg0L/QsNC/0LrRgyAo0LTQu9GPINGA0L7Qt9Cz0L7RgNGC0LDQvdC90Y8v0LfQs9C+0YDRgtCw0L3QvdGPKVxuICAgICAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQoaXRlbUNvbnRlbnRFbCwgXCJjbGlja1wiLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgLy8g0J/QtdGA0LXQstGW0YDRj9GU0LzQviwg0YfQuCDQutC70ZbQuiDQsdGD0LIg0L3QtSDQvdCwINC60L3QvtC/0YbRliDQvtC/0YbRltC5XG4gICAgICAgICBpZiAoZS50YXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50ICYmICFlLnRhcmdldC5jbG9zZXN0KGAuJHtDU1NfSElFUkFSQ0hZX0lURU1fT1BUSU9OU31gKSkge1xuICAgICAgICAgICAgIHRoaXMuaGFuZGxlVG9nZ2xlRm9sZGVyKG5vZGUucGF0aCk7XG4gICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8g0KHRgtCy0L7RgNGO0ZTQvNC+INC60L7QvdGC0LXQudC90LXRgCDQtNC70Y8g0LTQvtGH0ZbRgNC90ZbRhSDQtdC70LXQvNC10L3RgtGW0LJcbiAgICAgIGNvbnN0IGNoaWxkcmVuQ29udGFpbmVyID0gaXRlbUVsLmNyZWF0ZURpdih7IGNsczogQ1NTX0hJRVJBUkNIWV9JVEVNX0NISUxEUkVOIH0pO1xuICAgICAgLy8g0KDQtdC60YPRgNGB0LjQstC90L4g0YDQtdC90LTQtdGA0LjQvNC+INC00L7Rh9GW0YDQvdGWINC10LvQtdC80LXQvdGC0LgsINGP0LrRidC+INCy0L7QvdC4INGUXG4gICAgICBpZiAobm9kZS5jaGlsZHJlbiAmJiBub2RlLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBub2RlLmNoaWxkcmVuLmZvckVhY2goY2hpbGROb2RlID0+XG4gICAgICAgICAgdGhpcy5yZW5kZXJIaWVyYXJjaHlOb2RlKGNoaWxkTm9kZSwgY2hpbGRyZW5Db250YWluZXIsIGxldmVsICsgMSwgYWN0aXZlQ2hhdElkLCBhY3RpdmVBbmNlc3RvclBhdGhzLCB1cGRhdGVJZClcbiAgICAgICAgICApO1xuICAgICAgfVxuICB9XG4gIC8vIC0tLSDQm9C+0LPRltC60LAg0LTQu9GPINCn0JDQotCG0JIgLS0tXG4gIGVsc2UgaWYgKG5vZGUudHlwZSA9PT0gJ2NoYXQnKSB7XG4gICAgICBpdGVtRWwuYWRkQ2xhc3MoQ1NTX0NIQVRfSVRFTSk7XG4gICAgICBjb25zdCBjaGF0TWV0YSA9IG5vZGUubWV0YWRhdGE7XG4gICAgICBpdGVtRWwuZGF0YXNldC5jaGF0SWQgPSBjaGF0TWV0YS5pZDsgLy8g0JfQsdC10YDRltCz0LDRlNC80L4gSUQg0YfQsNGC0YNcbiAgICAgIGl0ZW1FbC5kYXRhc2V0LmZpbGVQYXRoID0gbm9kZS5maWxlUGF0aDsgLy8g0JfQsdC10YDRltCz0LDRlNC80L4g0YjQu9GP0YUg0LTQviDRhNCw0LnQu9GDINGH0LDRgtGDXG5cbiAgICAgIC8vINCf0LXRgNC10LLRltGA0LrQsCwg0YfQuCDRh9Cw0YIg0LDQutGC0LjQstC90LjQuVxuICAgICAgY29uc3QgaXNBY3RpdmUgPSBjaGF0TWV0YS5pZCA9PT0gYWN0aXZlQ2hhdElkO1xuICAgICAgaWYgKGlzQWN0aXZlKSB7XG4gICAgICAgICAgaXRlbUVsLmFkZENsYXNzKENTU19ST0xFX1BBTkVMX0lURU1fQUNUSVZFKTsgLy8g0JrQu9Cw0YEg0LTQu9GPINCw0LrRgtC40LLQvdC+0LPQviDRh9Cw0YLRg1xuICAgICAgfVxuXG4gICAgICAvLyDQhtC60L7QvdC60LAg0YfQsNGC0YMgKNC30LLQuNGH0LDQudC90LAg0LDQsdC+INCw0LrRgtC40LLQvdCwKVxuICAgICAgY29uc3QgY2hhdEljb24gPSBpdGVtQ29udGVudEVsLmNyZWF0ZVNwYW4oeyBjbHM6IENTU19GT0xERVJfSUNPTiB9KTsgLy8g0JzQvtC20LvQuNCy0L4sINCy0LDRgNGC0L4g0LfQvNGW0L3QuNGC0Lgg0LrQu9Cw0YFcbiAgICAgIHNldEljb24oY2hhdEljb24sIGlzQWN0aXZlID8gQ0hBVF9JQ09OX0FDVElWRSA6IENIQVRfSUNPTik7XG4gICAgICAvLyDQndCw0LfQstCwINGH0LDRgtGDXG4gICAgICBpdGVtQ29udGVudEVsLmNyZWF0ZVNwYW4oeyBjbHM6IENTU19ISUVSQVJDSFlfSVRFTV9URVhULCB0ZXh0OiBjaGF0TWV0YS5uYW1lIH0pO1xuXG4gICAgICAvLyDQmtC+0L3RgtC10LnQvdC10YAg0LTQu9GPINC00LXRgtCw0LvQtdC5ICjQtNCw0YLQsClcbiAgICAgIGNvbnN0IGRldGFpbHNXcmFwcGVyID0gaXRlbUNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19DSEFUX0lURU1fREVUQUlMUyB9KTtcbiAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgbGFzdE1vZGlmaWVkRGF0ZSA9IG5ldyBEYXRlKGNoYXRNZXRhLmxhc3RNb2RpZmllZCk7XG4gICAgICAgICAgY29uc3QgZGF0ZVRleHQgPSAhaXNOYU4obGFzdE1vZGlmaWVkRGF0ZS5nZXRUaW1lKCkpXG4gICAgICAgICAgPyB0aGlzLmZvcm1hdFJlbGF0aXZlRGF0ZShsYXN0TW9kaWZpZWREYXRlKSAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INCy0ZbQtNC90L7RgdC90YMg0LTQsNGC0YNcbiAgICAgICAgICA6IFwiSW52YWxpZCBkYXRlXCI7XG4gICAgICAgICAgaWYgKGRhdGVUZXh0ID09PSBcIkludmFsaWQgZGF0ZVwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgIGRldGFpbHNXcmFwcGVyLmNyZWF0ZURpdih7IGNsczogQ1NTX0NIQVRfSVRFTV9EQVRFLCB0ZXh0OiBkYXRlVGV4dCB9KTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZGV0YWlsc1dyYXBwZXIuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0hBVF9JVEVNX0RBVEUsIHRleHQ6IFwiRGF0ZSBlcnJvclwiIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyDQmtC90L7Qv9C60LAgXCIuLi5cIiAo0L7Qv9GG0ZbRlyDRh9Cw0YLRgylcbiAgICAgIGNvbnN0IG9wdGlvbnNCdG4gPSBpdGVtQ29udGVudEVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcbiAgICAgICAgICBjbHM6IFtDU1NfSElFUkFSQ0hZX0lURU1fT1BUSU9OUywgXCJjbGlja2FibGUtaWNvblwiXSxcbiAgICAgICAgICBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIkNoYXQgb3B0aW9uc1wiLCB0aXRsZTogXCJNb3JlIG9wdGlvbnNcIiB9LFxuICAgICAgfSk7XG4gICAgICBzZXRJY29uKG9wdGlvbnNCdG4sIFwibHVjaWRlLW1vcmUtaG9yaXpvbnRhbFwiKTtcbiAgICAgIC8vINCe0LHRgNC+0LHQvdC40Log0LrQu9GW0LrRgyDQvdCwINC60L3QvtC/0LrRgyDQvtC/0YbRltC5XG4gICAgICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudChvcHRpb25zQnRuLCBcImNsaWNrXCIsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTsgLy8g0JfRg9C/0LjQvdGP0ZTQvNC+INGB0L/Qu9C40LLQsNC90L3Rj1xuICAgICAgICAgIHRoaXMuc2hvd0NoYXRDb250ZXh0TWVudShlLCBjaGF0TWV0YSk7XG4gICAgICB9KTtcblxuICAgICAgLy8g0J7QsdGA0L7QsdC90LjQuiDQutC70ZbQutGDINC90LAg0YfQsNGCICjQtNC70Y8g0LDQutGC0LjQstCw0YbRltGXKVxuICAgICAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQoaXRlbUNvbnRlbnRFbCwgXCJjbGlja1wiLCBhc3luYyAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgIC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4sINGH0Lgg0LrQu9GW0Log0LHRg9CyINC90LUg0L3QsCDQutC90L7Qv9GG0ZYg0L7Qv9GG0ZbQuVxuICAgICAgICAgIGlmIChlLnRhcmdldCBpbnN0YW5jZW9mIEVsZW1lbnQgJiYgIWUudGFyZ2V0LmNsb3Nlc3QoYC4ke0NTU19ISUVSQVJDSFlfSVRFTV9PUFRJT05TfWApKSB7XG4gICAgICAgICAgICAgIGlmIChjaGF0TWV0YS5pZCAhPT0gYWN0aXZlQ2hhdElkKSB7XG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5zZXRBY3RpdmVDaGF0KGNoYXRNZXRhLmlkKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgLy8g0J7QsdGA0L7QsdC90LjQuiDQutC+0L3RgtC10LrRgdGC0L3QvtCz0L4g0LzQtdC90Y4g0L3QsCDRh9Cw0YJcbiAgICAgIHRoaXMudmlldy5yZWdpc3RlckRvbUV2ZW50KGl0ZW1Db250ZW50RWwsIFwiY29udGV4dG1lbnVcIiwgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgdGhpcy5zaG93Q2hhdENvbnRleHRNZW51KGUsIGNoYXRNZXRhKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyDQp9Cw0YIg0L3QtSDQvNC+0LbQtSDQsdGD0YLQuCDRhtGW0LvQu9GOINC00LvRjyDRgdC60LjQtNCw0L3QvdGPIChkcm9wIHRhcmdldCksINGC0L7QvNGDINC+0LHRgNC+0LHQvdC40LrQuCAnZHJhZ292ZXInLCAnZHJvcCcgZXRjLiDQvdC1INC00L7QtNCw0Y7RgtGM0YHRjy5cbiAgfVxufSAvLyAtLS0g0JrRltC90LXRhtGMINC80LXRgtC+0LTRgyByZW5kZXJIaWVyYXJjaHlOb2RlIC0tLVxuXG4gIHByaXZhdGUgaGFuZGxlVG9nZ2xlRm9sZGVyKGZvbGRlclBhdGg6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuZ2V0KGZvbGRlclBhdGgpID8/IGZhbHNlO1xuICAgIGNvbnN0IG5ld1N0YXRlID0gIWN1cnJlbnRTdGF0ZTtcbiAgICB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLnNldChmb2xkZXJQYXRoLCBuZXdTdGF0ZSk7XG5cbiAgICBjb25zdCBmb2xkZXJJdGVtRWwgPSB0aGlzLmNoYXRQYW5lbExpc3RDb250YWluZXJFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAgIGAub2xsYW1hLWZvbGRlci1pdGVtW2RhdGEtcGF0aD1cIiR7Zm9sZGVyUGF0aH1cIl1gXG4gICAgKTtcbiAgICBpZiAoIWZvbGRlckl0ZW1FbCkge1xuICAgICAgdGhpcy51cGRhdGVDaGF0TGlzdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb2xkZXJJdGVtRWwuY2xhc3NMaXN0LnRvZ2dsZShDU1NfSElFUkFSQ0hZX0lURU1fQ09MTEFQU0VELCAhbmV3U3RhdGUpO1xuICAgIGNvbnN0IGZvbGRlckljb25FbCA9IGZvbGRlckl0ZW1FbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIi5cIiArIENTU19GT0xERVJfSUNPTik7XG4gICAgaWYgKGZvbGRlckljb25FbCkge1xuICAgICAgc2V0SWNvbihmb2xkZXJJY29uRWwsIG5ld1N0YXRlID8gRk9MREVSX0lDT05fT1BFTiA6IEZPTERFUl9JQ09OX0NMT1NFRCk7XG4gICAgfVxuICB9XG5cbiAgLy8g0JzQtdGC0L7QtCDQtNC70Y8g0YDQvtC30LPQvtGA0YLQsNC90L3Rjy/Qt9Cz0L7RgNGC0LDQvdC90Y8g0YHQtdC60YbRltC5IENoYXRzL1JvbGVzICjQsNC60L7RgNC00LXQvtC9KVxuICBwcml2YXRlIGFzeW5jIHRvZ2dsZVNlY3Rpb24oY2xpY2tlZEhlYWRlckVsOiBIVE1MRWxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vINCS0LjQt9C90LDRh9Cw0ZTQvNC+INGC0LjQvyDRgdC10LrRhtGW0ZcsINC90LAg0Y/QutGDINC60LvRltC60L3Rg9C70LggKCdjaGF0cycg0LDQsdC+ICdyb2xlcycpXG4gICAgY29uc3Qgc2VjdGlvblR5cGUgPSBjbGlja2VkSGVhZGVyRWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1zZWN0aW9uLXR5cGVcIikgYXMgXCJjaGF0c1wiIHwgXCJyb2xlc1wiO1xuICAgIC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4g0L/QvtGC0L7Rh9C90LjQuSDRgdGC0LDQvSAodHJ1ZSwg0Y/QutGJ0L4g0YHQtdC60YbRltGPINC30LDRgNCw0Lcg0LfQs9C+0YDQvdGD0YLQsClcbiAgICBjb25zdCBpc0N1cnJlbnRseUNvbGxhcHNlZCA9IGNsaWNrZWRIZWFkZXJFbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLWNvbGxhcHNlZFwiKSA9PT0gXCJ0cnVlXCI7XG4gICAgLy8g0JfQvdCw0YXQvtC00LjQvNC+INC10LvQtdC80LXQvdGCINGW0LrQvtC90LrQuC3RiNC10LLRgNC+0L3QsCDQsiDQutC70ZbQutC90YPRgtC+0LzRgyDQt9Cw0LPQvtC70L7QstC60YNcbiAgICBjb25zdCBpY29uRWwgPSBjbGlja2VkSGVhZGVyRWwucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oYC4ke0NTU19TRUNUSU9OX1RPR0dMRV9DSEVWUk9OfWApO1xuXG4gICAgLy8g0JLQuNC30L3QsNGH0LDRlNC80L4g0LXQu9C10LzQtdC90YLQuCBET00g0LTQu9GPINC/0L7RgtC+0YfQvdC+0Zcg0YLQsCDRltC90YjQvtGXINGB0LXQutGG0ZbRl1xuICAgIGxldCBjb250ZW50RWw6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBsZXQgdXBkYXRlRnVuY3Rpb246ICgoKSA9PiBQcm9taXNlPHZvaWQ+KSB8IG51bGw7IC8vINCk0YPQvdC60YbRltGPINC00LvRjyDQvtC90L7QstC70LXQvdC90Y8g0LLQvNGW0YHRgtGDICh1cGRhdGVDaGF0TGlzdCDQsNCx0L4gdXBkYXRlUm9sZUxpc3QpXG4gICAgbGV0IG90aGVySGVhZGVyRWw6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBsZXQgb3RoZXJDb250ZW50RWw6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBsZXQgb3RoZXJTZWN0aW9uVHlwZTogXCJjaGF0c1wiIHwgXCJyb2xlc1wiIHwgbnVsbCA9IG51bGw7XG5cbiAgICAvLyDQntGC0YDQuNC80YPRlNC80L4g0L/QvtGB0LjQu9Cw0L3QvdGPINC90LAg0L7RgdC90L7QstC90ZYg0LXQu9C10LzQtdC90YLQuCDQv9Cw0L3QtdC70LXQuVxuICAgIGNvbnN0IGNoYXRIZWFkZXIgPSB0aGlzLmNoYXRQYW5lbEhlYWRlckVsO1xuICAgIGNvbnN0IGNoYXRDb250ZW50ID0gdGhpcy5jaGF0UGFuZWxMaXN0Q29udGFpbmVyRWw7XG4gICAgY29uc3Qgcm9sZUhlYWRlciA9IHRoaXMucm9sZVBhbmVsSGVhZGVyRWw7XG4gICAgY29uc3Qgcm9sZUNvbnRlbnQgPSB0aGlzLnJvbGVQYW5lbExpc3RFbDtcblxuICAgIC8vINCf0YDQuNC30L3QsNGH0LDRlNC80L4g0LfQvNGW0L3QvdGWINC30LDQu9C10LbQvdC+INCy0ZbQtCDRgtC40L/RgyDRgdC10LrRhtGW0ZcsINC90LAg0Y/QutGDINC60LvRltC60L3Rg9C70LhcbiAgICBpZiAoc2VjdGlvblR5cGUgPT09IFwiY2hhdHNcIikge1xuICAgICAgY29udGVudEVsID0gY2hhdENvbnRlbnQ7XG4gICAgICB1cGRhdGVGdW5jdGlvbiA9IHRoaXMudXBkYXRlQ2hhdExpc3Q7XG4gICAgICBvdGhlckhlYWRlckVsID0gcm9sZUhlYWRlcjtcbiAgICAgIG90aGVyQ29udGVudEVsID0gcm9sZUNvbnRlbnQ7XG4gICAgICBvdGhlclNlY3Rpb25UeXBlID0gXCJyb2xlc1wiO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBzZWN0aW9uVHlwZSA9PT0gXCJyb2xlc1wiXG4gICAgICBjb250ZW50RWwgPSByb2xlQ29udGVudDtcbiAgICAgIHVwZGF0ZUZ1bmN0aW9uID0gdGhpcy51cGRhdGVSb2xlTGlzdDtcbiAgICAgIG90aGVySGVhZGVyRWwgPSBjaGF0SGVhZGVyO1xuICAgICAgb3RoZXJDb250ZW50RWwgPSBjaGF0Q29udGVudDtcbiAgICAgIG90aGVyU2VjdGlvblR5cGUgPSBcImNoYXRzXCI7XG4gICAgfVxuXG4gICAgLy8g0J/QtdGA0LXQstGW0YDQutCwLCDRh9C4INCy0YHRliDQvdC10L7QsdGF0ZbQtNC90ZYg0LXQu9C10LzQtdC90YLQuCDQt9C90LDQudC00LXQvdC+XG4gICAgaWYgKCFjb250ZW50RWwgfHwgIWljb25FbCB8fCAhdXBkYXRlRnVuY3Rpb24gfHwgIW90aGVySGVhZGVyRWwgfHwgIW90aGVyQ29udGVudEVsIHx8ICFvdGhlclNlY3Rpb25UeXBlKSB7XG4gICAgICAgICAgICByZXR1cm47IC8vINCS0LjRhdC+0LTQuNC80L4sINGP0LrRidC+INGJ0L7RgdGMINC90LUg0LfQvdCw0LnQtNC10L3QvlxuICAgIH1cblxuICAgIC8vINCf0YDQuNCyJ9GP0LfRg9GU0LzQviDQutC+0L3RgtC10LrRgdGCICd0aGlzJyDQtNC+INGE0YPQvdC60YbRltGXINC+0L3QvtCy0LvQtdC90L3RjyDQtNC70Y8g0L/QvtC00LDQu9GM0YjQvtCz0L4g0LLQuNC60LvQuNC60YNcbiAgICBjb25zdCBib3VuZFVwZGF0ZUZ1bmN0aW9uID0gdXBkYXRlRnVuY3Rpb24uYmluZCh0aGlzKTtcblxuICAgIC8vIC0tLSDQm9C+0LPRltC60LAg0YDQvtC30LPQvtGA0YLQsNC90L3Rjy/Qt9Cz0L7RgNGC0LDQvdC90Y8gLS0tXG4gICAgaWYgKGlzQ3VycmVudGx5Q29sbGFwc2VkKSB7XG4gICAgICAvLyA9PT0g0KDQntCX0JPQntCg0KLQkNCE0JzQniDQn9Ce0KLQntCn0J3QoyDQodCV0JrQptCG0K4gPT09XG5cbiAgICAgIC8vIDEuINCX0LPQvtGA0YLQsNGU0LzQviDQhtCd0KjQoyDRgdC10LrRhtGW0Y4gKNGP0LrRidC+INCy0L7QvdCwINC30LDRgNCw0Lcg0YDQvtC30LPQvtGA0L3Rg9GC0LApXG4gICAgICBpZiAob3RoZXJIZWFkZXJFbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLWNvbGxhcHNlZFwiKSA9PT0gXCJmYWxzZVwiKSB7XG4gICAgICAgIGNvbnN0IG90aGVySWNvbkVsID0gb3RoZXJIZWFkZXJFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihgLiR7Q1NTX1NFQ1RJT05fVE9HR0xFX0NIRVZST059YCk7XG4gICAgICAgIG90aGVySGVhZGVyRWwuc2V0QXR0cmlidXRlKFwiZGF0YS1jb2xsYXBzZWRcIiwgXCJ0cnVlXCIpOyAvLyDQn9C+0LfQvdCw0YfQsNGU0LzQviDRltC90YjRgyDRj9C6INC30LPQvtGA0L3Rg9GC0YNcbiAgICAgICAgaWYgKG90aGVySWNvbkVsKSBzZXRJY29uKG90aGVySWNvbkVsLCBDT0xMQVBTRV9JQ09OX0FDQ09SRElPTik7IC8vINCS0YHRgtCw0L3QvtCy0LvRjtGU0LzQviDRltC60L7QvdC60YMg0LfQs9C+0YDRgtCw0L3QvdGPINC00LvRjyDRltC90YjQvtGXXG4gICAgICAgIG90aGVyQ29udGVudEVsLmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0VYUEFOREVEX0NMQVNTKTsgLy8g0JLQuNC00LDQu9GP0ZTQvNC+INC60LvQsNGBINGA0L7Qt9Cz0L7RgNC90YPRgtC+0LPQviDRgdGC0LDQvdGDXG4gICAgICAgIG90aGVyQ29udGVudEVsLmNsYXNzTGlzdC5hZGQoQ1NTX1NJREVCQVJfU0VDVElPTl9DT05URU5UX0hJRERFTik7IC8vINCU0L7QtNCw0ZTQvNC+INC60LvQsNGBINC00LvRjyDQvNC40YLRgtGU0LLQvtCz0L4g0L/RgNC40YXQvtCy0YPQstCw0L3QvdGPICjRh9C10YDQtdC3IENTUylcblxuICAgICAgICAvLyDQpdC+0LLQsNGU0LzQviDQotCG0JvQrNCa0Jgg0LrQvdC+0L/QutC4INC00ZbQuSDQsiDRltC90YjRltC5INGB0LXQutGG0ZbRlyAo0YjQtdCy0YDQvtC9INC30LDQu9C40YjQsNGU0YLRjNGB0Y8g0LLQuNC00LjQvNC40LwpXG4gICAgICAgIGNvbnN0IG90aGVySGVhZGVyQnV0dG9ucyA9IG90aGVySGVhZGVyRWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oYC4ke0NTU19TSURFQkFSX0hFQURFUl9CVVRUT059YCk7XG4gICAgICAgIG90aGVySGVhZGVyQnV0dG9ucy5mb3JFYWNoKGJ0biA9PiAoYnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIikpO1xuICAgICAgfVxuXG4gICAgICAvLyAyLiDQoNC+0LfQs9C+0YDRgtCw0ZTQvNC+INCf0J7QotCe0KfQndCjINGB0LXQutGG0ZbRjlxuICAgICAgY2xpY2tlZEhlYWRlckVsLnNldEF0dHJpYnV0ZShcImRhdGEtY29sbGFwc2VkXCIsIFwiZmFsc2VcIik7IC8vINCf0L7Qt9C90LDRh9Cw0ZTQvNC+INC/0L7RgtC+0YfQvdGDINGP0Log0YDQvtC30LPQvtGA0L3Rg9GC0YNcbiAgICAgIHNldEljb24oaWNvbkVsLCBFWFBBTkRfSUNPTl9BQ0NPUkRJT04pOyAvLyDQktGB0YLQsNC90L7QstC70Y7RlNC80L4g0ZbQutC+0L3QutGDINGA0L7Qt9Cz0L7RgNGC0LDQvdC90Y9cbiAgICAgIGNvbnRlbnRFbC5jbGFzc0xpc3QucmVtb3ZlKENTU19TSURFQkFSX1NFQ1RJT05fQ09OVEVOVF9ISURERU4pOyAvLyDQktC40LTQsNC70Y/RlNC80L4g0LrQu9Cw0YEg0YjQstC40LTQutC+0LPQviDQv9GA0LjRhdC+0LLRg9Cy0LDQvdC90Y9cblxuICAgICAgLy8g0J/QvtC60LDQt9GD0ZTQvNC+INC60L3QvtC/0LrQuCDQtNGW0Lkg0LIg0L/QvtGC0L7Rh9C90ZbQuSDRgdC10LrRhtGW0ZdcbiAgICAgIGNvbnN0IGhlYWRlckJ1dHRvbnMgPSBjbGlja2VkSGVhZGVyRWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oYC4ke0NTU19TSURFQkFSX0hFQURFUl9CVVRUT059YCk7XG4gICAgICBoZWFkZXJCdXR0b25zLmZvckVhY2goYnRuID0+IChidG4uc3R5bGUuZGlzcGxheSA9IFwiXCIpKTsgLy8g0J/QvtCy0LXRgNGC0LDRlNC80L4g0YHRgtCw0L3QtNCw0YDRgtC90LjQuSBkaXNwbGF5XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vINCh0L/QvtGH0LDRgtC60YMg0L7QvdC+0LLQu9GO0ZTQvNC+INCy0LzRltGB0YIg0YHQtdC60YbRltGXICjQt9Cw0LLQsNC90YLQsNC20YPRlNC80L4g0LTQsNC90ZYsINGA0LXQvdC00LXRgNC40LzQvilcbiAgICAgICAgYXdhaXQgYm91bmRVcGRhdGVGdW5jdGlvbigpO1xuICAgICAgICAvLyDQn9C+0YLRltC8LCDRgyDQvdCw0YHRgtGD0L/QvdC+0LzRgyDQutCw0LTRgNGWINCw0L3RltC80LDRhtGW0ZcsINC00L7QtNCw0ZTQvNC+INC60LvQsNGBICdpcy1leHBhbmRlZCcuXG4gICAgICAgIC8vIENTUyDQv9C+0LTQsdCw0ZQg0L/RgNC+INC/0LvQsNCy0L3RgyDQsNC90ZbQvNCw0YbRltGOINGA0L7Qt9Cz0L7RgNGC0LDQvdC90Y8uXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbnRlbnRFbD8uaXNDb25uZWN0ZWQgJiYgY2xpY2tlZEhlYWRlckVsLmdldEF0dHJpYnV0ZShcImRhdGEtY29sbGFwc2VkXCIpID09PSBcImZhbHNlXCIpIHtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5jbGFzc0xpc3QuYWRkKENTU19FWFBBTkRFRF9DTEFTUyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIC8vINCe0LHRgNC+0LHQutCwINC/0L7QvNC40LvQutC4INC/0ZbQtCDRh9Cw0YEg0L7QvdC+0LLQu9C10L3QvdGPINCy0LzRltGB0YLRg1xuICAgICAgICAgICAgICAgIGNvbnRlbnRFbC5zZXRUZXh0KGBFcnJvciBsb2FkaW5nICR7c2VjdGlvblR5cGV9LmApOyAvLyDQn9C+0LrQsNC30YPRlNC80L4g0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINC/0YDQviDQv9C+0LzQuNC70LrRg1xuICAgICAgICAvLyDQktGB0LUg0L7QtNC90L4g0LTQvtC00LDRlNC80L4g0LrQu9Cw0YEsINGJ0L7QsSDQv9C+0LrQsNC30LDRgtC4INC/0L7QvNC40LvQutGDXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbnRlbnRFbD8uaXNDb25uZWN0ZWQgJiYgY2xpY2tlZEhlYWRlckVsLmdldEF0dHJpYnV0ZShcImRhdGEtY29sbGFwc2VkXCIpID09PSBcImZhbHNlXCIpIHtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5jbGFzc0xpc3QuYWRkKENTU19FWFBBTkRFRF9DTEFTUyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gPT09INCX0JPQntCg0KLQkNCE0JzQniDQn9Ce0KLQntCn0J3QoyDQodCV0JrQptCG0K4gPT09XG4gICAgICAvLyDQr9C60YnQviDQutC70ZbQutC90YPQu9C4INC90LAg0LLQttC1INGA0L7Qt9Cz0L7RgNC90YPRgtGDINGB0LXQutGG0ZbRjlxuXG4gICAgICBjbGlja2VkSGVhZGVyRWwuc2V0QXR0cmlidXRlKFwiZGF0YS1jb2xsYXBzZWRcIiwgXCJ0cnVlXCIpOyAvLyDQn9C+0LfQvdCw0YfQsNGU0LzQviDRj9C6INC30LPQvtGA0L3Rg9GC0YNcbiAgICAgIHNldEljb24oaWNvbkVsLCBDT0xMQVBTRV9JQ09OX0FDQ09SRElPTik7IC8vINCS0YHRgtCw0L3QvtCy0LvRjtGU0LzQviDRltC60L7QvdC60YMg0LfQs9C+0YDRgtCw0L3QvdGPXG4gICAgICBjb250ZW50RWwuY2xhc3NMaXN0LnJlbW92ZShDU1NfRVhQQU5ERURfQ0xBU1MpOyAvLyDQktC40LTQsNC70Y/RlNC80L4g0LrQu9Cw0YEg0YDQvtC30LPQvtGA0L3Rg9GC0L7Qs9C+INGB0YLQsNC90YNcbiAgICAgIGNvbnRlbnRFbC5jbGFzc0xpc3QuYWRkKENTU19TSURFQkFSX1NFQ1RJT05fQ09OVEVOVF9ISURERU4pOyAvLyDQlNC+0LTQsNGU0LzQviDQutC70LDRgSDQtNC70Y8g0LzQuNGC0YLRlNCy0L7Qs9C+INC/0YDQuNGF0L7QstGD0LLQsNC90L3Rj1xuXG4gICAgICAvLyDQpdC+0LLQsNGU0LzQviDQutC90L7Qv9C60Lgg0LTRltC5INCyINC/0L7RgtC+0YfQvdGW0Lkg0YHQtdC60YbRltGXXG4gICAgICBjb25zdCBoZWFkZXJCdXR0b25zID0gY2xpY2tlZEhlYWRlckVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KGAuJHtDU1NfU0lERUJBUl9IRUFERVJfQlVUVE9OfWApO1xuICAgICAgaGVhZGVyQnV0dG9ucy5mb3JFYWNoKGJ0biA9PiAoYnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIikpO1xuICAgIH1cbiAgfSAvLyAtLS0g0JrRltC90LXRhtGMINC80LXRgtC+0LTRgyB0b2dnbGVTZWN0aW9uIC0tLVxuXG4gIC8vIC0tLSDQoNC10YjRgtCwINC80LXRgtC+0LTRltCyINCx0LXQtyDQt9C80ZbQvSAtLS1cbiAgcHJpdmF0ZSBzaG93Rm9sZGVyQ29udGV4dE1lbnUoZXZlbnQ6IE1vdXNlRXZlbnQgfCBQb2ludGVyRXZlbnQsIGZvbGRlck5vZGU6IEZvbGRlck5vZGUpOiB2b2lkIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGNvbnN0IG1lbnUgPSBuZXcgTWVudSgpO1xuICAgIG1lbnUuYWRkSXRlbShpdGVtID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIk5ldyBDaGF0IEhlcmVcIilcbiAgICAgICAgLnNldEljb24oXCJsdWNpZGUtcGx1cy1jaXJjbGVcIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5oYW5kbGVOZXdDaGF0Q2xpY2soZm9sZGVyTm9kZS5wYXRoKSlcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbShpdGVtID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIk5ldyBGb2xkZXIgSGVyZVwiKVxuICAgICAgICAuc2V0SWNvbihcImx1Y2lkZS1mb2xkZXItcGx1c1wiKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLmhhbmRsZU5ld0ZvbGRlckNsaWNrKGZvbGRlck5vZGUucGF0aCkpXG4gICAgKTtcbiAgICBtZW51LmFkZFNlcGFyYXRvcigpO1xuICAgIG1lbnUuYWRkSXRlbShpdGVtID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIlJlbmFtZSBGb2xkZXJcIilcbiAgICAgICAgLnNldEljb24oXCJsdWNpZGUtcGVuY2lsXCIpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuaGFuZGxlUmVuYW1lRm9sZGVyKGZvbGRlck5vZGUpKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKGl0ZW0gPT4ge1xuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJEZWxldGUgRm9sZGVyXCIpXG4gICAgICAgIC5zZXRJY29uKFwibHVjaWRlLXRyYXNoLTJcIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5oYW5kbGVEZWxldGVGb2xkZXIoZm9sZGVyTm9kZSkpOyAvKiBTdHlsaW5nIHZpYSBDU1MgKi9cbiAgICB9KTtcbiAgICBtZW51LnNob3dBdE1vdXNlRXZlbnQoZXZlbnQpO1xuICB9XG4gIHB1YmxpYyB1cGRhdGVSb2xlTGlzdCA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLnJvbGVQYW5lbExpc3RFbDtcbiAgICBpZiAoIWNvbnRhaW5lciB8fCAhdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgICAgIGNvbnN0IGN1cnJlbnRTY3JvbGxUb3AgPSBjb250YWluZXIuc2Nyb2xsVG9wO1xuICAgIGNvbnRhaW5lci5lbXB0eSgpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByb2xlcyA9IGF3YWl0IHRoaXMucGx1Z2luLmxpc3RSb2xlRmlsZXModHJ1ZSk7XG4gICAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0QWN0aXZlQ2hhdCgpO1xuICAgICAgY29uc3QgY3VycmVudFJvbGVQYXRoID0gYWN0aXZlQ2hhdD8ubWV0YWRhdGE/LnNlbGVjdGVkUm9sZVBhdGggPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aDtcbiAgICAgIGNvbnN0IG5vbmVPcHRpb25FbCA9IGNvbnRhaW5lci5jcmVhdGVEaXYoe1xuICAgICAgICBjbHM6IFtDU1NfUk9MRV9QQU5FTF9JVEVNLCBDU1NfUk9MRV9QQU5FTF9JVEVNX05PTkUsIENTU19DTEFTU19NRU5VX09QVElPTl0sXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IG5vbmVJY29uU3BhbiA9IG5vbmVPcHRpb25FbC5jcmVhdGVTcGFuKHsgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTV9JQ09OLCBcIm1lbnUtb3B0aW9uLWljb25cIl0gfSk7XG4gICAgICBub25lT3B0aW9uRWwuY3JlYXRlU3Bhbih7IGNsczogW0NTU19ST0xFX1BBTkVMX0lURU1fVEVYVCwgXCJtZW51LW9wdGlvbi10ZXh0XCJdLCB0ZXh0OiBcIk5vbmVcIiB9KTtcbiAgICAgIHNldEljb24obm9uZUljb25TcGFuLCAhY3VycmVudFJvbGVQYXRoID8gXCJjaGVja1wiIDogXCJzbGFzaFwiKTtcbiAgICAgIGlmICghY3VycmVudFJvbGVQYXRoKSBub25lT3B0aW9uRWwuYWRkQ2xhc3MoQ1NTX1JPTEVfUEFORUxfSVRFTV9BQ1RJVkUpO1xuICAgICAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQobm9uZU9wdGlvbkVsLCBcImNsaWNrXCIsICgpID0+IHRoaXMuaGFuZGxlUm9sZVBhbmVsSXRlbUNsaWNrKG51bGwsIGN1cnJlbnRSb2xlUGF0aCkpO1xuICAgICAgcm9sZXMuZm9yRWFjaChyb2xlSW5mbyA9PiB7XG4gICAgICAgIGNvbnN0IHJvbGVPcHRpb25FbCA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFtDU1NfUk9MRV9QQU5FTF9JVEVNLCBDU1NfQ0xBU1NfTUVOVV9PUFRJT05dIH0pO1xuICAgICAgICBjb25zdCBpY29uU3BhbiA9IHJvbGVPcHRpb25FbC5jcmVhdGVTcGFuKHsgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTV9JQ09OLCBcIm1lbnUtb3B0aW9uLWljb25cIl0gfSk7XG4gICAgICAgIHJvbGVPcHRpb25FbC5jcmVhdGVTcGFuKHsgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTV9URVhULCBcIm1lbnUtb3B0aW9uLXRleHRcIl0sIHRleHQ6IHJvbGVJbmZvLm5hbWUgfSk7XG4gICAgICAgIGlmIChyb2xlSW5mby5pc0N1c3RvbSkgcm9sZU9wdGlvbkVsLmFkZENsYXNzKENTU19ST0xFX1BBTkVMX0lURU1fQ1VTVE9NKTtcbiAgICAgICAgc2V0SWNvbihpY29uU3Bhbiwgcm9sZUluZm8ucGF0aCA9PT0gY3VycmVudFJvbGVQYXRoID8gXCJjaGVja1wiIDogcm9sZUluZm8uaXNDdXN0b20gPyBcInVzZXJcIiA6IFwiZmlsZS10ZXh0XCIpO1xuICAgICAgICBpZiAocm9sZUluZm8ucGF0aCA9PT0gY3VycmVudFJvbGVQYXRoKSByb2xlT3B0aW9uRWwuYWRkQ2xhc3MoQ1NTX1JPTEVfUEFORUxfSVRFTV9BQ1RJVkUpO1xuICAgICAgICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudChyb2xlT3B0aW9uRWwsIFwiY2xpY2tcIiwgKCkgPT5cbiAgICAgICAgICB0aGlzLmhhbmRsZVJvbGVQYW5lbEl0ZW1DbGljayhyb2xlSW5mbywgY3VycmVudFJvbGVQYXRoKVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnRhaW5lci5lbXB0eSgpO1xuICAgICAgY29udGFpbmVyLmNyZWF0ZURpdih7IHRleHQ6IFwiRXJyb3IgbG9hZGluZyByb2xlcy5cIiwgY2xzOiBcIm1lbnUtZXJyb3ItdGV4dFwiIH0pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgICBpZiAoY29udGFpbmVyPy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgIGNvbnRhaW5lci5zY3JvbGxUb3AgPSBjdXJyZW50U2Nyb2xsVG9wO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG4gIHByaXZhdGUgaGFuZGxlUm9sZVBhbmVsSXRlbUNsaWNrID0gYXN5bmMgKFxuICAgIHJvbGVJbmZvOiBSb2xlSW5mbyB8IG51bGwsXG4gICAgY3VycmVudFJvbGVQYXRoOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkXG4gICk6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgIGNvbnN0IG5ld1JvbGVQYXRoID0gcm9sZUluZm8/LnBhdGggPz8gXCJcIjtcbiAgICBjb25zdCByb2xlTmFtZUZvckV2ZW50ID0gcm9sZUluZm8/Lm5hbWUgPz8gXCJOb25lXCI7XG4gICAgY29uc3Qgbm9ybWFsaXplZEN1cnJlbnRSb2xlUGF0aCA9IGN1cnJlbnRSb2xlUGF0aCA/PyBcIlwiO1xuICAgIGlmIChuZXdSb2xlUGF0aCAhPT0gbm9ybWFsaXplZEN1cnJlbnRSb2xlUGF0aCkge1xuICAgICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAoYWN0aXZlQ2hhdCkge1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnVwZGF0ZUFjdGl2ZUNoYXRNZXRhZGF0YSh7IHNlbGVjdGVkUm9sZVBhdGg6IG5ld1JvbGVQYXRoIHx8IHVuZGVmaW5lZCB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoID0gbmV3Um9sZVBhdGggfHwgdW5kZWZpbmVkO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJyb2xlLWNoYW5nZWRcIiwgcm9sZU5hbWVGb3JFdmVudCk7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucHJvbXB0U2VydmljZT8uY2xlYXJSb2xlQ2FjaGU/LigpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudXBkYXRlUm9sZUxpc3QoKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBzZXQgdGhlIHJvbGUuXCIpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgfVxuICB9O1xuICBcbiAgLy8gc3JjL1NpZGViYXJNYW5hZ2VyLnRzXG5wcml2YXRlIGhhbmRsZU5ld0NoYXRDbGljayA9IGFzeW5jICh0YXJnZXRGb2xkZXJQYXRoPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IGZvbGRlclBhdGg6IHN0cmluZyA9IHRhcmdldEZvbGRlclBhdGggPz8gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2hhdHNGb2xkZXJQYXRoID8/IFwiL1wiO1xuICB0cnkge1xuICAgIGNvbnN0IG5ld0NoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jcmVhdGVOZXdDaGF0KHVuZGVmaW5lZCwgZm9sZGVyUGF0aCk7XG4gICAgaWYgKG5ld0NoYXQpIHtcbiAgICAgIG5ldyBOb3RpY2UoYENyZWF0ZWQgbmV3IGNoYXQ6ICR7bmV3Q2hhdC5tZXRhZGF0YS5uYW1lfWApO1xuICAgICAgdGhpcy5wbHVnaW4uZW1pdChcImZvY3VzLWlucHV0LXJlcXVlc3RcIik7XG4gICAgICBjb25zdCBwYXJlbnRQYXRoID0gZm9sZGVyUGF0aC5zdWJzdHJpbmcoMCwgZm9sZGVyUGF0aC5sYXN0SW5kZXhPZihcIi9cIikpO1xuXG4gICAgICAvLyDQoNC+0LfQs9C+0YDRgtCw0ZTQvNC+INCx0LDRgtGM0LrRltCy0YHRjNC60YMg0L/QsNC/0LrRgywg0Y/QutGJ0L4g0YfQsNGCINGB0YLQstC+0YDQtdC90L4g0LLRgdC10YDQtdC00LjQvdGWINC90LXRl1xuICAgICAgLy8g0ZYg0YbQtSDQvdC1INC60L7RgNC10L3QtdCy0LAg0L/QsNC/0LrQsCDRh9Cw0YLRltCyLlxuICAgICAgY29uc3Qgbm9ybWFsaXplZFBhcmVudFBhdGggPSBub3JtYWxpemVQYXRoKHBhcmVudFBhdGgpO1xuICAgICAgY29uc3Qgbm9ybWFsaXplZENoYXRzRm9sZGVyUGF0aCA9IG5vcm1hbGl6ZVBhdGgodGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2hhdHNGb2xkZXJQYXRoID8/IFwiL1wiKTtcblxuICAgICAgaWYgKHBhcmVudFBhdGggJiYgbm9ybWFsaXplZFBhcmVudFBhdGggIT09IFwiL1wiICYmIG5vcm1hbGl6ZWRQYXJlbnRQYXRoICE9PSBub3JtYWxpemVkQ2hhdHNGb2xkZXJQYXRoKSB7XG4gICAgICAgICB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLnNldChub3JtYWxpemVkUGFyZW50UGF0aCwgdHJ1ZSk7XG4gICAgICB9XG5cbiAgICAgIC8vINCg0JXQm9CG0Jc6INCS0LjQtNCw0LvQtdC90L4g0L/RgNGP0LzQuNC5INCy0LjQutC70LjQuiB0aGlzLnVwZGF0ZUNoYXRMaXN0KCk7XG4gICAgICAvLyDQotC10L/QtdGAINC+0L3QvtCy0LvQtdC90L3RjyDRgdC/0LjRgdC60YMg0LzQsNGUINCy0ZbQtNCx0YPQstCw0YLQuNGB0Y8g0YfQtdGA0LXQtyDQv9C+0LTRltGOICjQvdCw0L/RgNC40LrQu9Cw0LQsICdhY3RpdmUtY2hhdC1jaGFuZ2VkJyDQsNCx0L4gJ2NoYXQtbGlzdC11cGRhdGVkJyksXG4gICAgICAvLyDRj9C60YMgQ2hhdE1hbmFnZXIuY3JlYXRlTmV3Q2hhdCgpINC80LDRlCDQt9Cz0LXQvdC10YDRg9Cy0LDRgtC4LCDQsCBPbGxhbWFWaWV3INC+0LHRgNC+0LHQuNGC0LguXG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGBFcnJvciBjcmVhdGluZyBuZXcgY2hhdDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiVW5rbm93biBlcnJvclwifWApO1xuICB9XG59O1xuICBcbiAgcHJpdmF0ZSBoYW5kbGVOZXdGb2xkZXJDbGljayA9IGFzeW5jIChwYXJlbnRGb2xkZXJQYXRoPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgY29uc3QgdGFyZ2V0UGFyZW50UGF0aDogc3RyaW5nID0gcGFyZW50Rm9sZGVyUGF0aCA/PyB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jaGF0c0ZvbGRlclBhdGggPz8gXCIvXCI7XG4gICAgbmV3IFByb21wdE1vZGFsKHRoaXMuYXBwLCBcIkNyZWF0ZSBOZXcgRm9sZGVyXCIsIFwiRW50ZXIgZm9sZGVyIG5hbWU6XCIsIFwiXCIsIGFzeW5jIG5ld05hbWUgPT4ge1xuICAgICAgY29uc3QgdHJpbW1lZE5hbWUgPSBuZXdOYW1lPy50cmltKCk7XG4gICAgICBpZiAoIXRyaW1tZWROYW1lKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJGb2xkZXIgbmFtZSBjYW5ub3QgYmUgZW1wdHkuXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoL1tcXFxcLz86KlwiPD58XS8udGVzdCh0cmltbWVkTmFtZSkpIHtcbiAgICAgICAgbmV3IE5vdGljZShcIkZvbGRlciBuYW1lIGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycy5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG5ld0ZvbGRlclBhdGggPSBub3JtYWxpemVQYXRoKFxuICAgICAgICB0YXJnZXRQYXJlbnRQYXRoID09PSBcIi9cIiA/IHRyaW1tZWROYW1lIDogYCR7dGFyZ2V0UGFyZW50UGF0aH0vJHt0cmltbWVkTmFtZX1gXG4gICAgICApO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmNyZWF0ZUZvbGRlcihuZXdGb2xkZXJQYXRoKTtcbiAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgICBuZXcgTm90aWNlKGBGb2xkZXIgXCIke3RyaW1tZWROYW1lfVwiIGNyZWF0ZWQuYCk7XG4gICAgICAgICAgaWYgKHRhcmdldFBhcmVudFBhdGggJiYgdGFyZ2V0UGFyZW50UGF0aCAhPT0gXCIvXCIpIHtcbiAgICAgICAgICAgIHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuc2V0KHRhcmdldFBhcmVudFBhdGgsIHRydWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyB0aGlzLnVwZGF0ZUNoYXRMaXN0KCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgY3JlYXRpbmcgZm9sZGVyOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJVbmtub3duIGVycm9yXCJ9YCk7XG4gICAgICB9XG4gICAgfSkub3BlbigpO1xuICB9O1xuICBwcml2YXRlIGhhbmRsZVJlbmFtZUZvbGRlciA9IGFzeW5jIChmb2xkZXJOb2RlOiBGb2xkZXJOb2RlKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgY29uc3QgY3VycmVudE5hbWUgPSBmb2xkZXJOb2RlLm5hbWU7XG4gICAgY29uc3QgcGFyZW50UGF0aCA9IGZvbGRlck5vZGUucGF0aC5zdWJzdHJpbmcoMCwgZm9sZGVyTm9kZS5wYXRoLmxhc3RJbmRleE9mKFwiL1wiKSkgfHwgXCIvXCI7XG4gICAgbmV3IFByb21wdE1vZGFsKHRoaXMuYXBwLCBcIlJlbmFtZSBGb2xkZXJcIiwgYE5ldyBuYW1lIGZvciBcIiR7Y3VycmVudE5hbWV9XCI6YCwgY3VycmVudE5hbWUsIGFzeW5jIG5ld05hbWUgPT4ge1xuICAgICAgY29uc3QgdHJpbW1lZE5hbWUgPSBuZXdOYW1lPy50cmltKCk7XG4gICAgICBpZiAoIXRyaW1tZWROYW1lIHx8IHRyaW1tZWROYW1lID09PSBjdXJyZW50TmFtZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRyaW1tZWROYW1lID09PSBjdXJyZW50TmFtZSA/IFwiTmFtZSB1bmNoYW5nZWQuXCIgOiBcIlJlbmFtZSBjYW5jZWxsZWQuXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoL1tcXFxcLz86KlwiPD58XS8udGVzdCh0cmltbWVkTmFtZSkpIHtcbiAgICAgICAgbmV3IE5vdGljZShcIkZvbGRlciBuYW1lIGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycy5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG5ld0ZvbGRlclBhdGggPSBub3JtYWxpemVQYXRoKHBhcmVudFBhdGggPT09IFwiL1wiID8gdHJpbW1lZE5hbWUgOiBgJHtwYXJlbnRQYXRofS8ke3RyaW1tZWROYW1lfWApO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMobmV3Rm9sZGVyUGF0aCk7XG4gICAgICAgIGlmIChleGlzdHMpIHtcbiAgICAgICAgICBuZXcgTm90aWNlKGBBIGZvbGRlciBvciBmaWxlIG5hbWVkIFwiJHt0cmltbWVkTmFtZX1cIiBhbHJlYWR5IGV4aXN0cyBoZXJlLmApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge31cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZW5hbWVGb2xkZXIoZm9sZGVyTm9kZS5wYXRoLCBuZXdGb2xkZXJQYXRoKTtcbiAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgICBuZXcgTm90aWNlKGBGb2xkZXIgcmVuYW1lZCB0byBcIiR7dHJpbW1lZE5hbWV9XCIuYCk7XG4gICAgICAgICAgaWYgKHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuaGFzKGZvbGRlck5vZGUucGF0aCkpIHtcbiAgICAgICAgICAgIGNvbnN0IHdhc0V4cGFuZGVkID0gdGhpcy5mb2xkZXJFeHBhbnNpb25TdGF0ZS5nZXQoZm9sZGVyTm9kZS5wYXRoKTtcbiAgICAgICAgICAgIHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuZGVsZXRlKGZvbGRlck5vZGUucGF0aCk7XG4gICAgICAgICAgICB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLnNldChuZXdGb2xkZXJQYXRoLCB3YXNFeHBhbmRlZCEpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyB0aGlzLnVwZGF0ZUNoYXRMaXN0KCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgcmVuYW1pbmcgZm9sZGVyOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJVbmtub3duIGVycm9yXCJ9YCk7XG4gICAgICB9XG4gICAgfSkub3BlbigpO1xuICB9O1xuICBwcml2YXRlIGhhbmRsZURlbGV0ZUZvbGRlciA9IGFzeW5jIChmb2xkZXJOb2RlOiBGb2xkZXJOb2RlKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgY29uc3QgZm9sZGVyTmFtZSA9IGZvbGRlck5vZGUubmFtZTtcbiAgICBjb25zdCBmb2xkZXJQYXRoID0gZm9sZGVyTm9kZS5wYXRoO1xuICAgIGlmIChmb2xkZXJQYXRoID09PSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jaGF0c0ZvbGRlclBhdGgpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJDYW5ub3QgZGVsZXRlIHRoZSBtYWluIGNoYXQgaGlzdG9yeSBmb2xkZXIuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBuZXcgQ29uZmlybU1vZGFsKFxuICAgICAgdGhpcy5hcHAsXG4gICAgICBcIkRlbGV0ZSBGb2xkZXJcIixcbiAgICAgIGBEZWxldGUgZm9sZGVyIFwiJHtmb2xkZXJOYW1lfVwiIGFuZCBBTEwgaXRzIGNvbnRlbnRzIChzdWJmb2xkZXJzIGFuZCBjaGF0cyk/IFRoaXMgY2Fubm90IGJlIHVuZG9uZS5gLFxuICAgICAgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCBub3RpY2UgPSBuZXcgTm90aWNlKGBEZWxldGluZyBmb2xkZXIgXCIke2ZvbGRlck5hbWV9XCIuLi5gLCAwKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZGVsZXRlRm9sZGVyKGZvbGRlclBhdGgpO1xuICAgICAgICAgIGlmIChzdWNjZXNzKSB7XG4gICAgICAgICAgICBjb25zdCBrZXlzVG9EZWxldGUgPSBBcnJheS5mcm9tKHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUua2V5cygpKS5maWx0ZXIoa2V5ID0+IGtleS5zdGFydHNXaXRoKGZvbGRlclBhdGgpKTtcbiAgICAgICAgICAgIGtleXNUb0RlbGV0ZS5mb3JFYWNoKGtleSA9PiB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLmRlbGV0ZShrZXkpKTtcbiAgICAgICAgICAgIC8vIHRoaXMudXBkYXRlQ2hhdExpc3QoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yIGRlbGV0aW5nIGZvbGRlcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiVW5rbm93biBlcnJvclwifWApO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApLm9wZW4oKTtcbiAgfTtcbiAgcHJpdmF0ZSBzaG93Q2hhdENvbnRleHRNZW51KGV2ZW50OiBNb3VzZUV2ZW50IHwgUG9pbnRlckV2ZW50LCBjaGF0TWV0YTogQ2hhdE1ldGFkYXRhKTogdm9pZCB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBjb25zdCBtZW51ID0gbmV3IE1lbnUoKTtcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJDbG9uZSBDaGF0XCIpXG4gICAgICAgIC5zZXRJY29uKFwibHVjaWRlLWNvcHktcGx1c1wiKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLmhhbmRsZUNvbnRleHRNZW51Q2xvbmUoY2hhdE1ldGEuaWQpKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKGl0ZW0gPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiUmVuYW1lIENoYXRcIilcbiAgICAgICAgLnNldEljb24oXCJsdWNpZGUtcGVuY2lsXCIpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuaGFuZGxlQ29udGV4dE1lbnVSZW5hbWUoY2hhdE1ldGEuaWQsIGNoYXRNZXRhLm5hbWUpKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKGl0ZW0gPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiRXhwb3J0IHRvIE5vdGVcIilcbiAgICAgICAgLnNldEljb24oXCJsdWNpZGUtZG93bmxvYWRcIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5leHBvcnRTcGVjaWZpY0NoYXQoY2hhdE1ldGEuaWQpKVxuICAgICk7XG4gICAgbWVudS5hZGRTZXBhcmF0b3IoKTtcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PiB7XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIkNsZWFyIE1lc3NhZ2VzXCIpXG4gICAgICAgIC5zZXRJY29uKFwibHVjaWRlLXRyYXNoXCIpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuaGFuZGxlQ29udGV4dE1lbnVDbGVhcihjaGF0TWV0YS5pZCwgY2hhdE1ldGEubmFtZSkpOyAvKiBTdHlsaW5nIHZpYSBDU1MgKi9cbiAgICB9KTtcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PiB7XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIkRlbGV0ZSBDaGF0XCIpXG4gICAgICAgIC5zZXRJY29uKFwibHVjaWRlLXRyYXNoLTJcIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5oYW5kbGVDb250ZXh0TWVudURlbGV0ZShjaGF0TWV0YS5pZCwgY2hhdE1ldGEubmFtZSkpOyAvKiBTdHlsaW5nIHZpYSBDU1MgKi9cbiAgICB9KTtcbiAgICBtZW51LnNob3dBdE1vdXNlRXZlbnQoZXZlbnQpO1xuICB9XG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlQ29udGV4dE1lbnVDbG9uZShjaGF0SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5vdGljZSA9IG5ldyBOb3RpY2UoXCJDbG9uaW5nIGNoYXQuLi5cIiwgMCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGMgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jbG9uZUNoYXQoY2hhdElkKTtcbiAgICAgIGlmIChjKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoYENoYXQgY2xvbmVkIGFzIFwiJHtjLm1ldGFkYXRhLm5hbWV9XCJgKTtcbiAgICAgICAgLy8gdGhpcy51cGRhdGVDaGF0TGlzdCgpO1xuICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwiZm9jdXMtaW5wdXQtcmVxdWVzdFwiKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgfVxuICB9XG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlQ29udGV4dE1lbnVSZW5hbWUoY2hhdElkOiBzdHJpbmcsIGN1cnJlbnROYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBuZXcgUHJvbXB0TW9kYWwodGhpcy5hcHAsIFwiUmVuYW1lIENoYXRcIiwgYE5ldyBuYW1lIGZvciBcIiR7Y3VycmVudE5hbWV9XCI6YCwgY3VycmVudE5hbWUsIGFzeW5jIG5ld05hbWUgPT4ge1xuICAgICAgY29uc3QgdHJpbW1lZE5hbWUgPSBuZXdOYW1lPy50cmltKCk7XG4gICAgICBpZiAoIXRyaW1tZWROYW1lIHx8IHRyaW1tZWROYW1lID09PSBjdXJyZW50TmFtZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRyaW1tZWROYW1lID09PSBjdXJyZW50TmFtZSA/IGBOYW1lIHVuY2hhbmdlZC5gIDogYFJlbmFtZSBjYW5jZWxsZWQuYCk7XG4gICAgICB9IGVsc2UgaWYgKC9bXFxcXC8/OipcIjw+fF0vLnRlc3QodHJpbW1lZE5hbWUpKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJDaGF0IG5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzLlwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZW5hbWVDaGF0KGNoYXRJZCwgdHJpbW1lZE5hbWUpOyAvKiBVSSB1cGRhdGUgaGFuZGxlZCBieSBldmVudCAqL1xuICAgICAgfVxuICAgICAgdGhpcy5wbHVnaW4uZW1pdChcImZvY3VzLWlucHV0LXJlcXVlc3RcIik7XG4gICAgfSkub3BlbigpO1xuICB9IC8vINCS0LjQtNCw0LvQtdC90L4g0Y/QstC90LjQuSB1cGRhdGVDaGF0TGlzdFxuICBwcml2YXRlIGFzeW5jIGV4cG9ydFNwZWNpZmljQ2hhdChjaGF0SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5vdGljZSA9IG5ldyBOb3RpY2UoYEV4cG9ydGluZyBjaGF0Li4uYCwgMCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRDaGF0KGNoYXRJZCk7XG4gICAgICBpZiAoIWNoYXQgfHwgY2hhdC5tZXNzYWdlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgbmV3IE5vdGljZShcIkNoYXQgaXMgZW1wdHkgb3Igbm90IGZvdW5kLCBub3RoaW5nIHRvIGV4cG9ydC5cIik7XG4gICAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG1kID0gdGhpcy5mb3JtYXRDaGF0VG9NYXJrZG93bihjaGF0Lm1lc3NhZ2VzLCBjaGF0Lm1ldGFkYXRhKTtcbiAgICAgIGNvbnN0IHRzID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1s6Ll0vZywgXCItXCIpO1xuICAgICAgY29uc3Qgc2FmZU5hbWUgPSBjaGF0Lm1ldGFkYXRhLm5hbWUucmVwbGFjZSgvW1xcXFwvPzoqXCI8PnxdL2csIFwiLVwiKTtcbiAgICAgIGNvbnN0IGZpbGVuYW1lID0gYG9sbGFtYS1jaGF0LSR7c2FmZU5hbWV9LSR7dHN9Lm1kYDtcbiAgICAgIGxldCBmUGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmNoYXRFeHBvcnRGb2xkZXJQYXRoPy50cmltKCk7XG4gICAgICBsZXQgZkZvbGRlcjogVEZvbGRlciB8IG51bGwgPSBudWxsO1xuICAgICAgaWYgKGZQYXRoKSB7XG4gICAgICAgIGZQYXRoID0gbm9ybWFsaXplUGF0aChmUGF0aCk7XG4gICAgICAgIGNvbnN0IGFmID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZQYXRoKTtcbiAgICAgICAgaWYgKCFhZikge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIoZlBhdGgpO1xuICAgICAgICAgICAgY29uc3QgbmV3QWYgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZlBhdGgpO1xuICAgICAgICAgICAgaWYgKG5ld0FmIGluc3RhbmNlb2YgVEZvbGRlcikge1xuICAgICAgICAgICAgICBmRm9sZGVyID0gbmV3QWY7XG4gICAgICAgICAgICAgIG5ldyBOb3RpY2UoYENyZWF0ZWQgZXhwb3J0IGZvbGRlcjogJHtmUGF0aH1gKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkZhaWxlZCB0byBnZXQgY3JlYXRlZCBmb2xkZXIuXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShgRXhwb3J0IGZvbGRlciBlcnJvci4gU2F2aW5nIHRvIHZhdWx0IHJvb3QuYCk7XG4gICAgICAgICAgICBmRm9sZGVyID0gdGhpcy5hcHAudmF1bHQuZ2V0Um9vdCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChhZiBpbnN0YW5jZW9mIFRGb2xkZXIpIHtcbiAgICAgICAgICBmRm9sZGVyID0gYWY7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbmV3IE5vdGljZShgRXhwb3J0IHBhdGggaXMgbm90IGEgZm9sZGVyLiBTYXZpbmcgdG8gdmF1bHQgcm9vdC5gKTtcbiAgICAgICAgICBmRm9sZGVyID0gdGhpcy5hcHAudmF1bHQuZ2V0Um9vdCgpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmRm9sZGVyID0gdGhpcy5hcHAudmF1bHQuZ2V0Um9vdCgpO1xuICAgICAgfVxuICAgICAgaWYgKCFmRm9sZGVyKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkV4cG9ydCBmb2xkZXIgZXJyb3IuXCIpO1xuICAgICAgICBub3RpY2UuaGlkZSgpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCBmaWxlUGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7ZkZvbGRlci5wYXRofS8ke2ZpbGVuYW1lfWApO1xuICAgICAgY29uc3QgZmlsZSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShmaWxlUGF0aCwgbWQpO1xuICAgICAgbmV3IE5vdGljZShgQ2hhdCBleHBvcnRlZCB0byAke2ZpbGUucGF0aH1gKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiQ2hhdCBleHBvcnQgZmFpbGVkLlwiKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgbm90aWNlLmhpZGUoKTtcbiAgICB9XG4gIH1cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVDb250ZXh0TWVudUNsZWFyKGNoYXRJZDogc3RyaW5nLCBjaGF0TmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbmV3IENvbmZpcm1Nb2RhbCh0aGlzLmFwcCwgXCJDbGVhciBNZXNzYWdlc1wiLCBgQ2xlYXIgYWxsIG1lc3NhZ2VzIGluIFwiJHtjaGF0TmFtZX1cIj9gLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBub3RpY2UgPSBuZXcgTm90aWNlKFwiQ2xlYXJpbmcgbWVzc2FnZXMuLi5cIiwgMCk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2xlYXJDaGF0TWVzc2FnZXNCeUlkKGNoYXRJZCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBjbGVhciBtZXNzYWdlcy5cIik7XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBub3RpY2UuaGlkZSgpO1xuICAgICAgfVxuICAgIH0pLm9wZW4oKTtcbiAgfVxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUNvbnRleHRNZW51RGVsZXRlKGNoYXRJZDogc3RyaW5nLCBjaGF0TmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbmV3IENvbmZpcm1Nb2RhbCh0aGlzLmFwcCwgXCJEZWxldGUgQ2hhdFwiLCBgRGVsZXRlIGNoYXQgXCIke2NoYXROYW1lfVwiPyBUaGlzIGNhbm5vdCBiZSB1bmRvbmUuYCwgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgbm90aWNlID0gbmV3IE5vdGljZShcIkRlbGV0aW5nIGNoYXQuLi5cIiwgMCk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZGVsZXRlQ2hhdChjaGF0SWQpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJGYWlsZWQgdG8gZGVsZXRlIGNoYXQuXCIpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgbm90aWNlLmhpZGUoKTtcbiAgICAgIH1cbiAgICB9KS5vcGVuKCk7XG4gIH1cbiAgcHJpdmF0ZSBmb3JtYXRDaGF0VG9NYXJrZG93bihtZXNzYWdlc1RvRm9ybWF0OiBNZXNzYWdlW10sIG1ldGFkYXRhOiBDaGF0TWV0YWRhdGEpOiBzdHJpbmcge1xuICAgIGxldCBsb2NhbExhc3REYXRlOiBEYXRlIHwgbnVsbCA9IG51bGw7XG4gICAgY29uc3QgZXhwb3J0VGltZXN0YW1wID0gbmV3IERhdGUoKTtcbiAgICBsZXQgbWFya2Rvd24gPSBgIyBBSSBGb3JnZSBDaGF0OiAke21ldGFkYXRhLm5hbWV9XFxuXFxuYDtcbiAgICBtYXJrZG93biArPSBgKiAqKkNoYXQgSUQ6KiogJHttZXRhZGF0YS5pZH1cXG5gO1xuICAgIG1hcmtkb3duICs9IGAqICoqTW9kZWw6KiogJHttZXRhZGF0YS5tb2RlbE5hbWUgfHwgXCJEZWZhdWx0XCJ9XFxuYDtcbiAgICBtYXJrZG93biArPSBgKiAqKlJvbGUgUGF0aDoqKiAke21ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGggfHwgXCJOb25lXCJ9XFxuYDtcbiAgICBtYXJrZG93biArPSBgKiAqKlRlbXBlcmF0dXJlOioqICR7bWV0YWRhdGEudGVtcGVyYXR1cmUgPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGVyYXR1cmV9XFxuYDtcbiAgICBtYXJrZG93biArPSBgKiAqKkNyZWF0ZWQ6KiogJHtuZXcgRGF0ZShtZXRhZGF0YS5jcmVhdGVkQXQpLnRvTG9jYWxlU3RyaW5nKCl9XFxuYDtcbiAgICBtYXJrZG93biArPSBgKiAqKkxhc3QgTW9kaWZpZWQ6KiogJHtuZXcgRGF0ZShtZXRhZGF0YS5sYXN0TW9kaWZpZWQpLnRvTG9jYWxlU3RyaW5nKCl9XFxuYDtcbiAgICBtYXJrZG93biArPSBgKiAqKkV4cG9ydGVkOioqICR7ZXhwb3J0VGltZXN0YW1wLnRvTG9jYWxlU3RyaW5nKCl9XFxuXFxuYDtcbiAgICBtYXJrZG93biArPSBgKioqXFxuXFxuYDtcbiAgICBtZXNzYWdlc1RvRm9ybWF0LmZvckVhY2gobWVzc2FnZSA9PiB7XG4gICAgICBpZiAoIW1lc3NhZ2UgfHwgIW1lc3NhZ2UuY29udGVudD8udHJpbSgpIHx8ICFtZXNzYWdlLnRpbWVzdGFtcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsZXQgbWVzc2FnZVRpbWVzdGFtcDogRGF0ZTtcbiAgICAgIGlmICh0eXBlb2YgbWVzc2FnZS50aW1lc3RhbXAgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgbWVzc2FnZVRpbWVzdGFtcCA9IG5ldyBEYXRlKG1lc3NhZ2UudGltZXN0YW1wKTtcbiAgICAgIH0gZWxzZSBpZiAobWVzc2FnZS50aW1lc3RhbXAgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIG1lc3NhZ2VUaW1lc3RhbXAgPSBtZXNzYWdlLnRpbWVzdGFtcDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChpc05hTihtZXNzYWdlVGltZXN0YW1wLmdldFRpbWUoKSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKGxvY2FsTGFzdERhdGUgPT09IG51bGwgfHwgIXRoaXMuaXNTYW1lRGF5KGxvY2FsTGFzdERhdGUsIG1lc3NhZ2VUaW1lc3RhbXApKSB7XG4gICAgICAgIGlmIChsb2NhbExhc3REYXRlICE9PSBudWxsKSBtYXJrZG93biArPSBgKioqXFxuXFxuYDtcbiAgICAgICAgbWFya2Rvd24gKz0gYCoqJHt0aGlzLmZvcm1hdERhdGVTZXBhcmF0b3IobWVzc2FnZVRpbWVzdGFtcCl9KipcXG4qKipcXG5cXG5gO1xuICAgICAgICBsb2NhbExhc3REYXRlID0gbWVzc2FnZVRpbWVzdGFtcDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHRpbWUgPSB0aGlzLmZvcm1hdFRpbWUobWVzc2FnZVRpbWVzdGFtcCk7XG4gICAgICBsZXQgcHJlZml4ID0gXCJcIjtcbiAgICAgIGxldCBjb250ZW50UHJlZml4ID0gXCJcIjtcbiAgICAgIGxldCBjb250ZW50ID0gbWVzc2FnZS5jb250ZW50LnRyaW0oKTtcbiAgICAgIGlmIChtZXNzYWdlLnJvbGUgPT09IFwiYXNzaXN0YW50XCIpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb250ZW50ID0gUmVuZGVyZXJVdGlscy5kZWNvZGVIdG1sRW50aXRpZXMoY29udGVudCk7XG4gICAgICAgICAgaWYgKFJlbmRlcmVyVXRpbHMuZGV0ZWN0VGhpbmtpbmdUYWdzKGNvbnRlbnQpLmhhc1RoaW5raW5nVGFncykge1xuICAgICAgICAgICAgY29udGVudCA9IGNvbnRlbnQucmVwbGFjZSgvPHRoaW5raW5nPltcXHNcXFNdKj88XFwvdGhpbmtpbmc+L2csIFwiXCIpLnRyaW0oKTtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UoLzx0aGluaz5bXFxzXFxTXSo/PFxcL3RoaW5rPi9nLCBcIlwiKS50cmltKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7fVxuICAgICAgICBpZiAoIWNvbnRlbnQpIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHN3aXRjaCAobWVzc2FnZS5yb2xlKSB7XG4gICAgICAgIGNhc2UgXCJ1c2VyXCI6XG4gICAgICAgICAgcHJlZml4ID0gYCoqVXNlciAoJHt0aW1lfSk6KipcXG5gO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYXNzaXN0YW50XCI6XG4gICAgICAgICAgcHJlZml4ID0gYCoqQXNzaXN0YW50ICgke3RpbWV9KToqKlxcbmA7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJzeXN0ZW1cIjpcbiAgICAgICAgICBwcmVmaXggPSBgPiBfW1N5c3RlbSAoJHt0aW1lfSldXyBcXG4+IGA7XG4gICAgICAgICAgY29udGVudFByZWZpeCA9IFwiPiBcIjtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImVycm9yXCI6XG4gICAgICAgICAgcHJlZml4ID0gYD4gWyFFUlJPUl0gRXJyb3IgKCR7dGltZX0pOlxcbj4gYDtcbiAgICAgICAgICBjb250ZW50UHJlZml4ID0gXCI+IFwiO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHByZWZpeCA9IGAqKiR7bWVzc2FnZS5yb2xlfSAoJHt0aW1lfSk6KipcXG5gO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgbWFya2Rvd24gKz0gcHJlZml4O1xuICAgICAgaWYgKGNvbnRlbnRQcmVmaXgpIHtcbiAgICAgICAgbWFya2Rvd24gKz1cbiAgICAgICAgICBjb250ZW50XG4gICAgICAgICAgICAuc3BsaXQoXCJcXG5cIilcbiAgICAgICAgICAgIC5tYXAoKGxpbmU6IHN0cmluZykgPT4gKGxpbmUudHJpbSgpID8gYCR7Y29udGVudFByZWZpeH0ke2xpbmV9YCA6IGNvbnRlbnRQcmVmaXgudHJpbSgpKSlcbiAgICAgICAgICAgIC5qb2luKGBcXG5gKSArIFwiXFxuXFxuXCI7XG4gICAgICB9IGVsc2UgaWYgKGNvbnRlbnQuaW5jbHVkZXMoXCJgYGBcIikpIHtcbiAgICAgICAgY29udGVudCA9IGNvbnRlbnRcbiAgICAgICAgICAucmVwbGFjZSgvKFxccj9cXG4pKmBgYC9nLCBcIlxcblxcbmBgYFwiKVxuICAgICAgICAgIC5yZXBsYWNlKC9gYGAoXFxyP1xcbikqL2csIFwiYGBgXFxuXFxuXCIpXG4gICAgICAgICAgLnRyaW0oKTtcbiAgICAgICAgbWFya2Rvd24gKz0gY29udGVudCArIFwiXFxuXFxuXCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtYXJrZG93biArPVxuICAgICAgICAgIGNvbnRlbnRcbiAgICAgICAgICAgIC5zcGxpdChcIlxcblwiKVxuICAgICAgICAgICAgLm1hcCgobGluZTogc3RyaW5nKSA9PiAobGluZS50cmltKCkgPyBsaW5lIDogXCJcIikpXG4gICAgICAgICAgICAuam9pbihcIlxcblwiKSArIFwiXFxuXFxuXCI7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIG1hcmtkb3duLnRyaW0oKTtcbiAgfVxuICBwcml2YXRlIGZvcm1hdFRpbWUoZGF0ZTogRGF0ZSk6IHN0cmluZyB7XG4gICAgaWYgKCEoZGF0ZSBpbnN0YW5jZW9mIERhdGUpIHx8IGlzTmFOKGRhdGUuZ2V0VGltZSgpKSkgcmV0dXJuIFwiPz86Pz9cIjtcbiAgICByZXR1cm4gZGF0ZS50b0xvY2FsZVRpbWVTdHJpbmcodW5kZWZpbmVkLCB7IGhvdXI6IFwibnVtZXJpY1wiLCBtaW51dGU6IFwiMi1kaWdpdFwiLCBob3VyMTI6IGZhbHNlIH0pO1xuICB9XG4gIHByaXZhdGUgZm9ybWF0RGF0ZVNlcGFyYXRvcihkYXRlOiBEYXRlKTogc3RyaW5nIHtcbiAgICBpZiAoIShkYXRlIGluc3RhbmNlb2YgRGF0ZSkgfHwgaXNOYU4oZGF0ZS5nZXRUaW1lKCkpKSByZXR1cm4gXCJVbmtub3duIERhdGVcIjtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IHllc3RlcmRheSA9IG5ldyBEYXRlKG5vdyk7XG4gICAgeWVzdGVyZGF5LnNldERhdGUobm93LmdldERhdGUoKSAtIDEpO1xuICAgIGlmICh0aGlzLmlzU2FtZURheShkYXRlLCBub3cpKSByZXR1cm4gXCJUb2RheVwiO1xuICAgIGlmICh0aGlzLmlzU2FtZURheShkYXRlLCB5ZXN0ZXJkYXkpKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjtcbiAgICBjb25zdCBzdGFydE9mVG9kYXkgPSBuZXcgRGF0ZShub3cuZ2V0RnVsbFllYXIoKSwgbm93LmdldE1vbnRoKCksIG5vdy5nZXREYXRlKCkpO1xuICAgIGNvbnN0IHN0YXJ0T2ZHaXZlbkRhdGUgPSBuZXcgRGF0ZShkYXRlLmdldEZ1bGxZZWFyKCksIGRhdGUuZ2V0TW9udGgoKSwgZGF0ZS5nZXREYXRlKCkpO1xuICAgIGNvbnN0IGRpZmZEYXlzID0gTWF0aC5mbG9vcigoc3RhcnRPZlRvZGF5LmdldFRpbWUoKSAtIHN0YXJ0T2ZHaXZlbkRhdGUuZ2V0VGltZSgpKSAvICgxMDAwICogNjAgKiA2MCAqIDI0KSk7XG4gICAgaWYgKGRpZmZEYXlzID4gMSAmJiBkaWZmRGF5cyA8IDcpIHtcbiAgICAgIHJldHVybiBkYXRlLnRvTG9jYWxlRGF0ZVN0cmluZyh1bmRlZmluZWQsIHsgd2Vla2RheTogXCJsb25nXCIgfSk7XG4gICAgfVxuICAgIHJldHVybiBkYXRlLnRvTG9jYWxlRGF0ZVN0cmluZyh1bmRlZmluZWQsIHsgeWVhcjogXCJudW1lcmljXCIsIG1vbnRoOiBcImxvbmdcIiwgZGF5OiBcIm51bWVyaWNcIiB9KTtcbiAgfVxuICBwcml2YXRlIGZvcm1hdFJlbGF0aXZlRGF0ZShkYXRlOiBEYXRlKTogc3RyaW5nIHtcbiAgICBpZiAoIShkYXRlIGluc3RhbmNlb2YgRGF0ZSkgfHwgaXNOYU4oZGF0ZS5nZXRUaW1lKCkpKSB7XG4gICAgICByZXR1cm4gXCJJbnZhbGlkIGRhdGVcIjtcbiAgICB9XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCBkaWZmU2Vjb25kcyA9IE1hdGgucm91bmQoKG5vdy5nZXRUaW1lKCkgLSBkYXRlLmdldFRpbWUoKSkgLyAxMDAwKTtcbiAgICBjb25zdCBkaWZmTWludXRlcyA9IE1hdGguZmxvb3IoZGlmZlNlY29uZHMgLyA2MCk7XG4gICAgY29uc3QgZGlmZkhvdXJzID0gTWF0aC5mbG9vcihkaWZmTWludXRlcyAvIDYwKTtcbiAgICBjb25zdCBkaWZmRGF5cyA9IE1hdGguZmxvb3IoZGlmZkhvdXJzIC8gMjQpO1xuICAgIGlmIChkaWZmU2Vjb25kcyA8IDUpIHJldHVybiBcIkp1c3Qgbm93XCI7XG4gICAgaWYgKGRpZmZTZWNvbmRzIDwgNjApIHJldHVybiBgJHtkaWZmU2Vjb25kc31zIGFnb2A7XG4gICAgaWYgKGRpZmZNaW51dGVzIDwgNjApIHJldHVybiBgJHtkaWZmTWludXRlc31tIGFnb2A7XG4gICAgaWYgKGRpZmZIb3VycyA8IDIpIHJldHVybiBgMWggYWdvYDtcbiAgICBpZiAoZGlmZkhvdXJzIDwgMjQpIHJldHVybiBgJHtkaWZmSG91cnN9aCBhZ29gO1xuICAgIGlmIChkaWZmRGF5cyA9PT0gMSkgcmV0dXJuIFwiWWVzdGVyZGF5XCI7XG4gICAgaWYgKGRpZmZEYXlzIDwgNykgcmV0dXJuIGAke2RpZmZEYXlzfWQgYWdvYDtcbiAgICByZXR1cm4gZGF0ZS50b0xvY2FsZURhdGVTdHJpbmcodW5kZWZpbmVkLCB7XG4gICAgICBtb250aDogXCJzaG9ydFwiLFxuICAgICAgZGF5OiBcIm51bWVyaWNcIixcbiAgICAgIHllYXI6IGRhdGUuZ2V0RnVsbFllYXIoKSAhPT0gbm93LmdldEZ1bGxZZWFyKCkgPyBcIm51bWVyaWNcIiA6IHVuZGVmaW5lZCxcbiAgICB9KTtcbiAgfVxuICBwcml2YXRlIGlzU2FtZURheShkYXRlMTogRGF0ZSwgZGF0ZTI6IERhdGUpOiBib29sZWFuIHtcbiAgICBpZiAoIShkYXRlMSBpbnN0YW5jZW9mIERhdGUpIHx8ICEoZGF0ZTIgaW5zdGFuY2VvZiBEYXRlKSB8fCBpc05hTihkYXRlMS5nZXRUaW1lKCkpIHx8IGlzTmFOKGRhdGUyLmdldFRpbWUoKSkpXG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIChcbiAgICAgIGRhdGUxLmdldEZ1bGxZZWFyKCkgPT09IGRhdGUyLmdldEZ1bGxZZWFyKCkgJiZcbiAgICAgIGRhdGUxLmdldE1vbnRoKCkgPT09IGRhdGUyLmdldE1vbnRoKCkgJiZcbiAgICAgIGRhdGUxLmdldERhdGUoKSA9PT0gZGF0ZTIuZ2V0RGF0ZSgpXG4gICAgKTtcbiAgfVxuICBwdWJsaWMgZGVzdHJveSgpOiB2b2lkIHtcbiAgICB0aGlzLmNvbnRhaW5lckVsPy5yZW1vdmUoKTtcbiAgICB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLmNsZWFyKCk7XG4gIH1cblxuICAvLyBzcmMvU2lkZWJhck1hbmFnZXIudHNcblxucHJpdmF0ZSBoYW5kbGVEcmFnU3RhcnQoZXZlbnQ6IERyYWdFdmVudCwgbm9kZTogSGllcmFyY2h5Tm9kZSk6IHZvaWQge1xuICBcbiAgaWYgKCFldmVudC5kYXRhVHJhbnNmZXIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgfVxuXG4gIGxldCBpZDogc3RyaW5nO1xuICBsZXQgcGF0aDogc3RyaW5nO1xuICBsZXQgbmFtZTogc3RyaW5nO1xuXG4gIGlmIChub2RlLnR5cGUgPT09ICdjaGF0Jykge1xuICAgICAgaWQgPSBub2RlLm1ldGFkYXRhLmlkO1xuICAgICAgcGF0aCA9IG5vZGUuZmlsZVBhdGg7XG4gICAgICBuYW1lID0gbm9kZS5tZXRhZGF0YS5uYW1lO1xuICB9IGVsc2UgeyAvLyBub2RlLnR5cGUgPT09ICdmb2xkZXInXG4gICAgICBpZCA9IG5vZGUucGF0aDtcbiAgICAgIHBhdGggPSBub2RlLnBhdGg7XG4gICAgICBuYW1lID0gbm9kZS5uYW1lO1xuICB9XG5cbiAgdGhpcy5kcmFnZ2VkSXRlbURhdGEgPSB7IHR5cGU6IG5vZGUudHlwZSwgaWQ6IGlkLCBwYXRoOiBwYXRoLCBuYW1lOiBuYW1lIH07XG5cbiAgZXZlbnQuZGF0YVRyYW5zZmVyLnNldERhdGEoJ3RleHQvcGxhaW4nLCBKU09OLnN0cmluZ2lmeSh0aGlzLmRyYWdnZWRJdGVtRGF0YSkpO1xuICBldmVudC5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdtb3ZlJztcblxuICBpZiAoZXZlbnQudGFyZ2V0IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHtcbiAgICBldmVudC50YXJnZXQuYWRkQ2xhc3MoJ2lzLWRyYWdnaW5nJyk7XG4gIH1cbiAgXG4gIC8vIC0tLSDQlNCe0JTQkNCd0J46INCg0L7QsdC40LzQviByb290RHJvcFpvbmUg0LLQuNC00LjQvNC+0Y4gLS0tXG4gIGlmICh0aGlzLmNvbnRhaW5lckVsKSB7IC8vINCf0LXRgNC10LrQvtC90YPRlNC80L7RgdGMLCDRidC+INCz0L7Qu9C+0LLQvdC40Lkg0LrQvtC90YLQtdC50L3QtdGAINGW0YHQvdGD0ZRcbiAgICAgIHRoaXMuY29udGFpbmVyRWwuY2xhc3NMaXN0LmFkZCgnc2lkZWJhci1kcmFnLWFjdGl2ZScpO1xuICAgICAgICB9XG4gIC8vIC0tLSDQmtCG0J3QldCm0Kwg0JTQntCU0JDQndCe0JPQniAtLS1cblxuICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgfVxuXG5cbiAgLy8gc3JjL1NpZGViYXJNYW5hZ2VyLnRzXG5cbnByaXZhdGUgaGFuZGxlRHJhZ0VuZChldmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG4gIC8vIC0tLSDQlNCe0JTQkNCd0J46INCl0L7QstCw0ZTQvNC+IHJvb3REcm9wWm9uZSAtLS1cbiAgaWYgKHRoaXMuY29udGFpbmVyRWwpIHsgLy8g0J/QtdGA0LXQutC+0L3Rg9GU0LzQvtGB0YwsINGJ0L4g0LPQvtC70L7QstC90LjQuSDQutC+0L3RgtC10LnQvdC10YAg0ZbRgdC90YPRlFxuICAgICAgdGhpcy5jb250YWluZXJFbC5jbGFzc0xpc3QucmVtb3ZlKCdzaWRlYmFyLWRyYWctYWN0aXZlJyk7XG4gICAgICAgIH1cbiAgLy8g0KLQsNC60L7QtiDQv9GA0LjQsdC40YDQsNGU0LzQviDQv9GW0LTRgdCy0ZbRh9GD0LLQsNC90L3RjyDQtyDRgdCw0LzQvtGXINC30L7QvdC4LCDRj9C60YnQviDQstC+0L3QviDQsdGD0LvQvlxuICBpZiAodGhpcy5yb290RHJvcFpvbmVFbCkge1xuICAgICAgdGhpcy5yb290RHJvcFpvbmVFbC5yZW1vdmVDbGFzcygnZHJhZy1vdmVyLXJvb3QtdGFyZ2V0Jyk7XG4gIH1cbiAgLy8gLS0tINCa0IbQndCV0KbQrCDQlNCe0JTQkNCd0J7Qk9CeIC0tLVxuXG5cbiAgLy8g0J7Rh9C40YnQsNGU0LzQviDRgdGC0LjQu9GWINC3INC10LvQtdC80LXQvdGC0LAsINGP0LrQuNC5INC/0LXRgNC10YLRj9Cz0YPQstCw0LvQuFxuICBpZiAoZXZlbnQudGFyZ2V0IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHtcbiAgICBldmVudC50YXJnZXQucmVtb3ZlQ2xhc3MoJ2lzLWRyYWdnaW5nJyk7XG4gICAgLy8gZXZlbnQudGFyZ2V0LnN0eWxlLm9wYWNpdHkgPSAnJzsgLy8g0K/QutGJ0L4g0LLQuCDQt9C80ZbQvdGO0LLQsNC70Lggb3BhY2l0eSDQvdCw0L/RgNGP0LzRg1xuICB9XG4gIC8vINCe0YfQuNGJ0LDRlNC80L4g0LLRltC30YPQsNC70YzQvdC1INC/0ZbQtNGB0LLRltGH0YPQstCw0L3QvdGPINC3INGD0YHRltGFINC80L7QttC70LjQstC40YUg0YbRltC70LXQuSAo0L/QsNC/0L7QuilcbiAgdGhpcy5jb250YWluZXJFbD8ucXVlcnlTZWxlY3RvckFsbCgnLmRyYWctb3Zlci10YXJnZXQnKS5mb3JFYWNoKGVsID0+IGVsLnJlbW92ZUNsYXNzKCdkcmFnLW92ZXItdGFyZ2V0JykpO1xuICBcbiAgdGhpcy5kcmFnZ2VkSXRlbURhdGEgPSBudWxsOyAvLyDQodC60LjQtNCw0ZTQvNC+INC30LHQtdGA0LXQttC10L3RliDQtNCw0L3RliDQv9GA0L4g0L/QtdGA0LXRgtGP0LPRg9Cy0LDQvdC40Lkg0LXQu9C10LzQtdC90YJcbiAgdGhpcy5wbHVnaW4ubG9nZ2VyLnRyYWNlKCdEcmFnIEVuZDogQ2xlYW5lZCB1cCBkcmFnZ2VkSXRlbURhdGEgYW5kIHN0eWxlcy4nKTtcbn1cblxuICBwcml2YXRlIGhhbmRsZURyYWdPdmVyKGV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGlmIChldmVudC5kYXRhVHJhbnNmZXIpIHtcbiAgICAgIGV2ZW50LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ21vdmUnO1xuICAgIH1cbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTsgLy8g0JTQo9CW0JUg0JLQkNCW0JvQmNCS0J46INC30YPQv9C40L3Rj9GU0LzQviDRgdC/0LvQuNCy0LDQvdC90Y9cbiAgICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoXCJbRHJhZ092ZXIgRm9sZGVySXRlbV0gRXZlbnQgZmlyZWQgYW5kIHByb3BhZ2F0aW9uIHN0b3BwZWQuXCIpO1xufVxuXG4gIHByaXZhdGUgaGFuZGxlRHJhZ0VudGVyKGV2ZW50OiBEcmFnRXZlbnQsIHRhcmdldE5vZGU6IEZvbGRlck5vZGUpOiB2b2lkIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyAvLyDQktCw0LbQu9C40LLQviDQtNC70Y8g0LTQtdGP0LrQuNGFINCx0YDQsNGD0LfQtdGA0ZbQslxuICAgIGNvbnN0IHRhcmdldEVsZW1lbnQgPSBldmVudC5jdXJyZW50VGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgIGlmICghdGFyZ2V0RWxlbWVudCB8fCAhdGhpcy5kcmFnZ2VkSXRlbURhdGEpIHJldHVybjtcblxuICAgIC8vINCR0LDQt9C+0LLQsCDQv9C10YDQtdCy0ZbRgNC60LA6INGH0Lgg0LzQvtC20L3QsCDRgdC60LjQtNCw0YLQuCDRgdGO0LTQuD9cbiAgICBsZXQgY2FuRHJvcCA9IGZhbHNlO1xuICAgIGlmICh0aGlzLmRyYWdnZWRJdGVtRGF0YS50eXBlID09PSAnY2hhdCcpIHtcbiAgICAgICAgLy8g0KfQsNGC0Lgg0LzQvtC20L3QsCDRgdC60LjQtNCw0YLQuCDQsiDQsdGD0LTRjC3Rj9C60YMg0L/QsNC/0LrRg1xuICAgICAgICBjYW5Ecm9wID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZHJhZ2dlZEl0ZW1EYXRhLnR5cGUgPT09ICdmb2xkZXInKSB7XG4gICAgICAgIC8vINCf0LDQv9C60YMg0L3QtSDQvNC+0LbQvdCwINGB0LrQuNC00LDRgtC4INCyINGB0LXQsdC1INCw0LHQviDRgyDRgdCy0L7Rl9GFINC90LDRidCw0LTQutGW0LJcbiAgICAgICAgY29uc3QgZHJhZ2dlZFBhdGggPSB0aGlzLmRyYWdnZWRJdGVtRGF0YS5wYXRoO1xuICAgICAgICBjb25zdCB0YXJnZXRQYXRoID0gdGFyZ2V0Tm9kZS5wYXRoO1xuICAgICAgICBpZiAoZHJhZ2dlZFBhdGggIT09IHRhcmdldFBhdGggJiYgIXRhcmdldFBhdGguc3RhcnRzV2l0aChkcmFnZ2VkUGF0aCArICcvJykpIHtcbiAgICAgICAgICAgIGNhbkRyb3AgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8g0JTQvtC00LDRlNC80L4g0LrQu9Cw0YEg0LTQu9GPINCy0ZbQt9GD0LDQu9GM0L3QvtCz0L4g0YTRltC00LHQtdC60YMsINGP0LrRidC+INGB0LrQuNC00LDQvdC90Y8g0LzQvtC20LvQuNCy0LVcbiAgICBpZiAoY2FuRHJvcCkge1xuICAgICAgICB0YXJnZXRFbGVtZW50LmFkZENsYXNzKCdkcmFnLW92ZXItdGFyZ2V0Jyk7XG4gICAgICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShgRHJhZyBFbnRlcjogVGFyZ2V0PSR7dGFyZ2V0Tm9kZS5wYXRofSwgQ2FuIERyb3A9JHtjYW5Ecm9wfWApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlRHJhZ0xlYXZlKGV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcbiAgICAvLyDQn9GA0LjQsdC40YDQsNGU0LzQviDQutC70LDRgSDQv9GW0LTRgdCy0ZbRh9GD0LLQsNC90L3Rj1xuICAgIC8vINCf0L7RgtGA0ZbQsdC90L4g0LHRg9GC0Lgg0L7QsdC10YDQtdC20L3QuNC8LCDRidC+0LEg0L3QtSDQv9GA0LjQsdGA0LDRgtC4INC50L7Qs9C+INC/0YDQuCDQstGF0L7QtNGWINCyINC00L7Rh9GW0YDQvdGW0Lkg0LXQu9C10LzQtdC90YJcbiAgICAvLyDQn9GA0L7RgdGC0LjQuSDQstCw0YDRltCw0L3RgiAtINC/0YDQvtGB0YLQviDQv9GA0LjQsdGA0LDRgtC4XG4gICAgY29uc3QgdGFyZ2V0RWxlbWVudCA9IGV2ZW50LmN1cnJlbnRUYXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgaWYgKHRhcmdldEVsZW1lbnQpIHtcbiAgICAgICAgdGFyZ2V0RWxlbWVudC5yZW1vdmVDbGFzcygnZHJhZy1vdmVyLXRhcmdldCcpO1xuICAgICAgICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoYERyYWcgTGVhdmU6IFRhcmdldD0ke3RhcmdldEVsZW1lbnQuZGF0YXNldC5wYXRofWApO1xuICAgIH1cbiAgfVxuXG4gIFxuXG4gIHByaXZhdGUgaGFuZGxlRHJhZ092ZXJSb290KGV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGlmIChldmVudC5kYXRhVHJhbnNmZXIpIHtcbiAgICAgICAgZXZlbnQuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnbW92ZSc7XG4gICAgfVxuXG4gICAgLy8g0J7RgdC60ZbQu9GM0LrQuCDQv9Cw0L/QutC4INC30YPQv9C40L3Rj9GO0YLRjCDRgdC/0LvQuNCy0LDQvdC90Y8sINGG0LXQuSBldmVudC50YXJnZXQg0LHRg9C00LUg0YHQsNC80LjQvCBjaGF0UGFuZWxMaXN0Q29udGFpbmVyRWxcbiAgICAvLyDQsNCx0L4g0LTQvtGH0ZbRgNC90ZbQvCDQtdC70LXQvNC10L3RgtC+0LwsINGP0LrQuNC5INCd0JUg0ZQg0L/QsNC/0LrQvtGOICjQvdCw0L/RgNC40LrQu9Cw0LQsINGH0LDRgtC+0LwsINGP0LrQuNC5INC90LUg0ZQgZHJvcCB0YXJnZXQpLlxuICAgIC8vINCv0LrRidC+IGV2ZW50LnRhcmdldCAtINGG0LUg0YfQsNGCLCDRgtC+INC80Lgg0LLRgdC1INC+0LTQvdC+INGF0L7Rh9C10LzQviwg0YnQvtCxINC60L7RgNGW0L3RjCDQsdGD0LIg0YbRltC70LvRji5cblxuICAgIGlmICghdGhpcy5kcmFnZ2VkSXRlbURhdGEpIHtcbiAgICAgICAgKGV2ZW50LmN1cnJlbnRUYXJnZXQgYXMgSFRNTEVsZW1lbnQpLnJlbW92ZUNsYXNzKCdkcmFnLW92ZXItcm9vdC10YXJnZXQnKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vINCS0LDQu9GW0LTQsNGG0ZbRjzog0YfQuCDQvdC1INC/0LXRgNC10YLRj9Cz0YPRlNC80L4g0LXQu9C10LzQtdC90YIsINGJ0L4g0LLQttC1INCyINC60L7RgNC10L3Rliwg0YMg0LrQvtGA0ZbQvdGMP1xuICAgIGNvbnN0IHJvb3RGb2xkZXJQYXRoID0gbm9ybWFsaXplUGF0aCh0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jaGF0c0ZvbGRlclBhdGgpO1xuICAgIGNvbnN0IGRyYWdnZWRQYXRoID0gdGhpcy5kcmFnZ2VkSXRlbURhdGEucGF0aDtcbiAgICBsZXQgc291cmNlUGFyZW50UGF0aCA9IG5vcm1hbGl6ZVBhdGgoZHJhZ2dlZFBhdGguc3Vic3RyaW5nKDAsIGRyYWdnZWRQYXRoLmxhc3RJbmRleE9mKCcvJykpIHx8ICcvJyk7XG5cbiAgICAvLyDQodC/0LXRhtGW0LDQu9GM0L3QsCDQvtCx0YDQvtCx0LrQsCDQtNC70Y8g0L/QsNC/0L7Quiwg0YnQviDQt9C90LDRhdC+0LTRj9GC0YzRgdGPINCx0LXQt9C/0L7RgdC10YDQtdC00L3RjNC+INCyINC60L7RgNC10L3RliBcIi9cIlxuICAgIGlmICh0aGlzLmRyYWdnZWRJdGVtRGF0YS50eXBlID09PSAnZm9sZGVyJyAmJiByb290Rm9sZGVyUGF0aCA9PT0gJy8nICYmICFkcmFnZ2VkUGF0aC5pbmNsdWRlcygnLycpKSB7XG4gICAgICAgIHNvdXJjZVBhcmVudFBhdGggPSAnLyc7IC8vINCH0YXQvdGW0Lkg0LHQsNGC0YzQutC+IC0g0YbQtSDQutC+0YDRltC90YxcbiAgICB9XG5cblxuICAgIGlmIChzb3VyY2VQYXJlbnRQYXRoID09PSByb290Rm9sZGVyUGF0aCkge1xuICAgICAgICAoZXZlbnQuY3VycmVudFRhcmdldCBhcyBIVE1MRWxlbWVudCkucmVtb3ZlQ2xhc3MoJ2RyYWctb3Zlci1yb290LXRhcmdldCcpO1xuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoXCJbRHJhZ092ZXJSb290XSBJdGVtIGFscmVhZHkgYXQgcm9vdCwgbm8gaGlnaGxpZ2h0IGZvciByb290LlwiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAoZXZlbnQuY3VycmVudFRhcmdldCBhcyBIVE1MRWxlbWVudCkuYWRkQ2xhc3MoJ2RyYWctb3Zlci1yb290LXRhcmdldCcpO1xuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoXCJbRHJhZ092ZXJSb290XSBPdmVyIHJvb3QgZW1wdHkgc3BhY2Uvbm9uLWZvbGRlciBjaGlsZCwgaXRlbSBub3QgYXQgcm9vdC4gQWRkZWQgcm9vdCBoaWdobGlnaHQuXCIpO1xuICAgIH1cbn1cblxuLy8g0KbQtdC5INC80LXRgtC+0LQg0LLQuNC60LvQuNC60LDRlNGC0YzRgdGPLCDQutC+0LvQuCDQvNC40YjQsCDQktCl0J7QlNCY0KLQrCDQsiDQvNC10LbRliBjaGF0UGFuZWxMaXN0Q29udGFpbmVyRWxcbi8vINCc0L7QttC1INCx0YPRgtC4INC80LXQvdGIINCy0LDQttC70LjQstC40LwsINGP0LrRidC+IGhhbmRsZURyYWdPdmVyUm9vdCDQstGB0LUg0LrQvtGA0LXQutGC0L3QviDQvtCx0YDQvtCx0LvRj9GULlxucHJpdmF0ZSBoYW5kbGVEcmFnRW50ZXJSb290KGV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcbiAgZXZlbnQucHJldmVudERlZmF1bHQoKTsgLy8g0J/QvtGC0YDRltCx0L3QviDQtNC70Y8g0LrQvtC90YHQuNGB0YLQtdC90YLQvdC+0YHRgtGWXG4gIC8vINCb0L7Qs9GW0LrRgyDQv9GW0LTRgdCy0ZbRh9GD0LLQsNC90L3RjyDRgtC10L/QtdGAINC60YDQsNGJ0LUg0L/QtdGA0LXQvdC10YHRgtC4INCyIGhhbmRsZURyYWdPdmVyUm9vdCxcbiAgLy8g0L7RgdC60ZbQu9GM0LrQuCBkcmFnZW50ZXIg0YHQv9GA0LDRhtGM0L7QstGD0ZQg0L7QtNC40L0g0YDQsNC3LCDQsCBkcmFnb3ZlciAtINC/0L7RgdGC0ZbQudC90L4uXG4gIC8vINCc0L7QttC90LAg0L/RgNC+0YHRgtC+INC70L7Qs9GD0LLQsNGC0Lgg0YLRg9GCINC00LvRjyDQstGW0LTRgdGC0LXQttC10L3QvdGPLlxuICB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoYFtEcmFnRW50ZXJSb290XSBNb3VzZSBlbnRlcmVkIHJvb3QgY29udGFpbmVyIGJvdW5kcy5gKTtcbiAgLy8g0KHQv9GA0L7QsdGD0ZTQvNC+INCy0LjQutC70LjQutCw0YLQuCDQu9C+0LPRltC60YMgaGFuZGxlRHJhZ092ZXJSb290LCDRidC+0LEg0LLRgdGC0LDQvdC+0LLQuNGC0Lgg0L/QvtGH0LDRgtC60L7QstC40Lkg0YHRgtCw0L0g0L/RltC00YHQstGW0YfRg9Cy0LDQvdC90Y9cbiAgdGhpcy5oYW5kbGVEcmFnT3ZlclJvb3QoZXZlbnQpO1xufVxuICBcbnByaXZhdGUgaGFuZGxlRHJhZ0xlYXZlUm9vdChldmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG4gIGNvbnN0IGxpc3RlbmluZ0VsZW1lbnQgPSBldmVudC5jdXJyZW50VGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAvLyByZWxhdGVkVGFyZ2V0IC0g0YbQtSDQtdC70LXQvNC10L3Rgiwg0L3QsCDRj9C60LjQuSDQv9C10YDQtdGF0L7QtNC40YLRjCDQutGD0YDRgdC+0YAuXG4gIC8vINCv0LrRidC+INC60YPRgNGB0L7RgCDQv9C+0LrQuNC90YPQsiDQutC+0L3RgtC10LnQvdC10YAg0L/QvtCy0L3RltGB0YLRjiAocmVsYXRlZFRhcmdldCDQvdC1INGUINC00L7Rh9GW0YDQvdGW0Lwg0LDQsdC+IG51bGwpLFxuICAvLyDRgtC+0LTRliDQv9GA0LjQsdC40YDQsNGU0LzQviDQv9GW0LTRgdCy0ZbRh9GD0LLQsNC90L3Rjy5cbiAgaWYgKCFldmVudC5yZWxhdGVkVGFyZ2V0IHx8ICEobGlzdGVuaW5nRWxlbWVudC5jb250YWlucyhldmVudC5yZWxhdGVkVGFyZ2V0IGFzIE5vZGUpKSkge1xuICAgICAgbGlzdGVuaW5nRWxlbWVudC5yZW1vdmVDbGFzcygnZHJhZy1vdmVyLXJvb3QtdGFyZ2V0Jyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLnRyYWNlKFwiW0RyYWdMZWF2ZVJvb3RdIE1vdXNlIG1vdmVkIHRvIGEgY2hpbGQgd2l0aGluIHJvb3QuIEhpZ2hsaWdodCBwZXJzaXN0cyBvciBoYW5kbGVkIGJ5IGNoaWxkLlwiKTtcbiAgfVxufVxuXG5wcml2YXRlIGFzeW5jIGhhbmRsZURyb3AoZXZlbnQ6IERyYWdFdmVudCwgdGFyZ2V0Tm9kZTogRm9sZGVyTm9kZSk6IFByb21pc2U8dm9pZD4ge1xuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyAvLyDQl9Cw0LHQvtGA0L7QvdGP0ZTQvNC+INGB0YLQsNC90LTQsNGA0YLQvdGDINC+0LHRgNC+0LHQutGDXG4gIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpOyAvLyDQlNCj0JbQlSDQktCQ0JbQm9CY0JLQnjog0LfRg9C/0LjQvdGP0ZTQvNC+INGB0L/Qu9C40LLQsNC90L3RjyDQv9C+0LTRltGXINC00L4g0LHQsNGC0YzQutGW0LLRgdGM0LrQuNGFINC10LvQtdC80LXQvdGC0ZbQsiAo0L3QsNC/0YDQuNC60LvQsNC0LCBjaGF0UGFuZWwpXG5cbiAgY29uc3QgdGFyZ2V0RWxlbWVudCA9IGV2ZW50LmN1cnJlbnRUYXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gIHRhcmdldEVsZW1lbnQucmVtb3ZlQ2xhc3MoJ2RyYWctb3Zlci10YXJnZXQnKTsgLy8g0J/RgNC40LHQuNGA0LDRlNC80L4g0LLRltC30YPQsNC70YzQvdC1INC/0ZbQtNGB0LLRltGH0YPQstCw0L3QvdGPINGG0ZbQu9GWXG5cbiAgLy8g0J/QtdGA0LXQstGW0YDRj9GU0LzQviwg0YfQuCDRlCDQtNCw0L3RliDQv9GA0L4g0L/QtdGA0LXRgtGP0LPRg9Cy0LDQvdC40Lkg0LXQu9C10LzQtdC90YJcbiAgaWYgKCF0aGlzLmRyYWdnZWRJdGVtRGF0YSB8fCAhZXZlbnQuZGF0YVRyYW5zZmVyKSB7XG4gICAgICAgICAgICB0aGlzLmRyYWdnZWRJdGVtRGF0YSA9IG51bGw7IC8vINCe0YfQuNGJ0LDRlNC80L4g0L/RgNC+INCy0YHRj9C6INCy0LjQv9Cw0LTQvtC6XG4gICAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBkcmFnZ2VkRGF0YSA9IHsgLi4udGhpcy5kcmFnZ2VkSXRlbURhdGEgfTsgLy8g0JrQvtC/0ZbRjtGU0LzQviDQtNCw0L3Rliwg0LHQviDQvtGA0LjQs9GW0L3QsNC7INC30LDRgNCw0Lcg0YHQutC40L3QtdC80L5cbiAgdGhpcy5kcmFnZ2VkSXRlbURhdGEgPSBudWxsOyAvLyDQntGH0LjRidCw0ZTQvNC+INC00LDQvdGWINC/0YDQviDQv9C10YDQtdGC0Y/Qs9GD0LLQsNC90LjQuSDQtdC70LXQvNC10L3RglxuXG4gIGNvbnN0IHRhcmdldEZvbGRlclBhdGggPSB0YXJnZXROb2RlLnBhdGg7IC8vINCo0LvRj9GFINC00L4g0YbRltC70YzQvtCy0L7RlyDQv9Cw0L/QutC4XG4gIFxuICAvLyAtLS0g0JLQkNCb0IbQlNCQ0KbQhtCvIC0tLVxuICAvLyAxLiDQktC40LfQvdCw0YfQsNGU0LzQviDQsdCw0YLRjNC60ZbQstGB0YzQutGDINC/0LDQv9C60YMg0LXQu9C10LzQtdC90YLQsCwg0YnQviDQv9C10YDQtdGC0Y/Qs9GD0ZTRgtGM0YHRj1xuICBjb25zdCBzb3VyY2VQYXJlbnRQYXRoID0gbm9ybWFsaXplUGF0aChkcmFnZ2VkRGF0YS5wYXRoLnN1YnN0cmluZygwLCBkcmFnZ2VkRGF0YS5wYXRoLmxhc3RJbmRleE9mKCcvJykpIHx8ICcvJyk7XG5cbiAgLy8gMi4g0J3QtSDQvNC+0LbQvdCwINGB0LrQuNC00LDRgtC4INC/0LDQv9C60YMg0YHQsNC80YMg0LIg0YHQtdCx0LVcbiAgaWYgKGRyYWdnZWREYXRhLnR5cGUgPT09ICdmb2xkZXInICYmIGRyYWdnZWREYXRhLnBhdGggPT09IHRhcmdldEZvbGRlclBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgfVxuICAvLyAzLiDQndC1INC80L7QttC90LAg0YHQutC40LTQsNGC0Lgg0YfQsNGCINCyINGC0YMg0YHQsNC80YMg0L/QsNC/0LrRgywg0LTQtSDQstGW0L0g0LLQttC1INGUXG4gIGlmIChkcmFnZ2VkRGF0YS50eXBlID09PSAnY2hhdCcgJiYgc291cmNlUGFyZW50UGF0aCA9PT0gbm9ybWFsaXplUGF0aCh0YXJnZXRGb2xkZXJQYXRoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICB9XG4gIC8vIDQuINCd0LUg0LzQvtC20L3QsCDRgdC60LjQtNCw0YLQuCDQv9Cw0L/QutGDINCyINGX0Zcg0LLQu9Cw0YHQvdGDINC00L7Rh9GW0YDQvdGOINC/0LDQv9C60YNcbiAgaWYgKGRyYWdnZWREYXRhLnR5cGUgPT09ICdmb2xkZXInICYmIHRhcmdldEZvbGRlclBhdGguc3RhcnRzV2l0aChkcmFnZ2VkRGF0YS5wYXRoICsgJy8nKSkge1xuICAgICAgbmV3IE5vdGljZShcIkNhbm5vdCBtb3ZlIGEgZm9sZGVyIGluc2lkZSBpdHNlbGYgb3IgaXRzIGRlc2NlbmRhbnRzLlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIC0tLSDQktCY0JrQntCd0JDQndCd0K8g0JTQhtCHIC0tLVxuICBsZXQgc3VjY2VzcyA9IGZhbHNlO1xuICBjb25zdCBub3RpY2VNZXNzYWdlID0gYE1vdmluZyAke2RyYWdnZWREYXRhLnR5cGV9IFwiJHtkcmFnZ2VkRGF0YS5uYW1lfVwiIHRvIFwiJHt0YXJnZXROb2RlLm5hbWV9XCIuLi5gO1xuICBjb25zdCBub3RpY2UgPSBuZXcgTm90aWNlKG5vdGljZU1lc3NhZ2UsIDApOyAvLyDQn9C+0LrQsNC30YPRlNC80L4g0YHQv9C+0LLRltGJ0LXQvdC90Y8g0L/RgNC+INC/0YDQvtGG0LXRgVxuXG4gIHRyeSB7XG4gICAgICBpZiAoZHJhZ2dlZERhdGEudHlwZSA9PT0gJ2NoYXQnKSB7XG4gICAgICAgICAgLy8g0J/QtdGA0LXQvNGW0YnRg9GU0LzQviDRh9Cw0YJcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLm1vdmVDaGF0KGRyYWdnZWREYXRhLmlkLCBkcmFnZ2VkRGF0YS5wYXRoLCB0YXJnZXRGb2xkZXJQYXRoKTtcbiAgICAgIH0gZWxzZSBpZiAoZHJhZ2dlZERhdGEudHlwZSA9PT0gJ2ZvbGRlcicpIHtcbiAgICAgICAgICAvLyDQn9C10YDQtdC80ZbRidGD0ZTQvNC+INC/0LDQv9C60YMgKNCy0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4gcmVuYW1lRm9sZGVyLCDQvtGB0LrRltC70YzQutC4INGG0LUg0LfQvNGW0L3QsCDRiNC70Y/RhdGDKVxuICAgICAgICAgIGNvbnN0IGZvbGRlck5hbWUgPSBkcmFnZ2VkRGF0YS5uYW1lOyAvLyDQhtC8J9GPINC/0LDQv9C60LgsINGJ0L4g0L/QtdGA0LXRgtGP0LPRg9GU0YLRjNGB0Y9cbiAgICAgICAgICBjb25zdCBuZXdQYXRoID0gbm9ybWFsaXplUGF0aChgJHt0YXJnZXRGb2xkZXJQYXRofS8ke2ZvbGRlck5hbWV9YCk7IC8vINCd0L7QstC40Lkg0L/QvtCy0L3QuNC5INGI0LvRj9GFINC00LvRjyDQv9Cw0L/QutC4XG5cbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoZHJhZ2dlZERhdGEucGF0aCA9PT0gbmV3UGF0aCkgeyAvLyDQr9C60YnQviDRiNC70Y/RhSDQvdC1INC30LzRltC90LjQstGB0Y8gKNC80LDQu9C+INCxINCy0ZbQtNGE0ZbQu9GM0YLRgNGD0LLQsNGC0LjRgdGPINGA0LDQvdGW0YjQtSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3MgPSB0cnVlO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vINCf0LXRgNC10LLRltGA0LrQsCDQvdCwINC60L7QvdGE0LvRltC60YIg0ZbQvNC10L0g0YMg0YbRltC70YzQvtCy0ZbQuSDQv9Cw0L/RhtGWXG4gICAgICAgICAgICAgIGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIuZXhpc3RzKG5ld1BhdGgpO1xuICAgICAgICAgICAgICBpZiAoZXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGBBbiBpdGVtIG5hbWVkIFwiJHtmb2xkZXJOYW1lfVwiIGFscmVhZHkgZXhpc3RzIGluIHRoZSBmb2xkZXIgXCIke3RhcmdldE5vZGUubmFtZX1cIi5gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZW5hbWVGb2xkZXIoZHJhZ2dlZERhdGEucGF0aCwgbmV3UGF0aCk7XG4gICAgICAgICAgICAgICAgICAvLyDQntC90L7QstC70Y7RlNC80L4g0YHRgtCw0L0g0YDQvtC30LPQvtGA0L3Rg9GC0L7RgdGC0ZYg0L/QsNC/0LrQuCwg0Y/QutGJ0L4g0LLQvtC90LAg0LHRg9C70LAg0L/QtdGA0LXQvNGW0YnQtdC90LBcbiAgICAgICAgICAgICAgICAgIGlmIChzdWNjZXNzICYmIHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuaGFzKGRyYWdnZWREYXRhLnBhdGgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgY29uc3Qgd2FzRXhwYW5kZWQgPSB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLmdldChkcmFnZ2VkRGF0YS5wYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLmRlbGV0ZShkcmFnZ2VkRGF0YS5wYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLnNldChuZXdQYXRoLCB3YXNFeHBhbmRlZCEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfSBjYXRjaChlcnJvcikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgbW92aW5nICR7ZHJhZ2dlZERhdGEudHlwZX0uIENoZWNrIGNvbnNvbGUuYCk7XG4gICAgICBzdWNjZXNzID0gZmFsc2U7XG4gIH0gZmluYWxseSB7XG4gICAgICBub3RpY2UuaGlkZSgpOyAvLyDQpdC+0LLQsNGU0LzQviDRgdC/0L7QstGW0YnQtdC90L3Rj1xuICAgICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAvLyDQntC90L7QstC70LXQvdC90Y8gVUkgKNGB0L/QuNGB0LrRgyDRh9Cw0YLRltCyKSDQstGW0LTQsdGD0LTQtdGC0YzRgdGPINGH0LXRgNC10Lcg0L/QvtC00ZbRjiAnY2hhdC1saXN0LXVwZGF0ZWQnLFxuICAgICAgLy8g0Y/QutGDINC80LDRlCDQt9Cz0LXQvdC10YDRg9Cy0LDRgtC4IENoYXRNYW5hZ2VyINC/0ZbRgdC70Y8g0YPRgdC/0ZbRiNC90L7RlyDQvtC/0LXRgNCw0YbRltGXIG1vdmVDaGF0INCw0LHQviByZW5hbWVGb2xkZXIuXG4gIH1cbn0gLy8gLS0tINCa0ZbQvdC10YbRjCBoYW5kbGVEcm9wICjQtNC70Y8g0L7QutGA0LXQvNC40YUg0L/QsNC/0L7QuikgLS0tXG5cblxuICBcbnByaXZhdGUgaGFuZGxlRHJhZ092ZXJSb290UGFyZW50KGV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcbiAgZXZlbnQucHJldmVudERlZmF1bHQoKTsgLy8g0JfQsNCy0LbQtNC4INC00L7Qt9Cy0L7Qu9GP0ZTQvNC+LCDRj9C60YnQviDQv9C+0LTRltGPINC00ZbQudGI0LvQsCDRgdGO0LTQuFxuICBpZiAoZXZlbnQuZGF0YVRyYW5zZmVyKSB7XG4gICAgZXZlbnQuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnbW92ZSc7XG4gIH1cblxuICBpZiAoIXRoaXMuZHJhZ2dlZEl0ZW1EYXRhKSB7XG4gICAgICB0aGlzLmNoYXRQYW5lbExpc3RDb250YWluZXJFbC5yZW1vdmVDbGFzcygnZHJhZy1vdmVyLXJvb3QtdGFyZ2V0Jyk7XG4gICAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBkaXJlY3RUYXJnZXQgPSBldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cbiAgLy8g0K/QutGJ0L4g0LzQuCDQvdCw0LQg0LfQsNCz0L7Qu9C+0LLQutC+0Lwg0YHQtdC60YbRltGXINGH0LDRgtGW0LIsINC90LUg0L/RltC00YHQstGW0YfRg9GU0LzQviDQtNC70Y8gcm9vdCBkcm9wXG4gIGlmICh0aGlzLmNoYXRQYW5lbEhlYWRlckVsLmNvbnRhaW5zKGRpcmVjdFRhcmdldCkpIHtcbiAgICAgIHRoaXMuY2hhdFBhbmVsTGlzdENvbnRhaW5lckVsLnJlbW92ZUNsYXNzKCdkcmFnLW92ZXItcm9vdC10YXJnZXQnKTtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShcIltEcmFnT3ZlclJvb3RQYXJlbnRdIE92ZXIgY2hhdCBwYW5lbCBoZWFkZXIuIE5vIHJvb3QgaGlnaGxpZ2h0LlwiKTtcbiAgICAgIHJldHVybjtcbiAgfVxuXG4gIC8vINCv0LrRidC+INC80Lgg0L3QsNC0INC/0LDQv9C60L7Rjiwg0ZfRlyDQstC70LDRgdC90LjQuSBkcmFnb3ZlciDQvNCw0LIg0LfRg9C/0LjQvdC40YLQuCDRgdC/0LvQuNCy0LDQvdC90Y8uXG4gIC8vINCv0LrRidC+INGG0Y8g0L/QvtC00ZbRjyDQstGB0LUg0LYg0YLRg9GCLCDQt9C90LDRh9C40YLRjCDQvNC4INCw0LHQviDQvdCw0LQg0L/QvtGA0L7QttC90ZbQvCDQvNGW0YHRhtC10LwgY2hhdFBhbmVsLFxuICAvLyDQsNCx0L4g0L3QsNC0IGNoYXRQYW5lbExpc3RDb250YWluZXJFbCwg0LDQsdC+INC90LDQtCBjaGF0SXRlbS5cblxuICAvLyDQn9C10YDQtdCy0ZbRgNC60LAsINGH0Lgg0LXQu9C10LzQtdC90YIg0LLQttC1INCyINC60L7RgNC10L3RliAo0LvQvtCz0ZbQutCwINC3INC/0L7Qv9C10YDQtdC00L3RltGFINCy0LXRgNGB0ZbQuSlcbiAgY29uc3Qgcm9vdEZvbGRlclBhdGggPSBub3JtYWxpemVQYXRoKHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmNoYXRzRm9sZGVyUGF0aCk7XG4gIGNvbnN0IGRyYWdnZWRQYXRoID0gdGhpcy5kcmFnZ2VkSXRlbURhdGEucGF0aDtcbiAgbGV0IHNvdXJjZVBhcmVudFBhdGggPSBub3JtYWxpemVQYXRoKGRyYWdnZWRQYXRoLnN1YnN0cmluZygwLCBkcmFnZ2VkUGF0aC5sYXN0SW5kZXhPZignLycpKSB8fCAnLycpO1xuICBpZiAodGhpcy5kcmFnZ2VkSXRlbURhdGEudHlwZSA9PT0gJ2ZvbGRlcicgJiYgcm9vdEZvbGRlclBhdGggPT09ICcvJyAmJiAhZHJhZ2dlZFBhdGguaW5jbHVkZXMoJy8nKSkge1xuICAgICAgc291cmNlUGFyZW50UGF0aCA9ICcvJztcbiAgfVxuICAvLyDQlNC+0LTQsNGC0LrQvtCy0LAg0L/QtdGA0LXQstGW0YDQutCwINC00LvRjyDQv9Cw0L/QvtC6INGDINCy0LrQu9Cw0LTQtdC90L7QvNGDINC60L7RgNC10L3RllxuICBpZiAodGhpcy5kcmFnZ2VkSXRlbURhdGEudHlwZSA9PT0gJ2ZvbGRlcicgJiYgcm9vdEZvbGRlclBhdGggIT09ICcvJyAmJlxuICAgICAgZHJhZ2dlZFBhdGguc3RhcnRzV2l0aChyb290Rm9sZGVyUGF0aCkgJiZcbiAgICAgIChkcmFnZ2VkUGF0aC5zdWJzdHJpbmcocm9vdEZvbGRlclBhdGgubGVuZ3RoKzEpLmluZGV4T2YoJy8nKSA9PT0gLTEpICYmXG4gICAgICBzb3VyY2VQYXJlbnRQYXRoID09PSByb290Rm9sZGVyUGF0aCkge1xuICAgICAgICAvLyBpc0FscmVhZHlBdFJvb3QgPSB0cnVlOyAvLyDQlNC70Y8g0LvQvtCz0ZbQutC4INC90LjQttGH0LVcbiAgfVxuXG4gIGlmIChzb3VyY2VQYXJlbnRQYXRoID09PSByb290Rm9sZGVyUGF0aCkge1xuICAgICAgdGhpcy5jaGF0UGFuZWxMaXN0Q29udGFpbmVyRWwucmVtb3ZlQ2xhc3MoJ2RyYWctb3Zlci1yb290LXRhcmdldCcpO1xuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLnRyYWNlKFwiW0RyYWdPdmVyUm9vdFBhcmVudF0gSXRlbSBhbHJlYWR5IGF0IHJvb3QsIHJlbW92aW5nIHJvb3QgaGlnaGxpZ2h0LlwiKTtcbiAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY2hhdFBhbmVsTGlzdENvbnRhaW5lckVsLmFkZENsYXNzKCdkcmFnLW92ZXItcm9vdC10YXJnZXQnKTtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShcIltEcmFnT3ZlclJvb3RQYXJlbnRdIFZhbGlkIHJvb3QgZHJvcCB0YXJnZXQgYXJlYS4gQWRkZWQgcm9vdCBoaWdobGlnaHQgdG8gbGlzdCBjb250YWluZXIuXCIpO1xuICB9XG59XG5cbnByaXZhdGUgaGFuZGxlRHJhZ0VudGVyUm9vdFBhcmVudChldmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG4gIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vINCU0LvRjyDQutC+0L3RgdC40YHRgtC10L3RgtC90L7RgdGC0ZZcbiAgdGhpcy5wbHVnaW4ubG9nZ2VyLnRyYWNlKGBbRHJhZ0VudGVyUm9vdFBhcmVudF0gTW91c2UgZW50ZXJlZCBjaGF0UGFuZWwgYm91bmRzLmApO1xuICAvLyDQktC40LrQu9C40LrQsNGU0LzQviBoYW5kbGVEcmFnT3ZlclJvb3RQYXJlbnQsINGJ0L7QsSDQstGB0YLQsNC90L7QstC40YLQuC/Qv9GA0LjQsdGA0LDRgtC4INC/0ZbQtNGB0LLRltGH0YPQstCw0L3QvdGPXG4gIHRoaXMuaGFuZGxlRHJhZ092ZXJSb290UGFyZW50KGV2ZW50KTtcbn1cblxucHJpdmF0ZSBoYW5kbGVEcmFnTGVhdmVSb290UGFyZW50KGV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcbiAgY29uc3QgbGlzdGVuaW5nRWxlbWVudCA9IGV2ZW50LmN1cnJlbnRUYXJnZXQgYXMgSFRNTEVsZW1lbnQ7IC8vINCm0LUgY2hhdFBhbmVsXG4gIGNvbnN0IHJlbGF0ZWRUYXJnZXQgPSBldmVudC5yZWxhdGVkVGFyZ2V0IGFzIE5vZGUgfCBudWxsO1xuICB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoYFtEcmFnTGVhdmVSb290UGFyZW50XSBFdmVudCBmaXJlZCBmcm9tIGNoYXRQYW5lbC4gUmVsYXRlZCB0YXJnZXQ6ICR7cmVsYXRlZFRhcmdldCA/IChyZWxhdGVkVGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbGFzc05hbWUgOiAnbnVsbCd9YCk7XG5cbiAgaWYgKCFyZWxhdGVkVGFyZ2V0IHx8ICFsaXN0ZW5pbmdFbGVtZW50LmNvbnRhaW5zKHJlbGF0ZWRUYXJnZXQpKSB7XG4gICAgICB0aGlzLmNoYXRQYW5lbExpc3RDb250YWluZXJFbC5yZW1vdmVDbGFzcygnZHJhZy1vdmVyLXJvb3QtdGFyZ2V0Jyk7XG4gICAgICAgIH1cbn1cblxucHJpdmF0ZSBhc3luYyBoYW5kbGVEcm9wUm9vdFBhcmVudChldmVudDogRHJhZ0V2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG4gIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gIHRoaXMuY2hhdFBhbmVsTGlzdENvbnRhaW5lckVsLnJlbW92ZUNsYXNzKCdkcmFnLW92ZXItcm9vdC10YXJnZXQnKTsgLy8g0J/RgNC40LHQuNGA0LDRlNC80L4g0L/RltC00YHQstGW0YfRg9Cy0LDQvdC90Y9cbiAgXG4gIGlmICghdGhpcy5kcmFnZ2VkSXRlbURhdGEpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGRpcmVjdFRhcmdldCA9IGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgLy8g0K/QutGJ0L4g0YHQutC40LTQsNC90L3RjyDQstGW0LTQsdGD0LvQvtGB0Y8g0L3QsCDQt9Cw0LPQvtC70L7QstC+0LosINGW0LPQvdC+0YDRg9GU0LzQvlxuICBpZiAodGhpcy5jaGF0UGFuZWxIZWFkZXJFbC5jb250YWlucyhkaXJlY3RUYXJnZXQpKSB7XG4gICAgICAgICAgICB0aGlzLmRyYWdnZWRJdGVtRGF0YSA9IG51bGw7IC8vINCe0YfQuNGB0YLQuNC80L4sINCx0L4gZHJvcCDQstGW0LTQsdGD0LLRgdGPXG4gICAgICByZXR1cm47XG4gIH1cbiAgLy8g0K/QutGJ0L4g0YHQutC40LTQsNC90L3RjyDQstGW0LTQsdGD0LvQvtGB0Y8g0L3QsCDQv9Cw0L/QutGDLCDRl9GXINCy0LvQsNGB0L3QuNC5INC+0LHRgNC+0LHQvdC40LogZHJvcCDQvNCw0LIg0YHQv9GA0LDRhtGO0LLQsNGC0Lgg0ZYg0LfRg9C/0LjQvdC40YLQuCDRgdC/0LvQuNCy0LDQvdC90Y8uXG4gIC8vINCv0LrRidC+INC/0L7QtNGW0Y8g0LTRltC50YjQu9CwINGB0Y7QtNC4LCDRhtC1INC+0LfQvdCw0YfQsNGULCDRidC+INGB0LrQuNC00LDQvdC90Y8g0LHRg9C70L4g0L3QtSDQvdCwINC/0LDQv9C60YMgKNGP0LrQsCDRlCBkcm9wIHRhcmdldCkuXG5cbiAgY29uc3QgZHJhZ2dlZERhdGEgPSB7IC4uLnRoaXMuZHJhZ2dlZEl0ZW1EYXRhIH07XG4gIHRoaXMuZHJhZ2dlZEl0ZW1EYXRhID0gbnVsbDtcblxuICBjb25zdCByb290Rm9sZGVyUGF0aCA9IG5vcm1hbGl6ZVBhdGgodGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2hhdHNGb2xkZXJQYXRoKTtcbiAgXG4gIC8vIC0tLSDQktCQ0JvQhtCU0JDQptCG0K8gKNGC0LDQutCwINGB0LDQvNCwLCDRj9C6INGDIGhhbmRsZURyYWdPdmVyUm9vdFBhcmVudCkgLS0tXG4gIGxldCBzb3VyY2VQYXJlbnRQYXRoID0gbm9ybWFsaXplUGF0aChkcmFnZ2VkRGF0YS5wYXRoLnN1YnN0cmluZygwLCBkcmFnZ2VkRGF0YS5wYXRoLmxhc3RJbmRleE9mKCcvJykpIHx8ICcvJyk7XG4gIGlmIChkcmFnZ2VkRGF0YS50eXBlID09PSAnZm9sZGVyJyAmJiByb290Rm9sZGVyUGF0aCA9PT0gJy8nICYmICFkcmFnZ2VkRGF0YS5wYXRoLmluY2x1ZGVzKCcvJykpIHtcbiAgICAgIHNvdXJjZVBhcmVudFBhdGggPSAnLyc7XG4gIH1cbiAgLy8gLi4uICjQtNC+0LTQsNGC0LrQvtCy0LAg0L/QtdGA0LXQstGW0YDQutCwINC00LvRjyDQv9Cw0L/QvtC6INGDINCy0LrQu9Cw0LTQtdC90L7QvNGDINC60L7RgNC10L3Rliwg0Y/QutGJ0L4g0L/QvtGC0YDRltCx0L3Qviwg0LDQu9C1IHNvdXJjZVBhcmVudFBhdGgg0LzQsNGUINCx0YPRgtC4INC00L7RgdGC0LDRgtC90YzQvilcblxuICBpZiAoc291cmNlUGFyZW50UGF0aCA9PT0gcm9vdEZvbGRlclBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIC0tLSDQktCY0JrQntCd0JDQndCd0K8g0JTQhtCHICjQutC+0LQg0YLQsNC60LjQuSDRgdCw0LzQuNC5LCDRj9C6INGDIGhhbmRsZURyb3BSb290INC3INC/0L7Qv9C10YDQtdC00L3RjNC+0Zcg0LLRltC00L/QvtCy0ZbQtNGWKSAtLS1cbiAgbGV0IHN1Y2Nlc3MgPSBmYWxzZTtcbiAgY29uc3Qgbm90aWNlID0gbmV3IE5vdGljZShgTW92aW5nICR7ZHJhZ2dlZERhdGEudHlwZX0gdG8gcm9vdC4uLmAsIDApO1xuICB0cnkge1xuICAgICAgaWYgKGRyYWdnZWREYXRhLnR5cGUgPT09ICdjaGF0Jykge1xuICAgICAgICAgIHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5tb3ZlQ2hhdChkcmFnZ2VkRGF0YS5pZCwgZHJhZ2dlZERhdGEucGF0aCwgcm9vdEZvbGRlclBhdGgpO1xuICAgICAgfSBlbHNlIGlmIChkcmFnZ2VkRGF0YS50eXBlID09PSAnZm9sZGVyJykge1xuICAgICAgICAgIGNvbnN0IGZvbGRlck5hbWUgPSBkcmFnZ2VkRGF0YS5uYW1lO1xuICAgICAgICAgIGNvbnN0IG5ld1BhdGhBdFJvb3QgPSBub3JtYWxpemVQYXRoKHJvb3RGb2xkZXJQYXRoID09PSAnLycgPyBmb2xkZXJOYW1lIDogYCR7cm9vdEZvbGRlclBhdGh9LyR7Zm9sZGVyTmFtZX1gKTtcbiAgICAgICAgICBpZiAoZHJhZ2dlZERhdGEucGF0aCA9PT0gbmV3UGF0aEF0Um9vdCkge1xuICAgICAgICAgICAgICAgc3VjY2VzcyA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMobmV3UGF0aEF0Um9vdCk7XG4gICAgICAgICAgICAgIGlmIChleGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYEFuIGl0ZW0gbmFtZWQgXCIke2ZvbGRlck5hbWV9XCIgYWxyZWFkeSBleGlzdHMgYXQgdGhlIHJvb3QuYCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBzdWNjZXNzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIucmVuYW1lRm9sZGVyKGRyYWdnZWREYXRhLnBhdGgsIG5ld1BhdGhBdFJvb3QpO1xuICAgICAgICAgICAgICAgICAgaWYgKHN1Y2Nlc3MgJiYgdGhpcy5mb2xkZXJFeHBhbnNpb25TdGF0ZS5oYXMoZHJhZ2dlZERhdGEucGF0aCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICBjb25zdCB3YXNFeHBhbmRlZCA9IHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuZ2V0KGRyYWdnZWREYXRhLnBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuZGVsZXRlKGRyYWdnZWREYXRhLnBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuc2V0KG5ld1BhdGhBdFJvb3QsIHdhc0V4cGFuZGVkISk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvciBtb3ZpbmcgJHtkcmFnZ2VkRGF0YS50eXBlfSB0byByb290LiBDaGVjayBjb25zb2xlLmApO1xuICAgICAgc3VjY2VzcyA9IGZhbHNlO1xuICB9IGZpbmFsbHkge1xuICAgICAgbm90aWNlLmhpZGUoKTtcbiAgICAgIGlmIChzdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB9XG4gIH1cbn1cblxuICAvLyAtLS0g0J7QsdGA0L7QsdC90LjQutC4INC00LvRjyDQodCf0JXQptCG0JDQm9Cs0J3QntCHINCX0J7QndCYINCh0JrQmNCU0JDQndCd0K8g0JIg0JrQntCg0IbQndCsIC0tLVxuXG4gIHByaXZhdGUgaGFuZGxlRHJhZ092ZXJSb290Wm9uZShldmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBpZiAoZXZlbnQuZGF0YVRyYW5zZmVyKSB7XG4gICAgICBldmVudC5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdtb3ZlJztcbiAgICB9XG4gICAgLy8g0KLRg9GCINC90LUg0L/QvtGC0YDRltCx0L3QviDQv9C10YDQtdCy0ZbRgNGP0YLQuCBldmVudC50YXJnZXQsINCx0L4g0YbRjyDQv9C+0LTRltGPINGB0L/RgNCw0YbRjNC+0LLRg9GUINC70LjRiNC1INC90LAgcm9vdERyb3Bab25lRWxcbiAgICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoXCJbRHJhZ092ZXJSb290Wm9uZV0gRmlyZWQuXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVEcmFnRW50ZXJSb290Wm9uZShldmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCB0YXJnZXRFbGVtZW50ID0gZXZlbnQuY3VycmVudFRhcmdldCBhcyBIVE1MRWxlbWVudDsgLy8g0KbQtSB0aGlzLnJvb3REcm9wWm9uZUVsXG4gICAgXG4gICAgaWYgKCF0aGlzLmRyYWdnZWRJdGVtRGF0YSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vINCS0LDQu9GW0LTQsNGG0ZbRjzog0YfQuCDQvdC1INC/0LXRgNC10YLRj9Cz0YPRlNC80L4g0LXQu9C10LzQtdC90YIsINGJ0L4g0LLQttC1INCyINC60L7RgNC10L3RllxuICAgIGNvbnN0IHJvb3RGb2xkZXJQYXRoID0gbm9ybWFsaXplUGF0aCh0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jaGF0c0ZvbGRlclBhdGgpO1xuICAgIGNvbnN0IGRyYWdnZWRQYXRoID0gdGhpcy5kcmFnZ2VkSXRlbURhdGEucGF0aDtcbiAgICBsZXQgc291cmNlUGFyZW50UGF0aCA9IG5vcm1hbGl6ZVBhdGgoZHJhZ2dlZFBhdGguc3Vic3RyaW5nKDAsIGRyYWdnZWRQYXRoLmxhc3RJbmRleE9mKCcvJykpIHx8ICcvJyk7XG4gICAgaWYgKHRoaXMuZHJhZ2dlZEl0ZW1EYXRhLnR5cGUgPT09ICdmb2xkZXInICYmIHJvb3RGb2xkZXJQYXRoID09PSAnLycgJiYgIWRyYWdnZWRQYXRoLmluY2x1ZGVzKCcvJykpIHtcbiAgICAgICAgc291cmNlUGFyZW50UGF0aCA9ICcvJztcbiAgICB9XG5cbiAgICBpZiAoc291cmNlUGFyZW50UGF0aCA9PT0gcm9vdEZvbGRlclBhdGgpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXRFbGVtZW50LnJlbW92ZUNsYXNzKCdkcmFnLW92ZXItcm9vdC10YXJnZXQnKTsgLy8g0JfQsNCx0LjRgNCw0ZTQvNC+LCDRj9C60YnQviDQstC40L/QsNC00LrQvtCy0L4g0LHRg9C70L5cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRhcmdldEVsZW1lbnQuYWRkQ2xhc3MoJ2RyYWctb3Zlci1yb290LXRhcmdldCcpO1xuICAgICAgfVxuXG4gIHByaXZhdGUgaGFuZGxlRHJhZ0xlYXZlUm9vdFpvbmUoZXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuICAgIGNvbnN0IHRhcmdldEVsZW1lbnQgPSBldmVudC5jdXJyZW50VGFyZ2V0IGFzIEhUTUxFbGVtZW50OyAvLyDQptC1IHRoaXMucm9vdERyb3Bab25lRWxcbiAgICB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoYFtEcmFnTGVhdmVSb290Wm9uZV0gRXZlbnQgZmlyZWQuYCk7XG4gICAgdGFyZ2V0RWxlbWVudC5yZW1vdmVDbGFzcygnZHJhZy1vdmVyLXJvb3QtdGFyZ2V0Jyk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZURyb3BSb290Wm9uZShldmVudDogRHJhZ0V2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCB0YXJnZXRFbGVtZW50ID0gZXZlbnQuY3VycmVudFRhcmdldCBhcyBIVE1MRWxlbWVudDsgLy8g0KbQtSB0aGlzLnJvb3REcm9wWm9uZUVsXG4gICAgdGFyZ2V0RWxlbWVudC5yZW1vdmVDbGFzcygnZHJhZy1vdmVyLXJvb3QtdGFyZ2V0Jyk7XG4gICAgXG4gICAgaWYgKCF0aGlzLmRyYWdnZWRJdGVtRGF0YSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBkcmFnZ2VkRGF0YSA9IHsgLi4udGhpcy5kcmFnZ2VkSXRlbURhdGEgfTtcbiAgICB0aGlzLmRyYWdnZWRJdGVtRGF0YSA9IG51bGw7IC8vINCe0YfQuNGJ0LDRlNC80L5cblxuICAgIGNvbnN0IHJvb3RGb2xkZXJQYXRoID0gbm9ybWFsaXplUGF0aCh0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jaGF0c0ZvbGRlclBhdGgpO1xuICAgIFxuICAgIC8vIC0tLSDQktCQ0JvQhtCU0JDQptCG0K8gKNGH0Lgg0LXQu9C10LzQtdC90YIg0LLQttC1INCyINC60L7RgNC10L3RlikgLS0tXG4gICAgbGV0IHNvdXJjZVBhcmVudFBhdGggPSBub3JtYWxpemVQYXRoKGRyYWdnZWREYXRhLnBhdGguc3Vic3RyaW5nKDAsIGRyYWdnZWREYXRhLnBhdGgubGFzdEluZGV4T2YoJy8nKSkgfHwgJy8nKTtcbiAgICBpZiAoZHJhZ2dlZERhdGEudHlwZSA9PT0gJ2ZvbGRlcicgJiYgcm9vdEZvbGRlclBhdGggPT09ICcvJyAmJiAhZHJhZ2dlZERhdGEucGF0aC5pbmNsdWRlcygnLycpKSB7XG4gICAgICAgIHNvdXJjZVBhcmVudFBhdGggPSAnLyc7XG4gICAgfVxuXG4gICAgaWYgKHNvdXJjZVBhcmVudFBhdGggPT09IHJvb3RGb2xkZXJQYXRoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIC0tLSDQktCY0JrQntCd0JDQndCd0K8g0JTQhtCHICjQu9C+0LPRltC60LAg0YLQsNC60LAg0YHQsNC80LAsINGP0Log0YMgaGFuZGxlRHJvcFJvb3RQYXJlbnQpIC0tLVxuICAgIGxldCBzdWNjZXNzID0gZmFsc2U7XG4gICAgY29uc3Qgbm90aWNlID0gbmV3IE5vdGljZShgTW92aW5nICR7ZHJhZ2dlZERhdGEudHlwZX0gdG8gcm9vdC4uLmAsIDApO1xuICAgIHRyeSB7XG4gICAgICAgIGlmIChkcmFnZ2VkRGF0YS50eXBlID09PSAnY2hhdCcpIHtcbiAgICAgICAgICAgIHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5tb3ZlQ2hhdChkcmFnZ2VkRGF0YS5pZCwgZHJhZ2dlZERhdGEucGF0aCwgcm9vdEZvbGRlclBhdGgpO1xuICAgICAgICB9IGVsc2UgaWYgKGRyYWdnZWREYXRhLnR5cGUgPT09ICdmb2xkZXInKSB7XG4gICAgICAgICAgICBjb25zdCBmb2xkZXJOYW1lID0gZHJhZ2dlZERhdGEubmFtZTtcbiAgICAgICAgICAgIGNvbnN0IG5ld1BhdGhBdFJvb3QgPSBub3JtYWxpemVQYXRoKHJvb3RGb2xkZXJQYXRoID09PSAnLycgPyBmb2xkZXJOYW1lIDogYCR7cm9vdEZvbGRlclBhdGh9LyR7Zm9sZGVyTmFtZX1gKTtcbiAgICAgICAgICAgIGlmIChkcmFnZ2VkRGF0YS5wYXRoID09PSBuZXdQYXRoQXRSb290KSB7XG4gICAgICAgICAgICAgICAgIHN1Y2Nlc3MgPSB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmV4aXN0cyhuZXdQYXRoQXRSb290KTtcbiAgICAgICAgICAgICAgICBpZiAoZXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYEFuIGl0ZW0gbmFtZWQgXCIke2ZvbGRlck5hbWV9XCIgYWxyZWFkeSBleGlzdHMgYXQgdGhlIHJvb3QuYCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnJlbmFtZUZvbGRlcihkcmFnZ2VkRGF0YS5wYXRoLCBuZXdQYXRoQXRSb290KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN1Y2Nlc3MgJiYgdGhpcy5mb2xkZXJFeHBhbnNpb25TdGF0ZS5oYXMoZHJhZ2dlZERhdGEucGF0aCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHdhc0V4cGFuZGVkID0gdGhpcy5mb2xkZXJFeHBhbnNpb25TdGF0ZS5nZXQoZHJhZ2dlZERhdGEucGF0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLmRlbGV0ZShkcmFnZ2VkRGF0YS5wYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuc2V0KG5ld1BhdGhBdFJvb3QsIHdhc0V4cGFuZGVkISk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yIG1vdmluZyAke2RyYWdnZWREYXRhLnR5cGV9IHRvIHJvb3QuIENoZWNrIGNvbnNvbGUuYCk7XG4gICAgICAgIHN1Y2Nlc3MgPSBmYWxzZTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBub3RpY2UuaGlkZSgpO1xuICAgICAgICBpZiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgfVxuICB9XG5cblxufSAvLyBFbmQgb2YgU2lkZWJhck1hbmFnZXIgY2xhc3NcbiJdfQ==