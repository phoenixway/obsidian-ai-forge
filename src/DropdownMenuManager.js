import { __awaiter } from "tslib";
// DropdownMenuManager.ts
import { setIcon, Notice } from "obsidian";
import { CSS_CLASSES } from "./constants";
// --- CSS Classes ---
const CSS_CLASS_MENU_DROPDOWN = "menu-dropdown";
const CSS_CLASS_MENU_OPTION = "menu-option";
const CSS_CLASS_MENU_HEADER_ITEM = "menu-header-item";
const CSS_CLASS_SUBMENU_ICON = "submenu-icon";
const CSS_CLASS_SUBMENU_CONTENT = "submenu-content";
const CSS_CLASS_SETTINGS_OPTION = "settings-option";
const CSS_CLASS_MENU_SEPARATOR = "menu-separator"; // Базовий клас роздільника
const CSS_CLASS_CLEAR_CHAT_OPTION = "clear-chat-option";
const CSS_CLASS_EXPORT_CHAT_OPTION = "export-chat-option";
const CSS_CLASS_MODEL_OPTION = "model-option";
const CSS_CLASS_MODEL_LIST_CONTAINER = "model-list-container";
const CSS_CLASS_ROLE_OPTION = "role-option";
const CSS_CLASS_ROLE_LIST_CONTAINER = "role-list-container";
const CSS_CLASS_CHAT_OPTION = "chat-option";
const CSS_CLASS_CHAT_LIST_CONTAINER = "chat-list-container";
const CSS_CLASS_CHAT_LIST_SCROLLABLE = "chat-list-scrollable";
const CSS_CLASS_MENU_HEADER = "menu-header";
const CSS_CLASS_NEW_CHAT_OPTION = "new-chat-option";
const CSS_CLASS_RENAME_CHAT_OPTION = "rename-chat-option";
const CSS_CLASS_DELETE_CHAT_OPTION = "delete-chat-option";
const CSS_CLASS_CLONE_CHAT_OPTION = "clone-chat-option";
const CSS_CLASS_TOGGLE_VIEW_LOCATION = "toggle-view-location-option";
const CSS_CLASS_CHAT_LIST_ITEM = "ollama-chat-list-item";
// Унікальні класи для роздільників
const CSS_HR_AFTER_MODEL = "hr-after-model";
const CSS_HR_AFTER_ROLE = "hr-after-role";
const CSS_HR_AFTER_CHAT = "hr-after-chat";
const CSS_HR_AFTER_ACTIONS = "hr-after-actions"; // Після основних дій
const CSS_HR_AFTER_DANGER = "hr-after-danger"; // Після небезпечних дій
const CSS_HR_AFTER_TOGGLE = "hr-after-toggle"; // Після перемикача
const CHAT_LIST_MAX_HEIGHT = "250px";
export class DropdownMenuManager {
    constructor(plugin, app, view, parentElement, isSidebarLocation, isDesktop) {
        this.listeners = [];
        // --- Submenu Logic ---
        this.createSubmenuSection = (title, icon, listContainerClass, sectionClass) => {
            const section = this.menuDropdown.createDiv();
            if (sectionClass)
                section.addClass(sectionClass);
            const header = section.createDiv({
                cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MENU_HEADER_ITEM}`,
            });
            setIcon(header.createSpan({ cls: "menu-option-icon" }), icon);
            header.createSpan({ cls: "menu-option-text", text: title });
            setIcon(header.createSpan({ cls: CSS_CLASS_SUBMENU_ICON }), "chevron-right");
            const isChatList = listContainerClass === CSS_CLASS_CHAT_LIST_CONTAINER;
            const content = section.createDiv({
                cls: `${CSS_CLASS_SUBMENU_CONTENT} ${CSS_CLASSES.SUBMENU_CONTENT_HIDDEN} ${listContainerClass} ${isChatList ? CSS_CLASS_CHAT_LIST_SCROLLABLE : ""}`,
            });
            content.style.maxHeight = "0";
            content.style.overflow = "hidden";
            content.style.transition = "max-height 0.3s ease-out, padding 0.3s ease-out";
            content.style.paddingTop = "0";
            content.style.paddingBottom = "0";
            return { header, content, section };
        };
        this.plugin = plugin;
        this.app = app;
        this.view = view;
        this.parentElement = parentElement;
        this.isSidebarLocation = isSidebarLocation;
        this.isDesktop = isDesktop;
    }
    // --- ОСНОВНИЙ МЕТОД СТВОРЕННЯ МЕНЮ З КЛАСАМИ ДЛЯ РОЗДІЛЬНИКІВ ---
    createMenuUI() {
        this.menuDropdown = this.parentElement.createEl("div", { cls: [CSS_CLASS_MENU_DROPDOWN, "ollama-chat-menu"] });
        this.menuDropdown.style.display = "none";
        // Додаємо контекстні класи до головного контейнера меню
        this.menuDropdown.classList.toggle('is-desktop', this.isDesktop);
        this.menuDropdown.classList.toggle('is-mobile-tablet', !this.isDesktop);
        this.menuDropdown.classList.toggle('is-sidebar-location', this.isSidebarLocation);
        this.menuDropdown.classList.toggle('is-tab-location', !this.isSidebarLocation);
        // --- Створюємо ВСІ секції та елементи ЗАВЖДИ ---
        // Model Section
        const modelSection = this.createSubmenuSection("Select Model", "list-collapse", CSS_CLASS_MODEL_LIST_CONTAINER, "model-submenu-section");
        this.modelSubmenuHeader = modelSection.header;
        this.modelSubmenuContent = modelSection.content;
        this.menuDropdown.createEl("hr", { cls: [CSS_CLASS_MENU_SEPARATOR, CSS_HR_AFTER_MODEL] }); // <--- Клас HR
        // Role Section
        const roleDropdownSection = this.createSubmenuSection("Select Role", "users", CSS_CLASS_ROLE_LIST_CONTAINER, "role-submenu-section");
        this.roleSubmenuHeader = roleDropdownSection.header;
        this.roleSubmenuContent = roleDropdownSection.content;
        this.menuDropdown.createEl("hr", { cls: [CSS_CLASS_MENU_SEPARATOR, CSS_HR_AFTER_ROLE] }); // <--- Клас HR
        // Chat Section
        const chatDropdownSection = this.createSubmenuSection("Load Chat", "messages-square", CSS_CLASS_CHAT_LIST_CONTAINER, "chat-submenu-section");
        this.chatSubmenuHeader = chatDropdownSection.header;
        this.chatSubmenuContent = chatDropdownSection.content;
        this.menuDropdown.createEl("hr", { cls: [CSS_CLASS_MENU_SEPARATOR, CSS_HR_AFTER_CHAT] }); // <--- Клас HR
        // Chat Actions Group
        this.newChatOption = this.createActionItem("plus-circle", "New Chat", CSS_CLASS_NEW_CHAT_OPTION);
        this.renameChatOption = this.createActionItem("pencil", "Rename Chat", CSS_CLASS_RENAME_CHAT_OPTION);
        this.cloneChatOption = this.createActionItem("copy-plus", "Clone Chat", CSS_CLASS_CLONE_CHAT_OPTION);
        this.exportChatOption = this.createActionItem("download", "Export Chat to Note", CSS_CLASS_EXPORT_CHAT_OPTION);
        // Роздільник після ОСТАННЬОГО елемента групи
        this.menuDropdown.createEl("hr", { cls: [CSS_CLASS_MENU_SEPARATOR, CSS_HR_AFTER_ACTIONS] }); // <--- Клас HR
        // Danger Actions Group
        this.clearChatOption = this.createActionItem("trash", "Clear Messages", [CSS_CLASS_CLEAR_CHAT_OPTION, CSS_CLASSES.DANGER_OPTION]);
        this.deleteChatOption = this.createActionItem("trash-2", "Delete Chat", [CSS_CLASS_DELETE_CHAT_OPTION, CSS_CLASSES.DANGER_OPTION]);
        // Роздільник після ОСТАННЬОГО елемента групи
        this.menuDropdown.createEl("hr", { cls: [CSS_CLASS_MENU_SEPARATOR, CSS_HR_AFTER_DANGER] }); // <--- Клас HR
        // Toggle View Location
        this.toggleViewLocationOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_TOGGLE_VIEW_LOCATION}` });
        this.updateToggleViewLocationOption();
        this.menuDropdown.createEl("hr", { cls: [CSS_CLASS_MENU_SEPARATOR, CSS_HR_AFTER_TOGGLE] }); // <--- Клас HR
        // Settings
        this.settingsOption = this.createActionItem("settings", "Settings", CSS_CLASS_SETTINGS_OPTION);
        // Роздільник після Settings не потрібен
    }
    // attachEventListeners залишається таким, як у попередній відповіді (додає слухачі до всіх)
    attachEventListeners() {
        // this.plugin.logger.error(`[DropdownMenuManager] !!! ATTACHING ALL POTENTIAL EVENT LISTENERS (Visibility controlled by CSS) !!!`);
        // --- Null Checks ---
        if (!this.modelSubmenuHeader)
            console.error("Model header missing");
        if (!this.roleSubmenuHeader)
            console.error("Role header missing");
        if (!this.chatSubmenuHeader)
            console.error("Chat header missing");
        if (!this.newChatOption)
            console.error("New Chat missing");
        if (!this.renameChatOption)
            console.error("Rename Chat missing");
        if (!this.cloneChatOption)
            console.error("Clone Chat missing");
        if (!this.exportChatOption)
            console.error("Export Chat missing");
        if (!this.clearChatOption)
            console.error("Clear Chat missing");
        if (!this.deleteChatOption)
            console.error("Delete Chat missing");
        if (!this.toggleViewLocationOption)
            console.error("Toggle View missing");
        if (!this.settingsOption)
            console.error("Settings missing");
        if (!this.menuDropdown)
            console.error("menuDropdown missing!");
        // --- Додаємо слухачі до ВСІХ елементів ---
        // Model
        if (this.modelSubmenuHeader) {
            this.registerListener(this.modelSubmenuHeader, "click", () => { this.toggleSubmenu(this.modelSubmenuHeader, this.modelSubmenuContent, "models"); });
        }
        // Role
        if (this.roleSubmenuHeader) {
            this.registerListener(this.roleSubmenuHeader, "click", () => { this.toggleSubmenu(this.roleSubmenuHeader, this.roleSubmenuContent, "roles"); });
        }
        // Chat
        if (this.chatSubmenuHeader) {
            this.registerListener(this.chatSubmenuHeader, "click", () => { if (this.chatSubmenuContent) {
                this.toggleSubmenu(this.chatSubmenuHeader, this.chatSubmenuContent, "chats");
            } });
        }
        // Actions
        if (this.newChatOption)
            this.registerListener(this.newChatOption, "click", this.view.handleNewChatClick);
        if (this.renameChatOption)
            this.registerListener(this.renameChatOption, "click", () => this.view.handleRenameChatClick());
        if (this.cloneChatOption)
            this.registerListener(this.cloneChatOption, "click", this.view.handleCloneChatClick);
        if (this.exportChatOption)
            this.registerListener(this.exportChatOption, "click", this.view.handleExportChatClick);
        if (this.clearChatOption)
            this.registerListener(this.clearChatOption, "click", this.view.handleClearChatClick);
        if (this.deleteChatOption)
            this.registerListener(this.deleteChatOption, "click", this.view.handleDeleteChatClick);
        if (this.toggleViewLocationOption)
            this.registerListener(this.toggleViewLocationOption, "click", this.view.handleToggleViewLocationClick);
        if (this.settingsOption)
            this.registerListener(this.settingsOption, "click", this.view.handleSettingsClick);
        // this.plugin.logger.error("[DropdownMenuManager] !!! FINISHED ATTACHING ALL EVENT LISTENERS !!!");
    }
    createActionItem(icon, text, cssClass) {
        const itemEl = this.menuDropdown.createEl("div", {
            cls: Array.isArray(cssClass) ? [CSS_CLASS_MENU_OPTION, ...cssClass] : [CSS_CLASS_MENU_OPTION, cssClass],
        });
        setIcon(itemEl.createSpan({ cls: "menu-option-icon" }), icon);
        itemEl.createSpan({ cls: "menu-option-text", text: text });
        return itemEl;
    }
    registerListener(element, type, handler) {
        const eventHandler = handler;
        element.addEventListener(type, eventHandler);
        this.listeners.push({ element, type, handler: eventHandler });
    }
    destroy() {
        this.listeners.forEach(({ element, type, handler }) => {
            element.removeEventListener(type, handler);
        });
        this.listeners = [];
    }
    // --- Menu Visibility and State ---
    isMenuOpen() {
        return !!this.menuDropdown && this.menuDropdown.style.display === "block";
    }
    toggleMenu(event) {
        event.stopPropagation();
        if (!this.menuDropdown) {
            console.error("[DropdownMenuManager] menuDropdown missing!");
            return;
        }
        const isHidden = this.menuDropdown.style.display === "none";
        if (isHidden) {
            this.menuDropdown.style.display = "block";
            this.collapseAllSubmenus(null);
        }
        else {
            this.closeMenu();
        }
    }
    closeMenu() {
        if (this.menuDropdown) {
            this.menuDropdown.style.display = "none";
            this.collapseAllSubmenus(null);
        }
    }
    handleDocumentClick(event, menuButton) {
        var _a;
        if (this.isMenuOpen() &&
            !(menuButton === null || menuButton === void 0 ? void 0 : menuButton.contains(event.target)) &&
            !((_a = this.menuDropdown) === null || _a === void 0 ? void 0 : _a.contains(event.target))) {
            this.closeMenu();
        }
    }
    toggleSubmenu(headerEl, contentEl, type) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!headerEl || !contentEl)
                return;
            const iconEl = headerEl.querySelector(`.${CSS_CLASS_SUBMENU_ICON}`);
            const isHidden = contentEl.style.maxHeight === "0px" || contentEl.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
            if (isHidden) {
                this.collapseAllSubmenus(contentEl);
            }
            if (isHidden) {
                if (iconEl instanceof HTMLElement)
                    setIcon(iconEl, "chevron-down");
                contentEl.empty();
                contentEl.createDiv({
                    cls: "menu-loading",
                    text: `Loading ${type}...`,
                });
                contentEl.classList.remove(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
                contentEl.style.maxHeight = "40px";
                contentEl.style.paddingTop = "5px";
                contentEl.style.paddingBottom = "5px";
                contentEl.style.overflowY = "hidden";
                try {
                    switch (type) {
                        case "models":
                            yield this.renderModelList();
                            break;
                        case "roles":
                            yield this.renderRoleList();
                            break;
                        case "chats":
                            yield this.renderChatListMenu();
                            break;
                    }
                    requestAnimationFrame(() => {
                        if (!contentEl.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
                            this.plugin.logger.trace(`[DropdownMenuManager] Setting submenu height for ${type}`);
                            if (type === "chats") {
                                contentEl.style.maxHeight = CHAT_LIST_MAX_HEIGHT;
                                contentEl.style.overflowY = "auto";
                            }
                            else {
                                contentEl.style.maxHeight = contentEl.scrollHeight + "px";
                                contentEl.style.overflowY = "hidden";
                            }
                        }
                    });
                }
                catch (error) {
                    this.plugin.logger.error(`[DropdownMenuManager] Error rendering ${type} list:`, error);
                    contentEl.empty();
                    contentEl.createDiv({ cls: "menu-error-text", text: `Error loading ${type}.` });
                    contentEl.style.maxHeight = "50px";
                    contentEl.style.overflowY = "hidden";
                }
            }
            else {
                contentEl.classList.add(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
                contentEl.style.maxHeight = "0";
                contentEl.style.paddingTop = "0";
                contentEl.style.paddingBottom = "0";
                contentEl.style.overflowY = "hidden";
                if (iconEl instanceof HTMLElement)
                    setIcon(iconEl, "chevron-right");
            }
        });
    }
    collapseAllSubmenus(exceptContent) {
        const submenus = [
            { header: this.modelSubmenuHeader, content: this.modelSubmenuContent },
            { header: this.roleSubmenuHeader, content: this.roleSubmenuContent },
            { header: this.chatSubmenuHeader, content: this.chatSubmenuContent },
        ];
        submenus.forEach(submenu => {
            if (submenu.content && submenu.header && submenu.content !== exceptContent) {
                if (!submenu.content.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
                    this.plugin.logger.trace(`[DropdownMenuManager] Collapsing submenu.`);
                    submenu.content.classList.add(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
                    submenu.content.style.maxHeight = "0";
                    submenu.content.style.paddingTop = "0";
                    submenu.content.style.paddingBottom = "0";
                    submenu.content.style.overflowY = "hidden";
                    const iconEl = submenu.header.querySelector(`.${CSS_CLASS_SUBMENU_ICON}`);
                    if (iconEl instanceof HTMLElement) {
                        setIcon(iconEl, "chevron-right");
                    }
                }
            }
        });
    }
    // --- List Rendering / Update ---
    renderModelList() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const container = this.modelSubmenuContent;
            if (!container)
                return;
            container.empty();
            const modelIconMap = { llama: "box-minimal", mistral: "wind" };
            const defaultIcon = "box";
            try {
                const models = yield this.plugin.ollamaService.getModels();
                const activeChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
                const currentModelName = ((_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.modelName) || this.plugin.settings.modelName;
                if (models.length === 0) {
                    container.createEl("div", { cls: "menu-info-text", text: "No models available." }); // Покращене повідомлення
                    return;
                }
                models.forEach(modelName => {
                    const optionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MODEL_OPTION}` });
                    const iconSpan = optionEl.createEl("span", { cls: "menu-option-icon" });
                    let iconToUse = defaultIcon;
                    if (modelName === currentModelName) {
                        iconToUse = "check";
                        optionEl.addClass("is-selected");
                    }
                    else {
                        const l = modelName.toLowerCase();
                        let f = false;
                        for (const k in modelIconMap) {
                            if (l.includes(k)) {
                                iconToUse = modelIconMap[k];
                                f = true;
                                break;
                            }
                        }
                        if (!f)
                            iconToUse = defaultIcon;
                    }
                    try {
                        setIcon(iconSpan, iconToUse);
                    }
                    catch (e) {
                        iconSpan.style.minWidth = "18px";
                    }
                    optionEl.createEl("span", { cls: "menu-option-text", text: modelName });
                    this.registerListener(optionEl, "click", () => __awaiter(this, void 0, void 0, function* () {
                        var _a, _b;
                        const latestChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
                        const latestModel = ((_b = latestChat === null || latestChat === void 0 ? void 0 : latestChat.metadata) === null || _b === void 0 ? void 0 : _b.modelName) || this.plugin.settings.modelName;
                        if (modelName !== latestModel) {
                            if (latestChat) {
                                yield this.plugin.chatManager.updateActiveChatMetadata({ modelName: modelName });
                            }
                            else {
                                new Notice("Cannot set model: No active chat.");
                            }
                        }
                        this.closeMenu();
                    }));
                });
            }
            catch (error) {
                this.plugin.logger.error("[DropdownMenuManager] Error rendering model list:", error);
                container.empty();
                container.createEl("div", { cls: "menu-error-text", text: "Error loading models." });
            }
        });
    }
    renderRoleList() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const container = this.roleSubmenuContent;
            if (!container)
                return;
            container.empty();
            try {
                const roles = yield this.plugin.listRoleFiles(true);
                const activeChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
                const currentChatRolePath = (_c = (_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.selectedRolePath) !== null && _c !== void 0 ? _c : this.plugin.settings.selectedRolePath;
                const noRoleOptionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}` });
                const noRoleIconSpan = noRoleOptionEl.createEl("span", { cls: "menu-option-icon" });
                if (!currentChatRolePath) {
                    setIcon(noRoleIconSpan, "check");
                    noRoleOptionEl.addClass("is-selected");
                }
                else {
                    setIcon(noRoleIconSpan, "slash");
                    noRoleIconSpan.style.minWidth = "18px";
                }
                noRoleOptionEl.createEl("span", { cls: "menu-option-text", text: "None" });
                this.registerListener(noRoleOptionEl, "click", () => __awaiter(this, void 0, void 0, function* () {
                    var _a, _b, _c, _d, _e;
                    const newRolePath = "";
                    const latestChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
                    const latestRolePath = (_c = (_b = latestChat === null || latestChat === void 0 ? void 0 : latestChat.metadata) === null || _b === void 0 ? void 0 : _b.selectedRolePath) !== null && _c !== void 0 ? _c : this.plugin.settings.selectedRolePath;
                    if (latestRolePath !== newRolePath) {
                        this.plugin.logger.trace(`Current path '${latestRolePath}', new path '${newRolePath}'`);
                        if (latestChat) {
                            yield this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath });
                        }
                        else {
                            this.plugin.settings.selectedRolePath = newRolePath;
                            yield this.plugin.saveSettings();
                            this.plugin.emit("role-changed", "None");
                            (_e = (_d = this.plugin.promptService) === null || _d === void 0 ? void 0 : _d.clearRoleCache) === null || _e === void 0 ? void 0 : _e.call(_d);
                        }
                    }
                    this.closeMenu();
                }));
                if (roles.length > 0)
                    container.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });
                roles.forEach(roleInfo => {
                    const roleOptionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}` });
                    if (roleInfo.isCustom)
                        roleOptionEl.addClass("is-custom");
                    const iconSpan = roleOptionEl.createEl("span", { cls: "menu-option-icon" });
                    if (roleInfo.path === currentChatRolePath) {
                        setIcon(iconSpan, "check");
                        roleOptionEl.addClass("is-selected");
                    }
                    else {
                        setIcon(iconSpan, roleInfo.isCustom ? "user" : "box");
                        iconSpan.style.minWidth = "18px";
                    }
                    roleOptionEl.createEl("span", { cls: "menu-option-text", text: roleInfo.name });
                    this.registerListener(roleOptionEl, "click", () => __awaiter(this, void 0, void 0, function* () {
                        var _a, _b, _c, _d, _e;
                        this.plugin.logger.debug(`[DropdownMenuManager] Role selected: ${roleInfo.name} (${roleInfo.path})`);
                        const newRolePath = roleInfo.path;
                        const latestChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
                        const latestRolePath = (_c = (_b = latestChat === null || latestChat === void 0 ? void 0 : latestChat.metadata) === null || _b === void 0 ? void 0 : _b.selectedRolePath) !== null && _c !== void 0 ? _c : this.plugin.settings.selectedRolePath;
                        if (latestRolePath !== newRolePath) {
                            this.plugin.logger.trace(`Current path '${latestRolePath}', new path '${newRolePath}'`);
                            if (latestChat) {
                                yield this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath });
                            }
                            else {
                                this.plugin.settings.selectedRolePath = newRolePath;
                                yield this.plugin.saveSettings();
                                this.plugin.emit("role-changed", roleInfo.name);
                                (_e = (_d = this.plugin.promptService) === null || _d === void 0 ? void 0 : _d.clearRoleCache) === null || _e === void 0 ? void 0 : _e.call(_d);
                            }
                        }
                        this.closeMenu();
                    }));
                });
            }
            catch (error) {
                this.plugin.logger.error("[DropdownMenuManager] Error rendering role list:", error);
                container.empty();
                container.createEl("div", { cls: "menu-error-text", text: "Error loading roles." });
            }
        });
    }
    renderChatListMenu() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const container = this.chatSubmenuContent;
            if (!container) {
                return;
            }
            container.empty();
            try {
                const chats = ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.listAvailableChats()) || [];
                const currentActiveId = (_b = this.plugin.chatManager) === null || _b === void 0 ? void 0 : _b.getActiveChatId();
                if (chats.length === 0) {
                    container.createEl("div", { cls: "menu-info-text", text: "No saved chats." });
                    return;
                }
                chats.forEach(chatMeta => {
                    const chatOptionEl = container.createDiv({
                        cls: [CSS_CLASS_MENU_OPTION, CSS_CLASS_CHAT_LIST_ITEM, CSS_CLASS_CHAT_OPTION],
                    });
                    const iconSpan = chatOptionEl.createEl("span", { cls: "menu-option-icon" });
                    if (chatMeta.id === currentActiveId) {
                        setIcon(iconSpan, "check");
                        chatOptionEl.addClass("is-selected");
                    }
                    else {
                        setIcon(iconSpan, "message-square");
                    }
                    const textSpan = chatOptionEl.createEl("span", { cls: "menu-option-text" });
                    textSpan.createEl("div", { cls: "chat-option-name", text: chatMeta.name });
                    const lastModifiedDate = new Date(chatMeta.lastModified);
                    const dateText = !isNaN(lastModifiedDate.getTime())
                        ? this.view.formatRelativeDate(lastModifiedDate)
                        : "Invalid date";
                    if (dateText === "Invalid date") {
                    }
                    textSpan.createEl("div", { cls: "chat-option-date", text: dateText });
                    this.registerListener(chatOptionEl, "click", () => __awaiter(this, void 0, void 0, function* () {
                        var _a;
                        this.plugin.logger.debug(`[DropdownMenuManager] Chat selected: ${chatMeta.name} (${chatMeta.id})`);
                        const latestActiveId = (_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChatId();
                        if (chatMeta.id !== latestActiveId) {
                            yield this.plugin.chatManager.setActiveChat(chatMeta.id);
                        }
                        this.closeMenu();
                    }));
                });
            }
            catch (error) {
                this.plugin.logger.error("[DropdownMenuManager] Error rendering chat list:", error);
                container.empty();
                container.createEl("div", { cls: "menu-error-text", text: "Error loading chats." });
            }
        });
    }
    // --- UI Updates ---
    updateToggleViewLocationOption() {
        if (!this.toggleViewLocationOption)
            return;
        // this.plugin.logger.trace("[DropdownMenuManager] Updating toggle view location option.");
        this.toggleViewLocationOption.empty();
        const iconSpan = this.toggleViewLocationOption.createSpan({ cls: "menu-option-icon" });
        const textSpan = this.toggleViewLocationOption.createSpan({ cls: "menu-option-text" });
        if (this.plugin.settings.openChatInTab) {
            setIcon(iconSpan, "sidebar-right");
            textSpan.setText("Show in Sidebar");
            this.toggleViewLocationOption.title = "Close tab and reopen in sidebar";
        }
        else {
            setIcon(iconSpan, "layout-list");
            textSpan.setText("Show in Tab");
            this.toggleViewLocationOption.title = "Close sidebar panel and reopen in tab";
        }
    }
    // --- Update Trigger Methods (Called by OllamaView) ---
    updateModelListIfVisible() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isMenuOpen() &&
                this.modelSubmenuContent &&
                !this.modelSubmenuContent.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
                yield this.renderModelList();
                this.updateSubmenuHeight(this.modelSubmenuContent);
            }
        });
    }
    updateRoleListIfVisible() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isMenuOpen() &&
                this.roleSubmenuContent &&
                !this.roleSubmenuContent.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
                yield this.renderRoleList();
                this.updateSubmenuHeight(this.roleSubmenuContent);
            }
        });
    }
    updateChatListIfVisible() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isMenuOpen() &&
                this.chatSubmenuContent &&
                !this.chatSubmenuContent.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
                yield this.renderChatListMenu();
            }
        });
    }
    updateSubmenuHeight(contentEl) {
        if (contentEl && !contentEl.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
            requestAnimationFrame(() => {
                if (contentEl && !contentEl.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
                    this.plugin.logger.trace("[DropdownMenuManager] Updating submenu height.");
                    if (!contentEl.classList.contains(CSS_CLASS_CHAT_LIST_CONTAINER)) {
                        contentEl.style.maxHeight = contentEl.scrollHeight + "px";
                    }
                }
            });
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRHJvcGRvd25NZW51TWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIkRyb3Bkb3duTWVudU1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLHlCQUF5QjtBQUN6QixPQUFPLEVBQU8sT0FBTyxFQUFFLE1BQU0sRUFBZ0MsTUFBTSxVQUFVLENBQUM7QUFPOUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUUxQyxzQkFBc0I7QUFDdEIsTUFBTSx1QkFBdUIsR0FBRyxlQUFlLENBQUM7QUFDaEQsTUFBTSxxQkFBcUIsR0FBRyxhQUFhLENBQUM7QUFDNUMsTUFBTSwwQkFBMEIsR0FBRyxrQkFBa0IsQ0FBQztBQUN0RCxNQUFNLHNCQUFzQixHQUFHLGNBQWMsQ0FBQztBQUM5QyxNQUFNLHlCQUF5QixHQUFHLGlCQUFpQixDQUFDO0FBQ3BELE1BQU0seUJBQXlCLEdBQUcsaUJBQWlCLENBQUM7QUFDcEQsTUFBTSx3QkFBd0IsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLDJCQUEyQjtBQUM5RSxNQUFNLDJCQUEyQixHQUFHLG1CQUFtQixDQUFDO0FBQ3hELE1BQU0sNEJBQTRCLEdBQUcsb0JBQW9CLENBQUM7QUFDMUQsTUFBTSxzQkFBc0IsR0FBRyxjQUFjLENBQUM7QUFDOUMsTUFBTSw4QkFBOEIsR0FBRyxzQkFBc0IsQ0FBQztBQUM5RCxNQUFNLHFCQUFxQixHQUFHLGFBQWEsQ0FBQztBQUM1QyxNQUFNLDZCQUE2QixHQUFHLHFCQUFxQixDQUFDO0FBQzVELE1BQU0scUJBQXFCLEdBQUcsYUFBYSxDQUFDO0FBQzVDLE1BQU0sNkJBQTZCLEdBQUcscUJBQXFCLENBQUM7QUFDNUQsTUFBTSw4QkFBOEIsR0FBRyxzQkFBc0IsQ0FBQztBQUM5RCxNQUFNLHFCQUFxQixHQUFHLGFBQWEsQ0FBQztBQUM1QyxNQUFNLHlCQUF5QixHQUFHLGlCQUFpQixDQUFDO0FBQ3BELE1BQU0sNEJBQTRCLEdBQUcsb0JBQW9CLENB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QyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUN0RCxDQUFDO1FBQ0wsQ0FBQztLQUFBO0lBRVksdUJBQXVCOztZQUNoQyxJQUNJLElBQUksQ0FBQyxVQUFVLEVBQUU7Z0JBQ2pCLElBQUksQ0FBQyxrQkFBa0I7Z0JBQ3ZCLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLHNCQUFzQixDQUFDLEVBQ2pGLENBQUM7Z0JBRUMsTUFBTSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUNwQyxDQUFDO1FBQ0wsQ0FBQztLQUFBO0lBRU8sbUJBQW1CLENBQUMsU0FBNkI7UUFDckQsSUFBSSxTQUFTLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsRUFBRSxDQUFDO1lBQ2pGLHFCQUFxQixDQUFDLEdBQUcsRUFBRTtnQkFDdkIsSUFBSSxTQUFTLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsRUFBRSxDQUFDO29CQUNqRixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0RBQWdELENBQUMsQ0FBQztvQkFDM0UsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLDZCQUE2QixDQUFDLEVBQUUsQ0FBQzt3QkFDL0QsU0FBUyxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUM7b0JBQzlELENBQUM7Z0JBQ0wsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztJQUNMLENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbIi8vIERyb3Bkb3duTWVudU1hbmFnZXIudHNcbmltcG9ydCB7IEFwcCwgc2V0SWNvbiwgTm90aWNlLCBNZW51LCBURm9sZGVyLCBub3JtYWxpemVQYXRoIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgT2xsYW1hUGx1Z2luIGZyb20gXCIuL21haW5cIjtcbmltcG9ydCB7IE9sbGFtYVZpZXcgfSBmcm9tIFwiLi9PbGxhbWFWaWV3XCI7XG5pbXBvcnQgeyBSb2xlSW5mbyB9IGZyb20gXCIuL0NoYXRNYW5hZ2VyXCI7XG5pbXBvcnQgeyBDaGF0TWV0YWRhdGEgfSBmcm9tIFwiLi9DaGF0XCI7XG5pbXBvcnQgeyBDb25maXJtTW9kYWwgfSBmcm9tIFwiLi9Db25maXJtTW9kYWxcIjtcbmltcG9ydCB7IFByb21wdE1vZGFsIH0gZnJvbSBcIi4vUHJvbXB0TW9kYWxcIjtcbmltcG9ydCB7IENTU19DTEFTU0VTIH0gZnJvbSBcIi4vY29uc3RhbnRzXCI7XG5cbi8vIC0tLSBDU1MgQ2xhc3NlcyAtLS1cbmNvbnN0IENTU19DTEFTU19NRU5VX0RST1BET1dOID0gXCJtZW51LWRyb3Bkb3duXCI7XG5jb25zdCBDU1NfQ0xBU1NfTUVOVV9PUFRJT04gPSBcIm1lbnUtb3B0aW9uXCI7XG5jb25zdCBDU1NfQ0xBU1NfTUVOVV9IRUFERVJfSVRFTSA9IFwibWVudS1oZWFkZXItaXRlbVwiO1xuY29uc3QgQ1NTX0NMQVNTX1NVQk1FTlVfSUNPTiA9IFwic3VibWVudS1pY29uXCI7XG5jb25zdCBDU1NfQ0xBU1NfU1VCTUVOVV9DT05URU5UID0gXCJzdWJtZW51LWNvbnRlbnRcIjtcbmNvbnN0IENTU19DTEFTU19TRVRUSU5HU19PUFRJT04gPSBcInNldHRpbmdzLW9wdGlvblwiO1xuY29uc3QgQ1NTX0NMQVNTX01FTlVfU0VQQVJBVE9SID0gXCJtZW51LXNlcGFyYXRvclwiOyAvLyDQkdCw0LfQvtCy0LjQuSDQutC70LDRgSDRgNC+0LfQtNGW0LvRjNC90LjQutCwXG5jb25zdCBDU1NfQ0xBU1NfQ0xFQVJfQ0hBVF9PUFRJT04gPSBcImNsZWFyLWNoYXQtb3B0aW9uXCI7XG5jb25zdCBDU1NfQ0xBU1NfRVhQT1JUX0NIQVRfT1BUSU9OID0gXCJleHBvcnQtY2hhdC1vcHRpb25cIjtcbmNvbnN0IENTU19DTEFTU19NT0RFTF9PUFRJT04gPSBcIm1vZGVsLW9wdGlvblwiO1xuY29uc3QgQ1NTX0NMQVNTX01PREVMX0xJU1RfQ09OVEFJTkVSID0gXCJtb2RlbC1saXN0LWNvbnRhaW5lclwiO1xuY29uc3QgQ1NTX0NMQVNTX1JPTEVfT1BUSU9OID0gXCJyb2xlLW9wdGlvblwiO1xuY29uc3QgQ1NTX0NMQVNTX1JPTEVfTElTVF9DT05UQUlORVIgPSBcInJvbGUtbGlzdC1jb250YWluZXJcIjtcbmNvbnN0IENTU19DTEFTU19DSEFUX09QVElPTiA9IFwiY2hhdC1vcHRpb25cIjtcbmNvbnN0IENTU19DTEFTU19DSEFUX0xJU1RfQ09OVEFJTkVSID0gXCJjaGF0LWxpc3QtY29udGFpbmVyXCI7XG5jb25zdCBDU1NfQ0xBU1NfQ0hBVF9MSVNUX1NDUk9MTEFCTEUgPSBcImNoYXQtbGlzdC1zY3JvbGxhYmxlXCI7XG5jb25zdCBDU1NfQ0xBU1NfTUVOVV9IRUFERVIgPSBcIm1lbnUtaGVhZGVyXCI7XG5jb25zdCBDU1NfQ0xBU1NfTkVXX0NIQVRfT1BUSU9OID0gXCJuZXctY2hhdC1vcHRpb25cIjtcbmNvbnN0IENTU19DTEFTU19SRU5BTUVfQ0hBVF9PUFRJT04gPSBcInJlbmFtZS1jaGF0LW9wdGlvblwiO1xuY29uc3QgQ1NTX0NMQVNTX0RFTEVURV9DSEFUX09QVElPTiA9IFwiZGVsZXRlLWNoYXQtb3B0aW9uXCI7XG5jb25zdCBDU1NfQ0xBU1NfQ0xPTkVfQ0hBVF9PUFRJT04gPSBcImNsb25lLWNoYXQtb3B0aW9uXCI7XG5jb25zdCBDU1NfQ0xBU1NfVE9HR0xFX1ZJRVdfTE9DQVRJT04gPSBcInRvZ2dsZS12aWV3LWxvY2F0aW9uLW9wdGlvblwiO1xuY29uc3QgQ1NTX0NMQVNTX0NIQVRfTElTVF9JVEVNID0gXCJvbGxhbWEtY2hhdC1saXN0LWl0ZW1cIjtcblxuLy8g0KPQvdGW0LrQsNC70YzQvdGWINC60LvQsNGB0Lgg0LTQu9GPINGA0L7Qt9C00ZbQu9GM0L3QuNC60ZbQslxuY29uc3QgQ1NTX0hSX0FGVEVSX01PREVMID0gXCJoci1hZnRlci1tb2RlbFwiO1xuY29uc3QgQ1NTX0hSX0FGVEVSX1JPTEUgPSBcImhyLWFmdGVyLXJvbGVcIjtcbmNvbnN0IENTU19IUl9BRlRFUl9DSEFUID0gXCJoci1hZnRlci1jaGF0XCI7XG5jb25zdCBDU1NfSFJfQUZURVJfQUNUSU9OUyA9IFwiaHItYWZ0ZXItYWN0aW9uc1wiOyAvLyDQn9GW0YHQu9GPINC+0YHQvdC+0LLQvdC40YUg0LTRltC5XG5jb25zdCBDU1NfSFJfQUZURVJfREFOR0VSID0gXCJoci1hZnRlci1kYW5nZXJcIjsgICAvLyDQn9GW0YHQu9GPINC90LXQsdC10LfQv9C10YfQvdC40YUg0LTRltC5XG5jb25zdCBDU1NfSFJfQUZURVJfVE9HR0xFID0gXCJoci1hZnRlci10b2dnbGVcIjsgLy8g0J/RltGB0LvRjyDQv9C10YDQtdC80LjQutCw0YfQsFxuXG5jb25zdCBDSEFUX0xJU1RfTUFYX0hFSUdIVCA9IFwiMjUwcHhcIjtcblxuZXhwb3J0IGNsYXNzIERyb3Bkb3duTWVudU1hbmFnZXIge1xuICAgIHByaXZhdGUgcGx1Z2luOiBPbGxhbWFQbHVnaW47XG4gICAgcHJpdmF0ZSBhcHA6IEFwcDtcbiAgICBwcml2YXRlIHZpZXc6IE9sbGFtYVZpZXc7XG4gICAgcHJpdmF0ZSBwYXJlbnRFbGVtZW50OiBIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIGlzU2lkZWJhckxvY2F0aW9uOiBib29sZWFuO1xuICAgIHByaXZhdGUgaXNEZXNrdG9wOiBib29sZWFuO1xuXG4gICAgLy8gVUkgRWxlbWVudHMgKNCe0LPQvtC70L7RiNGD0ZTQvNC+INCy0YHRlilcbiAgICBwcml2YXRlIG1lbnVEcm9wZG93biE6IEhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgbW9kZWxTdWJtZW51SGVhZGVyITogSFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBtb2RlbFN1Ym1lbnVDb250ZW50ITogSFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSByb2xlU3VibWVudUhlYWRlciE6IEhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgcm9sZVN1Ym1lbnVDb250ZW50ITogSFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBzZXR0aW5nc09wdGlvbiE6IEhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgY2hhdFN1Ym1lbnVIZWFkZXIhOiBIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIGNoYXRTdWJtZW51Q29udGVudCE6IEhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgbmV3Q2hhdE9wdGlvbiE6IEhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgcmVuYW1lQ2hhdE9wdGlvbiE6IEhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgY2xvbmVDaGF0T3B0aW9uITogSFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBjbGVhckNoYXRPcHRpb24hOiBIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIGV4cG9ydENoYXRPcHRpb24hOiBIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIGRlbGV0ZUNoYXRPcHRpb24hOiBIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIHRvZ2dsZVZpZXdMb2NhdGlvbk9wdGlvbiE6IEhUTUxFbGVtZW50O1xuXG4gICAgcHJpdmF0ZSBsaXN0ZW5lcnM6IHsgZWxlbWVudDogSFRNTEVsZW1lbnQgfCBEb2N1bWVudDsgdHlwZTogc3RyaW5nOyBoYW5kbGVyOiAoZTogYW55KSA9PiB2b2lkIH1bXSA9IFtdO1xuXG4gICAgY29uc3RydWN0b3IocGx1Z2luOiBPbGxhbWFQbHVnaW4sIGFwcDogQXBwLCB2aWV3OiBPbGxhbWFWaWV3LCBwYXJlbnRFbGVtZW50OiBIVE1MRWxlbWVudCwgaXNTaWRlYmFyTG9jYXRpb246IGJvb2xlYW4sIGlzRGVza3RvcDogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgICAgICAgdGhpcy5hcHAgPSBhcHA7XG4gICAgICAgIHRoaXMudmlldyA9IHZpZXc7XG4gICAgICAgIHRoaXMucGFyZW50RWxlbWVudCA9IHBhcmVudEVsZW1lbnQ7XG4gICAgICAgIHRoaXMuaXNTaWRlYmFyTG9jYXRpb24gPSBpc1NpZGViYXJMb2NhdGlvbjtcbiAgICAgICAgdGhpcy5pc0Rlc2t0b3AgPSBpc0Rlc2t0b3A7XG4gICAgICAgIFxuICAgIH1cblxuICAgIC8vIC0tLSDQntCh0J3QntCS0J3QmNCZINCc0JXQotCe0JQg0KHQotCS0J7QoNCV0J3QndCvINCc0JXQndCuINCXINCa0JvQkNCh0JDQnNCYINCU0JvQryDQoNCe0JfQlNCG0JvQrNCd0JjQmtCG0JIgLS0tXG4gICAgcHVibGljIGNyZWF0ZU1lbnVVSSgpOiB2b2lkIHtcbiAgICAgICAgXG4gICAgICAgIHRoaXMubWVudURyb3Bkb3duID0gdGhpcy5wYXJlbnRFbGVtZW50LmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBbQ1NTX0NMQVNTX01FTlVfRFJPUERPV04sIFwib2xsYW1hLWNoYXQtbWVudVwiXSB9KTtcbiAgICAgICAgdGhpcy5tZW51RHJvcGRvd24uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuXG4gICAgICAgIC8vINCU0L7QtNCw0ZTQvNC+INC60L7QvdGC0LXQutGB0YLQvdGWINC60LvQsNGB0Lgg0LTQviDQs9C+0LvQvtCy0L3QvtCz0L4g0LrQvtC90YLQtdC50L3QtdGA0LAg0LzQtdC90Y5cbiAgICAgICAgdGhpcy5tZW51RHJvcGRvd24uY2xhc3NMaXN0LnRvZ2dsZSgnaXMtZGVza3RvcCcsIHRoaXMuaXNEZXNrdG9wKTtcbiAgICAgICAgdGhpcy5tZW51RHJvcGRvd24uY2xhc3NMaXN0LnRvZ2dsZSgnaXMtbW9iaWxlLXRhYmxldCcsICF0aGlzLmlzRGVza3RvcCk7XG4gICAgICAgIHRoaXMubWVudURyb3Bkb3duLmNsYXNzTGlzdC50b2dnbGUoJ2lzLXNpZGViYXItbG9jYXRpb24nLCB0aGlzLmlzU2lkZWJhckxvY2F0aW9uKTtcbiAgICAgICAgdGhpcy5tZW51RHJvcGRvd24uY2xhc3NMaXN0LnRvZ2dsZSgnaXMtdGFiLWxvY2F0aW9uJywgIXRoaXMuaXNTaWRlYmFyTG9jYXRpb24pO1xuICAgICAgICBcblxuICAgICAgICAvLyAtLS0g0KHRgtCy0L7RgNGO0ZTQvNC+INCS0KHQhiDRgdC10LrRhtGW0Zcg0YLQsCDQtdC70LXQvNC10L3RgtC4INCX0JDQktCW0JTQmCAtLS1cblxuICAgICAgICAvLyBNb2RlbCBTZWN0aW9uXG4gICAgICAgIGNvbnN0IG1vZGVsU2VjdGlvbiA9IHRoaXMuY3JlYXRlU3VibWVudVNlY3Rpb24oXCJTZWxlY3QgTW9kZWxcIiwgXCJsaXN0LWNvbGxhcHNlXCIsIENTU19DTEFTU19NT0RFTF9MSVNUX0NPTlRBSU5FUiwgXCJtb2RlbC1zdWJtZW51LXNlY3Rpb25cIik7XG4gICAgICAgIHRoaXMubW9kZWxTdWJtZW51SGVhZGVyID0gbW9kZWxTZWN0aW9uLmhlYWRlcjsgdGhpcy5tb2RlbFN1Ym1lbnVDb250ZW50ID0gbW9kZWxTZWN0aW9uLmNvbnRlbnQ7XG4gICAgICAgIHRoaXMubWVudURyb3Bkb3duLmNyZWF0ZUVsKFwiaHJcIiwgeyBjbHM6IFtDU1NfQ0xBU1NfTUVOVV9TRVBBUkFUT1IsIENTU19IUl9BRlRFUl9NT0RFTF0gfSk7IC8vIDwtLS0g0JrQu9Cw0YEgSFJcblxuICAgICAgICAvLyBSb2xlIFNlY3Rpb25cbiAgICAgICAgY29uc3Qgcm9sZURyb3Bkb3duU2VjdGlvbiA9IHRoaXMuY3JlYXRlU3VibWVudVNlY3Rpb24oXCJTZWxlY3QgUm9sZVwiLCBcInVzZXJzXCIsIENTU19DTEFTU19ST0xFX0xJU1RfQ09OVEFJTkVSLCBcInJvbGUtc3VibWVudS1zZWN0aW9uXCIpO1xuICAgICAgICB0aGlzLnJvbGVTdWJtZW51SGVhZGVyID0gcm9sZURyb3Bkb3duU2VjdGlvbi5oZWFkZXI7IHRoaXMucm9sZVN1Ym1lbnVDb250ZW50ID0gcm9sZURyb3Bkb3duU2VjdGlvbi5jb250ZW50O1xuICAgICAgICB0aGlzLm1lbnVEcm9wZG93bi5jcmVhdGVFbChcImhyXCIsIHsgY2xzOiBbQ1NTX0NMQVNTX01FTlVfU0VQQVJBVE9SLCBDU1NfSFJfQUZURVJfUk9MRV0gfSk7IC8vIDwtLS0g0JrQu9Cw0YEgSFJcblxuICAgICAgICAvLyBDaGF0IFNlY3Rpb25cbiAgICAgICAgY29uc3QgY2hhdERyb3Bkb3duU2VjdGlvbiA9IHRoaXMuY3JlYXRlU3VibWVudVNlY3Rpb24oXCJMb2FkIENoYXRcIiwgXCJtZXNzYWdlcy1zcXVhcmVcIiwgQ1NTX0NMQVNTX0NIQVRfTElTVF9DT05UQUlORVIsIFwiY2hhdC1zdWJtZW51LXNlY3Rpb25cIik7XG4gICAgICAgIHRoaXMuY2hhdFN1Ym1lbnVIZWFkZXIgPSBjaGF0RHJvcGRvd25TZWN0aW9uLmhlYWRlcjsgdGhpcy5jaGF0U3VibWVudUNvbnRlbnQgPSBjaGF0RHJvcGRvd25TZWN0aW9uLmNvbnRlbnQ7XG4gICAgICAgIHRoaXMubWVudURyb3Bkb3duLmNyZWF0ZUVsKFwiaHJcIiwgeyBjbHM6IFtDU1NfQ0xBU1NfTUVOVV9TRVBBUkFUT1IsIENTU19IUl9BRlRFUl9DSEFUXSB9KTsgLy8gPC0tLSDQmtC70LDRgSBIUlxuXG4gICAgICAgIC8vIENoYXQgQWN0aW9ucyBHcm91cFxuICAgICAgICB0aGlzLm5ld0NoYXRPcHRpb24gPSB0aGlzLmNyZWF0ZUFjdGlvbkl0ZW0oXCJwbHVzLWNpcmNsZVwiLCBcIk5ldyBDaGF0XCIsIENTU19DTEFTU19ORVdfQ0hBVF9PUFRJT04pO1xuICAgICAgICB0aGlzLnJlbmFtZUNoYXRPcHRpb24gPSB0aGlzLmNyZWF0ZUFjdGlvbkl0ZW0oXCJwZW5jaWxcIiwgXCJSZW5hbWUgQ2hhdFwiLCBDU1NfQ0xBU1NfUkVOQU1FX0NIQVRfT1BUSU9OKTtcbiAgICAgICAgdGhpcy5jbG9uZUNoYXRPcHRpb24gPSB0aGlzLmNyZWF0ZUFjdGlvbkl0ZW0oXCJjb3B5LXBsdXNcIiwgXCJDbG9uZSBDaGF0XCIsIENTU19DTEFTU19DTE9ORV9DSEFUX09QVElPTik7XG4gICAgICAgIHRoaXMuZXhwb3J0Q2hhdE9wdGlvbiA9IHRoaXMuY3JlYXRlQWN0aW9uSXRlbShcImRvd25sb2FkXCIsIFwiRXhwb3J0IENoYXQgdG8gTm90ZVwiLCBDU1NfQ0xBU1NfRVhQT1JUX0NIQVRfT1BUSU9OKTtcbiAgICAgICAgLy8g0KDQvtC30LTRltC70YzQvdC40Log0L/RltGB0LvRjyDQntCh0KLQkNCd0J3QrNCe0JPQniDQtdC70LXQvNC10L3RgtCwINCz0YDRg9C/0LhcbiAgICAgICAgdGhpcy5tZW51RHJvcGRvd24uY3JlYXRlRWwoXCJoclwiLCB7IGNsczogW0NTU19DTEFTU19NRU5VX1NFUEFSQVRPUiwgQ1NTX0hSX0FGVEVSX0FDVElPTlNdIH0pOyAvLyA8LS0tINCa0LvQsNGBIEhSXG5cbiAgICAgICAgLy8gRGFuZ2VyIEFjdGlvbnMgR3JvdXBcbiAgICAgICAgdGhpcy5jbGVhckNoYXRPcHRpb24gPSB0aGlzLmNyZWF0ZUFjdGlvbkl0ZW0oXCJ0cmFzaFwiLCBcIkNsZWFyIE1lc3NhZ2VzXCIsIFtDU1NfQ0xBU1NfQ0xFQVJfQ0hBVF9PUFRJT04sIENTU19DTEFTU0VTLkRBTkdFUl9PUFRJT05dKTtcbiAgICAgICAgdGhpcy5kZWxldGVDaGF0T3B0aW9uID0gdGhpcy5jcmVhdGVBY3Rpb25JdGVtKFwidHJhc2gtMlwiLCBcIkRlbGV0ZSBDaGF0XCIsIFtDU1NfQ0xBU1NfREVMRVRFX0NIQVRfT1BUSU9OLCBDU1NfQ0xBU1NFUy5EQU5HRVJfT1BUSU9OXSk7XG4gICAgICAgICAvLyDQoNC+0LfQtNGW0LvRjNC90LjQuiDQv9GW0YHQu9GPINCe0KHQotCQ0J3QndCs0J7Qk9CeINC10LvQtdC80LXQvdGC0LAg0LPRgNGD0L/QuFxuICAgICAgICB0aGlzLm1lbnVEcm9wZG93bi5jcmVhdGVFbChcImhyXCIsIHsgY2xzOiBbQ1NTX0NMQVNTX01FTlVfU0VQQVJBVE9SLCBDU1NfSFJfQUZURVJfREFOR0VSXSB9KTsgLy8gPC0tLSDQmtC70LDRgSBIUlxuXG4gICAgICAgIC8vIFRvZ2dsZSBWaWV3IExvY2F0aW9uXG4gICAgICAgIHRoaXMudG9nZ2xlVmlld0xvY2F0aW9uT3B0aW9uID0gdGhpcy5tZW51RHJvcGRvd24uY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IGAke0NTU19DTEFTU19NRU5VX09QVElPTn0gJHtDU1NfQ0xBU1NfVE9HR0xFX1ZJRVdfTE9DQVRJT059YCB9KTtcbiAgICAgICAgdGhpcy51cGRhdGVUb2dnbGVWaWV3TG9jYXRpb25PcHRpb24oKTtcbiAgICAgICAgdGhpcy5tZW51RHJvcGRvd24uY3JlYXRlRWwoXCJoclwiLCB7IGNsczogW0NTU19DTEFTU19NRU5VX1NFUEFSQVRPUiwgQ1NTX0hSX0FGVEVSX1RPR0dMRV0gfSk7IC8vIDwtLS0g0JrQu9Cw0YEgSFJcblxuICAgICAgICAvLyBTZXR0aW5nc1xuICAgICAgICB0aGlzLnNldHRpbmdzT3B0aW9uID0gdGhpcy5jcmVhdGVBY3Rpb25JdGVtKFwic2V0dGluZ3NcIiwgXCJTZXR0aW5nc1wiLCBDU1NfQ0xBU1NfU0VUVElOR1NfT1BUSU9OKTtcbiAgICAgICAgLy8g0KDQvtC30LTRltC70YzQvdC40Log0L/RltGB0LvRjyBTZXR0aW5ncyDQvdC1INC/0L7RgtGA0ZbQsdC10L1cblxuICAgICAgICBcbiAgICB9XG5cbiAgICAvLyBhdHRhY2hFdmVudExpc3RlbmVycyDQt9Cw0LvQuNGI0LDRlNGC0YzRgdGPINGC0LDQutC40LwsINGP0Log0YMg0L/QvtC/0LXRgNC10LTQvdGW0Lkg0LLRltC00L/QvtCy0ZbQtNGWICjQtNC+0LTQsNGUINGB0LvRg9GF0LDRh9GWINC00L4g0LLRgdGW0YUpXG4gICAgcHVibGljIGF0dGFjaEV2ZW50TGlzdGVuZXJzKCk6IHZvaWQge1xuICAgICAgICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtEcm9wZG93bk1lbnVNYW5hZ2VyXSAhISEgQVRUQUNISU5HIEFMTCBQT1RFTlRJQUwgRVZFTlQgTElTVEVORVJTIChWaXNpYmlsaXR5IGNvbnRyb2xsZWQgYnkgQ1NTKSAhISFgKTtcbiAgICAgICAgLy8gLS0tIE51bGwgQ2hlY2tzIC0tLVxuICAgICAgICBpZiAoIXRoaXMubW9kZWxTdWJtZW51SGVhZGVyKSBjb25zb2xlLmVycm9yKFwiTW9kZWwgaGVhZGVyIG1pc3NpbmdcIik7XG4gICAgICAgICBpZiAoIXRoaXMucm9sZVN1Ym1lbnVIZWFkZXIpIGNvbnNvbGUuZXJyb3IoXCJSb2xlIGhlYWRlciBtaXNzaW5nXCIpO1xuICAgICAgICAgaWYgKCF0aGlzLmNoYXRTdWJtZW51SGVhZGVyKSBjb25zb2xlLmVycm9yKFwiQ2hhdCBoZWFkZXIgbWlzc2luZ1wiKTtcbiAgICAgICAgIGlmICghdGhpcy5uZXdDaGF0T3B0aW9uKSBjb25zb2xlLmVycm9yKFwiTmV3IENoYXQgbWlzc2luZ1wiKTtcbiAgICAgICAgIGlmICghdGhpcy5yZW5hbWVDaGF0T3B0aW9uKSBjb25zb2xlLmVycm9yKFwiUmVuYW1lIENoYXQgbWlzc2luZ1wiKTtcbiAgICAgICAgIGlmICghdGhpcy5jbG9uZUNoYXRPcHRpb24pIGNvbnNvbGUuZXJyb3IoXCJDbG9uZSBDaGF0IG1pc3NpbmdcIik7XG4gICAgICAgICBpZiAoIXRoaXMuZXhwb3J0Q2hhdE9wdGlvbikgY29uc29sZS5lcnJvcihcIkV4cG9ydCBDaGF0IG1pc3NpbmdcIik7XG4gICAgICAgICBpZiAoIXRoaXMuY2xlYXJDaGF0T3B0aW9uKSBjb25zb2xlLmVycm9yKFwiQ2xlYXIgQ2hhdCBtaXNzaW5nXCIpO1xuICAgICAgICAgaWYgKCF0aGlzLmRlbGV0ZUNoYXRPcHRpb24pIGNvbnNvbGUuZXJyb3IoXCJEZWxldGUgQ2hhdCBtaXNzaW5nXCIpO1xuICAgICAgICAgaWYgKCF0aGlzLnRvZ2dsZVZpZXdMb2NhdGlvbk9wdGlvbikgY29uc29sZS5lcnJvcihcIlRvZ2dsZSBWaWV3IG1pc3NpbmdcIik7XG4gICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3NPcHRpb24pIGNvbnNvbGUuZXJyb3IoXCJTZXR0aW5ncyBtaXNzaW5nXCIpO1xuICAgICAgICAgaWYgKCF0aGlzLm1lbnVEcm9wZG93bikgY29uc29sZS5lcnJvcihcIm1lbnVEcm9wZG93biBtaXNzaW5nIVwiKTtcblxuICAgICAgICAvLyAtLS0g0JTQvtC00LDRlNC80L4g0YHQu9GD0YXQsNGH0ZYg0LTQviDQktCh0IbQpSDQtdC70LXQvNC10L3RgtGW0LIgLS0tXG4gICAgICAgIC8vIE1vZGVsXG4gICAgICAgIGlmICh0aGlzLm1vZGVsU3VibWVudUhlYWRlcikge1xuICAgICAgICAgICAgdGhpcy5yZWdpc3Rlckxpc3RlbmVyKHRoaXMubW9kZWxTdWJtZW51SGVhZGVyLCBcImNsaWNrXCIsICgpID0+IHsgdGhpcy50b2dnbGVTdWJtZW51KHRoaXMubW9kZWxTdWJtZW51SGVhZGVyLCB0aGlzLm1vZGVsU3VibWVudUNvbnRlbnQsIFwibW9kZWxzXCIpOyB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBSb2xlXG4gICAgICAgIGlmICh0aGlzLnJvbGVTdWJtZW51SGVhZGVyKSB7XG4gICAgICAgICAgICB0aGlzLnJlZ2lzdGVyTGlzdGVuZXIodGhpcy5yb2xlU3VibWVudUhlYWRlciwgXCJjbGlja1wiLCAoKSA9PiB7IHRoaXMudG9nZ2xlU3VibWVudSh0aGlzLnJvbGVTdWJtZW51SGVhZGVyLCB0aGlzLnJvbGVTdWJtZW51Q29udGVudCwgXCJyb2xlc1wiKTsgfSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2hhdFxuICAgICAgICBpZiAodGhpcy5jaGF0U3VibWVudUhlYWRlcikge1xuICAgICAgICAgICAgdGhpcy5yZWdpc3Rlckxpc3RlbmVyKHRoaXMuY2hhdFN1Ym1lbnVIZWFkZXIsIFwiY2xpY2tcIiwgKCkgPT4geyBpZiAodGhpcy5jaGF0U3VibWVudUNvbnRlbnQpIHsgdGhpcy50b2dnbGVTdWJtZW51KHRoaXMuY2hhdFN1Ym1lbnVIZWFkZXIsIHRoaXMuY2hhdFN1Ym1lbnVDb250ZW50LCBcImNoYXRzXCIpOyB9IH0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIEFjdGlvbnNcbiAgICAgICAgaWYgKHRoaXMubmV3Q2hhdE9wdGlvbikgdGhpcy5yZWdpc3Rlckxpc3RlbmVyKHRoaXMubmV3Q2hhdE9wdGlvbiwgXCJjbGlja1wiLCB0aGlzLnZpZXcuaGFuZGxlTmV3Q2hhdENsaWNrKTtcbiAgICAgICAgaWYgKHRoaXMucmVuYW1lQ2hhdE9wdGlvbikgdGhpcy5yZWdpc3Rlckxpc3RlbmVyKHRoaXMucmVuYW1lQ2hhdE9wdGlvbiwgXCJjbGlja1wiLCAoKSA9PiB0aGlzLnZpZXcuaGFuZGxlUmVuYW1lQ2hhdENsaWNrKCkpO1xuICAgICAgICBpZiAodGhpcy5jbG9uZUNoYXRPcHRpb24pIHRoaXMucmVnaXN0ZXJMaXN0ZW5lcih0aGlzLmNsb25lQ2hhdE9wdGlvbiwgXCJjbGlja1wiLCB0aGlzLnZpZXcuaGFuZGxlQ2xvbmVDaGF0Q2xpY2spO1xuICAgICAgICBpZiAodGhpcy5leHBvcnRDaGF0T3B0aW9uKSB0aGlzLnJlZ2lzdGVyTGlzdGVuZXIodGhpcy5leHBvcnRDaGF0T3B0aW9uLCBcImNsaWNrXCIsIHRoaXMudmlldy5oYW5kbGVFeHBvcnRDaGF0Q2xpY2spO1xuICAgICAgICBpZiAodGhpcy5jbGVhckNoYXRPcHRpb24pIHRoaXMucmVnaXN0ZXJMaXN0ZW5lcih0aGlzLmNsZWFyQ2hhdE9wdGlvbiwgXCJjbGlja1wiLCB0aGlzLnZpZXcuaGFuZGxlQ2xlYXJDaGF0Q2xpY2spO1xuICAgICAgICBpZiAodGhpcy5kZWxldGVDaGF0T3B0aW9uKSB0aGlzLnJlZ2lzdGVyTGlzdGVuZXIodGhpcy5kZWxldGVDaGF0T3B0aW9uLCBcImNsaWNrXCIsIHRoaXMudmlldy5oYW5kbGVEZWxldGVDaGF0Q2xpY2spO1xuICAgICAgICBpZiAodGhpcy50b2dnbGVWaWV3TG9jYXRpb25PcHRpb24pIHRoaXMucmVnaXN0ZXJMaXN0ZW5lcih0aGlzLnRvZ2dsZVZpZXdMb2NhdGlvbk9wdGlvbiwgXCJjbGlja1wiLCB0aGlzLnZpZXcuaGFuZGxlVG9nZ2xlVmlld0xvY2F0aW9uQ2xpY2spO1xuICAgICAgICBpZiAodGhpcy5zZXR0aW5nc09wdGlvbikgdGhpcy5yZWdpc3Rlckxpc3RlbmVyKHRoaXMuc2V0dGluZ3NPcHRpb24sIFwiY2xpY2tcIiwgdGhpcy52aWV3LmhhbmRsZVNldHRpbmdzQ2xpY2spO1xuXG4gICAgICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIltEcm9wZG93bk1lbnVNYW5hZ2VyXSAhISEgRklOSVNIRUQgQVRUQUNISU5HIEFMTCBFVkVOVCBMSVNURU5FUlMgISEhXCIpO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBjcmVhdGVBY3Rpb25JdGVtKGljb246IHN0cmluZywgdGV4dDogc3RyaW5nLCBjc3NDbGFzczogc3RyaW5nIHwgc3RyaW5nW10pOiBIVE1MRWxlbWVudCB7XG4gICAgICAgIGNvbnN0IGl0ZW1FbCA9IHRoaXMubWVudURyb3Bkb3duLmNyZWF0ZUVsKFwiZGl2XCIsIHtcbiAgICAgICAgICAgIGNsczogQXJyYXkuaXNBcnJheShjc3NDbGFzcykgPyBbQ1NTX0NMQVNTX01FTlVfT1BUSU9OLCAuLi5jc3NDbGFzc10gOiBbQ1NTX0NMQVNTX01FTlVfT1BUSU9OLCBjc3NDbGFzc10sXG4gICAgICAgIH0pO1xuICAgICAgICBzZXRJY29uKGl0ZW1FbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm1lbnUtb3B0aW9uLWljb25cIiB9KSwgaWNvbik7XG4gICAgICAgIGl0ZW1FbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm1lbnUtb3B0aW9uLXRleHRcIiwgdGV4dDogdGV4dCB9KTtcbiAgICAgICAgcmV0dXJuIGl0ZW1FbDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXIoZWxlbWVudDogSFRNTEVsZW1lbnQgfCBEb2N1bWVudCwgdHlwZTogc3RyaW5nLCBoYW5kbGVyOiAoZTogYW55KSA9PiB2b2lkKSB7XG4gICAgICAgIGNvbnN0IGV2ZW50SGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBldmVudEhhbmRsZXIpO1xuICAgICAgICB0aGlzLmxpc3RlbmVycy5wdXNoKHsgZWxlbWVudCwgdHlwZSwgaGFuZGxlcjogZXZlbnRIYW5kbGVyIH0pO1xuICAgIH1cblxuXG4gICAgcHVibGljIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmxpc3RlbmVycy5mb3JFYWNoKCh7IGVsZW1lbnQsIHR5cGUsIGhhbmRsZXIgfSkgPT4ge1xuICAgICAgICAgICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGhhbmRsZXIpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5saXN0ZW5lcnMgPSBbXTtcbiAgICAgICAgXG4gICAgfVxuXG4gICAgLy8gLS0tIE1lbnUgVmlzaWJpbGl0eSBhbmQgU3RhdGUgLS0tXG5cbiAgICBwdWJsaWMgaXNNZW51T3BlbigpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5tZW51RHJvcGRvd24gJiYgdGhpcy5tZW51RHJvcGRvd24uc3R5bGUuZGlzcGxheSA9PT0gXCJibG9ja1wiO1xuICAgIH1cblxuICAgIHB1YmxpYyB0b2dnbGVNZW51KGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICBpZiAoIXRoaXMubWVudURyb3Bkb3duKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiW0Ryb3Bkb3duTWVudU1hbmFnZXJdIG1lbnVEcm9wZG93biBtaXNzaW5nIVwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBpc0hpZGRlbiA9IHRoaXMubWVudURyb3Bkb3duLnN0eWxlLmRpc3BsYXkgPT09IFwibm9uZVwiO1xuICAgICAgICBpZiAoaXNIaWRkZW4pIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdGhpcy5tZW51RHJvcGRvd24uc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgICAgICAgIHRoaXMuY29sbGFwc2VBbGxTdWJtZW51cyhudWxsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdGhpcy5jbG9zZU1lbnUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBjbG9zZU1lbnUoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLm1lbnVEcm9wZG93bikge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB0aGlzLm1lbnVEcm9wZG93bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgICAgICB0aGlzLmNvbGxhcHNlQWxsU3VibWVudXMobnVsbCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgaGFuZGxlRG9jdW1lbnRDbGljayhldmVudDogTW91c2VFdmVudCwgbWVudUJ1dHRvbjogSFRNTEVsZW1lbnQgfCBudWxsKTogdm9pZCB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIHRoaXMuaXNNZW51T3BlbigpICYmXG4gICAgICAgICAgICAhbWVudUJ1dHRvbj8uY29udGFpbnMoZXZlbnQudGFyZ2V0IGFzIE5vZGUpICYmXG4gICAgICAgICAgICAhdGhpcy5tZW51RHJvcGRvd24/LmNvbnRhaW5zKGV2ZW50LnRhcmdldCBhcyBOb2RlKVxuICAgICAgICApIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdGhpcy5jbG9zZU1lbnUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIC0tLSBTdWJtZW51IExvZ2ljIC0tLVxuXG4gICAgcHJpdmF0ZSBjcmVhdGVTdWJtZW51U2VjdGlvbiA9IChcbiAgICAgICAgdGl0bGU6IHN0cmluZyxcbiAgICAgICAgaWNvbjogc3RyaW5nLFxuICAgICAgICBsaXN0Q29udGFpbmVyQ2xhc3M6IHN0cmluZyxcbiAgICAgICAgc2VjdGlvbkNsYXNzPzogc3RyaW5nXG4gICAgKTogeyBoZWFkZXI6IEhUTUxFbGVtZW50OyBjb250ZW50OiBIVE1MRWxlbWVudDsgc2VjdGlvbjogSFRNTEVsZW1lbnQgfSA9PiB7XG4gICAgICAgIGNvbnN0IHNlY3Rpb24gPSB0aGlzLm1lbnVEcm9wZG93bi5jcmVhdGVEaXYoKTtcbiAgICAgICAgaWYgKHNlY3Rpb25DbGFzcykgc2VjdGlvbi5hZGRDbGFzcyhzZWN0aW9uQ2xhc3MpO1xuICAgICAgICBjb25zdCBoZWFkZXIgPSBzZWN0aW9uLmNyZWF0ZURpdih7XG4gICAgICAgICAgICBjbHM6IGAke0NTU19DTEFTU19NRU5VX09QVElPTn0gJHtDU1NfQ0xBU1NfTUVOVV9IRUFERVJfSVRFTX1gLFxuICAgICAgICB9KTtcbiAgICAgICAgc2V0SWNvbihoZWFkZXIuY3JlYXRlU3Bhbih7IGNsczogXCJtZW51LW9wdGlvbi1pY29uXCIgfSksIGljb24pO1xuICAgICAgICBoZWFkZXIuY3JlYXRlU3Bhbih7IGNsczogXCJtZW51LW9wdGlvbi10ZXh0XCIsIHRleHQ6IHRpdGxlIH0pO1xuICAgICAgICBzZXRJY29uKGhlYWRlci5jcmVhdGVTcGFuKHsgY2xzOiBDU1NfQ0xBU1NfU1VCTUVOVV9JQ09OIH0pLCBcImNoZXZyb24tcmlnaHRcIik7XG4gICAgICAgIGNvbnN0IGlzQ2hhdExpc3QgPSBsaXN0Q29udGFpbmVyQ2xhc3MgPT09IENTU19DTEFTU19DSEFUX0xJU1RfQ09OVEFJTkVSO1xuICAgICAgICBjb25zdCBjb250ZW50ID0gc2VjdGlvbi5jcmVhdGVEaXYoe1xuICAgICAgICAgICAgY2xzOiBgJHtDU1NfQ0xBU1NfU1VCTUVOVV9DT05URU5UfSAke0NTU19DTEFTU0VTLlNVQk1FTlVfQ09OVEVOVF9ISURERU59ICR7bGlzdENvbnRhaW5lckNsYXNzfSAke1xuICAgICAgICAgICAgICAgIGlzQ2hhdExpc3QgPyBDU1NfQ0xBU1NfQ0hBVF9MSVNUX1NDUk9MTEFCTEUgOiBcIlwiXG4gICAgICAgICAgICB9YCxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRlbnQuc3R5bGUubWF4SGVpZ2h0ID0gXCIwXCI7XG4gICAgICAgIGNvbnRlbnQuc3R5bGUub3ZlcmZsb3cgPSBcImhpZGRlblwiO1xuICAgICAgICBjb250ZW50LnN0eWxlLnRyYW5zaXRpb24gPSBcIm1heC1oZWlnaHQgMC4zcyBlYXNlLW91dCwgcGFkZGluZyAwLjNzIGVhc2Utb3V0XCI7XG4gICAgICAgIGNvbnRlbnQuc3R5bGUucGFkZGluZ1RvcCA9IFwiMFwiO1xuICAgICAgICBjb250ZW50LnN0eWxlLnBhZGRpbmdCb3R0b20gPSBcIjBcIjtcbiAgICAgICAgcmV0dXJuIHsgaGVhZGVyLCBjb250ZW50LCBzZWN0aW9uIH07XG4gICAgfTtcblxuICAgIHByaXZhdGUgYXN5bmMgdG9nZ2xlU3VibWVudShcbiAgICAgICAgaGVhZGVyRWw6IEhUTUxFbGVtZW50IHwgbnVsbCxcbiAgICAgICAgY29udGVudEVsOiBIVE1MRWxlbWVudCB8IG51bGwsXG4gICAgICAgIHR5cGU6IFwibW9kZWxzXCIgfCBcInJvbGVzXCIgfCBcImNoYXRzXCJcbiAgICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgaWYgKCFoZWFkZXJFbCB8fCAhY29udGVudEVsKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGljb25FbCA9IGhlYWRlckVsLnF1ZXJ5U2VsZWN0b3IoYC4ke0NTU19DTEFTU19TVUJNRU5VX0lDT059YCk7XG4gICAgICAgIGNvbnN0IGlzSGlkZGVuID1cbiAgICAgICAgICAgIGNvbnRlbnRFbC5zdHlsZS5tYXhIZWlnaHQgPT09IFwiMHB4XCIgfHwgY29udGVudEVsLmNsYXNzTGlzdC5jb250YWlucyhDU1NfQ0xBU1NFUy5TVUJNRU5VX0NPTlRFTlRfSElEREVOKTtcblxuICAgICAgICBpZiAoaXNIaWRkZW4pIHtcbiAgICAgICAgICAgIHRoaXMuY29sbGFwc2VBbGxTdWJtZW51cyhjb250ZW50RWwpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzSGlkZGVuKSB7XG4gICAgICAgICAgICBpZiAoaWNvbkVsIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHNldEljb24oaWNvbkVsLCBcImNoZXZyb24tZG93blwiKTtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICAgICAgICAgICAgY29udGVudEVsLmNyZWF0ZURpdih7XG4gICAgICAgICAgICAgICAgY2xzOiBcIm1lbnUtbG9hZGluZ1wiLFxuICAgICAgICAgICAgICAgIHRleHQ6IGBMb2FkaW5nICR7dHlwZX0uLi5gLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjb250ZW50RWwuY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NFUy5TVUJNRU5VX0NPTlRFTlRfSElEREVOKTtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5zdHlsZS5tYXhIZWlnaHQgPSBcIjQwcHhcIjtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5zdHlsZS5wYWRkaW5nVG9wID0gXCI1cHhcIjtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5zdHlsZS5wYWRkaW5nQm90dG9tID0gXCI1cHhcIjtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5zdHlsZS5vdmVyZmxvd1kgPSBcImhpZGRlblwiO1xuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwibW9kZWxzXCI6IGF3YWl0IHRoaXMucmVuZGVyTW9kZWxMaXN0KCk7IGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwicm9sZXNcIjogYXdhaXQgdGhpcy5yZW5kZXJSb2xlTGlzdCgpOyBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcImNoYXRzXCI6IGF3YWl0IHRoaXMucmVuZGVyQ2hhdExpc3RNZW51KCk7IGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghY29udGVudEVsLmNsYXNzTGlzdC5jb250YWlucyhDU1NfQ0xBU1NFUy5TVUJNRU5VX0NPTlRFTlRfSElEREVOKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLnRyYWNlKGBbRHJvcGRvd25NZW51TWFuYWdlcl0gU2V0dGluZyBzdWJtZW51IGhlaWdodCBmb3IgJHt0eXBlfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGUgPT09IFwiY2hhdHNcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnRFbC5zdHlsZS5tYXhIZWlnaHQgPSBDSEFUX0xJU1RfTUFYX0hFSUdIVDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50RWwuc3R5bGUub3ZlcmZsb3dZID0gXCJhdXRvXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnRFbC5zdHlsZS5tYXhIZWlnaHQgPSBjb250ZW50RWwuc2Nyb2xsSGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnRFbC5zdHlsZS5vdmVyZmxvd1kgPSBcImhpZGRlblwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihgW0Ryb3Bkb3duTWVudU1hbmFnZXJdIEVycm9yIHJlbmRlcmluZyAke3R5cGV9IGxpc3Q6YCwgZXJyb3IpO1xuICAgICAgICAgICAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICAgICAgICAgICAgICAgIGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibWVudS1lcnJvci10ZXh0XCIsIHRleHQ6IGBFcnJvciBsb2FkaW5nICR7dHlwZX0uYCB9KTtcbiAgICAgICAgICAgICAgICBjb250ZW50RWwuc3R5bGUubWF4SGVpZ2h0ID0gXCI1MHB4XCI7XG4gICAgICAgICAgICAgICAgY29udGVudEVsLnN0eWxlLm92ZXJmbG93WSA9IFwiaGlkZGVuXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnRlbnRFbC5jbGFzc0xpc3QuYWRkKENTU19DTEFTU0VTLlNVQk1FTlVfQ09OVEVOVF9ISURERU4pO1xuICAgICAgICAgICAgY29udGVudEVsLnN0eWxlLm1heEhlaWdodCA9IFwiMFwiO1xuICAgICAgICAgICAgY29udGVudEVsLnN0eWxlLnBhZGRpbmdUb3AgPSBcIjBcIjtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5zdHlsZS5wYWRkaW5nQm90dG9tID0gXCIwXCI7XG4gICAgICAgICAgICBjb250ZW50RWwuc3R5bGUub3ZlcmZsb3dZID0gXCJoaWRkZW5cIjtcbiAgICAgICAgICAgIGlmIChpY29uRWwgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkgc2V0SWNvbihpY29uRWwsIFwiY2hldnJvbi1yaWdodFwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY29sbGFwc2VBbGxTdWJtZW51cyhleGNlcHRDb250ZW50PzogSFRNTEVsZW1lbnQgfCBudWxsKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHN1Ym1lbnVzID0gW1xuICAgICAgICAgICAgeyBoZWFkZXI6IHRoaXMubW9kZWxTdWJtZW51SGVhZGVyLCBjb250ZW50OiB0aGlzLm1vZGVsU3VibWVudUNvbnRlbnQgfSxcbiAgICAgICAgICAgIHsgaGVhZGVyOiB0aGlzLnJvbGVTdWJtZW51SGVhZGVyLCBjb250ZW50OiB0aGlzLnJvbGVTdWJtZW51Q29udGVudCB9LFxuICAgICAgICAgICAgeyBoZWFkZXI6IHRoaXMuY2hhdFN1Ym1lbnVIZWFkZXIsIGNvbnRlbnQ6IHRoaXMuY2hhdFN1Ym1lbnVDb250ZW50IH0sXG4gICAgICAgIF07XG4gICAgICAgIHN1Ym1lbnVzLmZvckVhY2goc3VibWVudSA9PiB7XG4gICAgICAgICAgICBpZiAoc3VibWVudS5jb250ZW50ICYmIHN1Ym1lbnUuaGVhZGVyICYmIHN1Ym1lbnUuY29udGVudCAhPT0gZXhjZXB0Q29udGVudCkge1xuICAgICAgICAgICAgICAgIGlmICghc3VibWVudS5jb250ZW50LmNsYXNzTGlzdC5jb250YWlucyhDU1NfQ0xBU1NFUy5TVUJNRU5VX0NPTlRFTlRfSElEREVOKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoYFtEcm9wZG93bk1lbnVNYW5hZ2VyXSBDb2xsYXBzaW5nIHN1Ym1lbnUuYCk7XG4gICAgICAgICAgICAgICAgICAgIHN1Ym1lbnUuY29udGVudC5jbGFzc0xpc3QuYWRkKENTU19DTEFTU0VTLlNVQk1FTlVfQ09OVEVOVF9ISURERU4pO1xuICAgICAgICAgICAgICAgICAgICBzdWJtZW51LmNvbnRlbnQuc3R5bGUubWF4SGVpZ2h0ID0gXCIwXCI7XG4gICAgICAgICAgICAgICAgICAgIHN1Ym1lbnUuY29udGVudC5zdHlsZS5wYWRkaW5nVG9wID0gXCIwXCI7XG4gICAgICAgICAgICAgICAgICAgIHN1Ym1lbnUuY29udGVudC5zdHlsZS5wYWRkaW5nQm90dG9tID0gXCIwXCI7XG4gICAgICAgICAgICAgICAgICAgIHN1Ym1lbnUuY29udGVudC5zdHlsZS5vdmVyZmxvd1kgPSBcImhpZGRlblwiO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpY29uRWwgPSBzdWJtZW51LmhlYWRlci5xdWVyeVNlbGVjdG9yKGAuJHtDU1NfQ0xBU1NfU1VCTUVOVV9JQ09OfWApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaWNvbkVsIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldEljb24oaWNvbkVsLCBcImNoZXZyb24tcmlnaHRcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIC0tLSBMaXN0IFJlbmRlcmluZyAvIFVwZGF0ZSAtLS1cblxuICAgIHB1YmxpYyBhc3luYyByZW5kZXJNb2RlbExpc3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IHRoaXMubW9kZWxTdWJtZW51Q29udGVudDtcbiAgICAgICAgaWYgKCFjb250YWluZXIpIHJldHVybjtcbiAgICAgICAgXG4gICAgICAgIGNvbnRhaW5lci5lbXB0eSgpO1xuICAgICAgICBjb25zdCBtb2RlbEljb25NYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7IGxsYW1hOiBcImJveC1taW5pbWFsXCIsIG1pc3RyYWw6IFwid2luZFwiIH07XG4gICAgICAgIGNvbnN0IGRlZmF1bHRJY29uID0gXCJib3hcIjtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG1vZGVscyA9IGF3YWl0IHRoaXMucGx1Z2luLm9sbGFtYVNlcnZpY2UuZ2V0TW9kZWxzKCk7XG4gICAgICAgICAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRNb2RlbE5hbWUgPSBhY3RpdmVDaGF0Py5tZXRhZGF0YT8ubW9kZWxOYW1lIHx8IHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZTtcblxuICAgICAgICAgICAgaWYgKG1vZGVscy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibWVudS1pbmZvLXRleHRcIiwgdGV4dDogXCJObyBtb2RlbHMgYXZhaWxhYmxlLlwiIH0pOyAvLyDQn9C+0LrRgNCw0YnQtdC90LUg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBtb2RlbHMuZm9yRWFjaChtb2RlbE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9wdGlvbkVsID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogYCR7Q1NTX0NMQVNTX01FTlVfT1BUSU9OfSAke0NTU19DTEFTU19NT0RFTF9PUFRJT059YCB9KTtcbiAgICAgICAgICAgICAgICBjb25zdCBpY29uU3BhbiA9IG9wdGlvbkVsLmNyZWF0ZUVsKFwic3BhblwiLCB7IGNsczogXCJtZW51LW9wdGlvbi1pY29uXCIgfSk7XG4gICAgICAgICAgICAgICAgbGV0IGljb25Ub1VzZSA9IGRlZmF1bHRJY29uO1xuICAgICAgICAgICAgICAgIGlmIChtb2RlbE5hbWUgPT09IGN1cnJlbnRNb2RlbE5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWNvblRvVXNlID0gXCJjaGVja1wiO1xuICAgICAgICAgICAgICAgICAgICBvcHRpb25FbC5hZGRDbGFzcyhcImlzLXNlbGVjdGVkXCIpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGwgPSBtb2RlbE5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGYgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBrIGluIG1vZGVsSWNvbk1hcCkgeyBpZiAobC5pbmNsdWRlcyhrKSkgeyBpY29uVG9Vc2UgPSBtb2RlbEljb25NYXBba107IGYgPSB0cnVlOyBicmVhazsgfSB9XG4gICAgICAgICAgICAgICAgICAgIGlmICghZikgaWNvblRvVXNlID0gZGVmYXVsdEljb247XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRyeSB7IHNldEljb24oaWNvblNwYW4sIGljb25Ub1VzZSk7IH0gY2F0Y2ggKGUpIHsgaWNvblNwYW4uc3R5bGUubWluV2lkdGggPSBcIjE4cHhcIjsgfVxuXG4gICAgICAgICAgICAgICAgb3B0aW9uRWwuY3JlYXRlRWwoXCJzcGFuXCIsIHsgY2xzOiBcIm1lbnUtb3B0aW9uLXRleHRcIiwgdGV4dDogbW9kZWxOYW1lIH0pO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5yZWdpc3Rlckxpc3RlbmVyKG9wdGlvbkVsLCBcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxhdGVzdENoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdCgpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXRlc3RNb2RlbCA9IGxhdGVzdENoYXQ/Lm1ldGFkYXRhPy5tb2RlbE5hbWUgfHwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xuICAgICAgICAgICAgICAgICAgICBpZiAobW9kZWxOYW1lICE9PSBsYXRlc3RNb2RlbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxhdGVzdENoYXQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci51cGRhdGVBY3RpdmVDaGF0TWV0YWRhdGEoeyBtb2RlbE5hbWU6IG1vZGVsTmFtZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkNhbm5vdCBzZXQgbW9kZWw6IE5vIGFjdGl2ZSBjaGF0LlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsb3NlTWVudSgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbRHJvcGRvd25NZW51TWFuYWdlcl0gRXJyb3IgcmVuZGVyaW5nIG1vZGVsIGxpc3Q6XCIsIGVycm9yKTtcbiAgICAgICAgICAgIGNvbnRhaW5lci5lbXB0eSgpO1xuICAgICAgICAgICAgY29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcIm1lbnUtZXJyb3ItdGV4dFwiLCB0ZXh0OiBcIkVycm9yIGxvYWRpbmcgbW9kZWxzLlwiIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHJlbmRlclJvbGVMaXN0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLnJvbGVTdWJtZW51Q29udGVudDtcbiAgICAgICAgaWYgKCFjb250YWluZXIpIHJldHVybjtcbiAgICAgICAgXG4gICAgICAgIGNvbnRhaW5lci5lbXB0eSgpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgcm9sZXMgPSBhd2FpdCB0aGlzLnBsdWdpbi5saXN0Um9sZUZpbGVzKHRydWUpO1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50Q2hhdFJvbGVQYXRoID0gYWN0aXZlQ2hhdD8ubWV0YWRhdGE/LnNlbGVjdGVkUm9sZVBhdGggPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aDtcblxuICAgICAgICAgICAgY29uc3Qgbm9Sb2xlT3B0aW9uRWwgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBgJHtDU1NfQ0xBU1NfTUVOVV9PUFRJT059ICR7Q1NTX0NMQVNTX1JPTEVfT1BUSU9OfWAgfSk7XG4gICAgICAgICAgICBjb25zdCBub1JvbGVJY29uU3BhbiA9IG5vUm9sZU9wdGlvbkVsLmNyZWF0ZUVsKFwic3BhblwiLCB7IGNsczogXCJtZW51LW9wdGlvbi1pY29uXCIgfSk7XG4gICAgICAgICAgICBpZiAoIWN1cnJlbnRDaGF0Um9sZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBzZXRJY29uKG5vUm9sZUljb25TcGFuLCBcImNoZWNrXCIpO1xuICAgICAgICAgICAgICAgIG5vUm9sZU9wdGlvbkVsLmFkZENsYXNzKFwiaXMtc2VsZWN0ZWRcIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNldEljb24obm9Sb2xlSWNvblNwYW4sIFwic2xhc2hcIik7XG4gICAgICAgICAgICAgICAgbm9Sb2xlSWNvblNwYW4uc3R5bGUubWluV2lkdGggPSBcIjE4cHhcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG5vUm9sZU9wdGlvbkVsLmNyZWF0ZUVsKFwic3BhblwiLCB7IGNsczogXCJtZW51LW9wdGlvbi10ZXh0XCIsIHRleHQ6IFwiTm9uZVwiIH0pO1xuXG4gICAgICAgICAgICB0aGlzLnJlZ2lzdGVyTGlzdGVuZXIobm9Sb2xlT3B0aW9uRWwsIFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IG5ld1JvbGVQYXRoID0gXCJcIjtcbiAgICAgICAgICAgICAgICBjb25zdCBsYXRlc3RDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBsYXRlc3RSb2xlUGF0aCA9IGxhdGVzdENoYXQ/Lm1ldGFkYXRhPy5zZWxlY3RlZFJvbGVQYXRoID8/IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XG5cbiAgICAgICAgICAgICAgICBpZiAobGF0ZXN0Um9sZVBhdGggIT09IG5ld1JvbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShgQ3VycmVudCBwYXRoICcke2xhdGVzdFJvbGVQYXRofScsIG5ldyBwYXRoICcke25ld1JvbGVQYXRofSdgKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxhdGVzdENoYXQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnVwZGF0ZUFjdGl2ZUNoYXRNZXRhZGF0YSh7IHNlbGVjdGVkUm9sZVBhdGg6IG5ld1JvbGVQYXRoIH0pO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aCA9IG5ld1JvbGVQYXRoO1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwicm9sZS1jaGFuZ2VkXCIsIFwiTm9uZVwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnByb21wdFNlcnZpY2U/LmNsZWFyUm9sZUNhY2hlPy4oKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLmNsb3NlTWVudSgpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGlmIChyb2xlcy5sZW5ndGggPiAwKSBjb250YWluZXIuY3JlYXRlRWwoXCJoclwiLCB7IGNsczogQ1NTX0NMQVNTX01FTlVfU0VQQVJBVE9SIH0pO1xuXG4gICAgICAgICAgICByb2xlcy5mb3JFYWNoKHJvbGVJbmZvID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByb2xlT3B0aW9uRWwgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBgJHtDU1NfQ0xBU1NfTUVOVV9PUFRJT059ICR7Q1NTX0NMQVNTX1JPTEVfT1BUSU9OfWAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKHJvbGVJbmZvLmlzQ3VzdG9tKSByb2xlT3B0aW9uRWwuYWRkQ2xhc3MoXCJpcy1jdXN0b21cIik7XG4gICAgICAgICAgICAgICAgY29uc3QgaWNvblNwYW4gPSByb2xlT3B0aW9uRWwuY3JlYXRlRWwoXCJzcGFuXCIsIHsgY2xzOiBcIm1lbnUtb3B0aW9uLWljb25cIiB9KTtcbiAgICAgICAgICAgICAgICBpZiAocm9sZUluZm8ucGF0aCA9PT0gY3VycmVudENoYXRSb2xlUGF0aCkge1xuICAgICAgICAgICAgICAgICAgICBzZXRJY29uKGljb25TcGFuLCBcImNoZWNrXCIpO1xuICAgICAgICAgICAgICAgICAgICByb2xlT3B0aW9uRWwuYWRkQ2xhc3MoXCJpcy1zZWxlY3RlZFwiKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzZXRJY29uKGljb25TcGFuLCByb2xlSW5mby5pc0N1c3RvbSA/IFwidXNlclwiIDogXCJib3hcIik7XG4gICAgICAgICAgICAgICAgICAgIGljb25TcGFuLnN0eWxlLm1pbldpZHRoID0gXCIxOHB4XCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJvbGVPcHRpb25FbC5jcmVhdGVFbChcInNwYW5cIiwgeyBjbHM6IFwibWVudS1vcHRpb24tdGV4dFwiLCB0ZXh0OiByb2xlSW5mby5uYW1lIH0pO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5yZWdpc3Rlckxpc3RlbmVyKHJvbGVPcHRpb25FbCwgXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW0Ryb3Bkb3duTWVudU1hbmFnZXJdIFJvbGUgc2VsZWN0ZWQ6ICR7cm9sZUluZm8ubmFtZX0gKCR7cm9sZUluZm8ucGF0aH0pYCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld1JvbGVQYXRoID0gcm9sZUluZm8ucGF0aDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGF0ZXN0Q2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxhdGVzdFJvbGVQYXRoID0gbGF0ZXN0Q2hhdD8ubWV0YWRhdGE/LnNlbGVjdGVkUm9sZVBhdGggPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aDtcblxuICAgICAgICAgICAgICAgICAgICBpZiAobGF0ZXN0Um9sZVBhdGggIT09IG5ld1JvbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoYEN1cnJlbnQgcGF0aCAnJHtsYXRlc3RSb2xlUGF0aH0nLCBuZXcgcGF0aCAnJHtuZXdSb2xlUGF0aH0nYCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobGF0ZXN0Q2hhdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnVwZGF0ZUFjdGl2ZUNoYXRNZXRhZGF0YSh7IHNlbGVjdGVkUm9sZVBhdGg6IG5ld1JvbGVQYXRoIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoID0gbmV3Um9sZVBhdGg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uZW1pdChcInJvbGUtY2hhbmdlZFwiLCByb2xlSW5mby5uYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5wcm9tcHRTZXJ2aWNlPy5jbGVhclJvbGVDYWNoZT8uKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jbG9zZU1lbnUoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW0Ryb3Bkb3duTWVudU1hbmFnZXJdIEVycm9yIHJlbmRlcmluZyByb2xlIGxpc3Q6XCIsIGVycm9yKTtcbiAgICAgICAgICAgIGNvbnRhaW5lci5lbXB0eSgpO1xuICAgICAgICAgICAgY29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcIm1lbnUtZXJyb3ItdGV4dFwiLCB0ZXh0OiBcIkVycm9yIGxvYWRpbmcgcm9sZXMuXCIgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgcmVuZGVyQ2hhdExpc3RNZW51KCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLmNoYXRTdWJtZW51Q29udGVudDtcbiAgICAgICAgaWYgKCFjb250YWluZXIpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb250YWluZXIuZW1wdHkoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNoYXRzID0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/Lmxpc3RBdmFpbGFibGVDaGF0cygpIHx8IFtdO1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEFjdGl2ZUlkID0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXRJZCgpO1xuXG4gICAgICAgICAgICBpZiAoY2hhdHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcIm1lbnUtaW5mby10ZXh0XCIsIHRleHQ6IFwiTm8gc2F2ZWQgY2hhdHMuXCIgfSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNoYXRzLmZvckVhY2goY2hhdE1ldGEgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNoYXRPcHRpb25FbCA9IGNvbnRhaW5lci5jcmVhdGVEaXYoe1xuICAgICAgICAgICAgICAgICAgICBjbHM6IFtDU1NfQ0xBU1NfTUVOVV9PUFRJT04sIENTU19DTEFTU19DSEFUX0xJU1RfSVRFTSwgQ1NTX0NMQVNTX0NIQVRfT1BUSU9OXSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBjb25zdCBpY29uU3BhbiA9IGNoYXRPcHRpb25FbC5jcmVhdGVFbChcInNwYW5cIiwgeyBjbHM6IFwibWVudS1vcHRpb24taWNvblwiIH0pO1xuICAgICAgICAgICAgICAgIGlmIChjaGF0TWV0YS5pZCA9PT0gY3VycmVudEFjdGl2ZUlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldEljb24oaWNvblNwYW4sIFwiY2hlY2tcIik7XG4gICAgICAgICAgICAgICAgICAgIGNoYXRPcHRpb25FbC5hZGRDbGFzcyhcImlzLXNlbGVjdGVkXCIpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNldEljb24oaWNvblNwYW4sIFwibWVzc2FnZS1zcXVhcmVcIik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dFNwYW4gPSBjaGF0T3B0aW9uRWwuY3JlYXRlRWwoXCJzcGFuXCIsIHsgY2xzOiBcIm1lbnUtb3B0aW9uLXRleHRcIiB9KTtcbiAgICAgICAgICAgICAgICB0ZXh0U3Bhbi5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJjaGF0LW9wdGlvbi1uYW1lXCIsIHRleHQ6IGNoYXRNZXRhLm5hbWUgfSk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBsYXN0TW9kaWZpZWREYXRlID0gbmV3IERhdGUoY2hhdE1ldGEubGFzdE1vZGlmaWVkKTtcbiAgICAgICAgICAgICAgICBjb25zdCBkYXRlVGV4dCA9ICFpc05hTihsYXN0TW9kaWZpZWREYXRlLmdldFRpbWUoKSlcbiAgICAgICAgICAgICAgICAgICAgPyB0aGlzLnZpZXcuZm9ybWF0UmVsYXRpdmVEYXRlKGxhc3RNb2RpZmllZERhdGUpXG4gICAgICAgICAgICAgICAgICAgIDogXCJJbnZhbGlkIGRhdGVcIjtcbiAgICAgICAgICAgICAgICBpZiAoZGF0ZVRleHQgPT09IFwiSW52YWxpZCBkYXRlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRleHRTcGFuLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcImNoYXQtb3B0aW9uLWRhdGVcIiwgdGV4dDogZGF0ZVRleHQgfSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnJlZ2lzdGVyTGlzdGVuZXIoY2hhdE9wdGlvbkVsLCBcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbRHJvcGRvd25NZW51TWFuYWdlcl0gQ2hhdCBzZWxlY3RlZDogJHtjaGF0TWV0YS5uYW1lfSAoJHtjaGF0TWV0YS5pZH0pYCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxhdGVzdEFjdGl2ZUlkID0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXRJZCgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2hhdE1ldGEuaWQgIT09IGxhdGVzdEFjdGl2ZUlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5zZXRBY3RpdmVDaGF0KGNoYXRNZXRhLmlkKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsb3NlTWVudSgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIltEcm9wZG93bk1lbnVNYW5hZ2VyXSBFcnJvciByZW5kZXJpbmcgY2hhdCBsaXN0OlwiLCBlcnJvcik7XG4gICAgICAgICAgICBjb250YWluZXIuZW1wdHkoKTtcbiAgICAgICAgICAgIGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJtZW51LWVycm9yLXRleHRcIiwgdGV4dDogXCJFcnJvciBsb2FkaW5nIGNoYXRzLlwiIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tIFVJIFVwZGF0ZXMgLS0tXG5cbiAgICBwdWJsaWMgdXBkYXRlVG9nZ2xlVmlld0xvY2F0aW9uT3B0aW9uKCk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMudG9nZ2xlVmlld0xvY2F0aW9uT3B0aW9uKSByZXR1cm47XG4gICAgICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci50cmFjZShcIltEcm9wZG93bk1lbnVNYW5hZ2VyXSBVcGRhdGluZyB0b2dnbGUgdmlldyBsb2NhdGlvbiBvcHRpb24uXCIpO1xuICAgICAgICB0aGlzLnRvZ2dsZVZpZXdMb2NhdGlvbk9wdGlvbi5lbXB0eSgpO1xuICAgICAgICBjb25zdCBpY29uU3BhbiA9IHRoaXMudG9nZ2xlVmlld0xvY2F0aW9uT3B0aW9uLmNyZWF0ZVNwYW4oeyBjbHM6IFwibWVudS1vcHRpb24taWNvblwiIH0pO1xuICAgICAgICBjb25zdCB0ZXh0U3BhbiA9IHRoaXMudG9nZ2xlVmlld0xvY2F0aW9uT3B0aW9uLmNyZWF0ZVNwYW4oeyBjbHM6IFwibWVudS1vcHRpb24tdGV4dFwiIH0pO1xuXG4gICAgICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuQ2hhdEluVGFiKSB7XG4gICAgICAgICAgICBzZXRJY29uKGljb25TcGFuLCBcInNpZGViYXItcmlnaHRcIik7XG4gICAgICAgICAgICB0ZXh0U3Bhbi5zZXRUZXh0KFwiU2hvdyBpbiBTaWRlYmFyXCIpO1xuICAgICAgICAgICAgdGhpcy50b2dnbGVWaWV3TG9jYXRpb25PcHRpb24udGl0bGUgPSBcIkNsb3NlIHRhYiBhbmQgcmVvcGVuIGluIHNpZGViYXJcIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNldEljb24oaWNvblNwYW4sIFwibGF5b3V0LWxpc3RcIik7XG4gICAgICAgICAgICB0ZXh0U3Bhbi5zZXRUZXh0KFwiU2hvdyBpbiBUYWJcIik7XG4gICAgICAgICAgICB0aGlzLnRvZ2dsZVZpZXdMb2NhdGlvbk9wdGlvbi50aXRsZSA9IFwiQ2xvc2Ugc2lkZWJhciBwYW5lbCBhbmQgcmVvcGVuIGluIHRhYlwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tIFVwZGF0ZSBUcmlnZ2VyIE1ldGhvZHMgKENhbGxlZCBieSBPbGxhbWFWaWV3KSAtLS1cblxuICAgIHB1YmxpYyBhc3luYyB1cGRhdGVNb2RlbExpc3RJZlZpc2libGUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIHRoaXMuaXNNZW51T3BlbigpICYmXG4gICAgICAgICAgICB0aGlzLm1vZGVsU3VibWVudUNvbnRlbnQgJiZcbiAgICAgICAgICAgICF0aGlzLm1vZGVsU3VibWVudUNvbnRlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKENTU19DTEFTU0VTLlNVQk1FTlVfQ09OVEVOVF9ISURERU4pXG4gICAgICAgICkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnJlbmRlck1vZGVsTGlzdCgpO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVTdWJtZW51SGVpZ2h0KHRoaXMubW9kZWxTdWJtZW51Q29udGVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdXBkYXRlUm9sZUxpc3RJZlZpc2libGUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIHRoaXMuaXNNZW51T3BlbigpICYmXG4gICAgICAgICAgICB0aGlzLnJvbGVTdWJtZW51Q29udGVudCAmJlxuICAgICAgICAgICAgIXRoaXMucm9sZVN1Ym1lbnVDb250ZW50LmNsYXNzTGlzdC5jb250YWlucyhDU1NfQ0xBU1NFUy5TVUJNRU5VX0NPTlRFTlRfSElEREVOKVxuICAgICAgICApIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYXdhaXQgdGhpcy5yZW5kZXJSb2xlTGlzdCgpO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVTdWJtZW51SGVpZ2h0KHRoaXMucm9sZVN1Ym1lbnVDb250ZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyB1cGRhdGVDaGF0TGlzdElmVmlzaWJsZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgdGhpcy5pc01lbnVPcGVuKCkgJiZcbiAgICAgICAgICAgIHRoaXMuY2hhdFN1Ym1lbnVDb250ZW50ICYmXG4gICAgICAgICAgICAhdGhpcy5jaGF0U3VibWVudUNvbnRlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKENTU19DTEFTU0VTLlNVQk1FTlVfQ09OVEVOVF9ISURERU4pXG4gICAgICAgICkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnJlbmRlckNoYXRMaXN0TWVudSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1cGRhdGVTdWJtZW51SGVpZ2h0KGNvbnRlbnRFbDogSFRNTEVsZW1lbnQgfCBudWxsKTogdm9pZCB7XG4gICAgICAgIGlmIChjb250ZW50RWwgJiYgIWNvbnRlbnRFbC5jbGFzc0xpc3QuY29udGFpbnMoQ1NTX0NMQVNTRVMuU1VCTUVOVV9DT05URU5UX0hJRERFTikpIHtcbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGNvbnRlbnRFbCAmJiAhY29udGVudEVsLmNsYXNzTGlzdC5jb250YWlucyhDU1NfQ0xBU1NFUy5TVUJNRU5VX0NPTlRFTlRfSElEREVOKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIudHJhY2UoXCJbRHJvcGRvd25NZW51TWFuYWdlcl0gVXBkYXRpbmcgc3VibWVudSBoZWlnaHQuXCIpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWNvbnRlbnRFbC5jbGFzc0xpc3QuY29udGFpbnMoQ1NTX0NMQVNTX0NIQVRfTElTVF9DT05UQUlORVIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50RWwuc3R5bGUubWF4SGVpZ2h0ID0gY29udGVudEVsLnNjcm9sbEhlaWdodCArIFwicHhcIjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxufSJdfQ==