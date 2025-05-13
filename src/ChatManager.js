import { __awaiter } from "tslib";
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
                    this.plugin.emit("chat-list-updated");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2hhdE1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJDaGF0TWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0EsT0FBTyxFQUFPLE1BQU0sRUFBZSxhQUFhLEVBQW9DLE1BQU0sVUFBVSxDQUFDO0FBQ3JHLE9BQXFCLEVBQUUsa0JBQWtCLEVBQUUsY0FBYyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQzFFLE9BQU8sRUFBRSxJQUFJLEVBQW1ELE1BQU0sUUFBUSxDQUFDO0FBRS9FLE9BQU8sRUFBRSxFQUFFLElBQUksTUFBTSxFQUFFLE1BQU0sTUFBTSxDQUFDO0FBZ0RwQyxNQUFNLE9BQU8sV0FBVztJQWF0QixZQUFZLE1BQW9CO1FBVHpCLG9CQUFlLEdBQVcsR0FBRyxDQUFDO1FBQzdCLGNBQVMsR0FBcUIsRUFBRSxDQUFDO1FBQ2pDLGlCQUFZLEdBQWtCLElBQUksQ0FBQztRQUNuQyxlQUFVLEdBQWdCLElBQUksQ0FBQztRQUMvQixnQkFBVyxHQUF5QixFQUFFLENBQUM7UUFDeEMscUJBQWdCLEdBQXFCLElBQUksQ0FBQztRQUUxQywwQkFBcUIsR0FBdUUsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUczRyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUM7UUFDdEIsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUM7UUFDeEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO0lBQzlCLENBQUM7SUFFSyxVQUFVOztZQUNkLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQzdCLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDaEMsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRS9CLE1BQU0sYUFBYSxHQUFH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VEZvbGRlciwgZGVib3VuY2UsIFRBYnN0cmFjdEZpbGUgfSBmcm9tIFwib2JzaWRpYW5cIjsgXG5pbXBvcnQgT2xsYW1hUGx1Z2luLCB7IEFDVElWRV9DSEFUX0lEX0tFWSwgQ0hBVF9JTkRFWF9LRVkgfSBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQgeyBDaGF0LCBDaGF0TWV0YWRhdGEsIENoYXREYXRhLCBDaGF0Q29uc3RydWN0b3JTZXR0aW5ncyB9IGZyb20gXCIuL0NoYXRcIjtcbmltcG9ydCB7IE1lc3NhZ2VSb2xlIH0gZnJvbSBcIi4vT2xsYW1hVmlld1wiOyBcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gXCJ1dWlkXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwiLi9Mb2dnZXJcIjtcbmltcG9ydCB7IFRvb2xDYWxsLCBNZXNzYWdlLCBNZXNzYWdlUm9sZSBhcyBNZXNzYWdlUm9sZVR5cGVGcm9tVHlwZXMgfSBmcm9tIFwiLi90eXBlc1wiOyBcblxuZXhwb3J0IHR5cGUgSE1BQ29tcGxldGlvbkNhbGxiYWNrID0gKG1lc3NhZ2VUaW1lc3RhbXBNczogbnVtYmVyKSA9PiB2b2lkO1xuZXhwb3J0IHR5cGUgSE1BUmVzb2x2ZXJSZWdpc3RyYXRpb24gPSAodGltZXN0YW1wTXM6IG51bWJlciwgcmVzb2x2ZTogKCkgPT4gdm9pZCwgcmVqZWN0OiAocmVhc29uPzogYW55KSA9PiB2b2lkKSA9PiB2b2lkO1xuXG5cbmV4cG9ydCBpbnRlcmZhY2UgRm9sZGVyTm9kZSB7XG4gIHR5cGU6IFwiZm9sZGVyXCI7XG4gIG5hbWU6IHN0cmluZztcbiAgcGF0aDogc3RyaW5nO1xuICBjaGlsZHJlbjogQXJyYXk8Rm9sZGVyTm9kZSB8IENoYXROb2RlPjtcbiAgaXNFeHBhbmRlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2hhdE5vZGUge1xuICB0eXBlOiBcImNoYXRcIjtcbiAgbWV0YWRhdGE6IENoYXRNZXRhZGF0YTtcbiAgZmlsZVBhdGg6IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgSGllcmFyY2h5Tm9kZSA9IEZvbGRlck5vZGUgfCBDaGF0Tm9kZTtcblxuXG5pbnRlcmZhY2UgQ2hhdFNlc3Npb25TdG9yZWQge1xuICBuYW1lOiBzdHJpbmc7XG4gIGxhc3RNb2RpZmllZDogc3RyaW5nO1xuICBjcmVhdGVkQXQ6IHN0cmluZztcbiAgbW9kZWxOYW1lPzogc3RyaW5nO1xuICBzZWxlY3RlZFJvbGVQYXRoPzogc3RyaW5nO1xuICB0ZW1wZXJhdHVyZT86IG51bWJlcjtcbiAgY29udGV4dFdpbmRvdz86IG51bWJlcjtcbn1cbmludGVyZmFjZSBDaGF0U2Vzc2lvbkluZGV4IHtcbiAgW2lkOiBzdHJpbmddOiBDaGF0U2Vzc2lvblN0b3JlZDtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgUm9sZUluZm8ge1xuICBuYW1lOiBzdHJpbmc7XG4gIHBhdGg6IHN0cmluZztcbiAgaXNDdXN0b206IGJvb2xlYW47XG59XG5pbnRlcmZhY2UgVGFza1N0YXRlIHtcbiAgdXJnZW50OiBzdHJpbmdbXTtcbiAgcmVndWxhcjogc3RyaW5nW107XG4gIGhhc0NvbnRlbnQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0TWFuYWdlciB7XG4gIHByaXZhdGUgcGx1Z2luOiBPbGxhbWFQbHVnaW47XG4gIHByaXZhdGUgYXBwOiBBcHA7XG4gIHByaXZhdGUgYWRhcHRlcjogRGF0YUFkYXB0ZXI7XG4gIHB1YmxpYyBjaGF0c0ZvbGRlclBhdGg6IHN0cmluZyA9IFwiL1wiOyBcbiAgcHJpdmF0ZSBjaGF0SW5kZXg6IENoYXRTZXNzaW9uSW5kZXggPSB7fTtcbiAgcHJpdmF0ZSBhY3RpdmVDaGF0SWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGFjdGl2ZUNoYXQ6IENoYXQgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBsb2FkZWRDaGF0czogUmVjb3JkPHN0cmluZywgQ2hhdD4gPSB7fTtcbiAgcHVibGljIGN1cnJlbnRUYXNrU3RhdGU6IFRhc2tTdGF0ZSB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGxvZ2dlcjogTG9nZ2VyO1xuICBwdWJsaWMgbWVzc2FnZUFkZGVkUmVzb2x2ZXJzOiBNYXA8bnVtYmVyLCB7cmVzb2x2ZTogKCkgPT4gdm9pZCwgcmVqZWN0OiAocmVhc29uPzogYW55KSA9PiB2b2lkfT4gPSBuZXcgTWFwKCk7XG5cbiAgY29uc3RydWN0b3IocGx1Z2luOiBPbGxhbWFQbHVnaW4pIHtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgICB0aGlzLmFwcCA9IHBsdWdpbi5hcHA7XG4gICAgdGhpcy5hZGFwdGVyID0gcGx1Z2luLmFwcC52YXVsdC5hZGFwdGVyO1xuICAgIHRoaXMubG9nZ2VyID0gcGx1Z2luLmxvZ2dlcjtcbiAgfVxuXG4gIGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy51cGRhdGVDaGF0c0ZvbGRlclBhdGgoKTtcbiAgICBhd2FpdCB0aGlzLmVuc3VyZUZvbGRlcnNFeGlzdCgpO1xuICAgIGF3YWl0IHRoaXMubG9hZENoYXRJbmRleCh0cnVlKTtcblxuICAgIGNvbnN0IHNhdmVkQWN0aXZlSWQgPSBhd2FpdCB0aGlzLnBsdWdpbi5sb2FkRGF0YUtleShBQ1RJVkVfQ0hBVF9JRF9LRVkpO1xuICAgIGlmIChzYXZlZEFjdGl2ZUlkICYmIHRoaXMuY2hhdEluZGV4W3NhdmVkQWN0aXZlSWRdKSB7XG4gICAgICBhd2FpdCB0aGlzLnNldEFjdGl2ZUNoYXQoc2F2ZWRBY3RpdmVJZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgICAgXG4gICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YUtleShBQ1RJVkVfQ0hBVF9JRF9LRVksIG51bGwpO1xuICAgICAgY29uc3QgaGllcmFyY2h5ID0gYXdhaXQgdGhpcy5nZXRDaGF0SGllcmFyY2h5KCk7XG4gICAgICBjb25zdCBmaXJzdENoYXQgPSB0aGlzLmZpbmRGaXJzdENoYXRJbkhpZXJhcmNoeShoaWVyYXJjaHkpO1xuICAgICAgaWYgKGZpcnN0Q2hhdCkge1xuICAgICAgICBhd2FpdCB0aGlzLnNldEFjdGl2ZUNoYXQoZmlyc3RDaGF0Lm1ldGFkYXRhLmlkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHRoaXMuc2V0QWN0aXZlQ2hhdChudWxsKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGZpbmRGaXJzdENoYXRJbkhpZXJhcmNoeShub2RlczogSGllcmFyY2h5Tm9kZVtdKTogQ2hhdE5vZGUgfCBudWxsIHtcbiAgICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcbiAgICAgIGlmIChub2RlLnR5cGUgPT09IFwiY2hhdFwiKSB7XG4gICAgICAgIGlmICghaXNOYU4obmV3IERhdGUobm9kZS5tZXRhZGF0YS5sYXN0TW9kaWZpZWQpLmdldFRpbWUoKSkpIHtcbiAgICAgICAgICByZXR1cm4gbm9kZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChub2RlLnR5cGUgPT09IFwiZm9sZGVyXCIpIHtcbiAgICAgICAgY29uc3QgY2hhdEluRm9sZGVyID0gdGhpcy5maW5kRmlyc3RDaGF0SW5IaWVyYXJjaHkobm9kZS5jaGlsZHJlbik7XG4gICAgICAgIGlmIChjaGF0SW5Gb2xkZXIpIHtcbiAgICAgICAgICByZXR1cm4gY2hhdEluRm9sZGVyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgdXBkYXRlQ2hhdHNGb2xkZXJQYXRoKCk6IHZvaWQge1xuICAgIGNvbnN0IHNldHRpbmdzUGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmNoYXRIaXN0b3J5Rm9sZGVyUGF0aD8udHJpbSgpO1xuICAgIHRoaXMuY2hhdHNGb2xkZXJQYXRoID0gc2V0dGluZ3NQYXRoID8gbm9ybWFsaXplUGF0aChzZXR0aW5nc1BhdGgpIDogXCIvXCI7XG4gICAgaWYgKHRoaXMuY2hhdHNGb2xkZXJQYXRoICE9PSBcIi9cIiAmJiB0aGlzLmNoYXRzRm9sZGVyUGF0aC5lbmRzV2l0aChcIi9cIikpIHtcbiAgICAgIHRoaXMuY2hhdHNGb2xkZXJQYXRoID0gdGhpcy5jaGF0c0ZvbGRlclBhdGguc2xpY2UoMCwgLTEpO1xuICAgIH1cbiAgICBcbiAgICBpZiAoIXRoaXMuY2hhdHNGb2xkZXJQYXRoKSB7XG4gICAgICB0aGlzLmNoYXRzRm9sZGVyUGF0aCA9IFwiL1wiO1xuICAgIH1cbiAgfVxuXG4gIHVwZGF0ZVRhc2tTdGF0ZSh0YXNrczogVGFza1N0YXRlIHwgbnVsbCkge1xuICAgIHRoaXMuY3VycmVudFRhc2tTdGF0ZSA9IHRhc2tzO1xuICB9XG5cbiAgZ2V0Q3VycmVudFRhc2tTdGF0ZSgpOiBUYXNrU3RhdGUgfCBudWxsIHtcbiAgICByZXR1cm4gdGhpcy5jdXJyZW50VGFza1N0YXRlO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGVuc3VyZUZvbGRlcnNFeGlzdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBoaXN0b3J5UGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmNoYXRIaXN0b3J5Rm9sZGVyUGF0aD8udHJpbSgpO1xuICAgIGNvbnN0IGV4cG9ydFBhdGggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jaGF0RXhwb3J0Rm9sZGVyUGF0aD8udHJpbSgpO1xuXG4gICAgY29uc3QgY2hlY2tBbmRDcmVhdGUgPSBhc3luYyAoZm9sZGVyUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbCwgZm9sZGVyRGVzYzogc3RyaW5nKSA9PiB7XG4gICAgICBpZiAoIWZvbGRlclBhdGggfHwgZm9sZGVyUGF0aCA9PT0gXCIvXCIpIHJldHVybjtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKGZvbGRlclBhdGgpO1xuICAgICAgXG4gICAgICBpZiAobm9ybWFsaXplZC5zdGFydHNXaXRoKFwiLi5cIikgfHwgbm9ybWFsaXplZC5pbmNsdWRlcyhcIlxcMFwiKSkge1xuICAgICAgICBuZXcgTm90aWNlKGBFcnJvcjogSW52YWxpZCBwYXRoIGZvciAke2ZvbGRlckRlc2N9LmApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuZXhpc3RzKG5vcm1hbGl6ZWQpO1xuICAgICAgICBpZiAoIWV4aXN0cykge1xuICAgICAgICAgIGF3YWl0IHRoaXMuYWRhcHRlci5ta2Rpcihub3JtYWxpemVkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5hZGFwdGVyLnN0YXQobm9ybWFsaXplZCk7XG4gICAgICAgICAgaWYgKHN0YXQ/LnR5cGUgIT09IFwiZm9sZGVyXCIpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yOiBQYXRoIGZvciAke2ZvbGRlckRlc2N9IGlzIG5vdCBhIGZvbGRlci5gKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgYWNjZXNzaW5nIGZvbGRlciBmb3IgJHtmb2xkZXJEZXNjfS4gQ2hlY2sgcGVybWlzc2lvbnMuYCk7XG4gICAgICB9XG4gICAgfTtcbiAgICBhd2FpdCBjaGVja0FuZENyZWF0ZShoaXN0b3J5UGF0aCwgXCJDaGF0IEhpc3RvcnlcIik7XG4gICAgYXdhaXQgY2hlY2tBbmRDcmVhdGUoZXhwb3J0UGF0aCwgXCJDaGF0IEV4cG9ydFwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbG9hZENoYXRJbmRleChmb3JjZVNjYW46IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHN0b3JlZEluZGV4ID0gYXdhaXQgdGhpcy5wbHVnaW4ubG9hZERhdGFLZXkoQ0hBVF9JTkRFWF9LRVkpO1xuXG4gICAgY29uc3Qgc2V0dGluZ3NQYXRoID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MuY2hhdEhpc3RvcnlGb2xkZXJQYXRoPy50cmltKCk7XG4gICAgY29uc3QgY3VycmVudFBhdGggPSBzZXR0aW5nc1BhdGggJiYgc2V0dGluZ3NQYXRoICE9PSBcIi9cIiA/IG5vcm1hbGl6ZVBhdGgoc2V0dGluZ3NQYXRoKSA6IFwiL1wiO1xuICAgIGlmIChjdXJyZW50UGF0aCAhPT0gdGhpcy5jaGF0c0ZvbGRlclBhdGgpIHtcbiAgICAgIHRoaXMudXBkYXRlQ2hhdHNGb2xkZXJQYXRoKCk7XG4gICAgICBmb3JjZVNjYW4gPSB0cnVlO1xuICAgIH1cblxuICAgIGlmICghZm9yY2VTY2FuICYmIHN0b3JlZEluZGV4ICYmIHR5cGVvZiBzdG9yZWRJbmRleCA9PT0gXCJvYmplY3RcIiAmJiBPYmplY3Qua2V5cyhzdG9yZWRJbmRleCkubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgZmlyc3RLZXkgPSBPYmplY3Qua2V5cyhzdG9yZWRJbmRleClbMF07XG4gICAgICBpZiAoXG4gICAgICAgIHN0b3JlZEluZGV4W2ZpcnN0S2V5XSAmJlxuICAgICAgICB0eXBlb2Ygc3RvcmVkSW5kZXhbZmlyc3RLZXldLm5hbWUgPT09IFwic3RyaW5nXCIgJiZcbiAgICAgICAgdHlwZW9mIHN0b3JlZEluZGV4W2ZpcnN0S2V5XS5sYXN0TW9kaWZpZWQgPT09IFwic3RyaW5nXCIgJiZcbiAgICAgICAgdHlwZW9mIHN0b3JlZEluZGV4W2ZpcnN0S2V5XS5jcmVhdGVkQXQgPT09IFwic3RyaW5nXCJcbiAgICAgICkge1xuICAgICAgICB0aGlzLmNoYXRJbmRleCA9IHN0b3JlZEluZGV4O1xuXG4gICAgICAgIHJldHVybjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvcmNlU2NhbiA9IHRydWU7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICghZm9yY2VTY2FuICYmIHN0b3JlZEluZGV4ICYmIHR5cGVvZiBzdG9yZWRJbmRleCA9PT0gXCJvYmplY3RcIiAmJiBPYmplY3Qua2V5cyhzdG9yZWRJbmRleCkubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aGlzLmNoYXRJbmRleCA9IHt9O1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZiAoIWZvcmNlU2Nhbikge1xuICAgICAgZm9yY2VTY2FuID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoZm9yY2VTY2FuKSB7XG4gICAgICBhd2FpdCB0aGlzLnJlYnVpbGRJbmRleEZyb21GaWxlcygpO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZWJ1aWxkSW5kZXhGcm9tRmlsZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgbmV3SW5kZXg6IENoYXRTZXNzaW9uSW5kZXggPSB7fTtcbiAgICBsZXQgY2hhdHNMb2FkZWQgPSAwO1xuICAgIGxldCBmaWxlc1NjYW5uZWQgPSAwO1xuXG4gICAgdHJ5IHtcbiAgICAgIGlmICh0aGlzLmNoYXRzRm9sZGVyUGF0aCAhPT0gXCIvXCIpIHtcbiAgICAgICAgY29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5hZGFwdGVyLmV4aXN0cyh0aGlzLmNoYXRzRm9sZGVyUGF0aCk7XG4gICAgICAgIGlmICghZXhpc3RzKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYWRhcHRlci5ta2Rpcih0aGlzLmNoYXRzRm9sZGVyUGF0aCk7XG4gICAgICAgICAgfSBjYXRjaCAobWtkaXJFcnJvcikge1xuICAgICAgICAgICAgdGhpcy5jaGF0SW5kZXggPSB7fTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRJbmRleCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5hZGFwdGVyLnN0YXQodGhpcy5jaGF0c0ZvbGRlclBhdGgpO1xuICAgICAgICAgIGlmIChzdGF0Py50eXBlICE9PSBcImZvbGRlclwiKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvcjogQ2hhdCBoaXN0b3J5IHBhdGggJyR7dGhpcy5jaGF0c0ZvbGRlclBhdGh9JyBpcyBub3QgYSBmb2xkZXIuYCk7XG4gICAgICAgICAgICB0aGlzLmNoYXRJbmRleCA9IHt9O1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEluZGV4KCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHNjYW5BbmRJbmRleCA9IGFzeW5jIChmb2xkZXJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgICAgICAgbGV0IGxpc3RSZXN1bHQ7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGlzdFJlc3VsdCA9IGF3YWl0IHRoaXMuYWRhcHRlci5saXN0KGZvbGRlclBhdGgpO1xuICAgICAgICB9IGNhdGNoIChsaXN0RXJyb3I6IGFueSkge1xuICAgICAgICAgIGlmIChsaXN0RXJyb3IubWVzc2FnZSAmJiBsaXN0RXJyb3IubWVzc2FnZS5pbmNsdWRlcyhcIk5vdCBhIGRpcmVjdG9yeVwiKSkge1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3QgZnVsbFBhdGggb2YgbGlzdFJlc3VsdC5maWxlcykge1xuICAgICAgICAgIGNvbnN0IGZpbGVOYW1lID0gZnVsbFBhdGguc3Vic3RyaW5nKGZ1bGxQYXRoLmxhc3RJbmRleE9mKFwiL1wiKSArIDEpO1xuICAgICAgICAgIGlmICghZmlsZU5hbWUuZW5kc1dpdGgoXCIuanNvblwiKSB8fCBmaWxlTmFtZS5zdGFydHNXaXRoKFwiLlwiKSkgY29udGludWU7XG5cbiAgICAgICAgICBjb25zdCB1dWlkUGF0dGVybiA9IC9eWzAtOWEtZkEtRl17OH0tWzAtOWEtZkEtRl17NH0tWzAtOWEtZkEtRl17NH0tWzAtOWEtZkEtRl17NH0tWzAtOWEtZkEtRl17MTJ9XFwuanNvbiQvaTtcbiAgICAgICAgICBjb25zdCBvbGRQYXR0ZXJuID0gL15jaGF0X1xcZCtfW2EtekEtWjAtOV0rXFwuanNvbiQvO1xuXG4gICAgICAgICAgaWYgKCF1dWlkUGF0dGVybi50ZXN0KGZpbGVOYW1lKSAmJiAhb2xkUGF0dGVybi50ZXN0KGZpbGVOYW1lKSkgY29udGludWU7XG4gICAgICAgICAgZmlsZXNTY2FubmVkKys7XG5cbiAgICAgICAgICBjb25zdCBjaGF0SWQgPSBmaWxlTmFtZS5zbGljZSgwLCAtNSk7XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QganNvbkNvbnRlbnQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIucmVhZChmdWxsUGF0aCk7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZShqc29uQ29udGVudCkgYXMgUGFydGlhbDxDaGF0RGF0YT47XG5cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgZGF0YT8ubWV0YWRhdGE/LmlkID09PSBjaGF0SWQgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIGRhdGEubWV0YWRhdGEubmFtZSA9PT0gXCJzdHJpbmdcIiAmJlxuICAgICAgICAgICAgICBkYXRhLm1ldGFkYXRhLm5hbWUudHJpbSgpICE9PSBcIlwiICYmXG4gICAgICAgICAgICAgIHR5cGVvZiBkYXRhLm1ldGFkYXRhLmxhc3RNb2RpZmllZCA9PT0gXCJzdHJpbmdcIiAmJlxuICAgICAgICAgICAgICAhaXNOYU4obmV3IERhdGUoZGF0YS5tZXRhZGF0YS5sYXN0TW9kaWZpZWQpLmdldFRpbWUoKSkgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIGRhdGEubWV0YWRhdGEuY3JlYXRlZEF0ID09PSBcInN0cmluZ1wiICYmXG4gICAgICAgICAgICAgICFpc05hTihuZXcgRGF0ZShkYXRhLm1ldGFkYXRhLmNyZWF0ZWRBdCkuZ2V0VGltZSgpKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGNvbnN0IG1ldGEgPSBkYXRhLm1ldGFkYXRhO1xuICAgICAgICAgICAgICBuZXdJbmRleFtjaGF0SWRdID0ge1xuICAgICAgICAgICAgICAgIG5hbWU6IG1ldGEubmFtZSxcbiAgICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQ6IG5ldyBEYXRlKG1ldGEubGFzdE1vZGlmaWVkKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUobWV0YS5jcmVhdGVkQXQpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgbW9kZWxOYW1lOiBtZXRhLm1vZGVsTmFtZSxcbiAgICAgICAgICAgICAgICBzZWxlY3RlZFJvbGVQYXRoOiBtZXRhLnNlbGVjdGVkUm9sZVBhdGgsXG4gICAgICAgICAgICAgICAgdGVtcGVyYXR1cmU6IG1ldGEudGVtcGVyYXR1cmUsXG4gICAgICAgICAgICAgICAgY29udGV4dFdpbmRvdzogbWV0YS5jb250ZXh0V2luZG93LFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICBjaGF0c0xvYWRlZCsrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgICAgICAgIGlmIChlIGluc3RhbmNlb2YgU3ludGF4RXJyb3IpIHtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCBzdWJGb2xkZXJQYXRoIG9mIGxpc3RSZXN1bHQuZm9sZGVycykge1xuICAgICAgICAgIGF3YWl0IHNjYW5BbmRJbmRleChzdWJGb2xkZXJQYXRoKTtcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgYXdhaXQgc2NhbkFuZEluZGV4KHRoaXMuY2hhdHNGb2xkZXJQYXRoKTtcblxuICAgICAgdGhpcy5jaGF0SW5kZXggPSBuZXdJbmRleDtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRJbmRleCgpO1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSBcIkVOT0VOVFwiKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoYEVycm9yOiBDaGF0IGhpc3RvcnkgZm9sZGVyICcke3RoaXMuY2hhdHNGb2xkZXJQYXRofScgbm90IGZvdW5kLmApO1xuICAgICAgfSBlbHNlIGlmIChlcnJvci5jb2RlID09PSBcIkVQRVJNXCIgfHwgZXJyb3IuY29kZSA9PT0gXCJFQUNDRVNcIikge1xuICAgICAgICBuZXcgTm90aWNlKFwiUGVybWlzc2lvbiBlcnJvciBhY2Nlc3NpbmcgY2hhdCBoaXN0b3J5IGZvbGRlci5cIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3IgcmVidWlsZGluZyBjaGF0IGluZGV4LiBDaGVjayBjb25zb2xlLlwiKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuY2hhdEluZGV4ID0ge307XG4gICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0SW5kZXgoKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNhdmVDaGF0SW5kZXgoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVEYXRhS2V5KENIQVRfSU5ERVhfS0VZLCB0aGlzLmNoYXRJbmRleCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBzYXZpbmcgY2hhdCBpbmRleC4gQ2hhbmdlcyBtaWdodCBiZSBsb3N0LlwiKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGdldENoYXRGaWxlUGF0aChpZDogc3RyaW5nLCBmb2xkZXJQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IGZpbGVOYW1lID0gYCR7aWR9Lmpzb25gO1xuICAgIGNvbnN0IHRhcmdldEZvbGRlciA9IG5vcm1hbGl6ZVBhdGgoZm9sZGVyUGF0aCk7XG4gICAgaWYgKHRhcmdldEZvbGRlciA9PT0gXCIvXCIgfHwgdGFyZ2V0Rm9sZGVyID09PSBcIlwiKSB7XG4gICAgICByZXR1cm4gbm9ybWFsaXplUGF0aChmaWxlTmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBub3JtYWxpemVQYXRoKGAke3RhcmdldEZvbGRlcn0vJHtmaWxlTmFtZX1gKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIF9zY2FuRm9sZGVyUmVjdXJzaXZlKGZvbGRlclBhdGg6IHN0cmluZyk6IFByb21pc2U8SGllcmFyY2h5Tm9kZVtdPiB7XG4gICAgY29uc3QgY2hpbGRyZW46IEhpZXJhcmNoeU5vZGVbXSA9IFtdO1xuICAgIGxldCBsaXN0UmVzdWx0O1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHMoZm9sZGVyUGF0aCk7XG4gICAgICBpZiAoIWV4aXN0cykge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICBjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5hZGFwdGVyLnN0YXQoZm9sZGVyUGF0aCk7XG4gICAgICBpZiAoc3RhdD8udHlwZSAhPT0gXCJmb2xkZXJcIikge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG5cbiAgICAgIGxpc3RSZXN1bHQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIubGlzdChmb2xkZXJQYXRoKTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBpZiAoZXJyb3IuY29kZSA9PT0gXCJFUEVSTVwiIHx8IGVycm9yLmNvZGUgPT09IFwiRUFDQ0VTXCIpIHtcbiAgICAgICAgbmV3IE5vdGljZShgUGVybWlzc2lvbiBlcnJvciByZWFkaW5nIGZvbGRlcjogJHtmb2xkZXJQYXRofWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgIH1cbiAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHN1YkZvbGRlclBhdGggb2YgbGlzdFJlc3VsdC5mb2xkZXJzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzdWJTdGF0ID0gYXdhaXQgdGhpcy5hZGFwdGVyLnN0YXQoc3ViRm9sZGVyUGF0aCk7XG4gICAgICAgIGlmIChzdWJTdGF0Py50eXBlID09PSBcImZvbGRlclwiKSB7XG4gICAgICAgICAgY29uc3QgZm9sZGVyTmFtZSA9IHN1YkZvbGRlclBhdGguc3Vic3RyaW5nKHN1YkZvbGRlclBhdGgubGFzdEluZGV4T2YoXCIvXCIpICsgMSk7XG4gICAgICAgICAgY29uc3Qgc3ViQ2hpbGRyZW4gPSBhd2FpdCB0aGlzLl9zY2FuRm9sZGVyUmVjdXJzaXZlKHN1YkZvbGRlclBhdGgpO1xuICAgICAgICAgIGNoaWxkcmVuLnB1c2goe1xuICAgICAgICAgICAgdHlwZTogXCJmb2xkZXJcIixcbiAgICAgICAgICAgIG5hbWU6IGZvbGRlck5hbWUsXG4gICAgICAgICAgICBwYXRoOiBzdWJGb2xkZXJQYXRoLFxuICAgICAgICAgICAgY2hpbGRyZW46IHN1YkNoaWxkcmVuLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChzdGF0RXJyb3IpIHt9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmdWxsUGF0aCBvZiBsaXN0UmVzdWx0LmZpbGVzKSB7XG4gICAgICBjb25zdCBmaWxlTmFtZSA9IGZ1bGxQYXRoLnN1YnN0cmluZyhmdWxsUGF0aC5sYXN0SW5kZXhPZihcIi9cIikgKyAxKTtcblxuICAgICAgaWYgKCFmaWxlTmFtZS5lbmRzV2l0aChcIi5qc29uXCIpIHx8IGZpbGVOYW1lLnN0YXJ0c1dpdGgoXCIuXCIpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHV1aWRQYXR0ZXJuID0gL15bMC05YS1mQS1GXXs4fS1bMC05YS1mQS1GXXs0fS1bMC05YS1mQS1GXXs0fS1bMC05YS1mQS1GXXs0fS1bMC05YS1mQS1GXXsxMn1cXC5qc29uJC9pO1xuICAgICAgY29uc3Qgb2xkUGF0dGVybiA9IC9eY2hhdF9cXGQrX1thLXpBLVowLTldK1xcLmpzb24kLztcbiAgICAgIGlmICghdXVpZFBhdHRlcm4udGVzdChmaWxlTmFtZSkgJiYgIW9sZFBhdHRlcm4udGVzdChmaWxlTmFtZSkpIGNvbnRpbnVlO1xuXG4gICAgICBjb25zdCBjaGF0SWQgPSBmaWxlTmFtZS5zbGljZSgwLCAtNSk7XG5cbiAgICAgIGNvbnN0IHN0b3JlZE1ldGEgPSB0aGlzLmNoYXRJbmRleFtjaGF0SWRdO1xuICAgICAgaWYgKHN0b3JlZE1ldGEpIHtcbiAgICAgICAgaWYgKGlzTmFOKG5ldyBEYXRlKHN0b3JlZE1ldGEubGFzdE1vZGlmaWVkKS5nZXRUaW1lKCkpIHx8IGlzTmFOKG5ldyBEYXRlKHN0b3JlZE1ldGEuY3JlYXRlZEF0KS5nZXRUaW1lKCkpKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjaGF0TWV0YWRhdGE6IENoYXRNZXRhZGF0YSA9IHtcbiAgICAgICAgICBpZDogY2hhdElkLFxuICAgICAgICAgIG5hbWU6IHN0b3JlZE1ldGEubmFtZSxcbiAgICAgICAgICBsYXN0TW9kaWZpZWQ6IHN0b3JlZE1ldGEubGFzdE1vZGlmaWVkLFxuICAgICAgICAgIGNyZWF0ZWRBdDogc3RvcmVkTWV0YS5jcmVhdGVkQXQsXG4gICAgICAgICAgbW9kZWxOYW1lOiBzdG9yZWRNZXRhLm1vZGVsTmFtZSxcbiAgICAgICAgICBzZWxlY3RlZFJvbGVQYXRoOiBzdG9yZWRNZXRhLnNlbGVjdGVkUm9sZVBhdGgsXG4gICAgICAgICAgdGVtcGVyYXR1cmU6IHN0b3JlZE1ldGEudGVtcGVyYXR1cmUsXG4gICAgICAgICAgY29udGV4dFdpbmRvdzogc3RvcmVkTWV0YS5jb250ZXh0V2luZG93LFxuICAgICAgICB9O1xuICAgICAgICBjaGlsZHJlbi5wdXNoKHtcbiAgICAgICAgICB0eXBlOiBcImNoYXRcIixcbiAgICAgICAgICBtZXRhZGF0YTogY2hhdE1ldGFkYXRhLFxuICAgICAgICAgIGZpbGVQYXRoOiBmdWxsUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgfVxuICAgIH1cblxuICAgIGNoaWxkcmVuLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgIGlmIChhLnR5cGUgPT09IFwiZm9sZGVyXCIgJiYgYi50eXBlID09PSBcImNoYXRcIikgcmV0dXJuIC0xO1xuICAgICAgaWYgKGEudHlwZSA9PT0gXCJjaGF0XCIgJiYgYi50eXBlID09PSBcImZvbGRlclwiKSByZXR1cm4gMTtcbiAgICAgIGlmIChhLnR5cGUgPT09IFwiZm9sZGVyXCIgJiYgYi50eXBlID09PSBcImZvbGRlclwiKSB7XG4gICAgICAgIHJldHVybiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpO1xuICAgICAgfVxuICAgICAgaWYgKGEudHlwZSA9PT0gXCJjaGF0XCIgJiYgYi50eXBlID09PSBcImNoYXRcIikge1xuICAgICAgICBjb25zdCBkYXRlQSA9IG5ldyBEYXRlKGEubWV0YWRhdGEubGFzdE1vZGlmaWVkKS5nZXRUaW1lKCk7XG4gICAgICAgIGNvbnN0IGRhdGVCID0gbmV3IERhdGUoYi5tZXRhZGF0YS5sYXN0TW9kaWZpZWQpLmdldFRpbWUoKTtcbiAgICAgICAgY29uc3QgdmFsaWRBID0gIWlzTmFOKGRhdGVBKTtcbiAgICAgICAgY29uc3QgdmFsaWRCID0gIWlzTmFOKGRhdGVCKTtcbiAgICAgICAgaWYgKHZhbGlkQSAmJiB2YWxpZEIpIHJldHVybiBkYXRlQiAtIGRhdGVBO1xuICAgICAgICBpZiAodmFsaWRCKSByZXR1cm4gMTtcbiAgICAgICAgaWYgKHZhbGlkQSkgcmV0dXJuIC0xO1xuICAgICAgICByZXR1cm4gYS5tZXRhZGF0YS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5tZXRhZGF0YS5uYW1lKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAwO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNoaWxkcmVuO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldENoYXRIaWVyYXJjaHkoKTogUHJvbWlzZTxIaWVyYXJjaHlOb2RlW10+IHtcbiAgICBhd2FpdCB0aGlzLmVuc3VyZUZvbGRlcnNFeGlzdCgpO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLl9zY2FuRm9sZGVyUmVjdXJzaXZlKHRoaXMuY2hhdHNGb2xkZXJQYXRoKTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVDaGF0QW5kVXBkYXRlSW5kZXgoY2hhdDogQ2hhdCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjaGF0LnNhdmUoKTtcblxuICAgICAgY29uc3QgbWV0YSA9IGNoYXQubWV0YWRhdGE7XG4gICAgICBjb25zdCBzdG9yZWRNZXRhOiBDaGF0U2Vzc2lvblN0b3JlZCA9IHtcbiAgICAgICAgbmFtZTogbWV0YS5uYW1lLFxuICAgICAgICBsYXN0TW9kaWZpZWQ6IG1ldGEubGFzdE1vZGlmaWVkLFxuICAgICAgICBjcmVhdGVkQXQ6IG1ldGEuY3JlYXRlZEF0LFxuICAgICAgICBtb2RlbE5hbWU6IG1ldGEubW9kZWxOYW1lLFxuICAgICAgICBzZWxlY3RlZFJvbGVQYXRoOiBtZXRhLnNlbGVjdGVkUm9sZVBhdGgsXG4gICAgICAgIHRlbXBlcmF0dXJlOiBtZXRhLnRlbXBlcmF0dXJlLFxuICAgICAgICBjb250ZXh0V2luZG93OiBtZXRhLmNvbnRleHRXaW5kb3csXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBleGlzdGluZ0luZGV4RW50cnkgPSB0aGlzLmNoYXRJbmRleFttZXRhLmlkXTtcbiAgICAgIGNvbnN0IGluZGV4TmVlZHNVcGRhdGUgPVxuICAgICAgICAhZXhpc3RpbmdJbmRleEVudHJ5IHx8XG4gICAgICAgIGV4aXN0aW5nSW5kZXhFbnRyeS5uYW1lICE9PSBzdG9yZWRNZXRhLm5hbWUgfHxcbiAgICAgICAgZXhpc3RpbmdJbmRleEVudHJ5Lmxhc3RNb2RpZmllZCAhPT0gc3RvcmVkTWV0YS5sYXN0TW9kaWZpZWQgfHxcbiAgICAgICAgZXhpc3RpbmdJbmRleEVudHJ5LmNyZWF0ZWRBdCAhPT0gc3RvcmVkTWV0YS5jcmVhdGVkQXQgfHxcbiAgICAgICAgZXhpc3RpbmdJbmRleEVudHJ5Lm1vZGVsTmFtZSAhPT0gc3RvcmVkTWV0YS5tb2RlbE5hbWUgfHxcbiAgICAgICAgZXhpc3RpbmdJbmRleEVudHJ5LnNlbGVjdGVkUm9sZVBhdGggIT09IHN0b3JlZE1ldGEuc2VsZWN0ZWRSb2xlUGF0aCB8fFxuICAgICAgICBleGlzdGluZ0luZGV4RW50cnkudGVtcGVyYXR1cmUgIT09IHN0b3JlZE1ldGEudGVtcGVyYXR1cmUgfHxcbiAgICAgICAgZXhpc3RpbmdJbmRleEVudHJ5LmNvbnRleHRXaW5kb3cgIT09IHN0b3JlZE1ldGEuY29udGV4dFdpbmRvdztcblxuICAgICAgaWYgKGluZGV4TmVlZHNVcGRhdGUpIHtcbiAgICAgICAgdGhpcy5jaGF0SW5kZXhbbWV0YS5pZF0gPSBzdG9yZWRNZXRhO1xuICAgICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0SW5kZXgoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwiY2hhdC1saXN0LXVwZGF0ZWRcIik7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubG9nZ2VyLnRyYWNlKGBJbmRleCBmb3IgY2hhdCAke21ldGEuaWR9IHVuY2hhbmdlZCBhZnRlciBzYXZlIHRyaWdnZXIsIHNraXBwaW5nIGluZGV4IHNhdmUvZXZlbnQuYCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIFxuYXN5bmMgY3JlYXRlTmV3Q2hhdChuYW1lPzogc3RyaW5nLCBmb2xkZXJQYXRoPzogc3RyaW5nKTogUHJvbWlzZTxDaGF0IHwgbnVsbD4ge1xuICBjb25zdCB0YXJnZXRGb2xkZXIgPSBmb2xkZXJQYXRoID8gbm9ybWFsaXplUGF0aChmb2xkZXJQYXRoKSA6IHRoaXMuY2hhdHNGb2xkZXJQYXRoO1xuICBjb25zdCBmaW5hbEZvbGRlclBhdGggPSB0YXJnZXRGb2xkZXIgPT09IFwiXCIgfHwgdGFyZ2V0Rm9sZGVyID09PSBcIi5cIiA/IFwiL1wiIDogdGFyZ2V0Rm9sZGVyO1xuXG4gIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLmVuc3VyZVNwZWNpZmljRm9sZGVyRXhpc3RzKGZpbmFsRm9sZGVyUGF0aCk7XG4gIH0gY2F0Y2ggKGZvbGRlckVycm9yKSB7XG4gICAgICBcbiAgICAgIG5ldyBOb3RpY2UoYEZhaWxlZCB0byBlbnN1cmUgdGFyZ2V0IGZvbGRlciBleGlzdHM6ICR7ZmluYWxGb2xkZXJQYXRofWApO1xuICAgICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICB0cnkge1xuICAgICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICAgIGNvbnN0IG5ld0lkID0gdXVpZHY0KCk7XG4gICAgICBjb25zdCBmaWxlUGF0aCA9IHRoaXMuZ2V0Q2hhdEZpbGVQYXRoKG5ld0lkLCBmaW5hbEZvbGRlclBhdGgpO1xuXG4gICAgICBjb25zdCBpbml0aWFsTWV0YWRhdGE6IENoYXRNZXRhZGF0YSA9IHtcbiAgICAgICAgICBpZDogbmV3SWQsXG4gICAgICAgICAgbmFtZTogbmFtZSB8fCBgQ2hhdCAke25vdy50b0xvY2FsZURhdGVTdHJpbmcoKX0gJHtub3cudG9Mb2NhbGVUaW1lU3RyaW5nKFtdLCB7IGhvdXI6IFwiMi1kaWdpdFwiLCBtaW51dGU6IFwiMi1kaWdpdFwiIH0pfWAsXG4gICAgICAgICAgbW9kZWxOYW1lOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWUsXG4gICAgICAgICAgc2VsZWN0ZWRSb2xlUGF0aDogdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aCxcbiAgICAgICAgICB0ZW1wZXJhdHVyZTogdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGVyYXR1cmUsXG4gICAgICAgICAgY29udGV4dFdpbmRvdzogdGhpcy5wbHVnaW4uc2V0dGluZ3MuY29udGV4dFdpbmRvdyxcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5vdy50b0lTT1N0cmluZygpLFxuICAgICAgICAgIGxhc3RNb2RpZmllZDogbm93LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBjb25zdHJ1Y3RvclNldHRpbmdzOiBDaGF0Q29uc3RydWN0b3JTZXR0aW5ncyA9IHsgLi4udGhpcy5wbHVnaW4uc2V0dGluZ3MgfTtcbiAgICAgIGNvbnN0IGNoYXREYXRhOiBDaGF0RGF0YSA9IHsgbWV0YWRhdGE6IGluaXRpYWxNZXRhZGF0YSwgbWVzc2FnZXM6IFtdIH07XG5cbiAgICAgIGNvbnN0IG5ld0NoYXQgPSBuZXcgQ2hhdCh0aGlzLmFkYXB0ZXIsIGNvbnN0cnVjdG9yU2V0dGluZ3MsIGNoYXREYXRhLCBmaWxlUGF0aCwgdGhpcy5sb2dnZXIpO1xuXG4gICAgICBjb25zdCBzdG9yZWRNZXRhOiBDaGF0U2Vzc2lvblN0b3JlZCA9IHtcbiAgICAgICAgICBuYW1lOiBpbml0aWFsTWV0YWRhdGEubmFtZSxcbiAgICAgICAgICBsYXN0TW9kaWZpZWQ6IGluaXRpYWxNZXRhZGF0YS5sYXN0TW9kaWZpZWQsXG4gICAgICAgICAgY3JlYXRlZEF0OiBpbml0aWFsTWV0YWRhdGEuY3JlYXRlZEF0LFxuICAgICAgICAgIG1vZGVsTmFtZTogaW5pdGlhbE1ldGFkYXRhLm1vZGVsTmFtZSxcbiAgICAgICAgICBzZWxlY3RlZFJvbGVQYXRoOiBpbml0aWFsTWV0YWRhdGEuc2VsZWN0ZWRSb2xlUGF0aCxcbiAgICAgICAgICB0ZW1wZXJhdHVyZTogaW5pdGlhbE1ldGFkYXRhLnRlbXBlcmF0dXJlLFxuICAgICAgICAgIGNvbnRleHRXaW5kb3c6IGluaXRpYWxNZXRhZGF0YS5jb250ZXh0V2luZG93LFxuICAgICAgfTtcbiAgICAgIHRoaXMuY2hhdEluZGV4W25ld0lkXSA9IHN0b3JlZE1ldGE7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0SW5kZXgoKTtcbiAgICAgIFxuICAgICAgXG5cbiAgICAgIGNvbnN0IHNhdmVkSW1tZWRpYXRlbHkgPSBhd2FpdCBuZXdDaGF0LnNhdmVJbW1lZGlhdGVseSgpO1xuICAgICAgaWYgKCFzYXZlZEltbWVkaWF0ZWx5KSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuY2hhdEluZGV4W25ld0lkXTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0SW5kZXgoKTtcbiAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uZW1pdChcImNoYXQtbGlzdC11cGRhdGVkXCIpO1xuXG4gICAgICAgICAgbmV3IE5vdGljZShcIkVycm9yOiBGYWlsZWQgdG8gc2F2ZSBuZXcgY2hhdCBmaWxlLlwiKTtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgdGhpcy5sb2FkZWRDaGF0c1tuZXdJZF0gPSBuZXdDaGF0O1xuICAgICAgXG4gICAgICBcbiAgICAgIGF3YWl0IHRoaXMuc2V0QWN0aXZlQ2hhdChuZXdJZCk7XG5cbiAgICAgIHJldHVybiBuZXdDaGF0O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIkVycm9yIGNyZWF0aW5nIG5ldyBjaGF0IHNlc3Npb24uXCIpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuICBwcml2YXRlIGFzeW5jIGVuc3VyZVNwZWNpZmljRm9sZGVyRXhpc3RzKGZvbGRlclBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghZm9sZGVyUGF0aCB8fCBmb2xkZXJQYXRoID09PSBcIi9cIiB8fCBmb2xkZXJQYXRoID09PSBcIi5cIikgcmV0dXJuO1xuXG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVBhdGgoZm9sZGVyUGF0aCk7XG4gICAgaWYgKG5vcm1hbGl6ZWQuc3RhcnRzV2l0aChcIi4uXCIpIHx8IG5vcm1hbGl6ZWQuaW5jbHVkZXMoXCJcXDBcIikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgZm9sZGVyIHBhdGggc3BlY2lmaWVkLlwiKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5hZGFwdGVyLmV4aXN0cyhub3JtYWxpemVkKTtcbiAgICAgIGlmICghZXhpc3RzKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYWRhcHRlci5ta2Rpcihub3JtYWxpemVkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuc3RhdChub3JtYWxpemVkKTtcbiAgICAgICAgaWYgKHN0YXQ/LnR5cGUgIT09IFwiZm9sZGVyXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUYXJnZXQgcGF0aCAke25vcm1hbGl6ZWR9IGlzIG5vdCBhIGZvbGRlci5gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBGYWlsZWQgdG8gZW5zdXJlIHRhcmdldCBmb2xkZXIgJHtub3JtYWxpemVkfSBleGlzdHM6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgXG4gIGxpc3RBdmFpbGFibGVDaGF0cygpOiBDaGF0TWV0YWRhdGFbXSB7XG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHRoaXMuY2hhdEluZGV4KVxuICAgICAgLm1hcCgoW2lkLCBzdG9yZWRNZXRhXSk6IENoYXRNZXRhZGF0YSB8IG51bGwgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgIXN0b3JlZE1ldGEgfHxcbiAgICAgICAgICB0eXBlb2Ygc3RvcmVkTWV0YSAhPT0gXCJvYmplY3RcIiB8fFxuICAgICAgICAgIHR5cGVvZiBzdG9yZWRNZXRhLm5hbWUgIT09IFwic3RyaW5nXCIgfHxcbiAgICAgICAgICB0eXBlb2Ygc3RvcmVkTWV0YS5sYXN0TW9kaWZpZWQgIT09IFwic3RyaW5nXCIgfHxcbiAgICAgICAgICB0eXBlb2Ygc3RvcmVkTWV0YS5jcmVhdGVkQXQgIT09IFwic3RyaW5nXCJcbiAgICAgICAgKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbGFzdE1vZERhdGUgPSBuZXcgRGF0ZShzdG9yZWRNZXRhLmxhc3RNb2RpZmllZCk7XG4gICAgICAgIGNvbnN0IGNyZWF0ZWREYXRlID0gbmV3IERhdGUoc3RvcmVkTWV0YS5jcmVhdGVkQXQpO1xuICAgICAgICBpZiAoaXNOYU4obGFzdE1vZERhdGUuZ2V0VGltZSgpKSB8fCBpc05hTihjcmVhdGVkRGF0ZS5nZXRUaW1lKCkpKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBpZCxcbiAgICAgICAgICBuYW1lOiBzdG9yZWRNZXRhLm5hbWUsXG4gICAgICAgICAgbGFzdE1vZGlmaWVkOiBzdG9yZWRNZXRhLmxhc3RNb2RpZmllZCxcbiAgICAgICAgICBjcmVhdGVkQXQ6IHN0b3JlZE1ldGEuY3JlYXRlZEF0LFxuICAgICAgICAgIG1vZGVsTmFtZTogc3RvcmVkTWV0YS5tb2RlbE5hbWUsXG4gICAgICAgICAgc2VsZWN0ZWRSb2xlUGF0aDogc3RvcmVkTWV0YS5zZWxlY3RlZFJvbGVQYXRoLFxuICAgICAgICAgIHRlbXBlcmF0dXJlOiBzdG9yZWRNZXRhLnRlbXBlcmF0dXJlLFxuICAgICAgICAgIGNvbnRleHRXaW5kb3c6IHN0b3JlZE1ldGEuY29udGV4dFdpbmRvdyxcbiAgICAgICAgfTtcbiAgICAgIH0pXG4gICAgICAuZmlsdGVyKChjaGF0TWV0YSk6IGNoYXRNZXRhIGlzIENoYXRNZXRhZGF0YSA9PiBjaGF0TWV0YSAhPT0gbnVsbClcbiAgICAgIC5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgIGNvbnN0IGRhdGVBID0gbmV3IERhdGUoYS5sYXN0TW9kaWZpZWQpLmdldFRpbWUoKTtcbiAgICAgICAgY29uc3QgZGF0ZUIgPSBuZXcgRGF0ZShiLmxhc3RNb2RpZmllZCkuZ2V0VGltZSgpO1xuICAgICAgICBpZiAoIWlzTmFOKGRhdGVBKSAmJiAhaXNOYU4oZGF0ZUIpKSB7XG4gICAgICAgICAgaWYgKGRhdGVCICE9PSBkYXRlQSkgcmV0dXJuIGRhdGVCIC0gZGF0ZUE7XG4gICAgICAgIH0gZWxzZSBpZiAoIWlzTmFOKGRhdGVCKSkgcmV0dXJuIDE7XG4gICAgICAgIGVsc2UgaWYgKCFpc05hTihkYXRlQSkpIHJldHVybiAtMTtcbiAgICAgICAgY29uc3QgY3JlYXRlZEEgPSBuZXcgRGF0ZShhLmNyZWF0ZWRBdCkuZ2V0VGltZSgpO1xuICAgICAgICBjb25zdCBjcmVhdGVkQiA9IG5ldyBEYXRlKGIuY3JlYXRlZEF0KS5nZXRUaW1lKCk7XG4gICAgICAgIGlmICghaXNOYU4oY3JlYXRlZEEpICYmICFpc05hTihjcmVhdGVkQikpIHtcbiAgICAgICAgICByZXR1cm4gY3JlYXRlZEIgLSBjcmVhdGVkQTtcbiAgICAgICAgfSBlbHNlIGlmICghaXNOYU4oY3JlYXRlZEIpKSByZXR1cm4gMTtcbiAgICAgICAgZWxzZSBpZiAoIWlzTmFOKGNyZWF0ZWRBKSkgcmV0dXJuIC0xO1xuICAgICAgICByZXR1cm4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgZ2V0QWN0aXZlQ2hhdElkKCk6IHN0cmluZyB8IG51bGwge1xuICAgIHJldHVybiB0aGlzLmFjdGl2ZUNoYXRJZDtcbiAgfVxuXG4gIFxuXG4gIHB1YmxpYyBhc3luYyBnZXRBY3RpdmVDaGF0T3JGYWlsKCk6IFByb21pc2U8Q2hhdD4ge1xuICAgIGNvbnN0IGNoYXQgPSBhd2FpdCB0aGlzLmdldEFjdGl2ZUNoYXQoKTtcbiAgICBpZiAoIWNoYXQpIHtcbiAgICAgICAgICAgIFxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gYWN0aXZlIGNoYXQgZm91bmQgb3IgaXQgZmFpbGVkIHRvIGxvYWQuXCIpO1xuICAgIH1cbiAgICByZXR1cm4gY2hhdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRNZXNzYWdlVG9BY3RpdmVDaGF0UGF5bG9hZChtZXNzYWdlUGF5bG9hZDogTWVzc2FnZSwgZW1pdEV2ZW50OiBib29sZWFuID0gdHJ1ZSk6IFByb21pc2U8TWVzc2FnZSB8IG51bGw+IHtcbiAgICBjb25zdCBvcGVyYXRpb25UaW1lc3RhbXBJZCA9IG1lc3NhZ2VQYXlsb2FkLnRpbWVzdGFtcC5nZXRUaW1lKCk7IFxuICAgIFxuICAgIGNvbnN0IGFjdGl2ZUNoYXRJbnN0YW5jZSA9IGF3YWl0IHRoaXMuZ2V0QWN0aXZlQ2hhdCgpOyBcbiAgICBpZiAoIWFjdGl2ZUNoYXRJbnN0YW5jZSkge1xuICAgICAgICAgICAgXG4gICAgICBcbiAgICAgIFxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgXG4gICAgaWYgKCFtZXNzYWdlUGF5bG9hZC50aW1lc3RhbXApIHtcbiAgICAgICAgbWVzc2FnZVBheWxvYWQudGltZXN0YW1wID0gbmV3IERhdGUoKTtcbiAgICAgICAgICAgIH1cblxuICAgIGFjdGl2ZUNoYXRJbnN0YW5jZS5tZXNzYWdlcy5wdXNoKG1lc3NhZ2VQYXlsb2FkKTtcbiAgICBcbiAgICBcbiAgICBjb25zdCBhY3Rpdml0eVJlY29yZGVkID0gYWN0aXZlQ2hhdEluc3RhbmNlLnJlY29yZEFjdGl2aXR5KCk7IFxuICAgIFxuXG5cbmlmIChhY3Rpdml0eVJlY29yZGVkKSB7IFxuICAgICAgICBjb25zdCBzYXZlQW5kVXBkYXRlSW5kZXhTdWNjZXNzID0gYXdhaXQgdGhpcy5zYXZlQ2hhdEFuZFVwZGF0ZUluZGV4KGFjdGl2ZUNoYXRJbnN0YW5jZSk7IFxuICAgICAgICBpZiAoIXNhdmVBbmRVcGRhdGVJbmRleFN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChlbWl0RXZlbnQpIHtcbiAgICAgIFxuICAgICAgY29uc3QgY3VycmVudEFjdGl2ZUNoYXRJZEZvckV2ZW50ID0gdGhpcy5hY3RpdmVDaGF0SWQgfHwgYWN0aXZlQ2hhdEluc3RhbmNlLm1ldGFkYXRhLmlkO1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uZW1pdChcIm1lc3NhZ2UtYWRkZWRcIiwgeyBjaGF0SWQ6IGN1cnJlbnRBY3RpdmVDaGF0SWRGb3JFdmVudCwgbWVzc2FnZTogbWVzc2FnZVBheWxvYWQgfSk7XG4gICAgfVxuICAgIHJldHVybiBtZXNzYWdlUGF5bG9hZDtcbiAgfVxuXG5hc3luYyBnZXRDaGF0KGlkOiBzdHJpbmcsIGZpbGVQYXRoPzogc3RyaW5nKTogUHJvbWlzZTxDaGF0IHwgbnVsbD4ge1xuICBpZiAodGhpcy5sb2FkZWRDaGF0c1tpZF0pIHtcbiAgICAgIHJldHVybiB0aGlzLmxvYWRlZENoYXRzW2lkXTtcbiAgfVxuXG4gIGxldCBhY3R1YWxGaWxlUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkID0gZmlsZVBhdGg7XG4gIGlmICghYWN0dWFsRmlsZVBhdGgpIHtcbiAgICAgIFxuICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSBhd2FpdCB0aGlzLmdldENoYXRIaWVyYXJjaHkoKTtcbiAgICAgICAgICBhY3R1YWxGaWxlUGF0aCA9IHRoaXMuZmluZENoYXRQYXRoSW5IaWVyYXJjaHkoaWQsIGhpZXJhcmNoeSkgPz8gdW5kZWZpbmVkO1xuICAgICAgICAgIGlmIChhY3R1YWxGaWxlUGF0aCkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICB9IGNhdGNoIChoaWVyYXJjaHlFcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBhY3R1YWxGaWxlUGF0aCA9IHVuZGVmaW5lZDsgXG4gICAgICB9XG4gIH1cblxuICBcbiAgaWYgKCFhY3R1YWxGaWxlUGF0aCAmJiB0aGlzLmNoYXRJbmRleFtpZF0pIHtcbiAgICAgICAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICByZXR1cm4gbnVsbDsgXG4gIH1cblxuICBcbiAgaWYgKCF0aGlzLmNoYXRJbmRleFtpZF0gJiYgIWFjdHVhbEZpbGVQYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIFxuICBcbiAgXG5cbiAgaWYgKCFhY3R1YWxGaWxlUGF0aCkgeyBcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gIH1cblxuXG4gIHRyeSB7XG4gICAgICBcbiAgICAgIGNvbnN0IGNoYXQgPSBhd2FpdCBDaGF0LmxvYWRGcm9tRmlsZShhY3R1YWxGaWxlUGF0aCwgdGhpcy5hZGFwdGVyLCB0aGlzLnBsdWdpbi5zZXR0aW5ncywgdGhpcy5sb2dnZXIpO1xuXG4gICAgICBpZiAoY2hhdCkge1xuICAgICAgICAgIHRoaXMubG9hZGVkQ2hhdHNbaWRdID0gY2hhdDsgXG5cbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCBzdG9yZWRNZXRhID0gdGhpcy5jaGF0SW5kZXhbaWRdO1xuICAgICAgICAgIGNvbnN0IGN1cnJlbnRNZXRhID0gY2hhdC5tZXRhZGF0YTtcbiAgICAgICAgICBjb25zdCBpbmRleE5lZWRzVXBkYXRlID1cbiAgICAgICAgICAgICAgIXN0b3JlZE1ldGEgfHwgXG4gICAgICAgICAgICAgIHN0b3JlZE1ldGEubmFtZSAhPT0gY3VycmVudE1ldGEubmFtZSB8fFxuICAgICAgICAgICAgICBzdG9yZWRNZXRhLmxhc3RNb2RpZmllZCAhPT0gY3VycmVudE1ldGEubGFzdE1vZGlmaWVkIHx8XG4gICAgICAgICAgICAgIHN0b3JlZE1ldGEuY3JlYXRlZEF0ICE9PSBjdXJyZW50TWV0YS5jcmVhdGVkQXQgfHxcbiAgICAgICAgICAgICAgc3RvcmVkTWV0YS5tb2RlbE5hbWUgIT09IGN1cnJlbnRNZXRhLm1vZGVsTmFtZSB8fFxuICAgICAgICAgICAgICBzdG9yZWRNZXRhLnNlbGVjdGVkUm9sZVBhdGggIT09IGN1cnJlbnRNZXRhLnNlbGVjdGVkUm9sZVBhdGggfHxcbiAgICAgICAgICAgICAgc3RvcmVkTWV0YS50ZW1wZXJhdHVyZSAhPT0gY3VycmVudE1ldGEudGVtcGVyYXR1cmUgfHxcbiAgICAgICAgICAgICAgc3RvcmVkTWV0YS5jb250ZXh0V2luZG93ICE9PSBjdXJyZW50TWV0YS5jb250ZXh0V2luZG93O1xuXG4gICAgICAgICAgaWYgKGluZGV4TmVlZHNVcGRhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEFuZFVwZGF0ZUluZGV4KGNoYXQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gY2hhdDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlQ2hhdEZpbGVBbmRJbmRleEVudHJ5X05vRW1pdChpZCwgYWN0dWFsRmlsZVBhdGgsIGZhbHNlKTsgXG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHRoaXMuYWN0aXZlQ2hhdElkID09PSBpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuc2V0QWN0aXZlQ2hhdChudWxsKTsgXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gXCJFTk9FTlRcIikgeyBcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVDaGF0RmlsZUFuZEluZGV4RW50cnlfTm9FbWl0KGlkLCBhY3R1YWxGaWxlUGF0aCwgZmFsc2UpOyBcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAodGhpcy5hY3RpdmVDaGF0SWQgPT09IGlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5zZXRBY3RpdmVDaGF0KG51bGwpOyBcbiAgICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIFxuICAgICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuICBwcml2YXRlIGZpbmRDaGF0UGF0aEluSGllcmFyY2h5KGNoYXRJZDogc3RyaW5nLCBub2RlczogSGllcmFyY2h5Tm9kZVtdKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG4gICAgICBpZiAobm9kZS50eXBlID09PSBcImNoYXRcIiAmJiBub2RlLm1ldGFkYXRhLmlkID09PSBjaGF0SWQpIHtcbiAgICAgICAgcmV0dXJuIG5vZGUuZmlsZVBhdGg7XG4gICAgICB9IGVsc2UgaWYgKG5vZGUudHlwZSA9PT0gXCJmb2xkZXJcIikge1xuICAgICAgICBjb25zdCBwYXRoSW5Gb2xkZXIgPSB0aGlzLmZpbmRDaGF0UGF0aEluSGllcmFyY2h5KGNoYXRJZCwgbm9kZS5jaGlsZHJlbik7XG4gICAgICAgIGlmIChwYXRoSW5Gb2xkZXIpIHtcbiAgICAgICAgICByZXR1cm4gcGF0aEluRm9sZGVyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgXG4gIFxuICBhc3luYyBnZXRBY3RpdmVDaGF0KCk6IFByb21pc2U8Q2hhdCB8IG51bGw+IHtcbiAgICBpZiAoIXRoaXMuYWN0aXZlQ2hhdElkKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgaWYgKHRoaXMuYWN0aXZlQ2hhdCAmJiB0aGlzLmFjdGl2ZUNoYXQubWV0YWRhdGEuaWQgPT09IHRoaXMuYWN0aXZlQ2hhdElkKSB7XG4gICAgICByZXR1cm4gdGhpcy5hY3RpdmVDaGF0O1xuICAgIH1cblxuICAgIGNvbnN0IGNoYXQgPSBhd2FpdCB0aGlzLmdldENoYXQodGhpcy5hY3RpdmVDaGF0SWQpO1xuICAgIGlmIChjaGF0KSB7XG4gICAgICB0aGlzLmFjdGl2ZUNoYXQgPSBjaGF0O1xuICAgICAgcmV0dXJuIGNoYXQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IGF3YWl0IHRoaXMuZ2V0Q2hhdEhpZXJhcmNoeSgpO1xuICAgICAgY29uc3QgZmlyc3RDaGF0ID0gdGhpcy5maW5kRmlyc3RDaGF0SW5IaWVyYXJjaHkoaGllcmFyY2h5KTtcbiAgICAgIGNvbnN0IG5leHRBY3RpdmVJZCA9IGZpcnN0Q2hhdCA/IGZpcnN0Q2hhdC5tZXRhZGF0YS5pZCA6IG51bGw7XG5cbiAgICAgIGF3YWl0IHRoaXMuc2V0QWN0aXZlQ2hhdChuZXh0QWN0aXZlSWQpO1xuICAgICAgcmV0dXJuIHRoaXMuYWN0aXZlQ2hhdDtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2V0QWN0aXZlQ2hhdChpZDogc3RyaW5nIHwgbnVsbCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHByZXZpb3VzQWN0aXZlSWQgPSB0aGlzLmFjdGl2ZUNoYXRJZDtcblxuICAgIGlmIChpZCA9PT0gcHJldmlvdXNBY3RpdmVJZCkge1xuICAgICAgaWYgKGlkICYmICF0aGlzLmFjdGl2ZUNoYXQpIHtcbiAgICAgICAgdGhpcy5hY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5nZXRDaGF0KGlkKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoaWQgJiYgIXRoaXMuY2hhdEluZGV4W2lkXSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5yZWJ1aWxkSW5kZXhGcm9tRmlsZXMoKTtcbiAgICAgIGlmICghdGhpcy5jaGF0SW5kZXhbaWRdKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3I6IENoYXQgd2l0aCBJRCAke2lkfSBub3QgZm91bmQuIENhbm5vdCBhY3RpdmF0ZS5gKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuYWN0aXZlQ2hhdElkID0gaWQ7XG4gICAgdGhpcy5hY3RpdmVDaGF0ID0gbnVsbDtcbiAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YUtleShBQ1RJVkVfQ0hBVF9JRF9LRVksIGlkKTtcblxuICAgIGxldCBsb2FkZWRDaGF0OiBDaGF0IHwgbnVsbCA9IG51bGw7XG4gICAgaWYgKGlkKSB7XG4gICAgICBsb2FkZWRDaGF0ID0gYXdhaXQgdGhpcy5nZXRDaGF0KGlkKTtcbiAgICAgIGlmICghbG9hZGVkQ2hhdCkge1xuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlQ2hhdElkID0gbnVsbDtcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGFLZXkoQUNUSVZFX0NIQVRfSURfS0VZLCBudWxsKTtcbiAgICAgICAgaWQgPSBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5hY3RpdmVDaGF0ID0gbG9hZGVkQ2hhdDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgIH1cblxuICAgIHRoaXMucGx1Z2luLmVtaXQoXCJhY3RpdmUtY2hhdC1jaGFuZ2VkXCIsIHsgY2hhdElkOiBpZCwgY2hhdDogdGhpcy5hY3RpdmVDaGF0IH0pO1xuICB9XG5cbiAgYXN5bmMgYWRkTWVzc2FnZVRvQWN0aXZlQ2hhdChcbiAgICByb2xlOiBNZXNzYWdlUm9sZSxcbiAgICBjb250ZW50OiBzdHJpbmcsXG4gICAgdGltZXN0YW1wPzogRGF0ZSxcbiAgICBlbWl0RXZlbnQ6IGJvb2xlYW4gPSB0cnVlLFxuICAgIHRvb2xfY2FsbHM/OiBUb29sQ2FsbFtdLFxuICAgIHRvb2xfY2FsbF9pZD86IHN0cmluZyxcbiAgICBuYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8TWVzc2FnZSB8IG51bGw+IHtcbiAgICBjb25zdCBtZXNzYWdlVGltZXN0YW1wID0gdGltZXN0YW1wIHx8IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgbmV3TWVzc2FnZTogTWVzc2FnZSA9IHtcbiAgICAgICAgcm9sZSxcbiAgICAgICAgY29udGVudCxcbiAgICAgICAgdGltZXN0YW1wOiBtZXNzYWdlVGltZXN0YW1wLFxuICAgIH07XG5cbiAgICBcbiAgICBpZiAodG9vbF9jYWxscyAmJiB0b29sX2NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgIG5ld01lc3NhZ2UudG9vbF9jYWxscyA9IHRvb2xfY2FsbHM7XG4gICAgfVxuICAgIGlmICh0b29sX2NhbGxfaWQpIHtcbiAgICAgIG5ld01lc3NhZ2UudG9vbF9jYWxsX2lkID0gdG9vbF9jYWxsX2lkO1xuICAgIH1cbiAgICBpZiAobmFtZSkge1xuICAgICAgbmV3TWVzc2FnZS5uYW1lID0gbmFtZTtcbiAgICB9XG4gICAgXG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0UGF5bG9hZChuZXdNZXNzYWdlLCBlbWl0RXZlbnQpO1xuICB9XG5cbiAgYXN5bmMgY2xlYXJBY3RpdmVDaGF0TWVzc2FnZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgYWN0aXZlQ2hhdCA9IGF3YWl0IHRoaXMuZ2V0QWN0aXZlQ2hhdCgpO1xuICAgIGlmICghYWN0aXZlQ2hhdCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoYWN0aXZlQ2hhdC5tZXNzYWdlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBhY3RpdmVDaGF0LmNsZWFyTWVzc2FnZXMoKTtcblxuICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRBbmRVcGRhdGVJbmRleChhY3RpdmVDaGF0KTtcbiAgICB0aGlzLnBsdWdpbi5lbWl0KFwibWVzc2FnZXMtY2xlYXJlZFwiLCBhY3RpdmVDaGF0Lm1ldGFkYXRhLmlkKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUFjdGl2ZUNoYXRNZXRhZGF0YShcbiAgICBtZXRhZGF0YVVwZGF0ZTogUGFydGlhbDxPbWl0PENoYXRNZXRhZGF0YSwgXCJpZFwiIHwgXCJjcmVhdGVkQXRcIiB8IFwibGFzdE1vZGlmaWVkXCI+PlxuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5nZXRBY3RpdmVDaGF0KCk7XG4gICAgaWYgKCFhY3RpdmVDaGF0KSB7XG4gICAgICBuZXcgTm90aWNlKFwiTm8gYWN0aXZlIGNoYXQgdG8gdXBkYXRlIG1ldGFkYXRhIGZvci5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgICAgICBpZiAoT2JqZWN0LmtleXMobWV0YWRhdGFVcGRhdGUpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAgICAgY29uc3Qgb2xkUm9sZVBhdGggPSBhY3RpdmVDaGF0Lm1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGg7XG4gICAgY29uc3Qgb2xkTW9kZWxOYW1lID0gYWN0aXZlQ2hhdC5tZXRhZGF0YS5tb2RlbE5hbWU7XG5cbiAgICBjb25zdCBjaGFuZ2VkID0gYWN0aXZlQ2hhdC51cGRhdGVNZXRhZGF0YShtZXRhZGF0YVVwZGF0ZSk7XG5cbiAgICBpZiAoY2hhbmdlZCkge1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0QW5kVXBkYXRlSW5kZXgoYWN0aXZlQ2hhdCk7XG5cbiAgICAgIGNvbnN0IG5ld01ldGEgPSBhY3RpdmVDaGF0Lm1ldGFkYXRhO1xuICAgICAgbGV0IHJvbGVDaGFuZ2VkID0gZmFsc2U7XG4gICAgICBsZXQgbW9kZWxDaGFuZ2VkID0gZmFsc2U7XG4gICAgICBpZiAobWV0YWRhdGFVcGRhdGUuc2VsZWN0ZWRSb2xlUGF0aCAhPT0gdW5kZWZpbmVkICYmIG9sZFJvbGVQYXRoICE9PSBuZXdNZXRhLnNlbGVjdGVkUm9sZVBhdGgpIHtcbiAgICAgICAgcm9sZUNoYW5nZWQgPSB0cnVlO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGFkYXRhVXBkYXRlLm1vZGVsTmFtZSAhPT0gdW5kZWZpbmVkICYmIG9sZE1vZGVsTmFtZSAhPT0gbmV3TWV0YS5tb2RlbE5hbWUpIHtcbiAgICAgICAgbW9kZWxDaGFuZ2VkID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJvbGVDaGFuZ2VkKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3Qgcm9sZVBhdGhBcmcgPSBuZXdNZXRhLnNlbGVjdGVkUm9sZVBhdGggPz8gdW5kZWZpbmVkO1xuICAgICAgICAgIGNvbnN0IG5ld1JvbGVOYW1lID0gYXdhaXQgdGhpcy5wbHVnaW4uZmluZFJvbGVOYW1lQnlQYXRoKHJvbGVQYXRoQXJnKTtcblxuICAgICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJyb2xlLWNoYW5nZWRcIiwgbmV3Um9sZU5hbWUgPz8gXCJOb25lXCIpO1xuICAgICAgICAgIHRoaXMucGx1Z2luLnByb21wdFNlcnZpY2U/LmNsZWFyUm9sZUNhY2hlPy4oKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKG1vZGVsQ2hhbmdlZCkge1xuICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwibW9kZWwtY2hhbmdlZFwiLCBuZXdNZXRhLm1vZGVsTmFtZSB8fCBcIlwiKTtcbiAgICAgICAgdGhpcy5wbHVnaW4ucHJvbXB0U2VydmljZT8uY2xlYXJNb2RlbERldGFpbHNDYWNoZT8uKCk7XG4gICAgICB9XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwiYWN0aXZlLWNoYXQtY2hhbmdlZFwiLCB7IGNoYXRJZDogdGhpcy5hY3RpdmVDaGF0SWQsIGNoYXQ6IGFjdGl2ZUNoYXQgfSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG5cblxuXG4vKipcbiAqINCU0L7Qv9C+0LzRltC20L3QuNC5INC80LXRgtC+0LQg0LTQu9GPINCy0LjQtNCw0LvQtdC90L3RjyDRhNCw0LnQu9GDINGH0LDRgtGDINGC0LAg0LfQsNC/0LjRgdGDINC3INGW0L3QtNC10LrRgdGDINCR0JXQlyDQs9C10L3QtdGA0LDRhtGW0Zcg0L/QvtC00ZbQuS5cbiAqIEBwYXJhbSBpZCBJRCDRh9Cw0YLRgyDQtNC70Y8g0LLQuNC00LDQu9C10L3QvdGPLlxuICogQHBhcmFtIGZpbGVQYXRoINCo0LvRj9GFINC00L4g0YTQsNC50LvRgyDRh9Cw0YLRgyAo0LzQvtC20LUg0LHRg9GC0LggbnVsbCkuXG4gKiBAcGFyYW0gZGVsZXRlRmlsZSDQp9C4INC/0L7RgtGA0ZbQsdC90L4g0LLQuNC00LDQu9GP0YLQuCDRhNGW0LfQuNGH0L3QuNC5INGE0LDQudC7LlxuICogQHJldHVybnMgdHJ1ZSwg0Y/QutGJ0L4g0ZbQvdC00LXQutGBIGNoYXRJbmRleCDQsdGD0LIg0LfQvNGW0L3QtdC90LjQuSwgZmFsc2Ug0LIg0ZbQvdGI0L7QvNGDINCy0LjQv9Cw0LTQutGDLlxuICovXG5wcml2YXRlIGFzeW5jIGRlbGV0ZUNoYXRGaWxlQW5kSW5kZXhFbnRyeV9Ob0VtaXQoXG4gIGlkOiBzdHJpbmcsXG4gIGZpbGVQYXRoOiBzdHJpbmcgfCBudWxsLFxuICBkZWxldGVGaWxlOiBib29sZWFuID0gdHJ1ZVxuKTogUHJvbWlzZTxib29sZWFuPiB7IFxuICBjb25zdCBzYWZlRmlsZVBhdGggPSBmaWxlUGF0aCA/PyBcInVua25vd25fcGF0aFwiOyBcbiAgbGV0IGluZGV4Q2hhbmdlZCA9IGZhbHNlO1xuXG4gIFxuICBpZiAodGhpcy5sb2FkZWRDaGF0c1tpZF0pIHtcbiAgICAgIGRlbGV0ZSB0aGlzLmxvYWRlZENoYXRzW2lkXTtcbiAgICAgICAgfVxuICBcbiAgaWYgKHRoaXMuY2hhdEluZGV4W2lkXSkge1xuICAgICAgZGVsZXRlIHRoaXMuY2hhdEluZGV4W2lkXTtcbiAgICAgIGluZGV4Q2hhbmdlZCA9IHRydWU7IFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICB9XG5cbiAgXG4gIGlmIChkZWxldGVGaWxlICYmIGZpbGVQYXRoICYmIHR5cGVvZiBmaWxlUGF0aCA9PT0gXCJzdHJpbmdcIiAmJiBmaWxlUGF0aCAhPT0gXCIvXCIgJiYgIWZpbGVQYXRoLmVuZHNXaXRoKFwiL1wiKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBmaWxlRXhpc3RzID0gYXdhaXQgdGhpcy5hZGFwdGVyLmV4aXN0cyhmaWxlUGF0aCk7XG4gICAgICAgICAgaWYgKGZpbGVFeGlzdHMpIHtcbiAgICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuYWRhcHRlci5zdGF0KGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgaWYgKHN0YXQ/LnR5cGUgPT09IFwiZmlsZVwiKSB7XG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucmVtb3ZlKGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvciBkZWxldGluZyBmaWxlOiAke2ZpbGVQYXRoLnNwbGl0KCcvJykucG9wKCl9YCk7XG4gICAgICAgICAgXG4gICAgICB9XG4gIH0gZWxzZSBpZiAoZGVsZXRlRmlsZSAmJiBmaWxlUGF0aCkge1xuICAgICAgIFxuICAgICAgICAgfVxuXG4gIFxuICBpZiAoaW5kZXhDaGFuZ2VkKSB7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0SW5kZXgoKTtcbiAgICAgICAgfVxuICByZXR1cm4gaW5kZXhDaGFuZ2VkOyBcbn1cblxuICBcblxuYXN5bmMgZGVsZXRlQ2hhdChpZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGNvbnN0IGNoYXRFeGlzdGVkSW5JbmRleCA9ICEhdGhpcy5jaGF0SW5kZXhbaWRdO1xuICBjb25zdCB3YXNBY3RpdmUgPSBpZCA9PT0gdGhpcy5hY3RpdmVDaGF0SWQ7XG4gIFxuICBsZXQgZmlsZVBhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICB0cnkge1xuICAgICAgXG4gICAgICBjb25zdCBoaWVyYXJjaHkgPSBhd2FpdCB0aGlzLmdldENoYXRIaWVyYXJjaHkoKTtcbiAgICAgIGZpbGVQYXRoID0gdGhpcy5maW5kQ2hhdFBhdGhJbkhpZXJhcmNoeShpZCwgaGllcmFyY2h5KTtcbiAgICAgIGlmICghZmlsZVBhdGggJiYgY2hhdEV4aXN0ZWRJbkluZGV4KSB7XG4gICAgICAgICAgICAgICAgIH1cbiAgfSBjYXRjaCAoaGllcmFyY2h5RXJyb3IpIHtcbiAgICAgICAgICAgIFxuICB9XG5cbiAgXG4gIGlmICghZmlsZVBhdGggJiYgIWNoYXRFeGlzdGVkSW5JbmRleCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlOyBcbiAgfVxuXG4gIGxldCBzdWNjZXNzID0gdHJ1ZTtcbiAgXG4gIGxldCBldmVudFRvRW1pdDogeyBuYW1lOiBzdHJpbmc7IGRhdGE6IGFueSB9IHwgbnVsbCA9IG51bGw7XG5cbiAgdHJ5IHtcbiAgICAgIFxuICAgICAgY29uc3QgaW5kZXhXYXNDaGFuZ2VkID0gYXdhaXQgdGhpcy5kZWxldGVDaGF0RmlsZUFuZEluZGV4RW50cnlfTm9FbWl0KGlkLCBmaWxlUGF0aCwgdHJ1ZSk7XG4gICAgICBcbiAgICAgIFxuICAgICAgaWYgKHdhc0FjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICBjb25zdCBuZXdIaWVyYXJjaHkgPSBhd2FpdCB0aGlzLmdldENoYXRIaWVyYXJjaHkoKTsgXG4gICAgICAgICAgY29uc3QgZmlyc3RDaGF0ID0gdGhpcy5maW5kRmlyc3RDaGF0SW5IaWVyYXJjaHkobmV3SGllcmFyY2h5KTtcbiAgICAgICAgICBjb25zdCBuZXh0QWN0aXZlSWQgPSBmaXJzdENoYXQgPyBmaXJzdENoYXQubWV0YWRhdGEuaWQgOiBudWxsO1xuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIGF3YWl0IHRoaXMuc2V0QWN0aXZlQ2hhdChuZXh0QWN0aXZlSWQpO1xuICAgICAgICAgIFxuXG4gICAgICB9IGVsc2UgaWYgKGluZGV4V2FzQ2hhbmdlZCkge1xuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBldmVudFRvRW1pdCA9IHsgbmFtZTogXCJjaGF0LWxpc3QtdXBkYXRlZFwiLCBkYXRhOiB1bmRlZmluZWQgfTtcbiAgICAgIH1cblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgZGVsZXRpbmcgY2hhdCAke2lkfS4gQ2hlY2sgY29uc29sZS5gKTtcbiAgICAgIHN1Y2Nlc3MgPSBmYWxzZTtcbiAgICAgIFxuICAgICAgYXdhaXQgdGhpcy5yZWJ1aWxkSW5kZXhGcm9tRmlsZXMoKTtcbiAgICAgIFxuICAgICAgZXZlbnRUb0VtaXQgPSB7IG5hbWU6IFwiY2hhdC1saXN0LXVwZGF0ZWRcIiwgZGF0YTogdW5kZWZpbmVkIH07XG4gIH0gZmluYWxseSB7XG4gICAgICBcbiAgICAgIGlmIChldmVudFRvRW1pdCkge1xuICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmVtaXQoZXZlbnRUb0VtaXQubmFtZSwgZXZlbnRUb0VtaXQuZGF0YSk7XG4gICAgICB9IGVsc2UgaWYgKHdhc0FjdGl2ZSkge1xuICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICB9XG5cbiAgICAgIFxuICAgICAgaWYgKHN1Y2Nlc3MgJiYgY2hhdEV4aXN0ZWRJbkluZGV4KSB7XG4gICAgICAgICAgbmV3IE5vdGljZShgQ2hhdCBkZWxldGVkLmApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIWNoYXRFeGlzdGVkSW5JbmRleCkge1xuICAgICAgICAgICAgICAgICB9XG4gIH1cbiAgXG4gIHJldHVybiBzdWNjZXNzICYmIGNoYXRFeGlzdGVkSW5JbmRleDtcbn1cblxuICBhc3luYyBjbG9uZUNoYXQoY2hhdElkVG9DbG9uZTogc3RyaW5nKTogUHJvbWlzZTxDaGF0IHwgbnVsbD4ge1xuICAgIGxldCBvcmlnaW5hbEZpbGVQYXRoOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgY29uc3QgaGllcmFyY2h5ID0gYXdhaXQgdGhpcy5nZXRDaGF0SGllcmFyY2h5KCk7XG4gICAgICBvcmlnaW5hbEZpbGVQYXRoID0gdGhpcy5maW5kQ2hhdFBhdGhJbkhpZXJhcmNoeShjaGF0SWRUb0Nsb25lLCBoaWVyYXJjaHkpO1xuICAgIH0gY2F0Y2ggKGhpZXJhcmNoeUVycm9yKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiRXJyb3IgZmluZGluZyBvcmlnaW5hbCBjaGF0IGZvciBjbG9uaW5nLlwiKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmICghb3JpZ2luYWxGaWxlUGF0aCkge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIk9yaWdpbmFsIGNoYXQgZmlsZSBwYXRoIG5vdCBmb3VuZC5cIik7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgY29uc3Qgb3JpZ2luYWxDaGF0ID0gYXdhaXQgdGhpcy5nZXRDaGF0KGNoYXRJZFRvQ2xvbmUsIG9yaWdpbmFsRmlsZVBhdGgpO1xuICAgIGlmICghb3JpZ2luYWxDaGF0KSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiT3JpZ2luYWwgY2hhdCBjb3VsZCBub3QgYmUgbG9hZGVkLlwiKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHRhcmdldEZvbGRlciA9IG9yaWdpbmFsRmlsZVBhdGguc3Vic3RyaW5nKDAsIG9yaWdpbmFsRmlsZVBhdGgubGFzdEluZGV4T2YoXCIvXCIpKSB8fCBcIi9cIjtcbiAgICBjb25zdCBmaW5hbEZvbGRlclBhdGggPSB0YXJnZXRGb2xkZXIgPT09IFwiXCIgfHwgdGFyZ2V0Rm9sZGVyID09PSBcIi5cIiA/IFwiL1wiIDogdGFyZ2V0Rm9sZGVyO1xuXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuZW5zdXJlU3BlY2lmaWNGb2xkZXJFeGlzdHMoZmluYWxGb2xkZXJQYXRoKTtcbiAgICB9IGNhdGNoIChmb2xkZXJFcnJvcikge1xuICAgICAgbmV3IE5vdGljZShgRmFpbGVkIHRvIGVuc3VyZSB0YXJnZXQgZm9sZGVyIGZvciBjbG9uZTogJHtmaW5hbEZvbGRlclBhdGh9YCk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgY2xvbmVkRGF0YSA9IG9yaWdpbmFsQ2hhdC50b0pTT04oKTtcbiAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgICBjb25zdCBuZXdJZCA9IHV1aWR2NCgpO1xuICAgICAgY29uc3QgbmV3RmlsZVBhdGggPSB0aGlzLmdldENoYXRGaWxlUGF0aChuZXdJZCwgZmluYWxGb2xkZXJQYXRoKTtcblxuICAgICAgY2xvbmVkRGF0YS5tZXRhZGF0YS5pZCA9IG5ld0lkO1xuICAgICAgY2xvbmVkRGF0YS5tZXRhZGF0YS5uYW1lID0gYENvcHkgb2YgJHtvcmlnaW5hbENoYXQubWV0YWRhdGEubmFtZX1gO1xuICAgICAgY2xvbmVkRGF0YS5tZXRhZGF0YS5jcmVhdGVkQXQgPSBub3cudG9JU09TdHJpbmcoKTtcbiAgICAgIGNsb25lZERhdGEubWV0YWRhdGEubGFzdE1vZGlmaWVkID0gbm93LnRvSVNPU3RyaW5nKCk7XG4gICAgICBjbG9uZWREYXRhLm1ldGFkYXRhLm1vZGVsTmFtZSA9IG9yaWdpbmFsQ2hhdC5tZXRhZGF0YS5tb2RlbE5hbWU7XG4gICAgICBjbG9uZWREYXRhLm1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGggPSBvcmlnaW5hbENoYXQubWV0YWRhdGEuc2VsZWN0ZWRSb2xlUGF0aDtcbiAgICAgIGNsb25lZERhdGEubWV0YWRhdGEudGVtcGVyYXR1cmUgPSBvcmlnaW5hbENoYXQubWV0YWRhdGEudGVtcGVyYXR1cmU7XG4gICAgICBjbG9uZWREYXRhLm1ldGFkYXRhLmNvbnRleHRXaW5kb3cgPSBvcmlnaW5hbENoYXQubWV0YWRhdGEuY29udGV4dFdpbmRvdztcblxuICAgICAgY29uc3QgY29uc3RydWN0b3JTZXR0aW5nczogQ2hhdENvbnN0cnVjdG9yU2V0dGluZ3MgPSB7IC4uLnRoaXMucGx1Z2luLnNldHRpbmdzIH07XG4gICAgICBjb25zdCBjbG9uZWRDaGF0ID0gbmV3IENoYXQodGhpcy5hZGFwdGVyLCBjb25zdHJ1Y3RvclNldHRpbmdzLCBjbG9uZWREYXRhLCBuZXdGaWxlUGF0aCwgdGhpcy5sb2dnZXIpO1xuXG4gICAgICBjb25zdCBzdG9yZWRNZXRhOiBDaGF0U2Vzc2lvblN0b3JlZCA9IHtcbiAgICAgICAgbmFtZTogY2xvbmVkRGF0YS5tZXRhZGF0YS5uYW1lLFxuICAgICAgICBsYXN0TW9kaWZpZWQ6IGNsb25lZERhdGEubWV0YWRhdGEubGFzdE1vZGlmaWVkLFxuICAgICAgICBjcmVhdGVkQXQ6IGNsb25lZERhdGEubWV0YWRhdGEuY3JlYXRlZEF0LFxuICAgICAgICBtb2RlbE5hbWU6IGNsb25lZERhdGEubWV0YWRhdGEubW9kZWxOYW1lLFxuICAgICAgICBzZWxlY3RlZFJvbGVQYXRoOiBjbG9uZWREYXRhLm1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGgsXG4gICAgICAgIHRlbXBlcmF0dXJlOiBjbG9uZWREYXRhLm1ldGFkYXRhLnRlbXBlcmF0dXJlLFxuICAgICAgICBjb250ZXh0V2luZG93OiBjbG9uZWREYXRhLm1ldGFkYXRhLmNvbnRleHRXaW5kb3csXG4gICAgICB9O1xuICAgICAgdGhpcy5jaGF0SW5kZXhbbmV3SWRdID0gc3RvcmVkTWV0YTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRJbmRleCgpO1xuICAgICAgXG5cbiAgICAgIGNvbnN0IHNhdmVkSW1tZWRpYXRlbHkgPSBhd2FpdCBjbG9uZWRDaGF0LnNhdmVJbW1lZGlhdGVseSgpO1xuICAgICAgaWYgKCFzYXZlZEltbWVkaWF0ZWx5KSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmNoYXRJbmRleFtuZXdJZF07XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRJbmRleCgpO1xuICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwiY2hhdC1saXN0LXVwZGF0ZWRcIik7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkVycm9yOiBGYWlsZWQgdG8gc2F2ZSB0aGUgY2xvbmVkIGNoYXQgZmlsZS5cIik7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmxvYWRlZENoYXRzW25ld0lkXSA9IGNsb25lZENoYXQ7XG4gICAgICBhd2FpdCB0aGlzLnNldEFjdGl2ZUNoYXQobmV3SWQpO1xuXG4gICAgICByZXR1cm4gY2xvbmVkQ2hhdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIkFuIGVycm9yIG9jY3VycmVkIHdoaWxlIGNsb25pbmcgdGhlIGNoYXQuXCIpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZGVsZXRlTWVzc2FnZXNBZnRlcihjaGF0SWQ6IHN0cmluZywgbWVzc2FnZUluZGV4VG9EZWxldGVBZnRlcjogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgY2hhdCA9IGF3YWl0IHRoaXMuZ2V0Q2hhdChjaGF0SWQpO1xuICAgIGlmICghY2hhdCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmIChtZXNzYWdlSW5kZXhUb0RlbGV0ZUFmdGVyID49IGNoYXQubWVzc2FnZXMubGVuZ3RoIC0gMSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmIChtZXNzYWdlSW5kZXhUb0RlbGV0ZUFmdGVyIDwgLTEpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbExlbmd0aCA9IGNoYXQubWVzc2FnZXMubGVuZ3RoO1xuICAgIGNvbnN0IHRhcmdldExlbmd0aCA9IG1lc3NhZ2VJbmRleFRvRGVsZXRlQWZ0ZXIgKyAxO1xuICAgIGNoYXQubWVzc2FnZXMubGVuZ3RoID0gdGFyZ2V0TGVuZ3RoO1xuXG4gICAgY2hhdC51cGRhdGVNZXRhZGF0YSh7fSk7XG5cbiAgICBhd2FpdCB0aGlzLnNhdmVDaGF0QW5kVXBkYXRlSW5kZXgoY2hhdCk7XG5cbiAgICBpZiAodGhpcy5hY3RpdmVDaGF0SWQgPT09IGNoYXRJZCkge1xuICAgICAgdGhpcy5hY3RpdmVDaGF0ID0gY2hhdDtcblxuICAgICAgdGhpcy5wbHVnaW4uZW1pdChcImFjdGl2ZS1jaGF0LWNoYW5nZWRcIiwgeyBjaGF0SWQ6IGNoYXRJZCwgY2hhdDogY2hhdCB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZU1lc3NhZ2VCeVRpbWVzdGFtcChjaGF0SWQ6IHN0cmluZywgdGltZXN0YW1wVG9EZWxldGU6IERhdGUpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBjaGF0ID0gYXdhaXQgdGhpcy5nZXRDaGF0KGNoYXRJZCk7XG4gICAgaWYgKCFjaGF0KSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvcjogQ2hhdCAke2NoYXRJZH0gbm90IGZvdW5kLmApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHRpbWVUYXJnZXQgPSB0aW1lc3RhbXBUb0RlbGV0ZS5nZXRUaW1lKCk7XG4gICAgY29uc3QgdG9sZXJhbmNlID0gMTAwMDsgXG4gICAgbGV0IG1lc3NhZ2VJbmRleCA9IC0xO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGF0Lm1lc3NhZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBtZXNzYWdlVGltZSA9IGNoYXQubWVzc2FnZXNbaV0udGltZXN0YW1wLmdldFRpbWUoKTtcbiAgICAgIGlmICghaXNOYU4obWVzc2FnZVRpbWUpICYmIE1hdGguYWJzKG1lc3NhZ2VUaW1lIC0gdGltZVRhcmdldCkgPCB0b2xlcmFuY2UpIHtcbiAgICAgICAgbWVzc2FnZUluZGV4ID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9IGVsc2UgaWYgKGlzTmFOKG1lc3NhZ2VUaW1lKSkge1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChtZXNzYWdlSW5kZXggPT09IC0xKSB7XG4gICAgICBuZXcgTm90aWNlKFwiTWVzc2FnZSBub3QgZm91bmQuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIFxuICAgIHJldHVybiBhd2FpdCB0aGlzLl9wZXJmb3JtRGVsZXRlTWVzc2FnZUJ5SW5kZXgoY2hhdCwgbWVzc2FnZUluZGV4KTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgX3BlcmZvcm1EZWxldGVNZXNzYWdlQnlJbmRleChjaGF0OiBDaGF0LCBtZXNzYWdlSW5kZXg6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IGNoYXRJZCA9IGNoYXQubWV0YWRhdGEuaWQ7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChtZXNzYWdlSW5kZXggPCAwIHx8IG1lc3NhZ2VJbmRleCA+PSBjaGF0Lm1lc3NhZ2VzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZGVsZXRlZE1lc3NhZ2UgPSBjaGF0Lm1lc3NhZ2VzLnNwbGljZShtZXNzYWdlSW5kZXgsIDEpWzBdO1xuXG4gICAgICBjaGF0LnVwZGF0ZU1ldGFkYXRhKHt9KTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRBbmRVcGRhdGVJbmRleChjaGF0KTtcblxuICAgICAgaWYgKHRoaXMuYWN0aXZlQ2hhdElkID09PSBjaGF0SWQpIHtcbiAgICAgICAgdGhpcy5hY3RpdmVDaGF0ID0gY2hhdDtcblxuICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwiYWN0aXZlLWNoYXQtY2hhbmdlZFwiLCB7IGNoYXRJZDogY2hhdElkLCBjaGF0OiBjaGF0IH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoZGVsZXRlZE1lc3NhZ2UpIHtcbiAgICAgICAgdGhpcy5wbHVnaW4uZW1pdChcIm1lc3NhZ2UtZGVsZXRlZFwiLCB7IGNoYXRJZDogY2hhdElkLCB0aW1lc3RhbXA6IGRlbGV0ZWRNZXNzYWdlLnRpbWVzdGFtcCB9KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBkZWxldGluZyBtZXNzYWdlLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjbGVhckNoYXRNZXNzYWdlc0J5SWQoY2hhdElkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBjaGF0ID0gYXdhaXQgdGhpcy5nZXRDaGF0KGNoYXRJZCk7XG4gICAgaWYgKCFjaGF0KSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvcjogQ2hhdCAke2NoYXRJZH0gbm90IGZvdW5kLmApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmIChjaGF0Lm1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNoYXQuY2xlYXJNZXNzYWdlcygpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlQ2hhdEFuZFVwZGF0ZUluZGV4KGNoYXQpO1xuXG4gICAgICBjb25zdCBpc0FjdGl2ZSA9IGNoYXRJZCA9PT0gdGhpcy5hY3RpdmVDaGF0SWQ7XG4gICAgICBpZiAoaXNBY3RpdmUpIHtcbiAgICAgICAgdGhpcy5hY3RpdmVDaGF0ID0gY2hhdDtcblxuICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KFwibWVzc2FnZXMtY2xlYXJlZFwiLCBjaGF0SWQpO1xuICAgICAgfVxuICAgICAgbmV3IE5vdGljZShgTWVzc2FnZXMgY2xlYXJlZCBmb3IgY2hhdCBcIiR7Y2hhdC5tZXRhZGF0YS5uYW1lfVwiLmApO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJFcnJvciBjbGVhcmluZyBtZXNzYWdlcy5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgcmVuYW1lQ2hhdChjaGF0SWQ6IHN0cmluZywgbmV3TmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgdHJpbW1lZE5hbWUgPSBuZXdOYW1lLnRyaW0oKTtcbiAgICBpZiAoIXRyaW1tZWROYW1lKSB7XG4gICAgICBuZXcgTm90aWNlKFwiQ2hhdCBuYW1lIGNhbm5vdCBiZSBlbXB0eS5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmICgvW1xcXFwvPzoqXCI8PnxdLy50ZXN0KHRyaW1tZWROYW1lKSkge1xuICAgICAgbmV3IE5vdGljZShcIkNoYXQgbmFtZSBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IGNoYXQgPSBhd2FpdCB0aGlzLmdldENoYXQoY2hhdElkKTtcblxuICAgIGlmICghY2hhdCkge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIkNoYXQgbm90IGZvdW5kLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAoY2hhdC5tZXRhZGF0YS5uYW1lID09PSB0cmltbWVkTmFtZSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNoYW5nZWQgPSBjaGF0LnVwZGF0ZU1ldGFkYXRhKHsgbmFtZTogdHJpbW1lZE5hbWUgfSk7XG5cbiAgICAgIGlmIChjaGFuZ2VkKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZUNoYXRBbmRVcGRhdGVJbmRleChjaGF0KTtcblxuICAgICAgICBpZiAodGhpcy5hY3RpdmVDaGF0SWQgPT09IGNoYXRJZCkge1xuICAgICAgICAgIHRoaXMuYWN0aXZlQ2hhdCA9IGNoYXQ7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uZW1pdChcImFjdGl2ZS1jaGF0LWNoYW5nZWRcIiwgeyBjaGF0SWQ6IGNoYXRJZCwgY2hhdDogY2hhdCB9KTtcbiAgICAgICAgfVxuICAgICAgICBuZXcgTm90aWNlKGBDaGF0IHJlbmFtZWQgdG8gXCIke3RyaW1tZWROYW1lfVwiLmApO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIkFuIGVycm9yIG9jY3VycmVkIHdoaWxlIHJlbmFtaW5nIHRoZSBjaGF0LlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBcblxuICAvKipcbiAgICog0KHRgtCy0L7RgNGO0ZQg0L3QvtCy0YMg0L/QsNC/0LrRgyDQt9CwINCy0LrQsNC30LDQvdC40Lwg0YjQu9GP0YXQvtC8LlxuICAgKiBAcGFyYW0gZm9sZGVyUGF0aCDQn9C+0LLQvdC40LksINC90L7RgNC80LDQu9GW0LfQvtCy0LDQvdC40Lkg0YjQu9GP0YUg0LTQviDQv9Cw0L/QutC4LCDRj9C60YMg0L/QvtGC0YDRltCx0L3QviDRgdGC0LLQvtGA0LjRgtC4LlxuICAgKiBAcmV0dXJucyB0cnVlLCDRj9C60YnQviDQv9Cw0L/QutCwINGD0YHQv9GW0YjQvdC+INGB0YLQstC+0YDQtdC90LAsIGZhbHNlINCyINGW0L3RiNC+0LzRgyDQstC40L/QsNC00LrRgy5cbiAgICovXG4gIGFzeW5jIGNyZWF0ZUZvbGRlcihmb2xkZXJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IG5vcm1hbGl6ZVBhdGgoZm9sZGVyUGF0aCk7XG5cbiAgICBcbiAgICBpZiAoIW5vcm1hbGl6ZWRQYXRoIHx8IG5vcm1hbGl6ZWRQYXRoID09PSBcIi9cIiB8fCBub3JtYWxpemVkUGF0aCA9PT0gXCIuXCIpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJJbnZhbGlkIGZvbGRlciBwYXRoLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIuLlwiKSB8fCBub3JtYWxpemVkUGF0aC5pbmNsdWRlcyhcIlxcMFwiKSkge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIkludmFsaWQgY2hhcmFjdGVycyBvciBwYXRoIHRyYXZlcnNhbCBkZXRlY3RlZC5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuYWRhcHRlci5leGlzdHMobm9ybWFsaXplZFBhdGgpO1xuICAgICAgaWYgKGV4aXN0cykge1xuICAgICAgICBuZXcgTm90aWNlKGBcIiR7bm9ybWFsaXplZFBhdGguc3BsaXQoXCIvXCIpLnBvcCgpfVwiIGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlci5ta2Rpcihub3JtYWxpemVkUGF0aCk7XG5cbiAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJjaGF0LWxpc3QtdXBkYXRlZFwiKTsgXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBpZiAoZXJyb3IuY29kZSA9PT0gXCJFUEVSTVwiIHx8IGVycm9yLmNvZGUgPT09IFwiRUFDQ0VTXCIpIHtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGBQZXJtaXNzaW9uIGVycm9yIGNyZWF0aW5nIGZvbGRlci5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShgRmFpbGVkIHRvIGNyZWF0ZSBmb2xkZXI6ICR7ZXJyb3IubWVzc2FnZSB8fCBcIlVua25vd24gZXJyb3JcIn1gKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICog0J/QtdGA0LXQudC80LXQvdC+0LLRg9GUINCw0LHQviDQv9C10YDQtdC80ZbRidGD0ZQg0L/QsNC/0LrRgy5cbiAgICog0JLQsNC20LvQuNCy0L46INCm0LXQuSDQvNC10YLQvtC0INC90LUg0L7QvdC+0LLQu9GO0ZQg0ZbQvdC00LXQutGBIGNoYXRJbmRleCDQsNCy0YLQvtC80LDRgtC40YfQvdC+INC00LvRjyDRh9Cw0YLRltCyINCy0YHQtdGA0LXQtNC40L3RliDQv9Cw0L/QutC4LlxuICAgKiDQndCw0LnQutGA0LDRidC1INCy0LjQutC70LjQutCw0YLQuCByZWJ1aWxkSW5kZXhGcm9tRmlsZXMoKSDQv9GW0YHQu9GPINGD0YHQv9GW0YjQvdC+0LPQviDQv9C10YDQtdC50LzQtdC90YPQstCw0L3QvdGPINCw0LHQviDQv9C+0LrQu9Cw0LTQsNGC0LjRgdGPXG4gICAqINC90LAg0YLQtSwg0YnQviBnZXRDaGF0SGllcmFyY2h5KCkg0LfQsdC40YDQsNGC0LjQvNC1INCw0LrRgtGD0LDQu9GM0L3RgyDRgdGC0YDRg9C60YLRg9GA0YMuXG4gICAqIEBwYXJhbSBvbGRQYXRoINCf0L7QstC90LjQuSwg0L3QvtGA0LzQsNC70ZbQt9C+0LLQsNC90LjQuSDRgdGC0LDRgNC40Lkg0YjQu9GP0YUg0LTQviDQv9Cw0L/QutC4LlxuICAgKiBAcGFyYW0gbmV3UGF0aCDQn9C+0LLQvdC40LksINC90L7RgNC80LDQu9GW0LfQvtCy0LDQvdC40Lkg0L3QvtCy0LjQuSDRiNC70Y/RhSDQtNC+INC/0LDQv9C60LguXG4gICAqIEByZXR1cm5zIHRydWUsINGP0LrRidC+INC/0LXRgNC10LnQvNC10L3Rg9Cy0LDQvdC90Y8v0L/QtdGA0LXQvNGW0YnQtdC90L3RjyDRg9GB0L/RltGI0L3QtSwgZmFsc2Ug0LIg0ZbQvdGI0L7QvNGDINCy0LjQv9Cw0LTQutGDLlxuICAgKi9cbiAgYXN5bmMgcmVuYW1lRm9sZGVyKG9sZFBhdGg6IHN0cmluZywgbmV3UGF0aDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3Qgbm9ybU9sZFBhdGggPSBub3JtYWxpemVQYXRoKG9sZFBhdGgpO1xuICAgIGNvbnN0IG5vcm1OZXdQYXRoID0gbm9ybWFsaXplUGF0aChuZXdQYXRoKTtcblxuICAgIFxuICAgIGlmICghbm9ybU9sZFBhdGggfHwgbm9ybU9sZFBhdGggPT09IFwiL1wiIHx8ICFub3JtTmV3UGF0aCB8fCBub3JtTmV3UGF0aCA9PT0gXCIvXCIpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJDYW5ub3QgcmVuYW1lIHJvb3QgZm9sZGVyIG9yIHVzZSBlbXB0eSBwYXRoLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKG5vcm1PbGRQYXRoID09PSBub3JtTmV3UGF0aCkge1xuICAgICAgcmV0dXJuIHRydWU7IFxuICAgIH1cbiAgICBpZiAobm9ybU5ld1BhdGguc3RhcnRzV2l0aChub3JtT2xkUGF0aCArIFwiL1wiKSkge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIkNhbm5vdCBtb3ZlIGEgZm9sZGVyIGluc2lkZSBpdHNlbGYuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBvbGRFeGlzdHMgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuZXhpc3RzKG5vcm1PbGRQYXRoKTtcbiAgICAgIGlmICghb2xkRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkZvbGRlciB0byByZW5hbWUgbm90IGZvdW5kLlwiKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgY29uc3Qgb2xkU3RhdCA9IGF3YWl0IHRoaXMuYWRhcHRlci5zdGF0KG5vcm1PbGRQYXRoKTtcbiAgICAgIGlmIChvbGRTdGF0Py50eXBlICE9PSBcImZvbGRlclwiKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkl0ZW0gdG8gcmVuYW1lIGlzIG5vdCBhIGZvbGRlci5cIik7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbmV3RXhpc3RzID0gYXdhaXQgdGhpcy5hZGFwdGVyLmV4aXN0cyhub3JtTmV3UGF0aCk7XG4gICAgICBpZiAobmV3RXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShgXCIke25vcm1OZXdQYXRoLnNwbGl0KFwiL1wiKS5wb3AoKX1cIiBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICBcbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlci5yZW5hbWUobm9ybU9sZFBhdGgsIG5vcm1OZXdQYXRoKTtcblxuICAgICAgXG4gICAgICBPYmplY3QudmFsdWVzKHRoaXMubG9hZGVkQ2hhdHMpLmZvckVhY2goY2hhdCA9PiB7XG4gICAgICAgIGlmIChjaGF0LmZpbGVQYXRoLnN0YXJ0c1dpdGgobm9ybU9sZFBhdGggKyBcIi9cIikpIHtcbiAgICAgICAgICBjb25zdCByZWxhdGl2ZVBhdGggPSBjaGF0LmZpbGVQYXRoLnN1YnN0cmluZyhub3JtT2xkUGF0aC5sZW5ndGgpO1xuICAgICAgICAgIGNvbnN0IHVwZGF0ZWRQYXRoID0gbm9ybWFsaXplUGF0aChub3JtTmV3UGF0aCArIHJlbGF0aXZlUGF0aCk7XG5cbiAgICAgICAgICBjaGF0LmZpbGVQYXRoID0gdXBkYXRlZFBhdGg7IFxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgdGhpcy5wbHVnaW4uZW1pdChcImNoYXQtbGlzdC11cGRhdGVkXCIpOyBcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSBcIkVQRVJNXCIgfHwgZXJyb3IuY29kZSA9PT0gXCJFQUNDRVNcIikge1xuICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYFBlcm1pc3Npb24gZXJyb3IgcmVuYW1pbmcgZm9sZGVyLmApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGBGYWlsZWQgdG8gcmVuYW1lIGZvbGRlcjogJHtlcnJvci5tZXNzYWdlIHx8IFwiVW5rbm93biBlcnJvclwifWApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiDQoNC10LrRg9GA0YHQuNCy0L3QviDQstC40LTQsNC70Y/RlCDQv9Cw0L/QutGDINGC0LAg0LLQtdGB0Ywg0ZfRlyDQstC80ZbRgdGCICjQv9GW0LTQv9Cw0L/QutC4INGC0LAg0YfQsNGC0LgpLlxuICAgKiBAcGFyYW0gZm9sZGVyUGF0aCDQn9C+0LLQvdC40LksINC90L7RgNC80LDQu9GW0LfQvtCy0LDQvdC40Lkg0YjQu9GP0YUg0LTQviDQv9Cw0L/QutC4LCDRj9C60YMg0L/QvtGC0YDRltCx0L3QviDQstC40LTQsNC70LjRgtC4LlxuICAgKiBAcmV0dXJucyB0cnVlLCDRj9C60YnQviDQv9Cw0L/QutCwINGC0LAg0ZfRlyDQstC80ZbRgdGCINGD0YHQv9GW0YjQvdC+INCy0LjQtNCw0LvQtdC90ZYsIGZhbHNlINCyINGW0L3RiNC+0LzRgyDQstC40L/QsNC00LrRgy5cbiAgICovXG4gIGFzeW5jIGRlbGV0ZUZvbGRlcihmb2xkZXJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IG5vcm1hbGl6ZVBhdGgoZm9sZGVyUGF0aCk7XG5cbiAgICBcbiAgICBpZiAoIW5vcm1hbGl6ZWRQYXRoIHx8IG5vcm1hbGl6ZWRQYXRoID09PSBcIi9cIiB8fCBub3JtYWxpemVkUGF0aCA9PT0gXCIuXCIpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJDYW5ub3QgZGVsZXRlIHRoaXMgZm9sZGVyLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgXG4gICAgaWYgKG5vcm1hbGl6ZWRQYXRoID09PSB0aGlzLmNoYXRzRm9sZGVyUGF0aCkge1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIkNhbm5vdCBkZWxldGUgdGhlIG1haW4gY2hhdCBoaXN0b3J5IGZvbGRlciBzZXQgaW4gc2V0dGluZ3MuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuZXhpc3RzKG5vcm1hbGl6ZWRQYXRoKTtcbiAgICAgIGlmICghZXhpc3RzKSB7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmFkYXB0ZXIuc3RhdChub3JtYWxpemVkUGF0aCk7XG4gICAgICBpZiAoc3RhdD8udHlwZSAhPT0gXCJmb2xkZXJcIikge1xuICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJJdGVtIHRvIGRlbGV0ZSBpcyBub3QgYSBmb2xkZXIuXCIpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIFxuXG4gICAgICBjb25zdCBjaGF0SWRzVG9EZWxldGU6IHN0cmluZ1tdID0gW107XG4gICAgICBcbiAgICAgIGNvbnN0IGNvbGxlY3RDaGF0SWRzID0gYXN5bmMgKGN1cnJlbnRQYXRoOiBzdHJpbmcpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBsaXN0ID0gYXdhaXQgdGhpcy5hZGFwdGVyLmxpc3QoY3VycmVudFBhdGgpO1xuICAgICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBsaXN0LmZpbGVzKSB7XG4gICAgICAgICAgICBjb25zdCBmaWxlTmFtZSA9IGZpbGUuc3Vic3RyaW5nKGZpbGUubGFzdEluZGV4T2YoXCIvXCIpICsgMSk7XG4gICAgICAgICAgICBpZiAoZmlsZU5hbWUuZW5kc1dpdGgoXCIuanNvblwiKSkge1xuICAgICAgICAgICAgICBjb25zdCBjaGF0SWQgPSBmaWxlTmFtZS5zbGljZSgwLCAtNSk7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBpZiAodGhpcy5jaGF0SW5kZXhbY2hhdElkXSkge1xuICAgICAgICAgICAgICAgIGNoYXRJZHNUb0RlbGV0ZS5wdXNoKGNoYXRJZCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgZm9yIChjb25zdCBmb2xkZXIgb2YgbGlzdC5mb2xkZXJzKSB7XG4gICAgICAgICAgICBhd2FpdCBjb2xsZWN0Q2hhdElkcyhmb2xkZXIpOyBcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGxpc3RFcnJvcikge1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGF3YWl0IGNvbGxlY3RDaGF0SWRzKG5vcm1hbGl6ZWRQYXRoKTsgXG5cbiAgICAgIGxldCBhY3RpdmVDaGF0V2FzRGVsZXRlZCA9IGZhbHNlO1xuICAgICAgY2hhdElkc1RvRGVsZXRlLmZvckVhY2goaWQgPT4ge1xuICAgICAgICBpZiAodGhpcy5jaGF0SW5kZXhbaWRdKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuY2hhdEluZGV4W2lkXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5sb2FkZWRDaGF0c1tpZF0pIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5sb2FkZWRDaGF0c1tpZF07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlQ2hhdElkID09PSBpZCkge1xuICAgICAgICAgIGFjdGl2ZUNoYXRXYXNEZWxldGVkID0gdHJ1ZTtcbiAgICAgICAgICB0aGlzLmFjdGl2ZUNoYXRJZCA9IG51bGw7IFxuICAgICAgICAgIHRoaXMuYWN0aXZlQ2hhdCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBhd2FpdCB0aGlzLnNhdmVDaGF0SW5kZXgoKTtcbiAgICAgIFxuICAgICAgaWYgKGFjdGl2ZUNoYXRXYXNEZWxldGVkKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVEYXRhS2V5KEFDVElWRV9DSEFUX0lEX0tFWSwgbnVsbCk7XG4gICAgICB9XG4gICAgICBcblxuICAgICAgXG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucm1kaXIobm9ybWFsaXplZFBhdGgsIHRydWUpO1xuXG4gICAgICBcbiAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJjaGF0LWxpc3QtdXBkYXRlZFwiKTtcbiAgICAgIFxuICAgICAgaWYgKGFjdGl2ZUNoYXRXYXNEZWxldGVkKSB7XG4gICAgICAgIHRoaXMucGx1Z2luLmVtaXQoXCJhY3RpdmUtY2hhdC1jaGFuZ2VkXCIsIHsgY2hhdElkOiBudWxsLCBjaGF0OiBudWxsIH0pO1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFwiRVBFUk1cIiB8fCBlcnJvci5jb2RlID09PSBcIkVBQ0NFU1wiKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShgUGVybWlzc2lvbiBlcnJvciBkZWxldGluZyBmb2xkZXIuYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYEZhaWxlZCB0byBkZWxldGUgZm9sZGVyOiAke2Vycm9yLm1lc3NhZ2UgfHwgXCJVbmtub3duIGVycm9yXCJ9YCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGF3YWl0IHRoaXMucmVidWlsZEluZGV4RnJvbUZpbGVzKCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgICAgXG4gICAgYXN5bmMgbW92ZUNoYXQoY2hhdElkOiBzdHJpbmcsIG9sZEZpbGVQYXRoOiBzdHJpbmcsIG5ld0ZvbGRlclBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgICAgY29uc3Qgbm9ybU9sZFBhdGggPSBub3JtYWxpemVQYXRoKG9sZEZpbGVQYXRoKTtcbiAgICAgIGNvbnN0IG5vcm1OZXdGb2xkZXJQYXRoID0gbm9ybWFsaXplUGF0aChuZXdGb2xkZXJQYXRoKTtcbiAgICAgIFxuICAgICAgXG4gICAgICBsZXQgbmV3RmlsZVBhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgXG5cbiAgICAgIFxuICAgICAgaWYgKCFjaGF0SWQgfHwgIW9sZEZpbGVQYXRoIHx8ICFuZXdGb2xkZXJQYXRoKSB7XG4gICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJNb3ZlIGNoYXQgZmFpbGVkOiBJbnZhbGlkIGRhdGEuXCIpO1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgdHJ5IHtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoIShhd2FpdCB0aGlzLmFkYXB0ZXIuZXhpc3RzKG5vcm1PbGRQYXRoKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiTW92ZSBjaGF0IGZhaWxlZDogU291cmNlIGZpbGUgbm90IGZvdW5kLlwiKTtcbiAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucmVidWlsZEluZGV4RnJvbUZpbGVzKCk7XG4gICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KCdjaGF0LWxpc3QtdXBkYXRlZCcpO1xuICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgICBjb25zdCBvbGRTdGF0ID0gYXdhaXQgdGhpcy5hZGFwdGVyLnN0YXQobm9ybU9sZFBhdGgpO1xuICAgICAgICAgICBpZihvbGRTdGF0Py50eXBlICE9PSAnZmlsZScpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiTW92ZSBjaGF0IGZhaWxlZDogU291cmNlIGlzIG5vdCBhIGZpbGUuXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgfVxuXG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKCEoYXdhaXQgdGhpcy5hZGFwdGVyLmV4aXN0cyhub3JtTmV3Rm9sZGVyUGF0aCkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIk1vdmUgY2hhdCBmYWlsZWQ6IFRhcmdldCBmb2xkZXIgbm90IGZvdW5kLlwiKTtcbiAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICAgY29uc3QgbmV3U3RhdCA9IGF3YWl0IHRoaXMuYWRhcHRlci5zdGF0KG5vcm1OZXdGb2xkZXJQYXRoKTtcbiAgICAgICAgICAgaWYobmV3U3RhdD8udHlwZSAhPT0gJ2ZvbGRlcicpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiTW92ZSBjaGF0IGZhaWxlZDogVGFyZ2V0IGlzIG5vdCBhIGZvbGRlci5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICB9XG5cbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCBmaWxlTmFtZSA9IG9sZEZpbGVQYXRoLnN1YnN0cmluZyhvbGRGaWxlUGF0aC5sYXN0SW5kZXhPZignLycpICsgMSk7XG4gICAgICAgICAgXG4gICAgICAgICAgbmV3RmlsZVBhdGggPSBub3JtYWxpemVQYXRoKGAke25vcm1OZXdGb2xkZXJQYXRofS8ke2ZpbGVOYW1lfWApO1xuICAgICAgICAgIFxuXG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKG5vcm1PbGRQYXRoID09PSBuZXdGaWxlUGF0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIFxuICAgICAgICAgIGlmIChhd2FpdCB0aGlzLmFkYXB0ZXIuZXhpc3RzKG5ld0ZpbGVQYXRoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYE1vdmUgY2hhdCBmYWlsZWQ6IEEgZmlsZSBuYW1lZCBcIiR7ZmlsZU5hbWV9XCIgYWxyZWFkeSBleGlzdHMgaW4gdGhlIHRhcmdldCBmb2xkZXIuYCk7XG4gICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyLnJlbmFtZShub3JtT2xkUGF0aCwgbmV3RmlsZVBhdGgpO1xuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIGlmICh0aGlzLmxvYWRlZENoYXRzW2NoYXRJZF0gJiYgbmV3RmlsZVBhdGgpIHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRDaGF0c1tjaGF0SWRdLmZpbGVQYXRoID0gbmV3RmlsZVBhdGg7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgXG4gICAgICAgICAgdGhpcy5wbHVnaW4uZW1pdCgnY2hhdC1saXN0LXVwZGF0ZWQnKTtcblxuICAgICAgICAgIHJldHVybiB0cnVlO1xuXG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgIFxuICAgICAgICAgICBjb25zdCB0YXJnZXRQYXRoRGVzYyA9IG5ld0ZpbGVQYXRoID8/IG5vcm1OZXdGb2xkZXJQYXRoOyBcbiAgICAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09ICdFUEVSTScgfHwgZXJyb3IuY29kZSA9PT0gJ0VBQ0NFUycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYFBlcm1pc3Npb24gZXJyb3IgbW92aW5nIGNoYXQgZmlsZS5gKTtcbiAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShgRmFpbGVkIHRvIG1vdmUgY2hhdDogJHtlcnJvci5tZXNzYWdlIHx8IFwiVW5rbm93biBlcnJvclwifWApO1xuICAgICAgICAgICB9XG4gICAgICAgICAgIFxuICAgICAgICAgICBhd2FpdCB0aGlzLnJlYnVpbGRJbmRleEZyb21GaWxlcygpO1xuICAgICAgICAgICB0aGlzLnBsdWdpbi5lbWl0KCdjaGF0LWxpc3QtdXBkYXRlZCcpO1xuICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gIH1cbiAgXG4gIC8qKlxuICAgKiDQoNC10ZTRgdGC0YDRg9GUINGA0LXQt9C+0LvQstC10YAg0LTQu9GPINC/0L7QtNGW0ZcgbWVzc2FnZS1hZGRlZC5cbiAgICog0KbQtdC5INC80LXRgtC+0LQg0LLQuNC60LvQuNC60LDRgtC40LzQtdGC0YzRgdGPINC3IE9sbGFtYVZpZXcg0L/QtdGA0LXQtCDRgtC40LwsINGP0LogQ2hhdE1hbmFnZXIg0LTQvtC00LDRgdGC0Ywg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPLlxuICAgKi9cbiAgcHVibGljIHJlZ2lzdGVySE1BUmVzb2x2ZXIodGltZXN0YW1wTXM6IG51bWJlciwgcmVzb2x2ZTogKCkgPT4gdm9pZCwgcmVqZWN0OiAocmVhc29uPzogYW55KSA9PiB2b2lkKTogdm9pZCB7XG4gICAgaWYgKHRoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmhhcyh0aW1lc3RhbXBNcykpIHtcbiAgICAgICAgICB9XG4gICAgdGhpcy5tZXNzYWdlQWRkZWRSZXNvbHZlcnMuc2V0KHRpbWVzdGFtcE1zLCB7IHJlc29sdmUsIHJlamVjdCB9KTtcbiAgICAgIH1cblxuICAvKipcbiAgICog0JLQuNC60LvQuNC60LDRlCDRgtCwINCy0LjQtNCw0LvRj9GUINGA0LXQt9C+0LvQstC10YAg0LTQu9GPINC/0L7QtNGW0ZcgbWVzc2FnZS1hZGRlZC5cbiAgICog0KbQtdC5INC80LXRgtC+0LQg0LLQuNC60LvQuNC60LDRgtC40LzQtdGC0YzRgdGPINC3IE9sbGFtYVZpZXcuaGFuZGxlTWVzc2FnZUFkZGVkLlxuICAgKi9cbiAgcHVibGljIGludm9rZUhNQVJlc29sdmVyKHRpbWVzdGFtcE1zOiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCByZXNvbHZlclBhaXIgPSB0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5nZXQodGltZXN0YW1wTXMpO1xuICAgIGlmIChyZXNvbHZlclBhaXIpIHtcbiAgICAgICAgICAgIHJlc29sdmVyUGFpci5yZXNvbHZlKCk7XG4gICAgICB0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5kZWxldGUodGltZXN0YW1wTXMpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgfVxuICB9XG4gIFxuICBwdWJsaWMgcmVqZWN0QW5kQ2xlYXJITUFSZXNvbHZlcih0aW1lc3RhbXBNczogbnVtYmVyLCByZWFzb246IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IHJlc29sdmVyUGFpciA9IHRoaXMubWVzc2FnZUFkZGVkUmVzb2x2ZXJzLmdldCh0aW1lc3RhbXBNcyk7XG4gICAgaWYgKHJlc29sdmVyUGFpcikge1xuICAgICAgICAgICAgICAgIHJlc29sdmVyUGFpci5yZWplY3QobmV3IEVycm9yKHJlYXNvbikpO1xuICAgICAgICB0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5kZWxldGUodGltZXN0YW1wTXMpO1xuICAgIH1cbiAgfVxuXG5cbiAgLyoqXG4gICAqINCU0L7QtNCw0ZQg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINC60L7RgNC40YHRgtGD0LLQsNGH0LAg0LTQviDQsNC60YLQuNCy0L3QvtCz0L4g0YfQsNGC0YMsINC30LHQtdGA0ZbQs9Cw0ZQg0LnQvtCz0L4sXG4gICAqINCz0LXQvdC10YDRg9GUINC/0L7QtNGW0Y4gXCJtZXNzYWdlLWFkZGVkXCIgKNC00LvRjyBPbGxhbWFWaWV3LmhhbmRsZU1lc3NhZ2VBZGRlZClcbiAgICog0YLQsCDQv9C+0LLQtdGA0YLQsNGUINC/0YDQvtC80ZbRgSwg0Y/QutC40Lkg0LLQuNGA0ZbRiNGD0ZTRgtGM0YHRjywg0LrQvtC70LggaGFuZGxlTWVzc2FnZUFkZGVkINC30LDQstC10YDRiNC40YLRjCDRgNC10L3QtNC10YDQuNC90LMuXG4gICAqIEBwYXJhbSBjb250ZW50INCS0LzRltGB0YIg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINC60L7RgNC40YHRgtGD0LLQsNGH0LAuXG4gICAqIEBwYXJhbSB0aW1lc3RhbXAg0JzRltGC0LrQsCDRh9Cw0YHRgyDQv9C+0LLRltC00L7QvNC70LXQvdC90Y8uXG4gICAqIEBwYXJhbSByZXF1ZXN0VGltZXN0YW1wSWQg0KPQvdGW0LrQsNC70YzQvdC40LkgSUQg0LfQsNC/0LjRgtGDINC00LvRjyDQu9C+0LPRg9Cy0LDQvdC90Y8uXG4gICAqIEByZXR1cm5zINCf0YDQvtC80ZbRgSwg0YnQviDQstC40YDRltGI0YPRlNGC0YzRgdGPINC/0ZbRgdC70Y8g0YDQtdC90LTQtdGA0LjQvdCz0YMsINCw0LHQviBudWxsLCDRj9C60YnQviDRgdGC0LDQu9Cw0YHRjyDQv9C+0LzQuNC70LrQsC5cbiAgICovXG4gIHB1YmxpYyBhc3luYyBhZGRVc2VyTWVzc2FnZUFuZEF3YWl0UmVuZGVyKFxuICAgIGNvbnRlbnQ6IHN0cmluZyxcbiAgICB0aW1lc3RhbXA6IERhdGUsXG4gICAgcmVxdWVzdFRpbWVzdGFtcElkOiBudW1iZXIgXG4gICk6IFByb21pc2U8TWVzc2FnZSB8IG51bGw+IHtcbiAgICBjb25zdCBhY3RpdmVDaGF0ID0gYXdhaXQgdGhpcy5nZXRBY3RpdmVDaGF0KCk7IFxuICAgIGlmICghYWN0aXZlQ2hhdCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgbWVzc2FnZVRpbWVzdGFtcE1zID0gdGltZXN0YW1wLmdldFRpbWUoKTtcbiAgICBjb25zdCB1c2VyTWVzc2FnZTogTWVzc2FnZSA9IHtcbiAgICAgIHJvbGU6IFwidXNlclwiIGFzIE1lc3NhZ2VSb2xlVHlwZUZyb21UeXBlcywgXG4gICAgICBjb250ZW50LFxuICAgICAgdGltZXN0YW1wLFxuICAgIH07XG5cbiAgICAgICAgXG4gICAgY29uc3QgaG1hUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIFxuICAgICAgdGhpcy5yZWdpc3RlckhNQVJlc29sdmVyKG1lc3NhZ2VUaW1lc3RhbXBNcywgcmVzb2x2ZSwgcmVqZWN0KTtcbiAgICAgIFxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLm1lc3NhZ2VBZGRlZFJlc29sdmVycy5oYXMobWVzc2FnZVRpbWVzdGFtcE1zKSkgeyBcbiAgICAgICAgICAgIGNvbnN0IHJlYXNvbiA9IGBITUEgVGltZW91dCBmb3IgVXNlck1lc3NhZ2UgKHRzOiAke21lc3NhZ2VUaW1lc3RhbXBNc30pIGluIENoYXRNYW5hZ2VyLmA7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlamVjdEFuZENsZWFySE1BUmVzb2x2ZXIobWVzc2FnZVRpbWVzdGFtcE1zLCByZWFzb24pO1xuICAgICAgICB9XG4gICAgICB9LCAxMDAwMCk7IFxuICAgIH0pO1xuXG4gICAgXG4gICAgXG4gICAgY29uc3QgYWRkZWRNZXNzYWdlID0gYXdhaXQgdGhpcy5hZGRNZXNzYWdlVG9BY3RpdmVDaGF0UGF5bG9hZCh1c2VyTWVzc2FnZSwgdHJ1ZSk7XG4gICAgaWYgKCFhZGRlZE1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlamVjdEFuZENsZWFySE1BUmVzb2x2ZXIobWVzc2FnZVRpbWVzdGFtcE1zLCBcIkZhaWxlZCB0byBhZGQgbWVzc2FnZSBwYXlsb2FkIHRvIENoYXRNYW5hZ2VyLlwiKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIFxuICAgICAgICBcbiAgICB0cnkge1xuICAgICAgICBhd2FpdCBobWFQcm9taXNlO1xuICAgICAgICAgICAgICAgIHJldHVybiB1c2VyTWVzc2FnZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICByZXR1cm4gbnVsbDsgXG4gICAgfVxuICB9XG4gIFxufSBcbiJdfQ==