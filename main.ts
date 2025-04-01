import { Plugin } from "obsidian";
import { OllamaView, VIEW_TYPE_OLLAMA } from "./ollamaView";
import { OllamaSettingTab, DEFAULT_SETTINGS, OllamaPluginSettings } from "./settings";
import { RagService } from "./ragService";
import { ApiService } from "./apiServices";
import { PromptService } from './promptService';
import { MessageService, MessageType } from "./messageService";


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
  private eventHandlers: Record<string, Array<(data: any) => any>> = {};
  documents: RAGDocument[] = [];
  embeddings: Embedding[] = [];
  messageService: MessageService;

  on(event: string, callback: (data: any) => any): () => void {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(callback);

    // Return a function to remove this specific event handler
    return () => {
      this.eventHandlers[event] = this.eventHandlers[event].filter(
        handler => handler !== callback
      );
    };
  }

  emit(event: string, data?: any): void {
    const handlers = this.eventHandlers[event];
    if (handlers) {
      handlers.forEach(handler => handler(data));
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
      this.view = new OllamaView(leaf, this);
      this.messageService.setView(this.view);
      return this.view;
    });

    this.addCommand({
      id: 'change-model',
      name: 'Change Ollama Model',
      callback: async () => {
        // Logic to change model...
        const newModel = "llama2:13b"; // Example model change
        this.settings.modelName = newModel;
        await this.saveSettings();

        // Notify about the model change
        // this.messageService.addSystemMessage(`Model changed to: ${newModel}`);

        // Emit model-changed event (to update UI)
        this.emit('model-changed', newModel);
        // this.messageService.addSystemMessage(`Model changed to: ${newModel}`);

      }
    });
    this.apiService.on('connection-error', (error) => {
      this.messageService.addMessage(
        MessageType.ERROR,
        `Failed to connect to Ollama: ${error.message}`
      );
    });
    this.addRibbonIcon("message-square", "Відкрити Ollama", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-ollama-view",
      name: "Відкрити Ollama Chat",
      callback: () => {
        this.activateView();
      },
    });

    // Add command to index documents
    this.addCommand({
      id: "index-rag-documents",
      name: "Індексувати документи для RAG",
      callback: async () => {
        await this.ragService.indexDocuments();
      },
    });

    this.settingTab = new OllamaSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.app.workspace.onLayoutReady(() => {
      // Check if view already exists
      const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_OLLAMA)[0];

      if (!existingLeaf) {
        this.activateView();
      } else {
        // console.log("Ollama view already exists, not creating a new one");
      }

      // Start indexing if RAG is enabled
      if (this.settings.ragEnabled) {
        this.ragService.indexDocuments();
      }
    });

    // Register for vault changes to update index
    this.registerEvent(
      this.app.vault.on("modify", () => {
        if (this.settings.ragEnabled) {
          // Debounce index updates
          this.debounceIndexUpdate();
        }
      })
    );
  }

  // Update API service when settings change
  updateApiService() {
    this.apiService.setBaseUrl(this.settings.ollamaServerUrl);
  }

  // Add debouncing to prevent excessive indexing
  private indexUpdateTimeout: NodeJS.Timeout | null = null;
  private debounceIndexUpdate() {
    if (this.indexUpdateTimeout) {
      clearTimeout(this.indexUpdateTimeout);
    }

    this.indexUpdateTimeout = setTimeout(() => {
      this.ragService.indexDocuments();
      this.indexUpdateTimeout = null;
    }, 30000); // Reindex after 30 seconds of inactivity
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_OLLAMA)[0];

    if (!leaf) {
      console.log("Creating new Ollama view leaf");
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf();
      await leaf.setViewState({ type: VIEW_TYPE_OLLAMA, active: true });
    } else {
      console.log("Ollama view leaf already exists");
    }

    workspace.revealLeaf(leaf);

    if (this.view) {
      this.messageService.setView(this.view);
    }

    return leaf;
  } async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateApiService(); // Update API service URL when settings change
  }

  getOllamaApiUrl() {
    return this.settings.ollamaServerUrl || DEFAULT_SETTINGS.ollamaServerUrl;
  }

  async saveMessageHistory(messagesJsonString: string): Promise<void> { // Renamed param for clarity
    if (!this.settings.saveMessageHistory) return;

    const basePath = this.app.vault.configDir + "/plugins/obsidian-ollama-duet";
    const logPath = basePath + "/chat_history.json";
    const adapter = this.app.vault.adapter;

    try {
      console.log("OllamaPlugin: Attempting to save data:", messagesJsonString);

      // --- Optional: Backup Logic (Keep if desired, but simplify main save) ---
      const fileExists = await adapter.exists(logPath);
      if (fileExists) {
        const stat = await adapter.stat(logPath);
        const fileSizeKB = stat?.size ? stat.size / 1024 : 0;

        if (fileSizeKB > this.settings.logFileSizeLimit) {
          console.log(`OllamaPlugin: History file size (<span class="math-inline">\{fileSizeKB\}KB\) exceeds limit \(</span>{this.settings.logFileSizeLimit}KB). Backing up.`);
          const backupPath = logPath + ".backup";
          try {
            if (await adapter.exists(backupPath)) {
              await adapter.remove(backupPath);
            }
            await adapter.copy(logPath, backupPath);
            console.log("OllamaPlugin: Backup created at", backupPath);
          } catch (backupError) {
            console.error("OllamaPlugin: Failed to create backup:", backupError);
            // Decide if we should proceed with overwrite even if backup failed
          }
          // After backup (or failed backup), we still overwrite the main file below
        }
      }
      // --- End of Optional Backup Logic ---

      // --- Simple Overwrite ---
      await adapter.write(logPath, messagesJsonString);
      console.log("OllamaPlugin: History saved successfully to", logPath);

    } catch (error) {
      console.error("OllamaPlugin: Failed to save message history:", error);
      // Optionally notify the user via Notice if saving fails critically
      // new Notice("Error saving chat history.");
    }
  }

  async loadMessageHistory(): Promise<any[]> { // Return type should be array
    if (!this.settings.saveMessageHistory) return [];

    const logPath = this.app.vault.configDir + "/plugins/obsidian-ollama-duet/chat_history.json";
    const adapter = this.app.vault.adapter;
    console.log("OllamaPlugin: Attempting to load data from", logPath); // Keep log

    try {
      if (!(await adapter.exists(logPath))) {
        console.log("OllamaPlugin: History file does not exist, returning empty array.");
        return [];
      }

      const data = await adapter.read(logPath);
      console.log("OllamaPlugin: Data loaded, length:", data.length); // Log length

      // Handle empty or explicitly empty array string
      if (!data || data.trim() === "" || data.trim() === "[]") {
        console.log("OllamaPlugin: History file is empty or contains '[]', returning empty array.");
        return [];
      }

      // Parse the data
      const messages = JSON.parse(data);
      // Optional: Validate if it's actually an array
      if (!Array.isArray(messages)) {
        console.error("OllamaPlugin: Parsed history data is not an array. Returning empty array.");
        // Optionally: Try to recover/backup the corrupted file
        return [];
      }
      console.log("OllamaPlugin: History parsed successfully, messages count:", messages.length);
      return messages;

    } catch (error) {
      console.error("OllamaPlugin: Failed to load/parse message history:", error);
      // Optionally: Try to backup the corrupted file before returning empty
      // await this.backupCorruptedHistory(logPath);
      return []; // Return empty array on any error
    }
  }
  // Optional helper to backup corrupted file
  // async backupCorruptedHistory(logPath: string) { ... }

  async clearMessageHistory() {
    try {
      const logPath = this.app.vault.configDir + "/plugins/obsidian-ollama-duet/chat_history.json";
      const adapter = this.app.vault.adapter;

      if (await adapter.exists(logPath)) {
        await adapter.remove(logPath);
        // Clear history from view
        if (this.view) {
          this.view.clearChatContainer();
        }
      }
    } catch (error) {
      console.error("Failed to clear message history:", error);
    }
  }
}