"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
exports.__esModule = true;
exports.OllamaView = exports.VIEW_TYPE_OLLAMA_PERSONAS = void 0;
// OllamaView.ts
var obsidian_1 = require("obsidian");
// --- View Type ID ---
exports.VIEW_TYPE_OLLAMA_PERSONAS = "ollama-personas-chat-view"; // Оновлений ID
// --- CSS Classes ---
// Додаємо класи для акордеон-меню
var CSS_CLASS_CONTAINER = "ollama-container";
var CSS_CLASS_CHAT_CONTAINER = "ollama-chat-container";
var CSS_CLASS_INPUT_CONTAINER = "chat-input-container";
var CSS_CLASS_BUTTONS_CONTAINER = "buttons-container";
var CSS_CLASS_SEND_BUTTON = "send-button";
var CSS_CLASS_VOICE_BUTTON = "voice-button";
var CSS_CLASS_TRANSLATE_INPUT_BUTTON = "translate-input-button";
var CSS_CLASS_TRANSLATING_INPUT = "translating-input";
var CSS_CLASS_MENU_BUTTON = "menu-button";
var CSS_CLASS_MENU_DROPDOWN = "menu-dropdown"; // Основний контейнер меню
var CSS_CLASS_MENU_OPTION = "menu-option"; // Для всіх клікабельних пунктів
var CSS_CLASS_MENU_HEADER_ITEM = "menu-header-item"; // Клікабельний заголовок "підменю"
var CSS_CLASS_SUBMENU_ICON = "submenu-icon"; // Іконка стрілки >/v
var CSS_CLASS_SUBMENU_CONTENT = "submenu-content"; // Контейнер для списку "підменю"
var CSS_CLASS_SUBMENU_CONTENT_HIDDEN = "submenu-content-hidden"; // Клас для прихованого контейнера
var CSS_CLASS_SETTINGS_OPTION = "settings-option";
var CSS_CLASS_EMPTY_STATE = "ollama-empty-state";
var CSS_CLASS_MESSAGE_GROUP = "message-group";
var CSS_CLASS_USER_GROUP = "user-message-group";
var CSS_CLASS_OLLAMA_GROUP = "ollama-message-group";
var CSS_CLASS_SYSTEM_GROUP = "system-message-group";
var CSS_CLASS_ERROR_GROUP = "error-message-group";
var CSS_CLASS_MESSAGE = "message";
var CSS_CLASS_USER_MESSAGE = "user-message";
var CSS_CLASS_OLLAMA_MESSAGE = "ollama-message";
var CSS_CLASS_SYSTEM_MESSAGE = "system-message";
var CSS_CLASS_ERROR_MESSAGE = "error-message";
var CSS_CLASS_SYSTEM_ICON = "system-icon";
var CSS_CLASS_ERROR_ICON = "error-icon";
var CSS_CLASS_SYSTEM_TEXT = "system-message-text";
var CSS_CLASS_ERROR_TEXT = "error-message-text";
var CSS_CLASS_CONTENT_CONTAINER = "message-content-container";
var CSS_CLASS_CONTENT = "message-content";
var CSS_CLASS_THINKING_DOTS = "thinking-dots";
var CSS_CLASS_THINKING_DOT = "thinking-dot";
var CSS_CLASS_THINKING_BLOCK = "thinking-block";
var CSS_CLASS_THINKING_HEADER = "thinking-header";
var CSS_CLASS_THINKING_TOGGLE = "thinking-toggle";
var CSS_CLASS_THINKING_TITLE = "thinking-title";
var CSS_CLASS_THINKING_CONTENT = "thinking-content";
var CSS_CLASS_TIMESTAMP = "message-timestamp";
var CSS_CLASS_COPY_BUTTON = "copy-button";
var CSS_CLASS_TRANSLATE_BUTTON = "translate-button";
var CSS_CLASS_TRANSLATION_CONTAINER = "translation-container";
var CSS_CLASS_TRANSLATION_CONTENT = "translation-content";
var CSS_CLASS_TRANSLATION_PENDING = "translation-pending";
var CSS_CLASS_BUTTON_SPACER = "button-spacer";
var CSS_CLASS_TEXTAREA_EXPANDED = "expanded";
var CSS_CLASS_RECORDING = "recording";
var CSS_CLASS_DISABLED = "disabled";
var CSS_CLASS_MESSAGE_ARRIVING = "message-arriving";
var CSS_CLASS_DATE_SEPARATOR = "chat-date-separator";
var CSS_CLASS_AVATAR = "message-group-avatar";
var CSS_CLASS_AVATAR_USER = "user-avatar";
var CSS_CLASS_AVATAR_AI = "ai-avatar";
var CSS_CLASS_CODE_BLOCK_COPY_BUTTON = "code-block-copy-button";
var CSS_CLASS_CODE_BLOCK_LANGUAGE = "code-block-language";
var CSS_CLASS_NEW_MESSAGE_INDICATOR = "new-message-indicator";
var CSS_CLASS_VISIBLE = "visible";
var CSS_CLASS_MENU_SEPARATOR = "menu-separator";
var CSS_CLASS_CLEAR_CHAT_OPTION = "clear-chat-option";
var CSS_CLASS_EXPORT_CHAT_OPTION = "export-chat-option";
var CSS_CLASS_CONTENT_COLLAPSIBLE = "message-content-collapsible";
var CSS_CLASS_CONTENT_COLLAPSED = "message-content-collapsed";
var CSS_CLASS_SHOW_MORE_BUTTON = "show-more-button";
var CSS_CLASS_MODEL_OPTION = "model-option"; // Стиль для елементів списку
var CSS_CLASS_MODEL_LIST_CONTAINER = "model-list-container"; // Специфічний клас для контейнера
var CSS_CLASS_ROLE_OPTION = "role-option";
var CSS_CLASS_ROLE_LIST_CONTAINER = "role-list-container";
var CSS_CLASS_CHAT_OPTION = "chat-option";
var CSS_CLASS_CHAT_LIST_CONTAINER = "chat-list-container";
var CSS_CLASS_MENU_HEADER = "menu-header"; // НЕ клікабельний заголовок секції
var CSS_CLASS_NEW_CHAT_OPTION = "new-chat-option";
var CSS_CLASS_RENAME_CHAT_OPTION = "rename-chat-option";
var CSS_CLASS_DELETE_CHAT_OPTION = "delete-chat-option";
var CSS_CLASS_CLONE_CHAT_OPTION = "clone-chat-option";
var CSS_CLASS_DANGER_OPTION = "danger-option"; // Для небезпечних дій
var LANGUAGES = { /* ... ваш список мов ... */ "en": "English", "uk": "Ukrainian", "de": "German" };
var OllamaView = /** @class */ (function (_super) {
    __extends(OllamaView, _super);
    function OllamaView(leaf, plugin) {
        var _this = _super.call(this, leaf) || this;
        // --- State ---
        _this.isProcessing = false;
        _this.scrollTimeout = null;
        _this.speechWorker = null;
        _this.mediaRecorder = null;
        _this.audioStream = null;
        _this.emptyStateEl = null;
        _this.resizeTimeout = null;
        _this.currentMessages = [];
        _this.lastRenderedMessageDate = null;
        _this.newMessagesIndicatorEl = null;
        _this.userScrolledUp = false;
        // --- Event Handlers ---
        // Input & Sending
        _this.handleKeyDown = function (e) {
            console.log("[OllamaView] handleKeyDown: Key=<span class=\"math-inline\">{e.key}, Shift=</span>{e.shiftKey}"); // <--- ЛОГ
            if (e.key === "Enter" && !e.shiftKey && !_this.isProcessing && !_this.sendButton.disabled) {
                e.preventDefault();
                _this.sendMessage();
            }
        };
        _this.handleSendClick = function () {
            console.log("OllamaView.ts ->     : sendClick");
            if (!_this.isProcessing && !_this.sendButton.disabled) {
                _this.sendMessage();
            }
        };
        _this.handleInputForResize = function () {
            console.log("[OllamaView] handleSendClick called."); // <--- ЛОГ
            if (_this.resizeTimeout)
                clearTimeout(_this.resizeTimeout);
            _this.resizeTimeout = setTimeout(function () {
                _this.adjustTextareaHeight();
                _this.updateSendButtonState();
            }, 50);
        };
        // Input Area Buttons
        _this.handleVoiceClick = function () { _this.toggleVoiceRecognition(); };
        _this.handleTranslateInputClick = function () { return __awaiter(_this, void 0, Promise, function () { return __generator(this, function (_a) {
            return [2 /*return*/];
        }); }); };
        // Menu Button Click (Toggles Custom Div)
        _this.handleMenuClick = function (e) {
            e.stopPropagation();
            var isHidden = _this.menuDropdown.style.display === 'none';
            if (isHidden) {
                _this.menuDropdown.style.display = "block";
                _this.collapseAllSubmenus(null); // Collapse all when opening main menu
                // Don't render lists here, render them on expand
            }
            else {
                _this.closeMenu();
            }
        };
        // Action Handlers (Must call closeMenu)
        _this.handleNewChatClick = function () { return __awaiter(_this, void 0, Promise, function () { return __generator(this, function (_a) {
            this.closeMenu(); /* ... (logic) ... */
            return [2 /*return*/];
        }); }); };
        _this.handleRenameChatClick = function () { return __awaiter(_this, void 0, Promise, function () { return __generator(this, function (_a) {
            this.closeMenu(); /* ... (logic) ... */
            this.focusInput();
            return [2 /*return*/];
        }); }); };
        _this.handleCloneChatClick = function () { return __awaiter(_this, void 0, Promise, function () { return __generator(this, function (_a) {
            this.closeMenu(); /* ... (logic) ... */
            return [2 /*return*/];
        }); }); };
        _this.handleClearChatClick = function () { return __awaiter(_this, void 0, Promise, function () { return __generator(this, function (_a) {
            this.closeMenu(); /* ... (logic) ... */
            return [2 /*return*/];
        }); }); };
        _this.handleDeleteChatClick = function () { return __awaiter(_this, void 0, Promise, function () { return __generator(this, function (_a) {
            this.closeMenu(); /* ... (logic) ... */
            return [2 /*return*/];
        }); }); };
        _this.handleExportChatClick = function () { return __awaiter(_this, void 0, Promise, function () { return __generator(this, function (_a) {
            this.closeMenu(); /* ... (logic) ... */
            return [2 /*return*/];
        }); }); };
        _this.handleSettingsClick = function () { return __awaiter(_this, void 0, Promise, function () { return __generator(this, function (_a) {
            this.closeMenu(); /* ... (logic) ... */
            return [2 /*return*/];
        }); }); };
        _this.handleDocumentClickForMenu = function (e) {
            if (_this.isMenuOpen() && !_this.menuButton.contains(e.target) && !_this.menuDropdown.contains(e.target)) {
                _this.closeMenu();
            }
        };
        // --- Plugin Event Handlers ---
        _this.handleModelChange = function (modelName) { /* ... */ _this.updateInputPlaceholder(modelName); if (_this.currentMessages.length > 0)
            _this.addMessageToDisplay("system", "Model changed to: " + modelName, new Date()); };
        _this.handleRoleChange = function (roleName) { /* ... */ var displayRole = roleName || "Default Assistant"; if (_this.currentMessages.length > 0)
            _this.addMessageToDisplay("system", "Role changed to: " + displayRole, new Date());
        else
            new obsidian_1.Notice("Role set to: " + displayRole); };
        _this.handleRolesUpdated = function () { var _a; (_a = _this.plugin.promptService) === null || _a === void 0 ? void 0 : _a.clearRoleCache(); console.log("Roles updated: Cleared prompt service role cache."); };
        _this.handleChatListUpdated = function () { console.log("Chat list updated event received."); };
        _this.handleActiveChatChanged = function (data) { _this.loadAndDisplayActiveChat(); };
        _this.handleMessageAdded = function (data) { var _a; if (data.chatId === ((_a = _this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChatId())) {
            _this.addMessageToDisplay(data.message.role, data.message.content, data.message.timestamp);
        } };
        _this.handleMessagesCleared = function (chatId) { var _a; if (chatId === ((_a = _this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChatId())) {
            _this.clearChatContainerInternal();
            _this.currentMessages = [];
            _this.showEmptyState();
        } };
        // --- Window/Workspace State Handlers ---
        _this.handleVisibilityChange = function () { /* ... */ if (document.visibilityState === 'visible' && _this.leaf.view === _this) {
            requestAnimationFrame(function () { var _a; _this.guaranteedScrollToBottom(50, true); _this.adjustTextareaHeight(); (_a = _this.inputEl) === null || _a === void 0 ? void 0 : _a.focus(); });
        } };
        _this.handleActiveLeafChange = function (leaf) { var _a; /* ... */ if ((leaf === null || leaf === void 0 ? void 0 : leaf.view) === _this) {
            (_a = _this.inputEl) === null || _a === void 0 ? void 0 : _a.focus();
            setTimeout(function () { return _this.guaranteedScrollToBottom(150, true); }, 100);
        } };
        _this.handleWindowResize = function () { /* ... */ if (_this.resizeTimeout)
            clearTimeout(_this.resizeTimeout); _this.resizeTimeout = setTimeout(function () { return _this.adjustTextareaHeight(); }, 100); };
        // --- Scroll Handling ---
        _this.handleScroll = function () {
            if (!_this.chatContainer || !_this.newMessagesIndicatorEl)
                return;
            var threshold = 150;
            var atBottom = _this.chatContainer.scrollHeight - _this.chatContainer.scrollTop - _this.chatContainer.clientHeight < threshold;
            var previousScrolledUp = _this.userScrolledUp;
            _this.userScrolledUp = !atBottom;
            if (previousScrolledUp && atBottom) {
                _this.newMessagesIndicatorEl.classList.remove(CSS_CLASS_VISIBLE);
            }
        };
        _this.handleNewMessageIndicatorClick = function () { var _a; /* ... */ if (_this.chatContainer) {
            _this.chatContainer.scrollTo({ top: _this.chatContainer.scrollHeight, behavior: 'smooth' });
        } (_a = _this.newMessagesIndicatorEl) === null || _a === void 0 ? void 0 : _a.classList.remove(CSS_CLASS_VISIBLE); _this.userScrolledUp = false; };
        _this.adjustTextareaHeight = function () {
            requestAnimationFrame(function () {
                if (!_this.inputEl || !_this.buttonsContainer)
                    return;
                var maxHeightPercentage = 0.50;
                var minHeight = 40;
                var viewHeight = _this.contentEl.clientHeight;
                var maxHeight = Math.max(100, viewHeight * maxHeightPercentage);
                _this.inputEl.style.height = 'auto';
                var scrollHeight = _this.inputEl.scrollHeight;
                var newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
                _this.inputEl.style.height = newHeight + "px";
                _this.inputEl.classList.toggle(CSS_CLASS_TEXTAREA_EXPANDED, scrollHeight > maxHeight);
            });
        };
        _this.plugin = plugin;
        _this.initSpeechWorker();
        _this.scrollListenerDebounced = obsidian_1.debounce(_this.handleScroll, 150, true);
        console.log("[OllamaView] Constructed.");
        return _this;
    }
    // --- Getters ---
    OllamaView.prototype.isMenuOpen = function () {
        var _a;
        return ((_a = this.menuDropdown) === null || _a === void 0 ? void 0 : _a.style.display) === 'block';
    };
    // --- Obsidian View Methods ---
    OllamaView.prototype.getViewType = function () { return exports.VIEW_TYPE_OLLAMA_PERSONAS; };
    OllamaView.prototype.getDisplayText = function () { return "Ollama Personas"; };
    OllamaView.prototype.getIcon = function () { return "message-square"; };
    OllamaView.prototype.onOpen = function () {
        var _a;
        return __awaiter(this, void 0, Promise, function () {
            var error_1;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log("[OllamaView] onOpen called.");
                        this.createUIElements();
                        this.updateInputPlaceholder(this.plugin.settings.modelName);
                        this.attachEventListeners();
                        this.autoResizeTextarea();
                        this.updateSendButtonState();
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.loadAndDisplayActiveChat()];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _b.sent();
                        console.error("[OllamaView] Error during initial chat load:", error_1);
                        this.showEmptyState();
                        return [3 /*break*/, 4];
                    case 4:
                        setTimeout(function () { var _a; return (_a = _this.inputEl) === null || _a === void 0 ? void 0 : _a.focus(); }, 150);
                        (_a = this.inputEl) === null || _a === void 0 ? void 0 : _a.dispatchEvent(new Event('input'));
                        return [2 /*return*/];
                }
            });
        });
    };
    OllamaView.prototype.onClose = function () {
        return __awaiter(this, void 0, Promise, function () {
            return __generator(this, function (_a) {
                console.log("[OllamaView] onClose: Cleaning up...");
                if (this.speechWorker) {
                    this.speechWorker.terminate();
                    this.speechWorker = null;
                }
                this.stopVoiceRecording(false);
                if (this.audioStream) {
                    this.audioStream.getTracks().forEach(function (t) { return t.stop(); });
                    this.audioStream = null;
                }
                if (this.scrollTimeout)
                    clearTimeout(this.scrollTimeout);
                if (this.resizeTimeout)
                    clearTimeout(this.resizeTimeout);
                return [2 /*return*/];
            });
        });
    };
    // --- UI Creation (with Custom Div Menu & Accordion) ---
    OllamaView.prototype.createUIElements = function () {
        var _this = this;
        this.contentEl.empty();
        this.chatContainerEl = this.contentEl.createDiv({ cls: CSS_CLASS_CONTAINER });
        this.chatContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_CHAT_CONTAINER });
        this.newMessagesIndicatorEl = this.chatContainerEl.createDiv({ cls: CSS_CLASS_NEW_MESSAGE_INDICATOR });
        obsidian_1.setIcon(this.newMessagesIndicatorEl.createSpan({ cls: "indicator-icon" }), "arrow-down");
        this.newMessagesIndicatorEl.createSpan({ text: " New Messages" });
        var inputContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER });
        this.inputEl = inputContainer.createEl("textarea", { attr: { placeholder: "Text...", rows: 1 } });
        this.buttonsContainer = inputContainer.createDiv({ cls: CSS_CLASS_BUTTONS_CONTAINER });
        // Input Buttons
        this.sendButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_SEND_BUTTON, attr: { 'aria-label': 'Send' } });
        obsidian_1.setIcon(this.sendButton, "send");
        this.voiceButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_VOICE_BUTTON, attr: { 'aria-label': 'Voice Input' } });
        obsidian_1.setIcon(this.voiceButton, "mic");
        this.translateInputButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_TRANSLATE_INPUT_BUTTON, attr: { 'aria-label': 'Translate input to English' } });
        obsidian_1.setIcon(this.translateInputButton, "replace");
        this.translateInputButton.title = "Translate input to English";
        this.menuButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_MENU_BUTTON, attr: { 'aria-label': 'Menu' } });
        obsidian_1.setIcon(this.menuButton, "more-vertical");
        // --- Custom Menu Dropdown Structure (Accordion Style) ---
        this.menuDropdown = inputContainer.createEl("div", { cls: [CSS_CLASS_MENU_DROPDOWN, "ollama-chat-menu"] });
        this.menuDropdown.style.display = "none"; // Initially hidden
        // Helper function to create submenu sections
        var createSubmenuSection = function (title, icon, listContainerClass) {
            // Clickable Header
            var header = _this.menuDropdown.createDiv({ cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_MENU_HEADER_ITEM });
            obsidian_1.setIcon(header.createSpan({ cls: "menu-option-icon" }), icon);
            header.createSpan({ cls: "menu-option-text", text: title });
            obsidian_1.setIcon(header.createSpan({ cls: CSS_CLASS_SUBMENU_ICON }), "chevron-right"); // Initial state: collapsed
            // Content Container (initially hidden)
            var content = _this.menuDropdown.createDiv({ cls: CSS_CLASS_SUBMENU_CONTENT + " " + CSS_CLASS_SUBMENU_CONTENT_HIDDEN + " " + listContainerClass });
            content.style.maxHeight = '0';
            content.style.overflow = 'hidden';
            content.style.transition = 'max-height 0.3s ease-out, padding 0.3s ease-out'; // Add padding transition
            content.style.paddingTop = '0';
            content.style.paddingBottom = '0';
            return { header: header, content: content };
        };
        // Create sections using the helper
        var modelSection = createSubmenuSection("Select Model", "list-collapse", CSS_CLASS_MODEL_LIST_CONTAINER);
        this.modelSubmenuHeader = modelSection.header;
        this.modelSubmenuContent = modelSection.content;
        var roleSection = createSubmenuSection("Select Role", "users", CSS_CLASS_ROLE_LIST_CONTAINER);
        this.roleSubmenuHeader = roleSection.header;
        this.roleSubmenuContent = roleSection.content;
        var chatSection = createSubmenuSection("Load Chat", "messages-square", CSS_CLASS_CHAT_LIST_CONTAINER);
        this.chatSubmenuHeader = chatSection.header;
        this.chatSubmenuContent = chatSection.content;
        this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });
        // Action items (Directly in the menu)
        this.menuDropdown.createEl("div", { text: "Actions", cls: CSS_CLASS_MENU_HEADER });
        this.newChatOption = this.menuDropdown.createEl("div", { cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_NEW_CHAT_OPTION });
        obsidian_1.setIcon(this.newChatOption.createSpan({ cls: "menu-option-icon" }), "plus-circle");
        this.newChatOption.createSpan({ cls: "menu-option-text", text: "New Chat" });
        this.renameChatOption = this.menuDropdown.createEl("div", { cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_RENAME_CHAT_OPTION });
        obsidian_1.setIcon(this.renameChatOption.createSpan({ cls: "menu-option-icon" }), "pencil");
        this.renameChatOption.createSpan({ cls: "menu-option-text", text: "Rename Chat" });
        this.cloneChatOption = this.menuDropdown.createEl("div", { cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_CLONE_CHAT_OPTION });
        obsidian_1.setIcon(this.cloneChatOption.createSpan({ cls: "menu-option-icon" }), "copy-plus");
        this.cloneChatOption.createSpan({ cls: "menu-option-text", text: "Clone Chat" });
        this.exportChatOption = this.menuDropdown.createEl("div", { cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_EXPORT_CHAT_OPTION });
        obsidian_1.setIcon(this.exportChatOption.createSpan({ cls: "menu-option-icon" }), "download");
        this.exportChatOption.createSpan({ cls: "menu-option-text", text: "Export Chat" });
        this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });
        // Danger Zone
        this.clearChatOption = this.menuDropdown.createEl("div", { cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_CLEAR_CHAT_OPTION + " " + CSS_CLASS_DANGER_OPTION });
        obsidian_1.setIcon(this.clearChatOption.createSpan({ cls: "menu-option-icon" }), "trash");
        this.clearChatOption.createSpan({ cls: "menu-option-text", text: "Clear Messages" });
        this.deleteChatOption = this.menuDropdown.createEl("div", { cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_DELETE_CHAT_OPTION + " " + CSS_CLASS_DANGER_OPTION });
        obsidian_1.setIcon(this.deleteChatOption.createSpan({ cls: "menu-option-icon" }), "trash-2");
        this.deleteChatOption.createSpan({ cls: "menu-option-text", text: "Delete Chat" });
        this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });
        // Settings
        this.settingsOption = this.menuDropdown.createEl("div", { cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_SETTINGS_OPTION });
        obsidian_1.setIcon(this.settingsOption.createSpan({ cls: "menu-option-icon" }), "settings");
        this.settingsOption.createSpan({ cls: "menu-option-text", text: "Settings" });
        // --- End Custom Menu ---
    };
    // --- Event Listeners (with Custom Div Menu) ---
    OllamaView.prototype.attachEventListeners = function () {
        var _this = this;
        // Input area listeners
        this.inputEl.addEventListener("keydown", this.handleKeyDown);
        this.inputEl.addEventListener('input', this.handleInputForResize);
        // Button listeners
        this.sendButton.addEventListener("click", this.handleSendClick);
        this.voiceButton.addEventListener("click", this.handleVoiceClick);
        this.translateInputButton.addEventListener("click", this.handleTranslateInputClick);
        this.menuButton.addEventListener("click", this.handleMenuClick); // Toggles main dropdown
        // --- Listeners for Custom Menu Items ---
        // Submenu Headers (for expanding/collapsing)
        this.registerDomEvent(this.modelSubmenuHeader, 'click', function () { return _this.toggleSubmenu(_this.modelSubmenuHeader, _this.modelSubmenuContent, 'models'); });
        this.registerDomEvent(this.roleSubmenuHeader, 'click', function () { return _this.toggleSubmenu(_this.roleSubmenuHeader, _this.roleSubmenuContent, 'roles'); });
        this.registerDomEvent(this.chatSubmenuHeader, 'click', function () { return _this.toggleSubmenu(_this.chatSubmenuHeader, _this.chatSubmenuContent, 'chats'); });
        // Action Items
        this.settingsOption.addEventListener("click", this.handleSettingsClick);
        this.clearChatOption.addEventListener("click", this.handleClearChatClick);
        this.exportChatOption.addEventListener("click", this.handleExportChatClick);
        this.newChatOption.addEventListener("click", this.handleNewChatClick);
        this.renameChatOption.addEventListener("click", this.handleRenameChatClick);
        this.cloneChatOption.addEventListener("click", this.handleCloneChatClick);
        this.deleteChatOption.addEventListener("click", this.handleDeleteChatClick);
        // --- End Custom Menu Listeners ---
        // Window/Workspace/Document listeners
        this.registerDomEvent(window, 'resize', this.handleWindowResize);
        this.registerEvent(this.app.workspace.on('resize', this.handleWindowResize));
        this.registerDomEvent(document, 'click', this.handleDocumentClickForMenu); // Close menu on outside click
        this.registerDomEvent(document, 'visibilitychange', this.handleVisibilityChange);
        this.registerEvent(this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange));
        this.registerDomEvent(this.chatContainer, 'scroll', this.scrollListenerDebounced);
        if (this.newMessagesIndicatorEl) {
            this.registerDomEvent(this.newMessagesIndicatorEl, 'click', this.handleNewMessageIndicatorClick);
        }
        // Plugin/ChatManager Event Listeners
        this.register(this.plugin.on('model-changed', this.handleModelChange));
        this.register(this.plugin.on('role-changed', this.handleRoleChange));
        this.register(this.plugin.on('roles-updated', this.handleRolesUpdated));
        this.register(this.plugin.on('active-chat-changed', this.handleActiveChatChanged));
        this.register(this.plugin.on('message-added', this.handleMessageAdded));
        this.register(this.plugin.on('messages-cleared', this.handleMessagesCleared));
        this.register(this.plugin.on('chat-list-updated', this.handleChatListUpdated));
    };
    // Handles clicks on submenu headers (Model, Role, Chat)
    OllamaView.prototype.toggleSubmenu = function (headerEl, contentEl, type) {
        return __awaiter(this, void 0, Promise, function () {
            var iconEl, isHidden, _a, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        iconEl = headerEl.querySelector("." + CSS_CLASS_SUBMENU_ICON);
                        isHidden = contentEl.style.maxHeight === '0px' || contentEl.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
                        // Згортаємо інші підменю
                        if (isHidden) {
                            this.collapseAllSubmenus(contentEl);
                        }
                        if (!isHidden) return [3 /*break*/, 11];
                        // Розгортаємо поточне підменю
                        contentEl.empty();
                        contentEl.createDiv({ cls: "menu-loading", text: "Loading " + type + "..." });
                        // --- ВИПРАВЛЕНО: Перевірка типу перед setIcon ---
                        if (iconEl instanceof HTMLElement) { // <--- Перевірка типу
                            obsidian_1.setIcon(iconEl, 'chevron-down');
                        }
                        // ---------------------------------------------
                        contentEl.classList.remove(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
                        contentEl.style.paddingTop = '5px';
                        contentEl.style.paddingBottom = '5px';
                        contentEl.style.maxHeight = '40px'; // Початкова висота для "Loading..."
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 9, , 10]);
                        _a = type;
                        switch (_a) {
                            case 'models': return [3 /*break*/, 2];
                            case 'roles': return [3 /*break*/, 4];
                            case 'chats': return [3 /*break*/, 6];
                        }
                        return [3 /*break*/, 8];
                    case 2: return [4 /*yield*/, this.renderModelList()];
                    case 3:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 4: return [4 /*yield*/, this.renderRoleList()];
                    case 5:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 6: return [4 /*yield*/, this.renderChatListMenu()];
                    case 7:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 8:
                        // Оновлюємо висоту після рендерингу
                        requestAnimationFrame(function () {
                            if (!contentEl.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN)) {
                                contentEl.style.maxHeight = contentEl.scrollHeight + 'px';
                            }
                        });
                        return [3 /*break*/, 10];
                    case 9:
                        error_2 = _b.sent();
                        console.error("Error rendering " + type + " list:", error_2);
                        contentEl.empty();
                        contentEl.createDiv({ cls: "menu-error-text", text: "Error loading " + type + "." });
                        contentEl.style.maxHeight = '50px'; // Залишаємо трохи місця для помилки
                        return [3 /*break*/, 10];
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        // Згортаємо поточне підменю
                        contentEl.classList.add(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
                        contentEl.style.maxHeight = '0';
                        contentEl.style.paddingTop = '0';
                        contentEl.style.paddingBottom = '0';
                        // --- ВИПРАВЛЕНО: Перевірка типу перед setIcon ---
                        if (iconEl instanceof HTMLElement) { // <--- Перевірка типу
                            obsidian_1.setIcon(iconEl, 'chevron-right');
                        }
                        _b.label = 12;
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    // Helper to collapse all submenus except the one potentially being opened
    // OllamaView.ts -> collapseAllSubmenus method
    OllamaView.prototype.collapseAllSubmenus = function (exceptContent) {
        var submenus = [
            { header: this.modelSubmenuHeader, content: this.modelSubmenuContent },
            { header: this.roleSubmenuHeader, content: this.roleSubmenuContent },
            { header: this.chatSubmenuHeader, content: this.chatSubmenuContent }
        ];
        submenus.forEach(function (submenu) {
            if (submenu.content && submenu.header && submenu.content !== exceptContent) {
                submenu.content.classList.add(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
                submenu.content.style.maxHeight = '0';
                submenu.content.style.paddingTop = '0';
                submenu.content.style.paddingBottom = '0';
                var iconEl = submenu.header.querySelector("." + CSS_CLASS_SUBMENU_ICON);
                // --- ВИПРАВЛЕНО: Перевірка типу перед setIcon ---
                if (iconEl instanceof HTMLElement) { // <--- Перевірка типу
                    obsidian_1.setIcon(iconEl, 'chevron-right');
                }
                // ---------------------------------------------
            }
        });
    };
    // --- UI Update Methods ---
    OllamaView.prototype.updateInputPlaceholder = function (modelName) {
        if (this.inputEl) {
            this.inputEl.placeholder = modelName ? "Text to " + modelName + "..." : "Select a model...";
        }
    };
    OllamaView.prototype.closeMenu = function () {
        if (this.menuDropdown) {
            this.menuDropdown.style.display = "none";
            this.collapseAllSubmenus(null); // Collapse all when closing main menu
        }
    };
    OllamaView.prototype.autoResizeTextarea = function () {
        this.adjustTextareaHeight();
    };
    OllamaView.prototype.updateSendButtonState = function () {
        if (!this.inputEl || !this.sendButton)
            return;
        var isDisabled = this.inputEl.value.trim() === '' || this.isProcessing;
        this.sendButton.disabled = isDisabled;
        this.sendButton.classList.toggle(CSS_CLASS_DISABLED, isDisabled);
    };
    OllamaView.prototype.showEmptyState = function () {
        var _a, _b;
        if (this.currentMessages.length === 0 && !this.emptyStateEl && this.chatContainer) {
            this.chatContainer.empty();
            this.emptyStateEl = this.chatContainer.createDiv({ cls: CSS_CLASS_EMPTY_STATE });
            this.emptyStateEl.createDiv({ cls: "empty-state-message", text: "No messages yet" });
            var modelName = ((_b = (_a = this.plugin) === null || _a === void 0 ? void 0 : _a.settings) === null || _b === void 0 ? void 0 : _b.modelName) || "the AI";
            this.emptyStateEl.createDiv({ cls: "empty-state-tip", text: "Type a message or use the menu to start interacting with " + modelName + "." });
        }
    };
    OllamaView.prototype.hideEmptyState = function () {
        // Remove the empty state message
        if (this.emptyStateEl) {
            this.emptyStateEl.remove();
            this.emptyStateEl = null;
        }
    };
    // --- Message Handling & Rendering ---
    /** Loads the active chat session from ChatManager and displays its messages */
    OllamaView.prototype.loadAndDisplayActiveChat = function () {
        var _a;
        return __awaiter(this, void 0, Promise, function () {
            var activeChat, error_3;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        //console.log("[OllamaView] Loading and displaying active chat...");
                        this.clearChatContainerInternal(); // Clear previous content & state
                        this.currentMessages = [];
                        this.lastRenderedMessageDate = null;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 2:
                        activeChat = _b.sent();
                        if (activeChat && activeChat.messages.length > 0) {
                            //console.log(`[OllamaView] Active chat '${activeChat.metadata.name}' found with ${activeChat.messages.length} messages.`);
                            this.hideEmptyState();
                            this.renderMessages(activeChat.messages); // Render the loaded messages
                            this.updateInputPlaceholder(activeChat.metadata.modelName || this.plugin.settings.modelName);
                            // Check collapsing and scroll after rendering
                            this.checkAllMessagesForCollapsing();
                            setTimeout(function () { _this.guaranteedScrollToBottom(100, true); }, 150); // Scroll after render
                        }
                        else if (activeChat) {
                            //console.log(`[OllamaView] Active chat '${activeChat.metadata.name}' found but is empty.`);
                            // Chat exists but is empty
                            this.showEmptyState();
                            this.updateInputPlaceholder(activeChat.metadata.modelName || this.plugin.settings.modelName);
                        }
                        else {
                            //console.warn("[OllamaView] No active chat found or failed to load.");
                            // No active chat found or failed to load
                            this.showEmptyState();
                            this.updateInputPlaceholder(this.plugin.settings.modelName); // Fallback placeholder
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_3 = _b.sent();
                        //console.error("[OllamaView] Error getting active chat:", error);
                        this.showEmptyState();
                        new obsidian_1.Notice("Error loading chat history.");
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /** Renders a list of messages to the chat container */
    OllamaView.prototype.renderMessages = function (messagesToRender) {
        var _this = this;
        this.clearChatContainerInternal(); // Ensure container is empty first
        this.currentMessages = __spreadArrays(messagesToRender); // Update local cache
        this.lastRenderedMessageDate = null; // Reset date separator logic
        messagesToRender.forEach(function (message) {
            _this.renderMessageInternal(message, messagesToRender); // Render each message
        });
        //console.log(`[OllamaView] Rendered ${messagesToRender.length} messages.`);
    };
    /** Appends a single message to the display */
    OllamaView.prototype.addMessageToDisplay = function (role, content, timestamp) {
        // Avoid adding if container doesn't exist (e.g., during close)
        if (!this.chatContainer)
            return;
        var newMessage = { role: role, content: content, timestamp: timestamp };
        var currentContext = __spreadArrays(this.currentMessages); // Capture context *before* adding
        // Render the new message using the captured context
        var messageEl = this.renderMessageInternal(newMessage, __spreadArrays(currentContext, [newMessage]));
        // Update local cache AFTER rendering to ensure correct prevMessage context
        this.currentMessages.push(newMessage);
        if (messageEl) {
            this.checkMessageForCollapsing(messageEl); // Check height for collapsing
        }
        // Handle scrolling and new message indicator
        var isUserOrError = role === "user" || role === "error";
        if (!isUserOrError && this.userScrolledUp && this.newMessagesIndicatorEl) {
            this.newMessagesIndicatorEl.classList.add(CSS_CLASS_VISIBLE); // Show indicator
        }
        else if (!this.userScrolledUp) {
            // Scroll down if user is already at the bottom
            var forceScroll = !isUserOrError; // Force scroll more reliably for AI messages
            // Use slightly longer delay for AI messages to allow rendering
            this.guaranteedScrollToBottom(forceScroll ? 100 : 50, forceScroll);
        }
        this.hideEmptyState(); // Ensure empty state is hidden
    };
    /** Sends the user's input as a message and gets a response */
    OllamaView.prototype.sendMessage = function () {
        var _a;
        return __awaiter(this, void 0, Promise, function () {
            var content, activeChat, userMessageContent, loadingEl, userMessage, assistantMessage, error_4;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        content = this.inputEl.value.trim();
                        if (!content || this.isProcessing || this.sendButton.disabled)
                            return [2 /*return*/];
                        return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 1:
                        activeChat = _b.sent();
                        if (!activeChat) {
                            new obsidian_1.Notice("Error: No active chat session found.");
                            return [2 /*return*/];
                        }
                        userMessageContent = this.inputEl.value;
                        this.clearInputField(); // Clear input immediately
                        this.setLoadingState(true); // Disable UI, set processing state
                        this.hideEmptyState();
                        loadingEl = null;
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 8, 9, 10]);
                        return [4 /*yield*/, this.plugin.chatManager.addMessageToActiveChat('user', userMessageContent)];
                    case 3:
                        userMessage = _b.sent();
                        if (!userMessage)
                            throw new Error("Failed to add user message to history.");
                        // User message appears via event handler
                        // 2. Show loading indicator *after* user message is likely added
                        loadingEl = this.addLoadingIndicator();
                        this.guaranteedScrollToBottom(50, true); // Scroll to show indicator
                        return [4 /*yield*/, this.plugin.ollamaService.generateChatResponse(activeChat)];
                    case 4:
                        assistantMessage = _b.sent();
                        //console.log("[OllamaView] Received response from service.");
                        // Remove indicator BEFORE adding assistant message
                        if (loadingEl) {
                            this.removeLoadingIndicator(loadingEl);
                            loadingEl = null;
                        }
                        if (!assistantMessage) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.plugin.chatManager.addMessageToActiveChat(assistantMessage.role, assistantMessage.content)];
                    case 5:
                        _b.sent();
                        return [3 /*break*/, 7];
                    case 6:
                        //console.warn("[OllamaView] Service returned null assistant message.");
                        // Add error directly to display (as ChatManager won't add a null message)
                        this.addMessageToDisplay("error", "Assistant did not provide a response.", new Date());
                        _b.label = 7;
                    case 7: return [3 /*break*/, 10];
                    case 8:
                        error_4 = _b.sent();
                        //console.error("[OllamaView] Send/receive cycle error:", error);
                        if (loadingEl) {
                            this.removeLoadingIndicator(loadingEl);
                            loadingEl = null;
                        } // Ensure indicator removed on error
                        // Add error directly to display
                        this.addMessageToDisplay("error", "Error: " + (error_4.message || 'Unknown error.'), new Date());
                        return [3 /*break*/, 10];
                    case 9:
                        // Ensure indicator is removed in all cases (if somehow missed)
                        if (loadingEl) {
                            this.removeLoadingIndicator(loadingEl);
                        }
                        this.setLoadingState(false); // Re-enable UI
                        this.focusInput(); // Return focus to input field
                        return [7 /*endfinally*/];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    // --- Core Rendering Logic ---
    /** Renders a single message bubble based on the message object and context */
    OllamaView.prototype.renderMessageInternal = function (message, messageContext) {
        var _this = this;
        var messageIndex = messageContext.findIndex(function (m) { return m === message; });
        if (messageIndex === -1)
            return null; // Should not happen
        var prevMessage = messageIndex > 0 ? messageContext[messageIndex - 1] : null;
        var isNewDay = !this.lastRenderedMessageDate || !this.isSameDay(this.lastRenderedMessageDate, message.timestamp);
        // --- Date Separator ---
        if (isNewDay) {
            this.renderDateSeparator(message.timestamp);
            this.lastRenderedMessageDate = message.timestamp;
        }
        else if (messageIndex === 0 && !this.lastRenderedMessageDate) {
            this.lastRenderedMessageDate = message.timestamp; // Set for the very first message
        }
        // --- Grouping Logic ---
        var messageGroup = null;
        var groupClass = CSS_CLASS_MESSAGE_GROUP;
        var messageClass = CSS_CLASS_MESSAGE + " " + CSS_CLASS_MESSAGE_ARRIVING;
        var showAvatar = true;
        var isUser = false;
        var isFirstInGroup = !prevMessage || prevMessage.role !== message.role || isNewDay;
        switch (message.role) {
            case "user":
                groupClass += " " + CSS_CLASS_USER_GROUP;
                messageClass += " " + CSS_CLASS_USER_MESSAGE;
                isUser = true;
                break;
            case "assistant":
                groupClass += " " + CSS_CLASS_OLLAMA_GROUP;
                messageClass += " " + CSS_CLASS_OLLAMA_MESSAGE;
                break;
            case "system":
                groupClass += " " + CSS_CLASS_SYSTEM_GROUP;
                messageClass += " " + CSS_CLASS_SYSTEM_MESSAGE;
                showAvatar = false;
                break;
            case "error":
                groupClass += " " + CSS_CLASS_ERROR_GROUP;
                messageClass += " " + CSS_CLASS_ERROR_MESSAGE;
                showAvatar = false;
                break;
        }
        var lastElement = this.chatContainer.lastElementChild;
        if (isFirstInGroup || !lastElement || !lastElement.matches("." + groupClass.split(' ')[1])) {
            messageGroup = this.chatContainer.createDiv({ cls: groupClass });
            if (showAvatar)
                this.renderAvatar(messageGroup, isUser);
        }
        else {
            messageGroup = lastElement;
        }
        // --- Element Creation ---
        var messageEl = messageGroup.createDiv({ cls: messageClass });
        var contentContainer = messageEl.createDiv({ cls: CSS_CLASS_CONTENT_CONTAINER });
        var contentEl = contentContainer.createDiv({ cls: CSS_CLASS_CONTENT });
        // --- Render Content ---
        switch (message.role) {
            case "assistant":
            case "user":
                contentEl.addClass(CSS_CLASS_CONTENT_COLLAPSIBLE);
                if (message.role === 'assistant') {
                    this.renderAssistantContent(contentEl, message.content);
                }
                else {
                    message.content.split("\n").forEach(function (line, i, arr) {
                        contentEl.appendText(line);
                        if (i < arr.length - 1)
                            contentEl.createEl("br");
                    });
                }
                break;
            case "system":
                obsidian_1.setIcon(contentEl.createSpan({ cls: CSS_CLASS_SYSTEM_ICON }), "info");
                contentEl.createSpan({ cls: CSS_CLASS_SYSTEM_TEXT, text: message.content });
                break;
            case "error":
                obsidian_1.setIcon(contentEl.createSpan({ cls: CSS_CLASS_ERROR_ICON }), "alert-triangle");
                contentEl.createSpan({ cls: CSS_CLASS_ERROR_TEXT, text: message.content });
                break;
        }
        // --- Action Buttons ---
        var buttonsWrapper = contentContainer.createDiv({ cls: 'message-actions-wrapper' });
        if (message.role !== "system" && message.role !== "error") {
            var copyBtn_1 = buttonsWrapper.createEl("button", { cls: CSS_CLASS_COPY_BUTTON, attr: { title: "Copy", 'aria-label': "Copy message content" } });
            obsidian_1.setIcon(copyBtn_1, "copy");
            this.registerDomEvent(copyBtn_1, "click", function (e) { e.stopPropagation(); _this.handleCopyClick(message.content, copyBtn_1); });
        }
        if (this.plugin.settings.enableTranslation && this.plugin.settings.translationTargetLanguage && (message.role === "user" || message.role === "assistant")) {
            var targetLangName = LANGUAGES[this.plugin.settings.translationTargetLanguage] || this.plugin.settings.translationTargetLanguage;
            var translateBtn_1 = buttonsWrapper.createEl("button", { cls: CSS_CLASS_TRANSLATE_BUTTON, attr: { title: "Translate to " + targetLangName, 'aria-label': "Translate message" } });
            obsidian_1.setIcon(translateBtn_1, "languages");
            this.registerDomEvent(translateBtn_1, "click", function (e) { e.stopPropagation(); _this.handleTranslateClick(message.content, contentEl, translateBtn_1); });
        }
        // --- Timestamp ---
        messageEl.createDiv({ cls: CSS_CLASS_TIMESTAMP, text: this.formatTime(message.timestamp) });
        // --- Animation Cleanup ---
        setTimeout(function () { return messageEl.classList.remove(CSS_CLASS_MESSAGE_ARRIVING); }, 500);
        return messageEl;
    };
    // --- Action Button Handlers ---
    OllamaView.prototype.handleCopyClick = function (content, buttonEl) {
        var textToCopy = content;
        // Decode HTML and remove <think> tags before copying
        if (this.detectThinkingTags(this.decodeHtmlEntities(content)).hasThinkingTags) {
            textToCopy = this.decodeHtmlEntities(content).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        }
        navigator.clipboard.writeText(textToCopy).then(function () {
            obsidian_1.setIcon(buttonEl, "check");
            buttonEl.setAttribute("title", "Copied!");
            setTimeout(function () { obsidian_1.setIcon(buttonEl, "copy"); buttonEl.setAttribute("title", "Copy"); }, 2000);
        })["catch"](function (err) {
            //console.error("Copy failed:", err); new Notice("Failed to copy text.");
        });
    };
    OllamaView.prototype.handleTranslateClick = function (originalContent, contentEl, buttonEl) {
        var _a;
        return __awaiter(this, void 0, Promise, function () {
            var targetLang, apiKey, textToTranslate, translatedText, translationContainer, targetLangName, error_5, targetLangName;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        targetLang = this.plugin.settings.translationTargetLanguage;
                        apiKey = this.plugin.settings.googleTranslationApiKey;
                        if (!targetLang || !apiKey) {
                            new obsidian_1.Notice("Translation not configured. Please check language and API key in settings.");
                            return [2 /*return*/];
                        }
                        textToTranslate = originalContent;
                        if (this.detectThinkingTags(this.decodeHtmlEntities(originalContent)).hasThinkingTags) {
                            textToTranslate = this.decodeHtmlEntities(originalContent).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
                        }
                        if (!textToTranslate)
                            return [2 /*return*/]; // Nothing to translate
                        // Remove previous translation if exists
                        (_a = contentEl.querySelector("." + CSS_CLASS_TRANSLATION_CONTAINER)) === null || _a === void 0 ? void 0 : _a.remove();
                        // Set loading state
                        obsidian_1.setIcon(buttonEl, "loader");
                        buttonEl.disabled = true;
                        buttonEl.classList.add(CSS_CLASS_TRANSLATION_PENDING);
                        buttonEl.setAttribute("title", "Translating...");
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, 4, 5]);
                        return [4 /*yield*/, this.plugin.translationService.translate(textToTranslate, targetLang)];
                    case 2:
                        translatedText = _b.sent();
                        if (translatedText !== null) {
                            translationContainer = contentEl.createDiv({ cls: CSS_CLASS_TRANSLATION_CONTAINER });
                            translationContainer.createDiv({ cls: CSS_CLASS_TRANSLATION_CONTENT, text: translatedText });
                            targetLangName = LANGUAGES[targetLang] || targetLang;
                            translationContainer.createEl('div', { cls: 'translation-indicator', text: "[Translated to " + targetLangName + "]" });
                            this.guaranteedScrollToBottom(50, false); // Scroll if needed
                        } // Error notice shown by service if null
                        return [3 /*break*/, 5];
                    case 3:
                        error_5 = _b.sent();
                        //console.error("Error during translation click handling:", error);
                        new obsidian_1.Notice("An unexpected error occurred during translation.");
                        return [3 /*break*/, 5];
                    case 4:
                        // Restore button state
                        obsidian_1.setIcon(buttonEl, "languages");
                        buttonEl.disabled = false;
                        buttonEl.classList.remove(CSS_CLASS_TRANSLATION_PENDING);
                        targetLangName = LANGUAGES[targetLang] || targetLang;
                        buttonEl.setAttribute("title", "Translate to " + targetLangName);
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    // --- Rendering Helpers ---
    OllamaView.prototype.renderAvatar = function (groupEl, isUser) {
        var settings = this.plugin.settings;
        var avatarType = isUser ? settings.userAvatarType : settings.aiAvatarType;
        var avatarContent = isUser ? settings.userAvatarContent : settings.aiAvatarContent;
        var avatarClass = isUser ? CSS_CLASS_AVATAR_USER : CSS_CLASS_AVATAR_AI;
        var avatarEl = groupEl.createDiv({ cls: CSS_CLASS_AVATAR + " " + avatarClass });
        if (avatarType === 'initials') {
            avatarEl.textContent = avatarContent || (isUser ? 'U' : 'A');
        }
        else if (avatarType === 'icon') {
            try {
                obsidian_1.setIcon(avatarEl, avatarContent || (isUser ? 'user' : 'bot'));
            }
            catch (e) {
                //console.warn(`Failed to set avatar icon "${avatarContent}". Falling back to initials.`, e);
                avatarEl.textContent = isUser ? 'U' : 'A'; // Fallback
            }
        }
        else {
            avatarEl.textContent = isUser ? 'U' : 'A'; // Default fallback
        }
    };
    OllamaView.prototype.renderDateSeparator = function (date) {
        if (!this.chatContainer)
            return;
        this.chatContainer.createDiv({ cls: CSS_CLASS_DATE_SEPARATOR, text: this.formatDateSeparator(date) });
    };
    OllamaView.prototype.renderAssistantContent = function (containerEl, content) {
        var _a, _b;
        // Decode entities first for tag detection and rendering
        var decodedContent = this.decodeHtmlEntities(content);
        var thinkingInfo = this.detectThinkingTags(decodedContent);
        containerEl.empty(); // Clear previous content
        if (thinkingInfo.hasThinkingTags) {
            // Process content with <think> tags
            var processedHtml = this.processThinkingTags(decodedContent);
            containerEl.innerHTML = processedHtml; // Set innerHTML for complex structure
            this.addThinkingToggleListeners(containerEl); // Add listeners for foldouts
            this.addCodeBlockEnhancements(containerEl); // Enhance code blocks within generated HTML
        }
        else {
            // Render standard Markdown content
            obsidian_1.MarkdownRenderer.renderMarkdown(decodedContent, // Use decoded content for rendering
            containerEl, (_b = (_a = this.app.vault.getRoot()) === null || _a === void 0 ? void 0 : _a.path) !== null && _b !== void 0 ? _b : "", // Source path context
            this // Component context for links etc.
            );
            this.addCodeBlockEnhancements(containerEl); // Enhance standard code blocks
        }
    };
    OllamaView.prototype.addCodeBlockEnhancements = function (contentEl) {
        var _this = this;
        contentEl.querySelectorAll("pre").forEach(function (pre) {
            // Prevent adding button multiple times
            if (pre.querySelector("." + CSS_CLASS_CODE_BLOCK_COPY_BUTTON))
                return;
            var code = pre.querySelector("code");
            if (!code)
                return;
            var codeText = code.textContent || "";
            // Add language identifier badge
            var langClass = Array.from(code.classList).find(function (cls) { return cls.startsWith("language-"); });
            if (langClass) {
                var lang = langClass.replace("language-", "");
                if (lang) {
                    // Check if language badge already exists (added robustness)
                    if (!pre.querySelector("." + CSS_CLASS_CODE_BLOCK_LANGUAGE)) {
                        pre.createEl("span", { cls: CSS_CLASS_CODE_BLOCK_LANGUAGE, text: lang });
                    }
                }
            }
            // Add copy button
            var copyBtn = pre.createEl("button", { cls: CSS_CLASS_CODE_BLOCK_COPY_BUTTON });
            obsidian_1.setIcon(copyBtn, "copy");
            copyBtn.setAttribute("title", "Copy Code");
            copyBtn.setAttribute("aria-label", "Copy code block"); // Accessibility
            // Use registerDomEvent for reliable cleanup
            _this.registerDomEvent(copyBtn, "click", function (e) {
                e.stopPropagation();
                navigator.clipboard.writeText(codeText).then(function () {
                    obsidian_1.setIcon(copyBtn, "check");
                    copyBtn.setAttribute("title", "Copied!");
                    setTimeout(function () { obsidian_1.setIcon(copyBtn, "copy"); copyBtn.setAttribute("title", "Copy Code"); }, 1500);
                })["catch"](function (err) {
                    //console.error("Code block copy failed:", err); 
                    new obsidian_1.Notice("Failed to copy code.");
                });
            });
        });
    };
    // --- Menu List Rendering (ПОТРІБНІ ЗНОВУ) ---
    OllamaView.prototype.renderModelList = function () {
        var _a, _b;
        return __awaiter(this, void 0, Promise, function () {
            var container, modelIconMap, defaultIcon, models, activeChat, currentModelName_1, error_6;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        container = this.modelSubmenuContent;
                        if (!container)
                            return [2 /*return*/];
                        container.empty(); // Clear previous items/loading text
                        modelIconMap = { 'llama': 'box-minimal', 'mistral': 'wind', 'mixtral': 'blend', 'codellama': 'code', 'code': 'code', 'phi': 'sigma', 'phi3': 'sigma', 'gemma': 'gem', 'command-r': 'terminal', 'llava': 'image', 'star': 'star', 'wizard': 'wand', 'hermes': 'message-circle', 'dolphin': 'anchor' };
                        defaultIcon = 'box';
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, this.plugin.ollamaService.getModels()];
                    case 2:
                        models = _c.sent();
                        return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 3:
                        activeChat = _c.sent();
                        currentModelName_1 = ((_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.modelName) || this.plugin.settings.modelName;
                        // container.empty(); // Clear loading
                        if (models.length === 0) {
                            container.createEl("div", { cls: "menu-info-text", text: "No models available." });
                            return [2 /*return*/];
                        }
                        models.forEach(function (modelName) {
                            var optionEl = container.createDiv({ cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_MODEL_OPTION });
                            // Indent items visually
                            // optionEl.style.paddingLeft = "25px"; // Apply indentation via CSS instead
                            var iconSpan = optionEl.createEl("span", { cls: "menu-option-icon" });
                            var iconToUse = defaultIcon;
                            if (modelName === currentModelName_1) {
                                iconToUse = "check";
                                optionEl.addClass("is-selected");
                            }
                            else { /* ... logic for other icons ... */
                                var lowerModelName = modelName.toLowerCase();
                                var foundIcon = false;
                                for (var key in modelIconMap) {
                                    if (lowerModelName.includes(key)) {
                                        iconToUse = modelIconMap[key];
                                        foundIcon = true;
                                        break;
                                    }
                                }
                                if (!foundIcon)
                                    iconToUse = defaultIcon;
                            }
                            try {
                                obsidian_1.setIcon(iconSpan, iconToUse);
                            }
                            catch (e) {
                                iconSpan.style.minWidth = "18px";
                            }
                            optionEl.createEl("span", { cls: "menu-option-text", text: modelName });
                            // Use registerDomEvent for menu items inside custom structure
                            _this.registerDomEvent(optionEl, 'click', function () { return __awaiter(_this, void 0, void 0, function () {
                                var chatToUpdate;
                                var _a;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            if (!(modelName !== currentModelName_1)) return [3 /*break*/, 4];
                                            return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                                        case 1:
                                            chatToUpdate = _b.sent();
                                            if (!chatToUpdate) return [3 /*break*/, 3];
                                            return [4 /*yield*/, this.plugin.chatManager.updateActiveChatMetadata({ modelName: modelName })];
                                        case 2:
                                            _b.sent();
                                            return [3 /*break*/, 4];
                                        case 3:
                                            new obsidian_1.Notice("Cannot set model: No active chat.");
                                            _b.label = 4;
                                        case 4:
                                            this.closeMenu(); // Close main menu after selection
                                            return [2 /*return*/];
                                    }
                                });
                            }); });
                        });
                        // Recalculate parent max-height after adding items
                        this.updateSubmenuHeight(container);
                        return [3 /*break*/, 5];
                    case 4:
                        error_6 = _c.sent();
                        container.empty();
                        container.createEl("div", { cls: "menu-error-text", text: "Error loading models." });
                        this.updateSubmenuHeight(container);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    OllamaView.prototype.renderRoleList = function () {
        var _a, _b, _c;
        return __awaiter(this, void 0, Promise, function () {
            var container, roles, activeChat, currentChatRolePath_1, noRoleOptionEl, noRoleIconSpan, error_7;
            var _this = this;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        container = this.roleSubmenuContent;
                        if (!container)
                            return [2 /*return*/];
                        container.empty();
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, this.plugin.listRoleFiles(true)];
                    case 2:
                        roles = _d.sent();
                        return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 3:
                        activeChat = _d.sent();
                        currentChatRolePath_1 = (_c = (_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.selectedRolePath) !== null && _c !== void 0 ? _c : this.plugin.settings.selectedRolePath;
                        container.empty();
                        noRoleOptionEl = container.createDiv({ cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_ROLE_OPTION });
                        noRoleIconSpan = noRoleOptionEl.createEl("span", { cls: "menu-option-icon" });
                        if (!currentChatRolePath_1) {
                            obsidian_1.setIcon(noRoleIconSpan, "check");
                            noRoleOptionEl.addClass("is-selected");
                        }
                        else {
                            obsidian_1.setIcon(noRoleIconSpan, "slash");
                            noRoleIconSpan.style.minWidth = "18px";
                        }
                        noRoleOptionEl.createEl("span", { cls: "menu-option-text", text: "None (Default Assistant)" });
                        this.registerDomEvent(noRoleOptionEl, 'click', function () { return __awaiter(_this, void 0, void 0, function () { var newRolePath, chatToUpdate; var _a, _b, _c; return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    newRolePath = "";
                                    if (!(this.plugin.settings.selectedRolePath !== newRolePath || currentChatRolePath_1 !== newRolePath)) return [3 /*break*/, 5];
                                    this.plugin.settings.selectedRolePath = newRolePath;
                                    return [4 /*yield*/, this.plugin.saveSettings()];
                                case 1:
                                    _d.sent();
                                    return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                                case 2:
                                    chatToUpdate = _d.sent();
                                    if (!(chatToUpdate && chatToUpdate.metadata.selectedRolePath !== newRolePath)) return [3 /*break*/, 4];
                                    return [4 /*yield*/, this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath })];
                                case 3:
                                    _d.sent();
                                    (_c = (_b = this.plugin.promptService) === null || _b === void 0 ? void 0 : _b.clearRoleCache) === null || _c === void 0 ? void 0 : _c.call(_b);
                                    _d.label = 4;
                                case 4:
                                    this.plugin.emit('role-changed', "Default Assistant");
                                    _d.label = 5;
                                case 5:
                                    this.closeMenu();
                                    return [2 /*return*/];
                            }
                        }); }); });
                        // Roles list
                        if (roles.length === 0) {
                            container.createEl("div", { cls: "menu-info-text", text: "No custom roles found." });
                        }
                        else {
                            roles.forEach(function (roleInfo) {
                                var roleOptionEl = container.createDiv({ cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_ROLE_OPTION });
                                // roleOptionEl.style.paddingLeft = "25px"; // Indent via CSS
                                if (roleInfo.isCustom)
                                    roleOptionEl.addClass("is-custom");
                                var iconSpan = roleOptionEl.createEl("span", { cls: "menu-option-icon" });
                                if (roleInfo.path === currentChatRolePath_1) {
                                    obsidian_1.setIcon(iconSpan, "check");
                                    roleOptionEl.addClass("is-selected");
                                }
                                else {
                                    obsidian_1.setIcon(iconSpan, roleInfo.isCustom ? 'user' : 'box');
                                    iconSpan.style.minWidth = "18px";
                                }
                                roleOptionEl.createEl("span", { cls: "menu-option-text", text: roleInfo.name });
                                _this.registerDomEvent(roleOptionEl, 'click', function () { return __awaiter(_this, void 0, void 0, function () { var newRolePath, chatToUpdate; var _a, _b, _c; return __generator(this, function (_d) {
                                    switch (_d.label) {
                                        case 0:
                                            newRolePath = roleInfo.path;
                                            if (!(this.plugin.settings.selectedRolePath !== newRolePath || currentChatRolePath_1 !== newRolePath)) return [3 /*break*/, 5];
                                            this.plugin.settings.selectedRolePath = newRolePath;
                                            return [4 /*yield*/, this.plugin.saveSettings()];
                                        case 1:
                                            _d.sent();
                                            return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                                        case 2:
                                            chatToUpdate = _d.sent();
                                            if (!(chatToUpdate && chatToUpdate.metadata.selectedRolePath !== newRolePath)) return [3 /*break*/, 4];
                                            return [4 /*yield*/, this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath })];
                                        case 3:
                                            _d.sent();
                                            (_c = (_b = this.plugin.promptService) === null || _b === void 0 ? void 0 : _b.clearRoleCache) === null || _c === void 0 ? void 0 : _c.call(_b);
                                            _d.label = 4;
                                        case 4:
                                            this.plugin.emit('role-changed', roleInfo.name);
                                            _d.label = 5;
                                        case 5:
                                            this.closeMenu();
                                            return [2 /*return*/];
                                    }
                                }); }); });
                            });
                        }
                        this.updateSubmenuHeight(container);
                        return [3 /*break*/, 5];
                    case 4:
                        error_7 = _d.sent();
                        container.empty();
                        container.createEl("div", { cls: "menu-error-text", text: "Error loading roles." });
                        this.updateSubmenuHeight(container);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    OllamaView.prototype.renderChatListMenu = function () {
        var _a, _b;
        return __awaiter(this, void 0, Promise, function () {
            var container, chats, currentActiveId_1;
            var _this = this;
            return __generator(this, function (_c) {
                container = this.chatSubmenuContent;
                if (!container)
                    return [2 /*return*/];
                container.empty();
                // container.createEl("div", { cls: "menu-loading", text: "Loading chats..." });
                try {
                    chats = ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.listAvailableChats()) || [];
                    currentActiveId_1 = (_b = this.plugin.chatManager) === null || _b === void 0 ? void 0 : _b.getActiveChatId();
                    container.empty();
                    if (chats.length === 0) {
                        container.createEl("div", { cls: "menu-info-text", text: "No saved chats found." });
                        return [2 /*return*/];
                    }
                    chats.forEach(function (chatMeta) {
                        var chatOptionEl = container.createDiv({ cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_CHAT_OPTION });
                        // chatOptionEl.style.paddingLeft = "25px"; // Indent via CSS
                        var iconSpan = chatOptionEl.createEl("span", { cls: "menu-option-icon" });
                        if (chatMeta.id === currentActiveId_1) {
                            obsidian_1.setIcon(iconSpan, "check");
                            chatOptionEl.addClass("is-selected");
                        }
                        else {
                            obsidian_1.setIcon(iconSpan, "message-square");
                        }
                        var textSpan = chatOptionEl.createEl("span", { cls: "menu-option-text" });
                        textSpan.createEl('div', { cls: 'chat-option-name', text: chatMeta.name });
                        var dateText = _this.formatRelativeDate(new Date(chatMeta.lastModified));
                        textSpan.createEl('div', { cls: 'chat-option-date', text: dateText });
                        _this.registerDomEvent(chatOptionEl, 'click', function () { return __awaiter(_this, void 0, void 0, function () {
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        if (!(chatMeta.id !== ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChatId()))) return [3 /*break*/, 2];
                                        return [4 /*yield*/, this.plugin.chatManager.setActiveChat(chatMeta.id)];
                                    case 1:
                                        _b.sent();
                                        _b.label = 2;
                                    case 2:
                                        this.closeMenu();
                                        return [2 /*return*/];
                                }
                            });
                        }); });
                    });
                    this.updateSubmenuHeight(container);
                }
                catch (error) { /* ... error handling ... */
                    container.empty();
                    container.createEl("div", { cls: "menu-error-text", text: "Error loading chats." });
                    this.updateSubmenuHeight(container);
                }
                return [2 /*return*/];
            });
        });
    };
    // Helper to update submenu height after content changes
    OllamaView.prototype.updateSubmenuHeight = function (contentEl) {
        if (contentEl && !contentEl.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN)) {
            requestAnimationFrame(function () {
                contentEl.style.maxHeight = contentEl.scrollHeight + 'px';
            });
        }
    };
    // --- End Menu List Rendering Functions ---
    // --- Speech Recognition Methods ---
    OllamaView.prototype.initSpeechWorker = function () { };
    OllamaView.prototype.setupSpeechWorkerHandlers = function () { };
    OllamaView.prototype.insertTranscript = function (transcript) { };
    OllamaView.prototype.toggleVoiceRecognition = function () {
        return __awaiter(this, void 0, Promise, function () { return __generator(this, function (_a) {
            return [2 /*return*/];
        }); });
    };
    OllamaView.prototype.startVoiceRecognition = function () {
        return __awaiter(this, void 0, Promise, function () { return __generator(this, function (_a) {
            return [2 /*return*/];
        }); });
    };
    OllamaView.prototype.stopVoiceRecording = function (processAudio) { };
    // --- Thinking Tag Handling ---
    OllamaView.prototype.processThinkingTags = function (content) { /* ... */ return ''; };
    OllamaView.prototype.markdownToHtml = function (markdown) { /* ... */ return ''; };
    OllamaView.prototype.addThinkingToggleListeners = function (contentEl) { };
    OllamaView.prototype.decodeHtmlEntities = function (text) { /* ... */ return text; };
    OllamaView.prototype.detectThinkingTags = function (content) { /* ... */ return { hasThinkingTags: false, format: 'none' }; };
    // --- Message Collapsing ---
    OllamaView.prototype.checkMessageForCollapsing = function (messageEl) { };
    OllamaView.prototype.checkAllMessagesForCollapsing = function () { };
    OllamaView.prototype.toggleMessageCollapse = function (contentEl, buttonEl) { };
    // --- Helpers & Utilities ---
    OllamaView.prototype.getChatContainer = function () { return this.chatContainer; };
    OllamaView.prototype.clearChatContainerInternal = function () { };
    OllamaView.prototype.clearDisplayAndState = function () { };
    OllamaView.prototype.addLoadingIndicator = function () { /* ... */ return this.chatContainer.createDiv(); };
    OllamaView.prototype.removeLoadingIndicator = function (loadingEl) { };
    OllamaView.prototype.scrollToBottom = function () { };
    OllamaView.prototype.clearInputField = function () { };
    OllamaView.prototype.focusInput = function () {
        var _this = this;
        setTimeout(function () { var _a; (_a = _this.inputEl) === null || _a === void 0 ? void 0 : _a.focus(); }, 50);
    };
    OllamaView.prototype.guaranteedScrollToBottom = function (delay, forceScroll) {
        if (delay === void 0) { delay = 50; }
        if (forceScroll === void 0) { forceScroll = false; }
    };
    OllamaView.prototype.formatTime = function (date) { /* ... */ return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };
    OllamaView.prototype.formatDateSeparator = function (date) { /* ... */ var now = new Date(); var yesterday = new Date(now); yesterday.setDate(now.getDate() - 1); if (this.isSameDay(date, now))
        return "Today";
    else if (this.isSameDay(date, yesterday))
        return "Yesterday";
    else
        return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); };
    OllamaView.prototype.formatRelativeDate = function (date) { /* ... */ var now = new Date(); var diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000); var diffDays = Math.floor(diffSeconds / (60 * 60 * 24)); if (diffDays === 0) {
        var diffHours = Math.floor(diffSeconds / (60 * 60));
        if (diffHours < 1)
            return "Just now";
        if (diffHours === 1)
            return "1 hour ago";
        if (diffHours < now.getHours())
            return diffHours + " hours ago";
        else
            return "Today";
    }
    else if (diffDays === 1) {
        return "Yesterday";
    }
    else if (diffDays < 7) {
        return diffDays + " days ago";
    }
    else {
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } };
    OllamaView.prototype.isSameDay = function (date1, date2) { /* ... */ return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate(); };
    // setLoadingState definition is needed
    // OllamaView.ts -> setLoadingState
    OllamaView.prototype.setLoadingState = function (isLoading) {
        console.log("[OllamaView] setLoadingState CALLED with: " + isLoading); // <--- ЛОГ
        this.isProcessing = isLoading;
        if (this.inputEl)
            this.inputEl.disabled = isLoading;
        this.updateSendButtonState();
        if (this.voiceButton) {
            this.voiceButton.disabled = isLoading;
            this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading);
        }
        if (this.translateInputButton) {
            this.translateInputButton.disabled = isLoading;
            this.translateInputButton.classList.toggle(CSS_CLASS_DISABLED, isLoading);
        }
        if (this.menuButton) {
            this.menuButton.disabled = isLoading;
            this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading);
        }
        console.log("[OllamaView] isProcessing is now: " + this.isProcessing); // <--- ЛОГ
    };
    OllamaView.prototype.formatChatToMarkdown = function (messagesToFormat) { /* ... */ return ''; };
    return OllamaView;
}(obsidian_1.ItemView)); // END OF OllamaView CLASS
exports.OllamaView = OllamaView;
