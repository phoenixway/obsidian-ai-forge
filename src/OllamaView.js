import { __asyncValues, __awaiter } from "tslib";
import { ItemView, setIcon, MarkdownRenderer, Notice, debounce, normalizePath, TFolder, Menu, Platform, } from "obsidian";
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import { LANGUAGES } from "./settings";
import { SummaryModal } from "./SummaryModal";
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
export class OllamaView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.isProcessing = false;
        this.scrollTimeout = null;
        this.speechWorker = null;
        this.mediaRecorder = null;
        this.audioStream = null;
        this.emptyStateEl = null;
        this.resizeTimeout = null;
        this.currentMessages = [];
        this.lastRenderedMessageDate = null;
        this.newMessagesIndicatorEl = null;
        this.userScrolledUp = false;
        this.lastProcessedChatId = null;
        this.currentAbortController = null;
        this.lastMessageElement = null;
        this.consecutiveErrorMessages = [];
        this.errorGroupElement = null;
        this.isSummarizingErrors = false;
        this.isRegenerating = false;
        this.messageAddedResolvers = new Map();
        this.isChatListUpdateScheduled = false;
        this.chatListUpdateTimeoutId = null;
        this.activePlaceholder = null;
        this.isResizing = false;
        this.initialMouseX = 0;
        this.initialSidebarWidth = 0;
        this.cancelGeneration = () => {
            if (this.currentAbortController) {
                this.currentAbortController.abort();
            }
            else {
            }
        };
        this.handleMessageDeleted = (data) => {
            var _a;
            const currentActiveChatId = (_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChatId();
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
                    }
                    else {
                        this.chatContainer.scrollTop = currentScrollTop;
                    }
                    if (this.currentMessages.length === 0) {
                        this.showEmptyState();
                    }
                }
                else if (messageGroupEl) {
                    this.loadAndDisplayActiveChat();
                }
                else {
                }
            }
            catch (error) {
                this.loadAndDisplayActiveChat();
            }
        };
        this.updateRolePanelList = () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const container = this.rolePanelListEl;
            if (!container || !this.plugin.chatManager) {
                return;
            }
            if (((_a = this.rolePanelHeaderEl) === null || _a === void 0 ? void 0 : _a.getAttribute("data-collapsed")) === "true") {
                return;
            }
            const currentScrollTop = container.scrollTop;
            container.empty();
            try {
                const roles = yield this.plugin.listRoleFiles(true);
                const activeChat = yield this.plugin.chatManager.getActiveChat();
                const currentRolePath = (_c = (_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.selectedRolePath) !== null && _c !== void 0 ? _c : this.plugin.settings.selectedRolePath;
                const noneOptionEl = container.createDiv({ cls: [CSS_ROLE_PANEL_ITEM, CSS_ROLE_PANEL_ITEM_NONE, "menu-option"] });
                const noneIconSpan = noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
                noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: "None" });
                if (!currentRolePath) {
                    noneOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
                    setIcon(noneIconSpan, "check");
                }
                else {
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
                    }
                    else {
                        setIcon(iconSpan, roleInfo.isCustom ? "user" : "file-text");
                    }
                    this.registerDomEvent(roleOptionEl, "click", () => this.handleRolePanelItemClick(roleInfo, currentRolePath));
                });
            }
            catch (error) {
                container.empty();
                container.createDiv({ text: "Error loading roles.", cls: "menu-error-text" });
            }
            finally {
                requestAnimationFrame(() => {
                    container.scrollTop = currentScrollTop;
                });
            }
        });
        this.handleRolePanelItemClick = (roleInfo, currentRolePath) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const newRolePath = (_a = roleInfo === null || roleInfo === void 0 ? void 0 : roleInfo.path) !== null && _a !== void 0 ? _a : "";
            const roleNameForEvent = (_b = roleInfo === null || roleInfo === void 0 ? void 0 : roleInfo.name) !== null && _b !== void 0 ? _b : "None";
            if (newRolePath !== currentRolePath) {
                const activeChat = yield ((_c = this.plugin.chatManager) === null || _c === void 0 ? void 0 : _c.getActiveChat());
                try {
                    if (activeChat) {
                        yield this.plugin.chatManager.updateActiveChatMetadata({
                            selectedRolePath: newRolePath,
                        });
                    }
                    else {
                        this.plugin.settings.selectedRolePath = newRolePath;
                        yield this.plugin.saveSettings();
                        this.plugin.emit("role-changed", roleNameForEvent);
                        (_e = (_d = this.plugin.promptService) === null || _d === void 0 ? void 0 : _d.clearRoleCache) === null || _e === void 0 ? void 0 : _e.call(_d);
                    }
                }
                catch (error) {
                    new Notice("Failed to set the role.");
                }
            }
            else {
            }
        });
        this.handleModelDisplayClick = (event) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const menu = new Menu();
            let itemsAdded = false;
            const loadingNotice = new Notice("Loading models...", 0);
            try {
                const models = yield this.plugin.ollamaService.getModels();
                const activeChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
                const currentModelName = ((_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.modelName) || this.plugin.settings.modelName;
                loadingNotice.hide();
                if (models.length === 0) {
                    menu.addItem(item => item.setTitle("No models found").setDisabled(true));
                    itemsAdded = true;
                }
                else {
                    models.forEach(modelName => {
                        menu.addItem(item => item
                            .setTitle(modelName)
                            .setIcon(modelName === currentModelName ? "check" : "radio-button")
                            .onClick(() => __awaiter(this, void 0, void 0, function* () {
                            var _a, _b;
                            const chatToUpdate = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
                            const latestModelName = ((_b = chatToUpdate === null || chatToUpdate === void 0 ? void 0 : chatToUpdate.metadata) === null || _b === void 0 ? void 0 : _b.modelName) || this.plugin.settings.modelName;
                            if (modelName !== latestModelName) {
                                if (chatToUpdate) {
                                    yield this.plugin.chatManager.updateActiveChatMetadata({
                                        modelName: modelName,
                                    });
                                }
                                else {
                                    new Notice("Cannot set model: No active chat.");
                                }
                            }
                        })));
                        itemsAdded = true;
                    });
                }
            }
            catch (error) {
                loadingNotice.hide();
                console.error("Error loading models for model selection menu:", error);
                menu.addItem(item => item.setTitle("Error loading models").setDisabled(true));
                itemsAdded = true;
                new Notice("Failed to load models. Check Ollama connection.");
            }
            finally {
                if (itemsAdded) {
                    menu.showAtMouseEvent(event);
                }
                else {
                    console.warn("Model menu was not shown because no items were added.");
                }
            }
        });
        this.handleKeyDown = (e) => {
            var _a;
            if (e.key === "Enter" && !e.shiftKey && !this.isProcessing && !((_a = this.sendButton) === null || _a === void 0 ? void 0 : _a.disabled)) {
                e.preventDefault();
                this.sendMessage();
            }
        };
        this.handleSendClick = () => {
            var _a;
            if (!this.isProcessing && !((_a = this.sendButton) === null || _a === void 0 ? void 0 : _a.disabled)) {
                this.sendMessage();
            }
            else {
            }
        };
        this.handleInputForResize = () => {
            if (this.resizeTimeout)
                clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                this.adjustTextareaHeight();
                this.updateSendButtonState();
            }, 75);
        };
        this.handleVoiceClick = () => {
            this.toggleVoiceRecognition();
        };
        this.handleTranslateInputClick = () => __awaiter(this, void 0, void 0, function* () {
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
                const translatedText = yield this.plugin.translationService.translate(currentText, "English");
                if (translatedText !== null) {
                    this.inputEl.value = translatedText;
                    this.inputEl.dispatchEvent(new Event("input"));
                    this.inputEl.focus();
                    if (translatedText) {
                        const end = translatedText.length;
                        this.inputEl.setSelectionRange(end, end);
                    }
                }
                else {
                }
            }
            catch (error) {
                new Notice("Input translation encountered an unexpected error.");
            }
            finally {
                setIcon(this.translateInputButton, "languages");
                this.translateInputButton.disabled = this.isProcessing;
                this.translateInputButton.classList.remove(CSS_CLASS_TRANSLATING_INPUT);
                this.translateInputButton.title = `Translate input to ${LANGUAGES[targetLang] || targetLang}`;
            }
        });
        this.handleNewChatClick = () => __awaiter(this, void 0, void 0, function* () {
            var _a;
            (_a = this.dropdownMenuManager) === null || _a === void 0 ? void 0 : _a.closeMenu();
            try {
                const newChat = yield this.plugin.chatManager.createNewChat();
                if (newChat) {
                    new Notice(`Created new chat: ${newChat.metadata.name}`);
                    this.focusInput();
                }
                else {
                    new Notice("Failed to create new chat.");
                }
            }
            catch (error) {
                new Notice("Error creating new chat.");
            }
        });
        this.handleRenameChatClick = (chatIdToRename, currentChatName) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            let chatId = chatIdToRename !== null && chatIdToRename !== void 0 ? chatIdToRename : null;
            let currentName = currentChatName !== null && currentChatName !== void 0 ? currentChatName : null;
            if (!chatId || !currentName) {
                const activeChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
                if (!activeChat) {
                    new Notice("No active chat to rename.");
                    return;
                }
                chatId = activeChat.metadata.id;
                currentName = activeChat.metadata.name;
            }
            (_b = this.dropdownMenuManager) === null || _b === void 0 ? void 0 : _b.closeMenu();
            if (!chatId || currentName === null) {
                new Notice("Could not initiate rename process.");
                return;
            }
            new PromptModal(this.app, "Rename Chat", `Enter new name for "${currentName}":`, currentName, (newName) => __awaiter(this, void 0, void 0, function* () {
                let noticeMessage = "Rename cancelled or name unchanged.";
                const trimmedName = newName === null || newName === void 0 ? void 0 : newName.trim();
                if (trimmedName && trimmedName !== "" && trimmedName !== currentName) {
                    const success = yield this.plugin.chatManager.renameChat(chatId, trimmedName);
                    if (success) {
                        noticeMessage = `Chat renamed to "${trimmedName}"`;
                    }
                    else {
                        noticeMessage = "Failed to rename chat.";
                    }
                }
                else if (trimmedName && trimmedName === currentName) {
                    noticeMessage = "Name unchanged.";
                }
                else if (newName === null || trimmedName === "") {
                    noticeMessage = "Rename cancelled or invalid name entered.";
                }
                new Notice(noticeMessage);
                this.focusInput();
            })).open();
        });
        this.handleCloneChatClick = () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            (_a = this.dropdownMenuManager) === null || _a === void 0 ? void 0 : _a.closeMenu();
            const activeChat = yield ((_b = this.plugin.chatManager) === null || _b === void 0 ? void 0 : _b.getActiveChat());
            if (!activeChat) {
                new Notice("No active chat to clone.");
                return;
            }
            const cloningNotice = new Notice("Cloning chat...", 0);
            try {
                const clonedChat = yield this.plugin.chatManager.cloneChat(activeChat.metadata.id);
                if (clonedChat) {
                    new Notice(`Chat cloned as "${clonedChat.metadata.name}" and activated.`);
                }
                else {
                    new Notice("Failed to clone chat.");
                }
            }
            catch (error) {
                new Notice("An error occurred while cloning the chat.");
            }
            finally {
                cloningNotice.hide();
            }
        });
        this.handleClearChatClick = () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            (_a = this.dropdownMenuManager) === null || _a === void 0 ? void 0 : _a.closeMenu();
            const activeChat = yield ((_b = this.plugin.chatManager) === null || _b === void 0 ? void 0 : _b.getActiveChat());
            if (activeChat) {
                const chatName = activeChat.metadata.name;
                new ConfirmModal(this.app, "Clear Chat Messages", `Are you sure you want to clear all messages in chat "${chatName}"?\nThis action cannot be undone.`, () => {
                    this.plugin.chatManager.clearActiveChatMessages();
                }).open();
            }
            else {
                new Notice("No active chat to clear.");
            }
        });
        this.handleDeleteChatClick = () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            (_a = this.dropdownMenuManager) === null || _a === void 0 ? void 0 : _a.closeMenu();
            const activeChat = yield ((_b = this.plugin.chatManager) === null || _b === void 0 ? void 0 : _b.getActiveChat());
            if (activeChat) {
                const chatName = activeChat.metadata.name;
                new ConfirmModal(this.app, "Delete Chat", `Are you sure you want to delete chat "${chatName}"?\nThis action cannot be undone.`, () => __awaiter(this, void 0, void 0, function* () {
                    const success = yield this.plugin.chatManager.deleteChat(activeChat.metadata.id);
                    if (success) {
                        new Notice(`Chat "${chatName}" deleted.`);
                    }
                    else {
                        new Notice(`Failed to delete chat "${chatName}".`);
                    }
                })).open();
            }
            else {
                new Notice("No active chat to delete.");
            }
        });
        this.handleExportChatClick = () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            (_a = this.dropdownMenuManager) === null || _a === void 0 ? void 0 : _a.closeMenu();
            const activeChat = yield ((_b = this.plugin.chatManager) === null || _b === void 0 ? void 0 : _b.getActiveChat());
            if (!activeChat || activeChat.messages.length === 0) {
                new Notice("Chat empty, nothing to export.");
                return;
            }
            try {
                const markdownContent = this.formatChatToMarkdown(activeChat.messages);
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                const safeName = activeChat.metadata.name.replace(/[\\/?:*"<>|]/g, "-");
                const filename = `ollama-chat-${safeName}-${timestamp}.md`;
                let targetFolderPath = (_c = this.plugin.settings.chatExportFolderPath) === null || _c === void 0 ? void 0 : _c.trim();
                let targetFolder = null;
                if (targetFolderPath) {
                    targetFolderPath = normalizePath(targetFolderPath);
                    const abstractFile = this.app.vault.getAbstractFileByPath(targetFolderPath);
                    if (!abstractFile) {
                        try {
                            yield this.app.vault.createFolder(targetFolderPath);
                            targetFolder = this.app.vault.getAbstractFileByPath(targetFolderPath);
                            if (targetFolder) {
                                new Notice(`Created export folder: ${targetFolderPath}`);
                            }
                            else {
                                new Notice(`Error creating export folder. Saving to vault root.`);
                                targetFolder = this.app.vault.getRoot();
                            }
                        }
                        catch (err) {
                            new Notice(`Error creating export folder. Saving to vault root.`);
                            targetFolder = this.app.vault.getRoot();
                        }
                    }
                    else if (abstractFile instanceof TFolder) {
                        targetFolder = abstractFile;
                    }
                    else {
                        new Notice(`Error: Export path is not a folder. Saving to vault root.`);
                        targetFolder = this.app.vault.getRoot();
                    }
                }
                else {
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
                const file = yield this.app.vault.create(filePath, markdownContent);
                new Notice(`Chat exported to ${file.path}`);
            }
            catch (error) {
                if (error instanceof Error && error.message.includes("File already exists")) {
                    new Notice("Error exporting chat: File already exists.");
                }
                else {
                    new Notice("An unexpected error occurred during chat export.");
                }
            }
        });
        this.handleSettingsClick = () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            (_a = this.dropdownMenuManager) === null || _a === void 0 ? void 0 : _a.closeMenu();
            (_c = (_b = this.app.setting) === null || _b === void 0 ? void 0 : _b.open) === null || _c === void 0 ? void 0 : _c.call(_b);
            (_e = (_d = this.app.setting) === null || _d === void 0 ? void 0 : _d.openTabById) === null || _e === void 0 ? void 0 : _e.call(_d, this.plugin.manifest.id);
        });
        this.handleDocumentClickForMenu = (e) => {
            var _a;
            (_a = this.dropdownMenuManager) === null || _a === void 0 ? void 0 : _a.handleDocumentClick(e, this.menuButton);
        };
        this.handleModelChange = (modelName) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            this.updateModelDisplay(modelName);
            try {
                const chat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
                const temp = (_c = (_b = chat === null || chat === void 0 ? void 0 : chat.metadata) === null || _b === void 0 ? void 0 : _b.temperature) !== null && _c !== void 0 ? _c : this.plugin.settings.temperature;
                this.updateTemperatureIndicator(temp);
                if (chat && this.currentMessages.length > 0) {
                    yield ((_d = this.plugin.chatManager) === null || _d === void 0 ? void 0 : _d.addMessageToActiveChat("system", `Model changed to: ${modelName}`, new Date()));
                }
            }
            catch (error) { }
        });
        this.handleRoleChange = (roleName) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const displayRole = roleName || "None";
            this.updateInputPlaceholder(displayRole);
            this.updateRoleDisplay(displayRole);
            try {
                const chat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
                if (chat && this.currentMessages.length > 0) {
                    yield ((_b = this.plugin.chatManager) === null || _b === void 0 ? void 0 : _b.addMessageToActiveChat("system", `Role changed to: ${displayRole}`, new Date()));
                }
                else {
                    new Notice(`Role set to: ${displayRole}`);
                }
            }
            catch (error) {
                new Notice(`Role set to: ${displayRole}`);
            }
        });
        this.handleRolesUpdated = () => {
            var _a, _b;
            (_a = this.plugin.promptService) === null || _a === void 0 ? void 0 : _a.clearRoleCache();
            if (this.dropdownMenuManager) {
                this.dropdownMenuManager
                    .updateRoleListIfVisible()
                    .catch(e => this.plugin.logger.error("Error updating role dropdown list:", e));
            }
            if ((_b = this.sidebarManager) === null || _b === void 0 ? void 0 : _b.isSectionVisible("roles")) {
                this.sidebarManager.updateRoleList().catch(e => this.plugin.logger.error("Error updating role panel list:", e));
            }
            else {
            }
        };
        this.handleMessagesCleared = (chatId) => {
            var _a;
            if (chatId === ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChatId())) {
                this.clearChatContainerInternal();
                this.currentMessages = [];
                this.showEmptyState();
            }
        };
        this.handleVisibilityChange = () => {
            if (document.visibilityState === "visible" && this.leaf.view === this) {
                requestAnimationFrame(() => {
                    var _a;
                    this.guaranteedScrollToBottom(50, true);
                    this.adjustTextareaHeight();
                    (_a = this.inputEl) === null || _a === void 0 ? void 0 : _a.focus();
                });
            }
        };
        this.handleActiveLeafChange = (leaf) => {
            var _a;
            if ((leaf === null || leaf === void 0 ? void 0 : leaf.view) === this) {
                (_a = this.inputEl) === null || _a === void 0 ? void 0 : _a.focus();
                setTimeout(() => this.guaranteedScrollToBottom(150, true), 100);
            }
        };
        this.handleWindowResize = () => {
            if (this.resizeTimeout)
                clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 100);
        };
        this.handleScroll = () => {
            if (!this.chatContainer || !this.newMessagesIndicatorEl || !this.scrollToBottomButton)
                return;
            const threshold = 150;
            const atBottom = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight < threshold;
            const previousScrolledUp = this.userScrolledUp;
            this.userScrolledUp = !atBottom;
            if (previousScrolledUp && atBottom) {
                this.newMessagesIndicatorEl.classList.remove(CSS_CLASS_VISIBLE);
            }
            this.scrollToBottomButton.classList.toggle(CSS_CLASS_VISIBLE, this.userScrolledUp);
        };
        this.handleNewMessageIndicatorClick = () => {
            var _a, _b;
            if (this.chatContainer) {
                this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: "smooth" });
            }
            (_a = this.newMessagesIndicatorEl) === null || _a === void 0 ? void 0 : _a.classList.remove(CSS_CLASS_VISIBLE);
            (_b = this.scrollToBottomButton) === null || _b === void 0 ? void 0 : _b.classList.remove(CSS_CLASS_VISIBLE);
            this.userScrolledUp = false;
        };
        this.handleScrollToBottomClick = () => {
            var _a, _b;
            if (this.chatContainer) {
                this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: "smooth" });
            }
            (_a = this.scrollToBottomButton) === null || _a === void 0 ? void 0 : _a.classList.remove(CSS_CLASS_VISIBLE);
            (_b = this.newMessagesIndicatorEl) === null || _b === void 0 ? void 0 : _b.classList.remove(CSS_CLASS_VISIBLE);
            this.userScrolledUp = false;
        };
        this.adjustTextareaHeight = () => {
            requestAnimationFrame(() => {
                if (!this.inputEl)
                    return;
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
        this.handleChatListUpdated = () => {
            this.scheduleSidebarChatListUpdate();
            if (this.dropdownMenuManager) {
                this.dropdownMenuManager
                    .updateChatListIfVisible()
                    .catch(e => this.plugin.logger.error("Error updating chat dropdown list:", e));
            }
        };
        this.handleSettingsUpdated = () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            const activeChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
            const currentModelName = ((_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.modelName) || this.plugin.settings.modelName;
            const currentRolePath = (_d = (_c = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _c === void 0 ? void 0 : _c.selectedRolePath) !== null && _d !== void 0 ? _d : this.plugin.settings.selectedRolePath;
            const currentRoleName = yield this.findRoleNameByPath(currentRolePath);
            const currentTemperature = (_f = (_e = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _e === void 0 ? void 0 : _e.temperature) !== null && _f !== void 0 ? _f : this.plugin.settings.temperature;
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
            if ((_g = this.sidebarManager) === null || _g === void 0 ? void 0 : _g.isSectionVisible("roles")) {
                yield this.sidebarManager
                    .updateRoleList()
                    .catch(e => this.plugin.logger.error("Error updating role panel list:", e));
            }
            else {
            }
            if ((_h = this.sidebarManager) === null || _h === void 0 ? void 0 : _h.isSectionVisible("chats")) {
                yield this.sidebarManager
                    .updateChatList()
                    .catch(e => this.plugin.logger.error("Error updating chat panel list:", e));
            }
            else {
            }
        });
        this.handleRoleDisplayClick = (event) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const menu = new Menu();
            let itemsAdded = false;
            try {
                const roles = yield this.plugin.listRoleFiles(true);
                const activeChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
                const currentRolePath = (_c = (_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.selectedRolePath) !== null && _c !== void 0 ? _c : this.plugin.settings.selectedRolePath;
                menu.addItem(item => {
                    item
                        .setTitle("None")
                        .setIcon(!currentRolePath ? "check" : "slash")
                        .onClick(() => __awaiter(this, void 0, void 0, function* () {
                        var _a, _b;
                        const newRolePath = "";
                        if (currentRolePath !== newRolePath) {
                            if (activeChat) {
                                yield this.plugin.chatManager.updateActiveChatMetadata({
                                    selectedRolePath: newRolePath,
                                });
                            }
                            else {
                                this.plugin.settings.selectedRolePath = newRolePath;
                                yield this.plugin.saveSettings();
                                this.plugin.emit("role-changed", "None");
                                (_b = (_a = this.plugin.promptService) === null || _a === void 0 ? void 0 : _a.clearRoleCache) === null || _b === void 0 ? void 0 : _b.call(_a);
                            }
                        }
                    }));
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
                            .onClick(() => __awaiter(this, void 0, void 0, function* () {
                            var _a, _b;
                            const newRolePath = roleInfo.path;
                            if (currentRolePath !== newRolePath) {
                                if (activeChat) {
                                    yield this.plugin.chatManager.updateActiveChatMetadata({
                                        selectedRolePath: newRolePath,
                                    });
                                }
                                else {
                                    this.plugin.settings.selectedRolePath = newRolePath;
                                    yield this.plugin.saveSettings();
                                    this.plugin.emit("role-changed", roleInfo.name);
                                    (_b = (_a = this.plugin.promptService) === null || _a === void 0 ? void 0 : _a.clearRoleCache) === null || _b === void 0 ? void 0 : _b.call(_a);
                                }
                            }
                        }));
                        itemsAdded = true;
                    });
                });
            }
            catch (error) {
                console.error("Error loading roles for role selection menu:", error);
                if (!itemsAdded) {
                    menu.addItem(item => item.setTitle("Error loading roles").setDisabled(true));
                    itemsAdded = true;
                }
                new Notice("Failed to load roles.");
            }
            finally {
                if (itemsAdded) {
                    menu.showAtMouseEvent(event);
                }
                else {
                }
            }
        });
        this.handleTemperatureClick = () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const activeChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
            if (!activeChat) {
                new Notice("Select or create a chat to change temperature.");
                return;
            }
            const currentTemp = (_b = activeChat.metadata.temperature) !== null && _b !== void 0 ? _b : this.plugin.settings.temperature;
            const currentTempString = currentTemp !== null && currentTemp !== undefined ? String(currentTemp) : "";
            new PromptModal(this.app, "Set Temperature", `Enter new temperature (e.g., 0.7). Higher values = more creative, lower = more focused.`, currentTempString, (newValue) => __awaiter(this, void 0, void 0, function* () {
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
                    yield this.plugin.chatManager.updateActiveChatMetadata({
                        temperature: newTemp,
                    });
                    this.updateTemperatureIndicator(newTemp);
                    new Notice(`Temperature set to ${newTemp} for chat "${activeChat.metadata.name}".`);
                }
                catch (error) {
                    new Notice("Error setting temperature.");
                }
            })).open();
        });
        this.handleToggleViewLocationClick = () => __awaiter(this, void 0, void 0, function* () {
            var _a;
            (_a = this.dropdownMenuManager) === null || _a === void 0 ? void 0 : _a.closeMenu();
            const currentSetting = this.plugin.settings.openChatInTab;
            const newSetting = !currentSetting;
            this.plugin.settings.openChatInTab = newSetting;
            yield this.plugin.saveSettings();
            this.app.workspace.detachLeavesOfType(VIEW_TYPE_OLLAMA_PERSONAS);
            setTimeout(() => {
                this.plugin.activateView();
            }, 50);
        });
        this.updateChatPanelList = () => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const container = this.chatPanelListEl;
            if (!container || !this.plugin.chatManager) {
                return;
            }
            if (((_a = this.chatPanelHeaderEl) === null || _a === void 0 ? void 0 : _a.getAttribute("data-collapsed")) === "true") {
                return;
            }
            const currentScrollTop = container.scrollTop;
            container.empty();
            try {
                const chats = this.plugin.chatManager.listAvailableChats() || [];
                const currentActiveId = this.plugin.chatManager.getActiveChatId();
                if (chats.length === 0) {
                    container.createDiv({ cls: "menu-info-text", text: "No saved chats yet." });
                }
                else {
                    chats.forEach(chatMeta => {
                        const chatOptionEl = container.createDiv({
                            cls: [CSS_ROLE_PANEL_ITEM, CSS_CLASS_MENU_OPTION, CSS_CLASS_CHAT_LIST_ITEM],
                        });
                        const iconSpan = chatOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
                        if (chatMeta.id === currentActiveId) {
                            setIcon(iconSpan, "check");
                            chatOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
                        }
                        else {
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
                        this.registerDomEvent(chatOptionEl, "click", (e) => __awaiter(this, void 0, void 0, function* () {
                            var _a;
                            if (!(e.target instanceof Element && e.target.closest(`.${CSS_CHAT_ITEM_OPTIONS}`))) {
                                if (chatMeta.id !== ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChatId())) {
                                    yield this.plugin.chatManager.setActiveChat(chatMeta.id);
                                }
                            }
                        }));
                        this.registerDomEvent(optionsBtn, "click", e => {
                            e.stopPropagation();
                            this.showChatContextMenu(e, chatMeta);
                        });
                        this.registerDomEvent(chatOptionEl, "contextmenu", e => {
                            this.showChatContextMenu(e, chatMeta);
                        });
                    });
                }
            }
            catch (error) {
                container.empty();
                container.createDiv({ text: "Error loading chats.", cls: "menu-error-text" });
            }
            finally {
                requestAnimationFrame(() => {
                    if (container && container.isConnected) {
                        container.scrollTop = currentScrollTop;
                    }
                });
            }
        });
        this.handleMenuButtonClick = (e) => {
            var _a;
            (_a = this.dropdownMenuManager) === null || _a === void 0 ? void 0 : _a.toggleMenu(e);
        };
        this.onDragStart = (event) => {
            var _a;
            if (event.button !== 0)
                return;
            this.isResizing = true;
            this.initialMouseX = event.clientX;
            this.initialSidebarWidth = ((_a = this.sidebarRootEl) === null || _a === void 0 ? void 0 : _a.offsetWidth) || 250;
            event.preventDefault();
            event.stopPropagation();
            document.addEventListener("mousemove", this.boundOnDragMove, { capture: true });
            document.addEventListener("mouseup", this.boundOnDragEnd, { capture: true });
            document.body.style.cursor = "ew-resize";
            document.body.classList.add(CSS_CLASS_RESIZING);
        };
        this.onDragMove = (event) => {
            if (!this.isResizing || !this.sidebarRootEl)
                return;
            requestAnimationFrame(() => {
                if (!this.isResizing || !this.sidebarRootEl)
                    return;
                const currentMouseX = event.clientX;
                const deltaX = currentMouseX - this.initialMouseX;
                let newWidth = this.initialSidebarWidth + deltaX;
                const minWidth = 150;
                const containerWidth = this.contentEl.offsetWidth;
                const maxWidth = Math.max(minWidth + 50, containerWidth * 0.6);
                if (newWidth < minWidth)
                    newWidth = minWidth;
                if (newWidth > maxWidth)
                    newWidth = maxWidth;
                this.sidebarRootEl.style.width = `${newWidth}px`;
                this.sidebarRootEl.style.minWidth = `${newWidth}px`;
            });
        };
        this.onDragEnd = () => {
            if (!this.isResizing)
                return;
            this.isResizing = false;
            document.removeEventListener("mousemove", this.boundOnDragMove, { capture: true });
            document.removeEventListener("mouseup", this.boundOnDragEnd, { capture: true });
            document.body.style.cursor = "";
            document.body.classList.remove(CSS_CLASS_RESIZING);
            this.saveWidthDebounced();
        };
        // ... (решта коду класу) ...
        this.scheduleSidebarChatListUpdate = (delay = 50) => {
            if (this.chatListUpdateTimeoutId) {
                clearTimeout(this.chatListUpdateTimeoutId);
            }
            else {
                if (this.isChatListUpdateScheduled) {
                    return;
                }
                this.isChatListUpdateScheduled = true;
            }
            this.chatListUpdateTimeoutId = setTimeout(() => {
                var _a;
                if ((_a = this.sidebarManager) === null || _a === void 0 ? void 0 : _a.isSectionVisible("chats")) {
                    this.sidebarManager
                        .updateChatList()
                        .catch(e => this.plugin.logger.error("Error updating chat panel list via scheduleSidebarChatListUpdate:", e));
                }
                this.chatListUpdateTimeoutId = null;
                this.isChatListUpdateScheduled = false;
            }, delay);
        };
        this.handleActiveChatChanged = (data) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            if (this.isRegenerating && data.chatId === this.plugin.chatManager.getActiveChatId()) {
                this.lastProcessedChatId = data.chatId;
                return;
            }
            const chatSwitched = data.chatId !== this.lastProcessedChatId;
            let metadataWasUpdatedByLoad = false;
            if (chatSwitched || (data.chatId !== null && data.chat === null)) {
                this.lastProcessedChatId = data.chatId;
                const result = yield this.loadAndDisplayActiveChat();
                metadataWasUpdatedByLoad = result.metadataUpdated;
            }
            else if (data.chatId !== null && data.chat !== null) {
                this.lastProcessedChatId = data.chatId;
                const chat = data.chat;
                const currentRolePath = (_b = (_a = chat.metadata) === null || _a === void 0 ? void 0 : _a.selectedRolePath) !== null && _b !== void 0 ? _b : this.plugin.settings.selectedRolePath;
                const currentRoleName = yield this.findRoleNameByPath(currentRolePath);
                const currentModelName = ((_c = chat.metadata) === null || _c === void 0 ? void 0 : _c.modelName) || this.plugin.settings.modelName;
                const currentTemperature = (_e = (_d = chat.metadata) === null || _d === void 0 ? void 0 : _d.temperature) !== null && _e !== void 0 ? _e : this.plugin.settings.temperature;
                this.updateModelDisplay(currentModelName);
                this.updateRoleDisplay(currentRoleName);
                this.updateInputPlaceholder(currentRoleName);
                this.updateTemperatureIndicator(currentTemperature);
            }
            else if (data.chatId === null) {
                this.lastProcessedChatId = null;
                this.clearDisplayAndState();
            }
            else {
                this.lastProcessedChatId = data.chatId;
            }
            if (!metadataWasUpdatedByLoad) {
                this.scheduleSidebarChatListUpdate();
            }
            else {
            }
            if ((_f = this.sidebarManager) === null || _f === void 0 ? void 0 : _f.isSectionVisible("roles")) {
                this.sidebarManager
                    .updateRoleList()
                    .catch(e => this.plugin.logger.error("Error updating role panel list in handleActiveChatChanged:", e));
            }
            if (this.dropdownMenuManager) {
                this.dropdownMenuManager
                    .updateRoleListIfVisible()
                    .catch(e => this.plugin.logger.error("Error updating role dropdown list in handleActiveChatChanged:", e));
            }
        });
        this.plugin = plugin;
        this.app = plugin.app;
        this.initSpeechWorker();
        this.scrollListenerDebounced = debounce(this.handleScroll, 150, true);
        this.register(this.plugin.on("focus-input-request", () => {
            this.focusInput();
        }));
        this.boundOnDragMove = this.onDragMove.bind(this);
        this.boundOnDragEnd = this.onDragEnd.bind(this);
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
    getViewType() {
        return VIEW_TYPE_OLLAMA_PERSONAS;
    }
    getDisplayText() {
        return "AI Forge";
    }
    getIcon() {
        return "brain-circuit";
    }
    onOpen() {
        return __awaiter(this, void 0, void 0, function* () {
            this.createUIElements();
            const savedWidth = this.plugin.settings.sidebarWidth;
            if (this.sidebarRootEl && savedWidth && typeof savedWidth === "number" && savedWidth > 50) {
                this.sidebarRootEl.style.width = `${savedWidth}px`;
                this.sidebarRootEl.style.minWidth = `${savedWidth}px`;
            }
            else if (this.sidebarRootEl) {
                let defaultWidth = 250;
                try {
                    const cssVarWidth = getComputedStyle(this.sidebarRootEl).getPropertyValue("--ai-forge-sidebar-width").trim();
                    if (cssVarWidth && cssVarWidth.endsWith("px")) {
                        const parsedWidth = parseInt(cssVarWidth, 10);
                        if (!isNaN(parsedWidth) && parsedWidth > 50) {
                            defaultWidth = parsedWidth;
                        }
                    }
                }
                catch (e) { }
                this.sidebarRootEl.style.width = `${defaultWidth}px`;
                this.sidebarRootEl.style.minWidth = `${defaultWidth}px`;
                if (!savedWidth) {
                }
            }
            try {
                const initialRolePath = this.plugin.settings.selectedRolePath;
                const initialRoleName = yield this.findRoleNameByPath(initialRolePath);
                const initialModelName = this.plugin.settings.modelName;
                const initialTemperature = this.plugin.settings.temperature;
                this.updateInputPlaceholder(initialRoleName);
                this.updateRoleDisplay(initialRoleName);
                this.updateModelDisplay(initialModelName);
                this.updateTemperatureIndicator(initialTemperature);
            }
            catch (error) { }
            this.attachEventListeners();
            this.autoResizeTextarea();
            this.updateSendButtonState();
            try {
                yield this.loadAndDisplayActiveChat();
            }
            catch (error) {
                this.showEmptyState();
            }
            setTimeout(() => {
                if (this.inputEl && this.leaf.view === this && document.body.contains(this.inputEl)) {
                    this.inputEl.focus();
                }
                else {
                }
            }, 150);
            if (this.inputEl) {
                this.inputEl.dispatchEvent(new Event("input"));
            }
        });
    }
    onClose() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
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
            this.stopVoiceRecording(false);
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(t => t.stop());
                this.audioStream = null;
            }
            if (this.scrollTimeout)
                clearTimeout(this.scrollTimeout);
            if (this.resizeTimeout)
                clearTimeout(this.resizeTimeout);
            (_a = this.sidebarManager) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.dropdownMenuManager) === null || _b === void 0 ? void 0 : _b.destroy();
        });
    }
    createUIElements() {
        this.contentEl.empty();
        const flexContainer = this.contentEl.createDiv({ cls: "ollama-container" });
        const isSidebarLocation = !this.plugin.settings.openChatInTab;
        const isDesktop = Platform.isDesktop;
        this.sidebarManager = new SidebarManager(this.plugin, this.app, this);
        this.sidebarRootEl = this.sidebarManager.createSidebarUI(flexContainer);
        const shouldShowInternalSidebar = isDesktop && !isSidebarLocation;
        if (this.sidebarRootEl) {
            this.sidebarRootEl.classList.toggle("internal-sidebar-hidden", !shouldShowInternalSidebar);
        }
        else {
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
        this.dropdownMenuManager = new DropdownMenuManager(this.plugin, this.app, this, inputContainer, isSidebarLocation, isDesktop);
        this.dropdownMenuManager.createMenuUI();
    }
    attachEventListeners() {
        var _a;
        if (this.resizerEl) {
            this.registerDomEvent(this.resizerEl, "mousedown", this.onDragStart);
        }
        else {
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
        (_a = this.dropdownMenuManager) === null || _a === void 0 ? void 0 : _a.attachEventListeners();
        this.register(this.plugin.on("model-changed", modelName => this.handleModelChange(modelName)));
        this.register(this.plugin.on("role-changed", roleName => this.handleRoleChange(roleName)));
        this.register(this.plugin.on("roles-updated", () => this.handleRolesUpdated()));
        this.register(this.plugin.on("message-added", data => this.handleMessageAdded(data)));
        this.register(this.plugin.on("active-chat-changed", data => this.handleActiveChatChanged(data)));
        this.register(this.plugin.on("messages-cleared", chatId => this.handleMessagesCleared(chatId)));
        this.register(this.plugin.on("chat-list-updated", () => this.handleChatListUpdated()));
        this.register(this.plugin.on("settings-updated", () => this.handleSettingsUpdated()));
        this.register(this.plugin.on("message-deleted", data => this.handleMessageDeleted(data)));
        this.register(this.plugin.on("ollama-connection-error", () => { }));
    }
    updateToggleLocationButton() {
        if (!this.toggleLocationButton)
            return;
        let iconName;
        let titleText;
        if (this.plugin.settings.openChatInTab) {
            iconName = "sidebar-right";
            titleText = "Move to Sidebar";
        }
        else {
            iconName = "layout-list";
            titleText = "Move to Tab";
        }
        setIcon(this.toggleLocationButton, iconName);
        this.toggleLocationButton.setAttribute("aria-label", titleText);
        this.toggleLocationButton.title = titleText;
    }
    updateModelDisplay(modelName) {
        if (this.modelDisplayEl) {
            if (modelName) {
                const displayName = modelName;
                const shortName = displayName.replace(/:latest$/, "");
                this.modelDisplayEl.setText(shortName);
                this.modelDisplayEl.title = `Current model: ${displayName}. Click to change.`;
                this.modelDisplayEl.removeClass("model-not-available");
            }
            else {
                this.modelDisplayEl.setText("Not available");
                this.modelDisplayEl.title =
                    "No Ollama models detected. Check Ollama connection and ensure models are installed.";
                this.modelDisplayEl.addClass("model-not-available");
            }
        }
        else {
            console.error("[OllamaView] modelDisplayEl is missing!");
        }
    }
    handleContextMenuRename(chatId, currentName) {
        this.handleRenameChatClick(chatId, currentName);
    }
    addMessageStandard(message) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const isNewDay = !this.lastRenderedMessageDate || !this.isSameDay(this.lastRenderedMessageDate, message.timestamp);
            if (isNewDay) {
                this.renderDateSeparator(message.timestamp);
                this.lastRenderedMessageDate = message.timestamp;
            }
            else if (!this.lastRenderedMessageDate && ((_a = this.chatContainer) === null || _a === void 0 ? void 0 : _a.children.length) === 0) {
                this.lastRenderedMessageDate = message.timestamp;
            }
            this.hideEmptyState();
            let messageGroupEl = null;
            try {
                let renderer = null;
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
                        this.handleErrorMessage(message);
                        return;
                    case "tool":
                        renderer = new ToolMessageRenderer(this.app, this.plugin, message, this);
                        break;
                    default:
                        const unknownRoleGroup = (_b = this.chatContainer) === null || _b === void 0 ? void 0 : _b.createDiv({ cls: CSS_CLASSES.MESSAGE_GROUP });
                        if (unknownRoleGroup && this.chatContainer) {
                            RendererUtils.renderAvatar(this.app, this.plugin, unknownRoleGroup, false);
                            const wrapper = unknownRoleGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
                            const msgBubble = wrapper.createDiv({ cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.SYSTEM_MESSAGE}` });
                            msgBubble.createDiv({
                                cls: CSS_CLASSES.SYSTEM_MESSAGE_TEXT || "system-message-text",
                                text: `Internal Plugin Error: Unknown message role received by renderer: '${message.role}'. Message content was logged.`,
                            });
                            BaseMessageRenderer.addTimestamp(msgBubble, message.timestamp, this);
                            this.chatContainer.appendChild(unknownRoleGroup);
                            this.lastMessageElement = unknownRoleGroup;
                        }
                        return;
                }
                if (renderer) {
                    const result = renderer.render();
                    messageGroupEl = result instanceof Promise ? yield result : result;
                }
                else {
                    return;
                }
                if (messageGroupEl && this.chatContainer) {
                    this.chatContainer.appendChild(messageGroupEl);
                    this.lastMessageElement = messageGroupEl;
                    if (!messageGroupEl.isConnected) {
                    }
                    messageGroupEl.classList.add(CSS_CLASSES.MESSAGE_ARRIVING || "message-arriving");
                    setTimeout(() => messageGroupEl === null || messageGroupEl === void 0 ? void 0 : messageGroupEl.classList.remove(CSS_CLASSES.MESSAGE_ARRIVING || "message-arriving"), 500);
                    const isUserMessage = message.role === "user";
                    if (!isUserMessage && this.userScrolledUp && this.newMessagesIndicatorEl) {
                        this.newMessagesIndicatorEl.classList.add(CSS_CLASSES.VISIBLE || "visible");
                    }
                    else if (!this.userScrolledUp) {
                        const scrollDelay = this.isProcessing && message.role === "assistant" ? 30 : isUserMessage ? 50 : 100;
                        const forceScroll = (this.isProcessing && message.role === "assistant") || message.role === "tool" ? true : !isUserMessage;
                        this.guaranteedScrollToBottom(scrollDelay, forceScroll);
                    }
                    setTimeout(() => this.updateScrollStateAndIndicators(), 150);
                }
                else if (renderer) {
                }
            }
            catch (error) {
                try {
                    const errorNotice = `Failed to render message (Role: ${message === null || message === void 0 ? void 0 : message.role}). Check console for details.`;
                    const errorMsgObject = {
                        role: "error",
                        content: errorNotice,
                        timestamp: message.timestamp || new Date(),
                    };
                    this.handleErrorMessage(errorMsgObject);
                }
                catch (criticalError) {
                    new Notice("Critical error displaying message. Check console.");
                }
            }
        });
    }
    updateInputPlaceholder(roleName) {
        if (this.inputEl) {
            this.inputEl.placeholder = `Enter message text here...`;
        }
    }
    autoResizeTextarea() {
        this.adjustTextareaHeight();
    }
    updateRoleDisplay(roleName) {
        if (this.roleDisplayEl) {
            const displayName = roleName || "None";
            this.roleDisplayEl.setText(displayName);
            this.roleDisplayEl.title = `Current role: ${displayName}. Click to change.`;
        }
    }
    updateSendButtonState() {
        if (!this.inputEl || !this.sendButton || !this.stopGeneratingButton) {
            return;
        }
        const generationInProgress = this.currentAbortController !== null;
        const isInputEmpty = this.inputEl.value.trim() === "";
        if (generationInProgress) {
            this.stopGeneratingButton.show();
            this.sendButton.hide();
            this.sendButton.disabled = true;
        }
        else {
            this.stopGeneratingButton.hide();
            this.sendButton.show();
            const sendShouldBeDisabled = isInputEmpty || this.isProcessing;
            this.sendButton.disabled = sendShouldBeDisabled;
            this.sendButton.classList.toggle(CSS_CLASSES.DISABLED, sendShouldBeDisabled);
        }
    }
    // OllamaView.ts
    // ... (інші частини класу) ...
    showEmptyState(messageText = "No messages yet", // Текст за замовчуванням
    tipText // Опціональний текст підказки
    ) {
        var _a, _b;
        // Очищаємо попередній emptyStateEl, якщо він є, щоб уникнути дублікатів
        if (this.emptyStateEl) {
            this.emptyStateEl.remove();
            this.emptyStateEl = null;
        }
        // Перевіряємо умови (можливо, this.currentMessages.length === 0 тут не потрібне, 
        // бо ми викликаємо його, коли знаємо, що стан порожній)
        if (this.chatContainer) { // Переконуємося, що контейнер існує
            // this.chatContainer.empty(); // Очищаємо контейнер перед показом empty state
            // Якщо це не бажано (наприклад, якщо там є інші елементи), прибери цей рядок.
            // Але якщо chatContainer призначений тільки для повідомлень та emptyState, то це ок.
            this.emptyStateEl = this.chatContainer.createDiv({
                cls: CSS_CLASS_EMPTY_STATE, // Переконайся, що CSS_CLASS_EMPTY_STATE визначено
            });
            this.emptyStateEl.createEl("p", {
                cls: "empty-state-message",
                text: messageText,
            });
            const finalTipText = tipText !== undefined
                ? tipText
                : `Type a message or use the menu options to start interacting with ${((_b = (_a = this.plugin) === null || _a === void 0 ? void 0 : _a.settings) === null || _b === void 0 ? void 0 : _b.modelName) || "the AI"}.`;
            if (finalTipText) { // Додаємо підказку, тільки якщо вона є
                this.emptyStateEl.createEl("p", {
                    cls: "empty-state-tip",
                    text: finalTipText,
                });
            }
        }
    }
    hideEmptyState() {
        if (this.emptyStateEl) {
            this.emptyStateEl.remove();
            this.emptyStateEl = null;
        }
    }
    // ... (решта класу) ...
    setLoadingState(isLoading) {
        this.isProcessing = isLoading;
        if (this.inputEl)
            this.inputEl.disabled = isLoading;
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
                this.chatContainer.querySelectorAll(`.${CSS_CLASSES.SHOW_MORE_BUTTON}`).forEach(button => {
                    button.style.display = "none";
                });
            }
            else {
                this.checkAllMessagesForCollapsing();
            }
        }
    }
    handleDeleteMessageClick(messageToDelete) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const activeChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
            if (!activeChat) {
                new Notice("Cannot delete message: No active chat.");
                return;
            }
            new ConfirmModal(this.app, "Confirm Message Deletion", `Are you sure you want to delete this message?\n"${messageToDelete.content.substring(0, 100)}${messageToDelete.content.length > 100 ? "..." : ""}"\n\nThis action cannot be undone.`, () => __awaiter(this, void 0, void 0, function* () {
                try {
                    const deleteSuccess = yield this.plugin.chatManager.deleteMessageByTimestamp(activeChat.metadata.id, messageToDelete.timestamp);
                    if (deleteSuccess) {
                        new Notice("Message deleted.");
                    }
                    else {
                        new Notice("Failed to delete message.");
                    }
                }
                catch (error) {
                    new Notice("An error occurred while deleting the message.");
                }
            })).open();
        });
    }
    handleCopyClick(content, buttonEl) {
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
    handleTranslateClick(originalContent, contentEl, buttonEl) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
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
                }
                else {
                    textToTranslate = decodedContent.trim();
                }
                if (!textToTranslate) {
                    new Notice("Nothing to translate (content might be empty after removing internal tags).");
                    return;
                }
            }
            catch (error) {
                new Notice("Failed to prepare text for translation.");
                return;
            }
            (_a = contentEl.querySelector(`.${CSS_CLASS_TRANSLATION_CONTAINER}`)) === null || _a === void 0 ? void 0 : _a.remove();
            const originalIcon = ((_b = buttonEl.querySelector(".svg-icon")) === null || _b === void 0 ? void 0 : _b.getAttribute("icon-name")) || "languages";
            setIcon(buttonEl, "loader");
            buttonEl.disabled = true;
            buttonEl.classList.add(CSS_CLASS_TRANSLATION_PENDING);
            const originalTitle = buttonEl.title;
            buttonEl.setAttribute("title", "Translating...");
            buttonEl.addClass("button-loading");
            try {
                const translatedText = yield this.plugin.translationService.translate(textToTranslate, targetLang);
                if (!contentEl || !contentEl.isConnected) {
                    return;
                }
                if (translatedText !== null) {
                    const translationContainer = contentEl.createDiv({ cls: CSS_CLASS_TRANSLATION_CONTAINER });
                    const translationContentEl = translationContainer.createDiv({ cls: CSS_CLASS_TRANSLATION_CONTENT });
                    yield MarkdownRenderer.render(this.app, translatedText, translationContentEl, (_d = (_c = this.plugin.app.vault.getRoot()) === null || _c === void 0 ? void 0 : _c.path) !== null && _d !== void 0 ? _d : "", this);
                    RendererUtils.fixBrokenTwemojiImages(translationContentEl);
                    const targetLangName = LANGUAGES[targetLang] || targetLang;
                    translationContainer.createEl("div", {
                        cls: "translation-indicator",
                        text: `[Translated to ${targetLangName}]`,
                    });
                    this.guaranteedScrollToBottom(50, false);
                }
            }
            catch (error) {
            }
            finally {
                if (buttonEl === null || buttonEl === void 0 ? void 0 : buttonEl.isConnected) {
                    setIcon(buttonEl, originalIcon);
                    buttonEl.disabled = false;
                    buttonEl.classList.remove(CSS_CLASS_TRANSLATION_PENDING);
                    buttonEl.setAttribute("title", originalTitle);
                    buttonEl.removeClass("button-loading");
                }
            }
        });
    }
    renderDateSeparator(date) {
        if (!this.chatContainer)
            return;
        this.chatContainer.createDiv({
            cls: CSS_CLASS_DATE_SEPARATOR,
            text: this.formatDateSeparator(date),
        });
    }
    initSpeechWorker() {
        try {
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
        }
        catch (error) {
            new Notice("Speech recognition feature failed to initialize.");
            this.speechWorker = null;
        }
    }
    setupSpeechWorkerHandlers() {
        if (!this.speechWorker)
            return;
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
            }
            else if (typeof data !== "string") {
            }
            this.updateSendButtonState();
        };
        this.speechWorker.onerror = () => {
            new Notice("An unexpected error occurred in the speech recognition worker.");
            this.updateInputPlaceholder(this.plugin.settings.modelName);
            this.stopVoiceRecording(false);
        };
    }
    insertTranscript(transcript) {
        var _a, _b;
        if (!this.inputEl)
            return;
        const currentVal = this.inputEl.value;
        const start = (_a = this.inputEl.selectionStart) !== null && _a !== void 0 ? _a : currentVal.length;
        const end = (_b = this.inputEl.selectionEnd) !== null && _b !== void 0 ? _b : currentVal.length;
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
    toggleVoiceRecognition() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
                this.stopVoiceRecording(true);
            }
            else {
                yield this.startVoiceRecognition();
            }
        });
    }
    startVoiceRecognition() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!this.speechWorker) {
                new Notice("Функція розпізнавання мовлення недоступна (worker не ініціалізовано).");
                return;
            }
            const speechApiKey = this.plugin.settings.googleApiKey;
            if (!speechApiKey) {
                new Notice("Ключ Google API для розпізнавання мовлення не налаштовано. Будь ласка, додайте його в налаштуваннях плагіна.");
                return;
            }
            try {
                this.audioStream = yield navigator.mediaDevices.getUserMedia({
                    audio: true,
                });
                let recorderOptions;
                const preferredMimeType = "audio/webm;codecs=opus";
                if (MediaRecorder.isTypeSupported(preferredMimeType)) {
                    recorderOptions = { mimeType: preferredMimeType };
                }
                else {
                    recorderOptions = undefined;
                }
                this.mediaRecorder = new MediaRecorder(this.audioStream, recorderOptions);
                const audioChunks = [];
                (_a = this.voiceButton) === null || _a === void 0 ? void 0 : _a.classList.add(CSS_CLASS_RECORDING);
                setIcon(this.voiceButton, "stop-circle");
                this.inputEl.placeholder = "Recording... Speak now.";
                this.mediaRecorder.ondataavailable = event => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };
                this.mediaRecorder.onstop = () => {
                    var _a;
                    if (this.speechWorker && audioChunks.length > 0) {
                        const audioBlob = new Blob(audioChunks, {
                            type: ((_a = this.mediaRecorder) === null || _a === void 0 ? void 0 : _a.mimeType) || "audio/webm",
                        });
                        this.inputEl.placeholder = "Processing speech...";
                        this.speechWorker.postMessage({
                            apiKey: speechApiKey,
                            audioBlob,
                            languageCode: this.plugin.settings.speechLanguage || "uk-UA",
                        });
                    }
                    else if (audioChunks.length === 0) {
                        this.getCurrentRoleDisplayName().then(roleName => this.updateInputPlaceholder(roleName));
                        this.updateSendButtonState();
                    }
                };
                this.mediaRecorder.onerror = () => {
                    new Notice("An error occurred during recording.");
                    this.stopVoiceRecording(false);
                };
                this.mediaRecorder.start();
            }
            catch (error) {
                if (error instanceof DOMException && error.name === "NotAllowedError") {
                    new Notice("Microphone access denied. Please grant permission.");
                }
                else if (error instanceof DOMException && error.name === "NotFoundError") {
                    new Notice("Microphone not found. Please ensure it's connected and enabled.");
                }
                else {
                    new Notice("Could not start voice recording.");
                }
                this.stopVoiceRecording(false);
            }
        });
    }
    stopVoiceRecording(processAudio) {
        var _a, _b;
        if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
            this.mediaRecorder.stop();
        }
        else if (!processAudio && ((_a = this.mediaRecorder) === null || _a === void 0 ? void 0 : _a.state) === "inactive") {
        }
        (_b = this.voiceButton) === null || _b === void 0 ? void 0 : _b.classList.remove(CSS_CLASS_RECORDING);
        setIcon(this.voiceButton, "mic");
        this.getCurrentRoleDisplayName().then(roleName => this.updateInputPlaceholder(roleName));
        this.updateSendButtonState();
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }
        this.mediaRecorder = null;
    }
    checkAllMessagesForCollapsing() {
        var _a;
        (_a = this.chatContainer) === null || _a === void 0 ? void 0 : _a.querySelectorAll(`.${CSS_CLASS_MESSAGE}`).forEach(msgEl => {
            this.checkMessageForCollapsing(msgEl);
        });
    }
    toggleMessageCollapse(contentEl, buttonEl) {
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
        }
        else {
            const isCollapsed = contentEl.classList.contains(CSS_CLASS_CONTENT_COLLAPSED);
            if (isCollapsed) {
                contentEl.style.maxHeight = "";
                contentEl.classList.remove(CSS_CLASS_CONTENT_COLLAPSED);
                buttonEl.setText("Show Less ▲");
            }
            else {
                contentEl.style.maxHeight = `${maxHeightLimit}px`;
                contentEl.classList.add(CSS_CLASS_CONTENT_COLLAPSED);
                buttonEl.setText("Show More ▼");
                setTimeout(() => {
                    contentEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }, 310);
            }
        }
    }
    getChatContainer() {
        return this.chatContainer;
    }
    clearChatContainerInternal() {
        this.currentMessages = [];
        this.lastRenderedMessageDate = null;
        if (this.chatContainer)
            this.chatContainer.empty();
        this.hideEmptyState();
        this.lastMessageElement = null;
        this.consecutiveErrorMessages = [];
        this.errorGroupElement = null;
        this.isSummarizingErrors = false;
    }
    clearDisplayAndState() {
        this.clearChatContainerInternal();
        this.showEmptyState();
        this.updateSendButtonState();
        setTimeout(() => this.focusInput(), 50);
    }
    scrollToBottom() {
        this.guaranteedScrollToBottom(50, true);
    }
    clearInputField() {
        if (this.inputEl) {
            this.inputEl.value = "";
            this.inputEl.dispatchEvent(new Event("input"));
        }
    }
    focusInput() {
        setTimeout(() => {
            var _a;
            (_a = this.inputEl) === null || _a === void 0 ? void 0 : _a.focus();
        }, 0);
    }
    guaranteedScrollToBottom(delay = 50, forceScroll = false) {
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = null;
        }
        this.scrollTimeout = setTimeout(() => {
            requestAnimationFrame(() => {
                var _a, _b;
                if (this.chatContainer) {
                    const threshold = 100;
                    const isScrolledUp = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight >
                        threshold;
                    if (isScrolledUp !== this.userScrolledUp) {
                        this.userScrolledUp = isScrolledUp;
                        if (!isScrolledUp)
                            (_a = this.newMessagesIndicatorEl) === null || _a === void 0 ? void 0 : _a.classList.remove(CSS_CLASS_VISIBLE);
                    }
                    if (forceScroll || !this.userScrolledUp || this.isProcessing) {
                        const behavior = this.isProcessing ? "auto" : "smooth";
                        this.chatContainer.scrollTo({
                            top: this.chatContainer.scrollHeight,
                            behavior: behavior,
                        });
                        if (forceScroll) {
                            this.userScrolledUp = false;
                            (_b = this.newMessagesIndicatorEl) === null || _b === void 0 ? void 0 : _b.classList.remove(CSS_CLASS_VISIBLE);
                        }
                    }
                }
                else {
                }
            });
            this.scrollTimeout = null;
        }, delay);
    }
    formatTime(date) {
        return date.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
        });
    }
    formatDateSeparator(date) {
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (this.isSameDay(date, now))
            return "Today";
        else if (this.isSameDay(date, yesterday))
            return "Yesterday";
        else
            return date.toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
            });
    }
    formatRelativeDate(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) {
            return "Invalid date";
        }
        const now = new Date();
        const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
        const diffDays = Math.floor(diffSeconds / (60 * 60 * 24));
        if (diffDays === 0) {
            const diffHours = Math.floor(diffSeconds / (60 * 60));
            if (diffHours < 1)
                return "Just now";
            if (diffHours === 1)
                return "1 hour ago";
            if (diffHours < now.getHours())
                return `${diffHours} hours ago`;
            else
                return "Today";
        }
        else if (diffDays === 1) {
            return "Yesterday";
        }
        else if (diffDays < 7) {
            return `${diffDays} days ago`;
        }
        else {
            return date.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
            });
        }
    }
    isSameDay(date1, date2) {
        return (date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate());
    }
    formatChatToMarkdown(messagesToFormat) {
        let localLastDate = null;
        const exportTimestamp = new Date();
        let markdown = `# AI Forge Chat Export\n` + `> Exported on: ${exportTimestamp.toLocaleString(undefined)}\n\n`;
        messagesToFormat.forEach(message => {
            var _a;
            if (!((_a = message.content) === null || _a === void 0 ? void 0 : _a.trim()))
                return;
            if (localLastDate === null || !this.isSameDay(localLastDate, message.timestamp)) {
                if (localLastDate !== null)
                    markdown += `***\n`;
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
            }
            markdown += prefix;
            if (contentPrefix) {
                markdown +=
                    content
                        .split("\n")
                        .map(line => (line.trim() ? `${contentPrefix}${line}` : contentPrefix.trim()))
                        .join(`\n`) + "\n\n";
            }
            else if (content.includes("```")) {
                content = content.replace(/(\n*\s*)```/g, "\n\n```").replace(/```(\s*\n*)/g, "```\n\n");
                markdown += content.trim() + "\n\n";
            }
            else {
                markdown +=
                    content
                        .split("\n")
                        .map(line => (line.trim() ? line : ""))
                        .join("\n") + "\n\n";
            }
        });
        return markdown.trim();
    }
    getCurrentRoleDisplayName() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            try {
                const activeChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
                const rolePath = (_c = (_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.selectedRolePath) !== null && _c !== void 0 ? _c : this.plugin.settings.selectedRolePath;
                if (rolePath) {
                    const allRoles = yield this.plugin.listRoleFiles(true);
                    const foundRole = allRoles.find(role => role.path === rolePath);
                    if (foundRole) {
                        return foundRole.name;
                    }
                    else {
                        console.warn(`Role with path "${rolePath}" not found in listRoleFiles results.`);
                        return ((_d = rolePath.split("/").pop()) === null || _d === void 0 ? void 0 : _d.replace(".md", "")) || "Selected Role";
                    }
                }
            }
            catch (error) {
                console.error("Error getting current role display name:", error);
            }
            return "None";
        });
    }
    updateTemperatureIndicator(temperature) {
        if (!this.temperatureIndicatorEl)
            return;
        const tempValue = temperature !== null && temperature !== void 0 ? temperature : this.plugin.settings.temperature;
        const emoji = this.getTemperatureEmoji(tempValue);
        this.temperatureIndicatorEl.setText(emoji);
        this.temperatureIndicatorEl.title = `Temperature: ${tempValue.toFixed(1)}. Click to change.`;
    }
    getTemperatureEmoji(temperature) {
        if (temperature <= 0.4) {
            return "🧊";
        }
        else if (temperature > 0.4 && temperature <= 0.6) {
            return "🙂";
        }
        else {
            return "🤪";
        }
    }
    updateToggleViewLocationOption() {
        var _a;
        (_a = this.dropdownMenuManager) === null || _a === void 0 ? void 0 : _a.updateToggleViewLocationOption();
    }
    findRoleNameByPath(rolePath) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!rolePath) {
                return "None";
            }
            try {
                const allRoles = yield this.plugin.listRoleFiles(true);
                const foundRole = allRoles.find(role => role.path === rolePath);
                if (foundRole) {
                    return foundRole.name;
                }
                else {
                    const fileName = (_a = rolePath.split("/").pop()) === null || _a === void 0 ? void 0 : _a.replace(".md", "");
                    return fileName || "Unknown Role";
                }
            }
            catch (error) {
                return "Error";
            }
        });
    }
    showChatContextMenu(event, chatMeta) {
        event.preventDefault();
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
                .onClick(() => this.handleContextMenuClear(chatMeta.id, chatMeta.name));
            try {
                item.el.addClass("danger-option");
            }
            catch (e) { }
        });
        menu.addItem(item => {
            item
                .setTitle("Delete Chat")
                .setIcon("lucide-trash-2")
                .onClick(() => this.handleContextMenuDelete(chatMeta.id, chatMeta.name));
            try {
                item.el.addClass("danger-option");
            }
            catch (e) { }
        });
        menu.showAtMouseEvent(event);
    }
    handleContextMenuClone(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const cloningNotice = new Notice("Cloning chat...", 0);
            try {
                const clonedChat = yield this.plugin.chatManager.cloneChat(chatId);
                if (clonedChat) {
                    new Notice(`Chat cloned as "${clonedChat.metadata.name}" and activated.`);
                }
                else {
                }
            }
            catch (error) {
                new Notice("Error cloning chat.");
            }
            finally {
                cloningNotice.hide();
            }
        });
    }
    exportSpecificChat(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const exportingNotice = new Notice(`Exporting chat...`, 0);
            try {
                const chat = yield this.plugin.chatManager.getChat(chatId);
                if (!chat || chat.messages.length === 0) {
                    new Notice("Chat is empty or not found, nothing to export.");
                    exportingNotice.hide();
                    return;
                }
                const markdownContent = this.formatChatToMarkdown(chat.messages);
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                const safeName = chat.metadata.name.replace(/[\\/?:*"<>|]/g, "-");
                const filename = `ollama-chat-${safeName}-${timestamp}.md`;
                let targetFolderPath = (_a = this.plugin.settings.chatExportFolderPath) === null || _a === void 0 ? void 0 : _a.trim();
                let targetFolder = null;
                if (targetFolderPath) {
                    targetFolderPath = normalizePath(targetFolderPath);
                    const abstractFile = this.app.vault.getAbstractFileByPath(targetFolderPath);
                    if (!abstractFile) {
                        try {
                            yield this.app.vault.createFolder(targetFolderPath);
                            targetFolder = this.app.vault.getAbstractFileByPath(targetFolderPath);
                            if (targetFolder)
                                new Notice(`Created export folder: ${targetFolderPath}`);
                        }
                        catch (err) {
                            new Notice(`Error creating export folder. Saving to vault root.`);
                            targetFolder = this.app.vault.getRoot();
                        }
                    }
                    else if (abstractFile instanceof TFolder) {
                        targetFolder = abstractFile;
                    }
                    else {
                        new Notice(`Error: Export path is not a folder. Saving to vault root.`);
                        targetFolder = this.app.vault.getRoot();
                    }
                }
                else {
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
                const file = yield this.app.vault.create(filePath, markdownContent);
                new Notice(`Chat exported to ${file.path}`);
            }
            catch (error) {
                new Notice("An error occurred during chat export.");
            }
            finally {
                exportingNotice.hide();
            }
        });
    }
    handleContextMenuClear(chatId, chatName) {
        return __awaiter(this, void 0, void 0, function* () {
            new ConfirmModal(this.app, "Confirm Clear Messages", `Are you sure you want to clear all messages in chat "${chatName}"?\nThis action cannot be undone.`, () => __awaiter(this, void 0, void 0, function* () {
                const clearingNotice = new Notice("Clearing messages...", 0);
                try {
                    const success = yield this.plugin.chatManager.clearChatMessagesById(chatId);
                    if (success) {
                        new Notice(`Messages cleared for chat "${chatName}".`);
                    }
                    else {
                        new Notice(`Failed to clear messages for chat "${chatName}".`);
                    }
                }
                catch (error) {
                    new Notice("Error clearing messages.");
                }
                finally {
                    clearingNotice.hide();
                }
            })).open();
        });
    }
    handleContextMenuDelete(chatId, chatName) {
        return __awaiter(this, void 0, void 0, function* () {
            new ConfirmModal(this.app, "Confirm Delete Chat", `Are you sure you want to delete chat "${chatName}"?\nThis action cannot be undone.`, () => __awaiter(this, void 0, void 0, function* () {
                const deletingNotice = new Notice("Deleting chat...", 0);
                try {
                    const success = yield this.plugin.chatManager.deleteChat(chatId);
                    if (success) {
                        new Notice(`Chat "${chatName}" deleted.`);
                    }
                    else {
                    }
                }
                catch (error) {
                    new Notice("Error deleting chat.");
                }
                finally {
                    deletingNotice.hide();
                }
            })).open();
        });
    }
    isChatScrolledUp() {
        if (!this.chatContainer)
            return false;
        const scrollableDistance = this.chatContainer.scrollHeight - this.chatContainer.clientHeight;
        if (scrollableDistance <= 0)
            return false;
        const distanceFromBottom = scrollableDistance - this.chatContainer.scrollTop;
        return distanceFromBottom >= SCROLL_THRESHOLD;
    }
    updateScrollStateAndIndicators() {
        var _a, _b;
        if (!this.chatContainer)
            return;
        const wasScrolledUp = this.userScrolledUp;
        this.userScrolledUp = this.isChatScrolledUp();
        (_a = this.scrollToBottomButton) === null || _a === void 0 ? void 0 : _a.classList.toggle(CSS_CLASS_VISIBLE, this.userScrolledUp);
        if (wasScrolledUp && !this.userScrolledUp) {
            (_b = this.newMessagesIndicatorEl) === null || _b === void 0 ? void 0 : _b.classList.remove(CSS_CLASS_VISIBLE);
        }
    }
    checkMessageForCollapsing(messageElOrGroupEl) {
        const messageGroupEl = messageElOrGroupEl.classList.contains(CSS_CLASSES.MESSAGE_GROUP)
            ? messageElOrGroupEl
            : messageElOrGroupEl.closest(`.${CSS_CLASSES.MESSAGE_GROUP}`);
        if (!messageGroupEl) {
            return;
        }
        const contentCollapsible = messageGroupEl.querySelector(`.${CSS_CLASSES.CONTENT_COLLAPSIBLE}`);
        const messageEl = messageGroupEl.querySelector(`.${CSS_CLASSES.MESSAGE}`);
        if (!contentCollapsible || !messageEl) {
            return;
        }
        const maxH = this.plugin.settings.maxMessageHeight;
        const isStreamingNow = this.isProcessing &&
            messageGroupEl.classList.contains("placeholder") &&
            messageGroupEl.hasAttribute("data-placeholder-timestamp") &&
            contentCollapsible.classList.contains("streaming-text");
        if (isStreamingNow) {
            const existingButton = messageEl.querySelector(`.${CSS_CLASSES.SHOW_MORE_BUTTON}`);
            existingButton === null || existingButton === void 0 ? void 0 : existingButton.remove();
            contentCollapsible.style.maxHeight = "";
            contentCollapsible.classList.remove(CSS_CLASS_CONTENT_COLLAPSED);
            return;
        }
        if (maxH <= 0) {
            const existingButton = messageEl.querySelector(`.${CSS_CLASSES.SHOW_MORE_BUTTON}`);
            existingButton === null || existingButton === void 0 ? void 0 : existingButton.remove();
            contentCollapsible.style.maxHeight = "";
            contentCollapsible.classList.remove(CSS_CLASS_CONTENT_COLLAPSED);
            return;
        }
        requestAnimationFrame(() => {
            if (!contentCollapsible ||
                !contentCollapsible.isConnected ||
                !messageGroupEl.isConnected ||
                !messageEl.isConnected)
                return;
            let existingButton = messageEl.querySelector(`.${CSS_CLASSES.SHOW_MORE_BUTTON}`);
            const previousMaxHeightStyle = contentCollapsible.style.maxHeight;
            contentCollapsible.style.maxHeight = "";
            const scrollHeight = contentCollapsible.scrollHeight;
            if (existingButton && previousMaxHeightStyle && !existingButton.classList.contains("explicitly-expanded")) {
                contentCollapsible.style.maxHeight = previousMaxHeightStyle;
            }
            if (scrollHeight > maxH) {
                if (!existingButton) {
                    existingButton = messageEl.createEl("button", {
                        cls: CSS_CLASSES.SHOW_MORE_BUTTON,
                    });
                    this.registerDomEvent(existingButton, "click", () => {
                        if (contentCollapsible.classList.contains(CSS_CLASSES.CONTENT_COLLAPSED)) {
                            existingButton.classList.add("explicitly-expanded");
                        }
                        else {
                            existingButton.classList.remove("explicitly-expanded");
                        }
                        this.toggleMessageCollapse(contentCollapsible, existingButton);
                    });
                    contentCollapsible.style.maxHeight = `${maxH}px`;
                    contentCollapsible.classList.add(CSS_CLASSES.CONTENT_COLLAPSED);
                    existingButton.setText("Show More ▼");
                }
                else {
                    if (contentCollapsible.classList.contains(CSS_CLASSES.CONTENT_COLLAPSED)) {
                        existingButton.setText("Show More ▼");
                    }
                    else {
                        existingButton.setText("Show Less ▲");
                    }
                }
            }
            else {
                if (existingButton) {
                    existingButton.remove();
                }
                contentCollapsible.style.maxHeight = "";
                contentCollapsible.classList.remove(CSS_CLASSES.CONTENT_COLLAPSED);
            }
        });
    }
    handleSummarizeClick(originalContent, buttonEl) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
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
            const originalIcon = ((_a = buttonEl.querySelector(".svg-icon")) === null || _a === void 0 ? void 0 : _a.getAttribute("icon-name")) || "scroll-text";
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
                const responseData = yield this.plugin.ollamaService.generateRaw(requestBody);
                if (responseData && responseData.response) {
                    new SummaryModal(this.plugin, "Message Summary", responseData.response.trim()).open();
                }
                else {
                    throw new Error("Received empty response from summarization model.");
                }
            }
            catch (error) {
                let userMessage = "Summarization failed: ";
                if (error instanceof Error) {
                    if (error.message.includes("404") || error.message.toLocaleLowerCase().includes("model not found")) {
                        userMessage += `Model '${summarizationModel}' not found.`;
                    }
                    else if (error.message.includes("connect") || error.message.includes("fetch")) {
                        userMessage += "Could not connect to Ollama server.";
                    }
                    else {
                        userMessage += error.message;
                    }
                }
                else {
                    userMessage += "Unknown error occurred.";
                }
                new Notice(userMessage, 6000);
            }
            finally {
                setIcon(buttonEl, originalIcon);
                buttonEl.disabled = false;
                buttonEl.title = originalTitle;
                buttonEl.removeClass(CSS_CLASS_DISABLED);
                buttonEl.removeClass("button-loading");
            }
        });
    }
    /**
     * Створює нову групу для відображення помилок або оновлює існуючу.
     * Тепер використовує ErrorMessageRenderer для створення візуального блоку.
     * @param isContinuing Чи це продовження попередньої послідовності помилок.
     */
    renderOrUpdateErrorGroup(isContinuing) {
        if (!this.chatContainer)
            return;
        const errorsToDisplay = [...this.consecutiveErrorMessages];
        if (errorsToDisplay.length === 0) {
            return;
        }
        const errorCount = errorsToDisplay.length;
        const lastError = errorsToDisplay[errorCount - 1];
        let groupEl;
        let contentContainer = null;
        if (isContinuing && this.errorGroupElement) {
            groupEl = this.errorGroupElement;
            contentContainer = groupEl.querySelector(`.${CSS_CLASS_ERROR_TEXT}`);
            if (contentContainer) {
                contentContainer.empty();
            }
            else {
                return;
            }
            this.updateErrorGroupTimestamp(groupEl, lastError.timestamp);
        }
        else {
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
            }
            else {
                contentContainer.setText(`Multiple errors occurred (${errorCount}). Summarizing...`);
                if (!this.isSummarizingErrors) {
                    this.triggerErrorSummarization(groupEl, errorsToDisplay);
                }
            }
        }
        else {
        }
        this.guaranteedScrollToBottom(50, true);
    }
    updateErrorGroupTimestamp(groupEl, timestamp) {
        groupEl.setAttribute("data-timestamp", timestamp.getTime().toString());
        const timestampEl = groupEl.querySelector(`.${CSS_CLASSES.TIMESTAMP}`);
        if (timestampEl) {
            timestampEl.setText(this.formatTime(timestamp));
        }
    }
    triggerErrorSummarization(targetGroupElement, errors) {
        return __awaiter(this, void 0, void 0, function* () {
            const ENABLE_ERROR_SUMMARIZATION = false;
            if (!ENABLE_ERROR_SUMMARIZATION) {
                this.displayErrorListFallback(targetGroupElement, errors);
                return;
            }
            if (!this.plugin.settings.summarizationModelName || this.isSummarizingErrors) {
                if (!this.plugin.settings.summarizationModelName)
                    if (this.isSummarizingErrors)
                        this.displayErrorListFallback(targetGroupElement, errors);
                return;
            }
            this.isSummarizingErrors = true;
            try {
                const summary = yield this.summarizeErrors(errors);
                const contentContainer = targetGroupElement.querySelector(`.${CSS_CLASSES.ERROR_TEXT}`);
                if (!contentContainer || !contentContainer.isConnected) {
                    return;
                }
                contentContainer.empty();
                if (summary) {
                    contentContainer.setText(`Multiple errors occurred. Summary:\n${summary}`);
                }
                else {
                    this.displayErrorListFallback(targetGroupElement, errors);
                }
            }
            catch (error) {
                this.displayErrorListFallback(targetGroupElement, errors);
            }
            finally {
                this.isSummarizingErrors = false;
            }
        });
    }
    displayErrorListFallback(targetGroupElement, errors) {
        const contentContainer = targetGroupElement.querySelector(`.${CSS_CLASSES.ERROR_TEXT}`);
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
    summarizeErrors(errors) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const modelName = this.plugin.settings.summarizationModelName;
            if (!modelName)
                return null;
            if (errors.length < 2)
                return ((_a = errors[0]) === null || _a === void 0 ? void 0 : _a.content) || null;
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
                const responseData = yield this.plugin.ollamaService.generateRaw(requestBody);
                if (responseData && responseData.response) {
                    return responseData.response.trim();
                }
                else {
                    return null;
                }
            }
            catch (error) {
                return null;
            }
        });
    }
    handleErrorMessage(errorMessage) {
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
        }
        catch (error) {
            try {
            }
            catch (_a) { }
        }
    }
    sendMessage() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const userInputText = this.inputEl.value.trim();
            const requestTimestampId = Date.now();
            if (!userInputText || this.isProcessing || this.currentAbortController) {
                if (this.isProcessing || this.currentAbortController)
                    new Notice("Please wait or cancel current operation.", 3000);
                return;
            }
            let activeChat = yield this.plugin.chatManager.getActiveChat();
            if (!activeChat) {
                activeChat = yield this.plugin.chatManager.createNewChat();
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
                const userMessageAdded = yield this.plugin.chatManager.addUserMessageAndAwaitRender(userInputText, userMessageTimestamp, requestTimestampId);
                if (!userMessageAdded) {
                    throw new Error("User message processing failed in ChatManager.");
                }
                const chatStateForLlm = yield this.plugin.chatManager.getActiveChatOrFail();
                if (!this.currentAbortController) {
                    // Ця помилка не має виникати, якщо AbortController створюється вище
                    this.plugin.logger.error("CRITICAL: AbortController not initialized in sendMessage before LlmInteractionCycle call.");
                    throw new Error("AbortController not initialized in sendMessage");
                }
                yield this._handleLlmInteractionCycle(chatStateForLlm, requestTimestampId, this.currentAbortController.signal);
            }
            catch (error) {
                if (this.activePlaceholder &&
                    this.activePlaceholder.timestamp === initialLlmResponsePlaceholderTs &&
                    this.activePlaceholder.groupEl.classList.contains("placeholder")) {
                    if (this.activePlaceholder.groupEl.isConnected)
                        this.activePlaceholder.groupEl.remove();
                }
                this.plugin.chatManager.rejectAndClearHMAResolver(userMessageTimestamp.getTime(), `Outer catch in sendMessage for user message (req: ${requestTimestampId})`);
                this.plugin.chatManager.rejectAndClearHMAResolver(initialLlmResponsePlaceholderTs, `Outer catch in sendMessage for initial placeholder (req: ${requestTimestampId})`);
                let errorMsgForChat;
                let errorMsgRole = "error";
                if (error.name === "AbortError" || ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes("aborted by user"))) {
                    errorMsgForChat = "Message generation stopped.";
                    errorMsgRole = "system";
                }
                else {
                    errorMsgForChat = `Error: ${error.message || "Unknown error during processing."}`;
                    new Notice(errorMsgForChat, 7000);
                }
                const errorDisplayTimestamp = new Date();
                const errorDisplayMsg = {
                    role: errorMsgRole,
                    content: errorMsgForChat,
                    timestamp: errorDisplayTimestamp,
                };
                const hmaErrorPromise = new Promise((resolve, reject) => {
                    this.plugin.chatManager.registerHMAResolver(errorDisplayMsg.timestamp.getTime(), resolve, reject);
                    setTimeout(() => {
                        if (this.plugin.chatManager.messageAddedResolvers.has(errorDisplayMsg.timestamp.getTime())) {
                            this.plugin.chatManager.rejectAndClearHMAResolver(errorDisplayMsg.timestamp.getTime(), "HMA timeout for error display msg in sendMessage");
                        }
                    }, 10000);
                });
                yield this.plugin.chatManager.addMessageToActiveChatPayload(errorDisplayMsg, true);
                try {
                    yield hmaErrorPromise;
                }
                catch (e_hma) {
                    this.plugin.logger.warn("[SendMessage] HMA for error display message failed or timed out:", e_hma);
                }
            }
            finally {
                if (this.activePlaceholder && this.activePlaceholder.groupEl.classList.contains("placeholder")) {
                    if (this.activePlaceholder.groupEl.isConnected)
                        this.activePlaceholder.groupEl.remove();
                }
                this.activePlaceholder = null;
                this.currentAbortController = null;
                this.setLoadingState(false);
                requestAnimationFrame(() => this.updateSendButtonState());
                this.focusInput();
            }
        });
    }
    // src/OllamaView.ts
    // ... (інші імпорти та частина класу) ...
    handleMessageAdded(data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            const messageForLog = data === null || data === void 0 ? void 0 : data.message;
            const messageTimestampForLog = (_a = messageForLog === null || messageForLog === void 0 ? void 0 : messageForLog.timestamp) === null || _a === void 0 ? void 0 : _a.getTime(); // Використовуємо ?. для безпеки
            const messageRoleForLog = messageForLog === null || messageForLog === void 0 ? void 0 : messageForLog.role; // Припускаємо, що MessageRole з OllamaView
            // Логуємо вхідну подію
            this.plugin.logger.debug(`[handleMessageAdded] Received message event for chat ${data.chatId}. Message role: ${messageRoleForLog}, timestamp: ${messageTimestampForLog}`, { role: messageForLog === null || messageForLog === void 0 ? void 0 : messageForLog.role, contentPreview: ((_b = messageForLog === null || messageForLog === void 0 ? void 0 : messageForLog.content) === null || _b === void 0 ? void 0 : _b.substring(0, 50)) + "...", tool_calls: messageForLog === null || messageForLog === void 0 ? void 0 : messageForLog.tool_calls });
            try {
                // 1. Базові перевірки на валідність даних
                if (!data || !data.message || !messageForLog || !messageTimestampForLog) { // Перевіряємо і messageTimestampForLog
                    if (messageTimestampForLog)
                        this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                    return;
                }
                const { chatId: eventChatId, message } = data; // message тут гарантовано є
                const messageTimestampMs = messageTimestampForLog; // Тепер це те саме, що message.timestamp.getTime()
                // Логування оброблюваного повідомлення
                this.plugin.logger.debug(`[handleMessageAdded] Processing message:`, {
                    id: messageTimestampMs,
                    role: message.role,
                    content: ((_c = message.content) === null || _c === void 0 ? void 0 : _c.substring(0, 100)) + (message.content && message.content.length > 100 ? "..." : ""),
                    tool_calls: message.tool_calls // Приводимо до AssistantMessage для доступу до tool_calls
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
                const hasToolCalls = !!(message.tool_calls && message.tool_calls.length > 0);
                // isActiveCycle: Перевіряємо, чи є активний AbortController (або інший індикатор активного LLM циклу)
                const isActiveCycle = !!this.currentAbortController; // Ти використовував currentAbortController
                // --- КЛЮЧОВА ЗМІНА ЛОГІКИ ---
                // 5. Пропуск рендерингу для повідомлень асистента з tool_calls
                // Це має відбуватися НЕЗАЛЕЖНО від isActiveCycle, якщо ми хочемо приховати їх і при перезавантаженні.
                if (isAssistant && hasToolCalls) {
                    this.plugin.logger.info(`[handleMessageAdded] INTENDED SKIP: Skipping render for assistant message with tool_calls (role: ${message.role}, ts: ${messageTimestampMs}). This message is for tool execution only.`, { contentPreview: ((_d = message.content) === null || _d === void 0 ? void 0 : _d.substring(0, 70)) + "...", tool_calls: message.tool_calls });
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
                const existingRenderedMessage = this.chatContainer.querySelector(`.${CSS_CLASSES.MESSAGE_GROUP}:not(.placeholder)[data-timestamp="${messageTimestampMs}"]`);
                if (existingRenderedMessage) {
                    this.plugin.chatManager.invokeHMAResolver(messageTimestampMs);
                    return;
                }
                // 7. Перевірка, чи повідомлення вже є в логічному кеші (this.currentMessages)
                // Це може допомогти уникнути дублювання, якщо подія прийшла двічі до рендерингу.
                const isAlreadyInLogicCache = this.currentMessages.some(m => m.timestamp.getTime() === messageTimestampMs && m.role === message.role
                // Порівняння контенту може бути надлишковим і дорогим, якщо ID (timestamp) унікальний
                // && m.content === message.content 
                );
                // Визначаємо, чи це повідомлення асистента призначене для оновлення активного плейсхолдера
                const isPotentiallyAssistantForPlaceholder = isAssistant && // Це повідомлення асистента
                    !hasToolCalls && // І воно НЕ має tool_calls (бо такі ми вже пропустили)
                    ((_e = this.activePlaceholder) === null || _e === void 0 ? void 0 : _e.timestamp) === messageTimestampMs; // І є активний плейсхолдер для нього
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
                    if (((_f = placeholderToUpdate.groupEl) === null || _f === void 0 ? void 0 : _f.isConnected) &&
                        placeholderToUpdate.contentEl &&
                        placeholderToUpdate.messageWrapper) {
                        placeholderToUpdate.groupEl.classList.remove("placeholder");
                        placeholderToUpdate.groupEl.removeAttribute("data-placeholder-timestamp");
                        placeholderToUpdate.groupEl.setAttribute("data-timestamp", messageTimestampMs.toString());
                        const messageDomElement = placeholderToUpdate.groupEl.querySelector(`.${CSS_CLASSES.MESSAGE}`);
                        if (!messageDomElement) {
                            if (placeholderToUpdate.groupEl.isConnected)
                                placeholderToUpdate.groupEl.remove();
                            // this.activePlaceholder = null; // Вже очищено
                            yield this.addMessageStandard(message);
                        }
                        else {
                            placeholderToUpdate.contentEl.classList.remove("streaming-text");
                            const dotsEl = placeholderToUpdate.contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
                            if (dotsEl)
                                dotsEl.remove();
                            try {
                                const displayContent = AssistantMessageRenderer.prepareDisplayContent(message.content || "", message, // message тут вже не має tool_calls, бо ми їх відфільтрували
                                this.plugin, this);
                                placeholderToUpdate.contentEl.empty(); // Очищаємо вміст перед новим рендерингом
                                yield RendererUtils.renderMarkdownContent(this.app, this, this.plugin, placeholderToUpdate.contentEl, displayContent);
                                AssistantMessageRenderer.addAssistantActionButtons(messageDomElement, placeholderToUpdate.contentEl, message, this.plugin, this);
                                BaseMessageRenderer.addTimestamp(messageDomElement, message.timestamp, this);
                                this.lastMessageElement = placeholderToUpdate.groupEl;
                                this.hideEmptyState();
                                const finalMessageGroupElement = placeholderToUpdate.groupEl; // Зберігаємо для setTimeout
                                // this.activePlaceholder = null; // Вже очищено
                                // Асинхронна перевірка на згортання
                                setTimeout(() => { if (finalMessageGroupElement === null || finalMessageGroupElement === void 0 ? void 0 : finalMessageGroupElement.isConnected)
                                    this.checkMessageForCollapsing(finalMessageGroupElement); }, 70);
                                this.guaranteedScrollToBottom(100, true); // Прокрутка
                            }
                            catch (renderError) {
                                if (placeholderToUpdate.groupEl.isConnected)
                                    placeholderToUpdate.groupEl.remove();
                                // this.activePlaceholder = null; // Вже очищено
                                this.handleErrorMessage({ role: "error", content: `Failed to finalize display for ts ${messageTimestampMs}: ${renderError.message}`, timestamp: new Date() });
                            }
                        }
                    }
                    else {
                        // this.activePlaceholder = null; // Вже очищено
                        yield this.addMessageStandard(message);
                    }
                }
                else { // Якщо не оновлення плейсхолдера, то стандартне додавання
                    // Це включає повідомлення користувача, інструментів, помилок,
                    // а також повідомлення асистента, якщо для них не було плейсхолдера (наприклад, при завантаженні історії)
                    yield this.addMessageStandard(message);
                }
            }
            catch (outerError) {
                this.handleErrorMessage({
                    role: "error",
                    content: `Internal error in handleMessageAdded for ${messageRoleForLog} msg (ts ${messageTimestampForLog}): ${outerError.message || 'Unknown error'}`,
                    timestamp: new Date(),
                });
            }
            finally {
                // Гарантовано викликаємо резолвер, якщо він ще існує
                if (messageTimestampForLog && this.plugin.chatManager.messageAddedResolvers.has(messageTimestampForLog)) {
                    this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                }
                else if (messageTimestampForLog) {
                    // Якщо резолвера вже немає, логуємо це, щоб розуміти потік
                }
            }
        });
    }
    // src/OllamaView.ts
    // ... (припускаємо, що всі необхідні імпорти, CSS_CLASSES, RendererUtils, рендерери повідомлень, etc. вже є) ...
    loadAndDisplayActiveChat() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            let metadataUpdated = false;
            try {
                this.clearChatContainerInternal(); // Очищає this.chatContainer та this.currentMessages
                this.lastMessageElement = null;
                this.consecutiveErrorMessages = []; // Скидаємо лічильник послідовних помилок
                this.errorGroupElement = null; // Скидаємо групу помилок
                let activeChat = null;
                let availableModels = [];
                let finalModelName = null;
                let finalRolePath = undefined; // Дозволяємо undefined для початкового стану
                let finalRoleName = "None"; // Значення за замовчуванням
                let finalTemperature = undefined; // Дозволяємо undefined
                let errorOccurredLoadingData = false;
                // Блок завантаження даних чату та моделей
                try {
                    if (!this.plugin.chatManager) {
                        throw new Error("ChatManager is not initialized.");
                    }
                    activeChat = (yield this.plugin.chatManager.getActiveChat()) || null;
                    if (!this.plugin.ollamaService) {
                        throw new Error("OllamaService is not initialized.");
                    }
                    availableModels = yield this.plugin.ollamaService.getModels();
                    // Визначаємо шлях та ім'я ролі
                    finalRolePath =
                        ((_a = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _a === void 0 ? void 0 : _a.selectedRolePath) !== undefined // Спочатку з метаданих чату
                            ? activeChat.metadata.selectedRolePath
                            : this.plugin.settings.selectedRolePath; // Потім з налаштувань плагіна
                    finalRoleName = yield this.findRoleNameByPath(finalRolePath); // findRoleNameByPath має обробляти null/undefined
                }
                catch (error) {
                    new Notice("Error connecting to Ollama or loading chat data.", 5000);
                    errorOccurredLoadingData = true;
                    // Встановлюємо значення за замовчуванням у разі помилки
                    availableModels = availableModels || []; // Переконуємося, що це масив
                    finalModelName = availableModels.includes(this.plugin.settings.modelName)
                        ? this.plugin.settings.modelName
                        : (_b = availableModels[0]) !== null && _b !== void 0 ? _b : null; // Якщо модель з налаштувань недоступна, беремо першу або null
                    finalTemperature = this.plugin.settings.temperature;
                    finalRolePath = this.plugin.settings.selectedRolePath;
                    finalRoleName = yield this.findRoleNameByPath(finalRolePath); // Повторно, на випадок якщо попередня спроба не вдалася
                    activeChat = null; // Скидаємо активний чат
                }
                // Визначення фінальної моделі та температури
                if (!errorOccurredLoadingData && activeChat) {
                    let preferredModel = ((_c = activeChat.metadata) === null || _c === void 0 ? void 0 : _c.modelName) || this.plugin.settings.modelName;
                    if (availableModels.length > 0) {
                        if (preferredModel && availableModels.includes(preferredModel)) {
                            finalModelName = preferredModel;
                        }
                        else {
                            // Якщо бажана модель недоступна, встановлюємо першу доступну
                            finalModelName = availableModels[0];
                        }
                    }
                    else {
                        finalModelName = null; // Немає доступних моделей
                    }
                    // Оновлення метаданих чату, якщо модель змінилася
                    if (activeChat.metadata.modelName !== finalModelName && finalModelName !== null) {
                        try {
                            if (!this.plugin.chatManager)
                                throw new Error("ChatManager not available for metadata update.");
                            const updateSuccess = yield this.plugin.chatManager.updateActiveChatMetadata({ modelName: finalModelName });
                            if (updateSuccess) {
                                metadataUpdated = true;
                                // Перезавантажуємо дані чату, щоб отримати оновлені метадані
                                const potentiallyUpdatedChat = yield this.plugin.chatManager.getChat(activeChat.metadata.id);
                                if (potentiallyUpdatedChat)
                                    activeChat = potentiallyUpdatedChat;
                            }
                            else {
                            }
                        }
                        catch (updateError) {
                        }
                    }
                    finalTemperature = (_e = (_d = activeChat.metadata) === null || _d === void 0 ? void 0 : _d.temperature) !== null && _e !== void 0 ? _e : this.plugin.settings.temperature;
                }
                else if (!errorOccurredLoadingData && !activeChat) { // Якщо чат не завантажено, але не було помилки (наприклад, немає активного)
                    finalModelName = availableModels.includes(this.plugin.settings.modelName)
                        ? this.plugin.settings.modelName
                        : (_f = availableModels[0]) !== null && _f !== void 0 ? _f : null;
                    finalTemperature = this.plugin.settings.temperature;
                    // finalRolePath and finalRoleName вже встановлені раніше
                }
                // Рендеринг повідомлень
                if (activeChat && !errorOccurredLoadingData && ((_g = activeChat.messages) === null || _g === void 0 ? void 0 : _g.length) > 0) {
                    this.hideEmptyState();
                    // this.currentMessages вже очищено в clearChatContainerInternal, заповнюємо його знову
                    this.currentMessages = [...activeChat.messages];
                    this.lastRenderedMessageDate = null; // Скидаємо для розділювачів дат
                    for (const message of this.currentMessages) {
                        let messageGroupEl = null;
                        // Перевірка на пропуск рендерингу для assistant + tool_calls
                        const isAssistant = message.role === "assistant";
                        const hasToolCalls = !!(message.tool_calls && message.tool_calls.length > 0);
                        if (isAssistant && hasToolCalls) {
                            this.plugin.logger.info(`[loadAndDisplayActiveChat] SKIPPING RENDER for HISTORICAL assistant message with tool_calls (ts: ${message.timestamp.getTime()})`, { contentPreview: (_h = message.content) === null || _h === void 0 ? void 0 : _h.substring(0, 70), tool_calls: message.tool_calls });
                            continue; // Пропускаємо решту циклу для цього повідомлення
                        }
                        // Логіка для розділювачів дат
                        const isNewDay = !this.lastRenderedMessageDate || !this.isSameDay(this.lastRenderedMessageDate, message.timestamp);
                        // isFirstMessageInContainer тепер перевіряє реальну кількість дітей в DOM, а не this.currentMessages.length
                        const isFirstRenderedMessageInContainer = this.chatContainer.children.length === 0;
                        if (isNewDay || isFirstRenderedMessageInContainer) {
                            if (isNewDay && !isFirstRenderedMessageInContainer) { // Не додаємо розділювач перед першим повідомленням
                                this.renderDateSeparator(message.timestamp);
                            }
                            this.lastRenderedMessageDate = message.timestamp; // Оновлюємо дату останнього ВІДРЕНДЕРЕНОГО повідомлення
                        }
                        // Створення та рендеринг повідомлення
                        try {
                            let renderer = null;
                            switch (message.role) {
                                case "user":
                                    renderer = new UserMessageRenderer(this.app, this.plugin, message, this);
                                    break;
                                case "assistant": // Це буде асистент БЕЗ tool_calls
                                    renderer = new AssistantMessageRenderer(this.app, this.plugin, message, this);
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
                                    const unknownRoleGroup = (_j = this.chatContainer) === null || _j === void 0 ? void 0 : _j.createDiv({ cls: CSS_CLASSES.MESSAGE_GROUP });
                                    if (unknownRoleGroup && this.chatContainer) {
                                        RendererUtils.renderAvatar(this.app, this.plugin, unknownRoleGroup, false); // Аватар за замовчуванням
                                        const wrapper = unknownRoleGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
                                        const msgBubble = wrapper.createDiv({ cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.SYSTEM_MESSAGE}` });
                                        msgBubble.createDiv({
                                            cls: CSS_CLASSES.SYSTEM_MESSAGE_TEXT || "system-message-text",
                                            text: `Unknown message role: ${message.role}`, // Використовуємо as any для безпеки
                                        });
                                        BaseMessageRenderer.addTimestamp(msgBubble, message.timestamp, this);
                                        messageGroupEl = unknownRoleGroup;
                                    }
                                    break;
                            }
                            if (renderer && message.role !== "error") { // Помилки обробляються окремо
                                const result = renderer.render();
                                messageGroupEl = result instanceof Promise ? yield result : result;
                            }
                        }
                        catch (renderError) {
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
                }
                else { // Якщо немає повідомлень або сталася помилка завантаження даних чату
                    this.showEmptyState(errorOccurredLoadingData ? "Error loading chat." : "This chat is empty.");
                    (_k = this.scrollToBottomButton) === null || _k === void 0 ? void 0 : _k.classList.remove(CSS_CLASSES.VISIBLE || "visible"); // Переконайся, що CSS_CLASSES.VISIBLE визначено
                }
                // Оновлення елементів UI (заголовок, модель, температура і т.д.)
                this.updateInputPlaceholder(finalRoleName);
                this.updateRoleDisplay(finalRoleName);
                this.updateModelDisplay(finalModelName);
                this.updateTemperatureIndicator(finalTemperature);
                // Оновлення стану інпут поля та кнопки відправки
                if (finalModelName === null) { // Якщо немає доступних моделей
                    if (this.inputEl) {
                        this.inputEl.disabled = true;
                        this.inputEl.placeholder = "No models available...";
                    }
                    if (this.sendButton) {
                        this.sendButton.disabled = true;
                        this.sendButton.classList.add(CSS_CLASSES.DISABLED || "disabled"); // Переконайся, що CSS_CLASSES.DISABLED визначено
                    }
                    if (this.isProcessing)
                        this.setLoadingState(false); // Скидаємо стан завантаження, якщо він був активний
                }
                else { // Якщо моделі є
                    if (this.inputEl && !this.isProcessing) { // Розблоковуємо інпут, якщо не йде обробка
                        this.inputEl.disabled = false;
                    }
                    this.updateSendButtonState(); // Оновлюємо стан кнопки відправки
                }
            }
            catch (error) {
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
            }
            finally {
                // Можна додати логування завершення методу
            }
            return { metadataUpdated };
        });
    }
    _managePlaceholder(turnTimestamp, requestTimestampId) {
        if (this.activePlaceholder && this.activePlaceholder.timestamp !== turnTimestamp) {
            if (this.activePlaceholder.groupEl.classList.contains("placeholder")) {
                if (this.activePlaceholder.groupEl.isConnected)
                    this.activePlaceholder.groupEl.remove();
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
            for (let i = 0; i < 3; i++)
                dots.createDiv({ cls: CSS_CLASSES.THINKING_DOT });
            this.activePlaceholder = {
                timestamp: turnTimestamp,
                groupEl: placeholderGroupEl,
                contentEl: contentPlaceholderEl,
                messageWrapper: wrapperEl,
            };
            placeholderGroupEl.classList.add(CSS_CLASSES.MESSAGE_ARRIVING || "message-arriving");
            setTimeout(() => placeholderGroupEl === null || placeholderGroupEl === void 0 ? void 0 : placeholderGroupEl.classList.remove(CSS_CLASSES.MESSAGE_ARRIVING || "message-arriving"), 500);
            this.guaranteedScrollToBottom(50, true);
        }
        else {
            this.activePlaceholder.contentEl.empty();
            const dots = this.activePlaceholder.contentEl.createDiv({ cls: CSS_CLASSES.THINKING_DOTS });
            for (let i = 0; i < 3; i++)
                dots.createDiv({ cls: CSS_CLASSES.THINKING_DOT });
            this.activePlaceholder.contentEl.classList.add("streaming-text");
            this.activePlaceholder.timestamp = turnTimestamp;
            this.activePlaceholder.groupEl.setAttribute("data-placeholder-timestamp", turnTimestamp.toString());
        }
    }
    _processLlmStream(llmStream, // Тепер тип має бути сумісним
    timestampMs, requestTimestampId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, llmStream_1, llmStream_1_1;
            var _b, e_1, _c, _d;
            let accumulatedContent = "";
            let parsedToolCalls = null;
            let fullResponseBuffer = "";
            let toolCallIdCounter = 0;
            const toolCallStartTag = "<tool_call>";
            const toolCallEndTag = "</tool_call>";
            try {
                for (_a = true, llmStream_1 = __asyncValues(llmStream); llmStream_1_1 = yield llmStream_1.next(), _b = llmStream_1_1.done, !_b; _a = true) {
                    _d = llmStream_1_1.value;
                    _a = false;
                    const chunk = _d;
                    // this.plugin.logger.debug("[_processLlmStream] Received chunk:", chunk);
                    let isLastChunk = false;
                    if ('error' in chunk && chunk.error) { // OllamaErrorChunk
                        this.plugin.logger.error("[_processLlmStream] Received error chunk:", chunk.error);
                        throw new Error(`Ollama stream error: ${chunk.error}`);
                    }
                    // Перевіряємо на OllamaToolCallsChunk першим, якщо він має поле 'type'
                    // Потрібно переконатися, що OllamaGenerateChunk не має 'type: "tool_calls"'
                    // або додати 'type: "content"' до OllamaGenerateChunk
                    else if ('type' in chunk && chunk.type === "tool_calls" && 'calls' in chunk) { // OllamaToolCallsChunk
                        this.plugin.logger.debug("[_processLlmStream] Received structured tool_calls chunk:", chunk.calls);
                        if (!parsedToolCalls)
                            parsedToolCalls = [];
                        for (const call of chunk.calls) {
                            // Додаємо перевірку, щоб уникнути дублювання, якщо ID вже існує
                            if (!parsedToolCalls.some(existingCall => existingCall.id === call.id)) {
                                parsedToolCalls.push({
                                    type: call.type || "function",
                                    id: call.id || `ollama-tc-${timestampMs}-${toolCallIdCounter++}`,
                                    function: call.function
                                });
                            }
                        }
                        if (chunk.done)
                            isLastChunk = true; // Якщо цей чанк може бути останнім
                    }
                    else if ('response' in chunk) { // OllamaGenerateChunk (текстовий контент)
                        if (chunk.response) {
                            accumulatedContent += chunk.response;
                            fullResponseBuffer += chunk.response;
                        }
                        if (chunk.done)
                            isLastChunk = true; // Цей текстовий чанк є останнім
                    }
                    // Якщо є інший спосіб визначити останній чанк (наприклад, спеціальний тип 'done' без 'response')
                    // else if (chunk.type === "done_signal") { isLastChunk = true; }
                    if (isLastChunk) {
                        // Парсинг текстових <tool_call> з fullResponseBuffer (якщо вони є)
                        // Ця логіка виконується ТІЛЬКИ ОДИН РАЗ в кінці.
                        let lastIndex = 0;
                        while (lastIndex < fullResponseBuffer.length) {
                            const startIndex = fullResponseBuffer.indexOf(toolCallStartTag, lastIndex);
                            if (startIndex === -1)
                                break;
                            const endIndex = fullResponseBuffer.indexOf(toolCallEndTag, startIndex + toolCallStartTag.length);
                            if (endIndex === -1) {
                                break;
                            }
                            const toolCallJsonString = fullResponseBuffer.substring(startIndex + toolCallStartTag.length, endIndex).trim();
                            try {
                                const parsedJson = JSON.parse(toolCallJsonString);
                                const callsArray = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
                                if (!parsedToolCalls)
                                    parsedToolCalls = [];
                                for (const callDef of callsArray) {
                                    if (callDef.name && typeof callDef.arguments !== 'undefined') {
                                        // Додаємо, лише якщо схожого виклику ще немає (проста перевірка за іменем)
                                        // Для більш надійної перевірки на дублікати потрібні ID або більш глибоке порівняння
                                        if (!parsedToolCalls.some(ptc => ptc.function.name === callDef.name)) {
                                            parsedToolCalls.push({
                                                type: "function",
                                                id: `ollama-txt-tc-${timestampMs}-${toolCallIdCounter++}`, // Інший префікс для текстових
                                                function: {
                                                    name: callDef.name,
                                                    arguments: typeof callDef.arguments === 'string'
                                                        ? callDef.arguments
                                                        : JSON.stringify(callDef.arguments),
                                                },
                                            });
                                        }
                                    }
                                    else {
                                    }
                                }
                            }
                            catch (e) {
                                this.plugin.logger.error("[_processLlmStream] Error parsing text-based tool call JSON:", e, toolCallJsonString);
                            }
                            lastIndex = endIndex + toolCallEndTag.length;
                        }
                        break;
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_a && !_b && (_c = llmStream_1.return)) yield _c.call(llmStream_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
            return {
                accumulatedContent: accumulatedContent,
                nativeToolCalls: parsedToolCalls,
                assistantMessageWithNativeCalls: null
            };
        });
    }
    // ... (решта методів)
    // src/OllamaView.ts
    // ... (інші імпорти та частина класу) ...
    _determineToolCalls(nativeToolCallsFromStream, accumulatedContentFromStream, timestampMs, requestTimestampId // Цей аргумент зараз не використовується активно, але залишений для узгодженості
    ) {
        let toolsToExecute = null;
        const finalContentForHistory = accumulatedContentFromStream.trim();
        const assistantMessageForHistory = {
            role: "assistant",
            content: finalContentForHistory,
            timestamp: new Date(timestampMs),
        };
        if (nativeToolCallsFromStream && nativeToolCallsFromStream.length > 0) {
            toolsToExecute = nativeToolCallsFromStream;
            assistantMessageForHistory.tool_calls = nativeToolCallsFromStream;
        }
        else {
        }
        return {
            processedToolCallsThisTurn: toolsToExecute,
            assistantMessageForHistory: assistantMessageForHistory
        };
    }
    // src/OllamaView.ts
    // ...
    _executeAndRenderToolCycle(toolsToExecute, assistantMessageIntent, requestTimestampId, signal // Сигнал скасування
    ) {
        return __awaiter(this, void 0, void 0, function* () {
            const currentViewInstance = this;
            for (const call of toolsToExecute) {
                if (signal.aborted)
                    throw new Error("aborted by user");
                if (call.type === "function") {
                    const toolName = call.function.name;
                    let toolArgs = {};
                    let toolResultContentForHistory = ""; // Ініціалізація для уникнення помилки
                    let parseErrorOccurred = false;
                    try {
                        toolArgs = JSON.parse(call.function.arguments || "{}");
                    }
                    catch (e) {
                        const errorContent = `Error parsing arguments for tool ${toolName}: ${e.message}. Arguments string: "${call.function.arguments}"`;
                        this.plugin.logger.error(`[ToolCycle] Arg Parsing Error for ${toolName}: ${errorContent}`);
                        toolResultContentForHistory = `[TOOL_ERROR]\n${errorContent}\n[/TOOL_ERROR]`;
                        parseErrorOccurred = true;
                    }
                    if (!parseErrorOccurred) {
                        if (signal.aborted)
                            throw new Error("aborted by user"); // Перевірка перед виконанням інструменту
                        const execResult = yield currentViewInstance.plugin.agentManager.executeTool(toolName, toolArgs);
                        if (execResult.success) {
                            toolResultContentForHistory = `[TOOL_RESULT]\n${execResult.result}\n[/TOOL_RESULT]`;
                        }
                        else {
                            toolResultContentForHistory = `[TOOL_ERROR]\nError executing tool ${toolName}: ${execResult.error || "Unknown tool error"}\n[/TOOL_ERROR]`;
                        }
                    }
                    const toolResponseTimestamp = new Date();
                    const toolResponseMsg = {
                        role: "tool",
                        tool_call_id: call.id,
                        name: toolName,
                        content: toolResultContentForHistory,
                        timestamp: toolResponseTimestamp,
                    };
                    const toolResultHmaPromise = new Promise((resolve, reject) => {
                        currentViewInstance.plugin.chatManager.registerHMAResolver(toolResponseMsg.timestamp.getTime(), resolve, reject);
                        setTimeout(() => {
                            if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(toolResponseMsg.timestamp.getTime())) {
                                currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(toolResponseMsg.timestamp.getTime(), `HMA Timeout for tool result: ${toolName} in _executeAndRenderToolCycle`);
                            }
                        }, 10000);
                    });
                    yield currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(toolResponseMsg, true);
                    try {
                        yield toolResultHmaPromise;
                    }
                    catch (hmaError) {
                    }
                }
            }
        });
    }
    // ... (решта методів OllamaView.ts) ...
    _renderFinalAssistantText(finalContent, responseTimestampMs, requestTimestampId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const currentViewInstance = this;
            if (finalContent.trim()) {
                const finalAssistantMsg = {
                    role: "assistant",
                    content: finalContent,
                    timestamp: new Date(responseTimestampMs),
                };
                const hmaPromise = new Promise((resolve, reject) => {
                    currentViewInstance.plugin.chatManager.registerHMAResolver(responseTimestampMs, resolve, reject);
                    setTimeout(() => {
                        if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(responseTimestampMs)) {
                            currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(responseTimestampMs, "HMA Timeout for final assistant message");
                        }
                    }, 10000);
                });
                yield currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(finalAssistantMsg, true);
                yield hmaPromise;
            }
            else if (!((_a = currentViewInstance.currentAbortController) === null || _a === void 0 ? void 0 : _a.signal.aborted)) {
                const emptyResponseMsgTimestamp = new Date();
                const emptyResponseMsg = {
                    role: "system",
                    content: "Assistant provided an empty response.",
                    timestamp: emptyResponseMsgTimestamp,
                };
                const hmaPromise = new Promise((resolve, reject) => {
                    currentViewInstance.plugin.chatManager.registerHMAResolver(emptyResponseMsg.timestamp.getTime(), resolve, reject);
                    setTimeout(() => {
                        if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(emptyResponseMsg.timestamp.getTime())) {
                            currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(emptyResponseMsg.timestamp.getTime(), "HMA timeout for empty sys msg");
                        }
                    }, 10000);
                });
                yield currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(emptyResponseMsg, true);
                try {
                    yield hmaPromise;
                }
                catch (e_hma) { }
            }
            if (((_b = currentViewInstance.activePlaceholder) === null || _b === void 0 ? void 0 : _b.timestamp) === responseTimestampMs) {
                currentViewInstance.activePlaceholder = null;
            }
        });
    }
    handleRegenerateClick(messageToRegenerateFrom) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (this.isRegenerating) {
                new Notice("Regeneration is already in progress. Please wait.", 3000);
                return;
            }
            if (this.currentAbortController) {
                new Notice("Another generation process is currently active. Please wait or cancel it first.", 4000);
                return;
            }
            const activeChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
            if (!activeChat) {
                new Notice("Cannot regenerate: No active chat found.");
                return;
            }
            const chatId = activeChat.metadata.id;
            let anchorMessageIndex = activeChat.messages.findIndex(msg => msg.timestamp.getTime() === messageToRegenerateFrom.timestamp.getTime() && msg.role === messageToRegenerateFrom.role);
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
            new ConfirmModal(this.app, "Confirm Regeneration", hasMessagesAfterTargetPoint
                ? "This will delete all messages after this point in the conversation and generate a new response. Are you sure you want to continue?"
                : "Are you sure you want to generate a new response for this prompt?", () => __awaiter(this, void 0, void 0, function* () {
                var _a;
                this.isRegenerating = true;
                const regenerationGlobalRequestId = Date.now();
                this.currentAbortController = new AbortController();
                this.setLoadingState(true);
                const initialLlmResponsePlaceholderTsForRegen = Date.now();
                try {
                    if (hasMessagesAfterTargetPoint) {
                        const deleteSuccess = yield this.plugin.chatManager.deleteMessagesAfter(chatId, messageIndexToDeleteAfter);
                        if (!deleteSuccess) {
                            throw new Error("Failed to delete subsequent messages. Regeneration cannot proceed.");
                        }
                    }
                    yield this.loadAndDisplayActiveChat();
                    this.guaranteedScrollToBottom(50, true);
                    const chatStateForLlm = yield this.plugin.chatManager.getActiveChatOrFail();
                    if (!chatStateForLlm) {
                        throw new Error("Failed to reload chat state after preparing for regeneration.");
                    }
                    if (!this.currentAbortController) {
                        this.plugin.logger.error("CRITICAL: AbortController not initialized in handleRegenerateClick before LlmInteractionCycle call.");
                        throw new Error("AbortController not initialized in handleRegenerateClick");
                    }
                    yield this._handleLlmInteractionCycle(chatStateForLlm, regenerationGlobalRequestId, this.currentAbortController.signal);
                }
                catch (error) {
                    if (this.activePlaceholder &&
                        this.activePlaceholder.timestamp === initialLlmResponsePlaceholderTsForRegen &&
                        this.activePlaceholder.groupEl.classList.contains("placeholder")) {
                        if (this.activePlaceholder.groupEl.isConnected)
                            this.activePlaceholder.groupEl.remove();
                    }
                    this.plugin.chatManager.rejectAndClearHMAResolver(initialLlmResponsePlaceholderTsForRegen, `Outer catch in handleRegenerateClick for initial placeholder (req: ${regenerationGlobalRequestId})`);
                    let errorMsgForChat;
                    let errorMsgRole = "error";
                    if (error.name === "AbortError" || ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes("aborted by user"))) {
                        errorMsgForChat = "Regeneration process was stopped by the user.";
                        errorMsgRole = "system";
                    }
                    else {
                        errorMsgForChat = `Regeneration failed: ${error.message || "An unknown error occurred during processing."}`;
                        new Notice(errorMsgForChat, 7000);
                    }
                    const errorDisplayTimestamp = new Date();
                    const errorDisplayMsg = { role: errorMsgRole, content: errorMsgForChat, timestamp: errorDisplayTimestamp };
                    const hmaErrorPromise = new Promise((resolve, reject) => {
                        this.plugin.chatManager.registerHMAResolver(errorDisplayMsg.timestamp.getTime(), resolve, reject);
                        setTimeout(() => {
                            if (this.plugin.chatManager.messageAddedResolvers.has(errorDisplayMsg.timestamp.getTime())) {
                                this.plugin.chatManager.rejectAndClearHMAResolver(errorDisplayMsg.timestamp.getTime(), "HMA timeout for error display msg in handleRegenerateClick");
                            }
                        }, 10000);
                    });
                    yield this.plugin.chatManager.addMessageToActiveChatPayload(errorDisplayMsg, true);
                    try {
                        yield hmaErrorPromise;
                    }
                    catch (e_hma) {
                    }
                }
                finally {
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
            })).open();
        });
    }
    _handleLlmInteractionCycle(initialChatState, globalInteractionRequestId, signal // Сигнал скасування для цього циклу
    ) {
        return __awaiter(this, void 0, void 0, function* () {
            let continueConversation = true;
            const maxTurns = 5; // Або з налаштувань this.plugin.settings.maxToolTurns
            let turns = 0;
            let currentTurnLlmResponseTsForCatch = null; // Для логування/відладки помилок
            let chatStateForLlm = initialChatState;
            try {
                while (continueConversation && turns < maxTurns && !signal.aborted) {
                    turns++;
                    const currentTurnLlmResponseTs = Date.now();
                    currentTurnLlmResponseTsForCatch = currentTurnLlmResponseTs;
                    const currentTurnRequestId = globalInteractionRequestId + turns;
                    this._managePlaceholder(currentTurnLlmResponseTs, currentTurnRequestId);
                    // Завжди отримуємо найсвіжіший стан чату
                    chatStateForLlm = yield this.plugin.chatManager.getActiveChatOrFail();
                    const llmStream = this.plugin.ollamaService.generateChatResponseStream(chatStateForLlm, signal // Передаємо сигнал скасування в сервіс
                    );
                    const { accumulatedContent, nativeToolCalls, assistantMessageWithNativeCalls } = yield this._processLlmStream(llmStream, currentTurnLlmResponseTs, currentTurnRequestId
                    // _processLlmStream має внутрішньо обробляти сигнал, отриманий від ollamaService
                    );
                    if (signal.aborted)
                        throw new Error("aborted by user");
                    const toolCallCheckResult = this._determineToolCalls(nativeToolCalls, // 1. Розпарсені інструменти
                    accumulatedContent, // 2. Весь текстовий контент
                    currentTurnLlmResponseTs, // 3. Timestamp
                    currentTurnRequestId // 4. Request ID (для логування/майбутнього)
                    );
                    if (toolCallCheckResult.processedToolCallsThisTurn &&
                        toolCallCheckResult.processedToolCallsThisTurn.length > 0) {
                        const assistantMsgTsMs = toolCallCheckResult.assistantMessageForHistory.timestamp.getTime();
                        const assistantHmaPromise = new Promise((resolve, reject) => {
                            this.plugin.chatManager.registerHMAResolver(assistantMsgTsMs, resolve, reject);
                            setTimeout(() => {
                                if (this.plugin.chatManager.messageAddedResolvers.has(assistantMsgTsMs)) {
                                    this.plugin.chatManager.rejectAndClearHMAResolver(assistantMsgTsMs, `HMA Timeout for assistant tool intent (ts: ${assistantMsgTsMs}) in _handleLlmInteractionCycle`);
                                }
                            }, 10000);
                        });
                        yield this.plugin.chatManager.addMessageToActiveChatPayload(toolCallCheckResult.assistantMessageForHistory, true);
                        yield assistantHmaPromise;
                        yield this._executeAndRenderToolCycle(toolCallCheckResult.processedToolCallsThisTurn, toolCallCheckResult.assistantMessageForHistory, currentTurnRequestId, signal // Передаємо сигнал далі
                        );
                        continueConversation = true; // Продовжуємо, оскільки були викликані інструменти
                    }
                    else {
                        // Немає більше викликів інструментів, рендеримо фінальний текст
                        yield this._renderFinalAssistantText(accumulatedContent, currentTurnLlmResponseTs, currentTurnRequestId);
                        continueConversation = false; // Завершуємо цикл
                    }
                }
                if (turns >= maxTurns && !signal.aborted) {
                    const maxTurnsMsgTimestamp = new Date();
                    const maxTurnsMsg = {
                        role: "system",
                        content: "Max processing turns reached. If the task is not complete, please try rephrasing or breaking it down.",
                        timestamp: maxTurnsMsgTimestamp,
                    };
                    const hmaMaxTurnsPromise = new Promise((resolve, reject) => {
                        this.plugin.chatManager.registerHMAResolver(maxTurnsMsg.timestamp.getTime(), resolve, reject);
                        setTimeout(() => {
                            if (this.plugin.chatManager.messageAddedResolvers.has(maxTurnsMsg.timestamp.getTime())) {
                                this.plugin.chatManager.rejectAndClearHMAResolver(maxTurnsMsg.timestamp.getTime(), "HMA timeout for max turns msg in _handleLlmInteractionCycle");
                            }
                        }, 10000);
                    });
                    yield this.plugin.chatManager.addMessageToActiveChatPayload(maxTurnsMsg, true);
                    try {
                        yield hmaMaxTurnsPromise;
                    }
                    catch (e_hma) {
                    }
                }
            }
            catch (error) {
                // Помилка прокидається для обробки у викликаючому методі (sendMessage/handleRegenerateClick)
                throw error;
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiT2xsYW1hVmlldy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIk9sbGFtYVZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFDTCxRQUFRLEVBRVIsT0FBTyxFQUNQLGdCQUFnQixFQUNoQixNQUFNLEVBQ04sUUFBUSxFQUNSLGFBQWEsRUFDYixPQUFPLEVBRVAsSUFBSSxFQUNKLFFBQVEsR0FDVCxNQUFNLFVBQVUsQ0FBQztBQUVsQixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDOUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUU1QyxPQUFPLEVBQWMsU0FBUyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBR25ELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUk5QyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBRTFDLE9BQU8sS0FBSyxhQUFhLE1BQU0sd0JBQXdCLENBQUM7QUFDeEQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDeEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ2xELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBSXRFLE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFHLDJCQUEyQixDQUFDO0FBRXJFLE1BQU0sZ0JBQWdCLEdBQUcs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QyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNmLDZGQUE2RjtnQkFDN0YsTUFBTSxLQUFLLENBQUM7WUFDZCxDQUFDO1FBQ0gsQ0FBQztLQUFBO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xyXG4gIEl0ZW1WaWV3LFxyXG4gIFdvcmtzcGFjZUxlYWYsXHJcbiAgc2V0SWNvbixcclxuICBNYXJrZG93blJlbmRlcmVyLFxyXG4gIE5vdGljZSxcclxuICBkZWJvdW5jZSxcclxuICBub3JtYWxpemVQYXRoLFxyXG4gIFRGb2xkZXIsXHJcbiAgVEZpbGUsXHJcbiAgTWVudSxcclxuICBQbGF0Zm9ybSxcclxufSBmcm9tIFwib2JzaWRpYW5cIjtcclxuXHJcbmltcG9ydCB7IENvbmZpcm1Nb2RhbCB9IGZyb20gXCIuL0NvbmZpcm1Nb2RhbFwiO1xyXG5pbXBvcnQgeyBQcm9tcHRNb2RhbCB9IGZyb20gXCIuL1Byb21wdE1vZGFsXCI7XHJcbmltcG9ydCBPbGxhbWFQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xyXG5pbXBvcnQgeyBBdmF0YXJUeXBlLCBMQU5HVUFHRVMgfSBmcm9tIFwiLi9zZXR0aW5nc1wiO1xyXG5pbXBvcnQgeyBSb2xlSW5mbyB9IGZyb20gXCIuL0NoYXRNYW5hZ2VyXCI7XHJcbmltcG9ydCB7IENoYXQsIENoYXRNZXRhZGF0YSB9IGZyb20gXCIuL0NoYXRcIjtcclxuaW1wb3J0IHsgU3VtbWFyeU1vZGFsIH0gZnJvbSBcIi4vU3VtbWFyeU1vZGFsXCI7XHJcbmltcG9ydCB7IEFzc2lzdGFudE1lc3NhZ2UsIE1lc3NhZ2UsIE9sbGFtYUdlbmVyYXRlUmVzcG9uc2UsIE9sbGFtYVN0cmVhbUNodW5rLCBUb29sQ2FsbCB9IGZyb20gXCIuL3R5cGVzXCI7XHJcbmltcG9ydCB7IE1lc3NhZ2VSb2xlIGFzIE1lc3NhZ2VSb2xlVHlwZUZyb21UeXBlcyB9IGZyb20gXCIuL3R5cGVzXCI7XHJcblxyXG5pbXBvcnQgeyBDU1NfQ0xBU1NFUyB9IGZyb20gXCIuL2NvbnN0YW50c1wiO1xyXG5cclxuaW1wb3J0ICogYXMgUmVuZGVyZXJVdGlscyBmcm9tIFwiLi9NZXNzYWdlUmVuZGVyZXJVdGlsc1wiO1xyXG5pbXBvcnQgeyBVc2VyTWVzc2FnZVJlbmRlcmVyIH0gZnJvbSBcIi4vcmVuZGVyZXJzL1VzZXJNZXNzYWdlUmVuZGVyZXJcIjtcclxuaW1wb3J0IHsgQXNzaXN0YW50TWVzc2FnZVJlbmRlcmVyIH0gZnJvbSBcIi4vcmVuZGVyZXJzL0Fzc2lzdGFudE1lc3NhZ2VSZW5kZXJlclwiO1xyXG5pbXBvcnQgeyBTeXN0ZW1NZXNzYWdlUmVuZGVyZXIgfSBmcm9tIFwiLi9yZW5kZXJlcnMvU3lzdGVtTWVzc2FnZVJlbmRlcmVyXCI7XHJcbmltcG9ydCB7IEVycm9yTWVzc2FnZVJlbmRlcmVyIH0gZnJvbSBcIi4vcmVuZGVyZXJzL0Vycm9yTWVzc2FnZVJlbmRlcmVyXCI7XHJcbmltcG9ydCB7IEJhc2VNZXNzYWdlUmVuZGVyZXIgfSBmcm9tIFwiLi9yZW5kZXJlcnMvQmFzZU1lc3NhZ2VSZW5kZXJlclwiO1xyXG5pbXBvcnQgeyBTaWRlYmFyTWFuYWdlciB9IGZyb20gXCIuL1NpZGViYXJNYW5hZ2VyXCI7XHJcbmltcG9ydCB7IERyb3Bkb3duTWVudU1hbmFnZXIgfSBmcm9tIFwiLi9Ecm9wZG93bk1lbnVNYW5hZ2VyXCI7XHJcbmltcG9ydCB7IFRvb2xNZXNzYWdlUmVuZGVyZXIgfSBmcm9tIFwiLi9yZW5kZXJlcnMvVG9vbE1lc3NhZ2VSZW5kZXJlclwiO1xyXG5pbXBvcnQgeyBTdHJlYW1DaHVuayB9IGZyb20gXCIuL09sbGFtYVNlcnZpY2VcIjtcclxuaW1wb3J0IHsgcGFyc2VBbGxUZXh0dWFsVG9vbENhbGxzIH0gZnJvbSBcIi4vdXRpbHMvdG9vbFBhcnNlclwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IFZJRVdfVFlQRV9PTExBTUFfUEVSU09OQVMgPSBcIm9sbGFtYS1wZXJzb25hcy1jaGF0LXZpZXdcIjtcclxuXHJcbmNvbnN0IFNDUk9MTF9USFJFU0hPTEQgPSAxNTA7XHJcblxyXG5jb25zdCBDU1NfQ0xBU1NfVFJBTlNMQVRJTkdfSU5QVVQgPSBcInRyYW5zbGF0aW5nLWlucHV0XCI7XHJcbmNvbnN0IENTU19DTEFTU19FTVBUWV9TVEFURSA9IFwib2xsYW1hLWVtcHR5LXN0YXRlXCI7XHJcbmV4cG9ydCBjb25zdCBDU1NfQ0xBU1NfTUVTU0FHRSA9IFwibWVzc2FnZVwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfRVJST1JfVEVYVCA9IFwiZXJyb3ItbWVzc2FnZS10ZXh0XCI7XHJcbmNvbnN0IENTU19DTEFTU19UUkFOU0xBVElPTl9DT05UQUlORVIgPSBcInRyYW5zbGF0aW9uLWNvbnRhaW5lclwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfVFJBTlNMQVRJT05fQ09OVEVOVCA9IFwidHJhbnNsYXRpb24tY29udGVudFwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfVFJBTlNMQVRJT05fUEVORElORyA9IFwidHJhbnNsYXRpb24tcGVuZGluZ1wiO1xyXG5jb25zdCBDU1NfQ0xBU1NfUkVDT1JESU5HID0gXCJyZWNvcmRpbmdcIjtcclxuY29uc3QgQ1NTX0NMQVNTX0RJU0FCTEVEID0gXCJkaXNhYmxlZFwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfREFURV9TRVBBUkFUT1IgPSBcImNoYXQtZGF0ZS1zZXBhcmF0b3JcIjtcclxuY29uc3QgQ1NTX0NMQVNTX1ZJU0lCTEUgPSBcInZpc2libGVcIjtcclxuY29uc3QgQ1NTX0NMQVNTX0NPTlRFTlRfQ09MTEFQU0VEID0gXCJtZXNzYWdlLWNvbnRlbnQtY29sbGFwc2VkXCI7XHJcbmNvbnN0IENTU19DTEFTU19NRU5VX09QVElPTiA9IFwibWVudS1vcHRpb25cIjtcclxuXHJcbmNvbnN0IENTU19ST0xFX1BBTkVMX0lURU0gPSBcIm9sbGFtYS1yb2xlLXBhbmVsLWl0ZW1cIjtcclxuY29uc3QgQ1NTX1JPTEVfUEFORUxfSVRFTV9JQ09OID0gXCJvbGxhbWEtcm9sZS1wYW5lbC1pdGVtLWljb25cIjtcclxuY29uc3QgQ1NTX1JPTEVfUEFORUxfSVRFTV9URVhUID0gXCJvbGxhbWEtcm9sZS1wYW5lbC1pdGVtLXRleHRcIjtcclxuY29uc3QgQ1NTX1JPTEVfUEFORUxfSVRFTV9BQ1RJVkUgPSBcImlzLWFjdGl2ZVwiO1xyXG5jb25zdCBDU1NfUk9MRV9QQU5FTF9JVEVNX0NVU1RPTSA9IFwiaXMtY3VzdG9tXCI7XHJcbmNvbnN0IENTU19ST0xFX1BBTkVMX0lURU1fTk9ORSA9IFwib2xsYW1hLXJvbGUtcGFuZWwtaXRlbS1ub25lXCI7XHJcbmNvbnN0IENTU19TSURFQkFSX1NFQ1RJT05fSUNPTiA9IFwib2xsYW1hLXNpZGViYXItc2VjdGlvbi1pY29uXCI7XHJcbmNvbnN0IENTU19DSEFUX0lURU1fT1BUSU9OUyA9IFwib2xsYW1hLWNoYXQtaXRlbS1vcHRpb25zXCI7XHJcbmNvbnN0IENTU19DTEFTU19DSEFUX0xJU1RfSVRFTSA9IFwib2xsYW1hLWNoYXQtbGlzdC1pdGVtXCI7XHJcblxyXG5jb25zdCBDU1NfQ0xBU1NfUkVTSVpFUl9IQU5ETEUgPSBcIm9sbGFtYS1yZXNpemVyLWhhbmRsZVwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfUkVTSVpJTkcgPSBcImlzLXJlc2l6aW5nXCI7XHJcblxyXG5leHBvcnQgdHlwZSBNZXNzYWdlUm9sZSA9IFwidXNlclwiIHwgXCJhc3Npc3RhbnRcIiB8IFwic3lzdGVtXCIgfCBcImVycm9yXCIgfCBcInRvb2xcIjtcclxuXHJcbmV4cG9ydCBjbGFzcyBPbGxhbWFWaWV3IGV4dGVuZHMgSXRlbVZpZXcge1xyXG4gIHByaXZhdGUgc2lkZWJhck1hbmFnZXIhOiBTaWRlYmFyTWFuYWdlcjtcclxuICBwcml2YXRlIGRyb3Bkb3duTWVudU1hbmFnZXIhOiBEcm9wZG93bk1lbnVNYW5hZ2VyO1xyXG5cclxuICBwdWJsaWMgcmVhZG9ubHkgcGx1Z2luOiBPbGxhbWFQbHVnaW47XHJcbiAgcHJpdmF0ZSBjaGF0Q29udGFpbmVyRWwhOiBIVE1MRWxlbWVudDtcclxuICBwcml2YXRlIGlucHV0RWwhOiBIVE1MVGV4dEFyZWFFbGVtZW50O1xyXG4gIHByaXZhdGUgY2hhdENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xyXG4gIHByaXZhdGUgc2VuZEJ1dHRvbiE6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gIHByaXZhdGUgdm9pY2VCdXR0b24hOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICBwcml2YXRlIHRyYW5zbGF0ZUlucHV0QnV0dG9uITogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgcHJpdmF0ZSBtZW51QnV0dG9uITogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgcHJpdmF0ZSBidXR0b25zQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XHJcblxyXG4gIHByaXZhdGUgbW9kZWxEaXNwbGF5RWwhOiBIVE1MRWxlbWVudDtcclxuICBwcml2YXRlIHJvbGVEaXNwbGF5RWwhOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgcHJpdmF0ZSB0ZW1wZXJhdHVyZUluZGljYXRvckVsITogSFRNTEVsZW1lbnQ7XHJcbiAgcHJpdmF0ZSB0b2dnbGVMb2NhdGlvbkJ1dHRvbiE6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gIHByaXZhdGUgbmV3Q2hhdFNpZGViYXJCdXR0b24hOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuXHJcbiAgcHJpdmF0ZSBpc1Byb2Nlc3Npbmc6IGJvb2xlYW4gPSBmYWxzZTtcclxuICBwcml2YXRlIHNjcm9sbFRpbWVvdXQ6IE5vZGVKUy5UaW1lb3V0IHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSBzcGVlY2hXb3JrZXI6IFdvcmtlciB8IG51bGwgPSBudWxsO1xyXG4gIHByaXZhdGUgbWVkaWFSZWNvcmRlcjogTWVkaWFSZWNvcmRlciB8IG51bGwgPSBudWxsO1xyXG4gIHByaXZhdGUgYXVkaW9TdHJlYW06IE1lZGlhU3RyZWFtIHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSBlbXB0eVN0YXRlRWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSByZXNpemVUaW1lb3V0OiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xyXG4gIHByaXZhdGUgc2Nyb2xsTGlzdGVuZXJEZWJvdW5jZWQ6ICgpID0+IHZvaWQ7XHJcbiAgcHJpdmF0ZSBjdXJyZW50TWVzc2FnZXM6IE1lc3NhZ2VbXSA9IFtdO1xyXG4gIHByaXZhdGUgbGFzdFJlbmRlcmVkTWVzc2FnZURhdGU6IERhdGUgfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIG5ld01lc3NhZ2VzSW5kaWNhdG9yRWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSB1c2VyU2Nyb2xsZWRVcDogYm9vbGVhbiA9IGZhbHNlO1xyXG5cclxuICBwcml2YXRlIHJvbGVQYW5lbExpc3RFbCE6IEhUTUxFbGVtZW50O1xyXG4gIHByaXZhdGUgbWFpbkNoYXRBcmVhRWwhOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgcHJpdmF0ZSBsYXN0UHJvY2Vzc2VkQ2hhdElkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgcHJpdmF0ZSBjaGF0UGFuZWxMaXN0RWwhOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgcHJpdmF0ZSBjaGF0UGFuZWxIZWFkZXJFbCE6IEhUTUxFbGVtZW50O1xyXG4gIHByaXZhdGUgcm9sZVBhbmVsSGVhZGVyRWwhOiBIVE1MRWxlbWVudDtcclxuICBwcml2YXRlIHNjcm9sbFRvQm90dG9tQnV0dG9uITogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcblxyXG4gIHByaXZhdGUgc3RvcEdlbmVyYXRpbmdCdXR0b24hOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICBwcml2YXRlIGN1cnJlbnRBYm9ydENvbnRyb2xsZXI6IEFib3J0Q29udHJvbGxlciB8IG51bGwgPSBudWxsO1xyXG5cclxuICBwcml2YXRlIGxhc3RNZXNzYWdlRWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIGNvbnNlY3V0aXZlRXJyb3JNZXNzYWdlczogTWVzc2FnZVtdID0gW107XHJcbiAgcHJpdmF0ZSBlcnJvckdyb3VwRWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIGlzU3VtbWFyaXppbmdFcnJvcnMgPSBmYWxzZTtcclxuXHJcbiAgcHJpdmF0ZSBpc1JlZ2VuZXJhdGluZzogYm9vbGVhbiA9IGZhbHNlO1xyXG4gIHByaXZhdGUgbWVzc2FnZUFkZGVkUmVzb2x2ZXJzOiBNYXA8bnVtYmVyLCAoKSA9PiB2b2lkPiA9IG5ldyBNYXAoKTtcclxuXHJcbiAgcHJpdmF0ZSBpc0NoYXRMaXN0VXBkYXRlU2NoZWR1bGVkID0gZmFsc2U7XHJcbiAgcHJpdmF0ZSBjaGF0TGlzdFVwZGF0ZVRpbWVvdXRJZDogTm9kZUpTLlRpbWVvdXQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgcHJpdmF0ZSBhY3RpdmVQbGFjZWhvbGRlcjoge1xyXG4gICAgdGltZXN0YW1wOiBudW1iZXI7XHJcbiAgICBncm91cEVsOiBIVE1MRWxlbWVudDtcclxuICAgIGNvbnRlbnRFbDogSFRNTEVsZW1lbnQ7XHJcbiAgICBtZXNzYWdlV3JhcHBlcjogSFRNTEVsZW1lbnQ7XHJcbiAgfSB8IG51bGwgPSBudWxsO1xyXG5cclxuICBwcml2YXRlIHNpZGViYXJSb290RWwhOiBIVE1MRWxlbWVudDtcclxuICBwcml2YXRlIHJlc2l6ZXJFbCE6IEhUTUxFbGVtZW50O1xyXG4gIHByaXZhdGUgaXNSZXNpemluZyA9IGZhbHNlO1xyXG4gIHByaXZhdGUgaW5pdGlhbE1vdXNlWCA9IDA7XHJcbiAgcHJpdmF0ZSBpbml0aWFsU2lkZWJhcldpZHRoID0gMDtcclxuICBwcml2YXRlIGJvdW5kT25EcmFnTW92ZTogKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB2b2lkO1xyXG4gIHByaXZhdGUgYm91bmRPbkRyYWdFbmQ6IChldmVudDogTW91c2VFdmVudCkgPT4gdm9pZDtcclxuICBwcml2YXRlIHNhdmVXaWR0aERlYm91bmNlZDogKCkgPT4gdm9pZDtcclxuXHJcbiAgY29uc3RydWN0b3IobGVhZjogV29ya3NwYWNlTGVhZiwgcGx1Z2luOiBPbGxhbWFQbHVnaW4pIHtcclxuICAgIHN1cGVyKGxlYWYpO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgICB0aGlzLmFwcCA9IHBsdWdpbi5hcHA7XHJcblxyXG4gICAgdGhpcy5pbml0U3BlZWNoV29ya2VyKCk7XHJcblxyXG4gICAgdGhpcy5zY3JvbGxMaXN0ZW5lckRlYm91bmNlZCA9IGRlYm91bmNlKHRoaXMuaGFuZGxlU2Nyb2xsLCAxNTAsIHRydWUpO1xyXG4gICAgdGhpcy5yZWdpc3RlcihcclxuICAgICAgdGhpcy5wbHVnaW4ub24oXCJmb2N1cy1pbnB1dC1yZXF1ZXN0XCIsICgpID0+IHtcclxuICAgICAgICB0aGlzLmZvY3VzSW5wdXQoKTtcclxuICAgICAgfSlcclxuICAgICk7XHJcbiAgICB0aGlzLmJvdW5kT25EcmFnTW92ZSA9IHRoaXMub25EcmFnTW92ZS5iaW5kKHRoaXMpO1xyXG4gICAgdGhpcy5ib3VuZE9uRHJhZ0VuZCA9IHRoaXMub25EcmFnRW5kLmJpbmQodGhpcyk7XHJcblxyXG4gICAgdGhpcy5zYXZlV2lkdGhEZWJvdW5jZWQgPSBkZWJvdW5jZSgoKSA9PiB7XHJcbiAgICAgIGlmICh0aGlzLnNpZGViYXJSb290RWwpIHtcclxuICAgICAgICBjb25zdCBuZXdXaWR0aCA9IHRoaXMuc2lkZWJhclJvb3RFbC5vZmZzZXRXaWR0aDtcclxuXHJcbiAgICAgICAgaWYgKG5ld1dpZHRoID4gMCAmJiBuZXdXaWR0aCAhPT0gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2lkZWJhcldpZHRoKSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zaWRlYmFyV2lkdGggPSBuZXdXaWR0aDtcclxuXHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sIDgwMCk7XHJcbiAgfVxyXG5cclxuICBnZXRWaWV3VHlwZSgpOiBzdHJpbmcge1xyXG4gICAgcmV0dXJuIFZJRVdfVFlQRV9PTExBTUFfUEVSU09OQVM7XHJcbiAgfVxyXG4gIGdldERpc3BsYXlUZXh0KCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gXCJBSSBGb3JnZVwiO1xyXG4gIH1cclxuICBnZXRJY29uKCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gXCJicmFpbi1jaXJjdWl0XCI7XHJcbiAgfVxyXG5cclxuICBhc3luYyBvbk9wZW4oKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLmNyZWF0ZVVJRWxlbWVudHMoKTtcclxuXHJcbiAgICBjb25zdCBzYXZlZFdpZHRoID0gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2lkZWJhcldpZHRoO1xyXG4gICAgaWYgKHRoaXMuc2lkZWJhclJvb3RFbCAmJiBzYXZlZFdpZHRoICYmIHR5cGVvZiBzYXZlZFdpZHRoID09PSBcIm51bWJlclwiICYmIHNhdmVkV2lkdGggPiA1MCkge1xyXG4gICAgICB0aGlzLnNpZGViYXJSb290RWwuc3R5bGUud2lkdGggPSBgJHtzYXZlZFdpZHRofXB4YDtcclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLnN0eWxlLm1pbldpZHRoID0gYCR7c2F2ZWRXaWR0aH1weGA7XHJcbiAgICB9IGVsc2UgaWYgKHRoaXMuc2lkZWJhclJvb3RFbCkge1xyXG4gICAgICBsZXQgZGVmYXVsdFdpZHRoID0gMjUwO1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IGNzc1ZhcldpZHRoID0gZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLnNpZGViYXJSb290RWwpLmdldFByb3BlcnR5VmFsdWUoXCItLWFpLWZvcmdlLXNpZGViYXItd2lkdGhcIikudHJpbSgpO1xyXG4gICAgICAgIGlmIChjc3NWYXJXaWR0aCAmJiBjc3NWYXJXaWR0aC5lbmRzV2l0aChcInB4XCIpKSB7XHJcbiAgICAgICAgICBjb25zdCBwYXJzZWRXaWR0aCA9IHBhcnNlSW50KGNzc1ZhcldpZHRoLCAxMCk7XHJcbiAgICAgICAgICBpZiAoIWlzTmFOKHBhcnNlZFdpZHRoKSAmJiBwYXJzZWRXaWR0aCA+IDUwKSB7XHJcbiAgICAgICAgICAgIGRlZmF1bHRXaWR0aCA9IHBhcnNlZFdpZHRoO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfSBjYXRjaCAoZSkge31cclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLnN0eWxlLndpZHRoID0gYCR7ZGVmYXVsdFdpZHRofXB4YDtcclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLnN0eWxlLm1pbldpZHRoID0gYCR7ZGVmYXVsdFdpZHRofXB4YDtcclxuICAgICAgaWYgKCFzYXZlZFdpZHRoKSB7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBpbml0aWFsUm9sZVBhdGggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoO1xyXG4gICAgICBjb25zdCBpbml0aWFsUm9sZU5hbWUgPSBhd2FpdCB0aGlzLmZpbmRSb2xlTmFtZUJ5UGF0aChpbml0aWFsUm9sZVBhdGgpO1xyXG4gICAgICBjb25zdCBpbml0aWFsTW9kZWxOYW1lID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xyXG4gICAgICBjb25zdCBpbml0aWFsVGVtcGVyYXR1cmUgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZTtcclxuXHJcbiAgICAgIHRoaXMudXBkYXRlSW5wdXRQbGFjZWhvbGRlcihpbml0aWFsUm9sZU5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZVJvbGVEaXNwbGF5KGluaXRpYWxSb2xlTmFtZSk7XHJcbiAgICAgIHRoaXMudXBkYXRlTW9kZWxEaXNwbGF5KGluaXRpYWxNb2RlbE5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZVRlbXBlcmF0dXJlSW5kaWNhdG9yKGluaXRpYWxUZW1wZXJhdHVyZSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge31cclxuXHJcbiAgICB0aGlzLmF0dGFjaEV2ZW50TGlzdGVuZXJzKCk7XHJcblxyXG4gICAgdGhpcy5hdXRvUmVzaXplVGV4dGFyZWEoKTtcclxuICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5sb2FkQW5kRGlzcGxheUFjdGl2ZUNoYXQoKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMuc2hvd0VtcHR5U3RhdGUoKTtcclxuICAgIH1cclxuXHJcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgaWYgKHRoaXMuaW5wdXRFbCAmJiB0aGlzLmxlYWYudmlldyA9PT0gdGhpcyAmJiBkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHRoaXMuaW5wdXRFbCkpIHtcclxuICAgICAgICB0aGlzLmlucHV0RWwuZm9jdXMoKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgfVxyXG4gICAgfSwgMTUwKTtcclxuXHJcbiAgICBpZiAodGhpcy5pbnB1dEVsKSB7XHJcbiAgICAgIHRoaXMuaW5wdXRFbC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudChcImlucHV0XCIpKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIG9uQ2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIHRoaXMuYm91bmRPbkRyYWdNb3ZlLCB7IGNhcHR1cmU6IHRydWUgfSk7XHJcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2V1cFwiLCB0aGlzLmJvdW5kT25EcmFnRW5kLCB7IGNhcHR1cmU6IHRydWUgfSk7XHJcblxyXG4gICAgaWYgKGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmNvbnRhaW5zKENTU19DTEFTU19SRVNJWklORykpIHtcclxuICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS5jdXJzb3IgPSBcIlwiO1xyXG4gICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1JFU0laSU5HKTtcclxuICAgIH1cclxuICAgIHRoaXMuaXNSZXNpemluZyA9IGZhbHNlO1xyXG5cclxuICAgIGlmICh0aGlzLnNwZWVjaFdvcmtlcikge1xyXG4gICAgICB0aGlzLnNwZWVjaFdvcmtlci50ZXJtaW5hdGUoKTtcclxuICAgICAgdGhpcy5zcGVlY2hXb3JrZXIgPSBudWxsO1xyXG4gICAgfVxyXG4gICAgdGhpcy5zdG9wVm9pY2VSZWNvcmRpbmcoZmFsc2UpO1xyXG4gICAgaWYgKHRoaXMuYXVkaW9TdHJlYW0pIHtcclxuICAgICAgdGhpcy5hdWRpb1N0cmVhbS5nZXRUcmFja3MoKS5mb3JFYWNoKHQgPT4gdC5zdG9wKCkpO1xyXG4gICAgICB0aGlzLmF1ZGlvU3RyZWFtID0gbnVsbDtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnNjcm9sbFRpbWVvdXQpIGNsZWFyVGltZW91dCh0aGlzLnNjcm9sbFRpbWVvdXQpO1xyXG4gICAgaWYgKHRoaXMucmVzaXplVGltZW91dCkgY2xlYXJUaW1lb3V0KHRoaXMucmVzaXplVGltZW91dCk7XHJcbiAgICB0aGlzLnNpZGViYXJNYW5hZ2VyPy5kZXN0cm95KCk7XHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXI/LmRlc3Ryb3koKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY3JlYXRlVUlFbGVtZW50cygpOiB2b2lkIHtcclxuICAgIHRoaXMuY29udGVudEVsLmVtcHR5KCk7XHJcblxyXG4gICAgY29uc3QgZmxleENvbnRhaW5lciA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJvbGxhbWEtY29udGFpbmVyXCIgfSk7XHJcblxyXG4gICAgY29uc3QgaXNTaWRlYmFyTG9jYXRpb24gPSAhdGhpcy5wbHVnaW4uc2V0dGluZ3Mub3BlbkNoYXRJblRhYjtcclxuICAgIGNvbnN0IGlzRGVza3RvcCA9IFBsYXRmb3JtLmlzRGVza3RvcDtcclxuXHJcbiAgICB0aGlzLnNpZGViYXJNYW5hZ2VyID0gbmV3IFNpZGViYXJNYW5hZ2VyKHRoaXMucGx1Z2luLCB0aGlzLmFwcCwgdGhpcyk7XHJcbiAgICB0aGlzLnNpZGViYXJSb290RWwgPSB0aGlzLnNpZGViYXJNYW5hZ2VyLmNyZWF0ZVNpZGViYXJVSShmbGV4Q29udGFpbmVyKTtcclxuXHJcbiAgICBjb25zdCBzaG91bGRTaG93SW50ZXJuYWxTaWRlYmFyID0gaXNEZXNrdG9wICYmICFpc1NpZGViYXJMb2NhdGlvbjtcclxuICAgIGlmICh0aGlzLnNpZGViYXJSb290RWwpIHtcclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLmNsYXNzTGlzdC50b2dnbGUoXCJpbnRlcm5hbC1zaWRlYmFyLWhpZGRlblwiLCAhc2hvdWxkU2hvd0ludGVybmFsU2lkZWJhcik7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMucmVzaXplckVsID0gZmxleENvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU19SRVNJWkVSX0hBTkRMRSB9KTtcclxuICAgIHRoaXMucmVzaXplckVsLnRpdGxlID0gXCJEcmFnIHRvIHJlc2l6ZSBzaWRlYmFyXCI7XHJcblxyXG4gICAgdGhpcy5yZXNpemVyRWwuY2xhc3NMaXN0LnRvZ2dsZShcImludGVybmFsLXNpZGViYXItaGlkZGVuXCIsICFzaG91bGRTaG93SW50ZXJuYWxTaWRlYmFyKTtcclxuXHJcbiAgICB0aGlzLm1haW5DaGF0QXJlYUVsID0gZmxleENvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwib2xsYW1hLW1haW4tY2hhdC1hcmVhXCIgfSk7XHJcblxyXG4gICAgdGhpcy5tYWluQ2hhdEFyZWFFbC5jbGFzc0xpc3QudG9nZ2xlKFwiZnVsbC13aWR0aFwiLCAhc2hvdWxkU2hvd0ludGVybmFsU2lkZWJhcik7XHJcblxyXG4gICAgdGhpcy5jaGF0Q29udGFpbmVyRWwgPSB0aGlzLm1haW5DaGF0QXJlYUVsLmNyZWF0ZURpdih7IGNsczogXCJvbGxhbWEtY2hhdC1hcmVhLWNvbnRlbnRcIiB9KTtcclxuICAgIHRoaXMuY2hhdENvbnRhaW5lciA9IHRoaXMuY2hhdENvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJvbGxhbWEtY2hhdC1jb250YWluZXJcIiB9KTtcclxuICAgIHRoaXMubmV3TWVzc2FnZXNJbmRpY2F0b3JFbCA9IHRoaXMuY2hhdENvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJuZXctbWVzc2FnZS1pbmRpY2F0b3JcIiB9KTtcclxuICAgIHNldEljb24odGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsLmNyZWF0ZVNwYW4oeyBjbHM6IFwiaW5kaWNhdG9yLWljb25cIiB9KSwgXCJhcnJvdy1kb3duXCIpO1xyXG4gICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsLmNyZWF0ZVNwYW4oeyB0ZXh0OiBcIiBOZXcgTWVzc2FnZXNcIiB9KTtcclxuICAgIHRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24gPSB0aGlzLmNoYXRDb250YWluZXJFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7XHJcbiAgICAgIGNsczogW1wic2Nyb2xsLXRvLWJvdHRvbS1idXR0b25cIiwgXCJjbGlja2FibGUtaWNvblwiXSxcclxuICAgICAgYXR0cjogeyBcImFyaWEtbGFiZWxcIjogXCJTY3JvbGwgdG8gYm90dG9tXCIsIHRpdGxlOiBcIlNjcm9sbCB0byBib3R0b21cIiB9LFxyXG4gICAgfSk7XHJcbiAgICBzZXRJY29uKHRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24sIFwiYXJyb3ctZG93blwiKTtcclxuICAgIGNvbnN0IGlucHV0Q29udGFpbmVyID0gdGhpcy5tYWluQ2hhdEFyZWFFbC5jcmVhdGVEaXYoeyBjbHM6IFwiY2hhdC1pbnB1dC1jb250YWluZXJcIiB9KTtcclxuICAgIHRoaXMuaW5wdXRFbCA9IGlucHV0Q29udGFpbmVyLmNyZWF0ZUVsKFwidGV4dGFyZWFcIiwge1xyXG4gICAgICBhdHRyOiB7IHBsYWNlaG9sZGVyOiBgRW50ZXIgbWVzc2FnZSB0ZXh0IGhlcmUuLi5gLCByb3dzOiAxIH0sXHJcbiAgICB9KTtcclxuICAgIGNvbnN0IGNvbnRyb2xzQ29udGFpbmVyID0gaW5wdXRDb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImlucHV0LWNvbnRyb2xzLWNvbnRhaW5lclwiIH0pO1xyXG4gICAgY29uc3QgbGVmdENvbnRyb2xzID0gY29udHJvbHNDb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImlucHV0LWNvbnRyb2xzLWxlZnRcIiB9KTtcclxuICAgIHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24gPSBsZWZ0Q29udHJvbHMuY3JlYXRlRWwoXCJidXR0b25cIiwge1xyXG4gICAgICBjbHM6IFwidHJhbnNsYXRlLWlucHV0LWJ1dHRvblwiLFxyXG4gICAgICBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIlRyYW5zbGF0ZSBpbnB1dCB0byBFbmdsaXNoXCIgfSxcclxuICAgIH0pO1xyXG4gICAgc2V0SWNvbih0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLCBcImxhbmd1YWdlc1wiKTtcclxuICAgIHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24udGl0bGUgPSBcIlRyYW5zbGF0ZSBpbnB1dCB0byBFbmdsaXNoXCI7XHJcbiAgICB0aGlzLm1vZGVsRGlzcGxheUVsID0gbGVmdENvbnRyb2xzLmNyZWF0ZURpdih7IGNsczogXCJtb2RlbC1kaXNwbGF5XCIgfSk7XHJcbiAgICB0aGlzLm1vZGVsRGlzcGxheUVsLnNldFRleHQoXCIuLi5cIik7XHJcbiAgICB0aGlzLm1vZGVsRGlzcGxheUVsLnRpdGxlID0gXCJDbGljayB0byBzZWxlY3QgbW9kZWxcIjtcclxuICAgIHRoaXMucm9sZURpc3BsYXlFbCA9IGxlZnRDb250cm9scy5jcmVhdGVEaXYoeyBjbHM6IFwicm9sZS1kaXNwbGF5XCIgfSk7XHJcbiAgICB0aGlzLnJvbGVEaXNwbGF5RWwuc2V0VGV4dChcIi4uLlwiKTtcclxuICAgIHRoaXMucm9sZURpc3BsYXlFbC50aXRsZSA9IFwiQ2xpY2sgdG8gc2VsZWN0IHJvbGVcIjtcclxuICAgIHRoaXMudGVtcGVyYXR1cmVJbmRpY2F0b3JFbCA9IGxlZnRDb250cm9scy5jcmVhdGVEaXYoeyBjbHM6IFwidGVtcGVyYXR1cmUtaW5kaWNhdG9yXCIgfSk7XHJcbiAgICB0aGlzLnRlbXBlcmF0dXJlSW5kaWNhdG9yRWwuc2V0VGV4dChcIj9cIik7XHJcbiAgICB0aGlzLnRlbXBlcmF0dXJlSW5kaWNhdG9yRWwudGl0bGUgPSBcIkNsaWNrIHRvIHNldCB0ZW1wZXJhdHVyZVwiO1xyXG4gICAgdGhpcy5idXR0b25zQ29udGFpbmVyID0gY29udHJvbHNDb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBgYnV0dG9ucy1jb250YWluZXIgaW5wdXQtY29udHJvbHMtcmlnaHRgIH0pO1xyXG4gICAgdGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbiA9IHRoaXMuYnV0dG9uc0NvbnRhaW5lci5jcmVhdGVFbChcImJ1dHRvblwiLCB7XHJcbiAgICAgIGNsczogW1wic3RvcC1nZW5lcmF0aW5nLWJ1dHRvblwiLCBcImRhbmdlci1vcHRpb25cIl0sXHJcbiAgICAgIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiU3RvcCBHZW5lcmF0aW9uXCIsIHRpdGxlOiBcIlN0b3AgR2VuZXJhdGlvblwiIH0sXHJcbiAgICB9KTtcclxuICAgIHNldEljb24odGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbiwgXCJzcXVhcmVcIik7XHJcbiAgICB0aGlzLnN0b3BHZW5lcmF0aW5nQnV0dG9uLmhpZGUoKTtcclxuICAgIHRoaXMuc2VuZEJ1dHRvbiA9IHRoaXMuYnV0dG9uc0NvbnRhaW5lci5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJzZW5kLWJ1dHRvblwiLCBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIlNlbmRcIiB9IH0pO1xyXG4gICAgc2V0SWNvbih0aGlzLnNlbmRCdXR0b24sIFwic2VuZFwiKTtcclxuICAgIHRoaXMudm9pY2VCdXR0b24gPSB0aGlzLmJ1dHRvbnNDb250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwge1xyXG4gICAgICBjbHM6IFwidm9pY2UtYnV0dG9uXCIsXHJcbiAgICAgIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiVm9pY2UgSW5wdXRcIiB9LFxyXG4gICAgfSk7XHJcbiAgICBzZXRJY29uKHRoaXMudm9pY2VCdXR0b24sIFwibWljXCIpO1xyXG4gICAgdGhpcy50b2dnbGVMb2NhdGlvbkJ1dHRvbiA9IHRoaXMuYnV0dG9uc0NvbnRhaW5lci5jcmVhdGVFbChcImJ1dHRvblwiLCB7XHJcbiAgICAgIGNsczogXCJ0b2dnbGUtbG9jYXRpb24tYnV0dG9uXCIsXHJcbiAgICAgIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiVG9nZ2xlIFZpZXcgTG9jYXRpb25cIiB9LFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLm1lbnVCdXR0b24gPSB0aGlzLmJ1dHRvbnNDb250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwibWVudS1idXR0b25cIiwgYXR0cjogeyBcImFyaWEtbGFiZWxcIjogXCJNZW51XCIgfSB9KTtcclxuICAgIHNldEljb24odGhpcy5tZW51QnV0dG9uLCBcIm1vcmUtdmVydGljYWxcIik7XHJcbiAgICB0aGlzLnVwZGF0ZVRvZ2dsZUxvY2F0aW9uQnV0dG9uKCk7XHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXIgPSBuZXcgRHJvcGRvd25NZW51TWFuYWdlcihcclxuICAgICAgdGhpcy5wbHVnaW4sXHJcbiAgICAgIHRoaXMuYXBwLFxyXG4gICAgICB0aGlzLFxyXG4gICAgICBpbnB1dENvbnRhaW5lcixcclxuICAgICAgaXNTaWRlYmFyTG9jYXRpb24sXHJcbiAgICAgIGlzRGVza3RvcFxyXG4gICAgKTtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlci5jcmVhdGVNZW51VUkoKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXR0YWNoRXZlbnRMaXN0ZW5lcnMoKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5yZXNpemVyRWwpIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMucmVzaXplckVsLCBcIm1vdXNlZG93blwiLCB0aGlzLm9uRHJhZ1N0YXJ0KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuaW5wdXRFbCkge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5pbnB1dEVsLCBcImtleWRvd25cIiwgdGhpcy5oYW5kbGVLZXlEb3duKTtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMuaW5wdXRFbCwgXCJpbnB1dFwiLCB0aGlzLmhhbmRsZUlucHV0Rm9yUmVzaXplKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnNlbmRCdXR0b24pIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMuc2VuZEJ1dHRvbiwgXCJjbGlja1wiLCB0aGlzLmhhbmRsZVNlbmRDbGljayk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbikge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbiwgXCJjbGlja1wiLCB0aGlzLmNhbmNlbEdlbmVyYXRpb24pO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMudm9pY2VCdXR0b24pIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMudm9pY2VCdXR0b24sIFwiY2xpY2tcIiwgdGhpcy5oYW5kbGVWb2ljZUNsaWNrKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uKSB7XHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLCBcImNsaWNrXCIsIHRoaXMuaGFuZGxlVHJhbnNsYXRlSW5wdXRDbGljayk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5tZW51QnV0dG9uKSB7XHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh0aGlzLm1lbnVCdXR0b24sIFwiY2xpY2tcIiwgdGhpcy5oYW5kbGVNZW51QnV0dG9uQ2xpY2spO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMudG9nZ2xlTG9jYXRpb25CdXR0b24pIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMudG9nZ2xlTG9jYXRpb25CdXR0b24sIFwiY2xpY2tcIiwgdGhpcy5oYW5kbGVUb2dnbGVWaWV3TG9jYXRpb25DbGljayk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5tb2RlbERpc3BsYXlFbCkge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5tb2RlbERpc3BsYXlFbCwgXCJjbGlja1wiLCB0aGlzLmhhbmRsZU1vZGVsRGlzcGxheUNsaWNrKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnJvbGVEaXNwbGF5RWwpIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMucm9sZURpc3BsYXlFbCwgXCJjbGlja1wiLCB0aGlzLmhhbmRsZVJvbGVEaXNwbGF5Q2xpY2spO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMudGVtcGVyYXR1cmVJbmRpY2F0b3JFbCkge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy50ZW1wZXJhdHVyZUluZGljYXRvckVsLCBcImNsaWNrXCIsIHRoaXMuaGFuZGxlVGVtcGVyYXR1cmVDbGljayk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5jaGF0Q29udGFpbmVyKSB7XHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh0aGlzLmNoYXRDb250YWluZXIsIFwic2Nyb2xsXCIsIHRoaXMuc2Nyb2xsTGlzdGVuZXJEZWJvdW5jZWQpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMubmV3TWVzc2FnZXNJbmRpY2F0b3JFbCkge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsLCBcImNsaWNrXCIsIHRoaXMuaGFuZGxlTmV3TWVzc2FnZUluZGljYXRvckNsaWNrKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnNjcm9sbFRvQm90dG9tQnV0dG9uKSB7XHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh0aGlzLnNjcm9sbFRvQm90dG9tQnV0dG9uLCBcImNsaWNrXCIsIHRoaXMuaGFuZGxlU2Nyb2xsVG9Cb3R0b21DbGljayk7XHJcbiAgICB9XHJcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCBcInJlc2l6ZVwiLCB0aGlzLmhhbmRsZVdpbmRvd1Jlc2l6ZSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQsIFwiY2xpY2tcIiwgdGhpcy5oYW5kbGVEb2N1bWVudENsaWNrRm9yTWVudSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQsIFwidmlzaWJpbGl0eWNoYW5nZVwiLCB0aGlzLmhhbmRsZVZpc2liaWxpdHlDaGFuZ2UpO1xyXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImFjdGl2ZS1sZWFmLWNoYW5nZVwiLCB0aGlzLmhhbmRsZUFjdGl2ZUxlYWZDaGFuZ2UpKTtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uYXR0YWNoRXZlbnRMaXN0ZW5lcnMoKTtcclxuICAgIHRoaXMucmVnaXN0ZXIodGhpcy5wbHVnaW4ub24oXCJtb2RlbC1jaGFuZ2VkXCIsIG1vZGVsTmFtZSA9PiB0aGlzLmhhbmRsZU1vZGVsQ2hhbmdlKG1vZGVsTmFtZSkpKTtcclxuICAgIHRoaXMucmVnaXN0ZXIodGhpcy5wbHVnaW4ub24oXCJyb2xlLWNoYW5nZWRcIiwgcm9sZU5hbWUgPT4gdGhpcy5oYW5kbGVSb2xlQ2hhbmdlKHJvbGVOYW1lKSkpO1xyXG4gICAgdGhpcy5yZWdpc3Rlcih0aGlzLnBsdWdpbi5vbihcInJvbGVzLXVwZGF0ZWRcIiwgKCkgPT4gdGhpcy5oYW5kbGVSb2xlc1VwZGF0ZWQoKSkpO1xyXG4gICAgdGhpcy5yZWdpc3Rlcih0aGlzLnBsdWdpbi5vbihcIm1lc3NhZ2UtYWRkZWRcIiwgZGF0YSA9PiB0aGlzLmhhbmRsZU1lc3NhZ2VBZGRlZChkYXRhKSkpO1xyXG4gICAgdGhpcy5yZWdpc3Rlcih0aGlzLnBsdWdpbi5vbihcImFjdGl2ZS1jaGF0LWNoYW5nZWRcIiwgZGF0YSA9PiB0aGlzLmhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkKGRhdGEpKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyKHRoaXMucGx1Z2luLm9uKFwibWVzc2FnZXMtY2xlYXJlZFwiLCBjaGF0SWQgPT4gdGhpcy5oYW5kbGVNZXNzYWdlc0NsZWFyZWQoY2hhdElkKSkpO1xyXG4gICAgdGhpcy5yZWdpc3Rlcih0aGlzLnBsdWdpbi5vbihcImNoYXQtbGlzdC11cGRhdGVkXCIsICgpID0+IHRoaXMuaGFuZGxlQ2hhdExpc3RVcGRhdGVkKCkpKTtcclxuICAgIHRoaXMucmVnaXN0ZXIodGhpcy5wbHVnaW4ub24oXCJzZXR0aW5ncy11cGRhdGVkXCIsICgpID0+IHRoaXMuaGFuZGxlU2V0dGluZ3NVcGRhdGVkKCkpKTtcclxuICAgIHRoaXMucmVnaXN0ZXIodGhpcy5wbHVnaW4ub24oXCJtZXNzYWdlLWRlbGV0ZWRcIiwgZGF0YSA9PiB0aGlzLmhhbmRsZU1lc3NhZ2VEZWxldGVkKGRhdGEpKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyKHRoaXMucGx1Z2luLm9uKFwib2xsYW1hLWNvbm5lY3Rpb24tZXJyb3JcIiwgKCkgPT4ge30pKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY2FuY2VsR2VuZXJhdGlvbiA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICh0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIpIHtcclxuICAgICAgdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyLmFib3J0KCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlTWVzc2FnZURlbGV0ZWQgPSAoZGF0YTogeyBjaGF0SWQ6IHN0cmluZzsgdGltZXN0YW1wOiBEYXRlIH0pOiB2b2lkID0+IHtcclxuICAgIGNvbnN0IGN1cnJlbnRBY3RpdmVDaGF0SWQgPSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdElkKCk7XHJcblxyXG4gICAgaWYgKGRhdGEuY2hhdElkICE9PSBjdXJyZW50QWN0aXZlQ2hhdElkIHx8ICF0aGlzLmNoYXRDb250YWluZXIpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHRpbWVzdGFtcE1zID0gZGF0YS50aW1lc3RhbXAuZ2V0VGltZSgpO1xyXG4gICAgY29uc3Qgc2VsZWN0b3IgPSBgLiR7Q1NTX0NMQVNTRVMuTUVTU0FHRV9HUk9VUH1bZGF0YS10aW1lc3RhbXA9XCIke3RpbWVzdGFtcE1zfVwiXWA7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgbWVzc2FnZUdyb3VwRWwgPSB0aGlzLmNoYXRDb250YWluZXIucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcblxyXG4gICAgICBpZiAobWVzc2FnZUdyb3VwRWwgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRTY3JvbGxUb3AgPSB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG9wO1xyXG4gICAgICAgIGNvbnN0IHJlbW92ZWRIZWlnaHQgPSBtZXNzYWdlR3JvdXBFbC5vZmZzZXRIZWlnaHQ7XHJcbiAgICAgICAgY29uc3Qgd2FzQWJvdmVWaWV3cG9ydCA9IG1lc3NhZ2VHcm91cEVsLm9mZnNldFRvcCA8IGN1cnJlbnRTY3JvbGxUb3A7XHJcblxyXG4gICAgICAgIG1lc3NhZ2VHcm91cEVsLnJlbW92ZSgpO1xyXG5cclxuICAgICAgICBjb25zdCBpbml0aWFsTGVuZ3RoID0gdGhpcy5jdXJyZW50TWVzc2FnZXMubGVuZ3RoO1xyXG4gICAgICAgIHRoaXMuY3VycmVudE1lc3NhZ2VzID0gdGhpcy5jdXJyZW50TWVzc2FnZXMuZmlsdGVyKG1zZyA9PiBtc2cudGltZXN0YW1wLmdldFRpbWUoKSAhPT0gdGltZXN0YW1wTXMpO1xyXG5cclxuICAgICAgICBpZiAod2FzQWJvdmVWaWV3cG9ydCkge1xyXG4gICAgICAgICAgY29uc3QgbmV3U2Nyb2xsVG9wID0gY3VycmVudFNjcm9sbFRvcCAtIHJlbW92ZWRIZWlnaHQ7XHJcbiAgICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG9wID0gbmV3U2Nyb2xsVG9wID49IDAgPyBuZXdTY3JvbGxUb3AgOiAwO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG9wID0gY3VycmVudFNjcm9sbFRvcDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRNZXNzYWdlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgIHRoaXMuc2hvd0VtcHR5U3RhdGUoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAobWVzc2FnZUdyb3VwRWwpIHtcclxuICAgICAgICB0aGlzLmxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdCgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdCgpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgdXBkYXRlUm9sZVBhbmVsTGlzdCA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRoaXMucm9sZVBhbmVsTGlzdEVsO1xyXG4gICAgaWYgKCFjb250YWluZXIgfHwgIXRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5yb2xlUGFuZWxIZWFkZXJFbD8uZ2V0QXR0cmlidXRlKFwiZGF0YS1jb2xsYXBzZWRcIikgPT09IFwidHJ1ZVwiKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjdXJyZW50U2Nyb2xsVG9wID0gY29udGFpbmVyLnNjcm9sbFRvcDtcclxuICAgIGNvbnRhaW5lci5lbXB0eSgpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJvbGVzID0gYXdhaXQgdGhpcy5wbHVnaW4ubGlzdFJvbGVGaWxlcyh0cnVlKTtcclxuICAgICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXQoKTtcclxuICAgICAgY29uc3QgY3VycmVudFJvbGVQYXRoID0gYWN0aXZlQ2hhdD8ubWV0YWRhdGE/LnNlbGVjdGVkUm9sZVBhdGggPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aDtcclxuXHJcbiAgICAgIGNvbnN0IG5vbmVPcHRpb25FbCA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFtDU1NfUk9MRV9QQU5FTF9JVEVNLCBDU1NfUk9MRV9QQU5FTF9JVEVNX05PTkUsIFwibWVudS1vcHRpb25cIl0gfSk7XHJcbiAgICAgIGNvbnN0IG5vbmVJY29uU3BhbiA9IG5vbmVPcHRpb25FbC5jcmVhdGVTcGFuKHsgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTV9JQ09OLCBcIm1lbnUtb3B0aW9uLWljb25cIl0gfSk7XHJcbiAgICAgIG5vbmVPcHRpb25FbC5jcmVhdGVTcGFuKHsgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTV9URVhULCBcIm1lbnUtb3B0aW9uLXRleHRcIl0sIHRleHQ6IFwiTm9uZVwiIH0pO1xyXG4gICAgICBpZiAoIWN1cnJlbnRSb2xlUGF0aCkge1xyXG4gICAgICAgIG5vbmVPcHRpb25FbC5hZGRDbGFzcyhDU1NfUk9MRV9QQU5FTF9JVEVNX0FDVElWRSk7XHJcbiAgICAgICAgc2V0SWNvbihub25lSWNvblNwYW4sIFwiY2hlY2tcIik7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgc2V0SWNvbihub25lSWNvblNwYW4sIFwic2xhc2hcIik7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KG5vbmVPcHRpb25FbCwgXCJjbGlja1wiLCAoKSA9PiB0aGlzLmhhbmRsZVJvbGVQYW5lbEl0ZW1DbGljayhudWxsLCBjdXJyZW50Um9sZVBhdGgpKTtcclxuXHJcbiAgICAgIHJvbGVzLmZvckVhY2gocm9sZUluZm8gPT4ge1xyXG4gICAgICAgIGNvbnN0IHJvbGVPcHRpb25FbCA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFtDU1NfUk9MRV9QQU5FTF9JVEVNLCBcIm1lbnUtb3B0aW9uXCJdIH0pO1xyXG4gICAgICAgIGNvbnN0IGljb25TcGFuID0gcm9sZU9wdGlvbkVsLmNyZWF0ZVNwYW4oeyBjbHM6IFtDU1NfUk9MRV9QQU5FTF9JVEVNX0lDT04sIFwibWVudS1vcHRpb24taWNvblwiXSB9KTtcclxuICAgICAgICByb2xlT3B0aW9uRWwuY3JlYXRlU3Bhbih7IGNsczogW0NTU19ST0xFX1BBTkVMX0lURU1fVEVYVCwgXCJtZW51LW9wdGlvbi10ZXh0XCJdLCB0ZXh0OiByb2xlSW5mby5uYW1lIH0pO1xyXG4gICAgICAgIGlmIChyb2xlSW5mby5pc0N1c3RvbSkge1xyXG4gICAgICAgICAgcm9sZU9wdGlvbkVsLmFkZENsYXNzKENTU19ST0xFX1BBTkVMX0lURU1fQ1VTVE9NKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHJvbGVJbmZvLnBhdGggPT09IGN1cnJlbnRSb2xlUGF0aCkge1xyXG4gICAgICAgICAgcm9sZU9wdGlvbkVsLmFkZENsYXNzKENTU19ST0xFX1BBTkVMX0lURU1fQUNUSVZFKTtcclxuICAgICAgICAgIHNldEljb24oaWNvblNwYW4sIFwiY2hlY2tcIik7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHNldEljb24oaWNvblNwYW4sIHJvbGVJbmZvLmlzQ3VzdG9tID8gXCJ1c2VyXCIgOiBcImZpbGUtdGV4dFwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHJvbGVPcHRpb25FbCwgXCJjbGlja1wiLCAoKSA9PiB0aGlzLmhhbmRsZVJvbGVQYW5lbEl0ZW1DbGljayhyb2xlSW5mbywgY3VycmVudFJvbGVQYXRoKSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29udGFpbmVyLmVtcHR5KCk7XHJcbiAgICAgIGNvbnRhaW5lci5jcmVhdGVEaXYoeyB0ZXh0OiBcIkVycm9yIGxvYWRpbmcgcm9sZXMuXCIsIGNsczogXCJtZW51LWVycm9yLXRleHRcIiB9KTtcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgY29udGFpbmVyLnNjcm9sbFRvcCA9IGN1cnJlbnRTY3JvbGxUb3A7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlUm9sZVBhbmVsSXRlbUNsaWNrID0gYXN5bmMgKFxyXG4gICAgcm9sZUluZm86IFJvbGVJbmZvIHwgbnVsbCxcclxuICAgIGN1cnJlbnRSb2xlUGF0aDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZFxyXG4gICk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgY29uc3QgbmV3Um9sZVBhdGggPSByb2xlSW5mbz8ucGF0aCA/PyBcIlwiO1xyXG4gICAgY29uc3Qgcm9sZU5hbWVGb3JFdmVudCA9IHJvbGVJbmZvPy5uYW1lID8/IFwiTm9uZVwiO1xyXG5cclxuICAgIGlmIChuZXdSb2xlUGF0aCAhPT0gY3VycmVudFJvbGVQYXRoKSB7XHJcbiAgICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdCgpO1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGlmIChhY3RpdmVDaGF0KSB7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci51cGRhdGVBY3RpdmVDaGF0TWV0YWRhdGEoe1xyXG4gICAgICAgICAgICBzZWxlY3RlZFJvbGVQYXRoOiBuZXdSb2xlUGF0aCxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoID0gbmV3Um9sZVBhdGg7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwicm9sZS1jaGFuZ2VkXCIsIHJvbGVOYW1lRm9yRXZlbnQpO1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ucHJvbXB0U2VydmljZT8uY2xlYXJSb2xlQ2FjaGU/LigpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIHNldCB0aGUgcm9sZS5cIik7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSB1cGRhdGVUb2dnbGVMb2NhdGlvbkJ1dHRvbigpOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy50b2dnbGVMb2NhdGlvbkJ1dHRvbikgcmV0dXJuO1xyXG5cclxuICAgIGxldCBpY29uTmFtZTogc3RyaW5nO1xyXG4gICAgbGV0IHRpdGxlVGV4dDogc3RyaW5nO1xyXG5cclxuICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuQ2hhdEluVGFiKSB7XHJcbiAgICAgIGljb25OYW1lID0gXCJzaWRlYmFyLXJpZ2h0XCI7XHJcbiAgICAgIHRpdGxlVGV4dCA9IFwiTW92ZSB0byBTaWRlYmFyXCI7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBpY29uTmFtZSA9IFwibGF5b3V0LWxpc3RcIjtcclxuICAgICAgdGl0bGVUZXh0ID0gXCJNb3ZlIHRvIFRhYlwiO1xyXG4gICAgfVxyXG4gICAgc2V0SWNvbih0aGlzLnRvZ2dsZUxvY2F0aW9uQnV0dG9uLCBpY29uTmFtZSk7XHJcbiAgICB0aGlzLnRvZ2dsZUxvY2F0aW9uQnV0dG9uLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgdGl0bGVUZXh0KTtcclxuICAgIHRoaXMudG9nZ2xlTG9jYXRpb25CdXR0b24udGl0bGUgPSB0aXRsZVRleHQ7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZU1vZGVsRGlzcGxheUNsaWNrID0gYXN5bmMgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICBjb25zdCBtZW51ID0gbmV3IE1lbnUoKTtcclxuICAgIGxldCBpdGVtc0FkZGVkID0gZmFsc2U7XHJcblxyXG4gICAgY29uc3QgbG9hZGluZ05vdGljZSA9IG5ldyBOb3RpY2UoXCJMb2FkaW5nIG1vZGVscy4uLlwiLCAwKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBtb2RlbHMgPSBhd2FpdCB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdldE1vZGVscygpO1xyXG4gICAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgICAgY29uc3QgY3VycmVudE1vZGVsTmFtZSA9IGFjdGl2ZUNoYXQ/Lm1ldGFkYXRhPy5tb2RlbE5hbWUgfHwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xyXG5cclxuICAgICAgbG9hZGluZ05vdGljZS5oaWRlKCk7XHJcblxyXG4gICAgICBpZiAobW9kZWxzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IGl0ZW0uc2V0VGl0bGUoXCJObyBtb2RlbHMgZm91bmRcIikuc2V0RGlzYWJsZWQodHJ1ZSkpO1xyXG4gICAgICAgIGl0ZW1zQWRkZWQgPSB0cnVlO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIG1vZGVscy5mb3JFYWNoKG1vZGVsTmFtZSA9PiB7XHJcbiAgICAgICAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxyXG4gICAgICAgICAgICBpdGVtXHJcbiAgICAgICAgICAgICAgLnNldFRpdGxlKG1vZGVsTmFtZSlcclxuICAgICAgICAgICAgICAuc2V0SWNvbihtb2RlbE5hbWUgPT09IGN1cnJlbnRNb2RlbE5hbWUgPyBcImNoZWNrXCIgOiBcInJhZGlvLWJ1dHRvblwiKVxyXG4gICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNoYXRUb1VwZGF0ZSA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBsYXRlc3RNb2RlbE5hbWUgPSBjaGF0VG9VcGRhdGU/Lm1ldGFkYXRhPy5tb2RlbE5hbWUgfHwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xyXG4gICAgICAgICAgICAgICAgaWYgKG1vZGVsTmFtZSAhPT0gbGF0ZXN0TW9kZWxOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgIGlmIChjaGF0VG9VcGRhdGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci51cGRhdGVBY3RpdmVDaGF0TWV0YWRhdGEoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgbW9kZWxOYW1lOiBtb2RlbE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkNhbm5vdCBzZXQgbW9kZWw6IE5vIGFjdGl2ZSBjaGF0LlwiKTtcclxuICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgaXRlbXNBZGRlZCA9IHRydWU7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGxvYWRpbmdOb3RpY2UuaGlkZSgpO1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgbG9hZGluZyBtb2RlbHMgZm9yIG1vZGVsIHNlbGVjdGlvbiBtZW51OlwiLCBlcnJvcik7XHJcbiAgICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IGl0ZW0uc2V0VGl0bGUoXCJFcnJvciBsb2FkaW5nIG1vZGVsc1wiKS5zZXREaXNhYmxlZCh0cnVlKSk7XHJcbiAgICAgIGl0ZW1zQWRkZWQgPSB0cnVlO1xyXG4gICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIGxvYWQgbW9kZWxzLiBDaGVjayBPbGxhbWEgY29ubmVjdGlvbi5cIik7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBpZiAoaXRlbXNBZGRlZCkge1xyXG4gICAgICAgIG1lbnUuc2hvd0F0TW91c2VFdmVudChldmVudCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKFwiTW9kZWwgbWVudSB3YXMgbm90IHNob3duIGJlY2F1c2Ugbm8gaXRlbXMgd2VyZSBhZGRlZC5cIik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwcml2YXRlIHVwZGF0ZU1vZGVsRGlzcGxheShtb2RlbE5hbWU6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLm1vZGVsRGlzcGxheUVsKSB7XHJcbiAgICAgIGlmIChtb2RlbE5hbWUpIHtcclxuICAgICAgICBjb25zdCBkaXNwbGF5TmFtZSA9IG1vZGVsTmFtZTtcclxuICAgICAgICBjb25zdCBzaG9ydE5hbWUgPSBkaXNwbGF5TmFtZS5yZXBsYWNlKC86bGF0ZXN0JC8sIFwiXCIpO1xyXG4gICAgICAgIHRoaXMubW9kZWxEaXNwbGF5RWwuc2V0VGV4dChzaG9ydE5hbWUpO1xyXG4gICAgICAgIHRoaXMubW9kZWxEaXNwbGF5RWwudGl0bGUgPSBgQ3VycmVudCBtb2RlbDogJHtkaXNwbGF5TmFtZX0uIENsaWNrIHRvIGNoYW5nZS5gO1xyXG5cclxuICAgICAgICB0aGlzLm1vZGVsRGlzcGxheUVsLnJlbW92ZUNsYXNzKFwibW9kZWwtbm90LWF2YWlsYWJsZVwiKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLm1vZGVsRGlzcGxheUVsLnNldFRleHQoXCJOb3QgYXZhaWxhYmxlXCIpO1xyXG4gICAgICAgIHRoaXMubW9kZWxEaXNwbGF5RWwudGl0bGUgPVxyXG4gICAgICAgICAgXCJObyBPbGxhbWEgbW9kZWxzIGRldGVjdGVkLiBDaGVjayBPbGxhbWEgY29ubmVjdGlvbiBhbmQgZW5zdXJlIG1vZGVscyBhcmUgaW5zdGFsbGVkLlwiO1xyXG5cclxuICAgICAgICB0aGlzLm1vZGVsRGlzcGxheUVsLmFkZENsYXNzKFwibW9kZWwtbm90LWF2YWlsYWJsZVwiKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIltPbGxhbWFWaWV3XSBtb2RlbERpc3BsYXlFbCBpcyBtaXNzaW5nIVwiKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlS2V5RG93biA9IChlOiBLZXlib2FyZEV2ZW50KTogdm9pZCA9PiB7XHJcbiAgICBpZiAoZS5rZXkgPT09IFwiRW50ZXJcIiAmJiAhZS5zaGlmdEtleSAmJiAhdGhpcy5pc1Byb2Nlc3NpbmcgJiYgIXRoaXMuc2VuZEJ1dHRvbj8uZGlzYWJsZWQpIHtcclxuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICB0aGlzLnNlbmRNZXNzYWdlKCk7XHJcbiAgICB9XHJcbiAgfTtcclxuICBwcml2YXRlIGhhbmRsZVNlbmRDbGljayA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICghdGhpcy5pc1Byb2Nlc3NpbmcgJiYgIXRoaXMuc2VuZEJ1dHRvbj8uZGlzYWJsZWQpIHtcclxuICAgICAgdGhpcy5zZW5kTWVzc2FnZSgpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgIH1cclxuICB9O1xyXG4gIHByaXZhdGUgaGFuZGxlSW5wdXRGb3JSZXNpemUgPSAoKTogdm9pZCA9PiB7XHJcbiAgICBpZiAodGhpcy5yZXNpemVUaW1lb3V0KSBjbGVhclRpbWVvdXQodGhpcy5yZXNpemVUaW1lb3V0KTtcclxuICAgIHRoaXMucmVzaXplVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICB0aGlzLmFkanVzdFRleHRhcmVhSGVpZ2h0KCk7XHJcbiAgICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcbiAgICB9LCA3NSk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVWb2ljZUNsaWNrID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgdGhpcy50b2dnbGVWb2ljZVJlY29nbml0aW9uKCk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVUcmFuc2xhdGVJbnB1dENsaWNrID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgY29uc3QgY3VycmVudFRleHQgPSB0aGlzLmlucHV0RWwudmFsdWU7XHJcblxyXG4gICAgY29uc3QgdGFyZ2V0TGFuZyA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uVGFyZ2V0TGFuZ3VhZ2U7XHJcblxyXG4gICAgaWYgKCFjdXJyZW50VGV4dC50cmltKCkpIHtcclxuICAgICAgbmV3IE5vdGljZShcIklucHV0IGlzIGVtcHR5LCBub3RoaW5nIHRvIHRyYW5zbGF0ZS5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVRyYW5zbGF0aW9uIHx8IHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uUHJvdmlkZXIgPT09IFwibm9uZVwiKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJUcmFuc2xhdGlvbiBkaXNhYmxlZCBvciBwcm92aWRlciBub3Qgc2VsZWN0ZWQgaW4gc2V0dGluZ3MuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCF0YXJnZXRMYW5nKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJUYXJnZXQgbGFuZ3VhZ2UgZm9yIHRyYW5zbGF0aW9uIGlzIG5vdCBzZXQgaW4gc2V0dGluZ3MuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgc2V0SWNvbih0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLCBcImxvYWRlclwiKTtcclxuICAgIHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgdGhpcy50cmFuc2xhdGVJbnB1dEJ1dHRvbi5jbGFzc0xpc3QuYWRkKENTU19DTEFTU19UUkFOU0xBVElOR19JTlBVVCk7XHJcbiAgICB0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLnRpdGxlID0gXCJUcmFuc2xhdGluZy4uLlwiO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHRyYW5zbGF0ZWRUZXh0ID0gYXdhaXQgdGhpcy5wbHVnaW4udHJhbnNsYXRpb25TZXJ2aWNlLnRyYW5zbGF0ZShjdXJyZW50VGV4dCwgXCJFbmdsaXNoXCIpO1xyXG5cclxuICAgICAgaWYgKHRyYW5zbGF0ZWRUZXh0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgdGhpcy5pbnB1dEVsLnZhbHVlID0gdHJhbnNsYXRlZFRleHQ7XHJcbiAgICAgICAgdGhpcy5pbnB1dEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIikpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRFbC5mb2N1cygpO1xyXG5cclxuICAgICAgICBpZiAodHJhbnNsYXRlZFRleHQpIHtcclxuICAgICAgICAgIGNvbnN0IGVuZCA9IHRyYW5zbGF0ZWRUZXh0Lmxlbmd0aDtcclxuICAgICAgICAgIHRoaXMuaW5wdXRFbC5zZXRTZWxlY3Rpb25SYW5nZShlbmQsIGVuZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBuZXcgTm90aWNlKFwiSW5wdXQgdHJhbnNsYXRpb24gZW5jb3VudGVyZWQgYW4gdW5leHBlY3RlZCBlcnJvci5cIik7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBzZXRJY29uKHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24sIFwibGFuZ3VhZ2VzXCIpO1xyXG5cclxuICAgICAgdGhpcy50cmFuc2xhdGVJbnB1dEJ1dHRvbi5kaXNhYmxlZCA9IHRoaXMuaXNQcm9jZXNzaW5nO1xyXG4gICAgICB0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1RSQU5TTEFUSU5HX0lOUFVUKTtcclxuXHJcbiAgICAgIHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24udGl0bGUgPSBgVHJhbnNsYXRlIGlucHV0IHRvICR7TEFOR1VBR0VTW3RhcmdldExhbmddIHx8IHRhcmdldExhbmd9YDtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwdWJsaWMgaGFuZGxlTmV3Q2hhdENsaWNrID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyPy5jbG9zZU1lbnUoKTtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IG5ld0NoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jcmVhdGVOZXdDaGF0KCk7XHJcbiAgICAgIGlmIChuZXdDaGF0KSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShgQ3JlYXRlZCBuZXcgY2hhdDogJHtuZXdDaGF0Lm1ldGFkYXRhLm5hbWV9YCk7XHJcbiAgICAgICAgdGhpcy5mb2N1c0lucHV0KCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBjcmVhdGUgbmV3IGNoYXQuXCIpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBuZXcgTm90aWNlKFwiRXJyb3IgY3JlYXRpbmcgbmV3IGNoYXQuXCIpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHB1YmxpYyBoYW5kbGVSZW5hbWVDaGF0Q2xpY2sgPSBhc3luYyAoY2hhdElkVG9SZW5hbWU/OiBzdHJpbmcsIGN1cnJlbnRDaGF0TmFtZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgbGV0IGNoYXRJZDogc3RyaW5nIHwgbnVsbCA9IGNoYXRJZFRvUmVuYW1lID8/IG51bGw7XHJcbiAgICBsZXQgY3VycmVudE5hbWU6IHN0cmluZyB8IG51bGwgPSBjdXJyZW50Q2hhdE5hbWUgPz8gbnVsbDtcclxuXHJcbiAgICBpZiAoIWNoYXRJZCB8fCAhY3VycmVudE5hbWUpIHtcclxuICAgICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICAgIGlmICghYWN0aXZlQ2hhdCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJObyBhY3RpdmUgY2hhdCB0byByZW5hbWUuXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBjaGF0SWQgPSBhY3RpdmVDaGF0Lm1ldGFkYXRhLmlkO1xyXG4gICAgICBjdXJyZW50TmFtZSA9IGFjdGl2ZUNoYXQubWV0YWRhdGEubmFtZTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXI/LmNsb3NlTWVudSgpO1xyXG5cclxuICAgIGlmICghY2hhdElkIHx8IGN1cnJlbnROYW1lID09PSBudWxsKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJDb3VsZCBub3QgaW5pdGlhdGUgcmVuYW1lIHByb2Nlc3MuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgbmV3IFByb21wdE1vZGFsKHRoaXMuYXBwLCBcIlJlbmFtZSBDaGF0XCIsIGBFbnRlciBuZXcgbmFtZSBmb3IgXCIke2N1cnJlbnROYW1lfVwiOmAsIGN1cnJlbnROYW1lLCBhc3luYyBuZXdOYW1lID0+IHtcclxuICAgICAgbGV0IG5vdGljZU1lc3NhZ2UgPSBcIlJlbmFtZSBjYW5jZWxsZWQgb3IgbmFtZSB1bmNoYW5nZWQuXCI7XHJcbiAgICAgIGNvbnN0IHRyaW1tZWROYW1lID0gbmV3TmFtZT8udHJpbSgpO1xyXG5cclxuICAgICAgaWYgKHRyaW1tZWROYW1lICYmIHRyaW1tZWROYW1lICE9PSBcIlwiICYmIHRyaW1tZWROYW1lICE9PSBjdXJyZW50TmFtZSkge1xyXG4gICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZW5hbWVDaGF0KGNoYXRJZCEsIHRyaW1tZWROYW1lKTtcclxuXHJcbiAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgIG5vdGljZU1lc3NhZ2UgPSBgQ2hhdCByZW5hbWVkIHRvIFwiJHt0cmltbWVkTmFtZX1cImA7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIG5vdGljZU1lc3NhZ2UgPSBcIkZhaWxlZCB0byByZW5hbWUgY2hhdC5cIjtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAodHJpbW1lZE5hbWUgJiYgdHJpbW1lZE5hbWUgPT09IGN1cnJlbnROYW1lKSB7XHJcbiAgICAgICAgbm90aWNlTWVzc2FnZSA9IFwiTmFtZSB1bmNoYW5nZWQuXCI7XHJcbiAgICAgIH0gZWxzZSBpZiAobmV3TmFtZSA9PT0gbnVsbCB8fCB0cmltbWVkTmFtZSA9PT0gXCJcIikge1xyXG4gICAgICAgIG5vdGljZU1lc3NhZ2UgPSBcIlJlbmFtZSBjYW5jZWxsZWQgb3IgaW52YWxpZCBuYW1lIGVudGVyZWQuXCI7XHJcbiAgICAgIH1cclxuICAgICAgbmV3IE5vdGljZShub3RpY2VNZXNzYWdlKTtcclxuICAgICAgdGhpcy5mb2N1c0lucHV0KCk7XHJcbiAgICB9KS5vcGVuKCk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVDb250ZXh0TWVudVJlbmFtZShjaGF0SWQ6IHN0cmluZywgY3VycmVudE5hbWU6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgdGhpcy5oYW5kbGVSZW5hbWVDaGF0Q2xpY2soY2hhdElkLCBjdXJyZW50TmFtZSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgaGFuZGxlQ2xvbmVDaGF0Q2xpY2sgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXI/LmNsb3NlTWVudSgpO1xyXG4gICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICBpZiAoIWFjdGl2ZUNoYXQpIHtcclxuICAgICAgbmV3IE5vdGljZShcIk5vIGFjdGl2ZSBjaGF0IHRvIGNsb25lLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY29uc3QgY2xvbmluZ05vdGljZSA9IG5ldyBOb3RpY2UoXCJDbG9uaW5nIGNoYXQuLi5cIiwgMCk7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjbG9uZWRDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2xvbmVDaGF0KGFjdGl2ZUNoYXQubWV0YWRhdGEuaWQpO1xyXG4gICAgICBpZiAoY2xvbmVkQ2hhdCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoYENoYXQgY2xvbmVkIGFzIFwiJHtjbG9uZWRDaGF0Lm1ldGFkYXRhLm5hbWV9XCIgYW5kIGFjdGl2YXRlZC5gKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIGNsb25lIGNoYXQuXCIpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBuZXcgTm90aWNlKFwiQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgY2xvbmluZyB0aGUgY2hhdC5cIik7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBjbG9uaW5nTm90aWNlLmhpZGUoKTtcclxuICAgIH1cclxuICB9O1xyXG4gIHB1YmxpYyBoYW5kbGVDbGVhckNoYXRDbGljayA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uY2xvc2VNZW51KCk7XHJcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgIGlmIChhY3RpdmVDaGF0KSB7XHJcbiAgICAgIGNvbnN0IGNoYXROYW1lID0gYWN0aXZlQ2hhdC5tZXRhZGF0YS5uYW1lO1xyXG4gICAgICBuZXcgQ29uZmlybU1vZGFsKFxyXG4gICAgICAgIHRoaXMuYXBwLFxyXG4gICAgICAgIFwiQ2xlYXIgQ2hhdCBNZXNzYWdlc1wiLFxyXG4gICAgICAgIGBBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gY2xlYXIgYWxsIG1lc3NhZ2VzIGluIGNoYXQgXCIke2NoYXROYW1lfVwiP1xcblRoaXMgYWN0aW9uIGNhbm5vdCBiZSB1bmRvbmUuYCxcclxuICAgICAgICAoKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jbGVhckFjdGl2ZUNoYXRNZXNzYWdlcygpO1xyXG4gICAgICAgIH1cclxuICAgICAgKS5vcGVuKCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBuZXcgTm90aWNlKFwiTm8gYWN0aXZlIGNoYXQgdG8gY2xlYXIuXCIpO1xyXG4gICAgfVxyXG4gIH07XHJcbiAgcHVibGljIGhhbmRsZURlbGV0ZUNoYXRDbGljayA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uY2xvc2VNZW51KCk7XHJcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgIGlmIChhY3RpdmVDaGF0KSB7XHJcbiAgICAgIGNvbnN0IGNoYXROYW1lID0gYWN0aXZlQ2hhdC5tZXRhZGF0YS5uYW1lO1xyXG4gICAgICBuZXcgQ29uZmlybU1vZGFsKFxyXG4gICAgICAgIHRoaXMuYXBwLFxyXG4gICAgICAgIFwiRGVsZXRlIENoYXRcIixcclxuICAgICAgICBgQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSBjaGF0IFwiJHtjaGF0TmFtZX1cIj9cXG5UaGlzIGFjdGlvbiBjYW5ub3QgYmUgdW5kb25lLmAsXHJcbiAgICAgICAgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgY29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmRlbGV0ZUNoYXQoYWN0aXZlQ2hhdC5tZXRhZGF0YS5pZCk7XHJcbiAgICAgICAgICBpZiAoc3VjY2Vzcykge1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKGBDaGF0IFwiJHtjaGF0TmFtZX1cIiBkZWxldGVkLmApO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShgRmFpbGVkIHRvIGRlbGV0ZSBjaGF0IFwiJHtjaGF0TmFtZX1cIi5gKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICkub3BlbigpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgbmV3IE5vdGljZShcIk5vIGFjdGl2ZSBjaGF0IHRvIGRlbGV0ZS5cIik7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHVibGljIGhhbmRsZUV4cG9ydENoYXRDbGljayA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uY2xvc2VNZW51KCk7XHJcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgIGlmICghYWN0aXZlQ2hhdCB8fCBhY3RpdmVDaGF0Lm1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBuZXcgTm90aWNlKFwiQ2hhdCBlbXB0eSwgbm90aGluZyB0byBleHBvcnQuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBtYXJrZG93bkNvbnRlbnQgPSB0aGlzLmZvcm1hdENoYXRUb01hcmtkb3duKGFjdGl2ZUNoYXQubWVzc2FnZXMpO1xyXG4gICAgICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkucmVwbGFjZSgvWzouXS9nLCBcIi1cIik7XHJcbiAgICAgIGNvbnN0IHNhZmVOYW1lID0gYWN0aXZlQ2hhdC5tZXRhZGF0YS5uYW1lLnJlcGxhY2UoL1tcXFxcLz86KlwiPD58XS9nLCBcIi1cIik7XHJcbiAgICAgIGNvbnN0IGZpbGVuYW1lID0gYG9sbGFtYS1jaGF0LSR7c2FmZU5hbWV9LSR7dGltZXN0YW1wfS5tZGA7XHJcblxyXG4gICAgICBsZXQgdGFyZ2V0Rm9sZGVyUGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmNoYXRFeHBvcnRGb2xkZXJQYXRoPy50cmltKCk7XHJcbiAgICAgIGxldCB0YXJnZXRGb2xkZXI6IFRGb2xkZXIgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAgIGlmICh0YXJnZXRGb2xkZXJQYXRoKSB7XHJcbiAgICAgICAgdGFyZ2V0Rm9sZGVyUGF0aCA9IG5vcm1hbGl6ZVBhdGgodGFyZ2V0Rm9sZGVyUGF0aCk7XHJcbiAgICAgICAgY29uc3QgYWJzdHJhY3RGaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHRhcmdldEZvbGRlclBhdGgpO1xyXG4gICAgICAgIGlmICghYWJzdHJhY3RGaWxlKSB7XHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIodGFyZ2V0Rm9sZGVyUGF0aCk7XHJcbiAgICAgICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh0YXJnZXRGb2xkZXJQYXRoKSBhcyBURm9sZGVyO1xyXG4gICAgICAgICAgICBpZiAodGFyZ2V0Rm9sZGVyKSB7XHJcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShgQ3JlYXRlZCBleHBvcnQgZm9sZGVyOiAke3RhcmdldEZvbGRlclBhdGh9YCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgY3JlYXRpbmcgZXhwb3J0IGZvbGRlci4gU2F2aW5nIHRvIHZhdWx0IHJvb3QuYCk7XHJcbiAgICAgICAgICAgICAgdGFyZ2V0Rm9sZGVyID0gdGhpcy5hcHAudmF1bHQuZ2V0Um9vdCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgY3JlYXRpbmcgZXhwb3J0IGZvbGRlci4gU2F2aW5nIHRvIHZhdWx0IHJvb3QuYCk7XHJcbiAgICAgICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldFJvb3QoKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKGFic3RyYWN0RmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIpIHtcclxuICAgICAgICAgIHRhcmdldEZvbGRlciA9IGFic3RyYWN0RmlsZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgbmV3IE5vdGljZShgRXJyb3I6IEV4cG9ydCBwYXRoIGlzIG5vdCBhIGZvbGRlci4gU2F2aW5nIHRvIHZhdWx0IHJvb3QuYCk7XHJcbiAgICAgICAgICB0YXJnZXRGb2xkZXIgPSB0aGlzLmFwcC52YXVsdC5nZXRSb290KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldFJvb3QoKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCF0YXJnZXRGb2xkZXIpIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3IgZGV0ZXJtaW5pbmcgZXhwb3J0IGZvbGRlci4gQ2Fubm90IHNhdmUgZmlsZS5cIik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBmaWxlUGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7dGFyZ2V0Rm9sZGVyLnBhdGh9LyR7ZmlsZW5hbWV9YCk7XHJcblxyXG4gICAgICBjb25zdCBleGlzdGluZ0ZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xyXG4gICAgICBpZiAoZXhpc3RpbmdGaWxlKSB7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGZpbGUgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUoZmlsZVBhdGgsIG1hcmtkb3duQ29udGVudCk7XHJcbiAgICAgIG5ldyBOb3RpY2UoYENoYXQgZXhwb3J0ZWQgdG8gJHtmaWxlLnBhdGh9YCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKFwiRmlsZSBhbHJlYWR5IGV4aXN0c1wiKSkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBleHBvcnRpbmcgY2hhdDogRmlsZSBhbHJlYWR5IGV4aXN0cy5cIik7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIkFuIHVuZXhwZWN0ZWQgZXJyb3Igb2NjdXJyZWQgZHVyaW5nIGNoYXQgZXhwb3J0LlwiKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHB1YmxpYyBoYW5kbGVTZXR0aW5nc0NsaWNrID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyPy5jbG9zZU1lbnUoKTtcclxuICAgICh0aGlzLmFwcCBhcyBhbnkpLnNldHRpbmc/Lm9wZW4/LigpO1xyXG4gICAgKHRoaXMuYXBwIGFzIGFueSkuc2V0dGluZz8ub3BlblRhYkJ5SWQ/Lih0aGlzLnBsdWdpbi5tYW5pZmVzdC5pZCk7XHJcbiAgfTtcclxuICBwcml2YXRlIGhhbmRsZURvY3VtZW50Q2xpY2tGb3JNZW51ID0gKGU6IE1vdXNlRXZlbnQpOiB2b2lkID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uaGFuZGxlRG9jdW1lbnRDbGljayhlLCB0aGlzLm1lbnVCdXR0b24pO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlTW9kZWxDaGFuZ2UgPSBhc3luYyAobW9kZWxOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIHRoaXMudXBkYXRlTW9kZWxEaXNwbGF5KG1vZGVsTmFtZSk7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgICAgY29uc3QgdGVtcCA9IGNoYXQ/Lm1ldGFkYXRhPy50ZW1wZXJhdHVyZSA/PyB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZTtcclxuICAgICAgdGhpcy51cGRhdGVUZW1wZXJhdHVyZUluZGljYXRvcih0ZW1wKTtcclxuXHJcbiAgICAgIGlmIChjaGF0ICYmIHRoaXMuY3VycmVudE1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdChcInN5c3RlbVwiLCBgTW9kZWwgY2hhbmdlZCB0bzogJHttb2RlbE5hbWV9YCwgbmV3IERhdGUoKSk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7fVxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlUm9sZUNoYW5nZSA9IGFzeW5jIChyb2xlTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICBjb25zdCBkaXNwbGF5Um9sZSA9IHJvbGVOYW1lIHx8IFwiTm9uZVwiO1xyXG4gICAgdGhpcy51cGRhdGVJbnB1dFBsYWNlaG9sZGVyKGRpc3BsYXlSb2xlKTtcclxuICAgIHRoaXMudXBkYXRlUm9sZURpc3BsYXkoZGlzcGxheVJvbGUpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdCgpO1xyXG5cclxuICAgICAgaWYgKGNoYXQgJiYgdGhpcy5jdXJyZW50TWVzc2FnZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0KFwic3lzdGVtXCIsIGBSb2xlIGNoYW5nZWQgdG86ICR7ZGlzcGxheVJvbGV9YCwgbmV3IERhdGUoKSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShgUm9sZSBzZXQgdG86ICR7ZGlzcGxheVJvbGV9YCk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoYFJvbGUgc2V0IHRvOiAke2Rpc3BsYXlSb2xlfWApO1xyXG4gICAgfVxyXG4gIH07XHJcbiAgcHJpdmF0ZSBoYW5kbGVSb2xlc1VwZGF0ZWQgPSAoKTogdm9pZCA9PiB7XHJcbiAgICB0aGlzLnBsdWdpbi5wcm9tcHRTZXJ2aWNlPy5jbGVhclJvbGVDYWNoZSgpO1xyXG5cclxuICAgIGlmICh0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXIpIHtcclxuICAgICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyXHJcbiAgICAgICAgLnVwZGF0ZVJvbGVMaXN0SWZWaXNpYmxlKClcclxuICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyByb2xlIGRyb3Bkb3duIGxpc3Q6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5zaWRlYmFyTWFuYWdlcj8uaXNTZWN0aW9uVmlzaWJsZShcInJvbGVzXCIpKSB7XHJcbiAgICAgIHRoaXMuc2lkZWJhck1hbmFnZXIudXBkYXRlUm9sZUxpc3QoKS5jYXRjaChlID0+IHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkVycm9yIHVwZGF0aW5nIHJvbGUgcGFuZWwgbGlzdDpcIiwgZSkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwcml2YXRlIGFzeW5jIGFkZE1lc3NhZ2VTdGFuZGFyZChtZXNzYWdlOiBNZXNzYWdlKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBpc05ld0RheSA9ICF0aGlzLmxhc3RSZW5kZXJlZE1lc3NhZ2VEYXRlIHx8ICF0aGlzLmlzU2FtZURheSh0aGlzLmxhc3RSZW5kZXJlZE1lc3NhZ2VEYXRlLCBtZXNzYWdlLnRpbWVzdGFtcCk7XHJcbiAgICBpZiAoaXNOZXdEYXkpIHtcclxuICAgICAgdGhpcy5yZW5kZXJEYXRlU2VwYXJhdG9yKG1lc3NhZ2UudGltZXN0YW1wKTtcclxuICAgICAgdGhpcy5sYXN0UmVuZGVyZWRNZXNzYWdlRGF0ZSA9IG1lc3NhZ2UudGltZXN0YW1wO1xyXG4gICAgfSBlbHNlIGlmICghdGhpcy5sYXN0UmVuZGVyZWRNZXNzYWdlRGF0ZSAmJiB0aGlzLmNoYXRDb250YWluZXI/LmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB0aGlzLmxhc3RSZW5kZXJlZE1lc3NhZ2VEYXRlID0gbWVzc2FnZS50aW1lc3RhbXA7XHJcbiAgICB9XHJcbiAgICB0aGlzLmhpZGVFbXB0eVN0YXRlKCk7XHJcblxyXG4gICAgbGV0IG1lc3NhZ2VHcm91cEVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xyXG4gICAgdHJ5IHtcclxuICAgICAgbGV0IHJlbmRlcmVyOlxyXG4gICAgICAgIHwgVXNlck1lc3NhZ2VSZW5kZXJlclxyXG4gICAgICAgIHwgU3lzdGVtTWVzc2FnZVJlbmRlcmVyXHJcbiAgICAgICAgfCBBc3Npc3RhbnRNZXNzYWdlUmVuZGVyZXJcclxuICAgICAgICB8IFRvb2xNZXNzYWdlUmVuZGVyZXJcclxuICAgICAgICB8IEVycm9yTWVzc2FnZVJlbmRlcmVyXHJcbiAgICAgICAgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAgIHN3aXRjaCAobWVzc2FnZS5yb2xlKSB7XHJcbiAgICAgICAgY2FzZSBcInVzZXJcIjpcclxuICAgICAgICAgIHJlbmRlcmVyID0gbmV3IFVzZXJNZXNzYWdlUmVuZGVyZXIodGhpcy5hcHAsIHRoaXMucGx1Z2luLCBtZXNzYWdlLCB0aGlzKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhc3Npc3RhbnRcIjpcclxuICAgICAgICAgIHJlbmRlcmVyID0gbmV3IEFzc2lzdGFudE1lc3NhZ2VSZW5kZXJlcih0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIG1lc3NhZ2UgYXMgQXNzaXN0YW50TWVzc2FnZSwgdGhpcyk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwic3lzdGVtXCI6XHJcbiAgICAgICAgICByZW5kZXJlciA9IG5ldyBTeXN0ZW1NZXNzYWdlUmVuZGVyZXIodGhpcy5hcHAsIHRoaXMucGx1Z2luLCBtZXNzYWdlLCB0aGlzKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJlcnJvclwiOlxyXG4gICAgICAgICAgdGhpcy5oYW5kbGVFcnJvck1lc3NhZ2UobWVzc2FnZSk7XHJcbiAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGNhc2UgXCJ0b29sXCI6XHJcbiAgICAgICAgICByZW5kZXJlciA9IG5ldyBUb29sTWVzc2FnZVJlbmRlcmVyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgbWVzc2FnZSwgdGhpcyk7XHJcbiAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIGNvbnN0IHVua25vd25Sb2xlR3JvdXAgPSB0aGlzLmNoYXRDb250YWluZXI/LmNyZWF0ZURpdih7IGNsczogQ1NTX0NMQVNTRVMuTUVTU0FHRV9HUk9VUCB9KTtcclxuICAgICAgICAgIGlmICh1bmtub3duUm9sZUdyb3VwICYmIHRoaXMuY2hhdENvbnRhaW5lcikge1xyXG4gICAgICAgICAgICBSZW5kZXJlclV0aWxzLnJlbmRlckF2YXRhcih0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIHVua25vd25Sb2xlR3JvdXAsIGZhbHNlKTtcclxuICAgICAgICAgICAgY29uc3Qgd3JhcHBlciA9IHVua25vd25Sb2xlR3JvdXAuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NFUy5NRVNTQUdFX1dSQVBQRVIgfHwgXCJtZXNzYWdlLXdyYXBwZXJcIiB9KTtcclxuICAgICAgICAgICAgY29uc3QgbXNnQnViYmxlID0gd3JhcHBlci5jcmVhdGVEaXYoeyBjbHM6IGAke0NTU19DTEFTU0VTLk1FU1NBR0V9ICR7Q1NTX0NMQVNTRVMuU1lTVEVNX01FU1NBR0V9YCB9KTtcclxuICAgICAgICAgICAgbXNnQnViYmxlLmNyZWF0ZURpdih7XHJcbiAgICAgICAgICAgICAgY2xzOiBDU1NfQ0xBU1NFUy5TWVNURU1fTUVTU0FHRV9URVhUIHx8IFwic3lzdGVtLW1lc3NhZ2UtdGV4dFwiLFxyXG4gICAgICAgICAgICAgIHRleHQ6IGBJbnRlcm5hbCBQbHVnaW4gRXJyb3I6IFVua25vd24gbWVzc2FnZSByb2xlIHJlY2VpdmVkIGJ5IHJlbmRlcmVyOiAnJHttZXNzYWdlLnJvbGV9Jy4gTWVzc2FnZSBjb250ZW50IHdhcyBsb2dnZWQuYCxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIEJhc2VNZXNzYWdlUmVuZGVyZXIuYWRkVGltZXN0YW1wKG1zZ0J1YmJsZSwgbWVzc2FnZS50aW1lc3RhbXAsIHRoaXMpO1xyXG4gICAgICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuYXBwZW5kQ2hpbGQodW5rbm93blJvbGVHcm91cCk7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdE1lc3NhZ2VFbGVtZW50ID0gdW5rbm93blJvbGVHcm91cDtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHJlbmRlcmVyKSB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gcmVuZGVyZXIucmVuZGVyKCk7XHJcbiAgICAgICAgbWVzc2FnZUdyb3VwRWwgPSByZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlID8gYXdhaXQgcmVzdWx0IDogcmVzdWx0O1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKG1lc3NhZ2VHcm91cEVsICYmIHRoaXMuY2hhdENvbnRhaW5lcikge1xyXG4gICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5hcHBlbmRDaGlsZChtZXNzYWdlR3JvdXBFbCk7XHJcbiAgICAgICAgdGhpcy5sYXN0TWVzc2FnZUVsZW1lbnQgPSBtZXNzYWdlR3JvdXBFbDtcclxuICAgICAgICBpZiAoIW1lc3NhZ2VHcm91cEVsLmlzQ29ubmVjdGVkKSB7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBtZXNzYWdlR3JvdXBFbC5jbGFzc0xpc3QuYWRkKENTU19DTEFTU0VTLk1FU1NBR0VfQVJSSVZJTkcgfHwgXCJtZXNzYWdlLWFycml2aW5nXCIpO1xyXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gbWVzc2FnZUdyb3VwRWw/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTRVMuTUVTU0FHRV9BUlJJVklORyB8fCBcIm1lc3NhZ2UtYXJyaXZpbmdcIiksIDUwMCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGlzVXNlck1lc3NhZ2UgPSBtZXNzYWdlLnJvbGUgPT09IFwidXNlclwiO1xyXG4gICAgICAgIGlmICghaXNVc2VyTWVzc2FnZSAmJiB0aGlzLnVzZXJTY3JvbGxlZFVwICYmIHRoaXMubmV3TWVzc2FnZXNJbmRpY2F0b3JFbCkge1xyXG4gICAgICAgICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsLmNsYXNzTGlzdC5hZGQoQ1NTX0NMQVNTRVMuVklTSUJMRSB8fCBcInZpc2libGVcIik7XHJcbiAgICAgICAgfSBlbHNlIGlmICghdGhpcy51c2VyU2Nyb2xsZWRVcCkge1xyXG4gICAgICAgICAgY29uc3Qgc2Nyb2xsRGVsYXkgPSB0aGlzLmlzUHJvY2Vzc2luZyAmJiBtZXNzYWdlLnJvbGUgPT09IFwiYXNzaXN0YW50XCIgPyAzMCA6IGlzVXNlck1lc3NhZ2UgPyA1MCA6IDEwMDtcclxuXHJcbiAgICAgICAgICBjb25zdCBmb3JjZVNjcm9sbCA9XHJcbiAgICAgICAgICAgICh0aGlzLmlzUHJvY2Vzc2luZyAmJiBtZXNzYWdlLnJvbGUgPT09IFwiYXNzaXN0YW50XCIpIHx8IG1lc3NhZ2Uucm9sZSA9PT0gXCJ0b29sXCIgPyB0cnVlIDogIWlzVXNlck1lc3NhZ2U7XHJcbiAgICAgICAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbShzY3JvbGxEZWxheSwgZm9yY2VTY3JvbGwpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMudXBkYXRlU2Nyb2xsU3RhdGVBbmRJbmRpY2F0b3JzKCksIDE1MCk7XHJcbiAgICAgIH0gZWxzZSBpZiAocmVuZGVyZXIpIHtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IGVycm9yTm90aWNlID0gYEZhaWxlZCB0byByZW5kZXIgbWVzc2FnZSAoUm9sZTogJHttZXNzYWdlPy5yb2xlfSkuIENoZWNrIGNvbnNvbGUgZm9yIGRldGFpbHMuYDtcclxuXHJcbiAgICAgICAgY29uc3QgZXJyb3JNc2dPYmplY3Q6IE1lc3NhZ2UgPSB7XHJcbiAgICAgICAgICByb2xlOiBcImVycm9yXCIsXHJcbiAgICAgICAgICBjb250ZW50OiBlcnJvck5vdGljZSxcclxuICAgICAgICAgIHRpbWVzdGFtcDogbWVzc2FnZS50aW1lc3RhbXAgfHwgbmV3IERhdGUoKSxcclxuICAgICAgICB9O1xyXG4gICAgICAgIHRoaXMuaGFuZGxlRXJyb3JNZXNzYWdlKGVycm9yTXNnT2JqZWN0KTtcclxuICAgICAgfSBjYXRjaCAoY3JpdGljYWxFcnJvcikge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJDcml0aWNhbCBlcnJvciBkaXNwbGF5aW5nIG1lc3NhZ2UuIENoZWNrIGNvbnNvbGUuXCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZU1lc3NhZ2VzQ2xlYXJlZCA9IChjaGF0SWQ6IHN0cmluZyk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKGNoYXRJZCA9PT0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXRJZCgpKSB7XHJcbiAgICAgIHRoaXMuY2xlYXJDaGF0Q29udGFpbmVySW50ZXJuYWwoKTtcclxuICAgICAgdGhpcy5jdXJyZW50TWVzc2FnZXMgPSBbXTtcclxuICAgICAgdGhpcy5zaG93RW1wdHlTdGF0ZSgpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlVmlzaWJpbGl0eUNoYW5nZSA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmIChkb2N1bWVudC52aXNpYmlsaXR5U3RhdGUgPT09IFwidmlzaWJsZVwiICYmIHRoaXMubGVhZi52aWV3ID09PSB0aGlzKSB7XHJcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oNTAsIHRydWUpO1xyXG4gICAgICAgIHRoaXMuYWRqdXN0VGV4dGFyZWFIZWlnaHQoKTtcclxuICAgICAgICB0aGlzLmlucHV0RWw/LmZvY3VzKCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH07XHJcbiAgcHJpdmF0ZSBoYW5kbGVBY3RpdmVMZWFmQ2hhbmdlID0gKGxlYWY6IFdvcmtzcGFjZUxlYWYgfCBudWxsKTogdm9pZCA9PiB7XHJcbiAgICBpZiAobGVhZj8udmlldyA9PT0gdGhpcykge1xyXG4gICAgICB0aGlzLmlucHV0RWw/LmZvY3VzKCk7XHJcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oMTUwLCB0cnVlKSwgMTAwKTtcclxuICAgIH1cclxuICB9O1xyXG4gIHByaXZhdGUgaGFuZGxlV2luZG93UmVzaXplID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMucmVzaXplVGltZW91dCkgY2xlYXJUaW1lb3V0KHRoaXMucmVzaXplVGltZW91dCk7XHJcbiAgICB0aGlzLnJlc2l6ZVRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuYWRqdXN0VGV4dGFyZWFIZWlnaHQoKSwgMTAwKTtcclxuICB9O1xyXG5cclxuICBwcml2YXRlIGhhbmRsZVNjcm9sbCA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICghdGhpcy5jaGF0Q29udGFpbmVyIHx8ICF0aGlzLm5ld01lc3NhZ2VzSW5kaWNhdG9yRWwgfHwgIXRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24pIHJldHVybjtcclxuXHJcbiAgICBjb25zdCB0aHJlc2hvbGQgPSAxNTA7XHJcbiAgICBjb25zdCBhdEJvdHRvbSA9XHJcbiAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxIZWlnaHQgLSB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG9wIC0gdGhpcy5jaGF0Q29udGFpbmVyLmNsaWVudEhlaWdodCA8IHRocmVzaG9sZDtcclxuXHJcbiAgICBjb25zdCBwcmV2aW91c1Njcm9sbGVkVXAgPSB0aGlzLnVzZXJTY3JvbGxlZFVwO1xyXG4gICAgdGhpcy51c2VyU2Nyb2xsZWRVcCA9ICFhdEJvdHRvbTtcclxuXHJcbiAgICBpZiAocHJldmlvdXNTY3JvbGxlZFVwICYmIGF0Qm90dG9tKSB7XHJcbiAgICAgIHRoaXMubmV3TWVzc2FnZXNJbmRpY2F0b3JFbC5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLnNjcm9sbFRvQm90dG9tQnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoQ1NTX0NMQVNTX1ZJU0lCTEUsIHRoaXMudXNlclNjcm9sbGVkVXApO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlTmV3TWVzc2FnZUluZGljYXRvckNsaWNrID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuY2hhdENvbnRhaW5lcikge1xyXG4gICAgICB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG8oeyB0b3A6IHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxIZWlnaHQsIGJlaGF2aW9yOiBcInNtb290aFwiIH0pO1xyXG4gICAgfVxyXG4gICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsPy5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgIHRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1ZJU0lCTEUpO1xyXG4gICAgdGhpcy51c2VyU2Nyb2xsZWRVcCA9IGZhbHNlO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlU2Nyb2xsVG9Cb3R0b21DbGljayA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICh0aGlzLmNoYXRDb250YWluZXIpIHtcclxuICAgICAgdGhpcy5jaGF0Q29udGFpbmVyLnNjcm9sbFRvKHsgdG9wOiB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsSGVpZ2h0LCBiZWhhdmlvcjogXCJzbW9vdGhcIiB9KTtcclxuICAgIH1cclxuICAgIHRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1ZJU0lCTEUpO1xyXG4gICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsPy5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgIHRoaXMudXNlclNjcm9sbGVkVXAgPSBmYWxzZTtcclxuICB9O1xyXG5cclxuICBwcml2YXRlIHVwZGF0ZUlucHV0UGxhY2Vob2xkZXIocm9sZU5hbWU6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLmlucHV0RWwpIHtcclxuICAgICAgdGhpcy5pbnB1dEVsLnBsYWNlaG9sZGVyID0gYEVudGVyIG1lc3NhZ2UgdGV4dCBoZXJlLi4uYDtcclxuICAgIH1cclxuICB9XHJcbiAgcHJpdmF0ZSBhdXRvUmVzaXplVGV4dGFyZWEoKTogdm9pZCB7XHJcbiAgICB0aGlzLmFkanVzdFRleHRhcmVhSGVpZ2h0KCk7XHJcbiAgfVxyXG4gIHByaXZhdGUgYWRqdXN0VGV4dGFyZWFIZWlnaHQgPSAoKTogdm9pZCA9PiB7XHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICBpZiAoIXRoaXMuaW5wdXRFbCkgcmV0dXJuO1xyXG4gICAgICBjb25zdCB0ZXh0YXJlYSA9IHRoaXMuaW5wdXRFbDtcclxuICAgICAgY29uc3QgY29tcHV0ZWRTdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKHRleHRhcmVhKTtcclxuXHJcbiAgICAgIGNvbnN0IGJhc2VNaW5IZWlnaHQgPSBwYXJzZUZsb2F0KGNvbXB1dGVkU3R5bGUubWluSGVpZ2h0KSB8fCA0MDtcclxuICAgICAgY29uc3QgbWF4SGVpZ2h0ID0gcGFyc2VGbG9hdChjb21wdXRlZFN0eWxlLm1heEhlaWdodCk7XHJcblxyXG4gICAgICBjb25zdCBjdXJyZW50U2Nyb2xsVG9wID0gdGV4dGFyZWEuc2Nyb2xsVG9wO1xyXG4gICAgICB0ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSBcImF1dG9cIjtcclxuXHJcbiAgICAgIGNvbnN0IHNjcm9sbEhlaWdodCA9IHRleHRhcmVhLnNjcm9sbEhlaWdodDtcclxuXHJcbiAgICAgIGxldCB0YXJnZXRIZWlnaHQgPSBNYXRoLm1heChiYXNlTWluSGVpZ2h0LCBzY3JvbGxIZWlnaHQpO1xyXG4gICAgICBsZXQgYXBwbHlPdmVyZmxvdyA9IGZhbHNlO1xyXG5cclxuICAgICAgaWYgKCFpc05hTihtYXhIZWlnaHQpICYmIHRhcmdldEhlaWdodCA+IG1heEhlaWdodCkge1xyXG4gICAgICAgIHRhcmdldEhlaWdodCA9IG1heEhlaWdodDtcclxuICAgICAgICBhcHBseU92ZXJmbG93ID0gdHJ1ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gYCR7dGFyZ2V0SGVpZ2h0fXB4YDtcclxuICAgICAgdGV4dGFyZWEuc3R5bGUub3ZlcmZsb3dZID0gYXBwbHlPdmVyZmxvdyA/IFwiYXV0b1wiIDogXCJoaWRkZW5cIjtcclxuICAgICAgdGV4dGFyZWEuc2Nyb2xsVG9wID0gY3VycmVudFNjcm9sbFRvcDtcclxuICAgIH0pO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgdXBkYXRlUm9sZURpc3BsYXkocm9sZU5hbWU6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLnJvbGVEaXNwbGF5RWwpIHtcclxuICAgICAgY29uc3QgZGlzcGxheU5hbWUgPSByb2xlTmFtZSB8fCBcIk5vbmVcIjtcclxuICAgICAgdGhpcy5yb2xlRGlzcGxheUVsLnNldFRleHQoZGlzcGxheU5hbWUpO1xyXG4gICAgICB0aGlzLnJvbGVEaXNwbGF5RWwudGl0bGUgPSBgQ3VycmVudCByb2xlOiAke2Rpc3BsYXlOYW1lfS4gQ2xpY2sgdG8gY2hhbmdlLmA7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHVwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy5pbnB1dEVsIHx8ICF0aGlzLnNlbmRCdXR0b24gfHwgIXRoaXMuc3RvcEdlbmVyYXRpbmdCdXR0b24pIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGdlbmVyYXRpb25JblByb2dyZXNzID0gdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyICE9PSBudWxsO1xyXG4gICAgY29uc3QgaXNJbnB1dEVtcHR5ID0gdGhpcy5pbnB1dEVsLnZhbHVlLnRyaW0oKSA9PT0gXCJcIjtcclxuXHJcbiAgICBpZiAoZ2VuZXJhdGlvbkluUHJvZ3Jlc3MpIHtcclxuICAgICAgdGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbi5zaG93KCk7XHJcbiAgICAgIHRoaXMuc2VuZEJ1dHRvbi5oaWRlKCk7XHJcbiAgICAgIHRoaXMuc2VuZEJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnN0b3BHZW5lcmF0aW5nQnV0dG9uLmhpZGUoKTtcclxuICAgICAgdGhpcy5zZW5kQnV0dG9uLnNob3coKTtcclxuXHJcbiAgICAgIGNvbnN0IHNlbmRTaG91bGRCZURpc2FibGVkID0gaXNJbnB1dEVtcHR5IHx8IHRoaXMuaXNQcm9jZXNzaW5nO1xyXG4gICAgICB0aGlzLnNlbmRCdXR0b24uZGlzYWJsZWQgPSBzZW5kU2hvdWxkQmVEaXNhYmxlZDtcclxuICAgICAgdGhpcy5zZW5kQnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoQ1NTX0NMQVNTRVMuRElTQUJMRUQsIHNlbmRTaG91bGRCZURpc2FibGVkKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4vLyBPbGxhbWFWaWV3LnRzXHJcblxyXG4vLyAuLi4gKNGW0L3RiNGWINGH0LDRgdGC0LjQvdC4INC60LvQsNGB0YMpIC4uLlxyXG5cclxuICBwdWJsaWMgc2hvd0VtcHR5U3RhdGUoXHJcbiAgICBtZXNzYWdlVGV4dDogc3RyaW5nID0gXCJObyBtZXNzYWdlcyB5ZXRcIiwgLy8g0KLQtdC60YHRgiDQt9CwINC30LDQvNC+0LLRh9GD0LLQsNC90L3Rj9C8XHJcbiAgICB0aXBUZXh0Pzogc3RyaW5nIC8vINCe0L/RhtGW0L7QvdCw0LvRjNC90LjQuSDRgtC10LrRgdGCINC/0ZbQtNC60LDQt9C60LhcclxuICApOiB2b2lkIHtcclxuICAgIC8vINCe0YfQuNGJ0LDRlNC80L4g0L/QvtC/0LXRgNC10LTQvdGW0LkgZW1wdHlTdGF0ZUVsLCDRj9C60YnQviDQstGW0L0g0ZQsINGJ0L7QsSDRg9C90LjQutC90YPRgtC4INC00YPQsdC70ZbQutCw0YLRltCyXHJcbiAgICBpZiAodGhpcy5lbXB0eVN0YXRlRWwpIHtcclxuICAgICAgdGhpcy5lbXB0eVN0YXRlRWwucmVtb3ZlKCk7XHJcbiAgICAgIHRoaXMuZW1wdHlTdGF0ZUVsID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyDQn9C10YDQtdCy0ZbRgNGP0ZTQvNC+INGD0LzQvtCy0LggKNC80L7QttC70LjQstC+LCB0aGlzLmN1cnJlbnRNZXNzYWdlcy5sZW5ndGggPT09IDAg0YLRg9GCINC90LUg0L/QvtGC0YDRltCx0L3QtSwgXHJcbiAgICAvLyDQsdC+INC80Lgg0LLQuNC60LvQuNC60LDRlNC80L4g0LnQvtCz0L4sINC60L7Qu9C4INC30L3QsNGU0LzQviwg0YnQviDRgdGC0LDQvSDQv9C+0YDQvtC20L3RltC5KVxyXG4gICAgaWYgKHRoaXMuY2hhdENvbnRhaW5lcikgeyAvLyDQn9C10YDQtdC60L7QvdGD0ZTQvNC+0YHRjywg0YnQviDQutC+0L3RgtC10LnQvdC10YAg0ZbRgdC90YPRlFxyXG4gICAgICAvLyB0aGlzLmNoYXRDb250YWluZXIuZW1wdHkoKTsgLy8g0J7Rh9C40YnQsNGU0LzQviDQutC+0L3RgtC10LnQvdC10YAg0L/QtdGA0LXQtCDQv9C+0LrQsNC30L7QvCBlbXB0eSBzdGF0ZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g0K/QutGJ0L4g0YbQtSDQvdC1INCx0LDQttCw0L3QviAo0L3QsNC/0YDQuNC60LvQsNC0LCDRj9C60YnQviDRgtCw0Lwg0ZQg0ZbQvdGI0ZYg0LXQu9C10LzQtdC90YLQuCksINC/0YDQuNCx0LXRgNC4INGG0LXQuSDRgNGP0LTQvtC6LlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g0JDQu9C1INGP0LrRidC+IGNoYXRDb250YWluZXIg0L/RgNC40LfQvdCw0YfQtdC90LjQuSDRgtGW0LvRjNC60Lgg0LTQu9GPINC/0L7QstGW0LTQvtC80LvQtdC90Ywg0YLQsCBlbXB0eVN0YXRlLCDRgtC+INGG0LUg0L7Qui5cclxuXHJcbiAgICAgIHRoaXMuZW1wdHlTdGF0ZUVsID0gdGhpcy5jaGF0Q29udGFpbmVyLmNyZWF0ZURpdih7XHJcbiAgICAgICAgY2xzOiBDU1NfQ0xBU1NfRU1QVFlfU1RBVEUsIC8vINCf0LXRgNC10LrQvtC90LDQudGB0Y8sINGJ0L4gQ1NTX0NMQVNTX0VNUFRZX1NUQVRFINCy0LjQt9C90LDRh9C10L3QvlxyXG4gICAgICB9KTtcclxuICAgICAgdGhpcy5lbXB0eVN0YXRlRWwuY3JlYXRlRWwoXCJwXCIsIHsgLy8g0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviA8cD4g0LTQu9GPINGB0LXQvNCw0L3RgtC40LrQuFxyXG4gICAgICAgIGNsczogXCJlbXB0eS1zdGF0ZS1tZXNzYWdlXCIsXHJcbiAgICAgICAgdGV4dDogbWVzc2FnZVRleHQsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgZmluYWxUaXBUZXh0ID0gdGlwVGV4dCAhPT0gdW5kZWZpbmVkIFxyXG4gICAgICAgID8gdGlwVGV4dCBcclxuICAgICAgICA6IGBUeXBlIGEgbWVzc2FnZSBvciB1c2UgdGhlIG1lbnUgb3B0aW9ucyB0byBzdGFydCBpbnRlcmFjdGluZyB3aXRoICR7dGhpcy5wbHVnaW4/LnNldHRpbmdzPy5tb2RlbE5hbWUgfHwgXCJ0aGUgQUlcIn0uYDtcclxuXHJcbiAgICAgIGlmIChmaW5hbFRpcFRleHQpIHsgLy8g0JTQvtC00LDRlNC80L4g0L/RltC00LrQsNC30LrRgywg0YLRltC70YzQutC4INGP0LrRidC+INCy0L7QvdCwINGUXHJcbiAgICAgICAgdGhpcy5lbXB0eVN0YXRlRWwuY3JlYXRlRWwoXCJwXCIsIHtcclxuICAgICAgICAgIGNsczogXCJlbXB0eS1zdGF0ZS10aXBcIixcclxuICAgICAgICAgIHRleHQ6IGZpbmFsVGlwVGV4dCxcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHVibGljIGhpZGVFbXB0eVN0YXRlKCk6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMuZW1wdHlTdGF0ZUVsKSB7XHJcbiAgICAgIHRoaXMuZW1wdHlTdGF0ZUVsLnJlbW92ZSgpO1xyXG4gICAgICB0aGlzLmVtcHR5U3RhdGVFbCA9IG51bGw7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuLy8gLi4uICjRgNC10YjRgtCwINC60LvQsNGB0YMpIC4uLlxyXG5cclxuICBwdWJsaWMgc2V0TG9hZGluZ1N0YXRlKGlzTG9hZGluZzogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgdGhpcy5pc1Byb2Nlc3NpbmcgPSBpc0xvYWRpbmc7XHJcblxyXG4gICAgaWYgKHRoaXMuaW5wdXRFbCkgdGhpcy5pbnB1dEVsLmRpc2FibGVkID0gaXNMb2FkaW5nO1xyXG5cclxuICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcblxyXG4gICAgaWYgKHRoaXMudm9pY2VCdXR0b24pIHtcclxuICAgICAgdGhpcy52b2ljZUJ1dHRvbi5kaXNhYmxlZCA9IGlzTG9hZGluZztcclxuICAgICAgdGhpcy52b2ljZUJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKENTU19DTEFTU0VTLkRJU0FCTEVELCBpc0xvYWRpbmcpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24pIHtcclxuICAgICAgdGhpcy50cmFuc2xhdGVJbnB1dEJ1dHRvbi5kaXNhYmxlZCA9IGlzTG9hZGluZztcclxuICAgICAgdGhpcy50cmFuc2xhdGVJbnB1dEJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKENTU19DTEFTU0VTLkRJU0FCTEVELCBpc0xvYWRpbmcpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMubWVudUJ1dHRvbikge1xyXG4gICAgICB0aGlzLm1lbnVCdXR0b24uZGlzYWJsZWQgPSBpc0xvYWRpbmc7XHJcbiAgICAgIHRoaXMubWVudUJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKENTU19DTEFTU0VTLkRJU0FCTEVELCBpc0xvYWRpbmcpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLmNoYXRDb250YWluZXIpIHtcclxuICAgICAgaWYgKGlzTG9hZGluZykge1xyXG4gICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxCdXR0b25FbGVtZW50PihgLiR7Q1NTX0NMQVNTRVMuU0hPV19NT1JFX0JVVFRPTn1gKS5mb3JFYWNoKGJ1dHRvbiA9PiB7XHJcbiAgICAgICAgICBidXR0b24uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMuY2hlY2tBbGxNZXNzYWdlc0ZvckNvbGxhcHNpbmcoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVDaGF0TGlzdFVwZGF0ZWQgPSAoKTogdm9pZCA9PiB7XHJcbiAgICB0aGlzLnNjaGVkdWxlU2lkZWJhckNoYXRMaXN0VXBkYXRlKCk7XHJcblxyXG4gICAgaWYgKHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcikge1xyXG4gICAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXJcclxuICAgICAgICAudXBkYXRlQ2hhdExpc3RJZlZpc2libGUoKVxyXG4gICAgICAgIC5jYXRjaChlID0+IHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkVycm9yIHVwZGF0aW5nIGNoYXQgZHJvcGRvd24gbGlzdDpcIiwgZSkpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHB1YmxpYyBoYW5kbGVTZXR0aW5nc1VwZGF0ZWQgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgIGNvbnN0IGN1cnJlbnRNb2RlbE5hbWUgPSBhY3RpdmVDaGF0Py5tZXRhZGF0YT8ubW9kZWxOYW1lIHx8IHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZTtcclxuICAgIGNvbnN0IGN1cnJlbnRSb2xlUGF0aCA9IGFjdGl2ZUNoYXQ/Lm1ldGFkYXRhPy5zZWxlY3RlZFJvbGVQYXRoID8/IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XHJcbiAgICBjb25zdCBjdXJyZW50Um9sZU5hbWUgPSBhd2FpdCB0aGlzLmZpbmRSb2xlTmFtZUJ5UGF0aChjdXJyZW50Um9sZVBhdGgpO1xyXG4gICAgY29uc3QgY3VycmVudFRlbXBlcmF0dXJlID0gYWN0aXZlQ2hhdD8ubWV0YWRhdGE/LnRlbXBlcmF0dXJlID8/IHRoaXMucGx1Z2luLnNldHRpbmdzLnRlbXBlcmF0dXJlO1xyXG5cclxuICAgIHRoaXMudXBkYXRlTW9kZWxEaXNwbGF5KGN1cnJlbnRNb2RlbE5hbWUpO1xyXG4gICAgdGhpcy51cGRhdGVSb2xlRGlzcGxheShjdXJyZW50Um9sZU5hbWUpO1xyXG4gICAgdGhpcy51cGRhdGVJbnB1dFBsYWNlaG9sZGVyKGN1cnJlbnRSb2xlTmFtZSk7XHJcbiAgICB0aGlzLnVwZGF0ZVRlbXBlcmF0dXJlSW5kaWNhdG9yKGN1cnJlbnRUZW1wZXJhdHVyZSk7XHJcbiAgICB0aGlzLnVwZGF0ZVRvZ2dsZVZpZXdMb2NhdGlvbk9wdGlvbigpO1xyXG4gICAgdGhpcy51cGRhdGVUb2dnbGVMb2NhdGlvbkJ1dHRvbigpO1xyXG5cclxuICAgIGlmICh0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXIpIHtcclxuICAgICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyXHJcbiAgICAgICAgLnVwZGF0ZVJvbGVMaXN0SWZWaXNpYmxlKClcclxuICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyByb2xlIGRyb3Bkb3duIGxpc3Q6XCIsIGUpKTtcclxuICAgICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyXHJcbiAgICAgICAgLnVwZGF0ZU1vZGVsTGlzdElmVmlzaWJsZSgpXHJcbiAgICAgICAgLmNhdGNoKGUgPT4gdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiRXJyb3IgdXBkYXRpbmcgbW9kZWwgZHJvcGRvd24gbGlzdDpcIiwgZSkpO1xyXG4gICAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXIudXBkYXRlVG9nZ2xlVmlld0xvY2F0aW9uT3B0aW9uKCk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuc2lkZWJhck1hbmFnZXI/LmlzU2VjdGlvblZpc2libGUoXCJyb2xlc1wiKSkge1xyXG4gICAgICBhd2FpdCB0aGlzLnNpZGViYXJNYW5hZ2VyXHJcbiAgICAgICAgLnVwZGF0ZVJvbGVMaXN0KClcclxuICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyByb2xlIHBhbmVsIGxpc3Q6XCIsIGUpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuc2lkZWJhck1hbmFnZXI/LmlzU2VjdGlvblZpc2libGUoXCJjaGF0c1wiKSkge1xyXG4gICAgICBhd2FpdCB0aGlzLnNpZGViYXJNYW5hZ2VyXHJcbiAgICAgICAgLnVwZGF0ZUNoYXRMaXN0KClcclxuICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyBjaGF0IHBhbmVsIGxpc3Q6XCIsIGUpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHVibGljIGFzeW5jIGhhbmRsZURlbGV0ZU1lc3NhZ2VDbGljayhtZXNzYWdlVG9EZWxldGU6IE1lc3NhZ2UpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdCgpO1xyXG4gICAgaWYgKCFhY3RpdmVDaGF0KSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJDYW5ub3QgZGVsZXRlIG1lc3NhZ2U6IE5vIGFjdGl2ZSBjaGF0LlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIG5ldyBDb25maXJtTW9kYWwoXHJcbiAgICAgIHRoaXMuYXBwLFxyXG4gICAgICBcIkNvbmZpcm0gTWVzc2FnZSBEZWxldGlvblwiLFxyXG4gICAgICBgQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSB0aGlzIG1lc3NhZ2U/XFxuXCIke21lc3NhZ2VUb0RlbGV0ZS5jb250ZW50LnN1YnN0cmluZygwLCAxMDApfSR7XHJcbiAgICAgICAgbWVzc2FnZVRvRGVsZXRlLmNvbnRlbnQubGVuZ3RoID4gMTAwID8gXCIuLi5cIiA6IFwiXCJcclxuICAgICAgfVwiXFxuXFxuVGhpcyBhY3Rpb24gY2Fubm90IGJlIHVuZG9uZS5gLFxyXG4gICAgICBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGNvbnN0IGRlbGV0ZVN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5kZWxldGVNZXNzYWdlQnlUaW1lc3RhbXAoXHJcbiAgICAgICAgICAgIGFjdGl2ZUNoYXQubWV0YWRhdGEuaWQsXHJcbiAgICAgICAgICAgIG1lc3NhZ2VUb0RlbGV0ZS50aW1lc3RhbXBcclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgaWYgKGRlbGV0ZVN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShcIk1lc3NhZ2UgZGVsZXRlZC5cIik7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIGRlbGV0ZSBtZXNzYWdlLlwiKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgbmV3IE5vdGljZShcIkFuIGVycm9yIG9jY3VycmVkIHdoaWxlIGRlbGV0aW5nIHRoZSBtZXNzYWdlLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICkub3BlbigpO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIGhhbmRsZUNvcHlDbGljayhjb250ZW50OiBzdHJpbmcsIGJ1dHRvbkVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgbGV0IHRleHRUb0NvcHkgPSBjb250ZW50O1xyXG5cclxuICAgIGlmIChSZW5kZXJlclV0aWxzLmRldGVjdFRoaW5raW5nVGFncyhSZW5kZXJlclV0aWxzLmRlY29kZUh0bWxFbnRpdGllcyhjb250ZW50KSkuaGFzVGhpbmtpbmdUYWdzKSB7XHJcbiAgICAgIHRleHRUb0NvcHkgPSBSZW5kZXJlclV0aWxzLmRlY29kZUh0bWxFbnRpdGllcyhjb250ZW50KVxyXG4gICAgICAgIC5yZXBsYWNlKC88dGhpbms+W1xcc1xcU10qPzxcXC90aGluaz4vZywgXCJcIilcclxuICAgICAgICAudHJpbSgpO1xyXG4gICAgfVxyXG4gICAgbmF2aWdhdG9yLmNsaXBib2FyZFxyXG4gICAgICAud3JpdGVUZXh0KHRleHRUb0NvcHkpXHJcbiAgICAgIC50aGVuKCgpID0+IHtcclxuICAgICAgICBzZXRJY29uKGJ1dHRvbkVsLCBcImNoZWNrXCIpO1xyXG4gICAgICAgIGJ1dHRvbkVsLnNldEF0dHJpYnV0ZShcInRpdGxlXCIsIFwiQ29waWVkIVwiKTtcclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgIHNldEljb24oYnV0dG9uRWwsIFwiY29weVwiKTtcclxuICAgICAgICAgIGJ1dHRvbkVsLnNldEF0dHJpYnV0ZShcInRpdGxlXCIsIFwiQ29weVwiKTtcclxuICAgICAgICB9LCAyMDAwKTtcclxuICAgICAgfSlcclxuICAgICAgLmNhdGNoKGVyciA9PiB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkNvcHkgZmFpbGVkOlwiLCBlcnIpO1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJGYWlsZWQgdG8gY29weSB0ZXh0LlwiKTtcclxuICAgICAgfSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgYXN5bmMgaGFuZGxlVHJhbnNsYXRlQ2xpY2soXHJcbiAgICBvcmlnaW5hbENvbnRlbnQ6IHN0cmluZyxcclxuICAgIGNvbnRlbnRFbDogSFRNTEVsZW1lbnQsXHJcbiAgICBidXR0b25FbDogSFRNTEJ1dHRvbkVsZW1lbnRcclxuICApOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IHRhcmdldExhbmcgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy50cmFuc2xhdGlvblRhcmdldExhbmd1YWdlO1xyXG5cclxuICAgIGlmICghdGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlVHJhbnNsYXRpb24gfHwgdGhpcy5wbHVnaW4uc2V0dGluZ3MudHJhbnNsYXRpb25Qcm92aWRlciA9PT0gXCJub25lXCIpIHtcclxuICAgICAgbmV3IE5vdGljZShcIlRyYW5zbGF0aW9uIGRpc2FibGVkIG9yIHByb3ZpZGVyIG5vdCBzZWxlY3RlZCBpbiBzZXR0aW5ncy5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRhcmdldExhbmcpIHtcclxuICAgICAgbmV3IE5vdGljZShcIlRhcmdldCBsYW5ndWFnZSBmb3IgdHJhbnNsYXRpb24gaXMgbm90IHNldCBpbiBzZXR0aW5ncy5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgdGV4dFRvVHJhbnNsYXRlID0gXCJcIjtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGRlY29kZWRDb250ZW50ID0gUmVuZGVyZXJVdGlscy5kZWNvZGVIdG1sRW50aXRpZXMob3JpZ2luYWxDb250ZW50KTtcclxuICAgICAgaWYgKFJlbmRlcmVyVXRpbHMuZGV0ZWN0VGhpbmtpbmdUYWdzKGRlY29kZWRDb250ZW50KS5oYXNUaGlua2luZ1RhZ3MpIHtcclxuICAgICAgICB0ZXh0VG9UcmFuc2xhdGUgPSBkZWNvZGVkQ29udGVudC5yZXBsYWNlKC88dGhpbms+W1xcc1xcU10qPzxcXC90aGluaz4vZywgXCJcIikudHJpbSgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRleHRUb1RyYW5zbGF0ZSA9IGRlY29kZWRDb250ZW50LnRyaW0oKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCF0ZXh0VG9UcmFuc2xhdGUpIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiTm90aGluZyB0byB0cmFuc2xhdGUgKGNvbnRlbnQgbWlnaHQgYmUgZW1wdHkgYWZ0ZXIgcmVtb3ZpbmcgaW50ZXJuYWwgdGFncykuXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBwcmVwYXJlIHRleHQgZm9yIHRyYW5zbGF0aW9uLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yKGAuJHtDU1NfQ0xBU1NfVFJBTlNMQVRJT05fQ09OVEFJTkVSfWApPy5yZW1vdmUoKTtcclxuXHJcbiAgICBjb25zdCBvcmlnaW5hbEljb24gPSBidXR0b25FbC5xdWVyeVNlbGVjdG9yKFwiLnN2Zy1pY29uXCIpPy5nZXRBdHRyaWJ1dGUoXCJpY29uLW5hbWVcIikgfHwgXCJsYW5ndWFnZXNcIjtcclxuICAgIHNldEljb24oYnV0dG9uRWwsIFwibG9hZGVyXCIpO1xyXG4gICAgYnV0dG9uRWwuZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgYnV0dG9uRWwuY2xhc3NMaXN0LmFkZChDU1NfQ0xBU1NfVFJBTlNMQVRJT05fUEVORElORyk7XHJcbiAgICBjb25zdCBvcmlnaW5hbFRpdGxlID0gYnV0dG9uRWwudGl0bGU7XHJcbiAgICBidXR0b25FbC5zZXRBdHRyaWJ1dGUoXCJ0aXRsZVwiLCBcIlRyYW5zbGF0aW5nLi4uXCIpO1xyXG4gICAgYnV0dG9uRWwuYWRkQ2xhc3MoXCJidXR0b24tbG9hZGluZ1wiKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCB0cmFuc2xhdGVkVGV4dCA9IGF3YWl0IHRoaXMucGx1Z2luLnRyYW5zbGF0aW9uU2VydmljZS50cmFuc2xhdGUodGV4dFRvVHJhbnNsYXRlLCB0YXJnZXRMYW5nKTtcclxuXHJcbiAgICAgIGlmICghY29udGVudEVsIHx8ICFjb250ZW50RWwuaXNDb25uZWN0ZWQpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmICh0cmFuc2xhdGVkVGV4dCAhPT0gbnVsbCkge1xyXG4gICAgICAgIGNvbnN0IHRyYW5zbGF0aW9uQ29udGFpbmVyID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogQ1NTX0NMQVNTX1RSQU5TTEFUSU9OX0NPTlRBSU5FUiB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgdHJhbnNsYXRpb25Db250ZW50RWwgPSB0cmFuc2xhdGlvbkNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU19UUkFOU0xBVElPTl9DT05URU5UIH0pO1xyXG5cclxuICAgICAgICBhd2FpdCBNYXJrZG93blJlbmRlcmVyLnJlbmRlcihcclxuICAgICAgICAgIHRoaXMuYXBwLFxyXG4gICAgICAgICAgdHJhbnNsYXRlZFRleHQsXHJcbiAgICAgICAgICB0cmFuc2xhdGlvbkNvbnRlbnRFbCxcclxuICAgICAgICAgIHRoaXMucGx1Z2luLmFwcC52YXVsdC5nZXRSb290KCk/LnBhdGggPz8gXCJcIixcclxuICAgICAgICAgIHRoaXNcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBSZW5kZXJlclV0aWxzLmZpeEJyb2tlblR3ZW1vamlJbWFnZXModHJhbnNsYXRpb25Db250ZW50RWwpO1xyXG5cclxuICAgICAgICBjb25zdCB0YXJnZXRMYW5nTmFtZSA9IExBTkdVQUdFU1t0YXJnZXRMYW5nXSB8fCB0YXJnZXRMYW5nO1xyXG4gICAgICAgIHRyYW5zbGF0aW9uQ29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIsIHtcclxuICAgICAgICAgIGNsczogXCJ0cmFuc2xhdGlvbi1pbmRpY2F0b3JcIixcclxuICAgICAgICAgIHRleHQ6IGBbVHJhbnNsYXRlZCB0byAke3RhcmdldExhbmdOYW1lfV1gLFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbSg1MCwgZmFsc2UpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgaWYgKGJ1dHRvbkVsPy5pc0Nvbm5lY3RlZCkge1xyXG4gICAgICAgIHNldEljb24oYnV0dG9uRWwsIG9yaWdpbmFsSWNvbik7XHJcbiAgICAgICAgYnV0dG9uRWwuZGlzYWJsZWQgPSBmYWxzZTtcclxuICAgICAgICBidXR0b25FbC5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19UUkFOU0xBVElPTl9QRU5ESU5HKTtcclxuICAgICAgICBidXR0b25FbC5zZXRBdHRyaWJ1dGUoXCJ0aXRsZVwiLCBvcmlnaW5hbFRpdGxlKTtcclxuICAgICAgICBidXR0b25FbC5yZW1vdmVDbGFzcyhcImJ1dHRvbi1sb2FkaW5nXCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlbmRlckRhdGVTZXBhcmF0b3IoZGF0ZTogRGF0ZSk6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLmNoYXRDb250YWluZXIpIHJldHVybjtcclxuICAgIHRoaXMuY2hhdENvbnRhaW5lci5jcmVhdGVEaXYoe1xyXG4gICAgICBjbHM6IENTU19DTEFTU19EQVRFX1NFUEFSQVRPUixcclxuICAgICAgdGV4dDogdGhpcy5mb3JtYXREYXRlU2VwYXJhdG9yKGRhdGUpLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGluaXRTcGVlY2hXb3JrZXIoKTogdm9pZCB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCB3b3JrZXJDb2RlID0gYFxyXG4gICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICBzZWxmLm9ubWVzc2FnZSA9IGFzeW5jIChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgIGNvbnN0IHsgYXBpS2V5LCBhdWRpb0Jsb2IsIGxhbmd1YWdlQ29kZSA9ICd1ay1VQScgfSA9IGV2ZW50LmRhdGE7XHJcblxyXG4gICAgICAgICAgICAgICAgIGlmICghYXBpS2V5IHx8IGFwaUtleS50cmltKCkgPT09ICcnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgIHNlbGYucG9zdE1lc3NhZ2UoeyBlcnJvcjogdHJ1ZSwgbWVzc2FnZTogJ0dvb2dsZSBBUEkgS2V5IGlzIG5vdCBjb25maWd1cmVkLiBQbGVhc2UgYWRkIGl0IGluIHBsdWdpbiBzZXR0aW5ncy4nIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICBjb25zdCB1cmwgPSBcImh0dHBzOlxyXG5cclxuICAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBhcnJheUJ1ZmZlciA9IGF3YWl0IGF1ZGlvQmxvYi5hcnJheUJ1ZmZlcigpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICBsZXQgYmFzZTY0QXVkaW87XHJcbiAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgVGV4dERlY29kZXIgIT09ICd1bmRlZmluZWQnKSB7IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2U2NFN0cmluZyA9IGJ0b2EoU3RyaW5nLmZyb21DaGFyQ29kZSguLi5uZXcgVWludDhBcnJheShhcnJheUJ1ZmZlcikpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXNlNjRBdWRpbyA9IGJhc2U2NFN0cmluZztcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYmFzZTY0QXVkaW8gPSBidG9hKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgVWludDhBcnJheShhcnJheUJ1ZmZlcikucmVkdWNlKChkYXRhLCBieXRlKSA9PiBkYXRhICsgU3RyaW5nLmZyb21DaGFyQ29kZShieXRlKSwgJycpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25maWc6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5jb2Rpbmc6ICdXRUJNX09QVVMnLCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2FtcGxlUmF0ZUhlcnR6OiA0ODAwMCwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhbmd1YWdlQ29kZTogbGFuZ3VhZ2VDb2RlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbDogJ2xhdGVzdF9sb25nJywgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZUF1dG9tYXRpY1B1bmN0dWF0aW9uOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXVkaW86IHsgY29udGVudDogYmFzZTY0QXVkaW8gfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2VEYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBcIkVycm9yIGZyb20gR29vZ2xlIFNwZWVjaCBBUEk6IFwiICsgKHJlc3BvbnNlRGF0YS5lcnJvcj8ubWVzc2FnZSB8fCByZXNwb25zZS5zdGF0dXNUZXh0IHx8ICdVbmtub3duIGVycm9yJylcclxuICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2VEYXRhLnJlc3VsdHMgJiYgcmVzcG9uc2VEYXRhLnJlc3VsdHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJhbnNjcmlwdCA9IHJlc3BvbnNlRGF0YS5yZXN1bHRzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLm1hcChyZXN1bHQgPT4gcmVzdWx0LmFsdGVybmF0aXZlc1swXS50cmFuc2NyaXB0KVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5qb2luKCcgJylcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5wb3N0TWVzc2FnZSh0cmFuc2NyaXB0KTsgXHJcbiAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucG9zdE1lc3NhZ2UoeyBlcnJvcjogdHJ1ZSwgbWVzc2FnZTogJ05vIHNwZWVjaCBkZXRlY3RlZCBvciByZWNvZ25pemVkLicgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgc2VsZi5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdFcnJvciBwcm9jZXNzaW5nIHNwZWVjaCByZWNvZ25pdGlvbjogJyArIChlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcikpXHJcbiAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgYDtcclxuXHJcbiAgICAgIGNvbnN0IHdvcmtlckJsb2IgPSBuZXcgQmxvYihbd29ya2VyQ29kZV0sIHtcclxuICAgICAgICB0eXBlOiBcImFwcGxpY2F0aW9uL2phdmFzY3JpcHRcIixcclxuICAgICAgfSk7XHJcbiAgICAgIGNvbnN0IHdvcmtlclVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwod29ya2VyQmxvYik7XHJcbiAgICAgIHRoaXMuc3BlZWNoV29ya2VyID0gbmV3IFdvcmtlcih3b3JrZXJVcmwpO1xyXG4gICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHdvcmtlclVybCk7XHJcblxyXG4gICAgICB0aGlzLnNldHVwU3BlZWNoV29ya2VySGFuZGxlcnMoKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJTcGVlY2ggcmVjb2duaXRpb24gZmVhdHVyZSBmYWlsZWQgdG8gaW5pdGlhbGl6ZS5cIik7XHJcbiAgICAgIHRoaXMuc3BlZWNoV29ya2VyID0gbnVsbDtcclxuICAgIH1cclxuICB9XHJcbiAgcHJpdmF0ZSBzZXR1cFNwZWVjaFdvcmtlckhhbmRsZXJzKCk6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLnNwZWVjaFdvcmtlcikgcmV0dXJuO1xyXG5cclxuICAgIHRoaXMuc3BlZWNoV29ya2VyLm9ubWVzc2FnZSA9IGV2ZW50ID0+IHtcclxuICAgICAgY29uc3QgZGF0YSA9IGV2ZW50LmRhdGE7XHJcblxyXG4gICAgICBpZiAoZGF0YSAmJiB0eXBlb2YgZGF0YSA9PT0gXCJvYmplY3RcIiAmJiBkYXRhLmVycm9yKSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShgU3BlZWNoIFJlY29nbml0aW9uIEVycm9yOiAke2RhdGEubWVzc2FnZX1gKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZUlucHV0UGxhY2Vob2xkZXIodGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiICYmIGRhdGEudHJpbSgpKSB7XHJcbiAgICAgICAgY29uc3QgdHJhbnNjcmlwdCA9IGRhdGEudHJpbSgpO1xyXG4gICAgICAgIHRoaXMuaW5zZXJ0VHJhbnNjcmlwdCh0cmFuc2NyaXB0KTtcclxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YSAhPT0gXCJzdHJpbmdcIikge1xyXG4gICAgICB9XHJcblxyXG4gICAgICB0aGlzLnVwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnNwZWVjaFdvcmtlci5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICBuZXcgTm90aWNlKFwiQW4gdW5leHBlY3RlZCBlcnJvciBvY2N1cnJlZCBpbiB0aGUgc3BlZWNoIHJlY29nbml0aW9uIHdvcmtlci5cIik7XHJcbiAgICAgIHRoaXMudXBkYXRlSW5wdXRQbGFjZWhvbGRlcih0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWUpO1xyXG5cclxuICAgICAgdGhpcy5zdG9wVm9pY2VSZWNvcmRpbmcoZmFsc2UpO1xyXG4gICAgfTtcclxuICB9XHJcbiAgcHJpdmF0ZSBpbnNlcnRUcmFuc2NyaXB0KHRyYW5zY3JpcHQ6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLmlucHV0RWwpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCBjdXJyZW50VmFsID0gdGhpcy5pbnB1dEVsLnZhbHVlO1xyXG4gICAgY29uc3Qgc3RhcnQgPSB0aGlzLmlucHV0RWwuc2VsZWN0aW9uU3RhcnQgPz8gY3VycmVudFZhbC5sZW5ndGg7XHJcbiAgICBjb25zdCBlbmQgPSB0aGlzLmlucHV0RWwuc2VsZWN0aW9uRW5kID8/IGN1cnJlbnRWYWwubGVuZ3RoO1xyXG5cclxuICAgIGxldCB0ZXh0VG9JbnNlcnQgPSB0cmFuc2NyaXB0O1xyXG4gICAgY29uc3QgcHJlY2VkaW5nQ2hhciA9IHN0YXJ0ID4gMCA/IGN1cnJlbnRWYWxbc3RhcnQgLSAxXSA6IG51bGw7XHJcbiAgICBjb25zdCBmb2xsb3dpbmdDaGFyID0gZW5kIDwgY3VycmVudFZhbC5sZW5ndGggPyBjdXJyZW50VmFsW2VuZF0gOiBudWxsO1xyXG5cclxuICAgIGlmIChwcmVjZWRpbmdDaGFyICYmIHByZWNlZGluZ0NoYXIgIT09IFwiIFwiICYmIHByZWNlZGluZ0NoYXIgIT09IFwiXFxuXCIpIHtcclxuICAgICAgdGV4dFRvSW5zZXJ0ID0gXCIgXCIgKyB0ZXh0VG9JbnNlcnQ7XHJcbiAgICB9XHJcbiAgICBpZiAoZm9sbG93aW5nQ2hhciAmJiBmb2xsb3dpbmdDaGFyICE9PSBcIiBcIiAmJiBmb2xsb3dpbmdDaGFyICE9PSBcIlxcblwiICYmICF0ZXh0VG9JbnNlcnQuZW5kc1dpdGgoXCIgXCIpKSB7XHJcbiAgICAgIHRleHRUb0luc2VydCArPSBcIiBcIjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBuZXdWYWx1ZSA9IGN1cnJlbnRWYWwuc3Vic3RyaW5nKDAsIHN0YXJ0KSArIHRleHRUb0luc2VydCArIGN1cnJlbnRWYWwuc3Vic3RyaW5nKGVuZCk7XHJcbiAgICB0aGlzLmlucHV0RWwudmFsdWUgPSBuZXdWYWx1ZTtcclxuXHJcbiAgICBjb25zdCBuZXdDdXJzb3JQb3MgPSBzdGFydCArIHRleHRUb0luc2VydC5sZW5ndGg7XHJcbiAgICB0aGlzLmlucHV0RWwuc2V0U2VsZWN0aW9uUmFuZ2UobmV3Q3Vyc29yUG9zLCBuZXdDdXJzb3JQb3MpO1xyXG5cclxuICAgIHRoaXMuaW5wdXRFbC5mb2N1cygpO1xyXG4gICAgdGhpcy5pbnB1dEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIikpO1xyXG4gIH1cclxuICBwcml2YXRlIGFzeW5jIHRvZ2dsZVZvaWNlUmVjb2duaXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBpZiAodGhpcy5tZWRpYVJlY29yZGVyICYmIHRoaXMubWVkaWFSZWNvcmRlci5zdGF0ZSA9PT0gXCJyZWNvcmRpbmdcIikge1xyXG4gICAgICB0aGlzLnN0b3BWb2ljZVJlY29yZGluZyh0cnVlKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuc3RhcnRWb2ljZVJlY29nbml0aW9uKCk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHByaXZhdGUgYXN5bmMgc3RhcnRWb2ljZVJlY29nbml0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgaWYgKCF0aGlzLnNwZWVjaFdvcmtlcikge1xyXG4gICAgICBuZXcgTm90aWNlKFwi0KTRg9C90LrRhtGW0Y8g0YDQvtC30L/RltC30L3QsNCy0LDQvdC90Y8g0LzQvtCy0LvQtdC90L3RjyDQvdC10LTQvtGB0YLRg9C/0L3QsCAod29ya2VyINC90LUg0ZbQvdGW0YbRltCw0LvRltC30L7QstCw0L3QvikuXCIpO1xyXG5cclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHNwZWVjaEFwaUtleSA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmdvb2dsZUFwaUtleTtcclxuICAgIGlmICghc3BlZWNoQXBpS2V5KSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXHJcbiAgICAgICAgXCLQmtC70Y7RhyBHb29nbGUgQVBJINC00LvRjyDRgNC+0LfQv9GW0LfQvdCw0LLQsNC90L3RjyDQvNC+0LLQu9C10L3QvdGPINC90LUg0L3QsNC70LDRiNGC0L7QstCw0L3Qvi4g0JHRg9C00Ywg0LvQsNGB0LrQsCwg0LTQvtC00LDQudGC0LUg0LnQvtCz0L4g0LIg0L3QsNC70LDRiNGC0YPQstCw0L3QvdGP0YUg0L/Qu9Cw0LPRltC90LAuXCJcclxuICAgICAgKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIHRoaXMuYXVkaW9TdHJlYW0gPSBhd2FpdCBuYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmdldFVzZXJNZWRpYSh7XHJcbiAgICAgICAgYXVkaW86IHRydWUsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgbGV0IHJlY29yZGVyT3B0aW9uczogTWVkaWFSZWNvcmRlck9wdGlvbnMgfCB1bmRlZmluZWQ7XHJcbiAgICAgIGNvbnN0IHByZWZlcnJlZE1pbWVUeXBlID0gXCJhdWRpby93ZWJtO2NvZGVjcz1vcHVzXCI7XHJcblxyXG4gICAgICBpZiAoTWVkaWFSZWNvcmRlci5pc1R5cGVTdXBwb3J0ZWQocHJlZmVycmVkTWltZVR5cGUpKSB7XHJcbiAgICAgICAgcmVjb3JkZXJPcHRpb25zID0geyBtaW1lVHlwZTogcHJlZmVycmVkTWltZVR5cGUgfTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZWNvcmRlck9wdGlvbnMgPSB1bmRlZmluZWQ7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMubWVkaWFSZWNvcmRlciA9IG5ldyBNZWRpYVJlY29yZGVyKHRoaXMuYXVkaW9TdHJlYW0sIHJlY29yZGVyT3B0aW9ucyk7XHJcblxyXG4gICAgICBjb25zdCBhdWRpb0NodW5rczogQmxvYltdID0gW107XHJcblxyXG4gICAgICB0aGlzLnZvaWNlQnV0dG9uPy5jbGFzc0xpc3QuYWRkKENTU19DTEFTU19SRUNPUkRJTkcpO1xyXG4gICAgICBzZXRJY29uKHRoaXMudm9pY2VCdXR0b24sIFwic3RvcC1jaXJjbGVcIik7XHJcbiAgICAgIHRoaXMuaW5wdXRFbC5wbGFjZWhvbGRlciA9IFwiUmVjb3JkaW5nLi4uIFNwZWFrIG5vdy5cIjtcclxuXHJcbiAgICAgIHRoaXMubWVkaWFSZWNvcmRlci5vbmRhdGFhdmFpbGFibGUgPSBldmVudCA9PiB7XHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEuc2l6ZSA+IDApIHtcclxuICAgICAgICAgIGF1ZGlvQ2h1bmtzLnB1c2goZXZlbnQuZGF0YSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9O1xyXG4gICAgICB0aGlzLm1lZGlhUmVjb3JkZXIub25zdG9wID0gKCkgPT4ge1xyXG4gICAgICAgIGlmICh0aGlzLnNwZWVjaFdvcmtlciAmJiBhdWRpb0NodW5rcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICBjb25zdCBhdWRpb0Jsb2IgPSBuZXcgQmxvYihhdWRpb0NodW5rcywge1xyXG4gICAgICAgICAgICB0eXBlOiB0aGlzLm1lZGlhUmVjb3JkZXI/Lm1pbWVUeXBlIHx8IFwiYXVkaW8vd2VibVwiLFxyXG4gICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgdGhpcy5pbnB1dEVsLnBsYWNlaG9sZGVyID0gXCJQcm9jZXNzaW5nIHNwZWVjaC4uLlwiO1xyXG4gICAgICAgICAgdGhpcy5zcGVlY2hXb3JrZXIucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICBhcGlLZXk6IHNwZWVjaEFwaUtleSxcclxuICAgICAgICAgICAgYXVkaW9CbG9iLFxyXG4gICAgICAgICAgICBsYW5ndWFnZUNvZGU6IHRoaXMucGx1Z2luLnNldHRpbmdzLnNwZWVjaExhbmd1YWdlIHx8IFwidWstVUFcIixcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoYXVkaW9DaHVua3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICB0aGlzLmdldEN1cnJlbnRSb2xlRGlzcGxheU5hbWUoKS50aGVuKHJvbGVOYW1lID0+IHRoaXMudXBkYXRlSW5wdXRQbGFjZWhvbGRlcihyb2xlTmFtZSkpO1xyXG4gICAgICAgICAgdGhpcy51cGRhdGVTZW5kQnV0dG9uU3RhdGUoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH07XHJcbiAgICAgIHRoaXMubWVkaWFSZWNvcmRlci5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJBbiBlcnJvciBvY2N1cnJlZCBkdXJpbmcgcmVjb3JkaW5nLlwiKTtcclxuICAgICAgICB0aGlzLnN0b3BWb2ljZVJlY29yZGluZyhmYWxzZSk7XHJcbiAgICAgIH07XHJcblxyXG4gICAgICB0aGlzLm1lZGlhUmVjb3JkZXIuc3RhcnQoKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIERPTUV4Y2VwdGlvbiAmJiBlcnJvci5uYW1lID09PSBcIk5vdEFsbG93ZWRFcnJvclwiKSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIk1pY3JvcGhvbmUgYWNjZXNzIGRlbmllZC4gUGxlYXNlIGdyYW50IHBlcm1pc3Npb24uXCIpO1xyXG4gICAgICB9IGVsc2UgaWYgKGVycm9yIGluc3RhbmNlb2YgRE9NRXhjZXB0aW9uICYmIGVycm9yLm5hbWUgPT09IFwiTm90Rm91bmRFcnJvclwiKSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIk1pY3JvcGhvbmUgbm90IGZvdW5kLiBQbGVhc2UgZW5zdXJlIGl0J3MgY29ubmVjdGVkIGFuZCBlbmFibGVkLlwiKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiQ291bGQgbm90IHN0YXJ0IHZvaWNlIHJlY29yZGluZy5cIik7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5zdG9wVm9pY2VSZWNvcmRpbmcoZmFsc2UpO1xyXG4gICAgfVxyXG4gIH1cclxuICBwcml2YXRlIHN0b3BWb2ljZVJlY29yZGluZyhwcm9jZXNzQXVkaW86IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLm1lZGlhUmVjb3JkZXIgJiYgdGhpcy5tZWRpYVJlY29yZGVyLnN0YXRlID09PSBcInJlY29yZGluZ1wiKSB7XHJcbiAgICAgIHRoaXMubWVkaWFSZWNvcmRlci5zdG9wKCk7XHJcbiAgICB9IGVsc2UgaWYgKCFwcm9jZXNzQXVkaW8gJiYgdGhpcy5tZWRpYVJlY29yZGVyPy5zdGF0ZSA9PT0gXCJpbmFjdGl2ZVwiKSB7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy52b2ljZUJ1dHRvbj8uY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NfUkVDT1JESU5HKTtcclxuICAgIHNldEljb24odGhpcy52b2ljZUJ1dHRvbiwgXCJtaWNcIik7XHJcblxyXG4gICAgdGhpcy5nZXRDdXJyZW50Um9sZURpc3BsYXlOYW1lKCkudGhlbihyb2xlTmFtZSA9PiB0aGlzLnVwZGF0ZUlucHV0UGxhY2Vob2xkZXIocm9sZU5hbWUpKTtcclxuICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcblxyXG4gICAgaWYgKHRoaXMuYXVkaW9TdHJlYW0pIHtcclxuICAgICAgdGhpcy5hdWRpb1N0cmVhbS5nZXRUcmFja3MoKS5mb3JFYWNoKHRyYWNrID0+IHRyYWNrLnN0b3AoKSk7XHJcbiAgICAgIHRoaXMuYXVkaW9TdHJlYW0gPSBudWxsO1xyXG4gICAgfVxyXG4gICAgdGhpcy5tZWRpYVJlY29yZGVyID0gbnVsbDtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBjaGVja0FsbE1lc3NhZ2VzRm9yQ29sbGFwc2luZygpOiB2b2lkIHtcclxuICAgIHRoaXMuY2hhdENvbnRhaW5lcj8ucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oYC4ke0NTU19DTEFTU19NRVNTQUdFfWApLmZvckVhY2gobXNnRWwgPT4ge1xyXG4gICAgICB0aGlzLmNoZWNrTWVzc2FnZUZvckNvbGxhcHNpbmcobXNnRWwpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHRvZ2dsZU1lc3NhZ2VDb2xsYXBzZShjb250ZW50RWw6IEhUTUxFbGVtZW50LCBidXR0b25FbDogSFRNTEJ1dHRvbkVsZW1lbnQpOiB2b2lkIHtcclxuICAgIGNvbnN0IG1heEhlaWdodExpbWl0ID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MubWF4TWVzc2FnZUhlaWdodDtcclxuXHJcbiAgICBjb25zdCBpc0luaXRpYWxFeHBhbmRlZFN0YXRlID0gYnV0dG9uRWwuaGFzQXR0cmlidXRlKFwiZGF0YS1pbml0aWFsLXN0YXRlXCIpO1xyXG5cclxuICAgIGlmIChpc0luaXRpYWxFeHBhbmRlZFN0YXRlKSB7XHJcbiAgICAgIGJ1dHRvbkVsLnJlbW92ZUF0dHJpYnV0ZShcImRhdGEtaW5pdGlhbC1zdGF0ZVwiKTtcclxuXHJcbiAgICAgIGNvbnRlbnRFbC5zdHlsZS5tYXhIZWlnaHQgPSBgJHttYXhIZWlnaHRMaW1pdH1weGA7XHJcbiAgICAgIGNvbnRlbnRFbC5jbGFzc0xpc3QuYWRkKENTU19DTEFTU19DT05URU5UX0NPTExBUFNFRCk7XHJcbiAgICAgIGJ1dHRvbkVsLnNldFRleHQoXCJTaG93IE1vcmUg4pa8XCIpO1xyXG5cclxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgY29udGVudEVsLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6IFwic21vb3RoXCIsIGJsb2NrOiBcIm5lYXJlc3RcIiB9KTtcclxuICAgICAgfSwgMzEwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnN0IGlzQ29sbGFwc2VkID0gY29udGVudEVsLmNsYXNzTGlzdC5jb250YWlucyhDU1NfQ0xBU1NfQ09OVEVOVF9DT0xMQVBTRUQpO1xyXG5cclxuICAgICAgaWYgKGlzQ29sbGFwc2VkKSB7XHJcbiAgICAgICAgY29udGVudEVsLnN0eWxlLm1heEhlaWdodCA9IFwiXCI7XHJcbiAgICAgICAgY29udGVudEVsLmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX0NPTlRFTlRfQ09MTEFQU0VEKTtcclxuICAgICAgICBidXR0b25FbC5zZXRUZXh0KFwiU2hvdyBMZXNzIOKWslwiKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb250ZW50RWwuc3R5bGUubWF4SGVpZ2h0ID0gYCR7bWF4SGVpZ2h0TGltaXR9cHhgO1xyXG4gICAgICAgIGNvbnRlbnRFbC5jbGFzc0xpc3QuYWRkKENTU19DTEFTU19DT05URU5UX0NPTExBUFNFRCk7XHJcbiAgICAgICAgYnV0dG9uRWwuc2V0VGV4dChcIlNob3cgTW9yZSDilrxcIik7XHJcblxyXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgY29udGVudEVsLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6IFwic21vb3RoXCIsIGJsb2NrOiBcIm5lYXJlc3RcIiB9KTtcclxuICAgICAgICB9LCAzMTApO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgZ2V0Q2hhdENvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB7XHJcbiAgICByZXR1cm4gdGhpcy5jaGF0Q29udGFpbmVyO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjbGVhckNoYXRDb250YWluZXJJbnRlcm5hbCgpOiB2b2lkIHtcclxuICAgIHRoaXMuY3VycmVudE1lc3NhZ2VzID0gW107XHJcbiAgICB0aGlzLmxhc3RSZW5kZXJlZE1lc3NhZ2VEYXRlID0gbnVsbDtcclxuICAgIGlmICh0aGlzLmNoYXRDb250YWluZXIpIHRoaXMuY2hhdENvbnRhaW5lci5lbXB0eSgpO1xyXG4gICAgdGhpcy5oaWRlRW1wdHlTdGF0ZSgpO1xyXG4gICAgdGhpcy5sYXN0TWVzc2FnZUVsZW1lbnQgPSBudWxsO1xyXG4gICAgdGhpcy5jb25zZWN1dGl2ZUVycm9yTWVzc2FnZXMgPSBbXTtcclxuICAgIHRoaXMuZXJyb3JHcm91cEVsZW1lbnQgPSBudWxsO1xyXG4gICAgdGhpcy5pc1N1bW1hcml6aW5nRXJyb3JzID0gZmFsc2U7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgY2xlYXJEaXNwbGF5QW5kU3RhdGUoKTogdm9pZCB7XHJcbiAgICB0aGlzLmNsZWFyQ2hhdENvbnRhaW5lckludGVybmFsKCk7XHJcbiAgICB0aGlzLnNob3dFbXB0eVN0YXRlKCk7XHJcbiAgICB0aGlzLnVwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpO1xyXG4gICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLmZvY3VzSW5wdXQoKSwgNTApO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIHNjcm9sbFRvQm90dG9tKCk6IHZvaWQge1xyXG4gICAgdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oNTAsIHRydWUpO1xyXG4gIH1cclxuICBwdWJsaWMgY2xlYXJJbnB1dEZpZWxkKCk6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMuaW5wdXRFbCkge1xyXG4gICAgICB0aGlzLmlucHV0RWwudmFsdWUgPSBcIlwiO1xyXG4gICAgICB0aGlzLmlucHV0RWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoXCJpbnB1dFwiKSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHB1YmxpYyBmb2N1c0lucHV0KCk6IHZvaWQge1xyXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgIHRoaXMuaW5wdXRFbD8uZm9jdXMoKTtcclxuICAgIH0sIDApO1xyXG4gIH1cclxuXHJcbiAgZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKGRlbGF5ID0gNTAsIGZvcmNlU2Nyb2xsID0gZmFsc2UpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLnNjcm9sbFRpbWVvdXQpIHtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuc2Nyb2xsVGltZW91dCk7XHJcbiAgICAgIHRoaXMuc2Nyb2xsVGltZW91dCA9IG51bGw7XHJcbiAgICB9XHJcbiAgICB0aGlzLnNjcm9sbFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcclxuICAgICAgICBpZiAodGhpcy5jaGF0Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICBjb25zdCB0aHJlc2hvbGQgPSAxMDA7XHJcbiAgICAgICAgICBjb25zdCBpc1Njcm9sbGVkVXAgPVxyXG4gICAgICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsSGVpZ2h0IC0gdGhpcy5jaGF0Q29udGFpbmVyLnNjcm9sbFRvcCAtIHRoaXMuY2hhdENvbnRhaW5lci5jbGllbnRIZWlnaHQgPlxyXG4gICAgICAgICAgICB0aHJlc2hvbGQ7XHJcblxyXG4gICAgICAgICAgaWYgKGlzU2Nyb2xsZWRVcCAhPT0gdGhpcy51c2VyU2Nyb2xsZWRVcCkge1xyXG4gICAgICAgICAgICB0aGlzLnVzZXJTY3JvbGxlZFVwID0gaXNTY3JvbGxlZFVwO1xyXG5cclxuICAgICAgICAgICAgaWYgKCFpc1Njcm9sbGVkVXApIHRoaXMubmV3TWVzc2FnZXNJbmRpY2F0b3JFbD8uY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NfVklTSUJMRSk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKGZvcmNlU2Nyb2xsIHx8ICF0aGlzLnVzZXJTY3JvbGxlZFVwIHx8IHRoaXMuaXNQcm9jZXNzaW5nKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJlaGF2aW9yID0gdGhpcy5pc1Byb2Nlc3NpbmcgPyBcImF1dG9cIiA6IFwic21vb3RoXCI7XHJcbiAgICAgICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxUbyh7XHJcbiAgICAgICAgICAgICAgdG9wOiB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsSGVpZ2h0LFxyXG4gICAgICAgICAgICAgIGJlaGF2aW9yOiBiZWhhdmlvcixcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoZm9yY2VTY3JvbGwpIHtcclxuICAgICAgICAgICAgICB0aGlzLnVzZXJTY3JvbGxlZFVwID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsPy5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgICAgdGhpcy5zY3JvbGxUaW1lb3V0ID0gbnVsbDtcclxuICAgIH0sIGRlbGF5KTtcclxuICB9XHJcblxyXG4gIGZvcm1hdFRpbWUoZGF0ZTogRGF0ZSk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gZGF0ZS50b0xvY2FsZVRpbWVTdHJpbmcodW5kZWZpbmVkLCB7XHJcbiAgICAgIGhvdXI6IFwibnVtZXJpY1wiLFxyXG4gICAgICBtaW51dGU6IFwiMi1kaWdpdFwiLFxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGZvcm1hdERhdGVTZXBhcmF0b3IoZGF0ZTogRGF0ZSk6IHN0cmluZyB7XHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xyXG4gICAgY29uc3QgeWVzdGVyZGF5ID0gbmV3IERhdGUobm93KTtcclxuICAgIHllc3RlcmRheS5zZXREYXRlKG5vdy5nZXREYXRlKCkgLSAxKTtcclxuICAgIGlmICh0aGlzLmlzU2FtZURheShkYXRlLCBub3cpKSByZXR1cm4gXCJUb2RheVwiO1xyXG4gICAgZWxzZSBpZiAodGhpcy5pc1NhbWVEYXkoZGF0ZSwgeWVzdGVyZGF5KSkgcmV0dXJuIFwiWWVzdGVyZGF5XCI7XHJcbiAgICBlbHNlXHJcbiAgICAgIHJldHVybiBkYXRlLnRvTG9jYWxlRGF0ZVN0cmluZyh1bmRlZmluZWQsIHtcclxuICAgICAgICB3ZWVrZGF5OiBcImxvbmdcIixcclxuICAgICAgICB5ZWFyOiBcIm51bWVyaWNcIixcclxuICAgICAgICBtb250aDogXCJsb25nXCIsXHJcbiAgICAgICAgZGF5OiBcIm51bWVyaWNcIixcclxuICAgICAgfSk7XHJcbiAgfVxyXG4gIGZvcm1hdFJlbGF0aXZlRGF0ZShkYXRlOiBEYXRlKTogc3RyaW5nIHtcclxuICAgIGlmICghKGRhdGUgaW5zdGFuY2VvZiBEYXRlKSB8fCBpc05hTihkYXRlLmdldFRpbWUoKSkpIHtcclxuICAgICAgcmV0dXJuIFwiSW52YWxpZCBkYXRlXCI7XHJcbiAgICB9XHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xyXG4gICAgY29uc3QgZGlmZlNlY29uZHMgPSBNYXRoLnJvdW5kKChub3cuZ2V0VGltZSgpIC0gZGF0ZS5nZXRUaW1lKCkpIC8gMTAwMCk7XHJcbiAgICBjb25zdCBkaWZmRGF5cyA9IE1hdGguZmxvb3IoZGlmZlNlY29uZHMgLyAoNjAgKiA2MCAqIDI0KSk7XHJcbiAgICBpZiAoZGlmZkRheXMgPT09IDApIHtcclxuICAgICAgY29uc3QgZGlmZkhvdXJzID0gTWF0aC5mbG9vcihkaWZmU2Vjb25kcyAvICg2MCAqIDYwKSk7XHJcbiAgICAgIGlmIChkaWZmSG91cnMgPCAxKSByZXR1cm4gXCJKdXN0IG5vd1wiO1xyXG4gICAgICBpZiAoZGlmZkhvdXJzID09PSAxKSByZXR1cm4gXCIxIGhvdXIgYWdvXCI7XHJcbiAgICAgIGlmIChkaWZmSG91cnMgPCBub3cuZ2V0SG91cnMoKSkgcmV0dXJuIGAke2RpZmZIb3Vyc30gaG91cnMgYWdvYDtcclxuICAgICAgZWxzZSByZXR1cm4gXCJUb2RheVwiO1xyXG4gICAgfSBlbHNlIGlmIChkaWZmRGF5cyA9PT0gMSkge1xyXG4gICAgICByZXR1cm4gXCJZZXN0ZXJkYXlcIjtcclxuICAgIH0gZWxzZSBpZiAoZGlmZkRheXMgPCA3KSB7XHJcbiAgICAgIHJldHVybiBgJHtkaWZmRGF5c30gZGF5cyBhZ29gO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuIGRhdGUudG9Mb2NhbGVEYXRlU3RyaW5nKHVuZGVmaW5lZCwge1xyXG4gICAgICAgIG1vbnRoOiBcInNob3J0XCIsXHJcbiAgICAgICAgZGF5OiBcIm51bWVyaWNcIixcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIGlzU2FtZURheShkYXRlMTogRGF0ZSwgZGF0ZTI6IERhdGUpOiBib29sZWFuIHtcclxuICAgIHJldHVybiAoXHJcbiAgICAgIGRhdGUxLmdldEZ1bGxZZWFyKCkgPT09IGRhdGUyLmdldEZ1bGxZZWFyKCkgJiZcclxuICAgICAgZGF0ZTEuZ2V0TW9udGgoKSA9PT0gZGF0ZTIuZ2V0TW9udGgoKSAmJlxyXG4gICAgICBkYXRlMS5nZXREYXRlKCkgPT09IGRhdGUyLmdldERhdGUoKVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZm9ybWF0Q2hhdFRvTWFya2Rvd24obWVzc2FnZXNUb0Zvcm1hdDogTWVzc2FnZVtdKTogc3RyaW5nIHtcclxuICAgIGxldCBsb2NhbExhc3REYXRlOiBEYXRlIHwgbnVsbCA9IG51bGw7XHJcbiAgICBjb25zdCBleHBvcnRUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpO1xyXG4gICAgbGV0IG1hcmtkb3duID0gYCMgQUkgRm9yZ2UgQ2hhdCBFeHBvcnRcXG5gICsgYD4gRXhwb3J0ZWQgb246ICR7ZXhwb3J0VGltZXN0YW1wLnRvTG9jYWxlU3RyaW5nKHVuZGVmaW5lZCl9XFxuXFxuYDtcclxuXHJcbiAgICBtZXNzYWdlc1RvRm9ybWF0LmZvckVhY2gobWVzc2FnZSA9PiB7XHJcbiAgICAgIGlmICghbWVzc2FnZS5jb250ZW50Py50cmltKCkpIHJldHVybjtcclxuXHJcbiAgICAgIGlmIChsb2NhbExhc3REYXRlID09PSBudWxsIHx8ICF0aGlzLmlzU2FtZURheShsb2NhbExhc3REYXRlLCBtZXNzYWdlLnRpbWVzdGFtcCkpIHtcclxuICAgICAgICBpZiAobG9jYWxMYXN0RGF0ZSAhPT0gbnVsbCkgbWFya2Rvd24gKz0gYCoqKlxcbmA7XHJcbiAgICAgICAgbWFya2Rvd24gKz0gYCoqJHt0aGlzLmZvcm1hdERhdGVTZXBhcmF0b3IobWVzc2FnZS50aW1lc3RhbXApfSoqXFxuKioqXFxuXFxuYDtcclxuICAgICAgfVxyXG4gICAgICBsb2NhbExhc3REYXRlID0gbWVzc2FnZS50aW1lc3RhbXA7XHJcblxyXG4gICAgICBjb25zdCB0aW1lID0gdGhpcy5mb3JtYXRUaW1lKG1lc3NhZ2UudGltZXN0YW1wKTtcclxuICAgICAgbGV0IHByZWZpeCA9IFwiXCI7XHJcbiAgICAgIGxldCBjb250ZW50UHJlZml4ID0gXCJcIjtcclxuICAgICAgbGV0IGNvbnRlbnQgPSBtZXNzYWdlLmNvbnRlbnQudHJpbSgpO1xyXG5cclxuICAgICAgaWYgKG1lc3NhZ2Uucm9sZSA9PT0gXCJhc3Npc3RhbnRcIikge1xyXG4gICAgICAgIGNvbnRlbnQgPSBSZW5kZXJlclV0aWxzLmRlY29kZUh0bWxFbnRpdGllcyhjb250ZW50KVxyXG4gICAgICAgICAgLnJlcGxhY2UoLzx0aGluaz5bXFxzXFxTXSo/PFxcL3RoaW5rPi9nLCBcIlwiKVxyXG4gICAgICAgICAgLnRyaW0oKTtcclxuXHJcbiAgICAgICAgaWYgKCFjb250ZW50KSByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHN3aXRjaCAobWVzc2FnZS5yb2xlKSB7XHJcbiAgICAgICAgY2FzZSBcInVzZXJcIjpcclxuICAgICAgICAgIHByZWZpeCA9IGAqKlVzZXIgKCR7dGltZX0pOioqXFxuYDtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhc3Npc3RhbnRcIjpcclxuICAgICAgICAgIHByZWZpeCA9IGAqKkFzc2lzdGFudCAoJHt0aW1lfSk6KipcXG5gO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInN5c3RlbVwiOlxyXG4gICAgICAgICAgcHJlZml4ID0gYD4gX1tTeXN0ZW0gKCR7dGltZX0pXV8gXFxuPiBgO1xyXG4gICAgICAgICAgY29udGVudFByZWZpeCA9IFwiPiBcIjtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJlcnJvclwiOlxyXG4gICAgICAgICAgcHJlZml4ID0gYD4gWyFFUlJPUl0gRXJyb3IgKCR7dGltZX0pOlxcbj4gYDtcclxuICAgICAgICAgIGNvbnRlbnRQcmVmaXggPSBcIj4gXCI7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgICBtYXJrZG93biArPSBwcmVmaXg7XHJcbiAgICAgIGlmIChjb250ZW50UHJlZml4KSB7XHJcbiAgICAgICAgbWFya2Rvd24gKz1cclxuICAgICAgICAgIGNvbnRlbnRcclxuICAgICAgICAgICAgLnNwbGl0KFwiXFxuXCIpXHJcbiAgICAgICAgICAgIC5tYXAobGluZSA9PiAobGluZS50cmltKCkgPyBgJHtjb250ZW50UHJlZml4fSR7bGluZX1gIDogY29udGVudFByZWZpeC50cmltKCkpKVxyXG4gICAgICAgICAgICAuam9pbihgXFxuYCkgKyBcIlxcblxcblwiO1xyXG4gICAgICB9IGVsc2UgaWYgKGNvbnRlbnQuaW5jbHVkZXMoXCJgYGBcIikpIHtcclxuICAgICAgICBjb250ZW50ID0gY29udGVudC5yZXBsYWNlKC8oXFxuKlxccyopYGBgL2csIFwiXFxuXFxuYGBgXCIpLnJlcGxhY2UoL2BgYChcXHMqXFxuKikvZywgXCJgYGBcXG5cXG5cIik7XHJcbiAgICAgICAgbWFya2Rvd24gKz0gY29udGVudC50cmltKCkgKyBcIlxcblxcblwiO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIG1hcmtkb3duICs9XHJcbiAgICAgICAgICBjb250ZW50XHJcbiAgICAgICAgICAgIC5zcGxpdChcIlxcblwiKVxyXG4gICAgICAgICAgICAubWFwKGxpbmUgPT4gKGxpbmUudHJpbSgpID8gbGluZSA6IFwiXCIpKVxyXG4gICAgICAgICAgICAuam9pbihcIlxcblwiKSArIFwiXFxuXFxuXCI7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIG1hcmtkb3duLnRyaW0oKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgZ2V0Q3VycmVudFJvbGVEaXNwbGF5TmFtZSgpOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcblxyXG4gICAgICBjb25zdCByb2xlUGF0aCA9IGFjdGl2ZUNoYXQ/Lm1ldGFkYXRhPy5zZWxlY3RlZFJvbGVQYXRoID8/IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XHJcblxyXG4gICAgICBpZiAocm9sZVBhdGgpIHtcclxuICAgICAgICBjb25zdCBhbGxSb2xlcyA9IGF3YWl0IHRoaXMucGx1Z2luLmxpc3RSb2xlRmlsZXModHJ1ZSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZvdW5kUm9sZSA9IGFsbFJvbGVzLmZpbmQocm9sZSA9PiByb2xlLnBhdGggPT09IHJvbGVQYXRoKTtcclxuXHJcbiAgICAgICAgaWYgKGZvdW5kUm9sZSkge1xyXG4gICAgICAgICAgcmV0dXJuIGZvdW5kUm9sZS5uYW1lO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBjb25zb2xlLndhcm4oYFJvbGUgd2l0aCBwYXRoIFwiJHtyb2xlUGF0aH1cIiBub3QgZm91bmQgaW4gbGlzdFJvbGVGaWxlcyByZXN1bHRzLmApO1xyXG5cclxuICAgICAgICAgIHJldHVybiByb2xlUGF0aC5zcGxpdChcIi9cIikucG9wKCk/LnJlcGxhY2UoXCIubWRcIiwgXCJcIikgfHwgXCJTZWxlY3RlZCBSb2xlXCI7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgZ2V0dGluZyBjdXJyZW50IHJvbGUgZGlzcGxheSBuYW1lOlwiLCBlcnJvcik7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIFwiTm9uZVwiO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVSb2xlRGlzcGxheUNsaWNrID0gYXN5bmMgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICBjb25zdCBtZW51ID0gbmV3IE1lbnUoKTtcclxuICAgIGxldCBpdGVtc0FkZGVkID0gZmFsc2U7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3Qgcm9sZXMgPSBhd2FpdCB0aGlzLnBsdWdpbi5saXN0Um9sZUZpbGVzKHRydWUpO1xyXG4gICAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgICAgY29uc3QgY3VycmVudFJvbGVQYXRoID0gYWN0aXZlQ2hhdD8ubWV0YWRhdGE/LnNlbGVjdGVkUm9sZVBhdGggPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aDtcclxuXHJcbiAgICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IHtcclxuICAgICAgICBpdGVtXHJcbiAgICAgICAgICAuc2V0VGl0bGUoXCJOb25lXCIpXHJcbiAgICAgICAgICAuc2V0SWNvbighY3VycmVudFJvbGVQYXRoID8gXCJjaGVja1wiIDogXCJzbGFzaFwiKVxyXG4gICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBuZXdSb2xlUGF0aCA9IFwiXCI7XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50Um9sZVBhdGggIT09IG5ld1JvbGVQYXRoKSB7XHJcbiAgICAgICAgICAgICAgaWYgKGFjdGl2ZUNoYXQpIHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnVwZGF0ZUFjdGl2ZUNoYXRNZXRhZGF0YSh7XHJcbiAgICAgICAgICAgICAgICAgIHNlbGVjdGVkUm9sZVBhdGg6IG5ld1JvbGVQYXRoLFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGggPSBuZXdSb2xlUGF0aDtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJyb2xlLWNoYW5nZWRcIiwgXCJOb25lXCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ucHJvbXB0U2VydmljZT8uY2xlYXJSb2xlQ2FjaGU/LigpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgaXRlbXNBZGRlZCA9IHRydWU7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgaWYgKHJvbGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBtZW51LmFkZFNlcGFyYXRvcigpO1xyXG4gICAgICAgIGl0ZW1zQWRkZWQgPSB0cnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByb2xlcy5mb3JFYWNoKHJvbGVJbmZvID0+IHtcclxuICAgICAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PiB7XHJcbiAgICAgICAgICBpdGVtXHJcbiAgICAgICAgICAgIC5zZXRUaXRsZShyb2xlSW5mby5uYW1lKVxyXG4gICAgICAgICAgICAuc2V0SWNvbihyb2xlSW5mby5wYXRoID09PSBjdXJyZW50Um9sZVBhdGggPyBcImNoZWNrXCIgOiByb2xlSW5mby5pc0N1c3RvbSA/IFwidXNlclwiIDogXCJmaWxlLXRleHRcIilcclxuICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgIGNvbnN0IG5ld1JvbGVQYXRoID0gcm9sZUluZm8ucGF0aDtcclxuICAgICAgICAgICAgICBpZiAoY3VycmVudFJvbGVQYXRoICE9PSBuZXdSb2xlUGF0aCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGFjdGl2ZUNoYXQpIHtcclxuICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIudXBkYXRlQWN0aXZlQ2hhdE1ldGFkYXRhKHtcclxuICAgICAgICAgICAgICAgICAgICBzZWxlY3RlZFJvbGVQYXRoOiBuZXdSb2xlUGF0aCxcclxuICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoID0gbmV3Um9sZVBhdGg7XHJcbiAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwicm9sZS1jaGFuZ2VkXCIsIHJvbGVJbmZvLm5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5wcm9tcHRTZXJ2aWNlPy5jbGVhclJvbGVDYWNoZT8uKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIGl0ZW1zQWRkZWQgPSB0cnVlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBsb2FkaW5nIHJvbGVzIGZvciByb2xlIHNlbGVjdGlvbiBtZW51OlwiLCBlcnJvcik7XHJcblxyXG4gICAgICBpZiAoIWl0ZW1zQWRkZWQpIHtcclxuICAgICAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PiBpdGVtLnNldFRpdGxlKFwiRXJyb3IgbG9hZGluZyByb2xlc1wiKS5zZXREaXNhYmxlZCh0cnVlKSk7XHJcbiAgICAgICAgaXRlbXNBZGRlZCA9IHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBsb2FkIHJvbGVzLlwiKTtcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIGlmIChpdGVtc0FkZGVkKSB7XHJcbiAgICAgICAgbWVudS5zaG93QXRNb3VzZUV2ZW50KGV2ZW50KTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlVGVtcGVyYXR1cmVDbGljayA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdCgpO1xyXG5cclxuICAgIGlmICghYWN0aXZlQ2hhdCkge1xyXG4gICAgICBuZXcgTm90aWNlKFwiU2VsZWN0IG9yIGNyZWF0ZSBhIGNoYXQgdG8gY2hhbmdlIHRlbXBlcmF0dXJlLlwiKTtcclxuXHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjdXJyZW50VGVtcCA9IGFjdGl2ZUNoYXQubWV0YWRhdGEudGVtcGVyYXR1cmUgPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGVyYXR1cmU7XHJcbiAgICBjb25zdCBjdXJyZW50VGVtcFN0cmluZyA9IGN1cnJlbnRUZW1wICE9PSBudWxsICYmIGN1cnJlbnRUZW1wICE9PSB1bmRlZmluZWQgPyBTdHJpbmcoY3VycmVudFRlbXApIDogXCJcIjtcclxuXHJcbiAgICBuZXcgUHJvbXB0TW9kYWwoXHJcbiAgICAgIHRoaXMuYXBwLFxyXG4gICAgICBcIlNldCBUZW1wZXJhdHVyZVwiLFxyXG4gICAgICBgRW50ZXIgbmV3IHRlbXBlcmF0dXJlIChlLmcuLCAwLjcpLiBIaWdoZXIgdmFsdWVzID0gbW9yZSBjcmVhdGl2ZSwgbG93ZXIgPSBtb3JlIGZvY3VzZWQuYCxcclxuICAgICAgY3VycmVudFRlbXBTdHJpbmcsXHJcbiAgICAgIGFzeW5jIG5ld1ZhbHVlID0+IHtcclxuICAgICAgICBpZiAobmV3VmFsdWUgPT09IG51bGwgfHwgbmV3VmFsdWUudHJpbSgpID09PSBcIlwiKSB7XHJcbiAgICAgICAgICBuZXcgTm90aWNlKFwiVGVtcGVyYXR1cmUgY2hhbmdlIGNhbmNlbGxlZC5cIik7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBuZXdUZW1wID0gcGFyc2VGbG9hdChuZXdWYWx1ZS50cmltKCkpO1xyXG5cclxuICAgICAgICBpZiAoaXNOYU4obmV3VGVtcCkgfHwgbmV3VGVtcCA8IDAgfHwgbmV3VGVtcCA+IDIuMCkge1xyXG4gICAgICAgICAgbmV3IE5vdGljZShcIkludmFsaWQgdGVtcGVyYXR1cmUuIFBsZWFzZSBlbnRlciBhIG51bWJlciBiZXR3ZWVuIDAuMCBhbmQgMi4wLlwiLCA0MDAwKTtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci51cGRhdGVBY3RpdmVDaGF0TWV0YWRhdGEoe1xyXG4gICAgICAgICAgICB0ZW1wZXJhdHVyZTogbmV3VGVtcCxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgdGhpcy51cGRhdGVUZW1wZXJhdHVyZUluZGljYXRvcihuZXdUZW1wKTtcclxuICAgICAgICAgIG5ldyBOb3RpY2UoYFRlbXBlcmF0dXJlIHNldCB0byAke25ld1RlbXB9IGZvciBjaGF0IFwiJHthY3RpdmVDaGF0Lm1ldGFkYXRhLm5hbWV9XCIuYCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBzZXR0aW5nIHRlbXBlcmF0dXJlLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICkub3BlbigpO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgdXBkYXRlVGVtcGVyYXR1cmVJbmRpY2F0b3IodGVtcGVyYXR1cmU6IG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy50ZW1wZXJhdHVyZUluZGljYXRvckVsKSByZXR1cm47XHJcblxyXG4gICAgY29uc3QgdGVtcFZhbHVlID0gdGVtcGVyYXR1cmUgPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGVyYXR1cmU7XHJcblxyXG4gICAgY29uc3QgZW1vamkgPSB0aGlzLmdldFRlbXBlcmF0dXJlRW1vamkodGVtcFZhbHVlKTtcclxuICAgIHRoaXMudGVtcGVyYXR1cmVJbmRpY2F0b3JFbC5zZXRUZXh0KGVtb2ppKTtcclxuICAgIHRoaXMudGVtcGVyYXR1cmVJbmRpY2F0b3JFbC50aXRsZSA9IGBUZW1wZXJhdHVyZTogJHt0ZW1wVmFsdWUudG9GaXhlZCgxKX0uIENsaWNrIHRvIGNoYW5nZS5gO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRUZW1wZXJhdHVyZUVtb2ppKHRlbXBlcmF0dXJlOiBudW1iZXIpOiBzdHJpbmcge1xyXG4gICAgaWYgKHRlbXBlcmF0dXJlIDw9IDAuNCkge1xyXG4gICAgICByZXR1cm4gXCLwn6eKXCI7XHJcbiAgICB9IGVsc2UgaWYgKHRlbXBlcmF0dXJlID4gMC40ICYmIHRlbXBlcmF0dXJlIDw9IDAuNikge1xyXG4gICAgICByZXR1cm4gXCLwn5mCXCI7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gXCLwn6SqXCI7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHVwZGF0ZVRvZ2dsZVZpZXdMb2NhdGlvbk9wdGlvbigpOiB2b2lkIHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8udXBkYXRlVG9nZ2xlVmlld0xvY2F0aW9uT3B0aW9uKCk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgaGFuZGxlVG9nZ2xlVmlld0xvY2F0aW9uQ2xpY2sgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXI/LmNsb3NlTWVudSgpO1xyXG4gICAgY29uc3QgY3VycmVudFNldHRpbmcgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuQ2hhdEluVGFiO1xyXG4gICAgY29uc3QgbmV3U2V0dGluZyA9ICFjdXJyZW50U2V0dGluZztcclxuXHJcbiAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuQ2hhdEluVGFiID0gbmV3U2V0dGluZztcclxuICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cclxuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5kZXRhY2hMZWF2ZXNPZlR5cGUoVklFV19UWVBFX09MTEFNQV9QRVJTT05BUyk7XHJcblxyXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgIHRoaXMucGx1Z2luLmFjdGl2YXRlVmlldygpO1xyXG4gICAgfSwgNTApO1xyXG4gIH07XHJcblxyXG4gIHB1YmxpYyBhc3luYyBmaW5kUm9sZU5hbWVCeVBhdGgocm9sZVBhdGg6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gICAgaWYgKCFyb2xlUGF0aCkge1xyXG4gICAgICByZXR1cm4gXCJOb25lXCI7XHJcbiAgICB9XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBhbGxSb2xlcyA9IGF3YWl0IHRoaXMucGx1Z2luLmxpc3RSb2xlRmlsZXModHJ1ZSk7XHJcbiAgICAgIGNvbnN0IGZvdW5kUm9sZSA9IGFsbFJvbGVzLmZpbmQocm9sZSA9PiByb2xlLnBhdGggPT09IHJvbGVQYXRoKTtcclxuICAgICAgaWYgKGZvdW5kUm9sZSkge1xyXG4gICAgICAgIHJldHVybiBmb3VuZFJvbGUubmFtZTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zdCBmaWxlTmFtZSA9IHJvbGVQYXRoLnNwbGl0KFwiL1wiKS5wb3AoKT8ucmVwbGFjZShcIi5tZFwiLCBcIlwiKTtcclxuICAgICAgICByZXR1cm4gZmlsZU5hbWUgfHwgXCJVbmtub3duIFJvbGVcIjtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgcmV0dXJuIFwiRXJyb3JcIjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgdXBkYXRlQ2hhdFBhbmVsTGlzdCA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuY2hhdFBhbmVsTGlzdEVsO1xyXG4gICAgaWYgKCFjb250YWluZXIgfHwgIXRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5jaGF0UGFuZWxIZWFkZXJFbD8uZ2V0QXR0cmlidXRlKFwiZGF0YS1jb2xsYXBzZWRcIikgPT09IFwidHJ1ZVwiKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjdXJyZW50U2Nyb2xsVG9wID0gY29udGFpbmVyLnNjcm9sbFRvcDtcclxuICAgIGNvbnRhaW5lci5lbXB0eSgpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNoYXRzOiBDaGF0TWV0YWRhdGFbXSA9IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmxpc3RBdmFpbGFibGVDaGF0cygpIHx8IFtdO1xyXG4gICAgICBjb25zdCBjdXJyZW50QWN0aXZlSWQgPSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRBY3RpdmVDaGF0SWQoKTtcclxuXHJcbiAgICAgIGlmIChjaGF0cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcIm1lbnUtaW5mby10ZXh0XCIsIHRleHQ6IFwiTm8gc2F2ZWQgY2hhdHMgeWV0LlwiIH0pO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNoYXRzLmZvckVhY2goY2hhdE1ldGEgPT4ge1xyXG4gICAgICAgICAgY29uc3QgY2hhdE9wdGlvbkVsID0gY29udGFpbmVyLmNyZWF0ZURpdih7XHJcbiAgICAgICAgICAgIGNsczogW0NTU19ST0xFX1BBTkVMX0lURU0sIENTU19DTEFTU19NRU5VX09QVElPTiwgQ1NTX0NMQVNTX0NIQVRfTElTVF9JVEVNXSxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgY29uc3QgaWNvblNwYW4gPSBjaGF0T3B0aW9uRWwuY3JlYXRlU3Bhbih7IGNsczogW0NTU19ST0xFX1BBTkVMX0lURU1fSUNPTiwgXCJtZW51LW9wdGlvbi1pY29uXCJdIH0pO1xyXG4gICAgICAgICAgaWYgKGNoYXRNZXRhLmlkID09PSBjdXJyZW50QWN0aXZlSWQpIHtcclxuICAgICAgICAgICAgc2V0SWNvbihpY29uU3BhbiwgXCJjaGVja1wiKTtcclxuICAgICAgICAgICAgY2hhdE9wdGlvbkVsLmFkZENsYXNzKENTU19ST0xFX1BBTkVMX0lURU1fQUNUSVZFKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHNldEljb24oaWNvblNwYW4sIFwibWVzc2FnZS1zcXVhcmVcIik7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgY29uc3QgdGV4dFdyYXBwZXIgPSBjaGF0T3B0aW9uRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9sbGFtYS1jaGF0LWl0ZW0tdGV4dC13cmFwcGVyXCIgfSk7XHJcbiAgICAgICAgICB0ZXh0V3JhcHBlci5jcmVhdGVEaXYoeyBjbHM6IFwiY2hhdC1wYW5lbC1pdGVtLW5hbWVcIiwgdGV4dDogY2hhdE1ldGEubmFtZSB9KTtcclxuXHJcbiAgICAgICAgICBjb25zdCBsYXN0TW9kaWZpZWREYXRlID0gbmV3IERhdGUoY2hhdE1ldGEubGFzdE1vZGlmaWVkKTtcclxuXHJcbiAgICAgICAgICBjb25zdCBkYXRlVGV4dCA9ICFpc05hTihsYXN0TW9kaWZpZWREYXRlLmdldFRpbWUoKSlcclxuICAgICAgICAgICAgPyB0aGlzLmZvcm1hdFJlbGF0aXZlRGF0ZShsYXN0TW9kaWZpZWREYXRlKVxyXG4gICAgICAgICAgICA6IFwiSW52YWxpZCBkYXRlXCI7XHJcbiAgICAgICAgICBpZiAoZGF0ZVRleHQgPT09IFwiSW52YWxpZCBkYXRlXCIpIHtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHRleHRXcmFwcGVyLmNyZWF0ZURpdih7IGNsczogXCJjaGF0LXBhbmVsLWl0ZW0tZGF0ZVwiLCB0ZXh0OiBkYXRlVGV4dCB9KTtcclxuXHJcbiAgICAgICAgICBjb25zdCBvcHRpb25zQnRuID0gY2hhdE9wdGlvbkVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcclxuICAgICAgICAgICAgY2xzOiBbQ1NTX0NIQVRfSVRFTV9PUFRJT05TLCBcImNsaWNrYWJsZS1pY29uXCJdLFxyXG4gICAgICAgICAgICBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIkNoYXQgb3B0aW9uc1wiLCB0aXRsZTogXCJNb3JlIG9wdGlvbnNcIiB9LFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBzZXRJY29uKG9wdGlvbnNCdG4sIFwibHVjaWRlLW1vcmUtaG9yaXpvbnRhbFwiKTtcclxuXHJcbiAgICAgICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoY2hhdE9wdGlvbkVsLCBcImNsaWNrXCIsIGFzeW5jIGUgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIShlLnRhcmdldCBpbnN0YW5jZW9mIEVsZW1lbnQgJiYgZS50YXJnZXQuY2xvc2VzdChgLiR7Q1NTX0NIQVRfSVRFTV9PUFRJT05TfWApKSkge1xyXG4gICAgICAgICAgICAgIGlmIChjaGF0TWV0YS5pZCAhPT0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXRJZCgpKSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5zZXRBY3RpdmVDaGF0KGNoYXRNZXRhLmlkKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KG9wdGlvbnNCdG4sIFwiY2xpY2tcIiwgZSA9PiB7XHJcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgICAgIHRoaXMuc2hvd0NoYXRDb250ZXh0TWVudShlLCBjaGF0TWV0YSk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudChjaGF0T3B0aW9uRWwsIFwiY29udGV4dG1lbnVcIiwgZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuc2hvd0NoYXRDb250ZXh0TWVudShlLCBjaGF0TWV0YSk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29udGFpbmVyLmVtcHR5KCk7XHJcbiAgICAgIGNvbnRhaW5lci5jcmVhdGVEaXYoeyB0ZXh0OiBcIkVycm9yIGxvYWRpbmcgY2hhdHMuXCIsIGNsczogXCJtZW51LWVycm9yLXRleHRcIiB9KTtcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgaWYgKGNvbnRhaW5lciAmJiBjb250YWluZXIuaXNDb25uZWN0ZWQpIHtcclxuICAgICAgICAgIGNvbnRhaW5lci5zY3JvbGxUb3AgPSBjdXJyZW50U2Nyb2xsVG9wO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBzaG93Q2hhdENvbnRleHRNZW51KGV2ZW50OiBNb3VzZUV2ZW50LCBjaGF0TWV0YTogQ2hhdE1ldGFkYXRhKTogdm9pZCB7XHJcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgY29uc3QgbWVudSA9IG5ldyBNZW51KCk7XHJcblxyXG4gICAgbWVudS5hZGRJdGVtKGl0ZW0gPT5cclxuICAgICAgaXRlbVxyXG4gICAgICAgIC5zZXRUaXRsZShcIkNsb25lIENoYXRcIilcclxuICAgICAgICAuc2V0SWNvbihcImx1Y2lkZS1jb3B5LXBsdXNcIilcclxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLmhhbmRsZUNvbnRleHRNZW51Q2xvbmUoY2hhdE1ldGEuaWQpKVxyXG4gICAgKTtcclxuXHJcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxyXG4gICAgICBpdGVtXHJcbiAgICAgICAgLnNldFRpdGxlKFwiUmVuYW1lIENoYXRcIilcclxuICAgICAgICAuc2V0SWNvbihcImx1Y2lkZS1wZW5jaWxcIilcclxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLmhhbmRsZUNvbnRleHRNZW51UmVuYW1lKGNoYXRNZXRhLmlkLCBjaGF0TWV0YS5uYW1lKSlcclxuICAgICk7XHJcblxyXG4gICAgbWVudS5hZGRJdGVtKGl0ZW0gPT5cclxuICAgICAgaXRlbVxyXG4gICAgICAgIC5zZXRUaXRsZShcIkV4cG9ydCB0byBOb3RlXCIpXHJcbiAgICAgICAgLnNldEljb24oXCJsdWNpZGUtZG93bmxvYWRcIilcclxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLmV4cG9ydFNwZWNpZmljQ2hhdChjaGF0TWV0YS5pZCkpXHJcbiAgICApO1xyXG5cclxuICAgIG1lbnUuYWRkU2VwYXJhdG9yKCk7XHJcblxyXG4gICAgbWVudS5hZGRJdGVtKGl0ZW0gPT4ge1xyXG4gICAgICBpdGVtXHJcbiAgICAgICAgLnNldFRpdGxlKFwiQ2xlYXIgTWVzc2FnZXNcIilcclxuICAgICAgICAuc2V0SWNvbihcImx1Y2lkZS10cmFzaFwiKVxyXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuaGFuZGxlQ29udGV4dE1lbnVDbGVhcihjaGF0TWV0YS5pZCwgY2hhdE1ldGEubmFtZSkpO1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIChpdGVtIGFzIGFueSkuZWwuYWRkQ2xhc3MoXCJkYW5nZXItb3B0aW9uXCIpO1xyXG4gICAgICB9IGNhdGNoIChlKSB7fVxyXG4gICAgfSk7XHJcblxyXG4gICAgbWVudS5hZGRJdGVtKGl0ZW0gPT4ge1xyXG4gICAgICBpdGVtXHJcbiAgICAgICAgLnNldFRpdGxlKFwiRGVsZXRlIENoYXRcIilcclxuICAgICAgICAuc2V0SWNvbihcImx1Y2lkZS10cmFzaC0yXCIpXHJcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5oYW5kbGVDb250ZXh0TWVudURlbGV0ZShjaGF0TWV0YS5pZCwgY2hhdE1ldGEubmFtZSkpO1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIChpdGVtIGFzIGFueSkuZWwuYWRkQ2xhc3MoXCJkYW5nZXItb3B0aW9uXCIpO1xyXG4gICAgICB9IGNhdGNoIChlKSB7fVxyXG4gICAgfSk7XHJcblxyXG4gICAgbWVudS5zaG93QXRNb3VzZUV2ZW50KGV2ZW50KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlQ29udGV4dE1lbnVDbG9uZShjaGF0SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgY2xvbmluZ05vdGljZSA9IG5ldyBOb3RpY2UoXCJDbG9uaW5nIGNoYXQuLi5cIiwgMCk7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjbG9uZWRDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2xvbmVDaGF0KGNoYXRJZCk7XHJcbiAgICAgIGlmIChjbG9uZWRDaGF0KSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShgQ2hhdCBjbG9uZWQgYXMgXCIke2Nsb25lZENoYXQubWV0YWRhdGEubmFtZX1cIiBhbmQgYWN0aXZhdGVkLmApO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBuZXcgTm90aWNlKFwiRXJyb3IgY2xvbmluZyBjaGF0LlwiKTtcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIGNsb25pbmdOb3RpY2UuaGlkZSgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBleHBvcnRTcGVjaWZpY0NoYXQoY2hhdElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IGV4cG9ydGluZ05vdGljZSA9IG5ldyBOb3RpY2UoYEV4cG9ydGluZyBjaGF0Li4uYCwgMCk7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0Q2hhdChjaGF0SWQpO1xyXG4gICAgICBpZiAoIWNoYXQgfHwgY2hhdC5tZXNzYWdlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiQ2hhdCBpcyBlbXB0eSBvciBub3QgZm91bmQsIG5vdGhpbmcgdG8gZXhwb3J0LlwiKTtcclxuICAgICAgICBleHBvcnRpbmdOb3RpY2UuaGlkZSgpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgbWFya2Rvd25Db250ZW50ID0gdGhpcy5mb3JtYXRDaGF0VG9NYXJrZG93bihjaGF0Lm1lc3NhZ2VzKTtcclxuICAgICAgY29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1s6Ll0vZywgXCItXCIpO1xyXG4gICAgICBjb25zdCBzYWZlTmFtZSA9IGNoYXQubWV0YWRhdGEubmFtZS5yZXBsYWNlKC9bXFxcXC8/OipcIjw+fF0vZywgXCItXCIpO1xyXG4gICAgICBjb25zdCBmaWxlbmFtZSA9IGBvbGxhbWEtY2hhdC0ke3NhZmVOYW1lfS0ke3RpbWVzdGFtcH0ubWRgO1xyXG5cclxuICAgICAgbGV0IHRhcmdldEZvbGRlclBhdGggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jaGF0RXhwb3J0Rm9sZGVyUGF0aD8udHJpbSgpO1xyXG4gICAgICBsZXQgdGFyZ2V0Rm9sZGVyOiBURm9sZGVyIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgICBpZiAodGFyZ2V0Rm9sZGVyUGF0aCkge1xyXG4gICAgICAgIHRhcmdldEZvbGRlclBhdGggPSBub3JtYWxpemVQYXRoKHRhcmdldEZvbGRlclBhdGgpO1xyXG4gICAgICAgIGNvbnN0IGFic3RyYWN0RmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh0YXJnZXRGb2xkZXJQYXRoKTtcclxuICAgICAgICBpZiAoIWFic3RyYWN0RmlsZSkge1xyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlRm9sZGVyKHRhcmdldEZvbGRlclBhdGgpO1xyXG4gICAgICAgICAgICB0YXJnZXRGb2xkZXIgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgodGFyZ2V0Rm9sZGVyUGF0aCkgYXMgVEZvbGRlcjtcclxuICAgICAgICAgICAgaWYgKHRhcmdldEZvbGRlcikgbmV3IE5vdGljZShgQ3JlYXRlZCBleHBvcnQgZm9sZGVyOiAke3RhcmdldEZvbGRlclBhdGh9YCk7XHJcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgY3JlYXRpbmcgZXhwb3J0IGZvbGRlci4gU2F2aW5nIHRvIHZhdWx0IHJvb3QuYCk7XHJcbiAgICAgICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldFJvb3QoKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKGFic3RyYWN0RmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIpIHtcclxuICAgICAgICAgIHRhcmdldEZvbGRlciA9IGFic3RyYWN0RmlsZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgbmV3IE5vdGljZShgRXJyb3I6IEV4cG9ydCBwYXRoIGlzIG5vdCBhIGZvbGRlci4gU2F2aW5nIHRvIHZhdWx0IHJvb3QuYCk7XHJcbiAgICAgICAgICB0YXJnZXRGb2xkZXIgPSB0aGlzLmFwcC52YXVsdC5nZXRSb290KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldFJvb3QoKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCF0YXJnZXRGb2xkZXIpIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3IgZGV0ZXJtaW5pbmcgZXhwb3J0IGZvbGRlci5cIik7XHJcbiAgICAgICAgZXhwb3J0aW5nTm90aWNlLmhpZGUoKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGZpbGVQYXRoID0gbm9ybWFsaXplUGF0aChgJHt0YXJnZXRGb2xkZXIucGF0aH0vJHtmaWxlbmFtZX1gKTtcclxuICAgICAgY29uc3QgZXhpc3RpbmdGaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGVQYXRoKTtcclxuICAgICAgaWYgKGV4aXN0aW5nRmlsZSkge1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBmaWxlID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKGZpbGVQYXRoLCBtYXJrZG93bkNvbnRlbnQpO1xyXG4gICAgICBuZXcgTm90aWNlKGBDaGF0IGV4cG9ydGVkIHRvICR7ZmlsZS5wYXRofWApO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgbmV3IE5vdGljZShcIkFuIGVycm9yIG9jY3VycmVkIGR1cmluZyBjaGF0IGV4cG9ydC5cIik7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBleHBvcnRpbmdOb3RpY2UuaGlkZSgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVDb250ZXh0TWVudUNsZWFyKGNoYXRJZDogc3RyaW5nLCBjaGF0TmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBuZXcgQ29uZmlybU1vZGFsKFxyXG4gICAgICB0aGlzLmFwcCxcclxuICAgICAgXCJDb25maXJtIENsZWFyIE1lc3NhZ2VzXCIsXHJcbiAgICAgIGBBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gY2xlYXIgYWxsIG1lc3NhZ2VzIGluIGNoYXQgXCIke2NoYXROYW1lfVwiP1xcblRoaXMgYWN0aW9uIGNhbm5vdCBiZSB1bmRvbmUuYCxcclxuICAgICAgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGNsZWFyaW5nTm90aWNlID0gbmV3IE5vdGljZShcIkNsZWFyaW5nIG1lc3NhZ2VzLi4uXCIsIDApO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2xlYXJDaGF0TWVzc2FnZXNCeUlkKGNoYXRJZCk7XHJcblxyXG4gICAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShgTWVzc2FnZXMgY2xlYXJlZCBmb3IgY2hhdCBcIiR7Y2hhdE5hbWV9XCIuYCk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKGBGYWlsZWQgdG8gY2xlYXIgbWVzc2FnZXMgZm9yIGNoYXQgXCIke2NoYXROYW1lfVwiLmApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3IgY2xlYXJpbmcgbWVzc2FnZXMuXCIpO1xyXG4gICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICBjbGVhcmluZ05vdGljZS5oaWRlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICApLm9wZW4oKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlQ29udGV4dE1lbnVEZWxldGUoY2hhdElkOiBzdHJpbmcsIGNoYXROYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIG5ldyBDb25maXJtTW9kYWwoXHJcbiAgICAgIHRoaXMuYXBwLFxyXG4gICAgICBcIkNvbmZpcm0gRGVsZXRlIENoYXRcIixcclxuICAgICAgYEFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgY2hhdCBcIiR7Y2hhdE5hbWV9XCI/XFxuVGhpcyBhY3Rpb24gY2Fubm90IGJlIHVuZG9uZS5gLFxyXG4gICAgICBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZGVsZXRpbmdOb3RpY2UgPSBuZXcgTm90aWNlKFwiRGVsZXRpbmcgY2hhdC4uLlwiLCAwKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgY29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmRlbGV0ZUNoYXQoY2hhdElkKTtcclxuICAgICAgICAgIGlmIChzdWNjZXNzKSB7XHJcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYENoYXQgXCIke2NoYXROYW1lfVwiIGRlbGV0ZWQuYCk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3IgZGVsZXRpbmcgY2hhdC5cIik7XHJcbiAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgIGRlbGV0aW5nTm90aWNlLmhpZGUoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICkub3BlbigpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBpc0NoYXRTY3JvbGxlZFVwKCk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKCF0aGlzLmNoYXRDb250YWluZXIpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBjb25zdCBzY3JvbGxhYmxlRGlzdGFuY2UgPSB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsSGVpZ2h0IC0gdGhpcy5jaGF0Q29udGFpbmVyLmNsaWVudEhlaWdodDtcclxuICAgIGlmIChzY3JvbGxhYmxlRGlzdGFuY2UgPD0gMCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgIGNvbnN0IGRpc3RhbmNlRnJvbUJvdHRvbSA9IHNjcm9sbGFibGVEaXN0YW5jZSAtIHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxUb3A7XHJcbiAgICByZXR1cm4gZGlzdGFuY2VGcm9tQm90dG9tID49IFNDUk9MTF9USFJFU0hPTEQ7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHVwZGF0ZVNjcm9sbFN0YXRlQW5kSW5kaWNhdG9ycygpOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy5jaGF0Q29udGFpbmVyKSByZXR1cm47XHJcblxyXG4gICAgY29uc3Qgd2FzU2Nyb2xsZWRVcCA9IHRoaXMudXNlclNjcm9sbGVkVXA7XHJcbiAgICB0aGlzLnVzZXJTY3JvbGxlZFVwID0gdGhpcy5pc0NoYXRTY3JvbGxlZFVwKCk7XHJcblxyXG4gICAgdGhpcy5zY3JvbGxUb0JvdHRvbUJ1dHRvbj8uY2xhc3NMaXN0LnRvZ2dsZShDU1NfQ0xBU1NfVklTSUJMRSwgdGhpcy51c2VyU2Nyb2xsZWRVcCk7XHJcblxyXG4gICAgaWYgKHdhc1Njcm9sbGVkVXAgJiYgIXRoaXMudXNlclNjcm9sbGVkVXApIHtcclxuICAgICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsPy5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHB1YmxpYyBjaGVja01lc3NhZ2VGb3JDb2xsYXBzaW5nKG1lc3NhZ2VFbE9yR3JvdXBFbDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICAgIGNvbnN0IG1lc3NhZ2VHcm91cEVsID0gbWVzc2FnZUVsT3JHcm91cEVsLmNsYXNzTGlzdC5jb250YWlucyhDU1NfQ0xBU1NFUy5NRVNTQUdFX0dST1VQKVxyXG4gICAgICA/IG1lc3NhZ2VFbE9yR3JvdXBFbFxyXG4gICAgICA6IG1lc3NhZ2VFbE9yR3JvdXBFbC5jbG9zZXN0PEhUTUxFbGVtZW50PihgLiR7Q1NTX0NMQVNTRVMuTUVTU0FHRV9HUk9VUH1gKTtcclxuXHJcbiAgICBpZiAoIW1lc3NhZ2VHcm91cEVsKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjb250ZW50Q29sbGFwc2libGUgPSBtZXNzYWdlR3JvdXBFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihgLiR7Q1NTX0NMQVNTRVMuQ09OVEVOVF9DT0xMQVBTSUJMRX1gKTtcclxuXHJcbiAgICBjb25zdCBtZXNzYWdlRWwgPSBtZXNzYWdlR3JvdXBFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihgLiR7Q1NTX0NMQVNTRVMuTUVTU0FHRX1gKTtcclxuXHJcbiAgICBpZiAoIWNvbnRlbnRDb2xsYXBzaWJsZSB8fCAhbWVzc2FnZUVsKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBtYXhIID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MubWF4TWVzc2FnZUhlaWdodDtcclxuXHJcbiAgICBjb25zdCBpc1N0cmVhbWluZ05vdyA9XHJcbiAgICAgIHRoaXMuaXNQcm9jZXNzaW5nICYmXHJcbiAgICAgIG1lc3NhZ2VHcm91cEVsLmNsYXNzTGlzdC5jb250YWlucyhcInBsYWNlaG9sZGVyXCIpICYmXHJcbiAgICAgIG1lc3NhZ2VHcm91cEVsLmhhc0F0dHJpYnV0ZShcImRhdGEtcGxhY2Vob2xkZXItdGltZXN0YW1wXCIpICYmXHJcbiAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5jbGFzc0xpc3QuY29udGFpbnMoXCJzdHJlYW1pbmctdGV4dFwiKTtcclxuXHJcbiAgICBpZiAoaXNTdHJlYW1pbmdOb3cpIHtcclxuICAgICAgY29uc3QgZXhpc3RpbmdCdXR0b24gPSBtZXNzYWdlRWwucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oYC4ke0NTU19DTEFTU0VTLlNIT1dfTU9SRV9CVVRUT059YCk7XHJcbiAgICAgIGV4aXN0aW5nQnV0dG9uPy5yZW1vdmUoKTtcclxuICAgICAgY29udGVudENvbGxhcHNpYmxlLnN0eWxlLm1heEhlaWdodCA9IFwiXCI7XHJcbiAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19DT05URU5UX0NPTExBUFNFRCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAobWF4SCA8PSAwKSB7XHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nQnV0dG9uID0gbWVzc2FnZUVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KGAuJHtDU1NfQ0xBU1NFUy5TSE9XX01PUkVfQlVUVE9OfWApO1xyXG4gICAgICBleGlzdGluZ0J1dHRvbj8ucmVtb3ZlKCk7XHJcbiAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5zdHlsZS5tYXhIZWlnaHQgPSBcIlwiO1xyXG4gICAgICBjb250ZW50Q29sbGFwc2libGUuY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NfQ09OVEVOVF9DT0xMQVBTRUQpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcclxuICAgICAgaWYgKFxyXG4gICAgICAgICFjb250ZW50Q29sbGFwc2libGUgfHxcclxuICAgICAgICAhY29udGVudENvbGxhcHNpYmxlLmlzQ29ubmVjdGVkIHx8XHJcbiAgICAgICAgIW1lc3NhZ2VHcm91cEVsLmlzQ29ubmVjdGVkIHx8XHJcbiAgICAgICAgIW1lc3NhZ2VFbC5pc0Nvbm5lY3RlZFxyXG4gICAgICApXHJcbiAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgbGV0IGV4aXN0aW5nQnV0dG9uID0gbWVzc2FnZUVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KGAuJHtDU1NfQ0xBU1NFUy5TSE9XX01PUkVfQlVUVE9OfWApO1xyXG5cclxuICAgICAgY29uc3QgcHJldmlvdXNNYXhIZWlnaHRTdHlsZSA9IGNvbnRlbnRDb2xsYXBzaWJsZS5zdHlsZS5tYXhIZWlnaHQ7XHJcbiAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5zdHlsZS5tYXhIZWlnaHQgPSBcIlwiO1xyXG4gICAgICBjb25zdCBzY3JvbGxIZWlnaHQgPSBjb250ZW50Q29sbGFwc2libGUuc2Nyb2xsSGVpZ2h0O1xyXG5cclxuICAgICAgaWYgKGV4aXN0aW5nQnV0dG9uICYmIHByZXZpb3VzTWF4SGVpZ2h0U3R5bGUgJiYgIWV4aXN0aW5nQnV0dG9uLmNsYXNzTGlzdC5jb250YWlucyhcImV4cGxpY2l0bHktZXhwYW5kZWRcIikpIHtcclxuICAgICAgICBjb250ZW50Q29sbGFwc2libGUuc3R5bGUubWF4SGVpZ2h0ID0gcHJldmlvdXNNYXhIZWlnaHRTdHlsZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHNjcm9sbEhlaWdodCA+IG1heEgpIHtcclxuICAgICAgICBpZiAoIWV4aXN0aW5nQnV0dG9uKSB7XHJcbiAgICAgICAgICBleGlzdGluZ0J1dHRvbiA9IG1lc3NhZ2VFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7XHJcbiAgICAgICAgICAgIGNsczogQ1NTX0NMQVNTRVMuU0hPV19NT1JFX0JVVFRPTixcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudChleGlzdGluZ0J1dHRvbiwgXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChjb250ZW50Q29sbGFwc2libGUuY2xhc3NMaXN0LmNvbnRhaW5zKENTU19DTEFTU0VTLkNPTlRFTlRfQ09MTEFQU0VEKSkge1xyXG4gICAgICAgICAgICAgIGV4aXN0aW5nQnV0dG9uIS5jbGFzc0xpc3QuYWRkKFwiZXhwbGljaXRseS1leHBhbmRlZFwiKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICBleGlzdGluZ0J1dHRvbiEuY2xhc3NMaXN0LnJlbW92ZShcImV4cGxpY2l0bHktZXhwYW5kZWRcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy50b2dnbGVNZXNzYWdlQ29sbGFwc2UoY29udGVudENvbGxhcHNpYmxlLCBleGlzdGluZ0J1dHRvbiEpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBjb250ZW50Q29sbGFwc2libGUuc3R5bGUubWF4SGVpZ2h0ID0gYCR7bWF4SH1weGA7XHJcbiAgICAgICAgICBjb250ZW50Q29sbGFwc2libGUuY2xhc3NMaXN0LmFkZChDU1NfQ0xBU1NFUy5DT05URU5UX0NPTExBUFNFRCk7XHJcbiAgICAgICAgICBleGlzdGluZ0J1dHRvbi5zZXRUZXh0KFwiU2hvdyBNb3JlIOKWvFwiKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgaWYgKGNvbnRlbnRDb2xsYXBzaWJsZS5jbGFzc0xpc3QuY29udGFpbnMoQ1NTX0NMQVNTRVMuQ09OVEVOVF9DT0xMQVBTRUQpKSB7XHJcbiAgICAgICAgICAgIGV4aXN0aW5nQnV0dG9uLnNldFRleHQoXCJTaG93IE1vcmUg4pa8XCIpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZXhpc3RpbmdCdXR0b24uc2V0VGV4dChcIlNob3cgTGVzcyDilrJcIik7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGlmIChleGlzdGluZ0J1dHRvbikge1xyXG4gICAgICAgICAgZXhpc3RpbmdCdXR0b24ucmVtb3ZlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5zdHlsZS5tYXhIZWlnaHQgPSBcIlwiO1xyXG4gICAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU0VTLkNPTlRFTlRfQ09MTEFQU0VEKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgYXN5bmMgaGFuZGxlU3VtbWFyaXplQ2xpY2sob3JpZ2luYWxDb250ZW50OiBzdHJpbmcsIGJ1dHRvbkVsOiBIVE1MQnV0dG9uRWxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3Qgc3VtbWFyaXphdGlvbk1vZGVsID0gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VtbWFyaXphdGlvbk1vZGVsTmFtZTtcclxuXHJcbiAgICBpZiAoIXN1bW1hcml6YXRpb25Nb2RlbCkge1xyXG4gICAgICBuZXcgTm90aWNlKFwiUGxlYXNlIHNlbGVjdCBhIHN1bW1hcml6YXRpb24gbW9kZWwgaW4gQUkgRm9yZ2Ugc2V0dGluZ3MgKFByb2R1Y3Rpdml0eSBzZWN0aW9uKS5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgdGV4dFRvU3VtbWFyaXplID0gb3JpZ2luYWxDb250ZW50O1xyXG4gICAgaWYgKFJlbmRlcmVyVXRpbHMuZGV0ZWN0VGhpbmtpbmdUYWdzKFJlbmRlcmVyVXRpbHMuZGVjb2RlSHRtbEVudGl0aWVzKG9yaWdpbmFsQ29udGVudCkpLmhhc1RoaW5raW5nVGFncykge1xyXG4gICAgICB0ZXh0VG9TdW1tYXJpemUgPSBSZW5kZXJlclV0aWxzLmRlY29kZUh0bWxFbnRpdGllcyhvcmlnaW5hbENvbnRlbnQpXHJcbiAgICAgICAgLnJlcGxhY2UoLzx0aGluaz5bXFxzXFxTXSo/PFxcL3RoaW5rPi9nLCBcIlwiKVxyXG4gICAgICAgIC50cmltKCk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCF0ZXh0VG9TdW1tYXJpemUgfHwgdGV4dFRvU3VtbWFyaXplLmxlbmd0aCA8IDUwKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJNZXNzYWdlIGlzIHRvbyBzaG9ydCB0byBzdW1tYXJpemUgbWVhbmluZ2Z1bGx5LlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IG9yaWdpbmFsSWNvbiA9IGJ1dHRvbkVsLnF1ZXJ5U2VsZWN0b3IoXCIuc3ZnLWljb25cIik/LmdldEF0dHJpYnV0ZShcImljb24tbmFtZVwiKSB8fCBcInNjcm9sbC10ZXh0XCI7XHJcbiAgICBzZXRJY29uKGJ1dHRvbkVsLCBcImxvYWRlclwiKTtcclxuICAgIGJ1dHRvbkVsLmRpc2FibGVkID0gdHJ1ZTtcclxuICAgIGNvbnN0IG9yaWdpbmFsVGl0bGUgPSBidXR0b25FbC50aXRsZTtcclxuICAgIGJ1dHRvbkVsLnRpdGxlID0gXCJTdW1tYXJpemluZy4uLlwiO1xyXG4gICAgYnV0dG9uRWwuYWRkQ2xhc3MoQ1NTX0NMQVNTX0RJU0FCTEVEKTtcclxuXHJcbiAgICBidXR0b25FbC5hZGRDbGFzcyhcImJ1dHRvbi1sb2FkaW5nXCIpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHByb21wdCA9IGBQcm92aWRlIGEgY29uY2lzZSBzdW1tYXJ5IG9mIHRoZSBmb2xsb3dpbmcgdGV4dDpcXG5cXG5cIlwiXCJcXG4ke3RleHRUb1N1bW1hcml6ZX1cXG5cIlwiXCJcXG5cXG5TdW1tYXJ5OmA7XHJcbiAgICAgIGNvbnN0IHJlcXVlc3RCb2R5ID0ge1xyXG4gICAgICAgIG1vZGVsOiBzdW1tYXJpemF0aW9uTW9kZWwsXHJcbiAgICAgICAgcHJvbXB0OiBwcm9tcHQsXHJcbiAgICAgICAgc3RyZWFtOiBmYWxzZSxcclxuICAgICAgICB0ZW1wZXJhdHVyZTogMC4yLFxyXG4gICAgICAgIG9wdGlvbnM6IHtcclxuICAgICAgICAgIG51bV9jdHg6IHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnRleHRXaW5kb3cgPiAyMDQ4ID8gMjA0OCA6IHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnRleHRXaW5kb3csXHJcbiAgICAgICAgfSxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlRGF0YTogT2xsYW1hR2VuZXJhdGVSZXNwb25zZSA9IGF3YWl0IHRoaXMucGx1Z2luLm9sbGFtYVNlcnZpY2UuZ2VuZXJhdGVSYXcocmVxdWVzdEJvZHkpO1xyXG5cclxuICAgICAgaWYgKHJlc3BvbnNlRGF0YSAmJiByZXNwb25zZURhdGEucmVzcG9uc2UpIHtcclxuICAgICAgICBuZXcgU3VtbWFyeU1vZGFsKHRoaXMucGx1Z2luLCBcIk1lc3NhZ2UgU3VtbWFyeVwiLCByZXNwb25zZURhdGEucmVzcG9uc2UudHJpbSgpKS5vcGVuKCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUmVjZWl2ZWQgZW1wdHkgcmVzcG9uc2UgZnJvbSBzdW1tYXJpemF0aW9uIG1vZGVsLlwiKTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICBsZXQgdXNlck1lc3NhZ2UgPSBcIlN1bW1hcml6YXRpb24gZmFpbGVkOiBcIjtcclxuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcclxuICAgICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhcIjQwNFwiKSB8fCBlcnJvci5tZXNzYWdlLnRvTG9jYWxlTG93ZXJDYXNlKCkuaW5jbHVkZXMoXCJtb2RlbCBub3QgZm91bmRcIikpIHtcclxuICAgICAgICAgIHVzZXJNZXNzYWdlICs9IGBNb2RlbCAnJHtzdW1tYXJpemF0aW9uTW9kZWx9JyBub3QgZm91bmQuYDtcclxuICAgICAgICB9IGVsc2UgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoXCJjb25uZWN0XCIpIHx8IGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoXCJmZXRjaFwiKSkge1xyXG4gICAgICAgICAgdXNlck1lc3NhZ2UgKz0gXCJDb3VsZCBub3QgY29ubmVjdCB0byBPbGxhbWEgc2VydmVyLlwiO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB1c2VyTWVzc2FnZSArPSBlcnJvci5tZXNzYWdlO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB1c2VyTWVzc2FnZSArPSBcIlVua25vd24gZXJyb3Igb2NjdXJyZWQuXCI7XHJcbiAgICAgIH1cclxuICAgICAgbmV3IE5vdGljZSh1c2VyTWVzc2FnZSwgNjAwMCk7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBzZXRJY29uKGJ1dHRvbkVsLCBvcmlnaW5hbEljb24pO1xyXG4gICAgICBidXR0b25FbC5kaXNhYmxlZCA9IGZhbHNlO1xyXG4gICAgICBidXR0b25FbC50aXRsZSA9IG9yaWdpbmFsVGl0bGU7XHJcbiAgICAgIGJ1dHRvbkVsLnJlbW92ZUNsYXNzKENTU19DTEFTU19ESVNBQkxFRCk7XHJcbiAgICAgIGJ1dHRvbkVsLnJlbW92ZUNsYXNzKFwiYnV0dG9uLWxvYWRpbmdcIik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiDQodGC0LLQvtGA0Y7RlCDQvdC+0LLRgyDQs9GA0YPQv9GDINC00LvRjyDQstGW0LTQvtCx0YDQsNC20LXQvdC90Y8g0L/QvtC80LjQu9C+0Log0LDQsdC+INC+0L3QvtCy0LvRjtGUINGW0YHQvdGD0Y7Rh9GDLlxyXG4gICAqINCi0LXQv9C10YAg0LLQuNC60L7RgNC40YHRgtC+0LLRg9GUIEVycm9yTWVzc2FnZVJlbmRlcmVyINC00LvRjyDRgdGC0LLQvtGA0LXQvdC90Y8g0LLRltC30YPQsNC70YzQvdC+0LPQviDQsdC70L7QutGDLlxyXG4gICAqIEBwYXJhbSBpc0NvbnRpbnVpbmcg0KfQuCDRhtC1INC/0YDQvtC00L7QstC20LXQvdC90Y8g0L/QvtC/0LXRgNC10LTQvdGM0L7RlyDQv9C+0YHQu9GW0LTQvtCy0L3QvtGB0YLRliDQv9C+0LzQuNC70L7Qui5cclxuICAgKi9cclxuICBwcml2YXRlIHJlbmRlck9yVXBkYXRlRXJyb3JHcm91cChpc0NvbnRpbnVpbmc6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy5jaGF0Q29udGFpbmVyKSByZXR1cm47XHJcblxyXG4gICAgY29uc3QgZXJyb3JzVG9EaXNwbGF5ID0gWy4uLnRoaXMuY29uc2VjdXRpdmVFcnJvck1lc3NhZ2VzXTtcclxuICAgIGlmIChlcnJvcnNUb0Rpc3BsYXkubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IGVycm9yQ291bnQgPSBlcnJvcnNUb0Rpc3BsYXkubGVuZ3RoO1xyXG4gICAgY29uc3QgbGFzdEVycm9yID0gZXJyb3JzVG9EaXNwbGF5W2Vycm9yQ291bnQgLSAxXTtcclxuXHJcbiAgICBsZXQgZ3JvdXBFbDogSFRNTEVsZW1lbnQ7XHJcbiAgICBsZXQgY29udGVudENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBpZiAoaXNDb250aW51aW5nICYmIHRoaXMuZXJyb3JHcm91cEVsZW1lbnQpIHtcclxuICAgICAgZ3JvdXBFbCA9IHRoaXMuZXJyb3JHcm91cEVsZW1lbnQ7XHJcblxyXG4gICAgICBjb250ZW50Q29udGFpbmVyID0gZ3JvdXBFbC5xdWVyeVNlbGVjdG9yKGAuJHtDU1NfQ0xBU1NfRVJST1JfVEVYVH1gKTtcclxuICAgICAgaWYgKGNvbnRlbnRDb250YWluZXIpIHtcclxuICAgICAgICBjb250ZW50Q29udGFpbmVyLmVtcHR5KCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMudXBkYXRlRXJyb3JHcm91cFRpbWVzdGFtcChncm91cEVsLCBsYXN0RXJyb3IudGltZXN0YW1wKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMuaGlkZUVtcHR5U3RhdGUoKTtcclxuICAgICAgdGhpcy5pc1N1bW1hcml6aW5nRXJyb3JzID0gZmFsc2U7XHJcblxyXG4gICAgICBjb25zdCByZW5kZXJlciA9IG5ldyBFcnJvck1lc3NhZ2VSZW5kZXJlcih0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIGxhc3RFcnJvciwgdGhpcyk7XHJcbiAgICAgIGdyb3VwRWwgPSByZW5kZXJlci5yZW5kZXIoKTtcclxuICAgICAgY29udGVudENvbnRhaW5lciA9IGdyb3VwRWwucXVlcnlTZWxlY3RvcihgLiR7Q1NTX0NMQVNTX0VSUk9SX1RFWFR9YCk7XHJcblxyXG4gICAgICB0aGlzLmNoYXRDb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JvdXBFbCk7XHJcbiAgICAgIHRoaXMuZXJyb3JHcm91cEVsZW1lbnQgPSBncm91cEVsO1xyXG4gICAgICB0aGlzLmxhc3RNZXNzYWdlRWxlbWVudCA9IGdyb3VwRWw7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGNvbnRlbnRDb250YWluZXIpIHtcclxuICAgICAgaWYgKGVycm9yQ291bnQgPT09IDEpIHtcclxuICAgICAgICBjb250ZW50Q29udGFpbmVyLnNldFRleHQobGFzdEVycm9yLmNvbnRlbnQpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnRlbnRDb250YWluZXIuc2V0VGV4dChgTXVsdGlwbGUgZXJyb3JzIG9jY3VycmVkICgke2Vycm9yQ291bnR9KS4gU3VtbWFyaXppbmcuLi5gKTtcclxuICAgICAgICBpZiAoIXRoaXMuaXNTdW1tYXJpemluZ0Vycm9ycykge1xyXG4gICAgICAgICAgdGhpcy50cmlnZ2VyRXJyb3JTdW1tYXJpemF0aW9uKGdyb3VwRWwsIGVycm9yc1RvRGlzcGxheSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKDUwLCB0cnVlKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgdXBkYXRlRXJyb3JHcm91cFRpbWVzdGFtcChncm91cEVsOiBIVE1MRWxlbWVudCwgdGltZXN0YW1wOiBEYXRlKTogdm9pZCB7XHJcbiAgICBncm91cEVsLnNldEF0dHJpYnV0ZShcImRhdGEtdGltZXN0YW1wXCIsIHRpbWVzdGFtcC5nZXRUaW1lKCkudG9TdHJpbmcoKSk7XHJcbiAgICBjb25zdCB0aW1lc3RhbXBFbCA9IGdyb3VwRWwucXVlcnlTZWxlY3RvcihgLiR7Q1NTX0NMQVNTRVMuVElNRVNUQU1QfWApO1xyXG4gICAgaWYgKHRpbWVzdGFtcEVsKSB7XHJcbiAgICAgIHRpbWVzdGFtcEVsLnNldFRleHQodGhpcy5mb3JtYXRUaW1lKHRpbWVzdGFtcCkpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB0cmlnZ2VyRXJyb3JTdW1tYXJpemF0aW9uKHRhcmdldEdyb3VwRWxlbWVudDogSFRNTEVsZW1lbnQsIGVycm9yczogTWVzc2FnZVtdKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBFTkFCTEVfRVJST1JfU1VNTUFSSVpBVElPTiA9IGZhbHNlO1xyXG5cclxuICAgIGlmICghRU5BQkxFX0VSUk9SX1NVTU1BUklaQVRJT04pIHtcclxuICAgICAgdGhpcy5kaXNwbGF5RXJyb3JMaXN0RmFsbGJhY2sodGFyZ2V0R3JvdXBFbGVtZW50LCBlcnJvcnMpO1xyXG5cclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VtbWFyaXphdGlvbk1vZGVsTmFtZSB8fCB0aGlzLmlzU3VtbWFyaXppbmdFcnJvcnMpIHtcclxuICAgICAgaWYgKCF0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdW1tYXJpemF0aW9uTW9kZWxOYW1lKVxyXG4gICAgICAgIGlmICh0aGlzLmlzU3VtbWFyaXppbmdFcnJvcnMpIHRoaXMuZGlzcGxheUVycm9yTGlzdEZhbGxiYWNrKHRhcmdldEdyb3VwRWxlbWVudCwgZXJyb3JzKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuaXNTdW1tYXJpemluZ0Vycm9ycyA9IHRydWU7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3Qgc3VtbWFyeSA9IGF3YWl0IHRoaXMuc3VtbWFyaXplRXJyb3JzKGVycm9ycyk7XHJcbiAgICAgIGNvbnN0IGNvbnRlbnRDb250YWluZXIgPSB0YXJnZXRHcm91cEVsZW1lbnQucXVlcnlTZWxlY3RvcihgLiR7Q1NTX0NMQVNTRVMuRVJST1JfVEVYVH1gKSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgIGlmICghY29udGVudENvbnRhaW5lciB8fCAhY29udGVudENvbnRhaW5lci5pc0Nvbm5lY3RlZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29udGVudENvbnRhaW5lci5lbXB0eSgpO1xyXG5cclxuICAgICAgaWYgKHN1bW1hcnkpIHtcclxuICAgICAgICBjb250ZW50Q29udGFpbmVyLnNldFRleHQoYE11bHRpcGxlIGVycm9ycyBvY2N1cnJlZC4gU3VtbWFyeTpcXG4ke3N1bW1hcnl9YCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5kaXNwbGF5RXJyb3JMaXN0RmFsbGJhY2sodGFyZ2V0R3JvdXBFbGVtZW50LCBlcnJvcnMpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmRpc3BsYXlFcnJvckxpc3RGYWxsYmFjayh0YXJnZXRHcm91cEVsZW1lbnQsIGVycm9ycyk7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICB0aGlzLmlzU3VtbWFyaXppbmdFcnJvcnMgPSBmYWxzZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgZGlzcGxheUVycm9yTGlzdEZhbGxiYWNrKHRhcmdldEdyb3VwRWxlbWVudDogSFRNTEVsZW1lbnQsIGVycm9yczogTWVzc2FnZVtdKTogdm9pZCB7XHJcbiAgICBjb25zdCBjb250ZW50Q29udGFpbmVyID0gdGFyZ2V0R3JvdXBFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoYC4ke0NTU19DTEFTU0VTLkVSUk9SX1RFWFR9YCkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgaWYgKCFjb250ZW50Q29udGFpbmVyIHx8ICFjb250ZW50Q29udGFpbmVyLmlzQ29ubmVjdGVkKSB7XHJcbiAgICAgIGlmICghdGFyZ2V0R3JvdXBFbGVtZW50LmlzQ29ubmVjdGVkKSB7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnRlbnRDb250YWluZXIuZW1wdHkoKTtcclxuICAgIGNvbnN0IHVuaXF1ZUVycm9ycyA9IEFycmF5LmZyb20obmV3IFNldChlcnJvcnMubWFwKGUgPT4gZS5jb250ZW50LnRyaW0oKSkpKTtcclxuICAgIGNvbnRlbnRDb250YWluZXIuY3JlYXRlRGl2KHtcclxuICAgICAgdGV4dDogYE11bHRpcGxlIGVycm9ycyBvY2N1cnJlZCAoJHtlcnJvcnMubGVuZ3RofSB0b3RhbCwgJHt1bmlxdWVFcnJvcnMubGVuZ3RofSB1bmlxdWUpOmAsXHJcbiAgICAgIGNsczogXCJlcnJvci1zdW1tYXJ5LWhlYWRlclwiLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgbGlzdEVsID0gY29udGVudENvbnRhaW5lci5jcmVhdGVFbChcInVsXCIpO1xyXG4gICAgbGlzdEVsLnN0eWxlLm1hcmdpblRvcCA9IFwiNXB4XCI7XHJcbiAgICBsaXN0RWwuc3R5bGUucGFkZGluZ0xlZnQgPSBcIjIwcHhcIjtcclxuICAgIGxpc3RFbC5zdHlsZS5saXN0U3R5bGUgPSBcImRpc2NcIjtcclxuXHJcbiAgICB1bmlxdWVFcnJvcnMuZm9yRWFjaChlcnJvck1zZyA9PiB7XHJcbiAgICAgIGNvbnN0IGxpc3RJdGVtID0gbGlzdEVsLmNyZWF0ZUVsKFwibGlcIik7XHJcbiAgICAgIGxpc3RJdGVtLnRleHRDb250ZW50ID0gZXJyb3JNc2c7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbSg1MCwgdHJ1ZSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiDQktC40LrQvtC90YPRlCDRgdGD0LzQsNGA0LjQt9Cw0YbRltGOINGB0L/QuNGB0LrRgyDQv9C+0LLRltC00L7QvNC70LXQvdGMINC/0YDQviDQv9C+0LzQuNC70LrQuCDQt9CwINC00L7Qv9C+0LzQvtCz0L7RjiBPbGxhbWEuXHJcbiAgICogQHBhcmFtIGVycm9ycyDQnNCw0YHQuNCyINC/0L7QstGW0LTQvtC80LvQtdC90Ywg0L/RgNC+INC/0L7QvNC40LvQutC4LlxyXG4gICAqIEByZXR1cm5zINCg0Y/QtNC+0Log0Lcg0YHRg9C80LDRgNC40LfQsNGG0ZbRlNGOINCw0LHQviBudWxsINGDINGA0LDQt9GWINC/0L7QvNC40LvQutC4LlxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgc3VtbWFyaXplRXJyb3JzKGVycm9yczogTWVzc2FnZVtdKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XHJcbiAgICBjb25zdCBtb2RlbE5hbWUgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdW1tYXJpemF0aW9uTW9kZWxOYW1lO1xyXG4gICAgaWYgKCFtb2RlbE5hbWUpIHJldHVybiBudWxsO1xyXG5cclxuICAgIGlmIChlcnJvcnMubGVuZ3RoIDwgMikgcmV0dXJuIGVycm9yc1swXT8uY29udGVudCB8fCBudWxsO1xyXG5cclxuICAgIGNvbnN0IHVuaXF1ZUVycm9yQ29udGVudHMgPSBBcnJheS5mcm9tKG5ldyBTZXQoZXJyb3JzLm1hcChlID0+IGUuY29udGVudC50cmltKCkpKSk7XHJcbiAgICBjb25zdCBlcnJvcnNUZXh0ID0gdW5pcXVlRXJyb3JDb250ZW50cy5tYXAoKG1zZywgaW5kZXgpID0+IGBFcnJvciAke2luZGV4ICsgMX06ICR7bXNnfWApLmpvaW4oXCJcXG5cIik7XHJcbiAgICBjb25zdCBwcm9tcHQgPSBgQ29uY2lzZWx5IHN1bW1hcml6ZSB0aGUgZm9sbG93aW5nICR7dW5pcXVlRXJyb3JDb250ZW50cy5sZW5ndGh9IHVuaXF1ZSBlcnJvciBtZXNzYWdlcyByZXBvcnRlZCBieSB0aGUgc3lzdGVtLiBGb2N1cyBvbiB0aGUgY29yZSBpc3N1ZShzKTpcXG5cXG4ke2Vycm9yc1RleHR9XFxuXFxuU3VtbWFyeTpgO1xyXG5cclxuICAgIGNvbnN0IHJlcXVlc3RCb2R5ID0ge1xyXG4gICAgICBtb2RlbDogbW9kZWxOYW1lLFxyXG4gICAgICBwcm9tcHQ6IHByb21wdCxcclxuICAgICAgc3RyZWFtOiBmYWxzZSxcclxuICAgICAgdGVtcGVyYXR1cmU6IDAuMixcclxuICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgIG51bV9jdHg6IHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnRleHRXaW5kb3cgPiAxMDI0ID8gMTAyNCA6IHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnRleHRXaW5kb3csXHJcbiAgICAgIH0sXHJcbiAgICAgIHN5c3RlbTogXCJZb3UgYXJlIGFuIGFzc2lzdGFudCB0aGF0IHN1bW1hcml6ZXMgbGlzdHMgb2YgdGVjaG5pY2FsIGVycm9yIG1lc3NhZ2VzIGFjY3VyYXRlbHkgYW5kIGNvbmNpc2VseS5cIixcclxuICAgIH07XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzcG9uc2VEYXRhOiBPbGxhbWFHZW5lcmF0ZVJlc3BvbnNlID0gYXdhaXQgdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZS5nZW5lcmF0ZVJhdyhyZXF1ZXN0Qm9keSk7XHJcbiAgICAgIGlmIChyZXNwb25zZURhdGEgJiYgcmVzcG9uc2VEYXRhLnJlc3BvbnNlKSB7XHJcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlRGF0YS5yZXNwb25zZS50cmltKCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVFcnJvck1lc3NhZ2UoZXJyb3JNZXNzYWdlOiBNZXNzYWdlKTogdm9pZCB7XHJcbiAgICBpZiAoZXJyb3JNZXNzYWdlLnJvbGUgIT09IFwiZXJyb3JcIikge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICB0aGlzLmNvbnNlY3V0aXZlRXJyb3JNZXNzYWdlcy5wdXNoKGVycm9yTWVzc2FnZSk7XHJcbiAgICBjb25zdCBpc0NvbnRpbnVpbmdFcnJvciA9IHRoaXMubGFzdE1lc3NhZ2VFbGVtZW50ID09PSB0aGlzLmVycm9yR3JvdXBFbGVtZW50ICYmIHRoaXMuZXJyb3JHcm91cEVsZW1lbnQgIT09IG51bGw7XHJcbiAgICBpZiAoIWlzQ29udGludWluZ0Vycm9yKSB7XHJcbiAgICAgIHRoaXMuZXJyb3JHcm91cEVsZW1lbnQgPSBudWxsO1xyXG4gICAgICB0aGlzLmNvbnNlY3V0aXZlRXJyb3JNZXNzYWdlcyA9IFtlcnJvck1lc3NhZ2VdO1xyXG4gICAgfVxyXG4gICAgdHJ5IHtcclxuICAgICAgdGhpcy5yZW5kZXJPclVwZGF0ZUVycm9yR3JvdXAoaXNDb250aW51aW5nRXJyb3IpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgfSBjYXRjaCB7fVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgc2VuZE1lc3NhZ2UoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCB1c2VySW5wdXRUZXh0ID0gdGhpcy5pbnB1dEVsLnZhbHVlLnRyaW0oKTtcclxuICAgIGNvbnN0IHJlcXVlc3RUaW1lc3RhbXBJZCA9IERhdGUubm93KCk7XHJcblxyXG4gICAgaWYgKCF1c2VySW5wdXRUZXh0IHx8IHRoaXMuaXNQcm9jZXNzaW5nIHx8IHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlcikge1xyXG4gICAgICBpZiAodGhpcy5pc1Byb2Nlc3NpbmcgfHwgdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyKVxyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJQbGVhc2Ugd2FpdCBvciBjYW5jZWwgY3VycmVudCBvcGVyYXRpb24uXCIsIDMwMDApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICBpZiAoIWFjdGl2ZUNoYXQpIHtcclxuICAgICAgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmNyZWF0ZU5ld0NoYXQoKTtcclxuICAgICAgaWYgKCFhY3RpdmVDaGF0KSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIkVycm9yOiBObyBhY3RpdmUgY2hhdCBhbmQgY291bGQgbm90IGNyZWF0ZSBvbmUuXCIpO1xyXG4gICAgICAgIHRoaXMuc2V0TG9hZGluZ1N0YXRlKGZhbHNlKTsgLy8g0JLQsNC20LvQuNCy0L4g0YHQutC40L3Rg9GC0Lgg0YHRgtCw0L0sINGP0LrRidC+INGH0LDRgiDQvdC1INGB0YLQstC+0YDQtdC90L5cclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgICAgbmV3IE5vdGljZShgU3RhcnRlZCBuZXcgY2hhdDogJHthY3RpdmVDaGF0Lm1ldGFkYXRhLm5hbWV9YCk7XHJcbiAgICB9XHJcbiAgICBjb25zdCB1c2VyTWVzc2FnZVRpbWVzdGFtcCA9IG5ldyBEYXRlKCk7XHJcblxyXG4gICAgdGhpcy5jbGVhcklucHV0RmllbGQoKTtcclxuICAgIHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcclxuICAgIHRoaXMuc2V0TG9hZGluZ1N0YXRlKHRydWUpO1xyXG4gICAgdGhpcy5oaWRlRW1wdHlTdGF0ZSgpO1xyXG5cclxuICAgIGNvbnN0IGluaXRpYWxMbG1SZXNwb25zZVBsYWNlaG9sZGVyVHMgPSBEYXRlLm5vdygpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHVzZXJNZXNzYWdlQWRkZWQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5hZGRVc2VyTWVzc2FnZUFuZEF3YWl0UmVuZGVyKFxyXG4gICAgICAgIHVzZXJJbnB1dFRleHQsXHJcbiAgICAgICAgdXNlck1lc3NhZ2VUaW1lc3RhbXAsXHJcbiAgICAgICAgcmVxdWVzdFRpbWVzdGFtcElkXHJcbiAgICAgICk7XHJcbiAgICAgIGlmICghdXNlck1lc3NhZ2VBZGRlZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVzZXIgbWVzc2FnZSBwcm9jZXNzaW5nIGZhaWxlZCBpbiBDaGF0TWFuYWdlci5cIik7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGNoYXRTdGF0ZUZvckxsbSA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXRPckZhaWwoKTtcclxuXHJcbiAgICAgIGlmICghdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyKSB7XHJcbiAgICAgICAgLy8g0KbRjyDQv9C+0LzQuNC70LrQsCDQvdC1INC80LDRlCDQstC40L3QuNC60LDRgtC4LCDRj9C60YnQviBBYm9ydENvbnRyb2xsZXIg0YHRgtCy0L7RgNGO0ZTRgtGM0YHRjyDQstC40YnQtVxyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcclxuICAgICAgICAgIFwiQ1JJVElDQUw6IEFib3J0Q29udHJvbGxlciBub3QgaW5pdGlhbGl6ZWQgaW4gc2VuZE1lc3NhZ2UgYmVmb3JlIExsbUludGVyYWN0aW9uQ3ljbGUgY2FsbC5cIlxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQWJvcnRDb250cm9sbGVyIG5vdCBpbml0aWFsaXplZCBpbiBzZW5kTWVzc2FnZVwiKTtcclxuICAgICAgfVxyXG4gICAgICBhd2FpdCB0aGlzLl9oYW5kbGVMbG1JbnRlcmFjdGlvbkN5Y2xlKGNoYXRTdGF0ZUZvckxsbSwgcmVxdWVzdFRpbWVzdGFtcElkLCB0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIuc2lnbmFsKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgaWYgKFxyXG4gICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgJiZcclxuICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLnRpbWVzdGFtcCA9PT0gaW5pdGlhbExsbVJlc3BvbnNlUGxhY2Vob2xkZXJUcyAmJlxyXG4gICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5jbGFzc0xpc3QuY29udGFpbnMoXCJwbGFjZWhvbGRlclwiKVxyXG4gICAgICApIHtcclxuICAgICAgICBpZiAodGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLmlzQ29ubmVjdGVkKSB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmdyb3VwRWwucmVtb3ZlKCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnJlamVjdEFuZENsZWFySE1BUmVzb2x2ZXIoXHJcbiAgICAgICAgdXNlck1lc3NhZ2VUaW1lc3RhbXAuZ2V0VGltZSgpLFxyXG4gICAgICAgIGBPdXRlciBjYXRjaCBpbiBzZW5kTWVzc2FnZSBmb3IgdXNlciBtZXNzYWdlIChyZXE6ICR7cmVxdWVzdFRpbWVzdGFtcElkfSlgXHJcbiAgICAgICk7XHJcbiAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnJlamVjdEFuZENsZWFySE1BUmVzb2x2ZXIoXHJcbiAgICAgICAgaW5pdGlhbExsbVJlc3BvbnNlUGxhY2Vob2xkZXJUcyxcclxuICAgICAgICBgT3V0ZXIgY2F0Y2ggaW4gc2VuZE1lc3NhZ2UgZm9yIGluaXRpYWwgcGxhY2Vob2xkZXIgKHJlcTogJHtyZXF1ZXN0VGltZXN0YW1wSWR9KWBcclxuICAgICAgKTtcclxuXHJcbiAgICAgIGxldCBlcnJvck1zZ0ZvckNoYXQ6IHN0cmluZztcclxuICAgICAgbGV0IGVycm9yTXNnUm9sZTogTWVzc2FnZVJvbGUgPSBcImVycm9yXCI7XHJcbiAgICAgIGlmIChlcnJvci5uYW1lID09PSBcIkFib3J0RXJyb3JcIiB8fCBlcnJvci5tZXNzYWdlPy5pbmNsdWRlcyhcImFib3J0ZWQgYnkgdXNlclwiKSkge1xyXG4gICAgICAgIGVycm9yTXNnRm9yQ2hhdCA9IFwiTWVzc2FnZSBnZW5lcmF0aW9uIHN0b3BwZWQuXCI7XHJcbiAgICAgICAgZXJyb3JNc2dSb2xlID0gXCJzeXN0ZW1cIjtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBlcnJvck1zZ0ZvckNoYXQgPSBgRXJyb3I6ICR7ZXJyb3IubWVzc2FnZSB8fCBcIlVua25vd24gZXJyb3IgZHVyaW5nIHByb2Nlc3NpbmcuXCJ9YDtcclxuICAgICAgICBuZXcgTm90aWNlKGVycm9yTXNnRm9yQ2hhdCwgNzAwMCk7XHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgZXJyb3JEaXNwbGF5VGltZXN0YW1wID0gbmV3IERhdGUoKTtcclxuICAgICAgY29uc3QgZXJyb3JEaXNwbGF5TXNnOiBNZXNzYWdlID0ge1xyXG4gICAgICAgIHJvbGU6IGVycm9yTXNnUm9sZSxcclxuICAgICAgICBjb250ZW50OiBlcnJvck1zZ0ZvckNoYXQsXHJcbiAgICAgICAgdGltZXN0YW1wOiBlcnJvckRpc3BsYXlUaW1lc3RhbXAsXHJcbiAgICAgIH07XHJcblxyXG4gICAgICBjb25zdCBobWFFcnJvclByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIucmVnaXN0ZXJITUFSZXNvbHZlcihlcnJvckRpc3BsYXlNc2cudGltZXN0YW1wLmdldFRpbWUoKSwgcmVzb2x2ZSwgcmVqZWN0KTtcclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgIGlmICh0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuaGFzKGVycm9yRGlzcGxheU1zZy50aW1lc3RhbXAuZ2V0VGltZSgpKSkge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKFxyXG4gICAgICAgICAgICAgIGVycm9yRGlzcGxheU1zZy50aW1lc3RhbXAuZ2V0VGltZSgpLFxyXG4gICAgICAgICAgICAgIFwiSE1BIHRpbWVvdXQgZm9yIGVycm9yIGRpc3BsYXkgbXNnIGluIHNlbmRNZXNzYWdlXCJcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9LCAxMDAwMCk7XHJcbiAgICAgIH0pO1xyXG4gICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0UGF5bG9hZChlcnJvckRpc3BsYXlNc2csIHRydWUpO1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGF3YWl0IGhtYUVycm9yUHJvbWlzZTtcclxuICAgICAgfSBjYXRjaCAoZV9obWEpIHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihcIltTZW5kTWVzc2FnZV0gSE1BIGZvciBlcnJvciBkaXNwbGF5IG1lc3NhZ2UgZmFpbGVkIG9yIHRpbWVkIG91dDpcIiwgZV9obWEpO1xyXG4gICAgICB9XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBpZiAodGhpcy5hY3RpdmVQbGFjZWhvbGRlciAmJiB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmdyb3VwRWwuY2xhc3NMaXN0LmNvbnRhaW5zKFwicGxhY2Vob2xkZXJcIikpIHtcclxuICAgICAgICBpZiAodGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLmlzQ29ubmVjdGVkKSB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmdyb3VwRWwucmVtb3ZlKCk7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlciA9IG51bGw7XHJcbiAgICAgIHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlciA9IG51bGw7XHJcbiAgICAgIHRoaXMuc2V0TG9hZGluZ1N0YXRlKGZhbHNlKTtcclxuICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCkpO1xyXG4gICAgICB0aGlzLmZvY3VzSW5wdXQoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlTWVudUJ1dHRvbkNsaWNrID0gKGU6IE1vdXNlRXZlbnQpOiB2b2lkID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8udG9nZ2xlTWVudShlKTtcclxuICB9O1xyXG5cclxuICBwcml2YXRlIG9uRHJhZ1N0YXJ0ID0gKGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCA9PiB7XHJcbiAgICBpZiAoZXZlbnQuYnV0dG9uICE9PSAwKSByZXR1cm47XHJcblxyXG4gICAgdGhpcy5pc1Jlc2l6aW5nID0gdHJ1ZTtcclxuICAgIHRoaXMuaW5pdGlhbE1vdXNlWCA9IGV2ZW50LmNsaWVudFg7XHJcblxyXG4gICAgdGhpcy5pbml0aWFsU2lkZWJhcldpZHRoID0gdGhpcy5zaWRlYmFyUm9vdEVsPy5vZmZzZXRXaWR0aCB8fCAyNTA7XHJcblxyXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG5cclxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgdGhpcy5ib3VuZE9uRHJhZ01vdmUsIHsgY2FwdHVyZTogdHJ1ZSB9KTtcclxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIHRoaXMuYm91bmRPbkRyYWdFbmQsIHsgY2FwdHVyZTogdHJ1ZSB9KTtcclxuXHJcbiAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmN1cnNvciA9IFwiZXctcmVzaXplXCI7XHJcbiAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5hZGQoQ1NTX0NMQVNTX1JFU0laSU5HKTtcclxuICB9O1xyXG5cclxuICBwcml2YXRlIG9uRHJhZ01vdmUgPSAoZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkID0+IHtcclxuICAgIGlmICghdGhpcy5pc1Jlc2l6aW5nIHx8ICF0aGlzLnNpZGViYXJSb290RWwpIHJldHVybjtcclxuXHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICBpZiAoIXRoaXMuaXNSZXNpemluZyB8fCAhdGhpcy5zaWRlYmFyUm9vdEVsKSByZXR1cm47XHJcblxyXG4gICAgICBjb25zdCBjdXJyZW50TW91c2VYID0gZXZlbnQuY2xpZW50WDtcclxuICAgICAgY29uc3QgZGVsdGFYID0gY3VycmVudE1vdXNlWCAtIHRoaXMuaW5pdGlhbE1vdXNlWDtcclxuICAgICAgbGV0IG5ld1dpZHRoID0gdGhpcy5pbml0aWFsU2lkZWJhcldpZHRoICsgZGVsdGFYO1xyXG5cclxuICAgICAgY29uc3QgbWluV2lkdGggPSAxNTA7XHJcbiAgICAgIGNvbnN0IGNvbnRhaW5lcldpZHRoID0gdGhpcy5jb250ZW50RWwub2Zmc2V0V2lkdGg7XHJcblxyXG4gICAgICBjb25zdCBtYXhXaWR0aCA9IE1hdGgubWF4KG1pbldpZHRoICsgNTAsIGNvbnRhaW5lcldpZHRoICogMC42KTtcclxuXHJcbiAgICAgIGlmIChuZXdXaWR0aCA8IG1pbldpZHRoKSBuZXdXaWR0aCA9IG1pbldpZHRoO1xyXG4gICAgICBpZiAobmV3V2lkdGggPiBtYXhXaWR0aCkgbmV3V2lkdGggPSBtYXhXaWR0aDtcclxuXHJcbiAgICAgIHRoaXMuc2lkZWJhclJvb3RFbC5zdHlsZS53aWR0aCA9IGAke25ld1dpZHRofXB4YDtcclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLnN0eWxlLm1pbldpZHRoID0gYCR7bmV3V2lkdGh9cHhgO1xyXG4gICAgfSk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBvbkRyYWdFbmQgPSAoKTogdm9pZCA9PiB7XHJcbiAgICBpZiAoIXRoaXMuaXNSZXNpemluZykgcmV0dXJuO1xyXG5cclxuICAgIHRoaXMuaXNSZXNpemluZyA9IGZhbHNlO1xyXG5cclxuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgdGhpcy5ib3VuZE9uRHJhZ01vdmUsIHsgY2FwdHVyZTogdHJ1ZSB9KTtcclxuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIHRoaXMuYm91bmRPbkRyYWdFbmQsIHsgY2FwdHVyZTogdHJ1ZSB9KTtcclxuICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuY3Vyc29yID0gXCJcIjtcclxuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NfUkVTSVpJTkcpO1xyXG5cclxuICAgIHRoaXMuc2F2ZVdpZHRoRGVib3VuY2VkKCk7XHJcbiAgfTtcclxuXHJcbiAgLy8gc3JjL09sbGFtYVZpZXcudHNcclxuXHJcbi8vIC4uLiAo0ZbQvdGI0ZYg0ZbQvNC/0L7RgNGC0Lgg0YLQsCDRh9Cw0YHRgtC40L3QsCDQutC70LDRgdGDKSAuLi5cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVNZXNzYWdlQWRkZWQoZGF0YTogeyBjaGF0SWQ6IHN0cmluZzsgbWVzc2FnZTogTWVzc2FnZSB9KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBtZXNzYWdlRm9yTG9nID0gZGF0YT8ubWVzc2FnZTtcclxuICAgIGNvbnN0IG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cgPSBtZXNzYWdlRm9yTG9nPy50aW1lc3RhbXA/LmdldFRpbWUoKTsgLy8g0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviA/LiDQtNC70Y8g0LHQtdC30L/QtdC60LhcclxuICAgIGNvbnN0IG1lc3NhZ2VSb2xlRm9yTG9nID0gbWVzc2FnZUZvckxvZz8ucm9sZSBhcyBNZXNzYWdlUm9sZTsgLy8g0J/RgNC40L/Rg9GB0LrQsNGU0LzQviwg0YnQviBNZXNzYWdlUm9sZSDQtyBPbGxhbWFWaWV3XHJcblxyXG4gICAgLy8g0JvQvtCz0YPRlNC80L4g0LLRhdGW0LTQvdGDINC/0L7QtNGW0Y5cclxuICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcclxuICAgICAgYFtoYW5kbGVNZXNzYWdlQWRkZWRdIFJlY2VpdmVkIG1lc3NhZ2UgZXZlbnQgZm9yIGNoYXQgJHtkYXRhLmNoYXRJZH0uIE1lc3NhZ2Ugcm9sZTogJHttZXNzYWdlUm9sZUZvckxvZ30sIHRpbWVzdGFtcDogJHttZXNzYWdlVGltZXN0YW1wRm9yTG9nfWAsXHJcbiAgICAgIHsgcm9sZTogbWVzc2FnZUZvckxvZz8ucm9sZSwgY29udGVudFByZXZpZXc6IG1lc3NhZ2VGb3JMb2c/LmNvbnRlbnQ/LnN1YnN0cmluZygwLCA1MCkgKyBcIi4uLlwiLCB0b29sX2NhbGxzOiAobWVzc2FnZUZvckxvZyBhcyBBc3Npc3RhbnRNZXNzYWdlKT8udG9vbF9jYWxscyB9XHJcbiAgICApO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIDEuINCR0LDQt9C+0LLRliDQv9C10YDQtdCy0ZbRgNC60Lgg0L3QsCDQstCw0LvRltC00L3RltGB0YLRjCDQtNCw0L3QuNGFXHJcbiAgICAgIGlmICghZGF0YSB8fCAhZGF0YS5tZXNzYWdlIHx8ICFtZXNzYWdlRm9yTG9nIHx8ICFtZXNzYWdlVGltZXN0YW1wRm9yTG9nKSB7IC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4g0ZYgbWVzc2FnZVRpbWVzdGFtcEZvckxvZ1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtZXNzYWdlVGltZXN0YW1wRm9yTG9nKSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5pbnZva2VITUFSZXNvbHZlcihtZXNzYWdlVGltZXN0YW1wRm9yTG9nKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IHsgY2hhdElkOiBldmVudENoYXRJZCwgbWVzc2FnZSB9ID0gZGF0YTsgLy8gbWVzc2FnZSDRgtGD0YIg0LPQsNGA0LDQvdGC0L7QstCw0L3QviDRlFxyXG4gICAgICBjb25zdCBtZXNzYWdlVGltZXN0YW1wTXMgPSBtZXNzYWdlVGltZXN0YW1wRm9yTG9nOyAvLyDQotC10L/QtdGAINGG0LUg0YLQtSDRgdCw0LzQtSwg0YnQviBtZXNzYWdlLnRpbWVzdGFtcC5nZXRUaW1lKClcclxuXHJcbiAgICAgIC8vINCb0L7Qs9GD0LLQsNC90L3RjyDQvtCx0YDQvtCx0LvRjtCy0LDQvdC+0LPQviDQv9C+0LLRltC00L7QvNC70LXQvdC90Y9cclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbaGFuZGxlTWVzc2FnZUFkZGVkXSBQcm9jZXNzaW5nIG1lc3NhZ2U6YCwgeyBcclxuICAgICAgICBpZDogbWVzc2FnZVRpbWVzdGFtcE1zLCBcclxuICAgICAgICByb2xlOiBtZXNzYWdlLnJvbGUsIFxyXG4gICAgICAgIGNvbnRlbnQ6IG1lc3NhZ2UuY29udGVudD8uc3Vic3RyaW5nKDAsMTAwKSArIChtZXNzYWdlLmNvbnRlbnQgJiYgbWVzc2FnZS5jb250ZW50Lmxlbmd0aCA+IDEwMCA/IFwiLi4uXCIgOiBcIlwiKSxcclxuICAgICAgICB0b29sX2NhbGxzOiAobWVzc2FnZSBhcyBBc3Npc3RhbnRNZXNzYWdlKS50b29sX2NhbGxzIC8vINCf0YDQuNCy0L7QtNC40LzQviDQtNC+IEFzc2lzdGFudE1lc3NhZ2Ug0LTQu9GPINC00L7RgdGC0YPQv9GDINC00L4gdG9vbF9jYWxsc1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIDIuINCf0LXRgNC10LLRltGA0LrQsCDQvdCw0Y/QstC90L7RgdGC0ZYgY2hhdENvbnRhaW5lciDRgtCwIGNoYXRNYW5hZ2VyXHJcbiAgICAgIGlmICghdGhpcy5jaGF0Q29udGFpbmVyIHx8ICF0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmludm9rZUhNQVJlc29sdmVyKG1lc3NhZ2VUaW1lc3RhbXBNcyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyAzLiDQn9C10YDQtdCy0ZbRgNC60LAsINGH0Lgg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINC00LvRjyDQsNC60YLQuNCy0L3QvtCz0L4g0YfQsNGC0YNcclxuICAgICAgY29uc3QgYWN0aXZlQ2hhdElkID0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0QWN0aXZlQ2hhdElkKCk7XHJcbiAgICAgIGlmIChldmVudENoYXRJZCAhPT0gYWN0aXZlQ2hhdElkKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuaW52b2tlSE1BUmVzb2x2ZXIobWVzc2FnZVRpbWVzdGFtcE1zKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIDQuINCS0LjQt9C90LDRh9C10L3QvdGPINGD0LzQvtCyINC00LvRjyDRgdC/0LXRhtGW0LDQu9GM0L3QvtGXINC+0LHRgNC+0LHQutC4XHJcbiAgICAgIGNvbnN0IGlzQXNzaXN0YW50ID0gbWVzc2FnZS5yb2xlID09PSBcImFzc2lzdGFudFwiO1xyXG4gICAgICBjb25zdCBoYXNUb29sQ2FsbHMgPSAhISgobWVzc2FnZSBhcyBBc3Npc3RhbnRNZXNzYWdlKS50b29sX2NhbGxzICYmIChtZXNzYWdlIGFzIEFzc2lzdGFudE1lc3NhZ2UpLnRvb2xfY2FsbHMhLmxlbmd0aCA+IDApO1xyXG4gICAgICAvLyBpc0FjdGl2ZUN5Y2xlOiDQn9C10YDQtdCy0ZbRgNGP0ZTQvNC+LCDRh9C4INGUINCw0LrRgtC40LLQvdC40LkgQWJvcnRDb250cm9sbGVyICjQsNCx0L4g0ZbQvdGI0LjQuSDRltC90LTQuNC60LDRgtC+0YAg0LDQutGC0LjQstC90L7Qs9C+IExMTSDRhtC40LrQu9GDKVxyXG4gICAgICBjb25zdCBpc0FjdGl2ZUN5Y2xlID0gISF0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXI7IC8vINCi0Lgg0LLQuNC60L7RgNC40YHRgtC+0LLRg9Cy0LDQsiBjdXJyZW50QWJvcnRDb250cm9sbGVyXHJcblxyXG4gICAgICBcclxuXHJcbiAgICAgIC8vIC0tLSDQmtCb0K7Qp9Ce0JLQkCDQl9Cc0IbQndCQINCb0J7Qk9CG0JrQmCAtLS1cclxuICAgICAgLy8gNS4g0J/RgNC+0L/Rg9GB0Log0YDQtdC90LTQtdGA0LjQvdCz0YMg0LTQu9GPINC/0L7QstGW0LTQvtC80LvQtdC90Ywg0LDRgdC40YHRgtC10L3RgtCwINC3IHRvb2xfY2FsbHNcclxuICAgICAgLy8g0KbQtSDQvNCw0ZQg0LLRltC00LHRg9Cy0LDRgtC40YHRjyDQndCV0JfQkNCb0JXQltCd0J4g0LLRltC0IGlzQWN0aXZlQ3ljbGUsINGP0LrRidC+INC80Lgg0YXQvtGH0LXQvNC+INC/0YDQuNGF0L7QstCw0YLQuCDRl9GFINGWINC/0YDQuCDQv9C10YDQtdC30LDQstCw0L3RgtCw0LbQtdC90L3Rli5cclxuICAgICAgaWYgKGlzQXNzaXN0YW50ICYmIGhhc1Rvb2xDYWxscykge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5pbmZvKFxyXG4gICAgICAgICAgYFtoYW5kbGVNZXNzYWdlQWRkZWRdIElOVEVOREVEIFNLSVA6IFNraXBwaW5nIHJlbmRlciBmb3IgYXNzaXN0YW50IG1lc3NhZ2Ugd2l0aCB0b29sX2NhbGxzIChyb2xlOiAke21lc3NhZ2Uucm9sZX0sIHRzOiAke21lc3NhZ2VUaW1lc3RhbXBNc30pLiBUaGlzIG1lc3NhZ2UgaXMgZm9yIHRvb2wgZXhlY3V0aW9uIG9ubHkuYCxcclxuICAgICAgICAgIHsgY29udGVudFByZXZpZXc6IG1lc3NhZ2UuY29udGVudD8uc3Vic3RyaW5nKDAsIDcwKSArIFwiLi4uXCIsIHRvb2xfY2FsbHM6IChtZXNzYWdlIGFzIEFzc2lzdGFudE1lc3NhZ2UpLnRvb2xfY2FsbHMgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8g0JLQuNC00LDQu9GP0ZTQvNC+INC/0LvQtdC50YHRhdC+0LvQtNC10YAsINGP0LrRidC+INCy0ZbQvSDQsdGD0LIg0YHRgtCy0L7RgNC10L3QuNC5INC00LvRjyDRhtGM0L7Qs9C+INC60L7QvdC60YDQtdGC0L3QvtCz0L4g0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPXHJcbiAgICAgICAgLy8gKNC80LDQu9C+0LnQvNC+0LLRltGA0L3QviDQtNC70Y8gYXNzaXN0YW50K3Rvb2xfY2FsbHMsINCw0LvQtSDQtNC70Y8g0L/QvtCy0L3QvtGC0LgpXHJcbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgJiYgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci50aW1lc3RhbXAgPT09IG1lc3NhZ2VUaW1lc3RhbXBNcykge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5pc0Nvbm5lY3RlZCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyDQotCw0LrQvtC2LCDRj9C60YnQviDRhtC1INC/0L7QstGW0LTQvtC80LvQtdC90L3RjyDQsdGD0LvQviDQsiBjdXJyZW50TWVzc2FnZXMgKNC90LDQv9GA0LjQutC70LDQtCwg0LTQvtC00LDQvdC1IENoYXRNYW5hZ2VyKSwg0LDQu9C1INC90LUg0LHRg9C00LUg0YDQtdC90LTQtdGA0LjRgtC40YHRjyxcclxuICAgICAgICAvLyDQudC+0LPQviDQvNC+0LbQvdCwINC/0YDQuNCx0YDQsNGC0LgsINGJ0L7QsSDQvdC1INCy0L/Qu9C40LLQsNGC0Lgg0L3QsCDQu9C+0LPRltC60YMgXCJhbHJlYWR5SW5Mb2dpY0NhY2hlXCIg0LTQu9GPINC80LDQudCx0YPRgtC90ZbRhSDQv9C+0LLRltC00L7QvNC70LXQvdGMLlxyXG4gICAgICAgIC8vINCQ0LHQviDQtiwg0Y/QutGJ0L4g0LLQvtC90L4g0LzQsNGUINCx0YPRgtC4INCyINGW0YHRgtC+0YDRltGXINC00LvRjyDQu9C+0LPRltC60LggTExNLCDQsNC70LUg0L3QtSDQtNC70Y8gVUkuXHJcbiAgICAgICAgLy8g0J/QvtC60Lgg0YnQviDQt9Cw0LvQuNGI0LjQvNC+INC50L7Qs9C+INCyIHRoaXMuY3VycmVudE1lc3NhZ2VzLCDRj9C60YnQviBDaGF0TWFuYWdlciDQudC+0LPQviDRgtGD0LTQuCDQtNC+0LTQsNGULlxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmludm9rZUhNQVJlc29sdmVyKG1lc3NhZ2VUaW1lc3RhbXBNcyk7IC8vINCX0LDQstC10YDRiNGD0ZTQvNC+IEhNQVxyXG4gICAgICAgIHJldHVybjsgLy8g0J/QvtCy0L3RltGB0YLRjiDQstC40YXQvtC00LjQvNC+LCDQvdC1INGA0LXQvdC00LXRgNC40LzQviDRhtC1INC/0L7QstGW0LTQvtC80LvQtdC90L3Rj1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyA2LiDQl9Cw0L/QvtCx0ZbQs9Cw0L3QvdGPINC/0L7QstGC0L7RgNC90L7QvNGDINGA0LXQvdC00LXRgNC40L3Qs9GDINCy0LbQtSDRltGB0L3Rg9GO0YfQuNGFINC/0L7QstGW0LTQvtC80LvQtdC90YxcclxuICAgICAgY29uc3QgZXhpc3RpbmdSZW5kZXJlZE1lc3NhZ2UgPSB0aGlzLmNoYXRDb250YWluZXIucXVlcnlTZWxlY3RvcihcclxuICAgICAgICBgLiR7Q1NTX0NMQVNTRVMuTUVTU0FHRV9HUk9VUH06bm90KC5wbGFjZWhvbGRlcilbZGF0YS10aW1lc3RhbXA9XCIke21lc3NhZ2VUaW1lc3RhbXBNc31cIl1gXHJcbiAgICAgICk7XHJcbiAgICAgIGlmIChleGlzdGluZ1JlbmRlcmVkTWVzc2FnZSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmludm9rZUhNQVJlc29sdmVyKG1lc3NhZ2VUaW1lc3RhbXBNcyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyA3LiDQn9C10YDQtdCy0ZbRgNC60LAsINGH0Lgg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINCy0LbQtSDRlCDQsiDQu9C+0LPRltGH0L3QvtC80YMg0LrQtdGI0ZYgKHRoaXMuY3VycmVudE1lc3NhZ2VzKVxyXG4gICAgICAvLyDQptC1INC80L7QttC1INC00L7Qv9C+0LzQvtCz0YLQuCDRg9C90LjQutC90YPRgtC4INC00YPQsdC70Y7QstCw0L3QvdGPLCDRj9C60YnQviDQv9C+0LTRltGPINC/0YDQuNC50YjQu9CwINC00LLRltGH0ZYg0LTQviDRgNC10L3QtNC10YDQuNC90LPRgy5cclxuICAgICAgY29uc3QgaXNBbHJlYWR5SW5Mb2dpY0NhY2hlID0gdGhpcy5jdXJyZW50TWVzc2FnZXMuc29tZShcclxuICAgICAgICBtID0+IG0udGltZXN0YW1wLmdldFRpbWUoKSA9PT0gbWVzc2FnZVRpbWVzdGFtcE1zICYmIG0ucm9sZSA9PT0gbWVzc2FnZS5yb2xlIFxyXG4gICAgICAgIC8vINCf0L7RgNGW0LLQvdGP0L3QvdGPINC60L7QvdGC0LXQvdGC0YMg0LzQvtC20LUg0LHRg9GC0Lgg0L3QsNC00LvQuNGI0LrQvtCy0LjQvCDRliDQtNC+0YDQvtCz0LjQvCwg0Y/QutGJ0L4gSUQgKHRpbWVzdGFtcCkg0YPQvdGW0LrQsNC70YzQvdC40LlcclxuICAgICAgICAvLyAmJiBtLmNvbnRlbnQgPT09IG1lc3NhZ2UuY29udGVudCBcclxuICAgICAgKTtcclxuXHJcbiAgICAgIC8vINCS0LjQt9C90LDRh9Cw0ZTQvNC+LCDRh9C4INGG0LUg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINCw0YHQuNGB0YLQtdC90YLQsCDQv9GA0LjQt9C90LDRh9C10L3QtSDQtNC70Y8g0L7QvdC+0LLQu9C10L3QvdGPINCw0LrRgtC40LLQvdC+0LPQviDQv9C70LXQudGB0YXQvtC70LTQtdGA0LBcclxuICAgICAgY29uc3QgaXNQb3RlbnRpYWxseUFzc2lzdGFudEZvclBsYWNlaG9sZGVyID1cclxuICAgICAgICBpc0Fzc2lzdGFudCAmJiAvLyDQptC1INC/0L7QstGW0LTQvtC80LvQtdC90L3RjyDQsNGB0LjRgdGC0LXQvdGC0LBcclxuICAgICAgICAhaGFzVG9vbENhbGxzICYmIC8vINCGINCy0L7QvdC+INCd0JUg0LzQsNGUIHRvb2xfY2FsbHMgKNCx0L4g0YLQsNC60ZYg0LzQuCDQstC20LUg0L/RgNC+0L/Rg9GB0YLQuNC70LgpXHJcbiAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlcj8udGltZXN0YW1wID09PSBtZXNzYWdlVGltZXN0YW1wTXM7IC8vINCGINGUINCw0LrRgtC40LLQvdC40Lkg0L/Qu9C10LnRgdGF0L7Qu9C00LXRgCDQtNC70Y8g0L3RjNC+0LPQvlxyXG5cclxuICAgICAgaWYgKGlzQWxyZWFkeUluTG9naWNDYWNoZSAmJiAhaXNQb3RlbnRpYWxseUFzc2lzdGFudEZvclBsYWNlaG9sZGVyKSB7XHJcbiAgICAgICAgLy8g0K/QutGJ0L4g0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINCy0LbQtSDQsiDQutC10YjRliDQhiDQstC+0L3QviDQvdC1INC00LvRjyDQvtC90L7QstC70LXQvdC90Y8g0L/Qu9C10LnRgdGF0L7Qu9C00LXRgNCwLFxyXG4gICAgICAgIC8vINGC0L4sINC50LzQvtCy0ZbRgNC90L4sINGG0LUg0LTRg9Cx0LvRltC60LDRgiDQsNCx0L4g0LLQttC1INC+0LHRgNC+0LHQu9C10L3QsCDRgdC40YLRg9Cw0YbRltGPLlxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmludm9rZUhNQVJlc29sdmVyKG1lc3NhZ2VUaW1lc3RhbXBNcyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAvLyDQlNC+0LTQsNGU0LzQviDQsiDQu9C+0LPRltGH0L3QuNC5INC60LXRiCwg0Y/QutGJ0L4g0YnQtSDQvdC1INGC0LDQvCAo0LDQsdC+INGP0LrRidC+INGG0LUg0LTQu9GPINC/0LvQtdC50YHRhdC+0LvQtNC10YDQsCwg0YLQviDQstC+0L3QviDQstC20LUg0LzQvtC20LUg0LHRg9GC0Lgg0YLQsNC8KVxyXG4gICAgICBpZiAoIWlzQWxyZWFkeUluTG9naWNDYWNoZSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuY3VycmVudE1lc3NhZ2VzLnB1c2gobWVzc2FnZSk7IC8vINCX0LHQtdGA0ZbQs9Cw0ZTQvNC+INC+0YDQuNCz0ZbQvdCw0LvRjNC90LUg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINC3IERhdGUg0L7QsSfRlNC60YLQvtC8XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIDguINCb0L7Qs9GW0LrQsCDRgNC10L3QtNC10YDQuNC90LPRgzog0L7QvdC+0LLQu9C10L3QvdGPINC/0LvQtdC50YHRhdC+0LvQtNC10YDQsCDQsNCx0L4g0LTQvtC00LDQstCw0L3QvdGPINC90L7QstC+0LPQviDQv9C+0LLRltC00L7QvNC70LXQvdC90Y9cclxuICAgICAgaWYgKGlzUG90ZW50aWFsbHlBc3Npc3RhbnRGb3JQbGFjZWhvbGRlciAmJiB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgcGxhY2Vob2xkZXJUb1VwZGF0ZSA9IHRoaXMuYWN0aXZlUGxhY2Vob2xkZXI7IC8vINCX0LHQtdGA0ZbQs9Cw0ZTQvNC+INC/0L7RgdC40LvQsNC90L3Rj1xyXG4gICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgPSBudWxsOyAvLyDQntGH0LjRidCw0ZTQvNC+IGFjdGl2ZVBsYWNlaG9sZGVyINC/0LXRgNC10LQg0LDRgdC40L3RhdGA0L7QvdC90LjQvNC4INC+0L/QtdGA0LDRhtGW0Y/QvNC4XHJcblxyXG4gICAgICAgIGlmIChcclxuICAgICAgICAgIHBsYWNlaG9sZGVyVG9VcGRhdGUuZ3JvdXBFbD8uaXNDb25uZWN0ZWQgJiZcclxuICAgICAgICAgIHBsYWNlaG9sZGVyVG9VcGRhdGUuY29udGVudEVsICYmXHJcbiAgICAgICAgICBwbGFjZWhvbGRlclRvVXBkYXRlLm1lc3NhZ2VXcmFwcGVyXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICBwbGFjZWhvbGRlclRvVXBkYXRlLmdyb3VwRWwuY2xhc3NMaXN0LnJlbW92ZShcInBsYWNlaG9sZGVyXCIpO1xyXG4gICAgICAgICAgcGxhY2Vob2xkZXJUb1VwZGF0ZS5ncm91cEVsLnJlbW92ZUF0dHJpYnV0ZShcImRhdGEtcGxhY2Vob2xkZXItdGltZXN0YW1wXCIpO1xyXG4gICAgICAgICAgcGxhY2Vob2xkZXJUb1VwZGF0ZS5ncm91cEVsLnNldEF0dHJpYnV0ZShcImRhdGEtdGltZXN0YW1wXCIsIG1lc3NhZ2VUaW1lc3RhbXBNcy50b1N0cmluZygpKTtcclxuXHJcbiAgICAgICAgICBjb25zdCBtZXNzYWdlRG9tRWxlbWVudCA9IHBsYWNlaG9sZGVyVG9VcGRhdGUuZ3JvdXBFbC5xdWVyeVNlbGVjdG9yKFxyXG4gICAgICAgICAgICBgLiR7Q1NTX0NMQVNTRVMuTUVTU0FHRX1gXHJcbiAgICAgICAgICApIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcclxuXHJcbiAgICAgICAgICBpZiAoIW1lc3NhZ2VEb21FbGVtZW50KSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocGxhY2Vob2xkZXJUb1VwZGF0ZS5ncm91cEVsLmlzQ29ubmVjdGVkKSBwbGFjZWhvbGRlclRvVXBkYXRlLmdyb3VwRWwucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgIC8vIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgPSBudWxsOyAvLyDQktC20LUg0L7Rh9C40YnQtdC90L5cclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hZGRNZXNzYWdlU3RhbmRhcmQobWVzc2FnZSk7IFxyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcGxhY2Vob2xkZXJUb1VwZGF0ZS5jb250ZW50RWwuY2xhc3NMaXN0LnJlbW92ZShcInN0cmVhbWluZy10ZXh0XCIpO1xyXG4gICAgICAgICAgICBjb25zdCBkb3RzRWwgPSBwbGFjZWhvbGRlclRvVXBkYXRlLmNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yKGAuJHtDU1NfQ0xBU1NFUy5USElOS0lOR19ET1RTfWApO1xyXG4gICAgICAgICAgICBpZiAoZG90c0VsKSAgZG90c0VsLnJlbW92ZSgpOyBcclxuXHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgY29uc3QgZGlzcGxheUNvbnRlbnQgPSBBc3Npc3RhbnRNZXNzYWdlUmVuZGVyZXIucHJlcGFyZURpc3BsYXlDb250ZW50KFxyXG4gICAgICAgICAgICAgICAgbWVzc2FnZS5jb250ZW50IHx8IFwiXCIsXHJcbiAgICAgICAgICAgICAgICBtZXNzYWdlIGFzIEFzc2lzdGFudE1lc3NhZ2UsIC8vIG1lc3NhZ2Ug0YLRg9GCINCy0LbQtSDQvdC1INC80LDRlCB0b29sX2NhbGxzLCDQsdC+INC80Lgg0ZfRhSDQstGW0LTRhNGW0LvRjNGC0YDRg9Cy0LDQu9C4XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbixcclxuICAgICAgICAgICAgICAgIHRoaXNcclxuICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgIHBsYWNlaG9sZGVyVG9VcGRhdGUuY29udGVudEVsLmVtcHR5KCk7IC8vINCe0YfQuNGJ0LDRlNC80L4g0LLQvNGW0YHRgiDQv9C10YDQtdC0INC90L7QstC40Lwg0YDQtdC90LTQtdGA0LjQvdCz0L7QvFxyXG4gICAgICAgICAgICAgIGF3YWl0IFJlbmRlcmVyVXRpbHMucmVuZGVyTWFya2Rvd25Db250ZW50KCB0aGlzLmFwcCwgdGhpcywgdGhpcy5wbHVnaW4sIHBsYWNlaG9sZGVyVG9VcGRhdGUuY29udGVudEVsLCBkaXNwbGF5Q29udGVudCApO1xyXG4gICAgICAgICAgICAgIEFzc2lzdGFudE1lc3NhZ2VSZW5kZXJlci5hZGRBc3Npc3RhbnRBY3Rpb25CdXR0b25zKCBtZXNzYWdlRG9tRWxlbWVudCwgcGxhY2Vob2xkZXJUb1VwZGF0ZS5jb250ZW50RWwsIG1lc3NhZ2UgYXMgQXNzaXN0YW50TWVzc2FnZSwgdGhpcy5wbHVnaW4sIHRoaXMgKTtcclxuICAgICAgICAgICAgICBCYXNlTWVzc2FnZVJlbmRlcmVyLmFkZFRpbWVzdGFtcChtZXNzYWdlRG9tRWxlbWVudCwgbWVzc2FnZS50aW1lc3RhbXAsIHRoaXMpO1xyXG4gICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIHRoaXMubGFzdE1lc3NhZ2VFbGVtZW50ID0gcGxhY2Vob2xkZXJUb1VwZGF0ZS5ncm91cEVsO1xyXG4gICAgICAgICAgICAgIHRoaXMuaGlkZUVtcHR5U3RhdGUoKTtcclxuICAgICAgICAgICAgICBjb25zdCBmaW5hbE1lc3NhZ2VHcm91cEVsZW1lbnQgPSBwbGFjZWhvbGRlclRvVXBkYXRlLmdyb3VwRWw7IC8vINCX0LHQtdGA0ZbQs9Cw0ZTQvNC+INC00LvRjyBzZXRUaW1lb3V0XHJcbiAgICAgICAgICAgICAgLy8gdGhpcy5hY3RpdmVQbGFjZWhvbGRlciA9IG51bGw7IC8vINCS0LbQtSDQvtGH0LjRidC10L3QvlxyXG4gICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIC8vINCQ0YHQuNC90YXRgNC+0L3QvdCwINC/0LXRgNC10LLRltGA0LrQsCDQvdCwINC30LPQvtGA0YLQsNC90L3Rj1xyXG4gICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyBpZiAoZmluYWxNZXNzYWdlR3JvdXBFbGVtZW50Py5pc0Nvbm5lY3RlZCkgdGhpcy5jaGVja01lc3NhZ2VGb3JDb2xsYXBzaW5nKGZpbmFsTWVzc2FnZUdyb3VwRWxlbWVudCk7IH0sIDcwKTtcclxuICAgICAgICAgICAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbSgxMDAsIHRydWUpOyAvLyDQn9GA0L7QutGA0YPRgtC60LBcclxuICAgICAgICAgICAgfSBjYXRjaCAocmVuZGVyRXJyb3I6IGFueSkge1xyXG4gICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlclRvVXBkYXRlLmdyb3VwRWwuaXNDb25uZWN0ZWQpIHBsYWNlaG9sZGVyVG9VcGRhdGUuZ3JvdXBFbC5yZW1vdmUoKTtcclxuICAgICAgICAgICAgICAvLyB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDsgLy8g0JLQttC1INC+0YfQuNGJ0LXQvdC+XHJcbiAgICAgICAgICAgICAgdGhpcy5oYW5kbGVFcnJvck1lc3NhZ2UoeyByb2xlOiBcImVycm9yXCIsIGNvbnRlbnQ6IGBGYWlsZWQgdG8gZmluYWxpemUgZGlzcGxheSBmb3IgdHMgJHttZXNzYWdlVGltZXN0YW1wTXN9OiAke3JlbmRlckVycm9yLm1lc3NhZ2V9YCwgdGltZXN0YW1wOiBuZXcgRGF0ZSgpIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHsgXHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgPSBudWxsOyAvLyDQktC20LUg0L7Rh9C40YnQtdC90L5cclxuICAgICAgICAgIGF3YWl0IHRoaXMuYWRkTWVzc2FnZVN0YW5kYXJkKG1lc3NhZ2UpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHsgLy8g0K/QutGJ0L4g0L3QtSDQvtC90L7QstC70LXQvdC90Y8g0L/Qu9C10LnRgdGF0L7Qu9C00LXRgNCwLCDRgtC+INGB0YLQsNC90LTQsNGA0YLQvdC1INC00L7QtNCw0LLQsNC90L3Rj1xyXG4gICAgICAgIC8vINCm0LUg0LLQutC70Y7Rh9Cw0ZQg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINC60L7RgNC40YHRgtGD0LLQsNGH0LAsINGW0L3RgdGC0YDRg9C80LXQvdGC0ZbQsiwg0L/QvtC80LjQu9C+0LosXHJcbiAgICAgICAgLy8g0LAg0YLQsNC60L7QtiDQv9C+0LLRltC00L7QvNC70LXQvdC90Y8g0LDRgdC40YHRgtC10L3RgtCwLCDRj9C60YnQviDQtNC70Y8g0L3QuNGFINC90LUg0LHRg9C70L4g0L/Qu9C10LnRgdGF0L7Qu9C00LXRgNCwICjQvdCw0L/RgNC40LrQu9Cw0LQsINC/0YDQuCDQt9Cw0LLQsNC90YLQsNC20LXQvdC90ZYg0ZbRgdGC0L7RgNGW0ZcpXHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgdGhpcy5hZGRNZXNzYWdlU3RhbmRhcmQobWVzc2FnZSk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKG91dGVyRXJyb3I6IGFueSkge1xyXG4gICAgICBcclxuICAgICAgdGhpcy5oYW5kbGVFcnJvck1lc3NhZ2Uoe1xyXG4gICAgICAgIHJvbGU6IFwiZXJyb3JcIixcclxuICAgICAgICBjb250ZW50OiBgSW50ZXJuYWwgZXJyb3IgaW4gaGFuZGxlTWVzc2FnZUFkZGVkIGZvciAke21lc3NhZ2VSb2xlRm9yTG9nfSBtc2cgKHRzICR7bWVzc2FnZVRpbWVzdGFtcEZvckxvZ30pOiAke291dGVyRXJyb3IubWVzc2FnZSB8fCAnVW5rbm93biBlcnJvcid9YCxcclxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCksXHJcbiAgICAgIH0pO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgLy8g0JPQsNGA0LDQvdGC0L7QstCw0L3QviDQstC40LrQu9C40LrQsNGU0LzQviDRgNC10LfQvtC70LLQtdGALCDRj9C60YnQviDQstGW0L0g0YnQtSDRltGB0L3Rg9GUXHJcbiAgICAgIGlmIChtZXNzYWdlVGltZXN0YW1wRm9yTG9nICYmIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5oYXMobWVzc2FnZVRpbWVzdGFtcEZvckxvZykpIHtcclxuICAgICAgICAgXHJcbiAgICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmludm9rZUhNQVJlc29sdmVyKG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cpO1xyXG4gICAgICB9IGVsc2UgaWYgKG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cpIHtcclxuICAgICAgICAgLy8g0K/QutGJ0L4g0YDQtdC30L7Qu9Cy0LXRgNCwINCy0LbQtSDQvdC10LzQsNGULCDQu9C+0LPRg9GU0LzQviDRhtC1LCDRidC+0LEg0YDQvtC30YPQvNGW0YLQuCDQv9C+0YLRltC6XHJcbiAgICAgICAgIFxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuLy8gLi4uICjRgNC10YjRgtCwINC60L7QtNGDINC60LvQsNGB0YMpIC4uLlxyXG5cclxuICBwcml2YXRlIHNjaGVkdWxlU2lkZWJhckNoYXRMaXN0VXBkYXRlID0gKGRlbGF5OiBudW1iZXIgPSA1MCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuY2hhdExpc3RVcGRhdGVUaW1lb3V0SWQpIHtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuY2hhdExpc3RVcGRhdGVUaW1lb3V0SWQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaWYgKHRoaXMuaXNDaGF0TGlzdFVwZGF0ZVNjaGVkdWxlZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLmlzQ2hhdExpc3RVcGRhdGVTY2hlZHVsZWQgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuY2hhdExpc3RVcGRhdGVUaW1lb3V0SWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgaWYgKHRoaXMuc2lkZWJhck1hbmFnZXI/LmlzU2VjdGlvblZpc2libGUoXCJjaGF0c1wiKSkge1xyXG4gICAgICAgIHRoaXMuc2lkZWJhck1hbmFnZXJcclxuICAgICAgICAgIC51cGRhdGVDaGF0TGlzdCgpXHJcbiAgICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyBjaGF0IHBhbmVsIGxpc3QgdmlhIHNjaGVkdWxlU2lkZWJhckNoYXRMaXN0VXBkYXRlOlwiLCBlKSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMuY2hhdExpc3RVcGRhdGVUaW1lb3V0SWQgPSBudWxsO1xyXG4gICAgICB0aGlzLmlzQ2hhdExpc3RVcGRhdGVTY2hlZHVsZWQgPSBmYWxzZTtcclxuICAgIH0sIGRlbGF5KTtcclxuICB9O1xyXG5cclxuICAvLyBzcmMvT2xsYW1hVmlldy50c1xyXG5cclxuLy8gLi4uICjQv9GA0LjQv9GD0YHQutCw0ZTQvNC+LCDRidC+INCy0YHRliDQvdC10L7QsdGF0ZbQtNC90ZYg0ZbQvNC/0L7RgNGC0LgsIENTU19DTEFTU0VTLCBSZW5kZXJlclV0aWxzLCDRgNC10L3QtNC10YDQtdGA0Lgg0L/QvtCy0ZbQtNC+0LzQu9C10L3RjCwgZXRjLiDQstC20LUg0ZQpIC4uLlxyXG5cclxuYXN5bmMgbG9hZEFuZERpc3BsYXlBY3RpdmVDaGF0KCk6IFByb21pc2U8eyBtZXRhZGF0YVVwZGF0ZWQ6IGJvb2xlYW4gfT4ge1xyXG4gICAgbGV0IG1ldGFkYXRhVXBkYXRlZCA9IGZhbHNlO1xyXG4gICAgXHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgdGhpcy5jbGVhckNoYXRDb250YWluZXJJbnRlcm5hbCgpOyAvLyDQntGH0LjRidCw0ZQgdGhpcy5jaGF0Q29udGFpbmVyINGC0LAgdGhpcy5jdXJyZW50TWVzc2FnZXNcclxuXHJcbiAgICAgIHRoaXMubGFzdE1lc3NhZ2VFbGVtZW50ID0gbnVsbDtcclxuICAgICAgdGhpcy5jb25zZWN1dGl2ZUVycm9yTWVzc2FnZXMgPSBbXTsgLy8g0KHQutC40LTQsNGU0LzQviDQu9GW0YfQuNC70YzQvdC40Log0L/QvtGB0LvRltC00L7QstC90LjRhSDQv9C+0LzQuNC70L7QulxyXG4gICAgICB0aGlzLmVycm9yR3JvdXBFbGVtZW50ID0gbnVsbDsgICAgLy8g0KHQutC40LTQsNGU0LzQviDQs9GA0YPQv9GDINC/0L7QvNC40LvQvtC6XHJcblxyXG4gICAgICBsZXQgYWN0aXZlQ2hhdDogQ2hhdCB8IG51bGwgPSBudWxsO1xyXG4gICAgICBsZXQgYXZhaWxhYmxlTW9kZWxzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICBsZXQgZmluYWxNb2RlbE5hbWU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xyXG4gICAgICBsZXQgZmluYWxSb2xlUGF0aDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDsgLy8g0JTQvtC30LLQvtC70Y/RlNC80L4gdW5kZWZpbmVkINC00LvRjyDQv9C+0YfQsNGC0LrQvtCy0L7Qs9C+INGB0YLQsNC90YNcclxuICAgICAgbGV0IGZpbmFsUm9sZU5hbWU6IHN0cmluZyA9IFwiTm9uZVwiOyAvLyDQl9C90LDRh9C10L3QvdGPINC30LAg0LfQsNC80L7QstGH0YPQstCw0L3QvdGP0LxcclxuICAgICAgbGV0IGZpbmFsVGVtcGVyYXR1cmU6IG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7IC8vINCU0L7Qt9Cy0L7Qu9GP0ZTQvNC+IHVuZGVmaW5lZFxyXG4gICAgICBsZXQgZXJyb3JPY2N1cnJlZExvYWRpbmdEYXRhID0gZmFsc2U7XHJcblxyXG4gICAgICAvLyDQkdC70L7QuiDQt9Cw0LLQsNC90YLQsNC20LXQvdC90Y8g0LTQsNC90LjRhSDRh9Cw0YLRgyDRgtCwINC80L7QtNC10LvQtdC5XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcikge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDaGF0TWFuYWdlciBpcyBub3QgaW5pdGlhbGl6ZWQuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBhY3RpdmVDaGF0ID0gKGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXQoKSkgfHwgbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoIXRoaXMucGx1Z2luLm9sbGFtYVNlcnZpY2UpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiT2xsYW1hU2VydmljZSBpcyBub3QgaW5pdGlhbGl6ZWQuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBhdmFpbGFibGVNb2RlbHMgPSBhd2FpdCB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdldE1vZGVscygpO1xyXG5cclxuICAgICAgICAvLyDQktC40LfQvdCw0YfQsNGU0LzQviDRiNC70Y/RhSDRgtCwINGW0Lwn0Y8g0YDQvtC70ZZcclxuICAgICAgICBmaW5hbFJvbGVQYXRoID1cclxuICAgICAgICAgIGFjdGl2ZUNoYXQ/Lm1ldGFkYXRhPy5zZWxlY3RlZFJvbGVQYXRoICE9PSB1bmRlZmluZWQgLy8g0KHQv9C+0YfQsNGC0LrRgyDQtyDQvNC10YLQsNC00LDQvdC40YUg0YfQsNGC0YNcclxuICAgICAgICAgICAgPyBhY3RpdmVDaGF0Lm1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGhcclxuICAgICAgICAgICAgOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoOyAvLyDQn9C+0YLRltC8INC3INC90LDQu9Cw0YjRgtGD0LLQsNC90Ywg0L/Qu9Cw0LPRltC90LBcclxuICAgICAgICBmaW5hbFJvbGVOYW1lID0gYXdhaXQgdGhpcy5maW5kUm9sZU5hbWVCeVBhdGgoZmluYWxSb2xlUGF0aCk7IC8vIGZpbmRSb2xlTmFtZUJ5UGF0aCDQvNCw0ZQg0L7QsdGA0L7QsdC70Y/RgtC4IG51bGwvdW5kZWZpbmVkXHJcblxyXG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbmV3IE5vdGljZShcIkVycm9yIGNvbm5lY3RpbmcgdG8gT2xsYW1hIG9yIGxvYWRpbmcgY2hhdCBkYXRhLlwiLCA1MDAwKTtcclxuICAgICAgICBlcnJvck9jY3VycmVkTG9hZGluZ0RhdGEgPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyDQktGB0YLQsNC90L7QstC70Y7RlNC80L4g0LfQvdCw0YfQtdC90L3RjyDQt9CwINC30LDQvNC+0LLRh9GD0LLQsNC90L3Rj9C8INGDINGA0LDQt9GWINC/0L7QvNC40LvQutC4XHJcbiAgICAgICAgYXZhaWxhYmxlTW9kZWxzID0gYXZhaWxhYmxlTW9kZWxzIHx8IFtdOyAvLyDQn9C10YDQtdC60L7QvdGD0ZTQvNC+0YHRjywg0YnQviDRhtC1INC80LDRgdC40LJcclxuICAgICAgICBmaW5hbE1vZGVsTmFtZSA9IGF2YWlsYWJsZU1vZGVscy5pbmNsdWRlcyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWUpXHJcbiAgICAgICAgICA/IHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZVxyXG4gICAgICAgICAgOiBhdmFpbGFibGVNb2RlbHNbMF0gPz8gbnVsbDsgLy8g0K/QutGJ0L4g0LzQvtC00LXQu9GMINC3INC90LDQu9Cw0YjRgtGD0LLQsNC90Ywg0L3QtdC00L7RgdGC0YPQv9C90LAsINCx0LXRgNC10LzQviDQv9C10YDRiNGDINCw0LHQviBudWxsXHJcbiAgICAgICAgZmluYWxUZW1wZXJhdHVyZSA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnRlbXBlcmF0dXJlO1xyXG4gICAgICAgIGZpbmFsUm9sZVBhdGggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoO1xyXG4gICAgICAgIGZpbmFsUm9sZU5hbWUgPSBhd2FpdCB0aGlzLmZpbmRSb2xlTmFtZUJ5UGF0aChmaW5hbFJvbGVQYXRoKTsgLy8g0J/QvtCy0YLQvtGA0L3Qviwg0L3QsCDQstC40L/QsNC00L7QuiDRj9C60YnQviDQv9C+0L/QtdGA0LXQtNC90Y8g0YHQv9GA0L7QsdCwINC90LUg0LLQtNCw0LvQsNGB0Y9cclxuICAgICAgICBhY3RpdmVDaGF0ID0gbnVsbDsgLy8g0KHQutC40LTQsNGU0LzQviDQsNC60YLQuNCy0L3QuNC5INGH0LDRglxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyDQktC40LfQvdCw0YfQtdC90L3RjyDRhNGW0L3QsNC70YzQvdC+0Zcg0LzQvtC00LXQu9GWINGC0LAg0YLQtdC80L/QtdGA0LDRgtGD0YDQuFxyXG4gICAgICBpZiAoIWVycm9yT2NjdXJyZWRMb2FkaW5nRGF0YSAmJiBhY3RpdmVDaGF0KSB7XHJcbiAgICAgICAgbGV0IHByZWZlcnJlZE1vZGVsID0gYWN0aXZlQ2hhdC5tZXRhZGF0YT8ubW9kZWxOYW1lIHx8IHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZTtcclxuICAgICAgICBpZiAoYXZhaWxhYmxlTW9kZWxzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIGlmIChwcmVmZXJyZWRNb2RlbCAmJiBhdmFpbGFibGVNb2RlbHMuaW5jbHVkZXMocHJlZmVycmVkTW9kZWwpKSB7XHJcbiAgICAgICAgICAgIGZpbmFsTW9kZWxOYW1lID0gcHJlZmVycmVkTW9kZWw7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyDQr9C60YnQviDQsdCw0LbQsNC90LAg0LzQvtC00LXQu9GMINC90LXQtNC+0YHRgtGD0L/QvdCwLCDQstGB0YLQsNC90L7QstC70Y7RlNC80L4g0L/QtdGA0YjRgyDQtNC+0YHRgtGD0L/QvdGDXHJcbiAgICAgICAgICAgIGZpbmFsTW9kZWxOYW1lID0gYXZhaWxhYmxlTW9kZWxzWzBdOyBcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGZpbmFsTW9kZWxOYW1lID0gbnVsbDsgLy8g0J3QtdC80LDRlCDQtNC+0YHRgtGD0L/QvdC40YUg0LzQvtC00LXQu9C10LlcclxuICAgICAgICAgIFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8g0J7QvdC+0LLQu9C10L3QvdGPINC80LXRgtCw0LTQsNC90LjRhSDRh9Cw0YLRgywg0Y/QutGJ0L4g0LzQvtC00LXQu9GMINC30LzRltC90LjQu9Cw0YHRj1xyXG4gICAgICAgIGlmIChhY3RpdmVDaGF0Lm1ldGFkYXRhLm1vZGVsTmFtZSAhPT0gZmluYWxNb2RlbE5hbWUgJiYgZmluYWxNb2RlbE5hbWUgIT09IG51bGwpIHtcclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIpIHRocm93IG5ldyBFcnJvcihcIkNoYXRNYW5hZ2VyIG5vdCBhdmFpbGFibGUgZm9yIG1ldGFkYXRhIHVwZGF0ZS5cIik7XHJcbiAgICAgICAgICAgIGNvbnN0IHVwZGF0ZVN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci51cGRhdGVBY3RpdmVDaGF0TWV0YWRhdGEoeyBtb2RlbE5hbWU6IGZpbmFsTW9kZWxOYW1lIH0pO1xyXG4gICAgICAgICAgICBpZiAodXBkYXRlU3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgIG1ldGFkYXRhVXBkYXRlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgLy8g0J/QtdGA0LXQt9Cw0LLQsNC90YLQsNC20YPRlNC80L4g0LTQsNC90ZYg0YfQsNGC0YMsINGJ0L7QsSDQvtGC0YDQuNC80LDRgtC4INC+0L3QvtCy0LvQtdC90ZYg0LzQtdGC0LDQtNCw0L3RllxyXG4gICAgICAgICAgICAgIGNvbnN0IHBvdGVudGlhbGx5VXBkYXRlZENoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRDaGF0KGFjdGl2ZUNoYXQubWV0YWRhdGEuaWQpO1xyXG4gICAgICAgICAgICAgIGlmIChwb3RlbnRpYWxseVVwZGF0ZWRDaGF0KSBhY3RpdmVDaGF0ID0gcG90ZW50aWFsbHlVcGRhdGVkQ2hhdDtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSBjYXRjaCAodXBkYXRlRXJyb3IpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZpbmFsVGVtcGVyYXR1cmUgPSBhY3RpdmVDaGF0Lm1ldGFkYXRhPy50ZW1wZXJhdHVyZSA/PyB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZTtcclxuICAgICAgfSBlbHNlIGlmICghZXJyb3JPY2N1cnJlZExvYWRpbmdEYXRhICYmICFhY3RpdmVDaGF0KSB7IC8vINCv0LrRidC+INGH0LDRgiDQvdC1INC30LDQstCw0L3RgtCw0LbQtdC90L4sINCw0LvQtSDQvdC1INCx0YPQu9C+INC/0L7QvNC40LvQutC4ICjQvdCw0L/RgNC40LrQu9Cw0LQsINC90LXQvNCw0ZQg0LDQutGC0LjQstC90L7Qs9C+KVxyXG4gICAgICAgIGZpbmFsTW9kZWxOYW1lID0gYXZhaWxhYmxlTW9kZWxzLmluY2x1ZGVzKHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZSlcclxuICAgICAgICAgID8gdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lXHJcbiAgICAgICAgICA6IGF2YWlsYWJsZU1vZGVsc1swXSA/PyBudWxsO1xyXG4gICAgICAgIGZpbmFsVGVtcGVyYXR1cmUgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZTtcclxuICAgICAgICAvLyBmaW5hbFJvbGVQYXRoIGFuZCBmaW5hbFJvbGVOYW1lINCy0LbQtSDQstGB0YLQsNC90L7QstC70LXQvdGWINGA0LDQvdGW0YjQtVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyDQoNC10L3QtNC10YDQuNC90LMg0L/QvtCy0ZbQtNC+0LzQu9C10L3RjFxyXG4gICAgICBpZiAoYWN0aXZlQ2hhdCAmJiAhZXJyb3JPY2N1cnJlZExvYWRpbmdEYXRhICYmIGFjdGl2ZUNoYXQubWVzc2FnZXM/Lmxlbmd0aCA+IDApIHtcclxuICAgICAgICB0aGlzLmhpZGVFbXB0eVN0YXRlKCk7XHJcbiAgICAgICAgLy8gdGhpcy5jdXJyZW50TWVzc2FnZXMg0LLQttC1INC+0YfQuNGJ0LXQvdC+INCyIGNsZWFyQ2hhdENvbnRhaW5lckludGVybmFsLCDQt9Cw0L/QvtCy0L3RjtGU0LzQviDQudC+0LPQviDQt9C90L7QstGDXHJcbiAgICAgICAgdGhpcy5jdXJyZW50TWVzc2FnZXMgPSBbLi4uYWN0aXZlQ2hhdC5tZXNzYWdlc107IFxyXG4gICAgICAgIHRoaXMubGFzdFJlbmRlcmVkTWVzc2FnZURhdGUgPSBudWxsOyAvLyDQodC60LjQtNCw0ZTQvNC+INC00LvRjyDRgNC+0LfQtNGW0LvRjtCy0LDRh9GW0LIg0LTQsNGCXHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgbWVzc2FnZSBvZiB0aGlzLmN1cnJlbnRNZXNzYWdlcykge1xyXG4gICAgICAgICAgbGV0IG1lc3NhZ2VHcm91cEVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgICAgICAgIC8vINCf0LXRgNC10LLRltGA0LrQsCDQvdCwINC/0YDQvtC/0YPRgdC6INGA0LXQvdC00LXRgNC40L3Qs9GDINC00LvRjyBhc3Npc3RhbnQgKyB0b29sX2NhbGxzXHJcbiAgICAgICAgICBjb25zdCBpc0Fzc2lzdGFudCA9IG1lc3NhZ2Uucm9sZSA9PT0gXCJhc3Npc3RhbnRcIjtcclxuICAgICAgICAgIGNvbnN0IGhhc1Rvb2xDYWxscyA9ICEhKChtZXNzYWdlIGFzIEFzc2lzdGFudE1lc3NhZ2UpLnRvb2xfY2FsbHMgJiYgKG1lc3NhZ2UgYXMgQXNzaXN0YW50TWVzc2FnZSkudG9vbF9jYWxscyEubGVuZ3RoID4gMCk7XHJcblxyXG4gICAgICAgICAgaWYgKGlzQXNzaXN0YW50ICYmIGhhc1Rvb2xDYWxscykge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuaW5mbyhcclxuICAgICAgICAgICAgICBgW2xvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdF0gU0tJUFBJTkcgUkVOREVSIGZvciBISVNUT1JJQ0FMIGFzc2lzdGFudCBtZXNzYWdlIHdpdGggdG9vbF9jYWxscyAodHM6ICR7bWVzc2FnZS50aW1lc3RhbXAuZ2V0VGltZSgpfSlgLFxyXG4gICAgICAgICAgICAgIHsgY29udGVudFByZXZpZXc6IG1lc3NhZ2UuY29udGVudD8uc3Vic3RyaW5nKDAsNzApLCB0b29sX2NhbGxzOiAobWVzc2FnZSBhcyBBc3Npc3RhbnRNZXNzYWdlKS50b29sX2NhbGxzIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgY29udGludWU7IC8vINCf0YDQvtC/0YPRgdC60LDRlNC80L4g0YDQtdGI0YLRgyDRhtC40LrQu9GDINC00LvRjyDRhtGM0L7Qs9C+INC/0L7QstGW0LTQvtC80LvQtdC90L3Rj1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vINCb0L7Qs9GW0LrQsCDQtNC70Y8g0YDQvtC30LTRltC70Y7QstCw0YfRltCyINC00LDRglxyXG4gICAgICAgICAgY29uc3QgaXNOZXdEYXkgPVxyXG4gICAgICAgICAgICAhdGhpcy5sYXN0UmVuZGVyZWRNZXNzYWdlRGF0ZSB8fCAhdGhpcy5pc1NhbWVEYXkodGhpcy5sYXN0UmVuZGVyZWRNZXNzYWdlRGF0ZSwgbWVzc2FnZS50aW1lc3RhbXApO1xyXG4gICAgICAgICAgLy8gaXNGaXJzdE1lc3NhZ2VJbkNvbnRhaW5lciDRgtC10L/QtdGAINC/0LXRgNC10LLRltGA0Y/RlCDRgNC10LDQu9GM0L3RgyDQutGW0LvRjNC60ZbRgdGC0Ywg0LTRltGC0LXQuSDQsiBET00sINCwINC90LUgdGhpcy5jdXJyZW50TWVzc2FnZXMubGVuZ3RoXHJcbiAgICAgICAgICBjb25zdCBpc0ZpcnN0UmVuZGVyZWRNZXNzYWdlSW5Db250YWluZXIgPSB0aGlzLmNoYXRDb250YWluZXIuY2hpbGRyZW4ubGVuZ3RoID09PSAwO1xyXG5cclxuICAgICAgICAgIGlmIChpc05ld0RheSB8fCBpc0ZpcnN0UmVuZGVyZWRNZXNzYWdlSW5Db250YWluZXIpIHtcclxuICAgICAgICAgICAgaWYgKGlzTmV3RGF5ICYmICFpc0ZpcnN0UmVuZGVyZWRNZXNzYWdlSW5Db250YWluZXIpIHsgLy8g0J3QtSDQtNC+0LTQsNGU0LzQviDRgNC+0LfQtNGW0LvRjtCy0LDRhyDQv9C10YDQtdC0INC/0LXRgNGI0LjQvCDQv9C+0LLRltC00L7QvNC70LXQvdC90Y/QvFxyXG4gICAgICAgICAgICAgIHRoaXMucmVuZGVyRGF0ZVNlcGFyYXRvcihtZXNzYWdlLnRpbWVzdGFtcCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5sYXN0UmVuZGVyZWRNZXNzYWdlRGF0ZSA9IG1lc3NhZ2UudGltZXN0YW1wOyAvLyDQntC90L7QstC70Y7RlNC80L4g0LTQsNGC0YMg0L7RgdGC0LDQvdC90YzQvtCz0L4g0JLQhtCU0KDQldCd0JTQldCg0JXQndCe0JPQniDQv9C+0LLRltC00L7QvNC70LXQvdC90Y9cclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyDQodGC0LLQvtGA0LXQvdC90Y8g0YLQsCDRgNC10L3QtNC10YDQuNC90LMg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPXHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBsZXQgcmVuZGVyZXI6IFVzZXJNZXNzYWdlUmVuZGVyZXIgfCBBc3Npc3RhbnRNZXNzYWdlUmVuZGVyZXIgfCBTeXN0ZW1NZXNzYWdlUmVuZGVyZXIgfCBFcnJvck1lc3NhZ2VSZW5kZXJlciB8IFRvb2xNZXNzYWdlUmVuZGVyZXIgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIHN3aXRjaCAobWVzc2FnZS5yb2xlKSB7XHJcbiAgICAgICAgICAgICAgY2FzZSBcInVzZXJcIjpcclxuICAgICAgICAgICAgICAgIHJlbmRlcmVyID0gbmV3IFVzZXJNZXNzYWdlUmVuZGVyZXIodGhpcy5hcHAsIHRoaXMucGx1Z2luLCBtZXNzYWdlLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgIGNhc2UgXCJhc3Npc3RhbnRcIjogLy8g0KbQtSDQsdGD0LTQtSDQsNGB0LjRgdGC0LXQvdGCINCR0JXQlyB0b29sX2NhbGxzXHJcbiAgICAgICAgICAgICAgICByZW5kZXJlciA9IG5ldyBBc3Npc3RhbnRNZXNzYWdlUmVuZGVyZXIodGhpcy5hcHAsIHRoaXMucGx1Z2luLCBtZXNzYWdlIGFzIEFzc2lzdGFudE1lc3NhZ2UsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgY2FzZSBcInN5c3RlbVwiOlxyXG4gICAgICAgICAgICAgICAgcmVuZGVyZXIgPSBuZXcgU3lzdGVtTWVzc2FnZVJlbmRlcmVyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgbWVzc2FnZSwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICBjYXNlIFwiZXJyb3JcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlRXJyb3JNZXNzYWdlKG1lc3NhZ2UpOyAvLyDQntCx0YDQvtCx0LvRj9GUINGWINC00L7QtNCw0ZQg0LTQviBET01cclxuICAgICAgICAgICAgICAgIG1lc3NhZ2VHcm91cEVsID0gdGhpcy5lcnJvckdyb3VwRWxlbWVudDsgLy8g0K/QutGJ0L4gaGFuZGxlRXJyb3JNZXNzYWdlINC50L7Qs9C+INCy0YHRgtCw0L3QvtCy0LvRjtGUXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICBjYXNlIFwidG9vbFwiOlxyXG4gICAgICAgICAgICAgICAgcmVuZGVyZXIgPSBuZXcgVG9vbE1lc3NhZ2VSZW5kZXJlcih0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIG1lc3NhZ2UsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgY29uc3QgdW5rbm93blJvbGVHcm91cCA9IHRoaXMuY2hhdENvbnRhaW5lcj8uY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NFUy5NRVNTQUdFX0dST1VQIH0pO1xyXG4gICAgICAgICAgICAgICAgaWYgKHVua25vd25Sb2xlR3JvdXAgJiYgdGhpcy5jaGF0Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgICAgICAgIFJlbmRlcmVyVXRpbHMucmVuZGVyQXZhdGFyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgdW5rbm93blJvbGVHcm91cCwgZmFsc2UpOyAvLyDQkNCy0LDRgtCw0YAg0LfQsCDQt9Cw0LzQvtCy0YfRg9Cy0LDQvdC90Y/QvFxyXG4gICAgICAgICAgICAgICAgICBjb25zdCB3cmFwcGVyID0gdW5rbm93blJvbGVHcm91cC5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLk1FU1NBR0VfV1JBUFBFUiB8fCBcIm1lc3NhZ2Utd3JhcHBlclwiIH0pO1xyXG4gICAgICAgICAgICAgICAgICBjb25zdCBtc2dCdWJibGUgPSB3cmFwcGVyLmNyZWF0ZURpdih7IGNsczogYCR7Q1NTX0NMQVNTRVMuTUVTU0FHRX0gJHtDU1NfQ0xBU1NFUy5TWVNURU1fTUVTU0FHRX1gIH0pO1xyXG4gICAgICAgICAgICAgICAgICBtc2dCdWJibGUuY3JlYXRlRGl2KHtcclxuICAgICAgICAgICAgICAgICAgICBjbHM6IENTU19DTEFTU0VTLlNZU1RFTV9NRVNTQUdFX1RFWFQgfHwgXCJzeXN0ZW0tbWVzc2FnZS10ZXh0XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dDogYFVua25vd24gbWVzc2FnZSByb2xlOiAkeyhtZXNzYWdlIGFzIGFueSkucm9sZX1gLCAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+IGFzIGFueSDQtNC70Y8g0LHQtdC30L/QtdC60LhcclxuICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgIEJhc2VNZXNzYWdlUmVuZGVyZXIuYWRkVGltZXN0YW1wKG1zZ0J1YmJsZSwgbWVzc2FnZS50aW1lc3RhbXAsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgICBtZXNzYWdlR3JvdXBFbCA9IHVua25vd25Sb2xlR3JvdXA7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKHJlbmRlcmVyICYmIG1lc3NhZ2Uucm9sZSAhPT0gXCJlcnJvclwiKSB7IC8vINCf0L7QvNC40LvQutC4INC+0LHRgNC+0LHQu9GP0Y7RgtGM0YHRjyDQvtC60YDQtdC80L5cclxuICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSByZW5kZXJlci5yZW5kZXIoKTtcclxuICAgICAgICAgICAgICBtZXNzYWdlR3JvdXBFbCA9IHJlc3VsdCBpbnN0YW5jZW9mIFByb21pc2UgPyBhd2FpdCByZXN1bHQgOiByZXN1bHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0gY2F0Y2ggKHJlbmRlckVycm9yOiBhbnkpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vINCh0YLQstC+0YDRjtGU0LzQviDQtdC70LXQvNC10L3RgiDQv9C+0LzQuNC70LrQuCDRgNC10L3QtNC10YDQuNC90LPRg1xyXG4gICAgICAgICAgICBjb25zdCBlcnJvckRpdiA9IHRoaXMuY2hhdENvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLkVSUk9SX01FU1NBR0UgfHwgXCJyZW5kZXItZXJyb3JcIiB9KTsgLy8g0J/QtdGA0LXQutC+0L3QsNC50YHRjywg0YnQviBDU1NfQ0xBU1NFUy5FUlJPUl9NRVNTQUdFINCy0LjQt9C90LDRh9C10L3QvlxyXG4gICAgICAgICAgICBlcnJvckRpdi5zZXRUZXh0KGBFcnJvciByZW5kZXJpbmcgbWVzc2FnZSAocm9sZTogJHttZXNzYWdlLnJvbGV9KTogJHtyZW5kZXJFcnJvci5tZXNzYWdlfWApO1xyXG4gICAgICAgICAgICBtZXNzYWdlR3JvdXBFbCA9IGVycm9yRGl2O1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChtZXNzYWdlR3JvdXBFbCkge1xyXG4gICAgICAgICAgICAvLyDQlNC+0LTQsNGU0LzQviDQtdC70LXQvNC10L3Rgiwg0YLRltC70YzQutC4INGP0LrRidC+INCy0ZbQvSDRidC1INC90LUg0ZQg0LTQvtGH0ZbRgNC90ZbQvCAo0L3QsNC/0YDQuNC60LvQsNC0LCBoYW5kbGVFcnJvck1lc3NhZ2Ug0LzRltCzINCy0LbQtSDQtNC+0LTQsNGC0LgpXHJcbiAgICAgICAgICAgIGlmIChtZXNzYWdlR3JvdXBFbC5wYXJlbnRFbGVtZW50ICE9PSB0aGlzLmNoYXRDb250YWluZXIpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5hcHBlbmRDaGlsZChtZXNzYWdlR3JvdXBFbCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5sYXN0TWVzc2FnZUVsZW1lbnQgPSBtZXNzYWdlR3JvdXBFbDtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IC8vINCa0ZbQvdC10YbRjCDRhtC40LrQu9GDIGZvclxyXG5cclxuICAgICAgICAvLyDQkNGB0LjQvdGF0YDQvtC90L3RliDQvtC90L7QstC70LXQvdC90Y8g0L/RltGB0LvRjyDRgNC10L3QtNC10YDQuNC90LPRgyDQstGB0ZbRhSDQv9C+0LLRltC00L7QvNC70LXQvdGMXHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLmNoZWNrQWxsTWVzc2FnZXNGb3JDb2xsYXBzaW5nKCksIDEwMCk7XHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbSgxMDAsIHRydWUpOyAvLyDQp9C10LrQsNGU0LzQviDRgtGA0L7RhdC4LCDRidC+0LEgRE9NINC+0L3QvtCy0LjQstGB0Y9cclxuICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVNjcm9sbFN0YXRlQW5kSW5kaWNhdG9ycygpOyAvLyDQntC90L7QstC70Y7RlNC80L4g0ZbQvdC00LjQutCw0YLQvtGA0Lgg0L/RgNC+0LrRgNGD0YLQutC4XHJcbiAgICAgICAgICB9LCAxNTApOyAvLyDQlNC+0LTQsNGC0LrQvtCy0LAg0LfQsNGC0YDQuNC80LrQsCDQtNC70Y8g0YHRgtCw0LHRltC70ZbQt9Cw0YbRltGXINC/0YDQvtC60YDRg9GC0LrQuFxyXG4gICAgICAgIH0sIDE1MCk7XHJcbiAgICAgIH0gZWxzZSB7IC8vINCv0LrRidC+INC90LXQvNCw0ZQg0L/QvtCy0ZbQtNC+0LzQu9C10L3RjCDQsNCx0L4g0YHRgtCw0LvQsNGB0Y8g0L/QvtC80LjQu9C60LAg0LfQsNCy0LDQvdGC0LDQttC10L3QvdGPINC00LDQvdC40YUg0YfQsNGC0YNcclxuICAgICAgICB0aGlzLnNob3dFbXB0eVN0YXRlKGVycm9yT2NjdXJyZWRMb2FkaW5nRGF0YSA/IFwiRXJyb3IgbG9hZGluZyBjaGF0LlwiIDogXCJUaGlzIGNoYXQgaXMgZW1wdHkuXCIpO1xyXG4gICAgICAgIHRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTRVMuVklTSUJMRSB8fCBcInZpc2libGVcIik7IC8vINCf0LXRgNC10LrQvtC90LDQudGB0Y8sINGJ0L4gQ1NTX0NMQVNTRVMuVklTSUJMRSDQstC40LfQvdCw0YfQtdC90L5cclxuICAgICAgfVxyXG5cclxuICAgICAgLy8g0J7QvdC+0LLQu9C10L3QvdGPINC10LvQtdC80LXQvdGC0ZbQsiBVSSAo0LfQsNCz0L7Qu9C+0LLQvtC6LCDQvNC+0LTQtdC70YwsINGC0LXQvNC/0LXRgNCw0YLRg9GA0LAg0ZYg0YIu0LQuKVxyXG4gICAgICB0aGlzLnVwZGF0ZUlucHV0UGxhY2Vob2xkZXIoZmluYWxSb2xlTmFtZSk7XHJcbiAgICAgIHRoaXMudXBkYXRlUm9sZURpc3BsYXkoZmluYWxSb2xlTmFtZSk7XHJcbiAgICAgIHRoaXMudXBkYXRlTW9kZWxEaXNwbGF5KGZpbmFsTW9kZWxOYW1lKTtcclxuICAgICAgdGhpcy51cGRhdGVUZW1wZXJhdHVyZUluZGljYXRvcihmaW5hbFRlbXBlcmF0dXJlKTtcclxuXHJcbiAgICAgIC8vINCe0L3QvtCy0LvQtdC90L3RjyDRgdGC0LDQvdGDINGW0L3Qv9GD0YIg0L/QvtC70Y8g0YLQsCDQutC90L7Qv9C60Lgg0LLRltC00L/RgNCw0LLQutC4XHJcbiAgICAgIGlmIChmaW5hbE1vZGVsTmFtZSA9PT0gbnVsbCkgeyAvLyDQr9C60YnQviDQvdC10LzQsNGUINC00L7RgdGC0YPQv9C90LjRhSDQvNC+0LTQtdC70LXQuVxyXG4gICAgICAgIGlmICh0aGlzLmlucHV0RWwpIHtcclxuICAgICAgICAgIHRoaXMuaW5wdXRFbC5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICAgICAgICB0aGlzLmlucHV0RWwucGxhY2Vob2xkZXIgPSBcIk5vIG1vZGVscyBhdmFpbGFibGUuLi5cIjtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMuc2VuZEJ1dHRvbikge1xyXG4gICAgICAgICAgdGhpcy5zZW5kQnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcclxuICAgICAgICAgIHRoaXMuc2VuZEJ1dHRvbi5jbGFzc0xpc3QuYWRkKENTU19DTEFTU0VTLkRJU0FCTEVEIHx8IFwiZGlzYWJsZWRcIik7IC8vINCf0LXRgNC10LrQvtC90LDQudGB0Y8sINGJ0L4gQ1NTX0NMQVNTRVMuRElTQUJMRUQg0LLQuNC30L3QsNGH0LXQvdC+XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmlzUHJvY2Vzc2luZykgdGhpcy5zZXRMb2FkaW5nU3RhdGUoZmFsc2UpOyAvLyDQodC60LjQtNCw0ZTQvNC+INGB0YLQsNC9INC30LDQstCw0L3RgtCw0LbQtdC90L3Rjywg0Y/QutGJ0L4g0LLRltC9INCx0YPQsiDQsNC60YLQuNCy0L3QuNC5XHJcbiAgICAgIH0gZWxzZSB7IC8vINCv0LrRidC+INC80L7QtNC10LvRliDRlFxyXG4gICAgICAgIGlmICh0aGlzLmlucHV0RWwgJiYgIXRoaXMuaXNQcm9jZXNzaW5nKSB7IC8vINCg0L7Qt9Cx0LvQvtC60L7QstGD0ZTQvNC+INGW0L3Qv9GD0YIsINGP0LrRidC+INC90LUg0LnQtNC1INC+0LHRgNC+0LHQutCwXHJcbiAgICAgICAgICB0aGlzLmlucHV0RWwuZGlzYWJsZWQgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy51cGRhdGVTZW5kQnV0dG9uU3RhdGUoKTsgLy8g0J7QvdC+0LLQu9GO0ZTQvNC+INGB0YLQsNC9INC60L3QvtC/0LrQuCDQstGW0LTQv9GA0LDQstC60LhcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICBcclxuICAgICAgdGhpcy5jbGVhckNoYXRDb250YWluZXJJbnRlcm5hbCgpOyAvLyDQntGH0LjRidCw0ZTQvNC+INCy0YHQtVxyXG4gICAgICB0aGlzLnNob3dFbXB0eVN0YXRlKFwiRmF0YWwgZXJyb3IuXCIpOyAvLyDQn9C+0LrQsNC30YPRlNC80L4g0YHRgtCw0L0g0L/QvtC80LjQu9C60LhcclxuICAgICAgaWYgKHRoaXMuY2hhdENvbnRhaW5lcikge1xyXG4gICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5jcmVhdGVEaXYoe1xyXG4gICAgICAgICAgY2xzOiBcImZhdGFsLWVycm9yLW1lc3NhZ2VcIiwgLy8g0JrQu9Cw0YEg0LTQu9GPINC/0L7QstGW0LTQvtC80LvQtdC90L3RjyDQv9GA0L4g0YTQsNGC0LDQu9GM0L3RgyDQv9C+0LzQuNC70LrRg1xyXG4gICAgICAgICAgdGV4dDogXCJBIGNyaXRpY2FsIGVycm9yIG9jY3VycmVkIHdoaWxlIGxvYWRpbmcgdGhlIGNoYXQuIFBsZWFzZSBjaGVjayB0aGUgY29uc29sZSBvciB0cnkgcmVzdGFydGluZy5cIixcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICAvLyDQotGD0YIg0L3QtSDQv9C+0LLQtdGA0YLQsNGU0LzQviBtZXRhZGF0YVVwZGF0ZWQsINCx0L4g0YHRgtCw0LvQsNGB0Y8g0YTQsNGC0LDQu9GM0L3QsCDQv9C+0LzQuNC70LrQsFxyXG4gICAgICByZXR1cm4geyBtZXRhZGF0YVVwZGF0ZWQ6IGZhbHNlIH07IC8vINCQ0LHQviDQvNC+0LbQvdCwINC60LjQvdGD0YLQuCDQv9C+0LzQuNC70LrRgyDQtNCw0LvRllxyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgLy8g0JzQvtC20L3QsCDQtNC+0LTQsNGC0Lgg0LvQvtCz0YPQstCw0L3QvdGPINC30LDQstC10YDRiNC10L3QvdGPINC80LXRgtC+0LTRg1xyXG4gICAgICBcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4geyBtZXRhZGF0YVVwZGF0ZWQgfTtcclxuICB9XHJcblxyXG5cclxuICBcclxuICBwcml2YXRlIGhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkID0gYXN5bmMgKGRhdGE6IHsgY2hhdElkOiBzdHJpbmcgfCBudWxsOyBjaGF0OiBDaGF0IHwgbnVsbCB9KTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICBpZiAodGhpcy5pc1JlZ2VuZXJhdGluZyAmJiBkYXRhLmNoYXRJZCA9PT0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0QWN0aXZlQ2hhdElkKCkpIHtcclxuICAgICAgdGhpcy5sYXN0UHJvY2Vzc2VkQ2hhdElkID0gZGF0YS5jaGF0SWQ7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjaGF0U3dpdGNoZWQgPSBkYXRhLmNoYXRJZCAhPT0gdGhpcy5sYXN0UHJvY2Vzc2VkQ2hhdElkO1xyXG4gICAgbGV0IG1ldGFkYXRhV2FzVXBkYXRlZEJ5TG9hZCA9IGZhbHNlO1xyXG5cclxuICAgIGlmIChjaGF0U3dpdGNoZWQgfHwgKGRhdGEuY2hhdElkICE9PSBudWxsICYmIGRhdGEuY2hhdCA9PT0gbnVsbCkpIHtcclxuICAgICAgdGhpcy5sYXN0UHJvY2Vzc2VkQ2hhdElkID0gZGF0YS5jaGF0SWQ7XHJcblxyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdCgpO1xyXG4gICAgICBtZXRhZGF0YVdhc1VwZGF0ZWRCeUxvYWQgPSByZXN1bHQubWV0YWRhdGFVcGRhdGVkO1xyXG4gICAgfSBlbHNlIGlmIChkYXRhLmNoYXRJZCAhPT0gbnVsbCAmJiBkYXRhLmNoYXQgIT09IG51bGwpIHtcclxuICAgICAgdGhpcy5sYXN0UHJvY2Vzc2VkQ2hhdElkID0gZGF0YS5jaGF0SWQ7XHJcbiAgICAgIGNvbnN0IGNoYXQgPSBkYXRhLmNoYXQ7XHJcblxyXG4gICAgICBjb25zdCBjdXJyZW50Um9sZVBhdGggPSBjaGF0Lm1ldGFkYXRhPy5zZWxlY3RlZFJvbGVQYXRoID8/IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XHJcbiAgICAgIGNvbnN0IGN1cnJlbnRSb2xlTmFtZSA9IGF3YWl0IHRoaXMuZmluZFJvbGVOYW1lQnlQYXRoKGN1cnJlbnRSb2xlUGF0aCk7XHJcbiAgICAgIGNvbnN0IGN1cnJlbnRNb2RlbE5hbWUgPSBjaGF0Lm1ldGFkYXRhPy5tb2RlbE5hbWUgfHwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xyXG4gICAgICBjb25zdCBjdXJyZW50VGVtcGVyYXR1cmUgPSBjaGF0Lm1ldGFkYXRhPy50ZW1wZXJhdHVyZSA/PyB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZTtcclxuXHJcbiAgICAgIHRoaXMudXBkYXRlTW9kZWxEaXNwbGF5KGN1cnJlbnRNb2RlbE5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZVJvbGVEaXNwbGF5KGN1cnJlbnRSb2xlTmFtZSk7XHJcbiAgICAgIHRoaXMudXBkYXRlSW5wdXRQbGFjZWhvbGRlcihjdXJyZW50Um9sZU5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZVRlbXBlcmF0dXJlSW5kaWNhdG9yKGN1cnJlbnRUZW1wZXJhdHVyZSk7XHJcbiAgICB9IGVsc2UgaWYgKGRhdGEuY2hhdElkID09PSBudWxsKSB7XHJcbiAgICAgIHRoaXMubGFzdFByb2Nlc3NlZENoYXRJZCA9IG51bGw7XHJcbiAgICAgIHRoaXMuY2xlYXJEaXNwbGF5QW5kU3RhdGUoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMubGFzdFByb2Nlc3NlZENoYXRJZCA9IGRhdGEuY2hhdElkO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghbWV0YWRhdGFXYXNVcGRhdGVkQnlMb2FkKSB7XHJcbiAgICAgIHRoaXMuc2NoZWR1bGVTaWRlYmFyQ2hhdExpc3RVcGRhdGUoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuc2lkZWJhck1hbmFnZXI/LmlzU2VjdGlvblZpc2libGUoXCJyb2xlc1wiKSkge1xyXG4gICAgICB0aGlzLnNpZGViYXJNYW5hZ2VyXHJcbiAgICAgICAgLnVwZGF0ZVJvbGVMaXN0KClcclxuICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyByb2xlIHBhbmVsIGxpc3QgaW4gaGFuZGxlQWN0aXZlQ2hhdENoYW5nZWQ6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyKSB7XHJcbiAgICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlclxyXG4gICAgICAgIC51cGRhdGVSb2xlTGlzdElmVmlzaWJsZSgpXHJcbiAgICAgICAgLmNhdGNoKGUgPT4gdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiRXJyb3IgdXBkYXRpbmcgcm9sZSBkcm9wZG93biBsaXN0IGluIGhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkOlwiLCBlKSk7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBfbWFuYWdlUGxhY2Vob2xkZXIodHVyblRpbWVzdGFtcDogbnVtYmVyLCByZXF1ZXN0VGltZXN0YW1wSWQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgJiYgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci50aW1lc3RhbXAgIT09IHR1cm5UaW1lc3RhbXApIHtcclxuICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5jbGFzc0xpc3QuY29udGFpbnMoXCJwbGFjZWhvbGRlclwiKSkge1xyXG4gICAgICAgIGlmICh0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmdyb3VwRWwuaXNDb25uZWN0ZWQpIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5yZW1vdmUoKTtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRoaXMuYWN0aXZlUGxhY2Vob2xkZXIpIHtcclxuICAgICAgY29uc3QgcGxhY2Vob2xkZXJHcm91cEVsID0gdGhpcy5jaGF0Q29udGFpbmVyLmNyZWF0ZURpdih7XHJcbiAgICAgICAgY2xzOiBgJHtDU1NfQ0xBU1NFUy5NRVNTQUdFX0dST1VQfSAke0NTU19DTEFTU0VTLk9MTEFNQV9HUk9VUH0gcGxhY2Vob2xkZXJgLFxyXG4gICAgICB9KTtcclxuICAgICAgcGxhY2Vob2xkZXJHcm91cEVsLnNldEF0dHJpYnV0ZShcImRhdGEtcGxhY2Vob2xkZXItdGltZXN0YW1wXCIsIHR1cm5UaW1lc3RhbXAudG9TdHJpbmcoKSk7XHJcbiAgICAgIFJlbmRlcmVyVXRpbHMucmVuZGVyQXZhdGFyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgcGxhY2Vob2xkZXJHcm91cEVsLCBmYWxzZSwgXCJhc3Npc3RhbnRcIik7XHJcbiAgICAgIGNvbnN0IHdyYXBwZXJFbCA9IHBsYWNlaG9sZGVyR3JvdXBFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLk1FU1NBR0VfV1JBUFBFUiB8fCBcIm1lc3NhZ2Utd3JhcHBlclwiIH0pO1xyXG4gICAgICB3cmFwcGVyRWwuc3R5bGUub3JkZXIgPSBcIjJcIjtcclxuICAgICAgY29uc3QgbXNnRWwgPSB3cmFwcGVyRWwuY3JlYXRlRGl2KHsgY2xzOiBgJHtDU1NfQ0xBU1NFUy5NRVNTQUdFfSAke0NTU19DTEFTU0VTLk9MTEFNQV9NRVNTQUdFfWAgfSk7XHJcbiAgICAgIGNvbnN0IGNvbnRlbnRDb250YWluZXJFbCA9IG1zZ0VsLmNyZWF0ZURpdih7IGNsczogQ1NTX0NMQVNTRVMuQ09OVEVOVF9DT05UQUlORVIgfSk7XHJcbiAgICAgIGNvbnN0IGNvbnRlbnRQbGFjZWhvbGRlckVsID0gY29udGVudENvbnRhaW5lckVsLmNyZWF0ZURpdih7XHJcbiAgICAgICAgY2xzOiBgJHtDU1NfQ0xBU1NFUy5DT05URU5UfSAke0NTU19DTEFTU0VTLkNPTlRFTlRfQ09MTEFQU0lCTEV9IHN0cmVhbWluZy10ZXh0YCxcclxuICAgICAgfSk7XHJcbiAgICAgIGNvbnRlbnRQbGFjZWhvbGRlckVsLmVtcHR5KCk7XHJcbiAgICAgIGNvbnN0IGRvdHMgPSBjb250ZW50UGxhY2Vob2xkZXJFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLlRISU5LSU5HX0RPVFMgfSk7XHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSBkb3RzLmNyZWF0ZURpdih7IGNsczogQ1NTX0NMQVNTRVMuVEhJTktJTkdfRE9UIH0pO1xyXG4gICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0ge1xyXG4gICAgICAgIHRpbWVzdGFtcDogdHVyblRpbWVzdGFtcCxcclxuICAgICAgICBncm91cEVsOiBwbGFjZWhvbGRlckdyb3VwRWwsXHJcbiAgICAgICAgY29udGVudEVsOiBjb250ZW50UGxhY2Vob2xkZXJFbCxcclxuICAgICAgICBtZXNzYWdlV3JhcHBlcjogd3JhcHBlckVsLFxyXG4gICAgICB9O1xyXG4gICAgICBwbGFjZWhvbGRlckdyb3VwRWwuY2xhc3NMaXN0LmFkZChDU1NfQ0xBU1NFUy5NRVNTQUdFX0FSUklWSU5HIHx8IFwibWVzc2FnZS1hcnJpdmluZ1wiKTtcclxuICAgICAgc2V0VGltZW91dCgoKSA9PiBwbGFjZWhvbGRlckdyb3VwRWw/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTRVMuTUVTU0FHRV9BUlJJVklORyB8fCBcIm1lc3NhZ2UtYXJyaXZpbmdcIiksIDUwMCk7XHJcbiAgICAgIHRoaXMuZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKDUwLCB0cnVlKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuY29udGVudEVsLmVtcHR5KCk7XHJcbiAgICAgIGNvbnN0IGRvdHMgPSB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLlRISU5LSU5HX0RPVFMgfSk7XHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSBkb3RzLmNyZWF0ZURpdih7IGNsczogQ1NTX0NMQVNTRVMuVEhJTktJTkdfRE9UIH0pO1xyXG4gICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmNvbnRlbnRFbC5jbGFzc0xpc3QuYWRkKFwic3RyZWFtaW5nLXRleHRcIik7XHJcbiAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIudGltZXN0YW1wID0gdHVyblRpbWVzdGFtcDtcclxuICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLnNldEF0dHJpYnV0ZShcImRhdGEtcGxhY2Vob2xkZXItdGltZXN0YW1wXCIsIHR1cm5UaW1lc3RhbXAudG9TdHJpbmcoKSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAgcHJpdmF0ZSBhc3luYyBfcHJvY2Vzc0xsbVN0cmVhbShcclxuICAgIGxsbVN0cmVhbTogQXN5bmNJdGVyYWJsZUl0ZXJhdG9yPE9sbGFtYVN0cmVhbUNodW5rPiwgLy8g0KLQtdC/0LXRgCDRgtC40L8g0LzQsNGUINCx0YPRgtC4INGB0YPQvNGW0YHQvdC40LxcclxuICAgIHRpbWVzdGFtcE1zOiBudW1iZXIsXHJcbiAgICByZXF1ZXN0VGltZXN0YW1wSWQ6IG51bWJlclxyXG4gICk6IFByb21pc2U8eyBhY2N1bXVsYXRlZENvbnRlbnQ6IHN0cmluZzsgbmF0aXZlVG9vbENhbGxzOiBUb29sQ2FsbFtdIHwgbnVsbDsgYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxsczogQXNzaXN0YW50TWVzc2FnZSB8IG51bGwgfT4ge1xyXG4gICAgXHJcbiAgICBsZXQgYWNjdW11bGF0ZWRDb250ZW50ID0gXCJcIjsgXHJcbiAgICBsZXQgcGFyc2VkVG9vbENhbGxzOiBUb29sQ2FsbFtdIHwgbnVsbCA9IG51bGw7XHJcbiAgICBsZXQgZnVsbFJlc3BvbnNlQnVmZmVyID0gXCJcIjsgXHJcbiAgICBsZXQgdG9vbENhbGxJZENvdW50ZXIgPSAwO1xyXG5cclxuICAgIGNvbnN0IHRvb2xDYWxsU3RhcnRUYWcgPSBcIjx0b29sX2NhbGw+XCI7XHJcbiAgICBjb25zdCB0b29sQ2FsbEVuZFRhZyA9IFwiPC90b29sX2NhbGw+XCI7XHJcblxyXG4gICAgZm9yIGF3YWl0IChjb25zdCBjaHVuayBvZiBsbG1TdHJlYW0pIHtcclxuICAgICAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFwiW19wcm9jZXNzTGxtU3RyZWFtXSBSZWNlaXZlZCBjaHVuazpcIiwgY2h1bmspO1xyXG5cclxuICAgICAgbGV0IGlzTGFzdENodW5rID0gZmFsc2U7XHJcblxyXG4gICAgICBpZiAoJ2Vycm9yJyBpbiBjaHVuayAmJiBjaHVuay5lcnJvcikgeyAvLyBPbGxhbWFFcnJvckNodW5rXHJcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW19wcm9jZXNzTGxtU3RyZWFtXSBSZWNlaXZlZCBlcnJvciBjaHVuazpcIiwgY2h1bmsuZXJyb3IpO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgT2xsYW1hIHN0cmVhbSBlcnJvcjogJHtjaHVuay5lcnJvcn1gKTtcclxuICAgICAgfSBcclxuICAgICAgLy8g0J/QtdGA0LXQstGW0YDRj9GU0LzQviDQvdCwIE9sbGFtYVRvb2xDYWxsc0NodW5rINC/0LXRgNGI0LjQvCwg0Y/QutGJ0L4g0LLRltC9INC80LDRlCDQv9C+0LvQtSAndHlwZSdcclxuICAgICAgLy8g0J/QvtGC0YDRltCx0L3QviDQv9C10YDQtdC60L7QvdCw0YLQuNGB0Y8sINGJ0L4gT2xsYW1hR2VuZXJhdGVDaHVuayDQvdC1INC80LDRlCAndHlwZTogXCJ0b29sX2NhbGxzXCInXHJcbiAgICAgIC8vINCw0LHQviDQtNC+0LTQsNGC0LggJ3R5cGU6IFwiY29udGVudFwiJyDQtNC+IE9sbGFtYUdlbmVyYXRlQ2h1bmtcclxuICAgICAgZWxzZSBpZiAoJ3R5cGUnIGluIGNodW5rICYmIGNodW5rLnR5cGUgPT09IFwidG9vbF9jYWxsc1wiICYmICdjYWxscycgaW4gY2h1bmspIHsgLy8gT2xsYW1hVG9vbENhbGxzQ2h1bmtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbX3Byb2Nlc3NMbG1TdHJlYW1dIFJlY2VpdmVkIHN0cnVjdHVyZWQgdG9vbF9jYWxscyBjaHVuazpcIiwgY2h1bmsuY2FsbHMpO1xyXG4gICAgICAgIGlmICghcGFyc2VkVG9vbENhbGxzKSBwYXJzZWRUb29sQ2FsbHMgPSBbXTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGNvbnN0IGNhbGwgb2YgY2h1bmsuY2FsbHMpIHtcclxuICAgICAgICAgICAgIC8vINCU0L7QtNCw0ZTQvNC+INC/0LXRgNC10LLRltGA0LrRgywg0YnQvtCxINGD0L3QuNC60L3Rg9GC0Lgg0LTRg9Cx0LvRjtCy0LDQvdC90Y8sINGP0LrRidC+IElEINCy0LbQtSDRltGB0L3Rg9GUXHJcbiAgICAgICAgICAgIGlmICghcGFyc2VkVG9vbENhbGxzLnNvbWUoZXhpc3RpbmdDYWxsID0+IGV4aXN0aW5nQ2FsbC5pZCA9PT0gY2FsbC5pZCkpIHtcclxuICAgICAgICAgICAgICAgICBwYXJzZWRUb29sQ2FsbHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogY2FsbC50eXBlIHx8IFwiZnVuY3Rpb25cIixcclxuICAgICAgICAgICAgICAgICAgICBpZDogY2FsbC5pZCB8fCBgb2xsYW1hLXRjLSR7dGltZXN0YW1wTXN9LSR7dG9vbENhbGxJZENvdW50ZXIrK31gLCBcclxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbjogY2FsbC5mdW5jdGlvblxyXG4gICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjaHVuay5kb25lKSBpc0xhc3RDaHVuayA9IHRydWU7IC8vINCv0LrRidC+INGG0LXQuSDRh9Cw0L3QuiDQvNC+0LbQtSDQsdGD0YLQuCDQvtGB0YLQsNC90L3RltC8XHJcblxyXG4gICAgICB9IGVsc2UgaWYgKCdyZXNwb25zZScgaW4gY2h1bmspIHsgLy8gT2xsYW1hR2VuZXJhdGVDaHVuayAo0YLQtdC60YHRgtC+0LLQuNC5INC60L7QvdGC0LXQvdGCKVxyXG4gICAgICAgIGlmIChjaHVuay5yZXNwb25zZSkge1xyXG4gICAgICAgICAgYWNjdW11bGF0ZWRDb250ZW50ICs9IGNodW5rLnJlc3BvbnNlO1xyXG4gICAgICAgICAgZnVsbFJlc3BvbnNlQnVmZmVyICs9IGNodW5rLnJlc3BvbnNlOyBcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGNodW5rLmRvbmUpIGlzTGFzdENodW5rID0gdHJ1ZTsgLy8g0KbQtdC5INGC0LXQutGB0YLQvtCy0LjQuSDRh9Cw0L3QuiDRlCDQvtGB0YLQsNC90L3RltC8XHJcbiAgICAgIH1cclxuICAgICAgLy8g0K/QutGJ0L4g0ZQg0ZbQvdGI0LjQuSDRgdC/0L7RgdGW0LEg0LLQuNC30L3QsNGH0LjRgtC4INC+0YHRgtCw0L3QvdGW0Lkg0YfQsNC90LogKNC90LDQv9GA0LjQutC70LDQtCwg0YHQv9C10YbRltCw0LvRjNC90LjQuSDRgtC40L8gJ2RvbmUnINCx0LXQtyAncmVzcG9uc2UnKVxyXG4gICAgICAvLyBlbHNlIGlmIChjaHVuay50eXBlID09PSBcImRvbmVfc2lnbmFsXCIpIHsgaXNMYXN0Q2h1bmsgPSB0cnVlOyB9XHJcblxyXG5cclxuICAgICAgaWYgKGlzTGFzdENodW5rKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8g0J/QsNGA0YHQuNC90LMg0YLQtdC60YHRgtC+0LLQuNGFIDx0b29sX2NhbGw+INC3IGZ1bGxSZXNwb25zZUJ1ZmZlciAo0Y/QutGJ0L4g0LLQvtC90Lgg0ZQpXHJcbiAgICAgICAgLy8g0KbRjyDQu9C+0LPRltC60LAg0LLQuNC60L7QvdGD0ZTRgtGM0YHRjyDQotCG0JvQrNCa0Jgg0J7QlNCY0J0g0KDQkNCXINCyINC60ZbQvdGG0ZYuXHJcbiAgICAgICAgbGV0IGxhc3RJbmRleCA9IDA7XHJcbiAgICAgICAgd2hpbGUgKGxhc3RJbmRleCA8IGZ1bGxSZXNwb25zZUJ1ZmZlci5sZW5ndGgpIHtcclxuICAgICAgICAgIGNvbnN0IHN0YXJ0SW5kZXggPSBmdWxsUmVzcG9uc2VCdWZmZXIuaW5kZXhPZih0b29sQ2FsbFN0YXJ0VGFnLCBsYXN0SW5kZXgpO1xyXG4gICAgICAgICAgaWYgKHN0YXJ0SW5kZXggPT09IC0xKSBicmVhazsgXHJcblxyXG4gICAgICAgICAgY29uc3QgZW5kSW5kZXggPSBmdWxsUmVzcG9uc2VCdWZmZXIuaW5kZXhPZih0b29sQ2FsbEVuZFRhZywgc3RhcnRJbmRleCArIHRvb2xDYWxsU3RhcnRUYWcubGVuZ3RoKTtcclxuICAgICAgICAgIGlmIChlbmRJbmRleCA9PT0gLTEpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGJyZWFrOyBcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBjb25zdCB0b29sQ2FsbEpzb25TdHJpbmcgPSBmdWxsUmVzcG9uc2VCdWZmZXIuc3Vic3RyaW5nKHN0YXJ0SW5kZXggKyB0b29sQ2FsbFN0YXJ0VGFnLmxlbmd0aCwgZW5kSW5kZXgpLnRyaW0oKTtcclxuICAgICAgICAgIFxyXG5cclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZEpzb24gPSBKU09OLnBhcnNlKHRvb2xDYWxsSnNvblN0cmluZyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGNhbGxzQXJyYXkgPSBBcnJheS5pc0FycmF5KHBhcnNlZEpzb24pID8gcGFyc2VkSnNvbiA6IFtwYXJzZWRKc29uXTtcclxuICAgICAgICAgICAgaWYgKCFwYXJzZWRUb29sQ2FsbHMpIHBhcnNlZFRvb2xDYWxscyA9IFtdO1xyXG5cclxuICAgICAgICAgICAgZm9yIChjb25zdCBjYWxsRGVmIG9mIGNhbGxzQXJyYXkpIHtcclxuICAgICAgICAgICAgICBpZiAoY2FsbERlZi5uYW1lICYmIHR5cGVvZiBjYWxsRGVmLmFyZ3VtZW50cyAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICAgICAgICAgIC8vINCU0L7QtNCw0ZTQvNC+LCDQu9C40YjQtSDRj9C60YnQviDRgdGF0L7QttC+0LPQviDQstC40LrQu9C40LrRgyDRidC1INC90LXQvNCw0ZQgKNC/0YDQvtGB0YLQsCDQv9C10YDQtdCy0ZbRgNC60LAg0LfQsCDRltC80LXQvdC10LwpXHJcbiAgICAgICAgICAgICAgICAvLyDQlNC70Y8g0LHRltC70YzRiCDQvdCw0LTRltC50L3QvtGXINC/0LXRgNC10LLRltGA0LrQuCDQvdCwINC00YPQsdC70ZbQutCw0YLQuCDQv9C+0YLRgNGW0LHQvdGWIElEINCw0LHQviDQsdGW0LvRjNGIINCz0LvQuNCx0L7QutC1INC/0L7RgNGW0LLQvdGP0L3QvdGPXHJcbiAgICAgICAgICAgICAgICBpZiAoIXBhcnNlZFRvb2xDYWxscy5zb21lKHB0YyA9PiBwdGMuZnVuY3Rpb24ubmFtZSA9PT0gY2FsbERlZi5uYW1lKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHBhcnNlZFRvb2xDYWxscy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJmdW5jdGlvblwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZDogYG9sbGFtYS10eHQtdGMtJHt0aW1lc3RhbXBNc30tJHt0b29sQ2FsbElkQ291bnRlcisrfWAsIC8vINCG0L3RiNC40Lkg0L/RgNC10YTRltC60YEg0LTQu9GPINGC0LXQutGB0YLQvtCy0LjRhVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbjoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogY2FsbERlZi5uYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXJndW1lbnRzOiB0eXBlb2YgY2FsbERlZi5hcmd1bWVudHMgPT09ICdzdHJpbmcnIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gY2FsbERlZi5hcmd1bWVudHMgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBKU09OLnN0cmluZ2lmeShjYWxsRGVmLmFyZ3VtZW50cyksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW19wcm9jZXNzTGxtU3RyZWFtXSBFcnJvciBwYXJzaW5nIHRleHQtYmFzZWQgdG9vbCBjYWxsIEpTT046XCIsIGUsIHRvb2xDYWxsSnNvblN0cmluZyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBsYXN0SW5kZXggPSBlbmRJbmRleCArIHRvb2xDYWxsRW5kVGFnLmxlbmd0aDtcclxuICAgICAgICB9XHJcbiAgICAgICAgYnJlYWs7IFxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiB7IFxyXG4gICAgICBhY2N1bXVsYXRlZENvbnRlbnQ6IGFjY3VtdWxhdGVkQ29udGVudCwgXHJcbiAgICAgIG5hdGl2ZVRvb2xDYWxsczogcGFyc2VkVG9vbENhbGxzLCBcclxuICAgICAgYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxsczogbnVsbCBcclxuICAgIH07XHJcbiAgfVxyXG5cclxuLy8gLi4uICjRgNC10YjRgtCwINC80LXRgtC+0LTRltCyKVxyXG5cclxuICAvLyBzcmMvT2xsYW1hVmlldy50c1xyXG5cclxuLy8gLi4uICjRltC90YjRliDRltC80L/QvtGA0YLQuCDRgtCwINGH0LDRgdGC0LjQvdCwINC60LvQsNGB0YMpIC4uLlxyXG5cclxuICBwcml2YXRlIF9kZXRlcm1pbmVUb29sQ2FsbHMoXHJcbiAgICBuYXRpdmVUb29sQ2FsbHNGcm9tU3RyZWFtOiBUb29sQ2FsbFtdIHwgbnVsbCwgXHJcbiAgICBhY2N1bXVsYXRlZENvbnRlbnRGcm9tU3RyZWFtOiBzdHJpbmcsICAgICAgICBcclxuICAgIHRpbWVzdGFtcE1zOiBudW1iZXIsXHJcbiAgICByZXF1ZXN0VGltZXN0YW1wSWQ6IG51bWJlciAvLyDQptC10Lkg0LDRgNCz0YPQvNC10L3RgiDQt9Cw0YDQsNC3INC90LUg0LLQuNC60L7RgNC40YHRgtC+0LLRg9GU0YLRjNGB0Y8g0LDQutGC0LjQstC90L4sINCw0LvQtSDQt9Cw0LvQuNGI0LXQvdC40Lkg0LTQu9GPINGD0LfQs9C+0LTQttC10L3QvtGB0YLRllxyXG4gICk6IHsgcHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm46IFRvb2xDYWxsW10gfCBudWxsOyBhc3Npc3RhbnRNZXNzYWdlRm9ySGlzdG9yeTogQXNzaXN0YW50TWVzc2FnZSB9IHtcclxuICAgIFxyXG4gICAgbGV0IHRvb2xzVG9FeGVjdXRlOiBUb29sQ2FsbFtdIHwgbnVsbCA9IG51bGw7XHJcbiAgICBjb25zdCBmaW5hbENvbnRlbnRGb3JIaXN0b3J5ID0gYWNjdW11bGF0ZWRDb250ZW50RnJvbVN0cmVhbS50cmltKCk7XHJcblxyXG4gICAgY29uc3QgYXNzaXN0YW50TWVzc2FnZUZvckhpc3Rvcnk6IEFzc2lzdGFudE1lc3NhZ2UgPSB7XHJcbiAgICAgIHJvbGU6IFwiYXNzaXN0YW50XCIsXHJcbiAgICAgIGNvbnRlbnQ6IGZpbmFsQ29udGVudEZvckhpc3RvcnksIFxyXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKHRpbWVzdGFtcE1zKSxcclxuICAgIH07XHJcblxyXG4gICAgaWYgKG5hdGl2ZVRvb2xDYWxsc0Zyb21TdHJlYW0gJiYgbmF0aXZlVG9vbENhbGxzRnJvbVN0cmVhbS5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHRvb2xzVG9FeGVjdXRlID0gbmF0aXZlVG9vbENhbGxzRnJvbVN0cmVhbTtcclxuICAgICAgYXNzaXN0YW50TWVzc2FnZUZvckhpc3RvcnkudG9vbF9jYWxscyA9IG5hdGl2ZVRvb2xDYWxsc0Zyb21TdHJlYW07IFxyXG4gICAgICBcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIFxyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4geyBcclxuICAgICAgcHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm46IHRvb2xzVG9FeGVjdXRlLCBcclxuICAgICAgYXNzaXN0YW50TWVzc2FnZUZvckhpc3Rvcnk6IGFzc2lzdGFudE1lc3NhZ2VGb3JIaXN0b3J5IFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8vIHNyYy9PbGxhbWFWaWV3LnRzXHJcblxyXG4gIC8vIC4uLlxyXG5cclxuICBwcml2YXRlIGFzeW5jIF9leGVjdXRlQW5kUmVuZGVyVG9vbEN5Y2xlKFxyXG4gICAgdG9vbHNUb0V4ZWN1dGU6IFRvb2xDYWxsW10sXHJcbiAgICBhc3Npc3RhbnRNZXNzYWdlSW50ZW50OiBBc3Npc3RhbnRNZXNzYWdlLFxyXG4gICAgcmVxdWVzdFRpbWVzdGFtcElkOiBudW1iZXIsXHJcbiAgICBzaWduYWw6IEFib3J0U2lnbmFsIC8vINCh0LjQs9C90LDQuyDRgdC60LDRgdGD0LLQsNC90L3Rj1xyXG4gICk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgY3VycmVudFZpZXdJbnN0YW5jZSA9IHRoaXM7XHJcblxyXG4gICAgZm9yIChjb25zdCBjYWxsIG9mIHRvb2xzVG9FeGVjdXRlKSB7XHJcbiAgICAgIGlmIChzaWduYWwuYWJvcnRlZCkgdGhyb3cgbmV3IEVycm9yKFwiYWJvcnRlZCBieSB1c2VyXCIpO1xyXG5cclxuICAgICAgaWYgKGNhbGwudHlwZSA9PT0gXCJmdW5jdGlvblwiKSB7XHJcbiAgICAgICAgY29uc3QgdG9vbE5hbWUgPSBjYWxsLmZ1bmN0aW9uLm5hbWU7XHJcbiAgICAgICAgbGV0IHRvb2xBcmdzID0ge307XHJcbiAgICAgICAgbGV0IHRvb2xSZXN1bHRDb250ZW50Rm9ySGlzdG9yeTogc3RyaW5nID0gXCJcIjsgLy8g0IbQvdGW0YbRltCw0LvRltC30LDRhtGW0Y8g0LTQu9GPINGD0L3QuNC60L3QtdC90L3RjyDQv9C+0LzQuNC70LrQuFxyXG4gICAgICAgIGxldCBwYXJzZUVycm9yT2NjdXJyZWQgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIHRvb2xBcmdzID0gSlNPTi5wYXJzZShjYWxsLmZ1bmN0aW9uLmFyZ3VtZW50cyB8fCBcInt9XCIpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGU6IGFueSkge1xyXG4gICAgICAgICAgY29uc3QgZXJyb3JDb250ZW50ID0gYEVycm9yIHBhcnNpbmcgYXJndW1lbnRzIGZvciB0b29sICR7dG9vbE5hbWV9OiAke2UubWVzc2FnZX0uIEFyZ3VtZW50cyBzdHJpbmc6IFwiJHtjYWxsLmZ1bmN0aW9uLmFyZ3VtZW50c31cImA7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtUb29sQ3ljbGVdIEFyZyBQYXJzaW5nIEVycm9yIGZvciAke3Rvb2xOYW1lfTogJHtlcnJvckNvbnRlbnR9YCk7XHJcbiAgICAgICAgICB0b29sUmVzdWx0Q29udGVudEZvckhpc3RvcnkgPSBgW1RPT0xfRVJST1JdXFxuJHtlcnJvckNvbnRlbnR9XFxuWy9UT09MX0VSUk9SXWA7XHJcbiAgICAgICAgICBwYXJzZUVycm9yT2NjdXJyZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCFwYXJzZUVycm9yT2NjdXJyZWQpIHtcclxuICAgICAgICAgIGlmIChzaWduYWwuYWJvcnRlZCkgdGhyb3cgbmV3IEVycm9yKFwiYWJvcnRlZCBieSB1c2VyXCIpOyAvLyDQn9C10YDQtdCy0ZbRgNC60LAg0L/QtdGA0LXQtCDQstC40LrQvtC90LDQvdC90Y/QvCDRltC90YHRgtGA0YPQvNC10L3RgtGDXHJcbiAgICAgICAgICBjb25zdCBleGVjUmVzdWx0ID0gYXdhaXQgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uYWdlbnRNYW5hZ2VyLmV4ZWN1dGVUb29sKHRvb2xOYW1lLCB0b29sQXJncyk7XHJcbiAgICAgICAgICBpZiAoZXhlY1Jlc3VsdC5zdWNjZXNzKSB7XHJcbiAgICAgICAgICAgIHRvb2xSZXN1bHRDb250ZW50Rm9ySGlzdG9yeSA9IGBbVE9PTF9SRVNVTFRdXFxuJHtleGVjUmVzdWx0LnJlc3VsdH1cXG5bL1RPT0xfUkVTVUxUXWA7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0b29sUmVzdWx0Q29udGVudEZvckhpc3RvcnkgPSBgW1RPT0xfRVJST1JdXFxuRXJyb3IgZXhlY3V0aW5nIHRvb2wgJHt0b29sTmFtZX06ICR7XHJcbiAgICAgICAgICAgICAgZXhlY1Jlc3VsdC5lcnJvciB8fCBcIlVua25vd24gdG9vbCBlcnJvclwiXHJcbiAgICAgICAgICAgIH1cXG5bL1RPT0xfRVJST1JdYDtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHRvb2xSZXNwb25zZVRpbWVzdGFtcCA9IG5ldyBEYXRlKCk7XHJcbiAgICAgICAgY29uc3QgdG9vbFJlc3BvbnNlTXNnOiBNZXNzYWdlID0ge1xyXG4gICAgICAgICAgcm9sZTogXCJ0b29sXCIgYXMgTWVzc2FnZVJvbGUsXHJcbiAgICAgICAgICB0b29sX2NhbGxfaWQ6IGNhbGwuaWQsXHJcbiAgICAgICAgICBuYW1lOiB0b29sTmFtZSxcclxuICAgICAgICAgIGNvbnRlbnQ6IHRvb2xSZXN1bHRDb250ZW50Rm9ySGlzdG9yeSxcclxuICAgICAgICAgIHRpbWVzdGFtcDogdG9vbFJlc3BvbnNlVGltZXN0YW1wLFxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IHRvb2xSZXN1bHRIbWFQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIucmVnaXN0ZXJITUFSZXNvbHZlcihcclxuICAgICAgICAgICAgdG9vbFJlc3BvbnNlTXNnLnRpbWVzdGFtcC5nZXRUaW1lKCksXHJcbiAgICAgICAgICAgIHJlc29sdmUsXHJcbiAgICAgICAgICAgIHJlamVjdFxyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmhhcyh0b29sUmVzcG9uc2VNc2cudGltZXN0YW1wLmdldFRpbWUoKSkpIHtcclxuICAgICAgICAgICAgICBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5yZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKFxyXG4gICAgICAgICAgICAgICAgdG9vbFJlc3BvbnNlTXNnLnRpbWVzdGFtcC5nZXRUaW1lKCksXHJcbiAgICAgICAgICAgICAgICBgSE1BIFRpbWVvdXQgZm9yIHRvb2wgcmVzdWx0OiAke3Rvb2xOYW1lfSBpbiBfZXhlY3V0ZUFuZFJlbmRlclRvb2xDeWNsZWBcclxuICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9LCAxMDAwMCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgYXdhaXQgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIuYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdFBheWxvYWQodG9vbFJlc3BvbnNlTXNnLCB0cnVlKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgYXdhaXQgdG9vbFJlc3VsdEhtYVByb21pc2U7XHJcbiAgICAgICAgfSBjYXRjaCAoaG1hRXJyb3IpIHtcclxuICAgICAgICAgIFxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gLi4uICjRgNC10YjRgtCwINC80LXRgtC+0LTRltCyIE9sbGFtYVZpZXcudHMpIC4uLlxyXG5cclxuICBwcml2YXRlIGFzeW5jIF9yZW5kZXJGaW5hbEFzc2lzdGFudFRleHQoXHJcbiAgICBmaW5hbENvbnRlbnQ6IHN0cmluZyxcclxuICAgIHJlc3BvbnNlVGltZXN0YW1wTXM6IG51bWJlcixcclxuICAgIHJlcXVlc3RUaW1lc3RhbXBJZDogbnVtYmVyXHJcbiAgKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBjdXJyZW50Vmlld0luc3RhbmNlID0gdGhpcztcclxuXHJcbiAgICBpZiAoZmluYWxDb250ZW50LnRyaW0oKSkge1xyXG4gICAgICBjb25zdCBmaW5hbEFzc2lzdGFudE1zZzogTWVzc2FnZSA9IHtcclxuICAgICAgICByb2xlOiBcImFzc2lzdGFudFwiLFxyXG4gICAgICAgIGNvbnRlbnQ6IGZpbmFsQ29udGVudCxcclxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKHJlc3BvbnNlVGltZXN0YW1wTXMpLFxyXG4gICAgICB9O1xyXG4gICAgICBjb25zdCBobWFQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgIGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLnJlZ2lzdGVySE1BUmVzb2x2ZXIocmVzcG9uc2VUaW1lc3RhbXBNcywgcmVzb2x2ZSwgcmVqZWN0KTtcclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgIGlmIChjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuaGFzKHJlc3BvbnNlVGltZXN0YW1wTXMpKSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLnJlamVjdEFuZENsZWFySE1BUmVzb2x2ZXIoXHJcbiAgICAgICAgICAgICAgcmVzcG9uc2VUaW1lc3RhbXBNcyxcclxuICAgICAgICAgICAgICBcIkhNQSBUaW1lb3V0IGZvciBmaW5hbCBhc3Npc3RhbnQgbWVzc2FnZVwiXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSwgMTAwMDApO1xyXG4gICAgICB9KTtcclxuICAgICAgYXdhaXQgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIuYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdFBheWxvYWQoZmluYWxBc3Npc3RhbnRNc2csIHRydWUpO1xyXG4gICAgICBhd2FpdCBobWFQcm9taXNlO1xyXG4gICAgfSBlbHNlIGlmICghY3VycmVudFZpZXdJbnN0YW5jZS5jdXJyZW50QWJvcnRDb250cm9sbGVyPy5zaWduYWwuYWJvcnRlZCkge1xyXG4gICAgICBjb25zdCBlbXB0eVJlc3BvbnNlTXNnVGltZXN0YW1wID0gbmV3IERhdGUoKTtcclxuICAgICAgY29uc3QgZW1wdHlSZXNwb25zZU1zZzogTWVzc2FnZSA9IHtcclxuICAgICAgICByb2xlOiBcInN5c3RlbVwiLFxyXG4gICAgICAgIGNvbnRlbnQ6IFwiQXNzaXN0YW50IHByb3ZpZGVkIGFuIGVtcHR5IHJlc3BvbnNlLlwiLFxyXG4gICAgICAgIHRpbWVzdGFtcDogZW1wdHlSZXNwb25zZU1zZ1RpbWVzdGFtcCxcclxuICAgICAgfTtcclxuICAgICAgY29uc3QgaG1hUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5yZWdpc3RlckhNQVJlc29sdmVyKFxyXG4gICAgICAgICAgZW1wdHlSZXNwb25zZU1zZy50aW1lc3RhbXAuZ2V0VGltZSgpLFxyXG4gICAgICAgICAgcmVzb2x2ZSxcclxuICAgICAgICAgIHJlamVjdFxyXG4gICAgICAgICk7XHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICBpZiAoY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmhhcyhlbXB0eVJlc3BvbnNlTXNnLnRpbWVzdGFtcC5nZXRUaW1lKCkpKSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLnJlamVjdEFuZENsZWFySE1BUmVzb2x2ZXIoXHJcbiAgICAgICAgICAgICAgZW1wdHlSZXNwb25zZU1zZy50aW1lc3RhbXAuZ2V0VGltZSgpLFxyXG4gICAgICAgICAgICAgIFwiSE1BIHRpbWVvdXQgZm9yIGVtcHR5IHN5cyBtc2dcIlxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0sIDEwMDAwKTtcclxuICAgICAgfSk7XHJcbiAgICAgIGF3YWl0IGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXRQYXlsb2FkKGVtcHR5UmVzcG9uc2VNc2csIHRydWUpO1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGF3YWl0IGhtYVByb21pc2U7XHJcbiAgICAgIH0gY2F0Y2ggKGVfaG1hKSB7fVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChjdXJyZW50Vmlld0luc3RhbmNlLmFjdGl2ZVBsYWNlaG9sZGVyPy50aW1lc3RhbXAgPT09IHJlc3BvbnNlVGltZXN0YW1wTXMpIHtcclxuICAgICAgY3VycmVudFZpZXdJbnN0YW5jZS5hY3RpdmVQbGFjZWhvbGRlciA9IG51bGw7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAgIHB1YmxpYyBhc3luYyBoYW5kbGVSZWdlbmVyYXRlQ2xpY2sobWVzc2FnZVRvUmVnZW5lcmF0ZUZyb206IE1lc3NhZ2UpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGlmICh0aGlzLmlzUmVnZW5lcmF0aW5nKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJSZWdlbmVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy4gUGxlYXNlIHdhaXQuXCIsIDMwMDApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICh0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIpIHsgXHJcbiAgICAgIG5ldyBOb3RpY2UoXCJBbm90aGVyIGdlbmVyYXRpb24gcHJvY2VzcyBpcyBjdXJyZW50bHkgYWN0aXZlLiBQbGVhc2Ugd2FpdCBvciBjYW5jZWwgaXQgZmlyc3QuXCIsIDQwMDApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICBpZiAoIWFjdGl2ZUNoYXQpIHtcclxuICAgICAgbmV3IE5vdGljZShcIkNhbm5vdCByZWdlbmVyYXRlOiBObyBhY3RpdmUgY2hhdCBmb3VuZC5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IGNoYXRJZCA9IGFjdGl2ZUNoYXQubWV0YWRhdGEuaWQ7XHJcbiAgICBcclxuICAgIGxldCBhbmNob3JNZXNzYWdlSW5kZXggPSBhY3RpdmVDaGF0Lm1lc3NhZ2VzLmZpbmRJbmRleChcclxuICAgICAgbXNnID0+IG1zZy50aW1lc3RhbXAuZ2V0VGltZSgpID09PSBtZXNzYWdlVG9SZWdlbmVyYXRlRnJvbS50aW1lc3RhbXAuZ2V0VGltZSgpICYmIG1zZy5yb2xlID09PSBtZXNzYWdlVG9SZWdlbmVyYXRlRnJvbS5yb2xlXHJcbiAgICApO1xyXG5cclxuICAgIGlmIChhbmNob3JNZXNzYWdlSW5kZXggPT09IC0xKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJFcnJvcjogQ291bGQgbm90IGZpbmQgdGhlIG1lc3NhZ2UgdG8gcmVnZW5lcmF0ZSBmcm9tIGluIHRoZSBjdXJyZW50IGNoYXQgaGlzdG9yeS5cIik7XHJcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKFwiUmVnZW5lcmF0aW9uIGZhaWxlZDogQW5jaG9yIG1lc3NhZ2Ugbm90IGZvdW5kIGZvciByZWdlbmVyYXRpb24uXCIsIHsgXHJcbiAgICAgICAgdGFyZ2V0VGltZXN0YW1wOiBtZXNzYWdlVG9SZWdlbmVyYXRlRnJvbS50aW1lc3RhbXAuZ2V0VGltZSgpLCBcclxuICAgICAgICB0YXJnZXRSb2xlOiBtZXNzYWdlVG9SZWdlbmVyYXRlRnJvbS5yb2xlLFxyXG4gICAgICAgIGFjdGl2ZUNoYXRJZDogY2hhdElkLFxyXG4gICAgICAgIC8vINCc0L7QttC90LAg0LTQvtC00LDRgtC4INC/0LXRgNGI0ZYv0L7RgdGC0LDQvdC90ZYg0LrRltC70YzQutCwINC/0L7QstGW0LTQvtC80LvQtdC90Ywg0LcgYWN0aXZlQ2hhdC5tZXNzYWdlcyDQtNC70Y8g0LrQvtC90YLQtdC60YHRgtGDLCDRj9C60YnQviDQv9C+0YLRgNGW0LHQvdC+XHJcbiAgICAgIH0pO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IG1lc3NhZ2VJbmRleFRvRGVsZXRlQWZ0ZXIgPSBhbmNob3JNZXNzYWdlSW5kZXg7XHJcbiAgICAvLyDQr9C60YnQviDRgNC10LPQtdC90LXRgNGD0ZTQvNC+INCy0ZbQtNC/0L7QstGW0LTRjCDQsNGB0LjRgdGC0LXQvdGC0LAsINGC0L4g0LLQuNC00LDQu9GP0ZTQvNC+INC/0L7QstGW0LTQvtC80LvQtdC90L3Rjywg0L/QvtGH0LjQvdCw0Y7Rh9C4INC3INGG0YzQvtCz0L4g0LDRgdC40YHRgtC10L3RgtCwLlxyXG4gICAgLy8g0J7RgtC20LUsIFwi0LLQuNC00LDQu9GP0YLQuCDQv9GW0YHQu9GPXCIg0L7Qt9C90LDRh9Cw0ZQg0LLQuNC00LDQu9GP0YLQuCDQv9GW0YHQu9GPINC/0L7QstGW0LTQvtC80LvQtdC90L3Rjywg0YnQviDQsdGD0LvQviAq0L/QtdGA0LXQtCog0YbQuNC8INCw0YHQuNGB0YLQtdC90YLQvtC8LlxyXG4gICAgaWYgKG1lc3NhZ2VUb1JlZ2VuZXJhdGVGcm9tLnJvbGUgPT09IFwiYXNzaXN0YW50XCIpIHtcclxuICAgICAgICBtZXNzYWdlSW5kZXhUb0RlbGV0ZUFmdGVyID0gYW5jaG9yTWVzc2FnZUluZGV4IC0gMTsgXHJcbiAgICB9XHJcbiAgICAvLyDQr9C60YnQviBtZXNzYWdlVG9SZWdlbmVyYXRlRnJvbS5yb2xlID09PSBcInVzZXJcIiwg0YLQviBhbmNob3JNZXNzYWdlSW5kZXgg0LLQttC1INCy0LrQsNC30YPRlCDQvdCwINGG0LUg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINC60L7RgNC40YHRgtGD0LLQsNGH0LAsXHJcbiAgICAvLyDRliDQvNC4INCx0YPQtNC10LzQviDQstC40LTQsNC70Y/RgtC4INCy0YHQtSDQn9CG0KHQm9CvINC90YzQvtCz0L4uXHJcblxyXG4gICAgY29uc3QgaGFzTWVzc2FnZXNBZnRlclRhcmdldFBvaW50ID0gYWN0aXZlQ2hhdC5tZXNzYWdlcy5sZW5ndGggPiBtZXNzYWdlSW5kZXhUb0RlbGV0ZUFmdGVyICsgMTtcclxuXHJcbiAgICBuZXcgQ29uZmlybU1vZGFsKFxyXG4gICAgICB0aGlzLmFwcCxcclxuICAgICAgXCJDb25maXJtIFJlZ2VuZXJhdGlvblwiLFxyXG4gICAgICBoYXNNZXNzYWdlc0FmdGVyVGFyZ2V0UG9pbnRcclxuICAgICAgICA/IFwiVGhpcyB3aWxsIGRlbGV0ZSBhbGwgbWVzc2FnZXMgYWZ0ZXIgdGhpcyBwb2ludCBpbiB0aGUgY29udmVyc2F0aW9uIGFuZCBnZW5lcmF0ZSBhIG5ldyByZXNwb25zZS4gQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGNvbnRpbnVlP1wiXHJcbiAgICAgICAgOiBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBnZW5lcmF0ZSBhIG5ldyByZXNwb25zZSBmb3IgdGhpcyBwcm9tcHQ/XCIsXHJcbiAgICAgIGFzeW5jICgpID0+IHtcclxuICAgICAgICB0aGlzLmlzUmVnZW5lcmF0aW5nID0gdHJ1ZTtcclxuICAgICAgICBjb25zdCByZWdlbmVyYXRpb25HbG9iYWxSZXF1ZXN0SWQgPSBEYXRlLm5vdygpOyBcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7IFxyXG4gICAgICAgIHRoaXMuc2V0TG9hZGluZ1N0YXRlKHRydWUpO1xyXG5cclxuICAgICAgICBjb25zdCBpbml0aWFsTGxtUmVzcG9uc2VQbGFjZWhvbGRlclRzRm9yUmVnZW4gPSBEYXRlLm5vdygpOyBcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGlmIChoYXNNZXNzYWdlc0FmdGVyVGFyZ2V0UG9pbnQpIHtcclxuICAgICAgICAgICAgY29uc3QgZGVsZXRlU3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmRlbGV0ZU1lc3NhZ2VzQWZ0ZXIoY2hhdElkLCBtZXNzYWdlSW5kZXhUb0RlbGV0ZUFmdGVyKTtcclxuICAgICAgICAgICAgaWYgKCFkZWxldGVTdWNjZXNzKSB7XHJcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRmFpbGVkIHRvIGRlbGV0ZSBzdWJzZXF1ZW50IG1lc3NhZ2VzLiBSZWdlbmVyYXRpb24gY2Fubm90IHByb2NlZWQuXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGF3YWl0IHRoaXMubG9hZEFuZERpc3BsYXlBY3RpdmVDaGF0KCk7IFxyXG4gICAgICAgICAgdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oNTAsIHRydWUpO1xyXG5cclxuICAgICAgICAgIGNvbnN0IGNoYXRTdGF0ZUZvckxsbSA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXRPckZhaWwoKTtcclxuICAgICAgICAgIGlmICghY2hhdFN0YXRlRm9yTGxtKSB7IFxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJGYWlsZWQgdG8gcmVsb2FkIGNoYXQgc3RhdGUgYWZ0ZXIgcHJlcGFyaW5nIGZvciByZWdlbmVyYXRpb24uXCIpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgIGlmICghdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyKSB7IFxyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkNSSVRJQ0FMOiBBYm9ydENvbnRyb2xsZXIgbm90IGluaXRpYWxpemVkIGluIGhhbmRsZVJlZ2VuZXJhdGVDbGljayBiZWZvcmUgTGxtSW50ZXJhY3Rpb25DeWNsZSBjYWxsLlwiKTtcclxuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBYm9ydENvbnRyb2xsZXIgbm90IGluaXRpYWxpemVkIGluIGhhbmRsZVJlZ2VuZXJhdGVDbGlja1wiKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGF3YWl0IHRoaXMuX2hhbmRsZUxsbUludGVyYWN0aW9uQ3ljbGUoY2hhdFN0YXRlRm9yTGxtLCByZWdlbmVyYXRpb25HbG9iYWxSZXF1ZXN0SWQsIHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlci5zaWduYWwpO1xyXG5cclxuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgICAgICBpZiAodGhpcy5hY3RpdmVQbGFjZWhvbGRlciAmJiBcclxuICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLnRpbWVzdGFtcCA9PT0gaW5pdGlhbExsbVJlc3BvbnNlUGxhY2Vob2xkZXJUc0ZvclJlZ2VuICYmXHJcbiAgICAgICAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLmNsYXNzTGlzdC5jb250YWlucyhcInBsYWNlaG9sZGVyXCIpKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmdyb3VwRWwuaXNDb25uZWN0ZWQpIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5yZW1vdmUoKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIucmVqZWN0QW5kQ2xlYXJITUFSZXNvbHZlcihpbml0aWFsTGxtUmVzcG9uc2VQbGFjZWhvbGRlclRzRm9yUmVnZW4sIGBPdXRlciBjYXRjaCBpbiBoYW5kbGVSZWdlbmVyYXRlQ2xpY2sgZm9yIGluaXRpYWwgcGxhY2Vob2xkZXIgKHJlcTogJHtyZWdlbmVyYXRpb25HbG9iYWxSZXF1ZXN0SWR9KWApO1xyXG5cclxuICAgICAgICAgIGxldCBlcnJvck1zZ0ZvckNoYXQ6IHN0cmluZztcclxuICAgICAgICAgIGxldCBlcnJvck1zZ1JvbGU6IE1lc3NhZ2VSb2xlID0gXCJlcnJvclwiO1xyXG4gICAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09IFwiQWJvcnRFcnJvclwiIHx8IGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKFwiYWJvcnRlZCBieSB1c2VyXCIpKSB7XHJcbiAgICAgICAgICAgIGVycm9yTXNnRm9yQ2hhdCA9IFwiUmVnZW5lcmF0aW9uIHByb2Nlc3Mgd2FzIHN0b3BwZWQgYnkgdGhlIHVzZXIuXCI7XHJcbiAgICAgICAgICAgIGVycm9yTXNnUm9sZSA9IFwic3lzdGVtXCI7IFxyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZXJyb3JNc2dGb3JDaGF0ID0gYFJlZ2VuZXJhdGlvbiBmYWlsZWQ6ICR7ZXJyb3IubWVzc2FnZSB8fCBcIkFuIHVua25vd24gZXJyb3Igb2NjdXJyZWQgZHVyaW5nIHByb2Nlc3NpbmcuXCJ9YDtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShlcnJvck1zZ0ZvckNoYXQsIDcwMDApOyBcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGNvbnN0IGVycm9yRGlzcGxheVRpbWVzdGFtcCA9IG5ldyBEYXRlKCk7XHJcbiAgICAgICAgICBjb25zdCBlcnJvckRpc3BsYXlNc2c6IE1lc3NhZ2UgPSB7IHJvbGU6IGVycm9yTXNnUm9sZSwgY29udGVudDogZXJyb3JNc2dGb3JDaGF0LCB0aW1lc3RhbXA6IGVycm9yRGlzcGxheVRpbWVzdGFtcCB9O1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjb25zdCBobWFFcnJvclByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnJlZ2lzdGVySE1BUmVzb2x2ZXIoZXJyb3JEaXNwbGF5TXNnLnRpbWVzdGFtcC5nZXRUaW1lKCksIHJlc29sdmUsIHJlamVjdCk7XHJcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICAgIGlmICh0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuaGFzKGVycm9yRGlzcGxheU1zZy50aW1lc3RhbXAuZ2V0VGltZSgpKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIucmVqZWN0QW5kQ2xlYXJITUFSZXNvbHZlcihlcnJvckRpc3BsYXlNc2cudGltZXN0YW1wLmdldFRpbWUoKSwgXCJITUEgdGltZW91dCBmb3IgZXJyb3IgZGlzcGxheSBtc2cgaW4gaGFuZGxlUmVnZW5lcmF0ZUNsaWNrXCIpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSwgMTAwMDApO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0UGF5bG9hZChlcnJvckRpc3BsYXlNc2csIHRydWUpO1xyXG4gICAgICAgICAgdHJ5IHsgXHJcbiAgICAgICAgICAgIGF3YWl0IGhtYUVycm9yUHJvbWlzZTsgXHJcbiAgICAgICAgICB9IGNhdGNoIChlX2htYSkgeyBcclxuICAgICAgICAgICAgIFxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgJiYgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLmNsYXNzTGlzdC5jb250YWlucyhcInBsYWNlaG9sZGVyXCIpKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmdyb3VwRWwuaXNDb25uZWN0ZWQpIHtcclxuICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmdyb3VwRWwucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgPSBudWxsOyBcclxuXHJcbiAgICAgICAgICB0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIgPSBudWxsOyBcclxuICAgICAgICAgIHRoaXMuaXNSZWdlbmVyYXRpbmcgPSBmYWxzZTsgXHJcbiAgICAgICAgICB0aGlzLnNldExvYWRpbmdTdGF0ZShmYWxzZSk7IFxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gdGhpcy51cGRhdGVTZW5kQnV0dG9uU3RhdGUoKSk7IFxyXG4gICAgICAgICAgdGhpcy5mb2N1c0lucHV0KCk7IFxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgKS5vcGVuKCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIF9oYW5kbGVMbG1JbnRlcmFjdGlvbkN5Y2xlKFxyXG4gICAgaW5pdGlhbENoYXRTdGF0ZTogQ2hhdCxcclxuICAgIGdsb2JhbEludGVyYWN0aW9uUmVxdWVzdElkOiBudW1iZXIsXHJcbiAgICBzaWduYWw6IEFib3J0U2lnbmFsIC8vINCh0LjQs9C90LDQuyDRgdC60LDRgdGD0LLQsNC90L3RjyDQtNC70Y8g0YbRjNC+0LPQviDRhtC40LrQu9GDXHJcbiAgKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBsZXQgY29udGludWVDb252ZXJzYXRpb24gPSB0cnVlO1xyXG4gICAgY29uc3QgbWF4VHVybnMgPSA1OyAvLyDQkNCx0L4g0Lcg0L3QsNC70LDRiNGC0YPQstCw0L3RjCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXhUb29sVHVybnNcclxuICAgIGxldCB0dXJucyA9IDA7XHJcbiAgICBsZXQgY3VycmVudFR1cm5MbG1SZXNwb25zZVRzRm9yQ2F0Y2g6IG51bWJlciB8IG51bGwgPSBudWxsOyAvLyDQlNC70Y8g0LvQvtCz0YPQstCw0L3QvdGPL9Cy0ZbQtNC70LDQtNC60Lgg0L/QvtC80LjQu9C+0LpcclxuICAgIGxldCBjaGF0U3RhdGVGb3JMbG0gPSBpbml0aWFsQ2hhdFN0YXRlO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIHdoaWxlIChjb250aW51ZUNvbnZlcnNhdGlvbiAmJiB0dXJucyA8IG1heFR1cm5zICYmICFzaWduYWwuYWJvcnRlZCkge1xyXG4gICAgICAgIHR1cm5zKys7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFR1cm5MbG1SZXNwb25zZVRzID0gRGF0ZS5ub3coKTtcclxuICAgICAgICBjdXJyZW50VHVybkxsbVJlc3BvbnNlVHNGb3JDYXRjaCA9IGN1cnJlbnRUdXJuTGxtUmVzcG9uc2VUcztcclxuXHJcbiAgICAgICAgY29uc3QgY3VycmVudFR1cm5SZXF1ZXN0SWQgPSBnbG9iYWxJbnRlcmFjdGlvblJlcXVlc3RJZCArIHR1cm5zO1xyXG5cclxuICAgICAgICB0aGlzLl9tYW5hZ2VQbGFjZWhvbGRlcihjdXJyZW50VHVybkxsbVJlc3BvbnNlVHMsIGN1cnJlbnRUdXJuUmVxdWVzdElkKTtcclxuXHJcbiAgICAgICAgLy8g0JfQsNCy0LbQtNC4INC+0YLRgNC40LzRg9GU0LzQviDQvdCw0LnRgdCy0ZbQttGW0YjQuNC5INGB0YLQsNC9INGH0LDRgtGDXHJcbiAgICAgICAgY2hhdFN0YXRlRm9yTGxtID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0QWN0aXZlQ2hhdE9yRmFpbCgpO1xyXG5cclxuICAgICAgICBjb25zdCBsbG1TdHJlYW0gPSB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdlbmVyYXRlQ2hhdFJlc3BvbnNlU3RyZWFtKFxyXG4gICAgICAgICAgY2hhdFN0YXRlRm9yTGxtLFxyXG4gICAgICAgICAgc2lnbmFsIC8vINCf0LXRgNC10LTQsNGU0LzQviDRgdC40LPQvdCw0Lsg0YHQutCw0YHRg9Cy0LDQvdC90Y8g0LIg0YHQtdGA0LLRltGBXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgY29uc3QgeyBhY2N1bXVsYXRlZENvbnRlbnQsIG5hdGl2ZVRvb2xDYWxscywgYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxscyB9ID0gYXdhaXQgdGhpcy5fcHJvY2Vzc0xsbVN0cmVhbShcclxuICAgICAgICAgIGxsbVN0cmVhbSxcclxuICAgICAgICAgIGN1cnJlbnRUdXJuTGxtUmVzcG9uc2VUcyxcclxuICAgICAgICAgIGN1cnJlbnRUdXJuUmVxdWVzdElkXHJcbiAgICAgICAgICAvLyBfcHJvY2Vzc0xsbVN0cmVhbSDQvNCw0ZQg0LLQvdGD0YLRgNGW0YjQvdGM0L4g0L7QsdGA0L7QsdC70Y/RgtC4INGB0LjQs9C90LDQuywg0L7RgtGA0LjQvNCw0L3QuNC5INCy0ZbQtCBvbGxhbWFTZXJ2aWNlXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgaWYgKHNpZ25hbC5hYm9ydGVkKSB0aHJvdyBuZXcgRXJyb3IoXCJhYm9ydGVkIGJ5IHVzZXJcIik7XHJcblxyXG4gICAgICAgIGNvbnN0IHRvb2xDYWxsQ2hlY2tSZXN1bHQgPSB0aGlzLl9kZXRlcm1pbmVUb29sQ2FsbHMoXHJcbiAgICAgICAgICBuYXRpdmVUb29sQ2FsbHMsICAgICAgICAgLy8gMS4g0KDQvtC30L/QsNGA0YHQtdC90ZYg0ZbQvdGB0YLRgNGD0LzQtdC90YLQuFxyXG4gICAgICAgICAgYWNjdW11bGF0ZWRDb250ZW50LCAgICAgIC8vIDIuINCS0LXRgdGMINGC0LXQutGB0YLQvtCy0LjQuSDQutC+0L3RgtC10L3RglxyXG4gICAgICAgICAgY3VycmVudFR1cm5MbG1SZXNwb25zZVRzLC8vIDMuIFRpbWVzdGFtcFxyXG4gICAgICAgICAgY3VycmVudFR1cm5SZXF1ZXN0SWQgICAgIC8vIDQuIFJlcXVlc3QgSUQgKNC00LvRjyDQu9C+0LPRg9Cy0LDQvdC90Y8v0LzQsNC50LHRg9GC0L3RjNC+0LPQvilcclxuICAgICAgICApO1xyXG5cclxuXHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgdG9vbENhbGxDaGVja1Jlc3VsdC5wcm9jZXNzZWRUb29sQ2FsbHNUaGlzVHVybiAmJlxyXG4gICAgICAgICAgdG9vbENhbGxDaGVja1Jlc3VsdC5wcm9jZXNzZWRUb29sQ2FsbHNUaGlzVHVybi5sZW5ndGggPiAwXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICBjb25zdCBhc3Npc3RhbnRNc2dUc01zID0gdG9vbENhbGxDaGVja1Jlc3VsdC5hc3Npc3RhbnRNZXNzYWdlRm9ySGlzdG9yeS50aW1lc3RhbXAuZ2V0VGltZSgpO1xyXG4gICAgICAgICAgY29uc3QgYXNzaXN0YW50SG1hUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIucmVnaXN0ZXJITUFSZXNvbHZlcihhc3Npc3RhbnRNc2dUc01zLCByZXNvbHZlLCByZWplY3QpO1xyXG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgICBpZiAodGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmhhcyhhc3Npc3RhbnRNc2dUc01zKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIucmVqZWN0QW5kQ2xlYXJITUFSZXNvbHZlcihcclxuICAgICAgICAgICAgICAgICAgYXNzaXN0YW50TXNnVHNNcyxcclxuICAgICAgICAgICAgICAgICAgYEhNQSBUaW1lb3V0IGZvciBhc3Npc3RhbnQgdG9vbCBpbnRlbnQgKHRzOiAke2Fzc2lzdGFudE1zZ1RzTXN9KSBpbiBfaGFuZGxlTGxtSW50ZXJhY3Rpb25DeWNsZWBcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LCAxMDAwMCk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXRQYXlsb2FkKFxyXG4gICAgICAgICAgICB0b29sQ2FsbENoZWNrUmVzdWx0LmFzc2lzdGFudE1lc3NhZ2VGb3JIaXN0b3J5LFxyXG4gICAgICAgICAgICB0cnVlXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgYXdhaXQgYXNzaXN0YW50SG1hUHJvbWlzZTtcclxuXHJcbiAgICAgICAgICBhd2FpdCB0aGlzLl9leGVjdXRlQW5kUmVuZGVyVG9vbEN5Y2xlKFxyXG4gICAgICAgICAgICB0b29sQ2FsbENoZWNrUmVzdWx0LnByb2Nlc3NlZFRvb2xDYWxsc1RoaXNUdXJuLFxyXG4gICAgICAgICAgICB0b29sQ2FsbENoZWNrUmVzdWx0LmFzc2lzdGFudE1lc3NhZ2VGb3JIaXN0b3J5LFxyXG4gICAgICAgICAgICBjdXJyZW50VHVyblJlcXVlc3RJZCxcclxuICAgICAgICAgICAgc2lnbmFsIC8vINCf0LXRgNC10LTQsNGU0LzQviDRgdC40LPQvdCw0Lsg0LTQsNC70ZZcclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgY29udGludWVDb252ZXJzYXRpb24gPSB0cnVlOyAvLyDQn9GA0L7QtNC+0LLQttGD0ZTQvNC+LCDQvtGB0LrRltC70YzQutC4INCx0YPQu9C4INCy0LjQutC70LjQutCw0L3RliDRltC90YHRgtGA0YPQvNC10L3RgtC4XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIC8vINCd0LXQvNCw0ZQg0LHRltC70YzRiNC1INCy0LjQutC70LjQutGW0LIg0ZbQvdGB0YLRgNGD0LzQtdC90YLRltCyLCDRgNC10L3QtNC10YDQuNC80L4g0YTRltC90LDQu9GM0L3QuNC5INGC0LXQutGB0YJcclxuICAgICAgICAgIGF3YWl0IHRoaXMuX3JlbmRlckZpbmFsQXNzaXN0YW50VGV4dChhY2N1bXVsYXRlZENvbnRlbnQsIGN1cnJlbnRUdXJuTGxtUmVzcG9uc2VUcywgY3VycmVudFR1cm5SZXF1ZXN0SWQpO1xyXG4gICAgICAgICAgY29udGludWVDb252ZXJzYXRpb24gPSBmYWxzZTsgLy8g0JfQsNCy0LXRgNGI0YPRlNC80L4g0YbQuNC60LtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmICh0dXJucyA+PSBtYXhUdXJucyAmJiAhc2lnbmFsLmFib3J0ZWQpIHtcclxuICAgICAgICBjb25zdCBtYXhUdXJuc01zZ1RpbWVzdGFtcCA9IG5ldyBEYXRlKCk7XHJcbiAgICAgICAgY29uc3QgbWF4VHVybnNNc2c6IE1lc3NhZ2UgPSB7XHJcbiAgICAgICAgICByb2xlOiBcInN5c3RlbVwiLFxyXG4gICAgICAgICAgY29udGVudDpcclxuICAgICAgICAgICAgXCJNYXggcHJvY2Vzc2luZyB0dXJucyByZWFjaGVkLiBJZiB0aGUgdGFzayBpcyBub3QgY29tcGxldGUsIHBsZWFzZSB0cnkgcmVwaHJhc2luZyBvciBicmVha2luZyBpdCBkb3duLlwiLFxyXG4gICAgICAgICAgdGltZXN0YW1wOiBtYXhUdXJuc01zZ1RpbWVzdGFtcCxcclxuICAgICAgICB9O1xyXG4gICAgICAgIGNvbnN0IGhtYU1heFR1cm5zUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnJlZ2lzdGVySE1BUmVzb2x2ZXIobWF4VHVybnNNc2cudGltZXN0YW1wLmdldFRpbWUoKSwgcmVzb2x2ZSwgcmVqZWN0KTtcclxuICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmhhcyhtYXhUdXJuc01zZy50aW1lc3RhbXAuZ2V0VGltZSgpKSkge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnJlamVjdEFuZENsZWFySE1BUmVzb2x2ZXIoXHJcbiAgICAgICAgICAgICAgICBtYXhUdXJuc01zZy50aW1lc3RhbXAuZ2V0VGltZSgpLFxyXG4gICAgICAgICAgICAgICAgXCJITUEgdGltZW91dCBmb3IgbWF4IHR1cm5zIG1zZyBpbiBfaGFuZGxlTGxtSW50ZXJhY3Rpb25DeWNsZVwiXHJcbiAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSwgMTAwMDApO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXRQYXlsb2FkKG1heFR1cm5zTXNnLCB0cnVlKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgYXdhaXQgaG1hTWF4VHVybnNQcm9taXNlO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVfaG1hKSB7XHJcbiAgICAgICAgICBcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIC8vINCf0L7QvNC40LvQutCwINC/0YDQvtC60LjQtNCw0ZTRgtGM0YHRjyDQtNC70Y8g0L7QsdGA0L7QsdC60Lgg0YMg0LLQuNC60LvQuNC60LDRjtGH0L7QvNGDINC80LXRgtC+0LTRliAoc2VuZE1lc3NhZ2UvaGFuZGxlUmVnZW5lcmF0ZUNsaWNrKVxyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcbn1cclxuIl19