// settings.ts
import { App, PluginSettingTab, Setting, TFolder } from "obsidian";
import OllamaPlugin from "./main";

// --- Мови (залишаємо як є) ---
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
export interface OllamaPluginSettings {
  ollamaServerUrl: string;
  modelName: string;
  temperature: number;
  contextWindow: number; // max tokens for context
  userRolesFolderPath: string;
  selectedRolePath: string;
  saveMessageHistory: boolean;
  ragEnabled: boolean;
  ragFolderPath: string;
  googleApiKey: string; // Speech-to-Text
  speechLanguage: string;
  userAvatarType: AvatarType;
  userAvatarContent: string;
  aiAvatarType: AvatarType;
  aiAvatarContent: string;
  maxMessageHeight: number;
  enableTranslation: boolean;
  translationTargetLanguage: string;
  googleTranslationApiKey: string; // Translation
  chatHistoryFolderPath: string; // History .json path in vault
  chatExportFolderPath: string; // Export .md path in vault

  enableProductivityFeatures: boolean; // <-- ГОЛОВНИЙ ПЕРЕМИКАЧ
  dailyTaskFileName: string;           // <-- Назва файлу завдань

  // --- Додані властивості для PromptService ---
  useAdvancedContextStrategy: boolean; // Використовувати розширену стратегію контексту?
  enableSummarization: boolean;        // Увімкнути підсумовування старих повідомлень?
  summarizationPrompt: string;         // Промпт для підсумовування
  keepLastNMessagesBeforeSummary: number; // Скільки останніх повідомлень зберігати перед блоком для підсумовування
  summarizationChunkSize: number;      // Розмір блоку (в токенах) для підсумовування
  followRole: boolean;                 // Чи повинен PromptService завжди завантажувати/використовувати роль (якщо вона вибрана)
  // --------------------------------------------
}

// --- Значення за замовчуванням ---
export const DEFAULT_SETTINGS: OllamaPluginSettings = {
  ollamaServerUrl: "http://localhost:11434",
  modelName: "",
  temperature: 0.7,
  contextWindow: 4096,
  userRolesFolderPath: "",
  selectedRolePath: "",
  saveMessageHistory: true,
  ragEnabled: false,
  ragFolderPath: "",
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
  chatHistoryFolderPath: "Ollama Chats",
  chatExportFolderPath: "",

  enableProductivityFeatures: false, // <-- За замовчуванням вимкнено
  dailyTaskFileName: "Tasks_Today.md", // <-- Ім'я файлу за замовчуванням  useAdvancedContextStrategy: false, // За замовчуванням - вимкнено

  useAdvancedContextStrategy: false,
  enableSummarization: false,        // За замовчуванням - вимкнено
  summarizationPrompt: "Summarize the key points of the preceding conversation concisely, focusing on information relevant for future interactions:\n{text_to_summarize}", // Приклад промпту
  keepLastNMessagesBeforeSummary: 10, // Зберігати останні 10 повідомлень
  summarizationChunkSize: 1500,       // Розмір блоку для підсумовування (токени)
  followRole: true,                  // За замовчуванням - використовувати роль
  // --------------------------------------
};

// --- Тип аватара ---
export type AvatarType = 'initials' | 'icon';

// --- Клас вкладки налаштувань ---
export class OllamaSettingTab extends PluginSettingTab {
  plugin: OllamaPlugin;

  constructor(app: App, plugin: OllamaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Ollama Chat Settings" });

    // --- Connection & Model ---
    containerEl.createEl('h3', { text: 'Connection & Model' });
    // ... (Ollama Server URL, Default Model Name, Default Temperature, Context Window Size) ...
    new Setting(containerEl).setName("Ollama Server URL").setDesc("The URL of your running Ollama server.").addText(text => text.setPlaceholder(DEFAULT_SETTINGS.ollamaServerUrl).setValue(this.plugin.settings.ollamaServerUrl).onChange(async (value) => { this.plugin.settings.ollamaServerUrl = value.trim() || DEFAULT_SETTINGS.ollamaServerUrl; await this.plugin.saveSettings(); this.plugin.updateOllamaServiceConfig(); }));
    new Setting(containerEl).setName("Default Model Name").setDesc("The default Ollama model to use for new chats (e.g., 'llama3:latest', 'mistral'). Needs to be available on your server.").addText(text => text.setPlaceholder("Enter model name").setValue(this.plugin.settings.modelName).onChange(async (value) => { this.plugin.settings.modelName = value.trim(); await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Default Temperature").setDesc("Controls randomness. Lower values (e.g., 0.2) make output more deterministic, higher values (e.g., 0.8) make it more creative.").addSlider(slider => slider.setLimits(0, 1, 0.1).setValue(this.plugin.settings.temperature).setDynamicTooltip().onChange(async (value) => { this.plugin.settings.temperature = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Context Window Size (Tokens)").setDesc("Maximum number of tokens (input + output) the model considers. Adjust based on model and available memory.").addText(text => text.setPlaceholder(DEFAULT_SETTINGS.contextWindow.toString()).setValue(this.plugin.settings.contextWindow.toString()).onChange(async (value) => { const num = parseInt(value.trim(), 10); if (!isNaN(num) && num > 0) { this.plugin.settings.contextWindow = num; } else { this.plugin.settings.contextWindow = DEFAULT_SETTINGS.contextWindow; } await this.plugin.saveSettings(); }));


    // --- Roles & Personas ---
    containerEl.createEl('h3', { text: 'Roles & Personas' });
    // ... (Custom Roles Folder Path) ...
    new Setting(containerEl).setName('Custom Roles Folder Path').setDesc('Folder within your vault containing custom role definition (.md) files.').addText(text => text.setPlaceholder('Example: System Prompts/Ollama Roles').setValue(this.plugin.settings.userRolesFolderPath).onChange(async (value) => { this.plugin.settings.userRolesFolderPath = value.trim(); await this.plugin.saveSettings(); this.plugin.listRoleFiles(true); this.plugin.emit('roles-updated'); }));
    // --- Додано налаштування followRole ---
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

    // --- Storage & History Settings ---
    containerEl.createEl('h3', { text: 'Storage & History' });
    // ... (Save Message History, Chat History Folder Path) ...
    new Setting(containerEl).setName('Save Message History').setDesc('Automatically save chat conversations to files.').addToggle(toggle => toggle.setValue(this.plugin.settings.saveMessageHistory).onChange(async (value) => { this.plugin.settings.saveMessageHistory = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Chat History Folder Path').setDesc('Folder within your vault to store chat history (.json files). Leave empty to save in the vault root.').addText(text => text.setPlaceholder(DEFAULT_SETTINGS.chatHistoryFolderPath || 'Vault Root').setValue(this.plugin.settings.chatHistoryFolderPath).onChange(async (value) => { this.plugin.settings.chatHistoryFolderPath = value.trim(); await this.plugin.saveSettings(); if (this.plugin.chatManager) { this.plugin.chatManager.updateChatsFolderPath(); await this.plugin.chatManager.initialize(); } }));


    // --- RAG Settings ---
    containerEl.createEl('h3', { text: 'Retrieval-Augmented Generation (RAG)' });
    // ... (Enable RAG, RAG Documents Folder Path) ...
    new Setting(containerEl).setName('Enable RAG').setDesc('Allow the chat to retrieve information from your notes for context (requires indexing).').addToggle(toggle => toggle.setValue(this.plugin.settings.ragEnabled).onChange(async (value) => { this.plugin.settings.ragEnabled = value; await this.plugin.saveSettings(); this.display(); }));
    if (this.plugin.settings.ragEnabled) { new Setting(containerEl).setName('RAG Documents Folder Path').setDesc('Folder within your vault containing notes to use for RAG context.').addText(text => text.setPlaceholder('Example: Knowledge Base/RAG Docs').setValue(this.plugin.settings.ragFolderPath).onChange(async (value) => { this.plugin.settings.ragFolderPath = value.trim(); await this.plugin.saveSettings(); })); }


    // --- Advanced Context Management --- <-- Нова секція
    containerEl.createEl('h3', { text: 'Advanced Context Management' });
    new Setting(containerEl)
      .setName('Use Advanced Context Strategy')
      .setDesc('Enables summarization and other techniques to manage long chat histories within the context window.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useAdvancedContextStrategy)
        .onChange(async (value) => {
          this.plugin.settings.useAdvancedContextStrategy = value;
          await this.plugin.saveSettings();
          this.display(); // Re-render to show/hide summarization options
        }));

    if (this.plugin.settings.useAdvancedContextStrategy) {
      new Setting(containerEl)
        .setName('Enable Context Summarization')
        .setDesc('If Advanced Strategy is enabled, allow summarizing older parts of the chat history to save tokens.')
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.enableSummarization)
          .onChange(async (value) => {
            this.plugin.settings.enableSummarization = value;
            await this.plugin.saveSettings();
            this.display(); // Re-render to show/hide prompt option
          }));

      if (this.plugin.settings.enableSummarization) {
        new Setting(containerEl)
          .setName('Summarization Prompt')
          .setDesc('The prompt used to instruct the model how to summarize chat history. Use {text_to_summarize} placeholder.')
          .addTextArea(text => text
            .setPlaceholder(DEFAULT_SETTINGS.summarizationPrompt)
            .setValue(this.plugin.settings.summarizationPrompt)
            .onChange(async (value) => {
              this.plugin.settings.summarizationPrompt = value || DEFAULT_SETTINGS.summarizationPrompt;
              await this.plugin.saveSettings();
            }));
      }

      new Setting(containerEl)
        .setName('Keep Last N Messages Before Summary')
        .setDesc('Number of recent messages to always keep verbatim before considering summarization.')
        .addText(text => text
          .setPlaceholder(DEFAULT_SETTINGS.keepLastNMessagesBeforeSummary.toString())
          .setValue(this.plugin.settings.keepLastNMessagesBeforeSummary.toString())
          .onChange(async (value) => {
            const num = parseInt(value.trim(), 10);
            this.plugin.settings.keepLastNMessagesBeforeSummary = (!isNaN(num) && num >= 0) ? num : DEFAULT_SETTINGS.keepLastNMessagesBeforeSummary;
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('Summarization Chunk Size (Tokens)')
        .setDesc('Approximate size (in tokens) of message chunks processed for summarization.')
        .addText(text => text
          .setPlaceholder(DEFAULT_SETTINGS.summarizationChunkSize.toString())
          .setValue(this.plugin.settings.summarizationChunkSize.toString())
          .onChange(async (value) => {
            const num = parseInt(value.trim(), 10);
            this.plugin.settings.summarizationChunkSize = (!isNaN(num) && num > 100) ? num : DEFAULT_SETTINGS.summarizationChunkSize; // Ensure minimum size
            await this.plugin.saveSettings();
          }));
    }
    // --- End Advanced Context Management ---


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

  }
}