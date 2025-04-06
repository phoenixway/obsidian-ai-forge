// Chat.ts
import { normalizePath, DataAdapter, Notice, debounce } from "obsidian";
import { Message, MessageRole } from "./OllamaView"; // Assuming OllamaView exports these
import { OllamaPluginSettings } from "./settings"; // Assuming settings exports this

/**
 * Type definition for settings relevant to the Chat constructor.
 * Currently, it includes all plugin settings, but could be narrowed down if needed.
 */
export type ChatConstructorSettings = OllamaPluginSettings;

/**
 * Metadata associated with a chat session.
 */
export interface ChatMetadata {
    id: string;                 // Unique identifier for the chat
    name: string;               // User-friendly name for the chat
    modelName: string;          // Model used for this chat
    selectedRolePath: string;   // Path to the role file used
    temperature: number;        // Temperature setting for this chat
    createdAt: string;          // ISO string timestamp of creation
    lastModified: string;       // ISO string timestamp of last modification
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

    /**
     * Creates an instance of Chat. Should be called by ChatManager.
     * @param adapter - Obsidian's DataAdapter.
     * @param settings - Plugin settings relevant for chat operation.
     * @param data - The initial chat data (metadata and messages).
     * @param filePath - The full, normalized path where this chat should be saved/loaded from within the vault. **Required**.
     */
    constructor(adapter: DataAdapter, settings: ChatConstructorSettings, data: ChatData, filePath: string) {
        this.adapter = adapter;
        this.pluginSettings = settings;

        // FilePath is now mandatory and determined by ChatManager
        if (!filePath || typeof filePath !== 'string' || filePath.trim() === '') {
            const errorMsg = "[Chat] Critical Error: Chat constructor called without a valid filePath.";
            console.error(errorMsg, { settings, data });
            // Depending on desired strictness, either throw or try a fallback (though fallback is risky)
            // For now, log an error and proceed, but saving will likely fail.
            // throw new Error(errorMsg);
            this.filePath = `INVALID_PATH_${data?.metadata?.id || Date.now()}.json`; // Assign a clearly invalid path
            new Notice("Critical Error: Chat created without a valid save path!");
        } else {
            this.filePath = normalizePath(filePath); // Normalize the provided path
        }

        console.log(`[Chat ${data?.metadata?.id ?? 'initializing'}] Initialized. File path set to: ${this.filePath}`);

        // Initialize metadata and messages from provided data
        this.metadata = data.metadata;
        // Convert ISO timestamp strings back to Date objects when loading
        this.messages = data.messages.map(m => ({
            ...m,
            timestamp: new Date(m.timestamp) // Ensure timestamp is a Date object
        }));

        // Initialize debounced save function
        this.debouncedSave = debounce(this._saveToFile.bind(this), 1500, true); // Save after 1.5s of inactivity
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

    /**
     * Updates specified metadata fields for the chat.
     * Automatically updates the lastModified timestamp and triggers a save.
     * @param updates - An object containing metadata fields to update (cannot update 'id' or 'createdAt').
     */
    updateMetadata(updates: Partial<Omit<ChatMetadata, 'id' | 'createdAt'>>) {
        // Merge updates, ensuring id and createdAt are not overwritten
        const originalId = this.metadata.id;
        const originalCreatedAt = this.metadata.createdAt;
        this.metadata = {
            ...this.metadata,
            ...updates,
            id: originalId, // Preserve original ID
            createdAt: originalCreatedAt, // Preserve original creation date
            lastModified: new Date().toISOString() // Always update last modified
        };
        console.log(`[Chat ${this.metadata.id}] Metadata updated:`, updates);
        this.save(); // Trigger save after metadata update
    }

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
            console.log(`[Chat ${this.metadata.id}] Save disabled, immediate save skipped for ${this.filePath}.`);
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
    static async loadFromFile(filePath: string, adapter: DataAdapter, settings: ChatConstructorSettings): Promise<Chat | null> {
        const normPath = normalizePath(filePath);
        console.log(`[Chat] Static loadFromFile attempting for vault path: ${normPath}`);
        try {
            // Check if file exists using the adapter
            if (!(await adapter.exists(normPath))) {
                console.warn(`[Chat] File not found for loading: ${normPath}`);
                return null; // File doesn't exist
            }
            // Read file content
            const json = await adapter.read(normPath);
            // console.log(`[Chat] Read ${json.length} bytes from ${normPath} for static load`);

            // Parse JSON content
            const data = JSON.parse(json) as ChatData;

            // Basic validation of loaded data structure
            if (data?.metadata?.id && Array.isArray(data.messages)) {
                console.log(`[Chat] Successfully parsed data for static load, creating Chat instance for ID: ${data.metadata.id}`);
                // Create and return a new Chat instance using the loaded data and path
                return new Chat(adapter, settings, data, normPath);
            } else {
                // Data structure is invalid
                console.error(`[Chat] Invalid data structure in file for static load: ${normPath}`, data);
                new Notice(`Error loading chat: Invalid data structure in ${filePath}`);
                return null;
            }
        } catch (e: any) {
            // Handle file read or JSON parse errors
            console.error(`[Chat] Error loading or parsing file for static load: ${normPath}`, e);
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

} // End of Chat class