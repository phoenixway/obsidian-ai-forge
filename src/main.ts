// src/main.ts
import {
  Plugin,
  WorkspaceLeaf,
  Notice,
  normalizePath,
  TFile,
  TFolder,
  TAbstractFile,
  DataAdapter,
  debounce,
  SuggestModal,
  FuzzySuggestModal,
  EventRef, // Імпортуємо EventRef
} from "obsidian";
import { OllamaView, VIEW_TYPE_OLLAMA_PERSONAS, MessageRole } from "./OllamaView";
import { OllamaSettingTab, DEFAULT_SETTINGS, OllamaPluginSettings } from "./settings";
import { RagService } from "./ragService";
import { OllamaService } from "./OllamaService";
import { PromptService } from "./PromptService";
import { ChatManager } from "./ChatManager";
import { Chat, ChatMetadata } from "./Chat";
import { RoleInfo } from "./ChatManager";
import { exec, ExecException } from "child_process";
import { TranslationService } from "./TranslationService";
import { PromptModal } from "./PromptModal";
import { ConfirmModal } from "./ConfirmModal";
import { Logger, LogLevel, LoggerSettings } from "./Logger";
import { AgentManager } from "./agents/AgentManager"; // Адаптуйте шлях
import { SimpleFileAgent } from "./examples/SimpleFileAgent";

// --- КОНСТАНТИ ДЛЯ ЗБЕРЕЖЕННЯ ---
export const SESSIONS_INDEX_KEY = "chatIndex_v2"; // Використовуємо v2
export const ACTIVE_CHAT_ID_KEY = "activeChatId_v2"; // Використовуємо v2
export const CHAT_INDEX_KEY = "chatIndex_v2"; // Синонім для ясності
// ----------------------------------

interface RAGDocument {
  id: string;
  content: string;
  metadata: { source: string; path: string };
}
interface Embedding {
  documentId: string;
  vector: number[];
}

export default class OllamaPlugin extends Plugin {
  settings: OllamaPluginSettings;
  settingTab: OllamaSettingTab;
  view: OllamaView | null = null;

  ragService!: RagService;
  agentManager!: AgentManager; 
  ollamaService!: OllamaService;
  promptService!: PromptService;
  chatManager!: ChatManager;
  translationService!: TranslationService;
  logger!: Logger;

  private eventHandlers: Record<string, Array<(data: any) => any>> = {};
  private roleListCache: RoleInfo[] | null = null;
  private roleCacheClearTimeout: NodeJS.Timeout | null = null;
  private indexUpdateTimeout: NodeJS.Timeout | null = null;

  private dailyTaskFilePath: string | null = null;
  private taskFileContentCache: string | null = null;
  private taskFileNeedsUpdate: boolean = false;
  private taskCheckInterval: NodeJS.Timeout | null = null;

  // Debounced функція оновлення для Vault Events
  private debouncedIndexAndUIRebuild = debounce(
    async () => {
      // this.logger.error("[VAULT HANDLER] debouncedIndexAndUIRebuild FIRED");

      if (this.chatManager) {
        await this.chatManager.rebuildIndexFromFiles();
        // this.logger.error("[VAULT HANDLER] Emitting 'chat-list-updated' NOW!");
        // this.emit("chat-list-updated");
      }
    },
    1500,
    true
  );

  // --- Event Emitter Methods ---
  public on(event: string, callback: (data: any) => any): () => void {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(callback);
    return () => {
      this.eventHandlers[event] = this.eventHandlers[event]?.filter(h => h !== callback);
      if (this.eventHandlers[event]?.length === 0) {
        delete this.eventHandlers[event];
      }
    };
  }

  public emit(event: string, data?: any): void {
    const handlers = this.eventHandlers[event];
    if (handlers) {
      handlers.slice().forEach(handler => {
        try {
          handler(data);
        } catch (e) {}
      });
    }
  }
  // --------------------------

  public isTaskFileUpdated(): boolean {
    return this.taskFileNeedsUpdate;
  }

  // src/main.ts

  async onload() {
    const initialSettingsData = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // --- Ініціалізація Логера ---
    const loggerSettings: LoggerSettings = {
      // Визначаємо рівень логування для консолі залежно від середовища
      consoleLogLevel: process.env.NODE_ENV === "production" ? initialSettingsData.consoleLogLevel || "INFO" : "DEBUG",
      fileLoggingEnabled: initialSettingsData.fileLoggingEnabled,
      fileLogLevel: initialSettingsData.fileLogLevel,
      logCallerInfo: initialSettingsData.logCallerInfo,
      logFilePath: initialSettingsData.logFilePath,
      logFileMaxSizeMB: initialSettingsData.logFileMaxSizeMB,
    };
    this.logger = new Logger(this, loggerSettings);
    // ---

    // Завантажуємо налаштування та виконуємо міграцію, якщо потрібно
    await this.loadSettingsAndMigrate();

    // Ініціалізуємо сервіси
    this.promptService = new PromptService(this);
    this.ollamaService = new OllamaService(this);
    this.translationService = new TranslationService(this);
    this.ragService = new RagService(this);
    this.chatManager = new ChatManager(this);


    this.agentManager = new AgentManager(this); // <--- ІНІЦІАЛІЗАЦІЯ
    // Тут можна зареєструвати початкових агентів, якщо вони є
    this.agentManager.registerAgent(new SimpleFileAgent());

    // Ініціалізуємо менеджер чатів (завантажує індекс, відновлює активний чат)
    await this.chatManager.initialize();
    // this.logger.info("Chat Manager initialized.");

    // Оновлюємо налаштування логера реальними значеннями після завантаження
    this.logger.updateSettings({
      consoleLogLevel: this.settings.consoleLogLevel,
      fileLoggingEnabled: this.settings.fileLoggingEnabled,
      fileLogLevel: this.settings.fileLogLevel,
      logCallerInfo: this.settings.logCallerInfo,
      logFilePath: this.settings.logFilePath,
      logFileMaxSizeMB: this.settings.logFileMaxSizeMB,
    });

    // Реєструємо View плагіна
    this.registerView(VIEW_TYPE_OLLAMA_PERSONAS, leaf => {
      // this.logger.info("Creating OllamaView instance.");
      this.view = new OllamaView(leaf, this);
      return this.view;
    });

    // Обробка помилок з'єднання з Ollama Service
    this.ollamaService.on("connection-error", error => {
        this.logger.error("Ollama connection error detected:", error);
        // Генеруємо подію плагіна про помилку з'єднання
        this.emit("ollama-connection-error", error.message || "Unknown connection error");
    });

    // Реєстрація обробників внутрішніх подій плагіна
    this.register(
      this.on("ollama-connection-error", async (message: string) => {
        if (this.chatManager) {
          // Додаємо повідомлення про помилку до активного чату
          await this.chatManager.addMessageToActiveChat("error", `Ollama Connection Error: ${message}`, new Date());
        } else {
          // Якщо ChatManager ще не готовий, показуємо стандартне повідомлення
          new Notice(`Ollama Connection Error: ${message}`);
        }
      })
    );
    // Реєструємо локальний обробник для збереження ID активного чату
    this.register(this.on("active-chat-changed", this.handleActiveChatChangedLocally.bind(this)));
    // Реєструємо обробник для оновлення налаштувань
    this.register(
      this.on("settings-updated", () => {
        this.logger.info("Settings updated, applying changes...");
        // Оновлюємо налаштування логера
        this.logger.updateSettings({
            consoleLogLevel: this.settings.consoleLogLevel,
            fileLoggingEnabled: this.settings.fileLoggingEnabled,
            fileLogLevel: this.settings.fileLogLevel,
            logCallerInfo: this.settings.logCallerInfo,
            logFilePath: this.settings.logFilePath,
            logFileMaxSizeMB: this.settings.logFileMaxSizeMB,
         });
        // Оновлюємо шлях до файлу завдань та завантажуємо їх
        this.updateDailyTaskFilePath();
        this.loadAndProcessInitialTasks(); // Не блокуємо потік, хай працює асинхронно
        // Оновлюємо конфігурацію Ollama Service (напр., URL)
        this.updateOllamaServiceConfig();
        // Скидаємо кеш ролей та сповіщаємо про їх оновлення
        this.roleListCache = null;
        this.promptService?.clearRoleCache?.();
        this.emit("roles-updated");
        // Сповіщаємо View про оновлення налаштувань
        this.view?.handleSettingsUpdated?.();
      })
    );
    // -------------------------------------------------

    // --- Додавання стрічки (Ribbon) та команд ---
    this.addRibbonIcon("brain-circuit", "Open AI Forge Chat", () => {
      this.activateView();
    });
    // Команда для відкриття чату
    this.addCommand({
      id: "open-chat-view",
      name: "Open AI Forge Chat",
      callback: () => {
        this.activateView();
      },
    });
    // Команда для індексації RAG
    this.addCommand({
      id: "index-rag-documents",
      name: "AI Forge: Index documents for RAG",
      callback: async () => {
        if (this.settings.ragEnabled) {
            await this.ragService.indexDocuments();
        } else {
            new Notice("RAG is disabled in settings.");
        }
      },
    });
    // Команда для очищення історії активного чату
    this.addCommand({
      id: "clear-active-chat-history",
      name: "AI Forge: Clear Active Chat History",
      callback: async () => {
        await this.clearMessageHistoryWithConfirmation();
      },
    });
    // Команда для оновлення списку ролей
    this.addCommand({
      id: "refresh-roles",
      name: "AI Forge: Refresh Roles List",
      callback: async () => {
        await this.listRoleFiles(true); // Примусово оновлюємо список
        this.emit("roles-updated"); // Сповіщаємо UI
        new Notice("Role list refreshed.");
      },
    });
    // Команда для створення нового чату
    this.addCommand({
      id: "new-chat",
      name: "AI Forge: New Chat",
      callback: async () => {
        const newChat = await this.chatManager.createNewChat();
        if (newChat) {
          new Notice(`Created new chat: ${newChat.metadata.name}`);
           // Фокус на поле вводу може оброблятися через подію 'active-chat-changed' у View
        } else {
           new Notice("Failed to create new chat.");
        }
      },
    });
    // Команда для перемикання чатів (UI не реалізовано)
    this.addCommand({
      id: "switch-chat",
      name: "AI Forge: Switch Chat",
      callback: async () => {
        await this.showChatSwitcher();
      },
    });
    // Команда для перейменування активного чату
    this.addCommand({
      id: "rename-active-chat",
      name: "AI Forge: Rename Active Chat",
      callback: async () => {
        await this.renameActiveChat();
      },
    });
    // Команда для видалення активного чату
    this.addCommand({
      id: "delete-active-chat",
      name: "AI Forge: Delete Active Chat",
      callback: async () => {
        await this.deleteActiveChatWithConfirmation();
      },
    });
    // --------------------------

    // Додаємо вкладку налаштувань
    this.settingTab = new OllamaSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    // Виконуємо дії після того, як робочий простір готовий
    this.app.workspace.onLayoutReady(async () => {
      this.logger.info("Workspace layout ready.");
      // Автоматична індексація RAG при старті, якщо увімкнено
      if (this.settings.ragEnabled && this.settings.ragAutoIndexOnStartup) {
        this.logger.info("RAG enabled, starting initial indexing after delay...");
        setTimeout(() => {
          this.ragService?.indexDocuments();
        }, 5000); // Запускаємо з невеликою затримкою
      }
      // Спроба відновити активний чат - ця логіка тепер виконується в chatManager.initialize()
      // const savedActiveId = await this.loadDataKey(ACTIVE_CHAT_ID_KEY);
      // if (savedActiveId && this.settings.saveMessageHistory && this.chatManager) {
      //    await this.chatManager.setActiveChat(savedActiveId);
      // }
    });

    // --- Реєстрація слухачів Vault для папки ЧАТІВ ---
    this.registerVaultListeners(); // Викликаємо метод реєстрації
    // ---

    // --- Реєстрація слухачів для папки РОЛЕЙ та RAG ---
    // Ці слухачі НЕ повинні викликати повний rebuild індексу чатів
    const debouncedRoleClear = debounce( () => {
        // this.logger.debug("Debounced role cache clear triggered.");
        this.roleListCache = null; // Скидаємо кеш списку ролей
        this.promptService?.clearRoleCache?.(); // Скидаємо кеш контенту ролей
        this.emit("roles-updated"); // Сповіщаємо про необхідність оновити списки ролей в UI
      }, 1500, true ); // Затримка та негайне виконання

    // Створюємо обробники для подій Vault, які стосуються ролей/RAG
    const handleModifyEvent = (file: TAbstractFile) => {
      if (file instanceof TFile) {
        this.handleRoleOrRagFileChange(file.path, debouncedRoleClear, false);
        this.handleTaskFileModify(file); // Окрема обробка файлу завдань
      }
    };
    const handleDeleteEvent = (file: TAbstractFile) => {
      this.handleRoleOrRagFileChange(file.path, debouncedRoleClear, true); // Помічаємо як видалення
      if (this.settings.enableProductivityFeatures && file.path === this.dailyTaskFilePath) {
         // Якщо видалено файл завдань
         this.dailyTaskFilePath = null;
         this.taskFileContentCache = null;
         this.taskFileNeedsUpdate = false;
         this.chatManager?.updateTaskState(null); // Скидаємо стан завдань
      }
    };
    const handleRenameEvent = (file: TAbstractFile, oldPath: string) => {
      // Реагуємо і на новий, і на старий шлях для ролей/RAG
      this.handleRoleOrRagFileChange(file.path, debouncedRoleClear, false);
      this.handleRoleOrRagFileChange(oldPath, debouncedRoleClear, true);
      // Обробка перейменування файлу завдань
      if (this.settings.enableProductivityFeatures) {
        if (oldPath === this.dailyTaskFilePath) { // Якщо перейменовано файл завдань
          this.updateDailyTaskFilePath(); // Оновлюємо шлях
          this.loadAndProcessInitialTasks(); // Перезавантажуємо завдання
        } else if (file.path === this.dailyTaskFilePath) { // Якщо якийсь файл перейменовано НА файл завдань
          this.taskFileNeedsUpdate = true;
          this.checkAndProcessTaskUpdate();
        }
      }
    };
    const handleCreateEvent = (file: TAbstractFile) => {
        // Цей 'create' обробляє створення файлів ролей/RAG
        this.handleRoleOrRagFileChange(file.path, debouncedRoleClear, false);
        // Обробка створення файлу завдань
        if (this.settings.enableProductivityFeatures && file.path === this.dailyTaskFilePath) {
            this.taskFileNeedsUpdate = true;
            this.checkAndProcessTaskUpdate();
        }
    };
    // Реєструємо ці окремі обробники
    this.registerEvent(this.app.vault.on("modify", handleModifyEvent));
    this.registerEvent(this.app.vault.on("delete", handleDeleteEvent));
    this.registerEvent(this.app.vault.on("rename", handleRenameEvent));
    // Важливо: Цей 'create' обробляє ролі/RAG, а той, що в registerVaultListeners - чати.
    this.registerEvent(this.app.vault.on("create", handleCreateEvent));
    // ---

    // --- Логіка файлу завдань ---
    this.updateDailyTaskFilePath(); // Визначаємо шлях до файлу завдань
    await this.loadAndProcessInitialTasks(); // Завантажуємо початковий стан завдань
    if (this.settings.enableProductivityFeatures) {
      // Запускаємо періодичну перевірку оновлень файлу завдань
      this.taskCheckInterval = setInterval(() => this.checkAndProcessTaskUpdate(), 5000);
      this.registerInterval(this.taskCheckInterval as any); // Реєструємо інтервал для авто-очищення
    }
    // this.logger.info("AI Forge Plugin loaded successfully.");
  } // --- кінець onload ---

  registerVaultListeners(): void {
    // Обробник для create та delete
    const handleFileCreateDelete = (file: TAbstractFile | null) => {
      if (!file || !this.chatManager || !this.settings.chatHistoryFolderPath) return;
      const historyPath = normalizePath(this.settings.chatHistoryFolderPath);
      // Перевіряємо, чи файл знаходиться всередині папки історії (не сама папка)
      // і чи це JSON файл (для create) або будь-який файл/папка (для delete)
      // ВАЖЛИВО: Перевірка на historyPath+'/' гарантує, що ми не реагуємо на саму папку історії
      if (
        file.path.startsWith(historyPath + "/") &&
        (file.path.toLowerCase().endsWith(".json") || file instanceof TFolder)
      ) {
        // this.logger.error(
        //   `[VAULT HANDLER] Vault change (create/delete) detected inside history folder: ${file.path}. Triggering rebuild.`
        // );
        this.debouncedIndexAndUIRebuild(); // Викликаємо debounced оновлення
      }
    };

    // Обробник для rename
    const handleFileRename = (file: TAbstractFile | null, oldPath: string) => {
      if (!file || !this.chatManager || !this.settings.chatHistoryFolderPath) return;
      const historyPath = normalizePath(this.settings.chatHistoryFolderPath);
      // Перевіряємо, чи старий АБО новий шлях знаходиться всередині папки історії
      const isInHistoryNew = file.path.startsWith(historyPath + "/");
      const isInHistoryOld = oldPath.startsWith(historyPath + "/");

      // Реагуємо, тільки якщо зміна стосується файлів/папок ВСЕРЕДИНІ папки історії
      if ((isInHistoryNew || isInHistoryOld) && file.path !== historyPath && oldPath !== historyPath) {
        // this.logger.error(
        //   `[VAULT HANDLER] Vault rename detected involving history folder: ${oldPath} -> ${file.path}. Triggering rebuild.`
        // );
        this.debouncedIndexAndUIRebuild();
      }
    };

    // Реєструємо події
    this.registerEvent(this.app.vault.on("create", handleFileCreateDelete));
    this.registerEvent(this.app.vault.on("delete", handleFileCreateDelete));
    this.registerEvent(this.app.vault.on("rename", handleFileRename));
  }

  // --- Логіка файлу завдань ---
  updateDailyTaskFilePath(): void {
    const folderPath = this.settings.ragFolderPath?.trim();
    const fileName = this.settings.dailyTaskFileName?.trim();
    const newPath = folderPath && fileName ? normalizePath(`${folderPath}/${fileName}`) : null;
    if (newPath !== this.dailyTaskFilePath) {
      this.dailyTaskFilePath = newPath;
      this.taskFileContentCache = null;
      this.taskFileNeedsUpdate = true;
    } else if (!newPath && this.dailyTaskFilePath !== null) {
      this.dailyTaskFilePath = null;
      this.taskFileContentCache = null;
      this.chatManager?.updateTaskState(null);
      this.taskFileNeedsUpdate = false;
    }
  }

  handleTaskFileModify(file: TFile): void {
    if (this.settings.enableProductivityFeatures && file.path === this.dailyTaskFilePath) {
      if (!this.taskFileNeedsUpdate) {
        this.taskFileNeedsUpdate = true;
      }
    }
  }

  async loadAndProcessInitialTasks(): Promise<void> {
    if (!this.settings.enableProductivityFeatures || !this.dailyTaskFilePath) {
      if (this.taskFileContentCache !== null) {
        this.taskFileContentCache = null;
        this.chatManager?.updateTaskState(null);
      }
      this.taskFileNeedsUpdate = false;
      return;
    }

    try {
      const fileExists = await this.app.vault.adapter.exists(this.dailyTaskFilePath);
      if (fileExists) {
        const content = await this.app.vault.adapter.read(this.dailyTaskFilePath);
        if (content !== this.taskFileContentCache || this.taskFileContentCache === null) {
          this.taskFileContentCache = content;
          const tasks = this.parseTasks(content);

          this.chatManager?.updateTaskState(tasks);
          this.taskFileNeedsUpdate = false;
        } else {
          this.taskFileNeedsUpdate = false;
        }
      } else {
        if (this.taskFileContentCache !== null) {
          this.taskFileContentCache = null;
          this.chatManager?.updateTaskState(null);
        }
        this.taskFileNeedsUpdate = false;
      }
    } catch (error) {
      if (this.taskFileContentCache !== null) {
        this.taskFileContentCache = null;
        this.chatManager?.updateTaskState(null);
      }
      this.taskFileNeedsUpdate = false;
    }
  }

  parseTasks(content: string): { urgent: string[]; regular: string[]; hasContent: boolean } {
    const lines = content.split("\n");
    const urgent: string[] = [];
    const regular: string[] = [];
    let hasContent = false;
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      hasContent = true;
      if (trimmedLine.startsWith("- [x]") || trimmedLine.startsWith("- [X]")) continue;
      let taskText = trimmedLine;
      let isUrgent = false;
      if (taskText.startsWith("!") || taskText.toLowerCase().includes("[urgent]")) {
        isUrgent = true;
        taskText = taskText
          .replace(/^!/, "")
          .replace(/\[urgent\]/i, "")
          .trim();
      }
      if (taskText.startsWith("- [ ]")) {
        taskText = taskText.substring(taskText.indexOf("]") + 1).trim();
      } else if (taskText.startsWith("- ")) {
        taskText = taskText.substring(1).trim();
      }
      if (taskText.length > 0) {
        if (isUrgent) {
          urgent.push(taskText);
        } else {
          regular.push(taskText);
        }
      }
    }
    const hasActualTasks = urgent.length > 0 || regular.length > 0;
    return { urgent: urgent, regular: regular, hasContent: hasActualTasks };
  }

  async checkAndProcessTaskUpdate(): Promise<void> {
    if (this.taskFileNeedsUpdate && this.settings.enableProductivityFeatures) {
      await this.loadAndProcessInitialTasks();
    } else {
      //
    }
  }
  // --- Кінець логіки файлу завдань ---

  // Обробник змін для ролей та RAG
  private handleRoleOrRagFileChange(changedPath: string, debouncedRoleClear: () => void, isDeletion: boolean = false) {
    const normPath = normalizePath(changedPath);

    // 1. Перевірка для Ролей
    const userRolesPath = this.settings.userRolesFolderPath ? normalizePath(this.settings.userRolesFolderPath) : null;
    const builtInRolesPath = this.manifest.dir ? normalizePath(`${this.manifest.dir}/roles`) : null;
    let isRoleFile = false;
    if (normPath.toLowerCase().endsWith(".md")) {
      if (userRolesPath && normPath.startsWith(userRolesPath + "/")) {
        if (normPath.substring(userRolesPath.length + 1).indexOf("/") === -1) {
          isRoleFile = true;
        }
      } else if (builtInRolesPath && normPath.startsWith(builtInRolesPath + "/")) {
        if (normPath.substring(builtInRolesPath.length + 1).indexOf("/") === -1) {
          isRoleFile = true;
        }
      }
    }
    // Також реагуємо на зміну/видалення самої папки ролей
    if (userRolesPath && normPath === userRolesPath) {
      isRoleFile = true; // Treat folder change as needing a role refresh
    }

    if (isRoleFile) {
      debouncedRoleClear();
    }

    // 2. Перевірка для RAG
    const ragFolderPath = this.settings.ragFolderPath ? normalizePath(this.settings.ragFolderPath) : null;
    if (
      this.settings.ragEnabled &&
      ragFolderPath &&
      (normPath.startsWith(ragFolderPath + "/") || normPath === ragFolderPath)
    ) {
      if (normPath !== this.dailyTaskFilePath) {
        // Не індексуємо файл завдань автоматично

        this.debounceIndexUpdate();
      } else {
      }
    }
  }

  async onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_OLLAMA_PERSONAS).forEach(l => l.detach());
    this.view = null; // Скидаємо посилання на view

    if (this.indexUpdateTimeout) clearTimeout(this.indexUpdateTimeout);
    if (this.roleCacheClearTimeout) clearTimeout(this.roleCacheClearTimeout);
    if (this.taskCheckInterval) clearInterval(this.taskCheckInterval);

    // Очищення обробників подій
    this.eventHandlers = {};

    try {
      if (this.chatManager && this.settings.saveMessageHistory) {
        const lastActiveId = this.chatManager.getActiveChatId();
        if (lastActiveId !== undefined && lastActiveId !== null) {
          await this.saveDataKey(ACTIVE_CHAT_ID_KEY, lastActiveId);
        } else {
          await this.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
        }
      } else {
        await this.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
      }
    } catch (error) {}
  }

  updateOllamaServiceConfig() {
    if (this.ollamaService) {
      // Тут має бути логіка, що передає нові налаштування (наприклад, URL) в OllamaService
      // this.ollamaService.updateConfig({ baseUrl: this.settings.ollamaUrl }); // Приклад
      this.promptService?.clearModelDetailsCache();
    }
  }

  private debounceIndexUpdate() {
    if (this.indexUpdateTimeout) clearTimeout(this.indexUpdateTimeout);

    this.indexUpdateTimeout = setTimeout(async () => {
      if (this.settings.ragEnabled && this.ragService) {
        await this.ragService.indexDocuments();
      } else {
      }
      this.indexUpdateTimeout = null;
    }, 30000); // 30 секунд затримки
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const viewType = VIEW_TYPE_OLLAMA_PERSONAS;
    const existingLeaves = workspace.getLeavesOfType(viewType);

    if (existingLeaves.length > 0) {
      leaf = existingLeaves[0];
    } else {
      if (this.settings.openChatInTab) {
        leaf = workspace.getLeaf("tab");
      } else {
        leaf = workspace.getRightLeaf(false);

        if (!leaf) {
          leaf = workspace.getLeaf("tab");
        } else {
        }
      }
      if (leaf) {
        try {
          await leaf.setViewState({ type: viewType, active: true });
        } catch (e) {
          new Notice("Error opening AI Forge view.");
          return;
        }
      } else {
        new Notice("Could not open AI Forge view.");
        return;
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
      setTimeout(() => {
        if (leaf && leaf.view instanceof OllamaView) {
          this.view = leaf.view;

          this.emit("focus-input-request");
        } else {
          this.view = null;
        }
      }, 50);
    }
  }

  async loadSettingsAndMigrate() {
    const loadedData = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

    this.updateOllamaServiceConfig();
    this.updateDailyTaskFilePath();
  }

  async saveSettings() {
    await this.saveData(this.settings);

    this.emit("settings-updated");
  }

  async saveDataKey(key: string, value: any): Promise<void> {
    try {
      const data = (await this.loadData()) || {};
      data[key] = value;
      await this.saveData(data);
    } catch (error) {}
  }

  async loadDataKey(key: string): Promise<any> {
    try {
      const data = (await this.loadData()) || {};
      const value = data[key];

      return value;
    } catch (error) {
      return undefined;
    }
  }

  async clearMessageHistoryWithConfirmation() {
    if (!this.chatManager) {
      new Notice("Error: Chat Manager not ready.");
      return;
    }
    const activeChat = await this.chatManager.getActiveChat();
    if (activeChat && activeChat.messages.length > 0) {
      new ConfirmModal(this.app, "Clear History", `Clear messages in "${activeChat.metadata.name}"?`, async () => {
        await this.chatManager.clearActiveChatMessages();
        new Notice(`History cleared for "${activeChat.metadata.name}".`);
      }).open();
    } else if (activeChat) {
      new Notice("Chat history is already empty.");
    } else {
      new Notice("No active chat to clear.");
    }
  }

  async listRoleFiles(forceRefresh: boolean = false): Promise<RoleInfo[]> {
    if (this.roleListCache && !forceRefresh) {
      return this.roleListCache;
    }

    const roles: RoleInfo[] = [];
    const addedNamesLowerCase = new Set<string>();
    const adapter = this.app.vault.adapter;
    const pluginDir = this.manifest.dir;
    const builtInRoleName = "Productivity Assistant";
    const builtInRoleFileName = "Productivity_Assistant.md";
    let builtInRolePath: string | null = null;
    if (pluginDir) {
      builtInRolePath = normalizePath(`${pluginDir}/roles/${builtInRoleFileName}`);
      try {
        if (await adapter.exists(builtInRolePath)) {
          const stat = await adapter.stat(builtInRolePath);
          if (stat?.type === "file") {
            roles.push({ name: builtInRoleName, path: builtInRolePath, isCustom: false });
            addedNamesLowerCase.add(builtInRoleName.toLowerCase());
          }
        }
      } catch (error) {}
    }
    const userRolesFolderPath = this.settings.userRolesFolderPath
      ? normalizePath(this.settings.userRolesFolderPath)
      : null;
    if (userRolesFolderPath && userRolesFolderPath !== "/") {
      try {
        const folderExists = await adapter.exists(userRolesFolderPath);
        const folderStat = folderExists ? await adapter.stat(userRolesFolderPath) : null;
        if (folderStat?.type === "folder") {
          const listResult = await adapter.list(userRolesFolderPath);
          for (const filePath of listResult.files) {
            if (
              filePath.toLowerCase().endsWith(".md") &&
              filePath.substring(userRolesFolderPath.length + 1).indexOf("/") === -1 &&
              filePath !== builtInRolePath
            ) {
              const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
              const roleName = fileName.slice(0, -3);
              if (!addedNamesLowerCase.has(roleName.toLowerCase())) {
                roles.push({ name: roleName, path: filePath, isCustom: true });
                addedNamesLowerCase.add(roleName.toLowerCase());
              } else {
              }
            }
          }
        }
      } catch (e) {}
    }
    roles.sort((a, b) => a.name.localeCompare(b.name));
    this.roleListCache = roles;

    return roles;
  }

  async executeSystemCommand(
    command: string
  ): Promise<{ stdout: string; stderr: string; error: ExecException | null }> {
    if (!command?.trim()) {
      return { stdout: "", stderr: "Empty command.", error: new Error("Empty command.") as ExecException };
    }
    //@ts-ignore
    if (typeof process === "undefined" || !process?.versions?.node) {
      new Notice("Cannot execute system command: Node.js environment is required.");
      return { stdout: "", stderr: "Node.js required.", error: new Error("Node.js required.") as ExecException };
    }
    return new Promise(resolve => {
      exec(command, (error, stdout, stderr) => {
        if (error)
          if (stderr && stderr.trim()) resolve({ stdout: stdout.toString(), stderr: stderr.toString(), error: error });
      });
    });
  }

  async showChatSwitcher() {
    new Notice("Switch Chat UI not implemented yet.");
  }

  async renameActiveChat() {
    if (!this.chatManager) {
      new Notice("Error: Chat manager is not ready.");
      return;
    }
    const activeChat = await this.chatManager.getActiveChat();
    if (!activeChat) {
      new Notice("No active chat to rename.");
      return;
    }
    const currentName = activeChat.metadata.name;
    const chatId = activeChat.metadata.id;

    new PromptModal(this.app, "Rename Chat", `Enter new name for "${currentName}":`, currentName, async newName => {
      const trimmedName = newName?.trim();
      if (trimmedName && trimmedName !== "" && trimmedName !== currentName) {
        const success = await this.chatManager.renameChat(chatId, trimmedName);
        if (!success) {
        }
      } else if (newName === null || trimmedName === "") {
        new Notice("Rename cancelled or invalid name entered.");
      } else {
        new Notice("Name unchanged.");
      }
    }).open();
  }

  async deleteActiveChatWithConfirmation() {
    if (!this.chatManager) {
      new Notice("Error: Chat manager is not ready.");
      return;
    }
    const activeChat = await this.chatManager.getActiveChat();
    if (!activeChat) {
      new Notice("No active chat to delete.");
      return;
    }
    const chatName = activeChat.metadata.name;
    const chatId = activeChat.metadata.id;

    new ConfirmModal(
      this.app,
      "Delete Chat",
      `Are you sure you want to delete chat "${chatName}"?\nThis action cannot be undone.`,
      async () => {
        const success = await this.chatManager.deleteChat(chatId);
        if (!success) {
        }
      }
    ).open();
  }

  private async handleActiveChatChangedLocally(data: { chatId: string | null; chat: Chat | null }) {
    if (this.settings.saveMessageHistory) {
      await this.saveDataKey(ACTIVE_CHAT_ID_KEY, data.chatId);
    } else {
      await this.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
    }
  }

  findRoleNameByPath(rolePath: string | null | undefined): string {
    if (!rolePath) return "None";
    const cachedRole = this.roleListCache?.find(rl => rl.path === rolePath);
    if (cachedRole) {
      return cachedRole.name;
    }

    try {
      const fileName = rolePath.substring(rolePath.lastIndexOf("/") + 1);
      const roleName = fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
      return roleName || "Unknown Role";
    } catch (e) {
      return "Unknown Role";
    }
  }
} // END OF OllamaPlugin CLASS
