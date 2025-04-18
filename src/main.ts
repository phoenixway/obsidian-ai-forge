// main.ts
import {
  Plugin,
  WorkspaceLeaf,
  Notice,
  normalizePath,
  TFile,
  TFolder,
  TAbstractFile,
  DataAdapter, // Потрібен для типів адаптера
  debounce, // Потрібен для debounce
  SuggestModal, // Потенційно для майбутньої реалізації
  FuzzySuggestModal // Потенційно для майбутньої реалізації
} from "obsidian";
// --- ВИПРАВЛЕНО: Імпортуємо правильну константу ---
import { OllamaView, VIEW_TYPE_OLLAMA_PERSONAS, Message, MessageRole } from "./OllamaView";
// -------------------------------------------------
import { OllamaSettingTab, DEFAULT_SETTINGS, OllamaPluginSettings } from "./settings";
import { RagService } from "./ragService";
import { OllamaService } from "./OllamaService"; // Перейменований ApiService
import { PromptService } from './PromptService';
import { ChatManager } from "./ChatManager"; // Новий клас
import { Chat, ChatMetadata } from "./Chat"; // Імпортуємо Chat та його типи
import { RoleInfo } from "./ChatManager"; // Або звідки ви його імпортували
import { exec, ExecException } from 'child_process';
import * as path from 'path';
import { TranslationService } from './TranslationService'; // <-- Import new service
import { PromptModal } from "./PromptModal";
import { ConfirmModal } from "./ConfirmModal";
import { Logger, LogLevel, LoggerSettings } from "./Logger"; // <-- Імпортуємо логер

// --- КОНСТАНТИ ДЛЯ ЗБЕРЕЖЕННЯ ---
const SESSIONS_INDEX_KEY = 'chatSessionsIndex_v1';
const ACTIVE_SESSION_ID_KEY = 'activeChatSessionId_v1';
// ----------------------------------

// Інтерфейси
// Визначаємо інтерфейси тут або імпортуємо з types.ts
interface RAGDocument { id: string; content: string; metadata: { source: string; path: string; }; }
interface Embedding { documentId: string; vector: number[]; }
// RoleInfo вже імпортовано

// Використовуємо той самий клас, що й у вашому коді
export default class OllamaPlugin extends Plugin {
  settings: OllamaPluginSettings;
  settingTab: OllamaSettingTab;
  view: OllamaView | null = null;

  // Сервіси та Менеджер
  ragService!: RagService;
  ollamaService!: OllamaService;
  promptService!: PromptService;
  chatManager!: ChatManager;
  translationService!: TranslationService;
  logger!: Logger; 

  // Події та кеш
  private eventHandlers: Record<string, Array<(data: any) => any>> = {};
  private roleListCache: RoleInfo[] | null = null;
  private roleCacheClearTimeout: NodeJS.Timeout | null = null;
  private indexUpdateTimeout: NodeJS.Timeout | null = null;

  // --- Логіка файлу завдань ---
  private dailyTaskFilePath: string | null = null;
  private taskFileContentCache: string | null = null;
  private taskFileNeedsUpdate: boolean = false; // Прапорець про оновлення

  // --- RAG data (приклад) ---
  // Можливо, ці дані мають зберігатися в RagService?
  documents: RAGDocument[] = [];
  embeddings: Embedding[] = [];
  // ------------------------

  // --- Event Emitter Methods ---
  on(event: string, callback: (data: any) => any): () => void { if (!this.eventHandlers[event]) this.eventHandlers[event] = []; this.eventHandlers[event].push(callback); return () => { this.eventHandlers[event] = this.eventHandlers[event]?.filter(h => h !== callback); if (this.eventHandlers[event]?.length === 0) { delete this.eventHandlers[event]; } }; }
  emit(event: string, data?: any): void { const h = this.eventHandlers[event]; if (h) h.slice().forEach(handler => { try { handler(data); } catch (e) { console.error(`[OllamaPlugin] Error in event handler for ${event}:`, e); } }); }

  // --- Гетер для прапорця оновлення файлу завдань ---
  public isTaskFileUpdated(): boolean {
    return this.taskFileNeedsUpdate;
  }

  async onload() {
    console.log("Loading Ollama Personas Plugin..."); // Оновлено назву

    await this.loadSettings();

    const isProduction = process.env.NODE_ENV === 'production';
    const initialConsoleLogLevel = isProduction
                                   ? (this.settings.consoleLogLevel || 'INFO') // Беремо з налаштувань або INFO
                                   : 'DEBUG'; // Завжди DEBUG для розробки

    // Передаємо початкові налаштування логеру
    const loggerSettings: LoggerSettings = {
        consoleLogLevel: initialConsoleLogLevel as keyof typeof LogLevel,
        fileLoggingEnabled: this.settings.fileLoggingEnabled,
        fileLogLevel: this.settings.fileLogLevel,
        logCallerInfo: this.settings.logCallerInfo,
        // Можна додати logFilePath, logFileMaxSizeMB, якщо вони є в OllamaPluginSettings
    };
    this.logger = new Logger(this, loggerSettings);

    // Ініціалізація сервісів
    this.ollamaService = new OllamaService(this);
    this.translationService = new TranslationService(this);
    this.promptService = new PromptService(this);
    this.ragService = new RagService(this);
    this.chatManager = new ChatManager(this);

    await this.chatManager.initialize();

    // --- Реєстрація View ---
    this.registerView(
      VIEW_TYPE_OLLAMA_PERSONAS,
      (leaf) => {
        console.log("OllamaPersonasPlugin: Registering view.");
        this.view = new OllamaView(leaf, this);
        return this.view;
      }
    );
    // ----------------------

    // Обробник помилок з'єднання
    this.ollamaService.on('connection-error', (error) => { console.error("[OllamaPlugin] Connection error event:", error); this.emit('ollama-connection-error', error.message); if (!this.view) { new Notice(`Failed to connect to Ollama: ${error.message}`); } });

    // --- Реєстрація обробників подій плагіна ---
    this.register(this.on('ollama-connection-error', (message) => { this.view?.addMessageToDisplay?.('error', message, new Date()); }));
    this.register(this.on('active-chat-changed', this.handleActiveChatChangedLocally.bind(this)));
    this.register(this.on('chat-list-updated', () => { console.log("[OllamaPlugin] Event 'chat-list-updated' received."); }));

    this.register(this.on('settings-updated', () => {
      this.logger.info("[Plugin] Event 'settings-updated' received."); // Використовуємо логер
      this.logger.updateSettings(this.settings); // Передаємо весь об'єкт налаштувань

      this.updateDailyTaskFilePath();
      this.loadAndProcessInitialTasks();
      this.updateOllamaServiceConfig();
      this.roleListCache = null;
      this.promptService?.clearRoleCache();
      this.emit('roles-updated');
    }));

    // --- Ribbon & Commands ---
    this.addRibbonIcon("brain-circuit", "Open AI Forge Chat", () => { this.activateView(); });
    this.addCommand({ id: "open-chat-view", name: "Open AI Forge Chat", callback: () => { this.activateView(); }, });
    this.addCommand({ id: "index-rag-documents", name: "AI Forge: Index documents for RAG", callback: async () => { await this.ragService.indexDocuments(); }, });
    this.addCommand({ id: "clear-active-chat-history", name: "AI Forge: Clear Active Chat History", callback: async () => { await this.clearMessageHistory(); }, }); // Викликаємо локальний метод
    this.addCommand({ id: "refresh-roles", name: "AI Forge: Refresh Roles List", callback: async () => { await this.listRoleFiles(true); this.emit('roles-updated'); new Notice("Role list refreshed."); } });
    this.addCommand({ id: "new-chat", name: "AI Forge: New Chat", callback: async () => { const newChat = await this.chatManager.createNewChat(); if (newChat) { /* await this.activateView(); - Не потрібно, setActiveChat активує */ new Notice(`Created new chat: ${newChat.metadata.name}`); } } });
    this.addCommand({ id: "switch-chat", name: "AI Forge: Switch Chat", callback: async () => { await this.showChatSwitcher(); } });
    this.addCommand({ id: "rename-active-chat", name: "AI Forge: Rename Active Chat", callback: async () => { await this.renameActiveChat(); } });
    this.addCommand({ id: "delete-active-chat", name: "AI Forge: Delete Active Chat", callback: async () => { await this.deleteActiveChatWithConfirmation(); } });
    // --------------------------

    // Settings Tab
    this.settingTab = new OllamaSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    // Layout Ready: Індексація RAG при старті
    this.app.workspace.onLayoutReady(async () => { if (this.settings.ragEnabled) { setTimeout(() => { this.ragService?.indexDocuments(); }, 5000); } });

    // --- File Watcher Setup ---
    // Спостерігач за змінами ролей
    const debouncedRoleClear = debounce(() => {
      console.log("[OllamaPlugin] Role change detected, clearing cache & emitting.");
      this.roleListCache = null;
      this.promptService?.clearRoleCache?.(); // Очищуємо кеш промпт сервісу
      this.emit('roles-updated');
    }, 1500, true);

    // --- ВИПРАВЛЕНО: Тип параметра 'file' на TAbstractFile | null ---
    const fileChangeHandler = (file: TAbstractFile | null) => {
      if (!file) return;
      // handleRoleOrRagFileChange використовує file.path, який є в TAbstractFile
      this.handleRoleOrRagFileChange(file.path, debouncedRoleClear);
    };
    // -----------------------------------------------------------

    // 'modify' надає TFile, тому тут все добре
    const handleModify = (file: TFile) => {
      // console.log("Modify event:", file.path); // Debug log
      fileChangeHandler(file); // Передаємо TFile, він сумісний з TAbstractFile
      this.handleTaskFileModify(file); // Окремий обробник для файлу завдань
    };

    // 'delete', 'rename', 'create' надають TAbstractFile
    const handleDelete = (file: TAbstractFile) => { // file має тип TAbstractFile
      console.log("Delete event:", file.path); // Debug log
      fileChangeHandler(file); // Передаємо TAbstractFile - тепер це коректно
      if (file.path === this.dailyTaskFilePath) {
        console.log(`[Plugin] Task file ${this.dailyTaskFilePath} deleted.`);
        this.dailyTaskFilePath = null;
        this.taskFileContentCache = null;
        this.taskFileNeedsUpdate = false; // Скидаємо прапорець
        this.chatManager?.updateTaskState(null); // Повідомляємо менеджеру
      }
    };
    const handleRename = (file: TAbstractFile, oldPath: string) => { // file має тип TAbstractFile
      console.log("Rename event:", oldPath, "->", file.path); // Debug log
      fileChangeHandler(file); // Перевіряємо новий шлях - тепер коректно
      this.handleRoleOrRagFileChange(oldPath, debouncedRoleClear); // Перевіряємо старий шлях для ролей/RAG
      if (oldPath === this.dailyTaskFilePath) {
        console.log(`[Plugin] Task file potentially renamed from ${oldPath} to ${file.path}`);
        this.updateDailyTaskFilePath(); // Оновлюємо шлях на основі налаштувань
        this.loadAndProcessInitialTasks(); // Перезавантажуємо завдання з новим шляхом (якщо він збігається з налаштуваннями)
      } else if (file.path === this.dailyTaskFilePath) {
        // Якщо якийсь файл перейменували *в* наш файл завдань
        console.log(`[Plugin] A file was renamed to become the task file: ${file.path}`);
        this.taskFileNeedsUpdate = true;
        this.checkAndProcessTaskUpdate(); // Одразу обробляємо
      }
    };
    const handleCreate = (file: TAbstractFile) => { // file має тип TAbstractFile
      console.log("Create event:", file.path); // Debug log
      fileChangeHandler(file); // Передаємо TAbstractFile - тепер коректно
      if (file.path === this.dailyTaskFilePath) {
        console.log(`[Plugin] Task file ${this.dailyTaskFilePath} created.`);
        this.taskFileNeedsUpdate = true;
        this.checkAndProcessTaskUpdate();
      }
    };

    // Реєструємо слухачів
    this.registerEvent(this.app.vault.on("modify", handleModify));
    this.registerEvent(this.app.vault.on("delete", handleDelete));
    this.registerEvent(this.app.vault.on("rename", handleRename));
    this.registerEvent(this.app.vault.on("create", handleCreate));
    // ------------------------

    // Завантаження початкових завдань (перенесено вище, після ініціалізації chatManager)
    this.updateDailyTaskFilePath();
    await this.loadAndProcessInitialTasks();
  }

  // --- Логіка файлу завдань (залишається в main.ts) ---
  updateDailyTaskFilePath(): void {
    const folderPath = this.settings.ragFolderPath?.trim();
    const fileName = this.settings.dailyTaskFileName?.trim();
    const newPath = (folderPath && fileName) ? normalizePath(`${folderPath}/${fileName}`) : null;
    if (newPath !== this.dailyTaskFilePath) {
      console.log(`[Plugin] Daily task file path changed to: ${newPath}`);
      this.dailyTaskFilePath = newPath;
      this.taskFileContentCache = null; // Скидаємо кеш при зміні шляху
      this.taskFileNeedsUpdate = true; // Потрібно перечитати
    } else if (!newPath) {
      this.dailyTaskFilePath = null;
      console.log(`[Plugin] Daily task file path is not configured.`);
    }
  }
  handleTaskFileModify = (file: TFile): void => {
    if (this.settings.enableProductivityFeatures && file.path === this.dailyTaskFilePath) {
      console.log(`[Plugin] Detected modification in task file: ${file.path}`);
      this.taskFileNeedsUpdate = true;
    }
  }
  async loadAndProcessInitialTasks(): Promise<void> {
    if (!this.settings.enableProductivityFeatures) {
      this.taskFileContentCache = null; this.chatManager?.updateTaskState(null); this.taskFileNeedsUpdate = false;
      return;
    }
    if (!this.dailyTaskFilePath) { this.taskFileContentCache = null; this.chatManager?.updateTaskState(null); this.taskFileNeedsUpdate = false; return; } // Скидаємо прапорець, якщо шляху немає

    try {
      if (await this.app.vault.adapter.exists(this.dailyTaskFilePath)) {
        const content = await this.app.vault.adapter.read(this.dailyTaskFilePath);
        if (content !== this.taskFileContentCache) {
          console.log(`[Plugin] Loading and processing tasks from ${this.dailyTaskFilePath}`);
          this.taskFileContentCache = content;
          const tasks = this.parseTasks(content);
          this.chatManager?.updateTaskState(tasks);
          this.taskFileNeedsUpdate = false; // Скидаємо прапорець ПІСЛЯ успішної обробки
        } else {
          this.taskFileNeedsUpdate = false; // Якщо контент не змінився, прапорець теж скидаємо
          // console.log(`[Plugin] Task file content unchanged.`);
        }
      } else {
        console.log(`[Plugin] Task file ${this.dailyTaskFilePath} not found.`);
        this.taskFileContentCache = null; this.chatManager?.updateTaskState(null); this.taskFileNeedsUpdate = false;
      }
    } catch (error) {
      console.error(`[Plugin] Error loading/processing task file ${this.dailyTaskFilePath}:`, error);
      this.taskFileContentCache = null; this.chatManager?.updateTaskState(null); this.taskFileNeedsUpdate = false;
    }
  }
  parseTasks(content: string): { urgent: string[], regular: string[], hasContent: boolean } {
    // ... (код парсингу без змін) ...
    const lines = content.split('\n'); const urgent: string[] = []; const regular: string[] = []; let hasContent = false;
    for (const line of lines) {
      const trimmedLine = line.trim(); if (!trimmedLine) continue; hasContent = true;
      if (trimmedLine.startsWith('!') || trimmedLine.toLowerCase().includes('[urgent]')) { urgent.push(trimmedLine.replace(/^!/, '').replace(/\[urgent\]/i, '').trim()); }
      else if (trimmedLine.startsWith('- [ ]') || trimmedLine.startsWith('- [x]')) { regular.push(trimmedLine.substring(trimmedLine.indexOf(']') + 1).trim()); }
      else { regular.push(trimmedLine); }
    }
    return { urgent, regular, hasContent };
  }
  async checkAndProcessTaskUpdate(): Promise<void> {
    if (this.taskFileNeedsUpdate) {
      console.log("[Plugin] checkAndProcessTaskUpdate: taskFileNeedsUpdate is true, reloading...");
      await this.loadAndProcessInitialTasks();
    }
  }
  // --- Кінець логіки файлу завдань ---

  // Обробник змін для ролей та RAG
  private handleRoleOrRagFileChange(changedPath: string, debouncedRoleClear: () => void) {
    const normPath = normalizePath(changedPath);

    // Перевірка для ролей
    const userRolesPath = this.settings.userRolesFolderPath ? normalizePath(this.settings.userRolesFolderPath) : null;
    const defaultRolesPath = normalizePath(this.manifest.dir + '/roles'); // Вбудовані ролі (якщо є)
    if (normPath.toLowerCase().endsWith('.md')) {
      if ((userRolesPath && normPath.startsWith(userRolesPath + '/')) || normPath.startsWith(defaultRolesPath + '/')) {
        console.log(`[Plugin] Role file change detected: ${normPath}`);
        debouncedRoleClear(); // Очищуємо кеш ролей з дебаунсом
      }
    }

    // Перевірка для RAG
    const ragFolderPath = this.settings.ragFolderPath ? normalizePath(this.settings.ragFolderPath) : null;
    if (this.settings.ragEnabled && ragFolderPath && normPath.startsWith(ragFolderPath + '/')) {
      console.log(`[Plugin] RAG file change detected: ${normPath}`);
      this.debounceIndexUpdate(); // Запускаємо індексацію RAG з дебаунсом
    }
  }


  async onunload() {
    console.log("Unloading Ollama Personas Plugin...");

    // --- ВИПРАВЛЕНО: Використання нового ID ---
    this.app.workspace.getLeavesOfType(VIEW_TYPE_OLLAMA_PERSONAS).forEach(l => l.detach());
    // ------------------------------------

    if (this.indexUpdateTimeout) clearTimeout(this.indexUpdateTimeout);
    if (this.roleCacheClearTimeout) clearTimeout(this.roleCacheClearTimeout);

    // --- Збереження ID активного чату ---
    try {
      if (this.chatManager && this.settings.saveMessageHistory) {
        const lastActiveId = this.chatManager.getActiveChatId();
        if (lastActiveId !== undefined && lastActiveId !== null) { // Перевірка на null та undefined
          console.log(`[OllamaPlugin] Saving activeChatId (${lastActiveId}) on unload.`);
          await this.saveDataKey(ACTIVE_SESSION_ID_KEY, lastActiveId); // Додано await
        } else {
          console.log(`[OllamaPlugin] No active chat ID found to save on unload.`);
          await this.saveDataKey(ACTIVE_SESSION_ID_KEY, null); // Додано await
        }
      }
    } catch (error) {
      console.error("[OllamaPlugin] Error saving active chat ID on unload:", error);
    }
    // ----------------------------------

    this.promptService?.clearModelDetailsCache?.();
    this.promptService?.clearRoleCache?.();
    this.roleListCache = null;
    console.log("Ollama Personas Plugin unloaded.");
  }


  updateOllamaServiceConfig() {
    if (this.ollamaService) {
      console.log("[OllamaPlugin] Settings changed, potentially updating Ollama service config and clearing model cache.");
      // Можна передати нові налаштування в ollamaService, якщо потрібно (наприклад, URL)
      this.promptService?.clearModelDetailsCache(); // Очищаємо кеш моделей
    }
  }

  private debounceIndexUpdate() {
    if (this.indexUpdateTimeout) clearTimeout(this.indexUpdateTimeout);
    this.indexUpdateTimeout = setTimeout(async () => { // Зробимо async
      console.log("[OllamaPlugin] Debounced RAG index update starting...");
      if (this.settings.ragEnabled && this.ragService) { // Перевірка перед викликом
        await this.ragService.indexDocuments();
      }
      this.indexUpdateTimeout = null;
    }, 30000); // 30 секунд
  }

  async activateView() {
    const { workspace: e } = this.app;
    let l: WorkspaceLeaf | null = null;

    // --- ВИПРАВЛЕНО: Використання нового ID ---
    const s = e.getLeavesOfType(VIEW_TYPE_OLLAMA_PERSONAS);
    // ------------------------------------

    if (s.length > 0) {
      l = s[0];
    } else {
      l = e.getRightLeaf(false) ?? e.getLeaf(true);
      if (l) {
        // --- ВИПРАВЛЕНО: Використання нового ID ---
        await l.setViewState({ type: VIEW_TYPE_OLLAMA_PERSONAS, active: true });
        // ------------------------------------
      }
    }

    if (l) {
      e.revealLeaf(l);
      const v = l.view;
      if (v instanceof OllamaView) {
        this.view = v;
        console.log("Ollama Personas View activated/revealed.");
      } else {
        console.error("Activated view is not an instance of OllamaView?");
      }
    } else {
      console.error("Failed to create or find leaf for Ollama Personas View.");
    }
  }


  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // --- Логіка міграції старих налаштувань (якщо потрібно) ---
    // if ((this.settings as any).customRoleFilePath !== undefined && this.settings.selectedRolePath === undefined) {
    //     console.log("[Ollama] Migrating 'customRoleFilePath'->'selectedRolePath'.");
    //     this.settings.selectedRolePath = (this.settings as any).customRoleFilePath || "";
    // }
    // delete (this.settings as any).customRoleFilePath;
    // delete (this.settings as any).useDefaultRoleDefinition;
    // ------------------------------------------------------
  }

  async saveSettings() {
    // Видаляємо застарілі поля перед збереженням, якщо вони ще існують
    // delete (this.settings as any).customRoleFilePath;
    // delete (this.settings as any).useDefaultRoleDefinition;

    await this.saveData(this.settings);
    // Не викликаємо updateOllamaServiceConfig тут, бо він викликається через подію 'settings-updated'
    console.log("OllamaPlugin: Settings saved.");
    this.emit('settings-updated'); // Повідомляємо інші частини плагіна про зміну налаштувань
  }

  // Data Helpers
  async saveDataKey(key: string, value: any): Promise<void> { const d = await this.loadData() || {}; d[key] = value; await this.saveData(d); }
  async loadDataKey(key: string): Promise<any> { const d = await this.loadData() || {}; return d[key]; }

  // History Persistence (Delegated)
  async clearMessageHistory() {
    console.log("[OllamaPlugin] Clearing active chat via ChatManager.");
    if (this.chatManager) {
      // Можливо, тут теж варто додати підтвердження?
      // Або залишити це на рівні View/Command
      await this.chatManager.clearActiveChatMessages();
    } else {
      console.error("ChatManager not ready when clearMessageHistory called.");
      new Notice("Error: Chat Manager not ready.");
    }
  }

  // List Role Files Method
  /**
     * Отримує список доступних ролей, включаючи вбудовану роль "Productivity Assistant".
     * @param forceRefresh Якщо true, кеш буде проігноровано і список буде зчитано з файлів.
     * @returns Масив об'єктів RoleInfo.
     */
  async listRoleFiles(forceRefresh: boolean = false): Promise<RoleInfo[]> {
    if (this.roleListCache && !forceRefresh) {
      return this.roleListCache;
    }
    console.log("[OllamaPlugin] Fetching roles (including built-in)...");

    const roles: RoleInfo[] = [];
    const addedNamesLowerCase = new Set<string>(); // Для уникнення дублікатів імен
    const adapter = this.app.vault.adapter;
    const pluginDir = this.manifest.dir; // Шлях до папки плагіна відносно .obsidian/plugins/

    // --- 1. Додаємо Вбудовану Роль "Productivity Assistant" ---
    const builtInRoleName = "Productivity Assistant";
    const builtInRoleFileName = "Productivity_Assistant.md"; // Назва файлу (можна зробити константою)
    // Шлях до файлу відносно кореня сховища
    const builtInRolePath = normalizePath(`${pluginDir}/roles/${builtInRoleFileName}`);
    this.logger.debug(`[OllamaPlugin] Checking for built-in role at: ${builtInRolePath}`);

    try {
      // Перевіряємо існування файлу через адаптер
      if (await adapter.exists(builtInRolePath)) {
        // Додатково перевіряємо, чи це файл (stat може бути повільним)
        const stat = await adapter.stat(builtInRolePath);
        if (stat?.type === 'file') {
          this.logger.debug(`[OllamaPlugin] Found built-in role: ${builtInRoleName}`);
          // Додаємо першою або просто до загального списку
          roles.push({
            name: builtInRoleName,
            path: builtInRolePath, // Зберігаємо шлях відносно кореня сховища
            isCustom: false, // Позначаємо як не користувацьку
            // isBuiltIn: true // Можна додати окремий прапорець
          });
          addedNamesLowerCase.add(builtInRoleName.toLowerCase());
        } else {
          this.logger.warn(`[OllamaPlugin] Built-in role path exists but is not a file: ${builtInRolePath}`);
        }
      } else {
        this.logger.warn(`[OllamaPlugin] Built-in role file NOT FOUND at: ${builtInRolePath}. Productivity features might rely on it.`);
        // Можливо, варто показати Notice, якщо ця роль критична
        // new Notice("Built-in 'Productivity Assistant' role file is missing!");
      }
    } catch (error) {
      this.logger.error(`[OllamaPlugin] Error checking/adding built-in role at ${builtInRolePath}:`, error);
    }
    // --- Кінець Вбудованої Ролі ---


    // --- 2. Додаємо Користувацькі Ролі (з папки налаштувань) ---
    const userRolesFolderPath = this.settings.userRolesFolderPath ? normalizePath(this.settings.userRolesFolderPath) : null;
    if (userRolesFolderPath) {
      this.logger.info(`[OllamaPlugin] Processing user roles from: ${userRolesFolderPath}`);
      try {
        if (await adapter.exists(userRolesFolderPath) && (await adapter.stat(userRolesFolderPath))?.type === 'folder') {
          const listResult = await adapter.list(userRolesFolderPath);
          for (const filePath of listResult.files) {
            // Обробляємо лише .md файли безпосередньо в цій папці
            if (filePath.toLowerCase().endsWith('.md') &&
              (userRolesFolderPath === '/' || filePath.split('/').length === userRolesFolderPath.split('/').length + 1) &&
              filePath !== builtInRolePath) { // Не додаємо вбудовану роль ще раз, якщо папки співпали

              const fileName = path.basename(filePath); // Використовуємо path для надійності
              const roleName = fileName.substring(0, fileName.length - 3);

              // Додаємо, тільки якщо ім'я унікальне (регістронезалежно)
              if (!addedNamesLowerCase.has(roleName.toLowerCase())) {
                this.logger.info(`[OllamaPlugin] Adding user role: ${roleName}`);
                roles.push({ name: roleName, path: filePath, isCustom: true });
                addedNamesLowerCase.add(roleName.toLowerCase());
              } else {
                this.logger.warn(`[OllamaPlugin] Skipping user role "${roleName}" from "${userRolesFolderPath}" due to name conflict.`);
              }
            }
          }
        } else if (userRolesFolderPath !== "/") { // Не виводимо попередження для кореневої папки
          this.logger.warn(`[OllamaPlugin] User roles path not found or not a folder: ${userRolesFolderPath}`);
          // Можливо, варто повідомити користувача через Notice?
        }
      } catch (e) {
        this.logger.error(`Error listing user roles in ${userRolesFolderPath}:`, e);
      }
    }
    // --- Кінець Користувацьких Ролей ---


    // --- 3. Додаємо Інші Стандартні Ролі (Якщо є папка roles/ крім файлу Productivity_Assistant) ---
    // const defaultRolesPath = normalizePath(pluginDir + '/roles');
    // // ... (схожа логіка обробки папки, як для userRolesPath, перевіряючи addedNamesLowerCase) ...
    // --- Кінець Інших Стандартних Ролей ---


    // --- 4. Сортування та Кешування ---
    roles.sort((a, b) => {
      // Можна зробити, щоб вбудована роль була завжди першою
      // if (a.name === builtInRoleName) return -1;
      // if (b.name === builtInRoleName) return 1;
      return a.name.localeCompare(b.name); // Або просто сортуємо за алфавітом
    });
    this.roleListCache = roles;
    this.logger.debug(`[OllamaPlugin] Found total ${roles.length} roles (including built-in if present).`);
    return roles;
  }

  // Execute System Command Method
  async executeSystemCommand(command: string): Promise<{ stdout: string; stderr: string; error: ExecException | null }> {
    console.log(`Executing: ${command}`); if (!command?.trim()) { return { stdout: "", stderr: "Empty cmd.", error: new Error("Empty cmd") as ExecException }; }
    //@ts-ignore process is available in Obsidian desktop
    if (typeof process === 'undefined' || !process?.versions?.node) { console.error("Node.js environment not available. Cannot execute system command."); new Notice("Cannot execute system command."); return { stdout: "", stderr: "Node.js required.", error: new Error("Node.js required") as ExecException }; }
    return new Promise(resolve => {
      exec(command, (error, stdout, stderr) => {
        if (error) console.error(`Exec error for "${command}": ${error}`);
        if (stderr) console.error(`Exec stderr for "${command}": ${stderr}`);
        if (stdout) console.log(`Exec stdout for "${command}": ${stdout}`);
        resolve({ stdout: stdout.toString(), stderr: stderr.toString(), error: error });
      });
    });
  }

  // --- Session Management Command Helpers ---
  // Ці методи зараз не використовуються View, але можуть бути корисними для команд
  async showChatSwitcher() { /* TODO: Implement UI */ new Notice("Switch Chat UI not implemented yet."); }
  async renameActiveChat() {
    const activeChat = await this.chatManager?.getActiveChat();
    if (!activeChat) { new Notice("No active chat."); return; }
    const currentName = activeChat.metadata.name;
    // Використовуємо PromptModal замість prompt
    new PromptModal(this.app, 'Rename Chat', `Enter new name for "${currentName}":`, currentName,
      async (newName) => {
        if (newName && newName.trim() !== "" && newName.trim() !== currentName) {
          await this.chatManager.renameChat(activeChat.metadata.id, newName.trim());
          // Повідомлення про успіх покаже сам renameChat або подія
        } else if (newName !== null) {
          new Notice("Rename cancelled or name unchanged.");
        }
      }
    ).open();
  }
  async deleteActiveChatWithConfirmation() {
    const activeChat = await this.chatManager?.getActiveChat();
    if (!activeChat) { new Notice("No active chat."); return; }
    const chatName = activeChat.metadata.name;
    // Використовуємо ConfirmModal замість confirm
    new ConfirmModal(this.app, 'Delete Chat', `Delete chat "${chatName}"? This cannot be undone.`,
      async () => {
        await this.chatManager.deleteChat(activeChat.metadata.id);
        // Повідомлення про успіх покаже сам deleteChat або подія
      }
    ).open();
  }

  // Обробник зміни активного чату (локальний)
  private async handleActiveChatChangedLocally(data: { chatId: string | null, chat: Chat | null }) {
    // Можна використовувати для логування або специфічних дій в main.ts, якщо потрібно
    console.log(`[OllamaPlugin] Handled 'active-chat-changed' locally. New active ID: ${data.chatId}. View will update itself.`);
    // Немає потреби оновлювати налаштування чи промпт тут, це робиться в ChatManager.setActiveChat
  }

  // Допоміжний метод для пошуку імені ролі за шляхом
  findRoleNameByPath(rolePath: string): string {
    if (!rolePath) return "Default Assistant"; // Назва для випадку без ролі
    // Спочатку шукаємо в кеші
    const cachedRole = this.roleListCache?.find(rl => rl.path === rolePath);
    if (cachedRole) return cachedRole.name;
    // Якщо в кеші немає (мало б бути після listRoleFiles), спробуємо отримати з імені файлу
    try {
      return path.basename(rolePath, '.md');
    } catch (e) {
      console.warn(`[OllamaPlugin] Could not determine role name for path: ${rolePath}`, e);
      return "Unknown Role"; // Запасний варіант
    }
  }

} // END OF OllamaPlugin CLASS