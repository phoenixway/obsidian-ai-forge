// src/ChatManager.ts
import { App, Notice, DataAdapter, normalizePath, TFolder, debounce, TAbstractFile } from "obsidian"; // Додано TAbstractFile
import OllamaPlugin, { ACTIVE_CHAT_ID_KEY, CHAT_INDEX_KEY } from "./main";
import { Chat, ChatMetadata, ChatData, ChatConstructorSettings } from "./Chat";
import { MessageRole } from "./OllamaView"; // Припускаємо, що типи тут
import { v4 as uuidv4 } from "uuid";
import { Logger } from "./Logger";
import { ToolCall, Message, MessageRole as MessageRoleTypeFromTypes } from "./types"; 

export type HMACompletionCallback = (messageTimestampMs: number) => void;
export type HMAResolverRegistration = (timestampMs: number, resolve: () => void, reject: (reason?: any) => void) => void;

// --- ТИПИ ДЛЯ ІЄРАРХІЇ ---
export interface FolderNode {
  type: "folder";
  name: string;
  path: string;
  children: Array<FolderNode | ChatNode>;
  isExpanded?: boolean;
}

export interface ChatNode {
  type: "chat";
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
interface TaskState {
  urgent: string[];
  regular: string[];
  hasContent: boolean;
}

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
  public messageAddedResolvers: Map<number, {resolve: () => void, reject: (reason?: any) => void}> = new Map();

  constructor(plugin: OllamaPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.adapter = plugin.app.vault.adapter;
    this.logger = plugin.logger;
  }

  async initialize(): Promise<void> {
    this.updateChatsFolderPath();
    await this.ensureFoldersExist();
    await this.loadChatIndex(true);

    const savedActiveId = await this.plugin.loadDataKey(ACTIVE_CHAT_ID_KEY);
    if (savedActiveId && this.chatIndex[savedActiveId]) {
      await this.setActiveChat(savedActiveId);
    } else {
      //  if (savedActiveId)
      //
      await this.plugin.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
      const hierarchy = await this.getChatHierarchy();
      const firstChat = this.findFirstChatInHierarchy(hierarchy);
      if (firstChat) {
        await this.setActiveChat(firstChat.metadata.id);
      } else {
        await this.setActiveChat(null);
      }
    }
  }

  private findFirstChatInHierarchy(nodes: HierarchyNode[]): ChatNode | null {
    for (const node of nodes) {
      if (node.type === "chat") {
        if (!isNaN(new Date(node.metadata.lastModified).getTime())) {
          return node;
        } else {
        }
      } else if (node.type === "folder") {
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
    this.chatsFolderPath = settingsPath ? normalizePath(settingsPath) : "/";
    if (this.chatsFolderPath !== "/" && this.chatsFolderPath.endsWith("/")) {
      this.chatsFolderPath = this.chatsFolderPath.slice(0, -1);
    }
    // Перевірка чи шлях не порожній після обрізки
    if (!this.chatsFolderPath) {
      this.chatsFolderPath = "/";
    }
  }

  updateTaskState(tasks: TaskState | null) {
    this.currentTaskState = tasks;
  }

  getCurrentTaskState(): TaskState | null {
    return this.currentTaskState;
  }

  public async ensureFoldersExist(): Promise<void> {
    const historyPath = this.plugin.settings.chatHistoryFolderPath?.trim();
    const exportPath = this.plugin.settings.chatExportFolderPath?.trim();

    const checkAndCreate = async (folderPath: string | undefined | null, folderDesc: string) => {
      if (!folderPath || folderPath === "/") return;
      const normalized = normalizePath(folderPath);
      // Додаткова перевірка на безпеку шляху
      if (normalized.startsWith("..") || normalized.includes("\0")) {
        new Notice(`Error: Invalid path for ${folderDesc}.`);
        return;
      }
      try {
        const exists = await this.adapter.exists(normalized);
        if (!exists) {
          await this.adapter.mkdir(normalized);
        } else {
          const stat = await this.adapter.stat(normalized);
          if (stat?.type !== "folder") {
            new Notice(`Error: Path for ${folderDesc} is not a folder.`);
          } else {
          }
        }
      } catch (error) {
        new Notice(`Error accessing folder for ${folderDesc}. Check permissions.`);
      }
    };
    await checkAndCreate(historyPath, "Chat History");
    await checkAndCreate(exportPath, "Chat Export");
  }

  private async loadChatIndex(forceScan: boolean = false): Promise<void> {
    const storedIndex = await this.plugin.loadDataKey(CHAT_INDEX_KEY);

    const settingsPath = this.plugin.settings.chatHistoryFolderPath?.trim();
    const currentPath = settingsPath && settingsPath !== "/" ? normalizePath(settingsPath) : "/";
    if (currentPath !== this.chatsFolderPath) {
      this.updateChatsFolderPath();
      forceScan = true;
    }

    if (!forceScan && storedIndex && typeof storedIndex === "object" && Object.keys(storedIndex).length > 0) {
      const firstKey = Object.keys(storedIndex)[0];
      if (
        storedIndex[firstKey] &&
        typeof storedIndex[firstKey].name === "string" &&
        typeof storedIndex[firstKey].lastModified === "string" &&
        typeof storedIndex[firstKey].createdAt === "string"
      ) {
        this.chatIndex = storedIndex;

        return;
      } else {
        forceScan = true;
      }
    } else if (!forceScan && storedIndex && typeof storedIndex === "object" && Object.keys(storedIndex).length === 0) {
      this.chatIndex = {};
      return;
    } else if (!forceScan) {
      forceScan = true;
    }

    if (forceScan) {
      await this.rebuildIndexFromFiles();
    }
  }

  public async rebuildIndexFromFiles(): Promise<void> {
    const newIndex: ChatSessionIndex = {};
    let chatsLoaded = 0;
    let filesScanned = 0;

    try {
      if (this.chatsFolderPath !== "/") {
        const exists = await this.adapter.exists(this.chatsFolderPath);
        if (!exists) {
          try {
            await this.adapter.mkdir(this.chatsFolderPath);
          } catch (mkdirError) {
            this.chatIndex = {};
            await this.saveChatIndex();
            return;
          }
        } else {
          const stat = await this.adapter.stat(this.chatsFolderPath);
          if (stat?.type !== "folder") {
            new Notice(`Error: Chat history path '${this.chatsFolderPath}' is not a folder.`);
            this.chatIndex = {};
            await this.saveChatIndex();
            return;
          }
        }
      }

      const scanAndIndex = async (folderPath: string): Promise<void> => {
        let listResult;
        try {
          listResult = await this.adapter.list(folderPath);
        } catch (listError: any) {
          if (listError.message && listError.message.includes("Not a directory")) {
          } else {
          }
          return;
        }

        for (const fullPath of listResult.files) {
          const fileName = fullPath.substring(fullPath.lastIndexOf("/") + 1);
          if (!fileName.endsWith(".json") || fileName.startsWith(".")) continue;

          const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.json$/i;
          const oldPattern = /^chat_\d+_[a-zA-Z0-9]+\.json$/;

          if (!uuidPattern.test(fileName) && !oldPattern.test(fileName)) continue;
          filesScanned++;

          const chatId = fileName.slice(0, -5);

          try {
            const jsonContent = await this.adapter.read(fullPath);
            const data = JSON.parse(jsonContent) as Partial<ChatData>;

            if (
              data?.metadata?.id === chatId &&
              typeof data.metadata.name === "string" &&
              data.metadata.name.trim() !== "" &&
              typeof data.metadata.lastModified === "string" &&
              !isNaN(new Date(data.metadata.lastModified).getTime()) &&
              typeof data.metadata.createdAt === "string" &&
              !isNaN(new Date(data.metadata.createdAt).getTime())
            ) {
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
            }
          } catch (e: any) {
            if (e instanceof SyntaxError) {
            } else {
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
    } catch (error: any) {
      if (error.code === "ENOENT") {
        new Notice(`Error: Chat history folder '${this.chatsFolderPath}' not found.`);
      } else if (error.code === "EPERM" || error.code === "EACCES") {
        new Notice("Permission error accessing chat history folder.");
      } else {
        new Notice("Error rebuilding chat index. Check console.");
      }
      this.chatIndex = {};
      await this.saveChatIndex();
    }
  }

  private async saveChatIndex(): Promise<void> {
    try {
      await this.plugin.saveDataKey(CHAT_INDEX_KEY, this.chatIndex);
    } catch (error) {
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
    const children: HierarchyNode[] = [];
    let listResult;

    try {
      const exists = await this.adapter.exists(folderPath);
      if (!exists) {
        return [];
      }
      const stat = await this.adapter.stat(folderPath);
      if (stat?.type !== "folder") {
        return [];
      }

      listResult = await this.adapter.list(folderPath);
    } catch (error: any) {
      if (error.code === "EPERM" || error.code === "EACCES") {
        new Notice(`Permission error reading folder: ${folderPath}`);
      } else {
      }
      return [];
    }

    for (const subFolderPath of listResult.folders) {
      try {
        const subStat = await this.adapter.stat(subFolderPath);
        if (subStat?.type === "folder") {
          const folderName = subFolderPath.substring(subFolderPath.lastIndexOf("/") + 1);
          const subChildren = await this._scanFolderRecursive(subFolderPath);
          children.push({
            type: "folder",
            name: folderName,
            path: subFolderPath,
            children: subChildren,
          });
        } else {
        }
      } catch (statError) {}
    }

    for (const fullPath of listResult.files) {
      const fileName = fullPath.substring(fullPath.lastIndexOf("/") + 1);

      if (!fileName.endsWith(".json") || fileName.startsWith(".")) continue;
      const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.json$/i;
      const oldPattern = /^chat_\d+_[a-zA-Z0-9]+\.json$/;
      if (!uuidPattern.test(fileName) && !oldPattern.test(fileName)) continue;

      const chatId = fileName.slice(0, -5);

      const storedMeta = this.chatIndex[chatId];
      if (storedMeta) {
        if (isNaN(new Date(storedMeta.lastModified).getTime()) || isNaN(new Date(storedMeta.createdAt).getTime())) {
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
          type: "chat",
          metadata: chatMetadata,
          filePath: fullPath,
        });
      } else {
      }
    }

    children.sort((a, b) => {
      if (a.type === "folder" && b.type === "chat") return -1;
      if (a.type === "chat" && b.type === "folder") return 1;
      if (a.type === "folder" && b.type === "folder") {
        return a.name.localeCompare(b.name);
      }
      if (a.type === "chat" && b.type === "chat") {
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
      const indexNeedsUpdate =
        !existingIndexEntry ||
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
        this.logger.error(`[ChatManager] >>> Emitting 'chat-list-updated' from saveChatAndUpdateIndex for ID: ${meta.id}`);
        this.plugin.emit("chat-list-updated");
        this.logger.debug(`Chat index updated for ${meta.id} after save trigger.`);
      } else {
        this.logger.trace(`Index for chat ${meta.id} unchanged after save trigger, skipping index save/event.`);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  // src/ChatManager.ts
async createNewChat(name?: string, folderPath?: string): Promise<Chat | null> {
  const targetFolder = folderPath ? normalizePath(folderPath) : this.chatsFolderPath;
  const finalFolderPath = targetFolder === "" || targetFolder === "." ? "/" : targetFolder;

  try {
      await this.ensureSpecificFolderExists(finalFolderPath);
  } catch (folderError) {
      // Повідомлення про помилку вже є в ensureSpecificFolderExists або вище
      new Notice(`Failed to ensure target folder exists: ${finalFolderPath}`);
      return null;
  }

  try {
      const now = new Date();
      const newId = uuidv4();
      const filePath = this.getChatFilePath(newId, finalFolderPath);

      const initialMetadata: ChatMetadata = {
          id: newId,
          name: name || `Chat ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
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
      // ВИДАЛЕНО: this.plugin.emit("chat-list-updated");
      // Покладаємося на 'active-chat-changed' з setActiveChat для оновлення UI.

      const savedImmediately = await newChat.saveImmediately();
      if (!savedImmediately) {
          delete this.chatIndex[newId];
          await this.saveChatIndex();
          // Ця емісія може залишитися, оскільки це шлях обробки помилки/очищення
          this.logger.error(`[ChatManager] >>> Emitting 'chat-list-updated' from createNewChat (saveImmediately FAILED) for ID: ${newId}`);
          this.plugin.emit("chat-list-updated");

          new Notice("Error: Failed to save new chat file.");
          return null;
      }

      this.loadedChats[newId] = newChat;
      // setActiveChat згенерує 'active-chat-changed', що має оновити OllamaView,
      // включаючи виклик sidebarManager.updateChatList() через loadAndDisplayActiveChat.
      await this.setActiveChat(newId);

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
        await this.adapter.mkdir(normalized);
      } else {
        const stat = await this.adapter.stat(normalized);
        if (stat?.type !== "folder") {
          this.logger.error(`Path exists but is not a folder: ${normalized}`);
          throw new Error(`Target path ${normalized} is not a folder.`);
        }
      }
    } catch (error) {
      this.logger.error(`Error creating/checking target folder '${normalized}':`, error);
      throw new Error(
        `Failed to ensure target folder ${normalized} exists: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /** @deprecated Use getChatHierarchy instead. */
  listAvailableChats(): ChatMetadata[] {
    return Object.entries(this.chatIndex)
      .map(([id, storedMeta]): ChatMetadata | null => {
        if (
          !storedMeta ||
          typeof storedMeta !== "object" ||
          typeof storedMeta.name !== "string" ||
          typeof storedMeta.lastModified !== "string" ||
          typeof storedMeta.createdAt !== "string"
        ) {
          return null;
        }
        const lastModDate = new Date(storedMeta.lastModified);
        const createdDate = new Date(storedMeta.createdAt);
        if (isNaN(lastModDate.getTime()) || isNaN(createdDate.getTime())) {
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
          contextWindow: storedMeta.contextWindow,
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

  getActiveChatId(): string | null {
    return this.activeChatId;
  }

  // src/ChatManager.ts

  public async getActiveChatOrFail(): Promise<Chat> {
    const chat = await this.getActiveChat();
    if (!chat) {
      this.logger.error("[ChatManager] getActiveChatOrFail: No active chat found or failed to load!");
      // Можна кинути більш специфічну помилку, або просто Error
      throw new Error("No active chat found or it failed to load.");
    }
    return chat;
  }

  public async addMessageToActiveChatPayload(messagePayload: Message, emitEvent: boolean = true): Promise<Message | null> {
    const operationTimestampId = messagePayload.timestamp.getTime(); // Для логування
    this.plugin.logger.debug(`[ChatManager][addMessagePayload id:${operationTimestampId}] Attempting to add message (Role: ${messagePayload.role}) to active chat.`);

    const activeChatInstance = await this.getActiveChat(); 
    if (!activeChatInstance) {
      this.plugin.logger.error(`[ChatManager][addMessagePayload id:${operationTimestampId}] Cannot add message payload: No active chat.`);
      // Розгляньте можливість створення нового чату тут, якщо це бажана поведінка
      // const newChat = await this.createNewChat();
      // if (newChat) { ... } else { return null; }
      return null;
    }

    // Переконуємося, що timestamp є
    if (!messagePayload.timestamp) {
        messagePayload.timestamp = new Date();
        this.plugin.logger.warn(`[ChatManager][addMessagePayload id:${operationTimestampId}] Message payload was missing timestamp, set to now.`);
    }

    activeChatInstance.messages.push(messagePayload);
    // Оновлюємо lastModified та потенційно інші метадані, якщо потрібно
    // const metadataChanged = activeChatInstance.updateMetadata({ lastModified: new Date().toISOString() }); 
    const activityRecorded = activeChatInstance.recordActivity(); 
    this.plugin.logger.debug(`[ChatManager][addMessagePayload id:${operationTimestampId}] Message pushed to in-memory chat. Metadata changed: ${activityRecorded}`);



if (activityRecorded) { // Оновлюємо індекс, тільки якщо були зміни
        const saveAndUpdateIndexSuccess = await this.saveChatAndUpdateIndex(activeChatInstance); // metadataChanged більше не потрібен як параметр, якщо save() в Chat.ts
        if (!saveAndUpdateIndexSuccess) {
            this.plugin.logger.error(`[ChatManager][addMessagePayload id:${operationTimestampId}] Failed to update index for chat ${activeChatInstance.metadata.id} after activity.`);
        }
    }

    if (emitEvent) {
      // Переконуємося, що ID чату для події відповідає поточному активному чату
      const currentActiveChatIdForEvent = this.activeChatId || activeChatInstance.metadata.id;
      this.plugin.logger.debug(`[ChatManager][addMessagePayload id:${operationTimestampId}] Emitting 'message-added' for chat ${currentActiveChatIdForEvent}, msg role: ${messagePayload.role}, msg_ts: ${messagePayload.timestamp.getTime()}`);
      this.plugin.emit("message-added", { chatId: currentActiveChatIdForEvent, message: messagePayload });
    }
    return messagePayload;
  }

async getChat(id: string, filePath?: string): Promise<Chat | null> {
  if (this.loadedChats[id]) {
      this.logger.trace(`[ChatManager.getChat] Returning cached chat for ID: ${id}`);
      return this.loadedChats[id];
  }

  let actualFilePath: string | undefined = filePath;
  if (!actualFilePath) {
      // this.logger.debug(`[ChatManager.getChat] File path not provided for ID: ${id}. Searching in hierarchy...`);
      try {
          const hierarchy = await this.getChatHierarchy();
          actualFilePath = this.findChatPathInHierarchy(id, hierarchy) ?? undefined;
          if (actualFilePath) {
              // this.logger.debug(`[ChatManager.getChat] Found file path for ID ${id} in hierarchy: ${actualFilePath}`);
          } else {
              // this.logger.warn(`[ChatManager.getChat] File path for ID ${id} NOT found in hierarchy.`);
          }
      } catch (hierarchyError) {
          this.logger.error(`[ChatManager.getChat] Error getting hierarchy while searching path for chat ${id}:`, hierarchyError);
          actualFilePath = undefined; // Забезпечуємо, що undefined, якщо була помилка
      }
  }

  // Якщо шлях так і не визначено, але чат є в індексі, це проблема з консистентністю
  if (!actualFilePath && this.chatIndex[id]) {
      this.logger.error(`[ChatManager.getChat] Chat ID ${id} exists in index but its file path could not be determined. Chat may be orphaned or index is stale.`);
      // Можливо, варто спробувати перебудувати індекс тут, або просто повернути null
      // await this.rebuildIndexFromFiles(); // Обережно: може бути рекурсивно, якщо getChat викликається з rebuildIndex
      // if (!this.chatIndex[id]) return null; // Якщо після rebuild його немає
      // actualFilePath = this.findChatPathInHierarchy(id, await this.getChatHierarchy()) ?? undefined;
      // if (!actualFilePath) {
      //     this.logger.error(`[ChatManager.getChat] Still no path after potential index rebuild for ${id}.`);
      //     return null;
      // }
      return null; // Поки що просто повертаємо null, якщо шлях не знайдено
  }

  // Якщо чату немає в індексі і шлях не надано/не знайдено, то чату немає
  if (!this.chatIndex[id] && !actualFilePath) {
      this.logger.warn(`[ChatManager.getChat] Chat ID ${id} not found in index and no file path available.`);
      return null;
  }

  // Якщо шлях є, але чату немає в індексі -> спробувати завантажити, потім оновити індекс
  // Якщо чат є в індексі, але шлях не надано -> ми вже спробували його знайти
  // Якщо і шлях є, і в індексі є -> завантажуємо

  if (!actualFilePath) { // Ця умова тепер має бути рідкісною, якщо логіка вище відпрацювала
       this.logger.error(`[ChatManager.getChat] CRITICAL: actualFilePath is still undefined for chat ID ${id} when it should be known or chat should be considered non-existent.`);
       return null;
  }


  try {
      // actualFilePath тут точно має бути string
      const chat = await Chat.loadFromFile(actualFilePath, this.adapter, this.plugin.settings, this.logger);

      if (chat) {
          this.loadedChats[id] = chat; // Кешуємо завантажений чат

          // Перевіряємо та оновлюємо індекс, якщо метадані у файлі новіші/відрізняються
          const storedMeta = this.chatIndex[id];
          const currentMeta = chat.metadata;
          const indexNeedsUpdate =
              !storedMeta || // Якщо чату не було в індексі (наприклад, завантажили по прямому шляху)
              storedMeta.name !== currentMeta.name ||
              storedMeta.lastModified !== currentMeta.lastModified ||
              storedMeta.createdAt !== currentMeta.createdAt ||
              storedMeta.modelName !== currentMeta.modelName ||
              storedMeta.selectedRolePath !== currentMeta.selectedRolePath ||
              storedMeta.temperature !== currentMeta.temperature ||
              storedMeta.contextWindow !== currentMeta.contextWindow;

          if (indexNeedsUpdate) {
              this.logger.debug(`[ChatManager.getChat] Index needs update for chat ${id}. Calling saveChatAndUpdateIndex.`);
              // saveChatAndUpdateIndex оновить індекс і згенерує 'chat-list-updated', якщо потрібно
              await this.saveChatAndUpdateIndex(chat);
          }
          return chat;
      } else {
          // Chat.loadFromFile повернув null (файл пошкоджений або невалідний)
          this.logger.error(
          `[ChatManager.getChat] Chat.loadFromFile returned null for ID ${id} at path ${actualFilePath}. Removing from index if present.`
          );
          // --- ВИПРАВЛЕНО: Використовуємо новий метод ---
          await this.deleteChatFileAndIndexEntry_NoEmit(id, actualFilePath, false); // false - не намагаємось видалити файл, бо він або не існує, або пошкоджений
          // ---
          if (this.activeChatId === id) {
              this.logger.warn(`[ChatManager.getChat] Active chat ${id} failed to load, setting active chat to null.`);
              await this.setActiveChat(null); // Згенерує 'active-chat-changed'
          }
          return null;
      }
  } catch (error: any) {
      this.logger.error(`[ChatManager.getChat] Unexpected error during getChat for ID ${id} from ${actualFilePath}:`, error);
      if (error.code === "ENOENT") { // Файл не знайдено
          this.logger.warn(`[ChatManager.getChat] File not found (ENOENT) for chat ${id} at ${actualFilePath}. Cleaning up index.`);
          // --- ВИПРАВЛЕНО: Використовуємо новий метод ---
          await this.deleteChatFileAndIndexEntry_NoEmit(id, actualFilePath, false); // false - файл і так не знайдено
          // ---
          if (this.activeChatId === id) {
              this.logger.warn(`[ChatManager.getChat] Active chat ${id} file not found, setting active chat to null.`);
              await this.setActiveChat(null); // Згенерує 'active-chat-changed'
          }
      }
      // Для інших помилок, можливо, не варто видаляти з індексу одразу,
      // але це залежить від бажаної поведінки. Поточна логіка - видалити.
      return null;
  }
}

  private findChatPathInHierarchy(chatId: string, nodes: HierarchyNode[]): string | null {
    for (const node of nodes) {
      if (node.type === "chat" && node.metadata.id === chatId) {
        return node.filePath;
      } else if (node.type === "folder") {
        const pathInFolder = this.findChatPathInHierarchy(chatId, node.children);
        if (pathInFolder) {
          return pathInFolder;
        }
      }
    }
    return null;
  }

  
  
  async getActiveChat(): Promise<Chat | null> {
    if (!this.activeChatId) {
      return null;
    }
    if (this.activeChat && this.activeChat.metadata.id === this.activeChatId) {
      return this.activeChat;
    }

    const chat = await this.getChat(this.activeChatId);
    if (chat) {
      this.activeChat = chat;
      return chat;
    } else {
      const hierarchy = await this.getChatHierarchy();
      const firstChat = this.findFirstChatInHierarchy(hierarchy);
      const nextActiveId = firstChat ? firstChat.metadata.id : null;

      await this.setActiveChat(nextActiveId);
      return this.activeChat;
    }
  }

  public async setActiveChat(id: string | null): Promise<void> {
    const previousActiveId = this.activeChatId;

    if (id === previousActiveId) {
      if (id && !this.activeChat) {
        this.activeChat = await this.getChat(id);
      }
      return;
    }

    if (id && !this.chatIndex[id]) {
      this.logger.error(`Attempted to set active chat to non-existent ID in index: ${id}. Rebuilding index...`);
      await this.rebuildIndexFromFiles();
      if (!this.chatIndex[id]) {
        this.logger.error(
          `Chat ID ${id} still not found after index reload. Aborting setActiveChat. Keeping previous active chat: ${previousActiveId}`
        );
        new Notice(`Error: Chat with ID ${id} not found. Cannot activate.`);
        return;
      }
    }

    this.activeChatId = id;
    this.activeChat = null;
    await this.plugin.saveDataKey(ACTIVE_CHAT_ID_KEY, id);

    let loadedChat: Chat | null = null;
    if (id) {
      loadedChat = await this.getChat(id);
      if (!loadedChat) {
        this.logger.error(
          `CRITICAL: Failed to load chat ${id} via getChat even after index check. Resetting active chat to null.`
        );
        this.activeChatId = null;
        await this.plugin.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
        id = null;
      } else {
        this.activeChat = loadedChat;
      }
    } else {
    }

    this.plugin.emit("active-chat-changed", { chatId: id, chat: this.activeChat });
  }

  async addMessageToActiveChat(
    role: MessageRole,
    content: string,
    timestamp?: Date,
    emitEvent: boolean = true,
    tool_calls?: ToolCall[],
    tool_call_id?: string,
    name?: string
  ): Promise<Message | null> {
    const messageTimestamp = timestamp || new Date();
    const newMessage: Message = {
        role,
        content,
        timestamp: messageTimestamp,
    };

    // Додаємо опціональні поля, якщо вони надані
    if (tool_calls && tool_calls.length > 0) {
      newMessage.tool_calls = tool_calls;
    }
    if (tool_call_id) {
      newMessage.tool_call_id = tool_call_id;
    }
    if (name) {
      newMessage.name = name;
    }
    // Можливо, додати поле 'images', якщо воно використовується при створенні повідомлення тут

    return await this.addMessageToActiveChatPayload(newMessage, emitEvent);
  }

  async clearActiveChatMessages(): Promise<void> {
    const activeChat = await this.getActiveChat();
    if (!activeChat) {
      return;
    }
    if (activeChat.messages.length === 0) {
      return;
    }

    activeChat.clearMessages();

    await this.saveChatAndUpdateIndex(activeChat);
    this.plugin.emit("messages-cleared", activeChat.metadata.id);
  }

  async updateActiveChatMetadata(
    metadataUpdate: Partial<Omit<ChatMetadata, "id" | "createdAt" | "lastModified">>
  ): Promise<boolean> {
    const activeChat = await this.getActiveChat();
    if (!activeChat) {
      new Notice("No active chat to update metadata for.");
      return false;
    }
    this.logger.debug(`Attempting to update metadata for active chat ${activeChat.metadata.id}:`, metadataUpdate);
    if (Object.keys(metadataUpdate).length === 0) {
      return false;
    }
    this.logger.debug(`Attempting to update metadata for active chat ${activeChat!.metadata.id}:`, metadataUpdate);
    const oldRolePath = activeChat.metadata.selectedRolePath;
    const oldModelName = activeChat.metadata.modelName;

    const changed = activeChat.updateMetadata(metadataUpdate);

    if (changed) {
        this.logger.debug(`Metadata updated in Chat object for ${activeChat!.metadata.id}. Save scheduled by Chat.updateMetadata.`);
      await this.saveChatAndUpdateIndex(activeChat);

      const newMeta = activeChat.metadata;
      let roleChanged = false;
      let modelChanged = false;
      if (metadataUpdate.selectedRolePath !== undefined && oldRolePath !== newMeta.selectedRolePath) {
        roleChanged = true;
      }
      if (metadataUpdate.modelName !== undefined && oldModelName !== newMeta.modelName) {
        modelChanged = true;
      }

      if (roleChanged) {
        try {
          const rolePathArg = newMeta.selectedRolePath ?? undefined;
          const newRoleName = await this.plugin.findRoleNameByPath(rolePathArg);

          this.plugin.emit("role-changed", newRoleName ?? "None");
          this.plugin.promptService?.clearRoleCache?.();
        } catch (e) {
          this.logger.error("Error finding role name or emitting role-changed:", e);
        }
      }
      if (modelChanged) {
        this.plugin.emit("model-changed", newMeta.modelName || "");
        this.plugin.promptService?.clearModelDetailsCache?.();
      }
      this.logger.error(`[ChatManager] >>> Emitting 'active-chat-changed' from updateActiveChatMetadata for ID: ${this.activeChatId}`);
      this.plugin.emit("active-chat-changed", { chatId: this.activeChatId, chat: activeChat });
      return true;
    } else {
      return false;
    }
  }

// src/ChatManager.ts

// ДОДАЙТЕ ЦЕЙ НОВИЙ ПРИВАТНИЙ МЕТОД:
/**
 * Допоміжний метод для видалення файлу чату та запису з індексу БЕЗ генерації подій.
 * @param id ID чату для видалення.
 * @param filePath Шлях до файлу чату (може бути null).
 * @param deleteFile Чи потрібно видаляти фізичний файл.
 * @returns true, якщо індекс chatIndex був змінений, false в іншому випадку.
 */
private async deleteChatFileAndIndexEntry_NoEmit(
  id: string,
  filePath: string | null,
  deleteFile: boolean = true
): Promise<boolean> { // Повертає true, якщо індекс змінено
  const safeFilePath = filePath ?? "unknown_path"; // Для логування
  let indexChanged = false;

  // Видалення з кешу завантажених чатів
  if (this.loadedChats[id]) {
      delete this.loadedChats[id];
      this.logger.debug(`[deleteHelper] Removed chat ${id} from loadedChats cache.`);
  }
  // Видалення з індексу
  if (this.chatIndex[id]) {
      delete this.chatIndex[id];
      indexChanged = true; // Помічаємо, що індекс змінився
      this.logger.debug(`[deleteHelper] Removed chat ${id} from chatIndex.`);
  } else {
      this.logger.debug(`[deleteHelper] Chat ${id} was not in chatIndex.`);
  }

  // Видалення файлу, якщо потрібно і можливо
  if (deleteFile && filePath && typeof filePath === "string" && filePath !== "/" && !filePath.endsWith("/")) {
      try {
          const fileExists = await this.adapter.exists(filePath);
          if (fileExists) {
              const stat = await this.adapter.stat(filePath);
              if (stat?.type === "file") {
                  await this.adapter.remove(filePath);
                  this.logger.debug(`[deleteHelper] Removed chat file: ${filePath}`);
              } else {
                   this.logger.error(`[deleteHelper] Attempted to remove a non-file path: ${filePath}`);
              }
          } else {
               this.logger.warn(`[deleteHelper] Chat file not found for removal: ${filePath}`);
          }
      } catch (e: any) {
          this.logger.error(`[deleteHelper] Error removing chat file ${filePath}:`, e);
          new Notice(`Error deleting file: ${filePath.split('/').pop()}`);
          // Не перериваємо процес через помилку видалення файлу, індекс важливіший
      }
  } else if (deleteFile && filePath) {
       // Логуємо, якщо шлях некоректний для видалення
       this.logger.warn(`[deleteHelper] Invalid file path provided for deletion: ${filePath}`);
  }

  // Зберігаємо індекс, ТІЛЬКИ якщо він змінився
  if (indexChanged) {
      await this.saveChatIndex();
      this.logger.debug(`[deleteHelper] Saved updated chatIndex after removing ${id}.`);
  }
  return indexChanged; // Повертаємо статус зміни індексу
}

  // src/ChatManager.ts

async deleteChat(id: string): Promise<boolean> {
  const chatExistedInIndex = !!this.chatIndex[id];
  const wasActive = id === this.activeChatId;
  this.logger.debug(`[deleteChat] Deleting chat ${id}. Was active: ${wasActive}. Existed in index: ${chatExistedInIndex}.`);

  let filePath: string | null = null;
  try {
      // Знаходимо шлях до файлу (найкраще через ієрархію)
      const hierarchy = await this.getChatHierarchy();
      filePath = this.findChatPathInHierarchy(id, hierarchy);
      if (!filePath && chatExistedInIndex) {
           this.logger.warn(`[deleteChat] File path for chat ${id} not found in hierarchy, but chat exists in index. Will only remove from index.`);
      }
  } catch (hierarchyError) {
      this.logger.error(`Error getting hierarchy during delete operation for ${id}:`, hierarchyError);
      // Продовжуємо без шляху, якщо чат є в індексі
  }

  // Якщо чату немає ні в індексі, ні шлях не знайдено (якщо він був потрібен)
  if (!filePath && !chatExistedInIndex) {
      this.logger.warn(`[deleteChat] Chat ${id} not found in index or hierarchy. Nothing to delete.`);
      return false; // Чату не існує
  }

  let success = true;
  // Змінна для події, яку потрібно згенерувати ПІСЛЯ всіх операцій
  let eventToEmit: { name: string; data: any } | null = null;

  try {
      // Викликаємо новий допоміжний метод, який НЕ генерує подій
      const indexWasChanged = await this.deleteChatFileAndIndexEntry_NoEmit(id, filePath, true);
      this.logger.debug(`[deleteChat] deleteChatFileAndIndexEntry_NoEmit finished. Index changed: ${indexWasChanged}`);

      // Визначаємо, яку подію генерувати (або жодної)
      if (wasActive) {
          this.logger.debug(`[deleteChat] Deleted chat was active. Finding and setting next active chat...`);
          // Визначаємо наступний активний чат
          const newHierarchy = await this.getChatHierarchy(); // Отримуємо оновлену ієрархію
          const firstChat = this.findFirstChatInHierarchy(newHierarchy);
          const nextActiveId = firstChat ? firstChat.metadata.id : null;
          this.logger.debug(`[deleteChat] Next active chat will be: ${nextActiveId}`);

          // Викликаємо setActiveChat. Він сам згенерує 'active-chat-changed'.
          // Ця подія має бути достатньою для оновлення UI (включаючи список).
          await this.setActiveChat(nextActiveId);
          // Немає потреби генерувати 'chat-list-updated' окремо тут.

      } else if (indexWasChanged) {
          // Якщо видалено НЕактивний чат, але індекс змінився,
          // нам ПОТРІБНА подія 'chat-list-updated', щоб список оновився.
          this.logger.debug(`[deleteChat] Non-active chat deleted and index changed. Setting 'chat-list-updated' to be emitted.`);
          eventToEmit = { name: "chat-list-updated", data: undefined };
      }

  } catch (error) {
      this.logger.error(`Error during deletion process for chat ${id}:`, error);
      new Notice(`Error deleting chat ${id}. Check console.`);
      success = false;
      // Спробуємо відновити консистентність індексу при помилці
      await this.rebuildIndexFromFiles();
      // Після перебудови індексу точно потрібне оновлення списку
      eventToEmit = { name: "chat-list-updated", data: undefined };
  } finally {
      // Генеруємо подію, якщо вона була запланована
      if (eventToEmit) {
           this.logger.debug(`[deleteChat] Emitting final event: ${eventToEmit.name}`);
           this.plugin.emit(eventToEmit.name, eventToEmit.data);
      } else if (wasActive) {
           this.logger.debug(`[deleteChat] No final event emitted from deleteChat itself (relied on setActiveChat).`);
      } else {
           this.logger.debug(`[deleteChat] No final event emitted (non-active deleted, index unchanged, or error without rebuild).`);
      }

      // Показуємо сповіщення, тільки якщо видалення було успішним і чат існував
      if (success && chatExistedInIndex) {
          new Notice(`Chat deleted.`);
          this.logger.info(`Chat ${id} deleted successfully.`);
      } else if (!chatExistedInIndex) {
           this.logger.info(`Chat ${id} deletion attempt - chat did not exist in index.`);
      }
  }
  // Повертаємо true, якщо чат існував і операція (принаймні оновлення індексу) пройшла успішно
  return success && chatExistedInIndex;
}

  async cloneChat(chatIdToClone: string): Promise<Chat | null> {
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

    const targetFolder = originalFilePath.substring(0, originalFilePath.lastIndexOf("/")) || "/";
    const finalFolderPath = targetFolder === "" || targetFolder === "." ? "/" : targetFolder;

    try {
      await this.ensureSpecificFolderExists(finalFolderPath);
    } catch (folderError) {
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
      // this.plugin.emit("chat-list-updated");

      const savedImmediately = await clonedChat.saveImmediately();
      if (!savedImmediately) {
        delete this.chatIndex[newId];
        await this.saveChatIndex();
        this.plugin.emit("chat-list-updated");
        this.logger.error(`Failed to save the cloned chat file for ${newId} at ${newFilePath}. Removed from index.`);
        new Notice("Error: Failed to save the cloned chat file.");
        return null;
      }

      this.loadedChats[newId] = clonedChat;
      await this.setActiveChat(newId);

      return clonedChat;
    } catch (error) {
      this.logger.error("Error cloning chat:", error);
      new Notice("An error occurred while cloning the chat.");
      return null;
    }
  }

  async deleteMessagesAfter(chatId: string, messageIndexToDeleteAfter: number): Promise<boolean> {
    const chat = await this.getChat(chatId);
    if (!chat) {
      this.logger.error(`Cannot delete messages: Chat ${chatId} not found.`);
      return false;
    }

    if (messageIndexToDeleteAfter >= chat.messages.length - 1) {
      return true;
    }
    if (messageIndexToDeleteAfter < -1) {
      return false;
    }

    const originalLength = chat.messages.length;
    const targetLength = messageIndexToDeleteAfter + 1;
    chat.messages.length = targetLength;

    chat.updateMetadata({});

    await this.saveChatAndUpdateIndex(chat);

    if (this.activeChatId === chatId) {
      this.activeChat = chat;

      this.plugin.emit("active-chat-changed", { chatId: chatId, chat: chat });
    }

    return true;
  }

  async deleteMessageByTimestamp(chatId: string, timestampToDelete: Date): Promise<boolean> {
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
      }
    }

    if (messageIndex === -1) {
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
        this.logger.error(
          `Invalid message index ${messageIndex} provided to _performDeleteMessageByIndex for chat ${chatId}.`
        );
        return false;
      }

      const deletedMessage = chat.messages.splice(messageIndex, 1)[0];

      chat.updateMetadata({});
      await this.saveChatAndUpdateIndex(chat);

      if (this.activeChatId === chatId) {
        this.activeChat = chat;

        this.plugin.emit("active-chat-changed", { chatId: chatId, chat: chat });
      }

      if (deletedMessage) {
        this.plugin.emit("message-deleted", { chatId: chatId, timestamp: deletedMessage.timestamp });
      }

      return true;
    } catch (error) {
      this.logger.error(`Error during message deletion by index ${messageIndex} for chat ${chatId}:`, error);
      new Notice("Error deleting message.");
      return false;
    }
  }

  async clearChatMessagesById(chatId: string): Promise<boolean> {
    const chat = await this.getChat(chatId);
    if (!chat) {
      this.logger.error(`Cannot clear messages: Chat ${chatId} not found.`);
      new Notice(`Error: Chat ${chatId} not found.`);
      return false;
    }

    if (chat.messages.length === 0) {
      return true;
    }

    try {
      chat.clearMessages();
      await this.saveChatAndUpdateIndex(chat);

      const isActive = chatId === this.activeChatId;
      if (isActive) {
        this.activeChat = chat;

        this.plugin.emit("messages-cleared", chatId);
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
      new Notice("Chat name cannot be empty.");
      return false;
    }
    if (/[\\/?:*"<>|]/.test(trimmedName)) {
      new Notice("Chat name contains invalid characters.");
      return false;
    }

    const chat = await this.getChat(chatId);

    if (!chat) {
      this.logger.error(`Cannot rename: Chat ${chatId} not found.`);
      new Notice("Chat not found.");
      return false;
    }

    if (chat.metadata.name === trimmedName) {
      return true;
    }

    try {
      const changed = chat.updateMetadata({ name: trimmedName });

      if (changed) {
        await this.saveChatAndUpdateIndex(chat);

        if (this.activeChatId === chatId) {
          this.activeChat = chat;
          this.plugin.emit("active-chat-changed", { chatId: chatId, chat: chat });
        }
        new Notice(`Chat renamed to "${trimmedName}".`);
        return true;
      } else {
        return false;
      }
    } catch (error) {
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
        new Notice(`"${normalizedPath.split("/").pop()}" already exists.`);
        return false;
      }

      await this.adapter.mkdir(normalizedPath);

      this.plugin.emit("chat-list-updated"); // Сповіщаємо UI про зміни
      return true;
    } catch (error: any) {
      if (error.code === "EPERM" || error.code === "EACCES") {
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

    // Перевірки
    if (!normOldPath || normOldPath === "/" || !normNewPath || normNewPath === "/") {
      this.logger.error("Invalid paths provided for rename operation.");
      new Notice("Cannot rename root folder or use empty path.");
      return false;
    }
    if (normOldPath === normNewPath) {
      return true; // Вважаємо успіхом, бо цільовий стан досягнуто
    }
    if (normNewPath.startsWith(normOldPath + "/")) {
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
      if (oldStat?.type !== "folder") {
        this.logger.error(`Source path is not a folder: ${normOldPath}`);
        new Notice("Item to rename is not a folder.");
        return false;
      }

      const newExists = await this.adapter.exists(normNewPath);
      if (newExists) {
        this.logger.error(`Target path for rename already exists: ${normNewPath}`);
        new Notice(`"${normNewPath.split("/").pop()}" already exists.`);
        return false;
      }

      // Виконуємо перейменування/переміщення
      await this.adapter.rename(normOldPath, normNewPath);

      // Оновлюємо шляхи в завантажених чатах (loadedChats), якщо вони були всередині
      Object.values(this.loadedChats).forEach(chat => {
        if (chat.filePath.startsWith(normOldPath + "/")) {
          const relativePath = chat.filePath.substring(normOldPath.length);
          const updatedPath = normalizePath(normNewPath + relativePath);

          chat.filePath = updatedPath; // Оновлюємо шлях у кешованому об'єкті
        }
      });

      this.plugin.emit("chat-list-updated"); // Сповіщаємо UI
      return true;
    } catch (error: any) {
      if (error.code === "EPERM" || error.code === "EACCES") {
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

    // Перевірка, чи шлях валідний і не є коренем сховища або основною папкою чатів
    if (!normalizedPath || normalizedPath === "/" || normalizedPath === ".") {
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
        // Вважаємо успіхом, якщо папки вже немає
        return true;
      }
      const stat = await this.adapter.stat(normalizedPath);
      if (stat?.type !== "folder") {
        this.logger.error(`Path to delete is not a folder: ${normalizedPath}`);
        new Notice("Item to delete is not a folder.");
        return false;
      }

      // --- Очищення індексу та кешу ПЕРЕД видаленням ---

      const chatIdsToDelete: string[] = [];
      // Функція для рекурсивного збору ID чатів
      const collectChatIds = async (currentPath: string) => {
        try {
          const list = await this.adapter.list(currentPath);
          for (const file of list.files) {
            const fileName = file.substring(file.lastIndexOf("/") + 1);
            if (fileName.endsWith(".json")) {
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
        } catch (listError) {
          this.logger.error(`Error listing folder ${currentPath} during pre-delete cleanup:`, listError);
        }
      };
      await collectChatIds(normalizedPath); // Збираємо ID

      let activeChatWasDeleted = false;
      chatIdsToDelete.forEach(id => {
        if (this.chatIndex[id]) {
          delete this.chatIndex[id];
        }
        if (this.loadedChats[id]) {
          delete this.loadedChats[id];
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
      }
      // --- Кінець очищення ---

      // Використовуємо рекурсивне видалення адаптера
      await this.adapter.rmdir(normalizedPath, true);

      // Сповіщаємо UI про зміни (оскільки індекс оновлено)
      this.plugin.emit("chat-list-updated");
      // Якщо активний чат скинуто, сповіщаємо про це
      if (activeChatWasDeleted) {
        this.plugin.emit("active-chat-changed", { chatId: null, chat: null });
        // Спробувати активувати наступний доступний чат (необов'язково тут, бо SidebarManager це робить)
      }

      return true;
    } catch (error: any) {
      if (error.code === "EPERM" || error.code === "EACCES") {
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

     // --- ВИПРАВЛЕНИЙ МЕТОД: Переміщення чату ---
    async moveChat(chatId: string, oldFilePath: string, newFolderPath: string): Promise<boolean> {
      const normOldPath = normalizePath(oldFilePath);
      const normNewFolderPath = normalizePath(newFolderPath);
      this.logger.info(`Attempting to move chat ${chatId} from "${normOldPath}" to folder "${normNewFolderPath}"`);

      // --- Оголошуємо newFilePath тут, поза try ---
      let newFilePath: string | null = null;
      // ----------------------------------------

      // 1. Валідація
      if (!chatId || !oldFilePath || !newFolderPath) {
          this.logger.error("Move chat failed: Invalid arguments provided.");
          new Notice("Move chat failed: Invalid data.");
          return false;
      }

      try {
          // Перевірка існування джерела
          if (!(await this.adapter.exists(normOldPath))) {
              this.logger.error(`Move chat failed: Source file does not exist: ${normOldPath}`);
              new Notice("Move chat failed: Source file not found.");
               await this.rebuildIndexFromFiles();
               this.plugin.emit('chat-list-updated');
              return false;
          }
           const oldStat = await this.adapter.stat(normOldPath);
           if(oldStat?.type !== 'file'){
                this.logger.error(`Move chat failed: Source path is not a file: ${normOldPath}`);
                new Notice("Move chat failed: Source is not a file.");
                return false;
           }

          // Перевірка існування цільової папки
          if (!(await this.adapter.exists(normNewFolderPath))) {
              this.logger.error(`Move chat failed: Target folder does not exist: ${normNewFolderPath}`);
              new Notice("Move chat failed: Target folder not found.");
              return false;
          }
           const newStat = await this.adapter.stat(normNewFolderPath);
           if(newStat?.type !== 'folder'){
                this.logger.error(`Move chat failed: Target path is not a folder: ${normNewFolderPath}`);
                new Notice("Move chat failed: Target is not a folder.");
                return false;
           }

          // 2. Визначення нового шляху
          const fileName = oldFilePath.substring(oldFilePath.lastIndexOf('/') + 1);
          // --- Присвоюємо значення оголошеній змінній ---
          newFilePath = normalizePath(`${normNewFolderPath}/${fileName}`);
          // ------------------------------------------

          // Перевірка, чи файл вже в цільовій папці
          if (normOldPath === newFilePath) {
              this.logger.warn(`Move chat skipped: Source and target paths are the same: ${normOldPath}`);
              return true;
          }

          // 3. Перевірка на конфлікт імен
          if (await this.adapter.exists(newFilePath)) {
              this.logger.error(`Move chat failed: File already exists at target path: ${newFilePath}`);
              new Notice(`Move chat failed: A file named "${fileName}" already exists in the target folder.`);
              return false;
          }

          // 4. Переміщення файлу
          this.logger.debug(`Executing adapter.rename from "${normOldPath}" to "${newFilePath}"`);
          await this.adapter.rename(normOldPath, newFilePath);
          this.logger.info(`Chat file moved successfully to ${newFilePath}`);

          // 5. Оновлення кешу завантажених чатів
          if (this.loadedChats[chatId] && newFilePath) { // Перевіряємо, що newFilePath не null
              this.logger.debug(`Updating file path in loadedChats cache for ${chatId} to ${newFilePath}`);
              this.loadedChats[chatId].filePath = newFilePath;
          }

          // 6. Оновлення UI (Індекс оновиться пізніше через Vault Event)
          this.plugin.emit('chat-list-updated');

          return true;

      } catch (error: any) {
           // --- Тепер newFilePath доступний тут (може бути null, якщо помилка сталася до присвоєння) ---
           const targetPathDesc = newFilePath ?? normNewFolderPath; // Використовуємо папку, якщо шлях файлу ще не визначено
           if (error.code === 'EPERM' || error.code === 'EACCES') {
               this.logger.error(`Permission error moving chat file from "${normOldPath}" towards "${targetPathDesc}":`, error);
               new Notice(`Permission error moving chat file.`);
           } else {
               // Використовуємо targetPathDesc в логуванні
               this.logger.error(`Error moving chat file from "${normOldPath}" towards "${targetPathDesc}":`, error);
               new Notice(`Failed to move chat: ${error.message || "Unknown error"}`);
           }
           // ---
           await this.rebuildIndexFromFiles();
           this.plugin.emit('chat-list-updated');
           return false;
      }
  }
  
  /**
   * Реєструє резолвер для події message-added.
   * Цей метод викликатиметься з OllamaView перед тим, як ChatManager додасть повідомлення.
   */
  public registerHMAResolver(timestampMs: number, resolve: () => void, reject: (reason?: any) => void): void {
    if (this.messageAddedResolvers.has(timestampMs)) {
      this.plugin.logger.warn(`[ChatManager] HMA Resolver for timestamp ${timestampMs} already exists. Overwriting.`);
    }
    this.messageAddedResolvers.set(timestampMs, { resolve, reject });
    this.plugin.logger.debug(`[ChatManager] HMA Resolver registered for timestamp ${timestampMs}. Map size: ${this.messageAddedResolvers.size}`);
  }

  /**
   * Викликає та видаляє резолвер для події message-added.
   * Цей метод викликатиметься з OllamaView.handleMessageAdded.
   */
  public invokeHMAResolver(timestampMs: number): void {
    const resolverPair = this.messageAddedResolvers.get(timestampMs);
    if (resolverPair) {
      this.plugin.logger.debug(`[ChatManager] Invoking HMA Resolver for timestamp ${timestampMs}.`);
      resolverPair.resolve();
      this.messageAddedResolvers.delete(timestampMs);
      this.plugin.logger.debug(`[ChatManager] HMA Resolver for timestamp ${timestampMs} invoked and deleted. Map size: ${this.messageAddedResolvers.size}`);
    } else {
      this.plugin.logger.warn(`[ChatManager] No HMA Resolver found to invoke for timestamp ${timestampMs}. Map size: ${this.messageAddedResolvers.size}`);
    }
  }
  
  public rejectAndClearHMAResolver(timestampMs: number, reason: string): void {
    const resolverPair = this.messageAddedResolvers.get(timestampMs);
    if (resolverPair) {
        this.plugin.logger.warn(`[ChatManager] Rejecting HMA Resolver for ts ${timestampMs} due to: ${reason}`);
        resolverPair.reject(new Error(reason));
        this.messageAddedResolvers.delete(timestampMs);
    }
  }


  /**
   * Додає повідомлення користувача до активного чату, зберігає його,
   * генерує подію "message-added" (для OllamaView.handleMessageAdded)
   * та повертає проміс, який вирішується, коли handleMessageAdded завершить рендеринг.
   * @param content Вміст повідомлення користувача.
   * @param timestamp Мітка часу повідомлення.
   * @param requestTimestampId Унікальний ID запиту для логування.
   * @returns Проміс, що вирішується після рендерингу, або null, якщо сталася помилка.
   */
  public async addUserMessageAndAwaitRender(
    content: string,
    timestamp: Date,
    requestTimestampId: number // Для узгодженого логування
  ): Promise<Message | null> {
    const activeChat = await this.getActiveChat(); // Припускаємо, що getActiveChat повертає Chat | null
    if (!activeChat) {
      this.plugin.logger.error(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] Cannot add message: No active chat.`);
      return null;
    }

    const messageTimestampMs = timestamp.getTime();
    const userMessage: Message = {
      role: "user" as MessageRoleTypeFromTypes, // Використовуємо імпортований тип
      content,
      timestamp,
    };

    this.plugin.logger.debug(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] Setting up HMA Promise for UserMessage (ts: ${messageTimestampMs}).`);
    
    const hmaPromise = new Promise<void>((resolve, reject) => {
      // Реєструємо резолвер в ChatManager, щоб OllamaView.handleMessageAdded міг його викликати
      this.registerHMAResolver(messageTimestampMs, resolve, reject);
      // Таймаут для HMA
      setTimeout(() => {
        if (this.messageAddedResolvers.has(messageTimestampMs)) { // Перевіряємо, чи резолвер ще там
            const reason = `HMA Timeout for UserMessage (ts: ${messageTimestampMs}) in ChatManager.`;
            this.plugin.logger.warn(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] ${reason}`);
            this.rejectAndClearHMAResolver(messageTimestampMs, reason);
        }
      }, 10000); // 10 секунд таймаут
    });

    // Додаємо повідомлення до масиву повідомлень чату та зберігаємо чат
    // addMessageToActiveChatPayload має дбати про збереження та емітування події "message-added"
    const addedMessage = await this.addMessageToActiveChatPayload(userMessage, true);
    if (!addedMessage) {
        this.plugin.logger.error(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] Failed to add user message payload for ts: ${messageTimestampMs}.`);
        this.rejectAndClearHMAResolver(messageTimestampMs, "Failed to add message payload to ChatManager.");
        return null;
    }
    
    this.plugin.logger.debug(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] UserMessage (ts: ${messageTimestampMs}) added to ChatManager. Waiting for HMA completion.`);
    
    try {
        await hmaPromise;
        this.plugin.logger.info(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] HMA completed for UserMessage (ts: ${messageTimestampMs}).`);
        return userMessage;
    } catch (error) {
        this.plugin.logger.error(`[ChatManager][addUserMessageAndWaitForRender id:${requestTimestampId}] Error or timeout waiting for HMA for UserMessage (ts: ${messageTimestampMs}):`, error);
        // Резолвер вже мав бути видалений rejectAndClearHMAResolver
        return null; // Або кинути помилку далі, якщо потрібно
    }
  }
  
} // End of ChatManager class
