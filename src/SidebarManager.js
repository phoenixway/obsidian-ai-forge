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
            this.plugin.logger.info(
            // `[Update #${currentUpdateId}] >>>>> STARTING updateChatList (visible: ${this.isSectionVisible("chats")})`
            );
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
                // this.plugin.logger.info(`[Update #${currentUpdateId}] <<<<< FINISHED updateChatList (rendering done)`);
            }
            catch (error) {
                this.plugin.logger.error(`[Update #${currentUpdateId}] Error rendering hierarchy:`, error);
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
            this.plugin.logger.debug(`[SidebarManager.updateRoleList] Updating role list content (visible: ${this.isSectionVisible("roles")})...`);
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
                this.plugin.logger.error("[SidebarManager.updateRoleList] Error rendering:", error);
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
                    this.plugin.logger.error(`[SidebarManager] Error setting role to ${newRolePath}:`, error);
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
                this.plugin.logger.error("[SidebarManager] Error creating new chat:", error);
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
                    this.plugin.logger.error(`[SidebarManager] Error creating folder ${newFolderPath}:`, error);
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
                    this.plugin.logger.error(`[SidebarManager] Error renaming folder ${folderNode.path} to ${newFolderPath}:`, error);
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
                    this.plugin.logger.error(`[SidebarManager] Error deleting folder ${folderPath}:`, error);
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
        }
        else {
            this.plugin.logger.debug("[SidebarUI] 'Chats' section initially collapsed, chat list update deferred.");
        }
        // Початкове заповнення списку ролей, якщо секція видима (за замовчуванням вона згорнута)
        if (this.isSectionVisible("roles")) {
            this.plugin.logger.debug("[SidebarUI] 'Roles' section initially visible, role list update scheduled.");
            this.updateRoleList();
        }
        else {
            this.plugin.logger.debug("[SidebarUI] 'Roles' section initially collapsed, role list update deferred.");
        }
        // this.plugin.logger.debug("[SidebarUI] Sidebar UI creation complete.");
        return this.containerEl;
    } // --- Кінець createSidebarUI ---
    attachSidebarEventListeners() {
        if (!this.chatPanelHeaderEl ||
            !this.rolePanelHeaderEl ||
            !this.newChatSidebarButton ||
            !this.newFolderSidebarButton) {
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
                    this.plugin.logger.warn(`[Render] Invalid date for chat ${chatMeta.id}: ${chatMeta.lastModified}`);
                }
                detailsWrapper.createDiv({ cls: CSS_CHAT_ITEM_DATE, text: dateText });
            }
            catch (e) {
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
                    this.plugin.logger.error(`Error updating sidebar section ${sectionType}:`, error);
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
                this.plugin.logger.error(`Clone error:`, e);
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
                            this.plugin.logger.error("Folder creation error during export:", err);
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
                    this.plugin.logger.error("Target folder for export could not be determined.");
                    new Notice("Export folder error.");
                    notice.hide();
                    return;
                }
                const filePath = normalizePath(`${fFolder.path}/${filename}`);
                const file = yield this.app.vault.create(filePath, md);
                new Notice(`Chat exported to ${file.path}`);
            }
            catch (e) {
                this.plugin.logger.error(`Chat export error:`, e);
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
                    this.plugin.logger.error(`Clear messages error:`, e);
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
                    this.plugin.logger.error(`Delete chat error:`, e);
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
        this.plugin.logger.error(`[DragStart CAPTURED NODE] Type: ${node.type}, Name: ${node.type === 'folder' ? node.name : node.metadata.name}, Path: ${node.type === 'folder' ? node.path : node.filePath}`);
        if (!event.dataTransfer) {
            this.plugin.logger.warn("[DragStart] No dataTransfer object in event.");
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
    handleDragEnd(event) {
        var _a;
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
            this.plugin.logger.debug("[DragLeaveRoot] Mouse left root container bounds. Removed 'drag-over-root-target'.");
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
                this.plugin.logger.warn("[FolderDrop] Drop event occurred without draggedItemData or dataTransfer. Aborting.");
                this.draggedItemData = null; // Очищаємо про всяк випадок
                return;
            }
            const draggedData = Object.assign({}, this.draggedItemData); // Копіюємо дані, бо оригінал зараз скинемо
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
                    success = yield this.plugin.chatManager.moveChat(draggedData.id, draggedData.path, targetFolderPath);
                }
                else if (draggedData.type === 'folder') {
                    // Переміщуємо папку (використовуємо renameFolder, оскільки це зміна шляху)
                    const folderName = draggedData.name; // Ім'я папки, що перетягується
                    const newPath = normalizePath(`${targetFolderPath}/${folderName}`); // Новий повний шлях для папки
                    this.plugin.logger.info(`[FolderDrop] Calling ChatManager.renameFolder (for move): oldPath=${draggedData.path}, newPath=${newPath}`);
                    if (draggedData.path === newPath) { // Якщо шлях не змінився (мало б відфільтруватися раніше)
                        this.plugin.logger.debug("[FolderDrop] Folder source and target path are identical after normalization. No move needed.");
                        success = true;
                    }
                    else {
                        // Перевірка на конфлікт імен у цільовій папці
                        const exists = yield this.app.vault.adapter.exists(newPath);
                        if (exists) {
                            new Notice(`An item named "${folderName}" already exists in the folder "${targetNode.name}".`);
                            this.plugin.logger.warn(`[FolderDrop] Prevented: Target path ${newPath} for folder move already exists.`);
                        }
                        else {
                            success = yield this.plugin.chatManager.renameFolder(draggedData.path, newPath);
                            // Оновлюємо стан розгорнутості папки, якщо вона була переміщена
                            if (success && this.folderExpansionState.has(draggedData.path)) {
                                const wasExpanded = this.folderExpansionState.get(draggedData.path);
                                this.folderExpansionState.delete(draggedData.path);
                                this.folderExpansionState.set(newPath, wasExpanded);
                                this.plugin.logger.debug(`[FolderDrop] Transferred expansion state for folder from '${draggedData.path}' to '${newPath}'.`);
                            }
                        }
                    }
                }
            }
            catch (error) {
                this.plugin.logger.error(`[FolderDrop] Error during drop operation (moving ${draggedData.type} to folder ${targetNode.name}):`, error);
                new Notice(`Error moving ${draggedData.type}. Check console.`);
                success = false;
            }
            finally {
                notice.hide(); // Ховаємо сповіщення
                if (success) {
                    this.plugin.logger.info(`[FolderDrop] Drop successful: Moved ${draggedData.type} '${draggedData.name}' to folder '${targetNode.name}'. UI update relies on events from ChatManager.`);
                }
                else {
                    this.plugin.logger.warn(`[FolderDrop] Drop failed or was prevented for ${draggedData.type} '${draggedData.name}' to folder '${targetNode.name}'.`);
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
            this.plugin.logger.debug("[DragLeaveRootParent] Mouse left chatPanel bounds. Removed 'drag-over-root-target'.");
        }
    }
    handleDropRootParent(event) {
        return __awaiter(this, void 0, void 0, function* () {
            event.preventDefault();
            this.chatPanelListContainerEl.removeClass('drag-over-root-target'); // Прибираємо підсвічування
            this.plugin.logger.debug("[DropRootParent] Event fired on chatPanel.");
            if (!this.draggedItemData) {
                this.plugin.logger.warn("[DropRootParent] No draggedItemData available. Aborting.");
                return;
            }
            const directTarget = event.target;
            // Якщо скидання відбулося на заголовок, ігноруємо
            if (this.chatPanelHeaderEl.contains(directTarget)) {
                this.plugin.logger.info("[DropRootParent] Drop occurred on chat panel header. Aborting root drop.");
                this.draggedItemData = null; // Очистимо, бо drop відбувся
                return;
            }
            // Якщо скидання відбулося на папку, її власний обробник drop мав спрацювати і зупинити спливання.
            // Якщо подія дійшла сюди, це означає, що скидання було не на папку (яка є drop target).
            const draggedData = Object.assign({}, this.draggedItemData);
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
                this.plugin.logger.error(`[DropRootParent] Error during operation for ${draggedData.type} '${draggedData.name}':`, error);
                new Notice(`Error moving ${draggedData.type} to root. Check console.`);
                success = false;
            }
            finally {
                notice.hide();
                if (success) {
                    this.plugin.logger.info(`[DropRootParent] Operation for ${draggedData.type} '${draggedData.name}' to root was successful. UI update relies on events.`);
                }
                else {
                    this.plugin.logger.warn(`[DropRootParent] Operation for ${draggedData.type} '${draggedData.name}' to root failed or was prevented.`);
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
            this.plugin.logger.debug("[DropRootZone] Event fired on dedicated root drop zone.");
            if (!this.draggedItemData) {
                this.plugin.logger.warn("[DropRootZone] No draggedItemData available on drop. Aborting.");
                return;
            }
            const draggedData = Object.assign({}, this.draggedItemData);
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
                this.plugin.logger.error(`[DropRootZone] Error during operation for ${draggedData.type} '${draggedData.name}':`, error);
                new Notice(`Error moving ${draggedData.type} to root. Check console.`);
                success = false;
            }
            finally {
                notice.hide();
                if (success) {
                    this.plugin.logger.info(`[DropRootZone] Operation for ${draggedData.type} '${draggedData.name}' to root was successful. UI update relies on events.`);
                }
                else {
                    this.plugin.logger.warn(`[DropRootZone] Operation for ${draggedData.type} '${draggedData.name}' to root failed or was prevented.`);
                }
            }
        });
    }
} // End of SidebarManager class
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2lkZWJhck1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJTaWRlYmFyTWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsd0JBQXdCO0FBQ3hCLE9BQU8sRUFBTyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsYUFBYSxFQUFxQyxNQUFNLFVBQVUsQ0FBQztBQUlqSCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDOUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUM1QyxPQUFPLEtBQUssYUFBYSxNQUFNLHdCQUF3QixDQUFDO0FBS3hELHNCQUFzQjtBQUN0QixNQUFNLHFCQUFxQixHQUFHLDBCQUEwQixDQUFDO0FBQ3pELE1BQU0sY0FBYyxHQUFHLG1CQUFtQixDQUFDO0FBQzNDLE1BQU0sY0FBYyxHQUFHLG1CQUFtQixDQUFDO0FBQzNDLE1BQU0scUJBQXFCLEdBQUcsMEJBQTBCLENBQUM7QUFDekQsTUFBTSxtQkFBbUIsR0FBRyx3QkFBd0IsQ0FBQztBQUNyRCxNQUFNLG1CQUFtQixHQUFHLHdCQUF3QixDQUFDO0FBQ3JELE1BQU0sd0JBQXdCLEdBQUcsNkJBQTZCLENBQUM7QUFDL0QsTUFBTSx3QkFBd0IsR0FBRyw2QkFBNkIsQ0FBQztBQUMvRCxNQUFNLDBCQUEwQixHQUFHLFdBQVcsQ0FBQztBQUMvQyxNQUFNLDBCQUEwQixHQUFHLFdBQVcsQ0FBQztBQUMvQyxNQUFNLHdCQUF3QixHQUFHLDZCQUE2QixDQUFDO0FBRS9ELE1BQU0scUJBQXFCLEdBQUcsYUFBYSxDQUFDO0FBQzVDLE1BQU0sMEJBQTBCLEdBQUcsK0JBQStCLENBQUM7QUFDbkUsTUFBTSwyQkFBMkIsR0FBRyxnQ0FBZ0MsQ0FBQztBQUNyRSxnR0FBZ0c7QUFDaEcsTUFBTSwwQkFBMEIsR0FBRywrQkFBK0IsQ0FBQyxDQUFDLGdDQUFnQztBQUNwRyxNQUFNLDBCQUEwQixH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Q0wsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLDZDQUE2QyxXQUFXLENBQUMsSUFBSSxLQUFLLFdBQVcsQ0FBQyxJQUFJLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDeEgsSUFBSSxNQUFNLENBQUMsZ0JBQWdCLFdBQVcsQ0FBQyxJQUFJLDBCQUEwQixDQUFDLENBQUM7Z0JBQ3ZFLE9BQU8sR0FBRyxLQUFLLENBQUM7WUFDcEIsQ0FBQztvQkFBUyxDQUFDO2dCQUNQLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDZCxJQUFJLE9BQU8sRUFBRSxDQUFDO29CQUNWLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsV0FBVyxDQUFDLElBQUksS0FBSyxXQUFXLENBQUMsSUFBSSx1REFBdUQsQ0FBQyxDQUFDO2dCQUMxSixDQUFDO3FCQUFNLENBQUM7b0JBQ0osSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxXQUFXLENBQUMsSUFBSSxLQUFLLFdBQVcsQ0FBQyxJQUFJLG9DQUFvQyxDQUFDLENBQUM7Z0JBQ3ZJLENBQUM7WUFDTCxDQUFDO1FBQ0gsQ0FBQztLQUFBO0NBR0YsQ0FBQyw4QkFBOEIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBzcmMvU2lkZWJhck1hbmFnZXIudHNcbmltcG9ydCB7IEFwcCwgc2V0SWNvbiwgTWVudSwgTm90aWNlLCBURm9sZGVyLCBub3JtYWxpemVQYXRoLCBkZWJvdW5jZSwgTWVudUl0ZW0sIFRBYnN0cmFjdEZpbGUgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCBPbGxhbWFQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xuaW1wb3J0IHsgUm9sZUluZm8gfSBmcm9tIFwiLi9DaGF0TWFuYWdlclwiO1xuaW1wb3J0IHsgQ2hhdE1ldGFkYXRhIH0gZnJvbSBcIi4vQ2hhdFwiO1xuaW1wb3J0IHsgQ29uZmlybU1vZGFsIH0gZnJvbSBcIi4vQ29uZmlybU1vZGFsXCI7XG5pbXBvcnQgeyBQcm9tcHRNb2RhbCB9IGZyb20gXCIuL1Byb21wdE1vZGFsXCI7XG5pbXBvcnQgKiBhcyBSZW5kZXJlclV0aWxzIGZyb20gXCIuL01lc3NhZ2VSZW5kZXJlclV0aWxzXCI7XG5pbXBvcnQgeyBNZXNzYWdlIH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IE9sbGFtYVZpZXcgfSBmcm9tIFwiLi9PbGxhbWFWaWV3XCI7XG5pbXBvcnQgeyBIaWVyYXJjaHlOb2RlLCBGb2xkZXJOb2RlLCBDaGF0Tm9kZSB9IGZyb20gXCIuL0NoYXRNYW5hZ2VyXCI7XG5cbi8vIC0tLSBDU1MgQ2xhc3NlcyAtLS1cbmNvbnN0IENTU19TSURFQkFSX0NPTlRBSU5FUiA9IFwib2xsYW1hLXNpZGViYXItY29udGFpbmVyXCI7XG5jb25zdCBDU1NfUk9MRV9QQU5FTCA9IFwib2xsYW1hLXJvbGUtcGFuZWxcIjtcbmNvbnN0IENTU19DSEFUX1BBTkVMID0gXCJvbGxhbWEtY2hhdC1wYW5lbFwiO1xuY29uc3QgQ1NTX1JPTEVfUEFORUxfSEVBREVSID0gXCJvbGxhbWEtcm9sZS1wYW5lbC1oZWFkZXJcIjtcbmNvbnN0IENTU19ST0xFX1BBTkVMX0xJU1QgPSBcIm9sbGFtYS1yb2xlLXBhbmVsLWxpc3RcIjtcbmNvbnN0IENTU19ST0xFX1BBTkVMX0lURU0gPSBcIm9sbGFtYS1yb2xlLXBhbmVsLWl0ZW1cIjtcbmNvbnN0IENTU19ST0xFX1BBTkVMX0lURU1fSUNPTiA9IFwib2xsYW1hLXJvbGUtcGFuZWwtaXRlbS1pY29uXCI7XG5jb25zdCBDU1NfUk9MRV9QQU5FTF9JVEVNX1RFWFQgPSBcIm9sbGFtYS1yb2xlLXBhbmVsLWl0ZW0tdGV4dFwiO1xuY29uc3QgQ1NTX1JPTEVfUEFORUxfSVRFTV9BQ1RJVkUgPSBcImlzLWFjdGl2ZVwiO1xuY29uc3QgQ1NTX1JPTEVfUEFORUxfSVRFTV9DVVNUT00gPSBcImlzLWN1c3RvbVwiO1xuY29uc3QgQ1NTX1JPTEVfUEFORUxfSVRFTV9OT05FID0gXCJvbGxhbWEtcm9sZS1wYW5lbC1pdGVtLW5vbmVcIjtcblxuY29uc3QgQ1NTX0NMQVNTX01FTlVfT1BUSU9OID0gXCJtZW51LW9wdGlvblwiO1xuY29uc3QgQ1NTX1NJREVCQVJfU0VDVElPTl9IRUFERVIgPSBcIm9sbGFtYS1zaWRlYmFyLXNlY3Rpb24taGVhZGVyXCI7XG5jb25zdCBDU1NfU0lERUJBUl9TRUNUSU9OX0NPTlRFTlQgPSBcIm9sbGFtYS1zaWRlYmFyLXNlY3Rpb24tY29udGVudFwiO1xuLy8gY29uc3QgQ1NTX1NJREVCQVJfU0VDVElPTl9JQ09OID0gXCJvbGxhbWEtc2lkZWJhci1zZWN0aW9uLWljb25cIjsgLy8g0JHRltC70YzRiNC1INC90LUg0LLQuNC60L7RgNC40YHRgtC+0LLRg9GU0YLRjNGB0Y9cbmNvbnN0IENTU19TRUNUSU9OX1RPR0dMRV9DSEVWUk9OID0gXCJvbGxhbWEtc2VjdGlvbi10b2dnbGUtY2hldnJvblwiOyAvLyDQndC+0LLQuNC5INC60LvQsNGBINC00LvRjyDRiNC10LLRgNC+0L3QsCDRgdC/0YDQsNCy0LBcbmNvbnN0IENTU19TSURFQkFSX0hFQURFUl9BQ1RJT05TID0gXCJvbGxhbWEtc2lkZWJhci1oZWFkZXItYWN0aW9uc1wiO1xuY29uc3QgQ1NTX1NJREVCQVJfSEVBREVSX0JVVFRPTiA9IFwib2xsYW1hLXNpZGViYXItaGVhZGVyLWJ1dHRvblwiO1xuY29uc3QgQ1NTX1NJREVCQVJfSEVBREVSX0xFRlQgPSBcIm9sbGFtYS1zaWRlYmFyLWhlYWRlci1sZWZ0XCI7XG5jb25zdCBDU1NfU0lERUJBUl9TRUNUSU9OX0NPTlRFTlRfSElEREVOID0gXCJvbGxhbWEtc2lkZWJhci1zZWN0aW9uLWNvbnRlbnQtaGlkZGVuXCI7XG5jb25zdCBDU1NfRVhQQU5ERURfQ0xBU1MgPSBcImlzLWV4cGFuZGVkXCI7XG5cbi8vINCa0LvQsNGB0Lgg0LTQu9GPINGB0L/QuNGB0LrRgyDRh9Cw0YLRltCyL9C/0LDQv9C+0LpcbmNvbnN0IENTU19DSEFUX0xJU1RfQ09OVEFJTkVSID0gXCJvbGxhbWEtY2hhdC1saXN0LWNvbnRhaW5lclwiO1xuY29uc3QgQ1NTX0hJRVJBUkNIWV9JVEVNID0gXCJvbGxhbWEtaGllcmFyY2h5LWl0ZW1cIjtcbmNvbnN0IENTU19GT0xERVJfSVRFTSA9IFwib2xsYW1hLWZvbGRlci1pdGVtXCI7XG5jb25zdCBDU1NfQ0hBVF9JVEVNID0gXCJvbGxhbWEtY2hhdC1pdGVtXCI7XG5jb25zdCBDU1NfSElFUkFSQ0hZX0lURU1fQ09OVEVOVCA9IFwib2xsYW1hLWhpZXJhcmNoeS1pdGVtLWNvbnRlbnRcIjtcbmNvbnN0IENTU19ISUVSQVJDSFlfSVRFTV9DSElMRFJFTiA9IFwib2xsYW1hLWhpZXJhcmNoeS1pdGVtLWNoaWxkcmVuXCI7XG5jb25zdCBDU1NfSElFUkFSQ0hZX0lURU1fQ09MTEFQU0VEID0gXCJpcy1jb2xsYXBzZWRcIjtcbmNvbnN0IENTU19GT0xERVJfSUNPTiA9IFwib2xsYW1hLWZvbGRlci1pY29uXCI7XG5jb25zdCBDU1NfSElFUkFSQ0hZX0lURU1fVEVYVCA9IFwib2xsYW1hLWhpZXJhcmNoeS1pdGVtLXRleHRcIjtcbmNvbnN0IENTU19DSEFUX0lURU1fREVUQUlMUyA9IFwib2xsYW1hLWNoYXQtaXRlbS1kZXRhaWxzXCI7XG5jb25zdCBDU1NfQ0hBVF9JVEVNX0RBVEUgPSBcIm9sbGFtYS1jaGF0LWl0ZW0tZGF0ZVwiO1xuY29uc3QgQ1NTX0hJRVJBUkNIWV9JVEVNX09QVElPTlMgPSBcIm9sbGFtYS1oaWVyYXJjaHktaXRlbS1vcHRpb25zXCI7XG5jb25zdCBDU1NfSElFUkFSQ0hZX0lOREVOVF9QUkVGSVggPSBcIm9sbGFtYS1pbmRlbnQtbGV2ZWwtXCI7XG5jb25zdCBDU1NfRk9MREVSX0FDVElWRV9BTkNFU1RPUiA9IFwiaXMtYWN0aXZlLWFuY2VzdG9yXCI7XG5cbi8vINCc0LXQvdGOINGC0LAg0ZbQvdGI0LVcbmNvbnN0IENTU19DTEFTU19NRU5VX1NFUEFSQVRPUiA9IFwibWVudS1zZXBhcmF0b3JcIjtcblxuLy8g0IbQutC+0L3QutC4XG4vLyBjb25zdCBDT0xMQVBTRV9JQ09OX1JPTEUgPSBcImx1Y2lkZS1mb2xkZXJcIjsgLy8g0JfQsNC80ZbQvdC10L3QviDQvdCwINGI0LXQstGA0L7QvdC4XG4vLyBjb25zdCBFWFBBTkRfSUNPTl9ST0xFID0gXCJsdWNpZGUtZm9sZGVyLW9wZW5cIjsgICAvLyDQl9Cw0LzRltC90LXQvdC+INC90LAg0YjQtdCy0YDQvtC90LhcbmNvbnN0IENPTExBUFNFX0lDT05fQUNDT1JESU9OID0gXCJsdWNpZGUtY2hldnJvbi1yaWdodFwiOyAvLyDQhtC60L7QvdC60LAg0LTQu9GPINC30LPQvtGA0L3Rg9GC0L7RlyDRgdC10LrRhtGW0ZdcbmNvbnN0IEVYUEFORF9JQ09OX0FDQ09SRElPTiA9IFwibHVjaWRlLWNoZXZyb24tZG93blwiOyAvLyDQhtC60L7QvdC60LAg0LTQu9GPINGA0L7Qt9Cz0L7RgNC90YPRgtC+0Zcg0YHQtdC60YbRltGXXG5jb25zdCBGT0xERVJfSUNPTl9DTE9TRUQgPSBcImx1Y2lkZS1mb2xkZXJcIjtcbmNvbnN0IEZPTERFUl9JQ09OX09QRU4gPSBcImx1Y2lkZS1mb2xkZXItb3BlblwiO1xuY29uc3QgQ0hBVF9JQ09OID0gXCJsdWNpZGUtbWVzc2FnZS1zcXVhcmVcIjtcbmNvbnN0IENIQVRfSUNPTl9BQ1RJVkUgPSBcImx1Y2lkZS1jaGVja1wiO1xuY29uc3QgQ1NTX1NJREVCQVJfU0VDVElPTl9JQ09OID0gXCJvbGxhbWEtc2lkZWJhci1zZWN0aW9uLWljb25cIjsgLy8g0J/QvtCy0LXRgNGC0LDRlNC80L4g0LrQu9Cw0YEg0LvRltCy0L7RlyDRltC60L7QvdC60Lhcbi8vIC4uLlxuXG4vLyAtLS0g0IbQutC+0L3QutC4IC0tLVxuY29uc3QgQ0hBVFNfU0VDVElPTl9JQ09OID0gXCJsdWNpZGUtbWVzc2FnZXMtc3F1YXJlXCI7IC8vINCG0LrQvtC90LrQsCDQtNC70Y8g0YHQtdC60YbRltGXIENoYXRzXG5jb25zdCBST0xFU19TRUNUSU9OX0lDT04gPSBcImx1Y2lkZS11c2Vyc1wiOyAvLyDQhtC60L7QvdC60LAg0LTQu9GPINGB0LXQutGG0ZbRlyBSb2xlc1xuXG5leHBvcnQgY2xhc3MgU2lkZWJhck1hbmFnZXIge1xuICBwcml2YXRlIHBsdWdpbjogT2xsYW1hUGx1Z2luO1xuICBwcml2YXRlIGFwcDogQXBwO1xuICBwcml2YXRlIHZpZXc6IE9sbGFtYVZpZXc7XG5cbiAgcHJpdmF0ZSByb290RHJvcFpvbmVFbCE6IEhUTUxFbGVtZW50OyBcblxuICBwcml2YXRlIGRyYWdnZWRJdGVtRGF0YTogeyB0eXBlOiAnY2hhdCcgfCAnZm9sZGVyJzsgaWQ6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IH0gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBjb250YWluZXJFbCE6IEhUTUxFbGVtZW50O1xuICBwcml2YXRlIGNoYXRQYW5lbEhlYWRlckVsITogSFRNTEVsZW1lbnQ7XG4gIHByaXZhdGUgY2hhdFBhbmVsTGlzdENvbnRhaW5lckVsITogSFRNTEVsZW1lbnQ7XG4gIHByaXZhdGUgbmV3Q2hhdFNpZGViYXJCdXR0b24hOiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSBuZXdGb2xkZXJTaWRlYmFyQnV0dG9uITogSFRNTEVsZW1lbnQ7XG4gIHByaXZhdGUgcm9sZVBhbmVsSGVhZGVyRWwhOiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSByb2xlUGFuZWxMaXN0RWwhOiBIVE1MRWxlbWVudDtcblxuICBwcml2YXRlIGZvbGRlckV4cGFuc2lvblN0YXRlOiBNYXA8c3RyaW5nLCBib29sZWFuPiA9IG5ldyBNYXAoKTtcbiAgcHJpdmF0ZSB1cGRhdGVDb3VudGVyID0gMDtcblxuICBjb25zdHJ1Y3RvcihwbHVnaW46IE9sbGFtYVBsdWdpbiwgYXBwOiBBcHAsIHZpZXc6IE9sbGFtYVZpZXcpIHtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgICB0aGlzLmFwcCA9IGFwcDtcbiAgICB0aGlzLnZpZXcgPSB2aWV3O1xuICB9XG4gIFxucHVibGljIGNyZWF0ZVNpZGViYXJVSShwYXJlbnRFbGVtZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcbiAgdGhpcy5jb250YWluZXJFbCA9IHBhcmVudEVsZW1lbnQuY3JlYXRlRGl2KHsgY2xzOiBDU1NfU0lERUJBUl9DT05UQUlORVIgfSk7XG4gIC8vIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIltTaWRlYmFyVUldIENyZWF0aW5nIHNpZGViYXIgVUkgc3RydWN0dXJlLi4uXCIpO1xuXG4gIC8vIC0tLSDQodC10LrRhtGW0Y8g0KfQsNGC0ZbQsiAtLS1cbiAgY29uc3QgY2hhdFBhbmVsID0gdGhpcy5jb250YWluZXJFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19DSEFUX1BBTkVMIH0pO1xuXG4gIC8vINCX0LDQs9C+0LvQvtCy0L7QuiDRgdC10LrRhtGW0Zcg0YfQsNGC0ZbQslxuICB0aGlzLmNoYXRQYW5lbEhlYWRlckVsID0gY2hhdFBhbmVsLmNyZWF0ZURpdih7XG4gICAgY2xzOiBbQ1NTX1NJREVCQVJfU0VDVElPTl9IRUFERVIsIENTU19DTEFTU19NRU5VX09QVElPTl0sXG4gICAgYXR0cjogeyBcImRhdGEtc2VjdGlvbi10eXBlXCI6IFwiY2hhdHNcIiwgXCJkYXRhLWNvbGxhcHNlZFwiOiBcImZhbHNlXCIgfSwgLy8g0JfQsCDQt9Cw0LzQvtCy0YfRg9Cy0LDQvdC90Y/QvCDRgNC+0LfQs9C+0YDQvdGD0YLQvlxuICB9KTtcbiAgY29uc3QgY2hhdEhlYWRlckxlZnQgPSB0aGlzLmNoYXRQYW5lbEhlYWRlckVsLmNyZWF0ZURpdih7IGNsczogQ1NTX1NJREVCQVJfSEVBREVSX0xFRlQgfSk7XG4gIHNldEljb24oY2hhdEhlYWRlckxlZnQuY3JlYXRlU3Bhbih7IGNsczogQ1NTX1NJREVCQVJfU0VDVElPTl9JQ09OIH0pLCBDSEFUU19TRUNUSU9OX0lDT04pO1xuICBjaGF0SGVhZGVyTGVmdC5jcmVhdGVTcGFuKHsgY2xzOiBcIm1lbnUtb3B0aW9uLXRleHRcIiwgdGV4dDogXCJDaGF0c1wiIH0pO1xuXG4gIGNvbnN0IGNoYXRIZWFkZXJBY3Rpb25zID0gdGhpcy5jaGF0UGFuZWxIZWFkZXJFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19TSURFQkFSX0hFQURFUl9BQ1RJT05TIH0pO1xuICAvLyDQmtC90L7Qv9C60LAgXCLQndC+0LLQsCDQv9Cw0L/QutCwXCJcbiAgdGhpcy5uZXdGb2xkZXJTaWRlYmFyQnV0dG9uID0gY2hhdEhlYWRlckFjdGlvbnMuY3JlYXRlRGl2KHtcbiAgICBjbHM6IFtDU1NfU0lERUJBUl9IRUFERVJfQlVUVE9OLCBcImNsaWNrYWJsZS1pY29uXCJdLFxuICAgIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiTmV3IEZvbGRlclwiLCB0aXRsZTogXCJOZXcgRm9sZGVyXCIgfSxcbiAgfSk7XG4gIHNldEljb24odGhpcy5uZXdGb2xkZXJTaWRlYmFyQnV0dG9uLCBcImx1Y2lkZS1mb2xkZXItcGx1c1wiKTtcbiAgLy8g0JrQvdC+0L/QutCwIFwi0J3QvtCy0LjQuSDRh9Cw0YJcIlxuICB0aGlzLm5ld0NoYXRTaWRlYmFyQnV0dG9uID0gY2hhdEhlYWRlckFjdGlvbnMuY3JlYXRlRGl2KHtcbiAgICBjbHM6IFtDU1NfU0lERUJBUl9IRUFERVJfQlVUVE9OLCBcImNsaWNrYWJsZS1pY29uXCJdLFxuICAgIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiTmV3IENoYXRcIiwgdGl0bGU6IFwiTmV3IENoYXRcIiB9LFxuICB9KTtcbiAgc2V0SWNvbih0aGlzLm5ld0NoYXRTaWRlYmFyQnV0dG9uLCBcImx1Y2lkZS1wbHVzLWNpcmNsZVwiKTtcbiAgLy8g0KjQtdCy0YDQvtC9INC00LvRjyDRgNC+0LfQs9C+0YDRgtCw0L3QvdGPL9C30LPQvtGA0YLQsNC90L3RjyDRgdC10LrRhtGW0Zcg0YfQsNGC0ZbQslxuICBjb25zdCBjaGF0Q2hldnJvbiA9IGNoYXRIZWFkZXJBY3Rpb25zLmNyZWF0ZVNwYW4oeyBjbHM6IFtDU1NfU0VDVElPTl9UT0dHTEVfQ0hFVlJPTiwgXCJjbGlja2FibGUtaWNvblwiXSB9KTtcbiAgc2V0SWNvbihjaGF0Q2hldnJvbiwgRVhQQU5EX0lDT05fQUNDT1JESU9OKTsgLy8g0IbQutC+0L3QutCwINGA0L7Qt9Cz0L7RgNC90YPRgtC+0Zcg0YHQtdC60YbRltGXXG5cbiAgLy8g0JrQvtC90YLQtdC50L3QtdGAINC00LvRjyDRgdC/0LjRgdC60YMg0YfQsNGC0ZbQsiDRgtCwINC/0LDQv9C+0LpcbiAgdGhpcy5jaGF0UGFuZWxMaXN0Q29udGFpbmVyRWwgPSBjaGF0UGFuZWwuY3JlYXRlRGl2KHtcbiAgICBjbHM6IFtDU1NfQ0hBVF9MSVNUX0NPTlRBSU5FUiwgQ1NTX1NJREVCQVJfU0VDVElPTl9DT05URU5ULCBDU1NfRVhQQU5ERURfQ0xBU1NdLCAvLyDQn9C+0YfQuNC90LDRlNC80L4g0Lcg0YDQvtC30LPQvtGA0L3Rg9GC0L7Qs9C+INGB0YLQsNC90YNcbiAgfSk7XG5cbiAgLy8gLS0tINCh0J/QldCm0IbQkNCb0KzQndCQINCX0J7QndCQINCU0JvQryDQodCa0JjQlNCQ0J3QndCvINCSINCa0J7QoNCG0J3QrCAtLS1cbiAgLy8g0KbQtdC5INC10LvQtdC80LXQvdGCINC00L7QtNCw0ZTRgtGM0YHRjyDQstGB0LXRgNC10LTQuNC90ZYgY2hhdFBhbmVsLCDQn9CG0KHQm9CvIGNoYXRQYW5lbExpc3RDb250YWluZXJFbFxuICB0aGlzLnJvb3REcm9wWm9uZUVsID0gY2hhdFBhbmVsLmNyZWF0ZURpdih7IGNsczogJ29sbGFtYS1yb290LWRyb3Atem9uZScgfSk7XG4gIC8vINCe0L/RhtGW0L7QvdCw0LvRjNC90LjQuSDRgtC10LrRgdGCLdC/0ZbQtNC60LDQt9C60LAgKNC80L7QttC90LAg0YHRgtC40LvRltC30YPQstCw0YLQuCDRh9C10YDQtdC3IENTUyBjb250ZW50INCw0LHQviDQtNC+0LTQsNGC0Lggc3BhbilcbiAgLy8gdGhpcy5yb290RHJvcFpvbmVFbC5jcmVhdGVTcGFuKHsgdGV4dDogXCJEcm9wIGhlcmUgdG8gbW92ZSB0byByb290XCIgfSk7XG5cbiAgLy8g0J/RgNC40LIn0Y/Qt9GD0ZTQvNC+INC+0LHRgNC+0LHQvdC40LrQuCBEcmFnLWFuZC1Ecm9wINC00L4g0YbRltGU0Zcg0YHQv9C10YbRltCw0LvRjNC90L7RlyDQt9C+0L3QuFxuICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudCh0aGlzLnJvb3REcm9wWm9uZUVsLCAnZHJhZ292ZXInLCB0aGlzLmhhbmRsZURyYWdPdmVyUm9vdFpvbmUuYmluZCh0aGlzKSk7XG4gIHRoaXMudmlldy5yZWdpc3RlckRvbUV2ZW50KHRoaXMucm9vdERyb3Bab25lRWwsICdkcmFnZW50ZXInLCB0aGlzLmhhbmRsZURyYWdFbnRlclJvb3Rab25lLmJpbmQodGhpcykpO1xuICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudCh0aGlzLnJvb3REcm9wWm9uZUVsLCAnZHJhZ2xlYXZlJywgdGhpcy5oYW5kbGVEcmFnTGVhdmVSb290Wm9uZS5iaW5kKHRoaXMpKTtcbiAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5yb290RHJvcFpvbmVFbCwgJ2Ryb3AnLCB0aGlzLmhhbmRsZURyb3BSb290Wm9uZS5iaW5kKHRoaXMpKTtcbiAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFwiW1NpZGViYXJVSV0gUm9vdCBkcm9wIGxpc3RlbmVycyBhdHRhY2hlZCB0byBkZWRpY2F0ZWQgcm9vdCBkcm9wIHpvbmUgZWxlbWVudC5cIik7XG4gIC8vIC0tLSDQmtCG0J3QldCm0Kwg0KHQn9CV0KbQhtCQ0JvQrNCd0J7QhyDQl9Ce0J3QmCAtLS1cblxuICAvLyAtLS0g0KHQtdC60YbRltGPINCg0L7Qu9C10LkgLS0tXG4gIGNvbnN0IHJvbGVQYW5lbCA9IHRoaXMuY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBDU1NfUk9MRV9QQU5FTCB9KTtcbiAgLy8g0JfQsNCz0L7Qu9C+0LLQvtC6INGB0LXQutGG0ZbRlyDRgNC+0LvQtdC5XG4gIHRoaXMucm9sZVBhbmVsSGVhZGVyRWwgPSByb2xlUGFuZWwuY3JlYXRlRGl2KHtcbiAgICBjbHM6IFtDU1NfU0lERUJBUl9TRUNUSU9OX0hFQURFUiwgQ1NTX0NMQVNTX01FTlVfT1BUSU9OXSxcbiAgICBhdHRyOiB7IFwiZGF0YS1zZWN0aW9uLXR5cGVcIjogXCJyb2xlc1wiLCBcImRhdGEtY29sbGFwc2VkXCI6IFwidHJ1ZVwiIH0sIC8vINCX0LAg0LfQsNC80L7QstGH0YPQstCw0L3QvdGP0Lwg0LfQs9C+0YDQvdGD0YLQvlxuICB9KTtcbiAgY29uc3Qgcm9sZUhlYWRlckxlZnQgPSB0aGlzLnJvbGVQYW5lbEhlYWRlckVsLmNyZWF0ZURpdih7IGNsczogQ1NTX1NJREVCQVJfSEVBREVSX0xFRlQgfSk7XG4gIHNldEljb24ocm9sZUhlYWRlckxlZnQuY3JlYXRlU3Bhbih7IGNsczogQ1NTX1NJREVCQVJfU0VDVElPTl9JQ09OIH0pLCBST0xFU19TRUNUSU9OX0lDT04pO1xuICByb2xlSGVhZGVyTGVmdC5jcmVhdGVTcGFuKHsgY2xzOiBcIm1lbnUtb3B0aW9uLXRleHRcIiwgdGV4dDogXCJSb2xlc1wiIH0pO1xuXG4gIGNvbnN0IHJvbGVIZWFkZXJBY3Rpb25zID0gdGhpcy5yb2xlUGFuZWxIZWFkZXJFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19TSURFQkFSX0hFQURFUl9BQ1RJT05TIH0pO1xuICAvLyDQqNC10LLRgNC+0L0g0LTQu9GPINGA0L7Qt9Cz0L7RgNGC0LDQvdC90Y8v0LfQs9C+0YDRgtCw0L3QvdGPINGB0LXQutGG0ZbRlyDRgNC+0LvQtdC5XG4gIGNvbnN0IHJvbGVDaGV2cm9uID0gcm9sZUhlYWRlckFjdGlvbnMuY3JlYXRlU3Bhbih7IGNsczogW0NTU19TRUNUSU9OX1RPR0dMRV9DSEVWUk9OLCBcImNsaWNrYWJsZS1pY29uXCJdIH0pO1xuICBzZXRJY29uKHJvbGVDaGV2cm9uLCBDT0xMQVBTRV9JQ09OX0FDQ09SRElPTik7IC8vINCG0LrQvtC90LrQsCDQt9Cz0L7RgNC90YPRgtC+0Zcg0YHQtdC60YbRltGXXG5cbiAgLy8g0JrQvtC90YLQtdC50L3QtdGAINC00LvRjyDRgdC/0LjRgdC60YMg0YDQvtC70LXQuVxuICB0aGlzLnJvbGVQYW5lbExpc3RFbCA9IHJvbGVQYW5lbC5jcmVhdGVEaXYoe1xuICAgICAgY2xzOiBbQ1NTX1JPTEVfUEFORUxfTElTVCwgQ1NTX1NJREVCQVJfU0VDVElPTl9DT05URU5UXSAvLyDQl9CwINC30LDQvNC+0LLRh9GD0LLQsNC90L3Rj9C8INC/0YDQuNGF0L7QstCw0L3QvlxuICB9KTtcbiAgLy8g0JTQvtC00LDRlNC80L4g0LrQu9Cw0YEg0LTQu9GPINC/0YDQuNGF0L7QstGD0LLQsNC90L3Rjywg0Y/QutGJ0L4g0YHQtdC60YbRltGPINC30LPQvtGA0L3Rg9GC0LBcbiAgaWYgKHRoaXMucm9sZVBhbmVsSGVhZGVyRWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1jb2xsYXBzZWRcIikgPT09IFwidHJ1ZVwiKSB7XG4gICAgICB0aGlzLnJvbGVQYW5lbExpc3RFbC5hZGRDbGFzcyhDU1NfU0lERUJBUl9TRUNUSU9OX0NPTlRFTlRfSElEREVOKTtcbiAgfVxuXG4gIC8vINCf0YDQuNCyJ9GP0LfRg9GU0LzQviDQvtGB0L3QvtCy0L3RliDRgdC70YPRhdCw0YfRliDQv9C+0LTRltC5INC00LvRjyDRgdCw0LnQtNCx0LDRgNGDICjQutC70ZbQutC4INC90LAg0LfQsNCz0L7Qu9C+0LLQutC4INGB0LXQutGG0ZbQuSwg0LrQvdC+0L/QutC4IFwi0L3QvtCy0LjQuSDRh9Cw0YIv0L/QsNC/0LrQsFwiKVxuICB0aGlzLmF0dGFjaFNpZGViYXJFdmVudExpc3RlbmVycygpO1xuXG4gIC8vINCf0L7Rh9Cw0YLQutC+0LLQtSDQt9Cw0L/QvtCy0L3QtdC90L3RjyDRgdC/0LjRgdC60YMg0YfQsNGC0ZbQsiwg0Y/QutGJ0L4g0YHQtdC60YbRltGPINCy0LjQtNC40LzQsCAo0LfQsCDQt9Cw0LzQvtCy0YfRg9Cy0LDQvdC90Y/QvCDQstC+0L3QsCDQstC40LTQuNC80LApXG4gIGlmICh0aGlzLmlzU2VjdGlvblZpc2libGUoXCJjaGF0c1wiKSkge1xuICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIltTaWRlYmFyVUldIEluaXRpYWwgY2hhdCBsaXN0IHVwZGF0ZSBzY2hlZHVsZWQgYmVjYXVzZSAnY2hhdHMnIHNlY3Rpb24gaXMgdmlzaWJsZS5cIik7XG4gICAgdGhpcy51cGRhdGVDaGF0TGlzdCgpO1xuICB9IGVsc2Uge1xuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFwiW1NpZGViYXJVSV0gJ0NoYXRzJyBzZWN0aW9uIGluaXRpYWxseSBjb2xsYXBzZWQsIGNoYXQgbGlzdCB1cGRhdGUgZGVmZXJyZWQuXCIpO1xuICB9XG4gIC8vINCf0L7Rh9Cw0YLQutC+0LLQtSDQt9Cw0L/QvtCy0L3QtdC90L3RjyDRgdC/0LjRgdC60YMg0YDQvtC70LXQuSwg0Y/QutGJ0L4g0YHQtdC60YbRltGPINCy0LjQtNC40LzQsCAo0LfQsCDQt9Cw0LzQvtCy0YfRg9Cy0LDQvdC90Y/QvCDQstC+0L3QsCDQt9Cz0L7RgNC90YPRgtCwKVxuICBpZiAodGhpcy5pc1NlY3Rpb25WaXNpYmxlKFwicm9sZXNcIikpIHtcbiAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbU2lkZWJhclVJXSAnUm9sZXMnIHNlY3Rpb24gaW5pdGlhbGx5IHZpc2libGUsIHJvbGUgbGlzdCB1cGRhdGUgc2NoZWR1bGVkLlwiKTtcbiAgICB0aGlzLnVwZGF0ZVJvbGVMaXN0KCk7XG4gIH0gZWxzZSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbU2lkZWJhclVJXSAnUm9sZXMnIHNlY3Rpb24gaW5pdGlhbGx5IGNvbGxhcHNlZCwgcm9sZSBsaXN0IHVwZGF0ZSBkZWZlcnJlZC5cIik7XG4gIH1cblxuICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbU2lkZWJhclVJXSBTaWRlYmFyIFVJIGNyZWF0aW9uIGNvbXBsZXRlLlwiKTtcbiAgcmV0dXJuIHRoaXMuY29udGFpbmVyRWw7XG59IC8vIC0tLSDQmtGW0L3QtdGG0YwgY3JlYXRlU2lkZWJhclVJIC0tLVxuICBwcml2YXRlIGF0dGFjaFNpZGViYXJFdmVudExpc3RlbmVycygpOiB2b2lkIHtcbiAgICBpZiAoXG4gICAgICAhdGhpcy5jaGF0UGFuZWxIZWFkZXJFbCB8fFxuICAgICAgIXRoaXMucm9sZVBhbmVsSGVhZGVyRWwgfHxcbiAgICAgICF0aGlzLm5ld0NoYXRTaWRlYmFyQnV0dG9uIHx8XG4gICAgICAhdGhpcy5uZXdGb2xkZXJTaWRlYmFyQnV0dG9uXG4gICAgKSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbU2lkZWJhck1hbmFnZXJdIENhbm5vdCBhdHRhY2ggbGlzdGVuZXJzOiBVSSBlbGVtZW50cyBtaXNzaW5nLlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8g0JrQu9GW0Log0L3QsCDQstC10YHRjCDQt9Cw0LPQvtC70L7QstC+0LogKNCy0LrQu9GO0YfQsNGO0YfQuCDRiNC10LLRgNC+0L0pINGC0LXQv9C10YAg0L/QtdGA0LXQvNC40LrQsNGUINGB0LXQutGG0ZbRjlxuICAgIHRoaXMudmlldy5yZWdpc3RlckRvbUV2ZW50KHRoaXMuY2hhdFBhbmVsSGVhZGVyRWwsIFwiY2xpY2tcIiwgKCkgPT4gdGhpcy50b2dnbGVTZWN0aW9uKHRoaXMuY2hhdFBhbmVsSGVhZGVyRWwpKTtcbiAgICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudCh0aGlzLnJvbGVQYW5lbEhlYWRlckVsLCBcImNsaWNrXCIsICgpID0+IHRoaXMudG9nZ2xlU2VjdGlvbih0aGlzLnJvbGVQYW5lbEhlYWRlckVsKSk7XG5cbiAgICAvLyDQmtC70ZbQutC4INC90LAg0LrQvdC+0L/QutC4INC00ZbQuSAo0LfQsNC/0L7QsdGW0LPQsNGU0LzQviDRgdC/0LvQuNCy0LDQvdC90Y4sINGJ0L7QsSDQvdC1INC30LPQvtGA0L3Rg9GC0Lgg0YHQtdC60YbRltGOKVxuICAgIHRoaXMudmlldy5yZWdpc3RlckRvbUV2ZW50KHRoaXMubmV3Q2hhdFNpZGViYXJCdXR0b24sIFwiY2xpY2tcIiwgZSA9PiB7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgdGhpcy5oYW5kbGVOZXdDaGF0Q2xpY2sodGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2hhdHNGb2xkZXJQYXRoKTtcbiAgICB9KTtcbiAgICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudCh0aGlzLm5ld0ZvbGRlclNpZGViYXJCdXR0b24sIFwiY2xpY2tcIiwgZSA9PiB7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgdGhpcy5oYW5kbGVOZXdGb2xkZXJDbGljayh0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jaGF0c0ZvbGRlclBhdGgpO1xuICAgIH0pO1xuICB9XG5cbiAgcHVibGljIGlzU2VjdGlvblZpc2libGUodHlwZTogXCJjaGF0c1wiIHwgXCJyb2xlc1wiKTogYm9vbGVhbiB7XG4gICAgY29uc3QgaGVhZGVyRWwgPSB0eXBlID09PSBcImNoYXRzXCIgPyB0aGlzLmNoYXRQYW5lbEhlYWRlckVsIDogdGhpcy5yb2xlUGFuZWxIZWFkZXJFbDtcbiAgICByZXR1cm4gaGVhZGVyRWw/LmdldEF0dHJpYnV0ZShcImRhdGEtY29sbGFwc2VkXCIpID09PSBcImZhbHNlXCI7XG4gIH1cblxuICBwdWJsaWMgdXBkYXRlQ2hhdExpc3QgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgdGhpcy51cGRhdGVDb3VudGVyKys7XG4gICAgY29uc3QgY3VycmVudFVwZGF0ZUlkID0gdGhpcy51cGRhdGVDb3VudGVyO1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuY2hhdFBhbmVsTGlzdENvbnRhaW5lckVsO1xuICAgIGlmICghY29udGFpbmVyIHx8ICF0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLnBsdWdpbi5sb2dnZXIuaW5mbyhcbiAgICAgIC8vIGBbVXBkYXRlICMke2N1cnJlbnRVcGRhdGVJZH1dID4+Pj4+IFNUQVJUSU5HIHVwZGF0ZUNoYXRMaXN0ICh2aXNpYmxlOiAke3RoaXMuaXNTZWN0aW9uVmlzaWJsZShcImNoYXRzXCIpfSlgXG4gICAgKTtcbiAgICBjb250YWluZXIuY2xhc3NMaXN0LmFkZChcImlzLWxvYWRpbmdcIik7IC8vINCU0L7QtNCw0ZTQvNC+INC60LvQsNGBINC30LDQstCw0L3RgtCw0LbQtdC90L3Rj1xuICAgIGNvbnN0IGN1cnJlbnRTY3JvbGxUb3AgPSBjb250YWluZXIuc2Nyb2xsVG9wO1xuICAgIGNvbnRhaW5lci5lbXB0eSgpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBoaWVyYXJjaHkgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRDaGF0SGllcmFyY2h5KCk7XG4gICAgICBjb25zdCBjdXJyZW50QWN0aXZlQ2hhdElkID0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0QWN0aXZlQ2hhdElkKCk7XG4gICAgICBjb25zdCBhY3RpdmVBbmNlc3RvclBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgICBpZiAoY3VycmVudEFjdGl2ZUNoYXRJZCkge1xuICAgICAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0QWN0aXZlQ2hhdCgpO1xuICAgICAgICBpZiAoYWN0aXZlQ2hhdD8uZmlsZVBhdGgpIHtcbiAgICAgICAgICBsZXQgY3VycmVudFBhdGggPSBhY3RpdmVDaGF0LmZpbGVQYXRoO1xuICAgICAgICAgIHdoaWxlIChjdXJyZW50UGF0aC5pbmNsdWRlcyhcIi9cIikpIHtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudFBhdGggPSBjdXJyZW50UGF0aC5zdWJzdHJpbmcoMCwgY3VycmVudFBhdGgubGFzdEluZGV4T2YoXCIvXCIpKTtcbiAgICAgICAgICAgIGlmIChwYXJlbnRQYXRoID09PSBcIlwiKSB7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZFBhcmVudFBhdGggPSBub3JtYWxpemVQYXRoKHBhcmVudFBhdGgpO1xuICAgICAgICAgICAgICBhY3RpdmVBbmNlc3RvclBhdGhzLmFkZChub3JtYWxpemVkUGFyZW50UGF0aCk7XG4gICAgICAgICAgICAgIGN1cnJlbnRQYXRoID0gcGFyZW50UGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoYWN0aXZlQ2hhdCkge1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaGllcmFyY2h5Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcIm1lbnUtaW5mby10ZXh0XCIsIHRleHQ6IFwiTm8gc2F2ZWQgY2hhdHMgb3IgZm9sZGVycyB5ZXQuXCIgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBoaWVyYXJjaHkuZm9yRWFjaChub2RlID0+XG4gICAgICAgICAgdGhpcy5yZW5kZXJIaWVyYXJjaHlOb2RlKG5vZGUsIGNvbnRhaW5lciwgMCwgY3VycmVudEFjdGl2ZUNoYXRJZCwgYWN0aXZlQW5jZXN0b3JQYXRocywgY3VycmVudFVwZGF0ZUlkKVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLmluZm8oYFtVcGRhdGUgIyR7Y3VycmVudFVwZGF0ZUlkfV0gPDw8PDwgRklOSVNIRUQgdXBkYXRlQ2hhdExpc3QgKHJlbmRlcmluZyBkb25lKWApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtVcGRhdGUgIyR7Y3VycmVudFVwZGF0ZUlkfV0gRXJyb3IgcmVuZGVyaW5nIGhpZXJhcmNoeTpgLCBlcnJvcik7XG4gICAgICBjb250YWluZXIuZW1wdHkoKTtcbiAgICAgIGNvbnRhaW5lci5jcmVhdGVEaXYoeyB0ZXh0OiBcIkVycm9yIGxvYWRpbmcgY2hhdCBzdHJ1Y3R1cmUuXCIsIGNsczogXCJtZW51LWVycm9yLXRleHRcIiB9KTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1sb2FkaW5nXCIpO1xuICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgICAgaWYgKGNvbnRhaW5lcj8uaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICBjb250YWluZXIuc2Nyb2xsVG9wID0gY3VycmVudFNjcm9sbFRvcDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9O1xuXG4gIC8vIHNyYy9TaWRlYmFyTWFuYWdlci50c1xuXG5wcml2YXRlIHJlbmRlckhpZXJhcmNoeU5vZGUoXG4gIG5vZGU6IEhpZXJhcmNoeU5vZGUsICAgICAgICAgIC8vINCS0YPQt9C+0Lsg0ZbRlNGA0LDRgNGF0ZbRlyAo0L/QsNC/0LrQsCDQsNCx0L4g0YfQsNGCKVxuICBwYXJlbnRFbGVtZW50OiBIVE1MRWxlbWVudCwgICAvLyDQkdCw0YLRjNC60ZbQstGB0YzQutC40LkgSFRNTCDQtdC70LXQvNC10L3RglxuICBsZXZlbDogbnVtYmVyLCAgICAgICAgICAgICAgICAvLyDQoNGW0LLQtdC90Ywg0LLQutC70LDQtNC10L3QvtGB0YLRllxuICBhY3RpdmVDaGF0SWQ6IHN0cmluZyB8IG51bGwsICAvLyBJRCDQv9C+0YLQvtGH0L3QvtCz0L4g0LDQutGC0LjQstC90L7Qs9C+INGH0LDRgtGDXG4gIGFjdGl2ZUFuY2VzdG9yUGF0aHM6IFNldDxzdHJpbmc+LCAvLyDQqNC70Y/RhdC4INC00L4g0LDQutGC0LjQstC90LjRhSDQsdCw0YLRjNC60ZbQstGB0YzQutC40YUg0L/QsNC/0L7QulxuICB1cGRhdGVJZDogbnVtYmVyICAgICAgICAgICAgICAvLyBJRCDQv9C+0YLQvtGH0L3QvtCz0L4g0L7QvdC+0LLQu9C10L3QvdGPICjQtNC70Y8g0LvQvtCz0ZbQsilcbik6IHZvaWQge1xuICAvLyDQodGC0LLQvtGA0Y7RlNC80L4g0L7RgdC90L7QstC90LjQuSDQutC+0L3RgtC10LnQvdC10YAg0LTQu9GPINC10LvQtdC80LXQvdGC0LAg0YHQv9C40YHQutGDXG4gIGNvbnN0IGl0ZW1FbCA9IHBhcmVudEVsZW1lbnQuY3JlYXRlRGl2KHsgY2xzOiBbQ1NTX0hJRVJBUkNIWV9JVEVNLCBgJHtDU1NfSElFUkFSQ0hZX0lOREVOVF9QUkVGSVh9JHtsZXZlbH1gXSB9KTtcbiAgLy8g0KHRgtCy0L7RgNGO0ZTQvNC+INCy0L3Rg9GC0YDRltGI0L3RltC5INC60L7QvdGC0LXQudC90LXRgCDQtNC70Y8g0LrQvtC90YLQtdC90YLRgyAo0ZbQutC+0L3QutCwLCDRgtC10LrRgdGCLCDQutC90L7Qv9C60LgpXG4gIGNvbnN0IGl0ZW1Db250ZW50RWwgPSBpdGVtRWwuY3JlYXRlRGl2KHsgY2xzOiBDU1NfSElFUkFSQ0hZX0lURU1fQ09OVEVOVCB9KTtcblxuICAvLyAtLS0gRHJhZy1hbmQtRHJvcDog0KDQvtCx0LjQvNC+INC10LvQtdC80LXQvdGCINC/0LXRgNC10YLRj9Cz0YPQstCw0L3QuNC8INGC0LAg0LTQvtC00LDRlNC80L4g0YHQu9GD0YXQsNGH0ZYgLS0tXG4gIGl0ZW1FbC5zZXRBdHRyKCdkcmFnZ2FibGUnLCAndHJ1ZScpO1xuICAvLyDQn9C+0YfQsNGC0L7QuiDQv9C10YDQtdGC0Y/Qs9GD0LLQsNC90L3RjyAtINC30LHQtdGA0ZbQs9Cw0ZTQvNC+INC00LDQvdGWINC/0YDQviDQtdC70LXQvNC10L3RglxuICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudChpdGVtRWwsICdkcmFnc3RhcnQnLCAoZSkgPT4gdGhpcy5oYW5kbGVEcmFnU3RhcnQoZSwgbm9kZSkpO1xuICAvLyDQmtGW0L3QtdGG0Ywg0L/QtdGA0LXRgtGP0LPRg9Cy0LDQvdC90Y8gKNGD0YHQv9GW0YjQvdC1INGH0Lgg0L3RlikgLSDQvtGH0LjRidCw0ZTQvNC+INGB0YLQuNC70ZYv0LTQsNC90ZZcbiAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQoaXRlbUVsLCAnZHJhZ2VuZCcsIChlKSA9PiB0aGlzLmhhbmRsZURyYWdFbmQoZSkpO1xuICAvLyAtLS0g0JrRltC90LXRhtGMIERyYWctYW5kLURyb3Ag0LTQu9GPINC10LvQtdC80LXQvdGC0LAsINGJ0L4g0L/QtdGA0LXRgtGP0LPRg9GU0YLRjNGB0Y8gLS0tXG5cbiAgLy8gLS0tINCb0L7Qs9GW0LrQsCDQtNC70Y8g0J/QkNCf0J7QmiAtLS1cbiAgaWYgKG5vZGUudHlwZSA9PT0gJ2ZvbGRlcicpIHtcbiAgICAgIGl0ZW1FbC5hZGRDbGFzcyhDU1NfRk9MREVSX0lURU0pO1xuICAgICAgaXRlbUVsLmRhdGFzZXQucGF0aCA9IG5vZGUucGF0aDsgLy8g0JfQsdC10YDRltCz0LDRlNC80L4g0YjQu9GP0YUg0L/QsNC/0LrQuCDQtNC70Y8g0ZbQtNC10L3RgtC40YTRltC60LDRhtGW0ZdcbiAgICAgIGNvbnN0IGlzRXhwYW5kZWQgPSB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLmdldChub2RlLnBhdGgpID8/IGZhbHNlO1xuICAgICAgaWYgKCFpc0V4cGFuZGVkKSB7XG4gICAgICAgICAgaXRlbUVsLmFkZENsYXNzKENTU19ISUVSQVJDSFlfSVRFTV9DT0xMQVBTRUQpOyAvLyDQmtC70LDRgSDQtNC70Y8g0LfQs9C+0YDQvdGD0YLQvtGXINC/0LDQv9C60LhcbiAgICAgIH1cbiAgICAgIGlmIChhY3RpdmVBbmNlc3RvclBhdGhzLmhhcyhub2RlLnBhdGgpKSB7XG4gICAgICAgICAgaXRlbUVsLmFkZENsYXNzKENTU19GT0xERVJfQUNUSVZFX0FOQ0VTVE9SKTsgLy8g0JrQu9Cw0YEg0LTQu9GPINCw0LrRgtC40LLQvdC+0LPQviDQv9GA0LXQtNC60LBcbiAgICAgIH1cblxuICAgICAgLy8g0IbQutC+0L3QutCwINC/0LDQv9C60LggKNCy0ZbQtNC60YDQuNGC0LAv0LfQsNC60YDQuNGC0LApXG4gICAgICBjb25zdCBmb2xkZXJJY29uID0gaXRlbUNvbnRlbnRFbC5jcmVhdGVTcGFuKHsgY2xzOiBDU1NfRk9MREVSX0lDT04gfSk7XG4gICAgICBzZXRJY29uKGZvbGRlckljb24sIGlzRXhwYW5kZWQgPyBGT0xERVJfSUNPTl9PUEVOIDogRk9MREVSX0lDT05fQ0xPU0VEKTtcbiAgICAgIC8vINCd0LDQt9Cy0LAg0L/QsNC/0LrQuFxuICAgICAgaXRlbUNvbnRlbnRFbC5jcmVhdGVTcGFuKHsgY2xzOiBDU1NfSElFUkFSQ0hZX0lURU1fVEVYVCwgdGV4dDogbm9kZS5uYW1lIH0pO1xuXG4gICAgICAvLyDQmtC90L7Qv9C60LAgXCIuLi5cIiAo0L7Qv9GG0ZbRlyDQv9Cw0L/QutC4KVxuICAgICAgY29uc3Qgb3B0aW9uc0J0biA9IGl0ZW1Db250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwge1xuICAgICAgICAgIGNsczogW0NTU19ISUVSQVJDSFlfSVRFTV9PUFRJT05TLCBcImNsaWNrYWJsZS1pY29uXCJdLFxuICAgICAgICAgIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiRm9sZGVyIG9wdGlvbnNcIiwgdGl0bGU6IFwiTW9yZSBvcHRpb25zXCIgfSxcbiAgICAgIH0pO1xuICAgICAgc2V0SWNvbihvcHRpb25zQnRuLCBcImx1Y2lkZS1tb3JlLWhvcml6b250YWxcIik7XG4gICAgICAvLyDQntCx0YDQvtCx0L3QuNC6INC60LvRltC60YMg0L3QsCDQutC90L7Qv9C60YMg0L7Qv9GG0ZbQuVxuICAgICAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQob3B0aW9uc0J0biwgXCJjbGlja1wiLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7IC8vINCX0YPQv9C40L3Rj9GU0LzQviDRgdC/0LvQuNCy0LDQvdC90Y8sINGJ0L7QsSDQvdC1INGB0L/RgNCw0YbRjtCy0LDQsiDQutC70ZbQuiDQvdCwINC/0LDQv9C60YNcbiAgICAgICAgICB0aGlzLnNob3dGb2xkZXJDb250ZXh0TWVudShlLCBub2RlKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyAtLS0gRHJhZy1hbmQtRHJvcDog0JTQvtC00LDRlNC80L4g0YHQu9GD0YXQsNGH0ZYg0LTQu9GPINC/0LDQv9C60Lgg0Y/QuiDQptCG0JvQhiDRgdC60LjQtNCw0L3QvdGPIC0tLVxuICAgICAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQoaXRlbUVsLCAnZHJhZ292ZXInLCB0aGlzLmhhbmRsZURyYWdPdmVyKTtcbiAgICAgIHRoaXMudmlldy5yZWdpc3RlckRvbUV2ZW50KGl0ZW1FbCwgJ2RyYWdlbnRlcicsIChlKSA9PiB0aGlzLmhhbmRsZURyYWdFbnRlcihlLCBub2RlKSk7XG4gICAgICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudChpdGVtRWwsICdkcmFnbGVhdmUnLCB0aGlzLmhhbmRsZURyYWdMZWF2ZSk7XG4gICAgICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudChpdGVtRWwsICdkcm9wJywgKGUpID0+IHRoaXMuaGFuZGxlRHJvcChlLCBub2RlKSk7XG4gICAgICAvLyAtLS0g0JrRltC90LXRhtGMIERyYWctYW5kLURyb3Ag0LTQu9GPINGG0ZbQu9GWINGB0LrQuNC00LDQvdC90Y8gLS0tXG5cbiAgICAgIC8vINCe0LHRgNC+0LHQvdC40Log0LrQvtC90YLQtdC60YHRgtC90L7Qs9C+INC80LXQvdGOINC90LAg0LLRgdGOINC/0LDQv9C60YNcbiAgICAgIHRoaXMudmlldy5yZWdpc3RlckRvbUV2ZW50KGl0ZW1Db250ZW50RWwsIFwiY29udGV4dG1lbnVcIiwgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgdGhpcy5zaG93Rm9sZGVyQ29udGV4dE1lbnUoZSwgbm9kZSk7XG4gICAgICB9KTtcbiAgICAgIC8vINCe0LHRgNC+0LHQvdC40Log0LrQu9GW0LrRgyDQvdCwINC/0LDQv9C60YMgKNC00LvRjyDRgNC+0LfQs9C+0YDRgtCw0L3QvdGPL9C30LPQvtGA0YLQsNC90L3RjylcbiAgICAgIHRoaXMudmlldy5yZWdpc3RlckRvbUV2ZW50KGl0ZW1Db250ZW50RWwsIFwiY2xpY2tcIiwgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgIC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4sINGH0Lgg0LrQu9GW0Log0LHRg9CyINC90LUg0L3QsCDQutC90L7Qv9GG0ZYg0L7Qv9GG0ZbQuVxuICAgICAgICAgaWYgKGUudGFyZ2V0IGluc3RhbmNlb2YgRWxlbWVudCAmJiAhZS50YXJnZXQuY2xvc2VzdChgLiR7Q1NTX0hJRVJBUkNIWV9JVEVNX09QVElPTlN9YCkpIHtcbiAgICAgICAgICAgICB0aGlzLmhhbmRsZVRvZ2dsZUZvbGRlcihub2RlLnBhdGgpO1xuICAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vINCh0YLQstC+0YDRjtGU0LzQviDQutC+0L3RgtC10LnQvdC10YAg0LTQu9GPINC00L7Rh9GW0YDQvdGW0YUg0LXQu9C10LzQtdC90YLRltCyXG4gICAgICBjb25zdCBjaGlsZHJlbkNvbnRhaW5lciA9IGl0ZW1FbC5jcmVhdGVEaXYoeyBjbHM6IENTU19ISUVSQVJDSFlfSVRFTV9DSElMRFJFTiB9KTtcbiAgICAgIC8vINCg0LXQutGD0YDRgdC40LLQvdC+INGA0LXQvdC00LXRgNC40LzQviDQtNC+0YfRltGA0L3RliDQtdC70LXQvNC10L3RgtC4LCDRj9C60YnQviDQstC+0L3QuCDRlFxuICAgICAgaWYgKG5vZGUuY2hpbGRyZW4gJiYgbm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgbm9kZS5jaGlsZHJlbi5mb3JFYWNoKGNoaWxkTm9kZSA9PlxuICAgICAgICAgIHRoaXMucmVuZGVySGllcmFyY2h5Tm9kZShjaGlsZE5vZGUsIGNoaWxkcmVuQ29udGFpbmVyLCBsZXZlbCArIDEsIGFjdGl2ZUNoYXRJZCwgYWN0aXZlQW5jZXN0b3JQYXRocywgdXBkYXRlSWQpXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgfVxuICAvLyAtLS0g0JvQvtCz0ZbQutCwINC00LvRjyDQp9CQ0KLQhtCSIC0tLVxuICBlbHNlIGlmIChub2RlLnR5cGUgPT09ICdjaGF0Jykge1xuICAgICAgaXRlbUVsLmFkZENsYXNzKENTU19DSEFUX0lURU0pO1xuICAgICAgY29uc3QgY2hhdE1ldGEgPSBub2RlLm1ldGFkYXRhO1xuICAgICAgaXRlbUVsLmRhdGFzZXQuY2hhdElkID0gY2hhdE1ldGEuaWQ7IC8vINCX0LHQtdGA0ZbQs9Cw0ZTQvNC+IElEINGH0LDRgtGDXG4gICAgICBpdGVtRWwuZGF0YXNldC5maWxlUGF0aCA9IG5vZGUuZmlsZVBhdGg7IC8vINCX0LHQtdGA0ZbQs9Cw0ZTQvNC+INGI0LvRj9GFINC00L4g0YTQsNC50LvRgyDRh9Cw0YLRg1xuXG4gICAgICAvLyDQn9C10YDQtdCy0ZbRgNC60LAsINGH0Lgg0YfQsNGCINCw0LrRgtC40LLQvdC40LlcbiAgICAgIGNvbnN0IGlzQWN0aXZlID0gY2hhdE1ldGEuaWQgPT09IGFjdGl2ZUNoYXRJZDtcbiAgICAgIGlmIChpc0FjdGl2ZSkge1xuICAgICAgICAgIGl0ZW1FbC5hZGRDbGFzcyhDU1NfUk9MRV9QQU5FTF9JVEVNX0FDVElWRSk7IC8vINCa0LvQsNGBINC00LvRjyDQsNC60YLQuNCy0L3QvtCz0L4g0YfQsNGC0YNcbiAgICAgIH1cblxuICAgICAgLy8g0IbQutC+0L3QutCwINGH0LDRgtGDICjQt9Cy0LjRh9Cw0LnQvdCwINCw0LHQviDQsNC60YLQuNCy0L3QsClcbiAgICAgIGNvbnN0IGNoYXRJY29uID0gaXRlbUNvbnRlbnRFbC5jcmVhdGVTcGFuKHsgY2xzOiBDU1NfRk9MREVSX0lDT04gfSk7IC8vINCc0L7QttC70LjQstC+LCDQstCw0YDRgtC+INC30LzRltC90LjRgtC4INC60LvQsNGBXG4gICAgICBzZXRJY29uKGNoYXRJY29uLCBpc0FjdGl2ZSA/IENIQVRfSUNPTl9BQ1RJVkUgOiBDSEFUX0lDT04pO1xuICAgICAgLy8g0J3QsNC30LLQsCDRh9Cw0YLRg1xuICAgICAgaXRlbUNvbnRlbnRFbC5jcmVhdGVTcGFuKHsgY2xzOiBDU1NfSElFUkFSQ0hZX0lURU1fVEVYVCwgdGV4dDogY2hhdE1ldGEubmFtZSB9KTtcblxuICAgICAgLy8g0JrQvtC90YLQtdC50L3QtdGAINC00LvRjyDQtNC10YLQsNC70LXQuSAo0LTQsNGC0LApXG4gICAgICBjb25zdCBkZXRhaWxzV3JhcHBlciA9IGl0ZW1Db250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0hBVF9JVEVNX0RFVEFJTFMgfSk7XG4gICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGxhc3RNb2RpZmllZERhdGUgPSBuZXcgRGF0ZShjaGF0TWV0YS5sYXN0TW9kaWZpZWQpO1xuICAgICAgICAgIGNvbnN0IGRhdGVUZXh0ID0gIWlzTmFOKGxhc3RNb2RpZmllZERhdGUuZ2V0VGltZSgpKVxuICAgICAgICAgID8gdGhpcy5mb3JtYXRSZWxhdGl2ZURhdGUobGFzdE1vZGlmaWVkRGF0ZSkgLy8g0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviDQstGW0LTQvdC+0YHQvdGDINC00LDRgtGDXG4gICAgICAgICAgOiBcIkludmFsaWQgZGF0ZVwiO1xuICAgICAgICAgIGlmIChkYXRlVGV4dCA9PT0gXCJJbnZhbGlkIGRhdGVcIikge1xuICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oYFtSZW5kZXJdIEludmFsaWQgZGF0ZSBmb3IgY2hhdCAke2NoYXRNZXRhLmlkfTogJHtjaGF0TWV0YS5sYXN0TW9kaWZpZWR9YCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGRldGFpbHNXcmFwcGVyLmNyZWF0ZURpdih7IGNsczogQ1NTX0NIQVRfSVRFTV9EQVRFLCB0ZXh0OiBkYXRlVGV4dCB9KTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYEVycm9yIGZvcm1hdHRpbmcgZGF0ZSBmb3IgY2hhdCAke2NoYXRNZXRhLmlkfTogYCwgZSk7XG4gICAgICAgICAgZGV0YWlsc1dyYXBwZXIuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0hBVF9JVEVNX0RBVEUsIHRleHQ6IFwiRGF0ZSBlcnJvclwiIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyDQmtC90L7Qv9C60LAgXCIuLi5cIiAo0L7Qv9GG0ZbRlyDRh9Cw0YLRgylcbiAgICAgIGNvbnN0IG9wdGlvbnNCdG4gPSBpdGVtQ29udGVudEVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcbiAgICAgICAgICBjbHM6IFtDU1NfSElFUkFSQ0hZX0lURU1fT1BUSU9OUywgXCJjbGlja2FibGUtaWNvblwiXSxcbiAgICAgICAgICBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIkNoYXQgb3B0aW9uc1wiLCB0aXRsZTogXCJNb3JlIG9wdGlvbnNcIiB9LFxuICAgICAgfSk7XG4gICAgICBzZXRJY29uKG9wdGlvbnNCdG4sIFwibHVjaWRlLW1vcmUtaG9yaXpvbnRhbFwiKTtcbiAgICAgIC8vINCe0LHRgNC+0LHQvdC40Log0LrQu9GW0LrRgyDQvdCwINC60L3QvtC/0LrRgyDQvtC/0YbRltC5XG4gICAgICB0aGlzLnZpZXcucmVnaXN0ZXJEb21FdmVudChvcHRpb25zQnRuLCBcImNsaWNrXCIsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTsgLy8g0JfRg9C/0LjQvdGP0ZTQvNC+INGB0L/Qu9C40LLQsNC90L3Rj1xuICAgICAgICAgIHRoaXMuc2hvd0NoYXRDb250ZXh0TWVudShlLCBjaGF0TWV0YSk7XG4gICAgICB9KTtcblxuICAgICAgLy8g0J7QsdGA0L7QsdC90LjQuiDQutC70ZbQutGDINC90LAg0YfQsNGCICjQtNC70Y8g0LDQutGC0LjQstCw0YbRltGXKVxuICAgICAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQoaXRlbUNvbnRlbnRFbCwgXCJjbGlja1wiLCBhc3luYyAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgIC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4sINGH0Lgg0LrQu9GW0Log0LHRg9CyINC90LUg0L3QsCDQutC90L7Qv9GG0ZYg0L7Qv9GG0ZbQuVxuICAgICAgICAgIGlmIChlLnRhcmdldCBpbnN0YW5jZW9mIEVsZW1lbnQgJiYgIWUudGFyZ2V0LmNsb3Nlc3QoYC4ke0NTU19ISUVSQVJDSFlfSVRFTV9PUFRJT05TfWApKSB7XG4gICAgICAgICAgICAgIGlmIChjaGF0TWV0YS5pZCAhPT0gYWN0aXZlQ2hhdElkKSB7XG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5zZXRBY3RpdmVDaGF0KGNoYXRNZXRhLmlkKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgLy8g0J7QsdGA0L7QsdC90LjQuiDQutC+0L3RgtC10LrRgdGC0L3QvtCz0L4g0LzQtdC90Y4g0L3QsCDRh9Cw0YJcbiAgICAgIHRoaXMudmlldy5yZWdpc3RlckRvbUV2ZW50KGl0ZW1Db250ZW50RWwsIFwiY29udGV4dG1lbnVcIiwgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgdGhpcy5zaG93Q2hhdENvbnRleHRNZW51KGUsIGNoYXRNZXRhKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyDQp9Cw0YIg0L3QtSDQvNC+0LbQtSDQsdGD0YLQuCDRhtGW0LvQu9GOINC00LvRjyDRgdC60LjQtNCw0L3QvdGPIChkcm9wIHRhcmdldCksINGC0L7QvNGDINC+0LHRgNC+0LHQvdC40LrQuCAnZHJhZ292ZXInLCAnZHJvcCcgZXRjLiDQvdC1INC00L7QtNCw0Y7RgtGM0YHRjy5cbiAgfVxufSAvLyAtLS0g0JrRltC90LXRhtGMINC80LXRgtC+0LTRgyByZW5kZXJIaWVyYXJjaHlOb2RlIC0tLVxuXG4gIHByaXZhdGUgaGFuZGxlVG9nZ2xlRm9sZGVyKGZvbGRlclBhdGg6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuZ2V0KGZvbGRlclBhdGgpID8/IGZhbHNlO1xuICAgIGNvbnN0IG5ld1N0YXRlID0gIWN1cnJlbnRTdGF0ZTtcbiAgICB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLnNldChmb2xkZXJQYXRoLCBuZXdTdGF0ZSk7XG5cbiAgICBjb25zdCBmb2xkZXJJdGVtRWwgPSB0aGlzLmNoYXRQYW5lbExpc3RDb250YWluZXJFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAgIGAub2xsYW1hLWZvbGRlci1pdGVtW2RhdGEtcGF0aD1cIiR7Zm9sZGVyUGF0aH1cIl1gXG4gICAgKTtcbiAgICBpZiAoIWZvbGRlckl0ZW1FbCkge1xuICAgICAgdGhpcy51cGRhdGVDaGF0TGlzdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb2xkZXJJdGVtRWwuY2xhc3NMaXN0LnRvZ2dsZShDU1NfSElFUkFSQ0hZX0lURU1fQ09MTEFQU0VELCAhbmV3U3RhdGUpO1xuICAgIGNvbnN0IGZvbGRlckljb25FbCA9IGZvbGRlckl0ZW1FbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIi5cIiArIENTU19GT0xERVJfSUNPTik7XG4gICAgaWYgKGZvbGRlckljb25FbCkge1xuICAgICAgc2V0SWNvbihmb2xkZXJJY29uRWwsIG5ld1N0YXRlID8gRk9MREVSX0lDT05fT1BFTiA6IEZPTERFUl9JQ09OX0NMT1NFRCk7XG4gICAgfVxuICB9XG5cbiAgLy8g0JzQtdGC0L7QtCDQtNC70Y8g0YDQvtC30LPQvtGA0YLQsNC90L3Rjy/Qt9Cz0L7RgNGC0LDQvdC90Y8g0YHQtdC60YbRltC5IENoYXRzL1JvbGVzICjQsNC60L7RgNC00LXQvtC9KVxuICBwcml2YXRlIGFzeW5jIHRvZ2dsZVNlY3Rpb24oY2xpY2tlZEhlYWRlckVsOiBIVE1MRWxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vINCS0LjQt9C90LDRh9Cw0ZTQvNC+INGC0LjQvyDRgdC10LrRhtGW0ZcsINC90LAg0Y/QutGDINC60LvRltC60L3Rg9C70LggKCdjaGF0cycg0LDQsdC+ICdyb2xlcycpXG4gICAgY29uc3Qgc2VjdGlvblR5cGUgPSBjbGlja2VkSGVhZGVyRWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1zZWN0aW9uLXR5cGVcIikgYXMgXCJjaGF0c1wiIHwgXCJyb2xlc1wiO1xuICAgIC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4g0L/QvtGC0L7Rh9C90LjQuSDRgdGC0LDQvSAodHJ1ZSwg0Y/QutGJ0L4g0YHQtdC60YbRltGPINC30LDRgNCw0Lcg0LfQs9C+0YDQvdGD0YLQsClcbiAgICBjb25zdCBpc0N1cnJlbnRseUNvbGxhcHNlZCA9IGNsaWNrZWRIZWFkZXJFbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLWNvbGxhcHNlZFwiKSA9PT0gXCJ0cnVlXCI7XG4gICAgLy8g0JfQvdCw0YXQvtC00LjQvNC+INC10LvQtdC80LXQvdGCINGW0LrQvtC90LrQuC3RiNC10LLRgNC+0L3QsCDQsiDQutC70ZbQutC90YPRgtC+0LzRgyDQt9Cw0LPQvtC70L7QstC60YNcbiAgICBjb25zdCBpY29uRWwgPSBjbGlja2VkSGVhZGVyRWwucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oYC4ke0NTU19TRUNUSU9OX1RPR0dMRV9DSEVWUk9OfWApO1xuXG4gICAgLy8g0JLQuNC30L3QsNGH0LDRlNC80L4g0LXQu9C10LzQtdC90YLQuCBET00g0LTQu9GPINC/0L7RgtC+0YfQvdC+0Zcg0YLQsCDRltC90YjQvtGXINGB0LXQutGG0ZbRl1xuICAgIGxldCBjb250ZW50RWw6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBsZXQgdXBkYXRlRnVuY3Rpb246ICgoKSA9PiBQcm9taXNlPHZvaWQ+KSB8IG51bGw7IC8vINCk0YPQvdC60YbRltGPINC00LvRjyDQvtC90L7QstC70LXQvdC90Y8g0LLQvNGW0YHRgtGDICh1cGRhdGVDaGF0TGlzdCDQsNCx0L4gdXBkYXRlUm9sZUxpc3QpXG4gICAgbGV0IG90aGVySGVhZGVyRWw6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBsZXQgb3RoZXJDb250ZW50RWw6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBsZXQgb3RoZXJTZWN0aW9uVHlwZTogXCJjaGF0c1wiIHwgXCJyb2xlc1wiIHwgbnVsbCA9IG51bGw7XG5cbiAgICAvLyDQntGC0YDQuNC80YPRlNC80L4g0L/QvtGB0LjQu9Cw0L3QvdGPINC90LAg0L7RgdC90L7QstC90ZYg0LXQu9C10LzQtdC90YLQuCDQv9Cw0L3QtdC70LXQuVxuICAgIGNvbnN0IGNoYXRIZWFkZXIgPSB0aGlzLmNoYXRQYW5lbEhlYWRlckVsO1xuICAgIGNvbnN0IGNoYXRDb250ZW50ID0gdGhpcy5jaGF0UGFuZWxMaXN0Q29udGFpbmVyRWw7XG4gICAgY29uc3Qgcm9sZUhlYWRlciA9IHRoaXMucm9sZVBhbmVsSGVhZGVyRWw7XG4gICAgY29uc3Qgcm9sZUNvbnRlbnQgPSB0aGlzLnJvbGVQYW5lbExpc3RFbDtcblxuICAgIC8vINCf0YDQuNC30L3QsNGH0LDRlNC80L4g0LfQvNGW0L3QvdGWINC30LDQu9C10LbQvdC+INCy0ZbQtCDRgtC40L/RgyDRgdC10LrRhtGW0ZcsINC90LAg0Y/QutGDINC60LvRltC60L3Rg9C70LhcbiAgICBpZiAoc2VjdGlvblR5cGUgPT09IFwiY2hhdHNcIikge1xuICAgICAgY29udGVudEVsID0gY2hhdENvbnRlbnQ7XG4gICAgICB1cGRhdGVGdW5jdGlvbiA9IHRoaXMudXBkYXRlQ2hhdExpc3Q7XG4gICAgICBvdGhlckhlYWRlckVsID0gcm9sZUhlYWRlcjtcbiAgICAgIG90aGVyQ29udGVudEVsID0gcm9sZUNvbnRlbnQ7XG4gICAgICBvdGhlclNlY3Rpb25UeXBlID0gXCJyb2xlc1wiO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBzZWN0aW9uVHlwZSA9PT0gXCJyb2xlc1wiXG4gICAgICBjb250ZW50RWwgPSByb2xlQ29udGVudDtcbiAgICAgIHVwZGF0ZUZ1bmN0aW9uID0gdGhpcy51cGRhdGVSb2xlTGlzdDtcbiAgICAgIG90aGVySGVhZGVyRWwgPSBjaGF0SGVhZGVyO1xuICAgICAgb3RoZXJDb250ZW50RWwgPSBjaGF0Q29udGVudDtcbiAgICAgIG90aGVyU2VjdGlvblR5cGUgPSBcImNoYXRzXCI7XG4gICAgfVxuXG4gICAgLy8g0J/QtdGA0LXQstGW0YDQutCwLCDRh9C4INCy0YHRliDQvdC10L7QsdGF0ZbQtNC90ZYg0LXQu9C10LzQtdC90YLQuCDQt9C90LDQudC00LXQvdC+XG4gICAgaWYgKCFjb250ZW50RWwgfHwgIWljb25FbCB8fCAhdXBkYXRlRnVuY3Rpb24gfHwgIW90aGVySGVhZGVyRWwgfHwgIW90aGVyQ29udGVudEVsIHx8ICFvdGhlclNlY3Rpb25UeXBlKSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJDb3VsZCBub3QgZmluZCBhbGwgcmVxdWlyZWQgZWxlbWVudHMgZm9yIHNpZGViYXIgYWNjb3JkaW9uIHRvZ2dsZTpcIiwgc2VjdGlvblR5cGUpO1xuICAgICAgcmV0dXJuOyAvLyDQktC40YXQvtC00LjQvNC+LCDRj9C60YnQviDRidC+0YHRjCDQvdC1INC30L3QsNC50LTQtdC90L5cbiAgICB9XG5cbiAgICAvLyDQn9GA0LjQsifRj9C30YPRlNC80L4g0LrQvtC90YLQtdC60YHRgiAndGhpcycg0LTQviDRhNGD0L3QutGG0ZbRlyDQvtC90L7QstC70LXQvdC90Y8g0LTQu9GPINC/0L7QtNCw0LvRjNGI0L7Qs9C+INCy0LjQutC70LjQutGDXG4gICAgY29uc3QgYm91bmRVcGRhdGVGdW5jdGlvbiA9IHVwZGF0ZUZ1bmN0aW9uLmJpbmQodGhpcyk7XG5cbiAgICAvLyAtLS0g0JvQvtCz0ZbQutCwINGA0L7Qt9Cz0L7RgNGC0LDQvdC90Y8v0LfQs9C+0YDRgtCw0L3QvdGPIC0tLVxuICAgIGlmIChpc0N1cnJlbnRseUNvbGxhcHNlZCkge1xuICAgICAgLy8gPT09INCg0J7Ql9CT0J7QoNCi0JDQhNCc0J4g0J/QntCi0J7Qp9Cd0KMg0KHQldCa0KbQhtCuID09PVxuXG4gICAgICAvLyAxLiDQl9Cz0L7RgNGC0LDRlNC80L4g0IbQndCo0KMg0YHQtdC60YbRltGOICjRj9C60YnQviDQstC+0L3QsCDQt9Cw0YDQsNC3INGA0L7Qt9Cz0L7RgNC90YPRgtCwKVxuICAgICAgaWYgKG90aGVySGVhZGVyRWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1jb2xsYXBzZWRcIikgPT09IFwiZmFsc2VcIikge1xuICAgICAgICBjb25zdCBvdGhlckljb25FbCA9IG90aGVySGVhZGVyRWwucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oYC4ke0NTU19TRUNUSU9OX1RPR0dMRV9DSEVWUk9OfWApO1xuICAgICAgICBvdGhlckhlYWRlckVsLnNldEF0dHJpYnV0ZShcImRhdGEtY29sbGFwc2VkXCIsIFwidHJ1ZVwiKTsgLy8g0J/QvtC30L3QsNGH0LDRlNC80L4g0ZbQvdGI0YMg0Y/QuiDQt9Cz0L7RgNC90YPRgtGDXG4gICAgICAgIGlmIChvdGhlckljb25FbCkgc2V0SWNvbihvdGhlckljb25FbCwgQ09MTEFQU0VfSUNPTl9BQ0NPUkRJT04pOyAvLyDQktGB0YLQsNC90L7QstC70Y7RlNC80L4g0ZbQutC+0L3QutGDINC30LPQvtGA0YLQsNC90L3RjyDQtNC70Y8g0ZbQvdGI0L7Rl1xuICAgICAgICBvdGhlckNvbnRlbnRFbC5jbGFzc0xpc3QucmVtb3ZlKENTU19FWFBBTkRFRF9DTEFTUyk7IC8vINCS0LjQtNCw0LvRj9GU0LzQviDQutC70LDRgSDRgNC+0LfQs9C+0YDQvdGD0YLQvtCz0L4g0YHRgtCw0L3Rg1xuICAgICAgICBvdGhlckNvbnRlbnRFbC5jbGFzc0xpc3QuYWRkKENTU19TSURFQkFSX1NFQ1RJT05fQ09OVEVOVF9ISURERU4pOyAvLyDQlNC+0LTQsNGU0LzQviDQutC70LDRgSDQtNC70Y8g0LzQuNGC0YLRlNCy0L7Qs9C+INC/0YDQuNGF0L7QstGD0LLQsNC90L3RjyAo0YfQtdGA0LXQtyBDU1MpXG5cbiAgICAgICAgLy8g0KXQvtCy0LDRlNC80L4g0KLQhtCb0KzQmtCYINC60L3QvtC/0LrQuCDQtNGW0Lkg0LIg0ZbQvdGI0ZbQuSDRgdC10LrRhtGW0ZcgKNGI0LXQstGA0L7QvSDQt9Cw0LvQuNGI0LDRlNGC0YzRgdGPINCy0LjQtNC40LzQuNC8KVxuICAgICAgICBjb25zdCBvdGhlckhlYWRlckJ1dHRvbnMgPSBvdGhlckhlYWRlckVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KGAuJHtDU1NfU0lERUJBUl9IRUFERVJfQlVUVE9OfWApO1xuICAgICAgICBvdGhlckhlYWRlckJ1dHRvbnMuZm9yRWFjaChidG4gPT4gKGJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCIpKTtcbiAgICAgIH1cblxuICAgICAgLy8gMi4g0KDQvtC30LPQvtGA0YLQsNGU0LzQviDQn9Ce0KLQntCn0J3QoyDRgdC10LrRhtGW0Y5cbiAgICAgIGNsaWNrZWRIZWFkZXJFbC5zZXRBdHRyaWJ1dGUoXCJkYXRhLWNvbGxhcHNlZFwiLCBcImZhbHNlXCIpOyAvLyDQn9C+0LfQvdCw0YfQsNGU0LzQviDQv9C+0YLQvtGH0L3RgyDRj9C6INGA0L7Qt9Cz0L7RgNC90YPRgtGDXG4gICAgICBzZXRJY29uKGljb25FbCwgRVhQQU5EX0lDT05fQUNDT1JESU9OKTsgLy8g0JLRgdGC0LDQvdC+0LLQu9GO0ZTQvNC+INGW0LrQvtC90LrRgyDRgNC+0LfQs9C+0YDRgtCw0L3QvdGPXG4gICAgICBjb250ZW50RWwuY2xhc3NMaXN0LnJlbW92ZShDU1NfU0lERUJBUl9TRUNUSU9OX0NPTlRFTlRfSElEREVOKTsgLy8g0JLQuNC00LDQu9GP0ZTQvNC+INC60LvQsNGBINGI0LLQuNC00LrQvtCz0L4g0L/RgNC40YXQvtCy0YPQstCw0L3QvdGPXG5cbiAgICAgIC8vINCf0L7QutCw0LfRg9GU0LzQviDQutC90L7Qv9C60Lgg0LTRltC5INCyINC/0L7RgtC+0YfQvdGW0Lkg0YHQtdC60YbRltGXXG4gICAgICBjb25zdCBoZWFkZXJCdXR0b25zID0gY2xpY2tlZEhlYWRlckVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KGAuJHtDU1NfU0lERUJBUl9IRUFERVJfQlVUVE9OfWApO1xuICAgICAgaGVhZGVyQnV0dG9ucy5mb3JFYWNoKGJ0biA9PiAoYnRuLnN0eWxlLmRpc3BsYXkgPSBcIlwiKSk7IC8vINCf0L7QstC10YDRgtCw0ZTQvNC+INGB0YLQsNC90LTQsNGA0YLQvdC40LkgZGlzcGxheVxuXG4gICAgICB0cnkge1xuICAgICAgICAvLyDQodC/0L7Rh9Cw0YLQutGDINC+0L3QvtCy0LvRjtGU0LzQviDQstC80ZbRgdGCINGB0LXQutGG0ZbRlyAo0LfQsNCy0LDQvdGC0LDQttGD0ZTQvNC+INC00LDQvdGWLCDRgNC10L3QtNC10YDQuNC80L4pXG4gICAgICAgIGF3YWl0IGJvdW5kVXBkYXRlRnVuY3Rpb24oKTtcbiAgICAgICAgLy8g0J/QvtGC0ZbQvCwg0YMg0L3QsNGB0YLRg9C/0L3QvtC80YMg0LrQsNC00YDRliDQsNC90ZbQvNCw0YbRltGXLCDQtNC+0LTQsNGU0LzQviDQutC70LDRgSAnaXMtZXhwYW5kZWQnLlxuICAgICAgICAvLyBDU1Mg0L/QvtC00LHQsNGUINC/0YDQviDQv9C70LDQstC90YMg0LDQvdGW0LzQsNGG0ZbRjiDRgNC+0LfQs9C+0YDRgtCw0L3QvdGPLlxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgICAgIGlmIChjb250ZW50RWw/LmlzQ29ubmVjdGVkICYmIGNsaWNrZWRIZWFkZXJFbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLWNvbGxhcHNlZFwiKSA9PT0gXCJmYWxzZVwiKSB7XG4gICAgICAgICAgICBjb250ZW50RWwuY2xhc3NMaXN0LmFkZChDU1NfRVhQQU5ERURfQ0xBU1MpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAvLyDQntCx0YDQvtCx0LrQsCDQv9C+0LzQuNC70LrQuCDQv9GW0LQg0YfQsNGBINC+0L3QvtCy0LvQtdC90L3RjyDQstC80ZbRgdGC0YNcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKGBFcnJvciB1cGRhdGluZyBzaWRlYmFyIHNlY3Rpb24gJHtzZWN0aW9uVHlwZX06YCwgZXJyb3IpO1xuICAgICAgICBjb250ZW50RWwuc2V0VGV4dChgRXJyb3IgbG9hZGluZyAke3NlY3Rpb25UeXBlfS5gKTsgLy8g0J/QvtC60LDQt9GD0ZTQvNC+INC/0L7QstGW0LTQvtC80LvQtdC90L3RjyDQv9GA0L4g0L/QvtC80LjQu9C60YNcbiAgICAgICAgLy8g0JLRgdC1INC+0LTQvdC+INC00L7QtNCw0ZTQvNC+INC60LvQsNGBLCDRidC+0LEg0L/QvtC60LDQt9Cw0YLQuCDQv9C+0LzQuNC70LrRg1xuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgICAgIGlmIChjb250ZW50RWw/LmlzQ29ubmVjdGVkICYmIGNsaWNrZWRIZWFkZXJFbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLWNvbGxhcHNlZFwiKSA9PT0gXCJmYWxzZVwiKSB7XG4gICAgICAgICAgICBjb250ZW50RWwuY2xhc3NMaXN0LmFkZChDU1NfRVhQQU5ERURfQ0xBU1MpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vID09PSDQl9CT0J7QoNCi0JDQhNCc0J4g0J/QntCi0J7Qp9Cd0KMg0KHQldCa0KbQhtCuID09PVxuICAgICAgLy8g0K/QutGJ0L4g0LrQu9GW0LrQvdGD0LvQuCDQvdCwINCy0LbQtSDRgNC+0LfQs9C+0YDQvdGD0YLRgyDRgdC10LrRhtGW0Y5cblxuICAgICAgY2xpY2tlZEhlYWRlckVsLnNldEF0dHJpYnV0ZShcImRhdGEtY29sbGFwc2VkXCIsIFwidHJ1ZVwiKTsgLy8g0J/QvtC30L3QsNGH0LDRlNC80L4g0Y/QuiDQt9Cz0L7RgNC90YPRgtGDXG4gICAgICBzZXRJY29uKGljb25FbCwgQ09MTEFQU0VfSUNPTl9BQ0NPUkRJT04pOyAvLyDQktGB0YLQsNC90L7QstC70Y7RlNC80L4g0ZbQutC+0L3QutGDINC30LPQvtGA0YLQsNC90L3Rj1xuICAgICAgY29udGVudEVsLmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0VYUEFOREVEX0NMQVNTKTsgLy8g0JLQuNC00LDQu9GP0ZTQvNC+INC60LvQsNGBINGA0L7Qt9Cz0L7RgNC90YPRgtC+0LPQviDRgdGC0LDQvdGDXG4gICAgICBjb250ZW50RWwuY2xhc3NMaXN0LmFkZChDU1NfU0lERUJBUl9TRUNUSU9OX0NPTlRFTlRfSElEREVOKTsgLy8g0JTQvtC00LDRlNC80L4g0LrQu9Cw0YEg0LTQu9GPINC80LjRgtGC0ZTQstC+0LPQviDQv9GA0LjRhdC+0LLRg9Cy0LDQvdC90Y9cblxuICAgICAgLy8g0KXQvtCy0LDRlNC80L4g0LrQvdC+0L/QutC4INC00ZbQuSDQsiDQv9C+0YLQvtGH0L3RltC5INGB0LXQutGG0ZbRl1xuICAgICAgY29uc3QgaGVhZGVyQnV0dG9ucyA9IGNsaWNrZWRIZWFkZXJFbC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihgLiR7Q1NTX1NJREVCQVJfSEVBREVSX0JVVFRPTn1gKTtcbiAgICAgIGhlYWRlckJ1dHRvbnMuZm9yRWFjaChidG4gPT4gKGJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCIpKTtcbiAgICB9XG4gIH0gLy8gLS0tINCa0ZbQvdC10YbRjCDQvNC10YLQvtC00YMgdG9nZ2xlU2VjdGlvbiAtLS1cblxuICAvLyAtLS0g0KDQtdGI0YLQsCDQvNC10YLQvtC00ZbQsiDQsdC10Lcg0LfQvNGW0L0gLS0tXG4gIHByaXZhdGUgc2hvd0ZvbGRlckNvbnRleHRNZW51KGV2ZW50OiBNb3VzZUV2ZW50IHwgUG9pbnRlckV2ZW50LCBmb2xkZXJOb2RlOiBGb2xkZXJOb2RlKTogdm9pZCB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBjb25zdCBtZW51ID0gbmV3IE1lbnUoKTtcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJOZXcgQ2hhdCBIZXJlXCIpXG4gICAgICAgIC5zZXRJY29uKFwibHVjaWRlLXBsdXMtY2lyY2xlXCIpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuaGFuZGxlTmV3Q2hhdENsaWNrKGZvbGRlck5vZGUucGF0aCkpXG4gICAgKTtcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJOZXcgRm9sZGVyIEhlcmVcIilcbiAgICAgICAgLnNldEljb24oXCJsdWNpZGUtZm9sZGVyLXBsdXNcIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5oYW5kbGVOZXdGb2xkZXJDbGljayhmb2xkZXJOb2RlLnBhdGgpKVxuICAgICk7XG4gICAgbWVudS5hZGRTZXBhcmF0b3IoKTtcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJSZW5hbWUgRm9sZGVyXCIpXG4gICAgICAgIC5zZXRJY29uKFwibHVjaWRlLXBlbmNpbFwiKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLmhhbmRsZVJlbmFtZUZvbGRlcihmb2xkZXJOb2RlKSlcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IHtcbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiRGVsZXRlIEZvbGRlclwiKVxuICAgICAgICAuc2V0SWNvbihcImx1Y2lkZS10cmFzaC0yXCIpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuaGFuZGxlRGVsZXRlRm9sZGVyKGZvbGRlck5vZGUpKTsgLyogU3R5bGluZyB2aWEgQ1NTICovXG4gICAgfSk7XG4gICAgbWVudS5zaG93QXRNb3VzZUV2ZW50KGV2ZW50KTtcbiAgfVxuICBwdWJsaWMgdXBkYXRlUm9sZUxpc3QgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy5yb2xlUGFuZWxMaXN0RWw7XG4gICAgaWYgKCFjb250YWluZXIgfHwgIXRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcbiAgICAgIGBbU2lkZWJhck1hbmFnZXIudXBkYXRlUm9sZUxpc3RdIFVwZGF0aW5nIHJvbGUgbGlzdCBjb250ZW50ICh2aXNpYmxlOiAke3RoaXMuaXNTZWN0aW9uVmlzaWJsZShcInJvbGVzXCIpfSkuLi5gXG4gICAgKTtcbiAgICBjb25zdCBjdXJyZW50U2Nyb2xsVG9wID0gY29udGFpbmVyLnNjcm9sbFRvcDtcbiAgICBjb250YWluZXIuZW1wdHkoKTtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgcm9sZXMgPSBhd2FpdCB0aGlzLnBsdWdpbi5saXN0Um9sZUZpbGVzKHRydWUpO1xuICAgICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXQoKTtcbiAgICAgIGNvbnN0IGN1cnJlbnRSb2xlUGF0aCA9IGFjdGl2ZUNoYXQ/Lm1ldGFkYXRhPy5zZWxlY3RlZFJvbGVQYXRoID8/IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XG4gICAgICBjb25zdCBub25lT3B0aW9uRWwgPSBjb250YWluZXIuY3JlYXRlRGl2KHtcbiAgICAgICAgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTSwgQ1NTX1JPTEVfUEFORUxfSVRFTV9OT05FLCBDU1NfQ0xBU1NfTUVOVV9PUFRJT05dLFxuICAgICAgfSk7XG4gICAgICBjb25zdCBub25lSWNvblNwYW4gPSBub25lT3B0aW9uRWwuY3JlYXRlU3Bhbih7IGNsczogW0NTU19ST0xFX1BBTkVMX0lURU1fSUNPTiwgXCJtZW51LW9wdGlvbi1pY29uXCJdIH0pO1xuICAgICAgbm9uZU9wdGlvbkVsLmNyZWF0ZVNwYW4oeyBjbHM6IFtDU1NfUk9MRV9QQU5FTF9JVEVNX1RFWFQsIFwibWVudS1vcHRpb24tdGV4dFwiXSwgdGV4dDogXCJOb25lXCIgfSk7XG4gICAgICBzZXRJY29uKG5vbmVJY29uU3BhbiwgIWN1cnJlbnRSb2xlUGF0aCA/IFwiY2hlY2tcIiA6IFwic2xhc2hcIik7XG4gICAgICBpZiAoIWN1cnJlbnRSb2xlUGF0aCkgbm9uZU9wdGlvbkVsLmFkZENsYXNzKENTU19ST0xFX1BBTkVMX0lURU1fQUNUSVZFKTtcbiAgICAgIHRoaXMudmlldy5yZWdpc3RlckRvbUV2ZW50KG5vbmVPcHRpb25FbCwgXCJjbGlja1wiLCAoKSA9PiB0aGlzLmhhbmRsZVJvbGVQYW5lbEl0ZW1DbGljayhudWxsLCBjdXJyZW50Um9sZVBhdGgpKTtcbiAgICAgIHJvbGVzLmZvckVhY2gocm9sZUluZm8gPT4ge1xuICAgICAgICBjb25zdCByb2xlT3B0aW9uRWwgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTSwgQ1NTX0NMQVNTX01FTlVfT1BUSU9OXSB9KTtcbiAgICAgICAgY29uc3QgaWNvblNwYW4gPSByb2xlT3B0aW9uRWwuY3JlYXRlU3Bhbih7IGNsczogW0NTU19ST0xFX1BBTkVMX0lURU1fSUNPTiwgXCJtZW51LW9wdGlvbi1pY29uXCJdIH0pO1xuICAgICAgICByb2xlT3B0aW9uRWwuY3JlYXRlU3Bhbih7IGNsczogW0NTU19ST0xFX1BBTkVMX0lURU1fVEVYVCwgXCJtZW51LW9wdGlvbi10ZXh0XCJdLCB0ZXh0OiByb2xlSW5mby5uYW1lIH0pO1xuICAgICAgICBpZiAocm9sZUluZm8uaXNDdXN0b20pIHJvbGVPcHRpb25FbC5hZGRDbGFzcyhDU1NfUk9MRV9QQU5FTF9JVEVNX0NVU1RPTSk7XG4gICAgICAgIHNldEljb24oaWNvblNwYW4sIHJvbGVJbmZvLnBhdGggPT09IGN1cnJlbnRSb2xlUGF0aCA/IFwiY2hlY2tcIiA6IHJvbGVJbmZvLmlzQ3VzdG9tID8gXCJ1c2VyXCIgOiBcImZpbGUtdGV4dFwiKTtcbiAgICAgICAgaWYgKHJvbGVJbmZvLnBhdGggPT09IGN1cnJlbnRSb2xlUGF0aCkgcm9sZU9wdGlvbkVsLmFkZENsYXNzKENTU19ST0xFX1BBTkVMX0lURU1fQUNUSVZFKTtcbiAgICAgICAgdGhpcy52aWV3LnJlZ2lzdGVyRG9tRXZlbnQocm9sZU9wdGlvbkVsLCBcImNsaWNrXCIsICgpID0+XG4gICAgICAgICAgdGhpcy5oYW5kbGVSb2xlUGFuZWxJdGVtQ2xpY2socm9sZUluZm8sIGN1cnJlbnRSb2xlUGF0aClcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbU2lkZWJhck1hbmFnZXIudXBkYXRlUm9sZUxpc3RdIEVycm9yIHJlbmRlcmluZzpcIiwgZXJyb3IpO1xuICAgICAgY29udGFpbmVyLmVtcHR5KCk7XG4gICAgICBjb250YWluZXIuY3JlYXRlRGl2KHsgdGV4dDogXCJFcnJvciBsb2FkaW5nIHJvbGVzLlwiLCBjbHM6IFwibWVudS1lcnJvci10ZXh0XCIgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgIGlmIChjb250YWluZXI/LmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgY29udGFpbmVyLnNjcm9sbFRvcCA9IGN1cnJlbnRTY3JvbGxUb3A7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcbiAgcHJpdmF0ZSBoYW5kbGVSb2xlUGFuZWxJdGVtQ2xpY2sgPSBhc3luYyAoXG4gICAgcm9sZUluZm86IFJvbGVJbmZvIHwgbnVsbCxcbiAgICBjdXJyZW50Um9sZVBhdGg6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWRcbiAgKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgY29uc3QgbmV3Um9sZVBhdGggPSByb2xlSW5mbz8ucGF0aCA/PyBcIlwiO1xuICAgIGNvbnN0IHJvbGVOYW1lRm9yRXZlbnQgPSByb2xlSW5mbz8ubmFtZSA/PyBcIk5vbmVcIjtcbiAgICBjb25zdCBub3JtYWxpemVkQ3VycmVudFJvbGVQYXRoID0gY3VycmVudFJvbGVQYXRoID8/IFwiXCI7XG4gICAgaWYgKG5ld1JvbGVQYXRoICE9PSBub3JtYWxpemVkQ3VycmVudFJvbGVQYXRoKSB7XG4gICAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmIChhY3RpdmVDaGF0KSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIudXBkYXRlQWN0aXZlQ2hhdE1ldGFkYXRhKHsgc2VsZWN0ZWRSb2xlUGF0aDogbmV3Um9sZVBhdGggfHwgdW5kZWZpbmVkIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGggPSBuZXdSb2xlUGF0aCB8fCB1bmRlZmluZWQ7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uZW1pdChcInJvbGUtY2hhbmdlZFwiLCByb2xlTmFtZUZvckV2ZW50KTtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5wcm9tcHRTZXJ2aWNlPy5jbGVhclJvbGVDYWNoZT8uKCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51cGRhdGVSb2xlTGlzdCgpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKGBbU2lkZWJhck1hbmFnZXJdIEVycm9yIHNldHRpbmcgcm9sZSB0byAke25ld1JvbGVQYXRofTpgLCBlcnJvcik7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJGYWlsZWQgdG8gc2V0IHRoZSByb2xlLlwiKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgIH1cbiAgfTtcbiAgXG4gIC8vIHNyYy9TaWRlYmFyTWFuYWdlci50c1xucHJpdmF0ZSBoYW5kbGVOZXdDaGF0Q2xpY2sgPSBhc3luYyAodGFyZ2V0Rm9sZGVyUGF0aD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zdCBmb2xkZXJQYXRoOiBzdHJpbmcgPSB0YXJnZXRGb2xkZXJQYXRoID8/IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmNoYXRzRm9sZGVyUGF0aCA/PyBcIi9cIjtcbiAgdHJ5IHtcbiAgICBjb25zdCBuZXdDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY3JlYXRlTmV3Q2hhdCh1bmRlZmluZWQsIGZvbGRlclBhdGgpO1xuICAgIGlmIChuZXdDaGF0KSB7XG4gICAgICBuZXcgTm90aWNlKGBDcmVhdGVkIG5ldyBjaGF0OiAke25ld0NoYXQubWV0YWRhdGEubmFtZX1gKTtcbiAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJmb2N1cy1pbnB1dC1yZXF1ZXN0XCIpO1xuICAgICAgY29uc3QgcGFyZW50UGF0aCA9IGZvbGRlclBhdGguc3Vic3RyaW5nKDAsIGZvbGRlclBhdGgubGFzdEluZGV4T2YoXCIvXCIpKTtcblxuICAgICAgLy8g0KDQvtC30LPQvtGA0YLQsNGU0LzQviDQsdCw0YLRjNC60ZbQstGB0YzQutGDINC/0LDQv9C60YMsINGP0LrRidC+INGH0LDRgiDRgdGC0LLQvtGA0LXQvdC+INCy0YHQtdGA0LXQtNC40L3RliDQvdC10ZdcbiAgICAgIC8vINGWINGG0LUg0L3QtSDQutC+0YDQtdC90LXQstCwINC/0LDQv9C60LAg0YfQsNGC0ZbQsi5cbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXJlbnRQYXRoID0gbm9ybWFsaXplUGF0aChwYXJlbnRQYXRoKTtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRDaGF0c0ZvbGRlclBhdGggPSBub3JtYWxpemVQYXRoKHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmNoYXRzRm9sZGVyUGF0aCA/PyBcIi9cIik7XG5cbiAgICAgIGlmIChwYXJlbnRQYXRoICYmIG5vcm1hbGl6ZWRQYXJlbnRQYXRoICE9PSBcIi9cIiAmJiBub3JtYWxpemVkUGFyZW50UGF0aCAhPT0gbm9ybWFsaXplZENoYXRzRm9sZGVyUGF0aCkge1xuICAgICAgICAgdGhpcy5mb2xkZXJFeHBhbnNpb25TdGF0ZS5zZXQobm9ybWFsaXplZFBhcmVudFBhdGgsIHRydWUpO1xuICAgICAgfVxuXG4gICAgICAvLyDQoNCV0JvQhtCXOiDQktC40LTQsNC70LXQvdC+INC/0YDRj9C80LjQuSDQstC40LrQu9C40LogdGhpcy51cGRhdGVDaGF0TGlzdCgpO1xuICAgICAgLy8g0KLQtdC/0LXRgCDQvtC90L7QstC70LXQvdC90Y8g0YHQv9C40YHQutGDINC80LDRlCDQstGW0LTQsdGD0LLQsNGC0LjRgdGPINGH0LXRgNC10Lcg0L/QvtC00ZbRjiAo0L3QsNC/0YDQuNC60LvQsNC0LCAnYWN0aXZlLWNoYXQtY2hhbmdlZCcg0LDQsdC+ICdjaGF0LWxpc3QtdXBkYXRlZCcpLFxuICAgICAgLy8g0Y/QutGDIENoYXRNYW5hZ2VyLmNyZWF0ZU5ld0NoYXQoKSDQvNCw0ZQg0LfQs9C10L3QtdGA0YPQstCw0YLQuCwg0LAgT2xsYW1hVmlldyDQvtCx0YDQvtCx0LjRgtC4LlxuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbU2lkZWJhck1hbmFnZXJdIEVycm9yIGNyZWF0aW5nIG5ldyBjaGF0OlwiLCBlcnJvcik7XG4gICAgbmV3IE5vdGljZShgRXJyb3IgY3JlYXRpbmcgbmV3IGNoYXQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlVua25vd24gZXJyb3JcIn1gKTtcbiAgfVxufTtcbiAgXG4gIHByaXZhdGUgaGFuZGxlTmV3Rm9sZGVyQ2xpY2sgPSBhc3luYyAocGFyZW50Rm9sZGVyUGF0aD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgIGNvbnN0IHRhcmdldFBhcmVudFBhdGg6IHN0cmluZyA9IHBhcmVudEZvbGRlclBhdGggPz8gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2hhdHNGb2xkZXJQYXRoID8/IFwiL1wiO1xuICAgIG5ldyBQcm9tcHRNb2RhbCh0aGlzLmFwcCwgXCJDcmVhdGUgTmV3IEZvbGRlclwiLCBcIkVudGVyIGZvbGRlciBuYW1lOlwiLCBcIlwiLCBhc3luYyBuZXdOYW1lID0+IHtcbiAgICAgIGNvbnN0IHRyaW1tZWROYW1lID0gbmV3TmFtZT8udHJpbSgpO1xuICAgICAgaWYgKCF0cmltbWVkTmFtZSkge1xuICAgICAgICBuZXcgTm90aWNlKFwiRm9sZGVyIG5hbWUgY2Fubm90IGJlIGVtcHR5LlwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKC9bXFxcXC8/OipcIjw+fF0vLnRlc3QodHJpbW1lZE5hbWUpKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJGb2xkZXIgbmFtZSBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMuXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCBuZXdGb2xkZXJQYXRoID0gbm9ybWFsaXplUGF0aChcbiAgICAgICAgdGFyZ2V0UGFyZW50UGF0aCA9PT0gXCIvXCIgPyB0cmltbWVkTmFtZSA6IGAke3RhcmdldFBhcmVudFBhdGh9LyR7dHJpbW1lZE5hbWV9YFxuICAgICAgKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jcmVhdGVGb2xkZXIobmV3Rm9sZGVyUGF0aCk7XG4gICAgICAgIGlmIChzdWNjZXNzKSB7XG4gICAgICAgICAgbmV3IE5vdGljZShgRm9sZGVyIFwiJHt0cmltbWVkTmFtZX1cIiBjcmVhdGVkLmApO1xuICAgICAgICAgIGlmICh0YXJnZXRQYXJlbnRQYXRoICYmIHRhcmdldFBhcmVudFBhdGggIT09IFwiL1wiKSB7XG4gICAgICAgICAgICB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLnNldCh0YXJnZXRQYXJlbnRQYXRoLCB0cnVlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gdGhpcy51cGRhdGVDaGF0TGlzdCgpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtTaWRlYmFyTWFuYWdlcl0gRXJyb3IgY3JlYXRpbmcgZm9sZGVyICR7bmV3Rm9sZGVyUGF0aH06YCwgZXJyb3IpO1xuICAgICAgICBuZXcgTm90aWNlKGBFcnJvciBjcmVhdGluZyBmb2xkZXI6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlVua25vd24gZXJyb3JcIn1gKTtcbiAgICAgIH1cbiAgICB9KS5vcGVuKCk7XG4gIH07XG4gIHByaXZhdGUgaGFuZGxlUmVuYW1lRm9sZGVyID0gYXN5bmMgKGZvbGRlck5vZGU6IEZvbGRlck5vZGUpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgICBjb25zdCBjdXJyZW50TmFtZSA9IGZvbGRlck5vZGUubmFtZTtcbiAgICBjb25zdCBwYXJlbnRQYXRoID0gZm9sZGVyTm9kZS5wYXRoLnN1YnN0cmluZygwLCBmb2xkZXJOb2RlLnBhdGgubGFzdEluZGV4T2YoXCIvXCIpKSB8fCBcIi9cIjtcbiAgICBuZXcgUHJvbXB0TW9kYWwodGhpcy5hcHAsIFwiUmVuYW1lIEZvbGRlclwiLCBgTmV3IG5hbWUgZm9yIFwiJHtjdXJyZW50TmFtZX1cIjpgLCBjdXJyZW50TmFtZSwgYXN5bmMgbmV3TmFtZSA9PiB7XG4gICAgICBjb25zdCB0cmltbWVkTmFtZSA9IG5ld05hbWU/LnRyaW0oKTtcbiAgICAgIGlmICghdHJpbW1lZE5hbWUgfHwgdHJpbW1lZE5hbWUgPT09IGN1cnJlbnROYW1lKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodHJpbW1lZE5hbWUgPT09IGN1cnJlbnROYW1lID8gXCJOYW1lIHVuY2hhbmdlZC5cIiA6IFwiUmVuYW1lIGNhbmNlbGxlZC5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmICgvW1xcXFwvPzoqXCI8PnxdLy50ZXN0KHRyaW1tZWROYW1lKSkge1xuICAgICAgICBuZXcgTm90aWNlKFwiRm9sZGVyIG5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzLlwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgbmV3Rm9sZGVyUGF0aCA9IG5vcm1hbGl6ZVBhdGgocGFyZW50UGF0aCA9PT0gXCIvXCIgPyB0cmltbWVkTmFtZSA6IGAke3BhcmVudFBhdGh9LyR7dHJpbW1lZE5hbWV9YCk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmV4aXN0cyhuZXdGb2xkZXJQYXRoKTtcbiAgICAgICAgaWYgKGV4aXN0cykge1xuICAgICAgICAgIG5ldyBOb3RpY2UoYEEgZm9sZGVyIG9yIGZpbGUgbmFtZWQgXCIke3RyaW1tZWROYW1lfVwiIGFscmVhZHkgZXhpc3RzIGhlcmUuYCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7fVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnJlbmFtZUZvbGRlcihmb2xkZXJOb2RlLnBhdGgsIG5ld0ZvbGRlclBhdGgpO1xuICAgICAgICBpZiAoc3VjY2Vzcykge1xuICAgICAgICAgIG5ldyBOb3RpY2UoYEZvbGRlciByZW5hbWVkIHRvIFwiJHt0cmltbWVkTmFtZX1cIi5gKTtcbiAgICAgICAgICBpZiAodGhpcy5mb2xkZXJFeHBhbnNpb25TdGF0ZS5oYXMoZm9sZGVyTm9kZS5wYXRoKSkge1xuICAgICAgICAgICAgY29uc3Qgd2FzRXhwYW5kZWQgPSB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLmdldChmb2xkZXJOb2RlLnBhdGgpO1xuICAgICAgICAgICAgdGhpcy5mb2xkZXJFeHBhbnNpb25TdGF0ZS5kZWxldGUoZm9sZGVyTm9kZS5wYXRoKTtcbiAgICAgICAgICAgIHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuc2V0KG5ld0ZvbGRlclBhdGgsIHdhc0V4cGFuZGVkISk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIHRoaXMudXBkYXRlQ2hhdExpc3QoKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFxuICAgICAgICAgIGBbU2lkZWJhck1hbmFnZXJdIEVycm9yIHJlbmFtaW5nIGZvbGRlciAke2ZvbGRlck5vZGUucGF0aH0gdG8gJHtuZXdGb2xkZXJQYXRofTpgLFxuICAgICAgICAgIGVycm9yXG4gICAgICAgICk7XG4gICAgICAgIG5ldyBOb3RpY2UoYEVycm9yIHJlbmFtaW5nIGZvbGRlcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiVW5rbm93biBlcnJvclwifWApO1xuICAgICAgfVxuICAgIH0pLm9wZW4oKTtcbiAgfTtcbiAgcHJpdmF0ZSBoYW5kbGVEZWxldGVGb2xkZXIgPSBhc3luYyAoZm9sZGVyTm9kZTogRm9sZGVyTm9kZSk6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgIGNvbnN0IGZvbGRlck5hbWUgPSBmb2xkZXJOb2RlLm5hbWU7XG4gICAgY29uc3QgZm9sZGVyUGF0aCA9IGZvbGRlck5vZGUucGF0aDtcbiAgICBpZiAoZm9sZGVyUGF0aCA9PT0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2hhdHNGb2xkZXJQYXRoKSB7XG4gICAgICBuZXcgTm90aWNlKFwiQ2Fubm90IGRlbGV0ZSB0aGUgbWFpbiBjaGF0IGhpc3RvcnkgZm9sZGVyLlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbmV3IENvbmZpcm1Nb2RhbChcbiAgICAgIHRoaXMuYXBwLFxuICAgICAgXCJEZWxldGUgRm9sZGVyXCIsXG4gICAgICBgRGVsZXRlIGZvbGRlciBcIiR7Zm9sZGVyTmFtZX1cIiBhbmQgQUxMIGl0cyBjb250ZW50cyAoc3ViZm9sZGVycyBhbmQgY2hhdHMpPyBUaGlzIGNhbm5vdCBiZSB1bmRvbmUuYCxcbiAgICAgIGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3Qgbm90aWNlID0gbmV3IE5vdGljZShgRGVsZXRpbmcgZm9sZGVyIFwiJHtmb2xkZXJOYW1lfVwiLi4uYCwgMCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmRlbGV0ZUZvbGRlcihmb2xkZXJQYXRoKTtcbiAgICAgICAgICBpZiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgY29uc3Qga2V5c1RvRGVsZXRlID0gQXJyYXkuZnJvbSh0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLmtleXMoKSkuZmlsdGVyKGtleSA9PiBrZXkuc3RhcnRzV2l0aChmb2xkZXJQYXRoKSk7XG4gICAgICAgICAgICBrZXlzVG9EZWxldGUuZm9yRWFjaChrZXkgPT4gdGhpcy5mb2xkZXJFeHBhbnNpb25TdGF0ZS5kZWxldGUoa2V5KSk7XG4gICAgICAgICAgICAvLyB0aGlzLnVwZGF0ZUNoYXRMaXN0KCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihgW1NpZGViYXJNYW5hZ2VyXSBFcnJvciBkZWxldGluZyBmb2xkZXIgJHtmb2xkZXJQYXRofTpgLCBlcnJvcik7XG4gICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgZGVsZXRpbmcgZm9sZGVyOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJVbmtub3duIGVycm9yXCJ9YCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgbm90aWNlLmhpZGUoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICkub3BlbigpO1xuICB9O1xuICBwcml2YXRlIHNob3dDaGF0Q29udGV4dE1lbnUoZXZlbnQ6IE1vdXNlRXZlbnQgfCBQb2ludGVyRXZlbnQsIGNoYXRNZXRhOiBDaGF0TWV0YWRhdGEpOiB2b2lkIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGNvbnN0IG1lbnUgPSBuZXcgTWVudSgpO1xuICAgIG1lbnUuYWRkSXRlbShpdGVtID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIkNsb25lIENoYXRcIilcbiAgICAgICAgLnNldEljb24oXCJsdWNpZGUtY29weS1wbHVzXCIpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuaGFuZGxlQ29udGV4dE1lbnVDbG9uZShjaGF0TWV0YS5pZCkpXG4gICAgKTtcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJSZW5hbWUgQ2hhdFwiKVxuICAgICAgICAuc2V0SWNvbihcImx1Y2lkZS1wZW5jaWxcIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5oYW5kbGVDb250ZXh0TWVudVJlbmFtZShjaGF0TWV0YS5pZCwgY2hhdE1ldGEubmFtZSkpXG4gICAgKTtcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJFeHBvcnQgdG8gTm90ZVwiKVxuICAgICAgICAuc2V0SWNvbihcImx1Y2lkZS1kb3dubG9hZFwiKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLmV4cG9ydFNwZWNpZmljQ2hhdChjaGF0TWV0YS5pZCkpXG4gICAgKTtcbiAgICBtZW51LmFkZFNlcGFyYXRvcigpO1xuICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IHtcbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiQ2xlYXIgTWVzc2FnZXNcIilcbiAgICAgICAgLnNldEljb24oXCJsdWNpZGUtdHJhc2hcIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5oYW5kbGVDb250ZXh0TWVudUNsZWFyKGNoYXRNZXRhLmlkLCBjaGF0TWV0YS5uYW1lKSk7IC8qIFN0eWxpbmcgdmlhIENTUyAqL1xuICAgIH0pO1xuICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IHtcbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiRGVsZXRlIENoYXRcIilcbiAgICAgICAgLnNldEljb24oXCJsdWNpZGUtdHJhc2gtMlwiKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLmhhbmRsZUNvbnRleHRNZW51RGVsZXRlKGNoYXRNZXRhLmlkLCBjaGF0TWV0YS5uYW1lKSk7IC8qIFN0eWxpbmcgdmlhIENTUyAqL1xuICAgIH0pO1xuICAgIG1lbnUuc2hvd0F0TW91c2VFdmVudChldmVudCk7XG4gIH1cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVDb250ZXh0TWVudUNsb25lKGNoYXRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgbm90aWNlID0gbmV3IE5vdGljZShcIkNsb25pbmcgY2hhdC4uLlwiLCAwKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgYyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmNsb25lQ2hhdChjaGF0SWQpO1xuICAgICAgaWYgKGMpIHtcbiAgICAgICAgbmV3IE5vdGljZShgQ2hhdCBjbG9uZWQgYXMgXCIke2MubWV0YWRhdGEubmFtZX1cImApO1xuICAgICAgICAvLyB0aGlzLnVwZGF0ZUNoYXRMaXN0KCk7XG4gICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJmb2N1cy1pbnB1dC1yZXF1ZXN0XCIpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihgQ2xvbmUgZXJyb3I6YCwgZSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgfVxuICB9XG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlQ29udGV4dE1lbnVSZW5hbWUoY2hhdElkOiBzdHJpbmcsIGN1cnJlbnROYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBuZXcgUHJvbXB0TW9kYWwodGhpcy5hcHAsIFwiUmVuYW1lIENoYXRcIiwgYE5ldyBuYW1lIGZvciBcIiR7Y3VycmVudE5hbWV9XCI6YCwgY3VycmVudE5hbWUsIGFzeW5jIG5ld05hbWUgPT4ge1xuICAgICAgY29uc3QgdHJpbW1lZE5hbWUgPSBuZXdOYW1lPy50cmltKCk7XG4gICAgICBpZiAoIXRyaW1tZWROYW1lIHx8IHRyaW1tZWROYW1lID09PSBjdXJyZW50TmFtZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRyaW1tZWROYW1lID09PSBjdXJyZW50TmFtZSA/IGBOYW1lIHVuY2hhbmdlZC5gIDogYFJlbmFtZSBjYW5jZWxsZWQuYCk7XG4gICAgICB9IGVsc2UgaWYgKC9bXFxcXC8/OipcIjw+fF0vLnRlc3QodHJpbW1lZE5hbWUpKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJDaGF0IG5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzLlwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZW5hbWVDaGF0KGNoYXRJZCwgdHJpbW1lZE5hbWUpOyAvKiBVSSB1cGRhdGUgaGFuZGxlZCBieSBldmVudCAqL1xuICAgICAgfVxuICAgICAgdGhpcy5wbHVnaW4uZW1pdChcImZvY3VzLWlucHV0LXJlcXVlc3RcIik7XG4gICAgfSkub3BlbigpO1xuICB9IC8vINCS0LjQtNCw0LvQtdC90L4g0Y/QstC90LjQuSB1cGRhdGVDaGF0TGlzdFxuICBwcml2YXRlIGFzeW5jIGV4cG9ydFNwZWNpZmljQ2hhdChjaGF0SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5vdGljZSA9IG5ldyBOb3RpY2UoYEV4cG9ydGluZyBjaGF0Li4uYCwgMCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRDaGF0KGNoYXRJZCk7XG4gICAgICBpZiAoIWNoYXQgfHwgY2hhdC5tZXNzYWdlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgbmV3IE5vdGljZShcIkNoYXQgaXMgZW1wdHkgb3Igbm90IGZvdW5kLCBub3RoaW5nIHRvIGV4cG9ydC5cIik7XG4gICAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG1kID0gdGhpcy5mb3JtYXRDaGF0VG9NYXJrZG93bihjaGF0Lm1lc3NhZ2VzLCBjaGF0Lm1ldGFkYXRhKTtcbiAgICAgIGNvbnN0IHRzID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1s6Ll0vZywgXCItXCIpO1xuICAgICAgY29uc3Qgc2FmZU5hbWUgPSBjaGF0Lm1ldGFkYXRhLm5hbWUucmVwbGFjZSgvW1xcXFwvPzoqXCI8PnxdL2csIFwiLVwiKTtcbiAgICAgIGNvbnN0IGZpbGVuYW1lID0gYG9sbGFtYS1jaGF0LSR7c2FmZU5hbWV9LSR7dHN9Lm1kYDtcbiAgICAgIGxldCBmUGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmNoYXRFeHBvcnRGb2xkZXJQYXRoPy50cmltKCk7XG4gICAgICBsZXQgZkZvbGRlcjogVEZvbGRlciB8IG51bGwgPSBudWxsO1xuICAgICAgaWYgKGZQYXRoKSB7XG4gICAgICAgIGZQYXRoID0gbm9ybWFsaXplUGF0aChmUGF0aCk7XG4gICAgICAgIGNvbnN0IGFmID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZQYXRoKTtcbiAgICAgICAgaWYgKCFhZikge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIoZlBhdGgpO1xuICAgICAgICAgICAgY29uc3QgbmV3QWYgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZlBhdGgpO1xuICAgICAgICAgICAgaWYgKG5ld0FmIGluc3RhbmNlb2YgVEZvbGRlcikge1xuICAgICAgICAgICAgICBmRm9sZGVyID0gbmV3QWY7XG4gICAgICAgICAgICAgIG5ldyBOb3RpY2UoYENyZWF0ZWQgZXhwb3J0IGZvbGRlcjogJHtmUGF0aH1gKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkZhaWxlZCB0byBnZXQgY3JlYXRlZCBmb2xkZXIuXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiRm9sZGVyIGNyZWF0aW9uIGVycm9yIGR1cmluZyBleHBvcnQ6XCIsIGVycik7XG4gICAgICAgICAgICBuZXcgTm90aWNlKGBFeHBvcnQgZm9sZGVyIGVycm9yLiBTYXZpbmcgdG8gdmF1bHQgcm9vdC5gKTtcbiAgICAgICAgICAgIGZGb2xkZXIgPSB0aGlzLmFwcC52YXVsdC5nZXRSb290KCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGFmIGluc3RhbmNlb2YgVEZvbGRlcikge1xuICAgICAgICAgIGZGb2xkZXIgPSBhZjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBuZXcgTm90aWNlKGBFeHBvcnQgcGF0aCBpcyBub3QgYSBmb2xkZXIuIFNhdmluZyB0byB2YXVsdCByb290LmApO1xuICAgICAgICAgIGZGb2xkZXIgPSB0aGlzLmFwcC52YXVsdC5nZXRSb290KCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZGb2xkZXIgPSB0aGlzLmFwcC52YXVsdC5nZXRSb290KCk7XG4gICAgICB9XG4gICAgICBpZiAoIWZGb2xkZXIpIHtcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiVGFyZ2V0IGZvbGRlciBmb3IgZXhwb3J0IGNvdWxkIG5vdCBiZSBkZXRlcm1pbmVkLlwiKTtcbiAgICAgICAgbmV3IE5vdGljZShcIkV4cG9ydCBmb2xkZXIgZXJyb3IuXCIpO1xuICAgICAgICBub3RpY2UuaGlkZSgpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCBmaWxlUGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7ZkZvbGRlci5wYXRofS8ke2ZpbGVuYW1lfWApO1xuICAgICAgY29uc3QgZmlsZSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShmaWxlUGF0aCwgbWQpO1xuICAgICAgbmV3IE5vdGljZShgQ2hhdCBleHBvcnRlZCB0byAke2ZpbGUucGF0aH1gKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYENoYXQgZXhwb3J0IGVycm9yOmAsIGUpO1xuICAgICAgbmV3IE5vdGljZShcIkNoYXQgZXhwb3J0IGZhaWxlZC5cIik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgfVxuICB9XG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlQ29udGV4dE1lbnVDbGVhcihjaGF0SWQ6IHN0cmluZywgY2hhdE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIG5ldyBDb25maXJtTW9kYWwodGhpcy5hcHAsIFwiQ2xlYXIgTWVzc2FnZXNcIiwgYENsZWFyIGFsbCBtZXNzYWdlcyBpbiBcIiR7Y2hhdE5hbWV9XCI/YCwgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgbm90aWNlID0gbmV3IE5vdGljZShcIkNsZWFyaW5nIG1lc3NhZ2VzLi4uXCIsIDApO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmNsZWFyQ2hhdE1lc3NhZ2VzQnlJZChjaGF0SWQpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYENsZWFyIG1lc3NhZ2VzIGVycm9yOmAsIGUpO1xuICAgICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIGNsZWFyIG1lc3NhZ2VzLlwiKTtcbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgICB9XG4gICAgfSkub3BlbigpO1xuICB9XG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlQ29udGV4dE1lbnVEZWxldGUoY2hhdElkOiBzdHJpbmcsIGNoYXROYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBuZXcgQ29uZmlybU1vZGFsKHRoaXMuYXBwLCBcIkRlbGV0ZSBDaGF0XCIsIGBEZWxldGUgY2hhdCBcIiR7Y2hhdE5hbWV9XCI/IFRoaXMgY2Fubm90IGJlIHVuZG9uZS5gLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBub3RpY2UgPSBuZXcgTm90aWNlKFwiRGVsZXRpbmcgY2hhdC4uLlwiLCAwKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5kZWxldGVDaGF0KGNoYXRJZCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihgRGVsZXRlIGNoYXQgZXJyb3I6YCwgZSk7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJGYWlsZWQgdG8gZGVsZXRlIGNoYXQuXCIpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgbm90aWNlLmhpZGUoKTtcbiAgICAgIH1cbiAgICB9KS5vcGVuKCk7XG4gIH1cbiAgcHJpdmF0ZSBmb3JtYXRDaGF0VG9NYXJrZG93bihtZXNzYWdlc1RvRm9ybWF0OiBNZXNzYWdlW10sIG1ldGFkYXRhOiBDaGF0TWV0YWRhdGEpOiBzdHJpbmcge1xuICAgIGxldCBsb2NhbExhc3REYXRlOiBEYXRlIHwgbnVsbCA9IG51bGw7XG4gICAgY29uc3QgZXhwb3J0VGltZXN0YW1wID0gbmV3IERhdGUoKTtcbiAgICBsZXQgbWFya2Rvd24gPSBgIyBBSSBGb3JnZSBDaGF0OiAke21ldGFkYXRhLm5hbWV9XFxuXFxuYDtcbiAgICBtYXJrZG93biArPSBgKiAqKkNoYXQgSUQ6KiogJHttZXRhZGF0YS5pZH1cXG5gO1xuICAgIG1hcmtkb3duICs9IGAqICoqTW9kZWw6KiogJHttZXRhZGF0YS5tb2RlbE5hbWUgfHwgXCJEZWZhdWx0XCJ9XFxuYDtcbiAgICBtYXJrZG93biArPSBgKiAqKlJvbGUgUGF0aDoqKiAke21ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGggfHwgXCJOb25lXCJ9XFxuYDtcbiAgICBtYXJrZG93biArPSBgKiAqKlRlbXBlcmF0dXJlOioqICR7bWV0YWRhdGEudGVtcGVyYXR1cmUgPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGVyYXR1cmV9XFxuYDtcbiAgICBtYXJrZG93biArPSBgKiAqKkNyZWF0ZWQ6KiogJHtuZXcgRGF0ZShtZXRhZGF0YS5jcmVhdGVkQXQpLnRvTG9jYWxlU3RyaW5nKCl9XFxuYDtcbiAgICBtYXJrZG93biArPSBgKiAqKkxhc3QgTW9kaWZpZWQ6KiogJHtuZXcgRGF0ZShtZXRhZGF0YS5sYXN0TW9kaWZpZWQpLnRvTG9jYWxlU3RyaW5nKCl9XFxuYDtcbiAgICBtYXJrZG93biArPSBgKiAqKkV4cG9ydGVkOioqICR7ZXhwb3J0VGltZXN0YW1wLnRvTG9jYWxlU3RyaW5nKCl9XFxuXFxuYDtcbiAgICBtYXJrZG93biArPSBgKioqXFxuXFxuYDtcbiAgICBtZXNzYWdlc1RvRm9ybWF0LmZvckVhY2gobWVzc2FnZSA9PiB7XG4gICAgICBpZiAoIW1lc3NhZ2UgfHwgIW1lc3NhZ2UuY29udGVudD8udHJpbSgpIHx8ICFtZXNzYWdlLnRpbWVzdGFtcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsZXQgbWVzc2FnZVRpbWVzdGFtcDogRGF0ZTtcbiAgICAgIGlmICh0eXBlb2YgbWVzc2FnZS50aW1lc3RhbXAgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgbWVzc2FnZVRpbWVzdGFtcCA9IG5ldyBEYXRlKG1lc3NhZ2UudGltZXN0YW1wKTtcbiAgICAgIH0gZWxzZSBpZiAobWVzc2FnZS50aW1lc3RhbXAgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIG1lc3NhZ2VUaW1lc3RhbXAgPSBtZXNzYWdlLnRpbWVzdGFtcDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChpc05hTihtZXNzYWdlVGltZXN0YW1wLmdldFRpbWUoKSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKGxvY2FsTGFzdERhdGUgPT09IG51bGwgfHwgIXRoaXMuaXNTYW1lRGF5KGxvY2FsTGFzdERhdGUsIG1lc3NhZ2VUaW1lc3RhbXApKSB7XG4gICAgICAgIGlmIChsb2NhbExhc3REYXRlICE9PSBudWxsKSBtYXJrZG93biArPSBgKioqXFxuXFxuYDtcbiAgICAgICAgbWFya2Rvd24gKz0gYCoqJHt0aGlzLmZvcm1hdERhdGVTZXBhcmF0b3IobWVzc2FnZVRpbWVzdGFtcCl9KipcXG4qKipcXG5cXG5gO1xuICAgICAgICBsb2NhbExhc3REYXRlID0gbWVzc2FnZVRpbWVzdGFtcDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHRpbWUgPSB0aGlzLmZvcm1hdFRpbWUobWVzc2FnZVRpbWVzdGFtcCk7XG4gICAgICBsZXQgcHJlZml4ID0gXCJcIjtcbiAgICAgIGxldCBjb250ZW50UHJlZml4ID0gXCJcIjtcbiAgICAgIGxldCBjb250ZW50ID0gbWVzc2FnZS5jb250ZW50LnRyaW0oKTtcbiAgICAgIGlmIChtZXNzYWdlLnJvbGUgPT09IFwiYXNzaXN0YW50XCIpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb250ZW50ID0gUmVuZGVyZXJVdGlscy5kZWNvZGVIdG1sRW50aXRpZXMoY29udGVudCk7XG4gICAgICAgICAgaWYgKFJlbmRlcmVyVXRpbHMuZGV0ZWN0VGhpbmtpbmdUYWdzKGNvbnRlbnQpLmhhc1RoaW5raW5nVGFncykge1xuICAgICAgICAgICAgY29udGVudCA9IGNvbnRlbnQucmVwbGFjZSgvPHRoaW5raW5nPltcXHNcXFNdKj88XFwvdGhpbmtpbmc+L2csIFwiXCIpLnRyaW0oKTtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UoLzx0aGluaz5bXFxzXFxTXSo/PFxcL3RoaW5rPi9nLCBcIlwiKS50cmltKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7fVxuICAgICAgICBpZiAoIWNvbnRlbnQpIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHN3aXRjaCAobWVzc2FnZS5yb2xlKSB7XG4gICAgICAgIGNhc2UgXCJ1c2VyXCI6XG4gICAgICAgICAgcHJlZml4ID0gYCoqVXNlciAoJHt0aW1lfSk6KipcXG5gO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYXNzaXN0YW50XCI6XG4gICAgICAgICAgcHJlZml4ID0gYCoqQXNzaXN0YW50ICgke3RpbWV9KToqKlxcbmA7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJzeXN0ZW1cIjpcbiAgICAgICAgICBwcmVmaXggPSBgPiBfW1N5c3RlbSAoJHt0aW1lfSldXyBcXG4+IGA7XG4gICAgICAgICAgY29udGVudFByZWZpeCA9IFwiPiBcIjtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImVycm9yXCI6XG4gICAgICAgICAgcHJlZml4ID0gYD4gWyFFUlJPUl0gRXJyb3IgKCR7dGltZX0pOlxcbj4gYDtcbiAgICAgICAgICBjb250ZW50UHJlZml4ID0gXCI+IFwiO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHByZWZpeCA9IGAqKiR7bWVzc2FnZS5yb2xlfSAoJHt0aW1lfSk6KipcXG5gO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgbWFya2Rvd24gKz0gcHJlZml4O1xuICAgICAgaWYgKGNvbnRlbnRQcmVmaXgpIHtcbiAgICAgICAgbWFya2Rvd24gKz1cbiAgICAgICAgICBjb250ZW50XG4gICAgICAgICAgICAuc3BsaXQoXCJcXG5cIilcbiAgICAgICAgICAgIC5tYXAoKGxpbmU6IHN0cmluZykgPT4gKGxpbmUudHJpbSgpID8gYCR7Y29udGVudFByZWZpeH0ke2xpbmV9YCA6IGNvbnRlbnRQcmVmaXgudHJpbSgpKSlcbiAgICAgICAgICAgIC5qb2luKGBcXG5gKSArIFwiXFxuXFxuXCI7XG4gICAgICB9IGVsc2UgaWYgKGNvbnRlbnQuaW5jbHVkZXMoXCJgYGBcIikpIHtcbiAgICAgICAgY29udGVudCA9IGNvbnRlbnRcbiAgICAgICAgICAucmVwbGFjZSgvKFxccj9cXG4pKmBgYC9nLCBcIlxcblxcbmBgYFwiKVxuICAgICAgICAgIC5yZXBsYWNlKC9gYGAoXFxyP1xcbikqL2csIFwiYGBgXFxuXFxuXCIpXG4gICAgICAgICAgLnRyaW0oKTtcbiAgICAgICAgbWFya2Rvd24gKz0gY29udGVudCArIFwiXFxuXFxuXCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtYXJrZG93biArPVxuICAgICAgICAgIGNvbnRlbnRcbiAgICAgICAgICAgIC5zcGxpdChcIlxcblwiKVxuICAgICAgICAgICAgLm1hcCgobGluZTogc3RyaW5nKSA9PiAobGluZS50cmltKCkgPyBsaW5lIDogXCJcIikpXG4gICAgICAgICAgICAuam9pbihcIlxcblwiKSArIFwiXFxuXFxuXCI7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIG1hcmtkb3duLnRyaW0oKTtcbiAgfVxuICBwcml2YXRlIGZvcm1hdFRpbWUoZGF0ZTogRGF0ZSk6IHN0cmluZyB7XG4gICAgaWYgKCEoZGF0ZSBpbnN0YW5jZW9mIERhdGUpIHx8IGlzTmFOKGRhdGUuZ2V0VGltZSgpKSkgcmV0dXJuIFwiPz86Pz9cIjtcbiAgICByZXR1cm4gZGF0ZS50b0xvY2FsZVRpbWVTdHJpbmcodW5kZWZpbmVkLCB7IGhvdXI6IFwibnVtZXJpY1wiLCBtaW51dGU6IFwiMi1kaWdpdFwiLCBob3VyMTI6IGZhbHNlIH0pO1xuICB9XG4gIHByaXZhdGUgZm9ybWF0RGF0ZVNlcGFyYXRvcihkYXRlOiBEYXRlKTogc3RyaW5nIHtcbiAgICBpZiAoIShkYXRlIGluc3RhbmNlb2YgRGF0ZSkgfHwgaXNOYU4oZGF0ZS5nZXRUaW1lKCkpKSByZXR1cm4gXCJVbmtub3duIERhdGVcIjtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IHllc3RlcmRheSA9IG5ldyBEYXRlKG5vdyk7XG4gICAgeWVzdGVyZGF5LnNldERhdGUobm93LmdldERhdGUoKSAtIDEpO1xuICAgIGlmICh0aGlzLmlzU2FtZURheShkYXRlLCBub3cpKSByZXR1cm4gXCJUb2RheVwiO1xuICAgIGlmICh0aGlzLmlzU2FtZURheShkYXRlLCB5ZXN0ZXJkYXkpKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjtcbiAgICBjb25zdCBzdGFydE9mVG9kYXkgPSBuZXcgRGF0ZShub3cuZ2V0RnVsbFllYXIoKSwgbm93LmdldE1vbnRoKCksIG5vdy5nZXREYXRlKCkpO1xuICAgIGNvbnN0IHN0YXJ0T2ZHaXZlbkRhdGUgPSBuZXcgRGF0ZShkYXRlLmdldEZ1bGxZZWFyKCksIGRhdGUuZ2V0TW9udGgoKSwgZGF0ZS5nZXREYXRlKCkpO1xuICAgIGNvbnN0IGRpZmZEYXlzID0gTWF0aC5mbG9vcigoc3RhcnRPZlRvZGF5LmdldFRpbWUoKSAtIHN0YXJ0T2ZHaXZlbkRhdGUuZ2V0VGltZSgpKSAvICgxMDAwICogNjAgKiA2MCAqIDI0KSk7XG4gICAgaWYgKGRpZmZEYXlzID4gMSAmJiBkaWZmRGF5cyA8IDcpIHtcbiAgICAgIHJldHVybiBkYXRlLnRvTG9jYWxlRGF0ZVN0cmluZyh1bmRlZmluZWQsIHsgd2Vla2RheTogXCJsb25nXCIgfSk7XG4gICAgfVxuICAgIHJldHVybiBkYXRlLnRvTG9jYWxlRGF0ZVN0cmluZyh1bmRlZmluZWQsIHsgeWVhcjogXCJudW1lcmljXCIsIG1vbnRoOiBcImxvbmdcIiwgZGF5OiBcIm51bWVyaWNcIiB9KTtcbiAgfVxuICBwcml2YXRlIGZvcm1hdFJlbGF0aXZlRGF0ZShkYXRlOiBEYXRlKTogc3RyaW5nIHtcbiAgICBpZiAoIShkYXRlIGluc3RhbmNlb2YgRGF0ZSkgfHwgaXNOYU4oZGF0ZS5nZXRUaW1lKCkpKSB7XG4gICAgICByZXR1cm4gXCJJbnZhbGlkIGRhdGVcIjtcbiAgICB9XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCBkaWZmU2Vjb25kcyA9IE1hdGgucm91bmQoKG5vdy5nZXRUaW1lKCkgLSBkYXRlLmdldFRpbWUoKSkgLyAxMDAwKTtcbiAgICBjb25zdCBkaWZmTWludXRlcyA9IE1hdGguZmxvb3IoZGlmZlNlY29uZHMgLyA2MCk7XG4gICAgY29uc3QgZGlmZkhvdXJzID0gTWF0aC5mbG9vcihkaWZmTWludXRlcyAvIDYwKTtcbiAgICBjb25zdCBkaWZmRGF5cyA9IE1hdGguZmxvb3IoZGlmZkhvdXJzIC8gMjQpO1xuICAgIGlmIChkaWZmU2Vjb25kcyA8IDUpIHJldHVybiBcIkp1c3Qgbm93XCI7XG4gICAgaWYgKGRpZmZTZWNvbmRzIDwgNjApIHJldHVybiBgJHtkaWZmU2Vjb25kc31zIGFnb2A7XG4gICAgaWYgKGRpZmZNaW51dGVzIDwgNjApIHJldHVybiBgJHtkaWZmTWludXRlc31tIGFnb2A7XG4gICAgaWYgKGRpZmZIb3VycyA8IDIpIHJldHVybiBgMWggYWdvYDtcbiAgICBpZiAoZGlmZkhvdXJzIDwgMjQpIHJldHVybiBgJHtkaWZmSG91cnN9aCBhZ29gO1xuICAgIGlmIChkaWZmRGF5cyA9PT0gMSkgcmV0dXJuIFwiWWVzdGVyZGF5XCI7XG4gICAgaWYgKGRpZmZEYXlzIDwgNykgcmV0dXJuIGAke2RpZmZEYXlzfWQgYWdvYDtcbiAgICByZXR1cm4gZGF0ZS50b0xvY2FsZURhdGVTdHJpbmcodW5kZWZpbmVkLCB7XG4gICAgICBtb250aDogXCJzaG9ydFwiLFxuICAgICAgZGF5OiBcIm51bWVyaWNcIixcbiAgICAgIHllYXI6IGRhdGUuZ2V0RnVsbFllYXIoKSAhPT0gbm93LmdldEZ1bGxZZWFyKCkgPyBcIm51bWVyaWNcIiA6IHVuZGVmaW5lZCxcbiAgICB9KTtcbiAgfVxuICBwcml2YXRlIGlzU2FtZURheShkYXRlMTogRGF0ZSwgZGF0ZTI6IERhdGUpOiBib29sZWFuIHtcbiAgICBpZiAoIShkYXRlMSBpbnN0YW5jZW9mIERhdGUpIHx8ICEoZGF0ZTIgaW5zdGFuY2VvZiBEYXRlKSB8fCBpc05hTihkYXRlMS5nZXRUaW1lKCkpIHx8IGlzTmFOKGRhdGUyLmdldFRpbWUoKSkpXG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIChcbiAgICAgIGRhdGUxLmdldEZ1bGxZZWFyKCkgPT09IGRhdGUyLmdldEZ1bGxZZWFyKCkgJiZcbiAgICAgIGRhdGUxLmdldE1vbnRoKCkgPT09IGRhdGUyLmdldE1vbnRoKCkgJiZcbiAgICAgIGRhdGUxLmdldERhdGUoKSA9PT0gZGF0ZTIuZ2V0RGF0ZSgpXG4gICAgKTtcbiAgfVxuICBwdWJsaWMgZGVzdHJveSgpOiB2b2lkIHtcbiAgICB0aGlzLmNvbnRhaW5lckVsPy5yZW1vdmUoKTtcbiAgICB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLmNsZWFyKCk7XG4gIH1cblxuICAvLyBzcmMvU2lkZWJhck1hbmFnZXIudHNcblxucHJpdmF0ZSBoYW5kbGVEcmFnU3RhcnQoZXZlbnQ6IERyYWdFdmVudCwgbm9kZTogSGllcmFyY2h5Tm9kZSk6IHZvaWQge1xuICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXG4gICAgICBgW0RyYWdTdGFydCBDQVBUVVJFRCBOT0RFXSBUeXBlOiAke25vZGUudHlwZX0sIE5hbWU6ICR7XG4gICAgICBub2RlLnR5cGUgPT09ICdmb2xkZXInID8gbm9kZS5uYW1lIDogbm9kZS5tZXRhZGF0YS5uYW1lXG4gICAgICB9LCBQYXRoOiAke25vZGUudHlwZSA9PT0gJ2ZvbGRlcicgPyBub2RlLnBhdGggOiBub2RlLmZpbGVQYXRofWBcbiAgKTtcblxuICBpZiAoIWV2ZW50LmRhdGFUcmFuc2Zlcikge1xuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oXCJbRHJhZ1N0YXJ0XSBObyBkYXRhVHJhbnNmZXIgb2JqZWN0IGluIGV2ZW50LlwiKTtcbiAgICAgIHJldHVybjtcbiAgfVxuXG4gIGxldCBpZDogc3RyaW5nO1xuICBsZXQgcGF0aDogc3RyaW5nO1xuICBsZXQgbmFtZTogc3RyaW5nO1xuXG4gIGlmIChub2RlLnR5cGUgPT09ICdjaGF0Jykge1xuICAgICAgaWQgPSBub2RlLm1ldGFkYXRhLmlkO1xuICAgICAgcGF0aCA9IG5vZGUuZmlsZVBhdGg7XG4gICAgICBuYW1lID0gbm9kZS5tZXRhZGF0YS5uYW1lO1xuICB9IGVsc2UgeyAvLyBub2RlLnR5cGUgPT09ICdmb2xkZXInXG4gICAgICBpZCA9IG5vZGUucGF0aDtcbiAgICAgIHBhdGggPSBub2RlLnBhdGg7XG4gICAgICBuYW1lID0gbm9kZS5uYW1lO1xuICB9XG5cbiAgdGhpcy5kcmFnZ2VkSXRlbURhdGEgPSB7IHR5cGU6IG5vZGUudHlwZSwgaWQ6IGlkLCBwYXRoOiBwYXRoLCBuYW1lOiBuYW1lIH07XG5cbiAgZXZlbnQuZGF0YVRyYW5zZmVyLnNldERhdGEoJ3RleHQvcGxhaW4nLCBKU09OLnN0cmluZ2lmeSh0aGlzLmRyYWdnZWRJdGVtRGF0YSkpO1xuICBldmVudC5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdtb3ZlJztcblxuICBpZiAoZXZlbnQudGFyZ2V0IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHtcbiAgICBldmVudC50YXJnZXQuYWRkQ2xhc3MoJ2lzLWRyYWdnaW5nJyk7XG4gIH1cbiAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbRHJhZ1N0YXJ0IFNFVCBEQVRBXSBkcmFnZ2VkSXRlbURhdGEgbm93IHNldCB0bzogJHtKU09OLnN0cmluZ2lmeSh0aGlzLmRyYWdnZWRJdGVtRGF0YSl9YCk7XG5cbiAgLy8gLS0tINCU0J7QlNCQ0J3Qnjog0KDQvtCx0LjQvNC+IHJvb3REcm9wWm9uZSDQstC40LTQuNC80L7RjiAtLS1cbiAgaWYgKHRoaXMuY29udGFpbmVyRWwpIHsgLy8g0J/QtdGA0LXQutC+0L3Rg9GU0LzQvtGB0YwsINGJ0L4g0LPQvtC70L7QstC90LjQuSDQutC+0L3RgtC10LnQvdC10YAg0ZbRgdC90YPRlFxuICAgICAgdGhpcy5jb250YWluZXJFbC5jbGFzc0xpc3QuYWRkKCdzaWRlYmFyLWRyYWctYWN0aXZlJyk7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbRHJhZ1N0YXJ0XSBBZGRlZCAnc2lkZWJhci1kcmFnLWFjdGl2ZScgdG8gbWFpbiBjb250YWluZXIuXCIpO1xuICB9XG4gIC8vIC0tLSDQmtCG0J3QldCm0Kwg0JTQntCU0JDQndCe0JPQniAtLS1cblxuICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFwiW0RyYWdTdGFydF0gUHJvcGFnYXRpb24gc3RvcHBlZCBmb3IgdGhpcyBldmVudC5cIik7XG59XG5cblxuICAvLyBzcmMvU2lkZWJhck1hbmFnZXIudHNcblxucHJpdmF0ZSBoYW5kbGVEcmFnRW5kKGV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcbiAgLy8gLS0tINCU0J7QlNCQ0J3Qnjog0KXQvtCy0LDRlNC80L4gcm9vdERyb3Bab25lIC0tLVxuICBpZiAodGhpcy5jb250YWluZXJFbCkgeyAvLyDQn9C10YDQtdC60L7QvdGD0ZTQvNC+0YHRjCwg0YnQviDQs9C+0LvQvtCy0L3QuNC5INC60L7QvdGC0LXQudC90LXRgCDRltGB0L3Rg9GUXG4gICAgICB0aGlzLmNvbnRhaW5lckVsLmNsYXNzTGlzdC5yZW1vdmUoJ3NpZGViYXItZHJhZy1hY3RpdmUnKTtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIltEcmFnRW5kXSBSZW1vdmVkICdzaWRlYmFyLWRyYWctYWN0aXZlJyBmcm9tIG1haW4gY29udGFpbmVyLlwiKTtcbiAgfVxuICAvLyDQotCw0LrQvtC2INC/0YDQuNCx0LjRgNCw0ZTQvNC+INC/0ZbQtNGB0LLRltGH0YPQstCw0L3QvdGPINC3INGB0LDQvNC+0Zcg0LfQvtC90LgsINGP0LrRidC+INCy0L7QvdC+INCx0YPQu9C+XG4gIGlmICh0aGlzLnJvb3REcm9wWm9uZUVsKSB7XG4gICAgICB0aGlzLnJvb3REcm9wWm9uZUVsLnJlbW92ZUNsYXNzKCdkcmFnLW92ZXItcm9vdC10YXJnZXQnKTtcbiAgfVxuICAvLyAtLS0g0JrQhtCd0JXQptCsINCU0J7QlNCQ0J3QntCT0J4gLS0tXG5cblxuICAvLyDQntGH0LjRidCw0ZTQvNC+INGB0YLQuNC70ZYg0Lcg0LXQu9C10LzQtdC90YLQsCwg0Y/QutC40Lkg0L/QtdGA0LXRgtGP0LPRg9Cy0LDQu9C4XG4gIGlmIChldmVudC50YXJnZXQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgIGV2ZW50LnRhcmdldC5yZW1vdmVDbGFzcygnaXMtZHJhZ2dpbmcnKTtcbiAgICAvLyBldmVudC50YXJnZXQuc3R5bGUub3BhY2l0eSA9ICcnOyAvLyDQr9C60YnQviDQstC4INC30LzRltC90Y7QstCw0LvQuCBvcGFjaXR5INC90LDQv9GA0Y/QvNGDXG4gIH1cbiAgLy8g0J7Rh9C40YnQsNGU0LzQviDQstGW0LfRg9Cw0LvRjNC90LUg0L/RltC00YHQstGW0YfRg9Cy0LDQvdC90Y8g0Lcg0YPRgdGW0YUg0LzQvtC20LvQuNCy0LjRhSDRhtGW0LvQtdC5ICjQv9Cw0L/QvtC6KVxuICB0aGlzLmNvbnRhaW5lckVsPy5xdWVyeVNlbGVjdG9yQWxsKCcuZHJhZy1vdmVyLXRhcmdldCcpLmZvckVhY2goZWwgPT4gZWwucmVtb3ZlQ2xhc3MoJ2RyYWctb3Zlci10YXJnZXQnKSk7XG4gIFxuICB0aGlzLmRyYWdnZWRJdGVtRGF0YSA9IG51bGw7IC8vINCh0LrQuNC00LDRlNC80L4g0LfQsdC10YDQtdC20LXQvdGWINC00LDQvdGWINC/0YDQviDQv9C10YDQtdGC0Y/Qs9GD0LLQsNC90LjQuSDQtdC70LXQvNC10L3RglxuICB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoJ0RyYWcgRW5kOiBDbGVhbmVkIHVwIGRyYWdnZWRJdGVtRGF0YSBhbmQgc3R5bGVzLicpO1xufVxuXG4gIHByaXZhdGUgaGFuZGxlRHJhZ092ZXIoZXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgaWYgKGV2ZW50LmRhdGFUcmFuc2Zlcikge1xuICAgICAgZXZlbnQuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnbW92ZSc7XG4gICAgfVxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpOyAvLyDQlNCj0JbQlSDQktCQ0JbQm9CY0JLQnjog0LfRg9C/0LjQvdGP0ZTQvNC+INGB0L/Qu9C40LLQsNC90L3Rj1xuICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShcIltEcmFnT3ZlciBGb2xkZXJJdGVtXSBFdmVudCBmaXJlZCBhbmQgcHJvcGFnYXRpb24gc3RvcHBlZC5cIik7XG59XG5cbiAgcHJpdmF0ZSBoYW5kbGVEcmFnRW50ZXIoZXZlbnQ6IERyYWdFdmVudCwgdGFyZ2V0Tm9kZTogRm9sZGVyTm9kZSk6IHZvaWQge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vINCS0LDQttC70LjQstC+INC00LvRjyDQtNC10Y/QutC40YUg0LHRgNCw0YPQt9C10YDRltCyXG4gICAgY29uc3QgdGFyZ2V0RWxlbWVudCA9IGV2ZW50LmN1cnJlbnRUYXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgaWYgKCF0YXJnZXRFbGVtZW50IHx8ICF0aGlzLmRyYWdnZWRJdGVtRGF0YSkgcmV0dXJuO1xuXG4gICAgLy8g0JHQsNC30L7QstCwINC/0LXRgNC10LLRltGA0LrQsDog0YfQuCDQvNC+0LbQvdCwINGB0LrQuNC00LDRgtC4INGB0Y7QtNC4P1xuICAgIGxldCBjYW5Ecm9wID0gZmFsc2U7XG4gICAgaWYgKHRoaXMuZHJhZ2dlZEl0ZW1EYXRhLnR5cGUgPT09ICdjaGF0Jykge1xuICAgICAgICAvLyDQp9Cw0YLQuCDQvNC+0LbQvdCwINGB0LrQuNC00LDRgtC4INCyINCx0YPQtNGMLdGP0LrRgyDQv9Cw0L/QutGDXG4gICAgICAgIGNhbkRyb3AgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kcmFnZ2VkSXRlbURhdGEudHlwZSA9PT0gJ2ZvbGRlcicpIHtcbiAgICAgICAgLy8g0J/QsNC/0LrRgyDQvdC1INC80L7QttC90LAg0YHQutC40LTQsNGC0Lgg0LIg0YHQtdCx0LUg0LDQsdC+INGDINGB0LLQvtGX0YUg0L3QsNGJ0LDQtNC60ZbQslxuICAgICAgICBjb25zdCBkcmFnZ2VkUGF0aCA9IHRoaXMuZHJhZ2dlZEl0ZW1EYXRhLnBhdGg7XG4gICAgICAgIGNvbnN0IHRhcmdldFBhdGggPSB0YXJnZXROb2RlLnBhdGg7XG4gICAgICAgIGlmIChkcmFnZ2VkUGF0aCAhPT0gdGFyZ2V0UGF0aCAmJiAhdGFyZ2V0UGF0aC5zdGFydHNXaXRoKGRyYWdnZWRQYXRoICsgJy8nKSkge1xuICAgICAgICAgICAgY2FuRHJvcCA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyDQlNC+0LTQsNGU0LzQviDQutC70LDRgSDQtNC70Y8g0LLRltC30YPQsNC70YzQvdC+0LPQviDRhNGW0LTQsdC10LrRgywg0Y/QutGJ0L4g0YHQutC40LTQsNC90L3RjyDQvNC+0LbQu9C40LLQtVxuICAgIGlmIChjYW5Ecm9wKSB7XG4gICAgICAgIHRhcmdldEVsZW1lbnQuYWRkQ2xhc3MoJ2RyYWctb3Zlci10YXJnZXQnKTtcbiAgICAgICAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLnRyYWNlKGBEcmFnIEVudGVyOiBUYXJnZXQ9JHt0YXJnZXROb2RlLnBhdGh9LCBDYW4gRHJvcD0ke2NhbkRyb3B9YCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVEcmFnTGVhdmUoZXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuICAgIC8vINCf0YDQuNCx0LjRgNCw0ZTQvNC+INC60LvQsNGBINC/0ZbQtNGB0LLRltGH0YPQstCw0L3QvdGPXG4gICAgLy8g0J/QvtGC0YDRltCx0L3QviDQsdGD0YLQuCDQvtCx0LXRgNC10LbQvdC40LwsINGJ0L7QsSDQvdC1INC/0YDQuNCx0YDQsNGC0Lgg0LnQvtCz0L4g0L/RgNC4INCy0YXQvtC00ZYg0LIg0LTQvtGH0ZbRgNC90ZbQuSDQtdC70LXQvNC10L3RglxuICAgIC8vINCf0YDQvtGB0YLQuNC5INCy0LDRgNGW0LDQvdGCIC0g0L/RgNC+0YHRgtC+INC/0YDQuNCx0YDQsNGC0LhcbiAgICBjb25zdCB0YXJnZXRFbGVtZW50ID0gZXZlbnQuY3VycmVudFRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICBpZiAodGFyZ2V0RWxlbWVudCkge1xuICAgICAgICB0YXJnZXRFbGVtZW50LnJlbW92ZUNsYXNzKCdkcmFnLW92ZXItdGFyZ2V0Jyk7XG4gICAgICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShgRHJhZyBMZWF2ZTogVGFyZ2V0PSR7dGFyZ2V0RWxlbWVudC5kYXRhc2V0LnBhdGh9YCk7XG4gICAgfVxuICB9XG5cbiAgXG5cbiAgcHJpdmF0ZSBoYW5kbGVEcmFnT3ZlclJvb3QoZXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgaWYgKGV2ZW50LmRhdGFUcmFuc2Zlcikge1xuICAgICAgICBldmVudC5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdtb3ZlJztcbiAgICB9XG5cbiAgICAvLyDQntGB0LrRltC70YzQutC4INC/0LDQv9C60Lgg0LfRg9C/0LjQvdGP0Y7RgtGMINGB0L/Qu9C40LLQsNC90L3Rjywg0YbQtdC5IGV2ZW50LnRhcmdldCDQsdGD0LTQtSDRgdCw0LzQuNC8IGNoYXRQYW5lbExpc3RDb250YWluZXJFbFxuICAgIC8vINCw0LHQviDQtNC+0YfRltGA0L3RltC8INC10LvQtdC80LXQvdGC0L7QvCwg0Y/QutC40Lkg0J3QlSDRlCDQv9Cw0L/QutC+0Y4gKNC90LDQv9GA0LjQutC70LDQtCwg0YfQsNGC0L7QvCwg0Y/QutC40Lkg0L3QtSDRlCBkcm9wIHRhcmdldCkuXG4gICAgLy8g0K/QutGJ0L4gZXZlbnQudGFyZ2V0IC0g0YbQtSDRh9Cw0YIsINGC0L4g0LzQuCDQstGB0LUg0L7QtNC90L4g0YXQvtGH0LXQvNC+LCDRidC+0LEg0LrQvtGA0ZbQvdGMINCx0YPQsiDRhtGW0LvQu9GOLlxuXG4gICAgaWYgKCF0aGlzLmRyYWdnZWRJdGVtRGF0YSkge1xuICAgICAgICAoZXZlbnQuY3VycmVudFRhcmdldCBhcyBIVE1MRWxlbWVudCkucmVtb3ZlQ2xhc3MoJ2RyYWctb3Zlci1yb290LXRhcmdldCcpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8g0JLQsNC70ZbQtNCw0YbRltGPOiDRh9C4INC90LUg0L/QtdGA0LXRgtGP0LPRg9GU0LzQviDQtdC70LXQvNC10L3Rgiwg0YnQviDQstC20LUg0LIg0LrQvtGA0LXQvdGWLCDRgyDQutC+0YDRltC90Yw/XG4gICAgY29uc3Qgcm9vdEZvbGRlclBhdGggPSBub3JtYWxpemVQYXRoKHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmNoYXRzRm9sZGVyUGF0aCk7XG4gICAgY29uc3QgZHJhZ2dlZFBhdGggPSB0aGlzLmRyYWdnZWRJdGVtRGF0YS5wYXRoO1xuICAgIGxldCBzb3VyY2VQYXJlbnRQYXRoID0gbm9ybWFsaXplUGF0aChkcmFnZ2VkUGF0aC5zdWJzdHJpbmcoMCwgZHJhZ2dlZFBhdGgubGFzdEluZGV4T2YoJy8nKSkgfHwgJy8nKTtcblxuICAgIC8vINCh0L/QtdGG0ZbQsNC70YzQvdCwINC+0LHRgNC+0LHQutCwINC00LvRjyDQv9Cw0L/QvtC6LCDRidC+INC30L3QsNGF0L7QtNGP0YLRjNGB0Y8g0LHQtdC30L/QvtGB0LXRgNC10LTQvdGM0L4g0LIg0LrQvtGA0LXQvdGWIFwiL1wiXG4gICAgaWYgKHRoaXMuZHJhZ2dlZEl0ZW1EYXRhLnR5cGUgPT09ICdmb2xkZXInICYmIHJvb3RGb2xkZXJQYXRoID09PSAnLycgJiYgIWRyYWdnZWRQYXRoLmluY2x1ZGVzKCcvJykpIHtcbiAgICAgICAgc291cmNlUGFyZW50UGF0aCA9ICcvJzsgLy8g0IfRhdC90ZbQuSDQsdCw0YLRjNC60L4gLSDRhtC1INC60L7RgNGW0L3RjFxuICAgIH1cblxuXG4gICAgaWYgKHNvdXJjZVBhcmVudFBhdGggPT09IHJvb3RGb2xkZXJQYXRoKSB7XG4gICAgICAgIChldmVudC5jdXJyZW50VGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5yZW1vdmVDbGFzcygnZHJhZy1vdmVyLXJvb3QtdGFyZ2V0Jyk7XG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShcIltEcmFnT3ZlclJvb3RdIEl0ZW0gYWxyZWFkeSBhdCByb290LCBubyBoaWdobGlnaHQgZm9yIHJvb3QuXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIChldmVudC5jdXJyZW50VGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5hZGRDbGFzcygnZHJhZy1vdmVyLXJvb3QtdGFyZ2V0Jyk7XG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShcIltEcmFnT3ZlclJvb3RdIE92ZXIgcm9vdCBlbXB0eSBzcGFjZS9ub24tZm9sZGVyIGNoaWxkLCBpdGVtIG5vdCBhdCByb290LiBBZGRlZCByb290IGhpZ2hsaWdodC5cIik7XG4gICAgfVxufVxuXG4vLyDQptC10Lkg0LzQtdGC0L7QtCDQstC40LrQu9C40LrQsNGU0YLRjNGB0Y8sINC60L7Qu9C4INC80LjRiNCwINCS0KXQntCU0JjQotCsINCyINC80LXQttGWIGNoYXRQYW5lbExpc3RDb250YWluZXJFbFxuLy8g0JzQvtC20LUg0LHRg9GC0Lgg0LzQtdC90Ygg0LLQsNC20LvQuNCy0LjQvCwg0Y/QutGJ0L4gaGFuZGxlRHJhZ092ZXJSb290INCy0YHQtSDQutC+0YDQtdC60YLQvdC+INC+0LHRgNC+0LHQu9GP0ZQuXG5wcml2YXRlIGhhbmRsZURyYWdFbnRlclJvb3QoZXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyAvLyDQn9C+0YLRgNGW0LHQvdC+INC00LvRjyDQutC+0L3RgdC40YHRgtC10L3RgtC90L7RgdGC0ZZcbiAgLy8g0JvQvtCz0ZbQutGDINC/0ZbQtNGB0LLRltGH0YPQstCw0L3QvdGPINGC0LXQv9C10YAg0LrRgNCw0YnQtSDQv9C10YDQtdC90LXRgdGC0Lgg0LIgaGFuZGxlRHJhZ092ZXJSb290LFxuICAvLyDQvtGB0LrRltC70YzQutC4IGRyYWdlbnRlciDRgdC/0YDQsNGG0YzQvtCy0YPRlCDQvtC00LjQvSDRgNCw0LcsINCwIGRyYWdvdmVyIC0g0L/QvtGB0YLRltC50L3Qvi5cbiAgLy8g0JzQvtC20L3QsCDQv9GA0L7RgdGC0L4g0LvQvtCz0YPQstCw0YLQuCDRgtGD0YIg0LTQu9GPINCy0ZbQtNGB0YLQtdC20LXQvdC90Y8uXG4gIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShgW0RyYWdFbnRlclJvb3RdIE1vdXNlIGVudGVyZWQgcm9vdCBjb250YWluZXIgYm91bmRzLmApO1xuICAvLyDQodC/0YDQvtCx0YPRlNC80L4g0LLQuNC60LvQuNC60LDRgtC4INC70L7Qs9GW0LrRgyBoYW5kbGVEcmFnT3ZlclJvb3QsINGJ0L7QsSDQstGB0YLQsNC90L7QstC40YLQuCDQv9C+0YfQsNGC0LrQvtCy0LjQuSDRgdGC0LDQvSDQv9GW0LTRgdCy0ZbRh9GD0LLQsNC90L3Rj1xuICB0aGlzLmhhbmRsZURyYWdPdmVyUm9vdChldmVudCk7XG59XG4gIFxucHJpdmF0ZSBoYW5kbGVEcmFnTGVhdmVSb290KGV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcbiAgY29uc3QgbGlzdGVuaW5nRWxlbWVudCA9IGV2ZW50LmN1cnJlbnRUYXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gIC8vIHJlbGF0ZWRUYXJnZXQgLSDRhtC1INC10LvQtdC80LXQvdGCLCDQvdCwINGP0LrQuNC5INC/0LXRgNC10YXQvtC00LjRgtGMINC60YPRgNGB0L7RgC5cbiAgLy8g0K/QutGJ0L4g0LrRg9GA0YHQvtGAINC/0L7QutC40L3Rg9CyINC60L7QvdGC0LXQudC90LXRgCDQv9C+0LLQvdGW0YHRgtGOIChyZWxhdGVkVGFyZ2V0INC90LUg0ZQg0LTQvtGH0ZbRgNC90ZbQvCDQsNCx0L4gbnVsbCksXG4gIC8vINGC0L7QtNGWINC/0YDQuNCx0LjRgNCw0ZTQvNC+INC/0ZbQtNGB0LLRltGH0YPQstCw0L3QvdGPLlxuICBpZiAoIWV2ZW50LnJlbGF0ZWRUYXJnZXQgfHwgIShsaXN0ZW5pbmdFbGVtZW50LmNvbnRhaW5zKGV2ZW50LnJlbGF0ZWRUYXJnZXQgYXMgTm9kZSkpKSB7XG4gICAgICBsaXN0ZW5pbmdFbGVtZW50LnJlbW92ZUNsYXNzKCdkcmFnLW92ZXItcm9vdC10YXJnZXQnKTtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIltEcmFnTGVhdmVSb290XSBNb3VzZSBsZWZ0IHJvb3QgY29udGFpbmVyIGJvdW5kcy4gUmVtb3ZlZCAnZHJhZy1vdmVyLXJvb3QtdGFyZ2V0Jy5cIik7XG4gIH0gZWxzZSB7XG4gICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLnRyYWNlKFwiW0RyYWdMZWF2ZVJvb3RdIE1vdXNlIG1vdmVkIHRvIGEgY2hpbGQgd2l0aGluIHJvb3QuIEhpZ2hsaWdodCBwZXJzaXN0cyBvciBoYW5kbGVkIGJ5IGNoaWxkLlwiKTtcbiAgfVxufVxuXG5wcml2YXRlIGFzeW5jIGhhbmRsZURyb3AoZXZlbnQ6IERyYWdFdmVudCwgdGFyZ2V0Tm9kZTogRm9sZGVyTm9kZSk6IFByb21pc2U8dm9pZD4ge1xuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyAvLyDQl9Cw0LHQvtGA0L7QvdGP0ZTQvNC+INGB0YLQsNC90LTQsNGA0YLQvdGDINC+0LHRgNC+0LHQutGDXG4gIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpOyAvLyDQlNCj0JbQlSDQktCQ0JbQm9CY0JLQnjog0LfRg9C/0LjQvdGP0ZTQvNC+INGB0L/Qu9C40LLQsNC90L3RjyDQv9C+0LTRltGXINC00L4g0LHQsNGC0YzQutGW0LLRgdGM0LrQuNGFINC10LvQtdC80LXQvdGC0ZbQsiAo0L3QsNC/0YDQuNC60LvQsNC0LCBjaGF0UGFuZWwpXG5cbiAgY29uc3QgdGFyZ2V0RWxlbWVudCA9IGV2ZW50LmN1cnJlbnRUYXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gIHRhcmdldEVsZW1lbnQucmVtb3ZlQ2xhc3MoJ2RyYWctb3Zlci10YXJnZXQnKTsgLy8g0J/RgNC40LHQuNGA0LDRlNC80L4g0LLRltC30YPQsNC70YzQvdC1INC/0ZbQtNGB0LLRltGH0YPQstCw0L3QvdGPINGG0ZbQu9GWXG5cbiAgLy8g0J/QtdGA0LXQstGW0YDRj9GU0LzQviwg0YfQuCDRlCDQtNCw0L3RliDQv9GA0L4g0L/QtdGA0LXRgtGP0LPRg9Cy0LDQvdC40Lkg0LXQu9C10LzQtdC90YJcbiAgaWYgKCF0aGlzLmRyYWdnZWRJdGVtRGF0YSB8fCAhZXZlbnQuZGF0YVRyYW5zZmVyKSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihcIltGb2xkZXJEcm9wXSBEcm9wIGV2ZW50IG9jY3VycmVkIHdpdGhvdXQgZHJhZ2dlZEl0ZW1EYXRhIG9yIGRhdGFUcmFuc2Zlci4gQWJvcnRpbmcuXCIpO1xuICAgICAgdGhpcy5kcmFnZ2VkSXRlbURhdGEgPSBudWxsOyAvLyDQntGH0LjRidCw0ZTQvNC+INC/0YDQviDQstGB0Y/QuiDQstC40L/QsNC00L7QulxuICAgICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgZHJhZ2dlZERhdGEgPSB7IC4uLnRoaXMuZHJhZ2dlZEl0ZW1EYXRhIH07IC8vINCa0L7Qv9GW0Y7RlNC80L4g0LTQsNC90ZYsINCx0L4g0L7RgNC40LPRltC90LDQuyDQt9Cw0YDQsNC3INGB0LrQuNC90LXQvNC+XG4gIHRoaXMuZHJhZ2dlZEl0ZW1EYXRhID0gbnVsbDsgLy8g0J7Rh9C40YnQsNGU0LzQviDQtNCw0L3RliDQv9GA0L4g0L/QtdGA0LXRgtGP0LPRg9Cy0LDQvdC40Lkg0LXQu9C10LzQtdC90YJcblxuICBjb25zdCB0YXJnZXRGb2xkZXJQYXRoID0gdGFyZ2V0Tm9kZS5wYXRoOyAvLyDQqNC70Y/RhSDQtNC+INGG0ZbQu9GM0L7QstC+0Zcg0L/QsNC/0LrQuFxuICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtGb2xkZXJEcm9wXSBFdmVudDogRHJhZ2dlZD0ke0pTT04uc3RyaW5naWZ5KGRyYWdnZWREYXRhKX0sIFRhcmdldCBGb2xkZXIgTm9kZT0ke3RhcmdldE5vZGUubmFtZX0gKFBhdGg6ICR7dGFyZ2V0Rm9sZGVyUGF0aH0pYCk7XG5cbiAgLy8gLS0tINCS0JDQm9CG0JTQkNCm0IbQryAtLS1cbiAgLy8gMS4g0JLQuNC30L3QsNGH0LDRlNC80L4g0LHQsNGC0YzQutGW0LLRgdGM0LrRgyDQv9Cw0L/QutGDINC10LvQtdC80LXQvdGC0LAsINGJ0L4g0L/QtdGA0LXRgtGP0LPRg9GU0YLRjNGB0Y9cbiAgY29uc3Qgc291cmNlUGFyZW50UGF0aCA9IG5vcm1hbGl6ZVBhdGgoZHJhZ2dlZERhdGEucGF0aC5zdWJzdHJpbmcoMCwgZHJhZ2dlZERhdGEucGF0aC5sYXN0SW5kZXhPZignLycpKSB8fCAnLycpO1xuXG4gIC8vIDIuINCd0LUg0LzQvtC20L3QsCDRgdC60LjQtNCw0YLQuCDQv9Cw0L/QutGDINGB0LDQvNGDINCyINGB0LXQsdC1XG4gIGlmIChkcmFnZ2VkRGF0YS50eXBlID09PSAnZm9sZGVyJyAmJiBkcmFnZ2VkRGF0YS5wYXRoID09PSB0YXJnZXRGb2xkZXJQYXRoKSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbRm9sZGVyRHJvcF0gU2tpcHBlZDogQ2Fubm90IGRyb3AgZm9sZGVyIG9udG8gaXRzZWxmLlwiKTtcbiAgICAgIHJldHVybjtcbiAgfVxuICAvLyAzLiDQndC1INC80L7QttC90LAg0YHQutC40LTQsNGC0Lgg0YfQsNGCINCyINGC0YMg0YHQsNC80YMg0L/QsNC/0LrRgywg0LTQtSDQstGW0L0g0LLQttC1INGUXG4gIGlmIChkcmFnZ2VkRGF0YS50eXBlID09PSAnY2hhdCcgJiYgc291cmNlUGFyZW50UGF0aCA9PT0gbm9ybWFsaXplUGF0aCh0YXJnZXRGb2xkZXJQYXRoKSkge1xuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFwiW0ZvbGRlckRyb3BdIFNraXBwZWQ6IENoYXQgaXMgYWxyZWFkeSBpbiB0aGUgdGFyZ2V0IGZvbGRlci5cIik7XG4gICAgICByZXR1cm47XG4gIH1cbiAgLy8gNC4g0J3QtSDQvNC+0LbQvdCwINGB0LrQuNC00LDRgtC4INC/0LDQv9C60YMg0LIg0ZfRlyDQstC70LDRgdC90YMg0LTQvtGH0ZbRgNC90Y4g0L/QsNC/0LrRg1xuICBpZiAoZHJhZ2dlZERhdGEudHlwZSA9PT0gJ2ZvbGRlcicgJiYgdGFyZ2V0Rm9sZGVyUGF0aC5zdGFydHNXaXRoKGRyYWdnZWREYXRhLnBhdGggKyAnLycpKSB7XG4gICAgICBuZXcgTm90aWNlKFwiQ2Fubm90IG1vdmUgYSBmb2xkZXIgaW5zaWRlIGl0c2VsZiBvciBpdHMgZGVzY2VuZGFudHMuXCIpO1xuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oXCJbRm9sZGVyRHJvcF0gUHJldmVudGVkOiBDYW5ub3QgbW92ZSBmb2xkZXIgaW50byBpdHMgb3duIGRlc2NlbmRhbnQuXCIpO1xuICAgICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gLS0tINCS0JjQmtCe0J3QkNCd0J3QryDQlNCG0IcgLS0tXG4gIGxldCBzdWNjZXNzID0gZmFsc2U7XG4gIGNvbnN0IG5vdGljZU1lc3NhZ2UgPSBgTW92aW5nICR7ZHJhZ2dlZERhdGEudHlwZX0gXCIke2RyYWdnZWREYXRhLm5hbWV9XCIgdG8gXCIke3RhcmdldE5vZGUubmFtZX1cIi4uLmA7XG4gIGNvbnN0IG5vdGljZSA9IG5ldyBOb3RpY2Uobm90aWNlTWVzc2FnZSwgMCk7IC8vINCf0L7QutCw0LfRg9GU0LzQviDRgdC/0L7QstGW0YnQtdC90L3RjyDQv9GA0L4g0L/RgNC+0YbQtdGBXG5cbiAgdHJ5IHtcbiAgICAgIGlmIChkcmFnZ2VkRGF0YS50eXBlID09PSAnY2hhdCcpIHtcbiAgICAgICAgICAvLyDQn9C10YDQtdC80ZbRidGD0ZTQvNC+INGH0LDRglxuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5pbmZvKGBbRm9sZGVyRHJvcF0gQ2FsbGluZyBDaGF0TWFuYWdlci5tb3ZlQ2hhdDogaWQ9JHtkcmFnZ2VkRGF0YS5pZH0sIG9sZFBhdGg9JHtkcmFnZ2VkRGF0YS5wYXRofSwgbmV3Rm9sZGVyPSR7dGFyZ2V0Rm9sZGVyUGF0aH1gKTtcbiAgICAgICAgICBzdWNjZXNzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIubW92ZUNoYXQoZHJhZ2dlZERhdGEuaWQsIGRyYWdnZWREYXRhLnBhdGgsIHRhcmdldEZvbGRlclBhdGgpO1xuICAgICAgfSBlbHNlIGlmIChkcmFnZ2VkRGF0YS50eXBlID09PSAnZm9sZGVyJykge1xuICAgICAgICAgIC8vINCf0LXRgNC10LzRltGJ0YPRlNC80L4g0L/QsNC/0LrRgyAo0LLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviByZW5hbWVGb2xkZXIsINC+0YHQutGW0LvRjNC60Lgg0YbQtSDQt9C80ZbQvdCwINGI0LvRj9GF0YMpXG4gICAgICAgICAgY29uc3QgZm9sZGVyTmFtZSA9IGRyYWdnZWREYXRhLm5hbWU7IC8vINCG0Lwn0Y8g0L/QsNC/0LrQuCwg0YnQviDQv9C10YDQtdGC0Y/Qs9GD0ZTRgtGM0YHRj1xuICAgICAgICAgIGNvbnN0IG5ld1BhdGggPSBub3JtYWxpemVQYXRoKGAke3RhcmdldEZvbGRlclBhdGh9LyR7Zm9sZGVyTmFtZX1gKTsgLy8g0J3QvtCy0LjQuSDQv9C+0LLQvdC40Lkg0YjQu9GP0YUg0LTQu9GPINC/0LDQv9C60LhcblxuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5pbmZvKGBbRm9sZGVyRHJvcF0gQ2FsbGluZyBDaGF0TWFuYWdlci5yZW5hbWVGb2xkZXIgKGZvciBtb3ZlKTogb2xkUGF0aD0ke2RyYWdnZWREYXRhLnBhdGh9LCBuZXdQYXRoPSR7bmV3UGF0aH1gKTtcblxuICAgICAgICAgIGlmIChkcmFnZ2VkRGF0YS5wYXRoID09PSBuZXdQYXRoKSB7IC8vINCv0LrRidC+INGI0LvRj9GFINC90LUg0LfQvNGW0L3QuNCy0YHRjyAo0LzQsNC70L4g0LEg0LLRltC00YTRltC70YzRgtGA0YPQstCw0YLQuNGB0Y8g0YDQsNC90ZbRiNC1KVxuICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFwiW0ZvbGRlckRyb3BdIEZvbGRlciBzb3VyY2UgYW5kIHRhcmdldCBwYXRoIGFyZSBpZGVudGljYWwgYWZ0ZXIgbm9ybWFsaXphdGlvbi4gTm8gbW92ZSBuZWVkZWQuXCIpO1xuICAgICAgICAgICAgICAgc3VjY2VzcyA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8g0J/QtdGA0LXQstGW0YDQutCwINC90LAg0LrQvtC90YTQu9GW0LrRgiDRltC80LXQvSDRgyDRhtGW0LvRjNC+0LLRltC5INC/0LDQv9GG0ZZcbiAgICAgICAgICAgICAgY29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMobmV3UGF0aCk7XG4gICAgICAgICAgICAgIGlmIChleGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYEFuIGl0ZW0gbmFtZWQgXCIke2ZvbGRlck5hbWV9XCIgYWxyZWFkeSBleGlzdHMgaW4gdGhlIGZvbGRlciBcIiR7dGFyZ2V0Tm9kZS5uYW1lfVwiLmApO1xuICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oYFtGb2xkZXJEcm9wXSBQcmV2ZW50ZWQ6IFRhcmdldCBwYXRoICR7bmV3UGF0aH0gZm9yIGZvbGRlciBtb3ZlIGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgc3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnJlbmFtZUZvbGRlcihkcmFnZ2VkRGF0YS5wYXRoLCBuZXdQYXRoKTtcbiAgICAgICAgICAgICAgICAgIC8vINCe0L3QvtCy0LvRjtGU0LzQviDRgdGC0LDQvSDRgNC+0LfQs9C+0YDQvdGD0YLQvtGB0YLRliDQv9Cw0L/QutC4LCDRj9C60YnQviDQstC+0L3QsCDQsdGD0LvQsCDQv9C10YDQtdC80ZbRidC10L3QsFxuICAgICAgICAgICAgICAgICAgaWYgKHN1Y2Nlc3MgJiYgdGhpcy5mb2xkZXJFeHBhbnNpb25TdGF0ZS5oYXMoZHJhZ2dlZERhdGEucGF0aCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICBjb25zdCB3YXNFeHBhbmRlZCA9IHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuZ2V0KGRyYWdnZWREYXRhLnBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuZGVsZXRlKGRyYWdnZWREYXRhLnBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuc2V0KG5ld1BhdGgsIHdhc0V4cGFuZGVkISk7XG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbRm9sZGVyRHJvcF0gVHJhbnNmZXJyZWQgZXhwYW5zaW9uIHN0YXRlIGZvciBmb2xkZXIgZnJvbSAnJHtkcmFnZ2VkRGF0YS5wYXRofScgdG8gJyR7bmV3UGF0aH0nLmApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9IGNhdGNoKGVycm9yKSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtGb2xkZXJEcm9wXSBFcnJvciBkdXJpbmcgZHJvcCBvcGVyYXRpb24gKG1vdmluZyAke2RyYWdnZWREYXRhLnR5cGV9IHRvIGZvbGRlciAke3RhcmdldE5vZGUubmFtZX0pOmAsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UoYEVycm9yIG1vdmluZyAke2RyYWdnZWREYXRhLnR5cGV9LiBDaGVjayBjb25zb2xlLmApO1xuICAgICAgc3VjY2VzcyA9IGZhbHNlO1xuICB9IGZpbmFsbHkge1xuICAgICAgbm90aWNlLmhpZGUoKTsgLy8g0KXQvtCy0LDRlNC80L4g0YHQv9C+0LLRltGJ0LXQvdC90Y9cbiAgICAgIGlmIChzdWNjZXNzKSB7XG4gICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5pbmZvKGBbRm9sZGVyRHJvcF0gRHJvcCBzdWNjZXNzZnVsOiBNb3ZlZCAke2RyYWdnZWREYXRhLnR5cGV9ICcke2RyYWdnZWREYXRhLm5hbWV9JyB0byBmb2xkZXIgJyR7dGFyZ2V0Tm9kZS5uYW1lfScuIFVJIHVwZGF0ZSByZWxpZXMgb24gZXZlbnRzIGZyb20gQ2hhdE1hbmFnZXIuYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbRm9sZGVyRHJvcF0gRHJvcCBmYWlsZWQgb3Igd2FzIHByZXZlbnRlZCBmb3IgJHtkcmFnZ2VkRGF0YS50eXBlfSAnJHtkcmFnZ2VkRGF0YS5uYW1lfScgdG8gZm9sZGVyICcke3RhcmdldE5vZGUubmFtZX0nLmApO1xuICAgICAgfVxuICAgICAgLy8g0J7QvdC+0LLQu9C10L3QvdGPIFVJICjRgdC/0LjRgdC60YMg0YfQsNGC0ZbQsikg0LLRltC00LHRg9C00LXRgtGM0YHRjyDRh9C10YDQtdC3INC/0L7QtNGW0Y4gJ2NoYXQtbGlzdC11cGRhdGVkJyxcbiAgICAgIC8vINGP0LrRgyDQvNCw0ZQg0LfQs9C10L3QtdGA0YPQstCw0YLQuCBDaGF0TWFuYWdlciDQv9GW0YHQu9GPINGD0YHQv9GW0YjQvdC+0Zcg0L7Qv9C10YDQsNGG0ZbRlyBtb3ZlQ2hhdCDQsNCx0L4gcmVuYW1lRm9sZGVyLlxuICB9XG59IC8vIC0tLSDQmtGW0L3QtdGG0YwgaGFuZGxlRHJvcCAo0LTQu9GPINC+0LrRgNC10LzQuNGFINC/0LDQv9C+0LopIC0tLVxuXG5cbiAgXG5wcml2YXRlIGhhbmRsZURyYWdPdmVyUm9vdFBhcmVudChldmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG4gIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vINCX0LDQstC20LTQuCDQtNC+0LfQstC+0LvRj9GU0LzQviwg0Y/QutGJ0L4g0L/QvtC00ZbRjyDQtNGW0LnRiNC70LAg0YHRjtC00LhcbiAgaWYgKGV2ZW50LmRhdGFUcmFuc2Zlcikge1xuICAgIGV2ZW50LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ21vdmUnO1xuICB9XG5cbiAgaWYgKCF0aGlzLmRyYWdnZWRJdGVtRGF0YSkge1xuICAgICAgdGhpcy5jaGF0UGFuZWxMaXN0Q29udGFpbmVyRWwucmVtb3ZlQ2xhc3MoJ2RyYWctb3Zlci1yb290LXRhcmdldCcpO1xuICAgICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgZGlyZWN0VGFyZ2V0ID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXG4gIC8vINCv0LrRidC+INC80Lgg0L3QsNC0INC30LDQs9C+0LvQvtCy0LrQvtC8INGB0LXQutGG0ZbRlyDRh9Cw0YLRltCyLCDQvdC1INC/0ZbQtNGB0LLRltGH0YPRlNC80L4g0LTQu9GPIHJvb3QgZHJvcFxuICBpZiAodGhpcy5jaGF0UGFuZWxIZWFkZXJFbC5jb250YWlucyhkaXJlY3RUYXJnZXQpKSB7XG4gICAgICB0aGlzLmNoYXRQYW5lbExpc3RDb250YWluZXJFbC5yZW1vdmVDbGFzcygnZHJhZy1vdmVyLXJvb3QtdGFyZ2V0Jyk7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoXCJbRHJhZ092ZXJSb290UGFyZW50XSBPdmVyIGNoYXQgcGFuZWwgaGVhZGVyLiBObyByb290IGhpZ2hsaWdodC5cIik7XG4gICAgICByZXR1cm47XG4gIH1cblxuICAvLyDQr9C60YnQviDQvNC4INC90LDQtCDQv9Cw0L/QutC+0Y4sINGX0Zcg0LLQu9Cw0YHQvdC40LkgZHJhZ292ZXIg0LzQsNCyINC30YPQv9C40L3QuNGC0Lgg0YHQv9C70LjQstCw0L3QvdGPLlxuICAvLyDQr9C60YnQviDRhtGPINC/0L7QtNGW0Y8g0LLRgdC1INC2INGC0YPRgiwg0LfQvdCw0YfQuNGC0Ywg0LzQuCDQsNCx0L4g0L3QsNC0INC/0L7RgNC+0LbQvdGW0Lwg0LzRltGB0YbQtdC8IGNoYXRQYW5lbCxcbiAgLy8g0LDQsdC+INC90LDQtCBjaGF0UGFuZWxMaXN0Q29udGFpbmVyRWwsINCw0LHQviDQvdCw0LQgY2hhdEl0ZW0uXG5cbiAgLy8g0J/QtdGA0LXQstGW0YDQutCwLCDRh9C4INC10LvQtdC80LXQvdGCINCy0LbQtSDQsiDQutC+0YDQtdC90ZYgKNC70L7Qs9GW0LrQsCDQtyDQv9C+0L/QtdGA0LXQtNC90ZbRhSDQstC10YDRgdGW0LkpXG4gIGNvbnN0IHJvb3RGb2xkZXJQYXRoID0gbm9ybWFsaXplUGF0aCh0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jaGF0c0ZvbGRlclBhdGgpO1xuICBjb25zdCBkcmFnZ2VkUGF0aCA9IHRoaXMuZHJhZ2dlZEl0ZW1EYXRhLnBhdGg7XG4gIGxldCBzb3VyY2VQYXJlbnRQYXRoID0gbm9ybWFsaXplUGF0aChkcmFnZ2VkUGF0aC5zdWJzdHJpbmcoMCwgZHJhZ2dlZFBhdGgubGFzdEluZGV4T2YoJy8nKSkgfHwgJy8nKTtcbiAgaWYgKHRoaXMuZHJhZ2dlZEl0ZW1EYXRhLnR5cGUgPT09ICdmb2xkZXInICYmIHJvb3RGb2xkZXJQYXRoID09PSAnLycgJiYgIWRyYWdnZWRQYXRoLmluY2x1ZGVzKCcvJykpIHtcbiAgICAgIHNvdXJjZVBhcmVudFBhdGggPSAnLyc7XG4gIH1cbiAgLy8g0JTQvtC00LDRgtC60L7QstCwINC/0LXRgNC10LLRltGA0LrQsCDQtNC70Y8g0L/QsNC/0L7QuiDRgyDQstC60LvQsNC00LXQvdC+0LzRgyDQutC+0YDQtdC90ZZcbiAgaWYgKHRoaXMuZHJhZ2dlZEl0ZW1EYXRhLnR5cGUgPT09ICdmb2xkZXInICYmIHJvb3RGb2xkZXJQYXRoICE9PSAnLycgJiZcbiAgICAgIGRyYWdnZWRQYXRoLnN0YXJ0c1dpdGgocm9vdEZvbGRlclBhdGgpICYmXG4gICAgICAoZHJhZ2dlZFBhdGguc3Vic3RyaW5nKHJvb3RGb2xkZXJQYXRoLmxlbmd0aCsxKS5pbmRleE9mKCcvJykgPT09IC0xKSAmJlxuICAgICAgc291cmNlUGFyZW50UGF0aCA9PT0gcm9vdEZvbGRlclBhdGgpIHtcbiAgICAgICAgLy8gaXNBbHJlYWR5QXRSb290ID0gdHJ1ZTsgLy8g0JTQu9GPINC70L7Qs9GW0LrQuCDQvdC40LbRh9C1XG4gIH1cblxuICBpZiAoc291cmNlUGFyZW50UGF0aCA9PT0gcm9vdEZvbGRlclBhdGgpIHtcbiAgICAgIHRoaXMuY2hhdFBhbmVsTGlzdENvbnRhaW5lckVsLnJlbW92ZUNsYXNzKCdkcmFnLW92ZXItcm9vdC10YXJnZXQnKTtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShcIltEcmFnT3ZlclJvb3RQYXJlbnRdIEl0ZW0gYWxyZWFkeSBhdCByb290LCByZW1vdmluZyByb290IGhpZ2hsaWdodC5cIik7XG4gIH0gZWxzZSB7XG4gICAgICB0aGlzLmNoYXRQYW5lbExpc3RDb250YWluZXJFbC5hZGRDbGFzcygnZHJhZy1vdmVyLXJvb3QtdGFyZ2V0Jyk7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoXCJbRHJhZ092ZXJSb290UGFyZW50XSBWYWxpZCByb290IGRyb3AgdGFyZ2V0IGFyZWEuIEFkZGVkIHJvb3QgaGlnaGxpZ2h0IHRvIGxpc3QgY29udGFpbmVyLlwiKTtcbiAgfVxufVxuXG5wcml2YXRlIGhhbmRsZURyYWdFbnRlclJvb3RQYXJlbnQoZXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyAvLyDQlNC70Y8g0LrQvtC90YHQuNGB0YLQtdC90YLQvdC+0YHRgtGWXG4gIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShgW0RyYWdFbnRlclJvb3RQYXJlbnRdIE1vdXNlIGVudGVyZWQgY2hhdFBhbmVsIGJvdW5kcy5gKTtcbiAgLy8g0JLQuNC60LvQuNC60LDRlNC80L4gaGFuZGxlRHJhZ092ZXJSb290UGFyZW50LCDRidC+0LEg0LLRgdGC0LDQvdC+0LLQuNGC0Lgv0L/RgNC40LHRgNCw0YLQuCDQv9GW0LTRgdCy0ZbRh9GD0LLQsNC90L3Rj1xuICB0aGlzLmhhbmRsZURyYWdPdmVyUm9vdFBhcmVudChldmVudCk7XG59XG5cbnByaXZhdGUgaGFuZGxlRHJhZ0xlYXZlUm9vdFBhcmVudChldmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG4gIGNvbnN0IGxpc3RlbmluZ0VsZW1lbnQgPSBldmVudC5jdXJyZW50VGFyZ2V0IGFzIEhUTUxFbGVtZW50OyAvLyDQptC1IGNoYXRQYW5lbFxuICBjb25zdCByZWxhdGVkVGFyZ2V0ID0gZXZlbnQucmVsYXRlZFRhcmdldCBhcyBOb2RlIHwgbnVsbDtcbiAgdGhpcy5wbHVnaW4ubG9nZ2VyLnRyYWNlKGBbRHJhZ0xlYXZlUm9vdFBhcmVudF0gRXZlbnQgZmlyZWQgZnJvbSBjaGF0UGFuZWwuIFJlbGF0ZWQgdGFyZ2V0OiAke3JlbGF0ZWRUYXJnZXQgPyAocmVsYXRlZFRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xhc3NOYW1lIDogJ251bGwnfWApO1xuXG4gIGlmICghcmVsYXRlZFRhcmdldCB8fCAhbGlzdGVuaW5nRWxlbWVudC5jb250YWlucyhyZWxhdGVkVGFyZ2V0KSkge1xuICAgICAgdGhpcy5jaGF0UGFuZWxMaXN0Q29udGFpbmVyRWwucmVtb3ZlQ2xhc3MoJ2RyYWctb3Zlci1yb290LXRhcmdldCcpO1xuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFwiW0RyYWdMZWF2ZVJvb3RQYXJlbnRdIE1vdXNlIGxlZnQgY2hhdFBhbmVsIGJvdW5kcy4gUmVtb3ZlZCAnZHJhZy1vdmVyLXJvb3QtdGFyZ2V0Jy5cIik7XG4gIH1cbn1cblxucHJpdmF0ZSBhc3luYyBoYW5kbGVEcm9wUm9vdFBhcmVudChldmVudDogRHJhZ0V2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG4gIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gIHRoaXMuY2hhdFBhbmVsTGlzdENvbnRhaW5lckVsLnJlbW92ZUNsYXNzKCdkcmFnLW92ZXItcm9vdC10YXJnZXQnKTsgLy8g0J/RgNC40LHQuNGA0LDRlNC80L4g0L/RltC00YHQstGW0YfRg9Cy0LDQvdC90Y9cbiAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFwiW0Ryb3BSb290UGFyZW50XSBFdmVudCBmaXJlZCBvbiBjaGF0UGFuZWwuXCIpO1xuXG4gIGlmICghdGhpcy5kcmFnZ2VkSXRlbURhdGEpIHtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKFwiW0Ryb3BSb290UGFyZW50XSBObyBkcmFnZ2VkSXRlbURhdGEgYXZhaWxhYmxlLiBBYm9ydGluZy5cIik7XG4gICAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBkaXJlY3RUYXJnZXQgPSBldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gIC8vINCv0LrRidC+INGB0LrQuNC00LDQvdC90Y8g0LLRltC00LHRg9C70L7RgdGPINC90LAg0LfQsNCz0L7Qu9C+0LLQvtC6LCDRltCz0L3QvtGA0YPRlNC80L5cbiAgaWYgKHRoaXMuY2hhdFBhbmVsSGVhZGVyRWwuY29udGFpbnMoZGlyZWN0VGFyZ2V0KSkge1xuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmluZm8oXCJbRHJvcFJvb3RQYXJlbnRdIERyb3Agb2NjdXJyZWQgb24gY2hhdCBwYW5lbCBoZWFkZXIuIEFib3J0aW5nIHJvb3QgZHJvcC5cIik7XG4gICAgICB0aGlzLmRyYWdnZWRJdGVtRGF0YSA9IG51bGw7IC8vINCe0YfQuNGB0YLQuNC80L4sINCx0L4gZHJvcCDQstGW0LTQsdGD0LLRgdGPXG4gICAgICByZXR1cm47XG4gIH1cbiAgLy8g0K/QutGJ0L4g0YHQutC40LTQsNC90L3RjyDQstGW0LTQsdGD0LvQvtGB0Y8g0L3QsCDQv9Cw0L/QutGDLCDRl9GXINCy0LvQsNGB0L3QuNC5INC+0LHRgNC+0LHQvdC40LogZHJvcCDQvNCw0LIg0YHQv9GA0LDRhtGO0LLQsNGC0Lgg0ZYg0LfRg9C/0LjQvdC40YLQuCDRgdC/0LvQuNCy0LDQvdC90Y8uXG4gIC8vINCv0LrRidC+INC/0L7QtNGW0Y8g0LTRltC50YjQu9CwINGB0Y7QtNC4LCDRhtC1INC+0LfQvdCw0YfQsNGULCDRidC+INGB0LrQuNC00LDQvdC90Y8g0LHRg9C70L4g0L3QtSDQvdCwINC/0LDQv9C60YMgKNGP0LrQsCDRlCBkcm9wIHRhcmdldCkuXG5cbiAgY29uc3QgZHJhZ2dlZERhdGEgPSB7IC4uLnRoaXMuZHJhZ2dlZEl0ZW1EYXRhIH07XG4gIHRoaXMuZHJhZ2dlZEl0ZW1EYXRhID0gbnVsbDtcblxuICBjb25zdCByb290Rm9sZGVyUGF0aCA9IG5vcm1hbGl6ZVBhdGgodGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2hhdHNGb2xkZXJQYXRoKTtcbiAgdGhpcy5wbHVnaW4ubG9nZ2VyLmluZm8oYFtEcm9wUm9vdFBhcmVudF0gQXR0ZW1wdGluZyB0byBkcm9wOiAke0pTT04uc3RyaW5naWZ5KGRyYWdnZWREYXRhKX0gaW50byByb290OiAke3Jvb3RGb2xkZXJQYXRofWApO1xuXG4gIC8vIC0tLSDQktCQ0JvQhtCU0JDQptCG0K8gKNGC0LDQutCwINGB0LDQvNCwLCDRj9C6INGDIGhhbmRsZURyYWdPdmVyUm9vdFBhcmVudCkgLS0tXG4gIGxldCBzb3VyY2VQYXJlbnRQYXRoID0gbm9ybWFsaXplUGF0aChkcmFnZ2VkRGF0YS5wYXRoLnN1YnN0cmluZygwLCBkcmFnZ2VkRGF0YS5wYXRoLmxhc3RJbmRleE9mKCcvJykpIHx8ICcvJyk7XG4gIGlmIChkcmFnZ2VkRGF0YS50eXBlID09PSAnZm9sZGVyJyAmJiByb290Rm9sZGVyUGF0aCA9PT0gJy8nICYmICFkcmFnZ2VkRGF0YS5wYXRoLmluY2x1ZGVzKCcvJykpIHtcbiAgICAgIHNvdXJjZVBhcmVudFBhdGggPSAnLyc7XG4gIH1cbiAgLy8gLi4uICjQtNC+0LTQsNGC0LrQvtCy0LAg0L/QtdGA0LXQstGW0YDQutCwINC00LvRjyDQv9Cw0L/QvtC6INGDINCy0LrQu9Cw0LTQtdC90L7QvNGDINC60L7RgNC10L3Rliwg0Y/QutGJ0L4g0L/QvtGC0YDRltCx0L3Qviwg0LDQu9C1IHNvdXJjZVBhcmVudFBhdGgg0LzQsNGUINCx0YPRgtC4INC00L7RgdGC0LDRgtC90YzQvilcblxuICBpZiAoc291cmNlUGFyZW50UGF0aCA9PT0gcm9vdEZvbGRlclBhdGgpIHtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5pbmZvKGBbRHJvcFJvb3RQYXJlbnRdIEl0ZW0gJyR7ZHJhZ2dlZERhdGEubmFtZX0nIGlzIGFscmVhZHkgaW4gdGhlIHJvb3QgZm9sZGVyLiBEcm9wIGNhbmNlbGxlZC5gKTtcbiAgICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIC0tLSDQktCY0JrQntCd0JDQndCd0K8g0JTQhtCHICjQutC+0LQg0YLQsNC60LjQuSDRgdCw0LzQuNC5LCDRj9C6INGDIGhhbmRsZURyb3BSb290INC3INC/0L7Qv9C10YDQtdC00L3RjNC+0Zcg0LLRltC00L/QvtCy0ZbQtNGWKSAtLS1cbiAgbGV0IHN1Y2Nlc3MgPSBmYWxzZTtcbiAgY29uc3Qgbm90aWNlID0gbmV3IE5vdGljZShgTW92aW5nICR7ZHJhZ2dlZERhdGEudHlwZX0gdG8gcm9vdC4uLmAsIDApO1xuICB0cnkge1xuICAgICAgaWYgKGRyYWdnZWREYXRhLnR5cGUgPT09ICdjaGF0Jykge1xuICAgICAgICAgIHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5tb3ZlQ2hhdChkcmFnZ2VkRGF0YS5pZCwgZHJhZ2dlZERhdGEucGF0aCwgcm9vdEZvbGRlclBhdGgpO1xuICAgICAgfSBlbHNlIGlmIChkcmFnZ2VkRGF0YS50eXBlID09PSAnZm9sZGVyJykge1xuICAgICAgICAgIGNvbnN0IGZvbGRlck5hbWUgPSBkcmFnZ2VkRGF0YS5uYW1lO1xuICAgICAgICAgIGNvbnN0IG5ld1BhdGhBdFJvb3QgPSBub3JtYWxpemVQYXRoKHJvb3RGb2xkZXJQYXRoID09PSAnLycgPyBmb2xkZXJOYW1lIDogYCR7cm9vdEZvbGRlclBhdGh9LyR7Zm9sZGVyTmFtZX1gKTtcbiAgICAgICAgICBpZiAoZHJhZ2dlZERhdGEucGF0aCA9PT0gbmV3UGF0aEF0Um9vdCkge1xuICAgICAgICAgICAgICAgc3VjY2VzcyA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMobmV3UGF0aEF0Um9vdCk7XG4gICAgICAgICAgICAgIGlmIChleGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYEFuIGl0ZW0gbmFtZWQgXCIke2ZvbGRlck5hbWV9XCIgYWxyZWFkeSBleGlzdHMgYXQgdGhlIHJvb3QuYCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBzdWNjZXNzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIucmVuYW1lRm9sZGVyKGRyYWdnZWREYXRhLnBhdGgsIG5ld1BhdGhBdFJvb3QpO1xuICAgICAgICAgICAgICAgICAgaWYgKHN1Y2Nlc3MgJiYgdGhpcy5mb2xkZXJFeHBhbnNpb25TdGF0ZS5oYXMoZHJhZ2dlZERhdGEucGF0aCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICBjb25zdCB3YXNFeHBhbmRlZCA9IHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuZ2V0KGRyYWdnZWREYXRhLnBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuZGVsZXRlKGRyYWdnZWREYXRhLnBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuc2V0KG5ld1BhdGhBdFJvb3QsIHdhc0V4cGFuZGVkISk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtEcm9wUm9vdFBhcmVudF0gRXJyb3IgZHVyaW5nIG9wZXJhdGlvbiBmb3IgJHtkcmFnZ2VkRGF0YS50eXBlfSAnJHtkcmFnZ2VkRGF0YS5uYW1lfSc6YCwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZShgRXJyb3IgbW92aW5nICR7ZHJhZ2dlZERhdGEudHlwZX0gdG8gcm9vdC4gQ2hlY2sgY29uc29sZS5gKTtcbiAgICAgIHN1Y2Nlc3MgPSBmYWxzZTtcbiAgfSBmaW5hbGx5IHtcbiAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgICBpZiAoc3VjY2Vzcykge1xuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5pbmZvKGBbRHJvcFJvb3RQYXJlbnRdIE9wZXJhdGlvbiBmb3IgJHtkcmFnZ2VkRGF0YS50eXBlfSAnJHtkcmFnZ2VkRGF0YS5uYW1lfScgdG8gcm9vdCB3YXMgc3VjY2Vzc2Z1bC4gVUkgdXBkYXRlIHJlbGllcyBvbiBldmVudHMuYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbRHJvcFJvb3RQYXJlbnRdIE9wZXJhdGlvbiBmb3IgJHtkcmFnZ2VkRGF0YS50eXBlfSAnJHtkcmFnZ2VkRGF0YS5uYW1lfScgdG8gcm9vdCBmYWlsZWQgb3Igd2FzIHByZXZlbnRlZC5gKTtcbiAgICAgIH1cbiAgfVxufVxuXG4gIC8vIC0tLSDQntCx0YDQvtCx0L3QuNC60Lgg0LTQu9GPINCh0J/QldCm0IbQkNCb0KzQndCe0Icg0JfQntCd0Jgg0KHQmtCY0JTQkNCd0J3QryDQkiDQmtCe0KDQhtCd0KwgLS0tXG5cbiAgcHJpdmF0ZSBoYW5kbGVEcmFnT3ZlclJvb3Rab25lKGV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGlmIChldmVudC5kYXRhVHJhbnNmZXIpIHtcbiAgICAgIGV2ZW50LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ21vdmUnO1xuICAgIH1cbiAgICAvLyDQotGD0YIg0L3QtSDQv9C+0YLRgNGW0LHQvdC+INC/0LXRgNC10LLRltGA0Y/RgtC4IGV2ZW50LnRhcmdldCwg0LHQviDRhtGPINC/0L7QtNGW0Y8g0YHQv9GA0LDRhtGM0L7QstGD0ZQg0LvQuNGI0LUg0L3QsCByb290RHJvcFpvbmVFbFxuICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShcIltEcmFnT3ZlclJvb3Rab25lXSBGaXJlZC5cIik7XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZURyYWdFbnRlclJvb3Rab25lKGV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IHRhcmdldEVsZW1lbnQgPSBldmVudC5jdXJyZW50VGFyZ2V0IGFzIEhUTUxFbGVtZW50OyAvLyDQptC1IHRoaXMucm9vdERyb3Bab25lRWxcbiAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtEcmFnRW50ZXJSb290Wm9uZV0gRXZlbnQgZmlyZWQgZm9yIHRhcmdldDogJHt0YXJnZXRFbGVtZW50LmNsYXNzTmFtZX1gKTtcblxuICAgIGlmICghdGhpcy5kcmFnZ2VkSXRlbURhdGEpIHtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKFwiW0RyYWdFbnRlclJvb3Rab25lXSBObyBkcmFnZ2VkSXRlbURhdGEgYXZhaWxhYmxlLlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyDQktCw0LvRltC00LDRhtGW0Y86INGH0Lgg0L3QtSDQv9C10YDQtdGC0Y/Qs9GD0ZTQvNC+INC10LvQtdC80LXQvdGCLCDRidC+INCy0LbQtSDQsiDQutC+0YDQtdC90ZZcbiAgICBjb25zdCByb290Rm9sZGVyUGF0aCA9IG5vcm1hbGl6ZVBhdGgodGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2hhdHNGb2xkZXJQYXRoKTtcbiAgICBjb25zdCBkcmFnZ2VkUGF0aCA9IHRoaXMuZHJhZ2dlZEl0ZW1EYXRhLnBhdGg7XG4gICAgbGV0IHNvdXJjZVBhcmVudFBhdGggPSBub3JtYWxpemVQYXRoKGRyYWdnZWRQYXRoLnN1YnN0cmluZygwLCBkcmFnZ2VkUGF0aC5sYXN0SW5kZXhPZignLycpKSB8fCAnLycpO1xuICAgIGlmICh0aGlzLmRyYWdnZWRJdGVtRGF0YS50eXBlID09PSAnZm9sZGVyJyAmJiByb290Rm9sZGVyUGF0aCA9PT0gJy8nICYmICFkcmFnZ2VkUGF0aC5pbmNsdWRlcygnLycpKSB7XG4gICAgICAgIHNvdXJjZVBhcmVudFBhdGggPSAnLyc7XG4gICAgfVxuXG4gICAgaWYgKHNvdXJjZVBhcmVudFBhdGggPT09IHJvb3RGb2xkZXJQYXRoKSB7XG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW0RyYWdFbnRlclJvb3Rab25lXSBJdGVtICcke3RoaXMuZHJhZ2dlZEl0ZW1EYXRhLm5hbWV9JyBpcyBhbHJlYWR5IGluIHRoZSByb290IGZvbGRlci4gTm8gaGlnaGxpZ2h0LmApO1xuICAgICAgICB0YXJnZXRFbGVtZW50LnJlbW92ZUNsYXNzKCdkcmFnLW92ZXItcm9vdC10YXJnZXQnKTsgLy8g0JfQsNCx0LjRgNCw0ZTQvNC+LCDRj9C60YnQviDQstC40L/QsNC00LrQvtCy0L4g0LHRg9C70L5cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRhcmdldEVsZW1lbnQuYWRkQ2xhc3MoJ2RyYWctb3Zlci1yb290LXRhcmdldCcpO1xuICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIltEcmFnRW50ZXJSb290Wm9uZV0gQWRkZWQgJ2RyYWctb3Zlci1yb290LXRhcmdldCcgdG8gcm9vdCBkcm9wIHpvbmUuXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVEcmFnTGVhdmVSb290Wm9uZShldmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG4gICAgY29uc3QgdGFyZ2V0RWxlbWVudCA9IGV2ZW50LmN1cnJlbnRUYXJnZXQgYXMgSFRNTEVsZW1lbnQ7IC8vINCm0LUgdGhpcy5yb290RHJvcFpvbmVFbFxuICAgIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShgW0RyYWdMZWF2ZVJvb3Rab25lXSBFdmVudCBmaXJlZC5gKTtcbiAgICB0YXJnZXRFbGVtZW50LnJlbW92ZUNsYXNzKCdkcmFnLW92ZXItcm9vdC10YXJnZXQnKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlRHJvcFJvb3Rab25lKGV2ZW50OiBEcmFnRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IHRhcmdldEVsZW1lbnQgPSBldmVudC5jdXJyZW50VGFyZ2V0IGFzIEhUTUxFbGVtZW50OyAvLyDQptC1IHRoaXMucm9vdERyb3Bab25lRWxcbiAgICB0YXJnZXRFbGVtZW50LnJlbW92ZUNsYXNzKCdkcmFnLW92ZXItcm9vdC10YXJnZXQnKTtcbiAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbRHJvcFJvb3Rab25lXSBFdmVudCBmaXJlZCBvbiBkZWRpY2F0ZWQgcm9vdCBkcm9wIHpvbmUuXCIpO1xuXG4gICAgaWYgKCF0aGlzLmRyYWdnZWRJdGVtRGF0YSkge1xuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihcIltEcm9wUm9vdFpvbmVdIE5vIGRyYWdnZWRJdGVtRGF0YSBhdmFpbGFibGUgb24gZHJvcC4gQWJvcnRpbmcuXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZHJhZ2dlZERhdGEgPSB7IC4uLnRoaXMuZHJhZ2dlZEl0ZW1EYXRhIH07XG4gICAgdGhpcy5kcmFnZ2VkSXRlbURhdGEgPSBudWxsOyAvLyDQntGH0LjRidCw0ZTQvNC+XG5cbiAgICBjb25zdCByb290Rm9sZGVyUGF0aCA9IG5vcm1hbGl6ZVBhdGgodGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2hhdHNGb2xkZXJQYXRoKTtcbiAgICB0aGlzLnBsdWdpbi5sb2dnZXIuaW5mbyhgW0Ryb3BSb290Wm9uZV0gQXR0ZW1wdGluZyB0byBkcm9wOiAke0pTT04uc3RyaW5naWZ5KGRyYWdnZWREYXRhKX0gaW50byByb290OiAke3Jvb3RGb2xkZXJQYXRofWApO1xuXG4gICAgLy8gLS0tINCS0JDQm9CG0JTQkNCm0IbQryAo0YfQuCDQtdC70LXQvNC10L3RgiDQstC20LUg0LIg0LrQvtGA0LXQvdGWKSAtLS1cbiAgICBsZXQgc291cmNlUGFyZW50UGF0aCA9IG5vcm1hbGl6ZVBhdGgoZHJhZ2dlZERhdGEucGF0aC5zdWJzdHJpbmcoMCwgZHJhZ2dlZERhdGEucGF0aC5sYXN0SW5kZXhPZignLycpKSB8fCAnLycpO1xuICAgIGlmIChkcmFnZ2VkRGF0YS50eXBlID09PSAnZm9sZGVyJyAmJiByb290Rm9sZGVyUGF0aCA9PT0gJy8nICYmICFkcmFnZ2VkRGF0YS5wYXRoLmluY2x1ZGVzKCcvJykpIHtcbiAgICAgICAgc291cmNlUGFyZW50UGF0aCA9ICcvJztcbiAgICB9XG5cbiAgICBpZiAoc291cmNlUGFyZW50UGF0aCA9PT0gcm9vdEZvbGRlclBhdGgpIHtcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmluZm8oYFtEcm9wUm9vdFpvbmVdIEl0ZW0gJyR7ZHJhZ2dlZERhdGEubmFtZX0nIGlzIGFscmVhZHkgaW4gdGhlIHJvb3QgZm9sZGVyLiBEcm9wIGNhbmNlbGxlZC5gKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIC0tLSDQktCY0JrQntCd0JDQndCd0K8g0JTQhtCHICjQu9C+0LPRltC60LAg0YLQsNC60LAg0YHQsNC80LAsINGP0Log0YMgaGFuZGxlRHJvcFJvb3RQYXJlbnQpIC0tLVxuICAgIGxldCBzdWNjZXNzID0gZmFsc2U7XG4gICAgY29uc3Qgbm90aWNlID0gbmV3IE5vdGljZShgTW92aW5nICR7ZHJhZ2dlZERhdGEudHlwZX0gdG8gcm9vdC4uLmAsIDApO1xuICAgIHRyeSB7XG4gICAgICAgIGlmIChkcmFnZ2VkRGF0YS50eXBlID09PSAnY2hhdCcpIHtcbiAgICAgICAgICAgIHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5tb3ZlQ2hhdChkcmFnZ2VkRGF0YS5pZCwgZHJhZ2dlZERhdGEucGF0aCwgcm9vdEZvbGRlclBhdGgpO1xuICAgICAgICB9IGVsc2UgaWYgKGRyYWdnZWREYXRhLnR5cGUgPT09ICdmb2xkZXInKSB7XG4gICAgICAgICAgICBjb25zdCBmb2xkZXJOYW1lID0gZHJhZ2dlZERhdGEubmFtZTtcbiAgICAgICAgICAgIGNvbnN0IG5ld1BhdGhBdFJvb3QgPSBub3JtYWxpemVQYXRoKHJvb3RGb2xkZXJQYXRoID09PSAnLycgPyBmb2xkZXJOYW1lIDogYCR7cm9vdEZvbGRlclBhdGh9LyR7Zm9sZGVyTmFtZX1gKTtcbiAgICAgICAgICAgIGlmIChkcmFnZ2VkRGF0YS5wYXRoID09PSBuZXdQYXRoQXRSb290KSB7XG4gICAgICAgICAgICAgICAgIHN1Y2Nlc3MgPSB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmV4aXN0cyhuZXdQYXRoQXRSb290KTtcbiAgICAgICAgICAgICAgICBpZiAoZXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYEFuIGl0ZW0gbmFtZWQgXCIke2ZvbGRlck5hbWV9XCIgYWxyZWFkeSBleGlzdHMgYXQgdGhlIHJvb3QuYCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnJlbmFtZUZvbGRlcihkcmFnZ2VkRGF0YS5wYXRoLCBuZXdQYXRoQXRSb290KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN1Y2Nlc3MgJiYgdGhpcy5mb2xkZXJFeHBhbnNpb25TdGF0ZS5oYXMoZHJhZ2dlZERhdGEucGF0aCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHdhc0V4cGFuZGVkID0gdGhpcy5mb2xkZXJFeHBhbnNpb25TdGF0ZS5nZXQoZHJhZ2dlZERhdGEucGF0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZvbGRlckV4cGFuc2lvblN0YXRlLmRlbGV0ZShkcmFnZ2VkRGF0YS5wYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZm9sZGVyRXhwYW5zaW9uU3RhdGUuc2V0KG5ld1BhdGhBdFJvb3QsIHdhc0V4cGFuZGVkISk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtEcm9wUm9vdFpvbmVdIEVycm9yIGR1cmluZyBvcGVyYXRpb24gZm9yICR7ZHJhZ2dlZERhdGEudHlwZX0gJyR7ZHJhZ2dlZERhdGEubmFtZX0nOmAsIGVycm9yKTtcbiAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgbW92aW5nICR7ZHJhZ2dlZERhdGEudHlwZX0gdG8gcm9vdC4gQ2hlY2sgY29uc29sZS5gKTtcbiAgICAgICAgc3VjY2VzcyA9IGZhbHNlO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgICAgIGlmIChzdWNjZXNzKSB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuaW5mbyhgW0Ryb3BSb290Wm9uZV0gT3BlcmF0aW9uIGZvciAke2RyYWdnZWREYXRhLnR5cGV9ICcke2RyYWdnZWREYXRhLm5hbWV9JyB0byByb290IHdhcyBzdWNjZXNzZnVsLiBVSSB1cGRhdGUgcmVsaWVzIG9uIGV2ZW50cy5gKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbRHJvcFJvb3Rab25lXSBPcGVyYXRpb24gZm9yICR7ZHJhZ2dlZERhdGEudHlwZX0gJyR7ZHJhZ2dlZERhdGEubmFtZX0nIHRvIHJvb3QgZmFpbGVkIG9yIHdhcyBwcmV2ZW50ZWQuYCk7XG4gICAgICAgIH1cbiAgICB9XG4gIH1cblxuXG59IC8vIEVuZCBvZiBTaWRlYmFyTWFuYWdlciBjbGFzc1xuIl19