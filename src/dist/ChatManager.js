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
exports.__esModule = true;
exports.ChatManager = void 0;
// ChatManager.ts
var obsidian_1 = require("obsidian"); // Додано TFolder
var Chat_1 = require("./Chat"); // Import Chat class and types
// Ключі для зберігання даних плагіна
var SESSIONS_INDEX_KEY = 'chatSessionsIndex_v1'; // Key for storing index in plugin data
var ACTIVE_SESSION_ID_KEY = 'activeChatSessionId_v1'; // Key for storing active ID
var ChatManager = /** @class */ (function () {
    function ChatManager(plugin) {
        this.chatsFolderPath = "/"; // Шлях до папки чатів В СХОВИЩІ (ініціалізується як корінь)
        this.sessionIndex = {}; // In-memory index of available chats {id: metadata}
        this.activeChatId = null;
        this.loadedChats = {}; // Cache for loaded Chat objects
        this.plugin = plugin;
        this.app = plugin.app;
        this.adapter = plugin.app.vault.adapter; // Використовуємо адаптер сховища
        this.updateChatsFolderPath(); // Встановлюємо початковий шлях на основі налаштувань
        console.log("[ChatManager] Initialized. Base path set to: " + this.chatsFolderPath);
    }
    /**
     * Оновлює внутрішній шлях `chatsFolderPath` на основі поточних налаштувань плагіна.
     * Шлях вказує на папку всередині сховища Obsidian.
     */
    ChatManager.prototype.updateChatsFolderPath = function () {
        var _a;
        var settingsPath = (_a = this.plugin.settings.chatHistoryFolderPath) === null || _a === void 0 ? void 0 : _a.trim();
        // Якщо шлях в налаштуваннях вказано і він не порожній
        if (settingsPath) {
            // Нормалізуємо шлях (видаляє зайві слеші, тощо)
            this.chatsFolderPath = obsidian_1.normalizePath(settingsPath);
        }
        else {
            // Якщо шлях не вказано, використовуємо корінь сховища
            this.chatsFolderPath = "/";
        }
        console.log("[ChatManager] Updated chatsFolderPath to: " + this.chatsFolderPath);
    };
    /**
     * Ініціалізує ChatManager: оновлює шлях, перевіряє існування папки,
     * завантажує індекс чатів та ID активного чату.
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
                        // --- ЗМІНЕНО: Тепер loadChatIndex оновлює індекс з файлів ---
                        return [4 /*yield*/, this.loadChatIndex(true)];
                    case 2:
                        // --- ЗМІНЕНО: Тепер loadChatIndex оновлює індекс з файлів ---
                        _b.sent(); // true - означає примусове оновлення з файлів
                        // Завантажуємо ID останнього активного чату
                        _a = this;
                        return [4 /*yield*/, this.plugin.loadDataKey(ACTIVE_SESSION_ID_KEY)];
                    case 3:
                        // Завантажуємо ID останнього активного чату
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
     * Перевіряє існування папки для історії чатів у сховищі (згідно з `chatsFolderPath`).
     * Якщо папка не існує (і шлях не є коренем), намагається її створити.
     */
    ChatManager.prototype.ensureChatsFolderExists = function () {
        return __awaiter(this, void 0, Promise, function () {
            var stat, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // Не робимо нічого, якщо шлях вказує на корінь сховища
                        if (this.chatsFolderPath === "/" || !this.chatsFolderPath) {
                            console.log("[ChatManager] Chat history path is vault root, skipping folder creation check.");
                            return [2 /*return*/];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        return [4 /*yield*/, this.adapter.exists(this.chatsFolderPath)];
                    case 2:
                        if (!!(_a.sent())) return [3 /*break*/, 4];
                        console.log("[ChatManager] Chat history folder '" + this.chatsFolderPath + "' does not exist. Attempting to create...");
                        return [4 /*yield*/, this.adapter.mkdir(this.chatsFolderPath)];
                    case 3:
                        _a.sent();
                        console.log("[ChatManager] Created chat history directory in vault: " + this.chatsFolderPath);
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, this.adapter.stat(this.chatsFolderPath)];
                    case 5:
                        stat = _a.sent();
                        if ((stat === null || stat === void 0 ? void 0 : stat.type) !== 'folder') {
                            console.error("[ChatManager] Error: Configured chat history path '" + this.chatsFolderPath + "' exists but is not a folder.");
                            new obsidian_1.Notice("Error: Chat history path '" + this.chatsFolderPath + "' is not a folder. Please check settings.");
                            // В цьому випадку, можливо, варто відмовитись від збереження або повернутись до кореня?
                            // Поки що просто виводимо помилку.
                        }
                        else {
                            console.log("[ChatManager] Chat history directory confirmed in vault: " + this.chatsFolderPath);
                        }
                        _a.label = 6;
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        error_1 = _a.sent();
                        console.error("[ChatManager] Error creating/checking chat history directory " + this.chatsFolderPath + ":", error_1);
                        new obsidian_1.Notice("Error: Could not create chat history directory '" + this.chatsFolderPath + "'. Please check settings or folder permissions.");
                        return [3 /*break*/, 8];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Завантажує або оновлює індекс чатів.
     * @param forceScanFromFile Якщо true, індекс буде перебудовано шляхом сканування файлів у папці історії.
     * Якщо false (або не вказано), завантажує індекс зі сховища плагіна.
     */
    ChatManager.prototype.loadChatIndex = function (forceScanFromFile) {
        var _a, _b;
        if (forceScanFromFile === void 0) { forceScanFromFile = false; }
        return __awaiter(this, void 0, Promise, function () {
            var loadedIndex, newIndex, filesScanned, chatsLoaded, listResult, chatFiles, constructorSettings, _i, chatFiles_1, filePath, fullPath, fileName, chatId, jsonContent, data, metadata, e_1, error_2;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!!forceScanFromFile) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.plugin.loadDataKey(SESSIONS_INDEX_KEY)];
                    case 1:
                        loadedIndex = _c.sent();
                        this.sessionIndex = loadedIndex || {};
                        console.log("[ChatManager] Loaded chat index from plugin data with " + Object.keys(this.sessionIndex).length + " entries.");
                        return [2 /*return*/];
                    case 2:
                        console.log("[ChatManager] Rebuilding chat index by scanning files in: " + this.chatsFolderPath);
                        newIndex = {};
                        filesScanned = 0;
                        chatsLoaded = 0;
                        _c.label = 3;
                    case 3:
                        _c.trys.push([3, 15, , 17]);
                        return [4 /*yield*/, this.adapter.exists(this.chatsFolderPath)];
                    case 4:
                        if (!(!(_c.sent()) && this.chatsFolderPath !== "/")) return [3 /*break*/, 6];
                        console.warn("[ChatManager] Chat history folder '" + this.chatsFolderPath + "' not found during index rebuild. Index will be empty.");
                        this.sessionIndex = {};
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 5:
                        _c.sent(); // Зберігаємо порожній індекс
                        return [2 /*return*/];
                    case 6: return [4 /*yield*/, this.adapter.list(this.chatsFolderPath)];
                    case 7:
                        listResult = _c.sent();
                        console.log('[ChatManager] adapter.list result:', JSON.stringify(listResult, null, 2)); // Додано лог
                        chatFiles = listResult.files.filter(function (filePath) {
                            return filePath.toLowerCase().endsWith('.json');
                        } // Тільки .json файли
                        // ВИДАЛЕНО: && !filePath.includes('/')
                        );
                        // --------------------------
                        filesScanned = chatFiles.length;
                        console.log("[ChatManager] Found " + filesScanned + " potential chat files to scan:", JSON.stringify(chatFiles)); // Додано лог
                        constructorSettings = __assign({}, this.plugin.settings);
                        _i = 0, chatFiles_1 = chatFiles;
                        _c.label = 8;
                    case 8:
                        if (!(_i < chatFiles_1.length)) return [3 /*break*/, 13];
                        filePath = chatFiles_1[_i];
                        fullPath = obsidian_1.normalizePath(filePath);
                        fileName = fullPath.split('/').pop() || '';
                        chatId = fileName.endsWith('.json') ? fileName.slice(0, -5) : null;
                        console.log("[ChatManager] Processing file: " + fullPath + ", Extracted chatID: " + chatId); // Додано лог
                        if (!chatId) {
                            console.warn("[ChatManager] Could not extract chat ID from file path: " + fullPath);
                            return [3 /*break*/, 12];
                        }
                        _c.label = 9;
                    case 9:
                        _c.trys.push([9, 11, , 12]);
                        return [4 /*yield*/, this.adapter.read(fullPath)];
                    case 10:
                        jsonContent = _c.sent();
                        data = JSON.parse(jsonContent);
                        console.log("[ChatManager] Parsed data for " + chatId + ". Metadata ID: " + ((_a = data === null || data === void 0 ? void 0 : data.metadata) === null || _a === void 0 ? void 0 : _a.id)); // Додано лог
                        // Перевірка ID в метаданих проти ID з імені файлу
                        if (((_b = data === null || data === void 0 ? void 0 : data.metadata) === null || _b === void 0 ? void 0 : _b.id) && data.metadata.id === chatId) {
                            console.log("[ChatManager] VALID metadata for " + chatId + ". Adding to newIndex."); // Додано лог
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
                        e_1 = _c.sent();
                        console.error("[ChatManager] Error reading or parsing chat file " + fullPath + " during index rebuild:", e_1);
                        return [3 /*break*/, 12];
                    case 12:
                        _i++;
                        return [3 /*break*/, 8];
                    case 13:
                        console.log("[ChatManager] Index rebuild complete. Scanned: " + filesScanned + ", Successfully loaded metadata for: " + chatsLoaded);
                        this.sessionIndex = newIndex; // Встановлюємо новий індекс
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 14:
                        _c.sent(); // Зберігаємо оновлений індекс
                        return [3 /*break*/, 17];
                    case 15:
                        error_2 = _c.sent();
                        console.error("[ChatManager] Critical error during index rebuild process:", error_2);
                        this.sessionIndex = {}; // Встановлюємо порожній індекс у разі критичної помилки
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 16:
                        _c.sent();
                        new obsidian_1.Notice("Error rebuilding chat index. List might be empty.");
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
                    // console.log(`[ChatManager] Saving chat index with ${Object.keys(this.sessionIndex).length} entries.`);
                    return [4 /*yield*/, this.plugin.saveDataKey(SESSIONS_INDEX_KEY, this.sessionIndex)];
                    case 1:
                        // console.log(`[ChatManager] Saving chat index with ${Object.keys(this.sessionIndex).length} entries.`);
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Генерує повний, нормалізований шлях до файлу чату `.json` всередині сховища.
     * @param id Унікальний ідентифікатор чату.
     * @returns Нормалізований шлях до файлу.
     */
    ChatManager.prototype.getChatFilePath = function (id) {
        var fileName = id + ".json";
        // Якщо шлях до папки - корінь, повертаємо тільки ім'я файлу
        if (this.chatsFolderPath === "/" || !this.chatsFolderPath) {
            return obsidian_1.normalizePath(fileName); // Нормалізуємо на випадок ID зі слешами (хоча не повинно бути)
        }
        // Інакше, об'єднуємо шлях до папки та ім'я файлу
        return obsidian_1.normalizePath(this.chatsFolderPath + "/" + fileName);
    };
    /**
     * Створює новий чат: генерує ID, визначає шлях у сховищі, створює об'єкт Chat,
     * зберігає початковий файл, оновлює індекс, кеш та встановлює новий чат як активний.
     * @param name Необов'язкова початкова назва чату.
     * @returns Створений об'єкт Chat або null у разі помилки.
     */
    ChatManager.prototype.createNewChat = function (name) {
        return __awaiter(this, void 0, Promise, function () {
            var now, newId, filePath, initialMetadata, constructorSettings, newChat, saved, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[ChatManager] Attempting to create new chat...");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        now = new Date();
                        newId = "chat_" + now.getTime() + "_" + Math.random().toString(36).substring(2, 8);
                        filePath = this.getChatFilePath(newId);
                        console.log("[ChatManager] New chat ID: " + newId + ", Path: " + filePath);
                        initialMetadata = {
                            id: newId,
                            name: name || "Chat " + now.toLocaleDateString('en-US') + " " + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                            modelName: this.plugin.settings.modelName,
                            selectedRolePath: this.plugin.settings.selectedRolePath,
                            temperature: this.plugin.settings.temperature,
                            createdAt: now.toISOString(),
                            lastModified: now.toISOString()
                        };
                        constructorSettings = __assign({}, this.plugin.settings);
                        newChat = new Chat_1.Chat(this.adapter, constructorSettings, { metadata: initialMetadata, messages: [] }, filePath);
                        return [4 /*yield*/, newChat.saveImmediately()];
                    case 2:
                        saved = _a.sent();
                        if (!saved) {
                            // Повідомлення про помилку вже буде в Chat._saveToFile
                            throw new Error("Failed to save initial chat file.");
                        }
                        console.log("[ChatManager] Initial chat file saved for " + newId);
                        // 6. Оновлення індексу сесій
                        this.sessionIndex[newChat.metadata.id] = __assign({}, newChat.metadata);
                        delete this.sessionIndex[newChat.metadata.id].id; // Видаляємо надлишковий ID з значення
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 3:
                        _a.sent();
                        console.log("[ChatManager] Chat index updated for " + newId);
                        // 7. Додавання до кешу завантажених чатів
                        this.loadedChats[newChat.metadata.id] = newChat;
                        // 8. Встановлення як активний (це також збереже ID активного чату)
                        return [4 /*yield*/, this.setActiveChat(newChat.metadata.id)];
                    case 4:
                        // 8. Встановлення як активний (це також збереже ID активного чату)
                        _a.sent();
                        console.log("[ChatManager] Successfully created and activated new chat: " + newChat.metadata.name + " (ID: " + newChat.metadata.id + ")");
                        this.plugin.emit('chat-list-updated'); // Повідомляємо UI про новий чат
                        return [2 /*return*/, newChat];
                    case 5:
                        error_3 = _a.sent();
                        console.error("[ChatManager] Error creating new chat:", error_3);
                        new obsidian_1.Notice("Error creating new chat session.");
                        return [2 /*return*/, null];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Повертає масив метаданих всіх доступних чатів, відсортований за датою зміни (новіші перші).
     */
    ChatManager.prototype.listAvailableChats = function () {
        // Повертаємо метадані з індексу, додаючи ID назад
        return Object.entries(this.sessionIndex).map(function (_a) {
            var id = _a[0], meta = _a[1];
            return (__assign({ id: id }, meta));
        }).sort(function (a, b) { return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime(); }); // Сортуємо: новіші перші
    };
    /** Повертає ID поточного активного чату. */
    ChatManager.prototype.getActiveChatId = function () {
        return this.activeChatId;
    };
    /**
     * Встановлює активний чат за його ID.
     * Зберігає ID активного чату, завантажує дані чату (якщо потрібно),
     * оновлює кеш та викликає подію 'active-chat-changed'.
     * @param id ID чату для активації, або null для скидання активного чату.
     */
    ChatManager.prototype.setActiveChat = function (id) {
        return __awaiter(this, void 0, Promise, function () {
            var loadedChat;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[ChatManager] Setting active chat to ID: " + id);
                        // 1. Валідація ID (тільки якщо встановлюємо не null)
                        if (id && !this.sessionIndex[id]) {
                            console.error("[ChatManager] Attempted to set active chat to non-existent ID: " + id + ". Setting to null.");
                            id = null; // Встановлюємо null, якщо ID не знайдено в індексі
                        }
                        if (!(id === this.activeChatId)) return [3 /*break*/, 3];
                        if (!id) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.getChat(id)];
                    case 1:
                        _a.sent(); // Переконуємось, що завантажено
                        _a.label = 2;
                    case 2: // Переконуємось, що завантажено
                    return [2 /*return*/]; // Не потрібно нічого робити далі
                    case 3:
                        // 3. Оновлюємо внутрішній стан і зберігаємо ID активного чату
                        this.activeChatId = id;
                        return [4 /*yield*/, this.plugin.saveDataKey(ACTIVE_SESSION_ID_KEY, id)];
                    case 4:
                        _a.sent();
                        console.log("[ChatManager] Persisted active chat ID: " + id);
                        loadedChat = null;
                        if (!id) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.getChat(id)];
                    case 5:
                        loadedChat = _a.sent(); // getChat обробляє завантаження та кешування
                        if (!!loadedChat) return [3 /*break*/, 7];
                        // Якщо завантаження не вдалося (файл відсутній/пошкоджений), скидаємо активний ID
                        console.error("[ChatManager] Failed to load chat data for newly activated ID " + id + ". Resetting active chat to null.");
                        // Рекурсивний виклик для коректної обробки встановлення null
                        return [4 /*yield*/, this.setActiveChat(null)];
                    case 6:
                        // Рекурсивний виклик для коректної обробки встановлення null
                        _a.sent();
                        return [2 /*return*/]; // Зупиняємо виконання тут
                    case 7:
                        // 5. Викликаємо подію з chatId та завантаженим об'єктом чату (або null)
                        // Слухач у main.ts або OllamaView обробить оновлення UI та стану.
                        console.log("[ChatManager] Emitting 'active-chat-changed' event for ID: " + id);
                        this.plugin.emit('active-chat-changed', { chatId: id, chat: loadedChat });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Отримує конкретний чат за ID, завантажуючи його з файлу у сховищі, якщо він ще не в кеші.
     * @param id Ідентифікатор чату.
     * @returns Об'єкт Chat або null, якщо чат не знайдено або сталася помилка завантаження.
     */
    ChatManager.prototype.getChat = function (id) {
        return __awaiter(this, void 0, Promise, function () {
            var filePath, constructorSettings, chat;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[ChatManager] getChat called for ID: " + id);
                        // 1. Перевірка кешу
                        if (this.loadedChats[id]) {
                            console.log("[ChatManager] Returning chat " + id + " from cache.");
                            return [2 /*return*/, this.loadedChats[id]];
                        }
                        console.log("[ChatManager] Chat " + id + " not in cache.");
                        if (!this.sessionIndex[id]) return [3 /*break*/, 6];
                        filePath = this.getChatFilePath(id);
                        console.log("[ChatManager] Attempting to load chat " + id + " from vault path: " + filePath);
                        constructorSettings = __assign({}, this.plugin.settings);
                        return [4 /*yield*/, Chat_1.Chat.loadFromFile(filePath, this.adapter, constructorSettings)];
                    case 1:
                        chat = _a.sent();
                        if (!chat) return [3 /*break*/, 2];
                        // 6. Успішне завантаження: додаємо в кеш
                        console.log("[ChatManager] Successfully loaded chat " + id + " from file. Adding to cache.");
                        this.loadedChats[id] = chat;
                        return [2 /*return*/, chat];
                    case 2:
                        // 7. Помилка завантаження: видаляємо з індексу, оновлюємо активний ID якщо потрібно
                        console.error("[ChatManager] Failed to load chat " + id + " from file " + filePath + ". Removing from index.");
                        delete this.sessionIndex[id];
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 3:
                        _a.sent();
                        if (!(this.activeChatId === id)) return [3 /*break*/, 5];
                        console.warn("[ChatManager] Resetting activeChatId because the active chat file failed to load.");
                        return [4 /*yield*/, this.setActiveChat(null)];
                    case 4:
                        _a.sent(); // Скидаємо активний чат
                        _a.label = 5;
                    case 5:
                        this.plugin.emit('chat-list-updated'); // Повідомляємо UI про зміну списку
                        return [2 /*return*/, null];
                    case 6:
                        // 8. Чат не знайдено в індексі
                        console.warn("[ChatManager] Chat with ID " + id + " not found in session index.");
                        return [2 /*return*/, null];
                }
            });
        });
    };
    /**
     * Отримує поточний активний чат. Якщо активний чат не встановлено,
     * намагається завантажити останній змінений чат. Якщо чатів немає, створює новий.
     * @returns Активний об'єкт Chat або null у разі помилки створення/завантаження.
     */
    ChatManager.prototype.getActiveChat = function () {
        return __awaiter(this, void 0, Promise, function () {
            var availableChats, mostRecentId;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[ChatManager] getActiveChat called. Current activeChatId: " + this.activeChatId);
                        if (!!this.activeChatId) return [3 /*break*/, 7];
                        console.log("[ChatManager] No active chat ID set. Checking available chats...");
                        availableChats = this.listAvailableChats();
                        if (!(availableChats.length > 0)) return [3 /*break*/, 5];
                        mostRecentId = availableChats[0].id;
                        console.log("[ChatManager] Found " + availableChats.length + " available chats. Attempting to set most recent as active: ID " + mostRecentId);
                        return [4 /*yield*/, this.setActiveChat(mostRecentId)];
                    case 1:
                        _a.sent(); // Встановлюємо найновіший як активний
                        if (!(this.activeChatId && this.loadedChats[this.activeChatId])) return [3 /*break*/, 2];
                        return [2 /*return*/, this.loadedChats[this.activeChatId]]; // Повертаємо успішно завантажений чат
                    case 2:
                        console.error("[ChatManager] Failed to load the most recent chat (ID: " + mostRecentId + ") after setting it active. Creating a new chat instead.");
                        return [4 /*yield*/, this.createNewChat()];
                    case 3: return [2 /*return*/, _a.sent()]; // Створюємо новий, якщо завантаження не вдалося
                    case 4: return [3 /*break*/, 7];
                    case 5:
                        console.log("[ChatManager] No available chats exist. Creating a new one.");
                        return [4 /*yield*/, this.createNewChat()];
                    case 6: return [2 /*return*/, _a.sent()]; // Створюємо новий, якщо взагалі немає чатів
                    case 7:
                        // Якщо activeChatId є, спробуємо завантажити його
                        console.log("[ChatManager] Active ID is " + this.activeChatId + ". Attempting to get chat object...");
                        return [2 /*return*/, this.getChat(this.activeChatId)]; // Повертаємо чат за поточним активним ID
                }
            });
        });
    };
    /**
     * Додає повідомлення до поточного активного чату.
     * Обробляє збереження чату (через Chat.addMessage -> debouncedSave).
     * @param role Роль відправника ('user' або 'assistant').
     * @param content Вміст повідомлення.
     * @returns Додане повідомлення або null у разі помилки.
     */
    ChatManager.prototype.addMessageToActiveChat = function (role, content) {
        return __awaiter(this, void 0, Promise, function () {
            var activeChat, newMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getActiveChat()];
                    case 1:
                        activeChat = _a.sent();
                        if (activeChat) {
                            newMessage = activeChat.addMessage(role, content);
                            console.log("[ChatManager] Added " + role + " message to active chat " + activeChat.metadata.id + ". Timestamp: " + newMessage.timestamp.toISOString());
                            // Негайно оновлюємо метадані (lastModified) в індексі
                            this.sessionIndex[activeChat.metadata.id] = __assign({}, activeChat.metadata);
                            delete this.sessionIndex[activeChat.metadata.id].id;
                            this.saveChatIndex(); // Швидко зберігаємо оновлений індекс
                            // Повідомляємо UI про нове повідомлення
                            this.plugin.emit('message-added', { chatId: activeChat.metadata.id, message: newMessage });
                            return [2 /*return*/, newMessage];
                        }
                        else {
                            console.error("[ChatManager] Cannot add message, no active chat found or loaded.");
                            new obsidian_1.Notice("Error: No active chat session to add message to.");
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Очищує історію повідомлень у поточному активному чаті. */
    ChatManager.prototype.clearActiveChatMessages = function () {
        return __awaiter(this, void 0, Promise, function () {
            var activeChat;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getActiveChat()];
                    case 1:
                        activeChat = _a.sent();
                        if (activeChat) {
                            activeChat.clearMessages(); // clearMessages викликає збереження
                            console.log("[ChatManager] Messages cleared for active chat: " + activeChat.metadata.id);
                            this.plugin.emit('messages-cleared', activeChat.metadata.id); // Повідомляємо UI
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
    /**
     * Оновлює метадані поточного активного чату.
     * @param updates Об'єкт з полями метаданих для оновлення (крім id, createdAt).
     */
    ChatManager.prototype.updateActiveChatMetadata = function (updates) {
        return __awaiter(this, void 0, Promise, function () {
            var activeChat;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getActiveChat()];
                    case 1:
                        activeChat = _a.sent();
                        if (!activeChat) return [3 /*break*/, 3];
                        console.log("[ChatManager] Updating metadata for active chat " + activeChat.metadata.id + ":", updates);
                        activeChat.updateMetadata(updates); // updateMetadata викликає збереження
                        // Оновлюємо копію метаданих в індексі
                        this.sessionIndex[activeChat.metadata.id] = __assign({}, activeChat.metadata);
                        delete this.sessionIndex[activeChat.metadata.id].id;
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 2:
                        _a.sent(); // Зберігаємо оновлений індекс
                        // Повідомляємо UI про можливу зміну (наприклад, назви в списку)
                        this.plugin.emit('chat-list-updated');
                        // Якщо змінилася роль або модель, можливо, треба додаткові події?
                        if (updates.modelName) {
                            this.plugin.emit('model-changed', updates.modelName);
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        console.warn("[ChatManager] Cannot update metadata, no active chat.");
                        new obsidian_1.Notice("No active chat to update metadata for.");
                        _a.label = 4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Видаляє чат за його ID: видаляє файл, оновлює індекс та кеш,
     * встановлює новий активний чат, якщо видалено поточний.
     * @param id Ідентифікатор чату для видалення.
     * @returns true, якщо видалення (або відсутність файлу) пройшло успішно, інакше false.
     */
    ChatManager.prototype.deleteChat = function (id) {
        return __awaiter(this, void 0, Promise, function () {
            var chatToDelete, filePath, constructorSettings, deletedFile, available, nextActiveId;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[ChatManager] Attempting to delete chat ID: " + id);
                        chatToDelete = null;
                        if (!this.sessionIndex[id]) return [3 /*break*/, 2];
                        filePath = this.getChatFilePath(id);
                        console.log("[ChatManager] Found chat " + id + " in index. File path: " + filePath);
                        constructorSettings = __assign({}, this.plugin.settings);
                        return [4 /*yield*/, Chat_1.Chat.loadFromFile(filePath, this.adapter, constructorSettings)];
                    case 1:
                        chatToDelete = _a.sent();
                        if (!chatToDelete) {
                            // Якщо не вдалося завантажити, але є в індексі - можливо, файл вже видалено
                            console.warn("[ChatManager] Chat " + id + " found in index but failed to load from file. Assuming deleted.");
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        console.warn("[ChatManager] Cannot delete chat " + id + ": Not found in index.");
                        return [2 /*return*/, false]; // Не знайдено в індексі
                    case 3:
                        deletedFile = false;
                        if (!chatToDelete) return [3 /*break*/, 5];
                        return [4 /*yield*/, chatToDelete.deleteFile()];
                    case 4:
                        // Видаляємо файл за допомогою методу об'єкта Chat
                        deletedFile = _a.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        // Якщо об'єкт не завантажився, але був в індексі, вважаємо, що файл вже видалено
                        deletedFile = true;
                        _a.label = 6;
                    case 6:
                        if (!deletedFile) return [3 /*break*/, 10];
                        console.log("[ChatManager] File deletion successful (or file already missing) for chat " + id);
                        // Видаляємо з індексу та кешу
                        delete this.sessionIndex[id];
                        delete this.loadedChats[id];
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 7:
                        _a.sent();
                        console.log("[ChatManager] Removed chat " + id + " from index and cache.");
                        if (!(this.activeChatId === id)) return [3 /*break*/, 9];
                        console.log("[ChatManager] Deleted chat was active. Selecting new active chat...");
                        available = this.listAvailableChats();
                        nextActiveId = available.length > 0 ? available[0].id : null;
                        return [4 /*yield*/, this.setActiveChat(nextActiveId)];
                    case 8:
                        _a.sent(); // Встановлюємо найновіший або null
                        _a.label = 9;
                    case 9:
                        this.plugin.emit('chat-list-updated'); // Повідомляємо UI
                        return [2 /*return*/, true];
                    case 10:
                        // Помилка видалення файлу (повідомлення буде в Chat.deleteFile)
                        console.error("[ChatManager] File deletion failed for chat " + id);
                        return [2 /*return*/, false];
                }
            });
        });
    };
    /**
     * Перейменовує чат за його ID.
     * Оновлює назву в індексі та в метаданих завантаженого чату (якщо є),
     * і зберігає зміни в файлі чату.
     * @param id Ідентифікатор чату.
     * @param newName Нова назва чату.
     * @returns true, якщо перейменування успішне, інакше false.
     */
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
                        if (!this.sessionIndex[id]) return [3 /*break*/, 6];
                        console.log("[ChatManager] Renaming chat " + id + " to \"" + trimmedName + "\"");
                        // 1. Оновлюємо індекс
                        this.sessionIndex[id].name = trimmedName;
                        this.sessionIndex[id].lastModified = new Date().toISOString();
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 1:
                        _a.sent(); // Зберігаємо оновлений індекс
                        return [4 /*yield*/, this.getChat(id)];
                    case 2:
                        chatToRename = _a.sent();
                        if (!chatToRename) return [3 /*break*/, 4];
                        console.log("[ChatManager] Saving renamed chat " + id + " to file: " + chatToRename.filePath);
                        // Оновлюємо метадані в об'єкті Chat
                        chatToRename.metadata.name = trimmedName;
                        chatToRename.metadata.lastModified = this.sessionIndex[id].lastModified;
                        return [4 /*yield*/, chatToRename.saveImmediately()];
                    case 3:
                        saved = _a.sent();
                        if (!saved) {
                            // Помилка збереження файлу - можливо, варто відкотити зміну в індексі?
                            console.error("[ChatManager] Failed to save renamed chat file for " + id + ". Index might be inconsistent.");
                            new obsidian_1.Notice("Error saving renamed chat " + trimmedName + ".");
                            // Поки що не відкочуємо індекс, але логуємо помилку.
                            return [2 /*return*/, false]; // Повертаємо false через помилку збереження
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        console.error("[ChatManager] Failed to load chat " + id + " to save rename after updating index.");
                        // Індекс оновлено, але файл - ні. Погана ситуація.
                        new obsidian_1.Notice("Error saving renamed chat " + trimmedName + ": Could not load chat data.");
                        return [2 /*return*/, false]; // Повертаємо false
                    case 5:
                        console.log("[ChatManager] Finished renaming chat " + id);
                        this.plugin.emit('chat-list-updated'); // Повідомляємо UI
                        return [2 /*return*/, true];
                    case 6:
                        console.warn("[ChatManager] Cannot rename chat " + id + ": Not found in index.");
                        new obsidian_1.Notice("Chat with ID " + id + " not found.");
                        return [2 /*return*/, false];
                }
            });
        });
    };
    /**
     * Створює копію (клон) існуючого чату з новим ID та назвою.
     * @param chatIdToClone ID чату, який потрібно клонувати.
     * @returns Новий об'єкт Chat (клон) або null у разі помилки.
     */
    ChatManager.prototype.cloneChat = function (chatIdToClone) {
        return __awaiter(this, void 0, Promise, function () {
            var originalChat, now, newId, newFilePath, originalMetadata, clonedMetadata, clonedChatData, constructorSettings, clonedChat, saved, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[ChatManager] Attempting to clone chat ID: " + chatIdToClone);
                        return [4 /*yield*/, this.getChat(chatIdToClone)];
                    case 1:
                        originalChat = _a.sent();
                        if (!originalChat) {
                            console.error("[ChatManager] Cannot clone: Original chat with ID " + chatIdToClone + " not found.");
                            new obsidian_1.Notice("Original chat not found for cloning.");
                            return [2 /*return*/, null];
                        }
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 6, , 7]);
                        now = new Date();
                        newId = "chat_" + now.getTime() + "_" + Math.random().toString(36).substring(2, 8);
                        newFilePath = this.getChatFilePath(newId);
                        console.log("[ChatManager] Clone details - New ID: " + newId + ", New Path: " + newFilePath);
                        originalMetadata = originalChat.metadata;
                        clonedMetadata = __assign(__assign({}, originalMetadata), { id: newId, name: "Copy of " + originalMetadata.name, createdAt: now.toISOString(), lastModified: now.toISOString() });
                        clonedChatData = {
                            metadata: clonedMetadata,
                            // Створюємо копію масиву повідомлень
                            // Важливо: Date об'єкти копіюються за посиланням, але це ОК
                            messages: originalChat.getMessages().map(function (msg) { return (__assign({}, msg)); })
                        };
                        constructorSettings = __assign({}, this.plugin.settings);
                        clonedChat = new Chat_1.Chat(this.adapter, constructorSettings, clonedChatData, newFilePath);
                        return [4 /*yield*/, clonedChat.saveImmediately()];
                    case 3:
                        saved = _a.sent();
                        if (!saved) {
                            throw new Error("Failed to save the cloned chat file.");
                        }
                        console.log("[ChatManager] Cloned chat file saved for " + newId);
                        // 7. Оновлюємо індекс сесій
                        this.sessionIndex[clonedChat.metadata.id] = __assign({}, clonedChat.metadata);
                        delete this.sessionIndex[clonedChat.metadata.id].id;
                        return [4 /*yield*/, this.saveChatIndex()];
                    case 4:
                        _a.sent();
                        console.log("[ChatManager] Chat index updated for cloned chat " + newId);
                        // 8. Додаємо клон до кешу
                        this.loadedChats[clonedChat.metadata.id] = clonedChat;
                        // 9. (Важливо!) Встановлюємо клон як активний чат
                        return [4 /*yield*/, this.setActiveChat(clonedChat.metadata.id)];
                    case 5:
                        // 9. (Важливо!) Встановлюємо клон як активний чат
                        _a.sent();
                        console.log("[ChatManager] Cloned chat \"" + clonedChat.metadata.name + "\" created and activated.");
                        this.plugin.emit('chat-list-updated'); // Повідомляємо UI
                        return [2 /*return*/, clonedChat]; // Повертаємо щойно створений клон
                    case 6:
                        error_4 = _a.sent();
                        console.error("[ChatManager] Error cloning chat:", error_4);
                        new obsidian_1.Notice("An error occurred while cloning the chat.");
                        return [2 /*return*/, null];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    return ChatManager;
}()); // End of ChatManager class
exports.ChatManager = ChatManager;
