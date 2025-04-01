import { Plugin, WorkspaceLeaf, Notice } from "obsidian"; // Added Notice
import { OllamaView, VIEW_TYPE_OLLAMA, MessageRole } from "./ollamaView"; // Added MessageRole if needed, or use string literals
import { OllamaSettingTab, DEFAULT_SETTINGS, OllamaPluginSettings } from "./settings";
import { RagService } from "./ragService";
import { ApiService } from "./apiServices";
import { PromptService } from './promptService';
import { MessageService, MessageType } from "./messageService"; // Keep MessageType if used internally or change refs


// Interfaces (can be kept here or moved to types file)
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
  view: OllamaView | null = null; // Reference to the active view instance
  ragService: RagService;
  apiService: ApiService;
  promptService: PromptService;
  // Keep reference to MessageService, now primarily for sending/API orchestration
  messageService: MessageService;
  // Simple event emitter
  private eventHandlers: Record<string, Array<(data: any) => any>> = {};

  // RAG data (consider moving to RagService or separate storage later)
  documents: RAGDocument[] = [];
  embeddings: Embedding[] = [];


  // --- Event Emitter Methods ---
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
      // Use slice to prevent issues if a handler unregisters itself during iteration
      handlers.slice().forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.error(`Error in event handler for ${event}:`, e);
        }
      });
    }
  }
  // --- End Event Emitter Methods ---


  async onload() {
    console.log("Ollama Plugin Loaded!");

    await this.loadSettings();

    // Initialize services
    // Pass settings directly if needed, or services can access plugin.settings
    this.apiService = new ApiService(this.settings.ollamaServerUrl);
    this.ragService = new RagService(this);
    this.promptService = new PromptService(this);
    // MessageService now primarily orchestrates API calls and passes results to the View
    this.messageService = new MessageService(this);

    // Register the view
    this.registerView(VIEW_TYPE_OLLAMA, (leaf) => {
      console.log("OllamaPlugin: Registering new view instance.");
      this.view = new OllamaView(leaf, this);
      this.messageService.setView(this.view); // Still needed so service can call view methods
      // Link ApiService to the view instance AFTER view is created
      if (this.apiService) {
        this.apiService.setOllamaView(this.view);
      }
      return this.view;
    });

    // --- Register API Service Event Handler (FIXED) ---
    // This listener lives on the plugin, triggered by the apiService
    this.apiService.on('connection-error', (error) => {
      console.error("Ollama connection error event received:", error);
      // Display the error message IN THE VIEW if the view is available
      if (this.view) {
        // Call the view's method to add the message
        this.view.internalAddMessage( // <-- FIX: Call view's method
          "error", // Use string literal for role
          `Failed to connect to Ollama: ${error.message}. Please check settings.`
        );
      } else {
        // Fallback to Notice if view isn't open
        new Notice(`Failed to connect to Ollama: ${error.message}`);
        console.log("Ollama connection error: View not available to display message.");
      }
    });
    // --- End Event Handler ---


    // Add Ribbon Icon
    this.addRibbonIcon("message-square", "Open Ollama Chat", () => {
      this.activateView();
    });

    // Add Commands
    this.addCommand({
      id: "open-ollama-view",
      name: "Open Ollama Chat",
      callback: () => {
        this.activateView();
      },
    });

    this.addCommand({
      id: 'change-model', // Example command
      name: 'Change Ollama Model (Example)',
      callback: async () => {
        // --- Example: How model change should work ---
        const newModel = "llama3:latest"; // Replace with actual model selection logic
        console.log(`Changing model to ${newModel}`);
        this.settings.modelName = newModel;
        await this.saveSettings(); // Saves settings and triggers updateApiService
        // Emit event for the VIEW to react
        this.emit('model-changed', newModel);
        // --- End Example ---
      }
    });

    this.addCommand({
      id: "index-rag-documents",
      name: "Index documents for RAG",
      callback: async () => {
        await this.ragService.indexDocuments(); // Assuming indexDocuments shows Notices
      },
    });

    this.addCommand({
      id: "clear-ollama-history",
      name: "Clear Ollama Chat History",
      callback: async () => {
        // Optional: Add confirmation dialog
        await this.clearMessageHistory(); // Call the refined clear method
        new Notice("Ollama chat history cleared.");
      },
    });


    // Add Settings Tab
    this.settingTab = new OllamaSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    // On Layout Ready Logic
    this.app.workspace.onLayoutReady(async () => { // Make async if needed
      // Check if RAG should run on startup
      if (this.settings.ragEnabled) {
        // Use a timeout to allow Obsidian UI to settle before indexing
        setTimeout(() => {
          console.log("OllamaPlugin: RAG enabled, starting initial index.");
          this.ragService.indexDocuments();
        }, 5000); // Delay indexing slightly after layout ready
      }

      // Attempt to activate view if not already open (optional)
      // this.activateView(); // Consider if you always want to open it
    });

    // Register listener for file modifications for RAG updates
    this.registerEvent(
      this.app.vault.on("modify", (file) => { // Can check the file type/path if needed
        if (this.settings.ragEnabled) {
          // Debounce to avoid excessive re-indexing during rapid saves
          this.debounceIndexUpdate();
        }
      })
    );
    // Could add listeners for 'delete' and 'rename' as well for RAG robustness
  }

  // Called when plugin is unloaded
  onunload() {
    console.log("Ollama Plugin Unloaded!");
    // Clean up: remove view, clear timeouts, remove listeners if necessary
    this.app.workspace.getLeavesOfType(VIEW_TYPE_OLLAMA).forEach((leaf) => {
      leaf.detach();
    });
    if (this.indexUpdateTimeout) {
      clearTimeout(this.indexUpdateTimeout);
    }
    // Event listeners registered with this.registerEvent are handled automatically
  }


  // --- Service Updates ---
  // Update API service when settings change (called from saveSettings)
  updateApiService() {
    if (this.apiService) {
      this.apiService.setBaseUrl(this.settings.ollamaServerUrl);
    }
  }


  // --- Debounce Indexing ---
  private indexUpdateTimeout: NodeJS.Timeout | null = null;
  private debounceIndexUpdate() {
    if (this.indexUpdateTimeout) {
      clearTimeout(this.indexUpdateTimeout);
    }
    this.indexUpdateTimeout = setTimeout(() => {
      console.log("OllamaPlugin: Debounced RAG index update triggered.");
      this.ragService.indexDocuments();
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
      console.log("OllamaPlugin: Found existing view leaf.");
    } else {
      console.log("OllamaPlugin: No existing view leaf found, creating new one.");
      // Try right leaf first, then main leaf
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true); // Use getLeaf(true) to ensure a leaf is created if needed
      await leaf.setViewState({ type: VIEW_TYPE_OLLAMA, active: true });
      console.log("OllamaPlugin: New view leaf created.");
    }

    // Ensure the leaf is revealed and the view instance is linked
    if (leaf) {
      workspace.revealLeaf(leaf);
      // Make sure the view instance associated with this leaf is correctly referenced
      // The registerView callback should handle setting this.view, but we ensure messageService is linked
      const viewInstance = leaf.view;
      if (viewInstance instanceof OllamaView) {
        this.view = viewInstance; // Update internal reference if needed
        this.messageService.setView(this.view); // Ensure service has correct view ref
        if (this.apiService) {
          this.apiService.setOllamaView(this.view); // Ensure API service has correct view ref
        }
        console.log("OllamaPlugin: View activated and services linked.");
      } else {
        console.error("OllamaPlugin: Leaf revealed, but view instance is not of type OllamaView?");
      }

    } else {
      console.error("OllamaPlugin: Failed to get or create a leaf for the view.");
    }
  }


  // --- Settings Management ---
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateApiService(); // Update API service on save
    // Emit event if specific settings affecting UI/behavior changed
    // e.g., this.emit('settings-changed', this.settings);
    console.log("OllamaPlugin: Settings saved.");
  }


  // --- History Persistence --- (Using corrected logic)

  // Overwrites the history file with the provided complete history string (or clears it)
  async saveMessageHistory(messagesJsonString: string) {
    if (!this.settings.saveMessageHistory) {
      // console.log("OllamaPlugin: Saving history disabled in settings.");
      return; // Exit if saving is disabled
    }

    // Use adapter directly for path construction relative to vault
    const adapter = this.app.vault.adapter;
    // Ensure plugin config directory exists
    const pluginConfigDir = this.manifest.dir; // Gets '.obsidian/plugins/obsidian-ollama-duet'
    if (!pluginConfigDir) {
      console.error("OllamaPlugin: Could not determine plugin directory path.");
      return;
    }
    const logPath = `${pluginConfigDir}/chat_history.json`; // Path within vault structure

    console.log(`OllamaPlugin: Preparing to save history to ${logPath}`);
    console.log(`OllamaPlugin: Received data string (length ${messagesJsonString.length}):`, messagesJsonString.substring(0, 200) + "...");


    try {
      let dataToWrite = messagesJsonString;
      let finalSizeKB = dataToWrite.length / 1024;

      // 1. Handle Clear Operation
      if (dataToWrite.trim() === "[]") {
        console.log("OllamaPlugin: Clear operation detected. Writing empty array.");
        // Proceed to write "[]" below
      }
      // 2. Handle Size Limit (if not clearing)
      else if (finalSizeKB > this.settings.logFileSizeLimit) {
        console.log(`OllamaPlugin: New history size (${finalSizeKB}KB) exceeds limit (${this.settings.logFileSizeLimit}KB). Trimming oldest messages.`);
        try {
          let parsedMessages = JSON.parse(dataToWrite);
          if (!Array.isArray(parsedMessages)) {
            throw new Error("History data is not an array.");
          }

          while ((JSON.stringify(parsedMessages).length / 1024) > this.settings.logFileSizeLimit && parsedMessages.length > 1) {
            parsedMessages.shift(); // Remove oldest
          }
          dataToWrite = parsedMessages.length > 0 ? JSON.stringify(parsedMessages) : "[]";
          finalSizeKB = dataToWrite.length / 1024;
          console.log(`OllamaPlugin: History trimmed. New size: ${finalSizeKB}KB`);
        } catch (e) {
          console.error("OllamaPlugin: Error parsing history for trimming. Resetting history:", e);
          dataToWrite = "[]"; // Reset on error
          finalSizeKB = dataToWrite.length / 1024;
        }
      }

      // 3. Backup Logic (Backup before overwriting if file exists)
      const fileExists = await adapter.exists(logPath);
      if (fileExists) {
        try {
          console.log("OllamaPlugin: Backing up old history file before overwriting.");
          const backupPath = logPath + ".backup";
          if (await adapter.exists(backupPath)) {
            await adapter.remove(backupPath);
          }
          await adapter.copy(logPath, backupPath);
        } catch (backupError) {
          console.error("OllamaPlugin: Failed to create history backup:", backupError);
          // Decide if you want to proceed with writing even if backup fails
        }
      }

      // 4. Write final data (original, cleared, or trimmed)
      console.log(`OllamaPlugin: Writing history (size: ${finalSizeKB}KB) to ${logPath}`);
      console.log(`OllamaPlugin: Final data to write (length ${dataToWrite.length}):`, dataToWrite.substring(0, 200) + "...");
      await adapter.write(logPath, dataToWrite);
      console.log("OllamaPlugin: Write operation completed.");

    } catch (error) {
      console.error("OllamaPlugin: Failed to save message history:", error);
      new Notice("Error saving chat history."); // Notify user on failure
    }
  }


  // Loads history, returns array of objects or empty array
  async loadMessageHistory(): Promise<any[]> { // Return type changed for clarity
    if (!this.settings.saveMessageHistory) {
      // console.log("OllamaPlugin: Loading history disabled in settings.");
      return []; // Return empty if disabled
    }

    const adapter = this.app.vault.adapter;
    const pluginConfigDir = this.manifest.dir;
    if (!pluginConfigDir) {
      console.error("OllamaPlugin: Could not determine plugin directory path for loading.");
      return [];
    }
    const logPath = `${pluginConfigDir}/chat_history.json`;

    console.log(`OllamaPlugin: Attempting to load history from ${logPath}`);
    try {
      if (!(await adapter.exists(logPath))) {
        console.log("OllamaPlugin: History file does not exist.");
        return []; // Return empty if no file
      }

      const data = await adapter.read(logPath);
      if (!data || data.trim() === "" || data.trim() === "[]") {
        console.log("OllamaPlugin: History file is empty or contains only '[]'.");
        return []; // Return empty if file is empty
      }

      console.log(`OllamaPlugin: Loaded history data (length ${data.length}):`, data.substring(0, 200) + "...");
      const parsedData = JSON.parse(data);

      if (Array.isArray(parsedData)) {
        console.log(`OllamaPlugin: Successfully parsed ${parsedData.length} messages from history.`);
        return parsedData; // Return the array of messages
      } else {
        console.warn("OllamaPlugin: Parsed history data is not an array. Returning empty history.");
        return []; // Return empty if data is not an array
      }
    } catch (error) {
      console.error("OllamaPlugin: Failed to load/parse message history:", error);
      // Optionally try to read backup? For now, just return empty on error.
      // new Notice("Failed to load chat history. File might be corrupted.");
      return []; // Return empty on error
    }
  }


  // --- Refined Clear History Method ---
  // Clears history in view AND triggers save of empty state
  async clearMessageHistory() {
    console.log("OllamaPlugin: Clearing message history initiated.");
    try {
      // Trigger the save function with "[]" to handle backup and overwrite
      await this.saveMessageHistory("[]"); // Let save handle the file operation

      // Clear history from the currently active view instance
      if (this.view) {
        // We don't call clearChatContainer directly anymore as save handles the file.
        // We need to update the view's internal state and UI.
        // Let's add a dedicated method in OllamaView for this.
        // For now, let's reload the view state or re-call loadAndRenderHistory
        // This ensures the view reflects the now empty saved state.
        this.view.clearChatContainer(); // This clears internal state and UI, then tries to save "[]" again (harmless)
        console.log("OllamaPlugin: Called view.clearChatContainer.");

      } else {
        console.log("OllamaPlugin: View not active, history file cleared/reset.");
      }
      new Notice("Ollama chat history cleared."); // Move Notice here
    } catch (error) {
      console.error("OllamaPlugin: Failed to clear message history:", error);
      new Notice("Error clearing chat history.");
    }
  }
  // --- End History Persistence ---

} // End of OllamaPlugin class