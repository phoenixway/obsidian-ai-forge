// ChatManager.ts
import { App, Notice, DataAdapter, normalizePath, TFolder, debounce } from "obsidian";
import OllamaPlugin, { ACTIVE_CHAT_ID_KEY, CHAT_INDEX_KEY } from "./main";
import { Chat, ChatMetadata, ChatData, ChatConstructorSettings } from "./Chat";
import { MessageRole, Message } from './OllamaView'; // Припускаємо, що типи тут
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
        await this.loadChatIndex(true); // Завжди скануємо при ініціалізації для надійності
        // Завантажуємо активний ID після ініціалізації індексу
        const savedActiveId = await this.plugin.loadDataKey(ACTIVE_CHAT_ID_KEY);
         if (savedActiveId && this.chatIndex[savedActiveId]) {
             this.plugin.logger.info(`Restoring active chat ID from settings: ${savedActiveId}`);
             await this.setActiveChat(savedActiveId); // Викликаємо setActiveChat тут
         } else {
             if (savedActiveId) this.plugin.logger.warn(`Saved active chat ID ${savedActiveId} not found in index, clearing.`);
              await this.plugin.saveDataKey(ACTIVE_CHAT_ID_KEY, null); // Очищаємо невалідний ID
             // Активуємо перший доступний чат, якщо є
              const availableChats = this.listAvailableChats();
              if (availableChats.length > 0) {
                   await this.setActiveChat(availableChats[0].id);
              }
         }
        this.plugin.logger.info(`ChatManager initialized. Index has ${Object.keys(this.chatIndex).length} chats. Active ID: ${this.activeChatId}`);
    }

    updateChatsFolderPath(): void {
        const settingsPath = this.plugin.settings.chatHistoryFolderPath?.trim();
        // За замовчуванням використовуємо корінь сховища "/"
        this.chatsFolderPath = (settingsPath) ? normalizePath(settingsPath) : "/";
        // Додаємо перевірку, щоб не було "/" в кінці, окрім самого кореня
        if (this.chatsFolderPath !== "/" && this.chatsFolderPath.endsWith('/')) {
             this.chatsFolderPath = this.chatsFolderPath.slice(0, -1);
        }
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
         const historyPath = this.plugin.settings.chatHistoryFolderPath?.trim();
         const exportPath = this.plugin.settings.chatExportFolderPath?.trim();
         this.plugin.logger.debug(`Ensuring folders exist: History='${historyPath}', Export='${exportPath}'`);
         const checkAndCreate = async (folderPath: string | undefined | null, folderDesc: string) => {
             if (!folderPath || folderPath === "/") return; // Не створюємо корінь
             const normalized = normalizePath(folderPath);
             try {
                 const exists = await this.adapter.exists(normalized);
                 if (!exists) {
                     this.plugin.logger.info(`${folderDesc} folder doesn't exist. Creating: ${normalized}`);
                     await this.adapter.mkdir(normalized);
                 } else {
                     const stat = await this.adapter.stat(normalized);
                     if (stat?.type !== 'folder') {
                         this.plugin.logger.error(`Path for ${folderDesc} exists but is not a folder: ${normalized}`);
                         new Notice(`Error: Path for ${folderDesc} is not a folder.`);
                     } else {
                          this.plugin.logger.debug(`${folderDesc} folder already exists: ${normalized}`);
                     }
                 }
             } catch (error) {
                 this.plugin.logger.error(`Error creating/checking ${folderDesc} directory '${normalized}':`, error);
                 new Notice(`Error creating folder for ${folderDesc}. Check settings and permissions.`);
             }
         };
         await checkAndCreate(historyPath, "Chat History");
         await checkAndCreate(exportPath, "Chat Export");
     }

    private async loadChatIndex(forceScan: boolean = false): Promise<void> {
        this.plugin.logger.debug(`Loading chat index... (forceScan: ${forceScan})`);
        const storedIndex = await this.plugin.loadDataKey(CHAT_INDEX_KEY);

        const settingsPath = this.plugin.settings.chatHistoryFolderPath?.trim();
        const currentPath = (settingsPath && settingsPath !== '/') ? normalizePath(settingsPath) : "/";
        if (currentPath !== this.chatsFolderPath) {
             this.plugin.logger.info("Chat history folder path changed, forcing index rescan.");
             this.updateChatsFolderPath();
             forceScan = true;
        }


        if (!forceScan && storedIndex && typeof storedIndex === 'object' && Object.keys(storedIndex).length > 0) {
             const firstKey = Object.keys(storedIndex)[0];
             if (storedIndex[firstKey] && typeof storedIndex[firstKey].name === 'string') {
                  this.chatIndex = storedIndex;
                  this.plugin.logger.debug(`Loaded ${Object.keys(this.chatIndex).length} chat(s) from stored index.`);
                  return;
             } else {
                  this.plugin.logger.warn("Stored chat index seems invalid, forcing rescan.");
                  forceScan = true;
             }
        } else if (!forceScan) {
             this.plugin.logger.info("No valid stored index found or empty, forcing rescan.");
             forceScan = true;
        }

        if (forceScan) {
             await this.rebuildIndexFromFiles();
        }
    }

    private async rebuildIndexFromFiles(): Promise<void> {
         this.plugin.logger.info(`Rebuilding chat index by scanning files in: ${this.chatsFolderPath}`);
         const newIndex: ChatSessionIndex = {};
         let filesScanned = 0;
         let chatsLoaded = 0;

         try {
             if (this.chatsFolderPath !== "/" && !(await this.adapter.exists(this.chatsFolderPath))) {
                 this.plugin.logger.warn(`Chat history folder '${this.chatsFolderPath}' not found during scan. Creating it.`);
                  try {
                       await this.adapter.mkdir(this.chatsFolderPath);
                       this.plugin.logger.info(`Created chat history folder: ${this.chatsFolderPath}`);
                  } catch (mkdirError) {
                       this.plugin.logger.error(`Failed to create chat history folder ${this.chatsFolderPath}. Index will be empty.`, mkdirError);
                       this.chatIndex = {};
                       await this.saveChatIndex();
                       return;
                  }
             } else if (this.chatsFolderPath !== "/" && (await this.adapter.stat(this.chatsFolderPath))?.type !== 'folder') {
                  this.plugin.logger.error(`Chat history path '${this.chatsFolderPath}' exists but is not a folder. Index will be empty.`);
                  this.chatIndex = {};
                  await this.saveChatIndex();
                  return;
             }


             const listResult = await this.adapter.list(this.chatsFolderPath);
             const chatFiles = listResult.files.filter(filePath => {
                  const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
                   const isInCurrentFolder = normalizePath(filePath).split('/').length === (this.chatsFolderPath === '/' ? 1 : this.chatsFolderPath.split('/').length + 1);
                  return isInCurrentFolder && fileName.endsWith('.json') && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.json$/.test(fileName);
             });

             filesScanned = chatFiles.length;
             this.plugin.logger.debug(`Found ${filesScanned} potential chat files to scan.`);

             for (const fullPath of chatFiles) {
                  const fileName = fullPath.substring(fullPath.lastIndexOf('/') + 1);
                  const chatId = fileName.slice(0, -5);

                  try {
                      const jsonContent = await this.adapter.read(fullPath);
                      const data = JSON.parse(jsonContent) as Partial<ChatData>;

                      if (data?.metadata?.id === chatId &&
                          typeof data.metadata.name === 'string' && data.metadata.name.trim() !== '' &&
                          data.metadata.lastModified && !isNaN(new Date(data.metadata.lastModified).getTime()) &&
                          data.metadata.createdAt && !isNaN(new Date(data.metadata.createdAt).getTime()))
                      {
                         const meta = data.metadata;
                         newIndex[chatId] = {
                             name: meta.name,
                             lastModified: new Date(meta.lastModified).toISOString(),
                             createdAt: new Date(meta.createdAt).toISOString(),
                             ...(meta.modelName && { modelName: meta.modelName }),
                             ...(meta.selectedRolePath && { selectedRolePath: meta.selectedRolePath }),
                             ...(typeof meta.temperature === 'number' && { temperature: meta.temperature }),
                             ...(typeof meta.contextWindow === 'number' && { contextWindow: meta.contextWindow }),
                         };
                         chatsLoaded++;
                     } else { this.plugin.logger.warn(`Metadata validation FAILED for file: ${fullPath}. ID: ${chatId}. Required fields: name, lastModified, createdAt.`, data?.metadata); }
                  } catch (e) { this.plugin.logger.error(`Error reading or parsing chat file ${fullPath} during index scan:`, e); }
             }

             this.chatIndex = newIndex;
             await this.saveChatIndex();
             this.plugin.logger.info(`Index rebuilt: ${chatsLoaded} chats loaded from ${filesScanned} scanned files.`);

         } catch (error: any) {
               if (error.code === 'EPERM' || error.code === 'EACCES') {
                    this.plugin.logger.error(`Permission error accessing chat history folder ${this.chatsFolderPath}. Please check permissions. Index rebuild failed.`, error);
                    new Notice(`Permission error accessing chat folder: ${this.chatsFolderPath}`);
               } else {
                    this.plugin.logger.error(`Critical error during index rebuild scan in ${this.chatsFolderPath}:`, error);
               }
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
         if (this.chatsFolderPath === "/") {
              return normalizePath(fileName);
         } else {
              return normalizePath(`${this.chatsFolderPath}/${fileName}`);
         }
    }

    async saveChatAndUpdateIndex(chat: Chat): Promise<boolean> {
        try {
            // Викликаємо збереження самого чату (в класі Chat є debounce)
            // Припускаємо, що якщо помилки немає, то збереження заплановано.
            await chat.save(); // Метод повертає void або Promise<void>

            // --- Цей код тепер виконується завжди після await chat.save() ---
            const meta = chat.metadata;
            const storedMeta: ChatSessionStored = {
                name: meta.name,
                lastModified: meta.lastModified, // Використовуємо оновлений час з метаданих чату
                createdAt: meta.createdAt,
                 ...(meta.modelName && { modelName: meta.modelName }),
                 ...(meta.selectedRolePath && { selectedRolePath: meta.selectedRolePath }),
                 ...(typeof meta.temperature === 'number' && { temperature: meta.temperature }),
                 ...(typeof meta.contextWindow === 'number' && { contextWindow: meta.contextWindow }),
            };

            // Перевіряємо, чи потрібно оновлювати індекс, щоб уникнути зайвих записів/подій
            if (JSON.stringify(this.chatIndex[meta.id]) !== JSON.stringify(storedMeta)) {
                this.chatIndex[meta.id] = storedMeta;
                await this.saveChatIndex(); // Зберігаємо оновлений індекс
                this.plugin.emit('chat-list-updated'); // Сповіщаємо про оновлення списку
                this.plugin.logger.debug(`Chat index updated for ${meta.id} after save trigger.`);
            } else {
                 this.plugin.logger.debug(`Index for chat ${meta.id} unchanged after save trigger, skipping index save/event.`);
            }
            return true; // Повертаємо true, оскільки помилки не було
            // --- Кінець блоку, що виконується завжди ---

        } catch (error) {
             // Якщо chat.save() викинув помилку (малоймовірно для debounce, але можливо)
             this.plugin.logger.error(`Error occurred during chat.save() for chat ${chat?.metadata?.id}:`, error);
             // Не оновлюємо індекс при помилці збереження
             return false; // Повертаємо false, бо сталася помилка
        }
    }
    
    async createNewChat(name?: string): Promise<Chat | null> {
        this.plugin.logger.info(`Creating new chat...`);
        await this.ensureFoldersExist();
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

            // Спочатку додаємо в індекс, потім зберігаємо
            const storedMeta: ChatSessionStored = {
                name: initialMetadata.name,
                lastModified: initialMetadata.lastModified,
                createdAt: initialMetadata.createdAt,
                 ...(initialMetadata.modelName && { modelName: initialMetadata.modelName }),
                 ...(initialMetadata.selectedRolePath && { selectedRolePath: initialMetadata.selectedRolePath }),
                 ...(typeof initialMetadata.temperature === 'number' && { temperature: initialMetadata.temperature }),
                 ...(typeof initialMetadata.contextWindow === 'number' && { contextWindow: initialMetadata.contextWindow }),
            };
            this.chatIndex[newId] = storedMeta;
            await this.saveChatIndex(); // Зберегти індекс
            this.plugin.emit('chat-list-updated'); // Сповістити UI

            // Зберігаємо сам файл чату
            const savedImmediately = await newChat.saveImmediately();
            if (!savedImmediately) {
                delete this.chatIndex[newId]; // Видалити з індексу, якщо збереження файлу не вдалось
                await this.saveChatIndex();
                this.plugin.emit('chat-list-updated');
                throw new Error("Failed to save initial chat file.");
            }

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
                if (!storedMeta || typeof storedMeta !== 'object' || typeof storedMeta.name !== 'string' || typeof storedMeta.lastModified !== 'string' || typeof storedMeta.createdAt !== 'string') {
                    this.plugin.logger.warn(`Invalid or incomplete metadata found in index for chat ID: ${id}. Skipping in list.`, storedMeta);
                    return null;
                }
                 if (isNaN(new Date(storedMeta.lastModified).getTime()) || isNaN(new Date(storedMeta.createdAt).getTime())) {
                     this.plugin.logger.warn(`Invalid date format found in index for chat ID: ${id}. Skipping.`, storedMeta);
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
             .sort((a, b) => {
                  const dateA = new Date(a.lastModified).getTime();
                  const dateB = new Date(b.lastModified).getTime();
                   if (dateB !== dateA) {
                        return dateB - dateA;
                   }
                    const createdA = new Date(a.createdAt).getTime();
                    const createdB = new Date(b.createdAt).getTime();
                    return createdB - createdA;
             });
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
               this.plugin.logger.warn(`Chat ID ${id} not found in index during getChat. Attempting rescan...`);
               await this.rebuildIndexFromFiles();
               if (!this.chatIndex[id]) {
                    this.plugin.logger.error(`Chat ID ${id} still not found in index after rescan.`);
                    return null;
               }
               this.plugin.logger.info(`Chat ID ${id} found in index after rescan.`);
          }

          const filePath = this.getChatFilePath(id);
          try {
              const chat = await Chat.loadFromFile(filePath, this.adapter, this.plugin.settings, this.plugin.logger);

              if (chat) {
                  this.plugin.logger.debug(`Successfully loaded chat ${id}. Caching.`);
                  this.loadedChats[id] = chat;
                  // Перевірка і оновлення індексу, якщо метадані відрізняються
                   const storedMeta = this.chatIndex[id];
                   const currentMeta = chat.metadata;
                   const indexMetaForCompare = { // Створюємо об'єкт з індексу для порівняння
                       name: storedMeta.name,
                       lastModified: storedMeta.lastModified,
                       createdAt: storedMeta.createdAt,
                       modelName: storedMeta.modelName,
                       selectedRolePath: storedMeta.selectedRolePath,
                       temperature: storedMeta.temperature,
                       contextWindow: storedMeta.contextWindow,
                   };
                   const fileMetaForCompare = { // Створюємо об'єкт з файлу для порівняння
                        name: currentMeta.name,
                        lastModified: currentMeta.lastModified,
                        createdAt: currentMeta.createdAt,
                        modelName: currentMeta.modelName,
                        selectedRolePath: currentMeta.selectedRolePath,
                        temperature: currentMeta.temperature,
                        contextWindow: currentMeta.contextWindow,
                   };
                    if (JSON.stringify(indexMetaForCompare) !== JSON.stringify(fileMetaForCompare)) {
                         this.plugin.logger.warn(`Metadata mismatch between index and loaded file for ${id}. Updating index.`);
                         await this.saveChatAndUpdateIndex(chat); // Оновлюємо індекс та генеруємо подію
                    }
                  return chat;
              } else {
                  this.plugin.logger.error(`Chat.loadFromFile returned null for ${id}. Removing from index if still present.`);
                  await this.deleteChatFileAndIndexEntry(id, filePath);
                  if (this.activeChatId === id) await this.setActiveChat(null);
                  return null;
              }
          } catch (error: any) {
              this.plugin.logger.error(`Unexpected error during getChat for ${id} from ${filePath}:`, error);
              if (error.code === 'ENOENT') {
                    this.plugin.logger.warn(`File not found for chat ${id} during getChat. Removing from index.`);
                    await this.deleteChatFileAndIndexEntry(id, filePath, false);
                    if (this.activeChatId === id) await this.setActiveChat(null);
              }
              return null;
          }
      }

    private async deleteChatFileAndIndexEntry(id: string, filePath: string, deleteFile: boolean = true): Promise<void> {
        let indexChanged = false;
        if (this.loadedChats[id]) delete this.loadedChats[id];
        if (this.chatIndex[id]) {
             delete this.chatIndex[id];
             indexChanged = true; // Позначка, що індекс змінився
        }
        if (deleteFile) {
             try { if (await this.adapter.exists(filePath)) await this.adapter.remove(filePath); }
             catch (e) { this.plugin.logger.error(`Error removing chat file ${filePath} during cleanup:`, e); }
        }
         // Зберігаємо індекс і генеруємо подію тільки якщо він змінився
         if (indexChanged) {
              await this.saveChatIndex();
              this.plugin.emit('chat-list-updated');
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
        this.plugin.logger.debug(`Active chat ${this.activeChatId} not in active cache or ID mismatch, calling getChat...`);
        const chat = await this.getChat(this.activeChatId);
        if (chat) {
            this.activeChat = chat;
            return chat;
        } else {
             this.plugin.logger.warn(`Failed to load active chat ${this.activeChatId} via getChat. Perhaps it was deleted?`);
             // Спробуємо знайти інший чат для активації
             const availableChats = this.listAvailableChats();
             const nextActiveId = availableChats.length > 0 ? availableChats[0].id : null;
             this.plugin.logger.info(`Setting active chat to ${nextActiveId} after failing to load ${this.activeChatId}`);
             await this.setActiveChat(nextActiveId); // Це викличе 'active-chat-changed'
             return null; // Повертаємо null, бо поточний активний чат не вдалося завантажити
        }
    }

    public async setActiveChat(id: string | null): Promise<void> {
        this.plugin.logger.debug(`setActiveChat called with ID: ${id}`);
        const previousActiveId = this.activeChatId;

        if (id && !this.chatIndex[id]) {
            this.plugin.logger.error(`Attempted to set active chat to non-existent ID: ${id}. Reloading index and trying again...`);
            await this.rebuildIndexFromFiles();
            if (!this.chatIndex[id]) {
                 this.plugin.logger.error(`Chat ID ${id} still not found after index reload. Aborting setActiveChat.`);
                 new Notice(`Error: Chat with ID ${id} not found.`);
                  if (this.activeChatId === id) {
                       this.activeChatId = null;
                       this.activeChat = null;
                       this.plugin.emit('active-chat-changed', { chatId: null, chat: null });
                  }
                 return;
            }
             this.plugin.logger.info(`Chat ID ${id} found after index reload. Proceeding.`);
        }

        if (id === previousActiveId) {
            this.plugin.logger.debug(`Chat ${id} is already active.`);
             if (id && !this.activeChat) {
                  this.plugin.logger.debug(`Active chat cache was null for active ID ${id}. Reloading.`);
                  this.activeChat = await this.getChat(id);
             }
            return;
        }

        this.activeChatId = id;
        this.activeChat = null; // Скидаємо кеш активного об'єкту

        let loadedChat: Chat | null = null;
        if (id) {
            loadedChat = await this.getChat(id);
            if (!loadedChat) {
                this.plugin.logger.error(`CRITICAL: Failed to load chat ${id} via getChat even though it was in the index. Resetting active chat to null.`);
                this.activeChatId = null;
                id = null;
            } else {
                 this.activeChat = loadedChat;
                 this.plugin.logger.debug(`Set active chat cache to ID: ${id}`);
            }
        } else {
             this.plugin.logger.info("Active chat set to null.");
        }

        this.plugin.logger.info(`Active chat changed from ${previousActiveId} to ${id}`);
        this.plugin.emit('active-chat-changed', { chatId: id, chat: loadedChat });
    }

    async addMessageToActiveChat(role: MessageRole, content: string, timestamp?: Date): Promise<Message | null> {
        const activeChat = await this.getActiveChat();
        if (!activeChat) {
            this.plugin.logger.error("Cannot add message: No active chat.");
            new Notice("Error: No active chat session.");
            return null;
        }

        const messageTimestamp = timestamp || new Date();
        // Припускаємо, що Chat.addMessage оновлено для прийняття timestamp
        // Якщо ні, потрібно змінити Chat.ts або логіку тут
        const newMessage = activeChat.addMessage(role, content, messageTimestamp); // Передаємо timestamp

        this.plugin.logger.debug(`Added ${role} message with timestamp ${messageTimestamp.toISOString()} to active chat ${activeChat.metadata.id}.`);

        // Оновлюємо індекс та сповіщаємо UI
        // Використовуємо saveChatAndUpdateIndex, який вже містить потрібну логіку
        await this.saveChatAndUpdateIndex(activeChat);

        this.plugin.emit('message-added', { chatId: activeChat.metadata.id, message: newMessage });
        // chat-list-updated вже викликається в saveChatAndUpdateIndex
        // this.plugin.emit('chat-list-updated');
        return newMessage;
    }

    async clearActiveChatMessages(): Promise<void> {
        const activeChat = await this.getActiveChat();
        if (!activeChat) {
            this.plugin.logger.warn("Cannot clear messages: No active chat.");
            return;
        }

        this.plugin.logger.info(`Clearing messages for chat: ${activeChat.metadata.id}`);
        activeChat.clearMessages(); // Очищує та оновлює lastModified

        // Оновлюємо індекс та сповіщаємо UI
        await this.saveChatAndUpdateIndex(activeChat); // Це збереже чат та індекс і викличе chat-list-updated

        this.plugin.emit('messages-cleared', activeChat.metadata.id);
    }

    // --- ВИПРАВЛЕНО: Прибрано перевірку 'changed' ---
    async updateActiveChatMetadata(metadataUpdate: Partial<Omit<ChatMetadata, 'id' | 'createdAt'>>): Promise<boolean> {
        const activeChat = await this.getActiveChat();
        if (!activeChat) {
            this.plugin.logger.warn("Cannot update metadata, no active chat.");
            new Notice("No active chat to update metadata for.");
            return false;
        }
        this.plugin.logger.debug(`Updating metadata for active chat ${activeChat.metadata.id}:`, metadataUpdate);

        // Зберігаємо старі значення для порівняння ПОТІМ
        const oldRolePath = activeChat.metadata.selectedRolePath;
        const oldModelName = activeChat.metadata.modelName;
        const oldName = activeChat.metadata.name;
        const oldTemperature = activeChat.metadata.temperature;
        const oldContextWindow = activeChat.metadata.contextWindow;

        // Викликаємо метод Chat для оновлення метаданих
        // Припускаємо, що він повертає void і кидає помилку при невдачі
        activeChat.updateMetadata(metadataUpdate);
        this.plugin.logger.debug(`Metadata updated in Chat object for ${activeChat.metadata.id}. Save scheduled.`);

        // Оновлюємо індекс та генеруємо події, оскільки виклик пройшов без помилок
        // Використовуємо saveChatAndUpdateIndex для консистентності
        await this.saveChatAndUpdateIndex(activeChat);

        // Визначаємо, які саме поля змінилися, для генерації подій
        const newMeta = activeChat.metadata; // Отримуємо оновлені метадані
        let roleChanged = false;
        let modelChanged = false;
        // Порівнюємо з попередніми значеннями
        if (metadataUpdate.selectedRolePath !== undefined && oldRolePath !== newMeta.selectedRolePath) { roleChanged = true; }
        if (metadataUpdate.modelName !== undefined && oldModelName !== newMeta.modelName) { modelChanged = true; }
        // Додамо перевірки для інших полів, якщо для них потрібні окремі події
        // let nameChanged = (metadataUpdate.name !== undefined && oldName !== newMeta.name);
        // let tempChanged = (metadataUpdate.temperature !== undefined && oldTemperature !== newMeta.temperature);
        // let contextChanged = (metadataUpdate.contextWindow !== undefined && oldContextWindow !== newMeta.contextWindow);

        // Генеруємо відповідні події
        if (roleChanged) {
            try {
                const newRoleName = await this.plugin.findRoleNameByPath(newMeta.selectedRolePath);
                this.plugin.logger.debug(`Emitting 'role-changed': ${newRoleName}`);
                this.plugin.emit('role-changed', newRoleName);
                this.plugin.promptService?.clearRoleCache?.();
            } catch (e) {
                this.plugin.logger.error("Error finding role name/emitting role-changed:", e);
            }
        }
        if (modelChanged) {
            this.plugin.logger.debug(`Emitting 'model-changed': ${newMeta.modelName}`);
            this.plugin.emit('model-changed', newMeta.modelName || "");
            this.plugin.promptService?.clearModelDetailsCache?.();
        }

        // Завжди емітуємо 'active-chat-changed', бо метадані потенційно змінилися
        this.plugin.emit('active-chat-changed', { chatId: this.activeChatId, chat: activeChat });
        // chat-list-updated вже викликається в saveChatAndUpdateIndex

        return true; // Повертаємо true, оскільки операція пройшла
    }
    // --- Кінець виправлення ---

    async deleteChat(id: string): Promise<boolean> {
        this.plugin.logger.info(`Deleting chat ID: ${id}`);
        const chatExistedInIndex = !!this.chatIndex[id];
        const filePath = this.getChatFilePath(id);
        let success = true;
        const wasActive = (id === this.activeChatId); // Запам'ятовуємо, чи був чат активним

        try {
            if (this.loadedChats[id]) delete this.loadedChats[id];
            if (wasActive) this.activeChat = null; // Очищуємо кеш активного

            let indexChanged = false;
            if (this.chatIndex[id]) {
                delete this.chatIndex[id];
                indexChanged = true;
            }

            // Спробуємо видалити файл
            try {
                 if (await this.adapter.exists(filePath)) {
                     await this.adapter.remove(filePath);
                     this.plugin.logger.debug(`Removed chat file: ${filePath}`);
                 } else if (chatExistedInIndex) {
                      this.plugin.logger.warn(`Chat file not found during deletion (but was in index): ${filePath}`);
                 }
            } catch (fileError) {
                 this.plugin.logger.error(`Error removing chat file ${filePath}:`, fileError);
                 // Не вважаємо це критичною помилкою для повернення false, але логуємо
            }

            // Зберігаємо індекс, якщо він змінився
            if (indexChanged) {
                 await this.saveChatIndex();
                 this.plugin.logger.debug(`Removed chat ${id} from index.`);
                 this.plugin.emit('chat-list-updated'); // Сповіщаємо про зміну списку
            }

        } catch (error) {
            this.plugin.logger.error(`Error during deletion process for chat ${id}:`, error);
            new Notice(`Error deleting chat ${id}.`);
            success = false;
            await this.rebuildIndexFromFiles(); // Перебудова індексу при помилці
        } finally {
            // Якщо видалено активний чат, вибрати наступний активний
            if (wasActive) {
                this.plugin.logger.info(`Deleted active chat ${id}. Selecting new active chat...`);
                const availableChats = this.listAvailableChats();
                const nextActiveId = availableChats.length > 0 ? availableChats[0].id : null;
                // setActiveChat викличе події active-chat-changed та збереже ID
                await this.setActiveChat(nextActiveId);
            } else if (success && chatExistedInIndex) {
                 // Якщо видалено НЕ активний чат і все пройшло добре, подія chat-list-updated вже згенерована
            }
        }
        return success && chatExistedInIndex; // Успіх, якщо не було помилок і запис існував
    }


    async cloneChat(chatIdToClone: string): Promise<Chat | null> {
         this.plugin.logger.info(`Cloning chat ID: ${chatIdToClone}`);
         const originalChat = await this.getChat(chatIdToClone);
         if (!originalChat) {
             this.plugin.logger.error(`Cannot clone: Original chat ${chatIdToClone} not found.`);
             new Notice("Original chat not found.");
             return null;
         }
         await this.ensureFoldersExist();
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
             const clonedChat = new Chat(this.adapter, constructorSettings, clonedData, newFilePath, this.plugin.logger);

             // Додаємо в індекс, потім зберігаємо
             const storedMeta: ChatSessionStored = {
                 name: clonedData.metadata.name,
                 lastModified: clonedData.metadata.lastModified,
                 createdAt: clonedData.metadata.createdAt,
                  ...(clonedData.metadata.modelName && { modelName: clonedData.metadata.modelName }),
                  ...(clonedData.metadata.selectedRolePath && { selectedRolePath: clonedData.metadata.selectedRolePath }),
                  ...(typeof clonedData.metadata.temperature === 'number' && { temperature: clonedData.metadata.temperature }),
                  ...(typeof clonedData.metadata.contextWindow === 'number' && { contextWindow: clonedData.metadata.contextWindow }),
             };
             this.chatIndex[newId] = storedMeta;
             await this.saveChatIndex();
             this.plugin.emit('chat-list-updated');

             const savedImmediately = await clonedChat.saveImmediately();
             if (!savedImmediately) {
                 delete this.chatIndex[newId];
                 await this.saveChatIndex();
                 this.plugin.emit('chat-list-updated');
                 throw new Error("Failed to save the cloned chat file.");
             }

             this.loadedChats[newId] = clonedChat;
             await this.setActiveChat(newId);

             this.plugin.logger.info(`Cloned chat "${clonedChat.metadata.name}" created and activated.`);
             return clonedChat;
         } catch (error) {
             this.plugin.logger.error("Error cloning chat:", error);
             new Notice("An error occurred while cloning the chat.");
             return null;
         }
     }

    async deleteMessagesAfter(chatId: string, userMessageIndex: number): Promise<boolean> {
         this.plugin.logger.info(`Deleting messages after index ${userMessageIndex} for chat ${chatId}`);
         const chat = await this.getChat(chatId);
         if (!chat) {
             this.plugin.logger.error(`Cannot delete messages: Chat ${chatId} not found.`);
             return false;
         }

         if (userMessageIndex < -1 || userMessageIndex >= chat.messages.length) {
             this.plugin.logger.warn(`Invalid index (${userMessageIndex}) for chat ${chatId} with ${chat.messages.length} messages.`);
             return false;
         }
         if (userMessageIndex === chat.messages.length - 1) {
              this.plugin.logger.debug(`Index ${userMessageIndex} points to the last message. Nothing to delete after.`);
              return true;
         }


         const originalLength = chat.messages.length;
         chat.messages.length = userMessageIndex + 1; // Обрізаємо масив
         chat.updateMetadata({}); // Оновлюємо lastModified -> запускає save()
         this.plugin.logger.debug(`Messages for chat ${chatId} truncated from ${originalLength} to ${chat.messages.length}. Save scheduled.`);

         // Оновлюємо індекс та сповіщаємо UI
         await this.saveChatAndUpdateIndex(chat); // Збереже чат, індекс і викличе chat-list-updated

         if (this.activeChatId === chatId) {
             this.activeChat = chat;
             this.plugin.logger.debug(`Updated active chat cache for ${chatId} after message deletion.`);
             // Генеруємо подію про зміну активного чату
             this.plugin.emit('active-chat-changed', { chatId: chatId, chat: chat });
         }

         return true;
     }

    async deleteMessageByTimestamp(chatId: string, timestampToDelete: Date): Promise<boolean> {
        this.plugin.logger.info(`Attempting to delete message with timestamp ${timestampToDelete.toISOString()} from chat ${chatId}`);
        const chat = await this.getChat(chatId);
        if (!chat) {
            this.plugin.logger.error(`Cannot delete message: Chat ${chatId} not found.`);
            new Notice(`Error: Chat ${chatId} not found.`);
            return false;
        }

        const timeTarget = timestampToDelete.getTime();
        const tolerance = 500; // 500 ms tolerance
        let messageIndex = -1;

        // Find index with tolerance
        for (let i = 0; i < chat.messages.length; i++) {
             if (Math.abs(chat.messages[i].timestamp.getTime() - timeTarget) < tolerance) {
                 messageIndex = i;
                 break;
             }
        }

        if (messageIndex === -1) {
            this.plugin.logger.warn(`Message with timestamp ~${timestampToDelete.toISOString()} (tolerance ${tolerance}ms) not found in chat ${chatId}. Cannot delete.`);
            new Notice("Message not found.");
            return false;
        }

        return await this.deleteMessageByIndex(chatId, messageIndex);
    }

    private async deleteMessageByIndex(chatId: string, messageIndex: number): Promise<boolean> {
        const chat = this.loadedChats[chatId] || await this.getChat(chatId);
         if (!chat || messageIndex < 0 || messageIndex >= chat.messages.length) {
              this.plugin.logger.error(`Cannot delete message by index ${messageIndex}: Chat ${chatId} not found or index out of bounds.`);
              return false;
         }

         try {
             const deletedMessage = chat.messages.splice(messageIndex, 1)[0];
             this.plugin.logger.debug(`Removed message at index ${messageIndex} (Role: ${deletedMessage?.role}) from chat ${chatId}.`);

             chat.updateMetadata({}); // Оновлюємо lastModified -> запускає save()

             // Оновлюємо індекс та сповіщаємо UI
             await this.saveChatAndUpdateIndex(chat); // Збереже чат, індекс і викличе chat-list-updated

             if (this.activeChatId === chatId) {
                 this.activeChat = chat; // Оновлюємо активний кеш
                 this.plugin.logger.debug(`Updated active chat cache for ${chatId} after message deletion.`);
                 // Сповіщаємо View про необхідність перемалювати активний чат
                 this.plugin.emit('active-chat-changed', { chatId: chatId, chat: chat });
             }

             // Сповіщаємо View про видалення КОНКРЕТНОГО повідомлення
              if (deletedMessage) {
                  this.plugin.emit('message-deleted', { chatId: chatId, timestamp: deletedMessage.timestamp });
              }

             return true;
         } catch (error) {
             this.plugin.logger.error(`Error during message deletion by index ${messageIndex} for chat ${chatId}:`, error);
             new Notice("Error deleting message.");
             return false;
         }
    }


    async clearChatMessagesById(chatId: string): Promise<boolean> {
        this.plugin.logger.info(`Attempting to clear messages for chat ${chatId}`);
        const chat = await this.getChat(chatId);
        if (!chat) {
            this.plugin.logger.error(`Cannot clear messages: Chat ${chatId} not found.`);
            new Notice(`Error: Chat ${chatId} not found.`);
            return false;
        }

        if (chat.messages.length === 0) {
             this.plugin.logger.debug(`Chat ${chatId} already has no messages. Nothing to clear.`);
             return true;
        }

        try {
            chat.clearMessages(); // Очищує та оновлює lastModified

            // Оновлюємо індекс та сповіщаємо UI
            await this.saveChatAndUpdateIndex(chat); // Збереже чат, індекс і викличе chat-list-updated

            const isActive = chatId === this.activeChatId;
            if (isActive) {
                this.activeChat = chat;
                this.plugin.logger.debug(`Updated active chat cache for ${chatId} after clearing messages.`);
                this.plugin.emit('messages-cleared', chatId);
            }

            return true;

        } catch (error) {
             this.plugin.logger.error(`Error during message clearing process for chat ${chatId}:`, error);
             new Notice("Error clearing messages.");
             return false;
        }
    }

    // --- ВИПРАВЛЕНО: Прибрано перевірку 'changed' ---
    async renameChat(chatId: string, newName: string): Promise<boolean> {
        const trimmedName = newName.trim();
        if (!trimmedName) {
            this.plugin.logger.warn(`Attempted to rename chat ${chatId} with an empty name.`);
            new Notice("Chat name cannot be empty.");
            return false;
        }

        this.plugin.logger.info(`Attempting to rename chat ${chatId} to "${trimmedName}"`);
        const chat = await this.getChat(chatId);

        if (!chat) {
            this.plugin.logger.error(`Cannot rename: Chat ${chatId} not found.`);
            new Notice("Chat not found.");
            return false;
        }

        if (chat.metadata.name === trimmedName) {
             this.plugin.logger.debug(`Chat ${chatId} already has the name "${trimmedName}". No changes needed.`);
             return true;
        }

        try {
            // Викликаємо updateMetadata, який оновить ім'я та lastModified і запланує збереження
            chat.updateMetadata({ name: trimmedName });
            this.plugin.logger.debug(`Chat ${chatId} name updated in Chat object. Save scheduled.`);

            // Оновлюємо індекс та генеруємо події
            // Використовуємо saveChatAndUpdateIndex для збереження індексу та генерації chat-list-updated
            await this.saveChatAndUpdateIndex(chat);

            // Якщо перейменований чат був активним, сповістимо про зміну метаданих
            if (this.activeChatId === chatId) {
                this.activeChat = chat; // Оновлюємо кеш
                // Подія active-chat-changed потрібна, щоб оновити відображення імені в OllamaView, якщо воно там є
                this.plugin.emit('active-chat-changed', { chatId: chatId, chat: chat });
            }
            // Подія chat-list-updated вже згенерована в saveChatAndUpdateIndex

            return true; // Повертаємо true, бо операція пройшла

        } catch(error) {
            this.plugin.logger.error(`Error renaming chat ${chatId}:`, error);
            new Notice("An error occurred while renaming the chat.");
            return false;
        }
    }
    // --- Кінець виправлення ---

} // End of ChatManager class