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

    this.apiService = new ApiService(this.settings.ollamaServerUrl);
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
  async saveMessageHistory(messagesJsonString: string) {
    if (!this.settings.saveMessageHistory) {
      return;
    }

    const adapter = this.app.vault.adapter;
    const pluginConfigDir = this.manifest.dir;
    if (!pluginConfigDir) {
      console.error("OllamaPlugin: Could not determine plugin directory path.");
      new Notice("Error: Could not determine plugin directory path for saving history.");
      return;
    }
    // Construct path relative to vault root
    const relativeLogPath = `${pluginConfigDir}/chat_history.json`;
    // Normalize using the imported utility function
    const logPath = normalizePath(relativeLogPath);

    console.log(`OllamaPlugin: Preparing to save history to vault path: ${logPath}`);

    try {
      let dataToWrite = messagesJsonString;
      let finalSizeKB = dataToWrite.length / 1024;

      if (dataToWrite.trim() === "[]") {
        console.log("OllamaPlugin: Clear operation detected. Writing empty array.");
      }
      else if (finalSizeKB > this.settings.logFileSizeLimit) {
        console.log(`OllamaPlugin: New history size (${finalSizeKB.toFixed(2)}KB) exceeds limit (${this.settings.logFileSizeLimit}KB). Trimming oldest messages.`);
        try {
          let parsedMessages = JSON.parse(dataToWrite);
          if (!Array.isArray(parsedMessages)) {
            throw new Error("History data is not an array.");
          }

          while ((JSON.stringify(parsedMessages).length / 1024) > this.settings.logFileSizeLimit && parsedMessages.length > 1) {
            parsedMessages.shift();
          }
          dataToWrite = parsedMessages.length > 0 ? JSON.stringify(parsedMessages) : "[]";
          finalSizeKB = dataToWrite.length / 1024;
          console.log(`OllamaPlugin: History trimmed. New size: ${finalSizeKB.toFixed(2)}KB`);
        } catch (e) {
          console.error("OllamaPlugin: Error parsing history for trimming. Resetting history:", e);
          dataToWrite = "[]";
          finalSizeKB = dataToWrite.length / 1024;
        }
      }

      const fileExists = await adapter.exists(logPath);
      if (fileExists) {
        try {
          const relativeBackupPath = relativeLogPath + ".backup";
          // Normalize backup path using the imported utility function
          const backupPath = normalizePath(relativeBackupPath);

          if (await adapter.exists(backupPath)) {
            await adapter.remove(backupPath);
          }
          await adapter.copy(logPath, backupPath);
        } catch (backupError) {
          console.error("OllamaPlugin: Failed to create history backup:", backupError);
        }
      }

      await adapter.write(logPath, dataToWrite);
      console.log(`OllamaPlugin: Write operation completed for ${logPath}.`);

    } catch (error) {
      console.error(`OllamaPlugin: Failed to save message history to ${logPath}:`, error);
      new Notice("Error saving chat history.");
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
  async clearMessageHistory() {
    console.log("OllamaPlugin: Clearing message history initiated.");
    try {
      // 1. Save an empty array to the history file (handles backup/overwrite)
      await this.saveMessageHistory("[]");

      // 2. Clear the display and internal state of the active view, if it exists
      if (this.view) {
        this.view.clearDisplayAndState(); // Use the new method
        console.log("OllamaPlugin: Cleared active view display and state.");
      } else {
        console.log("OllamaPlugin: View not active, history file cleared/reset.");
      }
      new Notice("Ollama chat history cleared."); // Notify user of success
    } catch (error) {
      console.error("OllamaPlugin: Failed to clear message history:", error);
      new Notice("Error clearing chat history.");
    }
  }
}