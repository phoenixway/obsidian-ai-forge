// ChatManager.ts
import { App, Notice, DataAdapter, normalizePath } from "obsidian";
import OllamaPlugin from "./main";
import { Chat, ChatMetadata, ChatData, ChatConstructorSettings } from "./Chat"; // Import Chat class and types
import { MessageRole, Message } from './OllamaView';

const SESSIONS_INDEX_KEY = 'chatSessionsIndex_v1'; // Key for storing index in plugin data
const ACTIVE_SESSION_ID_KEY = 'activeChatSessionId_v1'; // Key for storing active ID
const CHATS_DIR_NAME = 'chats'; // Subdirectory within plugin folder for chat files

interface ChatSessionIndex {
    [id: string]: Omit<ChatMetadata, 'id'>; // Store metadata without repeating ID as key
}

export interface RoleInfo { name: string; path: string; isCustom: boolean; }


export class ChatManager {
    private plugin: OllamaPlugin;
    private app: App;
    private adapter: DataAdapter;
    private chatsFolderPath: string;
    private sessionIndex: ChatSessionIndex = {}; // In-memory index of available chats {id: metadata}
    private activeChatId: string | null = null;
    private loadedChats: Record<string, Chat> = {}; // Cache for loaded Chat objects

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.adapter = plugin.app.vault.adapter;
        this.chatsFolderPath = normalizePath(`${this.plugin.manifest.dir}/${CHATS_DIR_NAME}`);
    }

    async initialize(): Promise<void> {
        await this.ensureChatsFolderExists();
        await this.loadChatIndex();
        this.activeChatId = await this.plugin.loadDataKey(ACTIVE_SESSION_ID_KEY) || null;
        // Validate activeChatId exists in index
        if (this.activeChatId && !this.sessionIndex[this.activeChatId]) {
            console.warn(`[ChatManager] Active chat ID ${this.activeChatId} not found in index. Resetting.`);
            this.activeChatId = null;
            await this.plugin.saveDataKey(ACTIVE_SESSION_ID_KEY, null);
        }
        console.log(`[ChatManager] Initialized. Found ${Object.keys(this.sessionIndex).length} chats in index. Active ID: ${this.activeChatId}`);
    }

    private async ensureChatsFolderExists(): Promise<void> {
        try {
            if (!(await this.adapter.exists(this.chatsFolderPath))) {
                await this.adapter.mkdir(this.chatsFolderPath);
                console.log(`[ChatManager] Created chats directory: ${this.chatsFolderPath}`);
            }
        } catch (error) {
            console.error(`[ChatManager] Error creating chats directory ${this.chatsFolderPath}:`, error);
            new Notice("Fatal Error: Could not create chat storage directory. Chat history may not work.");
        }
    }

    private async loadChatIndex(): Promise<void> {
        const loadedIndex = await this.plugin.loadDataKey(SESSIONS_INDEX_KEY);
        this.sessionIndex = loadedIndex || {};
        // Optional: Prune index - check if files still exist? Could be slow.
    }

    private async saveChatIndex(): Promise<void> {
        await this.plugin.saveDataKey(SESSIONS_INDEX_KEY, this.sessionIndex);
    }

    private getChatFilePath(id: string): string {
        // Uses the manager's base path and the chat ID as filename
        return normalizePath(`${this.chatsFolderPath}/${id}.json`);
    }

    /**
     * Creates a new chat session, saves it, updates the index, and sets it as active.
     */
    async createNewChat(name?: string): Promise<Chat | null> {
        try {
            // Create instance (constructor handles ID and initial metadata based on global settings)
            const newChat = new Chat(this.adapter, this.plugin.settings);
            if (name) {
                newChat.metadata.name = name; // Set name if provided
            }
            // Save the initial state to create the file
            const saved = await newChat.saveImmediately(); // Негайне збереження для створення файлу
            if (!saved) {
                throw new Error("Failed to save initial chat file.");
            }

            // Update index
            this.sessionIndex[newChat.metadata.id] = { ...newChat.metadata }; // Store copy of metadata
            delete (this.sessionIndex[newChat.metadata.id] as any).id; // Remove redundant ID from value
            await this.saveChatIndex();

            // Cache the loaded chat
            this.loadedChats[newChat.metadata.id] = newChat;

            // Set as active
            await this.setActiveChat(newChat.metadata.id);

            console.log(`[ChatManager] Created new chat: ${newChat.metadata.name} (ID: ${newChat.metadata.id})`);
            this.plugin.emit('chat-list-updated'); // Notify UI about changes
            return newChat;
        } catch (error) {
            console.error("[ChatManager] Error creating new chat:", error);
            new Notice("Error creating new chat session.");
            return null;
        }
    }

    /**
     * Gets the metadata for all available chat sessions.
     */
    listAvailableChats(): ChatMetadata[] {
        // Return metadata directly from the index, adding the ID back
        return Object.entries(this.sessionIndex).map(([id, meta]) => ({
            id,
            ...meta,
        })).sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()); // Sort newest first
    }

    /**
    * Gets the currently active Chat ID.
    */
    getActiveChatId(): string | null {
        return this.activeChatId;
    }
    /**
       * Sets the active chat session ID, persists it, loads the chat into cache,
       * and emits an 'active-chat-changed' event with the chat data.
       */
    async setActiveChat(id: string | null): Promise<void> {
        // 1. Validate ID (only if setting a non-null ID)
        if (id && !this.sessionIndex[id]) {
            console.error(`[ChatManager] Attempted to set active chat to non-existent ID: ${id}. Setting to null.`);
            id = null; // Fallback to no active chat if ID is invalid
        }

        // 2. Check if ID is actually changing
        if (id === this.activeChatId) {
            // If the same ID is being set again, ensure the chat is loaded into cache
            // console.log(`[ChatManager] Chat ${id} is already active.`);
            if (id) await this.getChat(id); // Ensure loaded
            return; // No further action needed
        }

        // 3. Update internal state and persist the active ID
        this.activeChatId = id;
        await this.plugin.saveDataKey(ACTIVE_SESSION_ID_KEY, id);
        console.log(`[ChatManager] Active chat ID set to: ${id}`);

        // 4. Load the newly activated chat into cache (if not null)
        let loadedChat: Chat | null = null;
        if (id) {
            loadedChat = await this.getChat(id); // getChat handles loading and caching
            if (!loadedChat) {
                // If loading failed (e.g., file missing/corrupt), reset active ID to null
                console.error(`[ChatManager] Failed to load the chat data for newly activated ID ${id}. Resetting active chat.`);
                // Recursive call to properly handle setting active chat to null
                await this.setActiveChat(null);
                return; // Stop execution here
            }
        }

        // 5. Emit the event with the chatId and the loaded chat object (or null)
        // The listener in main.ts will handle updating global settings and promptService state.
        this.plugin.emit('active-chat-changed', { chatId: id, chat: loadedChat });
    }

    /**
        * Retrieves a specific chat session, loading it from file if necessary.
        */
    async getChat(id: string): Promise<Chat | null> {
        if (this.loadedChats[id]) {
            return this.loadedChats[id]; // Повертаємо з кешу
        }
        if (this.sessionIndex[id]) {
            const filePath = this.getChatFilePath(id);
            // --- ДОДАНО: Створення розширених налаштувань ---
            const fullSettings: ChatConstructorSettings = {
                ...this.plugin.settings,
                pluginFolder: this.plugin.manifest.dir,
                chatsFolderName: CHATS_DIR_NAME
            };
            // ---------------------------------------------
            // Передаємо розширені налаштування в loadFromFile
            const chat = await Chat.loadFromFile(filePath, this.adapter, fullSettings);
            if (chat) {
                this.loadedChats[id] = chat; // Додаємо в кеш
                return chat;
            } else {
                // Помилка завантаження файлу, видаляємо з індексу
                console.error(`[ChatManager] Failed to load chat ${id}, removing from index.`);
                delete this.sessionIndex[id];
                await this.saveChatIndex();
                if (this.activeChatId === id) await this.setActiveChat(null);
                this.plugin.emit('chat-list-updated');
                return null;
            }
        }
        console.warn(`[ChatManager] Chat with ID ${id} not found in index.`);
        return null;
    }

    /**
     * Retrieves the currently active chat session.
     */
    async getActiveChat(): Promise<Chat | null> {
        if (!this.activeChatId) {
            // If no active chat, maybe load the most recent one or create a new one?
            // For now, return null. UI should handle this (e.g., prompt to create/select).
            const availableChats = this.listAvailableChats();
            if (availableChats.length > 0) {
                console.log("[ChatManager] No active chat set, loading most recent.");
                await this.setActiveChat(availableChats[0].id); // Load most recent
                return this.loadedChats[availableChats[0].id] ?? null;
            } else {
                console.log("[ChatManager] No active chat and no chats exist. Creating new one.");
                return await this.createNewChat(); // Create a new one if none exist
            }
        }
        return this.getChat(this.activeChatId);
    }

    /**
    * Adds a message to the currently active chat.
    * Handles saving the chat session (debounced).
    */
    async addMessageToActiveChat(role: MessageRole, content: string): Promise<Message | null> {
        const activeChat = await this.getActiveChat(); // Ensures active chat is loaded
        if (activeChat) {
            const newMessage = activeChat.addMessage(role, content); // addMessage triggers debounced save
            // Update metadata in index immediately (for lastModified)
            this.sessionIndex[activeChat.metadata.id] = { ...activeChat.metadata };
            delete (this.sessionIndex[activeChat.metadata.id] as any).id;
            this.saveChatIndex(); // Save index quickly
            this.plugin.emit('message-added', { chatId: activeChat.metadata.id, message: newMessage }); // Notify UI
            return newMessage;
        } else {
            console.error("[ChatManager] Cannot add message, no active chat found or loaded.");
            new Notice("Error: No active chat session to add message to.");
            return null;
        }
    }

    /**
    * Clears messages from the currently active chat.
    */
    async clearActiveChatMessages(): Promise<void> {
        const activeChat = await this.getActiveChat();
        if (activeChat) {
            activeChat.clearMessages(); // clearMessages triggers save
            console.log(`[ChatManager] Messages cleared for active chat: ${activeChat.metadata.id}`);
            this.plugin.emit('messages-cleared', activeChat.metadata.id); // Notify UI
        } else {
            console.warn("[ChatManager] Cannot clear messages, no active chat.");
        }
    }

    /**
   * Updates metadata for the currently active chat.
   */
    async updateActiveChatMetadata(updates: Partial<Omit<ChatMetadata, 'id' | 'createdAt' | 'filePath'>>): Promise<void> {
        const activeChat = await this.getActiveChat();
        if (activeChat) {
            activeChat.updateMetadata(updates); // updateMetadata triggers save
            // Update index as well
            this.sessionIndex[activeChat.metadata.id] = { ...activeChat.metadata };
            delete (this.sessionIndex[activeChat.metadata.id] as any).id;
            await this.saveChatIndex();
            this.plugin.emit('chat-list-updated'); // Notify UI of metadata change
        } else {
            console.warn("[ChatManager] Cannot update metadata, no active chat.");
        }
    }


    /**
     * Deletes a chat session by ID.
     */
    async deleteChat(id: string): Promise<boolean> {
        const chatToDelete = await this.getChat(id); // Load it first to ensure file path is known
        if (!chatToDelete) {
            console.warn(`[ChatManager] Cannot delete chat ${id}: Not found.`);
            // Maybe it's only in the index? Remove from index anyway.
            if (this.sessionIndex[id]) {
                delete this.sessionIndex[id];
                await this.saveChatIndex();
                this.plugin.emit('chat-list-updated');
                return true; // Considered deleted if not found
            }
            return false;
        }

        const deletedFile = await chatToDelete.deleteFile();
        if (deletedFile) {
            delete this.sessionIndex[id];
            delete this.loadedChats[id]; // Remove from cache
            await this.saveChatIndex();
            console.log(`[ChatManager] Deleted chat ${id}`);
            // If the deleted chat was active, select another one (e.g., most recent or null)
            if (this.activeChatId === id) {
                const available = this.listAvailableChats();
                await this.setActiveChat(available.length > 0 ? available[0].id : null);
            }
            this.plugin.emit('chat-list-updated'); // Notify UI
            return true;
        }
        return false;
    }

    /**
     * Renames a chat session.
     */
    async renameChat(id: string, newName: string): Promise<boolean> {
        if (this.sessionIndex[id]) {
            this.sessionIndex[id].name = newName.trim();
            this.sessionIndex[id].lastModified = new Date().toISOString();
            await this.saveChatIndex();
            // Update loaded chat if cached
            if (this.loadedChats[id]) {
                this.loadedChats[id].metadata.name = newName.trim();
                this.loadedChats[id].metadata.lastModified = this.sessionIndex[id].lastModified;
                this.loadedChats[id].save(); // Save the change to the chat file itself
            }
            console.log(`[ChatManager] Renamed chat ${id} to "${newName.trim()}"`);
            this.plugin.emit('chat-list-updated');
            return true;
        }
        console.warn(`[ChatManager] Cannot rename chat ${id}: Not found in index.`);
        return false;
    }



}