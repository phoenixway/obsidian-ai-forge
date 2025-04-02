import { Plugin, WorkspaceLeaf, Notice, normalizePath } from "obsidian"; import { OllamaView, VIEW_TYPE_OLLAMA, MessageRole } from "./ollamaView";
import { OllamaSettingTab, DEFAULT_SETTINGS, OllamaPluginSettings } from "./settings";
import { RagService } from "./ragService";
import { ApiService } from "./apiServices";
import { PromptService } from './promptService';
import { MessageService } from "./messageService"; // MessageType removed from import

interface RAGDocument {
  id: string;
  content: string;
  metadata: {
    source: string;
    path: string;
  };
}

interface Embedding {
  documentId: string;
  vector: number[];
}

export default class OllamaPlugin extends Plugin {
  settings: OllamaPluginSettings;
  settingTab: OllamaSettingTab;
  view: OllamaView | null = null;
  ragService: RagService;
  apiService: ApiService;
  promptService: PromptService;
  messageService: MessageService;
  private eventHandlers: Record<string, Array<(data: any) => any>> = {};

  documents: RAGDocument[] = [];
  embeddings: Embedding[] = [];

  on(event: string, callback: (data: any) => any): () => void {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(callback);
    return () => {
      this.eventHandlers[event] = this.eventHandlers[event].filter(
        handler => handler !== callback
      );
    };
  }

  emit(event: string, data?: any): void {
    const handlers = this.eventHandlers[event];
    if (handlers) {

      handlers.slice().forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.error(`Error in event handler for ${event}:`, e);
        }
      });
    }
  }

  async onload() {
    console.log("Ollama Plugin Loaded!");

    await this.loadSettings();

    this.apiService = new ApiService(this); // Передаємо весь екземпляр плагіна
    this.ragService = new RagService(this);
    this.promptService = new PromptService(this);
    this.messageService = new MessageService(this);

    this.registerView(VIEW_TYPE_OLLAMA, (leaf) => {
      console.log("OllamaPlugin: Registering new view instance.");
      this.view = new OllamaView(leaf, this);
      this.messageService.setView(this.view);
      if (this.apiService) {
        this.apiService.setOllamaView(this.view);
      }
      return this.view;
    });

    this.apiService.on('connection-error', (error) => {
      console.error("Ollama connection error event received:", error);
      if (this.view) {
        this.view.internalAddMessage(
          "error",
          `Failed to connect to Ollama: ${error.message}. Please check settings.`
        );
      } else {
        new Notice(`Failed to connect to Ollama: ${error.message}`);
        console.log("Ollama connection error: View not available to display message.");
      }
    });

    this.addRibbonIcon("message-square", "Open Ollama Chat", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-ollama-view",
      name: "Open Ollama Chat",
      callback: () => {
        this.activateView();
      },
    });

    this.addCommand({
      id: 'change-model',
      name: 'Change Ollama Model (Example)',
      callback: async () => {
        const newModel = "llama3:latest"; // Replace with actual selection logic
        console.log(`Changing model to ${newModel}`);
        this.settings.modelName = newModel;
        await this.saveSettings();
        this.emit('model-changed', newModel);
      }
    });

    this.addCommand({
      id: "index-rag-documents",
      name: "Index documents for RAG",
      callback: async () => {
        await this.ragService.indexDocuments();
      },
    });

    this.addCommand({
      id: "clear-ollama-history",
      name: "Clear Ollama Chat History",
      callback: async () => {
        await this.clearMessageHistory();
      },
    });

    this.settingTab = new OllamaSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.ragEnabled) {
        setTimeout(() => {
          console.log("OllamaPlugin: RAG enabled, starting initial index.");
          this.ragService.indexDocuments();
        }, 5000);
      }
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (this.settings.ragEnabled) {
          this.debounceIndexUpdate();
        }
      })
    );
  }

  onunload() {
    console.log("Ollama Plugin Unloaded!");
    this.app.workspace.getLeavesOfType(VIEW_TYPE_OLLAMA).forEach((leaf) => {
      leaf.detach();
    });
    if (this.indexUpdateTimeout) {
      clearTimeout(this.indexUpdateTimeout);
    }
  }

  updateApiService() {
    if (this.apiService) {
      this.apiService.setBaseUrl(this.settings.ollamaServerUrl);
    }
  }

  private indexUpdateTimeout: NodeJS.Timeout | null = null;
  private debounceIndexUpdate() {
    if (this.indexUpdateTimeout) {
      clearTimeout(this.indexUpdateTimeout);
    }
    this.indexUpdateTimeout = setTimeout(() => {
      console.log("OllamaPlugin: Debounced RAG index update triggered.");
      this.ragService.indexDocuments();
      this.indexUpdateTimeout = null;
    }, 30000);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_OLLAMA);

    if (existingLeaves.length > 0) {
      leaf = existingLeaves[0];
      console.log("OllamaPlugin: Found existing view leaf.");
    } else {
      console.log("OllamaPlugin: No existing view leaf found, creating new one.");
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_OLLAMA, active: true });
      console.log("OllamaPlugin: New view leaf created.");
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
      const viewInstance = leaf.view;
      if (viewInstance instanceof OllamaView) {
        this.view = viewInstance;
        this.messageService.setView(this.view);
        if (this.apiService) {
          this.apiService.setOllamaView(this.view);
        }
        console.log("OllamaPlugin: View activated and services linked.");
      } else {
        console.error("OllamaPlugin: Leaf revealed, but view instance is not of type OllamaView?");
      }
    } else {
      console.error("OllamaPlugin: Failed to get or create a leaf for the view.");
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateApiService();
    console.log("OllamaPlugin: Settings saved.");
  }
  // main.ts (within OllamaPlugin class)

  /**
   * Saves the provided message history (as a JSON string) to the history file.
   * Handles backup creation (only when saving non-empty history),
   * history trimming based on size limit, and file writing.
   * This function is primarily called by OllamaView when its internal state changes,
   * or internally by clearMessageHistory (now deprecated for clearing, uses _deleteHistoryFile instead).
   */
  async saveMessageHistory(messagesJsonString: string) {
    // 1. Check if saving is enabled in settings
    if (!this.settings.saveMessageHistory) {
      // console.log("[Ollama Save] Saving history disabled in settings.");
      return; // Exit if saving is disabled
    }

    // 2. Get necessary variables (adapter, paths)
    const adapter = this.app.vault.adapter;
    const pluginConfigDir = this.manifest.dir;
    if (!pluginConfigDir) {
      console.error("OllamaPlugin: Could not determine plugin directory path for saving."); // English error
      new Notice("Error: Cannot determine plugin directory path for saving history."); // English notice
      return;
    }
    const relativeLogPath = `${pluginConfigDir}/chat_history.json`;
    const logPath = normalizePath(relativeLogPath); // Use normalizePath

    console.log(`[Ollama Save] Preparing to save history to ${logPath}`); // English log
    // console.log(`[Ollama Save] Received data string (length ${messagesJsonString.length}):`, messagesJsonString.substring(0, 200) + "...");

    try {
      let dataToWrite = messagesJsonString;
      let finalSizeKB = dataToWrite.length / 1024;

      // 3. Handle potential trimming ONLY if NOT clearing history
      // (The check for "[]" is implicitly handled as it won't exceed the limit)
      if (dataToWrite.trim() !== "[]" && finalSizeKB > this.settings.logFileSizeLimit) {
        console.log(`[Ollama Save] History size (${finalSizeKB.toFixed(2)}KB) exceeds limit (${this.settings.logFileSizeLimit}KB). Trimming oldest messages.`); // English log
        try {
          let parsedMessages = JSON.parse(dataToWrite);
          if (!Array.isArray(parsedMessages)) {
            throw new Error("History data is not an array."); // English error
          }

          // Trim oldest messages (from the beginning of the array) until size limit is met
          while ((JSON.stringify(parsedMessages).length / 1024) > this.settings.logFileSizeLimit && parsedMessages.length > 1) {
            parsedMessages.shift(); // Remove the oldest message
          }
          // Ensure we don't save an empty array if trimming removed everything but shouldn't have
          dataToWrite = parsedMessages.length > 0 ? JSON.stringify(parsedMessages) : "[]";
          finalSizeKB = dataToWrite.length / 1024;
          console.log(`[Ollama Save] History trimmed. New size: ${finalSizeKB.toFixed(2)}KB`); // English log
        } catch (e) {
          console.error("[Ollama Save] Error parsing history for trimming. Resetting history file content:", e); // English error
          // If parsing/trimming fails, maybe reset to empty to prevent corrupted state? Or just skip saving?
          // For safety, let's reset. User might lose history, but avoids corrupted file.
          dataToWrite = "[]";
          finalSizeKB = dataToWrite.length / 1024;
          new Notice("Error trimming history file. History might be reset."); // English notice
        }
      }

      // 4. Backup Logic: Backup *before* overwriting, ONLY if file exists AND we are saving actual content (not "[]")
      const fileExists = await adapter.exists(logPath);
      if (fileExists && dataToWrite.trim() !== "[]") { // Do not backup when clearing
        try {
          // console.log("[Ollama Save] Backing up old history file before overwriting.");
          const relativeBackupPath = relativeLogPath + ".backup";
          const backupPath = normalizePath(relativeBackupPath); // Normalize backup path
          if (await adapter.exists(backupPath)) {
            await adapter.remove(backupPath); // Remove old backup first
          }
          await adapter.copy(logPath, backupPath); // Create new backup
          // console.log("[Ollama Save] Backup created successfully.");
        } catch (backupError) {
          console.error("[Ollama Save] Failed to create history backup:", backupError); // English error
          // Continue saving even if backup fails? Yes, probably better than losing current state.
          new Notice("Warning: Failed to create history backup."); // English notice
        }
      }

      // 5. Write final data (original, cleared, or trimmed)
      // console.log(`[Ollama Save] Writing history (size: ${finalSizeKB.toFixed(2)}KB) to ${logPath}`);
      // console.log(`[Ollama Save] Final data to write (length ${dataToWrite.length}):`, dataToWrite.substring(0, 200) + "...");
      await adapter.write(logPath, dataToWrite);
      console.log("[Ollama Save] Write operation completed."); // English log

    } catch (error) {
      console.error("[Ollama Save] Failed to save message history:", error); // English error
      new Notice("Error saving chat history."); // English notice
    }
  }

  async loadMessageHistory(): Promise<any[]> {
    if (!this.settings.saveMessageHistory) {
      return [];
    }

    const adapter = this.app.vault.adapter;
    const pluginConfigDir = this.manifest.dir;
    if (!pluginConfigDir) {
      console.error("OllamaPlugin: Could not determine plugin directory path for loading.");
      return [];
    }
    // Construct path relative to vault root
    const relativeLogPath = `${pluginConfigDir}/chat_history.json`;
    // Normalize using the imported utility function
    const logPath = normalizePath(relativeLogPath);

    // console.log(`OllamaPlugin: Attempting to load history from vault path: ${logPath}`);
    try {
      if (!(await adapter.exists(logPath))) {
        // console.log("OllamaPlugin: History file does not exist at:", logPath);
        return [];
      }

      const data = await adapter.read(logPath);
      if (!data || data.trim() === "" || data.trim() === "[]") {
        // console.log("OllamaPlugin: History file is empty or contains only '[]'.");
        return [];
      }

      const parsedData = JSON.parse(data);

      if (Array.isArray(parsedData)) {
        console.log(`OllamaPlugin: Successfully parsed ${parsedData.length} messages from history file: ${logPath}.`);
        return parsedData;
      } else {
        console.warn(`OllamaPlugin: Parsed history data from ${logPath} is not an array. Returning empty history.`);
        return [];
      }
    } catch (error) {
      console.error(`OllamaPlugin: Failed to load/parse message history from ${logPath}:`, error);
      // Optionally attempt to load backup here if desired
      return [];
    }
  }

  private async _deleteHistoryFile(): Promise<boolean> {
    const adapter = this.app.vault.adapter;
    const pluginConfigDir = this.manifest.dir;
    if (!pluginConfigDir) {
      console.error("OllamaPlugin: Could not determine plugin directory path for deletion.");
      new Notice("Error: Cannot determine plugin directory for history deletion.");
      return false;
    }
    const relativeLogPath = `${pluginConfigDir}/chat_history.json`;
    const logPath = normalizePath(relativeLogPath);

    try {
      if (await adapter.exists(logPath)) {
        console.log(`[Ollama Clear] Deleting history file: ${logPath}`);
        await adapter.remove(logPath);
        // Також видаляємо бекап, якщо він є
        const backupPath = normalizePath(relativeLogPath + ".backup");
        if (await adapter.exists(backupPath)) {
          await adapter.remove(backupPath);
          console.log(`[Ollama Clear] Deleted backup file: ${backupPath}`);
        }
        console.log(`[Ollama Clear] History file deleted successfully.`);
        return true; // Успіх
      } else {
        console.log(`[Ollama Clear] History file not found, nothing to delete: ${logPath}`);
        return true; // Вважаємо успіхом, бо файлу немає
      }
    } catch (error) {
      console.error(`[Ollama Clear] Failed to delete history file ${logPath}:`, error);
      new Notice("Error deleting chat history file.");
      return false; // Помилка
    }
  }

  async clearMessageHistory() {
    console.log("[Ollama Clear] Clearing message history initiated.");
    // 1. Видаляємо файл історії швидко і без бекапу
    const deleted = await this._deleteHistoryFile();

    // 2. Очищаємо стан і дисплей у View, ЯКЩО файл успішно видалено (або його не було)
    if (deleted && this.view) {
      this.view.clearDisplayAndState(); // Викликаємо метод View для очищення UI та пам'яті
      console.log("[Ollama Clear] Cleared active view display and state.");
      new Notice("Chat history cleared."); // Повідомлення про успіх
    } else if (!deleted) {
      new Notice("Failed to clear chat history file. Please check console logs."); // Повідомлення про помилку видалення
    } else {
      console.log("[Ollama Clear] History file operation completed, view not active.");
      new Notice("Chat history cleared."); // Якщо View не активний, але файл видалено
    }
  }
}