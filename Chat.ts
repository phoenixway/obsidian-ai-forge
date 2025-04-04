// src/Chat.ts
import { normalizePath, DataAdapter, Notice, debounce } from "obsidian";
import { Message, MessageRole } from "./OllamaView";
import { OllamaPluginSettings } from "./settings";

// --- ЗМІНЕНО ТУТ: Додано export ---
// Додатковий тип для налаштувань, що передаються в конструктор Chat
export type ChatConstructorSettings = OllamaPluginSettings & { pluginFolder?: string; chatsFolderName?: string };
// --- КІНЕЦЬ ЗМІН ---

export interface ChatMetadata {
    id: string;
    name: string;
    modelName: string;
    selectedRolePath: string;
    temperature: number;
    createdAt: string; // ISO string
    lastModified: string; // ISO string
}

export interface ChatData {
    metadata: ChatMetadata;
    messages: Message[];
}

export class Chat {
    public metadata: ChatMetadata;
    public messages: Message[];
    public filePath: string; // Нормалізований шлях
    private adapter: DataAdapter;
    private pluginSettings: ChatConstructorSettings; // Зберігаємо повний тип
    private debouncedSave: () => void;

    // Конструктор приймає повний тип
    constructor(adapter: DataAdapter, settings: ChatConstructorSettings, data?: ChatData, filePath?: string) {
        this.adapter = adapter;
        this.pluginSettings = settings;

        if (data) {
            this.metadata = data.metadata;
            this.messages = data.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
            this.filePath = filePath ? normalizePath(filePath) : this.getChatFilePath(this.metadata.id);
        } else {
            const now = new Date();
            const newId = `chat_${now.getTime()}_${Math.random().toString(36).substring(2, 8)}`;
            this.filePath = this.getChatFilePath(newId);
            this.metadata = {
                id: newId,
                name: `Chat ${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
                modelName: settings.modelName,
                selectedRolePath: settings.selectedRolePath,
                temperature: settings.temperature,
                createdAt: now.toISOString(),
                lastModified: now.toISOString(),
            };
            this.messages = [];
        }

        this.debouncedSave = debounce(this._saveToFile.bind(this), 1500, true);
    }

    // Використовує this.pluginSettings для шляхів
    private getChatFilePath(id: string): string {
        const baseDir = this.pluginSettings.pluginFolder || '.obsidian/plugins/your-plugin-id'; // Fallback
        const chatFolder = this.pluginSettings.chatsFolderName || 'chats'; // Fallback
        const chatDir = normalizePath(`${baseDir}/${chatFolder}`);
        return normalizePath(`${chatDir}/${id}.json`);
    }


    addMessage(role: MessageRole, content: string, timestamp: Date = new Date()): Message {
        const newMessage: Message = { role, content, timestamp }; this.messages.push(newMessage); this.metadata.lastModified = timestamp.toISOString(); this.save(); return newMessage;
    }

    getMessages(): Message[] { return [...this.messages]; }
    clearMessages(): void { this.messages = []; this.metadata.lastModified = new Date().toISOString(); this.save(); }
    updateMetadata(updates: Partial<Omit<ChatMetadata, 'id' | 'createdAt' | 'filePath'>>) { this.metadata = { ...this.metadata, ...updates, lastModified: new Date().toISOString() }; console.log(`[Chat ${this.metadata.id}] Metadata updated:`, updates); this.save(); }
    save(): void { if (this.pluginSettings.saveMessageHistory) { this.debouncedSave(); } }

    public async saveImmediately(): Promise<boolean> {
        if (!this.pluginSettings.saveMessageHistory) { console.log(`Save disabled, immediate save skipped.`); return true; }
        // console.log(`[Chat ${this.metadata.id}] Attempting immediate save...`);
        return await this._saveToFile();
    }

    private async _saveToFile(): Promise<boolean> {
        this.filePath = this.getChatFilePath(this.metadata.id); // Ensure path is up-to-date
        const chatData: ChatData = { metadata: this.metadata, messages: this.messages.map(m => ({ ...m, timestamp: m.timestamp.toISOString() as any })) };
        const jsonString = JSON.stringify(chatData, null, 2);
        try { const dirPath = this.filePath.substring(0, this.filePath.lastIndexOf('/')); if (!(await this.adapter.exists(dirPath))) { await this.adapter.mkdir(dirPath); } await this.adapter.write(this.filePath, jsonString); return true; }
        catch (error) { console.error(`[Chat ${this.metadata.id}] Error saving chat to ${this.filePath}:`, error); new Notice(`Error saving chat: ${this.metadata.name}`); return false; }
    }

    // Метод приймає повний тип налаштувань
    static async loadFromFile(filePath: string, adapter: DataAdapter, settings: ChatConstructorSettings): Promise<Chat | null> {
        const normPath = normalizePath(filePath); if (!(await adapter.exists(normPath))) { console.warn(`File not found: ${normPath}`); return null; } try { const json = await adapter.read(normPath); const data = JSON.parse(json) as ChatData; if (data?.metadata?.id && Array.isArray(data.messages)) { return new Chat(adapter, settings, data, normPath); } else { console.error(`Invalid data: ${normPath}`); new Notice(`Error load: Invalid data in ${filePath}`); return null; } } catch (e) { console.error(`Error load/parse: ${normPath}`, e); new Notice(`Error loading chat: ${filePath}`); return null; }
    }

    async deleteFile(): Promise<boolean> {
        try { if (await this.adapter.exists(this.filePath)) { await this.adapter.remove(this.filePath); console.log(`[Chat ${this.metadata.id}] Deleted: ${this.filePath}`); return true; } return true; } catch (e) { console.error(`[Chat ${this.metadata.id}] Error deleting ${this.filePath}:`, e); new Notice(`Error deleting: ${this.metadata.name}`); return false; }
    }
}