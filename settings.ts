import {
  App,
  PluginSettingTab,
  Setting,
  DropdownComponent,
  Notice,
  TextComponent,
  TextAreaComponent, // Added for multi-line prompt
  ButtonComponent
} from "obsidian";
import OllamaPlugin from "./main";

// Types for avatar settings
export type AvatarType = 'initials' | 'icon';

export interface OllamaPluginSettings {
  // --- Core ---
  modelName: string;
  ollamaServerUrl: string;
  temperature: number;
  // --- Context ---
  contextWindow: number; // User-defined model context window in tokens
  useAdvancedContextStrategy: boolean; // Enable tokenizer & programmatic check?
  enableSummarization: boolean;      // Enable summarization (only if useAdvancedContextStrategy=true)?
  summarizationPrompt: string;       // Prompt for summarization
  summarizationChunkSize: number;    // History chunk size for summarization (in tokens)
  keepLastNMessagesBeforeSummary: number; // How many recent messages not to summarize
  // --- History ---
  saveMessageHistory: boolean;
  logFileSizeLimit: number; // Size in KB
  // --- Role ---
  followRole: boolean;
  useDefaultRoleDefinition: boolean;
  customRoleFilePath: string;
  systemPromptInterval: number;
  // --- RAG ---
  ragEnabled: boolean;
  ragFolderPath: string;
  contextWindowSize: number; // Number of RAG documents
  // --- UI/UX ---
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
  useDefaultRoleDefinition: true,
  customRoleFilePath: "",
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
};

export class OllamaSettingTab extends PluginSettingTab {
  plugin: OllamaPlugin;

  constructor(app: App, plugin: OllamaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getDisplayText(): string { return "Ollama Chat"; }
  getId(): string { return "ollama-chat-plugin"; }

  // Helper function for icon search
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

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('ollama-settings');

    // --- Basic Configuration ---
    containerEl.createEl("h2", { text: "Basic Configuration" });

    new Setting(containerEl)
      .setName("Ollama Server URL")
      .setDesc("IP address and port where Ollama is running (e.g., http://192.168.1.10:11434)")
      .addText((text) => text.setPlaceholder("http://localhost:11434").setValue(this.plugin.settings.ollamaServerUrl)
        .onChange(async (value) => { this.plugin.settings.ollamaServerUrl = value.trim(); await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName("Server Connection")
      .setDesc("Reconnect to the local model server and refresh the list of available models")
      .addButton((button) => button.setButtonText("Reconnect").setIcon("refresh-cw")
        .onClick(async () => { try { new Notice("Connecting to Ollama server..."); await this.plugin.apiService.getModels(); new Notice("Successfully connected to Ollama server!"); this.display(); } catch (error: any) { new Notice(`Connection failed: ${error.message}. Check URL and server status.`); if (this.plugin.view) { this.plugin.view.internalAddMessage("error", `Failed to connect to Ollama: ${error.message}. Please check settings.`); } } })
      );

    let availableModels: string[] = [];
    try { availableModels = await this.plugin.apiService.getModels(); } catch (e) { /* error handled above */ }

    new Setting(containerEl)
      .setName("Model Name")
      .setDesc("Select the language model to use")
      .addDropdown((dropdown) => {
        const selectEl = dropdown.selectEl; selectEl.empty();
        if (availableModels.length > 0) {
          availableModels.forEach((model) => dropdown.addOption(model, model));
          const currentModel = this.plugin.settings.modelName;
          if (availableModels.includes(currentModel)) dropdown.setValue(currentModel);
          else { dropdown.setValue(availableModels[0]); this.plugin.settings.modelName = availableModels[0]; this.plugin.saveSettings(); }
        } else { dropdown.addOption("", "No models found"); dropdown.setDisabled(true); }
        dropdown.onChange(async (value) => { this.plugin.settings.modelName = value; this.plugin.emit('model-changed', value); await this.plugin.saveSettings(); });
      });

    new Setting(containerEl)
      .setName("Temperature")
      .setDesc("Controls randomness in model responses (0.0 - 1.0)")
      .addSlider((slider) => slider.setLimits(0, 1, 0.1).setValue(this.plugin.settings.temperature).setDynamicTooltip()
        .onChange(async (value) => { this.plugin.settings.temperature = value; await this.plugin.saveSettings(); })
      );

    // --- Context Management ---
    containerEl.createEl("h2", { text: "Context Management" });

    new Setting(containerEl)
      .setName("Model Context Window (tokens)")
      .setDesc("User-defined maximum tokens for the model. The actual limit might be lower if detected from the model and 'Advanced Strategy' is enabled.") // Updated description
      .addText((text) => text.setPlaceholder("8192").setValue(String(this.plugin.settings.contextWindow))
        .onChange(async v => { const n = parseInt(v); if (!isNaN(n) && n > 0) { this.plugin.settings.contextWindow = n; await this.plugin.saveSettings(); } else { new Notice("Please enter a positive number."); text.setValue(String(this.plugin.settings.contextWindow)); } })
      );

    new Setting(containerEl)
      .setName("Experimental: Advanced Context Strategy")
      .setDesc("Use tokenizer and attempt programmatic detection of model's context limit for precise management. If disabled or detection fails, uses the user-defined limit above with word counting.") // Updated description
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useAdvancedContextStrategy)
        .onChange(async value => {
          this.plugin.settings.useAdvancedContextStrategy = value;
          await this.plugin.saveSettings();
          if (value) { new Notice("Advanced context strategy enabled."); }
          else { new Notice("Advanced context strategy disabled."); }
          this.display(); // Redraw to show/hide summarization settings
        })
      );

    // Show summarization settings only if advanced strategy is enabled
    if (this.plugin.settings.useAdvancedContextStrategy) {
      containerEl.createEl("h4", { text: "Automatic History Summarization (Experimental)" });

      new Setting(containerEl)
        .setName("Enable Summarization")
        .setDesc("Automatically summarize older parts of the conversation if they exceed the context window. WARNING: This can significantly slow down responses!")
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.enableSummarization)
          .onChange(async value => {
            this.plugin.settings.enableSummarization = value;
            await this.plugin.saveSettings();
          })
        );

      new Setting(containerEl)
        .setName("Summarization Prompt")
        .setDesc("Instruction for the model on how to summarize. Use {text_to_summarize} as a placeholder.")
        .addTextArea(text => text
          .setPlaceholder(DEFAULT_SETTINGS.summarizationPrompt)
          .setValue(this.plugin.settings.summarizationPrompt)
          .onChange(async value => { this.plugin.settings.summarizationPrompt = value; await this.plugin.saveSettings(); })
          .inputEl.rows = 5
        );

      new Setting(containerEl)
        .setName("Summarization Chunk Size (tokens)")
        .setDesc("Approximate size of the history block (in tokens) to be summarized at once.")
        .addText(text => text
          .setPlaceholder(String(DEFAULT_SETTINGS.summarizationChunkSize))
          .setValue(String(this.plugin.settings.summarizationChunkSize))
          .onChange(async v => { const n = parseInt(v); if (!isNaN(n) && n > 100) { this.plugin.settings.summarizationChunkSize = n; await this.plugin.saveSettings(); } else { new Notice("Please enter a number greater than 100."); text.setValue(String(this.plugin.settings.summarizationChunkSize)); } })
        );

      new Setting(containerEl)
        .setName("Keep Last N Messages")
        .setDesc("Number of recent messages that will NEVER be summarized.")
        .addSlider(slider => slider
          .setLimits(0, 20, 1)
          .setValue(this.plugin.settings.keepLastNMessagesBeforeSummary)
          .setDynamicTooltip()
          .onChange(async v => { this.plugin.settings.keepLastNMessagesBeforeSummary = v; await this.plugin.saveSettings(); })
        );
    } else {
      containerEl.createEl('p', { text: 'Using basic context management strategy (approximate word count, respects user-defined limit).', cls: 'setting-item-description ollama-subtle-notice' });
    }


    // --- Chat History & Persistence ---
    containerEl.createEl("h2", { text: "Chat History" });

    new Setting(containerEl)
      .setName("Save Message History")
      .setDesc("Save chat history between sessions")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.saveMessageHistory)
        .onChange(async (value) => { this.plugin.settings.saveMessageHistory = value; await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName("Log File Size Limit (KB)")
      .setDesc("Maximum size of the message history file (1024 KB = 1 MB)")
      .addSlider((slider) => slider.setLimits(256, 10240, 256).setValue(this.plugin.settings.logFileSizeLimit).setDynamicTooltip()
        .onChange(async (value) => { this.plugin.settings.logFileSizeLimit = value; await this.plugin.saveSettings(); })
      )
      .addExtraButton((button) => button.setIcon("reset").setTooltip("Reset to default (1024 KB)")
        .onClick(async () => { this.plugin.settings.logFileSizeLimit = DEFAULT_SETTINGS.logFileSizeLimit; await this.plugin.saveSettings(); this.display(); })
      );

    new Setting(containerEl)
      .setName("Clear History")
      .setDesc("Delete all chat history")
      .addButton((button) => button.setButtonText("Clear")
        .onClick(async () => {
          // if (confirm("Are you sure you want to delete all chat history? This action cannot be undone.")) { 
          await this.plugin.clearMessageHistory(); new Notice("Chat history cleared.");
        }
          // }
        )
      );


    // --- UI/UX Settings ---
    containerEl.createEl("h2", { text: "Appearance (UI/UX)" });

    // User Avatar Settings
    containerEl.createEl("h4", { text: "User Avatar" });
    new Setting(containerEl)
      .setName("User Avatar Type")
      .addDropdown(dd => dd.addOption('initials', 'Initials').addOption('icon', 'Obsidian Icon').setValue(this.plugin.settings.userAvatarType)
        .onChange(async (value: AvatarType) => { this.plugin.settings.userAvatarType = value; await this.plugin.saveSettings(); this.display(); })
      );
    if (this.plugin.settings.userAvatarType === 'initials') {
      new Setting(containerEl).setName("User Initials").setDesc("Enter 1-2 letters")
        .addText(text => text.setValue(this.plugin.settings.userAvatarContent)
          .onChange(async (value) => { this.plugin.settings.userAvatarContent = value.substring(0, 2).toUpperCase(); await this.plugin.saveSettings(); })
        );
    } else {
      new Setting(containerEl).setName("User Icon").setDesc("Enter an Obsidian icon name")
        .addText(text => text.setValue(this.plugin.settings.userAvatarContent).setPlaceholder('e.g., user, smile, etc.')
          .onChange(async (value) => { this.plugin.settings.userAvatarContent = value.trim(); await this.plugin.saveSettings(); })
        );
      this.createIconSearch(containerEl, 'user');
    }

    // AI Avatar Settings
    containerEl.createEl("h4", { text: "AI Avatar" });
    new Setting(containerEl)
      .setName("AI Avatar Type")
      .addDropdown(dd => dd.addOption('initials', 'Initials').addOption('icon', 'Obsidian Icon').setValue(this.plugin.settings.aiAvatarType)
        .onChange(async (value: AvatarType) => { this.plugin.settings.aiAvatarType = value; await this.plugin.saveSettings(); this.display(); })
      );
    if (this.plugin.settings.aiAvatarType === 'initials') {
      new Setting(containerEl).setName("AI Initials").setDesc("Enter 1-2 letters")
        .addText(text => text.setValue(this.plugin.settings.aiAvatarContent)
          .onChange(async (value) => { this.plugin.settings.aiAvatarContent = value.substring(0, 2).toUpperCase(); await this.plugin.saveSettings(); })
        );
    } else {
      new Setting(containerEl).setName("AI Icon").setDesc("Enter an Obsidian icon name")
        .addText(text => text.setValue(this.plugin.settings.aiAvatarContent).setPlaceholder('e.g., bot, cpu, brain, etc.')
          .onChange(async (value) => { this.plugin.settings.aiAvatarContent = value.trim(); await this.plugin.saveSettings(); })
        );
      this.createIconSearch(containerEl, 'ai');
    }

    // Max Message Height Setting
    new Setting(containerEl)
      .setName("Max Message Height (px)")
      .setDesc("Longer messages will get a 'Show More' button. Set to 0 to disable collapsing.")
      .addText(text => text.setPlaceholder("300").setValue(String(this.plugin.settings.maxMessageHeight))
        .onChange(async (value) => { const n = parseInt(value, 10); if (!isNaN(n) && n >= 0) { this.plugin.settings.maxMessageHeight = n; await this.plugin.saveSettings(); } else { new Notice("Please enter 0 or a positive number."); text.setValue(String(this.plugin.settings.maxMessageHeight)); } })
      );


    // --- Role Configuration ---
    containerEl.createEl("h2", { text: "AI Role Configuration" });

    new Setting(containerEl)
      .setName("Enable Role")
      .setDesc("Make Ollama follow a defined role from a file")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.followRole)
        .onChange(async (value) => { this.plugin.settings.followRole = value; await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName("Use Default Role Definition")
      .setDesc("Use the default-role.md file from the plugin folder")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.useDefaultRoleDefinition)
        .onChange(async (value) => { this.plugin.settings.useDefaultRoleDefinition = value; await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName("Custom Role Definition Path")
      .setDesc("Path to a custom role file (relative to vault root)")
      .addText((text) => text.setPlaceholder("path/to/your_role.md").setValue(this.plugin.settings.customRoleFilePath)
        .onChange(async (value) => { this.plugin.settings.customRoleFilePath = value.trim(); await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName("System Prompt Interval")
      .setDesc("Message pairs between system prompt resends (0=always, <0=never)")
      .addText((text) => text.setValue(String(this.plugin.settings.systemPromptInterval))
        .onChange(async (value) => { this.plugin.settings.systemPromptInterval = parseInt(value) || 0; await this.plugin.saveSettings(); })
      );


    // --- RAG Configuration ---
    containerEl.createEl("h2", { text: "RAG Configuration" });

    new Setting(containerEl)
      .setName("Enable RAG")
      .setDesc("Use Retrieval Augmented Generation with your notes")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.ragEnabled)
        .onChange(async (value) => { this.plugin.settings.ragEnabled = value; await this.plugin.saveSettings(); if (value && this.plugin.ragService) { new Notice("RAG enabled. Indexing documents..."); setTimeout(() => this.plugin.ragService?.indexDocuments(), 100); } })
      );

    new Setting(containerEl)
      .setName("RAG Folder Path")
      .setDesc("Folder containing documents for RAG (relative to vault root)")
      .addText((text) => text.setPlaceholder("data/rag_docs").setValue(this.plugin.settings.ragFolderPath)
        .onChange(async (value) => { this.plugin.settings.ragFolderPath = value.trim(); await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName("RAG Documents in Context")
      .setDesc("Number of relevant document chunks to add to the context")
      .addSlider((slider) => slider.setLimits(1, 10, 1).setValue(this.plugin.settings.contextWindowSize).setDynamicTooltip()
        .onChange(async (value) => { this.plugin.settings.contextWindowSize = value; await this.plugin.saveSettings(); })
      );


    // --- Speech Recognition ---
    containerEl.createEl("h2", { text: "Speech Recognition" });

    new Setting(containerEl)
      .setName("Google API Key")
      .setDesc("API key for Google Speech-to-Text service")
      .addText((text) => text.setPlaceholder("Enter your Google API key").setValue(this.plugin.settings.googleApiKey)
        .onChange(async (value) => { this.plugin.settings.googleApiKey = value.trim(); await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName("Recognition Language")
      .setDesc("Language code for Google Speech-to-Text (e.g., en-US, uk-UA, es-ES)")
      .addText((text) => text.setPlaceholder("en-US").setValue(this.plugin.settings.speechLanguage)
        .onChange(async (value) => { this.plugin.settings.speechLanguage = value.trim(); await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName("Max Recording Time (sec)")
      .setDesc("Maximum voice recording time before automatic stop")
      .addSlider((slider) => slider.setLimits(5, 60, 5).setValue(this.plugin.settings.maxRecordingTime).setDynamicTooltip()
        .onChange(async (value) => { this.plugin.settings.maxRecordingTime = value; await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName("Silence Detection")
      .setDesc("Automatically stop recording after a period of silence (if supported)")
      .addToggle(toggle => toggle.setValue(this.plugin.settings.silenceDetection)
        .onChange(async value => { this.plugin.settings.silenceDetection = value; await this.plugin.saveSettings(); })
      );

    // Add styles for icon search when displayed
    this.addIconSearchStyles();
  }

  // Adds CSS styles for icon search dynamically
  private addIconSearchStyles() {
    const styleId = 'ollama-icon-search-styles'; if (document.getElementById(styleId)) return; const style = document.createElement('style'); style.id = styleId; style.textContent = `
        .ollama-settings .setting-item-control .ollama-icon-search-container { margin-top: 8px; border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 8px; background-color: var(--background-secondary); }
        .ollama-settings .setting-item-control .ollama-icon-search-container input[type="text"] { width: 100%; margin-bottom: 8px; }
        .ollama-settings .setting-item-control .ollama-icon-search-results { display: flex; flex-wrap: wrap; gap: 4px; max-height: 150px; overflow-y: auto; background-color: var(--background-primary); border-radius: 4px; padding: 4px; }
        .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar { width: 6px; }
        .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-track { background: var(--background-secondary); border-radius: 3px; }
        .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-thumb { background-color: var(--background-modifier-border); border-radius: 3px; }
        .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-thumb:hover { background-color: var(--interactive-accent-translucent); }
        .ollama-settings .setting-item-control .ollama-icon-search-result { background-color: var(--background-modifier-hover); border: 1px solid transparent; border-radius: 4px; padding: 4px; cursor: pointer; transition: all 0.1s ease-out; color: var(--text-muted); display: flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; }
        .ollama-settings .setting-item-control .ollama-icon-search-result:hover { background-color: var(--background-modifier-border); border-color: var(--interactive-accent-translucent); color: var(--text-normal); }
        .ollama-settings .setting-item-control .ollama-icon-search-result .svg-icon { width: 16px; height: 16px; }
        .ollama-subtle-notice { opacity: 0.7; font-size: var(--font-ui-smaller); margin-top: 5px; margin-bottom: 10px; padding-left: 10px; border-left: 2px solid var(--background-modifier-border); }
        `; document.head.appendChild(style);
  }
}