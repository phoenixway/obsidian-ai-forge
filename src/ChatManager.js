import { __awaiter } from "tslib";
//ChatManager.ts
import { Notice, normalizePath } from "obsidian";
import { ACTIVE_CHAT_ID_KEY, CHAT_INDEX_KEY } from "./main";
import { Chat } from "./Chat";
import { v4 as uuidv4 } from "uuid";
export class ChatManager {
    constructor(plugin) {
        this.chatsFolderPath = "/";
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
                            // ВИПРАВЛЕНО: використовуємо ChatDataForStorage, оскільки дані з файлу
                            const data = JSON.parse(jsonContent);
                            if (((_a = data === null || data === void 0 ? void 0 : data.metadata) === null || _a === void 0 ? void 0 : _a.id) === chatId &&
                                typeof data.metadata.name === "string" &&
                                data.metadata.name.trim() !== "" &&
                                typeof data.metadata.lastModified === "string" && // lastModified та createdAt вже є рядками
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
                                    contextWindow: meta.contextWindow, // Якщо це поле додано до ChatMetadata
                                };
                                chatsLoaded++;
                            }
                            else {
                            }
                        }
                        catch (e) {
                            if (e instanceof SyntaxError) {
                                this.logger.error(`[ChatManager rebuildIndex] SyntaxError parsing JSON from ${fullPath}:`, e);
                            }
                            else {
                                this.logger.error(`[ChatManager rebuildIndex] Error reading or processing file ${fullPath}:`, e);
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
                    this.plugin.emit("chat-list-updated");
                }
                else {
                }
                return true;
            }
            catch (error) {
                return false;
            }
        });
    }
    createNewChat(name, folderPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const targetFolder = folderPath ? normalizePath(folderPath) : this.chatsFolderPath;
            const finalFolderPath = targetFolder === "" || targetFolder === "." ? "/" : targetFolder;
            try {
                yield this.ensureSpecificFolderExists(finalFolderPath);
            }
            catch (folderError) {
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
                const savedImmediately = yield newChat.saveImmediately();
                if (!savedImmediately) {
                    delete this.chatIndex[newId];
                    yield this.saveChatIndex();
                    this.plugin.emit("chat-list-updated");
                    new Notice("Error: Failed to save new chat file.");
                    return null;
                }
                this.loadedChats[newId] = newChat;
                yield this.setActiveChat(newId);
                return newChat;
            }
            catch (error) {
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
                        throw new Error(`Target path ${normalized} is not a folder.`);
                    }
                }
            }
            catch (error) {
                throw new Error(`Failed to ensure target folder ${normalized} exists: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }
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
    getActiveChatOrFail() {
        return __awaiter(this, void 0, void 0, function* () {
            const chat = yield this.getActiveChat();
            if (!chat) {
                throw new Error("No active chat found or it failed to load.");
            }
            return chat;
        });
    }
    addMessageToActiveChatPayload(messagePayload_1) {
        return __awaiter(this, arguments, void 0, function* (messagePayload, emitEvent = true) {
            const operationTimestampId = messagePayload.timestamp.getTime();
            const activeChatInstance = yield this.getActiveChat();
            if (!activeChatInstance) {
                return null;
            }
            if (!messagePayload.timestamp) {
                messagePayload.timestamp = new Date();
            }
            activeChatInstance.messages.push(messagePayload);
            const activityRecorded = activeChatInstance.recordActivity();
            if (activityRecorded) {
                const saveAndUpdateIndexSuccess = yield this.saveChatAndUpdateIndex(activeChatInstance);
                if (!saveAndUpdateIndexSuccess) {
                }
            }
            if (emitEvent) {
                const currentActiveChatIdForEvent = this.activeChatId || activeChatInstance.metadata.id;
                this.plugin.emit("message-added", { chatId: currentActiveChatIdForEvent, message: messagePayload });
            }
            return messagePayload;
        });
    }
    getChat(id, filePath) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (this.loadedChats[id]) {
                return this.loadedChats[id];
            }
            let actualFilePath = filePath;
            if (!actualFilePath) {
                try {
                    const hierarchy = yield this.getChatHierarchy();
                    actualFilePath = (_a = this.findChatPathInHierarchy(id, hierarchy)) !== null && _a !== void 0 ? _a : undefined;
                    if (actualFilePath) {
                    }
                    else {
                    }
                }
                catch (hierarchyError) {
                    actualFilePath = undefined;
                }
            }
            if (!actualFilePath && this.chatIndex[id]) {
                return null;
            }
            if (!this.chatIndex[id] && !actualFilePath) {
                return null;
            }
            if (!actualFilePath) {
                return null;
            }
            try {
                const chat = yield Chat.loadFromFile(actualFilePath, this.adapter, this.plugin.settings, this.logger);
                if (chat) {
                    this.loadedChats[id] = chat;
                    const storedMeta = this.chatIndex[id];
                    const currentMeta = chat.metadata;
                    const indexNeedsUpdate = !storedMeta ||
                        storedMeta.name !== currentMeta.name ||
                        storedMeta.lastModified !== currentMeta.lastModified ||
                        storedMeta.createdAt !== currentMeta.createdAt ||
                        storedMeta.modelName !== currentMeta.modelName ||
                        storedMeta.selectedRolePath !== currentMeta.selectedRolePath ||
                        storedMeta.temperature !== currentMeta.temperature ||
                        storedMeta.contextWindow !== currentMeta.contextWindow;
                    if (indexNeedsUpdate) {
                        yield this.saveChatAndUpdateIndex(chat);
                    }
                    return chat;
                }
                else {
                    yield this.deleteChatFileAndIndexEntry_NoEmit(id, actualFilePath, false);
                    if (this.activeChatId === id) {
                        yield this.setActiveChat(null);
                    }
                    return null;
                }
            }
            catch (error) {
                if (error.code === "ENOENT") {
                    yield this.deleteChatFileAndIndexEntry_NoEmit(id, actualFilePath, false);
                    if (this.activeChatId === id) {
                        yield this.setActiveChat(null);
                    }
                }
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
                yield this.rebuildIndexFromFiles();
                if (!this.chatIndex[id]) {
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
            if (tool_calls && tool_calls.length > 0) {
                newMessage.tool_calls = tool_calls;
            }
            if (tool_call_id) {
                newMessage.tool_call_id = tool_call_id;
            }
            if (name) {
                newMessage.name = name;
            }
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
            if (Object.keys(metadataUpdate).length === 0) {
                return false;
            }
            const oldRolePath = activeChat.metadata.selectedRolePath;
            const oldModelName = activeChat.metadata.modelName;
            const changed = activeChat.updateMetadata(metadataUpdate);
            if (changed) {
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
                    }
                }
                if (modelChanged) {
                    this.plugin.emit("model-changed", newMeta.modelName || "");
                    (_e = (_d = this.plugin.promptService) === null || _d === void 0 ? void 0 : _d.clearModelDetailsCache) === null || _e === void 0 ? void 0 : _e.call(_d);
                }
                this.plugin.emit("active-chat-changed", { chatId: this.activeChatId, chat: activeChat });
                return true;
            }
            else {
                return false;
            }
        });
    }
    /**
     * Допоміжний метод для видалення файлу чату та запису з індексу БЕЗ генерації подій.
     * @param id ID чату для видалення.
     * @param filePath Шлях до файлу чату (може бути null).
     * @param deleteFile Чи потрібно видаляти фізичний файл.
     * @returns true, якщо індекс chatIndex був змінений, false в іншому випадку.
     */
    deleteChatFileAndIndexEntry_NoEmit(id_1, filePath_1) {
        return __awaiter(this, arguments, void 0, function* (id, filePath, deleteFile = true) {
            const safeFilePath = filePath !== null && filePath !== void 0 ? filePath : "unknown_path";
            let indexChanged = false;
            if (this.loadedChats[id]) {
                delete this.loadedChats[id];
            }
            if (this.chatIndex[id]) {
                delete this.chatIndex[id];
                indexChanged = true;
            }
            else {
            }
            if (deleteFile && filePath && typeof filePath === "string" && filePath !== "/" && !filePath.endsWith("/")) {
                try {
                    const fileExists = yield this.adapter.exists(filePath);
                    if (fileExists) {
                        const stat = yield this.adapter.stat(filePath);
                        if ((stat === null || stat === void 0 ? void 0 : stat.type) === "file") {
                            yield this.adapter.remove(filePath);
                        }
                        else {
                        }
                    }
                    else {
                    }
                }
                catch (e) {
                    new Notice(`Error deleting file: ${filePath.split('/').pop()}`);
                }
            }
            else if (deleteFile && filePath) {
            }
            if (indexChanged) {
                yield this.saveChatIndex();
            }
            return indexChanged;
        });
    }
    deleteChat(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const chatExistedInIndex = !!this.chatIndex[id];
            const wasActive = id === this.activeChatId;
            let filePath = null;
            try {
                const hierarchy = yield this.getChatHierarchy();
                filePath = this.findChatPathInHierarchy(id, hierarchy);
                if (!filePath && chatExistedInIndex) {
                }
            }
            catch (hierarchyError) {
            }
            if (!filePath && !chatExistedInIndex) {
                return false;
            }
            let success = true;
            let eventToEmit = null;
            try {
                const indexWasChanged = yield this.deleteChatFileAndIndexEntry_NoEmit(id, filePath, true);
                if (wasActive) {
                    const newHierarchy = yield this.getChatHierarchy();
                    const firstChat = this.findFirstChatInHierarchy(newHierarchy);
                    const nextActiveId = firstChat ? firstChat.metadata.id : null;
                    yield this.setActiveChat(nextActiveId);
                }
                else if (indexWasChanged) {
                    eventToEmit = { name: "chat-list-updated", data: undefined };
                }
            }
            catch (error) {
                new Notice(`Error deleting chat ${id}. Check console.`);
                success = false;
                yield this.rebuildIndexFromFiles();
                eventToEmit = { name: "chat-list-updated", data: undefined };
            }
            finally {
                if (eventToEmit) {
                    this.plugin.emit(eventToEmit.name, eventToEmit.data);
                }
                else if (wasActive) {
                }
                else {
                }
                if (success && chatExistedInIndex) {
                    new Notice(`Chat deleted.`);
                }
                else if (!chatExistedInIndex) {
                }
            }
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
                new Notice("Error finding original chat for cloning.");
                return null;
            }
            if (!originalFilePath) {
                new Notice("Original chat file path not found.");
                return null;
            }
            const originalChat = yield this.getChat(chatIdToClone, originalFilePath);
            if (!originalChat) {
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
                const savedImmediately = yield clonedChat.saveImmediately();
                if (!savedImmediately) {
                    delete this.chatIndex[newId];
                    yield this.saveChatIndex();
                    this.plugin.emit("chat-list-updated");
                    new Notice("Error: Failed to save the cloned chat file.");
                    return null;
                }
                this.loadedChats[newId] = clonedChat;
                yield this.setActiveChat(newId);
                return clonedChat;
            }
            catch (error) {
                new Notice("An error occurred while cloning the chat.");
                return null;
            }
        });
    }
    deleteMessagesAfter(chatId, messageIndexToDeleteAfter) {
        return __awaiter(this, void 0, void 0, function* () {
            const chat = yield this.getChat(chatId);
            if (!chat) {
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
                new Notice(`Error: Chat ${chatId} not found.`);
                return false;
            }
            const timeTarget = timestampToDelete.getTime();
            const tolerance = 1000;
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
            return yield this._performDeleteMessageByIndex(chat, messageIndex);
        });
    }
    _performDeleteMessageByIndex(chat, messageIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            const chatId = chat.metadata.id;
            try {
                if (messageIndex < 0 || messageIndex >= chat.messages.length) {
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
                new Notice("Error deleting message.");
                return false;
            }
        });
    }
    clearChatMessagesById(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const chat = yield this.getChat(chatId);
            if (!chat) {
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
                new Notice("An error occurred while renaming the chat.");
                return false;
            }
        });
    }
    /**
     * Створює нову папку за вказаним шляхом.
     * @param folderPath Повний, нормалізований шлях до папки, яку потрібно створити.
     * @returns true, якщо папка успішно створена, false в іншому випадку.
     */
    createFolder(folderPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPath = normalizePath(folderPath);
            if (!normalizedPath || normalizedPath === "/" || normalizedPath === ".") {
                new Notice("Invalid folder path.");
                return false;
            }
            if (normalizedPath.startsWith("..") || normalizedPath.includes("\0")) {
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
                this.plugin.emit("chat-list-updated");
                return true;
            }
            catch (error) {
                if (error.code === "EPERM" || error.code === "EACCES") {
                    new Notice(`Permission error creating folder.`);
                }
                else {
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
            if (!normOldPath || normOldPath === "/" || !normNewPath || normNewPath === "/") {
                new Notice("Cannot rename root folder or use empty path.");
                return false;
            }
            if (normOldPath === normNewPath) {
                return true;
            }
            if (normNewPath.startsWith(normOldPath + "/")) {
                new Notice("Cannot move a folder inside itself.");
                return false;
            }
            try {
                const oldExists = yield this.adapter.exists(normOldPath);
                if (!oldExists) {
                    new Notice("Folder to rename not found.");
                    return false;
                }
                const oldStat = yield this.adapter.stat(normOldPath);
                if ((oldStat === null || oldStat === void 0 ? void 0 : oldStat.type) !== "folder") {
                    new Notice("Item to rename is not a folder.");
                    return false;
                }
                const newExists = yield this.adapter.exists(normNewPath);
                if (newExists) {
                    new Notice(`"${normNewPath.split("/").pop()}" already exists.`);
                    return false;
                }
                yield this.adapter.rename(normOldPath, normNewPath);
                Object.values(this.loadedChats).forEach(chat => {
                    if (chat.filePath.startsWith(normOldPath + "/")) {
                        const relativePath = chat.filePath.substring(normOldPath.length);
                        const updatedPath = normalizePath(normNewPath + relativePath);
                        chat.filePath = updatedPath;
                    }
                });
                this.plugin.emit("chat-list-updated");
                return true;
            }
            catch (error) {
                if (error.code === "EPERM" || error.code === "EACCES") {
                    new Notice(`Permission error renaming folder.`);
                }
                else {
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
            if (!normalizedPath || normalizedPath === "/" || normalizedPath === ".") {
                new Notice("Cannot delete this folder.");
                return false;
            }
            if (normalizedPath === this.chatsFolderPath) {
                new Notice("Cannot delete the main chat history folder set in settings.");
                return false;
            }
            try {
                const exists = yield this.adapter.exists(normalizedPath);
                if (!exists) {
                    return true;
                }
                const stat = yield this.adapter.stat(normalizedPath);
                if ((stat === null || stat === void 0 ? void 0 : stat.type) !== "folder") {
                    new Notice("Item to delete is not a folder.");
                    return false;
                }
                const chatIdsToDelete = [];
                const collectChatIds = (currentPath) => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const list = yield this.adapter.list(currentPath);
                        for (const file of list.files) {
                            const fileName = file.substring(file.lastIndexOf("/") + 1);
                            if (fileName.endsWith(".json")) {
                                const chatId = fileName.slice(0, -5);
                                if (this.chatIndex[chatId]) {
                                    chatIdsToDelete.push(chatId);
                                }
                            }
                        }
                        for (const folder of list.folders) {
                            yield collectChatIds(folder);
                        }
                    }
                    catch (listError) {
                    }
                });
                yield collectChatIds(normalizedPath);
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
                        this.activeChatId = null;
                        this.activeChat = null;
                    }
                });
                yield this.saveChatIndex();
                if (activeChatWasDeleted) {
                    yield this.plugin.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
                }
                yield this.adapter.rmdir(normalizedPath, true);
                this.plugin.emit("chat-list-updated");
                if (activeChatWasDeleted) {
                    this.plugin.emit("active-chat-changed", { chatId: null, chat: null });
                }
                return true;
            }
            catch (error) {
                if (error.code === "EPERM" || error.code === "EACCES") {
                    new Notice(`Permission error deleting folder.`);
                }
                else {
                    new Notice(`Failed to delete folder: ${error.message || "Unknown error"}`);
                }
                yield this.rebuildIndexFromFiles();
                return false;
            }
        });
    }
    moveChat(chatId, oldFilePath, newFolderPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const normOldPath = normalizePath(oldFilePath);
            const normNewFolderPath = normalizePath(newFolderPath);
            let newFilePath = null;
            if (!chatId || !oldFilePath || !newFolderPath) {
                new Notice("Move chat failed: Invalid data.");
                return false;
            }
            try {
                if (!(yield this.adapter.exists(normOldPath))) {
                    new Notice("Move chat failed: Source file not found.");
                    yield this.rebuildIndexFromFiles();
                    this.plugin.emit('chat-list-updated');
                    return false;
                }
                const oldStat = yield this.adapter.stat(normOldPath);
                if ((oldStat === null || oldStat === void 0 ? void 0 : oldStat.type) !== 'file') {
                    new Notice("Move chat failed: Source is not a file.");
                    return false;
                }
                if (!(yield this.adapter.exists(normNewFolderPath))) {
                    new Notice("Move chat failed: Target folder not found.");
                    return false;
                }
                const newStat = yield this.adapter.stat(normNewFolderPath);
                if ((newStat === null || newStat === void 0 ? void 0 : newStat.type) !== 'folder') {
                    new Notice("Move chat failed: Target is not a folder.");
                    return false;
                }
                const fileName = oldFilePath.substring(oldFilePath.lastIndexOf('/') + 1);
                newFilePath = normalizePath(`${normNewFolderPath}/${fileName}`);
                if (normOldPath === newFilePath) {
                    return true;
                }
                if (yield this.adapter.exists(newFilePath)) {
                    new Notice(`Move chat failed: A file named "${fileName}" already exists in the target folder.`);
                    return false;
                }
                yield this.adapter.rename(normOldPath, newFilePath);
                if (this.loadedChats[chatId] && newFilePath) {
                    this.loadedChats[chatId].filePath = newFilePath;
                }
                this.plugin.emit('chat-list-updated');
                return true;
            }
            catch (error) {
                const targetPathDesc = newFilePath !== null && newFilePath !== void 0 ? newFilePath : normNewFolderPath;
                if (error.code === 'EPERM' || error.code === 'EACCES') {
                    new Notice(`Permission error moving chat file.`);
                }
                else {
                    new Notice(`Failed to move chat: ${error.message || "Unknown error"}`);
                }
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
        }
        this.messageAddedResolvers.set(timestampMs, { resolve, reject });
    }
    /**
     * Викликає та видаляє резолвер для події message-added.
     * Цей метод викликатиметься з OllamaView.handleMessageAdded.
     */
    invokeHMAResolver(timestampMs) {
        const resolverPair = this.messageAddedResolvers.get(timestampMs);
        if (resolverPair) {
            resolverPair.resolve();
            this.messageAddedResolvers.delete(timestampMs);
        }
        else {
        }
    }
    rejectAndClearHMAResolver(timestampMs, reason) {
        const resolverPair = this.messageAddedResolvers.get(timestampMs);
        if (resolverPair) {
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
    addUserMessageAndAwaitRender(content, timestamp, requestTimestampId) {
        return __awaiter(this, void 0, void 0, function* () {
            const activeChat = yield this.getActiveChat();
            if (!activeChat) {
                return null;
            }
            const messageTimestampMs = timestamp.getTime();
            const userMessage = {
                role: "user",
                content,
                timestamp,
            };
            const hmaPromise = new Promise((resolve, reject) => {
                this.registerHMAResolver(messageTimestampMs, resolve, reject);
                setTimeout(() => {
                    if (this.messageAddedResolvers.has(messageTimestampMs)) {
                        const reason = `HMA Timeout for UserMessage (ts: ${messageTimestampMs}) in ChatManager.`;
                        this.rejectAndClearHMAResolver(messageTimestampMs, reason);
                    }
                }, 10000);
            });
            const addedMessage = yield this.addMessageToActiveChatPayload(userMessage, true);
            if (!addedMessage) {
                this.rejectAndClearHMAResolver(messageTimestampMs, "Failed to add message payload to ChatManager.");
                return null;
            }
            try {
                yield hmaPromise;
                return userMessage;
            }
            catch (error) {
                return null;
            }
        });
    }
}
//End of ChatManager.ts
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2hhdE1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJDaGF0TWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsZ0JBQWdCO0FBQ2hCLE9BQU8sRUFBTyxNQUFNLEVBQWUsYUFBYSxFQUFvQyxNQUFNLFVBQVUsQ0FBQztBQUNyRyxPQUFxQixFQUFFLGtCQUFrQixFQUFFLGNBQWMsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUMxRSxPQUFPLEVBQUUsSUFBSSxFQUErRSxNQUFNLFFBQVEsQ0FBQztBQUUzRyxPQUFPLEVBQUUsRUFBRSxJQUFJLE1BQU0sRUFBRSxNQUFNLE1BQU0sQ0FBQztBQWdEcEMsTUFBTSxPQUFPLFdBQVc7SUFhdEIsWUFBWSxNQUFvQjtRQVR6QixvQkFBZSxHQUFXLEdBQUcsQ0FBQztRQUM3QixjQUFTLEdBQXFCLEVBQUUsQ0FBQztRQUNqQyxpQkFBWSxHQUFrQixJQUFJLENBQUM7UUFDbkMsZUFBVSxHQUFnQixJQUFJLENBQUM7UUFDL0IsZ0JBQVcsR0FBeUIsRUFBRSxDQUFDO1FBQ3hDLHFCQUFnQixHQUFxQixJQUFJLENBQUM7UUFFMUMsMEJBQXFCLEdBQXVFLElBQUksR0FBRyxFQUFFLENBQUM7UUFHM0csSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLEdBQUcsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDO1FBQ3RCLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQztJQUM5QixDQUFDO0lBRUssVUFBVTs7WUFDZCxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixNQUFNLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUUvQixNQUFNLGFBQWEsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDeEUsSUFBSSxhQUFhLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO2dCQUNuRCxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDMUMsQ0FBQztpQkFBTSxDQUFDO2dCQUdOLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3hELE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQ2hELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDM0QsSUFBSSxTQUFTLEVBQUUsQ0FBQztvQkFDZCxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDbEQsQ0FBQztxQkFBTSxDQUFDO29CQUNOLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDakMsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDO0tBQUE7SUFFTyx3QkFBd0IsQ0FBQyxLQUFzQjtRQUNyRCxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ3pCLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDekIsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQztvQkFDM0QsT0FBTyxJQUFJLENBQUM7Z0JBQ2QsQ0FBQztxQkFBTSxDQUFDO2dCQUNSLENBQUM7WUFDSCxDQUFDO2lCQUFNLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDbEMsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDbEUsSUFBSSxZQUFZLEVBQUUsQ0FBQztvQkFDakIsT0FBTyxZQUFZLENBQUM7Z0JBQ3RCLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVELHFCQUFxQjs7UUFDbkIsTUFBTSxZQUFZLEdBQUcsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsMENBQUUsSUFBSSxFQUFFLENBQUM7UUFDeEUsSUFBSSxDQUFDLGVBQWUsR0FBRyxZQUFZLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ3hFLElBQUksSUFBSSxDQUFDLGVBQWUsS0FBSyxHQUFHLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN2RSxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNELENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxlQUFlLEdBQUcsR0FBRyxDQUFDO1FBQzdCLENBQUM7SUFDSCxDQUFDO0lBRUQsZUFBZSxDQUFDLEtBQXVCO1FBQ3JDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7SUFDaEMsQ0FBQztJQUVELG1CQUFtQjtRQUNqQixPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztJQUMvQixDQUFDO0lBRVksa0JBQWtCOzs7WUFDN0IsTUFBTSxXQUFXLEdBQUcsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsMENBQUUsSUFBSSxFQUFFLENBQUM7WUFDdkUsTUFBTSxVQUFVLEdBQUcsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsMENBQUUsSUFBSSxFQUFFLENBQUM7WUFFckUsTUFBTSxjQUFjLEdBQUcsQ0FBTyxVQUFxQyxFQUFFLFVBQWtCLEVBQUUsRUFBRTtnQkFDekYsSUFBSSxDQUFDLFVBQVUsSUFBSSxVQUFVLEtBQUssR0FBRztvQkFBRSxPQUFPO2dCQUM5QyxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBRTdDLElBQUksVUFBVSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQzdELElBQUksTUFBTSxDQUFDLDJCQUEyQixVQUFVLEdBQUcsQ0FBQyxDQUFDO29CQUNyRCxPQUFPO2dCQUNULENBQUM7Z0JBQ0QsSUFBSSxDQUFDO29CQUNILE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBQ3JELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQzt3QkFDWixNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO29CQUN2QyxDQUFDO3lCQUFNLENBQUM7d0JBQ04sTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQzt3QkFDakQsSUFBSSxDQUFBLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxJQUFJLE1BQUssUUFBUSxFQUFFLENBQUM7NEJBQzVCLElBQUksTUFBTSxDQUFDLG1CQUFtQixVQUFVLG1CQUFtQixDQUFDLENBQUM7d0JBQy9ELENBQUM7NkJBQU0sQ0FBQzt3QkFDUixDQUFDO29CQUNILENBQUM7Z0JBQ0gsQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNmLElBQUksTUFBTSxDQUFDLDhCQUE4QixVQUFVLHNCQUFzQixDQUFDLENBQUM7Z0JBQzdFLENBQUM7WUFDSCxDQUFDLENBQUEsQ0FBQztZQUNGLE1BQU0sY0FBYyxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsQ0FBQztZQUNsRCxNQUFNLGNBQWMsQ0FBQyxVQUFVLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDbEQsQ0FBQztLQUFBO0lBRWEsYUFBYTs2REFBQyxZQUFxQixLQUFLOztZQUNwRCxNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBRWxFLE1BQU0sWUFBWSxHQUFHLE1BQUEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMscUJBQXFCLDBDQUFFLElBQUksRUFBRSxDQUFDO1lBQ3hFLE1BQU0sV0FBVyxHQUFHLFlBQVksSUFBSSxZQUFZLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUM3RixJQUFJLFdBQVcsS0FBSyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQ3pDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO2dCQUM3QixTQUFTLEdBQUcsSUFBSSxDQUFDO1lBQ25CLENBQUM7WUFFRCxJQUFJLENBQUMsU0FBUyxJQUFJLFdBQVcsSUFBSSxPQUFPLFdBQVcsS0FBSyxRQUFRLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3hHLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzdDLElBQ0UsV0FBVyxDQUFDLFFBQVEsQ0FBQztvQkFDckIsT0FBTyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxLQUFLLFFBQVE7b0JBQzlDLE9BQU8sV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFlBQVksS0FBSyxRQUFRO29CQUN0RCxPQUFPLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLEtBQUssUUFBUSxFQUNuRCxDQUFDO29CQUNELElBQUksQ0FBQyxTQUFTLEdBQUcsV0FBVyxDQUFDO29CQUU3QixPQUFPO2dCQUNULENBQUM7cUJBQU0sQ0FBQztvQkFDTixTQUFTLEdBQUcsSUFBSSxDQUFDO2dCQUNuQixDQUFDO1lBQ0gsQ0FBQztpQkFBTSxJQUFJLENBQUMsU0FBUyxJQUFJLFdBQVcsSUFBSSxPQUFPLFdBQVcsS0FBSyxRQUFRLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2pILElBQUksQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO2dCQUNwQixPQUFPO1lBQ1QsQ0FBQztpQkFBTSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ3RCLFNBQVMsR0FBRyxJQUFJLENBQUM7WUFDbkIsQ0FBQztZQUVELElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQ2QsTUFBTSxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUNyQyxDQUFDO1FBQ0gsQ0FBQztLQUFBO0lBRVkscUJBQXFCOztZQUNoQyxNQUFNLFFBQVEsR0FBcUIsRUFBRSxDQUFDO1lBQ3RDLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztZQUNwQixJQUFJLFlBQVksR0FBRyxDQUFDLENBQUM7WUFFckIsSUFBSSxDQUFDO2dCQUNILElBQUksSUFBSSxDQUFDLGVBQWUsS0FBSyxHQUFHLEVBQUUsQ0FBQztvQkFDakMsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7b0JBQy9ELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQzt3QkFDWixJQUFJLENBQUM7NEJBQ0gsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7d0JBQ2pELENBQUM7d0JBQUMsT0FBTyxVQUFVLEVBQUUsQ0FBQzs0QkFDcEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7NEJBQ3BCLE1BQU0sSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDOzRCQUMzQixPQUFPO3dCQUNULENBQUM7b0JBQ0gsQ0FBQzt5QkFBTSxDQUFDO3dCQUNOLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO3dCQUMzRCxJQUFJLENBQUEsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLElBQUksTUFBSyxRQUFRLEVBQUUsQ0FBQzs0QkFDNUIsSUFBSSxNQUFNLENBQUMsNkJBQTZCLElBQUksQ0FBQyxlQUFlLG9CQUFvQixDQUFDLENBQUM7NEJBQ2xGLElBQUksQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDOzRCQUNwQixNQUFNLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQzs0QkFDM0IsT0FBTzt3QkFDVCxDQUFDO29CQUNILENBQUM7Z0JBQ0gsQ0FBQztnQkFFRCxNQUFNLFlBQVksR0FBRyxDQUFPLFVBQWtCLEVBQWlCLEVBQUU7O29CQUMvRCxJQUFJLFVBQVUsQ0FBQztvQkFDZixJQUFJLENBQUM7d0JBQ0gsVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBQ25ELENBQUM7b0JBQUMsT0FBTyxTQUFjLEVBQUUsQ0FBQzt3QkFDeEIsSUFBSSxTQUFTLENBQUMsT0FBTyxJQUFJLFNBQVMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQzt3QkFDekUsQ0FBQzs2QkFBTSxDQUFDO3dCQUNSLENBQUM7d0JBQ0QsT0FBTztvQkFDVCxDQUFDO29CQUVELEtBQUssTUFBTSxRQUFRLElBQUksVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO3dCQUN4QyxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7d0JBQ25FLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDOzRCQUFFLFNBQVM7d0JBRXRFLE1BQU0sV0FBVyxHQUFHLHNGQUFzRixDQUFDO3dCQUMzRyxNQUFNLFVBQVUsR0FBRywrQkFBK0IsQ0FBQzt3QkFFbkQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQzs0QkFBRSxTQUFTO3dCQUN4RSxZQUFZLEVBQUUsQ0FBQzt3QkFFZixNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUVwQyxJQUFJLENBQUM7NEJBQ0osTUFBTSxXQUFXLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQzs0QkFDdEQsdUVBQXVFOzRCQUN2RSxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBZ0MsQ0FBQzs0QkFFcEUsSUFDRSxDQUFBLE1BQUEsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLFFBQVEsMENBQUUsRUFBRSxNQUFLLE1BQU07Z0NBQzdCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEtBQUssUUFBUTtnQ0FDdEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRTtnQ0FDaEMsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksS0FBSyxRQUFRLElBQUksMENBQTBDO2dDQUM1RixDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dDQUN0RCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxLQUFLLFFBQVE7Z0NBQzNDLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsRUFDbkQsQ0FBQztnQ0FDRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO2dDQUMzQixRQUFRLENBQUMsTUFBTSxDQUFDLEdBQUc7b0NBQ2pCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtvQ0FDZixZQUFZLEVBQUUsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLFdBQVcsRUFBRTtvQ0FDdkQsU0FBUyxFQUFFLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxXQUFXLEVBQUU7b0NBQ2pELFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUztvQ0FDekIsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLGdCQUFnQjtvQ0FDdkMsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXO29DQUM3QixhQUFhLEVBQUUsSUFBSSxDQUFDLGFBQWEsRUFBRSxzQ0FBc0M7aUNBQzFFLENBQUM7Z0NBQ0YsV0FBVyxFQUFFLENBQUM7NEJBQ2hCLENBQUM7aUNBQU0sQ0FBQzs0QkFFUixDQUFDO3dCQUNILENBQUM7d0JBQUMsT0FBTyxDQUFNLEVBQUUsQ0FBQzs0QkFDaEIsSUFBSSxDQUFDLFlBQVksV0FBVyxFQUFFLENBQUM7Z0NBQzdCLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLDREQUE0RCxRQUFRLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQzs0QkFDaEcsQ0FBQztpQ0FBTSxDQUFDO2dDQUNOLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLCtEQUErRCxRQUFRLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQzs0QkFDbkcsQ0FBQzt3QkFDSCxDQUFDO29CQUVILENBQUM7b0JBRUQsS0FBSyxNQUFNLGFBQWEsSUFBSSxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7d0JBQy9DLE1BQU0sWUFBWSxDQUFDLGFBQWEsQ0FBQyxDQUFDO29CQUNwQyxDQUFDO2dCQUNILENBQUMsQ0FBQSxDQUFDO2dCQUVGLE1BQU0sWUFBWSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFFekMsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7Z0JBQzFCLE1BQU0sSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQzdCLENBQUM7WUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO2dCQUNwQixJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQzVCLElBQUksTUFBTSxDQUFDLCtCQUErQixJQUFJLENBQUMsZUFBZSxjQUFjLENBQUMsQ0FBQztnQkFDaEYsQ0FBQztxQkFBTSxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssT0FBTyxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQzdELElBQUksTUFBTSxDQUFDLGlEQUFpRCxDQUFDLENBQUM7Z0JBQ2hFLENBQUM7cUJBQU0sQ0FBQztvQkFDTixJQUFJLE1BQU0sQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO2dCQUM1RCxDQUFDO2dCQUNELElBQUksQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO2dCQUNwQixNQUFNLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUM3QixDQUFDO1FBQ0gsQ0FBQztLQUFBO0lBRWEsYUFBYTs7WUFDekIsSUFBSSxDQUFDO2dCQUNILE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNoRSxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixJQUFJLE1BQU0sQ0FBQyxpREFBaUQsQ0FBQyxDQUFDO1lBQ2hFLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFFTyxlQUFlLENBQUMsRUFBVSxFQUFFLFVBQWtCO1FBQ3BELE1BQU0sUUFBUSxHQUFHLEdBQUcsRUFBRSxPQUFPLENBQUM7UUFDOUIsTUFBTSxZQUFZLEdBQUcsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQy9DLElBQUksWUFBWSxLQUFLLEdBQUcsSUFBSSxZQUFZLEtBQUssRUFBRSxFQUFFLENBQUM7WUFDaEQsT0FBTyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDakMsQ0FBQzthQUFNLENBQUM7WUFDTixPQUFPLGFBQWEsQ0FBQyxHQUFHLFlBQVksSUFBSSxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ3RELENBQUM7SUFDSCxDQUFDO0lBRWEsb0JBQW9CLENBQUMsVUFBa0I7O1lBQ25ELE1BQU0sUUFBUSxHQUFvQixFQUFFLENBQUM7WUFDckMsSUFBSSxVQUFVLENBQUM7WUFFZixJQUFJLENBQUM7Z0JBQ0gsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDckQsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUNaLE9BQU8sRUFBRSxDQUFDO2dCQUNaLENBQUM7Z0JBQ0QsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDakQsSUFBSSxDQUFBLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxJQUFJLE1BQUssUUFBUSxFQUFFLENBQUM7b0JBQzVCLE9BQU8sRUFBRSxDQUFDO2dCQUNaLENBQUM7Z0JBRUQsVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDbkQsQ0FBQztZQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7Z0JBQ3BCLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxPQUFPLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDdEQsSUFBSSxNQUFNLENBQUMsb0NBQW9DLFVBQVUsRUFBRSxDQUFDLENBQUM7Z0JBQy9ELENBQUM7cUJBQU0sQ0FBQztnQkFDUixDQUFDO2dCQUNELE9BQU8sRUFBRSxDQUFDO1lBQ1osQ0FBQztZQUVELEtBQUssTUFBTSxhQUFhLElBQUksVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUMvQyxJQUFJLENBQUM7b0JBQ0gsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztvQkFDdkQsSUFBSSxDQUFBLE9BQU8sYUFBUCxPQUFPLHVCQUFQLE9BQU8sQ0FBRSxJQUFJLE1BQUssUUFBUSxFQUFFLENBQUM7d0JBQy9CLE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQzt3QkFDL0UsTUFBTSxXQUFXLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLENBQUM7d0JBQ25FLFFBQVEsQ0FBQyxJQUFJLENBQUM7NEJBQ1osSUFBSSxFQUFFLFFBQVE7NEJBQ2QsSUFBSSxFQUFFLFVBQVU7NEJBQ2hCLElBQUksRUFBRSxhQUFhOzRCQUNuQixRQUFRLEVBQUUsV0FBVzt5QkFDdEIsQ0FBQyxDQUFDO29CQUNMLENBQUM7eUJBQU0sQ0FBQztvQkFDUixDQUFDO2dCQUNILENBQUM7Z0JBQUMsT0FBTyxTQUFTLEVBQUUsQ0FBQyxDQUFBLENBQUM7WUFDeEIsQ0FBQztZQUVELEtBQUssTUFBTSxRQUFRLElBQUksVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUN4QyxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBRW5FLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDO29CQUFFLFNBQVM7Z0JBQ3RFLE1BQU0sV0FBVyxHQUFHLHNGQUFzRixDQUFDO2dCQUMzRyxNQUFNLFVBQVUsR0FBRywrQkFBK0IsQ0FBQztnQkFDbkQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztvQkFBRSxTQUFTO2dCQUV4RSxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUVyQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMxQyxJQUFJLFVBQVUsRUFBRSxDQUFDO29CQUNmLElBQUksS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDO3dCQUMxRyxTQUFTO29CQUNYLENBQUM7b0JBRUQsTUFBTSxZQUFZLEdBQWlCO3dCQUNqQyxFQUFFLEVBQUUsTUFBTTt3QkFDVixJQUFJLEVBQUUsVUFBVSxDQUFDLElBQUk7d0JBQ3JCLFlBQVksRUFBRSxVQUFVLENBQUMsWUFBWTt3QkFDckMsU0FBUyxFQUFFLFVBQVUsQ0FBQyxTQUFTO3dCQUMvQixTQUFTLEVBQUUsVUFBVSxDQUFDLFNBQVM7d0JBQy9CLGdCQUFnQixFQUFFLFVBQVUsQ0FBQyxnQkFBZ0I7d0JBQzdDLFdBQVcsRUFBRSxVQUFVLENBQUMsV0FBVzt3QkFDbkMsYUFBYSxFQUFFLFVBQVUsQ0FBQyxhQUFhO3FCQUN4QyxDQUFDO29CQUNGLFFBQVEsQ0FBQyxJQUFJLENBQUM7d0JBQ1osSUFBSSxFQUFFLE1BQU07d0JBQ1osUUFBUSxFQUFFLFlBQVk7d0JBQ3RCLFFBQVEsRUFBRSxRQUFRO3FCQUNuQixDQUFDLENBQUM7Z0JBQ0wsQ0FBQztxQkFBTSxDQUFDO2dCQUNSLENBQUM7WUFDSCxDQUFDO1lBRUQsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtnQkFDckIsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU07b0JBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDeEQsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLFFBQVE7b0JBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ3ZELElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDL0MsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3RDLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO29CQUMzQyxNQUFNLEtBQUssR0FBRyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUMxRCxNQUFNLEtBQUssR0FBRyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUMxRCxNQUFNLE1BQU0sR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDN0IsTUFBTSxNQUFNLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQzdCLElBQUksTUFBTSxJQUFJLE1BQU07d0JBQUUsT0FBTyxLQUFLLEdBQUcsS0FBSyxDQUFDO29CQUMzQyxJQUFJLE1BQU07d0JBQUUsT0FBTyxDQUFDLENBQUM7b0JBQ3JCLElBQUksTUFBTTt3QkFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO29CQUN0QixPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN4RCxDQUFDO2dCQUNELE9BQU8sQ0FBQyxDQUFDO1lBQ1gsQ0FBQyxDQUFDLENBQUM7WUFFSCxPQUFPLFFBQVEsQ0FBQztRQUNsQixDQUFDO0tBQUE7SUFFWSxnQkFBZ0I7O1lBQzNCLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDaEMsT0FBTyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDL0QsQ0FBQztLQUFBO0lBRUssc0JBQXNCLENBQUMsSUFBVTs7WUFDckMsSUFBSSxDQUFDO2dCQUNILE1BQU0sSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUVsQixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO2dCQUMzQixNQUFNLFVBQVUsR0FBc0I7b0JBQ3BDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtvQkFDZixZQUFZLEVBQUUsSUFBSSxDQUFDLFlBQVk7b0JBQy9CLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUztvQkFDekIsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO29CQUN6QixnQkFBZ0IsRUFBRSxJQUFJLENBQUMsZ0JBQWdCO29CQUN2QyxXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7b0JBQzdCLGFBQWEsRUFBRSxJQUFJLENBQUMsYUFBYTtpQkFDbEMsQ0FBQztnQkFFRixNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNuRCxNQUFNLGdCQUFnQixHQUNwQixDQUFDLGtCQUFrQjtvQkFDbkIsa0JBQWtCLENBQUMsSUFBSSxLQUFLLFVBQVUsQ0FBQyxJQUFJO29CQUMzQyxrQkFBa0IsQ0FBQyxZQUFZLEtBQUssVUFBVSxDQUFDLFlBQVk7b0JBQzNELGtCQUFrQixDQUFDLFNBQVMsS0FBSyxVQUFVLENBQUMsU0FBUztvQkFDckQsa0JBQWtCLENBQUMsU0FBUyxLQUFLLFVBQVUsQ0FBQyxTQUFTO29CQUNyRCxrQkFBa0IsQ0FBQyxnQkFBZ0IsS0FBSyxVQUFVLENBQUMsZ0JBQWdCO29CQUNuRSxrQkFBa0IsQ0FBQyxXQUFXLEtBQUssVUFBVSxDQUFDLFdBQVc7b0JBQ3pELGtCQUFrQixDQUFDLGFBQWEsS0FBSyxVQUFVLENBQUMsYUFBYSxDQUFDO2dCQUVoRSxJQUFJLGdCQUFnQixFQUFFLENBQUM7b0JBQ3JCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLFVBQVUsQ0FBQztvQkFDckMsTUFBTSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7b0JBQ25CLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7Z0JBQ3hDLENBQUM7cUJBQU0sQ0FBQztnQkFFaEIsQ0FBQztnQkFDRCxPQUFPLElBQUksQ0FBQztZQUNkLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNmLE9BQU8sS0FBSyxDQUFDO1lBQ2YsQ0FBQztRQUNILENBQUM7S0FBQTtJQUdHLGFBQWEsQ0FBQyxJQUFhLEVBQUUsVUFBbUI7O1lBQ3BELE1BQU0sWUFBWSxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDO1lBQ25GLE1BQU0sZUFBZSxHQUFHLFlBQVksS0FBSyxFQUFFLElBQUksWUFBWSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUM7WUFFekYsSUFBSSxDQUFDO2dCQUNELE1BQU0sSUFBSSxDQUFDLDBCQUEwQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzNELENBQUM7WUFBQyxPQUFPLFdBQVcsRUFBRSxDQUFDO2dCQUVuQixJQUFJLE1BQU0sQ0FBQywwQ0FBMEMsZUFBZSxFQUFFLENBQUMsQ0FBQztnQkFDeEUsT0FBTyxJQUFJLENBQUM7WUFDaEIsQ0FBQztZQUVELElBQUksQ0FBQztnQkFDRCxNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO2dCQUN2QixNQUFNLEtBQUssR0FBRyxNQUFNLEVBQUUsQ0FBQztnQkFDdkIsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUUsZUFBZSxDQUFDLENBQUM7Z0JBRTlELE1BQU0sZUFBZSxHQUFpQjtvQkFDbEMsRUFBRSxFQUFFLEtBQUs7b0JBQ1QsSUFBSSxFQUFFLElBQUksSUFBSSxRQUFRLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFO29CQUN0SCxTQUFTLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsU0FBUztvQkFDekMsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCO29CQUN2RCxXQUFXLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVztvQkFDN0MsYUFBYSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWE7b0JBQ2pELFNBQVMsRUFBRSxHQUFHLENBQUMsV0FBVyxFQUFFO29CQUM1QixZQUFZLEVBQUUsR0FBRyxDQUFDLFdBQVcsRUFBRTtpQkFDbEMsQ0FBQztnQkFFRixNQUFNLG1CQUFtQixxQkFBaUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUUsQ0FBQztnQkFDakYsTUFBTSxRQUFRLEdBQXFCLEVBQUUsUUFBUSxFQUFFLGVBQWUsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUM7Z0JBRS9FLE1BQU0sT0FBTyxHQUFHLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBRTdGLE1BQU0sVUFBVSxHQUFzQjtvQkFDbEMsSUFBSSxFQUFFLGVBQWUsQ0FBQyxJQUFJO29CQUMxQixZQUFZLEVBQUUsZUFBZSxDQUFDLFlBQVk7b0JBQzFDLFNBQVMsRUFBRSxlQUFlLENBQUMsU0FBUztvQkFDcEMsU0FBUyxFQUFFLGVBQWUsQ0FBQyxTQUFTO29CQUNwQyxnQkFBZ0IsRUFBRSxlQUFlLENBQUMsZ0JBQWdCO29CQUNsRCxXQUFXLEVBQUUsZUFBZSxDQUFDLFdBQVc7b0JBQ3hDLGFBQWEsRUFBRSxlQUFlLENBQUMsYUFBYTtpQkFDL0MsQ0FBQztnQkFDRixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxHQUFHLFVBQVUsQ0FBQztnQkFDbkMsTUFBTSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBSTNCLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxPQUFPLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQ3pELElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO29CQUNwQixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQzdCLE1BQU0sSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO29CQUVqQixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO29CQUVoRCxJQUFJLE1BQU0sQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO29CQUNuRCxPQUFPLElBQUksQ0FBQztnQkFDaEIsQ0FBQztnQkFFRCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxHQUFHLE9BQU8sQ0FBQztnQkFHbEMsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUVoQyxPQUFPLE9BQU8sQ0FBQztZQUNuQixDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDUCxJQUFJLE1BQU0sQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO2dCQUNyRCxPQUFPLElBQUksQ0FBQztZQUNoQixDQUFDO1FBQ0gsQ0FBQztLQUFBO0lBRWUsMEJBQTBCLENBQUMsVUFBa0I7O1lBQ3pELElBQUksQ0FBQyxVQUFVLElBQUksVUFBVSxLQUFLLEdBQUcsSUFBSSxVQUFVLEtBQUssR0FBRztnQkFBRSxPQUFPO1lBRXBFLE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUM3QyxJQUFJLFVBQVUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUN2RCxNQUFNLElBQUksS0FBSyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7WUFDMUQsQ0FBQztZQUVELElBQUksQ0FBQztnQkFDSCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNyRCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQ1osTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDdkMsQ0FBQztxQkFBTSxDQUFDO29CQUNOLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBQ2pELElBQUksQ0FBQSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsSUFBSSxNQUFLLFFBQVEsRUFBRSxDQUFDO3dCQUNsQixNQUFNLElBQUksS0FBSyxDQUFDLGVBQWUsVUFBVSxtQkFBbUIsQ0FBQyxDQUFDO29CQUMxRSxDQUFDO2dCQUNILENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDVCxNQUFNLElBQUksS0FBSyxDQUNuQixrQ0FBa0MsVUFBVSxZQUFZLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUNqSCxDQUFDO1lBQ0osQ0FBQztRQUNILENBQUM7S0FBQTtJQUdELGtCQUFrQjtRQUNoQixPQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQzthQUNsQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxVQUFVLENBQUMsRUFBdUIsRUFBRTtZQUM3QyxJQUNFLENBQUMsVUFBVTtnQkFDWCxPQUFPLFVBQVUsS0FBSyxRQUFRO2dCQUM5QixPQUFPLFVBQVUsQ0FBQyxJQUFJLEtBQUssUUFBUTtnQkFDbkMsT0FBTyxVQUFVLENBQUMsWUFBWSxLQUFLLFFBQVE7Z0JBQzNDLE9BQU8sVUFBVSxDQUFDLFNBQVMsS0FBSyxRQUFRLEVBQ3hDLENBQUM7Z0JBQ0QsT0FBTyxJQUFJLENBQUM7WUFDZCxDQUFDO1lBQ0QsTUFBTSxXQUFXLEdBQUcsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ3RELE1BQU0sV0FBVyxHQUFHLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNuRCxJQUFJLEtBQUssQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsSUFBSSxLQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFDakUsT0FBTyxJQUFJLENBQUM7WUFDZCxDQUFDO1lBQ0QsT0FBTztnQkFDTCxFQUFFO2dCQUNGLElBQUksRUFBRSxVQUFVLENBQUMsSUFBSTtnQkFDckIsWUFBWSxFQUFFLFVBQVUsQ0FBQyxZQUFZO2dCQUNyQyxTQUFTLEVBQUUsVUFBVSxDQUFDLFNBQVM7Z0JBQy9CLFNBQVMsRUFBRSxVQUFVLENBQUMsU0FBUztnQkFDL0IsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLGdCQUFnQjtnQkFDN0MsV0FBVyxFQUFFLFVBQVUsQ0FBQyxXQUFXO2dCQUNuQyxhQUFhLEVBQUUsVUFBVSxDQUFDLGFBQWE7YUFDeEMsQ0FBQztRQUNKLENBQUMsQ0FBQzthQUNELE1BQU0sQ0FBQyxDQUFDLFFBQVEsRUFBNEIsRUFBRSxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUM7YUFDakUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ2IsTUFBTSxLQUFLLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2pELE1BQU0sS0FBSyxHQUFHLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNqRCxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ25DLElBQUksS0FBSyxLQUFLLEtBQUs7b0JBQUUsT0FBTyxLQUFLLEdBQUcsS0FBSyxDQUFDO1lBQzVDLENBQUM7aUJBQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7Z0JBQUUsT0FBTyxDQUFDLENBQUM7aUJBQzlCLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO2dCQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDbEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2pELE1BQU0sUUFBUSxHQUFHLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNqRCxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQ3pDLE9BQU8sUUFBUSxHQUFHLFFBQVEsQ0FBQztZQUM3QixDQUFDO2lCQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDO2dCQUFFLE9BQU8sQ0FBQyxDQUFDO2lCQUNqQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQztnQkFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RDLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVELGVBQWU7UUFDYixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUM7SUFDM0IsQ0FBQztJQUlZLG1CQUFtQjs7WUFDOUIsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDeEMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUVWLE1BQU0sSUFBSSxLQUFLLENBQUMsNENBQTRDLENBQUMsQ0FBQztZQUNoRSxDQUFDO1lBQ0QsT0FBTyxJQUFJLENBQUM7UUFDZCxDQUFDO0tBQUE7SUFFWSw2QkFBNkI7NkRBQUMsY0FBdUIsRUFBRSxZQUFxQixJQUFJO1lBQzNGLE1BQU0sb0JBQW9CLEdBQUcsY0FBYyxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUVoRSxNQUFNLGtCQUFrQixHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3RELElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO2dCQUl4QixPQUFPLElBQUksQ0FBQztZQUNkLENBQUM7WUFHRCxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUM1QixjQUFjLENBQUMsU0FBUyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7WUFDbEMsQ0FBQztZQUVULGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7WUFHakQsTUFBTSxnQkFBZ0IsR0FBRyxrQkFBa0IsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUlqRSxJQUFJLGdCQUFnQixFQUFFLENBQUM7Z0JBQ2YsTUFBTSx5QkFBeUIsR0FBRyxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUN4RixJQUFJLENBQUMseUJBQXlCLEVBQUUsQ0FBQztnQkFDckIsQ0FBQztZQUNqQixDQUFDO1lBRUQsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFFZCxNQUFNLDJCQUEyQixHQUFHLElBQUksQ0FBQyxZQUFZLElBQUksa0JBQWtCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztnQkFDbEYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUUsTUFBTSxFQUFFLDJCQUEyQixFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1lBQzVHLENBQUM7WUFDRCxPQUFPLGNBQWMsQ0FBQztRQUN4QixDQUFDO0tBQUE7SUFFRyxPQUFPLENBQUMsRUFBVSxFQUFFLFFBQWlCOzs7WUFDekMsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZCLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNoQyxDQUFDO1lBRUQsSUFBSSxjQUFjLEdBQXVCLFFBQVEsQ0FBQztZQUNsRCxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBRWxCLElBQUksQ0FBQztvQkFDRCxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO29CQUNoRCxjQUFjLEdBQUcsTUFBQSxJQUFJLENBQUMsdUJBQXVCLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxtQ0FBSSxTQUFTLENBQUM7b0JBQzFFLElBQUksY0FBYyxFQUFFLENBQUM7b0JBRXJCLENBQUM7eUJBQU0sQ0FBQztvQkFFUixDQUFDO2dCQUNMLENBQUM7Z0JBQUMsT0FBTyxjQUFjLEVBQUUsQ0FBQztvQkFDWixjQUFjLEdBQUcsU0FBUyxDQUFDO2dCQUN6QyxDQUFDO1lBQ0wsQ0FBQztZQUdELElBQUksQ0FBQyxjQUFjLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQVN4QyxPQUFPLElBQUksQ0FBQztZQUNoQixDQUFDO1lBR0QsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDbkMsT0FBTyxJQUFJLENBQUM7WUFDdEIsQ0FBQztZQU1ELElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDVixPQUFPLElBQUksQ0FBQztZQUN4QixDQUFDO1lBR0QsSUFBSSxDQUFDO2dCQUVELE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBRXRHLElBQUksSUFBSSxFQUFFLENBQUM7b0JBQ1AsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7b0JBRzVCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQ3RDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7b0JBQ2xDLE1BQU0sZ0JBQWdCLEdBQ2xCLENBQUMsVUFBVTt3QkFDWCxVQUFVLENBQUMsSUFBSSxLQUFLLFdBQVcsQ0FBQyxJQUFJO3dCQUNwQyxVQUFVLENBQUMsWUFBWSxLQUFLLFdBQVcsQ0FBQyxZQUFZO3dCQUNwRCxVQUFVLENBQUMsU0FBUyxLQUFLLFdBQVcsQ0FBQyxTQUFTO3dCQUM5QyxVQUFVLENBQUMsU0FBUyxLQUFLLFdBQVcsQ0FBQyxTQUFTO3dCQUM5QyxVQUFVLENBQUMsZ0JBQWdCLEtBQUssV0FBVyxDQUFDLGdCQUFnQjt3QkFDNUQsVUFBVSxDQUFDLFdBQVcsS0FBSyxXQUFXLENBQUMsV0FBVzt3QkFDbEQsVUFBVSxDQUFDLGFBQWEsS0FBSyxXQUFXLENBQUMsYUFBYSxDQUFDO29CQUUzRCxJQUFJLGdCQUFnQixFQUFFLENBQUM7d0JBRW5CLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDO29CQUM1QyxDQUFDO29CQUNELE9BQU8sSUFBSSxDQUFDO2dCQUNoQixDQUFDO3FCQUFNLENBQUM7b0JBR0osTUFBTSxJQUFJLENBQUMsa0NBQWtDLENBQUMsRUFBRSxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFFekUsSUFBSSxJQUFJLENBQUMsWUFBWSxLQUFLLEVBQUUsRUFBRSxDQUFDO3dCQUNiLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDakQsQ0FBQztvQkFDRCxPQUFPLElBQUksQ0FBQztnQkFDaEIsQ0FBQztZQUNMLENBQUM7WUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO2dCQUNaLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFFaEMsTUFBTSxJQUFJLENBQUMsa0NBQWtDLENBQUMsRUFBRSxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFFekUsSUFBSSxJQUFJLENBQUMsWUFBWSxLQUFLLEVBQUUsRUFBRSxDQUFDO3dCQUNiLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDakQsQ0FBQztnQkFDTCxDQUFDO2dCQUdELE9BQU8sSUFBSSxDQUFDO1lBQ2hCLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFFUyx1QkFBdUIsQ0FBQyxNQUFjLEVBQUUsS0FBc0I7UUFDcEUsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUN6QixJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxLQUFLLE1BQU0sRUFBRSxDQUFDO2dCQUN4RCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUM7WUFDdkIsQ0FBQztpQkFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQ2xDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN6RSxJQUFJLFlBQVksRUFBRSxDQUFDO29CQUNqQixPQUFPLFlBQVksQ0FBQztnQkFDdEIsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBSUssYUFBYTs7WUFDakIsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDdkIsT0FBTyxJQUFJLENBQUM7WUFDZCxDQUFDO1lBQ0QsSUFBSSxJQUFJLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ3pFLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQztZQUN6QixDQUFDO1lBRUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNuRCxJQUFJLElBQUksRUFBRSxDQUFDO2dCQUNULElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDO2dCQUN2QixPQUFPLElBQUksQ0FBQztZQUNkLENBQUM7aUJBQU0sQ0FBQztnQkFDTixNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUNoRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzNELE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFFOUQsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUN2QyxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUM7WUFDekIsQ0FBQztRQUNILENBQUM7S0FBQTtJQUVZLGFBQWEsQ0FBQyxFQUFpQjs7WUFDMUMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDO1lBRTNDLElBQUksRUFBRSxLQUFLLGdCQUFnQixFQUFFLENBQUM7Z0JBQzVCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUMzQixJQUFJLENBQUMsVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDM0MsQ0FBQztnQkFDRCxPQUFPO1lBQ1QsQ0FBQztZQUVELElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQUN4QixNQUFNLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO2dCQUN6QyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO29CQUNoQixJQUFJLE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO29CQUM1RSxPQUFPO2dCQUNULENBQUM7WUFDSCxDQUFDO1lBRUQsSUFBSSxDQUFDLFlBQVksR0FBRyxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7WUFDdkIsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUV0RCxJQUFJLFVBQVUsR0FBZ0IsSUFBSSxDQUFDO1lBQ25DLElBQUksRUFBRSxFQUFFLENBQUM7Z0JBQ1AsVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDcEMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUNSLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO29CQUNqQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxDQUFDO29CQUN4RCxFQUFFLEdBQUcsSUFBSSxDQUFDO2dCQUNaLENBQUM7cUJBQU0sQ0FBQztvQkFDTixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztnQkFDL0IsQ0FBQztZQUNILENBQUM7aUJBQU0sQ0FBQztZQUNSLENBQUM7WUFFRCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7S0FBQTtJQUVLLHNCQUFzQjs2REFDMUIsSUFBaUIsRUFDakIsT0FBZSxFQUNmLFNBQWdCLEVBQ2hCLFlBQXFCLElBQUksRUFDekIsVUFBdUIsRUFDdkIsWUFBcUIsRUFDckIsSUFBYTtZQUViLE1BQU0sZ0JBQWdCLEdBQUcsU0FBUyxJQUFJLElBQUksSUFBSSxFQUFFLENBQUM7WUFDakQsTUFBTSxVQUFVLEdBQVk7Z0JBQ3hCLElBQUk7Z0JBQ0osT0FBTztnQkFDUCxTQUFTLEVBQUUsZ0JBQWdCO2FBQzlCLENBQUM7WUFHRixJQUFJLFVBQVUsSUFBSSxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN4QyxVQUFVLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztZQUNyQyxDQUFDO1lBQ0QsSUFBSSxZQUFZLEVBQUUsQ0FBQztnQkFDakIsVUFBVSxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7WUFDekMsQ0FBQztZQUNELElBQUksSUFBSSxFQUFFLENBQUM7Z0JBQ1QsVUFBVSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7WUFDekIsQ0FBQztZQUdELE9BQU8sTUFBTSxJQUFJLENBQUMsNkJBQTZCLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3pFLENBQUM7S0FBQTtJQUVLLHVCQUF1Qjs7WUFDM0IsTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDOUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNoQixPQUFPO1lBQ1QsQ0FBQztZQUNELElBQUksVUFBVSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3JDLE9BQU87WUFDVCxDQUFDO1lBRUQsVUFBVSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBRTNCLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzlDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDL0QsQ0FBQztLQUFBO0lBRUssd0JBQXdCLENBQzVCLGNBQWdGOzs7WUFFaEYsTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDOUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNoQixJQUFJLE1BQU0sQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO2dCQUNyRCxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7WUFDRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNqRCxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7WUFDRyxNQUFNLFdBQVcsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDO1lBQzdELE1BQU0sWUFBWSxHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDO1lBRW5ELE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDLENBQUM7WUFFMUQsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDSixNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFFdEQsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQztnQkFDcEMsSUFBSSxXQUFXLEdBQUcsS0FBSyxDQUFDO2dCQUN4QixJQUFJLFlBQVksR0FBRyxLQUFLLENBQUM7Z0JBQ3pCLElBQUksY0FBYyxDQUFDLGdCQUFnQixLQUFLLFNBQVMsSUFBSSxXQUFXLEtBQUssT0FBTyxDQUFDLGdCQUFnQixFQUFFLENBQUM7b0JBQzlGLFdBQVcsR0FBRyxJQUFJLENBQUM7Z0JBQ3JCLENBQUM7Z0JBQ0QsSUFBSSxjQUFjLENBQUMsU0FBUyxLQUFLLFNBQVMsSUFBSSxZQUFZLEtBQUssT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDO29CQUNqRixZQUFZLEdBQUcsSUFBSSxDQUFDO2dCQUN0QixDQUFDO2dCQUVELElBQUksV0FBVyxFQUFFLENBQUM7b0JBQ2hCLElBQUksQ0FBQzt3QkFDSCxNQUFNLFdBQVcsR0FBRyxNQUFBLE9BQU8sQ0FBQyxnQkFBZ0IsbUNBQUksU0FBUyxDQUFDO3dCQUMxRCxNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsV0FBVyxDQUFDLENBQUM7d0JBRXRFLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxXQUFXLGFBQVgsV0FBVyxjQUFYLFdBQVcsR0FBSSxNQUFNLENBQUMsQ0FBQzt3QkFDeEQsTUFBQSxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSwwQ0FBRSxjQUFjLGtEQUFJLENBQUM7b0JBQ2hELENBQUM7b0JBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztvQkFDSCxDQUFDO2dCQUNiLENBQUM7Z0JBQ0QsSUFBSSxZQUFZLEVBQUUsQ0FBQztvQkFDakIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxTQUFTLElBQUksRUFBRSxDQUFDLENBQUM7b0JBQzNELE1BQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsMENBQUUsc0JBQXNCLGtEQUFJLENBQUM7Z0JBQ3hELENBQUM7Z0JBQ0ssSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztnQkFDL0YsT0FBTyxJQUFJLENBQUM7WUFDZCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sT0FBTyxLQUFLLENBQUM7WUFDZixDQUFDO1FBQ0gsQ0FBQztLQUFBO0lBS0g7Ozs7OztPQU1HO0lBQ1csa0NBQWtDOzZEQUM5QyxFQUFVLEVBQ1YsUUFBdUIsRUFDdkIsYUFBc0IsSUFBSTtZQUUxQixNQUFNLFlBQVksR0FBRyxRQUFRLGFBQVIsUUFBUSxjQUFSLFFBQVEsR0FBSSxjQUFjLENBQUM7WUFDaEQsSUFBSSxZQUFZLEdBQUcsS0FBSyxDQUFDO1lBR3pCLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQUN2QixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDMUIsQ0FBQztZQUVQLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQUNyQixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzFCLFlBQVksR0FBRyxJQUFJLENBQUM7WUFDbEIsQ0FBQztpQkFBTSxDQUFDO1lBQ1IsQ0FBQztZQUdQLElBQUksVUFBVSxJQUFJLFFBQVEsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRLElBQUksUUFBUSxLQUFLLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDeEcsSUFBSSxDQUFDO29CQUNELE1BQU0sVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ3ZELElBQUksVUFBVSxFQUFFLENBQUM7d0JBQ2IsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDL0MsSUFBSSxDQUFBLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxJQUFJLE1BQUssTUFBTSxFQUFFLENBQUM7NEJBQ3hCLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7d0JBQ3RCLENBQUM7NkJBQU0sQ0FBQzt3QkFDUCxDQUFDO29CQUN4QixDQUFDO3lCQUFNLENBQUM7b0JBQ08sQ0FBQztnQkFDcEIsQ0FBQztnQkFBQyxPQUFPLENBQU0sRUFBRSxDQUFDO29CQUNKLElBQUksTUFBTSxDQUFDLHdCQUF3QixRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFFOUUsQ0FBQztZQUNMLENBQUM7aUJBQU0sSUFBSSxVQUFVLElBQUksUUFBUSxFQUFFLENBQUM7WUFFN0IsQ0FBQztZQUdSLElBQUksWUFBWSxFQUFFLENBQUM7Z0JBQ2YsTUFBTSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDekIsQ0FBQztZQUNQLE9BQU8sWUFBWSxDQUFDO1FBQ3RCLENBQUM7S0FBQTtJQUlLLFVBQVUsQ0FBQyxFQUFVOztZQUN6QixNQUFNLGtCQUFrQixHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2hELE1BQU0sU0FBUyxHQUFHLEVBQUUsS0FBSyxJQUFJLENBQUMsWUFBWSxDQUFDO1lBRTNDLElBQUksUUFBUSxHQUFrQixJQUFJLENBQUM7WUFDbkMsSUFBSSxDQUFDO2dCQUVELE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQ2hELFFBQVEsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUN2RCxJQUFJLENBQUMsUUFBUSxJQUFJLGtCQUFrQixFQUFFLENBQUM7Z0JBQzNCLENBQUM7WUFDaEIsQ0FBQztZQUFDLE9BQU8sY0FBYyxFQUFFLENBQUM7WUFFMUIsQ0FBQztZQUdELElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO2dCQUM3QixPQUFPLEtBQUssQ0FBQztZQUN2QixDQUFDO1lBRUQsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDO1lBRW5CLElBQUksV0FBVyxHQUF1QyxJQUFJLENBQUM7WUFFM0QsSUFBSSxDQUFDO2dCQUVELE1BQU0sZUFBZSxHQUFHLE1BQU0sSUFBSSxDQUFDLGtDQUFrQyxDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBRzFGLElBQUksU0FBUyxFQUFFLENBQUM7b0JBRVosTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztvQkFDbkQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLFlBQVksQ0FBQyxDQUFDO29CQUM5RCxNQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBSTlELE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFHM0MsQ0FBQztxQkFBTSxJQUFJLGVBQWUsRUFBRSxDQUFDO29CQUdmLFdBQVcsR0FBRyxFQUFFLElBQUksRUFBRSxtQkFBbUIsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUM7Z0JBQzNFLENBQUM7WUFFTCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDUCxJQUFJLE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO2dCQUM5RCxPQUFPLEdBQUcsS0FBSyxDQUFDO2dCQUVoQixNQUFNLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO2dCQUVuQyxXQUFXLEdBQUcsRUFBRSxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDO1lBQ2pFLENBQUM7b0JBQVMsQ0FBQztnQkFFUCxJQUFJLFdBQVcsRUFBRSxDQUFDO29CQUNGLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNyRSxDQUFDO3FCQUFNLElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQ1osQ0FBQztxQkFBTSxDQUFDO2dCQUNSLENBQUM7Z0JBR1osSUFBSSxPQUFPLElBQUksa0JBQWtCLEVBQUUsQ0FBQztvQkFDaEMsSUFBSSxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ3RCLENBQUM7cUJBQU0sSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7Z0JBQ2hDLENBQUM7WUFDaEIsQ0FBQztZQUVELE9BQU8sT0FBTyxJQUFJLGtCQUFrQixDQUFDO1FBQ3ZDLENBQUM7S0FBQTtJQUVPLFNBQVMsQ0FBQyxhQUFxQjs7WUFDbkMsSUFBSSxnQkFBZ0IsR0FBa0IsSUFBSSxDQUFDO1lBQzNDLElBQUksQ0FBQztnQkFDSCxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUNoRCxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzVFLENBQUM7WUFBQyxPQUFPLGNBQWMsRUFBRSxDQUFDO2dCQUNsQixJQUFJLE1BQU0sQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO2dCQUM3RCxPQUFPLElBQUksQ0FBQztZQUNkLENBQUM7WUFFRCxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDaEIsSUFBSSxNQUFNLENBQUMsb0NBQW9DLENBQUMsQ0FBQztnQkFDdkQsT0FBTyxJQUFJLENBQUM7WUFDZCxDQUFDO1lBQ0QsTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ3pFLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDWixJQUFJLE1BQU0sQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO2dCQUN2RCxPQUFPLElBQUksQ0FBQztZQUNkLENBQUM7WUFFRCxNQUFNLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQztZQUM3RixNQUFNLGVBQWUsR0FBRyxZQUFZLEtBQUssRUFBRSxJQUFJLFlBQVksS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDO1lBRXpGLElBQUksQ0FBQztnQkFDSCxNQUFNLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN6RCxDQUFDO1lBQUMsT0FBTyxXQUFXLEVBQUUsQ0FBQztnQkFDckIsSUFBSSxNQUFNLENBQUMsNkNBQTZDLGVBQWUsRUFBRSxDQUFDLENBQUM7Z0JBQzNFLE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQztZQUVELElBQUksQ0FBQztnQkFDSCxNQUFNLFVBQVUsR0FBRyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3pDLE1BQU0sR0FBRyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7Z0JBQ3ZCLE1BQU0sS0FBSyxHQUFHLE1BQU0sRUFBRSxDQUFDO2dCQUN2QixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxlQUFlLENBQUMsQ0FBQztnQkFFakUsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDO2dCQUMvQixVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxXQUFXLFlBQVksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ25FLFVBQVUsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDbEQsVUFBVSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEdBQUcsR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNyRCxVQUFVLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQztnQkFDaEUsVUFBVSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDO2dCQUM5RSxVQUFVLENBQUMsUUFBUSxDQUFDLFdBQVcsR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQztnQkFDcEUsVUFBVSxDQUFDLFFBQVEsQ0FBQyxhQUFhLEdBQUcsWUFBWSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUM7Z0JBRXhFLE1BQU0sbUJBQW1CLHFCQUFpQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBRSxDQUFDO2dCQUNqRixNQUFNLFVBQVUsR0FBRyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLG1CQUFtQixFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUVyRyxNQUFNLFVBQVUsR0FBc0I7b0JBQ3BDLElBQUksRUFBRSxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUk7b0JBQzlCLFlBQVksRUFBRSxVQUFVLENBQUMsUUFBUSxDQUFDLFlBQVk7b0JBQzlDLFNBQVMsRUFBRSxVQUFVLENBQUMsUUFBUSxDQUFDLFNBQVM7b0JBQ3hDLFNBQVMsRUFBRSxVQUFVLENBQUMsUUFBUSxDQUFDLFNBQVM7b0JBQ3hDLGdCQUFnQixFQUFFLFVBQVUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCO29CQUN0RCxXQUFXLEVBQUUsVUFBVSxDQUFDLFFBQVEsQ0FBQyxXQUFXO29CQUM1QyxhQUFhLEVBQUUsVUFBVSxDQUFDLFFBQVEsQ0FBQyxhQUFhO2lCQUNqRCxDQUFDO2dCQUNGLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsVUFBVSxDQUFDO2dCQUNuQyxNQUFNLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFHM0IsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLFVBQVUsQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDNUQsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7b0JBQ3RCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDN0IsTUFBTSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7b0JBQzNCLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7b0JBQzlCLElBQUksTUFBTSxDQUFDLDZDQUE2QyxDQUFDLENBQUM7b0JBQ2xFLE9BQU8sSUFBSSxDQUFDO2dCQUNkLENBQUM7Z0JBRUQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxVQUFVLENBQUM7Z0JBQ3JDLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFFaEMsT0FBTyxVQUFVLENBQUM7WUFDcEIsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ1QsSUFBSSxNQUFNLENBQUMsMkNBQTJDLENBQUMsQ0FBQztnQkFDOUQsT0FBTyxJQUFJLENBQUM7WUFDZCxDQUFDO1FBQ0gsQ0FBQztLQUFBO0lBRUssbUJBQW1CLENBQUMsTUFBYyxFQUFFLHlCQUFpQzs7WUFDekUsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDSixPQUFPLEtBQUssQ0FBQztZQUNyQixDQUFDO1lBRUQsSUFBSSx5QkFBeUIsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDMUQsT0FBTyxJQUFJLENBQUM7WUFDZCxDQUFDO1lBQ0QsSUFBSSx5QkFBeUIsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNuQyxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7WUFFRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztZQUM1QyxNQUFNLFlBQVksR0FBRyx5QkFBeUIsR0FBRyxDQUFDLENBQUM7WUFDbkQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsWUFBWSxDQUFDO1lBRXBDLElBQUksQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFeEIsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFeEMsSUFBSSxJQUFJLENBQUMsWUFBWSxLQUFLLE1BQU0sRUFBRSxDQUFDO2dCQUNqQyxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztnQkFFdkIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzFFLENBQUM7WUFFRCxPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7S0FBQTtJQUVLLHdCQUF3QixDQUFDLE1BQWMsRUFBRSxpQkFBdUI7O1lBQ3BFLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN4QyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ0osSUFBSSxNQUFNLENBQUMsZUFBZSxNQUFNLGFBQWEsQ0FBQyxDQUFDO2dCQUNyRCxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7WUFFRCxNQUFNLFVBQVUsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUMvQyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUM7WUFDdkIsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFFdEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQzlDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUN6RCxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxHQUFHLFVBQVUsQ0FBQyxHQUFHLFNBQVMsRUFBRSxDQUFDO29CQUMxRSxZQUFZLEdBQUcsQ0FBQyxDQUFDO29CQUNqQixNQUFNO2dCQUNSLENBQUM7cUJBQU0sSUFBSSxLQUFLLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztnQkFDaEMsQ0FBQztZQUNILENBQUM7WUFFRCxJQUFJLFlBQVksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUN4QixJQUFJLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO2dCQUNqQyxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7WUFHRCxPQUFPLE1BQU0sSUFBSSxDQUFDLDRCQUE0QixDQUFDLElBQUksRUFBRSxZQUFZLENBQUMsQ0FBQztRQUNyRSxDQUFDO0tBQUE7SUFFYSw0QkFBNEIsQ0FBQyxJQUFVLEVBQUUsWUFBb0I7O1lBQ3pFLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ2hDLElBQUksQ0FBQztnQkFDSCxJQUFJLFlBQVksR0FBRyxDQUFDLElBQUksWUFBWSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQ3JELE9BQU8sS0FBSyxDQUFDO2dCQUN2QixDQUFDO2dCQUVELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFFaEUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDeEIsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBRXhDLElBQUksSUFBSSxDQUFDLFlBQVksS0FBSyxNQUFNLEVBQUUsQ0FBQztvQkFDakMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7b0JBRXZCLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFDMUUsQ0FBQztnQkFFRCxJQUFJLGNBQWMsRUFBRSxDQUFDO29CQUNuQixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLGNBQWMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO2dCQUMvRixDQUFDO2dCQUVELE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ1QsSUFBSSxNQUFNLENBQUMseUJBQXlCLENBQUMsQ0FBQztnQkFDNUMsT0FBTyxLQUFLLENBQUM7WUFDZixDQUFDO1FBQ0gsQ0FBQztLQUFBO0lBRUsscUJBQXFCLENBQUMsTUFBYzs7WUFDeEMsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDSixJQUFJLE1BQU0sQ0FBQyxlQUFlLE1BQU0sYUFBYSxDQUFDLENBQUM7Z0JBQ3JELE9BQU8sS0FBSyxDQUFDO1lBQ2YsQ0FBQztZQUVELElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQy9CLE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQztZQUVELElBQUksQ0FBQztnQkFDSCxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3JCLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUV4QyxNQUFNLFFBQVEsR0FBRyxNQUFNLEtBQUssSUFBSSxDQUFDLFlBQVksQ0FBQztnQkFDOUMsSUFBSSxRQUFRLEVBQUUsQ0FBQztvQkFDYixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztvQkFFdkIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQy9DLENBQUM7Z0JBQ0QsSUFBSSxNQUFNLENBQUMsOEJBQThCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQztnQkFDakUsT0FBTyxJQUFJLENBQUM7WUFDZCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDVCxJQUFJLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO2dCQUM3QyxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFFSyxVQUFVLENBQUMsTUFBYyxFQUFFLE9BQWU7O1lBQzlDLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLElBQUksTUFBTSxDQUFDLDRCQUE0QixDQUFDLENBQUM7Z0JBQ3pDLE9BQU8sS0FBSyxDQUFDO1lBQ2YsQ0FBQztZQUNELElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO2dCQUNyQyxJQUFJLE1BQU0sQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO2dCQUNyRCxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7WUFFRCxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFeEMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNKLElBQUksTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7Z0JBQ3BDLE9BQU8sS0FBSyxDQUFDO1lBQ2YsQ0FBQztZQUVELElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEtBQUssV0FBVyxFQUFFLENBQUM7Z0JBQ3ZDLE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQztZQUVELElBQUksQ0FBQztnQkFDSCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7Z0JBRTNELElBQUksT0FBTyxFQUFFLENBQUM7b0JBQ1osTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBRXhDLElBQUksSUFBSSxDQUFDLFlBQVksS0FBSyxNQUFNLEVBQUUsQ0FBQzt3QkFDakMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7d0JBQ3ZCLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztvQkFDMUUsQ0FBQztvQkFDRCxJQUFJLE1BQU0sQ0FBQyxvQkFBb0IsV0FBVyxJQUFJLENBQUMsQ0FBQztvQkFDaEQsT0FBTyxJQUFJLENBQUM7Z0JBQ2QsQ0FBQztxQkFBTSxDQUFDO29CQUNOLE9BQU8sS0FBSyxDQUFDO2dCQUNmLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDVCxJQUFJLE1BQU0sQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO2dCQUMvRCxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFJRDs7OztPQUlHO0lBQ0csWUFBWSxDQUFDLFVBQWtCOztZQUNuQyxNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7WUFHakQsSUFBSSxDQUFDLGNBQWMsSUFBSSxjQUFjLEtBQUssR0FBRyxJQUFJLGNBQWMsS0FBSyxHQUFHLEVBQUUsQ0FBQztnQkFDbEUsSUFBSSxNQUFNLENBQUMsc0JBQXNCLENBQUMsQ0FBQztnQkFDekMsT0FBTyxLQUFLLENBQUM7WUFDZixDQUFDO1lBQ0QsSUFBSSxjQUFjLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDL0QsSUFBSSxNQUFNLENBQUMsZ0RBQWdELENBQUMsQ0FBQztnQkFDbkUsT0FBTyxLQUFLLENBQUM7WUFDZixDQUFDO1lBRUQsSUFBSSxDQUFDO2dCQUNILE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQ3pELElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ1gsSUFBSSxNQUFNLENBQUMsSUFBSSxjQUFjLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO29CQUNuRSxPQUFPLEtBQUssQ0FBQztnQkFDZixDQUFDO2dCQUVELE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBRXpDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7Z0JBQ3RDLE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQztZQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7Z0JBQ3BCLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxPQUFPLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDOUMsSUFBSSxNQUFNLENBQUMsbUNBQW1DLENBQUMsQ0FBQztnQkFDMUQsQ0FBQztxQkFBTSxDQUFDO29CQUNFLElBQUksTUFBTSxDQUFDLDRCQUE0QixLQUFLLENBQUMsT0FBTyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7Z0JBQ3JGLENBQUM7Z0JBQ0QsT0FBTyxLQUFLLENBQUM7WUFDZixDQUFDO1FBQ0gsQ0FBQztLQUFBO0lBRUQ7Ozs7Ozs7O09BUUc7SUFDRyxZQUFZLENBQUMsT0FBZSxFQUFFLE9BQWU7O1lBQ2pELE1BQU0sV0FBVyxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMzQyxNQUFNLFdBQVcsR0FBRyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7WUFHM0MsSUFBSSxDQUFDLFdBQVcsSUFBSSxXQUFXLEtBQUssR0FBRyxJQUFJLENBQUMsV0FBVyxJQUFJLFdBQVcsS0FBSyxHQUFHLEVBQUUsQ0FBQztnQkFDekUsSUFBSSxNQUFNLENBQUMsOENBQThDLENBQUMsQ0FBQztnQkFDakUsT0FBTyxLQUFLLENBQUM7WUFDZixDQUFDO1lBQ0QsSUFBSSxXQUFXLEtBQUssV0FBVyxFQUFFLENBQUM7Z0JBQ2hDLE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQztZQUNELElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDeEMsSUFBSSxNQUFNLENBQUMscUNBQXFDLENBQUMsQ0FBQztnQkFDeEQsT0FBTyxLQUFLLENBQUM7WUFDZixDQUFDO1lBRUQsSUFBSSxDQUFDO2dCQUNILE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3pELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFDUCxJQUFJLE1BQU0sQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO29CQUNsRCxPQUFPLEtBQUssQ0FBQztnQkFDZixDQUFDO2dCQUNELE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3JELElBQUksQ0FBQSxPQUFPLGFBQVAsT0FBTyx1QkFBUCxPQUFPLENBQUUsSUFBSSxNQUFLLFFBQVEsRUFBRSxDQUFDO29CQUN2QixJQUFJLE1BQU0sQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO29CQUN0RCxPQUFPLEtBQUssQ0FBQztnQkFDZixDQUFDO2dCQUVELE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3pELElBQUksU0FBUyxFQUFFLENBQUM7b0JBQ04sSUFBSSxNQUFNLENBQUMsSUFBSSxXQUFXLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO29CQUN4RSxPQUFPLEtBQUssQ0FBQztnQkFDZixDQUFDO2dCQUdELE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUdwRCxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7b0JBQzdDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsV0FBVyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7d0JBQ2hELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQzt3QkFDakUsTUFBTSxXQUFXLEdBQUcsYUFBYSxDQUFDLFdBQVcsR0FBRyxZQUFZLENBQUMsQ0FBQzt3QkFFOUQsSUFBSSxDQUFDLFFBQVEsR0FBRyxXQUFXLENBQUM7b0JBQzlCLENBQUM7Z0JBQ0gsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztnQkFDdEMsT0FBTyxJQUFJLENBQUM7WUFDZCxDQUFDO1lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztnQkFDcEIsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUM5QyxJQUFJLE1BQU0sQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO2dCQUMxRCxDQUFDO3FCQUFNLENBQUM7b0JBQ0UsSUFBSSxNQUFNLENBQUMsNEJBQTRCLEtBQUssQ0FBQyxPQUFPLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztnQkFDckYsQ0FBQztnQkFDRCxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFFRDs7OztPQUlHO0lBQ0csWUFBWSxDQUFDLFVBQWtCOztZQUNuQyxNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7WUFHakQsSUFBSSxDQUFDLGNBQWMsSUFBSSxjQUFjLEtBQUssR0FBRyxJQUFJLGNBQWMsS0FBSyxHQUFHLEVBQUUsQ0FBQztnQkFDbEUsSUFBSSxNQUFNLENBQUMsNEJBQTRCLENBQUMsQ0FBQztnQkFDL0MsT0FBTyxLQUFLLENBQUM7WUFDZixDQUFDO1lBRUQsSUFBSSxjQUFjLEtBQUssSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUN0QyxJQUFJLE1BQU0sQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO2dCQUNoRixPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7WUFFRCxJQUFJLENBQUM7Z0JBQ0gsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDekQsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUVaLE9BQU8sSUFBSSxDQUFDO2dCQUNkLENBQUM7Z0JBQ0QsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDckQsSUFBSSxDQUFBLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxJQUFJLE1BQUssUUFBUSxFQUFFLENBQUM7b0JBQ3BCLElBQUksTUFBTSxDQUFDLGlDQUFpQyxDQUFDLENBQUM7b0JBQ3RELE9BQU8sS0FBSyxDQUFDO2dCQUNmLENBQUM7Z0JBSUQsTUFBTSxlQUFlLEdBQWEsRUFBRSxDQUFDO2dCQUVyQyxNQUFNLGNBQWMsR0FBRyxDQUFPLFdBQW1CLEVBQUUsRUFBRTtvQkFDbkQsSUFBSSxDQUFDO3dCQUNILE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7d0JBQ2xELEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDOzRCQUM5QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7NEJBQzNELElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dDQUMvQixNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dDQUVyQyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztvQ0FDM0IsZUFBZSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQ0FDL0IsQ0FBQzs0QkFDSCxDQUFDO3dCQUNILENBQUM7d0JBQ0QsS0FBSyxNQUFNLE1BQU0sSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7NEJBQ2xDLE1BQU0sY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO3dCQUMvQixDQUFDO29CQUNILENBQUM7b0JBQUMsT0FBTyxTQUFTLEVBQUUsQ0FBQztvQkFDWCxDQUFDO2dCQUNiLENBQUMsQ0FBQSxDQUFDO2dCQUNGLE1BQU0sY0FBYyxDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUVyQyxJQUFJLG9CQUFvQixHQUFHLEtBQUssQ0FBQztnQkFDakMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRTtvQkFDM0IsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7d0JBQ3ZCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDNUIsQ0FBQztvQkFDRCxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQzt3QkFDekIsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUM5QixDQUFDO29CQUNELElBQUksSUFBSSxDQUFDLFlBQVksS0FBSyxFQUFFLEVBQUUsQ0FBQzt3QkFDN0Isb0JBQW9CLEdBQUcsSUFBSSxDQUFDO3dCQUM1QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQzt3QkFDekIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7b0JBQ3pCLENBQUM7Z0JBQ0gsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsTUFBTSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBRTNCLElBQUksb0JBQW9CLEVBQUUsQ0FBQztvQkFDekIsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDMUQsQ0FBQztnQkFJRCxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFHL0MsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztnQkFFdEMsSUFBSSxvQkFBb0IsRUFBRSxDQUFDO29CQUN6QixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBRXhFLENBQUM7Z0JBRUQsT0FBTyxJQUFJLENBQUM7WUFDZCxDQUFDO1lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztnQkFDcEIsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUM5QyxJQUFJLE1BQU0sQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO2dCQUMxRCxDQUFDO3FCQUFNLENBQUM7b0JBQ0UsSUFBSSxNQUFNLENBQUMsNEJBQTRCLEtBQUssQ0FBQyxPQUFPLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztnQkFDckYsQ0FBQztnQkFFRCxNQUFNLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO2dCQUNuQyxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFHTyxRQUFRLENBQUMsTUFBYyxFQUFFLFdBQW1CLEVBQUUsYUFBcUI7O1lBQ3ZFLE1BQU0sV0FBVyxHQUFHLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUMvQyxNQUFNLGlCQUFpQixHQUFHLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUd2RCxJQUFJLFdBQVcsR0FBa0IsSUFBSSxDQUFDO1lBSXRDLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxXQUFXLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDbEMsSUFBSSxNQUFNLENBQUMsaUNBQWlDLENBQUMsQ0FBQztnQkFDeEQsT0FBTyxLQUFLLENBQUM7WUFDakIsQ0FBQztZQUVELElBQUksQ0FBQztnQkFFRCxJQUFJLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDOUIsSUFBSSxNQUFNLENBQUMsMENBQTBDLENBQUMsQ0FBQztvQkFDcEUsTUFBTSxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztvQkFDbkMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztvQkFDdkMsT0FBTyxLQUFLLENBQUM7Z0JBQ2pCLENBQUM7Z0JBQ0EsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztnQkFDckQsSUFBRyxDQUFBLE9BQU8sYUFBUCxPQUFPLHVCQUFQLE9BQU8sQ0FBRSxJQUFJLE1BQUssTUFBTSxFQUFDLENBQUM7b0JBQ1IsSUFBSSxNQUFNLENBQUMseUNBQXlDLENBQUMsQ0FBQztvQkFDdEUsT0FBTyxLQUFLLENBQUM7Z0JBQ2xCLENBQUM7Z0JBR0YsSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDcEMsSUFBSSxNQUFNLENBQUMsNENBQTRDLENBQUMsQ0FBQztvQkFDdkUsT0FBTyxLQUFLLENBQUM7Z0JBQ2pCLENBQUM7Z0JBQ0EsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO2dCQUMzRCxJQUFHLENBQUEsT0FBTyxhQUFQLE9BQU8sdUJBQVAsT0FBTyxDQUFFLElBQUksTUFBSyxRQUFRLEVBQUMsQ0FBQztvQkFDVixJQUFJLE1BQU0sQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDO29CQUN4RSxPQUFPLEtBQUssQ0FBQztnQkFDbEIsQ0FBQztnQkFHRixNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBRXpFLFdBQVcsR0FBRyxhQUFhLENBQUMsR0FBRyxpQkFBaUIsSUFBSSxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUloRSxJQUFJLFdBQVcsS0FBSyxXQUFXLEVBQUUsQ0FBQztvQkFDaEIsT0FBTyxJQUFJLENBQUM7Z0JBQzlCLENBQUM7Z0JBR0QsSUFBSSxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7b0JBQzNCLElBQUksTUFBTSxDQUFDLG1DQUFtQyxRQUFRLHdDQUF3QyxDQUFDLENBQUM7b0JBQzlHLE9BQU8sS0FBSyxDQUFDO2dCQUNqQixDQUFDO2dCQUdTLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUc5RCxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksV0FBVyxFQUFFLENBQUM7b0JBQzVCLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxHQUFHLFdBQVcsQ0FBQztnQkFDbEUsQ0FBQztnQkFHRCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO2dCQUV0QyxPQUFPLElBQUksQ0FBQztZQUVoQixDQUFDO1lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztnQkFFakIsTUFBTSxjQUFjLEdBQUcsV0FBVyxhQUFYLFdBQVcsY0FBWCxXQUFXLEdBQUksaUJBQWlCLENBQUM7Z0JBQ3hELElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxPQUFPLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDckMsSUFBSSxNQUFNLENBQUMsb0NBQW9DLENBQUMsQ0FBQztnQkFDcEUsQ0FBQztxQkFBTSxDQUFDO29CQUVXLElBQUksTUFBTSxDQUFDLHdCQUF3QixLQUFLLENBQUMsT0FBTyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7Z0JBQzFGLENBQUM7Z0JBRUQsTUFBTSxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztnQkFDbkMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztnQkFDdEMsT0FBTyxLQUFLLENBQUM7WUFDbEIsQ0FBQztRQUNMLENBQUM7S0FBQTtJQUVEOzs7T0FHRztJQUNJLG1CQUFtQixDQUFDLFdBQW1CLEVBQUUsT0FBbUIsRUFBRSxNQUE4QjtRQUNqRyxJQUFJLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztRQUM1QyxDQUFDO1FBQ1AsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUMvRCxDQUFDO0lBRUw7OztPQUdHO0lBQ0ksaUJBQWlCLENBQUMsV0FBbUI7UUFDMUMsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNqRSxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ1gsWUFBWSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDM0MsQ0FBQzthQUFNLENBQUM7UUFDUixDQUFDO0lBQ1QsQ0FBQztJQUVNLHlCQUF5QixDQUFDLFdBQW1CLEVBQUUsTUFBYztRQUNsRSxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ2pFLElBQUksWUFBWSxFQUFFLENBQUM7WUFDUCxZQUFZLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDL0MsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNuRCxDQUFDO0lBQ0gsQ0FBQztJQUdEOzs7Ozs7OztPQVFHO0lBQ1UsNEJBQTRCLENBQ3ZDLE9BQWUsRUFDZixTQUFlLEVBQ2Ysa0JBQTBCOztZQUUxQixNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUM5QyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ1YsT0FBTyxJQUFJLENBQUM7WUFDcEIsQ0FBQztZQUVELE1BQU0sa0JBQWtCLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQy9DLE1BQU0sV0FBVyxHQUFZO2dCQUMzQixJQUFJLEVBQUUsTUFBa0M7Z0JBQ3hDLE9BQU87Z0JBQ1AsU0FBUzthQUNWLENBQUM7WUFHRixNQUFNLFVBQVUsR0FBRyxJQUFJLE9BQU8sQ0FBTyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtnQkFFdkQsSUFBSSxDQUFDLG1CQUFtQixDQUFDLGtCQUFrQixFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFFOUQsVUFBVSxDQUFDLEdBQUcsRUFBRTtvQkFDZCxJQUFJLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDO3dCQUNyRCxNQUFNLE1BQU0sR0FBRyxvQ0FBb0Msa0JBQWtCLG1CQUFtQixDQUFDO3dCQUM3RSxJQUFJLENBQUMseUJBQXlCLENBQUMsa0JBQWtCLEVBQUUsTUFBTSxDQUFDLENBQUM7b0JBQzNFLENBQUM7Z0JBQ0gsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLENBQUM7WUFJSCxNQUFNLFlBQVksR0FBRyxNQUFNLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDakYsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNSLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxrQkFBa0IsRUFBRSwrQ0FBK0MsQ0FBQyxDQUFDO2dCQUM1RyxPQUFPLElBQUksQ0FBQztZQUNoQixDQUFDO1lBR0QsSUFBSSxDQUFDO2dCQUNELE1BQU0sVUFBVSxDQUFDO2dCQUNULE9BQU8sV0FBVyxDQUFDO1lBQy9CLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUViLE9BQU8sSUFBSSxDQUFDO1lBQ2hCLENBQUM7UUFDSCxDQUFDO0tBQUE7Q0FFRjtBQUNELHVCQUF1QiIsInNvdXJjZXNDb250ZW50IjpbIi8vQ2hhdE1hbmFnZXIudHNcbmltcG9ydCB7IEFwcCwgTm90aWNlLCBEYXRhQWRhcHRlciwgbm9ybWFsaXplUGF0aCwgVEZvbGRlciwgZGVib3VuY2UsIFRBYnN0cmFjdEZpbGUgfSBmcm9tIFwib2JzaWRpYW5cIjsgXG5pbXBvcnQgT2xsYW1hUGx1Z2luLCB7IEFDVElWRV9DSEFUX0lEX0tFWSwgQ0hBVF9JTkRFWF9LRVkgfSBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQgeyBDaGF0LCBDaGF0TWV0YWRhdGEsIENoYXREYXRhSW5NZW1vcnksIENoYXREYXRhRm9yU3RvcmFnZSwgQ2hhdENvbnN0cnVjdG9yU2V0dGluZ3MgfSBmcm9tIFwiLi9DaGF0XCI7XG5pbXBvcnQgeyBNZXNzYWdlUm9sZSB9IGZyb20gXCIuL09sbGFtYVZpZXdcIjsgXG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tIFwidXVpZFwiO1xuaW1wb3J0IHsgTG9nZ2VyIH0gZnJvbSBcIi4vTG9nZ2VyXCI7XG5pbXBvcnQgeyBUb29sQ2FsbCwgTWVzc2FnZSwgTWVzc2FnZVJvbGUgYXMgTWVzc2FnZVJvbGVUeXBlRnJvbVR5cGVzIH0gZnJvbSBcIi4vdHlwZXNcIjsgXG5cbmV4cG9ydCB0eXBlIEhNQUNvbXBsZXRpb25DYWxsYmFjayA9IChtZXNzYWdlVGltZXN0YW1wTXM6IG51bWJlcikgPT4gdm9pZDtcbmV4cG9ydCB0eXBlIEhNQVJlc29sdmVyUmVnaXN0cmF0aW9uID0gKHRpbWVzdGFtcE1zOiBudW1iZXIsIHJlc29sdmU6ICgpID0+IHZvaWQsIHJlamVjdDogKHJlYXNvbj86IGFueSkgPT4gdm9pZCkgPT4gdm9pZDtcblxuXG5leHBvcnQgaW50ZXJmYWNlIEZvbGRlck5vZGUge1xuICB0eXBlOiBcImZvbGRlclwiO1xuICBuYW1lOiBzdHJpbmc7XG4gIHBhdGg6IHN0cmluZztcbiAgY2hpbGRyZW46IEFycmF5PEZvbGRlck5vZGUgfCBDaGF0Tm9kZT47XG4gIGlzRXhwYW5kZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENoYXROb2RlIHtcbiAgdHlwZTogXCJjaGF0XCI7XG4gIG1ldGFkYXRhOiBDaGF0TWV0YWRhdGE7XG4gIGZpbGVQYXRoOiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIEhpZXJhcmNoeU5vZGUgPSBGb2xkZXJOb2RlIHwgQ2hhdE5vZGU7XG5cblxuaW50ZXJmYWNlIENoYXRTZXNzaW9uU3RvcmVkIHtcbiAgbmFtZTogc3RyaW5nO1xuICBsYXN0TW9kaWZpZWQ6IHN0cmluZztcbiAgY3JlYXRlZEF0OiBzdHJpbmc7XG4gIG1vZGVsTmFtZT86IHN0cmluZztcbiAgc2VsZWN0ZWRSb2xlUGF0aD86IHN0cmluZztcbiAgdGVtcGVyYXR1cmU/OiBudW1iZXI7XG4gIGNvbnRleHRXaW5kb3c/OiBudW1iZXI7XG59XG5pbnRlcmZhY2UgQ2hhdFNlc3Npb25JbmRleCB7XG4gIFtpZDogc3RyaW5nXTogQ2hhdFNlc3Npb25TdG9yZWQ7XG59XG5leHBvcnQgaW50ZXJmYWNlIFJvbGVJbmZvIHtcbiAgbmFtZTogc3RyaW5nO1xuICBwYXRoOiBzdHJpbmc7XG4gIGlzQ3VzdG9tOiBib29sZWFuO1xufVxuaW50ZXJmYWNlIFRhc2tTdGF0ZSB7XG4gIHVyZ2VudDogc3RyaW5nW107XG4gIHJlZ3VsYXI6IHN0cmluZ1tdO1xuICBoYXNDb250ZW50OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdE1hbmFnZXIge1xuICBwcml2YXRlIHBsdWdpbjogT2xsYW1hUGx1Z2luO1xuICBwcml2YXRlIGFwcDogQXBwO1xuICBwcml2YXRlIGFkYXB0ZXI6IERhdGFBZGFwdGVyO1xuICBwdWJsaWMgY2hhdHNGb2xkZXJQYXRoOiBzdHJpbmcgPSBcIi9cIjsgXG4gIHByaXZhdGUgY2hhdEluZGV4OiBDaGF0U2Vzc2lvbkluZGV4ID0ge307XG4gIHByaXZhdGUgYWN0aXZlQ2hhdElkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBhY3RpdmVDaGF0OiBDaGF0IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgbG9hZGVkQ2hhdHM6IFJlY29yZDxzdHJpbmcsIENoYXQ+ID0ge307XG4gIHB1YmxpYyBjdXJyZW50VGFza1N0YXRlOiBUYXNrU3RhdGUgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBsb2dnZXI6IExvZ2dlcjtcbiAgcHVibGljIG1lc3NhZ2VBZGRlZFJlc29sdmVyczogTWFwPG51bWJlciwge3Jlc29sdmU6ICgpID0+IHZvaWQsIHJlamVjdDogKHJlYXNvbj86IGFueSkgPT4gdm9pZH0+ID0gbmV3IE1hcCgpO1xuXG4gIGNvbnN0cnVjdG9yKHBsdWdpbjogT2xsYW1hUGx1Z2luKSB7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gICAgdGhpcy5hcHAgPSBwbHVnaW4uYXBwO1xuICAgIHRoaXMuYWRhcHRlciA9IHBsdWdpbi5hcHAudmF1bHQuYWRhcHRlcjtcbiAgICB0aGlzLmxvZ2dlciA9IHBsdWdpbi5sb2dnZXI7XG4gIH1cblxuICBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMudXBkYXRlQ2hhdHNGb2xkZXJQYXRoKCk7XG4gICAgYXdhaXQgdGhpcy5lbnN1cmVGb2xkZXJzRXhpc3QoKTtcbiAgICBhd2FpdCB0aGlzLmxvYWRDaGF0SW5kZXgodHJ1ZSk7XG5cbiAgICBjb25zdCBzYXZlZEFjdGl2ZUlkID0gYXdhaXQgdGhpcy5wbHVnaW4ubG9hZERhdGFLZXkoQUNUSVZFX0NIQVRfSURfS0VZKTtcbiAgICBpZiAoc2F2ZWRBY3RpdmVJZCAmJiB0aGlzLmNoYXRJbmRleFtzYXZlZEFjdGl2ZUlkXSkge1xuICAgICAgYXdhaXQgdGhpcy5zZXRBY3RpdmVDaGF0KHNhdmVkQWN0aXZlSWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICAgIFxuICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGFLZXkoQUNUSVZFX0NIQVRfSURfS0VZLCBudWxsKTtcbiAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IGF3YWl0IHRoaXMuZ2V0Q2hhdEhpZXJhcmNoeSgpO1xuICAgICAgY29uc3QgZmlyc3RDaGF0ID0gdGhpcy5maW5kRmlyc3RDaGF0SW5IaWVyYXJjaHkoaGllcmFyY2h5KTtcbiAgICAgIGlmIChmaXJzdENoYXQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5zZXRBY3RpdmVDaGF0KGZpcnN0Q2hhdC5tZXRhZGF0YS5pZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLnNldEFjdGl2ZUNoYXQobnVsbCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBmaW5kRmlyc3RDaGF0SW5IaWVyYXJjaHkobm9kZXM6IEhpZXJhcmNoeU5vZGVbXSk6IENoYXROb2RlIHwgbnVsbCB7XG4gICAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG4gICAgICBpZiAobm9kZS50eXBlID09PSBcImNoYXRcIikge1xuICAgICAgICBpZiAoIWlzTmFOKG5ldyBEYXRlKG5vZGUubWV0YWRhdGEubGFzdE1vZGlmaWVkKS5nZXRUaW1lKCkpKSB7XG4gICAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAobm9kZS50eXBlID09PSBcImZvbGRlclwiKSB7XG4gICAgICAgIGNvbnN0IGNoYXRJbkZvbGRlciA9IHRoaXMuZmluZEZpcnN0Q2hhdEluSGllcmFyY2h5KG5vZGUuY2hpbGRyZW4pO1xuICAgICAgICBpZiAoY2hhdEluRm9sZGVyKSB7XG4gICAgICAgICAgcmV0dXJuIGNoYXRJbkZvbGRlcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHVwZGF0ZUNoYXRzRm9sZGVyUGF0aCgpOiB2b2lkIHtcbiAgICBjb25zdCBzZXR0aW5nc1BhdGggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jaGF0SGlzdG9yeUZvbGRlclBhdGg/LnRyaW0oKTtcbiAgICB0aGlzLmNoYXRzRm9sZGVyUGF0aCA9IHNldHRpbmdzUGF0aCA/IG5vcm1hbGl6ZVBhdGgoc2V0dGluZ3NQYXRoKSA6IFwiL1wiO1xuICAgIGlmICh0aGlzLmNoYXRzRm9sZGVyUGF0aCAhPT0gXCIvXCIgJiYgdGhpcy5jaGF0c0ZvbGRlclBhdGguZW5kc1dpdGgoXCIvXCIpKSB7XG4gICAgICB0aGlzLmNoYXRzRm9sZGVyUGF0aCA9IHRoaXMuY2hhdHNGb2xkZXJQYXRoLnNsaWNlKDAsIC0xKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKCF0aGlzLmNoYXRzRm9sZGVyUGF0aCkge1xuICAgICAgdGhpcy5jaGF0c0ZvbGRlclBhdGggPSBcIi9cIjtcbiAgICB9XG4gIH1cblxuICB1cGRhdGVUYXNrU3RhdGUodGFza3M6IFRhc2tTdGF0ZSB8IG51bGwpIHtcbiAgICB0aGlzLmN1cnJlbnRUYXNrU3RhdGUgPSB0YXNrcztcbiAgfVxuXG4gIGdldEN1cnJlbnRUYXNrU3RhdGUoKTogVGFza1N0YXRlIHwgbnVsbCB7XG4gICAgcmV0dXJuIHRoaXMuY3VycmVudFRhc2tTdGF0ZTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBlbnN1cmVGb2xkZXJzRXhpc3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgaGlzdG9yeVBhdGggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jaGF0SGlzdG9yeUZvbGRlclBhdGg/LnRyaW0oKTtcbiAgICBjb25zdCBleHBvcnRQYXRoID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MuY2hhdEV4cG9ydEZvbGRlclBhdGg/LnRyaW0oKTtcblxuICAgIGNvbnN0IGNoZWNrQW5kQ3JlYXRlID0gYXN5bmMgKGZvbGRlclBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCB8IG51bGwsIGZvbGRlckRlc2M6IHN0cmluZykgPT4ge1xuICAgICAgaWYgKCFmb2xkZXJQYXRoIHx8IGZvbGRlclBhdGggPT09IFwiL1wiKSByZXR1cm47XG4gICAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChmb2xkZXJQYXRoKTtcbiAgICAgIFxuICAgICAgaWYgKG5vcm1hbGl6ZWQuc3RhcnRzV2l0aChcIi4uXCIpIHx8IG5vcm1hbGl6ZWQuaW5jbHVkZXMoXCJcXDBcIikpIHtcbiAgICAgICAgbmV3IE5vdGljZShgRXJyb3I6IEludmFsaWQgcGF0aCBmb3IgJHtmb2xkZXJEZXNjfS5gKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5hZGFwdGVyLmV4aXN0cyhub3JtYWxpemVkKTtcbiAgICAgICAgaWYgKCFleGlzdHMpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmFkYXB0ZXIubWtkaXIobm9ybWFsaXplZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuYWRhcHRlci5zdGF0KG5vcm1hbGl6ZWQpO1xuICAgICAgICAgIGlmIChzdGF0Py50eXBlICE9PSBcImZvbGRlclwiKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvcjogUGF0aCBmb3IgJHtmb2xkZXJEZXNjfSBpcyBub3QgYSBmb2xkZXIuYCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoYEVycm9yIGFjY2Vzc2luZyBmb2xkZXIgZm9yICR7Zm9sZGVyRGVzY30uIENoZWNrIHBlcm1pc3Npb25zLmApO1xuICAgICAgfVxuICAgIH07XG4gICAgYXdhaXQgY2hlY2tBbmRDcmVhdGUoaGlzdG9yeVBhdGgsIFwiQ2hhdCBIaXN0b3J5XCIpO1xuICAgIGF3YWl0IGNoZWNrQW5kQ3JlYXRlKGV4cG9ydFBhdGgsIFwiQ2hhdCBFeHBvcnRcIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxvYWRDaGF0SW5kZXgoZm9yY2VTY2FuOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBzdG9yZWRJbmRleCA9IGF3YWl0IHRoaXMucGx1Z2luLmxvYWREYXRhS2V5KENIQVRfSU5ERVhfS0VZKTtcblxuICAgIGNvbnN0IHNldHRpbmdzUGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmNoYXRIaXN0b3J5Rm9sZGVyUGF0aD8udHJpbSgpO1xuICAgIGNvbnN0IGN1cnJlbnRQYXRoID0gc2V0dGluZ3NQYXRoICYmIHNldHRpbmdzUGF0aCAhPT0gXCIvXCIgPyBub3JtYWxpemVQYXRoKHNldHRpbmdzUGF0aCkgOiBcIi9cIjtcbiAgICBpZiAoY3VycmVudFBhdGggIT09IHRoaXMuY2hhdHNGb2xkZXJQYXRoKSB7XG4gICAgICB0aGlzLnVwZGF0ZUNoYXRzRm9sZGVyUGF0aCgpO1xuICAgICAgZm9yY2VTY2FuID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoIWZvcmNlU2NhbiAmJiBzdG9yZWRJbmRleCAmJiB0eXBlb2Ygc3RvcmVkSW5kZXggPT09IFwib2JqZWN0XCIgJiYgT2JqZWN0LmtleXMoc3RvcmVkSW5kZXgpLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGZpcnN0S2V5ID0gT2JqZWN0LmtleXMoc3RvcmVkSW5kZXgpWzBdO1xuICAgICAgaWYgKFxuICAgICAgICBzdG9yZWRJbmRleFtmaXJzdEtleV0gJiZcbiAgICAgICAgdHlwZW9mIHN0b3JlZEluZGV4W2ZpcnN0S2V5XS5uYW1lID09PSBcInN0cmluZ1wiICYmXG4gICAgICAgIHR5cGVvZiBzdG9yZWRJbmRleFtmaXJzdEtleV0ubGFzdE1vZGlmaWVkID09PSBcInN0cmluZ1wiICYmXG4gICAgICAgIHR5cGVvZiBzdG9yZWRJbmRleFtmaXJzdEtleV0uY3JlYXRlZEF0ID09PSBcInN0cmluZ1wiXG4gICAgICApIHtcbiAgICAgICAgdGhpcy5jaGF0SW5kZXggPSBzdG9yZWRJbmRleDtcblxuICAgICAgICByZXR1cm47XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb3JjZVNjYW4gPSB0cnVlO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoIWZvcmNlU2NhbiAmJiBzdG9yZWRJbmRleCAmJiB0eXBlb2Ygc3RvcmVkSW5kZXggPT09IFwib2JqZWN0XCIgJiYgT2JqZWN0LmtleXMoc3RvcmVkSW5kZXgpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhpcy5jaGF0SW5kZXggPSB7fTtcbiAgICAgIHJldHVybjtcbiAgICB9IGVsc2UgaWYgKCFmb3JjZVNjYW4pIHtcbiAgICAgIGZvcmNlU2NhbiA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKGZvcmNlU2Nhbikge1xuICAgICAgYXdhaXQgdGhpcy5yZWJ1aWxkSW5kZXhGcm9tRmlsZXMoKTtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVidWlsZEluZGV4RnJvbUZpbGVzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5ld0luZGV4OiBDaGF0U2Vzc2lvbkluZGV4ID0ge307XG4gICAgbGV0IGNoYXRzTG9hZGVkID0gMDtcbiAgICBsZXQgZmlsZXNTY2FubmVkID0gMDtcblxuICAgIHRyeSB7XG4gICAgICBpZiAodGhpcy5jaGF0c0ZvbGRlclBhdGggIT09IFwiL1wiKSB7XG4gICAgICAgIGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHModGhpcy5jaGF0c0ZvbGRlclBhdGgpO1xuICAgICAgICBpZiAoIWV4aXN0cykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFkYXB0ZXIubWtkaXIodGhpcy5jaGF0c0ZvbGRlclBhdGgpO1xuICAgICAgICAgIH0gY2F0Y2ggKG1rZGlyRXJyb3IpIHtcbiAgICAgICAgICAgIHRoaXMuY2hhdEluZGV4ID0ge307XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0SW5kZXgoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuYWRhcHRlci5zdGF0KHRoaXMuY2hhdHNGb2xkZXJQYXRoKTtcbiAgICAgICAgICBpZiAoc3RhdD8udHlwZSAhPT0gXCJmb2xkZXJcIikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3I6IENoYXQgaGlzdG9yeSBwYXRoICcke3RoaXMuY2hhdHNGb2xkZXJQYXRofScgaXMgbm90IGEgZm9sZGVyLmApO1xuICAgICAgICAgICAgdGhpcy5jaGF0SW5kZXggPSB7fTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRJbmRleCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBzY2FuQW5kSW5kZXggPSBhc3luYyAoZm9sZGVyUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgICAgIGxldCBsaXN0UmVzdWx0O1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxpc3RSZXN1bHQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIubGlzdChmb2xkZXJQYXRoKTtcbiAgICAgICAgfSBjYXRjaCAobGlzdEVycm9yOiBhbnkpIHtcbiAgICAgICAgICBpZiAobGlzdEVycm9yLm1lc3NhZ2UgJiYgbGlzdEVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoXCJOb3QgYSBkaXJlY3RvcnlcIikpIHtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IGZ1bGxQYXRoIG9mIGxpc3RSZXN1bHQuZmlsZXMpIHtcbiAgICAgICAgICBjb25zdCBmaWxlTmFtZSA9IGZ1bGxQYXRoLnN1YnN0cmluZyhmdWxsUGF0aC5sYXN0SW5kZXhPZihcIi9cIikgKyAxKTtcbiAgICAgICAgICBpZiAoIWZpbGVOYW1lLmVuZHNXaXRoKFwiLmpzb25cIikgfHwgZmlsZU5hbWUuc3RhcnRzV2l0aChcIi5cIikpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgY29uc3QgdXVpZFBhdHRlcm4gPSAvXlswLTlhLWZBLUZdezh9LVswLTlhLWZBLUZdezR9LVswLTlhLWZBLUZdezR9LVswLTlhLWZBLUZdezR9LVswLTlhLWZBLUZdezEyfVxcLmpzb24kL2k7XG4gICAgICAgICAgY29uc3Qgb2xkUGF0dGVybiA9IC9eY2hhdF9cXGQrX1thLXpBLVowLTldK1xcLmpzb24kLztcblxuICAgICAgICAgIGlmICghdXVpZFBhdHRlcm4udGVzdChmaWxlTmFtZSkgJiYgIW9sZFBhdHRlcm4udGVzdChmaWxlTmFtZSkpIGNvbnRpbnVlO1xuICAgICAgICAgIGZpbGVzU2Nhbm5lZCsrO1xuXG4gICAgICAgICAgY29uc3QgY2hhdElkID0gZmlsZU5hbWUuc2xpY2UoMCwgLTUpO1xuXG4gICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBqc29uQ29udGVudCA9IGF3YWl0IHRoaXMuYWRhcHRlci5yZWFkKGZ1bGxQYXRoKTtcbiAgICAgICAgICAgIC8vINCS0JjQn9Cg0JDQktCb0JXQndCeOiDQstC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+IENoYXREYXRhRm9yU3RvcmFnZSwg0L7RgdC60ZbQu9GM0LrQuCDQtNCw0L3RliDQtyDRhNCw0LnQu9GDXG4gICAgICAgICAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZShqc29uQ29udGVudCkgYXMgUGFydGlhbDxDaGF0RGF0YUZvclN0b3JhZ2U+OyBcblxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICBkYXRhPy5tZXRhZGF0YT8uaWQgPT09IGNoYXRJZCAmJlxuICAgICAgICAgICAgICB0eXBlb2YgZGF0YS5tZXRhZGF0YS5uYW1lID09PSBcInN0cmluZ1wiICYmXG4gICAgICAgICAgICAgIGRhdGEubWV0YWRhdGEubmFtZS50cmltKCkgIT09IFwiXCIgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIGRhdGEubWV0YWRhdGEubGFzdE1vZGlmaWVkID09PSBcInN0cmluZ1wiICYmIC8vIGxhc3RNb2RpZmllZCDRgtCwIGNyZWF0ZWRBdCDQstC20LUg0ZQg0YDRj9C00LrQsNC80LhcbiAgICAgICAgICAgICAgIWlzTmFOKG5ldyBEYXRlKGRhdGEubWV0YWRhdGEubGFzdE1vZGlmaWVkKS5nZXRUaW1lKCkpICYmXG4gICAgICAgICAgICAgIHR5cGVvZiBkYXRhLm1ldGFkYXRhLmNyZWF0ZWRBdCA9PT0gXCJzdHJpbmdcIiAmJlxuICAgICAgICAgICAgICAhaXNOYU4obmV3IERhdGUoZGF0YS5tZXRhZGF0YS5jcmVhdGVkQXQpLmdldFRpbWUoKSlcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBjb25zdCBtZXRhID0gZGF0YS5tZXRhZGF0YTtcbiAgICAgICAgICAgICAgbmV3SW5kZXhbY2hhdElkXSA9IHtcbiAgICAgICAgICAgICAgICBuYW1lOiBtZXRhLm5hbWUsXG4gICAgICAgICAgICAgICAgbGFzdE1vZGlmaWVkOiBuZXcgRGF0ZShtZXRhLmxhc3RNb2RpZmllZCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKG1ldGEuY3JlYXRlZEF0KS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICAgIG1vZGVsTmFtZTogbWV0YS5tb2RlbE5hbWUsXG4gICAgICAgICAgICAgICAgc2VsZWN0ZWRSb2xlUGF0aDogbWV0YS5zZWxlY3RlZFJvbGVQYXRoLFxuICAgICAgICAgICAgICAgIHRlbXBlcmF0dXJlOiBtZXRhLnRlbXBlcmF0dXJlLFxuICAgICAgICAgICAgICAgIGNvbnRleHRXaW5kb3c6IG1ldGEuY29udGV4dFdpbmRvdywgLy8g0K/QutGJ0L4g0YbQtSDQv9C+0LvQtSDQtNC+0LTQsNC90L4g0LTQviBDaGF0TWV0YWRhdGFcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgY2hhdHNMb2FkZWQrKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgICAgICAgICAgaWYgKGUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikge1xuICAgICAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihgW0NoYXRNYW5hZ2VyIHJlYnVpbGRJbmRleF0gU3ludGF4RXJyb3IgcGFyc2luZyBKU09OIGZyb20gJHtmdWxsUGF0aH06YCwgZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihgW0NoYXRNYW5hZ2VyIHJlYnVpbGRJbmRleF0gRXJyb3IgcmVhZGluZyBvciBwcm9jZXNzaW5nIGZpbGUgJHtmdWxsUGF0aH06YCwgZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3Qgc3ViRm9sZGVyUGF0aCBvZiBsaXN0UmVzdWx0LmZvbGRlcnMpIHtcbiAgICAgICAgICBhd2FpdCBzY2FuQW5kSW5kZXgoc3ViRm9sZGVyUGF0aCk7XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIGF3YWl0IHNjYW5BbmRJbmRleCh0aGlzLmNoYXRzRm9sZGVyUGF0aCk7XG5cbiAgICAgIHRoaXMuY2hhdEluZGV4ID0gbmV3SW5kZXg7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0SW5kZXgoKTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBpZiAoZXJyb3IuY29kZSA9PT0gXCJFTk9FTlRcIikge1xuICAgICAgICBuZXcgTm90aWNlKGBFcnJvcjogQ2hhdCBoaXN0b3J5IGZvbGRlciAnJHt0aGlzLmNoYXRzRm9sZGVyUGF0aH0nIG5vdCBmb3VuZC5gKTtcbiAgICAgIH0gZWxzZSBpZiAoZXJyb3IuY29kZSA9PT0gXCJFUEVSTVwiIHx8IGVycm9yLmNvZGUgPT09IFwiRUFDQ0VTXCIpIHtcbiAgICAgICAgbmV3IE5vdGljZShcIlBlcm1pc3Npb24gZXJyb3IgYWNjZXNzaW5nIGNoYXQgaGlzdG9yeSBmb2xkZXIuXCIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmV3IE5vdGljZShcIkVycm9yIHJlYnVpbGRpbmcgY2hhdCBpbmRleC4gQ2hlY2sgY29uc29sZS5cIik7XG4gICAgICB9XG4gICAgICB0aGlzLmNoYXRJbmRleCA9IHt9O1xuICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEluZGV4KCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzYXZlQ2hhdEluZGV4KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YUtleShDSEFUX0lOREVYX0tFWSwgdGhpcy5jaGF0SW5kZXgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBuZXcgTm90aWNlKFwiRXJyb3Igc2F2aW5nIGNoYXQgaW5kZXguIENoYW5nZXMgbWlnaHQgYmUgbG9zdC5cIik7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRDaGF0RmlsZVBhdGgoaWQ6IHN0cmluZywgZm9sZGVyUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBmaWxlTmFtZSA9IGAke2lkfS5qc29uYDtcbiAgICBjb25zdCB0YXJnZXRGb2xkZXIgPSBub3JtYWxpemVQYXRoKGZvbGRlclBhdGgpO1xuICAgIGlmICh0YXJnZXRGb2xkZXIgPT09IFwiL1wiIHx8IHRhcmdldEZvbGRlciA9PT0gXCJcIikge1xuICAgICAgcmV0dXJuIG5vcm1hbGl6ZVBhdGgoZmlsZU5hbWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gbm9ybWFsaXplUGF0aChgJHt0YXJnZXRGb2xkZXJ9LyR7ZmlsZU5hbWV9YCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBfc2NhbkZvbGRlclJlY3Vyc2l2ZShmb2xkZXJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPEhpZXJhcmNoeU5vZGVbXT4ge1xuICAgIGNvbnN0IGNoaWxkcmVuOiBIaWVyYXJjaHlOb2RlW10gPSBbXTtcbiAgICBsZXQgbGlzdFJlc3VsdDtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuZXhpc3RzKGZvbGRlclBhdGgpO1xuICAgICAgaWYgKCFleGlzdHMpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgICAgY29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuYWRhcHRlci5zdGF0KGZvbGRlclBhdGgpO1xuICAgICAgaWYgKHN0YXQ/LnR5cGUgIT09IFwiZm9sZGVyXCIpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuXG4gICAgICBsaXN0UmVzdWx0ID0gYXdhaXQgdGhpcy5hZGFwdGVyLmxpc3QoZm9sZGVyUGF0aCk7XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFwiRVBFUk1cIiB8fCBlcnJvci5jb2RlID09PSBcIkVBQ0NFU1wiKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoYFBlcm1pc3Npb24gZXJyb3IgcmVhZGluZyBmb2xkZXI6ICR7Zm9sZGVyUGF0aH1gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICB9XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBzdWJGb2xkZXJQYXRoIG9mIGxpc3RSZXN1bHQuZm9sZGVycykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc3ViU3RhdCA9IGF3YWl0IHRoaXMuYWRhcHRlci5zdGF0KHN1YkZvbGRlclBhdGgpO1xuICAgICAgICBpZiAoc3ViU3RhdD8udHlwZSA9PT0gXCJmb2xkZXJcIikge1xuICAgICAgICAgIGNvbnN0IGZvbGRlck5hbWUgPSBzdWJGb2xkZXJQYXRoLnN1YnN0cmluZyhzdWJGb2xkZXJQYXRoLmxhc3RJbmRleE9mKFwiL1wiKSArIDEpO1xuICAgICAgICAgIGNvbnN0IHN1YkNoaWxkcmVuID0gYXdhaXQgdGhpcy5fc2NhbkZvbGRlclJlY3Vyc2l2ZShzdWJGb2xkZXJQYXRoKTtcbiAgICAgICAgICBjaGlsZHJlbi5wdXNoKHtcbiAgICAgICAgICAgIHR5cGU6IFwiZm9sZGVyXCIsXG4gICAgICAgICAgICBuYW1lOiBmb2xkZXJOYW1lLFxuICAgICAgICAgICAgcGF0aDogc3ViRm9sZGVyUGF0aCxcbiAgICAgICAgICAgIGNoaWxkcmVuOiBzdWJDaGlsZHJlbixcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoc3RhdEVycm9yKSB7fVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZnVsbFBhdGggb2YgbGlzdFJlc3VsdC5maWxlcykge1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSBmdWxsUGF0aC5zdWJzdHJpbmcoZnVsbFBhdGgubGFzdEluZGV4T2YoXCIvXCIpICsgMSk7XG5cbiAgICAgIGlmICghZmlsZU5hbWUuZW5kc1dpdGgoXCIuanNvblwiKSB8fCBmaWxlTmFtZS5zdGFydHNXaXRoKFwiLlwiKSkgY29udGludWU7XG4gICAgICBjb25zdCB1dWlkUGF0dGVybiA9IC9eWzAtOWEtZkEtRl17OH0tWzAtOWEtZkEtRl17NH0tWzAtOWEtZkEtRl17NH0tWzAtOWEtZkEtRl17NH0tWzAtOWEtZkEtRl17MTJ9XFwuanNvbiQvaTtcbiAgICAgIGNvbnN0IG9sZFBhdHRlcm4gPSAvXmNoYXRfXFxkK19bYS16QS1aMC05XStcXC5qc29uJC87XG4gICAgICBpZiAoIXV1aWRQYXR0ZXJuLnRlc3QoZmlsZU5hbWUpICYmICFvbGRQYXR0ZXJuLnRlc3QoZmlsZU5hbWUpKSBjb250aW51ZTtcblxuICAgICAgY29uc3QgY2hhdElkID0gZmlsZU5hbWUuc2xpY2UoMCwgLTUpO1xuXG4gICAgICBjb25zdCBzdG9yZWRNZXRhID0gdGhpcy5jaGF0SW5kZXhbY2hhdElkXTtcbiAgICAgIGlmIChzdG9yZWRNZXRhKSB7XG4gICAgICAgIGlmIChpc05hTihuZXcgRGF0ZShzdG9yZWRNZXRhLmxhc3RNb2RpZmllZCkuZ2V0VGltZSgpKSB8fCBpc05hTihuZXcgRGF0ZShzdG9yZWRNZXRhLmNyZWF0ZWRBdCkuZ2V0VGltZSgpKSkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY2hhdE1ldGFkYXRhOiBDaGF0TWV0YWRhdGEgPSB7XG4gICAgICAgICAgaWQ6IGNoYXRJZCxcbiAgICAgICAgICBuYW1lOiBzdG9yZWRNZXRhLm5hbWUsXG4gICAgICAgICAgbGFzdE1vZGlmaWVkOiBzdG9yZWRNZXRhLmxhc3RNb2RpZmllZCxcbiAgICAgICAgICBjcmVhdGVkQXQ6IHN0b3JlZE1ldGEuY3JlYXRlZEF0LFxuICAgICAgICAgIG1vZGVsTmFtZTogc3RvcmVkTWV0YS5tb2RlbE5hbWUsXG4gICAgICAgICAgc2VsZWN0ZWRSb2xlUGF0aDogc3RvcmVkTWV0YS5zZWxlY3RlZFJvbGVQYXRoLFxuICAgICAgICAgIHRlbXBlcmF0dXJlOiBzdG9yZWRNZXRhLnRlbXBlcmF0dXJlLFxuICAgICAgICAgIGNvbnRleHRXaW5kb3c6IHN0b3JlZE1ldGEuY29udGV4dFdpbmRvdyxcbiAgICAgICAgfTtcbiAgICAgICAgY2hpbGRyZW4ucHVzaCh7XG4gICAgICAgICAgdHlwZTogXCJjaGF0XCIsXG4gICAgICAgICAgbWV0YWRhdGE6IGNoYXRNZXRhZGF0YSxcbiAgICAgICAgICBmaWxlUGF0aDogZnVsbFBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjaGlsZHJlbi5zb3J0KChhLCBiKSA9PiB7XG4gICAgICBpZiAoYS50eXBlID09PSBcImZvbGRlclwiICYmIGIudHlwZSA9PT0gXCJjaGF0XCIpIHJldHVybiAtMTtcbiAgICAgIGlmIChhLnR5cGUgPT09IFwiY2hhdFwiICYmIGIudHlwZSA9PT0gXCJmb2xkZXJcIikgcmV0dXJuIDE7XG4gICAgICBpZiAoYS50eXBlID09PSBcImZvbGRlclwiICYmIGIudHlwZSA9PT0gXCJmb2xkZXJcIikge1xuICAgICAgICByZXR1cm4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKTtcbiAgICAgIH1cbiAgICAgIGlmIChhLnR5cGUgPT09IFwiY2hhdFwiICYmIGIudHlwZSA9PT0gXCJjaGF0XCIpIHtcbiAgICAgICAgY29uc3QgZGF0ZUEgPSBuZXcgRGF0ZShhLm1ldGFkYXRhLmxhc3RNb2RpZmllZCkuZ2V0VGltZSgpO1xuICAgICAgICBjb25zdCBkYXRlQiA9IG5ldyBEYXRlKGIubWV0YWRhdGEubGFzdE1vZGlmaWVkKS5nZXRUaW1lKCk7XG4gICAgICAgIGNvbnN0IHZhbGlkQSA9ICFpc05hTihkYXRlQSk7XG4gICAgICAgIGNvbnN0IHZhbGlkQiA9ICFpc05hTihkYXRlQik7XG4gICAgICAgIGlmICh2YWxpZEEgJiYgdmFsaWRCKSByZXR1cm4gZGF0ZUIgLSBkYXRlQTtcbiAgICAgICAgaWYgKHZhbGlkQikgcmV0dXJuIDE7XG4gICAgICAgIGlmICh2YWxpZEEpIHJldHVybiAtMTtcbiAgICAgICAgcmV0dXJuIGEubWV0YWRhdGEubmFtZS5sb2NhbGVDb21wYXJlKGIubWV0YWRhdGEubmFtZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gMDtcbiAgICB9KTtcblxuICAgIHJldHVybiBjaGlsZHJlbjtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRDaGF0SGllcmFyY2h5KCk6IFByb21pc2U8SGllcmFyY2h5Tm9kZVtdPiB7XG4gICAgYXdhaXQgdGhpcy5lbnN1cmVGb2xkZXJzRXhpc3QoKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5fc2NhbkZvbGRlclJlY3Vyc2l2ZSh0aGlzLmNoYXRzRm9sZGVyUGF0aCk7XG4gIH1cblxuICBhc3luYyBzYXZlQ2hhdEFuZFVwZGF0ZUluZGV4KGNoYXQ6IENoYXQpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgY2hhdC5zYXZlKCk7XG5cbiAgICAgIGNvbnN0IG1ldGEgPSBjaGF0Lm1ldGFkYXRhO1xuICAgICAgY29uc3Qgc3RvcmVkTWV0YTogQ2hhdFNlc3Npb25TdG9yZWQgPSB7XG4gICAgICAgIG5hbWU6IG1ldGEubmFtZSxcbiAgICAgICAgbGFzdE1vZGlmaWVkOiBtZXRhLmxhc3RNb2RpZmllZCxcbiAgICAgICAgY3JlYXRlZEF0OiBtZXRhLmNyZWF0ZWRBdCxcbiAgICAgICAgbW9kZWxOYW1lOiBtZXRhLm1vZGVsTmFtZSxcbiAgICAgICAgc2VsZWN0ZWRSb2xlUGF0aDogbWV0YS5zZWxlY3RlZFJvbGVQYXRoLFxuICAgICAgICB0ZW1wZXJhdHVyZTogbWV0YS50ZW1wZXJhdHVyZSxcbiAgICAgICAgY29udGV4dFdpbmRvdzogbWV0YS5jb250ZXh0V2luZG93LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgZXhpc3RpbmdJbmRleEVudHJ5ID0gdGhpcy5jaGF0SW5kZXhbbWV0YS5pZF07XG4gICAgICBjb25zdCBpbmRleE5lZWRzVXBkYXRlID1cbiAgICAgICAgIWV4aXN0aW5nSW5kZXhFbnRyeSB8fFxuICAgICAgICBleGlzdGluZ0luZGV4RW50cnkubmFtZSAhPT0gc3RvcmVkTWV0YS5uYW1lIHx8XG4gICAgICAgIGV4aXN0aW5nSW5kZXhFbnRyeS5sYXN0TW9kaWZpZWQgIT09IHN0b3JlZE1ldGEubGFzdE1vZGlmaWVkIHx8XG4gICAgICAgIGV4aXN0aW5nSW5kZXhFbnRyeS5jcmVhdGVkQXQgIT09IHN0b3JlZE1ldGEuY3JlYXRlZEF0IHx8XG4gICAgICAgIGV4aXN0aW5nSW5kZXhFbnRyeS5tb2RlbE5hbWUgIT09IHN0b3JlZE1ldGEubW9kZWxOYW1lIHx8XG4gICAgICAgIGV4aXN0aW5nSW5kZXhFbnRyeS5zZWxlY3RlZFJvbGVQYXRoICE9PSBzdG9yZWRNZXRhLnNlbGVjdGVkUm9sZVBhdGggfHxcbiAgICAgICAgZXhpc3RpbmdJbmRleEVudHJ5LnRlbXBlcmF0dXJlICE9PSBzdG9yZWRNZXRhLnRlbXBlcmF0dXJlIHx8XG4gICAgICAgIGV4aXN0aW5nSW5kZXhFbnRyeS5jb250ZXh0V2luZG93ICE9PSBzdG9yZWRNZXRhLmNvbnRleHRXaW5kb3c7XG5cbiAgICAgIGlmIChpbmRleE5lZWRzVXBkYXRlKSB7XG4gICAgICAgIHRoaXMuY2hhdEluZGV4W21ldGEuaWRdID0gc3RvcmVkTWV0YTtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEluZGV4KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uZW1pdChcImNoYXQtbGlzdC11cGRhdGVkXCIpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgXG5hc3luYyBjcmVhdGVOZXdDaGF0KG5hbWU/OiBzdHJpbmcsIGZvbGRlclBhdGg/OiBzdHJpbmcpOiBQcm9taXNlPENoYXQgfCBudWxsPiB7XG4gIGNvbnN0IHRhcmdldEZvbGRlciA9IGZvbGRlclBhdGggPyBub3JtYWxpemVQYXRoKGZvbGRlclBhdGgpIDogdGhpcy5jaGF0c0ZvbGRlclBhdGg7XG4gIGNvbnN0IGZpbmFsRm9sZGVyUGF0aCA9IHRhcmdldEZvbGRlciA9PT0gXCJcIiB8fCB0YXJnZXRGb2xkZXIgPT09IFwiLlwiID8gXCIvXCIgOiB0YXJnZXRGb2xkZXI7XG5cbiAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuZW5zdXJlU3BlY2lmaWNGb2xkZXJFeGlzdHMoZmluYWxGb2xkZXJQYXRoKTtcbiAgfSBjYXRjaCAoZm9sZGVyRXJyb3IpIHtcbiAgICAgIFxuICAgICAgbmV3IE5vdGljZShgRmFpbGVkIHRvIGVuc3VyZSB0YXJnZXQgZm9sZGVyIGV4aXN0czogJHtmaW5hbEZvbGRlclBhdGh9YCk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHRyeSB7XG4gICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgICAgY29uc3QgbmV3SWQgPSB1dWlkdjQoKTtcbiAgICAgIGNvbnN0IGZpbGVQYXRoID0gdGhpcy5nZXRDaGF0RmlsZVBhdGgobmV3SWQsIGZpbmFsRm9sZGVyUGF0aCk7XG5cbiAgICAgIGNvbnN0IGluaXRpYWxNZXRhZGF0YTogQ2hhdE1ldGFkYXRhID0ge1xuICAgICAgICAgIGlkOiBuZXdJZCxcbiAgICAgICAgICBuYW1lOiBuYW1lIHx8IGBDaGF0ICR7bm93LnRvTG9jYWxlRGF0ZVN0cmluZygpfSAke25vdy50b0xvY2FsZVRpbWVTdHJpbmcoW10sIHsgaG91cjogXCIyLWRpZ2l0XCIsIG1pbnV0ZTogXCIyLWRpZ2l0XCIgfSl9YCxcbiAgICAgICAgICBtb2RlbE5hbWU6IHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZSxcbiAgICAgICAgICBzZWxlY3RlZFJvbGVQYXRoOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoLFxuICAgICAgICAgIHRlbXBlcmF0dXJlOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wZXJhdHVyZSxcbiAgICAgICAgICBjb250ZXh0V2luZG93OiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb250ZXh0V2luZG93LFxuICAgICAgICAgIGNyZWF0ZWRBdDogbm93LnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgbGFzdE1vZGlmaWVkOiBub3cudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IGNvbnN0cnVjdG9yU2V0dGluZ3M6IENoYXRDb25zdHJ1Y3RvclNldHRpbmdzID0geyAuLi50aGlzLnBsdWdpbi5zZXR0aW5ncyB9O1xuICAgICAgY29uc3QgY2hhdERhdGE6IENoYXREYXRhSW5NZW1vcnkgPSB7IG1ldGFkYXRhOiBpbml0aWFsTWV0YWRhdGEsIG1lc3NhZ2VzOiBbXSB9OyBcblxuICAgICAgY29uc3QgbmV3Q2hhdCA9IG5ldyBDaGF0KHRoaXMuYWRhcHRlciwgY29uc3RydWN0b3JTZXR0aW5ncywgY2hhdERhdGEsIGZpbGVQYXRoLCB0aGlzLmxvZ2dlcik7XG5cbiAgICAgIGNvbnN0IHN0b3JlZE1ldGE6IENoYXRTZXNzaW9uU3RvcmVkID0ge1xuICAgICAgICAgIG5hbWU6IGluaXRpYWxNZXRhZGF0YS5uYW1lLFxuICAgICAgICAgIGxhc3RNb2RpZmllZDogaW5pdGlhbE1ldGFkYXRhLmxhc3RNb2RpZmllZCxcbiAgICAgICAgICBjcmVhdGVkQXQ6IGluaXRpYWxNZXRhZGF0YS5jcmVhdGVkQXQsXG4gICAgICAgICAgbW9kZWxOYW1lOiBpbml0aWFsTWV0YWRhdGEubW9kZWxOYW1lLFxuICAgICAgICAgIHNlbGVjdGVkUm9sZVBhdGg6IGluaXRpYWxNZXRhZGF0YS5zZWxlY3RlZFJvbGVQYXRoLFxuICAgICAgICAgIHRlbXBlcmF0dXJlOiBpbml0aWFsTWV0YWRhdGEudGVtcGVyYXR1cmUsXG4gICAgICAgICAgY29udGV4dFdpbmRvdzogaW5pdGlhbE1ldGFkYXRhLmNvbnRleHRXaW5kb3csXG4gICAgICB9O1xuICAgICAgdGhpcy5jaGF0SW5kZXhbbmV3SWRdID0gc3RvcmVkTWV0YTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRJbmRleCgpO1xuICAgICAgXG4gICAgICBcblxuICAgICAgY29uc3Qgc2F2ZWRJbW1lZGlhdGVseSA9IGF3YWl0IG5ld0NoYXQuc2F2ZUltbWVkaWF0ZWx5KCk7XG4gICAgICBpZiAoIXNhdmVkSW1tZWRpYXRlbHkpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jaGF0SW5kZXhbbmV3SWRdO1xuICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRJbmRleCgpO1xuICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwiY2hhdC1saXN0LXVwZGF0ZWRcIik7XG5cbiAgICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3I6IEZhaWxlZCB0byBzYXZlIG5ldyBjaGF0IGZpbGUuXCIpO1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmxvYWRlZENoYXRzW25ld0lkXSA9IG5ld0NoYXQ7XG4gICAgICBcbiAgICAgIFxuICAgICAgYXdhaXQgdGhpcy5zZXRBY3RpdmVDaGF0KG5ld0lkKTtcblxuICAgICAgcmV0dXJuIG5ld0NoYXQ7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3IgY3JlYXRpbmcgbmV3IGNoYXQgc2Vzc2lvbi5cIik7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG4gIHByaXZhdGUgYXN5bmMgZW5zdXJlU3BlY2lmaWNGb2xkZXJFeGlzdHMoZm9sZGVyUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFmb2xkZXJQYXRoIHx8IGZvbGRlclBhdGggPT09IFwiL1wiIHx8IGZvbGRlclBhdGggPT09IFwiLlwiKSByZXR1cm47XG5cbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChmb2xkZXJQYXRoKTtcbiAgICBpZiAobm9ybWFsaXplZC5zdGFydHNXaXRoKFwiLi5cIikgfHwgbm9ybWFsaXplZC5pbmNsdWRlcyhcIlxcMFwiKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBmb2xkZXIgcGF0aCBzcGVjaWZpZWQuXCIpO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuZXhpc3RzKG5vcm1hbGl6ZWQpO1xuICAgICAgaWYgKCFleGlzdHMpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyLm1rZGlyKG5vcm1hbGl6ZWQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuYWRhcHRlci5zdGF0KG5vcm1hbGl6ZWQpO1xuICAgICAgICBpZiAoc3RhdD8udHlwZSAhPT0gXCJmb2xkZXJcIikge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRhcmdldCBwYXRoICR7bm9ybWFsaXplZH0gaXMgbm90IGEgZm9sZGVyLmApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYEZhaWxlZCB0byBlbnN1cmUgdGFyZ2V0IGZvbGRlciAke25vcm1hbGl6ZWR9IGV4aXN0czogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBcbiAgbGlzdEF2YWlsYWJsZUNoYXRzKCk6IENoYXRNZXRhZGF0YVtdIHtcbiAgICByZXR1cm4gT2JqZWN0LmVudHJpZXModGhpcy5jaGF0SW5kZXgpXG4gICAgICAubWFwKChbaWQsIHN0b3JlZE1ldGFdKTogQ2hhdE1ldGFkYXRhIHwgbnVsbCA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAhc3RvcmVkTWV0YSB8fFxuICAgICAgICAgIHR5cGVvZiBzdG9yZWRNZXRhICE9PSBcIm9iamVjdFwiIHx8XG4gICAgICAgICAgdHlwZW9mIHN0b3JlZE1ldGEubmFtZSAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgICAgIHR5cGVvZiBzdG9yZWRNZXRhLmxhc3RNb2RpZmllZCAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgICAgIHR5cGVvZiBzdG9yZWRNZXRhLmNyZWF0ZWRBdCAhPT0gXCJzdHJpbmdcIlxuICAgICAgICApIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBsYXN0TW9kRGF0ZSA9IG5ldyBEYXRlKHN0b3JlZE1ldGEubGFzdE1vZGlmaWVkKTtcbiAgICAgICAgY29uc3QgY3JlYXRlZERhdGUgPSBuZXcgRGF0ZShzdG9yZWRNZXRhLmNyZWF0ZWRBdCk7XG4gICAgICAgIGlmIChpc05hTihsYXN0TW9kRGF0ZS5nZXRUaW1lKCkpIHx8IGlzTmFOKGNyZWF0ZWREYXRlLmdldFRpbWUoKSkpIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGlkLFxuICAgICAgICAgIG5hbWU6IHN0b3JlZE1ldGEubmFtZSxcbiAgICAgICAgICBsYXN0TW9kaWZpZWQ6IHN0b3JlZE1ldGEubGFzdE1vZGlmaWVkLFxuICAgICAgICAgIGNyZWF0ZWRBdDogc3RvcmVkTWV0YS5jcmVhdGVkQXQsXG4gICAgICAgICAgbW9kZWxOYW1lOiBzdG9yZWRNZXRhLm1vZGVsTmFtZSxcbiAgICAgICAgICBzZWxlY3RlZFJvbGVQYXRoOiBzdG9yZWRNZXRhLnNlbGVjdGVkUm9sZVBhdGgsXG4gICAgICAgICAgdGVtcGVyYXR1cmU6IHN0b3JlZE1ldGEudGVtcGVyYXR1cmUsXG4gICAgICAgICAgY29udGV4dFdpbmRvdzogc3RvcmVkTWV0YS5jb250ZXh0V2luZG93LFxuICAgICAgICB9O1xuICAgICAgfSlcbiAgICAgIC5maWx0ZXIoKGNoYXRNZXRhKTogY2hhdE1ldGEgaXMgQ2hhdE1ldGFkYXRhID0+IGNoYXRNZXRhICE9PSBudWxsKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgY29uc3QgZGF0ZUEgPSBuZXcgRGF0ZShhLmxhc3RNb2RpZmllZCkuZ2V0VGltZSgpO1xuICAgICAgICBjb25zdCBkYXRlQiA9IG5ldyBEYXRlKGIubGFzdE1vZGlmaWVkKS5nZXRUaW1lKCk7XG4gICAgICAgIGlmICghaXNOYU4oZGF0ZUEpICYmICFpc05hTihkYXRlQikpIHtcbiAgICAgICAgICBpZiAoZGF0ZUIgIT09IGRhdGVBKSByZXR1cm4gZGF0ZUIgLSBkYXRlQTtcbiAgICAgICAgfSBlbHNlIGlmICghaXNOYU4oZGF0ZUIpKSByZXR1cm4gMTtcbiAgICAgICAgZWxzZSBpZiAoIWlzTmFOKGRhdGVBKSkgcmV0dXJuIC0xO1xuICAgICAgICBjb25zdCBjcmVhdGVkQSA9IG5ldyBEYXRlKGEuY3JlYXRlZEF0KS5nZXRUaW1lKCk7XG4gICAgICAgIGNvbnN0IGNyZWF0ZWRCID0gbmV3IERhdGUoYi5jcmVhdGVkQXQpLmdldFRpbWUoKTtcbiAgICAgICAgaWYgKCFpc05hTihjcmVhdGVkQSkgJiYgIWlzTmFOKGNyZWF0ZWRCKSkge1xuICAgICAgICAgIHJldHVybiBjcmVhdGVkQiAtIGNyZWF0ZWRBO1xuICAgICAgICB9IGVsc2UgaWYgKCFpc05hTihjcmVhdGVkQikpIHJldHVybiAxO1xuICAgICAgICBlbHNlIGlmICghaXNOYU4oY3JlYXRlZEEpKSByZXR1cm4gLTE7XG4gICAgICAgIHJldHVybiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpO1xuICAgICAgfSk7XG4gIH1cblxuICBnZXRBY3RpdmVDaGF0SWQoKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgcmV0dXJuIHRoaXMuYWN0aXZlQ2hhdElkO1xuICB9XG5cbiAgXG5cbiAgcHVibGljIGFzeW5jIGdldEFjdGl2ZUNoYXRPckZhaWwoKTogUHJvbWlzZTxDaGF0PiB7XG4gICAgY29uc3QgY2hhdCA9IGF3YWl0IHRoaXMuZ2V0QWN0aXZlQ2hhdCgpO1xuICAgIGlmICghY2hhdCkge1xuICAgICAgICAgICAgXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBhY3RpdmUgY2hhdCBmb3VuZCBvciBpdCBmYWlsZWQgdG8gbG9hZC5cIik7XG4gICAgfVxuICAgIHJldHVybiBjaGF0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXRQYXlsb2FkKG1lc3NhZ2VQYXlsb2FkOiBNZXNzYWdlLCBlbWl0RXZlbnQ6IGJvb2xlYW4gPSB0cnVlKTogUHJvbWlzZTxNZXNzYWdlIHwgbnVsbD4ge1xuICAgIGNvbnN0IG9wZXJhdGlvblRpbWVzdGFtcElkID0gbWVzc2FnZVBheWxvYWQudGltZXN0YW1wLmdldFRpbWUoKTsgXG4gICAgXG4gICAgY29uc3QgYWN0aXZlQ2hhdEluc3RhbmNlID0gYXdhaXQgdGhpcy5nZXRBY3RpdmVDaGF0KCk7IFxuICAgIGlmICghYWN0aXZlQ2hhdEluc3RhbmNlKSB7XG4gICAgICAgICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBcbiAgICBpZiAoIW1lc3NhZ2VQYXlsb2FkLnRpbWVzdGFtcCkge1xuICAgICAgICBtZXNzYWdlUGF5bG9hZC50aW1lc3RhbXAgPSBuZXcgRGF0ZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgYWN0aXZlQ2hhdEluc3RhbmNlLm1lc3NhZ2VzLnB1c2gobWVzc2FnZVBheWxvYWQpO1xuICAgIFxuICAgIFxuICAgIGNvbnN0IGFjdGl2aXR5UmVjb3JkZWQgPSBhY3RpdmVDaGF0SW5zdGFuY2UucmVjb3JkQWN0aXZpdHkoKTsgXG4gICAgXG5cblxuaWYgKGFjdGl2aXR5UmVjb3JkZWQpIHsgXG4gICAgICAgIGNvbnN0IHNhdmVBbmRVcGRhdGVJbmRleFN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnNhdmVDaGF0QW5kVXBkYXRlSW5kZXgoYWN0aXZlQ2hhdEluc3RhbmNlKTsgXG4gICAgICAgIGlmICghc2F2ZUFuZFVwZGF0ZUluZGV4U3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGVtaXRFdmVudCkge1xuICAgICAgXG4gICAgICBjb25zdCBjdXJyZW50QWN0aXZlQ2hhdElkRm9yRXZlbnQgPSB0aGlzLmFjdGl2ZUNoYXRJZCB8fCBhY3RpdmVDaGF0SW5zdGFuY2UubWV0YWRhdGEuaWQ7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwibWVzc2FnZS1hZGRlZFwiLCB7IGNoYXRJZDogY3VycmVudEFjdGl2ZUNoYXRJZEZvckV2ZW50LCBtZXNzYWdlOiBtZXNzYWdlUGF5bG9hZCB9KTtcbiAgICB9XG4gICAgcmV0dXJuIG1lc3NhZ2VQYXlsb2FkO1xuICB9XG5cbmFzeW5jIGdldENoYXQoaWQ6IHN0cmluZywgZmlsZVBhdGg/OiBzdHJpbmcpOiBQcm9taXNlPENoYXQgfCBudWxsPiB7XG4gIGlmICh0aGlzLmxvYWRlZENoYXRzW2lkXSkge1xuICAgICAgcmV0dXJuIHRoaXMubG9hZGVkQ2hhdHNbaWRdO1xuICB9XG5cbiAgbGV0IGFjdHVhbEZpbGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBmaWxlUGF0aDtcbiAgaWYgKCFhY3R1YWxGaWxlUGF0aCkge1xuICAgICAgXG4gICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IGF3YWl0IHRoaXMuZ2V0Q2hhdEhpZXJhcmNoeSgpO1xuICAgICAgICAgIGFjdHVhbEZpbGVQYXRoID0gdGhpcy5maW5kQ2hhdFBhdGhJbkhpZXJhcmNoeShpZCwgaGllcmFyY2h5KSA/PyB1bmRlZmluZWQ7XG4gICAgICAgICAgaWYgKGFjdHVhbEZpbGVQYXRoKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGhpZXJhcmNoeUVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGFjdHVhbEZpbGVQYXRoID0gdW5kZWZpbmVkOyBcbiAgICAgIH1cbiAgfVxuXG4gIFxuICBpZiAoIWFjdHVhbEZpbGVQYXRoICYmIHRoaXMuY2hhdEluZGV4W2lkXSkge1xuICAgICAgICAgICAgXG4gICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIHJldHVybiBudWxsOyBcbiAgfVxuXG4gIFxuICBpZiAoIXRoaXMuY2hhdEluZGV4W2lkXSAmJiAhYWN0dWFsRmlsZVBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgXG4gIFxuICBcblxuICBpZiAoIWFjdHVhbEZpbGVQYXRoKSB7IFxuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG5cbiAgdHJ5IHtcbiAgICAgIFxuICAgICAgY29uc3QgY2hhdCA9IGF3YWl0IENoYXQubG9hZEZyb21GaWxlKGFjdHVhbEZpbGVQYXRoLCB0aGlzLmFkYXB0ZXIsIHRoaXMucGx1Z2luLnNldHRpbmdzLCB0aGlzLmxvZ2dlcik7XG5cbiAgICAgIGlmIChjaGF0KSB7XG4gICAgICAgICAgdGhpcy5sb2FkZWRDaGF0c1tpZF0gPSBjaGF0OyBcblxuICAgICAgICAgIFxuICAgICAgICAgIGNvbnN0IHN0b3JlZE1ldGEgPSB0aGlzLmNoYXRJbmRleFtpZF07XG4gICAgICAgICAgY29uc3QgY3VycmVudE1ldGEgPSBjaGF0Lm1ldGFkYXRhO1xuICAgICAgICAgIGNvbnN0IGluZGV4TmVlZHNVcGRhdGUgPVxuICAgICAgICAgICAgICAhc3RvcmVkTWV0YSB8fCBcbiAgICAgICAgICAgICAgc3RvcmVkTWV0YS5uYW1lICE9PSBjdXJyZW50TWV0YS5uYW1lIHx8XG4gICAgICAgICAgICAgIHN0b3JlZE1ldGEubGFzdE1vZGlmaWVkICE9PSBjdXJyZW50TWV0YS5sYXN0TW9kaWZpZWQgfHxcbiAgICAgICAgICAgICAgc3RvcmVkTWV0YS5jcmVhdGVkQXQgIT09IGN1cnJlbnRNZXRhLmNyZWF0ZWRBdCB8fFxuICAgICAgICAgICAgICBzdG9yZWRNZXRhLm1vZGVsTmFtZSAhPT0gY3VycmVudE1ldGEubW9kZWxOYW1lIHx8XG4gICAgICAgICAgICAgIHN0b3JlZE1ldGEuc2VsZWN0ZWRSb2xlUGF0aCAhPT0gY3VycmVudE1ldGEuc2VsZWN0ZWRSb2xlUGF0aCB8fFxuICAgICAgICAgICAgICBzdG9yZWRNZXRhLnRlbXBlcmF0dXJlICE9PSBjdXJyZW50TWV0YS50ZW1wZXJhdHVyZSB8fFxuICAgICAgICAgICAgICBzdG9yZWRNZXRhLmNvbnRleHRXaW5kb3cgIT09IGN1cnJlbnRNZXRhLmNvbnRleHRXaW5kb3c7XG5cbiAgICAgICAgICBpZiAoaW5kZXhOZWVkc1VwZGF0ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0QW5kVXBkYXRlSW5kZXgoY2hhdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBjaGF0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVDaGF0RmlsZUFuZEluZGV4RW50cnlfTm9FbWl0KGlkLCBhY3R1YWxGaWxlUGF0aCwgZmFsc2UpOyBcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAodGhpcy5hY3RpdmVDaGF0SWQgPT09IGlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5zZXRBY3RpdmVDaGF0KG51bGwpOyBcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIGlmIChlcnJvci5jb2RlID09PSBcIkVOT0VOVFwiKSB7IFxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZUNoYXRGaWxlQW5kSW5kZXhFbnRyeV9Ob0VtaXQoaWQsIGFjdHVhbEZpbGVQYXRoLCBmYWxzZSk7IFxuICAgICAgICAgIFxuICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZUNoYXRJZCA9PT0gaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnNldEFjdGl2ZUNoYXQobnVsbCk7IFxuICAgICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgXG4gICAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG4gIHByaXZhdGUgZmluZENoYXRQYXRoSW5IaWVyYXJjaHkoY2hhdElkOiBzdHJpbmcsIG5vZGVzOiBIaWVyYXJjaHlOb2RlW10pOiBzdHJpbmcgfCBudWxsIHtcbiAgICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcbiAgICAgIGlmIChub2RlLnR5cGUgPT09IFwiY2hhdFwiICYmIG5vZGUubWV0YWRhdGEuaWQgPT09IGNoYXRJZCkge1xuICAgICAgICByZXR1cm4gbm9kZS5maWxlUGF0aDtcbiAgICAgIH0gZWxzZSBpZiAobm9kZS50eXBlID09PSBcImZvbGRlclwiKSB7XG4gICAgICAgIGNvbnN0IHBhdGhJbkZvbGRlciA9IHRoaXMuZmluZENoYXRQYXRoSW5IaWVyYXJjaHkoY2hhdElkLCBub2RlLmNoaWxkcmVuKTtcbiAgICAgICAgaWYgKHBhdGhJbkZvbGRlcikge1xuICAgICAgICAgIHJldHVybiBwYXRoSW5Gb2xkZXI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBcbiAgXG4gIGFzeW5jIGdldEFjdGl2ZUNoYXQoKTogUHJvbWlzZTxDaGF0IHwgbnVsbD4ge1xuICAgIGlmICghdGhpcy5hY3RpdmVDaGF0SWQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBpZiAodGhpcy5hY3RpdmVDaGF0ICYmIHRoaXMuYWN0aXZlQ2hhdC5tZXRhZGF0YS5pZCA9PT0gdGhpcy5hY3RpdmVDaGF0SWQpIHtcbiAgICAgIHJldHVybiB0aGlzLmFjdGl2ZUNoYXQ7XG4gICAgfVxuXG4gICAgY29uc3QgY2hhdCA9IGF3YWl0IHRoaXMuZ2V0Q2hhdCh0aGlzLmFjdGl2ZUNoYXRJZCk7XG4gICAgaWYgKGNoYXQpIHtcbiAgICAgIHRoaXMuYWN0aXZlQ2hhdCA9IGNoYXQ7XG4gICAgICByZXR1cm4gY2hhdDtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgaGllcmFyY2h5ID0gYXdhaXQgdGhpcy5nZXRDaGF0SGllcmFyY2h5KCk7XG4gICAgICBjb25zdCBmaXJzdENoYXQgPSB0aGlzLmZpbmRGaXJzdENoYXRJbkhpZXJhcmNoeShoaWVyYXJjaHkpO1xuICAgICAgY29uc3QgbmV4dEFjdGl2ZUlkID0gZmlyc3RDaGF0ID8gZmlyc3RDaGF0Lm1ldGFkYXRhLmlkIDogbnVsbDtcblxuICAgICAgYXdhaXQgdGhpcy5zZXRBY3RpdmVDaGF0KG5leHRBY3RpdmVJZCk7XG4gICAgICByZXR1cm4gdGhpcy5hY3RpdmVDaGF0O1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRBY3RpdmVDaGF0KGlkOiBzdHJpbmcgfCBudWxsKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcHJldmlvdXNBY3RpdmVJZCA9IHRoaXMuYWN0aXZlQ2hhdElkO1xuXG4gICAgaWYgKGlkID09PSBwcmV2aW91c0FjdGl2ZUlkKSB7XG4gICAgICBpZiAoaWQgJiYgIXRoaXMuYWN0aXZlQ2hhdCkge1xuICAgICAgICB0aGlzLmFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLmdldENoYXQoaWQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChpZCAmJiAhdGhpcy5jaGF0SW5kZXhbaWRdKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnJlYnVpbGRJbmRleEZyb21GaWxlcygpO1xuICAgICAgaWYgKCF0aGlzLmNoYXRJbmRleFtpZF0pIHtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvcjogQ2hhdCB3aXRoIElEICR7aWR9IG5vdCBmb3VuZC4gQ2Fubm90IGFjdGl2YXRlLmApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5hY3RpdmVDaGF0SWQgPSBpZDtcbiAgICB0aGlzLmFjdGl2ZUNoYXQgPSBudWxsO1xuICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVEYXRhS2V5KEFDVElWRV9DSEFUX0lEX0tFWSwgaWQpO1xuXG4gICAgbGV0IGxvYWRlZENoYXQ6IENoYXQgfCBudWxsID0gbnVsbDtcbiAgICBpZiAoaWQpIHtcbiAgICAgIGxvYWRlZENoYXQgPSBhd2FpdCB0aGlzLmdldENoYXQoaWQpO1xuICAgICAgaWYgKCFsb2FkZWRDaGF0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVDaGF0SWQgPSBudWxsO1xuICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YUtleShBQ1RJVkVfQ0hBVF9JRF9LRVksIG51bGwpO1xuICAgICAgICBpZCA9IG51bGw7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmFjdGl2ZUNoYXQgPSBsb2FkZWRDaGF0O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgfVxuXG4gICAgdGhpcy5wbHVnaW4uZW1pdChcImFjdGl2ZS1jaGF0LWNoYW5nZWRcIiwgeyBjaGF0SWQ6IGlkLCBjaGF0OiB0aGlzLmFjdGl2ZUNoYXQgfSk7XG4gIH1cblxuICBhc3luYyBhZGRNZXNzYWdlVG9BY3RpdmVDaGF0KFxuICAgIHJvbGU6IE1lc3NhZ2VSb2xlLFxuICAgIGNvbnRlbnQ6IHN0cmluZyxcbiAgICB0aW1lc3RhbXA/OiBEYXRlLFxuICAgIGVtaXRFdmVudDogYm9vbGVhbiA9IHRydWUsXG4gICAgdG9vbF9jYWxscz86IFRvb2xDYWxsW10sXG4gICAgdG9vbF9jYWxsX2lkPzogc3RyaW5nLFxuICAgIG5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxNZXNzYWdlIHwgbnVsbD4ge1xuICAgIGNvbnN0IG1lc3NhZ2VUaW1lc3RhbXAgPSB0aW1lc3RhbXAgfHwgbmV3IERhdGUoKTtcbiAgICBjb25zdCBuZXdNZXNzYWdlOiBNZXNzYWdlID0ge1xuICAgICAgICByb2xlLFxuICAgICAgICBjb250ZW50LFxuICAgICAgICB0aW1lc3RhbXA6IG1lc3NhZ2VUaW1lc3RhbXAsXG4gICAgfTtcblxuICAgIFxuICAgIGlmICh0b29sX2NhbGxzICYmIHRvb2xfY2FsbHMubGVuZ3RoID4gMCkge1xuICAgICAgbmV3TWVzc2FnZS50b29sX2NhbGxzID0gdG9vbF9jYWxscztcbiAgICB9XG4gICAgaWYgKHRvb2xfY2FsbF9pZCkge1xuICAgICAgbmV3TWVzc2FnZS50b29sX2NhbGxfaWQgPSB0b29sX2NhbGxfaWQ7XG4gICAgfVxuICAgIGlmIChuYW1lKSB7XG4gICAgICBuZXdNZXNzYWdlLm5hbWUgPSBuYW1lO1xuICAgIH1cbiAgICBcblxuICAgIHJldHVybiBhd2FpdCB0aGlzLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXRQYXlsb2FkKG5ld01lc3NhZ2UsIGVtaXRFdmVudCk7XG4gIH1cblxuICBhc3luYyBjbGVhckFjdGl2ZUNoYXRNZXNzYWdlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5nZXRBY3RpdmVDaGF0KCk7XG4gICAgaWYgKCFhY3RpdmVDaGF0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChhY3RpdmVDaGF0Lm1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGFjdGl2ZUNoYXQuY2xlYXJNZXNzYWdlcygpO1xuXG4gICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEFuZFVwZGF0ZUluZGV4KGFjdGl2ZUNoYXQpO1xuICAgIHRoaXMucGx1Z2luLmVtaXQoXCJtZXNzYWdlcy1jbGVhcmVkXCIsIGFjdGl2ZUNoYXQubWV0YWRhdGEuaWQpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlQWN0aXZlQ2hhdE1ldGFkYXRhKFxuICAgIG1ldGFkYXRhVXBkYXRlOiBQYXJ0aWFsPE9taXQ8Q2hhdE1ldGFkYXRhLCBcImlkXCIgfCBcImNyZWF0ZWRBdFwiIHwgXCJsYXN0TW9kaWZpZWRcIj4+XG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLmdldEFjdGl2ZUNoYXQoKTtcbiAgICBpZiAoIWFjdGl2ZUNoYXQpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJObyBhY3RpdmUgY2hhdCB0byB1cGRhdGUgbWV0YWRhdGEgZm9yLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhtZXRhZGF0YVVwZGF0ZSkubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgICAgICBjb25zdCBvbGRSb2xlUGF0aCA9IGFjdGl2ZUNoYXQubWV0YWRhdGEuc2VsZWN0ZWRSb2xlUGF0aDtcbiAgICBjb25zdCBvbGRNb2RlbE5hbWUgPSBhY3RpdmVDaGF0Lm1ldGFkYXRhLm1vZGVsTmFtZTtcblxuICAgIGNvbnN0IGNoYW5nZWQgPSBhY3RpdmVDaGF0LnVwZGF0ZU1ldGFkYXRhKG1ldGFkYXRhVXBkYXRlKTtcblxuICAgIGlmIChjaGFuZ2VkKSB7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRBbmRVcGRhdGVJbmRleChhY3RpdmVDaGF0KTtcblxuICAgICAgY29uc3QgbmV3TWV0YSA9IGFjdGl2ZUNoYXQubWV0YWRhdGE7XG4gICAgICBsZXQgcm9sZUNoYW5nZWQgPSBmYWxzZTtcbiAgICAgIGxldCBtb2RlbENoYW5nZWQgPSBmYWxzZTtcbiAgICAgIGlmIChtZXRhZGF0YVVwZGF0ZS5zZWxlY3RlZFJvbGVQYXRoICE9PSB1bmRlZmluZWQgJiYgb2xkUm9sZVBhdGggIT09IG5ld01ldGEuc2VsZWN0ZWRSb2xlUGF0aCkge1xuICAgICAgICByb2xlQ2hhbmdlZCA9IHRydWU7XG4gICAgICB9XG4gICAgICBpZiAobWV0YWRhdGFVcGRhdGUubW9kZWxOYW1lICE9PSB1bmRlZmluZWQgJiYgb2xkTW9kZWxOYW1lICE9PSBuZXdNZXRhLm1vZGVsTmFtZSkge1xuICAgICAgICBtb2RlbENoYW5nZWQgPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocm9sZUNoYW5nZWQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCByb2xlUGF0aEFyZyA9IG5ld01ldGEuc2VsZWN0ZWRSb2xlUGF0aCA/PyB1bmRlZmluZWQ7XG4gICAgICAgICAgY29uc3QgbmV3Um9sZU5hbWUgPSBhd2FpdCB0aGlzLnBsdWdpbi5maW5kUm9sZU5hbWVCeVBhdGgocm9sZVBhdGhBcmcpO1xuXG4gICAgICAgICAgdGhpcy5wbHVnaW4uZW1pdChcInJvbGUtY2hhbmdlZFwiLCBuZXdSb2xlTmFtZSA/PyBcIk5vbmVcIik7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucHJvbXB0U2VydmljZT8uY2xlYXJSb2xlQ2FjaGU/LigpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAobW9kZWxDaGFuZ2VkKSB7XG4gICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJtb2RlbC1jaGFuZ2VkXCIsIG5ld01ldGEubW9kZWxOYW1lIHx8IFwiXCIpO1xuICAgICAgICB0aGlzLnBsdWdpbi5wcm9tcHRTZXJ2aWNlPy5jbGVhck1vZGVsRGV0YWlsc0NhY2hlPy4oKTtcbiAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJhY3RpdmUtY2hhdC1jaGFuZ2VkXCIsIHsgY2hhdElkOiB0aGlzLmFjdGl2ZUNoYXRJZCwgY2hhdDogYWN0aXZlQ2hhdCB9KTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cblxuXG5cbi8qKlxuICog0JTQvtC/0L7QvNGW0LbQvdC40Lkg0LzQtdGC0L7QtCDQtNC70Y8g0LLQuNC00LDQu9C10L3QvdGPINGE0LDQudC70YMg0YfQsNGC0YMg0YLQsCDQt9Cw0L/QuNGB0YMg0Lcg0ZbQvdC00LXQutGB0YMg0JHQldCXINCz0LXQvdC10YDQsNGG0ZbRlyDQv9C+0LTRltC5LlxuICogQHBhcmFtIGlkIElEINGH0LDRgtGDINC00LvRjyDQstC40LTQsNC70LXQvdC90Y8uXG4gKiBAcGFyYW0gZmlsZVBhdGgg0KjQu9GP0YUg0LTQviDRhNCw0LnQu9GDINGH0LDRgtGDICjQvNC+0LbQtSDQsdGD0YLQuCBudWxsKS5cbiAqIEBwYXJhbSBkZWxldGVGaWxlINCn0Lgg0L/QvtGC0YDRltCx0L3QviDQstC40LTQsNC70Y/RgtC4INGE0ZbQt9C40YfQvdC40Lkg0YTQsNC50LsuXG4gKiBAcmV0dXJucyB0cnVlLCDRj9C60YnQviDRltC90LTQtdC60YEgY2hhdEluZGV4INCx0YPQsiDQt9C80ZbQvdC10L3QuNC5LCBmYWxzZSDQsiDRltC90YjQvtC80YMg0LLQuNC/0LDQtNC60YMuXG4gKi9cbnByaXZhdGUgYXN5bmMgZGVsZXRlQ2hhdEZpbGVBbmRJbmRleEVudHJ5X05vRW1pdChcbiAgaWQ6IHN0cmluZyxcbiAgZmlsZVBhdGg6IHN0cmluZyB8IG51bGwsXG4gIGRlbGV0ZUZpbGU6IGJvb2xlYW4gPSB0cnVlXG4pOiBQcm9taXNlPGJvb2xlYW4+IHsgXG4gIGNvbnN0IHNhZmVGaWxlUGF0aCA9IGZpbGVQYXRoID8/IFwidW5rbm93bl9wYXRoXCI7IFxuICBsZXQgaW5kZXhDaGFuZ2VkID0gZmFsc2U7XG5cbiAgXG4gIGlmICh0aGlzLmxvYWRlZENoYXRzW2lkXSkge1xuICAgICAgZGVsZXRlIHRoaXMubG9hZGVkQ2hhdHNbaWRdO1xuICAgICAgICB9XG4gIFxuICBpZiAodGhpcy5jaGF0SW5kZXhbaWRdKSB7XG4gICAgICBkZWxldGUgdGhpcy5jaGF0SW5kZXhbaWRdO1xuICAgICAgaW5kZXhDaGFuZ2VkID0gdHJ1ZTsgXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgIH1cblxuICBcbiAgaWYgKGRlbGV0ZUZpbGUgJiYgZmlsZVBhdGggJiYgdHlwZW9mIGZpbGVQYXRoID09PSBcInN0cmluZ1wiICYmIGZpbGVQYXRoICE9PSBcIi9cIiAmJiAhZmlsZVBhdGguZW5kc1dpdGgoXCIvXCIpKSB7XG4gICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGZpbGVFeGlzdHMgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuZXhpc3RzKGZpbGVQYXRoKTtcbiAgICAgICAgICBpZiAoZmlsZUV4aXN0cykge1xuICAgICAgICAgICAgICBjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5hZGFwdGVyLnN0YXQoZmlsZVBhdGgpO1xuICAgICAgICAgICAgICBpZiAoc3RhdD8udHlwZSA9PT0gXCJmaWxlXCIpIHtcbiAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYWRhcHRlci5yZW1vdmUoZmlsZVBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yIGRlbGV0aW5nIGZpbGU6ICR7ZmlsZVBhdGguc3BsaXQoJy8nKS5wb3AoKX1gKTtcbiAgICAgICAgICBcbiAgICAgIH1cbiAgfSBlbHNlIGlmIChkZWxldGVGaWxlICYmIGZpbGVQYXRoKSB7XG4gICAgICAgXG4gICAgICAgICB9XG5cbiAgXG4gIGlmIChpbmRleENoYW5nZWQpIHtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRJbmRleCgpO1xuICAgICAgICB9XG4gIHJldHVybiBpbmRleENoYW5nZWQ7IFxufVxuXG4gIFxuXG5hc3luYyBkZWxldGVDaGF0KGlkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgY29uc3QgY2hhdEV4aXN0ZWRJbkluZGV4ID0gISF0aGlzLmNoYXRJbmRleFtpZF07XG4gIGNvbnN0IHdhc0FjdGl2ZSA9IGlkID09PSB0aGlzLmFjdGl2ZUNoYXRJZDtcbiAgXG4gIGxldCBmaWxlUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHRyeSB7XG4gICAgICBcbiAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IGF3YWl0IHRoaXMuZ2V0Q2hhdEhpZXJhcmNoeSgpO1xuICAgICAgZmlsZVBhdGggPSB0aGlzLmZpbmRDaGF0UGF0aEluSGllcmFyY2h5KGlkLCBoaWVyYXJjaHkpO1xuICAgICAgaWYgKCFmaWxlUGF0aCAmJiBjaGF0RXhpc3RlZEluSW5kZXgpIHtcbiAgICAgICAgICAgICAgICAgfVxuICB9IGNhdGNoIChoaWVyYXJjaHlFcnJvcikge1xuICAgICAgICAgICAgXG4gIH1cblxuICBcbiAgaWYgKCFmaWxlUGF0aCAmJiAhY2hhdEV4aXN0ZWRJbkluZGV4KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7IFxuICB9XG5cbiAgbGV0IHN1Y2Nlc3MgPSB0cnVlO1xuICBcbiAgbGV0IGV2ZW50VG9FbWl0OiB7IG5hbWU6IHN0cmluZzsgZGF0YTogYW55IH0gfCBudWxsID0gbnVsbDtcblxuICB0cnkge1xuICAgICAgXG4gICAgICBjb25zdCBpbmRleFdhc0NoYW5nZWQgPSBhd2FpdCB0aGlzLmRlbGV0ZUNoYXRGaWxlQW5kSW5kZXhFbnRyeV9Ob0VtaXQoaWQsIGZpbGVQYXRoLCB0cnVlKTtcbiAgICAgIFxuICAgICAgXG4gICAgICBpZiAod2FzQWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgIGNvbnN0IG5ld0hpZXJhcmNoeSA9IGF3YWl0IHRoaXMuZ2V0Q2hhdEhpZXJhcmNoeSgpOyBcbiAgICAgICAgICBjb25zdCBmaXJzdENoYXQgPSB0aGlzLmZpbmRGaXJzdENoYXRJbkhpZXJhcmNoeShuZXdIaWVyYXJjaHkpO1xuICAgICAgICAgIGNvbnN0IG5leHRBY3RpdmVJZCA9IGZpcnN0Q2hhdCA/IGZpcnN0Q2hhdC5tZXRhZGF0YS5pZCA6IG51bGw7XG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgYXdhaXQgdGhpcy5zZXRBY3RpdmVDaGF0KG5leHRBY3RpdmVJZCk7XG4gICAgICAgICAgXG5cbiAgICAgIH0gZWxzZSBpZiAoaW5kZXhXYXNDaGFuZ2VkKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50VG9FbWl0ID0geyBuYW1lOiBcImNoYXQtbGlzdC11cGRhdGVkXCIsIGRhdGE6IHVuZGVmaW5lZCB9O1xuICAgICAgfVxuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvciBkZWxldGluZyBjaGF0ICR7aWR9LiBDaGVjayBjb25zb2xlLmApO1xuICAgICAgc3VjY2VzcyA9IGZhbHNlO1xuICAgICAgXG4gICAgICBhd2FpdCB0aGlzLnJlYnVpbGRJbmRleEZyb21GaWxlcygpO1xuICAgICAgXG4gICAgICBldmVudFRvRW1pdCA9IHsgbmFtZTogXCJjaGF0LWxpc3QtdXBkYXRlZFwiLCBkYXRhOiB1bmRlZmluZWQgfTtcbiAgfSBmaW5hbGx5IHtcbiAgICAgIFxuICAgICAgaWYgKGV2ZW50VG9FbWl0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uZW1pdChldmVudFRvRW1pdC5uYW1lLCBldmVudFRvRW1pdC5kYXRhKTtcbiAgICAgIH0gZWxzZSBpZiAod2FzQWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgIH1cblxuICAgICAgXG4gICAgICBpZiAoc3VjY2VzcyAmJiBjaGF0RXhpc3RlZEluSW5kZXgpIHtcbiAgICAgICAgICBuZXcgTm90aWNlKGBDaGF0IGRlbGV0ZWQuYCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICghY2hhdEV4aXN0ZWRJbkluZGV4KSB7XG4gICAgICAgICAgICAgICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIHN1Y2Nlc3MgJiYgY2hhdEV4aXN0ZWRJbkluZGV4O1xufVxuXG4gIGFzeW5jIGNsb25lQ2hhdChjaGF0SWRUb0Nsb25lOiBzdHJpbmcpOiBQcm9taXNlPENoYXQgfCBudWxsPiB7XG4gICAgbGV0IG9yaWdpbmFsRmlsZVBhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBoaWVyYXJjaHkgPSBhd2FpdCB0aGlzLmdldENoYXRIaWVyYXJjaHkoKTtcbiAgICAgIG9yaWdpbmFsRmlsZVBhdGggPSB0aGlzLmZpbmRDaGF0UGF0aEluSGllcmFyY2h5KGNoYXRJZFRvQ2xvbmUsIGhpZXJhcmNoeSk7XG4gICAgfSBjYXRjaCAoaGllcmFyY2h5RXJyb3IpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBmaW5kaW5nIG9yaWdpbmFsIGNoYXQgZm9yIGNsb25pbmcuXCIpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKCFvcmlnaW5hbEZpbGVQYXRoKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiT3JpZ2luYWwgY2hhdCBmaWxlIHBhdGggbm90IGZvdW5kLlwiKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBjb25zdCBvcmlnaW5hbENoYXQgPSBhd2FpdCB0aGlzLmdldENoYXQoY2hhdElkVG9DbG9uZSwgb3JpZ2luYWxGaWxlUGF0aCk7XG4gICAgaWYgKCFvcmlnaW5hbENoYXQpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJPcmlnaW5hbCBjaGF0IGNvdWxkIG5vdCBiZSBsb2FkZWQuXCIpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgdGFyZ2V0Rm9sZGVyID0gb3JpZ2luYWxGaWxlUGF0aC5zdWJzdHJpbmcoMCwgb3JpZ2luYWxGaWxlUGF0aC5sYXN0SW5kZXhPZihcIi9cIikpIHx8IFwiL1wiO1xuICAgIGNvbnN0IGZpbmFsRm9sZGVyUGF0aCA9IHRhcmdldEZvbGRlciA9PT0gXCJcIiB8fCB0YXJnZXRGb2xkZXIgPT09IFwiLlwiID8gXCIvXCIgOiB0YXJnZXRGb2xkZXI7XG5cbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5lbnN1cmVTcGVjaWZpY0ZvbGRlckV4aXN0cyhmaW5hbEZvbGRlclBhdGgpO1xuICAgIH0gY2F0Y2ggKGZvbGRlckVycm9yKSB7XG4gICAgICBuZXcgTm90aWNlKGBGYWlsZWQgdG8gZW5zdXJlIHRhcmdldCBmb2xkZXIgZm9yIGNsb25lOiAke2ZpbmFsRm9sZGVyUGF0aH1gKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBjbG9uZWREYXRhID0gb3JpZ2luYWxDaGF0LnRvSlNPTigpO1xuICAgICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICAgIGNvbnN0IG5ld0lkID0gdXVpZHY0KCk7XG4gICAgICBjb25zdCBuZXdGaWxlUGF0aCA9IHRoaXMuZ2V0Q2hhdEZpbGVQYXRoKG5ld0lkLCBmaW5hbEZvbGRlclBhdGgpO1xuXG4gICAgICBjbG9uZWREYXRhLm1ldGFkYXRhLmlkID0gbmV3SWQ7XG4gICAgICBjbG9uZWREYXRhLm1ldGFkYXRhLm5hbWUgPSBgQ29weSBvZiAke29yaWdpbmFsQ2hhdC5tZXRhZGF0YS5uYW1lfWA7XG4gICAgICBjbG9uZWREYXRhLm1ldGFkYXRhLmNyZWF0ZWRBdCA9IG5vdy50b0lTT1N0cmluZygpO1xuICAgICAgY2xvbmVkRGF0YS5tZXRhZGF0YS5sYXN0TW9kaWZpZWQgPSBub3cudG9JU09TdHJpbmcoKTtcbiAgICAgIGNsb25lZERhdGEubWV0YWRhdGEubW9kZWxOYW1lID0gb3JpZ2luYWxDaGF0Lm1ldGFkYXRhLm1vZGVsTmFtZTtcbiAgICAgIGNsb25lZERhdGEubWV0YWRhdGEuc2VsZWN0ZWRSb2xlUGF0aCA9IG9yaWdpbmFsQ2hhdC5tZXRhZGF0YS5zZWxlY3RlZFJvbGVQYXRoO1xuICAgICAgY2xvbmVkRGF0YS5tZXRhZGF0YS50ZW1wZXJhdHVyZSA9IG9yaWdpbmFsQ2hhdC5tZXRhZGF0YS50ZW1wZXJhdHVyZTtcbiAgICAgIGNsb25lZERhdGEubWV0YWRhdGEuY29udGV4dFdpbmRvdyA9IG9yaWdpbmFsQ2hhdC5tZXRhZGF0YS5jb250ZXh0V2luZG93O1xuXG4gICAgICBjb25zdCBjb25zdHJ1Y3RvclNldHRpbmdzOiBDaGF0Q29uc3RydWN0b3JTZXR0aW5ncyA9IHsgLi4udGhpcy5wbHVnaW4uc2V0dGluZ3MgfTtcbiAgICAgIGNvbnN0IGNsb25lZENoYXQgPSBuZXcgQ2hhdCh0aGlzLmFkYXB0ZXIsIGNvbnN0cnVjdG9yU2V0dGluZ3MsIGNsb25lZERhdGEsIG5ld0ZpbGVQYXRoLCB0aGlzLmxvZ2dlcik7XG5cbiAgICAgIGNvbnN0IHN0b3JlZE1ldGE6IENoYXRTZXNzaW9uU3RvcmVkID0ge1xuICAgICAgICBuYW1lOiBjbG9uZWREYXRhLm1ldGFkYXRhLm5hbWUsXG4gICAgICAgIGxhc3RNb2RpZmllZDogY2xvbmVkRGF0YS5tZXRhZGF0YS5sYXN0TW9kaWZpZWQsXG4gICAgICAgIGNyZWF0ZWRBdDogY2xvbmVkRGF0YS5tZXRhZGF0YS5jcmVhdGVkQXQsXG4gICAgICAgIG1vZGVsTmFtZTogY2xvbmVkRGF0YS5tZXRhZGF0YS5tb2RlbE5hbWUsXG4gICAgICAgIHNlbGVjdGVkUm9sZVBhdGg6IGNsb25lZERhdGEubWV0YWRhdGEuc2VsZWN0ZWRSb2xlUGF0aCxcbiAgICAgICAgdGVtcGVyYXR1cmU6IGNsb25lZERhdGEubWV0YWRhdGEudGVtcGVyYXR1cmUsXG4gICAgICAgIGNvbnRleHRXaW5kb3c6IGNsb25lZERhdGEubWV0YWRhdGEuY29udGV4dFdpbmRvdyxcbiAgICAgIH07XG4gICAgICB0aGlzLmNoYXRJbmRleFtuZXdJZF0gPSBzdG9yZWRNZXRhO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEluZGV4KCk7XG4gICAgICBcblxuICAgICAgY29uc3Qgc2F2ZWRJbW1lZGlhdGVseSA9IGF3YWl0IGNsb25lZENoYXQuc2F2ZUltbWVkaWF0ZWx5KCk7XG4gICAgICBpZiAoIXNhdmVkSW1tZWRpYXRlbHkpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuY2hhdEluZGV4W25ld0lkXTtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEluZGV4KCk7XG4gICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJjaGF0LWxpc3QtdXBkYXRlZFwiKTtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3I6IEZhaWxlZCB0byBzYXZlIHRoZSBjbG9uZWQgY2hhdCBmaWxlLlwiKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIHRoaXMubG9hZGVkQ2hhdHNbbmV3SWRdID0gY2xvbmVkQ2hhdDtcbiAgICAgIGF3YWl0IHRoaXMuc2V0QWN0aXZlQ2hhdChuZXdJZCk7XG5cbiAgICAgIHJldHVybiBjbG9uZWRDaGF0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgY2xvbmluZyB0aGUgY2hhdC5cIik7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICBhc3luYyBkZWxldGVNZXNzYWdlc0FmdGVyKGNoYXRJZDogc3RyaW5nLCBtZXNzYWdlSW5kZXhUb0RlbGV0ZUFmdGVyOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBjaGF0ID0gYXdhaXQgdGhpcy5nZXRDaGF0KGNoYXRJZCk7XG4gICAgaWYgKCFjaGF0KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKG1lc3NhZ2VJbmRleFRvRGVsZXRlQWZ0ZXIgPj0gY2hhdC5tZXNzYWdlcy5sZW5ndGggLSAxKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKG1lc3NhZ2VJbmRleFRvRGVsZXRlQWZ0ZXIgPCAtMSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IG9yaWdpbmFsTGVuZ3RoID0gY2hhdC5tZXNzYWdlcy5sZW5ndGg7XG4gICAgY29uc3QgdGFyZ2V0TGVuZ3RoID0gbWVzc2FnZUluZGV4VG9EZWxldGVBZnRlciArIDE7XG4gICAgY2hhdC5tZXNzYWdlcy5sZW5ndGggPSB0YXJnZXRMZW5ndGg7XG5cbiAgICBjaGF0LnVwZGF0ZU1ldGFkYXRhKHt9KTtcblxuICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRBbmRVcGRhdGVJbmRleChjaGF0KTtcblxuICAgIGlmICh0aGlzLmFjdGl2ZUNoYXRJZCA9PT0gY2hhdElkKSB7XG4gICAgICB0aGlzLmFjdGl2ZUNoYXQgPSBjaGF0O1xuXG4gICAgICB0aGlzLnBsdWdpbi5lbWl0KFwiYWN0aXZlLWNoYXQtY2hhbmdlZFwiLCB7IGNoYXRJZDogY2hhdElkLCBjaGF0OiBjaGF0IH0pO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgYXN5bmMgZGVsZXRlTWVzc2FnZUJ5VGltZXN0YW1wKGNoYXRJZDogc3RyaW5nLCB0aW1lc3RhbXBUb0RlbGV0ZTogRGF0ZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IGNoYXQgPSBhd2FpdCB0aGlzLmdldENoYXQoY2hhdElkKTtcbiAgICBpZiAoIWNoYXQpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yOiBDaGF0ICR7Y2hhdElkfSBub3QgZm91bmQuYCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgdGltZVRhcmdldCA9IHRpbWVzdGFtcFRvRGVsZXRlLmdldFRpbWUoKTtcbiAgICBjb25zdCB0b2xlcmFuY2UgPSAxMDAwOyBcbiAgICBsZXQgbWVzc2FnZUluZGV4ID0gLTE7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoYXQubWVzc2FnZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2VUaW1lID0gY2hhdC5tZXNzYWdlc1tpXS50aW1lc3RhbXAuZ2V0VGltZSgpO1xuICAgICAgaWYgKCFpc05hTihtZXNzYWdlVGltZSkgJiYgTWF0aC5hYnMobWVzc2FnZVRpbWUgLSB0aW1lVGFyZ2V0KSA8IHRvbGVyYW5jZSkge1xuICAgICAgICBtZXNzYWdlSW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH0gZWxzZSBpZiAoaXNOYU4obWVzc2FnZVRpbWUpKSB7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG1lc3NhZ2VJbmRleCA9PT0gLTEpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJNZXNzYWdlIG5vdCBmb3VuZC5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuX3BlcmZvcm1EZWxldGVNZXNzYWdlQnlJbmRleChjaGF0LCBtZXNzYWdlSW5kZXgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBfcGVyZm9ybURlbGV0ZU1lc3NhZ2VCeUluZGV4KGNoYXQ6IENoYXQsIG1lc3NhZ2VJbmRleDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgY2hhdElkID0gY2hhdC5tZXRhZGF0YS5pZDtcbiAgICB0cnkge1xuICAgICAgaWYgKG1lc3NhZ2VJbmRleCA8IDAgfHwgbWVzc2FnZUluZGV4ID49IGNoYXQubWVzc2FnZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBkZWxldGVkTWVzc2FnZSA9IGNoYXQubWVzc2FnZXMuc3BsaWNlKG1lc3NhZ2VJbmRleCwgMSlbMF07XG5cbiAgICAgIGNoYXQudXBkYXRlTWV0YWRhdGEoe30pO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEFuZFVwZGF0ZUluZGV4KGNoYXQpO1xuXG4gICAgICBpZiAodGhpcy5hY3RpdmVDaGF0SWQgPT09IGNoYXRJZCkge1xuICAgICAgICB0aGlzLmFjdGl2ZUNoYXQgPSBjaGF0O1xuXG4gICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJhY3RpdmUtY2hhdC1jaGFuZ2VkXCIsIHsgY2hhdElkOiBjaGF0SWQsIGNoYXQ6IGNoYXQgfSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChkZWxldGVkTWVzc2FnZSkge1xuICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwibWVzc2FnZS1kZWxldGVkXCIsIHsgY2hhdElkOiBjaGF0SWQsIHRpbWVzdGFtcDogZGVsZXRlZE1lc3NhZ2UudGltZXN0YW1wIH0pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIkVycm9yIGRlbGV0aW5nIG1lc3NhZ2UuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGNsZWFyQ2hhdE1lc3NhZ2VzQnlJZChjaGF0SWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IGNoYXQgPSBhd2FpdCB0aGlzLmdldENoYXQoY2hhdElkKTtcbiAgICBpZiAoIWNoYXQpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yOiBDaGF0ICR7Y2hhdElkfSBub3QgZm91bmQuYCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKGNoYXQubWVzc2FnZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY2hhdC5jbGVhck1lc3NhZ2VzKCk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0QW5kVXBkYXRlSW5kZXgoY2hhdCk7XG5cbiAgICAgIGNvbnN0IGlzQWN0aXZlID0gY2hhdElkID09PSB0aGlzLmFjdGl2ZUNoYXRJZDtcbiAgICAgIGlmIChpc0FjdGl2ZSkge1xuICAgICAgICB0aGlzLmFjdGl2ZUNoYXQgPSBjaGF0O1xuXG4gICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJtZXNzYWdlcy1jbGVhcmVkXCIsIGNoYXRJZCk7XG4gICAgICB9XG4gICAgICBuZXcgTm90aWNlKGBNZXNzYWdlcyBjbGVhcmVkIGZvciBjaGF0IFwiJHtjaGF0Lm1ldGFkYXRhLm5hbWV9XCIuYCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIkVycm9yIGNsZWFyaW5nIG1lc3NhZ2VzLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBhc3luYyByZW5hbWVDaGF0KGNoYXRJZDogc3RyaW5nLCBuZXdOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCB0cmltbWVkTmFtZSA9IG5ld05hbWUudHJpbSgpO1xuICAgIGlmICghdHJpbW1lZE5hbWUpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJDaGF0IG5hbWUgY2Fubm90IGJlIGVtcHR5LlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKC9bXFxcXC8/OipcIjw+fF0vLnRlc3QodHJpbW1lZE5hbWUpKSB7XG4gICAgICBuZXcgTm90aWNlKFwiQ2hhdCBuYW1lIGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycy5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgY2hhdCA9IGF3YWl0IHRoaXMuZ2V0Q2hhdChjaGF0SWQpO1xuXG4gICAgaWYgKCFjaGF0KSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiQ2hhdCBub3QgZm91bmQuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmIChjaGF0Lm1ldGFkYXRhLm5hbWUgPT09IHRyaW1tZWROYW1lKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgY2hhbmdlZCA9IGNoYXQudXBkYXRlTWV0YWRhdGEoeyBuYW1lOiB0cmltbWVkTmFtZSB9KTtcblxuICAgICAgaWYgKGNoYW5nZWQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEFuZFVwZGF0ZUluZGV4KGNoYXQpO1xuXG4gICAgICAgIGlmICh0aGlzLmFjdGl2ZUNoYXRJZCA9PT0gY2hhdElkKSB7XG4gICAgICAgICAgdGhpcy5hY3RpdmVDaGF0ID0gY2hhdDtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwiYWN0aXZlLWNoYXQtY2hhbmdlZFwiLCB7IGNoYXRJZDogY2hhdElkLCBjaGF0OiBjaGF0IH0pO1xuICAgICAgICB9XG4gICAgICAgIG5ldyBOb3RpY2UoYENoYXQgcmVuYW1lZCB0byBcIiR7dHJpbW1lZE5hbWV9XCIuYCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgcmVuYW1pbmcgdGhlIGNoYXQuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIFxuXG4gIC8qKlxuICAgKiDQodGC0LLQvtGA0Y7RlCDQvdC+0LLRgyDQv9Cw0L/QutGDINC30LAg0LLQutCw0LfQsNC90LjQvCDRiNC70Y/RhdC+0LwuXG4gICAqIEBwYXJhbSBmb2xkZXJQYXRoINCf0L7QstC90LjQuSwg0L3QvtGA0LzQsNC70ZbQt9C+0LLQsNC90LjQuSDRiNC70Y/RhSDQtNC+INC/0LDQv9C60LgsINGP0LrRgyDQv9C+0YLRgNGW0LHQvdC+INGB0YLQstC+0YDQuNGC0LguXG4gICAqIEByZXR1cm5zIHRydWUsINGP0LrRidC+INC/0LDQv9C60LAg0YPRgdC/0ZbRiNC90L4g0YHRgtCy0L7RgNC10L3QsCwgZmFsc2Ug0LIg0ZbQvdGI0L7QvNGDINCy0LjQv9Cw0LTQutGDLlxuICAgKi9cbiAgYXN5bmMgY3JlYXRlRm9sZGVyKGZvbGRlclBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplUGF0aChmb2xkZXJQYXRoKTtcblxuICAgIFxuICAgIGlmICghbm9ybWFsaXplZFBhdGggfHwgbm9ybWFsaXplZFBhdGggPT09IFwiL1wiIHx8IG5vcm1hbGl6ZWRQYXRoID09PSBcIi5cIikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIkludmFsaWQgZm9sZGVyIHBhdGguXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAobm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi4uXCIpIHx8IG5vcm1hbGl6ZWRQYXRoLmluY2x1ZGVzKFwiXFwwXCIpKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiSW52YWxpZCBjaGFyYWN0ZXJzIG9yIHBhdGggdHJhdmVyc2FsIGRldGVjdGVkLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5hZGFwdGVyLmV4aXN0cyhub3JtYWxpemVkUGF0aCk7XG4gICAgICBpZiAoZXhpc3RzKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoYFwiJHtub3JtYWxpemVkUGF0aC5zcGxpdChcIi9cIikucG9wKCl9XCIgYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyLm1rZGlyKG5vcm1hbGl6ZWRQYXRoKTtcblxuICAgICAgdGhpcy5wbHVnaW4uZW1pdChcImNoYXQtbGlzdC11cGRhdGVkXCIpOyBcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSBcIkVQRVJNXCIgfHwgZXJyb3IuY29kZSA9PT0gXCJFQUNDRVNcIikge1xuICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYFBlcm1pc3Npb24gZXJyb3IgY3JlYXRpbmcgZm9sZGVyLmApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGBGYWlsZWQgdG8gY3JlYXRlIGZvbGRlcjogJHtlcnJvci5tZXNzYWdlIHx8IFwiVW5rbm93biBlcnJvclwifWApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiDQn9C10YDQtdC50LzQtdC90L7QstGD0ZQg0LDQsdC+INC/0LXRgNC10LzRltGJ0YPRlCDQv9Cw0L/QutGDLlxuICAgKiDQktCw0LbQu9C40LLQvjog0KbQtdC5INC80LXRgtC+0LQg0L3QtSDQvtC90L7QstC70Y7RlCDRltC90LTQtdC60YEgY2hhdEluZGV4INCw0LLRgtC+0LzQsNGC0LjRh9C90L4g0LTQu9GPINGH0LDRgtGW0LIg0LLRgdC10YDQtdC00LjQvdGWINC/0LDQv9C60LguXG4gICAqINCd0LDQudC60YDQsNGJ0LUg0LLQuNC60LvQuNC60LDRgtC4IHJlYnVpbGRJbmRleEZyb21GaWxlcygpINC/0ZbRgdC70Y8g0YPRgdC/0ZbRiNC90L7Qs9C+INC/0LXRgNC10LnQvNC10L3Rg9Cy0LDQvdC90Y8g0LDQsdC+INC/0L7QutC70LDQtNCw0YLQuNGB0Y9cbiAgICog0L3QsCDRgtC1LCDRidC+IGdldENoYXRIaWVyYXJjaHkoKSDQt9Cx0LjRgNCw0YLQuNC80LUg0LDQutGC0YPQsNC70YzQvdGDINGB0YLRgNGD0LrRgtGD0YDRgy5cbiAgICogQHBhcmFtIG9sZFBhdGgg0J/QvtCy0L3QuNC5LCDQvdC+0YDQvNCw0LvRltC30L7QstCw0L3QuNC5INGB0YLQsNGA0LjQuSDRiNC70Y/RhSDQtNC+INC/0LDQv9C60LguXG4gICAqIEBwYXJhbSBuZXdQYXRoINCf0L7QstC90LjQuSwg0L3QvtGA0LzQsNC70ZbQt9C+0LLQsNC90LjQuSDQvdC+0LLQuNC5INGI0LvRj9GFINC00L4g0L/QsNC/0LrQuC5cbiAgICogQHJldHVybnMgdHJ1ZSwg0Y/QutGJ0L4g0L/QtdGA0LXQudC80LXQvdGD0LLQsNC90L3Rjy/Qv9C10YDQtdC80ZbRidC10L3QvdGPINGD0YHQv9GW0YjQvdC1LCBmYWxzZSDQsiDRltC90YjQvtC80YMg0LLQuNC/0LDQtNC60YMuXG4gICAqL1xuICBhc3luYyByZW5hbWVGb2xkZXIob2xkUGF0aDogc3RyaW5nLCBuZXdQYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBub3JtT2xkUGF0aCA9IG5vcm1hbGl6ZVBhdGgob2xkUGF0aCk7XG4gICAgY29uc3Qgbm9ybU5ld1BhdGggPSBub3JtYWxpemVQYXRoKG5ld1BhdGgpO1xuXG4gICAgXG4gICAgaWYgKCFub3JtT2xkUGF0aCB8fCBub3JtT2xkUGF0aCA9PT0gXCIvXCIgfHwgIW5vcm1OZXdQYXRoIHx8IG5vcm1OZXdQYXRoID09PSBcIi9cIikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIkNhbm5vdCByZW5hbWUgcm9vdCBmb2xkZXIgb3IgdXNlIGVtcHR5IHBhdGguXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAobm9ybU9sZFBhdGggPT09IG5vcm1OZXdQYXRoKSB7XG4gICAgICByZXR1cm4gdHJ1ZTsgXG4gICAgfVxuICAgIGlmIChub3JtTmV3UGF0aC5zdGFydHNXaXRoKG5vcm1PbGRQYXRoICsgXCIvXCIpKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiQ2Fubm90IG1vdmUgYSBmb2xkZXIgaW5zaWRlIGl0c2VsZi5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG9sZEV4aXN0cyA9IGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHMobm9ybU9sZFBhdGgpO1xuICAgICAgaWYgKCFvbGRFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiRm9sZGVyIHRvIHJlbmFtZSBub3QgZm91bmQuXCIpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBjb25zdCBvbGRTdGF0ID0gYXdhaXQgdGhpcy5hZGFwdGVyLnN0YXQobm9ybU9sZFBhdGgpO1xuICAgICAgaWYgKG9sZFN0YXQ/LnR5cGUgIT09IFwiZm9sZGVyXCIpIHtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiSXRlbSB0byByZW5hbWUgaXMgbm90IGEgZm9sZGVyLlwiKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBuZXdFeGlzdHMgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuZXhpc3RzKG5vcm1OZXdQYXRoKTtcbiAgICAgIGlmIChuZXdFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGBcIiR7bm9ybU5ld1BhdGguc3BsaXQoXCIvXCIpLnBvcCgpfVwiIGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIFxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyLnJlbmFtZShub3JtT2xkUGF0aCwgbm9ybU5ld1BhdGgpO1xuXG4gICAgICBcbiAgICAgIE9iamVjdC52YWx1ZXModGhpcy5sb2FkZWRDaGF0cykuZm9yRWFjaChjaGF0ID0+IHtcbiAgICAgICAgaWYgKGNoYXQuZmlsZVBhdGguc3RhcnRzV2l0aChub3JtT2xkUGF0aCArIFwiL1wiKSkge1xuICAgICAgICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IGNoYXQuZmlsZVBhdGguc3Vic3RyaW5nKG5vcm1PbGRQYXRoLmxlbmd0aCk7XG4gICAgICAgICAgY29uc3QgdXBkYXRlZFBhdGggPSBub3JtYWxpemVQYXRoKG5vcm1OZXdQYXRoICsgcmVsYXRpdmVQYXRoKTtcblxuICAgICAgICAgIGNoYXQuZmlsZVBhdGggPSB1cGRhdGVkUGF0aDsgXG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLnBsdWdpbi5lbWl0KFwiY2hhdC1saXN0LXVwZGF0ZWRcIik7IFxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFwiRVBFUk1cIiB8fCBlcnJvci5jb2RlID09PSBcIkVBQ0NFU1wiKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShgUGVybWlzc2lvbiBlcnJvciByZW5hbWluZyBmb2xkZXIuYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYEZhaWxlZCB0byByZW5hbWUgZm9sZGVyOiAke2Vycm9yLm1lc3NhZ2UgfHwgXCJVbmtub3duIGVycm9yXCJ9YCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqINCg0LXQutGD0YDRgdC40LLQvdC+INCy0LjQtNCw0LvRj9GUINC/0LDQv9C60YMg0YLQsCDQstC10YHRjCDRl9GXINCy0LzRltGB0YIgKNC/0ZbQtNC/0LDQv9C60Lgg0YLQsCDRh9Cw0YLQuCkuXG4gICAqIEBwYXJhbSBmb2xkZXJQYXRoINCf0L7QstC90LjQuSwg0L3QvtGA0LzQsNC70ZbQt9C+0LLQsNC90LjQuSDRiNC70Y/RhSDQtNC+INC/0LDQv9C60LgsINGP0LrRgyDQv9C+0YLRgNGW0LHQvdC+INCy0LjQtNCw0LvQuNGC0LguXG4gICAqIEByZXR1cm5zIHRydWUsINGP0LrRidC+INC/0LDQv9C60LAg0YLQsCDRl9GXINCy0LzRltGB0YIg0YPRgdC/0ZbRiNC90L4g0LLQuNC00LDQu9C10L3RliwgZmFsc2Ug0LIg0ZbQvdGI0L7QvNGDINCy0LjQv9Cw0LTQutGDLlxuICAgKi9cbiAgYXN5bmMgZGVsZXRlRm9sZGVyKGZvbGRlclBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplUGF0aChmb2xkZXJQYXRoKTtcblxuICAgIFxuICAgIGlmICghbm9ybWFsaXplZFBhdGggfHwgbm9ybWFsaXplZFBhdGggPT09IFwiL1wiIHx8IG5vcm1hbGl6ZWRQYXRoID09PSBcIi5cIikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIkNhbm5vdCBkZWxldGUgdGhpcyBmb2xkZXIuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBcbiAgICBpZiAobm9ybWFsaXplZFBhdGggPT09IHRoaXMuY2hhdHNGb2xkZXJQYXRoKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiQ2Fubm90IGRlbGV0ZSB0aGUgbWFpbiBjaGF0IGhpc3RvcnkgZm9sZGVyIHNldCBpbiBzZXR0aW5ncy5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHMobm9ybWFsaXplZFBhdGgpO1xuICAgICAgaWYgKCFleGlzdHMpIHtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgICAgY29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuYWRhcHRlci5zdGF0KG5vcm1hbGl6ZWRQYXRoKTtcbiAgICAgIGlmIChzdGF0Py50eXBlICE9PSBcImZvbGRlclwiKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkl0ZW0gdG8gZGVsZXRlIGlzIG5vdCBhIGZvbGRlci5cIik7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgXG5cbiAgICAgIGNvbnN0IGNoYXRJZHNUb0RlbGV0ZTogc3RyaW5nW10gPSBbXTtcbiAgICAgIFxuICAgICAgY29uc3QgY29sbGVjdENoYXRJZHMgPSBhc3luYyAoY3VycmVudFBhdGg6IHN0cmluZykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGxpc3QgPSBhd2FpdCB0aGlzLmFkYXB0ZXIubGlzdChjdXJyZW50UGF0aCk7XG4gICAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGxpc3QuZmlsZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IGZpbGVOYW1lID0gZmlsZS5zdWJzdHJpbmcoZmlsZS5sYXN0SW5kZXhPZihcIi9cIikgKyAxKTtcbiAgICAgICAgICAgIGlmIChmaWxlTmFtZS5lbmRzV2l0aChcIi5qc29uXCIpKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGNoYXRJZCA9IGZpbGVOYW1lLnNsaWNlKDAsIC01KTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIGlmICh0aGlzLmNoYXRJbmRleFtjaGF0SWRdKSB7XG4gICAgICAgICAgICAgICAgY2hhdElkc1RvRGVsZXRlLnB1c2goY2hhdElkKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBmb3IgKGNvbnN0IGZvbGRlciBvZiBsaXN0LmZvbGRlcnMpIHtcbiAgICAgICAgICAgIGF3YWl0IGNvbGxlY3RDaGF0SWRzKGZvbGRlcik7IFxuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAobGlzdEVycm9yKSB7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICB9O1xuICAgICAgYXdhaXQgY29sbGVjdENoYXRJZHMobm9ybWFsaXplZFBhdGgpOyBcblxuICAgICAgbGV0IGFjdGl2ZUNoYXRXYXNEZWxldGVkID0gZmFsc2U7XG4gICAgICBjaGF0SWRzVG9EZWxldGUuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgIGlmICh0aGlzLmNoYXRJbmRleFtpZF0pIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jaGF0SW5kZXhbaWRdO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmxvYWRlZENoYXRzW2lkXSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmxvYWRlZENoYXRzW2lkXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5hY3RpdmVDaGF0SWQgPT09IGlkKSB7XG4gICAgICAgICAgYWN0aXZlQ2hhdFdhc0RlbGV0ZWQgPSB0cnVlO1xuICAgICAgICAgIHRoaXMuYWN0aXZlQ2hhdElkID0gbnVsbDsgXG4gICAgICAgICAgdGhpcy5hY3RpdmVDaGF0ID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRJbmRleCgpO1xuICAgICAgXG4gICAgICBpZiAoYWN0aXZlQ2hhdFdhc0RlbGV0ZWQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGFLZXkoQUNUSVZFX0NIQVRfSURfS0VZLCBudWxsKTtcbiAgICAgIH1cbiAgICAgIFxuXG4gICAgICBcbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlci5ybWRpcihub3JtYWxpemVkUGF0aCwgdHJ1ZSk7XG5cbiAgICAgIFxuICAgICAgdGhpcy5wbHVnaW4uZW1pdChcImNoYXQtbGlzdC11cGRhdGVkXCIpO1xuICAgICAgXG4gICAgICBpZiAoYWN0aXZlQ2hhdFdhc0RlbGV0ZWQpIHtcbiAgICAgICAgdGhpcy5wbHVnaW4uZW1pdChcImFjdGl2ZS1jaGF0LWNoYW5nZWRcIiwgeyBjaGF0SWQ6IG51bGwsIGNoYXQ6IG51bGwgfSk7XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBpZiAoZXJyb3IuY29kZSA9PT0gXCJFUEVSTVwiIHx8IGVycm9yLmNvZGUgPT09IFwiRUFDQ0VTXCIpIHtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGBQZXJtaXNzaW9uIGVycm9yIGRlbGV0aW5nIGZvbGRlci5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShgRmFpbGVkIHRvIGRlbGV0ZSBmb2xkZXI6ICR7ZXJyb3IubWVzc2FnZSB8fCBcIlVua25vd24gZXJyb3JcIn1gKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgYXdhaXQgdGhpcy5yZWJ1aWxkSW5kZXhGcm9tRmlsZXMoKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAgICBcbiAgICBhc3luYyBtb3ZlQ2hhdChjaGF0SWQ6IHN0cmluZywgb2xkRmlsZVBhdGg6IHN0cmluZywgbmV3Rm9sZGVyUGF0aDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgICBjb25zdCBub3JtT2xkUGF0aCA9IG5vcm1hbGl6ZVBhdGgob2xkRmlsZVBhdGgpO1xuICAgICAgY29uc3Qgbm9ybU5ld0ZvbGRlclBhdGggPSBub3JtYWxpemVQYXRoKG5ld0ZvbGRlclBhdGgpO1xuICAgICAgXG4gICAgICBcbiAgICAgIGxldCBuZXdGaWxlUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICBcblxuICAgICAgXG4gICAgICBpZiAoIWNoYXRJZCB8fCAhb2xkRmlsZVBhdGggfHwgIW5ld0ZvbGRlclBhdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIk1vdmUgY2hhdCBmYWlsZWQ6IEludmFsaWQgZGF0YS5cIik7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICAgIFxuICAgICAgICAgIGlmICghKGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHMobm9ybU9sZFBhdGgpKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJNb3ZlIGNoYXQgZmFpbGVkOiBTb3VyY2UgZmlsZSBub3QgZm91bmQuXCIpO1xuICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5yZWJ1aWxkSW5kZXhGcm9tRmlsZXMoKTtcbiAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmVtaXQoJ2NoYXQtbGlzdC11cGRhdGVkJyk7XG4gICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgIGNvbnN0IG9sZFN0YXQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuc3RhdChub3JtT2xkUGF0aCk7XG4gICAgICAgICAgIGlmKG9sZFN0YXQ/LnR5cGUgIT09ICdmaWxlJyl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJNb3ZlIGNoYXQgZmFpbGVkOiBTb3VyY2UgaXMgbm90IGEgZmlsZS5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICB9XG5cbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoIShhd2FpdCB0aGlzLmFkYXB0ZXIuZXhpc3RzKG5vcm1OZXdGb2xkZXJQYXRoKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiTW92ZSBjaGF0IGZhaWxlZDogVGFyZ2V0IGZvbGRlciBub3QgZm91bmQuXCIpO1xuICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgICBjb25zdCBuZXdTdGF0ID0gYXdhaXQgdGhpcy5hZGFwdGVyLnN0YXQobm9ybU5ld0ZvbGRlclBhdGgpO1xuICAgICAgICAgICBpZihuZXdTdGF0Py50eXBlICE9PSAnZm9sZGVyJyl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJNb3ZlIGNoYXQgZmFpbGVkOiBUYXJnZXQgaXMgbm90IGEgZm9sZGVyLlwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgIH1cblxuICAgICAgICAgIFxuICAgICAgICAgIGNvbnN0IGZpbGVOYW1lID0gb2xkRmlsZVBhdGguc3Vic3RyaW5nKG9sZEZpbGVQYXRoLmxhc3RJbmRleE9mKCcvJykgKyAxKTtcbiAgICAgICAgICBcbiAgICAgICAgICBuZXdGaWxlUGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7bm9ybU5ld0ZvbGRlclBhdGh9LyR7ZmlsZU5hbWV9YCk7XG4gICAgICAgICAgXG5cbiAgICAgICAgICBcbiAgICAgICAgICBpZiAobm9ybU9sZFBhdGggPT09IG5ld0ZpbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHMobmV3RmlsZVBhdGgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShgTW92ZSBjaGF0IGZhaWxlZDogQSBmaWxlIG5hbWVkIFwiJHtmaWxlTmFtZX1cIiBhbHJlYWR5IGV4aXN0cyBpbiB0aGUgdGFyZ2V0IGZvbGRlci5gKTtcbiAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucmVuYW1lKG5vcm1PbGRQYXRoLCBuZXdGaWxlUGF0aCk7XG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHRoaXMubG9hZGVkQ2hhdHNbY2hhdElkXSAmJiBuZXdGaWxlUGF0aCkgeyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZENoYXRzW2NoYXRJZF0uZmlsZVBhdGggPSBuZXdGaWxlUGF0aDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBcbiAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KCdjaGF0LWxpc3QtdXBkYXRlZCcpO1xuXG4gICAgICAgICAgcmV0dXJuIHRydWU7XG5cbiAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgXG4gICAgICAgICAgIGNvbnN0IHRhcmdldFBhdGhEZXNjID0gbmV3RmlsZVBhdGggPz8gbm9ybU5ld0ZvbGRlclBhdGg7IFxuICAgICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gJ0VQRVJNJyB8fCBlcnJvci5jb2RlID09PSAnRUFDQ0VTJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShgUGVybWlzc2lvbiBlcnJvciBtb3ZpbmcgY2hhdCBmaWxlLmApO1xuICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGBGYWlsZWQgdG8gbW92ZSBjaGF0OiAke2Vycm9yLm1lc3NhZ2UgfHwgXCJVbmtub3duIGVycm9yXCJ9YCk7XG4gICAgICAgICAgIH1cbiAgICAgICAgICAgXG4gICAgICAgICAgIGF3YWl0IHRoaXMucmVidWlsZEluZGV4RnJvbUZpbGVzKCk7XG4gICAgICAgICAgIHRoaXMucGx1Z2luLmVtaXQoJ2NoYXQtbGlzdC11cGRhdGVkJyk7XG4gICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgfVxuICBcbiAgLyoqXG4gICAqINCg0LXRlNGB0YLRgNGD0ZQg0YDQtdC30L7Qu9Cy0LXRgCDQtNC70Y8g0L/QvtC00ZbRlyBtZXNzYWdlLWFkZGVkLlxuICAgKiDQptC10Lkg0LzQtdGC0L7QtCDQstC40LrQu9C40LrQsNGC0LjQvNC10YLRjNGB0Y8g0LcgT2xsYW1hVmlldyDQv9C10YDQtdC0INGC0LjQvCwg0Y/QuiBDaGF0TWFuYWdlciDQtNC+0LTQsNGB0YLRjCDQv9C+0LLRltC00L7QvNC70LXQvdC90Y8uXG4gICAqL1xuICBwdWJsaWMgcmVnaXN0ZXJITUFSZXNvbHZlcih0aW1lc3RhbXBNczogbnVtYmVyLCByZXNvbHZlOiAoKSA9PiB2b2lkLCByZWplY3Q6IChyZWFzb24/OiBhbnkpID0+IHZvaWQpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuaGFzKHRpbWVzdGFtcE1zKSkge1xuICAgICAgICAgIH1cbiAgICB0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5zZXQodGltZXN0YW1wTXMsIHsgcmVzb2x2ZSwgcmVqZWN0IH0pO1xuICAgICAgfVxuXG4gIC8qKlxuICAgKiDQktC40LrQu9C40LrQsNGUINGC0LAg0LLQuNC00LDQu9GP0ZQg0YDQtdC30L7Qu9Cy0LXRgCDQtNC70Y8g0L/QvtC00ZbRlyBtZXNzYWdlLWFkZGVkLlxuICAgKiDQptC10Lkg0LzQtdGC0L7QtCDQstC40LrQu9C40LrQsNGC0LjQvNC10YLRjNGB0Y8g0LcgT2xsYW1hVmlldy5oYW5kbGVNZXNzYWdlQWRkZWQuXG4gICAqL1xuICBwdWJsaWMgaW52b2tlSE1BUmVzb2x2ZXIodGltZXN0YW1wTXM6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHJlc29sdmVyUGFpciA9IHRoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmdldCh0aW1lc3RhbXBNcyk7XG4gICAgaWYgKHJlc29sdmVyUGFpcikge1xuICAgICAgICAgICAgcmVzb2x2ZXJQYWlyLnJlc29sdmUoKTtcbiAgICAgIHRoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmRlbGV0ZSh0aW1lc3RhbXBNcyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB9XG4gIH1cbiAgXG4gIHB1YmxpYyByZWplY3RBbmRDbGVhckhNQVJlc29sdmVyKHRpbWVzdGFtcE1zOiBudW1iZXIsIHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgcmVzb2x2ZXJQYWlyID0gdGhpcy5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuZ2V0KHRpbWVzdGFtcE1zKTtcbiAgICBpZiAocmVzb2x2ZXJQYWlyKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZXJQYWlyLnJlamVjdChuZXcgRXJyb3IocmVhc29uKSk7XG4gICAgICAgIHRoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmRlbGV0ZSh0aW1lc3RhbXBNcyk7XG4gICAgfVxuICB9XG5cblxuICAvKipcbiAgICog0JTQvtC00LDRlCDQv9C+0LLRltC00L7QvNC70LXQvdC90Y8g0LrQvtGA0LjRgdGC0YPQstCw0YfQsCDQtNC+INCw0LrRgtC40LLQvdC+0LPQviDRh9Cw0YLRgywg0LfQsdC10YDRltCz0LDRlCDQudC+0LPQvixcbiAgICog0LPQtdC90LXRgNGD0ZQg0L/QvtC00ZbRjiBcIm1lc3NhZ2UtYWRkZWRcIiAo0LTQu9GPIE9sbGFtYVZpZXcuaGFuZGxlTWVzc2FnZUFkZGVkKVxuICAgKiDRgtCwINC/0L7QstC10YDRgtCw0ZQg0L/RgNC+0LzRltGBLCDRj9C60LjQuSDQstC40YDRltGI0YPRlNGC0YzRgdGPLCDQutC+0LvQuCBoYW5kbGVNZXNzYWdlQWRkZWQg0LfQsNCy0LXRgNGI0LjRgtGMINGA0LXQvdC00LXRgNC40L3Qsy5cbiAgICogQHBhcmFtIGNvbnRlbnQg0JLQvNGW0YHRgiDQv9C+0LLRltC00L7QvNC70LXQvdC90Y8g0LrQvtGA0LjRgdGC0YPQstCw0YfQsC5cbiAgICogQHBhcmFtIHRpbWVzdGFtcCDQnNGW0YLQutCwINGH0LDRgdGDINC/0L7QstGW0LTQvtC80LvQtdC90L3Rjy5cbiAgICogQHBhcmFtIHJlcXVlc3RUaW1lc3RhbXBJZCDQo9C90ZbQutCw0LvRjNC90LjQuSBJRCDQt9Cw0L/QuNGC0YMg0LTQu9GPINC70L7Qs9GD0LLQsNC90L3Rjy5cbiAgICogQHJldHVybnMg0J/RgNC+0LzRltGBLCDRidC+INCy0LjRgNGW0YjRg9GU0YLRjNGB0Y8g0L/RltGB0LvRjyDRgNC10L3QtNC10YDQuNC90LPRgywg0LDQsdC+IG51bGwsINGP0LrRidC+INGB0YLQsNC70LDRgdGPINC/0L7QvNC40LvQutCwLlxuICAgKi9cbiAgcHVibGljIGFzeW5jIGFkZFVzZXJNZXNzYWdlQW5kQXdhaXRSZW5kZXIoXG4gICAgY29udGVudDogc3RyaW5nLFxuICAgIHRpbWVzdGFtcDogRGF0ZSxcbiAgICByZXF1ZXN0VGltZXN0YW1wSWQ6IG51bWJlciBcbiAgKTogUHJvbWlzZTxNZXNzYWdlIHwgbnVsbD4ge1xuICAgIGNvbnN0IGFjdGl2ZUNoYXQgPSBhd2FpdCB0aGlzLmdldEFjdGl2ZUNoYXQoKTsgXG4gICAgaWYgKCFhY3RpdmVDaGF0KSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBtZXNzYWdlVGltZXN0YW1wTXMgPSB0aW1lc3RhbXAuZ2V0VGltZSgpO1xuICAgIGNvbnN0IHVzZXJNZXNzYWdlOiBNZXNzYWdlID0ge1xuICAgICAgcm9sZTogXCJ1c2VyXCIgYXMgTWVzc2FnZVJvbGVUeXBlRnJvbVR5cGVzLCBcbiAgICAgIGNvbnRlbnQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgfTtcblxuICAgICAgICBcbiAgICBjb25zdCBobWFQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgXG4gICAgICB0aGlzLnJlZ2lzdGVySE1BUmVzb2x2ZXIobWVzc2FnZVRpbWVzdGFtcE1zLCByZXNvbHZlLCByZWplY3QpO1xuICAgICAgXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgaWYgKHRoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmhhcyhtZXNzYWdlVGltZXN0YW1wTXMpKSB7IFxuICAgICAgICAgICAgY29uc3QgcmVhc29uID0gYEhNQSBUaW1lb3V0IGZvciBVc2VyTWVzc2FnZSAodHM6ICR7bWVzc2FnZVRpbWVzdGFtcE1zfSkgaW4gQ2hhdE1hbmFnZXIuYDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVqZWN0QW5kQ2xlYXJITUFSZXNvbHZlcihtZXNzYWdlVGltZXN0YW1wTXMsIHJlYXNvbik7XG4gICAgICAgIH1cbiAgICAgIH0sIDEwMDAwKTsgXG4gICAgfSk7XG5cbiAgICBcbiAgICBcbiAgICBjb25zdCBhZGRlZE1lc3NhZ2UgPSBhd2FpdCB0aGlzLmFkZE1lc3NhZ2VUb0FjdGl2ZUNoYXRQYXlsb2FkKHVzZXJNZXNzYWdlLCB0cnVlKTtcbiAgICBpZiAoIWFkZGVkTWVzc2FnZSkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVqZWN0QW5kQ2xlYXJITUFSZXNvbHZlcihtZXNzYWdlVGltZXN0YW1wTXMsIFwiRmFpbGVkIHRvIGFkZCBtZXNzYWdlIHBheWxvYWQgdG8gQ2hhdE1hbmFnZXIuXCIpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgXG4gICAgICAgIFxuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGhtYVByb21pc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHVzZXJNZXNzYWdlO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgIHJldHVybiBudWxsOyBcbiAgICB9XG4gIH1cbiAgXG59IFxuLy9FbmQgb2YgQ2hhdE1hbmFnZXIudHMiXX0=