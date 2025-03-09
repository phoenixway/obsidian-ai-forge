import { App, PluginSettingTab, Setting, DropdownComponent, Notice } from "obsidian";
import OllamaPlugin from "./main";

export interface OllamaPluginSettings {
  modelName: string;
  ollamaServerUrl: string;
  logFileSizeLimit: number; // Size in KB
  saveMessageHistory: boolean;
}

export const DEFAULT_SETTINGS: OllamaPluginSettings = {
  modelName: "mistral",
  ollamaServerUrl: "http://localhost:11434",
  logFileSizeLimit: 1024, // Default 1MB (1024 KB)
  saveMessageHistory: true
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
      .setDesc("IP address and port where Ollama is running (e.g. http://192.168.1.10:11434)")
      .addText(text => text
        .setPlaceholder("http://localhost:11434")
        .setValue(this.plugin.settings.ollamaServerUrl)
        .onChange(async (value) => {
          this.plugin.settings.ollamaServerUrl = value;
          await this.plugin.saveSettings();
        }));

    // Fetch the list of available models from the configured server
    let availableModels: string[] = [];
    try {
      const response = await fetch(`${this.plugin.settings.ollamaServerUrl}/api/tags`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.models)) {
          availableModels = data.models.map((model: any) =>
            typeof model === 'object' ? model.name : model
          );
        }
      } else {
        console.error("Failed to fetch available models");
      }
    } catch (error) {
      console.error("Error fetching available models:", error);
    }

    // Pre-select the last selected model or the first available model
    const selectedModel = availableModels.includes(this.plugin.settings.modelName)
      ? this.plugin.settings.modelName
      : (availableModels.length > 0 ? availableModels[0] : "");

    // Create a dropdown for model selection
    new Setting(containerEl)
      .setName("Model Name")
      .setDesc("Select the language model to use")
      .addDropdown((dropdown) => {
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
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.saveMessageHistory)
        .onChange(async (value) => {
          this.plugin.settings.saveMessageHistory = value;
          await this.plugin.saveSettings();
        }));
    
    // Add log file size limit setting
    new Setting(containerEl)
      .setName("Log File Size Limit")
      .setDesc("Maximum size of message history log file in KB (1024 KB = 1 MB)")
      .addSlider(slider => slider
        .setLimits(256, 10240, 256)
        .setValue(this.plugin.settings.logFileSizeLimit)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.logFileSizeLimit = value;
          await this.plugin.saveSettings();
        }))
      .addExtraButton(button => button
        .setIcon("reset")
        .setTooltip("Reset to default (1024 KB)")
        .onClick(async () => {
          this.plugin.settings.logFileSizeLimit = DEFAULT_SETTINGS.logFileSizeLimit;
          await this.plugin.saveSettings();
          this.display();
        }));
    new Setting(containerEl)
        .setName("Очистити історію")
        .setDesc("Видалити всю історію чату")
        .addButton(button => button
            .setButtonText("Очистити")
            .onClick(async () => {
                await this.plugin.clearMessageHistory();
                new Notice("Історія чату очищена.");
            }));
        
  }
}