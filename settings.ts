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
import { exec } from 'child_process'; // Потрібно для виконання команд

export type AvatarType = 'initials' | 'icon';

export interface OllamaPluginSettings {
  // --- Core Ollama Settings ---
  modelName: string;
  ollamaServerUrl: string;
  temperature: number;
  contextWindow: number; // Model context window (tokens)

  // --- Context Management ---
  useAdvancedContextStrategy: boolean;
  enableSummarization: boolean;
  summarizationPrompt: string;
  summarizationChunkSize: number;
  keepLastNMessagesBeforeSummary: number;

  // --- Role Configuration ---
  followRole: boolean;
  // useDefaultRoleDefinition: boolean; // REMOVED
  // customRoleFilePath: string; // REMOVED
  selectedRolePath: string; // Path to the currently selected role file
  userRolesFolderPath: string; // Folder for user-defined roles
  systemPromptInterval: number;

  // --- Chat History ---
  saveMessageHistory: boolean;
  logFileSizeLimit: number;

  // --- RAG ---
  ragEnabled: boolean;
  ragFolderPath: string;
  contextWindowSize: number; // Number of RAG documents

  // --- Appearance (UI/UX) ---
  userAvatarType: AvatarType;
  userAvatarContent: string;
  aiAvatarType: AvatarType;
  aiAvatarContent: string;
  maxMessageHeight: number;

  // --- Speech Recognition ---
  googleApiKey: string;
  speechLanguage: string;
  maxRecordingTime: number;
  silenceDetection: boolean;

  // --- Service Management ---
  ollamaRestartCommand: string; // Command to restart Ollama service
}

export const DEFAULT_SETTINGS: OllamaPluginSettings = {
  // --- Core ---
  modelName: "mistral",
  ollamaServerUrl: "http://localhost:11434",
  temperature: 0.1,
  contextWindow: 8192,
  // --- Context ---
  useAdvancedContextStrategy: false,
  enableSummarization: false,
  summarizationPrompt: `Briefly summarize the following conversation excerpt, focusing on key decisions, questions, and outcomes. Maintain a neutral tone and stick to the facts:\n\n---\n{text_to_summarize}\n---\n\nSummary:`,
  summarizationChunkSize: 1500,
  keepLastNMessagesBeforeSummary: 6,
  // --- Role ---
  followRole: true,
  // useDefaultRoleDefinition: false, // REMOVED
  // customRoleFilePath: "", // REMOVED
  selectedRolePath: "", // Default to no role selected
  userRolesFolderPath: "ollama/roles", // Example default path for user roles
  systemPromptInterval: 0,
  // --- History ---
  saveMessageHistory: true,
  logFileSizeLimit: 1024,
  // --- RAG ---
  ragEnabled: false,
  ragFolderPath: "data",
  contextWindowSize: 5, // RAG docs count
  // --- UI/UX ---
  userAvatarType: 'initials',
  userAvatarContent: 'U',
  aiAvatarType: 'icon',
  aiAvatarContent: 'bot',
  maxMessageHeight: 300,
  // --- Speech ---
  googleApiKey: "",
  speechLanguage: "en-US",
  maxRecordingTime: 15,
  silenceDetection: true,
  // --- Service ---
  ollamaRestartCommand: "", // Empty by default for safety
};

export class OllamaSettingTab extends PluginSettingTab {
  plugin: OllamaPlugin;

  constructor(app: App, plugin: OllamaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getDisplayText(): string { return "Ollama Chat"; }
  getId(): string { return "ollama-chat-plugin"; }

  // Icon search helper (без змін)
  private createIconSearch(containerEl: HTMLElement, settingType: 'user' | 'ai') { /* ... */ }
  // Додаємо стилі CSS для пошуку іконок динамічно (без змін)
  // private addIconSearchStyles() { /* ... */ }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('ollama-settings');

    // --- SECTION: Core Ollama Settings ---
    containerEl.createEl("h2", { text: "Core Ollama Settings" });

    new Setting(containerEl).setName("Ollama Server URL")
      .setDesc("IP address and port where Ollama is running (e.g., http://localhost:11434)")
      .addText(text => text.setPlaceholder("http://localhost:11434").setValue(this.plugin.settings.ollamaServerUrl)
        .onChange(async v => { this.plugin.settings.ollamaServerUrl = v.trim(); await this.plugin.saveSettings(); this.plugin.promptService.clearModelDetailsCache(); /* Clear cache on URL change */ })); // Clear cache

    new Setting(containerEl).setName("Server Connection")
      .setDesc("Reconnect to the server and refresh available models")
      .addButton(button => button.setButtonText("Reconnect").setIcon("refresh-cw")
        .onClick(async () => { this.plugin.promptService.clearModelDetailsCache(); /* Clear cache on reconnect */ try { new Notice("Connecting..."); await this.plugin.apiService.getModels(); new Notice("Successfully connected!"); this.display(); } catch (e: any) { new Notice(`Connection failed: ${e.message}.`); if (this.plugin.view) this.plugin.view.internalAddMessage("error", `Connection failed: ${e.message}.`); } }));

    let availableModels: string[] = []; try { availableModels = await this.plugin.apiService.getModels(); } catch (e) { }
    new Setting(containerEl).setName("Chat Model")
      .setDesc("Select the default language model for the chat")
      .addDropdown(dd => { const s = dd.selectEl; s.empty(); if (availableModels.length > 0) { availableModels.forEach(m => dd.addOption(m, m)); const c = this.plugin.settings.modelName; if (availableModels.includes(c)) dd.setValue(c); else { dd.setValue(availableModels[0]); this.plugin.settings.modelName = availableModels[0]; this.plugin.saveSettings(); } } else { dd.addOption("", "No models found"); dd.setDisabled(true); } dd.onChange(async v => { this.plugin.settings.modelName = v; this.plugin.emit('model-changed', v); await this.plugin.saveSettings(); }); });

    new Setting(containerEl).setName("Temperature")
      .setDesc("Controls response randomness (0.0 = deterministic, 1.0 = creative)")
      .addSlider(slider => slider.setLimits(0, 1, 0.1).setValue(this.plugin.settings.temperature).setDynamicTooltip()
        .onChange(async v => { this.plugin.settings.temperature = v; await this.plugin.saveSettings(); })
      );

    // --- SECTION: Context Management ---
    containerEl.createEl("h2", { text: "Context Management" });

    new Setting(containerEl).setName("Model Context Window (tokens)")
      .setDesc("User-defined max tokens for the model. The effective limit might be lower if detected from the model when 'Advanced Strategy' is enabled.")
      .addText(text => text.setPlaceholder(String(DEFAULT_SETTINGS.contextWindow)).setValue(String(this.plugin.settings.contextWindow))
        .onChange(async v => { const n = parseInt(v); if (!isNaN(n) && n > 0) { this.plugin.settings.contextWindow = n; await this.plugin.saveSettings(); } else { new Notice("Please enter a positive number."); text.setValue(String(this.plugin.settings.contextWindow)); } })
      );

    new Setting(containerEl).setName("Experimental: Advanced Context Strategy")
      .setDesc("Use tokenizer and attempt programmatic context limit detection. If disabled or detection fails, uses user-defined limit with word counting.")
      .addToggle(toggle => toggle.setValue(this.plugin.settings.useAdvancedContextStrategy)
        .onChange(async v => { this.plugin.settings.useAdvancedContextStrategy = v; await this.plugin.saveSettings(); if (v) new Notice("Advanced context strategy enabled."); else new Notice("Advanced context strategy disabled."); this.display(); })
      );

    if (this.plugin.settings.useAdvancedContextStrategy) {
      containerEl.createEl("h4", { text: "Automatic History Summarization (Experimental)" });
      // Summarization Settings (enable, prompt, chunk size, keep N) - без змін
      new Setting(containerEl).setName("Enable Summarization").setDesc("Automatically summarize older parts of the conversation. WARNING: Can significantly slow down responses!").addToggle(t => t.setValue(this.plugin.settings.enableSummarization).onChange(async v => { this.plugin.settings.enableSummarization = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Summarization Prompt").setDesc("Instruction for the model. Use {text_to_summarize} as placeholder.").addTextArea(t => { t.setPlaceholder(DEFAULT_SETTINGS.summarizationPrompt).setValue(this.plugin.settings.summarizationPrompt).onChange(async v => { this.plugin.settings.summarizationPrompt = v; await this.plugin.saveSettings(); }); t.inputEl.rows = 5; });
      new Setting(containerEl).setName("Summarization Chunk Size (tokens)").setDesc("Approximate history block size (tokens) to summarize at once.").addText(t => t.setPlaceholder(String(DEFAULT_SETTINGS.summarizationChunkSize)).setValue(String(this.plugin.settings.summarizationChunkSize)).onChange(async v => { const n = parseInt(v); if (!isNaN(n) && n > 100) { this.plugin.settings.summarizationChunkSize = n; await this.plugin.saveSettings(); } else { new Notice("Enter number > 100."); t.setValue(String(this.plugin.settings.summarizationChunkSize)); } }));
      new Setting(containerEl).setName("Keep Last N Messages").setDesc("Number of recent messages never summarized.").addSlider(s => s.setLimits(0, 20, 1).setValue(this.plugin.settings.keepLastNMessagesBeforeSummary).setDynamicTooltip().onChange(async v => { this.plugin.settings.keepLastNMessagesBeforeSummary = v; await this.plugin.saveSettings(); }));
    } else {
      containerEl.createEl('p', { text: 'Using basic context management strategy (approximate word count, respects user-defined limit).', cls: 'setting-item-description ollama-subtle-notice' });
    }

    // --- SECTION: AI Role Configuration ---
    containerEl.createEl("h2", { text: "AI Role Configuration" });

    new Setting(containerEl).setName("Enable Role")
      .setDesc("Make Ollama follow a defined role from a file.")
      .addToggle(toggle => toggle.setValue(this.plugin.settings.followRole)
        .onChange(async v => { this.plugin.settings.followRole = v; await this.plugin.saveSettings(); this.display(); /* Redraw to show/hide dependent settings */ })
      );

    if (this.plugin.settings.followRole) {
      // --- Змінено: Папка для ролей користувача ---
      new Setting(containerEl)
        .setName("User Roles Folder Path")
        .setDesc("Path to a folder within your vault containing custom '.md' role files. Leave empty to only use default roles. No folder picker available, please type the path.")
        .addText((text) => text
          .setPlaceholder(DEFAULT_SETTINGS.userRolesFolderPath) // Example path
          .setValue(this.plugin.settings.userRolesFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.userRolesFolderPath = value.trim();
            await this.plugin.saveSettings();
            // Optionally, trigger a refresh of the role list in the view if it's open
            this.plugin.promptService.clearRoleCache?.(); // Clear cache if role path changes
            if (this.plugin.view) this.plugin.view.renderRoleList(); // Update menu if open
          })
        );
      // --- Кінець змін ---

      // Прибрано налаштування useDefaultRoleDefinition та customRoleFilePath

      new Setting(containerEl).setName("System Prompt Interval")
        .setDesc("Message pairs between system prompt resends (0=always, <0=never). Applies to the selected role.")
        .addText(text => text.setValue(String(this.plugin.settings.systemPromptInterval))
          .onChange(async v => { this.plugin.settings.systemPromptInterval = parseInt(v) || 0; await this.plugin.saveSettings(); })
        );

      // Note about selected role (display only, actual selection is in chat menu)
      containerEl.createEl('p', { text: `Selected Role: ${this.plugin.settings.selectedRolePath || "None"}. Select roles via the chat input menu.`, cls: 'setting-item-description ollama-subtle-notice' });
    }


    // --- SECTION: Chat History ---
    containerEl.createEl("h2", { text: "Chat History" });

    new Setting(containerEl).setName("Save Message History")
      .setDesc("Save chat history between sessions")
      .addToggle(t => t.setValue(this.plugin.settings.saveMessageHistory).onChange(async v => { this.plugin.settings.saveMessageHistory = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Log File Size Limit (KB)")
      .setDesc("Maximum history file size (1024 KB = 1 MB)")
      .addSlider(s => s.setLimits(256, 10240, 256).setValue(this.plugin.settings.logFileSizeLimit).setDynamicTooltip().onChange(async v => { this.plugin.settings.logFileSizeLimit = v; await this.plugin.saveSettings(); }))
      .addExtraButton(b => b.setIcon('reset').setTooltip('Reset (1024 KB)').onClick(async () => { this.plugin.settings.logFileSizeLimit = DEFAULT_SETTINGS.logFileSizeLimit; await this.plugin.saveSettings(); this.display(); }));
    new Setting(containerEl).setName("Clear History")
      .setDesc("Delete all chat history")
      .addButton(b => b.setButtonText("Clear").onClick(async () => { await this.plugin.clearMessageHistory(); /* Notice is now inside clearMessageHistory */ })); // Removed confirm


    // --- SECTION: RAG Configuration ---
    containerEl.createEl("h2", { text: "RAG Configuration" });

    new Setting(containerEl).setName("Enable RAG")
      .setDesc("Use Retrieval Augmented Generation with your notes")
      .addToggle(t => t.setValue(this.plugin.settings.ragEnabled).onChange(async v => { this.plugin.settings.ragEnabled = v; await this.plugin.saveSettings(); if (v && this.plugin.ragService) { new Notice("RAG enabled. Indexing..."); setTimeout(() => this.plugin.ragService?.indexDocuments(), 100); } }));
    new Setting(containerEl).setName("RAG Folder Path")
      .setDesc("Folder with documents for RAG (relative to vault root)")
      .addText(t => t.setPlaceholder("data/rag_docs").setValue(this.plugin.settings.ragFolderPath).onChange(async v => { this.plugin.settings.ragFolderPath = v.trim(); await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("RAG Documents in Context")
      .setDesc("Number of relevant document chunks to add")
      .addSlider(s => s.setLimits(1, 10, 1).setValue(this.plugin.settings.contextWindowSize).setDynamicTooltip().onChange(async v => { this.plugin.settings.contextWindowSize = v; await this.plugin.saveSettings(); }));


    // --- SECTION: Appearance (UI/UX) ---
    containerEl.createEl("h2", { text: "Appearance (UI/UX)" });
    // User Avatar
    containerEl.createEl("h4", { text: "User Avatar" });
    new Setting(containerEl).setName("Type").addDropdown(dd => dd.addOption('initials', 'Initials').addOption('icon', 'Obsidian Icon').setValue(this.plugin.settings.userAvatarType).onChange(async (v: AvatarType) => { this.plugin.settings.userAvatarType = v; await this.plugin.saveSettings(); this.display(); }));
    if (this.plugin.settings.userAvatarType === 'initials') { new Setting(containerEl).setName("Initials").setDesc("1-2 letters").addText(t => t.setValue(this.plugin.settings.userAvatarContent).onChange(async v => { this.plugin.settings.userAvatarContent = v.substring(0, 2).toUpperCase(); await this.plugin.saveSettings(); })); } else { new Setting(containerEl).setName("Icon").setDesc("Obsidian icon name").addText(t => t.setValue(this.plugin.settings.userAvatarContent).setPlaceholder('e.g. user').onChange(async v => { this.plugin.settings.userAvatarContent = v.trim(); await this.plugin.saveSettings(); })); this.createIconSearch(containerEl, 'user'); }
    // AI Avatar
    containerEl.createEl("h4", { text: "AI Avatar" });
    new Setting(containerEl).setName("Type").addDropdown(dd => dd.addOption('initials', 'Initials').addOption('icon', 'Obsidian Icon').setValue(this.plugin.settings.aiAvatarType).onChange(async (v: AvatarType) => { this.plugin.settings.aiAvatarType = v; await this.plugin.saveSettings(); this.display(); }));
    if (this.plugin.settings.aiAvatarType === 'initials') { new Setting(containerEl).setName("Initials").setDesc("1-2 letters").addText(t => t.setValue(this.plugin.settings.aiAvatarContent).onChange(async v => { this.plugin.settings.aiAvatarContent = v.substring(0, 2).toUpperCase(); await this.plugin.saveSettings(); })); } else { new Setting(containerEl).setName("Icon").setDesc("Obsidian icon name").addText(t => t.setValue(this.plugin.settings.aiAvatarContent).setPlaceholder('e.g. bot').onChange(async v => { this.plugin.settings.aiAvatarContent = v.trim(); await this.plugin.saveSettings(); })); this.createIconSearch(containerEl, 'ai'); }
    // Max Message Height
    new Setting(containerEl).setName("Max Message Height (px)").setDesc("Longer messages collapse. 0 disables collapsing.").addText(t => t.setPlaceholder("300").setValue(String(this.plugin.settings.maxMessageHeight)).onChange(async v => { const n = parseInt(v); if (!isNaN(n) && n >= 0) { this.plugin.settings.maxMessageHeight = n; await this.plugin.saveSettings(); } else { new Notice("Enter 0 or a positive number."); t.setValue(String(this.plugin.settings.maxMessageHeight)); } }));


    // --- SECTION: Speech Recognition ---
    containerEl.createEl("h2", { text: "Speech Recognition" });
    // ... (Speech settings без змін) ...
    new Setting(containerEl).setName("Google API Key").setDesc("API key for Google Speech-to-Text").addText(t => t.setPlaceholder("Enter Google API key").setValue(this.plugin.settings.googleApiKey).onChange(async v => { this.plugin.settings.googleApiKey = v.trim(); await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Recognition Language").setDesc("Language code (e.g., en-US, uk-UA)").addText(t => t.setPlaceholder("en-US").setValue(this.plugin.settings.speechLanguage).onChange(async v => { this.plugin.settings.speechLanguage = v.trim(); await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Max Recording Time (sec)").setDesc("Maximum recording time").addSlider(s => s.setLimits(5, 60, 5).setValue(this.plugin.settings.maxRecordingTime).setDynamicTooltip().onChange(async v => { this.plugin.settings.maxRecordingTime = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Silence Detection").setDesc("Stop recording after silence").addToggle(t => t.setValue(this.plugin.settings.silenceDetection).onChange(async v => { this.plugin.settings.silenceDetection = v; await this.plugin.saveSettings(); }));


    // --- SECTION: Service Management (Advanced & Potentially Risky) ---
    containerEl.createEl("h2", { text: "Service Management (Advanced)" });

    new Setting(containerEl)
      .setName("Ollama Service Restart Command")
      .setDesc("Enter the system command to restart the Ollama service (e.g., 'systemctl restart ollama' or 'sudo systemctl restart ollama'). "
        + "WARNING: Executing system commands is risky. Ensure the command is correct and understand the security implications. "
        + "This will likely not work on Windows or macOS without specific setup. Requires Node.js 'child_process'.")
      .addText(text => text
        .setPlaceholder("e.g., systemctl restart ollama")
        .setValue(this.plugin.settings.ollamaRestartCommand)
        .onChange(async (value) => {
          this.plugin.settings.ollamaRestartCommand = value.trim();
          await this.plugin.saveSettings();
        })
        .inputEl.style.width = "100%"); // Make input wider

    new Setting(containerEl)
      .setName("Restart Ollama Service")
      .setDesc("Attempt to execute the command defined above to restart the service.")
      .addButton(button => button
        .setButtonText("Restart Service")
        .setIcon("refresh-ccw-dot")
        .setWarning() // Add warning style to button
        .onClick(async () => {
          const command = this.plugin.settings.ollamaRestartCommand;
          if (!command) {
            new Notice("No restart command entered in settings.");
            return;
          }
          // Confirmation dialog
          if (!confirm(`Are you sure you want to execute this command?\n\n'${command}'\n\nThis could have unintended consequences.`)) {
            return;
          }

          new Notice(`Attempting to execute: ${command}`);
          try {
            // Call the plugin method to execute the command
            const result = await this.plugin.executeSystemCommand(command);
            console.log("Ollama restart command stdout:", result.stdout);
            console.error("Ollama restart command stderr:", result.stderr);
            if (result.error) {
              new Notice(`Command execution failed: ${result.error.message}`);
            } else if (result.stderr) {
              new Notice(`Command executed with errors (check console): ${result.stderr.split('\n')[0]}`); // Show first line of stderr
            }
            else {
              new Notice("Command executed successfully. Check console for output. You might need to reconnect.");
              // Optionally clear cache after restart attempt
              this.plugin.promptService.clearModelDetailsCache();
            }
          } catch (e: any) {
            console.error("Error executing system command:", e);
            new Notice(`Error executing command: ${e.message}`);
          }
        })
      );

    // Add styles for icon search when displayed
    this.addIconSearchStyles();
  }

  // Adds CSS styles for icon search dynamically (без змін)
  private addIconSearchStyles() {
    const styleId = 'ollama-icon-search-styles'; if (document.getElementById(styleId)) return; const style = document.createElement('style'); style.id = styleId; style.textContent = `
      .ollama-settings .setting-item-control .ollama-icon-search-container { margin-top: 8px; border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 8px; background-color: var(--background-secondary); } .ollama-settings .setting-item-control .ollama-icon-search-container input[type="text"] { width: 100%; margin-bottom: 8px; } .ollama-settings .setting-item-control .ollama-icon-search-results { display: flex; flex-wrap: wrap; gap: 4px; max-height: 150px; overflow-y: auto; background-color: var(--background-primary); border-radius: 4px; padding: 4px; } .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar { width: 6px; } .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-track { background: var(--background-secondary); border-radius: 3px; } .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-thumb { background-color: var(--background-modifier-border); border-radius: 3px; } .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-thumb:hover { background-color: var(--interactive-accent-translucent); } .ollama-settings .setting-item-control .ollama-icon-search-result { background-color: var(--background-modifier-hover); border: 1px solid transparent; border-radius: 4px; padding: 4px; cursor: pointer; transition: all 0.1s ease-out; color: var(--text-muted); display: flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; } .ollama-settings .setting-item-control .ollama-icon-search-result:hover { background-color: var(--background-modifier-border); border-color: var(--interactive-accent-translucent); color: var(--text-normal); } .ollama-settings .setting-item-control .ollama-icon-search-result .svg-icon { width: 16px; height: 16px; } .ollama-subtle-notice { opacity: 0.7; font-size: var(--font-ui-smaller); margin-top: 5px; margin-bottom: 10px; padding-left: 10px; border-left: 2px solid var(--background-modifier-border); }
      `; document.head.appendChild(style);
  }
}