// Chat.ts
import { normalizePath, DataAdapter, Notice, debounce } from "obsidian";
import { MessageRole } from "./OllamaView";
import { OllamaPluginSettings } from "./settings";
import { Logger } from "./Logger";
import { Message } from "./types";

export type ChatConstructorSettings = OllamaPluginSettings;

export interface ChatMetadata {
    id: string;
    name: string;
    modelName?: string;
    selectedRolePath?: string;
    temperature?: number;
    createdAt: string;
    lastModified: string;
    contextWindow?: number;
}

export interface ChatData {
    metadata: ChatMetadata;
    messages: Message[];
}

export class Chat {
    public metadata: ChatMetadata;
    public messages: Message[];
    public filePath: string;
    private adapter: DataAdapter;
    private pluginSettings: ChatConstructorSettings;
    private debouncedSave: () => void;
    private logger: Logger;

    constructor(
        adapter: DataAdapter,
        settings: ChatConstructorSettings,
        data: ChatData,
        filePath: string,
        logger: Logger
    ) {
        this.adapter = adapter;
        this.pluginSettings = settings;
        this.filePath = normalizePath(filePath);
        this.metadata = data.metadata;
        this.messages = data.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
        this.logger = logger;

        this.debouncedSave = debounce(this._saveToFile.bind(this), 1500, true);
    }

    addMessage(role: MessageRole, content: string, timestamp: Date = new Date()): Message {
        const newMessage: Message = { role, content, timestamp };
        this.messages.push(newMessage);
        this.metadata.lastModified = timestamp.toISOString();
        this.save();
        return newMessage;
    }

    getMessages(): Message[] {
        return [...this.messages];
    }

    clearMessages(): void {
        this.messages = [];
        this.metadata.lastModified = new Date().toISOString();
        this.save();
    }

    updateMetadata(updates: Partial<Omit<ChatMetadata, 'id' | 'createdAt' | 'lastModified'>>): boolean {
        let changed = false;
        const currentMeta = this.metadata;

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

        if (changed) {
            this.metadata.lastModified = new Date().toISOString();
            this.save();
        }

        return changed;
    }

    save(): void {
        if (this.pluginSettings.saveMessageHistory) {
            this.debouncedSave();
        }
    }

    public async saveImmediately(): Promise<boolean> {
        if (!this.pluginSettings.saveMessageHistory) {
            return true;
        }
        return await this._saveToFile();
    }

    private async _saveToFile(): Promise<boolean> {
        const chatData: ChatData = {
            metadata: this.metadata,
            messages: this.messages.map(m => ({
                ...m,
                timestamp: m.timestamp.toISOString() as any
            }))
        };
        const jsonString = JSON.stringify(chatData, null, 2);

        try {
            const dirPath = this.filePath.substring(0, this.filePath.lastIndexOf('/'));

            if (dirPath && !(await this.adapter.exists(dirPath))) {
                await this.adapter.mkdir(dirPath);
            }

            await this.adapter.write(this.filePath, jsonString);
            return true;
        } catch (error) {
            console.error(`[Chat ${this.metadata.id}] Error saving chat to ${this.filePath}:`, error);
            new Notice(`Error saving chat: ${this.metadata.name}. Check console.`);
            return false;
        }
    }

    static async loadFromFile(
        filePath: string,
        adapter: DataAdapter,
        settings: ChatConstructorSettings,
        logger: Logger
    ): Promise<Chat | null> {
        const normPath = normalizePath(filePath);

        try {
            if (!(await adapter.exists(normPath))) {
                return null;
            }
            const json = await adapter.read(normPath);
            const data = JSON.parse(json) as ChatData;

            if (data?.metadata?.id && Array.isArray(data.messages)) {
                return new Chat(adapter, settings, data, normPath, logger);
            } else {
                new Notice(`Error loading chat: Invalid data structure in ${filePath}`);
                return null;
            }
        } catch (e: any) {
            console.error(`[Chat] Error loading or parsing file for static load: ${normPath}`, e);
            new Notice(`Error loading chat file: ${filePath}. ${e.message}`);
            return null;
        }
    }

    async deleteFile(): Promise<boolean> {
        try {
            if (await this.adapter.exists(this.filePath)) {
                await this.adapter.remove(this.filePath);
                return true;
            }
            return true;
        } catch (e) {
            console.error(`[Chat ${this.metadata.id}] Error deleting file ${this.filePath}:`, e);
            new Notice(`Error deleting chat file: ${this.metadata.name}. Check console.`);
            return false;
        }
    }

    public toJSON(): ChatData {
        return {
            metadata: this.metadata,
            messages: this.messages
        };
    }

    public recordActivity(): boolean {
        const oldLastModified = this.metadata.lastModified;
        this.metadata.lastModified = new Date().toISOString();
        const changed = oldLastModified !== this.metadata.lastModified;

        if (changed) {
            this.save();
        }
        return changed;
    }
} // End of Chat class