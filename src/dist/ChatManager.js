"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.ChatManager = void 0;
// ChatManager.ts
var obsidian_1 = require("obsidian");
var Chat_1 = require("./Chat");
var path = require("path"); // Додаємо імпорт path
// Ключі для зберігання даних плагіна
var SESSIONS_INDEX_KEY = 'chatSessionsIndex_v1'; // Key for storing index in plugin data
var ACTIVE_SESSION_ID_KEY = 'activeChatSessionId_v1'; // Key for storing active ID
var ChatManager = /** @class */ (function () {
    function ChatManager(plugin) {
        this.chatsFolderPath = "/"; // Шлях до папки чатів В СХОВИЩІ
        this.sessionIndex = {}; // In-memory index of available chats {id: metadata}
        this.activeChatId = null;
        this.loadedChats = {}; // Cache for loaded Chat objects
        this.filePlanExists = false; // Стан файлу плану
        this.fileUrgentTasks = []; // Термінові завдання з файлу
        this.fileRegularTasks = []; // Звичайні завдання з файлу
        this.plugin = plugin;
        this.app = plugin.app;
        this.adapter = plugin.app.vault.adapter;
        this.updateChatsFolderPath();
        console.log("[ChatManager] Initialized. Base path set to: " + this.chatsFolderPath);
    }
    /**
     * Оновлює внутрішній шлях `chatsFolderPath` на основі поточних налаштувань плагіна.
     */
    ChatManager.prototype.updateChatsFolderPath = function () {
        var _a;
        var settingsPath = (_a = this.plugin.settings.chatHistoryFolderPath) === null || _a === void 0 ? void 0 : _a.trim();
        this.chatsFolderPath = (settingsPath) ? obsidian_1.normalizePath(settingsPath) : "/";
        console.log("[ChatManager] Updated chatsFolderPath to: " + this.chatsFolderPath);
    };
    /** Оновлює стан завдань на основі даних, отриманих з плагіна. */
    ChatManager.prototype.updateTaskState = function (tasks) {
        if (tasks) {
            this.filePlanExists = tasks.hasContent;
            this.fileUrgentTasks = __spreadArrays(tasks.urgent);
            this.fileRegularTasks = __spreadArrays(tasks.regular);
            console.log("[ChatManager] Updated task state. Plan exists: " + this.filePlanExists + ", Urgent: " + this.fileUrgentTasks.length + ", Regular: " + this.fileRegularTasks.length);
        }
        else {
            this.filePlanExists = false;
            this.fileUrgentTasks = [];
            this.fileRegularTasks = [];
            console.log("[ChatManager] Cleared task state.");
        }
    };
    /**
     * Ініціалізує ChatManager: оновлює шлях, перевіряє папку, завантажує індекс та активний ID.
     */
    ChatManager.prototype.initialize = function () {
        return __awaiter(this, void 0, Promise, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log("[ChatManager] Initializing...");
                        this.updateChatsFolderPath();
                        return [4 /*yield*/, this.ensureChatsFolderExists()];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, this.loadChatIndex(true)];
                    case 2:
                        _b.sent(); // Примусове сканування файлів при старті
                        _a = this;
                        return [4 /*yield*/, this.plugin.loadDataKey(ACTIVE_SESSION_ID_KEY)];
                    case 3:
                        _a.activeChatId = (_b.sent()) || null;
                        console.log("[ChatManager] Loaded activeChatId from store: " + this.activeChatId);
                        if (!(this.activeChatId && !this.sessionIndex[this.activeChatId])) return [3 /*break*/, 5];
                        console.warn("[ChatManager] Active chat ID " + this.activeChatId + " not found in the refreshed index. Resetting.");
                        this.activeChatId = null;
                        return [4 /*yield*/, this.plugin.saveDataKey(ACTIVE_SESSION_ID_KEY, null)];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        if (this.activeChatId) {
                            console.log("[ChatManager] Active chat ID " + this.activeChatId + " confirmed in the refreshed index.");
                        }
                        _b.label = 6;
                    case 6:
                        console.log("[ChatManager] Initialized. Index has " + Object.keys(this.sessionIndex).length + " entries. Final Active ID: " + this.activeChatId);
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Гарантує існування папки для історії чатів.
     */
    ChatManager.prototype.ensureChatsFolderExists = function () {
        return __awaiter(this, void 0, Promise, function () {
            var stat, errorMsg, error_1, errorMsg;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.chatsFolderPath === "/" || !this.chatsFolderPath) {
                            return [2 /*return*/];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        return [4 /*yield*/, this.adapter.exists(this.chatsFolderPath)];
                    case 2:
                        if (!!(_a.sent())) return [3 /*break*/, 4];
                        console.log("[ChatManager] Creating chat history directory: " + this.chatsFolderPath);
                        return [4 /*yield*/, this.adapter.mkdir(this.chatsFolderPath)];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, this.adapter.stat(this.chatsFolderPath)];
                    case 5:
                        stat = _a.sent();
                        if ((stat === null || stat === void 0 ? void 0 : stat.type) !== 'folder') {
                            errorMsg = "Error: Configured chat history path '" + this.chatsFolderPath + "' exists but is not a folder.";
                            console.error("[ChatManager] " + errorMsg);
                            new obsidian_1.Notice(errorMsg);
                        }
                        _a.label = 6;
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        error_1 = _a.sent();
                        errorMsg = "Error creating/checking chat history directory '" + this.chatsFolderPath + "'.";
                        console.error("[ChatManager] " + errorMsg, error_1);
                        new obsidian_1.Notice(errorMsg);
                        return [3 /*break*/, 8];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Завантажує або оновлює індекс чатів, скануючи файли у папці історії.
     * @param forceScanFromFile Завжди true для пересканування.
     */
    ChatManager.prototype.loadChatIndex = function (forceScanFromFile) {
        var _a;
        if (forceScanFromFile === void 0) { forceScanFromFile = true; }
        return __awaiter(this, void 0, Promise, function () {
            var loadedIndex, newIndex, filesScanned, chatsLoaded, listResult, chatFiles, _i, chatFiles_1, filePath, fullPath, fileName, chatId, jsonContent, data, metadata, e_1, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!!forceScanFromFile) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.plugin.loadDataKey(SESSIONS_INDEX_KEY)];
                    case 1:
                        loadedIndex = _b.sent();
                        this.sessionIndex = loadedIndex || {};
                        console.log("[ChatManager] Loaded chat index from plugin data with " + Object.keys(this.sessionIndex).length + " entries.");
                        return [2 /*return*/];
                    case 2:
                        console.log("[ChatManager] Rebuilding chat index by scanning files in: " + this.chatsFolderPath);
                        newIndex = {};
                        filesScanned = 0;
                        chatsLoaded = 0;
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 15, , 17]);
                        return [4 /*yield*/, this.adapter.exists(this.chatsFolderPath)];
                    case 4:
                        if (!(!(_b.sent()) && this.chatsFolderPath !== "/")) return [3 /*break*/, 6];
                        console.warn("[ChatManager] Chat history folder '" + this.chatsFolderPath + "' not found. Index is empty.");
                        this.sessionIndex = {};
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 5:
                        _b.sent();
                        return [2 /*return*/];
                    case 6: return [4 /*yield*/, this.adapter.list(this.chatsFolderPath)];
                    case 7:
                        listResult = _b.sent();
                        chatFiles = listResult.files.filter(function (filePath) {
                            return filePath.toLowerCase().endsWith('.json');
                        } // Тільки .json
                        );
                        filesScanned = chatFiles.length;
                        console.log("[ChatManager] Found " + filesScanned + " potential chat files.");
                        _i = 0, chatFiles_1 = chatFiles;
                        _b.label = 8;
                    case 8:
                        if (!(_i < chatFiles_1.length)) return [3 /*break*/, 13];
                        filePath = chatFiles_1[_i];
                        fullPath = obsidian_1.normalizePath(filePath);
                        fileName = path.basename(fullPath);
                        chatId = fileName.endsWith('.json') ? fileName.slice(0, -5) : null;
                        if (!chatId) {
                            console.warn("[ChatManager] Could not extract chat ID from file path: " + fullPath);
                            return [3 /*break*/, 12];
                        }
                        _b.label = 9;
                    case 9:
                        _b.trys.push([9, 11, , 12]);
                        return [4 /*yield*/, this.adapter.read(fullPath)];
                    case 10:
                        jsonContent = _b.sent();
                        data = JSON.parse(jsonContent);
                        if (((_a = data === null || data === void 0 ? void 0 : data.metadata) === null || _a === void 0 ? void 0 : _a.id) && data.metadata.id === chatId) {
                            metadata = data.metadata;
                            newIndex[chatId] = {
                                name: metadata.name,
                                modelName: metadata.modelName,
                                selectedRolePath: metadata.selectedRolePath,
                                temperature: metadata.temperature,
                                createdAt: metadata.createdAt,
                                lastModified: metadata.lastModified
                            };
                            chatsLoaded++;
                        }
                        else {
                            console.warn("[ChatManager] Metadata validation FAILED for file: " + fullPath + ". ID mismatch or missing metadata. ChatID from filename: " + chatId, data === null || data === void 0 ? void 0 : data.metadata);
                        }
                        return [3 /*break*/, 12];
                    case 11:
                        e_1 = _b.sent();
                        console.error("[ChatManager] Error reading or parsing chat file " + fullPath + ":", e_1);
                        return [3 /*break*/, 12];
                    case 12:
                        _i++;
                        return [3 /*break*/, 8];
                    case 13:
                        console.log("[ChatManager] Index rebuild complete. Scanned: " + filesScanned + ", Loaded metadata for: " + chatsLoaded);
                        this.sessionIndex = newIndex;
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 14:
                        _b.sent();
                        return [3 /*break*/, 17];
                    case 15:
                        error_2 = _b.sent();
                        console.error("[ChatManager] Critical error during index rebuild:", error_2);
                        this.sessionIndex = {};
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 16:
                        _b.sent();
                        new obsidian_1.Notice("Error rebuilding chat index.");
                        return [3 /*break*/, 17];
                    case 17: return [2 /*return*/];
                }
            });
        });
    };
    /** Зберігає поточний індекс чатів у сховище плагіна. */
    ChatManager.prototype.saveChatIndex = function () {
        return __awaiter(this, void 0, Promise, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[ChatManager] Saving chat index with " + Object.keys(this.sessionIndex).length + " entries.");
                        return [4 /*yield*/, this.plugin.saveDataKey(SESSIONS_INDEX_KEY, this.sessionIndex)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Генерує повний шлях до файлу чату. */
    ChatManager.prototype.getChatFilePath = function (id) {
        var fileName = id + ".json";
        return (this.chatsFolderPath === "/" || !this.chatsFolderPath)
            ? obsidian_1.normalizePath(fileName)
            : obsidian_1.normalizePath(this.chatsFolderPath + "/" + fileName);
    };
    /** Зберігає дані вказаного чату у файл. */
    ChatManager.prototype.saveChat = function (chat) {
        return __awaiter(this, void 0, Promise, function () {
            var filePath, dataToSave, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        filePath = this.getChatFilePath(chat.metadata.id);
                        // Оновлюємо дату модифікації перед збереженням
                        chat.metadata.lastModified = new Date().toISOString();
                        dataToSave = {
                            metadata: chat.metadata,
                            messages: chat.getMessages()
                        };
                        return [4 /*yield*/, this.adapter.write(filePath, JSON.stringify(dataToSave, null, 2))];
                    case 1:
                        _a.sent();
                        console.log("[ChatManager] Saved chat " + chat.metadata.id + " to " + filePath);
                        // Оновлюємо індекс після збереження файлу
                        this.sessionIndex[chat.metadata.id] = __assign({}, chat.metadata);
                        delete this.sessionIndex[chat.metadata.id].id;
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 2:
                        _a.sent();
                        // Повідомляємо про оновлення списку (змінилася дата модифікації)
                        this.plugin.emit('chat-list-updated');
                        return [2 /*return*/, true];
                    case 3:
                        error_3 = _a.sent();
                        console.error("[ChatManager] Error saving chat " + chat.metadata.id + " to " + chat.filePath + ":", error_3);
                        new obsidian_1.Notice("Error saving chat: " + chat.metadata.name);
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /** Створює новий чат. */
    ChatManager.prototype.createNewChat = function (name) {
        return __awaiter(this, void 0, Promise, function () {
            var now, newId, filePath, initialMetadata, constructorSettings, newChat, saved, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[ChatManager] Creating new chat...");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        now = new Date();
                        newId = "chat_" + now.getTime() + "_" + Math.random().toString(36).substring(2, 8);
                        filePath = this.getChatFilePath(newId);
                        initialMetadata = {
                            id: newId,
                            name: name || "Chat " + now.toLocaleDateString() + " " + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            modelName: this.plugin.settings.modelName,
                            selectedRolePath: this.plugin.settings.selectedRolePath,
                            temperature: this.plugin.settings.temperature,
                            createdAt: now.toISOString(),
                            lastModified: now.toISOString()
                        };
                        constructorSettings = __assign({}, this.plugin.settings);
                        newChat = new Chat_1.Chat(this.adapter, constructorSettings, { metadata: initialMetadata, messages: [] }, filePath);
                        return [4 /*yield*/, this.saveChat(newChat)];
                    case 2:
                        saved = _a.sent();
                        if (!saved) {
                            throw new Error("Failed to save initial chat file via saveChat.");
                        }
                        this.loadedChats[newChat.metadata.id] = newChat; // Додаємо в кеш
                        return [4 /*yield*/, this.setActiveChat(newChat.metadata.id)];
                    case 3:
                        _a.sent(); // Встановлюємо активним
                        console.log("[ChatManager] Created and activated new chat: " + newChat.metadata.name + " (ID: " + newChat.metadata.id + ")");
                        // Подію 'chat-list-updated' тепер генерує saveChat
                        return [2 /*return*/, newChat];
                    case 4:
                        error_4 = _a.sent();
                        console.error("[ChatManager] Error creating new chat:", error_4);
                        new obsidian_1.Notice("Error creating new chat session.");
                        return [2 /*return*/, null];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /** Повертає масив метаданих всіх доступних чатів, відсортований за датою зміни. */
    ChatManager.prototype.listAvailableChats = function () {
        return Object.entries(this.sessionIndex).map(function (_a) {
            var id = _a[0], meta = _a[1];
            return (__assign({ id: id }, meta));
        }).sort(function (a, b) { return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime(); });
    };
    /** Повертає ID поточного активного чату. */
    ChatManager.prototype.getActiveChatId = function () {
        return this.activeChatId;
    };
    /** Встановлює активний чат за його ID. */
    ChatManager.prototype.setActiveChat = function (id) {
        return __awaiter(this, void 0, Promise, function () {
            var loadedChat;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[ChatManager] Setting active chat to ID: " + id);
                        if (id && !this.sessionIndex[id]) {
                            console.error("[ChatManager] Attempted to set active chat to non-existent ID: " + id + ". Setting to null.");
                            id = null;
                        }
                        if (!(id === this.activeChatId)) return [3 /*break*/, 3];
                        console.log("[ChatManager] Chat " + id + " is already active.");
                        if (!id) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.getChat(id)];
                    case 1:
                        _a.sent(); // Переконуємось, що завантажено
                        _a.label = 2;
                    case 2: // Переконуємось, що завантажено
                    return [2 /*return*/];
                    case 3:
                        this.activeChatId = id;
                        return [4 /*yield*/, this.plugin.saveDataKey(ACTIVE_SESSION_ID_KEY, id)];
                    case 4:
                        _a.sent();
                        console.log("[ChatManager] Persisted active chat ID: " + id);
                        loadedChat = null;
                        if (!id) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.getChat(id)];
                    case 5:
                        loadedChat = _a.sent();
                        if (!!loadedChat) return [3 /*break*/, 7];
                        console.error("[ChatManager] Failed to load chat data for newly activated ID " + id + ". Resetting active chat to null.");
                        return [4 /*yield*/, this.setActiveChat(null)];
                    case 6:
                        _a.sent(); // Рекурсивний виклик для коректного скидання
                        return [2 /*return*/];
                    case 7:
                        console.log("[ChatManager] Emitting 'active-chat-changed' event for ID: " + id);
                        this.plugin.emit('active-chat-changed', { chatId: id, chat: loadedChat });
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Отримує конкретний чат за ID (з кешу або файлу). */
    ChatManager.prototype.getChat = function (id) {
        return __awaiter(this, void 0, Promise, function () {
            var filePath, constructorSettings, chat;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[ChatManager] getChat called for ID: " + id);
                        if (this.loadedChats[id]) {
                            console.log("[ChatManager] Returning chat " + id + " from cache.");
                            return [2 /*return*/, this.loadedChats[id]];
                        }
                        console.log("[ChatManager] Chat " + id + " not in cache.");
                        if (!this.sessionIndex[id]) return [3 /*break*/, 6];
                        filePath = this.getChatFilePath(id);
                        console.log("[ChatManager] Attempting to load chat " + id + " from path: " + filePath);
                        constructorSettings = __assign({}, this.plugin.settings);
                        return [4 /*yield*/, Chat_1.Chat.loadFromFile(filePath, this.adapter, constructorSettings)];
                    case 1:
                        chat = _a.sent();
                        if (!chat) return [3 /*break*/, 2];
                        console.log("[ChatManager] Successfully loaded chat " + id + ". Caching.");
                        this.loadedChats[id] = chat;
                        return [2 /*return*/, chat];
                    case 2:
                        console.error("[ChatManager] Failed to load chat " + id + " from " + filePath + ". Removing from index.");
                        delete this.sessionIndex[id];
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 3:
                        _a.sent();
                        if (!(this.activeChatId === id)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.setActiveChat(null)];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5:
                        this.plugin.emit('chat-list-updated');
                        return [2 /*return*/, null];
                    case 6:
                        console.warn("[ChatManager] Chat with ID " + id + " not found in session index.");
                        return [2 /*return*/, null];
                }
            });
        });
    };
    /** Отримує поточний активний чат (або останній, або створює новий). */
    ChatManager.prototype.getActiveChat = function () {
        return __awaiter(this, void 0, Promise, function () {
            var chat, availableChats, mostRecentId;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[ChatManager] getActiveChat called. Current activeChatId: " + this.activeChatId);
                        if (!this.activeChatId) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.getChat(this.activeChatId)];
                    case 1:
                        chat = _a.sent();
                        if (chat)
                            return [2 /*return*/, chat]; // Повертаємо, якщо вдалося завантажити/знайти в кеші
                        // Якщо getChat повернув null (помилка завантаження), активний ID вже скинуто,
                        // тому переходимо до логіки нижче (вибір останнього або створення нового)
                        console.warn("[ChatManager] Active chat " + this.activeChatId + " failed to load. Finding alternative.");
                        _a.label = 2;
                    case 2:
                        availableChats = this.listAvailableChats();
                        if (!(availableChats.length > 0)) return [3 /*break*/, 4];
                        mostRecentId = availableChats[0].id;
                        console.log("[ChatManager] No active chat set or load failed. Setting most recent as active: ID " + mostRecentId);
                        return [4 /*yield*/, this.setActiveChat(mostRecentId)];
                    case 3:
                        _a.sent();
                        // Потрібно повернути результат setActiveChat (який може бути null, якщо і цей чат не завантажиться)
                        return [2 /*return*/, this.activeChatId ? this.loadedChats[this.activeChatId] : null];
                    case 4:
                        console.log("[ChatManager] No available chats exist. Creating a new one.");
                        return [4 /*yield*/, this.createNewChat()];
                    case 5: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /** Додає повідомлення до активного чату. */
    ChatManager.prototype.addMessageToActiveChat = function (role, content) {
        return __awaiter(this, void 0, Promise, function () {
            var activeChat, newMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getActiveChat()];
                    case 1:
                        activeChat = _a.sent();
                        if (!activeChat) return [3 /*break*/, 3];
                        newMessage = activeChat.addMessage(role, content);
                        console.log("[ChatManager] Added " + role + " message to active chat " + activeChat.metadata.id + ".");
                        // saveChat викликається через debouncedSave в Chat.addMessage,
                        // але нам потрібно оновити індекс (дату модифікації) та викликати подію одразу.
                        this.sessionIndex[activeChat.metadata.id].lastModified = new Date().toISOString();
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 2:
                        _a.sent(); // Зберігаємо індекс
                        this.plugin.emit('message-added', { chatId: activeChat.metadata.id, message: newMessage });
                        this.plugin.emit('chat-list-updated'); // Оновлюємо список чатів через зміну дати
                        return [2 /*return*/, newMessage];
                    case 3:
                        console.error("[ChatManager] Cannot add message, no active chat.");
                        new obsidian_1.Notice("Error: No active chat session to add message to.");
                        return [2 /*return*/, null];
                }
            });
        });
    };
    /** Очищує історію повідомлень активного чату. */
    ChatManager.prototype.clearActiveChatMessages = function () {
        return __awaiter(this, void 0, Promise, function () {
            var activeChat;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getActiveChat()];
                    case 1:
                        activeChat = _a.sent();
                        if (activeChat) {
                            activeChat.clearMessages(); // Цей метод має викликати saveChat
                            console.log("[ChatManager] Messages cleared for active chat: " + activeChat.metadata.id);
                            this.plugin.emit('messages-cleared', activeChat.metadata.id);
                        }
                        else {
                            console.warn("[ChatManager] Cannot clear messages, no active chat.");
                            new obsidian_1.Notice("No active chat to clear.");
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Оновлює метадані активного чату та генерує відповідні події. */
    // ChatManager.ts
    /** Оновлює метадані активного чату та генерує відповідні події. */
    ChatManager.prototype.updateActiveChatMetadata = function (metadataUpdate) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, Promise, function () {
            var activeChat, oldRolePath, oldModelName, saved, newRolePath, newModelName, newRoleName;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0: return [4 /*yield*/, this.getActiveChat()];
                    case 1:
                        activeChat = _e.sent();
                        if (!activeChat) {
                            console.warn("[ChatManager] Cannot update metadata, no active chat.");
                            new obsidian_1.Notice("No active chat to update metadata for.");
                            return [2 /*return*/, false];
                        }
                        console.log("[ChatManager] Updating metadata for active chat " + activeChat.metadata.id + ":", metadataUpdate);
                        oldRolePath = activeChat.metadata.selectedRolePath;
                        oldModelName = activeChat.metadata.modelName;
                        // Застосовуємо оновлення до об'єкта Chat в пам'яті
                        activeChat.updateMetadata(metadataUpdate); // Оновлює і lastModified
                        return [4 /*yield*/, this.saveChat(activeChat)];
                    case 2:
                        saved = _e.sent();
                        if (saved) {
                            newRolePath = activeChat.metadata.selectedRolePath;
                            newModelName = activeChat.metadata.modelName;
                            // --- ГЕНЕРАЦІЯ ПОДІЇ ROLE-CHANGED ---
                            // Перевіряємо, чи поле selectedRolePath БУЛО в об'єкті -> metadataUpdate <-
                            // І чи нове значення відрізняється від старого
                            // --- ВИПРАВЛЕНО: Використовуємо metadataUpdate ---
                            if (metadataUpdate.selectedRolePath !== undefined && oldRolePath !== newRolePath) {
                                try {
                                    newRoleName = this.plugin.findRoleNameByPath(newRolePath);
                                    console.log("[ChatManager] Emitting 'role-changed' event with name: " + newRoleName);
                                    this.plugin.emit('role-changed', newRoleName);
                                    (_b = (_a = this.plugin.promptService) === null || _a === void 0 ? void 0 : _a.clearRoleCache) === null || _b === void 0 ? void 0 : _b.call(_a);
                                }
                                catch (e) {
                                    console.error("[ChatManager] Error finding role name or emitting role-changed event:", e);
                                }
                            }
                            // --- КІНЕЦЬ ВИПРАВЛЕННЯ ---
                            // --- ГЕНЕРАЦІЯ ПОДІЇ MODEL-CHANGED ---
                            // Перевіряємо, чи поле modelName БУЛО в -> metadataUpdate <-
                            // І чи нове значення відрізняється від старого
                            // --- ВИПРАВЛЕНО: Використовуємо metadataUpdate ---
                            if (metadataUpdate.modelName !== undefined && oldModelName !== newModelName) {
                                console.log("[ChatManager] Emitting 'model-changed' event with name: " + newModelName);
                                this.plugin.emit('model-changed', newModelName);
                                (_d = (_c = this.plugin.promptService) === null || _c === void 0 ? void 0 : _c.clearModelDetailsCache) === null || _d === void 0 ? void 0 : _d.call(_c);
                            }
                            // --- КІНЕЦЬ ВИПРАВЛЕННЯ ---
                            // Генеруємо 'active-chat-changed', щоб View оновив усі аспекти
                            this.plugin.emit('active-chat-changed', { chatId: this.activeChatId, chat: activeChat });
                            return [2 /*return*/, true];
                        }
                        else {
                            console.error("[ChatManager] Failed to save chat file after metadata update for " + activeChat.metadata.id + ".");
                            new obsidian_1.Notice("Error saving chat after metadata update.");
                            return [2 /*return*/, false];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // ... (решта коду ChatManager) ...
    /** Видаляє чат за ID. */
    ChatManager.prototype.deleteChat = function (id) {
        return __awaiter(this, void 0, Promise, function () {
            var filePath, deletedFile, error_5, available, nextActiveId;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[ChatManager] Attempting to delete chat ID: " + id);
                        filePath = this.getChatFilePath(id);
                        deletedFile = false;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, , 7]);
                        return [4 /*yield*/, this.adapter.exists(filePath)];
                    case 2:
                        if (!_a.sent()) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.adapter.remove(filePath)];
                    case 3:
                        _a.sent();
                        console.log("[ChatManager] Deleted chat file: " + filePath);
                        return [3 /*break*/, 5];
                    case 4:
                        console.warn("[ChatManager] Chat file not found, assuming already deleted: " + filePath);
                        _a.label = 5;
                    case 5:
                        deletedFile = true; // Вважаємо успішним, якщо файлу немає або його видалено
                        return [3 /*break*/, 7];
                    case 6:
                        error_5 = _a.sent();
                        console.error("[ChatManager] Error deleting chat file " + filePath + ":", error_5);
                        new obsidian_1.Notice("Error deleting chat file for ID " + id + ".");
                        // Незважаючи на помилку видалення файлу, спробуємо видалити з індексу
                        deletedFile = false; // Позначаємо як помилку видалення файлу
                        return [3 /*break*/, 7];
                    case 7:
                        if (!this.sessionIndex[id]) return [3 /*break*/, 11];
                        delete this.sessionIndex[id];
                        delete this.loadedChats[id];
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 8:
                        _a.sent();
                        console.log("[ChatManager] Removed chat " + id + " from index and cache.");
                        if (!(this.activeChatId === id)) return [3 /*break*/, 10];
                        console.log("[ChatManager] Deleted chat was active. Selecting new active chat...");
                        available = this.listAvailableChats();
                        nextActiveId = available.length > 0 ? available[0].id : null;
                        return [4 /*yield*/, this.setActiveChat(nextActiveId)];
                    case 9:
                        _a.sent();
                        _a.label = 10;
                    case 10:
                        this.plugin.emit('chat-list-updated');
                        return [2 /*return*/, true]; // Повертаємо true, бо запис з індексу видалено
                    case 11:
                        console.warn("[ChatManager] Chat " + id + " not found in index while trying to delete.");
                        return [2 /*return*/, deletedFile]; // Повертаємо результат видалення файлу, якщо запису в індексі і не було
                }
            });
        });
    };
    /** Перейменовує чат за ID. */
    ChatManager.prototype.renameChat = function (id, newName) {
        return __awaiter(this, void 0, Promise, function () {
            var trimmedName, chatToRename, saved;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        trimmedName = newName.trim();
                        if (!trimmedName) {
                            new obsidian_1.Notice("Chat name cannot be empty.");
                            return [2 /*return*/, false];
                        }
                        if (!this.sessionIndex[id]) {
                            console.warn("[ChatManager] Cannot rename chat " + id + ": Not found in index.");
                            new obsidian_1.Notice("Chat with ID " + id + " not found.");
                            return [2 /*return*/, false];
                        }
                        console.log("[ChatManager] Renaming chat " + id + " to \"" + trimmedName + "\"");
                        return [4 /*yield*/, this.getChat(id)];
                    case 1:
                        chatToRename = _a.sent();
                        if (!chatToRename) {
                            console.error("[ChatManager] Failed to load chat " + id + " for renaming.");
                            new obsidian_1.Notice("Error loading chat data for rename.");
                            return [2 /*return*/, false];
                        }
                        // Оновлюємо метадані в об'єкті Chat (це оновить і lastModified)
                        chatToRename.updateMetadata({ name: trimmedName });
                        return [4 /*yield*/, this.saveChat(chatToRename)];
                    case 2:
                        saved = _a.sent();
                        if (saved) {
                            console.log("[ChatManager] Finished renaming chat " + id);
                            // Подію 'chat-list-updated' вже згенерує saveChat
                            new obsidian_1.Notice("Chat renamed to \"" + trimmedName + "\""); // Додамо сповіщення про успіх
                            return [2 /*return*/, true];
                        }
                        else {
                            console.error("[ChatManager] Failed to save renamed chat file for " + id + ".");
                            new obsidian_1.Notice("Error saving renamed chat " + trimmedName + ".");
                            return [2 /*return*/, false];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Створює копію існуючого чату. */
    ChatManager.prototype.cloneChat = function (chatIdToClone) {
        return __awaiter(this, void 0, Promise, function () {
            var originalChat, now, newId, newFilePath, originalMetadata, clonedMetadata, clonedChatData, constructorSettings, clonedChat, saved, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[ChatManager] Cloning chat ID: " + chatIdToClone);
                        return [4 /*yield*/, this.getChat(chatIdToClone)];
                    case 1:
                        originalChat = _a.sent();
                        if (!originalChat) {
                            console.error("[ChatManager] Cannot clone: Original chat " + chatIdToClone + " not found.");
                            new obsidian_1.Notice("Original chat not found for cloning.");
                            return [2 /*return*/, null];
                        }
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 5, , 6]);
                        now = new Date();
                        newId = "chat_" + now.getTime() + "_" + Math.random().toString(36).substring(2, 8);
                        newFilePath = this.getChatFilePath(newId);
                        originalMetadata = originalChat.metadata;
                        clonedMetadata = __assign(__assign({}, originalMetadata), { id: newId, name: "Copy of " + originalMetadata.name, createdAt: now.toISOString(), lastModified: now.toISOString() });
                        clonedChatData = {
                            metadata: clonedMetadata,
                            messages: originalChat.getMessages().map(function (msg) { return (__assign({}, msg)); })
                        };
                        constructorSettings = __assign({}, this.plugin.settings);
                        clonedChat = new Chat_1.Chat(this.adapter, constructorSettings, clonedChatData, newFilePath);
                        return [4 /*yield*/, this.saveChat(clonedChat)];
                    case 3:
                        saved = _a.sent();
                        if (!saved) {
                            throw new Error("Failed to save the cloned chat file.");
                        }
                        this.loadedChats[clonedChat.metadata.id] = clonedChat; // Додаємо в кеш
                        return [4 /*yield*/, this.setActiveChat(clonedChat.metadata.id)];
                    case 4:
                        _a.sent(); // Активуємо клон
                        console.log("[ChatManager] Cloned chat \"" + clonedChat.metadata.name + "\" created and activated.");
                        return [2 /*return*/, clonedChat];
                    case 5:
                        error_6 = _a.sent();
                        console.error("[ChatManager] Error cloning chat:", error_6);
                        new obsidian_1.Notice("An error occurred while cloning the chat.");
                        return [2 /*return*/, null];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    return ChatManager;
}()); // End of ChatManager class
exports.ChatManager = ChatManager;
