import {
  App,
  PluginSettingTab,
  Setting,
  DropdownComponent,
  Notice,
} from "obsidian";
import OllamaPlugin from "./main";

export interface OllamaPluginSettings {
  modelName: string;
  ollamaServerUrl: string;
  logFileSizeLimit: number; // Size in KB
  saveMessageHistory: boolean;
  ragEnabled: boolean;
  ragFolderPath: string;
  contextWindowSize: number;
  googleApiKey: string; // API key for Google Speech-to-Text
  speechLanguage: string; // Language code for speech recognition
  maxRecordingTime: number; // Maximum recording time in seconds
  silenceDetection: boolean; // Enable silence detection
}

export const DEFAULT_SETTINGS: OllamaPluginSettings = {
  modelName: "mistral",
  ollamaServerUrl: "http://localhost:11434",
  logFileSizeLimit: 1024,
  saveMessageHistory: true,
  ragEnabled: false,
  ragFolderPath: "data",
  contextWindowSize: 5,
  googleApiKey: "",
  speechLanguage: "uk-UA",
  maxRecordingTime: 15,
  silenceDetection: true,
};

export class OllamaSettingTab extends PluginSettingTab {
  plugin: OllamaPlugin;

  constructor(app: App, plugin: OllamaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getDisplayText(): string {
    return "Ollama";
  }

  getId(): string {
    return "ollama-plugin";
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    // Add field for Ollama server URL
    new Setting(containerEl)
      .setName("Ollama Server URL")
      .setDesc(
        "IP address and port where Ollama is running (e.g. http://192.168.1.10:11434)"
      )
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:11434")
          .setValue(this.plugin.settings.ollamaServerUrl)
          .onChange(async (value) => {
            this.plugin.settings.ollamaServerUrl = value;
            await this.plugin.saveSettings();
          })
      );

    // Add reconnect button
    new Setting(containerEl)
      .setName("Server Connection")
      .setDesc("Reconnect to local model server and refresh available models")
      .addButton((button) =>
        button
          .setButtonText("Reconnect")
          .setIcon("refresh-cw")
          .onClick(async () => {
            try {
              new Notice("Connecting to Ollama server...");

              // Fetch models from the server
              const response = await fetch(
                `${this.plugin.settings.ollamaServerUrl}/api/tags`,
                {
                  method: "GET",
                  headers: { "Content-Type": "application/json" },
                }
              );

              if (response.ok) {
                new Notice("Successfully connected to Ollama server!");
                // Completely rebuild the settings panel by removing all child elements
                containerEl.empty();
                // Then redisplay the settings
                this.display();
              } else {
                new Notice(
                  "Failed to connect to Ollama server. Check the URL and ensure the server is running."
                );
              }
            } catch (error) {
              new Notice(
                "Connection error. Please check the server URL and your network connection."
              );
            }
          })
      );

    // Fetch available models
    let availableModels: string[] = [];
    try {
      availableModels = await this.plugin.apiService.getModels();
    } catch (error) {
      console.error("Error fetching available models:", error);
    }

    // Pre-select the last selected model or the first available model
    const selectedModel = availableModels.includes(
      this.plugin.settings.modelName
    )
      ? this.plugin.settings.modelName
      : availableModels.length > 0
      ? availableModels[0]
      : "";

    // Create model selection dropdown (fixed version)
    const modelSetting = new Setting(containerEl)
      .setName("Model Name")
      .setDesc("Select the language model to use");

    const dropdown = modelSetting.addDropdown((dropdown) => {
      // Clear existing options (properly)
      const selectEl = dropdown.selectEl;
      while (selectEl.firstChild) {
        selectEl.removeChild(selectEl.firstChild);
      }

      // Add new options
      availableModels.forEach((model) => {
        dropdown.addOption(model, model);
      });

      if (availableModels.length === 0) {
        dropdown.addOption("", "No models available");
      }

      dropdown.setValue(selectedModel);
      dropdown.onChange(async (value) => {
        this.plugin.settings.modelName = value;
        await this.plugin.saveSettings();
      });
    });

    // Add save message history toggle
    new Setting(containerEl)
      .setName("Save Message History")
      .setDesc("Save chat message history between sessions")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.saveMessageHistory)
          .onChange(async (value) => {
            this.plugin.settings.saveMessageHistory = value;
            await this.plugin.saveSettings();
          })
      );

    // Add log file size limit setting
    new Setting(containerEl)
      .setName("Log File Size Limit")
      .setDesc(
        "Maximum size of message history log file in KB (1024 KB = 1 MB)"
      )
      .addSlider((slider) =>
        slider
          .setLimits(256, 10240, 256)
          .setValue(this.plugin.settings.logFileSizeLimit)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.logFileSizeLimit = value;
            await this.plugin.saveSettings();
          })
      )
      .addExtraButton((button) =>
        button
          .setIcon("reset")
          .setTooltip("Reset to default (1024 KB)")
          .onClick(async () => {
            this.plugin.settings.logFileSizeLimit =
              DEFAULT_SETTINGS.logFileSizeLimit;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    // Change clear history button text to English
    new Setting(containerEl)
      .setName("Clear History")
      .setDesc("Delete all chat history")
      .addButton((button) =>
        button.setButtonText("Clear").onClick(async () => {
          await this.plugin.clearMessageHistory();
          new Notice("Chat history cleared.");
        })
      );
    new Setting(containerEl)
      .setName("Enable RAG")
      .setDesc("Use Retrieval Augmented Generation with your notes")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.ragEnabled)
          .onChange(async (value) => {
            this.plugin.settings.ragEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("RAG Folder Path")
      .setDesc(
        "Path to the folder containing notes for RAG (relative to vault root)"
      )
      .addText((text) =>
        text
          .setPlaceholder("data")
          .setValue(this.plugin.settings.ragFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.ragFolderPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Context Window Size")
      .setDesc("Number of relevant documents to include in context")
      .addSlider((slider) =>
        slider
          .setLimits(1, 10, 1)
          .setValue(this.plugin.settings.contextWindowSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.contextWindowSize = value;
            await this.plugin.saveSettings();
          })
      );
    // Add this in the display() method before the last setting:
    new Setting(containerEl)
      .setName("Google API Key")
      .setDesc("API key for Google Speech-to-Text service")
      .addText((text) =>
        text
          .setPlaceholder("Enter your Google API key")
          .setValue(this.plugin.settings.googleApiKey)
          .onChange(async (value) => {
            this.plugin.settings.googleApiKey = value;
            await this.plugin.saveSettings();
          })
      );

    // Додати налаштування для мови розпізнавання
    new Setting(containerEl)
      .setName("Speech Recognition Language")
      .setDesc(
        "Language code for Google Speech-to-Text (e.g., uk-UA, en-US, ru-RU)"
      )
      .addText((text) =>
        text
          .setPlaceholder("uk-UA")
          .setValue(this.plugin.settings.speechLanguage)
          .onChange(async (value) => {
            this.plugin.settings.speechLanguage = value;
            await this.plugin.saveSettings();
          })
      );

    // Додати налаштування для максимального часу запису
    new Setting(containerEl)
      .setName("Maximum Recording Time")
      .setDesc(
        "Maximum time (in seconds) to record before automatically stopping"
      )
      .addSlider((slider) =>
        slider
          .setLimits(5, 60, 5)
          .setValue(this.plugin.settings.maxRecordingTime)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxRecordingTime = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
