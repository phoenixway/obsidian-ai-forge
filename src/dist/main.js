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
exports.__esModule = true;
// main.ts
var obsidian_1 = require("obsidian");
var OllamaView_1 = require("./OllamaView");
var settings_1 = require("./settings");
var ragService_1 = require("./ragService");
var OllamaService_1 = require("./OllamaService"); // Перейменований ApiService
var PromptService_1 = require("./PromptService");
var ChatManager_1 = require("./ChatManager"); // Новий клас
var child_process_1 = require("child_process");
var path = require("path");
var TranslationService_1 = require("./TranslationService"); // <-- Import new service
// --- КОНСТАНТИ ДЛЯ ЗБЕРЕЖЕННЯ ---
var SESSIONS_INDEX_KEY = 'chatSessionsIndex_v1';
var ACTIVE_SESSION_ID_KEY = 'activeChatSessionId_v1';
// RoleInfo вже імпортовано або визначено в ChatManager
var OllamaPlugin = /** @class */ (function (_super) {
    __extends(OllamaPlugin, _super);
    function OllamaPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.view = null;
        // Події та кеш
        _this.eventHandlers = {};
        _this.roleListCache = null;
        _this.roleCacheClearTimeout = null;
        _this.indexUpdateTimeout = null;
        _this.dailyTaskFilePath = null; // Зберігаємо повний шлях
        _this.taskFileContentCache = null; // Кеш вмісту
        _this.taskFileNeedsUpdate = false; // Прапорець про оновлення
        // RAG data (приклад)
        _this.documents = [];
        _this.embeddings = [];
        // Обробник зміни файлу
        _this.handleTaskFileModify = function (file) {
            if (file.path === _this.dailyTaskFilePath) {
                console.log("[Plugin] Detected modification in task file: " + file.path);
                // Не читаємо файл тут одразу, щоб уникнути зайвих читань під час збереження.
                // Просто встановлюємо прапорець, що файл потребує оновлення.
                _this.taskFileNeedsUpdate = true;
                // Можна одразу викликати читання з debounce, якщо потрібно швидше реагувати
                // this.debouncedLoadAndProcessTasks();
            }
        };
        return _this;
    }
    // --- Event Emitter Methods ---
    OllamaPlugin.prototype.on = function (event, callback) {
        var _this = this;
        if (!this.eventHandlers[event])
            this.eventHandlers[event] = [];
        this.eventHandlers[event].push(callback);
        return function () { var _a, _b; _this.eventHandlers[event] = (_a = _this.eventHandlers[event]) === null || _a === void 0 ? void 0 : _a.filter(function (h) { return h !== callback; }); if (((_b = _this.eventHandlers[event]) === null || _b === void 0 ? void 0 : _b.length) === 0) {
            delete _this.eventHandlers[event];
        } };
    };
    OllamaPlugin.prototype.emit = function (event, data) { var h = this.eventHandlers[event]; if (h)
        h.slice().forEach(function (handler) { try {
            handler(data);
        }
        catch (e) {
            console.error("[OllamaPlugin] Error in event handler for " + event + ":", e);
        } }); };
    OllamaPlugin.prototype.onload = function () {
        return __awaiter(this, void 0, void 0, function () {
            var debouncedRoleClear, fileChangeHandler, handleModify, handleDelete, handleRename, handleCreate;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("Loading Ollama Plugin (MVC Arch)...");
                        return [4 /*yield*/, this.loadSettings()];
                    case 1:
                        _a.sent();
                        // Ініціалізація (порядок може бути важливим)
                        this.ollamaService = new OllamaService_1.OllamaService(this);
                        this.promptService = new PromptService_1.PromptService(this);
                        this.ragService = new ragService_1.RagService(this);
                        this.chatManager = new ChatManager_1.ChatManager(this); // Ініціалізуємо ChatManager
                        this.translationService = new TranslationService_1.TranslationService(this); // <-- Instantiate service
                        return [4 /*yield*/, this.chatManager.initialize()];
                    case 2:
                        _a.sent(); // ChatManager завантажує індекс та активний ID
                        // Реєстрація View
                        this.registerView(OllamaView_1.VIEW_TYPE_OLLAMA, function (leaf) { console.log("OllamaPlugin: Registering view."); _this.view = new OllamaView_1.OllamaView(leaf, _this); /* Removed setOllamaViewRef */ /* Removed setOllamaViewRef */ return _this.view; });
                        // Обробник помилок з'єднання (з OllamaService)
                        this.ollamaService.on('connection-error', function (error) { console.error("[OllamaPlugin] Connection error event:", error); _this.emit('ollama-connection-error', error.message); if (!_this.view) {
                            new obsidian_1.Notice("Failed to connect to Ollama: " + error.message);
                        } });
                        // --- Реєстрація обробників подій ---
                        this.register(this.on('ollama-connection-error', function (message) { var _a, _b; (_b = (_a = _this.view) === null || _a === void 0 ? void 0 : _a.addMessageToDisplay) === null || _b === void 0 ? void 0 : _b.call(_a, 'error', message, new Date()); }));
                        this.register(this.on('active-chat-changed', this.handleActiveChatChangedLocally.bind(this))); // ADD .bind(this)
                        // Видалено непотрібні проміжні обробники, View слухає напряму
                        this.register(this.on('chat-list-updated', function () {
                            console.log("[OllamaPlugin] Event 'chat-list-updated' received.");
                            // Немає потреби викликати методи View звідси.
                            // View оновить своє меню, коли воно буде відкрито наступного разу,
                            // або якщо змінився активний чат (через подію 'active-chat-changed').
                        }));
                        this.register(this.on('settings-updated', function () {
                            console.log("[OllamaPlugin] Event 'settings-updated' received.");
                            // Немає потреби викликати методи View звідси.
                            // View оновить меню при відкритті. Зміна URL/папки ролей обробляється інакше.
                        }));
                        // this.register(this.on('roles-updated', () => { if (this.view?.isMenuOpen()) { this.view?.renderRoleList(); } }));
                        // Ці події обробляються напряму в View
                        // this.register(this.on('model-changed', (modelName) => { this.view?.handleModelChange?.(modelName); }));
                        // this.register(this.on('role-changed', (roleName) => { this.view?.handleRoleChange?.(roleName); }));
                        // this.register(this.on('message-added', (data) => { this.view?.handleMessageAdded?.(data); }));
                        // this.register(this.on('messages-cleared', (chatId) => { this.view?.handleMessagesCleared?.(chatId); }));
                        // Ribbon & Commands
                        this.addRibbonIcon("message-square", "Open Ollama Chat", function () { _this.activateView(); });
                        this.addCommand({ id: "open-ollama-view", name: "Open Ollama Chat", callback: function () { _this.activateView(); } });
                        this.addCommand({ id: "index-rag-documents", name: "Index documents for RAG", callback: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.ragService.indexDocuments()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); } });
                        this.addCommand({ id: "clear-ollama-history", name: "Clear Active Chat History", callback: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.chatManager.clearActiveChatMessages()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); } });
                        this.addCommand({ id: "refresh-ollama-roles", name: "Refresh Ollama Roles List", callback: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.listRoleFiles(true)];
                                    case 1:
                                        _a.sent();
                                        this.emit('roles-updated');
                                        new obsidian_1.Notice("Role list refreshed.");
                                        return [2 /*return*/];
                                }
                            }); }); } });
                        this.addCommand({ id: "ollama-new-chat", name: "Ollama: New Chat", callback: function () { return __awaiter(_this, void 0, void 0, function () { var newChat; return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.chatManager.createNewChat()];
                                    case 1:
                                        newChat = _a.sent();
                                        if (!newChat) return [3 /*break*/, 3];
                                        return [4 /*yield*/, this.activateView()];
                                    case 2:
                                        _a.sent();
                                        new obsidian_1.Notice("Created new chat: " + newChat.metadata.name);
                                        _a.label = 3;
                                    case 3: return [2 /*return*/];
                                }
                            }); }); } });
                        this.addCommand({ id: "ollama-switch-chat", name: "Ollama: Switch Chat", callback: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.showChatSwitcher()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); } }); // Потребує UI
                        this.addCommand({ id: "ollama-rename-chat", name: "Ollama: Rename Active Chat", callback: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.renameActiveChat()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); } });
                        this.addCommand({ id: "ollama-delete-chat", name: "Ollama: Delete Active Chat", callback: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.deleteActiveChatWithConfirmation()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); } });
                        // Settings Tab
                        this.settingTab = new settings_1.OllamaSettingTab(this.app, this);
                        this.addSettingTab(this.settingTab);
                        // Layout Ready
                        this.app.workspace.onLayoutReady(function () { return __awaiter(_this, void 0, void 0, function () {
                            var _this = this;
                            return __generator(this, function (_a) {
                                if (this.settings.ragEnabled) {
                                    setTimeout(function () { var _a; (_a = _this.ragService) === null || _a === void 0 ? void 0 : _a.indexDocuments(); }, 5000);
                                }
                                return [2 /*return*/];
                            });
                        }); });
                        debouncedRoleClear = obsidian_1.debounce(function () { console.log("[Ollama] Role change detected, clearing cache & emitting."); _this.roleListCache = null; _this.emit('roles-updated'); }, 1500, true);
                        fileChangeHandler = function (file) { if (!file)
                            return; _this.handleFileChange(file.path, debouncedRoleClear); };
                        handleModify = function (file) { return fileChangeHandler(file); };
                        handleDelete = function (file) { return fileChangeHandler(file); };
                        handleRename = function (file, oldPath) { fileChangeHandler(file); _this.handleFileChange(oldPath, debouncedRoleClear); };
                        handleCreate = function (file) { return fileChangeHandler(file); };
                        this.registerEvent(this.app.vault.on("modify", handleModify));
                        this.registerEvent(this.app.vault.on("delete", handleDelete));
                        this.registerEvent(this.app.vault.on("rename", handleRename));
                        this.registerEvent(this.app.vault.on("create", handleCreate));
                        this.updateDailyTaskFilePath(); // Встановлюємо шлях при завантаженні
                        return [4 /*yield*/, this.loadAndProcessInitialTasks()];
                    case 3:
                        _a.sent(); // Завантажуємо початкові завдання
                        // Реєструємо спостерігача
                        this.registerEvent(this.app.vault.on('modify', this.handleTaskFileModify));
                        // Також треба оновлювати шлях при зміні налаштувань
                        this.register(this.on('settings-updated', function () {
                            _this.updateDailyTaskFilePath();
                            // Потенційно перезавантажити завдання, якщо шлях змінився
                            _this.loadAndProcessInitialTasks();
                        }));
                        return [2 /*return*/];
                }
            });
        });
    };
    // Оновлює шлях до файлу завдань
    OllamaPlugin.prototype.updateDailyTaskFilePath = function () {
        var _a, _b;
        var folderPath = (_a = this.settings.ragFolderPath) === null || _a === void 0 ? void 0 : _a.trim();
        var fileName = (_b = this.settings.dailyTaskFileName) === null || _b === void 0 ? void 0 : _b.trim();
        if (folderPath && fileName) {
            this.dailyTaskFilePath = obsidian_1.normalizePath("<span class=\"math-inline\">{folderPath}/</span>{fileName}");
            console.log("[Plugin] Daily task file path set to: " + this.dailyTaskFilePath);
        }
        else {
            this.dailyTaskFilePath = null;
            console.log("[Plugin] Daily task file path is not configured.");
        }
    };
    // Завантажує та обробляє завдання (можна викликати при старті та при зміні)
    OllamaPlugin.prototype.loadAndProcessInitialTasks = function () {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function () {
            var content, tasks, error_1;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        if (!this.dailyTaskFilePath) {
                            this.taskFileContentCache = null;
                            // Повідомити ChatManager, що плану немає (якщо він тримає стан)
                            (_a = this.chatManager) === null || _a === void 0 ? void 0 : _a.updateTaskState(null);
                            return [2 /*return*/];
                        }
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 6, , 7]);
                        return [4 /*yield*/, this.app.vault.adapter.exists(this.dailyTaskFilePath)];
                    case 2:
                        if (!_e.sent()) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.app.vault.adapter.read(this.dailyTaskFilePath)];
                    case 3:
                        content = _e.sent();
                        if (content !== this.taskFileContentCache) {
                            console.log("[Plugin] Loading and processing tasks from " + this.dailyTaskFilePath);
                            this.taskFileContentCache = content;
                            tasks = this.parseTasks(content);
                            (_b = this.chatManager) === null || _b === void 0 ? void 0 : _b.updateTaskState(tasks); // Передаємо розпарсені завдання
                            this.taskFileNeedsUpdate = false; // Скидаємо прапорець після обробки
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        console.log("[Plugin] Task file " + this.dailyTaskFilePath + " not found.");
                        this.taskFileContentCache = null;
                        (_c = this.chatManager) === null || _c === void 0 ? void 0 : _c.updateTaskState(null); // Повідомити, що файлу немає
                        _e.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_1 = _e.sent();
                        console.error("[Plugin] Error loading/processing task file " + this.dailyTaskFilePath + ":", error_1);
                        this.taskFileContentCache = null;
                        (_d = this.chatManager) === null || _d === void 0 ? void 0 : _d.updateTaskState(null); // Повідомити про помилку
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    // Функція парсингу завдань (приклад)
    OllamaPlugin.prototype.parseTasks = function (content) {
        var lines = content.split('\n');
        var urgent = [];
        var regular = [];
        var hasContent = false;
        for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
            var line = lines_1[_i];
            var trimmedLine = line.trim();
            if (!trimmedLine)
                continue; // Пропускаємо порожні рядки
            hasContent = true; // Файл не порожній
            // Приклад: шукаємо [Urgent], !, або інший маркер на початку/кінці
            if (trimmedLine.startsWith('!') || trimmedLine.toLowerCase().includes('[urgent]')) {
                // Видаляємо маркер для чистого тексту завдання
                urgent.push(trimmedLine.replace(/^!/, '').replace(/\[urgent\]/i, '').trim());
            }
            else if (trimmedLine.startsWith('- [ ]') || trimmedLine.startsWith('- [x]')) {
                // Обробка Markdown задач
                regular.push(trimmedLine.substring(trimmedLine.indexOf(']') + 1).trim());
            }
            else {
                regular.push(trimmedLine); // Вважаємо звичайним завданням
            }
        }
        return { urgent: urgent, regular: regular, hasContent: hasContent };
    };
    // Метод для перевірки, чи потрібно оновити завдання (викликається перед запитом до LLM)
    OllamaPlugin.prototype.checkAndProcessTaskUpdate = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.taskFileNeedsUpdate) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.loadAndProcessInitialTasks()];
                    case 1:
                        _a.sent(); // Перезавантажуємо і обробляємо
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    // File Change Handler
    OllamaPlugin.prototype.handleFileChange = function (changedPath, debouncedRoleClear) { var normPath = obsidian_1.normalizePath(changedPath); var userR = this.settings.userRolesFolderPath ? obsidian_1.normalizePath(this.settings.userRolesFolderPath) : null; var defaultR = obsidian_1.normalizePath(this.manifest.dir + '/roles'); if (((userR && normPath.startsWith(userR + '/')) || normPath.startsWith(defaultR + '/')) && normPath.toLowerCase().endsWith('.md')) {
        debouncedRoleClear();
    } var ragF = this.settings.ragFolderPath ? obsidian_1.normalizePath(this.settings.ragFolderPath) : null; if (this.settings.ragEnabled && ragF && normPath.startsWith(ragF + '/')) {
        this.debounceIndexUpdate();
    } };
    OllamaPlugin.prototype.onunload = function () { var _a, _b, _c, _d; console.log("Unloading Ollama Plugin..."); this.app.workspace.getLeavesOfType(OllamaView_1.VIEW_TYPE_OLLAMA).forEach(function (l) { return l.detach(); }); if (this.indexUpdateTimeout)
        clearTimeout(this.indexUpdateTimeout); if (this.roleCacheClearTimeout)
        clearTimeout(this.roleCacheClearTimeout); (_b = (_a = this.promptService) === null || _a === void 0 ? void 0 : _a.clearModelDetailsCache) === null || _b === void 0 ? void 0 : _b.call(_a); (_d = (_c = this.promptService) === null || _c === void 0 ? void 0 : _c.clearRoleCache) === null || _d === void 0 ? void 0 : _d.call(_c); this.roleListCache = null; };
    OllamaPlugin.prototype.updateOllamaServiceConfig = function () { var _a; if (this.ollamaService) {
        console.log("[OllamaPlugin] Settings changed, clearing model cache.");
        (_a = this.promptService) === null || _a === void 0 ? void 0 : _a.clearModelDetailsCache();
    } };
    OllamaPlugin.prototype.debounceIndexUpdate = function () {
        var _this = this;
        if (this.indexUpdateTimeout)
            clearTimeout(this.indexUpdateTimeout);
        this.indexUpdateTimeout = setTimeout(function () { var _a; console.log("RAG index update."); (_a = _this.ragService) === null || _a === void 0 ? void 0 : _a.indexDocuments(); _this.indexUpdateTimeout = null; }, 30000);
    };
    OllamaPlugin.prototype.activateView = function () {
        var _a;
        return __awaiter(this, void 0, void 0, function () { var e, l, s, _b, _c, v; return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    e = this.app.workspace;
                    l = null;
                    s = e.getLeavesOfType(OllamaView_1.VIEW_TYPE_OLLAMA);
                    if (!(s.length > 0)) return [3 /*break*/, 1];
                    _b = l = s[0];
                    return [3 /*break*/, 4];
                case 1:
                    l = (_a = e.getRightLeaf(!1)) !== null && _a !== void 0 ? _a : e.getLeaf(!0);
                    _c = l;
                    if (!_c) return [3 /*break*/, 3];
                    return [4 /*yield*/, l.setViewState({ type: OllamaView_1.VIEW_TYPE_OLLAMA, active: !0 })];
                case 2:
                    _c = (_d.sent());
                    _d.label = 3;
                case 3:
                    _b = (_c);
                    _d.label = 4;
                case 4:
                    _b;
                    if (l) {
                        e.revealLeaf(l);
                        v = l.view;
                        if (v instanceof OllamaView_1.OllamaView) {
                            this.view = v;
                            console.log("View activated.");
                        }
                        else {
                            console.error("View not OllamaView?");
                        }
                    }
                    else
                        console.error("Failed leaf create.");
                    return [2 /*return*/];
            }
        }); });
    };
    OllamaPlugin.prototype.loadSettings = function () {
        return __awaiter(this, void 0, void 0, function () { var _a, _b, _c, _d; return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _a = this;
                    _c = (_b = Object).assign;
                    _d = [{}, settings_1.DEFAULT_SETTINGS];
                    return [4 /*yield*/, this.loadData()];
                case 1:
                    _a.settings = _c.apply(_b, _d.concat([_e.sent()]));
                    if (this.settings.customRoleFilePath !== undefined && this.settings.selectedRolePath === undefined) {
                        console.log("[Ollama] Migrating 'customRoleFilePath'->'selectedRolePath'.");
                        this.settings.selectedRolePath = this.settings.customRoleFilePath || "";
                    }
                    delete this.settings.customRoleFilePath;
                    delete this.settings.useDefaultRoleDefinition;
                    return [2 /*return*/];
            }
        }); });
    };
    OllamaPlugin.prototype.saveSettings = function () {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    delete this.settings.customRoleFilePath;
                    delete this.settings.useDefaultRoleDefinition;
                    return [4 /*yield*/, this.saveData(this.settings)];
                case 1:
                    _c.sent();
                    this.updateOllamaServiceConfig();
                    this.roleListCache = null;
                    (_b = (_a = this.promptService) === null || _a === void 0 ? void 0 : _a.clearRoleCache) === null || _b === void 0 ? void 0 : _b.call(_a);
                    console.log("OllamaPlugin: Settings saved.");
                    this.emit('settings-updated');
                    return [2 /*return*/];
            }
        }); });
    };
    // Data Helpers
    OllamaPlugin.prototype.saveDataKey = function (key, value) {
        return __awaiter(this, void 0, Promise, function () { var d; return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, this.loadData()];
                case 1:
                    d = (_a.sent()) || {};
                    d[key] = value;
                    return [4 /*yield*/, this.saveData(d)];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        }); });
    };
    OllamaPlugin.prototype.loadDataKey = function (key) {
        return __awaiter(this, void 0, Promise, function () { var d; return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, this.loadData()];
                case 1:
                    d = (_a.sent()) || {};
                    return [2 /*return*/, d[key]];
            }
        }); });
    };
    // History Persistence (Delegated)
    OllamaPlugin.prototype.clearMessageHistory = function () {
        return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("[OllamaPlugin] Clearing active chat via ChatManager.");
                    if (!this.chatManager) return [3 /*break*/, 2];
                    return [4 /*yield*/, this.chatManager.clearActiveChatMessages()];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    console.error("ChatManager not ready.");
                    new obsidian_1.Notice("Error: Chat Manager not ready.");
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        }); });
    };
    // List Role Files Method
    OllamaPlugin.prototype.listRoleFiles = function (forceRefresh) {
        var _a, _b, _c;
        if (forceRefresh === void 0) { forceRefresh = false; }
        return __awaiter(this, void 0, Promise, function () { var r, a, d, _d, f, _i, _e, p, fn, n, e_1, u, nd, _f, f, names, _g, _h, p, fn, n, e_2; return __generator(this, function (_j) {
            switch (_j.label) {
                case 0:
                    if (this.roleListCache && !forceRefresh)
                        return [2 /*return*/, this.roleListCache];
                    console.log("[Ollama] Fetching roles...");
                    r = [];
                    a = this.app.vault.adapter;
                    d = obsidian_1.normalizePath(this.manifest.dir + '/roles');
                    _j.label = 1;
                case 1:
                    _j.trys.push([1, 7, , 8]);
                    return [4 /*yield*/, a.exists(d)];
                case 2:
                    _d = (_j.sent());
                    if (!_d) return [3 /*break*/, 4];
                    return [4 /*yield*/, a.stat(d)];
                case 3:
                    _d = ((_a = (_j.sent())) === null || _a === void 0 ? void 0 : _a.type) === 'folder';
                    _j.label = 4;
                case 4:
                    if (!_d) return [3 /*break*/, 6];
                    return [4 /*yield*/, a.list(d)];
                case 5:
                    f = _j.sent();
                    for (_i = 0, _e = f.files; _i < _e.length; _i++) {
                        p = _e[_i];
                        if (p.toLowerCase().endsWith('.md')) {
                            fn = path.basename(p);
                            n = fn.substring(0, fn.length - 3);
                            r.push({ name: n, path: p, isCustom: false });
                        }
                    }
                    _j.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    e_1 = _j.sent();
                    console.error("Err list default roles:", e_1);
                    return [3 /*break*/, 8];
                case 8:
                    u = (_b = this.settings.userRolesFolderPath) === null || _b === void 0 ? void 0 : _b.trim();
                    if (!u) return [3 /*break*/, 16];
                    nd = obsidian_1.normalizePath(u);
                    _j.label = 9;
                case 9:
                    _j.trys.push([9, 15, , 16]);
                    return [4 /*yield*/, a.exists(nd)];
                case 10:
                    _f = (_j.sent());
                    if (!_f) return [3 /*break*/, 12];
                    return [4 /*yield*/, a.stat(nd)];
                case 11:
                    _f = ((_c = (_j.sent())) === null || _c === void 0 ? void 0 : _c.type) === 'folder';
                    _j.label = 12;
                case 12:
                    if (!_f) return [3 /*break*/, 14];
                    return [4 /*yield*/, a.list(nd)];
                case 13:
                    f = _j.sent();
                    names = new Set(r.map(function (x) { return x.name; }));
                    for (_g = 0, _h = f.files; _g < _h.length; _g++) {
                        p = _h[_g];
                        if (p.toLowerCase().endsWith('.md')) {
                            fn = path.basename(p);
                            n = fn.substring(0, fn.length - 3);
                            if (!names.has(n)) {
                                r.push({ name: n, path: p, isCustom: true });
                                names.add(n);
                            }
                        }
                    }
                    _j.label = 14;
                case 14: return [3 /*break*/, 16];
                case 15:
                    e_2 = _j.sent();
                    console.error("Err list user roles:", e_2);
                    return [3 /*break*/, 16];
                case 16:
                    r.sort(function (a, b) { return a.name.localeCompare(b.name); });
                    this.roleListCache = r;
                    console.log("Found " + r.length + " roles.");
                    return [2 /*return*/, r];
            }
        }); });
    };
    // Execute System Command Method
    OllamaPlugin.prototype.executeSystemCommand = function (command) {
        var _a;
        return __awaiter(this, void 0, Promise, function () {
            return __generator(this, function (_b) {
                console.log("Executing: " + command);
                if (!(command === null || command === void 0 ? void 0 : command.trim())) {
                    return [2 /*return*/, { stdout: "", stderr: "Empty cmd.", error: new Error("Empty cmd") }];
                } //@ts-ignore
                if (typeof process === 'undefined' || !((_a = process === null || process === void 0 ? void 0 : process.versions) === null || _a === void 0 ? void 0 : _a.node)) {
                    console.error("Node.js required.");
                    new obsidian_1.Notice("Cannot exec.");
                    return [2 /*return*/, { stdout: "", stderr: "Node.js required.", error: new Error("Node.js required") }];
                }
                return [2 /*return*/, new Promise(function (r) { child_process_1.exec(command, function (e, o, s) { if (e)
                        console.error("Exec error: " + e); if (s)
                        console.error("Exec stderr: " + s); if (o)
                        console.log("Exec stdout: " + o); r({ stdout: o.toString(), stderr: s.toString(), error: e }); }); })];
            });
        });
    };
    // --- Session Management Command Helpers ---
    OllamaPlugin.prototype.showChatSwitcher = function () {
        return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_a) {
            new obsidian_1.Notice("Switch Chat UI not implemented.");
            return [2 /*return*/];
        }); });
    };
    OllamaPlugin.prototype.renameActiveChat = function () {
        var _a;
        return __awaiter(this, void 0, void 0, function () { var c, o, n; return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, ((_a = this.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                case 1:
                    c = _b.sent();
                    if (!c) {
                        new obsidian_1.Notice("No active chat.");
                        return [2 /*return*/];
                    }
                    o = c.metadata.name;
                    n = prompt("Enter new name for \"" + o + "\":", o);
                    if (!(n && n.trim() !== "" && n !== o)) return [3 /*break*/, 3];
                    return [4 /*yield*/, this.chatManager.renameChat(c.metadata.id, n)];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3: return [2 /*return*/];
            }
        }); });
    };
    OllamaPlugin.prototype.deleteActiveChatWithConfirmation = function () {
        var _a;
        return __awaiter(this, void 0, void 0, function () { var c; return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, ((_a = this.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                case 1:
                    c = _b.sent();
                    if (!c) {
                        new obsidian_1.Notice("No active chat.");
                        return [2 /*return*/];
                    }
                    if (!confirm("Delete chat \"" + c.metadata.name + "\"?")) return [3 /*break*/, 3];
                    return [4 /*yield*/, this.chatManager.deleteChat(c.metadata.id)];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3: return [2 /*return*/];
            }
        }); });
    };
    OllamaPlugin.prototype.handleActiveChatChangedLocally = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Цей обробник тепер *не потрібен*, оскільки логіка оновлення
                // глобальних налаштувань та системного промпту перенесена в setActiveSession.
                // Подія 'active-chat-changed' тепер слугує лише сигналом для UI (якщо потрібно).
                console.log("[OllamaPlugin] Event 'active-chat-changed' handled. ID: " + data.chatId + ". Settings/Prompt updated within setActiveSession.");
                return [2 /*return*/];
            });
        });
    };
    // --- КІНЕЦЬ ЗМІН ---
    // Helper to find role name (без змін)
    OllamaPlugin.prototype.findRoleNameByPath = function (rolePath) { var _a; if (!rolePath)
        return "Default Assistant"; var r = (_a = this.roleListCache) === null || _a === void 0 ? void 0 : _a.find(function (rl) { return rl.path === rolePath; }); if (r)
        return r.name; try {
        return path.basename(rolePath, '.md');
    }
    catch (_b) {
        return "Unknown Role";
    } };
    return OllamaPlugin;
}(obsidian_1.Plugin)); //
exports["default"] = OllamaPlugin;
