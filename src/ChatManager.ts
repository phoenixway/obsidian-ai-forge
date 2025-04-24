// ChatManager.ts
import { App, Notice, DataAdapter, normalizePath, TFolder, debounce } from "obsidian";
import OllamaPlugin, { ACTIVE_CHAT_ID_KEY, CHAT_INDEX_KEY } from "./main";
import { Chat, ChatMetadata, ChatData, ChatConstructorSettings } from "./Chat";
import { MessageRole, Message } from './OllamaView';
import { v4 as uuidv4 } from 'uuid';

// Інтерфейси
interface ChatSessionStored {
    name: string;
    lastModified: string;
    createdAt: string; // <-- Обов'язкове поле
    modelName?: string;
    selectedRolePath?: string;
    temperature?: number;
    contextWindow?: number;
}
interface ChatSessionIndex {
    [id: string]: ChatSessionStored;
}
export interface RoleInfo {
    name: string;
    path: string;
    isCustom: boolean;
}
interface TaskState { urgent: string[]; regular: string[]; hasContent: boolean; }

export class ChatManager {
    private plugin: OllamaPlugin;
    private app: App;
    private adapter: DataAdapter;
    private chatsFolderPath: string = "/";
    private chatIndex: ChatSessionIndex = {};
    private activeChatId: string | null = null;
    private activeChat: Chat | null = null;
    private loadedChats: Record<string, Chat> = {};
    public currentTaskState: TaskState | null = null;

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.adapter = plugin.app.vault.adapter;
    }

    async initialize(): Promise<void> {
        this.plugin.logger.info("Initializing ChatManager...");
        this.updateChatsFolderPath();
        await this.ensureFoldersExist();
        await this.loadChatIndex(true);
        this.plugin.logger.info(`ChatManager initialized. Index has ${Object.keys(this.chatIndex).length} chats.`);
    }

    updateChatsFolderPath(): void {
        const settingsPath = this.plugin.settings.chatHistoryFolderPath?.trim();
        this.chatsFolderPath = (settingsPath && settingsPath !== '/') ? normalizePath(settingsPath) : "/";
        this.plugin.logger.debug(`Chat history folder path set to: ${this.chatsFolderPath}`);
    }

    updateTaskState(tasks: TaskState | null) {
        this.plugin.logger.debug("Updating task state in ChatManager", tasks);
        this.currentTaskState = tasks;
    }

    getCurrentTaskState(): TaskState | null {
        return this.currentTaskState;
    }

    public async ensureFoldersExist(): Promise<void> {
         const historyPath = this.plugin.settings.chatHistoryFolderPath;
         const exportPath = this.plugin.settings.chatExportFolderPath;
         this.plugin.logger.debug(`Ensuring folders exist: History='${historyPath}', Export='${exportPath}'`);
         const checkAndCreate = async (folderPath: string, folderDesc: string) => {
             if (!folderPath || folderPath === "/") return;
             try { if (!(await this.adapter.exists(folderPath))) { this.plugin.logger.info(`${folderDesc} folder doesn't exist. Creating: ${folderPath}`); await this.adapter.mkdir(folderPath); } else { const stat = await this.adapter.stat(folderPath); if (stat?.type !== 'folder') { this.plugin.logger.error(`Path for ${folderDesc} exists but is not a folder: ${folderPath}`); new Notice(`Error: Path for ${folderDesc} is not a folder.`); } } }
             catch (error) { this.plugin.logger.error(`Error creating/checking ${folderDesc} directory '${folderPath}':`, error); new Notice(`Error creating folder for ${folderDesc}. Check settings and permissions.`); } };
         await checkAndCreate(historyPath, "Chat History"); await checkAndCreate(exportPath, "Chat Export");
     }

    private async loadChatIndex(forceScan: boolean = false): Promise<void> {
        this.plugin.logger.debug(`Loading chat index... (forceScan: ${forceScan})`);
        const storedIndex = await this.plugin.loadDataKey(CHAT_INDEX_KEY);

        if (!forceScan && storedIndex && Object.keys(storedIndex).length > 0) {
            this.chatIndex = storedIndex;
            this.plugin.logger.debug(`Loaded ${Object.keys(this.chatIndex).length} chat(s) from stored index.`);
            return;
        }

        this.plugin.logger.info(`Rebuilding chat index by scanning files in: ${this.chatsFolderPath}`);
        const newIndex: ChatSessionIndex = {};
        let filesScanned = 0;
        let chatsLoaded = 0;

        try {
            if (this.chatsFolderPath !== "/" && !(await this.adapter.exists(this.chatsFolderPath))) {
                this.plugin.logger.warn(`Chat history folder '${this.chatsFolderPath}' not found during scan. Index will be empty.`);
                this.chatIndex = {};
                await this.saveChatIndex();
                return;
            }

            const listResult = await this.adapter.list(this.chatsFolderPath);
            const chatFiles = listResult.files.filter(filePath => {
                 const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
                 return fileName.endsWith('.json') && !fileName.startsWith('.');
            });

            filesScanned = chatFiles.length;
            this.plugin.logger.debug(`Found ${filesScanned} potential chat files to scan.`);

            for (const fullPath of chatFiles) {
                 const fileName = fullPath.substring(fullPath.lastIndexOf('/') + 1);
                 const chatId = fileName.endsWith('.json') ? fileName.slice(0, -5) : null;
                 if (!chatId) continue;

                 try {
                     const jsonContent = await this.adapter.read(fullPath);
                     const data = JSON.parse(jsonContent) as Partial<ChatData>;

                     if (data?.metadata?.id && data.metadata.id === chatId && data.metadata.name && data.metadata.lastModified && data.metadata.createdAt) {
                        const metadata = data.metadata;
                        newIndex[chatId] = {
                            name: metadata.name,
                            lastModified: typeof metadata.lastModified === 'string' ? metadata.lastModified : new Date(metadata.lastModified || Date.now()).toISOString(),
                            createdAt: typeof metadata.createdAt === 'string' ? metadata.createdAt : new Date(metadata.createdAt || Date.now()).toISOString(),
                            ...(metadata.modelName && { modelName: metadata.modelName }),
                            ...(metadata.selectedRolePath && { selectedRolePath: metadata.selectedRolePath }),
                            ...(metadata.temperature !== undefined && { temperature: metadata.temperature }),
                            ...(metadata.contextWindow !== undefined && { contextWindow: metadata.contextWindow }),
                        };
                        chatsLoaded++;
                    } else { this.plugin.logger.warn(`Metadata validation FAILED for file: ${fullPath}. ID mismatch or missing required fields (name, lastModified, createdAt).`); }
                 } catch (e) { this.plugin.logger.error(`Error reading or parsing chat file ${fullPath} during index scan:`, e); }
            }

            this.chatIndex = newIndex;
            await this.saveChatIndex();
            this.plugin.logger.info(`Index rebuilt: ${chatsLoaded} chats loaded from ${filesScanned} scanned files.`);

        } catch (error) {
             this.plugin.logger.error(`Critical error during index rebuild scan:`, error);
             this.chatIndex = {};
             await this.saveChatIndex();
        }
    }

    private async saveChatIndex(): Promise<void> {
        this.plugin.logger.debug(`Saving chat index with ${Object.keys(this.chatIndex).length} entries.`);
        await this.plugin.saveDataKey(CHAT_INDEX_KEY, this.chatIndex);
    }

    private getChatFilePath(id: string): string {
        const fileName = `${id}.json`;
        return (this.chatsFolderPath === "/")
            ? normalizePath(fileName)
            : normalizePath(`${this.chatsFolderPath}/${fileName}`);
    }

    async saveChatAndUpdateIndex(chat: Chat): Promise<boolean> {
        const saved = await chat.saveImmediately();
        if (saved) {
            // --- Оновлено: Створюємо об'єкт типу ChatSessionStored ---
            const meta = chat.metadata;
            const storedMeta: ChatSessionStored = {
                name: meta.name,
                lastModified: meta.lastModified,
                createdAt: meta.createdAt,
                 ...(meta.modelName && { modelName: meta.modelName }),
                 ...(meta.selectedRolePath && { selectedRolePath: meta.selectedRolePath }),
                 ...(meta.temperature !== undefined && { temperature: meta.temperature }),
                 ...(meta.contextWindow !== undefined && { contextWindow: meta.contextWindow }),
            };
            this.chatIndex[meta.id] = storedMeta;
            // -----------------------------------------------------
            await this.saveChatIndex();
            this.plugin.emit('chat-list-updated');
            return true;
        }
        return false;
    }

    async createNewChat(name?: string): Promise<Chat | null> {
        this.plugin.logger.info(`Creating new chat...`);
        try {
            const now = new Date();
            const newId = uuidv4();
            const filePath = this.getChatFilePath(newId);

            const initialMetadata: ChatMetadata = {
                id: newId,
                name: name || `Chat ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                modelName: this.plugin.settings.modelName,
                selectedRolePath: this.plugin.settings.selectedRolePath,
                temperature: this.plugin.settings.temperature,
                contextWindow: this.plugin.settings.contextWindow,
                createdAt: now.toISOString(),
                lastModified: now.toISOString(),
            };

            const constructorSettings: ChatConstructorSettings = { ...this.plugin.settings };
            const chatData: ChatData = { metadata: initialMetadata, messages: [] };

            const newChat = new Chat(this.adapter, constructorSettings, chatData, filePath, this.plugin.logger);

            const saved = await this.saveChatAndUpdateIndex(newChat);
            if (!saved) throw new Error("Failed to save initial chat file.");

            this.loadedChats[newId] = newChat;
            await this.setActiveChat(newId);

            this.plugin.logger.info(`Created and activated new chat: ${newChat.metadata.name} (ID: ${newId})`);
            return newChat;
        } catch (error) {
            this.plugin.logger.error("Error creating new chat:", error);
            new Notice("Error creating new chat session.");
            return null;
        }
    }

    listAvailableChats(): ChatMetadata[] {
         return Object.entries(this.chatIndex)
             .map(([id, storedMeta]): ChatMetadata | null => {
                if (!storedMeta || typeof storedMeta.name !== 'string' || typeof storedMeta.lastModified !== 'string' || typeof storedMeta.createdAt !== 'string') {
                    this.plugin.logger.warn(`Invalid or incomplete metadata found in index for chat ID: ${id}. Skipping in list.`, storedMeta);
                    return null;
                }
                return {
                    id,
                    createdAt: storedMeta.createdAt,
                    lastModified: storedMeta.lastModified,
                    name: storedMeta.name,
                    modelName: storedMeta.modelName,
                    selectedRolePath: storedMeta.selectedRolePath,
                    temperature: storedMeta.temperature,
                    contextWindow: storedMeta.contextWindow
                };
             })
             .filter((chatMeta): chatMeta is ChatMetadata => chatMeta !== null)
             .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    }

    getActiveChatId(): string | null { return this.activeChatId; }

    async getChat(id: string): Promise<Chat | null> {
          this.plugin.logger.debug(`getChat called for ID: ${id}`);
          if (this.loadedChats[id]) {
               this.plugin.logger.debug(`Returning chat ${id} from memory cache.`);
               return this.loadedChats[id];
          }
          this.plugin.logger.debug(`Chat ${id} not in memory cache, loading from file...`);

          if (!this.chatIndex[id]) {
              this.plugin.logger.warn(`Chat ID ${id} not found in index during getChat.`);
              return null;
          }

          const filePath = this.getChatFilePath(id);
          try {
              const chat = await Chat.loadFromFile(filePath, this.adapter, this.plugin.settings, this.plugin.logger);

              if (chat) {
                  this.plugin.logger.debug(`Successfully loaded chat ${id}. Caching.`);
                  this.loadedChats[id] = chat;
                  return chat;
              } else {
                  this.plugin.logger.error(`Chat.loadFromFile returned null for ${id}. Removing from index if still present.`);
                  if (this.chatIndex[id]) {
                     delete this.chatIndex[id];
                     await this.saveChatIndex();
                     this.plugin.emit('chat-list-updated');
                  }
                  if (this.activeChatId === id) await this.setActiveChat(null);
                  return null;
              }
          } catch (error) {
              this.plugin.logger.error(`Unexpected error during getChat for ${id} from ${filePath}:`, error);
              return null;
          }
      }

    async getActiveChat(): Promise<Chat | null> {
        this.plugin.logger.debug(`getActiveChat called. Current activeChatId: ${this.activeChatId}`);
        if (!this.activeChatId) {
             this.plugin.logger.debug("No active chat ID set.");
             return null;
        }
        if (this.activeChat && this.activeChat.metadata.id === this.activeChatId) {
            this.plugin.logger.debug(`Returning cached active chat object: ${this.activeChatId}`);
            return this.activeChat;
        }
        this.plugin.logger.debug(`Active chat ${this.activeChatId} not in active cache, calling getChat...`);
        const chat = await this.getChat(this.activeChatId);
        if (chat) {
            this.activeChat = chat;
            return chat;
        } else {
            this.plugin.logger.warn(`Failed to load active chat ${this.activeChatId} via getChat.`);
            return null;
        }
    }

    public async setActiveChat(id: string | null): Promise<void> {
        this.plugin.logger.debug(`setActiveChat called with ID: ${id}`);
        const previousActiveId = this.activeChatId;

        if (id && !this.chatIndex[id]) {
            this.plugin.logger.error(`Attempted to set active chat to non-existent ID: ${id}. Aborting.`);
            new Notice(`Error: Chat with ID ${id} not found.`);
            return;
        }

        if (id === previousActiveId) {
            this.plugin.logger.debug(`Chat ${id} is already active.`);
             if (id && !this.activeChat) {
                this.activeChat = await this.getChat(id);
                  // Не треба емітити подію тут, бо активний ID не змінився
             }
            return;
        }

        this.activeChatId = id;
        this.activeChat = null; // Скидаємо кеш

        let loadedChat: Chat | null = null;
        if (id) {
            loadedChat = await this.getChat(id);
            if (!loadedChat) {
                this.plugin.logger.error(`Failed to load chat data AFTER validating ID ${id}. Resetting active chat to null.`);
                this.activeChatId = null;
                id = null;
            } else {
                this.activeChat = loadedChat;
            }
        }

        this.plugin.logger.info(`Active chat changed from ${previousActiveId} to ${id}`);
        this.plugin.emit('active-chat-changed', { chatId: id, chat: loadedChat });
    }

    async addMessageToActiveChat(role: MessageRole, content: string): Promise<Message | null> {
          const activeChat = await this.getActiveChat();
          if (!activeChat) { this.plugin.logger.error("Cannot add message: No active chat."); new Notice("Error: No active chat session."); return null; }

          const newMessage = activeChat.addMessage(role, content);
          this.plugin.logger.debug(`Added ${role} message to active chat ${activeChat.metadata.id}.`);

          if (this.chatIndex[activeChat.metadata.id]) {
              this.chatIndex[activeChat.metadata.id].lastModified = activeChat.metadata.lastModified;
              await this.saveChatIndex();
          }

          this.plugin.emit('message-added', { chatId: activeChat.metadata.id, message: newMessage });
          this.plugin.emit('chat-list-updated');
          return newMessage;
      }

    async clearActiveChatMessages(): Promise<void> {
          const activeChat = await this.getActiveChat();
          if (!activeChat) { this.plugin.logger.warn("Cannot clear messages: No active chat."); return; }

          this.plugin.logger.info(`Clearing messages for chat: ${activeChat.metadata.id}`);
          activeChat.clearMessages();

          if (this.chatIndex[activeChat.metadata.id]) {
               this.chatIndex[activeChat.metadata.id].lastModified = activeChat.metadata.lastModified;
               await this.saveChatIndex();
          }

          this.plugin.emit('messages-cleared', activeChat.metadata.id);
          this.plugin.emit('chat-list-updated');
      }

    async updateActiveChatMetadata(metadataUpdate: Partial<Omit<ChatMetadata, 'id' | 'createdAt'>>): Promise<boolean> {
          const activeChat = await this.getActiveChat();
          if (!activeChat) { this.plugin.logger.warn("Cannot update metadata, no active chat."); new Notice("No active chat to update metadata for."); return false; }
          this.plugin.logger.debug(`Updating metadata for active chat ${activeChat.metadata.id}:`, metadataUpdate);

          const oldRolePath = activeChat.metadata.selectedRolePath;
          const oldModelName = activeChat.metadata.modelName;

          const changed = activeChat.updateMetadata(metadataUpdate);

          if (changed) {
              this.plugin.logger.debug(`Metadata changed. Chat ${activeChat.metadata.id} save scheduled by Chat class.`);
               if (this.chatIndex[activeChat.metadata.id]) {
                 const meta = activeChat.metadata;
                 const storedMeta: ChatSessionStored = {
                     name: meta.name,
                     lastModified: meta.lastModified,
                     createdAt: meta.createdAt,
                      ...(meta.modelName && { modelName: meta.modelName }),
                      ...(meta.selectedRolePath && { selectedRolePath: meta.selectedRolePath }),
                      ...(meta.temperature !== undefined && { temperature: meta.temperature }),
                      ...(meta.contextWindow !== undefined && { contextWindow: meta.contextWindow }),
                 };
                 this.chatIndex[meta.id] = storedMeta;
                 await this.saveChatIndex();
               }

              const newRolePath = activeChat.metadata.selectedRolePath;
              const newModelName = activeChat.metadata.modelName;
              let roleChanged = false; let modelChanged = false;
              if (metadataUpdate.selectedRolePath !== undefined && oldRolePath !== newRolePath) { roleChanged = true; }
              if (metadataUpdate.modelName !== undefined && oldModelName !== newModelName) { modelChanged = true; }

              if (roleChanged) {
                  try { const newRoleName = await this.plugin.findRoleNameByPath(newRolePath); this.plugin.logger.debug(`Emitting 'role-changed': ${newRoleName}`); this.plugin.emit('role-changed', newRoleName); this.plugin.promptService?.clearRoleCache?.(); } catch (e) { this.plugin.logger.error("Error finding role name/emitting role-changed:", e); }
              }
              if (modelChanged) {
                  this.plugin.logger.debug(`Emitting 'model-changed': ${newModelName}`); this.plugin.emit('model-changed', newModelName || ""); this.plugin.promptService?.clearModelDetailsCache?.();
              }
               this.plugin.emit('active-chat-changed', { chatId: this.activeChatId, chat: activeChat });
               this.plugin.emit('chat-list-updated');

              return true;
          } else { this.plugin.logger.debug("Metadata update called, but no actual changes detected."); return false; }
      }

    async deleteChat(id: string): Promise<boolean> {
          this.plugin.logger.info(`Deleting chat ID: ${id}`);
          const chatExistedInIndex = !!this.chatIndex[id];
          const filePath = this.getChatFilePath(id);
          let success = true;
          try {
             if (this.loadedChats[id]) { delete this.loadedChats[id]; this.plugin.logger.debug(`Removed chat ${id} from memory cache.`); }
                 if (chatExistedInIndex) { delete this.chatIndex[id]; await this.saveChatIndex(); this.plugin.logger.debug(`Removed chat ${id} from index.`); }
                     if (await this.adapter.exists(filePath)) { await this.adapter.remove(filePath); this.plugin.logger.debug(`Removed chat file: ${filePath}`); }
                     else { if (chatExistedInIndex) { this.plugin.logger.warn(`Chat file not found during deletion (but was in index): ${filePath}`); } } }
          catch (error) { this.plugin.logger.error(`Error during deletion process for chat ${id} or its file ${filePath}:`, error); new Notice(`Error deleting chat ${id}.`); success = false; await this.loadChatIndex(true); }
          finally { if (id === this.activeChatId) { this.plugin.logger.info(`Deleted active chat ${id}. Selecting new active chat...`); const availableChats = this.listAvailableChats(); const nextActiveId = availableChats.length > 0 ? availableChats[0].id : null; await this.setActiveChat(nextActiveId); } this.plugin.emit('chat-list-updated'); }
          return success && chatExistedInIndex;
     }

    async cloneChat(chatIdToClone: string): Promise<Chat | null> {
         this.plugin.logger.info(`Cloning chat ID: ${chatIdToClone}`);
         const originalChat = await this.getChat(chatIdToClone);
         if (!originalChat) { this.plugin.logger.error(`Cannot clone: Original chat ${chatIdToClone} not found.`); new Notice("Original chat not found."); return null; }
         try {
             const clonedData = originalChat.toJSON();
             const now = new Date();
             const newId = uuidv4();
             const newFilePath = this.getChatFilePath(newId);

             clonedData.metadata.id = newId;
             clonedData.metadata.name = `Copy of ${originalChat.metadata.name}`;
             clonedData.metadata.createdAt = now.toISOString();
             clonedData.metadata.lastModified = now.toISOString();

             const constructorSettings: ChatConstructorSettings = { ...this.plugin.settings };
             const clonedChat = new Chat(this.adapter, constructorSettings, clonedData, newFilePath,this.plugin.logger);

             const saved = await this.saveChatAndUpdateIndex(clonedChat);
             if (!saved) throw new Error("Failed to save the cloned chat file.");

             this.loadedChats[newId] = clonedChat;
             await this.setActiveChat(newId);

             this.plugin.logger.info(`Cloned chat "${clonedChat.metadata.name}" created and activated.`);
             return clonedChat;
         } catch (error) { this.plugin.logger.error("Error cloning chat:", error); new Notice("An error occurred while cloning the chat."); return null; }
     }

    async deleteMessagesAfter(chatId: string, userMessageIndex: number): Promise<boolean> {
         this.plugin.logger.info(`Deleting messages after index ${userMessageIndex} for chat ${chatId}`);
         const chat = await this.getChat(chatId);
         if (!chat) { this.plugin.logger.error(`Cannot delete messages: Chat ${chatId} not found.`); return false; }

         if (userMessageIndex < 0 || userMessageIndex >= chat.messages.length - 1) {
             this.plugin.logger.warn(`Invalid index (${userMessageIndex}) or last message, nothing to delete after in chat ${chatId}.`);
             return true;
         }

         const originalLength = chat.messages.length;
         chat.messages = chat.messages.slice(0, userMessageIndex + 1);
         chat.updateMetadata({});
         this.plugin.logger.debug(`Messages for chat ${chatId} truncated from ${originalLength} to ${chat.messages.length}. Save scheduled.`);

         if (this.chatIndex[chatId]) {
              this.chatIndex[chatId].lastModified = chat.metadata.lastModified;
              await this.saveChatIndex();
         }

         if (this.activeChatId === chatId) {
             this.activeChat = chat;
             this.plugin.logger.debug(`Updated active chat cache for ${chatId} after message deletion.`);
         }
         // Повідомляємо View про зміну контенту, щоб він перемалювався
         this.plugin.emit('active-chat-changed', { chatId: chatId, chat: chat });
         return true;
     }

    // --- НОВИЙ МЕТОД: Видалення конкретного повідомлення за міткою часу ---
    async deleteMessageByTimestamp(chatId: string, timestampToDelete: Date): Promise<boolean> {
        this.plugin.logger.info(`Attempting to delete message with timestamp ${timestampToDelete.toISOString()} from chat ${chatId}`);

        const chat = await this.getChat(chatId); // Отримуємо об'єкт чату (з кешу або файлу)
        if (!chat) {
            this.plugin.logger.error(`Cannot delete message: Chat ${chatId} not found.`);
            new Notice(`Error: Chat ${chatId} not found.`);
            return false;
        }

        const initialMessageCount = chat.messages.length;

        // Знаходимо індекс повідомлення для видалення, порівнюючи час
        const messageIndex = chat.messages.findIndex(
            msg => msg.timestamp.getTime() === timestampToDelete.getTime()
        );

        if (messageIndex === -1) {
            this.plugin.logger.warn(`Message with timestamp ${timestampToDelete.toISOString()} not found in chat ${chatId}. Cannot delete.`);
            return false; // Повідомлення не знайдено
        }

        try {
            // Видаляємо повідомлення з масиву
            const deletedMessage = chat.messages.splice(messageIndex, 1)[0];
            this.plugin.logger.debug(`Removed message at index ${messageIndex} (Role: ${deletedMessage?.role}) from chat ${chatId}.`);

            if (chat.messages.length < initialMessageCount) {
                // Оновлюємо метадані (lastModified) та ініціюємо збереження чату
                chat.updateMetadata({}); // Викличе debounced save

                // Оновлюємо індекс негайно
                if (this.chatIndex[chatId]) {
                    this.chatIndex[chatId].lastModified = chat.metadata.lastModified;
                    await this.saveChatIndex();
                    this.plugin.logger.debug(`Updated chat index for ${chatId} after message deletion.`);
                }

                // Оновлюємо кеш активного чату, якщо це він
                if (this.activeChatId === chatId) {
                    this.activeChat = chat;
                    this.plugin.logger.debug(`Updated active chat cache for ${chatId} after message deletion.`);
                }

                // Повідомляємо View про зміну контенту активного чату
                this.plugin.emit('message-deleted', { chatId: chatId, timestamp: timestampToDelete });
                // Подію chat-list-updated залишаємо, бо змінився lastModified
                // this.plugin.emit('chat-list-updated');                // Повідомляємо про зміну списку (через lastModified)
                this.plugin.emit('chat-list-updated');

                return true; // Успішно видалено
            } else {
                 this.plugin.logger.warn(`Message deletion for chat ${chatId}, timestamp ${timestampToDelete.toISOString()} seemed to fail (length unchanged).`);
                 return false;
            }
        } catch (error) {
            this.plugin.logger.error(`Error during message deletion process for chat ${chatId}, timestamp ${timestampToDelete.toISOString()}:`, error);
            new Notice("Error deleting message.");
            return false;
        }
    }
// ChatManager.ts

    // --- НОВИЙ МЕТОД: Очищення повідомлень для конкретного чату за ID ---
    async clearChatMessagesById(chatId: string): Promise<boolean> {
        this.plugin.logger.info(`Attempting to clear messages for chat ${chatId}`);

        const chat = await this.getChat(chatId); // Отримуємо об'єкт чату
        if (!chat) {
            this.plugin.logger.error(`Cannot clear messages: Chat ${chatId} not found.`);
            new Notice(`Error: Chat ${chatId} not found.`);
            return false;
        }

        // Перевіряємо, чи є що очищати
        if (chat.messages.length === 0) {
             this.plugin.logger.debug(`Chat ${chatId} already has no messages. Nothing to clear.`);
             return true; // Вважаємо операцію успішною
        }

        try {
            // Використовуємо існуючий метод об'єкта Chat
            chat.clearMessages(); // Цей метод оновить lastModified і викличе save() (з debounce)
            this.plugin.logger.debug(`Messages cleared for chat ${chatId}. Save scheduled by Chat class.`);

            // Оновлюємо індекс негайно
            if (this.chatIndex[chatId]) {
                this.chatIndex[chatId].lastModified = chat.metadata.lastModified;
                await this.saveChatIndex();
                this.plugin.logger.debug(`Updated chat index for ${chatId} after clearing messages.`);
            }

            // Оновлюємо кеш активного чату, якщо це був він
            const isActive = chatId === this.activeChatId;
            if (isActive) {
                this.activeChat = chat; // Оновлюємо посилання на змінений об'єкт
                this.plugin.logger.debug(`Updated active chat cache for ${chatId} after clearing messages.`);
                // Генеруємо подію, яку OllamaView вже обробляє для очищення активного чату
                this.plugin.emit('messages-cleared', chatId);
            }

            // Завжди генеруємо подію оновлення списку, бо змінився lastModified
            this.plugin.emit('chat-list-updated');

            return true; // Успішно очищено (або збереження заплановано)

        } catch (error) {
             this.plugin.logger.error(`Error during message clearing process for chat ${chatId}:`, error);
             new Notice("Error clearing messages.");
             return false;
        }
    }
    // --- Кінець нового методу ---

} // End of ChatManager class