// Chat.ts
import { normalizePath, DataAdapter, Notice, debounce } from "obsidian";
import { MessageRole } from "./OllamaView"; // Assuming OllamaView exports these
import { OllamaPluginSettings } from "./settings"; // Assuming settings exports this
import { Logger } from "./Logger";
import { Message } from "./types";

/**
 * Type definition for settings relevant to the Chat constructor.
 * Currently, it includes all plugin settings, but could be narrowed down if needed.
 */
export type ChatConstructorSettings = OllamaPluginSettings;

/**
 * Metadata associated with a chat session.
 */
export interface ChatMetadata {
    id: string;
    name: string;
    modelName?: string;          // <-- Зробити опціональним
    selectedRolePath?: string;   // <-- Зробити опціональним
    temperature?: number;        // <-- Зробити опціональним
    createdAt: string;          // Залишити обов'язковим
    lastModified: string;       // Залишити обов'язковим
    contextWindow?: number;      // <-- Вже опціональне (з попереднього кроку)
}

/**
 * Structure for storing chat data, including metadata and messages.
 * Used for saving/loading to/from JSON.
 */
export interface ChatData {
    metadata: ChatMetadata;
    messages: Message[]; // Messages are stored with ISO timestamp strings in JSON
}

/**
 * Represents a single chat session, managing its metadata, messages,
 * and persistence to a file within the Obsidian vault.
 */
export class Chat {
    public metadata: ChatMetadata;          // Chat metadata
    public messages: Message[];             // Array of message objects (with Date timestamps)
    public filePath: string;                // Full, normalized path to the chat's .json file in the vault
    private adapter: DataAdapter;          // Obsidian's DataAdapter for file operations
    private pluginSettings: ChatConstructorSettings; // Relevant plugin settings
    private debouncedSave: () => void;     // Debounced function for saving
    private logger: Logger; // Додати властивість
    
    /**
     * Creates an instance of Chat. Should be called by ChatManager.
     * @param adapter - Obsidian's DataAdapter.
     * @param settings - Plugin settings relevant for chat operation.
     * @param data - The initial chat data (metadata and messages).
     * @param filePath - The full, normalized path where this chat should be saved/loaded from within the vault. **Required**.
     */
    constructor(
        adapter: DataAdapter,
        settings: ChatConstructorSettings,
        data: ChatData,
        filePath: string,
        logger: Logger // Додати параметр
    ) {
        this.adapter = adapter;
        this.pluginSettings = settings;
        this.filePath = normalizePath(filePath);
        this.metadata = data.metadata;
        this.messages = data.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
        this.logger = logger; // Зберегти логер

        
        this.debouncedSave = debounce(this._saveToFile.bind(this), 1500, true);
    }

    // --- Message Management ---

    /**
     * Adds a new message to the chat history.
     * Updates the lastModified timestamp and triggers a debounced save.
     * @param role - The role of the message sender ('user', 'assistant', etc.).
     * @param content - The text content of the message.
     * @param timestamp - The timestamp for the message (defaults to now).
     * @returns The newly added message object.
     */
    addMessage(role: MessageRole, content: string, timestamp: Date = new Date()): Message {
        const newMessage: Message = { role, content, timestamp };
        this.messages.push(newMessage);
        this.metadata.lastModified = timestamp.toISOString(); // Update last modified time
        // console.log(`[Chat ${this.metadata.id}] Added ${role} message. Count: ${this.messages.length}`);
        this.save(); // Trigger debounced save
        return newMessage;
    }

    /** Returns a copy of the chat messages array. */
    getMessages(): Message[] {
        return [...this.messages]; // Return a copy to prevent external modification
    }

    /** Clears all messages from the chat history. Updates lastModified and saves. */
    clearMessages(): void {
        console.log(`[Chat ${this.metadata.id}] Clearing messages.`);
        this.messages = [];
        this.metadata.lastModified = new Date().toISOString();
        this.save(); // Trigger save after clearing
    }

// У файлі Chat.ts

    /**
     * Updates specified metadata fields for the chat.
     * Automatically updates the lastModified timestamp and triggers a save if changes occurred.
     * @param updates - An object containing metadata fields to update (cannot update 'id' or 'createdAt').
     * @returns {boolean} - True if any metadata field was actually changed, false otherwise.
     */
    updateMetadata(updates: Partial<Omit<ChatMetadata, 'id' | 'createdAt' | 'lastModified'>>): boolean { // <-- Додано тип повернення boolean
        let changed = false;
        const currentMeta = this.metadata;

        // Порівнюємо і оновлюємо кожне поле, що може бути передано
        if (updates.name !== undefined && updates.name !== currentMeta.name) {
            currentMeta.name = updates.name;
            changed = true;
        }
        if (updates.modelName !== undefined && updates.modelName !== currentMeta.modelName) {
            currentMeta.modelName = updates.modelName;
            changed = true;
        }
        if (updates.selectedRolePath !== undefined && updates.selectedRolePath !== currentMeta.selectedRolePath) {
            currentMeta.selectedRolePath = updates.selectedRolePath;
            changed = true;
        }
        if (updates.temperature !== undefined && updates.temperature !== currentMeta.temperature) {
            currentMeta.temperature = updates.temperature;
            changed = true;
        }
        if (updates.contextWindow !== undefined && updates.contextWindow !== currentMeta.contextWindow) {
            currentMeta.contextWindow = updates.contextWindow;
            changed = true;
        }
        // Додайте сюди перевірки для інших полів метаданих, якщо вони є

        if (changed) {
            this.metadata.lastModified = new Date().toISOString(); // Оновлюємо час тільки якщо були зміни
            // Використовуємо логер плагіна, якщо він доступний
             if ((this.pluginSettings as any).logger) { // Потрібно передати логер або плагін в конструктор Chat
                 (this.pluginSettings as any).logger.debug(`[Chat ${this.metadata.id}] Metadata updated, scheduling save:`, updates);
             } else {
                  console.log(`[Chat ${this.metadata.id}] Metadata updated, scheduling save:`, updates);
             }
            this.save(); // Викликаємо збереження (з debounce) тільки якщо були зміни
        } else {
             if ((this.pluginSettings as any).logger) {
                 (this.pluginSettings as any).logger.debug(`[Chat ${this.metadata.id}] updateMetadata called, but no changes detected.`);
             } else {
                  console.log(`[Chat ${this.metadata.id}] updateMetadata called, but no changes detected.`);
             }
        }

        return changed; // <-- Повертаємо результат (true або false)
    }

    // Також переконайтесь, що конструктор Chat приймає і зберігає logger (або plugin)
    // і що він передається при викликах new Chat та Chat.loadFromFile в ChatManager.ts
    // Приклад оновленого конструктора Chat:
    /*
    private logger: Logger; // Додати властивість

    constructor(
        adapter: DataAdapter,
        settings: ChatConstructorSettings,
        data: ChatData,
        filePath: string,
        logger: Logger // Додати параметр
    ) {
        this.adapter = adapter;
        this.pluginSettings = settings;
        this.filePath = normalizePath(filePath);
        this.metadata = data.metadata;
        this.messages = data.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
        this.logger = logger; // Зберегти логер

        
        this.debouncedSave = debounce(this._saveToFile.bind(this), 1500, true);
    }

    // І оновіть статичний метод loadFromFile, щоб він теж приймав та передавав logger
     static async loadFromFile(filePath: string, adapter: DataAdapter, settings: ChatConstructorSettings, logger: Logger): Promise<Chat | null> {
        // ...
        return new Chat(adapter, settings, data, normPath, logger); // Передати logger
        // ...
     }
     */

    // --- Persistence ---

    /** Triggers a debounced save if message history saving is enabled. */
    save(): void {
        if (this.pluginSettings.saveMessageHistory) {
            // Optional: Add log for scheduling if needed for debugging debounce
            // console.log(`[Chat ${this.metadata.id}] Scheduling save via debounce...`);
            this.debouncedSave();
        } else {
            // console.log(`[Chat ${this.metadata.id}] Saving disabled, save() call skipped.`);
        }
    }

    /**
     * Saves the current chat state to its file immediately.
     * Bypasses the debounce timer. Returns true on success, false on failure.
     */
    public async saveImmediately(): Promise<boolean> {
        if (!this.pluginSettings.saveMessageHistory) {
            // console.log(`[Chat ${this.metadata.id}] Save disabled, immediate save skipped for ${this.filePath}.`);
            return true; // Consider it "successful" as no save was intended
        }
        // console.log(`[Chat ${this.metadata.id}] Attempting immediate save to ${this.filePath}...`);
        return await this._saveToFile();
    }

    /**
     * Internal method to perform the actual file writing operation.
     * Creates necessary directories if they don't exist.
     */
    private async _saveToFile(): Promise<boolean> {
        // Prepare data for JSON serialization (convert Date objects to ISO strings)
        const chatData: ChatData = {
            metadata: this.metadata,
            messages: this.messages.map(m => ({
                ...m,
                timestamp: m.timestamp.toISOString() as any // Cast to any to satisfy type, it's a string
            }))
        };
        const jsonString = JSON.stringify(chatData, null, 2); // Pretty print JSON

        try {
            // Ensure the directory exists before writing the file
            // Extract directory path from the full file path
            const dirPath = this.filePath.substring(0, this.filePath.lastIndexOf('/'));

            // Only try to create if dirPath is not empty (i.e., not saving to root)
            if (dirPath && !(await this.adapter.exists(dirPath))) {
                console.log(`[Chat ${this.metadata.id}] Directory ${dirPath} does not exist. Creating...`);
                await this.adapter.mkdir(dirPath);
                console.log(`[Chat ${this.metadata.id}] Directory ${dirPath} created.`);
            }

            // Write the file using the vault adapter
            await this.adapter.write(this.filePath, jsonString);
            // console.log(`[Chat ${this.metadata.id}] Successfully saved ${this.messages.length} messages to ${this.filePath}`);
            return true; // Indicate success
        }
        catch (error) {
            console.error(`[Chat ${this.metadata.id}] Error saving chat to ${this.filePath}:`, error);
            new Notice(`Error saving chat: ${this.metadata.name}. Check console.`);
            return false; // Indicate failure
        }
    }

    /**
     * Static method to load chat data from a specified file path within the vault.
     * Called by ChatManager.
     * @param filePath - The full, normalized path to the chat file.
     * @param adapter - Obsidian's DataAdapter.
     * @param settings - Plugin settings.
     * @returns A new Chat instance or null if loading fails.
     */
    static async loadFromFile(
        filePath: string,
        adapter: DataAdapter,
        settings: ChatConstructorSettings,
        logger: Logger // <-- ДОДАНО ПАРАМЕТР
    ): Promise<Chat | null> {
        const normPath = normalizePath(filePath);
        // --- ВИПРАВЛЕННЯ: Використовуємо переданий logger ---
        // --------------------------------------------------
        try {
            if (!(await adapter.exists(normPath))) {
                logger.warn(`[Chat] File not found for loading: ${normPath}`); // Використовуємо logger
                return null;
            }
            const json = await adapter.read(normPath);
            const data = JSON.parse(json) as ChatData;

            if (data?.metadata?.id && Array.isArray(data.messages)) {
                logger.debug(`[Chat] Successfully parsed data, creating Chat instance for ID: ${data.metadata.id}`); // Використовуємо logger
                // --- ВИПРАВЛЕННЯ: Передаємо logger в конструктор ---
                return new Chat(adapter, settings, data, normPath, logger);
                // ----------------------------------------------
            } else {
                logger.error(`[Chat] Invalid data structure in file for static load: ${normPath}`, data); // Використовуємо logger
                new Notice(`Error loading chat: Invalid data structure in ${filePath}`);
                return null;
            }
        } catch (e: any) {
            logger.error(`[Chat] Error loading or parsing file for static load: ${normPath}`, e); // Використовуємо logger
            new Notice(`Error loading chat file: ${filePath}. ${e.message}`);
            return null;
        }
    }

    /**
     * Deletes the chat's associated `.json` file from the vault.
     * @returns true if the file was deleted or didn't exist, false on error.
     */
    async deleteFile(): Promise<boolean> {
        console.log(`[Chat ${this.metadata.id}] Attempting to delete file: ${this.filePath}`);
        try {
            // Check if the file exists before attempting removal
            if (await this.adapter.exists(this.filePath)) {
                await this.adapter.remove(this.filePath);
                console.log(`[Chat ${this.metadata.id}] Successfully deleted file: ${this.filePath}`);
                return true; // Deletion successful
            }
            // File didn't exist, which is also a success state for deletion
            console.log(`[Chat ${this.metadata.id}] File already deleted or never existed: ${this.filePath}`);
            return true;
        } catch (e) {
            // Handle errors during file removal
            console.error(`[Chat ${this.metadata.id}] Error deleting file ${this.filePath}:`, e);
            new Notice(`Error deleting chat file: ${this.metadata.name}. Check console.`);
            return false; // Deletion failed
        }
    }

    public toJSON(): ChatData {
        return {
          metadata: this.metadata,
          messages: this.messages
        };
      }

} // End of Chat class