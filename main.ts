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

  async saveMessageHistory(messages: string) { // 'messages' - це рядок JSON з ПОВНОЮ поточною історією від OllamaView
    if (!this.settings.saveMessageHistory) return;
    console.log(`OllamaPlugin: Received data string (length ${messages.length}):`, messages.substring(0, 200) + "...");

    const basePath = this.app.vault.configDir + "/plugins/obsidian-ollama-duet";
    const logPath = basePath + "/chat_history.json";
    const adapter = this.app.vault.adapter;

    try {
      // 1. Обробка операції очищення (залишається)
      if (messages.trim() === "[]") {
        console.log("OllamaPlugin: Clear operation detected. Overwriting history file with empty array.");

        await adapter.write(logPath, "[]");
        return;
      }

      // 2. Логіка перезапису з перевіркою розміру та обрізкою
      let dataToWrite = messages; // Починаємо з повної історії, що надійшла
      let currentSizeKB = dataToWrite.length / 1024;

      // Перевіряємо, чи НЕ перевищує ліміт розміру *перед* записом
      if (currentSizeKB > this.settings.logFileSizeLimit) {
        console.log(`OllamaPlugin: New history size (${currentSizeKB}KB) exceeds limit (${this.settings.logFileSizeLimit}KB). Trimming oldest messages.`);
        try {
          let parsedMessages = JSON.parse(dataToWrite);

          // Переконуємося, що це масив
          if (!Array.isArray(parsedMessages)) {
            throw new Error("History data to be saved is not an array.");
          }

          // Обрізаємо найстаріші повідомлення (з початку масиву), доки розмір не стане прийнятним
          // Залишаємо хоча б одне повідомлення, якщо можливо
          while ((JSON.stringify(parsedMessages).length / 1024) > this.settings.logFileSizeLimit && parsedMessages.length > 1) {
            parsedMessages.shift(); // Видаляємо перший (найстаріший) елемент
          }

          // Якщо після обрізки нічого не лишилося (дуже маленький ліміт?)
          if (parsedMessages.length === 0) {
            dataToWrite = "[]";
          } else {
            dataToWrite = JSON.stringify(parsedMessages); // Оновлюємо рядок для запису
          }

          currentSizeKB = dataToWrite.length / 1024; // Перераховуємо розмір
          console.log(`OllamaPlugin: History trimmed. New size: ${currentSizeKB}KB`);

        } catch (e) {
          console.error("OllamaPlugin: Error parsing history for trimming. Resetting history to prevent data loss/corruption:", e);
          // У випадку помилки парсингу під час обрізки, безпечніше скинути історію
          dataToWrite = "[]";
          currentSizeKB = dataToWrite.length / 1024;
          // Або можна записати лише останню пару повідомлень як варіант
          // (потребує передачі останньої пари окремо або її виділення з 'messages')
        }
      }

      // 3. Логіка створення бекапу (опціонально, можна залишити)
      // Створюємо бекап, якщо файл існує і *новий* розмір (після можливої обрізки)
      // все ще перевищує ліміт (або якщо просто хочемо бекап перед кожним перезаписом?).
      // Поточна логіка бекапить, якщо ПОПЕРЕДНІЙ файл перевищував ліміт.
      // Давайте змінимо: бекапимо, якщо файл існує, просто перед перезаписом.
      const fileExists = await adapter.exists(logPath);
      if (fileExists) {
        // Вирішіть, чи потрібен бекап при кожному збереженні, чи тільки при перевищенні ліміту
        // Приклад: бекап перед кожним перезаписом
        console.log("OllamaPlugin: Backing up old history file before overwriting.");
        const backupPath = logPath + ".backup";
        if (await adapter.exists(backupPath)) {
          await adapter.remove(backupPath); // Видаляємо старий бекап
        }
        await adapter.copy(logPath, backupPath); // Створюємо новий бекап
      }


      // 4. Запис фінальних даних (перезапис)
      console.log(`OllamaPlugin: Writing history (size: ${currentSizeKB}KB) to ${logPath}`);
      console.log(`OllamaPlugin: Final data to write (length ${dataToWrite.length}):`, dataToWrite.substring(0, 200) + "...");

      await adapter.write(logPath, dataToWrite); // Перезаписуємо файл
      console.log("OllamaPlugin: Write operation completed.");

    } catch (error) {
      console.error("OllamaPlugin: Failed to save message history:", error);
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
          this.view.clearChatContainer();
        }
      }
    } catch (error) {
      console.error("Failed to clear message history:", error);
    }
  }
}