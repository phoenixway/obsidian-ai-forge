import { Plugin, WorkspaceLeaf } from "obsidian";
import { OllamaView, VIEW_TYPE_OLLAMA } from "./ollamaView";
import { OllamaSettingTab, DEFAULT_SETTINGS, OllamaPluginSettings } from "./settings";

export default class OllamaPlugin extends Plugin {
  settings: OllamaPluginSettings;
  settingTab: OllamaSettingTab;
  view: OllamaView | null = null;

  async onload() {
    console.log("Ollama Plugin Loaded!");

    await this.loadSettings();

    this.registerView(VIEW_TYPE_OLLAMA, (leaf) => {
      this.view = new OllamaView(leaf, this);
      return this.view;
    });

// With this:
const ribbonIconEl = this.addRibbonIcon('brain', 'Open Ollama', () => {
  this.activateView();
});
ribbonIconEl.addClass('ollama-ribbon-icon');


    this.addCommand({
      id: "open-ollama-view",
      name: "Open Ollama Chat",
      callback: () => {
        this.activateView();
      },
    });

    this.settingTab = new OllamaSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    
    // Activate the view when layout is ready, but don't send automatic greeting
    this.app.workspace.onLayoutReady(() => {
      this.activateView();
    });
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_OLLAMA)[0];

    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf();
      await leaf.setViewState({ type: VIEW_TYPE_OLLAMA, active: true });
    }

    workspace.revealLeaf(leaf);
    return leaf;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
  
  getOllamaApiUrl() {
    return this.settings.ollamaServerUrl || DEFAULT_SETTINGS.ollamaServerUrl;
  }
  
  async saveMessageHistory(messages: string) {
    if (!this.settings.saveMessageHistory) return;
    
    try {
      // Get the path to the plugin folder
      const basePath = this.app.vault.configDir + "/plugins/obsidian-ollama-duet";
      const logPath = basePath + "/chat_history.json";
      const adapter = this.app.vault.adapter;
      
      // Check if file exists and its size
      let fileExists = await adapter.exists(logPath);
      let fileSize = 0;
      
      if (fileExists) {
        // Check file size
        const stat = await adapter.stat(logPath);
        // Add null check or use optional chaining for stat
        fileSize = stat?.size ? stat.size / 1024 : 0; // Convert to KB
      }
      
      // If the file is too large, create a backup and start fresh
      if (fileSize > this.settings.logFileSizeLimit) {
        if (fileExists) {
          const backupPath = logPath + ".backup";
          // Delete old backup if exists
          if (await adapter.exists(backupPath)) {
            await adapter.remove(backupPath);
          }
          // Create backup
          await adapter.copy(logPath, backupPath);
        }
        // Write new messages
        await adapter.write(logPath, messages);
      } else {
        // Append or create file
        if (!fileExists) {
          await adapter.write(logPath, messages);
        } else {
          // Read, parse, merge, and write
          const existingData = await adapter.read(logPath);
          try {
            const existingMessages = JSON.parse(existingData);
            const newMessages = JSON.parse(messages);
            const merged = JSON.stringify([...existingMessages, ...newMessages]);
            
            // Check if merged would exceed size limit
            if ((merged.length / 1024) > this.settings.logFileSizeLimit) {
              // If it would exceed, trim the oldest messages
              const allMessages = [...existingMessages, ...newMessages];
              let trimmedMessages = allMessages;
              while ((JSON.stringify(trimmedMessages).length / 1024) > this.settings.logFileSizeLimit) {
                trimmedMessages = trimmedMessages.slice(1);
              }
              await adapter.write(logPath, JSON.stringify(trimmedMessages));
            } else {
              // Otherwise just write the merged data
              await adapter.write(logPath, merged);
            }
          } catch (e) {
            // Handle JSON parse error - reset file
            console.error("Error parsing message history:", e);
            await adapter.write(logPath, messages);
          }
        }
      }
    } catch (error) {
      console.error("Failed to save message history:", error);
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
            // Очистити історію з view
            if (this.view) {
                this.view.clearChatMessages();
            }
        }
    } catch (error) {
        console.error("Failed to clear message history:", error);
    }
}

}