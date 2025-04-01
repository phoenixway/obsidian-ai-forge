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

  async saveMessageHistory(messages: string) {
    // Якщо збереження історії вимкнено в налаштуваннях, нічого не робимо
    if (!this.settings.saveMessageHistory) return;

    // Шлях до файлу історії
    const basePath = this.app.vault.configDir + "/plugins/obsidian-ollama-duet";
    const logPath = basePath + "/chat_history.json";
    const adapter = this.app.vault.adapter;

    try {
      // --- ПОЧАТОК ВИПРАВЛЕННЯ ---
      // Перевіряємо, чи прийшла команда на очищення (порожній масив)
      if (messages.trim() === "[]") {
        console.log("OllamaPlugin: Clear operation detected. Overwriting history file with empty array.");
        // Просто перезаписуємо файл порожнім масивом
        await adapter.write(logPath, "[]");
        // Виходимо з функції, подальша обробка не потрібна
        return;
      }
      // --- КІНЕЦЬ ВИПРАВЛЕННЯ ---

      // --- Існуюча логіка для додавання та лімітів ---
      let fileExists = await adapter.exists(logPath);
      let fileSize = 0;

      if (fileExists) {
        const stat = await adapter.stat(logPath);
        fileSize = stat?.size ? stat.size / 1024 : 0; // KB
      }

      if (fileSize > this.settings.logFileSizeLimit) {
        // --- Логіка бекапу та перезапису при перевищенні ліміту (залишається) ---
        console.log(`OllamaPlugin: History file size (${fileSize}KB) exceeds limit (${this.settings.logFileSizeLimit}KB). Backing up and starting fresh.`);
        if (fileExists) {
          const backupPath = logPath + ".backup";
          if (await adapter.exists(backupPath)) {
            await adapter.remove(backupPath);
          }
          await adapter.copy(logPath, backupPath);
        }
        // Перезаписуємо файл ТІЛЬКИ новими повідомленнями, що надійшли
        await adapter.write(logPath, messages);
        // --- Кінець логіки бекапу ---
      } else {
        // --- Логіка додавання (append) до існуючого файлу (залишається) ---
        if (!fileExists) {
          console.log("OllamaPlugin: History file does not exist. Creating new file.");
          // Якщо файлу немає, просто створюємо його з новими повідомленнями
          await adapter.write(logPath, messages);
        } else {
          console.log("OllamaPlugin: Appending new messages to existing history.");
          // Читаємо, парсимо, об'єднуємо та записуємо
          const existingData = await adapter.read(logPath);
          try {
            // Парсимо існуючі та нові повідомлення
            // Додамо перевірку на порожній existingData
            const existingMessages = (existingData && existingData.trim() !== "") ? JSON.parse(existingData) : [];
            const newMessages = JSON.parse(messages); // 'messages' тут НЕ буде "[]" через перевірку на початку

            // Переконуємося, що обидва є масивами перед об'єднанням
            if (!Array.isArray(existingMessages) || !Array.isArray(newMessages)) {
              throw new Error("Parsed history data is not an array.");
            }

            const mergedMessages = [...existingMessages, ...newMessages];
            let dataToWrite = JSON.stringify(mergedMessages);

            // Перевіряємо розмір *після* об'єднання
            let mergedSizeKB = dataToWrite.length / 1024;
            if (mergedSizeKB > this.settings.logFileSizeLimit) {
              console.log(`OllamaPlugin: Merged size (${mergedSizeKB}KB) would exceed limit. Trimming oldest messages.`);
              // Обрізаємо найстаріші повідомлення, якщо потрібно
              let trimmedMessages = mergedMessages;
              while ((JSON.stringify(trimmedMessages).length / 1024) > this.settings.logFileSizeLimit && trimmedMessages.length > 0) {
                trimmedMessages = trimmedMessages.slice(1); // Видаляємо найстаріше (перше)
              }
              // Якщо після обрізки щось залишилось, записуємо
              if (trimmedMessages.length > 0) {
                dataToWrite = JSON.stringify(trimmedMessages);
              } else {
                // Якщо після обрізки нічого не залишилось (дуже малий ліміт?)
                dataToWrite = "[]"; // Записуємо порожній масив
              }
            }
            // Записуємо фінальні дані (об'єднані або обрізані)
            await adapter.write(logPath, dataToWrite);

          } catch (e) {
            // Обробка помилки парсингу JSON - перезаписуємо файл лише новими повідомленнями
            console.error("OllamaPlugin: Error parsing or merging message history:", e);
            console.log("OllamaPlugin: Resetting history file with current messages.");
            await adapter.write(logPath, messages); // Записуємо тільки ті, що надійшли
          }
        }
        // --- Кінець логіки додавання ---
      }
    } catch (error) {
      console.error("OllamaPlugin: Failed to save message history:", error);
      // Тут можна додати Notice для користувача
      // new Notice("Failed to save chat history.");
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