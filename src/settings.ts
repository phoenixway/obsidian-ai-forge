// src/settings.ts
import { App, PluginSettingTab, Setting, DropdownComponent, setIcon, TFolder, debounce, ExtraButtonComponent, SliderComponent } from "obsidian";import OllamaPlugin from "./main";
import { LogLevel, LoggerSettings } from "./Logger"; // Імпортуємо LogLevel та LoggerSettings

// --- Мови ---
const LANGUAGES: Record<string, string> = { /* ... ваш довгий список мов ... */
  "af": "Afrikaans", "sq": "Albanian", "am": "Amharic", "ar": "Arabic", "hy": "Armenian",
  "az": "Azerbaijani", "eu": "Basque", "be": "Belarusian", "bn": "Bengali", "bs": "Bosnian",
  "bg": "Bulgarian", "ca": "Catalan", "ceb": "Cebuano", "ny": "Chichewa", "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)", "co": "Corsican", "hr": "Croatian", "cs": "Czech", "da": "Danish",
  "nl": "Dutch", "en": "English", "eo": "Esperanto", "et": "Estonian", "tl": "Filipino",
  "fi": "Finnish", "fr": "French", "fy": "Frisian", "gl": "Galician", "ka": "Georgian",
  "de": "German", "el": "Greek", "gu": "Gujarati", "ht": "Haitian Creole", "ha": "Hausa",
  "haw": "Hawaiian", "iw": "Hebrew", "he": "Hebrew", "hi": "Hindi", "hmn": "Hmong",
  "hu": "Hungarian", "is": "Icelandic", "ig": "Igbo", "id": "Indonesian", "ga": "Irish",
  "it": "Italian", "ja": "Japanese", "jw": "Javanese", "kn": "Kannada", "kk": "Kazakh",
  "km": "Khmer", "rw": "Kinyarwanda", "ko": "Korean", "ku": "Kurdish (Kurmanji)", "ky": "Kyrgyz",
  "lo": "Lao", "la": "Latin", "lv": "Latvian", "lt": "Lithuanian", "lb": "Luxembourgish",
  "mk": "Macedonian", "mg": "Malagasy", "ms": "Malay", "ml": "Malayalam", "mt": "Maltese",
  "mi": "Maori", "mr": "Marathi", "mn": "Mongolian", "my": "Myanmar (Burmese)", "ne": "Nepali",
  "no": "Norwegian", "or": "Odia (Oriya)", "ps": "Pashto", "fa": "Persian", "pl": "Polish",
  "pt": "Portuguese", "pa": "Punjabi", "ro": "Romanian", "ru": "Russian", "sm": "Samoan",
  "gd": "Scots Gaelic", "sr": "Serbian", "st": "Sesotho", "sn": "Shona", "sd": "Sindhi",
  "si": "Sinhala", "sk": "Slovak", "sl": "Slovenian", "so": "Somali", "es": "Spanish",
  "su": "Sundanese", "sw": "Swahili", "sv": "Swedish", "tg": "Tajik", "ta": "Tamil",
  "tt": "Tatar", "te": "Telugu", "th": "Thai", "tr": "Turkish", "tk": "Turkmen",
  "uk": "Ukrainian", "ur": "Urdu", "ug": "Uyghur", "uz": "Uzbek", "vi": "Vietnamese",
  "cy": "Welsh", "xh": "Xhosa", "yi": "Yiddish", "yo": "Yoruba", "zu": "Zulu"
};
// --- Інтерфейс налаштувань ---
export interface OllamaPluginSettings extends LoggerSettings { // Розширюємо інтерфейс
  ollamaServerUrl: string;
  modelName: string;
  temperature: number;
  contextWindow: number;
  userRolesFolderPath: string;
  selectedRolePath: string;
  saveMessageHistory: boolean;
  ragEnabled: boolean;
  ragFolderPath: string;
  googleApiKey: string;
  speechLanguage: string;
  userAvatarType: AvatarType;
  userAvatarContent: string;
  aiAvatarType: AvatarType;
  aiAvatarContent: string;
  maxMessageHeight: number;
  enableTranslation: boolean;
  translationTargetLanguage: string;
  googleTranslationApiKey: string;
  chatHistoryFolderPath: string;
  chatExportFolderPath: string;
  enableProductivityFeatures: boolean;
  dailyTaskFileName: string;
  useAdvancedContextStrategy: boolean;
  enableSummarization: boolean;
  summarizationPrompt: string;
  keepLastNMessagesBeforeSummary: number;
  summarizationChunkSize: number;
  followRole: boolean;
  maxCharsPerDoc: number;

  ragEnableSemanticSearch: boolean; // Увімкнути семантичний пошук? (Може замінити старий)
  ragEmbeddingModel: string; // Назва embedding моделі в Ollama
  ragChunkSize: number; // Розмір чанків (у символах)
  ragSimilarityThreshold: number; // Поріг подібності (0-1)
  ragTopK: number; // Кількість релевантних чанків для контексту
}

// --- Значення за замовчуванням ---
export const DEFAULT_SETTINGS: OllamaPluginSettings = {
  ollamaServerUrl: "http://localhost:11434",
  modelName: "",
  temperature: 0.7,
  contextWindow: 4096,
  userRolesFolderPath: "/etc/roles", // Змінено на більш нейтральний шлях
  selectedRolePath: "",
  saveMessageHistory: true,
  ragEnabled: false,
  ragFolderPath: "/etc/RAG", // Змінено
  googleApiKey: "",
  speechLanguage: "uk-UA",
  userAvatarType: 'initials',
  userAvatarContent: 'U',
  aiAvatarType: 'icon',
  aiAvatarContent: 'bot',
  maxMessageHeight: 300,
  enableTranslation: false,
  translationTargetLanguage: "uk",
  googleTranslationApiKey: "",
  chatHistoryFolderPath: "/etc/chats", // Змінено
  chatExportFolderPath: "/etc/xports", // Змінено

  enableProductivityFeatures: false,
  dailyTaskFileName: "Tasks_Today.md",

  useAdvancedContextStrategy: false,
  enableSummarization: false,
  summarizationPrompt: "Summarize the key points...",
  keepLastNMessagesBeforeSummary: 10,
  summarizationChunkSize: 1500,
  followRole: true,

  // --- Нові налаштування логера ---
  consoleLogLevel: 'INFO', // Рівень для консолі за замовчуванням
  fileLoggingEnabled: false, // Логування у файл вимкнено за замовчуванням
  fileLogLevel: 'WARN', // Рівень для файлу за замовчуванням
  logCallerInfo: false, // НЕ записувати ім'я викликаючого методу за замовчуванням (для продуктивності)
  // logFilePath: undefined, // Шлях за замовчуванням буде в папці плагіна
  // logFileMaxSizeMB: 5, // Макс. розмір за замовчуванням
  maxCharsPerDoc: 1500,

  ragEnableSemanticSearch: true,    // Вмикаємо за замовчуванням, якщо RAG взагалі увімкнено
  ragEmbeddingModel: "nomic-embed-text", // Рекомендована модель
  ragChunkSize: 512,               // Популярний розмір чанку
  ragSimilarityThreshold: 0.5,     // Середній поріг подібності
  ragTopK: 3,                       // Брати топ-3 результати
};

// --- Тип аватара ---
export type AvatarType = 'initials' | 'icon';

// --- Клас вкладки налаштувань ---
export class OllamaSettingTab extends PluginSettingTab {
  plugin: OllamaPlugin;

  private debouncedUpdateChatPath: () => void;
  private debouncedUpdateRolePath: () => void;
  private debouncedUpdateRagPath: () => void;



  constructor(app: App, plugin: OllamaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    // --- Ініціалізація Debounced функцій ---
    this.debouncedUpdateChatPath = debounce(async () => {
      console.log("Debounced: Updating chat path and ensuring folder exists...");
      if (this.plugin.chatManager) {
        this.plugin.chatManager.updateChatsFolderPath();
        // Викликаємо ensure замість повного initialize, щоб уникнути перезавантаження індексу
        await (this.plugin.chatManager as any).ensureChatsFolderExists(); // Припускаємо, що метод є приватним, але доступний
        // Або зробіть ensureChatsFolderExists публічним/внутрішнім в ChatManager
      }
    }, 1000, true); // Затримка 1 секунда

    this.debouncedUpdateRolePath = debounce(async () => {
      console.log("Debounced: Refreshing role list due to path change...");
      await this.plugin.listRoleFiles(true); // Примусово оновлюємо список
      this.plugin.emit('roles-updated'); // Повідомляємо View
    }, 1000, true);

    this.debouncedUpdateRagPath = debounce(async () => {
      console.log("Debounced: Re-indexing RAG due to path change...");
      if (this.plugin.settings.ragEnabled && this.plugin.ragService) {
        // Можливо, варто додати метод для оновлення шляху в ragService
        // this.plugin.ragService.updateFolderPath();
        await this.plugin.ragService.indexDocuments(); // Переіндексовуємо
      }
    }, 1000, true);
    // --------------------------------------

  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "AI Forge Settings" });

    // --- Connection & Model ---
    containerEl.createEl('h3', { text: 'Connection & Model' });
    // ... (Ollama Server URL, Default Model Name, Default Temperature, Context Window Size) ...
    new Setting(containerEl).setName("Ollama Server URL").setDesc("The URL of your running Ollama server.").addText(text => text.setPlaceholder(DEFAULT_SETTINGS.ollamaServerUrl).setValue(this.plugin.settings.ollamaServerUrl).onChange(async (value) => { this.plugin.settings.ollamaServerUrl = value.trim() || DEFAULT_SETTINGS.ollamaServerUrl; await this.plugin.saveSettings(); this.plugin.updateOllamaServiceConfig(); }));

    // --- Default Model Name ---
    const modelSetting = new Setting(containerEl)
      .setName("Default Model Name")
      .setDesc("The default Ollama model to use for new chats. Select from available models.");

    let modelDropdown: DropdownComponent | null = null;

    // Функція для оновлення опцій
    const updateOptions = async (dropdown: DropdownComponent | null) => {
      if (!dropdown) return;
      dropdown.selectEl.innerHTML = ''; // Очищуємо
      dropdown.addOption('', 'Loading models...');
      dropdown.setDisabled(true);
      try {
        const models = await this.plugin.ollamaService.getModels();
        dropdown.selectEl.innerHTML = ''; // Очищуємо
        dropdown.addOption('', '-- Select default model --');
        if (models && models.length > 0) { models.forEach(modelName => { dropdown.addOption(modelName, modelName); }); }
        else { dropdown.addOption('', 'No models found'); }
        dropdown.setValue(this.plugin.settings.modelName);
        dropdown.setDisabled(false);
      } catch (error) {
        console.error("Error fetching models for settings:", error);
        dropdown.selectEl.innerHTML = '';
        dropdown.addOption('', 'Error loading models!');
        dropdown.setValue(this.plugin.settings.modelName);
        dropdown.setDisabled(true);
      }
    };

    modelSetting.addDropdown(async (dropdown) => {
      modelDropdown = dropdown; // Зберігаємо посилання
      dropdown.onChange(async (value) => {
        this.plugin.settings.modelName = value;
        await this.plugin.saveSettings();
      });
      await updateOptions(dropdown); // Початкове завантаження
    });

    modelSetting.controlEl.addClass('ollama-model-setting-control');

    const refreshButton = modelSetting.controlEl.createEl('button', {
      cls: 'ollama-refresh-button',
      attr: { 'aria-label': 'Refresh model list' }
    });
    // Тепер setIcon має бути знайдено
    setIcon(refreshButton, 'refresh-cw');

    refreshButton.addEventListener('click', async (e: MouseEvent) => {
      e.preventDefault();
      if (!modelDropdown) return;
      // Тепер setIcon має бути знайдено
      setIcon(refreshButton, 'loader');
      refreshButton.disabled = true;
      await updateOptions(modelDropdown);
      // Тепер setIcon має бути знайдено
      setIcon(refreshButton, 'refresh-cw');
      refreshButton.disabled = false;
    });
    // --- КІНЕЦЬ КОДУ З КНОПКОЮ ---

    new Setting(containerEl).setName("Default Temperature").setDesc("Controls randomness. Lower values (e.g., 0.2) make output more deterministic, higher values (e.g., 0.8) make it more creative.").addSlider(slider => slider.setLimits(0, 1, 0.1).setValue(this.plugin.settings.temperature).setDynamicTooltip().onChange(async (value) => { this.plugin.settings.temperature = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Context Window Size (Tokens)").setDesc("Maximum number of tokens (input + output) the model considers. Adjust based on model and available memory.").addText(text => text.setPlaceholder(DEFAULT_SETTINGS.contextWindow.toString()).setValue(this.plugin.settings.contextWindow.toString()).onChange(async (value) => { const num = parseInt(value.trim(), 10); if (!isNaN(num) && num > 0) { this.plugin.settings.contextWindow = num; } else { this.plugin.settings.contextWindow = DEFAULT_SETTINGS.contextWindow; } await this.plugin.saveSettings(); }));


    containerEl.createEl('h3', { text: 'Roles & Personas' });
    new Setting(containerEl)
      .setName('Custom Roles Folder Path')
      .setDesc('Folder within your vault containing custom role definition (.md) files.')
      .addText(text => text
        .setPlaceholder('Example: System Prompts/Ollama Roles')
        .setValue(this.plugin.settings.userRolesFolderPath)
        .onChange(async (value) => {
          this.plugin.settings.userRolesFolderPath = value.trim();
          await this.plugin.saveSettings(); // Зберігаємо саме налаштування одразу
          // --- ВИКЛИКАЄМО DEBOUNCED ---
          this.debouncedUpdateRolePath();
          // ---------------------------
        }));    // --- Додано налаштування followRole ---
    new Setting(containerEl)
      .setName('Always Apply Selected Role')
      .setDesc('If enabled, the globally selected role (or chat-specific role) will always be used as the system prompt.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.followRole)
        .onChange(async (value) => {
          this.plugin.settings.followRole = value;
          await this.plugin.saveSettings();
        }));
    // --------------------------------------

    containerEl.createEl('h3', { text: 'Storage & History' });
    new Setting(containerEl)
      .setName('Save Message History')
      .setDesc('Automatically save chat conversations to files.')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.saveMessageHistory).onChange(async (value) => { this.plugin.settings.saveMessageHistory = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName('Chat History Folder Path')
      .setDesc('Folder within your vault to store chat history (.json files). Leave empty to save in the vault root.')
      .addText(text => text
        .setPlaceholder(DEFAULT_SETTINGS.chatHistoryFolderPath || 'Vault Root')
        .setValue(this.plugin.settings.chatHistoryFolderPath)
        .onChange(async (value) => {
          this.plugin.settings.chatHistoryFolderPath = value.trim();
          await this.plugin.saveSettings(); // Зберігаємо саме налаштування одразу
          // --- ВИКЛИКАЄМО DEBOUNCED ---
          this.debouncedUpdateChatPath();
          // ---------------------------
        }));
        containerEl.createEl('h3', { text: 'Retrieval-Augmented Generation (RAG)' });
        new Setting(containerEl)
            .setName('Enable RAG')
            .setDesc('Allow the chat to retrieve information from your notes for context.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.ragEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.ragEnabled = value;
                    await this.plugin.saveSettings();
                    this.display(); // Re-render to show/hide RAG options
                    if (value) this.debouncedUpdateRagPath(); // Trigger index if enabled
                }));

        // Show RAG options only if RAG is enabled
        if (this.plugin.settings.ragEnabled) {
            new Setting(containerEl)
                .setName('RAG Documents Folder Path')
                .setDesc('Folder containing notes for RAG context.')
                .addText(text => text
                    .setPlaceholder('Example: Knowledge Base/RAG Docs')
                    .setValue(this.plugin.settings.ragFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.ragFolderPath = value.trim();
                        await this.plugin.saveSettings();
                        this.debouncedUpdateRagPath(); // Re-index on path change
                        // Також оновлюємо шлях для завдань, якщо він залежить від RAG папки
                        this.plugin.updateDailyTaskFilePath?.();
                        this.plugin.loadAndProcessInitialTasks?.();
                    }));

            // --- ДОДАНО: Налаштування Семантичного Пошуку ---
            new Setting(containerEl)
                .setName('Enable Semantic Search')
                .setDesc('Use embedding models for context retrieval (more accurate, requires indexing). If disabled, might fall back to basic keyword search (if implemented).')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.ragEnableSemanticSearch)
                    .onChange(async (value) => {
                        this.plugin.settings.ragEnableSemanticSearch = value;
                        await this.plugin.saveSettings();
                        this.display(); // Re-render to show/hide dependent settings
                        // Re-index might be good idea when switching search type?
                        this.debouncedUpdateRagPath();
                    }));

            // Show semantic search options only if enabled
            if (this.plugin.settings.ragEnableSemanticSearch) {

                // -- Embedding Model Selector --
                 const embeddingModelSetting = new Setting(containerEl)
                    .setName("Embedding Model Name")
                    .setDesc("Ollama model for generating text embeddings (e.g., nomic-embed-text, all-minilm). Ensure the model is pulled.")
                    .setClass('ollama-model-setting-container'); // Reuse class for layout

                let embeddingDropdown: DropdownComponent | null = null;

                const updateEmbeddingOptions = async (dropdown: DropdownComponent | null) => {
                    if (!dropdown) return;
                    const previousValue = dropdown.getValue();
                    dropdown.selectEl.innerHTML = '';
                    dropdown.addOption('', 'Loading models...');
                    dropdown.setDisabled(true);
                    try {
                        // Using getModels - user needs to know which are embedding models
                        const models = await this.plugin.ollamaService.getModels();
                        dropdown.selectEl.innerHTML = '';
                        dropdown.addOption('', '-- Select Embedding Model --'); // Default empty option

                        // Add some common known embedding models first for convenience
                        const commonEmbedModels = ["nomic-embed-text", "all-minilm", "mxbai-embed-large", "bge-base-en", "gte-base"];
                        commonEmbedModels.forEach(modelName => {
                            // Add only if maybe present or just add them directly? Add directly.
                             dropdown.addOption(modelName, modelName);
                        });
                         dropdown.addOption('---', '--- Other Installed Models ---').setDisabled(true);

                        // Add all other models found
                        if (models && models.length > 0) {
                            models.forEach(modelName => {
                                if (!commonEmbedModels.includes(modelName)) { // Avoid duplicates
                                    dropdown.addOption(modelName, modelName);
                                }
                            });
                        } else {
                            // Keep common ones even if no models found from server? Or show error?
                            // dropdown.addOption('', 'No models found from server');
                        }
                        // Try to set the saved value, otherwise default to empty/first option
                        dropdown.setValue(this.plugin.settings.ragEmbeddingModel || commonEmbedModels[0]); // Default to nomic if setting is empty?
                        dropdown.setDisabled(false);
                    } catch (error) {
                        console.error("Error fetching models for embedding dropdown:", error);
                        dropdown.selectEl.innerHTML = '';
                        dropdown.addOption('', 'Error loading models!');
                        dropdown.setValue(this.plugin.settings.ragEmbeddingModel);
                        dropdown.setDisabled(true);
                    }
                };

                embeddingModelSetting.addDropdown(async (dropdown) => {
                    embeddingDropdown = dropdown;
                    dropdown.onChange(async (value) => {
                        this.plugin.settings.ragEmbeddingModel = value;
                        await this.plugin.saveSettings();
                        // Re-index needed when embedding model changes
                        this.debouncedUpdateRagPath();
                    });
                    await updateEmbeddingOptions(dropdown);
                });

                embeddingModelSetting.controlEl.addClass('ollama-model-setting-control');
                const refreshEmbeddingButton = embeddingModelSetting.controlEl.createEl('button', {
                    cls: 'ollama-refresh-button', attr: { 'aria-label': 'Refresh model list' } });
                setIcon(refreshEmbeddingButton, 'refresh-cw');
                refreshEmbeddingButton.addEventListener('click', async (e: MouseEvent) => {
                    e.preventDefault(); if (!embeddingDropdown) return;
                    setIcon(refreshEmbeddingButton, 'loader'); refreshEmbeddingButton.disabled = true;
                    await updateEmbeddingOptions(embeddingDropdown);
                    setIcon(refreshEmbeddingButton, 'refresh-cw'); refreshEmbeddingButton.disabled = false;
                });
                // -- End Embedding Model Selector --

                new Setting(containerEl)
                    .setName('Chunk Size (Characters)')
                    .setDesc('Size of text chunks for indexing. Smaller chunks = more specific context, larger = broader context.')
                    .addText(text => text
                        .setPlaceholder(String(DEFAULT_SETTINGS.ragChunkSize))
                        .setValue(String(this.plugin.settings.ragChunkSize))
                        .onChange(async (value) => {
                            const num = parseInt(value.trim(), 10);
                            this.plugin.settings.ragChunkSize = (!isNaN(num) && num > 50) ? num : DEFAULT_SETTINGS.ragChunkSize; // Min size 50
                            await this.plugin.saveSettings();
                            // Re-index needed on chunk size change
                             this.debouncedUpdateRagPath();
                        }));

                        new Setting(containerEl)
                        .setName('Similarity Threshold')
                        .setDesc('Minimum relevance score (0.0 to 1.0) for a chunk to be included in context. Higher = more strict.')
                        .addSlider((slider: SliderComponent) => slider // Added type SliderComponent
                            .setLimits(0, 1, 0.05) // Range 0 to 1, step 0.05
                            .setValue(this.plugin.settings.ragSimilarityThreshold)
                            .setDynamicTooltip() // Use built-in dynamic tooltip to show value
                            .onChange(async (value) => {
                                this.plugin.settings.ragSimilarityThreshold = value;
                                await this.plugin.saveSettings();
                                // No need to update extra button text anymore
                            }));
                      
                }

                new Setting(containerEl)
                    .setName('Top K Results')
                    .setDesc('Maximum number of relevant document chunks to include in the context.')
                    .addText(text => text
                        .setPlaceholder(String(DEFAULT_SETTINGS.ragTopK))
                        .setValue(String(this.plugin.settings.ragTopK))
                        .onChange(async (value) => {
                            const num = parseInt(value.trim(), 10);
                            this.plugin.settings.ragTopK = (!isNaN(num) && num > 0) ? num : DEFAULT_SETTINGS.ragTopK; // Min 1 result
                            await this.plugin.saveSettings();
                            // No re-index needed, affects retrieval
                        }));

            } // End if ragEnableSemanticSearch

             // --- Додаємо старе налаштування maxCharsPerDoc (можливо, воно більше не потрібне при чанкінгу?) ---
             new Setting(containerEl)
                .setName('Max Characters Per Document (Fallback/Display?)')
                .setDesc('Maximum characters to display or process from a single RAG document chunk if needed (Legacy?). Set 0 for no limit.')
                .addText(text => text
                    .setPlaceholder(String(DEFAULT_SETTINGS.maxCharsPerDoc))
                    .setValue(String(this.plugin.settings.maxCharsPerDoc))
                    .onChange(async (value) => {
                        const num = parseInt(value.trim(), 10);
                        this.plugin.settings.maxCharsPerDoc = (!isNaN(num) && num >= 0) ? num : DEFAULT_SETTINGS.maxCharsPerDoc;
                        await this.plugin.saveSettings();
                    }));

    containerEl.createEl('h3', { text: 'Productivity Assistant Features' });

    // Головний перемикач для функцій продуктивності
    new Setting(containerEl)
      .setName('Enable Productivity Features')
      .setDesc('Activate features like daily task integration and advanced context management for planning-oriented personas.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableProductivityFeatures)
        .onChange(async (value) => {
          this.plugin.settings.enableProductivityFeatures = value;
          await this.plugin.saveSettings();
          this.display(); // Перерендерити, щоб показати/сховати залежні налаштування
        }));

    // Показуємо залежні налаштування, тільки якщо основна функція увімкнена
    if (this.plugin.settings.enableProductivityFeatures) {

      // Налаштування файлу завдань
      new Setting(containerEl)
        .setName('Daily Task File Name')
        .setDesc('The exact filename (including .md) of your daily task list within the RAG folder.')
        .addText(text => text
          .setPlaceholder(DEFAULT_SETTINGS.dailyTaskFileName)
          .setValue(this.plugin.settings.dailyTaskFileName)
          .onChange(async (value) => {
            this.plugin.settings.dailyTaskFileName = value.trim() || DEFAULT_SETTINGS.dailyTaskFileName;
            await this.plugin.saveSettings();
            // Повідомити плагін про зміну шляху/імені файлу
            this.plugin.updateDailyTaskFilePath?.(); // Викликаємо метод оновлення шляху (якщо він є)
            this.plugin.loadAndProcessInitialTasks?.(); // Перезавантажити завдання
          }));

      // Налаштування розширеного контексту
      new Setting(containerEl)
        .setName('Use Advanced Context Strategy')
        .setDesc('Enables summarization and chunking for long conversations (requires Productivity Features enabled).')
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.useAdvancedContextStrategy)
          .onChange(async (value) => {
            this.plugin.settings.useAdvancedContextStrategy = value;
            await this.plugin.saveSettings();
            this.display(); // Перерендерити, щоб показати/сховати налаштування підсумовування
          }));

      // Налаштування підсумовування (якщо увімкнено розширену стратегію)
      if (this.plugin.settings.useAdvancedContextStrategy) {
        new Setting(containerEl)
          .setName('Enable Context Summarization')
          .setDesc('Allow summarizing older parts of the chat history.')
          .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableSummarization)
            .onChange(async (value) => {
              this.plugin.settings.enableSummarization = value;
              await this.plugin.saveSettings();
              this.display(); // Перерендерити, щоб показати/сховати промпт підсумовування
            }));

        // Промпт для підсумовування (якщо увімкнено підсумовування)
        if (this.plugin.settings.enableSummarization) {
          new Setting(containerEl)
            .setName('Summarization Prompt')
            .setDesc('Prompt for summarizing history. Use {text_to_summarize}.')
            .addTextArea(text => text
              .setPlaceholder(DEFAULT_SETTINGS.summarizationPrompt)
              .setValue(this.plugin.settings.summarizationPrompt)
              .onChange(async (value) => {
                this.plugin.settings.summarizationPrompt = value || DEFAULT_SETTINGS.summarizationPrompt;
                await this.plugin.saveSettings();
              })
              // Зробимо поле трохи більшим
              .inputEl.setAttrs({ rows: 4 })
            );
        }

        // Кількість повідомлень перед підсумовуванням
        new Setting(containerEl)
          .setName('Keep Last N Messages Before Summary')
          .setDesc('Number of recent messages kept verbatim before considering summarization.')
          .addText(text => text
            .setPlaceholder(DEFAULT_SETTINGS.keepLastNMessagesBeforeSummary.toString())
            .setValue(this.plugin.settings.keepLastNMessagesBeforeSummary.toString())
            .onChange(async (value) => {
              const num = parseInt(value.trim(), 10);
              this.plugin.settings.keepLastNMessagesBeforeSummary = (!isNaN(num) && num >= 0) ? num : DEFAULT_SETTINGS.keepLastNMessagesBeforeSummary;
              await this.plugin.saveSettings();
            }));

        // Розмір чанку для підсумовування
        new Setting(containerEl)
          .setName('Summarization Chunk Size (Tokens)')
          .setDesc('Approximate token size of message chunks processed for summarization.')
          .addText(text => text
            .setPlaceholder(DEFAULT_SETTINGS.summarizationChunkSize.toString())
            .setValue(this.plugin.settings.summarizationChunkSize.toString())
            .onChange(async (value) => {
              const num = parseInt(value.trim(), 10);
              // Встановлюємо мінімальний розумний розмір, наприклад 100
              this.plugin.settings.summarizationChunkSize = (!isNaN(num) && num > 100) ? num : DEFAULT_SETTINGS.summarizationChunkSize;
              await this.plugin.saveSettings();
            }));
      }
    }
    // --- End Productivity Assistant Features ---


    // --- Appearance Settings ---
    containerEl.createEl('h3', { text: 'Appearance' });
    // ... (User Avatar Style, User Initials/Icon, AI Avatar Style, AI Initials/Icon, Max Message Height) ...
    new Setting(containerEl).setName('User Avatar Style').addDropdown(dropdown => dropdown.addOption('initials', 'Initials').addOption('icon', 'Icon').setValue(this.plugin.settings.userAvatarType).onChange(async (value: AvatarType) => { this.plugin.settings.userAvatarType = value; await this.plugin.saveSettings(); this.display(); }));
    if (this.plugin.settings.userAvatarType === 'initials') { new Setting(containerEl).setName('User Initials').setDesc('Max 2 characters.').addText(text => text.setValue(this.plugin.settings.userAvatarContent).onChange(async (value) => { this.plugin.settings.userAvatarContent = value.trim().substring(0, 2) || 'U'; await this.plugin.saveSettings(); })); }
    else { new Setting(containerEl).setName('User Icon ID').setDesc('Enter an Obsidian icon ID (e.g., "user", "lucide-user").').addText(text => text.setPlaceholder('user').setValue(this.plugin.settings.userAvatarContent).onChange(async (value) => { this.plugin.settings.userAvatarContent = value.trim() || 'user'; await this.plugin.saveSettings(); })); }
    new Setting(containerEl).setName('AI Avatar Style').addDropdown(dropdown => dropdown.addOption('initials', 'Initials').addOption('icon', 'Icon').setValue(this.plugin.settings.aiAvatarType).onChange(async (value: AvatarType) => { this.plugin.settings.aiAvatarType = value; await this.plugin.saveSettings(); this.display(); }));
    if (this.plugin.settings.aiAvatarType === 'initials') { new Setting(containerEl).setName('AI Initials').setDesc('Max 2 characters.').addText(text => text.setValue(this.plugin.settings.aiAvatarContent).onChange(async (value) => { this.plugin.settings.aiAvatarContent = value.trim().substring(0, 2) || 'AI'; await this.plugin.saveSettings(); })); }
    else { new Setting(containerEl).setName('AI Icon ID').setDesc('Enter an Obsidian icon ID (e.g., "bot", "lucide-bot").').addText(text => text.setPlaceholder('bot').setValue(this.plugin.settings.aiAvatarContent).onChange(async (value) => { this.plugin.settings.aiAvatarContent = value.trim() || 'bot'; await this.plugin.saveSettings(); })); }
    new Setting(containerEl).setName('Max Message Height (pixels)').setDesc("Collapse longer messages, showing a 'Show More' button. Set to 0 to disable collapsing.").addText(text => text.setPlaceholder('Example: 300').setValue(this.plugin.settings.maxMessageHeight.toString()).onChange(async (value) => { const num = parseInt(value.trim(), 10); if (!isNaN(num) && num >= 0) { this.plugin.settings.maxMessageHeight = num; } else { this.plugin.settings.maxMessageHeight = DEFAULT_SETTINGS.maxMessageHeight; } await this.plugin.saveSettings(); }));


    // --- Speech & Translation Settings ---
    containerEl.createEl('h3', { text: 'Speech & Translation' });
    // ... (Google API Key (STT), Speech Recognition Language, Enable Translation, Target Language, Google Translation API Key) ...
    new Setting(containerEl).setName('Google API Key (Speech-to-Text)').setDesc('Required for the voice input feature. Keep this confidential.').addText(text => text.setPlaceholder('Enter your API Key').setValue(this.plugin.settings.googleApiKey).onChange(async (value) => { this.plugin.settings.googleApiKey = value.trim(); await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Speech Recognition Language').setDesc('Select the language for voice input.').addDropdown(dropdown => { const speechLangs: Record<string, string> = { "uk-UA": "Ukrainian", "en-US": "English (US)", "en-GB": "English (UK)", "de-DE": "German", "fr-FR": "French", "es-ES": "Spanish", "it-IT": "Italian", "ja-JP": "Japanese", "ko-KR": "Korean", "pt-BR": "Portuguese (Brazil)", "ru-RU": "Russian", "zh-CN": "Chinese (Mandarin, Simplified)" }; for (const code in speechLangs) { dropdown.addOption(code, speechLangs[code]); } dropdown.setValue(this.plugin.settings.speechLanguage).onChange(async (value) => { this.plugin.settings.speechLanguage = value; await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('Enable Translation Feature').setDesc('Show buttons to translate messages or input using Google Translate API.').addToggle(toggle => toggle.setValue(this.plugin.settings.enableTranslation).onChange(async (value) => { this.plugin.settings.enableTranslation = value; await this.plugin.saveSettings(); this.display(); }));
    if (this.plugin.settings.enableTranslation) { new Setting(containerEl).setName('Target Translation Language').setDesc('Select the language to translate messages/input into.').addDropdown(dropdown => { for (const code in LANGUAGES) { dropdown.addOption(code, LANGUAGES[code]); } dropdown.setValue(this.plugin.settings.translationTargetLanguage).onChange(async (value) => { this.plugin.settings.translationTargetLanguage = value; await this.plugin.saveSettings(); }); }); new Setting(containerEl).setName('Google Cloud Translation API Key').setDesc('Required for the translation feature. Keep this confidential.').addText(text => text.setPlaceholder('Enter your API Key').setValue(this.plugin.settings.googleTranslationApiKey).onChange(async (value) => { this.plugin.settings.googleTranslationApiKey = value.trim(); await this.plugin.saveSettings(); })); }


    // --- Export Settings ---
    containerEl.createEl('h3', { text: 'Export Settings' });
    // ... (Chat Export Folder Path) ...
    new Setting(containerEl).setName('Chat Export Folder Path').setDesc('Folder within your vault to save exported Markdown chats. Leave empty to save in the vault root.').addText(text => text.setPlaceholder(DEFAULT_SETTINGS.chatExportFolderPath || 'Vault Root').setValue(this.plugin.settings.chatExportFolderPath).onChange(async (value) => { this.plugin.settings.chatExportFolderPath = value.trim(); await this.plugin.saveSettings(); }));

    containerEl.createEl('h3', { text: 'Logging' });

    new Setting(containerEl)
        .setName('Console Log Level')
        .setDesc('Minimum level of messages to show in the developer console (DEBUG shows all).')
        .addDropdown(dropdown => dropdown
             .addOption('DEBUG', 'Debug')
             .addOption('INFO', 'Info')
             .addOption('WARN', 'Warning')
             .addOption('ERROR', 'Error')
             .addOption('NONE', 'None')
             .setValue(this.plugin.settings.consoleLogLevel || 'INFO')
             .onChange(async (value: keyof typeof LogLevel) => {
                 this.plugin.settings.consoleLogLevel = value;
                 await this.plugin.saveSettings();
                 // Негайно оновлюємо рівень в логері
                //  this.plugin.logger?.setConsoleLogLevel(value);
             }));

     new Setting(containerEl)
        .setName('Enable File Logging')
        .setDesc(`Log messages to a file (${this.plugin.manifest.dir}/ai-forge.log). Useful for debugging on mobile.`)
        .addToggle(toggle => toggle
             .setValue(this.plugin.settings.fileLoggingEnabled)
             .onChange(async (value) => {
                 this.plugin.settings.fileLoggingEnabled = value;
                 await this.plugin.saveSettings();
                  // Негайно оновлюємо статус в логері
                //  this.plugin.logger?.setFileLoggingEnabled(value);
                 this.display(); // Перемалювати, щоб показати/сховати залежні налаштування
             }));

     if (this.plugin.settings.fileLoggingEnabled) {
         new Setting(containerEl)
            .setName('File Log Level')
            .setDesc('Minimum level of messages to write to the log file.')
            .addDropdown(dropdown => dropdown
                 .addOption('DEBUG', 'Debug')
                 .addOption('INFO', 'Info')
                 .addOption('WARN', 'Warning')
                 .addOption('ERROR', 'Error')
                 // Немає сенсу вибирати NONE для файлу, якщо він увімкнений
                 .setValue(this.plugin.settings.fileLogLevel || 'WARN')
                 .onChange(async (value: keyof typeof LogLevel) => {
                     this.plugin.settings.fileLogLevel = value;
                     await this.plugin.saveSettings();
                     // Негайно оновлюємо рівень в логері
                    //  this.plugin.logger?.setFileLogLevel(value);
                 }));

         new Setting(containerEl)
            .setName('Log Caller Method Name')
            .setDesc('Include the calling method name in logs ([MethodName] Message). WARNING: May slightly impact performance, especially with frequent DEBUG/INFO logging.')
            .addToggle(toggle => toggle
                 .setValue(this.plugin.settings.logCallerInfo)
                 .onChange(async (value) => {
                     this.plugin.settings.logCallerInfo = value;
                     await this.plugin.saveSettings();
                     // Негайно оновлюємо прапорець в логері
                    //  this.plugin.logger?.setLogCallerInfo?.(value); // Додамо метод setLogCallerInfo в Logger
                 }));
          // Можна додати налаштування шляху та розміру файлу, якщо потрібно
     }

  }
}