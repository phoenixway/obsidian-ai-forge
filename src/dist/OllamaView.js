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
// Імпортуємо модальні вікна
var ConfirmModal_1 = require("./ConfirmModal");
var PromptModal_1 = require("./PromptModal");
// --- View Type ID ---
// Використовуйте унікальний ID, наприклад, на основі назви плагіна
exports.VIEW_TYPE_OLLAMA_PERSONAS = "ollama-personas-chat-view";
// --- CSS Classes ---
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
var CSS_CLASS_INPUT_AREA_LEFT = "input-area-left";
var CSS_CLASS_MODEL_DISPLAY = "model-display";
var CSS_CLASS_ROLE_DISPLAY = "role-display";
var CSS_CLASS_INPUT_CONTROLS_CONTAINER = "input-controls-container";
var CSS_CLASS_INPUT_CONTROLS_LEFT = "input-controls-left";
var CSS_CLASS_INPUT_CONTROLS_RIGHT = "input-controls-right";
// --- Language List ---
var LANGUAGES = {
    "af": "Afrikaans", "sq": "Albanian", "am": "Amharic", "ar": "Arabic", "hy": "Armenian",
    "az": "Azerbaijani", "eu": "Basque", "be": "Belarusian", "bn": "Bengali", "bs": "Bosnian",
    "bg": "Bulgarian", "ca": "Catalan", "ceb": "Cebuano", "ny": "Chichewa", "zh-CN": "Chinese (Simplified)",
    "zh-TW": "Chinese (Traditional)", "co": "Corsican", "hr": "Croatian", "cs": "Czech", "da": "Danish",
    "nl": "Dutch", "en": "English", "eo": "Esperanto", "et": "Estonian", "tl": "Filipino",
    "fi": "Finnish", "fr": "French", "fy": "Frisian", "gl": "Galician", "ka": "Georgian",
    "de": "German", "el": "Greek", "gu": "Gujarati", "ht": "Haitian Creole", "ha": "Hausa",
    "haw": "Hawaiian", "iw": "Hebrew", "he": "Hebrew", "hi": "Hindi", "hmn": "Hmong",
    "hu": "Hungarian", "is": "Icelandic", "ig": "Igbo", "id": "Indonesian", "ga": "Irish",
    "it": "Italian", "ja": "Japanese", "jw": "Javanese", "kn": "Kannada", "kk": "Kazakh",
    "km": "Khmer", "rw": "Kinyarwanda", "ko": "Korean", "ku": "Kurdish (Kurmanji)", "ky": "Kyrgyz",
    "lo": "Lao", "la": "Latin", "lv": "Latvian", "lt": "Lithuanian", "lb": "Luxembourgish",
    "mk": "Macedonian", "mg": "Malagasy", "ms": "Malay", "ml": "Malayalam", "mt": "Maltese",
    "mi": "Maori", "mr": "Marathi", "mn": "Mongolian", "my": "Myanmar (Burmese)", "ne": "Nepali",
    "no": "Norwegian", "or": "Odia (Oriya)", "ps": "Pashto", "fa": "Persian", "pl": "Polish",
    "pt": "Portuguese", "pa": "Punjabi", "ro": "Romanian", "ru": "Russian", "sm": "Samoan",
    "gd": "Scots Gaelic", "sr": "Serbian", "st": "Sesotho", "sn": "Shona", "sd": "Sindhi",
    "si": "Sinhala", "sk": "Slovak", "sl": "Slovenian", "so": "Somali", "es": "Spanish",
    "su": "Sundanese", "sw": "Swahili", "sv": "Swedish", "tg": "Tajik", "ta": "Tamil",
    "tt": "Tatar", "te": "Telugu", "th": "Thai", "tr": "Turkish", "tk": "Turkmen",
    "uk": "Ukrainian", "ur": "Urdu", "ug": "Uyghur", "uz": "Uzbek", "vi": "Vietnamese",
    "cy": "Welsh", "xh": "Xhosa", "yi": "Yiddish", "yo": "Yoruba", "zu": "Zulu"
};
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
        // OllamaView.ts -> handleModelDisplayClick
        _this.handleSettingsUpdated = function () { return __awaiter(_this, void 0, Promise, function () {
            var activeChat, currentModelName, currentRoleName;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        console.log("[AI Forge View] Settings updated event received. Refreshing relevant UI parts.");
                        return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 1:
                        activeChat = _c.sent();
                        currentModelName = ((_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.modelName) || this.plugin.settings.modelName;
                        return [4 /*yield*/, this.getCurrentRoleDisplayName()];
                    case 2:
                        currentRoleName = _c.sent();
                        // Оновлюємо відповідні елементи UI
                        this.updateModelDisplay(currentModelName);
                        this.updateRoleDisplay(currentRoleName);
                        this.updateInputPlaceholder(currentRoleName);
                        return [2 /*return*/];
                }
            });
        }); };
        _this.handleModelDisplayClick = function (event) { return __awaiter(_this, void 0, void 0, function () {
            var menu, itemsAdded, loadingNotice, models, activeChat, currentModelName_1, error_1;
            var _this = this;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        console.log("[OllamaView Debug] Model display clicked, creating native menu.");
                        menu = new obsidian_1.Menu();
                        itemsAdded = false;
                        loadingNotice = new obsidian_1.Notice("Loading models...", 0);
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 4, 5, 6]);
                        return [4 /*yield*/, this.plugin.ollamaService.getModels()];
                    case 2:
                        models = _c.sent();
                        return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 3:
                        activeChat = _c.sent();
                        currentModelName_1 = ((_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.modelName) || this.plugin.settings.modelName;
                        loadingNotice.hide();
                        if (models.length === 0) {
                            menu.addItem(function (item) { return item.setTitle("No models found").setDisabled(true); });
                            itemsAdded = true; // <-- Позначили, що елемент додано
                        }
                        else {
                            models.forEach(function (modelName) {
                                menu.addItem(function (item) {
                                    return item
                                        .setTitle(modelName)
                                        .setIcon(modelName === currentModelName_1 ? "check" : "radio-button")
                                        .onClick(function () { return __awaiter(_this, void 0, void 0, function () {
                                        var chatToUpdate, latestModelName;
                                        var _a, _b;
                                        return __generator(this, function (_c) {
                                            switch (_c.label) {
                                                case 0: return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                                                case 1:
                                                    chatToUpdate = _c.sent();
                                                    latestModelName = ((_b = chatToUpdate === null || chatToUpdate === void 0 ? void 0 : chatToUpdate.metadata) === null || _b === void 0 ? void 0 : _b.modelName) || this.plugin.settings.modelName;
                                                    if (!(modelName !== latestModelName)) return [3 /*break*/, 4];
                                                    if (!chatToUpdate) return [3 /*break*/, 3];
                                                    return [4 /*yield*/, this.plugin.chatManager.updateActiveChatMetadata({ modelName: modelName })];
                                                case 2:
                                                    _c.sent();
                                                    return [3 /*break*/, 4];
                                                case 3:
                                                    new obsidian_1.Notice("Cannot set model: No active chat.");
                                                    _c.label = 4;
                                                case 4: return [2 /*return*/];
                                            }
                                        });
                                    }); });
                                });
                                itemsAdded = true; // <-- Позначили, що елемент(и) додано
                            });
                        }
                        return [3 /*break*/, 6];
                    case 4:
                        error_1 = _c.sent();
                        loadingNotice.hide();
                        console.error("Error loading models for model selection menu:", error_1);
                        menu.addItem(function (item) { return item.setTitle("Error loading models").setDisabled(true); });
                        itemsAdded = true; // <-- Позначили, що елемент помилки додано
                        new obsidian_1.Notice("Failed to load models. Check Ollama connection.");
                        return [3 /*break*/, 6];
                    case 5:
                        // --- ЗМІНЕНО ---
                        // Показуємо меню, ТІЛЬКИ ЯКЩО хоч один елемент було додано
                        if (itemsAdded) {
                            menu.showAtMouseEvent(event);
                        }
                        else {
                            // Якщо нічого не додалося (малоймовірно, але можливо)
                            console.warn("Model menu was not shown because no items were added.");
                            // Можна показати сповіщення користувачу, якщо потрібно
                            // new Notice("Could not display model menu.");
                        }
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        }); };
        // --- Event Handlers ---
        // Input & Sending
        _this.handleKeyDown = function (e) {
            var _a;
            console.log("[OllamaView Debug] handleKeyDown FIRED: Key=<span class=\"math-inline\">{e.key}, Shift=</span>{e.shiftKey}, isProcessing=<span class=\"math-inline\">{this.isProcessing}, sendButtonDisabled=</span>{this.sendButton?.disabled}");
            if (e.key === "Enter" && !e.shiftKey && !_this.isProcessing && !((_a = _this.sendButton) === null || _a === void 0 ? void 0 : _a.disabled)) {
                console.log("[OllamaView Debug] Enter condition met - sending.");
                e.preventDefault();
                _this.sendMessage();
            }
        };
        _this.handleSendClick = function () {
            var _a;
            console.log("[OllamaView Debug] handleSendClick FIRED: isProcessing=<span class=\"math-inline\">{this.isProcessing}, sendButtonDisabled=</span>{this.sendButton?.disabled}");
            if (!_this.isProcessing && !((_a = _this.sendButton) === null || _a === void 0 ? void 0 : _a.disabled)) {
                console.log("[OllamaView Debug] Send button clicked - sending message.");
                _this.sendMessage();
            }
            else {
                console.log("[OllamaView Debug] Send button clicked, but ignored (processing or disabled).");
            }
        };
        _this.handleInputForResize = function () {
            if (_this.resizeTimeout)
                clearTimeout(_this.resizeTimeout);
            _this.resizeTimeout = setTimeout(function () {
                _this.adjustTextareaHeight();
                _this.updateSendButtonState();
            }, 50);
        };
        // Input Area Buttons
        _this.handleVoiceClick = function () { _this.toggleVoiceRecognition(); };
        _this.handleTranslateInputClick = function () { return __awaiter(_this, void 0, Promise, function () {
            var currentText, targetLang, apiKey, translatedText, end, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        currentText = this.inputEl.value;
                        targetLang = 'en';
                        if (!currentText.trim()) {
                            new obsidian_1.Notice("Input empty...");
                            return [2 /*return*/];
                        }
                        if (!this.plugin.settings.enableTranslation) {
                            new obsidian_1.Notice("Translation disabled...");
                            return [2 /*return*/];
                        }
                        apiKey = this.plugin.settings.googleTranslationApiKey;
                        if (!apiKey) {
                            new obsidian_1.Notice("Translation API Key not set...");
                            return [2 /*return*/];
                        }
                        obsidian_1.setIcon(this.translateInputButton, "loader");
                        this.translateInputButton.disabled = true;
                        this.translateInputButton.classList.add(CSS_CLASS_TRANSLATING_INPUT);
                        this.translateInputButton.title = "Translating...";
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, 4, 5]);
                        return [4 /*yield*/, this.plugin.translationService.translate(currentText, targetLang)];
                    case 2:
                        translatedText = _a.sent();
                        if (translatedText !== null) {
                            this.inputEl.value = translatedText;
                            this.inputEl.dispatchEvent(new Event('input'));
                            this.inputEl.focus();
                            end = translatedText.length;
                            this.inputEl.setSelectionRange(end, end);
                        }
                        else {
                            console.warn("Input translation failed.");
                        }
                        return [3 /*break*/, 5];
                    case 3:
                        error_2 = _a.sent();
                        console.error("Input translation error:", error_2);
                        new obsidian_1.Notice("Input translation error.");
                        return [3 /*break*/, 5];
                    case 4:
                        obsidian_1.setIcon(this.translateInputButton, "replace");
                        this.translateInputButton.disabled = this.isProcessing;
                        this.translateInputButton.classList.remove(CSS_CLASS_TRANSLATING_INPUT);
                        this.translateInputButton.title = "Translate input to English";
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        }); };
        // Menu Button Click (Toggles Custom Div)
        _this.handleMenuClick = function (e) {
            e.stopPropagation();
            if (!_this.menuDropdown) {
                console.error("menuDropdown missing!");
                return;
            } // Safety check
            var isHidden = _this.menuDropdown.style.display === 'none';
            if (isHidden) {
                console.log("[OllamaView Debug] Opening menu...");
                _this.menuDropdown.style.display = "block";
                _this.collapseAllSubmenus(null); // Collapse all when opening main menu
            }
            else {
                console.log("[OllamaView Debug] Closing menu...");
                _this.closeMenu();
            }
        };
        // --- Action Handlers (Must call closeMenu) ---
        _this.handleNewChatClick = function () { return __awaiter(_this, void 0, Promise, function () { var newChat, error_3; return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    this.closeMenu();
                    console.log("[OllamaView Debug] Action: New Chat");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, this.plugin.chatManager.createNewChat()];
                case 2:
                    newChat = _a.sent();
                    if (newChat) {
                        new obsidian_1.Notice("Created new chat: " + newChat.metadata.name);
                        this.focusInput();
                    }
                    else {
                        new obsidian_1.Notice("Failed to create new chat.");
                    }
                    return [3 /*break*/, 4];
                case 3:
                    error_3 = _a.sent();
                    new obsidian_1.Notice("Error creating new chat.");
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        }); }); };
        _this.handleRenameChatClick = function () { return __awaiter(_this, void 0, Promise, function () {
            var activeChat, currentName;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        this.closeMenu();
                        console.log("[OllamaView Debug] Action: Rename Chat");
                        return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 1:
                        activeChat = _b.sent();
                        if (!activeChat) {
                            new obsidian_1.Notice("No active chat to rename.");
                            return [2 /*return*/];
                        }
                        currentName = activeChat.metadata.name;
                        new PromptModal_1.PromptModal(this.app, 'Rename Chat', "Enter new name for \"" + currentName + "\":", currentName, function (newName) { return __awaiter(_this, void 0, void 0, function () { var noticeMessage, success; return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    noticeMessage = "Rename cancelled or name unchanged.";
                                    if (!(newName && newName.trim() !== "" && newName.trim() !== currentName)) return [3 /*break*/, 2];
                                    return [4 /*yield*/, this.plugin.chatManager.renameChat(activeChat.metadata.id, newName.trim())];
                                case 1:
                                    success = _a.sent();
                                    if (success) {
                                        noticeMessage = "Chat renamed to \"" + newName.trim() + "\"";
                                    }
                                    else {
                                        noticeMessage = "Failed to rename chat.";
                                    }
                                    return [3 /*break*/, 3];
                                case 2:
                                    if ((newName === null || newName === void 0 ? void 0 : newName.trim()) === currentName) {
                                        noticeMessage = "Name unchanged.";
                                    }
                                    else {
                                        noticeMessage = "Rename cancelled or invalid name entered.";
                                    }
                                    _a.label = 3;
                                case 3:
                                    new obsidian_1.Notice(noticeMessage);
                                    this.focusInput();
                                    return [2 /*return*/];
                            }
                        }); }); }).open();
                        return [2 /*return*/];
                }
            });
        }); };
        _this.handleCloneChatClick = function () { return __awaiter(_this, void 0, Promise, function () { var activeChat, originalName, cloningNotice, clonedChat, error_4; var _a; return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    this.closeMenu();
                    console.log("[OllamaView Debug] Action: Clone Chat");
                    return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                case 1:
                    activeChat = _b.sent();
                    if (!activeChat) {
                        new obsidian_1.Notice("No active chat to clone.");
                        return [2 /*return*/];
                    }
                    originalName = activeChat.metadata.name;
                    cloningNotice = new obsidian_1.Notice("Cloning chat...", 0);
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, 5, 6]);
                    return [4 /*yield*/, this.plugin.chatManager.cloneChat(activeChat.metadata.id)];
                case 3:
                    clonedChat = _b.sent();
                    if (clonedChat) {
                        new obsidian_1.Notice("Chat cloned as \"" + clonedChat.metadata.name + "\" and activated.");
                    }
                    else {
                        new obsidian_1.Notice("Failed to clone chat.");
                    }
                    return [3 /*break*/, 6];
                case 4:
                    error_4 = _b.sent();
                    new obsidian_1.Notice("An error occurred while cloning the chat.");
                    return [3 /*break*/, 6];
                case 5:
                    cloningNotice.hide();
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        }); }); };
        _this.handleClearChatClick = function () { return __awaiter(_this, void 0, Promise, function () {
            var activeChat, chatName;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        this.closeMenu();
                        console.log("[OllamaView Debug] Action: Clear Chat");
                        return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 1:
                        activeChat = _b.sent();
                        if (activeChat) {
                            chatName = activeChat.metadata.name;
                            new ConfirmModal_1.ConfirmModal(this.app, 'Clear Chat Messages', "Are you sure you want to clear all messages in chat \"" + chatName + "\"?\nThis action cannot be undone.", function () { _this.plugin.chatManager.clearActiveChatMessages(); }).open();
                        }
                        else {
                            new obsidian_1.Notice("No active chat to clear.");
                        }
                        return [2 /*return*/];
                }
            });
        }); };
        _this.handleDeleteChatClick = function () { return __awaiter(_this, void 0, Promise, function () {
            var activeChat, chatName_1;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        this.closeMenu();
                        console.log("[OllamaView Debug] Action: Delete Chat");
                        return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 1:
                        activeChat = _b.sent();
                        if (activeChat) {
                            chatName_1 = activeChat.metadata.name;
                            new ConfirmModal_1.ConfirmModal(this.app, 'Delete Chat', "Are you sure you want to delete chat \"" + chatName_1 + "\"?\nThis action cannot be undone.", function () { return __awaiter(_this, void 0, void 0, function () { var success; return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.plugin.chatManager.deleteChat(activeChat.metadata.id)];
                                    case 1:
                                        success = _a.sent();
                                        if (success) {
                                            new obsidian_1.Notice("Chat \"" + chatName_1 + "\" deleted.");
                                        }
                                        else {
                                            new obsidian_1.Notice("Failed to delete chat \"" + chatName_1 + "\".");
                                        }
                                        return [2 /*return*/];
                                }
                            }); }); }).open();
                        }
                        else {
                            new obsidian_1.Notice("No active chat to delete.");
                        }
                        return [2 /*return*/];
                }
            });
        }); };
        _this.handleExportChatClick = function () { return __awaiter(_this, void 0, Promise, function () { var activeChat, md, ts, safeName, fName, targetFolderPath, targetFolder, abstractFile, err_1, filePath, file, error_5; var _a, _b; return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    this.closeMenu();
                    console.log("[OllamaView Debug] Action: Export Chat"); /* ... (export logic) ... */
                    return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                case 1:
                    activeChat = _c.sent();
                    if (!activeChat || activeChat.messages.length === 0) {
                        new obsidian_1.Notice("Chat empty, nothing to export.");
                        return [2 /*return*/];
                    }
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 12, , 13]);
                    md = this.formatChatToMarkdown(activeChat.messages);
                    ts = new Date().toISOString().replace(/[:.]/g, '-');
                    safeName = activeChat.metadata.name.replace(/[/\\?%*:|"<>]/g, '-');
                    fName = "ollama-chat-<span class=\"math-inline\">{safeName}-</span>{ts}.md";
                    targetFolderPath = (_b = this.plugin.settings.chatExportFolderPath) === null || _b === void 0 ? void 0 : _b.trim();
                    targetFolder = null;
                    if (!targetFolderPath) return [3 /*break*/, 9];
                    targetFolderPath = obsidian_1.normalizePath(targetFolderPath);
                    abstractFile = this.app.vault.getAbstractFileByPath(targetFolderPath);
                    if (!!abstractFile) return [3 /*break*/, 7];
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, this.app.vault.createFolder(targetFolderPath)];
                case 4:
                    _c.sent();
                    targetFolder = this.app.vault.getAbstractFileByPath(targetFolderPath);
                    if (targetFolder)
                        new obsidian_1.Notice("Created export folder: " + targetFolderPath);
                    return [3 /*break*/, 6];
                case 5:
                    err_1 = _c.sent();
                    new obsidian_1.Notice("Error creating export folder. Saving to vault root.");
                    targetFolder = this.app.vault.getRoot();
                    return [3 /*break*/, 6];
                case 6: return [3 /*break*/, 8];
                case 7:
                    if (abstractFile instanceof obsidian_1.TFolder) {
                        targetFolder = abstractFile;
                    }
                    else {
                        new obsidian_1.Notice("Error: Export path not a folder. Saving to vault root.");
                        targetFolder = this.app.vault.getRoot();
                    }
                    _c.label = 8;
                case 8: return [3 /*break*/, 10];
                case 9:
                    targetFolder = this.app.vault.getRoot();
                    _c.label = 10;
                case 10:
                    if (!targetFolder) {
                        new obsidian_1.Notice("Error determining export folder.");
                        return [2 /*return*/];
                    }
                    filePath = obsidian_1.normalizePath("<span class=\"math-inline\">{targetFolder.path}/</span>{fName}");
                    return [4 /*yield*/, this.app.vault.create(filePath, md)];
                case 11:
                    file = _c.sent();
                    new obsidian_1.Notice("Chat exported to " + file.path);
                    return [3 /*break*/, 13];
                case 12:
                    error_5 = _c.sent();
                    new obsidian_1.Notice("Error exporting chat.");
                    console.error(error_5);
                    return [3 /*break*/, 13];
                case 13: return [2 /*return*/];
            }
        }); }); };
        _this.handleSettingsClick = function () { return __awaiter(_this, void 0, Promise, function () { var _a, _b, _c, _d; return __generator(this, function (_e) {
            this.closeMenu();
            console.log("[OllamaView Debug] Action: Settings");
            (_b = (_a = this.app.setting) === null || _a === void 0 ? void 0 : _a.open) === null || _b === void 0 ? void 0 : _b.call(_a);
            (_d = (_c = this.app.setting) === null || _c === void 0 ? void 0 : _c.openTabById) === null || _d === void 0 ? void 0 : _d.call(_c, this.plugin.manifest.id);
            return [2 /*return*/];
        }); }); };
        _this.handleDocumentClickForMenu = function (e) { var _a, _b; if (_this.isMenuOpen() && !((_a = _this.menuButton) === null || _a === void 0 ? void 0 : _a.contains(e.target)) && !((_b = _this.menuDropdown) === null || _b === void 0 ? void 0 : _b.contains(e.target))) {
            _this.closeMenu();
        } };
        // --- Plugin Event Handlers ---
        _this.handleModelChange = function (modelName) {
            // Цей обробник реагує на ЗМІНУ МОДЕЛІ АКТИВНОГО ЧАТУ
            console.log("[AI Forge View Debug] handleModelChange received modelName: '" + modelName + "'");
            _this.updateModelDisplay(modelName);
            // Не оновлюємо плейсхолдер тут, бо він залежить від ролі
            // Повідомлення про зміну моделі додається ЛИШЕ якщо ця зміна стосується поточного чату,
            // а не глобального дефолтного налаштування. Потрібно розрізняти ці випадки,
            // але поки що залишимо так - при зміні дефолту може з'явитися системне повідомлення.
            if (_this.currentMessages.length > 0) {
                _this.addMessageToDisplay("system", "Model changed to: " + modelName, new Date());
            }
        };
        _this.handleRoleChange = function (roleName) {
            console.log("[AI Forge View Debug] handleRoleChange received roleName: '" + roleName + "'");
            var displayRole = roleName || "None";
            _this.updateInputPlaceholder(displayRole);
            _this.updateRoleDisplay(displayRole);
            if (_this.currentMessages.length > 0) {
                _this.addMessageToDisplay("system", "Role changed to: " + displayRole, new Date());
            }
            else {
                new obsidian_1.Notice("Role set to: " + displayRole);
            }
        };
        _this.handleRolesUpdated = function () { var _a; (_a = _this.plugin.promptService) === null || _a === void 0 ? void 0 : _a.clearRoleCache(); console.log("[OllamaView] Roles updated: Cleared prompt service role cache."); if (_this.isMenuOpen()) {
            _this.renderRoleList();
        } }; // Refresh list if open
        _this.handleChatListUpdated = function () { console.log("[OllamaView] Chat list updated event received."); if (_this.isMenuOpen()) {
            _this.renderChatListMenu();
        } }; // Refresh list if open
        _this.handleActiveChatChanged = function (data) { console.log("[OllamaView] Active chat changed event received. New ID: " + data.chatId); _this.loadAndDisplayActiveChat(); };
        _this.handleMessageAdded = function (data) { var _a; if (data.chatId === ((_a = _this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChatId())) {
            _this.addMessageToDisplay(data.message.role, data.message.content, data.message.timestamp);
            if (_this.isMenuOpen()) {
                _this.renderChatListMenu();
            }
        } }; // Refresh list date if open
        _this.handleMessagesCleared = function (chatId) { var _a; if (chatId === ((_a = _this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChatId())) {
            console.log("[OllamaView] Messages cleared event received.");
            _this.clearChatContainerInternal();
            _this.currentMessages = [];
            _this.showEmptyState();
        } };
        // --- Window/Workspace State Handlers ---
        _this.handleVisibilityChange = function () { if (document.visibilityState === 'visible' && _this.leaf.view === _this) {
            requestAnimationFrame(function () { var _a; _this.guaranteedScrollToBottom(50, true); _this.adjustTextareaHeight(); (_a = _this.inputEl) === null || _a === void 0 ? void 0 : _a.focus(); });
        } };
        _this.handleActiveLeafChange = function (leaf) { var _a; if ((leaf === null || leaf === void 0 ? void 0 : leaf.view) === _this) {
            (_a = _this.inputEl) === null || _a === void 0 ? void 0 : _a.focus();
            setTimeout(function () { return _this.guaranteedScrollToBottom(150, true); }, 100);
        } };
        _this.handleWindowResize = function () { if (_this.resizeTimeout)
            clearTimeout(_this.resizeTimeout); _this.resizeTimeout = setTimeout(function () { return _this.adjustTextareaHeight(); }, 100); };
        // --- Scroll Handling ---
        _this.handleScroll = function () { if (!_this.chatContainer || !_this.newMessagesIndicatorEl)
            return; var threshold = 150; var atBottom = _this.chatContainer.scrollHeight - _this.chatContainer.scrollTop - _this.chatContainer.clientHeight < threshold; var previousScrolledUp = _this.userScrolledUp; _this.userScrolledUp = !atBottom; if (previousScrolledUp && atBottom) {
            _this.newMessagesIndicatorEl.classList.remove(CSS_CLASS_VISIBLE);
        } };
        _this.handleNewMessageIndicatorClick = function () { var _a; if (_this.chatContainer) {
            _this.chatContainer.scrollTo({ top: _this.chatContainer.scrollHeight, behavior: 'smooth' });
        } (_a = _this.newMessagesIndicatorEl) === null || _a === void 0 ? void 0 : _a.classList.remove(CSS_CLASS_VISIBLE); _this.userScrolledUp = false; };
        _this.adjustTextareaHeight = function () {
            requestAnimationFrame(function () {
                if (!_this.inputEl)
                    return;
                var textarea = _this.inputEl;
                var originalMinHeightStyle = textarea.style.minHeight;
                // Скидаємо height та inline min-height для коректного вимірювання
                textarea.style.height = 'auto';
                textarea.style.minHeight = '0'; // Повністю скидаємо inline min-height
                requestAnimationFrame(function () {
                    if (!_this.inputEl)
                        return;
                    var computedStyle = window.getComputedStyle(textarea);
                    // Читаємо базовий min-height (з CSS) та max-height
                    var baseMinHeight = parseFloat(computedStyle.minHeight) || 40;
                    var maxHeight = parseFloat(computedStyle.maxHeight);
                    // Вимірюємо scrollHeight ПІСЛЯ скидання
                    var scrollHeight = textarea.scrollHeight;
                    // Обчислюємо цільову min-height, використовуючи базовий min-height з CSS
                    var targetMinHeight = Math.max(baseMinHeight, scrollHeight);
                    // Застосовуємо обмеження max-height
                    if (!isNaN(maxHeight) && targetMinHeight > maxHeight) {
                        targetMinHeight = maxHeight;
                        // Переконуємося, що overflow увімкнено при досягненні межі
                        if (textarea.style.overflowY !== 'auto' && textarea.style.overflowY !== 'scroll') {
                            textarea.style.overflowY = 'auto';
                        }
                    }
                    // Встановлюємо обчислену min-height та height: auto
                    textarea.style.minHeight = targetMinHeight + "px";
                    textarea.style.height = 'auto'; // Дозволяємо висоті слідувати за min-height
                });
            });
        };
        _this.handleRoleDisplayClick = function (event) { return __awaiter(_this, void 0, void 0, function () {
            var menu, itemsAdded, roles, activeChat_1, currentRolePath_1, error_6;
            var _this = this;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        console.log("[OllamaView Debug] Role display clicked, creating native menu.");
                        menu = new obsidian_1.Menu();
                        itemsAdded = false;
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 4, 5, 6]);
                        return [4 /*yield*/, this.plugin.listRoleFiles(true)];
                    case 2:
                        roles = _d.sent();
                        return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 3:
                        activeChat_1 = _d.sent();
                        currentRolePath_1 = (_c = (_b = activeChat_1 === null || activeChat_1 === void 0 ? void 0 : activeChat_1.metadata) === null || _b === void 0 ? void 0 : _b.selectedRolePath) !== null && _c !== void 0 ? _c : this.plugin.settings.selectedRolePath;
                        // loadingNotice?.hide();
                        // --- 1. Додаємо опцію "None (Default)" ---
                        menu.addItem(function (item) {
                            item
                                .setTitle("None")
                                .setIcon(!currentRolePath_1 ? "check" : "slash") // Перевірка чи шлях пустий
                                .onClick(function () { return __awaiter(_this, void 0, void 0, function () {
                                var newRolePath;
                                var _a, _b;
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            newRolePath = "";
                                            if (!(currentRolePath_1 !== newRolePath)) return [3 /*break*/, 4];
                                            if (!activeChat_1) return [3 /*break*/, 2];
                                            return [4 /*yield*/, this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath })];
                                        case 1:
                                            _c.sent();
                                            return [3 /*break*/, 4];
                                        case 2:
                                            // Якщо чату немає, змінюємо глобальне налаштування
                                            this.plugin.settings.selectedRolePath = newRolePath;
                                            return [4 /*yield*/, this.plugin.saveSettings()];
                                        case 3:
                                            _c.sent();
                                            // Емітуємо подію зміни ролі вручну, бо менеджер чату не викликався
                                            this.plugin.emit('role-changed', "None");
                                            (_b = (_a = this.plugin.promptService) === null || _a === void 0 ? void 0 : _a.clearRoleCache) === null || _b === void 0 ? void 0 : _b.call(_a);
                                            _c.label = 4;
                                        case 4: return [2 /*return*/];
                                    }
                                });
                            }); });
                            itemsAdded = true;
                        });
                        // --- 2. Додаємо роздільник, якщо є ролі ---
                        if (roles.length > 0) {
                            menu.addSeparator();
                            itemsAdded = true;
                        }
                        // --- 3. Додаємо список ролей ---
                        roles.forEach(function (roleInfo) {
                            menu.addItem(function (item) {
                                item
                                    .setTitle(roleInfo.name)
                                    .setIcon(roleInfo.path === currentRolePath_1 ? "check" : (roleInfo.isCustom ? 'user' : 'file-text')) // Іконки: обрана, кастомна, звичайна
                                    .onClick(function () { return __awaiter(_this, void 0, void 0, function () {
                                    var newRolePath;
                                    var _a, _b;
                                    return __generator(this, function (_c) {
                                        switch (_c.label) {
                                            case 0:
                                                newRolePath = roleInfo.path;
                                                if (!(currentRolePath_1 !== newRolePath)) return [3 /*break*/, 4];
                                                if (!activeChat_1) return [3 /*break*/, 2];
                                                return [4 /*yield*/, this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath })];
                                            case 1:
                                                _c.sent();
                                                return [3 /*break*/, 4];
                                            case 2:
                                                // Якщо чату немає, змінюємо глобальне налаштування
                                                this.plugin.settings.selectedRolePath = newRolePath;
                                                return [4 /*yield*/, this.plugin.saveSettings()];
                                            case 3:
                                                _c.sent();
                                                this.plugin.emit('role-changed', roleInfo.name);
                                                (_b = (_a = this.plugin.promptService) === null || _a === void 0 ? void 0 : _a.clearRoleCache) === null || _b === void 0 ? void 0 : _b.call(_a);
                                                _c.label = 4;
                                            case 4: return [2 /*return*/];
                                        }
                                    });
                                }); });
                                itemsAdded = true;
                            });
                        });
                        return [3 /*break*/, 6];
                    case 4:
                        error_6 = _d.sent();
                        // loadingNotice?.hide();
                        console.error("Error loading roles for role selection menu:", error_6);
                        // Додаємо елемент помилки в меню, лише якщо нічого іншого не додалося
                        if (!itemsAdded) {
                            menu.addItem(function (item) { return item.setTitle("Error loading roles").setDisabled(true); });
                            itemsAdded = true;
                        }
                        new obsidian_1.Notice("Failed to load roles.");
                        return [3 /*break*/, 6];
                    case 5:
                        if (itemsAdded) {
                            menu.showAtMouseEvent(event); // Показуємо меню
                        }
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        }); };
        _this.plugin = plugin;
        _this.initSpeechWorker();
        // Переконуємось, що handleScroll визначено ПЕРЕД цим рядком
        _this.scrollListenerDebounced = obsidian_1.debounce(_this.handleScroll, 150, true);
        console.log("[OllamaView] Constructed.");
        return _this;
    }
    // --- Getters ---
    /** Checks if the custom menu dropdown is currently visible */
    OllamaView.prototype.isMenuOpen = function () {
        return !!this.menuDropdown && this.menuDropdown.style.display === 'block';
    };
    // --- Obsidian View Methods ---
    OllamaView.prototype.getViewType = function () { return exports.VIEW_TYPE_OLLAMA_PERSONAS; };
    OllamaView.prototype.getDisplayText = function () { return "AI Forge"; };
    OllamaView.prototype.getIcon = function () { return "brain-circuit"; };
    OllamaView.prototype.onOpen = function () {
        return __awaiter(this, void 0, Promise, function () {
            var error_7;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[OllamaView] onOpen START");
                        this.createUIElements();
                        // Оновлюємо плейсхолдер на основі ролі при відкритті
                        this.getCurrentRoleDisplayName().then(function (roleName) {
                            _this.updateInputPlaceholder(roleName);
                        });
                        // Модель оновлюється окремо, можливо, з кешу налаштувань спочатку
                        this.updateModelDisplay(this.plugin.settings.modelName);
                        this.attachEventListeners();
                        this.autoResizeTextarea();
                        this.updateSendButtonState();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        // loadAndDisplayActiveChat тепер сам оновить і модель, і роль/плейсхолдер
                        return [4 /*yield*/, this.loadAndDisplayActiveChat()];
                    case 2:
                        // loadAndDisplayActiveChat тепер сам оновить і модель, і роль/плейсхолдер
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_7 = _a.sent();
                        console.error("[OllamaView] Error during initial chat load:", error_7);
                        this.showEmptyState();
                        // Якщо завантаження чату не вдалось, все одно встановимо плейсхолдер і модель
                        this.getCurrentRoleDisplayName().then(function (roleName) {
                            _this.updateInputPlaceholder(roleName);
                            _this.updateRoleDisplay(roleName); // <-- Оновлюємо дисплей ролі
                        });
                        this.updateModelDisplay(this.plugin.settings.modelName);
                        return [3 /*break*/, 4];
                    case 4:
                        setTimeout(function () { var _a; return (_a = _this.inputEl) === null || _a === void 0 ? void 0 : _a.focus(); }, 150);
                        if (this.inputEl) {
                            this.inputEl.dispatchEvent(new Event('input'));
                        }
                        console.log("[OllamaView] onOpen END");
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
        // --- Input Container (Тепер містить textarea + controlsContainer) ---
        var inputContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER });
        // 1. Textarea (зверху)
        this.inputEl = inputContainer.createEl("textarea", { attr: { placeholder: "Text...", rows: 1 } });
        // Забираємо зайвий padding-right, який був для старих кнопок
        // this.inputEl.style.paddingRight = '15px'; // Або залишити стандартний
        // 2. Контейнер для контролів (знизу)
        var controlsContainer = inputContainer.createDiv({ cls: CSS_CLASS_INPUT_CONTROLS_CONTAINER });
        // 2a. Ліва група контролів
        var leftControls = controlsContainer.createDiv({ cls: CSS_CLASS_INPUT_CONTROLS_LEFT });
        this.translateInputButton = leftControls.createEl("button", { cls: CSS_CLASS_TRANSLATE_INPUT_BUTTON, attr: { 'aria-label': 'Translate input to English' } });
        obsidian_1.setIcon(this.translateInputButton, "languages");
        this.translateInputButton.title = "Translate input to English";
        this.modelDisplayEl = leftControls.createDiv({ cls: CSS_CLASS_MODEL_DISPLAY });
        this.modelDisplayEl.setText("..."); // Початковий текст
        this.modelDisplayEl.title = "Click to select model";
        this.roleDisplayEl = leftControls.createDiv({ cls: CSS_CLASS_ROLE_DISPLAY });
        this.roleDisplayEl.setText("..."); // Початковий текст
        this.roleDisplayEl.title = "Click to select role";
        // 2b. Права група контролів (старий buttonsContainer)
        this.buttonsContainer = controlsContainer.createDiv({ cls: CSS_CLASS_BUTTONS_CONTAINER + " " + CSS_CLASS_INPUT_CONTROLS_RIGHT });
        this.sendButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_SEND_BUTTON, attr: { 'aria-label': 'Send' } });
        obsidian_1.setIcon(this.sendButton, "send");
        this.voiceButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_VOICE_BUTTON, attr: { 'aria-label': 'Voice Input' } });
        obsidian_1.setIcon(this.voiceButton, "mic");
        this.menuButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_MENU_BUTTON, attr: { 'aria-label': 'Menu' } });
        obsidian_1.setIcon(this.menuButton, "more-vertical");
        // --- Кастомне Випадаюче Меню (для кнопки "...") ---
        // Позиціонується відносно inputContainer або menuButton
        this.menuDropdown = inputContainer.createEl("div", { cls: [CSS_CLASS_MENU_DROPDOWN, "ollama-chat-menu"] });
        this.menuDropdown.style.display = "none"; // Приховано
        // Helper для секцій акордеону
        var createSubmenuSection = function (title, icon, listContainerClass, sectionClass) {
            var section = _this.menuDropdown.createDiv();
            if (sectionClass)
                section.addClass(sectionClass);
            var header = section.createDiv({ cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_MENU_HEADER_ITEM });
            obsidian_1.setIcon(header.createSpan({ cls: "menu-option-icon" }), icon);
            header.createSpan({ cls: "menu-option-text", text: title });
            obsidian_1.setIcon(header.createSpan({ cls: CSS_CLASS_SUBMENU_ICON }), "chevron-right");
            var content = section.createDiv({ cls: CSS_CLASS_SUBMENU_CONTENT + " " + CSS_CLASS_SUBMENU_CONTENT_HIDDEN + " " + listContainerClass });
            content.style.maxHeight = '0';
            content.style.overflow = 'hidden';
            content.style.transition = 'max-height 0.3s ease-out, padding 0.3s ease-out';
            content.style.paddingTop = '0';
            content.style.paddingBottom = '0';
            return { header: header, content: content, section: section };
        };
        // Створюємо секції акордеону
        // Секція Моделей буде прихована на десктопі через CSS
        var modelSection = createSubmenuSection("Select Model", "list-collapse", CSS_CLASS_MODEL_LIST_CONTAINER, "model-submenu-section");
        this.modelSubmenuHeader = modelSection.header;
        this.modelSubmenuContent = modelSection.content;
        // const roleSection = createSubmenuSection("Select Role", "users", CSS_CLASS_ROLE_LIST_CONTAINER); this.roleSubmenuHeader s= roleSection.header; this.roleSubmenuContent = roleSection.content;
        var roleSection = createSubmenuSection("Select Role", "users", CSS_CLASS_ROLE_LIST_CONTAINER, "role-submenu-section");
        this.roleSubmenuHeader = roleSection.header;
        this.roleSubmenuContent = roleSection.content;
        var chatSection = createSubmenuSection("Load Chat", "messages-square", CSS_CLASS_CHAT_LIST_CONTAINER);
        this.chatSubmenuHeader = chatSection.header;
        this.chatSubmenuContent = chatSection.content;
        this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });
        this.menuDropdown.createEl("div", { text: "Actions", cls: CSS_CLASS_MENU_HEADER });
        // ... (всі прямі опції меню: New Chat, Rename, Clone, Export, Clear, Delete, Settings) ...
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
        this.clearChatOption = this.menuDropdown.createEl("div", { cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_CLEAR_CHAT_OPTION + " " + CSS_CLASS_DANGER_OPTION });
        obsidian_1.setIcon(this.clearChatOption.createSpan({ cls: "menu-option-icon" }), "trash");
        this.clearChatOption.createSpan({ cls: "menu-option-text", text: "Clear Messages" });
        this.deleteChatOption = this.menuDropdown.createEl("div", { cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_DELETE_CHAT_OPTION + " " + CSS_CLASS_DANGER_OPTION });
        obsidian_1.setIcon(this.deleteChatOption.createSpan({ cls: "menu-option-icon" }), "trash-2");
        this.deleteChatOption.createSpan({ cls: "menu-option-text", text: "Delete Chat" });
        this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });
        this.settingsOption = this.menuDropdown.createEl("div", { cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_SETTINGS_OPTION });
        obsidian_1.setIcon(this.settingsOption.createSpan({ cls: "menu-option-icon" }), "settings");
        this.settingsOption.createSpan({ cls: "menu-option-text", text: "Settings" });
        // --- Кінець Кастомного Меню ---
    };
    // --- Event Listeners (with Custom Div Menu) ---
    OllamaView.prototype.attachEventListeners = function () {
        var _this = this;
        console.log("[OllamaView Debug] Attaching event listeners START");
        // Перевірки існування елементів
        if (!this.inputEl)
            console.error("inputEl missing!");
        else
            console.log("[OllamaView Debug] inputEl FOUND");
        if (!this.sendButton)
            console.error("sendButton missing!");
        else
            console.log("[OllamaView Debug] sendButton FOUND");
        if (!this.menuButton)
            console.error("menuButton missing!");
        else
            console.log("[OllamaView Debug] menuButton FOUND");
        if (!this.modelDisplayEl)
            console.error("modelDisplayEl missing!");
        else
            console.log("[OllamaView Debug] modelDisplayEl FOUND");
        if (!this.translateInputButton)
            console.error("translateInputButton missing!");
        else
            console.log("[OllamaView Debug] translateInputButton FOUND");
        // Слухачі поля вводу
        if (this.inputEl) {
            this.inputEl.addEventListener("keydown", this.handleKeyDown);
            this.inputEl.addEventListener('input', this.handleInputForResize);
        }
        // Слухачі кнопок
        if (this.sendButton)
            this.sendButton.addEventListener("click", this.handleSendClick);
        if (this.voiceButton)
            this.voiceButton.addEventListener("click", this.handleVoiceClick);
        if (this.translateInputButton)
            this.translateInputButton.addEventListener("click", this.handleTranslateInputClick);
        if (this.menuButton)
            this.menuButton.addEventListener("click", this.handleMenuClick); // Головне кастомне меню
        if (this.modelDisplayEl)
            this.registerDomEvent(this.modelDisplayEl, 'click', this.handleModelDisplayClick); // Спливаюче меню моделей
        console.log("OllamaView.ts ->  ROLEDISPLAY: " + this.roleDisplayEl);
        if (this.roleDisplayEl) {
            this.registerDomEvent(this.roleDisplayEl, 'click', this.handleRoleDisplayClick);
            console.log("[OllamaView Debug] roleDisplayEl FOUND & Listener Attached");
        }
        else {
            console.error("roleDisplayEl missing!");
        }
        // Слухачі для кастомного меню (акордеон)
        if (this.modelSubmenuHeader)
            this.registerDomEvent(this.modelSubmenuHeader, 'click', function () { return _this.toggleSubmenu(_this.modelSubmenuHeader, _this.modelSubmenuContent, 'models'); });
        else
            console.error("modelSubmenuHeader missing!");
        if (this.roleSubmenuHeader)
            this.registerDomEvent(this.roleSubmenuHeader, 'click', function () { return _this.toggleSubmenu(_this.roleSubmenuHeader, _this.roleSubmenuContent, 'roles'); });
        else
            console.error("roleSubmenuHeader missing!");
        if (this.chatSubmenuHeader)
            this.registerDomEvent(this.chatSubmenuHeader, 'click', function () { return _this.toggleSubmenu(_this.chatSubmenuHeader, _this.chatSubmenuContent, 'chats'); });
        else
            console.error("chatSubmenuHeader missing!");
        // Слухачі для прямих опцій меню
        if (this.settingsOption)
            this.settingsOption.addEventListener("click", this.handleSettingsClick);
        else
            console.error("settingsOption missing!");
        if (this.clearChatOption)
            this.clearChatOption.addEventListener("click", this.handleClearChatClick);
        else
            console.error("clearChatOption missing!");
        if (this.exportChatOption)
            this.exportChatOption.addEventListener("click", this.handleExportChatClick);
        else
            console.error("exportChatOption missing!");
        if (this.newChatOption)
            this.newChatOption.addEventListener("click", this.handleNewChatClick);
        else
            console.error("newChatOption missing!");
        if (this.renameChatOption)
            this.renameChatOption.addEventListener("click", this.handleRenameChatClick);
        else
            console.error("renameChatOption missing!");
        if (this.cloneChatOption)
            this.cloneChatOption.addEventListener("click", this.handleCloneChatClick);
        else
            console.error("cloneChatOption missing!");
        if (this.deleteChatOption)
            this.deleteChatOption.addEventListener("click", this.handleDeleteChatClick);
        else
            console.error("deleteChatOption missing!");
        if (this.settingsOption)
            this.settingsOption.addEventListener("click", this.handleSettingsClick);
        else
            console.error("settingsOption missing!");
        if (this.clearChatOption)
            this.clearChatOption.addEventListener("click", this.handleClearChatClick);
        else
            console.error("clearChatOption missing!");
        if (this.exportChatOption)
            this.exportChatOption.addEventListener("click", this.handleExportChatClick);
        else
            console.error("exportChatOption missing!");
        if (this.newChatOption)
            this.newChatOption.addEventListener("click", this.handleNewChatClick);
        else
            console.error("newChatOption missing!");
        if (this.renameChatOption)
            this.renameChatOption.addEventListener("click", this.handleRenameChatClick);
        else
            console.error("renameChatOption missing!");
        if (this.cloneChatOption)
            this.cloneChatOption.addEventListener("click", this.handleCloneChatClick);
        else
            console.error("cloneChatOption missing!");
        if (this.deleteChatOption)
            this.deleteChatOption.addEventListener("click", this.handleDeleteChatClick);
        else
            console.error("deleteChatOption missing!");
        // --- End Custom Menu Listeners ---
        // Window/Workspace/Document listeners
        this.registerDomEvent(window, 'resize', this.handleWindowResize);
        this.registerEvent(this.app.workspace.on('resize', this.handleWindowResize));
        this.registerDomEvent(document, 'click', this.handleDocumentClickForMenu);
        this.registerDomEvent(document, 'visibilitychange', this.handleVisibilityChange);
        this.registerEvent(this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange));
        if (this.chatContainer) {
            this.registerDomEvent(this.chatContainer, 'scroll', this.scrollListenerDebounced);
            console.log("[OllamaView] Attached listener to chatContainer scroll");
        }
        else {
            console.error("chatContainer missing!");
        }
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
        this.register(this.plugin.on('settings-updated', this.handleSettingsUpdated));
        console.log("[OllamaView Debug] Attaching event listeners END");
    };
    OllamaView.prototype.updateModelDisplay = function (modelName) {
        if (this.modelDisplayEl) {
            var displayName = modelName || "Default"; // Або "Select Model"
            // Забираємо ':latest', якщо воно є, для коротшого відображення
            var shortName = displayName.replace(/:latest$/, '');
            this.modelDisplayEl.setText(shortName);
            this.modelDisplayEl.title = "Current model: " + displayName + ". Click to change.";
        }
    };
    // Handles clicks on submenu headers (Model, Role, Chat)
    OllamaView.prototype.toggleSubmenu = function (headerEl, contentEl, type) {
        return __awaiter(this, void 0, Promise, function () {
            var iconEl, isHidden, _a, error_8;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!headerEl || !contentEl)
                            return [2 /*return*/];
                        iconEl = headerEl.querySelector("." + CSS_CLASS_SUBMENU_ICON);
                        isHidden = contentEl.style.maxHeight === '0px' || contentEl.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
                        console.log("[OllamaView Debug] Toggling submenu '" + type + "'. Hidden: " + isHidden);
                        if (isHidden) {
                            this.collapseAllSubmenus(contentEl);
                        } // Collapse others first
                        if (!isHidden) return [3 /*break*/, 11];
                        // --- Expand ---
                        if (iconEl instanceof HTMLElement)
                            obsidian_1.setIcon(iconEl, 'chevron-down');
                        contentEl.empty();
                        contentEl.createDiv({ cls: "menu-loading", text: "Loading " + type + "..." });
                        contentEl.classList.remove(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
                        contentEl.style.paddingTop = '5px';
                        contentEl.style.paddingBottom = '5px';
                        contentEl.style.maxHeight = '40px'; // For loading text
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
                        return [3 /*break*/, 8]; // Рендеримо в контейнер
                    case 4: return [4 /*yield*/, this.renderRoleList()];
                    case 5:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 6: return [4 /*yield*/, this.renderChatListMenu()];
                    case 7:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 8:
                        requestAnimationFrame(function () { if (!contentEl.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN)) {
                            contentEl.style.maxHeight = contentEl.scrollHeight + 'px';
                        } });
                        return [3 /*break*/, 10];
                    case 9:
                        error_8 = _b.sent();
                        console.error("Error rendering " + type + " list:", error_8);
                        contentEl.empty();
                        contentEl.createDiv({ cls: "menu-error-text", text: "Error loading " + type + "." });
                        contentEl.style.maxHeight = '50px';
                        return [3 /*break*/, 10];
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        // --- Collapse ---
                        contentEl.classList.add(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
                        contentEl.style.maxHeight = '0';
                        contentEl.style.paddingTop = '0';
                        contentEl.style.paddingBottom = '0';
                        if (iconEl instanceof HTMLElement)
                            obsidian_1.setIcon(iconEl, 'chevron-right');
                        _b.label = 12;
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    // Helper to collapse all submenus except the one potentially being opened
    OllamaView.prototype.collapseAllSubmenus = function (exceptContent) {
        var submenus = [
            { header: this.modelSubmenuHeader, content: this.modelSubmenuContent },
            { header: this.roleSubmenuHeader, content: this.roleSubmenuContent },
            { header: this.chatSubmenuHeader, content: this.chatSubmenuContent }
        ];
        submenus.forEach(function (submenu) {
            // Check elements exist before manipulating
            if (submenu.content && submenu.header && submenu.content !== exceptContent) {
                if (!submenu.content.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN)) {
                    submenu.content.classList.add(CSS_CLASS_SUBMENU_CONTENT_HIDDEN);
                    submenu.content.style.maxHeight = '0';
                    submenu.content.style.paddingTop = '0';
                    submenu.content.style.paddingBottom = '0';
                    var iconEl = submenu.header.querySelector("." + CSS_CLASS_SUBMENU_ICON);
                    if (iconEl instanceof HTMLElement) {
                        obsidian_1.setIcon(iconEl, 'chevron-right');
                    }
                }
            }
        });
    };
    // --- UI Update Methods ---
    OllamaView.prototype.updateInputPlaceholder = function (roleName) {
        if (this.inputEl) {
            var displayRole = roleName || "Assistant"; // Запасний варіант
            this.inputEl.placeholder = "Message " + displayRole + "..."; // Новий формат
        }
    };
    OllamaView.prototype.closeMenu = function () { if (this.menuDropdown) {
        this.menuDropdown.style.display = "none";
        this.collapseAllSubmenus(null);
    } };
    OllamaView.prototype.autoResizeTextarea = function () { this.adjustTextareaHeight(); };
    OllamaView.prototype.updateRoleDisplay = function (roleName) {
        if (this.roleDisplayEl) {
            var displayName = roleName || "None"; // Якщо роль не вибрана
            this.roleDisplayEl.setText(displayName);
            this.roleDisplayEl.title = "Current role: " + displayName + ". Click to change.";
        }
    };
    OllamaView.prototype.updateSendButtonState = function () { if (!this.inputEl || !this.sendButton)
        return; var isDisabled = this.inputEl.value.trim() === '' || this.isProcessing; this.sendButton.disabled = isDisabled; this.sendButton.classList.toggle(CSS_CLASS_DISABLED, isDisabled); };
    OllamaView.prototype.showEmptyState = function () { var _a, _b; if (this.currentMessages.length === 0 && !this.emptyStateEl && this.chatContainer) {
        this.chatContainer.empty();
        this.emptyStateEl = this.chatContainer.createDiv({ cls: CSS_CLASS_EMPTY_STATE });
        this.emptyStateEl.createDiv({ cls: "empty-state-message", text: "No messages yet" });
        var modelName = ((_b = (_a = this.plugin) === null || _a === void 0 ? void 0 : _a.settings) === null || _b === void 0 ? void 0 : _b.modelName) || "the AI";
        this.emptyStateEl.createDiv({ cls: "empty-state-tip", text: "Type a message or use the menu options to start interacting with " + modelName + "." });
    } };
    OllamaView.prototype.hideEmptyState = function () { if (this.emptyStateEl) {
        this.emptyStateEl.remove();
        this.emptyStateEl = null;
    } };
    OllamaView.prototype.setLoadingState = function (isLoading) { console.log("[OllamaView Debug] setLoadingState CALLED with: " + isLoading); this.isProcessing = isLoading; if (this.inputEl)
        this.inputEl.disabled = isLoading; this.updateSendButtonState(); if (this.voiceButton) {
        this.voiceButton.disabled = isLoading;
        this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading);
    } if (this.translateInputButton) {
        this.translateInputButton.disabled = isLoading;
        this.translateInputButton.classList.toggle(CSS_CLASS_DISABLED, isLoading);
    } if (this.menuButton) {
        this.menuButton.disabled = isLoading;
        this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading);
    } console.log("[OllamaView Debug] isProcessing is now: " + this.isProcessing); };
    OllamaView.prototype.loadAndDisplayActiveChat = function () {
        var _a;
        return __awaiter(this, void 0, Promise, function () {
            var currentModelName, currentRoleName, activeChat, error_9;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log("[OllamaView] Loading and displaying active chat...");
                        this.clearChatContainerInternal();
                        this.currentMessages = [];
                        this.lastRenderedMessageDate = null;
                        currentModelName = this.plugin.settings.modelName;
                        return [4 /*yield*/, this.getCurrentRoleDisplayName()];
                    case 1:
                        currentRoleName = _b.sent();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 4, 5, 6]);
                        return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 3:
                        activeChat = _b.sent();
                        if (activeChat) {
                            // Отримуємо модель з метаданих активного чату
                            currentModelName = activeChat.metadata.modelName || this.plugin.settings.modelName;
                            // Роль вже визначена вище через getCurrentRoleDisplayName, яка враховує activeChat
                            if (activeChat.messages.length > 0) {
                                console.log("[OllamaView] Active chat '" + activeChat.metadata.name + "' found with " + activeChat.messages.length + " messages.");
                                this.hideEmptyState();
                                this.renderMessages(activeChat.messages);
                                this.checkAllMessagesForCollapsing();
                                setTimeout(function () { _this.guaranteedScrollToBottom(100, true); }, 150);
                            }
                            else {
                                console.log("[OllamaView] Active chat '" + activeChat.metadata.name + "' found but is empty.");
                                this.showEmptyState();
                            }
                        }
                        else {
                            console.warn("[OllamaView] No active chat found or failed to load.");
                            this.showEmptyState();
                            // Модель та роль вже встановлені на глобальні значення за замовчуванням вище
                        }
                        return [3 /*break*/, 6];
                    case 4:
                        error_9 = _b.sent();
                        console.error("[OllamaView] Error getting active chat:", error_9);
                        this.showEmptyState();
                        new obsidian_1.Notice("Error loading chat history.");
                        return [3 /*break*/, 6];
                    case 5:
                        // Оновлюємо плейсхолдер РОЛІ та дисплей МОДЕЛІ в кінці
                        this.updateInputPlaceholder(currentRoleName);
                        this.updateRoleDisplay(currentRoleName);
                        this.updateModelDisplay(currentModelName);
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
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
            var content, activeChat, userMessageContent, loadingEl, userMessage, assistantMessage, error_10;
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
                        error_10 = _b.sent();
                        //console.error("[OllamaView] Send/receive cycle error:", error);
                        if (loadingEl) {
                            this.removeLoadingIndicator(loadingEl);
                            loadingEl = null;
                        } // Ensure indicator removed on error
                        // Add error directly to display
                        this.addMessageToDisplay("error", "Error: " + (error_10.message || 'Unknown error.'), new Date());
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
        //TODO: checkit
        // const messageEl = messageGroup.createDiv({ cls: messageClass });
        var messageWrapper = messageGroup.querySelector('.message-wrapper');
        if (!messageWrapper) {
            messageWrapper = messageGroup.createDiv({ cls: 'message-wrapper' });
            // Ensure correct order relative to avatar based on group type
            if (messageGroup.classList.contains(CSS_CLASS_USER_GROUP)) {
                messageWrapper.style.order = '1'; // Messages first
            }
            else {
                messageWrapper.style.order = '2'; // Messages second
            }
        }
        var messageEl = messageWrapper.createDiv({ cls: messageClass }); // Append message to wrapper
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
            var targetLang, apiKey, textToTranslate, translatedText, translationContainer, targetLangName, error_11, targetLangName;
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
                        error_11 = _b.sent();
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
    // --- Menu List Rendering (Accordion Style) ---
    OllamaView.prototype.renderModelList = function () {
        var _a, _b;
        return __awaiter(this, void 0, Promise, function () {
            var container, modelIconMap, defaultIcon, models, activeChat, currentModelName_2, error_12;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        container = this.modelSubmenuContent;
                        if (!container)
                            return [2 /*return*/];
                        container.empty();
                        modelIconMap = { 'llama': 'box-minimal', 'mistral': 'wind' };
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
                        currentModelName_2 = ((_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.modelName) || this.plugin.settings.modelName;
                        if (models.length === 0) {
                            container.createEl("div", { cls: "menu-info-text", text: "No models." });
                            return [2 /*return*/];
                        }
                        models.forEach(function (modelName) {
                            var optionEl = container.createDiv({ cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_MODEL_OPTION });
                            var iconSpan = optionEl.createEl("span", { cls: "menu-option-icon" });
                            var iconToUse = defaultIcon;
                            if (modelName === currentModelName_2) {
                                iconToUse = "check";
                                optionEl.addClass("is-selected");
                            }
                            else {
                                var l = modelName.toLowerCase();
                                var f = false;
                                for (var k in modelIconMap) {
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
                                obsidian_1.setIcon(iconSpan, iconToUse);
                            }
                            catch (e) {
                                iconSpan.style.minWidth = "18px";
                            }
                            optionEl.createEl("span", { cls: "menu-option-text", text: modelName });
                            _this.registerDomEvent(optionEl, 'click', function () { return __awaiter(_this, void 0, void 0, function () {
                                var chat;
                                var _a;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            if (!(modelName !== currentModelName_2)) return [3 /*break*/, 4];
                                            return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                                        case 1:
                                            chat = _b.sent();
                                            if (!chat) return [3 /*break*/, 3];
                                            return [4 /*yield*/, this.plugin.chatManager.updateActiveChatMetadata({ modelName: modelName })];
                                        case 2:
                                            _b.sent();
                                            return [3 /*break*/, 4];
                                        case 3:
                                            new obsidian_1.Notice("No active chat.");
                                            _b.label = 4;
                                        case 4:
                                            this.closeMenu();
                                            return [2 /*return*/];
                                    }
                                });
                            }); });
                        });
                        this.updateSubmenuHeight(container);
                        return [3 /*break*/, 5];
                    case 4:
                        error_12 = _c.sent();
                        container.empty();
                        container.createEl("div", { cls: "menu-error-text", text: "Error models." });
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
            var container, roles, activeChat, currentChatRolePath_1, noRoleOptionEl, noRoleIconSpan, error_13;
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
                        noRoleOptionEl.createEl("span", {
                            cls: "menu-option-text", text: "None"
                        });
                        this.registerDomEvent(noRoleOptionEl, 'click', function () { return __awaiter(_this, void 0, void 0, function () {
                            var nrp, chat;
                            var _a, _b, _c;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        nrp = "";
                                        if (!(this.plugin.settings.selectedRolePath !== nrp || currentChatRolePath_1 !== nrp)) return [3 /*break*/, 5];
                                        this.plugin.settings.selectedRolePath = nrp;
                                        return [4 /*yield*/, this.plugin.saveSettings()];
                                    case 1:
                                        _d.sent();
                                        return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                                    case 2:
                                        chat = _d.sent();
                                        if (!(chat && chat.metadata.selectedRolePath !== nrp)) return [3 /*break*/, 4];
                                        return [4 /*yield*/, this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: nrp })];
                                    case 3:
                                        _d.sent();
                                        (_c = (_b = this.plugin.promptService) === null || _b === void 0 ? void 0 : _b.clearRoleCache) === null || _c === void 0 ? void 0 : _c.call(_b);
                                        _d.label = 4;
                                    case 4:
                                        this.plugin.emit('role-changed', "None");
                                        _d.label = 5;
                                    case 5:
                                        this.closeMenu();
                                        return [2 /*return*/];
                                }
                            });
                        }); });
                        if (roles.length > 0)
                            container.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });
                        roles.forEach(function (roleInfo) {
                            var roleOptionEl = container.createDiv({ cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_ROLE_OPTION });
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
                            _this.registerDomEvent(roleOptionEl, 'click', function () { return __awaiter(_this, void 0, void 0, function () {
                                var nrp, chat;
                                var _a, _b, _c;
                                return __generator(this, function (_d) {
                                    switch (_d.label) {
                                        case 0:
                                            nrp = roleInfo.path;
                                            if (!(this.plugin.settings.selectedRolePath !== nrp || currentChatRolePath_1 !== nrp)) return [3 /*break*/, 5];
                                            this.plugin.settings.selectedRolePath = nrp;
                                            return [4 /*yield*/, this.plugin.saveSettings()];
                                        case 1:
                                            _d.sent();
                                            return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                                        case 2:
                                            chat = _d.sent();
                                            if (!(chat && chat.metadata.selectedRolePath !== nrp)) return [3 /*break*/, 4];
                                            return [4 /*yield*/, this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: nrp })];
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
                                });
                            }); });
                        });
                        this.updateSubmenuHeight(container);
                        return [3 /*break*/, 5];
                    case 4:
                        error_13 = _d.sent();
                        container.empty();
                        container.createEl("div", { cls: "menu-error-text", text: "Error roles." });
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
                try {
                    chats = ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.listAvailableChats()) || [];
                    currentActiveId_1 = (_b = this.plugin.chatManager) === null || _b === void 0 ? void 0 : _b.getActiveChatId();
                    if (chats.length === 0) {
                        container.createEl("div", { cls: "menu-info-text", text: "No saved chats." });
                        return [2 /*return*/];
                    }
                    chats.forEach(function (chatMeta) {
                        var chatOptionEl = container.createDiv({ cls: CSS_CLASS_MENU_OPTION + " " + CSS_CLASS_CHAT_OPTION });
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
                        _this.registerDomEvent(chatOptionEl, 'click', function () { return __awaiter(_this, void 0, void 0, function () { var _a; return __generator(this, function (_b) {
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
                        }); }); });
                    });
                    this.updateSubmenuHeight(container);
                }
                catch (error) {
                    container.empty();
                    container.createEl("div", { cls: "menu-error-text", text: "Error chats." });
                    this.updateSubmenuHeight(container);
                }
                return [2 /*return*/];
            });
        });
    };
    OllamaView.prototype.updateSubmenuHeight = function (contentEl) { if (contentEl && !contentEl.classList.contains(CSS_CLASS_SUBMENU_CONTENT_HIDDEN)) {
        requestAnimationFrame(function () { contentEl.style.maxHeight = contentEl.scrollHeight + 'px'; });
    } };
    // --- Speech Recognition Methods ---
    // --- Speech Recognition Placeholders ---
    OllamaView.prototype.initSpeechWorker = function () {
        // Use try-catch for robustness, especially with Blob URLs and Workers
        try {
            // Optimized Base64 encoding helper function
            var bufferToBase64 = function (buffer) {
                var binary = '';
                var bytes = new Uint8Array(buffer);
                var len = bytes.byteLength;
                for (var i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                return btoa(binary);
            };
            // Worker code as a template literal for better readability
            var workerCode = "\n          // Worker Scope\n          self.onmessage = async (event) => {\n            const { apiKey, audioBlob, languageCode = 'uk-UA' } = event.data;\n\n            if (!apiKey || apiKey.trim() === '') {\n              self.postMessage({ error: true, message: 'Google API Key is not configured. Please add it in plugin settings.' });\n              return;\n            }\n\n            const url = \"https://speech.googleapis.com/v1/speech:recognize?key=\" + apiKey;\n\n            try {\n              const arrayBuffer = await audioBlob.arrayBuffer();\n\n              // Optimized Base64 Conversion (using helper if needed, or direct if worker supports TextDecoder efficiently)\n              // Simpler approach: pass buffer directly if API allows, or use efficient base64:\n              let base64Audio;\n              if (typeof TextDecoder !== 'undefined') { // Browser environment check\n                   // Modern approach (often faster if native)\n                   const base64String = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));\n                   base64Audio = base64String;\n\n              } else {\n                   // Fallback (similar to original, ensure correctness)\n                   base64Audio = btoa(\n                     new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')\n                   );\n              }\n\n\n              const response = await fetch(url, {\n                method: 'POST',\n                body: JSON.stringify({\n                  config: {\n                    encoding: 'WEBM_OPUS', // Ensure this matches MediaRecorder output\n                    sampleRateHertz: 48000, // Match sample rate if possible\n                    languageCode: languageCode,\n                    model: 'latest_long', // Consider other models if needed\n                    enableAutomaticPunctuation: true,\n                  },\n                  audio: { content: base64Audio },\n                }),\n                headers: { 'Content-Type': 'application/json' },\n              });\n\n              const responseData = await response.json();\n\n              if (!response.ok) {\n                //console.error(\"Google Speech API Error:\", responseData);\n                self.postMessage({\n                  error: true,\n                  message: \"Error from Google Speech API: \" + (responseData.error?.message || response.statusText || 'Unknown error')\n                });\n                return;\n              }\n\n              if (responseData.results && responseData.results.length > 0) {\n                const transcript = responseData.results\n                  .map(result => result.alternatives[0].transcript)\n                  .join(' ')\n                  .trim();\n                self.postMessage(transcript); // Send back only the transcript string\n              } else {\n                 // Handle cases where API returns ok but no results (e.g., silence)\n                 self.postMessage({ error: true, message: 'No speech detected or recognized.' });\n              }\n            } catch (error) {\n               //console.error(\"Error in speech worker processing:\", error);\n               self.postMessage({\n                 error: true,\n                 message: 'Error processing speech recognition: ' + (error instanceof Error ? error.message : String(error))\n               });\n            }\n          };\n        ";
            var workerBlob = new Blob([workerCode], { type: 'application/javascript' });
            var workerUrl = URL.createObjectURL(workerBlob);
            this.speechWorker = new Worker(workerUrl);
            URL.revokeObjectURL(workerUrl); // Revoke URL immediately after worker creation
            this.setupSpeechWorkerHandlers(); // Setup message/error handlers
            //console.log("Speech worker initialized.");
        }
        catch (error) {
            //console.error("Failed to initialize speech worker:", error);
            new obsidian_1.Notice("Speech recognition feature failed to initialize.");
            this.speechWorker = null; // Ensure worker is null if init fails
        }
    };
    OllamaView.prototype.setupSpeechWorkerHandlers = function () {
        var _this = this;
        if (!this.speechWorker)
            return;
        this.speechWorker.onmessage = function (event) {
            var data = event.data;
            // Check for error object from worker
            if (data && typeof data === 'object' && data.error) {
                //console.error("Speech recognition error:", data.message);
                new obsidian_1.Notice("Speech Recognition Error: " + data.message);
                _this.updateInputPlaceholder(_this.plugin.settings.modelName); // Reset placeholder on error
                _this.updateSendButtonState(); // Update button state as well
                return;
            }
            // Process valid transcript (should be a string)
            if (typeof data === 'string' && data.trim()) {
                var transcript = data.trim();
                _this.insertTranscript(transcript);
            }
            else if (typeof data !== 'string') {
                //console.warn("Received unexpected data format from speech worker:", data);
            }
            // If data is an empty string, do nothing (might happen with short silence)
            _this.updateSendButtonState(); // Update button state after processing
        };
        this.speechWorker.onerror = function (error) {
            //console.error("Unhandled worker error:", error);
            new obsidian_1.Notice("An unexpected error occurred in the speech recognition worker.");
            _this.updateInputPlaceholder(_this.plugin.settings.modelName); // Reset placeholder
            // Attempt to gracefully stop recording if it was active
            _this.stopVoiceRecording(false); // This also updates placeholder and button state
        };
    };
    OllamaView.prototype.insertTranscript = function (transcript) {
        var _a, _b;
        if (!this.inputEl)
            return;
        var currentVal = this.inputEl.value;
        var start = (_a = this.inputEl.selectionStart) !== null && _a !== void 0 ? _a : currentVal.length; // Use length if null
        var end = (_b = this.inputEl.selectionEnd) !== null && _b !== void 0 ? _b : currentVal.length;
        // Add spacing intelligently
        var textToInsert = transcript;
        var precedingChar = start > 0 ? currentVal[start - 1] : null;
        var followingChar = end < currentVal.length ? currentVal[end] : null;
        if (precedingChar && precedingChar !== ' ' && precedingChar !== '\n') {
            textToInsert = ' ' + textToInsert;
        }
        if (followingChar && followingChar !== ' ' && followingChar !== '\n' && !textToInsert.endsWith(' ')) {
            textToInsert += ' ';
        }
        var newValue = currentVal.substring(0, start) + textToInsert + currentVal.substring(end);
        this.inputEl.value = newValue;
        // Update cursor position
        var newCursorPos = start + textToInsert.length;
        this.inputEl.setSelectionRange(newCursorPos, newCursorPos);
        this.inputEl.focus();
        this.inputEl.dispatchEvent(new Event('input')); // Trigger resize calculation AND send button update
    };
    OllamaView.prototype.toggleVoiceRecognition = function () {
        return __awaiter(this, void 0, Promise, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(this.mediaRecorder && this.mediaRecorder.state === 'recording')) return [3 /*break*/, 1];
                        this.stopVoiceRecording(true); // Stop and process
                        return [3 /*break*/, 3];
                    case 1: return [4 /*yield*/, this.startVoiceRecognition()];
                    case 2:
                        _a.sent(); // Start new recording
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    OllamaView.prototype.startVoiceRecognition = function () {
        var _a;
        return __awaiter(this, void 0, Promise, function () {
            var _b, recorderOptions, preferredMimeType, audioChunks_1, error_14;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        // Перевірка наявності worker'а для розпізнавання
                        if (!this.speechWorker) {
                            new obsidian_1.Notice("Функція розпізнавання мовлення недоступна (worker не ініціалізовано).");
                            //console.error("Спроба розпочати розпізнавання голосу без ініціалізованого worker'а.");
                            return [2 /*return*/];
                        }
                        // Перевірка наявності ключа Google API
                        if (!this.plugin.settings.googleApiKey) {
                            new obsidian_1.Notice("Ключ Google API не налаштовано. Будь ласка, додайте його в налаштуваннях плагіна для використання голосового вводу.");
                            return [2 /*return*/];
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        // Запит доступу до мікрофона
                        _b = this;
                        return [4 /*yield*/, navigator.mediaDevices.getUserMedia({ audio: true })];
                    case 2:
                        // Запит доступу до мікрофона
                        _b.audioStream = _c.sent();
                        recorderOptions = void 0;
                        preferredMimeType = 'audio/webm;codecs=opus';
                        if (MediaRecorder.isTypeSupported(preferredMimeType)) {
                            //console.log(`Використовується підтримуваний mimeType: ${preferredMimeType}`);
                            recorderOptions = { mimeType: preferredMimeType }; // Призначаємо об'єкт опцій, якщо підтримується
                        }
                        else {
                            //console.warn(`${preferredMimeType} не підтримується, використовується стандартний браузера.`);
                            recorderOptions = undefined; // Явно використовуємо undefined для стандартних налаштувань браузера
                        }
                        // Створення екземпляру MediaRecorder з визначеними опціями
                        this.mediaRecorder = new MediaRecorder(this.audioStream, recorderOptions);
                        audioChunks_1 = [];
                        // --- Оновлення UI для стану запису ---
                        (_a = this.voiceButton) === null || _a === void 0 ? void 0 : _a.classList.add(CSS_CLASS_RECORDING); // Додати клас для стилізації
                        obsidian_1.setIcon(this.voiceButton, "stop-circle"); // Змінити іконку на "стоп"
                        this.inputEl.placeholder = "Recording... Speak now."; // Оновити плейсхолдер (English for consistency)
                        // --- Налаштування слухачів подій MediaRecorder ---
                        this.mediaRecorder.ondataavailable = function (event) {
                            if (event.data.size > 0) {
                                audioChunks_1.push(event.data);
                            }
                        };
                        this.mediaRecorder.onstop = function () {
                            var _a;
                            //console.log("MediaRecorder stopped.");
                            if (_this.speechWorker && audioChunks_1.length > 0) {
                                var audioBlob = new Blob(audioChunks_1, { type: ((_a = _this.mediaRecorder) === null || _a === void 0 ? void 0 : _a.mimeType) || 'audio/webm' });
                                //console.log(`Sending audio blob to worker: type=${audioBlob.type}, size=${audioBlob.size}`);
                                _this.inputEl.placeholder = "Processing speech..."; // Update placeholder
                                _this.speechWorker.postMessage({
                                    apiKey: _this.plugin.settings.googleApiKey,
                                    audioBlob: audioBlob,
                                    languageCode: _this.plugin.settings.speechLanguage || 'uk-UA'
                                });
                            }
                            else if (audioChunks_1.length === 0) {
                                //console.log("No audio data recorded.");
                                _this.updateInputPlaceholder(_this.plugin.settings.modelName); // Restore placeholder if nothing was recorded
                                _this.updateSendButtonState(); // Ensure button state is correct
                            }
                        };
                        this.mediaRecorder.onerror = function (event) {
                            //console.error("MediaRecorder Error:", event);
                            new obsidian_1.Notice("An error occurred during recording.");
                            _this.stopVoiceRecording(false); // Stop without processing on error
                        };
                        // --- Старт запису ---
                        this.mediaRecorder.start();
                        return [3 /*break*/, 4];
                    case 3:
                        error_14 = _c.sent();
                        //console.error("Error accessing microphone or starting recording:", error);
                        if (error_14 instanceof DOMException && error_14.name === 'NotAllowedError') {
                            new obsidian_1.Notice("Microphone access denied. Please grant permission.");
                        }
                        else if (error_14 instanceof DOMException && error_14.name === 'NotFoundError') {
                            new obsidian_1.Notice("Microphone not found. Please ensure it's connected and enabled.");
                        }
                        else {
                            new obsidian_1.Notice("Could not start voice recording.");
                        }
                        this.stopVoiceRecording(false); // Ensure cleanup even if start failed
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    OllamaView.prototype.stopVoiceRecording = function (processAudio) {
        var _a, _b;
        //console.log(`Stopping voice recording. Process audio: ${processAudio}`);
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            // onstop handler will be triggered eventually to process if processAudio is true
            this.mediaRecorder.stop();
        }
        else if (!processAudio && ((_a = this.mediaRecorder) === null || _a === void 0 ? void 0 : _a.state) === 'inactive') {
            // If already stopped and asked not to process, just clean up UI/stream
        }
        // UI Cleanup & Resource Release
        (_b = this.voiceButton) === null || _b === void 0 ? void 0 : _b.classList.remove(CSS_CLASS_RECORDING);
        obsidian_1.setIcon(this.voiceButton, "microphone");
        this.updateInputPlaceholder(this.plugin.settings.modelName);
        this.updateSendButtonState(); // Update button state
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(function (track) { return track.stop(); });
            this.audioStream = null;
            //console.log("Audio stream tracks stopped.");
        }
        this.mediaRecorder = null;
    };
    // --- Thinking Tag Handling ---
    OllamaView.prototype.processThinkingTags = function (content) { /* ... (Implementation from previous responses) ... */ var r = /<think>([\s\S]*?)<\/think>/g; var i = 0; var p = []; var m; while ((m = r.exec(content)) !== null) {
        if (m.index > i)
            p.push(this.markdownToHtml(content.substring(i, m.index)));
        var c = m[1];
        var h = "<div class=\"" + CSS_CLASS_THINKING_BLOCK + "\"><div class=\"" + CSS_CLASS_THINKING_HEADER + "\" data-fold-state=\"folded\"><div class=\"" + CSS_CLASS_THINKING_TOGGLE + "\">\u25BA</div><div class=\"" + CSS_CLASS_THINKING_TITLE + "\">Thinking</div></div><div class=\"" + CSS_CLASS_THINKING_CONTENT + "\" style=\"display: none;\">" + this.markdownToHtml(c) + "</div></div>";
        p.push(h);
        i = r.lastIndex;
    } if (i < content.length)
        p.push(this.markdownToHtml(content.substring(i))); return p.join(""); };
    OllamaView.prototype.markdownToHtml = function (markdown) { var _a, _b; /* ... (Implementation from previous responses) ... */ if (!(markdown === null || markdown === void 0 ? void 0 : markdown.trim()))
        return ""; var d = document.createElement("div"); obsidian_1.MarkdownRenderer.renderMarkdown(markdown, d, (_b = (_a = this.app.workspace.getActiveFile()) === null || _a === void 0 ? void 0 : _a.path) !== null && _b !== void 0 ? _b : "", this); return d.innerHTML; };
    OllamaView.prototype.addThinkingToggleListeners = function (contentEl) {
        var _this = this;
        var h = contentEl.querySelectorAll("." + CSS_CLASS_THINKING_HEADER);
        h.forEach(function (hdr) { _this.registerDomEvent(hdr, "click", function () { var c = hdr.nextElementSibling; var t = hdr.querySelector("." + CSS_CLASS_THINKING_TOGGLE); if (!c || !t)
            return; var f = hdr.getAttribute("data-fold-state") === "folded"; if (f) {
            c.style.display = "block";
            t.textContent = "▼";
            hdr.setAttribute("data-fold-state", "expanded");
        }
        else {
            c.style.display = "none";
            t.textContent = "►";
            hdr.setAttribute("data-fold-state", "folded");
        } }); });
    };
    OllamaView.prototype.decodeHtmlEntities = function (text) { /* ... (Implementation from previous responses) ... */ if (typeof document === 'undefined') {
        return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    } var ta = document.createElement("textarea"); ta.innerHTML = text; return ta.value; };
    OllamaView.prototype.detectThinkingTags = function (content) { /* ... (Implementation from previous responses) ... */ return /<think>[\s\S]*?<\/think>/gi.test(content) ? { hasThinkingTags: true, format: "standard" } : { hasThinkingTags: false, format: "none" }; };
    // --- Message Collapsing ---
    OllamaView.prototype.checkMessageForCollapsing = function (messageEl) {
        var _this = this;
        var c = messageEl.querySelector("." + CSS_CLASS_CONTENT_COLLAPSIBLE);
        var h = this.plugin.settings.maxMessageHeight;
        if (!c || h <= 0)
            return;
        requestAnimationFrame(function () { var b = messageEl.querySelector("." + CSS_CLASS_SHOW_MORE_BUTTON); b === null || b === void 0 ? void 0 : b.remove(); c.style.maxHeight = ''; c.classList.remove(CSS_CLASS_CONTENT_COLLAPSED); var sh = c.scrollHeight; if (sh > h) {
            c.style.maxHeight = h + "px";
            c.classList.add(CSS_CLASS_CONTENT_COLLAPSED);
            var smb_1 = messageEl.createEl('button', { cls: CSS_CLASS_SHOW_MORE_BUTTON, text: 'Show More ▼' });
            _this.registerDomEvent(smb_1, 'click', function () { return _this.toggleMessageCollapse(c, smb_1); });
        } });
    };
    OllamaView.prototype.checkAllMessagesForCollapsing = function () {
        var _this = this;
        var _a;
        (_a = this.chatContainer) === null || _a === void 0 ? void 0 : _a.querySelectorAll("." + CSS_CLASS_MESSAGE).forEach(function (msgEl) { _this.checkMessageForCollapsing(msgEl); });
    };
    OllamaView.prototype.toggleMessageCollapse = function (contentEl, buttonEl) { /* ... (Implementation from previous responses) ... */ var i = contentEl.classList.contains(CSS_CLASS_CONTENT_COLLAPSED); var h = this.plugin.settings.maxMessageHeight; if (i) {
        contentEl.style.maxHeight = '';
        contentEl.classList.remove(CSS_CLASS_CONTENT_COLLAPSED);
        buttonEl.setText('Show Less ▲');
    }
    else {
        contentEl.style.maxHeight = h + "px";
        contentEl.classList.add(CSS_CLASS_CONTENT_COLLAPSED);
        buttonEl.setText('Show More ▼');
    } };
    // --- Helpers & Utilities ---
    OllamaView.prototype.getChatContainer = function () { return this.chatContainer; };
    OllamaView.prototype.clearChatContainerInternal = function () {
        // Clears the visual display area and resets related state
        this.currentMessages = [];
        this.lastRenderedMessageDate = null;
        if (this.chatContainer)
            this.chatContainer.empty();
        this.hideEmptyState(); // Ensure empty state is managed correctly
    };
    OllamaView.prototype.clearDisplayAndState = function () {
        var _this = this;
        // Public method to completely clear the view
        this.clearChatContainerInternal();
        this.showEmptyState();
        this.updateSendButtonState();
        setTimeout(function () { return _this.focusInput(); }, 50); // Refocus after clear
        //console.log("[OllamaView] Display and internal state cleared.");
    };
    OllamaView.prototype.addLoadingIndicator = function () {
        // Adds the visual "thinking" dots indicator
        this.hideEmptyState();
        var group = this.chatContainer.createDiv({ cls: CSS_CLASS_MESSAGE_GROUP + " " + CSS_CLASS_OLLAMA_GROUP });
        this.renderAvatar(group, false); // Render AI avatar
        var message = group.createDiv({ cls: CSS_CLASS_MESSAGE + " " + CSS_CLASS_OLLAMA_MESSAGE });
        var dots = message.createDiv({ cls: CSS_CLASS_THINKING_DOTS });
        for (var i = 0; i < 3; i++)
            dots.createDiv({ cls: CSS_CLASS_THINKING_DOT });
        this.guaranteedScrollToBottom(50, true); // Scroll to show it
        return group; // Return the group element containing the indicator
    };
    OllamaView.prototype.removeLoadingIndicator = function (loadingEl) {
        // Removes the loading indicator element
        if (loadingEl === null || loadingEl === void 0 ? void 0 : loadingEl.parentNode) {
            loadingEl.remove();
        }
    };
    OllamaView.prototype.scrollToBottom = function () { this.guaranteedScrollToBottom(50, true); };
    OllamaView.prototype.clearInputField = function () { if (this.inputEl) {
        this.inputEl.value = "";
        this.inputEl.dispatchEvent(new Event('input'));
    } }; // Trigger resize/button update
    OllamaView.prototype.focusInput = function () {
        var _this = this;
        setTimeout(function () { var _a; (_a = _this.inputEl) === null || _a === void 0 ? void 0 : _a.focus(); }, 0);
    }; // Use setTimeout to ensure focus happens after potential UI updates
    /** Guarantees scroll to bottom after a delay, respecting user scroll position unless forced */
    OllamaView.prototype.guaranteedScrollToBottom = function (delay, forceScroll) {
        var _this = this;
        if (delay === void 0) { delay = 50; }
        if (forceScroll === void 0) { forceScroll = false; }
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = null;
        }
        this.scrollTimeout = setTimeout(function () {
            requestAnimationFrame(function () {
                var _a, _b;
                if (_this.chatContainer) {
                    var threshold = 100; // Threshold to consider "scrolled up"
                    var isScrolledUp = _this.chatContainer.scrollHeight - _this.chatContainer.scrollTop - _this.chatContainer.clientHeight > threshold;
                    // Update userScrolledUp state if it changed
                    if (isScrolledUp !== _this.userScrolledUp) {
                        _this.userScrolledUp = isScrolledUp;
                        // Hide indicator immediately if user scrolls down manually
                        if (!isScrolledUp)
                            (_a = _this.newMessagesIndicatorEl) === null || _a === void 0 ? void 0 : _a.classList.remove(CSS_CLASS_VISIBLE);
                    }
                    // Scroll if forced, or if user is not scrolled up, or if AI is processing
                    if (forceScroll || !_this.userScrolledUp || _this.isProcessing) {
                        // Use smooth scrolling for a better UX unless processing (instant scroll better then)
                        var behavior = _this.isProcessing ? 'auto' : 'smooth';
                        _this.chatContainer.scrollTo({ top: _this.chatContainer.scrollHeight, behavior: behavior });
                        // If we force scroll, assume user is now at bottom
                        if (forceScroll) {
                            _this.userScrolledUp = false;
                            (_b = _this.newMessagesIndicatorEl) === null || _b === void 0 ? void 0 : _b.classList.remove(CSS_CLASS_VISIBLE);
                        }
                    }
                }
                else {
                    //console.warn("[OllamaView] guaranteedScrollToBottom: chatContainer not found.");
                }
            });
            _this.scrollTimeout = null;
        }, delay);
    };
    // Formatting Helpers
    OllamaView.prototype.formatTime = function (date) { return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }; // Use locale default time format
    OllamaView.prototype.formatDateSeparator = function (date) {
        var now = new Date();
        var yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (this.isSameDay(date, now))
            return "Today";
        else if (this.isSameDay(date, yesterday))
            return "Yesterday";
        else
            return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); // Locale default full date
    };
    OllamaView.prototype.formatRelativeDate = function (date) {
        var now = new Date();
        var diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
        var diffDays = Math.floor(diffSeconds / (60 * 60 * 24));
        if (diffDays === 0) {
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
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); // e.g., Apr 4
        }
    };
    OllamaView.prototype.isSameDay = function (date1, date2) { return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate(); };
    // /** Sets the loading state for the UI (disables/enables input elements) */
    // public setLoadingState(isLoading: boolean): void {
    //   this.isProcessing = isLoading;
    //   if (this.inputEl) this.inputEl.disabled = isLoading;
    //   this.updateSendButtonState(); // Send button depends on both text and processing state
    //   if (this.voiceButton) { this.voiceButton.disabled = isLoading; this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); }
    //   if (this.translateInputButton) { this.translateInputButton.disabled = isLoading; this.translateInputButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); }
    //   if (this.menuButton) { this.menuButton.disabled = isLoading; this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); }
    // }
    // Formatting function used by export
    OllamaView.prototype.formatChatToMarkdown = function (messagesToFormat) {
        var _this = this;
        var localLastDate = null;
        var exportTimestamp = new Date();
        var markdown = "# Ollama Chat Export\n" +
            ("> Exported on: " + exportTimestamp.toLocaleString(undefined) + "\n\n"); // Use locale default date/time
        messagesToFormat.forEach(function (message) {
            if (localLastDate === null || !_this.isSameDay(localLastDate, message.timestamp)) {
                if (localLastDate !== null)
                    markdown += "***\n"; // Separator between days
                markdown += "**" + _this.formatDateSeparator(message.timestamp) + "**\n***\n\n";
            }
            localLastDate = message.timestamp;
            var time = _this.formatTime(message.timestamp);
            var prefix = "";
            var contentPrefix = "";
            switch (message.role) {
                case 'user':
                    prefix = "**User (" + time + "):**\n";
                    break;
                case 'assistant':
                    prefix = "**Assistant (" + time + "):**\n";
                    break;
                case 'system':
                    prefix = "> _[System (" + time + ")]_ \n> ";
                    contentPrefix = "> ";
                    break; // Quote block
                case 'error':
                    prefix = "> [!ERROR] Error (" + time + "):\n> ";
                    contentPrefix = "> ";
                    break; // Admonition block
            }
            markdown += prefix;
            var content = message.content.trim();
            if (contentPrefix) {
                markdown += content.split('\n').join("\n" + contentPrefix) + "\n\n"; // Add prefix to each line
            }
            else if (content.includes('```')) {
                // Ensure blank lines around code blocks for proper rendering
                content = content.replace(/(\n*)```/g, "\n\n```").replace(/```(\n*)/g, "```\n\n");
                markdown += content.trim() + "\n\n";
            }
            else {
                markdown += content + "\n\n";
            }
        });
        return markdown.trim();
    };
    OllamaView.prototype.getCurrentRoleDisplayName = function () {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, Promise, function () {
            var activeChat, rolePath_1, allRoles, foundRole, error_15;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _e.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, ((_a = this.plugin.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 1:
                        activeChat = _e.sent();
                        rolePath_1 = (_c = (_b = activeChat === null || activeChat === void 0 ? void 0 : activeChat.metadata) === null || _b === void 0 ? void 0 : _b.selectedRolePath) !== null && _c !== void 0 ? _c : this.plugin.settings.selectedRolePath;
                        if (!rolePath_1) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.plugin.listRoleFiles(true)];
                    case 2:
                        allRoles = _e.sent();
                        foundRole = allRoles.find(function (role) { return role.path === rolePath_1; });
                        if (foundRole) {
                            return [2 /*return*/, foundRole.name]; // Повертаємо знайдене ім'я
                        }
                        else {
                            console.warn("Role with path \"" + rolePath_1 + "\" not found in listRoleFiles results.");
                            // Якщо шлях є, але роль не знайдена (наприклад, файл видалено), повертаємо заглушку
                            return [2 /*return*/, ((_d = rolePath_1.split('/').pop()) === null || _d === void 0 ? void 0 : _d.replace('.md', '')) || "Selected Role"]; // Спробуємо отримати ім'я з шляху
                        }
                        _e.label = 3;
                    case 3: return [3 /*break*/, 5];
                    case 4:
                        error_15 = _e.sent();
                        console.error("Error getting current role display name:", error_15);
                        return [3 /*break*/, 5];
                    case 5: 
                    // Повертаємо стандартне ім'я, якщо роль не вибрана або сталася помилка
                    return [2 /*return*/, "None"];
                }
            });
        });
    };
    return OllamaView;
}(obsidian_1.ItemView)); // END OF OllamaView CLASS
exports.OllamaView = OllamaView;
