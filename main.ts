import { Plugin, TFile } from "obsidian";
import { OllamaView, VIEW_TYPE_OLLAMA } from "./ollamaView";
import { OllamaSettingTab, DEFAULT_SETTINGS, OllamaPluginSettings } from "./settings";
import { RagService } from "./ragService";
import { ApiService } from "./apiServices";
import { PromptService } from './promptService';


// Interface for document in RAG
interface RAGDocument {
  id: string;
  content: string;
  metadata: {
    source: string;
    path: string;
  };
}

// Interface for embedding vectors
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


  documents: RAGDocument[] = [];
  embeddings: Embedding[] = [];

  async onload() {
    console.log("Ollama Plugin Loaded!");

    await this.loadSettings();

    this.apiService = new ApiService(this.settings.ollamaServerUrl);
    this.ragService = new RagService(this);
    this.promptService = new PromptService(this);

    this.registerView(VIEW_TYPE_OLLAMA, (leaf) => {
      this.view = new OllamaView(leaf, this);
      return this.view;
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
        console.log("Ollama view already exists, not creating a new one");
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

    // Check if view is already open
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_OLLAMA)[0];

    if (!leaf) {
      console.log("Creating new Ollama view leaf");
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf();
      await leaf.setViewState({ type: VIEW_TYPE_OLLAMA, active: true });
    } else {
      console.log("Ollama view leaf already exists");
    }

    workspace.revealLeaf(leaf);
    return leaf;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateApiService(); // Update API service URL when settings change
  }

  getOllamaApiUrl() {
    return this.settings.ollamaServerUrl || DEFAULT_SETTINGS.ollamaServerUrl;
  }

  // Function to save message history
  async saveMessageHistory(messages: string) {
    if (!this.settings.saveMessageHistory) return;

    try {
      // Get the path to the plugin folder
      const basePath = this.app.vault.configDir + "/plugins/obsidian-ollama-duet";
      const logPath = basePath + "/chat_history.json";
      const adapter = this.app.vault.adapter;

      // Check if file exists and its size
      let fileExists = await adapter.exists(logPath);
      let fileSize = 0;

      if (fileExists) {
        // Check file size
        const stat = await adapter.stat(logPath);
        // Add null check or use optional chaining for stat
        fileSize = stat?.size ? stat.size / 1024 : 0; // Convert to KB
      }

      // If the file is too large, create a backup and start fresh
      if (fileSize > this.settings.logFileSizeLimit) {
        if (fileExists) {
          const backupPath = logPath + ".backup";
          // Delete old backup if exists
          if (await adapter.exists(backupPath)) {
            await adapter.remove(backupPath);
          }
          // Create backup
          await adapter.copy(logPath, backupPath);
        }
        // Write new messages
        await adapter.write(logPath, messages);
      } else {
        // Append or create file
        if (!fileExists) {
          await adapter.write(logPath, messages);
        } else {
          // Read, parse, merge, and write
          const existingData = await adapter.read(logPath);
          try {
            const existingMessages = JSON.parse(existingData);
            const newMessages = JSON.parse(messages);
            const merged = JSON.stringify([...existingMessages, ...newMessages]);

            // Check if merged would exceed size limit
            if ((merged.length / 1024) > this.settings.logFileSizeLimit) {
              // If it would exceed, trim the oldest messages
              const allMessages = [...existingMessages, ...newMessages];
              let trimmedMessages = allMessages;
              while ((JSON.stringify(trimmedMessages).length / 1024) > this.settings.logFileSizeLimit) {
                trimmedMessages = trimmedMessages.slice(1);
              }
              await adapter.write(logPath, JSON.stringify(trimmedMessages));
            } else {
              // Otherwise just write the merged data
              await adapter.write(logPath, merged);
            }
          } catch (e) {
            // Handle JSON parse error - reset file
            console.error("Error parsing message history:", e);
            await adapter.write(logPath, messages);
          }
        }
      }
    } catch (error) {
      console.error("Failed to save message history:", error);
    }
  }

  async loadMessageHistory() {
    if (!this.settings.saveMessageHistory) return [];

    try {
      const logPath = this.app.vault.configDir + "/plugins/obsidian-ollama-duet/chat_history.json";

      const adapter = this.app.vault.adapter;

      if (await adapter.exists(logPath)) {
        const data = await adapter.read(logPath);
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to load message history:", error);
    }

    return [];
  }

  async clearMessageHistory() {
    try {
      const logPath = this.app.vault.configDir + "/plugins/obsidian-ollama-duet/chat_history.json";
      const adapter = this.app.vault.adapter;

      if (await adapter.exists(logPath)) {
        await adapter.remove(logPath);
        // Clear history from view
        if (this.view) {
          this.view.clearChatMessages();
        }
      }
    } catch (error) {
      console.error("Failed to clear message history:", error);
    }
  }
}