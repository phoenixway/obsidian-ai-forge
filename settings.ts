// settings.ts
import {
  App,
  PluginSettingTab,
  Setting,
  DropdownComponent,
  Notice,
  TextComponent,
  TextAreaComponent,
  ButtonComponent
} from "obsidian";
import OllamaPlugin from "./main";

export const LANGUAGES: Record<string, string> = {
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


export type AvatarType = 'initials' | 'icon';


export interface OllamaPluginSettings {
  // --- Core Ollama Settings ---
  modelName: string;
  ollamaServerUrl: string;
  temperature: number;
  // --- Context ---
  contextWindow: number; // Model context window (tokens)
  useAdvancedContextStrategy: boolean; // Enable tokenizer & programmatic check?
  enableSummarization: boolean;      // Enable summarization (only if useAdvancedContextStrategy=true)?
  summarizationPrompt: string;       // Prompt for summarization
  summarizationChunkSize: number;    // History chunk size for summarization (in tokens)
  keepLastNMessagesBeforeSummary: number; // How many recent messages not to summarize
  // --- Role Configuration ---
  followRole: boolean;
  selectedRolePath: string; // Path to the currently selected role file
  userRolesFolderPath: string; // Folder for user-defined roles
  systemPromptInterval: number;
  // --- Chat History ---
  saveMessageHistory: boolean;
  logFileSizeLimit: number; // Size in KB
  // --- RAG ---
  ragEnabled: boolean;
  ragFolderPath: string;
  contextWindowSize: number; // Number of RAG documents
  // --- Appearance (UI/UX) ---
  userAvatarType: AvatarType;
  userAvatarContent: string; // Initials or Obsidian icon name
  aiAvatarType: AvatarType;
  aiAvatarContent: string; // Initials or Obsidian icon name
  maxMessageHeight: number; // Max message height before collapsing (px), 0 = disabled
  // --- Speech Recognition ---
  googleApiKey: string;
  speechLanguage: string;
  maxRecordingTime: number;
  silenceDetection: boolean;
  // --- Service Management ---
  ollamaRestartCommand: string; // Command to restart Ollama service
  enableTranslation: boolean;
  translationTargetLanguage: string; // ISO 639-1 code
  googleTranslationApiKey: string; // Separate key for translation
}

export const DEFAULT_SETTINGS: OllamaPluginSettings = {
  modelName: "mistral", // Default model
  ollamaServerUrl: "http://localhost:11434",
  temperature: 0.1,
  contextWindow: 8192, // User's default context window setting
  useAdvancedContextStrategy: false, // Disabled by default
  enableSummarization: false,       // Disabled by default
  summarizationPrompt: `Briefly summarize the following conversation excerpt, focusing on key decisions, questions, and outcomes. Maintain a neutral tone and stick to the facts:\n\n---\n{text_to_summarize}\n---\n\nSummary:`, // Default English prompt
  summarizationChunkSize: 1500, // Approx. chunk size to summarize
  keepLastNMessagesBeforeSummary: 6, // Keep last 6 messages verbatim
  saveMessageHistory: true,
  logFileSizeLimit: 1024, // 1MB
  followRole: true,
  selectedRolePath: "", // Default to no role selected
  userRolesFolderPath: "ollama/roles", // Example default path for user roles
  systemPromptInterval: 0,
  ragEnabled: false,
  ragFolderPath: "data", // Default RAG folder
  contextWindowSize: 5, // RAG docs count
  userAvatarType: 'initials',
  userAvatarContent: 'U',
  aiAvatarType: 'icon',
  aiAvatarContent: 'bot', // Obsidian icon name
  maxMessageHeight: 300, // Collapse messages taller than 300px
  googleApiKey: "",
  speechLanguage: "en-US", // Default language English
  maxRecordingTime: 15,
  silenceDetection: true,
  ollamaRestartCommand: "", // Empty by default for safety
  enableTranslation: false,
  translationTargetLanguage: "uk", // Default to Ukrainian
  googleTranslationApiKey: "",

};

export class OllamaSettingTab extends PluginSettingTab {
  plugin: OllamaPlugin;

  constructor(app: App, plugin: OllamaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getDisplayText(): string { return "Ollama Chat"; } // Changed display name
  getId(): string { return "ollama-chat-plugin"; } // Changed ID for clarity

  // Icon search helper
  private createIconSearch(containerEl: HTMLElement, settingType: 'user' | 'ai') {
    const searchContainer = containerEl.createDiv({ cls: 'ollama-icon-search-container' });
    let searchInput: TextComponent;
    let resultsEl: HTMLElement;
    const performSearch = () => {
      const query = searchInput.getValue().toLowerCase().trim();
      resultsEl.empty();
      if (!query) return;
      // @ts-ignore - Access Obsidian's internal icon list (unofficial API)
      const allIcons = window.require('obsidian')?.getIconIds?.() || [];
      const filteredIcons = allIcons.filter((icon: string) => icon.includes(query)).slice(0, 50); // Limit results
      if (filteredIcons.length > 0) {
        filteredIcons.forEach((icon: string) => {
          const iconEl = resultsEl.createEl('button', { cls: 'ollama-icon-search-result' });
          // @ts-ignore
          window.require('obsidian').setIcon(iconEl, icon);
          iconEl.setAttribute('aria-label', icon);
          iconEl.onClickEvent(() => {
            if (settingType === 'user') this.plugin.settings.userAvatarContent = icon;
            else this.plugin.settings.aiAvatarContent = icon;
            this.plugin.saveSettings(); this.display(); // Redraw settings UI
          });
        });
      } else { resultsEl.setText('No icons found.'); }
    };
    searchInput = new TextComponent(searchContainer).setPlaceholder('Search Obsidian icons...').onChange(performSearch);
    resultsEl = searchContainer.createDiv({ cls: 'ollama-icon-search-results' });
  }

  // // Add Icon Search Styles
  // private addIconSearchStyles() {
  //   const styleId = 'ollama-icon-search-styles'; if (document.getElementById(styleId)) return; const style = document.createElement('style'); style.id = styleId; style.textContent = `
  //       .ollama-settings .setting-item-control .ollama-icon-search-container { margin-top: 8px; border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 8px; background-color: var(--background-secondary); } .ollama-settings .setting-item-control .ollama-icon-search-container input[type="text"] { width: 100%; margin-bottom: 8px; } .ollama-settings .setting-item-control .ollama-icon-search-results { display: flex; flex-wrap: wrap; gap: 4px; max-height: 150px; overflow-y: auto; background-color: var(--background-primary); border-radius: 4px; padding: 4px; } .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar { width: 6px; } .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-track { background: var(--background-secondary); border-radius: 3px; } .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-thumb { background-color: var(--background-modifier-border); border-radius: 3px; } .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-thumb:hover { background-color: var(--interactive-accent-translucent); } .ollama-settings .setting-item-control .ollama-icon-search-result { background-color: var(--background-modifier-hover); border: 1px solid transparent; border-radius: 4px; padding: 4px; cursor: pointer; transition: all 0.1s ease-out; color: var(--text-muted); display: flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; } .ollama-settings .setting-item-control .ollama-icon-search-result:hover { background-color: var(--background-modifier-border); border-color: var(--interactive-accent-translucent); color: var(--text-normal); } .ollama-settings .setting-item-control .ollama-icon-search-result .svg-icon { width: 16px; height: 16px; } .ollama-subtle-notice { opacity: 0.7; font-size: var(--font-ui-smaller); margin-top: 5px; margin-bottom: 10px; padding-left: 10px; border-left: 2px solid var(--background-modifier-border); }
  //       `; document.head.appendChild(style);
  // }


  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('ollama-settings');

    // --- SECTION: Core Ollama Settings ---
    containerEl.createEl("h2", { text: "Core Ollama Settings" });

    new Setting(containerEl).setName("Ollama Server URL")
      .setDesc("IP address and port where Ollama is running (e.g., http://localhost:11434)")
      .addText(text => text.setPlaceholder("http://localhost:11434").setValue(this.plugin.settings.ollamaServerUrl)
        .onChange(async v => { this.plugin.settings.ollamaServerUrl = v.trim(); await this.plugin.saveSettings(); this.plugin.promptService.clearModelDetailsCache(); this.display(); }));

    // --- ЗМІНЕНО ТУТ: Використання ollamaService та emit ---
    new Setting(containerEl).setName("Server Connection")
      .setDesc("Reconnect to the server and refresh available models")
      .addButton(button => button.setButtonText("Reconnect").setIcon("refresh-cw")
        .onClick(async () => {
          this.plugin.promptService.clearModelDetailsCache(); // Clear cache first
          try {
            new Notice("Connecting...");
            // Use correct service name
            await this.plugin.ollamaService.getModels(); // <--- Змінено тут
            new Notice("Successfully connected!");
            this.display();
          } catch (e: any) {
            const errorMsg = `Connection failed: ${e.message}.`;
            new Notice(errorMsg);
            // Use plugin emitter instead of calling view directly
            this.plugin.emit('ollama-connection-error', errorMsg); // <--- Змінено тут
          }
        })
      );
    // --- КІНЕЦЬ ЗМІН ---

    // --- ЗМІНЕНО ТУТ: Використання ollamaService ---
    let availableModels: string[] = [];
    try {
      availableModels = await this.plugin.ollamaService.getModels(); // <--- Змінено тут
    } catch (e) {
      console.error("[Settings] Initial model fetch failed:", e);
    }
    // --- КІНЕЦЬ ЗМІН ---

    new Setting(containerEl).setName("Chat Model")
      .setDesc("Select the default language model for new chats")
      .addDropdown(dd => { const s = dd.selectEl; s.empty(); if (availableModels.length > 0) { availableModels.forEach(m => dd.addOption(m, m)); const c = this.plugin.settings.modelName; if (availableModels.includes(c)) dd.setValue(c); else { dd.setValue(availableModels[0]); this.plugin.settings.modelName = availableModels[0]; this.plugin.saveSettings(); } } else { dd.addOption("", "No models found"); dd.setDisabled(true); } dd.onChange(async v => { this.plugin.settings.modelName = v; this.plugin.emit('model-changed', v); await this.plugin.saveSettings(); }); });

    new Setting(containerEl).setName("Temperature")
      .setDesc("Controls response randomness (0.0 = deterministic, 1.0 = creative)")
      .addSlider(slider => slider.setLimits(0, 1, 0.1).setValue(this.plugin.settings.temperature).setDynamicTooltip().onChange(async v => { this.plugin.settings.temperature = v; await this.plugin.saveSettings(); }));

    // --- SECTION: Context Management ---
    containerEl.createEl("h2", { text: "Context Management" });
    new Setting(containerEl).setName("Model Context Window (tokens)").setDesc("User-defined max tokens. Effective limit may be lower if detected.").addText(t => t.setPlaceholder(String(DEFAULT_SETTINGS.contextWindow)).setValue(String(this.plugin.settings.contextWindow)).onChange(async v => { const n = parseInt(v); if (!isNaN(n) && n > 0) { this.plugin.settings.contextWindow = n; await this.plugin.saveSettings(); } else { new Notice("Positive number required."); t.setValue(String(this.plugin.settings.contextWindow)); } }));
    new Setting(containerEl).setName("Experimental: Advanced Context Strategy").setDesc("Use tokenizer & programmatic limit detection.").addToggle(t => t.setValue(this.plugin.settings.useAdvancedContextStrategy).onChange(async v => { this.plugin.settings.useAdvancedContextStrategy = v; await this.plugin.saveSettings(); new Notice(`Advanced Context: ${v ? 'Enabled' : 'Disabled'}`); this.display(); }));
    if (this.plugin.settings.useAdvancedContextStrategy) { containerEl.createEl("h4", { text: "Automatic History Summarization (Experimental)" }); new Setting(containerEl).setName("Enable Summarization").setDesc("Summarize old history. WARNING: Slows responses!").addToggle(t => t.setValue(this.plugin.settings.enableSummarization).onChange(async v => { this.plugin.settings.enableSummarization = v; await this.plugin.saveSettings(); })); new Setting(containerEl).setName("Summarization Prompt").setDesc("Instruction. Use {text_to_summarize}.").addTextArea(t => { t.setPlaceholder(DEFAULT_SETTINGS.summarizationPrompt).setValue(this.plugin.settings.summarizationPrompt).onChange(async v => { this.plugin.settings.summarizationPrompt = v; await this.plugin.saveSettings(); }); t.inputEl.rows = 5; }); new Setting(containerEl).setName("Summarization Chunk Size (tokens)").setDesc("History block size to summarize.").addText(t => t.setPlaceholder(String(DEFAULT_SETTINGS.summarizationChunkSize)).setValue(String(this.plugin.settings.summarizationChunkSize)).onChange(async v => { const n = parseInt(v); if (!isNaN(n) && n > 100) { this.plugin.settings.summarizationChunkSize = n; await this.plugin.saveSettings(); } else { new Notice("Enter > 100."); t.setValue(String(this.plugin.settings.summarizationChunkSize)); } })); new Setting(containerEl).setName("Keep Last N Messages").setDesc("Messages never summarized.").addSlider(s => s.setLimits(0, 20, 1).setValue(this.plugin.settings.keepLastNMessagesBeforeSummary).setDynamicTooltip().onChange(async v => { this.plugin.settings.keepLastNMessagesBeforeSummary = v; await this.plugin.saveSettings(); })); } else { containerEl.createEl('p', { text: 'Using basic context management (word count).', cls: 'setting-item-description ollama-subtle-notice' }); }

    // --- SECTION: AI Role Configuration ---
    containerEl.createEl("h2", { text: "AI Role Configuration" });
    new Setting(containerEl).setName("Enable Role").setDesc("Make Ollama follow a defined role.").addToggle(t => t.setValue(this.plugin.settings.followRole).onChange(async v => { this.plugin.settings.followRole = v; await this.plugin.saveSettings(); this.display(); }));
    if (this.plugin.settings.followRole) { new Setting(containerEl).setName("User Roles Folder Path").setDesc("Path to folder with custom '.md' role files (vault relative). Type the path.").addText(t => t.setPlaceholder(DEFAULT_SETTINGS.userRolesFolderPath).setValue(this.plugin.settings.userRolesFolderPath).onChange(async v => { this.plugin.settings.userRolesFolderPath = v.trim(); await this.plugin.saveSettings(); this.plugin.promptService.clearRoleCache?.(); if (this.plugin.view) this.plugin.view.renderRoleList(); })); new Setting(containerEl).setName("System Prompt Interval").setDesc("Msg pairs between resends (0=always, <0=never).").addText(t => t.setValue(String(this.plugin.settings.systemPromptInterval)).onChange(async v => { this.plugin.settings.systemPromptInterval = parseInt(v) || 0; await this.plugin.saveSettings(); })); containerEl.createEl('p', { text: `Selected Role: ${this.plugin.settings.selectedRolePath || "None"}. Select in chat menu.`, cls: 'setting-item-description ollama-subtle-notice' }); }

    // --- SECTION: Chat History ---
    containerEl.createEl("h2", { text: "Chat History" });
    new Setting(containerEl).setName("Save Message History").setDesc("Save history between sessions").addToggle(t => t.setValue(this.plugin.settings.saveMessageHistory).onChange(async v => { this.plugin.settings.saveMessageHistory = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Log File Size Limit (KB)").setDesc("Max history file size").addSlider(s => s.setLimits(256, 10240, 256).setValue(this.plugin.settings.logFileSizeLimit).setDynamicTooltip().onChange(async v => { this.plugin.settings.logFileSizeLimit = v; await this.plugin.saveSettings(); })).addExtraButton(b => b.setIcon('reset').setTooltip('Reset (1024 KB)').onClick(async () => { this.plugin.settings.logFileSizeLimit = DEFAULT_SETTINGS.logFileSizeLimit; await this.plugin.saveSettings(); this.display(); }));
    new Setting(containerEl).setName("Clear Active History").setDesc("Delete messages in the active chat session").addButton(b => b.setButtonText("Clear Active Chat").onClick(async () => { await this.plugin.chatManager.clearActiveChatMessages(); })); // Calls manager

    // --- SECTION: RAG Configuration ---
    containerEl.createEl("h2", { text: "RAG Configuration" });
    new Setting(containerEl).setName("Enable RAG").setDesc("Use Retrieval Augmented Generation").addToggle(t => t.setValue(this.plugin.settings.ragEnabled).onChange(async v => { this.plugin.settings.ragEnabled = v; await this.plugin.saveSettings(); if (v && this.plugin.ragService) { new Notice("RAG enabled. Indexing..."); setTimeout(() => this.plugin.ragService?.indexDocuments(), 100); } }));
    new Setting(containerEl).setName("RAG Folder Path").setDesc("Folder with documents for RAG").addText(t => t.setPlaceholder("data/rag_docs").setValue(this.plugin.settings.ragFolderPath).onChange(async v => { this.plugin.settings.ragFolderPath = v.trim(); await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("RAG Documents in Context").setDesc("Number of relevant chunks").addSlider(s => s.setLimits(1, 10, 1).setValue(this.plugin.settings.contextWindowSize).setDynamicTooltip().onChange(async v => { this.plugin.settings.contextWindowSize = v; await this.plugin.saveSettings(); }));

    // --- SECTION: Appearance (UI/UX) ---
    containerEl.createEl("h2", { text: "Appearance (UI/UX)" });
    containerEl.createEl("h4", { text: "User Avatar" }); new Setting(containerEl).setName("Type").addDropdown(dd => dd.addOption('initials', 'Initials').addOption('icon', 'Obsidian Icon').setValue(this.plugin.settings.userAvatarType).onChange(async (v: AvatarType) => { this.plugin.settings.userAvatarType = v; await this.plugin.saveSettings(); this.display(); })); if (this.plugin.settings.userAvatarType === 'initials') { new Setting(containerEl).setName("Initials").setDesc("1-2 letters").addText(t => t.setValue(this.plugin.settings.userAvatarContent).onChange(async v => { this.plugin.settings.userAvatarContent = v.substring(0, 2).toUpperCase(); await this.plugin.saveSettings(); })); } else { new Setting(containerEl).setName("Icon").setDesc("Obsidian icon name").addText(t => t.setValue(this.plugin.settings.userAvatarContent).setPlaceholder('e.g. user').onChange(async v => { this.plugin.settings.userAvatarContent = v.trim(); await this.plugin.saveSettings(); })); this.createIconSearch(containerEl, 'user'); }
    containerEl.createEl("h4", { text: "AI Avatar" }); new Setting(containerEl).setName("Type").addDropdown(dd => dd.addOption('initials', 'Initials').addOption('icon', 'Obsidian Icon').setValue(this.plugin.settings.aiAvatarType).onChange(async (v: AvatarType) => { this.plugin.settings.aiAvatarType = v; await this.plugin.saveSettings(); this.display(); })); if (this.plugin.settings.aiAvatarType === 'initials') { new Setting(containerEl).setName("Initials").setDesc("1-2 letters").addText(t => t.setValue(this.plugin.settings.aiAvatarContent).onChange(async v => { this.plugin.settings.aiAvatarContent = v.substring(0, 2).toUpperCase(); await this.plugin.saveSettings(); })); } else { new Setting(containerEl).setName("Icon").setDesc("Obsidian icon name").addText(t => t.setValue(this.plugin.settings.aiAvatarContent).setPlaceholder('e.g. bot').onChange(async v => { this.plugin.settings.aiAvatarContent = v.trim(); await this.plugin.saveSettings(); })); this.createIconSearch(containerEl, 'ai'); }
    new Setting(containerEl).setName("Max Message Height (px)").setDesc("Longer messages collapse. 0 disables.").addText(t => t.setPlaceholder("300").setValue(String(this.plugin.settings.maxMessageHeight)).onChange(async v => { const n = parseInt(v); if (!isNaN(n) && n >= 0) { this.plugin.settings.maxMessageHeight = n; await this.plugin.saveSettings(); } else { new Notice("Enter 0 or positive number."); t.setValue(String(this.plugin.settings.maxMessageHeight)); } }));

    // --- SECTION: Speech Recognition ---
    containerEl.createEl("h2", { text: "Speech Recognition" });
    new Setting(containerEl).setName("Google API Key").setDesc("API key for Google Speech-to-Text").addText(t => t.setPlaceholder("Enter Google API key").setValue(this.plugin.settings.googleApiKey).onChange(async v => { this.plugin.settings.googleApiKey = v.trim(); await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Recognition Language").setDesc("Language code (e.g., en-US, uk-UA)").addText(t => t.setPlaceholder("en-US").setValue(this.plugin.settings.speechLanguage).onChange(async v => { this.plugin.settings.speechLanguage = v.trim(); await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Max Recording Time (sec)").setDesc("Maximum recording time").addSlider(s => s.setLimits(5, 60, 5).setValue(this.plugin.settings.maxRecordingTime).setDynamicTooltip().onChange(async v => { this.plugin.settings.maxRecordingTime = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Silence Detection").setDesc("Stop recording after silence").addToggle(t => t.setValue(this.plugin.settings.silenceDetection).onChange(async v => { this.plugin.settings.silenceDetection = v; await this.plugin.saveSettings(); }));

    // --- SECTION: Service Management (Advanced & Potentially Risky) ---
    containerEl.createEl("h2", { text: "Service Management (Advanced)" });
    new Setting(containerEl)
      .setName("Ollama Service Restart Command")
      .setDesc("System command to restart Ollama service. WARNING: Use with caution! Security implications apply.")
      .addText(text => { // Починаємо callback для addText
        text
          .setPlaceholder("e.g., systemctl restart ollama")
          .setValue(this.plugin.settings.ollamaRestartCommand)
          .onChange(async (value) => {
            this.plugin.settings.ollamaRestartCommand = value.trim();
            await this.plugin.saveSettings();
          });
        // --- ЗМІНЕНО ТУТ: Встановлюємо стиль ПІСЛЯ ланцюжка ---
        text.inputEl.style.width = "100%";
        // ---------------------------------------------
      }); // <-- Прибрано зайву крапку з комою    new Setting(containerEl).setName("Restart Ollama Service").setDesc("Attempt to execute the command above.").addButton(b => b.setButtonText("Restart Service").setIcon("refresh-ccw-dot").setWarning().onClick(async () => { const cmd = this.plugin.settings.ollamaRestartCommand; if (!cmd) { new Notice("No command entered."); return; } if (!confirm(`Execute?\n\n'${cmd}'\n\nThis could have unintended consequences.`)) return; new Notice(`Executing: ${cmd}`); try { const r = await this.plugin.executeSystemCommand(cmd); if (r.error) { new Notice(`Exec failed: ${r.error.message}`); } else if (r.stderr) { new Notice(`Exec stderr: ${r.stderr.split('\n')[0]}`); } else { new Notice("Exec success. Reconnect maybe needed."); this.plugin.promptService.clearModelDetailsCache(); } } catch (e: any) { new Notice(`Exec error: ${e.message}`); } }));
    containerEl.createEl('h3', { text: 'Translation Settings' });

    new Setting(containerEl)
      .setName('Enable Translation Feature')
      .setDesc('Show a button to translate messages using Google Translate API.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableTranslation)
        .onChange(async (value) => {
          this.plugin.settings.enableTranslation = value;
          await this.plugin.saveSettings();
          this.display(); // Re-render to show/hide related settings
        }));

    if (this.plugin.settings.enableTranslation) {
      new Setting(containerEl)
        .setName('Target Translation Language')
        .setDesc('Select the language to translate messages into.')
        .addDropdown(dropdown => {
          // Add an empty option for 'disabled' or default
          // dropdown.addOption('', 'Select Language');
          for (const code in LANGUAGES) {
            dropdown.addOption(code, LANGUAGES[code]);
          }
          dropdown
            .setValue(this.plugin.settings.translationTargetLanguage)
            .onChange(async (value) => {
              this.plugin.settings.translationTargetLanguage = value;
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName('Google Cloud Translation API Key')
        .setDesc('Required for the translation feature. Keep this confidential.')
        .addText(text => text
          .setPlaceholder('Enter your API Key')
          .setValue(this.plugin.settings.googleTranslationApiKey)
          .onChange(async (value) => {
            this.plugin.settings.googleTranslationApiKey = value.trim();
            await this.plugin.saveSettings();
          }));
    }




    this.addIconSearchStyles();
  }

  // Adds CSS styles for icon search dynamically
  private addIconSearchStyles() { const s = 'ollama-icon-search-styles'; if (document.getElementById(s)) return; const e = document.createElement('style'); e.id = s; e.textContent = ` .ollama-settings .setting-item-control .ollama-icon-search-container{margin-top:8px;border:1px solid var(--background-modifier-border);border-radius:6px;padding:8px;background-color:var(--background-secondary)}.ollama-settings .setting-item-control .ollama-icon-search-container input[type=text]{width:100%;margin-bottom:8px}.ollama-settings .setting-item-control .ollama-icon-search-results{display:flex;flex-wrap:wrap;gap:4px;max-height:150px;overflow-y:auto;background-color:var(--background-primary);border-radius:4px;padding:4px}.ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar{width:6px}.ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-track{background:var(--background-secondary);border-radius:3px}.ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-thumb{background-color:var(--background-modifier-border);border-radius:3px}.ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-thumb:hover{background-color:var(--interactive-accent-translucent)}.ollama-settings .setting-item-control .ollama-icon-search-result{background-color:var(--background-modifier-hover);border:1px solid transparent;border-radius:4px;padding:4px;cursor:pointer;transition:all .1s ease-out;color:var(--text-muted);display:flex;align-items:center;justify-content:center;min-width:28px;height:28px}.ollama-settings .setting-item-control .ollama-icon-search-result:hover{background-color:var(--background-modifier-border);border-color:var(--interactive-accent-translucent);color:var(--text-normal)}.ollama-settings .setting-item-control .ollama-icon-search-result .svg-icon{width:16px;height:16px}.ollama-subtle-notice{opacity:.7;font-size:var(--font-ui-smaller);margin-top:5px;margin-bottom:10px;padding-left:10px;border-left:2px solid var(--background-modifier-border)} `; document.head.appendChild(e); }
}