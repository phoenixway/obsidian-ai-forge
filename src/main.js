import { __awaiter } from "tslib";
// src/main.ts
import { Plugin, Notice, normalizePath, TFile, TFolder, debounce, } from "obsidian";
import { OllamaView, VIEW_TYPE_OLLAMA_PERSONAS } from "./OllamaView";
import { OllamaSettingTab, DEFAULT_SETTINGS } from "./settings";
import { RagService } from "./ragService";
import { OllamaService } from "./OllamaService";
import { PromptService } from "./PromptService";
import { ChatManager } from "./ChatManager";
import { exec } from "child_process";
import { TranslationService } from "./TranslationService";
import { PromptModal } from "./PromptModal";
import { ConfirmModal } from "./ConfirmModal";
import { Logger } from "./Logger";
import { AgentManager } from "./agents/AgentManager"; // Адаптуйте шлях
import { SimpleFileAgent } from "./examples/SimpleFileAgent";
// --- КОНСТАНТИ ДЛЯ ЗБЕРЕЖЕННЯ ---
export const SESSIONS_INDEX_KEY = "chatIndex_v2"; // Використовуємо v2
export const ACTIVE_CHAT_ID_KEY = "activeChatId_v2"; // Використовуємо v2
export const CHAT_INDEX_KEY = "chatIndex_v2"; // Синонім для ясності
export default class OllamaPlugin extends Plugin {
    constructor() {
        super(...arguments);
        this.view = null;
        this.eventHandlers = {};
        this.roleListCache = null;
        this.roleCacheClearTimeout = null;
        this.indexUpdateTimeout = null;
        this.dailyTaskFilePath = null;
        this.taskFileContentCache = null;
        this.taskFileNeedsUpdate = false;
        this.taskCheckInterval = null;
        // Debounced функція оновлення для Vault Events
        this.debouncedIndexAndUIRebuild = debounce(() => __awaiter(this, void 0, void 0, function* () {
            if (this.chatManager) {
                yield this.chatManager.rebuildIndexFromFiles();
                // this.emit("chat-list-updated");
            }
        }), 1500, true);
    }
    // --- Event Emitter Methods ---
    on(event, callback) {
        if (!this.eventHandlers[event])
            this.eventHandlers[event] = [];
        this.eventHandlers[event].push(callback);
        return () => {
            var _a, _b;
            this.eventHandlers[event] = (_a = this.eventHandlers[event]) === null || _a === void 0 ? void 0 : _a.filter(h => h !== callback);
            if (((_b = this.eventHandlers[event]) === null || _b === void 0 ? void 0 : _b.length) === 0) {
                delete this.eventHandlers[event];
            }
        };
    }
    emit(event, data) {
        const handlers = this.eventHandlers[event];
        if (handlers) {
            handlers.slice().forEach(handler => {
                try {
                    handler(data);
                }
                catch (e) { }
            });
        }
    }
    // --------------------------
    isTaskFileUpdated() {
        return this.taskFileNeedsUpdate;
    }
    // src/main.ts
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            const initialSettingsData = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
            // --- Ініціалізація Логера ---
            const loggerSettings = {
                // Визначаємо рівень логування для консолі залежно від середовища
                consoleLogLevel: process.env.NODE_ENV === "production" ? initialSettingsData.consoleLogLevel || "INFO" : "DEBUG",
                fileLoggingEnabled: initialSettingsData.fileLoggingEnabled,
                fileLogLevel: initialSettingsData.fileLogLevel,
                logCallerInfo: initialSettingsData.logCallerInfo,
                logFilePath: initialSettingsData.logFilePath,
                logFileMaxSizeMB: initialSettingsData.logFileMaxSizeMB,
            };
            this.logger = new Logger(this, loggerSettings);
            // ---
            // Завантажуємо налаштування та виконуємо міграцію, якщо потрібно
            yield this.loadSettingsAndMigrate();
            // Ініціалізуємо сервіси
            this.promptService = new PromptService(this);
            this.ollamaService = new OllamaService(this);
            this.translationService = new TranslationService(this);
            this.ragService = new RagService(this);
            this.chatManager = new ChatManager(this);
            this.agentManager = new AgentManager(this); // <--- ІНІЦІАЛІЗАЦІЯ
            // Тут можна зареєструвати початкових агентів, якщо вони є
            this.agentManager.registerAgent(new SimpleFileAgent());
            // Ініціалізуємо менеджер чатів (завантажує індекс, відновлює активний чат)
            yield this.chatManager.initialize();
            // Оновлюємо налаштування логера реальними значеннями після завантаження
            this.logger.updateSettings({
                consoleLogLevel: this.settings.consoleLogLevel,
                fileLoggingEnabled: this.settings.fileLoggingEnabled,
                fileLogLevel: this.settings.fileLogLevel,
                logCallerInfo: this.settings.logCallerInfo,
                logFilePath: this.settings.logFilePath,
                logFileMaxSizeMB: this.settings.logFileMaxSizeMB,
            });
            // Реєструємо View плагіна
            this.registerView(VIEW_TYPE_OLLAMA_PERSONAS, leaf => {
                this.view = new OllamaView(leaf, this);
                return this.view;
            });
            // Обробка помилок з'єднання з Ollama Service
            this.ollamaService.on("connection-error", error => {
                // Генеруємо подію плагіна про помилку з'єднання
                this.emit("ollama-connection-error", error.message || "Unknown connection error");
            });
            // Реєстрація обробників внутрішніх подій плагіна
            this.register(this.on("ollama-connection-error", (message) => __awaiter(this, void 0, void 0, function* () {
                if (this.chatManager) {
                    // Додаємо повідомлення про помилку до активного чату
                    yield this.chatManager.addMessageToActiveChat("error", `Ollama Connection Error: ${message}`, new Date());
                }
                else {
                    // Якщо ChatManager ще не готовий, показуємо стандартне повідомлення
                    new Notice(`Ollama Connection Error: ${message}`);
                }
            })));
            // Реєструємо локальний обробник для збереження ID активного чату
            this.register(this.on("active-chat-changed", this.handleActiveChatChangedLocally.bind(this)));
            // Реєструємо обробник для оновлення налаштувань
            this.register(this.on("settings-updated", () => {
                var _a, _b, _c, _d;
                // Оновлюємо налаштування логера
                this.logger.updateSettings({
                    consoleLogLevel: this.settings.consoleLogLevel,
                    fileLoggingEnabled: this.settings.fileLoggingEnabled,
                    fileLogLevel: this.settings.fileLogLevel,
                    logCallerInfo: this.settings.logCallerInfo,
                    logFilePath: this.settings.logFilePath,
                    logFileMaxSizeMB: this.settings.logFileMaxSizeMB,
                });
                // Оновлюємо шлях до файлу завдань та завантажуємо їх
                this.updateDailyTaskFilePath();
                this.loadAndProcessInitialTasks(); // Не блокуємо потік, хай працює асинхронно
                // Оновлюємо конфігурацію Ollama Service (напр., URL)
                this.updateOllamaServiceConfig();
                // Скидаємо кеш ролей та сповіщаємо про їх оновлення
                this.roleListCache = null;
                (_b = (_a = this.promptService) === null || _a === void 0 ? void 0 : _a.clearRoleCache) === null || _b === void 0 ? void 0 : _b.call(_a);
                this.emit("roles-updated");
                // Сповіщаємо View про оновлення налаштувань
                (_d = (_c = this.view) === null || _c === void 0 ? void 0 : _c.handleSettingsUpdated) === null || _d === void 0 ? void 0 : _d.call(_c);
            }));
            // -------------------------------------------------
            // --- Додавання стрічки (Ribbon) та команд ---
            this.addRibbonIcon("brain-circuit", "Open AI Forge Chat", () => {
                this.activateView();
            });
            // Команда для відкриття чату
            this.addCommand({
                id: "open-chat-view",
                name: "Open AI Forge Chat",
                callback: () => {
                    this.activateView();
                },
            });
            // Команда для індексації RAG
            this.addCommand({
                id: "index-rag-documents",
                name: "AI Forge: Index documents for RAG",
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    if (this.settings.ragEnabled) {
                        yield this.ragService.indexDocuments();
                    }
                    else {
                        new Notice("RAG is disabled in settings.");
                    }
                }),
            });
            // Команда для очищення історії активного чату
            this.addCommand({
                id: "clear-active-chat-history",
                name: "AI Forge: Clear Active Chat History",
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    yield this.clearMessageHistoryWithConfirmation();
                }),
            });
            // Команда для оновлення списку ролей
            this.addCommand({
                id: "refresh-roles",
                name: "AI Forge: Refresh Roles List",
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    yield this.listRoleFiles(true); // Примусово оновлюємо список
                    this.emit("roles-updated"); // Сповіщаємо UI
                    new Notice("Role list refreshed.");
                }),
            });
            // Команда для створення нового чату
            this.addCommand({
                id: "new-chat",
                name: "AI Forge: New Chat",
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    const newChat = yield this.chatManager.createNewChat();
                    if (newChat) {
                        new Notice(`Created new chat: ${newChat.metadata.name}`);
                        // Фокус на поле вводу може оброблятися через подію 'active-chat-changed' у View
                    }
                    else {
                        new Notice("Failed to create new chat.");
                    }
                }),
            });
            // Команда для перемикання чатів (UI не реалізовано)
            this.addCommand({
                id: "switch-chat",
                name: "AI Forge: Switch Chat",
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    yield this.showChatSwitcher();
                }),
            });
            // Команда для перейменування активного чату
            this.addCommand({
                id: "rename-active-chat",
                name: "AI Forge: Rename Active Chat",
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    yield this.renameActiveChat();
                }),
            });
            // Команда для видалення активного чату
            this.addCommand({
                id: "delete-active-chat",
                name: "AI Forge: Delete Active Chat",
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    yield this.deleteActiveChatWithConfirmation();
                }),
            });
            // --------------------------
            // Додаємо вкладку налаштувань
            this.settingTab = new OllamaSettingTab(this.app, this);
            this.addSettingTab(this.settingTab);
            // Виконуємо дії після того, як робочий простір готовий
            this.app.workspace.onLayoutReady(() => __awaiter(this, void 0, void 0, function* () {
                // Автоматична індексація RAG при старті, якщо увімкнено
                if (this.settings.ragEnabled && this.settings.ragAutoIndexOnStartup) {
                    setTimeout(() => {
                        var _a;
                        (_a = this.ragService) === null || _a === void 0 ? void 0 : _a.indexDocuments();
                    }, 5000); // Запускаємо з невеликою затримкою
                }
                // Спроба відновити активний чат - ця логіка тепер виконується в chatManager.initialize()
                // const savedActiveId = await this.loadDataKey(ACTIVE_CHAT_ID_KEY);
                // if (savedActiveId && this.settings.saveMessageHistory && this.chatManager) {
                //    await this.chatManager.setActiveChat(savedActiveId);
                // }
            }));
            // --- Реєстрація слухачів Vault для папки ЧАТІВ ---
            this.registerVaultListeners(); // Викликаємо метод реєстрації
            // ---
            // --- Реєстрація слухачів для папки РОЛЕЙ та RAG ---
            // Ці слухачі НЕ повинні викликати повний rebuild індексу чатів
            const debouncedRoleClear = debounce(() => {
                var _a, _b;
                this.roleListCache = null; // Скидаємо кеш списку ролей
                (_b = (_a = this.promptService) === null || _a === void 0 ? void 0 : _a.clearRoleCache) === null || _b === void 0 ? void 0 : _b.call(_a); // Скидаємо кеш контенту ролей
                this.emit("roles-updated"); // Сповіщаємо про необхідність оновити списки ролей в UI
            }, 1500, true); // Затримка та негайне виконання
            // Створюємо обробники для подій Vault, які стосуються ролей/RAG
            const handleModifyEvent = (file) => {
                if (file instanceof TFile) {
                    this.handleRoleOrRagFileChange(file.path, debouncedRoleClear, false);
                    this.handleTaskFileModify(file); // Окрема обробка файлу завдань
                }
            };
            const handleDeleteEvent = (file) => {
                var _a;
                this.handleRoleOrRagFileChange(file.path, debouncedRoleClear, true); // Помічаємо як видалення
                if (this.settings.enableProductivityFeatures && file.path === this.dailyTaskFilePath) {
                    // Якщо видалено файл завдань
                    this.dailyTaskFilePath = null;
                    this.taskFileContentCache = null;
                    this.taskFileNeedsUpdate = false;
                    (_a = this.chatManager) === null || _a === void 0 ? void 0 : _a.updateTaskState(null); // Скидаємо стан завдань
                }
            };
            const handleRenameEvent = (file, oldPath) => {
                // Реагуємо і на новий, і на старий шлях для ролей/RAG
                this.handleRoleOrRagFileChange(file.path, debouncedRoleClear, false);
                this.handleRoleOrRagFileChange(oldPath, debouncedRoleClear, true);
                // Обробка перейменування файлу завдань
                if (this.settings.enableProductivityFeatures) {
                    if (oldPath === this.dailyTaskFilePath) { // Якщо перейменовано файл завдань
                        this.updateDailyTaskFilePath(); // Оновлюємо шлях
                        this.loadAndProcessInitialTasks(); // Перезавантажуємо завдання
                    }
                    else if (file.path === this.dailyTaskFilePath) { // Якщо якийсь файл перейменовано НА файл завдань
                        this.taskFileNeedsUpdate = true;
                        this.checkAndProcessTaskUpdate();
                    }
                }
            };
            const handleCreateEvent = (file) => {
                // Цей 'create' обробляє створення файлів ролей/RAG
                this.handleRoleOrRagFileChange(file.path, debouncedRoleClear, false);
                // Обробка створення файлу завдань
                if (this.settings.enableProductivityFeatures && file.path === this.dailyTaskFilePath) {
                    this.taskFileNeedsUpdate = true;
                    this.checkAndProcessTaskUpdate();
                }
            };
            // Реєструємо ці окремі обробники
            this.registerEvent(this.app.vault.on("modify", handleModifyEvent));
            this.registerEvent(this.app.vault.on("delete", handleDeleteEvent));
            this.registerEvent(this.app.vault.on("rename", handleRenameEvent));
            // Важливо: Цей 'create' обробляє ролі/RAG, а той, що в registerVaultListeners - чати.
            this.registerEvent(this.app.vault.on("create", handleCreateEvent));
            // ---
            // --- Логіка файлу завдань ---
            this.updateDailyTaskFilePath(); // Визначаємо шлях до файлу завдань
            yield this.loadAndProcessInitialTasks(); // Завантажуємо початковий стан завдань
            if (this.settings.enableProductivityFeatures) {
                // Запускаємо періодичну перевірку оновлень файлу завдань
                this.taskCheckInterval = setInterval(() => this.checkAndProcessTaskUpdate(), 5000);
                this.registerInterval(this.taskCheckInterval); // Реєструємо інтервал для авто-очищення
            }
        });
    } // --- кінець onload ---
    registerVaultListeners() {
        // Обробник для create та delete
        const handleFileCreateDelete = (file) => {
            if (!file || !this.chatManager || !this.settings.chatHistoryFolderPath)
                return;
            const historyPath = normalizePath(this.settings.chatHistoryFolderPath);
            // Перевіряємо, чи файл знаходиться всередині папки історії (не сама папка)
            // і чи це JSON файл (для create) або будь-який файл/папка (для delete)
            // ВАЖЛИВО: Перевірка на historyPath+'/' гарантує, що ми не реагуємо на саму папку історії
            if (file.path.startsWith(historyPath + "/") &&
                (file.path.toLowerCase().endsWith(".json") || file instanceof TFolder)) {
                this.debouncedIndexAndUIRebuild(); // Викликаємо debounced оновлення
            }
        };
        // Обробник для rename
        const handleFileRename = (file, oldPath) => {
            if (!file || !this.chatManager || !this.settings.chatHistoryFolderPath)
                return;
            const historyPath = normalizePath(this.settings.chatHistoryFolderPath);
            // Перевіряємо, чи старий АБО новий шлях знаходиться всередині папки історії
            const isInHistoryNew = file.path.startsWith(historyPath + "/");
            const isInHistoryOld = oldPath.startsWith(historyPath + "/");
            // Реагуємо, тільки якщо зміна стосується файлів/папок ВСЕРЕДИНІ папки історії
            if ((isInHistoryNew || isInHistoryOld) && file.path !== historyPath && oldPath !== historyPath) {
                this.debouncedIndexAndUIRebuild();
            }
        };
        // Реєструємо події
        this.registerEvent(this.app.vault.on("create", handleFileCreateDelete));
        this.registerEvent(this.app.vault.on("delete", handleFileCreateDelete));
        this.registerEvent(this.app.vault.on("rename", handleFileRename));
    }
    // --- Логіка файлу завдань ---
    updateDailyTaskFilePath() {
        var _a, _b, _c;
        const folderPath = (_a = this.settings.ragFolderPath) === null || _a === void 0 ? void 0 : _a.trim();
        const fileName = (_b = this.settings.dailyTaskFileName) === null || _b === void 0 ? void 0 : _b.trim();
        const newPath = folderPath && fileName ? normalizePath(`${folderPath}/${fileName}`) : null;
        if (newPath !== this.dailyTaskFilePath) {
            this.dailyTaskFilePath = newPath;
            this.taskFileContentCache = null;
            this.taskFileNeedsUpdate = true;
        }
        else if (!newPath && this.dailyTaskFilePath !== null) {
            this.dailyTaskFilePath = null;
            this.taskFileContentCache = null;
            (_c = this.chatManager) === null || _c === void 0 ? void 0 : _c.updateTaskState(null);
            this.taskFileNeedsUpdate = false;
        }
    }
    handleTaskFileModify(file) {
        if (this.settings.enableProductivityFeatures && file.path === this.dailyTaskFilePath) {
            if (!this.taskFileNeedsUpdate) {
                this.taskFileNeedsUpdate = true;
            }
        }
    }
    loadAndProcessInitialTasks() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            if (!this.settings.enableProductivityFeatures || !this.dailyTaskFilePath) {
                if (this.taskFileContentCache !== null) {
                    this.taskFileContentCache = null;
                    (_a = this.chatManager) === null || _a === void 0 ? void 0 : _a.updateTaskState(null);
                }
                this.taskFileNeedsUpdate = false;
                return;
            }
            try {
                const fileExists = yield this.app.vault.adapter.exists(this.dailyTaskFilePath);
                if (fileExists) {
                    const content = yield this.app.vault.adapter.read(this.dailyTaskFilePath);
                    if (content !== this.taskFileContentCache || this.taskFileContentCache === null) {
                        this.taskFileContentCache = content;
                        const tasks = this.parseTasks(content);
                        (_b = this.chatManager) === null || _b === void 0 ? void 0 : _b.updateTaskState(tasks);
                        this.taskFileNeedsUpdate = false;
                    }
                    else {
                        this.taskFileNeedsUpdate = false;
                    }
                }
                else {
                    if (this.taskFileContentCache !== null) {
                        this.taskFileContentCache = null;
                        (_c = this.chatManager) === null || _c === void 0 ? void 0 : _c.updateTaskState(null);
                    }
                    this.taskFileNeedsUpdate = false;
                }
            }
            catch (error) {
                if (this.taskFileContentCache !== null) {
                    this.taskFileContentCache = null;
                    (_d = this.chatManager) === null || _d === void 0 ? void 0 : _d.updateTaskState(null);
                }
                this.taskFileNeedsUpdate = false;
            }
        });
    }
    parseTasks(content) {
        const lines = content.split("\n");
        const urgent = [];
        const regular = [];
        let hasContent = false;
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine)
                continue;
            hasContent = true;
            if (trimmedLine.startsWith("- [x]") || trimmedLine.startsWith("- [X]"))
                continue;
            let taskText = trimmedLine;
            let isUrgent = false;
            if (taskText.startsWith("!") || taskText.toLowerCase().includes("[urgent]")) {
                isUrgent = true;
                taskText = taskText
                    .replace(/^!/, "")
                    .replace(/\[urgent\]/i, "")
                    .trim();
            }
            if (taskText.startsWith("- [ ]")) {
                taskText = taskText.substring(taskText.indexOf("]") + 1).trim();
            }
            else if (taskText.startsWith("- ")) {
                taskText = taskText.substring(1).trim();
            }
            if (taskText.length > 0) {
                if (isUrgent) {
                    urgent.push(taskText);
                }
                else {
                    regular.push(taskText);
                }
            }
        }
        const hasActualTasks = urgent.length > 0 || regular.length > 0;
        return { urgent: urgent, regular: regular, hasContent: hasActualTasks };
    }
    checkAndProcessTaskUpdate() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.taskFileNeedsUpdate && this.settings.enableProductivityFeatures) {
                yield this.loadAndProcessInitialTasks();
            }
            else {
                //
            }
        });
    }
    // --- Кінець логіки файлу завдань ---
    // Обробник змін для ролей та RAG
    handleRoleOrRagFileChange(changedPath, debouncedRoleClear, isDeletion = false) {
        const normPath = normalizePath(changedPath);
        // 1. Перевірка для Ролей
        const userRolesPath = this.settings.userRolesFolderPath ? normalizePath(this.settings.userRolesFolderPath) : null;
        const builtInRolesPath = this.manifest.dir ? normalizePath(`${this.manifest.dir}/roles`) : null;
        let isRoleFile = false;
        if (normPath.toLowerCase().endsWith(".md")) {
            if (userRolesPath && normPath.startsWith(userRolesPath + "/")) {
                if (normPath.substring(userRolesPath.length + 1).indexOf("/") === -1) {
                    isRoleFile = true;
                }
            }
            else if (builtInRolesPath && normPath.startsWith(builtInRolesPath + "/")) {
                if (normPath.substring(builtInRolesPath.length + 1).indexOf("/") === -1) {
                    isRoleFile = true;
                }
            }
        }
        // Також реагуємо на зміну/видалення самої папки ролей
        if (userRolesPath && normPath === userRolesPath) {
            isRoleFile = true; // Treat folder change as needing a role refresh
        }
        if (isRoleFile) {
            debouncedRoleClear();
        }
        // 2. Перевірка для RAG
        const ragFolderPath = this.settings.ragFolderPath ? normalizePath(this.settings.ragFolderPath) : null;
        if (this.settings.ragEnabled &&
            ragFolderPath &&
            (normPath.startsWith(ragFolderPath + "/") || normPath === ragFolderPath)) {
            if (normPath !== this.dailyTaskFilePath) {
                // Не індексуємо файл завдань автоматично
                this.debounceIndexUpdate();
            }
            else {
            }
        }
    }
    onunload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.app.workspace.getLeavesOfType(VIEW_TYPE_OLLAMA_PERSONAS).forEach(l => l.detach());
            this.view = null; // Скидаємо посилання на view
            if (this.indexUpdateTimeout)
                clearTimeout(this.indexUpdateTimeout);
            if (this.roleCacheClearTimeout)
                clearTimeout(this.roleCacheClearTimeout);
            if (this.taskCheckInterval)
                clearInterval(this.taskCheckInterval);
            // Очищення обробників подій
            this.eventHandlers = {};
            try {
                if (this.chatManager && this.settings.saveMessageHistory) {
                    const lastActiveId = this.chatManager.getActiveChatId();
                    if (lastActiveId !== undefined && lastActiveId !== null) {
                        yield this.saveDataKey(ACTIVE_CHAT_ID_KEY, lastActiveId);
                    }
                    else {
                        yield this.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
                    }
                }
                else {
                    yield this.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
                }
            }
            catch (error) { }
        });
    }
    updateOllamaServiceConfig() {
        var _a;
        if (this.ollamaService) {
            // Тут має бути логіка, що передає нові налаштування (наприклад, URL) в OllamaService
            // this.ollamaService.updateConfig({ baseUrl: this.settings.ollamaUrl }); // Приклад
            (_a = this.promptService) === null || _a === void 0 ? void 0 : _a.clearModelDetailsCache();
        }
    }
    debounceIndexUpdate() {
        if (this.indexUpdateTimeout)
            clearTimeout(this.indexUpdateTimeout);
        this.indexUpdateTimeout = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            if (this.settings.ragEnabled && this.ragService) {
                yield this.ragService.indexDocuments();
            }
            else {
            }
            this.indexUpdateTimeout = null;
        }), 30000); // 30 секунд затримки
    }
    activateView() {
        return __awaiter(this, void 0, void 0, function* () {
            const { workspace } = this.app;
            let leaf = null;
            const viewType = VIEW_TYPE_OLLAMA_PERSONAS;
            const existingLeaves = workspace.getLeavesOfType(viewType);
            if (existingLeaves.length > 0) {
                leaf = existingLeaves[0];
            }
            else {
                if (this.settings.openChatInTab) {
                    leaf = workspace.getLeaf("tab");
                }
                else {
                    leaf = workspace.getRightLeaf(false);
                    if (!leaf) {
                        leaf = workspace.getLeaf("tab");
                    }
                    else {
                    }
                }
                if (leaf) {
                    try {
                        yield leaf.setViewState({ type: viewType, active: true });
                    }
                    catch (e) {
                        new Notice("Error opening AI Forge view.");
                        return;
                    }
                }
                else {
                    new Notice("Could not open AI Forge view.");
                    return;
                }
            }
            if (leaf) {
                workspace.revealLeaf(leaf);
                setTimeout(() => {
                    if (leaf && leaf.view instanceof OllamaView) {
                        this.view = leaf.view;
                        this.emit("focus-input-request");
                    }
                    else {
                        this.view = null;
                    }
                }, 50);
            }
        });
    }
    loadSettingsAndMigrate() {
        return __awaiter(this, void 0, void 0, function* () {
            const loadedData = yield this.loadData();
            this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
            this.updateOllamaServiceConfig();
            this.updateDailyTaskFilePath();
        });
    }
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
            this.emit("settings-updated");
        });
    }
    saveDataKey(key, value) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const data = (yield this.loadData()) || {};
                data[key] = value;
                yield this.saveData(data);
            }
            catch (error) { }
        });
    }
    loadDataKey(key) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const data = (yield this.loadData()) || {};
                const value = data[key];
                return value;
            }
            catch (error) {
                return undefined;
            }
        });
    }
    clearMessageHistoryWithConfirmation() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.chatManager) {
                new Notice("Error: Chat Manager not ready.");
                return;
            }
            const activeChat = yield this.chatManager.getActiveChat();
            if (activeChat && activeChat.messages.length > 0) {
                new ConfirmModal(this.app, "Clear History", `Clear messages in "${activeChat.metadata.name}"?`, () => __awaiter(this, void 0, void 0, function* () {
                    yield this.chatManager.clearActiveChatMessages();
                    new Notice(`History cleared for "${activeChat.metadata.name}".`);
                })).open();
            }
            else if (activeChat) {
                new Notice("Chat history is already empty.");
            }
            else {
                new Notice("No active chat to clear.");
            }
        });
    }
    listRoleFiles() {
        return __awaiter(this, arguments, void 0, function* (forceRefresh = false) {
            if (this.roleListCache && !forceRefresh) {
                return this.roleListCache;
            }
            const roles = [];
            const addedNamesLowerCase = new Set();
            const adapter = this.app.vault.adapter;
            const pluginDir = this.manifest.dir;
            const builtInRoleName = "Productivity Assistant";
            const builtInRoleFileName = "Productivity_Assistant.md";
            let builtInRolePath = null;
            if (pluginDir) {
                builtInRolePath = normalizePath(`${pluginDir}/roles/${builtInRoleFileName}`);
                try {
                    if (yield adapter.exists(builtInRolePath)) {
                        const stat = yield adapter.stat(builtInRolePath);
                        if ((stat === null || stat === void 0 ? void 0 : stat.type) === "file") {
                            roles.push({ name: builtInRoleName, path: builtInRolePath, isCustom: false });
                            addedNamesLowerCase.add(builtInRoleName.toLowerCase());
                        }
                    }
                }
                catch (error) { }
            }
            const userRolesFolderPath = this.settings.userRolesFolderPath
                ? normalizePath(this.settings.userRolesFolderPath)
                : null;
            if (userRolesFolderPath && userRolesFolderPath !== "/") {
                try {
                    const folderExists = yield adapter.exists(userRolesFolderPath);
                    const folderStat = folderExists ? yield adapter.stat(userRolesFolderPath) : null;
                    if ((folderStat === null || folderStat === void 0 ? void 0 : folderStat.type) === "folder") {
                        const listResult = yield adapter.list(userRolesFolderPath);
                        for (const filePath of listResult.files) {
                            if (filePath.toLowerCase().endsWith(".md") &&
                                filePath.substring(userRolesFolderPath.length + 1).indexOf("/") === -1 &&
                                filePath !== builtInRolePath) {
                                const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
                                const roleName = fileName.slice(0, -3);
                                if (!addedNamesLowerCase.has(roleName.toLowerCase())) {
                                    roles.push({ name: roleName, path: filePath, isCustom: true });
                                    addedNamesLowerCase.add(roleName.toLowerCase());
                                }
                                else {
                                }
                            }
                        }
                    }
                }
                catch (e) { }
            }
            roles.sort((a, b) => a.name.localeCompare(b.name));
            this.roleListCache = roles;
            return roles;
        });
    }
    executeSystemCommand(command) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!(command === null || command === void 0 ? void 0 : command.trim())) {
                return { stdout: "", stderr: "Empty command.", error: new Error("Empty command.") };
            }
            //@ts-ignore
            if (typeof process === "undefined" || !((_a = process === null || process === void 0 ? void 0 : process.versions) === null || _a === void 0 ? void 0 : _a.node)) {
                new Notice("Cannot execute system command: Node.js environment is required.");
                return { stdout: "", stderr: "Node.js required.", error: new Error("Node.js required.") };
            }
            return new Promise(resolve => {
                exec(command, (error, stdout, stderr) => {
                    if (error)
                        if (stderr && stderr.trim())
                            resolve({ stdout: stdout.toString(), stderr: stderr.toString(), error: error });
                });
            });
        });
    }
    showChatSwitcher() {
        return __awaiter(this, void 0, void 0, function* () {
            new Notice("Switch Chat UI not implemented yet.");
        });
    }
    renameActiveChat() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.chatManager) {
                new Notice("Error: Chat manager is not ready.");
                return;
            }
            const activeChat = yield this.chatManager.getActiveChat();
            if (!activeChat) {
                new Notice("No active chat to rename.");
                return;
            }
            const currentName = activeChat.metadata.name;
            const chatId = activeChat.metadata.id;
            new PromptModal(this.app, "Rename Chat", `Enter new name for "${currentName}":`, currentName, (newName) => __awaiter(this, void 0, void 0, function* () {
                const trimmedName = newName === null || newName === void 0 ? void 0 : newName.trim();
                if (trimmedName && trimmedName !== "" && trimmedName !== currentName) {
                    const success = yield this.chatManager.renameChat(chatId, trimmedName);
                    if (!success) {
                    }
                }
                else if (newName === null || trimmedName === "") {
                    new Notice("Rename cancelled or invalid name entered.");
                }
                else {
                    new Notice("Name unchanged.");
                }
            })).open();
        });
    }
    deleteActiveChatWithConfirmation() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.chatManager) {
                new Notice("Error: Chat manager is not ready.");
                return;
            }
            const activeChat = yield this.chatManager.getActiveChat();
            if (!activeChat) {
                new Notice("No active chat to delete.");
                return;
            }
            const chatName = activeChat.metadata.name;
            const chatId = activeChat.metadata.id;
            new ConfirmModal(this.app, "Delete Chat", `Are you sure you want to delete chat "${chatName}"?\nThis action cannot be undone.`, () => __awaiter(this, void 0, void 0, function* () {
                const success = yield this.chatManager.deleteChat(chatId);
                if (!success) {
                }
            })).open();
        });
    }
    handleActiveChatChangedLocally(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.settings.saveMessageHistory) {
                yield this.saveDataKey(ACTIVE_CHAT_ID_KEY, data.chatId);
            }
            else {
                yield this.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
            }
        });
    }
    findRoleNameByPath(rolePath) {
        var _a;
        if (!rolePath)
            return "None";
        const cachedRole = (_a = this.roleListCache) === null || _a === void 0 ? void 0 : _a.find(rl => rl.path === rolePath);
        if (cachedRole) {
            return cachedRole.name;
        }
        try {
            const fileName = rolePath.substring(rolePath.lastIndexOf("/") + 1);
            const roleName = fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
            return roleName || "Unknown Role";
        }
        catch (e) {
            return "Unknown Role";
        }
    }
} // END OF OllamaPlugin CLASS
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLGNBQWM7QUFDZCxPQUFPLEVBQ0wsTUFBTSxFQUVOLE1BQU0sRUFDTixhQUFhLEVBQ2IsS0FBSyxFQUNMLE9BQU8sRUFHUCxRQUFRLEdBSVQsTUFBTSxVQUFVLENBQUM7QUFDbEIsT0FBTyxFQUFFLFVBQVUsRUFBRSx5QkFBeUIsRUFBZSxNQUFNLGNBQWMsQ0FBQztBQUNsRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQXdCLE1BQU0sWUFBWSxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDMUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ2hELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUNoRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBRzVDLE9BQU8sRUFBRSxJQUFJLEVBQWlCLE1BQU0sZUFBZSxDQUFDO0FBQ3BELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQzFELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDNUMsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxNQUFNLEVBQTRCLE1BQU0sVUFBVSxDQUFDO0FBQzVELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQyxDQUFDLGlCQUFpQjtBQUN2RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFN0QsbUNBQW1DO0FBQ25DLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLGNBQWMsQ0FBQyxDQUFDLG9CQUFvQjtBQUN0RSxNQUFNLENBQUMsTUFBTSxrQkFBa0IsR0FBRyxpQkFBaUIsQ0FBQyxDQUFDLG9C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QUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDMUQsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNuRCxDQUFDO1FBQ0gsQ0FBQztLQUFBO0lBRUQsa0JBQWtCLENBQUMsUUFBbUM7O1FBQ3BELElBQUksQ0FBQyxRQUFRO1lBQUUsT0FBTyxNQUFNLENBQUM7UUFDN0IsTUFBTSxVQUFVLEdBQUcsTUFBQSxJQUFJLENBQUMsYUFBYSwwQ0FBRSxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDO1FBQ3hFLElBQUksVUFBVSxFQUFFLENBQUM7WUFDZixPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUM7UUFDekIsQ0FBQztRQUVELElBQUksQ0FBQztZQUNILE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNuRSxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7WUFDN0UsT0FBTyxRQUFRLElBQUksY0FBYyxDQUFDO1FBQ3BDLENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1gsT0FBTyxjQUFjLENBQUM7UUFDeEIsQ0FBQztJQUNILENBQUM7Q0FDRixDQUFDLDRCQUE0QiIsInNvdXJjZXNDb250ZW50IjpbIi8vIHNyYy9tYWluLnRzXG5pbXBvcnQge1xuICBQbHVnaW4sXG4gIFdvcmtzcGFjZUxlYWYsXG4gIE5vdGljZSxcbiAgbm9ybWFsaXplUGF0aCxcbiAgVEZpbGUsXG4gIFRGb2xkZXIsXG4gIFRBYnN0cmFjdEZpbGUsXG4gIERhdGFBZGFwdGVyLFxuICBkZWJvdW5jZSxcbiAgU3VnZ2VzdE1vZGFsLFxuICBGdXp6eVN1Z2dlc3RNb2RhbCxcbiAgRXZlbnRSZWYsIC8vINCG0LzQv9C+0YDRgtGD0ZTQvNC+IEV2ZW50UmVmXG59IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHsgT2xsYW1hVmlldywgVklFV19UWVBFX09MTEFNQV9QRVJTT05BUywgTWVzc2FnZVJvbGUgfSBmcm9tIFwiLi9PbGxhbWFWaWV3XCI7XG5pbXBvcnQgeyBPbGxhbWFTZXR0aW5nVGFiLCBERUZBVUxUX1NFVFRJTkdTLCBPbGxhbWFQbHVnaW5TZXR0aW5ncyB9IGZyb20gXCIuL3NldHRpbmdzXCI7XG5pbXBvcnQgeyBSYWdTZXJ2aWNlIH0gZnJvbSBcIi4vcmFnU2VydmljZVwiO1xuaW1wb3J0IHsgT2xsYW1hU2VydmljZSB9IGZyb20gXCIuL09sbGFtYVNlcnZpY2VcIjtcbmltcG9ydCB7IFByb21wdFNlcnZpY2UgfSBmcm9tIFwiLi9Qcm9tcHRTZXJ2aWNlXCI7XG5pbXBvcnQgeyBDaGF0TWFuYWdlciB9IGZyb20gXCIuL0NoYXRNYW5hZ2VyXCI7XG5pbXBvcnQgeyBDaGF0LCBDaGF0TWV0YWRhdGEgfSBmcm9tIFwiLi9DaGF0XCI7XG5pbXBvcnQgeyBSb2xlSW5mbyB9IGZyb20gXCIuL0NoYXRNYW5hZ2VyXCI7XG5pbXBvcnQgeyBleGVjLCBFeGVjRXhjZXB0aW9uIH0gZnJvbSBcImNoaWxkX3Byb2Nlc3NcIjtcbmltcG9ydCB7IFRyYW5zbGF0aW9uU2VydmljZSB9IGZyb20gXCIuL1RyYW5zbGF0aW9uU2VydmljZVwiO1xuaW1wb3J0IHsgUHJvbXB0TW9kYWwgfSBmcm9tIFwiLi9Qcm9tcHRNb2RhbFwiO1xuaW1wb3J0IHsgQ29uZmlybU1vZGFsIH0gZnJvbSBcIi4vQ29uZmlybU1vZGFsXCI7XG5pbXBvcnQgeyBMb2dnZXIsIExvZ0xldmVsLCBMb2dnZXJTZXR0aW5ncyB9IGZyb20gXCIuL0xvZ2dlclwiO1xuaW1wb3J0IHsgQWdlbnRNYW5hZ2VyIH0gZnJvbSBcIi4vYWdlbnRzL0FnZW50TWFuYWdlclwiOyAvLyDQkNC00LDQv9GC0YPQudGC0LUg0YjQu9GP0YVcbmltcG9ydCB7IFNpbXBsZUZpbGVBZ2VudCB9IGZyb20gXCIuL2V4YW1wbGVzL1NpbXBsZUZpbGVBZ2VudFwiO1xuXG4vLyAtLS0g0JrQntCd0KHQotCQ0J3QotCYINCU0JvQryDQl9CR0JXQoNCV0JbQldCd0J3QryAtLS1cbmV4cG9ydCBjb25zdCBTRVNTSU9OU19JTkRFWF9LRVkgPSBcImNoYXRJbmRleF92MlwiOyAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+IHYyXG5leHBvcnQgY29uc3QgQUNUSVZFX0NIQVRfSURfS0VZID0gXCJhY3RpdmVDaGF0SWRfdjJcIjsgLy8g0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviB2MlxuZXhwb3J0IGNvbnN0IENIQVRfSU5ERVhfS0VZID0gXCJjaGF0SW5kZXhfdjJcIjsgLy8g0KHQuNC90L7QvdGW0Lwg0LTQu9GPINGP0YHQvdC+0YHRgtGWXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBSQUdEb2N1bWVudCB7XG4gIGlkOiBzdHJpbmc7XG4gIGNvbnRlbnQ6IHN0cmluZztcbiAgbWV0YWRhdGE6IHsgc291cmNlOiBzdHJpbmc7IHBhdGg6IHN0cmluZyB9O1xufVxuaW50ZXJmYWNlIEVtYmVkZGluZyB7XG4gIGRvY3VtZW50SWQ6IHN0cmluZztcbiAgdmVjdG9yOiBudW1iZXJbXTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgT2xsYW1hUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgc2V0dGluZ3M6IE9sbGFtYVBsdWdpblNldHRpbmdzO1xuICBzZXR0aW5nVGFiOiBPbGxhbWFTZXR0aW5nVGFiO1xuICB2aWV3OiBPbGxhbWFWaWV3IHwgbnVsbCA9IG51bGw7XG5cbiAgcmFnU2VydmljZSE6IFJhZ1NlcnZpY2U7XG4gIGFnZW50TWFuYWdlciE6IEFnZW50TWFuYWdlcjsgXG4gIG9sbGFtYVNlcnZpY2UhOiBPbGxhbWFTZXJ2aWNlO1xuICBwcm9tcHRTZXJ2aWNlITogUHJvbXB0U2VydmljZTtcbiAgY2hhdE1hbmFnZXIhOiBDaGF0TWFuYWdlcjtcbiAgdHJhbnNsYXRpb25TZXJ2aWNlITogVHJhbnNsYXRpb25TZXJ2aWNlO1xuICBsb2dnZXIhOiBMb2dnZXI7XG5cbiAgcHJpdmF0ZSBldmVudEhhbmRsZXJzOiBSZWNvcmQ8c3RyaW5nLCBBcnJheTwoZGF0YTogYW55KSA9PiBhbnk+PiA9IHt9O1xuICBwcml2YXRlIHJvbGVMaXN0Q2FjaGU6IFJvbGVJbmZvW10gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSByb2xlQ2FjaGVDbGVhclRpbWVvdXQ6IE5vZGVKUy5UaW1lb3V0IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgaW5kZXhVcGRhdGVUaW1lb3V0OiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXG4gIHByaXZhdGUgZGFpbHlUYXNrRmlsZVBhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHRhc2tGaWxlQ29udGVudENhY2hlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSB0YXNrRmlsZU5lZWRzVXBkYXRlOiBib29sZWFuID0gZmFsc2U7XG4gIHByaXZhdGUgdGFza0NoZWNrSW50ZXJ2YWw6IE5vZGVKUy5UaW1lb3V0IHwgbnVsbCA9IG51bGw7XG5cbiAgLy8gRGVib3VuY2VkINGE0YPQvdC60YbRltGPINC+0L3QvtCy0LvQtdC90L3RjyDQtNC70Y8gVmF1bHQgRXZlbnRzXG4gIHByaXZhdGUgZGVib3VuY2VkSW5kZXhBbmRVSVJlYnVpbGQgPSBkZWJvdW5jZShcbiAgICBhc3luYyAoKSA9PiB7XG4gICAgICBcbiAgICAgIGlmICh0aGlzLmNoYXRNYW5hZ2VyKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuY2hhdE1hbmFnZXIucmVidWlsZEluZGV4RnJvbUZpbGVzKCk7XG4gICAgICAgICAgICAgICAgLy8gdGhpcy5lbWl0KFwiY2hhdC1saXN0LXVwZGF0ZWRcIik7XG4gICAgICB9XG4gICAgfSxcbiAgICAxNTAwLFxuICAgIHRydWVcbiAgKTtcblxuICAvLyAtLS0gRXZlbnQgRW1pdHRlciBNZXRob2RzIC0tLVxuICBwdWJsaWMgb24oZXZlbnQ6IHN0cmluZywgY2FsbGJhY2s6IChkYXRhOiBhbnkpID0+IGFueSk6ICgpID0+IHZvaWQge1xuICAgIGlmICghdGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XSkgdGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XSA9IFtdO1xuICAgIHRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF0ucHVzaChjYWxsYmFjayk7XG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgIHRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF0gPSB0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdPy5maWx0ZXIoaCA9PiBoICE9PSBjYWxsYmFjayk7XG4gICAgICBpZiAodGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XT8ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdO1xuICAgICAgfVxuICAgIH07XG4gIH1cblxuICBwdWJsaWMgZW1pdChldmVudDogc3RyaW5nLCBkYXRhPzogYW55KTogdm9pZCB7XG4gICAgY29uc3QgaGFuZGxlcnMgPSB0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdO1xuICAgIGlmIChoYW5kbGVycykge1xuICAgICAgaGFuZGxlcnMuc2xpY2UoKS5mb3JFYWNoKGhhbmRsZXIgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGhhbmRsZXIoZGF0YSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICBwdWJsaWMgaXNUYXNrRmlsZVVwZGF0ZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMudGFza0ZpbGVOZWVkc1VwZGF0ZTtcbiAgfVxuXG4gIC8vIHNyYy9tYWluLnRzXG5cbiAgYXN5bmMgb25sb2FkKCkge1xuICAgIGNvbnN0IGluaXRpYWxTZXR0aW5nc0RhdGEgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xuXG4gICAgLy8gLS0tINCG0L3RltGG0ZbQsNC70ZbQt9Cw0YbRltGPINCb0L7Qs9C10YDQsCAtLS1cbiAgICBjb25zdCBsb2dnZXJTZXR0aW5nczogTG9nZ2VyU2V0dGluZ3MgPSB7XG4gICAgICAvLyDQktC40LfQvdCw0YfQsNGU0LzQviDRgNGW0LLQtdC90Ywg0LvQvtCz0YPQstCw0L3QvdGPINC00LvRjyDQutC+0L3RgdC+0LvRliDQt9Cw0LvQtdC20L3QviDQstGW0LQg0YHQtdGA0LXQtNC+0LLQuNGJ0LBcbiAgICAgIGNvbnNvbGVMb2dMZXZlbDogcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09IFwicHJvZHVjdGlvblwiID8gaW5pdGlhbFNldHRpbmdzRGF0YS5jb25zb2xlTG9nTGV2ZWwgfHwgXCJJTkZPXCIgOiBcIkRFQlVHXCIsXG4gICAgICBmaWxlTG9nZ2luZ0VuYWJsZWQ6IGluaXRpYWxTZXR0aW5nc0RhdGEuZmlsZUxvZ2dpbmdFbmFibGVkLFxuICAgICAgZmlsZUxvZ0xldmVsOiBpbml0aWFsU2V0dGluZ3NEYXRhLmZpbGVMb2dMZXZlbCxcbiAgICAgIGxvZ0NhbGxlckluZm86IGluaXRpYWxTZXR0aW5nc0RhdGEubG9nQ2FsbGVySW5mbyxcbiAgICAgIGxvZ0ZpbGVQYXRoOiBpbml0aWFsU2V0dGluZ3NEYXRhLmxvZ0ZpbGVQYXRoLFxuICAgICAgbG9nRmlsZU1heFNpemVNQjogaW5pdGlhbFNldHRpbmdzRGF0YS5sb2dGaWxlTWF4U2l6ZU1CLFxuICAgIH07XG4gICAgdGhpcy5sb2dnZXIgPSBuZXcgTG9nZ2VyKHRoaXMsIGxvZ2dlclNldHRpbmdzKTtcbiAgICAvLyAtLS1cblxuICAgIC8vINCX0LDQstCw0L3RgtCw0LbRg9GU0LzQviDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8g0YLQsCDQstC40LrQvtC90YPRlNC80L4g0LzRltCz0YDQsNGG0ZbRjiwg0Y/QutGJ0L4g0L/QvtGC0YDRltCx0L3QvlxuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzQW5kTWlncmF0ZSgpO1xuXG4gICAgLy8g0IbQvdGW0YbRltCw0LvRltC30YPRlNC80L4g0YHQtdGA0LLRltGB0LhcbiAgICB0aGlzLnByb21wdFNlcnZpY2UgPSBuZXcgUHJvbXB0U2VydmljZSh0aGlzKTtcbiAgICB0aGlzLm9sbGFtYVNlcnZpY2UgPSBuZXcgT2xsYW1hU2VydmljZSh0aGlzKTtcbiAgICB0aGlzLnRyYW5zbGF0aW9uU2VydmljZSA9IG5ldyBUcmFuc2xhdGlvblNlcnZpY2UodGhpcyk7XG4gICAgdGhpcy5yYWdTZXJ2aWNlID0gbmV3IFJhZ1NlcnZpY2UodGhpcyk7XG4gICAgdGhpcy5jaGF0TWFuYWdlciA9IG5ldyBDaGF0TWFuYWdlcih0aGlzKTtcblxuXG4gICAgdGhpcy5hZ2VudE1hbmFnZXIgPSBuZXcgQWdlbnRNYW5hZ2VyKHRoaXMpOyAvLyA8LS0tINCG0J3QhtCm0IbQkNCb0IbQl9CQ0KbQhtCvXG4gICAgLy8g0KLRg9GCINC80L7QttC90LAg0LfQsNGA0LXRlNGB0YLRgNGD0LLQsNGC0Lgg0L/QvtGH0LDRgtC60L7QstC40YUg0LDQs9C10L3RgtGW0LIsINGP0LrRidC+INCy0L7QvdC4INGUXG4gICAgdGhpcy5hZ2VudE1hbmFnZXIucmVnaXN0ZXJBZ2VudChuZXcgU2ltcGxlRmlsZUFnZW50KCkpO1xuXG4gICAgLy8g0IbQvdGW0YbRltCw0LvRltC30YPRlNC80L4g0LzQtdC90LXQtNC20LXRgCDRh9Cw0YLRltCyICjQt9Cw0LLQsNC90YLQsNC20YPRlCDRltC90LTQtdC60YEsINCy0ZbQtNC90L7QstC70Y7RlCDQsNC60YLQuNCy0L3QuNC5INGH0LDRgilcbiAgICBhd2FpdCB0aGlzLmNoYXRNYW5hZ2VyLmluaXRpYWxpemUoKTtcbiAgICBcbiAgICAvLyDQntC90L7QstC70Y7RlNC80L4g0L3QsNC70LDRiNGC0YPQstCw0L3QvdGPINC70L7Qs9C10YDQsCDRgNC10LDQu9GM0L3QuNC80Lgg0LfQvdCw0YfQtdC90L3Rj9C80Lgg0L/RltGB0LvRjyDQt9Cw0LLQsNC90YLQsNC20LXQvdC90Y9cbiAgICB0aGlzLmxvZ2dlci51cGRhdGVTZXR0aW5ncyh7XG4gICAgICBjb25zb2xlTG9nTGV2ZWw6IHRoaXMuc2V0dGluZ3MuY29uc29sZUxvZ0xldmVsLFxuICAgICAgZmlsZUxvZ2dpbmdFbmFibGVkOiB0aGlzLnNldHRpbmdzLmZpbGVMb2dnaW5nRW5hYmxlZCxcbiAgICAgIGZpbGVMb2dMZXZlbDogdGhpcy5zZXR0aW5ncy5maWxlTG9nTGV2ZWwsXG4gICAgICBsb2dDYWxsZXJJbmZvOiB0aGlzLnNldHRpbmdzLmxvZ0NhbGxlckluZm8sXG4gICAgICBsb2dGaWxlUGF0aDogdGhpcy5zZXR0aW5ncy5sb2dGaWxlUGF0aCxcbiAgICAgIGxvZ0ZpbGVNYXhTaXplTUI6IHRoaXMuc2V0dGluZ3MubG9nRmlsZU1heFNpemVNQixcbiAgICB9KTtcblxuICAgIC8vINCg0LXRlNGB0YLRgNGD0ZTQvNC+IFZpZXcg0L/Qu9Cw0LPRltC90LBcbiAgICB0aGlzLnJlZ2lzdGVyVmlldyhWSUVXX1RZUEVfT0xMQU1BX1BFUlNPTkFTLCBsZWFmID0+IHtcbiAgICAgICAgICAgIHRoaXMudmlldyA9IG5ldyBPbGxhbWFWaWV3KGxlYWYsIHRoaXMpO1xuICAgICAgcmV0dXJuIHRoaXMudmlldztcbiAgICB9KTtcblxuICAgIC8vINCe0LHRgNC+0LHQutCwINC/0L7QvNC40LvQvtC6INC3J9GU0LTQvdCw0L3QvdGPINC3IE9sbGFtYSBTZXJ2aWNlXG4gICAgdGhpcy5vbGxhbWFTZXJ2aWNlLm9uKFwiY29ubmVjdGlvbi1lcnJvclwiLCBlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgLy8g0JPQtdC90LXRgNGD0ZTQvNC+INC/0L7QtNGW0Y4g0L/Qu9Cw0LPRltC90LAg0L/RgNC+INC/0L7QvNC40LvQutGDINC3J9GU0LTQvdCw0L3QvdGPXG4gICAgICAgIHRoaXMuZW1pdChcIm9sbGFtYS1jb25uZWN0aW9uLWVycm9yXCIsIGVycm9yLm1lc3NhZ2UgfHwgXCJVbmtub3duIGNvbm5lY3Rpb24gZXJyb3JcIik7XG4gICAgfSk7XG5cbiAgICAvLyDQoNC10ZTRgdGC0YDQsNGG0ZbRjyDQvtCx0YDQvtCx0L3QuNC60ZbQsiDQstC90YPRgtGA0ZbRiNC90ZbRhSDQv9C+0LTRltC5INC/0LvQsNCz0ZbQvdCwXG4gICAgdGhpcy5yZWdpc3RlcihcbiAgICAgIHRoaXMub24oXCJvbGxhbWEtY29ubmVjdGlvbi1lcnJvclwiLCBhc3luYyAobWVzc2FnZTogc3RyaW5nKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLmNoYXRNYW5hZ2VyKSB7XG4gICAgICAgICAgLy8g0JTQvtC00LDRlNC80L4g0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINC/0YDQviDQv9C+0LzQuNC70LrRgyDQtNC+INCw0LrRgtC40LLQvdC+0LPQviDRh9Cw0YLRg1xuICAgICAgICAgIGF3YWl0IHRoaXMuY2hhdE1hbmFnZXIuYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdChcImVycm9yXCIsIGBPbGxhbWEgQ29ubmVjdGlvbiBFcnJvcjogJHttZXNzYWdlfWAsIG5ldyBEYXRlKCkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vINCv0LrRidC+IENoYXRNYW5hZ2VyINGJ0LUg0L3QtSDQs9C+0YLQvtCy0LjQuSwg0L/QvtC60LDQt9GD0ZTQvNC+INGB0YLQsNC90LTQsNGA0YLQvdC1INC/0L7QstGW0LTQvtC80LvQtdC90L3Rj1xuICAgICAgICAgIG5ldyBOb3RpY2UoYE9sbGFtYSBDb25uZWN0aW9uIEVycm9yOiAke21lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKTtcbiAgICAvLyDQoNC10ZTRgdGC0YDRg9GU0LzQviDQu9C+0LrQsNC70YzQvdC40Lkg0L7QsdGA0L7QsdC90LjQuiDQtNC70Y8g0LfQsdC10YDQtdC20LXQvdC90Y8gSUQg0LDQutGC0LjQstC90L7Qs9C+INGH0LDRgtGDXG4gICAgdGhpcy5yZWdpc3Rlcih0aGlzLm9uKFwiYWN0aXZlLWNoYXQtY2hhbmdlZFwiLCB0aGlzLmhhbmRsZUFjdGl2ZUNoYXRDaGFuZ2VkTG9jYWxseS5iaW5kKHRoaXMpKSk7XG4gICAgLy8g0KDQtdGU0YHRgtGA0YPRlNC80L4g0L7QsdGA0L7QsdC90LjQuiDQtNC70Y8g0L7QvdC+0LLQu9C10L3QvdGPINC90LDQu9Cw0YjRgtGD0LLQsNC90YxcbiAgICB0aGlzLnJlZ2lzdGVyKFxuICAgICAgdGhpcy5vbihcInNldHRpbmdzLXVwZGF0ZWRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIC8vINCe0L3QvtCy0LvRjtGU0LzQviDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8g0LvQvtCz0LXRgNCwXG4gICAgICAgIHRoaXMubG9nZ2VyLnVwZGF0ZVNldHRpbmdzKHtcbiAgICAgICAgICAgIGNvbnNvbGVMb2dMZXZlbDogdGhpcy5zZXR0aW5ncy5jb25zb2xlTG9nTGV2ZWwsXG4gICAgICAgICAgICBmaWxlTG9nZ2luZ0VuYWJsZWQ6IHRoaXMuc2V0dGluZ3MuZmlsZUxvZ2dpbmdFbmFibGVkLFxuICAgICAgICAgICAgZmlsZUxvZ0xldmVsOiB0aGlzLnNldHRpbmdzLmZpbGVMb2dMZXZlbCxcbiAgICAgICAgICAgIGxvZ0NhbGxlckluZm86IHRoaXMuc2V0dGluZ3MubG9nQ2FsbGVySW5mbyxcbiAgICAgICAgICAgIGxvZ0ZpbGVQYXRoOiB0aGlzLnNldHRpbmdzLmxvZ0ZpbGVQYXRoLFxuICAgICAgICAgICAgbG9nRmlsZU1heFNpemVNQjogdGhpcy5zZXR0aW5ncy5sb2dGaWxlTWF4U2l6ZU1CLFxuICAgICAgICAgfSk7XG4gICAgICAgIC8vINCe0L3QvtCy0LvRjtGU0LzQviDRiNC70Y/RhSDQtNC+INGE0LDQudC70YMg0LfQsNCy0LTQsNC90Ywg0YLQsCDQt9Cw0LLQsNC90YLQsNC20YPRlNC80L4g0ZfRhVxuICAgICAgICB0aGlzLnVwZGF0ZURhaWx5VGFza0ZpbGVQYXRoKCk7XG4gICAgICAgIHRoaXMubG9hZEFuZFByb2Nlc3NJbml0aWFsVGFza3MoKTsgLy8g0J3QtSDQsdC70L7QutGD0ZTQvNC+INC/0L7RgtGW0LosINGF0LDQuSDQv9GA0LDRhtGO0ZQg0LDRgdC40L3RhdGA0L7QvdC90L5cbiAgICAgICAgLy8g0J7QvdC+0LLQu9GO0ZTQvNC+INC60L7QvdGE0ZbQs9GD0YDQsNGG0ZbRjiBPbGxhbWEgU2VydmljZSAo0L3QsNC/0YAuLCBVUkwpXG4gICAgICAgIHRoaXMudXBkYXRlT2xsYW1hU2VydmljZUNvbmZpZygpO1xuICAgICAgICAvLyDQodC60LjQtNCw0ZTQvNC+INC60LXRiCDRgNC+0LvQtdC5INGC0LAg0YHQv9C+0LLRltGJ0LDRlNC80L4g0L/RgNC+INGX0YUg0L7QvdC+0LLQu9C10L3QvdGPXG4gICAgICAgIHRoaXMucm9sZUxpc3RDYWNoZSA9IG51bGw7XG4gICAgICAgIHRoaXMucHJvbXB0U2VydmljZT8uY2xlYXJSb2xlQ2FjaGU/LigpO1xuICAgICAgICB0aGlzLmVtaXQoXCJyb2xlcy11cGRhdGVkXCIpO1xuICAgICAgICAvLyDQodC/0L7QstGW0YnQsNGU0LzQviBWaWV3INC/0YDQviDQvtC90L7QstC70LXQvdC90Y8g0L3QsNC70LDRiNGC0YPQstCw0L3RjFxuICAgICAgICB0aGlzLnZpZXc/LmhhbmRsZVNldHRpbmdzVXBkYXRlZD8uKCk7XG4gICAgICB9KVxuICAgICk7XG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgLy8gLS0tINCU0L7QtNCw0LLQsNC90L3RjyDRgdGC0YDRltGH0LrQuCAoUmliYm9uKSDRgtCwINC60L7QvNCw0L3QtCAtLS1cbiAgICB0aGlzLmFkZFJpYmJvbkljb24oXCJicmFpbi1jaXJjdWl0XCIsIFwiT3BlbiBBSSBGb3JnZSBDaGF0XCIsICgpID0+IHtcbiAgICAgIHRoaXMuYWN0aXZhdGVWaWV3KCk7XG4gICAgfSk7XG4gICAgLy8g0JrQvtC80LDQvdC00LAg0LTQu9GPINCy0ZbQtNC60YDQuNGC0YLRjyDRh9Cw0YLRg1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJvcGVuLWNoYXQtdmlld1wiLFxuICAgICAgbmFtZTogXCJPcGVuIEFJIEZvcmdlIENoYXRcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XG4gICAgICAgIHRoaXMuYWN0aXZhdGVWaWV3KCk7XG4gICAgICB9LFxuICAgIH0pO1xuICAgIC8vINCa0L7QvNCw0L3QtNCwINC00LvRjyDRltC90LTQtdC60YHQsNGG0ZbRlyBSQUdcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiaW5kZXgtcmFnLWRvY3VtZW50c1wiLFxuICAgICAgbmFtZTogXCJBSSBGb3JnZTogSW5kZXggZG9jdW1lbnRzIGZvciBSQUdcIixcbiAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLnJhZ0VuYWJsZWQpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucmFnU2VydmljZS5pbmRleERvY3VtZW50cygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIlJBRyBpcyBkaXNhYmxlZCBpbiBzZXR0aW5ncy5cIik7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG4gICAgLy8g0JrQvtC80LDQvdC00LAg0LTQu9GPINC+0YfQuNGJ0LXQvdC90Y8g0ZbRgdGC0L7RgNGW0Zcg0LDQutGC0LjQstC90L7Qs9C+INGH0LDRgtGDXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImNsZWFyLWFjdGl2ZS1jaGF0LWhpc3RvcnlcIixcbiAgICAgIG5hbWU6IFwiQUkgRm9yZ2U6IENsZWFyIEFjdGl2ZSBDaGF0IEhpc3RvcnlcIixcbiAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMuY2xlYXJNZXNzYWdlSGlzdG9yeVdpdGhDb25maXJtYXRpb24oKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgLy8g0JrQvtC80LDQvdC00LAg0LTQu9GPINC+0L3QvtCy0LvQtdC90L3RjyDRgdC/0LjRgdC60YMg0YDQvtC70LXQuVxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJyZWZyZXNoLXJvbGVzXCIsXG4gICAgICBuYW1lOiBcIkFJIEZvcmdlOiBSZWZyZXNoIFJvbGVzIExpc3RcIixcbiAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMubGlzdFJvbGVGaWxlcyh0cnVlKTsgLy8g0J/RgNC40LzRg9GB0L7QstC+INC+0L3QvtCy0LvRjtGU0LzQviDRgdC/0LjRgdC+0LpcbiAgICAgICAgdGhpcy5lbWl0KFwicm9sZXMtdXBkYXRlZFwiKTsgLy8g0KHQv9C+0LLRltGJ0LDRlNC80L4gVUlcbiAgICAgICAgbmV3IE5vdGljZShcIlJvbGUgbGlzdCByZWZyZXNoZWQuXCIpO1xuICAgICAgfSxcbiAgICB9KTtcbiAgICAvLyDQmtC+0LzQsNC90LTQsCDQtNC70Y8g0YHRgtCy0L7RgNC10L3QvdGPINC90L7QstC+0LPQviDRh9Cw0YLRg1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJuZXctY2hhdFwiLFxuICAgICAgbmFtZTogXCJBSSBGb3JnZTogTmV3IENoYXRcIixcbiAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IG5ld0NoYXQgPSBhd2FpdCB0aGlzLmNoYXRNYW5hZ2VyLmNyZWF0ZU5ld0NoYXQoKTtcbiAgICAgICAgaWYgKG5ld0NoYXQpIHtcbiAgICAgICAgICBuZXcgTm90aWNlKGBDcmVhdGVkIG5ldyBjaGF0OiAke25ld0NoYXQubWV0YWRhdGEubmFtZX1gKTtcbiAgICAgICAgICAgLy8g0KTQvtC60YPRgSDQvdCwINC/0L7Qu9C1INCy0LLQvtC00YMg0LzQvtC20LUg0L7QsdGA0L7QsdC70Y/RgtC40YHRjyDRh9C10YDQtdC3INC/0L7QtNGW0Y4gJ2FjdGl2ZS1jaGF0LWNoYW5nZWQnINGDIFZpZXdcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBjcmVhdGUgbmV3IGNoYXQuXCIpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuICAgIC8vINCa0L7QvNCw0L3QtNCwINC00LvRjyDQv9C10YDQtdC80LjQutCw0L3QvdGPINGH0LDRgtGW0LIgKFVJINC90LUg0YDQtdCw0LvRltC30L7QstCw0L3QvilcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwic3dpdGNoLWNoYXRcIixcbiAgICAgIG5hbWU6IFwiQUkgRm9yZ2U6IFN3aXRjaCBDaGF0XCIsXG4gICAgICBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgICBhd2FpdCB0aGlzLnNob3dDaGF0U3dpdGNoZXIoKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgLy8g0JrQvtC80LDQvdC00LAg0LTQu9GPINC/0LXRgNC10LnQvNC10L3Rg9Cy0LDQvdC90Y8g0LDQutGC0LjQstC90L7Qs9C+INGH0LDRgtGDXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInJlbmFtZS1hY3RpdmUtY2hhdFwiLFxuICAgICAgbmFtZTogXCJBSSBGb3JnZTogUmVuYW1lIEFjdGl2ZSBDaGF0XCIsXG4gICAgICBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgICBhd2FpdCB0aGlzLnJlbmFtZUFjdGl2ZUNoYXQoKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgLy8g0JrQvtC80LDQvdC00LAg0LTQu9GPINCy0LjQtNCw0LvQtdC90L3RjyDQsNC60YLQuNCy0L3QvtCz0L4g0YfQsNGC0YNcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiZGVsZXRlLWFjdGl2ZS1jaGF0XCIsXG4gICAgICBuYW1lOiBcIkFJIEZvcmdlOiBEZWxldGUgQWN0aXZlIENoYXRcIixcbiAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlQWN0aXZlQ2hhdFdpdGhDb25maXJtYXRpb24oKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIC8vINCU0L7QtNCw0ZTQvNC+INCy0LrQu9Cw0LTQutGDINC90LDQu9Cw0YjRgtGD0LLQsNC90YxcbiAgICB0aGlzLnNldHRpbmdUYWIgPSBuZXcgT2xsYW1hU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcyk7XG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKHRoaXMuc2V0dGluZ1RhYik7XG5cbiAgICAvLyDQktC40LrQvtC90YPRlNC80L4g0LTRltGXINC/0ZbRgdC70Y8g0YLQvtCz0L4sINGP0Log0YDQvtCx0L7Rh9C40Lkg0L/RgNC+0YHRgtGW0YAg0LPQvtGC0L7QstC40LlcbiAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeShhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAvLyDQkNCy0YLQvtC80LDRgtC40YfQvdCwINGW0L3QtNC10LrRgdCw0YbRltGPIFJBRyDQv9GA0Lgg0YHRgtCw0YDRgtGWLCDRj9C60YnQviDRg9Cy0ZbQvNC60L3QtdC90L5cbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLnJhZ0VuYWJsZWQgJiYgdGhpcy5zZXR0aW5ncy5yYWdBdXRvSW5kZXhPblN0YXJ0dXApIHtcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICB0aGlzLnJhZ1NlcnZpY2U/LmluZGV4RG9jdW1lbnRzKCk7XG4gICAgICAgIH0sIDUwMDApOyAvLyDQl9Cw0L/Rg9GB0LrQsNGU0LzQviDQtyDQvdC10LLQtdC70LjQutC+0Y4g0LfQsNGC0YDQuNC80LrQvtGOXG4gICAgICB9XG4gICAgICAvLyDQodC/0YDQvtCx0LAg0LLRltC00L3QvtCy0LjRgtC4INCw0LrRgtC40LLQvdC40Lkg0YfQsNGCIC0g0YbRjyDQu9C+0LPRltC60LAg0YLQtdC/0LXRgCDQstC40LrQvtC90YPRlNGC0YzRgdGPINCyIGNoYXRNYW5hZ2VyLmluaXRpYWxpemUoKVxuICAgICAgLy8gY29uc3Qgc2F2ZWRBY3RpdmVJZCA9IGF3YWl0IHRoaXMubG9hZERhdGFLZXkoQUNUSVZFX0NIQVRfSURfS0VZKTtcbiAgICAgIC8vIGlmIChzYXZlZEFjdGl2ZUlkICYmIHRoaXMuc2V0dGluZ3Muc2F2ZU1lc3NhZ2VIaXN0b3J5ICYmIHRoaXMuY2hhdE1hbmFnZXIpIHtcbiAgICAgIC8vICAgIGF3YWl0IHRoaXMuY2hhdE1hbmFnZXIuc2V0QWN0aXZlQ2hhdChzYXZlZEFjdGl2ZUlkKTtcbiAgICAgIC8vIH1cbiAgICB9KTtcblxuICAgIC8vIC0tLSDQoNC10ZTRgdGC0YDQsNGG0ZbRjyDRgdC70YPRhdCw0YfRltCyIFZhdWx0INC00LvRjyDQv9Cw0L/QutC4INCn0JDQotCG0JIgLS0tXG4gICAgdGhpcy5yZWdpc3RlclZhdWx0TGlzdGVuZXJzKCk7IC8vINCS0LjQutC70LjQutCw0ZTQvNC+INC80LXRgtC+0LQg0YDQtdGU0YHRgtGA0LDRhtGW0ZdcbiAgICAvLyAtLS1cblxuICAgIC8vIC0tLSDQoNC10ZTRgdGC0YDQsNGG0ZbRjyDRgdC70YPRhdCw0YfRltCyINC00LvRjyDQv9Cw0L/QutC4INCg0J7Qm9CV0Jkg0YLQsCBSQUcgLS0tXG4gICAgLy8g0KbRliDRgdC70YPRhdCw0YfRliDQndCVINC/0L7QstC40L3QvdGWINCy0LjQutC70LjQutCw0YLQuCDQv9C+0LLQvdC40LkgcmVidWlsZCDRltC90LTQtdC60YHRgyDRh9Cw0YLRltCyXG4gICAgY29uc3QgZGVib3VuY2VkUm9sZUNsZWFyID0gZGVib3VuY2UoICgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnJvbGVMaXN0Q2FjaGUgPSBudWxsOyAvLyDQodC60LjQtNCw0ZTQvNC+INC60LXRiCDRgdC/0LjRgdC60YMg0YDQvtC70LXQuVxuICAgICAgICB0aGlzLnByb21wdFNlcnZpY2U/LmNsZWFyUm9sZUNhY2hlPy4oKTsgLy8g0KHQutC40LTQsNGU0LzQviDQutC10Ygg0LrQvtC90YLQtdC90YLRgyDRgNC+0LvQtdC5XG4gICAgICAgIHRoaXMuZW1pdChcInJvbGVzLXVwZGF0ZWRcIik7IC8vINCh0L/QvtCy0ZbRidCw0ZTQvNC+INC/0YDQviDQvdC10L7QsdGF0ZbQtNC90ZbRgdGC0Ywg0L7QvdC+0LLQuNGC0Lgg0YHQv9C40YHQutC4INGA0L7Qu9C10Lkg0LIgVUlcbiAgICAgIH0sIDE1MDAsIHRydWUgKTsgLy8g0JfQsNGC0YDQuNC80LrQsCDRgtCwINC90LXQs9Cw0LnQvdC1INCy0LjQutC+0L3QsNC90L3Rj1xuXG4gICAgLy8g0KHRgtCy0L7RgNGO0ZTQvNC+INC+0LHRgNC+0LHQvdC40LrQuCDQtNC70Y8g0L/QvtC00ZbQuSBWYXVsdCwg0Y/QutGWINGB0YLQvtGB0YPRjtGC0YzRgdGPINGA0L7Qu9C10LkvUkFHXG4gICAgY29uc3QgaGFuZGxlTW9kaWZ5RXZlbnQgPSAoZmlsZTogVEFic3RyYWN0RmlsZSkgPT4ge1xuICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICB0aGlzLmhhbmRsZVJvbGVPclJhZ0ZpbGVDaGFuZ2UoZmlsZS5wYXRoLCBkZWJvdW5jZWRSb2xlQ2xlYXIsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5oYW5kbGVUYXNrRmlsZU1vZGlmeShmaWxlKTsgLy8g0J7QutGA0LXQvNCwINC+0LHRgNC+0LHQutCwINGE0LDQudC70YMg0LfQsNCy0LTQsNC90YxcbiAgICAgIH1cbiAgICB9O1xuICAgIGNvbnN0IGhhbmRsZURlbGV0ZUV2ZW50ID0gKGZpbGU6IFRBYnN0cmFjdEZpbGUpID0+IHtcbiAgICAgIHRoaXMuaGFuZGxlUm9sZU9yUmFnRmlsZUNoYW5nZShmaWxlLnBhdGgsIGRlYm91bmNlZFJvbGVDbGVhciwgdHJ1ZSk7IC8vINCf0L7QvNGW0YfQsNGU0LzQviDRj9C6INCy0LjQtNCw0LvQtdC90L3Rj1xuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMgJiYgZmlsZS5wYXRoID09PSB0aGlzLmRhaWx5VGFza0ZpbGVQYXRoKSB7XG4gICAgICAgICAvLyDQr9C60YnQviDQstC40LTQsNC70LXQvdC+INGE0LDQudC7INC30LDQstC00LDQvdGMXG4gICAgICAgICB0aGlzLmRhaWx5VGFza0ZpbGVQYXRoID0gbnVsbDtcbiAgICAgICAgIHRoaXMudGFza0ZpbGVDb250ZW50Q2FjaGUgPSBudWxsO1xuICAgICAgICAgdGhpcy50YXNrRmlsZU5lZWRzVXBkYXRlID0gZmFsc2U7XG4gICAgICAgICB0aGlzLmNoYXRNYW5hZ2VyPy51cGRhdGVUYXNrU3RhdGUobnVsbCk7IC8vINCh0LrQuNC00LDRlNC80L4g0YHRgtCw0L0g0LfQsNCy0LTQsNC90YxcbiAgICAgIH1cbiAgICB9O1xuICAgIGNvbnN0IGhhbmRsZVJlbmFtZUV2ZW50ID0gKGZpbGU6IFRBYnN0cmFjdEZpbGUsIG9sZFBhdGg6IHN0cmluZykgPT4ge1xuICAgICAgLy8g0KDQtdCw0LPRg9GU0LzQviDRliDQvdCwINC90L7QstC40LksINGWINC90LAg0YHRgtCw0YDQuNC5INGI0LvRj9GFINC00LvRjyDRgNC+0LvQtdC5L1JBR1xuICAgICAgdGhpcy5oYW5kbGVSb2xlT3JSYWdGaWxlQ2hhbmdlKGZpbGUucGF0aCwgZGVib3VuY2VkUm9sZUNsZWFyLCBmYWxzZSk7XG4gICAgICB0aGlzLmhhbmRsZVJvbGVPclJhZ0ZpbGVDaGFuZ2Uob2xkUGF0aCwgZGVib3VuY2VkUm9sZUNsZWFyLCB0cnVlKTtcbiAgICAgIC8vINCe0LHRgNC+0LHQutCwINC/0LXRgNC10LnQvNC10L3Rg9Cy0LDQvdC90Y8g0YTQsNC50LvRgyDQt9Cw0LLQtNCw0L3RjFxuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMpIHtcbiAgICAgICAgaWYgKG9sZFBhdGggPT09IHRoaXMuZGFpbHlUYXNrRmlsZVBhdGgpIHsgLy8g0K/QutGJ0L4g0L/QtdGA0LXQudC80LXQvdC+0LLQsNC90L4g0YTQsNC50Lsg0LfQsNCy0LTQsNC90YxcbiAgICAgICAgICB0aGlzLnVwZGF0ZURhaWx5VGFza0ZpbGVQYXRoKCk7IC8vINCe0L3QvtCy0LvRjtGU0LzQviDRiNC70Y/RhVxuICAgICAgICAgIHRoaXMubG9hZEFuZFByb2Nlc3NJbml0aWFsVGFza3MoKTsgLy8g0J/QtdGA0LXQt9Cw0LLQsNC90YLQsNC20YPRlNC80L4g0LfQsNCy0LTQsNC90L3Rj1xuICAgICAgICB9IGVsc2UgaWYgKGZpbGUucGF0aCA9PT0gdGhpcy5kYWlseVRhc2tGaWxlUGF0aCkgeyAvLyDQr9C60YnQviDRj9C60LjQudGB0Ywg0YTQsNC50Lsg0L/QtdGA0LXQudC80LXQvdC+0LLQsNC90L4g0J3QkCDRhNCw0LnQuyDQt9Cw0LLQtNCw0L3RjFxuICAgICAgICAgIHRoaXMudGFza0ZpbGVOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgdGhpcy5jaGVja0FuZFByb2Nlc3NUYXNrVXBkYXRlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuICAgIGNvbnN0IGhhbmRsZUNyZWF0ZUV2ZW50ID0gKGZpbGU6IFRBYnN0cmFjdEZpbGUpID0+IHtcbiAgICAgICAgLy8g0KbQtdC5ICdjcmVhdGUnINC+0LHRgNC+0LHQu9GP0ZQg0YHRgtCy0L7RgNC10L3QvdGPINGE0LDQudC70ZbQsiDRgNC+0LvQtdC5L1JBR1xuICAgICAgICB0aGlzLmhhbmRsZVJvbGVPclJhZ0ZpbGVDaGFuZ2UoZmlsZS5wYXRoLCBkZWJvdW5jZWRSb2xlQ2xlYXIsIGZhbHNlKTtcbiAgICAgICAgLy8g0J7QsdGA0L7QsdC60LAg0YHRgtCy0L7RgNC10L3QvdGPINGE0LDQudC70YMg0LfQsNCy0LTQsNC90YxcbiAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMgJiYgZmlsZS5wYXRoID09PSB0aGlzLmRhaWx5VGFza0ZpbGVQYXRoKSB7XG4gICAgICAgICAgICB0aGlzLnRhc2tGaWxlTmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5jaGVja0FuZFByb2Nlc3NUYXNrVXBkYXRlKCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8vINCg0LXRlNGB0YLRgNGD0ZTQvNC+INGG0ZYg0L7QutGA0LXQvNGWINC+0LHRgNC+0LHQvdC40LrQuFxuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcIm1vZGlmeVwiLCBoYW5kbGVNb2RpZnlFdmVudCkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcImRlbGV0ZVwiLCBoYW5kbGVEZWxldGVFdmVudCkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcInJlbmFtZVwiLCBoYW5kbGVSZW5hbWVFdmVudCkpO1xuICAgIC8vINCS0LDQttC70LjQstC+OiDQptC10LkgJ2NyZWF0ZScg0L7QsdGA0L7QsdC70Y/RlCDRgNC+0LvRli9SQUcsINCwINGC0L7QuSwg0YnQviDQsiByZWdpc3RlclZhdWx0TGlzdGVuZXJzIC0g0YfQsNGC0LguXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiY3JlYXRlXCIsIGhhbmRsZUNyZWF0ZUV2ZW50KSk7XG4gICAgLy8gLS0tXG5cbiAgICAvLyAtLS0g0JvQvtCz0ZbQutCwINGE0LDQudC70YMg0LfQsNCy0LTQsNC90YwgLS0tXG4gICAgdGhpcy51cGRhdGVEYWlseVRhc2tGaWxlUGF0aCgpOyAvLyDQktC40LfQvdCw0YfQsNGU0LzQviDRiNC70Y/RhSDQtNC+INGE0LDQudC70YMg0LfQsNCy0LTQsNC90YxcbiAgICBhd2FpdCB0aGlzLmxvYWRBbmRQcm9jZXNzSW5pdGlhbFRhc2tzKCk7IC8vINCX0LDQstCw0L3RgtCw0LbRg9GU0LzQviDQv9C+0YfQsNGC0LrQvtCy0LjQuSDRgdGC0LDQvSDQt9Cw0LLQtNCw0L3RjFxuICAgIGlmICh0aGlzLnNldHRpbmdzLmVuYWJsZVByb2R1Y3Rpdml0eUZlYXR1cmVzKSB7XG4gICAgICAvLyDQl9Cw0L/Rg9GB0LrQsNGU0LzQviDQv9C10YDRltC+0LTQuNGH0L3RgyDQv9C10YDQtdCy0ZbRgNC60YMg0L7QvdC+0LLQu9C10L3RjCDRhNCw0LnQu9GDINC30LDQstC00LDQvdGMXG4gICAgICB0aGlzLnRhc2tDaGVja0ludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4gdGhpcy5jaGVja0FuZFByb2Nlc3NUYXNrVXBkYXRlKCksIDUwMDApO1xuICAgICAgdGhpcy5yZWdpc3RlckludGVydmFsKHRoaXMudGFza0NoZWNrSW50ZXJ2YWwgYXMgYW55KTsgLy8g0KDQtdGU0YHRgtGA0YPRlNC80L4g0ZbQvdGC0LXRgNCy0LDQuyDQtNC70Y8g0LDQstGC0L4t0L7Rh9C40YnQtdC90L3Rj1xuICAgIH1cbiAgICAgIH0gLy8gLS0tINC60ZbQvdC10YbRjCBvbmxvYWQgLS0tXG5cbiAgcmVnaXN0ZXJWYXVsdExpc3RlbmVycygpOiB2b2lkIHtcbiAgICAvLyDQntCx0YDQvtCx0L3QuNC6INC00LvRjyBjcmVhdGUg0YLQsCBkZWxldGVcbiAgICBjb25zdCBoYW5kbGVGaWxlQ3JlYXRlRGVsZXRlID0gKGZpbGU6IFRBYnN0cmFjdEZpbGUgfCBudWxsKSA9PiB7XG4gICAgICBpZiAoIWZpbGUgfHwgIXRoaXMuY2hhdE1hbmFnZXIgfHwgIXRoaXMuc2V0dGluZ3MuY2hhdEhpc3RvcnlGb2xkZXJQYXRoKSByZXR1cm47XG4gICAgICBjb25zdCBoaXN0b3J5UGF0aCA9IG5vcm1hbGl6ZVBhdGgodGhpcy5zZXR0aW5ncy5jaGF0SGlzdG9yeUZvbGRlclBhdGgpO1xuICAgICAgLy8g0J/QtdGA0LXQstGW0YDRj9GU0LzQviwg0YfQuCDRhNCw0LnQuyDQt9C90LDRhdC+0LTQuNGC0YzRgdGPINCy0YHQtdGA0LXQtNC40L3RliDQv9Cw0L/QutC4INGW0YHRgtC+0YDRltGXICjQvdC1INGB0LDQvNCwINC/0LDQv9C60LApXG4gICAgICAvLyDRliDRh9C4INGG0LUgSlNPTiDRhNCw0LnQuyAo0LTQu9GPIGNyZWF0ZSkg0LDQsdC+INCx0YPQtNGMLdGP0LrQuNC5INGE0LDQudC7L9C/0LDQv9C60LAgKNC00LvRjyBkZWxldGUpXG4gICAgICAvLyDQktCQ0JbQm9CY0JLQnjog0J/QtdGA0LXQstGW0YDQutCwINC90LAgaGlzdG9yeVBhdGgrJy8nINCz0LDRgNCw0L3RgtGD0ZQsINGJ0L4g0LzQuCDQvdC1INGA0LXQsNCz0YPRlNC80L4g0L3QsCDRgdCw0LzRgyDQv9Cw0L/QutGDINGW0YHRgtC+0YDRltGXXG4gICAgICBpZiAoXG4gICAgICAgIGZpbGUucGF0aC5zdGFydHNXaXRoKGhpc3RvcnlQYXRoICsgXCIvXCIpICYmXG4gICAgICAgIChmaWxlLnBhdGgudG9Mb3dlckNhc2UoKS5lbmRzV2l0aChcIi5qc29uXCIpIHx8IGZpbGUgaW5zdGFuY2VvZiBURm9sZGVyKVxuICAgICAgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kZWJvdW5jZWRJbmRleEFuZFVJUmVidWlsZCgpOyAvLyDQktC40LrQu9C40LrQsNGU0LzQviBkZWJvdW5jZWQg0L7QvdC+0LLQu9C10L3QvdGPXG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vINCe0LHRgNC+0LHQvdC40Log0LTQu9GPIHJlbmFtZVxuICAgIGNvbnN0IGhhbmRsZUZpbGVSZW5hbWUgPSAoZmlsZTogVEFic3RyYWN0RmlsZSB8IG51bGwsIG9sZFBhdGg6IHN0cmluZykgPT4ge1xuICAgICAgaWYgKCFmaWxlIHx8ICF0aGlzLmNoYXRNYW5hZ2VyIHx8ICF0aGlzLnNldHRpbmdzLmNoYXRIaXN0b3J5Rm9sZGVyUGF0aCkgcmV0dXJuO1xuICAgICAgY29uc3QgaGlzdG9yeVBhdGggPSBub3JtYWxpemVQYXRoKHRoaXMuc2V0dGluZ3MuY2hhdEhpc3RvcnlGb2xkZXJQYXRoKTtcbiAgICAgIC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4sINGH0Lgg0YHRgtCw0YDQuNC5INCQ0JHQniDQvdC+0LLQuNC5INGI0LvRj9GFINC30L3QsNGF0L7QtNC40YLRjNGB0Y8g0LLRgdC10YDQtdC00LjQvdGWINC/0LDQv9C60Lgg0ZbRgdGC0L7RgNGW0ZdcbiAgICAgIGNvbnN0IGlzSW5IaXN0b3J5TmV3ID0gZmlsZS5wYXRoLnN0YXJ0c1dpdGgoaGlzdG9yeVBhdGggKyBcIi9cIik7XG4gICAgICBjb25zdCBpc0luSGlzdG9yeU9sZCA9IG9sZFBhdGguc3RhcnRzV2l0aChoaXN0b3J5UGF0aCArIFwiL1wiKTtcblxuICAgICAgLy8g0KDQtdCw0LPRg9GU0LzQviwg0YLRltC70YzQutC4INGP0LrRidC+INC30LzRltC90LAg0YHRgtC+0YHRg9GU0YLRjNGB0Y8g0YTQsNC50LvRltCyL9C/0LDQv9C+0Log0JLQodCV0KDQldCU0JjQndCGINC/0LDQv9C60Lgg0ZbRgdGC0L7RgNGW0ZdcbiAgICAgIGlmICgoaXNJbkhpc3RvcnlOZXcgfHwgaXNJbkhpc3RvcnlPbGQpICYmIGZpbGUucGF0aCAhPT0gaGlzdG9yeVBhdGggJiYgb2xkUGF0aCAhPT0gaGlzdG9yeVBhdGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRlYm91bmNlZEluZGV4QW5kVUlSZWJ1aWxkKCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vINCg0LXRlNGB0YLRgNGD0ZTQvNC+INC/0L7QtNGW0ZdcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oXCJjcmVhdGVcIiwgaGFuZGxlRmlsZUNyZWF0ZURlbGV0ZSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcImRlbGV0ZVwiLCBoYW5kbGVGaWxlQ3JlYXRlRGVsZXRlKSk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwicmVuYW1lXCIsIGhhbmRsZUZpbGVSZW5hbWUpKTtcbiAgfVxuXG4gIC8vIC0tLSDQm9C+0LPRltC60LAg0YTQsNC50LvRgyDQt9Cw0LLQtNCw0L3RjCAtLS1cbiAgdXBkYXRlRGFpbHlUYXNrRmlsZVBhdGgoKTogdm9pZCB7XG4gICAgY29uc3QgZm9sZGVyUGF0aCA9IHRoaXMuc2V0dGluZ3MucmFnRm9sZGVyUGF0aD8udHJpbSgpO1xuICAgIGNvbnN0IGZpbGVOYW1lID0gdGhpcy5zZXR0aW5ncy5kYWlseVRhc2tGaWxlTmFtZT8udHJpbSgpO1xuICAgIGNvbnN0IG5ld1BhdGggPSBmb2xkZXJQYXRoICYmIGZpbGVOYW1lID8gbm9ybWFsaXplUGF0aChgJHtmb2xkZXJQYXRofS8ke2ZpbGVOYW1lfWApIDogbnVsbDtcbiAgICBpZiAobmV3UGF0aCAhPT0gdGhpcy5kYWlseVRhc2tGaWxlUGF0aCkge1xuICAgICAgdGhpcy5kYWlseVRhc2tGaWxlUGF0aCA9IG5ld1BhdGg7XG4gICAgICB0aGlzLnRhc2tGaWxlQ29udGVudENhY2hlID0gbnVsbDtcbiAgICAgIHRoaXMudGFza0ZpbGVOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgfSBlbHNlIGlmICghbmV3UGF0aCAmJiB0aGlzLmRhaWx5VGFza0ZpbGVQYXRoICE9PSBudWxsKSB7XG4gICAgICB0aGlzLmRhaWx5VGFza0ZpbGVQYXRoID0gbnVsbDtcbiAgICAgIHRoaXMudGFza0ZpbGVDb250ZW50Q2FjaGUgPSBudWxsO1xuICAgICAgdGhpcy5jaGF0TWFuYWdlcj8udXBkYXRlVGFza1N0YXRlKG51bGwpO1xuICAgICAgdGhpcy50YXNrRmlsZU5lZWRzVXBkYXRlID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlVGFza0ZpbGVNb2RpZnkoZmlsZTogVEZpbGUpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5lbmFibGVQcm9kdWN0aXZpdHlGZWF0dXJlcyAmJiBmaWxlLnBhdGggPT09IHRoaXMuZGFpbHlUYXNrRmlsZVBhdGgpIHtcbiAgICAgIGlmICghdGhpcy50YXNrRmlsZU5lZWRzVXBkYXRlKSB7XG4gICAgICAgIHRoaXMudGFza0ZpbGVOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbG9hZEFuZFByb2Nlc3NJbml0aWFsVGFza3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmVuYWJsZVByb2R1Y3Rpdml0eUZlYXR1cmVzIHx8ICF0aGlzLmRhaWx5VGFza0ZpbGVQYXRoKSB7XG4gICAgICBpZiAodGhpcy50YXNrRmlsZUNvbnRlbnRDYWNoZSAhPT0gbnVsbCkge1xuICAgICAgICB0aGlzLnRhc2tGaWxlQ29udGVudENhY2hlID0gbnVsbDtcbiAgICAgICAgdGhpcy5jaGF0TWFuYWdlcj8udXBkYXRlVGFza1N0YXRlKG51bGwpO1xuICAgICAgfVxuICAgICAgdGhpcy50YXNrRmlsZU5lZWRzVXBkYXRlID0gZmFsc2U7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZpbGVFeGlzdHMgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmV4aXN0cyh0aGlzLmRhaWx5VGFza0ZpbGVQYXRoKTtcbiAgICAgIGlmIChmaWxlRXhpc3RzKSB7XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLnJlYWQodGhpcy5kYWlseVRhc2tGaWxlUGF0aCk7XG4gICAgICAgIGlmIChjb250ZW50ICE9PSB0aGlzLnRhc2tGaWxlQ29udGVudENhY2hlIHx8IHRoaXMudGFza0ZpbGVDb250ZW50Q2FjaGUgPT09IG51bGwpIHtcbiAgICAgICAgICB0aGlzLnRhc2tGaWxlQ29udGVudENhY2hlID0gY29udGVudDtcbiAgICAgICAgICBjb25zdCB0YXNrcyA9IHRoaXMucGFyc2VUYXNrcyhjb250ZW50KTtcblxuICAgICAgICAgIHRoaXMuY2hhdE1hbmFnZXI/LnVwZGF0ZVRhc2tTdGF0ZSh0YXNrcyk7XG4gICAgICAgICAgdGhpcy50YXNrRmlsZU5lZWRzVXBkYXRlID0gZmFsc2U7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy50YXNrRmlsZU5lZWRzVXBkYXRlID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICh0aGlzLnRhc2tGaWxlQ29udGVudENhY2hlICE9PSBudWxsKSB7XG4gICAgICAgICAgdGhpcy50YXNrRmlsZUNvbnRlbnRDYWNoZSA9IG51bGw7XG4gICAgICAgICAgdGhpcy5jaGF0TWFuYWdlcj8udXBkYXRlVGFza1N0YXRlKG51bGwpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudGFza0ZpbGVOZWVkc1VwZGF0ZSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAodGhpcy50YXNrRmlsZUNvbnRlbnRDYWNoZSAhPT0gbnVsbCkge1xuICAgICAgICB0aGlzLnRhc2tGaWxlQ29udGVudENhY2hlID0gbnVsbDtcbiAgICAgICAgdGhpcy5jaGF0TWFuYWdlcj8udXBkYXRlVGFza1N0YXRlKG51bGwpO1xuICAgICAgfVxuICAgICAgdGhpcy50YXNrRmlsZU5lZWRzVXBkYXRlID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcGFyc2VUYXNrcyhjb250ZW50OiBzdHJpbmcpOiB7IHVyZ2VudDogc3RyaW5nW107IHJlZ3VsYXI6IHN0cmluZ1tdOyBoYXNDb250ZW50OiBib29sZWFuIH0ge1xuICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdChcIlxcblwiKTtcbiAgICBjb25zdCB1cmdlbnQ6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgcmVndWxhcjogc3RyaW5nW10gPSBbXTtcbiAgICBsZXQgaGFzQ29udGVudCA9IGZhbHNlO1xuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgdHJpbW1lZExpbmUgPSBsaW5lLnRyaW0oKTtcbiAgICAgIGlmICghdHJpbW1lZExpbmUpIGNvbnRpbnVlO1xuICAgICAgaGFzQ29udGVudCA9IHRydWU7XG4gICAgICBpZiAodHJpbW1lZExpbmUuc3RhcnRzV2l0aChcIi0gW3hdXCIpIHx8IHRyaW1tZWRMaW5lLnN0YXJ0c1dpdGgoXCItIFtYXVwiKSkgY29udGludWU7XG4gICAgICBsZXQgdGFza1RleHQgPSB0cmltbWVkTGluZTtcbiAgICAgIGxldCBpc1VyZ2VudCA9IGZhbHNlO1xuICAgICAgaWYgKHRhc2tUZXh0LnN0YXJ0c1dpdGgoXCIhXCIpIHx8IHRhc2tUZXh0LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoXCJbdXJnZW50XVwiKSkge1xuICAgICAgICBpc1VyZ2VudCA9IHRydWU7XG4gICAgICAgIHRhc2tUZXh0ID0gdGFza1RleHRcbiAgICAgICAgICAucmVwbGFjZSgvXiEvLCBcIlwiKVxuICAgICAgICAgIC5yZXBsYWNlKC9cXFt1cmdlbnRcXF0vaSwgXCJcIilcbiAgICAgICAgICAudHJpbSgpO1xuICAgICAgfVxuICAgICAgaWYgKHRhc2tUZXh0LnN0YXJ0c1dpdGgoXCItIFsgXVwiKSkge1xuICAgICAgICB0YXNrVGV4dCA9IHRhc2tUZXh0LnN1YnN0cmluZyh0YXNrVGV4dC5pbmRleE9mKFwiXVwiKSArIDEpLnRyaW0oKTtcbiAgICAgIH0gZWxzZSBpZiAodGFza1RleHQuc3RhcnRzV2l0aChcIi0gXCIpKSB7XG4gICAgICAgIHRhc2tUZXh0ID0gdGFza1RleHQuc3Vic3RyaW5nKDEpLnRyaW0oKTtcbiAgICAgIH1cbiAgICAgIGlmICh0YXNrVGV4dC5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmIChpc1VyZ2VudCkge1xuICAgICAgICAgIHVyZ2VudC5wdXNoKHRhc2tUZXh0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZWd1bGFyLnB1c2godGFza1RleHQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGhhc0FjdHVhbFRhc2tzID0gdXJnZW50Lmxlbmd0aCA+IDAgfHwgcmVndWxhci5sZW5ndGggPiAwO1xuICAgIHJldHVybiB7IHVyZ2VudDogdXJnZW50LCByZWd1bGFyOiByZWd1bGFyLCBoYXNDb250ZW50OiBoYXNBY3R1YWxUYXNrcyB9O1xuICB9XG5cbiAgYXN5bmMgY2hlY2tBbmRQcm9jZXNzVGFza1VwZGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy50YXNrRmlsZU5lZWRzVXBkYXRlICYmIHRoaXMuc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMpIHtcbiAgICAgIGF3YWl0IHRoaXMubG9hZEFuZFByb2Nlc3NJbml0aWFsVGFza3MoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy9cbiAgICB9XG4gIH1cbiAgLy8gLS0tINCa0ZbQvdC10YbRjCDQu9C+0LPRltC60Lgg0YTQsNC50LvRgyDQt9Cw0LLQtNCw0L3RjCAtLS1cblxuICAvLyDQntCx0YDQvtCx0L3QuNC6INC30LzRltC9INC00LvRjyDRgNC+0LvQtdC5INGC0LAgUkFHXG4gIHByaXZhdGUgaGFuZGxlUm9sZU9yUmFnRmlsZUNoYW5nZShjaGFuZ2VkUGF0aDogc3RyaW5nLCBkZWJvdW5jZWRSb2xlQ2xlYXI6ICgpID0+IHZvaWQsIGlzRGVsZXRpb246IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIGNvbnN0IG5vcm1QYXRoID0gbm9ybWFsaXplUGF0aChjaGFuZ2VkUGF0aCk7XG5cbiAgICAvLyAxLiDQn9C10YDQtdCy0ZbRgNC60LAg0LTQu9GPINCg0L7Qu9C10LlcbiAgICBjb25zdCB1c2VyUm9sZXNQYXRoID0gdGhpcy5zZXR0aW5ncy51c2VyUm9sZXNGb2xkZXJQYXRoID8gbm9ybWFsaXplUGF0aCh0aGlzLnNldHRpbmdzLnVzZXJSb2xlc0ZvbGRlclBhdGgpIDogbnVsbDtcbiAgICBjb25zdCBidWlsdEluUm9sZXNQYXRoID0gdGhpcy5tYW5pZmVzdC5kaXIgPyBub3JtYWxpemVQYXRoKGAke3RoaXMubWFuaWZlc3QuZGlyfS9yb2xlc2ApIDogbnVsbDtcbiAgICBsZXQgaXNSb2xlRmlsZSA9IGZhbHNlO1xuICAgIGlmIChub3JtUGF0aC50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKFwiLm1kXCIpKSB7XG4gICAgICBpZiAodXNlclJvbGVzUGF0aCAmJiBub3JtUGF0aC5zdGFydHNXaXRoKHVzZXJSb2xlc1BhdGggKyBcIi9cIikpIHtcbiAgICAgICAgaWYgKG5vcm1QYXRoLnN1YnN0cmluZyh1c2VyUm9sZXNQYXRoLmxlbmd0aCArIDEpLmluZGV4T2YoXCIvXCIpID09PSAtMSkge1xuICAgICAgICAgIGlzUm9sZUZpbGUgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGJ1aWx0SW5Sb2xlc1BhdGggJiYgbm9ybVBhdGguc3RhcnRzV2l0aChidWlsdEluUm9sZXNQYXRoICsgXCIvXCIpKSB7XG4gICAgICAgIGlmIChub3JtUGF0aC5zdWJzdHJpbmcoYnVpbHRJblJvbGVzUGF0aC5sZW5ndGggKyAxKS5pbmRleE9mKFwiL1wiKSA9PT0gLTEpIHtcbiAgICAgICAgICBpc1JvbGVGaWxlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyDQotCw0LrQvtC2INGA0LXQsNCz0YPRlNC80L4g0L3QsCDQt9C80ZbQvdGDL9Cy0LjQtNCw0LvQtdC90L3RjyDRgdCw0LzQvtGXINC/0LDQv9C60Lgg0YDQvtC70LXQuVxuICAgIGlmICh1c2VyUm9sZXNQYXRoICYmIG5vcm1QYXRoID09PSB1c2VyUm9sZXNQYXRoKSB7XG4gICAgICBpc1JvbGVGaWxlID0gdHJ1ZTsgLy8gVHJlYXQgZm9sZGVyIGNoYW5nZSBhcyBuZWVkaW5nIGEgcm9sZSByZWZyZXNoXG4gICAgfVxuXG4gICAgaWYgKGlzUm9sZUZpbGUpIHtcbiAgICAgIGRlYm91bmNlZFJvbGVDbGVhcigpO1xuICAgIH1cblxuICAgIC8vIDIuINCf0LXRgNC10LLRltGA0LrQsCDQtNC70Y8gUkFHXG4gICAgY29uc3QgcmFnRm9sZGVyUGF0aCA9IHRoaXMuc2V0dGluZ3MucmFnRm9sZGVyUGF0aCA/IG5vcm1hbGl6ZVBhdGgodGhpcy5zZXR0aW5ncy5yYWdGb2xkZXJQYXRoKSA6IG51bGw7XG4gICAgaWYgKFxuICAgICAgdGhpcy5zZXR0aW5ncy5yYWdFbmFibGVkICYmXG4gICAgICByYWdGb2xkZXJQYXRoICYmXG4gICAgICAobm9ybVBhdGguc3RhcnRzV2l0aChyYWdGb2xkZXJQYXRoICsgXCIvXCIpIHx8IG5vcm1QYXRoID09PSByYWdGb2xkZXJQYXRoKVxuICAgICkge1xuICAgICAgaWYgKG5vcm1QYXRoICE9PSB0aGlzLmRhaWx5VGFza0ZpbGVQYXRoKSB7XG4gICAgICAgIC8vINCd0LUg0ZbQvdC00LXQutGB0YPRlNC80L4g0YTQsNC50Lsg0LfQsNCy0LTQsNC90Ywg0LDQstGC0L7QvNCw0YLQuNGH0L3QvlxuXG4gICAgICAgIHRoaXMuZGVib3VuY2VJbmRleFVwZGF0ZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyBvbnVubG9hZCgpIHtcbiAgICB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFZJRVdfVFlQRV9PTExBTUFfUEVSU09OQVMpLmZvckVhY2gobCA9PiBsLmRldGFjaCgpKTtcbiAgICB0aGlzLnZpZXcgPSBudWxsOyAvLyDQodC60LjQtNCw0ZTQvNC+INC/0L7RgdC40LvQsNC90L3RjyDQvdCwIHZpZXdcblxuICAgIGlmICh0aGlzLmluZGV4VXBkYXRlVGltZW91dCkgY2xlYXJUaW1lb3V0KHRoaXMuaW5kZXhVcGRhdGVUaW1lb3V0KTtcbiAgICBpZiAodGhpcy5yb2xlQ2FjaGVDbGVhclRpbWVvdXQpIGNsZWFyVGltZW91dCh0aGlzLnJvbGVDYWNoZUNsZWFyVGltZW91dCk7XG4gICAgaWYgKHRoaXMudGFza0NoZWNrSW50ZXJ2YWwpIGNsZWFySW50ZXJ2YWwodGhpcy50YXNrQ2hlY2tJbnRlcnZhbCk7XG5cbiAgICAvLyDQntGH0LjRidC10L3QvdGPINC+0LHRgNC+0LHQvdC40LrRltCyINC/0L7QtNGW0LlcbiAgICB0aGlzLmV2ZW50SGFuZGxlcnMgPSB7fTtcblxuICAgIHRyeSB7XG4gICAgICBpZiAodGhpcy5jaGF0TWFuYWdlciAmJiB0aGlzLnNldHRpbmdzLnNhdmVNZXNzYWdlSGlzdG9yeSkge1xuICAgICAgICBjb25zdCBsYXN0QWN0aXZlSWQgPSB0aGlzLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXRJZCgpO1xuICAgICAgICBpZiAobGFzdEFjdGl2ZUlkICE9PSB1bmRlZmluZWQgJiYgbGFzdEFjdGl2ZUlkICE9PSBudWxsKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5zYXZlRGF0YUtleShBQ1RJVkVfQ0hBVF9JRF9LRVksIGxhc3RBY3RpdmVJZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5zYXZlRGF0YUtleShBQ1RJVkVfQ0hBVF9JRF9LRVksIG51bGwpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLnNhdmVEYXRhS2V5KEFDVElWRV9DSEFUX0lEX0tFWSwgbnVsbCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHt9XG4gIH1cblxuICB1cGRhdGVPbGxhbWFTZXJ2aWNlQ29uZmlnKCkge1xuICAgIGlmICh0aGlzLm9sbGFtYVNlcnZpY2UpIHtcbiAgICAgIC8vINCi0YPRgiDQvNCw0ZQg0LHRg9GC0Lgg0LvQvtCz0ZbQutCwLCDRidC+INC/0LXRgNC10LTQsNGUINC90L7QstGWINC90LDQu9Cw0YjRgtGD0LLQsNC90L3RjyAo0L3QsNC/0YDQuNC60LvQsNC0LCBVUkwpINCyIE9sbGFtYVNlcnZpY2VcbiAgICAgIC8vIHRoaXMub2xsYW1hU2VydmljZS51cGRhdGVDb25maWcoeyBiYXNlVXJsOiB0aGlzLnNldHRpbmdzLm9sbGFtYVVybCB9KTsgLy8g0J/RgNC40LrQu9Cw0LRcbiAgICAgIHRoaXMucHJvbXB0U2VydmljZT8uY2xlYXJNb2RlbERldGFpbHNDYWNoZSgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZGVib3VuY2VJbmRleFVwZGF0ZSgpIHtcbiAgICBpZiAodGhpcy5pbmRleFVwZGF0ZVRpbWVvdXQpIGNsZWFyVGltZW91dCh0aGlzLmluZGV4VXBkYXRlVGltZW91dCk7XG5cbiAgICB0aGlzLmluZGV4VXBkYXRlVGltZW91dCA9IHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MucmFnRW5hYmxlZCAmJiB0aGlzLnJhZ1NlcnZpY2UpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5yYWdTZXJ2aWNlLmluZGV4RG9jdW1lbnRzKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgfVxuICAgICAgdGhpcy5pbmRleFVwZGF0ZVRpbWVvdXQgPSBudWxsO1xuICAgIH0sIDMwMDAwKTsgLy8gMzAg0YHQtdC60YPQvdC0INC30LDRgtGA0LjQvNC60LhcbiAgfVxuXG4gIGFzeW5jIGFjdGl2YXRlVmlldygpIHtcbiAgICBjb25zdCB7IHdvcmtzcGFjZSB9ID0gdGhpcy5hcHA7XG4gICAgbGV0IGxlYWY6IFdvcmtzcGFjZUxlYWYgfCBudWxsID0gbnVsbDtcbiAgICBjb25zdCB2aWV3VHlwZSA9IFZJRVdfVFlQRV9PTExBTUFfUEVSU09OQVM7XG4gICAgY29uc3QgZXhpc3RpbmdMZWF2ZXMgPSB3b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKHZpZXdUeXBlKTtcblxuICAgIGlmIChleGlzdGluZ0xlYXZlcy5sZW5ndGggPiAwKSB7XG4gICAgICBsZWFmID0gZXhpc3RpbmdMZWF2ZXNbMF07XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLm9wZW5DaGF0SW5UYWIpIHtcbiAgICAgICAgbGVhZiA9IHdvcmtzcGFjZS5nZXRMZWFmKFwidGFiXCIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGVhZiA9IHdvcmtzcGFjZS5nZXRSaWdodExlYWYoZmFsc2UpO1xuXG4gICAgICAgIGlmICghbGVhZikge1xuICAgICAgICAgIGxlYWYgPSB3b3Jrc3BhY2UuZ2V0TGVhZihcInRhYlwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGxlYWYpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCBsZWFmLnNldFZpZXdTdGF0ZSh7IHR5cGU6IHZpZXdUeXBlLCBhY3RpdmU6IHRydWUgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3Igb3BlbmluZyBBSSBGb3JnZSB2aWV3LlwiKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJDb3VsZCBub3Qgb3BlbiBBSSBGb3JnZSB2aWV3LlwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAobGVhZikge1xuICAgICAgd29ya3NwYWNlLnJldmVhbExlYWYobGVhZik7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgaWYgKGxlYWYgJiYgbGVhZi52aWV3IGluc3RhbmNlb2YgT2xsYW1hVmlldykge1xuICAgICAgICAgIHRoaXMudmlldyA9IGxlYWYudmlldztcblxuICAgICAgICAgIHRoaXMuZW1pdChcImZvY3VzLWlucHV0LXJlcXVlc3RcIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy52aWV3ID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfSwgNTApO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGxvYWRTZXR0aW5nc0FuZE1pZ3JhdGUoKSB7XG4gICAgY29uc3QgbG9hZGVkRGF0YSA9IGF3YWl0IHRoaXMubG9hZERhdGEoKTtcbiAgICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgbG9hZGVkRGF0YSk7XG5cbiAgICB0aGlzLnVwZGF0ZU9sbGFtYVNlcnZpY2VDb25maWcoKTtcbiAgICB0aGlzLnVwZGF0ZURhaWx5VGFza0ZpbGVQYXRoKCk7XG4gIH1cblxuICBhc3luYyBzYXZlU2V0dGluZ3MoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcblxuICAgIHRoaXMuZW1pdChcInNldHRpbmdzLXVwZGF0ZWRcIik7XG4gIH1cblxuICBhc3luYyBzYXZlRGF0YUtleShrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBkYXRhID0gKGF3YWl0IHRoaXMubG9hZERhdGEoKSkgfHwge307XG4gICAgICBkYXRhW2tleV0gPSB2YWx1ZTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEoZGF0YSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHt9XG4gIH1cblxuICBhc3luYyBsb2FkRGF0YUtleShrZXk6IHN0cmluZyk6IFByb21pc2U8YW55PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGRhdGEgPSAoYXdhaXQgdGhpcy5sb2FkRGF0YSgpKSB8fCB7fTtcbiAgICAgIGNvbnN0IHZhbHVlID0gZGF0YVtrZXldO1xuXG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgY2xlYXJNZXNzYWdlSGlzdG9yeVdpdGhDb25maXJtYXRpb24oKSB7XG4gICAgaWYgKCF0aGlzLmNoYXRNYW5hZ2VyKSB7XG4gICAgICBuZXcgTm90aWNlKFwiRXJyb3I6IENoYXQgTWFuYWdlciBub3QgcmVhZHkuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5jaGF0TWFuYWdlci5nZXRBY3RpdmVDaGF0KCk7XG4gICAgaWYgKGFjdGl2ZUNoYXQgJiYgYWN0aXZlQ2hhdC5tZXNzYWdlcy5sZW5ndGggPiAwKSB7XG4gICAgICBuZXcgQ29uZmlybU1vZGFsKHRoaXMuYXBwLCBcIkNsZWFyIEhpc3RvcnlcIiwgYENsZWFyIG1lc3NhZ2VzIGluIFwiJHthY3RpdmVDaGF0Lm1ldGFkYXRhLm5hbWV9XCI/YCwgYXN5bmMgKCkgPT4ge1xuICAgICAgICBhd2FpdCB0aGlzLmNoYXRNYW5hZ2VyLmNsZWFyQWN0aXZlQ2hhdE1lc3NhZ2VzKCk7XG4gICAgICAgIG5ldyBOb3RpY2UoYEhpc3RvcnkgY2xlYXJlZCBmb3IgXCIke2FjdGl2ZUNoYXQubWV0YWRhdGEubmFtZX1cIi5gKTtcbiAgICAgIH0pLm9wZW4oKTtcbiAgICB9IGVsc2UgaWYgKGFjdGl2ZUNoYXQpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJDaGF0IGhpc3RvcnkgaXMgYWxyZWFkeSBlbXB0eS5cIik7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJObyBhY3RpdmUgY2hhdCB0byBjbGVhci5cIik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbGlzdFJvbGVGaWxlcyhmb3JjZVJlZnJlc2g6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8Um9sZUluZm9bXT4ge1xuICAgIGlmICh0aGlzLnJvbGVMaXN0Q2FjaGUgJiYgIWZvcmNlUmVmcmVzaCkge1xuICAgICAgcmV0dXJuIHRoaXMucm9sZUxpc3RDYWNoZTtcbiAgICB9XG5cbiAgICBjb25zdCByb2xlczogUm9sZUluZm9bXSA9IFtdO1xuICAgIGNvbnN0IGFkZGVkTmFtZXNMb3dlckNhc2UgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCBhZGFwdGVyID0gdGhpcy5hcHAudmF1bHQuYWRhcHRlcjtcbiAgICBjb25zdCBwbHVnaW5EaXIgPSB0aGlzLm1hbmlmZXN0LmRpcjtcbiAgICBjb25zdCBidWlsdEluUm9sZU5hbWUgPSBcIlByb2R1Y3Rpdml0eSBBc3Npc3RhbnRcIjtcbiAgICBjb25zdCBidWlsdEluUm9sZUZpbGVOYW1lID0gXCJQcm9kdWN0aXZpdHlfQXNzaXN0YW50Lm1kXCI7XG4gICAgbGV0IGJ1aWx0SW5Sb2xlUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgaWYgKHBsdWdpbkRpcikge1xuICAgICAgYnVpbHRJblJvbGVQYXRoID0gbm9ybWFsaXplUGF0aChgJHtwbHVnaW5EaXJ9L3JvbGVzLyR7YnVpbHRJblJvbGVGaWxlTmFtZX1gKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmIChhd2FpdCBhZGFwdGVyLmV4aXN0cyhidWlsdEluUm9sZVBhdGgpKSB7XG4gICAgICAgICAgY29uc3Qgc3RhdCA9IGF3YWl0IGFkYXB0ZXIuc3RhdChidWlsdEluUm9sZVBhdGgpO1xuICAgICAgICAgIGlmIChzdGF0Py50eXBlID09PSBcImZpbGVcIikge1xuICAgICAgICAgICAgcm9sZXMucHVzaCh7IG5hbWU6IGJ1aWx0SW5Sb2xlTmFtZSwgcGF0aDogYnVpbHRJblJvbGVQYXRoLCBpc0N1c3RvbTogZmFsc2UgfSk7XG4gICAgICAgICAgICBhZGRlZE5hbWVzTG93ZXJDYXNlLmFkZChidWlsdEluUm9sZU5hbWUudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge31cbiAgICB9XG4gICAgY29uc3QgdXNlclJvbGVzRm9sZGVyUGF0aCA9IHRoaXMuc2V0dGluZ3MudXNlclJvbGVzRm9sZGVyUGF0aFxuICAgICAgPyBub3JtYWxpemVQYXRoKHRoaXMuc2V0dGluZ3MudXNlclJvbGVzRm9sZGVyUGF0aClcbiAgICAgIDogbnVsbDtcbiAgICBpZiAodXNlclJvbGVzRm9sZGVyUGF0aCAmJiB1c2VyUm9sZXNGb2xkZXJQYXRoICE9PSBcIi9cIikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZm9sZGVyRXhpc3RzID0gYXdhaXQgYWRhcHRlci5leGlzdHModXNlclJvbGVzRm9sZGVyUGF0aCk7XG4gICAgICAgIGNvbnN0IGZvbGRlclN0YXQgPSBmb2xkZXJFeGlzdHMgPyBhd2FpdCBhZGFwdGVyLnN0YXQodXNlclJvbGVzRm9sZGVyUGF0aCkgOiBudWxsO1xuICAgICAgICBpZiAoZm9sZGVyU3RhdD8udHlwZSA9PT0gXCJmb2xkZXJcIikge1xuICAgICAgICAgIGNvbnN0IGxpc3RSZXN1bHQgPSBhd2FpdCBhZGFwdGVyLmxpc3QodXNlclJvbGVzRm9sZGVyUGF0aCk7XG4gICAgICAgICAgZm9yIChjb25zdCBmaWxlUGF0aCBvZiBsaXN0UmVzdWx0LmZpbGVzKSB7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIGZpbGVQYXRoLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoXCIubWRcIikgJiZcbiAgICAgICAgICAgICAgZmlsZVBhdGguc3Vic3RyaW5nKHVzZXJSb2xlc0ZvbGRlclBhdGgubGVuZ3RoICsgMSkuaW5kZXhPZihcIi9cIikgPT09IC0xICYmXG4gICAgICAgICAgICAgIGZpbGVQYXRoICE9PSBidWlsdEluUm9sZVBhdGhcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBjb25zdCBmaWxlTmFtZSA9IGZpbGVQYXRoLnN1YnN0cmluZyhmaWxlUGF0aC5sYXN0SW5kZXhPZihcIi9cIikgKyAxKTtcbiAgICAgICAgICAgICAgY29uc3Qgcm9sZU5hbWUgPSBmaWxlTmFtZS5zbGljZSgwLCAtMyk7XG4gICAgICAgICAgICAgIGlmICghYWRkZWROYW1lc0xvd2VyQ2FzZS5oYXMocm9sZU5hbWUudG9Mb3dlckNhc2UoKSkpIHtcbiAgICAgICAgICAgICAgICByb2xlcy5wdXNoKHsgbmFtZTogcm9sZU5hbWUsIHBhdGg6IGZpbGVQYXRoLCBpc0N1c3RvbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICBhZGRlZE5hbWVzTG93ZXJDYXNlLmFkZChyb2xlTmFtZS50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge31cbiAgICB9XG4gICAgcm9sZXMuc29ydCgoYSwgYikgPT4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSk7XG4gICAgdGhpcy5yb2xlTGlzdENhY2hlID0gcm9sZXM7XG5cbiAgICByZXR1cm4gcm9sZXM7XG4gIH1cblxuICBhc3luYyBleGVjdXRlU3lzdGVtQ29tbWFuZChcbiAgICBjb21tYW5kOiBzdHJpbmdcbiAgKTogUHJvbWlzZTx7IHN0ZG91dDogc3RyaW5nOyBzdGRlcnI6IHN0cmluZzsgZXJyb3I6IEV4ZWNFeGNlcHRpb24gfCBudWxsIH0+IHtcbiAgICBpZiAoIWNvbW1hbmQ/LnRyaW0oKSkge1xuICAgICAgcmV0dXJuIHsgc3Rkb3V0OiBcIlwiLCBzdGRlcnI6IFwiRW1wdHkgY29tbWFuZC5cIiwgZXJyb3I6IG5ldyBFcnJvcihcIkVtcHR5IGNvbW1hbmQuXCIpIGFzIEV4ZWNFeGNlcHRpb24gfTtcbiAgICB9XG4gICAgLy9AdHMtaWdub3JlXG4gICAgaWYgKHR5cGVvZiBwcm9jZXNzID09PSBcInVuZGVmaW5lZFwiIHx8ICFwcm9jZXNzPy52ZXJzaW9ucz8ubm9kZSkge1xuICAgICAgbmV3IE5vdGljZShcIkNhbm5vdCBleGVjdXRlIHN5c3RlbSBjb21tYW5kOiBOb2RlLmpzIGVudmlyb25tZW50IGlzIHJlcXVpcmVkLlwiKTtcbiAgICAgIHJldHVybiB7IHN0ZG91dDogXCJcIiwgc3RkZXJyOiBcIk5vZGUuanMgcmVxdWlyZWQuXCIsIGVycm9yOiBuZXcgRXJyb3IoXCJOb2RlLmpzIHJlcXVpcmVkLlwiKSBhcyBFeGVjRXhjZXB0aW9uIH07XG4gICAgfVxuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIGV4ZWMoY29tbWFuZCwgKGVycm9yLCBzdGRvdXQsIHN0ZGVycikgPT4ge1xuICAgICAgICBpZiAoZXJyb3IpXG4gICAgICAgICAgaWYgKHN0ZGVyciAmJiBzdGRlcnIudHJpbSgpKSByZXNvbHZlKHsgc3Rkb3V0OiBzdGRvdXQudG9TdHJpbmcoKSwgc3RkZXJyOiBzdGRlcnIudG9TdHJpbmcoKSwgZXJyb3I6IGVycm9yIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzaG93Q2hhdFN3aXRjaGVyKCkge1xuICAgIG5ldyBOb3RpY2UoXCJTd2l0Y2ggQ2hhdCBVSSBub3QgaW1wbGVtZW50ZWQgeWV0LlwiKTtcbiAgfVxuXG4gIGFzeW5jIHJlbmFtZUFjdGl2ZUNoYXQoKSB7XG4gICAgaWYgKCF0aGlzLmNoYXRNYW5hZ2VyKSB7XG4gICAgICBuZXcgTm90aWNlKFwiRXJyb3I6IENoYXQgbWFuYWdlciBpcyBub3QgcmVhZHkuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5jaGF0TWFuYWdlci5nZXRBY3RpdmVDaGF0KCk7XG4gICAgaWYgKCFhY3RpdmVDaGF0KSB7XG4gICAgICBuZXcgTm90aWNlKFwiTm8gYWN0aXZlIGNoYXQgdG8gcmVuYW1lLlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY3VycmVudE5hbWUgPSBhY3RpdmVDaGF0Lm1ldGFkYXRhLm5hbWU7XG4gICAgY29uc3QgY2hhdElkID0gYWN0aXZlQ2hhdC5tZXRhZGF0YS5pZDtcblxuICAgIG5ldyBQcm9tcHRNb2RhbCh0aGlzLmFwcCwgXCJSZW5hbWUgQ2hhdFwiLCBgRW50ZXIgbmV3IG5hbWUgZm9yIFwiJHtjdXJyZW50TmFtZX1cIjpgLCBjdXJyZW50TmFtZSwgYXN5bmMgbmV3TmFtZSA9PiB7XG4gICAgICBjb25zdCB0cmltbWVkTmFtZSA9IG5ld05hbWU/LnRyaW0oKTtcbiAgICAgIGlmICh0cmltbWVkTmFtZSAmJiB0cmltbWVkTmFtZSAhPT0gXCJcIiAmJiB0cmltbWVkTmFtZSAhPT0gY3VycmVudE5hbWUpIHtcbiAgICAgICAgY29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMuY2hhdE1hbmFnZXIucmVuYW1lQ2hhdChjaGF0SWQsIHRyaW1tZWROYW1lKTtcbiAgICAgICAgaWYgKCFzdWNjZXNzKSB7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAobmV3TmFtZSA9PT0gbnVsbCB8fCB0cmltbWVkTmFtZSA9PT0gXCJcIikge1xuICAgICAgICBuZXcgTm90aWNlKFwiUmVuYW1lIGNhbmNlbGxlZCBvciBpbnZhbGlkIG5hbWUgZW50ZXJlZC5cIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBuZXcgTm90aWNlKFwiTmFtZSB1bmNoYW5nZWQuXCIpO1xuICAgICAgfVxuICAgIH0pLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUFjdGl2ZUNoYXRXaXRoQ29uZmlybWF0aW9uKCkge1xuICAgIGlmICghdGhpcy5jaGF0TWFuYWdlcikge1xuICAgICAgbmV3IE5vdGljZShcIkVycm9yOiBDaGF0IG1hbmFnZXIgaXMgbm90IHJlYWR5LlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMuY2hhdE1hbmFnZXIuZ2V0QWN0aXZlQ2hhdCgpO1xuICAgIGlmICghYWN0aXZlQ2hhdCkge1xuICAgICAgbmV3IE5vdGljZShcIk5vIGFjdGl2ZSBjaGF0IHRvIGRlbGV0ZS5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNoYXROYW1lID0gYWN0aXZlQ2hhdC5tZXRhZGF0YS5uYW1lO1xuICAgIGNvbnN0IGNoYXRJZCA9IGFjdGl2ZUNoYXQubWV0YWRhdGEuaWQ7XG5cbiAgICBuZXcgQ29uZmlybU1vZGFsKFxuICAgICAgdGhpcy5hcHAsXG4gICAgICBcIkRlbGV0ZSBDaGF0XCIsXG4gICAgICBgQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSBjaGF0IFwiJHtjaGF0TmFtZX1cIj9cXG5UaGlzIGFjdGlvbiBjYW5ub3QgYmUgdW5kb25lLmAsXG4gICAgICBhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLmNoYXRNYW5hZ2VyLmRlbGV0ZUNoYXQoY2hhdElkKTtcbiAgICAgICAgaWYgKCFzdWNjZXNzKSB7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApLm9wZW4oKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlQWN0aXZlQ2hhdENoYW5nZWRMb2NhbGx5KGRhdGE6IHsgY2hhdElkOiBzdHJpbmcgfCBudWxsOyBjaGF0OiBDaGF0IHwgbnVsbCB9KSB7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3Muc2F2ZU1lc3NhZ2VIaXN0b3J5KSB7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVEYXRhS2V5KEFDVElWRV9DSEFUX0lEX0tFWSwgZGF0YS5jaGF0SWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVEYXRhS2V5KEFDVElWRV9DSEFUX0lEX0tFWSwgbnVsbCk7XG4gICAgfVxuICB9XG5cbiAgZmluZFJvbGVOYW1lQnlQYXRoKHJvbGVQYXRoOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcbiAgICBpZiAoIXJvbGVQYXRoKSByZXR1cm4gXCJOb25lXCI7XG4gICAgY29uc3QgY2FjaGVkUm9sZSA9IHRoaXMucm9sZUxpc3RDYWNoZT8uZmluZChybCA9PiBybC5wYXRoID09PSByb2xlUGF0aCk7XG4gICAgaWYgKGNhY2hlZFJvbGUpIHtcbiAgICAgIHJldHVybiBjYWNoZWRSb2xlLm5hbWU7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZpbGVOYW1lID0gcm9sZVBhdGguc3Vic3RyaW5nKHJvbGVQYXRoLmxhc3RJbmRleE9mKFwiL1wiKSArIDEpO1xuICAgICAgY29uc3Qgcm9sZU5hbWUgPSBmaWxlTmFtZS5lbmRzV2l0aChcIi5tZFwiKSA/IGZpbGVOYW1lLnNsaWNlKDAsIC0zKSA6IGZpbGVOYW1lO1xuICAgICAgcmV0dXJuIHJvbGVOYW1lIHx8IFwiVW5rbm93biBSb2xlXCI7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIFwiVW5rbm93biBSb2xlXCI7XG4gICAgfVxuICB9XG59IC8vIEVORCBPRiBPbGxhbWFQbHVnaW4gQ0xBU1NcbiJdfQ==