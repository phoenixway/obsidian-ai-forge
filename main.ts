// main.ts
import {
  Plugin,
  WorkspaceLeaf,
  Notice,
  normalizePath,
  TFile,
  TFolder,
  Vault, // Vault might be implicitly used via app.vault
  DataAdapter,
  debounce,
} from "obsidian";
import { OllamaView, VIEW_TYPE_OLLAMA, MessageRole } from "./ollamaView"; // Assuming MessageRole is needed elsewhere or view exports it
import { OllamaSettingTab, DEFAULT_SETTINGS, OllamaPluginSettings } from "./settings";
import { RagService } from "./ragService";
import { ApiService } from "./apiServices";
import { PromptService } from './promptService';
import { MessageService } from "./messageService";
import { exec, ExecException } from 'child_process'; // For executing system commands (Requires Node.js)
import * as path from 'path'; // For path manipulation

// Type for role information used in menus etc.
export interface RoleInfo {
  name: string; // Role name from filename
  path: string; // Full normalized path to the .md file
  isCustom: boolean; // Is it from the user's folder?
}

// Interfaces (kept for context, might move to types.ts)
interface RAGDocument { id: string; content: string; metadata: { source: string; path: string; }; }
interface Embedding { documentId: string; vector: number[]; }

export default class OllamaPlugin extends Plugin {
  settings: OllamaPluginSettings;
  settingTab: OllamaSettingTab;
  view: OllamaView | null = null; // Reference to the active view instance
  ragService: RagService;
  apiService: ApiService;
  promptService: PromptService;
  messageService: MessageService;
  // Simple event emitter
  private eventHandlers: Record<string, Array<(data: any) => any>> = {};
  // Cache for the list of available roles
  private roleListCache: RoleInfo[] | null = null;
  // Debounce timer for clearing role cache on file changes
  private roleCacheClearTimeout: NodeJS.Timeout | null = null;
  // Debounce timer for RAG index updates
  private indexUpdateTimeout: NodeJS.Timeout | null = null;

  // RAG data (Placeholders, consider moving to RagService)
  documents: RAGDocument[] = [];
  embeddings: Embedding[] = [];


  // --- Event Emitter Methods ---
  on(event: string, callback: (data: any) => any): () => void {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(callback);
    // Return an unsubscribe function
    return () => {
      this.eventHandlers[event] = this.eventHandlers[event]?.filter(
        handler => handler !== callback
      );
      if (this.eventHandlers[event]?.length === 0) {
        delete this.eventHandlers[event];
      }
    };
  }

  emit(event: string, data?: any): void {
    const handlers = this.eventHandlers[event];
    if (handlers) {
      // Use slice to prevent issues if a handler unregisters itself during iteration
      handlers.slice().forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.error(`[OllamaPlugin] Error in event handler for ${event}:`, e);
        }
      });
    }
  }
  // --- End Event Emitter Methods ---


  async onload() {
    console.log("Loading Ollama Plugin..."); // English Log

    await this.loadSettings(); // Load settings first, includes migration

    // Initialize services, passing the plugin instance ('this')
    this.apiService = new ApiService(this);
    this.ragService = new RagService(this);
    this.promptService = new PromptService(this);
    this.messageService = new MessageService(this);

    // Register the view
    this.registerView(VIEW_TYPE_OLLAMA, (leaf) => {
      console.log("OllamaPlugin: Registering new view instance."); // English Log
      this.view = new OllamaView(leaf, this);
      this.messageService.setView(this.view); // Link service to view
      this.apiService.setOllamaView(this.view); // Link API service to view
      return this.view;
    });

    // Register API Service Event Handler for connection errors
    this.apiService.on('connection-error', (error) => {
      console.error("[OllamaPlugin] Ollama connection error event received:", error); // English Log
      if (this.view) {
        // Display error in the view if available
        this.view.internalAddMessage(
          "error",
          `Failed to connect to Ollama: ${error.message}. Please check settings.` // English Message
        );
      } else {
        // Fallback to Notice if view isn't open
        new Notice(`Failed to connect to Ollama: ${error.message}`); // English Notice
        console.log("[OllamaPlugin] Ollama connection error: View not available to display message."); // English Log
      }
    });

    // Add Ribbon Icon
    this.addRibbonIcon("message-square", "Open Ollama Chat", () => { // English Tooltip
      this.activateView();
    });

    // Add Commands
    this.addCommand({
      id: "open-ollama-view",
      name: "Open Ollama Chat", // English Command Name
      callback: () => {
        this.activateView();
      },
    });

    this.addCommand({
      id: "index-rag-documents",
      name: "Index documents for RAG", // English Command Name
      callback: async () => {
        await this.ragService.indexDocuments(); // Assumes indexDocuments shows Notices
      },
    });

    this.addCommand({
      id: "clear-ollama-history",
      name: "Clear Ollama Chat History", // English Command Name
      callback: async () => {
        await this.clearMessageHistory(); // Calls the updated clear method
      },
    });

    this.addCommand({
      id: "refresh-ollama-roles",
      name: "Refresh Ollama Roles List",
      callback: async () => {
        await this.listRoleFiles(true); // Примусово оновлюємо кеш
        this.emit('roles-updated');    // Генеруємо подію, View відреагує, якщо потрібно
        new Notice("Role list refreshed.");
      }
    });


    // Add Settings Tab
    this.settingTab = new OllamaSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    // On Layout Ready Logic
    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.ragEnabled) {
        // Use a timeout to allow Obsidian UI to settle before potentially heavy indexing
        setTimeout(() => {
          console.log("[OllamaPlugin] RAG enabled, starting initial index."); // English Log
          this.ragService?.indexDocuments();
        }, 5000); // Delay indexing slightly
      }
    });



    // Register listeners for file modifications/deletions/renames for RAG and Roles
    // Debounce clearing role cache
    const debouncedRoleClear = debounce(() => {
      console.log("[Ollama] Role directory changed (debounced), clearing role cache and emitting event.");
      this.roleListCache = null; // Скидаємо кеш
      this.emit('roles-updated'); // Генеруємо подію
    }, 1500, true); // 1.5 сек debounce, спрацьовує на початку

    // Окремі обробники для кожної події Vault
    const handleModify = (file: TFile) => {
      // Подія 'modify' спрацьовує тільки для файлів (TFile)
      this.handleFileChange(file.path, debouncedRoleClear);
    };

    const handleDelete = (file: TFile | TFolder) => {
      // Подія 'delete' спрацьовує для файлів та папок
      this.handleFileChange(file.path, debouncedRoleClear);
    };

    const handleRename = (file: TFile | TFolder, oldPath: string) => {
      // Подія 'rename' спрацьовує для файлів та папок
      // Реагуємо на новий шлях 'file.path', а також можна реагувати на старий 'oldPath'
      this.handleFileChange(file.path, debouncedRoleClear);
      this.handleFileChange(oldPath, debouncedRoleClear); // Перевіряємо і старий шлях
    };

    const handleCreate = (file: TFile | TFolder) => {
      // Подія 'create' спрацьовує для файлів та папок
      this.handleFileChange(file.path, debouncedRoleClear);
    };


    // Реєструємо обробники з правильними типами
    this.registerEvent(this.app.vault.on("modify", handleModify));
    this.registerEvent(this.app.vault.on("delete", handleDelete));
    this.registerEvent(this.app.vault.on("rename", handleRename));
    this.registerEvent(this.app.vault.on("create", handleCreate));
  }

  private handleFileChange(changedPath: string, debouncedRoleClear: () => void) {
    const normalizedChangedPath = normalizePath(changedPath);
    const userRolesPath = this.settings.userRolesFolderPath ? normalizePath(this.settings.userRolesFolderPath) : null;
    const defaultRolesPath = normalizePath(this.manifest.dir + '/roles');
    if ((userRolesPath && normalizedChangedPath.startsWith(userRolesPath + '/')) || normalizedChangedPath.startsWith(defaultRolesPath + '/')) {
      if (normalizedChangedPath.toLowerCase().endsWith('.md')) {
        debouncedRoleClear(); // Викликаємо передану debounced функцію
      }
    }
    const ragFolderPath = this.settings.ragFolderPath ? normalizePath(this.settings.ragFolderPath) : null;
    if (this.settings.ragEnabled && ragFolderPath && normalizedChangedPath.startsWith(ragFolderPath + '/')) { this.debounceIndexUpdate(); }
  }



  // Called when plugin is unloaded
  onunload() {
    console.log("Unloading Ollama Plugin..."); // English Log
    // Clean up: remove view, clear timeouts, clear caches
    this.app.workspace.getLeavesOfType(VIEW_TYPE_OLLAMA).forEach((leaf) => {
      leaf.detach();
    });
    if (this.indexUpdateTimeout) { clearTimeout(this.indexUpdateTimeout); }
    if (this.roleCacheClearTimeout) { clearTimeout(this.roleCacheClearTimeout); } // Clear role debounce timer
    this.promptService?.clearModelDetailsCache?.(); // Clear model details cache
    this.roleListCache = null; // Clear role list cache
    // Event listeners registered with this.registerEvent are handled automatically
  }


  // --- Service Updates ---
  // Update API service when settings change (called from saveSettings)
  updateApiService() {
    if (this.apiService) {
      this.apiService.setBaseUrl(this.settings.ollamaServerUrl);
      // Clear model details cache if URL changes, as available models might differ
      this.promptService?.clearModelDetailsCache();
      // Clear role cache as well? Probably not needed unless role files depend on server? No.
    }
  }


  // --- Debounce Indexing ---
  private debounceIndexUpdate() {
    if (this.indexUpdateTimeout) {
      clearTimeout(this.indexUpdateTimeout);
    }
    this.indexUpdateTimeout = setTimeout(() => {
      console.log("[OllamaPlugin] Debounced RAG index update triggered."); // English Log
      this.ragService?.indexDocuments();
      this.indexUpdateTimeout = null;
    }, 30000); // 30 seconds delay
  }


  // --- View Activation ---
  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_OLLAMA);

    if (existingLeaves.length > 0) {
      leaf = existingLeaves[0];
      console.log("[OllamaPlugin] Found existing view leaf."); // English Log
    } else {
      console.log("[OllamaPlugin] No existing view leaf found, creating new one."); // English Log
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      if (leaf) { // Ensure leaf was created
        await leaf.setViewState({ type: VIEW_TYPE_OLLAMA, active: true });
        console.log("[OllamaPlugin] New view leaf created."); // English Log
      } else {
        console.error("[OllamaPlugin] Failed to get or create a leaf."); // English Error
        new Notice("Failed to open Ollama Chat view."); // English Notice
        return;
      }
    }

    // Ensure the leaf is revealed and the view instance is correctly linked
    if (leaf) {
      workspace.revealLeaf(leaf);
      const viewInstance = leaf.view;
      if (viewInstance instanceof OllamaView) {
        this.view = viewInstance; // Update internal reference
        this.messageService.setView(this.view); // Ensure service has correct view ref
        this.apiService.setOllamaView(this.view); // Ensure API service has correct view ref
        console.log("[OllamaPlugin] View activated and services linked."); // English Log
      } else {
        console.error("[OllamaPlugin] Leaf revealed, but view instance is not OllamaView?"); // English Error
      }
    }
  }


  // --- Settings Management ---
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // --- Settings Migration ---
    // Migrate old role path setting if necessary
    if ((this.settings as any).customRoleFilePath && !this.settings.selectedRolePath) {
      console.log("[Ollama] Migrating 'customRoleFilePath' to 'selectedRolePath'."); // English Log
      this.settings.selectedRolePath = (this.settings as any).customRoleFilePath;
      // Don't delete the old key immediately, saveSettings will handle it
    }
    // Ensure removed keys are not present after loading defaults and saved data
    delete (this.settings as any).customRoleFilePath;
    delete (this.settings as any).useDefaultRoleDefinition;
    // -------------------------
  }

  async saveSettings() {
    // Ensure removed keys are definitely gone before saving
    delete (this.settings as any).customRoleFilePath;
    delete (this.settings as any).useDefaultRoleDefinition;

    await this.saveData(this.settings);
    this.updateApiService(); // Update API service on save
    this.roleListCache = null; // Clear role cache when role folder path might have changed
    this.promptService?.clearRoleCache?.(); // Clear role content cache as well
    console.log("OllamaPlugin: Settings saved."); // English Log
    // Optionally emit a generic settings-changed event if needed
    // this.emit('settings-changed', this.settings);
  }


  // --- History Persistence ---

  // saveMessageHistory: Handles saving actual history content, includes trimming and backup (modified to skip backup on clear)
  async saveMessageHistory(messagesJsonString: string) {
    if (!this.settings.saveMessageHistory) return;
    const adapter = this.app.vault.adapter; const pluginConfigDir = this.manifest.dir; if (!pluginConfigDir) { console.error("[Ollama Save] Cannot determine plugin directory."); new Notice("Error saving history: Cannot find plugin directory."); return; }
    const relativeLogPath = `${pluginConfigDir}/chat_history.json`; const logPath = normalizePath(relativeLogPath);
    // console.log(`[Ollama Save] Preparing to save history to ${logPath}`);
    try {
      let dataToWrite = messagesJsonString; let finalSizeKB = dataToWrite.length / 1024;
      const isClearing = dataToWrite.trim() === "[]";
      if (!isClearing && finalSizeKB > this.settings.logFileSizeLimit) {
        console.log(`[Ollama Save] History size (${finalSizeKB.toFixed(2)}KB) > limit (${this.settings.logFileSizeLimit}KB). Trimming.`);
        try {
          let parsed = JSON.parse(dataToWrite); if (!Array.isArray(parsed)) throw new Error("History not array.");
          while ((JSON.stringify(parsed).length / 1024) > this.settings.logFileSizeLimit && parsed.length > 1) { parsed.shift(); }
          dataToWrite = parsed.length > 0 ? JSON.stringify(parsed) : "[]"; finalSizeKB = dataToWrite.length / 1024;
          console.log(`[Ollama Save] History trimmed. New size: ${finalSizeKB.toFixed(2)}KB`);
        } catch (e) { console.error("[Ollama Save] Error parsing/trimming history. Resetting:", e); dataToWrite = "[]"; finalSizeKB = dataToWrite.length / 1024; new Notice("Error trimming history file. History may be reset."); }
      }
      const fileExists = await adapter.exists(logPath);
      if (fileExists && !isClearing) { // Backup only if file exists and not clearing
        try {
          const backupPath = normalizePath(relativeLogPath + ".backup");
          if (await adapter.exists(backupPath)) await adapter.remove(backupPath);
          await adapter.copy(logPath, backupPath);
          // console.log("[Ollama Save] Backup created.");
        } catch (backupError) { console.error("[Ollama Save] Failed to create history backup:", backupError); new Notice("Warning: Failed to create history backup."); }
      }
      await adapter.write(logPath, dataToWrite);
      // console.log("[Ollama Save] Write operation completed.");
    } catch (error) { console.error("[Ollama Save] Failed to save message history:", error); new Notice("Error saving chat history."); }
  }

  // loadMessageHistory: Loads history from file
  async loadMessageHistory(): Promise<any[]> {
    if (!this.settings.saveMessageHistory) return [];
    const adapter = this.app.vault.adapter; const pluginConfigDir = this.manifest.dir; if (!pluginConfigDir) { console.error("[Ollama Load] Cannot determine plugin directory."); return []; }
    const relativeLogPath = `${pluginConfigDir}/chat_history.json`; const logPath = normalizePath(relativeLogPath);
    try {
      if (!(await adapter.exists(logPath))) return [];
      const data = await adapter.read(logPath); if (!data?.trim() || data.trim() === '[]') return [];
      const parsedData = JSON.parse(data);
      if (Array.isArray(parsedData)) { /* console.log(`[Ollama Load] Parsed ${parsedData.length} messages.`); */ return parsedData; }
      else { console.warn("[Ollama Load] Parsed history data is not an array."); return []; }
    } catch (error) { console.error("[Ollama Load] Failed to load/parse message history:", error); new Notice("Error loading chat history. File might be corrupt."); return []; }
  }

  // clearMessageHistory: Clears history by overwriting file with "[]" and clearing view state
  async clearMessageHistory() {
    console.log("[Ollama Clear] Clearing message history initiated.");
    try {
      await this.saveMessageHistory("[]"); // Overwrite file with empty array (modified save doesn't backup)
      console.log("[Ollama Clear] History file overwrite with '[]' completed.");

      if (this.view) {
        this.view.clearDisplayAndState();
        console.log("[Ollama Clear] Cleared active view display and state.");
      } else {
        console.log("[Ollama Clear] Overwrite done, view not active.");
      }
      new Notice("Chat history cleared.");
    } catch (error) {
      console.error("[Ollama Clear] Failed to clear message history (error likely logged in saveMessageHistory):", error);
      new Notice("Failed to clear chat history."); // General notice on failure
    }
  }
  // --- End History Persistence ---


  // --- NEW METHOD: List Role Files ---
  async listRoleFiles(forceRefresh: boolean = false): Promise<RoleInfo[]> {
    if (this.roleListCache && !forceRefresh) {
      return this.roleListCache;
    }
    console.log("[Ollama] Fetching and caching role list..."); // English Log

    const roles: RoleInfo[] = [];
    const adapter = this.app.vault.adapter;

    // 1. Default Roles (from plugin folder)
    const defaultRolesDir = normalizePath(this.manifest.dir + '/roles');
    try {
      if (await adapter.exists(defaultRolesDir) && (await adapter.stat(defaultRolesDir))?.type === 'folder') {
        const defaultFiles = await adapter.list(defaultRolesDir);
        for (const filePath of defaultFiles.files) {
          if (filePath.toLowerCase().endsWith('.md')) {
            const fileName = path.basename(filePath);
            const roleName = fileName.substring(0, fileName.length - 3);
            roles.push({ name: roleName, path: filePath, isCustom: false });
          }
        }
      } else { console.log(`[Ollama] Default roles directory not found or not a folder: ${defaultRolesDir}`); } // English Log
    } catch (error) { console.error(`[Ollama] Error listing default roles in ${defaultRolesDir}:`, error); } // English Error

    // 2. User Roles (from settings folder path)
    const userRolesDir = this.settings.userRolesFolderPath?.trim();
    if (userRolesDir) {
      const normalizedUserDir = normalizePath(userRolesDir);
      try {
        if (await adapter.exists(normalizedUserDir) && (await adapter.stat(normalizedUserDir))?.type === 'folder') {
          const userFiles = await adapter.list(normalizedUserDir);
          const addedRoleNames = new Set(roles.map(r => r.name)); // Keep track of names already added
          for (const filePath of userFiles.files) {
            if (filePath.toLowerCase().endsWith('.md')) {
              const fileName = path.basename(filePath);
              const roleName = fileName.substring(0, fileName.length - 3);
              // Add user role only if a default role with the same name doesn't exist
              if (!addedRoleNames.has(roleName)) {
                roles.push({ name: roleName, path: filePath, isCustom: true });
                addedRoleNames.add(roleName); // Mark name as added
              } else {
                console.log(`[Ollama] Skipping user role '${roleName}' as a default role with the same name exists.`); // English Log
              }
            }
          }
        } else { console.warn(`[Ollama] User roles folder path does not exist or is not a folder: ${normalizedUserDir}`); } // English Warning
      } catch (error) { console.error(`[Ollama] Error listing user roles in ${normalizedUserDir}:`, error); } // English Error
    }

    // Sort roles alphabetically by name
    roles.sort((a, b) => a.name.localeCompare(b.name));

    this.roleListCache = roles; // Save to cache
    console.log(`[Ollama] Found ${roles.length} roles.`); // English Log
    return roles;
  }
  // --- END List Role Files Method ---


  // --- NEW METHOD: Execute System Command ---
  async executeSystemCommand(command: string): Promise<{ stdout: string; stderr: string; error: ExecException | null }> {
    console.log(`[Ollama] Executing system command: ${command}`); // English Log
    if (!command || command.trim().length === 0) {
      console.warn("[Ollama] Attempted to execute empty command."); // English Warning
      return { stdout: "", stderr: "Empty command provided.", error: new Error("Empty command") as ExecException };
    }

    // Check if running in a Node.js environment (like desktop Obsidian)
    // @ts-ignore 'process' might not be defined in all Obsidian environments (like mobile potentially)
    if (typeof process === 'undefined' || !process?.versions?.node) {
      console.error("[Ollama] Node.js environment not detected. Cannot execute system commands."); // English Error
      new Notice("Cannot execute system commands in this environment."); // English Notice
      return { stdout: "", stderr: "Node.js environment not available.", error: new Error("Node.js not available") as ExecException };
    }


    return new Promise((resolve) => {
      // Use exec from Node's child_process
      exec(command, (error, stdout, stderr) => {
        if (error) { console.error(`[Ollama] exec error for command "${command}": ${error}`); } // English Error
        if (stderr) { console.error(`[Ollama] exec stderr for command "${command}": ${stderr}`); } // English Error
        if (stdout) { console.log(`[Ollama] exec stdout for command "${command}": ${stdout}`); } // English Log
        resolve({ stdout: stdout.toString(), stderr: stderr.toString(), error });
      });
    });
  }
  // --- END Execute System Command Method ---

} // End of OllamaPlugin class