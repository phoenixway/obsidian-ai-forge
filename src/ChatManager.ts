// ChatManager.ts
import { App, Notice, DataAdapter, normalizePath, TFolder } from "obsidian";
import OllamaPlugin from "./main";
import { Chat, ChatMetadata, ChatData, ChatConstructorSettings } from "./Chat";
import { MessageRole, Message } from './OllamaView';
import * as path from 'path'; // Додаємо імпорт path

// Ключі для зберігання даних плагіна
const SESSIONS_INDEX_KEY = 'chatSessionsIndex_v1'; // Key for storing index in plugin data
const ACTIVE_SESSION_ID_KEY = 'activeChatSessionId_v1'; // Key for storing active ID

// Інтерфейси
interface ChatSessionIndex {
    [id: string]: Omit<ChatMetadata, 'id'>; // Store metadata without repeating ID as key
}
export interface RoleInfo {
    name: string;
    path: string;
    isCustom: boolean;
}

export class ChatManager {
    private plugin: OllamaPlugin;
    private app: App;
    private adapter: DataAdapter; // Obsidian Vault Adapter
    private chatsFolderPath: string = "/"; // Шлях до папки чатів В СХОВИЩІ
    private sessionIndex: ChatSessionIndex = {}; // In-memory index of available chats {id: metadata}
    private activeChatId: string | null = null;
    private loadedChats: Record<string, Chat> = {}; // Cache for loaded Chat objects
    public filePlanExists: boolean = false; // Стан файлу плану
    public fileUrgentTasks: string[] = [];  // Термінові завдання з файлу
    public fileRegularTasks: string[] = []; // Звичайні завдання з файлу

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.adapter = plugin.app.vault.adapter;
        this.updateChatsFolderPath();
        console.log(`[ChatManager] Initialized. Base path set to: ${this.chatsFolderPath}`);
    }

    /**
     * Оновлює внутрішній шлях `chatsFolderPath` на основі поточних налаштувань плагіна.
     */
    updateChatsFolderPath(): void {
        const settingsPath = this.plugin.settings.chatHistoryFolderPath?.trim();
        this.chatsFolderPath = (settingsPath) ? normalizePath(settingsPath) : "/";
        console.log(`[ChatManager] Updated chatsFolderPath to: ${this.chatsFolderPath}`);
    }

    /** Оновлює стан завдань на основі даних, отриманих з плагіна. */
    updateTaskState(tasks: { urgent: string[], regular: string[], hasContent: boolean } | null) {
        if (tasks) {
            this.filePlanExists = tasks.hasContent;
            this.fileUrgentTasks = [...tasks.urgent];
            this.fileRegularTasks = [...tasks.regular];
            // console.log(`[ChatManager] Updated task state. Plan exists: ${this.filePlanExists}, Urgent: ${this.fileUrgentTasks.length}, Regular: ${this.fileRegularTasks.length}`);
        } else {
            this.filePlanExists = false;
            this.fileUrgentTasks = [];
            this.fileRegularTasks = [];
            // console.log(`[ChatManager] Cleared task state.`);
        }
    }

    /**
     * Ініціалізує ChatManager: оновлює шлях, перевіряє папку, завантажує індекс та активний ID.
     */
    async initialize(): Promise<void> {
        console.log("[ChatManager] Initializing...");
        this.updateChatsFolderPath();
        await this.ensureChatsFolderExists();
        await this.loadChatIndex(true); // Примусове сканування файлів при старті

        this.activeChatId = await this.plugin.loadDataKey(ACTIVE_SESSION_ID_KEY) || null;
        // console.log(`[ChatManager] Loaded activeChatId from store: ${this.activeChatId}`);

        if (this.activeChatId && !this.sessionIndex[this.activeChatId]) {
            // console.warn(`[ChatManager] Active chat ID ${this.activeChatId} not found in the refreshed index. Resetting.`);
            this.activeChatId = null;
            await this.plugin.saveDataKey(ACTIVE_SESSION_ID_KEY, null);
        } else if (this.activeChatId) {
            // console.log(`[ChatManager] Active chat ID ${this.activeChatId} confirmed in the refreshed index.`);
        }
        // console.log(`[ChatManager] Initialized. Index has ${Object.keys(this.sessionIndex).length} entries. Final Active ID: ${this.activeChatId}`);
    }

    /**
     * Гарантує існування папки для історії чатів.
     */
    private async ensureChatsFolderExists(): Promise<void> {
        if (this.chatsFolderPath === "/" || !this.chatsFolderPath) {
            return;
        }
        try {
            if (!(await this.adapter.exists(this.chatsFolderPath))) {
                // console.log(`[ChatManager] Creating chat history directory: ${this.chatsFolderPath}`);
                await this.adapter.mkdir(this.chatsFolderPath);
            } else {
                const stat = await this.adapter.stat(this.chatsFolderPath);
                if (stat?.type !== 'folder') {
                    const errorMsg = `Error: Configured chat history path '${this.chatsFolderPath}' exists but is not a folder.`;
                    console.error(`[ChatManager] ${errorMsg}`);
                    new Notice(errorMsg);
                }
            }
        } catch (error) {
            const errorMsg = `Error creating/checking chat history directory '${this.chatsFolderPath}'.`;
            console.error(`[ChatManager] ${errorMsg}`, error);
            new Notice(errorMsg);
        }
    }

    /**
     * Завантажує або оновлює індекс чатів, скануючи файли у папці історії.
     * @param forceScanFromFile Завжди true для пересканування.
     */
    private async loadChatIndex(forceScanFromFile: boolean = true): Promise<void> { // Зроблено forceScan=true за замовчуванням для initialize
        if (!forceScanFromFile) { // Ця гілка тепер рідко використовується
            const loadedIndex = await this.plugin.loadDataKey(SESSIONS_INDEX_KEY);
            this.sessionIndex = loadedIndex || {};
            // console.log(`[ChatManager] Loaded chat index from plugin data with ${Object.keys(this.sessionIndex).length} entries.`);
            return;
        }

        // console.log(`[ChatManager] Rebuilding chat index by scanning files in: ${this.chatsFolderPath}`);
        const newIndex: ChatSessionIndex = {};
        let filesScanned = 0;
        let chatsLoaded = 0;

        try {
            if (!(await this.adapter.exists(this.chatsFolderPath)) && this.chatsFolderPath !== "/") {
                console.warn(`[ChatManager] Chat history folder '${this.chatsFolderPath}' not found. Index is empty.`);
                this.sessionIndex = {};
                await this.saveChatIndex();
                return;
            }

            const listResult = await this.adapter.list(this.chatsFolderPath);
            const chatFiles = listResult.files.filter(filePath =>
                filePath.toLowerCase().endsWith('.json') // Тільки .json
            );

            filesScanned = chatFiles.length;
            this.plugin.logger.info(`[ChatManager] Found ${filesScanned} potential chat files.`);

            for (const filePath of chatFiles) {
                const fullPath = normalizePath(filePath); // list() повертає повні шляхи
                const fileName = path.basename(fullPath); // Використовуємо path.basename
                const chatId = fileName.endsWith('.json') ? fileName.slice(0, -5) : null;

                if (!chatId) {
                    console.warn(`[ChatManager] Could not extract chat ID from file path: ${fullPath}`);
                    continue;
                }

                try {
                    const jsonContent = await this.adapter.read(fullPath);
                    const data = JSON.parse(jsonContent) as Partial<ChatData>;

                    if (data?.metadata?.id && data.metadata.id === chatId) {
                        const metadata = data.metadata;
                        newIndex[chatId] = {
                            name: metadata.name,
                            modelName: metadata.modelName,
                            selectedRolePath: metadata.selectedRolePath,
                            temperature: metadata.temperature,
                            createdAt: metadata.createdAt,
                            lastModified: metadata.lastModified
                        };
                        chatsLoaded++;
                    } else {
                        console.warn(`[ChatManager] Metadata validation FAILED for file: ${fullPath}. ID mismatch or missing metadata. ChatID from filename: ${chatId}`, data?.metadata);
                    }
                } catch (e) {
                    console.error(`[ChatManager] Error reading or parsing chat file ${fullPath}:`, e);
                }
            }

            this.plugin.logger.info(`[ChatManager] Index rebuild complete. Scanned: ${filesScanned}, Loaded metadata for: ${chatsLoaded}`);
            this.sessionIndex = newIndex;
            await this.saveChatIndex();

        } catch (error) {
            this.plugin.logger.error(`[ChatManager] Critical error during index rebuild:`, error);
            this.sessionIndex = {};
            await this.saveChatIndex();
            // new Notice("Error rebuilding chat index.");
        }
    }

    /** Зберігає поточний індекс чатів у сховище плагіна. */
    private async saveChatIndex(): Promise<void> {
        // console.log(`[ChatManager] Saving chat index with ${Object.keys(this.sessionIndex).length} entries.`);
        await this.plugin.saveDataKey(SESSIONS_INDEX_KEY, this.sessionIndex);
    }

    /** Генерує повний шлях до файлу чату. */
    private getChatFilePath(id: string): string {
        const fileName = `${id}.json`;
        return (this.chatsFolderPath === "/" || !this.chatsFolderPath)
            ? normalizePath(fileName)
            : normalizePath(`${this.chatsFolderPath}/${fileName}`);
    }

    /** Зберігає дані вказаного чату у файл. */
    async saveChat(chat: Chat): Promise<boolean> {
        try {
            const filePath = this.getChatFilePath(chat.metadata.id);
            // Оновлюємо дату модифікації перед збереженням
            chat.metadata.lastModified = new Date().toISOString();
            const dataToSave: ChatData = {
                metadata: chat.metadata,
                messages: chat.getMessages()
            };
            await this.adapter.write(filePath, JSON.stringify(dataToSave, null, 2));
            // console.log(`[ChatManager] Saved chat ${chat.metadata.id} to ${filePath}`);
            // Оновлюємо індекс після збереження файлу
            this.sessionIndex[chat.metadata.id] = { ...chat.metadata };
            delete (this.sessionIndex[chat.metadata.id] as any).id;
            await this.saveChatIndex();
            // Повідомляємо про оновлення списку (змінилася дата модифікації)
            this.plugin.emit('chat-list-updated');
            return true;
        } catch (error) {
            console.error(`[ChatManager] Error saving chat ${chat.metadata.id} to ${chat.filePath}:`, error);
            new Notice(`Error saving chat: ${chat.metadata.name}`);
            return false;
        }
    }


    /** Створює новий чат. */
    async createNewChat(name?: string): Promise<Chat | null> {
        console.log("[ChatManager] Creating new chat...");
        try {
            const now = new Date();
            const newId = `chat_${now.getTime()}_${Math.random().toString(36).substring(2, 8)}`;
            const filePath = this.getChatFilePath(newId);

            const initialMetadata: ChatMetadata = {
                id: newId,
                name: name || `Chat ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, // Use locale time format
                modelName: this.plugin.settings.modelName,
                selectedRolePath: this.plugin.settings.selectedRolePath,
                temperature: this.plugin.settings.temperature,
                createdAt: now.toISOString(),
                lastModified: now.toISOString(),
            };

            const constructorSettings: ChatConstructorSettings = { ...this.plugin.settings };
            const newChat = new Chat(this.adapter, constructorSettings, { metadata: initialMetadata, messages: [] }, filePath);

            // Використовуємо saveChat для збереження та оновлення індексу
            const saved = await this.saveChat(newChat);
            if (!saved) {
                throw new Error("Failed to save initial chat file via saveChat.");
            }

            this.loadedChats[newChat.metadata.id] = newChat; // Додаємо в кеш
            await this.setActiveChat(newChat.metadata.id); // Встановлюємо активним

            // console.log(`[ChatManager] Created and activated new chat: ${newChat.metadata.name} (ID: ${newChat.metadata.id})`);
            // Подію 'chat-list-updated' тепер генерує saveChat
            return newChat;
        } catch (error) {
            console.error("[ChatManager] Error creating new chat:", error);
            new Notice("Error creating new chat session.");
            return null;
        }
    }

    /** Повертає масив метаданих всіх доступних чатів, відсортований за датою зміни. */
    listAvailableChats(): ChatMetadata[] {
        return Object.entries(this.sessionIndex).map(([id, meta]) => ({
            id,
            ...meta,
        })).sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    }

    /** Повертає ID поточного активного чату. */
    getActiveChatId(): string | null {
        return this.activeChatId;
    }

    /** Встановлює активний чат за його ID. */
    async setActiveChat(id: string | null): Promise<void> {
        // console.log(`[ChatManager] Setting active chat to ID: ${id}`);
        if (id && !this.sessionIndex[id]) {
            console.error(`[ChatManager] Attempted to set active chat to non-existent ID: ${id}. Setting to null.`);
            id = null;
        }

        if (id === this.activeChatId) {
            // console.log(`[ChatManager] Chat ${id} is already active.`);
            if (id) await this.getChat(id); // Переконуємось, що завантажено
            return;
        }

        this.activeChatId = id;
        await this.plugin.saveDataKey(ACTIVE_SESSION_ID_KEY, id);
        // console.log(`[ChatManager] Persisted active chat ID: ${id}`);

        let loadedChat: Chat | null = null;
        if (id) {
            loadedChat = await this.getChat(id);
            if (!loadedChat) {
                console.error(`[ChatManager] Failed to load chat data for newly activated ID ${id}. Resetting active chat to null.`);
                await this.setActiveChat(null); // Рекурсивний виклик для коректного скидання
                return;
            }
        }

        // console.log(`[ChatManager] Emitting 'active-chat-changed' event for ID: ${id}`);
        this.plugin.emit('active-chat-changed', { chatId: id, chat: loadedChat });
    }

    /** Отримує конкретний чат за ID (з кешу або файлу). */
    async getChat(id: string): Promise<Chat | null> {
        // console.log(`[ChatManager] getChat called for ID: ${id}`);
        if (this.loadedChats[id]) {
            // console.log(`[ChatManager] Returning chat ${id} from cache.`);
            return this.loadedChats[id];
        }
        // console.log(`[ChatManager] Chat ${id} not in cache.`);

        if (this.sessionIndex[id]) {
            const filePath = this.getChatFilePath(id);
            // console.log(`[ChatManager] Attempting to load chat ${id} from path: ${filePath}`);
            const constructorSettings: ChatConstructorSettings = { ...this.plugin.settings };
            const chat = await Chat.loadFromFile(filePath, this.adapter, constructorSettings);

            if (chat) {
                // console.log(`[ChatManager] Successfully loaded chat ${id}. Caching.`);
                this.loadedChats[id] = chat;
                return chat;
            } else {
                console.error(`[ChatManager] Failed to load chat ${id} from ${filePath}. Removing from index.`);
                delete this.sessionIndex[id];
                await this.saveChatIndex();
                if (this.activeChatId === id) {
                    await this.setActiveChat(null);
                }
                this.plugin.emit('chat-list-updated');
                return null;
            }
        }

        console.warn(`[ChatManager] Chat with ID ${id} not found in session index.`);
        return null;
    }

    /** Отримує поточний активний чат (або останній, або створює новий). */
    async getActiveChat(): Promise<Chat | null> {
        // console.log(`[ChatManager] getActiveChat called. Current activeChatId: ${this.activeChatId}`);
        if (this.activeChatId) {
            // Якщо є активний ID, спробуємо його отримати (з кешу або завантажити)
            const chat = await this.getChat(this.activeChatId);
            if (chat) return chat; // Повертаємо, якщо вдалося завантажити/знайти в кеші
            // Якщо getChat повернув null (помилка завантаження), активний ID вже скинуто,
            // тому переходимо до логіки нижче (вибір останнього або створення нового)
            console.warn(`[ChatManager] Active chat ${this.activeChatId} failed to load. Finding alternative.`);
        }

        // Якщо активного ID немає або він не завантажився
        const availableChats = this.listAvailableChats();
        if (availableChats.length > 0) {
            const mostRecentId = availableChats[0].id;
            // console.log(`[ChatManager] No active chat set or load failed. Setting most recent as active: ID ${mostRecentId}`);
            await this.setActiveChat(mostRecentId);
            // Потрібно повернути результат setActiveChat (який може бути null, якщо і цей чат не завантажиться)
            return this.activeChatId ? this.loadedChats[this.activeChatId] : null;
        } else {
            // console.log("[ChatManager] No available chats exist. Creating a new one.");
            return await this.createNewChat();
        }
    }

    /** Додає повідомлення до активного чату. */
    async addMessageToActiveChat(role: MessageRole, content: string): Promise<Message | null> {
        const activeChat = await this.getActiveChat();
        if (activeChat) {
            const newMessage = activeChat.addMessage(role, content);
            // console.log(`[ChatManager] Added ${role} message to active chat ${activeChat.metadata.id}.`);
            // saveChat викликається через debouncedSave в Chat.addMessage,
            // але нам потрібно оновити індекс (дату модифікації) та викликати подію одразу.
            this.sessionIndex[activeChat.metadata.id].lastModified = new Date().toISOString();
            await this.saveChatIndex(); // Зберігаємо індекс
            this.plugin.emit('message-added', { chatId: activeChat.metadata.id, message: newMessage });
            this.plugin.emit('chat-list-updated'); // Оновлюємо список чатів через зміну дати
            return newMessage;
        } else {
            console.error("[ChatManager] Cannot add message, no active chat.");
            new Notice("Error: No active chat session to add message to.");
            return null;
        }
    }

    /** Очищує історію повідомлень активного чату. */
    async clearActiveChatMessages(): Promise<void> {
        const activeChat = await this.getActiveChat();
        if (activeChat) {
            activeChat.clearMessages(); // Цей метод має викликати saveChat
            // console.log(`[ChatManager] Messages cleared for active chat: ${activeChat.metadata.id}`);
            this.plugin.emit('messages-cleared', activeChat.metadata.id);
        } else {
            console.warn("[ChatManager] Cannot clear messages, no active chat.");
            new Notice("No active chat to clear.");
        }
    }

    /** Оновлює метадані активного чату та генерує відповідні події. */
    // ChatManager.ts

    /** Оновлює метадані активного чату та генерує відповідні події. */
    async updateActiveChatMetadata(metadataUpdate: Partial<Omit<ChatMetadata, 'id' | 'createdAt'>>): Promise<boolean> {
        const activeChat = await this.getActiveChat();
        if (!activeChat) {
            console.warn("[ChatManager] Cannot update metadata, no active chat.");
            new Notice("No active chat to update metadata for.");
            return false;
        }

        // console.log(`[ChatManager] Updating metadata for active chat ${activeChat.metadata.id}:`, metadataUpdate);

        // Зберігаємо старі значення ДО оновлення для порівняння
        const oldRolePath = activeChat.metadata.selectedRolePath;
        const oldModelName = activeChat.metadata.modelName;

        // Застосовуємо оновлення до об'єкта Chat в пам'яті
        activeChat.updateMetadata(metadataUpdate); // Оновлює і lastModified

        // Зберігаємо оновлений чат у файл (saveChat оновить індекс та викличе chat-list-updated)
        const saved = await this.saveChat(activeChat);

        if (saved) {
            // Подію 'chat-list-updated' вже згенерував saveChat

            const newRolePath = activeChat.metadata.selectedRolePath;
            const newModelName = activeChat.metadata.modelName;

            // --- ГЕНЕРАЦІЯ ПОДІЇ ROLE-CHANGED ---
            // Перевіряємо, чи поле selectedRolePath БУЛО в об'єкті -> metadataUpdate <-
            // І чи нове значення відрізняється від старого
            // --- ВИПРАВЛЕНО: Використовуємо metadataUpdate ---
            if (metadataUpdate.selectedRolePath !== undefined && oldRolePath !== newRolePath) {
                try {
                    const newRoleName = this.plugin.findRoleNameByPath(newRolePath);
                    // console.log(`[ChatManager] Emitting 'role-changed' event with name: ${newRoleName}`);
                    this.plugin.emit('role-changed', newRoleName);
                    this.plugin.promptService?.clearRoleCache?.();
                } catch (e) {
                    console.error("[ChatManager] Error finding role name or emitting role-changed event:", e);
                }
            }
            // --- КІНЕЦЬ ВИПРАВЛЕННЯ ---

            // --- ГЕНЕРАЦІЯ ПОДІЇ MODEL-CHANGED ---
            // Перевіряємо, чи поле modelName БУЛО в -> metadataUpdate <-
            // І чи нове значення відрізняється від старого
            // --- ВИПРАВЛЕНО: Використовуємо metadataUpdate ---
            if (metadataUpdate.modelName !== undefined && oldModelName !== newModelName) {
                // console.log(`[ChatManager] Emitting 'model-changed' event with name: ${newModelName}`);
                this.plugin.emit('model-changed', newModelName);
                this.plugin.promptService?.clearModelDetailsCache?.();
            }
            // --- КІНЕЦЬ ВИПРАВЛЕННЯ ---


            // Генеруємо 'active-chat-changed', щоб View оновив усі аспекти
            this.plugin.emit('active-chat-changed', { chatId: this.activeChatId, chat: activeChat });

            return true;
        } else {
            console.error(`[ChatManager] Failed to save chat file after metadata update for ${activeChat.metadata.id}.`);
            new Notice("Error saving chat after metadata update.");
            return false;
        }
    }

    // ... (решта коду ChatManager) ...

    /** Видаляє чат за ID. */
    async deleteChat(id: string): Promise<boolean> {
        // console.log(`[ChatManager] Attempting to delete chat ID: ${id}`);
        const filePath = this.getChatFilePath(id);
        let deletedFile = false;

        try {
            if (await this.adapter.exists(filePath)) {
                await this.adapter.remove(filePath);
                // console.log(`[ChatManager] Deleted chat file: ${filePath}`);
            } else {
                console.warn(`[ChatManager] Chat file not found, assuming already deleted: ${filePath}`);
            }
            deletedFile = true; // Вважаємо успішним, якщо файлу немає або його видалено
        } catch (error) {
            console.error(`[ChatManager] Error deleting chat file ${filePath}:`, error);
            new Notice(`Error deleting chat file for ID ${id}.`);
            // Незважаючи на помилку видалення файлу, спробуємо видалити з індексу
            deletedFile = false; // Позначаємо як помилку видалення файлу
        }

        // Видаляємо з індексу та кешу незалежно від успіху видалення файлу,
        // якщо чат був в індексі
        if (this.sessionIndex[id]) {
            delete this.sessionIndex[id];
            delete this.loadedChats[id];
            await this.saveChatIndex();
            // console.log(`[ChatManager] Removed chat ${id} from index and cache.`);

            if (this.activeChatId === id) {
                // console.log(`[ChatManager] Deleted chat was active. Selecting new active chat...`);
                const available = this.listAvailableChats();
                const nextActiveId = available.length > 0 ? available[0].id : null;
                await this.setActiveChat(nextActiveId);
            }
            this.plugin.emit('chat-list-updated');
            return true; // Повертаємо true, бо запис з індексу видалено
        } else {
            console.warn(`[ChatManager] Chat ${id} not found in index while trying to delete.`);
            return deletedFile; // Повертаємо результат видалення файлу, якщо запису в індексі і не було
        }
    }

    /** Перейменовує чат за ID. */
    async renameChat(id: string, newName: string): Promise<boolean> {
        const trimmedName = newName.trim();
        if (!trimmedName) { new Notice("Chat name cannot be empty."); return false; }

        if (!this.sessionIndex[id]) {
            console.warn(`[ChatManager] Cannot rename chat ${id}: Not found in index.`);
            new Notice(`Chat with ID ${id} not found.`);
            return false;
        }

        console.log(`[ChatManager] Renaming chat ${id} to "${trimmedName}"`);
        // Завантажуємо чат перед зміною (з кешу або файлу)
        const chatToRename = await this.getChat(id);
        if (!chatToRename) {
            console.error(`[ChatManager] Failed to load chat ${id} for renaming.`);
            new Notice(`Error loading chat data for rename.`);
            return false;
        }

        // Оновлюємо метадані в об'єкті Chat (це оновить і lastModified)
        chatToRename.updateMetadata({ name: trimmedName });

        // Зберігаємо оновлений чат у файл (saveChat оновить і індекс)
        const saved = await this.saveChat(chatToRename);

        if (saved) {
            // console.log(`[ChatManager] Finished renaming chat ${id}`);
            // Подію 'chat-list-updated' вже згенерує saveChat
            new Notice(`Chat renamed to "${trimmedName}"`); // Додамо сповіщення про успіх
            return true;
        } else {
            console.error(`[ChatManager] Failed to save renamed chat file for ${id}.`);
            new Notice(`Error saving renamed chat ${trimmedName}.`);
            return false;
        }
    }

    /** Створює копію існуючого чату. */
    async cloneChat(chatIdToClone: string): Promise<Chat | null> {
        // console.log(`[ChatManager] Cloning chat ID: ${chatIdToClone}`);
        const originalChat = await this.getChat(chatIdToClone);
        if (!originalChat) {
            console.error(`[ChatManager] Cannot clone: Original chat ${chatIdToClone} not found.`);
            new Notice("Original chat not found for cloning.");
            return null;
        }

        try {
            const now = new Date();
            const newId = `chat_${now.getTime()}_${Math.random().toString(36).substring(2, 8)}`;
            const newFilePath = this.getChatFilePath(newId);

            const originalMetadata = originalChat.metadata;
            const clonedMetadata: ChatMetadata = {
                ...originalMetadata,
                id: newId,
                name: `Copy of ${originalMetadata.name}`,
                createdAt: now.toISOString(),
                lastModified: now.toISOString(),
            };

            const clonedChatData: ChatData = {
                metadata: clonedMetadata,
                messages: originalChat.getMessages().map(msg => ({ ...msg }))
            };

            const constructorSettings: ChatConstructorSettings = { ...this.plugin.settings };
            const clonedChat = new Chat(this.adapter, constructorSettings, clonedChatData, newFilePath);

            // Зберігаємо клон (saveChat оновить індекс та викличе подію)
            const saved = await this.saveChat(clonedChat);
            if (!saved) {
                throw new Error("Failed to save the cloned chat file.");
            }

            this.loadedChats[clonedChat.metadata.id] = clonedChat; // Додаємо в кеш
            await this.setActiveChat(clonedChat.metadata.id); // Активуємо клон

            // console.log(`[ChatManager] Cloned chat "${clonedChat.metadata.name}" created and activated.`);
            return clonedChat;

        } catch (error) {
            console.error("[ChatManager] Error cloning chat:", error);
            new Notice("An error occurred while cloning the chat.");
            return null;
        }
    }

} // End of ChatManager class