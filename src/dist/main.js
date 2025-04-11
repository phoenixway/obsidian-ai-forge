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
// --- ВИПРАВЛЕНО: Імпортуємо правильну константу ---
var OllamaView_1 = require("./OllamaView");
// -------------------------------------------------
var settings_1 = require("./settings");
var ragService_1 = require("./ragService");
var OllamaService_1 = require("./OllamaService"); // Перейменований ApiService
var PromptService_1 = require("./PromptService");
var ChatManager_1 = require("./ChatManager"); // Новий клас
var child_process_1 = require("child_process");
var path = require("path");
var TranslationService_1 = require("./TranslationService"); // <-- Import new service
var PromptModal_1 = require("./PromptModal");
var ConfirmModal_1 = require("./ConfirmModal");
// --- КОНСТАНТИ ДЛЯ ЗБЕРЕЖЕННЯ ---
var SESSIONS_INDEX_KEY = 'chatSessionsIndex_v1';
var ACTIVE_SESSION_ID_KEY = 'activeChatSessionId_v1';
// RoleInfo вже імпортовано
// Використовуємо той самий клас, що й у вашому коді
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
        // --- Логіка файлу завдань ---
        _this.dailyTaskFilePath = null;
        _this.taskFileContentCache = null;
        _this.taskFileNeedsUpdate = false; // Прапорець про оновлення
        // --- RAG data (приклад) ---
        // Можливо, ці дані мають зберігатися в RagService?
        _this.documents = [];
        _this.embeddings = [];
        _this.handleTaskFileModify = function (file) {
            if (_this.settings.enableProductivityFeatures && file.path === _this.dailyTaskFilePath) {
                console.log("[Plugin] Detected modification in task file: " + file.path);
                _this.taskFileNeedsUpdate = true;
            }
        };
        return _this;
    }
    // ------------------------
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
    // --- Гетер для прапорця оновлення файлу завдань ---
    OllamaPlugin.prototype.isTaskFileUpdated = function () {
        return this.taskFileNeedsUpdate;
    };
    OllamaPlugin.prototype.onload = function () {
        return __awaiter(this, void 0, void 0, function () {
            var debouncedRoleClear, fileChangeHandler, handleModify, handleDelete, handleRename, handleCreate;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("Loading Ollama Personas Plugin..."); // Оновлено назву
                        return [4 /*yield*/, this.loadSettings()];
                    case 1:
                        _a.sent();
                        // Ініціалізація сервісів
                        this.ollamaService = new OllamaService_1.OllamaService(this);
                        this.translationService = new TranslationService_1.TranslationService(this);
                        this.promptService = new PromptService_1.PromptService(this);
                        this.ragService = new ragService_1.RagService(this);
                        this.chatManager = new ChatManager_1.ChatManager(this);
                        return [4 /*yield*/, this.chatManager.initialize()];
                    case 2:
                        _a.sent();
                        // --- Реєстрація View ---
                        // !!! ВИПРАВЛЕНО: Використовуємо правильний ID типу View !!!
                        this.registerView(OllamaView_1.VIEW_TYPE_OLLAMA_PERSONAS, function (leaf) {
                            console.log("OllamaPersonasPlugin: Registering view.");
                            _this.view = new OllamaView_1.OllamaView(leaf, _this);
                            return _this.view;
                        });
                        // ----------------------
                        // Обробник помилок з'єднання
                        this.ollamaService.on('connection-error', function (error) { console.error("[OllamaPlugin] Connection error event:", error); _this.emit('ollama-connection-error', error.message); if (!_this.view) {
                            new obsidian_1.Notice("Failed to connect to Ollama: " + error.message);
                        } });
                        // --- Реєстрація обробників подій плагіна ---
                        this.register(this.on('ollama-connection-error', function (message) { var _a, _b; (_b = (_a = _this.view) === null || _a === void 0 ? void 0 : _a.addMessageToDisplay) === null || _b === void 0 ? void 0 : _b.call(_a, 'error', message, new Date()); }));
                        this.register(this.on('active-chat-changed', this.handleActiveChatChangedLocally.bind(this)));
                        this.register(this.on('chat-list-updated', function () { console.log("[OllamaPlugin] Event 'chat-list-updated' received."); }));
                        this.register(this.on('settings-updated', function () {
                            var _a;
                            console.log("[OllamaPlugin] Event 'settings-updated' received.");
                            // Оновлюємо шлях до файлу завдань при зміні налаштувань
                            _this.updateDailyTaskFilePath();
                            _this.loadAndProcessInitialTasks(); // Перезавантажуємо завдання
                            // Оновлення конфігурації сервісу Ollama (URL, тощо)
                            _this.updateOllamaServiceConfig();
                            // Очистка кешів, пов'язаних з ролями
                            _this.roleListCache = null;
                            (_a = _this.promptService) === null || _a === void 0 ? void 0 : _a.clearRoleCache();
                            _this.emit('roles-updated'); // Повідомляємо View про можливу зміну списку ролей
                        }));
                        // -----------------------------------------
                        // --- Ribbon & Commands ---
                        this.addRibbonIcon("message-square", "Open Ollama Personas Chat", function () { _this.activateView(); }); // Оновлено назву
                        // !!! ВИПРАВЛЕНО: ID команд краще зробити відносними до плагіна !!!
                        this.addCommand({ id: "open-chat-view", name: "Open Ollama Personas Chat", callback: function () { _this.activateView(); } });
                        this.addCommand({ id: "index-rag-documents", name: "Ollama: Index documents for RAG", callback: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.ragService.indexDocuments()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); } });
                        this.addCommand({ id: "clear-active-chat-history", name: "Ollama: Clear Active Chat History", callback: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.clearMessageHistory()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); } }); // Викликаємо локальний метод
                        this.addCommand({ id: "refresh-roles", name: "Ollama: Refresh Roles List", callback: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.listRoleFiles(true)];
                                    case 1:
                                        _a.sent();
                                        this.emit('roles-updated');
                                        new obsidian_1.Notice("Role list refreshed.");
                                        return [2 /*return*/];
                                }
                            }); }); } });
                        this.addCommand({ id: "new-chat", name: "Ollama: New Chat", callback: function () { return __awaiter(_this, void 0, void 0, function () { var newChat; return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.chatManager.createNewChat()];
                                    case 1:
                                        newChat = _a.sent();
                                        if (newChat) { /* await this.activateView(); - Не потрібно, setActiveChat активує */
                                            new obsidian_1.Notice("Created new chat: " + newChat.metadata.name);
                                        }
                                        return [2 /*return*/];
                                }
                            }); }); } });
                        this.addCommand({ id: "switch-chat", name: "Ollama: Switch Chat", callback: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.showChatSwitcher()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); } });
                        this.addCommand({ id: "rename-active-chat", name: "Ollama: Rename Active Chat", callback: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.renameActiveChat()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); } });
                        this.addCommand({ id: "delete-active-chat", name: "Ollama: Delete Active Chat", callback: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.deleteActiveChatWithConfirmation()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); } });
                        // --------------------------
                        // Settings Tab
                        this.settingTab = new settings_1.OllamaSettingTab(this.app, this);
                        this.addSettingTab(this.settingTab);
                        // Layout Ready: Індексація RAG при старті
                        this.app.workspace.onLayoutReady(function () { return __awaiter(_this, void 0, void 0, function () {
                            var _this = this;
                            return __generator(this, function (_a) {
                                if (this.settings.ragEnabled) {
                                    setTimeout(function () { var _a; (_a = _this.ragService) === null || _a === void 0 ? void 0 : _a.indexDocuments(); }, 5000);
                                }
                                return [2 /*return*/];
                            });
                        }); });
                        debouncedRoleClear = obsidian_1.debounce(function () {
                            var _a, _b;
                            console.log("[OllamaPlugin] Role change detected, clearing cache & emitting.");
                            _this.roleListCache = null;
                            (_b = (_a = _this.promptService) === null || _a === void 0 ? void 0 : _a.clearRoleCache) === null || _b === void 0 ? void 0 : _b.call(_a); // Очищуємо кеш промпт сервісу
                            _this.emit('roles-updated');
                        }, 1500, true);
                        fileChangeHandler = function (file) {
                            if (!file)
                                return;
                            // handleRoleOrRagFileChange використовує file.path, який є в TAbstractFile
                            _this.handleRoleOrRagFileChange(file.path, debouncedRoleClear);
                        };
                        handleModify = function (file) {
                            // console.log("Modify event:", file.path); // Debug log
                            fileChangeHandler(file); // Передаємо TFile, він сумісний з TAbstractFile
                            _this.handleTaskFileModify(file); // Окремий обробник для файлу завдань
                        };
                        handleDelete = function (file) {
                            var _a;
                            console.log("Delete event:", file.path); // Debug log
                            fileChangeHandler(file); // Передаємо TAbstractFile - тепер це коректно
                            if (file.path === _this.dailyTaskFilePath) {
                                console.log("[Plugin] Task file " + _this.dailyTaskFilePath + " deleted.");
                                _this.dailyTaskFilePath = null;
                                _this.taskFileContentCache = null;
                                _this.taskFileNeedsUpdate = false; // Скидаємо прапорець
                                (_a = _this.chatManager) === null || _a === void 0 ? void 0 : _a.updateTaskState(null); // Повідомляємо менеджеру
                            }
                        };
                        handleRename = function (file, oldPath) {
                            console.log("Rename event:", oldPath, "->", file.path); // Debug log
                            fileChangeHandler(file); // Перевіряємо новий шлях - тепер коректно
                            _this.handleRoleOrRagFileChange(oldPath, debouncedRoleClear); // Перевіряємо старий шлях для ролей/RAG
                            if (oldPath === _this.dailyTaskFilePath) {
                                console.log("[Plugin] Task file potentially renamed from " + oldPath + " to " + file.path);
                                _this.updateDailyTaskFilePath(); // Оновлюємо шлях на основі налаштувань
                                _this.loadAndProcessInitialTasks(); // Перезавантажуємо завдання з новим шляхом (якщо він збігається з налаштуваннями)
                            }
                            else if (file.path === _this.dailyTaskFilePath) {
                                // Якщо якийсь файл перейменували *в* наш файл завдань
                                console.log("[Plugin] A file was renamed to become the task file: " + file.path);
                                _this.taskFileNeedsUpdate = true;
                                _this.checkAndProcessTaskUpdate(); // Одразу обробляємо
                            }
                        };
                        handleCreate = function (file) {
                            console.log("Create event:", file.path); // Debug log
                            fileChangeHandler(file); // Передаємо TAbstractFile - тепер коректно
                            if (file.path === _this.dailyTaskFilePath) {
                                console.log("[Plugin] Task file " + _this.dailyTaskFilePath + " created.");
                                _this.taskFileNeedsUpdate = true;
                                _this.checkAndProcessTaskUpdate();
                            }
                        };
                        // Реєструємо слухачів
                        this.registerEvent(this.app.vault.on("modify", handleModify));
                        this.registerEvent(this.app.vault.on("delete", handleDelete));
                        this.registerEvent(this.app.vault.on("rename", handleRename));
                        this.registerEvent(this.app.vault.on("create", handleCreate));
                        // ------------------------
                        // Завантаження початкових завдань (перенесено вище, після ініціалізації chatManager)
                        this.updateDailyTaskFilePath();
                        return [4 /*yield*/, this.loadAndProcessInitialTasks()];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // --- Логіка файлу завдань (залишається в main.ts) ---
    OllamaPlugin.prototype.updateDailyTaskFilePath = function () {
        var _a, _b;
        var folderPath = (_a = this.settings.ragFolderPath) === null || _a === void 0 ? void 0 : _a.trim();
        var fileName = (_b = this.settings.dailyTaskFileName) === null || _b === void 0 ? void 0 : _b.trim();
        var newPath = (folderPath && fileName) ? obsidian_1.normalizePath(folderPath + "/" + fileName) : null;
        if (newPath !== this.dailyTaskFilePath) {
            console.log("[Plugin] Daily task file path changed to: " + newPath);
            this.dailyTaskFilePath = newPath;
            this.taskFileContentCache = null; // Скидаємо кеш при зміні шляху
            this.taskFileNeedsUpdate = true; // Потрібно перечитати
        }
        else if (!newPath) {
            this.dailyTaskFilePath = null;
            console.log("[Plugin] Daily task file path is not configured.");
        }
    };
    OllamaPlugin.prototype.loadAndProcessInitialTasks = function () {
        var _a, _b, _c, _d, _e;
        return __awaiter(this, void 0, Promise, function () {
            var content, tasks, error_1;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        if (!this.settings.enableProductivityFeatures) {
                            this.taskFileContentCache = null;
                            (_a = this.chatManager) === null || _a === void 0 ? void 0 : _a.updateTaskState(null);
                            this.taskFileNeedsUpdate = false;
                            return [2 /*return*/];
                        }
                        if (!this.dailyTaskFilePath) {
                            this.taskFileContentCache = null;
                            (_b = this.chatManager) === null || _b === void 0 ? void 0 : _b.updateTaskState(null);
                            this.taskFileNeedsUpdate = false;
                            return [2 /*return*/];
                        } // Скидаємо прапорець, якщо шляху немає
                        _f.label = 1;
                    case 1:
                        _f.trys.push([1, 6, , 7]);
                        return [4 /*yield*/, this.app.vault.adapter.exists(this.dailyTaskFilePath)];
                    case 2:
                        if (!_f.sent()) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.app.vault.adapter.read(this.dailyTaskFilePath)];
                    case 3:
                        content = _f.sent();
                        if (content !== this.taskFileContentCache) {
                            console.log("[Plugin] Loading and processing tasks from " + this.dailyTaskFilePath);
                            this.taskFileContentCache = content;
                            tasks = this.parseTasks(content);
                            (_c = this.chatManager) === null || _c === void 0 ? void 0 : _c.updateTaskState(tasks);
                            this.taskFileNeedsUpdate = false; // Скидаємо прапорець ПІСЛЯ успішної обробки
                        }
                        else {
                            this.taskFileNeedsUpdate = false; // Якщо контент не змінився, прапорець теж скидаємо
                            // console.log(`[Plugin] Task file content unchanged.`);
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        console.log("[Plugin] Task file " + this.dailyTaskFilePath + " not found.");
                        this.taskFileContentCache = null;
                        (_d = this.chatManager) === null || _d === void 0 ? void 0 : _d.updateTaskState(null);
                        this.taskFileNeedsUpdate = false;
                        _f.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_1 = _f.sent();
                        console.error("[Plugin] Error loading/processing task file " + this.dailyTaskFilePath + ":", error_1);
                        this.taskFileContentCache = null;
                        (_e = this.chatManager) === null || _e === void 0 ? void 0 : _e.updateTaskState(null);
                        this.taskFileNeedsUpdate = false;
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    OllamaPlugin.prototype.parseTasks = function (content) {
        // ... (код парсингу без змін) ...
        var lines = content.split('\n');
        var urgent = [];
        var regular = [];
        var hasContent = false;
        for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
            var line = lines_1[_i];
            var trimmedLine = line.trim();
            if (!trimmedLine)
                continue;
            hasContent = true;
            if (trimmedLine.startsWith('!') || trimmedLine.toLowerCase().includes('[urgent]')) {
                urgent.push(trimmedLine.replace(/^!/, '').replace(/\[urgent\]/i, '').trim());
            }
            else if (trimmedLine.startsWith('- [ ]') || trimmedLine.startsWith('- [x]')) {
                regular.push(trimmedLine.substring(trimmedLine.indexOf(']') + 1).trim());
            }
            else {
                regular.push(trimmedLine);
            }
        }
        return { urgent: urgent, regular: regular, hasContent: hasContent };
    };
    OllamaPlugin.prototype.checkAndProcessTaskUpdate = function () {
        return __awaiter(this, void 0, Promise, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.taskFileNeedsUpdate) return [3 /*break*/, 2];
                        console.log("[Plugin] checkAndProcessTaskUpdate: taskFileNeedsUpdate is true, reloading...");
                        return [4 /*yield*/, this.loadAndProcessInitialTasks()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    // --- Кінець логіки файлу завдань ---
    // Обробник змін для ролей та RAG
    OllamaPlugin.prototype.handleRoleOrRagFileChange = function (changedPath, debouncedRoleClear) {
        var normPath = obsidian_1.normalizePath(changedPath);
        // Перевірка для ролей
        var userRolesPath = this.settings.userRolesFolderPath ? obsidian_1.normalizePath(this.settings.userRolesFolderPath) : null;
        var defaultRolesPath = obsidian_1.normalizePath(this.manifest.dir + '/roles'); // Вбудовані ролі (якщо є)
        if (normPath.toLowerCase().endsWith('.md')) {
            if ((userRolesPath && normPath.startsWith(userRolesPath + '/')) || normPath.startsWith(defaultRolesPath + '/')) {
                console.log("[Plugin] Role file change detected: " + normPath);
                debouncedRoleClear(); // Очищуємо кеш ролей з дебаунсом
            }
        }
        // Перевірка для RAG
        var ragFolderPath = this.settings.ragFolderPath ? obsidian_1.normalizePath(this.settings.ragFolderPath) : null;
        if (this.settings.ragEnabled && ragFolderPath && normPath.startsWith(ragFolderPath + '/')) {
            console.log("[Plugin] RAG file change detected: " + normPath);
            this.debounceIndexUpdate(); // Запускаємо індексацію RAG з дебаунсом
        }
    };
    OllamaPlugin.prototype.onunload = function () {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function () {
            var lastActiveId, error_2;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        console.log("Unloading Ollama Personas Plugin...");
                        // --- ВИПРАВЛЕНО: Використання нового ID ---
                        this.app.workspace.getLeavesOfType(OllamaView_1.VIEW_TYPE_OLLAMA_PERSONAS).forEach(function (l) { return l.detach(); });
                        // ------------------------------------
                        if (this.indexUpdateTimeout)
                            clearTimeout(this.indexUpdateTimeout);
                        if (this.roleCacheClearTimeout)
                            clearTimeout(this.roleCacheClearTimeout);
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 6, , 7]);
                        if (!(this.chatManager && this.settings.saveMessageHistory)) return [3 /*break*/, 5];
                        lastActiveId = this.chatManager.getActiveChatId();
                        if (!(lastActiveId !== undefined && lastActiveId !== null)) return [3 /*break*/, 3];
                        console.log("[OllamaPlugin] Saving activeChatId (" + lastActiveId + ") on unload.");
                        return [4 /*yield*/, this.saveDataKey(ACTIVE_SESSION_ID_KEY, lastActiveId)];
                    case 2:
                        _e.sent(); // Додано await
                        return [3 /*break*/, 5];
                    case 3:
                        console.log("[OllamaPlugin] No active chat ID found to save on unload.");
                        return [4 /*yield*/, this.saveDataKey(ACTIVE_SESSION_ID_KEY, null)];
                    case 4:
                        _e.sent(); // Додано await
                        _e.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_2 = _e.sent();
                        console.error("[OllamaPlugin] Error saving active chat ID on unload:", error_2);
                        return [3 /*break*/, 7];
                    case 7:
                        // ----------------------------------
                        (_b = (_a = this.promptService) === null || _a === void 0 ? void 0 : _a.clearModelDetailsCache) === null || _b === void 0 ? void 0 : _b.call(_a);
                        (_d = (_c = this.promptService) === null || _c === void 0 ? void 0 : _c.clearRoleCache) === null || _d === void 0 ? void 0 : _d.call(_c);
                        this.roleListCache = null;
                        console.log("Ollama Personas Plugin unloaded.");
                        return [2 /*return*/];
                }
            });
        });
    };
    OllamaPlugin.prototype.updateOllamaServiceConfig = function () {
        var _a;
        if (this.ollamaService) {
            console.log("[OllamaPlugin] Settings changed, potentially updating Ollama service config and clearing model cache.");
            // Можна передати нові налаштування в ollamaService, якщо потрібно (наприклад, URL)
            (_a = this.promptService) === null || _a === void 0 ? void 0 : _a.clearModelDetailsCache(); // Очищаємо кеш моделей
        }
    };
    OllamaPlugin.prototype.debounceIndexUpdate = function () {
        var _this = this;
        if (this.indexUpdateTimeout)
            clearTimeout(this.indexUpdateTimeout);
        this.indexUpdateTimeout = setTimeout(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[OllamaPlugin] Debounced RAG index update starting...");
                        if (!(this.settings.ragEnabled && this.ragService)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.ragService.indexDocuments()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        this.indexUpdateTimeout = null;
                        return [2 /*return*/];
                }
            });
        }); }, 30000); // 30 секунд
    };
    OllamaPlugin.prototype.activateView = function () {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var e, l, s, v;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        e = this.app.workspace;
                        l = null;
                        s = e.getLeavesOfType(OllamaView_1.VIEW_TYPE_OLLAMA_PERSONAS);
                        if (!(s.length > 0)) return [3 /*break*/, 1];
                        l = s[0];
                        return [3 /*break*/, 3];
                    case 1:
                        l = (_a = e.getRightLeaf(false)) !== null && _a !== void 0 ? _a : e.getLeaf(true);
                        if (!l) return [3 /*break*/, 3];
                        // --- ВИПРАВЛЕНО: Використання нового ID ---
                        return [4 /*yield*/, l.setViewState({ type: OllamaView_1.VIEW_TYPE_OLLAMA_PERSONAS, active: true })];
                    case 2:
                        // --- ВИПРАВЛЕНО: Використання нового ID ---
                        _b.sent();
                        _b.label = 3;
                    case 3:
                        if (l) {
                            e.revealLeaf(l);
                            v = l.view;
                            if (v instanceof OllamaView_1.OllamaView) {
                                this.view = v;
                                console.log("Ollama Personas View activated/revealed.");
                            }
                            else {
                                console.error("Activated view is not an instance of OllamaView?");
                            }
                        }
                        else {
                            console.error("Failed to create or find leaf for Ollama Personas View.");
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    OllamaPlugin.prototype.loadSettings = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _a = this;
                        _c = (_b = Object).assign;
                        _d = [{}, settings_1.DEFAULT_SETTINGS];
                        return [4 /*yield*/, this.loadData()];
                    case 1:
                        _a.settings = _c.apply(_b, _d.concat([_e.sent()]));
                        return [2 /*return*/];
                }
            });
        });
    };
    OllamaPlugin.prototype.saveSettings = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: 
                    // Видаляємо застарілі поля перед збереженням, якщо вони ще існують
                    // delete (this.settings as any).customRoleFilePath;
                    // delete (this.settings as any).useDefaultRoleDefinition;
                    return [4 /*yield*/, this.saveData(this.settings)];
                    case 1:
                        // Видаляємо застарілі поля перед збереженням, якщо вони ще існують
                        // delete (this.settings as any).customRoleFilePath;
                        // delete (this.settings as any).useDefaultRoleDefinition;
                        _a.sent();
                        // Не викликаємо updateOllamaServiceConfig тут, бо він викликається через подію 'settings-updated'
                        console.log("OllamaPlugin: Settings saved.");
                        this.emit('settings-updated'); // Повідомляємо інші частини плагіна про зміну налаштувань
                        return [2 /*return*/];
                }
            });
        });
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
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[OllamaPlugin] Clearing active chat via ChatManager.");
                        if (!this.chatManager) return [3 /*break*/, 2];
                        // Можливо, тут теж варто додати підтвердження?
                        // Або залишити це на рівні View/Command
                        return [4 /*yield*/, this.chatManager.clearActiveChatMessages()];
                    case 1:
                        // Можливо, тут теж варто додати підтвердження?
                        // Або залишити це на рівні View/Command
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        console.error("ChatManager not ready when clearMessageHistory called.");
                        new obsidian_1.Notice("Error: Chat Manager not ready.");
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // List Role Files Method
    /**
       * Отримує список доступних ролей, включаючи вбудовану роль "Productivity Assistant".
       * @param forceRefresh Якщо true, кеш буде проігноровано і список буде зчитано з файлів.
       * @returns Масив об'єктів RoleInfo.
       */
    OllamaPlugin.prototype.listRoleFiles = function (forceRefresh) {
        var _a;
        if (forceRefresh === void 0) { forceRefresh = false; }
        return __awaiter(this, void 0, Promise, function () {
            var roles, addedNamesLowerCase, adapter, pluginDir, builtInRoleName, builtInRoleFileName, builtInRolePath, stat, error_3, userRolesFolderPath, _b, listResult, _i, _c, filePath, fileName, roleName, e_1;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (this.roleListCache && !forceRefresh) {
                            console.log("[OllamaPlugin] Returning cached roles.");
                            return [2 /*return*/, this.roleListCache];
                        }
                        console.log("[OllamaPlugin] Fetching roles (including built-in)...");
                        roles = [];
                        addedNamesLowerCase = new Set();
                        adapter = this.app.vault.adapter;
                        pluginDir = this.manifest.dir;
                        builtInRoleName = "Productivity Assistant";
                        builtInRoleFileName = "Productivity_Assistant.md";
                        builtInRolePath = obsidian_1.normalizePath(pluginDir + "/roles/" + builtInRoleFileName);
                        console.log("[OllamaPlugin] Checking for built-in role at: " + builtInRolePath);
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 6, , 7]);
                        return [4 /*yield*/, adapter.exists(builtInRolePath)];
                    case 2:
                        if (!_d.sent()) return [3 /*break*/, 4];
                        return [4 /*yield*/, adapter.stat(builtInRolePath)];
                    case 3:
                        stat = _d.sent();
                        if ((stat === null || stat === void 0 ? void 0 : stat.type) === 'file') {
                            console.log("[OllamaPlugin] Found built-in role: " + builtInRoleName);
                            // Додаємо першою або просто до загального списку
                            roles.push({
                                name: builtInRoleName,
                                path: builtInRolePath,
                                isCustom: false
                            });
                            addedNamesLowerCase.add(builtInRoleName.toLowerCase());
                        }
                        else {
                            console.warn("[OllamaPlugin] Built-in role path exists but is not a file: " + builtInRolePath);
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        console.warn("[OllamaPlugin] Built-in role file NOT FOUND at: " + builtInRolePath + ". Productivity features might rely on it.");
                        _d.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_3 = _d.sent();
                        console.error("[OllamaPlugin] Error checking/adding built-in role at " + builtInRolePath + ":", error_3);
                        return [3 /*break*/, 7];
                    case 7:
                        userRolesFolderPath = this.settings.userRolesFolderPath ? obsidian_1.normalizePath(this.settings.userRolesFolderPath) : null;
                        if (!userRolesFolderPath) return [3 /*break*/, 16];
                        console.log("[OllamaPlugin] Processing user roles from: " + userRolesFolderPath);
                        _d.label = 8;
                    case 8:
                        _d.trys.push([8, 15, , 16]);
                        return [4 /*yield*/, adapter.exists(userRolesFolderPath)];
                    case 9:
                        _b = (_d.sent());
                        if (!_b) return [3 /*break*/, 11];
                        return [4 /*yield*/, adapter.stat(userRolesFolderPath)];
                    case 10:
                        _b = ((_a = (_d.sent())) === null || _a === void 0 ? void 0 : _a.type) === 'folder';
                        _d.label = 11;
                    case 11:
                        if (!_b) return [3 /*break*/, 13];
                        return [4 /*yield*/, adapter.list(userRolesFolderPath)];
                    case 12:
                        listResult = _d.sent();
                        for (_i = 0, _c = listResult.files; _i < _c.length; _i++) {
                            filePath = _c[_i];
                            // Обробляємо лише .md файли безпосередньо в цій папці
                            if (filePath.toLowerCase().endsWith('.md') &&
                                (userRolesFolderPath === '/' || filePath.split('/').length === userRolesFolderPath.split('/').length + 1) &&
                                filePath !== builtInRolePath) { // Не додаємо вбудовану роль ще раз, якщо папки співпали
                                fileName = path.basename(filePath);
                                roleName = fileName.substring(0, fileName.length - 3);
                                // Додаємо, тільки якщо ім'я унікальне (регістронезалежно)
                                if (!addedNamesLowerCase.has(roleName.toLowerCase())) {
                                    console.log("[OllamaPlugin] Adding user role: " + roleName);
                                    roles.push({ name: roleName, path: filePath, isCustom: true });
                                    addedNamesLowerCase.add(roleName.toLowerCase());
                                }
                                else {
                                    console.warn("[OllamaPlugin] Skipping user role \"" + roleName + "\" from \"" + userRolesFolderPath + "\" due to name conflict.");
                                }
                            }
                        }
                        return [3 /*break*/, 14];
                    case 13:
                        if (userRolesFolderPath !== "/") { // Не виводимо попередження для кореневої папки
                            console.warn("[OllamaPlugin] User roles path not found or not a folder: " + userRolesFolderPath);
                            // Можливо, варто повідомити користувача через Notice?
                        }
                        _d.label = 14;
                    case 14: return [3 /*break*/, 16];
                    case 15:
                        e_1 = _d.sent();
                        console.error("Error listing user roles in " + userRolesFolderPath + ":", e_1);
                        return [3 /*break*/, 16];
                    case 16:
                        // --- Кінець Користувацьких Ролей ---
                        // --- 3. Додаємо Інші Стандартні Ролі (Якщо є папка roles/ крім файлу Productivity_Assistant) ---
                        // const defaultRolesPath = normalizePath(pluginDir + '/roles');
                        // // ... (схожа логіка обробки папки, як для userRolesPath, перевіряючи addedNamesLowerCase) ...
                        // --- Кінець Інших Стандартних Ролей ---
                        // --- 4. Сортування та Кешування ---
                        roles.sort(function (a, b) {
                            // Можна зробити, щоб вбудована роль була завжди першою
                            // if (a.name === builtInRoleName) return -1;
                            // if (b.name === builtInRoleName) return 1;
                            return a.name.localeCompare(b.name); // Або просто сортуємо за алфавітом
                        });
                        this.roleListCache = roles;
                        console.log("[OllamaPlugin] Found total " + roles.length + " roles (including built-in if present).");
                        return [2 /*return*/, roles];
                }
            });
        });
    };
    // Execute System Command Method
    OllamaPlugin.prototype.executeSystemCommand = function (command) {
        var _a;
        return __awaiter(this, void 0, Promise, function () {
            return __generator(this, function (_b) {
                console.log("Executing: " + command);
                if (!(command === null || command === void 0 ? void 0 : command.trim())) {
                    return [2 /*return*/, { stdout: "", stderr: "Empty cmd.", error: new Error("Empty cmd") }];
                }
                //@ts-ignore process is available in Obsidian desktop
                if (typeof process === 'undefined' || !((_a = process === null || process === void 0 ? void 0 : process.versions) === null || _a === void 0 ? void 0 : _a.node)) {
                    console.error("Node.js environment not available. Cannot execute system command.");
                    new obsidian_1.Notice("Cannot execute system command.");
                    return [2 /*return*/, { stdout: "", stderr: "Node.js required.", error: new Error("Node.js required") }];
                }
                return [2 /*return*/, new Promise(function (resolve) {
                        child_process_1.exec(command, function (error, stdout, stderr) {
                            if (error)
                                console.error("Exec error for \"" + command + "\": " + error);
                            if (stderr)
                                console.error("Exec stderr for \"" + command + "\": " + stderr);
                            if (stdout)
                                console.log("Exec stdout for \"" + command + "\": " + stdout);
                            resolve({ stdout: stdout.toString(), stderr: stderr.toString(), error: error });
                        });
                    })];
            });
        });
    };
    // --- Session Management Command Helpers ---
    // Ці методи зараз не використовуються View, але можуть бути корисними для команд
    OllamaPlugin.prototype.showChatSwitcher = function () {
        return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_a) {
            new obsidian_1.Notice("Switch Chat UI not implemented yet.");
            return [2 /*return*/];
        }); });
    };
    OllamaPlugin.prototype.renameActiveChat = function () {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var activeChat, currentName;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, ((_a = this.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 1:
                        activeChat = _b.sent();
                        if (!activeChat) {
                            new obsidian_1.Notice("No active chat.");
                            return [2 /*return*/];
                        }
                        currentName = activeChat.metadata.name;
                        // Використовуємо PromptModal замість prompt
                        new PromptModal_1.PromptModal(this.app, 'Rename Chat', "Enter new name for \"" + currentName + "\":", currentName, function (newName) { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!(newName && newName.trim() !== "" && newName.trim() !== currentName)) return [3 /*break*/, 2];
                                        return [4 /*yield*/, this.chatManager.renameChat(activeChat.metadata.id, newName.trim())];
                                    case 1:
                                        _a.sent();
                                        return [3 /*break*/, 3];
                                    case 2:
                                        if (newName !== null) {
                                            new obsidian_1.Notice("Rename cancelled or name unchanged.");
                                        }
                                        _a.label = 3;
                                    case 3: return [2 /*return*/];
                                }
                            });
                        }); }).open();
                        return [2 /*return*/];
                }
            });
        });
    };
    OllamaPlugin.prototype.deleteActiveChatWithConfirmation = function () {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var activeChat, chatName;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, ((_a = this.chatManager) === null || _a === void 0 ? void 0 : _a.getActiveChat())];
                    case 1:
                        activeChat = _b.sent();
                        if (!activeChat) {
                            new obsidian_1.Notice("No active chat.");
                            return [2 /*return*/];
                        }
                        chatName = activeChat.metadata.name;
                        // Використовуємо ConfirmModal замість confirm
                        new ConfirmModal_1.ConfirmModal(this.app, 'Delete Chat', "Delete chat \"" + chatName + "\"? This cannot be undone.", function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.chatManager.deleteChat(activeChat.metadata.id)];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); }).open();
                        return [2 /*return*/];
                }
            });
        });
    };
    // Обробник зміни активного чату (локальний)
    OllamaPlugin.prototype.handleActiveChatChangedLocally = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Можна використовувати для логування або специфічних дій в main.ts, якщо потрібно
                console.log("[OllamaPlugin] Handled 'active-chat-changed' locally. New active ID: " + data.chatId + ". View will update itself.");
                return [2 /*return*/];
            });
        });
    };
    // Допоміжний метод для пошуку імені ролі за шляхом
    OllamaPlugin.prototype.findRoleNameByPath = function (rolePath) {
        var _a;
        if (!rolePath)
            return "Default Assistant"; // Назва для випадку без ролі
        // Спочатку шукаємо в кеші
        var cachedRole = (_a = this.roleListCache) === null || _a === void 0 ? void 0 : _a.find(function (rl) { return rl.path === rolePath; });
        if (cachedRole)
            return cachedRole.name;
        // Якщо в кеші немає (мало б бути після listRoleFiles), спробуємо отримати з імені файлу
        try {
            return path.basename(rolePath, '.md');
        }
        catch (e) {
            console.warn("[OllamaPlugin] Could not determine role name for path: " + rolePath, e);
            return "Unknown Role"; // Запасний варіант
        }
    };
    return OllamaPlugin;
}(obsidian_1.Plugin)); // END OF OllamaPlugin CLASS
exports["default"] = OllamaPlugin;
