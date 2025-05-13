import { __asyncValues, __awaiter } from "tslib";
//OllamaView.ts
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
export class OllamaView extends ItemView {
    // --- Кінець нових властивостей ---
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
        this.temporarilyDisableChatChangedReload = false;
        this.isRegenerating = false; // Новий прапорець
        this.messageAddedResolvers = new Map();
        this.isChatListUpdateScheduled = false;
        this.chatListUpdateTimeoutId = null;
        this.activePlaceholder = null;
        this.currentMessageAddedResolver = null;
        this.isResizing = false;
        this.initialMouseX = 0;
        this.initialSidebarWidth = 0;
        this.cancelGeneration = () => {
            if (this.currentAbortController) {
                this.currentAbortController.abort(); // Це має викликати помилку "aborted by user" в стрімі
                // НЕ встановлюємо this.currentAbortController = null тут, це робиться в finally основного процесу
                // Можливо, потрібно оновити кнопки тут, якщо скасування не з UI кнопки "Stop"
                // Але якщо це скасування з UI, то updateSendButtonState і так спрацює
            }
            else {
            }
            // Важливо: не змінювати isProcessing тут, це має робити основний потік
        };
        this.handleMessageDeleted = (data) => {
            var _a;
            const currentActiveChatId = (_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChatId();
            if (data.chatId !== currentActiveChatId || !this.chatContainer) {
                this.plugin.logger.debug(`handleMessageDeleted: Event ignored (Event chat ${data.chatId} !== active chat ${currentActiveChatId} or container missing).`);
                return;
            }
            const timestampMs = data.timestamp.getTime();
            const selector = `.${CSS_CLASSES.MESSAGE_GROUP}[data-timestamp="${timestampMs}"]`;
            try {
                const messageGroupEl = this.chatContainer.querySelector(selector);
                if (messageGroupEl instanceof HTMLElement) {
                    this.plugin.logger.debug(`handleMessageDeleted: Found message group HTMLElement to remove with selector: ${selector}`);
                    const currentScrollTop = this.chatContainer.scrollTop;
                    const removedHeight = messageGroupEl.offsetHeight;
                    const wasAboveViewport = messageGroupEl.offsetTop < currentScrollTop;
                    messageGroupEl.remove();
                    const initialLength = this.currentMessages.length;
                    this.currentMessages = this.currentMessages.filter(msg => msg.timestamp.getTime() !== timestampMs);
                    this.plugin.logger.debug(`handleMessageDeleted: Updated local message cache from ${initialLength} to ${this.currentMessages.length} messages.`);
                    if (wasAboveViewport) {
                        const newScrollTop = currentScrollTop - removedHeight;
                        this.chatContainer.scrollTop = newScrollTop >= 0 ? newScrollTop : 0;
                        this.plugin.logger.debug(`handleMessageDeleted: Adjusted scroll top from ${currentScrollTop} to ${this.chatContainer.scrollTop} (removed height: ${removedHeight})`);
                    }
                    else {
                        this.chatContainer.scrollTop = currentScrollTop;
                        this.plugin.logger.debug(`handleMessageDeleted: Message was not above viewport, scroll top remains at ${currentScrollTop}`);
                    }
                    if (this.currentMessages.length === 0) {
                        this.showEmptyState();
                    }
                }
                else if (messageGroupEl) {
                    this.plugin.logger.error(`handleMessageDeleted: Found element with selector ${selector}, but it is not an HTMLElement. Forcing reload.`, messageGroupEl);
                    this.loadAndDisplayActiveChat();
                }
                else {
                    this.plugin.logger.warn(`handleMessageDeleted: Could not find message group element with selector: ${selector}. Maybe already removed or timestamp attribute missing?`);
                }
            }
            catch (error) {
                this.plugin.logger.error(`handleMessageDeleted: Error removing message element for timestamp ${timestampMs}:`, error);
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
                this.plugin.logger.error("[updateRolePanelList] Error rendering role panel list:", error);
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
            this.plugin.logger.debug(`[handleRolePanelItemClick] Clicked role: ${roleNameForEvent} (Path: ${newRolePath || "None"})`);
            if (newRolePath !== currentRolePath) {
                const activeChat = yield ((_c = this.plugin.chatManager) === null || _c === void 0 ? void 0 : _c.getActiveChat());
                try {
                    if (activeChat) {
                        this.plugin.logger.debug(`[handleRolePanelItemClick] Setting active role for chat ${activeChat.metadata.id} to: ${newRolePath || "None"}`);
                        yield this.plugin.chatManager.updateActiveChatMetadata({
                            selectedRolePath: newRolePath,
                        });
                    }
                    else {
                        this.plugin.logger.debug(`[handleRolePanelItemClick] No active chat. Setting global default role to: ${newRolePath || "None"}`);
                        this.plugin.settings.selectedRolePath = newRolePath;
                        yield this.plugin.saveSettings();
                        this.plugin.emit("role-changed", roleNameForEvent);
                        (_e = (_d = this.plugin.promptService) === null || _d === void 0 ? void 0 : _d.clearRoleCache) === null || _e === void 0 ? void 0 : _e.call(_d);
                    }
                }
                catch (error) {
                    this.plugin.logger.error(`[handleRolePanelItemClick] Error setting role to ${newRolePath}:`, error);
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
                this.plugin.logger.error("[OllamaView] Unexpected error during input translation call:", error);
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
            this.plugin.logger.debug(`[handleRenameChatClick] Initiating rename for chat ${chatId} (current name: "${currentName}")`);
            (_b = this.dropdownMenuManager) === null || _b === void 0 ? void 0 : _b.closeMenu();
            if (!chatId || currentName === null) {
                this.plugin.logger.error("[handleRenameChatClick] Failed to determine chat ID or current name.");
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
            const originalName = activeChat.metadata.name;
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
                                this.plugin.logger.error("Failed to get folder even after creation attempt:", targetFolderPath);
                                new Notice(`Error creating export folder. Saving to vault root.`);
                                targetFolder = this.app.vault.getRoot();
                            }
                        }
                        catch (err) {
                            this.plugin.logger.error("Error creating export folder:", err);
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
                    this.plugin.logger.error("Failed to determine a valid target folder for export.");
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
                this.plugin.logger.error("Error exporting chat:", error);
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
            catch (error) {
                this.plugin.logger.error("Error handling model change notification:", error);
            }
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
                this.plugin.logger.error("Error handling role change notification:", error);
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
        // ... (решта вашого класу OllamaView) ...
        this.handleMessagesCleared = (chatId) => {
            var _a;
            if (chatId === ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChatId())) {
                console.log("[OllamaView] Messages cleared event received.");
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
        // Модифікуємо handleActiveChatChanged
        // src/OllamaView.ts
        this.handleChatListUpdated = () => {
            this.scheduleSidebarChatListUpdate();
            if (this.dropdownMenuManager) {
                this.dropdownMenuManager
                    .updateChatListIfVisible() // Це для випадаючого меню, не для сайдбару
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
                    this.plugin.logger.error("Failed to update chat temperature:", error);
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
                            this.plugin.logger.warn(`[updateChatPanelList] Invalid date parsed for chat ${chatMeta.id}, lastModified: ${chatMeta.lastModified}`);
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
                this.plugin.logger.error("[updateChatPanelList] Error rendering chat panel list:", error);
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
        // Допоміжна функція в ChatManager для додавання повідомлення з усіма полями (щоб уникнути дублювання логіки)
        // Приклад, як це може виглядати:
        // async addMessageToActiveChatPayload(messagePayload: Message, emitEvent: boolean = true): Promise<void> {
        //    // ... логіка додавання messagePayload до активного чату ...
        //    // ... збереження чату ...
        //    if (emitEvent) {
        //        this.plugin.emit("message-added", { chatId: this.activeChatId, message: messagePayload });
        //    }
        // }
        // А ваш існуючий addMessageToActiveChat може викликати цей новий метод.
        // async addMessageToActiveChat(role: MessageRole, content: string, timestamp: Date, emitEvent: boolean = true, tool_calls?: ToolCall[], tool_call_id?: string, name?: string): Promise<void> {
        //   const message: Message = { role, content, timestamp, tool_calls, tool_call_id, name };
        //   await this.addMessageToActiveChatPayload(message, emitEvent);
        // }
        // Переконайтеся, що у вас є метод getActiveChatOrFail в ChatManager або замініть його на getActiveChat і перевіряйте на null
        // public async getActiveChatOrFail(): Promise<Chat> {
        //   const chat = await this.getActiveChat();
        //   if (!chat) {
        //     this.plugin.logger.error("[ChatManager] getActiveChatOrFail: No active chat found!");
        //     throw new Error("No active chat found");
        //   }
        //   return chat;
        // }
        this.handleMenuButtonClick = (e) => {
            var _a;
            (_a = this.dropdownMenuManager) === null || _a === void 0 ? void 0 : _a.toggleMenu(e);
        };
        // --- ДОДАНО: Методи для перетягування ---
        this.onDragStart = (event) => {
            var _a;
            if (event.button !== 0)
                return; // Реагуємо тільки на ліву кнопку
            this.isResizing = true;
            this.initialMouseX = event.clientX;
            // Перевіряємо наявність sidebarRootEl перед доступом до offsetWidth
            this.initialSidebarWidth = ((_a = this.sidebarRootEl) === null || _a === void 0 ? void 0 : _a.offsetWidth) || 250; // Запасне значення
            event.preventDefault();
            event.stopPropagation();
            // Додаємо глобальні слухачі ДОКУМЕНТА
            document.addEventListener("mousemove", this.boundOnDragMove, { capture: true }); // Використовуємо capture
            document.addEventListener("mouseup", this.boundOnDragEnd, { capture: true });
            document.body.style.cursor = "ew-resize";
            document.body.classList.add(CSS_CLASS_RESIZING);
        };
        this.onDragMove = (event) => {
            if (!this.isResizing || !this.sidebarRootEl)
                return;
            // Використовуємо requestAnimationFrame для плавності
            requestAnimationFrame(() => {
                // Додаткова перевірка всередині rAF, оскільки стан міг змінитися
                if (!this.isResizing || !this.sidebarRootEl)
                    return;
                const currentMouseX = event.clientX;
                const deltaX = currentMouseX - this.initialMouseX;
                let newWidth = this.initialSidebarWidth + deltaX;
                // Обмеження ширини
                const minWidth = 150; // Мінімальна ширина
                const containerWidth = this.contentEl.offsetWidth;
                // Максимальна ширина - 60% контейнера, але не менше ніж minWidth + 50px
                const maxWidth = Math.max(minWidth + 50, containerWidth * 0.6);
                if (newWidth < minWidth)
                    newWidth = minWidth;
                if (newWidth > maxWidth)
                    newWidth = maxWidth;
                // Застосовуємо стилі напряму
                this.sidebarRootEl.style.width = `${newWidth}px`;
                this.sidebarRootEl.style.minWidth = `${newWidth}px`; // Важливо для flex-shrink
                // Оновлення CSS змінної (опціонально, якщо ви її використовуєте для ширини)
                // this.contentEl.style.setProperty('--ai-forge-sidebar-width', `${newWidth}px`);
            });
        };
        this.onDragEnd = (event) => {
            // Перевіряємо, чи ми дійсно перетягували
            if (!this.isResizing)
                return;
            this.isResizing = false;
            // Видаляємо глобальні слухачі з документа
            document.removeEventListener("mousemove", this.boundOnDragMove, { capture: true });
            document.removeEventListener("mouseup", this.boundOnDragEnd, { capture: true });
            document.body.style.cursor = ""; // Повертаємо курсор
            document.body.classList.remove(CSS_CLASS_RESIZING);
            this.saveWidthDebounced();
        };
        this.scheduleSidebarChatListUpdate = (delay = 50) => {
            if (this.chatListUpdateTimeoutId) {
                clearTimeout(this.chatListUpdateTimeoutId);
                // Якщо вже заплановано, не потрібно встановлювати isChatListUpdateScheduled = true знову
            }
            else {
                // Якщо не було заплановано, і це перший запит у поточній "пачці"
                if (this.isChatListUpdateScheduled) {
                    // this.plugin.logger.debug("[OllamaView.scheduleSidebarChatListUpdate] Update already scheduled and pending, deferring new direct call.");
                    return; // Якщо вже є активний pending, чекаємо його виконання
                }
                this.isChatListUpdateScheduled = true; // Позначаємо, що оновлення заплановано
            }
            // this.plugin.logger.debug(`[OllamaView.scheduleSidebarChatListUpdate] Scheduling updateChatList with delay: ${delay}ms. Was pending: ${!!this.chatListUpdateTimeoutId}`);
            this.chatListUpdateTimeoutId = setTimeout(() => {
                var _a;
                // this.plugin.logger.debug("[OllamaView.scheduleSidebarChatListUpdate] Timeout fired. Executing updateChatList.");
                if ((_a = this.sidebarManager) === null || _a === void 0 ? void 0 : _a.isSectionVisible("chats")) {
                    this.sidebarManager
                        .updateChatList()
                        .catch(e => this.plugin.logger.error("Error updating chat panel list via scheduleSidebarChatListUpdate:", e));
                }
                // Скидаємо прапорці після фактичного виконання
                this.chatListUpdateTimeoutId = null;
                this.isChatListUpdateScheduled = false;
                //  this.plugin.logger.debug("[OllamaView.scheduleSidebarChatListUpdate] Executed and flags reset.");
            }, delay);
        };
        // Переконайтесь, що scheduleSidebarChatListUpdate визначено у класі
        // та інші залежності (Logger, CSS класи, типи) імпортовано/визначено.
        this.handleActiveChatChanged = (data) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            this.plugin.logger.error(`[OllamaView] handleActiveChatChanged: Received event. New activeId: ${data.chatId}, Prev activeId: ${this.lastProcessedChatId}. Chat object in event is ${data.chat ? "present" : "null"}.`);
            // Перевірка на регенерацію
            if (this.isRegenerating && data.chatId === this.plugin.chatManager.getActiveChatId()) {
                this.plugin.logger.warn(`[OllamaView] handleActiveChatChanged: Ignoring event for chat ${data.chatId} because regeneration is in progress.`);
                this.lastProcessedChatId = data.chatId; // Важливо оновити ID
                return;
            }
            const chatSwitched = data.chatId !== this.lastProcessedChatId;
            this.plugin.logger.debug(`[OllamaView] handleActiveChatChanged: Chat switched: ${chatSwitched}.`);
            let metadataWasUpdatedByLoad = false; // Прапорець для результату loadAndDisplayActiveChat
            // Умова для повного перезавантаження UI
            if (chatSwitched || (data.chatId !== null && data.chat === null)) {
                this.plugin.logger.debug(`[OllamaView] handleActiveChatChanged: FULL CHAT RELOAD condition met (switched: ${chatSwitched}, data.chat === null: ${data.chat === null}).`);
                this.lastProcessedChatId = data.chatId; // Оновлюємо ID поточного активного чату
                // Викликаємо loadAndDisplayActiveChat і зберігаємо результат
                const result = yield this.loadAndDisplayActiveChat();
                metadataWasUpdatedByLoad = result.metadataUpdated;
            }
            // Умова для "легкого" оновлення UI (коли ID не змінився, але дані чату могли)
            else if (data.chatId !== null && data.chat !== null) {
                this.plugin.logger.debug(`[OllamaView] handleActiveChatChanged: Lighter update path (chat ID same, chat data provided).`);
                this.lastProcessedChatId = data.chatId; // Оновлюємо ID
                const chat = data.chat;
                // Оновлюємо лише ті елементи UI, що відображають метадані активного чату
                const currentRolePath = (_b = (_a = chat.metadata) === null || _a === void 0 ? void 0 : _a.selectedRolePath) !== null && _b !== void 0 ? _b : this.plugin.settings.selectedRolePath;
                const currentRoleName = yield this.findRoleNameByPath(currentRolePath);
                const currentModelName = ((_c = chat.metadata) === null || _c === void 0 ? void 0 : _c.modelName) || this.plugin.settings.modelName;
                const currentTemperature = (_e = (_d = chat.metadata) === null || _d === void 0 ? void 0 : _d.temperature) !== null && _e !== void 0 ? _e : this.plugin.settings.temperature;
                this.updateModelDisplay(currentModelName);
                this.updateRoleDisplay(currentRoleName);
                this.updateInputPlaceholder(currentRoleName);
                this.updateTemperatureIndicator(currentTemperature);
                // metadataWasUpdatedByLoad залишається false, оскільки loadAndDisplayActiveChat не викликався
            }
            // Випадок, коли активний чат став null
            else if (data.chatId === null) {
                this.plugin.logger.debug(`[OllamaView] handleActiveChatChanged: Active chat is now null.`);
                this.lastProcessedChatId = null; // Оновлюємо ID
                this.clearDisplayAndState(); // Очищаємо UI
                // metadataWasUpdatedByLoad залишається false
            }
            else {
                // Неочікувана комбінація параметрів
                this.plugin.logger.warn(`[OllamaView] handleActiveChatChanged: Unhandled case? chatId=${data.chatId}, chat=${data.chat}, chatSwitched=${chatSwitched}`);
                this.lastProcessedChatId = data.chatId; // Оновлюємо ID про всяк випадок
                // metadataWasUpdatedByLoad залишається false
            }
            // --- Умовне планування оновлення списку чатів ---
            // Плануємо оновлення, ТІЛЬКИ ЯКЩО loadAndDisplayActiveChat НЕ оновлював метадані
            // (бо якщо оновлював, подія 'chat-list-updated' сама викличе оновлення списку),
            // АБО якщо це був шлях "легкого" оновлення чи скидання на null.
            if (!metadataWasUpdatedByLoad) {
                this.plugin.logger.debug(`[OllamaView.handleActiveChatChanged] Metadata was NOT updated by load (or light/null path); Scheduling sidebar list update.`);
                this.scheduleSidebarChatListUpdate(); // Використовуємо планувальник
            }
            else {
                this.plugin.logger.debug(`[OllamaView.handleActiveChatChanged] Metadata WAS updated by load; Relying on chat-list-updated event to schedule list update.`);
                // Не викликаємо планувальник звідси, чекаємо на handleChatListUpdated
            }
            // --- Кінець умовного планування ---
            // --- Оновлення інших частин UI (незалежно від шляху) ---
            // Оновлюємо список ролей у сайдбарі, якщо він видимий
            if ((_f = this.sidebarManager) === null || _f === void 0 ? void 0 : _f.isSectionVisible("roles")) {
                this.plugin.logger.debug(`[OllamaView] handleActiveChatChanged: Triggering sidebar role list update.`);
                this.sidebarManager
                    .updateRoleList()
                    .catch(e => this.plugin.logger.error("Error updating role panel list in handleActiveChatChanged:", e));
            }
            // Оновлюємо список ролей у випадаючому меню
            if (this.dropdownMenuManager) {
                this.plugin.logger.debug(`[OllamaView] handleActiveChatChanged: Triggering dropdown role list update check.`);
                this.dropdownMenuManager
                    .updateRoleListIfVisible()
                    .catch(e => this.plugin.logger.error("Error updating role dropdown list in handleActiveChatChanged:", e));
            }
            this.plugin.logger.debug(`[OllamaView] handleActiveChatChanged: Finished processing event for chatId: ${data.chatId}. Metadata updated by load: ${metadataWasUpdatedByLoad}`);
        }); // --- Кінець методу handleActiveChatChanged ---
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
                // Зберігаємо, тільки якщо ширина дійсна і змінилася
                if (newWidth > 0 && newWidth !== this.plugin.settings.sidebarWidth) {
                    this.plugin.settings.sidebarWidth = newWidth;
                    // Не використовуємо await, debounce сам керує асинхронністю
                    this.plugin.saveSettings();
                }
            }
        }, 800); // Затримка 800 мс після останньої зміни
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
    // src/OllamaView.ts
    onOpen() {
        return __awaiter(this, void 0, void 0, function* () {
            // 
            // Спочатку створюємо UI, включаючи роздільник
            this.createUIElements();
            // --- Застосовуємо збережену/дефолтну ширину сайдбару ---
            const savedWidth = this.plugin.settings.sidebarWidth;
            if (this.sidebarRootEl && savedWidth && typeof savedWidth === "number" && savedWidth > 50) {
                this.sidebarRootEl.style.width = `${savedWidth}px`;
                this.sidebarRootEl.style.minWidth = `${savedWidth}px`;
            }
            else if (this.sidebarRootEl) {
                // Встановлюємо дефолтну ширину, якщо збереженої немає або вона невалідна
                let defaultWidth = 250; // Значення за замовчуванням
                try {
                    // Спробуємо прочитати з CSS змінної
                    const cssVarWidth = getComputedStyle(this.sidebarRootEl).getPropertyValue("--ai-forge-sidebar-width").trim();
                    if (cssVarWidth && cssVarWidth.endsWith("px")) {
                        const parsedWidth = parseInt(cssVarWidth, 10);
                        if (!isNaN(parsedWidth) && parsedWidth > 50) {
                            defaultWidth = parsedWidth;
                        }
                    }
                }
                catch (e) {
                    this.plugin.logger.warn("[OllamaView] Could not read default sidebar width from CSS variable.", e);
                }
                this.sidebarRootEl.style.width = `${defaultWidth}px`;
                this.sidebarRootEl.style.minWidth = `${defaultWidth}px`;
                if (!savedWidth) {
                }
            }
            // --- Кінець застосування ширини ---
            // Оновлюємо початкові елементи UI (плейсхолдер, роль, модель...)
            // Краще робити це ПІСЛЯ loadAndDisplayActiveChat, щоб мати актуальні дані
            // Однак, щоб уникнути "миготіння" можна встановити початкові значення з налаштувань
            try {
                // Беремо значення з глобальних налаштувань як початкові
                const initialRolePath = this.plugin.settings.selectedRolePath;
                const initialRoleName = yield this.findRoleNameByPath(initialRolePath); // Спробуємо знайти ім'я
                const initialModelName = this.plugin.settings.modelName;
                const initialTemperature = this.plugin.settings.temperature;
                // Оновлюємо відповідні елементи UI цими початковими значеннями
                this.updateInputPlaceholder(initialRoleName);
                this.updateRoleDisplay(initialRoleName);
                this.updateModelDisplay(initialModelName);
                this.updateTemperatureIndicator(initialTemperature);
                // this.plugin.logger.debug("[OllamaView] Initial UI elements updated in onOpen (using defaults/settings).");
            }
            catch (error) {
                this.plugin.logger.error("[OllamaView] Error during initial UI element update in onOpen:", error);
            }
            // Прив'язуємо всі необхідні обробники подій DOM та плагіна
            this.attachEventListeners(); // Включає слухач для роздільника сайдбару
            // Налаштовуємо поле вводу
            this.autoResizeTextarea(); // Встановлюємо початкову висоту
            this.updateSendButtonState(); // Встановлюємо початковий стан кнопки Send
            // Завантажуємо активний чат та обробляємо потенційне оновлення метаданих
            try {
                this.plugin.logger.debug("[OllamaView] onOpen: Calling loadAndDisplayActiveChat...");
                // loadAndDisplayActiveChat завантажить контент, оновить елементи типу model/role display в цій View,
                // може виправити метадані (що викличе події 'chat-list-updated' -> scheduleSidebarChatListUpdate),
                // але БІЛЬШЕ НЕ ОНОВЛЮЄ САЙДБАР НАПРЯМУ.
                yield this.loadAndDisplayActiveChat();
                // --- ВИДАЛЕНО ЯВНЕ ОНОВЛЕННЯ СПИСКІВ САЙДБАРУ ---
                // Тепер покладаємося на події:
                // 1. 'active-chat-changed', згенерована під час ChatManager.initialize(), буде оброблена handleActiveChatChanged,
                //    який викличе scheduleSidebarChatListUpdate.
                // 2. 'chat-list-updated', якщо loadAndDisplayActiveChat виправив метадані, буде оброблена handleChatListUpdated,
                //    який також викличе scheduleSidebarChatListUpdate.
                // Механізм scheduleSidebarChatListUpdate об'єднає ці виклики.
                this.plugin.logger.debug("[OllamaView] onOpen: Skipping explicit sidebar panel update. Relying on event handlers and scheduler.");
            }
            catch (error) {
                // Обробка помилок, що могли виникнути під час loadAndDisplayActiveChat
                this.plugin.logger.error("[OllamaView] Error during initial chat load or processing in onOpen:", error);
                this.showEmptyState(); // Показуємо порожній стан чату при помилці
                // Навіть при помилці тут, подія 'active-chat-changed' з ChatManager.initialize (якщо вона була)
                // вже мала викликати оновлення сайдбару через handleActiveChatChanged -> scheduleSidebarChatListUpdate.
            }
            // Встановлюємо фокус на поле вводу з невеликою затримкою
            setTimeout(() => {
                // Додаткова перевірка, чи view все ще активне/існує і видиме користувачу
                if (this.inputEl && this.leaf.view === this && document.body.contains(this.inputEl)) {
                    this.inputEl.focus();
                }
                else {
                    this.plugin.logger.debug("[OllamaView] Input focus skipped in onOpen timeout (view not active/visible or input missing).");
                }
            }, 150); // Затримка може бути потрібна, щоб елементи встигли відрендеритися
            // Оновлюємо висоту textarea про всяк випадок (наприклад, якщо початкове значення було довгим)
            if (this.inputEl) {
                this.inputEl.dispatchEvent(new Event("input"));
            }
        });
    } // --- Кінець методу onOpen ---
    onClose() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
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
            if (this.scrollTimeout)
                clearTimeout(this.scrollTimeout);
            if (this.resizeTimeout)
                clearTimeout(this.resizeTimeout);
            (_a = this.sidebarManager) === null || _a === void 0 ? void 0 : _a.destroy(); // Викликаємо destroy для менеджера сайдбару
            (_b = this.dropdownMenuManager) === null || _b === void 0 ? void 0 : _b.destroy(); // Викликаємо destroy для менеджера меню
        });
    }
    createUIElements() {
        this.contentEl.empty(); // Очищуємо основний контейнер View
        // Створюємо головний flex-контейнер для сайдбару та області чату
        const flexContainer = this.contentEl.createDiv({ cls: "ollama-container" }); // Використовуємо CSS_CLASS_CONTAINER
        // Визначаємо, де має бути View і чи це десктоп
        const isSidebarLocation = !this.plugin.settings.openChatInTab;
        const isDesktop = Platform.isDesktop;
        // 1. Створюємо Сайдбар і ЗБЕРІГАЄМО ПОСИЛАННЯ на кореневий елемент
        this.sidebarManager = new SidebarManager(this.plugin, this.app, this);
        this.sidebarRootEl = this.sidebarManager.createSidebarUI(flexContainer); // Зберігаємо посилання
        // Встановлюємо видимість внутрішнього сайдбара
        const shouldShowInternalSidebar = isDesktop && !isSidebarLocation;
        if (this.sidebarRootEl) {
            // Додаємо або видаляємо клас для приховування/показу через CSS
            this.sidebarRootEl.classList.toggle("internal-sidebar-hidden", !shouldShowInternalSidebar);
            this.plugin.logger.debug(`[OllamaView] Internal sidebar visibility set (hidden: ${!shouldShowInternalSidebar}). Classes: ${this.sidebarRootEl.className}`);
        }
        else {
        }
        // --- ДОДАНО: Створюємо Роздільник між сайдбаром та чатом ---
        this.resizerEl = flexContainer.createDiv({ cls: CSS_CLASS_RESIZER_HANDLE });
        this.resizerEl.title = "Drag to resize sidebar";
        // Приховуємо роздільник разом із сайдбаром
        this.resizerEl.classList.toggle("internal-sidebar-hidden", !shouldShowInternalSidebar);
        this.plugin.logger.debug(`[OllamaView] Resizer element created (hidden: ${!shouldShowInternalSidebar}).`);
        // --- КІНЕЦЬ ДОДАНОГО ---
        // 2. Створюємо Основну Область Чату
        this.mainChatAreaEl = flexContainer.createDiv({ cls: "ollama-main-chat-area" }); // Використовуємо CSS_MAIN_CHAT_AREA
        // Додаємо клас, якщо сайдбар приховано, щоб область чату займала всю ширину
        this.mainChatAreaEl.classList.toggle("full-width", !shouldShowInternalSidebar);
        // --- Створення решти елементів UI всередині mainChatAreaEl ---
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
        }); // Використовуємо константу CSS_CLASSES.DANGER_OPTION
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
        this.updateToggleLocationButton(); // Встановлює іконку/title
        this.dropdownMenuManager = new DropdownMenuManager(this.plugin, this.app, this, inputContainer, isSidebarLocation, isDesktop);
        this.dropdownMenuManager.createMenuUI();
    }
    attachEventListeners() {
        var _a;
        // --- ДОДАНО: Слухач для роздільника ---
        if (this.resizerEl) {
            // Додаємо слухач mousedown до роздільника
            this.registerDomEvent(this.resizerEl, "mousedown", this.onDragStart);
        }
        else {
            this.plugin.logger.error("Resizer element (resizerEl) not found during listener attachment!");
        }
        // ---
        // --- Реєстрація всіх інших слухачів як раніше ---
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
        this.register(this.plugin.on("ollama-connection-error", message => {
            /* Можливо, показати щось у View? */
        }));
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
            var _a, _b, _c;
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
                        // AssistantMessageRenderer має сам вирішувати, як рендерити message.content,
                        // що може містити <tool_call> теги або звичайний текст.
                        // Також він може перевіряти message.tool_calls для відображення індикатора використання інструменту.
                        renderer = new AssistantMessageRenderer(this.app, this.plugin, message, this);
                        break;
                    case "system":
                        renderer = new SystemMessageRenderer(this.app, this.plugin, message, this);
                        break;
                    case "error":
                        this.handleErrorMessage(message);
                        return;
                    case "tool":
                        this.plugin.logger.info(`[addMessageStandard] Creating ToolMessageRenderer for tool: ${message.name}, Content preview: "${message.content.substring(0, 70)}..."`);
                        renderer = new ToolMessageRenderer(this.app, this.plugin, message, this);
                        break;
                    default:
                        // Допомагає TypeScript відстежити всі варіанти, якщо message.role є строгим union
                        // const _exhaustiveCheck: never = message.role; 
                        this.plugin.logger.warn(`[addMessageStandard] Unknown message role encountered in switch: '${message === null || message === void 0 ? void 0 : message.role}'. Content: "${message.content.substring(0, 70)}"`);
                        const unknownRoleGroup = (_b = this.chatContainer) === null || _b === void 0 ? void 0 : _b.createDiv({ cls: CSS_CLASSES.MESSAGE_GROUP });
                        if (unknownRoleGroup && this.chatContainer) {
                            RendererUtils.renderAvatar(this.app, this.plugin, unknownRoleGroup, false);
                            const wrapper = unknownRoleGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
                            const msgBubble = wrapper.createDiv({ cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.SYSTEM_MESSAGE}` });
                            msgBubble.createDiv({ cls: CSS_CLASSES.SYSTEM_MESSAGE_TEXT || "system-message-text", text: `Internal Plugin Error: Unknown message role received by renderer: '${message.role}'. Message content was logged.` });
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
                    return; // Якщо рендерер не створено, нічого додавати
                }
                if (messageGroupEl && this.chatContainer) {
                    this.chatContainer.appendChild(messageGroupEl);
                    this.lastMessageElement = messageGroupEl;
                    if (!messageGroupEl.isConnected) {
                        this.plugin.logger.error(`[addMessageStandard] CRITICAL: Message group node for role ${message.role} was not connected to DOM after append!`);
                    }
                    messageGroupEl.classList.add(CSS_CLASSES.MESSAGE_ARRIVING || "message-arriving");
                    setTimeout(() => messageGroupEl === null || messageGroupEl === void 0 ? void 0 : messageGroupEl.classList.remove(CSS_CLASSES.MESSAGE_ARRIVING || "message-arriving"), 500);
                    const isUserMessage = message.role === "user";
                    if (!isUserMessage && this.userScrolledUp && this.newMessagesIndicatorEl) {
                        this.newMessagesIndicatorEl.classList.add(CSS_CLASSES.VISIBLE || "visible");
                    }
                    else if (!this.userScrolledUp) {
                        const scrollDelay = this.isProcessing && message.role === 'assistant' ? 30 : (isUserMessage ? 50 : 100);
                        // Якщо це повідомлення інструменту, воно не є "відповіддю асистента" в тому сенсі, що воно не генерується LLM в реальному часі.
                        // Тому, можливо, не варто форсувати прокрутку так агресивно, як для відповіді асистента.
                        const forceScroll = (this.isProcessing && message.role === 'assistant') || message.role === 'tool' ? true : !isUserMessage;
                        this.guaranteedScrollToBottom(scrollDelay, forceScroll);
                    }
                    setTimeout(() => this.updateScrollStateAndIndicators(), 150);
                }
                else if (renderer) {
                }
            }
            catch (error) {
                this.plugin.logger.error(`[addMessageStandard] Unexpected error during message rendering. Role: ${(message === null || message === void 0 ? void 0 : message.role) || "unknown"}, Content Preview: "${((_c = message === null || message === void 0 ? void 0 : message.content) === null || _c === void 0 ? void 0 : _c.substring(0, 100)) || "N/A"}"`, error);
                try {
                    const errorNotice = `Failed to render message (Role: ${message === null || message === void 0 ? void 0 : message.role}). Check console for details.`;
                    // Створюємо об'єкт Message, сумісний з ErrorMessageRenderer або handleErrorMessage
                    const errorMsgObject = {
                        role: 'error',
                        content: errorNotice,
                        timestamp: message.timestamp || new Date() // Використовуємо timestamp оригінального повідомлення, якщо є
                    };
                    this.handleErrorMessage(errorMsgObject);
                }
                catch (criticalError) {
                    this.plugin.logger.error("[addMessageStandard] CRITICAL: Failed even to display a render error message.", criticalError);
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
    // private updateSendButtonState(): void {
    //   if (!this.inputEl || !this.sendButton) return;
    //   const isDisabled = this.inputEl.value.trim() === "" || this.isProcessing || this.currentAbortController !== null;
    //   this.sendButton.disabled = isDisabled;
    //   this.sendButton.classList.toggle(CSS_CLASS_DISABLED, isDisabled);
    //   this.stopGeneratingButton?.toggle(this.currentAbortController !== null);
    // }
    updateSendButtonState() {
        if (!this.inputEl || !this.sendButton || !this.stopGeneratingButton) {
            return;
        }
        const generationInProgress = this.currentAbortController !== null;
        const isInputEmpty = this.inputEl.value.trim() === "";
        if (generationInProgress) {
            this.stopGeneratingButton.show();
            this.sendButton.hide();
            this.sendButton.disabled = true; // Завжди вимикаємо Send, коли йде генерація
        }
        else {
            this.stopGeneratingButton.hide();
            this.sendButton.show();
            // Кнопка Send вимкнена, якщо поле порожнє або йде якась інша обробка (isProcessing)
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
    parseTextForToolCall(text) {
        const openTag = "<tool_call>";
        const closeTag = "</tool_call>";
        // Шукаємо перше входження відкриваючого тегу та останнє закриваючого,
        // щоб охопити весь потенційний блок JSON, навіть якщо є вкладеність або зайвий текст.
        const openTagIndex = text.indexOf(openTag);
        const closeTagIndex = text.lastIndexOf(closeTag);
        if (openTagIndex !== -1 && closeTagIndex !== -1 && closeTagIndex > openTagIndex) {
            // Витягуємо рядок JSON між першим <tool_call> та останнім </tool_call>
            const jsonString = text.substring(openTagIndex + openTag.length, closeTagIndex).trim();
            // Опціональна перевірка на зайвий текст поза основним блоком тегів.
            // Це може вказувати на те, що модель не ідеально дотримується інструкції "ONLY".
            const textBeforeFirstOpenTag = text.substring(0, openTagIndex).trim();
            const textAfterLastCloseTag = text.substring(closeTagIndex + closeTag.length).trim();
            if (textBeforeFirstOpenTag !== "" || textAfterLastCloseTag !== "") {
                this.plugin.logger.warn("[OllamaView.parseTextForToolCall] Text found outside the primary <tool_call>...</tool_call> block. Model might not be strictly following 'ONLY JSON' instruction. Attempting to parse the extracted JSON content.", { textBefore: textBeforeFirstOpenTag, textAfter: textAfterLastCloseTag, extractedJson: jsonString });
            }
            try {
                const parsedJson = JSON.parse(jsonString);
                // Перевіряємо структуру розпарсеного JSON
                if (parsedJson && typeof parsedJson.name === 'string' &&
                    (typeof parsedJson.arguments === 'object' || parsedJson.arguments === undefined || parsedJson.arguments === null) // arguments можуть бути відсутніми або null
                ) {
                    return { name: parsedJson.name, arguments: parsedJson.arguments || {} }; // Повертаємо {} якщо arguments відсутні
                }
                else {
                    this.plugin.logger.error("[OllamaView.parseTextForToolCall] Parsed JSON does not match expected structure (name: string, arguments: object). Actual:", parsedJson);
                }
            }
            catch (e) {
                this.plugin.logger.error(`[OllamaView.parseTextForToolCall] Failed to parse JSON from tool_call content. JSON string was: "${jsonString}". Error:`, e.message);
            }
        }
        return null;
    }
    setLoadingState(isLoading) {
        const oldIsProcessing = this.isProcessing;
        // ВАЖЛИВО: Спочатку змінюємо isProcessing
        this.isProcessing = isLoading;
        // this.plugin.logger.debug(
        //   `[OllamaView] setLoadingState: isProcessing set to ${
        //     this.isProcessing
        //   } (was ${oldIsProcessing}). isLoading param: ${isLoading}. currentAbortController is ${
        //     this.currentAbortController ? "NOT null" : "null"
        //   }`
        // );
        if (this.inputEl)
            this.inputEl.disabled = isLoading;
        // Потім викликаємо оновлення кнопок, яке тепер буде використовувати новий стан isProcessing
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
                    button.style.display = "none"; // Приховуємо кнопки "Show More" під час завантаження
                });
            }
            else {
                // Коли завантаження завершено, перевіряємо, чи потрібно показувати кнопки "Show More"
                this.checkAllMessagesForCollapsing();
            }
        }
    }
    isSidebarSectionVisible(type) {
        const headerEl = type === "chats" ? this.chatPanelHeaderEl : this.rolePanelHeaderEl;
        return (headerEl === null || headerEl === void 0 ? void 0 : headerEl.getAttribute("data-collapsed")) === "false";
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
                this.plugin.logger.info(`User confirmed deletion for message timestamp: ${messageToDelete.timestamp.toISOString()} in chat ${activeChat.metadata.id}`);
                try {
                    const deleteSuccess = yield this.plugin.chatManager.deleteMessageByTimestamp(activeChat.metadata.id, messageToDelete.timestamp);
                    if (deleteSuccess) {
                        new Notice("Message deleted.");
                    }
                    else {
                        new Notice("Failed to delete message.");
                        this.plugin.logger.warn(`deleteMessageByTimestamp returned false for chat ${activeChat.metadata.id}, timestamp ${messageToDelete.timestamp.toISOString()}`);
                    }
                }
                catch (error) {
                    this.plugin.logger.error(`Error deleting message (chat ${activeChat.metadata.id}, timestamp ${messageToDelete.timestamp.toISOString()}):`, error);
                    new Notice("An error occurred while deleting the message.");
                }
            })).open();
        });
    }
    // Переконайтеся, що updateSendButtonState виглядає так:
    // private updateSendButtonState(): void {
    //   if (!this.inputEl || !this.sendButton || !this.stopGeneratingButton) return;
    //   const generationInProgress = this.currentAbortController !== null;
    //   // isProcessing встановлюється/скидається через setLoadingState
    //   // Кнопка Send вимкнена, якщо поле порожнє, або йде обробка (isProcessing), або йде генерація (generationInProgress)
    //   const isSendDisabled = this.inputEl.value.trim() === "" || this.isProcessing || generationInProgress;
    //   this.sendButton.disabled = isSendDisabled;
    //   this.sendButton.classList.toggle(CSS_CLASSES.DISABLED, isSendDisabled);
    //   // Кнопка Stop активна (видима), тільки якщо є активний AbortController (тобто йде генерація)
    //   this.stopGeneratingButton.toggle(generationInProgress);
    //   // Кнопка Send ховається, якщо активна кнопка Stop
    //   this.sendButton.toggle(!generationInProgress);
    // }
    // Переконайтеся, що handleMessageAdded очищує this.currentMessageAddedResolver НА ПОЧАТКУ
    // і викликає localResolver В КІНЦІ свого блоку try або в catch/finally.
    // Приклад структури handleMessageAdded (переконайтеся, що ваша версія схожа):
    // private async handleMessageAdded(data: { chatId: string; message: Message }): Promise<void> {
    //   const localResolver = this.currentMessageAddedResolver;
    //   this.currentMessageAddedResolver = null;
    //   try {
    //     // ... ваша основна логіка обробки повідомлення ...
    //     // ... якщо це оновлення плейсхолдера, this.activePlaceholder = null; всередині ...
    //   } catch (outerError: any) {
    //     // ... обробка помилок ...
    //   } finally {
    //     if (localResolver) {
    //       localResolver(); // Викликаємо resolver тут, щоб сигналізувати про завершення
    //     }
    //     // ... логування виходу ...
    //   }
    // }
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
                this.plugin.logger.error("[handleTranslateClick] Error during text preprocessing:", error);
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
                    this.plugin.logger.error("[handleTranslateClick] contentEl is null or not connected to DOM when translation arrived.");
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
                this.plugin.logger.error("[OllamaView] Unexpected error during message translation call:", error);
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
            const bufferToBase64 = (buffer) => {
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
        this.speechWorker.onerror = error => {
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
                this.mediaRecorder.onerror = event => {
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
                    this.plugin.logger.warn(`[findRoleNameByPath] Role not found for path "${rolePath}". Using derived name: "${fileName || "Unknown"}"`);
                    return fileName || "Unknown Role";
                }
            }
            catch (error) {
                this.plugin.logger.error(`[findRoleNameByPath] Error fetching roles for path "${rolePath}":`, error);
                return "Error";
            }
        });
    }
    toggleSidebarSection(clickedHeaderEl) {
        return __awaiter(this, void 0, void 0, function* () {
            const sectionType = clickedHeaderEl.getAttribute("data-section-type");
            const isCurrentlyCollapsed = clickedHeaderEl.getAttribute("data-collapsed") === "true";
            const iconEl = clickedHeaderEl.querySelector(`.${CSS_SIDEBAR_SECTION_ICON}`);
            let contentEl = null;
            let updateFunction = null;
            let otherHeaderEl = null;
            let otherContentEl = null;
            let otherSectionType = null;
            const collapseIcon = "lucide-folder";
            const expandIcon = "lucide-folder-open";
            const expandedClass = "is-expanded";
            if (sectionType === "chats") {
                contentEl = this.chatPanelListEl;
                updateFunction = this.updateChatPanelList;
                otherHeaderEl = this.rolePanelHeaderEl;
                otherContentEl = this.rolePanelListEl;
                otherSectionType = "roles";
            }
            else if (sectionType === "roles") {
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
                    const otherIconEl = otherHeaderEl.querySelector(`.${CSS_SIDEBAR_SECTION_ICON}`);
                    otherHeaderEl.setAttribute("data-collapsed", "true");
                    if (otherIconEl)
                        setIcon(otherIconEl, collapseIcon);
                    otherContentEl.classList.remove(expandedClass);
                    if (otherSectionType === "chats" && this.newChatSidebarButton)
                        this.newChatSidebarButton.hide();
                }
                clickedHeaderEl.setAttribute("data-collapsed", "false");
                setIcon(iconEl, expandIcon);
                if (sectionType === "chats" && this.newChatSidebarButton)
                    this.newChatSidebarButton.show();
                try {
                    yield updateFunction();
                    contentEl.classList.add(expandedClass);
                }
                catch (error) {
                    this.plugin.logger.error(`Error updating sidebar section ${sectionType}:`, error);
                    contentEl.setText(`Error loading ${sectionType}.`);
                    contentEl.classList.add(expandedClass);
                }
            }
            else {
                clickedHeaderEl.setAttribute("data-collapsed", "true");
                setIcon(iconEl, collapseIcon);
                contentEl.classList.remove(expandedClass);
                if (sectionType === "chats" && this.newChatSidebarButton) {
                    this.newChatSidebarButton.hide();
                }
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
            catch (e) {
                this.plugin.logger.error("Failed to add danger class using item.el/dom:", e, item);
            }
        });
        menu.addItem(item => {
            item
                .setTitle("Delete Chat")
                .setIcon("lucide-trash-2")
                .onClick(() => this.handleContextMenuDelete(chatMeta.id, chatMeta.name));
            try {
                item.el.addClass("danger-option");
            }
            catch (e) {
                this.plugin.logger.error("Failed to add danger class using item.el/dom:", e, item);
            }
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
                this.plugin.logger.error(`Context menu: Error cloning chat ${chatId}:`, error);
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
                            this.plugin.logger.error("Error creating export folder:", err);
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
                this.plugin.logger.error(`Context menu: Error exporting chat ${chatId}:`, error);
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
                    this.plugin.logger.error(`Context menu: Error clearing messages for chat ${chatId}:`, error);
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
                    this.plugin.logger.error(`Context menu: Error deleting chat ${chatId}:`, error);
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
    // OllamaView.ts
    checkMessageForCollapsing(messageElOrGroupEl) {
        const messageGroupEl = messageElOrGroupEl.classList.contains(CSS_CLASSES.MESSAGE_GROUP)
            ? messageElOrGroupEl
            : messageElOrGroupEl.closest(`.${CSS_CLASSES.MESSAGE_GROUP}`);
        if (!messageGroupEl) {
            return;
        }
        const contentCollapsible = messageGroupEl.querySelector(`.${CSS_CLASSES.CONTENT_COLLAPSIBLE}`);
        // Знаходимо сам елемент .message всередині групи
        const messageEl = messageGroupEl.querySelector(`.${CSS_CLASSES.MESSAGE}`);
        if (!contentCollapsible || !messageEl) {
            // Перевіряємо наявність і messageEl
            return;
        }
        const maxH = this.plugin.settings.maxMessageHeight;
        const isStreamingNow = this.isProcessing &&
            messageGroupEl.classList.contains("placeholder") &&
            messageGroupEl.hasAttribute("data-placeholder-timestamp") &&
            contentCollapsible.classList.contains("streaming-text");
        if (isStreamingNow) {
            // Видаляємо кнопку, якщо вона раптом є (шукаємо всередині messageEl)
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
            // Шукаємо кнопку всередині messageEl
            let existingButton = messageEl.querySelector(`.${CSS_CLASSES.SHOW_MORE_BUTTON}`);
            const previousMaxHeightStyle = contentCollapsible.style.maxHeight;
            contentCollapsible.style.maxHeight = "";
            const scrollHeight = contentCollapsible.scrollHeight;
            if (existingButton && previousMaxHeightStyle && !existingButton.classList.contains("explicitly-expanded")) {
                // Додамо клас, щоб керувати цим
                contentCollapsible.style.maxHeight = previousMaxHeightStyle;
            }
            if (scrollHeight > maxH) {
                if (!existingButton) {
                    // Додаємо кнопку як нащадка .message, ПІСЛЯ contentCollapsible
                    existingButton = messageEl.createEl("button", {
                        cls: CSS_CLASSES.SHOW_MORE_BUTTON,
                    });
                    // Переконуємося, що кнопка після контенту, але перед можливим timestamp
                    // Якщо timestamp додається в кінець messageEl, це має працювати.
                    // В іншому випадку, можна використовувати insertAdjacentElement:
                    // contentCollapsible.insertAdjacentElement('afterend', existingButton);
                    this.registerDomEvent(existingButton, "click", () => {
                        // Додамо/видалимо клас для відстеження явного розгортання користувачем
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
    // Метод toggleMessageCollapse залишається без змін з відповіді #2 (або вашої поточної версії)
    // public toggleMessageCollapse(contentEl: HTMLElement, buttonEl: HTMLButtonElement): void {
    //   // ... (логіка згортання/розгортання)
    // }
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
                this.plugin.logger.error("Error during summarization:", error);
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
                this.plugin.logger.error("[renderOrUpdateErrorGroup] Could not find error text container in existing group!");
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
            this.plugin.logger.error("[renderOrUpdateErrorGroup] Failed to find/create content container for error group.");
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
                    this.plugin.logger.warn("[triggerErrorSummarization] Error content container disappeared before summarization finished.");
                    return;
                }
                contentContainer.empty();
                if (summary) {
                    contentContainer.setText(`Multiple errors occurred. Summary:\n${summary}`);
                }
                else {
                    this.plugin.logger.warn("[triggerErrorSummarization] Summarization failed or returned empty. Displaying list fallback.");
                    this.displayErrorListFallback(targetGroupElement, errors);
                }
            }
            catch (error) {
                this.plugin.logger.error("[triggerErrorSummarization] Unexpected error during summarization process:", error);
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
                this.plugin.logger.debug(`[summarizeErrors] Sending request to model ${modelName}. Prompt length: ${prompt.length}`);
                const responseData = yield this.plugin.ollamaService.generateRaw(requestBody);
                if (responseData && responseData.response) {
                    return responseData.response.trim();
                }
                else {
                    return null;
                }
            }
            catch (error) {
                this.plugin.logger.error("[summarizeErrors] Failed to summarize errors:", error);
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
            this.plugin.logger.error("[handleErrorMessage] Failed to render/update error group:", error);
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
            this.plugin.logger.debug(`[OllamaView][sendMessage START id:${requestTimestampId}] User input: "${userInputText.substring(0, 50)}...", isProcessing: ${this.isProcessing}, currentAbortController: ${this.currentAbortController ? "active" : "null"}`);
            if (!userInputText || this.isProcessing || this.currentAbortController) {
                this.plugin.logger.warn(`[OllamaView][sendMessage id:${requestTimestampId}] Aborted early. Empty: ${!userInputText}, Processing: ${this.isProcessing}, AbortCtrl: ${!!this.currentAbortController}`);
                if (this.isProcessing || this.currentAbortController)
                    new Notice("Please wait or cancel current operation.", 3000);
                return;
            }
            let activeChat = yield this.plugin.chatManager.getActiveChat(); // Використовуємо getActiveChat без "OrFail" спочатку
            if (!activeChat) {
                this.plugin.logger.info(`[OllamaView][sendMessage id:${requestTimestampId}] No active chat. Creating new.`);
                activeChat = yield this.plugin.chatManager.createNewChat();
                if (!activeChat) {
                    new Notice("Error: No active chat and could not create one.");
                    this.plugin.logger.error(`[OllamaView][sendMessage id:${requestTimestampId}] Failed to get/create active chat.`);
                    this.setLoadingState(false);
                    return;
                }
                new Notice(`Started new chat: ${activeChat.metadata.name}`);
            }
            const chatId = activeChat.metadata.id;
            const userMessageTimestamp = new Date();
            this.clearInputField();
            this.currentAbortController = new AbortController();
            this.plugin.logger.debug(`[OllamaView][sendMessage id:${requestTimestampId}] AbortController CREATED.`);
            this.setLoadingState(true);
            this.hideEmptyState();
            const llmResponseStartTimeMs = Date.now();
            let continueConversation = true;
            const maxTurns = 5;
            let turns = 0;
            let currentTurnLlmResponseTsForCatch = llmResponseStartTimeMs;
            try {
                // Крок 1: Обробка та рендеринг повідомлення користувача
                const userMessageAdded = yield this.plugin.chatManager.addUserMessageAndAwaitRender(userInputText, userMessageTimestamp, requestTimestampId);
                if (!userMessageAdded) {
                    throw new Error("User message processing failed in ChatManager.");
                }
                this.plugin.logger.info(`[OllamaView][sendMessage id:${requestTimestampId}] UserMessage (ts: ${userMessageTimestamp.getTime()}) fully processed by HMA via ChatManager.`);
                let chatStateForLlm = yield this.plugin.chatManager.getActiveChatOrFail();
                while (continueConversation && turns < maxTurns && !this.currentAbortController.signal.aborted) {
                    turns++;
                    const currentTurnLlmResponseTs = (turns === 1) ? llmResponseStartTimeMs : Date.now();
                    currentTurnLlmResponseTsForCatch = currentTurnLlmResponseTs;
                    this.plugin.logger.debug(`[OllamaView][sendMessage id:${requestTimestampId}] Orchestrator Turn ${turns}/${maxTurns}. History length: ${chatStateForLlm.messages.length}`);
                    this._managePlaceholder(currentTurnLlmResponseTs, requestTimestampId);
                    // Завжди отримуємо найсвіжіший стан чату перед викликом LLM
                    chatStateForLlm = yield this.plugin.chatManager.getActiveChatOrFail();
                    const llmStream = this.plugin.ollamaService.generateChatResponseStream(chatStateForLlm, this.currentAbortController.signal);
                    const { accumulatedContent, nativeToolCalls, assistantMessageWithNativeCalls } = yield this._processLlmStream(llmStream, currentTurnLlmResponseTs, requestTimestampId);
                    if (this.currentAbortController.signal.aborted)
                        throw new Error("aborted by user");
                    const toolCallCheckResult = this._determineToolCalls(nativeToolCalls, assistantMessageWithNativeCalls, accumulatedContent, currentTurnLlmResponseTs, requestTimestampId);
                    if (toolCallCheckResult.processedToolCallsThisTurn && toolCallCheckResult.processedToolCallsThisTurn.length > 0) {
                        yield this._executeAndRenderToolCycle(toolCallCheckResult.processedToolCallsThisTurn, toolCallCheckResult.assistantMessageForHistory, requestTimestampId);
                        // Після виконання інструментів та додавання їх результатів до ChatManager,
                        // оновлюємо стан чату для наступної ітерації LLM.
                        chatStateForLlm = yield this.plugin.chatManager.getActiveChatOrFail();
                        continueConversation = true;
                    }
                    else {
                        yield this._renderFinalAssistantText(accumulatedContent, // Це фінальний текст, якщо інструменти не викликались
                        currentTurnLlmResponseTs, requestTimestampId);
                        continueConversation = false;
                    }
                }
                if (turns >= maxTurns) {
                    this.plugin.logger.warn(`[OllamaView][sendMessage id:${requestTimestampId}] Max turns (${maxTurns}) reached.`);
                    const maxTurnsMsgTimestamp = new Date();
                    const maxTurnsMsg = { role: "system", content: "Max processing turns reached. If the task is not complete, please try rephrasing or breaking it down.", timestamp: maxTurnsMsgTimestamp };
                    const hmaPromise = new Promise((resolve, reject) => {
                        this.plugin.chatManager.registerHMAResolver(maxTurnsMsg.timestamp.getTime(), resolve, reject);
                        setTimeout(() => { if (this.plugin.chatManager.messageAddedResolvers.has(maxTurnsMsg.timestamp.getTime())) {
                            this.plugin.chatManager.rejectAndClearHMAResolver(maxTurnsMsg.timestamp.getTime(), "HMA timeout for max turns msg");
                        } }, 10000);
                    });
                    yield this.plugin.chatManager.addMessageToActiveChatPayload(maxTurnsMsg, true);
                    try {
                        yield hmaPromise;
                    }
                    catch (e_hma) {
                        this.plugin.logger.error(`[OllamaView][sendMessage id:${requestTimestampId}] HMA error/timeout for max turns system message`, e_hma);
                    }
                }
            }
            catch (error) {
                this.plugin.logger.error(`[OllamaView][sendMessage id:${requestTimestampId}] CATCH (Outer): ${error.message}`, error);
                if (this.activePlaceholder &&
                    (this.activePlaceholder.timestamp === llmResponseStartTimeMs ||
                        (currentTurnLlmResponseTsForCatch !== null && this.activePlaceholder.timestamp === currentTurnLlmResponseTsForCatch)) && this.activePlaceholder.groupEl.classList.contains("placeholder")) {
                    this.plugin.logger.debug(`[OllamaView][sendMessage id:${requestTimestampId}] CATCH: Removing active placeholder (ts: ${this.activePlaceholder.timestamp}) due to error.`);
                    if (this.activePlaceholder.groupEl.isConnected)
                        this.activePlaceholder.groupEl.remove();
                }
                this.activePlaceholder = null; // Завжди очищаємо плейсхолдер при помилці в try
                // Очищаємо резолвери, які могли бути зареєстровані цим викликом sendMessage
                this.plugin.chatManager.rejectAndClearHMAResolver(userMessageTimestamp.getTime(), `Outer catch in sendMessage for request ${requestTimestampId}`);
                this.plugin.chatManager.rejectAndClearHMAResolver(llmResponseStartTimeMs, `Outer catch in sendMessage for request ${requestTimestampId}`);
                if (currentTurnLlmResponseTsForCatch !== null) {
                    this.plugin.chatManager.rejectAndClearHMAResolver(currentTurnLlmResponseTsForCatch, `Outer catch in sendMessage for request ${requestTimestampId}`);
                }
                let errorMsgForChat;
                let errorMsgRole = "error";
                if (error.name === 'AbortError' || ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes("aborted by user"))) {
                    errorMsgForChat = "Message generation stopped.";
                    errorMsgRole = "system";
                }
                else {
                    errorMsgForChat = `Error: ${error.message || "Unknown error during processing."}`;
                    new Notice(errorMsgForChat, 7000);
                }
                const errorDisplayTimestamp = new Date();
                const errorDisplayMsg = { role: errorMsgRole, content: errorMsgForChat, timestamp: errorDisplayTimestamp };
                const hmaErrorPromise = new Promise((resolve, reject) => { this.plugin.chatManager.registerHMAResolver(errorDisplayMsg.timestamp.getTime(), resolve, reject); setTimeout(() => { if (this.plugin.chatManager.messageAddedResolvers.has(errorDisplayMsg.timestamp.getTime())) {
                    this.plugin.chatManager.rejectAndClearHMAResolver(errorDisplayMsg.timestamp.getTime(), "HMA timeout for error display msg");
                } }, 10000); });
                yield this.plugin.chatManager.addMessageToActiveChatPayload(errorDisplayMsg, true);
                try {
                    yield hmaErrorPromise;
                }
                catch (e_hma) {
                    this.plugin.logger.error(`[OllamaView][sendMessage id:${requestTimestampId}] HMA error/timeout for error display message`, e_hma);
                }
            }
            finally {
                this.plugin.logger.debug(`[OllamaView][sendMessage id:${requestTimestampId}] FINALLY.`);
                // Додаткове очищення плейсхолдера про всяк випадок
                if (this.activePlaceholder && this.activePlaceholder.groupEl.classList.contains("placeholder")) {
                    this.plugin.logger.warn(`[OllamaView][sendMessage id:${requestTimestampId}] FINALLY: Active placeholder (ts: ${this.activePlaceholder.timestamp}) is still a placeholder. Removing now.`);
                    if (this.activePlaceholder.groupEl.isConnected)
                        this.activePlaceholder.groupEl.remove();
                }
                this.activePlaceholder = null;
                this.currentAbortController = null;
                // isRegenerating має скидатися відповідним методом (handleRegenerateClick), а не тут
                this.setLoadingState(false);
                requestAnimationFrame(() => this.updateSendButtonState());
                this.plugin.logger.info(`[OllamaView][sendMessage id:${requestTimestampId}] FINALLY (END). Chat interaction finished.`);
                this.focusInput();
            }
        });
    }
    handleMessageAdded(data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const messageForLog = data === null || data === void 0 ? void 0 : data.message;
            const messageTimestampForLog = (_a = messageForLog === null || messageForLog === void 0 ? void 0 : messageForLog.timestamp) === null || _a === void 0 ? void 0 : _a.getTime();
            const messageRoleForLog = messageForLog === null || messageForLog === void 0 ? void 0 : messageForLog.role;
            const hmaEntryId = Date.now();
            this.plugin.logger.debug(`[HMA SUPER-ENTRY ${hmaEntryId} id:${messageTimestampForLog}] Role: ${messageRoleForLog}. Active placeholder ts: ${(_b = this.activePlaceholder) === null || _b === void 0 ? void 0 : _b.timestamp}`);
            try {
                if (!data || !data.message) {
                    this.plugin.logger.error(`[HMA ${hmaEntryId} id:${messageTimestampForLog}] EXIT (Early): Invalid data received. Data:`, data);
                    if (messageTimestampForLog)
                        this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                    return;
                }
                const { chatId: eventChatId, message } = data;
                const messageTimestampMs = message.timestamp.getTime();
                if (!this.chatContainer || !this.plugin.chatManager) {
                    this.plugin.logger.error(`[HMA ${hmaEntryId} id:${messageTimestampMs}] EXIT (Early): CRITICAL Context missing!`);
                    if (messageTimestampForLog)
                        this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                    return;
                }
                const activeChatId = this.plugin.chatManager.getActiveChatId();
                if (eventChatId !== activeChatId) {
                    this.plugin.logger.debug(`[HMA ${hmaEntryId} id:${messageTimestampMs}] EXIT (Early): Event for non-active chat ${eventChatId}.`);
                    if (messageTimestampForLog)
                        this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                    return;
                }
                const existingRenderedMessage = this.chatContainer.querySelector(`.${CSS_CLASSES.MESSAGE_GROUP}:not(.placeholder)[data-timestamp="${messageTimestampMs}"]`);
                if (existingRenderedMessage) {
                    this.plugin.logger.warn(`[HMA ${hmaEntryId} id:${messageTimestampMs}] EXIT (Early): Message (role: ${message.role}) already rendered.`);
                    if (messageTimestampForLog)
                        this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                    return;
                }
                const alreadyInLogicCache = this.currentMessages.some(m => m.timestamp.getTime() === messageTimestampMs && m.role === message.role && m.content === message.content);
                const isPotentiallyAssistantForPlaceholder = message.role === 'assistant' &&
                    ((_c = this.activePlaceholder) === null || _c === void 0 ? void 0 : _c.timestamp) === messageTimestampMs;
                this.plugin.logger.debug(`[HMA ${hmaEntryId} id:${messageTimestampMs}] Cache/Placeholder checks: alreadyInLogicCache=${alreadyInLogicCache}, isPotentiallyAssistantForPlaceholder=${isPotentiallyAssistantForPlaceholder}.`);
                if (alreadyInLogicCache && !isPotentiallyAssistantForPlaceholder) {
                    this.plugin.logger.warn(`[HMA ${hmaEntryId} id:${messageTimestampMs}] EXIT (Early): Message in cache and NOT for placeholder. Role: ${message.role}.`);
                    if (messageTimestampForLog)
                        this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                    return;
                }
                if (alreadyInLogicCache && isPotentiallyAssistantForPlaceholder) {
                    this.plugin.logger.info(`[HMA ${hmaEntryId} id:${messageTimestampMs}] Message in cache, BUT IS for placeholder. Proceeding.`);
                }
                if (!alreadyInLogicCache) {
                    this.currentMessages.push(message);
                    this.plugin.logger.debug(`[HMA ${hmaEntryId} id:${messageTimestampMs}] Message (role ${message.role}) PUSHED to currentMessages. New count: ${this.currentMessages.length}`);
                }
                this.plugin.logger.debug(`[HMA ${hmaEntryId} id:${messageTimestampMs}] Passed initial checks. Role: ${message.role}. Active placeholder ts: ${(_d = this.activePlaceholder) === null || _d === void 0 ? void 0 : _d.timestamp}`);
                if (isPotentiallyAssistantForPlaceholder && this.activePlaceholder) {
                    this.plugin.logger.info(`[HMA ${hmaEntryId} id:${messageTimestampMs}] Assistant message (ts: ${messageTimestampMs}) MATCHES active placeholder (ts: ${this.activePlaceholder.timestamp}). Updating placeholder.`);
                    const placeholderToUpdate = this.activePlaceholder;
                    if (((_e = placeholderToUpdate.groupEl) === null || _e === void 0 ? void 0 : _e.isConnected) && placeholderToUpdate.contentEl && placeholderToUpdate.messageWrapper) {
                        this.plugin.logger.debug(`[HMA ${hmaEntryId} id:${messageTimestampMs}] Placeholder DOM elements are valid for update.`);
                        placeholderToUpdate.groupEl.classList.remove("placeholder");
                        placeholderToUpdate.groupEl.removeAttribute("data-placeholder-timestamp");
                        placeholderToUpdate.groupEl.setAttribute("data-timestamp", messageTimestampMs.toString());
                        const messageDomElement = placeholderToUpdate.groupEl.querySelector(`.${CSS_CLASSES.MESSAGE}`);
                        if (!messageDomElement) {
                            this.plugin.logger.error(`[HMA ${hmaEntryId} id:${messageTimestampMs}] CRITICAL: .message element NOT FOUND in placeholder. Removing placeholder and adding normally.`);
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
                                this.plugin.logger.debug(`[HMA ${hmaEntryId} id:${messageTimestampMs}] Thinking dots removed.`);
                            }
                            try {
                                const displayContent = AssistantMessageRenderer.prepareDisplayContent(message.content || "", message, this.plugin, this // Передаємо екземпляр OllamaView
                                );
                                this.plugin.logger.debug(`[HMA ${hmaEntryId} id:${messageTimestampMs}] Rendering prepared display content into placeholder: "${displayContent.substring(0, 100)}..."`);
                                placeholderToUpdate.contentEl.empty();
                                yield RendererUtils.renderMarkdownContent(this.app, this, this.plugin, placeholderToUpdate.contentEl, displayContent);
                                AssistantMessageRenderer.addAssistantActionButtons(messageDomElement, placeholderToUpdate.contentEl, message, this.plugin, this);
                                BaseMessageRenderer.addTimestamp(messageDomElement, message.timestamp, this);
                                this.lastMessageElement = placeholderToUpdate.groupEl;
                                this.hideEmptyState();
                                const finalMessageGroupElement = placeholderToUpdate.groupEl;
                                this.activePlaceholder = null;
                                this.plugin.logger.info(`[HMA ${hmaEntryId} id:${messageTimestampMs}] Placeholder successfully updated and CLEARED. Preview: "${displayContent.substring(0, 50)}..."`);
                                setTimeout(() => {
                                    if (finalMessageGroupElement && finalMessageGroupElement.isConnected) {
                                        this.plugin.logger.debug(`[HMA id:${messageTimestampMs}] Calling checkMessageForCollapsing for finalized group.`);
                                        this.checkMessageForCollapsing(finalMessageGroupElement);
                                    }
                                }, 70);
                                this.guaranteedScrollToBottom(100, true);
                            }
                            catch (renderError) {
                                this.plugin.logger.error(`[HMA ${hmaEntryId} id:${messageTimestampMs}] Error during placeholder final render:`, renderError);
                                if (placeholderToUpdate.groupEl.isConnected)
                                    placeholderToUpdate.groupEl.remove();
                                this.activePlaceholder = null;
                                this.handleErrorMessage({ role: "error", content: `Failed to finalize display for ts ${messageTimestampMs}: ${renderError.message}`, timestamp: new Date() });
                            }
                        }
                    }
                    else {
                        this.plugin.logger.error(`[HMA ${hmaEntryId} id:${messageTimestampMs}] Active placeholder matched, but DOM invalid. Adding via addMessageStandard.`);
                        this.activePlaceholder = null;
                        yield this.addMessageStandard(message);
                    }
                }
                else {
                    this.plugin.logger.debug(`[HMA ${hmaEntryId} id:${messageTimestampMs}] No matching placeholder OR not assistant. Role: ${message.role}. Adding via addMessageStandard.`);
                    yield this.addMessageStandard(message); // Це викличе відповідний рендерер, включаючи AssistantMessageRenderer.render()
                }
                this.plugin.logger.debug(`[HMA ${hmaEntryId} id:${messageTimestampMs}] <<< END OF TRY BLOCK >>> Role: ${messageRoleForLog}.`);
            }
            catch (outerError) {
                this.plugin.logger.error(`[HMA ${hmaEntryId} id:${messageTimestampForLog}] <<< CATCH OUTER ERROR >>> Role: ${messageRoleForLog}:`, outerError, data);
                this.handleErrorMessage({
                    role: "error",
                    content: `Internal error in handleMessageAdded for ${messageRoleForLog} msg (ts ${messageTimestampForLog}): ${outerError.message}`,
                    timestamp: new Date(),
                });
            }
            finally {
                this.plugin.logger.debug(`[HMA ${hmaEntryId} id:${messageTimestampForLog}] <<< FINALLY START >>> Role: ${messageRoleForLog}.`);
                if (messageTimestampForLog) {
                    // Тепер викликаємо invokeHMAResolver з ChatManager
                    this.plugin.chatManager.invokeHMAResolver(messageTimestampForLog);
                }
                this.plugin.logger.debug(`[HMA ${hmaEntryId} id:${messageTimestampForLog}] <<< FINALLY END >>> Role: ${messageRoleForLog}.`);
            }
        });
    }
    // OllamaView.ts
    handleRegenerateClick(userMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (this.isRegenerating) {
                new Notice("Regeneration is already in progress. Please wait.", 3000);
                this.plugin.logger.warn("[Regenerate] Attempted to start new regeneration while one is already in progress.");
                return;
            }
            if (this.currentAbortController) {
                this.plugin.logger.warn("[Regenerate] Attempted to start regeneration while currentAbortController is not null. Previous operation might be active.");
                new Notice("Previous generation process is still active or finishing. Please wait.", 4000);
                return;
            }
            const activeChat = yield ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat());
            if (!activeChat) {
                new Notice("Cannot regenerate: No active chat found.");
                this.plugin.logger.warn("[Regenerate] No active chat found.");
                return;
            }
            const chatId = activeChat.metadata.id;
            const messageIndex = activeChat.messages.findIndex(msg => msg.timestamp.getTime() === userMessage.timestamp.getTime() && msg.role === userMessage.role);
            if (messageIndex === -1) {
                this.plugin.logger.error("[Regenerate] Could not find the user message in the active chat history for regeneration.", userMessage);
                new Notice("Error: Could not find the message to regenerate from.");
                return;
            }
            const hasMessagesAfter = activeChat.messages.length > messageIndex + 1;
            new ConfirmModal(this.app, "Confirm Regeneration", hasMessagesAfter
                ? "This will delete all messages after this prompt and generate a new response. Continue?"
                : "Generate a new response for this prompt?", () => __awaiter(this, void 0, void 0, function* () {
                var _a, e_1, _b, _c;
                var _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
                this.isRegenerating = true;
                const regenerationRequestTimestamp = new Date().getTime();
                this.plugin.logger.error(`[Regenerate START id:${regenerationRequestTimestamp}] For userMsg ts: ${userMessage.timestamp.toISOString()}. isRegenerating set to true.`);
                this.currentAbortController = new AbortController();
                let accumulatedResponse = "";
                const responseStartTime = new Date();
                const responseStartTimeMs = responseStartTime.getTime();
                this.setLoadingState(true);
                let streamErrorOccurred = null;
                let mainAssistantMessageProcessedPromise;
                try {
                    this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] Starting logic. HasMessagesAfter: ${hasMessagesAfter}`);
                    if (hasMessagesAfter) {
                        const deleteSuccess = yield this.plugin.chatManager.deleteMessagesAfter(chatId, messageIndex);
                        if (!deleteSuccess) {
                            this.plugin.logger.error(`[Regenerate id:${regenerationRequestTimestamp}] Failed to delete subsequent messages.`);
                            throw new Error("Failed to delete subsequent messages for regeneration.");
                        }
                        this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] Subsequent messages deleted.`);
                    }
                    yield this.loadAndDisplayActiveChat();
                    this.guaranteedScrollToBottom(50, true);
                    this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] Chat reloaded after deletions.`);
                    this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] Creating placeholder for new assistant response (expected ts: ${responseStartTimeMs}).`);
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
                    }); // Додаємо streaming-text
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
                        this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] Placeholder created. activePlaceholder.ts set to: ${this.activePlaceholder.timestamp}.`);
                    }
                    else {
                        this.plugin.logger.error(`[Regenerate id:${regenerationRequestTimestamp}] Failed to create all placeholder elements!`);
                        throw new Error("Failed to create placeholder elements for regeneration.");
                    }
                    assistantPlaceholderGroupEl.classList.add(CSS_CLASSES.MESSAGE_ARRIVING);
                    setTimeout(() => assistantPlaceholderGroupEl === null || assistantPlaceholderGroupEl === void 0 ? void 0 : assistantPlaceholderGroupEl.classList.remove(CSS_CLASSES.MESSAGE_ARRIVING), 500);
                    this.guaranteedScrollToBottom(50, true);
                    const chatForStreaming = yield this.plugin.chatManager.getChat(chatId);
                    if (!chatForStreaming) {
                        this.plugin.logger.error(`[Regenerate id:${regenerationRequestTimestamp}] Failed to get chatForStreaming.`);
                        throw new Error("Failed to get updated chat context for streaming regeneration.");
                    }
                    this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] Starting stream. Context messages: ${chatForStreaming.messages.length}.`);
                    const stream = this.plugin.ollamaService.generateChatResponseStream(chatForStreaming, this.currentAbortController.signal);
                    let firstChunk = true;
                    try {
                        for (var _q = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield stream_1.next(), _a = stream_1_1.done, !_a; _q = true) {
                            _c = stream_1_1.value;
                            _q = false;
                            const chunk = _c;
                            if (this.currentAbortController.signal.aborted) {
                                this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] Stream aborted by user during iteration.`);
                                throw new Error("aborted by user");
                            }
                            if ("error" in chunk && chunk.error) {
                                if (!chunk.error.includes("aborted by user")) {
                                    this.plugin.logger.error(`[Regenerate id:${regenerationRequestTimestamp}] Stream error: ${chunk.error}`);
                                    throw new Error(chunk.error);
                                }
                                else {
                                    this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] Stream reported 'aborted by user'.`);
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
                                    yield RendererUtils.renderMarkdownContent(this.app, // app
                                    this, // view (екземпляр OllamaView)
                                    this.plugin, // plugin
                                    this.activePlaceholder.contentEl, // containerEl (куди рендерити)
                                    accumulatedResponse // markdownText (що рендерити)
                                    );
                                    this.guaranteedScrollToBottom(50, true);
                                    // ВИДАЛЕНО: this.checkMessageForCollapsing(this.activePlaceholder.groupEl);
                                }
                                else {
                                    this.plugin.logger.warn(`[Regenerate id:${regenerationRequestTimestamp}] activePlaceholder mismatch during stream. Current.ts: ${(_e = this.activePlaceholder) === null || _e === void 0 ? void 0 : _e.timestamp}, expected: ${responseStartTimeMs}.`);
                                    accumulatedResponse += chunk.response;
                                }
                            }
                            if ("done" in chunk && chunk.done) {
                                this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] Stream finished (done received).`);
                                break;
                            }
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (!_q && !_a && (_b = stream_1.return)) yield _b.call(stream_1);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                    this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] Stream completed. Final response length: ${accumulatedResponse.length}. Active placeholder.ts: ${(_f = this.activePlaceholder) === null || _f === void 0 ? void 0 : _f.timestamp} (expected ${responseStartTimeMs})`);
                    if (accumulatedResponse.trim()) {
                        this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] Adding assistant message to ChatManager (expected ts: ${responseStartTimeMs}). Setting emitEvent to TRUE.`);
                        mainAssistantMessageProcessedPromise = new Promise(resolve => {
                            this.messageAddedResolvers.set(responseStartTimeMs, resolve);
                            this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] Resolver ADDED to map for ts ${responseStartTimeMs}. Map size: ${this.messageAddedResolvers.size}`);
                        });
                        this.plugin.chatManager.addMessageToActiveChat("assistant", accumulatedResponse, responseStartTime, true);
                        this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] TRY: Awaiting mainAssistantMessageProcessedPromise (via map) for ts ${responseStartTimeMs}`);
                        const timeoutDuration = 10000;
                        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout (${timeoutDuration / 1000}s) waiting for HMA for ts ${responseStartTimeMs}`)), timeoutDuration));
                        try {
                            yield Promise.race([mainAssistantMessageProcessedPromise, timeoutPromise]);
                            this.plugin.logger.info(`[Regenerate id:${regenerationRequestTimestamp}] TRY: mainAssistantMessageProcessedPromise for ts ${responseStartTimeMs} RESOLVED or raced successfully.`);
                        }
                        catch (awaitPromiseError) {
                            this.plugin.logger.error(`[Regenerate id:${regenerationRequestTimestamp}] TRY: Error or Timeout awaiting mainAssistantMessageProcessedPromise for ts ${responseStartTimeMs}: ${awaitPromiseError.message}`);
                            streamErrorOccurred = streamErrorOccurred || awaitPromiseError;
                            if (this.messageAddedResolvers.has(responseStartTimeMs)) {
                                this.plugin.logger.warn(`[Regenerate id:${regenerationRequestTimestamp}] Timeout/Error awaiting, removing resolver from map for ts ${responseStartTimeMs}.`);
                                this.messageAddedResolvers.delete(responseStartTimeMs);
                            }
                        }
                    }
                    else if (!this.currentAbortController.signal.aborted) {
                        this.plugin.logger.warn(`[Regenerate id:${regenerationRequestTimestamp}] Assistant provided an empty response, not due to cancellation.`);
                        if (((_g = this.activePlaceholder) === null || _g === void 0 ? void 0 : _g.timestamp) === responseStartTimeMs &&
                            ((_h = this.activePlaceholder.groupEl) === null || _h === void 0 ? void 0 : _h.isConnected)) {
                            this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] Removing placeholder for ts ${responseStartTimeMs} due to empty response.`);
                            this.activePlaceholder.groupEl.remove();
                        }
                        if (((_j = this.activePlaceholder) === null || _j === void 0 ? void 0 : _j.timestamp) === responseStartTimeMs) {
                            this.activePlaceholder = null;
                            this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] activePlaceholder (ts: ${responseStartTimeMs}) cleared due to empty response.`);
                        }
                        this.plugin.chatManager.addMessageToActiveChat("system", "Assistant provided an empty response during regeneration.", new Date(), true);
                    }
                }
                catch (error) {
                    streamErrorOccurred = error;
                    // this.plugin.logger.error(`[Regenerate id:${regenerationRequestTimestamp}] CATCH: Error during regeneration process:`, error);
                    if (((_k = this.activePlaceholder) === null || _k === void 0 ? void 0 : _k.timestamp) === responseStartTimeMs) {
                        // this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] CATCH: Removing active placeholder (ts: ${responseStartTimeMs}) due to error.`);
                        if ((_l = this.activePlaceholder.groupEl) === null || _l === void 0 ? void 0 : _l.isConnected)
                            this.activePlaceholder.groupEl.remove();
                        this.activePlaceholder = null;
                    }
                    if (this.messageAddedResolvers.has(responseStartTimeMs)) {
                        // this.plugin.logger.warn(`[Regenerate id:${regenerationRequestTimestamp}] CATCH: Error occurred, removing resolver from map for ts ${responseStartTimeMs} if it exists.`);
                        this.messageAddedResolvers.delete(responseStartTimeMs);
                    }
                    let errorMsgForChat = "An unexpected error occurred during regeneration.";
                    let errorMsgRole = "error";
                    let savePartialResponseOnError = false;
                    if (error.name === "AbortError" || ((_m = error.message) === null || _m === void 0 ? void 0 : _m.includes("aborted by user"))) {
                        // this.plugin.logger.info(`[Regenerate id:${regenerationRequestTimestamp}] CATCH: Regeneration was stopped/aborted.`);
                        errorMsgForChat = "Regeneration stopped.";
                        errorMsgRole = "system";
                        if (accumulatedResponse.trim())
                            savePartialResponseOnError = true;
                    }
                    else {
                        errorMsgForChat = `Regeneration failed: ${error.message || "Unknown error"}`;
                        new Notice(errorMsgForChat, 5000);
                    }
                    // this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] CATCH: Adding error/system message to chat: "${errorMsgForChat}"`);
                    this.plugin.chatManager.addMessageToActiveChat(errorMsgRole, errorMsgForChat, new Date(), true);
                    if (savePartialResponseOnError) {
                        // this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] CATCH: Saving partial response after cancellation.`);
                        this.plugin.chatManager.addMessageToActiveChat("assistant", accumulatedResponse, responseStartTime, true);
                    }
                }
                finally {
                    // this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] FINALLY (START). AbortCtrl: ${this.currentAbortController ? 'active' : 'null'}, isProcessing: ${this.isProcessing}, activePlaceholder.ts: ${this.activePlaceholder?.timestamp}, messageAddedResolvers size: ${this.messageAddedResolvers.size}`);
                    if (this.messageAddedResolvers.has(responseStartTimeMs)) {
                        // this.plugin.logger.warn(`[Regenerate id:${regenerationRequestTimestamp}] FINALLY: Resolver for ts ${responseStartTimeMs} still in map. Removing.`);
                        this.messageAddedResolvers.delete(responseStartTimeMs);
                    }
                    if (((_o = this.activePlaceholder) === null || _o === void 0 ? void 0 : _o.timestamp) === responseStartTimeMs) {
                        //  this.plugin.logger.warn(`[Regenerate id:${regenerationRequestTimestamp}] FINALLY: Active placeholder (ts: ${responseStartTimeMs}) was STILL NOT CLEARED by HMA. Removing now.`);
                        if ((_p = this.activePlaceholder.groupEl) === null || _p === void 0 ? void 0 : _p.isConnected) {
                            this.activePlaceholder.groupEl.remove();
                        }
                        this.activePlaceholder = null;
                    }
                    const prevAbortCtrl = this.currentAbortController;
                    this.currentAbortController = null;
                    // this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] FINALLY: currentAbortController set to null. Was: ${prevAbortCtrl ? 'active' : 'null'}. Now: ${this.currentAbortController ? 'active' : 'null'}`);
                    const prevIsRegen = this.isRegenerating;
                    this.isRegenerating = false;
                    // this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] FINALLY: isRegenerating set to false. Was: ${prevIsRegen}. Now: ${this.isRegenerating}`);
                    // this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] FINALLY: Calling setLoadingState(false).`);
                    this.setLoadingState(false);
                    requestAnimationFrame(() => {
                        // this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] FINALLY (requestAnimationFrame): Forcing updateSendButtonState. AbortCtrl: ${this.currentAbortController ? 'active' : 'null'}, isProcessing: ${this.isProcessing}`);
                        this.updateSendButtonState();
                        // this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] FINALLY (requestAnimationFrame): UI update attempt finished.`);
                    });
                    // this.plugin.logger.debug(`[Regenerate id:${regenerationRequestTimestamp}] FINALLY (END).`);
                    this.focusInput();
                }
            })).open();
        });
    }
    loadAndDisplayActiveChat() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
            this.plugin.logger.debug(`[OllamaView] loadAndDisplayActiveChat START for activeId: ${(_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChatId()}`);
            let metadataUpdated = false;
            try {
                this.clearChatContainerInternal(); // Очищає this.currentMessages, this.lastRenderedMessageDate, DOM контейнер, etc.
                // this.currentMessages = []; // Вже робиться в clearChatContainerInternal
                // this.lastRenderedMessageDate = null; // Вже робиться в clearChatContainerInternal
                this.lastMessageElement = null;
                this.consecutiveErrorMessages = [];
                this.errorGroupElement = null;
                // this.activePlaceholder = null; // Важливо скидати плейсхолдер при повному перезавантаженні
                let activeChat = null;
                let availableModels = [];
                let finalModelName = null;
                let finalRolePath = undefined; // Може бути null або undefined
                let finalRoleName = "None";
                let finalTemperature = undefined; // Може бути null або undefined
                let errorOccurredLoadingData = false;
                // --- Завантаження даних ---
                try {
                    activeChat = (yield ((_b = this.plugin.chatManager) === null || _b === void 0 ? void 0 : _b.getActiveChat())) || null;
                    // this.plugin.logger.debug(
                    //   `[loadAndDisplayActiveChat] Active chat fetched: ${activeChat?.metadata?.id ?? "null"}`
                    // );
                    availableModels = yield this.plugin.ollamaService.getModels();
                    // Визначаємо шлях до ролі: або з метаданих чату, або з глобальних налаштувань
                    finalRolePath = ((_c = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _c === void 0 ? void 0 : _c.selectedRolePath) !== undefined
                        ? activeChat.metadata.selectedRolePath
                        : this.plugin.settings.selectedRolePath;
                    finalRoleName = yield this.findRoleNameByPath(finalRolePath); // Використовуємо метод цього класу
                }
                catch (error) {
                    this.plugin.logger.error("[loadAndDisplayActiveChat] Error loading initial chat data or models:", error);
                    new Notice("Error connecting to Ollama or loading chat data.", 5000);
                    errorOccurredLoadingData = true;
                    availableModels = availableModels || [];
                    finalModelName = availableModels.includes(this.plugin.settings.modelName)
                        ? this.plugin.settings.modelName
                        : (_d = availableModels[0]) !== null && _d !== void 0 ? _d : null;
                    finalTemperature = this.plugin.settings.temperature;
                    finalRolePath = this.plugin.settings.selectedRolePath; // Глобальні налаштування як fallback
                    finalRoleName = yield this.findRoleNameByPath(finalRolePath);
                    activeChat = null;
                }
                // --- Визначення та вирівнювання метаданих ---
                if (!errorOccurredLoadingData && activeChat) {
                    let preferredModel = ((_e = activeChat.metadata) === null || _e === void 0 ? void 0 : _e.modelName) || this.plugin.settings.modelName;
                    if (availableModels.length > 0) {
                        if (preferredModel && availableModels.includes(preferredModel)) {
                            finalModelName = preferredModel;
                        }
                        else {
                            finalModelName = availableModels[0]; // Беремо першу доступну, якщо обрана не знайдена
                            this.plugin.logger.warn(`[loadAndDisplayActiveChat] Preferred model "${preferredModel}" for chat "${activeChat.metadata.name}" not found in available models [${availableModels.join(", ")}]. Using first available: "${finalModelName}".`);
                        }
                    }
                    else {
                        finalModelName = null;
                        this.plugin.logger.error(`[loadAndDisplayActiveChat] No available Ollama models detected. Cannot set model for chat "${activeChat.metadata.name}".`);
                    }
                    // Вирівнюємо модель у метаданих чату, якщо потрібно
                    if (activeChat.metadata.modelName !== finalModelName && finalModelName !== null) {
                        this.plugin.logger.debug(`[OllamaView] loadAndDisplayActiveChat: Aligning model name in metadata for chat "${activeChat.metadata.name}"... Old: ${activeChat.metadata.modelName}, New: ${finalModelName}`);
                        try {
                            const updateSuccess = yield this.plugin.chatManager.updateActiveChatMetadata({ modelName: finalModelName });
                            if (updateSuccess) {
                                metadataUpdated = true;
                                this.plugin.logger.debug(`[OllamaView] loadAndDisplayActiveChat: Model metadata for chat "${activeChat.metadata.name}" alignment finished (success). metadataUpdated = true.`);
                                // Перезавантажуємо об'єкт activeChat, щоб відобразити зміни
                                const potentiallyUpdatedChat = yield this.plugin.chatManager.getChat(activeChat.metadata.id);
                                if (potentiallyUpdatedChat)
                                    activeChat = potentiallyUpdatedChat;
                            }
                            else {
                                this.plugin.logger.debug(`[OllamaView] loadAndDisplayActiveChat: Model metadata for chat "${activeChat.metadata.name}" alignment not needed or failed silently.`);
                            }
                        }
                        catch (updateError) {
                            this.plugin.logger.error(`[loadAndDisplayActiveChat] Error awaiting chat model metadata update for chat "${activeChat.metadata.name}":`, updateError);
                        }
                    }
                    finalTemperature = (_g = (_f = activeChat.metadata) === null || _f === void 0 ? void 0 : _f.temperature) !== null && _g !== void 0 ? _g : this.plugin.settings.temperature;
                    // finalRolePath та finalRoleName вже визначені раніше
                }
                else if (!errorOccurredLoadingData && !activeChat) {
                    // Якщо чату немає (наприклад, щойно створений порожній або всі видалені)
                    finalModelName = availableModels.includes(this.plugin.settings.modelName)
                        ? this.plugin.settings.modelName
                        : (_h = availableModels[0]) !== null && _h !== void 0 ? _h : null;
                    finalTemperature = this.plugin.settings.temperature;
                    finalRolePath = this.plugin.settings.selectedRolePath;
                    finalRoleName = yield this.findRoleNameByPath(finalRolePath);
                }
                // Якщо errorOccurredLoadingData = true, то finalModelName, finalTemperature, etc. вже встановлені у fallback значення.
                // --- Рендерінг повідомлень ---
                if (activeChat && !errorOccurredLoadingData && ((_j = activeChat.messages) === null || _j === void 0 ? void 0 : _j.length) > 0) {
                    this.hideEmptyState();
                    this.currentMessages = [...activeChat.messages];
                    this.lastRenderedMessageDate = null;
                    for (const message of this.currentMessages) {
                        let messageGroupEl = null;
                        const isNewDay = !this.lastRenderedMessageDate || !this.isSameDay(this.lastRenderedMessageDate, message.timestamp);
                        const isFirstMessageInContainer = this.chatContainer.children.length === 0;
                        if (isNewDay || isFirstMessageInContainer) {
                            if (isNewDay && this.chatContainer.children.length > 0) { // Додаємо роздільник дати, тільки якщо вже є повідомлення
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
                                    renderer = new AssistantMessageRenderer(this.app, this.plugin, message, this); // <--- Використовуємо type assertion
                                    break;
                                case "system":
                                    renderer = new SystemMessageRenderer(this.app, this.plugin, message, this);
                                    break;
                                case "error":
                                    this.handleErrorMessage(message);
                                    // Не робимо continue тут, щоб messageGroupEl не залишився null, якщо це останнє повідомлення
                                    // handleErrorMessage сам додасть до DOM, але ми можемо вийти з try...catch для цього повідомлення
                                    messageGroupEl = this.errorGroupElement; // Припускаємо, що handleErrorMessage оновлює це
                                    break;
                                case "tool":
                                    renderer = new ToolMessageRenderer(this.app, this.plugin, message, this);
                                    break;
                                default:
                                    this.plugin.logger.warn(`[loadAndDisplayActiveChat] Unknown message role in history: ${message === null || message === void 0 ? void 0 : message.role}`);
                                    const unknownRoleGroup = (_k = this.chatContainer) === null || _k === void 0 ? void 0 : _k.createDiv({ cls: CSS_CLASSES.MESSAGE_GROUP });
                                    if (unknownRoleGroup && this.chatContainer) {
                                        RendererUtils.renderAvatar(this.app, this.plugin, unknownRoleGroup, false);
                                        const wrapper = unknownRoleGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
                                        const msgBubble = wrapper.createDiv({ cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.SYSTEM_MESSAGE}` });
                                        msgBubble.createDiv({ cls: CSS_CLASSES.SYSTEM_MESSAGE_TEXT || "system-message-text", text: `Unknown message role: ${message.role}` });
                                        BaseMessageRenderer.addTimestamp(msgBubble, message.timestamp, this);
                                        this.chatContainer.appendChild(unknownRoleGroup);
                                        messageGroupEl = unknownRoleGroup;
                                    }
                                    break;
                            }
                            if (renderer && message.role !== 'error') { // Не викликаємо render, якщо це помилка, оброблена handleErrorMessage
                                const result = renderer.render();
                                messageGroupEl = (result instanceof Promise) ? yield result : result;
                            }
                        }
                        catch (renderError) {
                            this.plugin.logger.error("[loadAndDisplayActiveChat] Error rendering message during load:", renderError, message);
                            const errorDiv = this.chatContainer.createDiv({ cls: CSS_CLASSES.ERROR_MESSAGE || "render-error" });
                            errorDiv.setText(`Error rendering message (role: ${message.role})`);
                            messageGroupEl = errorDiv;
                        }
                        if (messageGroupEl) {
                            if (messageGroupEl.parentElement !== this.chatContainer) { // Додаємо, тільки якщо ще не в контейнері (напр. handleErrorMessage міг вже додати)
                                this.chatContainer.appendChild(messageGroupEl);
                            }
                            this.lastMessageElement = messageGroupEl;
                        }
                    } // кінець for...of
                    setTimeout(() => this.checkAllMessagesForCollapsing(), 100);
                    setTimeout(() => {
                        this.guaranteedScrollToBottom(100, true); // Форсуємо прокрутку після завантаження історії
                        setTimeout(() => {
                            this.updateScrollStateAndIndicators();
                        }, 150);
                    }, 150);
                }
                else {
                    this.showEmptyState();
                    (_l = this.scrollToBottomButton) === null || _l === void 0 ? void 0 : _l.classList.remove(CSS_CLASSES.VISIBLE || "visible");
                }
                // --- Оновлення UI самої View ---
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
                // this.plugin.logger.debug(
                //   `[OllamaView] loadAndDisplayActiveChat FINISHED. Metadata was updated: ${metadataUpdated}`
                // );
            }
            catch (error) {
                this.plugin.logger.error("[loadAndDisplayActiveChat] XXX CRITICAL OUTER ERROR XXX", error);
                this.clearChatContainerInternal();
                this.showEmptyState();
                if (this.chatContainer) { // Перевірка, чи існує chatContainer
                    this.chatContainer.createDiv({ cls: "fatal-error-message", text: "Failed to load chat content. Please check console." });
                }
                return { metadataUpdated: false }; // Повертаємо false, оскільки метадані точно не оновлено успішно
            }
            finally {
                // Можливо, зняти загальний індикатор завантаження View, якщо він є
            }
            return { metadataUpdated };
        });
    }
    _processAndRenderUserMessage(content, timestamp, requestTimestampId) {
        return __awaiter(this, void 0, void 0, function* () {
            const timestampMs = timestamp.getTime();
            this.plugin.logger.debug(`[sendMessage id:${requestTimestampId}] Setting up resolver for UserMessage (ts: ${timestampMs}).`);
            const promise = new Promise((resolve, reject) => {
                this.messageAddedResolvers.set(timestampMs, resolve);
                setTimeout(() => {
                    if (this.messageAddedResolvers.has(timestampMs)) {
                        this.plugin.logger.warn(`[sendMessage id:${requestTimestampId}] Timeout HMA for UserMessage (ts: ${timestampMs}).`);
                        this.messageAddedResolvers.delete(timestampMs);
                        reject(new Error(`Timeout HMA for UserMessage (ts: ${timestampMs}).`));
                    }
                }, 10000);
            });
            yield this.plugin.chatManager.addMessageToActiveChat("user", content, timestamp, true);
            yield promise;
            this.plugin.logger.info(`[sendMessage id:${requestTimestampId}] UserMessage (ts: ${timestampMs}) processed by HMA.`);
        });
    }
    _managePlaceholder(turnTimestamp, requestTimestampId) {
        if (this.activePlaceholder && this.activePlaceholder.timestamp !== turnTimestamp) {
            if (this.activePlaceholder.groupEl.classList.contains("placeholder")) {
                this.plugin.logger.debug(`[sendMessage id:${requestTimestampId}] Removing stale placeholder (ts: ${this.activePlaceholder.timestamp}) for new turn (ts: ${turnTimestamp}).`);
                if (this.activePlaceholder.groupEl.isConnected)
                    this.activePlaceholder.groupEl.remove();
            }
            this.activePlaceholder = null;
        }
        if (!this.activePlaceholder) {
            this.plugin.logger.debug(`[sendMessage id:${requestTimestampId}] Creating placeholder for assistant response (expected ts: ${turnTimestamp}).`);
            const placeholderGroupEl = this.chatContainer.createDiv({ cls: `${CSS_CLASSES.MESSAGE_GROUP} ${CSS_CLASSES.OLLAMA_GROUP} placeholder` });
            placeholderGroupEl.setAttribute("data-placeholder-timestamp", turnTimestamp.toString());
            RendererUtils.renderAvatar(this.app, this.plugin, placeholderGroupEl, false, 'assistant');
            const wrapperEl = placeholderGroupEl.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
            wrapperEl.style.order = "2";
            const msgEl = wrapperEl.createDiv({ cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.OLLAMA_MESSAGE}` });
            const contentContainerEl = msgEl.createDiv({ cls: CSS_CLASSES.CONTENT_CONTAINER });
            const contentPlaceholderEl = contentContainerEl.createDiv({ cls: `${CSS_CLASSES.CONTENT} ${CSS_CLASSES.CONTENT_COLLAPSIBLE} streaming-text` });
            contentPlaceholderEl.empty();
            const dots = contentPlaceholderEl.createDiv({ cls: CSS_CLASSES.THINKING_DOTS });
            for (let i = 0; i < 3; i++)
                dots.createDiv({ cls: CSS_CLASSES.THINKING_DOT });
            this.activePlaceholder = { timestamp: turnTimestamp, groupEl: placeholderGroupEl, contentEl: contentPlaceholderEl, messageWrapper: wrapperEl };
            placeholderGroupEl.classList.add(CSS_CLASSES.MESSAGE_ARRIVING || "message-arriving");
            setTimeout(() => placeholderGroupEl === null || placeholderGroupEl === void 0 ? void 0 : placeholderGroupEl.classList.remove(CSS_CLASSES.MESSAGE_ARRIVING || "message-arriving"), 500);
            this.guaranteedScrollToBottom(50, true);
        }
        else {
            this.plugin.logger.debug(`[sendMessage id:${requestTimestampId}] Reusing active placeholder for new turn (ts: ${turnTimestamp}). Clearing content.`);
            this.activePlaceholder.contentEl.empty();
            const dots = this.activePlaceholder.contentEl.createDiv({ cls: CSS_CLASSES.THINKING_DOTS });
            for (let i = 0; i < 3; i++)
                dots.createDiv({ cls: CSS_CLASSES.THINKING_DOT });
            this.activePlaceholder.contentEl.classList.add("streaming-text");
            this.activePlaceholder.timestamp = turnTimestamp;
            this.activePlaceholder.groupEl.setAttribute("data-placeholder-timestamp", turnTimestamp.toString());
        }
    }
    _processLlmStream(stream, currentTurnLlmResponseTs, // Для перевірки актуальності плейсхолдера
    requestTimestampId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, stream_2, stream_2_1;
            var _b, e_2, _c, _d;
            var _e, _f, _g, _h, _j, _k, _l;
            let accumulatedContent = "";
            let nativeToolCalls = null;
            let assistantMessageWithNativeCalls = null;
            let firstChunkForTurn = true;
            try {
                for (_a = true, stream_2 = __asyncValues(stream); stream_2_1 = yield stream_2.next(), _b = stream_2_1.done, !_b; _a = true) {
                    _d = stream_2_1.value;
                    _a = false;
                    const chunk = _d;
                    if ((_e = this.currentAbortController) === null || _e === void 0 ? void 0 : _e.signal.aborted)
                        throw new Error("aborted by user");
                    if (chunk.type === "error")
                        throw new Error(chunk.error);
                    if (((_f = this.activePlaceholder) === null || _f === void 0 ? void 0 : _f.timestamp) !== currentTurnLlmResponseTs) {
                        this.plugin.logger.warn(`[sendMessage id:${requestTimestampId}][_processLlmStream] Stale placeholder detected. Current placeholder ts: ${(_g = this.activePlaceholder) === null || _g === void 0 ? void 0 : _g.timestamp}, expected for this stream: ${currentTurnLlmResponseTs}. Chunk ignored.`);
                        if (chunk.type === "done")
                            break;
                        continue;
                    }
                    if (chunk.type === "content") {
                        if ((_h = this.activePlaceholder) === null || _h === void 0 ? void 0 : _h.contentEl) {
                            if (firstChunkForTurn) {
                                const thinkingDots = this.activePlaceholder.contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
                                if (thinkingDots)
                                    thinkingDots.remove();
                                firstChunkForTurn = false;
                            }
                            accumulatedContent += chunk.response;
                            // await AssistantMessageRenderer.renderAssistantContent( // Статичний метод, який ви перенесли до MessageRendererUtils
                            //   this.app, this.view, this.plugin, this.activePlaceholder.contentEl, accumulatedContent
                            // );
                            if (chunk.type === "content") {
                                if ((_j = this.activePlaceholder) === null || _j === void 0 ? void 0 : _j.contentEl) {
                                    // ... (видалення крапок, firstChunkForTurn) ...
                                    accumulatedContent += chunk.response;
                                    yield RendererUtils.renderMarkdownContent(// Або AssistantMessageRenderer.renderAssistantContent
                                    this.app, this, // <--- Правильно: передаємо екземпляр OllamaView
                                    this.plugin, this.activePlaceholder.contentEl, // <--- Правильно: HTML елемент для контенту
                                    accumulatedContent // <--- Правильно: рядок з контентом
                                    );
                                    this.guaranteedScrollToBottom(30, true);
                                }
                            }
                            this.guaranteedScrollToBottom(30, true);
                        }
                    }
                    else if (chunk.type === "tool_calls") {
                        nativeToolCalls = chunk.calls;
                        assistantMessageWithNativeCalls = chunk.assistant_message_with_calls;
                        if (assistantMessageWithNativeCalls.content && !accumulatedContent.includes(assistantMessageWithNativeCalls.content)) {
                            if (firstChunkForTurn && ((_k = this.activePlaceholder) === null || _k === void 0 ? void 0 : _k.contentEl)) {
                                const thinkingDots = this.activePlaceholder.contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
                                if (thinkingDots)
                                    thinkingDots.remove();
                                firstChunkForTurn = false;
                            }
                            accumulatedContent += assistantMessageWithNativeCalls.content;
                            if ((_l = this.activePlaceholder) === null || _l === void 0 ? void 0 : _l.contentEl) {
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
            this.plugin.logger.error(`${accumulatedContent} accumulated from LLM stream.`);
            return { accumulatedContent, nativeToolCalls, assistantMessageWithNativeCalls };
        });
    }
    _determineToolCalls(nativeToolCalls, assistantMessageWithNativeCalls, accumulatedLlmContent, currentTurnLlmResponseTs, requestTimestampId) {
        let processedToolCallsThisTurn = nativeToolCalls;
        let isTextualFallbackUsed = false;
        let assistantMessageForHistory;
        if (!processedToolCallsThisTurn || processedToolCallsThisTurn.length === 0) {
            this.plugin.logger.debug(`[sendMessage id:${requestTimestampId}] No native tool_calls. Checking textual. Content length: ${accumulatedLlmContent.length}`);
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
                    content: accumulatedLlmContent, // Весь сирий текст від LLM
                    timestamp: new Date(currentTurnLlmResponseTs),
                };
                this.plugin.logger.info(`[sendMessage id:${requestTimestampId}] Orchestrator: Fallback textual tool_calls parsed (count: ${processedToolCallsThisTurn.length}).`);
            }
            else {
                // Немає ані нативних, ані текстових
                assistantMessageForHistory = {
                    role: "assistant",
                    content: accumulatedLlmContent,
                    timestamp: new Date(currentTurnLlmResponseTs),
                };
                this.plugin.logger.info(`[sendMessage id:${requestTimestampId}] Orchestrator: No native or textual tool calls. Final text response.`);
            }
        }
        else { // Були нативні tool_calls
            assistantMessageForHistory = assistantMessageWithNativeCalls || {
                role: "assistant",
                content: accumulatedLlmContent, // Може бути порожнім, якщо тільки tool_calls
                timestamp: new Date(currentTurnLlmResponseTs),
                tool_calls: processedToolCallsThisTurn
            };
            // Переконуємося, що контент та tool_calls актуальні
            assistantMessageForHistory.content = accumulatedLlmContent;
            assistantMessageForHistory.tool_calls = processedToolCallsThisTurn;
            this.plugin.logger.info(`[sendMessage id:${requestTimestampId}] Orchestrator: Native tool_calls detected (count: ${processedToolCallsThisTurn.length}).`);
        }
        return { processedToolCallsThisTurn, assistantMessageForHistory, isTextualFallbackUsed };
    }
    _executeAndRenderToolCycle(toolsToExecute, assistantMessageIntent, requestTimestampId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const currentViewInstance = this; // Зберігаємо this для використання в колбеках
            currentViewInstance.plugin.logger.info(`[OllamaView][_executeAndRenderToolCycle id:${requestTimestampId}] Executing ${toolsToExecute.length} tools.`);
            const assistantMsgTsMs = assistantMessageIntent.timestamp.getTime();
            const assistantHmaPromise = new Promise((resolve, reject) => {
                currentViewInstance.plugin.chatManager.registerHMAResolver(assistantMsgTsMs, resolve, reject);
                setTimeout(() => { if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(assistantMsgTsMs)) {
                    currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(assistantMsgTsMs, `HMA Timeout for assistant tool intent (ts: ${assistantMsgTsMs})`);
                } }, 10000);
            });
            yield currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(assistantMessageIntent, true);
            yield assistantHmaPromise;
            currentViewInstance.plugin.logger.info(`[OllamaView][_executeAndRenderToolCycle id:${requestTimestampId}] Assistant message with tool intent (ts: ${assistantMsgTsMs}) processed by HMA.`);
            if (((_a = currentViewInstance.activePlaceholder) === null || _a === void 0 ? void 0 : _a.timestamp) === assistantMsgTsMs) {
                currentViewInstance.plugin.logger.debug(`[OllamaView][_executeAndRenderToolCycle id:${requestTimestampId}] Clearing activePlaceholder (ts: ${assistantMsgTsMs}) as HMA processed the assistant message.`);
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
                        currentViewInstance.plugin.logger.error(`[OllamaView][_executeAndRenderToolCycle id:${requestTimestampId}] ${errorContent}`, e);
                        const errorToolTimestamp = new Date();
                        const errorToolMsg = { role: "tool", tool_call_id: call.id, name: toolName, content: errorContent, timestamp: errorToolTimestamp };
                        const toolErrorHmaPromise = new Promise((resolve, reject) => { currentViewInstance.plugin.chatManager.registerHMAResolver(errorToolMsg.timestamp.getTime(), resolve, reject); setTimeout(() => { if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(errorToolMsg.timestamp.getTime())) {
                            currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(errorToolMsg.timestamp.getTime(), "HMA timeout for tool error msg");
                        } }, 10000); });
                        yield currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(errorToolMsg, true);
                        try {
                            yield toolErrorHmaPromise;
                        }
                        catch (e_hma) {
                            currentViewInstance.plugin.logger.error(`[OllamaView][_executeAndRenderToolCycle id:${requestTimestampId}] HMA error/timeout for tool error message`, e_hma);
                        }
                        ;
                        continue;
                    }
                    currentViewInstance.plugin.logger.info(`[OllamaView][_executeAndRenderToolCycle id:${requestTimestampId}] Executing tool: ${toolName} with args:`, toolArgs);
                    const execResult = yield currentViewInstance.plugin.agentManager.executeTool(toolName, toolArgs);
                    const toolResultContent = execResult.success ? execResult.result : `Error executing tool ${toolName}: ${execResult.error || "Unknown tool error"}`;
                    const toolResponseTimestamp = new Date();
                    const toolResponseMsg = { role: "tool", tool_call_id: call.id, name: toolName, content: toolResultContent, timestamp: toolResponseTimestamp };
                    const toolResultHmaPromise = new Promise((resolve, reject) => { currentViewInstance.plugin.chatManager.registerHMAResolver(toolResponseMsg.timestamp.getTime(), resolve, reject); setTimeout(() => { if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(toolResponseMsg.timestamp.getTime())) {
                        currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(toolResponseMsg.timestamp.getTime(), `HMA Timeout for tool result: ${toolName}`);
                    } }, 10000); });
                    yield currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(toolResponseMsg, true);
                    yield toolResultHmaPromise;
                    currentViewInstance.plugin.logger.info(`[OllamaView][_executeAndRenderToolCycle id:${requestTimestampId}] Tool result for ${toolName} (ts: ${toolResponseMsg.timestamp.getTime()}) processed by HMA.`);
                }
            }
            currentViewInstance.plugin.logger.info(`[OllamaView][_executeAndRenderToolCycle id:${requestTimestampId}] Finished executing all tools for this turn.`);
        });
    }
    _renderFinalAssistantText(finalContent, responseTimestampMs, requestTimestampId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const currentViewInstance = this; // Зберігаємо this
            currentViewInstance.plugin.logger.debug(`[OllamaView][_renderFinalAssistantText id:${requestTimestampId}] Processing final text response (length: ${finalContent.length}).`);
            if (finalContent.trim()) {
                const finalAssistantMsg = { role: "assistant", content: finalContent, timestamp: new Date(responseTimestampMs) };
                currentViewInstance.plugin.logger.debug(`[OllamaView][_renderFinalAssistantText id:${requestTimestampId}] Adding final assistant message to ChatManager (ts: ${responseTimestampMs}).`);
                const hmaPromise = new Promise((resolve, reject) => { currentViewInstance.plugin.chatManager.registerHMAResolver(responseTimestampMs, resolve, reject); setTimeout(() => { if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(responseTimestampMs)) {
                    currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(responseTimestampMs, "HMA Timeout for final assistant message");
                } }, 10000); });
                yield currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(finalAssistantMsg, true);
                yield hmaPromise;
                currentViewInstance.plugin.logger.info(`[OllamaView][_renderFinalAssistantText id:${requestTimestampId}] Final assistant message (ts: ${responseTimestampMs}) processed by HMA.`);
            }
            else if (!((_a = currentViewInstance.currentAbortController) === null || _a === void 0 ? void 0 : _a.signal.aborted)) {
                // ... (обробка порожньої відповіді, аналогічно з використанням registerHMAResolver)
                const emptyResponseMsgTimestamp = new Date();
                const emptyResponseMsg = { role: "system", content: "Assistant provided an empty response.", timestamp: emptyResponseMsgTimestamp };
                const hmaPromise = new Promise((resolve, reject) => { currentViewInstance.plugin.chatManager.registerHMAResolver(emptyResponseMsg.timestamp.getTime(), resolve, reject); setTimeout(() => { if (currentViewInstance.plugin.chatManager.messageAddedResolvers.has(emptyResponseMsg.timestamp.getTime())) {
                    currentViewInstance.plugin.chatManager.rejectAndClearHMAResolver(emptyResponseMsg.timestamp.getTime(), "HMA timeout for empty sys msg");
                } }, 10000); });
                yield currentViewInstance.plugin.chatManager.addMessageToActiveChatPayload(emptyResponseMsg, true);
                try {
                    yield hmaPromise;
                }
                catch (e_hma) {
                    currentViewInstance.plugin.logger.error(`[OllamaView][_renderFinalAssistantText id:${requestTimestampId}] HMA error/timeout for empty response system message`, e_hma);
                }
            }
            if (((_b = currentViewInstance.activePlaceholder) === null || _b === void 0 ? void 0 : _b.timestamp) === responseTimestampMs) {
                currentViewInstance.plugin.logger.debug(`[OllamaView][_renderFinalAssistantText id:${requestTimestampId}] Clearing activePlaceholder (ts: ${responseTimestampMs}) after final assistant message/empty response.`);
                currentViewInstance.activePlaceholder = null;
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiT2xsYW1hVmlldy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIk9sbGFtYVZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLGVBQWU7QUFDZixPQUFPLEVBQ0wsUUFBUSxFQUVSLE9BQU8sRUFDUCxnQkFBZ0IsRUFDaEIsTUFBTSxFQUNOLFFBQVEsRUFDUixhQUFhLEVBQ2IsT0FBTyxFQUVQLElBQUksRUFDSixRQUFRLEdBQ1QsTUFBTSxVQUFVLENBQUM7QUFFbEIsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFFNUMsT0FBTyxFQUFjLFNBQVMsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUduRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFJOUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUUxQyxPQUFPLEtBQUssYUFBYSxNQUFNLHdCQUF3QixDQUFDO0FBQ3hELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUNsRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUV0RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5RCxNQUFNLENB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LENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQztvQkFBQSxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHlCQUF5QixDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDO2dCQUFBLENBQUMsQ0FBQSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztnQkFDbGMsTUFBTSxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLDZCQUE2QixDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUNuRyxJQUFJLENBQUM7b0JBQUMsTUFBTSxVQUFVLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxPQUFNLEtBQUssRUFBQyxDQUFDO29CQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLDZDQUE2QyxrQkFBa0IsdURBQXVELEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQUMsQ0FBQztZQUNuTixDQUFDO1lBRUQsSUFBSSxDQUFBLE1BQUEsbUJBQW1CLENBQUMsaUJBQWlCLDBDQUFFLFNBQVMsTUFBSyxtQkFBbUIsRUFBRSxDQUFDO2dCQUMzRSxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyw2Q0FBNkMsa0JBQWtCLHFDQUFxQyxtQkFBbUIsaURBQWlELENBQUMsQ0FBQztnQkFDbE4sbUJBQW1CLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO1lBQ2pELENBQUM7UUFDSCxDQUFDO0tBQUE7Q0FFRiIsInNvdXJjZXNDb250ZW50IjpbIi8vT2xsYW1hVmlldy50c1xyXG5pbXBvcnQge1xyXG4gIEl0ZW1WaWV3LFxyXG4gIFdvcmtzcGFjZUxlYWYsXHJcbiAgc2V0SWNvbixcclxuICBNYXJrZG93blJlbmRlcmVyLFxyXG4gIE5vdGljZSxcclxuICBkZWJvdW5jZSxcclxuICBub3JtYWxpemVQYXRoLFxyXG4gIFRGb2xkZXIsXHJcbiAgVEZpbGUsXHJcbiAgTWVudSxcclxuICBQbGF0Zm9ybSxcclxufSBmcm9tIFwib2JzaWRpYW5cIjtcclxuXHJcbmltcG9ydCB7IENvbmZpcm1Nb2RhbCB9IGZyb20gXCIuL0NvbmZpcm1Nb2RhbFwiO1xyXG5pbXBvcnQgeyBQcm9tcHRNb2RhbCB9IGZyb20gXCIuL1Byb21wdE1vZGFsXCI7XHJcbmltcG9ydCBPbGxhbWFQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xyXG5pbXBvcnQgeyBBdmF0YXJUeXBlLCBMQU5HVUFHRVMgfSBmcm9tIFwiLi9zZXR0aW5nc1wiO1xyXG5pbXBvcnQgeyBSb2xlSW5mbyB9IGZyb20gXCIuL0NoYXRNYW5hZ2VyXCI7XHJcbmltcG9ydCB7IENoYXQsIENoYXRNZXRhZGF0YSB9IGZyb20gXCIuL0NoYXRcIjtcclxuaW1wb3J0IHsgU3VtbWFyeU1vZGFsIH0gZnJvbSBcIi4vU3VtbWFyeU1vZGFsXCI7XHJcbmltcG9ydCB7IEFzc2lzdGFudE1lc3NhZ2UsIE1lc3NhZ2UsIE9sbGFtYUdlbmVyYXRlUmVzcG9uc2UsIFRvb2xDYWxsIH0gZnJvbSBcIi4vdHlwZXNcIjtcclxuaW1wb3J0IHsgTWVzc2FnZVJvbGUgYXMgTWVzc2FnZVJvbGVUeXBlRnJvbVR5cGVzIH0gZnJvbSBcIi4vdHlwZXNcIjsgXHJcblxyXG5pbXBvcnQgeyBDU1NfQ0xBU1NFUyB9IGZyb20gXCIuL2NvbnN0YW50c1wiO1xyXG5cclxuaW1wb3J0ICogYXMgUmVuZGVyZXJVdGlscyBmcm9tIFwiLi9NZXNzYWdlUmVuZGVyZXJVdGlsc1wiO1xyXG5pbXBvcnQgeyBVc2VyTWVzc2FnZVJlbmRlcmVyIH0gZnJvbSBcIi4vcmVuZGVyZXJzL1VzZXJNZXNzYWdlUmVuZGVyZXJcIjtcclxuaW1wb3J0IHsgQXNzaXN0YW50TWVzc2FnZVJlbmRlcmVyIH0gZnJvbSBcIi4vcmVuZGVyZXJzL0Fzc2lzdGFudE1lc3NhZ2VSZW5kZXJlclwiO1xyXG5pbXBvcnQgeyBTeXN0ZW1NZXNzYWdlUmVuZGVyZXIgfSBmcm9tIFwiLi9yZW5kZXJlcnMvU3lzdGVtTWVzc2FnZVJlbmRlcmVyXCI7XHJcbmltcG9ydCB7IEVycm9yTWVzc2FnZVJlbmRlcmVyIH0gZnJvbSBcIi4vcmVuZGVyZXJzL0Vycm9yTWVzc2FnZVJlbmRlcmVyXCI7XHJcbmltcG9ydCB7IEJhc2VNZXNzYWdlUmVuZGVyZXIgfSBmcm9tIFwiLi9yZW5kZXJlcnMvQmFzZU1lc3NhZ2VSZW5kZXJlclwiO1xyXG5pbXBvcnQgeyBTaWRlYmFyTWFuYWdlciB9IGZyb20gXCIuL1NpZGViYXJNYW5hZ2VyXCI7XHJcbmltcG9ydCB7IERyb3Bkb3duTWVudU1hbmFnZXIgfSBmcm9tIFwiLi9Ecm9wZG93bk1lbnVNYW5hZ2VyXCI7XHJcbmltcG9ydCB7IFRvb2xNZXNzYWdlUmVuZGVyZXIgfSBmcm9tIFwiLi9yZW5kZXJlcnMvVG9vbE1lc3NhZ2VSZW5kZXJlclwiO1xyXG5pbXBvcnQgeyBTdHJlYW1DaHVuayB9IGZyb20gXCIuL09sbGFtYVNlcnZpY2VcIjsgXHJcbmltcG9ydCB7IHBhcnNlQWxsVGV4dHVhbFRvb2xDYWxscyB9IGZyb20gXCIuL3V0aWxzL3Rvb2xQYXJzZXJcIjtcclxuXHJcbmV4cG9ydCBjb25zdCBWSUVXX1RZUEVfT0xMQU1BX1BFUlNPTkFTID0gXCJvbGxhbWEtcGVyc29uYXMtY2hhdC12aWV3XCI7XHJcblxyXG5jb25zdCBTQ1JPTExfVEhSRVNIT0xEID0gMTUwO1xyXG5cclxuY29uc3QgQ1NTX0NMQVNTX0NPTlRBSU5FUiA9IFwib2xsYW1hLWNvbnRhaW5lclwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfQ0hBVF9DT05UQUlORVIgPSBcIm9sbGFtYS1jaGF0LWNvbnRhaW5lclwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfSU5QVVRfQ09OVEFJTkVSID0gXCJjaGF0LWlucHV0LWNvbnRhaW5lclwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfQlVUVE9OU19DT05UQUlORVIgPSBcImJ1dHRvbnMtY29udGFpbmVyXCI7XHJcbmNvbnN0IENTU19DTEFTU19TRU5EX0JVVFRPTiA9IFwic2VuZC1idXR0b25cIjtcclxuY29uc3QgQ1NTX0NMQVNTX1ZPSUNFX0JVVFRPTiA9IFwidm9pY2UtYnV0dG9uXCI7XHJcbmNvbnN0IENTU19DTEFTU19UUkFOU0xBVEVfSU5QVVRfQlVUVE9OID0gXCJ0cmFuc2xhdGUtaW5wdXQtYnV0dG9uXCI7XHJcbmNvbnN0IENTU19DTEFTU19UUkFOU0xBVElOR19JTlBVVCA9IFwidHJhbnNsYXRpbmctaW5wdXRcIjtcclxuY29uc3QgQ1NTX0NMQVNTX0VNUFRZX1NUQVRFID0gXCJvbGxhbWEtZW1wdHktc3RhdGVcIjtcclxuZXhwb3J0IGNvbnN0IENTU19DTEFTU19NRVNTQUdFID0gXCJtZXNzYWdlXCI7XHJcbmNvbnN0IENTU19DTEFTU19FUlJPUl9URVhUID0gXCJlcnJvci1tZXNzYWdlLXRleHRcIjtcclxuY29uc3QgQ1NTX0NMQVNTX1RSQU5TTEFUSU9OX0NPTlRBSU5FUiA9IFwidHJhbnNsYXRpb24tY29udGFpbmVyXCI7XHJcbmNvbnN0IENTU19DTEFTU19UUkFOU0xBVElPTl9DT05URU5UID0gXCJ0cmFuc2xhdGlvbi1jb250ZW50XCI7XHJcbmNvbnN0IENTU19DTEFTU19UUkFOU0xBVElPTl9QRU5ESU5HID0gXCJ0cmFuc2xhdGlvbi1wZW5kaW5nXCI7XHJcbmNvbnN0IENTU19DTEFTU19SRUNPUkRJTkcgPSBcInJlY29yZGluZ1wiO1xyXG5jb25zdCBDU1NfQ0xBU1NfRElTQUJMRUQgPSBcImRpc2FibGVkXCI7XHJcbmNvbnN0IENTU19DTEFTU19EQVRFX1NFUEFSQVRPUiA9IFwiY2hhdC1kYXRlLXNlcGFyYXRvclwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfTkVXX01FU1NBR0VfSU5ESUNBVE9SID0gXCJuZXctbWVzc2FnZS1pbmRpY2F0b3JcIjtcclxuY29uc3QgQ1NTX0NMQVNTX1ZJU0lCTEUgPSBcInZpc2libGVcIjtcclxuY29uc3QgQ1NTX0NMQVNTX0NPTlRFTlRfQ09MTEFQU0VEID0gXCJtZXNzYWdlLWNvbnRlbnQtY29sbGFwc2VkXCI7XHJcbmNvbnN0IENTU19DTEFTU19NRU5VX09QVElPTiA9IFwibWVudS1vcHRpb25cIjtcclxuY29uc3QgQ1NTX0NMQVNTX01PREVMX0RJU1BMQVkgPSBcIm1vZGVsLWRpc3BsYXlcIjtcclxuY29uc3QgQ1NTX0NMQVNTX1JPTEVfRElTUExBWSA9IFwicm9sZS1kaXNwbGF5XCI7XHJcbmNvbnN0IENTU19DTEFTU19JTlBVVF9DT05UUk9MU19DT05UQUlORVIgPSBcImlucHV0LWNvbnRyb2xzLWNvbnRhaW5lclwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfSU5QVVRfQ09OVFJPTFNfTEVGVCA9IFwiaW5wdXQtY29udHJvbHMtbGVmdFwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfSU5QVVRfQ09OVFJPTFNfUklHSFQgPSBcImlucHV0LWNvbnRyb2xzLXJpZ2h0XCI7XHJcblxyXG5jb25zdCBDU1NfQ0xBU1NfVEVNUEVSQVRVUkVfSU5ESUNBVE9SID0gXCJ0ZW1wZXJhdHVyZS1pbmRpY2F0b3JcIjtcclxuXHJcbmNvbnN0IENTU19DTEFTU19UT0dHTEVfTE9DQVRJT05fQlVUVE9OID0gXCJ0b2dnbGUtbG9jYXRpb24tYnV0dG9uXCI7XHJcblxyXG5jb25zdCBDU1NfUk9MRV9QQU5FTF9JVEVNID0gXCJvbGxhbWEtcm9sZS1wYW5lbC1pdGVtXCI7XHJcbmNvbnN0IENTU19ST0xFX1BBTkVMX0lURU1fSUNPTiA9IFwib2xsYW1hLXJvbGUtcGFuZWwtaXRlbS1pY29uXCI7XHJcbmNvbnN0IENTU19ST0xFX1BBTkVMX0lURU1fVEVYVCA9IFwib2xsYW1hLXJvbGUtcGFuZWwtaXRlbS10ZXh0XCI7XHJcbmNvbnN0IENTU19ST0xFX1BBTkVMX0lURU1fQUNUSVZFID0gXCJpcy1hY3RpdmVcIjtcclxuY29uc3QgQ1NTX1JPTEVfUEFORUxfSVRFTV9DVVNUT00gPSBcImlzLWN1c3RvbVwiO1xyXG5jb25zdCBDU1NfUk9MRV9QQU5FTF9JVEVNX05PTkUgPSBcIm9sbGFtYS1yb2xlLXBhbmVsLWl0ZW0tbm9uZVwiO1xyXG5jb25zdCBDU1NfTUFJTl9DSEFUX0FSRUEgPSBcIm9sbGFtYS1tYWluLWNoYXQtYXJlYVwiO1xyXG5jb25zdCBDU1NfU0lERUJBUl9TRUNUSU9OX0lDT04gPSBcIm9sbGFtYS1zaWRlYmFyLXNlY3Rpb24taWNvblwiO1xyXG5jb25zdCBDU1NfQ0hBVF9JVEVNX09QVElPTlMgPSBcIm9sbGFtYS1jaGF0LWl0ZW0tb3B0aW9uc1wiO1xyXG5jb25zdCBDU1NfQ0xBU1NfU1RPUF9CVVRUT04gPSBcInN0b3AtZ2VuZXJhdGluZy1idXR0b25cIjtcclxuY29uc3QgQ1NTX0NMQVNTX1NDUk9MTF9CT1RUT01fQlVUVE9OID0gXCJzY3JvbGwtdG8tYm90dG9tLWJ1dHRvblwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfQ0hBVF9MSVNUX0lURU0gPSBcIm9sbGFtYS1jaGF0LWxpc3QtaXRlbVwiO1xyXG5jb25zdCBDU1NfQ0xBU1NfTUVOVV9CVVRUT04gPSBcIm1lbnUtYnV0dG9uXCI7XHJcblxyXG5jb25zdCBDU1NfQ0xBU1NfUkVTSVpFUl9IQU5ETEUgPSBcIm9sbGFtYS1yZXNpemVyLWhhbmRsZVwiOyAvLyDQndC+0LLQuNC5INC60LvQsNGBINC00LvRjyDRgNC+0LfQtNGW0LvRjNC90LjQutCwXHJcbmNvbnN0IENTU19DTEFTU19SRVNJWklORyA9IFwiaXMtcmVzaXppbmdcIjsgLy8g0JrQu9Cw0YEg0LTQu9GPIGJvZHkg0L/RltC0INGH0LDRgSDQv9C10YDQtdGC0Y/Qs9GD0LLQsNC90L3Rj1xyXG5cclxuLy8g0J3QsCDQv9C+0YfQsNGC0LrRgyBPbGxhbWFWaWV3LnRzXHJcbmV4cG9ydCB0eXBlIE1lc3NhZ2VSb2xlID0gXCJ1c2VyXCIgfCBcImFzc2lzdGFudFwiIHwgXCJzeXN0ZW1cIiB8IFwiZXJyb3JcIiB8IFwidG9vbFwiO1xyXG5cclxuZXhwb3J0IGNsYXNzIE9sbGFtYVZpZXcgZXh0ZW5kcyBJdGVtVmlldyB7XHJcbiAgcHJpdmF0ZSBzaWRlYmFyTWFuYWdlciE6IFNpZGViYXJNYW5hZ2VyO1xyXG4gIHByaXZhdGUgZHJvcGRvd25NZW51TWFuYWdlciE6IERyb3Bkb3duTWVudU1hbmFnZXI7XHJcblxyXG4gIHB1YmxpYyByZWFkb25seSBwbHVnaW46IE9sbGFtYVBsdWdpbjtcclxuICBwcml2YXRlIGNoYXRDb250YWluZXJFbCE6IEhUTUxFbGVtZW50O1xyXG4gIHByaXZhdGUgaW5wdXRFbCE6IEhUTUxUZXh0QXJlYUVsZW1lbnQ7XHJcbiAgcHJpdmF0ZSBjaGF0Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XHJcbiAgcHJpdmF0ZSBzZW5kQnV0dG9uITogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgcHJpdmF0ZSB2b2ljZUJ1dHRvbiE6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gIHByaXZhdGUgdHJhbnNsYXRlSW5wdXRCdXR0b24hOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICBwcml2YXRlIG1lbnVCdXR0b24hOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICBwcml2YXRlIGJ1dHRvbnNDb250YWluZXIhOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgcHJpdmF0ZSBtb2RlbERpc3BsYXlFbCE6IEhUTUxFbGVtZW50O1xyXG4gIHByaXZhdGUgcm9sZURpc3BsYXlFbCE6IEhUTUxFbGVtZW50O1xyXG5cclxuICBwcml2YXRlIHRlbXBlcmF0dXJlSW5kaWNhdG9yRWwhOiBIVE1MRWxlbWVudDtcclxuICBwcml2YXRlIHRvZ2dsZUxvY2F0aW9uQnV0dG9uITogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgcHJpdmF0ZSBuZXdDaGF0U2lkZWJhckJ1dHRvbiE6IEhUTUxCdXR0b25FbGVtZW50O1xyXG5cclxuICBwcml2YXRlIGlzUHJvY2Vzc2luZzogYm9vbGVhbiA9IGZhbHNlO1xyXG4gIHByaXZhdGUgc2Nyb2xsVGltZW91dDogTm9kZUpTLlRpbWVvdXQgfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIHNwZWVjaFdvcmtlcjogV29ya2VyIHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSBtZWRpYVJlY29yZGVyOiBNZWRpYVJlY29yZGVyIHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSBhdWRpb1N0cmVhbTogTWVkaWFTdHJlYW0gfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIGVtcHR5U3RhdGVFbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIHJlc2l6ZVRpbWVvdXQ6IE5vZGVKUy5UaW1lb3V0IHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSBzY3JvbGxMaXN0ZW5lckRlYm91bmNlZDogKCkgPT4gdm9pZDtcclxuICBwcml2YXRlIGN1cnJlbnRNZXNzYWdlczogTWVzc2FnZVtdID0gW107XHJcbiAgcHJpdmF0ZSBsYXN0UmVuZGVyZWRNZXNzYWdlRGF0ZTogRGF0ZSB8IG51bGwgPSBudWxsO1xyXG4gIHByaXZhdGUgbmV3TWVzc2FnZXNJbmRpY2F0b3JFbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIHVzZXJTY3JvbGxlZFVwOiBib29sZWFuID0gZmFsc2U7XHJcblxyXG4gIHByaXZhdGUgcm9sZVBhbmVsRWwhOiBIVE1MRWxlbWVudDtcclxuICBwcml2YXRlIHJvbGVQYW5lbExpc3RFbCE6IEhUTUxFbGVtZW50O1xyXG4gIHByaXZhdGUgbWFpbkNoYXRBcmVhRWwhOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgcHJpdmF0ZSBsYXN0UHJvY2Vzc2VkQ2hhdElkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgcHJpdmF0ZSBjaGF0UGFuZWxMaXN0RWwhOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgcHJpdmF0ZSBjaGF0UGFuZWxIZWFkZXJFbCE6IEhUTUxFbGVtZW50O1xyXG4gIHByaXZhdGUgcm9sZVBhbmVsSGVhZGVyRWwhOiBIVE1MRWxlbWVudDtcclxuICBwcml2YXRlIHJvbGVzU2VjdGlvbkNvbnRhaW5lckVsITogSFRNTEVsZW1lbnQ7XHJcbiAgcHJpdmF0ZSBzY3JvbGxUb0JvdHRvbUJ1dHRvbiE6IEhUTUxCdXR0b25FbGVtZW50O1xyXG5cclxuICBwcml2YXRlIHN0b3BHZW5lcmF0aW5nQnV0dG9uITogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgcHJpdmF0ZSBjdXJyZW50QWJvcnRDb250cm9sbGVyOiBBYm9ydENvbnRyb2xsZXIgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgcHJpdmF0ZSBsYXN0TWVzc2FnZUVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSBjb25zZWN1dGl2ZUVycm9yTWVzc2FnZXM6IE1lc3NhZ2VbXSA9IFtdO1xyXG4gIHByaXZhdGUgZXJyb3JHcm91cEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSBpc1N1bW1hcml6aW5nRXJyb3JzID0gZmFsc2U7XHJcblxyXG4gIHByaXZhdGUgdGVtcG9yYXJpbHlEaXNhYmxlQ2hhdENoYW5nZWRSZWxvYWQgPSBmYWxzZTtcclxuICBwcml2YXRlIGlzUmVnZW5lcmF0aW5nOiBib29sZWFuID0gZmFsc2U7IC8vINCd0L7QstC40Lkg0L/RgNCw0L/QvtGA0LXRhtGMXHJcbiAgcHJpdmF0ZSBtZXNzYWdlQWRkZWRSZXNvbHZlcnM6IE1hcDxudW1iZXIsICgpID0+IHZvaWQ+ID0gbmV3IE1hcCgpO1xyXG5cclxuICBwcml2YXRlIGlzQ2hhdExpc3RVcGRhdGVTY2hlZHVsZWQgPSBmYWxzZTtcclxuICBwcml2YXRlIGNoYXRMaXN0VXBkYXRlVGltZW91dElkOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xyXG5cclxuICBwcml2YXRlIGFjdGl2ZVBsYWNlaG9sZGVyOiB7XHJcbiAgICB0aW1lc3RhbXA6IG51bWJlcjtcclxuICAgIGdyb3VwRWw6IEhUTUxFbGVtZW50O1xyXG4gICAgY29udGVudEVsOiBIVE1MRWxlbWVudDtcclxuICAgIG1lc3NhZ2VXcmFwcGVyOiBIVE1MRWxlbWVudDtcclxuICB9IHwgbnVsbCA9IG51bGw7XHJcblxyXG4gIHByaXZhdGUgY3VycmVudE1lc3NhZ2VBZGRlZFJlc29sdmVyOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcclxuICAvLyAtLS0g0J3QvtCy0ZYg0LLQu9Cw0YHRgtC40LLQvtGB0YLRliAtLS1cclxuICBwcml2YXRlIHNpZGViYXJSb290RWwhOiBIVE1MRWxlbWVudDsgLy8g0J/QvtGB0LjQu9Cw0L3QvdGPINC90LAg0LrQvtGA0LXQvdC10LLQuNC5IGRpdiDRgdCw0LnQtNCx0LDRgNGDXHJcbiAgcHJpdmF0ZSByZXNpemVyRWwhOiBIVE1MRWxlbWVudDsgLy8g0J/QvtGB0LjQu9Cw0L3QvdGPINC90LAgZGl2INGA0L7Qt9C00ZbQu9GM0L3QuNC60LBcclxuICBwcml2YXRlIGlzUmVzaXppbmcgPSBmYWxzZTtcclxuICBwcml2YXRlIGluaXRpYWxNb3VzZVggPSAwO1xyXG4gIHByaXZhdGUgaW5pdGlhbFNpZGViYXJXaWR0aCA9IDA7XHJcbiAgcHJpdmF0ZSBib3VuZE9uRHJhZ01vdmU6IChldmVudDogTW91c2VFdmVudCkgPT4gdm9pZDsgLy8g0J7QsdGA0L7QsdC90LjQuiDRgNGD0YXRgyDQvNC40YjRllxyXG4gIHByaXZhdGUgYm91bmRPbkRyYWdFbmQ6IChldmVudDogTW91c2VFdmVudCkgPT4gdm9pZDsgLy8g0J7QsdGA0L7QsdC90LjQuiDQstGW0LTQv9GD0YHQutCw0L3QvdGPINC80LjRiNGWXHJcbiAgcHJpdmF0ZSBzYXZlV2lkdGhEZWJvdW5jZWQ6ICgpID0+IHZvaWQ7IC8vIERlYm91bmNlZCDRhNGD0L3QutGG0ZbRjyDQtNC70Y8g0LfQsdC10YDQtdC20LXQvdC90Y8g0YjQuNGA0LjQvdC4XHJcbiAgLy8gLS0tINCa0ZbQvdC10YbRjCDQvdC+0LLQuNGFINCy0LvQsNGB0YLQuNCy0L7RgdGC0LXQuSAtLS1cclxuXHJcbiAgY29uc3RydWN0b3IobGVhZjogV29ya3NwYWNlTGVhZiwgcGx1Z2luOiBPbGxhbWFQbHVnaW4pIHtcclxuICAgIHN1cGVyKGxlYWYpO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgICB0aGlzLmFwcCA9IHBsdWdpbi5hcHA7XHJcblxyXG4gICAgdGhpcy5pbml0U3BlZWNoV29ya2VyKCk7XHJcblxyXG4gICAgdGhpcy5zY3JvbGxMaXN0ZW5lckRlYm91bmNlZCA9IGRlYm91bmNlKHRoaXMuaGFuZGxlU2Nyb2xsLCAxNTAsIHRydWUpO1xyXG4gICAgdGhpcy5yZWdpc3RlcihcclxuICAgICAgdGhpcy5wbHVnaW4ub24oXCJmb2N1cy1pbnB1dC1yZXF1ZXN0XCIsICgpID0+IHtcclxuICAgICAgICB0aGlzLmZvY3VzSW5wdXQoKTtcclxuICAgICAgfSlcclxuICAgICk7XHJcbiAgICB0aGlzLmJvdW5kT25EcmFnTW92ZSA9IHRoaXMub25EcmFnTW92ZS5iaW5kKHRoaXMpO1xyXG4gICAgdGhpcy5ib3VuZE9uRHJhZ0VuZCA9IHRoaXMub25EcmFnRW5kLmJpbmQodGhpcyk7XHJcblxyXG4gICAgdGhpcy5zYXZlV2lkdGhEZWJvdW5jZWQgPSBkZWJvdW5jZSgoKSA9PiB7XHJcbiAgICAgIGlmICh0aGlzLnNpZGViYXJSb290RWwpIHtcclxuICAgICAgICBjb25zdCBuZXdXaWR0aCA9IHRoaXMuc2lkZWJhclJvb3RFbC5vZmZzZXRXaWR0aDtcclxuICAgICAgICAvLyDQl9Cx0LXRgNGW0LPQsNGU0LzQviwg0YLRltC70YzQutC4INGP0LrRidC+INGI0LjRgNC40L3QsCDQtNGW0LnRgdC90LAg0ZYg0LfQvNGW0L3QuNC70LDRgdGPXHJcbiAgICAgICAgaWYgKG5ld1dpZHRoID4gMCAmJiBuZXdXaWR0aCAhPT0gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2lkZWJhcldpZHRoKSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zaWRlYmFyV2lkdGggPSBuZXdXaWR0aDtcclxuICAgICAgICAgIC8vINCd0LUg0LLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviBhd2FpdCwgZGVib3VuY2Ug0YHQsNC8INC60LXRgNGD0ZQg0LDRgdC40L3RhdGA0L7QvdC90ZbRgdGC0Y5cclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSwgODAwKTsgLy8g0JfQsNGC0YDQuNC80LrQsCA4MDAg0LzRgSDQv9GW0YHQu9GPINC+0YHRgtCw0L3QvdGM0L7RlyDQt9C80ZbQvdC4XHJcbiAgfVxyXG5cclxuICBnZXRWaWV3VHlwZSgpOiBzdHJpbmcge1xyXG4gICAgcmV0dXJuIFZJRVdfVFlQRV9PTExBTUFfUEVSU09OQVM7XHJcbiAgfVxyXG4gIGdldERpc3BsYXlUZXh0KCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gXCJBSSBGb3JnZVwiO1xyXG4gIH1cclxuICBnZXRJY29uKCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gXCJicmFpbi1jaXJjdWl0XCI7XHJcbiAgfVxyXG5cclxuICAvLyBzcmMvT2xsYW1hVmlldy50c1xyXG5cclxuICBhc3luYyBvbk9wZW4oKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAvLyBcclxuXHJcbiAgICAvLyDQodC/0L7Rh9Cw0YLQutGDINGB0YLQstC+0YDRjtGU0LzQviBVSSwg0LLQutC70Y7Rh9Cw0Y7Rh9C4INGA0L7Qt9C00ZbQu9GM0L3QuNC6XHJcbiAgICB0aGlzLmNyZWF0ZVVJRWxlbWVudHMoKTtcclxuXHJcbiAgICAvLyAtLS0g0JfQsNGB0YLQvtGB0L7QstGD0ZTQvNC+INC30LHQtdGA0LXQttC10L3Rgy/QtNC10YTQvtC70YLQvdGDINGI0LjRgNC40L3RgyDRgdCw0LnQtNCx0LDRgNGDIC0tLVxyXG4gICAgY29uc3Qgc2F2ZWRXaWR0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnNpZGViYXJXaWR0aDtcclxuICAgIGlmICh0aGlzLnNpZGViYXJSb290RWwgJiYgc2F2ZWRXaWR0aCAmJiB0eXBlb2Ygc2F2ZWRXaWR0aCA9PT0gXCJudW1iZXJcIiAmJiBzYXZlZFdpZHRoID4gNTApIHtcclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLnN0eWxlLndpZHRoID0gYCR7c2F2ZWRXaWR0aH1weGA7XHJcbiAgICAgIHRoaXMuc2lkZWJhclJvb3RFbC5zdHlsZS5taW5XaWR0aCA9IGAke3NhdmVkV2lkdGh9cHhgO1xyXG4gICAgICBcclxuICAgIH0gZWxzZSBpZiAodGhpcy5zaWRlYmFyUm9vdEVsKSB7XHJcbiAgICAgIC8vINCS0YHRgtCw0L3QvtCy0LvRjtGU0LzQviDQtNC10YTQvtC70YLQvdGDINGI0LjRgNC40L3Rgywg0Y/QutGJ0L4g0LfQsdC10YDQtdC20LXQvdC+0Zcg0L3QtdC80LDRlCDQsNCx0L4g0LLQvtC90LAg0L3QtdCy0LDQu9GW0LTQvdCwXHJcbiAgICAgIGxldCBkZWZhdWx0V2lkdGggPSAyNTA7IC8vINCX0L3QsNGH0LXQvdC90Y8g0LfQsCDQt9Cw0LzQvtCy0YfRg9Cy0LDQvdC90Y/QvFxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIC8vINCh0L/RgNC+0LHRg9GU0LzQviDQv9GA0L7Rh9C40YLQsNGC0Lgg0LcgQ1NTINC30LzRltC90L3QvtGXXHJcbiAgICAgICAgY29uc3QgY3NzVmFyV2lkdGggPSBnZXRDb21wdXRlZFN0eWxlKHRoaXMuc2lkZWJhclJvb3RFbCkuZ2V0UHJvcGVydHlWYWx1ZShcIi0tYWktZm9yZ2Utc2lkZWJhci13aWR0aFwiKS50cmltKCk7XHJcbiAgICAgICAgaWYgKGNzc1ZhcldpZHRoICYmIGNzc1ZhcldpZHRoLmVuZHNXaXRoKFwicHhcIikpIHtcclxuICAgICAgICAgIGNvbnN0IHBhcnNlZFdpZHRoID0gcGFyc2VJbnQoY3NzVmFyV2lkdGgsIDEwKTtcclxuICAgICAgICAgIGlmICghaXNOYU4ocGFyc2VkV2lkdGgpICYmIHBhcnNlZFdpZHRoID4gNTApIHtcclxuICAgICAgICAgICAgZGVmYXVsdFdpZHRoID0gcGFyc2VkV2lkdGg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKFwiW09sbGFtYVZpZXddIENvdWxkIG5vdCByZWFkIGRlZmF1bHQgc2lkZWJhciB3aWR0aCBmcm9tIENTUyB2YXJpYWJsZS5cIiwgZSk7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLnN0eWxlLndpZHRoID0gYCR7ZGVmYXVsdFdpZHRofXB4YDtcclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLnN0eWxlLm1pbldpZHRoID0gYCR7ZGVmYXVsdFdpZHRofXB4YDtcclxuICAgICAgaWYgKCFzYXZlZFdpZHRoKSB7XHJcbiAgICAgICAgXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIC8vIC0tLSDQmtGW0L3QtdGG0Ywg0LfQsNGB0YLQvtGB0YPQstCw0L3QvdGPINGI0LjRgNC40L3QuCAtLS1cclxuXHJcbiAgICAvLyDQntC90L7QstC70Y7RlNC80L4g0L/QvtGH0LDRgtC60L7QstGWINC10LvQtdC80LXQvdGC0LggVUkgKNC/0LvQtdC50YHRhdC+0LvQtNC10YAsINGA0L7Qu9GMLCDQvNC+0LTQtdC70YwuLi4pXHJcbiAgICAvLyDQmtGA0LDRidC1INGA0L7QsdC40YLQuCDRhtC1INCf0IbQodCb0K8gbG9hZEFuZERpc3BsYXlBY3RpdmVDaGF0LCDRidC+0LEg0LzQsNGC0Lgg0LDQutGC0YPQsNC70YzQvdGWINC00LDQvdGWXHJcbiAgICAvLyDQntC00L3QsNC6LCDRidC+0LEg0YPQvdC40LrQvdGD0YLQuCBcItC80LjQs9C+0YLRltC90L3Rj1wiINC80L7QttC90LAg0LLRgdGC0LDQvdC+0LLQuNGC0Lgg0L/QvtGH0LDRgtC60L7QstGWINC30L3QsNGH0LXQvdC90Y8g0Lcg0L3QsNC70LDRiNGC0YPQstCw0L3RjFxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8g0JHQtdGA0LXQvNC+INC30L3QsNGH0LXQvdC90Y8g0Lcg0LPQu9C+0LHQsNC70YzQvdC40YUg0L3QsNC70LDRiNGC0YPQstCw0L3RjCDRj9C6INC/0L7Rh9Cw0YLQutC+0LLRllxyXG4gICAgICBjb25zdCBpbml0aWFsUm9sZVBhdGggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoO1xyXG4gICAgICBjb25zdCBpbml0aWFsUm9sZU5hbWUgPSBhd2FpdCB0aGlzLmZpbmRSb2xlTmFtZUJ5UGF0aChpbml0aWFsUm9sZVBhdGgpOyAvLyDQodC/0YDQvtCx0YPRlNC80L4g0LfQvdCw0LnRgtC4INGW0Lwn0Y9cclxuICAgICAgY29uc3QgaW5pdGlhbE1vZGVsTmFtZSA9IHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZTtcclxuICAgICAgY29uc3QgaW5pdGlhbFRlbXBlcmF0dXJlID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGVyYXR1cmU7XHJcblxyXG4gICAgICAvLyDQntC90L7QstC70Y7RlNC80L4g0LLRltC00L/QvtCy0ZbQtNC90ZYg0LXQu9C10LzQtdC90YLQuCBVSSDRhtC40LzQuCDQv9C+0YfQsNGC0LrQvtCy0LjQvNC4INC30L3QsNGH0LXQvdC90Y/QvNC4XHJcbiAgICAgIHRoaXMudXBkYXRlSW5wdXRQbGFjZWhvbGRlcihpbml0aWFsUm9sZU5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZVJvbGVEaXNwbGF5KGluaXRpYWxSb2xlTmFtZSk7XHJcbiAgICAgIHRoaXMudXBkYXRlTW9kZWxEaXNwbGF5KGluaXRpYWxNb2RlbE5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZVRlbXBlcmF0dXJlSW5kaWNhdG9yKGluaXRpYWxUZW1wZXJhdHVyZSk7XHJcbiAgICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIltPbGxhbWFWaWV3XSBJbml0aWFsIFVJIGVsZW1lbnRzIHVwZGF0ZWQgaW4gb25PcGVuICh1c2luZyBkZWZhdWx0cy9zZXR0aW5ncykuXCIpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW09sbGFtYVZpZXddIEVycm9yIGR1cmluZyBpbml0aWFsIFVJIGVsZW1lbnQgdXBkYXRlIGluIG9uT3BlbjpcIiwgZXJyb3IpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vINCf0YDQuNCyJ9GP0LfRg9GU0LzQviDQstGB0ZYg0L3QtdC+0LHRhdGW0LTQvdGWINC+0LHRgNC+0LHQvdC40LrQuCDQv9C+0LTRltC5IERPTSDRgtCwINC/0LvQsNCz0ZbQvdCwXHJcbiAgICB0aGlzLmF0dGFjaEV2ZW50TGlzdGVuZXJzKCk7IC8vINCS0LrQu9GO0YfQsNGUINGB0LvRg9GF0LDRhyDQtNC70Y8g0YDQvtC30LTRltC70YzQvdC40LrQsCDRgdCw0LnQtNCx0LDRgNGDXHJcblxyXG4gICAgLy8g0J3QsNC70LDRiNGC0L7QstGD0ZTQvNC+INC/0L7Qu9C1INCy0LLQvtC00YNcclxuICAgIHRoaXMuYXV0b1Jlc2l6ZVRleHRhcmVhKCk7IC8vINCS0YHRgtCw0L3QvtCy0LvRjtGU0LzQviDQv9C+0YfQsNGC0LrQvtCy0YMg0LLQuNGB0L7RgtGDXHJcbiAgICB0aGlzLnVwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpOyAvLyDQktGB0YLQsNC90L7QstC70Y7RlNC80L4g0L/QvtGH0LDRgtC60L7QstC40Lkg0YHRgtCw0L0g0LrQvdC+0L/QutC4IFNlbmRcclxuXHJcbiAgICAvLyDQl9Cw0LLQsNC90YLQsNC20YPRlNC80L4g0LDQutGC0LjQstC90LjQuSDRh9Cw0YIg0YLQsCDQvtCx0YDQvtCx0LvRj9GU0LzQviDQv9C+0YLQtdC90YbRltC50L3QtSDQvtC90L7QstC70LXQvdC90Y8g0LzQtdGC0LDQtNCw0L3QuNGFXHJcbiAgICB0cnkge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbT2xsYW1hVmlld10gb25PcGVuOiBDYWxsaW5nIGxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdC4uLlwiKTtcclxuICAgICAgLy8gbG9hZEFuZERpc3BsYXlBY3RpdmVDaGF0INC30LDQstCw0L3RgtCw0LbQuNGC0Ywg0LrQvtC90YLQtdC90YIsINC+0L3QvtCy0LjRgtGMINC10LvQtdC80LXQvdGC0Lgg0YLQuNC/0YMgbW9kZWwvcm9sZSBkaXNwbGF5INCyINGG0ZbQuSBWaWV3LFxyXG4gICAgICAvLyDQvNC+0LbQtSDQstC40L/RgNCw0LLQuNGC0Lgg0LzQtdGC0LDQtNCw0L3RliAo0YnQviDQstC40LrQu9C40YfQtSDQv9C+0LTRltGXICdjaGF0LWxpc3QtdXBkYXRlZCcgLT4gc2NoZWR1bGVTaWRlYmFyQ2hhdExpc3RVcGRhdGUpLFxyXG4gICAgICAvLyDQsNC70LUg0JHQhtCb0KzQqNCVINCd0JUg0J7QndCe0JLQm9Cu0IQg0KHQkNCZ0JTQkdCQ0KAg0J3QkNCf0KDQr9Cc0KMuXHJcbiAgICAgIGF3YWl0IHRoaXMubG9hZEFuZERpc3BsYXlBY3RpdmVDaGF0KCk7XHJcbiAgICAgIFxyXG5cclxuICAgICAgLy8gLS0tINCS0JjQlNCQ0JvQldCd0J4g0K/QktCd0JUg0J7QndCe0JLQm9CV0J3QndCvINCh0J/QmNCh0JrQhtCSINCh0JDQmdCU0JHQkNCg0KMgLS0tXHJcbiAgICAgIC8vINCi0LXQv9C10YAg0L/QvtC60LvQsNC00LDRlNC80L7RgdGPINC90LAg0L/QvtC00ZbRlzpcclxuICAgICAgLy8gMS4gJ2FjdGl2ZS1jaGF0LWNoYW5nZWQnLCDQt9Cz0LXQvdC10YDQvtCy0LDQvdCwINC/0ZbQtCDRh9Cw0YEgQ2hhdE1hbmFnZXIuaW5pdGlhbGl6ZSgpLCDQsdGD0LTQtSDQvtCx0YDQvtCx0LvQtdC90LAgaGFuZGxlQWN0aXZlQ2hhdENoYW5nZWQsXHJcbiAgICAgIC8vICAgINGP0LrQuNC5INCy0LjQutC70LjRh9C1IHNjaGVkdWxlU2lkZWJhckNoYXRMaXN0VXBkYXRlLlxyXG4gICAgICAvLyAyLiAnY2hhdC1saXN0LXVwZGF0ZWQnLCDRj9C60YnQviBsb2FkQW5kRGlzcGxheUFjdGl2ZUNoYXQg0LLQuNC/0YDQsNCy0LjQsiDQvNC10YLQsNC00LDQvdGWLCDQsdGD0LTQtSDQvtCx0YDQvtCx0LvQtdC90LAgaGFuZGxlQ2hhdExpc3RVcGRhdGVkLFxyXG4gICAgICAvLyAgICDRj9C60LjQuSDRgtCw0LrQvtC2INCy0LjQutC70LjRh9C1IHNjaGVkdWxlU2lkZWJhckNoYXRMaXN0VXBkYXRlLlxyXG4gICAgICAvLyDQnNC10YXQsNC90ZbQt9C8IHNjaGVkdWxlU2lkZWJhckNoYXRMaXN0VXBkYXRlINC+0LEn0ZTQtNC90LDRlCDRhtGWINCy0LjQutC70LjQutC4LlxyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXHJcbiAgICAgICAgXCJbT2xsYW1hVmlld10gb25PcGVuOiBTa2lwcGluZyBleHBsaWNpdCBzaWRlYmFyIHBhbmVsIHVwZGF0ZS4gUmVseWluZyBvbiBldmVudCBoYW5kbGVycyBhbmQgc2NoZWR1bGVyLlwiXHJcbiAgICAgICk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAvLyDQntCx0YDQvtCx0LrQsCDQv9C+0LzQuNC70L7Quiwg0YnQviDQvNC+0LPQu9C4INCy0LjQvdC40LrQvdGD0YLQuCDQv9GW0LQg0YfQsNGBIGxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdFxyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbT2xsYW1hVmlld10gRXJyb3IgZHVyaW5nIGluaXRpYWwgY2hhdCBsb2FkIG9yIHByb2Nlc3NpbmcgaW4gb25PcGVuOlwiLCBlcnJvcik7XHJcbiAgICAgIHRoaXMuc2hvd0VtcHR5U3RhdGUoKTsgLy8g0J/QvtC60LDQt9GD0ZTQvNC+INC/0L7RgNC+0LbQvdGW0Lkg0YHRgtCw0L0g0YfQsNGC0YMg0L/RgNC4INC/0L7QvNC40LvRhtGWXHJcbiAgICAgIC8vINCd0LDQstGW0YLRjCDQv9GA0Lgg0L/QvtC80LjQu9GG0ZYg0YLRg9GCLCDQv9C+0LTRltGPICdhY3RpdmUtY2hhdC1jaGFuZ2VkJyDQtyBDaGF0TWFuYWdlci5pbml0aWFsaXplICjRj9C60YnQviDQstC+0L3QsCDQsdGD0LvQsClcclxuICAgICAgLy8g0LLQttC1INC80LDQu9CwINCy0LjQutC70LjQutCw0YLQuCDQvtC90L7QstC70LXQvdC90Y8g0YHQsNC50LTQsdCw0YDRgyDRh9C10YDQtdC3IGhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkIC0+IHNjaGVkdWxlU2lkZWJhckNoYXRMaXN0VXBkYXRlLlxyXG4gICAgfVxyXG5cclxuICAgIC8vINCS0YHRgtCw0L3QvtCy0LvRjtGU0LzQviDRhNC+0LrRg9GBINC90LAg0L/QvtC70LUg0LLQstC+0LTRgyDQtyDQvdC10LLQtdC70LjQutC+0Y4g0LfQsNGC0YDQuNC80LrQvtGOXHJcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgLy8g0JTQvtC00LDRgtC60L7QstCwINC/0LXRgNC10LLRltGA0LrQsCwg0YfQuCB2aWV3INCy0YHQtSDRidC1INCw0LrRgtC40LLQvdC1L9GW0YHQvdGD0ZQg0ZYg0LLQuNC00LjQvNC1INC60L7RgNC40YHRgtGD0LLQsNGH0YNcclxuICAgICAgaWYgKHRoaXMuaW5wdXRFbCAmJiB0aGlzLmxlYWYudmlldyA9PT0gdGhpcyAmJiBkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHRoaXMuaW5wdXRFbCkpIHtcclxuICAgICAgICB0aGlzLmlucHV0RWwuZm9jdXMoKTtcclxuICAgICAgICBcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXHJcbiAgICAgICAgICBcIltPbGxhbWFWaWV3XSBJbnB1dCBmb2N1cyBza2lwcGVkIGluIG9uT3BlbiB0aW1lb3V0ICh2aWV3IG5vdCBhY3RpdmUvdmlzaWJsZSBvciBpbnB1dCBtaXNzaW5nKS5cIlxyXG4gICAgICAgICk7XHJcbiAgICAgIH1cclxuICAgIH0sIDE1MCk7IC8vINCX0LDRgtGA0LjQvNC60LAg0LzQvtC20LUg0LHRg9GC0Lgg0L/QvtGC0YDRltCx0L3QsCwg0YnQvtCxINC10LvQtdC80LXQvdGC0Lgg0LLRgdGC0LjQs9C70Lgg0LLRltC00YDQtdC90LTQtdGA0LjRgtC40YHRj1xyXG5cclxuICAgIC8vINCe0L3QvtCy0LvRjtGU0LzQviDQstC40YHQvtGC0YMgdGV4dGFyZWEg0L/RgNC+INCy0YHRj9C6INCy0LjQv9Cw0LTQvtC6ICjQvdCw0L/RgNC40LrQu9Cw0LQsINGP0LrRidC+INC/0L7Rh9Cw0YLQutC+0LLQtSDQt9C90LDRh9C10L3QvdGPINCx0YPQu9C+INC00L7QstCz0LjQvClcclxuICAgIGlmICh0aGlzLmlucHV0RWwpIHtcclxuICAgICAgdGhpcy5pbnB1dEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIikpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgfSAvLyAtLS0g0JrRltC90LXRhtGMINC80LXRgtC+0LTRgyBvbk9wZW4gLS0tXHJcblxyXG4gIGFzeW5jIG9uQ2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAvLyAtLS0g0JTQvtC00LDQvdC+INC+0YfQuNGJ0LXQvdC90Y8g0YHQu9GD0YXQsNGH0ZbQsiDQv9C10YDQtdGC0Y/Qs9GD0LLQsNC90L3RjyAtLS1cclxuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgdGhpcy5ib3VuZE9uRHJhZ01vdmUsIHsgY2FwdHVyZTogdHJ1ZSB9KTtcclxuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIHRoaXMuYm91bmRPbkRyYWdFbmQsIHsgY2FwdHVyZTogdHJ1ZSB9KTtcclxuICAgIC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4sINGH0Lgg0LrQu9Cw0YEg0LHRg9C70L4g0LTQvtC00LDQvdC+INC/0LXRgNC10LQg0LLQuNC00LDQu9C10L3QvdGP0LxcclxuICAgIGlmIChkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5jb250YWlucyhDU1NfQ0xBU1NfUkVTSVpJTkcpKSB7XHJcbiAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuY3Vyc29yID0gXCJcIjsgLy8g0J/QvtCy0LXRgNGC0LDRlNC80L4g0LrRg9GA0YHQvtGAXHJcbiAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NfUkVTSVpJTkcpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5pc1Jlc2l6aW5nID0gZmFsc2U7IC8vINCh0LrQuNC00LDRlNC80L4g0YHRgtCw0L0g0L/RgNC+INCy0YHRj9C6INCy0LjQv9Cw0LTQvtC6XHJcbiAgICAvLyAtLS1cclxuXHJcbiAgICAvLyAtLS0g0IbRgdC90YPRjtGH0LjQuSDQutC+0LQg0L7Rh9C40YnQtdC90L3RjyAtLS1cclxuICAgIGlmICh0aGlzLnNwZWVjaFdvcmtlcikge1xyXG4gICAgICB0aGlzLnNwZWVjaFdvcmtlci50ZXJtaW5hdGUoKTtcclxuICAgICAgdGhpcy5zcGVlY2hXb3JrZXIgPSBudWxsO1xyXG4gICAgfVxyXG4gICAgdGhpcy5zdG9wVm9pY2VSZWNvcmRpbmcoZmFsc2UpOyAvLyDQl9GD0L/QuNC90Y/RlNC80L4g0LfQsNC/0LjRgSDQsdC10Lcg0L7QsdGA0L7QsdC60LhcclxuICAgIGlmICh0aGlzLmF1ZGlvU3RyZWFtKSB7XHJcbiAgICAgIHRoaXMuYXVkaW9TdHJlYW0uZ2V0VHJhY2tzKCkuZm9yRWFjaCh0ID0+IHQuc3RvcCgpKTtcclxuICAgICAgdGhpcy5hdWRpb1N0cmVhbSA9IG51bGw7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5zY3JvbGxUaW1lb3V0KSBjbGVhclRpbWVvdXQodGhpcy5zY3JvbGxUaW1lb3V0KTtcclxuICAgIGlmICh0aGlzLnJlc2l6ZVRpbWVvdXQpIGNsZWFyVGltZW91dCh0aGlzLnJlc2l6ZVRpbWVvdXQpO1xyXG4gICAgdGhpcy5zaWRlYmFyTWFuYWdlcj8uZGVzdHJveSgpOyAvLyDQktC40LrQu9C40LrQsNGU0LzQviBkZXN0cm95INC00LvRjyDQvNC10L3QtdC00LbQtdGA0LAg0YHQsNC50LTQsdCw0YDRg1xyXG4gICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyPy5kZXN0cm95KCk7IC8vINCS0LjQutC70LjQutCw0ZTQvNC+IGRlc3Ryb3kg0LTQu9GPINC80LXQvdC10LTQttC10YDQsCDQvNC10L3RjlxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjcmVhdGVVSUVsZW1lbnRzKCk6IHZvaWQge1xyXG4gICAgdGhpcy5jb250ZW50RWwuZW1wdHkoKTsgLy8g0J7Rh9C40YnRg9GU0LzQviDQvtGB0L3QvtCy0L3QuNC5INC60L7QvdGC0LXQudC90LXRgCBWaWV3XHJcbiAgICAvLyDQodGC0LLQvtGA0Y7RlNC80L4g0LPQvtC70L7QstC90LjQuSBmbGV4LdC60L7QvdGC0LXQudC90LXRgCDQtNC70Y8g0YHQsNC50LTQsdCw0YDRgyDRgtCwINC+0LHQu9Cw0YHRgtGWINGH0LDRgtGDXHJcbiAgICBjb25zdCBmbGV4Q29udGFpbmVyID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9sbGFtYS1jb250YWluZXJcIiB9KTsgLy8g0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviBDU1NfQ0xBU1NfQ09OVEFJTkVSXHJcblxyXG4gICAgLy8g0JLQuNC30L3QsNGH0LDRlNC80L4sINC00LUg0LzQsNGUINCx0YPRgtC4IFZpZXcg0ZYg0YfQuCDRhtC1INC00LXRgdC60YLQvtC/XHJcbiAgICBjb25zdCBpc1NpZGViYXJMb2NhdGlvbiA9ICF0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuQ2hhdEluVGFiO1xyXG4gICAgY29uc3QgaXNEZXNrdG9wID0gUGxhdGZvcm0uaXNEZXNrdG9wO1xyXG5cclxuICAgIC8vIDEuINCh0YLQstC+0YDRjtGU0LzQviDQodCw0LnQtNCx0LDRgCDRliDQl9CR0JXQoNCG0JPQkNCE0JzQniDQn9Ce0KHQmNCb0JDQndCd0K8g0L3QsCDQutC+0YDQtdC90LXQstC40Lkg0LXQu9C10LzQtdC90YJcclxuICAgIHRoaXMuc2lkZWJhck1hbmFnZXIgPSBuZXcgU2lkZWJhck1hbmFnZXIodGhpcy5wbHVnaW4sIHRoaXMuYXBwLCB0aGlzKTtcclxuICAgIHRoaXMuc2lkZWJhclJvb3RFbCA9IHRoaXMuc2lkZWJhck1hbmFnZXIuY3JlYXRlU2lkZWJhclVJKGZsZXhDb250YWluZXIpOyAvLyDQl9Cx0LXRgNGW0LPQsNGU0LzQviDQv9C+0YHQuNC70LDQvdC90Y9cclxuXHJcbiAgICAvLyDQktGB0YLQsNC90L7QstC70Y7RlNC80L4g0LLQuNC00LjQvNGW0YHRgtGMINCy0L3Rg9GC0YDRltGI0L3RjNC+0LPQviDRgdCw0LnQtNCx0LDRgNCwXHJcbiAgICBjb25zdCBzaG91bGRTaG93SW50ZXJuYWxTaWRlYmFyID0gaXNEZXNrdG9wICYmICFpc1NpZGViYXJMb2NhdGlvbjtcclxuICAgIGlmICh0aGlzLnNpZGViYXJSb290RWwpIHtcclxuICAgICAgLy8g0JTQvtC00LDRlNC80L4g0LDQsdC+INCy0LjQtNCw0LvRj9GU0LzQviDQutC70LDRgSDQtNC70Y8g0L/RgNC40YXQvtCy0YPQstCw0L3QvdGPL9C/0L7QutCw0LfRgyDRh9C10YDQtdC3IENTU1xyXG4gICAgICB0aGlzLnNpZGViYXJSb290RWwuY2xhc3NMaXN0LnRvZ2dsZShcImludGVybmFsLXNpZGViYXItaGlkZGVuXCIsICFzaG91bGRTaG93SW50ZXJuYWxTaWRlYmFyKTtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgIGBbT2xsYW1hVmlld10gSW50ZXJuYWwgc2lkZWJhciB2aXNpYmlsaXR5IHNldCAoaGlkZGVuOiAkeyFzaG91bGRTaG93SW50ZXJuYWxTaWRlYmFyfSkuIENsYXNzZXM6ICR7XHJcbiAgICAgICAgICB0aGlzLnNpZGViYXJSb290RWwuY2xhc3NOYW1lXHJcbiAgICAgICAgfWBcclxuICAgICAgKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gLS0tINCU0J7QlNCQ0J3Qnjog0KHRgtCy0L7RgNGO0ZTQvNC+INCg0L7Qt9C00ZbQu9GM0L3QuNC6INC80ZbQtiDRgdCw0LnQtNCx0LDRgNC+0Lwg0YLQsCDRh9Cw0YLQvtC8IC0tLVxyXG4gICAgdGhpcy5yZXNpemVyRWwgPSBmbGV4Q29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogQ1NTX0NMQVNTX1JFU0laRVJfSEFORExFIH0pO1xyXG4gICAgdGhpcy5yZXNpemVyRWwudGl0bGUgPSBcIkRyYWcgdG8gcmVzaXplIHNpZGViYXJcIjtcclxuICAgIC8vINCf0YDQuNGF0L7QstGD0ZTQvNC+INGA0L7Qt9C00ZbQu9GM0L3QuNC6INGA0LDQt9C+0Lwg0ZbQtyDRgdCw0LnQtNCx0LDRgNC+0LxcclxuICAgIHRoaXMucmVzaXplckVsLmNsYXNzTGlzdC50b2dnbGUoXCJpbnRlcm5hbC1zaWRlYmFyLWhpZGRlblwiLCAhc2hvdWxkU2hvd0ludGVybmFsU2lkZWJhcik7XHJcbiAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtPbGxhbWFWaWV3XSBSZXNpemVyIGVsZW1lbnQgY3JlYXRlZCAoaGlkZGVuOiAkeyFzaG91bGRTaG93SW50ZXJuYWxTaWRlYmFyfSkuYCk7XHJcbiAgICAvLyAtLS0g0JrQhtCd0JXQptCsINCU0J7QlNCQ0J3QntCT0J4gLS0tXHJcblxyXG4gICAgLy8gMi4g0KHRgtCy0L7RgNGO0ZTQvNC+INCe0YHQvdC+0LLQvdGDINCe0LHQu9Cw0YHRgtGMINCn0LDRgtGDXHJcbiAgICB0aGlzLm1haW5DaGF0QXJlYUVsID0gZmxleENvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwib2xsYW1hLW1haW4tY2hhdC1hcmVhXCIgfSk7IC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4gQ1NTX01BSU5fQ0hBVF9BUkVBXHJcbiAgICAvLyDQlNC+0LTQsNGU0LzQviDQutC70LDRgSwg0Y/QutGJ0L4g0YHQsNC50LTQsdCw0YAg0L/RgNC40YXQvtCy0LDQvdC+LCDRidC+0LEg0L7QsdC70LDRgdGC0Ywg0YfQsNGC0YMg0LfQsNC50LzQsNC70LAg0LLRgdGOINGI0LjRgNC40L3Rg1xyXG4gICAgdGhpcy5tYWluQ2hhdEFyZWFFbC5jbGFzc0xpc3QudG9nZ2xlKFwiZnVsbC13aWR0aFwiLCAhc2hvdWxkU2hvd0ludGVybmFsU2lkZWJhcik7XHJcblxyXG4gICAgLy8gLS0tINCh0YLQstC+0YDQtdC90L3RjyDRgNC10YjRgtC4INC10LvQtdC80LXQvdGC0ZbQsiBVSSDQstGB0LXRgNC10LTQuNC90ZYgbWFpbkNoYXRBcmVhRWwgLS0tXHJcbiAgICB0aGlzLmNoYXRDb250YWluZXJFbCA9IHRoaXMubWFpbkNoYXRBcmVhRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9sbGFtYS1jaGF0LWFyZWEtY29udGVudFwiIH0pO1xyXG4gICAgdGhpcy5jaGF0Q29udGFpbmVyID0gdGhpcy5jaGF0Q29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9sbGFtYS1jaGF0LWNvbnRhaW5lclwiIH0pO1xyXG4gICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsID0gdGhpcy5jaGF0Q29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm5ldy1tZXNzYWdlLWluZGljYXRvclwiIH0pO1xyXG4gICAgc2V0SWNvbih0aGlzLm5ld01lc3NhZ2VzSW5kaWNhdG9yRWwuY3JlYXRlU3Bhbih7IGNsczogXCJpbmRpY2F0b3ItaWNvblwiIH0pLCBcImFycm93LWRvd25cIik7XHJcbiAgICB0aGlzLm5ld01lc3NhZ2VzSW5kaWNhdG9yRWwuY3JlYXRlU3Bhbih7IHRleHQ6IFwiIE5ldyBNZXNzYWdlc1wiIH0pO1xyXG4gICAgdGhpcy5zY3JvbGxUb0JvdHRvbUJ1dHRvbiA9IHRoaXMuY2hhdENvbnRhaW5lckVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcclxuICAgICAgY2xzOiBbXCJzY3JvbGwtdG8tYm90dG9tLWJ1dHRvblwiLCBcImNsaWNrYWJsZS1pY29uXCJdLFxyXG4gICAgICBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIlNjcm9sbCB0byBib3R0b21cIiwgdGl0bGU6IFwiU2Nyb2xsIHRvIGJvdHRvbVwiIH0sXHJcbiAgICB9KTtcclxuICAgIHNldEljb24odGhpcy5zY3JvbGxUb0JvdHRvbUJ1dHRvbiwgXCJhcnJvdy1kb3duXCIpO1xyXG4gICAgY29uc3QgaW5wdXRDb250YWluZXIgPSB0aGlzLm1haW5DaGF0QXJlYUVsLmNyZWF0ZURpdih7IGNsczogXCJjaGF0LWlucHV0LWNvbnRhaW5lclwiIH0pO1xyXG4gICAgdGhpcy5pbnB1dEVsID0gaW5wdXRDb250YWluZXIuY3JlYXRlRWwoXCJ0ZXh0YXJlYVwiLCB7XHJcbiAgICAgIGF0dHI6IHsgcGxhY2Vob2xkZXI6IGBFbnRlciBtZXNzYWdlIHRleHQgaGVyZS4uLmAsIHJvd3M6IDEgfSxcclxuICAgIH0pO1xyXG4gICAgY29uc3QgY29udHJvbHNDb250YWluZXIgPSBpbnB1dENvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwiaW5wdXQtY29udHJvbHMtY29udGFpbmVyXCIgfSk7XHJcbiAgICBjb25zdCBsZWZ0Q29udHJvbHMgPSBjb250cm9sc0NvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwiaW5wdXQtY29udHJvbHMtbGVmdFwiIH0pO1xyXG4gICAgdGhpcy50cmFuc2xhdGVJbnB1dEJ1dHRvbiA9IGxlZnRDb250cm9scy5jcmVhdGVFbChcImJ1dHRvblwiLCB7XHJcbiAgICAgIGNsczogXCJ0cmFuc2xhdGUtaW5wdXQtYnV0dG9uXCIsXHJcbiAgICAgIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiVHJhbnNsYXRlIGlucHV0IHRvIEVuZ2xpc2hcIiB9LFxyXG4gICAgfSk7XHJcbiAgICBzZXRJY29uKHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24sIFwibGFuZ3VhZ2VzXCIpO1xyXG4gICAgdGhpcy50cmFuc2xhdGVJbnB1dEJ1dHRvbi50aXRsZSA9IFwiVHJhbnNsYXRlIGlucHV0IHRvIEVuZ2xpc2hcIjtcclxuICAgIHRoaXMubW9kZWxEaXNwbGF5RWwgPSBsZWZ0Q29udHJvbHMuY3JlYXRlRGl2KHsgY2xzOiBcIm1vZGVsLWRpc3BsYXlcIiB9KTtcclxuICAgIHRoaXMubW9kZWxEaXNwbGF5RWwuc2V0VGV4dChcIi4uLlwiKTtcclxuICAgIHRoaXMubW9kZWxEaXNwbGF5RWwudGl0bGUgPSBcIkNsaWNrIHRvIHNlbGVjdCBtb2RlbFwiO1xyXG4gICAgdGhpcy5yb2xlRGlzcGxheUVsID0gbGVmdENvbnRyb2xzLmNyZWF0ZURpdih7IGNsczogXCJyb2xlLWRpc3BsYXlcIiB9KTtcclxuICAgIHRoaXMucm9sZURpc3BsYXlFbC5zZXRUZXh0KFwiLi4uXCIpO1xyXG4gICAgdGhpcy5yb2xlRGlzcGxheUVsLnRpdGxlID0gXCJDbGljayB0byBzZWxlY3Qgcm9sZVwiO1xyXG4gICAgdGhpcy50ZW1wZXJhdHVyZUluZGljYXRvckVsID0gbGVmdENvbnRyb2xzLmNyZWF0ZURpdih7IGNsczogXCJ0ZW1wZXJhdHVyZS1pbmRpY2F0b3JcIiB9KTtcclxuICAgIHRoaXMudGVtcGVyYXR1cmVJbmRpY2F0b3JFbC5zZXRUZXh0KFwiP1wiKTtcclxuICAgIHRoaXMudGVtcGVyYXR1cmVJbmRpY2F0b3JFbC50aXRsZSA9IFwiQ2xpY2sgdG8gc2V0IHRlbXBlcmF0dXJlXCI7XHJcbiAgICB0aGlzLmJ1dHRvbnNDb250YWluZXIgPSBjb250cm9sc0NvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IGBidXR0b25zLWNvbnRhaW5lciBpbnB1dC1jb250cm9scy1yaWdodGAgfSk7XHJcbiAgICB0aGlzLnN0b3BHZW5lcmF0aW5nQnV0dG9uID0gdGhpcy5idXR0b25zQ29udGFpbmVyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcclxuICAgICAgY2xzOiBbXCJzdG9wLWdlbmVyYXRpbmctYnV0dG9uXCIsIFwiZGFuZ2VyLW9wdGlvblwiXSxcclxuICAgICAgYXR0cjogeyBcImFyaWEtbGFiZWxcIjogXCJTdG9wIEdlbmVyYXRpb25cIiwgdGl0bGU6IFwiU3RvcCBHZW5lcmF0aW9uXCIgfSxcclxuICAgIH0pOyAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INC60L7QvdGB0YLQsNC90YLRgyBDU1NfQ0xBU1NFUy5EQU5HRVJfT1BUSU9OXHJcbiAgICBzZXRJY29uKHRoaXMuc3RvcEdlbmVyYXRpbmdCdXR0b24sIFwic3F1YXJlXCIpO1xyXG4gICAgdGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbi5oaWRlKCk7XHJcbiAgICB0aGlzLnNlbmRCdXR0b24gPSB0aGlzLmJ1dHRvbnNDb250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwic2VuZC1idXR0b25cIiwgYXR0cjogeyBcImFyaWEtbGFiZWxcIjogXCJTZW5kXCIgfSB9KTtcclxuICAgIHNldEljb24odGhpcy5zZW5kQnV0dG9uLCBcInNlbmRcIik7XHJcbiAgICB0aGlzLnZvaWNlQnV0dG9uID0gdGhpcy5idXR0b25zQ29udGFpbmVyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcclxuICAgICAgY2xzOiBcInZvaWNlLWJ1dHRvblwiLFxyXG4gICAgICBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIlZvaWNlIElucHV0XCIgfSxcclxuICAgIH0pO1xyXG4gICAgc2V0SWNvbih0aGlzLnZvaWNlQnV0dG9uLCBcIm1pY1wiKTtcclxuICAgIHRoaXMudG9nZ2xlTG9jYXRpb25CdXR0b24gPSB0aGlzLmJ1dHRvbnNDb250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwge1xyXG4gICAgICBjbHM6IFwidG9nZ2xlLWxvY2F0aW9uLWJ1dHRvblwiLFxyXG4gICAgICBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIlRvZ2dsZSBWaWV3IExvY2F0aW9uXCIgfSxcclxuICAgIH0pO1xyXG4gICAgdGhpcy5tZW51QnV0dG9uID0gdGhpcy5idXR0b25zQ29udGFpbmVyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgY2xzOiBcIm1lbnUtYnV0dG9uXCIsIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiTWVudVwiIH0gfSk7XHJcbiAgICBzZXRJY29uKHRoaXMubWVudUJ1dHRvbiwgXCJtb3JlLXZlcnRpY2FsXCIpO1xyXG4gICAgdGhpcy51cGRhdGVUb2dnbGVMb2NhdGlvbkJ1dHRvbigpOyAvLyDQktGB0YLQsNC90L7QstC70Y7RlCDRltC60L7QvdC60YMvdGl0bGVcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlciA9IG5ldyBEcm9wZG93bk1lbnVNYW5hZ2VyKFxyXG4gICAgICB0aGlzLnBsdWdpbixcclxuICAgICAgdGhpcy5hcHAsXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgIGlucHV0Q29udGFpbmVyLFxyXG4gICAgICBpc1NpZGViYXJMb2NhdGlvbixcclxuICAgICAgaXNEZXNrdG9wXHJcbiAgICApO1xyXG4gICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyLmNyZWF0ZU1lbnVVSSgpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhdHRhY2hFdmVudExpc3RlbmVycygpOiB2b2lkIHtcclxuICAgIC8vIC0tLSDQlNCe0JTQkNCd0J46INCh0LvRg9GF0LDRhyDQtNC70Y8g0YDQvtC30LTRltC70YzQvdC40LrQsCAtLS1cclxuICAgIGlmICh0aGlzLnJlc2l6ZXJFbCkge1xyXG4gICAgICAvLyDQlNC+0LTQsNGU0LzQviDRgdC70YPRhdCw0YcgbW91c2Vkb3duINC00L4g0YDQvtC30LTRltC70YzQvdC40LrQsFxyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5yZXNpemVyRWwsIFwibW91c2Vkb3duXCIsIHRoaXMub25EcmFnU3RhcnQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiUmVzaXplciBlbGVtZW50IChyZXNpemVyRWwpIG5vdCBmb3VuZCBkdXJpbmcgbGlzdGVuZXIgYXR0YWNobWVudCFcIik7XHJcbiAgICB9XHJcbiAgICAvLyAtLS1cclxuXHJcbiAgICAvLyAtLS0g0KDQtdGU0YHRgtGA0LDRhtGW0Y8g0LLRgdGW0YUg0ZbQvdGI0LjRhSDRgdC70YPRhdCw0YfRltCyINGP0Log0YDQsNC90ZbRiNC1IC0tLVxyXG4gICAgaWYgKHRoaXMuaW5wdXRFbCkge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5pbnB1dEVsLCBcImtleWRvd25cIiwgdGhpcy5oYW5kbGVLZXlEb3duKTtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMuaW5wdXRFbCwgXCJpbnB1dFwiLCB0aGlzLmhhbmRsZUlucHV0Rm9yUmVzaXplKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnNlbmRCdXR0b24pIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMuc2VuZEJ1dHRvbiwgXCJjbGlja1wiLCB0aGlzLmhhbmRsZVNlbmRDbGljayk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbikge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbiwgXCJjbGlja1wiLCB0aGlzLmNhbmNlbEdlbmVyYXRpb24pO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMudm9pY2VCdXR0b24pIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMudm9pY2VCdXR0b24sIFwiY2xpY2tcIiwgdGhpcy5oYW5kbGVWb2ljZUNsaWNrKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uKSB7XHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLCBcImNsaWNrXCIsIHRoaXMuaGFuZGxlVHJhbnNsYXRlSW5wdXRDbGljayk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5tZW51QnV0dG9uKSB7XHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh0aGlzLm1lbnVCdXR0b24sIFwiY2xpY2tcIiwgdGhpcy5oYW5kbGVNZW51QnV0dG9uQ2xpY2spO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMudG9nZ2xlTG9jYXRpb25CdXR0b24pIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMudG9nZ2xlTG9jYXRpb25CdXR0b24sIFwiY2xpY2tcIiwgdGhpcy5oYW5kbGVUb2dnbGVWaWV3TG9jYXRpb25DbGljayk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5tb2RlbERpc3BsYXlFbCkge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5tb2RlbERpc3BsYXlFbCwgXCJjbGlja1wiLCB0aGlzLmhhbmRsZU1vZGVsRGlzcGxheUNsaWNrKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnJvbGVEaXNwbGF5RWwpIHtcclxuICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMucm9sZURpc3BsYXlFbCwgXCJjbGlja1wiLCB0aGlzLmhhbmRsZVJvbGVEaXNwbGF5Q2xpY2spO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMudGVtcGVyYXR1cmVJbmRpY2F0b3JFbCkge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy50ZW1wZXJhdHVyZUluZGljYXRvckVsLCBcImNsaWNrXCIsIHRoaXMuaGFuZGxlVGVtcGVyYXR1cmVDbGljayk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5jaGF0Q29udGFpbmVyKSB7XHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh0aGlzLmNoYXRDb250YWluZXIsIFwic2Nyb2xsXCIsIHRoaXMuc2Nyb2xsTGlzdGVuZXJEZWJvdW5jZWQpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMubmV3TWVzc2FnZXNJbmRpY2F0b3JFbCkge1xyXG4gICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsLCBcImNsaWNrXCIsIHRoaXMuaGFuZGxlTmV3TWVzc2FnZUluZGljYXRvckNsaWNrKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnNjcm9sbFRvQm90dG9tQnV0dG9uKSB7XHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh0aGlzLnNjcm9sbFRvQm90dG9tQnV0dG9uLCBcImNsaWNrXCIsIHRoaXMuaGFuZGxlU2Nyb2xsVG9Cb3R0b21DbGljayk7XHJcbiAgICB9XHJcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCBcInJlc2l6ZVwiLCB0aGlzLmhhbmRsZVdpbmRvd1Jlc2l6ZSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQsIFwiY2xpY2tcIiwgdGhpcy5oYW5kbGVEb2N1bWVudENsaWNrRm9yTWVudSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQsIFwidmlzaWJpbGl0eWNoYW5nZVwiLCB0aGlzLmhhbmRsZVZpc2liaWxpdHlDaGFuZ2UpO1xyXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImFjdGl2ZS1sZWFmLWNoYW5nZVwiLCB0aGlzLmhhbmRsZUFjdGl2ZUxlYWZDaGFuZ2UpKTtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uYXR0YWNoRXZlbnRMaXN0ZW5lcnMoKTtcclxuICAgIHRoaXMucmVnaXN0ZXIodGhpcy5wbHVnaW4ub24oXCJtb2RlbC1jaGFuZ2VkXCIsIG1vZGVsTmFtZSA9PiB0aGlzLmhhbmRsZU1vZGVsQ2hhbmdlKG1vZGVsTmFtZSkpKTtcclxuICAgIHRoaXMucmVnaXN0ZXIodGhpcy5wbHVnaW4ub24oXCJyb2xlLWNoYW5nZWRcIiwgcm9sZU5hbWUgPT4gdGhpcy5oYW5kbGVSb2xlQ2hhbmdlKHJvbGVOYW1lKSkpO1xyXG4gICAgdGhpcy5yZWdpc3Rlcih0aGlzLnBsdWdpbi5vbihcInJvbGVzLXVwZGF0ZWRcIiwgKCkgPT4gdGhpcy5oYW5kbGVSb2xlc1VwZGF0ZWQoKSkpO1xyXG4gICAgdGhpcy5yZWdpc3Rlcih0aGlzLnBsdWdpbi5vbihcIm1lc3NhZ2UtYWRkZWRcIiwgZGF0YSA9PiB0aGlzLmhhbmRsZU1lc3NhZ2VBZGRlZChkYXRhKSkpO1xyXG4gICAgdGhpcy5yZWdpc3Rlcih0aGlzLnBsdWdpbi5vbihcImFjdGl2ZS1jaGF0LWNoYW5nZWRcIiwgZGF0YSA9PiB0aGlzLmhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkKGRhdGEpKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyKHRoaXMucGx1Z2luLm9uKFwibWVzc2FnZXMtY2xlYXJlZFwiLCBjaGF0SWQgPT4gdGhpcy5oYW5kbGVNZXNzYWdlc0NsZWFyZWQoY2hhdElkKSkpO1xyXG4gICAgdGhpcy5yZWdpc3Rlcih0aGlzLnBsdWdpbi5vbihcImNoYXQtbGlzdC11cGRhdGVkXCIsICgpID0+IHRoaXMuaGFuZGxlQ2hhdExpc3RVcGRhdGVkKCkpKTtcclxuICAgIHRoaXMucmVnaXN0ZXIodGhpcy5wbHVnaW4ub24oXCJzZXR0aW5ncy11cGRhdGVkXCIsICgpID0+IHRoaXMuaGFuZGxlU2V0dGluZ3NVcGRhdGVkKCkpKTtcclxuICAgIHRoaXMucmVnaXN0ZXIodGhpcy5wbHVnaW4ub24oXCJtZXNzYWdlLWRlbGV0ZWRcIiwgZGF0YSA9PiB0aGlzLmhhbmRsZU1lc3NhZ2VEZWxldGVkKGRhdGEpKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyKFxyXG4gICAgICB0aGlzLnBsdWdpbi5vbihcIm9sbGFtYS1jb25uZWN0aW9uLWVycm9yXCIsIG1lc3NhZ2UgPT4ge1xyXG4gICAgICAgIC8qINCc0L7QttC70LjQstC+LCDQv9C+0LrQsNC30LDRgtC4INGJ0L7RgdGMINGDIFZpZXc/ICovXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjYW5jZWxHZW5lcmF0aW9uID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlcikge1xyXG4gICAgICB0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIuYWJvcnQoKTsgLy8g0KbQtSDQvNCw0ZQg0LLQuNC60LvQuNC60LDRgtC4INC/0L7QvNC40LvQutGDIFwiYWJvcnRlZCBieSB1c2VyXCIg0LIg0YHRgtGA0ZbQvNGWXHJcbiAgICAgIC8vINCd0JUg0LLRgdGC0LDQvdC+0LLQu9GO0ZTQvNC+IHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlciA9IG51bGwg0YLRg9GCLCDRhtC1INGA0L7QsdC40YLRjNGB0Y8g0LIgZmluYWxseSDQvtGB0L3QvtCy0L3QvtCz0L4g0L/RgNC+0YbQtdGB0YNcclxuXHJcbiAgICAgIC8vINCc0L7QttC70LjQstC+LCDQv9C+0YLRgNGW0LHQvdC+INC+0L3QvtCy0LjRgtC4INC60L3QvtC/0LrQuCDRgtGD0YIsINGP0LrRidC+INGB0LrQsNGB0YPQstCw0L3QvdGPINC90LUg0LcgVUkg0LrQvdC+0L/QutC4IFwiU3RvcFwiXHJcbiAgICAgIC8vINCQ0LvQtSDRj9C60YnQviDRhtC1INGB0LrQsNGB0YPQstCw0L3QvdGPINC3IFVJLCDRgtC+IHVwZGF0ZVNlbmRCdXR0b25TdGF0ZSDRliDRgtCw0Log0YHQv9GA0LDRhtGO0ZRcclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcbiAgICAvLyDQktCw0LbQu9C40LLQvjog0L3QtSDQt9C80ZbQvdGO0LLQsNGC0LggaXNQcm9jZXNzaW5nINGC0YPRgiwg0YbQtSDQvNCw0ZQg0YDQvtCx0LjRgtC4INC+0YHQvdC+0LLQvdC40Lkg0L/QvtGC0ZbQulxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlTWVzc2FnZURlbGV0ZWQgPSAoZGF0YTogeyBjaGF0SWQ6IHN0cmluZzsgdGltZXN0YW1wOiBEYXRlIH0pOiB2b2lkID0+IHtcclxuICAgIGNvbnN0IGN1cnJlbnRBY3RpdmVDaGF0SWQgPSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdElkKCk7XHJcblxyXG4gICAgaWYgKGRhdGEuY2hhdElkICE9PSBjdXJyZW50QWN0aXZlQ2hhdElkIHx8ICF0aGlzLmNoYXRDb250YWluZXIpIHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgIGBoYW5kbGVNZXNzYWdlRGVsZXRlZDogRXZlbnQgaWdub3JlZCAoRXZlbnQgY2hhdCAke2RhdGEuY2hhdElkfSAhPT0gYWN0aXZlIGNoYXQgJHtjdXJyZW50QWN0aXZlQ2hhdElkfSBvciBjb250YWluZXIgbWlzc2luZykuYFxyXG4gICAgICApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdGltZXN0YW1wTXMgPSBkYXRhLnRpbWVzdGFtcC5nZXRUaW1lKCk7XHJcbiAgICBjb25zdCBzZWxlY3RvciA9IGAuJHtDU1NfQ0xBU1NFUy5NRVNTQUdFX0dST1VQfVtkYXRhLXRpbWVzdGFtcD1cIiR7dGltZXN0YW1wTXN9XCJdYDtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBtZXNzYWdlR3JvdXBFbCA9IHRoaXMuY2hhdENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuXHJcbiAgICAgIGlmIChtZXNzYWdlR3JvdXBFbCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB7XHJcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgICAgYGhhbmRsZU1lc3NhZ2VEZWxldGVkOiBGb3VuZCBtZXNzYWdlIGdyb3VwIEhUTUxFbGVtZW50IHRvIHJlbW92ZSB3aXRoIHNlbGVjdG9yOiAke3NlbGVjdG9yfWBcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCBjdXJyZW50U2Nyb2xsVG9wID0gdGhpcy5jaGF0Q29udGFpbmVyLnNjcm9sbFRvcDtcclxuICAgICAgICBjb25zdCByZW1vdmVkSGVpZ2h0ID0gbWVzc2FnZUdyb3VwRWwub2Zmc2V0SGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IHdhc0Fib3ZlVmlld3BvcnQgPSBtZXNzYWdlR3JvdXBFbC5vZmZzZXRUb3AgPCBjdXJyZW50U2Nyb2xsVG9wO1xyXG5cclxuICAgICAgICBtZXNzYWdlR3JvdXBFbC5yZW1vdmUoKTtcclxuXHJcbiAgICAgICAgY29uc3QgaW5pdGlhbExlbmd0aCA9IHRoaXMuY3VycmVudE1lc3NhZ2VzLmxlbmd0aDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRNZXNzYWdlcyA9IHRoaXMuY3VycmVudE1lc3NhZ2VzLmZpbHRlcihtc2cgPT4gbXNnLnRpbWVzdGFtcC5nZXRUaW1lKCkgIT09IHRpbWVzdGFtcE1zKTtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXHJcbiAgICAgICAgICBgaGFuZGxlTWVzc2FnZURlbGV0ZWQ6IFVwZGF0ZWQgbG9jYWwgbWVzc2FnZSBjYWNoZSBmcm9tICR7aW5pdGlhbExlbmd0aH0gdG8gJHt0aGlzLmN1cnJlbnRNZXNzYWdlcy5sZW5ndGh9IG1lc3NhZ2VzLmBcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBpZiAod2FzQWJvdmVWaWV3cG9ydCkge1xyXG4gICAgICAgICAgY29uc3QgbmV3U2Nyb2xsVG9wID0gY3VycmVudFNjcm9sbFRvcCAtIHJlbW92ZWRIZWlnaHQ7XHJcbiAgICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG9wID0gbmV3U2Nyb2xsVG9wID49IDAgPyBuZXdTY3JvbGxUb3AgOiAwO1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgICAgICBgaGFuZGxlTWVzc2FnZURlbGV0ZWQ6IEFkanVzdGVkIHNjcm9sbCB0b3AgZnJvbSAke2N1cnJlbnRTY3JvbGxUb3B9IHRvICR7dGhpcy5jaGF0Q29udGFpbmVyLnNjcm9sbFRvcH0gKHJlbW92ZWQgaGVpZ2h0OiAke3JlbW92ZWRIZWlnaHR9KWBcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxUb3AgPSBjdXJyZW50U2Nyb2xsVG9wO1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgICAgICBgaGFuZGxlTWVzc2FnZURlbGV0ZWQ6IE1lc3NhZ2Ugd2FzIG5vdCBhYm92ZSB2aWV3cG9ydCwgc2Nyb2xsIHRvcCByZW1haW5zIGF0ICR7Y3VycmVudFNjcm9sbFRvcH1gXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudE1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgdGhpcy5zaG93RW1wdHlTdGF0ZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIGlmIChtZXNzYWdlR3JvdXBFbCkge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcclxuICAgICAgICAgIGBoYW5kbGVNZXNzYWdlRGVsZXRlZDogRm91bmQgZWxlbWVudCB3aXRoIHNlbGVjdG9yICR7c2VsZWN0b3J9LCBidXQgaXQgaXMgbm90IGFuIEhUTUxFbGVtZW50LiBGb3JjaW5nIHJlbG9hZC5gLFxyXG4gICAgICAgICAgbWVzc2FnZUdyb3VwRWxcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMubG9hZEFuZERpc3BsYXlBY3RpdmVDaGF0KCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oXHJcbiAgICAgICAgICBgaGFuZGxlTWVzc2FnZURlbGV0ZWQ6IENvdWxkIG5vdCBmaW5kIG1lc3NhZ2UgZ3JvdXAgZWxlbWVudCB3aXRoIHNlbGVjdG9yOiAke3NlbGVjdG9yfS4gTWF5YmUgYWxyZWFkeSByZW1vdmVkIG9yIHRpbWVzdGFtcCBhdHRyaWJ1dGUgbWlzc2luZz9gXHJcbiAgICAgICAgKTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFxyXG4gICAgICAgIGBoYW5kbGVNZXNzYWdlRGVsZXRlZDogRXJyb3IgcmVtb3ZpbmcgbWVzc2FnZSBlbGVtZW50IGZvciB0aW1lc3RhbXAgJHt0aW1lc3RhbXBNc306YCxcclxuICAgICAgICBlcnJvclxyXG4gICAgICApO1xyXG5cclxuICAgICAgdGhpcy5sb2FkQW5kRGlzcGxheUFjdGl2ZUNoYXQoKTtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwcml2YXRlIHVwZGF0ZVJvbGVQYW5lbExpc3QgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLnJvbGVQYW5lbExpc3RFbDtcclxuICAgIGlmICghY29udGFpbmVyIHx8ICF0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcikge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMucm9sZVBhbmVsSGVhZGVyRWw/LmdldEF0dHJpYnV0ZShcImRhdGEtY29sbGFwc2VkXCIpID09PSBcInRydWVcIikge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgY3VycmVudFNjcm9sbFRvcCA9IGNvbnRhaW5lci5zY3JvbGxUb3A7XHJcbiAgICBjb250YWluZXIuZW1wdHkoKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByb2xlcyA9IGF3YWl0IHRoaXMucGx1Z2luLmxpc3RSb2xlRmlsZXModHJ1ZSk7XHJcbiAgICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICAgIGNvbnN0IGN1cnJlbnRSb2xlUGF0aCA9IGFjdGl2ZUNoYXQ/Lm1ldGFkYXRhPy5zZWxlY3RlZFJvbGVQYXRoID8/IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XHJcblxyXG4gICAgICBjb25zdCBub25lT3B0aW9uRWwgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTSwgQ1NTX1JPTEVfUEFORUxfSVRFTV9OT05FLCBcIm1lbnUtb3B0aW9uXCJdIH0pO1xyXG4gICAgICBjb25zdCBub25lSWNvblNwYW4gPSBub25lT3B0aW9uRWwuY3JlYXRlU3Bhbih7IGNsczogW0NTU19ST0xFX1BBTkVMX0lURU1fSUNPTiwgXCJtZW51LW9wdGlvbi1pY29uXCJdIH0pO1xyXG4gICAgICBub25lT3B0aW9uRWwuY3JlYXRlU3Bhbih7IGNsczogW0NTU19ST0xFX1BBTkVMX0lURU1fVEVYVCwgXCJtZW51LW9wdGlvbi10ZXh0XCJdLCB0ZXh0OiBcIk5vbmVcIiB9KTtcclxuICAgICAgaWYgKCFjdXJyZW50Um9sZVBhdGgpIHtcclxuICAgICAgICBub25lT3B0aW9uRWwuYWRkQ2xhc3MoQ1NTX1JPTEVfUEFORUxfSVRFTV9BQ1RJVkUpO1xyXG4gICAgICAgIHNldEljb24obm9uZUljb25TcGFuLCBcImNoZWNrXCIpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHNldEljb24obm9uZUljb25TcGFuLCBcInNsYXNoXCIpO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudChub25lT3B0aW9uRWwsIFwiY2xpY2tcIiwgKCkgPT4gdGhpcy5oYW5kbGVSb2xlUGFuZWxJdGVtQ2xpY2sobnVsbCwgY3VycmVudFJvbGVQYXRoKSk7XHJcblxyXG4gICAgICByb2xlcy5mb3JFYWNoKHJvbGVJbmZvID0+IHtcclxuICAgICAgICBjb25zdCByb2xlT3B0aW9uRWwgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTSwgXCJtZW51LW9wdGlvblwiXSB9KTtcclxuICAgICAgICBjb25zdCBpY29uU3BhbiA9IHJvbGVPcHRpb25FbC5jcmVhdGVTcGFuKHsgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTV9JQ09OLCBcIm1lbnUtb3B0aW9uLWljb25cIl0gfSk7XHJcbiAgICAgICAgcm9sZU9wdGlvbkVsLmNyZWF0ZVNwYW4oeyBjbHM6IFtDU1NfUk9MRV9QQU5FTF9JVEVNX1RFWFQsIFwibWVudS1vcHRpb24tdGV4dFwiXSwgdGV4dDogcm9sZUluZm8ubmFtZSB9KTtcclxuICAgICAgICBpZiAocm9sZUluZm8uaXNDdXN0b20pIHtcclxuICAgICAgICAgIHJvbGVPcHRpb25FbC5hZGRDbGFzcyhDU1NfUk9MRV9QQU5FTF9JVEVNX0NVU1RPTSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChyb2xlSW5mby5wYXRoID09PSBjdXJyZW50Um9sZVBhdGgpIHtcclxuICAgICAgICAgIHJvbGVPcHRpb25FbC5hZGRDbGFzcyhDU1NfUk9MRV9QQU5FTF9JVEVNX0FDVElWRSk7XHJcbiAgICAgICAgICBzZXRJY29uKGljb25TcGFuLCBcImNoZWNrXCIpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBzZXRJY29uKGljb25TcGFuLCByb2xlSW5mby5pc0N1c3RvbSA/IFwidXNlclwiIDogXCJmaWxlLXRleHRcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudChyb2xlT3B0aW9uRWwsIFwiY2xpY2tcIiwgKCkgPT4gdGhpcy5oYW5kbGVSb2xlUGFuZWxJdGVtQ2xpY2socm9sZUluZm8sIGN1cnJlbnRSb2xlUGF0aCkpO1xyXG4gICAgICB9KTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIlt1cGRhdGVSb2xlUGFuZWxMaXN0XSBFcnJvciByZW5kZXJpbmcgcm9sZSBwYW5lbCBsaXN0OlwiLCBlcnJvcik7XHJcbiAgICAgIGNvbnRhaW5lci5lbXB0eSgpO1xyXG4gICAgICBjb250YWluZXIuY3JlYXRlRGl2KHsgdGV4dDogXCJFcnJvciBsb2FkaW5nIHJvbGVzLlwiLCBjbHM6IFwibWVudS1lcnJvci10ZXh0XCIgfSk7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICAgIGNvbnRhaW5lci5zY3JvbGxUb3AgPSBjdXJyZW50U2Nyb2xsVG9wO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwcml2YXRlIGhhbmRsZVJvbGVQYW5lbEl0ZW1DbGljayA9IGFzeW5jIChcclxuICAgIHJvbGVJbmZvOiBSb2xlSW5mbyB8IG51bGwsXHJcbiAgICBjdXJyZW50Um9sZVBhdGg6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWRcclxuICApOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIGNvbnN0IG5ld1JvbGVQYXRoID0gcm9sZUluZm8/LnBhdGggPz8gXCJcIjtcclxuICAgIGNvbnN0IHJvbGVOYW1lRm9yRXZlbnQgPSByb2xlSW5mbz8ubmFtZSA/PyBcIk5vbmVcIjtcclxuXHJcbiAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXHJcbiAgICAgIGBbaGFuZGxlUm9sZVBhbmVsSXRlbUNsaWNrXSBDbGlja2VkIHJvbGU6ICR7cm9sZU5hbWVGb3JFdmVudH0gKFBhdGg6ICR7bmV3Um9sZVBhdGggfHwgXCJOb25lXCJ9KWBcclxuICAgICk7XHJcblxyXG4gICAgaWYgKG5ld1JvbGVQYXRoICE9PSBjdXJyZW50Um9sZVBhdGgpIHtcclxuICAgICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgaWYgKGFjdGl2ZUNoYXQpIHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcclxuICAgICAgICAgICAgYFtoYW5kbGVSb2xlUGFuZWxJdGVtQ2xpY2tdIFNldHRpbmcgYWN0aXZlIHJvbGUgZm9yIGNoYXQgJHthY3RpdmVDaGF0Lm1ldGFkYXRhLmlkfSB0bzogJHtcclxuICAgICAgICAgICAgICBuZXdSb2xlUGF0aCB8fCBcIk5vbmVcIlxyXG4gICAgICAgICAgICB9YFxyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnVwZGF0ZUFjdGl2ZUNoYXRNZXRhZGF0YSh7XHJcbiAgICAgICAgICAgIHNlbGVjdGVkUm9sZVBhdGg6IG5ld1JvbGVQYXRoLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcclxuICAgICAgICAgICAgYFtoYW5kbGVSb2xlUGFuZWxJdGVtQ2xpY2tdIE5vIGFjdGl2ZSBjaGF0LiBTZXR0aW5nIGdsb2JhbCBkZWZhdWx0IHJvbGUgdG86ICR7bmV3Um9sZVBhdGggfHwgXCJOb25lXCJ9YFxyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGggPSBuZXdSb2xlUGF0aDtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cclxuICAgICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJyb2xlLWNoYW5nZWRcIiwgcm9sZU5hbWVGb3JFdmVudCk7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5wcm9tcHRTZXJ2aWNlPy5jbGVhclJvbGVDYWNoZT8uKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihgW2hhbmRsZVJvbGVQYW5lbEl0ZW1DbGlja10gRXJyb3Igc2V0dGluZyByb2xlIHRvICR7bmV3Um9sZVBhdGh9OmAsIGVycm9yKTtcclxuICAgICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIHNldCB0aGUgcm9sZS5cIik7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSB1cGRhdGVUb2dnbGVMb2NhdGlvbkJ1dHRvbigpOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy50b2dnbGVMb2NhdGlvbkJ1dHRvbikgcmV0dXJuO1xyXG5cclxuICAgIGxldCBpY29uTmFtZTogc3RyaW5nO1xyXG4gICAgbGV0IHRpdGxlVGV4dDogc3RyaW5nO1xyXG5cclxuICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuQ2hhdEluVGFiKSB7XHJcbiAgICAgIGljb25OYW1lID0gXCJzaWRlYmFyLXJpZ2h0XCI7XHJcbiAgICAgIHRpdGxlVGV4dCA9IFwiTW92ZSB0byBTaWRlYmFyXCI7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBpY29uTmFtZSA9IFwibGF5b3V0LWxpc3RcIjtcclxuICAgICAgdGl0bGVUZXh0ID0gXCJNb3ZlIHRvIFRhYlwiO1xyXG4gICAgfVxyXG4gICAgc2V0SWNvbih0aGlzLnRvZ2dsZUxvY2F0aW9uQnV0dG9uLCBpY29uTmFtZSk7XHJcbiAgICB0aGlzLnRvZ2dsZUxvY2F0aW9uQnV0dG9uLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgdGl0bGVUZXh0KTtcclxuICAgIHRoaXMudG9nZ2xlTG9jYXRpb25CdXR0b24udGl0bGUgPSB0aXRsZVRleHQ7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZU1vZGVsRGlzcGxheUNsaWNrID0gYXN5bmMgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICBjb25zdCBtZW51ID0gbmV3IE1lbnUoKTtcclxuICAgIGxldCBpdGVtc0FkZGVkID0gZmFsc2U7XHJcblxyXG4gICAgY29uc3QgbG9hZGluZ05vdGljZSA9IG5ldyBOb3RpY2UoXCJMb2FkaW5nIG1vZGVscy4uLlwiLCAwKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBtb2RlbHMgPSBhd2FpdCB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdldE1vZGVscygpO1xyXG4gICAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgICAgY29uc3QgY3VycmVudE1vZGVsTmFtZSA9IGFjdGl2ZUNoYXQ/Lm1ldGFkYXRhPy5tb2RlbE5hbWUgfHwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xyXG5cclxuICAgICAgbG9hZGluZ05vdGljZS5oaWRlKCk7XHJcblxyXG4gICAgICBpZiAobW9kZWxzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IGl0ZW0uc2V0VGl0bGUoXCJObyBtb2RlbHMgZm91bmRcIikuc2V0RGlzYWJsZWQodHJ1ZSkpO1xyXG4gICAgICAgIGl0ZW1zQWRkZWQgPSB0cnVlO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIG1vZGVscy5mb3JFYWNoKG1vZGVsTmFtZSA9PiB7XHJcbiAgICAgICAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxyXG4gICAgICAgICAgICBpdGVtXHJcbiAgICAgICAgICAgICAgLnNldFRpdGxlKG1vZGVsTmFtZSlcclxuICAgICAgICAgICAgICAuc2V0SWNvbihtb2RlbE5hbWUgPT09IGN1cnJlbnRNb2RlbE5hbWUgPyBcImNoZWNrXCIgOiBcInJhZGlvLWJ1dHRvblwiKVxyXG4gICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNoYXRUb1VwZGF0ZSA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBsYXRlc3RNb2RlbE5hbWUgPSBjaGF0VG9VcGRhdGU/Lm1ldGFkYXRhPy5tb2RlbE5hbWUgfHwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xyXG4gICAgICAgICAgICAgICAgaWYgKG1vZGVsTmFtZSAhPT0gbGF0ZXN0TW9kZWxOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgIGlmIChjaGF0VG9VcGRhdGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci51cGRhdGVBY3RpdmVDaGF0TWV0YWRhdGEoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgbW9kZWxOYW1lOiBtb2RlbE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkNhbm5vdCBzZXQgbW9kZWw6IE5vIGFjdGl2ZSBjaGF0LlwiKTtcclxuICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgaXRlbXNBZGRlZCA9IHRydWU7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGxvYWRpbmdOb3RpY2UuaGlkZSgpO1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgbG9hZGluZyBtb2RlbHMgZm9yIG1vZGVsIHNlbGVjdGlvbiBtZW51OlwiLCBlcnJvcik7XHJcbiAgICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IGl0ZW0uc2V0VGl0bGUoXCJFcnJvciBsb2FkaW5nIG1vZGVsc1wiKS5zZXREaXNhYmxlZCh0cnVlKSk7XHJcbiAgICAgIGl0ZW1zQWRkZWQgPSB0cnVlO1xyXG4gICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIGxvYWQgbW9kZWxzLiBDaGVjayBPbGxhbWEgY29ubmVjdGlvbi5cIik7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBpZiAoaXRlbXNBZGRlZCkge1xyXG4gICAgICAgIG1lbnUuc2hvd0F0TW91c2VFdmVudChldmVudCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKFwiTW9kZWwgbWVudSB3YXMgbm90IHNob3duIGJlY2F1c2Ugbm8gaXRlbXMgd2VyZSBhZGRlZC5cIik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwcml2YXRlIHVwZGF0ZU1vZGVsRGlzcGxheShtb2RlbE5hbWU6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLm1vZGVsRGlzcGxheUVsKSB7XHJcbiAgICAgIGlmIChtb2RlbE5hbWUpIHtcclxuICAgICAgICBjb25zdCBkaXNwbGF5TmFtZSA9IG1vZGVsTmFtZTtcclxuICAgICAgICBjb25zdCBzaG9ydE5hbWUgPSBkaXNwbGF5TmFtZS5yZXBsYWNlKC86bGF0ZXN0JC8sIFwiXCIpO1xyXG4gICAgICAgIHRoaXMubW9kZWxEaXNwbGF5RWwuc2V0VGV4dChzaG9ydE5hbWUpO1xyXG4gICAgICAgIHRoaXMubW9kZWxEaXNwbGF5RWwudGl0bGUgPSBgQ3VycmVudCBtb2RlbDogJHtkaXNwbGF5TmFtZX0uIENsaWNrIHRvIGNoYW5nZS5gO1xyXG5cclxuICAgICAgICB0aGlzLm1vZGVsRGlzcGxheUVsLnJlbW92ZUNsYXNzKFwibW9kZWwtbm90LWF2YWlsYWJsZVwiKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLm1vZGVsRGlzcGxheUVsLnNldFRleHQoXCJOb3QgYXZhaWxhYmxlXCIpO1xyXG4gICAgICAgIHRoaXMubW9kZWxEaXNwbGF5RWwudGl0bGUgPVxyXG4gICAgICAgICAgXCJObyBPbGxhbWEgbW9kZWxzIGRldGVjdGVkLiBDaGVjayBPbGxhbWEgY29ubmVjdGlvbiBhbmQgZW5zdXJlIG1vZGVscyBhcmUgaW5zdGFsbGVkLlwiO1xyXG5cclxuICAgICAgICB0aGlzLm1vZGVsRGlzcGxheUVsLmFkZENsYXNzKFwibW9kZWwtbm90LWF2YWlsYWJsZVwiKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIltPbGxhbWFWaWV3XSBtb2RlbERpc3BsYXlFbCBpcyBtaXNzaW5nIVwiKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlS2V5RG93biA9IChlOiBLZXlib2FyZEV2ZW50KTogdm9pZCA9PiB7XHJcbiAgICBpZiAoZS5rZXkgPT09IFwiRW50ZXJcIiAmJiAhZS5zaGlmdEtleSAmJiAhdGhpcy5pc1Byb2Nlc3NpbmcgJiYgIXRoaXMuc2VuZEJ1dHRvbj8uZGlzYWJsZWQpIHtcclxuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICB0aGlzLnNlbmRNZXNzYWdlKCk7XHJcbiAgICB9XHJcbiAgfTtcclxuICBwcml2YXRlIGhhbmRsZVNlbmRDbGljayA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICghdGhpcy5pc1Byb2Nlc3NpbmcgJiYgIXRoaXMuc2VuZEJ1dHRvbj8uZGlzYWJsZWQpIHtcclxuICAgICAgdGhpcy5zZW5kTWVzc2FnZSgpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgIH1cclxuICB9O1xyXG4gIHByaXZhdGUgaGFuZGxlSW5wdXRGb3JSZXNpemUgPSAoKTogdm9pZCA9PiB7XHJcbiAgICBpZiAodGhpcy5yZXNpemVUaW1lb3V0KSBjbGVhclRpbWVvdXQodGhpcy5yZXNpemVUaW1lb3V0KTtcclxuICAgIHRoaXMucmVzaXplVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICB0aGlzLmFkanVzdFRleHRhcmVhSGVpZ2h0KCk7XHJcbiAgICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcbiAgICB9LCA3NSk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVWb2ljZUNsaWNrID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgdGhpcy50b2dnbGVWb2ljZVJlY29nbml0aW9uKCk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVUcmFuc2xhdGVJbnB1dENsaWNrID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgY29uc3QgY3VycmVudFRleHQgPSB0aGlzLmlucHV0RWwudmFsdWU7XHJcblxyXG4gICAgY29uc3QgdGFyZ2V0TGFuZyA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uVGFyZ2V0TGFuZ3VhZ2U7XHJcblxyXG4gICAgaWYgKCFjdXJyZW50VGV4dC50cmltKCkpIHtcclxuICAgICAgbmV3IE5vdGljZShcIklucHV0IGlzIGVtcHR5LCBub3RoaW5nIHRvIHRyYW5zbGF0ZS5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVRyYW5zbGF0aW9uIHx8IHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uUHJvdmlkZXIgPT09IFwibm9uZVwiKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJUcmFuc2xhdGlvbiBkaXNhYmxlZCBvciBwcm92aWRlciBub3Qgc2VsZWN0ZWQgaW4gc2V0dGluZ3MuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCF0YXJnZXRMYW5nKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJUYXJnZXQgbGFuZ3VhZ2UgZm9yIHRyYW5zbGF0aW9uIGlzIG5vdCBzZXQgaW4gc2V0dGluZ3MuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgc2V0SWNvbih0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLCBcImxvYWRlclwiKTtcclxuICAgIHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgdGhpcy50cmFuc2xhdGVJbnB1dEJ1dHRvbi5jbGFzc0xpc3QuYWRkKENTU19DTEFTU19UUkFOU0xBVElOR19JTlBVVCk7XHJcbiAgICB0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLnRpdGxlID0gXCJUcmFuc2xhdGluZy4uLlwiO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHRyYW5zbGF0ZWRUZXh0ID0gYXdhaXQgdGhpcy5wbHVnaW4udHJhbnNsYXRpb25TZXJ2aWNlLnRyYW5zbGF0ZShjdXJyZW50VGV4dCwgXCJFbmdsaXNoXCIpO1xyXG5cclxuICAgICAgaWYgKHRyYW5zbGF0ZWRUZXh0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgdGhpcy5pbnB1dEVsLnZhbHVlID0gdHJhbnNsYXRlZFRleHQ7XHJcbiAgICAgICAgdGhpcy5pbnB1dEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIikpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRFbC5mb2N1cygpO1xyXG5cclxuICAgICAgICBpZiAodHJhbnNsYXRlZFRleHQpIHtcclxuICAgICAgICAgIGNvbnN0IGVuZCA9IHRyYW5zbGF0ZWRUZXh0Lmxlbmd0aDtcclxuICAgICAgICAgIHRoaXMuaW5wdXRFbC5zZXRTZWxlY3Rpb25SYW5nZShlbmQsIGVuZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbT2xsYW1hVmlld10gVW5leHBlY3RlZCBlcnJvciBkdXJpbmcgaW5wdXQgdHJhbnNsYXRpb24gY2FsbDpcIiwgZXJyb3IpO1xyXG4gICAgICBuZXcgTm90aWNlKFwiSW5wdXQgdHJhbnNsYXRpb24gZW5jb3VudGVyZWQgYW4gdW5leHBlY3RlZCBlcnJvci5cIik7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBzZXRJY29uKHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24sIFwibGFuZ3VhZ2VzXCIpO1xyXG5cclxuICAgICAgdGhpcy50cmFuc2xhdGVJbnB1dEJ1dHRvbi5kaXNhYmxlZCA9IHRoaXMuaXNQcm9jZXNzaW5nO1xyXG4gICAgICB0aGlzLnRyYW5zbGF0ZUlucHV0QnV0dG9uLmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1RSQU5TTEFUSU5HX0lOUFVUKTtcclxuXHJcbiAgICAgIHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24udGl0bGUgPSBgVHJhbnNsYXRlIGlucHV0IHRvICR7TEFOR1VBR0VTW3RhcmdldExhbmddIHx8IHRhcmdldExhbmd9YDtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwdWJsaWMgaGFuZGxlTmV3Q2hhdENsaWNrID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyPy5jbG9zZU1lbnUoKTtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IG5ld0NoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jcmVhdGVOZXdDaGF0KCk7XHJcbiAgICAgIGlmIChuZXdDaGF0KSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShgQ3JlYXRlZCBuZXcgY2hhdDogJHtuZXdDaGF0Lm1ldGFkYXRhLm5hbWV9YCk7XHJcbiAgICAgICAgdGhpcy5mb2N1c0lucHV0KCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBjcmVhdGUgbmV3IGNoYXQuXCIpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBuZXcgTm90aWNlKFwiRXJyb3IgY3JlYXRpbmcgbmV3IGNoYXQuXCIpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHB1YmxpYyBoYW5kbGVSZW5hbWVDaGF0Q2xpY2sgPSBhc3luYyAoY2hhdElkVG9SZW5hbWU/OiBzdHJpbmcsIGN1cnJlbnRDaGF0TmFtZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgbGV0IGNoYXRJZDogc3RyaW5nIHwgbnVsbCA9IGNoYXRJZFRvUmVuYW1lID8/IG51bGw7XHJcbiAgICBsZXQgY3VycmVudE5hbWU6IHN0cmluZyB8IG51bGwgPSBjdXJyZW50Q2hhdE5hbWUgPz8gbnVsbDtcclxuXHJcbiAgICBpZiAoIWNoYXRJZCB8fCAhY3VycmVudE5hbWUpIHtcclxuICAgICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICAgIGlmICghYWN0aXZlQ2hhdCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJObyBhY3RpdmUgY2hhdCB0byByZW5hbWUuXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBjaGF0SWQgPSBhY3RpdmVDaGF0Lm1ldGFkYXRhLmlkO1xyXG4gICAgICBjdXJyZW50TmFtZSA9IGFjdGl2ZUNoYXQubWV0YWRhdGEubmFtZTtcclxuICAgIH1cclxuICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcclxuICAgICAgYFtoYW5kbGVSZW5hbWVDaGF0Q2xpY2tdIEluaXRpYXRpbmcgcmVuYW1lIGZvciBjaGF0ICR7Y2hhdElkfSAoY3VycmVudCBuYW1lOiBcIiR7Y3VycmVudE5hbWV9XCIpYFxyXG4gICAgKTtcclxuXHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXI/LmNsb3NlTWVudSgpO1xyXG5cclxuICAgIGlmICghY2hhdElkIHx8IGN1cnJlbnROYW1lID09PSBudWxsKSB7XHJcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIltoYW5kbGVSZW5hbWVDaGF0Q2xpY2tdIEZhaWxlZCB0byBkZXRlcm1pbmUgY2hhdCBJRCBvciBjdXJyZW50IG5hbWUuXCIpO1xyXG4gICAgICBuZXcgTm90aWNlKFwiQ291bGQgbm90IGluaXRpYXRlIHJlbmFtZSBwcm9jZXNzLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIG5ldyBQcm9tcHRNb2RhbCh0aGlzLmFwcCwgXCJSZW5hbWUgQ2hhdFwiLCBgRW50ZXIgbmV3IG5hbWUgZm9yIFwiJHtjdXJyZW50TmFtZX1cIjpgLCBjdXJyZW50TmFtZSwgYXN5bmMgbmV3TmFtZSA9PiB7XHJcbiAgICAgIGxldCBub3RpY2VNZXNzYWdlID0gXCJSZW5hbWUgY2FuY2VsbGVkIG9yIG5hbWUgdW5jaGFuZ2VkLlwiO1xyXG4gICAgICBjb25zdCB0cmltbWVkTmFtZSA9IG5ld05hbWU/LnRyaW0oKTtcclxuXHJcbiAgICAgIGlmICh0cmltbWVkTmFtZSAmJiB0cmltbWVkTmFtZSAhPT0gXCJcIiAmJiB0cmltbWVkTmFtZSAhPT0gY3VycmVudE5hbWUpIHtcclxuICAgICAgICBjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIucmVuYW1lQ2hhdChjaGF0SWQhLCB0cmltbWVkTmFtZSk7XHJcblxyXG4gICAgICAgIGlmIChzdWNjZXNzKSB7XHJcbiAgICAgICAgICBub3RpY2VNZXNzYWdlID0gYENoYXQgcmVuYW1lZCB0byBcIiR7dHJpbW1lZE5hbWV9XCJgO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBub3RpY2VNZXNzYWdlID0gXCJGYWlsZWQgdG8gcmVuYW1lIGNoYXQuXCI7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2UgaWYgKHRyaW1tZWROYW1lICYmIHRyaW1tZWROYW1lID09PSBjdXJyZW50TmFtZSkge1xyXG4gICAgICAgIG5vdGljZU1lc3NhZ2UgPSBcIk5hbWUgdW5jaGFuZ2VkLlwiO1xyXG4gICAgICB9IGVsc2UgaWYgKG5ld05hbWUgPT09IG51bGwgfHwgdHJpbW1lZE5hbWUgPT09IFwiXCIpIHtcclxuICAgICAgICBub3RpY2VNZXNzYWdlID0gXCJSZW5hbWUgY2FuY2VsbGVkIG9yIGludmFsaWQgbmFtZSBlbnRlcmVkLlwiO1xyXG4gICAgICB9XHJcbiAgICAgIG5ldyBOb3RpY2Uobm90aWNlTWVzc2FnZSk7XHJcbiAgICAgIHRoaXMuZm9jdXNJbnB1dCgpO1xyXG4gICAgfSkub3BlbigpO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlQ29udGV4dE1lbnVSZW5hbWUoY2hhdElkOiBzdHJpbmcsIGN1cnJlbnROYW1lOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgIHRoaXMuaGFuZGxlUmVuYW1lQ2hhdENsaWNrKGNoYXRJZCwgY3VycmVudE5hbWUpO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIGhhbmRsZUNsb25lQ2hhdENsaWNrID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyPy5jbG9zZU1lbnUoKTtcclxuICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdCgpO1xyXG4gICAgaWYgKCFhY3RpdmVDaGF0KSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJObyBhY3RpdmUgY2hhdCB0byBjbG9uZS5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IG9yaWdpbmFsTmFtZSA9IGFjdGl2ZUNoYXQubWV0YWRhdGEubmFtZTtcclxuICAgIGNvbnN0IGNsb25pbmdOb3RpY2UgPSBuZXcgTm90aWNlKFwiQ2xvbmluZyBjaGF0Li4uXCIsIDApO1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgY2xvbmVkQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmNsb25lQ2hhdChhY3RpdmVDaGF0Lm1ldGFkYXRhLmlkKTtcclxuICAgICAgaWYgKGNsb25lZENoYXQpIHtcclxuICAgICAgICBuZXcgTm90aWNlKGBDaGF0IGNsb25lZCBhcyBcIiR7Y2xvbmVkQ2hhdC5tZXRhZGF0YS5uYW1lfVwiIGFuZCBhY3RpdmF0ZWQuYCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBjbG9uZSBjaGF0LlwiKTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgbmV3IE5vdGljZShcIkFuIGVycm9yIG9jY3VycmVkIHdoaWxlIGNsb25pbmcgdGhlIGNoYXQuXCIpO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgY2xvbmluZ05vdGljZS5oaWRlKCk7XHJcbiAgICB9XHJcbiAgfTtcclxuICBwdWJsaWMgaGFuZGxlQ2xlYXJDaGF0Q2xpY2sgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXI/LmNsb3NlTWVudSgpO1xyXG4gICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICBpZiAoYWN0aXZlQ2hhdCkge1xyXG4gICAgICBjb25zdCBjaGF0TmFtZSA9IGFjdGl2ZUNoYXQubWV0YWRhdGEubmFtZTtcclxuICAgICAgbmV3IENvbmZpcm1Nb2RhbChcclxuICAgICAgICB0aGlzLmFwcCxcclxuICAgICAgICBcIkNsZWFyIENoYXQgTWVzc2FnZXNcIixcclxuICAgICAgICBgQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGNsZWFyIGFsbCBtZXNzYWdlcyBpbiBjaGF0IFwiJHtjaGF0TmFtZX1cIj9cXG5UaGlzIGFjdGlvbiBjYW5ub3QgYmUgdW5kb25lLmAsXHJcbiAgICAgICAgKCkgPT4ge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2xlYXJBY3RpdmVDaGF0TWVzc2FnZXMoKTtcclxuICAgICAgICB9XHJcbiAgICAgICkub3BlbigpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgbmV3IE5vdGljZShcIk5vIGFjdGl2ZSBjaGF0IHRvIGNsZWFyLlwiKTtcclxuICAgIH1cclxuICB9O1xyXG4gIHB1YmxpYyBoYW5kbGVEZWxldGVDaGF0Q2xpY2sgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXI/LmNsb3NlTWVudSgpO1xyXG4gICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICBpZiAoYWN0aXZlQ2hhdCkge1xyXG4gICAgICBjb25zdCBjaGF0TmFtZSA9IGFjdGl2ZUNoYXQubWV0YWRhdGEubmFtZTtcclxuICAgICAgbmV3IENvbmZpcm1Nb2RhbChcclxuICAgICAgICB0aGlzLmFwcCxcclxuICAgICAgICBcIkRlbGV0ZSBDaGF0XCIsXHJcbiAgICAgICAgYEFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgY2hhdCBcIiR7Y2hhdE5hbWV9XCI/XFxuVGhpcyBhY3Rpb24gY2Fubm90IGJlIHVuZG9uZS5gLFxyXG4gICAgICAgIGFzeW5jICgpID0+IHtcclxuICAgICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5kZWxldGVDaGF0KGFjdGl2ZUNoYXQubWV0YWRhdGEuaWQpO1xyXG4gICAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShgQ2hhdCBcIiR7Y2hhdE5hbWV9XCIgZGVsZXRlZC5gKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYEZhaWxlZCB0byBkZWxldGUgY2hhdCBcIiR7Y2hhdE5hbWV9XCIuYCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICApLm9wZW4oKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJObyBhY3RpdmUgY2hhdCB0byBkZWxldGUuXCIpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHB1YmxpYyBoYW5kbGVFeHBvcnRDaGF0Q2xpY2sgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXI/LmNsb3NlTWVudSgpO1xyXG4gICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICBpZiAoIWFjdGl2ZUNoYXQgfHwgYWN0aXZlQ2hhdC5tZXNzYWdlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgbmV3IE5vdGljZShcIkNoYXQgZW1wdHksIG5vdGhpbmcgdG8gZXhwb3J0LlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgbWFya2Rvd25Db250ZW50ID0gdGhpcy5mb3JtYXRDaGF0VG9NYXJrZG93bihhY3RpdmVDaGF0Lm1lc3NhZ2VzKTtcclxuICAgICAgY29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1s6Ll0vZywgXCItXCIpO1xyXG4gICAgICBjb25zdCBzYWZlTmFtZSA9IGFjdGl2ZUNoYXQubWV0YWRhdGEubmFtZS5yZXBsYWNlKC9bXFxcXC8/OipcIjw+fF0vZywgXCItXCIpO1xyXG4gICAgICBjb25zdCBmaWxlbmFtZSA9IGBvbGxhbWEtY2hhdC0ke3NhZmVOYW1lfS0ke3RpbWVzdGFtcH0ubWRgO1xyXG5cclxuICAgICAgbGV0IHRhcmdldEZvbGRlclBhdGggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jaGF0RXhwb3J0Rm9sZGVyUGF0aD8udHJpbSgpO1xyXG4gICAgICBsZXQgdGFyZ2V0Rm9sZGVyOiBURm9sZGVyIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgICBpZiAodGFyZ2V0Rm9sZGVyUGF0aCkge1xyXG4gICAgICAgIHRhcmdldEZvbGRlclBhdGggPSBub3JtYWxpemVQYXRoKHRhcmdldEZvbGRlclBhdGgpO1xyXG4gICAgICAgIGNvbnN0IGFic3RyYWN0RmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh0YXJnZXRGb2xkZXJQYXRoKTtcclxuICAgICAgICBpZiAoIWFic3RyYWN0RmlsZSkge1xyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlRm9sZGVyKHRhcmdldEZvbGRlclBhdGgpO1xyXG4gICAgICAgICAgICB0YXJnZXRGb2xkZXIgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgodGFyZ2V0Rm9sZGVyUGF0aCkgYXMgVEZvbGRlcjtcclxuICAgICAgICAgICAgaWYgKHRhcmdldEZvbGRlcikge1xyXG4gICAgICAgICAgICAgIG5ldyBOb3RpY2UoYENyZWF0ZWQgZXhwb3J0IGZvbGRlcjogJHt0YXJnZXRGb2xkZXJQYXRofWApO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkZhaWxlZCB0byBnZXQgZm9sZGVyIGV2ZW4gYWZ0ZXIgY3JlYXRpb24gYXR0ZW1wdDpcIiwgdGFyZ2V0Rm9sZGVyUGF0aCk7XHJcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgY3JlYXRpbmcgZXhwb3J0IGZvbGRlci4gU2F2aW5nIHRvIHZhdWx0IHJvb3QuYCk7XHJcbiAgICAgICAgICAgICAgdGFyZ2V0Rm9sZGVyID0gdGhpcy5hcHAudmF1bHQuZ2V0Um9vdCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiRXJyb3IgY3JlYXRpbmcgZXhwb3J0IGZvbGRlcjpcIiwgZXJyKTtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgY3JlYXRpbmcgZXhwb3J0IGZvbGRlci4gU2F2aW5nIHRvIHZhdWx0IHJvb3QuYCk7XHJcbiAgICAgICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldFJvb3QoKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKGFic3RyYWN0RmlsZSBpbnN0YW5jZW9mIFRGb2xkZXIpIHtcclxuICAgICAgICAgIHRhcmdldEZvbGRlciA9IGFic3RyYWN0RmlsZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgbmV3IE5vdGljZShgRXJyb3I6IEV4cG9ydCBwYXRoIGlzIG5vdCBhIGZvbGRlci4gU2F2aW5nIHRvIHZhdWx0IHJvb3QuYCk7XHJcbiAgICAgICAgICB0YXJnZXRGb2xkZXIgPSB0aGlzLmFwcC52YXVsdC5nZXRSb290KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldFJvb3QoKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCF0YXJnZXRGb2xkZXIpIHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJGYWlsZWQgdG8gZGV0ZXJtaW5lIGEgdmFsaWQgdGFyZ2V0IGZvbGRlciBmb3IgZXhwb3J0LlwiKTtcclxuICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3IgZGV0ZXJtaW5pbmcgZXhwb3J0IGZvbGRlci4gQ2Fubm90IHNhdmUgZmlsZS5cIik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBmaWxlUGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7dGFyZ2V0Rm9sZGVyLnBhdGh9LyR7ZmlsZW5hbWV9YCk7XHJcblxyXG4gICAgICBjb25zdCBleGlzdGluZ0ZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xyXG4gICAgICBpZiAoZXhpc3RpbmdGaWxlKSB7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGZpbGUgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUoZmlsZVBhdGgsIG1hcmtkb3duQ29udGVudCk7XHJcbiAgICAgIG5ldyBOb3RpY2UoYENoYXQgZXhwb3J0ZWQgdG8gJHtmaWxlLnBhdGh9YCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciBleHBvcnRpbmcgY2hhdDpcIiwgZXJyb3IpO1xyXG5cclxuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhcIkZpbGUgYWxyZWFkeSBleGlzdHNcIikpIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3IgZXhwb3J0aW5nIGNoYXQ6IEZpbGUgYWxyZWFkeSBleGlzdHMuXCIpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJBbiB1bmV4cGVjdGVkIGVycm9yIG9jY3VycmVkIGR1cmluZyBjaGF0IGV4cG9ydC5cIik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwdWJsaWMgaGFuZGxlU2V0dGluZ3NDbGljayA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uY2xvc2VNZW51KCk7XHJcbiAgICAodGhpcy5hcHAgYXMgYW55KS5zZXR0aW5nPy5vcGVuPy4oKTtcclxuICAgICh0aGlzLmFwcCBhcyBhbnkpLnNldHRpbmc/Lm9wZW5UYWJCeUlkPy4odGhpcy5wbHVnaW4ubWFuaWZlc3QuaWQpO1xyXG4gIH07XHJcbiAgcHJpdmF0ZSBoYW5kbGVEb2N1bWVudENsaWNrRm9yTWVudSA9IChlOiBNb3VzZUV2ZW50KTogdm9pZCA9PiB7XHJcbiAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXI/LmhhbmRsZURvY3VtZW50Q2xpY2soZSwgdGhpcy5tZW51QnV0dG9uKTtcclxuICB9O1xyXG5cclxuICBwcml2YXRlIGhhbmRsZU1vZGVsQ2hhbmdlID0gYXN5bmMgKG1vZGVsTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICB0aGlzLnVwZGF0ZU1vZGVsRGlzcGxheShtb2RlbE5hbWUpO1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgY2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcbiAgICAgIGNvbnN0IHRlbXAgPSBjaGF0Py5tZXRhZGF0YT8udGVtcGVyYXR1cmUgPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGVyYXR1cmU7XHJcbiAgICAgIHRoaXMudXBkYXRlVGVtcGVyYXR1cmVJbmRpY2F0b3IodGVtcCk7XHJcblxyXG4gICAgICBpZiAoY2hhdCAmJiB0aGlzLmN1cnJlbnRNZXNzYWdlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXQoXCJzeXN0ZW1cIiwgYE1vZGVsIGNoYW5nZWQgdG86ICR7bW9kZWxOYW1lfWAsIG5ldyBEYXRlKCkpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciBoYW5kbGluZyBtb2RlbCBjaGFuZ2Ugbm90aWZpY2F0aW9uOlwiLCBlcnJvcik7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVSb2xlQ2hhbmdlID0gYXN5bmMgKHJvbGVOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIGNvbnN0IGRpc3BsYXlSb2xlID0gcm9sZU5hbWUgfHwgXCJOb25lXCI7XHJcbiAgICB0aGlzLnVwZGF0ZUlucHV0UGxhY2Vob2xkZXIoZGlzcGxheVJvbGUpO1xyXG4gICAgdGhpcy51cGRhdGVSb2xlRGlzcGxheShkaXNwbGF5Um9sZSk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgY2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcblxyXG4gICAgICBpZiAoY2hhdCAmJiB0aGlzLmN1cnJlbnRNZXNzYWdlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXQoXCJzeXN0ZW1cIiwgYFJvbGUgY2hhbmdlZCB0bzogJHtkaXNwbGF5Um9sZX1gLCBuZXcgRGF0ZSgpKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBuZXcgTm90aWNlKGBSb2xlIHNldCB0bzogJHtkaXNwbGF5Um9sZX1gKTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiRXJyb3IgaGFuZGxpbmcgcm9sZSBjaGFuZ2Ugbm90aWZpY2F0aW9uOlwiLCBlcnJvcik7XHJcblxyXG4gICAgICBuZXcgTm90aWNlKGBSb2xlIHNldCB0bzogJHtkaXNwbGF5Um9sZX1gKTtcclxuICAgIH1cclxuICB9O1xyXG4gIHByaXZhdGUgaGFuZGxlUm9sZXNVcGRhdGVkID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgdGhpcy5wbHVnaW4ucHJvbXB0U2VydmljZT8uY2xlYXJSb2xlQ2FjaGUoKTtcclxuXHJcbiAgICBpZiAodGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyKSB7XHJcbiAgICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlclxyXG4gICAgICAgIC51cGRhdGVSb2xlTGlzdElmVmlzaWJsZSgpXHJcbiAgICAgICAgLmNhdGNoKGUgPT4gdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiRXJyb3IgdXBkYXRpbmcgcm9sZSBkcm9wZG93biBsaXN0OlwiLCBlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuc2lkZWJhck1hbmFnZXI/LmlzU2VjdGlvblZpc2libGUoXCJyb2xlc1wiKSkge1xyXG4gICAgICB0aGlzLnNpZGViYXJNYW5hZ2VyLnVwZGF0ZVJvbGVMaXN0KCkuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyByb2xlIHBhbmVsIGxpc3Q6XCIsIGUpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBhZGRNZXNzYWdlU3RhbmRhcmQobWVzc2FnZTogTWVzc2FnZSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgaXNOZXdEYXkgPSAhdGhpcy5sYXN0UmVuZGVyZWRNZXNzYWdlRGF0ZSB8fCAhdGhpcy5pc1NhbWVEYXkodGhpcy5sYXN0UmVuZGVyZWRNZXNzYWdlRGF0ZSwgbWVzc2FnZS50aW1lc3RhbXApO1xyXG4gICAgaWYgKGlzTmV3RGF5KSB7XHJcbiAgICAgIHRoaXMucmVuZGVyRGF0ZVNlcGFyYXRvcihtZXNzYWdlLnRpbWVzdGFtcCk7XHJcbiAgICAgIHRoaXMubGFzdFJlbmRlcmVkTWVzc2FnZURhdGUgPSBtZXNzYWdlLnRpbWVzdGFtcDtcclxuICAgIH0gZWxzZSBpZiAoIXRoaXMubGFzdFJlbmRlcmVkTWVzc2FnZURhdGUgJiYgdGhpcy5jaGF0Q29udGFpbmVyPy5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcclxuICAgICAgdGhpcy5sYXN0UmVuZGVyZWRNZXNzYWdlRGF0ZSA9IG1lc3NhZ2UudGltZXN0YW1wO1xyXG4gICAgfVxyXG4gICAgdGhpcy5oaWRlRW1wdHlTdGF0ZSgpO1xyXG5cclxuICAgIGxldCBtZXNzYWdlR3JvdXBFbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHRyeSB7XHJcbiAgICAgIGxldCByZW5kZXJlcjpcclxuICAgICAgICB8IFVzZXJNZXNzYWdlUmVuZGVyZXJcclxuICAgICAgICB8IFN5c3RlbU1lc3NhZ2VSZW5kZXJlclxyXG4gICAgICAgIHwgQXNzaXN0YW50TWVzc2FnZVJlbmRlcmVyXHJcbiAgICAgICAgfCBUb29sTWVzc2FnZVJlbmRlcmVyIFxyXG4gICAgICAgIHwgRXJyb3JNZXNzYWdlUmVuZGVyZXIgLy8g0JfQsNC70LjRiNCw0ZTQvNC+LCDRhdC+0YfQsCDQv9C+0LzQuNC70LrQuCDQvtCx0YDQvtCx0LvRj9GO0YLRjNGB0Y8gaGFuZGxlRXJyb3JNZXNzYWdlXHJcbiAgICAgICAgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAgIHN3aXRjaCAobWVzc2FnZS5yb2xlKSB7XHJcbiAgICAgICAgY2FzZSBcInVzZXJcIjpcclxuICAgICAgICAgIHJlbmRlcmVyID0gbmV3IFVzZXJNZXNzYWdlUmVuZGVyZXIodGhpcy5hcHAsIHRoaXMucGx1Z2luLCBtZXNzYWdlLCB0aGlzKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhc3Npc3RhbnRcIjpcclxuICAgICAgICAgIC8vIEFzc2lzdGFudE1lc3NhZ2VSZW5kZXJlciDQvNCw0ZQg0YHQsNC8INCy0LjRgNGW0YjRg9Cy0LDRgtC4LCDRj9C6INGA0LXQvdC00LXRgNC40YLQuCBtZXNzYWdlLmNvbnRlbnQsXHJcbiAgICAgICAgICAvLyDRidC+INC80L7QttC1INC80ZbRgdGC0LjRgtC4IDx0b29sX2NhbGw+INGC0LXQs9C4INCw0LHQviDQt9Cy0LjRh9Cw0LnQvdC40Lkg0YLQtdC60YHRgi5cclxuICAgICAgICAgIC8vINCi0LDQutC+0LYg0LLRltC9INC80L7QttC1INC/0LXRgNC10LLRltGA0Y/RgtC4IG1lc3NhZ2UudG9vbF9jYWxscyDQtNC70Y8g0LLRltC00L7QsdGA0LDQttC10L3QvdGPINGW0L3QtNC40LrQsNGC0L7RgNCwINCy0LjQutC+0YDQuNGB0YLQsNC90L3RjyDRltC90YHRgtGA0YPQvNC10L3RgtGDLlxyXG4gICAgICAgICAgcmVuZGVyZXIgPSBuZXcgQXNzaXN0YW50TWVzc2FnZVJlbmRlcmVyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgbWVzc2FnZSBhcyBBc3Npc3RhbnRNZXNzYWdlLCB0aGlzKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJzeXN0ZW1cIjpcclxuICAgICAgICAgIHJlbmRlcmVyID0gbmV3IFN5c3RlbU1lc3NhZ2VSZW5kZXJlcih0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIG1lc3NhZ2UsIHRoaXMpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImVycm9yXCI6XHJcbiAgICAgICAgICB0aGlzLmhhbmRsZUVycm9yTWVzc2FnZShtZXNzYWdlKTsgXHJcbiAgICAgICAgICByZXR1cm47IFxyXG4gICAgICAgIFxyXG4gICAgICAgIGNhc2UgXCJ0b29sXCI6XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuaW5mbyhgW2FkZE1lc3NhZ2VTdGFuZGFyZF0gQ3JlYXRpbmcgVG9vbE1lc3NhZ2VSZW5kZXJlciBmb3IgdG9vbDogJHttZXNzYWdlLm5hbWV9LCBDb250ZW50IHByZXZpZXc6IFwiJHttZXNzYWdlLmNvbnRlbnQuc3Vic3RyaW5nKDAsIDcwKX0uLi5cImApO1xyXG4gICAgICAgICAgcmVuZGVyZXIgPSBuZXcgVG9vbE1lc3NhZ2VSZW5kZXJlcih0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIG1lc3NhZ2UsIHRoaXMpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICBcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgLy8g0JTQvtC/0L7QvNCw0LPQsNGUIFR5cGVTY3JpcHQg0LLRltC00YHRgtC10LbQuNGC0Lgg0LLRgdGWINCy0LDRgNGW0LDQvdGC0LgsINGP0LrRidC+IG1lc3NhZ2Uucm9sZSDRlCDRgdGC0YDQvtCz0LjQvCB1bmlvblxyXG4gICAgICAgICAgLy8gY29uc3QgX2V4aGF1c3RpdmVDaGVjazogbmV2ZXIgPSBtZXNzYWdlLnJvbGU7IFxyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oYFthZGRNZXNzYWdlU3RhbmRhcmRdIFVua25vd24gbWVzc2FnZSByb2xlIGVuY291bnRlcmVkIGluIHN3aXRjaDogJyR7KG1lc3NhZ2UgYXMgYW55KT8ucm9sZX0nLiBDb250ZW50OiBcIiR7bWVzc2FnZS5jb250ZW50LnN1YnN0cmluZygwLCA3MCl9XCJgKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgY29uc3QgdW5rbm93blJvbGVHcm91cCA9IHRoaXMuY2hhdENvbnRhaW5lcj8uY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NFUy5NRVNTQUdFX0dST1VQIH0pO1xyXG4gICAgICAgICAgaWYgKHVua25vd25Sb2xlR3JvdXAgJiYgdGhpcy5jaGF0Q29udGFpbmVyKSB7IFxyXG4gICAgICAgICAgICBSZW5kZXJlclV0aWxzLnJlbmRlckF2YXRhcih0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIHVua25vd25Sb2xlR3JvdXAsIGZhbHNlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB3cmFwcGVyID0gdW5rbm93blJvbGVHcm91cC5jcmVhdGVEaXYoe2NsczogQ1NTX0NMQVNTRVMuTUVTU0FHRV9XUkFQUEVSIHx8IFwibWVzc2FnZS13cmFwcGVyXCJ9KTsgXHJcbiAgICAgICAgICAgICAgY29uc3QgbXNnQnViYmxlID0gd3JhcHBlci5jcmVhdGVEaXYoe2NsczogYCR7Q1NTX0NMQVNTRVMuTUVTU0FHRX0gJHtDU1NfQ0xBU1NFUy5TWVNURU1fTUVTU0FHRX1gfSk7IFxyXG4gICAgICAgICAgICAgIG1zZ0J1YmJsZS5jcmVhdGVEaXYoe2NsczogQ1NTX0NMQVNTRVMuU1lTVEVNX01FU1NBR0VfVEVYVCB8fCBcInN5c3RlbS1tZXNzYWdlLXRleHRcIiwgdGV4dDogYEludGVybmFsIFBsdWdpbiBFcnJvcjogVW5rbm93biBtZXNzYWdlIHJvbGUgcmVjZWl2ZWQgYnkgcmVuZGVyZXI6ICcke21lc3NhZ2Uucm9sZX0nLiBNZXNzYWdlIGNvbnRlbnQgd2FzIGxvZ2dlZC5gfSk7XHJcbiAgICAgICAgICAgICAgQmFzZU1lc3NhZ2VSZW5kZXJlci5hZGRUaW1lc3RhbXAobXNnQnViYmxlLCBtZXNzYWdlLnRpbWVzdGFtcCwgdGhpcyk7IFxyXG4gICAgICAgICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5hcHBlbmRDaGlsZCh1bmtub3duUm9sZUdyb3VwKTtcclxuICAgICAgICAgICAgICB0aGlzLmxhc3RNZXNzYWdlRWxlbWVudCA9IHVua25vd25Sb2xlR3JvdXA7IFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcmV0dXJuOyBcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHJlbmRlcmVyKSB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gcmVuZGVyZXIucmVuZGVyKCk7IFxyXG4gICAgICAgIG1lc3NhZ2VHcm91cEVsID0gcmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSA/IGF3YWl0IHJlc3VsdCA6IHJlc3VsdDtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgcmV0dXJuOyAvLyDQr9C60YnQviDRgNC10L3QtNC10YDQtdGAINC90LUg0YHRgtCy0L7RgNC10L3Qviwg0L3RltGH0L7Qs9C+INC00L7QtNCw0LLQsNGC0LhcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKG1lc3NhZ2VHcm91cEVsICYmIHRoaXMuY2hhdENvbnRhaW5lcikge1xyXG4gICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5hcHBlbmRDaGlsZChtZXNzYWdlR3JvdXBFbCk7XHJcbiAgICAgICAgdGhpcy5sYXN0TWVzc2FnZUVsZW1lbnQgPSBtZXNzYWdlR3JvdXBFbDsgXHJcbiAgICAgICAgaWYgKCFtZXNzYWdlR3JvdXBFbC5pc0Nvbm5lY3RlZCkge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKGBbYWRkTWVzc2FnZVN0YW5kYXJkXSBDUklUSUNBTDogTWVzc2FnZSBncm91cCBub2RlIGZvciByb2xlICR7bWVzc2FnZS5yb2xlfSB3YXMgbm90IGNvbm5lY3RlZCB0byBET00gYWZ0ZXIgYXBwZW5kIWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbWVzc2FnZUdyb3VwRWwuY2xhc3NMaXN0LmFkZChDU1NfQ0xBU1NFUy5NRVNTQUdFX0FSUklWSU5HIHx8IFwibWVzc2FnZS1hcnJpdmluZ1wiKTsgXHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBtZXNzYWdlR3JvdXBFbD8uY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NFUy5NRVNTQUdFX0FSUklWSU5HIHx8IFwibWVzc2FnZS1hcnJpdmluZ1wiKSwgNTAwKTtcclxuXHJcbiAgICAgICAgY29uc3QgaXNVc2VyTWVzc2FnZSA9IG1lc3NhZ2Uucm9sZSA9PT0gXCJ1c2VyXCI7XHJcbiAgICAgICAgaWYgKCFpc1VzZXJNZXNzYWdlICYmIHRoaXMudXNlclNjcm9sbGVkVXAgJiYgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsKSB7XHJcbiAgICAgICAgICB0aGlzLm5ld01lc3NhZ2VzSW5kaWNhdG9yRWwuY2xhc3NMaXN0LmFkZChDU1NfQ0xBU1NFUy5WSVNJQkxFIHx8IFwidmlzaWJsZVwiKTsgIFxyXG4gICAgICAgIH0gZWxzZSBpZiAoIXRoaXMudXNlclNjcm9sbGVkVXApIHtcclxuICAgICAgICAgIGNvbnN0IHNjcm9sbERlbGF5ID0gdGhpcy5pc1Byb2Nlc3NpbmcgJiYgbWVzc2FnZS5yb2xlID09PSAnYXNzaXN0YW50JyA/IDMwIDogKGlzVXNlck1lc3NhZ2UgPyA1MCA6IDEwMCk7XHJcbiAgICAgICAgICAvLyDQr9C60YnQviDRhtC1INC/0L7QstGW0LTQvtC80LvQtdC90L3RjyDRltC90YHRgtGA0YPQvNC10L3RgtGDLCDQstC+0L3QviDQvdC1INGUIFwi0LLRltC00L/QvtCy0ZbQtNC00Y4g0LDRgdC40YHRgtC10L3RgtCwXCIg0LIg0YLQvtC80YMg0YHQtdC90YHRliwg0YnQviDQstC+0L3QviDQvdC1INCz0LXQvdC10YDRg9GU0YLRjNGB0Y8gTExNINCyINGA0LXQsNC70YzQvdC+0LzRgyDRh9Cw0YHRli5cclxuICAgICAgICAgIC8vINCi0L7QvNGDLCDQvNC+0LbQu9C40LLQviwg0L3QtSDQstCw0YDRgtC+INGE0L7RgNGB0YPQstCw0YLQuCDQv9GA0L7QutGA0YPRgtC60YMg0YLQsNC6INCw0LPRgNC10YHQuNCy0L3Qviwg0Y/QuiDQtNC70Y8g0LLRltC00L/QvtCy0ZbQtNGWINCw0YHQuNGB0YLQtdC90YLQsC5cclxuICAgICAgICAgIGNvbnN0IGZvcmNlU2Nyb2xsID0gKHRoaXMuaXNQcm9jZXNzaW5nICYmIG1lc3NhZ2Uucm9sZSA9PT0gJ2Fzc2lzdGFudCcpIHx8IG1lc3NhZ2Uucm9sZSA9PT0gJ3Rvb2wnID8gdHJ1ZSA6ICFpc1VzZXJNZXNzYWdlO1xyXG4gICAgICAgICAgdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oc2Nyb2xsRGVsYXksIGZvcmNlU2Nyb2xsKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLnVwZGF0ZVNjcm9sbFN0YXRlQW5kSW5kaWNhdG9ycygpLCAxNTApO1xyXG4gICAgICB9IGVsc2UgaWYgKHJlbmRlcmVyKSB7XHJcbiAgICAgICAgICBcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXHJcbiAgICAgICAgYFthZGRNZXNzYWdlU3RhbmRhcmRdIFVuZXhwZWN0ZWQgZXJyb3IgZHVyaW5nIG1lc3NhZ2UgcmVuZGVyaW5nLiBSb2xlOiAke1xyXG4gICAgICAgICAgbWVzc2FnZT8ucm9sZSB8fCBcInVua25vd25cIlxyXG4gICAgICAgIH0sIENvbnRlbnQgUHJldmlldzogXCIke21lc3NhZ2U/LmNvbnRlbnQ/LnN1YnN0cmluZygwLCAxMDApIHx8IFwiTi9BXCJ9XCJgLFxyXG4gICAgICAgIGVycm9yXHJcbiAgICAgICk7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgICBjb25zdCBlcnJvck5vdGljZSA9IGBGYWlsZWQgdG8gcmVuZGVyIG1lc3NhZ2UgKFJvbGU6ICR7bWVzc2FnZT8ucm9sZX0pLiBDaGVjayBjb25zb2xlIGZvciBkZXRhaWxzLmA7XHJcbiAgICAgICAgICAvLyDQodGC0LLQvtGA0Y7RlNC80L4g0L7QsSfRlNC60YIgTWVzc2FnZSwg0YHRg9C80ZbRgdC90LjQuSDQtyBFcnJvck1lc3NhZ2VSZW5kZXJlciDQsNCx0L4gaGFuZGxlRXJyb3JNZXNzYWdlXHJcbiAgICAgICAgICBjb25zdCBlcnJvck1zZ09iamVjdDogTWVzc2FnZSA9IHsgXHJcbiAgICAgICAgICAgICAgcm9sZTogJ2Vycm9yJywgXHJcbiAgICAgICAgICAgICAgY29udGVudDogZXJyb3JOb3RpY2UsXHJcbiAgICAgICAgICAgICAgdGltZXN0YW1wOiBtZXNzYWdlLnRpbWVzdGFtcCB8fCBuZXcgRGF0ZSgpIC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4gdGltZXN0YW1wINC+0YDQuNCz0ZbQvdCw0LvRjNC90L7Qs9C+INC/0L7QstGW0LTQvtC80LvQtdC90L3Rjywg0Y/QutGJ0L4g0ZRcclxuICAgICAgICAgIH07XHJcbiAgICAgICAgICB0aGlzLmhhbmRsZUVycm9yTWVzc2FnZShlcnJvck1zZ09iamVjdCk7IFxyXG4gICAgICB9IGNhdGNoIChjcml0aWNhbEVycm9yKXtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIlthZGRNZXNzYWdlU3RhbmRhcmRdIENSSVRJQ0FMOiBGYWlsZWQgZXZlbiB0byBkaXNwbGF5IGEgcmVuZGVyIGVycm9yIG1lc3NhZ2UuXCIsIGNyaXRpY2FsRXJyb3IpO1xyXG4gICAgICAgICAgbmV3IE5vdGljZShcIkNyaXRpY2FsIGVycm9yIGRpc3BsYXlpbmcgbWVzc2FnZS4gQ2hlY2sgY29uc29sZS5cIik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4vLyAuLi4gKNGA0LXRiNGC0LAg0LLQsNGI0L7Qs9C+INC60LvQsNGB0YMgT2xsYW1hVmlldykgLi4uXHJcblxyXG4gIHByaXZhdGUgaGFuZGxlTWVzc2FnZXNDbGVhcmVkID0gKGNoYXRJZDogc3RyaW5nKTogdm9pZCA9PiB7XHJcbiAgICBpZiAoY2hhdElkID09PSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdElkKCkpIHtcclxuICAgICAgY29uc29sZS5sb2coXCJbT2xsYW1hVmlld10gTWVzc2FnZXMgY2xlYXJlZCBldmVudCByZWNlaXZlZC5cIik7XHJcbiAgICAgIHRoaXMuY2xlYXJDaGF0Q29udGFpbmVySW50ZXJuYWwoKTtcclxuICAgICAgdGhpcy5jdXJyZW50TWVzc2FnZXMgPSBbXTtcclxuICAgICAgdGhpcy5zaG93RW1wdHlTdGF0ZSgpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlVmlzaWJpbGl0eUNoYW5nZSA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmIChkb2N1bWVudC52aXNpYmlsaXR5U3RhdGUgPT09IFwidmlzaWJsZVwiICYmIHRoaXMubGVhZi52aWV3ID09PSB0aGlzKSB7XHJcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oNTAsIHRydWUpO1xyXG4gICAgICAgIHRoaXMuYWRqdXN0VGV4dGFyZWFIZWlnaHQoKTtcclxuICAgICAgICB0aGlzLmlucHV0RWw/LmZvY3VzKCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH07XHJcbiAgcHJpdmF0ZSBoYW5kbGVBY3RpdmVMZWFmQ2hhbmdlID0gKGxlYWY6IFdvcmtzcGFjZUxlYWYgfCBudWxsKTogdm9pZCA9PiB7XHJcbiAgICBpZiAobGVhZj8udmlldyA9PT0gdGhpcykge1xyXG4gICAgICB0aGlzLmlucHV0RWw/LmZvY3VzKCk7XHJcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oMTUwLCB0cnVlKSwgMTAwKTtcclxuICAgIH1cclxuICB9O1xyXG4gIHByaXZhdGUgaGFuZGxlV2luZG93UmVzaXplID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMucmVzaXplVGltZW91dCkgY2xlYXJUaW1lb3V0KHRoaXMucmVzaXplVGltZW91dCk7XHJcbiAgICB0aGlzLnJlc2l6ZVRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuYWRqdXN0VGV4dGFyZWFIZWlnaHQoKSwgMTAwKTtcclxuICB9O1xyXG5cclxuICBwcml2YXRlIGhhbmRsZVNjcm9sbCA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICghdGhpcy5jaGF0Q29udGFpbmVyIHx8ICF0aGlzLm5ld01lc3NhZ2VzSW5kaWNhdG9yRWwgfHwgIXRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24pIHJldHVybjtcclxuXHJcbiAgICBjb25zdCB0aHJlc2hvbGQgPSAxNTA7XHJcbiAgICBjb25zdCBhdEJvdHRvbSA9XHJcbiAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxIZWlnaHQgLSB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG9wIC0gdGhpcy5jaGF0Q29udGFpbmVyLmNsaWVudEhlaWdodCA8IHRocmVzaG9sZDtcclxuXHJcbiAgICBjb25zdCBwcmV2aW91c1Njcm9sbGVkVXAgPSB0aGlzLnVzZXJTY3JvbGxlZFVwO1xyXG4gICAgdGhpcy51c2VyU2Nyb2xsZWRVcCA9ICFhdEJvdHRvbTtcclxuXHJcbiAgICBpZiAocHJldmlvdXNTY3JvbGxlZFVwICYmIGF0Qm90dG9tKSB7XHJcbiAgICAgIHRoaXMubmV3TWVzc2FnZXNJbmRpY2F0b3JFbC5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLnNjcm9sbFRvQm90dG9tQnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoQ1NTX0NMQVNTX1ZJU0lCTEUsIHRoaXMudXNlclNjcm9sbGVkVXApO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlTmV3TWVzc2FnZUluZGljYXRvckNsaWNrID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuY2hhdENvbnRhaW5lcikge1xyXG4gICAgICB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsVG8oeyB0b3A6IHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxIZWlnaHQsIGJlaGF2aW9yOiBcInNtb290aFwiIH0pO1xyXG4gICAgfVxyXG4gICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsPy5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgIHRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1ZJU0lCTEUpO1xyXG4gICAgdGhpcy51c2VyU2Nyb2xsZWRVcCA9IGZhbHNlO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlU2Nyb2xsVG9Cb3R0b21DbGljayA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICh0aGlzLmNoYXRDb250YWluZXIpIHtcclxuICAgICAgdGhpcy5jaGF0Q29udGFpbmVyLnNjcm9sbFRvKHsgdG9wOiB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsSGVpZ2h0LCBiZWhhdmlvcjogXCJzbW9vdGhcIiB9KTtcclxuICAgIH1cclxuICAgIHRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1ZJU0lCTEUpO1xyXG4gICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsPy5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgIHRoaXMudXNlclNjcm9sbGVkVXAgPSBmYWxzZTtcclxuICB9O1xyXG5cclxuICBwcml2YXRlIHVwZGF0ZUlucHV0UGxhY2Vob2xkZXIocm9sZU5hbWU6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLmlucHV0RWwpIHtcclxuICAgICAgdGhpcy5pbnB1dEVsLnBsYWNlaG9sZGVyID0gYEVudGVyIG1lc3NhZ2UgdGV4dCBoZXJlLi4uYDtcclxuICAgIH1cclxuICB9XHJcbiAgcHJpdmF0ZSBhdXRvUmVzaXplVGV4dGFyZWEoKTogdm9pZCB7XHJcbiAgICB0aGlzLmFkanVzdFRleHRhcmVhSGVpZ2h0KCk7XHJcbiAgfVxyXG4gIHByaXZhdGUgYWRqdXN0VGV4dGFyZWFIZWlnaHQgPSAoKTogdm9pZCA9PiB7XHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICBpZiAoIXRoaXMuaW5wdXRFbCkgcmV0dXJuO1xyXG4gICAgICBjb25zdCB0ZXh0YXJlYSA9IHRoaXMuaW5wdXRFbDtcclxuICAgICAgY29uc3QgY29tcHV0ZWRTdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKHRleHRhcmVhKTtcclxuXHJcbiAgICAgIGNvbnN0IGJhc2VNaW5IZWlnaHQgPSBwYXJzZUZsb2F0KGNvbXB1dGVkU3R5bGUubWluSGVpZ2h0KSB8fCA0MDtcclxuICAgICAgY29uc3QgbWF4SGVpZ2h0ID0gcGFyc2VGbG9hdChjb21wdXRlZFN0eWxlLm1heEhlaWdodCk7XHJcblxyXG4gICAgICBjb25zdCBjdXJyZW50U2Nyb2xsVG9wID0gdGV4dGFyZWEuc2Nyb2xsVG9wO1xyXG4gICAgICB0ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSBcImF1dG9cIjtcclxuXHJcbiAgICAgIGNvbnN0IHNjcm9sbEhlaWdodCA9IHRleHRhcmVhLnNjcm9sbEhlaWdodDtcclxuXHJcbiAgICAgIGxldCB0YXJnZXRIZWlnaHQgPSBNYXRoLm1heChiYXNlTWluSGVpZ2h0LCBzY3JvbGxIZWlnaHQpO1xyXG4gICAgICBsZXQgYXBwbHlPdmVyZmxvdyA9IGZhbHNlO1xyXG5cclxuICAgICAgaWYgKCFpc05hTihtYXhIZWlnaHQpICYmIHRhcmdldEhlaWdodCA+IG1heEhlaWdodCkge1xyXG4gICAgICAgIHRhcmdldEhlaWdodCA9IG1heEhlaWdodDtcclxuICAgICAgICBhcHBseU92ZXJmbG93ID0gdHJ1ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gYCR7dGFyZ2V0SGVpZ2h0fXB4YDtcclxuICAgICAgdGV4dGFyZWEuc3R5bGUub3ZlcmZsb3dZID0gYXBwbHlPdmVyZmxvdyA/IFwiYXV0b1wiIDogXCJoaWRkZW5cIjtcclxuICAgICAgdGV4dGFyZWEuc2Nyb2xsVG9wID0gY3VycmVudFNjcm9sbFRvcDtcclxuICAgIH0pO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgdXBkYXRlUm9sZURpc3BsYXkocm9sZU5hbWU6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLnJvbGVEaXNwbGF5RWwpIHtcclxuICAgICAgY29uc3QgZGlzcGxheU5hbWUgPSByb2xlTmFtZSB8fCBcIk5vbmVcIjtcclxuICAgICAgdGhpcy5yb2xlRGlzcGxheUVsLnNldFRleHQoZGlzcGxheU5hbWUpO1xyXG4gICAgICB0aGlzLnJvbGVEaXNwbGF5RWwudGl0bGUgPSBgQ3VycmVudCByb2xlOiAke2Rpc3BsYXlOYW1lfS4gQ2xpY2sgdG8gY2hhbmdlLmA7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBwcml2YXRlIHVwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpOiB2b2lkIHtcclxuICAvLyAgIGlmICghdGhpcy5pbnB1dEVsIHx8ICF0aGlzLnNlbmRCdXR0b24pIHJldHVybjtcclxuXHJcbiAgLy8gICBjb25zdCBpc0Rpc2FibGVkID0gdGhpcy5pbnB1dEVsLnZhbHVlLnRyaW0oKSA9PT0gXCJcIiB8fCB0aGlzLmlzUHJvY2Vzc2luZyB8fCB0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIgIT09IG51bGw7XHJcbiAgLy8gICB0aGlzLnNlbmRCdXR0b24uZGlzYWJsZWQgPSBpc0Rpc2FibGVkO1xyXG4gIC8vICAgdGhpcy5zZW5kQnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoQ1NTX0NMQVNTX0RJU0FCTEVELCBpc0Rpc2FibGVkKTtcclxuXHJcbiAgLy8gICB0aGlzLnN0b3BHZW5lcmF0aW5nQnV0dG9uPy50b2dnbGUodGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyICE9PSBudWxsKTtcclxuICAvLyB9XHJcblxyXG4gIHByaXZhdGUgdXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLmlucHV0RWwgfHwgIXRoaXMuc2VuZEJ1dHRvbiB8fCAhdGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbikge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZ2VuZXJhdGlvbkluUHJvZ3Jlc3MgPSB0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIgIT09IG51bGw7XHJcbiAgICBjb25zdCBpc0lucHV0RW1wdHkgPSB0aGlzLmlucHV0RWwudmFsdWUudHJpbSgpID09PSBcIlwiO1xyXG5cclxuICAgIGlmIChnZW5lcmF0aW9uSW5Qcm9ncmVzcykge1xyXG4gICAgICB0aGlzLnN0b3BHZW5lcmF0aW5nQnV0dG9uLnNob3coKTtcclxuICAgICAgdGhpcy5zZW5kQnV0dG9uLmhpZGUoKTtcclxuICAgICAgdGhpcy5zZW5kQnV0dG9uLmRpc2FibGVkID0gdHJ1ZTsgLy8g0JfQsNCy0LbQtNC4INCy0LjQvNC40LrQsNGU0LzQviBTZW5kLCDQutC+0LvQuCDQudC00LUg0LPQtdC90LXRgNCw0YbRltGPXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnN0b3BHZW5lcmF0aW5nQnV0dG9uLmhpZGUoKTtcclxuICAgICAgdGhpcy5zZW5kQnV0dG9uLnNob3coKTtcclxuICAgICAgLy8g0JrQvdC+0L/QutCwIFNlbmQg0LLQuNC80LrQvdC10L3QsCwg0Y/QutGJ0L4g0L/QvtC70LUg0L/QvtGA0L7QttC90ZQg0LDQsdC+INC50LTQtSDRj9C60LDRgdGMINGW0L3RiNCwINC+0LHRgNC+0LHQutCwIChpc1Byb2Nlc3NpbmcpXHJcbiAgICAgIGNvbnN0IHNlbmRTaG91bGRCZURpc2FibGVkID0gaXNJbnB1dEVtcHR5IHx8IHRoaXMuaXNQcm9jZXNzaW5nO1xyXG4gICAgICB0aGlzLnNlbmRCdXR0b24uZGlzYWJsZWQgPSBzZW5kU2hvdWxkQmVEaXNhYmxlZDtcclxuICAgICAgdGhpcy5zZW5kQnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoQ1NTX0NMQVNTRVMuRElTQUJMRUQsIHNlbmRTaG91bGRCZURpc2FibGVkKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHB1YmxpYyBzaG93RW1wdHlTdGF0ZSgpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLmN1cnJlbnRNZXNzYWdlcy5sZW5ndGggPT09IDAgJiYgIXRoaXMuZW1wdHlTdGF0ZUVsICYmIHRoaXMuY2hhdENvbnRhaW5lcikge1xyXG4gICAgICB0aGlzLmNoYXRDb250YWluZXIuZW1wdHkoKTtcclxuICAgICAgdGhpcy5lbXB0eVN0YXRlRWwgPSB0aGlzLmNoYXRDb250YWluZXIuY3JlYXRlRGl2KHtcclxuICAgICAgICBjbHM6IENTU19DTEFTU19FTVBUWV9TVEFURSxcclxuICAgICAgfSk7XHJcbiAgICAgIHRoaXMuZW1wdHlTdGF0ZUVsLmNyZWF0ZURpdih7XHJcbiAgICAgICAgY2xzOiBcImVtcHR5LXN0YXRlLW1lc3NhZ2VcIixcclxuICAgICAgICB0ZXh0OiBcIk5vIG1lc3NhZ2VzIHlldFwiLFxyXG4gICAgICB9KTtcclxuICAgICAgY29uc3QgbW9kZWxOYW1lID0gdGhpcy5wbHVnaW4/LnNldHRpbmdzPy5tb2RlbE5hbWUgfHwgXCJ0aGUgQUlcIjtcclxuICAgICAgdGhpcy5lbXB0eVN0YXRlRWwuY3JlYXRlRGl2KHtcclxuICAgICAgICBjbHM6IFwiZW1wdHktc3RhdGUtdGlwXCIsXHJcbiAgICAgICAgdGV4dDogYFR5cGUgYSBtZXNzYWdlIG9yIHVzZSB0aGUgbWVudSBvcHRpb25zIHRvIHN0YXJ0IGludGVyYWN0aW5nIHdpdGggJHttb2RlbE5hbWV9LmAsXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuICBwdWJsaWMgaGlkZUVtcHR5U3RhdGUoKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5lbXB0eVN0YXRlRWwpIHtcclxuICAgICAgdGhpcy5lbXB0eVN0YXRlRWwucmVtb3ZlKCk7XHJcbiAgICAgIHRoaXMuZW1wdHlTdGF0ZUVsID0gbnVsbDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgcGFyc2VUZXh0Rm9yVG9vbENhbGwodGV4dDogc3RyaW5nKTogeyBuYW1lOiBzdHJpbmc7IGFyZ3VtZW50czogYW55IH0gfCBudWxsIHtcclxuICAgIGNvbnN0IG9wZW5UYWcgPSBcIjx0b29sX2NhbGw+XCI7XHJcbiAgICBjb25zdCBjbG9zZVRhZyA9IFwiPC90b29sX2NhbGw+XCI7XHJcblxyXG4gICAgLy8g0KjRg9C60LDRlNC80L4g0L/QtdGA0YjQtSDQstGF0L7QtNC20LXQvdC90Y8g0LLRltC00LrRgNC40LLQsNGO0YfQvtCz0L4g0YLQtdCz0YMg0YLQsCDQvtGB0YLQsNC90L3RlCDQt9Cw0LrRgNC40LLQsNGO0YfQvtCz0L4sXHJcbiAgICAvLyDRidC+0LEg0L7RhdC+0L/QuNGC0Lgg0LLQtdGB0Ywg0L/QvtGC0LXQvdGG0ZbQudC90LjQuSDQsdC70L7QuiBKU09OLCDQvdCw0LLRltGC0Ywg0Y/QutGJ0L4g0ZQg0LLQutC70LDQtNC10L3RltGB0YLRjCDQsNCx0L4g0LfQsNC50LLQuNC5INGC0LXQutGB0YIuXHJcbiAgICBjb25zdCBvcGVuVGFnSW5kZXggPSB0ZXh0LmluZGV4T2Yob3BlblRhZyk7XHJcbiAgICBjb25zdCBjbG9zZVRhZ0luZGV4ID0gdGV4dC5sYXN0SW5kZXhPZihjbG9zZVRhZyk7XHJcblxyXG4gICAgaWYgKG9wZW5UYWdJbmRleCAhPT0gLTEgJiYgY2xvc2VUYWdJbmRleCAhPT0gLTEgJiYgY2xvc2VUYWdJbmRleCA+IG9wZW5UYWdJbmRleCkge1xyXG4gICAgICAvLyDQktC40YLRj9Cz0YPRlNC80L4g0YDRj9C00L7QuiBKU09OINC80ZbQtiDQv9C10YDRiNC40LwgPHRvb2xfY2FsbD4g0YLQsCDQvtGB0YLQsNC90L3RltC8IDwvdG9vbF9jYWxsPlxyXG4gICAgICBjb25zdCBqc29uU3RyaW5nID0gdGV4dC5zdWJzdHJpbmcob3BlblRhZ0luZGV4ICsgb3BlblRhZy5sZW5ndGgsIGNsb3NlVGFnSW5kZXgpLnRyaW0oKTtcclxuICAgICAgXHJcbiAgICAgIC8vINCe0L/RhtGW0L7QvdCw0LvRjNC90LAg0L/QtdGA0LXQstGW0YDQutCwINC90LAg0LfQsNC50LLQuNC5INGC0LXQutGB0YIg0L/QvtC30LAg0L7RgdC90L7QstC90LjQvCDQsdC70L7QutC+0Lwg0YLQtdCz0ZbQsi5cclxuICAgICAgLy8g0KbQtSDQvNC+0LbQtSDQstC60LDQt9GD0LLQsNGC0Lgg0L3QsCDRgtC1LCDRidC+INC80L7QtNC10LvRjCDQvdC1INGW0LTQtdCw0LvRjNC90L4g0LTQvtGC0YDQuNC80YPRlNGC0YzRgdGPINGW0L3RgdGC0YDRg9C60YbRltGXIFwiT05MWVwiLlxyXG4gICAgICBjb25zdCB0ZXh0QmVmb3JlRmlyc3RPcGVuVGFnID0gdGV4dC5zdWJzdHJpbmcoMCwgb3BlblRhZ0luZGV4KS50cmltKCk7XHJcbiAgICAgIGNvbnN0IHRleHRBZnRlckxhc3RDbG9zZVRhZyA9IHRleHQuc3Vic3RyaW5nKGNsb3NlVGFnSW5kZXggKyBjbG9zZVRhZy5sZW5ndGgpLnRyaW0oKTtcclxuXHJcbiAgICAgIGlmICh0ZXh0QmVmb3JlRmlyc3RPcGVuVGFnICE9PSBcIlwiIHx8IHRleHRBZnRlckxhc3RDbG9zZVRhZyAhPT0gXCJcIikge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKFxyXG4gICAgICAgICAgXCJbT2xsYW1hVmlldy5wYXJzZVRleHRGb3JUb29sQ2FsbF0gVGV4dCBmb3VuZCBvdXRzaWRlIHRoZSBwcmltYXJ5IDx0b29sX2NhbGw+Li4uPC90b29sX2NhbGw+IGJsb2NrLiBNb2RlbCBtaWdodCBub3QgYmUgc3RyaWN0bHkgZm9sbG93aW5nICdPTkxZIEpTT04nIGluc3RydWN0aW9uLiBBdHRlbXB0aW5nIHRvIHBhcnNlIHRoZSBleHRyYWN0ZWQgSlNPTiBjb250ZW50LlwiLFxyXG4gICAgICAgICAgeyB0ZXh0QmVmb3JlOiB0ZXh0QmVmb3JlRmlyc3RPcGVuVGFnLCB0ZXh0QWZ0ZXI6IHRleHRBZnRlckxhc3RDbG9zZVRhZywgZXh0cmFjdGVkSnNvbjoganNvblN0cmluZyB9XHJcbiAgICAgICAgKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCBwYXJzZWRKc29uID0gSlNPTi5wYXJzZShqc29uU3RyaW5nKTtcclxuICAgICAgICAvLyDQn9C10YDQtdCy0ZbRgNGP0ZTQvNC+INGB0YLRgNGD0LrRgtGD0YDRgyDRgNC+0LfQv9Cw0YDRgdC10L3QvtCz0L4gSlNPTlxyXG4gICAgICAgIGlmIChwYXJzZWRKc29uICYmIHR5cGVvZiBwYXJzZWRKc29uLm5hbWUgPT09ICdzdHJpbmcnICYmIFxyXG4gICAgICAgICAgICAodHlwZW9mIHBhcnNlZEpzb24uYXJndW1lbnRzID09PSAnb2JqZWN0JyB8fCBwYXJzZWRKc29uLmFyZ3VtZW50cyA9PT0gdW5kZWZpbmVkIHx8IHBhcnNlZEpzb24uYXJndW1lbnRzID09PSBudWxsKSAvLyBhcmd1bWVudHMg0LzQvtC20YPRgtGMINCx0YPRgtC4INCy0ZbQtNGB0YPRgtC90ZbQvNC4INCw0LHQviBudWxsXHJcbiAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIHJldHVybiB7IG5hbWU6IHBhcnNlZEpzb24ubmFtZSwgYXJndW1lbnRzOiBwYXJzZWRKc29uLmFyZ3VtZW50cyB8fCB7fSB9OyAvLyDQn9C+0LLQtdGA0YLQsNGU0LzQviB7fSDRj9C60YnQviBhcmd1bWVudHMg0LLRltC00YHRg9GC0L3RllxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXHJcbiAgICAgICAgICAgIFwiW09sbGFtYVZpZXcucGFyc2VUZXh0Rm9yVG9vbENhbGxdIFBhcnNlZCBKU09OIGRvZXMgbm90IG1hdGNoIGV4cGVjdGVkIHN0cnVjdHVyZSAobmFtZTogc3RyaW5nLCBhcmd1bWVudHM6IG9iamVjdCkuIEFjdHVhbDpcIiwgcGFyc2VkSnNvblxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gY2F0Y2ggKGU6IGFueSkge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcclxuICAgICAgICAgIGBbT2xsYW1hVmlldy5wYXJzZVRleHRGb3JUb29sQ2FsbF0gRmFpbGVkIHRvIHBhcnNlIEpTT04gZnJvbSB0b29sX2NhbGwgY29udGVudC4gSlNPTiBzdHJpbmcgd2FzOiBcIiR7anNvblN0cmluZ31cIi4gRXJyb3I6YCwgZS5tZXNzYWdlXHJcbiAgICAgICAgKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG5cclxuXHJcbiAgcHVibGljIHNldExvYWRpbmdTdGF0ZShpc0xvYWRpbmc6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgIGNvbnN0IG9sZElzUHJvY2Vzc2luZyA9IHRoaXMuaXNQcm9jZXNzaW5nO1xyXG4gICAgLy8g0JLQkNCW0JvQmNCS0J46INCh0L/QvtGH0LDRgtC60YMg0LfQvNGW0L3RjtGU0LzQviBpc1Byb2Nlc3NpbmdcclxuICAgIHRoaXMuaXNQcm9jZXNzaW5nID0gaXNMb2FkaW5nO1xyXG4gICAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgLy8gICBgW09sbGFtYVZpZXddIHNldExvYWRpbmdTdGF0ZTogaXNQcm9jZXNzaW5nIHNldCB0byAke1xyXG4gICAgLy8gICAgIHRoaXMuaXNQcm9jZXNzaW5nXHJcbiAgICAvLyAgIH0gKHdhcyAke29sZElzUHJvY2Vzc2luZ30pLiBpc0xvYWRpbmcgcGFyYW06ICR7aXNMb2FkaW5nfS4gY3VycmVudEFib3J0Q29udHJvbGxlciBpcyAke1xyXG4gICAgLy8gICAgIHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlciA/IFwiTk9UIG51bGxcIiA6IFwibnVsbFwiXHJcbiAgICAvLyAgIH1gXHJcbiAgICAvLyApO1xyXG5cclxuICAgIGlmICh0aGlzLmlucHV0RWwpIHRoaXMuaW5wdXRFbC5kaXNhYmxlZCA9IGlzTG9hZGluZztcclxuXHJcbiAgICAvLyDQn9C+0YLRltC8INCy0LjQutC70LjQutCw0ZTQvNC+INC+0L3QvtCy0LvQtdC90L3RjyDQutC90L7Qv9C+0LosINGP0LrQtSDRgtC10L/QtdGAINCx0YPQtNC1INCy0LjQutC+0YDQuNGB0YLQvtCy0YPQstCw0YLQuCDQvdC+0LLQuNC5INGB0YLQsNC9IGlzUHJvY2Vzc2luZ1xyXG5cclxuICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcblxyXG4gICAgaWYgKHRoaXMudm9pY2VCdXR0b24pIHtcclxuICAgICAgdGhpcy52b2ljZUJ1dHRvbi5kaXNhYmxlZCA9IGlzTG9hZGluZztcclxuICAgICAgdGhpcy52b2ljZUJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKENTU19DTEFTU0VTLkRJU0FCTEVELCBpc0xvYWRpbmcpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMudHJhbnNsYXRlSW5wdXRCdXR0b24pIHtcclxuICAgICAgdGhpcy50cmFuc2xhdGVJbnB1dEJ1dHRvbi5kaXNhYmxlZCA9IGlzTG9hZGluZztcclxuICAgICAgdGhpcy50cmFuc2xhdGVJbnB1dEJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKENTU19DTEFTU0VTLkRJU0FCTEVELCBpc0xvYWRpbmcpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMubWVudUJ1dHRvbikge1xyXG4gICAgICB0aGlzLm1lbnVCdXR0b24uZGlzYWJsZWQgPSBpc0xvYWRpbmc7XHJcbiAgICAgIHRoaXMubWVudUJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKENTU19DTEFTU0VTLkRJU0FCTEVELCBpc0xvYWRpbmcpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLmNoYXRDb250YWluZXIpIHtcclxuICAgICAgaWYgKGlzTG9hZGluZykge1xyXG4gICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxCdXR0b25FbGVtZW50PihgLiR7Q1NTX0NMQVNTRVMuU0hPV19NT1JFX0JVVFRPTn1gKS5mb3JFYWNoKGJ1dHRvbiA9PiB7XHJcbiAgICAgICAgICBidXR0b24uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiOyAvLyDQn9GA0LjRhdC+0LLRg9GU0LzQviDQutC90L7Qv9C60LggXCJTaG93IE1vcmVcIiDQv9GW0LQg0YfQsNGBINC30LDQstCw0L3RgtCw0LbQtdC90L3Rj1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vINCa0L7Qu9C4INC30LDQstCw0L3RgtCw0LbQtdC90L3RjyDQt9Cw0LLQtdGA0YjQtdC90L4sINC/0LXRgNC10LLRltGA0Y/RlNC80L4sINGH0Lgg0L/QvtGC0YDRltCx0L3QviDQv9C+0LrQsNC30YPQstCw0YLQuCDQutC90L7Qv9C60LggXCJTaG93IE1vcmVcIlxyXG4gICAgICAgIHRoaXMuY2hlY2tBbGxNZXNzYWdlc0ZvckNvbGxhcHNpbmcoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBpc1NpZGViYXJTZWN0aW9uVmlzaWJsZSh0eXBlOiBcImNoYXRzXCIgfCBcInJvbGVzXCIpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IGhlYWRlckVsID0gdHlwZSA9PT0gXCJjaGF0c1wiID8gdGhpcy5jaGF0UGFuZWxIZWFkZXJFbCA6IHRoaXMucm9sZVBhbmVsSGVhZGVyRWw7XHJcbiAgICByZXR1cm4gaGVhZGVyRWw/LmdldEF0dHJpYnV0ZShcImRhdGEtY29sbGFwc2VkXCIpID09PSBcImZhbHNlXCI7XHJcbiAgfVxyXG5cclxuICAvLyDQnNC+0LTQuNGE0ZbQutGD0ZTQvNC+IGhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkXHJcbiAgLy8gc3JjL09sbGFtYVZpZXcudHNcclxuICBwcml2YXRlIGhhbmRsZUNoYXRMaXN0VXBkYXRlZCA9ICgpOiB2b2lkID0+IHtcclxuICAgIFxyXG4gICAgdGhpcy5zY2hlZHVsZVNpZGViYXJDaGF0TGlzdFVwZGF0ZSgpO1xyXG5cclxuICAgIGlmICh0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXIpIHtcclxuICAgICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyXHJcbiAgICAgICAgLnVwZGF0ZUNoYXRMaXN0SWZWaXNpYmxlKCkgLy8g0KbQtSDQtNC70Y8g0LLQuNC/0LDQtNCw0Y7Rh9C+0LPQviDQvNC10L3Rjiwg0L3QtSDQtNC70Y8g0YHQsNC50LTQsdCw0YDRg1xyXG4gICAgICAgIC5jYXRjaChlID0+IHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkVycm9yIHVwZGF0aW5nIGNoYXQgZHJvcGRvd24gbGlzdDpcIiwgZSkpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHB1YmxpYyBoYW5kbGVTZXR0aW5nc1VwZGF0ZWQgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XHJcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgIGNvbnN0IGN1cnJlbnRNb2RlbE5hbWUgPSBhY3RpdmVDaGF0Py5tZXRhZGF0YT8ubW9kZWxOYW1lIHx8IHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZTtcclxuICAgIGNvbnN0IGN1cnJlbnRSb2xlUGF0aCA9IGFjdGl2ZUNoYXQ/Lm1ldGFkYXRhPy5zZWxlY3RlZFJvbGVQYXRoID8/IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XHJcbiAgICBjb25zdCBjdXJyZW50Um9sZU5hbWUgPSBhd2FpdCB0aGlzLmZpbmRSb2xlTmFtZUJ5UGF0aChjdXJyZW50Um9sZVBhdGgpO1xyXG4gICAgY29uc3QgY3VycmVudFRlbXBlcmF0dXJlID0gYWN0aXZlQ2hhdD8ubWV0YWRhdGE/LnRlbXBlcmF0dXJlID8/IHRoaXMucGx1Z2luLnNldHRpbmdzLnRlbXBlcmF0dXJlO1xyXG5cclxuICAgIHRoaXMudXBkYXRlTW9kZWxEaXNwbGF5KGN1cnJlbnRNb2RlbE5hbWUpO1xyXG4gICAgdGhpcy51cGRhdGVSb2xlRGlzcGxheShjdXJyZW50Um9sZU5hbWUpO1xyXG4gICAgdGhpcy51cGRhdGVJbnB1dFBsYWNlaG9sZGVyKGN1cnJlbnRSb2xlTmFtZSk7XHJcbiAgICB0aGlzLnVwZGF0ZVRlbXBlcmF0dXJlSW5kaWNhdG9yKGN1cnJlbnRUZW1wZXJhdHVyZSk7XHJcbiAgICB0aGlzLnVwZGF0ZVRvZ2dsZVZpZXdMb2NhdGlvbk9wdGlvbigpO1xyXG4gICAgdGhpcy51cGRhdGVUb2dnbGVMb2NhdGlvbkJ1dHRvbigpO1xyXG5cclxuICAgIGlmICh0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXIpIHtcclxuICAgICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyXHJcbiAgICAgICAgLnVwZGF0ZVJvbGVMaXN0SWZWaXNpYmxlKClcclxuICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyByb2xlIGRyb3Bkb3duIGxpc3Q6XCIsIGUpKTtcclxuICAgICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyXHJcbiAgICAgICAgLnVwZGF0ZU1vZGVsTGlzdElmVmlzaWJsZSgpXHJcbiAgICAgICAgLmNhdGNoKGUgPT4gdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiRXJyb3IgdXBkYXRpbmcgbW9kZWwgZHJvcGRvd24gbGlzdDpcIiwgZSkpO1xyXG4gICAgICB0aGlzLmRyb3Bkb3duTWVudU1hbmFnZXIudXBkYXRlVG9nZ2xlVmlld0xvY2F0aW9uT3B0aW9uKCk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuc2lkZWJhck1hbmFnZXI/LmlzU2VjdGlvblZpc2libGUoXCJyb2xlc1wiKSkge1xyXG4gICAgICBhd2FpdCB0aGlzLnNpZGViYXJNYW5hZ2VyXHJcbiAgICAgICAgLnVwZGF0ZVJvbGVMaXN0KClcclxuICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyByb2xlIHBhbmVsIGxpc3Q6XCIsIGUpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuc2lkZWJhck1hbmFnZXI/LmlzU2VjdGlvblZpc2libGUoXCJjaGF0c1wiKSkge1xyXG4gICAgICBhd2FpdCB0aGlzLnNpZGViYXJNYW5hZ2VyXHJcbiAgICAgICAgLnVwZGF0ZUNoYXRMaXN0KClcclxuICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyBjaGF0IHBhbmVsIGxpc3Q6XCIsIGUpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcHVibGljIGFzeW5jIGhhbmRsZURlbGV0ZU1lc3NhZ2VDbGljayhtZXNzYWdlVG9EZWxldGU6IE1lc3NhZ2UpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdCgpO1xyXG4gICAgaWYgKCFhY3RpdmVDaGF0KSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJDYW5ub3QgZGVsZXRlIG1lc3NhZ2U6IE5vIGFjdGl2ZSBjaGF0LlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIG5ldyBDb25maXJtTW9kYWwoXHJcbiAgICAgIHRoaXMuYXBwLFxyXG4gICAgICBcIkNvbmZpcm0gTWVzc2FnZSBEZWxldGlvblwiLFxyXG4gICAgICBgQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSB0aGlzIG1lc3NhZ2U/XFxuXCIke21lc3NhZ2VUb0RlbGV0ZS5jb250ZW50LnN1YnN0cmluZygwLCAxMDApfSR7XHJcbiAgICAgICAgbWVzc2FnZVRvRGVsZXRlLmNvbnRlbnQubGVuZ3RoID4gMTAwID8gXCIuLi5cIiA6IFwiXCJcclxuICAgICAgfVwiXFxuXFxuVGhpcyBhY3Rpb24gY2Fubm90IGJlIHVuZG9uZS5gLFxyXG4gICAgICBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmluZm8oXHJcbiAgICAgICAgICBgVXNlciBjb25maXJtZWQgZGVsZXRpb24gZm9yIG1lc3NhZ2UgdGltZXN0YW1wOiAke21lc3NhZ2VUb0RlbGV0ZS50aW1lc3RhbXAudG9JU09TdHJpbmcoKX0gaW4gY2hhdCAke1xyXG4gICAgICAgICAgICBhY3RpdmVDaGF0Lm1ldGFkYXRhLmlkXHJcbiAgICAgICAgICB9YFxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGNvbnN0IGRlbGV0ZVN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5kZWxldGVNZXNzYWdlQnlUaW1lc3RhbXAoXHJcbiAgICAgICAgICAgIGFjdGl2ZUNoYXQubWV0YWRhdGEuaWQsXHJcbiAgICAgICAgICAgIG1lc3NhZ2VUb0RlbGV0ZS50aW1lc3RhbXBcclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgaWYgKGRlbGV0ZVN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShcIk1lc3NhZ2UgZGVsZXRlZC5cIik7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIGRlbGV0ZSBtZXNzYWdlLlwiKTtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oXHJcbiAgICAgICAgICAgICAgYGRlbGV0ZU1lc3NhZ2VCeVRpbWVzdGFtcCByZXR1cm5lZCBmYWxzZSBmb3IgY2hhdCAke1xyXG4gICAgICAgICAgICAgICAgYWN0aXZlQ2hhdC5tZXRhZGF0YS5pZFxyXG4gICAgICAgICAgICAgIH0sIHRpbWVzdGFtcCAke21lc3NhZ2VUb0RlbGV0ZS50aW1lc3RhbXAudG9JU09TdHJpbmcoKX1gXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcclxuICAgICAgICAgICAgYEVycm9yIGRlbGV0aW5nIG1lc3NhZ2UgKGNoYXQgJHtcclxuICAgICAgICAgICAgICBhY3RpdmVDaGF0Lm1ldGFkYXRhLmlkXHJcbiAgICAgICAgICAgIH0sIHRpbWVzdGFtcCAke21lc3NhZ2VUb0RlbGV0ZS50aW1lc3RhbXAudG9JU09TdHJpbmcoKX0pOmAsXHJcbiAgICAgICAgICAgIGVycm9yXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgbmV3IE5vdGljZShcIkFuIGVycm9yIG9jY3VycmVkIHdoaWxlIGRlbGV0aW5nIHRoZSBtZXNzYWdlLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICkub3BlbigpO1xyXG4gIH1cclxuXHJcbiAgLy8g0J/QtdGA0LXQutC+0L3QsNC50YLQtdGB0Y8sINGJ0L4gdXBkYXRlU2VuZEJ1dHRvblN0YXRlINCy0LjQs9C70Y/QtNCw0ZQg0YLQsNC6OlxyXG4gIC8vIHByaXZhdGUgdXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk6IHZvaWQge1xyXG4gIC8vICAgaWYgKCF0aGlzLmlucHV0RWwgfHwgIXRoaXMuc2VuZEJ1dHRvbiB8fCAhdGhpcy5zdG9wR2VuZXJhdGluZ0J1dHRvbikgcmV0dXJuO1xyXG5cclxuICAvLyAgIGNvbnN0IGdlbmVyYXRpb25JblByb2dyZXNzID0gdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyICE9PSBudWxsO1xyXG4gIC8vICAgLy8gaXNQcm9jZXNzaW5nINCy0YHRgtCw0L3QvtCy0LvRjtGU0YLRjNGB0Y8v0YHQutC40LTQsNGU0YLRjNGB0Y8g0YfQtdGA0LXQtyBzZXRMb2FkaW5nU3RhdGVcclxuICAvLyAgIC8vINCa0L3QvtC/0LrQsCBTZW5kINCy0LjQvNC60L3QtdC90LAsINGP0LrRidC+INC/0L7Qu9C1INC/0L7RgNC+0LbQvdGULCDQsNCx0L4g0LnQtNC1INC+0LHRgNC+0LHQutCwIChpc1Byb2Nlc3NpbmcpLCDQsNCx0L4g0LnQtNC1INCz0LXQvdC10YDQsNGG0ZbRjyAoZ2VuZXJhdGlvbkluUHJvZ3Jlc3MpXHJcbiAgLy8gICBjb25zdCBpc1NlbmREaXNhYmxlZCA9IHRoaXMuaW5wdXRFbC52YWx1ZS50cmltKCkgPT09IFwiXCIgfHwgdGhpcy5pc1Byb2Nlc3NpbmcgfHwgZ2VuZXJhdGlvbkluUHJvZ3Jlc3M7XHJcblxyXG4gIC8vICAgdGhpcy5zZW5kQnV0dG9uLmRpc2FibGVkID0gaXNTZW5kRGlzYWJsZWQ7XHJcbiAgLy8gICB0aGlzLnNlbmRCdXR0b24uY2xhc3NMaXN0LnRvZ2dsZShDU1NfQ0xBU1NFUy5ESVNBQkxFRCwgaXNTZW5kRGlzYWJsZWQpO1xyXG5cclxuICAvLyAgIC8vINCa0L3QvtC/0LrQsCBTdG9wINCw0LrRgtC40LLQvdCwICjQstC40LTQuNC80LApLCDRgtGW0LvRjNC60Lgg0Y/QutGJ0L4g0ZQg0LDQutGC0LjQstC90LjQuSBBYm9ydENvbnRyb2xsZXIgKNGC0L7QsdGC0L4g0LnQtNC1INCz0LXQvdC10YDQsNGG0ZbRjylcclxuICAvLyAgIHRoaXMuc3RvcEdlbmVyYXRpbmdCdXR0b24udG9nZ2xlKGdlbmVyYXRpb25JblByb2dyZXNzKTtcclxuICAvLyAgIC8vINCa0L3QvtC/0LrQsCBTZW5kINGF0L7QstCw0ZTRgtGM0YHRjywg0Y/QutGJ0L4g0LDQutGC0LjQstC90LAg0LrQvdC+0L/QutCwIFN0b3BcclxuICAvLyAgIHRoaXMuc2VuZEJ1dHRvbi50b2dnbGUoIWdlbmVyYXRpb25JblByb2dyZXNzKTtcclxuICAvLyB9XHJcblxyXG4gIC8vINCf0LXRgNC10LrQvtC90LDQudGC0LXRgdGPLCDRidC+IGhhbmRsZU1lc3NhZ2VBZGRlZCDQvtGH0LjRidGD0ZQgdGhpcy5jdXJyZW50TWVzc2FnZUFkZGVkUmVzb2x2ZXIg0J3QkCDQn9Ce0KfQkNCi0JrQo1xyXG4gIC8vINGWINCy0LjQutC70LjQutCw0ZQgbG9jYWxSZXNvbHZlciDQkiDQmtCG0J3QptCGINGB0LLQvtCz0L4g0LHQu9C+0LrRgyB0cnkg0LDQsdC+INCyIGNhdGNoL2ZpbmFsbHkuXHJcblxyXG4gIC8vINCf0YDQuNC60LvQsNC0INGB0YLRgNGD0LrRgtGD0YDQuCBoYW5kbGVNZXNzYWdlQWRkZWQgKNC/0LXRgNC10LrQvtC90LDQudGC0LXRgdGPLCDRidC+INCy0LDRiNCwINCy0LXRgNGB0ZbRjyDRgdGF0L7QttCwKTpcclxuICAvLyBwcml2YXRlIGFzeW5jIGhhbmRsZU1lc3NhZ2VBZGRlZChkYXRhOiB7IGNoYXRJZDogc3RyaW5nOyBtZXNzYWdlOiBNZXNzYWdlIH0pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAvLyAgIGNvbnN0IGxvY2FsUmVzb2x2ZXIgPSB0aGlzLmN1cnJlbnRNZXNzYWdlQWRkZWRSZXNvbHZlcjtcclxuICAvLyAgIHRoaXMuY3VycmVudE1lc3NhZ2VBZGRlZFJlc29sdmVyID0gbnVsbDtcclxuXHJcbiAgLy8gICB0cnkge1xyXG4gIC8vICAgICAvLyAuLi4g0LLQsNGI0LAg0L7RgdC90L7QstC90LAg0LvQvtCz0ZbQutCwINC+0LHRgNC+0LHQutC4INC/0L7QstGW0LTQvtC80LvQtdC90L3RjyAuLi5cclxuICAvLyAgICAgLy8gLi4uINGP0LrRidC+INGG0LUg0L7QvdC+0LLQu9C10L3QvdGPINC/0LvQtdC50YHRhdC+0LvQtNC10YDQsCwgdGhpcy5hY3RpdmVQbGFjZWhvbGRlciA9IG51bGw7INCy0YHQtdGA0LXQtNC40L3RliAuLi5cclxuICAvLyAgIH0gY2F0Y2ggKG91dGVyRXJyb3I6IGFueSkge1xyXG4gIC8vICAgICAvLyAuLi4g0L7QsdGA0L7QsdC60LAg0L/QvtC80LjQu9C+0LogLi4uXHJcbiAgLy8gICB9IGZpbmFsbHkge1xyXG4gIC8vICAgICBpZiAobG9jYWxSZXNvbHZlcikge1xyXG4gIC8vICAgICAgIGxvY2FsUmVzb2x2ZXIoKTsgLy8g0JLQuNC60LvQuNC60LDRlNC80L4gcmVzb2x2ZXIg0YLRg9GCLCDRidC+0LEg0YHQuNCz0L3QsNC70ZbQt9GD0LLQsNGC0Lgg0L/RgNC+INC30LDQstC10YDRiNC10L3QvdGPXHJcbiAgLy8gICAgIH1cclxuICAvLyAgICAgLy8gLi4uINC70L7Qs9GD0LLQsNC90L3RjyDQstC40YXQvtC00YMgLi4uXHJcbiAgLy8gICB9XHJcbiAgLy8gfVxyXG5cclxuICBwdWJsaWMgaGFuZGxlQ29weUNsaWNrKGNvbnRlbnQ6IHN0cmluZywgYnV0dG9uRWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgICBsZXQgdGV4dFRvQ29weSA9IGNvbnRlbnQ7XHJcblxyXG4gICAgaWYgKFJlbmRlcmVyVXRpbHMuZGV0ZWN0VGhpbmtpbmdUYWdzKFJlbmRlcmVyVXRpbHMuZGVjb2RlSHRtbEVudGl0aWVzKGNvbnRlbnQpKS5oYXNUaGlua2luZ1RhZ3MpIHtcclxuICAgICAgdGV4dFRvQ29weSA9IFJlbmRlcmVyVXRpbHMuZGVjb2RlSHRtbEVudGl0aWVzKGNvbnRlbnQpXHJcbiAgICAgICAgLnJlcGxhY2UoLzx0aGluaz5bXFxzXFxTXSo/PFxcL3RoaW5rPi9nLCBcIlwiKVxyXG4gICAgICAgIC50cmltKCk7XHJcbiAgICB9XHJcbiAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkXHJcbiAgICAgIC53cml0ZVRleHQodGV4dFRvQ29weSlcclxuICAgICAgLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgIHNldEljb24oYnV0dG9uRWwsIFwiY2hlY2tcIik7XHJcbiAgICAgICAgYnV0dG9uRWwuc2V0QXR0cmlidXRlKFwidGl0bGVcIiwgXCJDb3BpZWQhXCIpO1xyXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgc2V0SWNvbihidXR0b25FbCwgXCJjb3B5XCIpO1xyXG4gICAgICAgICAgYnV0dG9uRWwuc2V0QXR0cmlidXRlKFwidGl0bGVcIiwgXCJDb3B5XCIpO1xyXG4gICAgICAgIH0sIDIwMDApO1xyXG4gICAgICB9KVxyXG4gICAgICAuY2F0Y2goZXJyID0+IHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiQ29weSBmYWlsZWQ6XCIsIGVycik7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBjb3B5IHRleHQuXCIpO1xyXG4gICAgICB9KTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBhc3luYyBoYW5kbGVUcmFuc2xhdGVDbGljayhcclxuICAgIG9yaWdpbmFsQ29udGVudDogc3RyaW5nLFxyXG4gICAgY29udGVudEVsOiBIVE1MRWxlbWVudCxcclxuICAgIGJ1dHRvbkVsOiBIVE1MQnV0dG9uRWxlbWVudFxyXG4gICk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgdGFyZ2V0TGFuZyA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uVGFyZ2V0TGFuZ3VhZ2U7XHJcblxyXG4gICAgaWYgKCF0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVUcmFuc2xhdGlvbiB8fCB0aGlzLnBsdWdpbi5zZXR0aW5ncy50cmFuc2xhdGlvblByb3ZpZGVyID09PSBcIm5vbmVcIikge1xyXG4gICAgICBuZXcgTm90aWNlKFwiVHJhbnNsYXRpb24gZGlzYWJsZWQgb3IgcHJvdmlkZXIgbm90IHNlbGVjdGVkIGluIHNldHRpbmdzLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGFyZ2V0TGFuZykge1xyXG4gICAgICBuZXcgTm90aWNlKFwiVGFyZ2V0IGxhbmd1YWdlIGZvciB0cmFuc2xhdGlvbiBpcyBub3Qgc2V0IGluIHNldHRpbmdzLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCB0ZXh0VG9UcmFuc2xhdGUgPSBcIlwiO1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgZGVjb2RlZENvbnRlbnQgPSBSZW5kZXJlclV0aWxzLmRlY29kZUh0bWxFbnRpdGllcyhvcmlnaW5hbENvbnRlbnQpO1xyXG4gICAgICBpZiAoUmVuZGVyZXJVdGlscy5kZXRlY3RUaGlua2luZ1RhZ3MoZGVjb2RlZENvbnRlbnQpLmhhc1RoaW5raW5nVGFncykge1xyXG4gICAgICAgIHRleHRUb1RyYW5zbGF0ZSA9IGRlY29kZWRDb250ZW50LnJlcGxhY2UoLzx0aGluaz5bXFxzXFxTXSo/PFxcL3RoaW5rPi9nLCBcIlwiKS50cmltKCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGV4dFRvVHJhbnNsYXRlID0gZGVjb2RlZENvbnRlbnQudHJpbSgpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoIXRleHRUb1RyYW5zbGF0ZSkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJOb3RoaW5nIHRvIHRyYW5zbGF0ZSAoY29udGVudCBtaWdodCBiZSBlbXB0eSBhZnRlciByZW1vdmluZyBpbnRlcm5hbCB0YWdzKS5cIik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbaGFuZGxlVHJhbnNsYXRlQ2xpY2tdIEVycm9yIGR1cmluZyB0ZXh0IHByZXByb2Nlc3Npbmc6XCIsIGVycm9yKTtcclxuICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBwcmVwYXJlIHRleHQgZm9yIHRyYW5zbGF0aW9uLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yKGAuJHtDU1NfQ0xBU1NfVFJBTlNMQVRJT05fQ09OVEFJTkVSfWApPy5yZW1vdmUoKTtcclxuXHJcbiAgICBjb25zdCBvcmlnaW5hbEljb24gPSBidXR0b25FbC5xdWVyeVNlbGVjdG9yKFwiLnN2Zy1pY29uXCIpPy5nZXRBdHRyaWJ1dGUoXCJpY29uLW5hbWVcIikgfHwgXCJsYW5ndWFnZXNcIjtcclxuICAgIHNldEljb24oYnV0dG9uRWwsIFwibG9hZGVyXCIpO1xyXG4gICAgYnV0dG9uRWwuZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgYnV0dG9uRWwuY2xhc3NMaXN0LmFkZChDU1NfQ0xBU1NfVFJBTlNMQVRJT05fUEVORElORyk7XHJcbiAgICBjb25zdCBvcmlnaW5hbFRpdGxlID0gYnV0dG9uRWwudGl0bGU7XHJcbiAgICBidXR0b25FbC5zZXRBdHRyaWJ1dGUoXCJ0aXRsZVwiLCBcIlRyYW5zbGF0aW5nLi4uXCIpO1xyXG4gICAgYnV0dG9uRWwuYWRkQ2xhc3MoXCJidXR0b24tbG9hZGluZ1wiKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCB0cmFuc2xhdGVkVGV4dCA9IGF3YWl0IHRoaXMucGx1Z2luLnRyYW5zbGF0aW9uU2VydmljZS50cmFuc2xhdGUodGV4dFRvVHJhbnNsYXRlLCB0YXJnZXRMYW5nKTtcclxuXHJcbiAgICAgIGlmICghY29udGVudEVsIHx8ICFjb250ZW50RWwuaXNDb25uZWN0ZWQpIHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXHJcbiAgICAgICAgICBcIltoYW5kbGVUcmFuc2xhdGVDbGlja10gY29udGVudEVsIGlzIG51bGwgb3Igbm90IGNvbm5lY3RlZCB0byBET00gd2hlbiB0cmFuc2xhdGlvbiBhcnJpdmVkLlwiXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodHJhbnNsYXRlZFRleHQgIT09IG51bGwpIHtcclxuICAgICAgICBjb25zdCB0cmFuc2xhdGlvbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU19UUkFOU0xBVElPTl9DT05UQUlORVIgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHRyYW5zbGF0aW9uQ29udGVudEVsID0gdHJhbnNsYXRpb25Db250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NfVFJBTlNMQVRJT05fQ09OVEVOVCB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgTWFya2Rvd25SZW5kZXJlci5yZW5kZXIoXHJcbiAgICAgICAgICB0aGlzLmFwcCxcclxuICAgICAgICAgIHRyYW5zbGF0ZWRUZXh0LFxyXG4gICAgICAgICAgdHJhbnNsYXRpb25Db250ZW50RWwsXHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5hcHAudmF1bHQuZ2V0Um9vdCgpPy5wYXRoID8/IFwiXCIsXHJcbiAgICAgICAgICB0aGlzXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgUmVuZGVyZXJVdGlscy5maXhCcm9rZW5Ud2Vtb2ppSW1hZ2VzKHRyYW5zbGF0aW9uQ29udGVudEVsKTtcclxuXHJcbiAgICAgICAgY29uc3QgdGFyZ2V0TGFuZ05hbWUgPSBMQU5HVUFHRVNbdGFyZ2V0TGFuZ10gfHwgdGFyZ2V0TGFuZztcclxuICAgICAgICB0cmFuc2xhdGlvbkNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiLCB7XHJcbiAgICAgICAgICBjbHM6IFwidHJhbnNsYXRpb24taW5kaWNhdG9yXCIsXHJcbiAgICAgICAgICB0ZXh0OiBgW1RyYW5zbGF0ZWQgdG8gJHt0YXJnZXRMYW5nTmFtZX1dYCxcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oNTAsIGZhbHNlKTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW09sbGFtYVZpZXddIFVuZXhwZWN0ZWQgZXJyb3IgZHVyaW5nIG1lc3NhZ2UgdHJhbnNsYXRpb24gY2FsbDpcIiwgZXJyb3IpO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgaWYgKGJ1dHRvbkVsPy5pc0Nvbm5lY3RlZCkge1xyXG4gICAgICAgIHNldEljb24oYnV0dG9uRWwsIG9yaWdpbmFsSWNvbik7XHJcbiAgICAgICAgYnV0dG9uRWwuZGlzYWJsZWQgPSBmYWxzZTtcclxuICAgICAgICBidXR0b25FbC5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19UUkFOU0xBVElPTl9QRU5ESU5HKTtcclxuICAgICAgICBidXR0b25FbC5zZXRBdHRyaWJ1dGUoXCJ0aXRsZVwiLCBvcmlnaW5hbFRpdGxlKTtcclxuICAgICAgICBidXR0b25FbC5yZW1vdmVDbGFzcyhcImJ1dHRvbi1sb2FkaW5nXCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlbmRlckRhdGVTZXBhcmF0b3IoZGF0ZTogRGF0ZSk6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLmNoYXRDb250YWluZXIpIHJldHVybjtcclxuICAgIHRoaXMuY2hhdENvbnRhaW5lci5jcmVhdGVEaXYoe1xyXG4gICAgICBjbHM6IENTU19DTEFTU19EQVRFX1NFUEFSQVRPUixcclxuICAgICAgdGV4dDogdGhpcy5mb3JtYXREYXRlU2VwYXJhdG9yKGRhdGUpLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGluaXRTcGVlY2hXb3JrZXIoKTogdm9pZCB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBidWZmZXJUb0Jhc2U2NCA9IChidWZmZXI6IEFycmF5QnVmZmVyKTogc3RyaW5nID0+IHtcclxuICAgICAgICBsZXQgYmluYXJ5ID0gXCJcIjtcclxuICAgICAgICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlcik7XHJcbiAgICAgICAgY29uc3QgbGVuID0gYnl0ZXMuYnl0ZUxlbmd0aDtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgICAgICBiaW5hcnkgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlc1tpXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBidG9hKGJpbmFyeSk7XHJcbiAgICAgIH07XHJcblxyXG4gICAgICBjb25zdCB3b3JrZXJDb2RlID0gYFxyXG4gICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICBzZWxmLm9ubWVzc2FnZSA9IGFzeW5jIChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgIGNvbnN0IHsgYXBpS2V5LCBhdWRpb0Jsb2IsIGxhbmd1YWdlQ29kZSA9ICd1ay1VQScgfSA9IGV2ZW50LmRhdGE7XHJcblxyXG4gICAgICAgICAgICAgICAgIGlmICghYXBpS2V5IHx8IGFwaUtleS50cmltKCkgPT09ICcnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgIHNlbGYucG9zdE1lc3NhZ2UoeyBlcnJvcjogdHJ1ZSwgbWVzc2FnZTogJ0dvb2dsZSBBUEkgS2V5IGlzIG5vdCBjb25maWd1cmVkLiBQbGVhc2UgYWRkIGl0IGluIHBsdWdpbiBzZXR0aW5ncy4nIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICBjb25zdCB1cmwgPSBcImh0dHBzOlxyXG5cclxuICAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBhcnJheUJ1ZmZlciA9IGF3YWl0IGF1ZGlvQmxvYi5hcnJheUJ1ZmZlcigpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICBsZXQgYmFzZTY0QXVkaW87XHJcbiAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgVGV4dERlY29kZXIgIT09ICd1bmRlZmluZWQnKSB7IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2U2NFN0cmluZyA9IGJ0b2EoU3RyaW5nLmZyb21DaGFyQ29kZSguLi5uZXcgVWludDhBcnJheShhcnJheUJ1ZmZlcikpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXNlNjRBdWRpbyA9IGJhc2U2NFN0cmluZztcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYmFzZTY0QXVkaW8gPSBidG9hKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgVWludDhBcnJheShhcnJheUJ1ZmZlcikucmVkdWNlKChkYXRhLCBieXRlKSA9PiBkYXRhICsgU3RyaW5nLmZyb21DaGFyQ29kZShieXRlKSwgJycpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25maWc6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5jb2Rpbmc6ICdXRUJNX09QVVMnLCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2FtcGxlUmF0ZUhlcnR6OiA0ODAwMCwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhbmd1YWdlQ29kZTogbGFuZ3VhZ2VDb2RlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbDogJ2xhdGVzdF9sb25nJywgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZUF1dG9tYXRpY1B1bmN0dWF0aW9uOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXVkaW86IHsgY29udGVudDogYmFzZTY0QXVkaW8gfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2VEYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBcIkVycm9yIGZyb20gR29vZ2xlIFNwZWVjaCBBUEk6IFwiICsgKHJlc3BvbnNlRGF0YS5lcnJvcj8ubWVzc2FnZSB8fCByZXNwb25zZS5zdGF0dXNUZXh0IHx8ICdVbmtub3duIGVycm9yJylcclxuICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2VEYXRhLnJlc3VsdHMgJiYgcmVzcG9uc2VEYXRhLnJlc3VsdHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJhbnNjcmlwdCA9IHJlc3BvbnNlRGF0YS5yZXN1bHRzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLm1hcChyZXN1bHQgPT4gcmVzdWx0LmFsdGVybmF0aXZlc1swXS50cmFuc2NyaXB0KVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5qb2luKCcgJylcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5wb3N0TWVzc2FnZSh0cmFuc2NyaXB0KTsgXHJcbiAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucG9zdE1lc3NhZ2UoeyBlcnJvcjogdHJ1ZSwgbWVzc2FnZTogJ05vIHNwZWVjaCBkZXRlY3RlZCBvciByZWNvZ25pemVkLicgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgc2VsZi5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdFcnJvciBwcm9jZXNzaW5nIHNwZWVjaCByZWNvZ25pdGlvbjogJyArIChlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcikpXHJcbiAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgYDtcclxuXHJcbiAgICAgIGNvbnN0IHdvcmtlckJsb2IgPSBuZXcgQmxvYihbd29ya2VyQ29kZV0sIHtcclxuICAgICAgICB0eXBlOiBcImFwcGxpY2F0aW9uL2phdmFzY3JpcHRcIixcclxuICAgICAgfSk7XHJcbiAgICAgIGNvbnN0IHdvcmtlclVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwod29ya2VyQmxvYik7XHJcbiAgICAgIHRoaXMuc3BlZWNoV29ya2VyID0gbmV3IFdvcmtlcih3b3JrZXJVcmwpO1xyXG4gICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHdvcmtlclVybCk7XHJcblxyXG4gICAgICB0aGlzLnNldHVwU3BlZWNoV29ya2VySGFuZGxlcnMoKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJTcGVlY2ggcmVjb2duaXRpb24gZmVhdHVyZSBmYWlsZWQgdG8gaW5pdGlhbGl6ZS5cIik7XHJcbiAgICAgIHRoaXMuc3BlZWNoV29ya2VyID0gbnVsbDtcclxuICAgIH1cclxuICB9XHJcbiAgcHJpdmF0ZSBzZXR1cFNwZWVjaFdvcmtlckhhbmRsZXJzKCk6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLnNwZWVjaFdvcmtlcikgcmV0dXJuO1xyXG5cclxuICAgIHRoaXMuc3BlZWNoV29ya2VyLm9ubWVzc2FnZSA9IGV2ZW50ID0+IHtcclxuICAgICAgY29uc3QgZGF0YSA9IGV2ZW50LmRhdGE7XHJcblxyXG4gICAgICBpZiAoZGF0YSAmJiB0eXBlb2YgZGF0YSA9PT0gXCJvYmplY3RcIiAmJiBkYXRhLmVycm9yKSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShgU3BlZWNoIFJlY29nbml0aW9uIEVycm9yOiAke2RhdGEubWVzc2FnZX1gKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZUlucHV0UGxhY2Vob2xkZXIodGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiICYmIGRhdGEudHJpbSgpKSB7XHJcbiAgICAgICAgY29uc3QgdHJhbnNjcmlwdCA9IGRhdGEudHJpbSgpO1xyXG4gICAgICAgIHRoaXMuaW5zZXJ0VHJhbnNjcmlwdCh0cmFuc2NyaXB0KTtcclxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YSAhPT0gXCJzdHJpbmdcIikge1xyXG4gICAgICB9XHJcblxyXG4gICAgICB0aGlzLnVwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnNwZWVjaFdvcmtlci5vbmVycm9yID0gZXJyb3IgPT4ge1xyXG4gICAgICBuZXcgTm90aWNlKFwiQW4gdW5leHBlY3RlZCBlcnJvciBvY2N1cnJlZCBpbiB0aGUgc3BlZWNoIHJlY29nbml0aW9uIHdvcmtlci5cIik7XHJcbiAgICAgIHRoaXMudXBkYXRlSW5wdXRQbGFjZWhvbGRlcih0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWUpO1xyXG5cclxuICAgICAgdGhpcy5zdG9wVm9pY2VSZWNvcmRpbmcoZmFsc2UpO1xyXG4gICAgfTtcclxuICB9XHJcbiAgcHJpdmF0ZSBpbnNlcnRUcmFuc2NyaXB0KHRyYW5zY3JpcHQ6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLmlucHV0RWwpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCBjdXJyZW50VmFsID0gdGhpcy5pbnB1dEVsLnZhbHVlO1xyXG4gICAgY29uc3Qgc3RhcnQgPSB0aGlzLmlucHV0RWwuc2VsZWN0aW9uU3RhcnQgPz8gY3VycmVudFZhbC5sZW5ndGg7XHJcbiAgICBjb25zdCBlbmQgPSB0aGlzLmlucHV0RWwuc2VsZWN0aW9uRW5kID8/IGN1cnJlbnRWYWwubGVuZ3RoO1xyXG5cclxuICAgIGxldCB0ZXh0VG9JbnNlcnQgPSB0cmFuc2NyaXB0O1xyXG4gICAgY29uc3QgcHJlY2VkaW5nQ2hhciA9IHN0YXJ0ID4gMCA/IGN1cnJlbnRWYWxbc3RhcnQgLSAxXSA6IG51bGw7XHJcbiAgICBjb25zdCBmb2xsb3dpbmdDaGFyID0gZW5kIDwgY3VycmVudFZhbC5sZW5ndGggPyBjdXJyZW50VmFsW2VuZF0gOiBudWxsO1xyXG5cclxuICAgIGlmIChwcmVjZWRpbmdDaGFyICYmIHByZWNlZGluZ0NoYXIgIT09IFwiIFwiICYmIHByZWNlZGluZ0NoYXIgIT09IFwiXFxuXCIpIHtcclxuICAgICAgdGV4dFRvSW5zZXJ0ID0gXCIgXCIgKyB0ZXh0VG9JbnNlcnQ7XHJcbiAgICB9XHJcbiAgICBpZiAoZm9sbG93aW5nQ2hhciAmJiBmb2xsb3dpbmdDaGFyICE9PSBcIiBcIiAmJiBmb2xsb3dpbmdDaGFyICE9PSBcIlxcblwiICYmICF0ZXh0VG9JbnNlcnQuZW5kc1dpdGgoXCIgXCIpKSB7XHJcbiAgICAgIHRleHRUb0luc2VydCArPSBcIiBcIjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBuZXdWYWx1ZSA9IGN1cnJlbnRWYWwuc3Vic3RyaW5nKDAsIHN0YXJ0KSArIHRleHRUb0luc2VydCArIGN1cnJlbnRWYWwuc3Vic3RyaW5nKGVuZCk7XHJcbiAgICB0aGlzLmlucHV0RWwudmFsdWUgPSBuZXdWYWx1ZTtcclxuXHJcbiAgICBjb25zdCBuZXdDdXJzb3JQb3MgPSBzdGFydCArIHRleHRUb0luc2VydC5sZW5ndGg7XHJcbiAgICB0aGlzLmlucHV0RWwuc2V0U2VsZWN0aW9uUmFuZ2UobmV3Q3Vyc29yUG9zLCBuZXdDdXJzb3JQb3MpO1xyXG5cclxuICAgIHRoaXMuaW5wdXRFbC5mb2N1cygpO1xyXG4gICAgdGhpcy5pbnB1dEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIikpO1xyXG4gIH1cclxuICBwcml2YXRlIGFzeW5jIHRvZ2dsZVZvaWNlUmVjb2duaXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBpZiAodGhpcy5tZWRpYVJlY29yZGVyICYmIHRoaXMubWVkaWFSZWNvcmRlci5zdGF0ZSA9PT0gXCJyZWNvcmRpbmdcIikge1xyXG4gICAgICB0aGlzLnN0b3BWb2ljZVJlY29yZGluZyh0cnVlKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuc3RhcnRWb2ljZVJlY29nbml0aW9uKCk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHByaXZhdGUgYXN5bmMgc3RhcnRWb2ljZVJlY29nbml0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgaWYgKCF0aGlzLnNwZWVjaFdvcmtlcikge1xyXG4gICAgICBuZXcgTm90aWNlKFwi0KTRg9C90LrRhtGW0Y8g0YDQvtC30L/RltC30L3QsNCy0LDQvdC90Y8g0LzQvtCy0LvQtdC90L3RjyDQvdC10LTQvtGB0YLRg9C/0L3QsCAod29ya2VyINC90LUg0ZbQvdGW0YbRltCw0LvRltC30L7QstCw0L3QvikuXCIpO1xyXG5cclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHNwZWVjaEFwaUtleSA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmdvb2dsZUFwaUtleTtcclxuICAgIGlmICghc3BlZWNoQXBpS2V5KSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXHJcbiAgICAgICAgXCLQmtC70Y7RhyBHb29nbGUgQVBJINC00LvRjyDRgNC+0LfQv9GW0LfQvdCw0LLQsNC90L3RjyDQvNC+0LLQu9C10L3QvdGPINC90LUg0L3QsNC70LDRiNGC0L7QstCw0L3Qvi4g0JHRg9C00Ywg0LvQsNGB0LrQsCwg0LTQvtC00LDQudGC0LUg0LnQvtCz0L4g0LIg0L3QsNC70LDRiNGC0YPQstCw0L3QvdGP0YUg0L/Qu9Cw0LPRltC90LAuXCJcclxuICAgICAgKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIHRoaXMuYXVkaW9TdHJlYW0gPSBhd2FpdCBuYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmdldFVzZXJNZWRpYSh7XHJcbiAgICAgICAgYXVkaW86IHRydWUsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgbGV0IHJlY29yZGVyT3B0aW9uczogTWVkaWFSZWNvcmRlck9wdGlvbnMgfCB1bmRlZmluZWQ7XHJcbiAgICAgIGNvbnN0IHByZWZlcnJlZE1pbWVUeXBlID0gXCJhdWRpby93ZWJtO2NvZGVjcz1vcHVzXCI7XHJcblxyXG4gICAgICBpZiAoTWVkaWFSZWNvcmRlci5pc1R5cGVTdXBwb3J0ZWQocHJlZmVycmVkTWltZVR5cGUpKSB7XHJcbiAgICAgICAgcmVjb3JkZXJPcHRpb25zID0geyBtaW1lVHlwZTogcHJlZmVycmVkTWltZVR5cGUgfTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZWNvcmRlck9wdGlvbnMgPSB1bmRlZmluZWQ7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMubWVkaWFSZWNvcmRlciA9IG5ldyBNZWRpYVJlY29yZGVyKHRoaXMuYXVkaW9TdHJlYW0sIHJlY29yZGVyT3B0aW9ucyk7XHJcblxyXG4gICAgICBjb25zdCBhdWRpb0NodW5rczogQmxvYltdID0gW107XHJcblxyXG4gICAgICB0aGlzLnZvaWNlQnV0dG9uPy5jbGFzc0xpc3QuYWRkKENTU19DTEFTU19SRUNPUkRJTkcpO1xyXG4gICAgICBzZXRJY29uKHRoaXMudm9pY2VCdXR0b24sIFwic3RvcC1jaXJjbGVcIik7XHJcbiAgICAgIHRoaXMuaW5wdXRFbC5wbGFjZWhvbGRlciA9IFwiUmVjb3JkaW5nLi4uIFNwZWFrIG5vdy5cIjtcclxuXHJcbiAgICAgIHRoaXMubWVkaWFSZWNvcmRlci5vbmRhdGFhdmFpbGFibGUgPSBldmVudCA9PiB7XHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEuc2l6ZSA+IDApIHtcclxuICAgICAgICAgIGF1ZGlvQ2h1bmtzLnB1c2goZXZlbnQuZGF0YSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9O1xyXG4gICAgICB0aGlzLm1lZGlhUmVjb3JkZXIub25zdG9wID0gKCkgPT4ge1xyXG4gICAgICAgIGlmICh0aGlzLnNwZWVjaFdvcmtlciAmJiBhdWRpb0NodW5rcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICBjb25zdCBhdWRpb0Jsb2IgPSBuZXcgQmxvYihhdWRpb0NodW5rcywge1xyXG4gICAgICAgICAgICB0eXBlOiB0aGlzLm1lZGlhUmVjb3JkZXI/Lm1pbWVUeXBlIHx8IFwiYXVkaW8vd2VibVwiLFxyXG4gICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgdGhpcy5pbnB1dEVsLnBsYWNlaG9sZGVyID0gXCJQcm9jZXNzaW5nIHNwZWVjaC4uLlwiO1xyXG4gICAgICAgICAgdGhpcy5zcGVlY2hXb3JrZXIucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICBhcGlLZXk6IHNwZWVjaEFwaUtleSxcclxuICAgICAgICAgICAgYXVkaW9CbG9iLFxyXG4gICAgICAgICAgICBsYW5ndWFnZUNvZGU6IHRoaXMucGx1Z2luLnNldHRpbmdzLnNwZWVjaExhbmd1YWdlIHx8IFwidWstVUFcIixcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoYXVkaW9DaHVua3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICB0aGlzLmdldEN1cnJlbnRSb2xlRGlzcGxheU5hbWUoKS50aGVuKHJvbGVOYW1lID0+IHRoaXMudXBkYXRlSW5wdXRQbGFjZWhvbGRlcihyb2xlTmFtZSkpO1xyXG4gICAgICAgICAgdGhpcy51cGRhdGVTZW5kQnV0dG9uU3RhdGUoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH07XHJcbiAgICAgIHRoaXMubWVkaWFSZWNvcmRlci5vbmVycm9yID0gZXZlbnQgPT4ge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJBbiBlcnJvciBvY2N1cnJlZCBkdXJpbmcgcmVjb3JkaW5nLlwiKTtcclxuICAgICAgICB0aGlzLnN0b3BWb2ljZVJlY29yZGluZyhmYWxzZSk7XHJcbiAgICAgIH07XHJcblxyXG4gICAgICB0aGlzLm1lZGlhUmVjb3JkZXIuc3RhcnQoKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIERPTUV4Y2VwdGlvbiAmJiBlcnJvci5uYW1lID09PSBcIk5vdEFsbG93ZWRFcnJvclwiKSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIk1pY3JvcGhvbmUgYWNjZXNzIGRlbmllZC4gUGxlYXNlIGdyYW50IHBlcm1pc3Npb24uXCIpO1xyXG4gICAgICB9IGVsc2UgaWYgKGVycm9yIGluc3RhbmNlb2YgRE9NRXhjZXB0aW9uICYmIGVycm9yLm5hbWUgPT09IFwiTm90Rm91bmRFcnJvclwiKSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIk1pY3JvcGhvbmUgbm90IGZvdW5kLiBQbGVhc2UgZW5zdXJlIGl0J3MgY29ubmVjdGVkIGFuZCBlbmFibGVkLlwiKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiQ291bGQgbm90IHN0YXJ0IHZvaWNlIHJlY29yZGluZy5cIik7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5zdG9wVm9pY2VSZWNvcmRpbmcoZmFsc2UpO1xyXG4gICAgfVxyXG4gIH1cclxuICBwcml2YXRlIHN0b3BWb2ljZVJlY29yZGluZyhwcm9jZXNzQXVkaW86IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLm1lZGlhUmVjb3JkZXIgJiYgdGhpcy5tZWRpYVJlY29yZGVyLnN0YXRlID09PSBcInJlY29yZGluZ1wiKSB7XHJcbiAgICAgIHRoaXMubWVkaWFSZWNvcmRlci5zdG9wKCk7XHJcbiAgICB9IGVsc2UgaWYgKCFwcm9jZXNzQXVkaW8gJiYgdGhpcy5tZWRpYVJlY29yZGVyPy5zdGF0ZSA9PT0gXCJpbmFjdGl2ZVwiKSB7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy52b2ljZUJ1dHRvbj8uY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NfUkVDT1JESU5HKTtcclxuICAgIHNldEljb24odGhpcy52b2ljZUJ1dHRvbiwgXCJtaWNcIik7XHJcblxyXG4gICAgdGhpcy5nZXRDdXJyZW50Um9sZURpc3BsYXlOYW1lKCkudGhlbihyb2xlTmFtZSA9PiB0aGlzLnVwZGF0ZUlucHV0UGxhY2Vob2xkZXIocm9sZU5hbWUpKTtcclxuICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcblxyXG4gICAgaWYgKHRoaXMuYXVkaW9TdHJlYW0pIHtcclxuICAgICAgdGhpcy5hdWRpb1N0cmVhbS5nZXRUcmFja3MoKS5mb3JFYWNoKHRyYWNrID0+IHRyYWNrLnN0b3AoKSk7XHJcbiAgICAgIHRoaXMuYXVkaW9TdHJlYW0gPSBudWxsO1xyXG4gICAgfVxyXG4gICAgdGhpcy5tZWRpYVJlY29yZGVyID0gbnVsbDtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBjaGVja0FsbE1lc3NhZ2VzRm9yQ29sbGFwc2luZygpOiB2b2lkIHtcclxuICAgIHRoaXMuY2hhdENvbnRhaW5lcj8ucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oYC4ke0NTU19DTEFTU19NRVNTQUdFfWApLmZvckVhY2gobXNnRWwgPT4ge1xyXG4gICAgICB0aGlzLmNoZWNrTWVzc2FnZUZvckNvbGxhcHNpbmcobXNnRWwpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHRvZ2dsZU1lc3NhZ2VDb2xsYXBzZShjb250ZW50RWw6IEhUTUxFbGVtZW50LCBidXR0b25FbDogSFRNTEJ1dHRvbkVsZW1lbnQpOiB2b2lkIHtcclxuICAgIGNvbnN0IG1heEhlaWdodExpbWl0ID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MubWF4TWVzc2FnZUhlaWdodDtcclxuXHJcbiAgICBjb25zdCBpc0luaXRpYWxFeHBhbmRlZFN0YXRlID0gYnV0dG9uRWwuaGFzQXR0cmlidXRlKFwiZGF0YS1pbml0aWFsLXN0YXRlXCIpO1xyXG5cclxuICAgIGlmIChpc0luaXRpYWxFeHBhbmRlZFN0YXRlKSB7XHJcbiAgICAgIGJ1dHRvbkVsLnJlbW92ZUF0dHJpYnV0ZShcImRhdGEtaW5pdGlhbC1zdGF0ZVwiKTtcclxuXHJcbiAgICAgIGNvbnRlbnRFbC5zdHlsZS5tYXhIZWlnaHQgPSBgJHttYXhIZWlnaHRMaW1pdH1weGA7XHJcbiAgICAgIGNvbnRlbnRFbC5jbGFzc0xpc3QuYWRkKENTU19DTEFTU19DT05URU5UX0NPTExBUFNFRCk7XHJcbiAgICAgIGJ1dHRvbkVsLnNldFRleHQoXCJTaG93IE1vcmUg4pa8XCIpO1xyXG5cclxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgY29udGVudEVsLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6IFwic21vb3RoXCIsIGJsb2NrOiBcIm5lYXJlc3RcIiB9KTtcclxuICAgICAgfSwgMzEwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnN0IGlzQ29sbGFwc2VkID0gY29udGVudEVsLmNsYXNzTGlzdC5jb250YWlucyhDU1NfQ0xBU1NfQ09OVEVOVF9DT0xMQVBTRUQpO1xyXG5cclxuICAgICAgaWYgKGlzQ29sbGFwc2VkKSB7XHJcbiAgICAgICAgY29udGVudEVsLnN0eWxlLm1heEhlaWdodCA9IFwiXCI7XHJcbiAgICAgICAgY29udGVudEVsLmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX0NPTlRFTlRfQ09MTEFQU0VEKTtcclxuICAgICAgICBidXR0b25FbC5zZXRUZXh0KFwiU2hvdyBMZXNzIOKWslwiKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb250ZW50RWwuc3R5bGUubWF4SGVpZ2h0ID0gYCR7bWF4SGVpZ2h0TGltaXR9cHhgO1xyXG4gICAgICAgIGNvbnRlbnRFbC5jbGFzc0xpc3QuYWRkKENTU19DTEFTU19DT05URU5UX0NPTExBUFNFRCk7XHJcbiAgICAgICAgYnV0dG9uRWwuc2V0VGV4dChcIlNob3cgTW9yZSDilrxcIik7XHJcblxyXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgY29udGVudEVsLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6IFwic21vb3RoXCIsIGJsb2NrOiBcIm5lYXJlc3RcIiB9KTtcclxuICAgICAgICB9LCAzMTApO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgZ2V0Q2hhdENvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB7XHJcbiAgICByZXR1cm4gdGhpcy5jaGF0Q29udGFpbmVyO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjbGVhckNoYXRDb250YWluZXJJbnRlcm5hbCgpOiB2b2lkIHtcclxuICAgIHRoaXMuY3VycmVudE1lc3NhZ2VzID0gW107XHJcbiAgICB0aGlzLmxhc3RSZW5kZXJlZE1lc3NhZ2VEYXRlID0gbnVsbDtcclxuICAgIGlmICh0aGlzLmNoYXRDb250YWluZXIpIHRoaXMuY2hhdENvbnRhaW5lci5lbXB0eSgpO1xyXG4gICAgdGhpcy5oaWRlRW1wdHlTdGF0ZSgpO1xyXG4gICAgdGhpcy5sYXN0TWVzc2FnZUVsZW1lbnQgPSBudWxsO1xyXG4gICAgdGhpcy5jb25zZWN1dGl2ZUVycm9yTWVzc2FnZXMgPSBbXTtcclxuICAgIHRoaXMuZXJyb3JHcm91cEVsZW1lbnQgPSBudWxsO1xyXG4gICAgdGhpcy5pc1N1bW1hcml6aW5nRXJyb3JzID0gZmFsc2U7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgY2xlYXJEaXNwbGF5QW5kU3RhdGUoKTogdm9pZCB7XHJcbiAgICB0aGlzLmNsZWFyQ2hhdENvbnRhaW5lckludGVybmFsKCk7XHJcbiAgICB0aGlzLnNob3dFbXB0eVN0YXRlKCk7XHJcbiAgICB0aGlzLnVwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpO1xyXG4gICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLmZvY3VzSW5wdXQoKSwgNTApO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIHNjcm9sbFRvQm90dG9tKCk6IHZvaWQge1xyXG4gICAgdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oNTAsIHRydWUpO1xyXG4gIH1cclxuICBwdWJsaWMgY2xlYXJJbnB1dEZpZWxkKCk6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMuaW5wdXRFbCkge1xyXG4gICAgICB0aGlzLmlucHV0RWwudmFsdWUgPSBcIlwiO1xyXG4gICAgICB0aGlzLmlucHV0RWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoXCJpbnB1dFwiKSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHB1YmxpYyBmb2N1c0lucHV0KCk6IHZvaWQge1xyXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgIHRoaXMuaW5wdXRFbD8uZm9jdXMoKTtcclxuICAgIH0sIDApO1xyXG4gIH1cclxuXHJcbiAgZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKGRlbGF5ID0gNTAsIGZvcmNlU2Nyb2xsID0gZmFsc2UpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLnNjcm9sbFRpbWVvdXQpIHtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuc2Nyb2xsVGltZW91dCk7XHJcbiAgICAgIHRoaXMuc2Nyb2xsVGltZW91dCA9IG51bGw7XHJcbiAgICB9XHJcbiAgICB0aGlzLnNjcm9sbFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcclxuICAgICAgICBpZiAodGhpcy5jaGF0Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICBjb25zdCB0aHJlc2hvbGQgPSAxMDA7XHJcbiAgICAgICAgICBjb25zdCBpc1Njcm9sbGVkVXAgPVxyXG4gICAgICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsSGVpZ2h0IC0gdGhpcy5jaGF0Q29udGFpbmVyLnNjcm9sbFRvcCAtIHRoaXMuY2hhdENvbnRhaW5lci5jbGllbnRIZWlnaHQgPlxyXG4gICAgICAgICAgICB0aHJlc2hvbGQ7XHJcblxyXG4gICAgICAgICAgaWYgKGlzU2Nyb2xsZWRVcCAhPT0gdGhpcy51c2VyU2Nyb2xsZWRVcCkge1xyXG4gICAgICAgICAgICB0aGlzLnVzZXJTY3JvbGxlZFVwID0gaXNTY3JvbGxlZFVwO1xyXG5cclxuICAgICAgICAgICAgaWYgKCFpc1Njcm9sbGVkVXApIHRoaXMubmV3TWVzc2FnZXNJbmRpY2F0b3JFbD8uY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NfVklTSUJMRSk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKGZvcmNlU2Nyb2xsIHx8ICF0aGlzLnVzZXJTY3JvbGxlZFVwIHx8IHRoaXMuaXNQcm9jZXNzaW5nKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJlaGF2aW9yID0gdGhpcy5pc1Byb2Nlc3NpbmcgPyBcImF1dG9cIiA6IFwic21vb3RoXCI7XHJcbiAgICAgICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxUbyh7XHJcbiAgICAgICAgICAgICAgdG9wOiB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsSGVpZ2h0LFxyXG4gICAgICAgICAgICAgIGJlaGF2aW9yOiBiZWhhdmlvcixcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoZm9yY2VTY3JvbGwpIHtcclxuICAgICAgICAgICAgICB0aGlzLnVzZXJTY3JvbGxlZFVwID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsPy5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgICAgdGhpcy5zY3JvbGxUaW1lb3V0ID0gbnVsbDtcclxuICAgIH0sIGRlbGF5KTtcclxuICB9XHJcblxyXG4gIGZvcm1hdFRpbWUoZGF0ZTogRGF0ZSk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gZGF0ZS50b0xvY2FsZVRpbWVTdHJpbmcodW5kZWZpbmVkLCB7XHJcbiAgICAgIGhvdXI6IFwibnVtZXJpY1wiLFxyXG4gICAgICBtaW51dGU6IFwiMi1kaWdpdFwiLFxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGZvcm1hdERhdGVTZXBhcmF0b3IoZGF0ZTogRGF0ZSk6IHN0cmluZyB7XHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xyXG4gICAgY29uc3QgeWVzdGVyZGF5ID0gbmV3IERhdGUobm93KTtcclxuICAgIHllc3RlcmRheS5zZXREYXRlKG5vdy5nZXREYXRlKCkgLSAxKTtcclxuICAgIGlmICh0aGlzLmlzU2FtZURheShkYXRlLCBub3cpKSByZXR1cm4gXCJUb2RheVwiO1xyXG4gICAgZWxzZSBpZiAodGhpcy5pc1NhbWVEYXkoZGF0ZSwgeWVzdGVyZGF5KSkgcmV0dXJuIFwiWWVzdGVyZGF5XCI7XHJcbiAgICBlbHNlXHJcbiAgICAgIHJldHVybiBkYXRlLnRvTG9jYWxlRGF0ZVN0cmluZyh1bmRlZmluZWQsIHtcclxuICAgICAgICB3ZWVrZGF5OiBcImxvbmdcIixcclxuICAgICAgICB5ZWFyOiBcIm51bWVyaWNcIixcclxuICAgICAgICBtb250aDogXCJsb25nXCIsXHJcbiAgICAgICAgZGF5OiBcIm51bWVyaWNcIixcclxuICAgICAgfSk7XHJcbiAgfVxyXG4gIGZvcm1hdFJlbGF0aXZlRGF0ZShkYXRlOiBEYXRlKTogc3RyaW5nIHtcclxuICAgIGlmICghKGRhdGUgaW5zdGFuY2VvZiBEYXRlKSB8fCBpc05hTihkYXRlLmdldFRpbWUoKSkpIHtcclxuICAgICAgcmV0dXJuIFwiSW52YWxpZCBkYXRlXCI7XHJcbiAgICB9XHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xyXG4gICAgY29uc3QgZGlmZlNlY29uZHMgPSBNYXRoLnJvdW5kKChub3cuZ2V0VGltZSgpIC0gZGF0ZS5nZXRUaW1lKCkpIC8gMTAwMCk7XHJcbiAgICBjb25zdCBkaWZmRGF5cyA9IE1hdGguZmxvb3IoZGlmZlNlY29uZHMgLyAoNjAgKiA2MCAqIDI0KSk7XHJcbiAgICBpZiAoZGlmZkRheXMgPT09IDApIHtcclxuICAgICAgY29uc3QgZGlmZkhvdXJzID0gTWF0aC5mbG9vcihkaWZmU2Vjb25kcyAvICg2MCAqIDYwKSk7XHJcbiAgICAgIGlmIChkaWZmSG91cnMgPCAxKSByZXR1cm4gXCJKdXN0IG5vd1wiO1xyXG4gICAgICBpZiAoZGlmZkhvdXJzID09PSAxKSByZXR1cm4gXCIxIGhvdXIgYWdvXCI7XHJcbiAgICAgIGlmIChkaWZmSG91cnMgPCBub3cuZ2V0SG91cnMoKSkgcmV0dXJuIGAke2RpZmZIb3Vyc30gaG91cnMgYWdvYDtcclxuICAgICAgZWxzZSByZXR1cm4gXCJUb2RheVwiO1xyXG4gICAgfSBlbHNlIGlmIChkaWZmRGF5cyA9PT0gMSkge1xyXG4gICAgICByZXR1cm4gXCJZZXN0ZXJkYXlcIjtcclxuICAgIH0gZWxzZSBpZiAoZGlmZkRheXMgPCA3KSB7XHJcbiAgICAgIHJldHVybiBgJHtkaWZmRGF5c30gZGF5cyBhZ29gO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuIGRhdGUudG9Mb2NhbGVEYXRlU3RyaW5nKHVuZGVmaW5lZCwge1xyXG4gICAgICAgIG1vbnRoOiBcInNob3J0XCIsXHJcbiAgICAgICAgZGF5OiBcIm51bWVyaWNcIixcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIGlzU2FtZURheShkYXRlMTogRGF0ZSwgZGF0ZTI6IERhdGUpOiBib29sZWFuIHtcclxuICAgIHJldHVybiAoXHJcbiAgICAgIGRhdGUxLmdldEZ1bGxZZWFyKCkgPT09IGRhdGUyLmdldEZ1bGxZZWFyKCkgJiZcclxuICAgICAgZGF0ZTEuZ2V0TW9udGgoKSA9PT0gZGF0ZTIuZ2V0TW9udGgoKSAmJlxyXG4gICAgICBkYXRlMS5nZXREYXRlKCkgPT09IGRhdGUyLmdldERhdGUoKVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZm9ybWF0Q2hhdFRvTWFya2Rvd24obWVzc2FnZXNUb0Zvcm1hdDogTWVzc2FnZVtdKTogc3RyaW5nIHtcclxuICAgIGxldCBsb2NhbExhc3REYXRlOiBEYXRlIHwgbnVsbCA9IG51bGw7XHJcbiAgICBjb25zdCBleHBvcnRUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpO1xyXG4gICAgbGV0IG1hcmtkb3duID0gYCMgQUkgRm9yZ2UgQ2hhdCBFeHBvcnRcXG5gICsgYD4gRXhwb3J0ZWQgb246ICR7ZXhwb3J0VGltZXN0YW1wLnRvTG9jYWxlU3RyaW5nKHVuZGVmaW5lZCl9XFxuXFxuYDtcclxuXHJcbiAgICBtZXNzYWdlc1RvRm9ybWF0LmZvckVhY2gobWVzc2FnZSA9PiB7XHJcbiAgICAgIGlmICghbWVzc2FnZS5jb250ZW50Py50cmltKCkpIHJldHVybjtcclxuXHJcbiAgICAgIGlmIChsb2NhbExhc3REYXRlID09PSBudWxsIHx8ICF0aGlzLmlzU2FtZURheShsb2NhbExhc3REYXRlLCBtZXNzYWdlLnRpbWVzdGFtcCkpIHtcclxuICAgICAgICBpZiAobG9jYWxMYXN0RGF0ZSAhPT0gbnVsbCkgbWFya2Rvd24gKz0gYCoqKlxcbmA7XHJcbiAgICAgICAgbWFya2Rvd24gKz0gYCoqJHt0aGlzLmZvcm1hdERhdGVTZXBhcmF0b3IobWVzc2FnZS50aW1lc3RhbXApfSoqXFxuKioqXFxuXFxuYDtcclxuICAgICAgfVxyXG4gICAgICBsb2NhbExhc3REYXRlID0gbWVzc2FnZS50aW1lc3RhbXA7XHJcblxyXG4gICAgICBjb25zdCB0aW1lID0gdGhpcy5mb3JtYXRUaW1lKG1lc3NhZ2UudGltZXN0YW1wKTtcclxuICAgICAgbGV0IHByZWZpeCA9IFwiXCI7XHJcbiAgICAgIGxldCBjb250ZW50UHJlZml4ID0gXCJcIjtcclxuICAgICAgbGV0IGNvbnRlbnQgPSBtZXNzYWdlLmNvbnRlbnQudHJpbSgpO1xyXG5cclxuICAgICAgaWYgKG1lc3NhZ2Uucm9sZSA9PT0gXCJhc3Npc3RhbnRcIikge1xyXG4gICAgICAgIGNvbnRlbnQgPSBSZW5kZXJlclV0aWxzLmRlY29kZUh0bWxFbnRpdGllcyhjb250ZW50KVxyXG4gICAgICAgICAgLnJlcGxhY2UoLzx0aGluaz5bXFxzXFxTXSo/PFxcL3RoaW5rPi9nLCBcIlwiKVxyXG4gICAgICAgICAgLnRyaW0oKTtcclxuXHJcbiAgICAgICAgaWYgKCFjb250ZW50KSByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHN3aXRjaCAobWVzc2FnZS5yb2xlKSB7XHJcbiAgICAgICAgY2FzZSBcInVzZXJcIjpcclxuICAgICAgICAgIHByZWZpeCA9IGAqKlVzZXIgKCR7dGltZX0pOioqXFxuYDtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJhc3Npc3RhbnRcIjpcclxuICAgICAgICAgIHByZWZpeCA9IGAqKkFzc2lzdGFudCAoJHt0aW1lfSk6KipcXG5gO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInN5c3RlbVwiOlxyXG4gICAgICAgICAgcHJlZml4ID0gYD4gX1tTeXN0ZW0gKCR7dGltZX0pXV8gXFxuPiBgO1xyXG4gICAgICAgICAgY29udGVudFByZWZpeCA9IFwiPiBcIjtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJlcnJvclwiOlxyXG4gICAgICAgICAgcHJlZml4ID0gYD4gWyFFUlJPUl0gRXJyb3IgKCR7dGltZX0pOlxcbj4gYDtcclxuICAgICAgICAgIGNvbnRlbnRQcmVmaXggPSBcIj4gXCI7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgICBtYXJrZG93biArPSBwcmVmaXg7XHJcbiAgICAgIGlmIChjb250ZW50UHJlZml4KSB7XHJcbiAgICAgICAgbWFya2Rvd24gKz1cclxuICAgICAgICAgIGNvbnRlbnRcclxuICAgICAgICAgICAgLnNwbGl0KFwiXFxuXCIpXHJcbiAgICAgICAgICAgIC5tYXAobGluZSA9PiAobGluZS50cmltKCkgPyBgJHtjb250ZW50UHJlZml4fSR7bGluZX1gIDogY29udGVudFByZWZpeC50cmltKCkpKVxyXG4gICAgICAgICAgICAuam9pbihgXFxuYCkgKyBcIlxcblxcblwiO1xyXG4gICAgICB9IGVsc2UgaWYgKGNvbnRlbnQuaW5jbHVkZXMoXCJgYGBcIikpIHtcclxuICAgICAgICBjb250ZW50ID0gY29udGVudC5yZXBsYWNlKC8oXFxuKlxccyopYGBgL2csIFwiXFxuXFxuYGBgXCIpLnJlcGxhY2UoL2BgYChcXHMqXFxuKikvZywgXCJgYGBcXG5cXG5cIik7XHJcbiAgICAgICAgbWFya2Rvd24gKz0gY29udGVudC50cmltKCkgKyBcIlxcblxcblwiO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIG1hcmtkb3duICs9XHJcbiAgICAgICAgICBjb250ZW50XHJcbiAgICAgICAgICAgIC5zcGxpdChcIlxcblwiKVxyXG4gICAgICAgICAgICAubWFwKGxpbmUgPT4gKGxpbmUudHJpbSgpID8gbGluZSA6IFwiXCIpKVxyXG4gICAgICAgICAgICAuam9pbihcIlxcblwiKSArIFwiXFxuXFxuXCI7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIG1hcmtkb3duLnRyaW0oKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgZ2V0Q3VycmVudFJvbGVEaXNwbGF5TmFtZSgpOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCk7XHJcblxyXG4gICAgICBjb25zdCByb2xlUGF0aCA9IGFjdGl2ZUNoYXQ/Lm1ldGFkYXRhPy5zZWxlY3RlZFJvbGVQYXRoID8/IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XHJcblxyXG4gICAgICBpZiAocm9sZVBhdGgpIHtcclxuICAgICAgICBjb25zdCBhbGxSb2xlcyA9IGF3YWl0IHRoaXMucGx1Z2luLmxpc3RSb2xlRmlsZXModHJ1ZSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZvdW5kUm9sZSA9IGFsbFJvbGVzLmZpbmQocm9sZSA9PiByb2xlLnBhdGggPT09IHJvbGVQYXRoKTtcclxuXHJcbiAgICAgICAgaWYgKGZvdW5kUm9sZSkge1xyXG4gICAgICAgICAgcmV0dXJuIGZvdW5kUm9sZS5uYW1lO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBjb25zb2xlLndhcm4oYFJvbGUgd2l0aCBwYXRoIFwiJHtyb2xlUGF0aH1cIiBub3QgZm91bmQgaW4gbGlzdFJvbGVGaWxlcyByZXN1bHRzLmApO1xyXG5cclxuICAgICAgICAgIHJldHVybiByb2xlUGF0aC5zcGxpdChcIi9cIikucG9wKCk/LnJlcGxhY2UoXCIubWRcIiwgXCJcIikgfHwgXCJTZWxlY3RlZCBSb2xlXCI7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgZ2V0dGluZyBjdXJyZW50IHJvbGUgZGlzcGxheSBuYW1lOlwiLCBlcnJvcik7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIFwiTm9uZVwiO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVSb2xlRGlzcGxheUNsaWNrID0gYXN5bmMgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICBjb25zdCBtZW51ID0gbmV3IE1lbnUoKTtcclxuICAgIGxldCBpdGVtc0FkZGVkID0gZmFsc2U7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3Qgcm9sZXMgPSBhd2FpdCB0aGlzLnBsdWdpbi5saXN0Um9sZUZpbGVzKHRydWUpO1xyXG4gICAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgICAgY29uc3QgY3VycmVudFJvbGVQYXRoID0gYWN0aXZlQ2hhdD8ubWV0YWRhdGE/LnNlbGVjdGVkUm9sZVBhdGggPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aDtcclxuXHJcbiAgICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IHtcclxuICAgICAgICBpdGVtXHJcbiAgICAgICAgICAuc2V0VGl0bGUoXCJOb25lXCIpXHJcbiAgICAgICAgICAuc2V0SWNvbighY3VycmVudFJvbGVQYXRoID8gXCJjaGVja1wiIDogXCJzbGFzaFwiKVxyXG4gICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBuZXdSb2xlUGF0aCA9IFwiXCI7XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50Um9sZVBhdGggIT09IG5ld1JvbGVQYXRoKSB7XHJcbiAgICAgICAgICAgICAgaWYgKGFjdGl2ZUNoYXQpIHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnVwZGF0ZUFjdGl2ZUNoYXRNZXRhZGF0YSh7XHJcbiAgICAgICAgICAgICAgICAgIHNlbGVjdGVkUm9sZVBhdGg6IG5ld1JvbGVQYXRoLFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGggPSBuZXdSb2xlUGF0aDtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJyb2xlLWNoYW5nZWRcIiwgXCJOb25lXCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ucHJvbXB0U2VydmljZT8uY2xlYXJSb2xlQ2FjaGU/LigpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgaXRlbXNBZGRlZCA9IHRydWU7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgaWYgKHJvbGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBtZW51LmFkZFNlcGFyYXRvcigpO1xyXG4gICAgICAgIGl0ZW1zQWRkZWQgPSB0cnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByb2xlcy5mb3JFYWNoKHJvbGVJbmZvID0+IHtcclxuICAgICAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PiB7XHJcbiAgICAgICAgICBpdGVtXHJcbiAgICAgICAgICAgIC5zZXRUaXRsZShyb2xlSW5mby5uYW1lKVxyXG4gICAgICAgICAgICAuc2V0SWNvbihyb2xlSW5mby5wYXRoID09PSBjdXJyZW50Um9sZVBhdGggPyBcImNoZWNrXCIgOiByb2xlSW5mby5pc0N1c3RvbSA/IFwidXNlclwiIDogXCJmaWxlLXRleHRcIilcclxuICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgIGNvbnN0IG5ld1JvbGVQYXRoID0gcm9sZUluZm8ucGF0aDtcclxuICAgICAgICAgICAgICBpZiAoY3VycmVudFJvbGVQYXRoICE9PSBuZXdSb2xlUGF0aCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGFjdGl2ZUNoYXQpIHtcclxuICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIudXBkYXRlQWN0aXZlQ2hhdE1ldGFkYXRhKHtcclxuICAgICAgICAgICAgICAgICAgICBzZWxlY3RlZFJvbGVQYXRoOiBuZXdSb2xlUGF0aCxcclxuICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoID0gbmV3Um9sZVBhdGg7XHJcbiAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwicm9sZS1jaGFuZ2VkXCIsIHJvbGVJbmZvLm5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5wcm9tcHRTZXJ2aWNlPy5jbGVhclJvbGVDYWNoZT8uKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIGl0ZW1zQWRkZWQgPSB0cnVlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBsb2FkaW5nIHJvbGVzIGZvciByb2xlIHNlbGVjdGlvbiBtZW51OlwiLCBlcnJvcik7XHJcblxyXG4gICAgICBpZiAoIWl0ZW1zQWRkZWQpIHtcclxuICAgICAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PiBpdGVtLnNldFRpdGxlKFwiRXJyb3IgbG9hZGluZyByb2xlc1wiKS5zZXREaXNhYmxlZCh0cnVlKSk7XHJcbiAgICAgICAgaXRlbXNBZGRlZCA9IHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBsb2FkIHJvbGVzLlwiKTtcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIGlmIChpdGVtc0FkZGVkKSB7XHJcbiAgICAgICAgbWVudS5zaG93QXRNb3VzZUV2ZW50KGV2ZW50KTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlVGVtcGVyYXR1cmVDbGljayA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdCgpO1xyXG5cclxuICAgIGlmICghYWN0aXZlQ2hhdCkge1xyXG4gICAgICBuZXcgTm90aWNlKFwiU2VsZWN0IG9yIGNyZWF0ZSBhIGNoYXQgdG8gY2hhbmdlIHRlbXBlcmF0dXJlLlwiKTtcclxuXHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjdXJyZW50VGVtcCA9IGFjdGl2ZUNoYXQubWV0YWRhdGEudGVtcGVyYXR1cmUgPz8gdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGVyYXR1cmU7XHJcbiAgICBjb25zdCBjdXJyZW50VGVtcFN0cmluZyA9IGN1cnJlbnRUZW1wICE9PSBudWxsICYmIGN1cnJlbnRUZW1wICE9PSB1bmRlZmluZWQgPyBTdHJpbmcoY3VycmVudFRlbXApIDogXCJcIjtcclxuXHJcbiAgICBuZXcgUHJvbXB0TW9kYWwoXHJcbiAgICAgIHRoaXMuYXBwLFxyXG4gICAgICBcIlNldCBUZW1wZXJhdHVyZVwiLFxyXG4gICAgICBgRW50ZXIgbmV3IHRlbXBlcmF0dXJlIChlLmcuLCAwLjcpLiBIaWdoZXIgdmFsdWVzID0gbW9yZSBjcmVhdGl2ZSwgbG93ZXIgPSBtb3JlIGZvY3VzZWQuYCxcclxuICAgICAgY3VycmVudFRlbXBTdHJpbmcsXHJcbiAgICAgIGFzeW5jIG5ld1ZhbHVlID0+IHtcclxuICAgICAgICBpZiAobmV3VmFsdWUgPT09IG51bGwgfHwgbmV3VmFsdWUudHJpbSgpID09PSBcIlwiKSB7XHJcbiAgICAgICAgICBuZXcgTm90aWNlKFwiVGVtcGVyYXR1cmUgY2hhbmdlIGNhbmNlbGxlZC5cIik7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBuZXdUZW1wID0gcGFyc2VGbG9hdChuZXdWYWx1ZS50cmltKCkpO1xyXG5cclxuICAgICAgICBpZiAoaXNOYU4obmV3VGVtcCkgfHwgbmV3VGVtcCA8IDAgfHwgbmV3VGVtcCA+IDIuMCkge1xyXG4gICAgICAgICAgbmV3IE5vdGljZShcIkludmFsaWQgdGVtcGVyYXR1cmUuIFBsZWFzZSBlbnRlciBhIG51bWJlciBiZXR3ZWVuIDAuMCBhbmQgMi4wLlwiLCA0MDAwKTtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci51cGRhdGVBY3RpdmVDaGF0TWV0YWRhdGEoe1xyXG4gICAgICAgICAgICB0ZW1wZXJhdHVyZTogbmV3VGVtcCxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgdGhpcy51cGRhdGVUZW1wZXJhdHVyZUluZGljYXRvcihuZXdUZW1wKTtcclxuICAgICAgICAgIG5ldyBOb3RpY2UoYFRlbXBlcmF0dXJlIHNldCB0byAke25ld1RlbXB9IGZvciBjaGF0IFwiJHthY3RpdmVDaGF0Lm1ldGFkYXRhLm5hbWV9XCIuYCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkZhaWxlZCB0byB1cGRhdGUgY2hhdCB0ZW1wZXJhdHVyZTpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgbmV3IE5vdGljZShcIkVycm9yIHNldHRpbmcgdGVtcGVyYXR1cmUuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgKS5vcGVuKCk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSB1cGRhdGVUZW1wZXJhdHVyZUluZGljYXRvcih0ZW1wZXJhdHVyZTogbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLnRlbXBlcmF0dXJlSW5kaWNhdG9yRWwpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCB0ZW1wVmFsdWUgPSB0ZW1wZXJhdHVyZSA/PyB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZTtcclxuXHJcbiAgICBjb25zdCBlbW9qaSA9IHRoaXMuZ2V0VGVtcGVyYXR1cmVFbW9qaSh0ZW1wVmFsdWUpO1xyXG4gICAgdGhpcy50ZW1wZXJhdHVyZUluZGljYXRvckVsLnNldFRleHQoZW1vamkpO1xyXG4gICAgdGhpcy50ZW1wZXJhdHVyZUluZGljYXRvckVsLnRpdGxlID0gYFRlbXBlcmF0dXJlOiAke3RlbXBWYWx1ZS50b0ZpeGVkKDEpfS4gQ2xpY2sgdG8gY2hhbmdlLmA7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGdldFRlbXBlcmF0dXJlRW1vamkodGVtcGVyYXR1cmU6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICBpZiAodGVtcGVyYXR1cmUgPD0gMC40KSB7XHJcbiAgICAgIHJldHVybiBcIvCfp4pcIjtcclxuICAgIH0gZWxzZSBpZiAodGVtcGVyYXR1cmUgPiAwLjQgJiYgdGVtcGVyYXR1cmUgPD0gMC42KSB7XHJcbiAgICAgIHJldHVybiBcIvCfmYJcIjtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJldHVybiBcIvCfpKpcIjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgdXBkYXRlVG9nZ2xlVmlld0xvY2F0aW9uT3B0aW9uKCk6IHZvaWQge1xyXG4gICAgdGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyPy51cGRhdGVUb2dnbGVWaWV3TG9jYXRpb25PcHRpb24oKTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBoYW5kbGVUb2dnbGVWaWV3TG9jYXRpb25DbGljayA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8uY2xvc2VNZW51KCk7XHJcbiAgICBjb25zdCBjdXJyZW50U2V0dGluZyA9IHRoaXMucGx1Z2luLnNldHRpbmdzLm9wZW5DaGF0SW5UYWI7XHJcbiAgICBjb25zdCBuZXdTZXR0aW5nID0gIWN1cnJlbnRTZXR0aW5nO1xyXG5cclxuICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm9wZW5DaGF0SW5UYWIgPSBuZXdTZXR0aW5nO1xyXG4gICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblxyXG4gICAgdGhpcy5hcHAud29ya3NwYWNlLmRldGFjaExlYXZlc09mVHlwZShWSUVXX1RZUEVfT0xMQU1BX1BFUlNPTkFTKTtcclxuXHJcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgdGhpcy5wbHVnaW4uYWN0aXZhdGVWaWV3KCk7XHJcbiAgICB9LCA1MCk7XHJcbiAgfTtcclxuXHJcbiAgcHVibGljIGFzeW5jIGZpbmRSb2xlTmFtZUJ5UGF0aChyb2xlUGF0aDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICBpZiAoIXJvbGVQYXRoKSB7XHJcbiAgICAgIHJldHVybiBcIk5vbmVcIjtcclxuICAgIH1cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGFsbFJvbGVzID0gYXdhaXQgdGhpcy5wbHVnaW4ubGlzdFJvbGVGaWxlcyh0cnVlKTtcclxuICAgICAgY29uc3QgZm91bmRSb2xlID0gYWxsUm9sZXMuZmluZChyb2xlID0+IHJvbGUucGF0aCA9PT0gcm9sZVBhdGgpO1xyXG4gICAgICBpZiAoZm91bmRSb2xlKSB7XHJcbiAgICAgICAgcmV0dXJuIGZvdW5kUm9sZS5uYW1lO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnN0IGZpbGVOYW1lID0gcm9sZVBhdGguc3BsaXQoXCIvXCIpLnBvcCgpPy5yZXBsYWNlKFwiLm1kXCIsIFwiXCIpO1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKFxyXG4gICAgICAgICAgYFtmaW5kUm9sZU5hbWVCeVBhdGhdIFJvbGUgbm90IGZvdW5kIGZvciBwYXRoIFwiJHtyb2xlUGF0aH1cIi4gVXNpbmcgZGVyaXZlZCBuYW1lOiBcIiR7ZmlsZU5hbWUgfHwgXCJVbmtub3duXCJ9XCJgXHJcbiAgICAgICAgKTtcclxuICAgICAgICByZXR1cm4gZmlsZU5hbWUgfHwgXCJVbmtub3duIFJvbGVcIjtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKGBbZmluZFJvbGVOYW1lQnlQYXRoXSBFcnJvciBmZXRjaGluZyByb2xlcyBmb3IgcGF0aCBcIiR7cm9sZVBhdGh9XCI6YCwgZXJyb3IpO1xyXG4gICAgICByZXR1cm4gXCJFcnJvclwiO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSB1cGRhdGVDaGF0UGFuZWxMaXN0ID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy5jaGF0UGFuZWxMaXN0RWw7XHJcbiAgICBpZiAoIWNvbnRhaW5lciB8fCAhdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLmNoYXRQYW5lbEhlYWRlckVsPy5nZXRBdHRyaWJ1dGUoXCJkYXRhLWNvbGxhcHNlZFwiKSA9PT0gXCJ0cnVlXCIpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGN1cnJlbnRTY3JvbGxUb3AgPSBjb250YWluZXIuc2Nyb2xsVG9wO1xyXG4gICAgY29udGFpbmVyLmVtcHR5KCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgY2hhdHM6IENoYXRNZXRhZGF0YVtdID0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIubGlzdEF2YWlsYWJsZUNoYXRzKCkgfHwgW107XHJcbiAgICAgIGNvbnN0IGN1cnJlbnRBY3RpdmVJZCA9IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXRJZCgpO1xyXG5cclxuICAgICAgaWYgKGNoYXRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibWVudS1pbmZvLXRleHRcIiwgdGV4dDogXCJObyBzYXZlZCBjaGF0cyB5ZXQuXCIgfSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY2hhdHMuZm9yRWFjaChjaGF0TWV0YSA9PiB7XHJcbiAgICAgICAgICBjb25zdCBjaGF0T3B0aW9uRWwgPSBjb250YWluZXIuY3JlYXRlRGl2KHtcclxuICAgICAgICAgICAgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTSwgQ1NTX0NMQVNTX01FTlVfT1BUSU9OLCBDU1NfQ0xBU1NfQ0hBVF9MSVNUX0lURU1dLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBjb25zdCBpY29uU3BhbiA9IGNoYXRPcHRpb25FbC5jcmVhdGVTcGFuKHsgY2xzOiBbQ1NTX1JPTEVfUEFORUxfSVRFTV9JQ09OLCBcIm1lbnUtb3B0aW9uLWljb25cIl0gfSk7XHJcbiAgICAgICAgICBpZiAoY2hhdE1ldGEuaWQgPT09IGN1cnJlbnRBY3RpdmVJZCkge1xyXG4gICAgICAgICAgICBzZXRJY29uKGljb25TcGFuLCBcImNoZWNrXCIpO1xyXG4gICAgICAgICAgICBjaGF0T3B0aW9uRWwuYWRkQ2xhc3MoQ1NTX1JPTEVfUEFORUxfSVRFTV9BQ1RJVkUpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgc2V0SWNvbihpY29uU3BhbiwgXCJtZXNzYWdlLXNxdWFyZVwiKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBjb25zdCB0ZXh0V3JhcHBlciA9IGNoYXRPcHRpb25FbC5jcmVhdGVEaXYoeyBjbHM6IFwib2xsYW1hLWNoYXQtaXRlbS10ZXh0LXdyYXBwZXJcIiB9KTtcclxuICAgICAgICAgIHRleHRXcmFwcGVyLmNyZWF0ZURpdih7IGNsczogXCJjaGF0LXBhbmVsLWl0ZW0tbmFtZVwiLCB0ZXh0OiBjaGF0TWV0YS5uYW1lIH0pO1xyXG5cclxuICAgICAgICAgIGNvbnN0IGxhc3RNb2RpZmllZERhdGUgPSBuZXcgRGF0ZShjaGF0TWV0YS5sYXN0TW9kaWZpZWQpO1xyXG5cclxuICAgICAgICAgIGNvbnN0IGRhdGVUZXh0ID0gIWlzTmFOKGxhc3RNb2RpZmllZERhdGUuZ2V0VGltZSgpKVxyXG4gICAgICAgICAgICA/IHRoaXMuZm9ybWF0UmVsYXRpdmVEYXRlKGxhc3RNb2RpZmllZERhdGUpXHJcbiAgICAgICAgICAgIDogXCJJbnZhbGlkIGRhdGVcIjtcclxuICAgICAgICAgIGlmIChkYXRlVGV4dCA9PT0gXCJJbnZhbGlkIGRhdGVcIikge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihcclxuICAgICAgICAgICAgICBgW3VwZGF0ZUNoYXRQYW5lbExpc3RdIEludmFsaWQgZGF0ZSBwYXJzZWQgZm9yIGNoYXQgJHtjaGF0TWV0YS5pZH0sIGxhc3RNb2RpZmllZDogJHtjaGF0TWV0YS5sYXN0TW9kaWZpZWR9YFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgdGV4dFdyYXBwZXIuY3JlYXRlRGl2KHsgY2xzOiBcImNoYXQtcGFuZWwtaXRlbS1kYXRlXCIsIHRleHQ6IGRhdGVUZXh0IH0pO1xyXG5cclxuICAgICAgICAgIGNvbnN0IG9wdGlvbnNCdG4gPSBjaGF0T3B0aW9uRWwuY3JlYXRlRWwoXCJidXR0b25cIiwge1xyXG4gICAgICAgICAgICBjbHM6IFtDU1NfQ0hBVF9JVEVNX09QVElPTlMsIFwiY2xpY2thYmxlLWljb25cIl0sXHJcbiAgICAgICAgICAgIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiQ2hhdCBvcHRpb25zXCIsIHRpdGxlOiBcIk1vcmUgb3B0aW9uc1wiIH0sXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIHNldEljb24ob3B0aW9uc0J0biwgXCJsdWNpZGUtbW9yZS1ob3Jpem9udGFsXCIpO1xyXG5cclxuICAgICAgICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudChjaGF0T3B0aW9uRWwsIFwiY2xpY2tcIiwgYXN5bmMgZSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghKGUudGFyZ2V0IGluc3RhbmNlb2YgRWxlbWVudCAmJiBlLnRhcmdldC5jbG9zZXN0KGAuJHtDU1NfQ0hBVF9JVEVNX09QVElPTlN9YCkpKSB7XHJcbiAgICAgICAgICAgICAgaWYgKGNoYXRNZXRhLmlkICE9PSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcj8uZ2V0QWN0aXZlQ2hhdElkKCkpIHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnNldEFjdGl2ZUNoYXQoY2hhdE1ldGEuaWQpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQob3B0aW9uc0J0biwgXCJjbGlja1wiLCBlID0+IHtcclxuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgICAgICAgdGhpcy5zaG93Q2hhdENvbnRleHRNZW51KGUsIGNoYXRNZXRhKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KGNoYXRPcHRpb25FbCwgXCJjb250ZXh0bWVudVwiLCBlID0+IHtcclxuICAgICAgICAgICAgdGhpcy5zaG93Q2hhdENvbnRleHRNZW51KGUsIGNoYXRNZXRhKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbdXBkYXRlQ2hhdFBhbmVsTGlzdF0gRXJyb3IgcmVuZGVyaW5nIGNoYXQgcGFuZWwgbGlzdDpcIiwgZXJyb3IpO1xyXG4gICAgICBjb250YWluZXIuZW1wdHkoKTtcclxuICAgICAgY29udGFpbmVyLmNyZWF0ZURpdih7IHRleHQ6IFwiRXJyb3IgbG9hZGluZyBjaGF0cy5cIiwgY2xzOiBcIm1lbnUtZXJyb3ItdGV4dFwiIH0pO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcclxuICAgICAgICBpZiAoY29udGFpbmVyICYmIGNvbnRhaW5lci5pc0Nvbm5lY3RlZCkge1xyXG4gICAgICAgICAgY29udGFpbmVyLnNjcm9sbFRvcCA9IGN1cnJlbnRTY3JvbGxUb3A7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBwcml2YXRlIGFzeW5jIHRvZ2dsZVNpZGViYXJTZWN0aW9uKGNsaWNrZWRIZWFkZXJFbDogSFRNTEVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IHNlY3Rpb25UeXBlID0gY2xpY2tlZEhlYWRlckVsLmdldEF0dHJpYnV0ZShcImRhdGEtc2VjdGlvbi10eXBlXCIpIGFzIFwiY2hhdHNcIiB8IFwicm9sZXNcIjtcclxuICAgIGNvbnN0IGlzQ3VycmVudGx5Q29sbGFwc2VkID0gY2xpY2tlZEhlYWRlckVsLmdldEF0dHJpYnV0ZShcImRhdGEtY29sbGFwc2VkXCIpID09PSBcInRydWVcIjtcclxuICAgIGNvbnN0IGljb25FbCA9IGNsaWNrZWRIZWFkZXJFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihgLiR7Q1NTX1NJREVCQVJfU0VDVElPTl9JQ09OfWApO1xyXG5cclxuICAgIGxldCBjb250ZW50RWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICBsZXQgdXBkYXRlRnVuY3Rpb246ICgoKSA9PiBQcm9taXNlPHZvaWQ+KSB8IG51bGwgPSBudWxsO1xyXG4gICAgbGV0IG90aGVySGVhZGVyRWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICBsZXQgb3RoZXJDb250ZW50RWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICBsZXQgb3RoZXJTZWN0aW9uVHlwZTogXCJjaGF0c1wiIHwgXCJyb2xlc1wiIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgY29uc3QgY29sbGFwc2VJY29uID0gXCJsdWNpZGUtZm9sZGVyXCI7XHJcbiAgICBjb25zdCBleHBhbmRJY29uID0gXCJsdWNpZGUtZm9sZGVyLW9wZW5cIjtcclxuICAgIGNvbnN0IGV4cGFuZGVkQ2xhc3MgPSBcImlzLWV4cGFuZGVkXCI7XHJcblxyXG4gICAgaWYgKHNlY3Rpb25UeXBlID09PSBcImNoYXRzXCIpIHtcclxuICAgICAgY29udGVudEVsID0gdGhpcy5jaGF0UGFuZWxMaXN0RWw7XHJcbiAgICAgIHVwZGF0ZUZ1bmN0aW9uID0gdGhpcy51cGRhdGVDaGF0UGFuZWxMaXN0O1xyXG4gICAgICBvdGhlckhlYWRlckVsID0gdGhpcy5yb2xlUGFuZWxIZWFkZXJFbDtcclxuICAgICAgb3RoZXJDb250ZW50RWwgPSB0aGlzLnJvbGVQYW5lbExpc3RFbDtcclxuICAgICAgb3RoZXJTZWN0aW9uVHlwZSA9IFwicm9sZXNcIjtcclxuICAgIH0gZWxzZSBpZiAoc2VjdGlvblR5cGUgPT09IFwicm9sZXNcIikge1xyXG4gICAgICBjb250ZW50RWwgPSB0aGlzLnJvbGVQYW5lbExpc3RFbDtcclxuICAgICAgdXBkYXRlRnVuY3Rpb24gPSB0aGlzLnVwZGF0ZVJvbGVQYW5lbExpc3Q7XHJcbiAgICAgIG90aGVySGVhZGVyRWwgPSB0aGlzLmNoYXRQYW5lbEhlYWRlckVsO1xyXG4gICAgICBvdGhlckNvbnRlbnRFbCA9IHRoaXMuY2hhdFBhbmVsTGlzdEVsO1xyXG4gICAgICBvdGhlclNlY3Rpb25UeXBlID0gXCJjaGF0c1wiO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghY29udGVudEVsIHx8ICFpY29uRWwgfHwgIXVwZGF0ZUZ1bmN0aW9uIHx8ICFvdGhlckhlYWRlckVsIHx8ICFvdGhlckNvbnRlbnRFbCB8fCAhb3RoZXJTZWN0aW9uVHlwZSkge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJDb3VsZCBub3QgZmluZCBhbGwgcmVxdWlyZWQgZWxlbWVudHMgZm9yIHNpZGViYXIgYWNjb3JkaW9uIHRvZ2dsZTpcIiwgc2VjdGlvblR5cGUpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGlzQ3VycmVudGx5Q29sbGFwc2VkKSB7XHJcbiAgICAgIGlmIChvdGhlckhlYWRlckVsLmdldEF0dHJpYnV0ZShcImRhdGEtY29sbGFwc2VkXCIpID09PSBcImZhbHNlXCIpIHtcclxuICAgICAgICBjb25zdCBvdGhlckljb25FbCA9IG90aGVySGVhZGVyRWwucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oYC4ke0NTU19TSURFQkFSX1NFQ1RJT05fSUNPTn1gKTtcclxuICAgICAgICBvdGhlckhlYWRlckVsLnNldEF0dHJpYnV0ZShcImRhdGEtY29sbGFwc2VkXCIsIFwidHJ1ZVwiKTtcclxuICAgICAgICBpZiAob3RoZXJJY29uRWwpIHNldEljb24ob3RoZXJJY29uRWwsIGNvbGxhcHNlSWNvbik7XHJcbiAgICAgICAgb3RoZXJDb250ZW50RWwuY2xhc3NMaXN0LnJlbW92ZShleHBhbmRlZENsYXNzKTtcclxuXHJcbiAgICAgICAgaWYgKG90aGVyU2VjdGlvblR5cGUgPT09IFwiY2hhdHNcIiAmJiB0aGlzLm5ld0NoYXRTaWRlYmFyQnV0dG9uKSB0aGlzLm5ld0NoYXRTaWRlYmFyQnV0dG9uLmhpZGUoKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY2xpY2tlZEhlYWRlckVsLnNldEF0dHJpYnV0ZShcImRhdGEtY29sbGFwc2VkXCIsIFwiZmFsc2VcIik7XHJcbiAgICAgIHNldEljb24oaWNvbkVsLCBleHBhbmRJY29uKTtcclxuICAgICAgaWYgKHNlY3Rpb25UeXBlID09PSBcImNoYXRzXCIgJiYgdGhpcy5uZXdDaGF0U2lkZWJhckJ1dHRvbikgdGhpcy5uZXdDaGF0U2lkZWJhckJ1dHRvbi5zaG93KCk7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgYXdhaXQgdXBkYXRlRnVuY3Rpb24oKTtcclxuXHJcbiAgICAgICAgY29udGVudEVsLmNsYXNzTGlzdC5hZGQoZXhwYW5kZWRDbGFzcyk7XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKGBFcnJvciB1cGRhdGluZyBzaWRlYmFyIHNlY3Rpb24gJHtzZWN0aW9uVHlwZX06YCwgZXJyb3IpO1xyXG4gICAgICAgIGNvbnRlbnRFbC5zZXRUZXh0KGBFcnJvciBsb2FkaW5nICR7c2VjdGlvblR5cGV9LmApO1xyXG4gICAgICAgIGNvbnRlbnRFbC5jbGFzc0xpc3QuYWRkKGV4cGFuZGVkQ2xhc3MpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjbGlja2VkSGVhZGVyRWwuc2V0QXR0cmlidXRlKFwiZGF0YS1jb2xsYXBzZWRcIiwgXCJ0cnVlXCIpO1xyXG4gICAgICBzZXRJY29uKGljb25FbCwgY29sbGFwc2VJY29uKTtcclxuXHJcbiAgICAgIGNvbnRlbnRFbC5jbGFzc0xpc3QucmVtb3ZlKGV4cGFuZGVkQ2xhc3MpO1xyXG5cclxuICAgICAgaWYgKHNlY3Rpb25UeXBlID09PSBcImNoYXRzXCIgJiYgdGhpcy5uZXdDaGF0U2lkZWJhckJ1dHRvbikge1xyXG4gICAgICAgIHRoaXMubmV3Q2hhdFNpZGViYXJCdXR0b24uaGlkZSgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHNob3dDaGF0Q29udGV4dE1lbnUoZXZlbnQ6IE1vdXNlRXZlbnQsIGNoYXRNZXRhOiBDaGF0TWV0YWRhdGEpOiB2b2lkIHtcclxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICBjb25zdCBtZW51ID0gbmV3IE1lbnUoKTtcclxuXHJcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxyXG4gICAgICBpdGVtXHJcbiAgICAgICAgLnNldFRpdGxlKFwiQ2xvbmUgQ2hhdFwiKVxyXG4gICAgICAgIC5zZXRJY29uKFwibHVjaWRlLWNvcHktcGx1c1wiKVxyXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuaGFuZGxlQ29udGV4dE1lbnVDbG9uZShjaGF0TWV0YS5pZCkpXHJcbiAgICApO1xyXG5cclxuICAgIG1lbnUuYWRkSXRlbShpdGVtID0+XHJcbiAgICAgIGl0ZW1cclxuICAgICAgICAuc2V0VGl0bGUoXCJSZW5hbWUgQ2hhdFwiKVxyXG4gICAgICAgIC5zZXRJY29uKFwibHVjaWRlLXBlbmNpbFwiKVxyXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuaGFuZGxlQ29udGV4dE1lbnVSZW5hbWUoY2hhdE1ldGEuaWQsIGNoYXRNZXRhLm5hbWUpKVxyXG4gICAgKTtcclxuXHJcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PlxyXG4gICAgICBpdGVtXHJcbiAgICAgICAgLnNldFRpdGxlKFwiRXhwb3J0IHRvIE5vdGVcIilcclxuICAgICAgICAuc2V0SWNvbihcImx1Y2lkZS1kb3dubG9hZFwiKVxyXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuZXhwb3J0U3BlY2lmaWNDaGF0KGNoYXRNZXRhLmlkKSlcclxuICAgICk7XHJcblxyXG4gICAgbWVudS5hZGRTZXBhcmF0b3IoKTtcclxuXHJcbiAgICBtZW51LmFkZEl0ZW0oaXRlbSA9PiB7XHJcbiAgICAgIGl0ZW1cclxuICAgICAgICAuc2V0VGl0bGUoXCJDbGVhciBNZXNzYWdlc1wiKVxyXG4gICAgICAgIC5zZXRJY29uKFwibHVjaWRlLXRyYXNoXCIpXHJcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5oYW5kbGVDb250ZXh0TWVudUNsZWFyKGNoYXRNZXRhLmlkLCBjaGF0TWV0YS5uYW1lKSk7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgKGl0ZW0gYXMgYW55KS5lbC5hZGRDbGFzcyhcImRhbmdlci1vcHRpb25cIik7XHJcbiAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJGYWlsZWQgdG8gYWRkIGRhbmdlciBjbGFzcyB1c2luZyBpdGVtLmVsL2RvbTpcIiwgZSwgaXRlbSk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIG1lbnUuYWRkSXRlbShpdGVtID0+IHtcclxuICAgICAgaXRlbVxyXG4gICAgICAgIC5zZXRUaXRsZShcIkRlbGV0ZSBDaGF0XCIpXHJcbiAgICAgICAgLnNldEljb24oXCJsdWNpZGUtdHJhc2gtMlwiKVxyXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuaGFuZGxlQ29udGV4dE1lbnVEZWxldGUoY2hhdE1ldGEuaWQsIGNoYXRNZXRhLm5hbWUpKTtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICAoaXRlbSBhcyBhbnkpLmVsLmFkZENsYXNzKFwiZGFuZ2VyLW9wdGlvblwiKTtcclxuICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkZhaWxlZCB0byBhZGQgZGFuZ2VyIGNsYXNzIHVzaW5nIGl0ZW0uZWwvZG9tOlwiLCBlLCBpdGVtKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgbWVudS5zaG93QXRNb3VzZUV2ZW50KGV2ZW50KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlQ29udGV4dE1lbnVDbG9uZShjaGF0SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgY2xvbmluZ05vdGljZSA9IG5ldyBOb3RpY2UoXCJDbG9uaW5nIGNoYXQuLi5cIiwgMCk7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjbG9uZWRDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2xvbmVDaGF0KGNoYXRJZCk7XHJcbiAgICAgIGlmIChjbG9uZWRDaGF0KSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShgQ2hhdCBjbG9uZWQgYXMgXCIke2Nsb25lZENoYXQubWV0YWRhdGEubmFtZX1cIiBhbmQgYWN0aXZhdGVkLmApO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYENvbnRleHQgbWVudTogRXJyb3IgY2xvbmluZyBjaGF0ICR7Y2hhdElkfTpgLCBlcnJvcik7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBjbG9uaW5nIGNoYXQuXCIpO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgY2xvbmluZ05vdGljZS5oaWRlKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIGV4cG9ydFNwZWNpZmljQ2hhdChjaGF0SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgZXhwb3J0aW5nTm90aWNlID0gbmV3IE5vdGljZShgRXhwb3J0aW5nIGNoYXQuLi5gLCAwKTtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRDaGF0KGNoYXRJZCk7XHJcbiAgICAgIGlmICghY2hhdCB8fCBjaGF0Lm1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJDaGF0IGlzIGVtcHR5IG9yIG5vdCBmb3VuZCwgbm90aGluZyB0byBleHBvcnQuXCIpO1xyXG4gICAgICAgIGV4cG9ydGluZ05vdGljZS5oaWRlKCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBtYXJrZG93bkNvbnRlbnQgPSB0aGlzLmZvcm1hdENoYXRUb01hcmtkb3duKGNoYXQubWVzc2FnZXMpO1xyXG4gICAgICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkucmVwbGFjZSgvWzouXS9nLCBcIi1cIik7XHJcbiAgICAgIGNvbnN0IHNhZmVOYW1lID0gY2hhdC5tZXRhZGF0YS5uYW1lLnJlcGxhY2UoL1tcXFxcLz86KlwiPD58XS9nLCBcIi1cIik7XHJcbiAgICAgIGNvbnN0IGZpbGVuYW1lID0gYG9sbGFtYS1jaGF0LSR7c2FmZU5hbWV9LSR7dGltZXN0YW1wfS5tZGA7XHJcblxyXG4gICAgICBsZXQgdGFyZ2V0Rm9sZGVyUGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmNoYXRFeHBvcnRGb2xkZXJQYXRoPy50cmltKCk7XHJcbiAgICAgIGxldCB0YXJnZXRGb2xkZXI6IFRGb2xkZXIgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAgIGlmICh0YXJnZXRGb2xkZXJQYXRoKSB7XHJcbiAgICAgICAgdGFyZ2V0Rm9sZGVyUGF0aCA9IG5vcm1hbGl6ZVBhdGgodGFyZ2V0Rm9sZGVyUGF0aCk7XHJcbiAgICAgICAgY29uc3QgYWJzdHJhY3RGaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHRhcmdldEZvbGRlclBhdGgpO1xyXG4gICAgICAgIGlmICghYWJzdHJhY3RGaWxlKSB7XHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIodGFyZ2V0Rm9sZGVyUGF0aCk7XHJcbiAgICAgICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh0YXJnZXRGb2xkZXJQYXRoKSBhcyBURm9sZGVyO1xyXG4gICAgICAgICAgICBpZiAodGFyZ2V0Rm9sZGVyKSBuZXcgTm90aWNlKGBDcmVhdGVkIGV4cG9ydCBmb2xkZXI6ICR7dGFyZ2V0Rm9sZGVyUGF0aH1gKTtcclxuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciBjcmVhdGluZyBleHBvcnQgZm9sZGVyOlwiLCBlcnIpO1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvciBjcmVhdGluZyBleHBvcnQgZm9sZGVyLiBTYXZpbmcgdG8gdmF1bHQgcm9vdC5gKTtcclxuICAgICAgICAgICAgdGFyZ2V0Rm9sZGVyID0gdGhpcy5hcHAudmF1bHQuZ2V0Um9vdCgpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAoYWJzdHJhY3RGaWxlIGluc3RhbmNlb2YgVEZvbGRlcikge1xyXG4gICAgICAgICAgdGFyZ2V0Rm9sZGVyID0gYWJzdHJhY3RGaWxlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvcjogRXhwb3J0IHBhdGggaXMgbm90IGEgZm9sZGVyLiBTYXZpbmcgdG8gdmF1bHQgcm9vdC5gKTtcclxuICAgICAgICAgIHRhcmdldEZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldFJvb3QoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGFyZ2V0Rm9sZGVyID0gdGhpcy5hcHAudmF1bHQuZ2V0Um9vdCgpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoIXRhcmdldEZvbGRlcikge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBkZXRlcm1pbmluZyBleHBvcnQgZm9sZGVyLlwiKTtcclxuICAgICAgICBleHBvcnRpbmdOb3RpY2UuaGlkZSgpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZmlsZVBhdGggPSBub3JtYWxpemVQYXRoKGAke3RhcmdldEZvbGRlci5wYXRofS8ke2ZpbGVuYW1lfWApO1xyXG4gICAgICBjb25zdCBleGlzdGluZ0ZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xyXG4gICAgICBpZiAoZXhpc3RpbmdGaWxlKSB7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGZpbGUgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUoZmlsZVBhdGgsIG1hcmtkb3duQ29udGVudCk7XHJcbiAgICAgIG5ldyBOb3RpY2UoYENoYXQgZXhwb3J0ZWQgdG8gJHtmaWxlLnBhdGh9YCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYENvbnRleHQgbWVudTogRXJyb3IgZXhwb3J0aW5nIGNoYXQgJHtjaGF0SWR9OmAsIGVycm9yKTtcclxuICAgICAgbmV3IE5vdGljZShcIkFuIGVycm9yIG9jY3VycmVkIGR1cmluZyBjaGF0IGV4cG9ydC5cIik7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBleHBvcnRpbmdOb3RpY2UuaGlkZSgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVDb250ZXh0TWVudUNsZWFyKGNoYXRJZDogc3RyaW5nLCBjaGF0TmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBuZXcgQ29uZmlybU1vZGFsKFxyXG4gICAgICB0aGlzLmFwcCxcclxuICAgICAgXCJDb25maXJtIENsZWFyIE1lc3NhZ2VzXCIsXHJcbiAgICAgIGBBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gY2xlYXIgYWxsIG1lc3NhZ2VzIGluIGNoYXQgXCIke2NoYXROYW1lfVwiP1xcblRoaXMgYWN0aW9uIGNhbm5vdCBiZSB1bmRvbmUuYCxcclxuICAgICAgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGNsZWFyaW5nTm90aWNlID0gbmV3IE5vdGljZShcIkNsZWFyaW5nIG1lc3NhZ2VzLi4uXCIsIDApO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuY2xlYXJDaGF0TWVzc2FnZXNCeUlkKGNoYXRJZCk7XHJcblxyXG4gICAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShgTWVzc2FnZXMgY2xlYXJlZCBmb3IgY2hhdCBcIiR7Y2hhdE5hbWV9XCIuYCk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKGBGYWlsZWQgdG8gY2xlYXIgbWVzc2FnZXMgZm9yIGNoYXQgXCIke2NoYXROYW1lfVwiLmApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYENvbnRleHQgbWVudTogRXJyb3IgY2xlYXJpbmcgbWVzc2FnZXMgZm9yIGNoYXQgJHtjaGF0SWR9OmAsIGVycm9yKTtcclxuICAgICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBjbGVhcmluZyBtZXNzYWdlcy5cIik7XHJcbiAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgIGNsZWFyaW5nTm90aWNlLmhpZGUoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICkub3BlbigpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVDb250ZXh0TWVudURlbGV0ZShjaGF0SWQ6IHN0cmluZywgY2hhdE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgbmV3IENvbmZpcm1Nb2RhbChcclxuICAgICAgdGhpcy5hcHAsXHJcbiAgICAgIFwiQ29uZmlybSBEZWxldGUgQ2hhdFwiLFxyXG4gICAgICBgQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSBjaGF0IFwiJHtjaGF0TmFtZX1cIj9cXG5UaGlzIGFjdGlvbiBjYW5ub3QgYmUgdW5kb25lLmAsXHJcbiAgICAgIGFzeW5jICgpID0+IHtcclxuICAgICAgICBjb25zdCBkZWxldGluZ05vdGljZSA9IG5ldyBOb3RpY2UoXCJEZWxldGluZyBjaGF0Li4uXCIsIDApO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZGVsZXRlQ2hhdChjaGF0SWQpO1xyXG4gICAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShgQ2hhdCBcIiR7Y2hhdE5hbWV9XCIgZGVsZXRlZC5gKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihgQ29udGV4dCBtZW51OiBFcnJvciBkZWxldGluZyBjaGF0ICR7Y2hhdElkfTpgLCBlcnJvcik7XHJcbiAgICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3IgZGVsZXRpbmcgY2hhdC5cIik7XHJcbiAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgIGRlbGV0aW5nTm90aWNlLmhpZGUoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICkub3BlbigpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBpc0NoYXRTY3JvbGxlZFVwKCk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKCF0aGlzLmNoYXRDb250YWluZXIpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBjb25zdCBzY3JvbGxhYmxlRGlzdGFuY2UgPSB0aGlzLmNoYXRDb250YWluZXIuc2Nyb2xsSGVpZ2h0IC0gdGhpcy5jaGF0Q29udGFpbmVyLmNsaWVudEhlaWdodDtcclxuICAgIGlmIChzY3JvbGxhYmxlRGlzdGFuY2UgPD0gMCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgIGNvbnN0IGRpc3RhbmNlRnJvbUJvdHRvbSA9IHNjcm9sbGFibGVEaXN0YW5jZSAtIHRoaXMuY2hhdENvbnRhaW5lci5zY3JvbGxUb3A7XHJcbiAgICByZXR1cm4gZGlzdGFuY2VGcm9tQm90dG9tID49IFNDUk9MTF9USFJFU0hPTEQ7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHVwZGF0ZVNjcm9sbFN0YXRlQW5kSW5kaWNhdG9ycygpOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy5jaGF0Q29udGFpbmVyKSByZXR1cm47XHJcblxyXG4gICAgY29uc3Qgd2FzU2Nyb2xsZWRVcCA9IHRoaXMudXNlclNjcm9sbGVkVXA7XHJcbiAgICB0aGlzLnVzZXJTY3JvbGxlZFVwID0gdGhpcy5pc0NoYXRTY3JvbGxlZFVwKCk7XHJcblxyXG4gICAgdGhpcy5zY3JvbGxUb0JvdHRvbUJ1dHRvbj8uY2xhc3NMaXN0LnRvZ2dsZShDU1NfQ0xBU1NfVklTSUJMRSwgdGhpcy51c2VyU2Nyb2xsZWRVcCk7XHJcblxyXG4gICAgaWYgKHdhc1Njcm9sbGVkVXAgJiYgIXRoaXMudXNlclNjcm9sbGVkVXApIHtcclxuICAgICAgdGhpcy5uZXdNZXNzYWdlc0luZGljYXRvckVsPy5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19WSVNJQkxFKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIE9sbGFtYVZpZXcudHNcclxuXHJcbiAgcHVibGljIGNoZWNrTWVzc2FnZUZvckNvbGxhcHNpbmcobWVzc2FnZUVsT3JHcm91cEVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgY29uc3QgbWVzc2FnZUdyb3VwRWwgPSBtZXNzYWdlRWxPckdyb3VwRWwuY2xhc3NMaXN0LmNvbnRhaW5zKENTU19DTEFTU0VTLk1FU1NBR0VfR1JPVVApXHJcbiAgICAgID8gbWVzc2FnZUVsT3JHcm91cEVsXHJcbiAgICAgIDogbWVzc2FnZUVsT3JHcm91cEVsLmNsb3Nlc3Q8SFRNTEVsZW1lbnQ+KGAuJHtDU1NfQ0xBU1NFUy5NRVNTQUdFX0dST1VQfWApO1xyXG5cclxuICAgIGlmICghbWVzc2FnZUdyb3VwRWwpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNvbnRlbnRDb2xsYXBzaWJsZSA9IG1lc3NhZ2VHcm91cEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KGAuJHtDU1NfQ0xBU1NFUy5DT05URU5UX0NPTExBUFNJQkxFfWApO1xyXG5cclxuICAgIC8vINCX0L3QsNGF0L7QtNC40LzQviDRgdCw0Lwg0LXQu9C10LzQtdC90YIgLm1lc3NhZ2Ug0LLRgdC10YDQtdC00LjQvdGWINCz0YDRg9C/0LhcclxuICAgIGNvbnN0IG1lc3NhZ2VFbCA9IG1lc3NhZ2VHcm91cEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KGAuJHtDU1NfQ0xBU1NFUy5NRVNTQUdFfWApO1xyXG5cclxuICAgIGlmICghY29udGVudENvbGxhcHNpYmxlIHx8ICFtZXNzYWdlRWwpIHtcclxuICAgICAgLy8g0J/QtdGA0LXQstGW0YDRj9GU0LzQviDQvdCw0Y/QstC90ZbRgdGC0Ywg0ZYgbWVzc2FnZUVsXHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBtYXhIID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MubWF4TWVzc2FnZUhlaWdodDtcclxuXHJcbiAgICBjb25zdCBpc1N0cmVhbWluZ05vdyA9XHJcbiAgICAgIHRoaXMuaXNQcm9jZXNzaW5nICYmXHJcbiAgICAgIG1lc3NhZ2VHcm91cEVsLmNsYXNzTGlzdC5jb250YWlucyhcInBsYWNlaG9sZGVyXCIpICYmXHJcbiAgICAgIG1lc3NhZ2VHcm91cEVsLmhhc0F0dHJpYnV0ZShcImRhdGEtcGxhY2Vob2xkZXItdGltZXN0YW1wXCIpICYmXHJcbiAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5jbGFzc0xpc3QuY29udGFpbnMoXCJzdHJlYW1pbmctdGV4dFwiKTtcclxuXHJcbiAgICBpZiAoaXNTdHJlYW1pbmdOb3cpIHtcclxuICAgICAgLy8g0JLQuNC00LDQu9GP0ZTQvNC+INC60L3QvtC/0LrRgywg0Y/QutGJ0L4g0LLQvtC90LAg0YDQsNC/0YLQvtC8INGUICjRiNGD0LrQsNGU0LzQviDQstGB0LXRgNC10LTQuNC90ZYgbWVzc2FnZUVsKVxyXG4gICAgICBjb25zdCBleGlzdGluZ0J1dHRvbiA9IG1lc3NhZ2VFbC5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PihgLiR7Q1NTX0NMQVNTRVMuU0hPV19NT1JFX0JVVFRPTn1gKTtcclxuICAgICAgZXhpc3RpbmdCdXR0b24/LnJlbW92ZSgpO1xyXG4gICAgICBjb250ZW50Q29sbGFwc2libGUuc3R5bGUubWF4SGVpZ2h0ID0gXCJcIjtcclxuICAgICAgY29udGVudENvbGxhcHNpYmxlLmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX0NPTlRFTlRfQ09MTEFQU0VEKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChtYXhIIDw9IDApIHtcclxuICAgICAgY29uc3QgZXhpc3RpbmdCdXR0b24gPSBtZXNzYWdlRWwucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oYC4ke0NTU19DTEFTU0VTLlNIT1dfTU9SRV9CVVRUT059YCk7XHJcbiAgICAgIGV4aXN0aW5nQnV0dG9uPy5yZW1vdmUoKTtcclxuICAgICAgY29udGVudENvbGxhcHNpYmxlLnN0eWxlLm1heEhlaWdodCA9IFwiXCI7XHJcbiAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU19DT05URU5UX0NPTExBUFNFRCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICBpZiAoXHJcbiAgICAgICAgIWNvbnRlbnRDb2xsYXBzaWJsZSB8fFxyXG4gICAgICAgICFjb250ZW50Q29sbGFwc2libGUuaXNDb25uZWN0ZWQgfHxcclxuICAgICAgICAhbWVzc2FnZUdyb3VwRWwuaXNDb25uZWN0ZWQgfHxcclxuICAgICAgICAhbWVzc2FnZUVsLmlzQ29ubmVjdGVkXHJcbiAgICAgIClcclxuICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAvLyDQqNGD0LrQsNGU0LzQviDQutC90L7Qv9C60YMg0LLRgdC10YDQtdC00LjQvdGWIG1lc3NhZ2VFbFxyXG4gICAgICBsZXQgZXhpc3RpbmdCdXR0b24gPSBtZXNzYWdlRWwucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oYC4ke0NTU19DTEFTU0VTLlNIT1dfTU9SRV9CVVRUT059YCk7XHJcblxyXG4gICAgICBjb25zdCBwcmV2aW91c01heEhlaWdodFN0eWxlID0gY29udGVudENvbGxhcHNpYmxlLnN0eWxlLm1heEhlaWdodDtcclxuICAgICAgY29udGVudENvbGxhcHNpYmxlLnN0eWxlLm1heEhlaWdodCA9IFwiXCI7XHJcbiAgICAgIGNvbnN0IHNjcm9sbEhlaWdodCA9IGNvbnRlbnRDb2xsYXBzaWJsZS5zY3JvbGxIZWlnaHQ7XHJcblxyXG4gICAgICBpZiAoZXhpc3RpbmdCdXR0b24gJiYgcHJldmlvdXNNYXhIZWlnaHRTdHlsZSAmJiAhZXhpc3RpbmdCdXR0b24uY2xhc3NMaXN0LmNvbnRhaW5zKFwiZXhwbGljaXRseS1leHBhbmRlZFwiKSkge1xyXG4gICAgICAgIC8vINCU0L7QtNCw0LzQviDQutC70LDRgSwg0YnQvtCxINC60LXRgNGD0LLQsNGC0Lgg0YbQuNC8XHJcbiAgICAgICAgY29udGVudENvbGxhcHNpYmxlLnN0eWxlLm1heEhlaWdodCA9IHByZXZpb3VzTWF4SGVpZ2h0U3R5bGU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChzY3JvbGxIZWlnaHQgPiBtYXhIKSB7XHJcbiAgICAgICAgaWYgKCFleGlzdGluZ0J1dHRvbikge1xyXG4gICAgICAgICAgLy8g0JTQvtC00LDRlNC80L4g0LrQvdC+0L/QutGDINGP0Log0L3QsNGJ0LDQtNC60LAgLm1lc3NhZ2UsINCf0IbQodCb0K8gY29udGVudENvbGxhcHNpYmxlXHJcbiAgICAgICAgICBleGlzdGluZ0J1dHRvbiA9IG1lc3NhZ2VFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7XHJcbiAgICAgICAgICAgIGNsczogQ1NTX0NMQVNTRVMuU0hPV19NT1JFX0JVVFRPTixcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgLy8g0J/QtdGA0LXQutC+0L3Rg9GU0LzQvtGB0Y8sINGJ0L4g0LrQvdC+0L/QutCwINC/0ZbRgdC70Y8g0LrQvtC90YLQtdC90YLRgywg0LDQu9C1INC/0LXRgNC10LQg0LzQvtC20LvQuNCy0LjQvCB0aW1lc3RhbXBcclxuICAgICAgICAgIC8vINCv0LrRidC+IHRpbWVzdGFtcCDQtNC+0LTQsNGU0YLRjNGB0Y8g0LIg0LrRltC90LXRhtGMIG1lc3NhZ2VFbCwg0YbQtSDQvNCw0ZQg0L/RgNCw0YbRjtCy0LDRgtC4LlxyXG4gICAgICAgICAgLy8g0JIg0ZbQvdGI0L7QvNGDINCy0LjQv9Cw0LTQutGDLCDQvNC+0LbQvdCwINCy0LjQutC+0YDQuNGB0YLQvtCy0YPQstCw0YLQuCBpbnNlcnRBZGphY2VudEVsZW1lbnQ6XHJcbiAgICAgICAgICAvLyBjb250ZW50Q29sbGFwc2libGUuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdhZnRlcmVuZCcsIGV4aXN0aW5nQnV0dG9uKTtcclxuXHJcbiAgICAgICAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZXhpc3RpbmdCdXR0b24sIFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICAgICAgICAvLyDQlNC+0LTQsNC80L4v0LLQuNC00LDQu9C40LzQviDQutC70LDRgSDQtNC70Y8g0LLRltC00YHRgtC10LbQtdC90L3RjyDRj9Cy0L3QvtCz0L4g0YDQvtC30LPQvtGA0YLQsNC90L3RjyDQutC+0YDQuNGB0YLRg9Cy0LDRh9C10LxcclxuICAgICAgICAgICAgaWYgKGNvbnRlbnRDb2xsYXBzaWJsZS5jbGFzc0xpc3QuY29udGFpbnMoQ1NTX0NMQVNTRVMuQ09OVEVOVF9DT0xMQVBTRUQpKSB7XHJcbiAgICAgICAgICAgICAgZXhpc3RpbmdCdXR0b24hLmNsYXNzTGlzdC5hZGQoXCJleHBsaWNpdGx5LWV4cGFuZGVkXCIpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIGV4aXN0aW5nQnV0dG9uIS5jbGFzc0xpc3QucmVtb3ZlKFwiZXhwbGljaXRseS1leHBhbmRlZFwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnRvZ2dsZU1lc3NhZ2VDb2xsYXBzZShjb250ZW50Q29sbGFwc2libGUsIGV4aXN0aW5nQnV0dG9uISk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5zdHlsZS5tYXhIZWlnaHQgPSBgJHttYXhIfXB4YDtcclxuICAgICAgICAgIGNvbnRlbnRDb2xsYXBzaWJsZS5jbGFzc0xpc3QuYWRkKENTU19DTEFTU0VTLkNPTlRFTlRfQ09MTEFQU0VEKTtcclxuICAgICAgICAgIGV4aXN0aW5nQnV0dG9uLnNldFRleHQoXCJTaG93IE1vcmUg4pa8XCIpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBpZiAoY29udGVudENvbGxhcHNpYmxlLmNsYXNzTGlzdC5jb250YWlucyhDU1NfQ0xBU1NFUy5DT05URU5UX0NPTExBUFNFRCkpIHtcclxuICAgICAgICAgICAgZXhpc3RpbmdCdXR0b24uc2V0VGV4dChcIlNob3cgTW9yZSDilrxcIik7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBleGlzdGluZ0J1dHRvbi5zZXRUZXh0KFwiU2hvdyBMZXNzIOKWslwiKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaWYgKGV4aXN0aW5nQnV0dG9uKSB7XHJcbiAgICAgICAgICBleGlzdGluZ0J1dHRvbi5yZW1vdmUoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29udGVudENvbGxhcHNpYmxlLnN0eWxlLm1heEhlaWdodCA9IFwiXCI7XHJcbiAgICAgICAgY29udGVudENvbGxhcHNpYmxlLmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTRVMuQ09OVEVOVF9DT0xMQVBTRUQpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8vINCc0LXRgtC+0LQgdG9nZ2xlTWVzc2FnZUNvbGxhcHNlINC30LDQu9C40YjQsNGU0YLRjNGB0Y8g0LHQtdC3INC30LzRltC9INC3INCy0ZbQtNC/0L7QstGW0LTRliAjMiAo0LDQsdC+INCy0LDRiNC+0Zcg0L/QvtGC0L7Rh9C90L7RlyDQstC10YDRgdGW0ZcpXHJcbiAgLy8gcHVibGljIHRvZ2dsZU1lc3NhZ2VDb2xsYXBzZShjb250ZW50RWw6IEhUTUxFbGVtZW50LCBidXR0b25FbDogSFRNTEJ1dHRvbkVsZW1lbnQpOiB2b2lkIHtcclxuICAvLyAgIC8vIC4uLiAo0LvQvtCz0ZbQutCwINC30LPQvtGA0YLQsNC90L3Rjy/RgNC+0LfQs9C+0YDRgtCw0L3QvdGPKVxyXG4gIC8vIH1cclxuXHJcbiAgcHVibGljIGFzeW5jIGhhbmRsZVN1bW1hcml6ZUNsaWNrKG9yaWdpbmFsQ29udGVudDogc3RyaW5nLCBidXR0b25FbDogSFRNTEJ1dHRvbkVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IHN1bW1hcml6YXRpb25Nb2RlbCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnN1bW1hcml6YXRpb25Nb2RlbE5hbWU7XHJcblxyXG4gICAgaWYgKCFzdW1tYXJpemF0aW9uTW9kZWwpIHtcclxuICAgICAgbmV3IE5vdGljZShcIlBsZWFzZSBzZWxlY3QgYSBzdW1tYXJpemF0aW9uIG1vZGVsIGluIEFJIEZvcmdlIHNldHRpbmdzIChQcm9kdWN0aXZpdHkgc2VjdGlvbikuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IHRleHRUb1N1bW1hcml6ZSA9IG9yaWdpbmFsQ29udGVudDtcclxuICAgIGlmIChSZW5kZXJlclV0aWxzLmRldGVjdFRoaW5raW5nVGFncyhSZW5kZXJlclV0aWxzLmRlY29kZUh0bWxFbnRpdGllcyhvcmlnaW5hbENvbnRlbnQpKS5oYXNUaGlua2luZ1RhZ3MpIHtcclxuICAgICAgdGV4dFRvU3VtbWFyaXplID0gUmVuZGVyZXJVdGlscy5kZWNvZGVIdG1sRW50aXRpZXMob3JpZ2luYWxDb250ZW50KVxyXG4gICAgICAgIC5yZXBsYWNlKC88dGhpbms+W1xcc1xcU10qPzxcXC90aGluaz4vZywgXCJcIilcclxuICAgICAgICAudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGV4dFRvU3VtbWFyaXplIHx8IHRleHRUb1N1bW1hcml6ZS5sZW5ndGggPCA1MCkge1xyXG4gICAgICBuZXcgTm90aWNlKFwiTWVzc2FnZSBpcyB0b28gc2hvcnQgdG8gc3VtbWFyaXplIG1lYW5pbmdmdWxseS5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBvcmlnaW5hbEljb24gPSBidXR0b25FbC5xdWVyeVNlbGVjdG9yKFwiLnN2Zy1pY29uXCIpPy5nZXRBdHRyaWJ1dGUoXCJpY29uLW5hbWVcIikgfHwgXCJzY3JvbGwtdGV4dFwiO1xyXG4gICAgc2V0SWNvbihidXR0b25FbCwgXCJsb2FkZXJcIik7XHJcbiAgICBidXR0b25FbC5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICBjb25zdCBvcmlnaW5hbFRpdGxlID0gYnV0dG9uRWwudGl0bGU7XHJcbiAgICBidXR0b25FbC50aXRsZSA9IFwiU3VtbWFyaXppbmcuLi5cIjtcclxuICAgIGJ1dHRvbkVsLmFkZENsYXNzKENTU19DTEFTU19ESVNBQkxFRCk7XHJcblxyXG4gICAgYnV0dG9uRWwuYWRkQ2xhc3MoXCJidXR0b24tbG9hZGluZ1wiKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBwcm9tcHQgPSBgUHJvdmlkZSBhIGNvbmNpc2Ugc3VtbWFyeSBvZiB0aGUgZm9sbG93aW5nIHRleHQ6XFxuXFxuXCJcIlwiXFxuJHt0ZXh0VG9TdW1tYXJpemV9XFxuXCJcIlwiXFxuXFxuU3VtbWFyeTpgO1xyXG4gICAgICBjb25zdCByZXF1ZXN0Qm9keSA9IHtcclxuICAgICAgICBtb2RlbDogc3VtbWFyaXphdGlvbk1vZGVsLFxyXG4gICAgICAgIHByb21wdDogcHJvbXB0LFxyXG4gICAgICAgIHN0cmVhbTogZmFsc2UsXHJcbiAgICAgICAgdGVtcGVyYXR1cmU6IDAuMixcclxuICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICBudW1fY3R4OiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb250ZXh0V2luZG93ID4gMjA0OCA/IDIwNDggOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb250ZXh0V2luZG93LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH07XHJcblxyXG4gICAgICBjb25zdCByZXNwb25zZURhdGE6IE9sbGFtYUdlbmVyYXRlUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdlbmVyYXRlUmF3KHJlcXVlc3RCb2R5KTtcclxuXHJcbiAgICAgIGlmIChyZXNwb25zZURhdGEgJiYgcmVzcG9uc2VEYXRhLnJlc3BvbnNlKSB7XHJcbiAgICAgICAgbmV3IFN1bW1hcnlNb2RhbCh0aGlzLnBsdWdpbiwgXCJNZXNzYWdlIFN1bW1hcnlcIiwgcmVzcG9uc2VEYXRhLnJlc3BvbnNlLnRyaW0oKSkub3BlbigpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlJlY2VpdmVkIGVtcHR5IHJlc3BvbnNlIGZyb20gc3VtbWFyaXphdGlvbiBtb2RlbC5cIik7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiRXJyb3IgZHVyaW5nIHN1bW1hcml6YXRpb246XCIsIGVycm9yKTtcclxuICAgICAgbGV0IHVzZXJNZXNzYWdlID0gXCJTdW1tYXJpemF0aW9uIGZhaWxlZDogXCI7XHJcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoXCI0MDRcIikgfHwgZXJyb3IubWVzc2FnZS50b0xvY2FsZUxvd2VyQ2FzZSgpLmluY2x1ZGVzKFwibW9kZWwgbm90IGZvdW5kXCIpKSB7XHJcbiAgICAgICAgICB1c2VyTWVzc2FnZSArPSBgTW9kZWwgJyR7c3VtbWFyaXphdGlvbk1vZGVsfScgbm90IGZvdW5kLmA7XHJcbiAgICAgICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKFwiY29ubmVjdFwiKSB8fCBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKFwiZmV0Y2hcIikpIHtcclxuICAgICAgICAgIHVzZXJNZXNzYWdlICs9IFwiQ291bGQgbm90IGNvbm5lY3QgdG8gT2xsYW1hIHNlcnZlci5cIjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgdXNlck1lc3NhZ2UgKz0gZXJyb3IubWVzc2FnZTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdXNlck1lc3NhZ2UgKz0gXCJVbmtub3duIGVycm9yIG9jY3VycmVkLlwiO1xyXG4gICAgICB9XHJcbiAgICAgIG5ldyBOb3RpY2UodXNlck1lc3NhZ2UsIDYwMDApO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgc2V0SWNvbihidXR0b25FbCwgb3JpZ2luYWxJY29uKTtcclxuICAgICAgYnV0dG9uRWwuZGlzYWJsZWQgPSBmYWxzZTtcclxuICAgICAgYnV0dG9uRWwudGl0bGUgPSBvcmlnaW5hbFRpdGxlO1xyXG4gICAgICBidXR0b25FbC5yZW1vdmVDbGFzcyhDU1NfQ0xBU1NfRElTQUJMRUQpO1xyXG4gICAgICBidXR0b25FbC5yZW1vdmVDbGFzcyhcImJ1dHRvbi1sb2FkaW5nXCIpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICog0KHRgtCy0L7RgNGO0ZQg0L3QvtCy0YMg0LPRgNGD0L/RgyDQtNC70Y8g0LLRltC00L7QsdGA0LDQttC10L3QvdGPINC/0L7QvNC40LvQvtC6INCw0LHQviDQvtC90L7QstC70Y7RlCDRltGB0L3Rg9GO0YfRgy5cclxuICAgKiDQotC10L/QtdGAINCy0LjQutC+0YDQuNGB0YLQvtCy0YPRlCBFcnJvck1lc3NhZ2VSZW5kZXJlciDQtNC70Y8g0YHRgtCy0L7RgNC10L3QvdGPINCy0ZbQt9GD0LDQu9GM0L3QvtCz0L4g0LHQu9C+0LrRgy5cclxuICAgKiBAcGFyYW0gaXNDb250aW51aW5nINCn0Lgg0YbQtSDQv9GA0L7QtNC+0LLQttC10L3QvdGPINC/0L7Qv9C10YDQtdC00L3RjNC+0Zcg0L/QvtGB0LvRltC00L7QstC90L7RgdGC0ZYg0L/QvtC80LjQu9C+0LouXHJcbiAgICovXHJcbiAgcHJpdmF0ZSByZW5kZXJPclVwZGF0ZUVycm9yR3JvdXAoaXNDb250aW51aW5nOiBib29sZWFuKTogdm9pZCB7XHJcbiAgICBpZiAoIXRoaXMuY2hhdENvbnRhaW5lcikgcmV0dXJuO1xyXG5cclxuICAgIGNvbnN0IGVycm9yc1RvRGlzcGxheSA9IFsuLi50aGlzLmNvbnNlY3V0aXZlRXJyb3JNZXNzYWdlc107XHJcbiAgICBpZiAoZXJyb3JzVG9EaXNwbGF5Lmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBjb25zdCBlcnJvckNvdW50ID0gZXJyb3JzVG9EaXNwbGF5Lmxlbmd0aDtcclxuICAgIGNvbnN0IGxhc3RFcnJvciA9IGVycm9yc1RvRGlzcGxheVtlcnJvckNvdW50IC0gMV07XHJcblxyXG4gICAgbGV0IGdyb3VwRWw6IEhUTUxFbGVtZW50O1xyXG4gICAgbGV0IGNvbnRlbnRDb250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgaWYgKGlzQ29udGludWluZyAmJiB0aGlzLmVycm9yR3JvdXBFbGVtZW50KSB7XHJcbiAgICAgIGdyb3VwRWwgPSB0aGlzLmVycm9yR3JvdXBFbGVtZW50O1xyXG5cclxuICAgICAgY29udGVudENvbnRhaW5lciA9IGdyb3VwRWwucXVlcnlTZWxlY3RvcihgLiR7Q1NTX0NMQVNTX0VSUk9SX1RFWFR9YCk7XHJcbiAgICAgIGlmIChjb250ZW50Q29udGFpbmVyKSB7XHJcbiAgICAgICAgY29udGVudENvbnRhaW5lci5lbXB0eSgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIltyZW5kZXJPclVwZGF0ZUVycm9yR3JvdXBdIENvdWxkIG5vdCBmaW5kIGVycm9yIHRleHQgY29udGFpbmVyIGluIGV4aXN0aW5nIGdyb3VwIVwiKTtcclxuXHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMudXBkYXRlRXJyb3JHcm91cFRpbWVzdGFtcChncm91cEVsLCBsYXN0RXJyb3IudGltZXN0YW1wKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMuaGlkZUVtcHR5U3RhdGUoKTtcclxuICAgICAgdGhpcy5pc1N1bW1hcml6aW5nRXJyb3JzID0gZmFsc2U7XHJcblxyXG4gICAgICBjb25zdCByZW5kZXJlciA9IG5ldyBFcnJvck1lc3NhZ2VSZW5kZXJlcih0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIGxhc3RFcnJvciwgdGhpcyk7XHJcbiAgICAgIGdyb3VwRWwgPSByZW5kZXJlci5yZW5kZXIoKTtcclxuICAgICAgY29udGVudENvbnRhaW5lciA9IGdyb3VwRWwucXVlcnlTZWxlY3RvcihgLiR7Q1NTX0NMQVNTX0VSUk9SX1RFWFR9YCk7XHJcblxyXG4gICAgICB0aGlzLmNoYXRDb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JvdXBFbCk7XHJcbiAgICAgIHRoaXMuZXJyb3JHcm91cEVsZW1lbnQgPSBncm91cEVsO1xyXG4gICAgICB0aGlzLmxhc3RNZXNzYWdlRWxlbWVudCA9IGdyb3VwRWw7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGNvbnRlbnRDb250YWluZXIpIHtcclxuICAgICAgaWYgKGVycm9yQ291bnQgPT09IDEpIHtcclxuICAgICAgICBjb250ZW50Q29udGFpbmVyLnNldFRleHQobGFzdEVycm9yLmNvbnRlbnQpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnRlbnRDb250YWluZXIuc2V0VGV4dChgTXVsdGlwbGUgZXJyb3JzIG9jY3VycmVkICgke2Vycm9yQ291bnR9KS4gU3VtbWFyaXppbmcuLi5gKTtcclxuICAgICAgICBpZiAoIXRoaXMuaXNTdW1tYXJpemluZ0Vycm9ycykge1xyXG4gICAgICAgICAgdGhpcy50cmlnZ2VyRXJyb3JTdW1tYXJpemF0aW9uKGdyb3VwRWwsIGVycm9yc1RvRGlzcGxheSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbcmVuZGVyT3JVcGRhdGVFcnJvckdyb3VwXSBGYWlsZWQgdG8gZmluZC9jcmVhdGUgY29udGVudCBjb250YWluZXIgZm9yIGVycm9yIGdyb3VwLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbSg1MCwgdHJ1ZSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHVwZGF0ZUVycm9yR3JvdXBUaW1lc3RhbXAoZ3JvdXBFbDogSFRNTEVsZW1lbnQsIHRpbWVzdGFtcDogRGF0ZSk6IHZvaWQge1xyXG4gICAgZ3JvdXBFbC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXRpbWVzdGFtcFwiLCB0aW1lc3RhbXAuZ2V0VGltZSgpLnRvU3RyaW5nKCkpO1xyXG4gICAgY29uc3QgdGltZXN0YW1wRWwgPSBncm91cEVsLnF1ZXJ5U2VsZWN0b3IoYC4ke0NTU19DTEFTU0VTLlRJTUVTVEFNUH1gKTtcclxuICAgIGlmICh0aW1lc3RhbXBFbCkge1xyXG4gICAgICB0aW1lc3RhbXBFbC5zZXRUZXh0KHRoaXMuZm9ybWF0VGltZSh0aW1lc3RhbXApKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgdHJpZ2dlckVycm9yU3VtbWFyaXphdGlvbih0YXJnZXRHcm91cEVsZW1lbnQ6IEhUTUxFbGVtZW50LCBlcnJvcnM6IE1lc3NhZ2VbXSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgRU5BQkxFX0VSUk9SX1NVTU1BUklaQVRJT04gPSBmYWxzZTtcclxuXHJcbiAgICBpZiAoIUVOQUJMRV9FUlJPUl9TVU1NQVJJWkFUSU9OKSB7XHJcbiAgICAgIHRoaXMuZGlzcGxheUVycm9yTGlzdEZhbGxiYWNrKHRhcmdldEdyb3VwRWxlbWVudCwgZXJyb3JzKTtcclxuXHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRoaXMucGx1Z2luLnNldHRpbmdzLnN1bW1hcml6YXRpb25Nb2RlbE5hbWUgfHwgdGhpcy5pc1N1bW1hcml6aW5nRXJyb3JzKSB7XHJcbiAgICAgIGlmICghdGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VtbWFyaXphdGlvbk1vZGVsTmFtZSlcclxuICAgICAgICBpZiAodGhpcy5pc1N1bW1hcml6aW5nRXJyb3JzKSB0aGlzLmRpc3BsYXlFcnJvckxpc3RGYWxsYmFjayh0YXJnZXRHcm91cEVsZW1lbnQsIGVycm9ycyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmlzU3VtbWFyaXppbmdFcnJvcnMgPSB0cnVlO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHN1bW1hcnkgPSBhd2FpdCB0aGlzLnN1bW1hcml6ZUVycm9ycyhlcnJvcnMpO1xyXG4gICAgICBjb25zdCBjb250ZW50Q29udGFpbmVyID0gdGFyZ2V0R3JvdXBFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoYC4ke0NTU19DTEFTU0VTLkVSUk9SX1RFWFR9YCkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICBpZiAoIWNvbnRlbnRDb250YWluZXIgfHwgIWNvbnRlbnRDb250YWluZXIuaXNDb25uZWN0ZWQpIHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihcclxuICAgICAgICAgIFwiW3RyaWdnZXJFcnJvclN1bW1hcml6YXRpb25dIEVycm9yIGNvbnRlbnQgY29udGFpbmVyIGRpc2FwcGVhcmVkIGJlZm9yZSBzdW1tYXJpemF0aW9uIGZpbmlzaGVkLlwiXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb250ZW50Q29udGFpbmVyLmVtcHR5KCk7XHJcblxyXG4gICAgICBpZiAoc3VtbWFyeSkge1xyXG4gICAgICAgIGNvbnRlbnRDb250YWluZXIuc2V0VGV4dChgTXVsdGlwbGUgZXJyb3JzIG9jY3VycmVkLiBTdW1tYXJ5OlxcbiR7c3VtbWFyeX1gKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihcclxuICAgICAgICAgIFwiW3RyaWdnZXJFcnJvclN1bW1hcml6YXRpb25dIFN1bW1hcml6YXRpb24gZmFpbGVkIG9yIHJldHVybmVkIGVtcHR5LiBEaXNwbGF5aW5nIGxpc3QgZmFsbGJhY2suXCJcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMuZGlzcGxheUVycm9yTGlzdEZhbGxiYWNrKHRhcmdldEdyb3VwRWxlbWVudCwgZXJyb3JzKTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW3RyaWdnZXJFcnJvclN1bW1hcml6YXRpb25dIFVuZXhwZWN0ZWQgZXJyb3IgZHVyaW5nIHN1bW1hcml6YXRpb24gcHJvY2VzczpcIiwgZXJyb3IpO1xyXG4gICAgICB0aGlzLmRpc3BsYXlFcnJvckxpc3RGYWxsYmFjayh0YXJnZXRHcm91cEVsZW1lbnQsIGVycm9ycyk7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICB0aGlzLmlzU3VtbWFyaXppbmdFcnJvcnMgPSBmYWxzZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgZGlzcGxheUVycm9yTGlzdEZhbGxiYWNrKHRhcmdldEdyb3VwRWxlbWVudDogSFRNTEVsZW1lbnQsIGVycm9yczogTWVzc2FnZVtdKTogdm9pZCB7XHJcbiAgICBjb25zdCBjb250ZW50Q29udGFpbmVyID0gdGFyZ2V0R3JvdXBFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoYC4ke0NTU19DTEFTU0VTLkVSUk9SX1RFWFR9YCkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgaWYgKCFjb250ZW50Q29udGFpbmVyIHx8ICFjb250ZW50Q29udGFpbmVyLmlzQ29ubmVjdGVkKSB7XHJcbiAgICAgIGlmICghdGFyZ2V0R3JvdXBFbGVtZW50LmlzQ29ubmVjdGVkKSB7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnRlbnRDb250YWluZXIuZW1wdHkoKTtcclxuICAgIGNvbnN0IHVuaXF1ZUVycm9ycyA9IEFycmF5LmZyb20obmV3IFNldChlcnJvcnMubWFwKGUgPT4gZS5jb250ZW50LnRyaW0oKSkpKTtcclxuICAgIGNvbnRlbnRDb250YWluZXIuY3JlYXRlRGl2KHtcclxuICAgICAgdGV4dDogYE11bHRpcGxlIGVycm9ycyBvY2N1cnJlZCAoJHtlcnJvcnMubGVuZ3RofSB0b3RhbCwgJHt1bmlxdWVFcnJvcnMubGVuZ3RofSB1bmlxdWUpOmAsXHJcbiAgICAgIGNsczogXCJlcnJvci1zdW1tYXJ5LWhlYWRlclwiLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgbGlzdEVsID0gY29udGVudENvbnRhaW5lci5jcmVhdGVFbChcInVsXCIpO1xyXG4gICAgbGlzdEVsLnN0eWxlLm1hcmdpblRvcCA9IFwiNXB4XCI7XHJcbiAgICBsaXN0RWwuc3R5bGUucGFkZGluZ0xlZnQgPSBcIjIwcHhcIjtcclxuICAgIGxpc3RFbC5zdHlsZS5saXN0U3R5bGUgPSBcImRpc2NcIjtcclxuXHJcbiAgICB1bmlxdWVFcnJvcnMuZm9yRWFjaChlcnJvck1zZyA9PiB7XHJcbiAgICAgIGNvbnN0IGxpc3RJdGVtID0gbGlzdEVsLmNyZWF0ZUVsKFwibGlcIik7XHJcbiAgICAgIGxpc3RJdGVtLnRleHRDb250ZW50ID0gZXJyb3JNc2c7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbSg1MCwgdHJ1ZSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiDQktC40LrQvtC90YPRlCDRgdGD0LzQsNGA0LjQt9Cw0YbRltGOINGB0L/QuNGB0LrRgyDQv9C+0LLRltC00L7QvNC70LXQvdGMINC/0YDQviDQv9C+0LzQuNC70LrQuCDQt9CwINC00L7Qv9C+0LzQvtCz0L7RjiBPbGxhbWEuXHJcbiAgICogQHBhcmFtIGVycm9ycyDQnNCw0YHQuNCyINC/0L7QstGW0LTQvtC80LvQtdC90Ywg0L/RgNC+INC/0L7QvNC40LvQutC4LlxyXG4gICAqIEByZXR1cm5zINCg0Y/QtNC+0Log0Lcg0YHRg9C80LDRgNC40LfQsNGG0ZbRlNGOINCw0LHQviBudWxsINGDINGA0LDQt9GWINC/0L7QvNC40LvQutC4LlxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgc3VtbWFyaXplRXJyb3JzKGVycm9yczogTWVzc2FnZVtdKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XHJcbiAgICBjb25zdCBtb2RlbE5hbWUgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdW1tYXJpemF0aW9uTW9kZWxOYW1lO1xyXG4gICAgaWYgKCFtb2RlbE5hbWUpIHJldHVybiBudWxsO1xyXG5cclxuICAgIGlmIChlcnJvcnMubGVuZ3RoIDwgMikgcmV0dXJuIGVycm9yc1swXT8uY29udGVudCB8fCBudWxsO1xyXG5cclxuICAgIGNvbnN0IHVuaXF1ZUVycm9yQ29udGVudHMgPSBBcnJheS5mcm9tKG5ldyBTZXQoZXJyb3JzLm1hcChlID0+IGUuY29udGVudC50cmltKCkpKSk7XHJcbiAgICBjb25zdCBlcnJvcnNUZXh0ID0gdW5pcXVlRXJyb3JDb250ZW50cy5tYXAoKG1zZywgaW5kZXgpID0+IGBFcnJvciAke2luZGV4ICsgMX06ICR7bXNnfWApLmpvaW4oXCJcXG5cIik7XHJcbiAgICBjb25zdCBwcm9tcHQgPSBgQ29uY2lzZWx5IHN1bW1hcml6ZSB0aGUgZm9sbG93aW5nICR7dW5pcXVlRXJyb3JDb250ZW50cy5sZW5ndGh9IHVuaXF1ZSBlcnJvciBtZXNzYWdlcyByZXBvcnRlZCBieSB0aGUgc3lzdGVtLiBGb2N1cyBvbiB0aGUgY29yZSBpc3N1ZShzKTpcXG5cXG4ke2Vycm9yc1RleHR9XFxuXFxuU3VtbWFyeTpgO1xyXG5cclxuICAgIGNvbnN0IHJlcXVlc3RCb2R5ID0ge1xyXG4gICAgICBtb2RlbDogbW9kZWxOYW1lLFxyXG4gICAgICBwcm9tcHQ6IHByb21wdCxcclxuICAgICAgc3RyZWFtOiBmYWxzZSxcclxuICAgICAgdGVtcGVyYXR1cmU6IDAuMixcclxuICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgIG51bV9jdHg6IHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnRleHRXaW5kb3cgPiAxMDI0ID8gMTAyNCA6IHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnRleHRXaW5kb3csXHJcbiAgICAgIH0sXHJcbiAgICAgIHN5c3RlbTogXCJZb3UgYXJlIGFuIGFzc2lzdGFudCB0aGF0IHN1bW1hcml6ZXMgbGlzdHMgb2YgdGVjaG5pY2FsIGVycm9yIG1lc3NhZ2VzIGFjY3VyYXRlbHkgYW5kIGNvbmNpc2VseS5cIixcclxuICAgIH07XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgIGBbc3VtbWFyaXplRXJyb3JzXSBTZW5kaW5nIHJlcXVlc3QgdG8gbW9kZWwgJHttb2RlbE5hbWV9LiBQcm9tcHQgbGVuZ3RoOiAke3Byb21wdC5sZW5ndGh9YFxyXG4gICAgICApO1xyXG4gICAgICBjb25zdCByZXNwb25zZURhdGE6IE9sbGFtYUdlbmVyYXRlUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdlbmVyYXRlUmF3KHJlcXVlc3RCb2R5KTtcclxuICAgICAgaWYgKHJlc3BvbnNlRGF0YSAmJiByZXNwb25zZURhdGEucmVzcG9uc2UpIHtcclxuICAgICAgICByZXR1cm4gcmVzcG9uc2VEYXRhLnJlc3BvbnNlLnRyaW0oKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW3N1bW1hcml6ZUVycm9yc10gRmFpbGVkIHRvIHN1bW1hcml6ZSBlcnJvcnM6XCIsIGVycm9yKTtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZUVycm9yTWVzc2FnZShlcnJvck1lc3NhZ2U6IE1lc3NhZ2UpOiB2b2lkIHtcclxuICAgIGlmIChlcnJvck1lc3NhZ2Uucm9sZSAhPT0gXCJlcnJvclwiKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIHRoaXMuY29uc2VjdXRpdmVFcnJvck1lc3NhZ2VzLnB1c2goZXJyb3JNZXNzYWdlKTtcclxuICAgIGNvbnN0IGlzQ29udGludWluZ0Vycm9yID0gdGhpcy5sYXN0TWVzc2FnZUVsZW1lbnQgPT09IHRoaXMuZXJyb3JHcm91cEVsZW1lbnQgJiYgdGhpcy5lcnJvckdyb3VwRWxlbWVudCAhPT0gbnVsbDtcclxuICAgIGlmICghaXNDb250aW51aW5nRXJyb3IpIHtcclxuICAgICAgdGhpcy5lcnJvckdyb3VwRWxlbWVudCA9IG51bGw7XHJcbiAgICAgIHRoaXMuY29uc2VjdXRpdmVFcnJvck1lc3NhZ2VzID0gW2Vycm9yTWVzc2FnZV07XHJcbiAgICB9XHJcbiAgICB0cnkge1xyXG4gICAgICB0aGlzLnJlbmRlck9yVXBkYXRlRXJyb3JHcm91cChpc0NvbnRpbnVpbmdFcnJvcik7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbaGFuZGxlRXJyb3JNZXNzYWdlXSBGYWlsZWQgdG8gcmVuZGVyL3VwZGF0ZSBlcnJvciBncm91cDpcIiwgZXJyb3IpO1xyXG4gICAgICB0cnkge1xyXG4gICAgICB9IGNhdGNoIHt9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBcclxuICBhc3luYyBzZW5kTWVzc2FnZSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IHVzZXJJbnB1dFRleHQgPSB0aGlzLmlucHV0RWwudmFsdWUudHJpbSgpO1xyXG4gICAgY29uc3QgcmVxdWVzdFRpbWVzdGFtcElkID0gRGF0ZS5ub3coKTsgXHJcblxyXG4gICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbT2xsYW1hVmlld11bc2VuZE1lc3NhZ2UgU1RBUlQgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBVc2VyIGlucHV0OiBcIiR7dXNlcklucHV0VGV4dC5zdWJzdHJpbmcoMCwgNTApfS4uLlwiLCBpc1Byb2Nlc3Npbmc6ICR7dGhpcy5pc1Byb2Nlc3Npbmd9LCBjdXJyZW50QWJvcnRDb250cm9sbGVyOiAke3RoaXMuY3VycmVudEFib3J0Q29udHJvbGxlciA/IFwiYWN0aXZlXCIgOiBcIm51bGxcIn1gKTtcclxuXHJcbiAgICBpZiAoIXVzZXJJbnB1dFRleHQgfHwgdGhpcy5pc1Byb2Nlc3NpbmcgfHwgdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyKSB7XHJcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbT2xsYW1hVmlld11bc2VuZE1lc3NhZ2UgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBBYm9ydGVkIGVhcmx5LiBFbXB0eTogJHshdXNlcklucHV0VGV4dH0sIFByb2Nlc3Npbmc6ICR7dGhpcy5pc1Byb2Nlc3Npbmd9LCBBYm9ydEN0cmw6ICR7ISF0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXJ9YCk7XHJcbiAgICAgIGlmICh0aGlzLmlzUHJvY2Vzc2luZyB8fCB0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIpIG5ldyBOb3RpY2UoXCJQbGVhc2Ugd2FpdCBvciBjYW5jZWwgY3VycmVudCBvcGVyYXRpb24uXCIsIDMwMDApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRBY3RpdmVDaGF0KCk7IC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4gZ2V0QWN0aXZlQ2hhdCDQsdC10LcgXCJPckZhaWxcIiDRgdC/0L7Rh9Cw0YLQutGDXHJcbiAgICBpZiAoIWFjdGl2ZUNoYXQpIHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmluZm8oYFtPbGxhbWFWaWV3XVtzZW5kTWVzc2FnZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIE5vIGFjdGl2ZSBjaGF0LiBDcmVhdGluZyBuZXcuYCk7XHJcbiAgICAgIGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5jcmVhdGVOZXdDaGF0KCk7XHJcbiAgICAgIGlmICghYWN0aXZlQ2hhdCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvcjogTm8gYWN0aXZlIGNoYXQgYW5kIGNvdWxkIG5vdCBjcmVhdGUgb25lLlwiKTtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtPbGxhbWFWaWV3XVtzZW5kTWVzc2FnZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIEZhaWxlZCB0byBnZXQvY3JlYXRlIGFjdGl2ZSBjaGF0LmApO1xyXG4gICAgICAgIHRoaXMuc2V0TG9hZGluZ1N0YXRlKGZhbHNlKTsgXHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICAgIG5ldyBOb3RpY2UoYFN0YXJ0ZWQgbmV3IGNoYXQ6ICR7YWN0aXZlQ2hhdC5tZXRhZGF0YS5uYW1lfWApO1xyXG4gICAgfVxyXG4gICAgY29uc3QgY2hhdElkID0gYWN0aXZlQ2hhdC5tZXRhZGF0YS5pZDtcclxuICAgIGNvbnN0IHVzZXJNZXNzYWdlVGltZXN0YW1wID0gbmV3IERhdGUoKTtcclxuXHJcbiAgICB0aGlzLmNsZWFySW5wdXRGaWVsZCgpO1xyXG4gICAgdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xyXG4gICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbT2xsYW1hVmlld11bc2VuZE1lc3NhZ2UgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBBYm9ydENvbnRyb2xsZXIgQ1JFQVRFRC5gKTtcclxuICAgIHRoaXMuc2V0TG9hZGluZ1N0YXRlKHRydWUpO1xyXG4gICAgdGhpcy5oaWRlRW1wdHlTdGF0ZSgpO1xyXG4gICAgXHJcbiAgICBjb25zdCBsbG1SZXNwb25zZVN0YXJ0VGltZU1zID0gRGF0ZS5ub3coKTsgXHJcbiAgICBcclxuICAgIGxldCBjb250aW51ZUNvbnZlcnNhdGlvbiA9IHRydWU7XHJcbiAgICBjb25zdCBtYXhUdXJucyA9IDU7XHJcbiAgICBsZXQgdHVybnMgPSAwO1xyXG4gICAgbGV0IGN1cnJlbnRUdXJuTGxtUmVzcG9uc2VUc0ZvckNhdGNoOiBudW1iZXIgfCBudWxsID0gbGxtUmVzcG9uc2VTdGFydFRpbWVNcztcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyDQmtGA0L7QuiAxOiDQntCx0YDQvtCx0LrQsCDRgtCwINGA0LXQvdC00LXRgNC40L3QsyDQv9C+0LLRltC00L7QvNC70LXQvdC90Y8g0LrQvtGA0LjRgdGC0YPQstCw0YfQsFxyXG4gICAgICBjb25zdCB1c2VyTWVzc2FnZUFkZGVkID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuYWRkVXNlck1lc3NhZ2VBbmRBd2FpdFJlbmRlcihcclxuICAgICAgICAgIHVzZXJJbnB1dFRleHQsIFxyXG4gICAgICAgICAgdXNlck1lc3NhZ2VUaW1lc3RhbXAsIFxyXG4gICAgICAgICAgcmVxdWVzdFRpbWVzdGFtcElkXHJcbiAgICAgICk7XHJcbiAgICAgIGlmICghdXNlck1lc3NhZ2VBZGRlZCkge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVXNlciBtZXNzYWdlIHByb2Nlc3NpbmcgZmFpbGVkIGluIENoYXRNYW5hZ2VyLlwiKTtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuaW5mbyhgW09sbGFtYVZpZXddW3NlbmRNZXNzYWdlIGlkOiR7cmVxdWVzdFRpbWVzdGFtcElkfV0gVXNlck1lc3NhZ2UgKHRzOiAke3VzZXJNZXNzYWdlVGltZXN0YW1wLmdldFRpbWUoKX0pIGZ1bGx5IHByb2Nlc3NlZCBieSBITUEgdmlhIENoYXRNYW5hZ2VyLmApO1xyXG5cclxuXHJcbiAgICAgIGxldCBjaGF0U3RhdGVGb3JMbG0gPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRBY3RpdmVDaGF0T3JGYWlsKCk7XHJcblxyXG4gICAgICB3aGlsZSAoY29udGludWVDb252ZXJzYXRpb24gJiYgdHVybnMgPCBtYXhUdXJucyAmJiAhdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkKSB7XHJcbiAgICAgICAgdHVybnMrKztcclxuICAgICAgICBjb25zdCBjdXJyZW50VHVybkxsbVJlc3BvbnNlVHMgPSAodHVybnMgPT09IDEpID8gbGxtUmVzcG9uc2VTdGFydFRpbWVNcyA6IERhdGUubm93KCk7XHJcbiAgICAgICAgY3VycmVudFR1cm5MbG1SZXNwb25zZVRzRm9yQ2F0Y2ggPSBjdXJyZW50VHVybkxsbVJlc3BvbnNlVHM7XHJcblxyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW09sbGFtYVZpZXddW3NlbmRNZXNzYWdlIGlkOiR7cmVxdWVzdFRpbWVzdGFtcElkfV0gT3JjaGVzdHJhdG9yIFR1cm4gJHt0dXJuc30vJHttYXhUdXJuc30uIEhpc3RvcnkgbGVuZ3RoOiAke2NoYXRTdGF0ZUZvckxsbS5tZXNzYWdlcy5sZW5ndGh9YCk7XHJcbiAgICAgICAgdGhpcy5fbWFuYWdlUGxhY2Vob2xkZXIoY3VycmVudFR1cm5MbG1SZXNwb25zZVRzLCByZXF1ZXN0VGltZXN0YW1wSWQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vINCX0LDQstC20LTQuCDQvtGC0YDQuNC80YPRlNC80L4g0L3QsNC50YHQstGW0LbRltGI0LjQuSDRgdGC0LDQvSDRh9Cw0YLRgyDQv9C10YDQtdC0INCy0LjQutC70LjQutC+0LwgTExNXHJcbiAgICAgICAgY2hhdFN0YXRlRm9yTGxtID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0QWN0aXZlQ2hhdE9yRmFpbCgpOyBcclxuXHJcbiAgICAgICAgY29uc3QgbGxtU3RyZWFtID0gdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZS5nZW5lcmF0ZUNoYXRSZXNwb25zZVN0cmVhbShcclxuICAgICAgICAgIGNoYXRTdGF0ZUZvckxsbSxcclxuICAgICAgICAgIHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlci5zaWduYWxcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCB7IGFjY3VtdWxhdGVkQ29udGVudCwgbmF0aXZlVG9vbENhbGxzLCBhc3Npc3RhbnRNZXNzYWdlV2l0aE5hdGl2ZUNhbGxzIH0gPSBcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5fcHJvY2Vzc0xsbVN0cmVhbShsbG1TdHJlYW0sIGN1cnJlbnRUdXJuTGxtUmVzcG9uc2VUcywgcmVxdWVzdFRpbWVzdGFtcElkKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlci5zaWduYWwuYWJvcnRlZCkgdGhyb3cgbmV3IEVycm9yKFwiYWJvcnRlZCBieSB1c2VyXCIpO1xyXG5cclxuICAgICAgICBjb25zdCB0b29sQ2FsbENoZWNrUmVzdWx0ID0gdGhpcy5fZGV0ZXJtaW5lVG9vbENhbGxzKFxyXG4gICAgICAgICAgICBuYXRpdmVUb29sQ2FsbHMsIFxyXG4gICAgICAgICAgICBhc3Npc3RhbnRNZXNzYWdlV2l0aE5hdGl2ZUNhbGxzLCBcclxuICAgICAgICAgICAgYWNjdW11bGF0ZWRDb250ZW50LCBcclxuICAgICAgICAgICAgY3VycmVudFR1cm5MbG1SZXNwb25zZVRzLCBcclxuICAgICAgICAgICAgcmVxdWVzdFRpbWVzdGFtcElkXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgaWYgKHRvb2xDYWxsQ2hlY2tSZXN1bHQucHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm4gJiYgdG9vbENhbGxDaGVja1Jlc3VsdC5wcm9jZXNzZWRUb29sQ2FsbHNUaGlzVHVybi5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX2V4ZWN1dGVBbmRSZW5kZXJUb29sQ3ljbGUoXHJcbiAgICAgICAgICAgICAgICB0b29sQ2FsbENoZWNrUmVzdWx0LnByb2Nlc3NlZFRvb2xDYWxsc1RoaXNUdXJuLFxyXG4gICAgICAgICAgICAgICAgdG9vbENhbGxDaGVja1Jlc3VsdC5hc3Npc3RhbnRNZXNzYWdlRm9ySGlzdG9yeSxcclxuICAgICAgICAgICAgICAgIHJlcXVlc3RUaW1lc3RhbXBJZFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAvLyDQn9GW0YHQu9GPINCy0LjQutC+0L3QsNC90L3RjyDRltC90YHRgtGA0YPQvNC10L3RgtGW0LIg0YLQsCDQtNC+0LTQsNCy0LDQvdC90Y8g0ZfRhSDRgNC10LfRg9C70YzRgtCw0YLRltCyINC00L4gQ2hhdE1hbmFnZXIsXHJcbiAgICAgICAgICAgIC8vINC+0L3QvtCy0LvRjtGU0LzQviDRgdGC0LDQvSDRh9Cw0YLRgyDQtNC70Y8g0L3QsNGB0YLRg9C/0L3QvtGXINGW0YLQtdGA0LDRhtGW0ZcgTExNLlxyXG4gICAgICAgICAgICBjaGF0U3RhdGVGb3JMbG0gPSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRBY3RpdmVDaGF0T3JGYWlsKCk7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlQ29udmVyc2F0aW9uID0gdHJ1ZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9yZW5kZXJGaW5hbEFzc2lzdGFudFRleHQoXHJcbiAgICAgICAgICAgICAgICBhY2N1bXVsYXRlZENvbnRlbnQsIC8vINCm0LUg0YTRltC90LDQu9GM0L3QuNC5INGC0LXQutGB0YIsINGP0LrRidC+INGW0L3RgdGC0YDRg9C80LXQvdGC0Lgg0L3QtSDQstC40LrQu9C40LrQsNC70LjRgdGMXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50VHVybkxsbVJlc3BvbnNlVHMsXHJcbiAgICAgICAgICAgICAgICByZXF1ZXN0VGltZXN0YW1wSWRcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgY29udGludWVDb252ZXJzYXRpb24gPSBmYWxzZTsgXHJcbiAgICAgICAgfVxyXG4gICAgICB9IFxyXG5cclxuICAgICAgaWYgKHR1cm5zID49IG1heFR1cm5zKSB7IFxyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbT2xsYW1hVmlld11bc2VuZE1lc3NhZ2UgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBNYXggdHVybnMgKCR7bWF4VHVybnN9KSByZWFjaGVkLmApO1xyXG4gICAgICAgIGNvbnN0IG1heFR1cm5zTXNnVGltZXN0YW1wID0gbmV3IERhdGUoKTtcclxuICAgICAgICBjb25zdCBtYXhUdXJuc01zZzogTWVzc2FnZSA9IHsgcm9sZTogXCJzeXN0ZW1cIiwgY29udGVudDogXCJNYXggcHJvY2Vzc2luZyB0dXJucyByZWFjaGVkLiBJZiB0aGUgdGFzayBpcyBub3QgY29tcGxldGUsIHBsZWFzZSB0cnkgcmVwaHJhc2luZyBvciBicmVha2luZyBpdCBkb3duLlwiLCB0aW1lc3RhbXA6IG1heFR1cm5zTXNnVGltZXN0YW1wIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgaG1hUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIucmVnaXN0ZXJITUFSZXNvbHZlcihtYXhUdXJuc01zZy50aW1lc3RhbXAuZ2V0VGltZSgpLCByZXNvbHZlLCByZWplY3QpO1xyXG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtpZih0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuaGFzKG1heFR1cm5zTXNnLnRpbWVzdGFtcC5nZXRUaW1lKCkpKSB7dGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIucmVqZWN0QW5kQ2xlYXJITUFSZXNvbHZlcihtYXhUdXJuc01zZy50aW1lc3RhbXAuZ2V0VGltZSgpLCBcIkhNQSB0aW1lb3V0IGZvciBtYXggdHVybnMgbXNnXCIpO319LCAxMDAwMCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdFBheWxvYWQobWF4VHVybnNNc2csIHRydWUpO1xyXG4gICAgICAgIHRyeSB7IGF3YWl0IGhtYVByb21pc2U7IH0gY2F0Y2goZV9obWEpeyB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtPbGxhbWFWaWV3XVtzZW5kTWVzc2FnZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIEhNQSBlcnJvci90aW1lb3V0IGZvciBtYXggdHVybnMgc3lzdGVtIG1lc3NhZ2VgLCBlX2htYSk7IH1cclxuICAgICAgfVxyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKGBbT2xsYW1hVmlld11bc2VuZE1lc3NhZ2UgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBDQVRDSCAoT3V0ZXIpOiAke2Vycm9yLm1lc3NhZ2V9YCwgZXJyb3IpO1xyXG5cclxuICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgJiZcclxuICAgICAgICAgICh0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLnRpbWVzdGFtcCA9PT0gbGxtUmVzcG9uc2VTdGFydFRpbWVNcyB8fFxyXG4gICAgICAgICAgIChjdXJyZW50VHVybkxsbVJlc3BvbnNlVHNGb3JDYXRjaCAhPT0gbnVsbCAmJiB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLnRpbWVzdGFtcCA9PT0gY3VycmVudFR1cm5MbG1SZXNwb25zZVRzRm9yQ2F0Y2gpXHJcbiAgICAgICAgICApICYmIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5jbGFzc0xpc3QuY29udGFpbnMoXCJwbGFjZWhvbGRlclwiKSkge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW09sbGFtYVZpZXddW3NlbmRNZXNzYWdlIGlkOiR7cmVxdWVzdFRpbWVzdGFtcElkfV0gQ0FUQ0g6IFJlbW92aW5nIGFjdGl2ZSBwbGFjZWhvbGRlciAodHM6ICR7dGhpcy5hY3RpdmVQbGFjZWhvbGRlci50aW1lc3RhbXB9KSBkdWUgdG8gZXJyb3IuYCk7XHJcbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5pc0Nvbm5lY3RlZCkgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLnJlbW92ZSgpO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgPSBudWxsOyAvLyDQl9Cw0LLQttC00Lgg0L7Rh9C40YnQsNGU0LzQviDQv9C70LXQudGB0YXQvtC70LTQtdGAINC/0YDQuCDQv9C+0LzQuNC70YbRliDQsiB0cnlcclxuICAgICAgXHJcbiAgICAgIC8vINCe0YfQuNGJ0LDRlNC80L4g0YDQtdC30L7Qu9Cy0LXRgNC4LCDRj9C60ZYg0LzQvtCz0LvQuCDQsdGD0YLQuCDQt9Cw0YDQtdGU0YHRgtGA0L7QstCw0L3RliDRhtC40Lwg0LLQuNC60LvQuNC60L7QvCBzZW5kTWVzc2FnZVxyXG4gICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKHVzZXJNZXNzYWdlVGltZXN0YW1wLmdldFRpbWUoKSwgYE91dGVyIGNhdGNoIGluIHNlbmRNZXNzYWdlIGZvciByZXF1ZXN0ICR7cmVxdWVzdFRpbWVzdGFtcElkfWApO1xyXG4gICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKGxsbVJlc3BvbnNlU3RhcnRUaW1lTXMsIGBPdXRlciBjYXRjaCBpbiBzZW5kTWVzc2FnZSBmb3IgcmVxdWVzdCAke3JlcXVlc3RUaW1lc3RhbXBJZH1gKTtcclxuICAgICAgaWYgKGN1cnJlbnRUdXJuTGxtUmVzcG9uc2VUc0ZvckNhdGNoICE9PSBudWxsKSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKGN1cnJlbnRUdXJuTGxtUmVzcG9uc2VUc0ZvckNhdGNoLCBgT3V0ZXIgY2F0Y2ggaW4gc2VuZE1lc3NhZ2UgZm9yIHJlcXVlc3QgJHtyZXF1ZXN0VGltZXN0YW1wSWR9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxldCBlcnJvck1zZ0ZvckNoYXQ6IHN0cmluZztcclxuICAgICAgbGV0IGVycm9yTXNnUm9sZTogTWVzc2FnZVJvbGUgPSBcImVycm9yXCI7IFxyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ0Fib3J0RXJyb3InIHx8IGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKFwiYWJvcnRlZCBieSB1c2VyXCIpKSB7XHJcbiAgICAgICAgZXJyb3JNc2dGb3JDaGF0ID0gXCJNZXNzYWdlIGdlbmVyYXRpb24gc3RvcHBlZC5cIjtcclxuICAgICAgICBlcnJvck1zZ1JvbGUgPSBcInN5c3RlbVwiO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGVycm9yTXNnRm9yQ2hhdCA9IGBFcnJvcjogJHtlcnJvci5tZXNzYWdlIHx8IFwiVW5rbm93biBlcnJvciBkdXJpbmcgcHJvY2Vzc2luZy5cIn1gO1xyXG4gICAgICAgIG5ldyBOb3RpY2UoZXJyb3JNc2dGb3JDaGF0LCA3MDAwKTtcclxuICAgICAgfVxyXG4gICAgICBjb25zdCBlcnJvckRpc3BsYXlUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpO1xyXG4gICAgICBjb25zdCBlcnJvckRpc3BsYXlNc2c6IE1lc3NhZ2UgPSB7IHJvbGU6IGVycm9yTXNnUm9sZSwgY29udGVudDogZXJyb3JNc2dGb3JDaGF0LCB0aW1lc3RhbXA6IGVycm9yRGlzcGxheVRpbWVzdGFtcCB9O1xyXG4gICAgICBcclxuICAgICAgY29uc3QgaG1hRXJyb3JQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge3RoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnJlZ2lzdGVySE1BUmVzb2x2ZXIoZXJyb3JEaXNwbGF5TXNnLnRpbWVzdGFtcC5nZXRUaW1lKCksIHJlc29sdmUsIHJlamVjdCk7IHNldFRpbWVvdXQoKCkgPT4ge2lmKHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5oYXMoZXJyb3JEaXNwbGF5TXNnLnRpbWVzdGFtcC5nZXRUaW1lKCkpKXt0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5yZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKGVycm9yRGlzcGxheU1zZy50aW1lc3RhbXAuZ2V0VGltZSgpLCBcIkhNQSB0aW1lb3V0IGZvciBlcnJvciBkaXNwbGF5IG1zZ1wiKTt9fSwgMTAwMDApO30pO1xyXG4gICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0UGF5bG9hZChlcnJvckRpc3BsYXlNc2csIHRydWUpO1xyXG4gICAgICB0cnkgeyBhd2FpdCBobWFFcnJvclByb21pc2U7IH0gY2F0Y2goZV9obWEpeyB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtPbGxhbWFWaWV3XVtzZW5kTWVzc2FnZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIEhNQSBlcnJvci90aW1lb3V0IGZvciBlcnJvciBkaXNwbGF5IG1lc3NhZ2VgLCBlX2htYSk7IH1cclxuXHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtPbGxhbWFWaWV3XVtzZW5kTWVzc2FnZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIEZJTkFMTFkuYCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyDQlNC+0LTQsNGC0LrQvtCy0LUg0L7Rh9C40YnQtdC90L3RjyDQv9C70LXQudGB0YXQvtC70LTQtdGA0LAg0L/RgNC+INCy0YHRj9C6INCy0LjQv9Cw0LTQvtC6XHJcbiAgICAgIGlmICh0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyICYmIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5jbGFzc0xpc3QuY29udGFpbnMoXCJwbGFjZWhvbGRlclwiKSkge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbT2xsYW1hVmlld11bc2VuZE1lc3NhZ2UgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBGSU5BTExZOiBBY3RpdmUgcGxhY2Vob2xkZXIgKHRzOiAke3RoaXMuYWN0aXZlUGxhY2Vob2xkZXIudGltZXN0YW1wfSkgaXMgc3RpbGwgYSBwbGFjZWhvbGRlci4gUmVtb3Zpbmcgbm93LmApO1xyXG4gICAgICAgIGlmICh0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmdyb3VwRWwuaXNDb25uZWN0ZWQpIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5yZW1vdmUoKTtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDtcclxuXHJcbiAgICAgIHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlciA9IG51bGw7XHJcbiAgICAgIC8vIGlzUmVnZW5lcmF0aW5nINC80LDRlCDRgdC60LjQtNCw0YLQuNGB0Y8g0LLRltC00L/QvtCy0ZbQtNC90LjQvCDQvNC10YLQvtC00L7QvCAoaGFuZGxlUmVnZW5lcmF0ZUNsaWNrKSwg0LAg0L3QtSDRgtGD0YJcclxuICAgICAgdGhpcy5zZXRMb2FkaW5nU3RhdGUoZmFsc2UpO1xyXG4gICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gdGhpcy51cGRhdGVTZW5kQnV0dG9uU3RhdGUoKSk7XHJcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5pbmZvKGBbT2xsYW1hVmlld11bc2VuZE1lc3NhZ2UgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBGSU5BTExZIChFTkQpLiBDaGF0IGludGVyYWN0aW9uIGZpbmlzaGVkLmApO1xyXG4gICAgICB0aGlzLmZvY3VzSW5wdXQoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG5cclxuICAvLyDQlNC+0L/QvtC80ZbQttC90LAg0YTRg9C90LrRhtGW0Y8g0LIgQ2hhdE1hbmFnZXIg0LTQu9GPINC00L7QtNCw0LLQsNC90L3RjyDQv9C+0LLRltC00L7QvNC70LXQvdC90Y8g0Lcg0YPRgdGW0LzQsCDQv9C+0LvRj9C80LggKNGJ0L7QsSDRg9C90LjQutC90YPRgtC4INC00YPQsdC70Y7QstCw0L3QvdGPINC70L7Qs9GW0LrQuClcclxuICAvLyDQn9GA0LjQutC70LDQtCwg0Y/QuiDRhtC1INC80L7QttC1INCy0LjQs9C70Y/QtNCw0YLQuDpcclxuICAvLyBhc3luYyBhZGRNZXNzYWdlVG9BY3RpdmVDaGF0UGF5bG9hZChtZXNzYWdlUGF5bG9hZDogTWVzc2FnZSwgZW1pdEV2ZW50OiBib29sZWFuID0gdHJ1ZSk6IFByb21pc2U8dm9pZD4ge1xyXG4gIC8vICAgIC8vIC4uLiDQu9C+0LPRltC60LAg0LTQvtC00LDQstCw0L3QvdGPIG1lc3NhZ2VQYXlsb2FkINC00L4g0LDQutGC0LjQstC90L7Qs9C+INGH0LDRgtGDIC4uLlxyXG4gIC8vICAgIC8vIC4uLiDQt9Cx0LXRgNC10LbQtdC90L3RjyDRh9Cw0YLRgyAuLi5cclxuICAvLyAgICBpZiAoZW1pdEV2ZW50KSB7XHJcbiAgLy8gICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJtZXNzYWdlLWFkZGVkXCIsIHsgY2hhdElkOiB0aGlzLmFjdGl2ZUNoYXRJZCwgbWVzc2FnZTogbWVzc2FnZVBheWxvYWQgfSk7XHJcbiAgLy8gICAgfVxyXG4gIC8vIH1cclxuICAvLyDQkCDQstCw0Ygg0ZbRgdC90YPRjtGH0LjQuSBhZGRNZXNzYWdlVG9BY3RpdmVDaGF0INC80L7QttC1INCy0LjQutC70LjQutCw0YLQuCDRhtC10Lkg0L3QvtCy0LjQuSDQvNC10YLQvtC0LlxyXG4gIC8vIGFzeW5jIGFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXQocm9sZTogTWVzc2FnZVJvbGUsIGNvbnRlbnQ6IHN0cmluZywgdGltZXN0YW1wOiBEYXRlLCBlbWl0RXZlbnQ6IGJvb2xlYW4gPSB0cnVlLCB0b29sX2NhbGxzPzogVG9vbENhbGxbXSwgdG9vbF9jYWxsX2lkPzogc3RyaW5nLCBuYW1lPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgLy8gICBjb25zdCBtZXNzYWdlOiBNZXNzYWdlID0geyByb2xlLCBjb250ZW50LCB0aW1lc3RhbXAsIHRvb2xfY2FsbHMsIHRvb2xfY2FsbF9pZCwgbmFtZSB9O1xyXG4gIC8vICAgYXdhaXQgdGhpcy5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0UGF5bG9hZChtZXNzYWdlLCBlbWl0RXZlbnQpO1xyXG4gIC8vIH1cclxuXHJcbiAgLy8g0J/QtdGA0LXQutC+0L3QsNC50YLQtdGB0Y8sINGJ0L4g0YMg0LLQsNGBINGUINC80LXRgtC+0LQgZ2V0QWN0aXZlQ2hhdE9yRmFpbCDQsiBDaGF0TWFuYWdlciDQsNCx0L4g0LfQsNC80ZbQvdGW0YLRjCDQudC+0LPQviDQvdCwIGdldEFjdGl2ZUNoYXQg0ZYg0L/QtdGA0LXQstGW0YDRj9C50YLQtSDQvdCwIG51bGxcclxuICAvLyBwdWJsaWMgYXN5bmMgZ2V0QWN0aXZlQ2hhdE9yRmFpbCgpOiBQcm9taXNlPENoYXQ+IHtcclxuICAvLyAgIGNvbnN0IGNoYXQgPSBhd2FpdCB0aGlzLmdldEFjdGl2ZUNoYXQoKTtcclxuICAvLyAgIGlmICghY2hhdCkge1xyXG4gIC8vICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbQ2hhdE1hbmFnZXJdIGdldEFjdGl2ZUNoYXRPckZhaWw6IE5vIGFjdGl2ZSBjaGF0IGZvdW5kIVwiKTtcclxuICAvLyAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gYWN0aXZlIGNoYXQgZm91bmRcIik7XHJcbiAgLy8gICB9XHJcbiAgLy8gICByZXR1cm4gY2hhdDtcclxuICAvLyB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlTWVudUJ1dHRvbkNsaWNrID0gKGU6IE1vdXNlRXZlbnQpOiB2b2lkID0+IHtcclxuICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlcj8udG9nZ2xlTWVudShlKTtcclxuICB9O1xyXG5cclxuICAvLyAtLS0g0JTQntCU0JDQndCeOiDQnNC10YLQvtC00Lgg0LTQu9GPINC/0LXRgNC10YLRj9Cz0YPQstCw0L3QvdGPIC0tLVxyXG4gIHByaXZhdGUgb25EcmFnU3RhcnQgPSAoZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkID0+IHtcclxuICAgIGlmIChldmVudC5idXR0b24gIT09IDApIHJldHVybjsgLy8g0KDQtdCw0LPRg9GU0LzQviDRgtGW0LvRjNC60Lgg0L3QsCDQu9GW0LLRgyDQutC90L7Qv9C60YNcclxuXHJcbiAgICB0aGlzLmlzUmVzaXppbmcgPSB0cnVlO1xyXG4gICAgdGhpcy5pbml0aWFsTW91c2VYID0gZXZlbnQuY2xpZW50WDtcclxuICAgIC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4g0L3QsNGP0LLQvdGW0YHRgtGMIHNpZGViYXJSb290RWwg0L/QtdGA0LXQtCDQtNC+0YHRgtGD0L/QvtC8INC00L4gb2Zmc2V0V2lkdGhcclxuICAgIHRoaXMuaW5pdGlhbFNpZGViYXJXaWR0aCA9IHRoaXMuc2lkZWJhclJvb3RFbD8ub2Zmc2V0V2lkdGggfHwgMjUwOyAvLyDQl9Cw0L/QsNGB0L3QtSDQt9C90LDRh9C10L3QvdGPXHJcblxyXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG5cclxuICAgIC8vINCU0L7QtNCw0ZTQvNC+INCz0LvQvtCx0LDQu9GM0L3RliDRgdC70YPRhdCw0YfRliDQlNCe0JrQo9Cc0JXQndCi0JBcclxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgdGhpcy5ib3VuZE9uRHJhZ01vdmUsIHsgY2FwdHVyZTogdHJ1ZSB9KTsgLy8g0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviBjYXB0dXJlXHJcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2V1cFwiLCB0aGlzLmJvdW5kT25EcmFnRW5kLCB7IGNhcHR1cmU6IHRydWUgfSk7XHJcblxyXG4gICAgZG9jdW1lbnQuYm9keS5zdHlsZS5jdXJzb3IgPSBcImV3LXJlc2l6ZVwiO1xyXG4gICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKENTU19DTEFTU19SRVNJWklORyk7XHJcbiAgfTtcclxuXHJcbiAgcHJpdmF0ZSBvbkRyYWdNb3ZlID0gKGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCA9PiB7XHJcbiAgICBpZiAoIXRoaXMuaXNSZXNpemluZyB8fCAhdGhpcy5zaWRlYmFyUm9vdEVsKSByZXR1cm47XHJcblxyXG4gICAgLy8g0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviByZXF1ZXN0QW5pbWF0aW9uRnJhbWUg0LTQu9GPINC/0LvQsNCy0L3QvtGB0YLRllxyXG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcclxuICAgICAgLy8g0JTQvtC00LDRgtC60L7QstCwINC/0LXRgNC10LLRltGA0LrQsCDQstGB0LXRgNC10LTQuNC90ZYgckFGLCDQvtGB0LrRltC70YzQutC4INGB0YLQsNC9INC80ZbQsyDQt9C80ZbQvdC40YLQuNGB0Y9cclxuICAgICAgaWYgKCF0aGlzLmlzUmVzaXppbmcgfHwgIXRoaXMuc2lkZWJhclJvb3RFbCkgcmV0dXJuO1xyXG5cclxuICAgICAgY29uc3QgY3VycmVudE1vdXNlWCA9IGV2ZW50LmNsaWVudFg7XHJcbiAgICAgIGNvbnN0IGRlbHRhWCA9IGN1cnJlbnRNb3VzZVggLSB0aGlzLmluaXRpYWxNb3VzZVg7XHJcbiAgICAgIGxldCBuZXdXaWR0aCA9IHRoaXMuaW5pdGlhbFNpZGViYXJXaWR0aCArIGRlbHRhWDtcclxuXHJcbiAgICAgIC8vINCe0LHQvNC10LbQtdC90L3RjyDRiNC40YDQuNC90LhcclxuICAgICAgY29uc3QgbWluV2lkdGggPSAxNTA7IC8vINCc0ZbQvdGW0LzQsNC70YzQvdCwINGI0LjRgNC40L3QsFxyXG4gICAgICBjb25zdCBjb250YWluZXJXaWR0aCA9IHRoaXMuY29udGVudEVsLm9mZnNldFdpZHRoO1xyXG4gICAgICAvLyDQnNCw0LrRgdC40LzQsNC70YzQvdCwINGI0LjRgNC40L3QsCAtIDYwJSDQutC+0L3RgtC10LnQvdC10YDQsCwg0LDQu9C1INC90LUg0LzQtdC90YjQtSDQvdGW0LYgbWluV2lkdGggKyA1MHB4XHJcbiAgICAgIGNvbnN0IG1heFdpZHRoID0gTWF0aC5tYXgobWluV2lkdGggKyA1MCwgY29udGFpbmVyV2lkdGggKiAwLjYpO1xyXG5cclxuICAgICAgaWYgKG5ld1dpZHRoIDwgbWluV2lkdGgpIG5ld1dpZHRoID0gbWluV2lkdGg7XHJcbiAgICAgIGlmIChuZXdXaWR0aCA+IG1heFdpZHRoKSBuZXdXaWR0aCA9IG1heFdpZHRoO1xyXG5cclxuICAgICAgLy8g0JfQsNGB0YLQvtGB0L7QstGD0ZTQvNC+INGB0YLQuNC70ZYg0L3QsNC/0YDRj9C80YNcclxuICAgICAgdGhpcy5zaWRlYmFyUm9vdEVsLnN0eWxlLndpZHRoID0gYCR7bmV3V2lkdGh9cHhgO1xyXG4gICAgICB0aGlzLnNpZGViYXJSb290RWwuc3R5bGUubWluV2lkdGggPSBgJHtuZXdXaWR0aH1weGA7IC8vINCS0LDQttC70LjQstC+INC00LvRjyBmbGV4LXNocmlua1xyXG5cclxuICAgICAgLy8g0J7QvdC+0LLQu9C10L3QvdGPIENTUyDQt9C80ZbQvdC90L7RlyAo0L7Qv9GG0ZbQvtC90LDQu9GM0L3Qviwg0Y/QutGJ0L4g0LLQuCDRl9GXINCy0LjQutC+0YDQuNGB0YLQvtCy0YPRlNGC0LUg0LTQu9GPINGI0LjRgNC40L3QuClcclxuICAgICAgLy8gdGhpcy5jb250ZW50RWwuc3R5bGUuc2V0UHJvcGVydHkoJy0tYWktZm9yZ2Utc2lkZWJhci13aWR0aCcsIGAke25ld1dpZHRofXB4YCk7XHJcbiAgICB9KTtcclxuICB9O1xyXG5cclxuICBwcml2YXRlIG9uRHJhZ0VuZCA9IChldmVudDogTW91c2VFdmVudCk6IHZvaWQgPT4ge1xyXG4gICAgLy8g0J/QtdGA0LXQstGW0YDRj9GU0LzQviwg0YfQuCDQvNC4INC00ZbQudGB0L3QviDQv9C10YDQtdGC0Y/Qs9GD0LLQsNC70LhcclxuICAgIGlmICghdGhpcy5pc1Jlc2l6aW5nKSByZXR1cm47XHJcblxyXG4gICAgdGhpcy5pc1Jlc2l6aW5nID0gZmFsc2U7XHJcblxyXG4gICAgLy8g0JLQuNC00LDQu9GP0ZTQvNC+INCz0LvQvtCx0LDQu9GM0L3RliDRgdC70YPRhdCw0YfRliDQtyDQtNC+0LrRg9C80LXQvdGC0LBcclxuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgdGhpcy5ib3VuZE9uRHJhZ01vdmUsIHsgY2FwdHVyZTogdHJ1ZSB9KTtcclxuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIHRoaXMuYm91bmRPbkRyYWdFbmQsIHsgY2FwdHVyZTogdHJ1ZSB9KTtcclxuICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuY3Vyc29yID0gXCJcIjsgLy8g0J/QvtCy0LXRgNGC0LDRlNC80L4g0LrRg9GA0YHQvtGAXHJcbiAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTX1JFU0laSU5HKTtcclxuXHJcbiAgICB0aGlzLnNhdmVXaWR0aERlYm91bmNlZCgpO1xyXG4gIH07XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlTWVzc2FnZUFkZGVkKGRhdGE6IHsgY2hhdElkOiBzdHJpbmc7IG1lc3NhZ2U6IE1lc3NhZ2UgfSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgbWVzc2FnZUZvckxvZyA9IGRhdGE/Lm1lc3NhZ2U7XHJcbiAgICBjb25zdCBtZXNzYWdlVGltZXN0YW1wRm9yTG9nID0gbWVzc2FnZUZvckxvZz8udGltZXN0YW1wPy5nZXRUaW1lKCk7XHJcbiAgICBjb25zdCBtZXNzYWdlUm9sZUZvckxvZyA9IG1lc3NhZ2VGb3JMb2c/LnJvbGUgYXMgTWVzc2FnZVJvbGU7IFxyXG4gICAgY29uc3QgaG1hRW50cnlJZCA9IERhdGUubm93KCk7IFxyXG5cclxuICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyggXHJcbiAgICAgICAgYFtITUEgU1VQRVItRU5UUlkgJHtobWFFbnRyeUlkfSBpZDoke21lc3NhZ2VUaW1lc3RhbXBGb3JMb2d9XSBSb2xlOiAke21lc3NhZ2VSb2xlRm9yTG9nfS4gQWN0aXZlIHBsYWNlaG9sZGVyIHRzOiAke3RoaXMuYWN0aXZlUGxhY2Vob2xkZXI/LnRpbWVzdGFtcH1gXHJcbiAgICApO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgaWYgKCFkYXRhIHx8ICFkYXRhLm1lc3NhZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKGBbSE1BICR7aG1hRW50cnlJZH0gaWQ6JHttZXNzYWdlVGltZXN0YW1wRm9yTG9nfV0gRVhJVCAoRWFybHkpOiBJbnZhbGlkIGRhdGEgcmVjZWl2ZWQuIERhdGE6YCwgZGF0YSk7XHJcbiAgICAgICAgICAgIGlmIChtZXNzYWdlVGltZXN0YW1wRm9yTG9nKSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5pbnZva2VITUFSZXNvbHZlcihtZXNzYWdlVGltZXN0YW1wRm9yTG9nKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgeyBjaGF0SWQ6IGV2ZW50Q2hhdElkLCBtZXNzYWdlIH0gPSBkYXRhO1xyXG4gICAgICAgIGNvbnN0IG1lc3NhZ2VUaW1lc3RhbXBNcyA9IG1lc3NhZ2UudGltZXN0YW1wLmdldFRpbWUoKTtcclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLmNoYXRDb250YWluZXIgfHwgIXRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihgW0hNQSAke2htYUVudHJ5SWR9IGlkOiR7bWVzc2FnZVRpbWVzdGFtcE1zfV0gRVhJVCAoRWFybHkpOiBDUklUSUNBTCBDb250ZXh0IG1pc3NpbmchYCk7XHJcbiAgICAgICAgICAgIGlmIChtZXNzYWdlVGltZXN0YW1wRm9yTG9nKSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5pbnZva2VITUFSZXNvbHZlcihtZXNzYWdlVGltZXN0YW1wRm9yTG9nKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgYWN0aXZlQ2hhdElkID0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0QWN0aXZlQ2hhdElkKCk7XHJcbiAgICAgICAgaWYgKGV2ZW50Q2hhdElkICE9PSBhY3RpdmVDaGF0SWQpIHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbSE1BICR7aG1hRW50cnlJZH0gaWQ6JHttZXNzYWdlVGltZXN0YW1wTXN9XSBFWElUIChFYXJseSk6IEV2ZW50IGZvciBub24tYWN0aXZlIGNoYXQgJHtldmVudENoYXRJZH0uYCk7XHJcbiAgICAgICAgICAgIGlmIChtZXNzYWdlVGltZXN0YW1wRm9yTG9nKSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5pbnZva2VITUFSZXNvbHZlcihtZXNzYWdlVGltZXN0YW1wRm9yTG9nKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZXhpc3RpbmdSZW5kZXJlZE1lc3NhZ2UgPSB0aGlzLmNoYXRDb250YWluZXIucXVlcnlTZWxlY3RvcihgLiR7Q1NTX0NMQVNTRVMuTUVTU0FHRV9HUk9VUH06bm90KC5wbGFjZWhvbGRlcilbZGF0YS10aW1lc3RhbXA9XCIke21lc3NhZ2VUaW1lc3RhbXBNc31cIl1gKTtcclxuICAgICAgICBpZiAoZXhpc3RpbmdSZW5kZXJlZE1lc3NhZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oYFtITUEgJHtobWFFbnRyeUlkfSBpZDoke21lc3NhZ2VUaW1lc3RhbXBNc31dIEVYSVQgKEVhcmx5KTogTWVzc2FnZSAocm9sZTogJHttZXNzYWdlLnJvbGV9KSBhbHJlYWR5IHJlbmRlcmVkLmApO1xyXG4gICAgICAgICAgICBpZiAobWVzc2FnZVRpbWVzdGFtcEZvckxvZykgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuaW52b2tlSE1BUmVzb2x2ZXIobWVzc2FnZVRpbWVzdGFtcEZvckxvZyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGFscmVhZHlJbkxvZ2ljQ2FjaGUgPSB0aGlzLmN1cnJlbnRNZXNzYWdlcy5zb21lKFxyXG4gICAgICAgICAgICBtID0+IG0udGltZXN0YW1wLmdldFRpbWUoKSA9PT0gbWVzc2FnZVRpbWVzdGFtcE1zICYmIG0ucm9sZSA9PT0gbWVzc2FnZS5yb2xlICYmIG0uY29udGVudCA9PT0gbWVzc2FnZS5jb250ZW50XHJcbiAgICAgICAgKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBpc1BvdGVudGlhbGx5QXNzaXN0YW50Rm9yUGxhY2Vob2xkZXIgPVxyXG4gICAgICAgICAgICBtZXNzYWdlLnJvbGUgPT09ICdhc3Npc3RhbnQnICYmXHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXI/LnRpbWVzdGFtcCA9PT0gbWVzc2FnZVRpbWVzdGFtcE1zO1xyXG5cclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtITUEgJHtobWFFbnRyeUlkfSBpZDoke21lc3NhZ2VUaW1lc3RhbXBNc31dIENhY2hlL1BsYWNlaG9sZGVyIGNoZWNrczogYWxyZWFkeUluTG9naWNDYWNoZT0ke2FscmVhZHlJbkxvZ2ljQ2FjaGV9LCBpc1BvdGVudGlhbGx5QXNzaXN0YW50Rm9yUGxhY2Vob2xkZXI9JHtpc1BvdGVudGlhbGx5QXNzaXN0YW50Rm9yUGxhY2Vob2xkZXJ9LmApO1xyXG5cclxuICAgICAgICBpZiAoYWxyZWFkeUluTG9naWNDYWNoZSAmJiAhaXNQb3RlbnRpYWxseUFzc2lzdGFudEZvclBsYWNlaG9sZGVyKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbSE1BICR7aG1hRW50cnlJZH0gaWQ6JHttZXNzYWdlVGltZXN0YW1wTXN9XSBFWElUIChFYXJseSk6IE1lc3NhZ2UgaW4gY2FjaGUgYW5kIE5PVCBmb3IgcGxhY2Vob2xkZXIuIFJvbGU6ICR7bWVzc2FnZS5yb2xlfS5gKTtcclxuICAgICAgICAgICAgaWYgKG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cpIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmludm9rZUhNQVJlc29sdmVyKG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChhbHJlYWR5SW5Mb2dpY0NhY2hlICYmIGlzUG90ZW50aWFsbHlBc3Npc3RhbnRGb3JQbGFjZWhvbGRlcikge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuaW5mbyhgW0hNQSAke2htYUVudHJ5SWR9IGlkOiR7bWVzc2FnZVRpbWVzdGFtcE1zfV0gTWVzc2FnZSBpbiBjYWNoZSwgQlVUIElTIGZvciBwbGFjZWhvbGRlci4gUHJvY2VlZGluZy5gKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghYWxyZWFkeUluTG9naWNDYWNoZSkge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRNZXNzYWdlcy5wdXNoKG1lc3NhZ2UpO1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtITUEgJHtobWFFbnRyeUlkfSBpZDoke21lc3NhZ2VUaW1lc3RhbXBNc31dIE1lc3NhZ2UgKHJvbGUgJHttZXNzYWdlLnJvbGV9KSBQVVNIRUQgdG8gY3VycmVudE1lc3NhZ2VzLiBOZXcgY291bnQ6ICR7dGhpcy5jdXJyZW50TWVzc2FnZXMubGVuZ3RofWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbSE1BICR7aG1hRW50cnlJZH0gaWQ6JHttZXNzYWdlVGltZXN0YW1wTXN9XSBQYXNzZWQgaW5pdGlhbCBjaGVja3MuIFJvbGU6ICR7bWVzc2FnZS5yb2xlfS4gQWN0aXZlIHBsYWNlaG9sZGVyIHRzOiAke3RoaXMuYWN0aXZlUGxhY2Vob2xkZXI/LnRpbWVzdGFtcH1gKTtcclxuXHJcbiAgICAgICAgaWYgKGlzUG90ZW50aWFsbHlBc3Npc3RhbnRGb3JQbGFjZWhvbGRlciAmJiB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5pbmZvKFxyXG4gICAgICAgICAgICAgICAgYFtITUEgJHtobWFFbnRyeUlkfSBpZDoke21lc3NhZ2VUaW1lc3RhbXBNc31dIEFzc2lzdGFudCBtZXNzYWdlICh0czogJHttZXNzYWdlVGltZXN0YW1wTXN9KSBNQVRDSEVTIGFjdGl2ZSBwbGFjZWhvbGRlciAodHM6ICR7dGhpcy5hY3RpdmVQbGFjZWhvbGRlci50aW1lc3RhbXB9KS4gVXBkYXRpbmcgcGxhY2Vob2xkZXIuYFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBjb25zdCBwbGFjZWhvbGRlclRvVXBkYXRlID0gdGhpcy5hY3RpdmVQbGFjZWhvbGRlcjtcclxuXHJcbiAgICAgICAgICAgIGlmICggcGxhY2Vob2xkZXJUb1VwZGF0ZS5ncm91cEVsPy5pc0Nvbm5lY3RlZCAmJiBwbGFjZWhvbGRlclRvVXBkYXRlLmNvbnRlbnRFbCAmJiBwbGFjZWhvbGRlclRvVXBkYXRlLm1lc3NhZ2VXcmFwcGVyICkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbSE1BICR7aG1hRW50cnlJZH0gaWQ6JHttZXNzYWdlVGltZXN0YW1wTXN9XSBQbGFjZWhvbGRlciBET00gZWxlbWVudHMgYXJlIHZhbGlkIGZvciB1cGRhdGUuYCk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyVG9VcGRhdGUuZ3JvdXBFbC5jbGFzc0xpc3QucmVtb3ZlKFwicGxhY2Vob2xkZXJcIik7XHJcbiAgICAgICAgICAgICAgICBwbGFjZWhvbGRlclRvVXBkYXRlLmdyb3VwRWwucmVtb3ZlQXR0cmlidXRlKFwiZGF0YS1wbGFjZWhvbGRlci10aW1lc3RhbXBcIik7XHJcbiAgICAgICAgICAgICAgICBwbGFjZWhvbGRlclRvVXBkYXRlLmdyb3VwRWwuc2V0QXR0cmlidXRlKFwiZGF0YS10aW1lc3RhbXBcIiwgbWVzc2FnZVRpbWVzdGFtcE1zLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBjb25zdCBtZXNzYWdlRG9tRWxlbWVudCA9IHBsYWNlaG9sZGVyVG9VcGRhdGUuZ3JvdXBFbC5xdWVyeVNlbGVjdG9yKGAuJHtDU1NfQ0xBU1NFUy5NRVNTQUdFfWApIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoIW1lc3NhZ2VEb21FbGVtZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKGBbSE1BICR7aG1hRW50cnlJZH0gaWQ6JHttZXNzYWdlVGltZXN0YW1wTXN9XSBDUklUSUNBTDogLm1lc3NhZ2UgZWxlbWVudCBOT1QgRk9VTkQgaW4gcGxhY2Vob2xkZXIuIFJlbW92aW5nIHBsYWNlaG9sZGVyIGFuZCBhZGRpbmcgbm9ybWFsbHkuYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYocGxhY2Vob2xkZXJUb1VwZGF0ZS5ncm91cEVsLmlzQ29ubmVjdGVkKSBwbGFjZWhvbGRlclRvVXBkYXRlLmdyb3VwRWwucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlciA9IG51bGw7IFxyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYWRkTWVzc2FnZVN0YW5kYXJkKG1lc3NhZ2UpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlclRvVXBkYXRlLmNvbnRlbnRFbC5jbGFzc0xpc3QucmVtb3ZlKFwic3RyZWFtaW5nLXRleHRcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZG90c0VsID0gcGxhY2Vob2xkZXJUb1VwZGF0ZS5jb250ZW50RWwucXVlcnlTZWxlY3RvcihgLiR7Q1NTX0NMQVNTRVMuVEhJTktJTkdfRE9UU31gKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZG90c0VsKSB7IGRvdHNFbC5yZW1vdmUoKTsgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbSE1BICR7aG1hRW50cnlJZH0gaWQ6JHttZXNzYWdlVGltZXN0YW1wTXN9XSBUaGlua2luZyBkb3RzIHJlbW92ZWQuYCk7fVxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlDb250ZW50ID0gQXNzaXN0YW50TWVzc2FnZVJlbmRlcmVyLnByZXBhcmVEaXNwbGF5Q29udGVudChcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UuY29udGVudCB8fCBcIlwiLCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgYXMgQXNzaXN0YW50TWVzc2FnZSwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMgLy8g0J/QtdGA0LXQtNCw0ZTQvNC+INC10LrQt9C10LzQv9C70Y/RgCBPbGxhbWFWaWV3XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW0hNQSAke2htYUVudHJ5SWR9IGlkOiR7bWVzc2FnZVRpbWVzdGFtcE1zfV0gUmVuZGVyaW5nIHByZXBhcmVkIGRpc3BsYXkgY29udGVudCBpbnRvIHBsYWNlaG9sZGVyOiBcIiR7ZGlzcGxheUNvbnRlbnQuc3Vic3RyaW5nKDAsMTAwKX0uLi5cImApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgcGxhY2Vob2xkZXJUb1VwZGF0ZS5jb250ZW50RWwuZW1wdHkoKTsgXHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBSZW5kZXJlclV0aWxzLnJlbmRlck1hcmtkb3duQ29udGVudChcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXBwLCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMsIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlclRvVXBkYXRlLmNvbnRlbnRFbCwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkaXNwbGF5Q29udGVudCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEFzc2lzdGFudE1lc3NhZ2VSZW5kZXJlci5hZGRBc3Npc3RhbnRBY3Rpb25CdXR0b25zKCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VEb21FbGVtZW50LCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyVG9VcGRhdGUuY29udGVudEVsLCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgYXMgQXNzaXN0YW50TWVzc2FnZSwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbiwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBCYXNlTWVzc2FnZVJlbmRlcmVyLmFkZFRpbWVzdGFtcChtZXNzYWdlRG9tRWxlbWVudCwgbWVzc2FnZS50aW1lc3RhbXAsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXN0TWVzc2FnZUVsZW1lbnQgPSBwbGFjZWhvbGRlclRvVXBkYXRlLmdyb3VwRWw7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaGlkZUVtcHR5U3RhdGUoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbmFsTWVzc2FnZUdyb3VwRWxlbWVudCA9IHBsYWNlaG9sZGVyVG9VcGRhdGUuZ3JvdXBFbDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlciA9IG51bGw7IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuaW5mbyhcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGBbSE1BICR7aG1hRW50cnlJZH0gaWQ6JHttZXNzYWdlVGltZXN0YW1wTXN9XSBQbGFjZWhvbGRlciBzdWNjZXNzZnVsbHkgdXBkYXRlZCBhbmQgQ0xFQVJFRC4gUHJldmlldzogXCIke2Rpc3BsYXlDb250ZW50LnN1YnN0cmluZygwLDUwKX0uLi5cImBcclxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoZmluYWxNZXNzYWdlR3JvdXBFbGVtZW50ICYmIGZpbmFsTWVzc2FnZUdyb3VwRWxlbWVudC5pc0Nvbm5lY3RlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW0hNQSBpZDoke21lc3NhZ2VUaW1lc3RhbXBNc31dIENhbGxpbmcgY2hlY2tNZXNzYWdlRm9yQ29sbGFwc2luZyBmb3IgZmluYWxpemVkIGdyb3VwLmApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tNZXNzYWdlRm9yQ29sbGFwc2luZyhmaW5hbE1lc3NhZ2VHcm91cEVsZW1lbnQpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9LCA3MCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKDEwMCwgdHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAocmVuZGVyRXJyb3I6IGFueSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtITUEgJHtobWFFbnRyeUlkfSBpZDoke21lc3NhZ2VUaW1lc3RhbXBNc31dIEVycm9yIGR1cmluZyBwbGFjZWhvbGRlciBmaW5hbCByZW5kZXI6YCwgcmVuZGVyRXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocGxhY2Vob2xkZXJUb1VwZGF0ZS5ncm91cEVsLmlzQ29ubmVjdGVkKSBwbGFjZWhvbGRlclRvVXBkYXRlLmdyb3VwRWwucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZUVycm9yTWVzc2FnZSh7IHJvbGU6IFwiZXJyb3JcIiwgY29udGVudDogYEZhaWxlZCB0byBmaW5hbGl6ZSBkaXNwbGF5IGZvciB0cyAke21lc3NhZ2VUaW1lc3RhbXBNc306ICR7cmVuZGVyRXJyb3IubWVzc2FnZX1gLCB0aW1lc3RhbXA6IG5ldyBEYXRlKCkgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvciggYFtITUEgJHtobWFFbnRyeUlkfSBpZDoke21lc3NhZ2VUaW1lc3RhbXBNc31dIEFjdGl2ZSBwbGFjZWhvbGRlciBtYXRjaGVkLCBidXQgRE9NIGludmFsaWQuIEFkZGluZyB2aWEgYWRkTWVzc2FnZVN0YW5kYXJkLmAgKTtcclxuICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDsgXHJcbiAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hZGRNZXNzYWdlU3RhbmRhcmQobWVzc2FnZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgeyBcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgICAgICAgICAgYFtITUEgJHtobWFFbnRyeUlkfSBpZDoke21lc3NhZ2VUaW1lc3RhbXBNc31dIE5vIG1hdGNoaW5nIHBsYWNlaG9sZGVyIE9SIG5vdCBhc3Npc3RhbnQuIFJvbGU6ICR7bWVzc2FnZS5yb2xlfS4gQWRkaW5nIHZpYSBhZGRNZXNzYWdlU3RhbmRhcmQuYFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFkZE1lc3NhZ2VTdGFuZGFyZChtZXNzYWdlKTsgLy8g0KbQtSDQstC40LrQu9C40YfQtSDQstGW0LTQv9C+0LLRltC00L3QuNC5INGA0LXQvdC00LXRgNC10YAsINCy0LrQu9GO0YfQsNGO0YfQuCBBc3Npc3RhbnRNZXNzYWdlUmVuZGVyZXIucmVuZGVyKClcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbSE1BICR7aG1hRW50cnlJZH0gaWQ6JHttZXNzYWdlVGltZXN0YW1wTXN9XSA8PDwgRU5EIE9GIFRSWSBCTE9DSyA+Pj4gUm9sZTogJHttZXNzYWdlUm9sZUZvckxvZ30uYCk7XHJcbiAgICB9IGNhdGNoIChvdXRlckVycm9yOiBhbnkpIHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtITUEgJHtobWFFbnRyeUlkfSBpZDoke21lc3NhZ2VUaW1lc3RhbXBGb3JMb2d9XSA8PDwgQ0FUQ0ggT1VURVIgRVJST1IgPj4+IFJvbGU6ICR7bWVzc2FnZVJvbGVGb3JMb2d9OmAsIG91dGVyRXJyb3IsIGRhdGEpO1xyXG4gICAgICAgIHRoaXMuaGFuZGxlRXJyb3JNZXNzYWdlKHtcclxuICAgICAgICAgICAgcm9sZTogXCJlcnJvclwiLFxyXG4gICAgICAgICAgICBjb250ZW50OiBgSW50ZXJuYWwgZXJyb3IgaW4gaGFuZGxlTWVzc2FnZUFkZGVkIGZvciAke21lc3NhZ2VSb2xlRm9yTG9nfSBtc2cgKHRzICR7bWVzc2FnZVRpbWVzdGFtcEZvckxvZ30pOiAke291dGVyRXJyb3IubWVzc2FnZX1gLFxyXG4gICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCksXHJcbiAgICAgICAgfSk7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW0hNQSAke2htYUVudHJ5SWR9IGlkOiR7bWVzc2FnZVRpbWVzdGFtcEZvckxvZ31dIDw8PCBGSU5BTExZIFNUQVJUID4+PiBSb2xlOiAke21lc3NhZ2VSb2xlRm9yTG9nfS5gKTtcclxuICAgICAgICBpZiAobWVzc2FnZVRpbWVzdGFtcEZvckxvZykge1xyXG4gICAgICAgICAgICAvLyDQotC10L/QtdGAINCy0LjQutC70LjQutCw0ZTQvNC+IGludm9rZUhNQVJlc29sdmVyINC3IENoYXRNYW5hZ2VyXHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmludm9rZUhNQVJlc29sdmVyKG1lc3NhZ2VUaW1lc3RhbXBGb3JMb2cpOyBcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbSE1BICR7aG1hRW50cnlJZH0gaWQ6JHttZXNzYWdlVGltZXN0YW1wRm9yTG9nfV0gPDw8IEZJTkFMTFkgRU5EID4+PiBSb2xlOiAke21lc3NhZ2VSb2xlRm9yTG9nfS5gKTtcclxuICAgIH1cclxuICB9XHJcblxyXG5cclxuXHJcbiAgLy8gT2xsYW1hVmlldy50c1xyXG5cclxuICBwdWJsaWMgYXN5bmMgaGFuZGxlUmVnZW5lcmF0ZUNsaWNrKHVzZXJNZXNzYWdlOiBNZXNzYWdlKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBpZiAodGhpcy5pc1JlZ2VuZXJhdGluZykge1xyXG4gICAgICBuZXcgTm90aWNlKFwiUmVnZW5lcmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuIFBsZWFzZSB3YWl0LlwiLCAzMDAwKTtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oXCJbUmVnZW5lcmF0ZV0gQXR0ZW1wdGVkIHRvIHN0YXJ0IG5ldyByZWdlbmVyYXRpb24gd2hpbGUgb25lIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlcikge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihcclxuICAgICAgICBcIltSZWdlbmVyYXRlXSBBdHRlbXB0ZWQgdG8gc3RhcnQgcmVnZW5lcmF0aW9uIHdoaWxlIGN1cnJlbnRBYm9ydENvbnRyb2xsZXIgaXMgbm90IG51bGwuIFByZXZpb3VzIG9wZXJhdGlvbiBtaWdodCBiZSBhY3RpdmUuXCJcclxuICAgICAgKTtcclxuICAgICAgbmV3IE5vdGljZShcIlByZXZpb3VzIGdlbmVyYXRpb24gcHJvY2VzcyBpcyBzdGlsbCBhY3RpdmUgb3IgZmluaXNoaW5nLiBQbGVhc2Ugd2FpdC5cIiwgNDAwMCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXI/LmdldEFjdGl2ZUNoYXQoKTtcclxuICAgIGlmICghYWN0aXZlQ2hhdCkge1xyXG4gICAgICBuZXcgTm90aWNlKFwiQ2Fubm90IHJlZ2VuZXJhdGU6IE5vIGFjdGl2ZSBjaGF0IGZvdW5kLlwiKTtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oXCJbUmVnZW5lcmF0ZV0gTm8gYWN0aXZlIGNoYXQgZm91bmQuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBjb25zdCBjaGF0SWQgPSBhY3RpdmVDaGF0Lm1ldGFkYXRhLmlkO1xyXG4gICAgY29uc3QgbWVzc2FnZUluZGV4ID0gYWN0aXZlQ2hhdC5tZXNzYWdlcy5maW5kSW5kZXgoXHJcbiAgICAgIG1zZyA9PiBtc2cudGltZXN0YW1wLmdldFRpbWUoKSA9PT0gdXNlck1lc3NhZ2UudGltZXN0YW1wLmdldFRpbWUoKSAmJiBtc2cucm9sZSA9PT0gdXNlck1lc3NhZ2Uucm9sZVxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAobWVzc2FnZUluZGV4ID09PSAtMSkge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXHJcbiAgICAgICAgXCJbUmVnZW5lcmF0ZV0gQ291bGQgbm90IGZpbmQgdGhlIHVzZXIgbWVzc2FnZSBpbiB0aGUgYWN0aXZlIGNoYXQgaGlzdG9yeSBmb3IgcmVnZW5lcmF0aW9uLlwiLFxyXG4gICAgICAgIHVzZXJNZXNzYWdlXHJcbiAgICAgICk7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJFcnJvcjogQ291bGQgbm90IGZpbmQgdGhlIG1lc3NhZ2UgdG8gcmVnZW5lcmF0ZSBmcm9tLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGhhc01lc3NhZ2VzQWZ0ZXIgPSBhY3RpdmVDaGF0Lm1lc3NhZ2VzLmxlbmd0aCA+IG1lc3NhZ2VJbmRleCArIDE7XHJcblxyXG4gICAgbmV3IENvbmZpcm1Nb2RhbChcclxuICAgICAgdGhpcy5hcHAsXHJcbiAgICAgIFwiQ29uZmlybSBSZWdlbmVyYXRpb25cIixcclxuICAgICAgaGFzTWVzc2FnZXNBZnRlclxyXG4gICAgICAgID8gXCJUaGlzIHdpbGwgZGVsZXRlIGFsbCBtZXNzYWdlcyBhZnRlciB0aGlzIHByb21wdCBhbmQgZ2VuZXJhdGUgYSBuZXcgcmVzcG9uc2UuIENvbnRpbnVlP1wiXHJcbiAgICAgICAgOiBcIkdlbmVyYXRlIGEgbmV3IHJlc3BvbnNlIGZvciB0aGlzIHByb21wdD9cIixcclxuICAgICAgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuaXNSZWdlbmVyYXRpbmcgPSB0cnVlO1xyXG4gICAgICAgIGNvbnN0IHJlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXHJcbiAgICAgICAgICBgW1JlZ2VuZXJhdGUgU1RBUlQgaWQ6JHtyZWdlbmVyYXRpb25SZXF1ZXN0VGltZXN0YW1wfV0gRm9yIHVzZXJNc2cgdHM6ICR7dXNlck1lc3NhZ2UudGltZXN0YW1wLnRvSVNPU3RyaW5nKCl9LiBpc1JlZ2VuZXJhdGluZyBzZXQgdG8gdHJ1ZS5gXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xyXG4gICAgICAgIGxldCBhY2N1bXVsYXRlZFJlc3BvbnNlID0gXCJcIjtcclxuICAgICAgICBjb25zdCByZXNwb25zZVN0YXJ0VGltZSA9IG5ldyBEYXRlKCk7XHJcbiAgICAgICAgY29uc3QgcmVzcG9uc2VTdGFydFRpbWVNcyA9IHJlc3BvbnNlU3RhcnRUaW1lLmdldFRpbWUoKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRMb2FkaW5nU3RhdGUodHJ1ZSk7XHJcblxyXG4gICAgICAgIGxldCBzdHJlYW1FcnJvck9jY3VycmVkOiBFcnJvciB8IG51bGwgPSBudWxsO1xyXG4gICAgICAgIGxldCBtYWluQXNzaXN0YW50TWVzc2FnZVByb2Nlc3NlZFByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXHJcbiAgICAgICAgICAgIGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBTdGFydGluZyBsb2dpYy4gSGFzTWVzc2FnZXNBZnRlcjogJHtoYXNNZXNzYWdlc0FmdGVyfWBcclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgaWYgKGhhc01lc3NhZ2VzQWZ0ZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgZGVsZXRlU3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmRlbGV0ZU1lc3NhZ2VzQWZ0ZXIoY2hhdElkLCBtZXNzYWdlSW5kZXgpO1xyXG4gICAgICAgICAgICBpZiAoIWRlbGV0ZVN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXHJcbiAgICAgICAgICAgICAgICBgW1JlZ2VuZXJhdGUgaWQ6JHtyZWdlbmVyYXRpb25SZXF1ZXN0VGltZXN0YW1wfV0gRmFpbGVkIHRvIGRlbGV0ZSBzdWJzZXF1ZW50IG1lc3NhZ2VzLmBcclxuICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkZhaWxlZCB0byBkZWxldGUgc3Vic2VxdWVudCBtZXNzYWdlcyBmb3IgcmVnZW5lcmF0aW9uLlwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtSZWdlbmVyYXRlIGlkOiR7cmVnZW5lcmF0aW9uUmVxdWVzdFRpbWVzdGFtcH1dIFN1YnNlcXVlbnQgbWVzc2FnZXMgZGVsZXRlZC5gKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBhd2FpdCB0aGlzLmxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdCgpO1xyXG4gICAgICAgICAgdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oNTAsIHRydWUpO1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBDaGF0IHJlbG9hZGVkIGFmdGVyIGRlbGV0aW9ucy5gKTtcclxuXHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXHJcbiAgICAgICAgICAgIGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBDcmVhdGluZyBwbGFjZWhvbGRlciBmb3IgbmV3IGFzc2lzdGFudCByZXNwb25zZSAoZXhwZWN0ZWQgdHM6ICR7cmVzcG9uc2VTdGFydFRpbWVNc30pLmBcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgICBjb25zdCBhc3Npc3RhbnRQbGFjZWhvbGRlckdyb3VwRWwgPSB0aGlzLmNoYXRDb250YWluZXIuY3JlYXRlRGl2KHtcclxuICAgICAgICAgICAgY2xzOiBgJHtDU1NfQ0xBU1NFUy5NRVNTQUdFX0dST1VQfSAke0NTU19DTEFTU0VTLk9MTEFNQV9HUk9VUH0gcGxhY2Vob2xkZXJgLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBhc3Npc3RhbnRQbGFjZWhvbGRlckdyb3VwRWwuc2V0QXR0cmlidXRlKFwiZGF0YS1wbGFjZWhvbGRlci10aW1lc3RhbXBcIiwgcmVzcG9uc2VTdGFydFRpbWVNcy50b1N0cmluZygpKTtcclxuICAgICAgICAgIFJlbmRlcmVyVXRpbHMucmVuZGVyQXZhdGFyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgYXNzaXN0YW50UGxhY2Vob2xkZXJHcm91cEVsLCBmYWxzZSk7XHJcbiAgICAgICAgICBjb25zdCBtZXNzYWdlV3JhcHBlckVsID0gYXNzaXN0YW50UGxhY2Vob2xkZXJHcm91cEVsLmNyZWF0ZURpdih7IGNsczogXCJtZXNzYWdlLXdyYXBwZXJcIiB9KTtcclxuICAgICAgICAgIG1lc3NhZ2VXcmFwcGVyRWwuc3R5bGUub3JkZXIgPSBcIjJcIjtcclxuICAgICAgICAgIGNvbnN0IGFzc2lzdGFudE1lc3NhZ2VFbGVtZW50ID0gbWVzc2FnZVdyYXBwZXJFbC5jcmVhdGVEaXYoe1xyXG4gICAgICAgICAgICBjbHM6IGAke0NTU19DTEFTU0VTLk1FU1NBR0V9ICR7Q1NTX0NMQVNTRVMuT0xMQU1BX01FU1NBR0V9YCxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgY29uc3QgY29udGVudENvbnRhaW5lciA9IGFzc2lzdGFudE1lc3NhZ2VFbGVtZW50LmNyZWF0ZURpdih7IGNsczogQ1NTX0NMQVNTRVMuQ09OVEVOVF9DT05UQUlORVIgfSk7XHJcbiAgICAgICAgICBjb25zdCBhc3Npc3RhbnRDb250ZW50RWwgPSBjb250ZW50Q29udGFpbmVyLmNyZWF0ZURpdih7XHJcbiAgICAgICAgICAgIGNsczogYCR7Q1NTX0NMQVNTRVMuQ09OVEVOVH0gJHtDU1NfQ0xBU1NFUy5DT05URU5UX0NPTExBUFNJQkxFfSBzdHJlYW1pbmctdGV4dGAsXHJcbiAgICAgICAgICB9KTsgLy8g0JTQvtC00LDRlNC80L4gc3RyZWFtaW5nLXRleHRcclxuICAgICAgICAgIGFzc2lzdGFudENvbnRlbnRFbC5lbXB0eSgpO1xyXG4gICAgICAgICAgY29uc3QgZG90cyA9IGFzc2lzdGFudENvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLlRISU5LSU5HX0RPVFMgfSk7XHJcbiAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDM7IGkrKykgZG90cy5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLlRISU5LSU5HX0RPVCB9KTtcclxuXHJcbiAgICAgICAgICBpZiAoYXNzaXN0YW50UGxhY2Vob2xkZXJHcm91cEVsICYmIGFzc2lzdGFudENvbnRlbnRFbCAmJiBtZXNzYWdlV3JhcHBlckVsKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgPSB7XHJcbiAgICAgICAgICAgICAgdGltZXN0YW1wOiByZXNwb25zZVN0YXJ0VGltZU1zLFxyXG4gICAgICAgICAgICAgIGdyb3VwRWw6IGFzc2lzdGFudFBsYWNlaG9sZGVyR3JvdXBFbCxcclxuICAgICAgICAgICAgICBjb250ZW50RWw6IGFzc2lzdGFudENvbnRlbnRFbCxcclxuICAgICAgICAgICAgICBtZXNzYWdlV3JhcHBlcjogbWVzc2FnZVdyYXBwZXJFbCxcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgICAgICAgIGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBQbGFjZWhvbGRlciBjcmVhdGVkLiBhY3RpdmVQbGFjZWhvbGRlci50cyBzZXQgdG86ICR7dGhpcy5hY3RpdmVQbGFjZWhvbGRlci50aW1lc3RhbXB9LmBcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcclxuICAgICAgICAgICAgICBgW1JlZ2VuZXJhdGUgaWQ6JHtyZWdlbmVyYXRpb25SZXF1ZXN0VGltZXN0YW1wfV0gRmFpbGVkIHRvIGNyZWF0ZSBhbGwgcGxhY2Vob2xkZXIgZWxlbWVudHMhYFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJGYWlsZWQgdG8gY3JlYXRlIHBsYWNlaG9sZGVyIGVsZW1lbnRzIGZvciByZWdlbmVyYXRpb24uXCIpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgYXNzaXN0YW50UGxhY2Vob2xkZXJHcm91cEVsLmNsYXNzTGlzdC5hZGQoQ1NTX0NMQVNTRVMuTUVTU0FHRV9BUlJJVklORyk7XHJcbiAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IGFzc2lzdGFudFBsYWNlaG9sZGVyR3JvdXBFbD8uY2xhc3NMaXN0LnJlbW92ZShDU1NfQ0xBU1NFUy5NRVNTQUdFX0FSUklWSU5HKSwgNTAwKTtcclxuICAgICAgICAgIHRoaXMuZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKDUwLCB0cnVlKTtcclxuXHJcbiAgICAgICAgICBjb25zdCBjaGF0Rm9yU3RyZWFtaW5nID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0Q2hhdChjaGF0SWQpO1xyXG4gICAgICAgICAgaWYgKCFjaGF0Rm9yU3RyZWFtaW5nKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihgW1JlZ2VuZXJhdGUgaWQ6JHtyZWdlbmVyYXRpb25SZXF1ZXN0VGltZXN0YW1wfV0gRmFpbGVkIHRvIGdldCBjaGF0Rm9yU3RyZWFtaW5nLmApO1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJGYWlsZWQgdG8gZ2V0IHVwZGF0ZWQgY2hhdCBjb250ZXh0IGZvciBzdHJlYW1pbmcgcmVnZW5lcmF0aW9uLlwiKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXHJcbiAgICAgICAgICAgIGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBTdGFydGluZyBzdHJlYW0uIENvbnRleHQgbWVzc2FnZXM6ICR7Y2hhdEZvclN0cmVhbWluZy5tZXNzYWdlcy5sZW5ndGh9LmBcclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgY29uc3Qgc3RyZWFtID0gdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZS5nZW5lcmF0ZUNoYXRSZXNwb25zZVN0cmVhbShcclxuICAgICAgICAgICAgY2hhdEZvclN0cmVhbWluZyxcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyLnNpZ25hbFxyXG4gICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICBsZXQgZmlyc3RDaHVuayA9IHRydWU7XHJcbiAgICAgICAgICBmb3IgYXdhaXQgKGNvbnN0IGNodW5rIG9mIHN0cmVhbSkge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkKSB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgICAgICAgICAgYFtSZWdlbmVyYXRlIGlkOiR7cmVnZW5lcmF0aW9uUmVxdWVzdFRpbWVzdGFtcH1dIFN0cmVhbSBhYm9ydGVkIGJ5IHVzZXIgZHVyaW5nIGl0ZXJhdGlvbi5gXHJcbiAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhYm9ydGVkIGJ5IHVzZXJcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKFwiZXJyb3JcIiBpbiBjaHVuayAmJiBjaHVuay5lcnJvcikge1xyXG4gICAgICAgICAgICAgIGlmICghY2h1bmsuZXJyb3IuaW5jbHVkZXMoXCJhYm9ydGVkIGJ5IHVzZXJcIikpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcclxuICAgICAgICAgICAgICAgICAgYFtSZWdlbmVyYXRlIGlkOiR7cmVnZW5lcmF0aW9uUmVxdWVzdFRpbWVzdGFtcH1dIFN0cmVhbSBlcnJvcjogJHtjaHVuay5lcnJvcn1gXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGNodW5rLmVycm9yKTtcclxuICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgICAgICAgICAgICBgW1JlZ2VuZXJhdGUgaWQ6JHtyZWdlbmVyYXRpb25SZXF1ZXN0VGltZXN0YW1wfV0gU3RyZWFtIHJlcG9ydGVkICdhYm9ydGVkIGJ5IHVzZXInLmBcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhYm9ydGVkIGJ5IHVzZXJcIik7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChcInJlc3BvbnNlXCIgaW4gY2h1bmsgJiYgY2h1bmsucmVzcG9uc2UpIHtcclxuICAgICAgICAgICAgICBpZiAodGhpcy5hY3RpdmVQbGFjZWhvbGRlcj8udGltZXN0YW1wID09PSByZXNwb25zZVN0YXJ0VGltZU1zICYmIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuY29udGVudEVsKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoZmlyc3RDaHVuaykge1xyXG4gICAgICAgICAgICAgICAgICBjb25zdCB0aGlua2luZ0RvdHMgPSB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yKGAuJHtDU1NfQ0xBU1NFUy5USElOS0lOR19ET1RTfWApO1xyXG4gICAgICAgICAgICAgICAgICBpZiAodGhpbmtpbmdEb3RzKSB0aGlua2luZ0RvdHMucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgICAgICAgIGZpcnN0Q2h1bmsgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGFjY3VtdWxhdGVkUmVzcG9uc2UgKz0gY2h1bmsucmVzcG9uc2U7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBSZW5kZXJlclV0aWxzLnJlbmRlck1hcmtkb3duQ29udGVudChcclxuICAgICAgICAgICAgICAgICAgdGhpcy5hcHAsICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFwcFxyXG4gICAgICAgICAgICAgICAgICB0aGlzLCAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB2aWV3ICjQtdC60LfQtdC80L/Qu9GP0YAgT2xsYW1hVmlldylcclxuICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4sICAgICAgICAgICAgICAgICAgICAgIC8vIHBsdWdpblxyXG4gICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmNvbnRlbnRFbCwgLy8gY29udGFpbmVyRWwgKNC60YPQtNC4INGA0LXQvdC00LXRgNC40YLQuClcclxuICAgICAgICAgICAgICAgICAgYWNjdW11bGF0ZWRSZXNwb25zZSAgICAgICAgICAgICAgIC8vIG1hcmtkb3duVGV4dCAo0YnQviDRgNC10L3QtNC10YDQuNGC0LgpXHJcbiAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKDUwLCB0cnVlKTtcclxuICAgICAgICAgICAgICAgIC8vINCS0JjQlNCQ0JvQldCd0J46IHRoaXMuY2hlY2tNZXNzYWdlRm9yQ29sbGFwc2luZyh0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmdyb3VwRWwpO1xyXG4gICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihcclxuICAgICAgICAgICAgICAgICAgYFtSZWdlbmVyYXRlIGlkOiR7cmVnZW5lcmF0aW9uUmVxdWVzdFRpbWVzdGFtcH1dIGFjdGl2ZVBsYWNlaG9sZGVyIG1pc21hdGNoIGR1cmluZyBzdHJlYW0uIEN1cnJlbnQudHM6ICR7dGhpcy5hY3RpdmVQbGFjZWhvbGRlcj8udGltZXN0YW1wfSwgZXhwZWN0ZWQ6ICR7cmVzcG9uc2VTdGFydFRpbWVNc30uYFxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIGFjY3VtdWxhdGVkUmVzcG9uc2UgKz0gY2h1bmsucmVzcG9uc2U7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChcImRvbmVcIiBpbiBjaHVuayAmJiBjaHVuay5kb25lKSB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgICAgICAgICAgYFtSZWdlbmVyYXRlIGlkOiR7cmVnZW5lcmF0aW9uUmVxdWVzdFRpbWVzdGFtcH1dIFN0cmVhbSBmaW5pc2hlZCAoZG9uZSByZWNlaXZlZCkuYFxyXG4gICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXHJcbiAgICAgICAgICAgIGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBTdHJlYW0gY29tcGxldGVkLiBGaW5hbCByZXNwb25zZSBsZW5ndGg6ICR7YWNjdW11bGF0ZWRSZXNwb25zZS5sZW5ndGh9LiBBY3RpdmUgcGxhY2Vob2xkZXIudHM6ICR7dGhpcy5hY3RpdmVQbGFjZWhvbGRlcj8udGltZXN0YW1wfSAoZXhwZWN0ZWQgJHtyZXNwb25zZVN0YXJ0VGltZU1zfSlgXHJcbiAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgIGlmIChhY2N1bXVsYXRlZFJlc3BvbnNlLnRyaW0oKSkge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXHJcbiAgICAgICAgICAgICAgYFtSZWdlbmVyYXRlIGlkOiR7cmVnZW5lcmF0aW9uUmVxdWVzdFRpbWVzdGFtcH1dIEFkZGluZyBhc3Npc3RhbnQgbWVzc2FnZSB0byBDaGF0TWFuYWdlciAoZXhwZWN0ZWQgdHM6ICR7cmVzcG9uc2VTdGFydFRpbWVNc30pLiBTZXR0aW5nIGVtaXRFdmVudCB0byBUUlVFLmBcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIG1haW5Bc3Npc3RhbnRNZXNzYWdlUHJvY2Vzc2VkUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xyXG4gICAgICAgICAgICAgIHRoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLnNldChyZXNwb25zZVN0YXJ0VGltZU1zLCByZXNvbHZlKTtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXHJcbiAgICAgICAgICAgICAgICBgW1JlZ2VuZXJhdGUgaWQ6JHtyZWdlbmVyYXRpb25SZXF1ZXN0VGltZXN0YW1wfV0gUmVzb2x2ZXIgQURERUQgdG8gbWFwIGZvciB0cyAke3Jlc3BvbnNlU3RhcnRUaW1lTXN9LiBNYXAgc2l6ZTogJHt0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5zaXplfWBcclxuICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXQoXCJhc3Npc3RhbnRcIiwgYWNjdW11bGF0ZWRSZXNwb25zZSwgcmVzcG9uc2VTdGFydFRpbWUsIHRydWUpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgICAgICAgIGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBUUlk6IEF3YWl0aW5nIG1haW5Bc3Npc3RhbnRNZXNzYWdlUHJvY2Vzc2VkUHJvbWlzZSAodmlhIG1hcCkgZm9yIHRzICR7cmVzcG9uc2VTdGFydFRpbWVNc31gXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0aW1lb3V0RHVyYXRpb24gPSAxMDAwMDtcclxuICAgICAgICAgICAgY29uc3QgdGltZW91dFByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigoXywgcmVqZWN0KSA9PlxyXG4gICAgICAgICAgICAgIHNldFRpbWVvdXQoXHJcbiAgICAgICAgICAgICAgICAoKSA9PlxyXG4gICAgICAgICAgICAgICAgICByZWplY3QoXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IEVycm9yKGBUaW1lb3V0ICgke3RpbWVvdXREdXJhdGlvbiAvIDEwMDB9cykgd2FpdGluZyBmb3IgSE1BIGZvciB0cyAke3Jlc3BvbnNlU3RhcnRUaW1lTXN9YClcclxuICAgICAgICAgICAgICAgICAgKSxcclxuICAgICAgICAgICAgICAgIHRpbWVvdXREdXJhdGlvblxyXG4gICAgICAgICAgICAgIClcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICBhd2FpdCBQcm9taXNlLnJhY2UoW21haW5Bc3Npc3RhbnRNZXNzYWdlUHJvY2Vzc2VkUHJvbWlzZSwgdGltZW91dFByb21pc2VdKTtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuaW5mbyhcclxuICAgICAgICAgICAgICAgIGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBUUlk6IG1haW5Bc3Npc3RhbnRNZXNzYWdlUHJvY2Vzc2VkUHJvbWlzZSBmb3IgdHMgJHtyZXNwb25zZVN0YXJ0VGltZU1zfSBSRVNPTFZFRCBvciByYWNlZCBzdWNjZXNzZnVsbHkuYFxyXG4gICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGF3YWl0UHJvbWlzZUVycm9yOiBhbnkpIHtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXHJcbiAgICAgICAgICAgICAgICBgW1JlZ2VuZXJhdGUgaWQ6JHtyZWdlbmVyYXRpb25SZXF1ZXN0VGltZXN0YW1wfV0gVFJZOiBFcnJvciBvciBUaW1lb3V0IGF3YWl0aW5nIG1haW5Bc3Npc3RhbnRNZXNzYWdlUHJvY2Vzc2VkUHJvbWlzZSBmb3IgdHMgJHtyZXNwb25zZVN0YXJ0VGltZU1zfTogJHthd2FpdFByb21pc2VFcnJvci5tZXNzYWdlfWBcclxuICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgIHN0cmVhbUVycm9yT2NjdXJyZWQgPSBzdHJlYW1FcnJvck9jY3VycmVkIHx8IGF3YWl0UHJvbWlzZUVycm9yO1xyXG4gICAgICAgICAgICAgIGlmICh0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5oYXMocmVzcG9uc2VTdGFydFRpbWVNcykpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKFxyXG4gICAgICAgICAgICAgICAgICBgW1JlZ2VuZXJhdGUgaWQ6JHtyZWdlbmVyYXRpb25SZXF1ZXN0VGltZXN0YW1wfV0gVGltZW91dC9FcnJvciBhd2FpdGluZywgcmVtb3ZpbmcgcmVzb2x2ZXIgZnJvbSBtYXAgZm9yIHRzICR7cmVzcG9uc2VTdGFydFRpbWVNc30uYFxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmRlbGV0ZShyZXNwb25zZVN0YXJ0VGltZU1zKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0gZWxzZSBpZiAoIXRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlci5zaWduYWwuYWJvcnRlZCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihcclxuICAgICAgICAgICAgICBgW1JlZ2VuZXJhdGUgaWQ6JHtyZWdlbmVyYXRpb25SZXF1ZXN0VGltZXN0YW1wfV0gQXNzaXN0YW50IHByb3ZpZGVkIGFuIGVtcHR5IHJlc3BvbnNlLCBub3QgZHVlIHRvIGNhbmNlbGxhdGlvbi5gXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyPy50aW1lc3RhbXAgPT09IHJlc3BvbnNlU3RhcnRUaW1lTXMgJiZcclxuICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmdyb3VwRWw/LmlzQ29ubmVjdGVkXHJcbiAgICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcclxuICAgICAgICAgICAgICAgIGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBSZW1vdmluZyBwbGFjZWhvbGRlciBmb3IgdHMgJHtyZXNwb25zZVN0YXJ0VGltZU1zfSBkdWUgdG8gZW1wdHkgcmVzcG9uc2UuYFxyXG4gICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyPy50aW1lc3RhbXAgPT09IHJlc3BvbnNlU3RhcnRUaW1lTXMpIHtcclxuICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXHJcbiAgICAgICAgICAgICAgICBgW1JlZ2VuZXJhdGUgaWQ6JHtyZWdlbmVyYXRpb25SZXF1ZXN0VGltZXN0YW1wfV0gYWN0aXZlUGxhY2Vob2xkZXIgKHRzOiAke3Jlc3BvbnNlU3RhcnRUaW1lTXN9KSBjbGVhcmVkIGR1ZSB0byBlbXB0eSByZXNwb25zZS5gXHJcbiAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0KFxyXG4gICAgICAgICAgICAgIFwic3lzdGVtXCIsXHJcbiAgICAgICAgICAgICAgXCJBc3Npc3RhbnQgcHJvdmlkZWQgYW4gZW1wdHkgcmVzcG9uc2UgZHVyaW5nIHJlZ2VuZXJhdGlvbi5cIixcclxuICAgICAgICAgICAgICBuZXcgRGF0ZSgpLFxyXG4gICAgICAgICAgICAgIHRydWVcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgICAgICBzdHJlYW1FcnJvck9jY3VycmVkID0gZXJyb3I7XHJcbiAgICAgICAgICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtSZWdlbmVyYXRlIGlkOiR7cmVnZW5lcmF0aW9uUmVxdWVzdFRpbWVzdGFtcH1dIENBVENIOiBFcnJvciBkdXJpbmcgcmVnZW5lcmF0aW9uIHByb2Nlc3M6YCwgZXJyb3IpO1xyXG5cclxuICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyPy50aW1lc3RhbXAgPT09IHJlc3BvbnNlU3RhcnRUaW1lTXMpIHtcclxuICAgICAgICAgICAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBDQVRDSDogUmVtb3ZpbmcgYWN0aXZlIHBsYWNlaG9sZGVyICh0czogJHtyZXNwb25zZVN0YXJ0VGltZU1zfSkgZHVlIHRvIGVycm9yLmApO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsPy5pc0Nvbm5lY3RlZCkgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmICh0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5oYXMocmVzcG9uc2VTdGFydFRpbWVNcykpIHtcclxuICAgICAgICAgICAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oYFtSZWdlbmVyYXRlIGlkOiR7cmVnZW5lcmF0aW9uUmVxdWVzdFRpbWVzdGFtcH1dIENBVENIOiBFcnJvciBvY2N1cnJlZCwgcmVtb3ZpbmcgcmVzb2x2ZXIgZnJvbSBtYXAgZm9yIHRzICR7cmVzcG9uc2VTdGFydFRpbWVNc30gaWYgaXQgZXhpc3RzLmApO1xyXG4gICAgICAgICAgICB0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5kZWxldGUocmVzcG9uc2VTdGFydFRpbWVNcyk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgbGV0IGVycm9yTXNnRm9yQ2hhdDogc3RyaW5nID0gXCJBbiB1bmV4cGVjdGVkIGVycm9yIG9jY3VycmVkIGR1cmluZyByZWdlbmVyYXRpb24uXCI7XHJcbiAgICAgICAgICBsZXQgZXJyb3JNc2dSb2xlOiBcInN5c3RlbVwiIHwgXCJlcnJvclwiID0gXCJlcnJvclwiO1xyXG4gICAgICAgICAgbGV0IHNhdmVQYXJ0aWFsUmVzcG9uc2VPbkVycm9yID0gZmFsc2U7XHJcblxyXG4gICAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09IFwiQWJvcnRFcnJvclwiIHx8IGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKFwiYWJvcnRlZCBieSB1c2VyXCIpKSB7XHJcbiAgICAgICAgICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci5pbmZvKGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBDQVRDSDogUmVnZW5lcmF0aW9uIHdhcyBzdG9wcGVkL2Fib3J0ZWQuYCk7XHJcbiAgICAgICAgICAgIGVycm9yTXNnRm9yQ2hhdCA9IFwiUmVnZW5lcmF0aW9uIHN0b3BwZWQuXCI7XHJcbiAgICAgICAgICAgIGVycm9yTXNnUm9sZSA9IFwic3lzdGVtXCI7XHJcbiAgICAgICAgICAgIGlmIChhY2N1bXVsYXRlZFJlc3BvbnNlLnRyaW0oKSkgc2F2ZVBhcnRpYWxSZXNwb25zZU9uRXJyb3IgPSB0cnVlO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZXJyb3JNc2dGb3JDaGF0ID0gYFJlZ2VuZXJhdGlvbiBmYWlsZWQ6ICR7ZXJyb3IubWVzc2FnZSB8fCBcIlVua25vd24gZXJyb3JcIn1gO1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKGVycm9yTXNnRm9yQ2hhdCwgNTAwMCk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBDQVRDSDogQWRkaW5nIGVycm9yL3N5c3RlbSBtZXNzYWdlIHRvIGNoYXQ6IFwiJHtlcnJvck1zZ0ZvckNoYXR9XCJgKTtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXQoZXJyb3JNc2dSb2xlLCBlcnJvck1zZ0ZvckNoYXQsIG5ldyBEYXRlKCksIHRydWUpO1xyXG5cclxuICAgICAgICAgIGlmIChzYXZlUGFydGlhbFJlc3BvbnNlT25FcnJvcikge1xyXG4gICAgICAgICAgICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtSZWdlbmVyYXRlIGlkOiR7cmVnZW5lcmF0aW9uUmVxdWVzdFRpbWVzdGFtcH1dIENBVENIOiBTYXZpbmcgcGFydGlhbCByZXNwb25zZSBhZnRlciBjYW5jZWxsYXRpb24uYCk7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXQoXCJhc3Npc3RhbnRcIiwgYWNjdW11bGF0ZWRSZXNwb25zZSwgcmVzcG9uc2VTdGFydFRpbWUsIHRydWUpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtSZWdlbmVyYXRlIGlkOiR7cmVnZW5lcmF0aW9uUmVxdWVzdFRpbWVzdGFtcH1dIEZJTkFMTFkgKFNUQVJUKS4gQWJvcnRDdHJsOiAke3RoaXMuY3VycmVudEFib3J0Q29udHJvbGxlciA/ICdhY3RpdmUnIDogJ251bGwnfSwgaXNQcm9jZXNzaW5nOiAke3RoaXMuaXNQcm9jZXNzaW5nfSwgYWN0aXZlUGxhY2Vob2xkZXIudHM6ICR7dGhpcy5hY3RpdmVQbGFjZWhvbGRlcj8udGltZXN0YW1wfSwgbWVzc2FnZUFkZGVkUmVzb2x2ZXJzIHNpemU6ICR7dGhpcy5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuc2l6ZX1gKTtcclxuXHJcbiAgICAgICAgICBpZiAodGhpcy5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuaGFzKHJlc3BvbnNlU3RhcnRUaW1lTXMpKSB7XHJcbiAgICAgICAgICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBGSU5BTExZOiBSZXNvbHZlciBmb3IgdHMgJHtyZXNwb25zZVN0YXJ0VGltZU1zfSBzdGlsbCBpbiBtYXAuIFJlbW92aW5nLmApO1xyXG4gICAgICAgICAgICB0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5kZWxldGUocmVzcG9uc2VTdGFydFRpbWVNcyk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXI/LnRpbWVzdGFtcCA9PT0gcmVzcG9uc2VTdGFydFRpbWVNcykge1xyXG4gICAgICAgICAgICAvLyAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oYFtSZWdlbmVyYXRlIGlkOiR7cmVnZW5lcmF0aW9uUmVxdWVzdFRpbWVzdGFtcH1dIEZJTkFMTFk6IEFjdGl2ZSBwbGFjZWhvbGRlciAodHM6ICR7cmVzcG9uc2VTdGFydFRpbWVNc30pIHdhcyBTVElMTCBOT1QgQ0xFQVJFRCBieSBITUEuIFJlbW92aW5nIG5vdy5gKTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbD8uaXNDb25uZWN0ZWQpIHtcclxuICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmdyb3VwRWwucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlciA9IG51bGw7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgY29uc3QgcHJldkFib3J0Q3RybCA9IHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlcjtcclxuICAgICAgICAgIHRoaXMuY3VycmVudEFib3J0Q29udHJvbGxlciA9IG51bGw7XHJcbiAgICAgICAgICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtSZWdlbmVyYXRlIGlkOiR7cmVnZW5lcmF0aW9uUmVxdWVzdFRpbWVzdGFtcH1dIEZJTkFMTFk6IGN1cnJlbnRBYm9ydENvbnRyb2xsZXIgc2V0IHRvIG51bGwuIFdhczogJHtwcmV2QWJvcnRDdHJsID8gJ2FjdGl2ZScgOiAnbnVsbCd9LiBOb3c6ICR7dGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyID8gJ2FjdGl2ZScgOiAnbnVsbCd9YCk7XHJcblxyXG4gICAgICAgICAgY29uc3QgcHJldklzUmVnZW4gPSB0aGlzLmlzUmVnZW5lcmF0aW5nO1xyXG4gICAgICAgICAgdGhpcy5pc1JlZ2VuZXJhdGluZyA9IGZhbHNlO1xyXG4gICAgICAgICAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBGSU5BTExZOiBpc1JlZ2VuZXJhdGluZyBzZXQgdG8gZmFsc2UuIFdhczogJHtwcmV2SXNSZWdlbn0uIE5vdzogJHt0aGlzLmlzUmVnZW5lcmF0aW5nfWApO1xyXG5cclxuICAgICAgICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1JlZ2VuZXJhdGUgaWQ6JHtyZWdlbmVyYXRpb25SZXF1ZXN0VGltZXN0YW1wfV0gRklOQUxMWTogQ2FsbGluZyBzZXRMb2FkaW5nU3RhdGUoZmFsc2UpLmApO1xyXG4gICAgICAgICAgdGhpcy5zZXRMb2FkaW5nU3RhdGUoZmFsc2UpO1xyXG5cclxuICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1JlZ2VuZXJhdGUgaWQ6JHtyZWdlbmVyYXRpb25SZXF1ZXN0VGltZXN0YW1wfV0gRklOQUxMWSAocmVxdWVzdEFuaW1hdGlvbkZyYW1lKTogRm9yY2luZyB1cGRhdGVTZW5kQnV0dG9uU3RhdGUuIEFib3J0Q3RybDogJHt0aGlzLmN1cnJlbnRBYm9ydENvbnRyb2xsZXIgPyAnYWN0aXZlJyA6ICdudWxsJ30sIGlzUHJvY2Vzc2luZzogJHt0aGlzLmlzUHJvY2Vzc2luZ31gKTtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVTZW5kQnV0dG9uU3RhdGUoKTtcclxuICAgICAgICAgICAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbUmVnZW5lcmF0ZSBpZDoke3JlZ2VuZXJhdGlvblJlcXVlc3RUaW1lc3RhbXB9XSBGSU5BTExZIChyZXF1ZXN0QW5pbWF0aW9uRnJhbWUpOiBVSSB1cGRhdGUgYXR0ZW1wdCBmaW5pc2hlZC5gKTtcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1JlZ2VuZXJhdGUgaWQ6JHtyZWdlbmVyYXRpb25SZXF1ZXN0VGltZXN0YW1wfV0gRklOQUxMWSAoRU5EKS5gKTtcclxuICAgICAgICAgIHRoaXMuZm9jdXNJbnB1dCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgKS5vcGVuKCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHNjaGVkdWxlU2lkZWJhckNoYXRMaXN0VXBkYXRlID0gKGRlbGF5OiBudW1iZXIgPSA1MCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuY2hhdExpc3RVcGRhdGVUaW1lb3V0SWQpIHtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuY2hhdExpc3RVcGRhdGVUaW1lb3V0SWQpO1xyXG4gICAgICAvLyDQr9C60YnQviDQstC20LUg0LfQsNC/0LvQsNC90L7QstCw0L3Qviwg0L3QtSDQv9C+0YLRgNGW0LHQvdC+INCy0YHRgtCw0L3QvtCy0LvRjtCy0LDRgtC4IGlzQ2hhdExpc3RVcGRhdGVTY2hlZHVsZWQgPSB0cnVlINC30L3QvtCy0YNcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vINCv0LrRidC+INC90LUg0LHRg9C70L4g0LfQsNC/0LvQsNC90L7QstCw0L3Qviwg0ZYg0YbQtSDQv9C10YDRiNC40Lkg0LfQsNC/0LjRgiDRgyDQv9C+0YLQvtGH0L3RltC5IFwi0L/QsNGH0YbRllwiXHJcbiAgICAgIGlmICh0aGlzLmlzQ2hhdExpc3RVcGRhdGVTY2hlZHVsZWQpIHtcclxuICAgICAgICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbT2xsYW1hVmlldy5zY2hlZHVsZVNpZGViYXJDaGF0TGlzdFVwZGF0ZV0gVXBkYXRlIGFscmVhZHkgc2NoZWR1bGVkIGFuZCBwZW5kaW5nLCBkZWZlcnJpbmcgbmV3IGRpcmVjdCBjYWxsLlwiKTtcclxuICAgICAgICByZXR1cm47IC8vINCv0LrRidC+INCy0LbQtSDRlCDQsNC60YLQuNCy0L3QuNC5IHBlbmRpbmcsINGH0LXQutCw0ZTQvNC+INC50L7Qs9C+INCy0LjQutC+0L3QsNC90L3Rj1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMuaXNDaGF0TGlzdFVwZGF0ZVNjaGVkdWxlZCA9IHRydWU7IC8vINCf0L7Qt9C90LDRh9Cw0ZTQvNC+LCDRidC+INC+0L3QvtCy0LvQtdC90L3RjyDQt9Cw0L/Qu9Cw0L3QvtCy0LDQvdC+XHJcbiAgICB9XHJcblxyXG4gICAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbT2xsYW1hVmlldy5zY2hlZHVsZVNpZGViYXJDaGF0TGlzdFVwZGF0ZV0gU2NoZWR1bGluZyB1cGRhdGVDaGF0TGlzdCB3aXRoIGRlbGF5OiAke2RlbGF5fW1zLiBXYXMgcGVuZGluZzogJHshIXRoaXMuY2hhdExpc3RVcGRhdGVUaW1lb3V0SWR9YCk7XHJcblxyXG4gICAgdGhpcy5jaGF0TGlzdFVwZGF0ZVRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbT2xsYW1hVmlldy5zY2hlZHVsZVNpZGViYXJDaGF0TGlzdFVwZGF0ZV0gVGltZW91dCBmaXJlZC4gRXhlY3V0aW5nIHVwZGF0ZUNoYXRMaXN0LlwiKTtcclxuICAgICAgaWYgKHRoaXMuc2lkZWJhck1hbmFnZXI/LmlzU2VjdGlvblZpc2libGUoXCJjaGF0c1wiKSkge1xyXG4gICAgICAgIHRoaXMuc2lkZWJhck1hbmFnZXJcclxuICAgICAgICAgIC51cGRhdGVDaGF0TGlzdCgpXHJcbiAgICAgICAgICAuY2F0Y2goZSA9PiB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciB1cGRhdGluZyBjaGF0IHBhbmVsIGxpc3QgdmlhIHNjaGVkdWxlU2lkZWJhckNoYXRMaXN0VXBkYXRlOlwiLCBlKSk7XHJcbiAgICAgIH1cclxuICAgICAgLy8g0KHQutC40LTQsNGU0LzQviDQv9GA0LDQv9C+0YDRhtGWINC/0ZbRgdC70Y8g0YTQsNC60YLQuNGH0L3QvtCz0L4g0LLQuNC60L7QvdCw0L3QvdGPXHJcbiAgICAgIHRoaXMuY2hhdExpc3RVcGRhdGVUaW1lb3V0SWQgPSBudWxsO1xyXG4gICAgICB0aGlzLmlzQ2hhdExpc3RVcGRhdGVTY2hlZHVsZWQgPSBmYWxzZTtcclxuICAgICAgLy8gIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIltPbGxhbWFWaWV3LnNjaGVkdWxlU2lkZWJhckNoYXRMaXN0VXBkYXRlXSBFeGVjdXRlZCBhbmQgZmxhZ3MgcmVzZXQuXCIpO1xyXG4gICAgfSwgZGVsYXkpO1xyXG4gIH07XHJcblxyXG4gIGFzeW5jIGxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdCgpOiBQcm9taXNlPHsgbWV0YWRhdGFVcGRhdGVkOiBib29sZWFuIH0+IHtcclxuICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcclxuICAgICAgYFtPbGxhbWFWaWV3XSBsb2FkQW5kRGlzcGxheUFjdGl2ZUNoYXQgU1RBUlQgZm9yIGFjdGl2ZUlkOiAke3RoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0SWQoKX1gXHJcbiAgICApO1xyXG4gICAgbGV0IG1ldGFkYXRhVXBkYXRlZCA9IGZhbHNlO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIHRoaXMuY2xlYXJDaGF0Q29udGFpbmVySW50ZXJuYWwoKTsgLy8g0J7Rh9C40YnQsNGUIHRoaXMuY3VycmVudE1lc3NhZ2VzLCB0aGlzLmxhc3RSZW5kZXJlZE1lc3NhZ2VEYXRlLCBET00g0LrQvtC90YLQtdC50L3QtdGALCBldGMuXHJcbiAgICAgIC8vIHRoaXMuY3VycmVudE1lc3NhZ2VzID0gW107IC8vINCS0LbQtSDRgNC+0LHQuNGC0YzRgdGPINCyIGNsZWFyQ2hhdENvbnRhaW5lckludGVybmFsXHJcbiAgICAgIC8vIHRoaXMubGFzdFJlbmRlcmVkTWVzc2FnZURhdGUgPSBudWxsOyAvLyDQktC20LUg0YDQvtCx0LjRgtGM0YHRjyDQsiBjbGVhckNoYXRDb250YWluZXJJbnRlcm5hbFxyXG4gICAgICB0aGlzLmxhc3RNZXNzYWdlRWxlbWVudCA9IG51bGw7XHJcbiAgICAgIHRoaXMuY29uc2VjdXRpdmVFcnJvck1lc3NhZ2VzID0gW107XHJcbiAgICAgIHRoaXMuZXJyb3JHcm91cEVsZW1lbnQgPSBudWxsO1xyXG4gICAgICAvLyB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDsgLy8g0JLQsNC20LvQuNCy0L4g0YHQutC40LTQsNGC0Lgg0L/Qu9C10LnRgdGF0L7Qu9C00LXRgCDQv9GA0Lgg0L/QvtCy0L3QvtC80YMg0L/QtdGA0LXQt9Cw0LLQsNC90YLQsNC20LXQvdC90ZZcclxuXHJcbiAgICAgIGxldCBhY3RpdmVDaGF0OiBDaGF0IHwgbnVsbCA9IG51bGw7XHJcbiAgICAgIGxldCBhdmFpbGFibGVNb2RlbHM6IHN0cmluZ1tdID0gW107XHJcbiAgICAgIGxldCBmaW5hbE1vZGVsTmFtZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XHJcbiAgICAgIGxldCBmaW5hbFJvbGVQYXRoOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkOyAvLyDQnNC+0LbQtSDQsdGD0YLQuCBudWxsINCw0LHQviB1bmRlZmluZWRcclxuICAgICAgbGV0IGZpbmFsUm9sZU5hbWU6IHN0cmluZyA9IFwiTm9uZVwiO1xyXG4gICAgICBsZXQgZmluYWxUZW1wZXJhdHVyZTogbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDsgLy8g0JzQvtC20LUg0LHRg9GC0LggbnVsbCDQsNCx0L4gdW5kZWZpbmVkXHJcbiAgICAgIGxldCBlcnJvck9jY3VycmVkTG9hZGluZ0RhdGEgPSBmYWxzZTtcclxuXHJcbiAgICAgIC8vIC0tLSDQl9Cw0LLQsNC90YLQsNC20LXQvdC90Y8g0LTQsNC90LjRhSAtLS1cclxuICAgICAgdHJ5IHtcclxuICAgICAgICBhY3RpdmVDaGF0ID0gKGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyPy5nZXRBY3RpdmVDaGF0KCkpIHx8IG51bGw7XHJcbiAgICAgICAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgIC8vICAgYFtsb2FkQW5kRGlzcGxheUFjdGl2ZUNoYXRdIEFjdGl2ZSBjaGF0IGZldGNoZWQ6ICR7YWN0aXZlQ2hhdD8ubWV0YWRhdGE/LmlkID8/IFwibnVsbFwifWBcclxuICAgICAgICAvLyApO1xyXG4gICAgICAgIGF2YWlsYWJsZU1vZGVscyA9IGF3YWl0IHRoaXMucGx1Z2luLm9sbGFtYVNlcnZpY2UuZ2V0TW9kZWxzKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8g0JLQuNC30L3QsNGH0LDRlNC80L4g0YjQu9GP0YUg0LTQviDRgNC+0LvRljog0LDQsdC+INC3INC80LXRgtCw0LTQsNC90LjRhSDRh9Cw0YLRgywg0LDQsdC+INC3INCz0LvQvtCx0LDQu9GM0L3QuNGFINC90LDQu9Cw0YjRgtGD0LLQsNC90YxcclxuICAgICAgICBmaW5hbFJvbGVQYXRoID0gYWN0aXZlQ2hhdD8ubWV0YWRhdGE/LnNlbGVjdGVkUm9sZVBhdGggIT09IHVuZGVmaW5lZCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgPyBhY3RpdmVDaGF0Lm1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGggXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDogdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aDtcclxuICAgICAgICBmaW5hbFJvbGVOYW1lID0gYXdhaXQgdGhpcy5maW5kUm9sZU5hbWVCeVBhdGgoZmluYWxSb2xlUGF0aCk7IC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4g0LzQtdGC0L7QtCDRhtGM0L7Qs9C+INC60LvQsNGB0YNcclxuICAgICAgICBcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbbG9hZEFuZERpc3BsYXlBY3RpdmVDaGF0XSBFcnJvciBsb2FkaW5nIGluaXRpYWwgY2hhdCBkYXRhIG9yIG1vZGVsczpcIiwgZXJyb3IpO1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBjb25uZWN0aW5nIHRvIE9sbGFtYSBvciBsb2FkaW5nIGNoYXQgZGF0YS5cIiwgNTAwMCk7XHJcbiAgICAgICAgZXJyb3JPY2N1cnJlZExvYWRpbmdEYXRhID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgYXZhaWxhYmxlTW9kZWxzID0gYXZhaWxhYmxlTW9kZWxzIHx8IFtdOyBcclxuICAgICAgICBmaW5hbE1vZGVsTmFtZSA9IGF2YWlsYWJsZU1vZGVscy5pbmNsdWRlcyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWUpXHJcbiAgICAgICAgICAgID8gdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lXHJcbiAgICAgICAgICAgIDogYXZhaWxhYmxlTW9kZWxzWzBdID8/IG51bGw7XHJcbiAgICAgICAgZmluYWxUZW1wZXJhdHVyZSA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnRlbXBlcmF0dXJlO1xyXG4gICAgICAgIGZpbmFsUm9sZVBhdGggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoOyAvLyDQk9C70L7QsdCw0LvRjNC90ZYg0L3QsNC70LDRiNGC0YPQstCw0L3QvdGPINGP0LogZmFsbGJhY2tcclxuICAgICAgICBmaW5hbFJvbGVOYW1lID0gYXdhaXQgdGhpcy5maW5kUm9sZU5hbWVCeVBhdGgoZmluYWxSb2xlUGF0aCk7IFxyXG4gICAgICAgIGFjdGl2ZUNoYXQgPSBudWxsOyBcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gLS0tINCS0LjQt9C90LDRh9C10L3QvdGPINGC0LAg0LLQuNGA0ZbQstC90Y7QstCw0L3QvdGPINC80LXRgtCw0LTQsNC90LjRhSAtLS1cclxuICAgICAgaWYgKCFlcnJvck9jY3VycmVkTG9hZGluZ0RhdGEgJiYgYWN0aXZlQ2hhdCkge1xyXG4gICAgICAgIGxldCBwcmVmZXJyZWRNb2RlbCA9IGFjdGl2ZUNoYXQubWV0YWRhdGE/Lm1vZGVsTmFtZSB8fCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWU7XHJcbiAgICAgICAgaWYgKGF2YWlsYWJsZU1vZGVscy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIGlmIChwcmVmZXJyZWRNb2RlbCAmJiBhdmFpbGFibGVNb2RlbHMuaW5jbHVkZXMocHJlZmVycmVkTW9kZWwpKSB7XHJcbiAgICAgICAgICAgICAgICBmaW5hbE1vZGVsTmFtZSA9IHByZWZlcnJlZE1vZGVsO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgZmluYWxNb2RlbE5hbWUgPSBhdmFpbGFibGVNb2RlbHNbMF07IC8vINCR0LXRgNC10LzQviDQv9C10YDRiNGDINC00L7RgdGC0YPQv9C90YMsINGP0LrRidC+INC+0LHRgNCw0L3QsCDQvdC1INC30L3QsNC50LTQtdC90LBcclxuICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihcclxuICAgICAgICAgICAgICAgICAgICAgYFtsb2FkQW5kRGlzcGxheUFjdGl2ZUNoYXRdIFByZWZlcnJlZCBtb2RlbCBcIiR7cHJlZmVycmVkTW9kZWx9XCIgZm9yIGNoYXQgXCIke2FjdGl2ZUNoYXQubWV0YWRhdGEubmFtZX1cIiBub3QgZm91bmQgaW4gYXZhaWxhYmxlIG1vZGVscyBbJHthdmFpbGFibGVNb2RlbHMuam9pbihcIiwgXCIpfV0uIFVzaW5nIGZpcnN0IGF2YWlsYWJsZTogXCIke2ZpbmFsTW9kZWxOYW1lfVwiLmBcclxuICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZmluYWxNb2RlbE5hbWUgPSBudWxsOyBcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKGBbbG9hZEFuZERpc3BsYXlBY3RpdmVDaGF0XSBObyBhdmFpbGFibGUgT2xsYW1hIG1vZGVscyBkZXRlY3RlZC4gQ2Fubm90IHNldCBtb2RlbCBmb3IgY2hhdCBcIiR7YWN0aXZlQ2hhdC5tZXRhZGF0YS5uYW1lfVwiLmApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8g0JLQuNGA0ZbQstC90Y7RlNC80L4g0LzQvtC00LXQu9GMINGDINC80LXRgtCw0LTQsNC90LjRhSDRh9Cw0YLRgywg0Y/QutGJ0L4g0L/QvtGC0YDRltCx0L3QvlxyXG4gICAgICAgIGlmIChhY3RpdmVDaGF0Lm1ldGFkYXRhLm1vZGVsTmFtZSAhPT0gZmluYWxNb2RlbE5hbWUgJiYgZmluYWxNb2RlbE5hbWUgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICAgICAgICAgICAgYFtPbGxhbWFWaWV3XSBsb2FkQW5kRGlzcGxheUFjdGl2ZUNoYXQ6IEFsaWduaW5nIG1vZGVsIG5hbWUgaW4gbWV0YWRhdGEgZm9yIGNoYXQgXCIke2FjdGl2ZUNoYXQubWV0YWRhdGEubmFtZX1cIi4uLiBPbGQ6ICR7YWN0aXZlQ2hhdC5tZXRhZGF0YS5tb2RlbE5hbWV9LCBOZXc6ICR7ZmluYWxNb2RlbE5hbWV9YFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdXBkYXRlU3VjY2VzcyA9IGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnVwZGF0ZUFjdGl2ZUNoYXRNZXRhZGF0YSh7IG1vZGVsTmFtZTogZmluYWxNb2RlbE5hbWUgfSk7XHJcbiAgICAgICAgICAgICAgICBpZiAodXBkYXRlU3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgICAgICAgIG1ldGFkYXRhVXBkYXRlZCA9IHRydWU7IFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW09sbGFtYVZpZXddIGxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdDogTW9kZWwgbWV0YWRhdGEgZm9yIGNoYXQgXCIke2FjdGl2ZUNoYXQubWV0YWRhdGEubmFtZX1cIiBhbGlnbm1lbnQgZmluaXNoZWQgKHN1Y2Nlc3MpLiBtZXRhZGF0YVVwZGF0ZWQgPSB0cnVlLmApO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vINCf0LXRgNC10LfQsNCy0LDQvdGC0LDQttGD0ZTQvNC+INC+0LEn0ZTQutGCIGFjdGl2ZUNoYXQsINGJ0L7QsSDQstGW0LTQvtCx0YDQsNC30LjRgtC4INC30LzRltC90LhcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBwb3RlbnRpYWxseVVwZGF0ZWRDaGF0ID0gYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0Q2hhdChhY3RpdmVDaGF0Lm1ldGFkYXRhLmlkKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAocG90ZW50aWFsbHlVcGRhdGVkQ2hhdCkgYWN0aXZlQ2hhdCA9IHBvdGVudGlhbGx5VXBkYXRlZENoYXQ7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW09sbGFtYVZpZXddIGxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdDogTW9kZWwgbWV0YWRhdGEgZm9yIGNoYXQgXCIke2FjdGl2ZUNoYXQubWV0YWRhdGEubmFtZX1cIiBhbGlnbm1lbnQgbm90IG5lZWRlZCBvciBmYWlsZWQgc2lsZW50bHkuYCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKHVwZGF0ZUVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtsb2FkQW5kRGlzcGxheUFjdGl2ZUNoYXRdIEVycm9yIGF3YWl0aW5nIGNoYXQgbW9kZWwgbWV0YWRhdGEgdXBkYXRlIGZvciBjaGF0IFwiJHthY3RpdmVDaGF0Lm1ldGFkYXRhLm5hbWV9XCI6YCwgdXBkYXRlRXJyb3IpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZpbmFsVGVtcGVyYXR1cmUgPSBhY3RpdmVDaGF0Lm1ldGFkYXRhPy50ZW1wZXJhdHVyZSA/PyB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZTtcclxuICAgICAgICAvLyBmaW5hbFJvbGVQYXRoINGC0LAgZmluYWxSb2xlTmFtZSDQstC20LUg0LLQuNC30L3QsNGH0LXQvdGWINGA0LDQvdGW0YjQtVxyXG4gICAgICB9IGVsc2UgaWYgKCFlcnJvck9jY3VycmVkTG9hZGluZ0RhdGEgJiYgIWFjdGl2ZUNoYXQpIHtcclxuICAgICAgICAvLyDQr9C60YnQviDRh9Cw0YLRgyDQvdC10LzQsNGUICjQvdCw0L/RgNC40LrQu9Cw0LQsINGJ0L7QudC90L4g0YHRgtCy0L7RgNC10L3QuNC5INC/0L7RgNC+0LbQvdGW0Lkg0LDQsdC+INCy0YHRliDQstC40LTQsNC70LXQvdGWKVxyXG4gICAgICAgIGZpbmFsTW9kZWxOYW1lID0gYXZhaWxhYmxlTW9kZWxzLmluY2x1ZGVzKHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZSlcclxuICAgICAgICAgICAgPyB0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWVcclxuICAgICAgICAgICAgOiBhdmFpbGFibGVNb2RlbHNbMF0gPz8gbnVsbDtcclxuICAgICAgICBmaW5hbFRlbXBlcmF0dXJlID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGVyYXR1cmU7XHJcbiAgICAgICAgZmluYWxSb2xlUGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XHJcbiAgICAgICAgZmluYWxSb2xlTmFtZSA9IGF3YWl0IHRoaXMuZmluZFJvbGVOYW1lQnlQYXRoKGZpbmFsUm9sZVBhdGgpO1xyXG4gICAgICB9XHJcbiAgICAgIC8vINCv0LrRidC+IGVycm9yT2NjdXJyZWRMb2FkaW5nRGF0YSA9IHRydWUsINGC0L4gZmluYWxNb2RlbE5hbWUsIGZpbmFsVGVtcGVyYXR1cmUsIGV0Yy4g0LLQttC1INCy0YHRgtCw0L3QvtCy0LvQtdC90ZYg0YMgZmFsbGJhY2sg0LfQvdCw0YfQtdC90L3Rjy5cclxuXHJcbiAgICAgIC8vIC0tLSDQoNC10L3QtNC10YDRltC90LMg0L/QvtCy0ZbQtNC+0LzQu9C10L3RjCAtLS1cclxuICAgICAgaWYgKGFjdGl2ZUNoYXQgJiYgIWVycm9yT2NjdXJyZWRMb2FkaW5nRGF0YSAmJiBhY3RpdmVDaGF0Lm1lc3NhZ2VzPy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgdGhpcy5oaWRlRW1wdHlTdGF0ZSgpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudE1lc3NhZ2VzID0gWy4uLmFjdGl2ZUNoYXQubWVzc2FnZXNdOyBcclxuICAgICAgICB0aGlzLmxhc3RSZW5kZXJlZE1lc3NhZ2VEYXRlID0gbnVsbDsgXHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgbWVzc2FnZSBvZiB0aGlzLmN1cnJlbnRNZXNzYWdlcykgeyBcclxuICAgICAgICAgIGxldCBtZXNzYWdlR3JvdXBFbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAgICAgICBjb25zdCBpc05ld0RheSA9XHJcbiAgICAgICAgICAgICF0aGlzLmxhc3RSZW5kZXJlZE1lc3NhZ2VEYXRlIHx8ICF0aGlzLmlzU2FtZURheSh0aGlzLmxhc3RSZW5kZXJlZE1lc3NhZ2VEYXRlLCBtZXNzYWdlLnRpbWVzdGFtcCk7XHJcbiAgICAgICAgICBjb25zdCBpc0ZpcnN0TWVzc2FnZUluQ29udGFpbmVyID0gdGhpcy5jaGF0Q29udGFpbmVyLmNoaWxkcmVuLmxlbmd0aCA9PT0gMDtcclxuXHJcbiAgICAgICAgICBpZiAoaXNOZXdEYXkgfHwgaXNGaXJzdE1lc3NhZ2VJbkNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICBpZiAoaXNOZXdEYXkgJiYgdGhpcy5jaGF0Q29udGFpbmVyLmNoaWxkcmVuLmxlbmd0aCA+IDApIHsgLy8g0JTQvtC00LDRlNC80L4g0YDQvtC30LTRltC70YzQvdC40Log0LTQsNGC0LgsINGC0ZbQu9GM0LrQuCDRj9C60YnQviDQstC20LUg0ZQg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPXHJcbiAgICAgICAgICAgICAgdGhpcy5yZW5kZXJEYXRlU2VwYXJhdG9yKG1lc3NhZ2UudGltZXN0YW1wKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmxhc3RSZW5kZXJlZE1lc3NhZ2VEYXRlID0gbWVzc2FnZS50aW1lc3RhbXA7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgbGV0IHJlbmRlcmVyOlxyXG4gICAgICAgICAgICAgIHwgVXNlck1lc3NhZ2VSZW5kZXJlclxyXG4gICAgICAgICAgICAgIHwgQXNzaXN0YW50TWVzc2FnZVJlbmRlcmVyXHJcbiAgICAgICAgICAgICAgfCBTeXN0ZW1NZXNzYWdlUmVuZGVyZXJcclxuICAgICAgICAgICAgICB8IEVycm9yTWVzc2FnZVJlbmRlcmVyIFxyXG4gICAgICAgICAgICAgIHwgVG9vbE1lc3NhZ2VSZW5kZXJlclxyXG4gICAgICAgICAgICAgIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICBzd2l0Y2ggKG1lc3NhZ2Uucm9sZSkge1xyXG4gICAgICAgICAgICAgIGNhc2UgXCJ1c2VyXCI6XHJcbiAgICAgICAgICAgICAgICByZW5kZXJlciA9IG5ldyBVc2VyTWVzc2FnZVJlbmRlcmVyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgbWVzc2FnZSwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICBjYXNlIFwiYXNzaXN0YW50XCI6XHJcbiAgICAgICAgICAgICAgICByZW5kZXJlciA9IG5ldyBBc3Npc3RhbnRNZXNzYWdlUmVuZGVyZXIodGhpcy5hcHAsIHRoaXMucGx1Z2luLCBtZXNzYWdlIGFzIEFzc2lzdGFudE1lc3NhZ2UsIHRoaXMpOyAvLyA8LS0tINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4gdHlwZSBhc3NlcnRpb25cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgIGNhc2UgXCJzeXN0ZW1cIjpcclxuICAgICAgICAgICAgICAgIHJlbmRlcmVyID0gbmV3IFN5c3RlbU1lc3NhZ2VSZW5kZXJlcih0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIG1lc3NhZ2UsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgY2FzZSBcImVycm9yXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZUVycm9yTWVzc2FnZShtZXNzYWdlKTsgXHJcbiAgICAgICAgICAgICAgICAvLyDQndC1INGA0L7QsdC40LzQviBjb250aW51ZSDRgtGD0YIsINGJ0L7QsSBtZXNzYWdlR3JvdXBFbCDQvdC1INC30LDQu9C40YjQuNCy0YHRjyBudWxsLCDRj9C60YnQviDRhtC1INC+0YHRgtCw0L3QvdGUINC/0L7QstGW0LTQvtC80LvQtdC90L3Rj1xyXG4gICAgICAgICAgICAgICAgLy8gaGFuZGxlRXJyb3JNZXNzYWdlINGB0LDQvCDQtNC+0LTQsNGB0YLRjCDQtNC+IERPTSwg0LDQu9C1INC80Lgg0LzQvtC20LXQvNC+INCy0LjQudGC0Lgg0LcgdHJ5Li4uY2F0Y2gg0LTQu9GPINGG0YzQvtCz0L4g0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPXHJcbiAgICAgICAgICAgICAgICBtZXNzYWdlR3JvdXBFbCA9IHRoaXMuZXJyb3JHcm91cEVsZW1lbnQ7IC8vINCf0YDQuNC/0YPRgdC60LDRlNC80L4sINGJ0L4gaGFuZGxlRXJyb3JNZXNzYWdlINC+0L3QvtCy0LvRjtGUINGG0LVcclxuICAgICAgICAgICAgICAgIGJyZWFrOyBcclxuICAgICAgICAgICAgICBjYXNlIFwidG9vbFwiOiBcclxuICAgICAgICAgICAgICAgIHJlbmRlcmVyID0gbmV3IFRvb2xNZXNzYWdlUmVuZGVyZXIodGhpcy5hcHAsIHRoaXMucGx1Z2luLCBtZXNzYWdlLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihgW2xvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdF0gVW5rbm93biBtZXNzYWdlIHJvbGUgaW4gaGlzdG9yeTogJHsobWVzc2FnZSBhcyBhbnkpPy5yb2xlfWApO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdW5rbm93blJvbGVHcm91cCA9IHRoaXMuY2hhdENvbnRhaW5lcj8uY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NFUy5NRVNTQUdFX0dST1VQIH0pO1xyXG4gICAgICAgICAgICAgICAgaWYgKHVua25vd25Sb2xlR3JvdXAgJiYgdGhpcy5jaGF0Q29udGFpbmVyKSB7IFxyXG4gICAgICAgICAgICAgICAgICAgIFJlbmRlcmVyVXRpbHMucmVuZGVyQXZhdGFyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgdW5rbm93blJvbGVHcm91cCwgZmFsc2UpOyBcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB3cmFwcGVyID0gdW5rbm93blJvbGVHcm91cC5jcmVhdGVEaXYoe2NsczogQ1NTX0NMQVNTRVMuTUVTU0FHRV9XUkFQUEVSIHx8IFwibWVzc2FnZS13cmFwcGVyXCJ9KTsgXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnQnViYmxlID0gd3JhcHBlci5jcmVhdGVEaXYoe2NsczogYCR7Q1NTX0NMQVNTRVMuTUVTU0FHRX0gJHtDU1NfQ0xBU1NFUy5TWVNURU1fTUVTU0FHRX1gfSk7IFxyXG4gICAgICAgICAgICAgICAgICAgIG1zZ0J1YmJsZS5jcmVhdGVEaXYoe2NsczogQ1NTX0NMQVNTRVMuU1lTVEVNX01FU1NBR0VfVEVYVCB8fCBcInN5c3RlbS1tZXNzYWdlLXRleHRcIiwgdGV4dDogYFVua25vd24gbWVzc2FnZSByb2xlOiAke21lc3NhZ2Uucm9sZX1gfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgQmFzZU1lc3NhZ2VSZW5kZXJlci5hZGRUaW1lc3RhbXAobXNnQnViYmxlLCBtZXNzYWdlLnRpbWVzdGFtcCwgdGhpcyk7IFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2hhdENvbnRhaW5lci5hcHBlbmRDaGlsZCh1bmtub3duUm9sZUdyb3VwKTtcclxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlR3JvdXBFbCA9IHVua25vd25Sb2xlR3JvdXA7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhazsgXHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChyZW5kZXJlciAmJiBtZXNzYWdlLnJvbGUgIT09ICdlcnJvcicpIHsgLy8g0J3QtSDQstC40LrQu9C40LrQsNGU0LzQviByZW5kZXIsINGP0LrRidC+INGG0LUg0L/QvtC80LjQu9C60LAsINC+0LHRgNC+0LHQu9C10L3QsCBoYW5kbGVFcnJvck1lc3NhZ2VcclxuICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSByZW5kZXJlci5yZW5kZXIoKTtcclxuICAgICAgICAgICAgICBtZXNzYWdlR3JvdXBFbCA9IChyZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlKSA/IGF3YWl0IHJlc3VsdCA6IHJlc3VsdDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSBjYXRjaCAocmVuZGVyRXJyb3IpIHtcclxuICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIltsb2FkQW5kRGlzcGxheUFjdGl2ZUNoYXRdIEVycm9yIHJlbmRlcmluZyBtZXNzYWdlIGR1cmluZyBsb2FkOlwiLCByZW5kZXJFcnJvciwgbWVzc2FnZSk7XHJcbiAgICAgICAgICAgICBjb25zdCBlcnJvckRpdiA9IHRoaXMuY2hhdENvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLkVSUk9SX01FU1NBR0UgfHwgXCJyZW5kZXItZXJyb3JcIiB9KTsgXHJcbiAgICAgICAgICAgICBlcnJvckRpdi5zZXRUZXh0KGBFcnJvciByZW5kZXJpbmcgbWVzc2FnZSAocm9sZTogJHttZXNzYWdlLnJvbGV9KWApO1xyXG4gICAgICAgICAgICAgbWVzc2FnZUdyb3VwRWwgPSBlcnJvckRpdjtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBpZiAobWVzc2FnZUdyb3VwRWwpIHtcclxuICAgICAgICAgICAgaWYgKG1lc3NhZ2VHcm91cEVsLnBhcmVudEVsZW1lbnQgIT09IHRoaXMuY2hhdENvbnRhaW5lcikgeyAvLyDQlNC+0LTQsNGU0LzQviwg0YLRltC70YzQutC4INGP0LrRidC+INGJ0LUg0L3QtSDQsiDQutC+0L3RgtC10LnQvdC10YDRliAo0L3QsNC/0YAuIGhhbmRsZUVycm9yTWVzc2FnZSDQvNGW0LMg0LLQttC1INC00L7QtNCw0YLQuClcclxuICAgICAgICAgICAgICAgICB0aGlzLmNoYXRDb250YWluZXIuYXBwZW5kQ2hpbGQobWVzc2FnZUdyb3VwRWwpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMubGFzdE1lc3NhZ2VFbGVtZW50ID0gbWVzc2FnZUdyb3VwRWw7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSAvLyDQutGW0L3QtdGG0YwgZm9yLi4ub2ZcclxuXHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLmNoZWNrQWxsTWVzc2FnZXNGb3JDb2xsYXBzaW5nKCksIDEwMCk7XHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbSgxMDAsIHRydWUpOyAvLyDQpNC+0YDRgdGD0ZTQvNC+INC/0YDQvtC60YDRg9GC0LrRgyDQv9GW0YHQu9GPINC30LDQstCw0L3RgtCw0LbQtdC90L3RjyDRltGB0YLQvtGA0ZbRl1xyXG4gICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlU2Nyb2xsU3RhdGVBbmRJbmRpY2F0b3JzKCk7IFxyXG4gICAgICAgICAgfSwgMTUwKTsgXHJcbiAgICAgICAgfSwgMTUwKTsgXHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5zaG93RW1wdHlTdGF0ZSgpO1xyXG4gICAgICAgIHRoaXMuc2Nyb2xsVG9Cb3R0b21CdXR0b24/LmNsYXNzTGlzdC5yZW1vdmUoQ1NTX0NMQVNTRVMuVklTSUJMRSB8fCBcInZpc2libGVcIik7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIC0tLSDQntC90L7QstC70LXQvdC90Y8gVUkg0YHQsNC80L7RlyBWaWV3IC0tLVxyXG4gICAgICB0aGlzLnVwZGF0ZUlucHV0UGxhY2Vob2xkZXIoZmluYWxSb2xlTmFtZSk7XHJcbiAgICAgIHRoaXMudXBkYXRlUm9sZURpc3BsYXkoZmluYWxSb2xlTmFtZSk7XHJcbiAgICAgIHRoaXMudXBkYXRlTW9kZWxEaXNwbGF5KGZpbmFsTW9kZWxOYW1lKTtcclxuICAgICAgdGhpcy51cGRhdGVUZW1wZXJhdHVyZUluZGljYXRvcihmaW5hbFRlbXBlcmF0dXJlKTtcclxuXHJcbiAgICAgIGlmIChmaW5hbE1vZGVsTmFtZSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgaWYgKHRoaXMuaW5wdXRFbCkgeyB0aGlzLmlucHV0RWwuZGlzYWJsZWQgPSB0cnVlOyB0aGlzLmlucHV0RWwucGxhY2Vob2xkZXIgPSBcIk5vIG1vZGVscyBhdmFpbGFibGUuLi5cIjsgfVxyXG4gICAgICAgICAgaWYgKHRoaXMuc2VuZEJ1dHRvbikgeyB0aGlzLnNlbmRCdXR0b24uZGlzYWJsZWQgPSB0cnVlOyB0aGlzLnNlbmRCdXR0b24uY2xhc3NMaXN0LmFkZChDU1NfQ0xBU1NFUy5ESVNBQkxFRCB8fCBcImRpc2FibGVkXCIpOyB9XHJcbiAgICAgICAgICBpZih0aGlzLmlzUHJvY2Vzc2luZykgdGhpcy5zZXRMb2FkaW5nU3RhdGUoZmFsc2UpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgaWYgKHRoaXMuaW5wdXRFbCAmJiAhdGhpcy5pc1Byb2Nlc3NpbmcpIHsgdGhpcy5pbnB1dEVsLmRpc2FibGVkID0gZmFsc2U7IH1cclxuICAgICAgICAgIHRoaXMudXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcclxuICAgICAgLy8gICBgW09sbGFtYVZpZXddIGxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdCBGSU5JU0hFRC4gTWV0YWRhdGEgd2FzIHVwZGF0ZWQ6ICR7bWV0YWRhdGFVcGRhdGVkfWBcclxuICAgICAgLy8gKTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW2xvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdF0gWFhYIENSSVRJQ0FMIE9VVEVSIEVSUk9SIFhYWFwiLCBlcnJvcik7XHJcbiAgICAgICB0aGlzLmNsZWFyQ2hhdENvbnRhaW5lckludGVybmFsKCk7XHJcbiAgICAgICB0aGlzLnNob3dFbXB0eVN0YXRlKCk7IFxyXG4gICAgICAgaWYgKHRoaXMuY2hhdENvbnRhaW5lcikgeyAvLyDQn9C10YDQtdCy0ZbRgNC60LAsINGH0Lgg0ZbRgdC90YPRlCBjaGF0Q29udGFpbmVyXHJcbiAgICAgICAgdGhpcy5jaGF0Q29udGFpbmVyLmNyZWF0ZURpdih7Y2xzOiBcImZhdGFsLWVycm9yLW1lc3NhZ2VcIiwgdGV4dDogXCJGYWlsZWQgdG8gbG9hZCBjaGF0IGNvbnRlbnQuIFBsZWFzZSBjaGVjayBjb25zb2xlLlwifSk7XHJcbiAgICAgICB9XHJcbiAgICAgICByZXR1cm4geyBtZXRhZGF0YVVwZGF0ZWQ6IGZhbHNlIH07IC8vINCf0L7QstC10YDRgtCw0ZTQvNC+IGZhbHNlLCDQvtGB0LrRltC70YzQutC4INC80LXRgtCw0LTQsNC90ZYg0YLQvtGH0L3QviDQvdC1INC+0L3QvtCy0LvQtdC90L4g0YPRgdC/0ZbRiNC90L5cclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIC8vINCc0L7QttC70LjQstC+LCDQt9C90Y/RgtC4INC30LDQs9Cw0LvRjNC90LjQuSDRltC90LTQuNC60LDRgtC+0YAg0LfQsNCy0LDQvdGC0LDQttC10L3QvdGPIFZpZXcsINGP0LrRidC+INCy0ZbQvSDRlFxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7IG1ldGFkYXRhVXBkYXRlZCB9O1xyXG4gIH1cclxuXHJcbiAgXHJcbiAgLy8g0J/QtdGA0LXQutC+0L3QsNC50YLQtdGB0YwsINGJ0L4gc2NoZWR1bGVTaWRlYmFyQ2hhdExpc3RVcGRhdGUg0LLQuNC30L3QsNGH0LXQvdC+INGDINC60LvQsNGB0ZZcclxuICAvLyDRgtCwINGW0L3RiNGWINC30LDQu9C10LbQvdC+0YHRgtGWIChMb2dnZXIsIENTUyDQutC70LDRgdC4LCDRgtC40L/QuCkg0ZbQvNC/0L7RgNGC0L7QstCw0L3Qvi/QstC40LfQvdCw0YfQtdC90L4uXHJcblxyXG4gIHByaXZhdGUgaGFuZGxlQWN0aXZlQ2hhdENoYW5nZWQgPSBhc3luYyAoZGF0YTogeyBjaGF0SWQ6IHN0cmluZyB8IG51bGw7IGNoYXQ6IENoYXQgfCBudWxsIH0pOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcclxuICAgICAgYFtPbGxhbWFWaWV3XSBoYW5kbGVBY3RpdmVDaGF0Q2hhbmdlZDogUmVjZWl2ZWQgZXZlbnQuIE5ldyBhY3RpdmVJZDogJHtkYXRhLmNoYXRJZH0sIFByZXYgYWN0aXZlSWQ6ICR7XHJcbiAgICAgICAgdGhpcy5sYXN0UHJvY2Vzc2VkQ2hhdElkXHJcbiAgICAgIH0uIENoYXQgb2JqZWN0IGluIGV2ZW50IGlzICR7ZGF0YS5jaGF0ID8gXCJwcmVzZW50XCIgOiBcIm51bGxcIn0uYFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyDQn9C10YDQtdCy0ZbRgNC60LAg0L3QsCDRgNC10LPQtdC90LXRgNCw0YbRltGOXHJcbiAgICBpZiAodGhpcy5pc1JlZ2VuZXJhdGluZyAmJiBkYXRhLmNoYXRJZCA9PT0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0QWN0aXZlQ2hhdElkKCkpIHtcclxuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oXHJcbiAgICAgICAgYFtPbGxhbWFWaWV3XSBoYW5kbGVBY3RpdmVDaGF0Q2hhbmdlZDogSWdub3JpbmcgZXZlbnQgZm9yIGNoYXQgJHtkYXRhLmNoYXRJZH0gYmVjYXVzZSByZWdlbmVyYXRpb24gaXMgaW4gcHJvZ3Jlc3MuYFxyXG4gICAgICApO1xyXG4gICAgICB0aGlzLmxhc3RQcm9jZXNzZWRDaGF0SWQgPSBkYXRhLmNoYXRJZDsgLy8g0JLQsNC20LvQuNCy0L4g0L7QvdC+0LLQuNGC0LggSURcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNoYXRTd2l0Y2hlZCA9IGRhdGEuY2hhdElkICE9PSB0aGlzLmxhc3RQcm9jZXNzZWRDaGF0SWQ7XHJcbiAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtPbGxhbWFWaWV3XSBoYW5kbGVBY3RpdmVDaGF0Q2hhbmdlZDogQ2hhdCBzd2l0Y2hlZDogJHtjaGF0U3dpdGNoZWR9LmApO1xyXG4gICAgbGV0IG1ldGFkYXRhV2FzVXBkYXRlZEJ5TG9hZCA9IGZhbHNlOyAvLyDQn9GA0LDQv9C+0YDQtdGG0Ywg0LTQu9GPINGA0LXQt9GD0LvRjNGC0LDRgtGDIGxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdFxyXG5cclxuICAgIC8vINCj0LzQvtCy0LAg0LTQu9GPINC/0L7QstC90L7Qs9C+INC/0LXRgNC10LfQsNCy0LDQvdGC0LDQttC10L3QvdGPIFVJXHJcbiAgICBpZiAoY2hhdFN3aXRjaGVkIHx8IChkYXRhLmNoYXRJZCAhPT0gbnVsbCAmJiBkYXRhLmNoYXQgPT09IG51bGwpKSB7XHJcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcclxuICAgICAgICBgW09sbGFtYVZpZXddIGhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkOiBGVUxMIENIQVQgUkVMT0FEIGNvbmRpdGlvbiBtZXQgKHN3aXRjaGVkOiAke2NoYXRTd2l0Y2hlZH0sIGRhdGEuY2hhdCA9PT0gbnVsbDogJHtcclxuICAgICAgICAgIGRhdGEuY2hhdCA9PT0gbnVsbFxyXG4gICAgICAgIH0pLmBcclxuICAgICAgKTtcclxuICAgICAgdGhpcy5sYXN0UHJvY2Vzc2VkQ2hhdElkID0gZGF0YS5jaGF0SWQ7IC8vINCe0L3QvtCy0LvRjtGU0LzQviBJRCDQv9C+0YLQvtGH0L3QvtCz0L4g0LDQutGC0LjQstC90L7Qs9C+INGH0LDRgtGDXHJcblxyXG4gICAgICAvLyDQktC40LrQu9C40LrQsNGU0LzQviBsb2FkQW5kRGlzcGxheUFjdGl2ZUNoYXQg0ZYg0LfQsdC10YDRltCz0LDRlNC80L4g0YDQtdC30YPQu9GM0YLQsNGCXHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMubG9hZEFuZERpc3BsYXlBY3RpdmVDaGF0KCk7XHJcbiAgICAgIG1ldGFkYXRhV2FzVXBkYXRlZEJ5TG9hZCA9IHJlc3VsdC5tZXRhZGF0YVVwZGF0ZWQ7XHJcbiAgICB9XHJcbiAgICAvLyDQo9C80L7QstCwINC00LvRjyBcItC70LXQs9C60L7Qs9C+XCIg0L7QvdC+0LLQu9C10L3QvdGPIFVJICjQutC+0LvQuCBJRCDQvdC1INC30LzRltC90LjQstGB0Y8sINCw0LvQtSDQtNCw0L3RliDRh9Cw0YLRgyDQvNC+0LPQu9C4KVxyXG4gICAgZWxzZSBpZiAoZGF0YS5jaGF0SWQgIT09IG51bGwgJiYgZGF0YS5jaGF0ICE9PSBudWxsKSB7XHJcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcclxuICAgICAgICBgW09sbGFtYVZpZXddIGhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkOiBMaWdodGVyIHVwZGF0ZSBwYXRoIChjaGF0IElEIHNhbWUsIGNoYXQgZGF0YSBwcm92aWRlZCkuYFxyXG4gICAgICApO1xyXG4gICAgICB0aGlzLmxhc3RQcm9jZXNzZWRDaGF0SWQgPSBkYXRhLmNoYXRJZDsgLy8g0J7QvdC+0LLQu9GO0ZTQvNC+IElEXHJcbiAgICAgIGNvbnN0IGNoYXQgPSBkYXRhLmNoYXQ7XHJcblxyXG4gICAgICAvLyDQntC90L7QstC70Y7RlNC80L4g0LvQuNGI0LUg0YLRliDQtdC70LXQvNC10L3RgtC4IFVJLCDRidC+INCy0ZbQtNC+0LHRgNCw0LbQsNGO0YLRjCDQvNC10YLQsNC00LDQvdGWINCw0LrRgtC40LLQvdC+0LPQviDRh9Cw0YLRg1xyXG4gICAgICBjb25zdCBjdXJyZW50Um9sZVBhdGggPSBjaGF0Lm1ldGFkYXRhPy5zZWxlY3RlZFJvbGVQYXRoID8/IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XHJcbiAgICAgIGNvbnN0IGN1cnJlbnRSb2xlTmFtZSA9IGF3YWl0IHRoaXMuZmluZFJvbGVOYW1lQnlQYXRoKGN1cnJlbnRSb2xlUGF0aCk7XHJcbiAgICAgIGNvbnN0IGN1cnJlbnRNb2RlbE5hbWUgPSBjaGF0Lm1ldGFkYXRhPy5tb2RlbE5hbWUgfHwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xyXG4gICAgICBjb25zdCBjdXJyZW50VGVtcGVyYXR1cmUgPSBjaGF0Lm1ldGFkYXRhPy50ZW1wZXJhdHVyZSA/PyB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZTtcclxuXHJcbiAgICAgIHRoaXMudXBkYXRlTW9kZWxEaXNwbGF5KGN1cnJlbnRNb2RlbE5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZVJvbGVEaXNwbGF5KGN1cnJlbnRSb2xlTmFtZSk7XHJcbiAgICAgIHRoaXMudXBkYXRlSW5wdXRQbGFjZWhvbGRlcihjdXJyZW50Um9sZU5hbWUpO1xyXG4gICAgICB0aGlzLnVwZGF0ZVRlbXBlcmF0dXJlSW5kaWNhdG9yKGN1cnJlbnRUZW1wZXJhdHVyZSk7XHJcblxyXG4gICAgICAvLyBtZXRhZGF0YVdhc1VwZGF0ZWRCeUxvYWQg0LfQsNC70LjRiNCw0ZTRgtGM0YHRjyBmYWxzZSwg0L7RgdC60ZbQu9GM0LrQuCBsb2FkQW5kRGlzcGxheUFjdGl2ZUNoYXQg0L3QtSDQstC40LrQu9C40LrQsNCy0YHRj1xyXG4gICAgfVxyXG4gICAgLy8g0JLQuNC/0LDQtNC+0LosINC60L7Qu9C4INCw0LrRgtC40LLQvdC40Lkg0YfQsNGCINGB0YLQsNCyIG51bGxcclxuICAgIGVsc2UgaWYgKGRhdGEuY2hhdElkID09PSBudWxsKSB7XHJcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW09sbGFtYVZpZXddIGhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkOiBBY3RpdmUgY2hhdCBpcyBub3cgbnVsbC5gKTtcclxuICAgICAgdGhpcy5sYXN0UHJvY2Vzc2VkQ2hhdElkID0gbnVsbDsgLy8g0J7QvdC+0LLQu9GO0ZTQvNC+IElEXHJcbiAgICAgIHRoaXMuY2xlYXJEaXNwbGF5QW5kU3RhdGUoKTsgLy8g0J7Rh9C40YnQsNGU0LzQviBVSVxyXG4gICAgICAvLyBtZXRhZGF0YVdhc1VwZGF0ZWRCeUxvYWQg0LfQsNC70LjRiNCw0ZTRgtGM0YHRjyBmYWxzZVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8g0J3QtdC+0YfRltC60YPQstCw0L3QsCDQutC+0LzQsdGW0L3QsNGG0ZbRjyDQv9Cw0YDQsNC80LXRgtGA0ZbQslxyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihcclxuICAgICAgICBgW09sbGFtYVZpZXddIGhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkOiBVbmhhbmRsZWQgY2FzZT8gY2hhdElkPSR7ZGF0YS5jaGF0SWR9LCBjaGF0PSR7ZGF0YS5jaGF0fSwgY2hhdFN3aXRjaGVkPSR7Y2hhdFN3aXRjaGVkfWBcclxuICAgICAgKTtcclxuICAgICAgdGhpcy5sYXN0UHJvY2Vzc2VkQ2hhdElkID0gZGF0YS5jaGF0SWQ7IC8vINCe0L3QvtCy0LvRjtGU0LzQviBJRCDQv9GA0L4g0LLRgdGP0Log0LLQuNC/0LDQtNC+0LpcclxuICAgICAgLy8gbWV0YWRhdGFXYXNVcGRhdGVkQnlMb2FkINC30LDQu9C40YjQsNGU0YLRjNGB0Y8gZmFsc2VcclxuICAgIH1cclxuXHJcbiAgICAvLyAtLS0g0KPQvNC+0LLQvdC1INC/0LvQsNC90YPQstCw0L3QvdGPINC+0L3QvtCy0LvQtdC90L3RjyDRgdC/0LjRgdC60YMg0YfQsNGC0ZbQsiAtLS1cclxuICAgIC8vINCf0LvQsNC90YPRlNC80L4g0L7QvdC+0LLQu9C10L3QvdGPLCDQotCG0JvQrNCa0Jgg0K/QmtCp0J4gbG9hZEFuZERpc3BsYXlBY3RpdmVDaGF0INCd0JUg0L7QvdC+0LLQu9GO0LLQsNCyINC80LXRgtCw0LTQsNC90ZZcclxuICAgIC8vICjQsdC+INGP0LrRidC+INC+0L3QvtCy0LvRjtCy0LDQsiwg0L/QvtC00ZbRjyAnY2hhdC1saXN0LXVwZGF0ZWQnINGB0LDQvNCwINCy0LjQutC70LjRh9C1INC+0L3QvtCy0LvQtdC90L3RjyDRgdC/0LjRgdC60YMpLFxyXG4gICAgLy8g0JDQkdCeINGP0LrRidC+INGG0LUg0LHRg9CyINGI0LvRj9GFIFwi0LvQtdCz0LrQvtCz0L5cIiDQvtC90L7QstC70LXQvdC90Y8g0YfQuCDRgdC60LjQtNCw0L3QvdGPINC90LAgbnVsbC5cclxuICAgIGlmICghbWV0YWRhdGFXYXNVcGRhdGVkQnlMb2FkKSB7XHJcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcclxuICAgICAgICBgW09sbGFtYVZpZXcuaGFuZGxlQWN0aXZlQ2hhdENoYW5nZWRdIE1ldGFkYXRhIHdhcyBOT1QgdXBkYXRlZCBieSBsb2FkIChvciBsaWdodC9udWxsIHBhdGgpOyBTY2hlZHVsaW5nIHNpZGViYXIgbGlzdCB1cGRhdGUuYFxyXG4gICAgICApO1xyXG4gICAgICB0aGlzLnNjaGVkdWxlU2lkZWJhckNoYXRMaXN0VXBkYXRlKCk7IC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4g0L/Qu9Cw0L3Rg9Cy0LDQu9GM0L3QuNC6XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXHJcbiAgICAgICAgYFtPbGxhbWFWaWV3LmhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkXSBNZXRhZGF0YSBXQVMgdXBkYXRlZCBieSBsb2FkOyBSZWx5aW5nIG9uIGNoYXQtbGlzdC11cGRhdGVkIGV2ZW50IHRvIHNjaGVkdWxlIGxpc3QgdXBkYXRlLmBcclxuICAgICAgKTtcclxuICAgICAgLy8g0J3QtSDQstC40LrQu9C40LrQsNGU0LzQviDQv9C70LDQvdGD0LLQsNC70YzQvdC40Log0LfQstGW0LTRgdC4LCDRh9C10LrQsNGU0LzQviDQvdCwIGhhbmRsZUNoYXRMaXN0VXBkYXRlZFxyXG4gICAgfVxyXG4gICAgLy8gLS0tINCa0ZbQvdC10YbRjCDRg9C80L7QstC90L7Qs9C+INC/0LvQsNC90YPQstCw0L3QvdGPIC0tLVxyXG5cclxuICAgIC8vIC0tLSDQntC90L7QstC70LXQvdC90Y8g0ZbQvdGI0LjRhSDRh9Cw0YHRgtC40L0gVUkgKNC90LXQt9Cw0LvQtdC20L3QviDQstGW0LQg0YjQu9GP0YXRgykgLS0tXHJcblxyXG4gICAgLy8g0J7QvdC+0LLQu9GO0ZTQvNC+INGB0L/QuNGB0L7QuiDRgNC+0LvQtdC5INGDINGB0LDQudC00LHQsNGA0ZYsINGP0LrRidC+INCy0ZbQvSDQstC40LTQuNC80LjQuVxyXG4gICAgaWYgKHRoaXMuc2lkZWJhck1hbmFnZXI/LmlzU2VjdGlvblZpc2libGUoXCJyb2xlc1wiKSkge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtPbGxhbWFWaWV3XSBoYW5kbGVBY3RpdmVDaGF0Q2hhbmdlZDogVHJpZ2dlcmluZyBzaWRlYmFyIHJvbGUgbGlzdCB1cGRhdGUuYCk7XHJcbiAgICAgIHRoaXMuc2lkZWJhck1hbmFnZXJcclxuICAgICAgICAudXBkYXRlUm9sZUxpc3QoKVxyXG4gICAgICAgIC5jYXRjaChlID0+IHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkVycm9yIHVwZGF0aW5nIHJvbGUgcGFuZWwgbGlzdCBpbiBoYW5kbGVBY3RpdmVDaGF0Q2hhbmdlZDpcIiwgZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vINCe0L3QvtCy0LvRjtGU0LzQviDRgdC/0LjRgdC+0Log0YDQvtC70LXQuSDRgyDQstC40L/QsNC00LDRjtGH0L7QvNGDINC80LXQvdGOXHJcbiAgICBpZiAodGhpcy5kcm9wZG93bk1lbnVNYW5hZ2VyKSB7XHJcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW09sbGFtYVZpZXddIGhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkOiBUcmlnZ2VyaW5nIGRyb3Bkb3duIHJvbGUgbGlzdCB1cGRhdGUgY2hlY2suYCk7XHJcbiAgICAgIHRoaXMuZHJvcGRvd25NZW51TWFuYWdlclxyXG4gICAgICAgIC51cGRhdGVSb2xlTGlzdElmVmlzaWJsZSgpXHJcbiAgICAgICAgLmNhdGNoKGUgPT4gdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiRXJyb3IgdXBkYXRpbmcgcm9sZSBkcm9wZG93biBsaXN0IGluIGhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkOlwiLCBlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFxyXG4gICAgICBgW09sbGFtYVZpZXddIGhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkOiBGaW5pc2hlZCBwcm9jZXNzaW5nIGV2ZW50IGZvciBjaGF0SWQ6ICR7ZGF0YS5jaGF0SWR9LiBNZXRhZGF0YSB1cGRhdGVkIGJ5IGxvYWQ6ICR7bWV0YWRhdGFXYXNVcGRhdGVkQnlMb2FkfWBcclxuICAgICk7XHJcbiAgfTsgLy8gLS0tINCa0ZbQvdC10YbRjCDQvNC10YLQvtC00YMgaGFuZGxlQWN0aXZlQ2hhdENoYW5nZWQgLS0tXHJcblxyXG4gIHByaXZhdGUgYXN5bmMgX3Byb2Nlc3NBbmRSZW5kZXJVc2VyTWVzc2FnZShjb250ZW50OiBzdHJpbmcsIHRpbWVzdGFtcDogRGF0ZSwgcmVxdWVzdFRpbWVzdGFtcElkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IHRpbWVzdGFtcE1zID0gdGltZXN0YW1wLmdldFRpbWUoKTtcclxuICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW3NlbmRNZXNzYWdlIGlkOiR7cmVxdWVzdFRpbWVzdGFtcElkfV0gU2V0dGluZyB1cCByZXNvbHZlciBmb3IgVXNlck1lc3NhZ2UgKHRzOiAke3RpbWVzdGFtcE1zfSkuYCk7XHJcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICB0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5zZXQodGltZXN0YW1wTXMsIHJlc29sdmUpO1xyXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICBpZiAodGhpcy5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuaGFzKHRpbWVzdGFtcE1zKSkge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oYFtzZW5kTWVzc2FnZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIFRpbWVvdXQgSE1BIGZvciBVc2VyTWVzc2FnZSAodHM6ICR7dGltZXN0YW1wTXN9KS5gKTtcclxuICAgICAgICAgIHRoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmRlbGV0ZSh0aW1lc3RhbXBNcyk7XHJcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBUaW1lb3V0IEhNQSBmb3IgVXNlck1lc3NhZ2UgKHRzOiAke3RpbWVzdGFtcE1zfSkuYCkpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSwgMTAwMDApO1xyXG4gICAgfSk7XHJcbiAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0KFwidXNlclwiLCBjb250ZW50LCB0aW1lc3RhbXAsIHRydWUpO1xyXG4gICAgYXdhaXQgcHJvbWlzZTtcclxuICAgIHRoaXMucGx1Z2luLmxvZ2dlci5pbmZvKGBbc2VuZE1lc3NhZ2UgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBVc2VyTWVzc2FnZSAodHM6ICR7dGltZXN0YW1wTXN9KSBwcm9jZXNzZWQgYnkgSE1BLmApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBfbWFuYWdlUGxhY2Vob2xkZXIodHVyblRpbWVzdGFtcDogbnVtYmVyLCByZXF1ZXN0VGltZXN0YW1wSWQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgJiYgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci50aW1lc3RhbXAgIT09IHR1cm5UaW1lc3RhbXApIHtcclxuICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5jbGFzc0xpc3QuY29udGFpbnMoXCJwbGFjZWhvbGRlclwiKSkge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW3NlbmRNZXNzYWdlIGlkOiR7cmVxdWVzdFRpbWVzdGFtcElkfV0gUmVtb3Zpbmcgc3RhbGUgcGxhY2Vob2xkZXIgKHRzOiAke3RoaXMuYWN0aXZlUGxhY2Vob2xkZXIudGltZXN0YW1wfSkgZm9yIG5ldyB0dXJuICh0czogJHt0dXJuVGltZXN0YW1wfSkuYCk7XHJcbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuZ3JvdXBFbC5pc0Nvbm5lY3RlZCkgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLnJlbW92ZSgpO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIgPSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGhpcy5hY3RpdmVQbGFjZWhvbGRlcikge1xyXG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtzZW5kTWVzc2FnZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIENyZWF0aW5nIHBsYWNlaG9sZGVyIGZvciBhc3Npc3RhbnQgcmVzcG9uc2UgKGV4cGVjdGVkIHRzOiAke3R1cm5UaW1lc3RhbXB9KS5gKTtcclxuICAgICAgY29uc3QgcGxhY2Vob2xkZXJHcm91cEVsID0gdGhpcy5jaGF0Q29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogYCR7Q1NTX0NMQVNTRVMuTUVTU0FHRV9HUk9VUH0gJHtDU1NfQ0xBU1NFUy5PTExBTUFfR1JPVVB9IHBsYWNlaG9sZGVyYCB9KTtcclxuICAgICAgcGxhY2Vob2xkZXJHcm91cEVsLnNldEF0dHJpYnV0ZShcImRhdGEtcGxhY2Vob2xkZXItdGltZXN0YW1wXCIsIHR1cm5UaW1lc3RhbXAudG9TdHJpbmcoKSk7XHJcbiAgICAgIFJlbmRlcmVyVXRpbHMucmVuZGVyQXZhdGFyKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgcGxhY2Vob2xkZXJHcm91cEVsLCBmYWxzZSwgJ2Fzc2lzdGFudCcpO1xyXG4gICAgICBjb25zdCB3cmFwcGVyRWwgPSBwbGFjZWhvbGRlckdyb3VwRWwuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NFUy5NRVNTQUdFX1dSQVBQRVIgfHwgXCJtZXNzYWdlLXdyYXBwZXJcIiB9KTtcclxuICAgICAgd3JhcHBlckVsLnN0eWxlLm9yZGVyID0gXCIyXCI7XHJcbiAgICAgIGNvbnN0IG1zZ0VsID0gd3JhcHBlckVsLmNyZWF0ZURpdih7IGNsczogYCR7Q1NTX0NMQVNTRVMuTUVTU0FHRX0gJHtDU1NfQ0xBU1NFUy5PTExBTUFfTUVTU0FHRX1gIH0pO1xyXG4gICAgICBjb25zdCBjb250ZW50Q29udGFpbmVyRWwgPSBtc2dFbC5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLkNPTlRFTlRfQ09OVEFJTkVSIH0pO1xyXG4gICAgICBjb25zdCBjb250ZW50UGxhY2Vob2xkZXJFbCA9IGNvbnRlbnRDb250YWluZXJFbC5jcmVhdGVEaXYoeyBjbHM6IGAke0NTU19DTEFTU0VTLkNPTlRFTlR9ICR7Q1NTX0NMQVNTRVMuQ09OVEVOVF9DT0xMQVBTSUJMRX0gc3RyZWFtaW5nLXRleHRgIH0pO1xyXG4gICAgICBjb250ZW50UGxhY2Vob2xkZXJFbC5lbXB0eSgpO1xyXG4gICAgICBjb25zdCBkb3RzID0gY29udGVudFBsYWNlaG9sZGVyRWwuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NFUy5USElOS0lOR19ET1RTIH0pO1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDM7IGkrKykgZG90cy5jcmVhdGVEaXYoeyBjbHM6IENTU19DTEFTU0VTLlRISU5LSU5HX0RPVCB9KTtcclxuICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlciA9IHsgdGltZXN0YW1wOiB0dXJuVGltZXN0YW1wLCBncm91cEVsOiBwbGFjZWhvbGRlckdyb3VwRWwsIGNvbnRlbnRFbDogY29udGVudFBsYWNlaG9sZGVyRWwsIG1lc3NhZ2VXcmFwcGVyOiB3cmFwcGVyRWwgfTtcclxuICAgICAgcGxhY2Vob2xkZXJHcm91cEVsLmNsYXNzTGlzdC5hZGQoQ1NTX0NMQVNTRVMuTUVTU0FHRV9BUlJJVklORyB8fCBcIm1lc3NhZ2UtYXJyaXZpbmdcIik7XHJcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gcGxhY2Vob2xkZXJHcm91cEVsPy5jbGFzc0xpc3QucmVtb3ZlKENTU19DTEFTU0VTLk1FU1NBR0VfQVJSSVZJTkcgfHwgXCJtZXNzYWdlLWFycml2aW5nXCIpLCA1MDApO1xyXG4gICAgICB0aGlzLmd1YXJhbnRlZWRTY3JvbGxUb0JvdHRvbSg1MCwgdHJ1ZSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW3NlbmRNZXNzYWdlIGlkOiR7cmVxdWVzdFRpbWVzdGFtcElkfV0gUmV1c2luZyBhY3RpdmUgcGxhY2Vob2xkZXIgZm9yIG5ldyB0dXJuICh0czogJHt0dXJuVGltZXN0YW1wfSkuIENsZWFyaW5nIGNvbnRlbnQuYCk7XHJcbiAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5jb250ZW50RWwuZW1wdHkoKTtcclxuICAgICAgICBjb25zdCBkb3RzID0gdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBDU1NfQ0xBU1NFUy5USElOS0lOR19ET1RTIH0pO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSBkb3RzLmNyZWF0ZURpdih7IGNsczogQ1NTX0NMQVNTRVMuVEhJTktJTkdfRE9UIH0pO1xyXG4gICAgICAgIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuY29udGVudEVsLmNsYXNzTGlzdC5hZGQoXCJzdHJlYW1pbmctdGV4dFwiKTtcclxuICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLnRpbWVzdGFtcCA9IHR1cm5UaW1lc3RhbXA7XHJcbiAgICAgICAgdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5ncm91cEVsLnNldEF0dHJpYnV0ZShcImRhdGEtcGxhY2Vob2xkZXItdGltZXN0YW1wXCIsdHVyblRpbWVzdGFtcC50b1N0cmluZygpKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgX3Byb2Nlc3NMbG1TdHJlYW0oXHJcbiAgICBzdHJlYW06IEFzeW5jSXRlcmFibGVJdGVyYXRvcjxTdHJlYW1DaHVuaz4sXHJcbiAgICBjdXJyZW50VHVybkxsbVJlc3BvbnNlVHM6IG51bWJlciwgLy8g0JTQu9GPINC/0LXRgNC10LLRltGA0LrQuCDQsNC60YLRg9Cw0LvRjNC90L7RgdGC0ZYg0L/Qu9C10LnRgdGF0L7Qu9C00LXRgNCwXHJcbiAgICByZXF1ZXN0VGltZXN0YW1wSWQ6IG51bWJlclxyXG4gICk6IFByb21pc2U8e1xyXG4gICAgYWNjdW11bGF0ZWRDb250ZW50OiBzdHJpbmc7XHJcbiAgICBuYXRpdmVUb29sQ2FsbHM6IFRvb2xDYWxsW10gfCBudWxsO1xyXG4gICAgYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxsczogQXNzaXN0YW50TWVzc2FnZSB8IG51bGw7XHJcbiAgfT4ge1xyXG4gICAgbGV0IGFjY3VtdWxhdGVkQ29udGVudCA9IFwiXCI7XHJcbiAgICBsZXQgbmF0aXZlVG9vbENhbGxzOiBUb29sQ2FsbFtdIHwgbnVsbCA9IG51bGw7XHJcbiAgICBsZXQgYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxsczogQXNzaXN0YW50TWVzc2FnZSB8IG51bGwgPSBudWxsO1xyXG4gICAgbGV0IGZpcnN0Q2h1bmtGb3JUdXJuID0gdHJ1ZTtcclxuXHJcbiAgICBmb3IgYXdhaXQgKGNvbnN0IGNodW5rIG9mIHN0cmVhbSkge1xyXG4gICAgICBpZiAodGhpcy5jdXJyZW50QWJvcnRDb250cm9sbGVyPy5zaWduYWwuYWJvcnRlZCkgdGhyb3cgbmV3IEVycm9yKFwiYWJvcnRlZCBieSB1c2VyXCIpO1xyXG4gICAgICBpZiAoY2h1bmsudHlwZSA9PT0gXCJlcnJvclwiKSB0aHJvdyBuZXcgRXJyb3IoY2h1bmsuZXJyb3IpO1xyXG5cclxuICAgICAgaWYgKHRoaXMuYWN0aXZlUGxhY2Vob2xkZXI/LnRpbWVzdGFtcCAhPT0gY3VycmVudFR1cm5MbG1SZXNwb25zZVRzKSB7XHJcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oYFtzZW5kTWVzc2FnZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dW19wcm9jZXNzTGxtU3RyZWFtXSBTdGFsZSBwbGFjZWhvbGRlciBkZXRlY3RlZC4gQ3VycmVudCBwbGFjZWhvbGRlciB0czogJHt0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyPy50aW1lc3RhbXB9LCBleHBlY3RlZCBmb3IgdGhpcyBzdHJlYW06ICR7Y3VycmVudFR1cm5MbG1SZXNwb25zZVRzfS4gQ2h1bmsgaWdub3JlZC5gKTtcclxuICAgICAgICBpZiAoY2h1bmsudHlwZSA9PT0gXCJkb25lXCIpIGJyZWFrO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoY2h1bmsudHlwZSA9PT0gXCJjb250ZW50XCIpIHtcclxuICAgICAgICBpZiAodGhpcy5hY3RpdmVQbGFjZWhvbGRlcj8uY29udGVudEVsKSB7XHJcbiAgICAgICAgICBpZiAoZmlyc3RDaHVua0ZvclR1cm4pIHtcclxuICAgICAgICAgICAgY29uc3QgdGhpbmtpbmdEb3RzID0gdGhpcy5hY3RpdmVQbGFjZWhvbGRlci5jb250ZW50RWwucXVlcnlTZWxlY3RvcihgLiR7Q1NTX0NMQVNTRVMuVEhJTktJTkdfRE9UU31gKTtcclxuICAgICAgICAgICAgaWYgKHRoaW5raW5nRG90cykgdGhpbmtpbmdEb3RzLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICBmaXJzdENodW5rRm9yVHVybiA9IGZhbHNlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgYWNjdW11bGF0ZWRDb250ZW50ICs9IGNodW5rLnJlc3BvbnNlO1xyXG4gICAgICAgICAgLy8gYXdhaXQgQXNzaXN0YW50TWVzc2FnZVJlbmRlcmVyLnJlbmRlckFzc2lzdGFudENvbnRlbnQoIC8vINCh0YLQsNGC0LjRh9C90LjQuSDQvNC10YLQvtC0LCDRj9C60LjQuSDQstC4INC/0LXRgNC10L3QtdGB0LvQuCDQtNC+IE1lc3NhZ2VSZW5kZXJlclV0aWxzXHJcbiAgICAgICAgICAvLyAgIHRoaXMuYXBwLCB0aGlzLnZpZXcsIHRoaXMucGx1Z2luLCB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmNvbnRlbnRFbCwgYWNjdW11bGF0ZWRDb250ZW50XHJcbiAgICAgICAgICAvLyApO1xyXG4gICAgICAgICAgaWYgKGNodW5rLnR5cGUgPT09IFwiY29udGVudFwiKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyPy5jb250ZW50RWwpIHtcclxuICAgICAgICAgICAgICAgIC8vIC4uLiAo0LLQuNC00LDQu9C10L3QvdGPINC60YDQsNC/0L7QuiwgZmlyc3RDaHVua0ZvclR1cm4pIC4uLlxyXG4gICAgICAgICAgICAgICAgYWNjdW11bGF0ZWRDb250ZW50ICs9IGNodW5rLnJlc3BvbnNlO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgUmVuZGVyZXJVdGlscy5yZW5kZXJNYXJrZG93bkNvbnRlbnQoIC8vINCQ0LHQviBBc3Npc3RhbnRNZXNzYWdlUmVuZGVyZXIucmVuZGVyQXNzaXN0YW50Q29udGVudFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXBwLFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMsIC8vIDwtLS0g0J/RgNCw0LLQuNC70YzQvdC+OiDQv9C10YDQtdC00LDRlNC80L4g0LXQutC30LXQvNC/0LvRj9GAIE9sbGFtYVZpZXdcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbixcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmNvbnRlbnRFbCwgLy8gPC0tLSDQn9GA0LDQstC40LvRjNC90L46IEhUTUwg0LXQu9C10LzQtdC90YIg0LTQu9GPINC60L7QvdGC0LXQvdGC0YNcclxuICAgICAgICAgICAgICAgICAgICBhY2N1bXVsYXRlZENvbnRlbnQgLy8gPC0tLSDQn9GA0LDQstC40LvRjNC90L46INGA0Y/QtNC+0Log0Lcg0LrQvtC90YLQtdC90YLQvtC8XHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ndWFyYW50ZWVkU2Nyb2xsVG9Cb3R0b20oMzAsIHRydWUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHRoaXMuZ3VhcmFudGVlZFNjcm9sbFRvQm90dG9tKDMwLCB0cnVlKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAoY2h1bmsudHlwZSA9PT0gXCJ0b29sX2NhbGxzXCIpIHtcclxuICAgICAgICBuYXRpdmVUb29sQ2FsbHMgPSBjaHVuay5jYWxscztcclxuICAgICAgICBhc3Npc3RhbnRNZXNzYWdlV2l0aE5hdGl2ZUNhbGxzID0gY2h1bmsuYXNzaXN0YW50X21lc3NhZ2Vfd2l0aF9jYWxscztcclxuICAgICAgICBpZiAoYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxscy5jb250ZW50ICYmICFhY2N1bXVsYXRlZENvbnRlbnQuaW5jbHVkZXMoYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxscy5jb250ZW50KSkge1xyXG4gICAgICAgICAgICBpZiAoZmlyc3RDaHVua0ZvclR1cm4gJiYgdGhpcy5hY3RpdmVQbGFjZWhvbGRlcj8uY29udGVudEVsKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0aGlua2luZ0RvdHMgPSB0aGlzLmFjdGl2ZVBsYWNlaG9sZGVyLmNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yKGAuJHtDU1NfQ0xBU1NFUy5USElOS0lOR19ET1RTfWApO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaW5raW5nRG90cykgdGhpbmtpbmdEb3RzLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICAgICAgZmlyc3RDaHVua0ZvclR1cm4gPSBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBhY2N1bXVsYXRlZENvbnRlbnQgKz0gYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxscy5jb250ZW50O1xyXG4gICAgICAgICAgICBpZiAodGhpcy5hY3RpdmVQbGFjZWhvbGRlcj8uY29udGVudEVsKSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBSZW5kZXJlclV0aWxzLnJlbmRlck1hcmtkb3duQ29udGVudCh0aGlzLmFwcCwgdGhpcywgdGhpcy5wbHVnaW4sIHRoaXMuYWN0aXZlUGxhY2Vob2xkZXIuY29udGVudEVsLCBhY2N1bXVsYXRlZENvbnRlbnQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgfSBlbHNlIGlmIChjaHVuay50eXBlID09PSBcImRvbmVcIikge1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYCR7YWNjdW11bGF0ZWRDb250ZW50fSBhY2N1bXVsYXRlZCBmcm9tIExMTSBzdHJlYW0uYCk7XHJcbiAgICByZXR1cm4geyBhY2N1bXVsYXRlZENvbnRlbnQsIG5hdGl2ZVRvb2xDYWxscywgYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxscyB9O1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBfZGV0ZXJtaW5lVG9vbENhbGxzKFxyXG4gICAgbmF0aXZlVG9vbENhbGxzOiBUb29sQ2FsbFtdIHwgbnVsbCxcclxuICAgIGFzc2lzdGFudE1lc3NhZ2VXaXRoTmF0aXZlQ2FsbHM6IEFzc2lzdGFudE1lc3NhZ2UgfCBudWxsLFxyXG4gICAgYWNjdW11bGF0ZWRMbG1Db250ZW50OiBzdHJpbmcsXHJcbiAgICBjdXJyZW50VHVybkxsbVJlc3BvbnNlVHM6IG51bWJlcixcclxuICAgIHJlcXVlc3RUaW1lc3RhbXBJZDogbnVtYmVyXHJcbiAgKToge1xyXG4gICAgcHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm46IFRvb2xDYWxsW10gfCBudWxsO1xyXG4gICAgYXNzaXN0YW50TWVzc2FnZUZvckhpc3Rvcnk6IEFzc2lzdGFudE1lc3NhZ2U7XHJcbiAgICBpc1RleHR1YWxGYWxsYmFja1VzZWQ6IGJvb2xlYW47XHJcbiAgfSB7XHJcbiAgICBsZXQgcHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm46IFRvb2xDYWxsW10gfCBudWxsID0gbmF0aXZlVG9vbENhbGxzO1xyXG4gICAgbGV0IGlzVGV4dHVhbEZhbGxiYWNrVXNlZCA9IGZhbHNlO1xyXG4gICAgbGV0IGFzc2lzdGFudE1lc3NhZ2VGb3JIaXN0b3J5OiBBc3Npc3RhbnRNZXNzYWdlO1xyXG5cclxuICAgIGlmICghcHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm4gfHwgcHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm4ubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW3NlbmRNZXNzYWdlIGlkOiR7cmVxdWVzdFRpbWVzdGFtcElkfV0gTm8gbmF0aXZlIHRvb2xfY2FsbHMuIENoZWNraW5nIHRleHR1YWwuIENvbnRlbnQgbGVuZ3RoOiAke2FjY3VtdWxhdGVkTGxtQ29udGVudC5sZW5ndGh9YCk7XHJcbiAgICAgIGNvbnN0IHBhcnNlZFRleHR1YWxDYWxscyA9IHBhcnNlQWxsVGV4dHVhbFRvb2xDYWxscyhhY2N1bXVsYXRlZExsbUNvbnRlbnQsIHRoaXMucGx1Z2luLmxvZ2dlcik7XHJcbiAgICAgICAgICAgIGlmIChwYXJzZWRUZXh0dWFsQ2FsbHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGlzVGV4dHVhbEZhbGxiYWNrVXNlZCA9IHRydWU7XHJcbiAgICAgICAgcHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm4gPSBwYXJzZWRUZXh0dWFsQ2FsbHMubWFwKCh0YywgaW5kZXgpID0+ICh7XHJcbiAgICAgICAgICB0eXBlOiBcImZ1bmN0aW9uXCIsXHJcbiAgICAgICAgICBpZDogYHRleHR0b29sLSR7Y3VycmVudFR1cm5MbG1SZXNwb25zZVRzfS0ke2luZGV4fWAsXHJcbiAgICAgICAgICBmdW5jdGlvbjogeyBuYW1lOiB0Yy5uYW1lLCBhcmd1bWVudHM6IEpTT04uc3RyaW5naWZ5KHRjLmFyZ3VtZW50cyB8fCB7fSkgfSxcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgYXNzaXN0YW50TWVzc2FnZUZvckhpc3RvcnkgPSB7XHJcbiAgICAgICAgICByb2xlOiBcImFzc2lzdGFudFwiLFxyXG4gICAgICAgICAgY29udGVudDogYWNjdW11bGF0ZWRMbG1Db250ZW50LCAvLyDQktC10YHRjCDRgdC40YDQuNC5INGC0LXQutGB0YIg0LLRltC0IExMTVxyXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZShjdXJyZW50VHVybkxsbVJlc3BvbnNlVHMpLFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5pbmZvKGBbc2VuZE1lc3NhZ2UgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBPcmNoZXN0cmF0b3I6IEZhbGxiYWNrIHRleHR1YWwgdG9vbF9jYWxscyBwYXJzZWQgKGNvdW50OiAke3Byb2Nlc3NlZFRvb2xDYWxsc1RoaXNUdXJuLmxlbmd0aH0pLmApO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vINCd0LXQvNCw0ZQg0LDQvdGWINC90LDRgtC40LLQvdC40YUsINCw0L3RliDRgtC10LrRgdGC0L7QstC40YVcclxuICAgICAgICBhc3Npc3RhbnRNZXNzYWdlRm9ySGlzdG9yeSA9IHtcclxuICAgICAgICAgIHJvbGU6IFwiYXNzaXN0YW50XCIsXHJcbiAgICAgICAgICBjb250ZW50OiBhY2N1bXVsYXRlZExsbUNvbnRlbnQsXHJcbiAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKGN1cnJlbnRUdXJuTGxtUmVzcG9uc2VUcyksXHJcbiAgICAgICAgfTtcclxuICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmluZm8oYFtzZW5kTWVzc2FnZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIE9yY2hlc3RyYXRvcjogTm8gbmF0aXZlIG9yIHRleHR1YWwgdG9vbCBjYWxscy4gRmluYWwgdGV4dCByZXNwb25zZS5gKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHsgLy8g0JHRg9C70Lgg0L3QsNGC0LjQstC90ZYgdG9vbF9jYWxsc1xyXG4gICAgICAgIGFzc2lzdGFudE1lc3NhZ2VGb3JIaXN0b3J5ID0gYXNzaXN0YW50TWVzc2FnZVdpdGhOYXRpdmVDYWxscyB8fCB7XHJcbiAgICAgICAgICAgIHJvbGU6IFwiYXNzaXN0YW50XCIsXHJcbiAgICAgICAgICAgIGNvbnRlbnQ6IGFjY3VtdWxhdGVkTGxtQ29udGVudCwgLy8g0JzQvtC20LUg0LHRg9GC0Lgg0L/QvtGA0L7QttC90ZbQvCwg0Y/QutGJ0L4g0YLRltC70YzQutC4IHRvb2xfY2FsbHNcclxuICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZShjdXJyZW50VHVybkxsbVJlc3BvbnNlVHMpLFxyXG4gICAgICAgICAgICB0b29sX2NhbGxzOiBwcm9jZXNzZWRUb29sQ2FsbHNUaGlzVHVybiBcclxuICAgICAgICB9O1xyXG4gICAgICAgIC8vINCf0LXRgNC10LrQvtC90YPRlNC80L7RgdGPLCDRidC+INC60L7QvdGC0LXQvdGCINGC0LAgdG9vbF9jYWxscyDQsNC60YLRg9Cw0LvRjNC90ZZcclxuICAgICAgICBhc3Npc3RhbnRNZXNzYWdlRm9ySGlzdG9yeS5jb250ZW50ID0gYWNjdW11bGF0ZWRMbG1Db250ZW50O1xyXG4gICAgICAgIGFzc2lzdGFudE1lc3NhZ2VGb3JIaXN0b3J5LnRvb2xfY2FsbHMgPSBwcm9jZXNzZWRUb29sQ2FsbHNUaGlzVHVybjtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuaW5mbyhgW3NlbmRNZXNzYWdlIGlkOiR7cmVxdWVzdFRpbWVzdGFtcElkfV0gT3JjaGVzdHJhdG9yOiBOYXRpdmUgdG9vbF9jYWxscyBkZXRlY3RlZCAoY291bnQ6ICR7cHJvY2Vzc2VkVG9vbENhbGxzVGhpc1R1cm4ubGVuZ3RofSkuYCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4geyBwcm9jZXNzZWRUb29sQ2FsbHNUaGlzVHVybiwgYXNzaXN0YW50TWVzc2FnZUZvckhpc3RvcnksIGlzVGV4dHVhbEZhbGxiYWNrVXNlZCB9O1xyXG4gIH1cclxuXHJcbiAgXHJcbiAgcHJpdmF0ZSBhc3luYyBfZXhlY3V0ZUFuZFJlbmRlclRvb2xDeWNsZShcclxuICAgIHRvb2xzVG9FeGVjdXRlOiBUb29sQ2FsbFtdLFxyXG4gICAgYXNzaXN0YW50TWVzc2FnZUludGVudDogQXNzaXN0YW50TWVzc2FnZSxcclxuICAgIHJlcXVlc3RUaW1lc3RhbXBJZDogbnVtYmVyXHJcbiAgKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBjdXJyZW50Vmlld0luc3RhbmNlID0gdGhpczsgLy8g0JfQsdC10YDRltCz0LDRlNC80L4gdGhpcyDQtNC70Y8g0LLQuNC60L7RgNC40YHRgtCw0L3QvdGPINCyINC60L7Qu9Cx0LXQutCw0YVcclxuICAgIGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmxvZ2dlci5pbmZvKGBbT2xsYW1hVmlld11bX2V4ZWN1dGVBbmRSZW5kZXJUb29sQ3ljbGUgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBFeGVjdXRpbmcgJHt0b29sc1RvRXhlY3V0ZS5sZW5ndGh9IHRvb2xzLmApO1xyXG5cclxuICAgIGNvbnN0IGFzc2lzdGFudE1zZ1RzTXMgPSBhc3Npc3RhbnRNZXNzYWdlSW50ZW50LnRpbWVzdGFtcC5nZXRUaW1lKCk7XHJcbiAgICBjb25zdCBhc3Npc3RhbnRIbWFQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5yZWdpc3RlckhNQVJlc29sdmVyKGFzc2lzdGFudE1zZ1RzTXMsIHJlc29sdmUsIHJlamVjdCk7XHJcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4geyBpZiAoY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmhhcyhhc3Npc3RhbnRNc2dUc01zKSkgeyBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5yZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKGFzc2lzdGFudE1zZ1RzTXMsIGBITUEgVGltZW91dCBmb3IgYXNzaXN0YW50IHRvb2wgaW50ZW50ICh0czogJHthc3Npc3RhbnRNc2dUc01zfSlgKTt9fSwgMTAwMDApO1xyXG4gICAgfSk7XHJcbiAgICBhd2FpdCBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0UGF5bG9hZChhc3Npc3RhbnRNZXNzYWdlSW50ZW50LCB0cnVlKTtcclxuICAgIGF3YWl0IGFzc2lzdGFudEhtYVByb21pc2U7XHJcbiAgICBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5sb2dnZXIuaW5mbyhgW09sbGFtYVZpZXddW19leGVjdXRlQW5kUmVuZGVyVG9vbEN5Y2xlIGlkOiR7cmVxdWVzdFRpbWVzdGFtcElkfV0gQXNzaXN0YW50IG1lc3NhZ2Ugd2l0aCB0b29sIGludGVudCAodHM6ICR7YXNzaXN0YW50TXNnVHNNc30pIHByb2Nlc3NlZCBieSBITUEuYCk7XHJcbiAgICBcclxuICAgIGlmIChjdXJyZW50Vmlld0luc3RhbmNlLmFjdGl2ZVBsYWNlaG9sZGVyPy50aW1lc3RhbXAgPT09IGFzc2lzdGFudE1zZ1RzTXMpIHtcclxuICAgICAgICBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtPbGxhbWFWaWV3XVtfZXhlY3V0ZUFuZFJlbmRlclRvb2xDeWNsZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIENsZWFyaW5nIGFjdGl2ZVBsYWNlaG9sZGVyICh0czogJHthc3Npc3RhbnRNc2dUc01zfSkgYXMgSE1BIHByb2Nlc3NlZCB0aGUgYXNzaXN0YW50IG1lc3NhZ2UuYCk7XHJcbiAgICAgICAgY3VycmVudFZpZXdJbnN0YW5jZS5hY3RpdmVQbGFjZWhvbGRlciA9IG51bGw7IFxyXG4gICAgfVxyXG5cclxuICAgIGZvciAoY29uc3QgY2FsbCBvZiB0b29sc1RvRXhlY3V0ZSkge1xyXG4gICAgICBpZiAoY3VycmVudFZpZXdJbnN0YW5jZS5jdXJyZW50QWJvcnRDb250cm9sbGVyPy5zaWduYWwuYWJvcnRlZCkgdGhyb3cgbmV3IEVycm9yKFwiYWJvcnRlZCBieSB1c2VyXCIpO1xyXG4gICAgICBpZiAoY2FsbC50eXBlID09PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgICAgICBjb25zdCB0b29sTmFtZSA9IGNhbGwuZnVuY3Rpb24ubmFtZTtcclxuICAgICAgICBsZXQgdG9vbEFyZ3MgPSB7fTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgdG9vbEFyZ3MgPSBKU09OLnBhcnNlKGNhbGwuZnVuY3Rpb24uYXJndW1lbnRzIHx8IFwie31cIik7IFxyXG4gICAgICAgIH0gY2F0Y2ggKGU6IGFueSkge1xyXG4gICAgICAgICAgY29uc3QgZXJyb3JDb250ZW50ID0gYEVycm9yIHBhcnNpbmcgYXJncyBmb3IgJHt0b29sTmFtZX06ICR7ZS5tZXNzYWdlfS4gQXJncyBzdHJpbmc6IFwiJHtjYWxsLmZ1bmN0aW9uLmFyZ3VtZW50c31cImA7XHJcbiAgICAgICAgICBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtPbGxhbWFWaWV3XVtfZXhlY3V0ZUFuZFJlbmRlclRvb2xDeWNsZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dICR7ZXJyb3JDb250ZW50fWAsIGUpO1xyXG4gICAgICAgICAgY29uc3QgZXJyb3JUb29sVGltZXN0YW1wID0gbmV3IERhdGUoKTtcclxuICAgICAgICAgIGNvbnN0IGVycm9yVG9vbE1zZzogTWVzc2FnZSA9IHsgcm9sZTogXCJ0b29sXCIsIHRvb2xfY2FsbF9pZDogY2FsbC5pZCwgbmFtZTogdG9vbE5hbWUsIGNvbnRlbnQ6IGVycm9yQ29udGVudCwgdGltZXN0YW1wOiBlcnJvclRvb2xUaW1lc3RhbXAgfTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgY29uc3QgdG9vbEVycm9ySG1hUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHsgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIucmVnaXN0ZXJITUFSZXNvbHZlcihlcnJvclRvb2xNc2cudGltZXN0YW1wLmdldFRpbWUoKSwgcmVzb2x2ZSwgcmVqZWN0KTsgc2V0VGltZW91dCgoKSA9PiB7aWYoY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmhhcyhlcnJvclRvb2xNc2cudGltZXN0YW1wLmdldFRpbWUoKSkpIHtjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5yZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKGVycm9yVG9vbE1zZy50aW1lc3RhbXAuZ2V0VGltZSgpLCBcIkhNQSB0aW1lb3V0IGZvciB0b29sIGVycm9yIG1zZ1wiKTt9fSwgMTAwMDApOyB9KTtcclxuICAgICAgICAgIGF3YWl0IGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXRQYXlsb2FkKGVycm9yVG9vbE1zZywgdHJ1ZSk7XHJcbiAgICAgICAgICB0cnkgeyBhd2FpdCB0b29sRXJyb3JIbWFQcm9taXNlOyB9IGNhdGNoKGVfaG1hKXtjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtPbGxhbWFWaWV3XVtfZXhlY3V0ZUFuZFJlbmRlclRvb2xDeWNsZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIEhNQSBlcnJvci90aW1lb3V0IGZvciB0b29sIGVycm9yIG1lc3NhZ2VgLCBlX2htYSk7fTtcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4ubG9nZ2VyLmluZm8oYFtPbGxhbWFWaWV3XVtfZXhlY3V0ZUFuZFJlbmRlclRvb2xDeWNsZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIEV4ZWN1dGluZyB0b29sOiAke3Rvb2xOYW1lfSB3aXRoIGFyZ3M6YCwgdG9vbEFyZ3MpO1xyXG4gICAgICAgIGNvbnN0IGV4ZWNSZXN1bHQgPSBhd2FpdCBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5hZ2VudE1hbmFnZXIuZXhlY3V0ZVRvb2wodG9vbE5hbWUsIHRvb2xBcmdzKTtcclxuICAgICAgICBjb25zdCB0b29sUmVzdWx0Q29udGVudCA9IGV4ZWNSZXN1bHQuc3VjY2VzcyA/IGV4ZWNSZXN1bHQucmVzdWx0IDogYEVycm9yIGV4ZWN1dGluZyB0b29sICR7dG9vbE5hbWV9OiAke2V4ZWNSZXN1bHQuZXJyb3IgfHwgXCJVbmtub3duIHRvb2wgZXJyb3JcIn1gO1xyXG4gICAgICAgIGNvbnN0IHRvb2xSZXNwb25zZVRpbWVzdGFtcCA9IG5ldyBEYXRlKCk7XHJcbiAgICAgICAgY29uc3QgdG9vbFJlc3BvbnNlTXNnOiBNZXNzYWdlID0geyByb2xlOiBcInRvb2xcIiwgdG9vbF9jYWxsX2lkOiBjYWxsLmlkLCBuYW1lOiB0b29sTmFtZSwgY29udGVudDogdG9vbFJlc3VsdENvbnRlbnQsIHRpbWVzdGFtcDogdG9vbFJlc3BvbnNlVGltZXN0YW1wIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgdG9vbFJlc3VsdEhtYVByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7IGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLnJlZ2lzdGVySE1BUmVzb2x2ZXIodG9vbFJlc3BvbnNlTXNnLnRpbWVzdGFtcC5nZXRUaW1lKCksIHJlc29sdmUsIHJlamVjdCk7IHNldFRpbWVvdXQoKCkgPT4geyBpZiAoY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmhhcyh0b29sUmVzcG9uc2VNc2cudGltZXN0YW1wLmdldFRpbWUoKSkpIHsgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIucmVqZWN0QW5kQ2xlYXJITUFSZXNvbHZlcih0b29sUmVzcG9uc2VNc2cudGltZXN0YW1wLmdldFRpbWUoKSwgYEhNQSBUaW1lb3V0IGZvciB0b29sIHJlc3VsdDogJHt0b29sTmFtZX1gKTt9fSwgMTAwMDApO30pO1xyXG4gICAgICAgIGF3YWl0IGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXRQYXlsb2FkKHRvb2xSZXNwb25zZU1zZywgdHJ1ZSk7XHJcbiAgICAgICAgYXdhaXQgdG9vbFJlc3VsdEhtYVByb21pc2U7XHJcbiAgICAgICAgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4ubG9nZ2VyLmluZm8oYFtPbGxhbWFWaWV3XVtfZXhlY3V0ZUFuZFJlbmRlclRvb2xDeWNsZSBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIFRvb2wgcmVzdWx0IGZvciAke3Rvb2xOYW1lfSAodHM6ICR7dG9vbFJlc3BvbnNlTXNnLnRpbWVzdGFtcC5nZXRUaW1lKCl9KSBwcm9jZXNzZWQgYnkgSE1BLmApO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5sb2dnZXIuaW5mbyhgW09sbGFtYVZpZXddW19leGVjdXRlQW5kUmVuZGVyVG9vbEN5Y2xlIGlkOiR7cmVxdWVzdFRpbWVzdGFtcElkfV0gRmluaXNoZWQgZXhlY3V0aW5nIGFsbCB0b29scyBmb3IgdGhpcyB0dXJuLmApO1xyXG4gIH1cclxuXHJcblxyXG4gIHByaXZhdGUgYXN5bmMgX3JlbmRlckZpbmFsQXNzaXN0YW50VGV4dChcclxuICAgIGZpbmFsQ29udGVudDogc3RyaW5nLFxyXG4gICAgcmVzcG9uc2VUaW1lc3RhbXBNczogbnVtYmVyLFxyXG4gICAgcmVxdWVzdFRpbWVzdGFtcElkOiBudW1iZXJcclxuICApOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IGN1cnJlbnRWaWV3SW5zdGFuY2UgPSB0aGlzOyAvLyDQl9Cx0LXRgNGW0LPQsNGU0LzQviB0aGlzXHJcbiAgICBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtPbGxhbWFWaWV3XVtfcmVuZGVyRmluYWxBc3Npc3RhbnRUZXh0IGlkOiR7cmVxdWVzdFRpbWVzdGFtcElkfV0gUHJvY2Vzc2luZyBmaW5hbCB0ZXh0IHJlc3BvbnNlIChsZW5ndGg6ICR7ZmluYWxDb250ZW50Lmxlbmd0aH0pLmApO1xyXG4gICAgXHJcbiAgICBpZiAoZmluYWxDb250ZW50LnRyaW0oKSkge1xyXG4gICAgICBjb25zdCBmaW5hbEFzc2lzdGFudE1zZzogTWVzc2FnZSA9IHsgcm9sZTogXCJhc3Npc3RhbnRcIiwgY29udGVudDogZmluYWxDb250ZW50LCB0aW1lc3RhbXA6IG5ldyBEYXRlKHJlc3BvbnNlVGltZXN0YW1wTXMpIH07XHJcbiAgICAgIGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW09sbGFtYVZpZXddW19yZW5kZXJGaW5hbEFzc2lzdGFudFRleHQgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBBZGRpbmcgZmluYWwgYXNzaXN0YW50IG1lc3NhZ2UgdG8gQ2hhdE1hbmFnZXIgKHRzOiAke3Jlc3BvbnNlVGltZXN0YW1wTXN9KS5gKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGhtYVByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7IGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLnJlZ2lzdGVySE1BUmVzb2x2ZXIocmVzcG9uc2VUaW1lc3RhbXBNcywgcmVzb2x2ZSwgcmVqZWN0KTsgc2V0VGltZW91dCgoKSA9PiB7IGlmIChjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5jaGF0TWFuYWdlci5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuaGFzKHJlc3BvbnNlVGltZXN0YW1wTXMpKSB7IGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLnJlamVjdEFuZENsZWFySE1BUmVzb2x2ZXIocmVzcG9uc2VUaW1lc3RhbXBNcywgXCJITUEgVGltZW91dCBmb3IgZmluYWwgYXNzaXN0YW50IG1lc3NhZ2VcIik7fX0sIDEwMDAwKTt9KTtcclxuICAgICAgYXdhaXQgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIuYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdFBheWxvYWQoZmluYWxBc3Npc3RhbnRNc2csIHRydWUpO1xyXG4gICAgICBhd2FpdCBobWFQcm9taXNlO1xyXG4gICAgICBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5sb2dnZXIuaW5mbyhgW09sbGFtYVZpZXddW19yZW5kZXJGaW5hbEFzc2lzdGFudFRleHQgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBGaW5hbCBhc3Npc3RhbnQgbWVzc2FnZSAodHM6ICR7cmVzcG9uc2VUaW1lc3RhbXBNc30pIHByb2Nlc3NlZCBieSBITUEuYCk7XHJcbiAgICB9IGVsc2UgaWYgKCFjdXJyZW50Vmlld0luc3RhbmNlLmN1cnJlbnRBYm9ydENvbnRyb2xsZXI/LnNpZ25hbC5hYm9ydGVkKSB7XHJcbiAgICAgIC8vIC4uLiAo0L7QsdGA0L7QsdC60LAg0L/QvtGA0L7QttC90YzQvtGXINCy0ZbQtNC/0L7QstGW0LTRliwg0LDQvdCw0LvQvtCz0ZbRh9C90L4g0Lcg0LLQuNC60L7RgNC40YHRgtCw0L3QvdGP0LwgcmVnaXN0ZXJITUFSZXNvbHZlcilcclxuICAgICAgY29uc3QgZW1wdHlSZXNwb25zZU1zZ1RpbWVzdGFtcCA9IG5ldyBEYXRlKCk7XHJcbiAgICAgIGNvbnN0IGVtcHR5UmVzcG9uc2VNc2c6IE1lc3NhZ2UgPSB7cm9sZTogXCJzeXN0ZW1cIiwgY29udGVudDogXCJBc3Npc3RhbnQgcHJvdmlkZWQgYW4gZW1wdHkgcmVzcG9uc2UuXCIsIHRpbWVzdGFtcDogZW1wdHlSZXNwb25zZU1zZ1RpbWVzdGFtcH07XHJcbiAgICAgIGNvbnN0IGhtYVByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7Y3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4uY2hhdE1hbmFnZXIucmVnaXN0ZXJITUFSZXNvbHZlcihlbXB0eVJlc3BvbnNlTXNnLnRpbWVzdGFtcC5nZXRUaW1lKCksIHJlc29sdmUsIHJlamVjdCk7IHNldFRpbWVvdXQoKCkgPT4ge2lmKGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5oYXMoZW1wdHlSZXNwb25zZU1zZy50aW1lc3RhbXAuZ2V0VGltZSgpKSkge2N1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLnJlamVjdEFuZENsZWFySE1BUmVzb2x2ZXIoZW1wdHlSZXNwb25zZU1zZy50aW1lc3RhbXAuZ2V0VGltZSgpLCBcIkhNQSB0aW1lb3V0IGZvciBlbXB0eSBzeXMgbXNnXCIpO319LCAxMDAwMCk7fSk7XHJcbiAgICAgIGF3YWl0IGN1cnJlbnRWaWV3SW5zdGFuY2UucGx1Z2luLmNoYXRNYW5hZ2VyLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXRQYXlsb2FkKGVtcHR5UmVzcG9uc2VNc2csIHRydWUpO1xyXG4gICAgICB0cnkgeyBhd2FpdCBobWFQcm9taXNlOyB9IGNhdGNoKGVfaG1hKXsgY3VycmVudFZpZXdJbnN0YW5jZS5wbHVnaW4ubG9nZ2VyLmVycm9yKGBbT2xsYW1hVmlld11bX3JlbmRlckZpbmFsQXNzaXN0YW50VGV4dCBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIEhNQSBlcnJvci90aW1lb3V0IGZvciBlbXB0eSByZXNwb25zZSBzeXN0ZW0gbWVzc2FnZWAsIGVfaG1hKTsgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChjdXJyZW50Vmlld0luc3RhbmNlLmFjdGl2ZVBsYWNlaG9sZGVyPy50aW1lc3RhbXAgPT09IHJlc3BvbnNlVGltZXN0YW1wTXMpIHtcclxuICAgICAgICBjdXJyZW50Vmlld0luc3RhbmNlLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtPbGxhbWFWaWV3XVtfcmVuZGVyRmluYWxBc3Npc3RhbnRUZXh0IGlkOiR7cmVxdWVzdFRpbWVzdGFtcElkfV0gQ2xlYXJpbmcgYWN0aXZlUGxhY2Vob2xkZXIgKHRzOiAke3Jlc3BvbnNlVGltZXN0YW1wTXN9KSBhZnRlciBmaW5hbCBhc3Npc3RhbnQgbWVzc2FnZS9lbXB0eSByZXNwb25zZS5gKTtcclxuICAgICAgICBjdXJyZW50Vmlld0luc3RhbmNlLmFjdGl2ZVBsYWNlaG9sZGVyID0gbnVsbDtcclxuICAgIH1cclxuICB9XHJcblxyXG59XHJcbiJdfQ==