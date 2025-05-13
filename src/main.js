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
            // this.logger.error("[VAULT HANDLER] debouncedIndexAndUIRebuild FIRED");
            if (this.chatManager) {
                yield this.chatManager.rebuildIndexFromFiles();
                // this.logger.error("[VAULT HANDLER] Emitting 'chat-list-updated' NOW!");
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
            // this.logger.info("Chat Manager initialized.");
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
                // this.logger.info("Creating OllamaView instance.");
                this.view = new OllamaView(leaf, this);
                return this.view;
            });
            // Обробка помилок з'єднання з Ollama Service
            this.ollamaService.on("connection-error", error => {
                this.logger.error("Ollama connection error detected:", error);
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
                this.logger.info("Settings updated, applying changes...");
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
                this.logger.info("Workspace layout ready.");
                // Автоматична індексація RAG при старті, якщо увімкнено
                if (this.settings.ragEnabled && this.settings.ragAutoIndexOnStartup) {
                    this.logger.info("RAG enabled, starting initial indexing after delay...");
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
                // this.logger.debug("Debounced role cache clear triggered.");
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
            // this.logger.info("AI Forge Plugin loaded successfully.");
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
                // this.logger.error(
                //   `[VAULT HANDLER] Vault change (create/delete) detected inside history folder: ${file.path}. Triggering rebuild.`
                // );
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
                // this.logger.error(
                //   `[VAULT HANDLER] Vault rename detected involving history folder: ${oldPath} -> ${file.path}. Triggering rebuild.`
                // );
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLGNBQWM7QUFDZCxPQUFPLEVBQ0wsTUFBTSxFQUVOLE1BQU0sRUFDTixhQUFhLEVBQ2IsS0FBSyxFQUNMLE9BQU8sRUFHUCxRQUFRLEdBSVQsTUFBTSxVQUFVLENBQUM7QUFDbEIsT0FBTyxFQUFFLFVBQVUsRUFBRSx5QkFBeUIsRUFBZSxNQUFNLGNBQWMsQ0FBQztBQUNsRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQXdCLE1BQU0sWUFBWSxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDMUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ2hELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUNoRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBRzVDLE9BQU8sRUFBRSxJQUFJLEVBQWlCLE1BQU0sZUFBZSxDQUFDO0FBQ3BELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQzFELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDNUMsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxNQUFNLEVBQTRCLE1BQU0sVUFBVSxDQUFDO0FBQzVELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQyxDQUFDLGlCQUFpQjtBQUN2RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFN0QsbUNBQW1DO0FBQ25DLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLGNBQWMsQ0FBQyxDQUFDLG9CQUFvQjtBQUN0RSxNQUFNLENBQUMsTUFBTSxrQkFBa0IsR0FBRyxpQkFBaUIsQ0FBQyxDQUFDLG9C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QUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7WUFDN0UsT0FBTyxRQUFRLElBQUksY0FBYyxDQUFDO1FBQ3BDLENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1gsT0FBTyxjQUFjLENBQUM7UUFDeEIsQ0FBQztJQUNILENBQUM7Q0FDRixDQUFDLDRCQUE0QiIsInNvdXJjZXNDb250ZW50IjpbIi8vIHNyYy9tYWluLnRzXG5pbXBvcnQge1xuICBQbHVnaW4sXG4gIFdvcmtzcGFjZUxlYWYsXG4gIE5vdGljZSxcbiAgbm9ybWFsaXplUGF0aCxcbiAgVEZpbGUsXG4gIFRGb2xkZXIsXG4gIFRBYnN0cmFjdEZpbGUsXG4gIERhdGFBZGFwdGVyLFxuICBkZWJvdW5jZSxcbiAgU3VnZ2VzdE1vZGFsLFxuICBGdXp6eVN1Z2dlc3RNb2RhbCxcbiAgRXZlbnRSZWYsIC8vINCG0LzQv9C+0YDRgtGD0ZTQvNC+IEV2ZW50UmVmXG59IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHsgT2xsYW1hVmlldywgVklFV19UWVBFX09MTEFNQV9QRVJTT05BUywgTWVzc2FnZVJvbGUgfSBmcm9tIFwiLi9PbGxhbWFWaWV3XCI7XG5pbXBvcnQgeyBPbGxhbWFTZXR0aW5nVGFiLCBERUZBVUxUX1NFVFRJTkdTLCBPbGxhbWFQbHVnaW5TZXR0aW5ncyB9IGZyb20gXCIuL3NldHRpbmdzXCI7XG5pbXBvcnQgeyBSYWdTZXJ2aWNlIH0gZnJvbSBcIi4vcmFnU2VydmljZVwiO1xuaW1wb3J0IHsgT2xsYW1hU2VydmljZSB9IGZyb20gXCIuL09sbGFtYVNlcnZpY2VcIjtcbmltcG9ydCB7IFByb21wdFNlcnZpY2UgfSBmcm9tIFwiLi9Qcm9tcHRTZXJ2aWNlXCI7XG5pbXBvcnQgeyBDaGF0TWFuYWdlciB9IGZyb20gXCIuL0NoYXRNYW5hZ2VyXCI7XG5pbXBvcnQgeyBDaGF0LCBDaGF0TWV0YWRhdGEgfSBmcm9tIFwiLi9DaGF0XCI7XG5pbXBvcnQgeyBSb2xlSW5mbyB9IGZyb20gXCIuL0NoYXRNYW5hZ2VyXCI7XG5pbXBvcnQgeyBleGVjLCBFeGVjRXhjZXB0aW9uIH0gZnJvbSBcImNoaWxkX3Byb2Nlc3NcIjtcbmltcG9ydCB7IFRyYW5zbGF0aW9uU2VydmljZSB9IGZyb20gXCIuL1RyYW5zbGF0aW9uU2VydmljZVwiO1xuaW1wb3J0IHsgUHJvbXB0TW9kYWwgfSBmcm9tIFwiLi9Qcm9tcHRNb2RhbFwiO1xuaW1wb3J0IHsgQ29uZmlybU1vZGFsIH0gZnJvbSBcIi4vQ29uZmlybU1vZGFsXCI7XG5pbXBvcnQgeyBMb2dnZXIsIExvZ0xldmVsLCBMb2dnZXJTZXR0aW5ncyB9IGZyb20gXCIuL0xvZ2dlclwiO1xuaW1wb3J0IHsgQWdlbnRNYW5hZ2VyIH0gZnJvbSBcIi4vYWdlbnRzL0FnZW50TWFuYWdlclwiOyAvLyDQkNC00LDQv9GC0YPQudGC0LUg0YjQu9GP0YVcbmltcG9ydCB7IFNpbXBsZUZpbGVBZ2VudCB9IGZyb20gXCIuL2V4YW1wbGVzL1NpbXBsZUZpbGVBZ2VudFwiO1xuXG4vLyAtLS0g0JrQntCd0KHQotCQ0J3QotCYINCU0JvQryDQl9CR0JXQoNCV0JbQldCd0J3QryAtLS1cbmV4cG9ydCBjb25zdCBTRVNTSU9OU19JTkRFWF9LRVkgPSBcImNoYXRJbmRleF92MlwiOyAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+IHYyXG5leHBvcnQgY29uc3QgQUNUSVZFX0NIQVRfSURfS0VZID0gXCJhY3RpdmVDaGF0SWRfdjJcIjsgLy8g0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviB2MlxuZXhwb3J0IGNvbnN0IENIQVRfSU5ERVhfS0VZID0gXCJjaGF0SW5kZXhfdjJcIjsgLy8g0KHQuNC90L7QvdGW0Lwg0LTQu9GPINGP0YHQvdC+0YHRgtGWXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBSQUdEb2N1bWVudCB7XG4gIGlkOiBzdHJpbmc7XG4gIGNvbnRlbnQ6IHN0cmluZztcbiAgbWV0YWRhdGE6IHsgc291cmNlOiBzdHJpbmc7IHBhdGg6IHN0cmluZyB9O1xufVxuaW50ZXJmYWNlIEVtYmVkZGluZyB7XG4gIGRvY3VtZW50SWQ6IHN0cmluZztcbiAgdmVjdG9yOiBudW1iZXJbXTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgT2xsYW1hUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgc2V0dGluZ3M6IE9sbGFtYVBsdWdpblNldHRpbmdzO1xuICBzZXR0aW5nVGFiOiBPbGxhbWFTZXR0aW5nVGFiO1xuICB2aWV3OiBPbGxhbWFWaWV3IHwgbnVsbCA9IG51bGw7XG5cbiAgcmFnU2VydmljZSE6IFJhZ1NlcnZpY2U7XG4gIGFnZW50TWFuYWdlciE6IEFnZW50TWFuYWdlcjsgXG4gIG9sbGFtYVNlcnZpY2UhOiBPbGxhbWFTZXJ2aWNlO1xuICBwcm9tcHRTZXJ2aWNlITogUHJvbXB0U2VydmljZTtcbiAgY2hhdE1hbmFnZXIhOiBDaGF0TWFuYWdlcjtcbiAgdHJhbnNsYXRpb25TZXJ2aWNlITogVHJhbnNsYXRpb25TZXJ2aWNlO1xuICBsb2dnZXIhOiBMb2dnZXI7XG5cbiAgcHJpdmF0ZSBldmVudEhhbmRsZXJzOiBSZWNvcmQ8c3RyaW5nLCBBcnJheTwoZGF0YTogYW55KSA9PiBhbnk+PiA9IHt9O1xuICBwcml2YXRlIHJvbGVMaXN0Q2FjaGU6IFJvbGVJbmZvW10gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSByb2xlQ2FjaGVDbGVhclRpbWVvdXQ6IE5vZGVKUy5UaW1lb3V0IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgaW5kZXhVcGRhdGVUaW1lb3V0OiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXG4gIHByaXZhdGUgZGFpbHlUYXNrRmlsZVBhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHRhc2tGaWxlQ29udGVudENhY2hlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSB0YXNrRmlsZU5lZWRzVXBkYXRlOiBib29sZWFuID0gZmFsc2U7XG4gIHByaXZhdGUgdGFza0NoZWNrSW50ZXJ2YWw6IE5vZGVKUy5UaW1lb3V0IHwgbnVsbCA9IG51bGw7XG5cbiAgLy8gRGVib3VuY2VkINGE0YPQvdC60YbRltGPINC+0L3QvtCy0LvQtdC90L3RjyDQtNC70Y8gVmF1bHQgRXZlbnRzXG4gIHByaXZhdGUgZGVib3VuY2VkSW5kZXhBbmRVSVJlYnVpbGQgPSBkZWJvdW5jZShcbiAgICBhc3luYyAoKSA9PiB7XG4gICAgICAvLyB0aGlzLmxvZ2dlci5lcnJvcihcIltWQVVMVCBIQU5ETEVSXSBkZWJvdW5jZWRJbmRleEFuZFVJUmVidWlsZCBGSVJFRFwiKTtcblxuICAgICAgaWYgKHRoaXMuY2hhdE1hbmFnZXIpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5jaGF0TWFuYWdlci5yZWJ1aWxkSW5kZXhGcm9tRmlsZXMoKTtcbiAgICAgICAgLy8gdGhpcy5sb2dnZXIuZXJyb3IoXCJbVkFVTFQgSEFORExFUl0gRW1pdHRpbmcgJ2NoYXQtbGlzdC11cGRhdGVkJyBOT1chXCIpO1xuICAgICAgICAvLyB0aGlzLmVtaXQoXCJjaGF0LWxpc3QtdXBkYXRlZFwiKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIDE1MDAsXG4gICAgdHJ1ZVxuICApO1xuXG4gIC8vIC0tLSBFdmVudCBFbWl0dGVyIE1ldGhvZHMgLS0tXG4gIHB1YmxpYyBvbihldmVudDogc3RyaW5nLCBjYWxsYmFjazogKGRhdGE6IGFueSkgPT4gYW55KTogKCkgPT4gdm9pZCB7XG4gICAgaWYgKCF0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdKSB0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdID0gW107XG4gICAgdGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XS5wdXNoKGNhbGxiYWNrKTtcbiAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgdGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XSA9IHRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF0/LmZpbHRlcihoID0+IGggIT09IGNhbGxiYWNrKTtcbiAgICAgIGlmICh0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdPy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF07XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIHB1YmxpYyBlbWl0KGV2ZW50OiBzdHJpbmcsIGRhdGE/OiBhbnkpOiB2b2lkIHtcbiAgICBjb25zdCBoYW5kbGVycyA9IHRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF07XG4gICAgaWYgKGhhbmRsZXJzKSB7XG4gICAgICBoYW5kbGVycy5zbGljZSgpLmZvckVhY2goaGFuZGxlciA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgaGFuZGxlcihkYXRhKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge31cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIHB1YmxpYyBpc1Rhc2tGaWxlVXBkYXRlZCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy50YXNrRmlsZU5lZWRzVXBkYXRlO1xuICB9XG5cbiAgLy8gc3JjL21haW4udHNcblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgY29uc3QgaW5pdGlhbFNldHRpbmdzRGF0YSA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSk7XG5cbiAgICAvLyAtLS0g0IbQvdGW0YbRltCw0LvRltC30LDRhtGW0Y8g0JvQvtCz0LXRgNCwIC0tLVxuICAgIGNvbnN0IGxvZ2dlclNldHRpbmdzOiBMb2dnZXJTZXR0aW5ncyA9IHtcbiAgICAgIC8vINCS0LjQt9C90LDRh9Cw0ZTQvNC+INGA0ZbQstC10L3RjCDQu9C+0LPRg9Cy0LDQvdC90Y8g0LTQu9GPINC60L7QvdGB0L7Qu9GWINC30LDQu9C10LbQvdC+INCy0ZbQtCDRgdC10YDQtdC00L7QstC40YnQsFxuICAgICAgY29uc29sZUxvZ0xldmVsOiBwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gXCJwcm9kdWN0aW9uXCIgPyBpbml0aWFsU2V0dGluZ3NEYXRhLmNvbnNvbGVMb2dMZXZlbCB8fCBcIklORk9cIiA6IFwiREVCVUdcIixcbiAgICAgIGZpbGVMb2dnaW5nRW5hYmxlZDogaW5pdGlhbFNldHRpbmdzRGF0YS5maWxlTG9nZ2luZ0VuYWJsZWQsXG4gICAgICBmaWxlTG9nTGV2ZWw6IGluaXRpYWxTZXR0aW5nc0RhdGEuZmlsZUxvZ0xldmVsLFxuICAgICAgbG9nQ2FsbGVySW5mbzogaW5pdGlhbFNldHRpbmdzRGF0YS5sb2dDYWxsZXJJbmZvLFxuICAgICAgbG9nRmlsZVBhdGg6IGluaXRpYWxTZXR0aW5nc0RhdGEubG9nRmlsZVBhdGgsXG4gICAgICBsb2dGaWxlTWF4U2l6ZU1COiBpbml0aWFsU2V0dGluZ3NEYXRhLmxvZ0ZpbGVNYXhTaXplTUIsXG4gICAgfTtcbiAgICB0aGlzLmxvZ2dlciA9IG5ldyBMb2dnZXIodGhpcywgbG9nZ2VyU2V0dGluZ3MpO1xuICAgIC8vIC0tLVxuXG4gICAgLy8g0JfQsNCy0LDQvdGC0LDQttGD0ZTQvNC+INC90LDQu9Cw0YjRgtGD0LLQsNC90L3RjyDRgtCwINCy0LjQutC+0L3Rg9GU0LzQviDQvNGW0LPRgNCw0YbRltGOLCDRj9C60YnQviDQv9C+0YLRgNGW0LHQvdC+XG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3NBbmRNaWdyYXRlKCk7XG5cbiAgICAvLyDQhtC90ZbRhtGW0LDQu9GW0LfRg9GU0LzQviDRgdC10YDQstGW0YHQuFxuICAgIHRoaXMucHJvbXB0U2VydmljZSA9IG5ldyBQcm9tcHRTZXJ2aWNlKHRoaXMpO1xuICAgIHRoaXMub2xsYW1hU2VydmljZSA9IG5ldyBPbGxhbWFTZXJ2aWNlKHRoaXMpO1xuICAgIHRoaXMudHJhbnNsYXRpb25TZXJ2aWNlID0gbmV3IFRyYW5zbGF0aW9uU2VydmljZSh0aGlzKTtcbiAgICB0aGlzLnJhZ1NlcnZpY2UgPSBuZXcgUmFnU2VydmljZSh0aGlzKTtcbiAgICB0aGlzLmNoYXRNYW5hZ2VyID0gbmV3IENoYXRNYW5hZ2VyKHRoaXMpO1xuXG5cbiAgICB0aGlzLmFnZW50TWFuYWdlciA9IG5ldyBBZ2VudE1hbmFnZXIodGhpcyk7IC8vIDwtLS0g0IbQndCG0KbQhtCQ0JvQhtCX0JDQptCG0K9cbiAgICAvLyDQotGD0YIg0LzQvtC20L3QsCDQt9Cw0YDQtdGU0YHRgtGA0YPQstCw0YLQuCDQv9C+0YfQsNGC0LrQvtCy0LjRhSDQsNCz0LXQvdGC0ZbQsiwg0Y/QutGJ0L4g0LLQvtC90Lgg0ZRcbiAgICB0aGlzLmFnZW50TWFuYWdlci5yZWdpc3RlckFnZW50KG5ldyBTaW1wbGVGaWxlQWdlbnQoKSk7XG5cbiAgICAvLyDQhtC90ZbRhtGW0LDQu9GW0LfRg9GU0LzQviDQvNC10L3QtdC00LbQtdGAINGH0LDRgtGW0LIgKNC30LDQstCw0L3RgtCw0LbRg9GUINGW0L3QtNC10LrRgSwg0LLRltC00L3QvtCy0LvRjtGUINCw0LrRgtC40LLQvdC40Lkg0YfQsNGCKVxuICAgIGF3YWl0IHRoaXMuY2hhdE1hbmFnZXIuaW5pdGlhbGl6ZSgpO1xuICAgIC8vIHRoaXMubG9nZ2VyLmluZm8oXCJDaGF0IE1hbmFnZXIgaW5pdGlhbGl6ZWQuXCIpO1xuXG4gICAgLy8g0J7QvdC+0LLQu9GO0ZTQvNC+INC90LDQu9Cw0YjRgtGD0LLQsNC90L3RjyDQu9C+0LPQtdGA0LAg0YDQtdCw0LvRjNC90LjQvNC4INC30L3QsNGH0LXQvdC90Y/QvNC4INC/0ZbRgdC70Y8g0LfQsNCy0LDQvdGC0LDQttC10L3QvdGPXG4gICAgdGhpcy5sb2dnZXIudXBkYXRlU2V0dGluZ3Moe1xuICAgICAgY29uc29sZUxvZ0xldmVsOiB0aGlzLnNldHRpbmdzLmNvbnNvbGVMb2dMZXZlbCxcbiAgICAgIGZpbGVMb2dnaW5nRW5hYmxlZDogdGhpcy5zZXR0aW5ncy5maWxlTG9nZ2luZ0VuYWJsZWQsXG4gICAgICBmaWxlTG9nTGV2ZWw6IHRoaXMuc2V0dGluZ3MuZmlsZUxvZ0xldmVsLFxuICAgICAgbG9nQ2FsbGVySW5mbzogdGhpcy5zZXR0aW5ncy5sb2dDYWxsZXJJbmZvLFxuICAgICAgbG9nRmlsZVBhdGg6IHRoaXMuc2V0dGluZ3MubG9nRmlsZVBhdGgsXG4gICAgICBsb2dGaWxlTWF4U2l6ZU1COiB0aGlzLnNldHRpbmdzLmxvZ0ZpbGVNYXhTaXplTUIsXG4gICAgfSk7XG5cbiAgICAvLyDQoNC10ZTRgdGC0YDRg9GU0LzQviBWaWV3INC/0LvQsNCz0ZbQvdCwXG4gICAgdGhpcy5yZWdpc3RlclZpZXcoVklFV19UWVBFX09MTEFNQV9QRVJTT05BUywgbGVhZiA9PiB7XG4gICAgICAvLyB0aGlzLmxvZ2dlci5pbmZvKFwiQ3JlYXRpbmcgT2xsYW1hVmlldyBpbnN0YW5jZS5cIik7XG4gICAgICB0aGlzLnZpZXcgPSBuZXcgT2xsYW1hVmlldyhsZWFmLCB0aGlzKTtcbiAgICAgIHJldHVybiB0aGlzLnZpZXc7XG4gICAgfSk7XG5cbiAgICAvLyDQntCx0YDQvtCx0LrQsCDQv9C+0LzQuNC70L7QuiDQtyfRlNC00L3QsNC90L3RjyDQtyBPbGxhbWEgU2VydmljZVxuICAgIHRoaXMub2xsYW1hU2VydmljZS5vbihcImNvbm5lY3Rpb24tZXJyb3JcIiwgZXJyb3IgPT4ge1xuICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihcIk9sbGFtYSBjb25uZWN0aW9uIGVycm9yIGRldGVjdGVkOlwiLCBlcnJvcik7XG4gICAgICAgIC8vINCT0LXQvdC10YDRg9GU0LzQviDQv9C+0LTRltGOINC/0LvQsNCz0ZbQvdCwINC/0YDQviDQv9C+0LzQuNC70LrRgyDQtyfRlNC00L3QsNC90L3Rj1xuICAgICAgICB0aGlzLmVtaXQoXCJvbGxhbWEtY29ubmVjdGlvbi1lcnJvclwiLCBlcnJvci5tZXNzYWdlIHx8IFwiVW5rbm93biBjb25uZWN0aW9uIGVycm9yXCIpO1xuICAgIH0pO1xuXG4gICAgLy8g0KDQtdGU0YHRgtGA0LDRhtGW0Y8g0L7QsdGA0L7QsdC90LjQutGW0LIg0LLQvdGD0YLRgNGW0YjQvdGW0YUg0L/QvtC00ZbQuSDQv9C70LDQs9GW0L3QsFxuICAgIHRoaXMucmVnaXN0ZXIoXG4gICAgICB0aGlzLm9uKFwib2xsYW1hLWNvbm5lY3Rpb24tZXJyb3JcIiwgYXN5bmMgKG1lc3NhZ2U6IHN0cmluZykgPT4ge1xuICAgICAgICBpZiAodGhpcy5jaGF0TWFuYWdlcikge1xuICAgICAgICAgIC8vINCU0L7QtNCw0ZTQvNC+INC/0L7QstGW0LTQvtC80LvQtdC90L3RjyDQv9GA0L4g0L/QvtC80LjQu9C60YMg0LTQviDQsNC60YLQuNCy0L3QvtCz0L4g0YfQsNGC0YNcbiAgICAgICAgICBhd2FpdCB0aGlzLmNoYXRNYW5hZ2VyLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXQoXCJlcnJvclwiLCBgT2xsYW1hIENvbm5lY3Rpb24gRXJyb3I6ICR7bWVzc2FnZX1gLCBuZXcgRGF0ZSgpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyDQr9C60YnQviBDaGF0TWFuYWdlciDRidC1INC90LUg0LPQvtGC0L7QstC40LksINC/0L7QutCw0LfRg9GU0LzQviDRgdGC0LDQvdC00LDRgNGC0L3QtSDQv9C+0LLRltC00L7QvNC70LXQvdC90Y9cbiAgICAgICAgICBuZXcgTm90aWNlKGBPbGxhbWEgQ29ubmVjdGlvbiBFcnJvcjogJHttZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICk7XG4gICAgLy8g0KDQtdGU0YHRgtGA0YPRlNC80L4g0LvQvtC60LDQu9GM0L3QuNC5INC+0LHRgNC+0LHQvdC40Log0LTQu9GPINC30LHQtdGA0LXQttC10L3QvdGPIElEINCw0LrRgtC40LLQvdC+0LPQviDRh9Cw0YLRg1xuICAgIHRoaXMucmVnaXN0ZXIodGhpcy5vbihcImFjdGl2ZS1jaGF0LWNoYW5nZWRcIiwgdGhpcy5oYW5kbGVBY3RpdmVDaGF0Q2hhbmdlZExvY2FsbHkuYmluZCh0aGlzKSkpO1xuICAgIC8vINCg0LXRlNGB0YLRgNGD0ZTQvNC+INC+0LHRgNC+0LHQvdC40Log0LTQu9GPINC+0L3QvtCy0LvQtdC90L3RjyDQvdCw0LvQsNGI0YLRg9Cy0LDQvdGMXG4gICAgdGhpcy5yZWdpc3RlcihcbiAgICAgIHRoaXMub24oXCJzZXR0aW5ncy11cGRhdGVkXCIsICgpID0+IHtcbiAgICAgICAgdGhpcy5sb2dnZXIuaW5mbyhcIlNldHRpbmdzIHVwZGF0ZWQsIGFwcGx5aW5nIGNoYW5nZXMuLi5cIik7XG4gICAgICAgIC8vINCe0L3QvtCy0LvRjtGU0LzQviDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8g0LvQvtCz0LXRgNCwXG4gICAgICAgIHRoaXMubG9nZ2VyLnVwZGF0ZVNldHRpbmdzKHtcbiAgICAgICAgICAgIGNvbnNvbGVMb2dMZXZlbDogdGhpcy5zZXR0aW5ncy5jb25zb2xlTG9nTGV2ZWwsXG4gICAgICAgICAgICBmaWxlTG9nZ2luZ0VuYWJsZWQ6IHRoaXMuc2V0dGluZ3MuZmlsZUxvZ2dpbmdFbmFibGVkLFxuICAgICAgICAgICAgZmlsZUxvZ0xldmVsOiB0aGlzLnNldHRpbmdzLmZpbGVMb2dMZXZlbCxcbiAgICAgICAgICAgIGxvZ0NhbGxlckluZm86IHRoaXMuc2V0dGluZ3MubG9nQ2FsbGVySW5mbyxcbiAgICAgICAgICAgIGxvZ0ZpbGVQYXRoOiB0aGlzLnNldHRpbmdzLmxvZ0ZpbGVQYXRoLFxuICAgICAgICAgICAgbG9nRmlsZU1heFNpemVNQjogdGhpcy5zZXR0aW5ncy5sb2dGaWxlTWF4U2l6ZU1CLFxuICAgICAgICAgfSk7XG4gICAgICAgIC8vINCe0L3QvtCy0LvRjtGU0LzQviDRiNC70Y/RhSDQtNC+INGE0LDQudC70YMg0LfQsNCy0LTQsNC90Ywg0YLQsCDQt9Cw0LLQsNC90YLQsNC20YPRlNC80L4g0ZfRhVxuICAgICAgICB0aGlzLnVwZGF0ZURhaWx5VGFza0ZpbGVQYXRoKCk7XG4gICAgICAgIHRoaXMubG9hZEFuZFByb2Nlc3NJbml0aWFsVGFza3MoKTsgLy8g0J3QtSDQsdC70L7QutGD0ZTQvNC+INC/0L7RgtGW0LosINGF0LDQuSDQv9GA0LDRhtGO0ZQg0LDRgdC40L3RhdGA0L7QvdC90L5cbiAgICAgICAgLy8g0J7QvdC+0LLQu9GO0ZTQvNC+INC60L7QvdGE0ZbQs9GD0YDQsNGG0ZbRjiBPbGxhbWEgU2VydmljZSAo0L3QsNC/0YAuLCBVUkwpXG4gICAgICAgIHRoaXMudXBkYXRlT2xsYW1hU2VydmljZUNvbmZpZygpO1xuICAgICAgICAvLyDQodC60LjQtNCw0ZTQvNC+INC60LXRiCDRgNC+0LvQtdC5INGC0LAg0YHQv9C+0LLRltGJ0LDRlNC80L4g0L/RgNC+INGX0YUg0L7QvdC+0LLQu9C10L3QvdGPXG4gICAgICAgIHRoaXMucm9sZUxpc3RDYWNoZSA9IG51bGw7XG4gICAgICAgIHRoaXMucHJvbXB0U2VydmljZT8uY2xlYXJSb2xlQ2FjaGU/LigpO1xuICAgICAgICB0aGlzLmVtaXQoXCJyb2xlcy11cGRhdGVkXCIpO1xuICAgICAgICAvLyDQodC/0L7QstGW0YnQsNGU0LzQviBWaWV3INC/0YDQviDQvtC90L7QstC70LXQvdC90Y8g0L3QsNC70LDRiNGC0YPQstCw0L3RjFxuICAgICAgICB0aGlzLnZpZXc/LmhhbmRsZVNldHRpbmdzVXBkYXRlZD8uKCk7XG4gICAgICB9KVxuICAgICk7XG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgLy8gLS0tINCU0L7QtNCw0LLQsNC90L3RjyDRgdGC0YDRltGH0LrQuCAoUmliYm9uKSDRgtCwINC60L7QvNCw0L3QtCAtLS1cbiAgICB0aGlzLmFkZFJpYmJvbkljb24oXCJicmFpbi1jaXJjdWl0XCIsIFwiT3BlbiBBSSBGb3JnZSBDaGF0XCIsICgpID0+IHtcbiAgICAgIHRoaXMuYWN0aXZhdGVWaWV3KCk7XG4gICAgfSk7XG4gICAgLy8g0JrQvtC80LDQvdC00LAg0LTQu9GPINCy0ZbQtNC60YDQuNGC0YLRjyDRh9Cw0YLRg1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJvcGVuLWNoYXQtdmlld1wiLFxuICAgICAgbmFtZTogXCJPcGVuIEFJIEZvcmdlIENoYXRcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XG4gICAgICAgIHRoaXMuYWN0aXZhdGVWaWV3KCk7XG4gICAgICB9LFxuICAgIH0pO1xuICAgIC8vINCa0L7QvNCw0L3QtNCwINC00LvRjyDRltC90LTQtdC60YHQsNGG0ZbRlyBSQUdcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiaW5kZXgtcmFnLWRvY3VtZW50c1wiLFxuICAgICAgbmFtZTogXCJBSSBGb3JnZTogSW5kZXggZG9jdW1lbnRzIGZvciBSQUdcIixcbiAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLnJhZ0VuYWJsZWQpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucmFnU2VydmljZS5pbmRleERvY3VtZW50cygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIlJBRyBpcyBkaXNhYmxlZCBpbiBzZXR0aW5ncy5cIik7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG4gICAgLy8g0JrQvtC80LDQvdC00LAg0LTQu9GPINC+0YfQuNGJ0LXQvdC90Y8g0ZbRgdGC0L7RgNGW0Zcg0LDQutGC0LjQstC90L7Qs9C+INGH0LDRgtGDXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImNsZWFyLWFjdGl2ZS1jaGF0LWhpc3RvcnlcIixcbiAgICAgIG5hbWU6IFwiQUkgRm9yZ2U6IENsZWFyIEFjdGl2ZSBDaGF0IEhpc3RvcnlcIixcbiAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMuY2xlYXJNZXNzYWdlSGlzdG9yeVdpdGhDb25maXJtYXRpb24oKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgLy8g0JrQvtC80LDQvdC00LAg0LTQu9GPINC+0L3QvtCy0LvQtdC90L3RjyDRgdC/0LjRgdC60YMg0YDQvtC70LXQuVxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJyZWZyZXNoLXJvbGVzXCIsXG4gICAgICBuYW1lOiBcIkFJIEZvcmdlOiBSZWZyZXNoIFJvbGVzIExpc3RcIixcbiAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMubGlzdFJvbGVGaWxlcyh0cnVlKTsgLy8g0J/RgNC40LzRg9GB0L7QstC+INC+0L3QvtCy0LvRjtGU0LzQviDRgdC/0LjRgdC+0LpcbiAgICAgICAgdGhpcy5lbWl0KFwicm9sZXMtdXBkYXRlZFwiKTsgLy8g0KHQv9C+0LLRltGJ0LDRlNC80L4gVUlcbiAgICAgICAgbmV3IE5vdGljZShcIlJvbGUgbGlzdCByZWZyZXNoZWQuXCIpO1xuICAgICAgfSxcbiAgICB9KTtcbiAgICAvLyDQmtC+0LzQsNC90LTQsCDQtNC70Y8g0YHRgtCy0L7RgNC10L3QvdGPINC90L7QstC+0LPQviDRh9Cw0YLRg1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJuZXctY2hhdFwiLFxuICAgICAgbmFtZTogXCJBSSBGb3JnZTogTmV3IENoYXRcIixcbiAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IG5ld0NoYXQgPSBhd2FpdCB0aGlzLmNoYXRNYW5hZ2VyLmNyZWF0ZU5ld0NoYXQoKTtcbiAgICAgICAgaWYgKG5ld0NoYXQpIHtcbiAgICAgICAgICBuZXcgTm90aWNlKGBDcmVhdGVkIG5ldyBjaGF0OiAke25ld0NoYXQubWV0YWRhdGEubmFtZX1gKTtcbiAgICAgICAgICAgLy8g0KTQvtC60YPRgSDQvdCwINC/0L7Qu9C1INCy0LLQvtC00YMg0LzQvtC20LUg0L7QsdGA0L7QsdC70Y/RgtC40YHRjyDRh9C10YDQtdC3INC/0L7QtNGW0Y4gJ2FjdGl2ZS1jaGF0LWNoYW5nZWQnINGDIFZpZXdcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgbmV3IE5vdGljZShcIkZhaWxlZCB0byBjcmVhdGUgbmV3IGNoYXQuXCIpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuICAgIC8vINCa0L7QvNCw0L3QtNCwINC00LvRjyDQv9C10YDQtdC80LjQutCw0L3QvdGPINGH0LDRgtGW0LIgKFVJINC90LUg0YDQtdCw0LvRltC30L7QstCw0L3QvilcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwic3dpdGNoLWNoYXRcIixcbiAgICAgIG5hbWU6IFwiQUkgRm9yZ2U6IFN3aXRjaCBDaGF0XCIsXG4gICAgICBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgICBhd2FpdCB0aGlzLnNob3dDaGF0U3dpdGNoZXIoKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgLy8g0JrQvtC80LDQvdC00LAg0LTQu9GPINC/0LXRgNC10LnQvNC10L3Rg9Cy0LDQvdC90Y8g0LDQutGC0LjQstC90L7Qs9C+INGH0LDRgtGDXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInJlbmFtZS1hY3RpdmUtY2hhdFwiLFxuICAgICAgbmFtZTogXCJBSSBGb3JnZTogUmVuYW1lIEFjdGl2ZSBDaGF0XCIsXG4gICAgICBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgICBhd2FpdCB0aGlzLnJlbmFtZUFjdGl2ZUNoYXQoKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgLy8g0JrQvtC80LDQvdC00LAg0LTQu9GPINCy0LjQtNCw0LvQtdC90L3RjyDQsNC60YLQuNCy0L3QvtCz0L4g0YfQsNGC0YNcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiZGVsZXRlLWFjdGl2ZS1jaGF0XCIsXG4gICAgICBuYW1lOiBcIkFJIEZvcmdlOiBEZWxldGUgQWN0aXZlIENoYXRcIixcbiAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlQWN0aXZlQ2hhdFdpdGhDb25maXJtYXRpb24oKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIC8vINCU0L7QtNCw0ZTQvNC+INCy0LrQu9Cw0LTQutGDINC90LDQu9Cw0YjRgtGD0LLQsNC90YxcbiAgICB0aGlzLnNldHRpbmdUYWIgPSBuZXcgT2xsYW1hU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcyk7XG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKHRoaXMuc2V0dGluZ1RhYik7XG5cbiAgICAvLyDQktC40LrQvtC90YPRlNC80L4g0LTRltGXINC/0ZbRgdC70Y8g0YLQvtCz0L4sINGP0Log0YDQvtCx0L7Rh9C40Lkg0L/RgNC+0YHRgtGW0YAg0LPQvtGC0L7QstC40LlcbiAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeShhc3luYyAoKSA9PiB7XG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKFwiV29ya3NwYWNlIGxheW91dCByZWFkeS5cIik7XG4gICAgICAvLyDQkNCy0YLQvtC80LDRgtC40YfQvdCwINGW0L3QtNC10LrRgdCw0YbRltGPIFJBRyDQv9GA0Lgg0YHRgtCw0YDRgtGWLCDRj9C60YnQviDRg9Cy0ZbQvNC60L3QtdC90L5cbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLnJhZ0VuYWJsZWQgJiYgdGhpcy5zZXR0aW5ncy5yYWdBdXRvSW5kZXhPblN0YXJ0dXApIHtcbiAgICAgICAgdGhpcy5sb2dnZXIuaW5mbyhcIlJBRyBlbmFibGVkLCBzdGFydGluZyBpbml0aWFsIGluZGV4aW5nIGFmdGVyIGRlbGF5Li4uXCIpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICB0aGlzLnJhZ1NlcnZpY2U/LmluZGV4RG9jdW1lbnRzKCk7XG4gICAgICAgIH0sIDUwMDApOyAvLyDQl9Cw0L/Rg9GB0LrQsNGU0LzQviDQtyDQvdC10LLQtdC70LjQutC+0Y4g0LfQsNGC0YDQuNC80LrQvtGOXG4gICAgICB9XG4gICAgICAvLyDQodC/0YDQvtCx0LAg0LLRltC00L3QvtCy0LjRgtC4INCw0LrRgtC40LLQvdC40Lkg0YfQsNGCIC0g0YbRjyDQu9C+0LPRltC60LAg0YLQtdC/0LXRgCDQstC40LrQvtC90YPRlNGC0YzRgdGPINCyIGNoYXRNYW5hZ2VyLmluaXRpYWxpemUoKVxuICAgICAgLy8gY29uc3Qgc2F2ZWRBY3RpdmVJZCA9IGF3YWl0IHRoaXMubG9hZERhdGFLZXkoQUNUSVZFX0NIQVRfSURfS0VZKTtcbiAgICAgIC8vIGlmIChzYXZlZEFjdGl2ZUlkICYmIHRoaXMuc2V0dGluZ3Muc2F2ZU1lc3NhZ2VIaXN0b3J5ICYmIHRoaXMuY2hhdE1hbmFnZXIpIHtcbiAgICAgIC8vICAgIGF3YWl0IHRoaXMuY2hhdE1hbmFnZXIuc2V0QWN0aXZlQ2hhdChzYXZlZEFjdGl2ZUlkKTtcbiAgICAgIC8vIH1cbiAgICB9KTtcblxuICAgIC8vIC0tLSDQoNC10ZTRgdGC0YDQsNGG0ZbRjyDRgdC70YPRhdCw0YfRltCyIFZhdWx0INC00LvRjyDQv9Cw0L/QutC4INCn0JDQotCG0JIgLS0tXG4gICAgdGhpcy5yZWdpc3RlclZhdWx0TGlzdGVuZXJzKCk7IC8vINCS0LjQutC70LjQutCw0ZTQvNC+INC80LXRgtC+0LQg0YDQtdGU0YHRgtGA0LDRhtGW0ZdcbiAgICAvLyAtLS1cblxuICAgIC8vIC0tLSDQoNC10ZTRgdGC0YDQsNGG0ZbRjyDRgdC70YPRhdCw0YfRltCyINC00LvRjyDQv9Cw0L/QutC4INCg0J7Qm9CV0Jkg0YLQsCBSQUcgLS0tXG4gICAgLy8g0KbRliDRgdC70YPRhdCw0YfRliDQndCVINC/0L7QstC40L3QvdGWINCy0LjQutC70LjQutCw0YLQuCDQv9C+0LLQvdC40LkgcmVidWlsZCDRltC90LTQtdC60YHRgyDRh9Cw0YLRltCyXG4gICAgY29uc3QgZGVib3VuY2VkUm9sZUNsZWFyID0gZGVib3VuY2UoICgpID0+IHtcbiAgICAgICAgLy8gdGhpcy5sb2dnZXIuZGVidWcoXCJEZWJvdW5jZWQgcm9sZSBjYWNoZSBjbGVhciB0cmlnZ2VyZWQuXCIpO1xuICAgICAgICB0aGlzLnJvbGVMaXN0Q2FjaGUgPSBudWxsOyAvLyDQodC60LjQtNCw0ZTQvNC+INC60LXRiCDRgdC/0LjRgdC60YMg0YDQvtC70LXQuVxuICAgICAgICB0aGlzLnByb21wdFNlcnZpY2U/LmNsZWFyUm9sZUNhY2hlPy4oKTsgLy8g0KHQutC40LTQsNGU0LzQviDQutC10Ygg0LrQvtC90YLQtdC90YLRgyDRgNC+0LvQtdC5XG4gICAgICAgIHRoaXMuZW1pdChcInJvbGVzLXVwZGF0ZWRcIik7IC8vINCh0L/QvtCy0ZbRidCw0ZTQvNC+INC/0YDQviDQvdC10L7QsdGF0ZbQtNC90ZbRgdGC0Ywg0L7QvdC+0LLQuNGC0Lgg0YHQv9C40YHQutC4INGA0L7Qu9C10Lkg0LIgVUlcbiAgICAgIH0sIDE1MDAsIHRydWUgKTsgLy8g0JfQsNGC0YDQuNC80LrQsCDRgtCwINC90LXQs9Cw0LnQvdC1INCy0LjQutC+0L3QsNC90L3Rj1xuXG4gICAgLy8g0KHRgtCy0L7RgNGO0ZTQvNC+INC+0LHRgNC+0LHQvdC40LrQuCDQtNC70Y8g0L/QvtC00ZbQuSBWYXVsdCwg0Y/QutGWINGB0YLQvtGB0YPRjtGC0YzRgdGPINGA0L7Qu9C10LkvUkFHXG4gICAgY29uc3QgaGFuZGxlTW9kaWZ5RXZlbnQgPSAoZmlsZTogVEFic3RyYWN0RmlsZSkgPT4ge1xuICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICB0aGlzLmhhbmRsZVJvbGVPclJhZ0ZpbGVDaGFuZ2UoZmlsZS5wYXRoLCBkZWJvdW5jZWRSb2xlQ2xlYXIsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5oYW5kbGVUYXNrRmlsZU1vZGlmeShmaWxlKTsgLy8g0J7QutGA0LXQvNCwINC+0LHRgNC+0LHQutCwINGE0LDQudC70YMg0LfQsNCy0LTQsNC90YxcbiAgICAgIH1cbiAgICB9O1xuICAgIGNvbnN0IGhhbmRsZURlbGV0ZUV2ZW50ID0gKGZpbGU6IFRBYnN0cmFjdEZpbGUpID0+IHtcbiAgICAgIHRoaXMuaGFuZGxlUm9sZU9yUmFnRmlsZUNoYW5nZShmaWxlLnBhdGgsIGRlYm91bmNlZFJvbGVDbGVhciwgdHJ1ZSk7IC8vINCf0L7QvNGW0YfQsNGU0LzQviDRj9C6INCy0LjQtNCw0LvQtdC90L3Rj1xuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMgJiYgZmlsZS5wYXRoID09PSB0aGlzLmRhaWx5VGFza0ZpbGVQYXRoKSB7XG4gICAgICAgICAvLyDQr9C60YnQviDQstC40LTQsNC70LXQvdC+INGE0LDQudC7INC30LDQstC00LDQvdGMXG4gICAgICAgICB0aGlzLmRhaWx5VGFza0ZpbGVQYXRoID0gbnVsbDtcbiAgICAgICAgIHRoaXMudGFza0ZpbGVDb250ZW50Q2FjaGUgPSBudWxsO1xuICAgICAgICAgdGhpcy50YXNrRmlsZU5lZWRzVXBkYXRlID0gZmFsc2U7XG4gICAgICAgICB0aGlzLmNoYXRNYW5hZ2VyPy51cGRhdGVUYXNrU3RhdGUobnVsbCk7IC8vINCh0LrQuNC00LDRlNC80L4g0YHRgtCw0L0g0LfQsNCy0LTQsNC90YxcbiAgICAgIH1cbiAgICB9O1xuICAgIGNvbnN0IGhhbmRsZVJlbmFtZUV2ZW50ID0gKGZpbGU6IFRBYnN0cmFjdEZpbGUsIG9sZFBhdGg6IHN0cmluZykgPT4ge1xuICAgICAgLy8g0KDQtdCw0LPRg9GU0LzQviDRliDQvdCwINC90L7QstC40LksINGWINC90LAg0YHRgtCw0YDQuNC5INGI0LvRj9GFINC00LvRjyDRgNC+0LvQtdC5L1JBR1xuICAgICAgdGhpcy5oYW5kbGVSb2xlT3JSYWdGaWxlQ2hhbmdlKGZpbGUucGF0aCwgZGVib3VuY2VkUm9sZUNsZWFyLCBmYWxzZSk7XG4gICAgICB0aGlzLmhhbmRsZVJvbGVPclJhZ0ZpbGVDaGFuZ2Uob2xkUGF0aCwgZGVib3VuY2VkUm9sZUNsZWFyLCB0cnVlKTtcbiAgICAgIC8vINCe0LHRgNC+0LHQutCwINC/0LXRgNC10LnQvNC10L3Rg9Cy0LDQvdC90Y8g0YTQsNC50LvRgyDQt9Cw0LLQtNCw0L3RjFxuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMpIHtcbiAgICAgICAgaWYgKG9sZFBhdGggPT09IHRoaXMuZGFpbHlUYXNrRmlsZVBhdGgpIHsgLy8g0K/QutGJ0L4g0L/QtdGA0LXQudC80LXQvdC+0LLQsNC90L4g0YTQsNC50Lsg0LfQsNCy0LTQsNC90YxcbiAgICAgICAgICB0aGlzLnVwZGF0ZURhaWx5VGFza0ZpbGVQYXRoKCk7IC8vINCe0L3QvtCy0LvRjtGU0LzQviDRiNC70Y/RhVxuICAgICAgICAgIHRoaXMubG9hZEFuZFByb2Nlc3NJbml0aWFsVGFza3MoKTsgLy8g0J/QtdGA0LXQt9Cw0LLQsNC90YLQsNC20YPRlNC80L4g0LfQsNCy0LTQsNC90L3Rj1xuICAgICAgICB9IGVsc2UgaWYgKGZpbGUucGF0aCA9PT0gdGhpcy5kYWlseVRhc2tGaWxlUGF0aCkgeyAvLyDQr9C60YnQviDRj9C60LjQudGB0Ywg0YTQsNC50Lsg0L/QtdGA0LXQudC80LXQvdC+0LLQsNC90L4g0J3QkCDRhNCw0LnQuyDQt9Cw0LLQtNCw0L3RjFxuICAgICAgICAgIHRoaXMudGFza0ZpbGVOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgdGhpcy5jaGVja0FuZFByb2Nlc3NUYXNrVXBkYXRlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuICAgIGNvbnN0IGhhbmRsZUNyZWF0ZUV2ZW50ID0gKGZpbGU6IFRBYnN0cmFjdEZpbGUpID0+IHtcbiAgICAgICAgLy8g0KbQtdC5ICdjcmVhdGUnINC+0LHRgNC+0LHQu9GP0ZQg0YHRgtCy0L7RgNC10L3QvdGPINGE0LDQudC70ZbQsiDRgNC+0LvQtdC5L1JBR1xuICAgICAgICB0aGlzLmhhbmRsZVJvbGVPclJhZ0ZpbGVDaGFuZ2UoZmlsZS5wYXRoLCBkZWJvdW5jZWRSb2xlQ2xlYXIsIGZhbHNlKTtcbiAgICAgICAgLy8g0J7QsdGA0L7QsdC60LAg0YHRgtCy0L7RgNC10L3QvdGPINGE0LDQudC70YMg0LfQsNCy0LTQsNC90YxcbiAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMgJiYgZmlsZS5wYXRoID09PSB0aGlzLmRhaWx5VGFza0ZpbGVQYXRoKSB7XG4gICAgICAgICAgICB0aGlzLnRhc2tGaWxlTmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5jaGVja0FuZFByb2Nlc3NUYXNrVXBkYXRlKCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8vINCg0LXRlNGB0YLRgNGD0ZTQvNC+INGG0ZYg0L7QutGA0LXQvNGWINC+0LHRgNC+0LHQvdC40LrQuFxuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcIm1vZGlmeVwiLCBoYW5kbGVNb2RpZnlFdmVudCkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcImRlbGV0ZVwiLCBoYW5kbGVEZWxldGVFdmVudCkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcInJlbmFtZVwiLCBoYW5kbGVSZW5hbWVFdmVudCkpO1xuICAgIC8vINCS0LDQttC70LjQstC+OiDQptC10LkgJ2NyZWF0ZScg0L7QsdGA0L7QsdC70Y/RlCDRgNC+0LvRli9SQUcsINCwINGC0L7QuSwg0YnQviDQsiByZWdpc3RlclZhdWx0TGlzdGVuZXJzIC0g0YfQsNGC0LguXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiY3JlYXRlXCIsIGhhbmRsZUNyZWF0ZUV2ZW50KSk7XG4gICAgLy8gLS0tXG5cbiAgICAvLyAtLS0g0JvQvtCz0ZbQutCwINGE0LDQudC70YMg0LfQsNCy0LTQsNC90YwgLS0tXG4gICAgdGhpcy51cGRhdGVEYWlseVRhc2tGaWxlUGF0aCgpOyAvLyDQktC40LfQvdCw0YfQsNGU0LzQviDRiNC70Y/RhSDQtNC+INGE0LDQudC70YMg0LfQsNCy0LTQsNC90YxcbiAgICBhd2FpdCB0aGlzLmxvYWRBbmRQcm9jZXNzSW5pdGlhbFRhc2tzKCk7IC8vINCX0LDQstCw0L3RgtCw0LbRg9GU0LzQviDQv9C+0YfQsNGC0LrQvtCy0LjQuSDRgdGC0LDQvSDQt9Cw0LLQtNCw0L3RjFxuICAgIGlmICh0aGlzLnNldHRpbmdzLmVuYWJsZVByb2R1Y3Rpdml0eUZlYXR1cmVzKSB7XG4gICAgICAvLyDQl9Cw0L/Rg9GB0LrQsNGU0LzQviDQv9C10YDRltC+0LTQuNGH0L3RgyDQv9C10YDQtdCy0ZbRgNC60YMg0L7QvdC+0LLQu9C10L3RjCDRhNCw0LnQu9GDINC30LDQstC00LDQvdGMXG4gICAgICB0aGlzLnRhc2tDaGVja0ludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4gdGhpcy5jaGVja0FuZFByb2Nlc3NUYXNrVXBkYXRlKCksIDUwMDApO1xuICAgICAgdGhpcy5yZWdpc3RlckludGVydmFsKHRoaXMudGFza0NoZWNrSW50ZXJ2YWwgYXMgYW55KTsgLy8g0KDQtdGU0YHRgtGA0YPRlNC80L4g0ZbQvdGC0LXRgNCy0LDQuyDQtNC70Y8g0LDQstGC0L4t0L7Rh9C40YnQtdC90L3Rj1xuICAgIH1cbiAgICAvLyB0aGlzLmxvZ2dlci5pbmZvKFwiQUkgRm9yZ2UgUGx1Z2luIGxvYWRlZCBzdWNjZXNzZnVsbHkuXCIpO1xuICB9IC8vIC0tLSDQutGW0L3QtdGG0Ywgb25sb2FkIC0tLVxuXG4gIHJlZ2lzdGVyVmF1bHRMaXN0ZW5lcnMoKTogdm9pZCB7XG4gICAgLy8g0J7QsdGA0L7QsdC90LjQuiDQtNC70Y8gY3JlYXRlINGC0LAgZGVsZXRlXG4gICAgY29uc3QgaGFuZGxlRmlsZUNyZWF0ZURlbGV0ZSA9IChmaWxlOiBUQWJzdHJhY3RGaWxlIHwgbnVsbCkgPT4ge1xuICAgICAgaWYgKCFmaWxlIHx8ICF0aGlzLmNoYXRNYW5hZ2VyIHx8ICF0aGlzLnNldHRpbmdzLmNoYXRIaXN0b3J5Rm9sZGVyUGF0aCkgcmV0dXJuO1xuICAgICAgY29uc3QgaGlzdG9yeVBhdGggPSBub3JtYWxpemVQYXRoKHRoaXMuc2V0dGluZ3MuY2hhdEhpc3RvcnlGb2xkZXJQYXRoKTtcbiAgICAgIC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4sINGH0Lgg0YTQsNC50Lsg0LfQvdCw0YXQvtC00LjRgtGM0YHRjyDQstGB0LXRgNC10LTQuNC90ZYg0L/QsNC/0LrQuCDRltGB0YLQvtGA0ZbRlyAo0L3QtSDRgdCw0LzQsCDQv9Cw0L/QutCwKVxuICAgICAgLy8g0ZYg0YfQuCDRhtC1IEpTT04g0YTQsNC50LsgKNC00LvRjyBjcmVhdGUpINCw0LHQviDQsdGD0LTRjC3Rj9C60LjQuSDRhNCw0LnQuy/Qv9Cw0L/QutCwICjQtNC70Y8gZGVsZXRlKVxuICAgICAgLy8g0JLQkNCW0JvQmNCS0J46INCf0LXRgNC10LLRltGA0LrQsCDQvdCwIGhpc3RvcnlQYXRoKycvJyDQs9Cw0YDQsNC90YLRg9GULCDRidC+INC80Lgg0L3QtSDRgNC10LDQs9GD0ZTQvNC+INC90LAg0YHQsNC80YMg0L/QsNC/0LrRgyDRltGB0YLQvtGA0ZbRl1xuICAgICAgaWYgKFxuICAgICAgICBmaWxlLnBhdGguc3RhcnRzV2l0aChoaXN0b3J5UGF0aCArIFwiL1wiKSAmJlxuICAgICAgICAoZmlsZS5wYXRoLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoXCIuanNvblwiKSB8fCBmaWxlIGluc3RhbmNlb2YgVEZvbGRlcilcbiAgICAgICkge1xuICAgICAgICAvLyB0aGlzLmxvZ2dlci5lcnJvcihcbiAgICAgICAgLy8gICBgW1ZBVUxUIEhBTkRMRVJdIFZhdWx0IGNoYW5nZSAoY3JlYXRlL2RlbGV0ZSkgZGV0ZWN0ZWQgaW5zaWRlIGhpc3RvcnkgZm9sZGVyOiAke2ZpbGUucGF0aH0uIFRyaWdnZXJpbmcgcmVidWlsZC5gXG4gICAgICAgIC8vICk7XG4gICAgICAgIHRoaXMuZGVib3VuY2VkSW5kZXhBbmRVSVJlYnVpbGQoKTsgLy8g0JLQuNC60LvQuNC60LDRlNC80L4gZGVib3VuY2VkINC+0L3QvtCy0LvQtdC90L3Rj1xuICAgICAgfVxuICAgIH07XG5cbiAgICAvLyDQntCx0YDQvtCx0L3QuNC6INC00LvRjyByZW5hbWVcbiAgICBjb25zdCBoYW5kbGVGaWxlUmVuYW1lID0gKGZpbGU6IFRBYnN0cmFjdEZpbGUgfCBudWxsLCBvbGRQYXRoOiBzdHJpbmcpID0+IHtcbiAgICAgIGlmICghZmlsZSB8fCAhdGhpcy5jaGF0TWFuYWdlciB8fCAhdGhpcy5zZXR0aW5ncy5jaGF0SGlzdG9yeUZvbGRlclBhdGgpIHJldHVybjtcbiAgICAgIGNvbnN0IGhpc3RvcnlQYXRoID0gbm9ybWFsaXplUGF0aCh0aGlzLnNldHRpbmdzLmNoYXRIaXN0b3J5Rm9sZGVyUGF0aCk7XG4gICAgICAvLyDQn9C10YDQtdCy0ZbRgNGP0ZTQvNC+LCDRh9C4INGB0YLQsNGA0LjQuSDQkNCR0J4g0L3QvtCy0LjQuSDRiNC70Y/RhSDQt9C90LDRhdC+0LTQuNGC0YzRgdGPINCy0YHQtdGA0LXQtNC40L3RliDQv9Cw0L/QutC4INGW0YHRgtC+0YDRltGXXG4gICAgICBjb25zdCBpc0luSGlzdG9yeU5ldyA9IGZpbGUucGF0aC5zdGFydHNXaXRoKGhpc3RvcnlQYXRoICsgXCIvXCIpO1xuICAgICAgY29uc3QgaXNJbkhpc3RvcnlPbGQgPSBvbGRQYXRoLnN0YXJ0c1dpdGgoaGlzdG9yeVBhdGggKyBcIi9cIik7XG5cbiAgICAgIC8vINCg0LXQsNCz0YPRlNC80L4sINGC0ZbQu9GM0LrQuCDRj9C60YnQviDQt9C80ZbQvdCwINGB0YLQvtGB0YPRlNGC0YzRgdGPINGE0LDQudC70ZbQsi/Qv9Cw0L/QvtC6INCS0KHQldCg0JXQlNCY0J3QhiDQv9Cw0L/QutC4INGW0YHRgtC+0YDRltGXXG4gICAgICBpZiAoKGlzSW5IaXN0b3J5TmV3IHx8IGlzSW5IaXN0b3J5T2xkKSAmJiBmaWxlLnBhdGggIT09IGhpc3RvcnlQYXRoICYmIG9sZFBhdGggIT09IGhpc3RvcnlQYXRoKSB7XG4gICAgICAgIC8vIHRoaXMubG9nZ2VyLmVycm9yKFxuICAgICAgICAvLyAgIGBbVkFVTFQgSEFORExFUl0gVmF1bHQgcmVuYW1lIGRldGVjdGVkIGludm9sdmluZyBoaXN0b3J5IGZvbGRlcjogJHtvbGRQYXRofSAtPiAke2ZpbGUucGF0aH0uIFRyaWdnZXJpbmcgcmVidWlsZC5gXG4gICAgICAgIC8vICk7XG4gICAgICAgIHRoaXMuZGVib3VuY2VkSW5kZXhBbmRVSVJlYnVpbGQoKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8g0KDQtdGU0YHRgtGA0YPRlNC80L4g0L/QvtC00ZbRl1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcImNyZWF0ZVwiLCBoYW5kbGVGaWxlQ3JlYXRlRGVsZXRlKSk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiZGVsZXRlXCIsIGhhbmRsZUZpbGVDcmVhdGVEZWxldGUpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oXCJyZW5hbWVcIiwgaGFuZGxlRmlsZVJlbmFtZSkpO1xuICB9XG5cbiAgLy8gLS0tINCb0L7Qs9GW0LrQsCDRhNCw0LnQu9GDINC30LDQstC00LDQvdGMIC0tLVxuICB1cGRhdGVEYWlseVRhc2tGaWxlUGF0aCgpOiB2b2lkIHtcbiAgICBjb25zdCBmb2xkZXJQYXRoID0gdGhpcy5zZXR0aW5ncy5yYWdGb2xkZXJQYXRoPy50cmltKCk7XG4gICAgY29uc3QgZmlsZU5hbWUgPSB0aGlzLnNldHRpbmdzLmRhaWx5VGFza0ZpbGVOYW1lPy50cmltKCk7XG4gICAgY29uc3QgbmV3UGF0aCA9IGZvbGRlclBhdGggJiYgZmlsZU5hbWUgPyBub3JtYWxpemVQYXRoKGAke2ZvbGRlclBhdGh9LyR7ZmlsZU5hbWV9YCkgOiBudWxsO1xuICAgIGlmIChuZXdQYXRoICE9PSB0aGlzLmRhaWx5VGFza0ZpbGVQYXRoKSB7XG4gICAgICB0aGlzLmRhaWx5VGFza0ZpbGVQYXRoID0gbmV3UGF0aDtcbiAgICAgIHRoaXMudGFza0ZpbGVDb250ZW50Q2FjaGUgPSBudWxsO1xuICAgICAgdGhpcy50YXNrRmlsZU5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKCFuZXdQYXRoICYmIHRoaXMuZGFpbHlUYXNrRmlsZVBhdGggIT09IG51bGwpIHtcbiAgICAgIHRoaXMuZGFpbHlUYXNrRmlsZVBhdGggPSBudWxsO1xuICAgICAgdGhpcy50YXNrRmlsZUNvbnRlbnRDYWNoZSA9IG51bGw7XG4gICAgICB0aGlzLmNoYXRNYW5hZ2VyPy51cGRhdGVUYXNrU3RhdGUobnVsbCk7XG4gICAgICB0aGlzLnRhc2tGaWxlTmVlZHNVcGRhdGUgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVUYXNrRmlsZU1vZGlmeShmaWxlOiBURmlsZSk6IHZvaWQge1xuICAgIGlmICh0aGlzLnNldHRpbmdzLmVuYWJsZVByb2R1Y3Rpdml0eUZlYXR1cmVzICYmIGZpbGUucGF0aCA9PT0gdGhpcy5kYWlseVRhc2tGaWxlUGF0aCkge1xuICAgICAgaWYgKCF0aGlzLnRhc2tGaWxlTmVlZHNVcGRhdGUpIHtcbiAgICAgICAgdGhpcy50YXNrRmlsZU5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyBsb2FkQW5kUHJvY2Vzc0luaXRpYWxUYXNrcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMgfHwgIXRoaXMuZGFpbHlUYXNrRmlsZVBhdGgpIHtcbiAgICAgIGlmICh0aGlzLnRhc2tGaWxlQ29udGVudENhY2hlICE9PSBudWxsKSB7XG4gICAgICAgIHRoaXMudGFza0ZpbGVDb250ZW50Q2FjaGUgPSBudWxsO1xuICAgICAgICB0aGlzLmNoYXRNYW5hZ2VyPy51cGRhdGVUYXNrU3RhdGUobnVsbCk7XG4gICAgICB9XG4gICAgICB0aGlzLnRhc2tGaWxlTmVlZHNVcGRhdGUgPSBmYWxzZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgZmlsZUV4aXN0cyA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIuZXhpc3RzKHRoaXMuZGFpbHlUYXNrRmlsZVBhdGgpO1xuICAgICAgaWYgKGZpbGVFeGlzdHMpIHtcbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIucmVhZCh0aGlzLmRhaWx5VGFza0ZpbGVQYXRoKTtcbiAgICAgICAgaWYgKGNvbnRlbnQgIT09IHRoaXMudGFza0ZpbGVDb250ZW50Q2FjaGUgfHwgdGhpcy50YXNrRmlsZUNvbnRlbnRDYWNoZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHRoaXMudGFza0ZpbGVDb250ZW50Q2FjaGUgPSBjb250ZW50O1xuICAgICAgICAgIGNvbnN0IHRhc2tzID0gdGhpcy5wYXJzZVRhc2tzKGNvbnRlbnQpO1xuXG4gICAgICAgICAgdGhpcy5jaGF0TWFuYWdlcj8udXBkYXRlVGFza1N0YXRlKHRhc2tzKTtcbiAgICAgICAgICB0aGlzLnRhc2tGaWxlTmVlZHNVcGRhdGUgPSBmYWxzZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnRhc2tGaWxlTmVlZHNVcGRhdGUgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKHRoaXMudGFza0ZpbGVDb250ZW50Q2FjaGUgIT09IG51bGwpIHtcbiAgICAgICAgICB0aGlzLnRhc2tGaWxlQ29udGVudENhY2hlID0gbnVsbDtcbiAgICAgICAgICB0aGlzLmNoYXRNYW5hZ2VyPy51cGRhdGVUYXNrU3RhdGUobnVsbCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50YXNrRmlsZU5lZWRzVXBkYXRlID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmICh0aGlzLnRhc2tGaWxlQ29udGVudENhY2hlICE9PSBudWxsKSB7XG4gICAgICAgIHRoaXMudGFza0ZpbGVDb250ZW50Q2FjaGUgPSBudWxsO1xuICAgICAgICB0aGlzLmNoYXRNYW5hZ2VyPy51cGRhdGVUYXNrU3RhdGUobnVsbCk7XG4gICAgICB9XG4gICAgICB0aGlzLnRhc2tGaWxlTmVlZHNVcGRhdGUgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBwYXJzZVRhc2tzKGNvbnRlbnQ6IHN0cmluZyk6IHsgdXJnZW50OiBzdHJpbmdbXTsgcmVndWxhcjogc3RyaW5nW107IGhhc0NvbnRlbnQ6IGJvb2xlYW4gfSB7XG4gICAgY29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KFwiXFxuXCIpO1xuICAgIGNvbnN0IHVyZ2VudDogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCByZWd1bGFyOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBoYXNDb250ZW50ID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCB0cmltbWVkTGluZSA9IGxpbmUudHJpbSgpO1xuICAgICAgaWYgKCF0cmltbWVkTGluZSkgY29udGludWU7XG4gICAgICBoYXNDb250ZW50ID0gdHJ1ZTtcbiAgICAgIGlmICh0cmltbWVkTGluZS5zdGFydHNXaXRoKFwiLSBbeF1cIikgfHwgdHJpbW1lZExpbmUuc3RhcnRzV2l0aChcIi0gW1hdXCIpKSBjb250aW51ZTtcbiAgICAgIGxldCB0YXNrVGV4dCA9IHRyaW1tZWRMaW5lO1xuICAgICAgbGV0IGlzVXJnZW50ID0gZmFsc2U7XG4gICAgICBpZiAodGFza1RleHQuc3RhcnRzV2l0aChcIiFcIikgfHwgdGFza1RleHQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhcIlt1cmdlbnRdXCIpKSB7XG4gICAgICAgIGlzVXJnZW50ID0gdHJ1ZTtcbiAgICAgICAgdGFza1RleHQgPSB0YXNrVGV4dFxuICAgICAgICAgIC5yZXBsYWNlKC9eIS8sIFwiXCIpXG4gICAgICAgICAgLnJlcGxhY2UoL1xcW3VyZ2VudFxcXS9pLCBcIlwiKVxuICAgICAgICAgIC50cmltKCk7XG4gICAgICB9XG4gICAgICBpZiAodGFza1RleHQuc3RhcnRzV2l0aChcIi0gWyBdXCIpKSB7XG4gICAgICAgIHRhc2tUZXh0ID0gdGFza1RleHQuc3Vic3RyaW5nKHRhc2tUZXh0LmluZGV4T2YoXCJdXCIpICsgMSkudHJpbSgpO1xuICAgICAgfSBlbHNlIGlmICh0YXNrVGV4dC5zdGFydHNXaXRoKFwiLSBcIikpIHtcbiAgICAgICAgdGFza1RleHQgPSB0YXNrVGV4dC5zdWJzdHJpbmcoMSkudHJpbSgpO1xuICAgICAgfVxuICAgICAgaWYgKHRhc2tUZXh0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgaWYgKGlzVXJnZW50KSB7XG4gICAgICAgICAgdXJnZW50LnB1c2godGFza1RleHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlZ3VsYXIucHVzaCh0YXNrVGV4dCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgaGFzQWN0dWFsVGFza3MgPSB1cmdlbnQubGVuZ3RoID4gMCB8fCByZWd1bGFyLmxlbmd0aCA+IDA7XG4gICAgcmV0dXJuIHsgdXJnZW50OiB1cmdlbnQsIHJlZ3VsYXI6IHJlZ3VsYXIsIGhhc0NvbnRlbnQ6IGhhc0FjdHVhbFRhc2tzIH07XG4gIH1cblxuICBhc3luYyBjaGVja0FuZFByb2Nlc3NUYXNrVXBkYXRlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLnRhc2tGaWxlTmVlZHNVcGRhdGUgJiYgdGhpcy5zZXR0aW5ncy5lbmFibGVQcm9kdWN0aXZpdHlGZWF0dXJlcykge1xuICAgICAgYXdhaXQgdGhpcy5sb2FkQW5kUHJvY2Vzc0luaXRpYWxUYXNrcygpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvL1xuICAgIH1cbiAgfVxuICAvLyAtLS0g0JrRltC90LXRhtGMINC70L7Qs9GW0LrQuCDRhNCw0LnQu9GDINC30LDQstC00LDQvdGMIC0tLVxuXG4gIC8vINCe0LHRgNC+0LHQvdC40Log0LfQvNGW0L0g0LTQu9GPINGA0L7Qu9C10Lkg0YLQsCBSQUdcbiAgcHJpdmF0ZSBoYW5kbGVSb2xlT3JSYWdGaWxlQ2hhbmdlKGNoYW5nZWRQYXRoOiBzdHJpbmcsIGRlYm91bmNlZFJvbGVDbGVhcjogKCkgPT4gdm9pZCwgaXNEZWxldGlvbjogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgY29uc3Qgbm9ybVBhdGggPSBub3JtYWxpemVQYXRoKGNoYW5nZWRQYXRoKTtcblxuICAgIC8vIDEuINCf0LXRgNC10LLRltGA0LrQsCDQtNC70Y8g0KDQvtC70LXQuVxuICAgIGNvbnN0IHVzZXJSb2xlc1BhdGggPSB0aGlzLnNldHRpbmdzLnVzZXJSb2xlc0ZvbGRlclBhdGggPyBub3JtYWxpemVQYXRoKHRoaXMuc2V0dGluZ3MudXNlclJvbGVzRm9sZGVyUGF0aCkgOiBudWxsO1xuICAgIGNvbnN0IGJ1aWx0SW5Sb2xlc1BhdGggPSB0aGlzLm1hbmlmZXN0LmRpciA/IG5vcm1hbGl6ZVBhdGgoYCR7dGhpcy5tYW5pZmVzdC5kaXJ9L3JvbGVzYCkgOiBudWxsO1xuICAgIGxldCBpc1JvbGVGaWxlID0gZmFsc2U7XG4gICAgaWYgKG5vcm1QYXRoLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoXCIubWRcIikpIHtcbiAgICAgIGlmICh1c2VyUm9sZXNQYXRoICYmIG5vcm1QYXRoLnN0YXJ0c1dpdGgodXNlclJvbGVzUGF0aCArIFwiL1wiKSkge1xuICAgICAgICBpZiAobm9ybVBhdGguc3Vic3RyaW5nKHVzZXJSb2xlc1BhdGgubGVuZ3RoICsgMSkuaW5kZXhPZihcIi9cIikgPT09IC0xKSB7XG4gICAgICAgICAgaXNSb2xlRmlsZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoYnVpbHRJblJvbGVzUGF0aCAmJiBub3JtUGF0aC5zdGFydHNXaXRoKGJ1aWx0SW5Sb2xlc1BhdGggKyBcIi9cIikpIHtcbiAgICAgICAgaWYgKG5vcm1QYXRoLnN1YnN0cmluZyhidWlsdEluUm9sZXNQYXRoLmxlbmd0aCArIDEpLmluZGV4T2YoXCIvXCIpID09PSAtMSkge1xuICAgICAgICAgIGlzUm9sZUZpbGUgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vINCi0LDQutC+0LYg0YDQtdCw0LPRg9GU0LzQviDQvdCwINC30LzRltC90YMv0LLQuNC00LDQu9C10L3QvdGPINGB0LDQvNC+0Zcg0L/QsNC/0LrQuCDRgNC+0LvQtdC5XG4gICAgaWYgKHVzZXJSb2xlc1BhdGggJiYgbm9ybVBhdGggPT09IHVzZXJSb2xlc1BhdGgpIHtcbiAgICAgIGlzUm9sZUZpbGUgPSB0cnVlOyAvLyBUcmVhdCBmb2xkZXIgY2hhbmdlIGFzIG5lZWRpbmcgYSByb2xlIHJlZnJlc2hcbiAgICB9XG5cbiAgICBpZiAoaXNSb2xlRmlsZSkge1xuICAgICAgZGVib3VuY2VkUm9sZUNsZWFyKCk7XG4gICAgfVxuXG4gICAgLy8gMi4g0J/QtdGA0LXQstGW0YDQutCwINC00LvRjyBSQUdcbiAgICBjb25zdCByYWdGb2xkZXJQYXRoID0gdGhpcy5zZXR0aW5ncy5yYWdGb2xkZXJQYXRoID8gbm9ybWFsaXplUGF0aCh0aGlzLnNldHRpbmdzLnJhZ0ZvbGRlclBhdGgpIDogbnVsbDtcbiAgICBpZiAoXG4gICAgICB0aGlzLnNldHRpbmdzLnJhZ0VuYWJsZWQgJiZcbiAgICAgIHJhZ0ZvbGRlclBhdGggJiZcbiAgICAgIChub3JtUGF0aC5zdGFydHNXaXRoKHJhZ0ZvbGRlclBhdGggKyBcIi9cIikgfHwgbm9ybVBhdGggPT09IHJhZ0ZvbGRlclBhdGgpXG4gICAgKSB7XG4gICAgICBpZiAobm9ybVBhdGggIT09IHRoaXMuZGFpbHlUYXNrRmlsZVBhdGgpIHtcbiAgICAgICAgLy8g0J3QtSDRltC90LTQtdC60YHRg9GU0LzQviDRhNCw0LnQuyDQt9Cw0LLQtNCw0L3RjCDQsNCy0YLQvtC80LDRgtC40YfQvdC+XG5cbiAgICAgICAgdGhpcy5kZWJvdW5jZUluZGV4VXBkYXRlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIG9udW5sb2FkKCkge1xuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoVklFV19UWVBFX09MTEFNQV9QRVJTT05BUykuZm9yRWFjaChsID0+IGwuZGV0YWNoKCkpO1xuICAgIHRoaXMudmlldyA9IG51bGw7IC8vINCh0LrQuNC00LDRlNC80L4g0L/QvtGB0LjQu9Cw0L3QvdGPINC90LAgdmlld1xuXG4gICAgaWYgKHRoaXMuaW5kZXhVcGRhdGVUaW1lb3V0KSBjbGVhclRpbWVvdXQodGhpcy5pbmRleFVwZGF0ZVRpbWVvdXQpO1xuICAgIGlmICh0aGlzLnJvbGVDYWNoZUNsZWFyVGltZW91dCkgY2xlYXJUaW1lb3V0KHRoaXMucm9sZUNhY2hlQ2xlYXJUaW1lb3V0KTtcbiAgICBpZiAodGhpcy50YXNrQ2hlY2tJbnRlcnZhbCkgY2xlYXJJbnRlcnZhbCh0aGlzLnRhc2tDaGVja0ludGVydmFsKTtcblxuICAgIC8vINCe0YfQuNGJ0LXQvdC90Y8g0L7QsdGA0L7QsdC90LjQutGW0LIg0L/QvtC00ZbQuVxuICAgIHRoaXMuZXZlbnRIYW5kbGVycyA9IHt9O1xuXG4gICAgdHJ5IHtcbiAgICAgIGlmICh0aGlzLmNoYXRNYW5hZ2VyICYmIHRoaXMuc2V0dGluZ3Muc2F2ZU1lc3NhZ2VIaXN0b3J5KSB7XG4gICAgICAgIGNvbnN0IGxhc3RBY3RpdmVJZCA9IHRoaXMuY2hhdE1hbmFnZXIuZ2V0QWN0aXZlQ2hhdElkKCk7XG4gICAgICAgIGlmIChsYXN0QWN0aXZlSWQgIT09IHVuZGVmaW5lZCAmJiBsYXN0QWN0aXZlSWQgIT09IG51bGwpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLnNhdmVEYXRhS2V5KEFDVElWRV9DSEFUX0lEX0tFWSwgbGFzdEFjdGl2ZUlkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLnNhdmVEYXRhS2V5KEFDVElWRV9DSEFUX0lEX0tFWSwgbnVsbCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZURhdGFLZXkoQUNUSVZFX0NIQVRfSURfS0VZLCBudWxsKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge31cbiAgfVxuXG4gIHVwZGF0ZU9sbGFtYVNlcnZpY2VDb25maWcoKSB7XG4gICAgaWYgKHRoaXMub2xsYW1hU2VydmljZSkge1xuICAgICAgLy8g0KLRg9GCINC80LDRlCDQsdGD0YLQuCDQu9C+0LPRltC60LAsINGJ0L4g0L/QtdGA0LXQtNCw0ZQg0L3QvtCy0ZYg0L3QsNC70LDRiNGC0YPQstCw0L3QvdGPICjQvdCw0L/RgNC40LrQu9Cw0LQsIFVSTCkg0LIgT2xsYW1hU2VydmljZVxuICAgICAgLy8gdGhpcy5vbGxhbWFTZXJ2aWNlLnVwZGF0ZUNvbmZpZyh7IGJhc2VVcmw6IHRoaXMuc2V0dGluZ3Mub2xsYW1hVXJsIH0pOyAvLyDQn9GA0LjQutC70LDQtFxuICAgICAgdGhpcy5wcm9tcHRTZXJ2aWNlPy5jbGVhck1vZGVsRGV0YWlsc0NhY2hlKCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBkZWJvdW5jZUluZGV4VXBkYXRlKCkge1xuICAgIGlmICh0aGlzLmluZGV4VXBkYXRlVGltZW91dCkgY2xlYXJUaW1lb3V0KHRoaXMuaW5kZXhVcGRhdGVUaW1lb3V0KTtcblxuICAgIHRoaXMuaW5kZXhVcGRhdGVUaW1lb3V0ID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5yYWdFbmFibGVkICYmIHRoaXMucmFnU2VydmljZSkge1xuICAgICAgICBhd2FpdCB0aGlzLnJhZ1NlcnZpY2UuaW5kZXhEb2N1bWVudHMoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICB9XG4gICAgICB0aGlzLmluZGV4VXBkYXRlVGltZW91dCA9IG51bGw7XG4gICAgfSwgMzAwMDApOyAvLyAzMCDRgdC10LrRg9C90LQg0LfQsNGC0YDQuNC80LrQuFxuICB9XG5cbiAgYXN5bmMgYWN0aXZhdGVWaWV3KCkge1xuICAgIGNvbnN0IHsgd29ya3NwYWNlIH0gPSB0aGlzLmFwcDtcbiAgICBsZXQgbGVhZjogV29ya3NwYWNlTGVhZiB8IG51bGwgPSBudWxsO1xuICAgIGNvbnN0IHZpZXdUeXBlID0gVklFV19UWVBFX09MTEFNQV9QRVJTT05BUztcbiAgICBjb25zdCBleGlzdGluZ0xlYXZlcyA9IHdvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUodmlld1R5cGUpO1xuXG4gICAgaWYgKGV4aXN0aW5nTGVhdmVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGxlYWYgPSBleGlzdGluZ0xlYXZlc1swXTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHRoaXMuc2V0dGluZ3Mub3BlbkNoYXRJblRhYikge1xuICAgICAgICBsZWFmID0gd29ya3NwYWNlLmdldExlYWYoXCJ0YWJcIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsZWFmID0gd29ya3NwYWNlLmdldFJpZ2h0TGVhZihmYWxzZSk7XG5cbiAgICAgICAgaWYgKCFsZWFmKSB7XG4gICAgICAgICAgbGVhZiA9IHdvcmtzcGFjZS5nZXRMZWFmKFwidGFiXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAobGVhZikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IGxlYWYuc2V0Vmlld1N0YXRlKHsgdHlwZTogdmlld1R5cGUsIGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBvcGVuaW5nIEFJIEZvcmdlIHZpZXcuXCIpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmV3IE5vdGljZShcIkNvdWxkIG5vdCBvcGVuIEFJIEZvcmdlIHZpZXcuXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChsZWFmKSB7XG4gICAgICB3b3Jrc3BhY2UucmV2ZWFsTGVhZihsZWFmKTtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBpZiAobGVhZiAmJiBsZWFmLnZpZXcgaW5zdGFuY2VvZiBPbGxhbWFWaWV3KSB7XG4gICAgICAgICAgdGhpcy52aWV3ID0gbGVhZi52aWV3O1xuXG4gICAgICAgICAgdGhpcy5lbWl0KFwiZm9jdXMtaW5wdXQtcmVxdWVzdFwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnZpZXcgPSBudWxsO1xuICAgICAgICB9XG4gICAgICB9LCA1MCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbG9hZFNldHRpbmdzQW5kTWlncmF0ZSgpIHtcbiAgICBjb25zdCBsb2FkZWREYXRhID0gYXdhaXQgdGhpcy5sb2FkRGF0YSgpO1xuICAgIHRoaXMuc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBsb2FkZWREYXRhKTtcblxuICAgIHRoaXMudXBkYXRlT2xsYW1hU2VydmljZUNvbmZpZygpO1xuICAgIHRoaXMudXBkYXRlRGFpbHlUYXNrRmlsZVBhdGgoKTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVEYXRhKHRoaXMuc2V0dGluZ3MpO1xuXG4gICAgdGhpcy5lbWl0KFwic2V0dGluZ3MtdXBkYXRlZFwiKTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVEYXRhS2V5KGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGRhdGEgPSAoYXdhaXQgdGhpcy5sb2FkRGF0YSgpKSB8fCB7fTtcbiAgICAgIGRhdGFba2V5XSA9IHZhbHVlO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlRGF0YShkYXRhKTtcbiAgICB9IGNhdGNoIChlcnJvcikge31cbiAgfVxuXG4gIGFzeW5jIGxvYWREYXRhS2V5KGtleTogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZGF0YSA9IChhd2FpdCB0aGlzLmxvYWREYXRhKCkpIHx8IHt9O1xuICAgICAgY29uc3QgdmFsdWUgPSBkYXRhW2tleV07XG5cbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjbGVhck1lc3NhZ2VIaXN0b3J5V2l0aENvbmZpcm1hdGlvbigpIHtcbiAgICBpZiAoIXRoaXMuY2hhdE1hbmFnZXIpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJFcnJvcjogQ2hhdCBNYW5hZ2VyIG5vdCByZWFkeS5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXQoKTtcbiAgICBpZiAoYWN0aXZlQ2hhdCAmJiBhY3RpdmVDaGF0Lm1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIG5ldyBDb25maXJtTW9kYWwodGhpcy5hcHAsIFwiQ2xlYXIgSGlzdG9yeVwiLCBgQ2xlYXIgbWVzc2FnZXMgaW4gXCIke2FjdGl2ZUNoYXQubWV0YWRhdGEubmFtZX1cIj9gLCBhc3luYyAoKSA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMuY2hhdE1hbmFnZXIuY2xlYXJBY3RpdmVDaGF0TWVzc2FnZXMoKTtcbiAgICAgICAgbmV3IE5vdGljZShgSGlzdG9yeSBjbGVhcmVkIGZvciBcIiR7YWN0aXZlQ2hhdC5tZXRhZGF0YS5uYW1lfVwiLmApO1xuICAgICAgfSkub3BlbigpO1xuICAgIH0gZWxzZSBpZiAoYWN0aXZlQ2hhdCkge1xuICAgICAgbmV3IE5vdGljZShcIkNoYXQgaGlzdG9yeSBpcyBhbHJlYWR5IGVtcHR5LlwiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV3IE5vdGljZShcIk5vIGFjdGl2ZSBjaGF0IHRvIGNsZWFyLlwiKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBsaXN0Um9sZUZpbGVzKGZvcmNlUmVmcmVzaDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxSb2xlSW5mb1tdPiB7XG4gICAgaWYgKHRoaXMucm9sZUxpc3RDYWNoZSAmJiAhZm9yY2VSZWZyZXNoKSB7XG4gICAgICByZXR1cm4gdGhpcy5yb2xlTGlzdENhY2hlO1xuICAgIH1cblxuICAgIGNvbnN0IHJvbGVzOiBSb2xlSW5mb1tdID0gW107XG4gICAgY29uc3QgYWRkZWROYW1lc0xvd2VyQ2FzZSA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IGFkYXB0ZXIgPSB0aGlzLmFwcC52YXVsdC5hZGFwdGVyO1xuICAgIGNvbnN0IHBsdWdpbkRpciA9IHRoaXMubWFuaWZlc3QuZGlyO1xuICAgIGNvbnN0IGJ1aWx0SW5Sb2xlTmFtZSA9IFwiUHJvZHVjdGl2aXR5IEFzc2lzdGFudFwiO1xuICAgIGNvbnN0IGJ1aWx0SW5Sb2xlRmlsZU5hbWUgPSBcIlByb2R1Y3Rpdml0eV9Bc3Npc3RhbnQubWRcIjtcbiAgICBsZXQgYnVpbHRJblJvbGVQYXRoOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBpZiAocGx1Z2luRGlyKSB7XG4gICAgICBidWlsdEluUm9sZVBhdGggPSBub3JtYWxpemVQYXRoKGAke3BsdWdpbkRpcn0vcm9sZXMvJHtidWlsdEluUm9sZUZpbGVOYW1lfWApO1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKGF3YWl0IGFkYXB0ZXIuZXhpc3RzKGJ1aWx0SW5Sb2xlUGF0aCkpIHtcbiAgICAgICAgICBjb25zdCBzdGF0ID0gYXdhaXQgYWRhcHRlci5zdGF0KGJ1aWx0SW5Sb2xlUGF0aCk7XG4gICAgICAgICAgaWYgKHN0YXQ/LnR5cGUgPT09IFwiZmlsZVwiKSB7XG4gICAgICAgICAgICByb2xlcy5wdXNoKHsgbmFtZTogYnVpbHRJblJvbGVOYW1lLCBwYXRoOiBidWlsdEluUm9sZVBhdGgsIGlzQ3VzdG9tOiBmYWxzZSB9KTtcbiAgICAgICAgICAgIGFkZGVkTmFtZXNMb3dlckNhc2UuYWRkKGJ1aWx0SW5Sb2xlTmFtZS50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7fVxuICAgIH1cbiAgICBjb25zdCB1c2VyUm9sZXNGb2xkZXJQYXRoID0gdGhpcy5zZXR0aW5ncy51c2VyUm9sZXNGb2xkZXJQYXRoXG4gICAgICA/IG5vcm1hbGl6ZVBhdGgodGhpcy5zZXR0aW5ncy51c2VyUm9sZXNGb2xkZXJQYXRoKVxuICAgICAgOiBudWxsO1xuICAgIGlmICh1c2VyUm9sZXNGb2xkZXJQYXRoICYmIHVzZXJSb2xlc0ZvbGRlclBhdGggIT09IFwiL1wiKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBmb2xkZXJFeGlzdHMgPSBhd2FpdCBhZGFwdGVyLmV4aXN0cyh1c2VyUm9sZXNGb2xkZXJQYXRoKTtcbiAgICAgICAgY29uc3QgZm9sZGVyU3RhdCA9IGZvbGRlckV4aXN0cyA/IGF3YWl0IGFkYXB0ZXIuc3RhdCh1c2VyUm9sZXNGb2xkZXJQYXRoKSA6IG51bGw7XG4gICAgICAgIGlmIChmb2xkZXJTdGF0Py50eXBlID09PSBcImZvbGRlclwiKSB7XG4gICAgICAgICAgY29uc3QgbGlzdFJlc3VsdCA9IGF3YWl0IGFkYXB0ZXIubGlzdCh1c2VyUm9sZXNGb2xkZXJQYXRoKTtcbiAgICAgICAgICBmb3IgKGNvbnN0IGZpbGVQYXRoIG9mIGxpc3RSZXN1bHQuZmlsZXMpIHtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgZmlsZVBhdGgudG9Mb3dlckNhc2UoKS5lbmRzV2l0aChcIi5tZFwiKSAmJlxuICAgICAgICAgICAgICBmaWxlUGF0aC5zdWJzdHJpbmcodXNlclJvbGVzRm9sZGVyUGF0aC5sZW5ndGggKyAxKS5pbmRleE9mKFwiL1wiKSA9PT0gLTEgJiZcbiAgICAgICAgICAgICAgZmlsZVBhdGggIT09IGJ1aWx0SW5Sb2xlUGF0aFxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGZpbGVOYW1lID0gZmlsZVBhdGguc3Vic3RyaW5nKGZpbGVQYXRoLmxhc3RJbmRleE9mKFwiL1wiKSArIDEpO1xuICAgICAgICAgICAgICBjb25zdCByb2xlTmFtZSA9IGZpbGVOYW1lLnNsaWNlKDAsIC0zKTtcbiAgICAgICAgICAgICAgaWYgKCFhZGRlZE5hbWVzTG93ZXJDYXNlLmhhcyhyb2xlTmFtZS50b0xvd2VyQ2FzZSgpKSkge1xuICAgICAgICAgICAgICAgIHJvbGVzLnB1c2goeyBuYW1lOiByb2xlTmFtZSwgcGF0aDogZmlsZVBhdGgsIGlzQ3VzdG9tOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgIGFkZGVkTmFtZXNMb3dlckNhc2UuYWRkKHJvbGVOYW1lLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7fVxuICAgIH1cbiAgICByb2xlcy5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpKTtcbiAgICB0aGlzLnJvbGVMaXN0Q2FjaGUgPSByb2xlcztcblxuICAgIHJldHVybiByb2xlcztcbiAgfVxuXG4gIGFzeW5jIGV4ZWN1dGVTeXN0ZW1Db21tYW5kKFxuICAgIGNvbW1hbmQ6IHN0cmluZ1xuICApOiBQcm9taXNlPHsgc3Rkb3V0OiBzdHJpbmc7IHN0ZGVycjogc3RyaW5nOyBlcnJvcjogRXhlY0V4Y2VwdGlvbiB8IG51bGwgfT4ge1xuICAgIGlmICghY29tbWFuZD8udHJpbSgpKSB7XG4gICAgICByZXR1cm4geyBzdGRvdXQ6IFwiXCIsIHN0ZGVycjogXCJFbXB0eSBjb21tYW5kLlwiLCBlcnJvcjogbmV3IEVycm9yKFwiRW1wdHkgY29tbWFuZC5cIikgYXMgRXhlY0V4Y2VwdGlvbiB9O1xuICAgIH1cbiAgICAvL0B0cy1pZ25vcmVcbiAgICBpZiAodHlwZW9mIHByb2Nlc3MgPT09IFwidW5kZWZpbmVkXCIgfHwgIXByb2Nlc3M/LnZlcnNpb25zPy5ub2RlKSB7XG4gICAgICBuZXcgTm90aWNlKFwiQ2Fubm90IGV4ZWN1dGUgc3lzdGVtIGNvbW1hbmQ6IE5vZGUuanMgZW52aXJvbm1lbnQgaXMgcmVxdWlyZWQuXCIpO1xuICAgICAgcmV0dXJuIHsgc3Rkb3V0OiBcIlwiLCBzdGRlcnI6IFwiTm9kZS5qcyByZXF1aXJlZC5cIiwgZXJyb3I6IG5ldyBFcnJvcihcIk5vZGUuanMgcmVxdWlyZWQuXCIpIGFzIEV4ZWNFeGNlcHRpb24gfTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgZXhlYyhjb21tYW5kLCAoZXJyb3IsIHN0ZG91dCwgc3RkZXJyKSA9PiB7XG4gICAgICAgIGlmIChlcnJvcilcbiAgICAgICAgICBpZiAoc3RkZXJyICYmIHN0ZGVyci50cmltKCkpIHJlc29sdmUoeyBzdGRvdXQ6IHN0ZG91dC50b1N0cmluZygpLCBzdGRlcnI6IHN0ZGVyci50b1N0cmluZygpLCBlcnJvcjogZXJyb3IgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNob3dDaGF0U3dpdGNoZXIoKSB7XG4gICAgbmV3IE5vdGljZShcIlN3aXRjaCBDaGF0IFVJIG5vdCBpbXBsZW1lbnRlZCB5ZXQuXCIpO1xuICB9XG5cbiAgYXN5bmMgcmVuYW1lQWN0aXZlQ2hhdCgpIHtcbiAgICBpZiAoIXRoaXMuY2hhdE1hbmFnZXIpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJFcnJvcjogQ2hhdCBtYW5hZ2VyIGlzIG5vdCByZWFkeS5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLmNoYXRNYW5hZ2VyLmdldEFjdGl2ZUNoYXQoKTtcbiAgICBpZiAoIWFjdGl2ZUNoYXQpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJObyBhY3RpdmUgY2hhdCB0byByZW5hbWUuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjdXJyZW50TmFtZSA9IGFjdGl2ZUNoYXQubWV0YWRhdGEubmFtZTtcbiAgICBjb25zdCBjaGF0SWQgPSBhY3RpdmVDaGF0Lm1ldGFkYXRhLmlkO1xuXG4gICAgbmV3IFByb21wdE1vZGFsKHRoaXMuYXBwLCBcIlJlbmFtZSBDaGF0XCIsIGBFbnRlciBuZXcgbmFtZSBmb3IgXCIke2N1cnJlbnROYW1lfVwiOmAsIGN1cnJlbnROYW1lLCBhc3luYyBuZXdOYW1lID0+IHtcbiAgICAgIGNvbnN0IHRyaW1tZWROYW1lID0gbmV3TmFtZT8udHJpbSgpO1xuICAgICAgaWYgKHRyaW1tZWROYW1lICYmIHRyaW1tZWROYW1lICE9PSBcIlwiICYmIHRyaW1tZWROYW1lICE9PSBjdXJyZW50TmFtZSkge1xuICAgICAgICBjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5jaGF0TWFuYWdlci5yZW5hbWVDaGF0KGNoYXRJZCwgdHJpbW1lZE5hbWUpO1xuICAgICAgICBpZiAoIXN1Y2Nlc3MpIHtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChuZXdOYW1lID09PSBudWxsIHx8IHRyaW1tZWROYW1lID09PSBcIlwiKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJSZW5hbWUgY2FuY2VsbGVkIG9yIGludmFsaWQgbmFtZSBlbnRlcmVkLlwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJOYW1lIHVuY2hhbmdlZC5cIik7XG4gICAgICB9XG4gICAgfSkub3BlbigpO1xuICB9XG5cbiAgYXN5bmMgZGVsZXRlQWN0aXZlQ2hhdFdpdGhDb25maXJtYXRpb24oKSB7XG4gICAgaWYgKCF0aGlzLmNoYXRNYW5hZ2VyKSB7XG4gICAgICBuZXcgTm90aWNlKFwiRXJyb3I6IENoYXQgbWFuYWdlciBpcyBub3QgcmVhZHkuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5jaGF0TWFuYWdlci5nZXRBY3RpdmVDaGF0KCk7XG4gICAgaWYgKCFhY3RpdmVDaGF0KSB7XG4gICAgICBuZXcgTm90aWNlKFwiTm8gYWN0aXZlIGNoYXQgdG8gZGVsZXRlLlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY2hhdE5hbWUgPSBhY3RpdmVDaGF0Lm1ldGFkYXRhLm5hbWU7XG4gICAgY29uc3QgY2hhdElkID0gYWN0aXZlQ2hhdC5tZXRhZGF0YS5pZDtcblxuICAgIG5ldyBDb25maXJtTW9kYWwoXG4gICAgICB0aGlzLmFwcCxcbiAgICAgIFwiRGVsZXRlIENoYXRcIixcbiAgICAgIGBBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlIGNoYXQgXCIke2NoYXROYW1lfVwiP1xcblRoaXMgYWN0aW9uIGNhbm5vdCBiZSB1bmRvbmUuYCxcbiAgICAgIGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMuY2hhdE1hbmFnZXIuZGVsZXRlQ2hhdChjaGF0SWQpO1xuICAgICAgICBpZiAoIXN1Y2Nlc3MpIHtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICkub3BlbigpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVBY3RpdmVDaGF0Q2hhbmdlZExvY2FsbHkoZGF0YTogeyBjaGF0SWQ6IHN0cmluZyB8IG51bGw7IGNoYXQ6IENoYXQgfCBudWxsIH0pIHtcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5zYXZlTWVzc2FnZUhpc3RvcnkpIHtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZURhdGFLZXkoQUNUSVZFX0NIQVRfSURfS0VZLCBkYXRhLmNoYXRJZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZURhdGFLZXkoQUNUSVZFX0NIQVRfSURfS0VZLCBudWxsKTtcbiAgICB9XG4gIH1cblxuICBmaW5kUm9sZU5hbWVCeVBhdGgocm9sZVBhdGg6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuICAgIGlmICghcm9sZVBhdGgpIHJldHVybiBcIk5vbmVcIjtcbiAgICBjb25zdCBjYWNoZWRSb2xlID0gdGhpcy5yb2xlTGlzdENhY2hlPy5maW5kKHJsID0+IHJsLnBhdGggPT09IHJvbGVQYXRoKTtcbiAgICBpZiAoY2FjaGVkUm9sZSkge1xuICAgICAgcmV0dXJuIGNhY2hlZFJvbGUubmFtZTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSByb2xlUGF0aC5zdWJzdHJpbmcocm9sZVBhdGgubGFzdEluZGV4T2YoXCIvXCIpICsgMSk7XG4gICAgICBjb25zdCByb2xlTmFtZSA9IGZpbGVOYW1lLmVuZHNXaXRoKFwiLm1kXCIpID8gZmlsZU5hbWUuc2xpY2UoMCwgLTMpIDogZmlsZU5hbWU7XG4gICAgICByZXR1cm4gcm9sZU5hbWUgfHwgXCJVbmtub3duIFJvbGVcIjtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gXCJVbmtub3duIFJvbGVcIjtcbiAgICB9XG4gIH1cbn0gLy8gRU5EIE9GIE9sbGFtYVBsdWdpbiBDTEFTU1xuIl19