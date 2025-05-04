// src/ChatManager.ts
import { App, Notice, DataAdapter, normalizePath, TFolder, debounce, TAbstractFile } from "obsidian"; // Додано TAbstractFile
import OllamaPlugin, { ACTIVE_CHAT_ID_KEY, CHAT_INDEX_KEY } from "./main";
import { Chat, ChatMetadata, ChatData, ChatConstructorSettings } from "./Chat";
import { MessageRole } from './OllamaView'; // Припускаємо, що типи тут
import { v4 as uuidv4 } from 'uuid';
import { Message } from "./types";
import { Logger } from "./Logger";

// --- ТИПИ ДЛЯ ІЄРАРХІЇ ---
export interface FolderNode {
    type: 'folder';
    name: string;
    path: string;
    children: Array<FolderNode | ChatNode>;
    isExpanded?: boolean;
}

export interface ChatNode {
    type: 'chat';
    metadata: ChatMetadata;
    filePath: string;
}

export type HierarchyNode = FolderNode | ChatNode;
// --- КІНЕЦЬ ТИПІВ ДЛЯ ІЄРАРХІЇ ---


interface ChatSessionStored {
    name: string;
    lastModified: string;
    createdAt: string;
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
    public chatsFolderPath: string = "/"; // Зроблено public для доступу з SidebarManager
    private chatIndex: ChatSessionIndex = {};
    private activeChatId: string | null = null;
    private activeChat: Chat | null = null;
    private loadedChats: Record<string, Chat> = {};
    public currentTaskState: TaskState | null = null;
    private logger: Logger;

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.adapter = plugin.app.vault.adapter;
        this.logger = plugin.logger;
    }

    async initialize(): Promise<void> {
        this.logger.info("Initializing ChatManager...");
        this.updateChatsFolderPath();
        await this.ensureFoldersExist();
        await this.loadChatIndex(true);

        const savedActiveId = await this.plugin.loadDataKey(ACTIVE_CHAT_ID_KEY);
         if (savedActiveId && this.chatIndex[savedActiveId]) {
             this.logger.info(`Restoring active chat ID from settings: ${savedActiveId}`);
             await this.setActiveChat(savedActiveId);
         } else {
             if (savedActiveId) this.logger.warn(`Saved active chat ID ${savedActiveId} not found in index, clearing.`);
              await this.plugin.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
             const hierarchy = await this.getChatHierarchy();
             const firstChat = this.findFirstChatInHierarchy(hierarchy);
              if (firstChat) {
                   await this.setActiveChat(firstChat.metadata.id);
              } else {
                    await this.setActiveChat(null);
              }
         }
        this.logger.info(`ChatManager initialized. Index has ${Object.keys(this.chatIndex).length} chats. Active ID: ${this.activeChatId}`);
    }

    private findFirstChatInHierarchy(nodes: HierarchyNode[]): ChatNode | null {
        for (const node of nodes) {
            if (node.type === 'chat') {
                 if (!isNaN(new Date(node.metadata.lastModified).getTime())) {
                    return node;
                 } else {
                      this.logger.warn(`Skipping chat ${node.metadata.id} in findFirstChat due to invalid date.`);
                 }
            } else if (node.type === 'folder') {
                const chatInFolder = this.findFirstChatInHierarchy(node.children);
                if (chatInFolder) {
                    return chatInFolder;
                }
            }
        }
        return null;
    }


    updateChatsFolderPath(): void {
        const settingsPath = this.plugin.settings.chatHistoryFolderPath?.trim();
        this.chatsFolderPath = (settingsPath) ? normalizePath(settingsPath) : "/";
        if (this.chatsFolderPath !== "/" && this.chatsFolderPath.endsWith('/')) {
             this.chatsFolderPath = this.chatsFolderPath.slice(0, -1);
        }
        // Перевірка чи шлях не порожній після обрізки
        if (!this.chatsFolderPath) {
            this.chatsFolderPath = "/";
        }
        this.logger.debug(`Chat history folder path set to: ${this.chatsFolderPath}`);
    }

    updateTaskState(tasks: TaskState | null) {
        this.logger.debug("Updating task state in ChatManager", tasks);
        this.currentTaskState = tasks;
    }

    getCurrentTaskState(): TaskState | null {
        return this.currentTaskState;
    }

    public async ensureFoldersExist(): Promise<void> {
         const historyPath = this.plugin.settings.chatHistoryFolderPath?.trim();
         const exportPath = this.plugin.settings.chatExportFolderPath?.trim();
         this.logger.debug(`Ensuring folders exist: History='${historyPath}', Export='${exportPath}'`);
         const checkAndCreate = async (folderPath: string | undefined | null, folderDesc: string) => {
             if (!folderPath || folderPath === "/") return;
             const normalized = normalizePath(folderPath);
              // Додаткова перевірка на безпеку шляху
              if (normalized.startsWith("..") || normalized.includes("\0")) {
                  this.logger.error(`Invalid or unsafe path detected for ${folderDesc}: ${normalized}`);
                  new Notice(`Error: Invalid path for ${folderDesc}.`);
                  return;
              }
             try {
                 const exists = await this.adapter.exists(normalized);
                 if (!exists) {
                     this.logger.info(`${folderDesc} folder doesn't exist. Creating: ${normalized}`);
                     await this.adapter.mkdir(normalized);
                 } else {
                     const stat = await this.adapter.stat(normalized);
                     if (stat?.type !== 'folder') {
                         this.logger.error(`Path for ${folderDesc} exists but is not a folder: ${normalized}`);
                         new Notice(`Error: Path for ${folderDesc} is not a folder.`);
                     } else {
                          this.logger.debug(`${folderDesc} folder already exists: ${normalized}`);
                     }
                 }
             } catch (error) {
                 this.logger.error(`Error creating/checking ${folderDesc} directory '${normalized}':`, error);
                 new Notice(`Error accessing folder for ${folderDesc}. Check permissions.`);
             }
         };
         await checkAndCreate(historyPath, "Chat History");
         await checkAndCreate(exportPath, "Chat Export");
     }

    private async loadChatIndex(forceScan: boolean = false): Promise<void> {
        this.logger.debug(`Loading chat index... (forceScan: ${forceScan})`);
        const storedIndex = await this.plugin.loadDataKey(CHAT_INDEX_KEY);

        const settingsPath = this.plugin.settings.chatHistoryFolderPath?.trim();
        const currentPath = (settingsPath && settingsPath !== '/') ? normalizePath(settingsPath) : "/";
        if (currentPath !== this.chatsFolderPath) {
             this.logger.info("Chat history folder path changed, forcing index rescan.");
             this.updateChatsFolderPath();
             forceScan = true;
        }


        if (!forceScan && storedIndex && typeof storedIndex === 'object' && Object.keys(storedIndex).length > 0) {
             const firstKey = Object.keys(storedIndex)[0];
             if (storedIndex[firstKey] &&
                 typeof storedIndex[firstKey].name === 'string' &&
                 typeof storedIndex[firstKey].lastModified === 'string' &&
                 typeof storedIndex[firstKey].createdAt === 'string')
             {
                  this.chatIndex = storedIndex;
                  this.logger.debug(`Loaded ${Object.keys(this.chatIndex).length} chat(s) from stored index.`);
                  return;
             } else {
                  this.logger.warn("Stored chat index seems invalid (missing required fields in first entry), forcing rescan.");
                  forceScan = true;
             }
        } else if (!forceScan && storedIndex && typeof storedIndex === 'object' && Object.keys(storedIndex).length === 0) {
             this.logger.info("Stored index exists but is empty. No need to rescan unless forced.");
             this.chatIndex = {};
             return;
        } else if (!forceScan) {
             this.logger.info("No valid stored index found or not an object, forcing rescan.");
             forceScan = true;
        }

        if (forceScan) {
             await this.rebuildIndexFromFiles();
        }
    }

    private async rebuildIndexFromFiles(): Promise<void> {
        this.logger.info(`Rebuilding chat index by scanning files recursively in: ${this.chatsFolderPath}`);
        const newIndex: ChatSessionIndex = {};
        let chatsLoaded = 0;
        let filesScanned = 0;

        try {
            if (this.chatsFolderPath !== "/") {
                 const exists = await this.adapter.exists(this.chatsFolderPath);
                 if (!exists) {
                     this.logger.warn(`Chat history folder '${this.chatsFolderPath}' not found during scan. Creating it.`);
                     try { await this.adapter.mkdir(this.chatsFolderPath); }
                     catch (mkdirError) {
                         this.logger.error(`Failed to create chat history folder '${this.chatsFolderPath}':`, mkdirError);
                         this.chatIndex = {}; await this.saveChatIndex(); return;
                     }
                 } else {
                      const stat = await this.adapter.stat(this.chatsFolderPath);
                      if (stat?.type !== 'folder') {
                          this.logger.error(`Chat history path '${this.chatsFolderPath}' exists but is not a folder. Index will be empty.`);
                          new Notice(`Error: Chat history path '${this.chatsFolderPath}' is not a folder.`);
                          this.chatIndex = {}; await this.saveChatIndex(); return;
                      }
                 }
            }

            const scanAndIndex = async (folderPath: string): Promise<void> => {
                let listResult;
                try {
                    listResult = await this.adapter.list(folderPath);
                } catch (listError: any) {
                    if (listError.message && listError.message.includes("Not a directory")) {
                        this.logger.warn(`Attempted to list a file as directory during index rebuild: ${folderPath}`);
                    } else {
                        this.logger.error(`Error listing directory ${folderPath} during index rebuild:`, listError);
                    }
                    return;
                }

                for (const fullPath of listResult.files) {
                    const fileName = fullPath.substring(fullPath.lastIndexOf('/') + 1);
                    if (!fileName.endsWith('.json') || fileName.startsWith('.')) continue;

                    const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.json$/i;
                    const oldPattern = /^chat_\d+_[a-zA-Z0-9]+\.json$/;

                    if (!uuidPattern.test(fileName) && !oldPattern.test(fileName)) continue;
                    filesScanned++;

                    const chatId = fileName.slice(0, -5);

                    try {
                        const jsonContent = await this.adapter.read(fullPath);
                        const data = JSON.parse(jsonContent) as Partial<ChatData>;

                        if (data?.metadata?.id === chatId &&
                            typeof data.metadata.name === 'string' && data.metadata.name.trim() !== '' &&
                            typeof data.metadata.lastModified === 'string' && !isNaN(new Date(data.metadata.lastModified).getTime()) &&
                            typeof data.metadata.createdAt === 'string' && !isNaN(new Date(data.metadata.createdAt).getTime()))
                        {
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
                        } else {
                            this.logger.warn(`Metadata validation FAILED for file: ${fullPath}. ID in file: ${data?.metadata?.id}, Expected ID (from filename): ${chatId}. Required fields: id (matching filename), name, lastModified(valid date), createdAt(valid date).`, data?.metadata);
                        }
                    } catch (e: any) {
                         if (e instanceof SyntaxError) {
                              this.logger.error(`Error parsing JSON in chat file ${fullPath} during index scan:`, e);
                         } else {
                              this.logger.error(`Error reading or processing chat file ${fullPath} during index scan:`, e);
                         }
                    }
                }

                for (const subFolderPath of listResult.folders) {
                    await scanAndIndex(subFolderPath);
                }
            };

            await scanAndIndex(this.chatsFolderPath);

            this.chatIndex = newIndex;
            await this.saveChatIndex();
            this.logger.info(`Index rebuilt: ${chatsLoaded} chats loaded from ${filesScanned} scanned files across all subfolders.`);

        } catch (error: any) {
            if (error.code === 'ENOENT') {
                 this.logger.error(`Chat history base folder '${this.chatsFolderPath}' not found even after attempting creation. Index is empty.`);
                 new Notice(`Error: Chat history folder '${this.chatsFolderPath}' not found.`);
            } else if (error.code === 'EPERM' || error.code === 'EACCES') {
                this.logger.error(`Permission error accessing chat history folder '${this.chatsFolderPath}'. Please check permissions.`);
                new Notice("Permission error accessing chat history folder.");
            } else {
                this.logger.error(`Unexpected error during index rebuild for '${this.chatsFolderPath}':`, error);
                new Notice("Error rebuilding chat index. Check console.");
            }
            this.chatIndex = {};
            await this.saveChatIndex();
        }
    }


    private async saveChatIndex(): Promise<void> {
        this.logger.debug(`Saving chat index with ${Object.keys(this.chatIndex).length} entries.`);
        try {
             await this.plugin.saveDataKey(CHAT_INDEX_KEY, this.chatIndex);
        } catch (error) {
             this.logger.error("Failed to save chat index:", error);
             new Notice("Error saving chat index. Changes might be lost.");
        }
    }

    private getChatFilePath(id: string, folderPath: string): string {
         const fileName = `${id}.json`;
         const targetFolder = normalizePath(folderPath);
         if (targetFolder === "/" || targetFolder === "") {
              return normalizePath(fileName);
         } else {
              return normalizePath(`${targetFolder}/${fileName}`);
         }
    }

    private async _scanFolderRecursive(folderPath: string): Promise<HierarchyNode[]> {
        this.logger.debug(`Scanning folder recursively: ${folderPath}`);
        const children: HierarchyNode[] = [];
        let listResult;

        try {
            const exists = await this.adapter.exists(folderPath);
            if (!exists) {
                 this.logger.warn(`Folder not found during recursive scan: ${folderPath}`);
                 return [];
            }
            const stat = await this.adapter.stat(folderPath);
            if (stat?.type !== 'folder') {
                this.logger.warn(`Path is not a directory during recursive scan: ${folderPath}`);
                return [];
            }

            listResult = await this.adapter.list(folderPath);
        } catch (error: any) {
             if (error.code === 'EPERM' || error.code === 'EACCES') {
                 this.logger.error(`Permission error listing directory ${folderPath} during recursive scan:`, error);
                 new Notice(`Permission error reading folder: ${folderPath}`);
             } else {
                 this.logger.error(`Error listing directory ${folderPath} during recursive scan:`, error);
             }
             return [];
        }

        for (const subFolderPath of listResult.folders) {
            try {
                 const subStat = await this.adapter.stat(subFolderPath);
                 if (subStat?.type === 'folder') {
                      const folderName = subFolderPath.substring(subFolderPath.lastIndexOf('/') + 1);
                      const subChildren = await this._scanFolderRecursive(subFolderPath);
                      children.push({
                          type: 'folder',
                          name: folderName,
                          path: subFolderPath,
                          children: subChildren,
                      });
                 } else {
                      this.logger.warn(`Item listed as folder is not a directory: ${subFolderPath}`);
                 }
            } catch(statError) {
                 this.logger.error(`Error stating potential subfolder ${subFolderPath}:`, statError);
            }
        }

        for (const fullPath of listResult.files) {
            const fileName = fullPath.substring(fullPath.lastIndexOf('/') + 1);

            if (!fileName.endsWith('.json') || fileName.startsWith('.')) continue;
            const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.json$/i;
            const oldPattern = /^chat_\d+_[a-zA-Z0-9]+\.json$/;
            if (!uuidPattern.test(fileName) && !oldPattern.test(fileName)) continue;

            const chatId = fileName.slice(0, -5);

            const storedMeta = this.chatIndex[chatId];
            if (storedMeta) {
                 if (isNaN(new Date(storedMeta.lastModified).getTime()) || isNaN(new Date(storedMeta.createdAt).getTime())) {
                     this.logger.warn(`Invalid date format found in index for chat ID: ${chatId} during hierarchy scan. Skipping. Path: ${fullPath}`, storedMeta);
                     continue;
                 }

                const chatMetadata: ChatMetadata = {
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
                    type: 'chat',
                    metadata: chatMetadata,
                    filePath: fullPath
                });
            } else {
                this.logger.warn(`Chat file found but not in index during recursive scan: ${fullPath}. Consider rebuilding index.`);
            }
        }

        children.sort((a, b) => {
            if (a.type === 'folder' && b.type === 'chat') return -1;
            if (a.type === 'chat' && b.type === 'folder') return 1;
            if (a.type === 'folder' && b.type === 'folder') {
                return a.name.localeCompare(b.name);
            }
            if (a.type === 'chat' && b.type === 'chat') {
                const dateA = new Date(a.metadata.lastModified).getTime();
                const dateB = new Date(b.metadata.lastModified).getTime();
                const validA = !isNaN(dateA);
                const validB = !isNaN(dateB);
                if (validA && validB) return dateB - dateA;
                if (validB) return 1;
                if (validA) return -1;
                return a.metadata.name.localeCompare(b.metadata.name);
            }
            return 0;
        });

        return children;
    }

    public async getChatHierarchy(): Promise<HierarchyNode[]> {
        this.logger.debug("Getting chat hierarchy...");
        await this.ensureFoldersExist();
        return await this._scanFolderRecursive(this.chatsFolderPath);
    }


    async saveChatAndUpdateIndex(chat: Chat): Promise<boolean> {
        try {
            await chat.save();

            const meta = chat.metadata;
            const storedMeta: ChatSessionStored = {
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
                await this.saveChatIndex();
                this.plugin.emit('chat-list-updated');
                this.logger.debug(`Chat index updated for ${meta.id} after save trigger.`);
            } else {
                 this.logger.trace(`Index for chat ${meta.id} unchanged after save trigger, skipping index save/event.`);
            }
            return true;

        } catch (error) {
             this.logger.error(`Error occurred during chat.save() or index update for chat ${chat?.metadata?.id}:`, error);
             return false;
        }
    }

    async createNewChat(name?: string, folderPath?: string): Promise<Chat | null> {
        const targetFolder = folderPath ? normalizePath(folderPath) : this.chatsFolderPath;
        const finalFolderPath = (targetFolder === "" || targetFolder === ".") ? "/" : targetFolder;

        this.logger.info(`Creating new chat in folder: ${finalFolderPath}...`);
        try {
             // Перевіряємо/створюємо цільову папку перед створенням чату
             await this.ensureSpecificFolderExists(finalFolderPath);
        } catch (folderError) {
             // Помилка вже залогована в ensureSpecificFolderExists
             new Notice(`Failed to ensure target folder exists: ${finalFolderPath}`);
             return null;
        }


        try {
            const now = new Date();
            const newId = uuidv4();
            const filePath = this.getChatFilePath(newId, finalFolderPath);

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

            const newChat = new Chat(this.adapter, constructorSettings, chatData, filePath, this.logger);

            const storedMeta: ChatSessionStored = {
                name: initialMetadata.name,
                lastModified: initialMetadata.lastModified,
                createdAt: initialMetadata.createdAt,
                modelName: initialMetadata.modelName,
                selectedRolePath: initialMetadata.selectedRolePath,
                temperature: initialMetadata.temperature,
                contextWindow: initialMetadata.contextWindow,
            };
            this.chatIndex[newId] = storedMeta;
            await this.saveChatIndex();
            this.plugin.emit('chat-list-updated');

            const savedImmediately = await newChat.saveImmediately();
            if (!savedImmediately) {
                delete this.chatIndex[newId];
                await this.saveChatIndex();
                this.plugin.emit('chat-list-updated');
                this.logger.error(`Failed to save initial chat file for new chat ${newId} at ${filePath}. Removed from index.`);
                new Notice("Error: Failed to save new chat file.");
                return null;
            }

            this.loadedChats[newId] = newChat;
            await this.setActiveChat(newId);

            this.logger.info(`Created and activated new chat: ${newChat.metadata.name} (ID: ${newId}) in ${finalFolderPath}`);
            return newChat;
        } catch (error) {
            this.logger.error("Error creating new chat:", error);
            new Notice("Error creating new chat session.");
            return null;
        }
    }

    private async ensureSpecificFolderExists(folderPath: string): Promise<void> {
        if (!folderPath || folderPath === "/" || folderPath === ".") return;

        const normalized = normalizePath(folderPath);
        if (normalized.startsWith("..") || normalized.includes("\0")) {
             this.logger.error(`Attempted to ensure invalid folder path: ${normalized}`);
             throw new Error("Invalid folder path specified.");
        }

        try {
            const exists = await this.adapter.exists(normalized);
            if (!exists) {
                this.logger.info(`Target folder doesn't exist. Creating: ${normalized}`);
                await this.adapter.mkdir(normalized);
            } else {
                const stat = await this.adapter.stat(normalized);
                if (stat?.type !== 'folder') {
                    this.logger.error(`Path exists but is not a folder: ${normalized}`);
                    throw new Error(`Target path ${normalized} is not a folder.`);
                }
            }
        } catch (error) {
            this.logger.error(`Error creating/checking target folder '${normalized}':`, error);
            throw new Error(`Failed to ensure target folder ${normalized} exists: ${error instanceof Error ? error.message : String(error)}`);
        }
    }


    /** @deprecated Use getChatHierarchy instead. */
    listAvailableChats(): ChatMetadata[] {
         this.logger.warn("listAvailableChats is deprecated. Use getChatHierarchy instead.");
         return Object.entries(this.chatIndex)
             .map(([id, storedMeta]): ChatMetadata | null => {
                if (!storedMeta || typeof storedMeta !== 'object' ||
                    typeof storedMeta.name !== 'string' ||
                    typeof storedMeta.lastModified !== 'string' ||
                    typeof storedMeta.createdAt !== 'string') {
                    this.logger.warn(`[Deprecated listAvailableChats] Invalid or incomplete metadata found in index for chat ID: ${id}. Skipping.`, storedMeta);
                    return null;
                }
                 const lastModDate = new Date(storedMeta.lastModified);
                 const createdDate = new Date(storedMeta.createdAt);
                 if (isNaN(lastModDate.getTime()) || isNaN(createdDate.getTime())) {
                     this.logger.warn(`[Deprecated listAvailableChats] Invalid date format found in index for chat ID: ${id}. Skipping.`, storedMeta);
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
                    contextWindow: storedMeta.contextWindow
                };
             })
             .filter((chatMeta): chatMeta is ChatMetadata => chatMeta !== null)
             .sort((a, b) => {
                  const dateA = new Date(a.lastModified).getTime();
                  const dateB = new Date(b.lastModified).getTime();
                  if (!isNaN(dateA) && !isNaN(dateB)) {
                      if (dateB !== dateA) return dateB - dateA;
                  } else if (!isNaN(dateB)) return 1;
                  else if (!isNaN(dateA)) return -1;
                   const createdA = new Date(a.createdAt).getTime();
                   const createdB = new Date(b.createdAt).getTime();
                    if (!isNaN(createdA) && !isNaN(createdB)) {
                         return createdB - createdA;
                    } else if (!isNaN(createdB)) return 1;
                    else if (!isNaN(createdA)) return -1;
                   return a.name.localeCompare(b.name);
             });
    }

    getActiveChatId(): string | null { return this.activeChatId; }

    async getChat(id: string, filePath?: string): Promise<Chat | null> {
          this.logger.debug(`getChat called for ID: ${id}, Path: ${filePath ?? 'Not provided'}`);
          if (this.loadedChats[id]) {
               this.logger.debug(`Returning chat ${id} from memory cache.`);
               return this.loadedChats[id];
          }
          this.logger.debug(`Chat ${id} not in memory cache, loading from file...`);

          let actualFilePath: string | undefined = filePath;
          if (!actualFilePath) {
               this.logger.debug(`File path for ${id} not provided, searching in hierarchy...`);
               try {
                    const hierarchy = await this.getChatHierarchy();
                    actualFilePath = this.findChatPathInHierarchy(id, hierarchy) ?? undefined;
                    if (actualFilePath) {
                         this.logger.debug(`Found path for ${id} in hierarchy: ${actualFilePath}`);
                    }
               } catch (hierarchyError) {
                   this.logger.error(`Error getting hierarchy while searching path for chat ${id}:`, hierarchyError);
                   actualFilePath = undefined;
               }
          }

          if (!actualFilePath) {
               this.logger.error(`Could not find or determine file path for chat ID ${id}.`);
                if (this.chatIndex[id]) {
                     this.logger.warn(`Chat ${id} exists in index but its path was not found. Index might be outdated or file moved externally. Consider rebuilding index.`);
                }
               return null;
          }

          if (!this.chatIndex[id]) {
               if (!filePath) {
                    this.logger.warn(`Chat file found at ${actualFilePath} but ID ${id} is not in index. Rebuilding index...`);
                    await this.rebuildIndexFromFiles();
                    if (!this.chatIndex[id]) {
                         this.logger.error(`Chat ID ${id} still not found in index after rescan, despite file existing at ${actualFilePath}.`);
                         return null;
                    }
               } else {
                    this.logger.warn(`Chat ID ${id} not found in index during getChat, but file path ${actualFilePath} was provided. Attempting load...`);
               }
          }

          try {
              if (typeof actualFilePath !== 'string') {
                   this.logger.error(`Internal error: actualFilePath is undefined before calling Chat.loadFromFile for ID ${id}`);
                   return null;
              }

              const chat = await Chat.loadFromFile(actualFilePath, this.adapter, this.plugin.settings, this.logger);

              if (chat) {
                  this.logger.debug(`Successfully loaded chat ${id} from ${actualFilePath}. Caching.`);
                  this.loadedChats[id] = chat;

                   const storedMeta = this.chatIndex[id];
                   const currentMeta = chat.metadata;
                   const indexNeedsUpdate = !storedMeta ||
                                             storedMeta.name !== currentMeta.name ||
                                             storedMeta.lastModified !== currentMeta.lastModified ||
                                             storedMeta.createdAt !== currentMeta.createdAt || // Додано createdAt
                                             storedMeta.modelName !== currentMeta.modelName ||
                                             storedMeta.selectedRolePath !== currentMeta.selectedRolePath ||
                                             storedMeta.temperature !== currentMeta.temperature ||
                                             storedMeta.contextWindow !== currentMeta.contextWindow;

                   if (indexNeedsUpdate) {
                         this.logger.warn(`Metadata mismatch or missing index entry for ${id}. Updating index.`);
                         await this.saveChatAndUpdateIndex(chat);
                   }
                  return chat;
              } else {
                  this.logger.error(`Chat.loadFromFile returned null for ${id} at path ${actualFilePath}. Removing from index if present.`);
                  await this.deleteChatFileAndIndexEntry(id, actualFilePath, false);
                  if (this.activeChatId === id) await this.setActiveChat(null);
                  return null;
              }
          } catch (error: any) {
              this.logger.error(`Unexpected error during getChat for ${id} from ${actualFilePath}:`, error);
              if (error.code === 'ENOENT') {
                    this.logger.warn(`File not found for chat ${id} during getChat at ${actualFilePath}. Removing from index.`);
                    await this.deleteChatFileAndIndexEntry(id, actualFilePath, false);
                    if (this.activeChatId === id) await this.setActiveChat(null);
              }
              return null;
          }
      }

    private findChatPathInHierarchy(chatId: string, nodes: HierarchyNode[]): string | null {
        for (const node of nodes) {
            if (node.type === 'chat' && node.metadata.id === chatId) {
                return node.filePath;
            } else if (node.type === 'folder') {
                const pathInFolder = this.findChatPathInHierarchy(chatId, node.children);
                if (pathInFolder) {
                    return pathInFolder;
                }
            }
        }
        return null;
    }

    private async deleteChatFileAndIndexEntry(id: string, filePath: string | null, deleteFile: boolean = true): Promise<void> {
        const safeFilePath = filePath ?? "unknown_path"; // Використовуємо замінник, якщо шлях null
        this.logger.debug(`Deleting index/cache entry for ${id}. Path: ${safeFilePath}. Delete file: ${deleteFile}`);
        let indexChanged = false;

        if (this.loadedChats[id]) {
             delete this.loadedChats[id];
             this.logger.trace(`Removed chat ${id} from loadedChats cache.`);
        }
        if (this.chatIndex[id]) {
             delete this.chatIndex[id];
             indexChanged = true;
             this.logger.trace(`Removed chat ${id} from chatIndex.`);
        } else {
             this.logger.trace(`Chat ${id} was not found in chatIndex for removal.`);
        }

        // Видаляємо файл, тільки якщо шлях валідний
        if (deleteFile && filePath && typeof filePath === 'string' && filePath !== '/' && !filePath.endsWith('/')) {
             try {
                 const fileExists = await this.adapter.exists(filePath);
                 if (fileExists) {
                      const stat = await this.adapter.stat(filePath);
                      if (stat?.type === 'file') {
                          await this.adapter.remove(filePath);
                          this.logger.debug(`Removed chat file: ${filePath}`);
                      } else {
                          this.logger.error(`Attempted to remove a non-file path during chat deletion: ${filePath}`);
                      }
                 } else {
                      this.logger.warn(`Attempted to delete file that does not exist: ${filePath}`);
                 }
             }
             catch (e: any) {
                  if (e.code === 'EPERM' || e.code === 'EACCES') {
                      this.logger.error(`Permission error removing chat file ${filePath}:`, e);
                      new Notice(`Permission error deleting file: ${filePath}`);
                  } else {
                      this.logger.error(`Error removing chat file ${filePath} during cleanup:`, e);
                      new Notice(`Error deleting file: ${filePath}`);
                  }
             }
        } else if (deleteFile) {
             this.logger.warn(`Skipping file deletion for ${id} because path was invalid or not provided: ${safeFilePath}`);
        }

         if (indexChanged) {
              await this.saveChatIndex();
              this.plugin.emit('chat-list-updated');
         }
    }

    async getActiveChat(): Promise<Chat | null> {
        this.logger.debug(`getActiveChat called. Current activeChatId: ${this.activeChatId}`);
        if (!this.activeChatId) {
             this.logger.debug("No active chat ID set.");
             return null;
        }
        if (this.activeChat && this.activeChat.metadata.id === this.activeChatId) {
            this.logger.debug(`Returning cached active chat object: ${this.activeChatId}`);
            return this.activeChat;
        }
        this.logger.debug(`Active chat ${this.activeChatId} not in active cache or ID mismatch, calling getChat...`);

        const chat = await this.getChat(this.activeChatId);
        if (chat) {
            this.activeChat = chat;
            return chat;
        } else {
             this.logger.warn(`Failed to load active chat ${this.activeChatId} via getChat. Perhaps it was deleted or file is inaccessible?`);
             const hierarchy = await this.getChatHierarchy();
             const firstChat = this.findFirstChatInHierarchy(hierarchy);
             const nextActiveId = firstChat ? firstChat.metadata.id : null;

             this.logger.info(`Setting active chat to ${nextActiveId} after failing to load ${this.activeChatId}`);
             await this.setActiveChat(nextActiveId);
             return this.activeChat;
        }
    }

    public async setActiveChat(id: string | null): Promise<void> {
        this.logger.debug(`setActiveChat called with ID: ${id}`);
        const previousActiveId = this.activeChatId;

        if (id === previousActiveId) {
            this.logger.debug(`Chat ${id ?? 'null'} is already active.`);
             if (id && !this.activeChat) {
                  this.logger.debug(`Active chat cache was null for active ID ${id}. Reloading.`);
                  this.activeChat = await this.getChat(id);
             }
            return;
        }

        if (id && !this.chatIndex[id]) {
            this.logger.error(`Attempted to set active chat to non-existent ID in index: ${id}. Rebuilding index...`);
            await this.rebuildIndexFromFiles();
            if (!this.chatIndex[id]) {
                 this.logger.error(`Chat ID ${id} still not found after index reload. Aborting setActiveChat. Keeping previous active chat: ${previousActiveId}`);
                 new Notice(`Error: Chat with ID ${id} not found. Cannot activate.`);
                 return;
            }
             this.logger.info(`Chat ID ${id} found after index reload. Proceeding with activation.`);
        }

        this.activeChatId = id;
        this.activeChat = null;
        await this.plugin.saveDataKey(ACTIVE_CHAT_ID_KEY, id);

        let loadedChat: Chat | null = null;
        if (id) {
            loadedChat = await this.getChat(id);
            if (!loadedChat) {
                this.logger.error(`CRITICAL: Failed to load chat ${id} via getChat even after index check. Resetting active chat to null.`);
                this.activeChatId = null;
                await this.plugin.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
                id = null;
            } else {
                 this.activeChat = loadedChat;
                 this.logger.debug(`Set active chat cache to ID: ${id}`);
            }
        } else {
             this.logger.info("Active chat explicitly set to null.");
        }

        this.logger.info(`Active chat changed from ${previousActiveId ?? 'null'} to ${id ?? 'null'}`);
        this.plugin.emit('active-chat-changed', { chatId: id, chat: this.activeChat });
    }


    async addMessageToActiveChat(
        role: MessageRole,
        content: string,
        timestamp?: Date,
        emitEvent: boolean = true
    ): Promise<Message | null> {
        const activeChat = await this.getActiveChat();
        if (!activeChat) {
            this.logger.error("Cannot add message: No active chat.");
            return null;
        }

        const messageTimestamp = timestamp || new Date();
        const newMessage: Message = { role, content, timestamp: messageTimestamp };

        activeChat.messages.push(newMessage);
        const metadataChanged = activeChat.updateMetadata({});

        this.logger.debug(`Added ${role} message to active chat ${activeChat.metadata.id}. Metadata changed: ${metadataChanged}. Emit event: ${emitEvent}`);

        const indexUpdated = await this.saveChatAndUpdateIndex(activeChat);

        if (emitEvent && indexUpdated) {
            const eventData = { chatId: this.activeChatId, message: newMessage };
            this.logger.debug("[ChatManager] Emitting 'message-added' event. Data:", eventData);
            this.plugin.emit('message-added', { chatId: activeChat.metadata.id, message: newMessage });
        } else if (emitEvent && !indexUpdated) {
             this.logger.warn(`Skipping message-added event emission because index update failed for chat ${activeChat.metadata.id}`);
        }

        return newMessage;
    }

    async clearActiveChatMessages(): Promise<void> {
        const activeChat = await this.getActiveChat();
        if (!activeChat) {
            this.logger.warn("Cannot clear messages: No active chat.");
            return;
        }
        if (activeChat.messages.length === 0) {
             this.logger.debug(`Chat ${activeChat.metadata.id} already has no messages. Nothing to clear.`);
             return;
        }

        this.logger.info(`Clearing messages for chat: ${activeChat.metadata.id}`);
        activeChat.clearMessages();

        await this.saveChatAndUpdateIndex(activeChat);
        this.plugin.emit('messages-cleared', activeChat.metadata.id);
    }

    async updateActiveChatMetadata(metadataUpdate: Partial<Omit<ChatMetadata, 'id' | 'createdAt' | 'lastModified'>>): Promise<boolean> {
        const activeChat = await this.getActiveChat();
        if (!activeChat) {
            this.logger.warn("Cannot update metadata, no active chat.");
            new Notice("No active chat to update metadata for.");
            return false;
        }
        if (Object.keys(metadataUpdate).length === 0) {
             this.logger.debug("updateActiveChatMetadata called with empty update object. No action taken.");
             return false;
        }

        this.logger.debug(`Attempting to update metadata for active chat ${activeChat.metadata.id}:`, metadataUpdate);

        const oldRolePath = activeChat.metadata.selectedRolePath;
        const oldModelName = activeChat.metadata.modelName;

        const changed = activeChat.updateMetadata(metadataUpdate);

        if (changed) {
            this.logger.debug(`Metadata updated in Chat object for ${activeChat.metadata.id}. Save scheduled by Chat.updateMetadata.`);
            await this.saveChatAndUpdateIndex(activeChat);

            const newMeta = activeChat.metadata;
            let roleChanged = false;
            let modelChanged = false;
            if (metadataUpdate.selectedRolePath !== undefined && oldRolePath !== newMeta.selectedRolePath) { roleChanged = true; }
            if (metadataUpdate.modelName !== undefined && oldModelName !== newMeta.modelName) { modelChanged = true; }

            if (roleChanged) {
                try {
                    const rolePathArg = newMeta.selectedRolePath ?? undefined;
                    const newRoleName = await this.plugin.findRoleNameByPath(rolePathArg);
                    this.logger.debug(`Emitting 'role-changed': ${newRoleName ?? 'None'}`);
                    this.plugin.emit('role-changed', newRoleName ?? 'None');
                    this.plugin.promptService?.clearRoleCache?.();
                } catch (e) { this.logger.error("Error finding role name or emitting role-changed:", e); }
            }
            if (modelChanged) {
                this.logger.debug(`Emitting 'model-changed': ${newMeta.modelName ?? 'Default'}`);
                this.plugin.emit('model-changed', newMeta.modelName || "");
                this.plugin.promptService?.clearModelDetailsCache?.();
            }

            this.plugin.emit('active-chat-changed', { chatId: this.activeChatId, chat: activeChat });
            return true;
        } else {
             this.logger.debug(`updateActiveChatMetadata called for ${activeChat.metadata.id}, but Chat.updateMetadata reported no changes.`);
             return false;
        }
    }

    async deleteChat(id: string): Promise<boolean> {
        this.logger.info(`Attempting to delete chat ID: ${id}`);
        const chatExistedInIndex = !!this.chatIndex[id];
        const wasActive = (id === this.activeChatId);

        let filePath: string | null = null;
        try {
             const hierarchy = await this.getChatHierarchy();
             filePath = this.findChatPathInHierarchy(id, hierarchy);
        } catch (hierarchyError) {
             this.logger.error(`Error getting hierarchy during delete operation for ${id}:`, hierarchyError);
        }

        if (!filePath && chatExistedInIndex) {
             this.logger.warn(`Could not find file path for chat ${id} during deletion, but it was in index. Will only remove index entry.`);
        } else if (!filePath && !chatExistedInIndex) {
             this.logger.warn(`Attempting to delete chat ${id} which is not in index and path not found.`);
             return false;
        }

        let success = true;
        try {
            // Видаляємо з кешу та індексу, видаляємо файл
            await this.deleteChatFileAndIndexEntry(id, filePath, true); // filePath може бути null

        } catch (error) {
            this.logger.error(`Error during deletion process for chat ${id}:`, error);
            new Notice(`Error deleting chat ${id}. Check console.`);
            success = false;
            await this.rebuildIndexFromFiles();
        } finally {
            if (wasActive) {
                this.logger.info(`Deleted active chat ${id}. Selecting new active chat...`);
                const newHierarchy = await this.getChatHierarchy();
                const firstChat = this.findFirstChatInHierarchy(newHierarchy);
                const nextActiveId = firstChat ? firstChat.metadata.id : null;
                await this.setActiveChat(nextActiveId);
            } else if (success && chatExistedInIndex) {
                 new Notice(`Chat deleted.`);
            }
        }
        return success && chatExistedInIndex;
    }


    async cloneChat(chatIdToClone: string): Promise<Chat | null> {
         this.logger.info(`Cloning chat ID: ${chatIdToClone}`);
         let originalFilePath: string | null = null;
         try {
              const hierarchy = await this.getChatHierarchy();
              originalFilePath = this.findChatPathInHierarchy(chatIdToClone, hierarchy);
         } catch (hierarchyError) {
              this.logger.error(`Error getting hierarchy during clone operation for ${chatIdToClone}:`, hierarchyError);
              new Notice("Error finding original chat for cloning.");
              return null;
         }

         if (!originalFilePath) {
              this.logger.error(`Cannot clone: File path for original chat ${chatIdToClone} not found.`);
              new Notice("Original chat file path not found.");
              return null;
         }
         const originalChat = await this.getChat(chatIdToClone, originalFilePath);
         if (!originalChat) {
             this.logger.error(`Cannot clone: Original chat ${chatIdToClone} could not be loaded from ${originalFilePath}.`);
             new Notice("Original chat could not be loaded.");
             return null;
         }

         const targetFolder = originalFilePath.substring(0, originalFilePath.lastIndexOf('/')) || "/";
         const finalFolderPath = (targetFolder === "" || targetFolder === ".") ? "/" : targetFolder;
         this.logger.debug(`Cloning chat into folder: ${finalFolderPath}`);
          try {
              await this.ensureSpecificFolderExists(finalFolderPath);
          } catch(folderError) {
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


             const constructorSettings: ChatConstructorSettings = { ...this.plugin.settings };
             const clonedChat = new Chat(this.adapter, constructorSettings, clonedData, newFilePath, this.logger);

             const storedMeta: ChatSessionStored = {
                 name: clonedData.metadata.name,
                 lastModified: clonedData.metadata.lastModified,
                 createdAt: clonedData.metadata.createdAt,
                 modelName: clonedData.metadata.modelName,
                 selectedRolePath: clonedData.metadata.selectedRolePath,
                 temperature: clonedData.metadata.temperature,
                 contextWindow: clonedData.metadata.contextWindow,
             };
             this.chatIndex[newId] = storedMeta;
             await this.saveChatIndex();
             this.plugin.emit('chat-list-updated');

             const savedImmediately = await clonedChat.saveImmediately();
             if (!savedImmediately) {
                 delete this.chatIndex[newId];
                 await this.saveChatIndex();
                 this.plugin.emit('chat-list-updated');
                 this.logger.error(`Failed to save the cloned chat file for ${newId} at ${newFilePath}. Removed from index.`);
                 new Notice("Error: Failed to save the cloned chat file.");
                 return null;
             }

             this.loadedChats[newId] = clonedChat;
             await this.setActiveChat(newId);

             this.logger.info(`Cloned chat "${clonedChat.metadata.name}" created and activated in ${finalFolderPath}.`);
             return clonedChat;
         } catch (error) {
             this.logger.error("Error cloning chat:", error);
             new Notice("An error occurred while cloning the chat.");
             return null;
         }
     }

    async deleteMessagesAfter(chatId: string, messageIndexToDeleteAfter: number): Promise<boolean> {
         this.logger.info(`Deleting messages after index ${messageIndexToDeleteAfter} for chat ${chatId}`);
         const chat = await this.getChat(chatId);
         if (!chat) {
             this.logger.error(`Cannot delete messages: Chat ${chatId} not found.`);
             return false;
         }

         if (messageIndexToDeleteAfter >= chat.messages.length - 1) {
              this.logger.debug(`Index ${messageIndexToDeleteAfter} is at or after the last message. Nothing to delete after.`);
              return true;
         }
          if (messageIndexToDeleteAfter < -1) {
               this.logger.warn(`Invalid index (${messageIndexToDeleteAfter}) provided for deleting messages.`);
               return false;
          }

         const originalLength = chat.messages.length;
         const targetLength = messageIndexToDeleteAfter + 1;
         chat.messages.length = targetLength;

         chat.updateMetadata({});
         this.logger.debug(`Messages for chat ${chatId} truncated from ${originalLength} to ${chat.messages.length}. Save scheduled.`);

         await this.saveChatAndUpdateIndex(chat);

         if (this.activeChatId === chatId) {
             this.activeChat = chat;
             this.logger.debug(`Updated active chat cache for ${chatId} after message deletion.`);
             this.plugin.emit('active-chat-changed', { chatId: chatId, chat: chat });
         }

         return true;
     }

    async deleteMessageByTimestamp(chatId: string, timestampToDelete: Date): Promise<boolean> {
        this.logger.info(`Attempting to delete message with timestamp ${timestampToDelete.toISOString()} from chat ${chatId}`);
        const chat = await this.getChat(chatId);
        if (!chat) {
            this.logger.error(`Cannot delete message: Chat ${chatId} not found.`);
            new Notice(`Error: Chat ${chatId} not found.`);
            return false;
        }

        const timeTarget = timestampToDelete.getTime();
        const tolerance = 1000; // 1 second
        let messageIndex = -1;

        for (let i = 0; i < chat.messages.length; i++) {
             const messageTime = chat.messages[i].timestamp.getTime();
             if (!isNaN(messageTime) && Math.abs(messageTime - timeTarget) < tolerance) {
                 messageIndex = i;
                 break;
             } else if (isNaN(messageTime)) {
                 this.logger.warn(`Invalid timestamp found in message at index ${i} during deletion search.`);
             }
        }

        if (messageIndex === -1) {
            this.logger.warn(`Message with timestamp ~${timestampToDelete.toISOString()} (tolerance ${tolerance}ms) not found in chat ${chatId}. Cannot delete.`);
            new Notice("Message not found.");
            return false;
        }

        // Використовуємо _performDeleteMessageByIndex, який вже існує і обробляє chat object
        return await this._performDeleteMessageByIndex(chat, messageIndex);
    }

    private async _performDeleteMessageByIndex(chat: Chat, messageIndex: number): Promise<boolean> {
        const chatId = chat.metadata.id;
         try {
              if (messageIndex < 0 || messageIndex >= chat.messages.length) {
                  this.logger.error(`Invalid message index ${messageIndex} provided to _performDeleteMessageByIndex for chat ${chatId}.`);
                  return false;
              }

             const deletedMessage = chat.messages.splice(messageIndex, 1)[0];
             this.logger.debug(`Removed message at index ${messageIndex} (Role: ${deletedMessage?.role}) from chat ${chatId}.`);

             chat.updateMetadata({});
             await this.saveChatAndUpdateIndex(chat);

             if (this.activeChatId === chatId) {
                 this.activeChat = chat;
                 this.logger.debug(`Updated active chat cache for ${chatId} after message deletion.`);
                 this.plugin.emit('active-chat-changed', { chatId: chatId, chat: chat });
             }

              if (deletedMessage) {
                  this.plugin.emit('message-deleted', { chatId: chatId, timestamp: deletedMessage.timestamp });
              }

             return true;
         } catch (error) {
             this.logger.error(`Error during message deletion by index ${messageIndex} for chat ${chatId}:`, error);
             new Notice("Error deleting message.");
             return false;
         }
    }


    async clearChatMessagesById(chatId: string): Promise<boolean> {
        this.logger.info(`Attempting to clear messages for chat ${chatId}`);
        const chat = await this.getChat(chatId);
        if (!chat) {
            this.logger.error(`Cannot clear messages: Chat ${chatId} not found.`);
            new Notice(`Error: Chat ${chatId} not found.`);
            return false;
        }

        if (chat.messages.length === 0) {
             this.logger.debug(`Chat ${chatId} already has no messages. Nothing to clear.`);
             return true;
        }

        try {
            chat.clearMessages();
            await this.saveChatAndUpdateIndex(chat);

            const isActive = chatId === this.activeChatId;
            if (isActive) {
                this.activeChat = chat;
                this.logger.debug(`Updated active chat cache for ${chatId} after clearing messages.`);
                this.plugin.emit('messages-cleared', chatId);
            }
             new Notice(`Messages cleared for chat "${chat.metadata.name}".`);
            return true;

        } catch (error) {
             this.logger.error(`Error during message clearing process for chat ${chatId}:`, error);
             new Notice("Error clearing messages.");
             return false;
        }
    }

    async renameChat(chatId: string, newName: string): Promise<boolean> {
        const trimmedName = newName.trim();
        if (!trimmedName) {
            this.logger.warn(`Attempted to rename chat ${chatId} with an empty name.`);
            new Notice("Chat name cannot be empty.");
            return false;
        }
        if (/[\\/?:*"<>|]/.test(trimmedName)) {
             this.logger.warn(`Attempted to rename chat ${chatId} with invalid characters: "${trimmedName}"`);
             new Notice("Chat name contains invalid characters.");
             return false;
        }

        this.logger.info(`Attempting to rename chat ${chatId} to "${trimmedName}"`);
        const chat = await this.getChat(chatId);

        if (!chat) {
            this.logger.error(`Cannot rename: Chat ${chatId} not found.`);
            new Notice("Chat not found.");
            return false;
        }

        if (chat.metadata.name === trimmedName) {
             this.logger.debug(`Chat ${chatId} already has the name "${trimmedName}". No changes needed.`);
             return true;
        }

        try {
            const changed = chat.updateMetadata({ name: trimmedName });

            if (changed) {
                this.logger.debug(`Chat ${chatId} name updated in Chat object. Save scheduled.`);
                await this.saveChatAndUpdateIndex(chat);

                if (this.activeChatId === chatId) {
                    this.activeChat = chat;
                    this.plugin.emit('active-chat-changed', { chatId: chatId, chat: chat });
                }
                 new Notice(`Chat renamed to "${trimmedName}".`);
                return true;

            } else {
                 this.logger.debug(`Rename called for ${chatId}, but updateMetadata reported no change (unexpected).`);
                 return false;
            }

        } catch(error) {
            this.logger.error(`Error renaming chat ${chatId}:`, error);
            new Notice("An error occurred while renaming the chat.");
            return false;
        }
    }

    // --- НОВІ МЕТОДИ ДЛЯ ПАПОК ---

    /**
     * Створює нову папку за вказаним шляхом.
     * @param folderPath Повний, нормалізований шлях до папки, яку потрібно створити.
     * @returns true, якщо папка успішно створена, false в іншому випадку.
     */
    async createFolder(folderPath: string): Promise<boolean> {
        const normalizedPath = normalizePath(folderPath);
        this.logger.info(`Attempting to create folder: ${normalizedPath}`);

        // Перевірка базових правил
        if (!normalizedPath || normalizedPath === "/" || normalizedPath === ".") {
             this.logger.error("Cannot create folder at root or with empty/dot path.");
             new Notice("Invalid folder path.");
             return false;
        }
         if (normalizedPath.startsWith("..") || normalizedPath.includes("\0")) {
             this.logger.error(`Attempted to create folder with invalid path: ${normalizedPath}`);
             new Notice("Invalid characters or path traversal detected.");
             return false;
         }

        try {
            const exists = await this.adapter.exists(normalizedPath);
            if (exists) {
                this.logger.warn(`Folder or file already exists at path: ${normalizedPath}`);
                new Notice(`"${normalizedPath.split('/').pop()}" already exists.`);
                return false;
            }

            await this.adapter.mkdir(normalizedPath);
            this.logger.info(`Folder created successfully: ${normalizedPath}`);
            this.plugin.emit('chat-list-updated'); // Сповіщаємо UI про зміни
            return true;

        } catch (error: any) {
             if (error.code === 'EPERM' || error.code === 'EACCES') {
                 this.logger.error(`Permission error creating folder ${normalizedPath}:`, error);
                 new Notice(`Permission error creating folder.`);
             } else {
                 this.logger.error(`Error creating folder ${normalizedPath}:`, error);
                 new Notice(`Failed to create folder: ${error.message || "Unknown error"}`);
             }
             return false;
        }
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
    async renameFolder(oldPath: string, newPath: string): Promise<boolean> {
        const normOldPath = normalizePath(oldPath);
        const normNewPath = normalizePath(newPath);
        this.logger.info(`Attempting to rename folder ${normOldPath} to ${normNewPath}`);

        // Перевірки
        if (!normOldPath || normOldPath === "/" || !normNewPath || normNewPath === "/") {
             this.logger.error("Invalid paths provided for rename operation.");
             new Notice("Cannot rename root folder or use empty path.");
             return false;
        }
         if (normOldPath === normNewPath) {
              this.logger.debug("Old path and new path are identical. No rename needed.");
              return true; // Вважаємо успіхом, бо цільовий стан досягнуто
         }
          if (normNewPath.startsWith(normOldPath + '/')) {
               this.logger.error(`Cannot move folder "${normOldPath}" inside itself ("${normNewPath}").`);
               new Notice("Cannot move a folder inside itself.");
               return false;
          }


        try {
            const oldExists = await this.adapter.exists(normOldPath);
            if (!oldExists) {
                this.logger.error(`Source folder for rename does not exist: ${normOldPath}`);
                new Notice("Folder to rename not found.");
                return false;
            }
            const oldStat = await this.adapter.stat(normOldPath);
            if (oldStat?.type !== 'folder') {
                 this.logger.error(`Source path is not a folder: ${normOldPath}`);
                 new Notice("Item to rename is not a folder.");
                 return false;
            }

            const newExists = await this.adapter.exists(normNewPath);
            if (newExists) {
                this.logger.error(`Target path for rename already exists: ${normNewPath}`);
                new Notice(`"${normNewPath.split('/').pop()}" already exists.`);
                return false;
            }

            // Виконуємо перейменування/переміщення
            await this.adapter.rename(normOldPath, normNewPath);
            this.logger.info(`Folder renamed/moved successfully from ${normOldPath} to ${normNewPath}`);

            // Оновлюємо шляхи в завантажених чатах (loadedChats), якщо вони були всередині
            Object.values(this.loadedChats).forEach(chat => {
                 if (chat.filePath.startsWith(normOldPath + '/')) {
                      const relativePath = chat.filePath.substring(normOldPath.length);
                      const updatedPath = normalizePath(normNewPath + relativePath);
                      this.logger.debug(`Updating cached chat path for ${chat.metadata.id}: ${chat.filePath} -> ${updatedPath}`);
                      chat.filePath = updatedPath; // Оновлюємо шлях у кешованому об'єкті
                 }
            });

            this.plugin.emit('chat-list-updated'); // Сповіщаємо UI
            return true;

        } catch (error: any) {
             if (error.code === 'EPERM' || error.code === 'EACCES') {
                 this.logger.error(`Permission error renaming folder ${normOldPath} to ${normNewPath}:`, error);
                 new Notice(`Permission error renaming folder.`);
             } else {
                 this.logger.error(`Error renaming folder ${normOldPath} to ${normNewPath}:`, error);
                 new Notice(`Failed to rename folder: ${error.message || "Unknown error"}`);
             }
             return false;
        }
    }

    /**
     * Рекурсивно видаляє папку та весь її вміст (підпапки та чати).
     * @param folderPath Повний, нормалізований шлях до папки, яку потрібно видалити.
     * @returns true, якщо папка та її вміст успішно видалені, false в іншому випадку.
     */
    async deleteFolder(folderPath: string): Promise<boolean> {
        const normalizedPath = normalizePath(folderPath);
        this.logger.info(`Attempting to delete folder recursively: ${normalizedPath}`);

        // Перевірка, чи шлях валідний і не є коренем сховища або основною папкою чатів
        if (!normalizedPath || normalizedPath === "/" || normalizedPath === "." ) {
            this.logger.error(`Attempted to delete root or invalid folder path: ${normalizedPath}`);
            new Notice("Cannot delete this folder.");
            return false;
        }
         // Додаткова перевірка на основну папку чатів
          if (normalizedPath === this.chatsFolderPath) {
               this.logger.error(`Attempted to delete the main chat history folder: ${normalizedPath}`);
               new Notice("Cannot delete the main chat history folder set in settings.");
               return false;
          }


        try {
            const exists = await this.adapter.exists(normalizedPath);
            if (!exists) {
                this.logger.warn(`Folder to delete does not exist: ${normalizedPath}`);
                // Вважаємо успіхом, якщо папки вже немає
                return true;
            }
             const stat = await this.adapter.stat(normalizedPath);
             if (stat?.type !== 'folder') {
                  this.logger.error(`Path to delete is not a folder: ${normalizedPath}`);
                  new Notice("Item to delete is not a folder.");
                  return false;
             }

            // --- Очищення індексу та кешу ПЕРЕД видаленням ---
            this.logger.debug(`Clearing index/cache for folder being deleted: ${normalizedPath}`);
            const chatIdsToDelete: string[] = [];
            // Функція для рекурсивного збору ID чатів
            const collectChatIds = async (currentPath: string) => {
                 try {
                      const list = await this.adapter.list(currentPath);
                      for (const file of list.files) {
                           const fileName = file.substring(file.lastIndexOf('/') + 1);
                           if (fileName.endsWith('.json')) {
                                const chatId = fileName.slice(0, -5);
                                // Перевіряємо, чи є такий ID в індексі
                                if (this.chatIndex[chatId]) {
                                     chatIdsToDelete.push(chatId);
                                }
                           }
                      }
                      for (const folder of list.folders) {
                           await collectChatIds(folder); // Рекурсія
                      }
                 } catch(listError) {
                      this.logger.error(`Error listing folder ${currentPath} during pre-delete cleanup:`, listError);
                 }
            };
            await collectChatIds(normalizedPath); // Збираємо ID

            let activeChatWasDeleted = false;
            chatIdsToDelete.forEach(id => {
                 if (this.chatIndex[id]) {
                      delete this.chatIndex[id];
                      this.logger.trace(`Removed chat ${id} from index during folder deletion.`);
                 }
                 if (this.loadedChats[id]) {
                      delete this.loadedChats[id];
                      this.logger.trace(`Removed chat ${id} from cache during folder deletion.`);
                 }
                 if (this.activeChatId === id) {
                      activeChatWasDeleted = true;
                      this.activeChatId = null; // Скидаємо активний ID
                      this.activeChat = null;
                 }
            });
            // Зберігаємо змінений індекс
            await this.saveChatIndex();
             // Якщо активний чат був видалений, зберігаємо null
             if (activeChatWasDeleted) {
                  await this.plugin.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
                  this.logger.info("Active chat was inside the deleted folder. Active chat reset to null.");
             }
            // --- Кінець очищення ---

            // Використовуємо рекурсивне видалення адаптера
            await this.adapter.rmdir(normalizedPath, true);
            this.logger.info(`Folder deleted successfully (recursively): ${normalizedPath}`);

            // Сповіщаємо UI про зміни (оскільки індекс оновлено)
            this.plugin.emit('chat-list-updated');
            // Якщо активний чат скинуто, сповіщаємо про це
            if (activeChatWasDeleted) {
                 this.plugin.emit('active-chat-changed', { chatId: null, chat: null });
                 // Спробувати активувати наступний доступний чат (необов'язково тут, бо SidebarManager це робить)
            }

            return true;

        } catch (error: any) {
             if (error.code === 'EPERM' || error.code === 'EACCES') {
                 this.logger.error(`Permission error deleting folder ${normalizedPath}:`, error);
                 new Notice(`Permission error deleting folder.`);
             } else {
                 this.logger.error(`Error deleting folder ${normalizedPath}:`, error);
                 new Notice(`Failed to delete folder: ${error.message || "Unknown error"}`);
             }
             // Спробуємо перебудувати індекс, щоб виправити можливу розсинхронізацію
             await this.rebuildIndexFromFiles();
             return false;
        }
    }
    // --- КІНЕЦЬ НОВИХ МЕТОДІВ ---

} // End of ChatManager class