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
import { parseAllTextualToolCalls } from "./utils/toolParser";
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
    showEmptyState() {
        var _a, _b;
        if (this.currentMessages.length === 0 && !this.emptyStateEl && this.chatContainer) {
            this.chatContainer.empty();
            this.emptyStateEl = this.chatContainer.createDiv({
                cls: CSS_CLASS_EMPTY_STATE,
            });
            this.emptyStateEl.createDiv({
                cls: "empty-state-message",
                text: "No messages yet",
            });
            const modelName = ((_b = (_a = this.plugin) === null || _a === void 0 ? void 0 : _a.settings) === null || _b === void 0 ? void 0 : _b.modelName) || "the AI";
            this.emptyStateEl.createDiv({
                cls: "empty-state-tip",
                text: `Type a message or use the menu options to start interacting with ${modelName}.`,
            });
        }
    }
    hideEmptyState() {
        if (this.emptyStateEl) {
            this.emptyStateEl.remove();
            this.emptyStateEl = null;
        }
    }
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
                    this.setLoadingState(false);
                    return;
                }
                new Notice(`Started new chat: ${activeChat.metadata.name}`);
            }
            const userMessageTimestamp = new Date();
            this.clearInputField();
            this.currentAbortController = new AbortController();
            this.setLoadingState(true);
            this.hideEmptyState();
            const llmResponseStartTimeMs = Date.now();
            let continueConversation = true;
            const maxTurns = 5;
            let turns = 0;
            let currentTurnLlmResponseTsForCatch = llmResponseStartTimeMs;
            try {
                const userMessageAdded = yield this.plugin.chatManager.addUserMessageAndAwaitRender(userInputText, userMessageTimestamp, requestTimestampId);
                if (!userMessageAdded) {
                    throw new Error("User message processing failed in ChatManager.");
                }
                let chatStateForLlm = yield this.plugin.chatManager.getActiveChatOrFail();
                while (continueConversation && turns < maxTurns && !this.currentAbortController.signal.aborted) {
                    turns++;
                    const currentTurnLlmResponseTs = turns === 1 ? llmResponseStartTimeMs : Date.now();
                    currentTurnLlmResponseTsForCatch = currentTurnLlmResponseTs;
                    this._managePlaceholder(currentTurnLlmResponseTs, requestTimestampId);
                    chatStateForLlm = yield this.plugin.chatManager.getActiveChatOrFail();
                    const llmStream = this.plugin.ollamaService.generateChatResponseStream(chatStateForLlm, this.currentAbortController.signal);
                    const { accumulatedContent, nativeToolCalls, assistantMessageWithNativeCalls } = yield this._processLlmStream(llmStream, currentTurnLlmResponseTs, requestTimestampId);
                    if (this.currentAbortController.signal.aborted)
                        throw new Error("aborted by user");
                    const toolCallCheckResult = this._determineToolCalls(nativeToolCalls, assistantMessageWithNativeCalls, accumulatedContent, currentTurnLlmResponseTs, requestTimestampId);
                    if (toolCallCheckResult.processedToolCallsThisTurn &&
                        toolCallCheckResult.processedToolCallsThisTurn.length > 0) {
                        yield this._executeAndRenderToolCycle(toolCallCheckResult.processedToolCallsThisTurn, toolCallCheckResult.assistantMessageForHistory, requestTimestampId);
                        chatStateForLlm = yield this.plugin.chatManager.getActiveChatOrFail();
                        continueConversation = true;
                    }
                    else {
                        yield this._renderFinalAssistantText(accumulatedContent, currentTurnLlmResponseTs, requestTimestampId);
                        continueConversation = false;
                    }
                }
                if (turns >= maxTurns) {
                    const maxTurnsMsgTimestamp = new Date();
                    const maxTurnsMsg = {
                        role: "system",
                        content: "Max processing turns reached. If the task is not complete, please try rephrasing or breaking it down.",
                        timestamp: maxTurnsMsgTimestamp,
                    };
                    const hmaPromise = new Promise((resolve, reject) => {
                        this.plugin.chatManager.registerHMAResolver(maxTurnsMsg.timestamp.getTime(), resolve, reject);
                        setTimeout(() => {
                            if (this.plugin.chatManager.messageAddedResolvers.has(maxTurnsMsg.timestamp.getTime())) {
                                this.plugin.chatManager.rejectAndClearHMAResolver(maxTurnsMsg.timestamp.getTime(), "HMA timeout for max turns msg");
                            }
                        }, 10000);
                    });
                    yield this.plugin.chatManager.addMessageToActiveChatPayload(maxTurnsMsg, true);
                    try {
                        yield hmaPromise;
                    }
                    catch (e_hma) { }
                }
            }
            catch (error) {
                if (this.activePlaceholder &&
                    (this.activePlaceholder.timestamp === llmResponseStartTimeMs ||
                        (currentTurnLlmResponseTsForCatch !== null &&
                            this.activePlaceholder.timestamp === currentTurnLlmResponseTsForCatch)) &&
                    this.activePlaceholder.groupEl.classList.contains("placeholder")) {
                    if (this.activePlaceholder.groupEl.isConnected)
                        this.activePlaceholder.groupEl.remove();
                }
                this.activePlaceholder = null;
                this.plugin.chatManager.rejectAndClearHMAResolver(userMessageTimestamp.getTime(), `Outer catch in sendMessage for request ${requestTimestampId}`);
                this.plugin.chatManager.rejectAndClearHMAResolver(llmResponseStartTimeMs, `Outer catch in sendMessage for request ${requestTimestampId}`);
                if (currentTurnLlmResponseTsForCatch !== null) {
                    this.plugin.chatManager.rejectAndClearHMAResolver(currentTurnLlmResponseTsForCatch, `Outer catch in sendMessage for request ${requestTimestampId}`);
                }
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
                            this.plugin.chatManager.rejectAndClearHMAResolver(errorDisplayMsg.timestamp.getTime(), "HMA timeout for error display msg");
                        }
                    }, 10000);
                });
                yield this.plugin.chatManager.addMessageToActiveChatPayload(errorDisplayMsg, true);
                try {
                    yield hmaErrorPromise;
                }
                catch (e_hma) { }
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
    handleMessageAdded(data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const messageForLog = data === null || data === void 0 ? void 0 : data.message;
            const messageTimestampForLog = (_a = messageForLog === null || messageForLog === void 0 ? void 0 : messageForLog.timestamp) === null || _a === void 0 ? void 0 : _a.getTime();
            const messageRoleForLog = messageForLog === null || messageForLog === void 0 ? void 0 : messageForLog.role;
            const hmaEntryId = Date.now();
            try {
                if (!data || !data.message) {
                    if (messageTimestampForLog)
                        this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                    return;
                }
                const { chatId: eventChatId, message } = data;
                const messageTimestampMs = message.timestamp.getTime();
                if (!this.chatContainer || !this.plugin.chatManager) {
                    if (messageTimestampForLog)
                        this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                    return;
                }
                const activeChatId = this.plugin.chatManager.getActiveChatId();
                if (eventChatId !== activeChatId) {
                    if (messageTimestampForLog)
                        this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                    return;
                }
                const existingRenderedMessage = this.chatContainer.querySelector(`.${CSS_CLASSES.MESSAGE_GROUP}:not(.placeholder)[data-timestamp="${messageTimestampMs}"]`);
                if (existingRenderedMessage) {
                    if (messageTimestampForLog)
                        this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                    return;
                }
                const alreadyInLogicCache = this.currentMessages.some(m => m.timestamp.getTime() === messageTimestampMs && m.role === message.role && m.content === message.content);
                const isPotentiallyAssistantForPlaceholder = message.role === "assistant" && ((_b = this.activePlaceholder) === null || _b === void 0 ? void 0 : _b.timestamp) === messageTimestampMs;
                if (alreadyInLogicCache && !isPotentiallyAssistantForPlaceholder) {
                    if (messageTimestampForLog)
                        this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                    return;
                }
                if (alreadyInLogicCache && isPotentiallyAssistantForPlaceholder) {
                }
                if (!alreadyInLogicCache) {
                    this.currentMessages.push(message);
                }
                if (isPotentiallyAssistantForPlaceholder && this.activePlaceholder) {
                    const placeholderToUpdate = this.activePlaceholder;
                    if (((_c = placeholderToUpdate.groupEl) === null || _c === void 0 ? void 0 : _c.isConnected) &&
                        placeholderToUpdate.contentEl &&
                        placeholderToUpdate.messageWrapper) {
                        placeholderToUpdate.groupEl.classList.remove("placeholder");
                        placeholderToUpdate.groupEl.removeAttribute("data-placeholder-timestamp");
                        placeholderToUpdate.groupEl.setAttribute("data-timestamp", messageTimestampMs.toString());
                        const messageDomElement = placeholderToUpdate.groupEl.querySelector(`.${CSS_CLASSES.MESSAGE}`);
                        if (!messageDomElement) {
                            if (placeholderToUpdate.groupEl.isConnected)
                                placeholderToUpdate.groupEl.remove();
                            this.activePlaceholder = null;
                            yield this.addMessageStandard(message);
                        }
                        else {
                            placeholderToUpdate.contentEl.classList.remove("streaming-text");
                            const dotsEl = placeholderToUpdate.contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
                            if (dotsEl) {
                                dotsEl.remove();
                            }
                            try {
                                const displayContent = AssistantMessageRenderer.prepareDisplayContent(message.content || "", message, this.plugin, this);
                                placeholderToUpdate.contentEl.empty();
                                yield RendererUtils.renderMarkdownContent(this.app, this, this.plugin, placeholderToUpdate.contentEl, displayContent);
                                AssistantMessageRenderer.addAssistantActionButtons(messageDomElement, placeholderToUpdate.contentEl, message, this.plugin, this);
                                BaseMessageRenderer.addTimestamp(messageDomElement, message.timestamp, this);
                                this.lastMessageElement = placeholderToUpdate.groupEl;
                                this.hideEmptyState();
                                const finalMessageGroupElement = placeholderToUpdate.groupEl;
                                this.activePlaceholder = null;
                                setTimeout(() => {
                                    if (finalMessageGroupElement && finalMessageGroupElement.isConnected) {
                                        this.checkMessageForCollapsing(finalMessageGroupElement);
                                    }
                                }, 70);
                                this.guaranteedScrollToBottom(100, true);
                            }
                            catch (renderError) {
                                if (placeholderToUpdate.groupEl.isConnected)
                                    placeholderToUpdate.groupEl.remove();
                                this.activePlaceholder = null;
                                this.handleErrorMessage({
                                    role: "error",
                                    content: `Failed to finalize display for ts ${messageTimestampMs}: ${renderError.message}`,
                                    timestamp: new Date(),
                                });
                            }
                        }
                    }
                    else {
                        this.activePlaceholder = null;
                        yield this.addMessageStandard(message);
                    }
                }
                else {
                    yield this.addMessageStandard(message);
                }
            }
            catch (outerError) {
                this.handleErrorMessage({
                    role: "error",
                    content: `Internal error in handleMessageAdded for ${messageRoleForLog} msg (ts ${messageTimestampForLog}): ${outerError.message}`,
                    timestamp: new Date(),
                });
            }
            finally {
                if (messageTimestampForLog) {
                    this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                }
            }
        });
    }
    handleRegenerateClick(userMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (this.isRegenerating) {
                new Notice("Regeneration is already in progress. Please wait.", 3000);
                return;
            }
            if (this.currentAbortController) {
                new Notice("Previous generation process is still active or finishing. Please wait.", 4000);
                return;
            }
            const activeChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
            if (!activeChat) {
                new Notice("Cannot regenerate: No active chat found.");
                return;
            }
            const chatId = activeChat.metadata.id;
            const messageIndex = activeChat.messages.findIndex(msg => msg.timestamp.getTime() === userMessage.timestamp.getTime() && msg.role === userMessage.role);
            if (messageIndex === -1) {
                new Notice("Error: Could not find the message to regenerate from.");
                return;
            }
            const hasMessagesAfter = activeChat.messages.length > messageIndex + 1;
            new ConfirmModal(this.app, "Confirm Regeneration", hasMessagesAfter
                ? "This will delete all messages after this prompt and generate a new response. Continue?"
                : "Generate a new response for this prompt?", () => __awaiter(this, void 0, void 0, function* () {
                var _a, e_1, _b, _c;
                var _d, _e, _f, _g, _h, _j, _k, _l, _m;
                this.isRegenerating = true;
                const regenerationRequestTimestamp = new Date().getTime();
                this.currentAbortController = new AbortController();
                let accumulatedResponse = "";
                const responseStartTime = new Date();
                const responseStartTimeMs = responseStartTime.getTime();
                this.setLoadingState(true);
                let streamErrorOccurred = null;
                let mainAssistantMessageProcessedPromise;
                try {
                    if (hasMessagesAfter) {
                        const deleteSuccess = yield this.plugin.chatManager.deleteMessagesAfter(chatId, messageIndex);
                        if (!deleteSuccess) {
                            throw new Error("Failed to delete subsequent messages for regeneration.");
                        }
                    }
                    yield this.loadAndDisplayActiveChat();
                    this.guaranteedScrollToBottom(50, true);
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
                    for (let i = 0; i < 3; i++)
                        dots.createDiv({ cls: CSS_CLASSES.THINKING_DOT });
                    if (assistantPlaceholderGroupEl && assistantContentEl && messageWrapperEl) {
                        this.activePlaceholder = {
                            timestamp: responseStartTimeMs,
                            groupEl: assistantPlaceholderGroupEl,
                            contentEl: assistantContentEl,
                            messageWrapper: messageWrapperEl,
                        };
                    }
                    else {
                        throw new Error("Failed to create placeholder elements for regeneration.");
                    }
                    assistantPlaceholderGroupEl.classList.add(CSS_CLASSES.MESSAGE_ARRIVING);
                    setTimeout(() => assistantPlaceholderGroupEl === null || assistantPlaceholderGroupEl === void 0 ? void 0 : assistantPlaceholderGroupEl.classList.remove(CSS_CLASSES.MESSAGE_ARRIVING), 500);
                    this.guaranteedScrollToBottom(50, true);
                    const chatForStreaming = yield this.plugin.chatManager.getChat(chatId);
                    if (!chatForStreaming) {
                        throw new Error("Failed to get updated chat context for streaming regeneration.");
                    }
                    const stream = this.plugin.ollamaService.generateChatResponseStream(chatForStreaming, this.currentAbortController.signal);
                    let firstChunk = true;
                    try {
                        for (var _o = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield stream_1.next(), _a = stream_1_1.done, !_a; _o = true) {
                            _c = stream_1_1.value;
                            _o = false;
                            const chunk = _c;
                            if (this.currentAbortController.signal.aborted) {
                                throw new Error("aborted by user");
                            }
                            if ("error" in chunk && chunk.error) {
                                if (!chunk.error.includes("aborted by user")) {
                                    throw new Error(chunk.error);
                                }
                                else {
                                    throw new Error("aborted by user");
                                }
                            }
                            if ("response" in chunk && chunk.response) {
                                if (((_d = this.activePlaceholder) === null || _d === void 0 ? void 0 : _d.timestamp) === responseStartTimeMs && this.activePlaceholder.contentEl) {
                                    if (firstChunk) {
                                        const thinkingDots = this.activePlaceholder.contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
                                        if (thinkingDots)
                                            thinkingDots.remove();
                                        firstChunk = false;
                                    }
                                    accumulatedResponse += chunk.response;
                                    yield RendererUtils.renderMarkdownContent(this.app, this, this.plugin, this.activePlaceholder.contentEl, accumulatedResponse);
                                    this.guaranteedScrollToBottom(50, true);
                                }
                                else {
                                    accumulatedResponse += chunk.response;
                                }
                            }
                            if ("done" in chunk && chunk.done) {
                                break;
                            }
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (!_o && !_a && (_b = stream_1.return)) yield _b.call(stream_1);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                    if (accumulatedResponse.trim()) {
                        mainAssistantMessageProcessedPromise = new Promise(resolve => {
                            this.messageAddedResolvers.set(responseStartTimeMs, resolve);
                        });
                        this.plugin.chatManager.addMessageToActiveChat("assistant", accumulatedResponse, responseStartTime, true);
                        const timeoutDuration = 10000;
                        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout (${timeoutDuration / 1000}s) waiting for HMA for ts ${responseStartTimeMs}`)), timeoutDuration));
                        try {
                            yield Promise.race([mainAssistantMessageProcessedPromise, timeoutPromise]);
                        }
                        catch (awaitPromiseError) {
                            streamErrorOccurred = streamErrorOccurred || awaitPromiseError;
                            if (this.messageAddedResolvers.has(responseStartTimeMs)) {
                                this.messageAddedResolvers.delete(responseStartTimeMs);
                            }
                        }
                    }
                    else if (!this.currentAbortController.signal.aborted) {
                        if (((_e = this.activePlaceholder) === null || _e === void 0 ? void 0 : _e.timestamp) === responseStartTimeMs &&
                            ((_f = this.activePlaceholder.groupEl) === null || _f === void 0 ? void 0 : _f.isConnected)) {
                            this.activePlaceholder.groupEl.remove();
                        }
                        if (((_g = this.activePlaceholder) === null || _g === void 0 ? void 0 : _g.timestamp) === responseStartTimeMs) {
                            this.activePlaceholder = null;
                        }
                        this.plugin.chatManager.addMessageToActiveChat("system", "Assistant provided an empty response during regeneration.", new Date(), true);
                    }
                }
                catch (error) {
                    streamErrorOccurred = error;
                    if (((_h = this.activePlaceholder) === null || _h === void 0 ? void 0 : _h.timestamp) === responseStartTimeMs) {
                        if ((_j = this.activePlaceholder.groupEl) === null || _j === void 0 ? void 0 : _j.isConnected)
                            this.activePlaceholder.groupEl.remove();
                        this.activePlaceholder = null;
                    }
                    if (this.messageAddedResolvers.has(responseStartTimeMs)) {
                        this.messageAddedResolvers.delete(responseStartTimeMs);
                    }
                    let errorMsgForChat = "An unexpected error occurred during regeneration.";
                    let errorMsgRole = "error";
                    let savePartialResponseOnError = false;
                    if (error.name === "AbortError" || ((_k = error.message) === null || _k === void 0 ? void 0 : _k.includes("aborted by user"))) {
                        errorMsgForChat = "Regeneration stopped.";
                        errorMsgRole = "system";
                        if (accumulatedResponse.trim())
                            savePartialResponseOnError = true;
                    }
                    else {
                        errorMsgForChat = `Regeneration failed: ${error.message || "Unknown error"}`;
                        new Notice(errorMsgForChat, 5000);
                    }
                    this.plugin.chatManager.addMessageToActiveChat(errorMsgRole, errorMsgForChat, new Date(), true);
                    if (savePartialResponseOnError) {
                        this.plugin.chatManager.addMessageToActiveChat("assistant", accumulatedResponse, responseStartTime, true);
                    }
                }
                finally {
                    if (this.messageAddedResolvers.has(responseStartTimeMs)) {
                        this.messageAddedResolvers.delete(responseStartTimeMs);
                    }
                    if (((_l = this.activePlaceholder) === null || _l === void 0 ? void 0 : _l.timestamp) === responseStartTimeMs) {
                        if ((_m = this.activePlaceholder.groupEl) === null || _m === void 0 ? void 0 : _m.isConnected) {
                            this.activePlaceholder.groupEl.remove();
                        }
                        this.activePlaceholder = null;
                    }
                    this.currentAbortController = null;
                    this.isRegenerating = false;
                    this.setLoadingState(false);
                    requestAnimationFrame(() => {
                        this.updateSendButtonState();
                    });
                    this.focusInput();
                }
            })).open();
        });
    }
    loadAndDisplayActiveChat() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            let metadataUpdated = false;
            try {
                this.clearChatContainerInternal();
                this.lastMessageElement = null;
                this.consecutiveErrorMessages = [];
                this.errorGroupElement = null;
                let activeChat = null;
                let availableModels = [];
                let finalModelName = null;
                let finalRolePath = undefined;
                let finalRoleName = "None";
                let finalTemperature = undefined;
                let errorOccurredLoadingData = false;
                try {
                    activeChat = (yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())) || null;
                    availableModels = yield this.plugin.ollamaService.getModels();
                    finalRolePath =
                        ((_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.selectedRolePath) !== undefined
                            ? activeChat.metadata.selectedRolePath
                            : this.plugin.settings.selectedRolePath;
                    finalRoleName = yield this.findRoleNameByPath(finalRolePath);
                }
                catch (error) {
                    new Notice("Error connecting to Ollama or loading chat data.", 5000);
                    errorOccurredLoadingData = true;
                    availableModels = availableModels || [];
                    finalModelName = availableModels.includes(this.plugin.settings.modelName)
                        ? this.plugin.settings.modelName
                        : (_c = availableModels[0]) !== null && _c !== void 0 ? _c : null;
                    finalTemperature = this.plugin.settings.temperature;
                    finalRolePath = this.plugin.settings.selectedRolePath;
                    finalRoleName = yield this.findRoleNameByPath(finalRolePath);
                    activeChat = null;
                }
                if (!errorOccurredLoadingData && activeChat) {
                    let preferredModel = ((_d = activeChat.metadata) === null || _d === void 0 ? void 0 : _d.modelName) || this.plugin.settings.modelName;
                    if (availableModels.length > 0) {
                        if (preferredModel && availableModels.includes(preferredModel)) {
                            finalModelName = preferredModel;
                        }
                        else {
                            finalModelName = availableModels[0];
                        }
                    }
                    else {
                        finalModelName = null;
                    }
                    if (activeChat.metadata.modelName !== finalModelName && finalModelName !== null) {
                        try {
                            const updateSuccess = yield this.plugin.chatManager.updateActiveChatMetadata({ modelName: finalModelName });
                            if (updateSuccess) {
                                metadataUpdated = true;
                                const potentiallyUpdatedChat = yield this.plugin.chatManager.getChat(activeChat.metadata.id);
                                if (potentiallyUpdatedChat)
                                    activeChat = potentiallyUpdatedChat;
                            }
                            else {
                            }
                        }
                        catch (updateError) { }
                    }
                    finalTemperature = (_f = (_e = activeChat.metadata) === null || _e === void 0 ? void 0 : _e.temperature) !== null && _f !== void 0 ? _f : this.plugin.settings.temperature;
                }
                else if (!errorOccurredLoadingData && !activeChat) {
                    finalModelName = availableModels.includes(this.plugin.settings.modelName)
                        ? this.plugin.settings.modelName
                        : (_g = availableModels[0]) !== null && _g !== void 0 ? _g : null;
                    finalTemperature = this.plugin.settings.temperature;
                    finalRolePath = this.plugin.settings.selectedRolePath;
                    finalRoleName = yield this.findRoleNameByPath(finalRolePath);
                }
                if (activeChat && !errorOccurredLoadingData && ((_h = activeChat.messages) === null || _h === void 0 ? void 0 : _h.length) > 0) {
                    this.hideEmptyState();
                    this.currentMessages = [...activeChat.messages];
                    this.lastRenderedMessageDate = null;
                    for (const message of this.currentMessages) {
                        let messageGroupEl = null;
                        const isNewDay = !this.lastRenderedMessageDate || !this.isSameDay(this.lastRenderedMessageDate, message.timestamp);
                        const isFirstMessageInContainer = this.chatContainer.children.length === 0;
                        if (isNewDay || isFirstMessageInContainer) {
                            if (isNewDay && this.chatContainer.children.length > 0) {
                                this.renderDateSeparator(message.timestamp);
                            }
                            this.lastRenderedMessageDate = message.timestamp;
                        }
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
                                    messageGroupEl = this.errorGroupElement;
                                    break;
                                case "tool":
                                    renderer = new ToolMessageRenderer(this.app, this.plugin, message, this);
                                    break;
                                default:
                                    const unknownRoleGroup = (_j = this.chatContainer) === null || _j === void 0 ? void 0 : _j.createDiv({ cls: CSS_CLASSES.MESSAGE_GROUP });
                                    if (unknownRoleGroup && this.chatContainer) {
                                        RendererUtils.renderAvatar(this.app, this.plugin, unknownRoleGroup, false);
                                        const wrapper = unknownRoleGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
                                        const msgBubble = wrapper.createDiv({ cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.SYSTEM_MESSAGE}` });
                                        msgBubble.createDiv({
                                            cls: CSS_CLASSES.SYSTEM_MESSAGE_TEXT || "system-message-text",
                                            text: `Unknown message role: ${message.role}`,
                                        });
                                        BaseMessageRenderer.addTimestamp(msgBubble, message.timestamp, this);
                                        this.chatContainer.appendChild(unknownRoleGroup);
                                        messageGroupEl = unknownRoleGroup;
                                    }
                                    break;
                            }
                            if (renderer && message.role !== "error") {
                                const result = renderer.render();
                                messageGroupEl = result instanceof Promise ? yield result : result;
                            }
                        }
                        catch (renderError) {
                            const errorDiv = this.chatContainer.createDiv({ cls: CSS_CLASSES.ERROR_MESSAGE || "render-error" });
                            errorDiv.setText(`Error rendering message (role: ${message.role})`);
                            messageGroupEl = errorDiv;
                        }
                        if (messageGroupEl) {
                            if (messageGroupEl.parentElement !== this.chatContainer) {
                                this.chatContainer.appendChild(messageGroupEl);
                            }
                            this.lastMessageElement = messageGroupEl;
                        }
                    }
                    setTimeout(() => this.checkAllMessagesForCollapsing(), 100);
                    setTimeout(() => {
                        this.guaranteedScrollToBottom(100, true);
                        setTimeout(() => {
                            this.updateScrollStateAndIndicators();
                        }, 150);
                    }, 150);
                }
                else {
                    this.showEmptyState();
                    (_k = this.scrollToBottomButton) === null || _k === void 0 ? void 0 : _k.classList.remove(CSS_CLASSES.VISIBLE || "visible");
                }
                this.updateInputPlaceholder(finalRoleName);
                this.updateRoleDisplay(finalRoleName);
                this.updateModelDisplay(finalModelName);
                this.updateTemperatureIndicator(finalTemperature);
                if (finalModelName === null) {
                    if (this.inputEl) {
                        this.inputEl.disabled = true;
                        this.inputEl.placeholder = "No models available...";
                    }
                    if (this.sendButton) {
                        this.sendButton.disabled = true;
                        this.sendButton.classList.add(CSS_CLASSES.DISABLED || "disabled");
                    }
                    if (this.isProcessing)
                        this.setLoadingState(false);
                }
                else {
                    if (this.inputEl && !this.isProcessing) {
                        this.inputEl.disabled = false;
                    }
                    this.updateSendButtonState();
                }
            }
            catch (error) {
                this.clearChatContainerInternal();
                this.showEmptyState();
                if (this.chatContainer) {
                    this.chatContainer.createDiv({
                        cls: "fatal-error-message",
                        text: "Failed to load chat content. Please check console.",
                    });
                }
                return { metadataUpdated: false };
            }
            finally {
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
    _processLlmStream(stream, currentTurnLlmResponseTs, requestTimestampId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, stream_2, stream_2_1;
            var _b, e_2, _c, _d;
            var _e, _f, _g, _h, _j;
            let accumulatedContent = "";
            let nativeToolCalls = null;
            let assistantMessageWithNativeCalls = null;
            let firstChunkForTurn = true;
            try {
                for (_a = true, stream_2 = __asyncValues(stream); stream_2_1 = yield stream_2.next(), _b = stream_2_1.done, !_b; _a = true) {
                    _d = stream_2_1.value;
                    _a = false;
                    const chunk = _d;
                    if ((_e = this.currentAbortController) === null || _e === void 0 ? void 0 : _e.signal.aborted) {
                        throw new Error("aborted by user");
                    }
                    if (chunk.type === "error") {
                        throw new Error(chunk.error);
                    }
                    if (((_f = this.activePlaceholder) === null || _f === void 0 ? void 0 : _f.timestamp) !== currentTurnLlmResponseTs) {
                        if (chunk.type === "done")
                            break;
                        continue;
                    }
                    if (chunk.type === "content") {
                        if ((_g = this.activePlaceholder) === null || _g === void 0 ? void 0 : _g.contentEl) {
                            if (firstChunkForTurn) {
                                const thinkingDots = this.activePlaceholder.contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
                                if (thinkingDots)
                                    thinkingDots.remove();
                                firstChunkForTurn = false;
                            }
                            accumulatedContent += chunk.response;
                            yield RendererUtils.renderMarkdownContent(this.app, this, this.plugin, this.activePlaceholder.contentEl, accumulatedContent);
                            this.guaranteedScrollToBottom(30, true);
                        }
                    }
                    else if (chunk.type === "tool_calls") {
                        nativeToolCalls = chunk.calls;
                        assistantMessageWithNativeCalls = chunk.assistant_message_with_calls;
                        if (assistantMessageWithNativeCalls === null || assistantMessageWithNativeCalls === void 0 ? void 0 : assistantMessageWithNativeCalls.content) {
                            if (firstChunkForTurn && ((_h = this.activePlaceholder) === null || _h === void 0 ? void 0 : _h.contentEl)) {
                                const thinkingDots = this.activePlaceholder.contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
                                if (thinkingDots)
                                    thinkingDots.remove();
                                firstChunkForTurn = false;
                            }
                            if (!accumulatedContent.endsWith(assistantMessageWithNativeCalls.content)) {
                                accumulatedContent += assistantMessageWithNativeCalls.content;
                            }
                            if ((_j = this.activePlaceholder) === null || _j === void 0 ? void 0 : _j.contentEl) {
                                yield RendererUtils.renderMarkdownContent(this.app, this, this.plugin, this.activePlaceholder.contentEl, accumulatedContent);
                            }
                        }
                    }
                    else if (chunk.type === "done") {
                        break;
                    }
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (!_a && !_b && (_c = stream_2.return)) yield _c.call(stream_2);
                }
                finally { if (e_2) throw e_2.error; }
            }
            return { accumulatedContent, nativeToolCalls, assistantMessageWithNativeCalls };
        });
    }
    _determineToolCalls(nativeToolCalls, assistantMessageWithNativeCalls, accumulatedLlmContent, currentTurnLlmResponseTs, requestTimestampId) {
        let processedToolCallsThisTurn = nativeToolCalls;
        let isTextualFallbackUsed = false;
        let assistantMessageForHistory;
        if (!processedToolCallsThisTurn || processedToolCallsThisTurn.length === 0) {
            const parsedTextualCalls = parseAllTextualToolCalls(accumulatedLlmContent, this.plugin.logger);
            if (parsedTextualCalls.length > 0) {
                isTextualFallbackUsed = true;
                processedToolCallsThisTurn = parsedTextualCalls.map((tc, index) => ({
                    type: "function",
                    id: `texttool-${currentTurnLlmResponseTs}-${index}`,
                    function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) },
                }));
                assistantMessageForHistory = {
                    role: "assistant",
                    content: accumulatedLlmContent,
                    timestamp: new Date(currentTurnLlmResponseTs),
                };
            }
            else {
                assistantMessageForHistory = {
                    role: "assistant",
                    content: accumulatedLlmContent,
                    timestamp: new Date(currentTurnLlmResponseTs),
                };
            }
        }
        else {
            assistantMessageForHistory = assistantMessageWithNativeCalls || {
                role: "assistant",
                content: accumulatedLlmContent,
                timestamp: new Date(currentTurnLlmResponseTs),
                tool_calls: processedToolCallsThisTurn,
            };
            assistantMessageForHistory.content = accumulatedLlmContent;
            assistantMessageForHistory.tool_calls = processedToolCallsThisTurn;
        }
        return { processedToolCallsThisTurn, assistantMessageForHistory, isTextualFallbackUsed };
    }
    _executeAndRenderToolCycle(toolsToExecute, assistantMessageIntent, requestTimestampId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const currentViewInstance = this;
            const assistantMsgTsMs = assistantMessageIntent.timestamp.getTime();
            const assistantHmaPromise = new Promise((resolve, reject) => {
                currentViewInstance.plugin.chatManager.registerHMAResolver(assistantMsgTsMs, resolve, reject);
                setTimeout(() => {
                    if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(assistantMsgTsMs)) {
                        currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(assistantMsgTsMs, `HMA Timeout for assistant tool intent (ts: ${assistantMsgTsMs})`);
                    }
                }, 10000);
            });
            yield currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(assistantMessageIntent, true);
            yield assistantHmaPromise;
            if (((_a = currentViewInstance.activePlaceholder) === null || _a === void 0 ? void 0 : _a.timestamp) === assistantMsgTsMs) {
                currentViewInstance.activePlaceholder = null;
            }
            for (const call of toolsToExecute) {
                if ((_b = currentViewInstance.currentAbortController) === null || _b === void 0 ? void 0 : _b.signal.aborted)
                    throw new Error("aborted by user");
                if (call.type === "function") {
                    const toolName = call.function.name;
                    let toolArgs = {};
                    try {
                        toolArgs = JSON.parse(call.function.arguments || "{}");
                    }
                    catch (e) {
                        const errorContent = `Error parsing args for ${toolName}: ${e.message}. Args string: "${call.function.arguments}"`;
                        const errorToolTimestamp = new Date();
                        const errorToolMsg = {
                            role: "tool",
                            tool_call_id: call.id,
                            name: toolName,
                            content: errorContent,
                            timestamp: errorToolTimestamp,
                        };
                        const toolErrorHmaPromise = new Promise((resolve, reject) => {
                            currentViewInstance.plugin.chatManager.registerHMAResolver(errorToolMsg.timestamp.getTime(), resolve, reject);
                            setTimeout(() => {
                                if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(errorToolMsg.timestamp.getTime())) {
                                    currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(errorToolMsg.timestamp.getTime(), "HMA timeout for tool error msg");
                                }
                            }, 10000);
                        });
                        yield currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(errorToolMsg, true);
                        try {
                            yield toolErrorHmaPromise;
                        }
                        catch (e_hma) {
                        }
                        continue;
                    }
                    const execResult = yield currentViewInstance.plugin.agentManager.executeTool(toolName, toolArgs);
                    const toolResultContent = execResult.success
                        ? execResult.result
                        : `Error executing tool ${toolName}: ${execResult.error || "Unknown tool error"}`;
                    const toolResponseTimestamp = new Date();
                    const toolResponseMsg = {
                        role: "tool",
                        tool_call_id: call.id,
                        name: toolName,
                        content: toolResultContent,
                        timestamp: toolResponseTimestamp,
                    };
                    const toolResultHmaPromise = new Promise((resolve, reject) => {
                        currentViewInstance.plugin.chatManager.registerHMAResolver(toolResponseMsg.timestamp.getTime(), resolve, reject);
                        setTimeout(() => {
                            if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(toolResponseMsg.timestamp.getTime())) {
                                currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(toolResponseMsg.timestamp.getTime(), `HMA Timeout for tool result: ${toolName}`);
                            }
                        }, 10000);
                    });
                    yield currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(toolResponseMsg, true);
                    yield toolResultHmaPromise;
                }
            }
        });
    }
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
                catch (e_hma) {
                }
            }
            if (((_b = currentViewInstance.activePlaceholder) === null || _b === void 0 ? void 0 : _b.timestamp) === responseTimestampMs) {
                currentViewInstance.activePlaceholder = null;
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiT2xsYW1hVmlldy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIk9sbGFtYVZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFDTCxRQUFRLEVBRVIsT0FBTyxFQUNQLGdCQUFnQixFQUNoQixNQUFNLEVBQ04sUUFBUSxFQUNSLGFBQWEsRUFDYixPQUFPLEVBRVAsSUFBSSxFQUNKLFFBQVEsR0FDVCxNQUFNLFVBQVUsQ0FBQztBQUVsQixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDOUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUU1QyxPQUFPLEVBQWMsU0FBUyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBR25ELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUk5QyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBRTFDLE9BQU8sS0FBSyxhQUFhLE1BQU0sd0JBQXdCLENBQUM7QUFDeEQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDeEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ2xELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRXRFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlELE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFHLDJCQUEyQixDQUFDO0FBRXJFLE1BQU0sZ0JBQWdCLEdBQUcsR0FBRyxDQUFDO0FBRTdCLE1BQU0sMkJBQTJCLEdBQUcsbUJBQW1CLENBQUM7QUFDeEQsTUFBTSxxQkFBcUIsR0FBRyxvQkFBb0IsQ0FBQztBQUNuRCxNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxTQUFTLENBQUM7QUFDM0MsTUFBTSxvQkFBb0IsR0FBRyxvQkFBb0IsQ0FBQztBQUNsRCxNQUFNLCtCQUErQixHQUFHLHVCQUF1QixDQUFDO0FBQ2hFLE1BQU0sNkJBQTZCLEdBQUcscUJBQXFCLENBQUM7QUFDNUQsTUFBTSw2QkFBNkIsR0FBRyxxQkFBcUIsQ0FBQztBQUM1RCxNQUFNLG1CQUFtQixHQUFHLFdBQVcsQ0FBQztBQUN4QyxNQUFNLGtCQUFrQixHQUFHLFVBQVUsQ0FBQztBQUN0QyxNQUFNLHdCQUF3QixHQUFHLHFCQUFxQixDQUFDO0FBQ3ZELE1BQU0saUJBQWlCLEdBQUcsU0FBUyxDQUFDO0FBQ3BDLE1BQU0sMkJBQTJCLEdBQUcsMkJBQTJCLENBQUM7QUFDaEUsTUFBTSxxQkFBcUIsR0FBRyxhQUFhLENBQUM7QUFFNUMsTUFBTSxtQkFBbUIsR0FBRyx3QkFBd0IsQ0FBQztBQUNyRCxNQUFNLHdCQUF3QixHQUFHLDZCQUE2QixDQUFDO0FBQy9ELE1BQU0sd0JBQXdCLEdBQUcsNkJBQTZCLENBQUM7QUFDL0QsTUFBTSwwQkFBMEIsR0FBRyxXQUFXLENBQUM7QUFDL0MsTUFBTSwwQkFBMEIsR0FBRyxXQUFXLENBQUM7QUFDL0MsTUFBTSx3QkFBd0IsR0FBRyw2QkFBNkIsQ0FBQztBQUMvRCxNQUFNLHdCQUF3QixHQUFHLDZCQUE2QixDQUFDO0FBQy9ELE1BQU0scUJBQXFCLEdBQUcsMEJBQTBCLENBQUM7QUFDekQsTUFBTSx3QkFBd0IsR0FBRyx1QkFBdUIsQ0FBQztBQUV6RCxNQUFNLHdCQUF3QixHQUFHLHVCQUF1QixDQUFDO0FBQ3pELE1BQU0sa0JBQWtCLEdBQUcsYUFBYSxDQUFDO0FBSXpDLE1BQU0sT0FBTyxVQUFXLFNBQVEsUUFBUTtJQTJFdEMsWUFBWSxJQUFtQixFQUFFLE1BQW9CO1FBQ25ELEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQXZETixpQkFBWSxHQUFZLEtBQUssQ0FBQztRQUM5QixrQkFBYSxHQUEwQixJQUFJLENBQUM7UUFDNUMsaUJBQVksR0FBa0IsSUFBSSxDQUFDO1FBQ25DLGtCQUFhLEdBQXlCLElBQUksQ0FBQztRQUMzQyxnQkFBVyxHQUF1QixJQUFJLENBQUM7UUFDdkMsaUJBQVksR0FBdUIsSUFBSSxDQUFDO1FBQ3hDLGtCQUFhLEdBQTBCLElBQUksQ0FBQztRQUU1QyxvQkFBZSxHQUFjLEVBQUUsQ0FBQztRQUNoQyw0QkFBdUIsR0FBZ0IsSUFBSSxDQUFDO1FBQzVDLDJCQUFzQixHQUF1QixJQUFJLENBQUM7UUFDbEQsbUJBQWMsR0FBWSxLQUFLLENBQUM7UUFLaEMsd0JBQW1CLEdBQWtCLElBQUksQ0FBQztRQVMxQywyQkFBc0IsR0FBMkIsSUFBSSxDQUFDO1FBRXRELHVCQUFrQixHQUF1QixJQUFJLENBQUM7UUFDOUMsNkJBQXdCLEdBQWMsRUFBRSxDQUFDO1FBQ3pDLHNCQUFpQixHQUF1QixJQUFJLENBQUM7UUFDN0Msd0JBQW1CLEdBQUcsS0FBSyxDQUFDO1FBRTVCLG1CQUFjLEdBQVksS0FBSyxDQUFDO1FBQ2hDLDBCQUFxQixHQUE0QixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRTNELDhCQUF5QixHQUFHLEtBQUssQ0FBQztRQUNsQyw0QkFBdUIsR0FBMEIsSUFBSSxDQUFDO1FBRXRELHNCQUFpQixHQUtkLElBQUksQ0FBQztRQUlSLGVBQVUsR0FBRyxLQUFLLENBQUM7UUFDbkIsa0JBQWEsR0FBRyxDQUFDLENBQUM7UUFDbEIsd0JBQW1CLEdBQUcsQ0FBQyxDQUFDO1FBd1J4QixxQkFBZ0IsR0FBRyxHQUFTLEVBQUU7WUFDcEMsSUFBSSxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztnQkFDaEMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3RDLENBQUM7aUJBQU0sQ0FBQztZQUNSLENBQUM7UUFDSCxDQUFDLENBQUM7UUFFTSx5QkFBb0IsR0FBRyxDQUFDLElBQXlDLEVBQVEsRUFBRTs7WUFDakYsTUFBTSxtQkFBbUIsR0FBRyxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVywwQ0FBRSxlQUFlLEVBQUUsQ0FBQztZQUV2RSxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssbUJBQW1CLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQy9ELE9BQU87WUFDVCxDQUFDO1lBRUQsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUM3QyxNQUFNLFFBQVEsR0FBRyxJQUFJLFdBQVcsQ0FBQyxhQUFhLG9CQUFvQixXQUFXLElBQUksQ0FBQztZQUVsRixJQUFJLENBQUM7Z0JBQ0gsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBRWxFLElBQUksY0FBYyxZQUFZLFdBQVcsRUFBRSxDQUFDO29CQUMxQyxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDO29CQUN0RCxNQUFNLGFBQWEsR0FBRyxjQUFjLENBQUMsWUFBWSxDQUFDO29CQUNsRCxNQUFNLGdCQUFnQixHQUFHLGNBQWMsQ0FBQyxTQUFTLEdBQUcsZ0JBQWdCLENBQUM7b0JBRXJFLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFFeEIsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUM7b0JBQ2xELElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxLQUFLLFdBQVcsQ0FBQyxDQUFDO29CQUVuRyxJQUFJLGdCQUFnQixFQUFFLENBQUM7d0JBQ3JCLE1BQU0sWUFBWSxHQUFHLGdCQUFnQixHQUFHLGFBQWEsQ0FBQzt3QkFDdEQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLEdBQUcsWUFBWSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3RFLENBQUM7eUJBQU0sQ0FBQzt3QkFDTixJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsR0FBRyxnQkFBZ0IsQ0FBQztvQkFDbEQsQ0FBQztvQkFFRCxJQUFJLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO3dCQUN0QyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7b0JBQ3hCLENBQUM7Z0JBQ0gsQ0FBQztxQkFBTSxJQUFJLGNBQWMsRUFBRSxDQUFDO29CQUMxQixJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztnQkFDbEMsQ0FBQztxQkFBTSxDQUFDO2dCQUNSLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztZQUNsQyxDQUFDO1FBQ0gsQ0FBQyxDQUFDO1FBRU0sd0JBQW1CLEdBQUcsR0FBd0IsRUFBRTs7WUFDdEQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQztZQUN2QyxJQUFJLENBQUMsU0FBUyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDM0MsT0FBTztZQUNULENBQUM7WUFFRCxJQUFJLENBQUEsTUFBQSxJQUFJLENBQUMsaUJBQWlCLDBDQUFFLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFLLE1BQU0sRUFBRSxDQUFDO2dCQUN0RSxPQUFPO1lBQ1QsQ0FBQztZQUVELE1BQU0sZ0JBQWdCLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQztZQUM3QyxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7WUFFbEIsSUFBSSxDQUFDO2dCQUNILE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3BELE1BQU0sVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ2pFLE1BQU0sZUFBZSxHQUFHLE1BQUEsTUFBQSxVQUFVLGFBQVYsVUFBVSx1QkFBVixVQUFVLENBQUUsUUFBUSwwQ0FBRSxnQkFBZ0IsbUNBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUM7Z0JBRXhHLE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSx3QkFBd0IsRUFBRSxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2xILE1BQU0sWUFBWSxHQUFHLFlBQVksQ0FBQyxVQUFVLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyx3QkFBd0IsRUFBRSxrQkFBa0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDdEcsWUFBWSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLHdCQUF3QixFQUFFLGtCQUFrQixDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7Z0JBQy9GLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztvQkFDckIsWUFBWSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO29CQUNsRCxPQUFPLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUNqQyxDQUFDO3FCQUFNLENBQUM7b0JBQ04sT0FBTyxDQUFDLFlBQVksRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDakMsQ0FBQztnQkFDRCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsSUFBSSxFQUFFLGVBQWUsQ0FBQyxDQUFDLENBQUM7Z0JBRXpHLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUU7b0JBQ3ZCLE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQ3hGLE1BQU0sUUFBUSxHQUFHLFlBQVksQ0FBQyxVQUFVLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyx3QkFBd0IsRUFBRSxrQkFBa0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDbEcsWUFBWSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLHdCQUF3QixFQUFFLGtCQUFrQixDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUN0RyxJQUFJLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQzt3QkFDdEIsWUFBWSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO29CQUNwRCxDQUFDO29CQUNELElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxlQUFlLEVBQUUsQ0FBQzt3QkFDdEMsWUFBWSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO3dCQUNsRCxPQUFPLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO29CQUM3QixDQUFDO3lCQUFNLENBQUM7d0JBQ04sT0FBTyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDO29CQUM5RCxDQUFDO29CQUNELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxRQUFRLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQztnQkFDL0csQ0FBQyxDQUFDLENBQUM7WUFDTCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ2xCLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxJQUFJLEVBQUUsc0JBQXNCLEVBQUUsR0FBRyxFQUFFLGlCQUFpQixFQUFFLENBQUMsQ0FBQztZQUNoRixDQUFDO29CQUFTLENBQUM7Z0JBQ1QscUJBQXFCLENBQUMsR0FBRyxFQUFFO29CQUN6QixTQUFTLENBQUMsU0FBUyxHQUFHLGdCQUFnQixDQUFDO2dCQUN6QyxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7UUFDSCxDQUFDLENBQUEsQ0FBQztRQUVNLDZCQUF3QixHQUFHLENBQ2pDLFFBQXlCLEVBQ3pCLGVBQTBDLEVBQzNCLEVBQUU7O1lBQ2pCLE1BQU0sV0FBVyxHQUFHLE1BQUEsUUFBUSxhQUFSLFFBQVEsdUJBQVIsUUFBUSxDQUFFLElBQUksbUNBQUksRUFBRSxDQUFDO1lBQ3pDLE1BQU0sZ0JBQWdCLEdBQUcsTUFBQSxRQUFRLGFBQVIsUUFBUSx1QkFBUixRQUFRLENBQUUsSUFBSSxtQ0FBSSxNQUFNLENBQUM7WUFFbEQsSUFBSSxXQUFXLEtBQUssZUFBZSxFQUFFLENBQUM7Z0JBQ3BDLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQSxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVywwQ0FBRSxhQUFhLEVBQUUsQ0FBQSxDQUFDO2dCQUNsRSxJQUFJLENBQUM7b0JBQ0gsSUFBSSxVQUFVLEVBQUUsQ0FBQzt3QkFDZixNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDOzRCQUNyRCxnQkFBZ0IsRUFBRSxXQUFXO3lCQUM5QixDQUFDLENBQUM7b0JBQ0wsQ0FBQzt5QkFBTSxDQUFDO3dCQUNOLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixHQUFHLFdBQVcsQ0FBQzt3QkFDcEQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO3dCQUVqQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQzt3QkFDbkQsTUFBQSxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSwwQ0FBRSxjQUFjLGtEQUFJLENBQUM7b0JBQ2hELENBQUM7Z0JBQ0gsQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNmLElBQUksTUFBTSxDQUFDLHlCQUF5QixDQUFDLENBQUM7Z0JBQ3hDLENBQUM7WUFDSCxDQUFDO2lCQUFNLENBQUM7WUFDUixDQUFDO1FBQ0gsQ0FBQyxDQUFBLENBQUM7UUFvQk0sNEJBQXVCLEdBQUcsQ0FBTyxLQUFpQixFQUFFLEVBQUU7O1lBQzVELE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7WUFDeEIsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDO1lBRXZCLE1BQU0sYUFBYSxHQUFHLElBQUksTUFBTSxDQUFDLG1CQUFtQixFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXpELElBQUksQ0FBQztnQkFDSCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUMzRCxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsMENBQUUsYUFBYSxFQUFFLENBQUEsQ0FBQztnQkFDbEUsTUFBTSxnQkFBZ0IsR0FBRyxDQUFBLE1BQUEsVUFBVSxhQUFWLFVBQVUsdUJBQVYsVUFBVSxDQUFFLFFBQVEsMENBQUUsU0FBUyxLQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQztnQkFFM0YsYUFBYSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUVyQixJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ3hCLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ3pFLFVBQVUsR0FBRyxJQUFJLENBQUM7Z0JBQ3BCLENBQUM7cUJBQU0sQ0FBQztvQkFDTixNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFO3dCQUN6QixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQ2xCLElBQUk7NkJBQ0QsUUFBUSxDQUFDLFNBQVMsQ0FBQzs2QkFDbkIsT0FBTyxDQUFDLFNBQVMsS0FBSyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUM7NkJBQ2xFLE9BQU8sQ0FBQyxHQUFTLEVBQUU7OzRCQUNsQixNQUFNLFlBQVksR0FBRyxNQUFNLENBQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsMENBQUUsYUFBYSxFQUFFLENBQUEsQ0FBQzs0QkFDcEUsTUFBTSxlQUFlLEdBQUcsQ0FBQSxNQUFBLFlBQVksYUFBWixZQUFZLHVCQUFaLFlBQVksQ0FBRSxRQUFRLDBDQUFFLFNBQVMsS0FBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUM7NEJBQzVGLElBQUksU0FBUyxLQUFLLGVBQWUsRUFBRSxDQUFDO2dDQUNsQyxJQUFJLFlBQVksRUFBRSxDQUFDO29DQUNqQixNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDO3dDQUNyRCxTQUFTLEVBQUUsU0FBUztxQ0FDckIsQ0FBQyxDQUFDO2dDQUNMLENBQUM7cUNBQU0sQ0FBQztvQ0FDTixJQUFJLE1BQU0sQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO2dDQUNsRCxDQUFDOzRCQUNILENBQUM7d0JBQ0gsQ0FBQyxDQUFBLENBQUMsQ0FDTCxDQUFDO3dCQUNGLFVBQVUsR0FBRyxJQUFJLENBQUM7b0JBQ3BCLENBQUMsQ0FBQyxDQUFDO2dCQUNMLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixhQUFhLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3JCLE9BQU8sQ0FBQyxLQUFLLENBQUMsZ0RBQWdELEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ3ZFLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQzlFLFVBQVUsR0FBRyxJQUFJLENBQUM7Z0JBQ2xCLElBQUksTUFBTSxDQUFDLGlEQUFpRCxDQUFDLENBQUM7WUFDaEUsQ0FBQztvQkFBUyxDQUFDO2dCQUNULElBQUksVUFBVSxFQUFFLENBQUM7b0JBQ2YsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUMvQixDQUFDO3FCQUFNLENBQUM7b0JBQ04sT0FBTyxDQUFDLElBQUksQ0FBQyx1REFBdUQsQ0FBQyxDQUFDO2dCQUN4RSxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUMsQ0FBQSxDQUFDO1FBdUJNLGtCQUFhLEdBQUcsQ0FBQyxDQUFnQixFQUFRLEVBQUU7O1lBQ2pELElBQUksQ0FBQyxDQUFDLEdBQUcsS0FBSyxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksSUFBSSxDQUFDLENBQUEsTUFBQSxJQUFJLENBQUMsVUFBVSwwQ0FBRSxRQUFRLENBQUEsRUFBRSxDQUFDO2dCQUN6RixDQUFDLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQ25CLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNyQixDQUFDO1FBQ0gsQ0FBQyxDQUFDO1FBQ00sb0JBQWUsR0FBRyxHQUFTLEVBQUU7O1lBQ25DLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLENBQUMsQ0FBQSxNQUFBLElBQUksQ0FBQyxVQUFVLDBDQUFFLFFBQVEsQ0FBQSxFQUFFLENBQUM7Z0JBQ3JELElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNyQixDQUFDO2lCQUFNLENBQUM7WUFDUixDQUFDO1FBQ0gsQ0FBQyxDQUFDO1FBQ00seUJBQW9CLEdBQUcsR0FBUyxFQUFFO1lBQ3hDLElBQUksSUFBSSxDQUFDLGFBQWE7Z0JBQUUsWUFBWSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUN6RCxJQUFJLENBQUMsYUFBYSxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7Z0JBQ25DLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO2dCQUM1QixJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUMvQixDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDVCxDQUFDLENBQUM7UUFFTSxxQkFBZ0IsR0FBRyxHQUFTLEVBQUU7WUFDcEMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDaEMsQ0FBQyxDQUFDO1FBRU0sOEJBQXlCLEdBQUcsR0FBd0IsRUFBRTtZQUM1RCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztZQUV2QyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyx5QkFBeUIsQ0FBQztZQUVsRSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUM7Z0JBQ3hCLElBQUksTUFBTSxDQUFDLHVDQUF1QyxDQUFDLENBQUM7Z0JBQ3BELE9BQU87WUFDVCxDQUFDO1lBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGlCQUFpQixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixLQUFLLE1BQU0sRUFBRSxDQUFDO2dCQUNuRyxJQUFJLE1BQU0sQ0FBQyw0REFBNEQsQ0FBQyxDQUFDO2dCQUN6RSxPQUFPO1lBQ1QsQ0FBQztZQUVELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDaEIsSUFBSSxNQUFNLENBQUMseURBQXlELENBQUMsQ0FBQztnQkFDdEUsT0FBTztZQUNULENBQUM7WUFFRCxPQUFPLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzdDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQzFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUM7WUFDckUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQztZQUVuRCxJQUFJLENBQUM7Z0JBQ0gsTUFBTSxjQUFjLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBRTlGLElBQUksY0FBYyxLQUFLLElBQUksRUFBRSxDQUFDO29CQUM1QixJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssR0FBRyxjQUFjLENBQUM7b0JBQ3BDLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7b0JBQy9DLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBRXJCLElBQUksY0FBYyxFQUFFLENBQUM7d0JBQ25CLE1BQU0sR0FBRyxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUM7d0JBQ2xDLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUMzQyxDQUFDO2dCQUNILENBQUM7cUJBQU0sQ0FBQztnQkFDUixDQUFDO1lBQ0gsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsSUFBSSxNQUFNLENBQUMsb0RBQW9ELENBQUMsQ0FBQztZQUNuRSxDQUFDO29CQUFTLENBQUM7Z0JBQ1QsT0FBTyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxXQUFXLENBQUMsQ0FBQztnQkFFaEQsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDO2dCQUN2RCxJQUFJLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUV4RSxJQUFJLENBQUMsb0JBQW9CLENBQUMsS0FBSyxHQUFHLHNCQUFzQixTQUFTLENBQUMsVUFBVSxDQUFDLElBQUksVUFBVSxFQUFFLENBQUM7WUFDaEcsQ0FBQztRQUNILENBQUMsQ0FBQSxDQUFDO1FBRUssdUJBQWtCLEdBQUcsR0FBd0IsRUFBRTs7WUFDcEQsTUFBQSxJQUFJLENBQUMsbUJBQW1CLDBDQUFFLFNBQVMsRUFBRSxDQUFDO1lBQ3RDLElBQUksQ0FBQztnQkFDSCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUM5RCxJQUFJLE9BQU8sRUFBRSxDQUFDO29CQUNaLElBQUksTUFBTSxDQUFDLHFCQUFxQixPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7b0JBQ3pELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDcEIsQ0FBQztxQkFBTSxDQUFDO29CQUNOLElBQUksTUFBTSxDQUFDLDRCQUE0QixDQUFDLENBQUM7Z0JBQzNDLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixJQUFJLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQ3pDLENBQUM7UUFDSCxDQUFDLENBQUEsQ0FBQztRQUVLLDBCQUFxQixHQUFHLENBQU8sY0FBdUIsRUFBRSxlQUF3QixFQUFpQixFQUFFOztZQUN4RyxJQUFJLE1BQU0sR0FBa0IsY0FBYyxhQUFkLGNBQWMsY0FBZCxjQUFjLEdBQUksSUFBSSxDQUFDO1lBQ25ELElBQUksV0FBVyxHQUFrQixlQUFlLGFBQWYsZUFBZSxjQUFmLGVBQWUsR0FBSSxJQUFJLENBQUM7WUFFekQsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUM1QixNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsMENBQUUsYUFBYSxFQUFFLENBQUEsQ0FBQztnQkFDbEUsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUNoQixJQUFJLE1BQU0sQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO29CQUN4QyxPQUFPO2dCQUNULENBQUM7Z0JBQ0QsTUFBTSxHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO2dCQUNoQyxXQUFXLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7WUFDekMsQ0FBQztZQUVELE1BQUEsSUFBSSxDQUFDLG1CQUFtQiwwQ0FBRSxTQUFTLEVBQUUsQ0FBQztZQUV0QyxJQUFJLENBQUMsTUFBTSxJQUFJLFdBQVcsS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDcEMsSUFBSSxNQUFNLENBQUMsb0NBQW9DLENBQUMsQ0FBQztnQkFDakQsT0FBTztZQUNULENBQUM7WUFFRCxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLGFBQWEsRUFBRSx1QkFBdUIsV0FBVyxJQUFJLEVBQUUsV0FBVyxFQUFFLENBQU0sT0FBTyxFQUFDLEVBQUU7Z0JBQzVHLElBQUksYUFBYSxHQUFHLHFDQUFxQyxDQUFDO2dCQUMxRCxNQUFNLFdBQVcsR0FBRyxPQUFPLGFBQVAsT0FBTyx1QkFBUCxPQUFPLENBQUUsSUFBSSxFQUFFLENBQUM7Z0JBRXBDLElBQUksV0FBVyxJQUFJLFdBQVcsS0FBSyxFQUFFLElBQUksV0FBVyxLQUFLLFdBQVcsRUFBRSxDQUFDO29CQUNyRSxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxNQUFPLEVBQUUsV0FBVyxDQUFDLENBQUM7b0JBRS9FLElBQUksT0FBTyxFQUFFLENBQUM7d0JBQ1osYUFBYSxHQUFHLG9CQUFvQixXQUFXLEdBQUcsQ0FBQztvQkFDckQsQ0FBQzt5QkFBTSxDQUFDO3dCQUNOLGFBQWEsR0FBRyx3QkFBd0IsQ0FBQztvQkFDM0MsQ0FBQztnQkFDSCxDQUFDO3FCQUFNLElBQUksV0FBVyxJQUFJLFdBQVcsS0FBSyxXQUFXLEVBQUUsQ0FBQztvQkFDdEQsYUFBYSxHQUFHLGlCQUFpQixDQUFDO2dCQUNwQyxDQUFDO3FCQUFNLElBQUksT0FBTyxLQUFLLElBQUksSUFBSSxXQUFXLEtBQUssRUFBRSxFQUFFLENBQUM7b0JBQ2xELGFBQWEsR0FBRywyQ0FBMkMsQ0FBQztnQkFDOUQsQ0FBQztnQkFDRCxJQUFJLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3BCLENBQUMsQ0FBQSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDWixDQUFDLENBQUEsQ0FBQztRQU1LLHlCQUFvQixHQUFHLEdBQXdCLEVBQUU7O1lBQ3RELE1BQUEsSUFBSSxDQUFDLG1CQUFtQiwwQ0FBRSxTQUFTLEVBQUUsQ0FBQztZQUN0QyxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsMENBQUUsYUFBYSxFQUFFLENBQUEsQ0FBQztZQUNsRSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ2hCLElBQUksTUFBTSxDQUFDLDBCQUEwQixDQUFDLENBQUM7Z0JBQ3ZDLE9BQU87WUFDVCxDQUFDO1lBQ0QsTUFBTSxhQUFhLEdBQUcsSUFBSSxNQUFNLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdkQsSUFBSSxDQUFDO2dCQUNILE1BQU0sVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ25GLElBQUksVUFBVSxFQUFFLENBQUM7b0JBQ2YsSUFBSSxNQUFNLENBQUMsbUJBQW1CLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO2dCQUM1RSxDQUFDO3FCQUFNLENBQUM7b0JBQ04sSUFBSSxNQUFNLENBQUMsdUJBQXVCLENBQUMsQ0FBQztnQkFDdEMsQ0FBQztZQUNILENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNmLElBQUksTUFBTSxDQUFDLDJDQUEyQyxDQUFDLENBQUM7WUFDMUQsQ0FBQztvQkFBUyxDQUFDO2dCQUNULGFBQWEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN2QixDQUFDO1FBQ0gsQ0FBQyxDQUFBLENBQUM7UUFDSyx5QkFBb0IsR0FBRyxHQUF3QixFQUFFOztZQUN0RCxNQUFBLElBQUksQ0FBQyxtQkFBbUIsMENBQUUsU0FBUyxFQUFFLENBQUM7WUFDdEMsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFBLE1BQUEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLDBDQUFFLGFBQWEsRUFBRSxDQUFBLENBQUM7WUFDbEUsSUFBSSxVQUFVLEVBQUUsQ0FBQztnQkFDZixNQUFNLFFBQVEsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztnQkFDMUMsSUFBSSxZQUFZLENBQ2QsSUFBSSxDQUFDLEdBQUcsRUFDUixxQkFBcUIsRUFDckIsd0RBQXdELFFBQVEsbUNBQW1DLEVBQ25HLEdBQUcsRUFBRTtvQkFDSCxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO2dCQUNwRCxDQUFDLENBQ0YsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNYLENBQUM7aUJBQU0sQ0FBQztnQkFDTixJQUFJLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQ3pDLENBQUM7UUFDSCxDQUFDLENBQUEsQ0FBQztRQUNLLDBCQUFxQixHQUFHLEdBQXdCLEVBQUU7O1lBQ3ZELE1BQUEsSUFBSSxDQUFDLG1CQUFtQiwwQ0FBRSxTQUFTLEVBQUUsQ0FBQztZQUN0QyxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsMENBQUUsYUFBYSxFQUFFLENBQUEsQ0FBQztZQUNsRSxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUNmLE1BQU0sUUFBUSxHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO2dCQUMxQyxJQUFJLFlBQVksQ0FDZCxJQUFJLENBQUMsR0FBRyxFQUNSLGFBQWEsRUFDYix5Q0FBeUMsUUFBUSxtQ0FBbUMsRUFDcEYsR0FBUyxFQUFFO29CQUNULE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQ2pGLElBQUksT0FBTyxFQUFFLENBQUM7d0JBQ1osSUFBSSxNQUFNLENBQUMsU0FBUyxRQUFRLFlBQVksQ0FBQyxDQUFDO29CQUM1QyxDQUFDO3lCQUFNLENBQUM7d0JBQ04sSUFBSSxNQUFNLENBQUMsMEJBQTBCLFFBQVEsSUFBSSxDQUFDLENBQUM7b0JBQ3JELENBQUM7Z0JBQ0gsQ0FBQyxDQUFBLENBQ0YsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNYLENBQUM7aUJBQU0sQ0FBQztnQkFDTixJQUFJLE1BQU0sQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1lBQzFDLENBQUM7UUFDSCxDQUFDLENBQUEsQ0FBQztRQUVLLDBCQUFxQixHQUFHLEdBQXdCLEVBQUU7O1lBQ3ZELE1BQUEsSUFBSSxDQUFDLG1CQUFtQiwwQ0FBRSxTQUFTLEVBQUUsQ0FBQztZQUN0QyxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsMENBQUUsYUFBYSxFQUFFLENBQUEsQ0FBQztZQUNsRSxJQUFJLENBQUMsVUFBVSxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNwRCxJQUFJLE1BQU0sQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO2dCQUM3QyxPQUFPO1lBQ1QsQ0FBQztZQUNELElBQUksQ0FBQztnQkFDSCxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN2RSxNQUFNLFNBQVMsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ2pFLE1BQU0sUUFBUSxHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ3hFLE1BQU0sUUFBUSxHQUFHLGVBQWUsUUFBUSxJQUFJLFNBQVMsS0FBSyxDQUFDO2dCQUUzRCxJQUFJLGdCQUFnQixHQUFHLE1BQUEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsb0JBQW9CLDBDQUFFLElBQUksRUFBRSxDQUFDO2dCQUN6RSxJQUFJLFlBQVksR0FBbUIsSUFBSSxDQUFDO2dCQUV4QyxJQUFJLGdCQUFnQixFQUFFLENBQUM7b0JBQ3JCLGdCQUFnQixHQUFHLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO29CQUNuRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO29CQUM1RSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7d0JBQ2xCLElBQUksQ0FBQzs0QkFDSCxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDOzRCQUNwRCxZQUFZLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsZ0JBQWdCLENBQVksQ0FBQzs0QkFDakYsSUFBSSxZQUFZLEVBQUUsQ0FBQztnQ0FDakIsSUFBSSxNQUFNLENBQUMsMEJBQTBCLGdCQUFnQixFQUFFLENBQUMsQ0FBQzs0QkFDM0QsQ0FBQztpQ0FBTSxDQUFDO2dDQUNOLElBQUksTUFBTSxDQUFDLHFEQUFxRCxDQUFDLENBQUM7Z0NBQ2xFLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQzs0QkFDMUMsQ0FBQzt3QkFDSCxDQUFDO3dCQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7NEJBQ2IsSUFBSSxNQUFNLENBQUMscURBQXFELENBQUMsQ0FBQzs0QkFDbEUsWUFBWSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO3dCQUMxQyxDQUFDO29CQUNILENBQUM7eUJBQU0sSUFBSSxZQUFZLFlBQVksT0FBTyxFQUFFLENBQUM7d0JBQzNDLFlBQVksR0FBRyxZQUFZLENBQUM7b0JBQzlCLENBQUM7eUJBQU0sQ0FBQzt3QkFDTixJQUFJLE1BQU0sQ0FBQywyREFBMkQsQ0FBQyxDQUFDO3dCQUN4RSxZQUFZLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQzFDLENBQUM7Z0JBQ0gsQ0FBQztxQkFBTSxDQUFDO29CQUNOLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDMUMsQ0FBQztnQkFFRCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7b0JBQ2xCLElBQUksTUFBTSxDQUFDLG9EQUFvRCxDQUFDLENBQUM7b0JBQ2pFLE9BQU87Z0JBQ1QsQ0FBQztnQkFFRCxNQUFNLFFBQVEsR0FBRyxhQUFhLENBQUMsR0FBRyxZQUFZLENBQUMsSUFBSSxJQUFJLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBRW5FLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNwRSxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNuQixDQUFDO2dCQUVELE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxlQUFlLENBQUMsQ0FBQztnQkFDcEUsSUFBSSxNQUFNLENBQUMsb0JBQW9CLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzlDLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNmLElBQUksS0FBSyxZQUFZLEtBQUssSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxFQUFFLENBQUM7b0JBQzVFLElBQUksTUFBTSxDQUFDLDRDQUE0QyxDQUFDLENBQUM7Z0JBQzNELENBQUM7cUJBQU0sQ0FBQztvQkFDTixJQUFJLE1BQU0sQ0FBQyxrREFBa0QsQ0FBQyxDQUFDO2dCQUNqRSxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUMsQ0FBQSxDQUFDO1FBRUssd0JBQW1CLEdBQUcsR0FBd0IsRUFBRTs7WUFDckQsTUFBQSxJQUFJLENBQUMsbUJBQW1CLDBDQUFFLFNBQVMsRUFBRSxDQUFDO1lBQ3RDLE1BQUEsTUFBQyxJQUFJLENBQUMsR0FBVyxDQUFDLE9BQU8sMENBQUUsSUFBSSxrREFBSSxDQUFDO1lBQ3BDLE1BQUEsTUFBQyxJQUFJLENBQUMsR0FBVyxDQUFDLE9BQU8sMENBQUUsV0FBVyxtREFBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNwRSxDQUFDLENBQUEsQ0FBQztRQUNNLCtCQUEwQixHQUFHLENBQUMsQ0FBYSxFQUFRLEVBQUU7O1lBQzNELE1BQUEsSUFBSSxDQUFDLG1CQUFtQiwwQ0FBRSxtQkFBbUIsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3BFLENBQUMsQ0FBQztRQUVNLHNCQUFpQixHQUFHLENBQU8sU0FBaUIsRUFBaUIsRUFBRTs7WUFDckUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ25DLElBQUksQ0FBQztnQkFDSCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsMENBQUUsYUFBYSxFQUFFLENBQUEsQ0FBQztnQkFDNUQsTUFBTSxJQUFJLEdBQUcsTUFBQSxNQUFBLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxRQUFRLDBDQUFFLFdBQVcsbUNBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDO2dCQUM3RSxJQUFJLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBRXRDLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUM1QyxNQUFNLENBQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsMENBQUUsc0JBQXNCLENBQUMsUUFBUSxFQUFFLHFCQUFxQixTQUFTLEVBQUUsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLENBQUEsQ0FBQztnQkFDaEgsQ0FBQztZQUNILENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDLENBQUEsQ0FBQztRQUNwQixDQUFDLENBQUEsQ0FBQztRQUVNLHFCQUFnQixHQUFHLENBQU8sUUFBZ0IsRUFBaUIsRUFBRTs7WUFDbkUsTUFBTSxXQUFXLEdBQUcsUUFBUSxJQUFJLE1BQU0sQ0FBQztZQUN2QyxJQUFJLENBQUMsc0JBQXNCLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDekMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBRXBDLElBQUksQ0FBQztnQkFDSCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsMENBQUUsYUFBYSxFQUFFLENBQUEsQ0FBQztnQkFFNUQsSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQzVDLE1BQU0sQ0FBQSxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVywwQ0FBRSxzQkFBc0IsQ0FBQyxRQUFRLEVBQUUsb0JBQW9CLFdBQVcsRUFBRSxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQSxDQUFDO2dCQUNqSCxDQUFDO3FCQUFNLENBQUM7b0JBQ04sSUFBSSxNQUFNLENBQUMsZ0JBQWdCLFdBQVcsRUFBRSxDQUFDLENBQUM7Z0JBQzVDLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixJQUFJLE1BQU0sQ0FBQyxnQkFBZ0IsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUM1QyxDQUFDO1FBQ0gsQ0FBQyxDQUFBLENBQUM7UUFDTSx1QkFBa0IsR0FBRyxHQUFTLEVBQUU7O1lBQ3RDLE1BQUEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLDBDQUFFLGNBQWMsRUFBRSxDQUFDO1lBRTVDLElBQUksSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxtQkFBbUI7cUJBQ3JCLHVCQUF1QixFQUFFO3FCQUN6QixLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsb0NBQW9DLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNuRixDQUFDO1lBRUQsSUFBSSxNQUFBLElBQUksQ0FBQyxjQUFjLDBDQUFFLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ25ELElBQUksQ0FBQyxjQUFjLENBQUMsY0FBYyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGlDQUFpQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEgsQ0FBQztpQkFBTSxDQUFDO1lBQ1IsQ0FBQztRQUNILENBQUMsQ0FBQztRQXNHTSwwQkFBcUIsR0FBRyxDQUFDLE1BQWMsRUFBUSxFQUFFOztZQUN2RCxJQUFJLE1BQU0sTUFBSyxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVywwQ0FBRSxlQUFlLEVBQUUsQ0FBQSxFQUFFLENBQUM7Z0JBQzFELElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO2dCQUNsQyxJQUFJLENBQUMsZUFBZSxHQUFHLEVBQUUsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3hCLENBQUM7UUFDSCxDQUFDLENBQUM7UUFFTSwyQkFBc0IsR0FBRyxHQUFTLEVBQUU7WUFDMUMsSUFBSSxRQUFRLENBQUMsZUFBZSxLQUFLLFNBQVMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDdEUscUJBQXFCLENBQUMsR0FBRyxFQUFFOztvQkFDekIsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDeEMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7b0JBQzVCLE1BQUEsSUFBSSxDQUFDLE9BQU8sMENBQUUsS0FBSyxFQUFFLENBQUM7Z0JBQ3hCLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNILENBQUMsQ0FBQztRQUNNLDJCQUFzQixHQUFHLENBQUMsSUFBMEIsRUFBUSxFQUFFOztZQUNwRSxJQUFJLENBQUEsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLElBQUksTUFBSyxJQUFJLEVBQUUsQ0FBQztnQkFDeEIsTUFBQSxJQUFJLENBQUMsT0FBTywwQ0FBRSxLQUFLLEVBQUUsQ0FBQztnQkFDdEIsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDbEUsQ0FBQztRQUNILENBQUMsQ0FBQztRQUNNLHVCQUFrQixHQUFHLEdBQVMsRUFBRTtZQUN0QyxJQUFJLElBQUksQ0FBQyxhQUFhO2dCQUFFLFlBQVksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDekQsSUFBSSxDQUFDLGFBQWEsR0FBRyxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDMUUsQ0FBQyxDQUFDO1FBRU0saUJBQVksR0FBRyxHQUFTLEVBQUU7WUFDaEMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLElBQUksQ0FBQyxJQUFJLENBQUMsc0JBQXNCLElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CO2dCQUFFLE9BQU87WUFFOUYsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDO1lBQ3RCLE1BQU0sUUFBUSxHQUNaLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxHQUFHLFNBQVMsQ0FBQztZQUUvRyxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxjQUFjLENBQUM7WUFDL0MsSUFBSSxDQUFDLGNBQWMsR0FBRyxDQUFDLFFBQVEsQ0FBQztZQUVoQyxJQUFJLGtCQUFrQixJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUNuQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQ2xFLENBQUM7WUFFRCxJQUFJLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDckYsQ0FBQyxDQUFDO1FBRU0sbUNBQThCLEdBQUcsR0FBUyxFQUFFOztZQUNsRCxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDNUYsQ0FBQztZQUNELE1BQUEsSUFBSSxDQUFDLHNCQUFzQiwwQ0FBRSxTQUFTLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7WUFDakUsTUFBQSxJQUFJLENBQUMsb0JBQW9CLDBDQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztZQUMvRCxJQUFJLENBQUMsY0FBYyxHQUFHLEtBQUssQ0FBQztRQUM5QixDQUFDLENBQUM7UUFFTSw4QkFBeUIsR0FBRyxHQUFTLEVBQUU7O1lBQzdDLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUN2QixJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUM1RixDQUFDO1lBQ0QsTUFBQSxJQUFJLENBQUMsb0JBQW9CLDBDQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztZQUMvRCxNQUFBLElBQUksQ0FBQyxzQkFBc0IsMENBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQ2pFLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQzlCLENBQUMsQ0FBQztRQVVNLHlCQUFvQixHQUFHLEdBQVMsRUFBRTtZQUN4QyxxQkFBcUIsQ0FBQyxHQUFHLEVBQUU7Z0JBQ3pCLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTztvQkFBRSxPQUFPO2dCQUMxQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDO2dCQUM5QixNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBRXhELE1BQU0sYUFBYSxHQUFHLFVBQVUsQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNoRSxNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUV0RCxNQUFNLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUM7Z0JBQzVDLFFBQVEsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztnQkFFL0IsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLFlBQVksQ0FBQztnQkFFM0MsSUFBSSxZQUFZLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUM7Z0JBQ3pELElBQUksYUFBYSxHQUFHLEtBQUssQ0FBQztnQkFFMUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxZQUFZLEdBQUcsU0FBUyxFQUFFLENBQUM7b0JBQ2xELFlBQVksR0FBRyxTQUFTLENBQUM7b0JBQ3pCLGFBQWEsR0FBRyxJQUFJLENBQUM7Z0JBQ3ZCLENBQUM7Z0JBRUQsUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsR0FBRyxZQUFZLElBQUksQ0FBQztnQkFDNUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztnQkFDN0QsUUFBUSxDQUFDLFNBQVMsR0FBRyxnQkFBZ0IsQ0FBQztZQUN4QyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQztRQXVGTSwwQkFBcUIsR0FBRyxHQUFTLEVBQUU7WUFDekMsSUFBSSxDQUFDLDZCQUE2QixFQUFFLENBQUM7WUFFckMsSUFBSSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztnQkFDN0IsSUFBSSxDQUFDLG1CQUFtQjtxQkFDckIsdUJBQXVCLEVBQUU7cUJBQ3pCLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ25GLENBQUM7UUFDSCxDQUFDLENBQUM7UUFFSywwQkFBcUIsR0FBRyxHQUF3QixFQUFFOztZQUN2RCxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsMENBQUUsYUFBYSxFQUFFLENBQUEsQ0FBQztZQUNsRSxNQUFNLGdCQUFnQixHQUFHLENBQUEsTUFBQSxVQUFVLGFBQVYsVUFBVSx1QkFBVixVQUFVLENBQUUsUUFBUSwwQ0FBRSxTQUFTLEtBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDO1lBQzNGLE1BQU0sZUFBZSxHQUFHLE1BQUEsTUFBQSxVQUFVLGFBQVYsVUFBVSx1QkFBVixVQUFVLENBQUUsUUFBUSwwQ0FBRSxnQkFBZ0IsbUNBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUM7WUFDeEcsTUFBTSxlQUFlLEdBQUcsTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDdkUsTUFBTSxrQkFBa0IsR0FBRyxNQUFBLE1BQUEsVUFBVSxhQUFWLFVBQVUsdUJBQVYsVUFBVSxDQUFFLFFBQVEsMENBQUUsV0FBVyxtQ0FBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7WUFFakcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDMUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUM3QyxJQUFJLENBQUMsMEJBQTBCLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUNwRCxJQUFJLENBQUMsOEJBQThCLEVBQUUsQ0FBQztZQUN0QyxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztZQUVsQyxJQUFJLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO2dCQUM3QixJQUFJLENBQUMsbUJBQW1CO3FCQUNyQix1QkFBdUIsRUFBRTtxQkFDekIsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pGLElBQUksQ0FBQyxtQkFBbUI7cUJBQ3JCLHdCQUF3QixFQUFFO3FCQUMxQixLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMscUNBQXFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbEYsSUFBSSxDQUFDLG1CQUFtQixDQUFDLDhCQUE4QixFQUFFLENBQUM7WUFDNUQsQ0FBQztZQUVELElBQUksTUFBQSxJQUFJLENBQUMsY0FBYywwQ0FBRSxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNuRCxNQUFNLElBQUksQ0FBQyxjQUFjO3FCQUN0QixjQUFjLEVBQUU7cUJBQ2hCLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxpQ0FBaUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hGLENBQUM7aUJBQU0sQ0FBQztZQUNSLENBQUM7WUFFRCxJQUFJLE1BQUEsSUFBSSxDQUFDLGNBQWMsMENBQUUsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDbkQsTUFBTSxJQUFJLENBQUMsY0FBYztxQkFDdEIsY0FBYyxFQUFFO3FCQUNoQixLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsaUNBQWlDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoRixDQUFDO2lCQUFNLENBQUM7WUFDUixDQUFDO1FBQ0gsQ0FBQyxDQUFBLENBQUM7UUFvcEJNLDJCQUFzQixHQUFHLENBQU8sS0FBaUIsRUFBRSxFQUFFOztZQUMzRCxNQUFNLElBQUksR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ3hCLElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQztZQUV2QixJQUFJLENBQUM7Z0JBQ0gsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDcEQsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFBLE1BQUEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLDBDQUFFLGFBQWEsRUFBRSxDQUFBLENBQUM7Z0JBQ2xFLE1BQU0sZUFBZSxHQUFHLE1BQUEsTUFBQSxVQUFVLGFBQVYsVUFBVSx1QkFBVixVQUFVLENBQUUsUUFBUSwwQ0FBRSxnQkFBZ0IsbUNBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUM7Z0JBRXhHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7b0JBQ2xCLElBQUk7eUJBQ0QsUUFBUSxDQUFDLE1BQU0sQ0FBQzt5QkFDaEIsT0FBTyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQzt5QkFDN0MsT0FBTyxDQUFDLEdBQVMsRUFBRTs7d0JBQ2xCLE1BQU0sV0FBVyxHQUFHLEVBQUUsQ0FBQzt3QkFDdkIsSUFBSSxlQUFlLEtBQUssV0FBVyxFQUFFLENBQUM7NEJBQ3BDLElBQUksVUFBVSxFQUFFLENBQUM7Z0NBQ2YsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyx3QkFBd0IsQ0FBQztvQ0FDckQsZ0JBQWdCLEVBQUUsV0FBVztpQ0FDOUIsQ0FBQyxDQUFDOzRCQUNMLENBQUM7aUNBQU0sQ0FBQztnQ0FDTixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsR0FBRyxXQUFXLENBQUM7Z0NBQ3BELE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQ0FFakMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dDQUN6QyxNQUFBLE1BQUEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLDBDQUFFLGNBQWMsa0RBQUksQ0FBQzs0QkFDaEQsQ0FBQzt3QkFDSCxDQUFDO29CQUNILENBQUMsQ0FBQSxDQUFDLENBQUM7b0JBQ0wsVUFBVSxHQUFHLElBQUksQ0FBQztnQkFDcEIsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUNyQixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7b0JBQ3BCLFVBQVUsR0FBRyxJQUFJLENBQUM7Z0JBQ3BCLENBQUM7Z0JBRUQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRTtvQkFDdkIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTt3QkFDbEIsSUFBSTs2QkFDRCxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQzs2QkFDdkIsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEtBQUssZUFBZSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDOzZCQUMvRixPQUFPLENBQUMsR0FBUyxFQUFFOzs0QkFDbEIsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQzs0QkFDbEMsSUFBSSxlQUFlLEtBQUssV0FBVyxFQUFFLENBQUM7Z0NBQ3BDLElBQUksVUFBVSxFQUFFLENBQUM7b0NBQ2YsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyx3QkFBd0IsQ0FBQzt3Q0FDckQsZ0JBQWdCLEVBQUUsV0FBVztxQ0FDOUIsQ0FBQyxDQUFDO2dDQUNMLENBQUM7cUNBQU0sQ0FBQztvQ0FDTixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsR0FBRyxXQUFXLENBQUM7b0NBQ3BELE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztvQ0FDakMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQ0FDaEQsTUFBQSxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSwwQ0FBRSxjQUFjLGtEQUFJLENBQUM7Z0NBQ2hELENBQUM7NEJBQ0gsQ0FBQzt3QkFDSCxDQUFDLENBQUEsQ0FBQyxDQUFDO3dCQUNMLFVBQVUsR0FBRyxJQUFJLENBQUM7b0JBQ3BCLENBQUMsQ0FBQyxDQUFDO2dCQUNMLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw4Q0FBOEMsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFFckUsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUNoQixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUM3RSxVQUFVLEdBQUcsSUFBSSxDQUFDO2dCQUNwQixDQUFDO2dCQUNELElBQUksTUFBTSxDQUFDLHVCQUF1QixDQUFDLENBQUM7WUFDdEMsQ0FBQztvQkFBUyxDQUFDO2dCQUNULElBQUksVUFBVSxFQUFFLENBQUM7b0JBQ2YsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUMvQixDQUFDO3FCQUFNLENBQUM7Z0JBQ1IsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDLENBQUEsQ0FBQztRQUVNLDJCQUFzQixHQUFHLEdBQXdCLEVBQUU7O1lBQ3pELE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQSxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVywwQ0FBRSxhQUFhLEVBQUUsQ0FBQSxDQUFDO1lBRWxFLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDaEIsSUFBSSxNQUFNLENBQUMsZ0RBQWdELENBQUMsQ0FBQztnQkFFN0QsT0FBTztZQUNULENBQUM7WUFFRCxNQUFNLFdBQVcsR0FBRyxNQUFBLFVBQVUsQ0FBQyxRQUFRLENBQUMsV0FBVyxtQ0FBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7WUFDeEYsTUFBTSxpQkFBaUIsR0FBRyxXQUFXLEtBQUssSUFBSSxJQUFJLFdBQVcsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBRXZHLElBQUksV0FBVyxDQUNiLElBQUksQ0FBQyxHQUFHLEVBQ1IsaUJBQWlCLEVBQ2pCLHlGQUF5RixFQUN6RixpQkFBaUIsRUFDakIsQ0FBTSxRQUFRLEVBQUMsRUFBRTtnQkFDZixJQUFJLFFBQVEsS0FBSyxJQUFJLElBQUksUUFBUSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDO29CQUNoRCxJQUFJLE1BQU0sQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO29CQUM1QyxPQUFPO2dCQUNULENBQUM7Z0JBRUQsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUU1QyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxPQUFPLEdBQUcsQ0FBQyxJQUFJLE9BQU8sR0FBRyxHQUFHLEVBQUUsQ0FBQztvQkFDbkQsSUFBSSxNQUFNLENBQUMsaUVBQWlFLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQ3BGLE9BQU87Z0JBQ1QsQ0FBQztnQkFFRCxJQUFJLENBQUM7b0JBQ0gsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyx3QkFBd0IsQ0FBQzt3QkFDckQsV0FBVyxFQUFFLE9BQU87cUJBQ3JCLENBQUMsQ0FBQztvQkFDSCxJQUFJLENBQUMsMEJBQTBCLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQ3pDLElBQUksTUFBTSxDQUFDLHNCQUFzQixPQUFPLGNBQWMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO2dCQUN0RixDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ2YsSUFBSSxNQUFNLENBQUMsNEJBQTRCLENBQUMsQ0FBQztnQkFDM0MsQ0FBQztZQUNILENBQUMsQ0FBQSxDQUNGLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDWCxDQUFDLENBQUEsQ0FBQztRQTBCSyxrQ0FBNkIsR0FBRyxHQUF3QixFQUFFOztZQUMvRCxNQUFBLElBQUksQ0FBQyxtQkFBbUIsMENBQUUsU0FBUyxFQUFFLENBQUM7WUFDdEMsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDO1lBQzFELE1BQU0sVUFBVSxHQUFHLENBQUMsY0FBYyxDQUFDO1lBRW5DLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsR0FBRyxVQUFVLENBQUM7WUFDaEQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBRWpDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLHlCQUF5QixDQUFDLENBQUM7WUFFakUsVUFBVSxDQUFDLEdBQUcsRUFBRTtnQkFDZCxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQzdCLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNULENBQUMsQ0FBQSxDQUFDO1FBb0JNLHdCQUFtQixHQUFHLEdBQXdCLEVBQUU7O1lBQ3RELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUM7WUFDdkMsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQzNDLE9BQU87WUFDVCxDQUFDO1lBRUQsSUFBSSxDQUFBLE1BQUEsSUFBSSxDQUFDLGlCQUFpQiwwQ0FBRSxZQUFZLENBQUMsZ0JBQWdCLENBQUMsTUFBSyxNQUFNLEVBQUUsQ0FBQztnQkFDdEUsT0FBTztZQUNULENBQUM7WUFFRCxNQUFNLGdCQUFnQixHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUM7WUFDN0MsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBRWxCLElBQUksQ0FBQztnQkFDSCxNQUFNLEtBQUssR0FBbUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxFQUFFLENBQUM7Z0JBQ2pGLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUVsRSxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ3ZCLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQztnQkFDOUUsQ0FBQztxQkFBTSxDQUFDO29CQUNOLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUU7d0JBQ3ZCLE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUM7NEJBQ3ZDLEdBQUcsRUFBRSxDQUFDLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLHdCQUF3QixDQUFDO3lCQUM1RSxDQUFDLENBQUM7d0JBQ0gsTUFBTSxRQUFRLEdBQUcsWUFBWSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLHdCQUF3QixFQUFFLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUNsRyxJQUFJLFFBQVEsQ0FBQyxFQUFFLEtBQUssZUFBZSxFQUFFLENBQUM7NEJBQ3BDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7NEJBQzNCLFlBQVksQ0FBQyxRQUFRLENBQUMsMEJBQTBCLENBQUMsQ0FBQzt3QkFDcEQsQ0FBQzs2QkFBTSxDQUFDOzRCQUNOLE9BQU8sQ0FBQyxRQUFRLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQzt3QkFDdEMsQ0FBQzt3QkFFRCxNQUFNLFdBQVcsR0FBRyxZQUFZLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLCtCQUErQixFQUFFLENBQUMsQ0FBQzt3QkFDckYsV0FBVyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxzQkFBc0IsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7d0JBRTVFLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDO3dCQUV6RCxNQUFNLFFBQVEsR0FBRyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQzs0QkFDakQsQ0FBQyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQzs0QkFDM0MsQ0FBQyxDQUFDLGNBQWMsQ0FBQzt3QkFDbkIsSUFBSSxRQUFRLEtBQUssY0FBYyxFQUFFLENBQUM7d0JBQ2xDLENBQUM7d0JBQ0QsV0FBVyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxzQkFBc0IsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQzt3QkFFdkUsTUFBTSxVQUFVLEdBQUcsWUFBWSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUU7NEJBQ2pELEdBQUcsRUFBRSxDQUFDLHFCQUFxQixFQUFFLGdCQUFnQixDQUFDOzRCQUM5QyxJQUFJLEVBQUUsRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUU7eUJBQzlELENBQUMsQ0FBQzt3QkFDSCxPQUFPLENBQUMsVUFBVSxFQUFFLHdCQUF3QixDQUFDLENBQUM7d0JBRTlDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsT0FBTyxFQUFFLENBQU0sQ0FBQyxFQUFDLEVBQUU7OzRCQUNyRCxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxZQUFZLE9BQU8sSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLHFCQUFxQixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0NBQ3BGLElBQUksUUFBUSxDQUFDLEVBQUUsTUFBSyxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVywwQ0FBRSxlQUFlLEVBQUUsQ0FBQSxFQUFFLENBQUM7b0NBQy9ELE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQ0FDM0QsQ0FBQzs0QkFDSCxDQUFDO3dCQUNILENBQUMsQ0FBQSxDQUFDLENBQUM7d0JBQ0gsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLEVBQUU7NEJBQzdDLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQzs0QkFDcEIsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQzt3QkFDeEMsQ0FBQyxDQUFDLENBQUM7d0JBQ0gsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFlBQVksRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDLEVBQUU7NEJBQ3JELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUM7d0JBQ3hDLENBQUMsQ0FBQyxDQUFDO29CQUNMLENBQUMsQ0FBQyxDQUFDO2dCQUNMLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ2xCLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxJQUFJLEVBQUUsc0JBQXNCLEVBQUUsR0FBRyxFQUFFLGlCQUFpQixFQUFFLENBQUMsQ0FBQztZQUNoRixDQUFDO29CQUFTLENBQUM7Z0JBQ1QscUJBQXFCLENBQUMsR0FBRyxFQUFFO29CQUN6QixJQUFJLFNBQVMsSUFBSSxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUM7d0JBQ3ZDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsZ0JBQWdCLENBQUM7b0JBQ3pDLENBQUM7Z0JBQ0gsQ0FBQyxDQUFDLENBQUM7WUFDTCxDQUFDO1FBQ0gsQ0FBQyxDQUFBLENBQUM7UUFvdUJNLDBCQUFxQixHQUFHLENBQUMsQ0FBYSxFQUFRLEVBQUU7O1lBQ3RELE1BQUEsSUFBSSxDQUFDLG1CQUFtQiwwQ0FBRSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUMsQ0FBQyxDQUFDO1FBRU0sZ0JBQVcsR0FBRyxDQUFDLEtBQWlCLEVBQVEsRUFBRTs7WUFDaEQsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUM7Z0JBQUUsT0FBTztZQUUvQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztZQUN2QixJQUFJLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUM7WUFFbkMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLENBQUEsTUFBQSxJQUFJLENBQUMsYUFBYSwwQ0FBRSxXQUFXLEtBQUksR0FBRyxDQUFDO1lBRWxFLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN2QixLQUFLLENBQUMsZUFBZSxFQUFFLENBQUM7WUFFeEIsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDaEYsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFFN0UsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLFdBQVcsQ0FBQztZQUN6QyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUM7UUFFTSxlQUFVLEdBQUcsQ0FBQyxLQUFpQixFQUFRLEVBQUU7WUFDL0MsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYTtnQkFBRSxPQUFPO1lBRXBELHFCQUFxQixDQUFDLEdBQUcsRUFBRTtnQkFDekIsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYTtvQkFBRSxPQUFPO2dCQUVwRCxNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDO2dCQUNwQyxNQUFNLE1BQU0sR0FBRyxhQUFhLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQztnQkFDbEQsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixHQUFHLE1BQU0sQ0FBQztnQkFFakQsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDO2dCQUNyQixNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQztnQkFFbEQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEdBQUcsRUFBRSxFQUFFLGNBQWMsR0FBRyxHQUFHLENBQUMsQ0FBQztnQkFFL0QsSUFBSSxRQUFRLEdBQUcsUUFBUTtvQkFBRSxRQUFRLEdBQUcsUUFBUSxDQUFDO2dCQUM3QyxJQUFJLFFBQVEsR0FBRyxRQUFRO29CQUFFLFFBQVEsR0FBRyxRQUFRLENBQUM7Z0JBRTdDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxHQUFHLFFBQVEsSUFBSSxDQUFDO2dCQUNqRCxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxRQUFRLEdBQUcsR0FBRyxRQUFRLElBQUksQ0FBQztZQUN0RCxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQztRQUVNLGNBQVMsR0FBRyxHQUFTLEVBQUU7WUFDN0IsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVO2dCQUFFLE9BQU87WUFFN0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7WUFFeEIsUUFBUSxDQUFDLG1CQUFtQixDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDbkYsUUFBUSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDaEYsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQztZQUNoQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUVuRCxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUM1QixDQUFDLENBQUM7UUFtWU0sa0NBQTZCLEdBQUcsQ0FBQyxRQUFnQixFQUFFLEVBQVEsRUFBRTtZQUNuRSxJQUFJLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO2dCQUNqQyxZQUFZLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUM7WUFDN0MsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLElBQUksSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7b0JBQ25DLE9BQU87Z0JBQ1QsQ0FBQztnQkFDRCxJQUFJLENBQUMseUJBQXlCLEdBQUcsSUFBSSxDQUFDO1lBQ3hDLENBQUM7WUFFRCxJQUFJLENBQUMsdUJBQXVCLEdBQUcsVUFBVSxDQUFDLEdBQUcsRUFBRTs7Z0JBQzdDLElBQUksTUFBQSxJQUFJLENBQUMsY0FBYywwQ0FBRSxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO29CQUNuRCxJQUFJLENBQUMsY0FBYzt5QkFDaEIsY0FBYyxFQUFFO3lCQUNoQixLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsbUVBQW1FLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbEgsQ0FBQztnQkFFRCxJQUFJLENBQUMsdUJBQXVCLEdBQUcsSUFBSSxDQUFDO2dCQUNwQyxJQUFJLENBQUMseUJBQXlCLEdBQUcsS0FBSyxDQUFDO1lBQ3pDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNaLENBQUMsQ0FBQztRQStNTSw0QkFBdUIsR0FBRyxDQUFPLElBQWtELEVBQWlCLEVBQUU7O1lBQzVHLElBQUksSUFBSSxDQUFDLGNBQWMsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRSxFQUFFLENBQUM7Z0JBQ3JGLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO2dCQUN2QyxPQUFPO1lBQ1QsQ0FBQztZQUVELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDLG1CQUFtQixDQUFDO1lBQzlELElBQUksd0JBQXdCLEdBQUcsS0FBSyxDQUFDO1lBRXJDLElBQUksWUFBWSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUNqRSxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztnQkFFdkMsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztnQkFDckQsd0JBQXdCLEdBQUcsTUFBTSxDQUFDLGVBQWUsQ0FBQztZQUNwRCxDQUFDO2lCQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDdEQsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7Z0JBQ3ZDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7Z0JBRXZCLE1BQU0sZUFBZSxHQUFHLE1BQUEsTUFBQSxJQUFJLENBQUMsUUFBUSwwQ0FBRSxnQkFBZ0IsbUNBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUM7Z0JBQ2pHLE1BQU0sZUFBZSxHQUFHLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUN2RSxNQUFNLGdCQUFnQixHQUFHLENBQUEsTUFBQSxJQUFJLENBQUMsUUFBUSwwQ0FBRSxTQUFTLEtBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDO2dCQUNwRixNQUFNLGtCQUFrQixHQUFHLE1BQUEsTUFBQSxJQUFJLENBQUMsUUFBUSwwQ0FBRSxXQUFXLG1DQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQztnQkFFMUYsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLENBQUM7Z0JBQzFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDeEMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUM3QyxJQUFJLENBQUMsMEJBQTBCLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUN0RCxDQUFDO2lCQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDaEMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztnQkFDaEMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDOUIsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1lBQ3pDLENBQUM7WUFFRCxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztnQkFDOUIsSUFBSSxDQUFDLDZCQUE2QixFQUFFLENBQUM7WUFDdkMsQ0FBQztpQkFBTSxDQUFDO1lBQ1IsQ0FBQztZQUVELElBQUksTUFBQSxJQUFJLENBQUMsY0FBYywwQ0FBRSxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNuRCxJQUFJLENBQUMsY0FBYztxQkFDaEIsY0FBYyxFQUFFO3FCQUNoQixLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsNERBQTRELEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzRyxDQUFDO1lBRUQsSUFBSSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztnQkFDN0IsSUFBSSxDQUFDLG1CQUFtQjtxQkFDckIsdUJBQXVCLEVBQUU7cUJBQ3pCLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQywrREFBK0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlHLENBQUM7UUFDSCxDQUFDLENBQUEsQ0FBQztRQTc3R0EsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLEdBQUcsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDO1FBRXRCLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBRXhCLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEUsSUFBSSxDQUFDLFFBQVEsQ0FDWCxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7WUFDekMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ3BCLENBQUMsQ0FBQyxDQUNILENBQUM7UUFDRixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2xELElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFaEQsSUFBSSxDQUFDLGtCQUFrQixHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUU7WUFDdEMsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3ZCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDO2dCQUVoRCxJQUFJLFFBQVEsR0FBRyxDQUFDLElBQUksUUFBUSxLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxDQUFDO29CQUNuRSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEdBQUcsUUFBUSxDQUFDO29CQUU3QyxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUM3QixDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNWLENBQUM7SUFFRCxXQUFXO1FBQ1QsT0FBTyx5QkFBeUIsQ0FBQztJQUNuQyxDQUFDO0lBQ0QsY0FBYztRQUNaLE9BQU8sVUFBVSxDQUFDO0lBQ3BCLENBQUM7SUFDRCxPQUFPO1FBQ0wsT0FBTyxlQUFlLENBQUM7SUFDekIsQ0FBQztJQUVLLE1BQU07O1lBQ1YsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFFeEIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDO1lBQ3JELElBQUksSUFBSSxDQUFDLGFBQWEsSUFBSSxVQUFVLElBQUksT0FBTyxVQUFVLEtBQUssUUFBUSxJQUFJLFVBQVUsR0FBRyxFQUFFLEVBQUUsQ0FBQztnQkFDMUYsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLEdBQUcsVUFBVSxJQUFJLENBQUM7Z0JBQ25ELElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxHQUFHLFVBQVUsSUFBSSxDQUFDO1lBQ3hELENBQUM7aUJBQU0sSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQzlCLElBQUksWUFBWSxHQUFHLEdBQUcsQ0FBQztnQkFDdkIsSUFBSSxDQUFDO29CQUNILE1BQU0sV0FBVyxHQUFHLGdCQUFnQixDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO29CQUM3RyxJQUFJLFdBQVcsSUFBSSxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7d0JBQzlDLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7d0JBQzlDLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLElBQUksV0FBVyxHQUFHLEVBQUUsRUFBRSxDQUFDOzRCQUM1QyxZQUFZLEdBQUcsV0FBVyxDQUFDO3dCQUM3QixDQUFDO29CQUNILENBQUM7Z0JBQ0gsQ0FBQztnQkFBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUEsQ0FBQztnQkFDZCxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsR0FBRyxZQUFZLElBQUksQ0FBQztnQkFDckQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsUUFBUSxHQUFHLEdBQUcsWUFBWSxJQUFJLENBQUM7Z0JBQ3hELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDbEIsQ0FBQztZQUNILENBQUM7WUFFRCxJQUFJLENBQUM7Z0JBQ0gsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUM7Z0JBQzlELE1BQU0sZUFBZSxHQUFHLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUN2RSxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQztnQkFDeEQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7Z0JBRTVELElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDN0MsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUN4QyxJQUFJLENBQUMsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztnQkFDMUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDdEQsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUMsQ0FBQSxDQUFDO1lBRWxCLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBRTVCLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBRTdCLElBQUksQ0FBQztnQkFDSCxNQUFNLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1lBQ3hDLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNmLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN4QixDQUFDO1lBRUQsVUFBVSxDQUFDLEdBQUcsRUFBRTtnQkFDZCxJQUFJLElBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO29CQUNwRixJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUN2QixDQUFDO3FCQUFNLENBQUM7Z0JBQ1IsQ0FBQztZQUNILENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUVSLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNqQixJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ2pELENBQUM7UUFDSCxDQUFDO0tBQUE7SUFFSyxPQUFPOzs7WUFDWCxRQUFRLENBQUMsbUJBQW1CLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNuRixRQUFRLENBQUMsbUJBQW1CLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxjQUFjLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUVoRixJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUM7Z0JBQ3pELFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7Z0JBQ2hDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQ3JELENBQUM7WUFDRCxJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztZQUV4QixJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDdEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDOUIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUM7WUFDM0IsQ0FBQztZQUNELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMvQixJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDckIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFDcEQsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7WUFDMUIsQ0FBQztZQUNELElBQUksSUFBSSxDQUFDLGFBQWE7Z0JBQUUsWUFBWSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUN6RCxJQUFJLElBQUksQ0FBQyxhQUFhO2dCQUFFLFlBQVksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDekQsTUFBQSxJQUFJLENBQUMsY0FBYywwQ0FBRSxPQUFPLEVBQUUsQ0FBQztZQUMvQixNQUFBLElBQUksQ0FBQyxtQkFBbUIsMENBQUUsT0FBTyxFQUFFLENBQUM7UUFDdEMsQ0FBQztLQUFBO0lBRU8sZ0JBQWdCO1FBQ3RCLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFdkIsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1FBRTVFLE1BQU0saUJBQWlCLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUM7UUFDOUQsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQztRQUVyQyxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN0RSxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRXhFLE1BQU0seUJBQXlCLEdBQUcsU0FBUyxJQUFJLENBQUMsaUJBQWlCLENBQUM7UUFDbEUsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLHlCQUF5QixFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUM3RixDQUFDO2FBQU0sQ0FBQztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsU0FBUyxHQUFHLGFBQWEsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLHdCQUF3QixDQUFDO1FBRWhELElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyx5QkFBeUIsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFFdkYsSUFBSSxDQUFDLGNBQWMsR0FBRyxhQUFhLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLHVCQUF1QixFQUFFLENBQUMsQ0FBQztRQUVoRixJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUUvRSxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLDBCQUEwQixFQUFFLENBQUMsQ0FBQztRQUMxRixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLHVCQUF1QixFQUFFLENBQUMsQ0FBQztRQUN0RixJQUFJLENBQUMsc0JBQXNCLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO1FBQy9GLE9BQU8sQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsVUFBVSxDQUFDLEVBQUUsR0FBRyxFQUFFLGdCQUFnQixFQUFFLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN6RixJQUFJLENBQUMsc0JBQXNCLENBQUMsVUFBVSxDQUFDLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDbEUsSUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRTtZQUNsRSxHQUFHLEVBQUUsQ0FBQyx5QkFBeUIsRUFBRSxnQkFBZ0IsQ0FBQztZQUNsRCxJQUFJLEVBQUUsRUFBRSxZQUFZLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixFQUFFO1NBQ3RFLENBQUMsQ0FBQztRQUNILE9BQU8sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDakQsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQyxDQUFDO1FBQ3RGLElBQUksQ0FBQyxPQUFPLEdBQUcsY0FBYyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUU7WUFDakQsSUFBSSxFQUFFLEVBQUUsV0FBVyxFQUFFLDRCQUE0QixFQUFFLElBQUksRUFBRSxDQUFDLEVBQUU7U0FDN0QsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxpQkFBaUIsR0FBRyxjQUFjLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLDBCQUEwQixFQUFFLENBQUMsQ0FBQztRQUN4RixNQUFNLFlBQVksR0FBRyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO1FBQ2pGLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRTtZQUMxRCxHQUFHLEVBQUUsd0JBQXdCO1lBQzdCLElBQUksRUFBRSxFQUFFLFlBQVksRUFBRSw0QkFBNEIsRUFBRTtTQUNyRCxDQUFDLENBQUM7UUFDSCxPQUFPLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLEdBQUcsNEJBQTRCLENBQUM7UUFDL0QsSUFBSSxDQUFDLGNBQWMsR0FBRyxZQUFZLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbkMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEdBQUcsdUJBQXVCLENBQUM7UUFDcEQsSUFBSSxDQUFDLGFBQWEsR0FBRyxZQUFZLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDckUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEdBQUcsc0JBQXNCLENBQUM7UUFDbEQsSUFBSSxDQUFDLHNCQUFzQixHQUFHLFlBQVksQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZGLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDekMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEtBQUssR0FBRywwQkFBMEIsQ0FBQztRQUMvRCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLHdDQUF3QyxFQUFFLENBQUMsQ0FBQztRQUN2RyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUU7WUFDbkUsR0FBRyxFQUFFLENBQUMsd0JBQXdCLEVBQUUsZUFBZSxDQUFDO1lBQ2hELElBQUksRUFBRSxFQUFFLFlBQVksRUFBRSxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUU7U0FDcEUsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDakMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLEdBQUcsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNuSCxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNqQyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFO1lBQzFELEdBQUcsRUFBRSxjQUFjO1lBQ25CLElBQUksRUFBRSxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUU7U0FDdEMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakMsSUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFO1lBQ25FLEdBQUcsRUFBRSx3QkFBd0I7WUFDN0IsSUFBSSxFQUFFLEVBQUUsWUFBWSxFQUFFLHNCQUFzQixFQUFFO1NBQy9DLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxHQUFHLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkgsT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUM7UUFDbEMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksbUJBQW1CLENBQ2hELElBQUksQ0FBQyxNQUFNLEVBQ1gsSUFBSSxDQUFDLEdBQUcsRUFDUixJQUFJLEVBQ0osY0FBYyxFQUNkLGlCQUFpQixFQUNqQixTQUFTLENBQ1YsQ0FBQztRQUNGLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxZQUFZLEVBQUUsQ0FBQztJQUMxQyxDQUFDO0lBRU8sb0JBQW9COztRQUMxQixJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNuQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3ZFLENBQUM7YUFBTSxDQUFDO1FBQ1IsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2pCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDbkUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQzFFLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNwQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3hFLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ25GLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDMUUsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDOUIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFDNUYsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUM5RSxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUM5QixJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUNoRyxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDeEIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3BGLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDbEYsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7WUFDaEMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDM0YsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUNwRixDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUNuRyxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUM5QixJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUM1RixDQUFDO1FBQ0QsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDakUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDMUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUNqRixJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBQzdGLE1BQUEsSUFBSSxDQUFDLG1CQUFtQiwwQ0FBRSxvQkFBb0IsRUFBRSxDQUFDO1FBQ2pELElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsZUFBZSxFQUFFLFNBQVMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvRixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLGNBQWMsRUFBRSxRQUFRLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0YsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2hGLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0RixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLHFCQUFxQixFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLGtCQUFrQixFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN2RixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0RixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxRixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRSxHQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDckUsQ0FBQztJQXFJTywwQkFBMEI7UUFDaEMsSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0I7WUFBRSxPQUFPO1FBRXZDLElBQUksUUFBZ0IsQ0FBQztRQUNyQixJQUFJLFNBQWlCLENBQUM7UUFFdEIsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUN2QyxRQUFRLEdBQUcsZUFBZSxDQUFDO1lBQzNCLFNBQVMsR0FBRyxpQkFBaUIsQ0FBQztRQUNoQyxDQUFDO2FBQU0sQ0FBQztZQUNOLFFBQVEsR0FBRyxhQUFhLENBQUM7WUFDekIsU0FBUyxHQUFHLGFBQWEsQ0FBQztRQUM1QixDQUFDO1FBQ0QsT0FBTyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsb0JBQW9CLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNoRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsS0FBSyxHQUFHLFNBQVMsQ0FBQztJQUM5QyxDQUFDO0lBd0RPLGtCQUFrQixDQUFDLFNBQW9DO1FBQzdELElBQUksSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3hCLElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQ2QsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDO2dCQUM5QixNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDdEQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3ZDLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxHQUFHLGtCQUFrQixXQUFXLG9CQUFvQixDQUFDO2dCQUU5RSxJQUFJLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1lBQ3pELENBQUM7aUJBQU0sQ0FBQztnQkFDTixJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDN0MsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLO29CQUN2QixxRkFBcUYsQ0FBQztnQkFFeEYsSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMscUJBQXFCLENBQUMsQ0FBQztZQUN0RCxDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDTixPQUFPLENBQUMsS0FBSyxDQUFDLHlDQUF5QyxDQUFDLENBQUM7UUFDM0QsQ0FBQztJQUNILENBQUM7SUF1SU8sdUJBQXVCLENBQUMsTUFBYyxFQUFFLFdBQW1CO1FBQ2pFLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQXNMYSxrQkFBa0IsQ0FBQyxPQUFnQjs7O1lBQy9DLE1BQU0sUUFBUSxHQUFHLENBQUMsSUFBSSxDQUFDLHVCQUF1QixJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ25ILElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQ2IsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDNUMsSUFBSSxDQUFDLHVCQUF1QixHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7WUFDbkQsQ0FBQztpQkFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLHVCQUF1QixJQUFJLENBQUEsTUFBQSxJQUFJLENBQUMsYUFBYSwwQ0FBRSxRQUFRLENBQUMsTUFBTSxNQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN0RixJQUFJLENBQUMsdUJBQXVCLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztZQUNuRCxDQUFDO1lBQ0QsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBRXRCLElBQUksY0FBYyxHQUF1QixJQUFJLENBQUM7WUFDOUMsSUFBSSxDQUFDO2dCQUNILElBQUksUUFBUSxHQU1ELElBQUksQ0FBQztnQkFFaEIsUUFBUSxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ3JCLEtBQUssTUFBTTt3QkFDVCxRQUFRLEdBQUcsSUFBSSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO3dCQUN6RSxNQUFNO29CQUNSLEtBQUssV0FBVzt3QkFDZCxRQUFRLEdBQUcsSUFBSSx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsT0FBMkIsRUFBRSxJQUFJLENBQUMsQ0FBQzt3QkFDbEcsTUFBTTtvQkFDUixLQUFLLFFBQVE7d0JBQ1gsUUFBUSxHQUFHLElBQUkscUJBQXFCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQzt3QkFDM0UsTUFBTTtvQkFDUixLQUFLLE9BQU87d0JBQ1YsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxDQUFDO3dCQUNqQyxPQUFPO29CQUVULEtBQUssTUFBTTt3QkFDVCxRQUFRLEdBQUcsSUFBSSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO3dCQUN6RSxNQUFNO29CQUVSO3dCQUNFLE1BQU0sZ0JBQWdCLEdBQUcsTUFBQSxJQUFJLENBQUMsYUFBYSwwQ0FBRSxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7d0JBQzNGLElBQUksZ0JBQWdCLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDOzRCQUMzQyxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsQ0FBQzs0QkFDM0UsTUFBTSxPQUFPLEdBQUcsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLFdBQVcsQ0FBQyxlQUFlLElBQUksaUJBQWlCLEVBQUUsQ0FBQyxDQUFDOzRCQUN0RyxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsV0FBVyxDQUFDLE9BQU8sSUFBSSxXQUFXLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxDQUFDOzRCQUNyRyxTQUFTLENBQUMsU0FBUyxDQUFDO2dDQUNsQixHQUFHLEVBQUUsV0FBVyxDQUFDLG1CQUFtQixJQUFJLHFCQUFxQjtnQ0FDN0QsSUFBSSxFQUFFLHNFQUFzRSxPQUFPLENBQUMsSUFBSSxnQ0FBZ0M7NkJBQ3pILENBQUMsQ0FBQzs0QkFDSCxtQkFBbUIsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7NEJBQ3JFLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLENBQUM7NEJBQ2pELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxnQkFBZ0IsQ0FBQzt3QkFDN0MsQ0FBQzt3QkFDRCxPQUFPO2dCQUNYLENBQUM7Z0JBRUQsSUFBSSxRQUFRLEVBQUUsQ0FBQztvQkFDYixNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQ2pDLGNBQWMsR0FBRyxNQUFNLFlBQVksT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO2dCQUNyRSxDQUFDO3FCQUFNLENBQUM7b0JBQ04sT0FBTztnQkFDVCxDQUFDO2dCQUVELElBQUksY0FBYyxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztvQkFDekMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLENBQUM7b0JBQy9DLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxjQUFjLENBQUM7b0JBQ3pDLElBQUksQ0FBQyxjQUFjLENBQUMsV0FBVyxFQUFFLENBQUM7b0JBQ2xDLENBQUM7b0JBRUQsY0FBYyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLGdCQUFnQixJQUFJLGtCQUFrQixDQUFDLENBQUM7b0JBQ2pGLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxjQUFjLGFBQWQsY0FBYyx1QkFBZCxjQUFjLENBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLElBQUksa0JBQWtCLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztvQkFFNUcsTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFDLElBQUksS0FBSyxNQUFNLENBQUM7b0JBQzlDLElBQUksQ0FBQyxhQUFhLElBQUksSUFBSSxDQUFDLGNBQWMsSUFBSSxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQzt3QkFDekUsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLE9BQU8sSUFBSSxTQUFTLENBQUMsQ0FBQztvQkFDOUUsQ0FBQzt5QkFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO3dCQUNoQyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7d0JBRXRHLE1BQU0sV0FBVyxHQUNmLENBQUMsSUFBSSxDQUFDLFlBQVksSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLFdBQVcsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDO3dCQUN6RyxJQUFJLENBQUMsd0JBQXdCLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO29CQUMxRCxDQUFDO29CQUNELFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsOEJBQThCLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztnQkFDL0QsQ0FBQztxQkFBTSxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUN0QixDQUFDO1lBQ0gsQ0FBQztZQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7Z0JBQ3BCLElBQUksQ0FBQztvQkFDSCxNQUFNLFdBQVcsR0FBRyxtQ0FBbUMsT0FBTyxhQUFQLE9BQU8sdUJBQVAsT0FBTyxDQUFFLElBQUksK0JBQStCLENBQUM7b0JBRXBHLE1BQU0sY0FBYyxHQUFZO3dCQUM5QixJQUFJLEVBQUUsT0FBTzt3QkFDYixPQUFPLEVBQUUsV0FBVzt3QkFDcEIsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTLElBQUksSUFBSSxJQUFJLEVBQUU7cUJBQzNDLENBQUM7b0JBQ0YsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUMxQyxDQUFDO2dCQUFDLE9BQU8sYUFBYSxFQUFFLENBQUM7b0JBQ3ZCLElBQUksTUFBTSxDQUFDLG1EQUFtRCxDQUFDLENBQUM7Z0JBQ2xFLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztLQUFBO0lBaUVPLHNCQUFzQixDQUFDLFFBQW1DO1FBQ2hFLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2pCLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxHQUFHLDRCQUE0QixDQUFDO1FBQzFELENBQUM7SUFDSCxDQUFDO0lBQ08sa0JBQWtCO1FBQ3hCLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO0lBQzlCLENBQUM7SUE2Qk8saUJBQWlCLENBQUMsUUFBbUM7UUFDM0QsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDdkIsTUFBTSxXQUFXLEdBQUcsUUFBUSxJQUFJLE1BQU0sQ0FBQztZQUN2QyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN4QyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssR0FBRyxpQkFBaUIsV0FBVyxvQkFBb0IsQ0FBQztRQUM5RSxDQUFDO0lBQ0gsQ0FBQztJQUVPLHFCQUFxQjtRQUMzQixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUNwRSxPQUFPO1FBQ1QsQ0FBQztRQUVELE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixLQUFLLElBQUksQ0FBQztRQUNsRSxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLENBQUM7UUFFdEQsSUFBSSxvQkFBb0IsRUFBRSxDQUFDO1lBQ3pCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNqQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztRQUNsQyxDQUFDO2FBQU0sQ0FBQztZQUNOLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNqQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO1lBRXZCLE1BQU0sb0JBQW9CLEdBQUcsWUFBWSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUM7WUFDL0QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEdBQUcsb0JBQW9CLENBQUM7WUFDaEQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUMvRSxDQUFDO0lBQ0gsQ0FBQztJQUVNLGNBQWM7O1FBQ25CLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDbEYsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUMzQixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDO2dCQUMvQyxHQUFHLEVBQUUscUJBQXFCO2FBQzNCLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDO2dCQUMxQixHQUFHLEVBQUUscUJBQXFCO2dCQUMxQixJQUFJLEVBQUUsaUJBQWlCO2FBQ3hCLENBQUMsQ0FBQztZQUNILE1BQU0sU0FBUyxHQUFHLENBQUEsTUFBQSxNQUFBLElBQUksQ0FBQyxNQUFNLDBDQUFFLFFBQVEsMENBQUUsU0FBUyxLQUFJLFFBQVEsQ0FBQztZQUMvRCxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQztnQkFDMUIsR0FBRyxFQUFFLGlCQUFpQjtnQkFDdEIsSUFBSSxFQUFFLG9FQUFvRSxTQUFTLEdBQUc7YUFDdkYsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztJQUNILENBQUM7SUFDTSxjQUFjO1FBQ25CLElBQUksSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUM7UUFDM0IsQ0FBQztJQUNILENBQUM7SUFFTSxlQUFlLENBQUMsU0FBa0I7UUFDdkMsSUFBSSxDQUFDLFlBQVksR0FBRyxTQUFTLENBQUM7UUFFOUIsSUFBSSxJQUFJLENBQUMsT0FBTztZQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxHQUFHLFNBQVMsQ0FBQztRQUVwRCxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUU3QixJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsR0FBRyxTQUFTLENBQUM7WUFDdEMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDckUsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDOUIsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsR0FBRyxTQUFTLENBQUM7WUFDL0MsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM5RSxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDcEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEdBQUcsU0FBUyxDQUFDO1lBQ3JDLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3BFLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUN2QixJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUNkLElBQUksQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLENBQW9CLElBQUksV0FBVyxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7b0JBQzFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztnQkFDaEMsQ0FBQyxDQUFDLENBQUM7WUFDTCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sSUFBSSxDQUFDLDZCQUE2QixFQUFFLENBQUM7WUFDdkMsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBbURZLHdCQUF3QixDQUFDLGVBQXdCOzs7WUFDNUQsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFBLE1BQUEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLDBDQUFFLGFBQWEsRUFBRSxDQUFBLENBQUM7WUFDbEUsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNoQixJQUFJLE1BQU0sQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO2dCQUNyRCxPQUFPO1lBQ1QsQ0FBQztZQUVELElBQUksWUFBWSxDQUNkLElBQUksQ0FBQyxHQUFHLEVBQ1IsMEJBQTBCLEVBQzFCLG1EQUFtRCxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEdBQzFGLGVBQWUsQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUNqRCxvQ0FBb0MsRUFDcEMsR0FBUyxFQUFFO2dCQUNULElBQUksQ0FBQztvQkFDSCxNQUFNLGFBQWEsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUMxRSxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFDdEIsZUFBZSxDQUFDLFNBQVMsQ0FDMUIsQ0FBQztvQkFFRixJQUFJLGFBQWEsRUFBRSxDQUFDO3dCQUNsQixJQUFJLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO29CQUNqQyxDQUFDO3lCQUFNLENBQUM7d0JBQ04sSUFBSSxNQUFNLENBQUMsMkJBQTJCLENBQUMsQ0FBQztvQkFDMUMsQ0FBQztnQkFDSCxDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ2YsSUFBSSxNQUFNLENBQUMsK0NBQStDLENBQUMsQ0FBQztnQkFDOUQsQ0FBQztZQUNILENBQUMsQ0FBQSxDQUNGLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDWCxDQUFDO0tBQUE7SUFFTSxlQUFlLENBQUMsT0FBZSxFQUFFLFFBQXFCO1FBQzNELElBQUksVUFBVSxHQUFHLE9BQU8sQ0FBQztRQUV6QixJQUFJLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxhQUFhLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUNoRyxVQUFVLEdBQUcsYUFBYSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQztpQkFDbkQsT0FBTyxDQUFDLDJCQUEyQixFQUFFLEVBQUUsQ0FBQztpQkFDeEMsSUFBSSxFQUFFLENBQUM7UUFDWixDQUFDO1FBQ0QsU0FBUyxDQUFDLFNBQVM7YUFDaEIsU0FBUyxDQUFDLFVBQVUsQ0FBQzthQUNyQixJQUFJLENBQUMsR0FBRyxFQUFFO1lBQ1QsT0FBTyxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUMzQixRQUFRLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQztZQUMxQyxVQUFVLENBQUMsR0FBRyxFQUFFO2dCQUNkLE9BQU8sQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzFCLFFBQVEsQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3pDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNYLENBQUMsQ0FBQzthQUNELEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUNYLE9BQU8sQ0FBQyxLQUFLLENBQUMsY0FBYyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ25DLElBQUksTUFBTSxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDckMsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRVksb0JBQW9CLENBQy9CLGVBQXVCLEVBQ3ZCLFNBQXNCLEVBQ3RCLFFBQTJCOzs7WUFFM0IsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMseUJBQXlCLENBQUM7WUFFbEUsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGlCQUFpQixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixLQUFLLE1BQU0sRUFBRSxDQUFDO2dCQUNuRyxJQUFJLE1BQU0sQ0FBQyw0REFBNEQsQ0FBQyxDQUFDO2dCQUN6RSxPQUFPO1lBQ1QsQ0FBQztZQUVELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDaEIsSUFBSSxNQUFNLENBQUMseURBQXlELENBQUMsQ0FBQztnQkFDdEUsT0FBTztZQUNULENBQUM7WUFFRCxJQUFJLGVBQWUsR0FBRyxFQUFFLENBQUM7WUFDekIsSUFBSSxDQUFDO2dCQUNILE1BQU0sY0FBYyxHQUFHLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDekUsSUFBSSxhQUFhLENBQUMsa0JBQWtCLENBQUMsY0FBYyxDQUFDLENBQUMsZUFBZSxFQUFFLENBQUM7b0JBQ3JFLGVBQWUsR0FBRyxjQUFjLENBQUMsT0FBTyxDQUFDLDJCQUEyQixFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNuRixDQUFDO3FCQUFNLENBQUM7b0JBQ04sZUFBZSxHQUFHLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDMUMsQ0FBQztnQkFFRCxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7b0JBQ3JCLElBQUksTUFBTSxDQUFDLDZFQUE2RSxDQUFDLENBQUM7b0JBQzFGLE9BQU87Z0JBQ1QsQ0FBQztZQUNILENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNmLElBQUksTUFBTSxDQUFDLHlDQUF5QyxDQUFDLENBQUM7Z0JBQ3RELE9BQU87WUFDVCxDQUFDO1lBRUQsTUFBQSxTQUFTLENBQUMsYUFBYSxDQUFDLElBQUksK0JBQStCLEVBQUUsQ0FBQywwQ0FBRSxNQUFNLEVBQUUsQ0FBQztZQUV6RSxNQUFNLFlBQVksR0FBRyxDQUFBLE1BQUEsUUFBUSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsMENBQUUsWUFBWSxDQUFDLFdBQVcsQ0FBQyxLQUFJLFdBQVcsQ0FBQztZQUNuRyxPQUFPLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzVCLFFBQVEsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQ3pCLFFBQVEsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLDZCQUE2QixDQUFDLENBQUM7WUFDdEQsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQztZQUNyQyxRQUFRLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ2pELFFBQVEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUVwQyxJQUFJLENBQUM7Z0JBQ0gsTUFBTSxjQUFjLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxlQUFlLEVBQUUsVUFBVSxDQUFDLENBQUM7Z0JBRW5HLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUM7b0JBQ3pDLE9BQU87Z0JBQ1QsQ0FBQztnQkFFRCxJQUFJLGNBQWMsS0FBSyxJQUFJLEVBQUUsQ0FBQztvQkFDNUIsTUFBTSxvQkFBb0IsR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLCtCQUErQixFQUFFLENBQUMsQ0FBQztvQkFFM0YsTUFBTSxvQkFBb0IsR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsNkJBQTZCLEVBQUUsQ0FBQyxDQUFDO29CQUVwRyxNQUFNLGdCQUFnQixDQUFDLE1BQU0sQ0FDM0IsSUFBSSxDQUFDLEdBQUcsRUFDUixjQUFjLEVBQ2Qsb0JBQW9CLEVBQ3BCLE1BQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLDBDQUFFLElBQUksbUNBQUksRUFBRSxFQUMzQyxJQUFJLENBQ0wsQ0FBQztvQkFFRixhQUFhLENBQUMsc0JBQXNCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztvQkFFM0QsTUFBTSxjQUFjLEdBQUcsU0FBUyxDQUFDLFVBQVUsQ0FBQyxJQUFJLFVBQVUsQ0FBQztvQkFDM0Qsb0JBQW9CLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRTt3QkFDbkMsR0FBRyxFQUFFLHVCQUF1Qjt3QkFDNUIsSUFBSSxFQUFFLGtCQUFrQixjQUFjLEdBQUc7cUJBQzFDLENBQUMsQ0FBQztvQkFFSCxJQUFJLENBQUMsd0JBQXdCLENBQUMsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUMzQyxDQUFDO1lBQ0gsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDakIsQ0FBQztvQkFBUyxDQUFDO2dCQUNULElBQUksUUFBUSxhQUFSLFFBQVEsdUJBQVIsUUFBUSxDQUFFLFdBQVcsRUFBRSxDQUFDO29CQUMxQixPQUFPLENBQUMsUUFBUSxFQUFFLFlBQVksQ0FBQyxDQUFDO29CQUNoQyxRQUFRLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztvQkFDMUIsUUFBUSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsNkJBQTZCLENBQUMsQ0FBQztvQkFDekQsUUFBUSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsYUFBYSxDQUFDLENBQUM7b0JBQzlDLFFBQVEsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztnQkFDekMsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDO0tBQUE7SUFFTyxtQkFBbUIsQ0FBQyxJQUFVO1FBQ3BDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYTtZQUFFLE9BQU87UUFDaEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUM7WUFDM0IsR0FBRyxFQUFFLHdCQUF3QjtZQUM3QixJQUFJLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQztTQUNyQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sZ0JBQWdCO1FBQ3RCLElBQUksQ0FBQztZQUNILE1BQU0sVUFBVSxHQUFHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7WUEyRWIsQ0FBQztZQUVQLE1BQU0sVUFBVSxHQUFHLElBQUksSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLEVBQUU7Z0JBQ3hDLElBQUksRUFBRSx3QkFBd0I7YUFDL0IsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNsRCxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFL0IsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDbkMsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixJQUFJLE1BQU0sQ0FBQyxrREFBa0QsQ0FBQyxDQUFDO1lBQy9ELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO1FBQzNCLENBQUM7SUFDSCxDQUFDO0lBQ08seUJBQXlCO1FBQy9CLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWTtZQUFFLE9BQU87UUFFL0IsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDLEVBQUU7WUFDcEMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztZQUV4QixJQUFJLElBQUksSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNuRCxJQUFJLE1BQU0sQ0FBQyw2QkFBNkIsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7Z0JBQ3hELElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDNUQsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7Z0JBQzdCLE9BQU87WUFDVCxDQUFDO1lBRUQsSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUM7Z0JBQzVDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDL0IsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3BDLENBQUM7aUJBQU0sSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUN0QyxDQUFDO1lBRUQsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFDL0IsQ0FBQyxDQUFDO1FBRUYsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLEdBQUcsR0FBRyxFQUFFO1lBQy9CLElBQUksTUFBTSxDQUFDLGdFQUFnRSxDQUFDLENBQUM7WUFDN0UsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRTVELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNqQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBQ08sZ0JBQWdCLENBQUMsVUFBa0I7O1FBQ3pDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTztZQUFFLE9BQU87UUFFMUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7UUFDdEMsTUFBTSxLQUFLLEdBQUcsTUFBQSxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsbUNBQUksVUFBVSxDQUFDLE1BQU0sQ0FBQztRQUMvRCxNQUFNLEdBQUcsR0FBRyxNQUFBLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxtQ0FBSSxVQUFVLENBQUMsTUFBTSxDQUFDO1FBRTNELElBQUksWUFBWSxHQUFHLFVBQVUsQ0FBQztRQUM5QixNQUFNLGFBQWEsR0FBRyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDL0QsTUFBTSxhQUFhLEdBQUcsR0FBRyxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBRXZFLElBQUksYUFBYSxJQUFJLGFBQWEsS0FBSyxHQUFHLElBQUksYUFBYSxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3JFLFlBQVksR0FBRyxHQUFHLEdBQUcsWUFBWSxDQUFDO1FBQ3BDLENBQUM7UUFDRCxJQUFJLGFBQWEsSUFBSSxhQUFhLEtBQUssR0FBRyxJQUFJLGFBQWEsS0FBSyxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDcEcsWUFBWSxJQUFJLEdBQUcsQ0FBQztRQUN0QixDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsWUFBWSxHQUFHLFVBQVUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDM0YsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDO1FBRTlCLE1BQU0sWUFBWSxHQUFHLEtBQUssR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDO1FBQ2pELElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsWUFBWSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBRTNELElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDckIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBQ2Esc0JBQXNCOztZQUNsQyxJQUFJLElBQUksQ0FBQyxhQUFhLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEtBQUssV0FBVyxFQUFFLENBQUM7Z0JBQ25FLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sTUFBTSxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUNyQyxDQUFDO1FBQ0gsQ0FBQztLQUFBO0lBQ2EscUJBQXFCOzs7WUFDakMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxNQUFNLENBQUMsdUVBQXVFLENBQUMsQ0FBQztnQkFFcEYsT0FBTztZQUNULENBQUM7WUFFRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUM7WUFDdkQsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNsQixJQUFJLE1BQU0sQ0FDUiw4R0FBOEcsQ0FDL0csQ0FBQztnQkFDRixPQUFPO1lBQ1QsQ0FBQztZQUVELElBQUksQ0FBQztnQkFDSCxJQUFJLENBQUMsV0FBVyxHQUFHLE1BQU0sU0FBUyxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUM7b0JBQzNELEtBQUssRUFBRSxJQUFJO2lCQUNaLENBQUMsQ0FBQztnQkFFSCxJQUFJLGVBQWlELENBQUM7Z0JBQ3RELE1BQU0saUJBQWlCLEdBQUcsd0JBQXdCLENBQUM7Z0JBRW5ELElBQUksYUFBYSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7b0JBQ3JELGVBQWUsR0FBRyxFQUFFLFFBQVEsRUFBRSxpQkFBaUIsRUFBRSxDQUFDO2dCQUNwRCxDQUFDO3FCQUFNLENBQUM7b0JBQ04sZUFBZSxHQUFHLFNBQVMsQ0FBQztnQkFDOUIsQ0FBQztnQkFFRCxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsZUFBZSxDQUFDLENBQUM7Z0JBRTFFLE1BQU0sV0FBVyxHQUFXLEVBQUUsQ0FBQztnQkFFL0IsTUFBQSxJQUFJLENBQUMsV0FBVywwQ0FBRSxTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLENBQUM7Z0JBQ3JELE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLGFBQWEsQ0FBQyxDQUFDO2dCQUN6QyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsR0FBRyx5QkFBeUIsQ0FBQztnQkFFckQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDLEVBQUU7b0JBQzNDLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUM7d0JBQ3hCLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUMvQixDQUFDO2dCQUNILENBQUMsQ0FBQztnQkFDRixJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sR0FBRyxHQUFHLEVBQUU7O29CQUMvQixJQUFJLElBQUksQ0FBQyxZQUFZLElBQUksV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQzt3QkFDaEQsTUFBTSxTQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFOzRCQUN0QyxJQUFJLEVBQUUsQ0FBQSxNQUFBLElBQUksQ0FBQyxhQUFhLDBDQUFFLFFBQVEsS0FBSSxZQUFZO3lCQUNuRCxDQUFDLENBQUM7d0JBRUgsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEdBQUcsc0JBQXNCLENBQUM7d0JBQ2xELElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDOzRCQUM1QixNQUFNLEVBQUUsWUFBWTs0QkFDcEIsU0FBUzs0QkFDVCxZQUFZLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxJQUFJLE9BQU87eUJBQzdELENBQUMsQ0FBQztvQkFDTCxDQUFDO3lCQUFNLElBQUksV0FBVyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQzt3QkFDcEMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7d0JBQ3pGLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO29CQUMvQixDQUFDO2dCQUNILENBQUMsQ0FBQztnQkFDRixJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sR0FBRyxHQUFHLEVBQUU7b0JBQ2hDLElBQUksTUFBTSxDQUFDLHFDQUFxQyxDQUFDLENBQUM7b0JBQ2xELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDakMsQ0FBQyxDQUFDO2dCQUVGLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDN0IsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsSUFBSSxLQUFLLFlBQVksWUFBWSxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssaUJBQWlCLEVBQUUsQ0FBQztvQkFDdEUsSUFBSSxNQUFNLENBQUMsb0RBQW9ELENBQUMsQ0FBQztnQkFDbkUsQ0FBQztxQkFBTSxJQUFJLEtBQUssWUFBWSxZQUFZLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxlQUFlLEVBQUUsQ0FBQztvQkFDM0UsSUFBSSxNQUFNLENBQUMsaUVBQWlFLENBQUMsQ0FBQztnQkFDaEYsQ0FBQztxQkFBTSxDQUFDO29CQUNOLElBQUksTUFBTSxDQUFDLGtDQUFrQyxDQUFDLENBQUM7Z0JBQ2pELENBQUM7Z0JBQ0QsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pDLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFDTyxrQkFBa0IsQ0FBQyxZQUFxQjs7UUFDOUMsSUFBSSxJQUFJLENBQUMsYUFBYSxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQ25FLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDNUIsQ0FBQzthQUFNLElBQUksQ0FBQyxZQUFZLElBQUksQ0FBQSxNQUFBLElBQUksQ0FBQyxhQUFhLDBDQUFFLEtBQUssTUFBSyxVQUFVLEVBQUUsQ0FBQztRQUN2RSxDQUFDO1FBRUQsTUFBQSxJQUFJLENBQUMsV0FBVywwQ0FBRSxTQUFTLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDeEQsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFakMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDekYsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFFN0IsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUM1RCxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztRQUMxQixDQUFDO1FBQ0QsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7SUFDNUIsQ0FBQztJQUVNLDZCQUE2Qjs7UUFDbEMsTUFBQSxJQUFJLENBQUMsYUFBYSwwQ0FBRSxnQkFBZ0IsQ0FBYyxJQUFJLGlCQUFpQixFQUFFLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ3pGLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxxQkFBcUIsQ0FBQyxTQUFzQixFQUFFLFFBQTJCO1FBQy9FLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDO1FBRTdELE1BQU0sc0JBQXNCLEdBQUcsUUFBUSxDQUFDLFlBQVksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBRTNFLElBQUksc0JBQXNCLEVBQUUsQ0FBQztZQUMzQixRQUFRLENBQUMsZUFBZSxDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFFL0MsU0FBUyxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsR0FBRyxjQUFjLElBQUksQ0FBQztZQUNsRCxTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1lBQ3JELFFBQVEsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUM7WUFFaEMsVUFBVSxDQUFDLEdBQUcsRUFBRTtnQkFDZCxTQUFTLENBQUMsY0FBYyxDQUFDLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUNyRSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDVixDQUFDO2FBQU0sQ0FBQztZQUNOLE1BQU0sV0FBVyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLDJCQUEyQixDQUFDLENBQUM7WUFFOUUsSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDaEIsU0FBUyxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO2dCQUMvQixTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUN4RCxRQUFRLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ2xDLENBQUM7aUJBQU0sQ0FBQztnQkFDTixTQUFTLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxHQUFHLGNBQWMsSUFBSSxDQUFDO2dCQUNsRCxTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUNyRCxRQUFRLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUVoQyxVQUFVLENBQUMsR0FBRyxFQUFFO29CQUNkLFNBQVMsQ0FBQyxjQUFjLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO2dCQUNyRSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDVixDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFFTSxnQkFBZ0I7UUFDckIsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDO0lBQzVCLENBQUM7SUFFTywwQkFBMEI7UUFDaEMsSUFBSSxDQUFDLGVBQWUsR0FBRyxFQUFFLENBQUM7UUFDMUIsSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQztRQUNwQyxJQUFJLElBQUksQ0FBQyxhQUFhO1lBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuRCxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDdEIsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQztRQUMvQixJQUFJLENBQUMsd0JBQXdCLEdBQUcsRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7UUFDOUIsSUFBSSxDQUFDLG1CQUFtQixHQUFHLEtBQUssQ0FBQztJQUNuQyxDQUFDO0lBRU0sb0JBQW9CO1FBQ3pCLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUN0QixJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUM3QixVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFTSxjQUFjO1FBQ25CLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUNNLGVBQWU7UUFDcEIsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDakIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQ3hCLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDakQsQ0FBQztJQUNILENBQUM7SUFDTSxVQUFVO1FBQ2YsVUFBVSxDQUFDLEdBQUcsRUFBRTs7WUFDZCxNQUFBLElBQUksQ0FBQyxPQUFPLDBDQUFFLEtBQUssRUFBRSxDQUFDO1FBQ3hCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNSLENBQUM7SUFFRCx3QkFBd0IsQ0FBQyxLQUFLLEdBQUcsRUFBRSxFQUFFLFdBQVcsR0FBRyxLQUFLO1FBQ3RELElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3ZCLFlBQVksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDakMsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7UUFDNUIsQ0FBQztRQUNELElBQUksQ0FBQyxhQUFhLEdBQUcsVUFBVSxDQUFDLEdBQUcsRUFBRTtZQUNuQyxxQkFBcUIsQ0FBQyxHQUFHLEVBQUU7O2dCQUN6QixJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztvQkFDdkIsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDO29CQUN0QixNQUFNLFlBQVksR0FDaEIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZO3dCQUNoRyxTQUFTLENBQUM7b0JBRVosSUFBSSxZQUFZLEtBQUssSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO3dCQUN6QyxJQUFJLENBQUMsY0FBYyxHQUFHLFlBQVksQ0FBQzt3QkFFbkMsSUFBSSxDQUFDLFlBQVk7NEJBQUUsTUFBQSxJQUFJLENBQUMsc0JBQXNCLDBDQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztvQkFDdEYsQ0FBQztvQkFFRCxJQUFJLFdBQVcsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLElBQUksSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO3dCQUM3RCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQzt3QkFDdkQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUM7NEJBQzFCLEdBQUcsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVk7NEJBQ3BDLFFBQVEsRUFBRSxRQUFRO3lCQUNuQixDQUFDLENBQUM7d0JBRUgsSUFBSSxXQUFXLEVBQUUsQ0FBQzs0QkFDaEIsSUFBSSxDQUFDLGNBQWMsR0FBRyxLQUFLLENBQUM7NEJBQzVCLE1BQUEsSUFBSSxDQUFDLHNCQUFzQiwwQ0FBRSxTQUFTLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7d0JBQ25FLENBQUM7b0JBQ0gsQ0FBQztnQkFDSCxDQUFDO3FCQUFNLENBQUM7Z0JBQ1IsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7UUFDNUIsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ1osQ0FBQztJQUVELFVBQVUsQ0FBQyxJQUFVO1FBQ25CLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsRUFBRTtZQUN4QyxJQUFJLEVBQUUsU0FBUztZQUNmLE1BQU0sRUFBRSxTQUFTO1NBQ2xCLENBQUMsQ0FBQztJQUNMLENBQUM7SUFDRCxtQkFBbUIsQ0FBQyxJQUFVO1FBQzVCLE1BQU0sR0FBRyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7UUFDdkIsTUFBTSxTQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDaEMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDckMsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUM7WUFBRSxPQUFPLE9BQU8sQ0FBQzthQUN6QyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQztZQUFFLE9BQU8sV0FBVyxDQUFDOztZQUUzRCxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUU7Z0JBQ3hDLE9BQU8sRUFBRSxNQUFNO2dCQUNmLElBQUksRUFBRSxTQUFTO2dCQUNmLEtBQUssRUFBRSxNQUFNO2dCQUNiLEdBQUcsRUFBRSxTQUFTO2FBQ2YsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUNELGtCQUFrQixDQUFDLElBQVU7UUFDM0IsSUFBSSxDQUFDLENBQUMsSUFBSSxZQUFZLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQ3JELE9BQU8sY0FBYyxDQUFDO1FBQ3hCLENBQUM7UUFDRCxNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ3ZCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7UUFDeEUsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUQsSUFBSSxRQUFRLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDbkIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN0RCxJQUFJLFNBQVMsR0FBRyxDQUFDO2dCQUFFLE9BQU8sVUFBVSxDQUFDO1lBQ3JDLElBQUksU0FBUyxLQUFLLENBQUM7Z0JBQUUsT0FBTyxZQUFZLENBQUM7WUFDekMsSUFBSSxTQUFTLEdBQUcsR0FBRyxDQUFDLFFBQVEsRUFBRTtnQkFBRSxPQUFPLEdBQUcsU0FBUyxZQUFZLENBQUM7O2dCQUMzRCxPQUFPLE9BQU8sQ0FBQztRQUN0QixDQUFDO2FBQU0sSUFBSSxRQUFRLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDMUIsT0FBTyxXQUFXLENBQUM7UUFDckIsQ0FBQzthQUFNLElBQUksUUFBUSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sR0FBRyxRQUFRLFdBQVcsQ0FBQztRQUNoQyxDQUFDO2FBQU0sQ0FBQztZQUNOLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsRUFBRTtnQkFDeEMsS0FBSyxFQUFFLE9BQU87Z0JBQ2QsR0FBRyxFQUFFLFNBQVM7YUFDZixDQUFDLENBQUM7UUFDTCxDQUFDO0lBQ0gsQ0FBQztJQUNELFNBQVMsQ0FBQyxLQUFXLEVBQUUsS0FBVztRQUNoQyxPQUFPLENBQ0wsS0FBSyxDQUFDLFdBQVcsRUFBRSxLQUFLLEtBQUssQ0FBQyxXQUFXLEVBQUU7WUFDM0MsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLEtBQUssQ0FBQyxRQUFRLEVBQUU7WUFDckMsS0FBSyxDQUFDLE9BQU8sRUFBRSxLQUFLLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FDcEMsQ0FBQztJQUNKLENBQUM7SUFFTyxvQkFBb0IsQ0FBQyxnQkFBMkI7UUFDdEQsSUFBSSxhQUFhLEdBQWdCLElBQUksQ0FBQztRQUN0QyxNQUFNLGVBQWUsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ25DLElBQUksUUFBUSxHQUFHLDBCQUEwQixHQUFHLGtCQUFrQixlQUFlLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7UUFFOUcsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFOztZQUNqQyxJQUFJLENBQUMsQ0FBQSxNQUFBLE9BQU8sQ0FBQyxPQUFPLDBDQUFFLElBQUksRUFBRSxDQUFBO2dCQUFFLE9BQU87WUFFckMsSUFBSSxhQUFhLEtBQUssSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0JBQ2hGLElBQUksYUFBYSxLQUFLLElBQUk7b0JBQUUsUUFBUSxJQUFJLE9BQU8sQ0FBQztnQkFDaEQsUUFBUSxJQUFJLEtBQUssSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDO1lBQzVFLENBQUM7WUFDRCxhQUFhLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztZQUVsQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNoRCxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7WUFDaEIsSUFBSSxhQUFhLEdBQUcsRUFBRSxDQUFDO1lBQ3ZCLElBQUksT0FBTyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7WUFFckMsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLFdBQVcsRUFBRSxDQUFDO2dCQUNqQyxPQUFPLEdBQUcsYUFBYSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQztxQkFDaEQsT0FBTyxDQUFDLDJCQUEyQixFQUFFLEVBQUUsQ0FBQztxQkFDeEMsSUFBSSxFQUFFLENBQUM7Z0JBRVYsSUFBSSxDQUFDLE9BQU87b0JBQUUsT0FBTztZQUN2QixDQUFDO1lBRUQsUUFBUSxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3JCLEtBQUssTUFBTTtvQkFDVCxNQUFNLEdBQUcsV0FBVyxJQUFJLFFBQVEsQ0FBQztvQkFDakMsTUFBTTtnQkFDUixLQUFLLFdBQVc7b0JBQ2QsTUFBTSxHQUFHLGdCQUFnQixJQUFJLFFBQVEsQ0FBQztvQkFDdEMsTUFBTTtnQkFDUixLQUFLLFFBQVE7b0JBQ1gsTUFBTSxHQUFHLGVBQWUsSUFBSSxVQUFVLENBQUM7b0JBQ3ZDLGFBQWEsR0FBRyxJQUFJLENBQUM7b0JBQ3JCLE1BQU07Z0JBQ1IsS0FBSyxPQUFPO29CQUNWLE1BQU0sR0FBRyxxQkFBcUIsSUFBSSxRQUFRLENBQUM7b0JBQzNDLGFBQWEsR0FBRyxJQUFJLENBQUM7b0JBQ3JCLE1BQU07WUFDVixDQUFDO1lBQ0QsUUFBUSxJQUFJLE1BQU0sQ0FBQztZQUNuQixJQUFJLGFBQWEsRUFBRSxDQUFDO2dCQUNsQixRQUFRO29CQUNOLE9BQU87eUJBQ0osS0FBSyxDQUFDLElBQUksQ0FBQzt5QkFDWCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxhQUFhLEdBQUcsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO3lCQUM3RSxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDO1lBQzNCLENBQUM7aUJBQU0sSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ25DLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxTQUFTLENBQUMsQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUN4RixRQUFRLElBQUksT0FBTyxDQUFDLElBQUksRUFBRSxHQUFHLE1BQU0sQ0FBQztZQUN0QyxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sUUFBUTtvQkFDTixPQUFPO3lCQUNKLEtBQUssQ0FBQyxJQUFJLENBQUM7eUJBQ1gsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7eUJBQ3RDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUM7WUFDM0IsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDekIsQ0FBQztJQUVhLHlCQUF5Qjs7O1lBQ3JDLElBQUksQ0FBQztnQkFDSCxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsMENBQUUsYUFBYSxFQUFFLENBQUEsQ0FBQztnQkFFbEUsTUFBTSxRQUFRLEdBQUcsTUFBQSxNQUFBLFVBQVUsYUFBVixVQUFVLHVCQUFWLFVBQVUsQ0FBRSxRQUFRLDBDQUFFLGdCQUFnQixtQ0FBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQztnQkFFakcsSUFBSSxRQUFRLEVBQUUsQ0FBQztvQkFDYixNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUV2RCxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQztvQkFFaEUsSUFBSSxTQUFTLEVBQUUsQ0FBQzt3QkFDZCxPQUFPLFNBQVMsQ0FBQyxJQUFJLENBQUM7b0JBQ3hCLENBQUM7eUJBQU0sQ0FBQzt3QkFDTixPQUFPLENBQUMsSUFBSSxDQUFDLG1CQUFtQixRQUFRLHVDQUF1QyxDQUFDLENBQUM7d0JBRWpGLE9BQU8sQ0FBQSxNQUFBLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLDBDQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUksZUFBZSxDQUFDO29CQUMxRSxDQUFDO2dCQUNILENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDBDQUEwQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ25FLENBQUM7WUFFRCxPQUFPLE1BQU0sQ0FBQztRQUNoQixDQUFDO0tBQUE7SUF5SE8sMEJBQTBCLENBQUMsV0FBc0M7UUFDdkUsSUFBSSxDQUFDLElBQUksQ0FBQyxzQkFBc0I7WUFBRSxPQUFPO1FBRXpDLE1BQU0sU0FBUyxHQUFHLFdBQVcsYUFBWCxXQUFXLGNBQVgsV0FBVyxHQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQztRQUVsRSxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLHNCQUFzQixDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxHQUFHLGdCQUFnQixTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQztJQUMvRixDQUFDO0lBRU8sbUJBQW1CLENBQUMsV0FBbUI7UUFDN0MsSUFBSSxXQUFXLElBQUksR0FBRyxFQUFFLENBQUM7WUFDdkIsT0FBTyxJQUFJLENBQUM7UUFDZCxDQUFDO2FBQU0sSUFBSSxXQUFXLEdBQUcsR0FBRyxJQUFJLFdBQVcsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNuRCxPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7YUFBTSxDQUFDO1lBQ04sT0FBTyxJQUFJLENBQUM7UUFDZCxDQUFDO0lBQ0gsQ0FBQztJQUVPLDhCQUE4Qjs7UUFDcEMsTUFBQSxJQUFJLENBQUMsbUJBQW1CLDBDQUFFLDhCQUE4QixFQUFFLENBQUM7SUFDN0QsQ0FBQztJQWlCWSxrQkFBa0IsQ0FBQyxRQUFtQzs7O1lBQ2pFLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDZCxPQUFPLE1BQU0sQ0FBQztZQUNoQixDQUFDO1lBQ0QsSUFBSSxDQUFDO2dCQUNILE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3ZELE1BQU0sU0FBUyxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDO2dCQUNoRSxJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUNkLE9BQU8sU0FBUyxDQUFDLElBQUksQ0FBQztnQkFDeEIsQ0FBQztxQkFBTSxDQUFDO29CQUNOLE1BQU0sUUFBUSxHQUFHLE1BQUEsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsMENBQUUsT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDL0QsT0FBTyxRQUFRLElBQUksY0FBYyxDQUFDO2dCQUNwQyxDQUFDO1lBQ0gsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsT0FBTyxPQUFPLENBQUM7WUFDakIsQ0FBQztRQUNILENBQUM7S0FBQTtJQWdGTyxtQkFBbUIsQ0FBQyxLQUFpQixFQUFFLFFBQXNCO1FBQ25FLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUN2QixNQUFNLElBQUksR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBRXhCLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FDbEIsSUFBSTthQUNELFFBQVEsQ0FBQyxZQUFZLENBQUM7YUFDdEIsT0FBTyxDQUFDLGtCQUFrQixDQUFDO2FBQzNCLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQzNELENBQUM7UUFFRixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQ2xCLElBQUk7YUFDRCxRQUFRLENBQUMsYUFBYSxDQUFDO2FBQ3ZCLE9BQU8sQ0FBQyxlQUFlLENBQUM7YUFDeEIsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUMzRSxDQUFDO1FBRUYsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUNsQixJQUFJO2FBQ0QsUUFBUSxDQUFDLGdCQUFnQixDQUFDO2FBQzFCLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQzthQUMxQixPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUN2RCxDQUFDO1FBRUYsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBRXBCLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDbEIsSUFBSTtpQkFDRCxRQUFRLENBQUMsZ0JBQWdCLENBQUM7aUJBQzFCLE9BQU8sQ0FBQyxjQUFjLENBQUM7aUJBQ3ZCLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUMxRSxJQUFJLENBQUM7Z0JBQ0YsSUFBWSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDN0MsQ0FBQztZQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQSxDQUFDO1FBQ2hCLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUNsQixJQUFJO2lCQUNELFFBQVEsQ0FBQyxhQUFhLENBQUM7aUJBQ3ZCLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztpQkFDekIsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzNFLElBQUksQ0FBQztnQkFDRixJQUFZLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUM3QyxDQUFDO1lBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFBLENBQUM7UUFDaEIsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDL0IsQ0FBQztJQUVhLHNCQUFzQixDQUFDLE1BQWM7O1lBQ2pELE1BQU0sYUFBYSxHQUFHLElBQUksTUFBTSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3ZELElBQUksQ0FBQztnQkFDSCxNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDbkUsSUFBSSxVQUFVLEVBQUUsQ0FBQztvQkFDZixJQUFJLE1BQU0sQ0FBQyxtQkFBbUIsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLGtCQUFrQixDQUFDLENBQUM7Z0JBQzVFLENBQUM7cUJBQU0sQ0FBQztnQkFDUixDQUFDO1lBQ0gsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsSUFBSSxNQUFNLENBQUMscUJBQXFCLENBQUMsQ0FBQztZQUNwQyxDQUFDO29CQUFTLENBQUM7Z0JBQ1QsYUFBYSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3ZCLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFFYSxrQkFBa0IsQ0FBQyxNQUFjOzs7WUFDN0MsTUFBTSxlQUFlLEdBQUcsSUFBSSxNQUFNLENBQUMsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDM0QsSUFBSSxDQUFDO2dCQUNILE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMzRCxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUN4QyxJQUFJLE1BQU0sQ0FBQyxnREFBZ0QsQ0FBQyxDQUFDO29CQUM3RCxlQUFlLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ3ZCLE9BQU87Z0JBQ1QsQ0FBQztnQkFFRCxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNqRSxNQUFNLFNBQVMsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ2pFLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ2xFLE1BQU0sUUFBUSxHQUFHLGVBQWUsUUFBUSxJQUFJLFNBQVMsS0FBSyxDQUFDO2dCQUUzRCxJQUFJLGdCQUFnQixHQUFHLE1BQUEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsb0JBQW9CLDBDQUFFLElBQUksRUFBRSxDQUFDO2dCQUN6RSxJQUFJLFlBQVksR0FBbUIsSUFBSSxDQUFDO2dCQUV4QyxJQUFJLGdCQUFnQixFQUFFLENBQUM7b0JBQ3JCLGdCQUFnQixHQUFHLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO29CQUNuRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO29CQUM1RSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7d0JBQ2xCLElBQUksQ0FBQzs0QkFDSCxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDOzRCQUNwRCxZQUFZLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsZ0JBQWdCLENBQVksQ0FBQzs0QkFDakYsSUFBSSxZQUFZO2dDQUFFLElBQUksTUFBTSxDQUFDLDBCQUEwQixnQkFBZ0IsRUFBRSxDQUFDLENBQUM7d0JBQzdFLENBQUM7d0JBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQzs0QkFDYixJQUFJLE1BQU0sQ0FBQyxxREFBcUQsQ0FBQyxDQUFDOzRCQUNsRSxZQUFZLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7d0JBQzFDLENBQUM7b0JBQ0gsQ0FBQzt5QkFBTSxJQUFJLFlBQVksWUFBWSxPQUFPLEVBQUUsQ0FBQzt3QkFDM0MsWUFBWSxHQUFHLFlBQVksQ0FBQztvQkFDOUIsQ0FBQzt5QkFBTSxDQUFDO3dCQUNOLElBQUksTUFBTSxDQUFDLDJEQUEyRCxDQUFDLENBQUM7d0JBQ3hFLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDMUMsQ0FBQztnQkFDSCxDQUFDO3FCQUFNLENBQUM7b0JBQ04sWUFBWSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUMxQyxDQUFDO2dCQUVELElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztvQkFDbEIsSUFBSSxNQUFNLENBQUMsa0NBQWtDLENBQUMsQ0FBQztvQkFDL0MsZUFBZSxDQUFDLElBQUksRUFBRSxDQUFDO29CQUN2QixPQUFPO2dCQUNULENBQUM7Z0JBRUQsTUFBTSxRQUFRLEdBQUcsYUFBYSxDQUFDLEdBQUcsWUFBWSxDQUFDLElBQUksSUFBSSxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUNuRSxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDcEUsSUFBSSxZQUFZLEVBQUUsQ0FBQztnQkFDbkIsQ0FBQztnQkFFRCxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsZUFBZSxDQUFDLENBQUM7Z0JBQ3BFLElBQUksTUFBTSxDQUFDLG9CQUFvQixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUM5QyxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixJQUFJLE1BQU0sQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO1lBQ3RELENBQUM7b0JBQVMsQ0FBQztnQkFDVCxlQUFlLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDekIsQ0FBQztRQUNILENBQUM7S0FBQTtJQUVhLHNCQUFzQixDQUFDLE1BQWMsRUFBRSxRQUFnQjs7WUFDbkUsSUFBSSxZQUFZLENBQ2QsSUFBSSxDQUFDLEdBQUcsRUFDUix3QkFBd0IsRUFDeEIsd0RBQXdELFFBQVEsbUNBQW1DLEVBQ25HLEdBQVMsRUFBRTtnQkFDVCxNQUFNLGNBQWMsR0FBRyxJQUFJLE1BQU0sQ0FBQyxzQkFBc0IsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDN0QsSUFBSSxDQUFDO29CQUNILE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBRTVFLElBQUksT0FBTyxFQUFFLENBQUM7d0JBQ1osSUFBSSxNQUFNLENBQUMsOEJBQThCLFFBQVEsSUFBSSxDQUFDLENBQUM7b0JBQ3pELENBQUM7eUJBQU0sQ0FBQzt3QkFDTixJQUFJLE1BQU0sQ0FBQyxzQ0FBc0MsUUFBUSxJQUFJLENBQUMsQ0FBQztvQkFDakUsQ0FBQztnQkFDSCxDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ2YsSUFBSSxNQUFNLENBQUMsMEJBQTBCLENBQUMsQ0FBQztnQkFDekMsQ0FBQzt3QkFBUyxDQUFDO29CQUNULGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDeEIsQ0FBQztZQUNILENBQUMsQ0FBQSxDQUNGLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDWCxDQUFDO0tBQUE7SUFFYSx1QkFBdUIsQ0FBQyxNQUFjLEVBQUUsUUFBZ0I7O1lBQ3BFLElBQUksWUFBWSxDQUNkLElBQUksQ0FBQyxHQUFHLEVBQ1IscUJBQXFCLEVBQ3JCLHlDQUF5QyxRQUFRLG1DQUFtQyxFQUNwRixHQUFTLEVBQUU7Z0JBQ1QsTUFBTSxjQUFjLEdBQUcsSUFBSSxNQUFNLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pELElBQUksQ0FBQztvQkFDSCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDakUsSUFBSSxPQUFPLEVBQUUsQ0FBQzt3QkFDWixJQUFJLE1BQU0sQ0FBQyxTQUFTLFFBQVEsWUFBWSxDQUFDLENBQUM7b0JBQzVDLENBQUM7eUJBQU0sQ0FBQztvQkFDUixDQUFDO2dCQUNILENBQUM7Z0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztvQkFDZixJQUFJLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO2dCQUNyQyxDQUFDO3dCQUFTLENBQUM7b0JBQ1QsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN4QixDQUFDO1lBQ0gsQ0FBQyxDQUFBLENBQ0YsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNYLENBQUM7S0FBQTtJQUVPLGdCQUFnQjtRQUN0QixJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWE7WUFBRSxPQUFPLEtBQUssQ0FBQztRQUV0QyxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDO1FBQzdGLElBQUksa0JBQWtCLElBQUksQ0FBQztZQUFFLE9BQU8sS0FBSyxDQUFDO1FBRTFDLE1BQU0sa0JBQWtCLEdBQUcsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUM7UUFDN0UsT0FBTyxrQkFBa0IsSUFBSSxnQkFBZ0IsQ0FBQztJQUNoRCxDQUFDO0lBRU8sOEJBQThCOztRQUNwQyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWE7WUFBRSxPQUFPO1FBRWhDLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUM7UUFDMUMsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUU5QyxNQUFBLElBQUksQ0FBQyxvQkFBb0IsMENBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7UUFFcEYsSUFBSSxhQUFhLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDMUMsTUFBQSxJQUFJLENBQUMsc0JBQXNCLDBDQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUNuRSxDQUFDO0lBQ0gsQ0FBQztJQUVNLHlCQUF5QixDQUFDLGtCQUErQjtRQUM5RCxNQUFNLGNBQWMsR0FBRyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUM7WUFDckYsQ0FBQyxDQUFDLGtCQUFrQjtZQUNwQixDQUFDLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFjLElBQUksV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFFN0UsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3BCLE9BQU87UUFDVCxDQUFDO1FBRUQsTUFBTSxrQkFBa0IsR0FBRyxjQUFjLENBQUMsYUFBYSxDQUFjLElBQUksV0FBVyxDQUFDLG1CQUFtQixFQUFFLENBQUMsQ0FBQztRQUU1RyxNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsYUFBYSxDQUFjLElBQUksV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFFdkYsSUFBSSxDQUFDLGtCQUFrQixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDdEMsT0FBTztRQUNULENBQUM7UUFFRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQztRQUVuRCxNQUFNLGNBQWMsR0FDbEIsSUFBSSxDQUFDLFlBQVk7WUFDakIsY0FBYyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDO1lBQ2hELGNBQWMsQ0FBQyxZQUFZLENBQUMsNEJBQTRCLENBQUM7WUFDekQsa0JBQWtCLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBRTFELElBQUksY0FBYyxFQUFFLENBQUM7WUFDbkIsTUFBTSxjQUFjLEdBQUcsU0FBUyxDQUFDLGFBQWEsQ0FBb0IsSUFBSSxXQUFXLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO1lBQ3RHLGNBQWMsYUFBZCxjQUFjLHVCQUFkLGNBQWMsQ0FBRSxNQUFNLEVBQUUsQ0FBQztZQUN6QixrQkFBa0IsQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztZQUN4QyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLDJCQUEyQixDQUFDLENBQUM7WUFDakUsT0FBTztRQUNULENBQUM7UUFFRCxJQUFJLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNkLE1BQU0sY0FBYyxHQUFHLFNBQVMsQ0FBQyxhQUFhLENBQW9CLElBQUksV0FBVyxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQztZQUN0RyxjQUFjLGFBQWQsY0FBYyx1QkFBZCxjQUFjLENBQUUsTUFBTSxFQUFFLENBQUM7WUFDekIsa0JBQWtCLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7WUFDeEMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1lBQ2pFLE9BQU87UUFDVCxDQUFDO1FBRUQscUJBQXFCLENBQUMsR0FBRyxFQUFFO1lBQ3pCLElBQ0UsQ0FBQyxrQkFBa0I7Z0JBQ25CLENBQUMsa0JBQWtCLENBQUMsV0FBVztnQkFDL0IsQ0FBQyxjQUFjLENBQUMsV0FBVztnQkFDM0IsQ0FBQyxTQUFTLENBQUMsV0FBVztnQkFFdEIsT0FBTztZQUVULElBQUksY0FBYyxHQUFHLFNBQVMsQ0FBQyxhQUFhLENBQW9CLElBQUksV0FBVyxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQztZQUVwRyxNQUFNLHNCQUFzQixHQUFHLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUM7WUFDbEUsa0JBQWtCLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7WUFDeEMsTUFBTSxZQUFZLEdBQUcsa0JBQWtCLENBQUMsWUFBWSxDQUFDO1lBRXJELElBQUksY0FBYyxJQUFJLHNCQUFzQixJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMscUJBQXFCLENBQUMsRUFBRSxDQUFDO2dCQUMxRyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFHLHNCQUFzQixDQUFDO1lBQzlELENBQUM7WUFFRCxJQUFJLFlBQVksR0FBRyxJQUFJLEVBQUUsQ0FBQztnQkFDeEIsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO29CQUNwQixjQUFjLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUU7d0JBQzVDLEdBQUcsRUFBRSxXQUFXLENBQUMsZ0JBQWdCO3FCQUNsQyxDQUFDLENBQUM7b0JBRUgsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFO3dCQUNsRCxJQUFJLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQzs0QkFDekUsY0FBZSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQzt3QkFDdkQsQ0FBQzs2QkFBTSxDQUFDOzRCQUNOLGNBQWUsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLHFCQUFxQixDQUFDLENBQUM7d0JBQzFELENBQUM7d0JBQ0QsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGtCQUFrQixFQUFFLGNBQWUsQ0FBQyxDQUFDO29CQUNsRSxDQUFDLENBQUMsQ0FBQztvQkFDSCxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFHLEdBQUcsSUFBSSxJQUFJLENBQUM7b0JBQ2pELGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUM7b0JBQ2hFLGNBQWMsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQ3hDLENBQUM7cUJBQU0sQ0FBQztvQkFDTixJQUFJLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQzt3QkFDekUsY0FBYyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztvQkFDeEMsQ0FBQzt5QkFBTSxDQUFDO3dCQUNOLGNBQWMsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUM7b0JBQ3hDLENBQUM7Z0JBQ0gsQ0FBQztZQUNILENBQUM7aUJBQU0sQ0FBQztnQkFDTixJQUFJLGNBQWMsRUFBRSxDQUFDO29CQUNuQixjQUFjLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQzFCLENBQUM7Z0JBQ0Qsa0JBQWtCLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7Z0JBQ3hDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUM7WUFDckUsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVZLG9CQUFvQixDQUFDLGVBQXVCLEVBQUUsUUFBMkI7OztZQUNwRixNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDO1lBRXZFLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO2dCQUN4QixJQUFJLE1BQU0sQ0FBQyxrRkFBa0YsQ0FBQyxDQUFDO2dCQUMvRixPQUFPO1lBQ1QsQ0FBQztZQUVELElBQUksZUFBZSxHQUFHLGVBQWUsQ0FBQztZQUN0QyxJQUFJLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxhQUFhLENBQUMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDeEcsZUFBZSxHQUFHLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLENBQUM7cUJBQ2hFLE9BQU8sQ0FBQywyQkFBMkIsRUFBRSxFQUFFLENBQUM7cUJBQ3hDLElBQUksRUFBRSxDQUFDO1lBQ1osQ0FBQztZQUVELElBQUksQ0FBQyxlQUFlLElBQUksZUFBZSxDQUFDLE1BQU0sR0FBRyxFQUFFLEVBQUUsQ0FBQztnQkFDcEQsSUFBSSxNQUFNLENBQUMsaURBQWlELENBQUMsQ0FBQztnQkFDOUQsT0FBTztZQUNULENBQUM7WUFFRCxNQUFNLFlBQVksR0FBRyxDQUFBLE1BQUEsUUFBUSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsMENBQUUsWUFBWSxDQUFDLFdBQVcsQ0FBQyxLQUFJLGFBQWEsQ0FBQztZQUNyRyxPQUFPLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzVCLFFBQVEsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQ3pCLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUM7WUFDckMsUUFBUSxDQUFDLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQztZQUNsQyxRQUFRLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFFdEMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1lBRXBDLElBQUksQ0FBQztnQkFDSCxNQUFNLE1BQU0sR0FBRyw0REFBNEQsZUFBZSxtQkFBbUIsQ0FBQztnQkFDOUcsTUFBTSxXQUFXLEdBQUc7b0JBQ2xCLEtBQUssRUFBRSxrQkFBa0I7b0JBQ3pCLE1BQU0sRUFBRSxNQUFNO29CQUNkLE1BQU0sRUFBRSxLQUFLO29CQUNiLFdBQVcsRUFBRSxHQUFHO29CQUNoQixPQUFPLEVBQUU7d0JBQ1AsT0FBTyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYTtxQkFDL0Y7aUJBQ0YsQ0FBQztnQkFFRixNQUFNLFlBQVksR0FBMkIsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBRXRHLElBQUksWUFBWSxJQUFJLFlBQVksQ0FBQyxRQUFRLEVBQUUsQ0FBQztvQkFDMUMsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxZQUFZLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3hGLENBQUM7cUJBQU0sQ0FBQztvQkFDTixNQUFNLElBQUksS0FBSyxDQUFDLG1EQUFtRCxDQUFDLENBQUM7Z0JBQ3ZFLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztnQkFDcEIsSUFBSSxXQUFXLEdBQUcsd0JBQXdCLENBQUM7Z0JBQzNDLElBQUksS0FBSyxZQUFZLEtBQUssRUFBRSxDQUFDO29CQUMzQixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDO3dCQUNuRyxXQUFXLElBQUksVUFBVSxrQkFBa0IsY0FBYyxDQUFDO29CQUM1RCxDQUFDO3lCQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQzt3QkFDaEYsV0FBVyxJQUFJLHFDQUFxQyxDQUFDO29CQUN2RCxDQUFDO3lCQUFNLENBQUM7d0JBQ04sV0FBVyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUM7b0JBQy9CLENBQUM7Z0JBQ0gsQ0FBQztxQkFBTSxDQUFDO29CQUNOLFdBQVcsSUFBSSx5QkFBeUIsQ0FBQztnQkFDM0MsQ0FBQztnQkFDRCxJQUFJLE1BQU0sQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDaEMsQ0FBQztvQkFBUyxDQUFDO2dCQUNULE9BQU8sQ0FBQyxRQUFRLEVBQUUsWUFBWSxDQUFDLENBQUM7Z0JBQ2hDLFFBQVEsQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO2dCQUMxQixRQUFRLENBQUMsS0FBSyxHQUFHLGFBQWEsQ0FBQztnQkFDL0IsUUFBUSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUN6QyxRQUFRLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDekMsQ0FBQztRQUNILENBQUM7S0FBQTtJQUVEOzs7O09BSUc7SUFDSyx3QkFBd0IsQ0FBQyxZQUFxQjtRQUNwRCxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWE7WUFBRSxPQUFPO1FBRWhDLE1BQU0sZUFBZSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUMzRCxJQUFJLGVBQWUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDakMsT0FBTztRQUNULENBQUM7UUFDRCxNQUFNLFVBQVUsR0FBRyxlQUFlLENBQUMsTUFBTSxDQUFDO1FBQzFDLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFbEQsSUFBSSxPQUFvQixDQUFDO1FBQ3pCLElBQUksZ0JBQWdCLEdBQXVCLElBQUksQ0FBQztRQUVoRCxJQUFJLFlBQVksSUFBSSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUMzQyxPQUFPLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDO1lBRWpDLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxvQkFBb0IsRUFBRSxDQUFDLENBQUM7WUFDckUsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO2dCQUNyQixnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUMzQixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sT0FBTztZQUNULENBQUM7WUFDRCxJQUFJLENBQUMseUJBQXlCLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMvRCxDQUFDO2FBQU0sQ0FBQztZQUNOLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsbUJBQW1CLEdBQUcsS0FBSyxDQUFDO1lBRWpDLE1BQU0sUUFBUSxHQUFHLElBQUksb0JBQW9CLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNsRixPQUFPLEdBQUcsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzVCLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxvQkFBb0IsRUFBRSxDQUFDLENBQUM7WUFFckUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDeEMsSUFBSSxDQUFDLGlCQUFpQixHQUFHLE9BQU8sQ0FBQztZQUNqQyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsT0FBTyxDQUFDO1FBQ3BDLENBQUM7UUFFRCxJQUFJLGdCQUFnQixFQUFFLENBQUM7WUFDckIsSUFBSSxVQUFVLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3JCLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDOUMsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyw2QkFBNkIsVUFBVSxtQkFBbUIsQ0FBQyxDQUFDO2dCQUNyRixJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7b0JBQzlCLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxPQUFPLEVBQUUsZUFBZSxDQUFDLENBQUM7Z0JBQzNELENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBRU8seUJBQXlCLENBQUMsT0FBb0IsRUFBRSxTQUFlO1FBQ3JFLE9BQU8sQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLEVBQUUsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDdkUsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZFLElBQUksV0FBVyxFQUFFLENBQUM7WUFDaEIsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDbEQsQ0FBQztJQUNILENBQUM7SUFFYSx5QkFBeUIsQ0FBQyxrQkFBK0IsRUFBRSxNQUFpQjs7WUFDeEYsTUFBTSwwQkFBMEIsR0FBRyxLQUFLLENBQUM7WUFFekMsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUM7Z0JBQ2hDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxrQkFBa0IsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFFMUQsT0FBTztZQUNULENBQUM7WUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsc0JBQXNCLElBQUksSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7Z0JBQzdFLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0I7b0JBQzlDLElBQUksSUFBSSxDQUFDLG1CQUFtQjt3QkFBRSxJQUFJLENBQUMsd0JBQXdCLENBQUMsa0JBQWtCLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzFGLE9BQU87WUFDVCxDQUFDO1lBRUQsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztZQUVoQyxJQUFJLENBQUM7Z0JBQ0gsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNuRCxNQUFNLGdCQUFnQixHQUFHLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxJQUFJLFdBQVcsQ0FBQyxVQUFVLEVBQUUsQ0FBZ0IsQ0FBQztnQkFFdkcsSUFBSSxDQUFDLGdCQUFnQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLENBQUM7b0JBQ3ZELE9BQU87Z0JBQ1QsQ0FBQztnQkFFRCxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFFekIsSUFBSSxPQUFPLEVBQUUsQ0FBQztvQkFDWixnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsdUNBQXVDLE9BQU8sRUFBRSxDQUFDLENBQUM7Z0JBQzdFLENBQUM7cUJBQU0sQ0FBQztvQkFDTixJQUFJLENBQUMsd0JBQXdCLENBQUMsa0JBQWtCLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzVELENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixJQUFJLENBQUMsd0JBQXdCLENBQUMsa0JBQWtCLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDNUQsQ0FBQztvQkFBUyxDQUFDO2dCQUNULElBQUksQ0FBQyxtQkFBbUIsR0FBRyxLQUFLLENBQUM7WUFDbkMsQ0FBQztRQUNILENBQUM7S0FBQTtJQUVPLHdCQUF3QixDQUFDLGtCQUErQixFQUFFLE1BQWlCO1FBQ2pGLE1BQU0sZ0JBQWdCLEdBQUcsa0JBQWtCLENBQUMsYUFBYSxDQUFDLElBQUksV0FBVyxDQUFDLFVBQVUsRUFBRSxDQUFnQixDQUFDO1FBRXZHLElBQUksQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3ZELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN0QyxDQUFDO1lBQ0QsT0FBTztRQUNULENBQUM7UUFFRCxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN6QixNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzVFLGdCQUFnQixDQUFDLFNBQVMsQ0FBQztZQUN6QixJQUFJLEVBQUUsNkJBQTZCLE1BQU0sQ0FBQyxNQUFNLFdBQVcsWUFBWSxDQUFDLE1BQU0sV0FBVztZQUN6RixHQUFHLEVBQUUsc0JBQXNCO1NBQzVCLENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvQyxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDL0IsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsTUFBTSxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFHLE1BQU0sQ0FBQztRQUVoQyxZQUFZLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQzlCLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkMsUUFBUSxDQUFDLFdBQVcsR0FBRyxRQUFRLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsd0JBQXdCLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFRDs7OztPQUlHO0lBQ1csZUFBZSxDQUFDLE1BQWlCOzs7WUFDN0MsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsc0JBQXNCLENBQUM7WUFDOUQsSUFBSSxDQUFDLFNBQVM7Z0JBQUUsT0FBTyxJQUFJLENBQUM7WUFFNUIsSUFBSSxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUM7Z0JBQUUsT0FBTyxDQUFBLE1BQUEsTUFBTSxDQUFDLENBQUMsQ0FBQywwQ0FBRSxPQUFPLEtBQUksSUFBSSxDQUFDO1lBRXpELE1BQU0sbUJBQW1CLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNuRixNQUFNLFVBQVUsR0FBRyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxTQUFTLEtBQUssR0FBRyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDcEcsTUFBTSxNQUFNLEdBQUcscUNBQXFDLG1CQUFtQixDQUFDLE1BQU0saUZBQWlGLFVBQVUsY0FBYyxDQUFDO1lBRXhMLE1BQU0sV0FBVyxHQUFHO2dCQUNsQixLQUFLLEVBQUUsU0FBUztnQkFDaEIsTUFBTSxFQUFFLE1BQU07Z0JBQ2QsTUFBTSxFQUFFLEtBQUs7Z0JBQ2IsV0FBVyxFQUFFLEdBQUc7Z0JBQ2hCLE9BQU8sRUFBRTtvQkFDUCxPQUFPLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhO2lCQUMvRjtnQkFDRCxNQUFNLEVBQUUsa0dBQWtHO2FBQzNHLENBQUM7WUFFRixJQUFJLENBQUM7Z0JBQ0gsTUFBTSxZQUFZLEdBQTJCLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUN0RyxJQUFJLFlBQVksSUFBSSxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQzFDLE9BQU8sWUFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDdEMsQ0FBQztxQkFBTSxDQUFDO29CQUNOLE9BQU8sSUFBSSxDQUFDO2dCQUNkLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixPQUFPLElBQUksQ0FBQztZQUNkLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFFTyxrQkFBa0IsQ0FBQyxZQUFxQjtRQUM5QyxJQUFJLFlBQVksQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUM7WUFDbEMsT0FBTztRQUNULENBQUM7UUFDRCxJQUFJLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2pELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixLQUFLLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEtBQUssSUFBSSxDQUFDO1FBQ2hILElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7WUFDOUIsSUFBSSxDQUFDLHdCQUF3QixHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDakQsQ0FBQztRQUNELElBQUksQ0FBQztZQUNILElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ25ELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsSUFBSSxDQUFDO1lBQ0wsQ0FBQztZQUFDLFdBQU0sQ0FBQyxDQUFBLENBQUM7UUFDWixDQUFDO0lBQ0gsQ0FBQztJQUVLLFdBQVc7OztZQUNmLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hELE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBRXRDLElBQUksQ0FBQyxhQUFhLElBQUksSUFBSSxDQUFDLFlBQVksSUFBSSxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztnQkFDdkUsSUFBSSxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxzQkFBc0I7b0JBQ2xELElBQUksTUFBTSxDQUFDLDBDQUEwQyxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUMvRCxPQUFPO1lBQ1QsQ0FBQztZQUVELElBQUksVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDL0QsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNoQixVQUFVLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDM0QsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUNoQixJQUFJLE1BQU0sQ0FBQyxpREFBaUQsQ0FBQyxDQUFDO29CQUM5RCxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUM1QixPQUFPO2dCQUNULENBQUM7Z0JBQ0QsSUFBSSxNQUFNLENBQUMscUJBQXFCLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUM5RCxDQUFDO1lBQ0QsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1lBRXhDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUMsc0JBQXNCLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUNwRCxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNCLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUV0QixNQUFNLHNCQUFzQixHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUUxQyxJQUFJLG9CQUFvQixHQUFHLElBQUksQ0FBQztZQUNoQyxNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUM7WUFDbkIsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsSUFBSSxnQ0FBZ0MsR0FBa0Isc0JBQXNCLENBQUM7WUFFN0UsSUFBSSxDQUFDO2dCQUNILE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyw0QkFBNEIsQ0FDakYsYUFBYSxFQUNiLG9CQUFvQixFQUNwQixrQkFBa0IsQ0FDbkIsQ0FBQztnQkFDRixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztvQkFDdEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxnREFBZ0QsQ0FBQyxDQUFDO2dCQUNwRSxDQUFDO2dCQUVELElBQUksZUFBZSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztnQkFFMUUsT0FBTyxvQkFBb0IsSUFBSSxLQUFLLEdBQUcsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDL0YsS0FBSyxFQUFFLENBQUM7b0JBQ1IsTUFBTSx3QkFBd0IsR0FBRyxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO29CQUNuRixnQ0FBZ0MsR0FBRyx3QkFBd0IsQ0FBQztvQkFFNUQsSUFBSSxDQUFDLGtCQUFrQixDQUFDLHdCQUF3QixFQUFFLGtCQUFrQixDQUFDLENBQUM7b0JBRXRFLGVBQWUsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLG1CQUFtQixFQUFFLENBQUM7b0JBRXRFLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLDBCQUEwQixDQUNwRSxlQUFlLEVBQ2YsSUFBSSxDQUFDLHNCQUFzQixDQUFDLE1BQU0sQ0FDbkMsQ0FBQztvQkFFRixNQUFNLEVBQUUsa0JBQWtCLEVBQUUsZUFBZSxFQUFFLCtCQUErQixFQUFFLEdBQUcsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQzNHLFNBQVMsRUFDVCx3QkFBd0IsRUFDeEIsa0JBQWtCLENBQ25CLENBQUM7b0JBRUYsSUFBSSxJQUFJLENBQUMsc0JBQXNCLENBQUMsTUFBTSxDQUFDLE9BQU87d0JBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO29CQUVuRixNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FDbEQsZUFBZSxFQUNmLCtCQUErQixFQUMvQixrQkFBa0IsRUFDbEIsd0JBQXdCLEVBQ3hCLGtCQUFrQixDQUNuQixDQUFDO29CQUVGLElBQ0UsbUJBQW1CLENBQUMsMEJBQTBCO3dCQUM5QyxtQkFBbUIsQ0FBQywwQkFBMEIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUN6RCxDQUFDO3dCQUNELE1BQU0sSUFBSSxDQUFDLDBCQUEwQixDQUNuQyxtQkFBbUIsQ0FBQywwQkFBMEIsRUFDOUMsbUJBQW1CLENBQUMsMEJBQTBCLEVBQzlDLGtCQUFrQixDQUNuQixDQUFDO3dCQUVGLGVBQWUsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLG1CQUFtQixFQUFFLENBQUM7d0JBQ3RFLG9CQUFvQixHQUFHLElBQUksQ0FBQztvQkFDOUIsQ0FBQzt5QkFBTSxDQUFDO3dCQUNOLE1BQU0sSUFBSSxDQUFDLHlCQUF5QixDQUFDLGtCQUFrQixFQUFFLHdCQUF3QixFQUFFLGtCQUFrQixDQUFDLENBQUM7d0JBQ3ZHLG9CQUFvQixHQUFHLEtBQUssQ0FBQztvQkFDL0IsQ0FBQztnQkFDSCxDQUFDO2dCQUVELElBQUksS0FBSyxJQUFJLFFBQVEsRUFBRSxDQUFDO29CQUN0QixNQUFNLG9CQUFvQixHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7b0JBQ3hDLE1BQU0sV0FBVyxHQUFZO3dCQUMzQixJQUFJLEVBQUUsUUFBUTt3QkFDZCxPQUFPLEVBQ0wsdUdBQXVHO3dCQUN6RyxTQUFTLEVBQUUsb0JBQW9CO3FCQUNoQyxDQUFDO29CQUVGLE1BQU0sVUFBVSxHQUFHLElBQUksT0FBTyxDQUFPLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO3dCQUN2RCxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQzt3QkFDOUYsVUFBVSxDQUFDLEdBQUcsRUFBRTs0QkFDZCxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQztnQ0FDdkYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMseUJBQXlCLENBQy9DLFdBQVcsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLEVBQy9CLCtCQUErQixDQUNoQyxDQUFDOzRCQUNKLENBQUM7d0JBQ0gsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUNaLENBQUMsQ0FBQyxDQUFDO29CQUNILE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsNkJBQTZCLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUMvRSxJQUFJLENBQUM7d0JBQ0gsTUFBTSxVQUFVLENBQUM7b0JBQ25CLENBQUM7b0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQyxDQUFBLENBQUM7Z0JBQ3BCLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztnQkFDcEIsSUFDRSxJQUFJLENBQUMsaUJBQWlCO29CQUN0QixDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLEtBQUssc0JBQXNCO3dCQUMxRCxDQUFDLGdDQUFnQyxLQUFLLElBQUk7NEJBQ3hDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLEtBQUssZ0NBQWdDLENBQUMsQ0FBQztvQkFDM0UsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxFQUNoRSxDQUFDO29CQUNELElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxXQUFXO3dCQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQzFGLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQztnQkFFOUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMseUJBQXlCLENBQy9DLG9CQUFvQixDQUFDLE9BQU8sRUFBRSxFQUM5QiwwQ0FBMEMsa0JBQWtCLEVBQUUsQ0FDL0QsQ0FBQztnQkFDRixJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyx5QkFBeUIsQ0FDL0Msc0JBQXNCLEVBQ3RCLDBDQUEwQyxrQkFBa0IsRUFBRSxDQUMvRCxDQUFDO2dCQUNGLElBQUksZ0NBQWdDLEtBQUssSUFBSSxFQUFFLENBQUM7b0JBQzlDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHlCQUF5QixDQUMvQyxnQ0FBZ0MsRUFDaEMsMENBQTBDLGtCQUFrQixFQUFFLENBQy9ELENBQUM7Z0JBQ0osQ0FBQztnQkFFRCxJQUFJLGVBQXVCLENBQUM7Z0JBQzVCLElBQUksWUFBWSxHQUFnQixPQUFPLENBQUM7Z0JBQ3hDLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxZQUFZLEtBQUksTUFBQSxLQUFLLENBQUMsT0FBTywwQ0FBRSxRQUFRLENBQUMsaUJBQWlCLENBQUMsQ0FBQSxFQUFFLENBQUM7b0JBQzlFLGVBQWUsR0FBRyw2QkFBNkIsQ0FBQztvQkFDaEQsWUFBWSxHQUFHLFFBQVEsQ0FBQztnQkFDMUIsQ0FBQztxQkFBTSxDQUFDO29CQUNOLGVBQWUsR0FBRyxVQUFVLEtBQUssQ0FBQyxPQUFPLElBQUksa0NBQWtDLEVBQUUsQ0FBQztvQkFDbEYsSUFBSSxNQUFNLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUNwQyxDQUFDO2dCQUNELE1BQU0scUJBQXFCLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztnQkFDekMsTUFBTSxlQUFlLEdBQVk7b0JBQy9CLElBQUksRUFBRSxZQUFZO29CQUNsQixPQUFPLEVBQUUsZUFBZTtvQkFDeEIsU0FBUyxFQUFFLHFCQUFxQjtpQkFDakMsQ0FBQztnQkFFRixNQUFNLGVBQWUsR0FBRyxJQUFJLE9BQU8sQ0FBTyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtvQkFDNUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7b0JBQ2xHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7d0JBQ2QsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUM7NEJBQzNGLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHlCQUF5QixDQUMvQyxlQUFlLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUNuQyxtQ0FBbUMsQ0FDcEMsQ0FBQzt3QkFDSixDQUFDO29CQUNILENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDWixDQUFDLENBQUMsQ0FBQztnQkFDSCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLDZCQUE2QixDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDbkYsSUFBSSxDQUFDO29CQUNILE1BQU0sZUFBZSxDQUFDO2dCQUN4QixDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUMsQ0FBQSxDQUFDO1lBQ3BCLENBQUM7b0JBQVMsQ0FBQztnQkFDVCxJQUFJLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztvQkFDL0YsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLFdBQVc7d0JBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDMUYsQ0FBQztnQkFDRCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO2dCQUU5QixJQUFJLENBQUMsc0JBQXNCLEdBQUcsSUFBSSxDQUFDO2dCQUVuQyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM1QixxQkFBcUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO2dCQUMxRCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDcEIsQ0FBQztRQUNILENBQUM7S0FBQTtJQTREYSxrQkFBa0IsQ0FBQyxJQUEwQzs7O1lBQ3pFLE1BQU0sYUFBYSxHQUFHLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxPQUFPLENBQUM7WUFDcEMsTUFBTSxzQkFBc0IsR0FBRyxNQUFBLGFBQWEsYUFBYixhQUFhLHVCQUFiLGFBQWEsQ0FBRSxTQUFTLDBDQUFFLE9BQU8sRUFBRSxDQUFDO1lBQ25FLE1BQU0saUJBQWlCLEdBQUcsYUFBYSxhQUFiLGFBQWEsdUJBQWIsYUFBYSxDQUFFLElBQW1CLENBQUM7WUFDN0QsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBRTlCLElBQUksQ0FBQztnQkFDSCxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUMzQixJQUFJLHNCQUFzQjt3QkFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO29CQUM5RixPQUFPO2dCQUNULENBQUM7Z0JBRUQsTUFBTSxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDO2dCQUM5QyxNQUFNLGtCQUFrQixHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBRXZELElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDcEQsSUFBSSxzQkFBc0I7d0JBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztvQkFDOUYsT0FBTztnQkFDVCxDQUFDO2dCQUVELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUMvRCxJQUFJLFdBQVcsS0FBSyxZQUFZLEVBQUUsQ0FBQztvQkFDakMsSUFBSSxzQkFBc0I7d0JBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztvQkFDOUYsT0FBTztnQkFDVCxDQUFDO2dCQUVELE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQzlELElBQUksV0FBVyxDQUFDLGFBQWEsc0NBQXNDLGtCQUFrQixJQUFJLENBQzFGLENBQUM7Z0JBQ0YsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO29CQUM1QixJQUFJLHNCQUFzQjt3QkFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO29CQUM5RixPQUFPO2dCQUNULENBQUM7Z0JBRUQsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FDbkQsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxLQUFLLGtCQUFrQixJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssT0FBTyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsT0FBTyxLQUFLLE9BQU8sQ0FBQyxPQUFPLENBQzlHLENBQUM7Z0JBRUYsTUFBTSxvQ0FBb0MsR0FDeEMsT0FBTyxDQUFDLElBQUksS0FBSyxXQUFXLElBQUksQ0FBQSxNQUFBLElBQUksQ0FBQyxpQkFBaUIsMENBQUUsU0FBUyxNQUFLLGtCQUFrQixDQUFDO2dCQUUzRixJQUFJLG1CQUFtQixJQUFJLENBQUMsb0NBQW9DLEVBQUUsQ0FBQztvQkFDakUsSUFBSSxzQkFBc0I7d0JBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztvQkFDOUYsT0FBTztnQkFDVCxDQUFDO2dCQUNELElBQUksbUJBQW1CLElBQUksb0NBQW9DLEVBQUUsQ0FBQztnQkFDbEUsQ0FBQztnQkFFRCxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztvQkFDekIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3JDLENBQUM7Z0JBRUQsSUFBSSxvQ0FBb0MsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztvQkFDbkUsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUM7b0JBRW5ELElBQ0UsQ0FBQSxNQUFBLG1CQUFtQixDQUFDLE9BQU8sMENBQUUsV0FBVzt3QkFDeEMsbUJBQW1CLENBQUMsU0FBUzt3QkFDN0IsbUJBQW1CLENBQUMsY0FBYyxFQUNsQyxDQUFDO3dCQUNELG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO3dCQUM1RCxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLDRCQUE0QixDQUFDLENBQUM7d0JBQzFFLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLEVBQUUsa0JBQWtCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQzt3QkFFMUYsTUFBTSxpQkFBaUIsR0FBRyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUNqRSxJQUFJLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FDSixDQUFDO3dCQUV4QixJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQzs0QkFDdkIsSUFBSSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsV0FBVztnQ0FBRSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7NEJBQ2xGLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7NEJBQzlCLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxDQUFDO3dCQUN6QyxDQUFDOzZCQUFNLENBQUM7NEJBQ04sbUJBQW1CLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsQ0FBQzs0QkFDakUsTUFBTSxNQUFNLEdBQUcsbUJBQW1CLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxJQUFJLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDOzRCQUM1RixJQUFJLE1BQU0sRUFBRSxDQUFDO2dDQUNYLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQzs0QkFDbEIsQ0FBQzs0QkFFRCxJQUFJLENBQUM7Z0NBQ0gsTUFBTSxjQUFjLEdBQUcsd0JBQXdCLENBQUMscUJBQXFCLENBQ25FLE9BQU8sQ0FBQyxPQUFPLElBQUksRUFBRSxFQUNyQixPQUEyQixFQUMzQixJQUFJLENBQUMsTUFBTSxFQUNYLElBQUksQ0FDTCxDQUFDO2dDQUVGLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQ0FFdEMsTUFBTSxhQUFhLENBQUMscUJBQXFCLENBQ3ZDLElBQUksQ0FBQyxHQUFHLEVBQ1IsSUFBSSxFQUNKLElBQUksQ0FBQyxNQUFNLEVBQ1gsbUJBQW1CLENBQUMsU0FBUyxFQUM3QixjQUFjLENBQ2YsQ0FBQztnQ0FFRix3QkFBd0IsQ0FBQyx5QkFBeUIsQ0FDaEQsaUJBQWlCLEVBQ2pCLG1CQUFtQixDQUFDLFNBQVMsRUFDN0IsT0FBMkIsRUFDM0IsSUFBSSxDQUFDLE1BQU0sRUFDWCxJQUFJLENBQ0wsQ0FBQztnQ0FDRixtQkFBbUIsQ0FBQyxZQUFZLENBQUMsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztnQ0FFN0UsSUFBSSxDQUFDLGtCQUFrQixHQUFHLG1CQUFtQixDQUFDLE9BQU8sQ0FBQztnQ0FDdEQsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO2dDQUV0QixNQUFNLHdCQUF3QixHQUFHLG1CQUFtQixDQUFDLE9BQU8sQ0FBQztnQ0FDN0QsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQztnQ0FFOUIsVUFBVSxDQUFDLEdBQUcsRUFBRTtvQ0FDZCxJQUFJLHdCQUF3QixJQUFJLHdCQUF3QixDQUFDLFdBQVcsRUFBRSxDQUFDO3dDQUNyRSxJQUFJLENBQUMseUJBQXlCLENBQUMsd0JBQXdCLENBQUMsQ0FBQztvQ0FDM0QsQ0FBQztnQ0FDSCxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0NBQ1AsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQzs0QkFDM0MsQ0FBQzs0QkFBQyxPQUFPLFdBQWdCLEVBQUUsQ0FBQztnQ0FDMUIsSUFBSSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsV0FBVztvQ0FBRSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7Z0NBQ2xGLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7Z0NBQzlCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQztvQ0FDdEIsSUFBSSxFQUFFLE9BQU87b0NBQ2IsT0FBTyxFQUFFLHFDQUFxQyxrQkFBa0IsS0FBSyxXQUFXLENBQUMsT0FBTyxFQUFFO29DQUMxRixTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUU7aUNBQ3RCLENBQUMsQ0FBQzs0QkFDTCxDQUFDO3dCQUNILENBQUM7b0JBQ0gsQ0FBQzt5QkFBTSxDQUFDO3dCQUNOLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7d0JBQzlCLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUN6QyxDQUFDO2dCQUNILENBQUM7cUJBQU0sQ0FBQztvQkFDTixNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDekMsQ0FBQztZQUNILENBQUM7WUFBQyxPQUFPLFVBQWUsRUFBRSxDQUFDO2dCQUN6QixJQUFJLENBQUMsa0JBQWtCLENBQUM7b0JBQ3RCLElBQUksRUFBRSxPQUFPO29CQUNiLE9BQU8sRUFBRSw0Q0FBNEMsaUJBQWlCLFlBQVksc0JBQXNCLE1BQU0sVUFBVSxDQUFDLE9BQU8sRUFBRTtvQkFDbEksU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFO2lCQUN0QixDQUFDLENBQUM7WUFDTCxDQUFDO29CQUFTLENBQUM7Z0JBQ1QsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO29CQUMzQixJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO2dCQUNwRSxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7S0FBQTtJQUVZLHFCQUFxQixDQUFDLFdBQW9COzs7WUFDckQsSUFBSSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQ3hCLElBQUksTUFBTSxDQUFDLG1EQUFtRCxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUN0RSxPQUFPO1lBQ1QsQ0FBQztZQUVELElBQUksSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7Z0JBQ2hDLElBQUksTUFBTSxDQUFDLHdFQUF3RSxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUMzRixPQUFPO1lBQ1QsQ0FBQztZQUVELE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQSxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVywwQ0FBRSxhQUFhLEVBQUUsQ0FBQSxDQUFDO1lBQ2xFLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDaEIsSUFBSSxNQUFNLENBQUMsMENBQTBDLENBQUMsQ0FBQztnQkFDdkQsT0FBTztZQUNULENBQUM7WUFDRCxNQUFNLE1BQU0sR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUN0QyxNQUFNLFlBQVksR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FDaEQsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxLQUFLLFdBQVcsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxXQUFXLENBQUMsSUFBSSxDQUNwRyxDQUFDO1lBRUYsSUFBSSxZQUFZLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDeEIsSUFBSSxNQUFNLENBQUMsdURBQXVELENBQUMsQ0FBQztnQkFDcEUsT0FBTztZQUNULENBQUM7WUFFRCxNQUFNLGdCQUFnQixHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLFlBQVksR0FBRyxDQUFDLENBQUM7WUFFdkUsSUFBSSxZQUFZLENBQ2QsSUFBSSxDQUFDLEdBQUcsRUFDUixzQkFBc0IsRUFDdEIsZ0JBQWdCO2dCQUNkLENBQUMsQ0FBQyx3RkFBd0Y7Z0JBQzFGLENBQUMsQ0FBQywwQ0FBMEMsRUFDOUMsR0FBUyxFQUFFOzs7Z0JBQ1QsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUM7Z0JBQzNCLE1BQU0sNEJBQTRCLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFFMUQsSUFBSSxDQUFDLHNCQUFzQixHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7Z0JBQ3BELElBQUksbUJBQW1CLEdBQUcsRUFBRSxDQUFDO2dCQUM3QixNQUFNLGlCQUFpQixHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7Z0JBQ3JDLE1BQU0sbUJBQW1CLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBRXhELElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBRTNCLElBQUksbUJBQW1CLEdBQWlCLElBQUksQ0FBQztnQkFDN0MsSUFBSSxvQ0FBK0QsQ0FBQztnQkFFcEUsSUFBSSxDQUFDO29CQUNILElBQUksZ0JBQWdCLEVBQUUsQ0FBQzt3QkFDckIsTUFBTSxhQUFhLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsWUFBWSxDQUFDLENBQUM7d0JBQzlGLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQzs0QkFDbkIsTUFBTSxJQUFJLEtBQUssQ0FBQyx3REFBd0QsQ0FBQyxDQUFDO3dCQUM1RSxDQUFDO29CQUNILENBQUM7b0JBRUQsTUFBTSxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztvQkFDdEMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFFeEMsTUFBTSwyQkFBMkIsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQzt3QkFDL0QsR0FBRyxFQUFFLEdBQUcsV0FBVyxDQUFDLGFBQWEsSUFBSSxXQUFXLENBQUMsWUFBWSxjQUFjO3FCQUM1RSxDQUFDLENBQUM7b0JBQ0gsMkJBQTJCLENBQUMsWUFBWSxDQUFDLDRCQUE0QixFQUFFLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7b0JBQ3ZHLGFBQWEsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLDJCQUEyQixFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUN0RixNQUFNLGdCQUFnQixHQUFHLDJCQUEyQixDQUFDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7b0JBQzNGLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDO29CQUNuQyxNQUFNLHVCQUF1QixHQUFHLGdCQUFnQixDQUFDLFNBQVMsQ0FBQzt3QkFDekQsR0FBRyxFQUFFLEdBQUcsV0FBVyxDQUFDLE9BQU8sSUFBSSxXQUFXLENBQUMsY0FBYyxFQUFFO3FCQUM1RCxDQUFDLENBQUM7b0JBQ0gsTUFBTSxnQkFBZ0IsR0FBRyx1QkFBdUIsQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsV0FBVyxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQztvQkFDbkcsTUFBTSxrQkFBa0IsR0FBRyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUM7d0JBQ3BELEdBQUcsRUFBRSxHQUFHLFdBQVcsQ0FBQyxPQUFPLElBQUksV0FBVyxDQUFDLG1CQUFtQixpQkFBaUI7cUJBQ2hGLENBQUMsQ0FBQztvQkFDSCxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDM0IsTUFBTSxJQUFJLEdBQUcsa0JBQWtCLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDO29CQUM5RSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRTt3QkFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLFdBQVcsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO29CQUU5RSxJQUFJLDJCQUEyQixJQUFJLGtCQUFrQixJQUFJLGdCQUFnQixFQUFFLENBQUM7d0JBQzFFLElBQUksQ0FBQyxpQkFBaUIsR0FBRzs0QkFDdkIsU0FBUyxFQUFFLG1CQUFtQjs0QkFDOUIsT0FBTyxFQUFFLDJCQUEyQjs0QkFDcEMsU0FBUyxFQUFFLGtCQUFrQjs0QkFDN0IsY0FBYyxFQUFFLGdCQUFnQjt5QkFDakMsQ0FBQztvQkFDSixDQUFDO3lCQUFNLENBQUM7d0JBQ04sTUFBTSxJQUFJLEtBQUssQ0FBQyx5REFBeUQsQ0FBQyxDQUFDO29CQUM3RSxDQUFDO29CQUNELDJCQUEyQixDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLENBQUM7b0JBQ3hFLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQywyQkFBMkIsYUFBM0IsMkJBQTJCLHVCQUEzQiwyQkFBMkIsQ0FBRSxTQUFTLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUNuRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUV4QyxNQUFNLGdCQUFnQixHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUN2RSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQzt3QkFDdEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxnRUFBZ0UsQ0FBQyxDQUFDO29CQUNwRixDQUFDO29CQUVELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLDBCQUEwQixDQUNqRSxnQkFBZ0IsRUFDaEIsSUFBSSxDQUFDLHNCQUFzQixDQUFDLE1BQU0sQ0FDbkMsQ0FBQztvQkFFRixJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUM7O3dCQUN0QixLQUEwQixlQUFBLFdBQUEsY0FBQSxNQUFNLENBQUEsWUFBQSw0RUFBRSxDQUFDOzRCQUFULHNCQUFNOzRCQUFOLFdBQU07NEJBQXJCLE1BQU0sS0FBSyxLQUFBLENBQUE7NEJBQ3BCLElBQUksSUFBSSxDQUFDLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQ0FDL0MsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDOzRCQUNyQyxDQUFDOzRCQUNELElBQUksT0FBTyxJQUFJLEtBQUssSUFBSSxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7Z0NBQ3BDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7b0NBQzdDLE1BQU0sSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dDQUMvQixDQUFDO3FDQUFNLENBQUM7b0NBQ04sTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO2dDQUNyQyxDQUFDOzRCQUNILENBQUM7NEJBQ0QsSUFBSSxVQUFVLElBQUksS0FBSyxJQUFJLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQ0FDMUMsSUFBSSxDQUFBLE1BQUEsSUFBSSxDQUFDLGlCQUFpQiwwQ0FBRSxTQUFTLE1BQUssbUJBQW1CLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsRUFBRSxDQUFDO29DQUNsRyxJQUFJLFVBQVUsRUFBRSxDQUFDO3dDQUNmLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLElBQUksV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7d0NBQ3JHLElBQUksWUFBWTs0Q0FBRSxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7d0NBQ3hDLFVBQVUsR0FBRyxLQUFLLENBQUM7b0NBQ3JCLENBQUM7b0NBQ0QsbUJBQW1CLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQztvQ0FDdEMsTUFBTSxhQUFhLENBQUMscUJBQXFCLENBQ3ZDLElBQUksQ0FBQyxHQUFHLEVBQ1IsSUFBSSxFQUNKLElBQUksQ0FBQyxNQUFNLEVBQ1gsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsRUFDaEMsbUJBQW1CLENBQ3BCLENBQUM7b0NBQ0YsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztnQ0FDMUMsQ0FBQztxQ0FBTSxDQUFDO29DQUNOLG1CQUFtQixJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUM7Z0NBQ3hDLENBQUM7NEJBQ0gsQ0FBQzs0QkFDRCxJQUFJLE1BQU0sSUFBSSxLQUFLLElBQUksS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO2dDQUNsQyxNQUFNOzRCQUNSLENBQUM7d0JBQ0gsQ0FBQzs7Ozs7Ozs7O29CQUVELElBQUksbUJBQW1CLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQzt3QkFDL0Isb0NBQW9DLEdBQUcsSUFBSSxPQUFPLENBQU8sT0FBTyxDQUFDLEVBQUU7NEJBQ2pFLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsT0FBTyxDQUFDLENBQUM7d0JBQy9ELENBQUMsQ0FBQyxDQUFDO3dCQUVILElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHNCQUFzQixDQUFDLFdBQVcsRUFBRSxtQkFBbUIsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLENBQUMsQ0FBQzt3QkFFMUcsTUFBTSxlQUFlLEdBQUcsS0FBSyxDQUFDO3dCQUM5QixNQUFNLGNBQWMsR0FBRyxJQUFJLE9BQU8sQ0FBTyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUNyRCxVQUFVLENBQ1IsR0FBRyxFQUFFLENBQ0gsTUFBTSxDQUNKLElBQUksS0FBSyxDQUFDLFlBQVksZUFBZSxHQUFHLElBQUksNkJBQTZCLG1CQUFtQixFQUFFLENBQUMsQ0FDaEcsRUFDSCxlQUFlLENBQ2hCLENBQ0YsQ0FBQzt3QkFDRixJQUFJLENBQUM7NEJBQ0gsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsb0NBQW9DLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQzt3QkFDN0UsQ0FBQzt3QkFBQyxPQUFPLGlCQUFzQixFQUFFLENBQUM7NEJBQ2hDLG1CQUFtQixHQUFHLG1CQUFtQixJQUFJLGlCQUFpQixDQUFDOzRCQUMvRCxJQUFJLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUFDO2dDQUN4RCxJQUFJLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUM7NEJBQ3pELENBQUM7d0JBQ0gsQ0FBQztvQkFDSCxDQUFDO3lCQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO3dCQUN2RCxJQUNFLENBQUEsTUFBQSxJQUFJLENBQUMsaUJBQWlCLDBDQUFFLFNBQVMsTUFBSyxtQkFBbUI7NkJBQ3pELE1BQUEsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sMENBQUUsV0FBVyxDQUFBLEVBQzNDLENBQUM7NEJBQ0QsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQzt3QkFDMUMsQ0FBQzt3QkFDRCxJQUFJLENBQUEsTUFBQSxJQUFJLENBQUMsaUJBQWlCLDBDQUFFLFNBQVMsTUFBSyxtQkFBbUIsRUFBRSxDQUFDOzRCQUM5RCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO3dCQUNoQyxDQUFDO3dCQUNELElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHNCQUFzQixDQUM1QyxRQUFRLEVBQ1IsMkRBQTJELEVBQzNELElBQUksSUFBSSxFQUFFLEVBQ1YsSUFBSSxDQUNMLENBQUM7b0JBQ0osQ0FBQztnQkFDSCxDQUFDO2dCQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7b0JBQ3BCLG1CQUFtQixHQUFHLEtBQUssQ0FBQztvQkFFNUIsSUFBSSxDQUFBLE1BQUEsSUFBSSxDQUFDLGlCQUFpQiwwQ0FBRSxTQUFTLE1BQUssbUJBQW1CLEVBQUUsQ0FBQzt3QkFDOUQsSUFBSSxNQUFBLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLDBDQUFFLFdBQVc7NEJBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQzt3QkFDekYsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQztvQkFDaEMsQ0FBQztvQkFDRCxJQUFJLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUFDO3dCQUN4RCxJQUFJLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUM7b0JBQ3pELENBQUM7b0JBRUQsSUFBSSxlQUFlLEdBQVcsbURBQW1ELENBQUM7b0JBQ2xGLElBQUksWUFBWSxHQUF1QixPQUFPLENBQUM7b0JBQy9DLElBQUksMEJBQTBCLEdBQUcsS0FBSyxDQUFDO29CQUV2QyxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssWUFBWSxLQUFJLE1BQUEsS0FBSyxDQUFDLE9BQU8sMENBQUUsUUFBUSxDQUFDLGlCQUFpQixDQUFDLENBQUEsRUFBRSxDQUFDO3dCQUM5RSxlQUFlLEdBQUcsdUJBQXVCLENBQUM7d0JBQzFDLFlBQVksR0FBRyxRQUFRLENBQUM7d0JBQ3hCLElBQUksbUJBQW1CLENBQUMsSUFBSSxFQUFFOzRCQUFFLDBCQUEwQixHQUFHLElBQUksQ0FBQztvQkFDcEUsQ0FBQzt5QkFBTSxDQUFDO3dCQUNOLGVBQWUsR0FBRyx3QkFBd0IsS0FBSyxDQUFDLE9BQU8sSUFBSSxlQUFlLEVBQUUsQ0FBQzt3QkFDN0UsSUFBSSxNQUFNLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUNwQyxDQUFDO29CQUVELElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHNCQUFzQixDQUFDLFlBQVksRUFBRSxlQUFlLEVBQUUsSUFBSSxJQUFJLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFFaEcsSUFBSSwwQkFBMEIsRUFBRSxDQUFDO3dCQUMvQixJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxzQkFBc0IsQ0FBQyxXQUFXLEVBQUUsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQzVHLENBQUM7Z0JBQ0gsQ0FBQzt3QkFBUyxDQUFDO29CQUNULElBQUksSUFBSSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7d0JBQ3hELElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQztvQkFDekQsQ0FBQztvQkFFRCxJQUFJLENBQUEsTUFBQSxJQUFJLENBQUMsaUJBQWlCLDBDQUFFLFNBQVMsTUFBSyxtQkFBbUIsRUFBRSxDQUFDO3dCQUM5RCxJQUFJLE1BQUEsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sMENBQUUsV0FBVyxFQUFFLENBQUM7NEJBQ2hELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7d0JBQzFDLENBQUM7d0JBQ0QsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQztvQkFDaEMsQ0FBQztvQkFFRCxJQUFJLENBQUMsc0JBQXNCLEdBQUcsSUFBSSxDQUFDO29CQUVuQyxJQUFJLENBQUMsY0FBYyxHQUFHLEtBQUssQ0FBQztvQkFFNUIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFFNUIscUJBQXFCLENBQUMsR0FBRyxFQUFFO3dCQUN6QixJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztvQkFDL0IsQ0FBQyxDQUFDLENBQUM7b0JBRUgsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNwQixDQUFDO1lBQ0gsQ0FBQyxDQUFBLENBQ0YsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNYLENBQUM7S0FBQTtJQXdCSyx3QkFBd0I7OztZQUM1QixJQUFJLGVBQWUsR0FBRyxLQUFLLENBQUM7WUFFNUIsSUFBSSxDQUFDO2dCQUNILElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO2dCQUVsQyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDO2dCQUMvQixJQUFJLENBQUMsd0JBQXdCLEdBQUcsRUFBRSxDQUFDO2dCQUNuQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO2dCQUU5QixJQUFJLFVBQVUsR0FBZ0IsSUFBSSxDQUFDO2dCQUNuQyxJQUFJLGVBQWUsR0FBYSxFQUFFLENBQUM7Z0JBQ25DLElBQUksY0FBYyxHQUFrQixJQUFJLENBQUM7Z0JBQ3pDLElBQUksYUFBYSxHQUE4QixTQUFTLENBQUM7Z0JBQ3pELElBQUksYUFBYSxHQUFXLE1BQU0sQ0FBQztnQkFDbkMsSUFBSSxnQkFBZ0IsR0FBOEIsU0FBUyxDQUFDO2dCQUM1RCxJQUFJLHdCQUF3QixHQUFHLEtBQUssQ0FBQztnQkFFckMsSUFBSSxDQUFDO29CQUNILFVBQVUsR0FBRyxDQUFDLE1BQU0sQ0FBQSxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVywwQ0FBRSxhQUFhLEVBQUUsQ0FBQSxDQUFDLElBQUksSUFBSSxDQUFDO29CQUN0RSxlQUFlLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFFOUQsYUFBYTt3QkFDWCxDQUFBLE1BQUEsVUFBVSxhQUFWLFVBQVUsdUJBQVYsVUFBVSxDQUFFLFFBQVEsMENBQUUsZ0JBQWdCLE1BQUssU0FBUzs0QkFDbEQsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCOzRCQUN0QyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUM7b0JBQzVDLGFBQWEsR0FBRyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDL0QsQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNmLElBQUksTUFBTSxDQUFDLGtEQUFrRCxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUNyRSx3QkFBd0IsR0FBRyxJQUFJLENBQUM7b0JBRWhDLGVBQWUsR0FBRyxlQUFlLElBQUksRUFBRSxDQUFDO29CQUN4QyxjQUFjLEdBQUcsZUFBZSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUM7d0JBQ3ZFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTO3dCQUNoQyxDQUFDLENBQUMsTUFBQSxlQUFlLENBQUMsQ0FBQyxDQUFDLG1DQUFJLElBQUksQ0FBQztvQkFDL0IsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDO29CQUNwRCxhQUFhLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUM7b0JBQ3RELGFBQWEsR0FBRyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztvQkFDN0QsVUFBVSxHQUFHLElBQUksQ0FBQztnQkFDcEIsQ0FBQztnQkFFRCxJQUFJLENBQUMsd0JBQXdCLElBQUksVUFBVSxFQUFFLENBQUM7b0JBQzVDLElBQUksY0FBYyxHQUFHLENBQUEsTUFBQSxVQUFVLENBQUMsUUFBUSwwQ0FBRSxTQUFTLEtBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDO29CQUN0RixJQUFJLGVBQWUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7d0JBQy9CLElBQUksY0FBYyxJQUFJLGVBQWUsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQzs0QkFDL0QsY0FBYyxHQUFHLGNBQWMsQ0FBQzt3QkFDbEMsQ0FBQzs2QkFBTSxDQUFDOzRCQUNOLGNBQWMsR0FBRyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ3RDLENBQUM7b0JBQ0gsQ0FBQzt5QkFBTSxDQUFDO3dCQUNOLGNBQWMsR0FBRyxJQUFJLENBQUM7b0JBQ3hCLENBQUM7b0JBRUQsSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLFNBQVMsS0FBSyxjQUFjLElBQUksY0FBYyxLQUFLLElBQUksRUFBRSxDQUFDO3dCQUNoRixJQUFJLENBQUM7NEJBQ0gsTUFBTSxhQUFhLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLFNBQVMsRUFBRSxjQUFjLEVBQUUsQ0FBQyxDQUFDOzRCQUM1RyxJQUFJLGFBQWEsRUFBRSxDQUFDO2dDQUNsQixlQUFlLEdBQUcsSUFBSSxDQUFDO2dDQUV2QixNQUFNLHNCQUFzQixHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7Z0NBQzdGLElBQUksc0JBQXNCO29DQUFFLFVBQVUsR0FBRyxzQkFBc0IsQ0FBQzs0QkFDbEUsQ0FBQztpQ0FBTSxDQUFDOzRCQUNSLENBQUM7d0JBQ0gsQ0FBQzt3QkFBQyxPQUFPLFdBQVcsRUFBRSxDQUFDLENBQUEsQ0FBQztvQkFDMUIsQ0FBQztvQkFDRCxnQkFBZ0IsR0FBRyxNQUFBLE1BQUEsVUFBVSxDQUFDLFFBQVEsMENBQUUsV0FBVyxtQ0FBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7Z0JBQzFGLENBQUM7cUJBQU0sSUFBSSxDQUFDLHdCQUF3QixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7b0JBQ3BELGNBQWMsR0FBRyxlQUFlLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQzt3QkFDdkUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFNBQVM7d0JBQ2hDLENBQUMsQ0FBQyxNQUFBLGVBQWUsQ0FBQyxDQUFDLENBQUMsbUNBQUksSUFBSSxDQUFDO29CQUMvQixnQkFBZ0IsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7b0JBQ3BELGFBQWEsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQztvQkFDdEQsYUFBYSxHQUFHLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUMvRCxDQUFDO2dCQUVELElBQUksVUFBVSxJQUFJLENBQUMsd0JBQXdCLElBQUksQ0FBQSxNQUFBLFVBQVUsQ0FBQyxRQUFRLDBDQUFFLE1BQU0sSUFBRyxDQUFDLEVBQUUsQ0FBQztvQkFDL0UsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO29CQUN0QixJQUFJLENBQUMsZUFBZSxHQUFHLENBQUMsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ2hELElBQUksQ0FBQyx1QkFBdUIsR0FBRyxJQUFJLENBQUM7b0JBRXBDLEtBQUssTUFBTSxPQUFPLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO3dCQUMzQyxJQUFJLGNBQWMsR0FBdUIsSUFBSSxDQUFDO3dCQUU5QyxNQUFNLFFBQVEsR0FDWixDQUFDLElBQUksQ0FBQyx1QkFBdUIsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQzt3QkFDcEcsTUFBTSx5QkFBeUIsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDO3dCQUUzRSxJQUFJLFFBQVEsSUFBSSx5QkFBeUIsRUFBRSxDQUFDOzRCQUMxQyxJQUFJLFFBQVEsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0NBQ3ZELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7NEJBQzlDLENBQUM7NEJBQ0QsSUFBSSxDQUFDLHVCQUF1QixHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7d0JBQ25ELENBQUM7d0JBRUQsSUFBSSxDQUFDOzRCQUNILElBQUksUUFBUSxHQU1ELElBQUksQ0FBQzs0QkFFaEIsUUFBUSxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7Z0NBQ3JCLEtBQUssTUFBTTtvQ0FDVCxRQUFRLEdBQUcsSUFBSSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO29DQUN6RSxNQUFNO2dDQUNSLEtBQUssV0FBVztvQ0FDZCxRQUFRLEdBQUcsSUFBSSx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsT0FBMkIsRUFBRSxJQUFJLENBQUMsQ0FBQztvQ0FDbEcsTUFBTTtnQ0FDUixLQUFLLFFBQVE7b0NBQ1gsUUFBUSxHQUFHLElBQUkscUJBQXFCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztvQ0FDM0UsTUFBTTtnQ0FDUixLQUFLLE9BQU87b0NBQ1YsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxDQUFDO29DQUVqQyxjQUFjLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDO29DQUN4QyxNQUFNO2dDQUNSLEtBQUssTUFBTTtvQ0FDVCxRQUFRLEdBQUcsSUFBSSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO29DQUN6RSxNQUFNO2dDQUNSO29DQUNFLE1BQU0sZ0JBQWdCLEdBQUcsTUFBQSxJQUFJLENBQUMsYUFBYSwwQ0FBRSxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7b0NBQzNGLElBQUksZ0JBQWdCLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO3dDQUMzQyxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsQ0FBQzt3Q0FDM0UsTUFBTSxPQUFPLEdBQUcsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLFdBQVcsQ0FBQyxlQUFlLElBQUksaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO3dDQUN0RyxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsV0FBVyxDQUFDLE9BQU8sSUFBSSxXQUFXLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxDQUFDO3dDQUNyRyxTQUFTLENBQUMsU0FBUyxDQUFDOzRDQUNsQixHQUFHLEVBQUUsV0FBVyxDQUFDLG1CQUFtQixJQUFJLHFCQUFxQjs0Q0FDN0QsSUFBSSxFQUFFLHlCQUF5QixPQUFPLENBQUMsSUFBSSxFQUFFO3lDQUM5QyxDQUFDLENBQUM7d0NBQ0gsbUJBQW1CLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO3dDQUNyRSxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO3dDQUNqRCxjQUFjLEdBQUcsZ0JBQWdCLENBQUM7b0NBQ3BDLENBQUM7b0NBQ0QsTUFBTTs0QkFDVixDQUFDOzRCQUVELElBQUksUUFBUSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUM7Z0NBQ3pDLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQ0FDakMsY0FBYyxHQUFHLE1BQU0sWUFBWSxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7NEJBQ3JFLENBQUM7d0JBQ0gsQ0FBQzt3QkFBQyxPQUFPLFdBQVcsRUFBRSxDQUFDOzRCQUNyQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxXQUFXLENBQUMsYUFBYSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7NEJBQ3BHLFFBQVEsQ0FBQyxPQUFPLENBQUMsa0NBQWtDLE9BQU8sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDOzRCQUNwRSxjQUFjLEdBQUcsUUFBUSxDQUFDO3dCQUM1QixDQUFDO3dCQUVELElBQUksY0FBYyxFQUFFLENBQUM7NEJBQ25CLElBQUksY0FBYyxDQUFDLGFBQWEsS0FBSyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0NBQ3hELElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDOzRCQUNqRCxDQUFDOzRCQUNELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxjQUFjLENBQUM7d0JBQzNDLENBQUM7b0JBQ0gsQ0FBQztvQkFFRCxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUM7b0JBQzVELFVBQVUsQ0FBQyxHQUFHLEVBQUU7d0JBQ2QsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQzt3QkFDekMsVUFBVSxDQUFDLEdBQUcsRUFBRTs0QkFDZCxJQUFJLENBQUMsOEJBQThCLEVBQUUsQ0FBQzt3QkFDeEMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUNWLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztnQkFDVixDQUFDO3FCQUFNLENBQUM7b0JBQ04sSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO29CQUN0QixNQUFBLElBQUksQ0FBQyxvQkFBb0IsMENBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxJQUFJLFNBQVMsQ0FBQyxDQUFDO2dCQUNoRixDQUFDO2dCQUVELElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDM0MsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUN0QyxJQUFJLENBQUMsa0JBQWtCLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQ3hDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUVsRCxJQUFJLGNBQWMsS0FBSyxJQUFJLEVBQUUsQ0FBQztvQkFDNUIsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7d0JBQ2pCLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQzt3QkFDN0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEdBQUcsd0JBQXdCLENBQUM7b0JBQ3RELENBQUM7b0JBQ0QsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7d0JBQ3BCLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQzt3QkFDaEMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxRQUFRLElBQUksVUFBVSxDQUFDLENBQUM7b0JBQ3BFLENBQUM7b0JBQ0QsSUFBSSxJQUFJLENBQUMsWUFBWTt3QkFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNyRCxDQUFDO3FCQUFNLENBQUM7b0JBQ04sSUFBSSxJQUFJLENBQUMsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO3dCQUN2QyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7b0JBQ2hDLENBQUM7b0JBQ0QsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7Z0JBQy9CLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztnQkFDbEMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUN0QixJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztvQkFDdkIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUM7d0JBQzNCLEdBQUcsRUFBRSxxQkFBcUI7d0JBQzFCLElBQUksRUFBRSxvREFBb0Q7cUJBQzNELENBQUMsQ0FBQztnQkFDTCxDQUFDO2dCQUNELE9BQU8sRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUFFLENBQUM7WUFDcEMsQ0FBQztvQkFBUyxDQUFDO1lBQ1gsQ0FBQztZQUVELE9BQU8sRUFBRSxlQUFlLEVBQUUsQ0FBQztRQUM3QixDQUFDO0tBQUE7SUFzRE8sa0JBQWtCLENBQUMsYUFBcUIsRUFBRSxrQkFBMEI7UUFDMUUsSUFBSSxJQUFJLENBQUMsaUJBQWlCLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsS0FBSyxhQUFhLEVBQUUsQ0FBQztZQUNqRixJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO2dCQUNyRSxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsV0FBVztvQkFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzFGLENBQUM7WUFDRCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO1FBQ2hDLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDNUIsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQztnQkFDdEQsR0FBRyxFQUFFLEdBQUcsV0FBVyxDQUFDLGFBQWEsSUFBSSxXQUFXLENBQUMsWUFBWSxjQUFjO2FBQzVFLENBQUMsQ0FBQztZQUNILGtCQUFrQixDQUFDLFlBQVksQ0FBQyw0QkFBNEIsRUFBRSxhQUFhLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUN4RixhQUFhLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDMUYsTUFBTSxTQUFTLEdBQUcsa0JBQWtCLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLFdBQVcsQ0FBQyxlQUFlLElBQUksaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1lBQzFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQztZQUM1QixNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsV0FBVyxDQUFDLE9BQU8sSUFBSSxXQUFXLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ25HLE1BQU0sa0JBQWtCLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxXQUFXLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1lBQ25GLE1BQU0sb0JBQW9CLEdBQUcsa0JBQWtCLENBQUMsU0FBUyxDQUFDO2dCQUN4RCxHQUFHLEVBQUUsR0FBRyxXQUFXLENBQUMsT0FBTyxJQUFJLFdBQVcsQ0FBQyxtQkFBbUIsaUJBQWlCO2FBQ2hGLENBQUMsQ0FBQztZQUNILG9CQUFvQixDQUFDLEtBQUssRUFBRSxDQUFDO1lBQzdCLE1BQU0sSUFBSSxHQUFHLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxXQUFXLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQztZQUNoRixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRTtnQkFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLFdBQVcsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1lBQzlFLElBQUksQ0FBQyxpQkFBaUIsR0FBRztnQkFDdkIsU0FBUyxFQUFFLGFBQWE7Z0JBQ3hCLE9BQU8sRUFBRSxrQkFBa0I7Z0JBQzNCLFNBQVMsRUFBRSxvQkFBb0I7Z0JBQy9CLGNBQWMsRUFBRSxTQUFTO2FBQzFCLENBQUM7WUFDRixrQkFBa0IsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO1lBQ3JGLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsYUFBbEIsa0JBQWtCLHVCQUFsQixrQkFBa0IsQ0FBRSxTQUFTLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsSUFBSSxrQkFBa0IsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ2hILElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDMUMsQ0FBQzthQUFNLENBQUM7WUFDTixJQUFJLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3pDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDO1lBQzVGLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFO2dCQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsV0FBVyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUM7WUFDOUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDakUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsR0FBRyxhQUFhLENBQUM7WUFDakQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsNEJBQTRCLEVBQUUsYUFBYSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDdEcsQ0FBQztJQUNILENBQUM7SUFFYSxpQkFBaUIsQ0FDN0IsTUFBMEMsRUFDMUMsd0JBQWdDLEVBQ2hDLGtCQUEwQjs7Ozs7WUFNMUIsSUFBSSxrQkFBa0IsR0FBRyxFQUFFLENBQUM7WUFDNUIsSUFBSSxlQUFlLEdBQXNCLElBQUksQ0FBQztZQUM5QyxJQUFJLCtCQUErQixHQUE0QixJQUFJLENBQUM7WUFDcEUsSUFBSSxpQkFBaUIsR0FBRyxJQUFJLENBQUM7O2dCQUU3QixnQkFBMEIsV0FBQSxjQUFBLE1BQU0sQ0FBQSw0RUFBRSxDQUFDO29CQUFULHNCQUFNO29CQUFOLFdBQU07b0JBQXJCLE1BQU0sS0FBSyxLQUFBLENBQUE7b0JBQ3BCLElBQUksTUFBQSxJQUFJLENBQUMsc0JBQXNCLDBDQUFFLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQzt3QkFDaEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO29CQUNyQyxDQUFDO29CQUNELElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQzt3QkFDM0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQy9CLENBQUM7b0JBRUQsSUFBSSxDQUFBLE1BQUEsSUFBSSxDQUFDLGlCQUFpQiwwQ0FBRSxTQUFTLE1BQUssd0JBQXdCLEVBQUUsQ0FBQzt3QkFDbkUsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLE1BQU07NEJBQUUsTUFBTTt3QkFDakMsU0FBUztvQkFDWCxDQUFDO29CQUVELElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQzt3QkFDN0IsSUFBSSxNQUFBLElBQUksQ0FBQyxpQkFBaUIsMENBQUUsU0FBUyxFQUFFLENBQUM7NEJBQ3RDLElBQUksaUJBQWlCLEVBQUUsQ0FBQztnQ0FDdEIsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsSUFBSSxXQUFXLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQztnQ0FDckcsSUFBSSxZQUFZO29DQUFFLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQ0FDeEMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDOzRCQUM1QixDQUFDOzRCQUVELGtCQUFrQixJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUM7NEJBRXJDLE1BQU0sYUFBYSxDQUFDLHFCQUFxQixDQUN2QyxJQUFJLENBQUMsR0FBRyxFQUNSLElBQUksRUFDSixJQUFJLENBQUMsTUFBTSxFQUNYLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLEVBQ2hDLGtCQUFrQixDQUNuQixDQUFDOzRCQUNGLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7d0JBQzFDLENBQUM7b0JBQ0gsQ0FBQzt5QkFBTSxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFLENBQUM7d0JBQ3ZDLGVBQWUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO3dCQUM5QiwrQkFBK0IsR0FBRyxLQUFLLENBQUMsNEJBQTRCLENBQUM7d0JBRXJFLElBQUksK0JBQStCLGFBQS9CLCtCQUErQix1QkFBL0IsK0JBQStCLENBQUUsT0FBTyxFQUFFLENBQUM7NEJBQzdDLElBQUksaUJBQWlCLEtBQUksTUFBQSxJQUFJLENBQUMsaUJBQWlCLDBDQUFFLFNBQVMsQ0FBQSxFQUFFLENBQUM7Z0NBQzNELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLElBQUksV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7Z0NBQ3JHLElBQUksWUFBWTtvQ0FBRSxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7Z0NBQ3hDLGlCQUFpQixHQUFHLEtBQUssQ0FBQzs0QkFDNUIsQ0FBQzs0QkFFRCxJQUFJLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLCtCQUErQixDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0NBQzFFLGtCQUFrQixJQUFJLCtCQUErQixDQUFDLE9BQU8sQ0FBQzs0QkFDaEUsQ0FBQzs0QkFFRCxJQUFJLE1BQUEsSUFBSSxDQUFDLGlCQUFpQiwwQ0FBRSxTQUFTLEVBQUUsQ0FBQztnQ0FDdEMsTUFBTSxhQUFhLENBQUMscUJBQXFCLENBQ3ZDLElBQUksQ0FBQyxHQUFHLEVBQ1IsSUFBSSxFQUNKLElBQUksQ0FBQyxNQUFNLEVBQ1gsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsRUFDaEMsa0JBQWtCLENBQ25CLENBQUM7NEJBQ0osQ0FBQzt3QkFDSCxDQUFDO29CQUNILENBQUM7eUJBQU0sSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO3dCQUNqQyxNQUFNO29CQUNSLENBQUM7Z0JBQ0gsQ0FBQzs7Ozs7Ozs7O1lBRUQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGVBQWUsRUFBRSwrQkFBK0IsRUFBRSxDQUFDO1FBQ2xGLENBQUM7S0FBQTtJQUVPLG1CQUFtQixDQUN6QixlQUFrQyxFQUNsQywrQkFBd0QsRUFDeEQscUJBQTZCLEVBQzdCLHdCQUFnQyxFQUNoQyxrQkFBMEI7UUFNMUIsSUFBSSwwQkFBMEIsR0FBc0IsZUFBZSxDQUFDO1FBQ3BFLElBQUkscUJBQXFCLEdBQUcsS0FBSyxDQUFDO1FBQ2xDLElBQUksMEJBQTRDLENBQUM7UUFFakQsSUFBSSxDQUFDLDBCQUEwQixJQUFJLDBCQUEwQixDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMzRSxNQUFNLGtCQUFrQixHQUFHLHdCQUF3QixDQUFDLHFCQUFxQixFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDL0YsSUFBSSxrQkFBa0IsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ2xDLHFCQUFxQixHQUFHLElBQUksQ0FBQztnQkFDN0IsMEJBQTBCLEdBQUcsa0JBQWtCLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDbEUsSUFBSSxFQUFFLFVBQVU7b0JBQ2hCLEVBQUUsRUFBRSxZQUFZLHdCQUF3QixJQUFJLEtBQUssRUFBRTtvQkFDbkQsUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLFNBQVMsSUFBSSxFQUFFLENBQUMsRUFBRTtpQkFDM0UsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osMEJBQTBCLEdBQUc7b0JBQzNCLElBQUksRUFBRSxXQUFXO29CQUNqQixPQUFPLEVBQUUscUJBQXFCO29CQUM5QixTQUFTLEVBQUUsSUFBSSxJQUFJLENBQUMsd0JBQXdCLENBQUM7aUJBQzlDLENBQUM7WUFDSixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sMEJBQTBCLEdBQUc7b0JBQzNCLElBQUksRUFBRSxXQUFXO29CQUNqQixPQUFPLEVBQUUscUJBQXFCO29CQUM5QixTQUFTLEVBQUUsSUFBSSxJQUFJLENBQUMsd0JBQXdCLENBQUM7aUJBQzlDLENBQUM7WUFDSixDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDTiwwQkFBMEIsR0FBRywrQkFBK0IsSUFBSTtnQkFDOUQsSUFBSSxFQUFFLFdBQVc7Z0JBQ2pCLE9BQU8sRUFBRSxxQkFBcUI7Z0JBQzlCLFNBQVMsRUFBRSxJQUFJLElBQUksQ0FBQyx3QkFBd0IsQ0FBQztnQkFDN0MsVUFBVSxFQUFFLDBCQUEwQjthQUN2QyxDQUFDO1lBRUYsMEJBQTBCLENBQUMsT0FBTyxHQUFHLHFCQUFxQixDQUFDO1lBQzNELDBCQUEwQixDQUFDLFVBQVUsR0FBRywwQkFBMEIsQ0FBQztRQUNyRSxDQUFDO1FBQ0QsT0FBTyxFQUFFLDBCQUEwQixFQUFFLDBCQUEwQixFQUFFLHFCQUFxQixFQUFFLENBQUM7SUFDM0YsQ0FBQztJQUVhLDBCQUEwQixDQUN0QyxjQUEwQixFQUMxQixzQkFBd0MsRUFDeEMsa0JBQTBCOzs7WUFFMUIsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUM7WUFDakMsTUFBTSxnQkFBZ0IsR0FBRyxzQkFBc0IsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDcEUsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLE9BQU8sQ0FBTyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtnQkFDaEUsbUJBQW1CLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzlGLFVBQVUsQ0FBQyxHQUFHLEVBQUU7b0JBQ2QsSUFBSSxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLENBQUM7d0JBQ3ZGLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMseUJBQXlCLENBQzlELGdCQUFnQixFQUNoQiw4Q0FBOEMsZ0JBQWdCLEdBQUcsQ0FDbEUsQ0FBQztvQkFDSixDQUFDO2dCQUNILENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLDZCQUE2QixDQUFDLHNCQUFzQixFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3pHLE1BQU0sbUJBQW1CLENBQUM7WUFDMUIsSUFBSSxDQUFBLE1BQUEsbUJBQW1CLENBQUMsaUJBQWlCLDBDQUFFLFNBQVMsTUFBSyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUMxRSxtQkFBbUIsQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7WUFDL0MsQ0FBQztZQUVELEtBQUssTUFBTSxJQUFJLElBQUksY0FBYyxFQUFFLENBQUM7Z0JBQ2xDLElBQUksTUFBQSxtQkFBbUIsQ0FBQyxzQkFBc0IsMENBQUUsTUFBTSxDQUFDLE9BQU87b0JBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO2dCQUNuRyxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssVUFBVSxFQUFFLENBQUM7b0JBQzdCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO29CQUNwQyxJQUFJLFFBQVEsR0FBRyxFQUFFLENBQUM7b0JBQ2xCLElBQUksQ0FBQzt3QkFDSCxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsQ0FBQztvQkFDekQsQ0FBQztvQkFBQyxPQUFPLENBQU0sRUFBRSxDQUFDO3dCQUNoQixNQUFNLFlBQVksR0FBRywwQkFBMEIsUUFBUSxLQUFLLENBQUMsQ0FBQyxPQUFPLG1CQUFtQixJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxDQUFDO3dCQUNuSCxNQUFNLGtCQUFrQixHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7d0JBQ3RDLE1BQU0sWUFBWSxHQUFZOzRCQUM1QixJQUFJLEVBQUUsTUFBTTs0QkFDWixZQUFZLEVBQUUsSUFBSSxDQUFDLEVBQUU7NEJBQ3JCLElBQUksRUFBRSxRQUFROzRCQUNkLE9BQU8sRUFBRSxZQUFZOzRCQUNyQixTQUFTLEVBQUUsa0JBQWtCO3lCQUM5QixDQUFDO3dCQUVGLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7NEJBQ2hFLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQ3hELFlBQVksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLEVBQ2hDLE9BQU8sRUFDUCxNQUFNLENBQ1AsQ0FBQzs0QkFDRixVQUFVLENBQUMsR0FBRyxFQUFFO2dDQUNkLElBQUksbUJBQW1CLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUM7b0NBQ3ZHLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMseUJBQXlCLENBQzlELFlBQVksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLEVBQ2hDLGdDQUFnQyxDQUNqQyxDQUFDO2dDQUNKLENBQUM7NEJBQ0gsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO3dCQUNaLENBQUMsQ0FBQyxDQUFDO3dCQUNILE1BQU0sbUJBQW1CLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyw2QkFBNkIsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7d0JBQy9GLElBQUksQ0FBQzs0QkFDSCxNQUFNLG1CQUFtQixDQUFDO3dCQUM1QixDQUFDO3dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7d0JBQ2pCLENBQUM7d0JBQ0QsU0FBUztvQkFDWCxDQUFDO29CQUVELE1BQU0sVUFBVSxHQUFHLE1BQU0sbUJBQW1CLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO29CQUNqRyxNQUFNLGlCQUFpQixHQUFHLFVBQVUsQ0FBQyxPQUFPO3dCQUMxQyxDQUFDLENBQUMsVUFBVSxDQUFDLE1BQU07d0JBQ25CLENBQUMsQ0FBQyx3QkFBd0IsUUFBUSxLQUFLLFVBQVUsQ0FBQyxLQUFLLElBQUksb0JBQW9CLEVBQUUsQ0FBQztvQkFDcEYsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO29CQUN6QyxNQUFNLGVBQWUsR0FBWTt3QkFDL0IsSUFBSSxFQUFFLE1BQU07d0JBQ1osWUFBWSxFQUFFLElBQUksQ0FBQyxFQUFFO3dCQUNyQixJQUFJLEVBQUUsUUFBUTt3QkFDZCxPQUFPLEVBQUUsaUJBQWlCO3dCQUMxQixTQUFTLEVBQUUscUJBQXFCO3FCQUNqQyxDQUFDO29CQUVGLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7d0JBQ2pFLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQ3hELGVBQWUsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLEVBQ25DLE9BQU8sRUFDUCxNQUFNLENBQ1AsQ0FBQzt3QkFDRixVQUFVLENBQUMsR0FBRyxFQUFFOzRCQUNkLElBQUksbUJBQW1CLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0NBQzFHLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMseUJBQXlCLENBQzlELGVBQWUsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLEVBQ25DLGdDQUFnQyxRQUFRLEVBQUUsQ0FDM0MsQ0FBQzs0QkFDSixDQUFDO3dCQUNILENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDWixDQUFDLENBQUMsQ0FBQztvQkFDSCxNQUFNLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsNkJBQTZCLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUNsRyxNQUFNLG9CQUFvQixDQUFDO2dCQUM5QixDQUFDO1lBQ0YsQ0FBQztRQUNILENBQUM7S0FBQTtJQUVhLHlCQUF5QixDQUNyQyxZQUFvQixFQUNwQixtQkFBMkIsRUFDM0Isa0JBQTBCOzs7WUFFMUIsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUM7WUFFakMsSUFBSSxZQUFZLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztnQkFDeEIsTUFBTSxpQkFBaUIsR0FBWTtvQkFDakMsSUFBSSxFQUFFLFdBQVc7b0JBQ2pCLE9BQU8sRUFBRSxZQUFZO29CQUNyQixTQUFTLEVBQUUsSUFBSSxJQUFJLENBQUMsbUJBQW1CLENBQUM7aUJBQ3pDLENBQUM7Z0JBQ0YsTUFBTSxVQUFVLEdBQUcsSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7b0JBQ3ZELG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUNqRyxVQUFVLENBQUMsR0FBRyxFQUFFO3dCQUNkLElBQUksbUJBQW1CLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUFDOzRCQUMxRixtQkFBbUIsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHlCQUF5QixDQUM5RCxtQkFBbUIsRUFDbkIseUNBQXlDLENBQzFDLENBQUM7d0JBQ0osQ0FBQztvQkFDSCxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ1osQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLDZCQUE2QixDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUNwRyxNQUFNLFVBQVUsQ0FBQztZQUNuQixDQUFDO2lCQUFNLElBQUksQ0FBQyxDQUFBLE1BQUEsbUJBQW1CLENBQUMsc0JBQXNCLDBDQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUEsRUFBRSxDQUFDO2dCQUN2RSxNQUFNLHlCQUF5QixHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7Z0JBQzdDLE1BQU0sZ0JBQWdCLEdBQVk7b0JBQ2hDLElBQUksRUFBRSxRQUFRO29CQUNkLE9BQU8sRUFBRSx1Q0FBdUM7b0JBQ2hELFNBQVMsRUFBRSx5QkFBeUI7aUJBQ3JDLENBQUM7Z0JBQ0YsTUFBTSxVQUFVLEdBQUcsSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7b0JBQ3ZELG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQ3hELGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsRUFDcEMsT0FBTyxFQUNQLE1BQU0sQ0FDUCxDQUFDO29CQUNGLFVBQVUsQ0FBQyxHQUFHLEVBQUU7d0JBQ2QsSUFBSSxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDOzRCQUMzRyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHlCQUF5QixDQUM5RCxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLEVBQ3BDLCtCQUErQixDQUNoQyxDQUFDO3dCQUNKLENBQUM7b0JBQ0gsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNaLENBQUMsQ0FBQyxDQUFDO2dCQUNILE1BQU0sbUJBQW1CLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyw2QkFBNkIsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDbkcsSUFBSSxDQUFDO29CQUNILE1BQU0sVUFBVSxDQUFDO2dCQUNuQixDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2xCLENBQUM7WUFDRixDQUFDO1lBRUQsSUFBSSxDQUFBLE1BQUEsbUJBQW1CLENBQUMsaUJBQWlCLDBDQUFFLFNBQVMsTUFBSyxtQkFBbUIsRUFBRSxDQUFDO2dCQUM3RSxtQkFBbUIsQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7WUFDL0MsQ0FBQztRQUNILENBQUM7S0FBQTtDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcclxuICBJdGVtVmlldyxcclxuICBXb3Jrc3BhY2VMZWFmLFxyXG4gIHNldEljb24sXHJcbiAgTWFya2Rvd25SZW5kZXJlcixcclxuICBOb3RpY2UsXHJcbiAgZGVib3VuY2UsXHJcbiAgbm9ybWFsaXplUGF0aCxcclxuICBURm9sZGVyLFxyXG4gIFRGaWxlLFxyXG4gIE1lbnUsXHJcbiAgUGxhdGZvcm0sXHJcbn0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcblxyXG5pbXBvcnQgeyBDb25maXJtTW9kYWwgfSBmcm9tIFwiLi9Db25maXJtTW9kYWxcIjtcclxuaW1wb3J0IHsgUHJvbXB0TW9kYWwgfSBmcm9tIFwiLi9Qcm9tcHRNb2RhbFwiO1xyXG5pbXBvcnQgT2xsYW1hUGx1Z2luIGZyb20gXCIuL21haW5cIjtcclxuaW1wb3J0IHsgQXZhdGFyVHlwZSwgTEFOR1VBR0VTIH0gZnJvbSBcIi4vc2V0dGluZ3NcIjtcclxuaW1wb3J0IHsgUm9sZUluZm8gfSBmcm9tIFwiLi9DaGF0TWFuYWdlclwiO1xyXG5pbXBvcnQgeyBDaGF0LCBDaGF0TWV0YWRhdGEgfSBmcm9tIFwiLi9DaGF0XCI7XHJcbmltcG9ydCB7IFN1bW1hcnlNb2RhbCB9IGZyb20gXCIuL1N1bW1hcnlNb2RhbFwiO1xyXG5pbXBvcnQgeyBBc3Npc3RhbnRNZXNzYWdlLCBNZXNzYWdlLCBPbGxhbWFHZW5lcmF0ZVJlc3BvbnNlLCBUb29sQ2FsbCB9IGZyb20gXCIuL3R5cGVzXCI7XHJcbmltcG9ydCB7IE1lc3NhZ2VSb2xlIGFzIE1lc3NhZ2VSb2xlVHlwZUZyb21UeXBlcyB9IGZyb20gXCIuL3R5cGVzXCI7XHJcblxyXG5pbXBvcnQgeyBDU1NfQ0xBU1NFUyB9IGZyb20gXCIuL2NvbnN0YW50c1wiO1xyXG5cclxuaW1wb3J0ICogYXMgUmVuZGVyZXJVdGlscyBmcm9tIFwiLi9NZXNzYWdlUmVuZGVyZXJVdGlsc1wiO1xyXG5pbXBvcnQgeyBVc2VyTWVzc2FnZVJlbmRlcmVyIH0gZnJvbSBcIi4vcmVuZGVyZXJzL1VzZXJNZXNzYWdlUmVuZGVyZXJcIjtcclxuaW1wb3J0IHsgQXNzaXN0YW50TWVzc2FnZVJlbmRlcmVyIH0gZnJvbSBcIi4vcmVuZGVyZXJzL0Fzc2lzdGFudE1lc3NhZ2VSZW5kZXJlclwiO1xyXG5pbXBvcnQgeyBTeXN0ZW1NZXNzYWdlUmVuZGVyZXIgfSBmcm9tIFwiLi9yZW5kZXJlcnMvU3lzdGVtTWVzc2FnZVJlbmRlcmVyXCI7XHJcbmltcG9ydCB7IEVycm9yTWVzc2FnZVJlbmRlcmVyIH0gZnJvbSBcIi4vcmVuZGVyZXJzL0Vycm9yTWVzc2FnZVJlbmRlcmVyXCI7XHJcbmltcG9ydCB7IEJhc2VNZXNzYWdlUmVuZGVyZXIgfSBmcm9tIFwiLi9yZW5kZXJlcnMvQmFzZU1lc3NhZ2VSZW5kZXJlclwiO1xyXG5pbXBvcnQgeyBTaWRlYmFyTWFuYWdlciB9IGZyb20gXCIuL1NpZGViYXJNYW5hZ2VyXCI7XHJcbmltcG9ydCB7IERyb3Bkb3duTWVudU1hbmFnZXIgfSBmcm9tIFwiLi9Ecm9wZG93bk1lbnVNYW5hZ2VyXCI7XHJcbmltcG9ydCB7IFRvb2xNZXNzYWdlUmVuZGVyZXIgfSBmcm9tIFwiLi9yZW5kZXJlcnMvVG9vbE1lc3NhZ2VSZW5kZXJlclwiO1xyXG5pbXBvcnQgeyBTdHJlYW1DaHVuayB9IGZyb20gXCIuL09sbGFtYVNlcnZpY2VcIjtcclxuaW1wb3J0IHsgcGFyc2VBbGxUZXh0dWFsVG9vbENhbGxzIH0gZnJvbSBcIi4vdXRpbHMvdG9vbFBhcnNlclwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IFZJRVdfVFlQRV9PTExBTUFfUEVSU09OQVMgPSBcIm9sbGFtYS1wZXJzb25hcy1jaGF0LXZpZXdcIjtcclxuXHJcbmNvbnN0IFNDUk9MTF9USFJFU0hPTEQgPSAxNTA7XHJcblxyXG5jb25zdCBDU1NfQ0xBU1NfVFJBTlNMQVRJTkdfSU5QVVQgPSBcInRyYW5zbGF0aW5nLWlucHV0XCI7XHJcbmNvbnN0IENTU19DTEFTU19FTVBUWV9TVEFURSA9IFwib2xsYW1hLWVtcHR5LXN0YXRlXCI7XHJcbmV4cG9ydCBjb25zdCBDU1NfQ0xBU1NfTUVTU0FHRSA9IFwibWVzc2FnZVwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfRVJST1JfVEVYVCA9IFwiZXJyb3ItbWVzc2FnZS10ZXh0XCI7XHJcbmNvbnN0IENTU19DTEFTU19UUkFOU0xBVElPTl9DT05UQUlORVIgPSBcInRyYW5zbGF0aW9uLWNvbnRhaW5lclwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfVFJBTlNMQVRJT05fQ09OVEVOVCA9IFwidHJhbnNsYXRpb24tY29udGVudFwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfVFJBTlNMQVRJT05fUEVORElORyA9IFwidHJhbnNsYXRpb24tcGVuZGluZ1wiO1xyXG5jb25zdCBDU1NfQ0xBU1NfUkVDT1JESU5HID0gXCJyZWNvcmRpbmdcIjtcclxuY29uc3QgQ1NTX0NMQVNTX0RJU0FCTEVEID0gXCJkaXNhYmxlZFwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfREFURV9TRVBBUkFUT1IgPSBcImNoYXQtZGF0ZS1zZXBhcmF0b3JcIjtcclxuY29uc3QgQ1NTX0NMQVNTX1ZJU0lCTEUgPSBcInZpc2libGVcIjtcclxuY29uc3QgQ1NTX0NMQVNTX0NPTlRFTlRfQ09MTEFQU0VEID0gXCJtZXNzYWdlLWNvbnRlbnQtY29sbGFwc2VkXCI7XHJcbmNvbnN0IENTU19DTEFTU19NRU5VX09QVElPTiA9IFwibWVudS1vcHRpb25cIjtcclxuXHJcbmNvbnN0IENTU19ST0xFX1BBTkVMX0lURU0gPSBcIm9sbGFtYS1yb2xlLXBhbmVsLWl0ZW1cIjtcclxuY29uc3QgQ1NTX1JPTEVfUEFORUxfSVRFTV9JQ09OID0gXCJvbGxhbWEtcm9sZS1wYW5lbC1pdGVtLWljb25cIjtcclxuY29uc3QgQ1NTX1JPTEVfUEFORUxfSVRFTV9URVhUID0gXCJvbGxhbWEtcm9sZS1wYW5lbC1pdGVtLXRleHRcIjtcclxuY29uc3QgQ1NTX1JPTEVfUEFORUxfSVRFTV9BQ1RJVkUgPSBcImlzLWFjdGl2ZVwiO1xyXG5jb25zdCBDU1NfUk9MRV9QQU5FTF9JVEVNX0NVU1RPTSA9IFwiaXMtY3VzdG9tXCI7XHJcbmNvbnN0IENTU19ST0xFX1BBTkVMX0lURU1fTk9ORSA9IFwib2xsYW1hLXJvbGUtcGFuZWwtaXRlbS1ub25lXCI7XHJcbmNvbnN0IENTU19TSURFQkFSX1NFQ1RJT05fSUNPTiA9IFwib2xsYW1hLXNpZGViYXItc2VjdGlvbi1pY29uXCI7XHJcbmNvbnN0IENTU19DSEFUX0lURU1fT1BUSU9OUyA9IFwib2xsYW1hLWNoYXQtaXRlbS1vcHRpb25zXCI7XHJcbmNvbnN0IENTU19DTEFTU19DSEFUX0xJU1RfSVRFTSA9IFwib2xsYW1hLWNoYXQtbGlzdC1pdGVtXCI7XHJcblxyXG5jb25zdCBDU1NfQ0xBU1NfUkVTSVpFUl9IQU5ETEUgPSBcIm9sbGFtYS1yZXNpemVyLWhhbmRsZVwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfUkVTSVpJTkcgPSBcImlzLXJlc2l6aW5nXCI7XHJcblxyXG5leHBvcnQgdHlwZSBNZXNzYWdlUm9sZSA9IFwidXNlclwiIHwgXCJhc3Npc3RhbnRcIiB8IFwic3lzdGVtXCIgfCBcImVycm9yXCIgfCBcInRvb2xcIjtcclxuXHJcbmV4cG9ydCBjbGFzcyBPbGxhbWFWaWV3IGV4dGVuZHMgSXRlbVZpZXcge1xyXG4gIHByaXZhdGUgc2lkZWJhck1hbmFnZXIhOiBTaWRlYmFyTWFuYWdlcjtcclxuICBwcml2YXRlIGRyb3Bkb3duTWVudU1hbmFnZXIhOiBEcm9wZG93bk1lbnVNYW5hZ2VyO1xyXG5cclxuICBwdWJsaWMgcmVhZG9ubHkgcGx1Z2luOiBPbGxhbWFQbHVnaW47XHJcbiAgcHJpdmF0ZSBjaGF0Q29udGFpbmVyRWwhOiBIVE1MRWxlbWVudDtcclxuICBwcml2YXRlIGlucHV0RWwhOiBIVE1MVGV4dEFyZWFFbGVtZW50O1xyXG4gIHByaXZhdGUgY2hhdENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xyXG4gIHByaXZhdGUgc2VuZEJ1dHRvbiE6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gIHByaXZhdGUgdm9pY2VCdXR0b24hOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICBwcml2YXRlIHRyYW5zbGF0ZUlucHV0QnV0dG9uITogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgcHJpdmF0ZSBtZW51QnV0dG9uITogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgcHJpdmF0ZSBidXR0b25zQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XHJcblxyXG4gIHByaXZhdGUgbW9kZWxEaXNwbGF5RWwhOiBIVE1MRWxlbWVudDtcclxuICBwcml2YXRlIHJvbGVEaXNwbGF5RWwhOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgcHJpdmF0ZSB0ZW1wZXJhdHVyZUluZGljYXRvckVsITogSFRNTEVsZW1lbnQ7XHJcbiAgcHJpdmF0ZSB0b2dnbGVMb2NhdGlvbkJ1dHRvbiE6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gIHByaXZhdGUgbmV3Q2hhdFNpZGViYXJCdXR0b24hOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuXHJcbiAgcHJpdmF0ZSBpc1Byb2Nlc3Npbmc6IGJvb2xlYW4gPSBmYWxzZTtcclxuICBwcml2YXRlIHNjcm9sbFRpbWVvdXQ6IE5vZGVKUy5UaW1lb3V0IHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSBzcGVlY2hXb3JrZXI6IFdvcmtlciB8IG51bGwgPSBudWxsO1xyXG4gIHByaXZhdGUgbWVkaWFSZWNvcmRlcjogTWVkaWFSZWNvcmRlciB8IG51bGwgPSBudWxsO1xyXG4gIHByaXZhdGUgYXVkaW9TdHJlYW06IE1lZGlhU3RyZWFtIHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSBlbXB0eVN0YXRlRWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSByZXNpemVUaW1lb3V0OiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xyXG4gIHByaXZhdGUgc2Nyb2xsTGlzdGVuZXJEZWJvdW5jZWQ6ICgpID0+IHZvaWQ7XHJcbiAgcHJpdmF0ZSBjdXJyZW50TWVzc2FnZXM6IE1lc3NhZ2VbXSA9IFtdO1xyXG4gIHByaXZhdGUgbGFzdFJlbmRlcmVkTWVzc2FnZURhdGU6IERhdGUgfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIG5ld01lc3NhZ2VzSW5kaWNhdG9yRWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSB1c2VyU2Nyb2xsZWRVcDogYm9vbGVhbiA9IGZhbHNlO1xyXG5cclxuICBwcml2YXRlIHJvbGVQYW5lbExpc3RFbCE6IEhUTUxFbGVtZW50O1xyXG4gIHByaXZhdGUgbWFpbkNoYXRBcmVhRWwhOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgcHJpdmF0ZSBsYXN0UHJvY2Vzc2VkQ2hhdElkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgcHJpdmF0ZSBjaGF0UGFuZWxMaXN0RWwhOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgcHJpdmF0ZSBjaGF0UGFuZWxIZWFkZXJFbCE6IEhUTUxFbGVtZW50O1xyXG4gIHByaXZhdGUgcm9sZVBhbmVsSGVhZGVyRWwhOiBIVE1MRWxlbWVudDtcclxuICBwcml2YXRlIHNjcm9sbFRvQm90dG9tQnV0dG9uITogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcblxyXG4gIHByaXZhdGUgc3RvcEdlbmVyYXRpbmdCdXR0b24hOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICBwcml2YXRlIGN1cnJlbnRBYm9ydENvbnRyb2xsZXI6IEFib3J0Q29udHJvbGxlciB8IG51bGwgPSBudWxsO1xyXG5cclxuICBwcml2YXRlIGxhc3RNZXNzYWdlRWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIGNvbnNlY3V0aXZlRXJyb3JNZXNzYWdlczogTWVzc2FnZVtdID0gW107XHJcbiAgcHJpdmF0ZSBlcnJvckdyb3VwRWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIGlzU3VtbWFyaXppbmdFcnJvcnMgPSBmYWxzZTtcclxuXHJcbiAgcHJpdmF0ZSBpc1JlZ2VuZXJhdGluZzogYm9vbGVhbiA9IGZhbHNlO1xyXG4gIHByaXZhdGUgbWVzc2FnZUFkZGVkUmVzb2x2ZXJzOiBNYXA8bnVtYmVyLCAoKSA9PiB2b2lkPiA9IG5ldyBNYXAoKTtcclxuXHJcbiAgcHJpdmF0ZSBpc0NoYXRMaXN0VXBkYXRlU2NoZWR1bGVkID0gZmFsc2U7XHJcbiAgcHJpdmF0ZSBjaGF0TGlzdFVwZGF0ZVRpbWVvdXRJZDogTm9kZUpTLlRpbWVvdXQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgcHJpdmF0ZSBhY3RpdmVQbGFjZWhvbGRlcjoge1xyXG4gICAgdGltZXN0YW1wOiBudW1iZXI7XHJcbiAgICBncm91cEVsOiBIVE1MRWxlbWVudDtcclxuICAgIGNvbnRlbnRFbDogSFRNTEVsZW1lbnQ7XHJcbiAgICBtZXNzYWdlV3JhcHBlcjogSFRNTEVsZW1lbnQ7XHJcbiAgfSB8IG51bGwgPSBudWxsO1xyXG5cclxuICBwcml2YXRlIHNpZGViYXJSb290RWwhOiBIVE1MRWxlbWVudDtcclxuICBwcml2YXRlIHJlc2l6ZXJFbCE6IEhUTUxFbGVtZW50O1xyXG4gIHByaXZhdGUgaXNSZXNpemluZyA9IGZhbHNlO1xyXG4gIHByaXZhdGUgaW5pdGlhbE1vdXNlWCA9IDA7XHJcbiAgcHJpdmF0ZSBpbml0aWFsU2lkZWJhcldpZHRoID0gMDtcclxuICBwcml2YXRlIGJvdW5kT25EcmFnTW92ZTogKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB2b2lkO1xyXG4gIHByaXZhdGUgYm91bmRPbkRyYWdFbmQ6IChldmVudDogTW91c2VFdmVudCkgPT4gdm9pZDtcclxuICBwcml2YXRlIHNhdmVXaWR0aERlYm91bmNlZDogKCkgPT4gdm9pZDtcclxuXHJcbiAgY29uc3RydWN0b3IobGVhZjogV29ya3NwYWNlTGVhZiwgcGx1Z2luOiBPbGxhbWFQbHVnaW4pIHtcclxuICAgIHN1cGVyKGxlYWYpO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgICB0aGlzLmFwcCA9IHBsdWdpbi5hcHA7XHJcblxyXG4gICAgdGhpcy5pbml0U3BlZWNoV29ya2VyKCk7XHJcblxyXG4gICAgdGhpcy5zY3JvbGxMaXN0ZW5lckRlYm91bmNlZCA9IGRlYm91bmNlKHRoaXMuaGFuZGxlU2Nyb2xsLCAxNTAsIHRydWUpO1xyXG4gICAgdGhpcy5yZWdpc3RlcihcclxuICAgICAgdGhpcy5wbHVnaW4ub24oXCJmb2N1cy1pbnB1dC1yZXF1ZXN0XCIsICgpID0+IHtcclxuICAgICAgICB0aGlzLmZvY3VzSW5wdXQoKTtcclxuICAgICAgfSlcclxuICAgICk7XHJcbiAgICB0aGlzLmJvdW5kT25EcmFnTW92ZSA9IHRoaXMub25EcmFnTW92ZS5iaW5kKHRoaXMpO1xyXG4gICAgdGhpcy5ib3VuZE9uRHJhZ0VuZCA9IHRoaXMub25EcmFnRW5kLmJpbmQodGhpcyk7XHJcblxyXG4gICAgdGhpcy5zYXZlV2lkdGhEZWJvdW5jZWQgPSBkZWJvdW5jZSgoKSA9PiB7XHJcbiAgICAgIGlmICh0aGlzLnNpZGViYXJSb290RWwpIHtcclxuICAgICAgICBjb25zdCBuZXdXaWR0aCA9IHRoaXMuc2lkZWJhclJvb3RFbC5vZmZzZXRXaWR0aDtcclxuXHJcbiAgICAgICAgaWYgKG5ld1dpZHRoID4gMCAmJiBuZXdXaWR0aCAhPT0gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2lkZWJhcldpZHRoKSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zaWRlYmFyV2lkdGggPSBuZXdXaWR0aDtcclxuXHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sIDgwMCk7XHJcbiAgfVxyXG5cclxuICBnZXRWaWV3VHlwZSgpOiBzdHJpbmcge1xyXG4gICAgcmV0dXJuIFZJRVdfVFlQRV9PTExBTUFfUEVSU09OQVM7XHJcbiAgfVxyXG4gIGdldERpc3BsYXlUZXh0KCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gXCJBSSBGb3JnZVwiO1xyXG4gIH1cclxuICBnZXRJY29uKCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gXCJicmFpbi1jaXJjdWl0XCI7XHJcbiAgfVxyXG5cclxuICBhc3luYyBvbk9wZW4oKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLmNyZWF0ZVVJRWxlbWVudHMoKTtcclxuXHJcbiAgICBjb25zdCBzYXZlZFdpZHRoID0gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2lkZWJhcldpZHRoO1xyXG4gICAgaWYgKHRoaXMuc2lkZWJhclJvb3RFbCAmJiBzYXZlZFdpZHRoICYmIHR5cGVvZiBzYXZlZFdpZHRoID09PSBcIm51bWJlclwiICYmIHNhdmVkV2lkdGggPiA1MCkge1xyXG4gICAgICB0aGlzLnNpZGViYXJSb290RWwuc3R5bGUud2lkdGggPSBgJHtzYXZlZFdpZHRofXB4YDtcclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLnN0eWxlLm1pbldpZHRoID0gYCR7c2F2ZWRXaWR0aH1weGA7XHJcbiAgICB9IGVsc2UgaWYgKHRoaXMuc2lkZWJhclJvb3RFbCkge1xyXG4gICAgICBsZXQgZGVmYXVsdFdpZHRoID0gMjUwO1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IGNzc1ZhcldpZHRoID0gZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLnNpZGViYXJSb290RWwpLmdldFByb3BlcnR5VmFsdWUoXCItLWFpLWZvcmdlLXNpZGViYXItd2lkdGhcIikudHJpbSgpO1xyXG4gICAgICAgIGlmIChjc3NWYXJXaWR0aCAmJiBjc3NWYXJXaWR0aC5lbmRzV2l0aChcInB4XCIpKSB7XHJcbiAgICAgICAgICBjb25zdCBwYXJzZWRXaWR0aCA9IHBhcnNlSW50KGNzc1ZhcldpZHRoLCAxMCk7XHJcbiAgICAgICAgICBpZiAoIWlzTmFOKHBhcnNlZFdpZHRoKSAmJiBwYXJzZWRXaWR0aCA+IDUwKSB7XHJcbiAgICAgICAgICAgIGRlZmF1bHRXaWR0aCA9IHBhcnNlZFdpZHRoO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfSBjYXRjaCAoZSkge31cclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLnN0eWxlLndpZHRoID0gYCR7ZGVmYXVsdFdpZHRofXB4YDtcclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLnN0eWxlLm1pbldpZHRoID0gYCR7ZGVmYXVsdFdpZHRofXB4YDtcclxuICAgICAgaWYgKCFzYXZlZFdpZHRoKSB7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBpbml0aWFsUm9sZVBhdGggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoO1xyXG4gICAgICBjb25zdCBpbml0aWFsUm9sZU5hbWUgPSBhd2FpdCB0aGlzLmZpbmRSb2xlTmFtZUJ5UGF0aChpbml0aWFsUm9sZVBhdGgpO1xyXG4gICAgICBjb25zdCBpbml0aWFsTW9kZWxOYW1lID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xyXG4gICAgICBjb25zdCBpbml0aWFsVGVtcGVyYXR1cmUgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZTtcclxuXHJcbiAgICAgIHRoaXMudXBkYXRlSW5wdXRQbGFjZWhvbGRlcihpbml0aWFsUm9sZU5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZVJvbGVEaXNwbGF5KGluaXRpYWxSb2xlTmFtZSk7XHJcbiAgICAgIHRoaXMudXBkYXRlTW9kZWxEaXNwbGF5KGluaXRpYWxNb2RlbE5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZVRlbXBlcmF0dXJlSW5kaWNhdG9yKGluaXRpYWxUZW1wZXJhdHVyZSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge31cclxuXHJcbiAgICB0aGlzLmF0dGFjaEV2ZW50TGlzdGVuZXJzKCk7XHJcblxyXG4gICAgdGhpcy5hdXRvUmVzaXplVGV4dGFyZWEoKTtcclxuICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5sb2FkQW5kRGlzcGxheUFjdGl2ZUNoYXQoKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMuc2hvd0VtcHR5U3RhdGUoKTtcclxuICAgIH1cclxuXHJcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgaWYgKHRoaXMuaW5wdXRFbCAmJiB0aGlzLmxlYWYudmlldyA9PT0gdGhpcyAmJiBkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHRoaXMuaW5wdXRFbCkpIHtcclxuICAgICAgICB0aGlzLmlucHV0RWwuZm9jdXMoKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgfVxyXG4gICAgfSwgMTUwKTtcclxuXHJcbiAgICBpZiAodGhpcy5pbnB1dEVsKSB7XHJcbiAgICAgIHRoaXMuaW5wdXRFbC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudChcImlucHV0XCIpKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIG9uQ2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIHRoaXMuYm91bmRPbkRyYWdNb3ZlLCB7IGNhcHR1cmU6IHRydWUgfSk7XHJcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2V1cFwiLCB0aGlzLmJvdW5kT25EcmFnRW5kLCB7IGNhcHR1cmU6IHRydWUgfSk7XHJcblxyXG4gICAgaWYgKGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmNvbnRhaW5zKENTU19DTEFTU19SRVNJWklORykpIHtcclxuICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS5jdXJzb3IgPSBcIlwiO1xyXG4gICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1JFU0laSU5HKTtcclxuICAgIH1cclxuICAgIHRoaXMuaXNSZXNpemluZyA9IGZhbHNlO1xyXG5cclxuICAgIGlmICh0aGlzLnNwZWVjaFdvcmtlcikge1xyXG4gICAgICB0aGlzLnNwZWVjaFdvcmtlci50ZXJtaW5hdGUoKTtcclxuICAgICAgdGhpcy5zcGVlY2hXb3JrZXIgPSBudWxsO1xyXG4gICAgfVxyXG4gICAgdGhpcy5zdG9wVm9pY2VSZWNvcmRpbmcoZmFsc2UpO1xyXG4gICAgaWYgKHRoaXMuYXVkaW9TdHJlYW0pIHtcclxuICAgICAgdGhpcy5hdWRpb1N0cmVhbS5nZXRUcmFja3MoKS5mb3JFYWNoKHQgPT4gdC5zdG9wKCkpO1xyXG4gICAgICB0aGlzLmF1ZGlvU3RyZWFtID0gbnVsbDtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnNjcm9sbFRpbWVvdXQpIGNsZWFyVGltZW91dCh0aGlzLnNjcm9sbFRpbWVvdXQpO1xyXG4gICAgaWYgKHRoaXMucmVzaXplVGltZW91dCkgY2xlYXJUaW1lb3V0KHRoaXMucmVzaXplVGltZW91dCk7XHJcbiAgICB0aGlzLnNpZGViYXJNYW5hZ2VyPy5kZXN0cm95KCk7XHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXI/LmRlc3Ryb3koKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY3JlYXRlVUlFbGVtZW50cygpOiB2b2lkIHtcclxuICAgIHRoaXMuY29udGVudEVsLmVtcHR5KCk7XHJcblxyXG4gICAgY29uc3QgZmxleENvbnRhaW5lciA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJvbGxhbWEtY29udGFpbmVyXCIgfSk7XHJcblxyXG4gICAgY29uc3QgaXNTaWRlYmFyTG9jYXRpb24gPSAhdGhpcy5wbHVnaW4uc2V0dGluZ3Mub3BlbkNoYXRJblRhYjtcclxuICAgIGNvbnN0IGlzRGVza3RvcCA9IFBsYXRmb3JtLmlzRGVza3RvcDtcclxuXHJcbiAgICB0aGlzLnNpZGViYXJNYW5hZ2VyID0gbmV3IFNpZGViYXJNYW5hZ2VyKHRoaXMucGx1Z2luLCB0aGlzLmFwcCwgdGhpcyk7XHJcbiAgICB0aGlzLnNpZGViYXJSb290RWwgPSB0aGlzLnNpZGViYXJNYW5hZ2VyLmNyZWF0ZVNpZGViYXJVSShmbGV4Q29udGFpbmVyKTtcclxuXHJcbiAgICBjb25zdCBzaG91bGRTaG93SW50ZXJuYWxTaWRlYmFyID0gaXNEZXNrdG9wICYmICFpc1NpZGViYXJMb2NhdGlvbjtcclxuICAgIGlmICh0aGlzLnNpZGViYXJSb290RWwpIHtcclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLmNsYXNzTGlzdC50b2dnbGUoXCJpbnRlcm5hbC1zaWRlYmFyLWhpZGRlblwiLCAhc2hvdWxkU2hvd0ludGVybmFsU2lkZWJhcik7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMucmVzaXplckVsID0gZmxleENvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU19SRVNJWkVSX0hBTkRMRSB9KTtcclxuICAgIHRoaXMucmVzaXplckVsLnRpdGxlID0gXCJEcmFnIHRvIHJlc2l6ZSBzaWRlYmFyXCI7XHJcblxyXG4gICAgdGhpcy5yZXNpemVyRWwuY2xhc3NMaXN0LnRvZ2dsZShcImludGVybmFsLXNpZGViYXItaGlkZGVuXCIsICFzaG91bGRTaG93SW50ZXJuYWxTaWRlYmFyKTtcclxuXHJcbiAgICB0aGlzLm1haW5DaGF0QXJlYUVsID0gZmxleENvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwib2xsYW1hLW1haW4tY2hhdC1hcmVhXCIgfSk7XHJcblxyXG4gICAgdGhpcy5tYWluQ2hhdEFyZWFFbC5jbGFzc0xpc3QudG9nZ2xlKFwiZnVsbC13aWR0aFwiLCAhc2hvdWxkU2hvd0ludGVybmFsU2lkZWJhcik7XHJcblxyXG4gICAgdGhpcy5jaGF0Q29udGFpbmVyRWwgPSB0aGlzLm1haW5DaGF0QXJlYUVsLmNyZWF0ZURpdih7IGNsczogXCJvbGxhbWEtY2hhdC1hcmVhLWNvbnRlbnRcIiB9KTtcclxuICAgIHRoaXMuY2hhdENvbnRhaW5lciA9IHRoaXMuY2hhdENvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJvbGxhbWEtY2hhdC1jb250YWluZXJcIiB9KTtcclxuICAgIHRoaXMubmV3TWVzc2FnZXNJbmRpY2F0b3JFbCA9IHRoaXMuY2hhdENvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJuZXctbWVzc2FnZS1pbmRpY2F0b3JcIiB9KTtcclxuICAgIHNldEljb24odGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsLmNyZWF0ZVNwYW4oeyBjbHM6IFwiaW5kaWNhdG9yLWljb25cIiB9KSwgXCJhcnJvdy1kb3duXCIpO1xyXG4gICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsLmNyZWF0ZVNwYW4oeyB0ZXh0OiBcIiBOZXcgTWVzc2FnZXNcIiB9KTtcclxuICAgIHRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24gPSB0aGlzLmNoYXRDb250YWluZXJFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7XHJcbiAgICAgIGNsczogW1wic2Nyb2xsLXRvLWJvdHRvbS1idXR0b25cIiwgXCJjbGlja2FibGUtaWNvblwiXSxcclxuICAgICAgYXR0cjogeyBcImFyaWEtbGFiZWxcIjogXCJTY3JvbGwgdG8gYm90dG9tXCIsIHRpdGxlOiBcIlNjcm9sbCB0byBib3R0b21cIiB9LFxyXG4gICAgfSk7XHJcbiAgICBzZXRJY29uKHRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24sIFwiYXJyb3ctZG93blwiKTtcclxuICAgIGNvbnN0IGlucHV0Q29udGFpbmVyID0gdGhpcy5tYWluQ2hhdEFyZWFFbC5jcmVhdGVEaXYoeyBjbHM6IFwiY2hhdC1pbnB1dC1jb250YWluZXJcIiB9KTtcclxuICAgIHRoaXMuaW5wdXRFbCA9IGlucHV0Q29udGFpbmVyLmNyZWF0ZUVsKFwidGV4dGFyZWFcIiwge1xyXG4gICAgICBhdHRyOiB7IHBsYWNlaG9sZGVyOiBgRW50ZXIgbWVzc2FnZSB0ZXh0IGhlcmUuLi5gLCByb3dzOiAxIH0sXHJcbiAgICB9KTtcclxuICAgIGNvbnN0IGNvbnRyb2xzQ29udGFpbmVyID0gaW5wdXRDb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImlucHV0LWNvbnRyb2xzLWNvbnRhaW5lclwiIH0pO1xyXG4gICAgY29uc3QgbGVmdENvbnRyb2xzID0gY29udHJvbHNDb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImlucHV0LWNvbnRyb2xzLWxlZnRcIiB9KTtcclxuICAgIHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24gPSBsZWZ0Q29udHJvbHMuY3JlYXRlRWwoXCJidXR0b25cIiwge1xyXG4gICAgICBjbHM6IFwidHJhbnNsYXRlLWlucHV0LWJ1dHRvblwiLFxyXG4gICAgICBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIlRyYW5zbGF0ZSBpbnB1dCB0byBFbmdsaXNoXCIgfSxcclxuICAgIH0pO1xyXG4gICAgc2V0SWNvbih0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLCBcImxhbmd1YWdlc1wiKTtcclxuICAgIHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24udGl0bGUgPSBcIlRyYW5zbGF0ZSBpbnB1dCB0byBFbmdsaXNoXCI7XHJcbiAgICB0aGlzLm1vZGVsRGlzcGxheUVsID0gbGVmdENvbnRyb2xzLmNyZWF0ZURpdih7IGNsczogXCJtb2RlbC1kaXNwbGF5XCIgfSk7XHJcbiAgICB0aGlzLm1vZGVsRGlzcGxheUVsLnNldFRleHQoXCIuLi5cIik7XHJcbiAgICB0aGlzLm1vZGVsRGlzcGxheUVsLnRpdGxlID0gXCJDbGljayB0byBzZWxlY3QgbW9kZWxcIjtcclxuICAgIHRoaXMucm9sZURpc3BsYXlFbCA9IGxlZnRDb250cm9scy5jcmVhdGVEaXYoeyBjbHM6IFwicm9sZS1kaXNwbGF5XCIgfSk7XHJcbiAgICB0aGlzLnJvbGVEaXNwbGF5RWwuc2V0VGV4dChcIi4uLlwiKTtcclxuICAgIHRoaXMucm9sZURpc3BsYXlFbC50aXRsZSA9IFwiQ2xpY2sgdG8gc2VsZWN0IHJvbGVcIjtcclxuICAgIHRoaXMudGVtcGVyYXR1cmVJbmRpY2F0b3JFbCA9IGxlZnRDb250cm9scy5jcmVhdGVEaXYoeyBjbHM6IFwidGVtcGVyYXR1cmUtaW5kaWNhdG9yXCIgfSk7XHJcbiAgICB0aGlzLnRlbXBlcmF0dXJlSW5kaWNhdG9yRWwuc2V0VGV4dChcIj9cIik7XHJcbiAgICB0aGlzLnRlbXBlcmF0dXJlSW5kaWNhdG9yRWwudGl0bGUgPSBcIkNsaWNrIHRvIHNldCB0ZW1wZXJhdHVyZVwiO1xyXG4gICAgdGhpcy5idXR0b25zQ29udGFpbmVyID0gY29udHJvbHNDb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBgYnV0dG9ucy1jb250YWluZXIgaW5wdXQtY29udHJvbHMtcmlnaHRgIH0pO1xyXG4gICAgdGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbiA9IHRoaXMuYnV0dG9uc0NvbnRhaW5lci5jcmVhdGVFbChcImJ1dHRvblwiLCB7XHJcbiAgICAgIGNsczogW1wic3RvcC1nZW5lcmF0aW5nLWJ1dHRvblwiLCBcImRhbmdlci1vcHRpb25cIl0sXHJcbiAgICAgIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiU3RvcCBHZW5lcmF0aW9uXCIsIHRpdGxlOiBcIlN0b3AgR2VuZXJhdGlvblwiIH0sXHJcbiAgICB9KTtcclxuICAgIHNldEljb24odGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbiwgXCJzcXVhcmVcIik7XHJcbiAgICB0aGlzLnN0b3BHZW5lcmF0aW5nQnV0dG9uLmhpZGUoKTtcclxuICAgIHRoaXMuc2VuZEJ1dHRvbiA9IHRoaXMuYnV0dG9uc0NvbnRhaW5lci5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJzZW5kLWJ1dHRvblwiLCBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIlNlbmRcIiB9IH0pO1xyXG4gICAgc2V0SWNvbih0aGlzLnNlbmRCdXR0b24sIFwic2VuZFwiKTtcclxuICAgIHRoaXMudm9pY2VCdXR0b24gPSB0aGlzLmJ1dHRvbnNDb250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwge1xyXG4gICAgICBjbHM6IFwidm9pY2UtYnV0dG9uXCIsXHJcbiAgICAgIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiVm9pY2UgSW5wdXRcIiB9LFxyXG4gICAgfSk7XHJcbiAgICBzZXRJY29uKHRoaXMudm9pY2VCdXR0b24sIFwibWljXCIpO1xyXG4gICAgdGhpcy50b2dnbGVMb2NhdGlvbkJ1dHRvbiA9IHRoaXMuYnV0dG9uc0NvbnRhaW5lci5jcmVhdGVFbChcImJ1dHRvblwiLCB7XHJcbiAgICAgIGNsczogXCJ0b2dnbGUtbG9jYXRpb24tYnV0dG9uXCIsXHJcbiAgICAgIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiVG9nZ2xlIFZpZXcgTG9jYXRpb25cIiB9LFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLm1lbnVCdXR0b24gPSB0aGlzLmJ1dHRvbnNDb250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwibWVudS1idXR0b25cIiwgYXR0cjogeyBcImFyaWEtbGFiZWxcIjogXCJNZW51XCIgfSB9KTtcclxuICAgIHNldEljb24odGhpcy5tZW51QnV0dG9uLCBcIm1vcmUtdmVydGljYWxcIik7XHJcbiAgICB0aGlzLnVwZGF0ZVRvZ2dsZUxvY2F0aW9uQnV0dG9uKCk7XHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXIgPSBuZXcgRHJvcGRvd25NZW51TWFuYWdlcihcclxuICAgICAgdGhpcy5wbHVnaW4sXHJcbiAgICAgIHRoaXMuYXBwLFxyXG4gICAgICB0aGlzLFxyXG4gICAgICBpbnB1dENvbnRhaW5lcixcclxuICAgICAgaXNTaWRlYmFyTG9jYXRpb24sXHJcbiAgICAgIGlzRGVza3RvcFxyXG4gICAgKTtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlci5jcmVhdGVNZW51VUkoKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXR0YWNoRXZlbnRMaXN0ZW5lcnMoKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5yZXNpemVyRWwpIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMucmVzaXplckVsLCBcIm1vdXNlZG93blwiLCB0aGlzLm9uRHJhZ1N0YXJ0KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuaW5wdXRFbCkge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5pbnB1dEVsLCBcImtleWRvd25cIiwgdGhpcy5oYW5kbGVLZXlEb3duKTtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMuaW5wdXRFbCwgXCJpbnB1dFwiLCB0aGlzLmhhbmRsZUlucHV0Rm9yUmVzaXplKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnNlbmRCdXR0b24pIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMuc2VuZEJ1dHRvbiwgXCJjbGlja1wiLCB0aGlzLmhhbmRsZVNlbmRDbGljayk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbikge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbiwgXCJjbGlja1wiLCB0aGlzLmNhbmNlbEdlbmVyYXRpb24pO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMudm9pY2VCdXR0b24pIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMudm9pY2VCdXR0b24sIFwiY2xpY2tcIiwgdGhpcy5oYW5kbGVWb2ljZUNsaWNrKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uKSB7XHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLCBcImNsaWNrXCIsIHRoaXMuaGFuZGxlVHJhbnNsYXRlSW5wdXRDbGljayk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5tZW51QnV0dG9uKSB7XHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh0aGlzLm1lbnVCdXR0b24sIFwiY2xpY2tcIiwgdGhpcy5oYW5kbGVNZW51QnV0dG9uQ2xpY2spO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMudG9nZ2xlTG9jYXRpb25CdXR0b24pIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMudG9nZ2xlTG9jYXRpb25CdXR0b24sIFwiY2xpY2tcIiwgdGhpcy5oYW5kbGVUb2dnbGVWaWV3TG9jYXRpb25DbGljayk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5tb2RlbERpc3BsYXlFbCkge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5tb2RlbERpc3BsYXlFbCwgXCJjbGlja1wiLCB0aGlzLmhhbmRsZU1vZGVsRGlzcGxheUNsaWNrKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnJvbGVEaXNwbGF5RWwpIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMucm9sZURpc3BsYXlFbCwgXCJjbGlja1wiLCB0aGlzLmhhbmRsZVJvbGVEaXNwbGF5Q2xpY2spO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMudGVtcGVyYXR1cmVJbmRpY2F0b3JFbCkge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy50ZW1wZXJhdHVyZUluZGljYXRvckVsLCBcImNsaWNrXCIsIHRoaXMuaGFuZGxlVGVtcGVyYXR1cmVDbGljayk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5jaGF0Q29udGFpbmVyKSB7XHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh0aGlzLmNoYXRDb250YWluZXIsIFwic2Nyb2xsXCIsIHRoaXMuc2Nyb2xsTGlzdGVuZXJEZWJvdW5jZWQpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMubmV3TWVzc2FnZXNJbmRpY2F0b3JFbCkge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsLCBcImNsaWNrXCIsIHRoaXMuaGFuZGxlTmV3TWVzc2FnZUluZGljYXRvckNsaWNrKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnNjcm9sbFRvQm90dG9tQnV0dG9uKSB7XHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh0aGlzLnNjcm9sbFRvQm90dG9tQnV0dG9uLCBcImNsaWNrXCIsIHRoaXMuaGFuZGxlU2Nyb2xsVG9Cb3R0b21DbGljayk7XHJcbiAgICB9XHJcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCBcInJlc2l6ZVwiLCB0aGlzLmhhbmRsZVdpbmRvd1Jlc2l6ZSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQsIFwiY2xpY2tcIiwgdGhpcy5oYW5kbGVEb2N1bWVudENsaWNrRm9yTWVudSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQsIFwidmlzaWJpbGl0eWNoYW5nZVwiLCB0aGlzLmhhbmRsZVZpc2liaWxpdHlDaGFuZ2UpO1xyXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImFjdGl2ZS1sZWFmLWNoYW5nZVwiLCB0aGlzLmhhbmRsZUFjdGl2ZUxlYWZDaGFuZ2UpKTtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uYXR0YWNoRXZlbnRMaXN0ZW5lcnMoKTtcclxuICAgIHRoaXMucmVnaXN0ZXIodGhpcy5wbHVnaW4ub24oXCJtb2RlbC1jaGFuZ2VkXCIsIG1vZGVsTmFtZSA9PiB0aGlzLmhhbmRsZU1vZGVsQ2hhbmdlKG1vZGVsTmFtZSkpKTtcclxuICAgIHRoaXMucmVnaXN0ZXIodGhpcy5wbHVnaW4ub24oXCJyb2xlLWNoYW5nZWRcIiwgcm9sZU5hbWUgPT4gdGhpcy5oYW5kbGVSb2xlQ2hhbmdlKHJvbGVOYW1lKSkpO1xyXG4gICAgdGhpcy5yZWdpc3Rlcih0aGlzLnBsdWdpbi5vbihcInJvbGVzLXVwZGF0ZWRcIiwgKCkgPT4gdGhpcy5oYW5kbGVSb2xlc1VwZGF0ZWQoKSkpO1xyXG4gICAgdGhpcy5yZWdpc3Rlcih0aGlzLnBsdWdpbi5vbihcIm1lc3NhZ2UtYWRkZWRcIiwgZGF0YSA9PiB0aGlzLmhhbmRsZU1lc3NhZ2VBZGRlZChkYXRhKSkpO1xyXG4gICAgdGhpcy5yZWdpc3Rlcih0aGlzLnBsdWdpbi5vbihcImFjdGl2ZS1jaGF0LWNoYW5nZWRcIiwgZGF0YSA9PiB0aGlzLmhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkKGRhdGEpKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyKHRoaXMucGx1Z2luLm9uKFwibWVzc2FnZXMtY2xlYXJlZFwiLCBjaGF0SWQgPT4gdGhpcy5oYW5kbGVNZXNzYWdlc0NsZWFyZWQoY2hhdElkKSkpO1xyXG4gICAgdGhpcy5yZWdpc3Rlcih0aGlzLnBsdWdpbi5vbihcImNoYXQtbGlzdC11cGRhdGVkXCIsICgpID0+IHRoaXMuaGFuZGxlQ2hhdExpc3RVcGRhdGVkKCkpKTtcclxuICAgIHRoaXMucmVnaXN0ZXIodGhpcy5wbHVnaW4ub24oXCJzZXR0aW5ncy11cGRhdGVkXCIsICgpID0+IHRoaXMuaGFuZGxlU2V0dGluZ3NVcGRhdGVkKCkpKTtcclxuICAgIHRoaXMucmVnaXN0ZXIodGhpcy5wbHVnaW4ub24oXCJtZXNzYWdlLWRlbGV0ZWRcIiwgZGF0YSA9PiB0aGlzLmhhbmRsZU1lc3NhZ2VEZWxldGVkKGRhdGEpKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyKHRoaXMucGx1Z2luLm9uKFwib2xsYW1hLWNvbm5lY3Rpb24tZXJyb3JcIiwgKCkgPT4ge30pKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY2FuY2VsR2VuZXJhdGlvbiA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICh0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIpIHtcclxuICAgICAgdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyLmFib3J0KCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlTWVzc2FnZURlbGV0ZWQgPSAoZGF0YTogeyBjaGF0SWQ6IHN0cmluZzsgdGltZXN0YW1wOiBEYXRlIH0pOiB2b2lkID0+IHtcclxuICAgIGNvbnN0IGN1cnJlbnRBY3RpdmVDaGF0SWQgPSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdElkKCk7XHJcblxyXG4gICAgaWYgKGRhdGEuY2hhdElkICE9PSBjdXJyZW50QWN0aXZlQ2hhdElkIHx8ICF0aGlzLmNoYXRDb250YWluZXIpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHRpbWVzdGFtcE1zID0gZGF0YS50aW1lc3RhbXAuZ2V0VGltZSgpO1xyXG4gICAgY29uc3Qgc2VsZWN0b3IgPSBgLiR7Q1NTX0NMQVNTRVMuTUVTU0FHRV9HUk9VUH1bZGF0YS10aW1lc3RhbXA9XCIke3RpbWVzdGFtcE1zfVwiXWA7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgbWVzc2FnZUdyb3VwRWwgPSB0aGlzLmNoYXRDb250YWluZXIucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcblxyXG4gICAgICBpZiAobWVzc2FnZUdyb3VwRWwgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRTY3JvbGxUb3AgPSB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG9wO1xyXG4gICAgICAgIGNvbnN0IHJlbW92ZWRIZWlnaHQgPSBtZXNzYWdlR3JvdXBFbC5vZmZzZXRIZWlnaHQ7XHJcbiAgICAgICAgY29uc3Qgd2FzQWJvdmVWaWV3cG9ydCA9IG1lc3NhZ2VHcm91cEVsLm9mZnNldFRvcCA8IGN1cnJlbnRTY3JvbGxUb3A7XHJcblxyXG4gICAgICAgIG1lc3NhZ2VHcm91cEVsLnJlbW92ZSgpO1xyXG5cclxuICAgICAgICBjb25zdCBpbml0aWFsTGVuZ3RoID0gdGhpcy5jdXJyZW50TWVzc2FnZXMubGVuZ3RoO1xyXG4gICAgICAgIHRoaXMuY3VycmVudE1lc3NhZ2VzID0gdGhpcy5jdXJyZW50TWVzc2FnZXMuZmlsdGVyKG1zZyA9PiBtc2cudGltZXN0YW1wLmdldFRpbWUoKSAhPT0gdGltZXN0YW1wTXMpO1xyXG5cclxuICAgICAgICBpZiAod2FzQWJvdmVWaWV3cG9ydCkge1xyXG4gICAgICAgICAgY29uc3QgbmV3U2Nyb2xsVG9wID0gY3VycmVudFNjcm9sbFRvcCAtIHJlbW92ZWRIZWlnaHQ7XHJcbiAgICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG9wID0gbmV3U2Nyb2xsVG9wID49IDAgPyBuZXdTY3JvbGxUb3AgOiAwO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG9wID0gY3VycmVudFNjcm9sbFRvcDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRNZXNzYWdlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgIHRoaXMuc2hvd0VtcHR5U3RhdGUoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAobWVzc2FnZUdyb3VwRWwpIHtcclxuICAgICAgICB0aGlzLmxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdCgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdCgpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgdXBkYXRlUm9sZVBhbmVsTGlzdCA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRoaXMucm9sZVBhbmVsTGlzdEVsO1xyXG4gICAgaWYgKCFjb250YWluZXIgfHwgIXRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5yb2xlUGFuZWxIZWFkZXJFbD8uZ2V0QXR0cmlidXRlKFwiZGF0YS1jb2xsYXBzZWRcIikgPT09IFwidHJ1ZVwiKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjdXJyZW50U2Nyb2xsVG9wID0gY29udGFpbmVyLnNjcm9sbFRvcDtcclxuICAgIGNvbnRhaW5lci5lbXB0eSgpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJvbGVzID0gYXdhaXQgdGhpcy5wbHVnaW4ubGlzdFJvbGVGaWxlcyh0cnVlKTtcclxuICAgICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXQoKTtcclxuICAgICAgY29uc3QgY3VycmVudFJvbGVQYXRoID0gYWN0aXZlQ2hhdD8ubWV0YWRhdGE/LnNlbGVjdGVkUm9sZVBhdGggPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aDtcclxuXHJcbiAgICAgIGNvbnN0IG5vbmVPcHRpb25FbCA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFtDU1NfUk9MRV9QQU5FTF9JVEVNLCBDU1NfUk9MRV9QQU5FTF9JVEVNX05PTkUsIFwibWVudS1vcHRpb25cIl0gfSk7XHJcbiAgICAgIGNvbnN0IG5vbmVJY29uU3BhbiA9IG5vbmVPcHRpb25FbC5jcmVhdGVTcGFuKHsgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTV9JQ09OLCBcIm1lbnUtb3B0aW9uLWljb25cIl0gfSk7XHJcbiAgICAgIG5vbmVPcHRpb25FbC5jcmVhdGVTcGFuKHsgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTV9URVhULCBcIm1lbnUtb3B0aW9uLXRleHRcIl0sIHRleHQ6IFwiTm9uZVwiIH0pO1xyXG4gICAgICBpZiAoIWN1cnJlbnRSb2xlUGF0aCkge1xyXG4gICAgICAgIG5vbmVPcHRpb25FbC5hZGRDbGFzcyhDU1NfUk9MRV9QQU5FTF9JVEVNX0FDVElWRSk7XHJcbiAgICAgICAgc2V0SWNvbihub25lSWNvblNwYW4sIFwiY2hlY2tcIik7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgc2V0SWNvbihub25lSWNvblNwYW4sIFwic2xhc2hcIik7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KG5vbmVPcHRpb25FbCwgXCJjbGlja1wiLCAoKSA9PiB0aGlzLmhhbmRsZVJvbGVQYW5lbEl0ZW1DbGljayhudWxsLCBjdXJyZW50Um9sZVBhdGgpKTtcclxuXHJcbiAgICAgIHJvbGVzLmZvckVhY2gocm9sZUluZm8gPT4ge1xyXG4gICAgICAgIGNvbnN0IHJvbGVPcHRpb25FbCA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFtDU1NfUk9MRV9QQU5FTF9JVEVNLCBcIm1lbnUtb3B0aW9uXCJdIH0pO1xyXG4gICAgICAgIGNvbnN0IGljb25TcGFuID0gcm9sZU9wdGlvbkVsLmNyZWF0ZVNwYW4oeyBjbHM6IFtDU1NfUk9MRV9QQU5FTF9JVEVNX0lDT04sIFwibWVudS1vcHRpb24taWNvblwiXSB9KTtcclxuICAgICAgICByb2xlT3B0aW9uRWwuY3JlYXRlU3Bhbih7IGNsczogW0NTU19ST0xFX1BBTkVMX0lURU1fVEVYVCwgXCJtZW51LW9wdGlvbi10ZXh0XCJdLCB0ZXh0OiByb2xlSW5mby5uYW1lIH0pO1xyXG4gICAgICAgIGlmIChyb2xlSW5mby5pc0N1c3RvbSkge1xyXG4gICAgICAgICAgcm9sZU9wdGlvbkVsLmFkZENsYXNzKENTU19ST0xFX1BBTkVMX0lURU1fQ1VTVE9NKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHJvbGVJbmZvLnBhdGggPT09IGN1cnJlbnRSb2xlUGF0aCkge1xyXG4gICAgICAgICAgcm9sZU9wdGlvbkVsLmFkZENsYXNzKENTU19ST0xFX1BBTkVMX0lURU1fQUNUSVZFKTtcclxuICAgICAgICAgIHNldEljb24oaWNvblNwYW4sIFwiY2hlY2tcIik7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHNldEljb24oaWNvblNwYW4sIHJvbGVJbmZvLmlzQ3VzdG9tID8gXCJ1c2VyXCIgOiBcImZpbGUtdGV4dFwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHJvbGVPcHRpb25FbCwgXCJjbGlja1wiLCAoKSA9PiB0aGlzLmhhbmRsZVJvbGVQYW5lbEl0ZW1DbGljayhyb2xlSW5mbywgY3VycmVudFJvbGVQYXRoKSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29udGFpbmVyLmVtcHR5KCk7XHJcbiAgICAgIGNvbnRhaW5lci5jcmVhdGVEaXYoeyB0ZXh0OiBcIkVycm9yIGxvYWRpbmcgcm9sZXMuXCIsIGNsczogXCJtZW51LWVycm9yLXRleHRcIiB9KTtcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgY29udGFpbmVyLnNjcm9sbFRvcCA9IGN1cnJlbnRTY3JvbGxUb3A7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlUm9sZVBhbmVsSXRlbUNsaWNrID0gYXN5bmMgKFxyXG4gICAgcm9sZUluZm86IFJvbGVJbmZvIHwgbnVsbCxcclxuICAgIGN1cnJlbnRSb2xlUGF0aDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZFxyXG4gICk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgY29uc3QgbmV3Um9sZVBhdGggPSByb2xlSW5mbz8ucGF0aCA/PyBcIlwiO1xyXG4gICAgY29uc3Qgcm9sZU5hbWVGb3JFdmVudCA9IHJvbGVJbmZvPy5uYW1lID8/IFwiTm9uZVwiO1xyXG5cclxuICAgIGlmIChuZXdSb2xlUGF0aCAhPT0gY3VycmVudFJvbGVQYXRoKSB7XHJcbiAgICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdCgpO1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGlmIChhY3RpdmVDaGF0KSB7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci51cGRhdGVBY3RpdmVDaGF0TWV0YWRhdGEoe1xyXG4gICAgICAgICAgICBzZWxlY3RlZFJvbGVQYXRoOiBuZXdSb2xlUGF0aCxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoID0gbmV3Um9sZVBhdGg7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwicm9sZS1jaGFuZ2VkXCIsIHJvbGVOYW1lRm9yRXZlbnQpO1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ucHJvbXB0U2VydmljZT8uY2xlYXJSb2xlQ2FjaGU/LigpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIHNldCB0aGUgcm9sZS5cIik7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSB1cGRhdGVUb2dnbGVMb2NhdGlvbkJ1dHRvbigpOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy50b2dnbGVMb2NhdGlvbkJ1dHRvbikgcmV0dXJuO1xyXG5cclxuICAgIGxldCBpY29uTmFtZTogc3RyaW5nO1xyXG4gICAgbGV0IHRpdGxlVGV4dDogc3RyaW5nO1xyXG5cclxuICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuQ2hhdEluVGFiKSB7XHJcbiAgICAgIGljb25OYW1lID0gXCJzaWRlYmFyLXJpZ2h0XCI7XHJcbiAgICAgIHRpdGxlVGV4dCA9IFwiTW92ZSB0byBTaWRlYmFyXCI7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBpY29uTmFtZSA9IFwibGF5b3V0LWxpc3RcIjtcclxuICAgICAgdGl0bGVUZXh0ID0gXCJNb3ZlIHRvIFRhYlwiO1xyXG4gICAgfVxyXG4gICAgc2V0SWNvbih0aGlzLnRvZ2dsZUxvY2F0aW9uQnV0dG9uLCBpY29uTmFtZSk7XHJcbiAgICB0aGlzLnRvZ2dsZUxvY2F0aW9uQnV0dG9uLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgdGl0bGVUZXh0KTtcclxuICAgIHRoaXMudG9nZ2xlTG9jYXRpb25CdXR0b24udGl0bGUgPSB0aXRsZVRleHQ7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZU1vZGVsRGlzcGxheUNsaWNrID0gYXN5bmMgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICBjb25zdCBtZW51ID0gbmV3IE1lbnUoKTtcclxuICAgIGxldCBpdGVtc0FkZGVkID0gZmFsc2U7XHJcblxyXG4gICAgY29uc3QgbG9hZGluZ05vdGljZSA9IG5ldyBOb3RpY2UoXCJMb2FkaW5nIG1vZGVscy4uLlwiLCAwKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBtb2RlbHMgPSBhd2FpdCB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdldE1vZGVscygpO1xyXG4gICAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgICAgY29uc3QgY3VycmVudE1vZGVsTmFtZSA9IGFjdGl2ZUNoYXQ/Lm1ldGFkYXRhPy5tb2RlbE5hbWUgfHwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xyXG5cclxuICAgICAgbG9hZGluZ05vdGljZS5oaWRlKCk7XHJcblxyXG4gICAgICBpZiAobW9kZWxzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IGl0ZW0uc2V0VGl0bGUoXCJObyBtb2RlbHMgZm91bmRcIikuc2V0RGlzYWJsZWQodHJ1ZSkpO1xyXG4gICAgICAgIGl0ZW1zQWRkZWQgPSB0cnVlO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIG1vZGVscy5mb3JFYWNoKG1vZGVsTmFtZSA9PiB7XHJcbiAgICAgICAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxyXG4gICAgICAgICAgICBpdGVtXHJcbiAgICAgICAgICAgICAgLnNldFRpdGxlKG1vZGVsTmFtZSlcclxuICAgICAgICAgICAgICAuc2V0SWNvbihtb2RlbE5hbWUgPT09IGN1cnJlbnRNb2RlbE5hbWUgPyBcImNoZWNrXCIgOiBcInJhZGlvLWJ1dHRvblwiKVxyXG4gICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNoYXRUb1VwZGF0ZSA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBsYXRlc3RNb2RlbE5hbWUgPSBjaGF0VG9VcGRhdGU/Lm1ldGFkYXRhPy5tb2RlbE5hbWUgfHwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xyXG4gICAgICAgICAgICAgICAgaWYgKG1vZGVsTmFtZSAhPT0gbGF0ZXN0TW9kZWxOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgIGlmIChjaGF0VG9VcGRhdGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci51cGRhdGVBY3RpdmVDaGF0TWV0YWRhdGEoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgbW9kZWxOYW1lOiBtb2RlbE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkNhbm5vdCBzZXQgbW9kZWw6IE5vIGFjdGl2ZSBjaGF0LlwiKTtcclxuICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgaXRlbXNBZGRlZCA9IHRydWU7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGxvYWRpbmdOb3RpY2UuaGlkZSgpO1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgbG9hZGluZyBtb2RlbHMgZm9yIG1vZGVsIHNlbGVjdGlvbiBtZW51OlwiLCBlcnJvcik7XHJcbiAgICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IGl0ZW0uc2V0VGl0bGUoXCJFcnJvciBsb2FkaW5nIG1vZGVsc1wiKS5zZXREaXNhYmxlZCh0cnVlKSk7XHJcbiAgICAgIGl0ZW1zQWRkZWQgPSB0cnVlO1xyXG4gICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIGxvYWQgbW9kZWxzLiBDaGVjayBPbGxhbWEgY29ubmVjdGlvbi5cIik7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBpZiAoaXRlbXNBZGRlZCkge1xyXG4gICAgICAgIG1lbnUuc2hvd0F0TW91c2VFdmVudChldmVudCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKFwiTW9kZWwgbWVudSB3YXMgbm90IHNob3duIGJlY2F1c2Ugbm8gaXRlbXMgd2VyZSBhZGRlZC5cIik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwcml2YXRlIHVwZGF0ZU1vZGVsRGlzcGxheShtb2RlbE5hbWU6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLm1vZGVsRGlzcGxheUVsKSB7XHJcbiAgICAgIGlmIChtb2RlbE5hbWUpIHtcclxuICAgICAgICBjb25zdCBkaXNwbGF5TmFtZSA9IG1vZGVsTmFtZTtcclxuICAgICAgICBjb25zdCBzaG9ydE5hbWUgPSBkaXNwbGF5TmFtZS5yZXBsYWNlKC86bGF0ZXN0JC8sIFwiXCIpO1xyXG4gICAgICAgIHRoaXMubW9kZWxEaXNwbGF5RWwuc2V0VGV4dChzaG9ydE5hbWUpO1xyXG4gICAgICAgIHRoaXMubW9kZWxEaXNwbGF5RWwudGl0bGUgPSBgQ3VycmVudCBtb2RlbDogJHtkaXNwbGF5TmFtZX0uIENsaWNrIHRvIGNoYW5nZS5gO1xyXG5cclxuICAgICAgICB0aGlzLm1vZGVsRGlzcGxheUVsLnJlbW92ZUNsYXNzKFwibW9kZWwtbm90LWF2YWlsYWJsZVwiKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLm1vZGVsRGlzcGxheUVsLnNldFRleHQoXCJOb3QgYXZhaWxhYmxlXCIpO1xyXG4gICAgICAgIHRoaXMubW9kZWxEaXNwbGF5RWwudGl0bGUgPVxyXG4gICAgICAgICAgXCJObyBPbGxhbWEgbW9kZWxzIGRldGVjdGVkLiBDaGVjayBPbGxhbWEgY29ubmVjdGlvbiBhbmQgZW5zdXJlIG1vZGVscyBhcmUgaW5zdGFsbGVkLlwiO1xyXG5cclxuICAgICAgICB0aGlzLm1vZGVsRGlzcGxheUVsLmFkZENsYXNzKFwibW9kZWwtbm90LWF2YWlsYWJsZVwiKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIltPbGxhbWFWaWV3XSBtb2RlbERpc3BsYXlFbCBpcyBtaXNzaW5nIVwiKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlS2V5RG93biA9IChlOiBLZXlib2FyZEV2ZW50KTogdm9pZCA9PiB7XHJcbiAgICBpZiAoZS5rZXkgPT09IFwiRW50ZXJcIiAmJiAhZS5zaGlmdEtleSAmJiAhdGhpcy5pc1Byb2Nlc3NpbmcgJiYgIXRoaXMuc2VuZEJ1dHRvbj8uZGlzYWJsZWQpIHtcclxuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICB0aGlzLnNlbmRNZXNzYWdlKCk7XHJcbiAgICB9XHJcbiAgfTtcclxuICBwcml2YXRlIGhhbmRsZVNlbmRDbGljayA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICghdGhpcy5pc1Byb2Nlc3NpbmcgJiYgIXRoaXMuc2VuZEJ1dHRvbj8uZGlzYWJsZWQpIHtcclxuICAgICAgdGhpcy5zZW5kTWVzc2FnZSgpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgIH1cclxuICB9O1xyXG4gIHByaXZhdGUgaGFuZGxlSW5wdXRGb3JSZXNpemUgPSAoKTogdm9pZCA9PiB7XHJcbiAgICBpZiAodGhpcy5yZXNpemVUaW1lb3V0KSBjbGVhclRpbWVvdXQodGhpcy5yZXNpemVUaW1lb3V0KTtcclxuICAgIHRoaXMucmVzaXplVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICB0aGlzLmFkanVzdFRleHRhcmVhSGVpZ2h0KCk7XHJcbiAgICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcbiAgICB9LCA3NSk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVWb2ljZUNsaWNrID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgdGhpcy50b2dnbGVWb2ljZVJlY29nbml0aW9uKCk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVUcmFuc2xhdGVJbnB1dENsaWNrID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgY29uc3QgY3VycmVudFRleHQgPSB0aGlzLmlucHV0RWwudmFsdWU7XHJcblxyXG4gICAgY29uc3QgdGFyZ2V0TGFuZyA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uVGFyZ2V0TGFuZ3VhZ2U7XHJcblxyXG4gICAgaWYgKCFjdXJyZW50VGV4dC50cmltKCkpIHtcclxuICAgICAgbmV3IE5vdGljZShcIklucHV0IGlzIGVtcHR5LCBub3RoaW5nIHRvIHRyYW5zbGF0ZS5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVRyYW5zbGF0aW9uIHx8IHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uUHJvdmlkZXIgPT09IFwibm9uZVwiKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJUcmFuc2xhdGlvbiBkaXNhYmxlZCBvciBwcm92aWRlciBub3Qgc2VsZWN0ZWQgaW4gc2V0dGluZ3MuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCF0YXJnZXRMYW5nKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJUYXJnZXQgbGFuZ3VhZ2UgZm9yIHRyYW5zbGF0aW9uIGlzIG5vdCBzZXQgaW4gc2V0dGluZ3MuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgc2V0SWNvbih0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLCBcImxvYWRlclwiKTtcclxuICAgIHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgdGhpcy50cmFuc2xhdGVJbnB1dEJ1dHRvbi5jbGFzc0xpc3QuYWRkKENTU19DTEFTU19UUkFOU0xBVElOR19JTlBVVCk7XHJcbiAgICB0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLnRpdGxlID0gXCJUcmFuc2xhdGluZy4uLlwiO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHRyYW5zbGF0ZWRUZXh0ID0gYXdhaXQgdGhpcy5wbHVnaW4udHJhbnNsYXRpb25TZXJ2aWNlLnRyYW5zbGF0ZShjdXJyZW50VGV4dCwgXCJFbmdsaXNoXCIpO1xyXG5cclxuICAgICAgaWYgKHRyYW5zbGF0ZWRUZXh0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgdGhpcy5pbnB1dEVsLnZhbHVlID0gdHJhbnNsYXRlZFRleHQ7XHJcbiAgICAgICAgdGhpcy5pbnB1dEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIikpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRFbC5mb2N1cygpO1xyXG5cclxuICAgICAgICBpZiAodHJhbnNsYXRlZFRleHQpIHtcclxuICAgICAgICAgIGNvbnN0IGVuZCA9IHRyYW5zbGF0ZWRUZXh0Lmxlbmd0aDtcclxuICAgICAgICAgIHRoaXMuaW5wdXRFbC5zZXRTZWxlY3Rpb25SYW5nZShlbmQsIGVuZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBuZXcgTm90aWNlKFwiSW5wdXQgdHJhbnNsYXRpb24gZW5jb3VudGVyZWQgYW4gdW5leHBlY3RlZCBlcnJvci5cIik7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBzZXRJY29uKHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24sIFwibGFuZ3VhZ2VzXCIpO1xyXG5cclxuICAgICAgdGhpcy50cmFuc2xhdGVJbnB1dEJ1dHRvbi5kaXNhYmxlZCA9IHRoaXMuaXNQcm9jZXNzaW5nO1xyXG4gICAgICB0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1RSQU5TTEFUSU5HX0lOUFVUKTtcclxuXHJcbiAgICAgIHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24udGl0bGUgPSBgVHJhbnNsYXRlIGlucHV0IHRvICR7TEFOR1VBR0VTW3RhcmdldExhbmddIHx8IHRhcmdldExhbmd9YDtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwdWJsaWMgaGFuZGxlTmV3Q2hhdENsaWNrID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyPy5jbG9zZU1lbnUoKTtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IG5ld0NoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jcmVhdGVOZXdDaGF0KCk7XHJcbiAgICAgIGlmIChuZXdDaGF0KSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShgQ3JlYXRlZCBuZXcgY2hhdDogJHtuZXdDaGF0Lm1ldGFkYXRhLm5hbWV9YCk7XHJcbiAgICAgICAgdGhpcy5mb2N1c0lucHV0KCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBjcmVhdGUgbmV3IGNoYXQuXCIpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBuZXcgTm90aWNlKFwiRXJyb3IgY3JlYXRpbmcgbmV3IGNoYXQuXCIpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHB1YmxpYyBoYW5kbGVSZW5hbWVDaGF0Q2xpY2sgPSBhc3luYyAoY2hhdElkVG9SZW5hbWU/OiBzdHJpbmcsIGN1cnJlbnRDaGF0TmFtZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgbGV0IGNoYXRJZDogc3RyaW5nIHwgbnVsbCA9IGNoYXRJZFRvUmVuYW1lID8/IG51bGw7XHJcbiAgICBsZXQgY3VycmVudE5hbWU6IHN0cmluZyB8IG51bGwgPSBjdXJyZW50Q2hhdE5hbWUgPz8gbnVsbDtcclxuXHJcbiAgICBpZiAoIWNoYXRJZCB8fCAhY3VycmVudE5hbWUpIHtcclxuICAgICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICAgIGlmICghYWN0aXZlQ2hhdCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJObyBhY3RpdmUgY2hhdCB0byByZW5hbWUuXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBjaGF0SWQgPSBhY3RpdmVDaGF0Lm1ldGFkYXRhLmlkO1xyXG4gICAgICBjdXJyZW50TmFtZSA9IGFjdGl2ZUNoYXQubWV0YWRhdGEubmFtZTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXI/LmNsb3NlTWVudSgpO1xyXG5cclxuICAgIGlmICghY2hhdElkIHx8IGN1cnJlbnROYW1lID09PSBudWxsKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJDb3VsZCBub3QgaW5pdGlhdGUgcmVuYW1lIHByb2Nlc3MuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgbmV3IFByb21wdE1vZGFsKHRoaXMuYXBwLCBcIlJlbmFtZSBDaGF0XCIsIGBFbnRlciBuZXcgbmFtZSBmb3IgXCIke2N1cnJlbnROYW1lfVwiOmAsIGN1cnJlbnROYW1lLCBhc3luYyBuZXdOYW1lID0+IHtcclxuICAgICAgbGV0IG5vdGljZU1lc3NhZ2UgPSBcIlJlbmFtZSBjYW5jZWxsZWQgb3IgbmFtZSB1bmNoYW5nZWQuXCI7XHJcbiAgICAgIGNvbnN0IHRyaW1tZWROYW1lID0gbmV3TmFtZT8udHJpbSgpO1xyXG5cclxuICAgICAgaWYgKHRyaW1tZWROYW1lICYmIHRyaW1tZWROYW1lICE9PSBcIlwiICYmIHRyaW1tZWROYW1lICE9PSBjdXJyZW50TmFtZSkge1xyXG4gICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZW5hbWVDaGF0KGNoYXRJZCEsIHRyaW1tZWROYW1lKTtcclxuXHJcbiAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgIG5vdGljZU1lc3NhZ2UgPSBgQ2hhdCByZW5hbWVkIHRvIFwiJHt0cmltbWVkTmFtZX1cImA7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIG5vdGljZU1lc3NhZ2UgPSBcIkZhaWxlZCB0byByZW5hbWUgY2hhdC5cIjtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAodHJpbW1lZE5hbWUgJiYgdHJpbW1lZE5hbWUgPT09IGN1cnJlbnROYW1lKSB7XHJcbiAgICAgICAgbm90aWNlTWVzc2FnZSA9IFwiTmFtZSB1bmNoYW5nZWQuXCI7XHJcbiAgICAgIH0gZWxzZSBpZiAobmV3TmFtZSA9PT0gbnVsbCB8fCB0cmltbWVkTmFtZSA9PT0gXCJcIikge1xyXG4gICAgICAgIG5vdGljZU1lc3NhZ2UgPSBcIlJlbmFtZSBjYW5jZWxsZWQgb3IgaW52YWxpZCBuYW1lIGVudGVyZWQuXCI7XHJcbiAgICAgIH1cclxuICAgICAgbmV3IE5vdGljZShub3RpY2VNZXNzYWdlKTtcclxuICAgICAgdGhpcy5mb2N1c0lucHV0KCk7XHJcbiAgICB9KS5vcGVuKCk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVDb250ZXh0TWVudVJlbmFtZShjaGF0SWQ6IHN0cmluZywgY3VycmVudE5hbWU6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgdGhpcy5oYW5kbGVSZW5hbWVDaGF0Q2xpY2soY2hhdElkLCBjdXJyZW50TmFtZSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgaGFuZGxlQ2xvbmVDaGF0Q2xpY2sgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXI/LmNsb3NlTWVudSgpO1xyXG4gICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICBpZiAoIWFjdGl2ZUNoYXQpIHtcclxuICAgICAgbmV3IE5vdGljZShcIk5vIGFjdGl2ZSBjaGF0IHRvIGNsb25lLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY29uc3QgY2xvbmluZ05vdGljZSA9IG5ldyBOb3RpY2UoXCJDbG9uaW5nIGNoYXQuLi5cIiwgMCk7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjbG9uZWRDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2xvbmVDaGF0KGFjdGl2ZUNoYXQubWV0YWRhdGEuaWQpO1xyXG4gICAgICBpZiAoY2xvbmVkQ2hhdCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoYENoYXQgY2xvbmVkIGFzIFwiJHtjbG9uZWRDaGF0Lm1ldGFkYXRhLm5hbWV9XCIgYW5kIGFjdGl2YXRlZC5gKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIGNsb25lIGNoYXQuXCIpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBuZXcgTm90aWNlKFwiQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgY2xvbmluZyB0aGUgY2hhdC5cIik7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBjbG9uaW5nTm90aWNlLmhpZGUoKTtcclxuICAgIH1cclxuICB9O1xyXG4gIHB1YmxpYyBoYW5kbGVDbGVhckNoYXRDbGljayA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uY2xvc2VNZW51KCk7XHJcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgIGlmIChhY3RpdmVDaGF0KSB7XHJcbiAgICAgIGNvbnN0IGNoYXROYW1lID0gYWN0aXZlQ2hhdC5tZXRhZGF0YS5uYW1lO1xyXG4gICAgICBuZXcgQ29uZmlybU1vZGFsKFxyXG4gICAgICAgIHRoaXMuYXBwLFxyXG4gICAgICAgIFwiQ2xlYXIgQ2hhdCBNZXNzYWdlc1wiLFxyXG4gICAgICAgIGBBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gY2xlYXIgYWxsIG1lc3NhZ2VzIGluIGNoYXQgXCIke2NoYXROYW1lfVwiP1xcblRoaXMgYWN0aW9uIGNhbm5vdCBiZSB1bmRvbmUuYCxcclxuICAgICAgICAoKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jbGVhckFjdGl2ZUNoYXRNZXNzYWdlcygpO1xyXG4gICAgICAgIH1cclxuICAgICAgKS5vcGVuKCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBuZXcgTm90aWNlKFwiTm8gYWN0aXZlIGNoYXQgdG8gY2xlYXIuXCIpO1xyXG4gICAgfVxyXG4gIH07XHJcbiAgcHVibGljIGhhbmRsZURlbGV0ZUNoYXRDbGljayA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uY2xvc2VNZW51KCk7XHJcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgIGlmIChhY3RpdmVDaGF0KSB7XHJcbiAgICAgIGNvbnN0IGNoYXROYW1lID0gYWN0aXZlQ2hhdC5tZXRhZGF0YS5uYW1lO1xyXG4gICAgICBuZXcgQ29uZmlybU1vZGFsKFxyXG4gICAgICAgIHRoaXMuYXBwLFxyXG4gICAgICAgIFwiRGVsZXRlIENoYXRcIixcclxuICAgICAgICBgQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSBjaGF0IFwiJHtjaGF0TmFtZX1cIj9cXG5UaGlzIGFjdGlvbiBjYW5ub3QgYmUgdW5kb25lLmAsXHJcbiAgICAgICAgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgY29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmRlbGV0ZUNoYXQoYWN0aXZlQ2hhdC5tZXRhZGF0YS5pZCk7XHJcbiAgICAgICAgICBpZiAoc3VjY2Vzcykge1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKGBDaGF0IFwiJHtjaGF0TmFtZX1cIiBkZWxldGVkLmApO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShgRmFpbGVkIHRvIGRlbGV0ZSBjaGF0IFwiJHtjaGF0TmFtZX1cIi5gKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICkub3BlbigpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgbmV3IE5vdGljZShcIk5vIGFjdGl2ZSBjaGF0IHRvIGRlbGV0ZS5cIik7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHVibGljIGhhbmRsZUV4cG9ydENoYXRDbGljayA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uY2xvc2VNZW51KCk7XHJcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgIGlmICghYWN0aXZlQ2hhdCB8fCBhY3RpdmVDaGF0Lm1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBuZXcgTm90aWNlKFwiQ2hhdCBlbXB0eSwgbm90aGluZyB0byBleHBvcnQuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBtYXJrZG93bkNvbnRlbnQgPSB0aGlzLmZvcm1hdENoYXRUb01hcmtkb3duKGFjdGl2ZUNoYXQubWVzc2FnZXMpO1xyXG4gICAgICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkucmVwbGFjZSgvWzouXS9nLCBcIi1cIik7XHJcbiAgICAgIGNvbnN0IHNhZmVOYW1lID0gYWN0aXZlQ2hhdC5tZXRhZGF0YS5uYW1lLnJlcGxhY2UoL1tcXFxcLz86KlwiPD58XS9nLCBcIi1cIik7XHJcbiAgICAgIGNvbnN0IGZpbGVuYW1lID0gYG9sbGFtYS1jaGF0LSR7c2FmZU5hbWV9LSR7dGltZXN0YW1wfS5tZGA7XHJcblxyXG4gICAgICBsZXQgdGFyZ2V0Rm9sZGVyUGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmNoYXRFeHBvcnRGb2xkZXJQYXRoPy50cmltKCk7XHJcbiAgICAgIGxldCB0YXJnZXRGb2xkZXI6IFRGb2xkZXIgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAgIGlmICh0YXJnZXRGb2xkZXJQYXRoKSB7XHJcbiAgICAgICAgdGFyZ2V0Rm9sZGVyUGF0aCA9IG5vcm1hbGl6ZVBhdGgodGFyZ2V0Rm9sZGVyUGF0aCk7XHJcbiAgICAgICAgY29uc3QgYWJzdHJhY3RGaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHRhcmdldEZvbGRlclBhdGgpO1xyXG4gICAgICAgIGlmICghYWJzdHJhY3RGaWxlKSB7XHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIodGFyZ2V0Rm9sZGVyUGF0aCk7XHJcbiAgICAgICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh0YXJnZXRGb2xkZXJQYXRoKSBhcyBURm9sZGVyO1xyXG4gICAgICAgICAgICBpZiAodGFyZ2V0Rm9sZGVyKSB7XHJcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShgQ3JlYXRlZCBleHBvcnQgZm9sZGVyOiAke3RhcmdldEZvbGRlclBhdGh9YCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgY3JlYXRpbmcgZXhwb3J0IGZvbGRlci4gU2F2aW5nIHRvIHZhdWx0IHJvb3QuYCk7XHJcbiAgICAgICAgICAgICAgdGFyZ2V0Rm9sZGVyID0gdGhpcy5hcHAudmF1bHQuZ2V0Um9vdCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgY3JlYXRpbmcgZXhwb3J0IGZvbGRlci4gU2F2aW5nIHRvIHZhdWx0IHJvb3QuYCk7XHJcbiAgICAgICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldFJvb3QoKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKGFic3RyYWN0RmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIpIHtcclxuICAgICAgICAgIHRhcmdldEZvbGRlciA9IGFic3RyYWN0RmlsZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgbmV3IE5vdGljZShgRXJyb3I6IEV4cG9ydCBwYXRoIGlzIG5vdCBhIGZvbGRlci4gU2F2aW5nIHRvIHZhdWx0IHJvb3QuYCk7XHJcbiAgICAgICAgICB0YXJnZXRGb2xkZXIgPSB0aGlzLmFwcC52YXVsdC5nZXRSb290KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldFJvb3QoKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCF0YXJnZXRGb2xkZXIpIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3IgZGV0ZXJtaW5pbmcgZXhwb3J0IGZvbGRlci4gQ2Fubm90IHNhdmUgZmlsZS5cIik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBmaWxlUGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7dGFyZ2V0Rm9sZGVyLnBhdGh9LyR7ZmlsZW5hbWV9YCk7XHJcblxyXG4gICAgICBjb25zdCBleGlzdGluZ0ZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xyXG4gICAgICBpZiAoZXhpc3RpbmdGaWxlKSB7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGZpbGUgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUoZmlsZVBhdGgsIG1hcmtkb3duQ29udGVudCk7XHJcbiAgICAgIG5ldyBOb3RpY2UoYENoYXQgZXhwb3J0ZWQgdG8gJHtmaWxlLnBhdGh9YCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKFwiRmlsZSBhbHJlYWR5IGV4aXN0c1wiKSkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBleHBvcnRpbmcgY2hhdDogRmlsZSBhbHJlYWR5IGV4aXN0cy5cIik7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIkFuIHVuZXhwZWN0ZWQgZXJyb3Igb2NjdXJyZWQgZHVyaW5nIGNoYXQgZXhwb3J0LlwiKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHB1YmxpYyBoYW5kbGVTZXR0aW5nc0NsaWNrID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyPy5jbG9zZU1lbnUoKTtcclxuICAgICh0aGlzLmFwcCBhcyBhbnkpLnNldHRpbmc/Lm9wZW4/LigpO1xyXG4gICAgKHRoaXMuYXBwIGFzIGFueSkuc2V0dGluZz8ub3BlblRhYkJ5SWQ/Lih0aGlzLnBsdWdpbi5tYW5pZmVzdC5pZCk7XHJcbiAgfTtcclxuICBwcml2YXRlIGhhbmRsZURvY3VtZW50Q2xpY2tGb3JNZW51ID0gKGU6IE1vdXNlRXZlbnQpOiB2b2lkID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uaGFuZGxlRG9jdW1lbnRDbGljayhlLCB0aGlzLm1lbnVCdXR0b24pO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlTW9kZWxDaGFuZ2UgPSBhc3luYyAobW9kZWxOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIHRoaXMudXBkYXRlTW9kZWxEaXNwbGF5KG1vZGVsTmFtZSk7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgICAgY29uc3QgdGVtcCA9IGNoYXQ/Lm1ldGFkYXRhPy50ZW1wZXJhdHVyZSA/PyB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZTtcclxuICAgICAgdGhpcy51cGRhdGVUZW1wZXJhdHVyZUluZGljYXRvcih0ZW1wKTtcclxuXHJcbiAgICAgIGlmIChjaGF0ICYmIHRoaXMuY3VycmVudE1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdChcInN5c3RlbVwiLCBgTW9kZWwgY2hhbmdlZCB0bzogJHttb2RlbE5hbWV9YCwgbmV3IERhdGUoKSk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7fVxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlUm9sZUNoYW5nZSA9IGFzeW5jIChyb2xlTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICBjb25zdCBkaXNwbGF5Um9sZSA9IHJvbGVOYW1lIHx8IFwiTm9uZVwiO1xyXG4gICAgdGhpcy51cGRhdGVJbnB1dFBsYWNlaG9sZGVyKGRpc3BsYXlSb2xlKTtcclxuICAgIHRoaXMudXBkYXRlUm9sZURpc3BsYXkoZGlzcGxheVJvbGUpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdCgpO1xyXG5cclxuICAgICAgaWYgKGNoYXQgJiYgdGhpcy5jdXJyZW50TWVzc2FnZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0KFwic3lzdGVtXCIsIGBSb2xlIGNoYW5nZWQgdG86ICR7ZGlzcGxheVJvbGV9YCwgbmV3IERhdGUoKSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShgUm9sZSBzZXQgdG86ICR7ZGlzcGxheVJvbGV9YCk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoYFJvbGUgc2V0IHRvOiAke2Rpc3BsYXlSb2xlfWApO1xyXG4gICAgfVxyXG4gIH07XHJcbiAgcHJpdmF0ZSBoYW5kbGVSb2xlc1VwZGF0ZWQgPSAoKTogdm9pZCA9PiB7XHJcbiAgICB0aGlzLnBsdWdpbi5wcm9tcHRTZXJ2aWNlPy5jbGVhclJvbGVDYWNoZSgpO1xyXG5cclxuICAgIGlmICh0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXIpIHtcclxuICAgICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyXHJcbiAgICAgICAgLnVwZGF0ZVJvbGVMaXN0SWZWaXNpYmxlKClcclxuICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyByb2xlIGRyb3Bkb3duIGxpc3Q6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5zaWRlYmFyTWFuYWdlcj8uaXNTZWN0aW9uVmlzaWJsZShcInJvbGVzXCIpKSB7XHJcbiAgICAgIHRoaXMuc2lkZWJhck1hbmFnZXIudXBkYXRlUm9sZUxpc3QoKS5jYXRjaChlID0+IHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkVycm9yIHVwZGF0aW5nIHJvbGUgcGFuZWwgbGlzdDpcIiwgZSkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwcml2YXRlIGFzeW5jIGFkZE1lc3NhZ2VTdGFuZGFyZChtZXNzYWdlOiBNZXNzYWdlKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBpc05ld0RheSA9ICF0aGlzLmxhc3RSZW5kZXJlZE1lc3NhZ2VEYXRlIHx8ICF0aGlzLmlzU2FtZURheSh0aGlzLmxhc3RSZW5kZXJlZE1lc3NhZ2VEYXRlLCBtZXNzYWdlLnRpbWVzdGFtcCk7XHJcbiAgICBpZiAoaXNOZXdEYXkpIHtcclxuICAgICAgdGhpcy5yZW5kZXJEYXRlU2VwYXJhdG9yKG1lc3NhZ2UudGltZXN0YW1wKTtcclxuICAgICAgdGhpcy5sYXN0UmVuZGVyZWRNZXNzYWdlRGF0ZSA9IG1lc3NhZ2UudGltZXN0YW1wO1xyXG4gICAgfSBlbHNlIGlmICghdGhpcy5sYXN0UmVuZGVyZWRNZXNzYWdlRGF0ZSAmJiB0aGlzLmNoYXRDb250YWluZXI/LmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB0aGlzLmxhc3RSZW5kZXJlZE1lc3NhZ2VEYXRlID0gbWVzc2FnZS50aW1lc3RhbXA7XHJcbiAgICB9XHJcbiAgICB0aGlzLmhpZGVFbXB0eVN0YXRlKCk7XHJcblxyXG4gICAgbGV0IG1lc3NhZ2VHcm91cEVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xyXG4gICAgdHJ5IHtcclxuICAgICAgbGV0IHJlbmRlcmVyOlxyXG4gICAgICAgIHwgVXNlck1lc3NhZ2VSZW5kZXJlclxyXG4gICAgICAgIHwgU3lzdGVtTWVzc2FnZVJlbmRlcmVyXHJcbiAgICAgICAgfCBBc3Npc3RhbnRNZXNzYWdlUmVuZGVyZXJcclxuICAgICAgICB8IFRvb2xNZXNzYWdlUmVuZGVyZXJcclxuICAgICAgICB8IEVycm9yTWVzc2FnZVJlbmRlcmVyXHJcbiAgICAgICAgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAgIHN3aXRjaCAobWVzc2FnZS5yb2xlKSB7XHJcbiAgICAgICAgY2FzZSBcInVzZXJcIjpcclxuICAgICAgICAgIHJlbmRlcmVyID0gbmV3IFVzZXJNZXNzYWdlUmVuZGVyZXIodGhpcy5hcHAsIHRoaXMucGx1Z2luLCBtZXNzYWdlLCB0aGlzKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhc3Npc3RhbnRcIjpcclxuICAgICAgICAgIHJlbmRlcmVyID0gbmV3IEFzc2lzdGFudE1lc3NhZ2VSZW5kZXJlcih0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIG1lc3NhZ2UgYXMgQXNzaXN0YW50TWVzc2FnZSwgdGhpcyk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwic3lzdGVtXCI6XHJcbiAgICAgICAgICByZW5kZXJlciA9IG5ldyBTeXN0ZW1NZXNzYWdlUmVuZGVyZXIodGhpcy5hcHAsIHRoaXMucGx1Z2luLCBtZXNzYWdlLCB0aGlzKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJlcnJvclwiOlxyXG4gICAgICAgICAgdGhpcy5oYW5kbGVFcnJvck1lc3NhZ2UobWVzc2FnZSk7XHJcbiAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGNhc2UgXCJ0b29sXCI6XHJcbiAgICAgICAgICByZW5kZXJlciA9IG5ldyBUb29sTWVzc2FnZVJlbmRlcmVyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgbWVzc2FnZSwgdGhpcyk7XHJcbiAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIGNvbnN0IHVua25vd25Sb2xlR3JvdXAgPSB0aGlzLmNoYXRDb250YWluZXI/LmNyZWF0ZURpdih7IGNsczogQ1NTX0NMQVNTRVMuTUVTU0FHRV9HUk9VUCB9KTtcclxuICAgICAgICAgIGlmICh1bmtub3duUm9sZUdyb3VwICYmIHRoaXMuY2hhdENvbnRhaW5lcikge1xyXG4gICAgICAgICAgICBSZW5kZXJlclV0aWxzLnJlbmRlckF2YXRhcih0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIHVua25vd25Sb2xlR3JvdXAsIGZhbHNlKTtcclxuICAgICAgICAgICAgY29uc3Qgd3JhcHBlciA9IHVua25vd25Sb2xlR3JvdXAuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NFUy5NRVNTQUdFX1dSQVBQRVIgfHwgXCJtZXNzYWdlLXdyYXBwZXJcIiB9KTtcclxuICAgICAgICAgICAgY29uc3QgbXNnQnViYmxlID0gd3JhcHBlci5jcmVhdGVEaXYoeyBjbHM6IGAke0NTU19DTEFTU0VTLk1FU1NBR0V9ICR7Q1NTX0NMQVNTRVMuU1lTVEVNX01FU1NBR0V9YCB9KTtcclxuICAgICAgICAgICAgbXNnQnViYmxlLmNyZWF0ZURpdih7XHJcbiAgICAgICAgICAgICAgY2xzOiBDU1NfQ0xBU1NFUy5TWVNURU1fTUVTU0FHRV9URVhUIHx8IFwic3lzdGVtLW1lc3NhZ2UtdGV4dFwiLFxyXG4gICAgICAgICAgICAgIHRleHQ6IGBJbnRlcm5hbCBQbHVnaW4gRXJyb3I6IFVua25vd24gbWVzc2FnZSByb2xlIHJlY2VpdmVkIGJ5IHJlbmRlcmVyOiAnJHttZXNzYWdlLnJvbGV9Jy4gTWVzc2FnZSBjb250ZW50IHdhcyBsb2dnZWQuYCxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIEJhc2VNZXNzYWdlUmVuZGVyZXIuYWRkVGltZXN0YW1wKG1zZ0J1YmJsZSwgbWVzc2FnZS50aW1lc3RhbXAsIHRoaXMpO1xyXG4gICAgICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuYXBwZW5kQ2hpbGQodW5rbm93blJvbGVHcm91cCk7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdE1lc3NhZ2VFbGVtZW50ID0gdW5rbm93blJvbGVHcm91cDtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHJlbmRlcmVyKSB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gcmVuZGVyZXIucmVuZGVyKCk7XHJcbiAgICAgICAgbWVzc2FnZUdyb3VwRWwgPSByZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlID8gYXdhaXQgcmVzdWx0IDogcmVzdWx0O1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKG1lc3NhZ2VHcm91cEVsICYmIHRoaXMuY2hhdENvbnRhaW5lcikge1xyXG4gICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5hcHBlbmRDaGlsZChtZXNzYWdlR3JvdXBFbCk7XHJcbiAgICAgICAgdGhpcy5sYXN0TWVzc2FnZUVsZW1lbnQgPSBtZXNzYWdlR3JvdXBFbDtcclxuICAgICAgICBpZiAoIW1lc3NhZ2VHcm91cEVsLmlzQ29ubmVjdGVkKSB7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBtZXNzYWdlR3JvdXBFbC5jbGFzc0xpc3QuYWRkKENTU19DTEFTU0VTLk1FU1NBR0VfQVJSSVZJTkcgfHwgXCJtZXNzYWdlLWFycml2aW5nXCIpO1xyXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gbWVzc2FnZUdyb3VwRWw/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTRVMuTUVTU0FHRV9BUlJJVklORyB8fCBcIm1lc3NhZ2UtYXJyaXZpbmdcIiksIDUwMCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGlzVXNlck1lc3NhZ2UgPSBtZXNzYWdlLnJvbGUgPT09IFwidXNlclwiO1xyXG4gICAgICAgIGlmICghaXNVc2VyTWVzc2FnZSAmJiB0aGlzLnVzZXJTY3JvbGxlZFVwICYmIHRoaXMubmV3TWVzc2FnZXNJbmRpY2F0b3JFbCkge1xyXG4gICAgICAgICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsLmNsYXNzTGlzdC5hZGQoQ1NTX0NMQVNTRVMuVklTSUJMRSB8fCBcInZpc2libGVcIik7XHJcbiAgICAgICAgfSBlbHNlIGlmICghdGhpcy51c2VyU2Nyb2xsZWRVcCkge1xyXG4gICAgICAgICAgY29uc3Qgc2Nyb2xsRGVsYXkgPSB0aGlzLmlzUHJvY2Vzc2luZyAmJiBtZXNzYWdlLnJvbGUgPT09IFwiYXNzaXN0YW50XCIgPyAzMCA6IGlzVXNlck1lc3NhZ2UgPyA1MCA6IDEwMDtcclxuXHJcbiAgICAgICAgICBjb25zdCBmb3JjZVNjcm9sbCA9XHJcbiAgICAgICAgICAgICh0aGlzLmlzUHJvY2Vzc2luZyAmJiBtZXNzYWdlLnJvbGUgPT09IFwiYXNzaXN0YW50XCIpIHx8IG1lc3NhZ2Uucm9sZSA9PT0gXCJ0b29sXCIgPyB0cnVlIDogIWlzVXNlck1lc3NhZ2U7XHJcbiAgICAgICAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbShzY3JvbGxEZWxheSwgZm9yY2VTY3JvbGwpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMudXBkYXRlU2Nyb2xsU3RhdGVBbmRJbmRpY2F0b3JzKCksIDE1MCk7XHJcbiAgICAgIH0gZWxzZSBpZiAocmVuZGVyZXIpIHtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IGVycm9yTm90aWNlID0gYEZhaWxlZCB0byByZW5kZXIgbWVzc2FnZSAoUm9sZTogJHttZXNzYWdlPy5yb2xlfSkuIENoZWNrIGNvbnNvbGUgZm9yIGRldGFpbHMuYDtcclxuXHJcbiAgICAgICAgY29uc3QgZXJyb3JNc2dPYmplY3Q6IE1lc3NhZ2UgPSB7XHJcbiAgICAgICAgICByb2xlOiBcImVycm9yXCIsXHJcbiAgICAgICAgICBjb250ZW50OiBlcnJvck5vdGljZSxcclxuICAgICAgICAgIHRpbWVzdGFtcDogbWVzc2FnZS50aW1lc3RhbXAgfHwgbmV3IERhdGUoKSxcclxuICAgICAgICB9O1xyXG4gICAgICAgIHRoaXMuaGFuZGxlRXJyb3JNZXNzYWdlKGVycm9yTXNnT2JqZWN0KTtcclxuICAgICAgfSBjYXRjaCAoY3JpdGljYWxFcnJvcikge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJDcml0aWNhbCBlcnJvciBkaXNwbGF5aW5nIG1lc3NhZ2UuIENoZWNrIGNvbnNvbGUuXCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZU1lc3NhZ2VzQ2xlYXJlZCA9IChjaGF0SWQ6IHN0cmluZyk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKGNoYXRJZCA9PT0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXRJZCgpKSB7XHJcbiAgICAgIHRoaXMuY2xlYXJDaGF0Q29udGFpbmVySW50ZXJuYWwoKTtcclxuICAgICAgdGhpcy5jdXJyZW50TWVzc2FnZXMgPSBbXTtcclxuICAgICAgdGhpcy5zaG93RW1wdHlTdGF0ZSgpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlVmlzaWJpbGl0eUNoYW5nZSA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmIChkb2N1bWVudC52aXNpYmlsaXR5U3RhdGUgPT09IFwidmlzaWJsZVwiICYmIHRoaXMubGVhZi52aWV3ID09PSB0aGlzKSB7XHJcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oNTAsIHRydWUpO1xyXG4gICAgICAgIHRoaXMuYWRqdXN0VGV4dGFyZWFIZWlnaHQoKTtcclxuICAgICAgICB0aGlzLmlucHV0RWw/LmZvY3VzKCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH07XHJcbiAgcHJpdmF0ZSBoYW5kbGVBY3RpdmVMZWFmQ2hhbmdlID0gKGxlYWY6IFdvcmtzcGFjZUxlYWYgfCBudWxsKTogdm9pZCA9PiB7XHJcbiAgICBpZiAobGVhZj8udmlldyA9PT0gdGhpcykge1xyXG4gICAgICB0aGlzLmlucHV0RWw/LmZvY3VzKCk7XHJcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oMTUwLCB0cnVlKSwgMTAwKTtcclxuICAgIH1cclxuICB9O1xyXG4gIHByaXZhdGUgaGFuZGxlV2luZG93UmVzaXplID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMucmVzaXplVGltZW91dCkgY2xlYXJUaW1lb3V0KHRoaXMucmVzaXplVGltZW91dCk7XHJcbiAgICB0aGlzLnJlc2l6ZVRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuYWRqdXN0VGV4dGFyZWFIZWlnaHQoKSwgMTAwKTtcclxuICB9O1xyXG5cclxuICBwcml2YXRlIGhhbmRsZVNjcm9sbCA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICghdGhpcy5jaGF0Q29udGFpbmVyIHx8ICF0aGlzLm5ld01lc3NhZ2VzSW5kaWNhdG9yRWwgfHwgIXRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24pIHJldHVybjtcclxuXHJcbiAgICBjb25zdCB0aHJlc2hvbGQgPSAxNTA7XHJcbiAgICBjb25zdCBhdEJvdHRvbSA9XHJcbiAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxIZWlnaHQgLSB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG9wIC0gdGhpcy5jaGF0Q29udGFpbmVyLmNsaWVudEhlaWdodCA8IHRocmVzaG9sZDtcclxuXHJcbiAgICBjb25zdCBwcmV2aW91c1Njcm9sbGVkVXAgPSB0aGlzLnVzZXJTY3JvbGxlZFVwO1xyXG4gICAgdGhpcy51c2VyU2Nyb2xsZWRVcCA9ICFhdEJvdHRvbTtcclxuXHJcbiAgICBpZiAocHJldmlvdXNTY3JvbGxlZFVwICYmIGF0Qm90dG9tKSB7XHJcbiAgICAgIHRoaXMubmV3TWVzc2FnZXNJbmRpY2F0b3JFbC5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLnNjcm9sbFRvQm90dG9tQnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoQ1NTX0NMQVNTX1ZJU0lCTEUsIHRoaXMudXNlclNjcm9sbGVkVXApO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlTmV3TWVzc2FnZUluZGljYXRvckNsaWNrID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuY2hhdENvbnRhaW5lcikge1xyXG4gICAgICB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG8oeyB0b3A6IHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxIZWlnaHQsIGJlaGF2aW9yOiBcInNtb290aFwiIH0pO1xyXG4gICAgfVxyXG4gICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsPy5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgIHRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1ZJU0lCTEUpO1xyXG4gICAgdGhpcy51c2VyU2Nyb2xsZWRVcCA9IGZhbHNlO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlU2Nyb2xsVG9Cb3R0b21DbGljayA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICh0aGlzLmNoYXRDb250YWluZXIpIHtcclxuICAgICAgdGhpcy5jaGF0Q29udGFpbmVyLnNjcm9sbFRvKHsgdG9wOiB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsSGVpZ2h0LCBiZWhhdmlvcjogXCJzbW9vdGhcIiB9KTtcclxuICAgIH1cclxuICAgIHRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1ZJU0lCTEUpO1xyXG4gICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsPy5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgIHRoaXMudXNlclNjcm9sbGVkVXAgPSBmYWxzZTtcclxuICB9O1xyXG5cclxuICBwcml2YXRlIHVwZGF0ZUlucHV0UGxhY2Vob2xkZXIocm9sZU5hbWU6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLmlucHV0RWwpIHtcclxuICAgICAgdGhpcy5pbnB1dEVsLnBsYWNlaG9sZGVyID0gYEVudGVyIG1lc3NhZ2UgdGV4dCBoZXJlLi4uYDtcclxuICAgIH1cclxuICB9XHJcbiAgcHJpdmF0ZSBhdXRvUmVzaXplVGV4dGFyZWEoKTogdm9pZCB7XHJcbiAgICB0aGlzLmFkanVzdFRleHRhcmVhSGVpZ2h0KCk7XHJcbiAgfVxyXG4gIHByaXZhdGUgYWRqdXN0VGV4dGFyZWFIZWlnaHQgPSAoKTogdm9pZCA9PiB7XHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICBpZiAoIXRoaXMuaW5wdXRFbCkgcmV0dXJuO1xyXG4gICAgICBjb25zdCB0ZXh0YXJlYSA9IHRoaXMuaW5wdXRFbDtcclxuICAgICAgY29uc3QgY29tcHV0ZWRTdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKHRleHRhcmVhKTtcclxuXHJcbiAgICAgIGNvbnN0IGJhc2VNaW5IZWlnaHQgPSBwYXJzZUZsb2F0KGNvbXB1dGVkU3R5bGUubWluSGVpZ2h0KSB8fCA0MDtcclxuICAgICAgY29uc3QgbWF4SGVpZ2h0ID0gcGFyc2VGbG9hdChjb21wdXRlZFN0eWxlLm1heEhlaWdodCk7XHJcblxyXG4gICAgICBjb25zdCBjdXJyZW50U2Nyb2xsVG9wID0gdGV4dGFyZWEuc2Nyb2xsVG9wO1xyXG4gICAgICB0ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSBcImF1dG9cIjtcclxuXHJcbiAgICAgIGNvbnN0IHNjcm9sbEhlaWdodCA9IHRleHRhcmVhLnNjcm9sbEhlaWdodDtcclxuXHJcbiAgICAgIGxldCB0YXJnZXRIZWlnaHQgPSBNYXRoLm1heChiYXNlTWluSGVpZ2h0LCBzY3JvbGxIZWlnaHQpO1xyXG4gICAgICBsZXQgYXBwbHlPdmVyZmxvdyA9IGZhbHNlO1xyXG5cclxuICAgICAgaWYgKCFpc05hTihtYXhIZWlnaHQpICYmIHRhcmdldEhlaWdodCA+IG1heEhlaWdodCkge1xyXG4gICAgICAgIHRhcmdldEhlaWdodCA9IG1heEhlaWdodDtcclxuICAgICAgICBhcHBseU92ZXJmbG93ID0gdHJ1ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gYCR7dGFyZ2V0SGVpZ2h0fXB4YDtcclxuICAgICAgdGV4dGFyZWEuc3R5bGUub3ZlcmZsb3dZID0gYXBwbHlPdmVyZmxvdyA/IFwiYXV0b1wiIDogXCJoaWRkZW5cIjtcclxuICAgICAgdGV4dGFyZWEuc2Nyb2xsVG9wID0gY3VycmVudFNjcm9sbFRvcDtcclxuICAgIH0pO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgdXBkYXRlUm9sZURpc3BsYXkocm9sZU5hbWU6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLnJvbGVEaXNwbGF5RWwpIHtcclxuICAgICAgY29uc3QgZGlzcGxheU5hbWUgPSByb2xlTmFtZSB8fCBcIk5vbmVcIjtcclxuICAgICAgdGhpcy5yb2xlRGlzcGxheUVsLnNldFRleHQoZGlzcGxheU5hbWUpO1xyXG4gICAgICB0aGlzLnJvbGVEaXNwbGF5RWwudGl0bGUgPSBgQ3VycmVudCByb2xlOiAke2Rpc3BsYXlOYW1lfS4gQ2xpY2sgdG8gY2hhbmdlLmA7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHVwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy5pbnB1dEVsIHx8ICF0aGlzLnNlbmRCdXR0b24gfHwgIXRoaXMuc3RvcEdlbmVyYXRpbmdCdXR0b24pIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGdlbmVyYXRpb25JblByb2dyZXNzID0gdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyICE9PSBudWxsO1xyXG4gICAgY29uc3QgaXNJbnB1dEVtcHR5ID0gdGhpcy5pbnB1dEVsLnZhbHVlLnRyaW0oKSA9PT0gXCJcIjtcclxuXHJcbiAgICBpZiAoZ2VuZXJhdGlvbkluUHJvZ3Jlc3MpIHtcclxuICAgICAgdGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbi5zaG93KCk7XHJcbiAgICAgIHRoaXMuc2VuZEJ1dHRvbi5oaWRlKCk7XHJcbiAgICAgIHRoaXMuc2VuZEJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnN0b3BHZW5lcmF0aW5nQnV0dG9uLmhpZGUoKTtcclxuICAgICAgdGhpcy5zZW5kQnV0dG9uLnNob3coKTtcclxuXHJcbiAgICAgIGNvbnN0IHNlbmRTaG91bGRCZURpc2FibGVkID0gaXNJbnB1dEVtcHR5IHx8IHRoaXMuaXNQcm9jZXNzaW5nO1xyXG4gICAgICB0aGlzLnNlbmRCdXR0b24uZGlzYWJsZWQgPSBzZW5kU2hvdWxkQmVEaXNhYmxlZDtcclxuICAgICAgdGhpcy5zZW5kQnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoQ1NTX0NMQVNTRVMuRElTQUJMRUQsIHNlbmRTaG91bGRCZURpc2FibGVkKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHB1YmxpYyBzaG93RW1wdHlTdGF0ZSgpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLmN1cnJlbnRNZXNzYWdlcy5sZW5ndGggPT09IDAgJiYgIXRoaXMuZW1wdHlTdGF0ZUVsICYmIHRoaXMuY2hhdENvbnRhaW5lcikge1xyXG4gICAgICB0aGlzLmNoYXRDb250YWluZXIuZW1wdHkoKTtcclxuICAgICAgdGhpcy5lbXB0eVN0YXRlRWwgPSB0aGlzLmNoYXRDb250YWluZXIuY3JlYXRlRGl2KHtcclxuICAgICAgICBjbHM6IENTU19DTEFTU19FTVBUWV9TVEFURSxcclxuICAgICAgfSk7XHJcbiAgICAgIHRoaXMuZW1wdHlTdGF0ZUVsLmNyZWF0ZURpdih7XHJcbiAgICAgICAgY2xzOiBcImVtcHR5LXN0YXRlLW1lc3NhZ2VcIixcclxuICAgICAgICB0ZXh0OiBcIk5vIG1lc3NhZ2VzIHlldFwiLFxyXG4gICAgICB9KTtcclxuICAgICAgY29uc3QgbW9kZWxOYW1lID0gdGhpcy5wbHVnaW4/LnNldHRpbmdzPy5tb2RlbE5hbWUgfHwgXCJ0aGUgQUlcIjtcclxuICAgICAgdGhpcy5lbXB0eVN0YXRlRWwuY3JlYXRlRGl2KHtcclxuICAgICAgICBjbHM6IFwiZW1wdHktc3RhdGUtdGlwXCIsXHJcbiAgICAgICAgdGV4dDogYFR5cGUgYSBtZXNzYWdlIG9yIHVzZSB0aGUgbWVudSBvcHRpb25zIHRvIHN0YXJ0IGludGVyYWN0aW5nIHdpdGggJHttb2RlbE5hbWV9LmAsXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuICBwdWJsaWMgaGlkZUVtcHR5U3RhdGUoKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5lbXB0eVN0YXRlRWwpIHtcclxuICAgICAgdGhpcy5lbXB0eVN0YXRlRWwucmVtb3ZlKCk7XHJcbiAgICAgIHRoaXMuZW1wdHlTdGF0ZUVsID0gbnVsbDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHB1YmxpYyBzZXRMb2FkaW5nU3RhdGUoaXNMb2FkaW5nOiBib29sZWFuKTogdm9pZCB7XHJcbiAgICB0aGlzLmlzUHJvY2Vzc2luZyA9IGlzTG9hZGluZztcclxuXHJcbiAgICBpZiAodGhpcy5pbnB1dEVsKSB0aGlzLmlucHV0RWwuZGlzYWJsZWQgPSBpc0xvYWRpbmc7XHJcblxyXG4gICAgdGhpcy51cGRhdGVTZW5kQnV0dG9uU3RhdGUoKTtcclxuXHJcbiAgICBpZiAodGhpcy52b2ljZUJ1dHRvbikge1xyXG4gICAgICB0aGlzLnZvaWNlQnV0dG9uLmRpc2FibGVkID0gaXNMb2FkaW5nO1xyXG4gICAgICB0aGlzLnZvaWNlQnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoQ1NTX0NMQVNTRVMuRElTQUJMRUQsIGlzTG9hZGluZyk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy50cmFuc2xhdGVJbnB1dEJ1dHRvbikge1xyXG4gICAgICB0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLmRpc2FibGVkID0gaXNMb2FkaW5nO1xyXG4gICAgICB0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoQ1NTX0NMQVNTRVMuRElTQUJMRUQsIGlzTG9hZGluZyk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5tZW51QnV0dG9uKSB7XHJcbiAgICAgIHRoaXMubWVudUJ1dHRvbi5kaXNhYmxlZCA9IGlzTG9hZGluZztcclxuICAgICAgdGhpcy5tZW51QnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoQ1NTX0NMQVNTRVMuRElTQUJMRUQsIGlzTG9hZGluZyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuY2hhdENvbnRhaW5lcikge1xyXG4gICAgICBpZiAoaXNMb2FkaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jaGF0Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEJ1dHRvbkVsZW1lbnQ+KGAuJHtDU1NfQ0xBU1NFUy5TSE9XX01PUkVfQlVUVE9OfWApLmZvckVhY2goYnV0dG9uID0+IHtcclxuICAgICAgICAgIGJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5jaGVja0FsbE1lc3NhZ2VzRm9yQ29sbGFwc2luZygpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZUNoYXRMaXN0VXBkYXRlZCA9ICgpOiB2b2lkID0+IHtcclxuICAgIHRoaXMuc2NoZWR1bGVTaWRlYmFyQ2hhdExpc3RVcGRhdGUoKTtcclxuXHJcbiAgICBpZiAodGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyKSB7XHJcbiAgICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlclxyXG4gICAgICAgIC51cGRhdGVDaGF0TGlzdElmVmlzaWJsZSgpXHJcbiAgICAgICAgLmNhdGNoKGUgPT4gdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiRXJyb3IgdXBkYXRpbmcgY2hhdCBkcm9wZG93biBsaXN0OlwiLCBlKSk7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHVibGljIGhhbmRsZVNldHRpbmdzVXBkYXRlZCA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdCgpO1xyXG4gICAgY29uc3QgY3VycmVudE1vZGVsTmFtZSA9IGFjdGl2ZUNoYXQ/Lm1ldGFkYXRhPy5tb2RlbE5hbWUgfHwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xyXG4gICAgY29uc3QgY3VycmVudFJvbGVQYXRoID0gYWN0aXZlQ2hhdD8ubWV0YWRhdGE/LnNlbGVjdGVkUm9sZVBhdGggPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aDtcclxuICAgIGNvbnN0IGN1cnJlbnRSb2xlTmFtZSA9IGF3YWl0IHRoaXMuZmluZFJvbGVOYW1lQnlQYXRoKGN1cnJlbnRSb2xlUGF0aCk7XHJcbiAgICBjb25zdCBjdXJyZW50VGVtcGVyYXR1cmUgPSBhY3RpdmVDaGF0Py5tZXRhZGF0YT8udGVtcGVyYXR1cmUgPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGVyYXR1cmU7XHJcblxyXG4gICAgdGhpcy51cGRhdGVNb2RlbERpc3BsYXkoY3VycmVudE1vZGVsTmFtZSk7XHJcbiAgICB0aGlzLnVwZGF0ZVJvbGVEaXNwbGF5KGN1cnJlbnRSb2xlTmFtZSk7XHJcbiAgICB0aGlzLnVwZGF0ZUlucHV0UGxhY2Vob2xkZXIoY3VycmVudFJvbGVOYW1lKTtcclxuICAgIHRoaXMudXBkYXRlVGVtcGVyYXR1cmVJbmRpY2F0b3IoY3VycmVudFRlbXBlcmF0dXJlKTtcclxuICAgIHRoaXMudXBkYXRlVG9nZ2xlVmlld0xvY2F0aW9uT3B0aW9uKCk7XHJcbiAgICB0aGlzLnVwZGF0ZVRvZ2dsZUxvY2F0aW9uQnV0dG9uKCk7XHJcblxyXG4gICAgaWYgKHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcikge1xyXG4gICAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXJcclxuICAgICAgICAudXBkYXRlUm9sZUxpc3RJZlZpc2libGUoKVxyXG4gICAgICAgIC5jYXRjaChlID0+IHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkVycm9yIHVwZGF0aW5nIHJvbGUgZHJvcGRvd24gbGlzdDpcIiwgZSkpO1xyXG4gICAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXJcclxuICAgICAgICAudXBkYXRlTW9kZWxMaXN0SWZWaXNpYmxlKClcclxuICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyBtb2RlbCBkcm9wZG93biBsaXN0OlwiLCBlKSk7XHJcbiAgICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlci51cGRhdGVUb2dnbGVWaWV3TG9jYXRpb25PcHRpb24oKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5zaWRlYmFyTWFuYWdlcj8uaXNTZWN0aW9uVmlzaWJsZShcInJvbGVzXCIpKSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuc2lkZWJhck1hbmFnZXJcclxuICAgICAgICAudXBkYXRlUm9sZUxpc3QoKVxyXG4gICAgICAgIC5jYXRjaChlID0+IHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkVycm9yIHVwZGF0aW5nIHJvbGUgcGFuZWwgbGlzdDpcIiwgZSkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5zaWRlYmFyTWFuYWdlcj8uaXNTZWN0aW9uVmlzaWJsZShcImNoYXRzXCIpKSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuc2lkZWJhck1hbmFnZXJcclxuICAgICAgICAudXBkYXRlQ2hhdExpc3QoKVxyXG4gICAgICAgIC5jYXRjaChlID0+IHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkVycm9yIHVwZGF0aW5nIGNoYXQgcGFuZWwgbGlzdDpcIiwgZSkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwdWJsaWMgYXN5bmMgaGFuZGxlRGVsZXRlTWVzc2FnZUNsaWNrKG1lc3NhZ2VUb0RlbGV0ZTogTWVzc2FnZSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICBpZiAoIWFjdGl2ZUNoYXQpIHtcclxuICAgICAgbmV3IE5vdGljZShcIkNhbm5vdCBkZWxldGUgbWVzc2FnZTogTm8gYWN0aXZlIGNoYXQuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgbmV3IENvbmZpcm1Nb2RhbChcclxuICAgICAgdGhpcy5hcHAsXHJcbiAgICAgIFwiQ29uZmlybSBNZXNzYWdlIERlbGV0aW9uXCIsXHJcbiAgICAgIGBBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlIHRoaXMgbWVzc2FnZT9cXG5cIiR7bWVzc2FnZVRvRGVsZXRlLmNvbnRlbnQuc3Vic3RyaW5nKDAsIDEwMCl9JHtcclxuICAgICAgICBtZXNzYWdlVG9EZWxldGUuY29udGVudC5sZW5ndGggPiAxMDAgPyBcIi4uLlwiIDogXCJcIlxyXG4gICAgICB9XCJcXG5cXG5UaGlzIGFjdGlvbiBjYW5ub3QgYmUgdW5kb25lLmAsXHJcbiAgICAgIGFzeW5jICgpID0+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgY29uc3QgZGVsZXRlU3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmRlbGV0ZU1lc3NhZ2VCeVRpbWVzdGFtcChcclxuICAgICAgICAgICAgYWN0aXZlQ2hhdC5tZXRhZGF0YS5pZCxcclxuICAgICAgICAgICAgbWVzc2FnZVRvRGVsZXRlLnRpbWVzdGFtcFxyXG4gICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICBpZiAoZGVsZXRlU3VjY2Vzcykge1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiTWVzc2FnZSBkZWxldGVkLlwiKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJGYWlsZWQgdG8gZGVsZXRlIG1lc3NhZ2UuXCIpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICBuZXcgTm90aWNlKFwiQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgZGVsZXRpbmcgdGhlIG1lc3NhZ2UuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgKS5vcGVuKCk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgaGFuZGxlQ29weUNsaWNrKGNvbnRlbnQ6IHN0cmluZywgYnV0dG9uRWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgICBsZXQgdGV4dFRvQ29weSA9IGNvbnRlbnQ7XHJcblxyXG4gICAgaWYgKFJlbmRlcmVyVXRpbHMuZGV0ZWN0VGhpbmtpbmdUYWdzKFJlbmRlcmVyVXRpbHMuZGVjb2RlSHRtbEVudGl0aWVzKGNvbnRlbnQpKS5oYXNUaGlua2luZ1RhZ3MpIHtcclxuICAgICAgdGV4dFRvQ29weSA9IFJlbmRlcmVyVXRpbHMuZGVjb2RlSHRtbEVudGl0aWVzKGNvbnRlbnQpXHJcbiAgICAgICAgLnJlcGxhY2UoLzx0aGluaz5bXFxzXFxTXSo/PFxcL3RoaW5rPi9nLCBcIlwiKVxyXG4gICAgICAgIC50cmltKCk7XHJcbiAgICB9XHJcbiAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkXHJcbiAgICAgIC53cml0ZVRleHQodGV4dFRvQ29weSlcclxuICAgICAgLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgIHNldEljb24oYnV0dG9uRWwsIFwiY2hlY2tcIik7XHJcbiAgICAgICAgYnV0dG9uRWwuc2V0QXR0cmlidXRlKFwidGl0bGVcIiwgXCJDb3BpZWQhXCIpO1xyXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgc2V0SWNvbihidXR0b25FbCwgXCJjb3B5XCIpO1xyXG4gICAgICAgICAgYnV0dG9uRWwuc2V0QXR0cmlidXRlKFwidGl0bGVcIiwgXCJDb3B5XCIpO1xyXG4gICAgICAgIH0sIDIwMDApO1xyXG4gICAgICB9KVxyXG4gICAgICAuY2F0Y2goZXJyID0+IHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiQ29weSBmYWlsZWQ6XCIsIGVycik7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBjb3B5IHRleHQuXCIpO1xyXG4gICAgICB9KTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBhc3luYyBoYW5kbGVUcmFuc2xhdGVDbGljayhcclxuICAgIG9yaWdpbmFsQ29udGVudDogc3RyaW5nLFxyXG4gICAgY29udGVudEVsOiBIVE1MRWxlbWVudCxcclxuICAgIGJ1dHRvbkVsOiBIVE1MQnV0dG9uRWxlbWVudFxyXG4gICk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgdGFyZ2V0TGFuZyA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uVGFyZ2V0TGFuZ3VhZ2U7XHJcblxyXG4gICAgaWYgKCF0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVUcmFuc2xhdGlvbiB8fCB0aGlzLnBsdWdpbi5zZXR0aW5ncy50cmFuc2xhdGlvblByb3ZpZGVyID09PSBcIm5vbmVcIikge1xyXG4gICAgICBuZXcgTm90aWNlKFwiVHJhbnNsYXRpb24gZGlzYWJsZWQgb3IgcHJvdmlkZXIgbm90IHNlbGVjdGVkIGluIHNldHRpbmdzLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGFyZ2V0TGFuZykge1xyXG4gICAgICBuZXcgTm90aWNlKFwiVGFyZ2V0IGxhbmd1YWdlIGZvciB0cmFuc2xhdGlvbiBpcyBub3Qgc2V0IGluIHNldHRpbmdzLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCB0ZXh0VG9UcmFuc2xhdGUgPSBcIlwiO1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgZGVjb2RlZENvbnRlbnQgPSBSZW5kZXJlclV0aWxzLmRlY29kZUh0bWxFbnRpdGllcyhvcmlnaW5hbENvbnRlbnQpO1xyXG4gICAgICBpZiAoUmVuZGVyZXJVdGlscy5kZXRlY3RUaGlua2luZ1RhZ3MoZGVjb2RlZENvbnRlbnQpLmhhc1RoaW5raW5nVGFncykge1xyXG4gICAgICAgIHRleHRUb1RyYW5zbGF0ZSA9IGRlY29kZWRDb250ZW50LnJlcGxhY2UoLzx0aGluaz5bXFxzXFxTXSo/PFxcL3RoaW5rPi9nLCBcIlwiKS50cmltKCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGV4dFRvVHJhbnNsYXRlID0gZGVjb2RlZENvbnRlbnQudHJpbSgpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoIXRleHRUb1RyYW5zbGF0ZSkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJOb3RoaW5nIHRvIHRyYW5zbGF0ZSAoY29udGVudCBtaWdodCBiZSBlbXB0eSBhZnRlciByZW1vdmluZyBpbnRlcm5hbCB0YWdzKS5cIik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIHByZXBhcmUgdGV4dCBmb3IgdHJhbnNsYXRpb24uXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29udGVudEVsLnF1ZXJ5U2VsZWN0b3IoYC4ke0NTU19DTEFTU19UUkFOU0xBVElPTl9DT05UQUlORVJ9YCk/LnJlbW92ZSgpO1xyXG5cclxuICAgIGNvbnN0IG9yaWdpbmFsSWNvbiA9IGJ1dHRvbkVsLnF1ZXJ5U2VsZWN0b3IoXCIuc3ZnLWljb25cIik/LmdldEF0dHJpYnV0ZShcImljb24tbmFtZVwiKSB8fCBcImxhbmd1YWdlc1wiO1xyXG4gICAgc2V0SWNvbihidXR0b25FbCwgXCJsb2FkZXJcIik7XHJcbiAgICBidXR0b25FbC5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICBidXR0b25FbC5jbGFzc0xpc3QuYWRkKENTU19DTEFTU19UUkFOU0xBVElPTl9QRU5ESU5HKTtcclxuICAgIGNvbnN0IG9yaWdpbmFsVGl0bGUgPSBidXR0b25FbC50aXRsZTtcclxuICAgIGJ1dHRvbkVsLnNldEF0dHJpYnV0ZShcInRpdGxlXCIsIFwiVHJhbnNsYXRpbmcuLi5cIik7XHJcbiAgICBidXR0b25FbC5hZGRDbGFzcyhcImJ1dHRvbi1sb2FkaW5nXCIpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHRyYW5zbGF0ZWRUZXh0ID0gYXdhaXQgdGhpcy5wbHVnaW4udHJhbnNsYXRpb25TZXJ2aWNlLnRyYW5zbGF0ZSh0ZXh0VG9UcmFuc2xhdGUsIHRhcmdldExhbmcpO1xyXG5cclxuICAgICAgaWYgKCFjb250ZW50RWwgfHwgIWNvbnRlbnRFbC5pc0Nvbm5lY3RlZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHRyYW5zbGF0ZWRUZXh0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgY29uc3QgdHJhbnNsYXRpb25Db250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NfVFJBTlNMQVRJT05fQ09OVEFJTkVSIH0pO1xyXG5cclxuICAgICAgICBjb25zdCB0cmFuc2xhdGlvbkNvbnRlbnRFbCA9IHRyYW5zbGF0aW9uQ29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogQ1NTX0NMQVNTX1RSQU5TTEFUSU9OX0NPTlRFTlQgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IE1hcmtkb3duUmVuZGVyZXIucmVuZGVyKFxyXG4gICAgICAgICAgdGhpcy5hcHAsXHJcbiAgICAgICAgICB0cmFuc2xhdGVkVGV4dCxcclxuICAgICAgICAgIHRyYW5zbGF0aW9uQ29udGVudEVsLFxyXG4gICAgICAgICAgdGhpcy5wbHVnaW4uYXBwLnZhdWx0LmdldFJvb3QoKT8ucGF0aCA/PyBcIlwiLFxyXG4gICAgICAgICAgdGhpc1xyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIFJlbmRlcmVyVXRpbHMuZml4QnJva2VuVHdlbW9qaUltYWdlcyh0cmFuc2xhdGlvbkNvbnRlbnRFbCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHRhcmdldExhbmdOYW1lID0gTEFOR1VBR0VTW3RhcmdldExhbmddIHx8IHRhcmdldExhbmc7XHJcbiAgICAgICAgdHJhbnNsYXRpb25Db250YWluZXIuY3JlYXRlRWwoXCJkaXZcIiwge1xyXG4gICAgICAgICAgY2xzOiBcInRyYW5zbGF0aW9uLWluZGljYXRvclwiLFxyXG4gICAgICAgICAgdGV4dDogYFtUcmFuc2xhdGVkIHRvICR7dGFyZ2V0TGFuZ05hbWV9XWAsXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMuZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKDUwLCBmYWxzZSk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBpZiAoYnV0dG9uRWw/LmlzQ29ubmVjdGVkKSB7XHJcbiAgICAgICAgc2V0SWNvbihidXR0b25FbCwgb3JpZ2luYWxJY29uKTtcclxuICAgICAgICBidXR0b25FbC5kaXNhYmxlZCA9IGZhbHNlO1xyXG4gICAgICAgIGJ1dHRvbkVsLmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1RSQU5TTEFUSU9OX1BFTkRJTkcpO1xyXG4gICAgICAgIGJ1dHRvbkVsLnNldEF0dHJpYnV0ZShcInRpdGxlXCIsIG9yaWdpbmFsVGl0bGUpO1xyXG4gICAgICAgIGJ1dHRvbkVsLnJlbW92ZUNsYXNzKFwiYnV0dG9uLWxvYWRpbmdcIik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgcmVuZGVyRGF0ZVNlcGFyYXRvcihkYXRlOiBEYXRlKTogdm9pZCB7XHJcbiAgICBpZiAoIXRoaXMuY2hhdENvbnRhaW5lcikgcmV0dXJuO1xyXG4gICAgdGhpcy5jaGF0Q29udGFpbmVyLmNyZWF0ZURpdih7XHJcbiAgICAgIGNsczogQ1NTX0NMQVNTX0RBVEVfU0VQQVJBVE9SLFxyXG4gICAgICB0ZXh0OiB0aGlzLmZvcm1hdERhdGVTZXBhcmF0b3IoZGF0ZSksXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgaW5pdFNwZWVjaFdvcmtlcigpOiB2b2lkIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHdvcmtlckNvZGUgPSBgXHJcbiAgICAgICAgICAgICBcclxuICAgICAgICAgICAgIHNlbGYub25tZXNzYWdlID0gYXN5bmMgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgY29uc3QgeyBhcGlLZXksIGF1ZGlvQmxvYiwgbGFuZ3VhZ2VDb2RlID0gJ3VrLVVBJyB9ID0gZXZlbnQuZGF0YTtcclxuXHJcbiAgICAgICAgICAgICAgICAgaWYgKCFhcGlLZXkgfHwgYXBpS2V5LnRyaW0oKSA9PT0gJycpIHtcclxuICAgICAgICAgICAgICAgICAgICAgc2VsZi5wb3N0TWVzc2FnZSh7IGVycm9yOiB0cnVlLCBtZXNzYWdlOiAnR29vZ2xlIEFQSSBLZXkgaXMgbm90IGNvbmZpZ3VyZWQuIFBsZWFzZSBhZGQgaXQgaW4gcGx1Z2luIHNldHRpbmdzLicgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgIGNvbnN0IHVybCA9IFwiaHR0cHM6XHJcblxyXG4gICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFycmF5QnVmZmVyID0gYXdhaXQgYXVkaW9CbG9iLmFycmF5QnVmZmVyKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgIGxldCBiYXNlNjRBdWRpbztcclxuICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBUZXh0RGVjb2RlciAhPT0gJ3VuZGVmaW5lZCcpIHsgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFzZTY0U3RyaW5nID0gYnRvYShTdHJpbmcuZnJvbUNoYXJDb2RlKC4uLm5ldyBVaW50OEFycmF5KGFycmF5QnVmZmVyKSkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2U2NEF1ZGlvID0gYmFzZTY0U3RyaW5nO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXNlNjRBdWRpbyA9IGJ0b2EoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBVaW50OEFycmF5KGFycmF5QnVmZmVyKS5yZWR1Y2UoKGRhdGEsIGJ5dGUpID0+IGRhdGEgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGUpLCAnJylcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbmZpZzoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmNvZGluZzogJ1dFQk1fT1BVUycsIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzYW1wbGVSYXRlSGVydHo6IDQ4MDAwLCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFuZ3VhZ2VDb2RlOiBsYW5ndWFnZUNvZGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsOiAnbGF0ZXN0X2xvbmcnLCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5hYmxlQXV0b21hdGljUHVuY3R1YXRpb246IHRydWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhdWRpbzogeyBjb250ZW50OiBiYXNlNjRBdWRpbyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSxcclxuICAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZURhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IFwiRXJyb3IgZnJvbSBHb29nbGUgU3BlZWNoIEFQSTogXCIgKyAocmVzcG9uc2VEYXRhLmVycm9yPy5tZXNzYWdlIHx8IHJlc3BvbnNlLnN0YXR1c1RleHQgfHwgJ1Vua25vd24gZXJyb3InKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZURhdGEucmVzdWx0cyAmJiByZXNwb25zZURhdGEucmVzdWx0cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0cmFuc2NyaXB0ID0gcmVzcG9uc2VEYXRhLnJlc3VsdHNcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAubWFwKHJlc3VsdCA9PiByZXN1bHQuYWx0ZXJuYXRpdmVzWzBdLnRyYW5zY3JpcHQpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmpvaW4oJyAnKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIC50cmltKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnBvc3RNZXNzYWdlKHRyYW5zY3JpcHQpOyBcclxuICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5wb3N0TWVzc2FnZSh7IGVycm9yOiB0cnVlLCBtZXNzYWdlOiAnTm8gc3BlZWNoIGRldGVjdGVkIG9yIHJlY29nbml6ZWQuJyB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICBzZWxmLnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0Vycm9yIHByb2Nlc3Npbmcgc3BlZWNoIHJlY29nbml0aW9uOiAnICsgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSlcclxuICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgfTtcclxuICAgICAgICAgICBgO1xyXG5cclxuICAgICAgY29uc3Qgd29ya2VyQmxvYiA9IG5ldyBCbG9iKFt3b3JrZXJDb2RlXSwge1xyXG4gICAgICAgIHR5cGU6IFwiYXBwbGljYXRpb24vamF2YXNjcmlwdFwiLFxyXG4gICAgICB9KTtcclxuICAgICAgY29uc3Qgd29ya2VyVXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTCh3b3JrZXJCbG9iKTtcclxuICAgICAgdGhpcy5zcGVlY2hXb3JrZXIgPSBuZXcgV29ya2VyKHdvcmtlclVybCk7XHJcbiAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwod29ya2VyVXJsKTtcclxuXHJcbiAgICAgIHRoaXMuc2V0dXBTcGVlY2hXb3JrZXJIYW5kbGVycygpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgbmV3IE5vdGljZShcIlNwZWVjaCByZWNvZ25pdGlvbiBmZWF0dXJlIGZhaWxlZCB0byBpbml0aWFsaXplLlwiKTtcclxuICAgICAgdGhpcy5zcGVlY2hXb3JrZXIgPSBudWxsO1xyXG4gICAgfVxyXG4gIH1cclxuICBwcml2YXRlIHNldHVwU3BlZWNoV29ya2VySGFuZGxlcnMoKTogdm9pZCB7XHJcbiAgICBpZiAoIXRoaXMuc3BlZWNoV29ya2VyKSByZXR1cm47XHJcblxyXG4gICAgdGhpcy5zcGVlY2hXb3JrZXIub25tZXNzYWdlID0gZXZlbnQgPT4ge1xyXG4gICAgICBjb25zdCBkYXRhID0gZXZlbnQuZGF0YTtcclxuXHJcbiAgICAgIGlmIChkYXRhICYmIHR5cGVvZiBkYXRhID09PSBcIm9iamVjdFwiICYmIGRhdGEuZXJyb3IpIHtcclxuICAgICAgICBuZXcgTm90aWNlKGBTcGVlY2ggUmVjb2duaXRpb24gRXJyb3I6ICR7ZGF0YS5tZXNzYWdlfWApO1xyXG4gICAgICAgIHRoaXMudXBkYXRlSW5wdXRQbGFjZWhvbGRlcih0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWUpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09IFwic3RyaW5nXCIgJiYgZGF0YS50cmltKCkpIHtcclxuICAgICAgICBjb25zdCB0cmFuc2NyaXB0ID0gZGF0YS50cmltKCk7XHJcbiAgICAgICAgdGhpcy5pbnNlcnRUcmFuc2NyaXB0KHRyYW5zY3JpcHQpO1xyXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhICE9PSBcInN0cmluZ1wiKSB7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuc3BlZWNoV29ya2VyLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJBbiB1bmV4cGVjdGVkIGVycm9yIG9jY3VycmVkIGluIHRoZSBzcGVlY2ggcmVjb2duaXRpb24gd29ya2VyLlwiKTtcclxuICAgICAgdGhpcy51cGRhdGVJbnB1dFBsYWNlaG9sZGVyKHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZSk7XHJcblxyXG4gICAgICB0aGlzLnN0b3BWb2ljZVJlY29yZGluZyhmYWxzZSk7XHJcbiAgICB9O1xyXG4gIH1cclxuICBwcml2YXRlIGluc2VydFRyYW5zY3JpcHQodHJhbnNjcmlwdDogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBpZiAoIXRoaXMuaW5wdXRFbCkgcmV0dXJuO1xyXG5cclxuICAgIGNvbnN0IGN1cnJlbnRWYWwgPSB0aGlzLmlucHV0RWwudmFsdWU7XHJcbiAgICBjb25zdCBzdGFydCA9IHRoaXMuaW5wdXRFbC5zZWxlY3Rpb25TdGFydCA/PyBjdXJyZW50VmFsLmxlbmd0aDtcclxuICAgIGNvbnN0IGVuZCA9IHRoaXMuaW5wdXRFbC5zZWxlY3Rpb25FbmQgPz8gY3VycmVudFZhbC5sZW5ndGg7XHJcblxyXG4gICAgbGV0IHRleHRUb0luc2VydCA9IHRyYW5zY3JpcHQ7XHJcbiAgICBjb25zdCBwcmVjZWRpbmdDaGFyID0gc3RhcnQgPiAwID8gY3VycmVudFZhbFtzdGFydCAtIDFdIDogbnVsbDtcclxuICAgIGNvbnN0IGZvbGxvd2luZ0NoYXIgPSBlbmQgPCBjdXJyZW50VmFsLmxlbmd0aCA/IGN1cnJlbnRWYWxbZW5kXSA6IG51bGw7XHJcblxyXG4gICAgaWYgKHByZWNlZGluZ0NoYXIgJiYgcHJlY2VkaW5nQ2hhciAhPT0gXCIgXCIgJiYgcHJlY2VkaW5nQ2hhciAhPT0gXCJcXG5cIikge1xyXG4gICAgICB0ZXh0VG9JbnNlcnQgPSBcIiBcIiArIHRleHRUb0luc2VydDtcclxuICAgIH1cclxuICAgIGlmIChmb2xsb3dpbmdDaGFyICYmIGZvbGxvd2luZ0NoYXIgIT09IFwiIFwiICYmIGZvbGxvd2luZ0NoYXIgIT09IFwiXFxuXCIgJiYgIXRleHRUb0luc2VydC5lbmRzV2l0aChcIiBcIikpIHtcclxuICAgICAgdGV4dFRvSW5zZXJ0ICs9IFwiIFwiO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IG5ld1ZhbHVlID0gY3VycmVudFZhbC5zdWJzdHJpbmcoMCwgc3RhcnQpICsgdGV4dFRvSW5zZXJ0ICsgY3VycmVudFZhbC5zdWJzdHJpbmcoZW5kKTtcclxuICAgIHRoaXMuaW5wdXRFbC52YWx1ZSA9IG5ld1ZhbHVlO1xyXG5cclxuICAgIGNvbnN0IG5ld0N1cnNvclBvcyA9IHN0YXJ0ICsgdGV4dFRvSW5zZXJ0Lmxlbmd0aDtcclxuICAgIHRoaXMuaW5wdXRFbC5zZXRTZWxlY3Rpb25SYW5nZShuZXdDdXJzb3JQb3MsIG5ld0N1cnNvclBvcyk7XHJcblxyXG4gICAgdGhpcy5pbnB1dEVsLmZvY3VzKCk7XHJcbiAgICB0aGlzLmlucHV0RWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoXCJpbnB1dFwiKSk7XHJcbiAgfVxyXG4gIHByaXZhdGUgYXN5bmMgdG9nZ2xlVm9pY2VSZWNvZ25pdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGlmICh0aGlzLm1lZGlhUmVjb3JkZXIgJiYgdGhpcy5tZWRpYVJlY29yZGVyLnN0YXRlID09PSBcInJlY29yZGluZ1wiKSB7XHJcbiAgICAgIHRoaXMuc3RvcFZvaWNlUmVjb3JkaW5nKHRydWUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgYXdhaXQgdGhpcy5zdGFydFZvaWNlUmVjb2duaXRpb24oKTtcclxuICAgIH1cclxuICB9XHJcbiAgcHJpdmF0ZSBhc3luYyBzdGFydFZvaWNlUmVjb2duaXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBpZiAoIXRoaXMuc3BlZWNoV29ya2VyKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCLQpNGD0L3QutGG0ZbRjyDRgNC+0LfQv9GW0LfQvdCw0LLQsNC90L3RjyDQvNC+0LLQu9C10L3QvdGPINC90LXQtNC+0YHRgtGD0L/QvdCwICh3b3JrZXIg0L3QtSDRltC90ZbRhtGW0LDQu9GW0LfQvtCy0LDQvdC+KS5cIik7XHJcblxyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc3BlZWNoQXBpS2V5ID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MuZ29vZ2xlQXBpS2V5O1xyXG4gICAgaWYgKCFzcGVlY2hBcGlLZXkpIHtcclxuICAgICAgbmV3IE5vdGljZShcclxuICAgICAgICBcItCa0LvRjtGHIEdvb2dsZSBBUEkg0LTQu9GPINGA0L7Qt9C/0ZbQt9C90LDQstCw0L3QvdGPINC80L7QstC70LXQvdC90Y8g0L3QtSDQvdCw0LvQsNGI0YLQvtCy0LDQvdC+LiDQkdGD0LTRjCDQu9Cw0YHQutCwLCDQtNC+0LTQsNC50YLQtSDQudC+0LPQviDQsiDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y/RhSDQv9C70LDQs9GW0L3QsC5cIlxyXG4gICAgICApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgdGhpcy5hdWRpb1N0cmVhbSA9IGF3YWl0IG5hdmlnYXRvci5tZWRpYURldmljZXMuZ2V0VXNlck1lZGlhKHtcclxuICAgICAgICBhdWRpbzogdHJ1ZSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBsZXQgcmVjb3JkZXJPcHRpb25zOiBNZWRpYVJlY29yZGVyT3B0aW9ucyB8IHVuZGVmaW5lZDtcclxuICAgICAgY29uc3QgcHJlZmVycmVkTWltZVR5cGUgPSBcImF1ZGlvL3dlYm07Y29kZWNzPW9wdXNcIjtcclxuXHJcbiAgICAgIGlmIChNZWRpYVJlY29yZGVyLmlzVHlwZVN1cHBvcnRlZChwcmVmZXJyZWRNaW1lVHlwZSkpIHtcclxuICAgICAgICByZWNvcmRlck9wdGlvbnMgPSB7IG1pbWVUeXBlOiBwcmVmZXJyZWRNaW1lVHlwZSB9O1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJlY29yZGVyT3B0aW9ucyA9IHVuZGVmaW5lZDtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGhpcy5tZWRpYVJlY29yZGVyID0gbmV3IE1lZGlhUmVjb3JkZXIodGhpcy5hdWRpb1N0cmVhbSwgcmVjb3JkZXJPcHRpb25zKTtcclxuXHJcbiAgICAgIGNvbnN0IGF1ZGlvQ2h1bmtzOiBCbG9iW10gPSBbXTtcclxuXHJcbiAgICAgIHRoaXMudm9pY2VCdXR0b24/LmNsYXNzTGlzdC5hZGQoQ1NTX0NMQVNTX1JFQ09SRElORyk7XHJcbiAgICAgIHNldEljb24odGhpcy52b2ljZUJ1dHRvbiwgXCJzdG9wLWNpcmNsZVwiKTtcclxuICAgICAgdGhpcy5pbnB1dEVsLnBsYWNlaG9sZGVyID0gXCJSZWNvcmRpbmcuLi4gU3BlYWsgbm93LlwiO1xyXG5cclxuICAgICAgdGhpcy5tZWRpYVJlY29yZGVyLm9uZGF0YWF2YWlsYWJsZSA9IGV2ZW50ID0+IHtcclxuICAgICAgICBpZiAoZXZlbnQuZGF0YS5zaXplID4gMCkge1xyXG4gICAgICAgICAgYXVkaW9DaHVua3MucHVzaChldmVudC5kYXRhKTtcclxuICAgICAgICB9XHJcbiAgICAgIH07XHJcbiAgICAgIHRoaXMubWVkaWFSZWNvcmRlci5vbnN0b3AgPSAoKSA9PiB7XHJcbiAgICAgICAgaWYgKHRoaXMuc3BlZWNoV29ya2VyICYmIGF1ZGlvQ2h1bmtzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIGNvbnN0IGF1ZGlvQmxvYiA9IG5ldyBCbG9iKGF1ZGlvQ2h1bmtzLCB7XHJcbiAgICAgICAgICAgIHR5cGU6IHRoaXMubWVkaWFSZWNvcmRlcj8ubWltZVR5cGUgfHwgXCJhdWRpby93ZWJtXCIsXHJcbiAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICB0aGlzLmlucHV0RWwucGxhY2Vob2xkZXIgPSBcIlByb2Nlc3Npbmcgc3BlZWNoLi4uXCI7XHJcbiAgICAgICAgICB0aGlzLnNwZWVjaFdvcmtlci5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgIGFwaUtleTogc3BlZWNoQXBpS2V5LFxyXG4gICAgICAgICAgICBhdWRpb0Jsb2IsXHJcbiAgICAgICAgICAgIGxhbmd1YWdlQ29kZTogdGhpcy5wbHVnaW4uc2V0dGluZ3Muc3BlZWNoTGFuZ3VhZ2UgfHwgXCJ1ay1VQVwiLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChhdWRpb0NodW5rcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgIHRoaXMuZ2V0Q3VycmVudFJvbGVEaXNwbGF5TmFtZSgpLnRoZW4ocm9sZU5hbWUgPT4gdGhpcy51cGRhdGVJbnB1dFBsYWNlaG9sZGVyKHJvbGVOYW1lKSk7XHJcbiAgICAgICAgICB0aGlzLnVwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgfTtcclxuICAgICAgdGhpcy5tZWRpYVJlY29yZGVyLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIkFuIGVycm9yIG9jY3VycmVkIGR1cmluZyByZWNvcmRpbmcuXCIpO1xyXG4gICAgICAgIHRoaXMuc3RvcFZvaWNlUmVjb3JkaW5nKGZhbHNlKTtcclxuICAgICAgfTtcclxuXHJcbiAgICAgIHRoaXMubWVkaWFSZWNvcmRlci5zdGFydCgpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRE9NRXhjZXB0aW9uICYmIGVycm9yLm5hbWUgPT09IFwiTm90QWxsb3dlZEVycm9yXCIpIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiTWljcm9waG9uZSBhY2Nlc3MgZGVuaWVkLiBQbGVhc2UgZ3JhbnQgcGVybWlzc2lvbi5cIik7XHJcbiAgICAgIH0gZWxzZSBpZiAoZXJyb3IgaW5zdGFuY2VvZiBET01FeGNlcHRpb24gJiYgZXJyb3IubmFtZSA9PT0gXCJOb3RGb3VuZEVycm9yXCIpIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiTWljcm9waG9uZSBub3QgZm91bmQuIFBsZWFzZSBlbnN1cmUgaXQncyBjb25uZWN0ZWQgYW5kIGVuYWJsZWQuXCIpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJDb3VsZCBub3Qgc3RhcnQgdm9pY2UgcmVjb3JkaW5nLlwiKTtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLnN0b3BWb2ljZVJlY29yZGluZyhmYWxzZSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHByaXZhdGUgc3RvcFZvaWNlUmVjb3JkaW5nKHByb2Nlc3NBdWRpbzogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMubWVkaWFSZWNvcmRlciAmJiB0aGlzLm1lZGlhUmVjb3JkZXIuc3RhdGUgPT09IFwicmVjb3JkaW5nXCIpIHtcclxuICAgICAgdGhpcy5tZWRpYVJlY29yZGVyLnN0b3AoKTtcclxuICAgIH0gZWxzZSBpZiAoIXByb2Nlc3NBdWRpbyAmJiB0aGlzLm1lZGlhUmVjb3JkZXI/LnN0YXRlID09PSBcImluYWN0aXZlXCIpIHtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLnZvaWNlQnV0dG9uPy5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19SRUNPUkRJTkcpO1xyXG4gICAgc2V0SWNvbih0aGlzLnZvaWNlQnV0dG9uLCBcIm1pY1wiKTtcclxuXHJcbiAgICB0aGlzLmdldEN1cnJlbnRSb2xlRGlzcGxheU5hbWUoKS50aGVuKHJvbGVOYW1lID0+IHRoaXMudXBkYXRlSW5wdXRQbGFjZWhvbGRlcihyb2xlTmFtZSkpO1xyXG4gICAgdGhpcy51cGRhdGVTZW5kQnV0dG9uU3RhdGUoKTtcclxuXHJcbiAgICBpZiAodGhpcy5hdWRpb1N0cmVhbSkge1xyXG4gICAgICB0aGlzLmF1ZGlvU3RyZWFtLmdldFRyYWNrcygpLmZvckVhY2godHJhY2sgPT4gdHJhY2suc3RvcCgpKTtcclxuICAgICAgdGhpcy5hdWRpb1N0cmVhbSA9IG51bGw7XHJcbiAgICB9XHJcbiAgICB0aGlzLm1lZGlhUmVjb3JkZXIgPSBudWxsO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIGNoZWNrQWxsTWVzc2FnZXNGb3JDb2xsYXBzaW5nKCk6IHZvaWQge1xyXG4gICAgdGhpcy5jaGF0Q29udGFpbmVyPy5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihgLiR7Q1NTX0NMQVNTX01FU1NBR0V9YCkuZm9yRWFjaChtc2dFbCA9PiB7XHJcbiAgICAgIHRoaXMuY2hlY2tNZXNzYWdlRm9yQ29sbGFwc2luZyhtc2dFbCk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgdG9nZ2xlTWVzc2FnZUNvbGxhcHNlKGNvbnRlbnRFbDogSFRNTEVsZW1lbnQsIGJ1dHRvbkVsOiBIVE1MQnV0dG9uRWxlbWVudCk6IHZvaWQge1xyXG4gICAgY29uc3QgbWF4SGVpZ2h0TGltaXQgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXhNZXNzYWdlSGVpZ2h0O1xyXG5cclxuICAgIGNvbnN0IGlzSW5pdGlhbEV4cGFuZGVkU3RhdGUgPSBidXR0b25FbC5oYXNBdHRyaWJ1dGUoXCJkYXRhLWluaXRpYWwtc3RhdGVcIik7XHJcblxyXG4gICAgaWYgKGlzSW5pdGlhbEV4cGFuZGVkU3RhdGUpIHtcclxuICAgICAgYnV0dG9uRWwucmVtb3ZlQXR0cmlidXRlKFwiZGF0YS1pbml0aWFsLXN0YXRlXCIpO1xyXG5cclxuICAgICAgY29udGVudEVsLnN0eWxlLm1heEhlaWdodCA9IGAke21heEhlaWdodExpbWl0fXB4YDtcclxuICAgICAgY29udGVudEVsLmNsYXNzTGlzdC5hZGQoQ1NTX0NMQVNTX0NPTlRFTlRfQ09MTEFQU0VEKTtcclxuICAgICAgYnV0dG9uRWwuc2V0VGV4dChcIlNob3cgTW9yZSDilrxcIik7XHJcblxyXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICBjb250ZW50RWwuc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogXCJzbW9vdGhcIiwgYmxvY2s6IFwibmVhcmVzdFwiIH0pO1xyXG4gICAgICB9LCAzMTApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc3QgaXNDb2xsYXBzZWQgPSBjb250ZW50RWwuY2xhc3NMaXN0LmNvbnRhaW5zKENTU19DTEFTU19DT05URU5UX0NPTExBUFNFRCk7XHJcblxyXG4gICAgICBpZiAoaXNDb2xsYXBzZWQpIHtcclxuICAgICAgICBjb250ZW50RWwuc3R5bGUubWF4SGVpZ2h0ID0gXCJcIjtcclxuICAgICAgICBjb250ZW50RWwuY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NfQ09OVEVOVF9DT0xMQVBTRUQpO1xyXG4gICAgICAgIGJ1dHRvbkVsLnNldFRleHQoXCJTaG93IExlc3Mg4payXCIpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnRlbnRFbC5zdHlsZS5tYXhIZWlnaHQgPSBgJHttYXhIZWlnaHRMaW1pdH1weGA7XHJcbiAgICAgICAgY29udGVudEVsLmNsYXNzTGlzdC5hZGQoQ1NTX0NMQVNTX0NPTlRFTlRfQ09MTEFQU0VEKTtcclxuICAgICAgICBidXR0b25FbC5zZXRUZXh0KFwiU2hvdyBNb3JlIOKWvFwiKTtcclxuXHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICBjb250ZW50RWwuc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogXCJzbW9vdGhcIiwgYmxvY2s6IFwibmVhcmVzdFwiIH0pO1xyXG4gICAgICAgIH0sIDMxMCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHB1YmxpYyBnZXRDaGF0Q29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHtcclxuICAgIHJldHVybiB0aGlzLmNoYXRDb250YWluZXI7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNsZWFyQ2hhdENvbnRhaW5lckludGVybmFsKCk6IHZvaWQge1xyXG4gICAgdGhpcy5jdXJyZW50TWVzc2FnZXMgPSBbXTtcclxuICAgIHRoaXMubGFzdFJlbmRlcmVkTWVzc2FnZURhdGUgPSBudWxsO1xyXG4gICAgaWYgKHRoaXMuY2hhdENvbnRhaW5lcikgdGhpcy5jaGF0Q29udGFpbmVyLmVtcHR5KCk7XHJcbiAgICB0aGlzLmhpZGVFbXB0eVN0YXRlKCk7XHJcbiAgICB0aGlzLmxhc3RNZXNzYWdlRWxlbWVudCA9IG51bGw7XHJcbiAgICB0aGlzLmNvbnNlY3V0aXZlRXJyb3JNZXNzYWdlcyA9IFtdO1xyXG4gICAgdGhpcy5lcnJvckdyb3VwRWxlbWVudCA9IG51bGw7XHJcbiAgICB0aGlzLmlzU3VtbWFyaXppbmdFcnJvcnMgPSBmYWxzZTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBjbGVhckRpc3BsYXlBbmRTdGF0ZSgpOiB2b2lkIHtcclxuICAgIHRoaXMuY2xlYXJDaGF0Q29udGFpbmVySW50ZXJuYWwoKTtcclxuICAgIHRoaXMuc2hvd0VtcHR5U3RhdGUoKTtcclxuICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcbiAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMuZm9jdXNJbnB1dCgpLCA1MCk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgc2Nyb2xsVG9Cb3R0b20oKTogdm9pZCB7XHJcbiAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbSg1MCwgdHJ1ZSk7XHJcbiAgfVxyXG4gIHB1YmxpYyBjbGVhcklucHV0RmllbGQoKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5pbnB1dEVsKSB7XHJcbiAgICAgIHRoaXMuaW5wdXRFbC52YWx1ZSA9IFwiXCI7XHJcbiAgICAgIHRoaXMuaW5wdXRFbC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudChcImlucHV0XCIpKTtcclxuICAgIH1cclxuICB9XHJcbiAgcHVibGljIGZvY3VzSW5wdXQoKTogdm9pZCB7XHJcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgdGhpcy5pbnB1dEVsPy5mb2N1cygpO1xyXG4gICAgfSwgMCk7XHJcbiAgfVxyXG5cclxuICBndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oZGVsYXkgPSA1MCwgZm9yY2VTY3JvbGwgPSBmYWxzZSk6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMuc2Nyb2xsVGltZW91dCkge1xyXG4gICAgICBjbGVhclRpbWVvdXQodGhpcy5zY3JvbGxUaW1lb3V0KTtcclxuICAgICAgdGhpcy5zY3JvbGxUaW1lb3V0ID0gbnVsbDtcclxuICAgIH1cclxuICAgIHRoaXMuc2Nyb2xsVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICAgIGlmICh0aGlzLmNoYXRDb250YWluZXIpIHtcclxuICAgICAgICAgIGNvbnN0IHRocmVzaG9sZCA9IDEwMDtcclxuICAgICAgICAgIGNvbnN0IGlzU2Nyb2xsZWRVcCA9XHJcbiAgICAgICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxIZWlnaHQgLSB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG9wIC0gdGhpcy5jaGF0Q29udGFpbmVyLmNsaWVudEhlaWdodCA+XHJcbiAgICAgICAgICAgIHRocmVzaG9sZDtcclxuXHJcbiAgICAgICAgICBpZiAoaXNTY3JvbGxlZFVwICE9PSB0aGlzLnVzZXJTY3JvbGxlZFVwKSB7XHJcbiAgICAgICAgICAgIHRoaXMudXNlclNjcm9sbGVkVXAgPSBpc1Njcm9sbGVkVXA7XHJcblxyXG4gICAgICAgICAgICBpZiAoIWlzU2Nyb2xsZWRVcCkgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsPy5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBpZiAoZm9yY2VTY3JvbGwgfHwgIXRoaXMudXNlclNjcm9sbGVkVXAgfHwgdGhpcy5pc1Byb2Nlc3NpbmcpIHtcclxuICAgICAgICAgICAgY29uc3QgYmVoYXZpb3IgPSB0aGlzLmlzUHJvY2Vzc2luZyA/IFwiYXV0b1wiIDogXCJzbW9vdGhcIjtcclxuICAgICAgICAgICAgdGhpcy5jaGF0Q29udGFpbmVyLnNjcm9sbFRvKHtcclxuICAgICAgICAgICAgICB0b3A6IHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxIZWlnaHQsXHJcbiAgICAgICAgICAgICAgYmVoYXZpb3I6IGJlaGF2aW9yLFxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGlmIChmb3JjZVNjcm9sbCkge1xyXG4gICAgICAgICAgICAgIHRoaXMudXNlclNjcm9sbGVkVXAgPSBmYWxzZTtcclxuICAgICAgICAgICAgICB0aGlzLm5ld01lc3NhZ2VzSW5kaWNhdG9yRWw/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1ZJU0lCTEUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgICB0aGlzLnNjcm9sbFRpbWVvdXQgPSBudWxsO1xyXG4gICAgfSwgZGVsYXkpO1xyXG4gIH1cclxuXHJcbiAgZm9ybWF0VGltZShkYXRlOiBEYXRlKTogc3RyaW5nIHtcclxuICAgIHJldHVybiBkYXRlLnRvTG9jYWxlVGltZVN0cmluZyh1bmRlZmluZWQsIHtcclxuICAgICAgaG91cjogXCJudW1lcmljXCIsXHJcbiAgICAgIG1pbnV0ZTogXCIyLWRpZ2l0XCIsXHJcbiAgICB9KTtcclxuICB9XHJcbiAgZm9ybWF0RGF0ZVNlcGFyYXRvcihkYXRlOiBEYXRlKTogc3RyaW5nIHtcclxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XHJcbiAgICBjb25zdCB5ZXN0ZXJkYXkgPSBuZXcgRGF0ZShub3cpO1xyXG4gICAgeWVzdGVyZGF5LnNldERhdGUobm93LmdldERhdGUoKSAtIDEpO1xyXG4gICAgaWYgKHRoaXMuaXNTYW1lRGF5KGRhdGUsIG5vdykpIHJldHVybiBcIlRvZGF5XCI7XHJcbiAgICBlbHNlIGlmICh0aGlzLmlzU2FtZURheShkYXRlLCB5ZXN0ZXJkYXkpKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjtcclxuICAgIGVsc2VcclxuICAgICAgcmV0dXJuIGRhdGUudG9Mb2NhbGVEYXRlU3RyaW5nKHVuZGVmaW5lZCwge1xyXG4gICAgICAgIHdlZWtkYXk6IFwibG9uZ1wiLFxyXG4gICAgICAgIHllYXI6IFwibnVtZXJpY1wiLFxyXG4gICAgICAgIG1vbnRoOiBcImxvbmdcIixcclxuICAgICAgICBkYXk6IFwibnVtZXJpY1wiLFxyXG4gICAgICB9KTtcclxuICB9XHJcbiAgZm9ybWF0UmVsYXRpdmVEYXRlKGRhdGU6IERhdGUpOiBzdHJpbmcge1xyXG4gICAgaWYgKCEoZGF0ZSBpbnN0YW5jZW9mIERhdGUpIHx8IGlzTmFOKGRhdGUuZ2V0VGltZSgpKSkge1xyXG4gICAgICByZXR1cm4gXCJJbnZhbGlkIGRhdGVcIjtcclxuICAgIH1cclxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XHJcbiAgICBjb25zdCBkaWZmU2Vjb25kcyA9IE1hdGgucm91bmQoKG5vdy5nZXRUaW1lKCkgLSBkYXRlLmdldFRpbWUoKSkgLyAxMDAwKTtcclxuICAgIGNvbnN0IGRpZmZEYXlzID0gTWF0aC5mbG9vcihkaWZmU2Vjb25kcyAvICg2MCAqIDYwICogMjQpKTtcclxuICAgIGlmIChkaWZmRGF5cyA9PT0gMCkge1xyXG4gICAgICBjb25zdCBkaWZmSG91cnMgPSBNYXRoLmZsb29yKGRpZmZTZWNvbmRzIC8gKDYwICogNjApKTtcclxuICAgICAgaWYgKGRpZmZIb3VycyA8IDEpIHJldHVybiBcIkp1c3Qgbm93XCI7XHJcbiAgICAgIGlmIChkaWZmSG91cnMgPT09IDEpIHJldHVybiBcIjEgaG91ciBhZ29cIjtcclxuICAgICAgaWYgKGRpZmZIb3VycyA8IG5vdy5nZXRIb3VycygpKSByZXR1cm4gYCR7ZGlmZkhvdXJzfSBob3VycyBhZ29gO1xyXG4gICAgICBlbHNlIHJldHVybiBcIlRvZGF5XCI7XHJcbiAgICB9IGVsc2UgaWYgKGRpZmZEYXlzID09PSAxKSB7XHJcbiAgICAgIHJldHVybiBcIlllc3RlcmRheVwiO1xyXG4gICAgfSBlbHNlIGlmIChkaWZmRGF5cyA8IDcpIHtcclxuICAgICAgcmV0dXJuIGAke2RpZmZEYXlzfSBkYXlzIGFnb2A7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gZGF0ZS50b0xvY2FsZURhdGVTdHJpbmcodW5kZWZpbmVkLCB7XHJcbiAgICAgICAgbW9udGg6IFwic2hvcnRcIixcclxuICAgICAgICBkYXk6IFwibnVtZXJpY1wiLFxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9XHJcbiAgaXNTYW1lRGF5KGRhdGUxOiBEYXRlLCBkYXRlMjogRGF0ZSk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIChcclxuICAgICAgZGF0ZTEuZ2V0RnVsbFllYXIoKSA9PT0gZGF0ZTIuZ2V0RnVsbFllYXIoKSAmJlxyXG4gICAgICBkYXRlMS5nZXRNb250aCgpID09PSBkYXRlMi5nZXRNb250aCgpICYmXHJcbiAgICAgIGRhdGUxLmdldERhdGUoKSA9PT0gZGF0ZTIuZ2V0RGF0ZSgpXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBmb3JtYXRDaGF0VG9NYXJrZG93bihtZXNzYWdlc1RvRm9ybWF0OiBNZXNzYWdlW10pOiBzdHJpbmcge1xyXG4gICAgbGV0IGxvY2FsTGFzdERhdGU6IERhdGUgfCBudWxsID0gbnVsbDtcclxuICAgIGNvbnN0IGV4cG9ydFRpbWVzdGFtcCA9IG5ldyBEYXRlKCk7XHJcbiAgICBsZXQgbWFya2Rvd24gPSBgIyBBSSBGb3JnZSBDaGF0IEV4cG9ydFxcbmAgKyBgPiBFeHBvcnRlZCBvbjogJHtleHBvcnRUaW1lc3RhbXAudG9Mb2NhbGVTdHJpbmcodW5kZWZpbmVkKX1cXG5cXG5gO1xyXG5cclxuICAgIG1lc3NhZ2VzVG9Gb3JtYXQuZm9yRWFjaChtZXNzYWdlID0+IHtcclxuICAgICAgaWYgKCFtZXNzYWdlLmNvbnRlbnQ/LnRyaW0oKSkgcmV0dXJuO1xyXG5cclxuICAgICAgaWYgKGxvY2FsTGFzdERhdGUgPT09IG51bGwgfHwgIXRoaXMuaXNTYW1lRGF5KGxvY2FsTGFzdERhdGUsIG1lc3NhZ2UudGltZXN0YW1wKSkge1xyXG4gICAgICAgIGlmIChsb2NhbExhc3REYXRlICE9PSBudWxsKSBtYXJrZG93biArPSBgKioqXFxuYDtcclxuICAgICAgICBtYXJrZG93biArPSBgKioke3RoaXMuZm9ybWF0RGF0ZVNlcGFyYXRvcihtZXNzYWdlLnRpbWVzdGFtcCl9KipcXG4qKipcXG5cXG5gO1xyXG4gICAgICB9XHJcbiAgICAgIGxvY2FsTGFzdERhdGUgPSBtZXNzYWdlLnRpbWVzdGFtcDtcclxuXHJcbiAgICAgIGNvbnN0IHRpbWUgPSB0aGlzLmZvcm1hdFRpbWUobWVzc2FnZS50aW1lc3RhbXApO1xyXG4gICAgICBsZXQgcHJlZml4ID0gXCJcIjtcclxuICAgICAgbGV0IGNvbnRlbnRQcmVmaXggPSBcIlwiO1xyXG4gICAgICBsZXQgY29udGVudCA9IG1lc3NhZ2UuY29udGVudC50cmltKCk7XHJcblxyXG4gICAgICBpZiAobWVzc2FnZS5yb2xlID09PSBcImFzc2lzdGFudFwiKSB7XHJcbiAgICAgICAgY29udGVudCA9IFJlbmRlcmVyVXRpbHMuZGVjb2RlSHRtbEVudGl0aWVzKGNvbnRlbnQpXHJcbiAgICAgICAgICAucmVwbGFjZSgvPHRoaW5rPltcXHNcXFNdKj88XFwvdGhpbms+L2csIFwiXCIpXHJcbiAgICAgICAgICAudHJpbSgpO1xyXG5cclxuICAgICAgICBpZiAoIWNvbnRlbnQpIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgc3dpdGNoIChtZXNzYWdlLnJvbGUpIHtcclxuICAgICAgICBjYXNlIFwidXNlclwiOlxyXG4gICAgICAgICAgcHJlZml4ID0gYCoqVXNlciAoJHt0aW1lfSk6KipcXG5gO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImFzc2lzdGFudFwiOlxyXG4gICAgICAgICAgcHJlZml4ID0gYCoqQXNzaXN0YW50ICgke3RpbWV9KToqKlxcbmA7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwic3lzdGVtXCI6XHJcbiAgICAgICAgICBwcmVmaXggPSBgPiBfW1N5c3RlbSAoJHt0aW1lfSldXyBcXG4+IGA7XHJcbiAgICAgICAgICBjb250ZW50UHJlZml4ID0gXCI+IFwiO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImVycm9yXCI6XHJcbiAgICAgICAgICBwcmVmaXggPSBgPiBbIUVSUk9SXSBFcnJvciAoJHt0aW1lfSk6XFxuPiBgO1xyXG4gICAgICAgICAgY29udGVudFByZWZpeCA9IFwiPiBcIjtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICB9XHJcbiAgICAgIG1hcmtkb3duICs9IHByZWZpeDtcclxuICAgICAgaWYgKGNvbnRlbnRQcmVmaXgpIHtcclxuICAgICAgICBtYXJrZG93biArPVxyXG4gICAgICAgICAgY29udGVudFxyXG4gICAgICAgICAgICAuc3BsaXQoXCJcXG5cIilcclxuICAgICAgICAgICAgLm1hcChsaW5lID0+IChsaW5lLnRyaW0oKSA/IGAke2NvbnRlbnRQcmVmaXh9JHtsaW5lfWAgOiBjb250ZW50UHJlZml4LnRyaW0oKSkpXHJcbiAgICAgICAgICAgIC5qb2luKGBcXG5gKSArIFwiXFxuXFxuXCI7XHJcbiAgICAgIH0gZWxzZSBpZiAoY29udGVudC5pbmNsdWRlcyhcImBgYFwiKSkge1xyXG4gICAgICAgIGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UoLyhcXG4qXFxzKilgYGAvZywgXCJcXG5cXG5gYGBcIikucmVwbGFjZSgvYGBgKFxccypcXG4qKS9nLCBcImBgYFxcblxcblwiKTtcclxuICAgICAgICBtYXJrZG93biArPSBjb250ZW50LnRyaW0oKSArIFwiXFxuXFxuXCI7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbWFya2Rvd24gKz1cclxuICAgICAgICAgIGNvbnRlbnRcclxuICAgICAgICAgICAgLnNwbGl0KFwiXFxuXCIpXHJcbiAgICAgICAgICAgIC5tYXAobGluZSA9PiAobGluZS50cmltKCkgPyBsaW5lIDogXCJcIikpXHJcbiAgICAgICAgICAgIC5qb2luKFwiXFxuXCIpICsgXCJcXG5cXG5cIjtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gbWFya2Rvd24udHJpbSgpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBnZXRDdXJyZW50Um9sZURpc3BsYXlOYW1lKCk6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuXHJcbiAgICAgIGNvbnN0IHJvbGVQYXRoID0gYWN0aXZlQ2hhdD8ubWV0YWRhdGE/LnNlbGVjdGVkUm9sZVBhdGggPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aDtcclxuXHJcbiAgICAgIGlmIChyb2xlUGF0aCkge1xyXG4gICAgICAgIGNvbnN0IGFsbFJvbGVzID0gYXdhaXQgdGhpcy5wbHVnaW4ubGlzdFJvbGVGaWxlcyh0cnVlKTtcclxuXHJcbiAgICAgICAgY29uc3QgZm91bmRSb2xlID0gYWxsUm9sZXMuZmluZChyb2xlID0+IHJvbGUucGF0aCA9PT0gcm9sZVBhdGgpO1xyXG5cclxuICAgICAgICBpZiAoZm91bmRSb2xlKSB7XHJcbiAgICAgICAgICByZXR1cm4gZm91bmRSb2xlLm5hbWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNvbnNvbGUud2FybihgUm9sZSB3aXRoIHBhdGggXCIke3JvbGVQYXRofVwiIG5vdCBmb3VuZCBpbiBsaXN0Um9sZUZpbGVzIHJlc3VsdHMuYCk7XHJcblxyXG4gICAgICAgICAgcmV0dXJuIHJvbGVQYXRoLnNwbGl0KFwiL1wiKS5wb3AoKT8ucmVwbGFjZShcIi5tZFwiLCBcIlwiKSB8fCBcIlNlbGVjdGVkIFJvbGVcIjtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBnZXR0aW5nIGN1cnJlbnQgcm9sZSBkaXNwbGF5IG5hbWU6XCIsIGVycm9yKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gXCJOb25lXCI7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZVJvbGVEaXNwbGF5Q2xpY2sgPSBhc3luYyAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcclxuICAgIGNvbnN0IG1lbnUgPSBuZXcgTWVudSgpO1xyXG4gICAgbGV0IGl0ZW1zQWRkZWQgPSBmYWxzZTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByb2xlcyA9IGF3YWl0IHRoaXMucGx1Z2luLmxpc3RSb2xlRmlsZXModHJ1ZSk7XHJcbiAgICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdCgpO1xyXG4gICAgICBjb25zdCBjdXJyZW50Um9sZVBhdGggPSBhY3RpdmVDaGF0Py5tZXRhZGF0YT8uc2VsZWN0ZWRSb2xlUGF0aCA/PyB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoO1xyXG5cclxuICAgICAgbWVudS5hZGRJdGVtKGl0ZW0gPT4ge1xyXG4gICAgICAgIGl0ZW1cclxuICAgICAgICAgIC5zZXRUaXRsZShcIk5vbmVcIilcclxuICAgICAgICAgIC5zZXRJY29uKCFjdXJyZW50Um9sZVBhdGggPyBcImNoZWNrXCIgOiBcInNsYXNoXCIpXHJcbiAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5ld1JvbGVQYXRoID0gXCJcIjtcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRSb2xlUGF0aCAhPT0gbmV3Um9sZVBhdGgpIHtcclxuICAgICAgICAgICAgICBpZiAoYWN0aXZlQ2hhdCkge1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIudXBkYXRlQWN0aXZlQ2hhdE1ldGFkYXRhKHtcclxuICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRSb2xlUGF0aDogbmV3Um9sZVBhdGgsXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aCA9IG5ld1JvbGVQYXRoO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uZW1pdChcInJvbGUtY2hhbmdlZFwiLCBcIk5vbmVcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5wcm9tcHRTZXJ2aWNlPy5jbGVhclJvbGVDYWNoZT8uKCk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICBpdGVtc0FkZGVkID0gdHJ1ZTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBpZiAocm9sZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIG1lbnUuYWRkU2VwYXJhdG9yKCk7XHJcbiAgICAgICAgaXRlbXNBZGRlZCA9IHRydWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJvbGVzLmZvckVhY2gocm9sZUluZm8gPT4ge1xyXG4gICAgICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IHtcclxuICAgICAgICAgIGl0ZW1cclxuICAgICAgICAgICAgLnNldFRpdGxlKHJvbGVJbmZvLm5hbWUpXHJcbiAgICAgICAgICAgIC5zZXRJY29uKHJvbGVJbmZvLnBhdGggPT09IGN1cnJlbnRSb2xlUGF0aCA/IFwiY2hlY2tcIiA6IHJvbGVJbmZvLmlzQ3VzdG9tID8gXCJ1c2VyXCIgOiBcImZpbGUtdGV4dFwiKVxyXG4gICAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgY29uc3QgbmV3Um9sZVBhdGggPSByb2xlSW5mby5wYXRoO1xyXG4gICAgICAgICAgICAgIGlmIChjdXJyZW50Um9sZVBhdGggIT09IG5ld1JvbGVQYXRoKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoYWN0aXZlQ2hhdCkge1xyXG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci51cGRhdGVBY3RpdmVDaGF0TWV0YWRhdGEoe1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkUm9sZVBhdGg6IG5ld1JvbGVQYXRoLFxyXG4gICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGggPSBuZXdSb2xlUGF0aDtcclxuICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJyb2xlLWNoYW5nZWRcIiwgcm9sZUluZm8ubmFtZSk7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnByb21wdFNlcnZpY2U/LmNsZWFyUm9sZUNhY2hlPy4oKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgaXRlbXNBZGRlZCA9IHRydWU7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGxvYWRpbmcgcm9sZXMgZm9yIHJvbGUgc2VsZWN0aW9uIG1lbnU6XCIsIGVycm9yKTtcclxuXHJcbiAgICAgIGlmICghaXRlbXNBZGRlZCkge1xyXG4gICAgICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IGl0ZW0uc2V0VGl0bGUoXCJFcnJvciBsb2FkaW5nIHJvbGVzXCIpLnNldERpc2FibGVkKHRydWUpKTtcclxuICAgICAgICBpdGVtc0FkZGVkID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIGxvYWQgcm9sZXMuXCIpO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgaWYgKGl0ZW1zQWRkZWQpIHtcclxuICAgICAgICBtZW51LnNob3dBdE1vdXNlRXZlbnQoZXZlbnQpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVUZW1wZXJhdHVyZUNsaWNrID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcblxyXG4gICAgaWYgKCFhY3RpdmVDaGF0KSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJTZWxlY3Qgb3IgY3JlYXRlIGEgY2hhdCB0byBjaGFuZ2UgdGVtcGVyYXR1cmUuXCIpO1xyXG5cclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGN1cnJlbnRUZW1wID0gYWN0aXZlQ2hhdC5tZXRhZGF0YS50ZW1wZXJhdHVyZSA/PyB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZTtcclxuICAgIGNvbnN0IGN1cnJlbnRUZW1wU3RyaW5nID0gY3VycmVudFRlbXAgIT09IG51bGwgJiYgY3VycmVudFRlbXAgIT09IHVuZGVmaW5lZCA/IFN0cmluZyhjdXJyZW50VGVtcCkgOiBcIlwiO1xyXG5cclxuICAgIG5ldyBQcm9tcHRNb2RhbChcclxuICAgICAgdGhpcy5hcHAsXHJcbiAgICAgIFwiU2V0IFRlbXBlcmF0dXJlXCIsXHJcbiAgICAgIGBFbnRlciBuZXcgdGVtcGVyYXR1cmUgKGUuZy4sIDAuNykuIEhpZ2hlciB2YWx1ZXMgPSBtb3JlIGNyZWF0aXZlLCBsb3dlciA9IG1vcmUgZm9jdXNlZC5gLFxyXG4gICAgICBjdXJyZW50VGVtcFN0cmluZyxcclxuICAgICAgYXN5bmMgbmV3VmFsdWUgPT4ge1xyXG4gICAgICAgIGlmIChuZXdWYWx1ZSA9PT0gbnVsbCB8fCBuZXdWYWx1ZS50cmltKCkgPT09IFwiXCIpIHtcclxuICAgICAgICAgIG5ldyBOb3RpY2UoXCJUZW1wZXJhdHVyZSBjaGFuZ2UgY2FuY2VsbGVkLlwiKTtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG5ld1RlbXAgPSBwYXJzZUZsb2F0KG5ld1ZhbHVlLnRyaW0oKSk7XHJcblxyXG4gICAgICAgIGlmIChpc05hTihuZXdUZW1wKSB8fCBuZXdUZW1wIDwgMCB8fCBuZXdUZW1wID4gMi4wKSB7XHJcbiAgICAgICAgICBuZXcgTm90aWNlKFwiSW52YWxpZCB0ZW1wZXJhdHVyZS4gUGxlYXNlIGVudGVyIGEgbnVtYmVyIGJldHdlZW4gMC4wIGFuZCAyLjAuXCIsIDQwMDApO1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnVwZGF0ZUFjdGl2ZUNoYXRNZXRhZGF0YSh7XHJcbiAgICAgICAgICAgIHRlbXBlcmF0dXJlOiBuZXdUZW1wLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICB0aGlzLnVwZGF0ZVRlbXBlcmF0dXJlSW5kaWNhdG9yKG5ld1RlbXApO1xyXG4gICAgICAgICAgbmV3IE5vdGljZShgVGVtcGVyYXR1cmUgc2V0IHRvICR7bmV3VGVtcH0gZm9yIGNoYXQgXCIke2FjdGl2ZUNoYXQubWV0YWRhdGEubmFtZX1cIi5gKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgbmV3IE5vdGljZShcIkVycm9yIHNldHRpbmcgdGVtcGVyYXR1cmUuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgKS5vcGVuKCk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSB1cGRhdGVUZW1wZXJhdHVyZUluZGljYXRvcih0ZW1wZXJhdHVyZTogbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLnRlbXBlcmF0dXJlSW5kaWNhdG9yRWwpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCB0ZW1wVmFsdWUgPSB0ZW1wZXJhdHVyZSA/PyB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZTtcclxuXHJcbiAgICBjb25zdCBlbW9qaSA9IHRoaXMuZ2V0VGVtcGVyYXR1cmVFbW9qaSh0ZW1wVmFsdWUpO1xyXG4gICAgdGhpcy50ZW1wZXJhdHVyZUluZGljYXRvckVsLnNldFRleHQoZW1vamkpO1xyXG4gICAgdGhpcy50ZW1wZXJhdHVyZUluZGljYXRvckVsLnRpdGxlID0gYFRlbXBlcmF0dXJlOiAke3RlbXBWYWx1ZS50b0ZpeGVkKDEpfS4gQ2xpY2sgdG8gY2hhbmdlLmA7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGdldFRlbXBlcmF0dXJlRW1vamkodGVtcGVyYXR1cmU6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICBpZiAodGVtcGVyYXR1cmUgPD0gMC40KSB7XHJcbiAgICAgIHJldHVybiBcIvCfp4pcIjtcclxuICAgIH0gZWxzZSBpZiAodGVtcGVyYXR1cmUgPiAwLjQgJiYgdGVtcGVyYXR1cmUgPD0gMC42KSB7XHJcbiAgICAgIHJldHVybiBcIvCfmYJcIjtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJldHVybiBcIvCfpKpcIjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgdXBkYXRlVG9nZ2xlVmlld0xvY2F0aW9uT3B0aW9uKCk6IHZvaWQge1xyXG4gICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyPy51cGRhdGVUb2dnbGVWaWV3TG9jYXRpb25PcHRpb24oKTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBoYW5kbGVUb2dnbGVWaWV3TG9jYXRpb25DbGljayA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uY2xvc2VNZW51KCk7XHJcbiAgICBjb25zdCBjdXJyZW50U2V0dGluZyA9IHRoaXMucGx1Z2luLnNldHRpbmdzLm9wZW5DaGF0SW5UYWI7XHJcbiAgICBjb25zdCBuZXdTZXR0aW5nID0gIWN1cnJlbnRTZXR0aW5nO1xyXG5cclxuICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm9wZW5DaGF0SW5UYWIgPSBuZXdTZXR0aW5nO1xyXG4gICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblxyXG4gICAgdGhpcy5hcHAud29ya3NwYWNlLmRldGFjaExlYXZlc09mVHlwZShWSUVXX1RZUEVfT0xMQU1BX1BFUlNPTkFTKTtcclxuXHJcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgdGhpcy5wbHVnaW4uYWN0aXZhdGVWaWV3KCk7XHJcbiAgICB9LCA1MCk7XHJcbiAgfTtcclxuXHJcbiAgcHVibGljIGFzeW5jIGZpbmRSb2xlTmFtZUJ5UGF0aChyb2xlUGF0aDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICBpZiAoIXJvbGVQYXRoKSB7XHJcbiAgICAgIHJldHVybiBcIk5vbmVcIjtcclxuICAgIH1cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGFsbFJvbGVzID0gYXdhaXQgdGhpcy5wbHVnaW4ubGlzdFJvbGVGaWxlcyh0cnVlKTtcclxuICAgICAgY29uc3QgZm91bmRSb2xlID0gYWxsUm9sZXMuZmluZChyb2xlID0+IHJvbGUucGF0aCA9PT0gcm9sZVBhdGgpO1xyXG4gICAgICBpZiAoZm91bmRSb2xlKSB7XHJcbiAgICAgICAgcmV0dXJuIGZvdW5kUm9sZS5uYW1lO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnN0IGZpbGVOYW1lID0gcm9sZVBhdGguc3BsaXQoXCIvXCIpLnBvcCgpPy5yZXBsYWNlKFwiLm1kXCIsIFwiXCIpO1xyXG4gICAgICAgIHJldHVybiBmaWxlTmFtZSB8fCBcIlVua25vd24gUm9sZVwiO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICByZXR1cm4gXCJFcnJvclwiO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSB1cGRhdGVDaGF0UGFuZWxMaXN0ID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy5jaGF0UGFuZWxMaXN0RWw7XHJcbiAgICBpZiAoIWNvbnRhaW5lciB8fCAhdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLmNoYXRQYW5lbEhlYWRlckVsPy5nZXRBdHRyaWJ1dGUoXCJkYXRhLWNvbGxhcHNlZFwiKSA9PT0gXCJ0cnVlXCIpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGN1cnJlbnRTY3JvbGxUb3AgPSBjb250YWluZXIuc2Nyb2xsVG9wO1xyXG4gICAgY29udGFpbmVyLmVtcHR5KCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgY2hhdHM6IENoYXRNZXRhZGF0YVtdID0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIubGlzdEF2YWlsYWJsZUNoYXRzKCkgfHwgW107XHJcbiAgICAgIGNvbnN0IGN1cnJlbnRBY3RpdmVJZCA9IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXRJZCgpO1xyXG5cclxuICAgICAgaWYgKGNoYXRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibWVudS1pbmZvLXRleHRcIiwgdGV4dDogXCJObyBzYXZlZCBjaGF0cyB5ZXQuXCIgfSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY2hhdHMuZm9yRWFjaChjaGF0TWV0YSA9PiB7XHJcbiAgICAgICAgICBjb25zdCBjaGF0T3B0aW9uRWwgPSBjb250YWluZXIuY3JlYXRlRGl2KHtcclxuICAgICAgICAgICAgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTSwgQ1NTX0NMQVNTX01FTlVfT1BUSU9OLCBDU1NfQ0xBU1NfQ0hBVF9MSVNUX0lURU1dLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBjb25zdCBpY29uU3BhbiA9IGNoYXRPcHRpb25FbC5jcmVhdGVTcGFuKHsgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTV9JQ09OLCBcIm1lbnUtb3B0aW9uLWljb25cIl0gfSk7XHJcbiAgICAgICAgICBpZiAoY2hhdE1ldGEuaWQgPT09IGN1cnJlbnRBY3RpdmVJZCkge1xyXG4gICAgICAgICAgICBzZXRJY29uKGljb25TcGFuLCBcImNoZWNrXCIpO1xyXG4gICAgICAgICAgICBjaGF0T3B0aW9uRWwuYWRkQ2xhc3MoQ1NTX1JPTEVfUEFORUxfSVRFTV9BQ1RJVkUpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgc2V0SWNvbihpY29uU3BhbiwgXCJtZXNzYWdlLXNxdWFyZVwiKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBjb25zdCB0ZXh0V3JhcHBlciA9IGNoYXRPcHRpb25FbC5jcmVhdGVEaXYoeyBjbHM6IFwib2xsYW1hLWNoYXQtaXRlbS10ZXh0LXdyYXBwZXJcIiB9KTtcclxuICAgICAgICAgIHRleHRXcmFwcGVyLmNyZWF0ZURpdih7IGNsczogXCJjaGF0LXBhbmVsLWl0ZW0tbmFtZVwiLCB0ZXh0OiBjaGF0TWV0YS5uYW1lIH0pO1xyXG5cclxuICAgICAgICAgIGNvbnN0IGxhc3RNb2RpZmllZERhdGUgPSBuZXcgRGF0ZShjaGF0TWV0YS5sYXN0TW9kaWZpZWQpO1xyXG5cclxuICAgICAgICAgIGNvbnN0IGRhdGVUZXh0ID0gIWlzTmFOKGxhc3RNb2RpZmllZERhdGUuZ2V0VGltZSgpKVxyXG4gICAgICAgICAgICA/IHRoaXMuZm9ybWF0UmVsYXRpdmVEYXRlKGxhc3RNb2RpZmllZERhdGUpXHJcbiAgICAgICAgICAgIDogXCJJbnZhbGlkIGRhdGVcIjtcclxuICAgICAgICAgIGlmIChkYXRlVGV4dCA9PT0gXCJJbnZhbGlkIGRhdGVcIikge1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgdGV4dFdyYXBwZXIuY3JlYXRlRGl2KHsgY2xzOiBcImNoYXQtcGFuZWwtaXRlbS1kYXRlXCIsIHRleHQ6IGRhdGVUZXh0IH0pO1xyXG5cclxuICAgICAgICAgIGNvbnN0IG9wdGlvbnNCdG4gPSBjaGF0T3B0aW9uRWwuY3JlYXRlRWwoXCJidXR0b25cIiwge1xyXG4gICAgICAgICAgICBjbHM6IFtDU1NfQ0hBVF9JVEVNX09QVElPTlMsIFwiY2xpY2thYmxlLWljb25cIl0sXHJcbiAgICAgICAgICAgIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiQ2hhdCBvcHRpb25zXCIsIHRpdGxlOiBcIk1vcmUgb3B0aW9uc1wiIH0sXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIHNldEljb24ob3B0aW9uc0J0biwgXCJsdWNpZGUtbW9yZS1ob3Jpem9udGFsXCIpO1xyXG5cclxuICAgICAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudChjaGF0T3B0aW9uRWwsIFwiY2xpY2tcIiwgYXN5bmMgZSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghKGUudGFyZ2V0IGluc3RhbmNlb2YgRWxlbWVudCAmJiBlLnRhcmdldC5jbG9zZXN0KGAuJHtDU1NfQ0hBVF9JVEVNX09QVElPTlN9YCkpKSB7XHJcbiAgICAgICAgICAgICAgaWYgKGNoYXRNZXRhLmlkICE9PSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdElkKCkpIHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnNldEFjdGl2ZUNoYXQoY2hhdE1ldGEuaWQpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQob3B0aW9uc0J0biwgXCJjbGlja1wiLCBlID0+IHtcclxuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgICAgICAgdGhpcy5zaG93Q2hhdENvbnRleHRNZW51KGUsIGNoYXRNZXRhKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KGNoYXRPcHRpb25FbCwgXCJjb250ZXh0bWVudVwiLCBlID0+IHtcclxuICAgICAgICAgICAgdGhpcy5zaG93Q2hhdENvbnRleHRNZW51KGUsIGNoYXRNZXRhKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb250YWluZXIuZW1wdHkoKTtcclxuICAgICAgY29udGFpbmVyLmNyZWF0ZURpdih7IHRleHQ6IFwiRXJyb3IgbG9hZGluZyBjaGF0cy5cIiwgY2xzOiBcIm1lbnUtZXJyb3ItdGV4dFwiIH0pO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcclxuICAgICAgICBpZiAoY29udGFpbmVyICYmIGNvbnRhaW5lci5pc0Nvbm5lY3RlZCkge1xyXG4gICAgICAgICAgY29udGFpbmVyLnNjcm9sbFRvcCA9IGN1cnJlbnRTY3JvbGxUb3A7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwcml2YXRlIHNob3dDaGF0Q29udGV4dE1lbnUoZXZlbnQ6IE1vdXNlRXZlbnQsIGNoYXRNZXRhOiBDaGF0TWV0YWRhdGEpOiB2b2lkIHtcclxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICBjb25zdCBtZW51ID0gbmV3IE1lbnUoKTtcclxuXHJcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxyXG4gICAgICBpdGVtXHJcbiAgICAgICAgLnNldFRpdGxlKFwiQ2xvbmUgQ2hhdFwiKVxyXG4gICAgICAgIC5zZXRJY29uKFwibHVjaWRlLWNvcHktcGx1c1wiKVxyXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuaGFuZGxlQ29udGV4dE1lbnVDbG9uZShjaGF0TWV0YS5pZCkpXHJcbiAgICApO1xyXG5cclxuICAgIG1lbnUuYWRkSXRlbShpdGVtID0+XHJcbiAgICAgIGl0ZW1cclxuICAgICAgICAuc2V0VGl0bGUoXCJSZW5hbWUgQ2hhdFwiKVxyXG4gICAgICAgIC5zZXRJY29uKFwibHVjaWRlLXBlbmNpbFwiKVxyXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuaGFuZGxlQ29udGV4dE1lbnVSZW5hbWUoY2hhdE1ldGEuaWQsIGNoYXRNZXRhLm5hbWUpKVxyXG4gICAgKTtcclxuXHJcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxyXG4gICAgICBpdGVtXHJcbiAgICAgICAgLnNldFRpdGxlKFwiRXhwb3J0IHRvIE5vdGVcIilcclxuICAgICAgICAuc2V0SWNvbihcImx1Y2lkZS1kb3dubG9hZFwiKVxyXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuZXhwb3J0U3BlY2lmaWNDaGF0KGNoYXRNZXRhLmlkKSlcclxuICAgICk7XHJcblxyXG4gICAgbWVudS5hZGRTZXBhcmF0b3IoKTtcclxuXHJcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PiB7XHJcbiAgICAgIGl0ZW1cclxuICAgICAgICAuc2V0VGl0bGUoXCJDbGVhciBNZXNzYWdlc1wiKVxyXG4gICAgICAgIC5zZXRJY29uKFwibHVjaWRlLXRyYXNoXCIpXHJcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5oYW5kbGVDb250ZXh0TWVudUNsZWFyKGNoYXRNZXRhLmlkLCBjaGF0TWV0YS5uYW1lKSk7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgKGl0ZW0gYXMgYW55KS5lbC5hZGRDbGFzcyhcImRhbmdlci1vcHRpb25cIik7XHJcbiAgICAgIH0gY2F0Y2ggKGUpIHt9XHJcbiAgICB9KTtcclxuXHJcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PiB7XHJcbiAgICAgIGl0ZW1cclxuICAgICAgICAuc2V0VGl0bGUoXCJEZWxldGUgQ2hhdFwiKVxyXG4gICAgICAgIC5zZXRJY29uKFwibHVjaWRlLXRyYXNoLTJcIilcclxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLmhhbmRsZUNvbnRleHRNZW51RGVsZXRlKGNoYXRNZXRhLmlkLCBjaGF0TWV0YS5uYW1lKSk7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgKGl0ZW0gYXMgYW55KS5lbC5hZGRDbGFzcyhcImRhbmdlci1vcHRpb25cIik7XHJcbiAgICAgIH0gY2F0Y2ggKGUpIHt9XHJcbiAgICB9KTtcclxuXHJcbiAgICBtZW51LnNob3dBdE1vdXNlRXZlbnQoZXZlbnQpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVDb250ZXh0TWVudUNsb25lKGNoYXRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBjbG9uaW5nTm90aWNlID0gbmV3IE5vdGljZShcIkNsb25pbmcgY2hhdC4uLlwiLCAwKTtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNsb25lZENoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jbG9uZUNoYXQoY2hhdElkKTtcclxuICAgICAgaWYgKGNsb25lZENoYXQpIHtcclxuICAgICAgICBuZXcgTm90aWNlKGBDaGF0IGNsb25lZCBhcyBcIiR7Y2xvbmVkQ2hhdC5tZXRhZGF0YS5uYW1lfVwiIGFuZCBhY3RpdmF0ZWQuYCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBjbG9uaW5nIGNoYXQuXCIpO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgY2xvbmluZ05vdGljZS5oaWRlKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIGV4cG9ydFNwZWNpZmljQ2hhdChjaGF0SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgZXhwb3J0aW5nTm90aWNlID0gbmV3IE5vdGljZShgRXhwb3J0aW5nIGNoYXQuLi5gLCAwKTtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRDaGF0KGNoYXRJZCk7XHJcbiAgICAgIGlmICghY2hhdCB8fCBjaGF0Lm1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJDaGF0IGlzIGVtcHR5IG9yIG5vdCBmb3VuZCwgbm90aGluZyB0byBleHBvcnQuXCIpO1xyXG4gICAgICAgIGV4cG9ydGluZ05vdGljZS5oaWRlKCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBtYXJrZG93bkNvbnRlbnQgPSB0aGlzLmZvcm1hdENoYXRUb01hcmtkb3duKGNoYXQubWVzc2FnZXMpO1xyXG4gICAgICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkucmVwbGFjZSgvWzouXS9nLCBcIi1cIik7XHJcbiAgICAgIGNvbnN0IHNhZmVOYW1lID0gY2hhdC5tZXRhZGF0YS5uYW1lLnJlcGxhY2UoL1tcXFxcLz86KlwiPD58XS9nLCBcIi1cIik7XHJcbiAgICAgIGNvbnN0IGZpbGVuYW1lID0gYG9sbGFtYS1jaGF0LSR7c2FmZU5hbWV9LSR7dGltZXN0YW1wfS5tZGA7XHJcblxyXG4gICAgICBsZXQgdGFyZ2V0Rm9sZGVyUGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmNoYXRFeHBvcnRGb2xkZXJQYXRoPy50cmltKCk7XHJcbiAgICAgIGxldCB0YXJnZXRGb2xkZXI6IFRGb2xkZXIgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAgIGlmICh0YXJnZXRGb2xkZXJQYXRoKSB7XHJcbiAgICAgICAgdGFyZ2V0Rm9sZGVyUGF0aCA9IG5vcm1hbGl6ZVBhdGgodGFyZ2V0Rm9sZGVyUGF0aCk7XHJcbiAgICAgICAgY29uc3QgYWJzdHJhY3RGaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHRhcmdldEZvbGRlclBhdGgpO1xyXG4gICAgICAgIGlmICghYWJzdHJhY3RGaWxlKSB7XHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIodGFyZ2V0Rm9sZGVyUGF0aCk7XHJcbiAgICAgICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh0YXJnZXRGb2xkZXJQYXRoKSBhcyBURm9sZGVyO1xyXG4gICAgICAgICAgICBpZiAodGFyZ2V0Rm9sZGVyKSBuZXcgTm90aWNlKGBDcmVhdGVkIGV4cG9ydCBmb2xkZXI6ICR7dGFyZ2V0Rm9sZGVyUGF0aH1gKTtcclxuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvciBjcmVhdGluZyBleHBvcnQgZm9sZGVyLiBTYXZpbmcgdG8gdmF1bHQgcm9vdC5gKTtcclxuICAgICAgICAgICAgdGFyZ2V0Rm9sZGVyID0gdGhpcy5hcHAudmF1bHQuZ2V0Um9vdCgpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAoYWJzdHJhY3RGaWxlIGluc3RhbmNlb2YgVEZvbGRlcikge1xyXG4gICAgICAgICAgdGFyZ2V0Rm9sZGVyID0gYWJzdHJhY3RGaWxlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvcjogRXhwb3J0IHBhdGggaXMgbm90IGEgZm9sZGVyLiBTYXZpbmcgdG8gdmF1bHQgcm9vdC5gKTtcclxuICAgICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldFJvb3QoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGFyZ2V0Rm9sZGVyID0gdGhpcy5hcHAudmF1bHQuZ2V0Um9vdCgpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoIXRhcmdldEZvbGRlcikge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBkZXRlcm1pbmluZyBleHBvcnQgZm9sZGVyLlwiKTtcclxuICAgICAgICBleHBvcnRpbmdOb3RpY2UuaGlkZSgpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZmlsZVBhdGggPSBub3JtYWxpemVQYXRoKGAke3RhcmdldEZvbGRlci5wYXRofS8ke2ZpbGVuYW1lfWApO1xyXG4gICAgICBjb25zdCBleGlzdGluZ0ZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xyXG4gICAgICBpZiAoZXhpc3RpbmdGaWxlKSB7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGZpbGUgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUoZmlsZVBhdGgsIG1hcmtkb3duQ29udGVudCk7XHJcbiAgICAgIG5ldyBOb3RpY2UoYENoYXQgZXhwb3J0ZWQgdG8gJHtmaWxlLnBhdGh9YCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBuZXcgTm90aWNlKFwiQW4gZXJyb3Igb2NjdXJyZWQgZHVyaW5nIGNoYXQgZXhwb3J0LlwiKTtcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIGV4cG9ydGluZ05vdGljZS5oaWRlKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUNvbnRleHRNZW51Q2xlYXIoY2hhdElkOiBzdHJpbmcsIGNoYXROYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIG5ldyBDb25maXJtTW9kYWwoXHJcbiAgICAgIHRoaXMuYXBwLFxyXG4gICAgICBcIkNvbmZpcm0gQ2xlYXIgTWVzc2FnZXNcIixcclxuICAgICAgYEFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBjbGVhciBhbGwgbWVzc2FnZXMgaW4gY2hhdCBcIiR7Y2hhdE5hbWV9XCI/XFxuVGhpcyBhY3Rpb24gY2Fubm90IGJlIHVuZG9uZS5gLFxyXG4gICAgICBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgY29uc3QgY2xlYXJpbmdOb3RpY2UgPSBuZXcgTm90aWNlKFwiQ2xlYXJpbmcgbWVzc2FnZXMuLi5cIiwgMCk7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jbGVhckNoYXRNZXNzYWdlc0J5SWQoY2hhdElkKTtcclxuXHJcbiAgICAgICAgICBpZiAoc3VjY2Vzcykge1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKGBNZXNzYWdlcyBjbGVhcmVkIGZvciBjaGF0IFwiJHtjaGF0TmFtZX1cIi5gKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYEZhaWxlZCB0byBjbGVhciBtZXNzYWdlcyBmb3IgY2hhdCBcIiR7Y2hhdE5hbWV9XCIuYCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBjbGVhcmluZyBtZXNzYWdlcy5cIik7XHJcbiAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgIGNsZWFyaW5nTm90aWNlLmhpZGUoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICkub3BlbigpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVDb250ZXh0TWVudURlbGV0ZShjaGF0SWQ6IHN0cmluZywgY2hhdE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgbmV3IENvbmZpcm1Nb2RhbChcclxuICAgICAgdGhpcy5hcHAsXHJcbiAgICAgIFwiQ29uZmlybSBEZWxldGUgQ2hhdFwiLFxyXG4gICAgICBgQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSBjaGF0IFwiJHtjaGF0TmFtZX1cIj9cXG5UaGlzIGFjdGlvbiBjYW5ub3QgYmUgdW5kb25lLmAsXHJcbiAgICAgIGFzeW5jICgpID0+IHtcclxuICAgICAgICBjb25zdCBkZWxldGluZ05vdGljZSA9IG5ldyBOb3RpY2UoXCJEZWxldGluZyBjaGF0Li4uXCIsIDApO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZGVsZXRlQ2hhdChjaGF0SWQpO1xyXG4gICAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShgQ2hhdCBcIiR7Y2hhdE5hbWV9XCIgZGVsZXRlZC5gKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBkZWxldGluZyBjaGF0LlwiKTtcclxuICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgZGVsZXRpbmdOb3RpY2UuaGlkZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgKS5vcGVuKCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGlzQ2hhdFNjcm9sbGVkVXAoKTogYm9vbGVhbiB7XHJcbiAgICBpZiAoIXRoaXMuY2hhdENvbnRhaW5lcikgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgIGNvbnN0IHNjcm9sbGFibGVEaXN0YW5jZSA9IHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxIZWlnaHQgLSB0aGlzLmNoYXRDb250YWluZXIuY2xpZW50SGVpZ2h0O1xyXG4gICAgaWYgKHNjcm9sbGFibGVEaXN0YW5jZSA8PSAwKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgY29uc3QgZGlzdGFuY2VGcm9tQm90dG9tID0gc2Nyb2xsYWJsZURpc3RhbmNlIC0gdGhpcy5jaGF0Q29udGFpbmVyLnNjcm9sbFRvcDtcclxuICAgIHJldHVybiBkaXN0YW5jZUZyb21Cb3R0b20gPj0gU0NST0xMX1RIUkVTSE9MRDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgdXBkYXRlU2Nyb2xsU3RhdGVBbmRJbmRpY2F0b3JzKCk6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLmNoYXRDb250YWluZXIpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCB3YXNTY3JvbGxlZFVwID0gdGhpcy51c2VyU2Nyb2xsZWRVcDtcclxuICAgIHRoaXMudXNlclNjcm9sbGVkVXAgPSB0aGlzLmlzQ2hhdFNjcm9sbGVkVXAoKTtcclxuXHJcbiAgICB0aGlzLnNjcm9sbFRvQm90dG9tQnV0dG9uPy5jbGFzc0xpc3QudG9nZ2xlKENTU19DTEFTU19WSVNJQkxFLCB0aGlzLnVzZXJTY3JvbGxlZFVwKTtcclxuXHJcbiAgICBpZiAod2FzU2Nyb2xsZWRVcCAmJiAhdGhpcy51c2VyU2Nyb2xsZWRVcCkge1xyXG4gICAgICB0aGlzLm5ld01lc3NhZ2VzSW5kaWNhdG9yRWw/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1ZJU0lCTEUpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHVibGljIGNoZWNrTWVzc2FnZUZvckNvbGxhcHNpbmcobWVzc2FnZUVsT3JHcm91cEVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgY29uc3QgbWVzc2FnZUdyb3VwRWwgPSBtZXNzYWdlRWxPckdyb3VwRWwuY2xhc3NMaXN0LmNvbnRhaW5zKENTU19DTEFTU0VTLk1FU1NBR0VfR1JPVVApXHJcbiAgICAgID8gbWVzc2FnZUVsT3JHcm91cEVsXHJcbiAgICAgIDogbWVzc2FnZUVsT3JHcm91cEVsLmNsb3Nlc3Q8SFRNTEVsZW1lbnQ+KGAuJHtDU1NfQ0xBU1NFUy5NRVNTQUdFX0dST1VQfWApO1xyXG5cclxuICAgIGlmICghbWVzc2FnZUdyb3VwRWwpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNvbnRlbnRDb2xsYXBzaWJsZSA9IG1lc3NhZ2VHcm91cEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KGAuJHtDU1NfQ0xBU1NFUy5DT05URU5UX0NPTExBUFNJQkxFfWApO1xyXG5cclxuICAgIGNvbnN0IG1lc3NhZ2VFbCA9IG1lc3NhZ2VHcm91cEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KGAuJHtDU1NfQ0xBU1NFUy5NRVNTQUdFfWApO1xyXG5cclxuICAgIGlmICghY29udGVudENvbGxhcHNpYmxlIHx8ICFtZXNzYWdlRWwpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IG1heEggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXhNZXNzYWdlSGVpZ2h0O1xyXG5cclxuICAgIGNvbnN0IGlzU3RyZWFtaW5nTm93ID1cclxuICAgICAgdGhpcy5pc1Byb2Nlc3NpbmcgJiZcclxuICAgICAgbWVzc2FnZUdyb3VwRWwuY2xhc3NMaXN0LmNvbnRhaW5zKFwicGxhY2Vob2xkZXJcIikgJiZcclxuICAgICAgbWVzc2FnZUdyb3VwRWwuaGFzQXR0cmlidXRlKFwiZGF0YS1wbGFjZWhvbGRlci10aW1lc3RhbXBcIikgJiZcclxuICAgICAgY29udGVudENvbGxhcHNpYmxlLmNsYXNzTGlzdC5jb250YWlucyhcInN0cmVhbWluZy10ZXh0XCIpO1xyXG5cclxuICAgIGlmIChpc1N0cmVhbWluZ05vdykge1xyXG4gICAgICBjb25zdCBleGlzdGluZ0J1dHRvbiA9IG1lc3NhZ2VFbC5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PihgLiR7Q1NTX0NMQVNTRVMuU0hPV19NT1JFX0JVVFRPTn1gKTtcclxuICAgICAgZXhpc3RpbmdCdXR0b24/LnJlbW92ZSgpO1xyXG4gICAgICBjb250ZW50Q29sbGFwc2libGUuc3R5bGUubWF4SGVpZ2h0ID0gXCJcIjtcclxuICAgICAgY29udGVudENvbGxhcHNpYmxlLmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX0NPTlRFTlRfQ09MTEFQU0VEKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChtYXhIIDw9IDApIHtcclxuICAgICAgY29uc3QgZXhpc3RpbmdCdXR0b24gPSBtZXNzYWdlRWwucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oYC4ke0NTU19DTEFTU0VTLlNIT1dfTU9SRV9CVVRUT059YCk7XHJcbiAgICAgIGV4aXN0aW5nQnV0dG9uPy5yZW1vdmUoKTtcclxuICAgICAgY29udGVudENvbGxhcHNpYmxlLnN0eWxlLm1heEhlaWdodCA9IFwiXCI7XHJcbiAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19DT05URU5UX0NPTExBUFNFRCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICBpZiAoXHJcbiAgICAgICAgIWNvbnRlbnRDb2xsYXBzaWJsZSB8fFxyXG4gICAgICAgICFjb250ZW50Q29sbGFwc2libGUuaXNDb25uZWN0ZWQgfHxcclxuICAgICAgICAhbWVzc2FnZUdyb3VwRWwuaXNDb25uZWN0ZWQgfHxcclxuICAgICAgICAhbWVzc2FnZUVsLmlzQ29ubmVjdGVkXHJcbiAgICAgIClcclxuICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICBsZXQgZXhpc3RpbmdCdXR0b24gPSBtZXNzYWdlRWwucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oYC4ke0NTU19DTEFTU0VTLlNIT1dfTU9SRV9CVVRUT059YCk7XHJcblxyXG4gICAgICBjb25zdCBwcmV2aW91c01heEhlaWdodFN0eWxlID0gY29udGVudENvbGxhcHNpYmxlLnN0eWxlLm1heEhlaWdodDtcclxuICAgICAgY29udGVudENvbGxhcHNpYmxlLnN0eWxlLm1heEhlaWdodCA9IFwiXCI7XHJcbiAgICAgIGNvbnN0IHNjcm9sbEhlaWdodCA9IGNvbnRlbnRDb2xsYXBzaWJsZS5zY3JvbGxIZWlnaHQ7XHJcblxyXG4gICAgICBpZiAoZXhpc3RpbmdCdXR0b24gJiYgcHJldmlvdXNNYXhIZWlnaHRTdHlsZSAmJiAhZXhpc3RpbmdCdXR0b24uY2xhc3NMaXN0LmNvbnRhaW5zKFwiZXhwbGljaXRseS1leHBhbmRlZFwiKSkge1xyXG4gICAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5zdHlsZS5tYXhIZWlnaHQgPSBwcmV2aW91c01heEhlaWdodFN0eWxlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoc2Nyb2xsSGVpZ2h0ID4gbWF4SCkge1xyXG4gICAgICAgIGlmICghZXhpc3RpbmdCdXR0b24pIHtcclxuICAgICAgICAgIGV4aXN0aW5nQnV0dG9uID0gbWVzc2FnZUVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcclxuICAgICAgICAgICAgY2xzOiBDU1NfQ0xBU1NFUy5TSE9XX01PUkVfQlVUVE9OLFxyXG4gICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KGV4aXN0aW5nQnV0dG9uLCBcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgICAgICAgaWYgKGNvbnRlbnRDb2xsYXBzaWJsZS5jbGFzc0xpc3QuY29udGFpbnMoQ1NTX0NMQVNTRVMuQ09OVEVOVF9DT0xMQVBTRUQpKSB7XHJcbiAgICAgICAgICAgICAgZXhpc3RpbmdCdXR0b24hLmNsYXNzTGlzdC5hZGQoXCJleHBsaWNpdGx5LWV4cGFuZGVkXCIpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIGV4aXN0aW5nQnV0dG9uIS5jbGFzc0xpc3QucmVtb3ZlKFwiZXhwbGljaXRseS1leHBhbmRlZFwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnRvZ2dsZU1lc3NhZ2VDb2xsYXBzZShjb250ZW50Q29sbGFwc2libGUsIGV4aXN0aW5nQnV0dG9uISk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5zdHlsZS5tYXhIZWlnaHQgPSBgJHttYXhIfXB4YDtcclxuICAgICAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5jbGFzc0xpc3QuYWRkKENTU19DTEFTU0VTLkNPTlRFTlRfQ09MTEFQU0VEKTtcclxuICAgICAgICAgIGV4aXN0aW5nQnV0dG9uLnNldFRleHQoXCJTaG93IE1vcmUg4pa8XCIpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBpZiAoY29udGVudENvbGxhcHNpYmxlLmNsYXNzTGlzdC5jb250YWlucyhDU1NfQ0xBU1NFUy5DT05URU5UX0NPTExBUFNFRCkpIHtcclxuICAgICAgICAgICAgZXhpc3RpbmdCdXR0b24uc2V0VGV4dChcIlNob3cgTW9yZSDilrxcIik7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBleGlzdGluZ0J1dHRvbi5zZXRUZXh0KFwiU2hvdyBMZXNzIOKWslwiKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaWYgKGV4aXN0aW5nQnV0dG9uKSB7XHJcbiAgICAgICAgICBleGlzdGluZ0J1dHRvbi5yZW1vdmUoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29udGVudENvbGxhcHNpYmxlLnN0eWxlLm1heEhlaWdodCA9IFwiXCI7XHJcbiAgICAgICAgY29udGVudENvbGxhcHNpYmxlLmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTRVMuQ09OVEVOVF9DT0xMQVBTRUQpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBhc3luYyBoYW5kbGVTdW1tYXJpemVDbGljayhvcmlnaW5hbENvbnRlbnQ6IHN0cmluZywgYnV0dG9uRWw6IEhUTUxCdXR0b25FbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBzdW1tYXJpemF0aW9uTW9kZWwgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdW1tYXJpemF0aW9uTW9kZWxOYW1lO1xyXG5cclxuICAgIGlmICghc3VtbWFyaXphdGlvbk1vZGVsKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJQbGVhc2Ugc2VsZWN0IGEgc3VtbWFyaXphdGlvbiBtb2RlbCBpbiBBSSBGb3JnZSBzZXR0aW5ncyAoUHJvZHVjdGl2aXR5IHNlY3Rpb24pLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCB0ZXh0VG9TdW1tYXJpemUgPSBvcmlnaW5hbENvbnRlbnQ7XHJcbiAgICBpZiAoUmVuZGVyZXJVdGlscy5kZXRlY3RUaGlua2luZ1RhZ3MoUmVuZGVyZXJVdGlscy5kZWNvZGVIdG1sRW50aXRpZXMob3JpZ2luYWxDb250ZW50KSkuaGFzVGhpbmtpbmdUYWdzKSB7XHJcbiAgICAgIHRleHRUb1N1bW1hcml6ZSA9IFJlbmRlcmVyVXRpbHMuZGVjb2RlSHRtbEVudGl0aWVzKG9yaWdpbmFsQ29udGVudClcclxuICAgICAgICAucmVwbGFjZSgvPHRoaW5rPltcXHNcXFNdKj88XFwvdGhpbms+L2csIFwiXCIpXHJcbiAgICAgICAgLnRyaW0oKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRleHRUb1N1bW1hcml6ZSB8fCB0ZXh0VG9TdW1tYXJpemUubGVuZ3RoIDwgNTApIHtcclxuICAgICAgbmV3IE5vdGljZShcIk1lc3NhZ2UgaXMgdG9vIHNob3J0IHRvIHN1bW1hcml6ZSBtZWFuaW5nZnVsbHkuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgb3JpZ2luYWxJY29uID0gYnV0dG9uRWwucXVlcnlTZWxlY3RvcihcIi5zdmctaWNvblwiKT8uZ2V0QXR0cmlidXRlKFwiaWNvbi1uYW1lXCIpIHx8IFwic2Nyb2xsLXRleHRcIjtcclxuICAgIHNldEljb24oYnV0dG9uRWwsIFwibG9hZGVyXCIpO1xyXG4gICAgYnV0dG9uRWwuZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgY29uc3Qgb3JpZ2luYWxUaXRsZSA9IGJ1dHRvbkVsLnRpdGxlO1xyXG4gICAgYnV0dG9uRWwudGl0bGUgPSBcIlN1bW1hcml6aW5nLi4uXCI7XHJcbiAgICBidXR0b25FbC5hZGRDbGFzcyhDU1NfQ0xBU1NfRElTQUJMRUQpO1xyXG5cclxuICAgIGJ1dHRvbkVsLmFkZENsYXNzKFwiYnV0dG9uLWxvYWRpbmdcIik7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcHJvbXB0ID0gYFByb3ZpZGUgYSBjb25jaXNlIHN1bW1hcnkgb2YgdGhlIGZvbGxvd2luZyB0ZXh0OlxcblxcblwiXCJcIlxcbiR7dGV4dFRvU3VtbWFyaXplfVxcblwiXCJcIlxcblxcblN1bW1hcnk6YDtcclxuICAgICAgY29uc3QgcmVxdWVzdEJvZHkgPSB7XHJcbiAgICAgICAgbW9kZWw6IHN1bW1hcml6YXRpb25Nb2RlbCxcclxuICAgICAgICBwcm9tcHQ6IHByb21wdCxcclxuICAgICAgICBzdHJlYW06IGZhbHNlLFxyXG4gICAgICAgIHRlbXBlcmF0dXJlOiAwLjIsXHJcbiAgICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgICAgbnVtX2N0eDogdGhpcy5wbHVnaW4uc2V0dGluZ3MuY29udGV4dFdpbmRvdyA+IDIwNDggPyAyMDQ4IDogdGhpcy5wbHVnaW4uc2V0dGluZ3MuY29udGV4dFdpbmRvdyxcclxuICAgICAgICB9LFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3QgcmVzcG9uc2VEYXRhOiBPbGxhbWFHZW5lcmF0ZVJlc3BvbnNlID0gYXdhaXQgdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZS5nZW5lcmF0ZVJhdyhyZXF1ZXN0Qm9keSk7XHJcblxyXG4gICAgICBpZiAocmVzcG9uc2VEYXRhICYmIHJlc3BvbnNlRGF0YS5yZXNwb25zZSkge1xyXG4gICAgICAgIG5ldyBTdW1tYXJ5TW9kYWwodGhpcy5wbHVnaW4sIFwiTWVzc2FnZSBTdW1tYXJ5XCIsIHJlc3BvbnNlRGF0YS5yZXNwb25zZS50cmltKCkpLm9wZW4oKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJSZWNlaXZlZCBlbXB0eSByZXNwb25zZSBmcm9tIHN1bW1hcml6YXRpb24gbW9kZWwuXCIpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgIGxldCB1c2VyTWVzc2FnZSA9IFwiU3VtbWFyaXphdGlvbiBmYWlsZWQ6IFwiO1xyXG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvcikge1xyXG4gICAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKFwiNDA0XCIpIHx8IGVycm9yLm1lc3NhZ2UudG9Mb2NhbGVMb3dlckNhc2UoKS5pbmNsdWRlcyhcIm1vZGVsIG5vdCBmb3VuZFwiKSkge1xyXG4gICAgICAgICAgdXNlck1lc3NhZ2UgKz0gYE1vZGVsICcke3N1bW1hcml6YXRpb25Nb2RlbH0nIG5vdCBmb3VuZC5gO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhcImNvbm5lY3RcIikgfHwgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhcImZldGNoXCIpKSB7XHJcbiAgICAgICAgICB1c2VyTWVzc2FnZSArPSBcIkNvdWxkIG5vdCBjb25uZWN0IHRvIE9sbGFtYSBzZXJ2ZXIuXCI7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHVzZXJNZXNzYWdlICs9IGVycm9yLm1lc3NhZ2U7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHVzZXJNZXNzYWdlICs9IFwiVW5rbm93biBlcnJvciBvY2N1cnJlZC5cIjtcclxuICAgICAgfVxyXG4gICAgICBuZXcgTm90aWNlKHVzZXJNZXNzYWdlLCA2MDAwKTtcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIHNldEljb24oYnV0dG9uRWwsIG9yaWdpbmFsSWNvbik7XHJcbiAgICAgIGJ1dHRvbkVsLmRpc2FibGVkID0gZmFsc2U7XHJcbiAgICAgIGJ1dHRvbkVsLnRpdGxlID0gb3JpZ2luYWxUaXRsZTtcclxuICAgICAgYnV0dG9uRWwucmVtb3ZlQ2xhc3MoQ1NTX0NMQVNTX0RJU0FCTEVEKTtcclxuICAgICAgYnV0dG9uRWwucmVtb3ZlQ2xhc3MoXCJidXR0b24tbG9hZGluZ1wiKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqINCh0YLQstC+0YDRjtGUINC90L7QstGDINCz0YDRg9C/0YMg0LTQu9GPINCy0ZbQtNC+0LHRgNCw0LbQtdC90L3RjyDQv9C+0LzQuNC70L7QuiDQsNCx0L4g0L7QvdC+0LLQu9GO0ZQg0ZbRgdC90YPRjtGH0YMuXHJcbiAgICog0KLQtdC/0LXRgCDQstC40LrQvtGA0LjRgdGC0L7QstGD0ZQgRXJyb3JNZXNzYWdlUmVuZGVyZXIg0LTQu9GPINGB0YLQstC+0YDQtdC90L3RjyDQstGW0LfRg9Cw0LvRjNC90L7Qs9C+INCx0LvQvtC60YMuXHJcbiAgICogQHBhcmFtIGlzQ29udGludWluZyDQp9C4INGG0LUg0L/RgNC+0LTQvtCy0LbQtdC90L3RjyDQv9C+0L/QtdGA0LXQtNC90YzQvtGXINC/0L7RgdC70ZbQtNC+0LLQvdC+0YHRgtGWINC/0L7QvNC40LvQvtC6LlxyXG4gICAqL1xyXG4gIHByaXZhdGUgcmVuZGVyT3JVcGRhdGVFcnJvckdyb3VwKGlzQ29udGludWluZzogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLmNoYXRDb250YWluZXIpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCBlcnJvcnNUb0Rpc3BsYXkgPSBbLi4udGhpcy5jb25zZWN1dGl2ZUVycm9yTWVzc2FnZXNdO1xyXG4gICAgaWYgKGVycm9yc1RvRGlzcGxheS5sZW5ndGggPT09IDApIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY29uc3QgZXJyb3JDb3VudCA9IGVycm9yc1RvRGlzcGxheS5sZW5ndGg7XHJcbiAgICBjb25zdCBsYXN0RXJyb3IgPSBlcnJvcnNUb0Rpc3BsYXlbZXJyb3JDb3VudCAtIDFdO1xyXG5cclxuICAgIGxldCBncm91cEVsOiBIVE1MRWxlbWVudDtcclxuICAgIGxldCBjb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgIGlmIChpc0NvbnRpbnVpbmcgJiYgdGhpcy5lcnJvckdyb3VwRWxlbWVudCkge1xyXG4gICAgICBncm91cEVsID0gdGhpcy5lcnJvckdyb3VwRWxlbWVudDtcclxuXHJcbiAgICAgIGNvbnRlbnRDb250YWluZXIgPSBncm91cEVsLnF1ZXJ5U2VsZWN0b3IoYC4ke0NTU19DTEFTU19FUlJPUl9URVhUfWApO1xyXG4gICAgICBpZiAoY29udGVudENvbnRhaW5lcikge1xyXG4gICAgICAgIGNvbnRlbnRDb250YWluZXIuZW1wdHkoKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy51cGRhdGVFcnJvckdyb3VwVGltZXN0YW1wKGdyb3VwRWwsIGxhc3RFcnJvci50aW1lc3RhbXApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5oaWRlRW1wdHlTdGF0ZSgpO1xyXG4gICAgICB0aGlzLmlzU3VtbWFyaXppbmdFcnJvcnMgPSBmYWxzZTtcclxuXHJcbiAgICAgIGNvbnN0IHJlbmRlcmVyID0gbmV3IEVycm9yTWVzc2FnZVJlbmRlcmVyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgbGFzdEVycm9yLCB0aGlzKTtcclxuICAgICAgZ3JvdXBFbCA9IHJlbmRlcmVyLnJlbmRlcigpO1xyXG4gICAgICBjb250ZW50Q29udGFpbmVyID0gZ3JvdXBFbC5xdWVyeVNlbGVjdG9yKGAuJHtDU1NfQ0xBU1NfRVJST1JfVEVYVH1gKTtcclxuXHJcbiAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5hcHBlbmRDaGlsZChncm91cEVsKTtcclxuICAgICAgdGhpcy5lcnJvckdyb3VwRWxlbWVudCA9IGdyb3VwRWw7XHJcbiAgICAgIHRoaXMubGFzdE1lc3NhZ2VFbGVtZW50ID0gZ3JvdXBFbDtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoY29udGVudENvbnRhaW5lcikge1xyXG4gICAgICBpZiAoZXJyb3JDb3VudCA9PT0gMSkge1xyXG4gICAgICAgIGNvbnRlbnRDb250YWluZXIuc2V0VGV4dChsYXN0RXJyb3IuY29udGVudCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29udGVudENvbnRhaW5lci5zZXRUZXh0KGBNdWx0aXBsZSBlcnJvcnMgb2NjdXJyZWQgKCR7ZXJyb3JDb3VudH0pLiBTdW1tYXJpemluZy4uLmApO1xyXG4gICAgICAgIGlmICghdGhpcy5pc1N1bW1hcml6aW5nRXJyb3JzKSB7XHJcbiAgICAgICAgICB0aGlzLnRyaWdnZXJFcnJvclN1bW1hcml6YXRpb24oZ3JvdXBFbCwgZXJyb3JzVG9EaXNwbGF5KTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oNTAsIHRydWUpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSB1cGRhdGVFcnJvckdyb3VwVGltZXN0YW1wKGdyb3VwRWw6IEhUTUxFbGVtZW50LCB0aW1lc3RhbXA6IERhdGUpOiB2b2lkIHtcclxuICAgIGdyb3VwRWwuc2V0QXR0cmlidXRlKFwiZGF0YS10aW1lc3RhbXBcIiwgdGltZXN0YW1wLmdldFRpbWUoKS50b1N0cmluZygpKTtcclxuICAgIGNvbnN0IHRpbWVzdGFtcEVsID0gZ3JvdXBFbC5xdWVyeVNlbGVjdG9yKGAuJHtDU1NfQ0xBU1NFUy5USU1FU1RBTVB9YCk7XHJcbiAgICBpZiAodGltZXN0YW1wRWwpIHtcclxuICAgICAgdGltZXN0YW1wRWwuc2V0VGV4dCh0aGlzLmZvcm1hdFRpbWUodGltZXN0YW1wKSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHRyaWdnZXJFcnJvclN1bW1hcml6YXRpb24odGFyZ2V0R3JvdXBFbGVtZW50OiBIVE1MRWxlbWVudCwgZXJyb3JzOiBNZXNzYWdlW10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IEVOQUJMRV9FUlJPUl9TVU1NQVJJWkFUSU9OID0gZmFsc2U7XHJcblxyXG4gICAgaWYgKCFFTkFCTEVfRVJST1JfU1VNTUFSSVpBVElPTikge1xyXG4gICAgICB0aGlzLmRpc3BsYXlFcnJvckxpc3RGYWxsYmFjayh0YXJnZXRHcm91cEVsZW1lbnQsIGVycm9ycyk7XHJcblxyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCF0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdW1tYXJpemF0aW9uTW9kZWxOYW1lIHx8IHRoaXMuaXNTdW1tYXJpemluZ0Vycm9ycykge1xyXG4gICAgICBpZiAoIXRoaXMucGx1Z2luLnNldHRpbmdzLnN1bW1hcml6YXRpb25Nb2RlbE5hbWUpXHJcbiAgICAgICAgaWYgKHRoaXMuaXNTdW1tYXJpemluZ0Vycm9ycykgdGhpcy5kaXNwbGF5RXJyb3JMaXN0RmFsbGJhY2sodGFyZ2V0R3JvdXBFbGVtZW50LCBlcnJvcnMpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5pc1N1bW1hcml6aW5nRXJyb3JzID0gdHJ1ZTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBzdW1tYXJ5ID0gYXdhaXQgdGhpcy5zdW1tYXJpemVFcnJvcnMoZXJyb3JzKTtcclxuICAgICAgY29uc3QgY29udGVudENvbnRhaW5lciA9IHRhcmdldEdyb3VwRWxlbWVudC5xdWVyeVNlbGVjdG9yKGAuJHtDU1NfQ0xBU1NFUy5FUlJPUl9URVhUfWApIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgaWYgKCFjb250ZW50Q29udGFpbmVyIHx8ICFjb250ZW50Q29udGFpbmVyLmlzQ29ubmVjdGVkKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb250ZW50Q29udGFpbmVyLmVtcHR5KCk7XHJcblxyXG4gICAgICBpZiAoc3VtbWFyeSkge1xyXG4gICAgICAgIGNvbnRlbnRDb250YWluZXIuc2V0VGV4dChgTXVsdGlwbGUgZXJyb3JzIG9jY3VycmVkLiBTdW1tYXJ5OlxcbiR7c3VtbWFyeX1gKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLmRpc3BsYXlFcnJvckxpc3RGYWxsYmFjayh0YXJnZXRHcm91cEVsZW1lbnQsIGVycm9ycyk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMuZGlzcGxheUVycm9yTGlzdEZhbGxiYWNrKHRhcmdldEdyb3VwRWxlbWVudCwgZXJyb3JzKTtcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIHRoaXMuaXNTdW1tYXJpemluZ0Vycm9ycyA9IGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBkaXNwbGF5RXJyb3JMaXN0RmFsbGJhY2sodGFyZ2V0R3JvdXBFbGVtZW50OiBIVE1MRWxlbWVudCwgZXJyb3JzOiBNZXNzYWdlW10pOiB2b2lkIHtcclxuICAgIGNvbnN0IGNvbnRlbnRDb250YWluZXIgPSB0YXJnZXRHcm91cEVsZW1lbnQucXVlcnlTZWxlY3RvcihgLiR7Q1NTX0NMQVNTRVMuRVJST1JfVEVYVH1gKSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBpZiAoIWNvbnRlbnRDb250YWluZXIgfHwgIWNvbnRlbnRDb250YWluZXIuaXNDb25uZWN0ZWQpIHtcclxuICAgICAgaWYgKCF0YXJnZXRHcm91cEVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29udGVudENvbnRhaW5lci5lbXB0eSgpO1xyXG4gICAgY29uc3QgdW5pcXVlRXJyb3JzID0gQXJyYXkuZnJvbShuZXcgU2V0KGVycm9ycy5tYXAoZSA9PiBlLmNvbnRlbnQudHJpbSgpKSkpO1xyXG4gICAgY29udGVudENvbnRhaW5lci5jcmVhdGVEaXYoe1xyXG4gICAgICB0ZXh0OiBgTXVsdGlwbGUgZXJyb3JzIG9jY3VycmVkICgke2Vycm9ycy5sZW5ndGh9IHRvdGFsLCAke3VuaXF1ZUVycm9ycy5sZW5ndGh9IHVuaXF1ZSk6YCxcclxuICAgICAgY2xzOiBcImVycm9yLXN1bW1hcnktaGVhZGVyXCIsXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBsaXN0RWwgPSBjb250ZW50Q29udGFpbmVyLmNyZWF0ZUVsKFwidWxcIik7XHJcbiAgICBsaXN0RWwuc3R5bGUubWFyZ2luVG9wID0gXCI1cHhcIjtcclxuICAgIGxpc3RFbC5zdHlsZS5wYWRkaW5nTGVmdCA9IFwiMjBweFwiO1xyXG4gICAgbGlzdEVsLnN0eWxlLmxpc3RTdHlsZSA9IFwiZGlzY1wiO1xyXG5cclxuICAgIHVuaXF1ZUVycm9ycy5mb3JFYWNoKGVycm9yTXNnID0+IHtcclxuICAgICAgY29uc3QgbGlzdEl0ZW0gPSBsaXN0RWwuY3JlYXRlRWwoXCJsaVwiKTtcclxuICAgICAgbGlzdEl0ZW0udGV4dENvbnRlbnQgPSBlcnJvck1zZztcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKDUwLCB0cnVlKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqINCS0LjQutC+0L3Rg9GUINGB0YPQvNCw0YDQuNC30LDRhtGW0Y4g0YHQv9C40YHQutGDINC/0L7QstGW0LTQvtC80LvQtdC90Ywg0L/RgNC+INC/0L7QvNC40LvQutC4INC30LAg0LTQvtC/0L7QvNC+0LPQvtGOIE9sbGFtYS5cclxuICAgKiBAcGFyYW0gZXJyb3JzINCc0LDRgdC40LIg0L/QvtCy0ZbQtNC+0LzQu9C10L3RjCDQv9GA0L4g0L/QvtC80LjQu9C60LguXHJcbiAgICogQHJldHVybnMg0KDRj9C00L7QuiDQtyDRgdGD0LzQsNGA0LjQt9Cw0YbRltGU0Y4g0LDQsdC+IG51bGwg0YMg0YDQsNC30ZYg0L/QvtC80LjQu9C60LguXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBzdW1tYXJpemVFcnJvcnMoZXJyb3JzOiBNZXNzYWdlW10pOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcclxuICAgIGNvbnN0IG1vZGVsTmFtZSA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnN1bW1hcml6YXRpb25Nb2RlbE5hbWU7XHJcbiAgICBpZiAoIW1vZGVsTmFtZSkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgaWYgKGVycm9ycy5sZW5ndGggPCAyKSByZXR1cm4gZXJyb3JzWzBdPy5jb250ZW50IHx8IG51bGw7XHJcblxyXG4gICAgY29uc3QgdW5pcXVlRXJyb3JDb250ZW50cyA9IEFycmF5LmZyb20obmV3IFNldChlcnJvcnMubWFwKGUgPT4gZS5jb250ZW50LnRyaW0oKSkpKTtcclxuICAgIGNvbnN0IGVycm9yc1RleHQgPSB1bmlxdWVFcnJvckNvbnRlbnRzLm1hcCgobXNnLCBpbmRleCkgPT4gYEVycm9yICR7aW5kZXggKyAxfTogJHttc2d9YCkuam9pbihcIlxcblwiKTtcclxuICAgIGNvbnN0IHByb21wdCA9IGBDb25jaXNlbHkgc3VtbWFyaXplIHRoZSBmb2xsb3dpbmcgJHt1bmlxdWVFcnJvckNvbnRlbnRzLmxlbmd0aH0gdW5pcXVlIGVycm9yIG1lc3NhZ2VzIHJlcG9ydGVkIGJ5IHRoZSBzeXN0ZW0uIEZvY3VzIG9uIHRoZSBjb3JlIGlzc3VlKHMpOlxcblxcbiR7ZXJyb3JzVGV4dH1cXG5cXG5TdW1tYXJ5OmA7XHJcblxyXG4gICAgY29uc3QgcmVxdWVzdEJvZHkgPSB7XHJcbiAgICAgIG1vZGVsOiBtb2RlbE5hbWUsXHJcbiAgICAgIHByb21wdDogcHJvbXB0LFxyXG4gICAgICBzdHJlYW06IGZhbHNlLFxyXG4gICAgICB0ZW1wZXJhdHVyZTogMC4yLFxyXG4gICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgbnVtX2N0eDogdGhpcy5wbHVnaW4uc2V0dGluZ3MuY29udGV4dFdpbmRvdyA+IDEwMjQgPyAxMDI0IDogdGhpcy5wbHVnaW4uc2V0dGluZ3MuY29udGV4dFdpbmRvdyxcclxuICAgICAgfSxcclxuICAgICAgc3lzdGVtOiBcIllvdSBhcmUgYW4gYXNzaXN0YW50IHRoYXQgc3VtbWFyaXplcyBsaXN0cyBvZiB0ZWNobmljYWwgZXJyb3IgbWVzc2FnZXMgYWNjdXJhdGVseSBhbmQgY29uY2lzZWx5LlwiLFxyXG4gICAgfTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXNwb25zZURhdGE6IE9sbGFtYUdlbmVyYXRlUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdlbmVyYXRlUmF3KHJlcXVlc3RCb2R5KTtcclxuICAgICAgaWYgKHJlc3BvbnNlRGF0YSAmJiByZXNwb25zZURhdGEucmVzcG9uc2UpIHtcclxuICAgICAgICByZXR1cm4gcmVzcG9uc2VEYXRhLnJlc3BvbnNlLnRyaW0oKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZUVycm9yTWVzc2FnZShlcnJvck1lc3NhZ2U6IE1lc3NhZ2UpOiB2b2lkIHtcclxuICAgIGlmIChlcnJvck1lc3NhZ2Uucm9sZSAhPT0gXCJlcnJvclwiKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIHRoaXMuY29uc2VjdXRpdmVFcnJvck1lc3NhZ2VzLnB1c2goZXJyb3JNZXNzYWdlKTtcclxuICAgIGNvbnN0IGlzQ29udGludWluZ0Vycm9yID0gdGhpcy5sYXN0TWVzc2FnZUVsZW1lbnQgPT09IHRoaXMuZXJyb3JHcm91cEVsZW1lbnQgJiYgdGhpcy5lcnJvckdyb3VwRWxlbWVudCAhPT0gbnVsbDtcclxuICAgIGlmICghaXNDb250aW51aW5nRXJyb3IpIHtcclxuICAgICAgdGhpcy5lcnJvckdyb3VwRWxlbWVudCA9IG51bGw7XHJcbiAgICAgIHRoaXMuY29uc2VjdXRpdmVFcnJvck1lc3NhZ2VzID0gW2Vycm9yTWVzc2FnZV07XHJcbiAgICB9XHJcbiAgICB0cnkge1xyXG4gICAgICB0aGlzLnJlbmRlck9yVXBkYXRlRXJyb3JHcm91cChpc0NvbnRpbnVpbmdFcnJvcik7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0cnkge1xyXG4gICAgICB9IGNhdGNoIHt9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyBzZW5kTWVzc2FnZSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IHVzZXJJbnB1dFRleHQgPSB0aGlzLmlucHV0RWwudmFsdWUudHJpbSgpO1xyXG4gICAgY29uc3QgcmVxdWVzdFRpbWVzdGFtcElkID0gRGF0ZS5ub3coKTtcclxuXHJcbiAgICBpZiAoIXVzZXJJbnB1dFRleHQgfHwgdGhpcy5pc1Byb2Nlc3NpbmcgfHwgdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyKSB7XHJcbiAgICAgIGlmICh0aGlzLmlzUHJvY2Vzc2luZyB8fCB0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIpXHJcbiAgICAgICAgbmV3IE5vdGljZShcIlBsZWFzZSB3YWl0IG9yIGNhbmNlbCBjdXJyZW50IG9wZXJhdGlvbi5cIiwgMzAwMCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXQoKTtcclxuICAgIGlmICghYWN0aXZlQ2hhdCkge1xyXG4gICAgICBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY3JlYXRlTmV3Q2hhdCgpO1xyXG4gICAgICBpZiAoIWFjdGl2ZUNoYXQpIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3I6IE5vIGFjdGl2ZSBjaGF0IGFuZCBjb3VsZCBub3QgY3JlYXRlIG9uZS5cIik7XHJcbiAgICAgICAgdGhpcy5zZXRMb2FkaW5nU3RhdGUoZmFsc2UpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBuZXcgTm90aWNlKGBTdGFydGVkIG5ldyBjaGF0OiAke2FjdGl2ZUNoYXQubWV0YWRhdGEubmFtZX1gKTtcclxuICAgIH1cclxuICAgIGNvbnN0IHVzZXJNZXNzYWdlVGltZXN0YW1wID0gbmV3IERhdGUoKTtcclxuXHJcbiAgICB0aGlzLmNsZWFySW5wdXRGaWVsZCgpO1xyXG4gICAgdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xyXG4gICAgdGhpcy5zZXRMb2FkaW5nU3RhdGUodHJ1ZSk7XHJcbiAgICB0aGlzLmhpZGVFbXB0eVN0YXRlKCk7XHJcblxyXG4gICAgY29uc3QgbGxtUmVzcG9uc2VTdGFydFRpbWVNcyA9IERhdGUubm93KCk7XHJcblxyXG4gICAgbGV0IGNvbnRpbnVlQ29udmVyc2F0aW9uID0gdHJ1ZTtcclxuICAgIGNvbnN0IG1heFR1cm5zID0gNTtcclxuICAgIGxldCB0dXJucyA9IDA7XHJcbiAgICBsZXQgY3VycmVudFR1cm5MbG1SZXNwb25zZVRzRm9yQ2F0Y2g6IG51bWJlciB8IG51bGwgPSBsbG1SZXNwb25zZVN0YXJ0VGltZU1zO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHVzZXJNZXNzYWdlQWRkZWQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5hZGRVc2VyTWVzc2FnZUFuZEF3YWl0UmVuZGVyKFxyXG4gICAgICAgIHVzZXJJbnB1dFRleHQsXHJcbiAgICAgICAgdXNlck1lc3NhZ2VUaW1lc3RhbXAsXHJcbiAgICAgICAgcmVxdWVzdFRpbWVzdGFtcElkXHJcbiAgICAgICk7XHJcbiAgICAgIGlmICghdXNlck1lc3NhZ2VBZGRlZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVzZXIgbWVzc2FnZSBwcm9jZXNzaW5nIGZhaWxlZCBpbiBDaGF0TWFuYWdlci5cIik7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxldCBjaGF0U3RhdGVGb3JMbG0gPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRBY3RpdmVDaGF0T3JGYWlsKCk7XHJcblxyXG4gICAgICB3aGlsZSAoY29udGludWVDb252ZXJzYXRpb24gJiYgdHVybnMgPCBtYXhUdXJucyAmJiAhdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkKSB7XHJcbiAgICAgICAgdHVybnMrKztcclxuICAgICAgICBjb25zdCBjdXJyZW50VHVybkxsbVJlc3BvbnNlVHMgPSB0dXJucyA9PT0gMSA/IGxsbVJlc3BvbnNlU3RhcnRUaW1lTXMgOiBEYXRlLm5vdygpO1xyXG4gICAgICAgIGN1cnJlbnRUdXJuTGxtUmVzcG9uc2VUc0ZvckNhdGNoID0gY3VycmVudFR1cm5MbG1SZXNwb25zZVRzO1xyXG5cclxuICAgICAgICB0aGlzLl9tYW5hZ2VQbGFjZWhvbGRlcihjdXJyZW50VHVybkxsbVJlc3BvbnNlVHMsIHJlcXVlc3RUaW1lc3RhbXBJZCk7XHJcblxyXG4gICAgICAgIGNoYXRTdGF0ZUZvckxsbSA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXRPckZhaWwoKTtcclxuXHJcbiAgICAgICAgY29uc3QgbGxtU3RyZWFtID0gdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZS5nZW5lcmF0ZUNoYXRSZXNwb25zZVN0cmVhbShcclxuICAgICAgICAgIGNoYXRTdGF0ZUZvckxsbSxcclxuICAgICAgICAgIHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlci5zaWduYWxcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCB7IGFjY3VtdWxhdGVkQ29udGVudCwgbmF0aXZlVG9vbENhbGxzLCBhc3Npc3RhbnRNZXNzYWdlV2l0aE5hdGl2ZUNhbGxzIH0gPSBhd2FpdCB0aGlzLl9wcm9jZXNzTGxtU3RyZWFtKFxyXG4gICAgICAgICAgbGxtU3RyZWFtLFxyXG4gICAgICAgICAgY3VycmVudFR1cm5MbG1SZXNwb25zZVRzLFxyXG4gICAgICAgICAgcmVxdWVzdFRpbWVzdGFtcElkXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlci5zaWduYWwuYWJvcnRlZCkgdGhyb3cgbmV3IEVycm9yKFwiYWJvcnRlZCBieSB1c2VyXCIpO1xyXG5cclxuICAgICAgICBjb25zdCB0b29sQ2FsbENoZWNrUmVzdWx0ID0gdGhpcy5fZGV0ZXJtaW5lVG9vbENhbGxzKFxyXG4gICAgICAgICAgbmF0aXZlVG9vbENhbGxzLFxyXG4gICAgICAgICAgYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxscyxcclxuICAgICAgICAgIGFjY3VtdWxhdGVkQ29udGVudCxcclxuICAgICAgICAgIGN1cnJlbnRUdXJuTGxtUmVzcG9uc2VUcyxcclxuICAgICAgICAgIHJlcXVlc3RUaW1lc3RhbXBJZFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGlmIChcclxuICAgICAgICAgIHRvb2xDYWxsQ2hlY2tSZXN1bHQucHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm4gJiZcclxuICAgICAgICAgIHRvb2xDYWxsQ2hlY2tSZXN1bHQucHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm4ubGVuZ3RoID4gMFxyXG4gICAgICAgICkge1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5fZXhlY3V0ZUFuZFJlbmRlclRvb2xDeWNsZShcclxuICAgICAgICAgICAgdG9vbENhbGxDaGVja1Jlc3VsdC5wcm9jZXNzZWRUb29sQ2FsbHNUaGlzVHVybixcclxuICAgICAgICAgICAgdG9vbENhbGxDaGVja1Jlc3VsdC5hc3Npc3RhbnRNZXNzYWdlRm9ySGlzdG9yeSxcclxuICAgICAgICAgICAgcmVxdWVzdFRpbWVzdGFtcElkXHJcbiAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgIGNoYXRTdGF0ZUZvckxsbSA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXRPckZhaWwoKTtcclxuICAgICAgICAgIGNvbnRpbnVlQ29udmVyc2F0aW9uID0gdHJ1ZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5fcmVuZGVyRmluYWxBc3Npc3RhbnRUZXh0KGFjY3VtdWxhdGVkQ29udGVudCwgY3VycmVudFR1cm5MbG1SZXNwb25zZVRzLCByZXF1ZXN0VGltZXN0YW1wSWQpO1xyXG4gICAgICAgICAgY29udGludWVDb252ZXJzYXRpb24gPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmICh0dXJucyA+PSBtYXhUdXJucykge1xyXG4gICAgICAgIGNvbnN0IG1heFR1cm5zTXNnVGltZXN0YW1wID0gbmV3IERhdGUoKTtcclxuICAgICAgICBjb25zdCBtYXhUdXJuc01zZzogTWVzc2FnZSA9IHtcclxuICAgICAgICAgIHJvbGU6IFwic3lzdGVtXCIsXHJcbiAgICAgICAgICBjb250ZW50OlxyXG4gICAgICAgICAgICBcIk1heCBwcm9jZXNzaW5nIHR1cm5zIHJlYWNoZWQuIElmIHRoZSB0YXNrIGlzIG5vdCBjb21wbGV0ZSwgcGxlYXNlIHRyeSByZXBocmFzaW5nIG9yIGJyZWFraW5nIGl0IGRvd24uXCIsXHJcbiAgICAgICAgICB0aW1lc3RhbXA6IG1heFR1cm5zTXNnVGltZXN0YW1wLFxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IGhtYVByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZWdpc3RlckhNQVJlc29sdmVyKG1heFR1cm5zTXNnLnRpbWVzdGFtcC5nZXRUaW1lKCksIHJlc29sdmUsIHJlamVjdCk7XHJcbiAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgaWYgKHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5oYXMobWF4VHVybnNNc2cudGltZXN0YW1wLmdldFRpbWUoKSkpIHtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKFxyXG4gICAgICAgICAgICAgICAgbWF4VHVybnNNc2cudGltZXN0YW1wLmdldFRpbWUoKSxcclxuICAgICAgICAgICAgICAgIFwiSE1BIHRpbWVvdXQgZm9yIG1heCB0dXJucyBtc2dcIlxyXG4gICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0sIDEwMDAwKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0UGF5bG9hZChtYXhUdXJuc01zZywgdHJ1ZSk7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGF3YWl0IGhtYVByb21pc2U7XHJcbiAgICAgICAgfSBjYXRjaCAoZV9obWEpIHt9XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgaWYgKFxyXG4gICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgJiZcclxuICAgICAgICAodGhpcy5hY3RpdmVQbGFjZWhvbGRlci50aW1lc3RhbXAgPT09IGxsbVJlc3BvbnNlU3RhcnRUaW1lTXMgfHxcclxuICAgICAgICAgIChjdXJyZW50VHVybkxsbVJlc3BvbnNlVHNGb3JDYXRjaCAhPT0gbnVsbCAmJlxyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLnRpbWVzdGFtcCA9PT0gY3VycmVudFR1cm5MbG1SZXNwb25zZVRzRm9yQ2F0Y2gpKSAmJlxyXG4gICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5jbGFzc0xpc3QuY29udGFpbnMoXCJwbGFjZWhvbGRlclwiKVxyXG4gICAgICApIHtcclxuICAgICAgICBpZiAodGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLmlzQ29ubmVjdGVkKSB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmdyb3VwRWwucmVtb3ZlKCk7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlciA9IG51bGw7XHJcblxyXG4gICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKFxyXG4gICAgICAgIHVzZXJNZXNzYWdlVGltZXN0YW1wLmdldFRpbWUoKSxcclxuICAgICAgICBgT3V0ZXIgY2F0Y2ggaW4gc2VuZE1lc3NhZ2UgZm9yIHJlcXVlc3QgJHtyZXF1ZXN0VGltZXN0YW1wSWR9YFxyXG4gICAgICApO1xyXG4gICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKFxyXG4gICAgICAgIGxsbVJlc3BvbnNlU3RhcnRUaW1lTXMsXHJcbiAgICAgICAgYE91dGVyIGNhdGNoIGluIHNlbmRNZXNzYWdlIGZvciByZXF1ZXN0ICR7cmVxdWVzdFRpbWVzdGFtcElkfWBcclxuICAgICAgKTtcclxuICAgICAgaWYgKGN1cnJlbnRUdXJuTGxtUmVzcG9uc2VUc0ZvckNhdGNoICE9PSBudWxsKSB7XHJcbiAgICAgICAgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIucmVqZWN0QW5kQ2xlYXJITUFSZXNvbHZlcihcclxuICAgICAgICAgIGN1cnJlbnRUdXJuTGxtUmVzcG9uc2VUc0ZvckNhdGNoLFxyXG4gICAgICAgICAgYE91dGVyIGNhdGNoIGluIHNlbmRNZXNzYWdlIGZvciByZXF1ZXN0ICR7cmVxdWVzdFRpbWVzdGFtcElkfWBcclxuICAgICAgICApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBsZXQgZXJyb3JNc2dGb3JDaGF0OiBzdHJpbmc7XHJcbiAgICAgIGxldCBlcnJvck1zZ1JvbGU6IE1lc3NhZ2VSb2xlID0gXCJlcnJvclwiO1xyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gXCJBYm9ydEVycm9yXCIgfHwgZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoXCJhYm9ydGVkIGJ5IHVzZXJcIikpIHtcclxuICAgICAgICBlcnJvck1zZ0ZvckNoYXQgPSBcIk1lc3NhZ2UgZ2VuZXJhdGlvbiBzdG9wcGVkLlwiO1xyXG4gICAgICAgIGVycm9yTXNnUm9sZSA9IFwic3lzdGVtXCI7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZXJyb3JNc2dGb3JDaGF0ID0gYEVycm9yOiAke2Vycm9yLm1lc3NhZ2UgfHwgXCJVbmtub3duIGVycm9yIGR1cmluZyBwcm9jZXNzaW5nLlwifWA7XHJcbiAgICAgICAgbmV3IE5vdGljZShlcnJvck1zZ0ZvckNoYXQsIDcwMDApO1xyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IGVycm9yRGlzcGxheVRpbWVzdGFtcCA9IG5ldyBEYXRlKCk7XHJcbiAgICAgIGNvbnN0IGVycm9yRGlzcGxheU1zZzogTWVzc2FnZSA9IHtcclxuICAgICAgICByb2xlOiBlcnJvck1zZ1JvbGUsXHJcbiAgICAgICAgY29udGVudDogZXJyb3JNc2dGb3JDaGF0LFxyXG4gICAgICAgIHRpbWVzdGFtcDogZXJyb3JEaXNwbGF5VGltZXN0YW1wLFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3QgaG1hRXJyb3JQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnJlZ2lzdGVySE1BUmVzb2x2ZXIoZXJyb3JEaXNwbGF5TXNnLnRpbWVzdGFtcC5nZXRUaW1lKCksIHJlc29sdmUsIHJlamVjdCk7XHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICBpZiAodGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmhhcyhlcnJvckRpc3BsYXlNc2cudGltZXN0YW1wLmdldFRpbWUoKSkpIHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIucmVqZWN0QW5kQ2xlYXJITUFSZXNvbHZlcihcclxuICAgICAgICAgICAgICBlcnJvckRpc3BsYXlNc2cudGltZXN0YW1wLmdldFRpbWUoKSxcclxuICAgICAgICAgICAgICBcIkhNQSB0aW1lb3V0IGZvciBlcnJvciBkaXNwbGF5IG1zZ1wiXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSwgMTAwMDApO1xyXG4gICAgICB9KTtcclxuICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdFBheWxvYWQoZXJyb3JEaXNwbGF5TXNnLCB0cnVlKTtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBhd2FpdCBobWFFcnJvclByb21pc2U7XHJcbiAgICAgIH0gY2F0Y2ggKGVfaG1hKSB7fVxyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgJiYgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLmNsYXNzTGlzdC5jb250YWlucyhcInBsYWNlaG9sZGVyXCIpKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5pc0Nvbm5lY3RlZCkgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLnJlbW92ZSgpO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgPSBudWxsO1xyXG5cclxuICAgICAgdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyID0gbnVsbDtcclxuXHJcbiAgICAgIHRoaXMuc2V0TG9hZGluZ1N0YXRlKGZhbHNlKTtcclxuICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCkpO1xyXG4gICAgICB0aGlzLmZvY3VzSW5wdXQoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlTWVudUJ1dHRvbkNsaWNrID0gKGU6IE1vdXNlRXZlbnQpOiB2b2lkID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8udG9nZ2xlTWVudShlKTtcclxuICB9O1xyXG5cclxuICBwcml2YXRlIG9uRHJhZ1N0YXJ0ID0gKGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCA9PiB7XHJcbiAgICBpZiAoZXZlbnQuYnV0dG9uICE9PSAwKSByZXR1cm47XHJcblxyXG4gICAgdGhpcy5pc1Jlc2l6aW5nID0gdHJ1ZTtcclxuICAgIHRoaXMuaW5pdGlhbE1vdXNlWCA9IGV2ZW50LmNsaWVudFg7XHJcblxyXG4gICAgdGhpcy5pbml0aWFsU2lkZWJhcldpZHRoID0gdGhpcy5zaWRlYmFyUm9vdEVsPy5vZmZzZXRXaWR0aCB8fCAyNTA7XHJcblxyXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG5cclxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgdGhpcy5ib3VuZE9uRHJhZ01vdmUsIHsgY2FwdHVyZTogdHJ1ZSB9KTtcclxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIHRoaXMuYm91bmRPbkRyYWdFbmQsIHsgY2FwdHVyZTogdHJ1ZSB9KTtcclxuXHJcbiAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmN1cnNvciA9IFwiZXctcmVzaXplXCI7XHJcbiAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5hZGQoQ1NTX0NMQVNTX1JFU0laSU5HKTtcclxuICB9O1xyXG5cclxuICBwcml2YXRlIG9uRHJhZ01vdmUgPSAoZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkID0+IHtcclxuICAgIGlmICghdGhpcy5pc1Jlc2l6aW5nIHx8ICF0aGlzLnNpZGViYXJSb290RWwpIHJldHVybjtcclxuXHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICBpZiAoIXRoaXMuaXNSZXNpemluZyB8fCAhdGhpcy5zaWRlYmFyUm9vdEVsKSByZXR1cm47XHJcblxyXG4gICAgICBjb25zdCBjdXJyZW50TW91c2VYID0gZXZlbnQuY2xpZW50WDtcclxuICAgICAgY29uc3QgZGVsdGFYID0gY3VycmVudE1vdXNlWCAtIHRoaXMuaW5pdGlhbE1vdXNlWDtcclxuICAgICAgbGV0IG5ld1dpZHRoID0gdGhpcy5pbml0aWFsU2lkZWJhcldpZHRoICsgZGVsdGFYO1xyXG5cclxuICAgICAgY29uc3QgbWluV2lkdGggPSAxNTA7XHJcbiAgICAgIGNvbnN0IGNvbnRhaW5lcldpZHRoID0gdGhpcy5jb250ZW50RWwub2Zmc2V0V2lkdGg7XHJcblxyXG4gICAgICBjb25zdCBtYXhXaWR0aCA9IE1hdGgubWF4KG1pbldpZHRoICsgNTAsIGNvbnRhaW5lcldpZHRoICogMC42KTtcclxuXHJcbiAgICAgIGlmIChuZXdXaWR0aCA8IG1pbldpZHRoKSBuZXdXaWR0aCA9IG1pbldpZHRoO1xyXG4gICAgICBpZiAobmV3V2lkdGggPiBtYXhXaWR0aCkgbmV3V2lkdGggPSBtYXhXaWR0aDtcclxuXHJcbiAgICAgIHRoaXMuc2lkZWJhclJvb3RFbC5zdHlsZS53aWR0aCA9IGAke25ld1dpZHRofXB4YDtcclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLnN0eWxlLm1pbldpZHRoID0gYCR7bmV3V2lkdGh9cHhgO1xyXG4gICAgfSk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBvbkRyYWdFbmQgPSAoKTogdm9pZCA9PiB7XHJcbiAgICBpZiAoIXRoaXMuaXNSZXNpemluZykgcmV0dXJuO1xyXG5cclxuICAgIHRoaXMuaXNSZXNpemluZyA9IGZhbHNlO1xyXG5cclxuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgdGhpcy5ib3VuZE9uRHJhZ01vdmUsIHsgY2FwdHVyZTogdHJ1ZSB9KTtcclxuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIHRoaXMuYm91bmRPbkRyYWdFbmQsIHsgY2FwdHVyZTogdHJ1ZSB9KTtcclxuICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuY3Vyc29yID0gXCJcIjtcclxuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NfUkVTSVpJTkcpO1xyXG5cclxuICAgIHRoaXMuc2F2ZVdpZHRoRGVib3VuY2VkKCk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVNZXNzYWdlQWRkZWQoZGF0YTogeyBjaGF0SWQ6IHN0cmluZzsgbWVzc2FnZTogTWVzc2FnZSB9KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBtZXNzYWdlRm9yTG9nID0gZGF0YT8ubWVzc2FnZTtcclxuICAgIGNvbnN0IG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cgPSBtZXNzYWdlRm9yTG9nPy50aW1lc3RhbXA/LmdldFRpbWUoKTtcclxuICAgIGNvbnN0IG1lc3NhZ2VSb2xlRm9yTG9nID0gbWVzc2FnZUZvckxvZz8ucm9sZSBhcyBNZXNzYWdlUm9sZTtcclxuICAgIGNvbnN0IGhtYUVudHJ5SWQgPSBEYXRlLm5vdygpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGlmICghZGF0YSB8fCAhZGF0YS5tZXNzYWdlKSB7XHJcbiAgICAgICAgaWYgKG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cpIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmludm9rZUhNQVJlc29sdmVyKG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgeyBjaGF0SWQ6IGV2ZW50Q2hhdElkLCBtZXNzYWdlIH0gPSBkYXRhO1xyXG4gICAgICBjb25zdCBtZXNzYWdlVGltZXN0YW1wTXMgPSBtZXNzYWdlLnRpbWVzdGFtcC5nZXRUaW1lKCk7XHJcblxyXG4gICAgICBpZiAoIXRoaXMuY2hhdENvbnRhaW5lciB8fCAhdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIpIHtcclxuICAgICAgICBpZiAobWVzc2FnZVRpbWVzdGFtcEZvckxvZykgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuaW52b2tlSE1BUmVzb2x2ZXIobWVzc2FnZVRpbWVzdGFtcEZvckxvZyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBhY3RpdmVDaGF0SWQgPSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRBY3RpdmVDaGF0SWQoKTtcclxuICAgICAgaWYgKGV2ZW50Q2hhdElkICE9PSBhY3RpdmVDaGF0SWQpIHtcclxuICAgICAgICBpZiAobWVzc2FnZVRpbWVzdGFtcEZvckxvZykgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuaW52b2tlSE1BUmVzb2x2ZXIobWVzc2FnZVRpbWVzdGFtcEZvckxvZyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBleGlzdGluZ1JlbmRlcmVkTWVzc2FnZSA9IHRoaXMuY2hhdENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKFxyXG4gICAgICAgIGAuJHtDU1NfQ0xBU1NFUy5NRVNTQUdFX0dST1VQfTpub3QoLnBsYWNlaG9sZGVyKVtkYXRhLXRpbWVzdGFtcD1cIiR7bWVzc2FnZVRpbWVzdGFtcE1zfVwiXWBcclxuICAgICAgKTtcclxuICAgICAgaWYgKGV4aXN0aW5nUmVuZGVyZWRNZXNzYWdlKSB7XHJcbiAgICAgICAgaWYgKG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cpIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmludm9rZUhNQVJlc29sdmVyKG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgYWxyZWFkeUluTG9naWNDYWNoZSA9IHRoaXMuY3VycmVudE1lc3NhZ2VzLnNvbWUoXHJcbiAgICAgICAgbSA9PiBtLnRpbWVzdGFtcC5nZXRUaW1lKCkgPT09IG1lc3NhZ2VUaW1lc3RhbXBNcyAmJiBtLnJvbGUgPT09IG1lc3NhZ2Uucm9sZSAmJiBtLmNvbnRlbnQgPT09IG1lc3NhZ2UuY29udGVudFxyXG4gICAgICApO1xyXG5cclxuICAgICAgY29uc3QgaXNQb3RlbnRpYWxseUFzc2lzdGFudEZvclBsYWNlaG9sZGVyID1cclxuICAgICAgICBtZXNzYWdlLnJvbGUgPT09IFwiYXNzaXN0YW50XCIgJiYgdGhpcy5hY3RpdmVQbGFjZWhvbGRlcj8udGltZXN0YW1wID09PSBtZXNzYWdlVGltZXN0YW1wTXM7XHJcblxyXG4gICAgICBpZiAoYWxyZWFkeUluTG9naWNDYWNoZSAmJiAhaXNQb3RlbnRpYWxseUFzc2lzdGFudEZvclBsYWNlaG9sZGVyKSB7XHJcbiAgICAgICAgaWYgKG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cpIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmludm9rZUhNQVJlc29sdmVyKG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBpZiAoYWxyZWFkeUluTG9naWNDYWNoZSAmJiBpc1BvdGVudGlhbGx5QXNzaXN0YW50Rm9yUGxhY2Vob2xkZXIpIHtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCFhbHJlYWR5SW5Mb2dpY0NhY2hlKSB7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50TWVzc2FnZXMucHVzaChtZXNzYWdlKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKGlzUG90ZW50aWFsbHlBc3Npc3RhbnRGb3JQbGFjZWhvbGRlciAmJiB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyKSB7XHJcbiAgICAgICAgY29uc3QgcGxhY2Vob2xkZXJUb1VwZGF0ZSA9IHRoaXMuYWN0aXZlUGxhY2Vob2xkZXI7XHJcblxyXG4gICAgICAgIGlmIChcclxuICAgICAgICAgIHBsYWNlaG9sZGVyVG9VcGRhdGUuZ3JvdXBFbD8uaXNDb25uZWN0ZWQgJiZcclxuICAgICAgICAgIHBsYWNlaG9sZGVyVG9VcGRhdGUuY29udGVudEVsICYmXHJcbiAgICAgICAgICBwbGFjZWhvbGRlclRvVXBkYXRlLm1lc3NhZ2VXcmFwcGVyXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICBwbGFjZWhvbGRlclRvVXBkYXRlLmdyb3VwRWwuY2xhc3NMaXN0LnJlbW92ZShcInBsYWNlaG9sZGVyXCIpO1xyXG4gICAgICAgICAgcGxhY2Vob2xkZXJUb1VwZGF0ZS5ncm91cEVsLnJlbW92ZUF0dHJpYnV0ZShcImRhdGEtcGxhY2Vob2xkZXItdGltZXN0YW1wXCIpO1xyXG4gICAgICAgICAgcGxhY2Vob2xkZXJUb1VwZGF0ZS5ncm91cEVsLnNldEF0dHJpYnV0ZShcImRhdGEtdGltZXN0YW1wXCIsIG1lc3NhZ2VUaW1lc3RhbXBNcy50b1N0cmluZygpKTtcclxuXHJcbiAgICAgICAgICBjb25zdCBtZXNzYWdlRG9tRWxlbWVudCA9IHBsYWNlaG9sZGVyVG9VcGRhdGUuZ3JvdXBFbC5xdWVyeVNlbGVjdG9yKFxyXG4gICAgICAgICAgICBgLiR7Q1NTX0NMQVNTRVMuTUVTU0FHRX1gXHJcbiAgICAgICAgICApIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcclxuXHJcbiAgICAgICAgICBpZiAoIW1lc3NhZ2VEb21FbGVtZW50KSB7XHJcbiAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlclRvVXBkYXRlLmdyb3VwRWwuaXNDb25uZWN0ZWQpIHBsYWNlaG9sZGVyVG9VcGRhdGUuZ3JvdXBFbC5yZW1vdmUoKTtcclxuICAgICAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlciA9IG51bGw7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYWRkTWVzc2FnZVN0YW5kYXJkKG1lc3NhZ2UpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcGxhY2Vob2xkZXJUb1VwZGF0ZS5jb250ZW50RWwuY2xhc3NMaXN0LnJlbW92ZShcInN0cmVhbWluZy10ZXh0XCIpO1xyXG4gICAgICAgICAgICBjb25zdCBkb3RzRWwgPSBwbGFjZWhvbGRlclRvVXBkYXRlLmNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yKGAuJHtDU1NfQ0xBU1NFUy5USElOS0lOR19ET1RTfWApO1xyXG4gICAgICAgICAgICBpZiAoZG90c0VsKSB7XHJcbiAgICAgICAgICAgICAgZG90c0VsLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlDb250ZW50ID0gQXNzaXN0YW50TWVzc2FnZVJlbmRlcmVyLnByZXBhcmVEaXNwbGF5Q29udGVudChcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2UuY29udGVudCB8fCBcIlwiLFxyXG4gICAgICAgICAgICAgICAgbWVzc2FnZSBhcyBBc3Npc3RhbnRNZXNzYWdlLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4sXHJcbiAgICAgICAgICAgICAgICB0aGlzXHJcbiAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgICAgcGxhY2Vob2xkZXJUb1VwZGF0ZS5jb250ZW50RWwuZW1wdHkoKTtcclxuXHJcbiAgICAgICAgICAgICAgYXdhaXQgUmVuZGVyZXJVdGlscy5yZW5kZXJNYXJrZG93bkNvbnRlbnQoXHJcbiAgICAgICAgICAgICAgICB0aGlzLmFwcCxcclxuICAgICAgICAgICAgICAgIHRoaXMsXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbixcclxuICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyVG9VcGRhdGUuY29udGVudEVsLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheUNvbnRlbnRcclxuICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgICBBc3Npc3RhbnRNZXNzYWdlUmVuZGVyZXIuYWRkQXNzaXN0YW50QWN0aW9uQnV0dG9ucyhcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2VEb21FbGVtZW50LFxyXG4gICAgICAgICAgICAgICAgcGxhY2Vob2xkZXJUb1VwZGF0ZS5jb250ZW50RWwsXHJcbiAgICAgICAgICAgICAgICBtZXNzYWdlIGFzIEFzc2lzdGFudE1lc3NhZ2UsXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbixcclxuICAgICAgICAgICAgICAgIHRoaXNcclxuICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgIEJhc2VNZXNzYWdlUmVuZGVyZXIuYWRkVGltZXN0YW1wKG1lc3NhZ2VEb21FbGVtZW50LCBtZXNzYWdlLnRpbWVzdGFtcCwgdGhpcyk7XHJcblxyXG4gICAgICAgICAgICAgIHRoaXMubGFzdE1lc3NhZ2VFbGVtZW50ID0gcGxhY2Vob2xkZXJUb1VwZGF0ZS5ncm91cEVsO1xyXG4gICAgICAgICAgICAgIHRoaXMuaGlkZUVtcHR5U3RhdGUoKTtcclxuXHJcbiAgICAgICAgICAgICAgY29uc3QgZmluYWxNZXNzYWdlR3JvdXBFbGVtZW50ID0gcGxhY2Vob2xkZXJUb1VwZGF0ZS5ncm91cEVsO1xyXG4gICAgICAgICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChmaW5hbE1lc3NhZ2VHcm91cEVsZW1lbnQgJiYgZmluYWxNZXNzYWdlR3JvdXBFbGVtZW50LmlzQ29ubmVjdGVkKSB7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tNZXNzYWdlRm9yQ29sbGFwc2luZyhmaW5hbE1lc3NhZ2VHcm91cEVsZW1lbnQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIH0sIDcwKTtcclxuICAgICAgICAgICAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbSgxMDAsIHRydWUpO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChyZW5kZXJFcnJvcjogYW55KSB7XHJcbiAgICAgICAgICAgICAgaWYgKHBsYWNlaG9sZGVyVG9VcGRhdGUuZ3JvdXBFbC5pc0Nvbm5lY3RlZCkgcGxhY2Vob2xkZXJUb1VwZGF0ZS5ncm91cEVsLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgPSBudWxsO1xyXG4gICAgICAgICAgICAgIHRoaXMuaGFuZGxlRXJyb3JNZXNzYWdlKHtcclxuICAgICAgICAgICAgICAgIHJvbGU6IFwiZXJyb3JcIixcclxuICAgICAgICAgICAgICAgIGNvbnRlbnQ6IGBGYWlsZWQgdG8gZmluYWxpemUgZGlzcGxheSBmb3IgdHMgJHttZXNzYWdlVGltZXN0YW1wTXN9OiAke3JlbmRlckVycm9yLm1lc3NhZ2V9YCxcclxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKSxcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDtcclxuICAgICAgICAgIGF3YWl0IHRoaXMuYWRkTWVzc2FnZVN0YW5kYXJkKG1lc3NhZ2UpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmFkZE1lc3NhZ2VTdGFuZGFyZChtZXNzYWdlKTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAob3V0ZXJFcnJvcjogYW55KSB7XHJcbiAgICAgIHRoaXMuaGFuZGxlRXJyb3JNZXNzYWdlKHtcclxuICAgICAgICByb2xlOiBcImVycm9yXCIsXHJcbiAgICAgICAgY29udGVudDogYEludGVybmFsIGVycm9yIGluIGhhbmRsZU1lc3NhZ2VBZGRlZCBmb3IgJHttZXNzYWdlUm9sZUZvckxvZ30gbXNnICh0cyAke21lc3NhZ2VUaW1lc3RhbXBGb3JMb2d9KTogJHtvdXRlckVycm9yLm1lc3NhZ2V9YCxcclxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCksXHJcbiAgICAgIH0pO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgaWYgKG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cpIHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5pbnZva2VITUFSZXNvbHZlcihtZXNzYWdlVGltZXN0YW1wRm9yTG9nKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHVibGljIGFzeW5jIGhhbmRsZVJlZ2VuZXJhdGVDbGljayh1c2VyTWVzc2FnZTogTWVzc2FnZSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgaWYgKHRoaXMuaXNSZWdlbmVyYXRpbmcpIHtcclxuICAgICAgbmV3IE5vdGljZShcIlJlZ2VuZXJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzLiBQbGVhc2Ugd2FpdC5cIiwgMzAwMCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJQcmV2aW91cyBnZW5lcmF0aW9uIHByb2Nlc3MgaXMgc3RpbGwgYWN0aXZlIG9yIGZpbmlzaGluZy4gUGxlYXNlIHdhaXQuXCIsIDQwMDApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICBpZiAoIWFjdGl2ZUNoYXQpIHtcclxuICAgICAgbmV3IE5vdGljZShcIkNhbm5vdCByZWdlbmVyYXRlOiBObyBhY3RpdmUgY2hhdCBmb3VuZC5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IGNoYXRJZCA9IGFjdGl2ZUNoYXQubWV0YWRhdGEuaWQ7XHJcbiAgICBjb25zdCBtZXNzYWdlSW5kZXggPSBhY3RpdmVDaGF0Lm1lc3NhZ2VzLmZpbmRJbmRleChcclxuICAgICAgbXNnID0+IG1zZy50aW1lc3RhbXAuZ2V0VGltZSgpID09PSB1c2VyTWVzc2FnZS50aW1lc3RhbXAuZ2V0VGltZSgpICYmIG1zZy5yb2xlID09PSB1c2VyTWVzc2FnZS5yb2xlXHJcbiAgICApO1xyXG5cclxuICAgIGlmIChtZXNzYWdlSW5kZXggPT09IC0xKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJFcnJvcjogQ291bGQgbm90IGZpbmQgdGhlIG1lc3NhZ2UgdG8gcmVnZW5lcmF0ZSBmcm9tLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGhhc01lc3NhZ2VzQWZ0ZXIgPSBhY3RpdmVDaGF0Lm1lc3NhZ2VzLmxlbmd0aCA+IG1lc3NhZ2VJbmRleCArIDE7XHJcblxyXG4gICAgbmV3IENvbmZpcm1Nb2RhbChcclxuICAgICAgdGhpcy5hcHAsXHJcbiAgICAgIFwiQ29uZmlybSBSZWdlbmVyYXRpb25cIixcclxuICAgICAgaGFzTWVzc2FnZXNBZnRlclxyXG4gICAgICAgID8gXCJUaGlzIHdpbGwgZGVsZXRlIGFsbCBtZXNzYWdlcyBhZnRlciB0aGlzIHByb21wdCBhbmQgZ2VuZXJhdGUgYSBuZXcgcmVzcG9uc2UuIENvbnRpbnVlP1wiXHJcbiAgICAgICAgOiBcIkdlbmVyYXRlIGEgbmV3IHJlc3BvbnNlIGZvciB0aGlzIHByb21wdD9cIixcclxuICAgICAgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuaXNSZWdlbmVyYXRpbmcgPSB0cnVlO1xyXG4gICAgICAgIGNvbnN0IHJlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xyXG4gICAgICAgIGxldCBhY2N1bXVsYXRlZFJlc3BvbnNlID0gXCJcIjtcclxuICAgICAgICBjb25zdCByZXNwb25zZVN0YXJ0VGltZSA9IG5ldyBEYXRlKCk7XHJcbiAgICAgICAgY29uc3QgcmVzcG9uc2VTdGFydFRpbWVNcyA9IHJlc3BvbnNlU3RhcnRUaW1lLmdldFRpbWUoKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRMb2FkaW5nU3RhdGUodHJ1ZSk7XHJcblxyXG4gICAgICAgIGxldCBzdHJlYW1FcnJvck9jY3VycmVkOiBFcnJvciB8IG51bGwgPSBudWxsO1xyXG4gICAgICAgIGxldCBtYWluQXNzaXN0YW50TWVzc2FnZVByb2Nlc3NlZFByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBpZiAoaGFzTWVzc2FnZXNBZnRlcikge1xyXG4gICAgICAgICAgICBjb25zdCBkZWxldGVTdWNjZXNzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZGVsZXRlTWVzc2FnZXNBZnRlcihjaGF0SWQsIG1lc3NhZ2VJbmRleCk7XHJcbiAgICAgICAgICAgIGlmICghZGVsZXRlU3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkZhaWxlZCB0byBkZWxldGUgc3Vic2VxdWVudCBtZXNzYWdlcyBmb3IgcmVnZW5lcmF0aW9uLlwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGF3YWl0IHRoaXMubG9hZEFuZERpc3BsYXlBY3RpdmVDaGF0KCk7XHJcbiAgICAgICAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbSg1MCwgdHJ1ZSk7XHJcblxyXG4gICAgICAgICAgY29uc3QgYXNzaXN0YW50UGxhY2Vob2xkZXJHcm91cEVsID0gdGhpcy5jaGF0Q29udGFpbmVyLmNyZWF0ZURpdih7XHJcbiAgICAgICAgICAgIGNsczogYCR7Q1NTX0NMQVNTRVMuTUVTU0FHRV9HUk9VUH0gJHtDU1NfQ0xBU1NFUy5PTExBTUFfR1JPVVB9IHBsYWNlaG9sZGVyYCxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgYXNzaXN0YW50UGxhY2Vob2xkZXJHcm91cEVsLnNldEF0dHJpYnV0ZShcImRhdGEtcGxhY2Vob2xkZXItdGltZXN0YW1wXCIsIHJlc3BvbnNlU3RhcnRUaW1lTXMudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICBSZW5kZXJlclV0aWxzLnJlbmRlckF2YXRhcih0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIGFzc2lzdGFudFBsYWNlaG9sZGVyR3JvdXBFbCwgZmFsc2UpO1xyXG4gICAgICAgICAgY29uc3QgbWVzc2FnZVdyYXBwZXJFbCA9IGFzc2lzdGFudFBsYWNlaG9sZGVyR3JvdXBFbC5jcmVhdGVEaXYoeyBjbHM6IFwibWVzc2FnZS13cmFwcGVyXCIgfSk7XHJcbiAgICAgICAgICBtZXNzYWdlV3JhcHBlckVsLnN0eWxlLm9yZGVyID0gXCIyXCI7XHJcbiAgICAgICAgICBjb25zdCBhc3Npc3RhbnRNZXNzYWdlRWxlbWVudCA9IG1lc3NhZ2VXcmFwcGVyRWwuY3JlYXRlRGl2KHtcclxuICAgICAgICAgICAgY2xzOiBgJHtDU1NfQ0xBU1NFUy5NRVNTQUdFfSAke0NTU19DTEFTU0VTLk9MTEFNQV9NRVNTQUdFfWAsXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGNvbnN0IGNvbnRlbnRDb250YWluZXIgPSBhc3Npc3RhbnRNZXNzYWdlRWxlbWVudC5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLkNPTlRFTlRfQ09OVEFJTkVSIH0pO1xyXG4gICAgICAgICAgY29uc3QgYXNzaXN0YW50Q29udGVudEVsID0gY29udGVudENvbnRhaW5lci5jcmVhdGVEaXYoe1xyXG4gICAgICAgICAgICBjbHM6IGAke0NTU19DTEFTU0VTLkNPTlRFTlR9ICR7Q1NTX0NMQVNTRVMuQ09OVEVOVF9DT0xMQVBTSUJMRX0gc3RyZWFtaW5nLXRleHRgLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBhc3Npc3RhbnRDb250ZW50RWwuZW1wdHkoKTtcclxuICAgICAgICAgIGNvbnN0IGRvdHMgPSBhc3Npc3RhbnRDb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NFUy5USElOS0lOR19ET1RTIH0pO1xyXG4gICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCAzOyBpKyspIGRvdHMuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NFUy5USElOS0lOR19ET1QgfSk7XHJcblxyXG4gICAgICAgICAgaWYgKGFzc2lzdGFudFBsYWNlaG9sZGVyR3JvdXBFbCAmJiBhc3Npc3RhbnRDb250ZW50RWwgJiYgbWVzc2FnZVdyYXBwZXJFbCkge1xyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0ge1xyXG4gICAgICAgICAgICAgIHRpbWVzdGFtcDogcmVzcG9uc2VTdGFydFRpbWVNcyxcclxuICAgICAgICAgICAgICBncm91cEVsOiBhc3Npc3RhbnRQbGFjZWhvbGRlckdyb3VwRWwsXHJcbiAgICAgICAgICAgICAgY29udGVudEVsOiBhc3Npc3RhbnRDb250ZW50RWwsXHJcbiAgICAgICAgICAgICAgbWVzc2FnZVdyYXBwZXI6IG1lc3NhZ2VXcmFwcGVyRWwsXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJGYWlsZWQgdG8gY3JlYXRlIHBsYWNlaG9sZGVyIGVsZW1lbnRzIGZvciByZWdlbmVyYXRpb24uXCIpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgYXNzaXN0YW50UGxhY2Vob2xkZXJHcm91cEVsLmNsYXNzTGlzdC5hZGQoQ1NTX0NMQVNTRVMuTUVTU0FHRV9BUlJJVklORyk7XHJcbiAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IGFzc2lzdGFudFBsYWNlaG9sZGVyR3JvdXBFbD8uY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NFUy5NRVNTQUdFX0FSUklWSU5HKSwgNTAwKTtcclxuICAgICAgICAgIHRoaXMuZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKDUwLCB0cnVlKTtcclxuXHJcbiAgICAgICAgICBjb25zdCBjaGF0Rm9yU3RyZWFtaW5nID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0Q2hhdChjaGF0SWQpO1xyXG4gICAgICAgICAgaWYgKCFjaGF0Rm9yU3RyZWFtaW5nKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkZhaWxlZCB0byBnZXQgdXBkYXRlZCBjaGF0IGNvbnRleHQgZm9yIHN0cmVhbWluZyByZWdlbmVyYXRpb24uXCIpO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGNvbnN0IHN0cmVhbSA9IHRoaXMucGx1Z2luLm9sbGFtYVNlcnZpY2UuZ2VuZXJhdGVDaGF0UmVzcG9uc2VTdHJlYW0oXHJcbiAgICAgICAgICAgIGNoYXRGb3JTdHJlYW1pbmcsXHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlci5zaWduYWxcclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgbGV0IGZpcnN0Q2h1bmsgPSB0cnVlO1xyXG4gICAgICAgICAgZm9yIGF3YWl0IChjb25zdCBjaHVuayBvZiBzdHJlYW0pIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlci5zaWduYWwuYWJvcnRlZCkge1xyXG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImFib3J0ZWQgYnkgdXNlclwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoXCJlcnJvclwiIGluIGNodW5rICYmIGNodW5rLmVycm9yKSB7XHJcbiAgICAgICAgICAgICAgaWYgKCFjaHVuay5lcnJvci5pbmNsdWRlcyhcImFib3J0ZWQgYnkgdXNlclwiKSkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGNodW5rLmVycm9yKTtcclxuICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiYWJvcnRlZCBieSB1c2VyXCIpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoXCJyZXNwb25zZVwiIGluIGNodW5rICYmIGNodW5rLnJlc3BvbnNlKSB7XHJcbiAgICAgICAgICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXI/LnRpbWVzdGFtcCA9PT0gcmVzcG9uc2VTdGFydFRpbWVNcyAmJiB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmNvbnRlbnRFbCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGZpcnN0Q2h1bmspIHtcclxuICAgICAgICAgICAgICAgICAgY29uc3QgdGhpbmtpbmdEb3RzID0gdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5jb250ZW50RWwucXVlcnlTZWxlY3RvcihgLiR7Q1NTX0NMQVNTRVMuVEhJTktJTkdfRE9UU31gKTtcclxuICAgICAgICAgICAgICAgICAgaWYgKHRoaW5raW5nRG90cykgdGhpbmtpbmdEb3RzLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICAgICAgICBmaXJzdENodW5rID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBhY2N1bXVsYXRlZFJlc3BvbnNlICs9IGNodW5rLnJlc3BvbnNlO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgUmVuZGVyZXJVdGlscy5yZW5kZXJNYXJrZG93bkNvbnRlbnQoXHJcbiAgICAgICAgICAgICAgICAgIHRoaXMuYXBwLFxyXG4gICAgICAgICAgICAgICAgICB0aGlzLFxyXG4gICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbixcclxuICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5jb250ZW50RWwsXHJcbiAgICAgICAgICAgICAgICAgIGFjY3VtdWxhdGVkUmVzcG9uc2VcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbSg1MCwgdHJ1ZSk7XHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGFjY3VtdWxhdGVkUmVzcG9uc2UgKz0gY2h1bmsucmVzcG9uc2U7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChcImRvbmVcIiBpbiBjaHVuayAmJiBjaHVuay5kb25lKSB7XHJcbiAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBpZiAoYWNjdW11bGF0ZWRSZXNwb25zZS50cmltKCkpIHtcclxuICAgICAgICAgICAgbWFpbkFzc2lzdGFudE1lc3NhZ2VQcm9jZXNzZWRQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XHJcbiAgICAgICAgICAgICAgdGhpcy5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuc2V0KHJlc3BvbnNlU3RhcnRUaW1lTXMsIHJlc29sdmUpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXQoXCJhc3Npc3RhbnRcIiwgYWNjdW11bGF0ZWRSZXNwb25zZSwgcmVzcG9uc2VTdGFydFRpbWUsIHRydWUpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdGltZW91dER1cmF0aW9uID0gMTAwMDA7XHJcbiAgICAgICAgICAgIGNvbnN0IHRpbWVvdXRQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKF8sIHJlamVjdCkgPT5cclxuICAgICAgICAgICAgICBzZXRUaW1lb3V0KFxyXG4gICAgICAgICAgICAgICAgKCkgPT5cclxuICAgICAgICAgICAgICAgICAgcmVqZWN0KFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBFcnJvcihgVGltZW91dCAoJHt0aW1lb3V0RHVyYXRpb24gLyAxMDAwfXMpIHdhaXRpbmcgZm9yIEhNQSBmb3IgdHMgJHtyZXNwb25zZVN0YXJ0VGltZU1zfWApXHJcbiAgICAgICAgICAgICAgICAgICksXHJcbiAgICAgICAgICAgICAgICB0aW1lb3V0RHVyYXRpb25cclxuICAgICAgICAgICAgICApXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5yYWNlKFttYWluQXNzaXN0YW50TWVzc2FnZVByb2Nlc3NlZFByb21pc2UsIHRpbWVvdXRQcm9taXNlXSk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGF3YWl0UHJvbWlzZUVycm9yOiBhbnkpIHtcclxuICAgICAgICAgICAgICBzdHJlYW1FcnJvck9jY3VycmVkID0gc3RyZWFtRXJyb3JPY2N1cnJlZCB8fCBhd2FpdFByb21pc2VFcnJvcjtcclxuICAgICAgICAgICAgICBpZiAodGhpcy5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuaGFzKHJlc3BvbnNlU3RhcnRUaW1lTXMpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5kZWxldGUocmVzcG9uc2VTdGFydFRpbWVNcyk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQpIHtcclxuICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXI/LnRpbWVzdGFtcCA9PT0gcmVzcG9uc2VTdGFydFRpbWVNcyAmJlxyXG4gICAgICAgICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbD8uaXNDb25uZWN0ZWRcclxuICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyPy50aW1lc3RhbXAgPT09IHJlc3BvbnNlU3RhcnRUaW1lTXMpIHtcclxuICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0KFxyXG4gICAgICAgICAgICAgIFwic3lzdGVtXCIsXHJcbiAgICAgICAgICAgICAgXCJBc3Npc3RhbnQgcHJvdmlkZWQgYW4gZW1wdHkgcmVzcG9uc2UgZHVyaW5nIHJlZ2VuZXJhdGlvbi5cIixcclxuICAgICAgICAgICAgICBuZXcgRGF0ZSgpLFxyXG4gICAgICAgICAgICAgIHRydWVcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgICAgICBzdHJlYW1FcnJvck9jY3VycmVkID0gZXJyb3I7XHJcblxyXG4gICAgICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXI/LnRpbWVzdGFtcCA9PT0gcmVzcG9uc2VTdGFydFRpbWVNcykge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsPy5pc0Nvbm5lY3RlZCkgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmICh0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5oYXMocmVzcG9uc2VTdGFydFRpbWVNcykpIHtcclxuICAgICAgICAgICAgdGhpcy5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuZGVsZXRlKHJlc3BvbnNlU3RhcnRUaW1lTXMpO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGxldCBlcnJvck1zZ0ZvckNoYXQ6IHN0cmluZyA9IFwiQW4gdW5leHBlY3RlZCBlcnJvciBvY2N1cnJlZCBkdXJpbmcgcmVnZW5lcmF0aW9uLlwiO1xyXG4gICAgICAgICAgbGV0IGVycm9yTXNnUm9sZTogXCJzeXN0ZW1cIiB8IFwiZXJyb3JcIiA9IFwiZXJyb3JcIjtcclxuICAgICAgICAgIGxldCBzYXZlUGFydGlhbFJlc3BvbnNlT25FcnJvciA9IGZhbHNlO1xyXG5cclxuICAgICAgICAgIGlmIChlcnJvci5uYW1lID09PSBcIkFib3J0RXJyb3JcIiB8fCBlcnJvci5tZXNzYWdlPy5pbmNsdWRlcyhcImFib3J0ZWQgYnkgdXNlclwiKSkge1xyXG4gICAgICAgICAgICBlcnJvck1zZ0ZvckNoYXQgPSBcIlJlZ2VuZXJhdGlvbiBzdG9wcGVkLlwiO1xyXG4gICAgICAgICAgICBlcnJvck1zZ1JvbGUgPSBcInN5c3RlbVwiO1xyXG4gICAgICAgICAgICBpZiAoYWNjdW11bGF0ZWRSZXNwb25zZS50cmltKCkpIHNhdmVQYXJ0aWFsUmVzcG9uc2VPbkVycm9yID0gdHJ1ZTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGVycm9yTXNnRm9yQ2hhdCA9IGBSZWdlbmVyYXRpb24gZmFpbGVkOiAke2Vycm9yLm1lc3NhZ2UgfHwgXCJVbmtub3duIGVycm9yXCJ9YDtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShlcnJvck1zZ0ZvckNoYXQsIDUwMDApO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXQoZXJyb3JNc2dSb2xlLCBlcnJvck1zZ0ZvckNoYXQsIG5ldyBEYXRlKCksIHRydWUpO1xyXG5cclxuICAgICAgICAgIGlmIChzYXZlUGFydGlhbFJlc3BvbnNlT25FcnJvcikge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0KFwiYXNzaXN0YW50XCIsIGFjY3VtdWxhdGVkUmVzcG9uc2UsIHJlc3BvbnNlU3RhcnRUaW1lLCB0cnVlKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgaWYgKHRoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmhhcyhyZXNwb25zZVN0YXJ0VGltZU1zKSkge1xyXG4gICAgICAgICAgICB0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5kZWxldGUocmVzcG9uc2VTdGFydFRpbWVNcyk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXI/LnRpbWVzdGFtcCA9PT0gcmVzcG9uc2VTdGFydFRpbWVNcykge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsPy5pc0Nvbm5lY3RlZCkge1xyXG4gICAgICAgICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5yZW1vdmUoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICB0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIgPSBudWxsO1xyXG5cclxuICAgICAgICAgIHRoaXMuaXNSZWdlbmVyYXRpbmcgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgICB0aGlzLnNldExvYWRpbmdTdGF0ZShmYWxzZSk7XHJcblxyXG4gICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVTZW5kQnV0dG9uU3RhdGUoKTtcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIHRoaXMuZm9jdXNJbnB1dCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgKS5vcGVuKCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHNjaGVkdWxlU2lkZWJhckNoYXRMaXN0VXBkYXRlID0gKGRlbGF5OiBudW1iZXIgPSA1MCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuY2hhdExpc3RVcGRhdGVUaW1lb3V0SWQpIHtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuY2hhdExpc3RVcGRhdGVUaW1lb3V0SWQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaWYgKHRoaXMuaXNDaGF0TGlzdFVwZGF0ZVNjaGVkdWxlZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLmlzQ2hhdExpc3RVcGRhdGVTY2hlZHVsZWQgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuY2hhdExpc3RVcGRhdGVUaW1lb3V0SWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgaWYgKHRoaXMuc2lkZWJhck1hbmFnZXI/LmlzU2VjdGlvblZpc2libGUoXCJjaGF0c1wiKSkge1xyXG4gICAgICAgIHRoaXMuc2lkZWJhck1hbmFnZXJcclxuICAgICAgICAgIC51cGRhdGVDaGF0TGlzdCgpXHJcbiAgICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyBjaGF0IHBhbmVsIGxpc3QgdmlhIHNjaGVkdWxlU2lkZWJhckNoYXRMaXN0VXBkYXRlOlwiLCBlKSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMuY2hhdExpc3RVcGRhdGVUaW1lb3V0SWQgPSBudWxsO1xyXG4gICAgICB0aGlzLmlzQ2hhdExpc3RVcGRhdGVTY2hlZHVsZWQgPSBmYWxzZTtcclxuICAgIH0sIGRlbGF5KTtcclxuICB9O1xyXG5cclxuICBhc3luYyBsb2FkQW5kRGlzcGxheUFjdGl2ZUNoYXQoKTogUHJvbWlzZTx7IG1ldGFkYXRhVXBkYXRlZDogYm9vbGVhbiB9PiB7XHJcbiAgICBsZXQgbWV0YWRhdGFVcGRhdGVkID0gZmFsc2U7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgdGhpcy5jbGVhckNoYXRDb250YWluZXJJbnRlcm5hbCgpO1xyXG5cclxuICAgICAgdGhpcy5sYXN0TWVzc2FnZUVsZW1lbnQgPSBudWxsO1xyXG4gICAgICB0aGlzLmNvbnNlY3V0aXZlRXJyb3JNZXNzYWdlcyA9IFtdO1xyXG4gICAgICB0aGlzLmVycm9yR3JvdXBFbGVtZW50ID0gbnVsbDtcclxuXHJcbiAgICAgIGxldCBhY3RpdmVDaGF0OiBDaGF0IHwgbnVsbCA9IG51bGw7XHJcbiAgICAgIGxldCBhdmFpbGFibGVNb2RlbHM6IHN0cmluZ1tdID0gW107XHJcbiAgICAgIGxldCBmaW5hbE1vZGVsTmFtZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XHJcbiAgICAgIGxldCBmaW5hbFJvbGVQYXRoOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xyXG4gICAgICBsZXQgZmluYWxSb2xlTmFtZTogc3RyaW5nID0gXCJOb25lXCI7XHJcbiAgICAgIGxldCBmaW5hbFRlbXBlcmF0dXJlOiBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xyXG4gICAgICBsZXQgZXJyb3JPY2N1cnJlZExvYWRpbmdEYXRhID0gZmFsc2U7XHJcblxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGFjdGl2ZUNoYXQgPSAoYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKSkgfHwgbnVsbDtcclxuICAgICAgICBhdmFpbGFibGVNb2RlbHMgPSBhd2FpdCB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdldE1vZGVscygpO1xyXG5cclxuICAgICAgICBmaW5hbFJvbGVQYXRoID1cclxuICAgICAgICAgIGFjdGl2ZUNoYXQ/Lm1ldGFkYXRhPy5zZWxlY3RlZFJvbGVQYXRoICE9PSB1bmRlZmluZWRcclxuICAgICAgICAgICAgPyBhY3RpdmVDaGF0Lm1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGhcclxuICAgICAgICAgICAgOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoO1xyXG4gICAgICAgIGZpbmFsUm9sZU5hbWUgPSBhd2FpdCB0aGlzLmZpbmRSb2xlTmFtZUJ5UGF0aChmaW5hbFJvbGVQYXRoKTtcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3IgY29ubmVjdGluZyB0byBPbGxhbWEgb3IgbG9hZGluZyBjaGF0IGRhdGEuXCIsIDUwMDApO1xyXG4gICAgICAgIGVycm9yT2NjdXJyZWRMb2FkaW5nRGF0YSA9IHRydWU7XHJcblxyXG4gICAgICAgIGF2YWlsYWJsZU1vZGVscyA9IGF2YWlsYWJsZU1vZGVscyB8fCBbXTtcclxuICAgICAgICBmaW5hbE1vZGVsTmFtZSA9IGF2YWlsYWJsZU1vZGVscy5pbmNsdWRlcyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWUpXHJcbiAgICAgICAgICA/IHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZVxyXG4gICAgICAgICAgOiBhdmFpbGFibGVNb2RlbHNbMF0gPz8gbnVsbDtcclxuICAgICAgICBmaW5hbFRlbXBlcmF0dXJlID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGVyYXR1cmU7XHJcbiAgICAgICAgZmluYWxSb2xlUGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XHJcbiAgICAgICAgZmluYWxSb2xlTmFtZSA9IGF3YWl0IHRoaXMuZmluZFJvbGVOYW1lQnlQYXRoKGZpbmFsUm9sZVBhdGgpO1xyXG4gICAgICAgIGFjdGl2ZUNoYXQgPSBudWxsO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoIWVycm9yT2NjdXJyZWRMb2FkaW5nRGF0YSAmJiBhY3RpdmVDaGF0KSB7XHJcbiAgICAgICAgbGV0IHByZWZlcnJlZE1vZGVsID0gYWN0aXZlQ2hhdC5tZXRhZGF0YT8ubW9kZWxOYW1lIHx8IHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZTtcclxuICAgICAgICBpZiAoYXZhaWxhYmxlTW9kZWxzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIGlmIChwcmVmZXJyZWRNb2RlbCAmJiBhdmFpbGFibGVNb2RlbHMuaW5jbHVkZXMocHJlZmVycmVkTW9kZWwpKSB7XHJcbiAgICAgICAgICAgIGZpbmFsTW9kZWxOYW1lID0gcHJlZmVycmVkTW9kZWw7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBmaW5hbE1vZGVsTmFtZSA9IGF2YWlsYWJsZU1vZGVsc1swXTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgZmluYWxNb2RlbE5hbWUgPSBudWxsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGFjdGl2ZUNoYXQubWV0YWRhdGEubW9kZWxOYW1lICE9PSBmaW5hbE1vZGVsTmFtZSAmJiBmaW5hbE1vZGVsTmFtZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgdXBkYXRlU3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnVwZGF0ZUFjdGl2ZUNoYXRNZXRhZGF0YSh7IG1vZGVsTmFtZTogZmluYWxNb2RlbE5hbWUgfSk7XHJcbiAgICAgICAgICAgIGlmICh1cGRhdGVTdWNjZXNzKSB7XHJcbiAgICAgICAgICAgICAgbWV0YWRhdGFVcGRhdGVkID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgICAgICAgY29uc3QgcG90ZW50aWFsbHlVcGRhdGVkQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldENoYXQoYWN0aXZlQ2hhdC5tZXRhZGF0YS5pZCk7XHJcbiAgICAgICAgICAgICAgaWYgKHBvdGVudGlhbGx5VXBkYXRlZENoYXQpIGFjdGl2ZUNoYXQgPSBwb3RlbnRpYWxseVVwZGF0ZWRDaGF0O1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9IGNhdGNoICh1cGRhdGVFcnJvcikge31cclxuICAgICAgICB9XHJcbiAgICAgICAgZmluYWxUZW1wZXJhdHVyZSA9IGFjdGl2ZUNoYXQubWV0YWRhdGE/LnRlbXBlcmF0dXJlID8/IHRoaXMucGx1Z2luLnNldHRpbmdzLnRlbXBlcmF0dXJlO1xyXG4gICAgICB9IGVsc2UgaWYgKCFlcnJvck9jY3VycmVkTG9hZGluZ0RhdGEgJiYgIWFjdGl2ZUNoYXQpIHtcclxuICAgICAgICBmaW5hbE1vZGVsTmFtZSA9IGF2YWlsYWJsZU1vZGVscy5pbmNsdWRlcyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWUpXHJcbiAgICAgICAgICA/IHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZVxyXG4gICAgICAgICAgOiBhdmFpbGFibGVNb2RlbHNbMF0gPz8gbnVsbDtcclxuICAgICAgICBmaW5hbFRlbXBlcmF0dXJlID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGVyYXR1cmU7XHJcbiAgICAgICAgZmluYWxSb2xlUGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XHJcbiAgICAgICAgZmluYWxSb2xlTmFtZSA9IGF3YWl0IHRoaXMuZmluZFJvbGVOYW1lQnlQYXRoKGZpbmFsUm9sZVBhdGgpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoYWN0aXZlQ2hhdCAmJiAhZXJyb3JPY2N1cnJlZExvYWRpbmdEYXRhICYmIGFjdGl2ZUNoYXQubWVzc2FnZXM/Lmxlbmd0aCA+IDApIHtcclxuICAgICAgICB0aGlzLmhpZGVFbXB0eVN0YXRlKCk7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50TWVzc2FnZXMgPSBbLi4uYWN0aXZlQ2hhdC5tZXNzYWdlc107XHJcbiAgICAgICAgdGhpcy5sYXN0UmVuZGVyZWRNZXNzYWdlRGF0ZSA9IG51bGw7XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgbWVzc2FnZSBvZiB0aGlzLmN1cnJlbnRNZXNzYWdlcykge1xyXG4gICAgICAgICAgbGV0IG1lc3NhZ2VHcm91cEVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgICAgICAgIGNvbnN0IGlzTmV3RGF5ID1cclxuICAgICAgICAgICAgIXRoaXMubGFzdFJlbmRlcmVkTWVzc2FnZURhdGUgfHwgIXRoaXMuaXNTYW1lRGF5KHRoaXMubGFzdFJlbmRlcmVkTWVzc2FnZURhdGUsIG1lc3NhZ2UudGltZXN0YW1wKTtcclxuICAgICAgICAgIGNvbnN0IGlzRmlyc3RNZXNzYWdlSW5Db250YWluZXIgPSB0aGlzLmNoYXRDb250YWluZXIuY2hpbGRyZW4ubGVuZ3RoID09PSAwO1xyXG5cclxuICAgICAgICAgIGlmIChpc05ld0RheSB8fCBpc0ZpcnN0TWVzc2FnZUluQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGlmIChpc05ld0RheSAmJiB0aGlzLmNoYXRDb250YWluZXIuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgIHRoaXMucmVuZGVyRGF0ZVNlcGFyYXRvcihtZXNzYWdlLnRpbWVzdGFtcCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5sYXN0UmVuZGVyZWRNZXNzYWdlRGF0ZSA9IG1lc3NhZ2UudGltZXN0YW1wO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGxldCByZW5kZXJlcjpcclxuICAgICAgICAgICAgICB8IFVzZXJNZXNzYWdlUmVuZGVyZXJcclxuICAgICAgICAgICAgICB8IEFzc2lzdGFudE1lc3NhZ2VSZW5kZXJlclxyXG4gICAgICAgICAgICAgIHwgU3lzdGVtTWVzc2FnZVJlbmRlcmVyXHJcbiAgICAgICAgICAgICAgfCBFcnJvck1lc3NhZ2VSZW5kZXJlclxyXG4gICAgICAgICAgICAgIHwgVG9vbE1lc3NhZ2VSZW5kZXJlclxyXG4gICAgICAgICAgICAgIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICBzd2l0Y2ggKG1lc3NhZ2Uucm9sZSkge1xyXG4gICAgICAgICAgICAgIGNhc2UgXCJ1c2VyXCI6XHJcbiAgICAgICAgICAgICAgICByZW5kZXJlciA9IG5ldyBVc2VyTWVzc2FnZVJlbmRlcmVyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgbWVzc2FnZSwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICBjYXNlIFwiYXNzaXN0YW50XCI6XHJcbiAgICAgICAgICAgICAgICByZW5kZXJlciA9IG5ldyBBc3Npc3RhbnRNZXNzYWdlUmVuZGVyZXIodGhpcy5hcHAsIHRoaXMucGx1Z2luLCBtZXNzYWdlIGFzIEFzc2lzdGFudE1lc3NhZ2UsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgY2FzZSBcInN5c3RlbVwiOlxyXG4gICAgICAgICAgICAgICAgcmVuZGVyZXIgPSBuZXcgU3lzdGVtTWVzc2FnZVJlbmRlcmVyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgbWVzc2FnZSwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICBjYXNlIFwiZXJyb3JcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlRXJyb3JNZXNzYWdlKG1lc3NhZ2UpO1xyXG5cclxuICAgICAgICAgICAgICAgIG1lc3NhZ2VHcm91cEVsID0gdGhpcy5lcnJvckdyb3VwRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgIGNhc2UgXCJ0b29sXCI6XHJcbiAgICAgICAgICAgICAgICByZW5kZXJlciA9IG5ldyBUb29sTWVzc2FnZVJlbmRlcmVyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgbWVzc2FnZSwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgY29uc3QgdW5rbm93blJvbGVHcm91cCA9IHRoaXMuY2hhdENvbnRhaW5lcj8uY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NFUy5NRVNTQUdFX0dST1VQIH0pO1xyXG4gICAgICAgICAgICAgICAgaWYgKHVua25vd25Sb2xlR3JvdXAgJiYgdGhpcy5jaGF0Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgICAgICAgIFJlbmRlcmVyVXRpbHMucmVuZGVyQXZhdGFyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgdW5rbm93blJvbGVHcm91cCwgZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgICBjb25zdCB3cmFwcGVyID0gdW5rbm93blJvbGVHcm91cC5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLk1FU1NBR0VfV1JBUFBFUiB8fCBcIm1lc3NhZ2Utd3JhcHBlclwiIH0pO1xyXG4gICAgICAgICAgICAgICAgICBjb25zdCBtc2dCdWJibGUgPSB3cmFwcGVyLmNyZWF0ZURpdih7IGNsczogYCR7Q1NTX0NMQVNTRVMuTUVTU0FHRX0gJHtDU1NfQ0xBU1NFUy5TWVNURU1fTUVTU0FHRX1gIH0pO1xyXG4gICAgICAgICAgICAgICAgICBtc2dCdWJibGUuY3JlYXRlRGl2KHtcclxuICAgICAgICAgICAgICAgICAgICBjbHM6IENTU19DTEFTU0VTLlNZU1RFTV9NRVNTQUdFX1RFWFQgfHwgXCJzeXN0ZW0tbWVzc2FnZS10ZXh0XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dDogYFVua25vd24gbWVzc2FnZSByb2xlOiAke21lc3NhZ2Uucm9sZX1gLFxyXG4gICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgQmFzZU1lc3NhZ2VSZW5kZXJlci5hZGRUaW1lc3RhbXAobXNnQnViYmxlLCBtZXNzYWdlLnRpbWVzdGFtcCwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5hcHBlbmRDaGlsZCh1bmtub3duUm9sZUdyb3VwKTtcclxuICAgICAgICAgICAgICAgICAgbWVzc2FnZUdyb3VwRWwgPSB1bmtub3duUm9sZUdyb3VwO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChyZW5kZXJlciAmJiBtZXNzYWdlLnJvbGUgIT09IFwiZXJyb3JcIikge1xyXG4gICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHJlbmRlcmVyLnJlbmRlcigpO1xyXG4gICAgICAgICAgICAgIG1lc3NhZ2VHcm91cEVsID0gcmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSA/IGF3YWl0IHJlc3VsdCA6IHJlc3VsdDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSBjYXRjaCAocmVuZGVyRXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc3QgZXJyb3JEaXYgPSB0aGlzLmNoYXRDb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NFUy5FUlJPUl9NRVNTQUdFIHx8IFwicmVuZGVyLWVycm9yXCIgfSk7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnNldFRleHQoYEVycm9yIHJlbmRlcmluZyBtZXNzYWdlIChyb2xlOiAke21lc3NhZ2Uucm9sZX0pYCk7XHJcbiAgICAgICAgICAgIG1lc3NhZ2VHcm91cEVsID0gZXJyb3JEaXY7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKG1lc3NhZ2VHcm91cEVsKSB7XHJcbiAgICAgICAgICAgIGlmIChtZXNzYWdlR3JvdXBFbC5wYXJlbnRFbGVtZW50ICE9PSB0aGlzLmNoYXRDb250YWluZXIpIHtcclxuICAgICAgICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuYXBwZW5kQ2hpbGQobWVzc2FnZUdyb3VwRWwpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMubGFzdE1lc3NhZ2VFbGVtZW50ID0gbWVzc2FnZUdyb3VwRWw7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMuY2hlY2tBbGxNZXNzYWdlc0ZvckNvbGxhcHNpbmcoKSwgMTAwKTtcclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgIHRoaXMuZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKDEwMCwgdHJ1ZSk7XHJcbiAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVTY3JvbGxTdGF0ZUFuZEluZGljYXRvcnMoKTtcclxuICAgICAgICAgIH0sIDE1MCk7XHJcbiAgICAgICAgfSwgMTUwKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLnNob3dFbXB0eVN0YXRlKCk7XHJcbiAgICAgICAgdGhpcy5zY3JvbGxUb0JvdHRvbUJ1dHRvbj8uY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NFUy5WSVNJQkxFIHx8IFwidmlzaWJsZVwiKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGhpcy51cGRhdGVJbnB1dFBsYWNlaG9sZGVyKGZpbmFsUm9sZU5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZVJvbGVEaXNwbGF5KGZpbmFsUm9sZU5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZU1vZGVsRGlzcGxheShmaW5hbE1vZGVsTmFtZSk7XHJcbiAgICAgIHRoaXMudXBkYXRlVGVtcGVyYXR1cmVJbmRpY2F0b3IoZmluYWxUZW1wZXJhdHVyZSk7XHJcblxyXG4gICAgICBpZiAoZmluYWxNb2RlbE5hbWUgPT09IG51bGwpIHtcclxuICAgICAgICBpZiAodGhpcy5pbnB1dEVsKSB7XHJcbiAgICAgICAgICB0aGlzLmlucHV0RWwuZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgICAgdGhpcy5pbnB1dEVsLnBsYWNlaG9sZGVyID0gXCJObyBtb2RlbHMgYXZhaWxhYmxlLi4uXCI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLnNlbmRCdXR0b24pIHtcclxuICAgICAgICAgIHRoaXMuc2VuZEJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICAgICAgICB0aGlzLnNlbmRCdXR0b24uY2xhc3NMaXN0LmFkZChDU1NfQ0xBU1NFUy5ESVNBQkxFRCB8fCBcImRpc2FibGVkXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5pc1Byb2Nlc3NpbmcpIHRoaXMuc2V0TG9hZGluZ1N0YXRlKGZhbHNlKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBpZiAodGhpcy5pbnB1dEVsICYmICF0aGlzLmlzUHJvY2Vzc2luZykge1xyXG4gICAgICAgICAgdGhpcy5pbnB1dEVsLmRpc2FibGVkID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMuY2xlYXJDaGF0Q29udGFpbmVySW50ZXJuYWwoKTtcclxuICAgICAgdGhpcy5zaG93RW1wdHlTdGF0ZSgpO1xyXG4gICAgICBpZiAodGhpcy5jaGF0Q29udGFpbmVyKSB7XHJcbiAgICAgICAgdGhpcy5jaGF0Q29udGFpbmVyLmNyZWF0ZURpdih7XHJcbiAgICAgICAgICBjbHM6IFwiZmF0YWwtZXJyb3ItbWVzc2FnZVwiLFxyXG4gICAgICAgICAgdGV4dDogXCJGYWlsZWQgdG8gbG9hZCBjaGF0IGNvbnRlbnQuIFBsZWFzZSBjaGVjayBjb25zb2xlLlwiLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB7IG1ldGFkYXRhVXBkYXRlZDogZmFsc2UgfTtcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHsgbWV0YWRhdGFVcGRhdGVkIH07XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkID0gYXN5bmMgKGRhdGE6IHsgY2hhdElkOiBzdHJpbmcgfCBudWxsOyBjaGF0OiBDaGF0IHwgbnVsbCB9KTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICBpZiAodGhpcy5pc1JlZ2VuZXJhdGluZyAmJiBkYXRhLmNoYXRJZCA9PT0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0QWN0aXZlQ2hhdElkKCkpIHtcclxuICAgICAgdGhpcy5sYXN0UHJvY2Vzc2VkQ2hhdElkID0gZGF0YS5jaGF0SWQ7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjaGF0U3dpdGNoZWQgPSBkYXRhLmNoYXRJZCAhPT0gdGhpcy5sYXN0UHJvY2Vzc2VkQ2hhdElkO1xyXG4gICAgbGV0IG1ldGFkYXRhV2FzVXBkYXRlZEJ5TG9hZCA9IGZhbHNlO1xyXG5cclxuICAgIGlmIChjaGF0U3dpdGNoZWQgfHwgKGRhdGEuY2hhdElkICE9PSBudWxsICYmIGRhdGEuY2hhdCA9PT0gbnVsbCkpIHtcclxuICAgICAgdGhpcy5sYXN0UHJvY2Vzc2VkQ2hhdElkID0gZGF0YS5jaGF0SWQ7XHJcblxyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdCgpO1xyXG4gICAgICBtZXRhZGF0YVdhc1VwZGF0ZWRCeUxvYWQgPSByZXN1bHQubWV0YWRhdGFVcGRhdGVkO1xyXG4gICAgfSBlbHNlIGlmIChkYXRhLmNoYXRJZCAhPT0gbnVsbCAmJiBkYXRhLmNoYXQgIT09IG51bGwpIHtcclxuICAgICAgdGhpcy5sYXN0UHJvY2Vzc2VkQ2hhdElkID0gZGF0YS5jaGF0SWQ7XHJcbiAgICAgIGNvbnN0IGNoYXQgPSBkYXRhLmNoYXQ7XHJcblxyXG4gICAgICBjb25zdCBjdXJyZW50Um9sZVBhdGggPSBjaGF0Lm1ldGFkYXRhPy5zZWxlY3RlZFJvbGVQYXRoID8/IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XHJcbiAgICAgIGNvbnN0IGN1cnJlbnRSb2xlTmFtZSA9IGF3YWl0IHRoaXMuZmluZFJvbGVOYW1lQnlQYXRoKGN1cnJlbnRSb2xlUGF0aCk7XHJcbiAgICAgIGNvbnN0IGN1cnJlbnRNb2RlbE5hbWUgPSBjaGF0Lm1ldGFkYXRhPy5tb2RlbE5hbWUgfHwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xyXG4gICAgICBjb25zdCBjdXJyZW50VGVtcGVyYXR1cmUgPSBjaGF0Lm1ldGFkYXRhPy50ZW1wZXJhdHVyZSA/PyB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZTtcclxuXHJcbiAgICAgIHRoaXMudXBkYXRlTW9kZWxEaXNwbGF5KGN1cnJlbnRNb2RlbE5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZVJvbGVEaXNwbGF5KGN1cnJlbnRSb2xlTmFtZSk7XHJcbiAgICAgIHRoaXMudXBkYXRlSW5wdXRQbGFjZWhvbGRlcihjdXJyZW50Um9sZU5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZVRlbXBlcmF0dXJlSW5kaWNhdG9yKGN1cnJlbnRUZW1wZXJhdHVyZSk7XHJcbiAgICB9IGVsc2UgaWYgKGRhdGEuY2hhdElkID09PSBudWxsKSB7XHJcbiAgICAgIHRoaXMubGFzdFByb2Nlc3NlZENoYXRJZCA9IG51bGw7XHJcbiAgICAgIHRoaXMuY2xlYXJEaXNwbGF5QW5kU3RhdGUoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMubGFzdFByb2Nlc3NlZENoYXRJZCA9IGRhdGEuY2hhdElkO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghbWV0YWRhdGFXYXNVcGRhdGVkQnlMb2FkKSB7XHJcbiAgICAgIHRoaXMuc2NoZWR1bGVTaWRlYmFyQ2hhdExpc3RVcGRhdGUoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuc2lkZWJhck1hbmFnZXI/LmlzU2VjdGlvblZpc2libGUoXCJyb2xlc1wiKSkge1xyXG4gICAgICB0aGlzLnNpZGViYXJNYW5hZ2VyXHJcbiAgICAgICAgLnVwZGF0ZVJvbGVMaXN0KClcclxuICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyByb2xlIHBhbmVsIGxpc3QgaW4gaGFuZGxlQWN0aXZlQ2hhdENoYW5nZWQ6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyKSB7XHJcbiAgICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlclxyXG4gICAgICAgIC51cGRhdGVSb2xlTGlzdElmVmlzaWJsZSgpXHJcbiAgICAgICAgLmNhdGNoKGUgPT4gdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiRXJyb3IgdXBkYXRpbmcgcm9sZSBkcm9wZG93biBsaXN0IGluIGhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkOlwiLCBlKSk7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBfbWFuYWdlUGxhY2Vob2xkZXIodHVyblRpbWVzdGFtcDogbnVtYmVyLCByZXF1ZXN0VGltZXN0YW1wSWQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgJiYgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci50aW1lc3RhbXAgIT09IHR1cm5UaW1lc3RhbXApIHtcclxuICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5jbGFzc0xpc3QuY29udGFpbnMoXCJwbGFjZWhvbGRlclwiKSkge1xyXG4gICAgICAgIGlmICh0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmdyb3VwRWwuaXNDb25uZWN0ZWQpIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5yZW1vdmUoKTtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRoaXMuYWN0aXZlUGxhY2Vob2xkZXIpIHtcclxuICAgICAgY29uc3QgcGxhY2Vob2xkZXJHcm91cEVsID0gdGhpcy5jaGF0Q29udGFpbmVyLmNyZWF0ZURpdih7XHJcbiAgICAgICAgY2xzOiBgJHtDU1NfQ0xBU1NFUy5NRVNTQUdFX0dST1VQfSAke0NTU19DTEFTU0VTLk9MTEFNQV9HUk9VUH0gcGxhY2Vob2xkZXJgLFxyXG4gICAgICB9KTtcclxuICAgICAgcGxhY2Vob2xkZXJHcm91cEVsLnNldEF0dHJpYnV0ZShcImRhdGEtcGxhY2Vob2xkZXItdGltZXN0YW1wXCIsIHR1cm5UaW1lc3RhbXAudG9TdHJpbmcoKSk7XHJcbiAgICAgIFJlbmRlcmVyVXRpbHMucmVuZGVyQXZhdGFyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgcGxhY2Vob2xkZXJHcm91cEVsLCBmYWxzZSwgXCJhc3Npc3RhbnRcIik7XHJcbiAgICAgIGNvbnN0IHdyYXBwZXJFbCA9IHBsYWNlaG9sZGVyR3JvdXBFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLk1FU1NBR0VfV1JBUFBFUiB8fCBcIm1lc3NhZ2Utd3JhcHBlclwiIH0pO1xyXG4gICAgICB3cmFwcGVyRWwuc3R5bGUub3JkZXIgPSBcIjJcIjtcclxuICAgICAgY29uc3QgbXNnRWwgPSB3cmFwcGVyRWwuY3JlYXRlRGl2KHsgY2xzOiBgJHtDU1NfQ0xBU1NFUy5NRVNTQUdFfSAke0NTU19DTEFTU0VTLk9MTEFNQV9NRVNTQUdFfWAgfSk7XHJcbiAgICAgIGNvbnN0IGNvbnRlbnRDb250YWluZXJFbCA9IG1zZ0VsLmNyZWF0ZURpdih7IGNsczogQ1NTX0NMQVNTRVMuQ09OVEVOVF9DT05UQUlORVIgfSk7XHJcbiAgICAgIGNvbnN0IGNvbnRlbnRQbGFjZWhvbGRlckVsID0gY29udGVudENvbnRhaW5lckVsLmNyZWF0ZURpdih7XHJcbiAgICAgICAgY2xzOiBgJHtDU1NfQ0xBU1NFUy5DT05URU5UfSAke0NTU19DTEFTU0VTLkNPTlRFTlRfQ09MTEFQU0lCTEV9IHN0cmVhbWluZy10ZXh0YCxcclxuICAgICAgfSk7XHJcbiAgICAgIGNvbnRlbnRQbGFjZWhvbGRlckVsLmVtcHR5KCk7XHJcbiAgICAgIGNvbnN0IGRvdHMgPSBjb250ZW50UGxhY2Vob2xkZXJFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLlRISU5LSU5HX0RPVFMgfSk7XHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSBkb3RzLmNyZWF0ZURpdih7IGNsczogQ1NTX0NMQVNTRVMuVEhJTktJTkdfRE9UIH0pO1xyXG4gICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0ge1xyXG4gICAgICAgIHRpbWVzdGFtcDogdHVyblRpbWVzdGFtcCxcclxuICAgICAgICBncm91cEVsOiBwbGFjZWhvbGRlckdyb3VwRWwsXHJcbiAgICAgICAgY29udGVudEVsOiBjb250ZW50UGxhY2Vob2xkZXJFbCxcclxuICAgICAgICBtZXNzYWdlV3JhcHBlcjogd3JhcHBlckVsLFxyXG4gICAgICB9O1xyXG4gICAgICBwbGFjZWhvbGRlckdyb3VwRWwuY2xhc3NMaXN0LmFkZChDU1NfQ0xBU1NFUy5NRVNTQUdFX0FSUklWSU5HIHx8IFwibWVzc2FnZS1hcnJpdmluZ1wiKTtcclxuICAgICAgc2V0VGltZW91dCgoKSA9PiBwbGFjZWhvbGRlckdyb3VwRWw/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTRVMuTUVTU0FHRV9BUlJJVklORyB8fCBcIm1lc3NhZ2UtYXJyaXZpbmdcIiksIDUwMCk7XHJcbiAgICAgIHRoaXMuZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKDUwLCB0cnVlKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuY29udGVudEVsLmVtcHR5KCk7XHJcbiAgICAgIGNvbnN0IGRvdHMgPSB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLlRISU5LSU5HX0RPVFMgfSk7XHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSBkb3RzLmNyZWF0ZURpdih7IGNsczogQ1NTX0NMQVNTRVMuVEhJTktJTkdfRE9UIH0pO1xyXG4gICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmNvbnRlbnRFbC5jbGFzc0xpc3QuYWRkKFwic3RyZWFtaW5nLXRleHRcIik7XHJcbiAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIudGltZXN0YW1wID0gdHVyblRpbWVzdGFtcDtcclxuICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLnNldEF0dHJpYnV0ZShcImRhdGEtcGxhY2Vob2xkZXItdGltZXN0YW1wXCIsIHR1cm5UaW1lc3RhbXAudG9TdHJpbmcoKSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIF9wcm9jZXNzTGxtU3RyZWFtKFxyXG4gICAgc3RyZWFtOiBBc3luY0l0ZXJhYmxlSXRlcmF0b3I8U3RyZWFtQ2h1bms+LFxyXG4gICAgY3VycmVudFR1cm5MbG1SZXNwb25zZVRzOiBudW1iZXIsXHJcbiAgICByZXF1ZXN0VGltZXN0YW1wSWQ6IG51bWJlclxyXG4gICk6IFByb21pc2U8e1xyXG4gICAgYWNjdW11bGF0ZWRDb250ZW50OiBzdHJpbmc7XHJcbiAgICBuYXRpdmVUb29sQ2FsbHM6IFRvb2xDYWxsW10gfCBudWxsO1xyXG4gICAgYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxsczogQXNzaXN0YW50TWVzc2FnZSB8IG51bGw7XHJcbiAgfT4ge1xyXG4gICAgbGV0IGFjY3VtdWxhdGVkQ29udGVudCA9IFwiXCI7XHJcbiAgICBsZXQgbmF0aXZlVG9vbENhbGxzOiBUb29sQ2FsbFtdIHwgbnVsbCA9IG51bGw7XHJcbiAgICBsZXQgYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxsczogQXNzaXN0YW50TWVzc2FnZSB8IG51bGwgPSBudWxsO1xyXG4gICAgbGV0IGZpcnN0Q2h1bmtGb3JUdXJuID0gdHJ1ZTtcclxuXHJcbiAgICBmb3IgYXdhaXQgKGNvbnN0IGNodW5rIG9mIHN0cmVhbSkge1xyXG4gICAgICBpZiAodGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyPy5zaWduYWwuYWJvcnRlZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcImFib3J0ZWQgYnkgdXNlclwiKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoY2h1bmsudHlwZSA9PT0gXCJlcnJvclwiKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGNodW5rLmVycm9yKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXI/LnRpbWVzdGFtcCAhPT0gY3VycmVudFR1cm5MbG1SZXNwb25zZVRzKSB7XHJcbiAgICAgICAgaWYgKGNodW5rLnR5cGUgPT09IFwiZG9uZVwiKSBicmVhaztcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKGNodW5rLnR5cGUgPT09IFwiY29udGVudFwiKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXI/LmNvbnRlbnRFbCkge1xyXG4gICAgICAgICAgaWYgKGZpcnN0Q2h1bmtGb3JUdXJuKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRoaW5raW5nRG90cyA9IHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuY29udGVudEVsLnF1ZXJ5U2VsZWN0b3IoYC4ke0NTU19DTEFTU0VTLlRISU5LSU5HX0RPVFN9YCk7XHJcbiAgICAgICAgICAgIGlmICh0aGlua2luZ0RvdHMpIHRoaW5raW5nRG90cy5yZW1vdmUoKTtcclxuICAgICAgICAgICAgZmlyc3RDaHVua0ZvclR1cm4gPSBmYWxzZTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBhY2N1bXVsYXRlZENvbnRlbnQgKz0gY2h1bmsucmVzcG9uc2U7XHJcblxyXG4gICAgICAgICAgYXdhaXQgUmVuZGVyZXJVdGlscy5yZW5kZXJNYXJrZG93bkNvbnRlbnQoXHJcbiAgICAgICAgICAgIHRoaXMuYXBwLFxyXG4gICAgICAgICAgICB0aGlzLFxyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbixcclxuICAgICAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5jb250ZW50RWwsXHJcbiAgICAgICAgICAgIGFjY3VtdWxhdGVkQ29udGVudFxyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIHRoaXMuZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKDMwLCB0cnVlKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAoY2h1bmsudHlwZSA9PT0gXCJ0b29sX2NhbGxzXCIpIHtcclxuICAgICAgICBuYXRpdmVUb29sQ2FsbHMgPSBjaHVuay5jYWxscztcclxuICAgICAgICBhc3Npc3RhbnRNZXNzYWdlV2l0aE5hdGl2ZUNhbGxzID0gY2h1bmsuYXNzaXN0YW50X21lc3NhZ2Vfd2l0aF9jYWxscztcclxuXHJcbiAgICAgICAgaWYgKGFzc2lzdGFudE1lc3NhZ2VXaXRoTmF0aXZlQ2FsbHM/LmNvbnRlbnQpIHtcclxuICAgICAgICAgIGlmIChmaXJzdENodW5rRm9yVHVybiAmJiB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyPy5jb250ZW50RWwpIHtcclxuICAgICAgICAgICAgY29uc3QgdGhpbmtpbmdEb3RzID0gdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5jb250ZW50RWwucXVlcnlTZWxlY3RvcihgLiR7Q1NTX0NMQVNTRVMuVEhJTktJTkdfRE9UU31gKTtcclxuICAgICAgICAgICAgaWYgKHRoaW5raW5nRG90cykgdGhpbmtpbmdEb3RzLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICBmaXJzdENodW5rRm9yVHVybiA9IGZhbHNlO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmICghYWNjdW11bGF0ZWRDb250ZW50LmVuZHNXaXRoKGFzc2lzdGFudE1lc3NhZ2VXaXRoTmF0aXZlQ2FsbHMuY29udGVudCkpIHtcclxuICAgICAgICAgICAgYWNjdW11bGF0ZWRDb250ZW50ICs9IGFzc2lzdGFudE1lc3NhZ2VXaXRoTmF0aXZlQ2FsbHMuY29udGVudDtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBpZiAodGhpcy5hY3RpdmVQbGFjZWhvbGRlcj8uY29udGVudEVsKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IFJlbmRlcmVyVXRpbHMucmVuZGVyTWFya2Rvd25Db250ZW50KFxyXG4gICAgICAgICAgICAgIHRoaXMuYXBwLFxyXG4gICAgICAgICAgICAgIHRoaXMsXHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4sXHJcbiAgICAgICAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5jb250ZW50RWwsXHJcbiAgICAgICAgICAgICAgYWNjdW11bGF0ZWRDb250ZW50XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2UgaWYgKGNodW5rLnR5cGUgPT09IFwiZG9uZVwiKSB7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4geyBhY2N1bXVsYXRlZENvbnRlbnQsIG5hdGl2ZVRvb2xDYWxscywgYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxscyB9O1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBfZGV0ZXJtaW5lVG9vbENhbGxzKFxyXG4gICAgbmF0aXZlVG9vbENhbGxzOiBUb29sQ2FsbFtdIHwgbnVsbCxcclxuICAgIGFzc2lzdGFudE1lc3NhZ2VXaXRoTmF0aXZlQ2FsbHM6IEFzc2lzdGFudE1lc3NhZ2UgfCBudWxsLFxyXG4gICAgYWNjdW11bGF0ZWRMbG1Db250ZW50OiBzdHJpbmcsXHJcbiAgICBjdXJyZW50VHVybkxsbVJlc3BvbnNlVHM6IG51bWJlcixcclxuICAgIHJlcXVlc3RUaW1lc3RhbXBJZDogbnVtYmVyXHJcbiAgKToge1xyXG4gICAgcHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm46IFRvb2xDYWxsW10gfCBudWxsO1xyXG4gICAgYXNzaXN0YW50TWVzc2FnZUZvckhpc3Rvcnk6IEFzc2lzdGFudE1lc3NhZ2U7XHJcbiAgICBpc1RleHR1YWxGYWxsYmFja1VzZWQ6IGJvb2xlYW47XHJcbiAgfSB7XHJcbiAgICBsZXQgcHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm46IFRvb2xDYWxsW10gfCBudWxsID0gbmF0aXZlVG9vbENhbGxzO1xyXG4gICAgbGV0IGlzVGV4dHVhbEZhbGxiYWNrVXNlZCA9IGZhbHNlO1xyXG4gICAgbGV0IGFzc2lzdGFudE1lc3NhZ2VGb3JIaXN0b3J5OiBBc3Npc3RhbnRNZXNzYWdlO1xyXG5cclxuICAgIGlmICghcHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm4gfHwgcHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm4ubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIGNvbnN0IHBhcnNlZFRleHR1YWxDYWxscyA9IHBhcnNlQWxsVGV4dHVhbFRvb2xDYWxscyhhY2N1bXVsYXRlZExsbUNvbnRlbnQsIHRoaXMucGx1Z2luLmxvZ2dlcik7XHJcbiAgICAgIGlmIChwYXJzZWRUZXh0dWFsQ2FsbHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGlzVGV4dHVhbEZhbGxiYWNrVXNlZCA9IHRydWU7XHJcbiAgICAgICAgcHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm4gPSBwYXJzZWRUZXh0dWFsQ2FsbHMubWFwKCh0YywgaW5kZXgpID0+ICh7XHJcbiAgICAgICAgICB0eXBlOiBcImZ1bmN0aW9uXCIsXHJcbiAgICAgICAgICBpZDogYHRleHR0b29sLSR7Y3VycmVudFR1cm5MbG1SZXNwb25zZVRzfS0ke2luZGV4fWAsXHJcbiAgICAgICAgICBmdW5jdGlvbjogeyBuYW1lOiB0Yy5uYW1lLCBhcmd1bWVudHM6IEpTT04uc3RyaW5naWZ5KHRjLmFyZ3VtZW50cyB8fCB7fSkgfSxcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgYXNzaXN0YW50TWVzc2FnZUZvckhpc3RvcnkgPSB7XHJcbiAgICAgICAgICByb2xlOiBcImFzc2lzdGFudFwiLFxyXG4gICAgICAgICAgY29udGVudDogYWNjdW11bGF0ZWRMbG1Db250ZW50LFxyXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZShjdXJyZW50VHVybkxsbVJlc3BvbnNlVHMpLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYXNzaXN0YW50TWVzc2FnZUZvckhpc3RvcnkgPSB7XHJcbiAgICAgICAgICByb2xlOiBcImFzc2lzdGFudFwiLFxyXG4gICAgICAgICAgY29udGVudDogYWNjdW11bGF0ZWRMbG1Db250ZW50LFxyXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZShjdXJyZW50VHVybkxsbVJlc3BvbnNlVHMpLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGFzc2lzdGFudE1lc3NhZ2VGb3JIaXN0b3J5ID0gYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxscyB8fCB7XHJcbiAgICAgICAgcm9sZTogXCJhc3Npc3RhbnRcIixcclxuICAgICAgICBjb250ZW50OiBhY2N1bXVsYXRlZExsbUNvbnRlbnQsXHJcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZShjdXJyZW50VHVybkxsbVJlc3BvbnNlVHMpLFxyXG4gICAgICAgIHRvb2xfY2FsbHM6IHByb2Nlc3NlZFRvb2xDYWxsc1RoaXNUdXJuLFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgYXNzaXN0YW50TWVzc2FnZUZvckhpc3RvcnkuY29udGVudCA9IGFjY3VtdWxhdGVkTGxtQ29udGVudDtcclxuICAgICAgYXNzaXN0YW50TWVzc2FnZUZvckhpc3RvcnkudG9vbF9jYWxscyA9IHByb2Nlc3NlZFRvb2xDYWxsc1RoaXNUdXJuO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHsgcHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm4sIGFzc2lzdGFudE1lc3NhZ2VGb3JIaXN0b3J5LCBpc1RleHR1YWxGYWxsYmFja1VzZWQgfTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgX2V4ZWN1dGVBbmRSZW5kZXJUb29sQ3ljbGUoXHJcbiAgICB0b29sc1RvRXhlY3V0ZTogVG9vbENhbGxbXSxcclxuICAgIGFzc2lzdGFudE1lc3NhZ2VJbnRlbnQ6IEFzc2lzdGFudE1lc3NhZ2UsXHJcbiAgICByZXF1ZXN0VGltZXN0YW1wSWQ6IG51bWJlclxyXG4gICk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgY3VycmVudFZpZXdJbnN0YW5jZSA9IHRoaXM7XHJcbiAgICBjb25zdCBhc3Npc3RhbnRNc2dUc01zID0gYXNzaXN0YW50TWVzc2FnZUludGVudC50aW1lc3RhbXAuZ2V0VGltZSgpO1xyXG4gICAgY29uc3QgYXNzaXN0YW50SG1hUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIucmVnaXN0ZXJITUFSZXNvbHZlcihhc3Npc3RhbnRNc2dUc01zLCByZXNvbHZlLCByZWplY3QpO1xyXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICBpZiAoY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmhhcyhhc3Npc3RhbnRNc2dUc01zKSkge1xyXG4gICAgICAgICAgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIucmVqZWN0QW5kQ2xlYXJITUFSZXNvbHZlcihcclxuICAgICAgICAgICAgYXNzaXN0YW50TXNnVHNNcyxcclxuICAgICAgICAgICAgYEhNQSBUaW1lb3V0IGZvciBhc3Npc3RhbnQgdG9vbCBpbnRlbnQgKHRzOiAke2Fzc2lzdGFudE1zZ1RzTXN9KWBcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9LCAxMDAwMCk7XHJcbiAgICB9KTtcclxuICAgIGF3YWl0IGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXRQYXlsb2FkKGFzc2lzdGFudE1lc3NhZ2VJbnRlbnQsIHRydWUpO1xyXG4gICAgYXdhaXQgYXNzaXN0YW50SG1hUHJvbWlzZTtcclxuICAgIGlmIChjdXJyZW50Vmlld0luc3RhbmNlLmFjdGl2ZVBsYWNlaG9sZGVyPy50aW1lc3RhbXAgPT09IGFzc2lzdGFudE1zZ1RzTXMpIHtcclxuICAgICAgY3VycmVudFZpZXdJbnN0YW5jZS5hY3RpdmVQbGFjZWhvbGRlciA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgZm9yIChjb25zdCBjYWxsIG9mIHRvb2xzVG9FeGVjdXRlKSB7XHJcbiAgICAgIGlmIChjdXJyZW50Vmlld0luc3RhbmNlLmN1cnJlbnRBYm9ydENvbnRyb2xsZXI/LnNpZ25hbC5hYm9ydGVkKSB0aHJvdyBuZXcgRXJyb3IoXCJhYm9ydGVkIGJ5IHVzZXJcIik7XHJcbiAgICAgIGlmIChjYWxsLnR5cGUgPT09IFwiZnVuY3Rpb25cIikge1xyXG4gICAgICAgIGNvbnN0IHRvb2xOYW1lID0gY2FsbC5mdW5jdGlvbi5uYW1lO1xyXG4gICAgICAgIGxldCB0b29sQXJncyA9IHt9O1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICB0b29sQXJncyA9IEpTT04ucGFyc2UoY2FsbC5mdW5jdGlvbi5hcmd1bWVudHMgfHwgXCJ7fVwiKTtcclxuICAgICAgICB9IGNhdGNoIChlOiBhbnkpIHtcclxuICAgICAgICAgIGNvbnN0IGVycm9yQ29udGVudCA9IGBFcnJvciBwYXJzaW5nIGFyZ3MgZm9yICR7dG9vbE5hbWV9OiAke2UubWVzc2FnZX0uIEFyZ3Mgc3RyaW5nOiBcIiR7Y2FsbC5mdW5jdGlvbi5hcmd1bWVudHN9XCJgO1xyXG4gICAgICAgICAgY29uc3QgZXJyb3JUb29sVGltZXN0YW1wID0gbmV3IERhdGUoKTtcclxuICAgICAgICAgIGNvbnN0IGVycm9yVG9vbE1zZzogTWVzc2FnZSA9IHtcclxuICAgICAgICAgICAgcm9sZTogXCJ0b29sXCIsXHJcbiAgICAgICAgICAgIHRvb2xfY2FsbF9pZDogY2FsbC5pZCxcclxuICAgICAgICAgICAgbmFtZTogdG9vbE5hbWUsXHJcbiAgICAgICAgICAgIGNvbnRlbnQ6IGVycm9yQ29udGVudCxcclxuICAgICAgICAgICAgdGltZXN0YW1wOiBlcnJvclRvb2xUaW1lc3RhbXAsXHJcbiAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgIGNvbnN0IHRvb2xFcnJvckhtYVByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLnJlZ2lzdGVySE1BUmVzb2x2ZXIoXHJcbiAgICAgICAgICAgICAgZXJyb3JUb29sTXNnLnRpbWVzdGFtcC5nZXRUaW1lKCksXHJcbiAgICAgICAgICAgICAgcmVzb2x2ZSxcclxuICAgICAgICAgICAgICByZWplY3RcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgaWYgKGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5oYXMoZXJyb3JUb29sTXNnLnRpbWVzdGFtcC5nZXRUaW1lKCkpKSB7XHJcbiAgICAgICAgICAgICAgICBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5yZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKFxyXG4gICAgICAgICAgICAgICAgICBlcnJvclRvb2xNc2cudGltZXN0YW1wLmdldFRpbWUoKSxcclxuICAgICAgICAgICAgICAgICAgXCJITUEgdGltZW91dCBmb3IgdG9vbCBlcnJvciBtc2dcIlxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sIDEwMDAwKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgYXdhaXQgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIuYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdFBheWxvYWQoZXJyb3JUb29sTXNnLCB0cnVlKTtcclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHRvb2xFcnJvckhtYVByb21pc2U7XHJcbiAgICAgICAgICB9IGNhdGNoIChlX2htYSkge1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBleGVjUmVzdWx0ID0gYXdhaXQgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uYWdlbnRNYW5hZ2VyLmV4ZWN1dGVUb29sKHRvb2xOYW1lLCB0b29sQXJncyk7XHJcbiAgICAgICAgY29uc3QgdG9vbFJlc3VsdENvbnRlbnQgPSBleGVjUmVzdWx0LnN1Y2Nlc3NcclxuICAgICAgICAgID8gZXhlY1Jlc3VsdC5yZXN1bHRcclxuICAgICAgICAgIDogYEVycm9yIGV4ZWN1dGluZyB0b29sICR7dG9vbE5hbWV9OiAke2V4ZWNSZXN1bHQuZXJyb3IgfHwgXCJVbmtub3duIHRvb2wgZXJyb3JcIn1gO1xyXG4gICAgICAgIGNvbnN0IHRvb2xSZXNwb25zZVRpbWVzdGFtcCA9IG5ldyBEYXRlKCk7XHJcbiAgICAgICAgY29uc3QgdG9vbFJlc3BvbnNlTXNnOiBNZXNzYWdlID0ge1xyXG4gICAgICAgICAgcm9sZTogXCJ0b29sXCIsXHJcbiAgICAgICAgICB0b29sX2NhbGxfaWQ6IGNhbGwuaWQsXHJcbiAgICAgICAgICBuYW1lOiB0b29sTmFtZSxcclxuICAgICAgICAgIGNvbnRlbnQ6IHRvb2xSZXN1bHRDb250ZW50LFxyXG4gICAgICAgICAgdGltZXN0YW1wOiB0b29sUmVzcG9uc2VUaW1lc3RhbXAsXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3QgdG9vbFJlc3VsdEhtYVByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5yZWdpc3RlckhNQVJlc29sdmVyKFxyXG4gICAgICAgICAgICB0b29sUmVzcG9uc2VNc2cudGltZXN0YW1wLmdldFRpbWUoKSxcclxuICAgICAgICAgICAgcmVzb2x2ZSxcclxuICAgICAgICAgICAgcmVqZWN0XHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuaGFzKHRvb2xSZXNwb25zZU1zZy50aW1lc3RhbXAuZ2V0VGltZSgpKSkge1xyXG4gICAgICAgICAgICAgIGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLnJlamVjdEFuZENsZWFySE1BUmVzb2x2ZXIoXHJcbiAgICAgICAgICAgICAgICB0b29sUmVzcG9uc2VNc2cudGltZXN0YW1wLmdldFRpbWUoKSxcclxuICAgICAgICAgICAgICAgIGBITUEgVGltZW91dCBmb3IgdG9vbCByZXN1bHQ6ICR7dG9vbE5hbWV9YFxyXG4gICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0sIDEwMDAwKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBhd2FpdCBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0UGF5bG9hZCh0b29sUmVzcG9uc2VNc2csIHRydWUpO1xyXG4gICAgICAgIGF3YWl0IHRvb2xSZXN1bHRIbWFQcm9taXNlO1xyXG4gICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgX3JlbmRlckZpbmFsQXNzaXN0YW50VGV4dChcclxuICAgIGZpbmFsQ29udGVudDogc3RyaW5nLFxyXG4gICAgcmVzcG9uc2VUaW1lc3RhbXBNczogbnVtYmVyLFxyXG4gICAgcmVxdWVzdFRpbWVzdGFtcElkOiBudW1iZXJcclxuICApOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IGN1cnJlbnRWaWV3SW5zdGFuY2UgPSB0aGlzO1xyXG5cclxuICAgIGlmIChmaW5hbENvbnRlbnQudHJpbSgpKSB7XHJcbiAgICAgIGNvbnN0IGZpbmFsQXNzaXN0YW50TXNnOiBNZXNzYWdlID0ge1xyXG4gICAgICAgIHJvbGU6IFwiYXNzaXN0YW50XCIsXHJcbiAgICAgICAgY29udGVudDogZmluYWxDb250ZW50LFxyXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUocmVzcG9uc2VUaW1lc3RhbXBNcyksXHJcbiAgICAgIH07XHJcbiAgICAgIGNvbnN0IGhtYVByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIucmVnaXN0ZXJITUFSZXNvbHZlcihyZXNwb25zZVRpbWVzdGFtcE1zLCByZXNvbHZlLCByZWplY3QpO1xyXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgaWYgKGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5oYXMocmVzcG9uc2VUaW1lc3RhbXBNcykpIHtcclxuICAgICAgICAgICAgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIucmVqZWN0QW5kQ2xlYXJITUFSZXNvbHZlcihcclxuICAgICAgICAgICAgICByZXNwb25zZVRpbWVzdGFtcE1zLFxyXG4gICAgICAgICAgICAgIFwiSE1BIFRpbWVvdXQgZm9yIGZpbmFsIGFzc2lzdGFudCBtZXNzYWdlXCJcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9LCAxMDAwMCk7XHJcbiAgICAgIH0pO1xyXG4gICAgICBhd2FpdCBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0UGF5bG9hZChmaW5hbEFzc2lzdGFudE1zZywgdHJ1ZSk7XHJcbiAgICAgIGF3YWl0IGhtYVByb21pc2U7XHJcbiAgICB9IGVsc2UgaWYgKCFjdXJyZW50Vmlld0luc3RhbmNlLmN1cnJlbnRBYm9ydENvbnRyb2xsZXI/LnNpZ25hbC5hYm9ydGVkKSB7XHJcbiAgICAgIGNvbnN0IGVtcHR5UmVzcG9uc2VNc2dUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpO1xyXG4gICAgICBjb25zdCBlbXB0eVJlc3BvbnNlTXNnOiBNZXNzYWdlID0ge1xyXG4gICAgICAgIHJvbGU6IFwic3lzdGVtXCIsXHJcbiAgICAgICAgY29udGVudDogXCJBc3Npc3RhbnQgcHJvdmlkZWQgYW4gZW1wdHkgcmVzcG9uc2UuXCIsXHJcbiAgICAgICAgdGltZXN0YW1wOiBlbXB0eVJlc3BvbnNlTXNnVGltZXN0YW1wLFxyXG4gICAgICB9O1xyXG4gICAgICBjb25zdCBobWFQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgIGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLnJlZ2lzdGVySE1BUmVzb2x2ZXIoXHJcbiAgICAgICAgICBlbXB0eVJlc3BvbnNlTXNnLnRpbWVzdGFtcC5nZXRUaW1lKCksXHJcbiAgICAgICAgICByZXNvbHZlLFxyXG4gICAgICAgICAgcmVqZWN0XHJcbiAgICAgICAgKTtcclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgIGlmIChjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuaGFzKGVtcHR5UmVzcG9uc2VNc2cudGltZXN0YW1wLmdldFRpbWUoKSkpIHtcclxuICAgICAgICAgICAgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIucmVqZWN0QW5kQ2xlYXJITUFSZXNvbHZlcihcclxuICAgICAgICAgICAgICBlbXB0eVJlc3BvbnNlTXNnLnRpbWVzdGFtcC5nZXRUaW1lKCksXHJcbiAgICAgICAgICAgICAgXCJITUEgdGltZW91dCBmb3IgZW1wdHkgc3lzIG1zZ1wiXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSwgMTAwMDApO1xyXG4gICAgICB9KTtcclxuICAgICAgYXdhaXQgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIuYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdFBheWxvYWQoZW1wdHlSZXNwb25zZU1zZywgdHJ1ZSk7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgYXdhaXQgaG1hUHJvbWlzZTtcclxuICAgICAgfSBjYXRjaCAoZV9obWEpIHtcclxuICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGN1cnJlbnRWaWV3SW5zdGFuY2UuYWN0aXZlUGxhY2Vob2xkZXI/LnRpbWVzdGFtcCA9PT0gcmVzcG9uc2VUaW1lc3RhbXBNcykge1xyXG4gICAgICBjdXJyZW50Vmlld0luc3RhbmNlLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDtcclxuICAgIH1cclxuICB9XHJcbn1cclxuIl19