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

// --- КОНСТАНТИ ДЛЯ ЗБЕРЕЖЕННЯ ---
// const SESSIONS_INDEX_KEY_V1 = "chatSessionsIndex_v1";
// const ACTIVE_SESSION_ID_KEY_V1 = "activeChatSessionId_v1";
export const SESSIONS_INDEX_KEY = "chatIndex_v2";
export const ACTIVE_CHAT_ID_KEY = "activeChatId_v2";
export const CHAT_INDEX_KEY = "chatIndex_v2";
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
  ollamaService!: OllamaService;
  promptService!: PromptService;
  chatManager!: ChatManager;
  translationService!: TranslationService;
  logger!: Logger;

  private eventHandlers: Record<string, Array<(data: any) => any>> = {};
  private roleListCache: RoleInfo[] | null = null;
  private roleCacheClearTimeout: NodeJS.Timeout | null = null;
  private indexUpdateTimeout: NodeJS.Timeout | null = null;
  private fileChangeHandlerDebounced: (file: TAbstractFile) => void; // Змінено тип

  private dailyTaskFilePath: string | null = null;
  private taskFileContentCache: string | null = null;
  private taskFileNeedsUpdate: boolean = false;
  private taskCheckInterval: NodeJS.Timeout | null = null;

  // --- Event Emitter Methods (зроблено public) ---
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
    // Зроблено public
    const handlers = this.eventHandlers[event];
    // --- ВИПРАВЛЕННЯ: Використовуємо handlers замість h ---
    if (handlers) {
      handlers.slice().forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          this.logger.error(`[OllamaPlugin] Error in event handler for ${event}:`, e); // Використовуємо логер
        }
      });
    }
  }
  // --------------------------

  public isTaskFileUpdated(): boolean {
    return this.taskFileNeedsUpdate;
  }

  async onload() {
    const initialSettingsData = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); // Завантажуємо дані для логера

    // --- ТЕПЕР ініціалізуємо Логер ---
    const loggerSettings: LoggerSettings = {
      consoleLogLevel: process.env.NODE_ENV === "production" ? initialSettingsData.consoleLogLevel || "INFO" : "DEBUG", // Використовуємо initialSettingsData
      fileLoggingEnabled: initialSettingsData.fileLoggingEnabled,
      fileLogLevel: initialSettingsData.fileLogLevel,
      logCallerInfo: initialSettingsData.logCallerInfo,
      logFilePath: initialSettingsData.logFilePath,
      logFileMaxSizeMB: initialSettingsData.logFileMaxSizeMB,
    };
    // Створюємо екземпляр логера
    this.logger = new Logger(this, loggerSettings);

    await this.loadSettingsAndMigrate();

    this.promptService = new PromptService(this);
    this.ollamaService = new OllamaService(this);
    this.translationService = new TranslationService(this);
    this.ragService = new RagService(this);
    this.chatManager = new ChatManager(this);

    await this.chatManager.initialize();

    this.logger.updateSettings({
      consoleLogLevel: this.settings.consoleLogLevel,
      fileLoggingEnabled: this.settings.fileLoggingEnabled,
      fileLogLevel: this.settings.fileLogLevel,
      logCallerInfo: this.settings.logCallerInfo,
      logFilePath: this.settings.logFilePath,
      logFileMaxSizeMB: this.settings.logFileMaxSizeMB,
    });

    this.registerView(VIEW_TYPE_OLLAMA_PERSONAS, leaf => {
      this.view = new OllamaView(leaf, this);
      return this.view;
    });

    this.ollamaService.on("connection-error", error => {
      this.logger.error("[Plugin] Connection error event received:", error);
      this.emit("ollama-connection-error", error.message || "Unknown connection error");
    });

    // Реєстрація обробників подій плагіна
    this.register(
      this.on("ollama-connection-error", async (message: string) => {
        if (this.chatManager) {
          await this.chatManager.addMessageToActiveChat("error", message, new Date());
        } else {
          this.logger.error("Cannot display connection error: ChatManager not available.");
          new Notice(`Ollama Connection Error: ${message}`); // Fallback notice
        }
      })
    );
    this.register(this.on("active-chat-changed", this.handleActiveChatChangedLocally.bind(this)));
    // --- ВИДАЛЕНО ПРЯМИЙ ВИКЛИК ЗВІДСИ ---
    // this.register(
    //   this.on("chat-list-updated", () => {
    //     this.view?.renderChatListMenu?.(); // ЦЕ НЕПРАВИЛЬНО
    //   })
    // );
    // OllamaView сам обробить "chat-list-updated"
    // --------------------------------------
    this.register(
      this.on("settings-updated", () => {
        this.logger.updateSettings({
          /* ... передаємо об'єкт LoggerSettings ... */
          consoleLogLevel: this.settings.consoleLogLevel,
          fileLoggingEnabled: this.settings.fileLoggingEnabled,
          fileLogLevel: this.settings.fileLogLevel,
          logCallerInfo: this.settings.logCallerInfo,
          logFilePath: this.settings.logFilePath,
          logFileMaxSizeMB: this.settings.logFileMaxSizeMB,
        });
        this.updateDailyTaskFilePath();
        this.loadAndProcessInitialTasks();
        this.updateOllamaServiceConfig();
        this.roleListCache = null;
        this.promptService?.clearRoleCache?.();
        // ВИКЛИК this.view?.handleSettingsUpdated?.(); ВЖЕ Є НИЖЧЕ - він обробить все
        this.emit("roles-updated"); // Генеруємо подію, OllamaView її зловить
        // --- ВИДАЛЕНО ПРЯМИЙ ВИКЛИК ЗВІДСИ ---
        // this.view?.renderRoleList?.(); // НЕ ПОТРІБНО, бо є emit("roles-updated") вище
        // --------------------------------------
        this.view?.handleSettingsUpdated?.(); // Цей обробник в OllamaView оновить все необхідне, включаючи меню якщо треба
      })
    );
    // -------------------------------------------------

    // --- Ribbon & Commands ---
    this.addRibbonIcon("brain-circuit", "Open AI Forge Chat", () => {
      this.activateView();
    });
    this.addCommand({
      id: "open-chat-view",
      name: "Open AI Forge Chat",
      callback: () => {
        this.activateView();
      },
    });
    this.addCommand({
      id: "index-rag-documents",
      name: "AI Forge: Index documents for RAG",
      callback: async () => {
        if (this.settings.ragEnabled) await this.ragService.indexDocuments();
        else new Notice("RAG is disabled in settings.");
      },
    });
    this.addCommand({
      id: "clear-active-chat-history",
      name: "AI Forge: Clear Active Chat History",
      callback: async () => {
        await this.clearMessageHistoryWithConfirmation();
      },
    });
    this.addCommand({
      id: "refresh-roles",
      name: "AI Forge: Refresh Roles List",
      callback: async () => {
        await this.listRoleFiles(true); // Очистити кеш і перечитати
        this.emit("roles-updated"); // Повідомити всіх (включаючи View)
        new Notice("Role list refreshed.");
      },
    });
    this.addCommand({
      id: "new-chat",
      name: "AI Forge: New Chat",
      callback: async () => {
        const newChat = await this.chatManager.createNewChat();
        if (newChat) {
          new Notice(`Created new chat: ${newChat.metadata.name}`);
          // View оновиться через подію 'active-chat-changed'
        }
      },
    });
    this.addCommand({
      id: "switch-chat",
      name: "AI Forge: Switch Chat",
      callback: async () => {
        await this.showChatSwitcher();
      },
    });
    this.addCommand({
      id: "rename-active-chat",
      name: "AI Forge: Rename Active Chat",
      callback: async () => {
        await this.renameActiveChat();
      },
    });
    this.addCommand({
      id: "delete-active-chat",
      name: "AI Forge: Delete Active Chat",
      callback: async () => {
        await this.deleteActiveChatWithConfirmation();
      },
    });
    // --------------------------

    this.settingTab = new OllamaSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.ragEnabled) {
        setTimeout(() => {
          this.ragService?.indexDocuments();
        }, 5000);
      }
      // --- Відновлення активного чату ---
      const savedActiveId = await this.loadDataKey(ACTIVE_CHAT_ID_KEY);
      if (savedActiveId && this.settings.saveMessageHistory) {
        
        // Встановлення активного чату викличе подію 'active-chat-changed',
        // на яку підписаний OllamaView для завантаження даних.
        await this.chatManager.setActiveChat(savedActiveId); // true - не генерувати подію, якщо вже активний
      } else {
        // Якщо немає збереженого ID або історія вимкнена, просто переконуємось, що активний чат встановлено (можливо, null)
        // await this.chatManager.ensureActiveChatSet();
        
      }
      // ---------------------------------
    });

    // --- File Watcher Setup ---
    const debouncedRoleClear = debounce(
      () => {
        this.roleListCache = null;
        this.promptService?.clearRoleCache?.();
        this.emit("roles-updated"); // <-- ЗМІНА: Просто генеруємо подію
        // this.view?.renderRoleList?.(); // <-- ВИДАЛЕНО ПРЯМИЙ ВИКЛИК
      },
      1500,
      true
    );

    // Debounced handler тільки для змін, що потребують затримки (ролі, RAG)
    this.fileChangeHandlerDebounced = debounce(
      (file: TAbstractFile) => {
        if (!file) return;
        this.handleRoleOrRagFileChange(file.path, debouncedRoleClear, false);
      },
      1000,
      true
    ); // Затримка 1 секунда

    // --- Окремі обробники подій ---
    const handleModifyEvent = (file: TAbstractFile) => {
      if (file instanceof TFile) {
        this.fileChangeHandlerDebounced(file); // Debounced Roles/RAG check
        this.handleTaskFileModify(file); // Миттєва перевірка файлу завдань
      }
    };

    const handleDeleteEvent = (file: TAbstractFile) => {
      // Викликаємо обробник, який сам викличе debouncedRoleClear якщо треба
      this.handleRoleOrRagFileChange(file.path, debouncedRoleClear, true); // isDeletion = true
      if (this.settings.enableProductivityFeatures && file.path === this.dailyTaskFilePath) {
        this.dailyTaskFilePath = null;
        this.taskFileContentCache = null;
        this.taskFileNeedsUpdate = false;
        this.chatManager?.updateTaskState(null);
      }
    };

    const handleRenameEvent = (file: TAbstractFile, oldPath: string) => {
      // Обробляємо і новий, і старий шлях
      this.fileChangeHandlerDebounced(file); // Перевірка нового шляху
      this.handleRoleOrRagFileChange(oldPath, debouncedRoleClear, true); // Перевірка старого як видалення
      if (this.settings.enableProductivityFeatures) {
        if (oldPath === this.dailyTaskFilePath) {
          // Якщо перейменували наш файл завдань, оновлюємо шлях і перечитуємо
          this.updateDailyTaskFilePath();
          this.loadAndProcessInitialTasks();
        } else if (file.path === this.dailyTaskFilePath) {
          // Якщо якийсь інший файл перейменували НА НАШ шлях завдань
          this.taskFileNeedsUpdate = true;
          this.checkAndProcessTaskUpdate();
        }
      }
    };

    const handleCreateEvent = (file: TAbstractFile) => {
      this.fileChangeHandlerDebounced(file); // Перевірка нового файлу
      if (this.settings.enableProductivityFeatures && file.path === this.dailyTaskFilePath) {
        // Якщо створили наш файл завдань
        this.taskFileNeedsUpdate = true;
        this.checkAndProcessTaskUpdate();
      }
    };

    // Реєструємо слухачів з новими обробниками
    this.registerEvent(this.app.vault.on("modify", handleModifyEvent));
    this.registerEvent(this.app.vault.on("delete", handleDeleteEvent));
    this.registerEvent(this.app.vault.on("rename", handleRenameEvent));
    this.registerEvent(this.app.vault.on("create", handleCreateEvent));

    this.updateDailyTaskFilePath();
    await this.loadAndProcessInitialTasks();
    if (this.settings.enableProductivityFeatures) {
      this.taskCheckInterval = setInterval(() => this.checkAndProcessTaskUpdate(), 5000);
      this.registerInterval(this.taskCheckInterval as any);
    }
  }
  // --- Логіка файлу завдань ---
  updateDailyTaskFilePath(): void {
    const folderPath = this.settings.ragFolderPath?.trim(); // Завдання в папці RAG
    const fileName = this.settings.dailyTaskFileName?.trim();
    const newPath = folderPath && fileName ? normalizePath(`${folderPath}/${fileName}`) : null;
    if (newPath !== this.dailyTaskFilePath) {
      
      this.dailyTaskFilePath = newPath;
      this.taskFileContentCache = null; // Скидаємо кеш при зміні шляху
      this.taskFileNeedsUpdate = true; // Потрібно перечитати новий файл
    } else if (!newPath) {
      if (this.dailyTaskFilePath !== null) {
        
        this.dailyTaskFilePath = null;
        this.taskFileContentCache = null;
        this.chatManager?.updateTaskState(null); // Повідомляємо про відсутність завдань
        this.taskFileNeedsUpdate = false;
      }
    }
  }
  handleTaskFileModify(file: TFile): void {
    if (this.settings.enableProductivityFeatures && file.path === this.dailyTaskFilePath) {
      // Позначаємо, що файл потребує оновлення, але обробка відбудеться в checkAndProcessTaskUpdate
      if (!this.taskFileNeedsUpdate) {
        
        this.taskFileNeedsUpdate = true;
      }
    }
  }
  async loadAndProcessInitialTasks(): Promise<void> {
    if (!this.settings.enableProductivityFeatures || !this.dailyTaskFilePath) {
      if (this.taskFileContentCache !== null) {
        // Якщо кеш був не null, значить завдання були, тепер їх нема
        
        this.taskFileContentCache = null;
        this.chatManager?.updateTaskState(null); // Повідомити про відсутність завдань
      }
      this.taskFileNeedsUpdate = false;
      return;
    }
    
    try {
      const fileExists = await this.app.vault.adapter.exists(this.dailyTaskFilePath);
      if (fileExists) {
        const content = await this.app.vault.adapter.read(this.dailyTaskFilePath);
        // Перевіряємо, чи контент змінився АБО чи кеш ще не ініціалізовано
        if (content !== this.taskFileContentCache || this.taskFileContentCache === null) {
          
          this.taskFileContentCache = content; // Оновлюємо кеш
          const tasks = this.parseTasks(content);
          
          this.chatManager?.updateTaskState(tasks); // Оновлюємо стан в менеджері чату
          this.taskFileNeedsUpdate = false; // Обробили, оновлення більше не потрібне
        } else {
          // Контент не змінився, нічого не робимо
          
          this.taskFileNeedsUpdate = false; // Скидаємо прапорець на випадок, якщо він був встановлений помилково
        }
      } else {
        // Файл не існує
        
        if (this.taskFileContentCache !== null) {
          // Якщо кеш був, а файлу тепер нема
          this.taskFileContentCache = null;
          this.chatManager?.updateTaskState(null); // Повідомити про відсутність завдань
        }
        this.taskFileNeedsUpdate = false;
      }
    } catch (error) {
      this.logger.error(`Error loading/processing task file ${this.dailyTaskFilePath}:`, error);
      if (this.taskFileContentCache !== null) {
        // Скидаємо стан, якщо була помилка
        this.taskFileContentCache = null;
        this.chatManager?.updateTaskState(null);
      }
      this.taskFileNeedsUpdate = false; // Скидаємо прапорець і при помилці
    }
  }
  parseTasks(content: string): {
    urgent: string[];
    regular: string[];
    hasContent: boolean; // Чи є взагалі якийсь контент (не лише порожні рядки/завершені завдання)
  } {
    const lines = content.split("\n");
    const urgent: string[] = [];
    const regular: string[] = [];
    let hasContent = false; // Чи є хоч один рядок, що не є порожнім

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue; // Пропускаємо порожні рядки
      hasContent = true; // Знайшли непорожній рядок

      // Пропускаємо завершені завдання
      if (trimmedLine.startsWith("- [x]") || trimmedLine.startsWith("- [X]")) continue;

      let taskText = trimmedLine;
      let isUrgent = false;

      // Перевірка на терміновість
      if (taskText.startsWith("!") || taskText.toLowerCase().includes("[urgent]")) {
        isUrgent = true;
        taskText = taskText
          .replace(/^!/, "")
          .replace(/\[urgent\]/i, "")
          .trim();
      }

      // Видаляємо маркер незавершеного завдання, якщо є
      if (taskText.startsWith("- [ ]")) {
        taskText = taskText.substring(taskText.indexOf("]") + 1).trim();
      } else if (taskText.startsWith("- ")) {
        // Видаляємо простий маркер списку
        taskText = taskText.substring(1).trim();
      }

      // Додаємо лише якщо текст завдання не порожній після обробки
      if (taskText.length > 0) {
        if (isUrgent) {
          urgent.push(taskText);
        } else {
          regular.push(taskText);
        }
      }
    }

    // Остаточна перевірка hasContent базується на тому, чи знайшли ми *незавершені* завдання
    const hasActualTasks = urgent.length > 0 || regular.length > 0;

    return { urgent: urgent, regular: regular, hasContent: hasActualTasks };
  }

  async checkAndProcessTaskUpdate(): Promise<void> {
    if (this.taskFileNeedsUpdate && this.settings.enableProductivityFeatures) {
      
      await this.loadAndProcessInitialTasks(); // Викличе оновлення стану в ChatManager
    } else {
      // 
    }
  }
  // --- Кінець логіки файлу завдань ---

  // Обробник змін для ролей та RAG (без debounce)
  private handleRoleOrRagFileChange(changedPath: string, debouncedRoleClear: () => void, isDeletion: boolean = false) {
    const normPath = normalizePath(changedPath);
    

    // 1. Перевірка для Ролей
    const userRolesPath = this.settings.userRolesFolderPath ? normalizePath(this.settings.userRolesFolderPath) : null;
    const builtInRolesPath = this.manifest.dir ? normalizePath(`${this.manifest.dir}/roles`) : null;
    let isRoleFile = false;
    if (normPath.toLowerCase().endsWith(".md")) {
      if (userRolesPath && normPath.startsWith(userRolesPath + "/")) {
        // Перевірка, чи це безпосередньо файл у папці, а не в підпапці
        if (normPath.substring(userRolesPath.length + 1).indexOf("/") === -1) {
          isRoleFile = true;
          
        }
      } else if (builtInRolesPath && normPath.startsWith(builtInRolesPath + "/")) {
        if (normPath.substring(builtInRolesPath.length + 1).indexOf("/") === -1) {
          isRoleFile = true;
          
        }
      }
    }
    if (isRoleFile) {
      
      debouncedRoleClear(); // Викликаємо debounced для ролей
    }

    // 2. Перевірка для RAG (викликаємо debounce з основного обробника)
    const ragFolderPath = this.settings.ragFolderPath ? normalizePath(this.settings.ragFolderPath) : null;
    if (this.settings.ragEnabled && ragFolderPath && normPath.startsWith(ragFolderPath + "/")) {
      // Перевіряємо, що це не файл завдань, перш ніж запускати індексацію
      if (normPath !== this.dailyTaskFilePath) {
        
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

    try {
      if (this.chatManager && this.settings.saveMessageHistory) {
        const lastActiveId = this.chatManager.getActiveChatId();
        if (lastActiveId !== undefined && lastActiveId !== null) {
          
          await this.saveDataKey(ACTIVE_CHAT_ID_KEY, lastActiveId);
        } else {
          
          await this.saveDataKey(ACTIVE_CHAT_ID_KEY, null); // Явно зберігаємо null, якщо активного чату немає
        }
      } else {
        
        await this.saveDataKey(ACTIVE_CHAT_ID_KEY, null); // Зберігаємо null, якщо історія вимкнена
      }
    } catch (error) {
      this.logger.error("Error saving active chat ID on unload:", error);
    }

    // Очищення кешів
    this.promptService?.clearModelDetailsCache?.();
    this.promptService?.clearRoleCache?.();
    this.roleListCache = null;
    
  }

  updateOllamaServiceConfig() {
    if (this.ollamaService) {
      
      this.promptService?.clearModelDetailsCache(); // Очистити кеш деталей, бо URL/модель могли змінитися
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

  // Оновлений метод активації View
  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const viewType = VIEW_TYPE_OLLAMA_PERSONAS; // Use constant
    const existingLeaves = workspace.getLeavesOfType(viewType);

    this.logger.debug(
      `Activating view. Target location: ${this.settings.openChatInTab ? "Tab" : "Sidebar/Tab Fallback"}`
    );

    if (existingLeaves.length > 0) {
      leaf = existingLeaves[0];
      
    } else {
      
      if (this.settings.openChatInTab) {
        leaf = workspace.getLeaf("tab"); // Створити нову вкладку
        
      } else {
        leaf = workspace.getRightLeaf(false); // Спробувати отримати існуючу праву бічну панель
        
        if (!leaf) {
          
          leaf = workspace.getLeaf("tab"); // Якщо бічної панелі немає, відкрити у вкладці
        } else {
          
        }
      }

      // Встановити стан, тільки якщо отримали або створили leaf
      if (leaf) {
        try {
          
          await leaf.setViewState({ type: viewType, active: true });
        } catch (e) {
          this.logger.error("Error setting view state:", e);
          new Notice("Error opening AI Forge view.");
          return; // Вийти, якщо не вдалося встановити стан
        }
      } else {
        this.logger.error("Failed to get or create leaf for AI Forge view.");
        new Notice("Could not open AI Forge view.");
        return; // Вийти, якщо leaf не визначено
      }
    }

    // Показати leaf (існуючий або новий)
    if (leaf) {
      
      workspace.revealLeaf(leaf);
      // Призначити посилання this.view ПІСЛЯ revealLeaf,
      // щоб переконатись, що view вже ініціалізовано
      // Невелика затримка може допомогти, якщо view створюється асинхронно
      setTimeout(() => {
        if (leaf && leaf.view instanceof OllamaView) {
          this.view = leaf.view;
          
          // Можливо, потрібно фокусувати інпут після активації
          this.emit("focus-input-request");
        } else {
          this.logger.error("Leaf revealed, but view is not an instance of OllamaView after timeout:", leaf?.view);
          // Скидаємо this.view, якщо щось пішло не так
          this.view = null;
        }
      }, 50); // Невелика затримка
    }
  }

  // Завантаження та Міграція Налаштувань
  async loadSettingsAndMigrate() {
    
    const loadedData = await this.loadData();
    // Тут можна додати логіку міграції зі старих версій налаштувань
    // наприклад, перейменування ключів, зміна структури тощо.
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    
    // Після завантаження можемо оновити конфіг сервісів, якщо потрібно
    this.updateOllamaServiceConfig();
    // Перевіряємо шлях до файлу завдань, бо він залежить від налаштувань
    this.updateDailyTaskFilePath();
  }

  async saveSettings() {
    
    await this.saveData(this.settings);
    
    this.emit("settings-updated"); // Повідомляємо інші частини плагіна про зміни
  }

  // Data Helpers
  async saveDataKey(key: string, value: any): Promise<void> {
    try {
      
      const data = (await this.loadData()) || {};
      data[key] = value;
      await this.saveData(data);
      
    } catch (error) {
      this.logger.error(`Error saving data key ${key}:`, error);
    }
  }
  async loadDataKey(key: string): Promise<any> {
    try {
      
      const data = (await this.loadData()) || {};
      const value = data[key];
      
      return value;
    } catch (error) {
      this.logger.error(`Error loading data key ${key}:`, error);
      return undefined;
    }
  }

  // History Persistence
  async clearMessageHistoryWithConfirmation() {
    if (!this.chatManager) {
      this.logger.error("ChatManager not ready for clearMessageHistory.");
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

  // List Role Files Method (з виправленням path.basename)
  async listRoleFiles(forceRefresh: boolean = false): Promise<RoleInfo[]> {
    if (this.roleListCache && !forceRefresh) {
      
      return this.roleListCache;
    }
    
    const roles: RoleInfo[] = [];
    const addedNamesLowerCase = new Set<string>();
    const adapter = this.app.vault.adapter;
    const pluginDir = this.manifest.dir; // Шлях до папки плагіна

    // --- Вбудована роль "Productivity Assistant" ---
    const builtInRoleName = "Productivity Assistant";
    const builtInRoleFileName = "Productivity_Assistant.md";
    let builtInRolePath: string | null = null;

    // Визначаємо шлях до папки ролей плагіна
    if (pluginDir) {
      builtInRolePath = normalizePath(`${pluginDir}/roles/${builtInRoleFileName}`);
      
      try {
        if (await adapter.exists(builtInRolePath)) {
          const stat = await adapter.stat(builtInRolePath);
          if (stat?.type === "file") {
            roles.push({
              name: builtInRoleName,
              path: builtInRolePath,
              isCustom: false, // Позначаємо як не кастомну
            });
            addedNamesLowerCase.add(builtInRoleName.toLowerCase());
            
          } else {
            
          }
        } else {
          
        }
      } catch (error) {
        this.logger.error(`Error checking/adding built-in role at ${builtInRolePath}:`, error);
      }
    } else {
      
    }
    // -------------------------------------------

    // --- Кастомні ролі користувача ---
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
            // Перевіряємо, що це MD файл безпосередньо в цій папці (не в підпапках)
            if (
              filePath.toLowerCase().endsWith(".md") &&
              // Перевірка, що немає слешів після назви папки (+1 за слеш)
              filePath.substring(userRolesFolderPath.length + 1).indexOf("/") === -1 &&
              filePath !== builtInRolePath // Ігноруємо, якщо це шлях до вбудованої ролі (малоймовірно, але можливо)
            ) {
              const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
              // Видаляємо ".md" для отримання імені
              const roleName = fileName.slice(0, -3); // Більш надійний спосіб видалення розширення

              // Перевірка на конфлікт імен (регістронезалежна)
              if (!addedNamesLowerCase.has(roleName.toLowerCase())) {
                roles.push({
                  name: roleName,
                  path: filePath,
                  isCustom: true, // Позначаємо як кастомну
                });
                addedNamesLowerCase.add(roleName.toLowerCase());
                
              } else {
                
              }
            } else {
              // 
            }
          }
        } else {
          
        }
      } catch (e) {
        this.logger.error(`Error listing user roles in ${userRolesFolderPath}:`, e);
      }
    } else if (userRolesFolderPath === "/") {
      
    }
    // ------------------------------------

    // Сортуємо ролі за іменем
    roles.sort((a, b) => a.name.localeCompare(b.name));
    this.roleListCache = roles; // Зберігаємо в кеш
    
    return roles;
  }

  // Execute System Command Method
  async executeSystemCommand(command: string): Promise<{
    stdout: string;
    stderr: string;
    error: ExecException | null;
  }> {
    
    if (!command?.trim()) {
      
      return {
        stdout: "",
        stderr: "Empty command.",
        error: new Error("Empty command.") as ExecException,
      };
    }
    //@ts-ignore process is available in Obsidian desktop
    if (typeof process === "undefined" || !process?.versions?.node) {
      this.logger.error("Node.js environment not available. Cannot execute system command.");
      new Notice("Cannot execute system command: Node.js environment is required.");
      return {
        stdout: "",
        stderr: "Node.js required.",
        error: new Error("Node.js required.") as ExecException,
      };
    }
    return new Promise(resolve => {
      exec(command, (error, stdout, stderr) => {
        if (error) this.logger.error(`Exec error for "${command}": ${error.message}`, error);
        if (stderr && stderr.trim()) 
        
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          error: error,
        });
      });
    });
  }

  // --- Session Management Command Helpers ---
  async showChatSwitcher() {
    // Потрібно реалізувати модальне вікно для вибору чату
    
    new Notice("Switch Chat UI not implemented yet.");
    // Приклад з FuzzySuggestModal:
    // const chats = this.chatManager.listAvailableChats();
    // if (!chats || chats.length === 0) {
    //   new Notice("No saved chats available.");
    //   return;
    // }
    // new ChatSwitcherModal(this.app, chats, async (selectedChat) => {
    //   if (selectedChat) {
    //     await this.chatManager.setActiveChat(selectedChat.id);
    //   }
    // }).open();
  }

  async renameActiveChat() {
    if (!this.chatManager) {
      this.logger.error("Cannot rename chat: ChatManager not available.");
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
        
        // Використовуємо метод менеджера для перейменування
        const success = await this.chatManager.renameChat(chatId, trimmedName);
        if (success) {
          // Повідомлення показується всередині renameChat
          // new Notice(`Chat renamed to "${trimmedName}".`);
        } else {
          // Повідомлення про помилку також показується всередині renameChat
          this.logger.error(`Rename failed for chat ${chatId} via renameChat method.`);
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
      this.logger.error("Cannot delete chat: ChatManager not available.");
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
        
        const success = await this.chatManager.deleteChat(chatId); // Використовуємо існуючий метод
        if (success) {
          // Повідомлення показується в deleteChat
          // new Notice(`Chat "${chatName}" deleted.`);
        } else {
          // Повідомлення про помилку показується в deleteChat
          this.logger.error(`Deletion failed for chat ${chatId} via deleteChat method.`);
        }
      }
    ).open();
  }

  // Обробник зміни активного чату (для збереження ID)
  private async handleActiveChatChangedLocally(data: { chatId: string | null; chat: Chat | null }) {
    // Цей обробник викликається ПІСЛЯ того, як ChatManager змінив активний чат
    // і згенерував подію "active-chat-changed", на яку підписаний View
    if (this.settings.saveMessageHistory) {
      
      await this.saveDataKey(ACTIVE_CHAT_ID_KEY, data.chatId);
    } else {
      // Якщо історія вимкнена, можливо, варто видалити збережений ID?
      // await this.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
      
    }
  }

  // Пошук імені ролі (з виправленням path.basename)
  findRoleNameByPath(rolePath: string | null | undefined): string {
    if (!rolePath) return "None";

    // Спочатку шукаємо в кеші
    const cachedRole = this.roleListCache?.find(rl => rl.path === rolePath);
    if (cachedRole) {
      // 
      return cachedRole.name;
    }

    // Якщо в кеші немає, отримуємо ім'я з шляху як fallback
    // Це може статися, якщо кеш ще не заповнено або файл було видалено/перейменовано
    
    try {
      const fileName = rolePath.substring(rolePath.lastIndexOf("/") + 1);
      // Видаляємо ".md" надійніше
      const roleName = fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
      return roleName || "Unknown Role"; // Повертаємо "Unknown Role", якщо ім'я порожнє
    } catch (e) {
      this.logger.error(`Could not determine role name for path: ${rolePath}`, e);
      return "Unknown Role"; // Повертаємо заглушку при помилці
    }
  }
} // END OF OllamaPlugin CLASS

// --- Допоміжне Модальне вікно для вибору чату (Приклад) ---
// class ChatSwitcherModal extends FuzzySuggestModal<ChatMetadata> {
//   plugin: OllamaPlugin;
//   chats: ChatMetadata[];
//   onChoose: (result: ChatMetadata | null) => void;

//   constructor(app: App, chats: ChatMetadata[], onChoose: (result: ChatMetadata | null) => void) {
//     super(app);
//     this.chats = chats; // Вже відсортовані за датою
//     this.onChoose = onChoose;
//     this.setPlaceholder("Select a chat to switch to...");
//   }

//   getItems(): ChatMetadata[] {
//     return this.chats;
//   }

//   getItemText(item: ChatMetadata): string {
//      const date = new Date(item.lastModified);
//      const dateString = !isNaN(date.getTime()) ? date.toLocaleString() : 'Invalid Date';
//     return `${item.name} (Last modified: ${dateString})`;
//   }

//   onChooseItem(item: ChatMetadata, evt: MouseEvent | KeyboardEvent): void {
//     this.onChoose(item);
//   }
// }
