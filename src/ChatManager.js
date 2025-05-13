import { __awaiter } from "tslib";
// src/ChatManager.ts
import { Notice, normalizePath } from "obsidian"; // Додано TAbstractFile
import { ACTIVE_CHAT_ID_KEY, CHAT_INDEX_KEY } from "./main";
import { Chat } from "./Chat";
import { v4 as uuidv4 } from "uuid";
export class ChatManager {
    constructor(plugin) {
        this.chatsFolderPath = "/"; // Зроблено public для доступу з SidebarManager
        this.chatIndex = {};
        this.activeChatId = null;
        this.activeChat = null;
        this.loadedChats = {};
        this.currentTaskState = null;
        this.messageAddedResolvers = new Map();
        this.plugin = plugin;
        this.app = plugin.app;
        this.adapter = plugin.app.vault.adapter;
        this.logger = plugin.logger;
    }
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            this.updateChatsFolderPath();
            yield this.ensureFoldersExist();
            yield this.loadChatIndex(true);
            const savedActiveId = yield this.plugin.loadDataKey(ACTIVE_CHAT_ID_KEY);
            if (savedActiveId && this.chatIndex[savedActiveId]) {
                yield this.setActiveChat(savedActiveId);
            }
            else {
                //  if (savedActiveId)
                //
                yield this.plugin.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
                const hierarchy = yield this.getChatHierarchy();
                const firstChat = this.findFirstChatInHierarchy(hierarchy);
                if (firstChat) {
                    yield this.setActiveChat(firstChat.metadata.id);
                }
                else {
                    yield this.setActiveChat(null);
                }
            }
        });
    }
    findFirstChatInHierarchy(nodes) {
        for (const node of nodes) {
            if (node.type === "chat") {
                if (!isNaN(new Date(node.metadata.lastModified).getTime())) {
                    return node;
                }
                else {
                }
            }
            else if (node.type === "folder") {
                const chatInFolder = this.findFirstChatInHierarchy(node.children);
                if (chatInFolder) {
                    return chatInFolder;
                }
            }
        }
        return null;
    }
    updateChatsFolderPath() {
        var _a;
        const settingsPath = (_a = this.plugin.settings.chatHistoryFolderPath) === null || _a === void 0 ? void 0 : _a.trim();
        this.chatsFolderPath = settingsPath ? normalizePath(settingsPath) : "/";
        if (this.chatsFolderPath !== "/" && this.chatsFolderPath.endsWith("/")) {
            this.chatsFolderPath = this.chatsFolderPath.slice(0, -1);
        }
        // Перевірка чи шлях не порожній після обрізки
        if (!this.chatsFolderPath) {
            this.chatsFolderPath = "/";
        }
    }
    updateTaskState(tasks) {
        this.currentTaskState = tasks;
    }
    getCurrentTaskState() {
        return this.currentTaskState;
    }
    ensureFoldersExist() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const historyPath = (_a = this.plugin.settings.chatHistoryFolderPath) === null || _a === void 0 ? void 0 : _a.trim();
            const exportPath = (_b = this.plugin.settings.chatExportFolderPath) === null || _b === void 0 ? void 0 : _b.trim();
            const checkAndCreate = (folderPath, folderDesc) => __awaiter(this, void 0, void 0, function* () {
                if (!folderPath || folderPath === "/")
                    return;
                const normalized = normalizePath(folderPath);
                // Додаткова перевірка на безпеку шляху
                if (normalized.startsWith("..") || normalized.includes("\0")) {
                    new Notice(`Error: Invalid path for ${folderDesc}.`);
                    return;
                }
                try {
                    const exists = yield this.adapter.exists(normalized);
                    if (!exists) {
                        yield this.adapter.mkdir(normalized);
                    }
                    else {
                        const stat = yield this.adapter.stat(normalized);
                        if ((stat === null || stat === void 0 ? void 0 : stat.type) !== "folder") {
                            new Notice(`Error: Path for ${folderDesc} is not a folder.`);
                        }
                        else {
                        }
                    }
                }
                catch (error) {
                    new Notice(`Error accessing folder for ${folderDesc}. Check permissions.`);
                }
            });
            yield checkAndCreate(historyPath, "Chat History");
            yield checkAndCreate(exportPath, "Chat Export");
        });
    }
    loadChatIndex() {
        return __awaiter(this, arguments, void 0, function* (forceScan = false) {
            var _a;
            const storedIndex = yield this.plugin.loadDataKey(CHAT_INDEX_KEY);
            const settingsPath = (_a = this.plugin.settings.chatHistoryFolderPath) === null || _a === void 0 ? void 0 : _a.trim();
            const currentPath = settingsPath && settingsPath !== "/" ? normalizePath(settingsPath) : "/";
            if (currentPath !== this.chatsFolderPath) {
                this.updateChatsFolderPath();
                forceScan = true;
            }
            if (!forceScan && storedIndex && typeof storedIndex === "object" && Object.keys(storedIndex).length > 0) {
                const firstKey = Object.keys(storedIndex)[0];
                if (storedIndex[firstKey] &&
                    typeof storedIndex[firstKey].name === "string" &&
                    typeof storedIndex[firstKey].lastModified === "string" &&
                    typeof storedIndex[firstKey].createdAt === "string") {
                    this.chatIndex = storedIndex;
                    return;
                }
                else {
                    forceScan = true;
                }
            }
            else if (!forceScan && storedIndex && typeof storedIndex === "object" && Object.keys(storedIndex).length === 0) {
                this.chatIndex = {};
                return;
            }
            else if (!forceScan) {
                forceScan = true;
            }
            if (forceScan) {
                yield this.rebuildIndexFromFiles();
            }
        });
    }
    rebuildIndexFromFiles() {
        return __awaiter(this, void 0, void 0, function* () {
            const newIndex = {};
            let chatsLoaded = 0;
            let filesScanned = 0;
            try {
                if (this.chatsFolderPath !== "/") {
                    const exists = yield this.adapter.exists(this.chatsFolderPath);
                    if (!exists) {
                        try {
                            yield this.adapter.mkdir(this.chatsFolderPath);
                        }
                        catch (mkdirError) {
                            this.chatIndex = {};
                            yield this.saveChatIndex();
                            return;
                        }
                    }
                    else {
                        const stat = yield this.adapter.stat(this.chatsFolderPath);
                        if ((stat === null || stat === void 0 ? void 0 : stat.type) !== "folder") {
                            new Notice(`Error: Chat history path '${this.chatsFolderPath}' is not a folder.`);
                            this.chatIndex = {};
                            yield this.saveChatIndex();
                            return;
                        }
                    }
                }
                const scanAndIndex = (folderPath) => __awaiter(this, void 0, void 0, function* () {
                    var _a;
                    let listResult;
                    try {
                        listResult = yield this.adapter.list(folderPath);
                    }
                    catch (listError) {
                        if (listError.message && listError.message.includes("Not a directory")) {
                        }
                        else {
                        }
                        return;
                    }
                    for (const fullPath of listResult.files) {
                        const fileName = fullPath.substring(fullPath.lastIndexOf("/") + 1);
                        if (!fileName.endsWith(".json") || fileName.startsWith("."))
                            continue;
                        const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.json$/i;
                        const oldPattern = /^chat_\d+_[a-zA-Z0-9]+\.json$/;
                        if (!uuidPattern.test(fileName) && !oldPattern.test(fileName))
                            continue;
                        filesScanned++;
                        const chatId = fileName.slice(0, -5);
                        try {
                            const jsonContent = yield this.adapter.read(fullPath);
                            const data = JSON.parse(jsonContent);
                            if (((_a = data === null || data === void 0 ? void 0 : data.metadata) === null || _a === void 0 ? void 0 : _a.id) === chatId &&
                                typeof data.metadata.name === "string" &&
                                data.metadata.name.trim() !== "" &&
                                typeof data.metadata.lastModified === "string" &&
                                !isNaN(new Date(data.metadata.lastModified).getTime()) &&
                                typeof data.metadata.createdAt === "string" &&
                                !isNaN(new Date(data.metadata.createdAt).getTime())) {
                                const meta = data.metadata;
                                newIndex[chatId] = {
                                    name: meta.name,
                                    lastModified: new Date(meta.lastModified).toISOString(),
                                    createdAt: new Date(meta.createdAt).toISOString(),
                                    modelName: meta.modelName,
                                    selectedRolePath: meta.selectedRolePath,
                                    temperature: meta.temperature,
                                    contextWindow: meta.contextWindow,
                                };
                                chatsLoaded++;
                            }
                            else {
                            }
                        }
                        catch (e) {
                            if (e instanceof SyntaxError) {
                            }
                            else {
                            }
                        }
                    }
                    for (const subFolderPath of listResult.folders) {
                        yield scanAndIndex(subFolderPath);
                    }
                });
                yield scanAndIndex(this.chatsFolderPath);
                this.chatIndex = newIndex;
                yield this.saveChatIndex();
            }
            catch (error) {
                if (error.code === "ENOENT") {
                    new Notice(`Error: Chat history folder '${this.chatsFolderPath}' not found.`);
                }
                else if (error.code === "EPERM" || error.code === "EACCES") {
                    new Notice("Permission error accessing chat history folder.");
                }
                else {
                    new Notice("Error rebuilding chat index. Check console.");
                }
                this.chatIndex = {};
                yield this.saveChatIndex();
            }
        });
    }
    saveChatIndex() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.plugin.saveDataKey(CHAT_INDEX_KEY, this.chatIndex);
            }
            catch (error) {
                new Notice("Error saving chat index. Changes might be lost.");
            }
        });
    }
    getChatFilePath(id, folderPath) {
        const fileName = `${id}.json`;
        const targetFolder = normalizePath(folderPath);
        if (targetFolder === "/" || targetFolder === "") {
            return normalizePath(fileName);
        }
        else {
            return normalizePath(`${targetFolder}/${fileName}`);
        }
    }
    _scanFolderRecursive(folderPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const children = [];
            let listResult;
            try {
                const exists = yield this.adapter.exists(folderPath);
                if (!exists) {
                    return [];
                }
                const stat = yield this.adapter.stat(folderPath);
                if ((stat === null || stat === void 0 ? void 0 : stat.type) !== "folder") {
                    return [];
                }
                listResult = yield this.adapter.list(folderPath);
            }
            catch (error) {
                if (error.code === "EPERM" || error.code === "EACCES") {
                    new Notice(`Permission error reading folder: ${folderPath}`);
                }
                else {
                }
                return [];
            }
            for (const subFolderPath of listResult.folders) {
                try {
                    const subStat = yield this.adapter.stat(subFolderPath);
                    if ((subStat === null || subStat === void 0 ? void 0 : subStat.type) === "folder") {
                        const folderName = subFolderPath.substring(subFolderPath.lastIndexOf("/") + 1);
                        const subChildren = yield this._scanFolderRecursive(subFolderPath);
                        children.push({
                            type: "folder",
                            name: folderName,
                            path: subFolderPath,
                            children: subChildren,
                        });
                    }
                    else {
                    }
                }
                catch (statError) { }
            }
            for (const fullPath of listResult.files) {
                const fileName = fullPath.substring(fullPath.lastIndexOf("/") + 1);
                if (!fileName.endsWith(".json") || fileName.startsWith("."))
                    continue;
                const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.json$/i;
                const oldPattern = /^chat_\d+_[a-zA-Z0-9]+\.json$/;
                if (!uuidPattern.test(fileName) && !oldPattern.test(fileName))
                    continue;
                const chatId = fileName.slice(0, -5);
                const storedMeta = this.chatIndex[chatId];
                if (storedMeta) {
                    if (isNaN(new Date(storedMeta.lastModified).getTime()) || isNaN(new Date(storedMeta.createdAt).getTime())) {
                        continue;
                    }
                    const chatMetadata = {
                        id: chatId,
                        name: storedMeta.name,
                        lastModified: storedMeta.lastModified,
                        createdAt: storedMeta.createdAt,
                        modelName: storedMeta.modelName,
                        selectedRolePath: storedMeta.selectedRolePath,
                        temperature: storedMeta.temperature,
                        contextWindow: storedMeta.contextWindow,
                    };
                    children.push({
                        type: "chat",
                        metadata: chatMetadata,
                        filePath: fullPath,
                    });
                }
                else {
                }
            }
            children.sort((a, b) => {
                if (a.type === "folder" && b.type === "chat")
                    return -1;
                if (a.type === "chat" && b.type === "folder")
                    return 1;
                if (a.type === "folder" && b.type === "folder") {
                    return a.name.localeCompare(b.name);
                }
                if (a.type === "chat" && b.type === "chat") {
                    const dateA = new Date(a.metadata.lastModified).getTime();
                    const dateB = new Date(b.metadata.lastModified).getTime();
                    const validA = !isNaN(dateA);
                    const validB = !isNaN(dateB);
                    if (validA && validB)
                        return dateB - dateA;
                    if (validB)
                        return 1;
                    if (validA)
                        return -1;
                    return a.metadata.name.localeCompare(b.metadata.name);
                }
                return 0;
            });
            return children;
        });
    }
    getChatHierarchy() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureFoldersExist();
            return yield this._scanFolderRecursive(this.chatsFolderPath);
        });
    }
    saveChatAndUpdateIndex(chat) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield chat.save();
                const meta = chat.metadata;
                const storedMeta = {
                    name: meta.name,
                    lastModified: meta.lastModified,
                    createdAt: meta.createdAt,
                    modelName: meta.modelName,
                    selectedRolePath: meta.selectedRolePath,
                    temperature: meta.temperature,
                    contextWindow: meta.contextWindow,
                };
                const existingIndexEntry = this.chatIndex[meta.id];
                const indexNeedsUpdate = !existingIndexEntry ||
                    existingIndexEntry.name !== storedMeta.name ||
                    existingIndexEntry.lastModified !== storedMeta.lastModified ||
                    existingIndexEntry.createdAt !== storedMeta.createdAt ||
                    existingIndexEntry.modelName !== storedMeta.modelName ||
                    existingIndexEntry.selectedRolePath !== storedMeta.selectedRolePath ||
                    existingIndexEntry.temperature !== storedMeta.temperature ||
                    existingIndexEntry.contextWindow !== storedMeta.contextWindow;
                if (indexNeedsUpdate) {
                    this.chatIndex[meta.id] = storedMeta;
                    yield this.saveChatIndex();
                    this.logger.error(`[ChatManager] >>> Emitting 'chat-list-updated' from saveChatAndUpdateIndex for ID: ${meta.id}`);
                    this.plugin.emit("chat-list-updated");
                    this.logger.debug(`Chat index updated for ${meta.id} after save trigger.`);
                }
                else {
                    this.logger.trace(`Index for chat ${meta.id} unchanged after save trigger, skipping index save/event.`);
                }
                return true;
            }
            catch (error) {
                return false;
            }
        });
    }
    // src/ChatManager.ts
    createNewChat(name, folderPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const targetFolder = folderPath ? normalizePath(folderPath) : this.chatsFolderPath;
            const finalFolderPath = targetFolder === "" || targetFolder === "." ? "/" : targetFolder;
            try {
                yield this.ensureSpecificFolderExists(finalFolderPath);
            }
            catch (folderError) {
                // Повідомлення про помилку вже є в ensureSpecificFolderExists або вище
                new Notice(`Failed to ensure target folder exists: ${finalFolderPath}`);
                return null;
            }
            try {
                const now = new Date();
                const newId = uuidv4();
                const filePath = this.getChatFilePath(newId, finalFolderPath);
                const initialMetadata = {
                    id: newId,
                    name: name || `Chat ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
                    modelName: this.plugin.settings.modelName,
                    selectedRolePath: this.plugin.settings.selectedRolePath,
                    temperature: this.plugin.settings.temperature,
                    contextWindow: this.plugin.settings.contextWindow,
                    createdAt: now.toISOString(),
                    lastModified: now.toISOString(),
                };
                const constructorSettings = Object.assign({}, this.plugin.settings);
                const chatData = { metadata: initialMetadata, messages: [] };
                const newChat = new Chat(this.adapter, constructorSettings, chatData, filePath, this.logger);
                const storedMeta = {
                    name: initialMetadata.name,
                    lastModified: initialMetadata.lastModified,
                    createdAt: initialMetadata.createdAt,
                    modelName: initialMetadata.modelName,
                    selectedRolePath: initialMetadata.selectedRolePath,
                    temperature: initialMetadata.temperature,
                    contextWindow: initialMetadata.contextWindow,
                };
                this.chatIndex[newId] = storedMeta;
                yield this.saveChatIndex();
                // ВИДАЛЕНО: this.plugin.emit("chat-list-updated");
                // Покладаємося на 'active-chat-changed' з setActiveChat для оновлення UI.
                const savedImmediately = yield newChat.saveImmediately();
                if (!savedImmediately) {
                    delete this.chatIndex[newId];
                    yield this.saveChatIndex();
                    // Ця емісія може залишитися, оскільки це шлях обробки помилки/очищення
                    this.logger.error(`[ChatManager] >>> Emitting 'chat-list-updated' from createNewChat (saveImmediately FAILED) for ID: ${newId}`);
                    this.plugin.emit("chat-list-updated");
                    new Notice("Error: Failed to save new chat file.");
                    return null;
                }
                this.loadedChats[newId] = newChat;
                // setActiveChat згенерує 'active-chat-changed', що має оновити OllamaView,
                // включаючи виклик sidebarManager.updateChatList() через loadAndDisplayActiveChat.
                yield this.setActiveChat(newId);
                return newChat;
            }
            catch (error) {
                this.logger.error("Error creating new chat:", error);
                new Notice("Error creating new chat session.");
                return null;
            }
        });
    }
    ensureSpecificFolderExists(folderPath) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!folderPath || folderPath === "/" || folderPath === ".")
                return;
            const normalized = normalizePath(folderPath);
            if (normalized.startsWith("..") || normalized.includes("\0")) {
                this.logger.error(`Attempted to ensure invalid folder path: ${normalized}`);
                throw new Error("Invalid folder path specified.");
            }
            try {
                const exists = yield this.adapter.exists(normalized);
                if (!exists) {
                    yield this.adapter.mkdir(normalized);
                }
                else {
                    const stat = yield this.adapter.stat(normalized);
                    if ((stat === null || stat === void 0 ? void 0 : stat.type) !== "folder") {
                        this.logger.error(`Path exists but is not a folder: ${normalized}`);
                        throw new Error(`Target path ${normalized} is not a folder.`);
                    }
                }
            }
            catch (error) {
                this.logger.error(`Error creating/checking target folder '${normalized}':`, error);
                throw new Error(`Failed to ensure target folder ${normalized} exists: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }
    /** @deprecated Use getChatHierarchy instead. */
    listAvailableChats() {
        return Object.entries(this.chatIndex)
            .map(([id, storedMeta]) => {
            if (!storedMeta ||
                typeof storedMeta !== "object" ||
                typeof storedMeta.name !== "string" ||
                typeof storedMeta.lastModified !== "string" ||
                typeof storedMeta.createdAt !== "string") {
                return null;
            }
            const lastModDate = new Date(storedMeta.lastModified);
            const createdDate = new Date(storedMeta.createdAt);
            if (isNaN(lastModDate.getTime()) || isNaN(createdDate.getTime())) {
                return null;
            }
            return {
                id,
                name: storedMeta.name,
                lastModified: storedMeta.lastModified,
                createdAt: storedMeta.createdAt,
                modelName: storedMeta.modelName,
                selectedRolePath: storedMeta.selectedRolePath,
                temperature: storedMeta.temperature,
                contextWindow: storedMeta.contextWindow,
            };
        })
            .filter((chatMeta) => chatMeta !== null)
            .sort((a, b) => {
            const dateA = new Date(a.lastModified).getTime();
            const dateB = new Date(b.lastModified).getTime();
            if (!isNaN(dateA) && !isNaN(dateB)) {
                if (dateB !== dateA)
                    return dateB - dateA;
            }
            else if (!isNaN(dateB))
                return 1;
            else if (!isNaN(dateA))
                return -1;
            const createdA = new Date(a.createdAt).getTime();
            const createdB = new Date(b.createdAt).getTime();
            if (!isNaN(createdA) && !isNaN(createdB)) {
                return createdB - createdA;
            }
            else if (!isNaN(createdB))
                return 1;
            else if (!isNaN(createdA))
                return -1;
            return a.name.localeCompare(b.name);
        });
    }
    getActiveChatId() {
        return this.activeChatId;
    }
    // src/ChatManager.ts
    getActiveChatOrFail() {
        return __awaiter(this, void 0, void 0, function* () {
            const chat = yield this.getActiveChat();
            if (!chat) {
                this.logger.error("[ChatManager] getActiveChatOrFail: No active chat found or failed to load!");
                // Можна кинути більш специфічну помилку, або просто Error
                throw new Error("No active chat found or it failed to load.");
            }
            return chat;
        });
    }
    addMessageToActiveChatPayload(messagePayload_1) {
        return __awaiter(this, arguments, void 0, function* (messagePayload, emitEvent = true) {
            const operationTimestampId = messagePayload.timestamp.getTime(); // Для логування
            this.plugin.logger.debug(`[ChatManager][addMessagePayload id:${operationTimestampId}] Attempting to add message (Role: ${messagePayload.role}) to active chat.`);
            const activeChatInstance = yield this.getActiveChat();
            if (!activeChatInstance) {
                this.plugin.logger.error(`[ChatManager][addMessagePayload id:${operationTimestampId}] Cannot add message payload: No active chat.`);
                // Розгляньте можливість створення нового чату тут, якщо це бажана поведінка
                // const newChat = await this.createNewChat();
                // if (newChat) { ... } else { return null; }
                return null;
            }
            // Переконуємося, що timestamp є
            if (!messagePayload.timestamp) {
                messagePayload.timestamp = new Date();
                this.plugin.logger.warn(`[ChatManager][addMessagePayload id:${operationTimestampId}] Message payload was missing timestamp, set to now.`);
            }
            activeChatInstance.messages.push(messagePayload);
            // Оновлюємо lastModified та потенційно інші метадані, якщо потрібно
            // const metadataChanged = activeChatInstance.updateMetadata({ lastModified: new Date().toISOString() }); 
            const activityRecorded = activeChatInstance.recordActivity();
            this.plugin.logger.debug(`[ChatManager][addMessagePayload id:${operationTimestampId}] Message pushed to in-memory chat. Metadata changed: ${activityRecorded}`);
            if (activityRecorded) { // Оновлюємо індекс, тільки якщо були зміни
                const saveAndUpdateIndexSuccess = yield this.saveChatAndUpdateIndex(activeChatInstance); // metadataChanged більше не потрібен як параметр, якщо save() в Chat.ts
                if (!saveAndUpdateIndexSuccess) {
                    this.plugin.logger.error(`[ChatManager][addMessagePayload id:${operationTimestampId}] Failed to update index for chat ${activeChatInstance.metadata.id} after activity.`);
                }
            }
            if (emitEvent) {
                // Переконуємося, що ID чату для події відповідає поточному активному чату
                const currentActiveChatIdForEvent = this.activeChatId || activeChatInstance.metadata.id;
                this.plugin.logger.debug(`[ChatManager][addMessagePayload id:${operationTimestampId}] Emitting 'message-added' for chat ${currentActiveChatIdForEvent}, msg role: ${messagePayload.role}, msg_ts: ${messagePayload.timestamp.getTime()}`);
                this.plugin.emit("message-added", { chatId: currentActiveChatIdForEvent, message: messagePayload });
            }
            return messagePayload;
        });
    }
    getChat(id, filePath) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (this.loadedChats[id]) {
                this.logger.trace(`[ChatManager.getChat] Returning cached chat for ID: ${id}`);
                return this.loadedChats[id];
            }
            let actualFilePath = filePath;
            if (!actualFilePath) {
                // this.logger.debug(`[ChatManager.getChat] File path not provided for ID: ${id}. Searching in hierarchy...`);
                try {
                    const hierarchy = yield this.getChatHierarchy();
                    actualFilePath = (_a = this.findChatPathInHierarchy(id, hierarchy)) !== null && _a !== void 0 ? _a : undefined;
                    if (actualFilePath) {
                        // this.logger.debug(`[ChatManager.getChat] Found file path for ID ${id} in hierarchy: ${actualFilePath}`);
                    }
                    else {
                        // this.logger.warn(`[ChatManager.getChat] File path for ID ${id} NOT found in hierarchy.`);
                    }
                }
                catch (hierarchyError) {
                    this.logger.error(`[ChatManager.getChat] Error getting hierarchy while searching path for chat ${id}:`, hierarchyError);
                    actualFilePath = undefined; // Забезпечуємо, що undefined, якщо була помилка
                }
            }
            // Якщо шлях так і не визначено, але чат є в індексі, це проблема з консистентністю
            if (!actualFilePath && this.chatIndex[id]) {
                this.logger.error(`[ChatManager.getChat] Chat ID ${id} exists in index but its file path could not be determined. Chat may be orphaned or index is stale.`);
                // Можливо, варто спробувати перебудувати індекс тут, або просто повернути null
                // await this.rebuildIndexFromFiles(); // Обережно: може бути рекурсивно, якщо getChat викликається з rebuildIndex
                // if (!this.chatIndex[id]) return null; // Якщо після rebuild його немає
                // actualFilePath = this.findChatPathInHierarchy(id, await this.getChatHierarchy()) ?? undefined;
                // if (!actualFilePath) {
                //     this.logger.error(`[ChatManager.getChat] Still no path after potential index rebuild for ${id}.`);
                //     return null;
                // }
                return null; // Поки що просто повертаємо null, якщо шлях не знайдено
            }
            // Якщо чату немає в індексі і шлях не надано/не знайдено, то чату немає
            if (!this.chatIndex[id] && !actualFilePath) {
                this.logger.warn(`[ChatManager.getChat] Chat ID ${id} not found in index and no file path available.`);
                return null;
            }
            // Якщо шлях є, але чату немає в індексі -> спробувати завантажити, потім оновити індекс
            // Якщо чат є в індексі, але шлях не надано -> ми вже спробували його знайти
            // Якщо і шлях є, і в індексі є -> завантажуємо
            if (!actualFilePath) { // Ця умова тепер має бути рідкісною, якщо логіка вище відпрацювала
                this.logger.error(`[ChatManager.getChat] CRITICAL: actualFilePath is still undefined for chat ID ${id} when it should be known or chat should be considered non-existent.`);
                return null;
            }
            try {
                // actualFilePath тут точно має бути string
                const chat = yield Chat.loadFromFile(actualFilePath, this.adapter, this.plugin.settings, this.logger);
                if (chat) {
                    this.loadedChats[id] = chat; // Кешуємо завантажений чат
                    // Перевіряємо та оновлюємо індекс, якщо метадані у файлі новіші/відрізняються
                    const storedMeta = this.chatIndex[id];
                    const currentMeta = chat.metadata;
                    const indexNeedsUpdate = !storedMeta || // Якщо чату не було в індексі (наприклад, завантажили по прямому шляху)
                        storedMeta.name !== currentMeta.name ||
                        storedMeta.lastModified !== currentMeta.lastModified ||
                        storedMeta.createdAt !== currentMeta.createdAt ||
                        storedMeta.modelName !== currentMeta.modelName ||
                        storedMeta.selectedRolePath !== currentMeta.selectedRolePath ||
                        storedMeta.temperature !== currentMeta.temperature ||
                        storedMeta.contextWindow !== currentMeta.contextWindow;
                    if (indexNeedsUpdate) {
                        this.logger.debug(`[ChatManager.getChat] Index needs update for chat ${id}. Calling saveChatAndUpdateIndex.`);
                        // saveChatAndUpdateIndex оновить індекс і згенерує 'chat-list-updated', якщо потрібно
                        yield this.saveChatAndUpdateIndex(chat);
                    }
                    return chat;
                }
                else {
                    // Chat.loadFromFile повернув null (файл пошкоджений або невалідний)
                    this.logger.error(`[ChatManager.getChat] Chat.loadFromFile returned null for ID ${id} at path ${actualFilePath}. Removing from index if present.`);
                    // --- ВИПРАВЛЕНО: Використовуємо новий метод ---
                    yield this.deleteChatFileAndIndexEntry_NoEmit(id, actualFilePath, false); // false - не намагаємось видалити файл, бо він або не існує, або пошкоджений
                    // ---
                    if (this.activeChatId === id) {
                        this.logger.warn(`[ChatManager.getChat] Active chat ${id} failed to load, setting active chat to null.`);
                        yield this.setActiveChat(null); // Згенерує 'active-chat-changed'
                    }
                    return null;
                }
            }
            catch (error) {
                this.logger.error(`[ChatManager.getChat] Unexpected error during getChat for ID ${id} from ${actualFilePath}:`, error);
                if (error.code === "ENOENT") { // Файл не знайдено
                    this.logger.warn(`[ChatManager.getChat] File not found (ENOENT) for chat ${id} at ${actualFilePath}. Cleaning up index.`);
                    // --- ВИПРАВЛЕНО: Використовуємо новий метод ---
                    yield this.deleteChatFileAndIndexEntry_NoEmit(id, actualFilePath, false); // false - файл і так не знайдено
                    // ---
                    if (this.activeChatId === id) {
                        this.logger.warn(`[ChatManager.getChat] Active chat ${id} file not found, setting active chat to null.`);
                        yield this.setActiveChat(null); // Згенерує 'active-chat-changed'
                    }
                }
                // Для інших помилок, можливо, не варто видаляти з індексу одразу,
                // але це залежить від бажаної поведінки. Поточна логіка - видалити.
                return null;
            }
        });
    }
    findChatPathInHierarchy(chatId, nodes) {
        for (const node of nodes) {
            if (node.type === "chat" && node.metadata.id === chatId) {
                return node.filePath;
            }
            else if (node.type === "folder") {
                const pathInFolder = this.findChatPathInHierarchy(chatId, node.children);
                if (pathInFolder) {
                    return pathInFolder;
                }
            }
        }
        return null;
    }
    getActiveChat() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.activeChatId) {
                return null;
            }
            if (this.activeChat && this.activeChat.metadata.id === this.activeChatId) {
                return this.activeChat;
            }
            const chat = yield this.getChat(this.activeChatId);
            if (chat) {
                this.activeChat = chat;
                return chat;
            }
            else {
                const hierarchy = yield this.getChatHierarchy();
                const firstChat = this.findFirstChatInHierarchy(hierarchy);
                const nextActiveId = firstChat ? firstChat.metadata.id : null;
                yield this.setActiveChat(nextActiveId);
                return this.activeChat;
            }
        });
    }
    setActiveChat(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const previousActiveId = this.activeChatId;
            if (id === previousActiveId) {
                if (id && !this.activeChat) {
                    this.activeChat = yield this.getChat(id);
                }
                return;
            }
            if (id && !this.chatIndex[id]) {
                this.logger.error(`Attempted to set active chat to non-existent ID in index: ${id}. Rebuilding index...`);
                yield this.rebuildIndexFromFiles();
                if (!this.chatIndex[id]) {
                    this.logger.error(`Chat ID ${id} still not found after index reload. Aborting setActiveChat. Keeping previous active chat: ${previousActiveId}`);
                    new Notice(`Error: Chat with ID ${id} not found. Cannot activate.`);
                    return;
                }
            }
            this.activeChatId = id;
            this.activeChat = null;
            yield this.plugin.saveDataKey(ACTIVE_CHAT_ID_KEY, id);
            let loadedChat = null;
            if (id) {
                loadedChat = yield this.getChat(id);
                if (!loadedChat) {
                    this.logger.error(`CRITICAL: Failed to load chat ${id} via getChat even after index check. Resetting active chat to null.`);
                    this.activeChatId = null;
                    yield this.plugin.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
                    id = null;
                }
                else {
                    this.activeChat = loadedChat;
                }
            }
            else {
            }
            this.plugin.emit("active-chat-changed", { chatId: id, chat: this.activeChat });
        });
    }
    addMessageToActiveChat(role_1, content_1, timestamp_1) {
        return __awaiter(this, arguments, void 0, function* (role, content, timestamp, emitEvent = true, tool_calls, tool_call_id, name) {
            const messageTimestamp = timestamp || new Date();
            const newMessage = {
                role,
                content,
                timestamp: messageTimestamp,
            };
            // Додаємо опціональні поля, якщо вони надані
            if (tool_calls && tool_calls.length > 0) {
                newMessage.tool_calls = tool_calls;
            }
            if (tool_call_id) {
                newMessage.tool_call_id = tool_call_id;
            }
            if (name) {
                newMessage.name = name;
            }
            // Можливо, додати поле 'images', якщо воно використовується при створенні повідомлення тут
            return yield this.addMessageToActiveChatPayload(newMessage, emitEvent);
        });
    }
    clearActiveChatMessages() {
        return __awaiter(this, void 0, void 0, function* () {
            const activeChat = yield this.getActiveChat();
            if (!activeChat) {
                return;
            }
            if (activeChat.messages.length === 0) {
                return;
            }
            activeChat.clearMessages();
            yield this.saveChatAndUpdateIndex(activeChat);
            this.plugin.emit("messages-cleared", activeChat.metadata.id);
        });
    }
    updateActiveChatMetadata(metadataUpdate) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const activeChat = yield this.getActiveChat();
            if (!activeChat) {
                new Notice("No active chat to update metadata for.");
                return false;
            }
            this.logger.debug(`Attempting to update metadata for active chat ${activeChat.metadata.id}:`, metadataUpdate);
            if (Object.keys(metadataUpdate).length === 0) {
                return false;
            }
            this.logger.debug(`Attempting to update metadata for active chat ${activeChat.metadata.id}:`, metadataUpdate);
            const oldRolePath = activeChat.metadata.selectedRolePath;
            const oldModelName = activeChat.metadata.modelName;
            const changed = activeChat.updateMetadata(metadataUpdate);
            if (changed) {
                this.logger.debug(`Metadata updated in Chat object for ${activeChat.metadata.id}. Save scheduled by Chat.updateMetadata.`);
                yield this.saveChatAndUpdateIndex(activeChat);
                const newMeta = activeChat.metadata;
                let roleChanged = false;
                let modelChanged = false;
                if (metadataUpdate.selectedRolePath !== undefined && oldRolePath !== newMeta.selectedRolePath) {
                    roleChanged = true;
                }
                if (metadataUpdate.modelName !== undefined && oldModelName !== newMeta.modelName) {
                    modelChanged = true;
                }
                if (roleChanged) {
                    try {
                        const rolePathArg = (_a = newMeta.selectedRolePath) !== null && _a !== void 0 ? _a : undefined;
                        const newRoleName = yield this.plugin.findRoleNameByPath(rolePathArg);
                        this.plugin.emit("role-changed", newRoleName !== null && newRoleName !== void 0 ? newRoleName : "None");
                        (_c = (_b = this.plugin.promptService) === null || _b === void 0 ? void 0 : _b.clearRoleCache) === null || _c === void 0 ? void 0 : _c.call(_b);
                    }
                    catch (e) {
                        this.logger.error("Error finding role name or emitting role-changed:", e);
                    }
                }
                if (modelChanged) {
                    this.plugin.emit("model-changed", newMeta.modelName || "");
                    (_e = (_d = this.plugin.promptService) === null || _d === void 0 ? void 0 : _d.clearModelDetailsCache) === null || _e === void 0 ? void 0 : _e.call(_d);
                }
                this.logger.error(`[ChatManager] >>> Emitting 'active-chat-changed' from updateActiveChatMetadata for ID: ${this.activeChatId}`);
                this.plugin.emit("active-chat-changed", { chatId: this.activeChatId, chat: activeChat });
                return true;
            }
            else {
                return false;
            }
        });
    }
    // src/ChatManager.ts
    // ДОДАЙТЕ ЦЕЙ НОВИЙ ПРИВАТНИЙ МЕТОД:
    /**
     * Допоміжний метод для видалення файлу чату та запису з індексу БЕЗ генерації подій.
     * @param id ID чату для видалення.
     * @param filePath Шлях до файлу чату (може бути null).
     * @param deleteFile Чи потрібно видаляти фізичний файл.
     * @returns true, якщо індекс chatIndex був змінений, false в іншому випадку.
     */
    deleteChatFileAndIndexEntry_NoEmit(id_1, filePath_1) {
        return __awaiter(this, arguments, void 0, function* (id, filePath, deleteFile = true) {
            const safeFilePath = filePath !== null && filePath !== void 0 ? filePath : "unknown_path"; // Для логування
            let indexChanged = false;
            // Видалення з кешу завантажених чатів
            if (this.loadedChats[id]) {
                delete this.loadedChats[id];
                this.logger.debug(`[deleteHelper] Removed chat ${id} from loadedChats cache.`);
            }
            // Видалення з індексу
            if (this.chatIndex[id]) {
                delete this.chatIndex[id];
                indexChanged = true; // Помічаємо, що індекс змінився
                this.logger.debug(`[deleteHelper] Removed chat ${id} from chatIndex.`);
            }
            else {
                this.logger.debug(`[deleteHelper] Chat ${id} was not in chatIndex.`);
            }
            // Видалення файлу, якщо потрібно і можливо
            if (deleteFile && filePath && typeof filePath === "string" && filePath !== "/" && !filePath.endsWith("/")) {
                try {
                    const fileExists = yield this.adapter.exists(filePath);
                    if (fileExists) {
                        const stat = yield this.adapter.stat(filePath);
                        if ((stat === null || stat === void 0 ? void 0 : stat.type) === "file") {
                            yield this.adapter.remove(filePath);
                            this.logger.debug(`[deleteHelper] Removed chat file: ${filePath}`);
                        }
                        else {
                            this.logger.error(`[deleteHelper] Attempted to remove a non-file path: ${filePath}`);
                        }
                    }
                    else {
                        this.logger.warn(`[deleteHelper] Chat file not found for removal: ${filePath}`);
                    }
                }
                catch (e) {
                    this.logger.error(`[deleteHelper] Error removing chat file ${filePath}:`, e);
                    new Notice(`Error deleting file: ${filePath.split('/').pop()}`);
                    // Не перериваємо процес через помилку видалення файлу, індекс важливіший
                }
            }
            else if (deleteFile && filePath) {
                // Логуємо, якщо шлях некоректний для видалення
                this.logger.warn(`[deleteHelper] Invalid file path provided for deletion: ${filePath}`);
            }
            // Зберігаємо індекс, ТІЛЬКИ якщо він змінився
            if (indexChanged) {
                yield this.saveChatIndex();
                this.logger.debug(`[deleteHelper] Saved updated chatIndex after removing ${id}.`);
            }
            return indexChanged; // Повертаємо статус зміни індексу
        });
    }
    // src/ChatManager.ts
    deleteChat(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const chatExistedInIndex = !!this.chatIndex[id];
            const wasActive = id === this.activeChatId;
            this.logger.debug(`[deleteChat] Deleting chat ${id}. Was active: ${wasActive}. Existed in index: ${chatExistedInIndex}.`);
            let filePath = null;
            try {
                // Знаходимо шлях до файлу (найкраще через ієрархію)
                const hierarchy = yield this.getChatHierarchy();
                filePath = this.findChatPathInHierarchy(id, hierarchy);
                if (!filePath && chatExistedInIndex) {
                    this.logger.warn(`[deleteChat] File path for chat ${id} not found in hierarchy, but chat exists in index. Will only remove from index.`);
                }
            }
            catch (hierarchyError) {
                this.logger.error(`Error getting hierarchy during delete operation for ${id}:`, hierarchyError);
                // Продовжуємо без шляху, якщо чат є в індексі
            }
            // Якщо чату немає ні в індексі, ні шлях не знайдено (якщо він був потрібен)
            if (!filePath && !chatExistedInIndex) {
                this.logger.warn(`[deleteChat] Chat ${id} not found in index or hierarchy. Nothing to delete.`);
                return false; // Чату не існує
            }
            let success = true;
            // Змінна для події, яку потрібно згенерувати ПІСЛЯ всіх операцій
            let eventToEmit = null;
            try {
                // Викликаємо новий допоміжний метод, який НЕ генерує подій
                const indexWasChanged = yield this.deleteChatFileAndIndexEntry_NoEmit(id, filePath, true);
                this.logger.debug(`[deleteChat] deleteChatFileAndIndexEntry_NoEmit finished. Index changed: ${indexWasChanged}`);
                // Визначаємо, яку подію генерувати (або жодної)
                if (wasActive) {
                    this.logger.debug(`[deleteChat] Deleted chat was active. Finding and setting next active chat...`);
                    // Визначаємо наступний активний чат
                    const newHierarchy = yield this.getChatHierarchy(); // Отримуємо оновлену ієрархію
                    const firstChat = this.findFirstChatInHierarchy(newHierarchy);
                    const nextActiveId = firstChat ? firstChat.metadata.id : null;
                    this.logger.debug(`[deleteChat] Next active chat will be: ${nextActiveId}`);
                    // Викликаємо setActiveChat. Він сам згенерує 'active-chat-changed'.
                    // Ця подія має бути достатньою для оновлення UI (включаючи список).
                    yield this.setActiveChat(nextActiveId);
                    // Немає потреби генерувати 'chat-list-updated' окремо тут.
                }
                else if (indexWasChanged) {
                    // Якщо видалено НЕактивний чат, але індекс змінився,
                    // нам ПОТРІБНА подія 'chat-list-updated', щоб список оновився.
                    this.logger.debug(`[deleteChat] Non-active chat deleted and index changed. Setting 'chat-list-updated' to be emitted.`);
                    eventToEmit = { name: "chat-list-updated", data: undefined };
                }
            }
            catch (error) {
                this.logger.error(`Error during deletion process for chat ${id}:`, error);
                new Notice(`Error deleting chat ${id}. Check console.`);
                success = false;
                // Спробуємо відновити консистентність індексу при помилці
                yield this.rebuildIndexFromFiles();
                // Після перебудови індексу точно потрібне оновлення списку
                eventToEmit = { name: "chat-list-updated", data: undefined };
            }
            finally {
                // Генеруємо подію, якщо вона була запланована
                if (eventToEmit) {
                    this.logger.debug(`[deleteChat] Emitting final event: ${eventToEmit.name}`);
                    this.plugin.emit(eventToEmit.name, eventToEmit.data);
                }
                else if (wasActive) {
                    this.logger.debug(`[deleteChat] No final event emitted from deleteChat itself (relied on setActiveChat).`);
                }
                else {
                    this.logger.debug(`[deleteChat] No final event emitted (non-active deleted, index unchanged, or error without rebuild).`);
                }
                // Показуємо сповіщення, тільки якщо видалення було успішним і чат існував
                if (success && chatExistedInIndex) {
                    new Notice(`Chat deleted.`);
                    this.logger.info(`Chat ${id} deleted successfully.`);
                }
                else if (!chatExistedInIndex) {
                    this.logger.info(`Chat ${id} deletion attempt - chat did not exist in index.`);
                }
            }
            // Повертаємо true, якщо чат існував і операція (принаймні оновлення індексу) пройшла успішно
            return success && chatExistedInIndex;
        });
    }
    cloneChat(chatIdToClone) {
        return __awaiter(this, void 0, void 0, function* () {
            let originalFilePath = null;
            try {
                const hierarchy = yield this.getChatHierarchy();
                originalFilePath = this.findChatPathInHierarchy(chatIdToClone, hierarchy);
            }
            catch (hierarchyError) {
                this.logger.error(`Error getting hierarchy during clone operation for ${chatIdToClone}:`, hierarchyError);
                new Notice("Error finding original chat for cloning.");
                return null;
            }
            if (!originalFilePath) {
                this.logger.error(`Cannot clone: File path for original chat ${chatIdToClone} not found.`);
                new Notice("Original chat file path not found.");
                return null;
            }
            const originalChat = yield this.getChat(chatIdToClone, originalFilePath);
            if (!originalChat) {
                this.logger.error(`Cannot clone: Original chat ${chatIdToClone} could not be loaded from ${originalFilePath}.`);
                new Notice("Original chat could not be loaded.");
                return null;
            }
            const targetFolder = originalFilePath.substring(0, originalFilePath.lastIndexOf("/")) || "/";
            const finalFolderPath = targetFolder === "" || targetFolder === "." ? "/" : targetFolder;
            try {
                yield this.ensureSpecificFolderExists(finalFolderPath);
            }
            catch (folderError) {
                new Notice(`Failed to ensure target folder for clone: ${finalFolderPath}`);
                return null;
            }
            try {
                const clonedData = originalChat.toJSON();
                const now = new Date();
                const newId = uuidv4();
                const newFilePath = this.getChatFilePath(newId, finalFolderPath);
                clonedData.metadata.id = newId;
                clonedData.metadata.name = `Copy of ${originalChat.metadata.name}`;
                clonedData.metadata.createdAt = now.toISOString();
                clonedData.metadata.lastModified = now.toISOString();
                clonedData.metadata.modelName = originalChat.metadata.modelName;
                clonedData.metadata.selectedRolePath = originalChat.metadata.selectedRolePath;
                clonedData.metadata.temperature = originalChat.metadata.temperature;
                clonedData.metadata.contextWindow = originalChat.metadata.contextWindow;
                const constructorSettings = Object.assign({}, this.plugin.settings);
                const clonedChat = new Chat(this.adapter, constructorSettings, clonedData, newFilePath, this.logger);
                const storedMeta = {
                    name: clonedData.metadata.name,
                    lastModified: clonedData.metadata.lastModified,
                    createdAt: clonedData.metadata.createdAt,
                    modelName: clonedData.metadata.modelName,
                    selectedRolePath: clonedData.metadata.selectedRolePath,
                    temperature: clonedData.metadata.temperature,
                    contextWindow: clonedData.metadata.contextWindow,
                };
                this.chatIndex[newId] = storedMeta;
                yield this.saveChatIndex();
                // this.plugin.emit("chat-list-updated");
                const savedImmediately = yield clonedChat.saveImmediately();
                if (!savedImmediately) {
                    delete this.chatIndex[newId];
                    yield this.saveChatIndex();
                    this.plugin.emit("chat-list-updated");
                    this.logger.error(`Failed to save the cloned chat file for ${newId} at ${newFilePath}. Removed from index.`);
                    new Notice("Error: Failed to save the cloned chat file.");
                    return null;
                }
                this.loadedChats[newId] = clonedChat;
                yield this.setActiveChat(newId);
                return clonedChat;
            }
            catch (error) {
                this.logger.error("Error cloning chat:", error);
                new Notice("An error occurred while cloning the chat.");
                return null;
            }
        });
    }
    deleteMessagesAfter(chatId, messageIndexToDeleteAfter) {
        return __awaiter(this, void 0, void 0, function* () {
            const chat = yield this.getChat(chatId);
            if (!chat) {
                this.logger.error(`Cannot delete messages: Chat ${chatId} not found.`);
                return false;
            }
            if (messageIndexToDeleteAfter >= chat.messages.length - 1) {
                return true;
            }
            if (messageIndexToDeleteAfter < -1) {
                return false;
            }
            const originalLength = chat.messages.length;
            const targetLength = messageIndexToDeleteAfter + 1;
            chat.messages.length = targetLength;
            chat.updateMetadata({});
            yield this.saveChatAndUpdateIndex(chat);
            if (this.activeChatId === chatId) {
                this.activeChat = chat;
                this.plugin.emit("active-chat-changed", { chatId: chatId, chat: chat });
            }
            return true;
        });
    }
    deleteMessageByTimestamp(chatId, timestampToDelete) {
        return __awaiter(this, void 0, void 0, function* () {
            const chat = yield this.getChat(chatId);
            if (!chat) {
                this.logger.error(`Cannot delete message: Chat ${chatId} not found.`);
                new Notice(`Error: Chat ${chatId} not found.`);
                return false;
            }
            const timeTarget = timestampToDelete.getTime();
            const tolerance = 1000; // 1 second
            let messageIndex = -1;
            for (let i = 0; i < chat.messages.length; i++) {
                const messageTime = chat.messages[i].timestamp.getTime();
                if (!isNaN(messageTime) && Math.abs(messageTime - timeTarget) < tolerance) {
                    messageIndex = i;
                    break;
                }
                else if (isNaN(messageTime)) {
                }
            }
            if (messageIndex === -1) {
                new Notice("Message not found.");
                return false;
            }
            // Використовуємо _performDeleteMessageByIndex, який вже існує і обробляє chat object
            return yield this._performDeleteMessageByIndex(chat, messageIndex);
        });
    }
    _performDeleteMessageByIndex(chat, messageIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            const chatId = chat.metadata.id;
            try {
                if (messageIndex < 0 || messageIndex >= chat.messages.length) {
                    this.logger.error(`Invalid message index ${messageIndex} provided to _performDeleteMessageByIndex for chat ${chatId}.`);
                    return false;
                }
                const deletedMessage = chat.messages.splice(messageIndex, 1)[0];
                chat.updateMetadata({});
                yield this.saveChatAndUpdateIndex(chat);
                if (this.activeChatId === chatId) {
                    this.activeChat = chat;
                    this.plugin.emit("active-chat-changed", { chatId: chatId, chat: chat });
                }
                if (deletedMessage) {
                    this.plugin.emit("message-deleted", { chatId: chatId, timestamp: deletedMessage.timestamp });
                }
                return true;
            }
            catch (error) {
                this.logger.error(`Error during message deletion by index ${messageIndex} for chat ${chatId}:`, error);
                new Notice("Error deleting message.");
                return false;
            }
        });
    }
    clearChatMessagesById(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const chat = yield this.getChat(chatId);
            if (!chat) {
                this.logger.error(`Cannot clear messages: Chat ${chatId} not found.`);
                new Notice(`Error: Chat ${chatId} not found.`);
                return false;
            }
            if (chat.messages.length === 0) {
                return true;
            }
            try {
                chat.clearMessages();
                yield this.saveChatAndUpdateIndex(chat);
                const isActive = chatId === this.activeChatId;
                if (isActive) {
                    this.activeChat = chat;
                    this.plugin.emit("messages-cleared", chatId);
                }
                new Notice(`Messages cleared for chat "${chat.metadata.name}".`);
                return true;
            }
            catch (error) {
                this.logger.error(`Error during message clearing process for chat ${chatId}:`, error);
                new Notice("Error clearing messages.");
                return false;
            }
        });
    }
    renameChat(chatId, newName) {
        return __awaiter(this, void 0, void 0, function* () {
            const trimmedName = newName.trim();
            if (!trimmedName) {
                new Notice("Chat name cannot be empty.");
                return false;
            }
            if (/[\\/?:*"<>|]/.test(trimmedName)) {
                new Notice("Chat name contains invalid characters.");
                return false;
            }
            const chat = yield this.getChat(chatId);
            if (!chat) {
                this.logger.error(`Cannot rename: Chat ${chatId} not found.`);
                new Notice("Chat not found.");
                return false;
            }
            if (chat.metadata.name === trimmedName) {
                return true;
            }
            try {
                const changed = chat.updateMetadata({ name: trimmedName });
                if (changed) {
                    yield this.saveChatAndUpdateIndex(chat);
                    if (this.activeChatId === chatId) {
                        this.activeChat = chat;
                        this.plugin.emit("active-chat-changed", { chatId: chatId, chat: chat });
                    }
                    new Notice(`Chat renamed to "${trimmedName}".`);
                    return true;
                }
                else {
                    return false;
                }
            }
            catch (error) {
                this.logger.error(`Error renaming chat ${chatId}:`, error);
                new Notice("An error occurred while renaming the chat.");
                return false;
            }
        });
    }
    // --- НОВІ МЕТОДИ ДЛЯ ПАПОК ---
    /**
     * Створює нову папку за вказаним шляхом.
     * @param folderPath Повний, нормалізований шлях до папки, яку потрібно створити.
     * @returns true, якщо папка успішно створена, false в іншому випадку.
     */
    createFolder(folderPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPath = normalizePath(folderPath);
            // Перевірка базових правил
            if (!normalizedPath || normalizedPath === "/" || normalizedPath === ".") {
                this.logger.error("Cannot create folder at root or with empty/dot path.");
                new Notice("Invalid folder path.");
                return false;
            }
            if (normalizedPath.startsWith("..") || normalizedPath.includes("\0")) {
                this.logger.error(`Attempted to create folder with invalid path: ${normalizedPath}`);
                new Notice("Invalid characters or path traversal detected.");
                return false;
            }
            try {
                const exists = yield this.adapter.exists(normalizedPath);
                if (exists) {
                    new Notice(`"${normalizedPath.split("/").pop()}" already exists.`);
                    return false;
                }
                yield this.adapter.mkdir(normalizedPath);
                this.plugin.emit("chat-list-updated"); // Сповіщаємо UI про зміни
                return true;
            }
            catch (error) {
                if (error.code === "EPERM" || error.code === "EACCES") {
                    this.logger.error(`Permission error creating folder ${normalizedPath}:`, error);
                    new Notice(`Permission error creating folder.`);
                }
                else {
                    this.logger.error(`Error creating folder ${normalizedPath}:`, error);
                    new Notice(`Failed to create folder: ${error.message || "Unknown error"}`);
                }
                return false;
            }
        });
    }
    /**
     * Перейменовує або переміщує папку.
     * Важливо: Цей метод не оновлює індекс chatIndex автоматично для чатів всередині папки.
     * Найкраще викликати rebuildIndexFromFiles() після успішного перейменування або покладатися
     * на те, що getChatHierarchy() збиратиме актуальну структуру.
     * @param oldPath Повний, нормалізований старий шлях до папки.
     * @param newPath Повний, нормалізований новий шлях до папки.
     * @returns true, якщо перейменування/переміщення успішне, false в іншому випадку.
     */
    renameFolder(oldPath, newPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const normOldPath = normalizePath(oldPath);
            const normNewPath = normalizePath(newPath);
            // Перевірки
            if (!normOldPath || normOldPath === "/" || !normNewPath || normNewPath === "/") {
                this.logger.error("Invalid paths provided for rename operation.");
                new Notice("Cannot rename root folder or use empty path.");
                return false;
            }
            if (normOldPath === normNewPath) {
                return true; // Вважаємо успіхом, бо цільовий стан досягнуто
            }
            if (normNewPath.startsWith(normOldPath + "/")) {
                this.logger.error(`Cannot move folder "${normOldPath}" inside itself ("${normNewPath}").`);
                new Notice("Cannot move a folder inside itself.");
                return false;
            }
            try {
                const oldExists = yield this.adapter.exists(normOldPath);
                if (!oldExists) {
                    this.logger.error(`Source folder for rename does not exist: ${normOldPath}`);
                    new Notice("Folder to rename not found.");
                    return false;
                }
                const oldStat = yield this.adapter.stat(normOldPath);
                if ((oldStat === null || oldStat === void 0 ? void 0 : oldStat.type) !== "folder") {
                    this.logger.error(`Source path is not a folder: ${normOldPath}`);
                    new Notice("Item to rename is not a folder.");
                    return false;
                }
                const newExists = yield this.adapter.exists(normNewPath);
                if (newExists) {
                    this.logger.error(`Target path for rename already exists: ${normNewPath}`);
                    new Notice(`"${normNewPath.split("/").pop()}" already exists.`);
                    return false;
                }
                // Виконуємо перейменування/переміщення
                yield this.adapter.rename(normOldPath, normNewPath);
                // Оновлюємо шляхи в завантажених чатах (loadedChats), якщо вони були всередині
                Object.values(this.loadedChats).forEach(chat => {
                    if (chat.filePath.startsWith(normOldPath + "/")) {
                        const relativePath = chat.filePath.substring(normOldPath.length);
                        const updatedPath = normalizePath(normNewPath + relativePath);
                        chat.filePath = updatedPath; // Оновлюємо шлях у кешованому об'єкті
                    }
                });
                this.plugin.emit("chat-list-updated"); // Сповіщаємо UI
                return true;
            }
            catch (error) {
                if (error.code === "EPERM" || error.code === "EACCES") {
                    this.logger.error(`Permission error renaming folder ${normOldPath} to ${normNewPath}:`, error);
                    new Notice(`Permission error renaming folder.`);
                }
                else {
                    this.logger.error(`Error renaming folder ${normOldPath} to ${normNewPath}:`, error);
                    new Notice(`Failed to rename folder: ${error.message || "Unknown error"}`);
                }
                return false;
            }
        });
    }
    /**
     * Рекурсивно видаляє папку та весь її вміст (підпапки та чати).
     * @param folderPath Повний, нормалізований шлях до папки, яку потрібно видалити.
     * @returns true, якщо папка та її вміст успішно видалені, false в іншому випадку.
     */
    deleteFolder(folderPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPath = normalizePath(folderPath);
            // Перевірка, чи шлях валідний і не є коренем сховища або основною папкою чатів
            if (!normalizedPath || normalizedPath === "/" || normalizedPath === ".") {
                this.logger.error(`Attempted to delete root or invalid folder path: ${normalizedPath}`);
                new Notice("Cannot delete this folder.");
                return false;
            }
            // Додаткова перевірка на основну папку чатів
            if (normalizedPath === this.chatsFolderPath) {
                this.logger.error(`Attempted to delete the main chat history folder: ${normalizedPath}`);
                new Notice("Cannot delete the main chat history folder set in settings.");
                return false;
            }
            try {
                const exists = yield this.adapter.exists(normalizedPath);
                if (!exists) {
                    // Вважаємо успіхом, якщо папки вже немає
                    return true;
                }
                const stat = yield this.adapter.stat(normalizedPath);
                if ((stat === null || stat === void 0 ? void 0 : stat.type) !== "folder") {
                    this.logger.error(`Path to delete is not a folder: ${normalizedPath}`);
                    new Notice("Item to delete is not a folder.");
                    return false;
                }
                // --- Очищення індексу та кешу ПЕРЕД видаленням ---
                const chatIdsToDelete = [];
                // Функція для рекурсивного збору ID чатів
                const collectChatIds = (currentPath) => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const list = yield this.adapter.list(currentPath);
                        for (const file of list.files) {
                            const fileName = file.substring(file.lastIndexOf("/") + 1);
                            if (fileName.endsWith(".json")) {
                                const chatId = fileName.slice(0, -5);
                                // Перевіряємо, чи є такий ID в індексі
                                if (this.chatIndex[chatId]) {
                                    chatIdsToDelete.push(chatId);
                                }
                            }
                        }
                        for (const folder of list.folders) {
                            yield collectChatIds(folder); // Рекурсія
                        }
                    }
                    catch (listError) {
                        this.logger.error(`Error listing folder ${currentPath} during pre-delete cleanup:`, listError);
                    }
                });
                yield collectChatIds(normalizedPath); // Збираємо ID
                let activeChatWasDeleted = false;
                chatIdsToDelete.forEach(id => {
                    if (this.chatIndex[id]) {
                        delete this.chatIndex[id];
                    }
                    if (this.loadedChats[id]) {
                        delete this.loadedChats[id];
                    }
                    if (this.activeChatId === id) {
                        activeChatWasDeleted = true;
                        this.activeChatId = null; // Скидаємо активний ID
                        this.activeChat = null;
                    }
                });
                // Зберігаємо змінений індекс
                yield this.saveChatIndex();
                // Якщо активний чат був видалений, зберігаємо null
                if (activeChatWasDeleted) {
                    yield this.plugin.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
                }
                // --- Кінець очищення ---
                // Використовуємо рекурсивне видалення адаптера
                yield this.adapter.rmdir(normalizedPath, true);
                // Сповіщаємо UI про зміни (оскільки індекс оновлено)
                this.plugin.emit("chat-list-updated");
                // Якщо активний чат скинуто, сповіщаємо про це
                if (activeChatWasDeleted) {
                    this.plugin.emit("active-chat-changed", { chatId: null, chat: null });
                    // Спробувати активувати наступний доступний чат (необов'язково тут, бо SidebarManager це робить)
                }
                return true;
            }
            catch (error) {
                if (error.code === "EPERM" || error.code === "EACCES") {
                    this.logger.error(`Permission error deleting folder ${normalizedPath}:`, error);
                    new Notice(`Permission error deleting folder.`);
                }
                else {
                    this.logger.error(`Error deleting folder ${normalizedPath}:`, error);
                    new Notice(`Failed to delete folder: ${error.message || "Unknown error"}`);
                }
                // Спробуємо перебудувати індекс, щоб виправити можливу розсинхронізацію
                yield this.rebuildIndexFromFiles();
                return false;
            }
        });
    }
    // --- ВИПРАВЛЕНИЙ МЕТОД: Переміщення чату ---
    moveChat(chatId, oldFilePath, newFolderPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const normOldPath = normalizePath(oldFilePath);
            const normNewFolderPath = normalizePath(newFolderPath);
            this.logger.info(`Attempting to move chat ${chatId} from "${normOldPath}" to folder "${normNewFolderPath}"`);
            // --- Оголошуємо newFilePath тут, поза try ---
            let newFilePath = null;
            // ----------------------------------------
            // 1. Валідація
            if (!chatId || !oldFilePath || !newFolderPath) {
                this.logger.error("Move chat failed: Invalid arguments provided.");
                new Notice("Move chat failed: Invalid data.");
                return false;
            }
            try {
                // Перевірка існування джерела
                if (!(yield this.adapter.exists(normOldPath))) {
                    this.logger.error(`Move chat failed: Source file does not exist: ${normOldPath}`);
                    new Notice("Move chat failed: Source file not found.");
                    yield this.rebuildIndexFromFiles();
                    this.plugin.emit('chat-list-updated');
                    return false;
                }
                const oldStat = yield this.adapter.stat(normOldPath);
                if ((oldStat === null || oldStat === void 0 ? void 0 : oldStat.type) !== 'file') {
                    this.logger.error(`Move chat failed: Source path is not a file: ${normOldPath}`);
                    new Notice("Move chat failed: Source is not a file.");
                    return false;
                }
                // Перевірка існування цільової папки
                if (!(yield this.adapter.exists(normNewFolderPath))) {
                    this.logger.error(`Move chat failed: Target folder does not exist: ${normNewFolderPath}`);
                    new Notice("Move chat failed: Target folder not found.");
                    return false;
                }
                const newStat = yield this.adapter.stat(normNewFolderPath);
                if ((newStat === null || newStat === void 0 ? void 0 : newStat.type) !== 'folder') {
                    this.logger.error(`Move chat failed: Target path is not a folder: ${normNewFolderPath}`);
                    new Notice("Move chat failed: Target is not a folder.");
                    return false;
                }
                // 2. Визначення нового шляху
                const fileName = oldFilePath.substring(oldFilePath.lastIndexOf('/') + 1);
                // --- Присвоюємо значення оголошеній змінній ---
                newFilePath = normalizePath(`${normNewFolderPath}/${fileName}`);
                // ------------------------------------------
                // Перевірка, чи файл вже в цільовій папці
                if (normOldPath === newFilePath) {
                    this.logger.warn(`Move chat skipped: Source and target paths are the same: ${normOldPath}`);
                    return true;
                }
                // 3. Перевірка на конфлікт імен
                if (yield this.adapter.exists(newFilePath)) {
                    this.logger.error(`Move chat failed: File already exists at target path: ${newFilePath}`);
                    new Notice(`Move chat failed: A file named "${fileName}" already exists in the target folder.`);
                    return false;
                }
                // 4. Переміщення файлу
                this.logger.debug(`Executing adapter.rename from "${normOldPath}" to "${newFilePath}"`);
                yield this.adapter.rename(normOldPath, newFilePath);
                this.logger.info(`Chat file moved successfully to ${newFilePath}`);
                // 5. Оновлення кешу завантажених чатів
                if (this.loadedChats[chatId] && newFilePath) { // Перевіряємо, що newFilePath не null
                    this.logger.debug(`Updating file path in loadedChats cache for ${chatId} to ${newFilePath}`);
                    this.loadedChats[chatId].filePath = newFilePath;
                }
                // 6. Оновлення UI (Індекс оновиться пізніше через Vault Event)
                this.plugin.emit('chat-list-updated');
                return true;
            }
            catch (error) {
                // --- Тепер newFilePath доступний тут (може бути null, якщо помилка сталася до присвоєння) ---
                const targetPathDesc = newFilePath !== null && newFilePath !== void 0 ? newFilePath : normNewFolderPath; // Використовуємо папку, якщо шлях файлу ще не визначено
                if (error.code === 'EPERM' || error.code === 'EACCES') {
                    this.logger.error(`Permission error moving chat file from "${normOldPath}" towards "${targetPathDesc}":`, error);
                    new Notice(`Permission error moving chat file.`);
                }
                else {
                    // Використовуємо targetPathDesc в логуванні
                    this.logger.error(`Error moving chat file from "${normOldPath}" towards "${targetPathDesc}":`, error);
                    new Notice(`Failed to move chat: ${error.message || "Unknown error"}`);
                }
                // ---
                yield this.rebuildIndexFromFiles();
                this.plugin.emit('chat-list-updated');
                return false;
            }
        });
    }
    /**
     * Реєструє резолвер для події message-added.
     * Цей метод викликатиметься з OllamaView перед тим, як ChatManager додасть повідомлення.
     */
    registerHMAResolver(timestampMs, resolve, reject) {
        if (this.messageAddedResolvers.has(timestampMs)) {
            this.plugin.logger.warn(`[ChatManager] HMA Resolver for timestamp ${timestampMs} already exists. Overwriting.`);
        }
        this.messageAddedResolvers.set(timestampMs, { resolve, reject });
        this.plugin.logger.debug(`[ChatManager] HMA Resolver registered for timestamp ${timestampMs}. Map size: ${this.messageAddedResolvers.size}`);
    }
    /**
     * Викликає та видаляє резолвер для події message-added.
     * Цей метод викликатиметься з OllamaView.handleMessageAdded.
     */
    invokeHMAResolver(timestampMs) {
        const resolverPair = this.messageAddedResolvers.get(timestampMs);
        if (resolverPair) {
            this.plugin.logger.debug(`[ChatManager] Invoking HMA Resolver for timestamp ${timestampMs}.`);
            resolverPair.resolve();
            this.messageAddedResolvers.delete(timestampMs);
            this.plugin.logger.debug(`[ChatManager] HMA Resolver for timestamp ${timestampMs} invoked and deleted. Map size: ${this.messageAddedResolvers.size}`);
        }
        else {
            this.plugin.logger.warn(`[ChatManager] No HMA Resolver found to invoke for timestamp ${timestampMs}. Map size: ${this.messageAddedResolvers.size}`);
        }
    }
    rejectAndClearHMAResolver(timestampMs, reason) {
        const resolverPair = this.messageAddedResolvers.get(timestampMs);
        if (resolverPair) {
            this.plugin.logger.warn(`[ChatManager] Rejecting HMA Resolver for ts ${timestampMs} due to: ${reason}`);
            resolverPair.reject(new Error(reason));
            this.messageAddedResolvers.delete(timestampMs);
        }
    }
    /**
     * Додає повідомлення користувача до активного чату, зберігає його,
     * генерує подію "message-added" (для OllamaView.handleMessageAdded)
     * та повертає проміс, який вирішується, коли handleMessageAdded завершить рендеринг.
     * @param content Вміст повідомлення користувача.
     * @param timestamp Мітка часу повідомлення.
     * @param requestTimestampId Унікальний ID запиту для логування.
     * @returns Проміс, що вирішується після рендерингу, або null, якщо сталася помилка.
     */
    addUserMessageAndAwaitRender(content, timestamp, requestTimestampId // Для узгодженого логування
    ) {
        return __awaiter(this, void 0, void 0, function* () {
            const activeChat = yield this.getActiveChat(); // Припускаємо, що getActiveChat повертає Chat | null
            if (!activeChat) {
                this.plugin.logger.error(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] Cannot add message: No active chat.`);
                return null;
            }
            const messageTimestampMs = timestamp.getTime();
            const userMessage = {
                role: "user", // Використовуємо імпортований тип
                content,
                timestamp,
            };
            this.plugin.logger.debug(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] Setting up HMA Promise for UserMessage (ts: ${messageTimestampMs}).`);
            const hmaPromise = new Promise((resolve, reject) => {
                // Реєструємо резолвер в ChatManager, щоб OllamaView.handleMessageAdded міг його викликати
                this.registerHMAResolver(messageTimestampMs, resolve, reject);
                // Таймаут для HMA
                setTimeout(() => {
                    if (this.messageAddedResolvers.has(messageTimestampMs)) { // Перевіряємо, чи резолвер ще там
                        const reason = `HMA Timeout for UserMessage (ts: ${messageTimestampMs}) in ChatManager.`;
                        this.plugin.logger.warn(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] ${reason}`);
                        this.rejectAndClearHMAResolver(messageTimestampMs, reason);
                    }
                }, 10000); // 10 секунд таймаут
            });
            // Додаємо повідомлення до масиву повідомлень чату та зберігаємо чат
            // addMessageToActiveChatPayload має дбати про збереження та емітування події "message-added"
            const addedMessage = yield this.addMessageToActiveChatPayload(userMessage, true);
            if (!addedMessage) {
                this.plugin.logger.error(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] Failed to add user message payload for ts: ${messageTimestampMs}.`);
                this.rejectAndClearHMAResolver(messageTimestampMs, "Failed to add message payload to ChatManager.");
                return null;
            }
            this.plugin.logger.debug(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] UserMessage (ts: ${messageTimestampMs}) added to ChatManager. Waiting for HMA completion.`);
            try {
                yield hmaPromise;
                this.plugin.logger.info(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] HMA completed for UserMessage (ts: ${messageTimestampMs}).`);
                return userMessage;
            }
            catch (error) {
                this.plugin.logger.error(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] Error or timeout waiting for HMA for UserMessage (ts: ${messageTimestampMs}):`, error);
                // Резолвер вже мав бути видалений rejectAndClearHMAResolver
                return null; // Або кинути помилку далі, якщо потрібно
            }
        });
    }
} // End of ChatManager class
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2hhdE1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJDaGF0TWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEscUJBQXFCO0FBQ3JCLE9BQU8sRUFBTyxNQUFNLEVBQWUsYUFBYSxFQUFvQyxNQUFNLFVBQVUsQ0FBQyxDQUFDLHVCQUF1QjtBQUM3SCxPQUFxQixFQUFFLGtCQUFrQixFQUFFLGNBQWMsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUMxRSxPQUFPLEVBQUUsSUFBSSxFQUFtRCxNQUFNLFFBQVEsQ0FBQztBQUUvRSxPQUFPLEVBQUUsRUFBRSxJQUFJLE1BQU0sRUFBRSxNQUFNLE1BQU0sQ0FBQztBQWdEcEMsTUFBTSxPQUFPLFdBQVc7SUFhdEIsWUFBWSxNQUFvQjtRQVR6QixvQkFBZSxHQUFXLEdBQUcsQ0FBQyxDQUFDLCtDQUErQztRQUM3RSxjQUFTLEdBQXFCLEVBQUUsQ0FBQztRQUNqQyxpQkFBWSxHQUFrQixJQUFJLENBQUM7UUFDbkMsZUFBVSxHQUFnQixJQUFJLENBQUM7UUFDL0IsZ0JBQVcsR0FBeUIsRUFBRSxDQUFDO1FBQ3hDLHFCQUFnQixHQUFxQixJQUFJLENBQUM7UUFFMUMsMEJBQXFCLEdBQXVFLElBQUksR0FBRyxFQUFFLENBQUM7UUFHM0csSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLEdBQUcsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDO1FBQ3RCLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQztJQUM5QixDQUFDO0lBRUssVUFBVTs7WUFDZCxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixNQUFNLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FB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QUFtRCxrQkFBa0Isd0NBQXdDLGtCQUFrQixJQUFJLENBQUMsQ0FBQztnQkFDN0osT0FBTyxXQUFXLENBQUM7WUFDdkIsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLG1EQUFtRCxrQkFBa0IsMkRBQTJELGtCQUFrQixJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ3hMLDREQUE0RDtnQkFDNUQsT0FBTyxJQUFJLENBQUMsQ0FBQyx5Q0FBeUM7WUFDMUQsQ0FBQztRQUNILENBQUM7S0FBQTtDQUVGLENBQUMsMkJBQTJCIiwic291cmNlc0NvbnRlbnQiOlsiLy8gc3JjL0NoYXRNYW5hZ2VyLnRzXG5pbXBvcnQgeyBBcHAsIE5vdGljZSwgRGF0YUFkYXB0ZXIsIG5vcm1hbGl6ZVBhdGgsIFRGb2xkZXIsIGRlYm91bmNlLCBUQWJzdHJhY3RGaWxlIH0gZnJvbSBcIm9ic2lkaWFuXCI7IC8vINCU0L7QtNCw0L3QviBUQWJzdHJhY3RGaWxlXG5pbXBvcnQgT2xsYW1hUGx1Z2luLCB7IEFDVElWRV9DSEFUX0lEX0tFWSwgQ0hBVF9JTkRFWF9LRVkgfSBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQgeyBDaGF0LCBDaGF0TWV0YWRhdGEsIENoYXREYXRhLCBDaGF0Q29uc3RydWN0b3JTZXR0aW5ncyB9IGZyb20gXCIuL0NoYXRcIjtcbmltcG9ydCB7IE1lc3NhZ2VSb2xlIH0gZnJvbSBcIi4vT2xsYW1hVmlld1wiOyAvLyDQn9GA0LjQv9GD0YHQutCw0ZTQvNC+LCDRidC+INGC0LjQv9C4INGC0YPRglxuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSBcInV1aWRcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCIuL0xvZ2dlclwiO1xuaW1wb3J0IHsgVG9vbENhbGwsIE1lc3NhZ2UsIE1lc3NhZ2VSb2xlIGFzIE1lc3NhZ2VSb2xlVHlwZUZyb21UeXBlcyB9IGZyb20gXCIuL3R5cGVzXCI7IFxuXG5leHBvcnQgdHlwZSBITUFDb21wbGV0aW9uQ2FsbGJhY2sgPSAobWVzc2FnZVRpbWVzdGFtcE1zOiBudW1iZXIpID0+IHZvaWQ7XG5leHBvcnQgdHlwZSBITUFSZXNvbHZlclJlZ2lzdHJhdGlvbiA9ICh0aW1lc3RhbXBNczogbnVtYmVyLCByZXNvbHZlOiAoKSA9PiB2b2lkLCByZWplY3Q6IChyZWFzb24/OiBhbnkpID0+IHZvaWQpID0+IHZvaWQ7XG5cbi8vIC0tLSDQotCY0J/QmCDQlNCb0K8g0IbQhNCg0JDQoNCl0IbQhyAtLS1cbmV4cG9ydCBpbnRlcmZhY2UgRm9sZGVyTm9kZSB7XG4gIHR5cGU6IFwiZm9sZGVyXCI7XG4gIG5hbWU6IHN0cmluZztcbiAgcGF0aDogc3RyaW5nO1xuICBjaGlsZHJlbjogQXJyYXk8Rm9sZGVyTm9kZSB8IENoYXROb2RlPjtcbiAgaXNFeHBhbmRlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2hhdE5vZGUge1xuICB0eXBlOiBcImNoYXRcIjtcbiAgbWV0YWRhdGE6IENoYXRNZXRhZGF0YTtcbiAgZmlsZVBhdGg6IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgSGllcmFyY2h5Tm9kZSA9IEZvbGRlck5vZGUgfCBDaGF0Tm9kZTtcbi8vIC0tLSDQmtCG0J3QldCm0Kwg0KLQmNCf0IbQkiDQlNCb0K8g0IbQhNCg0JDQoNCl0IbQhyAtLS1cblxuaW50ZXJmYWNlIENoYXRTZXNzaW9uU3RvcmVkIHtcbiAgbmFtZTogc3RyaW5nO1xuICBsYXN0TW9kaWZpZWQ6IHN0cmluZztcbiAgY3JlYXRlZEF0OiBzdHJpbmc7XG4gIG1vZGVsTmFtZT86IHN0cmluZztcbiAgc2VsZWN0ZWRSb2xlUGF0aD86IHN0cmluZztcbiAgdGVtcGVyYXR1cmU/OiBudW1iZXI7XG4gIGNvbnRleHRXaW5kb3c/OiBudW1iZXI7XG59XG5pbnRlcmZhY2UgQ2hhdFNlc3Npb25JbmRleCB7XG4gIFtpZDogc3RyaW5nXTogQ2hhdFNlc3Npb25TdG9yZWQ7XG59XG5leHBvcnQgaW50ZXJmYWNlIFJvbGVJbmZvIHtcbiAgbmFtZTogc3RyaW5nO1xuICBwYXRoOiBzdHJpbmc7XG4gIGlzQ3VzdG9tOiBib29sZWFuO1xufVxuaW50ZXJmYWNlIFRhc2tTdGF0ZSB7XG4gIHVyZ2VudDogc3RyaW5nW107XG4gIHJlZ3VsYXI6IHN0cmluZ1tdO1xuICBoYXNDb250ZW50OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdE1hbmFnZXIge1xuICBwcml2YXRlIHBsdWdpbjogT2xsYW1hUGx1Z2luO1xuICBwcml2YXRlIGFwcDogQXBwO1xuICBwcml2YXRlIGFkYXB0ZXI6IERhdGFBZGFwdGVyO1xuICBwdWJsaWMgY2hhdHNGb2xkZXJQYXRoOiBzdHJpbmcgPSBcIi9cIjsgLy8g0JfRgNC+0LHQu9C10L3QviBwdWJsaWMg0LTQu9GPINC00L7RgdGC0YPQv9GDINC3IFNpZGViYXJNYW5hZ2VyXG4gIHByaXZhdGUgY2hhdEluZGV4OiBDaGF0U2Vzc2lvbkluZGV4ID0ge307XG4gIHByaXZhdGUgYWN0aXZlQ2hhdElkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBhY3RpdmVDaGF0OiBDaGF0IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgbG9hZGVkQ2hhdHM6IFJlY29yZDxzdHJpbmcsIENoYXQ+ID0ge307XG4gIHB1YmxpYyBjdXJyZW50VGFza1N0YXRlOiBUYXNrU3RhdGUgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBsb2dnZXI6IExvZ2dlcjtcbiAgcHVibGljIG1lc3NhZ2VBZGRlZFJlc29sdmVyczogTWFwPG51bWJlciwge3Jlc29sdmU6ICgpID0+IHZvaWQsIHJlamVjdDogKHJlYXNvbj86IGFueSkgPT4gdm9pZH0+ID0gbmV3IE1hcCgpO1xuXG4gIGNvbnN0cnVjdG9yKHBsdWdpbjogT2xsYW1hUGx1Z2luKSB7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gICAgdGhpcy5hcHAgPSBwbHVnaW4uYXBwO1xuICAgIHRoaXMuYWRhcHRlciA9IHBsdWdpbi5hcHAudmF1bHQuYWRhcHRlcjtcbiAgICB0aGlzLmxvZ2dlciA9IHBsdWdpbi5sb2dnZXI7XG4gIH1cblxuICBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMudXBkYXRlQ2hhdHNGb2xkZXJQYXRoKCk7XG4gICAgYXdhaXQgdGhpcy5lbnN1cmVGb2xkZXJzRXhpc3QoKTtcbiAgICBhd2FpdCB0aGlzLmxvYWRDaGF0SW5kZXgodHJ1ZSk7XG5cbiAgICBjb25zdCBzYXZlZEFjdGl2ZUlkID0gYXdhaXQgdGhpcy5wbHVnaW4ubG9hZERhdGFLZXkoQUNUSVZFX0NIQVRfSURfS0VZKTtcbiAgICBpZiAoc2F2ZWRBY3RpdmVJZCAmJiB0aGlzLmNoYXRJbmRleFtzYXZlZEFjdGl2ZUlkXSkge1xuICAgICAgYXdhaXQgdGhpcy5zZXRBY3RpdmVDaGF0KHNhdmVkQWN0aXZlSWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyAgaWYgKHNhdmVkQWN0aXZlSWQpXG4gICAgICAvL1xuICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGFLZXkoQUNUSVZFX0NIQVRfSURfS0VZLCBudWxsKTtcbiAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IGF3YWl0IHRoaXMuZ2V0Q2hhdEhpZXJhcmNoeSgpO1xuICAgICAgY29uc3QgZmlyc3RDaGF0ID0gdGhpcy5maW5kRmlyc3RDaGF0SW5IaWVyYXJjaHkoaGllcmFyY2h5KTtcbiAgICAgIGlmIChmaXJzdENoYXQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5zZXRBY3RpdmVDaGF0KGZpcnN0Q2hhdC5tZXRhZGF0YS5pZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLnNldEFjdGl2ZUNoYXQobnVsbCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBmaW5kRmlyc3RDaGF0SW5IaWVyYXJjaHkobm9kZXM6IEhpZXJhcmNoeU5vZGVbXSk6IENoYXROb2RlIHwgbnVsbCB7XG4gICAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG4gICAgICBpZiAobm9kZS50eXBlID09PSBcImNoYXRcIikge1xuICAgICAgICBpZiAoIWlzTmFOKG5ldyBEYXRlKG5vZGUubWV0YWRhdGEubGFzdE1vZGlmaWVkKS5nZXRUaW1lKCkpKSB7XG4gICAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAobm9kZS50eXBlID09PSBcImZvbGRlclwiKSB7XG4gICAgICAgIGNvbnN0IGNoYXRJbkZvbGRlciA9IHRoaXMuZmluZEZpcnN0Q2hhdEluSGllcmFyY2h5KG5vZGUuY2hpbGRyZW4pO1xuICAgICAgICBpZiAoY2hhdEluRm9sZGVyKSB7XG4gICAgICAgICAgcmV0dXJuIGNoYXRJbkZvbGRlcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHVwZGF0ZUNoYXRzRm9sZGVyUGF0aCgpOiB2b2lkIHtcbiAgICBjb25zdCBzZXR0aW5nc1BhdGggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jaGF0SGlzdG9yeUZvbGRlclBhdGg/LnRyaW0oKTtcbiAgICB0aGlzLmNoYXRzRm9sZGVyUGF0aCA9IHNldHRpbmdzUGF0aCA/IG5vcm1hbGl6ZVBhdGgoc2V0dGluZ3NQYXRoKSA6IFwiL1wiO1xuICAgIGlmICh0aGlzLmNoYXRzRm9sZGVyUGF0aCAhPT0gXCIvXCIgJiYgdGhpcy5jaGF0c0ZvbGRlclBhdGguZW5kc1dpdGgoXCIvXCIpKSB7XG4gICAgICB0aGlzLmNoYXRzRm9sZGVyUGF0aCA9IHRoaXMuY2hhdHNGb2xkZXJQYXRoLnNsaWNlKDAsIC0xKTtcbiAgICB9XG4gICAgLy8g0J/QtdGA0LXQstGW0YDQutCwINGH0Lgg0YjQu9GP0YUg0L3QtSDQv9C+0YDQvtC20L3RltC5INC/0ZbRgdC70Y8g0L7QsdGA0ZbQt9C60LhcbiAgICBpZiAoIXRoaXMuY2hhdHNGb2xkZXJQYXRoKSB7XG4gICAgICB0aGlzLmNoYXRzRm9sZGVyUGF0aCA9IFwiL1wiO1xuICAgIH1cbiAgfVxuXG4gIHVwZGF0ZVRhc2tTdGF0ZSh0YXNrczogVGFza1N0YXRlIHwgbnVsbCkge1xuICAgIHRoaXMuY3VycmVudFRhc2tTdGF0ZSA9IHRhc2tzO1xuICB9XG5cbiAgZ2V0Q3VycmVudFRhc2tTdGF0ZSgpOiBUYXNrU3RhdGUgfCBudWxsIHtcbiAgICByZXR1cm4gdGhpcy5jdXJyZW50VGFza1N0YXRlO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGVuc3VyZUZvbGRlcnNFeGlzdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBoaXN0b3J5UGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmNoYXRIaXN0b3J5Rm9sZGVyUGF0aD8udHJpbSgpO1xuICAgIGNvbnN0IGV4cG9ydFBhdGggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jaGF0RXhwb3J0Rm9sZGVyUGF0aD8udHJpbSgpO1xuXG4gICAgY29uc3QgY2hlY2tBbmRDcmVhdGUgPSBhc3luYyAoZm9sZGVyUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbCwgZm9sZGVyRGVzYzogc3RyaW5nKSA9PiB7XG4gICAgICBpZiAoIWZvbGRlclBhdGggfHwgZm9sZGVyUGF0aCA9PT0gXCIvXCIpIHJldHVybjtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKGZvbGRlclBhdGgpO1xuICAgICAgLy8g0JTQvtC00LDRgtC60L7QstCwINC/0LXRgNC10LLRltGA0LrQsCDQvdCwINCx0LXQt9C/0LXQutGDINGI0LvRj9GF0YNcbiAgICAgIGlmIChub3JtYWxpemVkLnN0YXJ0c1dpdGgoXCIuLlwiKSB8fCBub3JtYWxpemVkLmluY2x1ZGVzKFwiXFwwXCIpKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoYEVycm9yOiBJbnZhbGlkIHBhdGggZm9yICR7Zm9sZGVyRGVzY30uYCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHMobm9ybWFsaXplZCk7XG4gICAgICAgIGlmICghZXhpc3RzKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyLm1rZGlyKG5vcm1hbGl6ZWQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuc3RhdChub3JtYWxpemVkKTtcbiAgICAgICAgICBpZiAoc3RhdD8udHlwZSAhPT0gXCJmb2xkZXJcIikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3I6IFBhdGggZm9yICR7Zm9sZGVyRGVzY30gaXMgbm90IGEgZm9sZGVyLmApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGBFcnJvciBhY2Nlc3NpbmcgZm9sZGVyIGZvciAke2ZvbGRlckRlc2N9LiBDaGVjayBwZXJtaXNzaW9ucy5gKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIGF3YWl0IGNoZWNrQW5kQ3JlYXRlKGhpc3RvcnlQYXRoLCBcIkNoYXQgSGlzdG9yeVwiKTtcbiAgICBhd2FpdCBjaGVja0FuZENyZWF0ZShleHBvcnRQYXRoLCBcIkNoYXQgRXhwb3J0XCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBsb2FkQ2hhdEluZGV4KGZvcmNlU2NhbjogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc3RvcmVkSW5kZXggPSBhd2FpdCB0aGlzLnBsdWdpbi5sb2FkRGF0YUtleShDSEFUX0lOREVYX0tFWSk7XG5cbiAgICBjb25zdCBzZXR0aW5nc1BhdGggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jaGF0SGlzdG9yeUZvbGRlclBhdGg/LnRyaW0oKTtcbiAgICBjb25zdCBjdXJyZW50UGF0aCA9IHNldHRpbmdzUGF0aCAmJiBzZXR0aW5nc1BhdGggIT09IFwiL1wiID8gbm9ybWFsaXplUGF0aChzZXR0aW5nc1BhdGgpIDogXCIvXCI7XG4gICAgaWYgKGN1cnJlbnRQYXRoICE9PSB0aGlzLmNoYXRzRm9sZGVyUGF0aCkge1xuICAgICAgdGhpcy51cGRhdGVDaGF0c0ZvbGRlclBhdGgoKTtcbiAgICAgIGZvcmNlU2NhbiA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKCFmb3JjZVNjYW4gJiYgc3RvcmVkSW5kZXggJiYgdHlwZW9mIHN0b3JlZEluZGV4ID09PSBcIm9iamVjdFwiICYmIE9iamVjdC5rZXlzKHN0b3JlZEluZGV4KS5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBmaXJzdEtleSA9IE9iamVjdC5rZXlzKHN0b3JlZEluZGV4KVswXTtcbiAgICAgIGlmIChcbiAgICAgICAgc3RvcmVkSW5kZXhbZmlyc3RLZXldICYmXG4gICAgICAgIHR5cGVvZiBzdG9yZWRJbmRleFtmaXJzdEtleV0ubmFtZSA9PT0gXCJzdHJpbmdcIiAmJlxuICAgICAgICB0eXBlb2Ygc3RvcmVkSW5kZXhbZmlyc3RLZXldLmxhc3RNb2RpZmllZCA9PT0gXCJzdHJpbmdcIiAmJlxuICAgICAgICB0eXBlb2Ygc3RvcmVkSW5kZXhbZmlyc3RLZXldLmNyZWF0ZWRBdCA9PT0gXCJzdHJpbmdcIlxuICAgICAgKSB7XG4gICAgICAgIHRoaXMuY2hhdEluZGV4ID0gc3RvcmVkSW5kZXg7XG5cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm9yY2VTY2FuID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKCFmb3JjZVNjYW4gJiYgc3RvcmVkSW5kZXggJiYgdHlwZW9mIHN0b3JlZEluZGV4ID09PSBcIm9iamVjdFwiICYmIE9iamVjdC5rZXlzKHN0b3JlZEluZGV4KS5sZW5ndGggPT09IDApIHtcbiAgICAgIHRoaXMuY2hhdEluZGV4ID0ge307XG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIGlmICghZm9yY2VTY2FuKSB7XG4gICAgICBmb3JjZVNjYW4gPSB0cnVlO1xuICAgIH1cblxuICAgIGlmIChmb3JjZVNjYW4pIHtcbiAgICAgIGF3YWl0IHRoaXMucmVidWlsZEluZGV4RnJvbUZpbGVzKCk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlYnVpbGRJbmRleEZyb21GaWxlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBuZXdJbmRleDogQ2hhdFNlc3Npb25JbmRleCA9IHt9O1xuICAgIGxldCBjaGF0c0xvYWRlZCA9IDA7XG4gICAgbGV0IGZpbGVzU2Nhbm5lZCA9IDA7XG5cbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuY2hhdHNGb2xkZXJQYXRoICE9PSBcIi9cIikge1xuICAgICAgICBjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuZXhpc3RzKHRoaXMuY2hhdHNGb2xkZXJQYXRoKTtcbiAgICAgICAgaWYgKCFleGlzdHMpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyLm1rZGlyKHRoaXMuY2hhdHNGb2xkZXJQYXRoKTtcbiAgICAgICAgICB9IGNhdGNoIChta2RpckVycm9yKSB7XG4gICAgICAgICAgICB0aGlzLmNoYXRJbmRleCA9IHt9O1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEluZGV4KCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuc3RhdCh0aGlzLmNoYXRzRm9sZGVyUGF0aCk7XG4gICAgICAgICAgaWYgKHN0YXQ/LnR5cGUgIT09IFwiZm9sZGVyXCIpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yOiBDaGF0IGhpc3RvcnkgcGF0aCAnJHt0aGlzLmNoYXRzRm9sZGVyUGF0aH0nIGlzIG5vdCBhIGZvbGRlci5gKTtcbiAgICAgICAgICAgIHRoaXMuY2hhdEluZGV4ID0ge307XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0SW5kZXgoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2NhbkFuZEluZGV4ID0gYXN5bmMgKGZvbGRlclBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgICAgICBsZXQgbGlzdFJlc3VsdDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsaXN0UmVzdWx0ID0gYXdhaXQgdGhpcy5hZGFwdGVyLmxpc3QoZm9sZGVyUGF0aCk7XG4gICAgICAgIH0gY2F0Y2ggKGxpc3RFcnJvcjogYW55KSB7XG4gICAgICAgICAgaWYgKGxpc3RFcnJvci5tZXNzYWdlICYmIGxpc3RFcnJvci5tZXNzYWdlLmluY2x1ZGVzKFwiTm90IGEgZGlyZWN0b3J5XCIpKSB7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCBmdWxsUGF0aCBvZiBsaXN0UmVzdWx0LmZpbGVzKSB7XG4gICAgICAgICAgY29uc3QgZmlsZU5hbWUgPSBmdWxsUGF0aC5zdWJzdHJpbmcoZnVsbFBhdGgubGFzdEluZGV4T2YoXCIvXCIpICsgMSk7XG4gICAgICAgICAgaWYgKCFmaWxlTmFtZS5lbmRzV2l0aChcIi5qc29uXCIpIHx8IGZpbGVOYW1lLnN0YXJ0c1dpdGgoXCIuXCIpKSBjb250aW51ZTtcblxuICAgICAgICAgIGNvbnN0IHV1aWRQYXR0ZXJuID0gL15bMC05YS1mQS1GXXs4fS1bMC05YS1mQS1GXXs0fS1bMC05YS1mQS1GXXs0fS1bMC05YS1mQS1GXXs0fS1bMC05YS1mQS1GXXsxMn1cXC5qc29uJC9pO1xuICAgICAgICAgIGNvbnN0IG9sZFBhdHRlcm4gPSAvXmNoYXRfXFxkK19bYS16QS1aMC05XStcXC5qc29uJC87XG5cbiAgICAgICAgICBpZiAoIXV1aWRQYXR0ZXJuLnRlc3QoZmlsZU5hbWUpICYmICFvbGRQYXR0ZXJuLnRlc3QoZmlsZU5hbWUpKSBjb250aW51ZTtcbiAgICAgICAgICBmaWxlc1NjYW5uZWQrKztcblxuICAgICAgICAgIGNvbnN0IGNoYXRJZCA9IGZpbGVOYW1lLnNsaWNlKDAsIC01KTtcblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBqc29uQ29udGVudCA9IGF3YWl0IHRoaXMuYWRhcHRlci5yZWFkKGZ1bGxQYXRoKTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKGpzb25Db250ZW50KSBhcyBQYXJ0aWFsPENoYXREYXRhPjtcblxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICBkYXRhPy5tZXRhZGF0YT8uaWQgPT09IGNoYXRJZCAmJlxuICAgICAgICAgICAgICB0eXBlb2YgZGF0YS5tZXRhZGF0YS5uYW1lID09PSBcInN0cmluZ1wiICYmXG4gICAgICAgICAgICAgIGRhdGEubWV0YWRhdGEubmFtZS50cmltKCkgIT09IFwiXCIgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIGRhdGEubWV0YWRhdGEubGFzdE1vZGlmaWVkID09PSBcInN0cmluZ1wiICYmXG4gICAgICAgICAgICAgICFpc05hTihuZXcgRGF0ZShkYXRhLm1ldGFkYXRhLmxhc3RNb2RpZmllZCkuZ2V0VGltZSgpKSAmJlxuICAgICAgICAgICAgICB0eXBlb2YgZGF0YS5tZXRhZGF0YS5jcmVhdGVkQXQgPT09IFwic3RyaW5nXCIgJiZcbiAgICAgICAgICAgICAgIWlzTmFOKG5ldyBEYXRlKGRhdGEubWV0YWRhdGEuY3JlYXRlZEF0KS5nZXRUaW1lKCkpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgY29uc3QgbWV0YSA9IGRhdGEubWV0YWRhdGE7XG4gICAgICAgICAgICAgIG5ld0luZGV4W2NoYXRJZF0gPSB7XG4gICAgICAgICAgICAgICAgbmFtZTogbWV0YS5uYW1lLFxuICAgICAgICAgICAgICAgIGxhc3RNb2RpZmllZDogbmV3IERhdGUobWV0YS5sYXN0TW9kaWZpZWQpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZShtZXRhLmNyZWF0ZWRBdCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICBtb2RlbE5hbWU6IG1ldGEubW9kZWxOYW1lLFxuICAgICAgICAgICAgICAgIHNlbGVjdGVkUm9sZVBhdGg6IG1ldGEuc2VsZWN0ZWRSb2xlUGF0aCxcbiAgICAgICAgICAgICAgICB0ZW1wZXJhdHVyZTogbWV0YS50ZW1wZXJhdHVyZSxcbiAgICAgICAgICAgICAgICBjb250ZXh0V2luZG93OiBtZXRhLmNvbnRleHRXaW5kb3csXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIGNoYXRzTG9hZGVkKys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgICAgICAgICAgaWYgKGUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikge1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IHN1YkZvbGRlclBhdGggb2YgbGlzdFJlc3VsdC5mb2xkZXJzKSB7XG4gICAgICAgICAgYXdhaXQgc2NhbkFuZEluZGV4KHN1YkZvbGRlclBhdGgpO1xuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICBhd2FpdCBzY2FuQW5kSW5kZXgodGhpcy5jaGF0c0ZvbGRlclBhdGgpO1xuXG4gICAgICB0aGlzLmNoYXRJbmRleCA9IG5ld0luZGV4O1xuICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEluZGV4KCk7XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFwiRU5PRU5UXCIpIHtcbiAgICAgICAgbmV3IE5vdGljZShgRXJyb3I6IENoYXQgaGlzdG9yeSBmb2xkZXIgJyR7dGhpcy5jaGF0c0ZvbGRlclBhdGh9JyBub3QgZm91bmQuYCk7XG4gICAgICB9IGVsc2UgaWYgKGVycm9yLmNvZGUgPT09IFwiRVBFUk1cIiB8fCBlcnJvci5jb2RlID09PSBcIkVBQ0NFU1wiKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJQZXJtaXNzaW9uIGVycm9yIGFjY2Vzc2luZyBjaGF0IGhpc3RvcnkgZm9sZGVyLlwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciByZWJ1aWxkaW5nIGNoYXQgaW5kZXguIENoZWNrIGNvbnNvbGUuXCIpO1xuICAgICAgfVxuICAgICAgdGhpcy5jaGF0SW5kZXggPSB7fTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRJbmRleCgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2F2ZUNoYXRJbmRleCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGFLZXkoQ0hBVF9JTkRFWF9LRVksIHRoaXMuY2hhdEluZGV4KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbmV3IE5vdGljZShcIkVycm9yIHNhdmluZyBjaGF0IGluZGV4LiBDaGFuZ2VzIG1pZ2h0IGJlIGxvc3QuXCIpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZ2V0Q2hhdEZpbGVQYXRoKGlkOiBzdHJpbmcsIGZvbGRlclBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3QgZmlsZU5hbWUgPSBgJHtpZH0uanNvbmA7XG4gICAgY29uc3QgdGFyZ2V0Rm9sZGVyID0gbm9ybWFsaXplUGF0aChmb2xkZXJQYXRoKTtcbiAgICBpZiAodGFyZ2V0Rm9sZGVyID09PSBcIi9cIiB8fCB0YXJnZXRGb2xkZXIgPT09IFwiXCIpIHtcbiAgICAgIHJldHVybiBub3JtYWxpemVQYXRoKGZpbGVOYW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG5vcm1hbGl6ZVBhdGgoYCR7dGFyZ2V0Rm9sZGVyfS8ke2ZpbGVOYW1lfWApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgX3NjYW5Gb2xkZXJSZWN1cnNpdmUoZm9sZGVyUGF0aDogc3RyaW5nKTogUHJvbWlzZTxIaWVyYXJjaHlOb2RlW10+IHtcbiAgICBjb25zdCBjaGlsZHJlbjogSGllcmFyY2h5Tm9kZVtdID0gW107XG4gICAgbGV0IGxpc3RSZXN1bHQ7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5hZGFwdGVyLmV4aXN0cyhmb2xkZXJQYXRoKTtcbiAgICAgIGlmICghZXhpc3RzKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuc3RhdChmb2xkZXJQYXRoKTtcbiAgICAgIGlmIChzdGF0Py50eXBlICE9PSBcImZvbGRlclwiKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cblxuICAgICAgbGlzdFJlc3VsdCA9IGF3YWl0IHRoaXMuYWRhcHRlci5saXN0KGZvbGRlclBhdGgpO1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSBcIkVQRVJNXCIgfHwgZXJyb3IuY29kZSA9PT0gXCJFQUNDRVNcIikge1xuICAgICAgICBuZXcgTm90aWNlKGBQZXJtaXNzaW9uIGVycm9yIHJlYWRpbmcgZm9sZGVyOiAke2ZvbGRlclBhdGh9YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgfVxuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cblxuICAgIGZvciAoY29uc3Qgc3ViRm9sZGVyUGF0aCBvZiBsaXN0UmVzdWx0LmZvbGRlcnMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHN1YlN0YXQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuc3RhdChzdWJGb2xkZXJQYXRoKTtcbiAgICAgICAgaWYgKHN1YlN0YXQ/LnR5cGUgPT09IFwiZm9sZGVyXCIpIHtcbiAgICAgICAgICBjb25zdCBmb2xkZXJOYW1lID0gc3ViRm9sZGVyUGF0aC5zdWJzdHJpbmcoc3ViRm9sZGVyUGF0aC5sYXN0SW5kZXhPZihcIi9cIikgKyAxKTtcbiAgICAgICAgICBjb25zdCBzdWJDaGlsZHJlbiA9IGF3YWl0IHRoaXMuX3NjYW5Gb2xkZXJSZWN1cnNpdmUoc3ViRm9sZGVyUGF0aCk7XG4gICAgICAgICAgY2hpbGRyZW4ucHVzaCh7XG4gICAgICAgICAgICB0eXBlOiBcImZvbGRlclwiLFxuICAgICAgICAgICAgbmFtZTogZm9sZGVyTmFtZSxcbiAgICAgICAgICAgIHBhdGg6IHN1YkZvbGRlclBhdGgsXG4gICAgICAgICAgICBjaGlsZHJlbjogc3ViQ2hpbGRyZW4sXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKHN0YXRFcnJvcikge31cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZ1bGxQYXRoIG9mIGxpc3RSZXN1bHQuZmlsZXMpIHtcbiAgICAgIGNvbnN0IGZpbGVOYW1lID0gZnVsbFBhdGguc3Vic3RyaW5nKGZ1bGxQYXRoLmxhc3RJbmRleE9mKFwiL1wiKSArIDEpO1xuXG4gICAgICBpZiAoIWZpbGVOYW1lLmVuZHNXaXRoKFwiLmpzb25cIikgfHwgZmlsZU5hbWUuc3RhcnRzV2l0aChcIi5cIikpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgdXVpZFBhdHRlcm4gPSAvXlswLTlhLWZBLUZdezh9LVswLTlhLWZBLUZdezR9LVswLTlhLWZBLUZdezR9LVswLTlhLWZBLUZdezR9LVswLTlhLWZBLUZdezEyfVxcLmpzb24kL2k7XG4gICAgICBjb25zdCBvbGRQYXR0ZXJuID0gL15jaGF0X1xcZCtfW2EtekEtWjAtOV0rXFwuanNvbiQvO1xuICAgICAgaWYgKCF1dWlkUGF0dGVybi50ZXN0KGZpbGVOYW1lKSAmJiAhb2xkUGF0dGVybi50ZXN0KGZpbGVOYW1lKSkgY29udGludWU7XG5cbiAgICAgIGNvbnN0IGNoYXRJZCA9IGZpbGVOYW1lLnNsaWNlKDAsIC01KTtcblxuICAgICAgY29uc3Qgc3RvcmVkTWV0YSA9IHRoaXMuY2hhdEluZGV4W2NoYXRJZF07XG4gICAgICBpZiAoc3RvcmVkTWV0YSkge1xuICAgICAgICBpZiAoaXNOYU4obmV3IERhdGUoc3RvcmVkTWV0YS5sYXN0TW9kaWZpZWQpLmdldFRpbWUoKSkgfHwgaXNOYU4obmV3IERhdGUoc3RvcmVkTWV0YS5jcmVhdGVkQXQpLmdldFRpbWUoKSkpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNoYXRNZXRhZGF0YTogQ2hhdE1ldGFkYXRhID0ge1xuICAgICAgICAgIGlkOiBjaGF0SWQsXG4gICAgICAgICAgbmFtZTogc3RvcmVkTWV0YS5uYW1lLFxuICAgICAgICAgIGxhc3RNb2RpZmllZDogc3RvcmVkTWV0YS5sYXN0TW9kaWZpZWQsXG4gICAgICAgICAgY3JlYXRlZEF0OiBzdG9yZWRNZXRhLmNyZWF0ZWRBdCxcbiAgICAgICAgICBtb2RlbE5hbWU6IHN0b3JlZE1ldGEubW9kZWxOYW1lLFxuICAgICAgICAgIHNlbGVjdGVkUm9sZVBhdGg6IHN0b3JlZE1ldGEuc2VsZWN0ZWRSb2xlUGF0aCxcbiAgICAgICAgICB0ZW1wZXJhdHVyZTogc3RvcmVkTWV0YS50ZW1wZXJhdHVyZSxcbiAgICAgICAgICBjb250ZXh0V2luZG93OiBzdG9yZWRNZXRhLmNvbnRleHRXaW5kb3csXG4gICAgICAgIH07XG4gICAgICAgIGNoaWxkcmVuLnB1c2goe1xuICAgICAgICAgIHR5cGU6IFwiY2hhdFwiLFxuICAgICAgICAgIG1ldGFkYXRhOiBjaGF0TWV0YWRhdGEsXG4gICAgICAgICAgZmlsZVBhdGg6IGZ1bGxQYXRoLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY2hpbGRyZW4uc29ydCgoYSwgYikgPT4ge1xuICAgICAgaWYgKGEudHlwZSA9PT0gXCJmb2xkZXJcIiAmJiBiLnR5cGUgPT09IFwiY2hhdFwiKSByZXR1cm4gLTE7XG4gICAgICBpZiAoYS50eXBlID09PSBcImNoYXRcIiAmJiBiLnR5cGUgPT09IFwiZm9sZGVyXCIpIHJldHVybiAxO1xuICAgICAgaWYgKGEudHlwZSA9PT0gXCJmb2xkZXJcIiAmJiBiLnR5cGUgPT09IFwiZm9sZGVyXCIpIHtcbiAgICAgICAgcmV0dXJuIGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSk7XG4gICAgICB9XG4gICAgICBpZiAoYS50eXBlID09PSBcImNoYXRcIiAmJiBiLnR5cGUgPT09IFwiY2hhdFwiKSB7XG4gICAgICAgIGNvbnN0IGRhdGVBID0gbmV3IERhdGUoYS5tZXRhZGF0YS5sYXN0TW9kaWZpZWQpLmdldFRpbWUoKTtcbiAgICAgICAgY29uc3QgZGF0ZUIgPSBuZXcgRGF0ZShiLm1ldGFkYXRhLmxhc3RNb2RpZmllZCkuZ2V0VGltZSgpO1xuICAgICAgICBjb25zdCB2YWxpZEEgPSAhaXNOYU4oZGF0ZUEpO1xuICAgICAgICBjb25zdCB2YWxpZEIgPSAhaXNOYU4oZGF0ZUIpO1xuICAgICAgICBpZiAodmFsaWRBICYmIHZhbGlkQikgcmV0dXJuIGRhdGVCIC0gZGF0ZUE7XG4gICAgICAgIGlmICh2YWxpZEIpIHJldHVybiAxO1xuICAgICAgICBpZiAodmFsaWRBKSByZXR1cm4gLTE7XG4gICAgICAgIHJldHVybiBhLm1ldGFkYXRhLm5hbWUubG9jYWxlQ29tcGFyZShiLm1ldGFkYXRhLm5hbWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIDA7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY2hpbGRyZW47XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0Q2hhdEhpZXJhcmNoeSgpOiBQcm9taXNlPEhpZXJhcmNoeU5vZGVbXT4ge1xuICAgIGF3YWl0IHRoaXMuZW5zdXJlRm9sZGVyc0V4aXN0KCk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuX3NjYW5Gb2xkZXJSZWN1cnNpdmUodGhpcy5jaGF0c0ZvbGRlclBhdGgpO1xuICB9XG5cbiAgYXN5bmMgc2F2ZUNoYXRBbmRVcGRhdGVJbmRleChjaGF0OiBDaGF0KTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGNoYXQuc2F2ZSgpO1xuXG4gICAgICBjb25zdCBtZXRhID0gY2hhdC5tZXRhZGF0YTtcbiAgICAgIGNvbnN0IHN0b3JlZE1ldGE6IENoYXRTZXNzaW9uU3RvcmVkID0ge1xuICAgICAgICBuYW1lOiBtZXRhLm5hbWUsXG4gICAgICAgIGxhc3RNb2RpZmllZDogbWV0YS5sYXN0TW9kaWZpZWQsXG4gICAgICAgIGNyZWF0ZWRBdDogbWV0YS5jcmVhdGVkQXQsXG4gICAgICAgIG1vZGVsTmFtZTogbWV0YS5tb2RlbE5hbWUsXG4gICAgICAgIHNlbGVjdGVkUm9sZVBhdGg6IG1ldGEuc2VsZWN0ZWRSb2xlUGF0aCxcbiAgICAgICAgdGVtcGVyYXR1cmU6IG1ldGEudGVtcGVyYXR1cmUsXG4gICAgICAgIGNvbnRleHRXaW5kb3c6IG1ldGEuY29udGV4dFdpbmRvdyxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXhFbnRyeSA9IHRoaXMuY2hhdEluZGV4W21ldGEuaWRdO1xuICAgICAgY29uc3QgaW5kZXhOZWVkc1VwZGF0ZSA9XG4gICAgICAgICFleGlzdGluZ0luZGV4RW50cnkgfHxcbiAgICAgICAgZXhpc3RpbmdJbmRleEVudHJ5Lm5hbWUgIT09IHN0b3JlZE1ldGEubmFtZSB8fFxuICAgICAgICBleGlzdGluZ0luZGV4RW50cnkubGFzdE1vZGlmaWVkICE9PSBzdG9yZWRNZXRhLmxhc3RNb2RpZmllZCB8fFxuICAgICAgICBleGlzdGluZ0luZGV4RW50cnkuY3JlYXRlZEF0ICE9PSBzdG9yZWRNZXRhLmNyZWF0ZWRBdCB8fFxuICAgICAgICBleGlzdGluZ0luZGV4RW50cnkubW9kZWxOYW1lICE9PSBzdG9yZWRNZXRhLm1vZGVsTmFtZSB8fFxuICAgICAgICBleGlzdGluZ0luZGV4RW50cnkuc2VsZWN0ZWRSb2xlUGF0aCAhPT0gc3RvcmVkTWV0YS5zZWxlY3RlZFJvbGVQYXRoIHx8XG4gICAgICAgIGV4aXN0aW5nSW5kZXhFbnRyeS50ZW1wZXJhdHVyZSAhPT0gc3RvcmVkTWV0YS50ZW1wZXJhdHVyZSB8fFxuICAgICAgICBleGlzdGluZ0luZGV4RW50cnkuY29udGV4dFdpbmRvdyAhPT0gc3RvcmVkTWV0YS5jb250ZXh0V2luZG93O1xuXG4gICAgICBpZiAoaW5kZXhOZWVkc1VwZGF0ZSkge1xuICAgICAgICB0aGlzLmNoYXRJbmRleFttZXRhLmlkXSA9IHN0b3JlZE1ldGE7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRJbmRleCgpO1xuICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihgW0NoYXRNYW5hZ2VyXSA+Pj4gRW1pdHRpbmcgJ2NoYXQtbGlzdC11cGRhdGVkJyBmcm9tIHNhdmVDaGF0QW5kVXBkYXRlSW5kZXggZm9yIElEOiAke21ldGEuaWR9YCk7XG4gICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJjaGF0LWxpc3QtdXBkYXRlZFwiKTtcbiAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoYENoYXQgaW5kZXggdXBkYXRlZCBmb3IgJHttZXRhLmlkfSBhZnRlciBzYXZlIHRyaWdnZXIuYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmxvZ2dlci50cmFjZShgSW5kZXggZm9yIGNoYXQgJHttZXRhLmlkfSB1bmNoYW5nZWQgYWZ0ZXIgc2F2ZSB0cmlnZ2VyLCBza2lwcGluZyBpbmRleCBzYXZlL2V2ZW50LmApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvLyBzcmMvQ2hhdE1hbmFnZXIudHNcbmFzeW5jIGNyZWF0ZU5ld0NoYXQobmFtZT86IHN0cmluZywgZm9sZGVyUGF0aD86IHN0cmluZyk6IFByb21pc2U8Q2hhdCB8IG51bGw+IHtcbiAgY29uc3QgdGFyZ2V0Rm9sZGVyID0gZm9sZGVyUGF0aCA/IG5vcm1hbGl6ZVBhdGgoZm9sZGVyUGF0aCkgOiB0aGlzLmNoYXRzRm9sZGVyUGF0aDtcbiAgY29uc3QgZmluYWxGb2xkZXJQYXRoID0gdGFyZ2V0Rm9sZGVyID09PSBcIlwiIHx8IHRhcmdldEZvbGRlciA9PT0gXCIuXCIgPyBcIi9cIiA6IHRhcmdldEZvbGRlcjtcblxuICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5lbnN1cmVTcGVjaWZpY0ZvbGRlckV4aXN0cyhmaW5hbEZvbGRlclBhdGgpO1xuICB9IGNhdGNoIChmb2xkZXJFcnJvcikge1xuICAgICAgLy8g0J/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINC/0YDQviDQv9C+0LzQuNC70LrRgyDQstC20LUg0ZQg0LIgZW5zdXJlU3BlY2lmaWNGb2xkZXJFeGlzdHMg0LDQsdC+INCy0LjRidC1XG4gICAgICBuZXcgTm90aWNlKGBGYWlsZWQgdG8gZW5zdXJlIHRhcmdldCBmb2xkZXIgZXhpc3RzOiAke2ZpbmFsRm9sZGVyUGF0aH1gKTtcbiAgICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgICBjb25zdCBuZXdJZCA9IHV1aWR2NCgpO1xuICAgICAgY29uc3QgZmlsZVBhdGggPSB0aGlzLmdldENoYXRGaWxlUGF0aChuZXdJZCwgZmluYWxGb2xkZXJQYXRoKTtcblxuICAgICAgY29uc3QgaW5pdGlhbE1ldGFkYXRhOiBDaGF0TWV0YWRhdGEgPSB7XG4gICAgICAgICAgaWQ6IG5ld0lkLFxuICAgICAgICAgIG5hbWU6IG5hbWUgfHwgYENoYXQgJHtub3cudG9Mb2NhbGVEYXRlU3RyaW5nKCl9ICR7bm93LnRvTG9jYWxlVGltZVN0cmluZyhbXSwgeyBob3VyOiBcIjItZGlnaXRcIiwgbWludXRlOiBcIjItZGlnaXRcIiB9KX1gLFxuICAgICAgICAgIG1vZGVsTmFtZTogdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lLFxuICAgICAgICAgIHNlbGVjdGVkUm9sZVBhdGg6IHRoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGgsXG4gICAgICAgICAgdGVtcGVyYXR1cmU6IHRoaXMucGx1Z2luLnNldHRpbmdzLnRlbXBlcmF0dXJlLFxuICAgICAgICAgIGNvbnRleHRXaW5kb3c6IHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnRleHRXaW5kb3csXG4gICAgICAgICAgY3JlYXRlZEF0OiBub3cudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICBsYXN0TW9kaWZpZWQ6IG5vdy50b0lTT1N0cmluZygpLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgY29uc3RydWN0b3JTZXR0aW5nczogQ2hhdENvbnN0cnVjdG9yU2V0dGluZ3MgPSB7IC4uLnRoaXMucGx1Z2luLnNldHRpbmdzIH07XG4gICAgICBjb25zdCBjaGF0RGF0YTogQ2hhdERhdGEgPSB7IG1ldGFkYXRhOiBpbml0aWFsTWV0YWRhdGEsIG1lc3NhZ2VzOiBbXSB9O1xuXG4gICAgICBjb25zdCBuZXdDaGF0ID0gbmV3IENoYXQodGhpcy5hZGFwdGVyLCBjb25zdHJ1Y3RvclNldHRpbmdzLCBjaGF0RGF0YSwgZmlsZVBhdGgsIHRoaXMubG9nZ2VyKTtcblxuICAgICAgY29uc3Qgc3RvcmVkTWV0YTogQ2hhdFNlc3Npb25TdG9yZWQgPSB7XG4gICAgICAgICAgbmFtZTogaW5pdGlhbE1ldGFkYXRhLm5hbWUsXG4gICAgICAgICAgbGFzdE1vZGlmaWVkOiBpbml0aWFsTWV0YWRhdGEubGFzdE1vZGlmaWVkLFxuICAgICAgICAgIGNyZWF0ZWRBdDogaW5pdGlhbE1ldGFkYXRhLmNyZWF0ZWRBdCxcbiAgICAgICAgICBtb2RlbE5hbWU6IGluaXRpYWxNZXRhZGF0YS5tb2RlbE5hbWUsXG4gICAgICAgICAgc2VsZWN0ZWRSb2xlUGF0aDogaW5pdGlhbE1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGgsXG4gICAgICAgICAgdGVtcGVyYXR1cmU6IGluaXRpYWxNZXRhZGF0YS50ZW1wZXJhdHVyZSxcbiAgICAgICAgICBjb250ZXh0V2luZG93OiBpbml0aWFsTWV0YWRhdGEuY29udGV4dFdpbmRvdyxcbiAgICAgIH07XG4gICAgICB0aGlzLmNoYXRJbmRleFtuZXdJZF0gPSBzdG9yZWRNZXRhO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEluZGV4KCk7XG4gICAgICAvLyDQktCY0JTQkNCb0JXQndCeOiB0aGlzLnBsdWdpbi5lbWl0KFwiY2hhdC1saXN0LXVwZGF0ZWRcIik7XG4gICAgICAvLyDQn9C+0LrQu9Cw0LTQsNGU0LzQvtGB0Y8g0L3QsCAnYWN0aXZlLWNoYXQtY2hhbmdlZCcg0Lcgc2V0QWN0aXZlQ2hhdCDQtNC70Y8g0L7QvdC+0LLQu9C10L3QvdGPIFVJLlxuXG4gICAgICBjb25zdCBzYXZlZEltbWVkaWF0ZWx5ID0gYXdhaXQgbmV3Q2hhdC5zYXZlSW1tZWRpYXRlbHkoKTtcbiAgICAgIGlmICghc2F2ZWRJbW1lZGlhdGVseSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNoYXRJbmRleFtuZXdJZF07XG4gICAgICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEluZGV4KCk7XG4gICAgICAgICAgLy8g0KbRjyDQtdC80ZbRgdGW0Y8g0LzQvtC20LUg0LfQsNC70LjRiNC40YLQuNGB0Y8sINC+0YHQutGW0LvRjNC60Lgg0YbQtSDRiNC70Y/RhSDQvtCx0YDQvtCx0LrQuCDQv9C+0LzQuNC70LrQuC/QvtGH0LjRidC10L3QvdGPXG4gICAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYFtDaGF0TWFuYWdlcl0gPj4+IEVtaXR0aW5nICdjaGF0LWxpc3QtdXBkYXRlZCcgZnJvbSBjcmVhdGVOZXdDaGF0IChzYXZlSW1tZWRpYXRlbHkgRkFJTEVEKSBmb3IgSUQ6ICR7bmV3SWR9YCk7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uZW1pdChcImNoYXQtbGlzdC11cGRhdGVkXCIpO1xuXG4gICAgICAgICAgbmV3IE5vdGljZShcIkVycm9yOiBGYWlsZWQgdG8gc2F2ZSBuZXcgY2hhdCBmaWxlLlwiKTtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgdGhpcy5sb2FkZWRDaGF0c1tuZXdJZF0gPSBuZXdDaGF0O1xuICAgICAgLy8gc2V0QWN0aXZlQ2hhdCDQt9Cz0LXQvdC10YDRg9GUICdhY3RpdmUtY2hhdC1jaGFuZ2VkJywg0YnQviDQvNCw0ZQg0L7QvdC+0LLQuNGC0LggT2xsYW1hVmlldyxcbiAgICAgIC8vINCy0LrQu9GO0YfQsNGO0YfQuCDQstC40LrQu9C40Logc2lkZWJhck1hbmFnZXIudXBkYXRlQ2hhdExpc3QoKSDRh9C10YDQtdC3IGxvYWRBbmREaXNwbGF5QWN0aXZlQ2hhdC5cbiAgICAgIGF3YWl0IHRoaXMuc2V0QWN0aXZlQ2hhdChuZXdJZCk7XG5cbiAgICAgIHJldHVybiBuZXdDaGF0O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoXCJFcnJvciBjcmVhdGluZyBuZXcgY2hhdDpcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZShcIkVycm9yIGNyZWF0aW5nIG5ldyBjaGF0IHNlc3Npb24uXCIpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuICBwcml2YXRlIGFzeW5jIGVuc3VyZVNwZWNpZmljRm9sZGVyRXhpc3RzKGZvbGRlclBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghZm9sZGVyUGF0aCB8fCBmb2xkZXJQYXRoID09PSBcIi9cIiB8fCBmb2xkZXJQYXRoID09PSBcIi5cIikgcmV0dXJuO1xuXG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVBhdGgoZm9sZGVyUGF0aCk7XG4gICAgaWYgKG5vcm1hbGl6ZWQuc3RhcnRzV2l0aChcIi4uXCIpIHx8IG5vcm1hbGl6ZWQuaW5jbHVkZXMoXCJcXDBcIikpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBBdHRlbXB0ZWQgdG8gZW5zdXJlIGludmFsaWQgZm9sZGVyIHBhdGg6ICR7bm9ybWFsaXplZH1gKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgZm9sZGVyIHBhdGggc3BlY2lmaWVkLlwiKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5hZGFwdGVyLmV4aXN0cyhub3JtYWxpemVkKTtcbiAgICAgIGlmICghZXhpc3RzKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYWRhcHRlci5ta2Rpcihub3JtYWxpemVkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuc3RhdChub3JtYWxpemVkKTtcbiAgICAgICAgaWYgKHN0YXQ/LnR5cGUgIT09IFwiZm9sZGVyXCIpIHtcbiAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihgUGF0aCBleGlzdHMgYnV0IGlzIG5vdCBhIGZvbGRlcjogJHtub3JtYWxpemVkfWApO1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVGFyZ2V0IHBhdGggJHtub3JtYWxpemVkfSBpcyBub3QgYSBmb2xkZXIuYCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYEVycm9yIGNyZWF0aW5nL2NoZWNraW5nIHRhcmdldCBmb2xkZXIgJyR7bm9ybWFsaXplZH0nOmAsIGVycm9yKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYEZhaWxlZCB0byBlbnN1cmUgdGFyZ2V0IGZvbGRlciAke25vcm1hbGl6ZWR9IGV4aXN0czogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvKiogQGRlcHJlY2F0ZWQgVXNlIGdldENoYXRIaWVyYXJjaHkgaW5zdGVhZC4gKi9cbiAgbGlzdEF2YWlsYWJsZUNoYXRzKCk6IENoYXRNZXRhZGF0YVtdIHtcbiAgICByZXR1cm4gT2JqZWN0LmVudHJpZXModGhpcy5jaGF0SW5kZXgpXG4gICAgICAubWFwKChbaWQsIHN0b3JlZE1ldGFdKTogQ2hhdE1ldGFkYXRhIHwgbnVsbCA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAhc3RvcmVkTWV0YSB8fFxuICAgICAgICAgIHR5cGVvZiBzdG9yZWRNZXRhICE9PSBcIm9iamVjdFwiIHx8XG4gICAgICAgICAgdHlwZW9mIHN0b3JlZE1ldGEubmFtZSAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgICAgIHR5cGVvZiBzdG9yZWRNZXRhLmxhc3RNb2RpZmllZCAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgICAgIHR5cGVvZiBzdG9yZWRNZXRhLmNyZWF0ZWRBdCAhPT0gXCJzdHJpbmdcIlxuICAgICAgICApIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBsYXN0TW9kRGF0ZSA9IG5ldyBEYXRlKHN0b3JlZE1ldGEubGFzdE1vZGlmaWVkKTtcbiAgICAgICAgY29uc3QgY3JlYXRlZERhdGUgPSBuZXcgRGF0ZShzdG9yZWRNZXRhLmNyZWF0ZWRBdCk7XG4gICAgICAgIGlmIChpc05hTihsYXN0TW9kRGF0ZS5nZXRUaW1lKCkpIHx8IGlzTmFOKGNyZWF0ZWREYXRlLmdldFRpbWUoKSkpIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGlkLFxuICAgICAgICAgIG5hbWU6IHN0b3JlZE1ldGEubmFtZSxcbiAgICAgICAgICBsYXN0TW9kaWZpZWQ6IHN0b3JlZE1ldGEubGFzdE1vZGlmaWVkLFxuICAgICAgICAgIGNyZWF0ZWRBdDogc3RvcmVkTWV0YS5jcmVhdGVkQXQsXG4gICAgICAgICAgbW9kZWxOYW1lOiBzdG9yZWRNZXRhLm1vZGVsTmFtZSxcbiAgICAgICAgICBzZWxlY3RlZFJvbGVQYXRoOiBzdG9yZWRNZXRhLnNlbGVjdGVkUm9sZVBhdGgsXG4gICAgICAgICAgdGVtcGVyYXR1cmU6IHN0b3JlZE1ldGEudGVtcGVyYXR1cmUsXG4gICAgICAgICAgY29udGV4dFdpbmRvdzogc3RvcmVkTWV0YS5jb250ZXh0V2luZG93LFxuICAgICAgICB9O1xuICAgICAgfSlcbiAgICAgIC5maWx0ZXIoKGNoYXRNZXRhKTogY2hhdE1ldGEgaXMgQ2hhdE1ldGFkYXRhID0+IGNoYXRNZXRhICE9PSBudWxsKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgY29uc3QgZGF0ZUEgPSBuZXcgRGF0ZShhLmxhc3RNb2RpZmllZCkuZ2V0VGltZSgpO1xuICAgICAgICBjb25zdCBkYXRlQiA9IG5ldyBEYXRlKGIubGFzdE1vZGlmaWVkKS5nZXRUaW1lKCk7XG4gICAgICAgIGlmICghaXNOYU4oZGF0ZUEpICYmICFpc05hTihkYXRlQikpIHtcbiAgICAgICAgICBpZiAoZGF0ZUIgIT09IGRhdGVBKSByZXR1cm4gZGF0ZUIgLSBkYXRlQTtcbiAgICAgICAgfSBlbHNlIGlmICghaXNOYU4oZGF0ZUIpKSByZXR1cm4gMTtcbiAgICAgICAgZWxzZSBpZiAoIWlzTmFOKGRhdGVBKSkgcmV0dXJuIC0xO1xuICAgICAgICBjb25zdCBjcmVhdGVkQSA9IG5ldyBEYXRlKGEuY3JlYXRlZEF0KS5nZXRUaW1lKCk7XG4gICAgICAgIGNvbnN0IGNyZWF0ZWRCID0gbmV3IERhdGUoYi5jcmVhdGVkQXQpLmdldFRpbWUoKTtcbiAgICAgICAgaWYgKCFpc05hTihjcmVhdGVkQSkgJiYgIWlzTmFOKGNyZWF0ZWRCKSkge1xuICAgICAgICAgIHJldHVybiBjcmVhdGVkQiAtIGNyZWF0ZWRBO1xuICAgICAgICB9IGVsc2UgaWYgKCFpc05hTihjcmVhdGVkQikpIHJldHVybiAxO1xuICAgICAgICBlbHNlIGlmICghaXNOYU4oY3JlYXRlZEEpKSByZXR1cm4gLTE7XG4gICAgICAgIHJldHVybiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpO1xuICAgICAgfSk7XG4gIH1cblxuICBnZXRBY3RpdmVDaGF0SWQoKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgcmV0dXJuIHRoaXMuYWN0aXZlQ2hhdElkO1xuICB9XG5cbiAgLy8gc3JjL0NoYXRNYW5hZ2VyLnRzXG5cbiAgcHVibGljIGFzeW5jIGdldEFjdGl2ZUNoYXRPckZhaWwoKTogUHJvbWlzZTxDaGF0PiB7XG4gICAgY29uc3QgY2hhdCA9IGF3YWl0IHRoaXMuZ2V0QWN0aXZlQ2hhdCgpO1xuICAgIGlmICghY2hhdCkge1xuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoXCJbQ2hhdE1hbmFnZXJdIGdldEFjdGl2ZUNoYXRPckZhaWw6IE5vIGFjdGl2ZSBjaGF0IGZvdW5kIG9yIGZhaWxlZCB0byBsb2FkIVwiKTtcbiAgICAgIC8vINCc0L7QttC90LAg0LrQuNC90YPRgtC4INCx0ZbQu9GM0Ygg0YHQv9C10YbQuNGE0ZbRh9C90YMg0L/QvtC80LjQu9C60YMsINCw0LHQviDQv9GA0L7RgdGC0L4gRXJyb3JcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vIGFjdGl2ZSBjaGF0IGZvdW5kIG9yIGl0IGZhaWxlZCB0byBsb2FkLlwiKTtcbiAgICB9XG4gICAgcmV0dXJuIGNoYXQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdFBheWxvYWQobWVzc2FnZVBheWxvYWQ6IE1lc3NhZ2UsIGVtaXRFdmVudDogYm9vbGVhbiA9IHRydWUpOiBQcm9taXNlPE1lc3NhZ2UgfCBudWxsPiB7XG4gICAgY29uc3Qgb3BlcmF0aW9uVGltZXN0YW1wSWQgPSBtZXNzYWdlUGF5bG9hZC50aW1lc3RhbXAuZ2V0VGltZSgpOyAvLyDQlNC70Y8g0LvQvtCz0YPQstCw0L3QvdGPXG4gICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbQ2hhdE1hbmFnZXJdW2FkZE1lc3NhZ2VQYXlsb2FkIGlkOiR7b3BlcmF0aW9uVGltZXN0YW1wSWR9XSBBdHRlbXB0aW5nIHRvIGFkZCBtZXNzYWdlIChSb2xlOiAke21lc3NhZ2VQYXlsb2FkLnJvbGV9KSB0byBhY3RpdmUgY2hhdC5gKTtcblxuICAgIGNvbnN0IGFjdGl2ZUNoYXRJbnN0YW5jZSA9IGF3YWl0IHRoaXMuZ2V0QWN0aXZlQ2hhdCgpOyBcbiAgICBpZiAoIWFjdGl2ZUNoYXRJbnN0YW5jZSkge1xuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKGBbQ2hhdE1hbmFnZXJdW2FkZE1lc3NhZ2VQYXlsb2FkIGlkOiR7b3BlcmF0aW9uVGltZXN0YW1wSWR9XSBDYW5ub3QgYWRkIG1lc3NhZ2UgcGF5bG9hZDogTm8gYWN0aXZlIGNoYXQuYCk7XG4gICAgICAvLyDQoNC+0LfQs9C70Y/QvdGM0YLQtSDQvNC+0LbQu9C40LLRltGB0YLRjCDRgdGC0LLQvtGA0LXQvdC90Y8g0L3QvtCy0L7Qs9C+INGH0LDRgtGDINGC0YPRgiwg0Y/QutGJ0L4g0YbQtSDQsdCw0LbQsNC90LAg0L/QvtCy0LXQtNGW0L3QutCwXG4gICAgICAvLyBjb25zdCBuZXdDaGF0ID0gYXdhaXQgdGhpcy5jcmVhdGVOZXdDaGF0KCk7XG4gICAgICAvLyBpZiAobmV3Q2hhdCkgeyAuLi4gfSBlbHNlIHsgcmV0dXJuIG51bGw7IH1cbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vINCf0LXRgNC10LrQvtC90YPRlNC80L7RgdGPLCDRidC+IHRpbWVzdGFtcCDRlFxuICAgIGlmICghbWVzc2FnZVBheWxvYWQudGltZXN0YW1wKSB7XG4gICAgICAgIG1lc3NhZ2VQYXlsb2FkLnRpbWVzdGFtcCA9IG5ldyBEYXRlKCk7XG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbQ2hhdE1hbmFnZXJdW2FkZE1lc3NhZ2VQYXlsb2FkIGlkOiR7b3BlcmF0aW9uVGltZXN0YW1wSWR9XSBNZXNzYWdlIHBheWxvYWQgd2FzIG1pc3NpbmcgdGltZXN0YW1wLCBzZXQgdG8gbm93LmApO1xuICAgIH1cblxuICAgIGFjdGl2ZUNoYXRJbnN0YW5jZS5tZXNzYWdlcy5wdXNoKG1lc3NhZ2VQYXlsb2FkKTtcbiAgICAvLyDQntC90L7QstC70Y7RlNC80L4gbGFzdE1vZGlmaWVkINGC0LAg0L/QvtGC0LXQvdGG0ZbQudC90L4g0ZbQvdGI0ZYg0LzQtdGC0LDQtNCw0L3Rliwg0Y/QutGJ0L4g0L/QvtGC0YDRltCx0L3QvlxuICAgIC8vIGNvbnN0IG1ldGFkYXRhQ2hhbmdlZCA9IGFjdGl2ZUNoYXRJbnN0YW5jZS51cGRhdGVNZXRhZGF0YSh7IGxhc3RNb2RpZmllZDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0pOyBcbiAgICBjb25zdCBhY3Rpdml0eVJlY29yZGVkID0gYWN0aXZlQ2hhdEluc3RhbmNlLnJlY29yZEFjdGl2aXR5KCk7IFxuICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW0NoYXRNYW5hZ2VyXVthZGRNZXNzYWdlUGF5bG9hZCBpZDoke29wZXJhdGlvblRpbWVzdGFtcElkfV0gTWVzc2FnZSBwdXNoZWQgdG8gaW4tbWVtb3J5IGNoYXQuIE1ldGFkYXRhIGNoYW5nZWQ6ICR7YWN0aXZpdHlSZWNvcmRlZH1gKTtcblxuXG5cbmlmIChhY3Rpdml0eVJlY29yZGVkKSB7IC8vINCe0L3QvtCy0LvRjtGU0LzQviDRltC90LTQtdC60YEsINGC0ZbQu9GM0LrQuCDRj9C60YnQviDQsdGD0LvQuCDQt9C80ZbQvdC4XG4gICAgICAgIGNvbnN0IHNhdmVBbmRVcGRhdGVJbmRleFN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnNhdmVDaGF0QW5kVXBkYXRlSW5kZXgoYWN0aXZlQ2hhdEluc3RhbmNlKTsgLy8gbWV0YWRhdGFDaGFuZ2VkINCx0ZbQu9GM0YjQtSDQvdC1INC/0L7RgtGA0ZbQsdC10L0g0Y/QuiDQv9Cw0YDQsNC80LXRgtGALCDRj9C60YnQviBzYXZlKCkg0LIgQ2hhdC50c1xuICAgICAgICBpZiAoIXNhdmVBbmRVcGRhdGVJbmRleFN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihgW0NoYXRNYW5hZ2VyXVthZGRNZXNzYWdlUGF5bG9hZCBpZDoke29wZXJhdGlvblRpbWVzdGFtcElkfV0gRmFpbGVkIHRvIHVwZGF0ZSBpbmRleCBmb3IgY2hhdCAke2FjdGl2ZUNoYXRJbnN0YW5jZS5tZXRhZGF0YS5pZH0gYWZ0ZXIgYWN0aXZpdHkuYCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZW1pdEV2ZW50KSB7XG4gICAgICAvLyDQn9C10YDQtdC60L7QvdGD0ZTQvNC+0YHRjywg0YnQviBJRCDRh9Cw0YLRgyDQtNC70Y8g0L/QvtC00ZbRlyDQstGW0LTQv9C+0LLRltC00LDRlCDQv9C+0YLQvtGH0L3QvtC80YMg0LDQutGC0LjQstC90L7QvNGDINGH0LDRgtGDXG4gICAgICBjb25zdCBjdXJyZW50QWN0aXZlQ2hhdElkRm9yRXZlbnQgPSB0aGlzLmFjdGl2ZUNoYXRJZCB8fCBhY3RpdmVDaGF0SW5zdGFuY2UubWV0YWRhdGEuaWQ7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtDaGF0TWFuYWdlcl1bYWRkTWVzc2FnZVBheWxvYWQgaWQ6JHtvcGVyYXRpb25UaW1lc3RhbXBJZH1dIEVtaXR0aW5nICdtZXNzYWdlLWFkZGVkJyBmb3IgY2hhdCAke2N1cnJlbnRBY3RpdmVDaGF0SWRGb3JFdmVudH0sIG1zZyByb2xlOiAke21lc3NhZ2VQYXlsb2FkLnJvbGV9LCBtc2dfdHM6ICR7bWVzc2FnZVBheWxvYWQudGltZXN0YW1wLmdldFRpbWUoKX1gKTtcbiAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJtZXNzYWdlLWFkZGVkXCIsIHsgY2hhdElkOiBjdXJyZW50QWN0aXZlQ2hhdElkRm9yRXZlbnQsIG1lc3NhZ2U6IG1lc3NhZ2VQYXlsb2FkIH0pO1xuICAgIH1cbiAgICByZXR1cm4gbWVzc2FnZVBheWxvYWQ7XG4gIH1cblxuYXN5bmMgZ2V0Q2hhdChpZDogc3RyaW5nLCBmaWxlUGF0aD86IHN0cmluZyk6IFByb21pc2U8Q2hhdCB8IG51bGw+IHtcbiAgaWYgKHRoaXMubG9hZGVkQ2hhdHNbaWRdKSB7XG4gICAgICB0aGlzLmxvZ2dlci50cmFjZShgW0NoYXRNYW5hZ2VyLmdldENoYXRdIFJldHVybmluZyBjYWNoZWQgY2hhdCBmb3IgSUQ6ICR7aWR9YCk7XG4gICAgICByZXR1cm4gdGhpcy5sb2FkZWRDaGF0c1tpZF07XG4gIH1cblxuICBsZXQgYWN0dWFsRmlsZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCA9IGZpbGVQYXRoO1xuICBpZiAoIWFjdHVhbEZpbGVQYXRoKSB7XG4gICAgICAvLyB0aGlzLmxvZ2dlci5kZWJ1ZyhgW0NoYXRNYW5hZ2VyLmdldENoYXRdIEZpbGUgcGF0aCBub3QgcHJvdmlkZWQgZm9yIElEOiAke2lkfS4gU2VhcmNoaW5nIGluIGhpZXJhcmNoeS4uLmApO1xuICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSBhd2FpdCB0aGlzLmdldENoYXRIaWVyYXJjaHkoKTtcbiAgICAgICAgICBhY3R1YWxGaWxlUGF0aCA9IHRoaXMuZmluZENoYXRQYXRoSW5IaWVyYXJjaHkoaWQsIGhpZXJhcmNoeSkgPz8gdW5kZWZpbmVkO1xuICAgICAgICAgIGlmIChhY3R1YWxGaWxlUGF0aCkge1xuICAgICAgICAgICAgICAvLyB0aGlzLmxvZ2dlci5kZWJ1ZyhgW0NoYXRNYW5hZ2VyLmdldENoYXRdIEZvdW5kIGZpbGUgcGF0aCBmb3IgSUQgJHtpZH0gaW4gaGllcmFyY2h5OiAke2FjdHVhbEZpbGVQYXRofWApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIHRoaXMubG9nZ2VyLndhcm4oYFtDaGF0TWFuYWdlci5nZXRDaGF0XSBGaWxlIHBhdGggZm9yIElEICR7aWR9IE5PVCBmb3VuZCBpbiBoaWVyYXJjaHkuYCk7XG4gICAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoaGllcmFyY2h5RXJyb3IpIHtcbiAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihgW0NoYXRNYW5hZ2VyLmdldENoYXRdIEVycm9yIGdldHRpbmcgaGllcmFyY2h5IHdoaWxlIHNlYXJjaGluZyBwYXRoIGZvciBjaGF0ICR7aWR9OmAsIGhpZXJhcmNoeUVycm9yKTtcbiAgICAgICAgICBhY3R1YWxGaWxlUGF0aCA9IHVuZGVmaW5lZDsgLy8g0JfQsNCx0LXQt9C/0LXRh9GD0ZTQvNC+LCDRidC+IHVuZGVmaW5lZCwg0Y/QutGJ0L4g0LHRg9C70LAg0L/QvtC80LjQu9C60LBcbiAgICAgIH1cbiAgfVxuXG4gIC8vINCv0LrRidC+INGI0LvRj9GFINGC0LDQuiDRliDQvdC1INCy0LjQt9C90LDRh9C10L3Qviwg0LDQu9C1INGH0LDRgiDRlCDQsiDRltC90LTQtdC60YHRliwg0YbQtSDQv9GA0L7QsdC70LXQvNCwINC3INC60L7QvdGB0LjRgdGC0LXQvdGC0L3RltGB0YLRjlxuICBpZiAoIWFjdHVhbEZpbGVQYXRoICYmIHRoaXMuY2hhdEluZGV4W2lkXSkge1xuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYFtDaGF0TWFuYWdlci5nZXRDaGF0XSBDaGF0IElEICR7aWR9IGV4aXN0cyBpbiBpbmRleCBidXQgaXRzIGZpbGUgcGF0aCBjb3VsZCBub3QgYmUgZGV0ZXJtaW5lZC4gQ2hhdCBtYXkgYmUgb3JwaGFuZWQgb3IgaW5kZXggaXMgc3RhbGUuYCk7XG4gICAgICAvLyDQnNC+0LbQu9C40LLQviwg0LLQsNGA0YLQviDRgdC/0YDQvtCx0YPQstCw0YLQuCDQv9C10YDQtdCx0YPQtNGD0LLQsNGC0Lgg0ZbQvdC00LXQutGBINGC0YPRgiwg0LDQsdC+INC/0YDQvtGB0YLQviDQv9C+0LLQtdGA0L3Rg9GC0LggbnVsbFxuICAgICAgLy8gYXdhaXQgdGhpcy5yZWJ1aWxkSW5kZXhGcm9tRmlsZXMoKTsgLy8g0J7QsdC10YDQtdC20L3Qvjog0LzQvtC20LUg0LHRg9GC0Lgg0YDQtdC60YPRgNGB0LjQstC90L4sINGP0LrRidC+IGdldENoYXQg0LLQuNC60LvQuNC60LDRlNGC0YzRgdGPINC3IHJlYnVpbGRJbmRleFxuICAgICAgLy8gaWYgKCF0aGlzLmNoYXRJbmRleFtpZF0pIHJldHVybiBudWxsOyAvLyDQr9C60YnQviDQv9GW0YHQu9GPIHJlYnVpbGQg0LnQvtCz0L4g0L3QtdC80LDRlFxuICAgICAgLy8gYWN0dWFsRmlsZVBhdGggPSB0aGlzLmZpbmRDaGF0UGF0aEluSGllcmFyY2h5KGlkLCBhd2FpdCB0aGlzLmdldENoYXRIaWVyYXJjaHkoKSkgPz8gdW5kZWZpbmVkO1xuICAgICAgLy8gaWYgKCFhY3R1YWxGaWxlUGF0aCkge1xuICAgICAgLy8gICAgIHRoaXMubG9nZ2VyLmVycm9yKGBbQ2hhdE1hbmFnZXIuZ2V0Q2hhdF0gU3RpbGwgbm8gcGF0aCBhZnRlciBwb3RlbnRpYWwgaW5kZXggcmVidWlsZCBmb3IgJHtpZH0uYCk7XG4gICAgICAvLyAgICAgcmV0dXJuIG51bGw7XG4gICAgICAvLyB9XG4gICAgICByZXR1cm4gbnVsbDsgLy8g0J/QvtC60Lgg0YnQviDQv9GA0L7RgdGC0L4g0L/QvtCy0LXRgNGC0LDRlNC80L4gbnVsbCwg0Y/QutGJ0L4g0YjQu9GP0YUg0L3QtSDQt9C90LDQudC00LXQvdC+XG4gIH1cblxuICAvLyDQr9C60YnQviDRh9Cw0YLRgyDQvdC10LzQsNGUINCyINGW0L3QtNC10LrRgdGWINGWINGI0LvRj9GFINC90LUg0L3QsNC00LDQvdC+L9C90LUg0LfQvdCw0LnQtNC10L3Qviwg0YLQviDRh9Cw0YLRgyDQvdC10LzQsNGUXG4gIGlmICghdGhpcy5jaGF0SW5kZXhbaWRdICYmICFhY3R1YWxGaWxlUGF0aCkge1xuICAgICAgdGhpcy5sb2dnZXIud2FybihgW0NoYXRNYW5hZ2VyLmdldENoYXRdIENoYXQgSUQgJHtpZH0gbm90IGZvdW5kIGluIGluZGV4IGFuZCBubyBmaWxlIHBhdGggYXZhaWxhYmxlLmApO1xuICAgICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyDQr9C60YnQviDRiNC70Y/RhSDRlCwg0LDQu9C1INGH0LDRgtGDINC90LXQvNCw0ZQg0LIg0ZbQvdC00LXQutGB0ZYgLT4g0YHQv9GA0L7QsdGD0LLQsNGC0Lgg0LfQsNCy0LDQvdGC0LDQttC40YLQuCwg0L/QvtGC0ZbQvCDQvtC90L7QstC40YLQuCDRltC90LTQtdC60YFcbiAgLy8g0K/QutGJ0L4g0YfQsNGCINGUINCyINGW0L3QtNC10LrRgdGWLCDQsNC70LUg0YjQu9GP0YUg0L3QtSDQvdCw0LTQsNC90L4gLT4g0LzQuCDQstC20LUg0YHQv9GA0L7QsdGD0LLQsNC70Lgg0LnQvtCz0L4g0LfQvdCw0LnRgtC4XG4gIC8vINCv0LrRidC+INGWINGI0LvRj9GFINGULCDRliDQsiDRltC90LTQtdC60YHRliDRlCAtPiDQt9Cw0LLQsNC90YLQsNC20YPRlNC80L5cblxuICBpZiAoIWFjdHVhbEZpbGVQYXRoKSB7IC8vINCm0Y8g0YPQvNC+0LLQsCDRgtC10L/QtdGAINC80LDRlCDQsdGD0YLQuCDRgNGW0LTQutGW0YHQvdC+0Y4sINGP0LrRidC+INC70L7Qs9GW0LrQsCDQstC40YnQtSDQstGW0LTQv9GA0LDRhtGO0LLQsNC70LBcbiAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihgW0NoYXRNYW5hZ2VyLmdldENoYXRdIENSSVRJQ0FMOiBhY3R1YWxGaWxlUGF0aCBpcyBzdGlsbCB1bmRlZmluZWQgZm9yIGNoYXQgSUQgJHtpZH0gd2hlbiBpdCBzaG91bGQgYmUga25vd24gb3IgY2hhdCBzaG91bGQgYmUgY29uc2lkZXJlZCBub24tZXhpc3RlbnQuYCk7XG4gICAgICAgcmV0dXJuIG51bGw7XG4gIH1cblxuXG4gIHRyeSB7XG4gICAgICAvLyBhY3R1YWxGaWxlUGF0aCDRgtGD0YIg0YLQvtGH0L3QviDQvNCw0ZQg0LHRg9GC0Lggc3RyaW5nXG4gICAgICBjb25zdCBjaGF0ID0gYXdhaXQgQ2hhdC5sb2FkRnJvbUZpbGUoYWN0dWFsRmlsZVBhdGgsIHRoaXMuYWRhcHRlciwgdGhpcy5wbHVnaW4uc2V0dGluZ3MsIHRoaXMubG9nZ2VyKTtcblxuICAgICAgaWYgKGNoYXQpIHtcbiAgICAgICAgICB0aGlzLmxvYWRlZENoYXRzW2lkXSA9IGNoYXQ7IC8vINCa0LXRiNGD0ZTQvNC+INC30LDQstCw0L3RgtCw0LbQtdC90LjQuSDRh9Cw0YJcblxuICAgICAgICAgIC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4g0YLQsCDQvtC90L7QstC70Y7RlNC80L4g0ZbQvdC00LXQutGBLCDRj9C60YnQviDQvNC10YLQsNC00LDQvdGWINGDINGE0LDQudC70ZYg0L3QvtCy0ZbRiNGWL9Cy0ZbQtNGA0ZbQt9C90Y/RjtGC0YzRgdGPXG4gICAgICAgICAgY29uc3Qgc3RvcmVkTWV0YSA9IHRoaXMuY2hhdEluZGV4W2lkXTtcbiAgICAgICAgICBjb25zdCBjdXJyZW50TWV0YSA9IGNoYXQubWV0YWRhdGE7XG4gICAgICAgICAgY29uc3QgaW5kZXhOZWVkc1VwZGF0ZSA9XG4gICAgICAgICAgICAgICFzdG9yZWRNZXRhIHx8IC8vINCv0LrRidC+INGH0LDRgtGDINC90LUg0LHRg9C70L4g0LIg0ZbQvdC00LXQutGB0ZYgKNC90LDQv9GA0LjQutC70LDQtCwg0LfQsNCy0LDQvdGC0LDQttC40LvQuCDQv9C+INC/0YDRj9C80L7QvNGDINGI0LvRj9GF0YMpXG4gICAgICAgICAgICAgIHN0b3JlZE1ldGEubmFtZSAhPT0gY3VycmVudE1ldGEubmFtZSB8fFxuICAgICAgICAgICAgICBzdG9yZWRNZXRhLmxhc3RNb2RpZmllZCAhPT0gY3VycmVudE1ldGEubGFzdE1vZGlmaWVkIHx8XG4gICAgICAgICAgICAgIHN0b3JlZE1ldGEuY3JlYXRlZEF0ICE9PSBjdXJyZW50TWV0YS5jcmVhdGVkQXQgfHxcbiAgICAgICAgICAgICAgc3RvcmVkTWV0YS5tb2RlbE5hbWUgIT09IGN1cnJlbnRNZXRhLm1vZGVsTmFtZSB8fFxuICAgICAgICAgICAgICBzdG9yZWRNZXRhLnNlbGVjdGVkUm9sZVBhdGggIT09IGN1cnJlbnRNZXRhLnNlbGVjdGVkUm9sZVBhdGggfHxcbiAgICAgICAgICAgICAgc3RvcmVkTWV0YS50ZW1wZXJhdHVyZSAhPT0gY3VycmVudE1ldGEudGVtcGVyYXR1cmUgfHxcbiAgICAgICAgICAgICAgc3RvcmVkTWV0YS5jb250ZXh0V2luZG93ICE9PSBjdXJyZW50TWV0YS5jb250ZXh0V2luZG93O1xuXG4gICAgICAgICAgaWYgKGluZGV4TmVlZHNVcGRhdGUpIHtcbiAgICAgICAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoYFtDaGF0TWFuYWdlci5nZXRDaGF0XSBJbmRleCBuZWVkcyB1cGRhdGUgZm9yIGNoYXQgJHtpZH0uIENhbGxpbmcgc2F2ZUNoYXRBbmRVcGRhdGVJbmRleC5gKTtcbiAgICAgICAgICAgICAgLy8gc2F2ZUNoYXRBbmRVcGRhdGVJbmRleCDQvtC90L7QstC40YLRjCDRltC90LTQtdC60YEg0ZYg0LfQs9C10L3QtdGA0YPRlCAnY2hhdC1saXN0LXVwZGF0ZWQnLCDRj9C60YnQviDQv9C+0YLRgNGW0LHQvdC+XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRBbmRVcGRhdGVJbmRleChjaGF0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGNoYXQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIENoYXQubG9hZEZyb21GaWxlINC/0L7QstC10YDQvdGD0LIgbnVsbCAo0YTQsNC50Lsg0L/QvtGI0LrQvtC00LbQtdC90LjQuSDQsNCx0L4g0L3QtdCy0LDQu9GW0LTQvdC40LkpXG4gICAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoXG4gICAgICAgICAgYFtDaGF0TWFuYWdlci5nZXRDaGF0XSBDaGF0LmxvYWRGcm9tRmlsZSByZXR1cm5lZCBudWxsIGZvciBJRCAke2lkfSBhdCBwYXRoICR7YWN0dWFsRmlsZVBhdGh9LiBSZW1vdmluZyBmcm9tIGluZGV4IGlmIHByZXNlbnQuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgLy8gLS0tINCS0JjQn9Cg0JDQktCb0JXQndCeOiDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INC90L7QstC40Lkg0LzQtdGC0L7QtCAtLS1cbiAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZUNoYXRGaWxlQW5kSW5kZXhFbnRyeV9Ob0VtaXQoaWQsIGFjdHVhbEZpbGVQYXRoLCBmYWxzZSk7IC8vIGZhbHNlIC0g0L3QtSDQvdCw0LzQsNCz0LDRlNC80L7RgdGMINCy0LjQtNCw0LvQuNGC0Lgg0YTQsNC50LssINCx0L4g0LLRltC9INCw0LHQviDQvdC1INGW0YHQvdGD0ZQsINCw0LHQviDQv9C+0YjQutC+0LTQttC10L3QuNC5XG4gICAgICAgICAgLy8gLS0tXG4gICAgICAgICAgaWYgKHRoaXMuYWN0aXZlQ2hhdElkID09PSBpZCkge1xuICAgICAgICAgICAgICB0aGlzLmxvZ2dlci53YXJuKGBbQ2hhdE1hbmFnZXIuZ2V0Q2hhdF0gQWN0aXZlIGNoYXQgJHtpZH0gZmFpbGVkIHRvIGxvYWQsIHNldHRpbmcgYWN0aXZlIGNoYXQgdG8gbnVsbC5gKTtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5zZXRBY3RpdmVDaGF0KG51bGwpOyAvLyDQl9Cz0LXQvdC10YDRg9GUICdhY3RpdmUtY2hhdC1jaGFuZ2VkJ1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYFtDaGF0TWFuYWdlci5nZXRDaGF0XSBVbmV4cGVjdGVkIGVycm9yIGR1cmluZyBnZXRDaGF0IGZvciBJRCAke2lkfSBmcm9tICR7YWN0dWFsRmlsZVBhdGh9OmAsIGVycm9yKTtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSBcIkVOT0VOVFwiKSB7IC8vINCk0LDQudC7INC90LUg0LfQvdCw0LnQtNC10L3QvlxuICAgICAgICAgIHRoaXMubG9nZ2VyLndhcm4oYFtDaGF0TWFuYWdlci5nZXRDaGF0XSBGaWxlIG5vdCBmb3VuZCAoRU5PRU5UKSBmb3IgY2hhdCAke2lkfSBhdCAke2FjdHVhbEZpbGVQYXRofS4gQ2xlYW5pbmcgdXAgaW5kZXguYCk7XG4gICAgICAgICAgLy8gLS0tINCS0JjQn9Cg0JDQktCb0JXQndCeOiDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INC90L7QstC40Lkg0LzQtdGC0L7QtCAtLS1cbiAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZUNoYXRGaWxlQW5kSW5kZXhFbnRyeV9Ob0VtaXQoaWQsIGFjdHVhbEZpbGVQYXRoLCBmYWxzZSk7IC8vIGZhbHNlIC0g0YTQsNC50Lsg0ZYg0YLQsNC6INC90LUg0LfQvdCw0LnQtNC10L3QvlxuICAgICAgICAgIC8vIC0tLVxuICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZUNoYXRJZCA9PT0gaWQpIHtcbiAgICAgICAgICAgICAgdGhpcy5sb2dnZXIud2FybihgW0NoYXRNYW5hZ2VyLmdldENoYXRdIEFjdGl2ZSBjaGF0ICR7aWR9IGZpbGUgbm90IGZvdW5kLCBzZXR0aW5nIGFjdGl2ZSBjaGF0IHRvIG51bGwuYCk7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMuc2V0QWN0aXZlQ2hhdChudWxsKTsgLy8g0JfQs9C10L3QtdGA0YPRlCAnYWN0aXZlLWNoYXQtY2hhbmdlZCdcbiAgICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyDQlNC70Y8g0ZbQvdGI0LjRhSDQv9C+0LzQuNC70L7Quiwg0LzQvtC20LvQuNCy0L4sINC90LUg0LLQsNGA0YLQviDQstC40LTQsNC70Y/RgtC4INC3INGW0L3QtNC10LrRgdGDINC+0LTRgNCw0LfRgyxcbiAgICAgIC8vINCw0LvQtSDRhtC1INC30LDQu9C10LbQuNGC0Ywg0LLRltC0INCx0LDQttCw0L3QvtGXINC/0L7QstC10LTRltC90LrQuC4g0J/QvtGC0L7Rh9C90LAg0LvQvtCz0ZbQutCwIC0g0LLQuNC00LDQu9C40YLQuC5cbiAgICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbiAgcHJpdmF0ZSBmaW5kQ2hhdFBhdGhJbkhpZXJhcmNoeShjaGF0SWQ6IHN0cmluZywgbm9kZXM6IEhpZXJhcmNoeU5vZGVbXSk6IHN0cmluZyB8IG51bGwge1xuICAgIGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuICAgICAgaWYgKG5vZGUudHlwZSA9PT0gXCJjaGF0XCIgJiYgbm9kZS5tZXRhZGF0YS5pZCA9PT0gY2hhdElkKSB7XG4gICAgICAgIHJldHVybiBub2RlLmZpbGVQYXRoO1xuICAgICAgfSBlbHNlIGlmIChub2RlLnR5cGUgPT09IFwiZm9sZGVyXCIpIHtcbiAgICAgICAgY29uc3QgcGF0aEluRm9sZGVyID0gdGhpcy5maW5kQ2hhdFBhdGhJbkhpZXJhcmNoeShjaGF0SWQsIG5vZGUuY2hpbGRyZW4pO1xuICAgICAgICBpZiAocGF0aEluRm9sZGVyKSB7XG4gICAgICAgICAgcmV0dXJuIHBhdGhJbkZvbGRlcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIFxuICBcbiAgYXN5bmMgZ2V0QWN0aXZlQ2hhdCgpOiBQcm9taXNlPENoYXQgfCBudWxsPiB7XG4gICAgaWYgKCF0aGlzLmFjdGl2ZUNoYXRJZCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmICh0aGlzLmFjdGl2ZUNoYXQgJiYgdGhpcy5hY3RpdmVDaGF0Lm1ldGFkYXRhLmlkID09PSB0aGlzLmFjdGl2ZUNoYXRJZCkge1xuICAgICAgcmV0dXJuIHRoaXMuYWN0aXZlQ2hhdDtcbiAgICB9XG5cbiAgICBjb25zdCBjaGF0ID0gYXdhaXQgdGhpcy5nZXRDaGF0KHRoaXMuYWN0aXZlQ2hhdElkKTtcbiAgICBpZiAoY2hhdCkge1xuICAgICAgdGhpcy5hY3RpdmVDaGF0ID0gY2hhdDtcbiAgICAgIHJldHVybiBjaGF0O1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBoaWVyYXJjaHkgPSBhd2FpdCB0aGlzLmdldENoYXRIaWVyYXJjaHkoKTtcbiAgICAgIGNvbnN0IGZpcnN0Q2hhdCA9IHRoaXMuZmluZEZpcnN0Q2hhdEluSGllcmFyY2h5KGhpZXJhcmNoeSk7XG4gICAgICBjb25zdCBuZXh0QWN0aXZlSWQgPSBmaXJzdENoYXQgPyBmaXJzdENoYXQubWV0YWRhdGEuaWQgOiBudWxsO1xuXG4gICAgICBhd2FpdCB0aGlzLnNldEFjdGl2ZUNoYXQobmV4dEFjdGl2ZUlkKTtcbiAgICAgIHJldHVybiB0aGlzLmFjdGl2ZUNoYXQ7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldEFjdGl2ZUNoYXQoaWQ6IHN0cmluZyB8IG51bGwpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBwcmV2aW91c0FjdGl2ZUlkID0gdGhpcy5hY3RpdmVDaGF0SWQ7XG5cbiAgICBpZiAoaWQgPT09IHByZXZpb3VzQWN0aXZlSWQpIHtcbiAgICAgIGlmIChpZCAmJiAhdGhpcy5hY3RpdmVDaGF0KSB7XG4gICAgICAgIHRoaXMuYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMuZ2V0Q2hhdChpZCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGlkICYmICF0aGlzLmNoYXRJbmRleFtpZF0pIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBBdHRlbXB0ZWQgdG8gc2V0IGFjdGl2ZSBjaGF0IHRvIG5vbi1leGlzdGVudCBJRCBpbiBpbmRleDogJHtpZH0uIFJlYnVpbGRpbmcgaW5kZXguLi5gKTtcbiAgICAgIGF3YWl0IHRoaXMucmVidWlsZEluZGV4RnJvbUZpbGVzKCk7XG4gICAgICBpZiAoIXRoaXMuY2hhdEluZGV4W2lkXSkge1xuICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihcbiAgICAgICAgICBgQ2hhdCBJRCAke2lkfSBzdGlsbCBub3QgZm91bmQgYWZ0ZXIgaW5kZXggcmVsb2FkLiBBYm9ydGluZyBzZXRBY3RpdmVDaGF0LiBLZWVwaW5nIHByZXZpb3VzIGFjdGl2ZSBjaGF0OiAke3ByZXZpb3VzQWN0aXZlSWR9YFxuICAgICAgICApO1xuICAgICAgICBuZXcgTm90aWNlKGBFcnJvcjogQ2hhdCB3aXRoIElEICR7aWR9IG5vdCBmb3VuZC4gQ2Fubm90IGFjdGl2YXRlLmApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5hY3RpdmVDaGF0SWQgPSBpZDtcbiAgICB0aGlzLmFjdGl2ZUNoYXQgPSBudWxsO1xuICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVEYXRhS2V5KEFDVElWRV9DSEFUX0lEX0tFWSwgaWQpO1xuXG4gICAgbGV0IGxvYWRlZENoYXQ6IENoYXQgfCBudWxsID0gbnVsbDtcbiAgICBpZiAoaWQpIHtcbiAgICAgIGxvYWRlZENoYXQgPSBhd2FpdCB0aGlzLmdldENoYXQoaWQpO1xuICAgICAgaWYgKCFsb2FkZWRDaGF0KSB7XG4gICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKFxuICAgICAgICAgIGBDUklUSUNBTDogRmFpbGVkIHRvIGxvYWQgY2hhdCAke2lkfSB2aWEgZ2V0Q2hhdCBldmVuIGFmdGVyIGluZGV4IGNoZWNrLiBSZXNldHRpbmcgYWN0aXZlIGNoYXQgdG8gbnVsbC5gXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuYWN0aXZlQ2hhdElkID0gbnVsbDtcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGFLZXkoQUNUSVZFX0NIQVRfSURfS0VZLCBudWxsKTtcbiAgICAgICAgaWQgPSBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5hY3RpdmVDaGF0ID0gbG9hZGVkQ2hhdDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgIH1cblxuICAgIHRoaXMucGx1Z2luLmVtaXQoXCJhY3RpdmUtY2hhdC1jaGFuZ2VkXCIsIHsgY2hhdElkOiBpZCwgY2hhdDogdGhpcy5hY3RpdmVDaGF0IH0pO1xuICB9XG5cbiAgYXN5bmMgYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdChcbiAgICByb2xlOiBNZXNzYWdlUm9sZSxcbiAgICBjb250ZW50OiBzdHJpbmcsXG4gICAgdGltZXN0YW1wPzogRGF0ZSxcbiAgICBlbWl0RXZlbnQ6IGJvb2xlYW4gPSB0cnVlLFxuICAgIHRvb2xfY2FsbHM/OiBUb29sQ2FsbFtdLFxuICAgIHRvb2xfY2FsbF9pZD86IHN0cmluZyxcbiAgICBuYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8TWVzc2FnZSB8IG51bGw+IHtcbiAgICBjb25zdCBtZXNzYWdlVGltZXN0YW1wID0gdGltZXN0YW1wIHx8IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgbmV3TWVzc2FnZTogTWVzc2FnZSA9IHtcbiAgICAgICAgcm9sZSxcbiAgICAgICAgY29udGVudCxcbiAgICAgICAgdGltZXN0YW1wOiBtZXNzYWdlVGltZXN0YW1wLFxuICAgIH07XG5cbiAgICAvLyDQlNC+0LTQsNGU0LzQviDQvtC/0YbRltC+0L3QsNC70YzQvdGWINC/0L7Qu9GPLCDRj9C60YnQviDQstC+0L3QuCDQvdCw0LTQsNC90ZZcbiAgICBpZiAodG9vbF9jYWxscyAmJiB0b29sX2NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgIG5ld01lc3NhZ2UudG9vbF9jYWxscyA9IHRvb2xfY2FsbHM7XG4gICAgfVxuICAgIGlmICh0b29sX2NhbGxfaWQpIHtcbiAgICAgIG5ld01lc3NhZ2UudG9vbF9jYWxsX2lkID0gdG9vbF9jYWxsX2lkO1xuICAgIH1cbiAgICBpZiAobmFtZSkge1xuICAgICAgbmV3TWVzc2FnZS5uYW1lID0gbmFtZTtcbiAgICB9XG4gICAgLy8g0JzQvtC20LvQuNCy0L4sINC00L7QtNCw0YLQuCDQv9C+0LvQtSAnaW1hZ2VzJywg0Y/QutGJ0L4g0LLQvtC90L4g0LLQuNC60L7RgNC40YHRgtC+0LLRg9GU0YLRjNGB0Y8g0L/RgNC4INGB0YLQstC+0YDQtdC90L3RliDQv9C+0LLRltC00L7QvNC70LXQvdC90Y8g0YLRg9GCXG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0UGF5bG9hZChuZXdNZXNzYWdlLCBlbWl0RXZlbnQpO1xuICB9XG5cbiAgYXN5bmMgY2xlYXJBY3RpdmVDaGF0TWVzc2FnZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMuZ2V0QWN0aXZlQ2hhdCgpO1xuICAgIGlmICghYWN0aXZlQ2hhdCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoYWN0aXZlQ2hhdC5tZXNzYWdlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBhY3RpdmVDaGF0LmNsZWFyTWVzc2FnZXMoKTtcblxuICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRBbmRVcGRhdGVJbmRleChhY3RpdmVDaGF0KTtcbiAgICB0aGlzLnBsdWdpbi5lbWl0KFwibWVzc2FnZXMtY2xlYXJlZFwiLCBhY3RpdmVDaGF0Lm1ldGFkYXRhLmlkKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUFjdGl2ZUNoYXRNZXRhZGF0YShcbiAgICBtZXRhZGF0YVVwZGF0ZTogUGFydGlhbDxPbWl0PENoYXRNZXRhZGF0YSwgXCJpZFwiIHwgXCJjcmVhdGVkQXRcIiB8IFwibGFzdE1vZGlmaWVkXCI+PlxuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5nZXRBY3RpdmVDaGF0KCk7XG4gICAgaWYgKCFhY3RpdmVDaGF0KSB7XG4gICAgICBuZXcgTm90aWNlKFwiTm8gYWN0aXZlIGNoYXQgdG8gdXBkYXRlIG1ldGFkYXRhIGZvci5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKGBBdHRlbXB0aW5nIHRvIHVwZGF0ZSBtZXRhZGF0YSBmb3IgYWN0aXZlIGNoYXQgJHthY3RpdmVDaGF0Lm1ldGFkYXRhLmlkfTpgLCBtZXRhZGF0YVVwZGF0ZSk7XG4gICAgaWYgKE9iamVjdC5rZXlzKG1ldGFkYXRhVXBkYXRlKS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoYEF0dGVtcHRpbmcgdG8gdXBkYXRlIG1ldGFkYXRhIGZvciBhY3RpdmUgY2hhdCAke2FjdGl2ZUNoYXQhLm1ldGFkYXRhLmlkfTpgLCBtZXRhZGF0YVVwZGF0ZSk7XG4gICAgY29uc3Qgb2xkUm9sZVBhdGggPSBhY3RpdmVDaGF0Lm1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGg7XG4gICAgY29uc3Qgb2xkTW9kZWxOYW1lID0gYWN0aXZlQ2hhdC5tZXRhZGF0YS5tb2RlbE5hbWU7XG5cbiAgICBjb25zdCBjaGFuZ2VkID0gYWN0aXZlQ2hhdC51cGRhdGVNZXRhZGF0YShtZXRhZGF0YVVwZGF0ZSk7XG5cbiAgICBpZiAoY2hhbmdlZCkge1xuICAgICAgICB0aGlzLmxvZ2dlci5kZWJ1ZyhgTWV0YWRhdGEgdXBkYXRlZCBpbiBDaGF0IG9iamVjdCBmb3IgJHthY3RpdmVDaGF0IS5tZXRhZGF0YS5pZH0uIFNhdmUgc2NoZWR1bGVkIGJ5IENoYXQudXBkYXRlTWV0YWRhdGEuYCk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0QW5kVXBkYXRlSW5kZXgoYWN0aXZlQ2hhdCk7XG5cbiAgICAgIGNvbnN0IG5ld01ldGEgPSBhY3RpdmVDaGF0Lm1ldGFkYXRhO1xuICAgICAgbGV0IHJvbGVDaGFuZ2VkID0gZmFsc2U7XG4gICAgICBsZXQgbW9kZWxDaGFuZ2VkID0gZmFsc2U7XG4gICAgICBpZiAobWV0YWRhdGFVcGRhdGUuc2VsZWN0ZWRSb2xlUGF0aCAhPT0gdW5kZWZpbmVkICYmIG9sZFJvbGVQYXRoICE9PSBuZXdNZXRhLnNlbGVjdGVkUm9sZVBhdGgpIHtcbiAgICAgICAgcm9sZUNoYW5nZWQgPSB0cnVlO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGFkYXRhVXBkYXRlLm1vZGVsTmFtZSAhPT0gdW5kZWZpbmVkICYmIG9sZE1vZGVsTmFtZSAhPT0gbmV3TWV0YS5tb2RlbE5hbWUpIHtcbiAgICAgICAgbW9kZWxDaGFuZ2VkID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJvbGVDaGFuZ2VkKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3Qgcm9sZVBhdGhBcmcgPSBuZXdNZXRhLnNlbGVjdGVkUm9sZVBhdGggPz8gdW5kZWZpbmVkO1xuICAgICAgICAgIGNvbnN0IG5ld1JvbGVOYW1lID0gYXdhaXQgdGhpcy5wbHVnaW4uZmluZFJvbGVOYW1lQnlQYXRoKHJvbGVQYXRoQXJnKTtcblxuICAgICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJyb2xlLWNoYW5nZWRcIiwgbmV3Um9sZU5hbWUgPz8gXCJOb25lXCIpO1xuICAgICAgICAgIHRoaXMucGx1Z2luLnByb21wdFNlcnZpY2U/LmNsZWFyUm9sZUNhY2hlPy4oKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKFwiRXJyb3IgZmluZGluZyByb2xlIG5hbWUgb3IgZW1pdHRpbmcgcm9sZS1jaGFuZ2VkOlwiLCBlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKG1vZGVsQ2hhbmdlZCkge1xuICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwibW9kZWwtY2hhbmdlZFwiLCBuZXdNZXRhLm1vZGVsTmFtZSB8fCBcIlwiKTtcbiAgICAgICAgdGhpcy5wbHVnaW4ucHJvbXB0U2VydmljZT8uY2xlYXJNb2RlbERldGFpbHNDYWNoZT8uKCk7XG4gICAgICB9XG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihgW0NoYXRNYW5hZ2VyXSA+Pj4gRW1pdHRpbmcgJ2FjdGl2ZS1jaGF0LWNoYW5nZWQnIGZyb20gdXBkYXRlQWN0aXZlQ2hhdE1ldGFkYXRhIGZvciBJRDogJHt0aGlzLmFjdGl2ZUNoYXRJZH1gKTtcbiAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJhY3RpdmUtY2hhdC1jaGFuZ2VkXCIsIHsgY2hhdElkOiB0aGlzLmFjdGl2ZUNoYXRJZCwgY2hhdDogYWN0aXZlQ2hhdCB9KTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbi8vIHNyYy9DaGF0TWFuYWdlci50c1xuXG4vLyDQlNCe0JTQkNCZ0KLQlSDQptCV0Jkg0J3QntCS0JjQmSDQn9Cg0JjQktCQ0KLQndCY0Jkg0JzQldCi0J7QlDpcbi8qKlxuICog0JTQvtC/0L7QvNGW0LbQvdC40Lkg0LzQtdGC0L7QtCDQtNC70Y8g0LLQuNC00LDQu9C10L3QvdGPINGE0LDQudC70YMg0YfQsNGC0YMg0YLQsCDQt9Cw0L/QuNGB0YMg0Lcg0ZbQvdC00LXQutGB0YMg0JHQldCXINCz0LXQvdC10YDQsNGG0ZbRlyDQv9C+0LTRltC5LlxuICogQHBhcmFtIGlkIElEINGH0LDRgtGDINC00LvRjyDQstC40LTQsNC70LXQvdC90Y8uXG4gKiBAcGFyYW0gZmlsZVBhdGgg0KjQu9GP0YUg0LTQviDRhNCw0LnQu9GDINGH0LDRgtGDICjQvNC+0LbQtSDQsdGD0YLQuCBudWxsKS5cbiAqIEBwYXJhbSBkZWxldGVGaWxlINCn0Lgg0L/QvtGC0YDRltCx0L3QviDQstC40LTQsNC70Y/RgtC4INGE0ZbQt9C40YfQvdC40Lkg0YTQsNC50LsuXG4gKiBAcmV0dXJucyB0cnVlLCDRj9C60YnQviDRltC90LTQtdC60YEgY2hhdEluZGV4INCx0YPQsiDQt9C80ZbQvdC10L3QuNC5LCBmYWxzZSDQsiDRltC90YjQvtC80YMg0LLQuNC/0LDQtNC60YMuXG4gKi9cbnByaXZhdGUgYXN5bmMgZGVsZXRlQ2hhdEZpbGVBbmRJbmRleEVudHJ5X05vRW1pdChcbiAgaWQ6IHN0cmluZyxcbiAgZmlsZVBhdGg6IHN0cmluZyB8IG51bGwsXG4gIGRlbGV0ZUZpbGU6IGJvb2xlYW4gPSB0cnVlXG4pOiBQcm9taXNlPGJvb2xlYW4+IHsgLy8g0J/QvtCy0LXRgNGC0LDRlCB0cnVlLCDRj9C60YnQviDRltC90LTQtdC60YEg0LfQvNGW0L3QtdC90L5cbiAgY29uc3Qgc2FmZUZpbGVQYXRoID0gZmlsZVBhdGggPz8gXCJ1bmtub3duX3BhdGhcIjsgLy8g0JTQu9GPINC70L7Qs9GD0LLQsNC90L3Rj1xuICBsZXQgaW5kZXhDaGFuZ2VkID0gZmFsc2U7XG5cbiAgLy8g0JLQuNC00LDQu9C10L3QvdGPINC3INC60LXRiNGDINC30LDQstCw0L3RgtCw0LbQtdC90LjRhSDRh9Cw0YLRltCyXG4gIGlmICh0aGlzLmxvYWRlZENoYXRzW2lkXSkge1xuICAgICAgZGVsZXRlIHRoaXMubG9hZGVkQ2hhdHNbaWRdO1xuICAgICAgdGhpcy5sb2dnZXIuZGVidWcoYFtkZWxldGVIZWxwZXJdIFJlbW92ZWQgY2hhdCAke2lkfSBmcm9tIGxvYWRlZENoYXRzIGNhY2hlLmApO1xuICB9XG4gIC8vINCS0LjQtNCw0LvQtdC90L3RjyDQtyDRltC90LTQtdC60YHRg1xuICBpZiAodGhpcy5jaGF0SW5kZXhbaWRdKSB7XG4gICAgICBkZWxldGUgdGhpcy5jaGF0SW5kZXhbaWRdO1xuICAgICAgaW5kZXhDaGFuZ2VkID0gdHJ1ZTsgLy8g0J/QvtC80ZbRh9Cw0ZTQvNC+LCDRidC+INGW0L3QtNC10LrRgSDQt9C80ZbQvdC40LLRgdGPXG4gICAgICB0aGlzLmxvZ2dlci5kZWJ1ZyhgW2RlbGV0ZUhlbHBlcl0gUmVtb3ZlZCBjaGF0ICR7aWR9IGZyb20gY2hhdEluZGV4LmApO1xuICB9IGVsc2Uge1xuICAgICAgdGhpcy5sb2dnZXIuZGVidWcoYFtkZWxldGVIZWxwZXJdIENoYXQgJHtpZH0gd2FzIG5vdCBpbiBjaGF0SW5kZXguYCk7XG4gIH1cblxuICAvLyDQktC40LTQsNC70LXQvdC90Y8g0YTQsNC50LvRgywg0Y/QutGJ0L4g0L/QvtGC0YDRltCx0L3QviDRliDQvNC+0LbQu9C40LLQvlxuICBpZiAoZGVsZXRlRmlsZSAmJiBmaWxlUGF0aCAmJiB0eXBlb2YgZmlsZVBhdGggPT09IFwic3RyaW5nXCIgJiYgZmlsZVBhdGggIT09IFwiL1wiICYmICFmaWxlUGF0aC5lbmRzV2l0aChcIi9cIikpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgZmlsZUV4aXN0cyA9IGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHMoZmlsZVBhdGgpO1xuICAgICAgICAgIGlmIChmaWxlRXhpc3RzKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuc3RhdChmaWxlUGF0aCk7XG4gICAgICAgICAgICAgIGlmIChzdGF0Py50eXBlID09PSBcImZpbGVcIikge1xuICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyLnJlbW92ZShmaWxlUGF0aCk7XG4gICAgICAgICAgICAgICAgICB0aGlzLmxvZ2dlci5kZWJ1ZyhgW2RlbGV0ZUhlbHBlcl0gUmVtb3ZlZCBjaGF0IGZpbGU6ICR7ZmlsZVBhdGh9YCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYFtkZWxldGVIZWxwZXJdIEF0dGVtcHRlZCB0byByZW1vdmUgYSBub24tZmlsZSBwYXRoOiAke2ZpbGVQYXRofWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgIHRoaXMubG9nZ2VyLndhcm4oYFtkZWxldGVIZWxwZXJdIENoYXQgZmlsZSBub3QgZm91bmQgZm9yIHJlbW92YWw6ICR7ZmlsZVBhdGh9YCk7XG4gICAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYFtkZWxldGVIZWxwZXJdIEVycm9yIHJlbW92aW5nIGNoYXQgZmlsZSAke2ZpbGVQYXRofTpgLCBlKTtcbiAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvciBkZWxldGluZyBmaWxlOiAke2ZpbGVQYXRoLnNwbGl0KCcvJykucG9wKCl9YCk7XG4gICAgICAgICAgLy8g0J3QtSDQv9C10YDQtdGA0LjQstCw0ZTQvNC+INC/0YDQvtGG0LXRgSDRh9C10YDQtdC3INC/0L7QvNC40LvQutGDINCy0LjQtNCw0LvQtdC90L3RjyDRhNCw0LnQu9GDLCDRltC90LTQtdC60YEg0LLQsNC20LvQuNCy0ZbRiNC40LlcbiAgICAgIH1cbiAgfSBlbHNlIGlmIChkZWxldGVGaWxlICYmIGZpbGVQYXRoKSB7XG4gICAgICAgLy8g0JvQvtCz0YPRlNC80L4sINGP0LrRidC+INGI0LvRj9GFINC90LXQutC+0YDQtdC60YLQvdC40Lkg0LTQu9GPINCy0LjQtNCw0LvQtdC90L3Rj1xuICAgICAgIHRoaXMubG9nZ2VyLndhcm4oYFtkZWxldGVIZWxwZXJdIEludmFsaWQgZmlsZSBwYXRoIHByb3ZpZGVkIGZvciBkZWxldGlvbjogJHtmaWxlUGF0aH1gKTtcbiAgfVxuXG4gIC8vINCX0LHQtdGA0ZbQs9Cw0ZTQvNC+INGW0L3QtNC10LrRgSwg0KLQhtCb0KzQmtCYINGP0LrRidC+INCy0ZbQvSDQt9C80ZbQvdC40LLRgdGPXG4gIGlmIChpbmRleENoYW5nZWQpIHtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRJbmRleCgpO1xuICAgICAgdGhpcy5sb2dnZXIuZGVidWcoYFtkZWxldGVIZWxwZXJdIFNhdmVkIHVwZGF0ZWQgY2hhdEluZGV4IGFmdGVyIHJlbW92aW5nICR7aWR9LmApO1xuICB9XG4gIHJldHVybiBpbmRleENoYW5nZWQ7IC8vINCf0L7QstC10YDRgtCw0ZTQvNC+INGB0YLQsNGC0YPRgSDQt9C80ZbQvdC4INGW0L3QtNC10LrRgdGDXG59XG5cbiAgLy8gc3JjL0NoYXRNYW5hZ2VyLnRzXG5cbmFzeW5jIGRlbGV0ZUNoYXQoaWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICBjb25zdCBjaGF0RXhpc3RlZEluSW5kZXggPSAhIXRoaXMuY2hhdEluZGV4W2lkXTtcbiAgY29uc3Qgd2FzQWN0aXZlID0gaWQgPT09IHRoaXMuYWN0aXZlQ2hhdElkO1xuICB0aGlzLmxvZ2dlci5kZWJ1ZyhgW2RlbGV0ZUNoYXRdIERlbGV0aW5nIGNoYXQgJHtpZH0uIFdhcyBhY3RpdmU6ICR7d2FzQWN0aXZlfS4gRXhpc3RlZCBpbiBpbmRleDogJHtjaGF0RXhpc3RlZEluSW5kZXh9LmApO1xuXG4gIGxldCBmaWxlUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHRyeSB7XG4gICAgICAvLyDQl9C90LDRhdC+0LTQuNC80L4g0YjQu9GP0YUg0LTQviDRhNCw0LnQu9GDICjQvdCw0LnQutGA0LDRidC1INGH0LXRgNC10Lcg0ZbRlNGA0LDRgNGF0ZbRjilcbiAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IGF3YWl0IHRoaXMuZ2V0Q2hhdEhpZXJhcmNoeSgpO1xuICAgICAgZmlsZVBhdGggPSB0aGlzLmZpbmRDaGF0UGF0aEluSGllcmFyY2h5KGlkLCBoaWVyYXJjaHkpO1xuICAgICAgaWYgKCFmaWxlUGF0aCAmJiBjaGF0RXhpc3RlZEluSW5kZXgpIHtcbiAgICAgICAgICAgdGhpcy5sb2dnZXIud2FybihgW2RlbGV0ZUNoYXRdIEZpbGUgcGF0aCBmb3IgY2hhdCAke2lkfSBub3QgZm91bmQgaW4gaGllcmFyY2h5LCBidXQgY2hhdCBleGlzdHMgaW4gaW5kZXguIFdpbGwgb25seSByZW1vdmUgZnJvbSBpbmRleC5gKTtcbiAgICAgIH1cbiAgfSBjYXRjaCAoaGllcmFyY2h5RXJyb3IpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBFcnJvciBnZXR0aW5nIGhpZXJhcmNoeSBkdXJpbmcgZGVsZXRlIG9wZXJhdGlvbiBmb3IgJHtpZH06YCwgaGllcmFyY2h5RXJyb3IpO1xuICAgICAgLy8g0J/RgNC+0LTQvtCy0LbRg9GU0LzQviDQsdC10Lcg0YjQu9GP0YXRgywg0Y/QutGJ0L4g0YfQsNGCINGUINCyINGW0L3QtNC10LrRgdGWXG4gIH1cblxuICAvLyDQr9C60YnQviDRh9Cw0YLRgyDQvdC10LzQsNGUINC90ZYg0LIg0ZbQvdC00LXQutGB0ZYsINC90ZYg0YjQu9GP0YUg0L3QtSDQt9C90LDQudC00LXQvdC+ICjRj9C60YnQviDQstGW0L0g0LHRg9CyINC/0L7RgtGA0ZbQsdC10L0pXG4gIGlmICghZmlsZVBhdGggJiYgIWNoYXRFeGlzdGVkSW5JbmRleCkge1xuICAgICAgdGhpcy5sb2dnZXIud2FybihgW2RlbGV0ZUNoYXRdIENoYXQgJHtpZH0gbm90IGZvdW5kIGluIGluZGV4IG9yIGhpZXJhcmNoeS4gTm90aGluZyB0byBkZWxldGUuYCk7XG4gICAgICByZXR1cm4gZmFsc2U7IC8vINCn0LDRgtGDINC90LUg0ZbRgdC90YPRlFxuICB9XG5cbiAgbGV0IHN1Y2Nlc3MgPSB0cnVlO1xuICAvLyDQl9C80ZbQvdC90LAg0LTQu9GPINC/0L7QtNGW0ZcsINGP0LrRgyDQv9C+0YLRgNGW0LHQvdC+INC30LPQtdC90LXRgNGD0LLQsNGC0Lgg0J/QhtCh0JvQryDQstGB0ZbRhSDQvtC/0LXRgNCw0YbRltC5XG4gIGxldCBldmVudFRvRW1pdDogeyBuYW1lOiBzdHJpbmc7IGRhdGE6IGFueSB9IHwgbnVsbCA9IG51bGw7XG5cbiAgdHJ5IHtcbiAgICAgIC8vINCS0LjQutC70LjQutCw0ZTQvNC+INC90L7QstC40Lkg0LTQvtC/0L7QvNGW0LbQvdC40Lkg0LzQtdGC0L7QtCwg0Y/QutC40Lkg0J3QlSDQs9C10L3QtdGA0YPRlCDQv9C+0LTRltC5XG4gICAgICBjb25zdCBpbmRleFdhc0NoYW5nZWQgPSBhd2FpdCB0aGlzLmRlbGV0ZUNoYXRGaWxlQW5kSW5kZXhFbnRyeV9Ob0VtaXQoaWQsIGZpbGVQYXRoLCB0cnVlKTtcbiAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKGBbZGVsZXRlQ2hhdF0gZGVsZXRlQ2hhdEZpbGVBbmRJbmRleEVudHJ5X05vRW1pdCBmaW5pc2hlZC4gSW5kZXggY2hhbmdlZDogJHtpbmRleFdhc0NoYW5nZWR9YCk7XG5cbiAgICAgIC8vINCS0LjQt9C90LDRh9Cw0ZTQvNC+LCDRj9C60YMg0L/QvtC00ZbRjiDQs9C10L3QtdGA0YPQstCw0YLQuCAo0LDQsdC+INC20L7QtNC90L7RlylcbiAgICAgIGlmICh3YXNBY3RpdmUpIHtcbiAgICAgICAgICB0aGlzLmxvZ2dlci5kZWJ1ZyhgW2RlbGV0ZUNoYXRdIERlbGV0ZWQgY2hhdCB3YXMgYWN0aXZlLiBGaW5kaW5nIGFuZCBzZXR0aW5nIG5leHQgYWN0aXZlIGNoYXQuLi5gKTtcbiAgICAgICAgICAvLyDQktC40LfQvdCw0YfQsNGU0LzQviDQvdCw0YHRgtGD0L/QvdC40Lkg0LDQutGC0LjQstC90LjQuSDRh9Cw0YJcbiAgICAgICAgICBjb25zdCBuZXdIaWVyYXJjaHkgPSBhd2FpdCB0aGlzLmdldENoYXRIaWVyYXJjaHkoKTsgLy8g0J7RgtGA0LjQvNGD0ZTQvNC+INC+0L3QvtCy0LvQtdC90YMg0ZbRlNGA0LDRgNGF0ZbRjlxuICAgICAgICAgIGNvbnN0IGZpcnN0Q2hhdCA9IHRoaXMuZmluZEZpcnN0Q2hhdEluSGllcmFyY2h5KG5ld0hpZXJhcmNoeSk7XG4gICAgICAgICAgY29uc3QgbmV4dEFjdGl2ZUlkID0gZmlyc3RDaGF0ID8gZmlyc3RDaGF0Lm1ldGFkYXRhLmlkIDogbnVsbDtcbiAgICAgICAgICB0aGlzLmxvZ2dlci5kZWJ1ZyhgW2RlbGV0ZUNoYXRdIE5leHQgYWN0aXZlIGNoYXQgd2lsbCBiZTogJHtuZXh0QWN0aXZlSWR9YCk7XG5cbiAgICAgICAgICAvLyDQktC40LrQu9C40LrQsNGU0LzQviBzZXRBY3RpdmVDaGF0LiDQktGW0L0g0YHQsNC8INC30LPQtdC90LXRgNGD0ZQgJ2FjdGl2ZS1jaGF0LWNoYW5nZWQnLlxuICAgICAgICAgIC8vINCm0Y8g0L/QvtC00ZbRjyDQvNCw0ZQg0LHRg9GC0Lgg0LTQvtGB0YLQsNGC0L3RjNC+0Y4g0LTQu9GPINC+0L3QvtCy0LvQtdC90L3RjyBVSSAo0LLQutC70Y7Rh9Cw0Y7Rh9C4INGB0L/QuNGB0L7QuikuXG4gICAgICAgICAgYXdhaXQgdGhpcy5zZXRBY3RpdmVDaGF0KG5leHRBY3RpdmVJZCk7XG4gICAgICAgICAgLy8g0J3QtdC80LDRlCDQv9C+0YLRgNC10LHQuCDQs9C10L3QtdGA0YPQstCw0YLQuCAnY2hhdC1saXN0LXVwZGF0ZWQnINC+0LrRgNC10LzQviDRgtGD0YIuXG5cbiAgICAgIH0gZWxzZSBpZiAoaW5kZXhXYXNDaGFuZ2VkKSB7XG4gICAgICAgICAgLy8g0K/QutGJ0L4g0LLQuNC00LDQu9C10L3QviDQndCV0LDQutGC0LjQstC90LjQuSDRh9Cw0YIsINCw0LvQtSDRltC90LTQtdC60YEg0LfQvNGW0L3QuNCy0YHRjyxcbiAgICAgICAgICAvLyDQvdCw0Lwg0J/QntCi0KDQhtCR0J3QkCDQv9C+0LTRltGPICdjaGF0LWxpc3QtdXBkYXRlZCcsINGJ0L7QsSDRgdC/0LjRgdC+0Log0L7QvdC+0LLQuNCy0YHRjy5cbiAgICAgICAgICB0aGlzLmxvZ2dlci5kZWJ1ZyhgW2RlbGV0ZUNoYXRdIE5vbi1hY3RpdmUgY2hhdCBkZWxldGVkIGFuZCBpbmRleCBjaGFuZ2VkLiBTZXR0aW5nICdjaGF0LWxpc3QtdXBkYXRlZCcgdG8gYmUgZW1pdHRlZC5gKTtcbiAgICAgICAgICBldmVudFRvRW1pdCA9IHsgbmFtZTogXCJjaGF0LWxpc3QtdXBkYXRlZFwiLCBkYXRhOiB1bmRlZmluZWQgfTtcbiAgICAgIH1cblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYEVycm9yIGR1cmluZyBkZWxldGlvbiBwcm9jZXNzIGZvciBjaGF0ICR7aWR9OmAsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UoYEVycm9yIGRlbGV0aW5nIGNoYXQgJHtpZH0uIENoZWNrIGNvbnNvbGUuYCk7XG4gICAgICBzdWNjZXNzID0gZmFsc2U7XG4gICAgICAvLyDQodC/0YDQvtCx0YPRlNC80L4g0LLRltC00L3QvtCy0LjRgtC4INC60L7QvdGB0LjRgdGC0LXQvdGC0L3RltGB0YLRjCDRltC90LTQtdC60YHRgyDQv9GA0Lgg0L/QvtC80LjQu9GG0ZZcbiAgICAgIGF3YWl0IHRoaXMucmVidWlsZEluZGV4RnJvbUZpbGVzKCk7XG4gICAgICAvLyDQn9GW0YHQu9GPINC/0LXRgNC10LHRg9C00L7QstC4INGW0L3QtNC10LrRgdGDINGC0L7Rh9C90L4g0L/QvtGC0YDRltCx0L3QtSDQvtC90L7QstC70LXQvdC90Y8g0YHQv9C40YHQutGDXG4gICAgICBldmVudFRvRW1pdCA9IHsgbmFtZTogXCJjaGF0LWxpc3QtdXBkYXRlZFwiLCBkYXRhOiB1bmRlZmluZWQgfTtcbiAgfSBmaW5hbGx5IHtcbiAgICAgIC8vINCT0LXQvdC10YDRg9GU0LzQviDQv9C+0LTRltGOLCDRj9C60YnQviDQstC+0L3QsCDQsdGD0LvQsCDQt9Cw0L/Qu9Cw0L3QvtCy0LDQvdCwXG4gICAgICBpZiAoZXZlbnRUb0VtaXQpIHtcbiAgICAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoYFtkZWxldGVDaGF0XSBFbWl0dGluZyBmaW5hbCBldmVudDogJHtldmVudFRvRW1pdC5uYW1lfWApO1xuICAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KGV2ZW50VG9FbWl0Lm5hbWUsIGV2ZW50VG9FbWl0LmRhdGEpO1xuICAgICAgfSBlbHNlIGlmICh3YXNBY3RpdmUpIHtcbiAgICAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoYFtkZWxldGVDaGF0XSBObyBmaW5hbCBldmVudCBlbWl0dGVkIGZyb20gZGVsZXRlQ2hhdCBpdHNlbGYgKHJlbGllZCBvbiBzZXRBY3RpdmVDaGF0KS5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKGBbZGVsZXRlQ2hhdF0gTm8gZmluYWwgZXZlbnQgZW1pdHRlZCAobm9uLWFjdGl2ZSBkZWxldGVkLCBpbmRleCB1bmNoYW5nZWQsIG9yIGVycm9yIHdpdGhvdXQgcmVidWlsZCkuYCk7XG4gICAgICB9XG5cbiAgICAgIC8vINCf0L7QutCw0LfRg9GU0LzQviDRgdC/0L7QstGW0YnQtdC90L3Rjywg0YLRltC70YzQutC4INGP0LrRidC+INCy0LjQtNCw0LvQtdC90L3RjyDQsdGD0LvQviDRg9GB0L/RltGI0L3QuNC8INGWINGH0LDRgiDRltGB0L3Rg9Cy0LDQslxuICAgICAgaWYgKHN1Y2Nlc3MgJiYgY2hhdEV4aXN0ZWRJbkluZGV4KSB7XG4gICAgICAgICAgbmV3IE5vdGljZShgQ2hhdCBkZWxldGVkLmApO1xuICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oYENoYXQgJHtpZH0gZGVsZXRlZCBzdWNjZXNzZnVsbHkuYCk7XG4gICAgICB9IGVsc2UgaWYgKCFjaGF0RXhpc3RlZEluSW5kZXgpIHtcbiAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbyhgQ2hhdCAke2lkfSBkZWxldGlvbiBhdHRlbXB0IC0gY2hhdCBkaWQgbm90IGV4aXN0IGluIGluZGV4LmApO1xuICAgICAgfVxuICB9XG4gIC8vINCf0L7QstC10YDRgtCw0ZTQvNC+IHRydWUsINGP0LrRidC+INGH0LDRgiDRltGB0L3Rg9Cy0LDQsiDRliDQvtC/0LXRgNCw0YbRltGPICjQv9GA0LjQvdCw0LnQvNC90ZYg0L7QvdC+0LLQu9C10L3QvdGPINGW0L3QtNC10LrRgdGDKSDQv9GA0L7QudGI0LvQsCDRg9GB0L/RltGI0L3QvlxuICByZXR1cm4gc3VjY2VzcyAmJiBjaGF0RXhpc3RlZEluSW5kZXg7XG59XG5cbiAgYXN5bmMgY2xvbmVDaGF0KGNoYXRJZFRvQ2xvbmU6IHN0cmluZyk6IFByb21pc2U8Q2hhdCB8IG51bGw+IHtcbiAgICBsZXQgb3JpZ2luYWxGaWxlUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IGF3YWl0IHRoaXMuZ2V0Q2hhdEhpZXJhcmNoeSgpO1xuICAgICAgb3JpZ2luYWxGaWxlUGF0aCA9IHRoaXMuZmluZENoYXRQYXRoSW5IaWVyYXJjaHkoY2hhdElkVG9DbG9uZSwgaGllcmFyY2h5KTtcbiAgICB9IGNhdGNoIChoaWVyYXJjaHlFcnJvcikge1xuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYEVycm9yIGdldHRpbmcgaGllcmFyY2h5IGR1cmluZyBjbG9uZSBvcGVyYXRpb24gZm9yICR7Y2hhdElkVG9DbG9uZX06YCwgaGllcmFyY2h5RXJyb3IpO1xuICAgICAgbmV3IE5vdGljZShcIkVycm9yIGZpbmRpbmcgb3JpZ2luYWwgY2hhdCBmb3IgY2xvbmluZy5cIik7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIW9yaWdpbmFsRmlsZVBhdGgpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBDYW5ub3QgY2xvbmU6IEZpbGUgcGF0aCBmb3Igb3JpZ2luYWwgY2hhdCAke2NoYXRJZFRvQ2xvbmV9IG5vdCBmb3VuZC5gKTtcbiAgICAgIG5ldyBOb3RpY2UoXCJPcmlnaW5hbCBjaGF0IGZpbGUgcGF0aCBub3QgZm91bmQuXCIpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGNvbnN0IG9yaWdpbmFsQ2hhdCA9IGF3YWl0IHRoaXMuZ2V0Q2hhdChjaGF0SWRUb0Nsb25lLCBvcmlnaW5hbEZpbGVQYXRoKTtcbiAgICBpZiAoIW9yaWdpbmFsQ2hhdCkge1xuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYENhbm5vdCBjbG9uZTogT3JpZ2luYWwgY2hhdCAke2NoYXRJZFRvQ2xvbmV9IGNvdWxkIG5vdCBiZSBsb2FkZWQgZnJvbSAke29yaWdpbmFsRmlsZVBhdGh9LmApO1xuICAgICAgbmV3IE5vdGljZShcIk9yaWdpbmFsIGNoYXQgY291bGQgbm90IGJlIGxvYWRlZC5cIik7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCB0YXJnZXRGb2xkZXIgPSBvcmlnaW5hbEZpbGVQYXRoLnN1YnN0cmluZygwLCBvcmlnaW5hbEZpbGVQYXRoLmxhc3RJbmRleE9mKFwiL1wiKSkgfHwgXCIvXCI7XG4gICAgY29uc3QgZmluYWxGb2xkZXJQYXRoID0gdGFyZ2V0Rm9sZGVyID09PSBcIlwiIHx8IHRhcmdldEZvbGRlciA9PT0gXCIuXCIgPyBcIi9cIiA6IHRhcmdldEZvbGRlcjtcblxuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLmVuc3VyZVNwZWNpZmljRm9sZGVyRXhpc3RzKGZpbmFsRm9sZGVyUGF0aCk7XG4gICAgfSBjYXRjaCAoZm9sZGVyRXJyb3IpIHtcbiAgICAgIG5ldyBOb3RpY2UoYEZhaWxlZCB0byBlbnN1cmUgdGFyZ2V0IGZvbGRlciBmb3IgY2xvbmU6ICR7ZmluYWxGb2xkZXJQYXRofWApO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNsb25lZERhdGEgPSBvcmlnaW5hbENoYXQudG9KU09OKCk7XG4gICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgICAgY29uc3QgbmV3SWQgPSB1dWlkdjQoKTtcbiAgICAgIGNvbnN0IG5ld0ZpbGVQYXRoID0gdGhpcy5nZXRDaGF0RmlsZVBhdGgobmV3SWQsIGZpbmFsRm9sZGVyUGF0aCk7XG5cbiAgICAgIGNsb25lZERhdGEubWV0YWRhdGEuaWQgPSBuZXdJZDtcbiAgICAgIGNsb25lZERhdGEubWV0YWRhdGEubmFtZSA9IGBDb3B5IG9mICR7b3JpZ2luYWxDaGF0Lm1ldGFkYXRhLm5hbWV9YDtcbiAgICAgIGNsb25lZERhdGEubWV0YWRhdGEuY3JlYXRlZEF0ID0gbm93LnRvSVNPU3RyaW5nKCk7XG4gICAgICBjbG9uZWREYXRhLm1ldGFkYXRhLmxhc3RNb2RpZmllZCA9IG5vdy50b0lTT1N0cmluZygpO1xuICAgICAgY2xvbmVkRGF0YS5tZXRhZGF0YS5tb2RlbE5hbWUgPSBvcmlnaW5hbENoYXQubWV0YWRhdGEubW9kZWxOYW1lO1xuICAgICAgY2xvbmVkRGF0YS5tZXRhZGF0YS5zZWxlY3RlZFJvbGVQYXRoID0gb3JpZ2luYWxDaGF0Lm1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGg7XG4gICAgICBjbG9uZWREYXRhLm1ldGFkYXRhLnRlbXBlcmF0dXJlID0gb3JpZ2luYWxDaGF0Lm1ldGFkYXRhLnRlbXBlcmF0dXJlO1xuICAgICAgY2xvbmVkRGF0YS5tZXRhZGF0YS5jb250ZXh0V2luZG93ID0gb3JpZ2luYWxDaGF0Lm1ldGFkYXRhLmNvbnRleHRXaW5kb3c7XG5cbiAgICAgIGNvbnN0IGNvbnN0cnVjdG9yU2V0dGluZ3M6IENoYXRDb25zdHJ1Y3RvclNldHRpbmdzID0geyAuLi50aGlzLnBsdWdpbi5zZXR0aW5ncyB9O1xuICAgICAgY29uc3QgY2xvbmVkQ2hhdCA9IG5ldyBDaGF0KHRoaXMuYWRhcHRlciwgY29uc3RydWN0b3JTZXR0aW5ncywgY2xvbmVkRGF0YSwgbmV3RmlsZVBhdGgsIHRoaXMubG9nZ2VyKTtcblxuICAgICAgY29uc3Qgc3RvcmVkTWV0YTogQ2hhdFNlc3Npb25TdG9yZWQgPSB7XG4gICAgICAgIG5hbWU6IGNsb25lZERhdGEubWV0YWRhdGEubmFtZSxcbiAgICAgICAgbGFzdE1vZGlmaWVkOiBjbG9uZWREYXRhLm1ldGFkYXRhLmxhc3RNb2RpZmllZCxcbiAgICAgICAgY3JlYXRlZEF0OiBjbG9uZWREYXRhLm1ldGFkYXRhLmNyZWF0ZWRBdCxcbiAgICAgICAgbW9kZWxOYW1lOiBjbG9uZWREYXRhLm1ldGFkYXRhLm1vZGVsTmFtZSxcbiAgICAgICAgc2VsZWN0ZWRSb2xlUGF0aDogY2xvbmVkRGF0YS5tZXRhZGF0YS5zZWxlY3RlZFJvbGVQYXRoLFxuICAgICAgICB0ZW1wZXJhdHVyZTogY2xvbmVkRGF0YS5tZXRhZGF0YS50ZW1wZXJhdHVyZSxcbiAgICAgICAgY29udGV4dFdpbmRvdzogY2xvbmVkRGF0YS5tZXRhZGF0YS5jb250ZXh0V2luZG93LFxuICAgICAgfTtcbiAgICAgIHRoaXMuY2hhdEluZGV4W25ld0lkXSA9IHN0b3JlZE1ldGE7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0SW5kZXgoKTtcbiAgICAgIC8vIHRoaXMucGx1Z2luLmVtaXQoXCJjaGF0LWxpc3QtdXBkYXRlZFwiKTtcblxuICAgICAgY29uc3Qgc2F2ZWRJbW1lZGlhdGVseSA9IGF3YWl0IGNsb25lZENoYXQuc2F2ZUltbWVkaWF0ZWx5KCk7XG4gICAgICBpZiAoIXNhdmVkSW1tZWRpYXRlbHkpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuY2hhdEluZGV4W25ld0lkXTtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEluZGV4KCk7XG4gICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJjaGF0LWxpc3QtdXBkYXRlZFwiKTtcbiAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBzYXZlIHRoZSBjbG9uZWQgY2hhdCBmaWxlIGZvciAke25ld0lkfSBhdCAke25ld0ZpbGVQYXRofS4gUmVtb3ZlZCBmcm9tIGluZGV4LmApO1xuICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3I6IEZhaWxlZCB0byBzYXZlIHRoZSBjbG9uZWQgY2hhdCBmaWxlLlwiKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIHRoaXMubG9hZGVkQ2hhdHNbbmV3SWRdID0gY2xvbmVkQ2hhdDtcbiAgICAgIGF3YWl0IHRoaXMuc2V0QWN0aXZlQ2hhdChuZXdJZCk7XG5cbiAgICAgIHJldHVybiBjbG9uZWRDaGF0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihcIkVycm9yIGNsb25pbmcgY2hhdDpcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZShcIkFuIGVycm9yIG9jY3VycmVkIHdoaWxlIGNsb25pbmcgdGhlIGNoYXQuXCIpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZGVsZXRlTWVzc2FnZXNBZnRlcihjaGF0SWQ6IHN0cmluZywgbWVzc2FnZUluZGV4VG9EZWxldGVBZnRlcjogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgY2hhdCA9IGF3YWl0IHRoaXMuZ2V0Q2hhdChjaGF0SWQpO1xuICAgIGlmICghY2hhdCkge1xuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYENhbm5vdCBkZWxldGUgbWVzc2FnZXM6IENoYXQgJHtjaGF0SWR9IG5vdCBmb3VuZC5gKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAobWVzc2FnZUluZGV4VG9EZWxldGVBZnRlciA+PSBjaGF0Lm1lc3NhZ2VzLmxlbmd0aCAtIDEpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAobWVzc2FnZUluZGV4VG9EZWxldGVBZnRlciA8IC0xKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxMZW5ndGggPSBjaGF0Lm1lc3NhZ2VzLmxlbmd0aDtcbiAgICBjb25zdCB0YXJnZXRMZW5ndGggPSBtZXNzYWdlSW5kZXhUb0RlbGV0ZUFmdGVyICsgMTtcbiAgICBjaGF0Lm1lc3NhZ2VzLmxlbmd0aCA9IHRhcmdldExlbmd0aDtcblxuICAgIGNoYXQudXBkYXRlTWV0YWRhdGEoe30pO1xuXG4gICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEFuZFVwZGF0ZUluZGV4KGNoYXQpO1xuXG4gICAgaWYgKHRoaXMuYWN0aXZlQ2hhdElkID09PSBjaGF0SWQpIHtcbiAgICAgIHRoaXMuYWN0aXZlQ2hhdCA9IGNoYXQ7XG5cbiAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJhY3RpdmUtY2hhdC1jaGFuZ2VkXCIsIHsgY2hhdElkOiBjaGF0SWQsIGNoYXQ6IGNoYXQgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBhc3luYyBkZWxldGVNZXNzYWdlQnlUaW1lc3RhbXAoY2hhdElkOiBzdHJpbmcsIHRpbWVzdGFtcFRvRGVsZXRlOiBEYXRlKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgY2hhdCA9IGF3YWl0IHRoaXMuZ2V0Q2hhdChjaGF0SWQpO1xuICAgIGlmICghY2hhdCkge1xuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYENhbm5vdCBkZWxldGUgbWVzc2FnZTogQ2hhdCAke2NoYXRJZH0gbm90IGZvdW5kLmApO1xuICAgICAgbmV3IE5vdGljZShgRXJyb3I6IENoYXQgJHtjaGF0SWR9IG5vdCBmb3VuZC5gKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCB0aW1lVGFyZ2V0ID0gdGltZXN0YW1wVG9EZWxldGUuZ2V0VGltZSgpO1xuICAgIGNvbnN0IHRvbGVyYW5jZSA9IDEwMDA7IC8vIDEgc2Vjb25kXG4gICAgbGV0IG1lc3NhZ2VJbmRleCA9IC0xO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGF0Lm1lc3NhZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBtZXNzYWdlVGltZSA9IGNoYXQubWVzc2FnZXNbaV0udGltZXN0YW1wLmdldFRpbWUoKTtcbiAgICAgIGlmICghaXNOYU4obWVzc2FnZVRpbWUpICYmIE1hdGguYWJzKG1lc3NhZ2VUaW1lIC0gdGltZVRhcmdldCkgPCB0b2xlcmFuY2UpIHtcbiAgICAgICAgbWVzc2FnZUluZGV4ID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9IGVsc2UgaWYgKGlzTmFOKG1lc3NhZ2VUaW1lKSkge1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChtZXNzYWdlSW5kZXggPT09IC0xKSB7XG4gICAgICBuZXcgTm90aWNlKFwiTWVzc2FnZSBub3QgZm91bmQuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4gX3BlcmZvcm1EZWxldGVNZXNzYWdlQnlJbmRleCwg0Y/QutC40Lkg0LLQttC1INGW0YHQvdGD0ZQg0ZYg0L7QsdGA0L7QsdC70Y/RlCBjaGF0IG9iamVjdFxuICAgIHJldHVybiBhd2FpdCB0aGlzLl9wZXJmb3JtRGVsZXRlTWVzc2FnZUJ5SW5kZXgoY2hhdCwgbWVzc2FnZUluZGV4KTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgX3BlcmZvcm1EZWxldGVNZXNzYWdlQnlJbmRleChjaGF0OiBDaGF0LCBtZXNzYWdlSW5kZXg6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IGNoYXRJZCA9IGNoYXQubWV0YWRhdGEuaWQ7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChtZXNzYWdlSW5kZXggPCAwIHx8IG1lc3NhZ2VJbmRleCA+PSBjaGF0Lm1lc3NhZ2VzLmxlbmd0aCkge1xuICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihcbiAgICAgICAgICBgSW52YWxpZCBtZXNzYWdlIGluZGV4ICR7bWVzc2FnZUluZGV4fSBwcm92aWRlZCB0byBfcGVyZm9ybURlbGV0ZU1lc3NhZ2VCeUluZGV4IGZvciBjaGF0ICR7Y2hhdElkfS5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZGVsZXRlZE1lc3NhZ2UgPSBjaGF0Lm1lc3NhZ2VzLnNwbGljZShtZXNzYWdlSW5kZXgsIDEpWzBdO1xuXG4gICAgICBjaGF0LnVwZGF0ZU1ldGFkYXRhKHt9KTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRBbmRVcGRhdGVJbmRleChjaGF0KTtcblxuICAgICAgaWYgKHRoaXMuYWN0aXZlQ2hhdElkID09PSBjaGF0SWQpIHtcbiAgICAgICAgdGhpcy5hY3RpdmVDaGF0ID0gY2hhdDtcblxuICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwiYWN0aXZlLWNoYXQtY2hhbmdlZFwiLCB7IGNoYXRJZDogY2hhdElkLCBjaGF0OiBjaGF0IH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoZGVsZXRlZE1lc3NhZ2UpIHtcbiAgICAgICAgdGhpcy5wbHVnaW4uZW1pdChcIm1lc3NhZ2UtZGVsZXRlZFwiLCB7IGNoYXRJZDogY2hhdElkLCB0aW1lc3RhbXA6IGRlbGV0ZWRNZXNzYWdlLnRpbWVzdGFtcCB9KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBFcnJvciBkdXJpbmcgbWVzc2FnZSBkZWxldGlvbiBieSBpbmRleCAke21lc3NhZ2VJbmRleH0gZm9yIGNoYXQgJHtjaGF0SWR9OmAsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBkZWxldGluZyBtZXNzYWdlLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjbGVhckNoYXRNZXNzYWdlc0J5SWQoY2hhdElkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBjaGF0ID0gYXdhaXQgdGhpcy5nZXRDaGF0KGNoYXRJZCk7XG4gICAgaWYgKCFjaGF0KSB7XG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihgQ2Fubm90IGNsZWFyIG1lc3NhZ2VzOiBDaGF0ICR7Y2hhdElkfSBub3QgZm91bmQuYCk7XG4gICAgICBuZXcgTm90aWNlKGBFcnJvcjogQ2hhdCAke2NoYXRJZH0gbm90IGZvdW5kLmApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmIChjaGF0Lm1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNoYXQuY2xlYXJNZXNzYWdlcygpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEFuZFVwZGF0ZUluZGV4KGNoYXQpO1xuXG4gICAgICBjb25zdCBpc0FjdGl2ZSA9IGNoYXRJZCA9PT0gdGhpcy5hY3RpdmVDaGF0SWQ7XG4gICAgICBpZiAoaXNBY3RpdmUpIHtcbiAgICAgICAgdGhpcy5hY3RpdmVDaGF0ID0gY2hhdDtcblxuICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwibWVzc2FnZXMtY2xlYXJlZFwiLCBjaGF0SWQpO1xuICAgICAgfVxuICAgICAgbmV3IE5vdGljZShgTWVzc2FnZXMgY2xlYXJlZCBmb3IgY2hhdCBcIiR7Y2hhdC5tZXRhZGF0YS5uYW1lfVwiLmApO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBFcnJvciBkdXJpbmcgbWVzc2FnZSBjbGVhcmluZyBwcm9jZXNzIGZvciBjaGF0ICR7Y2hhdElkfTpgLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKFwiRXJyb3IgY2xlYXJpbmcgbWVzc2FnZXMuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlbmFtZUNoYXQoY2hhdElkOiBzdHJpbmcsIG5ld05hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IHRyaW1tZWROYW1lID0gbmV3TmFtZS50cmltKCk7XG4gICAgaWYgKCF0cmltbWVkTmFtZSkge1xuICAgICAgbmV3IE5vdGljZShcIkNoYXQgbmFtZSBjYW5ub3QgYmUgZW1wdHkuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoL1tcXFxcLz86KlwiPD58XS8udGVzdCh0cmltbWVkTmFtZSkpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJDaGF0IG5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBjaGF0ID0gYXdhaXQgdGhpcy5nZXRDaGF0KGNoYXRJZCk7XG5cbiAgICBpZiAoIWNoYXQpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBDYW5ub3QgcmVuYW1lOiBDaGF0ICR7Y2hhdElkfSBub3QgZm91bmQuYCk7XG4gICAgICBuZXcgTm90aWNlKFwiQ2hhdCBub3QgZm91bmQuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmIChjaGF0Lm1ldGFkYXRhLm5hbWUgPT09IHRyaW1tZWROYW1lKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgY2hhbmdlZCA9IGNoYXQudXBkYXRlTWV0YWRhdGEoeyBuYW1lOiB0cmltbWVkTmFtZSB9KTtcblxuICAgICAgaWYgKGNoYW5nZWQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEFuZFVwZGF0ZUluZGV4KGNoYXQpO1xuXG4gICAgICAgIGlmICh0aGlzLmFjdGl2ZUNoYXRJZCA9PT0gY2hhdElkKSB7XG4gICAgICAgICAgdGhpcy5hY3RpdmVDaGF0ID0gY2hhdDtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwiYWN0aXZlLWNoYXQtY2hhbmdlZFwiLCB7IGNoYXRJZDogY2hhdElkLCBjaGF0OiBjaGF0IH0pO1xuICAgICAgICB9XG4gICAgICAgIG5ldyBOb3RpY2UoYENoYXQgcmVuYW1lZCB0byBcIiR7dHJpbW1lZE5hbWV9XCIuYCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihgRXJyb3IgcmVuYW1pbmcgY2hhdCAke2NoYXRJZH06YCwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZShcIkFuIGVycm9yIG9jY3VycmVkIHdoaWxlIHJlbmFtaW5nIHRoZSBjaGF0LlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvLyAtLS0g0J3QntCS0IYg0JzQldCi0J7QlNCYINCU0JvQryDQn9CQ0J/QntCaIC0tLVxuXG4gIC8qKlxuICAgKiDQodGC0LLQvtGA0Y7RlCDQvdC+0LLRgyDQv9Cw0L/QutGDINC30LAg0LLQutCw0LfQsNC90LjQvCDRiNC70Y/RhdC+0LwuXG4gICAqIEBwYXJhbSBmb2xkZXJQYXRoINCf0L7QstC90LjQuSwg0L3QvtGA0LzQsNC70ZbQt9C+0LLQsNC90LjQuSDRiNC70Y/RhSDQtNC+INC/0LDQv9C60LgsINGP0LrRgyDQv9C+0YLRgNGW0LHQvdC+INGB0YLQstC+0YDQuNGC0LguXG4gICAqIEByZXR1cm5zIHRydWUsINGP0LrRidC+INC/0LDQv9C60LAg0YPRgdC/0ZbRiNC90L4g0YHRgtCy0L7RgNC10L3QsCwgZmFsc2Ug0LIg0ZbQvdGI0L7QvNGDINCy0LjQv9Cw0LTQutGDLlxuICAgKi9cbiAgYXN5bmMgY3JlYXRlRm9sZGVyKGZvbGRlclBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplUGF0aChmb2xkZXJQYXRoKTtcblxuICAgIC8vINCf0LXRgNC10LLRltGA0LrQsCDQsdCw0LfQvtCy0LjRhSDQv9GA0LDQstC40LtcbiAgICBpZiAoIW5vcm1hbGl6ZWRQYXRoIHx8IG5vcm1hbGl6ZWRQYXRoID09PSBcIi9cIiB8fCBub3JtYWxpemVkUGF0aCA9PT0gXCIuXCIpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKFwiQ2Fubm90IGNyZWF0ZSBmb2xkZXIgYXQgcm9vdCBvciB3aXRoIGVtcHR5L2RvdCBwYXRoLlwiKTtcbiAgICAgIG5ldyBOb3RpY2UoXCJJbnZhbGlkIGZvbGRlciBwYXRoLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIuLlwiKSB8fCBub3JtYWxpemVkUGF0aC5pbmNsdWRlcyhcIlxcMFwiKSkge1xuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYEF0dGVtcHRlZCB0byBjcmVhdGUgZm9sZGVyIHdpdGggaW52YWxpZCBwYXRoOiAke25vcm1hbGl6ZWRQYXRofWApO1xuICAgICAgbmV3IE5vdGljZShcIkludmFsaWQgY2hhcmFjdGVycyBvciBwYXRoIHRyYXZlcnNhbCBkZXRlY3RlZC5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHMobm9ybWFsaXplZFBhdGgpO1xuICAgICAgaWYgKGV4aXN0cykge1xuICAgICAgICBuZXcgTm90aWNlKGBcIiR7bm9ybWFsaXplZFBhdGguc3BsaXQoXCIvXCIpLnBvcCgpfVwiIGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlci5ta2Rpcihub3JtYWxpemVkUGF0aCk7XG5cbiAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJjaGF0LWxpc3QtdXBkYXRlZFwiKTsgLy8g0KHQv9C+0LLRltGJ0LDRlNC80L4gVUkg0L/RgNC+INC30LzRltC90LhcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSBcIkVQRVJNXCIgfHwgZXJyb3IuY29kZSA9PT0gXCJFQUNDRVNcIikge1xuICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihgUGVybWlzc2lvbiBlcnJvciBjcmVhdGluZyBmb2xkZXIgJHtub3JtYWxpemVkUGF0aH06YCwgZXJyb3IpO1xuICAgICAgICBuZXcgTm90aWNlKGBQZXJtaXNzaW9uIGVycm9yIGNyZWF0aW5nIGZvbGRlci5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBFcnJvciBjcmVhdGluZyBmb2xkZXIgJHtub3JtYWxpemVkUGF0aH06YCwgZXJyb3IpO1xuICAgICAgICBuZXcgTm90aWNlKGBGYWlsZWQgdG8gY3JlYXRlIGZvbGRlcjogJHtlcnJvci5tZXNzYWdlIHx8IFwiVW5rbm93biBlcnJvclwifWApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiDQn9C10YDQtdC50LzQtdC90L7QstGD0ZQg0LDQsdC+INC/0LXRgNC10LzRltGJ0YPRlCDQv9Cw0L/QutGDLlxuICAgKiDQktCw0LbQu9C40LLQvjog0KbQtdC5INC80LXRgtC+0LQg0L3QtSDQvtC90L7QstC70Y7RlCDRltC90LTQtdC60YEgY2hhdEluZGV4INCw0LLRgtC+0LzQsNGC0LjRh9C90L4g0LTQu9GPINGH0LDRgtGW0LIg0LLRgdC10YDQtdC00LjQvdGWINC/0LDQv9C60LguXG4gICAqINCd0LDQudC60YDQsNGJ0LUg0LLQuNC60LvQuNC60LDRgtC4IHJlYnVpbGRJbmRleEZyb21GaWxlcygpINC/0ZbRgdC70Y8g0YPRgdC/0ZbRiNC90L7Qs9C+INC/0LXRgNC10LnQvNC10L3Rg9Cy0LDQvdC90Y8g0LDQsdC+INC/0L7QutC70LDQtNCw0YLQuNGB0Y9cbiAgICog0L3QsCDRgtC1LCDRidC+IGdldENoYXRIaWVyYXJjaHkoKSDQt9Cx0LjRgNCw0YLQuNC80LUg0LDQutGC0YPQsNC70YzQvdGDINGB0YLRgNGD0LrRgtGD0YDRgy5cbiAgICogQHBhcmFtIG9sZFBhdGgg0J/QvtCy0L3QuNC5LCDQvdC+0YDQvNCw0LvRltC30L7QstCw0L3QuNC5INGB0YLQsNGA0LjQuSDRiNC70Y/RhSDQtNC+INC/0LDQv9C60LguXG4gICAqIEBwYXJhbSBuZXdQYXRoINCf0L7QstC90LjQuSwg0L3QvtGA0LzQsNC70ZbQt9C+0LLQsNC90LjQuSDQvdC+0LLQuNC5INGI0LvRj9GFINC00L4g0L/QsNC/0LrQuC5cbiAgICogQHJldHVybnMgdHJ1ZSwg0Y/QutGJ0L4g0L/QtdGA0LXQudC80LXQvdGD0LLQsNC90L3Rjy/Qv9C10YDQtdC80ZbRidC10L3QvdGPINGD0YHQv9GW0YjQvdC1LCBmYWxzZSDQsiDRltC90YjQvtC80YMg0LLQuNC/0LDQtNC60YMuXG4gICAqL1xuICBhc3luYyByZW5hbWVGb2xkZXIob2xkUGF0aDogc3RyaW5nLCBuZXdQYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBub3JtT2xkUGF0aCA9IG5vcm1hbGl6ZVBhdGgob2xkUGF0aCk7XG4gICAgY29uc3Qgbm9ybU5ld1BhdGggPSBub3JtYWxpemVQYXRoKG5ld1BhdGgpO1xuXG4gICAgLy8g0J/QtdGA0LXQstGW0YDQutC4XG4gICAgaWYgKCFub3JtT2xkUGF0aCB8fCBub3JtT2xkUGF0aCA9PT0gXCIvXCIgfHwgIW5vcm1OZXdQYXRoIHx8IG5vcm1OZXdQYXRoID09PSBcIi9cIikge1xuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoXCJJbnZhbGlkIHBhdGhzIHByb3ZpZGVkIGZvciByZW5hbWUgb3BlcmF0aW9uLlwiKTtcbiAgICAgIG5ldyBOb3RpY2UoXCJDYW5ub3QgcmVuYW1lIHJvb3QgZm9sZGVyIG9yIHVzZSBlbXB0eSBwYXRoLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKG5vcm1PbGRQYXRoID09PSBub3JtTmV3UGF0aCkge1xuICAgICAgcmV0dXJuIHRydWU7IC8vINCS0LLQsNC20LDRlNC80L4g0YPRgdC/0ZbRhdC+0LwsINCx0L4g0YbRltC70YzQvtCy0LjQuSDRgdGC0LDQvSDQtNC+0YHRj9Cz0L3Rg9GC0L5cbiAgICB9XG4gICAgaWYgKG5vcm1OZXdQYXRoLnN0YXJ0c1dpdGgobm9ybU9sZFBhdGggKyBcIi9cIikpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBDYW5ub3QgbW92ZSBmb2xkZXIgXCIke25vcm1PbGRQYXRofVwiIGluc2lkZSBpdHNlbGYgKFwiJHtub3JtTmV3UGF0aH1cIikuYCk7XG4gICAgICBuZXcgTm90aWNlKFwiQ2Fubm90IG1vdmUgYSBmb2xkZXIgaW5zaWRlIGl0c2VsZi5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG9sZEV4aXN0cyA9IGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHMobm9ybU9sZFBhdGgpO1xuICAgICAgaWYgKCFvbGRFeGlzdHMpIHtcbiAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYFNvdXJjZSBmb2xkZXIgZm9yIHJlbmFtZSBkb2VzIG5vdCBleGlzdDogJHtub3JtT2xkUGF0aH1gKTtcbiAgICAgICAgbmV3IE5vdGljZShcIkZvbGRlciB0byByZW5hbWUgbm90IGZvdW5kLlwiKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgY29uc3Qgb2xkU3RhdCA9IGF3YWl0IHRoaXMuYWRhcHRlci5zdGF0KG5vcm1PbGRQYXRoKTtcbiAgICAgIGlmIChvbGRTdGF0Py50eXBlICE9PSBcImZvbGRlclwiKSB7XG4gICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBTb3VyY2UgcGF0aCBpcyBub3QgYSBmb2xkZXI6ICR7bm9ybU9sZFBhdGh9YCk7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJJdGVtIHRvIHJlbmFtZSBpcyBub3QgYSBmb2xkZXIuXCIpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5ld0V4aXN0cyA9IGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHMobm9ybU5ld1BhdGgpO1xuICAgICAgaWYgKG5ld0V4aXN0cykge1xuICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihgVGFyZ2V0IHBhdGggZm9yIHJlbmFtZSBhbHJlYWR5IGV4aXN0czogJHtub3JtTmV3UGF0aH1gKTtcbiAgICAgICAgbmV3IE5vdGljZShgXCIke25vcm1OZXdQYXRoLnNwbGl0KFwiL1wiKS5wb3AoKX1cIiBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICAvLyDQktC40LrQvtC90YPRlNC80L4g0L/QtdGA0LXQudC80LXQvdGD0LLQsNC90L3Rjy/Qv9C10YDQtdC80ZbRidC10L3QvdGPXG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucmVuYW1lKG5vcm1PbGRQYXRoLCBub3JtTmV3UGF0aCk7XG5cbiAgICAgIC8vINCe0L3QvtCy0LvRjtGU0LzQviDRiNC70Y/RhdC4INCyINC30LDQstCw0L3RgtCw0LbQtdC90LjRhSDRh9Cw0YLQsNGFIChsb2FkZWRDaGF0cyksINGP0LrRidC+INCy0L7QvdC4INCx0YPQu9C4INCy0YHQtdGA0LXQtNC40L3RllxuICAgICAgT2JqZWN0LnZhbHVlcyh0aGlzLmxvYWRlZENoYXRzKS5mb3JFYWNoKGNoYXQgPT4ge1xuICAgICAgICBpZiAoY2hhdC5maWxlUGF0aC5zdGFydHNXaXRoKG5vcm1PbGRQYXRoICsgXCIvXCIpKSB7XG4gICAgICAgICAgY29uc3QgcmVsYXRpdmVQYXRoID0gY2hhdC5maWxlUGF0aC5zdWJzdHJpbmcobm9ybU9sZFBhdGgubGVuZ3RoKTtcbiAgICAgICAgICBjb25zdCB1cGRhdGVkUGF0aCA9IG5vcm1hbGl6ZVBhdGgobm9ybU5ld1BhdGggKyByZWxhdGl2ZVBhdGgpO1xuXG4gICAgICAgICAgY2hhdC5maWxlUGF0aCA9IHVwZGF0ZWRQYXRoOyAvLyDQntC90L7QstC70Y7RlNC80L4g0YjQu9GP0YUg0YMg0LrQtdGI0L7QstCw0L3QvtC80YMg0L7QsSfRlNC60YLRllxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgdGhpcy5wbHVnaW4uZW1pdChcImNoYXQtbGlzdC11cGRhdGVkXCIpOyAvLyDQodC/0L7QstGW0YnQsNGU0LzQviBVSVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFwiRVBFUk1cIiB8fCBlcnJvci5jb2RlID09PSBcIkVBQ0NFU1wiKSB7XG4gICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBQZXJtaXNzaW9uIGVycm9yIHJlbmFtaW5nIGZvbGRlciAke25vcm1PbGRQYXRofSB0byAke25vcm1OZXdQYXRofTpgLCBlcnJvcik7XG4gICAgICAgIG5ldyBOb3RpY2UoYFBlcm1pc3Npb24gZXJyb3IgcmVuYW1pbmcgZm9sZGVyLmApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYEVycm9yIHJlbmFtaW5nIGZvbGRlciAke25vcm1PbGRQYXRofSB0byAke25vcm1OZXdQYXRofTpgLCBlcnJvcik7XG4gICAgICAgIG5ldyBOb3RpY2UoYEZhaWxlZCB0byByZW5hbWUgZm9sZGVyOiAke2Vycm9yLm1lc3NhZ2UgfHwgXCJVbmtub3duIGVycm9yXCJ9YCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqINCg0LXQutGD0YDRgdC40LLQvdC+INCy0LjQtNCw0LvRj9GUINC/0LDQv9C60YMg0YLQsCDQstC10YHRjCDRl9GXINCy0LzRltGB0YIgKNC/0ZbQtNC/0LDQv9C60Lgg0YLQsCDRh9Cw0YLQuCkuXG4gICAqIEBwYXJhbSBmb2xkZXJQYXRoINCf0L7QstC90LjQuSwg0L3QvtGA0LzQsNC70ZbQt9C+0LLQsNC90LjQuSDRiNC70Y/RhSDQtNC+INC/0LDQv9C60LgsINGP0LrRgyDQv9C+0YLRgNGW0LHQvdC+INCy0LjQtNCw0LvQuNGC0LguXG4gICAqIEByZXR1cm5zIHRydWUsINGP0LrRidC+INC/0LDQv9C60LAg0YLQsCDRl9GXINCy0LzRltGB0YIg0YPRgdC/0ZbRiNC90L4g0LLQuNC00LDQu9C10L3RliwgZmFsc2Ug0LIg0ZbQvdGI0L7QvNGDINCy0LjQv9Cw0LTQutGDLlxuICAgKi9cbiAgYXN5bmMgZGVsZXRlRm9sZGVyKGZvbGRlclBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplUGF0aChmb2xkZXJQYXRoKTtcblxuICAgIC8vINCf0LXRgNC10LLRltGA0LrQsCwg0YfQuCDRiNC70Y/RhSDQstCw0LvRltC00L3QuNC5INGWINC90LUg0ZQg0LrQvtGA0LXQvdC10Lwg0YHRhdC+0LLQuNGJ0LAg0LDQsdC+INC+0YHQvdC+0LLQvdC+0Y4g0L/QsNC/0LrQvtGOINGH0LDRgtGW0LJcbiAgICBpZiAoIW5vcm1hbGl6ZWRQYXRoIHx8IG5vcm1hbGl6ZWRQYXRoID09PSBcIi9cIiB8fCBub3JtYWxpemVkUGF0aCA9PT0gXCIuXCIpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBBdHRlbXB0ZWQgdG8gZGVsZXRlIHJvb3Qgb3IgaW52YWxpZCBmb2xkZXIgcGF0aDogJHtub3JtYWxpemVkUGF0aH1gKTtcbiAgICAgIG5ldyBOb3RpY2UoXCJDYW5ub3QgZGVsZXRlIHRoaXMgZm9sZGVyLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLy8g0JTQvtC00LDRgtC60L7QstCwINC/0LXRgNC10LLRltGA0LrQsCDQvdCwINC+0YHQvdC+0LLQvdGDINC/0LDQv9C60YMg0YfQsNGC0ZbQslxuICAgIGlmIChub3JtYWxpemVkUGF0aCA9PT0gdGhpcy5jaGF0c0ZvbGRlclBhdGgpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBBdHRlbXB0ZWQgdG8gZGVsZXRlIHRoZSBtYWluIGNoYXQgaGlzdG9yeSBmb2xkZXI6ICR7bm9ybWFsaXplZFBhdGh9YCk7XG4gICAgICBuZXcgTm90aWNlKFwiQ2Fubm90IGRlbGV0ZSB0aGUgbWFpbiBjaGF0IGhpc3RvcnkgZm9sZGVyIHNldCBpbiBzZXR0aW5ncy5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHMobm9ybWFsaXplZFBhdGgpO1xuICAgICAgaWYgKCFleGlzdHMpIHtcbiAgICAgICAgLy8g0JLQstCw0LbQsNGU0LzQviDRg9GB0L/RltGF0L7QvCwg0Y/QutGJ0L4g0L/QsNC/0LrQuCDQstC20LUg0L3QtdC80LDRlFxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuc3RhdChub3JtYWxpemVkUGF0aCk7XG4gICAgICBpZiAoc3RhdD8udHlwZSAhPT0gXCJmb2xkZXJcIikge1xuICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihgUGF0aCB0byBkZWxldGUgaXMgbm90IGEgZm9sZGVyOiAke25vcm1hbGl6ZWRQYXRofWApO1xuICAgICAgICBuZXcgTm90aWNlKFwiSXRlbSB0byBkZWxldGUgaXMgbm90IGEgZm9sZGVyLlwiKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICAvLyAtLS0g0J7Rh9C40YnQtdC90L3RjyDRltC90LTQtdC60YHRgyDRgtCwINC60LXRiNGDINCf0JXQoNCV0JQg0LLQuNC00LDQu9C10L3QvdGP0LwgLS0tXG5cbiAgICAgIGNvbnN0IGNoYXRJZHNUb0RlbGV0ZTogc3RyaW5nW10gPSBbXTtcbiAgICAgIC8vINCk0YPQvdC60YbRltGPINC00LvRjyDRgNC10LrRg9GA0YHQuNCy0L3QvtCz0L4g0LfQsdC+0YDRgyBJRCDRh9Cw0YLRltCyXG4gICAgICBjb25zdCBjb2xsZWN0Q2hhdElkcyA9IGFzeW5jIChjdXJyZW50UGF0aDogc3RyaW5nKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgbGlzdCA9IGF3YWl0IHRoaXMuYWRhcHRlci5saXN0KGN1cnJlbnRQYXRoKTtcbiAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgbGlzdC5maWxlcykge1xuICAgICAgICAgICAgY29uc3QgZmlsZU5hbWUgPSBmaWxlLnN1YnN0cmluZyhmaWxlLmxhc3RJbmRleE9mKFwiL1wiKSArIDEpO1xuICAgICAgICAgICAgaWYgKGZpbGVOYW1lLmVuZHNXaXRoKFwiLmpzb25cIikpIHtcbiAgICAgICAgICAgICAgY29uc3QgY2hhdElkID0gZmlsZU5hbWUuc2xpY2UoMCwgLTUpO1xuICAgICAgICAgICAgICAvLyDQn9C10YDQtdCy0ZbRgNGP0ZTQvNC+LCDRh9C4INGUINGC0LDQutC40LkgSUQg0LIg0ZbQvdC00LXQutGB0ZZcbiAgICAgICAgICAgICAgaWYgKHRoaXMuY2hhdEluZGV4W2NoYXRJZF0pIHtcbiAgICAgICAgICAgICAgICBjaGF0SWRzVG9EZWxldGUucHVzaChjaGF0SWQpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGZvciAoY29uc3QgZm9sZGVyIG9mIGxpc3QuZm9sZGVycykge1xuICAgICAgICAgICAgYXdhaXQgY29sbGVjdENoYXRJZHMoZm9sZGVyKTsgLy8g0KDQtdC60YPRgNGB0ZbRj1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAobGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYEVycm9yIGxpc3RpbmcgZm9sZGVyICR7Y3VycmVudFBhdGh9IGR1cmluZyBwcmUtZGVsZXRlIGNsZWFudXA6YCwgbGlzdEVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGF3YWl0IGNvbGxlY3RDaGF0SWRzKG5vcm1hbGl6ZWRQYXRoKTsgLy8g0JfQsdC40YDQsNGU0LzQviBJRFxuXG4gICAgICBsZXQgYWN0aXZlQ2hhdFdhc0RlbGV0ZWQgPSBmYWxzZTtcbiAgICAgIGNoYXRJZHNUb0RlbGV0ZS5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgaWYgKHRoaXMuY2hhdEluZGV4W2lkXSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNoYXRJbmRleFtpZF07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMubG9hZGVkQ2hhdHNbaWRdKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMubG9hZGVkQ2hhdHNbaWRdO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmFjdGl2ZUNoYXRJZCA9PT0gaWQpIHtcbiAgICAgICAgICBhY3RpdmVDaGF0V2FzRGVsZXRlZCA9IHRydWU7XG4gICAgICAgICAgdGhpcy5hY3RpdmVDaGF0SWQgPSBudWxsOyAvLyDQodC60LjQtNCw0ZTQvNC+INCw0LrRgtC40LLQvdC40LkgSURcbiAgICAgICAgICB0aGlzLmFjdGl2ZUNoYXQgPSBudWxsO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIC8vINCX0LHQtdGA0ZbQs9Cw0ZTQvNC+INC30LzRltC90LXQvdC40Lkg0ZbQvdC00LXQutGBXG4gICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0SW5kZXgoKTtcbiAgICAgIC8vINCv0LrRidC+INCw0LrRgtC40LLQvdC40Lkg0YfQsNGCINCx0YPQsiDQstC40LTQsNC70LXQvdC40LksINC30LHQtdGA0ZbQs9Cw0ZTQvNC+IG51bGxcbiAgICAgIGlmIChhY3RpdmVDaGF0V2FzRGVsZXRlZCkge1xuICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YUtleShBQ1RJVkVfQ0hBVF9JRF9LRVksIG51bGwpO1xuICAgICAgfVxuICAgICAgLy8gLS0tINCa0ZbQvdC10YbRjCDQvtGH0LjRidC10L3QvdGPIC0tLVxuXG4gICAgICAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INGA0LXQutGD0YDRgdC40LLQvdC1INCy0LjQtNCw0LvQtdC90L3RjyDQsNC00LDQv9GC0LXRgNCwXG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucm1kaXIobm9ybWFsaXplZFBhdGgsIHRydWUpO1xuXG4gICAgICAvLyDQodC/0L7QstGW0YnQsNGU0LzQviBVSSDQv9GA0L4g0LfQvNGW0L3QuCAo0L7RgdC60ZbQu9GM0LrQuCDRltC90LTQtdC60YEg0L7QvdC+0LLQu9C10L3QvilcbiAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJjaGF0LWxpc3QtdXBkYXRlZFwiKTtcbiAgICAgIC8vINCv0LrRidC+INCw0LrRgtC40LLQvdC40Lkg0YfQsNGCINGB0LrQuNC90YPRgtC+LCDRgdC/0L7QstGW0YnQsNGU0LzQviDQv9GA0L4g0YbQtVxuICAgICAgaWYgKGFjdGl2ZUNoYXRXYXNEZWxldGVkKSB7XG4gICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJhY3RpdmUtY2hhdC1jaGFuZ2VkXCIsIHsgY2hhdElkOiBudWxsLCBjaGF0OiBudWxsIH0pO1xuICAgICAgICAvLyDQodC/0YDQvtCx0YPQstCw0YLQuCDQsNC60YLQuNCy0YPQstCw0YLQuCDQvdCw0YHRgtGD0L/QvdC40Lkg0LTQvtGB0YLRg9C/0L3QuNC5INGH0LDRgiAo0L3QtdC+0LHQvtCyJ9GP0LfQutC+0LLQviDRgtGD0YIsINCx0L4gU2lkZWJhck1hbmFnZXIg0YbQtSDRgNC+0LHQuNGC0YwpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSBcIkVQRVJNXCIgfHwgZXJyb3IuY29kZSA9PT0gXCJFQUNDRVNcIikge1xuICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihgUGVybWlzc2lvbiBlcnJvciBkZWxldGluZyBmb2xkZXIgJHtub3JtYWxpemVkUGF0aH06YCwgZXJyb3IpO1xuICAgICAgICBuZXcgTm90aWNlKGBQZXJtaXNzaW9uIGVycm9yIGRlbGV0aW5nIGZvbGRlci5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBFcnJvciBkZWxldGluZyBmb2xkZXIgJHtub3JtYWxpemVkUGF0aH06YCwgZXJyb3IpO1xuICAgICAgICBuZXcgTm90aWNlKGBGYWlsZWQgdG8gZGVsZXRlIGZvbGRlcjogJHtlcnJvci5tZXNzYWdlIHx8IFwiVW5rbm93biBlcnJvclwifWApO1xuICAgICAgfVxuICAgICAgLy8g0KHQv9GA0L7QsdGD0ZTQvNC+INC/0LXRgNC10LHRg9C00YPQstCw0YLQuCDRltC90LTQtdC60YEsINGJ0L7QsSDQstC40L/RgNCw0LLQuNGC0Lgg0LzQvtC20LvQuNCy0YMg0YDQvtC30YHQuNC90YXRgNC+0L3RltC30LDRhtGW0Y5cbiAgICAgIGF3YWl0IHRoaXMucmVidWlsZEluZGV4RnJvbUZpbGVzKCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgICAgLy8gLS0tINCS0JjQn9Cg0JDQktCb0JXQndCY0Jkg0JzQldCi0J7QlDog0J/QtdGA0LXQvNGW0YnQtdC90L3RjyDRh9Cw0YLRgyAtLS1cbiAgICBhc3luYyBtb3ZlQ2hhdChjaGF0SWQ6IHN0cmluZywgb2xkRmlsZVBhdGg6IHN0cmluZywgbmV3Rm9sZGVyUGF0aDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgICBjb25zdCBub3JtT2xkUGF0aCA9IG5vcm1hbGl6ZVBhdGgob2xkRmlsZVBhdGgpO1xuICAgICAgY29uc3Qgbm9ybU5ld0ZvbGRlclBhdGggPSBub3JtYWxpemVQYXRoKG5ld0ZvbGRlclBhdGgpO1xuICAgICAgdGhpcy5sb2dnZXIuaW5mbyhgQXR0ZW1wdGluZyB0byBtb3ZlIGNoYXQgJHtjaGF0SWR9IGZyb20gXCIke25vcm1PbGRQYXRofVwiIHRvIGZvbGRlciBcIiR7bm9ybU5ld0ZvbGRlclBhdGh9XCJgKTtcblxuICAgICAgLy8gLS0tINCe0LPQvtC70L7RiNGD0ZTQvNC+IG5ld0ZpbGVQYXRoINGC0YPRgiwg0L/QvtC30LAgdHJ5IC0tLVxuICAgICAgbGV0IG5ld0ZpbGVQYXRoOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgICAgLy8gMS4g0JLQsNC70ZbQtNCw0YbRltGPXG4gICAgICBpZiAoIWNoYXRJZCB8fCAhb2xkRmlsZVBhdGggfHwgIW5ld0ZvbGRlclBhdGgpIHtcbiAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihcIk1vdmUgY2hhdCBmYWlsZWQ6IEludmFsaWQgYXJndW1lbnRzIHByb3ZpZGVkLlwiKTtcbiAgICAgICAgICBuZXcgTm90aWNlKFwiTW92ZSBjaGF0IGZhaWxlZDogSW52YWxpZCBkYXRhLlwiKTtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIHRyeSB7XG4gICAgICAgICAgLy8g0J/QtdGA0LXQstGW0YDQutCwINGW0YHQvdGD0LLQsNC90L3RjyDQtNC20LXRgNC10LvQsFxuICAgICAgICAgIGlmICghKGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHMobm9ybU9sZFBhdGgpKSkge1xuICAgICAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihgTW92ZSBjaGF0IGZhaWxlZDogU291cmNlIGZpbGUgZG9lcyBub3QgZXhpc3Q6ICR7bm9ybU9sZFBhdGh9YCk7XG4gICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJNb3ZlIGNoYXQgZmFpbGVkOiBTb3VyY2UgZmlsZSBub3QgZm91bmQuXCIpO1xuICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5yZWJ1aWxkSW5kZXhGcm9tRmlsZXMoKTtcbiAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmVtaXQoJ2NoYXQtbGlzdC11cGRhdGVkJyk7XG4gICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgIGNvbnN0IG9sZFN0YXQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuc3RhdChub3JtT2xkUGF0aCk7XG4gICAgICAgICAgIGlmKG9sZFN0YXQ/LnR5cGUgIT09ICdmaWxlJyl7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYE1vdmUgY2hhdCBmYWlsZWQ6IFNvdXJjZSBwYXRoIGlzIG5vdCBhIGZpbGU6ICR7bm9ybU9sZFBhdGh9YCk7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIk1vdmUgY2hhdCBmYWlsZWQ6IFNvdXJjZSBpcyBub3QgYSBmaWxlLlwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgIH1cblxuICAgICAgICAgIC8vINCf0LXRgNC10LLRltGA0LrQsCDRltGB0L3Rg9Cy0LDQvdC90Y8g0YbRltC70YzQvtCy0L7RlyDQv9Cw0L/QutC4XG4gICAgICAgICAgaWYgKCEoYXdhaXQgdGhpcy5hZGFwdGVyLmV4aXN0cyhub3JtTmV3Rm9sZGVyUGF0aCkpKSB7XG4gICAgICAgICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBNb3ZlIGNoYXQgZmFpbGVkOiBUYXJnZXQgZm9sZGVyIGRvZXMgbm90IGV4aXN0OiAke25vcm1OZXdGb2xkZXJQYXRofWApO1xuICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiTW92ZSBjaGF0IGZhaWxlZDogVGFyZ2V0IGZvbGRlciBub3QgZm91bmQuXCIpO1xuICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgICBjb25zdCBuZXdTdGF0ID0gYXdhaXQgdGhpcy5hZGFwdGVyLnN0YXQobm9ybU5ld0ZvbGRlclBhdGgpO1xuICAgICAgICAgICBpZihuZXdTdGF0Py50eXBlICE9PSAnZm9sZGVyJyl7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYE1vdmUgY2hhdCBmYWlsZWQ6IFRhcmdldCBwYXRoIGlzIG5vdCBhIGZvbGRlcjogJHtub3JtTmV3Rm9sZGVyUGF0aH1gKTtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiTW92ZSBjaGF0IGZhaWxlZDogVGFyZ2V0IGlzIG5vdCBhIGZvbGRlci5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyAyLiDQktC40LfQvdCw0YfQtdC90L3RjyDQvdC+0LLQvtCz0L4g0YjQu9GP0YXRg1xuICAgICAgICAgIGNvbnN0IGZpbGVOYW1lID0gb2xkRmlsZVBhdGguc3Vic3RyaW5nKG9sZEZpbGVQYXRoLmxhc3RJbmRleE9mKCcvJykgKyAxKTtcbiAgICAgICAgICAvLyAtLS0g0J/RgNC40YHQstC+0Y7RlNC80L4g0LfQvdCw0YfQtdC90L3RjyDQvtCz0L7Qu9C+0YjQtdC90ZbQuSDQt9C80ZbQvdC90ZbQuSAtLS1cbiAgICAgICAgICBuZXdGaWxlUGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7bm9ybU5ld0ZvbGRlclBhdGh9LyR7ZmlsZU5hbWV9YCk7XG4gICAgICAgICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAgICAgICAvLyDQn9C10YDQtdCy0ZbRgNC60LAsINGH0Lgg0YTQsNC50Lsg0LLQttC1INCyINGG0ZbQu9GM0L7QstGW0Lkg0L/QsNC/0YbRllxuICAgICAgICAgIGlmIChub3JtT2xkUGF0aCA9PT0gbmV3RmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgdGhpcy5sb2dnZXIud2FybihgTW92ZSBjaGF0IHNraXBwZWQ6IFNvdXJjZSBhbmQgdGFyZ2V0IHBhdGhzIGFyZSB0aGUgc2FtZTogJHtub3JtT2xkUGF0aH1gKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gMy4g0J/QtdGA0LXQstGW0YDQutCwINC90LAg0LrQvtC90YTQu9GW0LrRgiDRltC80LXQvVxuICAgICAgICAgIGlmIChhd2FpdCB0aGlzLmFkYXB0ZXIuZXhpc3RzKG5ld0ZpbGVQYXRoKSkge1xuICAgICAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihgTW92ZSBjaGF0IGZhaWxlZDogRmlsZSBhbHJlYWR5IGV4aXN0cyBhdCB0YXJnZXQgcGF0aDogJHtuZXdGaWxlUGF0aH1gKTtcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShgTW92ZSBjaGF0IGZhaWxlZDogQSBmaWxlIG5hbWVkIFwiJHtmaWxlTmFtZX1cIiBhbHJlYWR5IGV4aXN0cyBpbiB0aGUgdGFyZ2V0IGZvbGRlci5gKTtcbiAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIDQuINCf0LXRgNC10LzRltGJ0LXQvdC90Y8g0YTQsNC50LvRg1xuICAgICAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKGBFeGVjdXRpbmcgYWRhcHRlci5yZW5hbWUgZnJvbSBcIiR7bm9ybU9sZFBhdGh9XCIgdG8gXCIke25ld0ZpbGVQYXRofVwiYCk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyLnJlbmFtZShub3JtT2xkUGF0aCwgbmV3RmlsZVBhdGgpO1xuICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oYENoYXQgZmlsZSBtb3ZlZCBzdWNjZXNzZnVsbHkgdG8gJHtuZXdGaWxlUGF0aH1gKTtcblxuICAgICAgICAgIC8vIDUuINCe0L3QvtCy0LvQtdC90L3RjyDQutC10YjRgyDQt9Cw0LLQsNC90YLQsNC20LXQvdC40YUg0YfQsNGC0ZbQslxuICAgICAgICAgIGlmICh0aGlzLmxvYWRlZENoYXRzW2NoYXRJZF0gJiYgbmV3RmlsZVBhdGgpIHsgLy8g0J/QtdGA0LXQstGW0YDRj9GU0LzQviwg0YnQviBuZXdGaWxlUGF0aCDQvdC1IG51bGxcbiAgICAgICAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoYFVwZGF0aW5nIGZpbGUgcGF0aCBpbiBsb2FkZWRDaGF0cyBjYWNoZSBmb3IgJHtjaGF0SWR9IHRvICR7bmV3RmlsZVBhdGh9YCk7XG4gICAgICAgICAgICAgIHRoaXMubG9hZGVkQ2hhdHNbY2hhdElkXS5maWxlUGF0aCA9IG5ld0ZpbGVQYXRoO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIDYuINCe0L3QvtCy0LvQtdC90L3RjyBVSSAo0IbQvdC00LXQutGBINC+0L3QvtCy0LjRgtGM0YHRjyDQv9GW0LfQvdGW0YjQtSDRh9C10YDQtdC3IFZhdWx0IEV2ZW50KVxuICAgICAgICAgIHRoaXMucGx1Z2luLmVtaXQoJ2NoYXQtbGlzdC11cGRhdGVkJyk7XG5cbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcblxuICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAvLyAtLS0g0KLQtdC/0LXRgCBuZXdGaWxlUGF0aCDQtNC+0YHRgtGD0L/QvdC40Lkg0YLRg9GCICjQvNC+0LbQtSDQsdGD0YLQuCBudWxsLCDRj9C60YnQviDQv9C+0LzQuNC70LrQsCDRgdGC0LDQu9Cw0YHRjyDQtNC+INC/0YDQuNGB0LLQvtGU0L3QvdGPKSAtLS1cbiAgICAgICAgICAgY29uc3QgdGFyZ2V0UGF0aERlc2MgPSBuZXdGaWxlUGF0aCA/PyBub3JtTmV3Rm9sZGVyUGF0aDsgLy8g0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviDQv9Cw0L/QutGDLCDRj9C60YnQviDRiNC70Y/RhSDRhNCw0LnQu9GDINGJ0LUg0L3QtSDQstC40LfQvdCw0YfQtdC90L5cbiAgICAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09ICdFUEVSTScgfHwgZXJyb3IuY29kZSA9PT0gJ0VBQ0NFUycpIHtcbiAgICAgICAgICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBQZXJtaXNzaW9uIGVycm9yIG1vdmluZyBjaGF0IGZpbGUgZnJvbSBcIiR7bm9ybU9sZFBhdGh9XCIgdG93YXJkcyBcIiR7dGFyZ2V0UGF0aERlc2N9XCI6YCwgZXJyb3IpO1xuICAgICAgICAgICAgICAgbmV3IE5vdGljZShgUGVybWlzc2lvbiBlcnJvciBtb3ZpbmcgY2hhdCBmaWxlLmApO1xuICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgLy8g0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviB0YXJnZXRQYXRoRGVzYyDQsiDQu9C+0LPRg9Cy0LDQvdC90ZZcbiAgICAgICAgICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGBFcnJvciBtb3ZpbmcgY2hhdCBmaWxlIGZyb20gXCIke25vcm1PbGRQYXRofVwiIHRvd2FyZHMgXCIke3RhcmdldFBhdGhEZXNjfVwiOmAsIGVycm9yKTtcbiAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYEZhaWxlZCB0byBtb3ZlIGNoYXQ6ICR7ZXJyb3IubWVzc2FnZSB8fCBcIlVua25vd24gZXJyb3JcIn1gKTtcbiAgICAgICAgICAgfVxuICAgICAgICAgICAvLyAtLS1cbiAgICAgICAgICAgYXdhaXQgdGhpcy5yZWJ1aWxkSW5kZXhGcm9tRmlsZXMoKTtcbiAgICAgICAgICAgdGhpcy5wbHVnaW4uZW1pdCgnY2hhdC1saXN0LXVwZGF0ZWQnKTtcbiAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICB9XG4gIFxuICAvKipcbiAgICog0KDQtdGU0YHRgtGA0YPRlCDRgNC10LfQvtC70LLQtdGAINC00LvRjyDQv9C+0LTRltGXIG1lc3NhZ2UtYWRkZWQuXG4gICAqINCm0LXQuSDQvNC10YLQvtC0INCy0LjQutC70LjQutCw0YLQuNC80LXRgtGM0YHRjyDQtyBPbGxhbWFWaWV3INC/0LXRgNC10LQg0YLQuNC8LCDRj9C6IENoYXRNYW5hZ2VyINC00L7QtNCw0YHRgtGMINC/0L7QstGW0LTQvtC80LvQtdC90L3Rjy5cbiAgICovXG4gIHB1YmxpYyByZWdpc3RlckhNQVJlc29sdmVyKHRpbWVzdGFtcE1zOiBudW1iZXIsIHJlc29sdmU6ICgpID0+IHZvaWQsIHJlamVjdDogKHJlYXNvbj86IGFueSkgPT4gdm9pZCk6IHZvaWQge1xuICAgIGlmICh0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5oYXModGltZXN0YW1wTXMpKSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihgW0NoYXRNYW5hZ2VyXSBITUEgUmVzb2x2ZXIgZm9yIHRpbWVzdGFtcCAke3RpbWVzdGFtcE1zfSBhbHJlYWR5IGV4aXN0cy4gT3ZlcndyaXRpbmcuYCk7XG4gICAgfVxuICAgIHRoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLnNldCh0aW1lc3RhbXBNcywgeyByZXNvbHZlLCByZWplY3QgfSk7XG4gICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbQ2hhdE1hbmFnZXJdIEhNQSBSZXNvbHZlciByZWdpc3RlcmVkIGZvciB0aW1lc3RhbXAgJHt0aW1lc3RhbXBNc30uIE1hcCBzaXplOiAke3RoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLnNpemV9YCk7XG4gIH1cblxuICAvKipcbiAgICog0JLQuNC60LvQuNC60LDRlCDRgtCwINCy0LjQtNCw0LvRj9GUINGA0LXQt9C+0LvQstC10YAg0LTQu9GPINC/0L7QtNGW0ZcgbWVzc2FnZS1hZGRlZC5cbiAgICog0KbQtdC5INC80LXRgtC+0LQg0LLQuNC60LvQuNC60LDRgtC40LzQtdGC0YzRgdGPINC3IE9sbGFtYVZpZXcuaGFuZGxlTWVzc2FnZUFkZGVkLlxuICAgKi9cbiAgcHVibGljIGludm9rZUhNQVJlc29sdmVyKHRpbWVzdGFtcE1zOiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCByZXNvbHZlclBhaXIgPSB0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5nZXQodGltZXN0YW1wTXMpO1xuICAgIGlmIChyZXNvbHZlclBhaXIpIHtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW0NoYXRNYW5hZ2VyXSBJbnZva2luZyBITUEgUmVzb2x2ZXIgZm9yIHRpbWVzdGFtcCAke3RpbWVzdGFtcE1zfS5gKTtcbiAgICAgIHJlc29sdmVyUGFpci5yZXNvbHZlKCk7XG4gICAgICB0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5kZWxldGUodGltZXN0YW1wTXMpO1xuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbQ2hhdE1hbmFnZXJdIEhNQSBSZXNvbHZlciBmb3IgdGltZXN0YW1wICR7dGltZXN0YW1wTXN9IGludm9rZWQgYW5kIGRlbGV0ZWQuIE1hcCBzaXplOiAke3RoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLnNpemV9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbQ2hhdE1hbmFnZXJdIE5vIEhNQSBSZXNvbHZlciBmb3VuZCB0byBpbnZva2UgZm9yIHRpbWVzdGFtcCAke3RpbWVzdGFtcE1zfS4gTWFwIHNpemU6ICR7dGhpcy5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuc2l6ZX1gKTtcbiAgICB9XG4gIH1cbiAgXG4gIHB1YmxpYyByZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKHRpbWVzdGFtcE1zOiBudW1iZXIsIHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgcmVzb2x2ZXJQYWlyID0gdGhpcy5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuZ2V0KHRpbWVzdGFtcE1zKTtcbiAgICBpZiAocmVzb2x2ZXJQYWlyKSB7XG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbQ2hhdE1hbmFnZXJdIFJlamVjdGluZyBITUEgUmVzb2x2ZXIgZm9yIHRzICR7dGltZXN0YW1wTXN9IGR1ZSB0bzogJHtyZWFzb259YCk7XG4gICAgICAgIHJlc29sdmVyUGFpci5yZWplY3QobmV3IEVycm9yKHJlYXNvbikpO1xuICAgICAgICB0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5kZWxldGUodGltZXN0YW1wTXMpO1xuICAgIH1cbiAgfVxuXG5cbiAgLyoqXG4gICAqINCU0L7QtNCw0ZQg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINC60L7RgNC40YHRgtGD0LLQsNGH0LAg0LTQviDQsNC60YLQuNCy0L3QvtCz0L4g0YfQsNGC0YMsINC30LHQtdGA0ZbQs9Cw0ZQg0LnQvtCz0L4sXG4gICAqINCz0LXQvdC10YDRg9GUINC/0L7QtNGW0Y4gXCJtZXNzYWdlLWFkZGVkXCIgKNC00LvRjyBPbGxhbWFWaWV3LmhhbmRsZU1lc3NhZ2VBZGRlZClcbiAgICog0YLQsCDQv9C+0LLQtdGA0YLQsNGUINC/0YDQvtC80ZbRgSwg0Y/QutC40Lkg0LLQuNGA0ZbRiNGD0ZTRgtGM0YHRjywg0LrQvtC70LggaGFuZGxlTWVzc2FnZUFkZGVkINC30LDQstC10YDRiNC40YLRjCDRgNC10L3QtNC10YDQuNC90LMuXG4gICAqIEBwYXJhbSBjb250ZW50INCS0LzRltGB0YIg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINC60L7RgNC40YHRgtGD0LLQsNGH0LAuXG4gICAqIEBwYXJhbSB0aW1lc3RhbXAg0JzRltGC0LrQsCDRh9Cw0YHRgyDQv9C+0LLRltC00L7QvNC70LXQvdC90Y8uXG4gICAqIEBwYXJhbSByZXF1ZXN0VGltZXN0YW1wSWQg0KPQvdGW0LrQsNC70YzQvdC40LkgSUQg0LfQsNC/0LjRgtGDINC00LvRjyDQu9C+0LPRg9Cy0LDQvdC90Y8uXG4gICAqIEByZXR1cm5zINCf0YDQvtC80ZbRgSwg0YnQviDQstC40YDRltGI0YPRlNGC0YzRgdGPINC/0ZbRgdC70Y8g0YDQtdC90LTQtdGA0LjQvdCz0YMsINCw0LHQviBudWxsLCDRj9C60YnQviDRgdGC0LDQu9Cw0YHRjyDQv9C+0LzQuNC70LrQsC5cbiAgICovXG4gIHB1YmxpYyBhc3luYyBhZGRVc2VyTWVzc2FnZUFuZEF3YWl0UmVuZGVyKFxuICAgIGNvbnRlbnQ6IHN0cmluZyxcbiAgICB0aW1lc3RhbXA6IERhdGUsXG4gICAgcmVxdWVzdFRpbWVzdGFtcElkOiBudW1iZXIgLy8g0JTQu9GPINGD0LfQs9C+0LTQttC10L3QvtCz0L4g0LvQvtCz0YPQstCw0L3QvdGPXG4gICk6IFByb21pc2U8TWVzc2FnZSB8IG51bGw+IHtcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5nZXRBY3RpdmVDaGF0KCk7IC8vINCf0YDQuNC/0YPRgdC60LDRlNC80L4sINGJ0L4gZ2V0QWN0aXZlQ2hhdCDQv9C+0LLQtdGA0YLQsNGUIENoYXQgfCBudWxsXG4gICAgaWYgKCFhY3RpdmVDaGF0KSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtDaGF0TWFuYWdlcl1bYWRkVXNlck1lc3NhZ2VBbmRXYWl0Rm9yUmVuZGVyIGlkOiR7cmVxdWVzdFRpbWVzdGFtcElkfV0gQ2Fubm90IGFkZCBtZXNzYWdlOiBObyBhY3RpdmUgY2hhdC5gKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IG1lc3NhZ2VUaW1lc3RhbXBNcyA9IHRpbWVzdGFtcC5nZXRUaW1lKCk7XG4gICAgY29uc3QgdXNlck1lc3NhZ2U6IE1lc3NhZ2UgPSB7XG4gICAgICByb2xlOiBcInVzZXJcIiBhcyBNZXNzYWdlUm9sZVR5cGVGcm9tVHlwZXMsIC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4g0ZbQvNC/0L7RgNGC0L7QstCw0L3QuNC5INGC0LjQv1xuICAgICAgY29udGVudCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICB9O1xuXG4gICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbQ2hhdE1hbmFnZXJdW2FkZFVzZXJNZXNzYWdlQW5kV2FpdEZvclJlbmRlciBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIFNldHRpbmcgdXAgSE1BIFByb21pc2UgZm9yIFVzZXJNZXNzYWdlICh0czogJHttZXNzYWdlVGltZXN0YW1wTXN9KS5gKTtcbiAgICBcbiAgICBjb25zdCBobWFQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgLy8g0KDQtdGU0YHRgtGA0YPRlNC80L4g0YDQtdC30L7Qu9Cy0LXRgCDQsiBDaGF0TWFuYWdlciwg0YnQvtCxIE9sbGFtYVZpZXcuaGFuZGxlTWVzc2FnZUFkZGVkINC80ZbQsyDQudC+0LPQviDQstC40LrQu9C40LrQsNGC0LhcbiAgICAgIHRoaXMucmVnaXN0ZXJITUFSZXNvbHZlcihtZXNzYWdlVGltZXN0YW1wTXMsIHJlc29sdmUsIHJlamVjdCk7XG4gICAgICAvLyDQotCw0LnQvNCw0YPRgiDQtNC70Y8gSE1BXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgaWYgKHRoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmhhcyhtZXNzYWdlVGltZXN0YW1wTXMpKSB7IC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4sINGH0Lgg0YDQtdC30L7Qu9Cy0LXRgCDRidC1INGC0LDQvFxuICAgICAgICAgICAgY29uc3QgcmVhc29uID0gYEhNQSBUaW1lb3V0IGZvciBVc2VyTWVzc2FnZSAodHM6ICR7bWVzc2FnZVRpbWVzdGFtcE1zfSkgaW4gQ2hhdE1hbmFnZXIuYDtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbQ2hhdE1hbmFnZXJdW2FkZFVzZXJNZXNzYWdlQW5kV2FpdEZvclJlbmRlciBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dICR7cmVhc29ufWApO1xuICAgICAgICAgICAgdGhpcy5yZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKG1lc3NhZ2VUaW1lc3RhbXBNcywgcmVhc29uKTtcbiAgICAgICAgfVxuICAgICAgfSwgMTAwMDApOyAvLyAxMCDRgdC10LrRg9C90LQg0YLQsNC50LzQsNGD0YJcbiAgICB9KTtcblxuICAgIC8vINCU0L7QtNCw0ZTQvNC+INC/0L7QstGW0LTQvtC80LvQtdC90L3RjyDQtNC+INC80LDRgdC40LLRgyDQv9C+0LLRltC00L7QvNC70LXQvdGMINGH0LDRgtGDINGC0LAg0LfQsdC10YDRltCz0LDRlNC80L4g0YfQsNGCXG4gICAgLy8gYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdFBheWxvYWQg0LzQsNGUINC00LHQsNGC0Lgg0L/RgNC+INC30LHQtdGA0LXQttC10L3QvdGPINGC0LAg0LXQvNGW0YLRg9Cy0LDQvdC90Y8g0L/QvtC00ZbRlyBcIm1lc3NhZ2UtYWRkZWRcIlxuICAgIGNvbnN0IGFkZGVkTWVzc2FnZSA9IGF3YWl0IHRoaXMuYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdFBheWxvYWQodXNlck1lc3NhZ2UsIHRydWUpO1xuICAgIGlmICghYWRkZWRNZXNzYWdlKSB7XG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihgW0NoYXRNYW5hZ2VyXVthZGRVc2VyTWVzc2FnZUFuZFdhaXRGb3JSZW5kZXIgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBGYWlsZWQgdG8gYWRkIHVzZXIgbWVzc2FnZSBwYXlsb2FkIGZvciB0czogJHttZXNzYWdlVGltZXN0YW1wTXN9LmApO1xuICAgICAgICB0aGlzLnJlamVjdEFuZENsZWFySE1BUmVzb2x2ZXIobWVzc2FnZVRpbWVzdGFtcE1zLCBcIkZhaWxlZCB0byBhZGQgbWVzc2FnZSBwYXlsb2FkIHRvIENoYXRNYW5hZ2VyLlwiKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIFxuICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW0NoYXRNYW5hZ2VyXVthZGRVc2VyTWVzc2FnZUFuZFdhaXRGb3JSZW5kZXIgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBVc2VyTWVzc2FnZSAodHM6ICR7bWVzc2FnZVRpbWVzdGFtcE1zfSkgYWRkZWQgdG8gQ2hhdE1hbmFnZXIuIFdhaXRpbmcgZm9yIEhNQSBjb21wbGV0aW9uLmApO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGhtYVByb21pc2U7XG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5pbmZvKGBbQ2hhdE1hbmFnZXJdW2FkZFVzZXJNZXNzYWdlQW5kV2FpdEZvclJlbmRlciBpZDoke3JlcXVlc3RUaW1lc3RhbXBJZH1dIEhNQSBjb21wbGV0ZWQgZm9yIFVzZXJNZXNzYWdlICh0czogJHttZXNzYWdlVGltZXN0YW1wTXN9KS5gKTtcbiAgICAgICAgcmV0dXJuIHVzZXJNZXNzYWdlO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihgW0NoYXRNYW5hZ2VyXVthZGRVc2VyTWVzc2FnZUFuZFdhaXRGb3JSZW5kZXIgaWQ6JHtyZXF1ZXN0VGltZXN0YW1wSWR9XSBFcnJvciBvciB0aW1lb3V0IHdhaXRpbmcgZm9yIEhNQSBmb3IgVXNlck1lc3NhZ2UgKHRzOiAke21lc3NhZ2VUaW1lc3RhbXBNc30pOmAsIGVycm9yKTtcbiAgICAgICAgLy8g0KDQtdC30L7Qu9Cy0LXRgCDQstC20LUg0LzQsNCyINCx0YPRgtC4INCy0LjQtNCw0LvQtdC90LjQuSByZWplY3RBbmRDbGVhckhNQVJlc29sdmVyXG4gICAgICAgIHJldHVybiBudWxsOyAvLyDQkNCx0L4g0LrQuNC90YPRgtC4INC/0L7QvNC40LvQutGDINC00LDQu9GWLCDRj9C60YnQviDQv9C+0YLRgNGW0LHQvdC+XG4gICAgfVxuICB9XG4gIFxufSAvLyBFbmQgb2YgQ2hhdE1hbmFnZXIgY2xhc3NcbiJdfQ==