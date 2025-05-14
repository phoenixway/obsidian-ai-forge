// Chat.ts
import { normalizePath, DataAdapter, Notice, debounce } from "obsidian";
import { OllamaPluginSettings } from "./settings";
import { Logger } from "./Logger";
import { Message, ToolCall, AssistantMessage, MessageRole as MessageRoleFromTypes } from "./types";

export type ChatConstructorSettings = OllamaPluginSettings;

export interface ChatMetadata {
    id: string;
    name: string;
    modelName?: string;
    selectedRolePath?: string;
    temperature?: number;
    createdAt: string; // ISO Date string
    lastModified: string; // ISO Date string
    contextWindow?: number;
}

// Тип для даних, які серіалізуються/десеріалізуються з/в JSON
// Тут timestamp буде рядком (ISO string)
export interface ChatDataForStorage {
    metadata: ChatMetadata;
    // Використовуємо Omit для заміни типу timestamp, зберігаючи інші властивості Message
    messages: Array<Omit<Message, 'timestamp'> & { timestamp: string }>;
}

// Тип для даних, що використовуються в пам'яті всередині екземпляра Chat
// Тут timestamp є об'єктом Date
export interface ChatDataInMemory {
    metadata: ChatMetadata;
    messages: Message[]; // Message з types.ts, де timestamp: Date
}


export class Chat {
    public metadata: ChatMetadata;
    public messages: Message[]; // Масив повідомлень, timestamp тут типу Date
    public filePath: string;
    private adapter: DataAdapter;
    private pluginSettings: ChatConstructorSettings;
    private debouncedSave: () => void;
    private logger: Logger;

    constructor(
        adapter: DataAdapter,
        settings: ChatConstructorSettings,
        data: ChatDataInMemory, // Приймаємо дані з timestamp: Date
        filePath: string,
        logger: Logger
    ) {
        this.adapter = adapter;
        this.pluginSettings = settings;
        this.filePath = normalizePath(filePath);
        this.metadata = data.metadata;
        
        // Переконуємося, що timestamp є Date. Якщо він прийшов як рядок (малоймовірно тут), конвертуємо.
        this.messages = data.messages.map(msgData => {
            const messageWithDate: Message = {
                ...msgData, 
                timestamp: msgData.timestamp instanceof Date ? msgData.timestamp : new Date(msgData.timestamp) 
            };
            if (messageWithDate.role === 'assistant' && (messageWithDate as AssistantMessage).tool_calls) {
                logger.debug(`[Chat ${data.metadata.id} CONSTRUCTOR] Restored assistant message with tool_calls:`, JSON.stringify((messageWithDate as AssistantMessage).tool_calls));
            }
            return messageWithDate;
        });
        
        this.logger = logger;
        this.debouncedSave = debounce(this._saveToFile.bind(this), 1500, true);
    }

    addMessage(role: MessageRoleFromTypes, content: string, timestamp: Date = new Date()): Message {
        // Тут Message має timestamp: Date
        const newMessage: Message = { role, content, timestamp };
        this.messages.push(newMessage);
        this.recordActivity();
        return newMessage;
    }

    getMessages(): Message[] {
        return [...this.messages]; 
    }

    clearMessages(): void {
        this.messages = [];
        this.recordActivity();
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
            this.recordActivity();
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
            this.logger.debug(`[Chat ${this.metadata.id}] History saving is disabled, skipping saveImmediately.`);
            return true;
        }
        return await this._saveToFile();
    }

    private async _saveToFile(): Promise<boolean> {
        this.logger.debug(`[Chat ${this.metadata.id}] _saveToFile called. Messages count: ${this.messages.length}`);
        
        const messagesForStorage = this.messages.map(m => {
            // Створюємо об'єкт для збереження, де timestamp буде рядком
            const messageForSave: Omit<Message, 'timestamp'> & { timestamp: string; tool_calls?: ToolCall[] } = {
                role: m.role,
                content: m.content,
                timestamp: m.timestamp.toISOString() // Перетворюємо Date на ISO string
            };

            // Явно копіюємо опціональні поля
            if (m.type) (messageForSave as any).type = m.type;
            if (m.images) (messageForSave as any).images = m.images;
            if (m.tool_call_id) (messageForSave as any).tool_call_id = m.tool_call_id;
            if (m.name) (messageForSave as any).name = m.name;
            
            if (m.role === 'assistant' && (m as AssistantMessage).tool_calls && ((m as AssistantMessage).tool_calls?.length ?? 0) > 0) {
                messageForSave.tool_calls = (m as AssistantMessage).tool_calls;
                this.logger.debug(`[Chat ${this.metadata.id} _saveToFile] Assistant message (TS: ${m.timestamp.getTime()}) IS BEING SAVED WITH tool_calls:`, JSON.stringify(messageForSave.tool_calls));
            }
            return messageForSave;
        });

        const chatDataToSave: ChatDataForStorage = {
            metadata: this.metadata,
            messages: messagesForStorage
        };

        const assistantMessagesWithToolCallsInFinalData = chatDataToSave.messages.filter(
          (msg) => msg.role === "assistant" && (msg as any).tool_calls && (msg as any).tool_calls.length > 0
        );
        if (assistantMessagesWithToolCallsInFinalData.length > 0) {
            this.logger.info(
                `[Chat ${this.metadata.id} _saveToFile] FINAL ChatData for stringify CONTAINS tool_calls for ${assistantMessagesWithToolCallsInFinalData.length} assistant messages. First one's tool_calls:`,
                JSON.stringify((assistantMessagesWithToolCallsInFinalData[0] as any).tool_calls)
            );
        } else {
            this.logger.debug(`[Chat ${this.metadata.id} _saveToFile] FINAL ChatData for stringify has NO assistant messages with tool_calls.`);
        }

        const jsonString = JSON.stringify(chatDataToSave, null, 2);

        try {
            const dirPath = this.filePath.substring(0, this.filePath.lastIndexOf('/'));
            if (dirPath && !(await this.adapter.exists(dirPath))) {
                await this.adapter.mkdir(dirPath);
            }
            await this.adapter.write(this.filePath, jsonString);
            this.logger.debug(`[Chat ${this.metadata.id}] Successfully saved to ${this.filePath}`);
            return true;
        } catch (error) {
            this.logger.error(`[Chat ${this.metadata.id}] Error saving chat to ${this.filePath}:`, error);
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
        logger.debug(`[Chat LOAD] Attempting to load chat from: ${normPath}`);

        try {
            if (!(await adapter.exists(normPath))) {
                logger.warn(`[Chat LOAD] File not found: ${normPath}`);
                return null;
            }
            const json = await adapter.read(normPath);
            // Парсимо дані з файлу, очікуючи, що timestamp буде рядком (ChatDataForStorage)
            const rawDataFromFile = JSON.parse(json) as ChatDataForStorage; 

            if (rawDataFromFile?.metadata?.id && Array.isArray(rawDataFromFile.messages)) {
                logger.debug(`[Chat LOAD ${rawDataFromFile.metadata.id}] Parsed data. Messages count: ${rawDataFromFile.messages.length}.`);
                
                // Перетворюємо дані для конструктора: timestamp з рядка на Date
                const dataForConstructor: ChatDataInMemory = {
                    metadata: rawDataFromFile.metadata,
                    messages: rawDataFromFile.messages.map(msgFromFile => {
                        const messageForMemory: Message = {
                            ...(msgFromFile as Omit<Message, 'timestamp' | 'tool_calls'> & { timestamp: string, tool_calls?: ToolCall[] }), // Приведення типу для TypeScript
                            timestamp: new Date(msgFromFile.timestamp) // Конвертуємо рядок в Date
                            // tool_calls та інші поля копіюються через ...
                        };
                        if (messageForMemory.role === 'assistant' && (messageForMemory as AssistantMessage).tool_calls) {
                            logger.info(`[Chat LOAD ${rawDataFromFile.metadata.id}] Message (TS from file: ${msgFromFile.timestamp}) from file restored with tool_calls:`, JSON.stringify((messageForMemory as AssistantMessage).tool_calls));
                        }
                        return messageForMemory;
                    })
                };
                return new Chat(adapter, settings, dataForConstructor, normPath, logger);
            } else {
                logger.error(`[Chat LOAD] Invalid data structure in ${normPath}`, rawDataFromFile);
                new Notice(`Error loading chat: Invalid data structure in ${filePath}`);
                return null;
            }
        } catch (e: any) {
            logger.error(`[Chat LOAD] Error loading or parsing file: ${normPath}`, e);
            new Notice(`Error loading chat file: ${filePath}. ${e.message}`);
            return null;
        }
    }

    async deleteFile(): Promise<boolean> {
        try {
            if (await this.adapter.exists(this.filePath)) {
                await this.adapter.remove(this.filePath);
                this.logger.debug(`[Chat ${this.metadata.id}] Deleted file ${this.filePath}`);
                return true;
            }
            this.logger.debug(`[Chat ${this.metadata.id}] File ${this.filePath} not found for deletion, assuming success.`);
            return true;
        } catch (e) {
            this.logger.error(`[Chat ${this.metadata.id}] Error deleting file ${this.filePath}:`, e);
            new Notice(`Error deleting chat file: ${this.metadata.name}. Check console.`);
            return false;
        }
    }

    // Повертає ChatDataInMemory, де timestamp є Date
    public toJSON(): ChatDataInMemory {
        return {
            metadata: this.metadata,
            // Повертаємо копію повідомлень, як вони є в пам'яті (з Date об'єктами)
            messages: this.messages.map(m => ({...m})) 
        };
    }

    public recordActivity(): boolean {
        const oldLastModified = this.metadata.lastModified;
        this.metadata.lastModified = new Date().toISOString();
        const changed = oldLastModified !== this.metadata.lastModified;
        
        if (changed) {
            this.logger.trace(`[Chat ${this.metadata.id}] Activity recorded, new lastModified: ${this.metadata.lastModified}`);
            this.save(); 
        }
        return changed;
    }
}