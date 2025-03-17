/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => OllamaPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// ollamaView.ts
var import_obsidian = require("obsidian");
var VIEW_TYPE_OLLAMA = "ollama-chat-view";
var _OllamaView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.messages = [];
    this.isProcessing = false;
    this.historyLoaded = false;
    this.scrollTimeout = null;
    this.plugin = plugin;
    if (_OllamaView.instance) {
      return _OllamaView.instance;
    }
    _OllamaView.instance = this;
    try {
      this.speechWorker = new Worker(new URL("./speechWorker.js", document.baseURI));
      console.log("Worker initialized successfully:", this.speechWorker);
    } catch (error) {
      console.error("Failed to initialize worker:", error);
    }
    this.speechWorker.onmessage = (event) => {
      const transcript = event.data;
      console.log("Received transcript from worker:", transcript);
      this.inputEl.value = transcript;
    };
    this.speechWorker.onerror = (error) => {
      console.error("Worker error:", error);
    };
  }
  // private index: faiss.IndexFlatL2 | undefined;
  // private documents: string[] = [];
  // private async readFileContent(filePath: string): Promise<string> {
  //   // Отримуємо файл з Obsidian vault
  //   const file = this.app?.vault.getAbstractFileByPath(filePath);
  //   if (!file || !(file instanceof TFile)) {
  //     throw new Error(`File not found: ${filePath}`);
  //   }
  //   if (filePath.endsWith('.md')) {
  //     return this.readMdFile(file);
  //   } else if (filePath.endsWith('.pdf')) {
  //     throw new Error("PDF reading not supported in browser environment");
  //     // PDF обробка потребує іншого підходу
  //   } else {
  //     return this.app.vault.read(file);
  //   }
  // }
  // private async readMdFile(file: TFile): Promise<string> {
  //   const mdContent = await this.app.vault.read(file);
  //   const textContent = await marked.parse(mdContent);
  //   return textContent.replace(/<[^>]*>?/gm, '');
  // }
  // private async readPdfFile(file: TFile): Promise<string> {
  //   throw new Error("PDF reading not supported in browser environment");
  //   // Тут потрібно буде реалізувати інший підхід для читання PDF
  // }
  // private findTopK(array: number[], k: number): number[] {
  //   return array
  //     .map((value, index) => ({ value, index }))
  //     .sort((a, b) => b.value - a.value)
  //     .slice(0, k)
  //     .map(item => item.index);
  // }
  // private cosineSimilarity(vecA: number[], vecB: number[]): number {
  //   let dotProduct = 0;
  //   let normA = 0;
  //   let normB = 0;
  //   for (let i = 0; i < vecA.length; i++) {
  //     dotProduct += vecA[i] * vecB[i];
  //     normA += vecA[i] * vecA[i];
  //     normB += vecB[i] * vecB[i];
  //   }
  //   normA = Math.sqrt(normA);
  //   normB = Math.sqrt(normB);
  //   if (normA === 0 || normB === 0) {
  //     return 0;
  //   }
  //   return dotProduct / (normA * normB);
  // }
  getViewType() {
    return VIEW_TYPE_OLLAMA;
  }
  getDisplayText() {
    return "Ollama Chat";
  }
  getIcon() {
    return "message-square";
  }
  async onOpen() {
    this.chatContainerEl = this.contentEl.createDiv({ cls: "ollama-container" });
    this.chatContainer = this.chatContainerEl.createDiv({ cls: "ollama-chat-container" });
    const inputContainer = this.chatContainerEl.createDiv({ cls: "chat-input-container" });
    this.inputEl = inputContainer.createEl("textarea", {
      attr: {
        placeholder: "Type a message..."
      }
    });
    const voiceButton = inputContainer.createEl("button", {
      cls: "voice-button"
    });
    (0, import_obsidian.setIcon)(voiceButton, "microphone");
    const sendButton = inputContainer.createEl("button", {
      cls: "send-button"
    });
    (0, import_obsidian.setIcon)(sendButton, "send");
    const settingsButton = inputContainer.createEl("button", {
      cls: "settings-button"
    });
    (0, import_obsidian.setIcon)(settingsButton, "settings");
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    settingsButton.addEventListener("click", () => {
      const setting = this.app.setting;
      setting.open("obsidian-ollama-duet");
    });
    sendButton.addEventListener("click", () => {
      this.sendMessage();
    });
    voiceButton.addEventListener("click", () => {
      this.startVoiceRecognition();
    });
    await this.loadMessageHistory();
  }
  async loadMessageHistory() {
    if (this.historyLoaded)
      return;
    try {
      const history = await this.plugin.loadMessageHistory();
      if (Array.isArray(history) && history.length > 0) {
        this.messages = [];
        this.chatContainer.empty();
        for (const msg of history) {
          const message = {
            ...msg,
            timestamp: new Date(msg.timestamp)
          };
          this.messages.push(message);
          this.renderMessage(message);
        }
        this.guaranteedScrollToBottom();
        this.initializeThinkingBlocks();
      }
      this.historyLoaded = true;
    } catch (error) {
      console.error("Error loading message history:", error);
    }
  }
  async saveMessageHistory() {
    if (this.messages.length === 0)
      return;
    try {
      const serializedMessages = this.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString()
      }));
      await this.plugin.saveMessageHistory(JSON.stringify(serializedMessages));
    } catch (error) {
      console.error("Error saving message history:", error);
    }
  }
  guaranteedScrollToBottom() {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    requestAnimationFrame(() => {
      if (!this.chatContainer)
        return;
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    });
  }
  async sendMessage() {
    if (this.isProcessing)
      return;
    const content = this.inputEl.value.trim();
    if (!content)
      return;
    this.addMessage("user", content);
    this.inputEl.value = "";
    await this.processWithOllama(content);
  }
  addMessage(role, content) {
    const message = {
      role,
      content,
      timestamp: new Date()
    };
    this.messages.push(message);
    this.renderMessage(message);
    this.saveMessageHistory();
    setTimeout(() => {
      this.guaranteedScrollToBottom();
    }, 100);
  }
  processThinkingTags(content) {
    if (!content.includes("<think>")) {
      return content;
    }
    const parts = [];
    let currentPosition = 0;
    const thinkingRegex = /<think>([\s\S]*?)<\/think>/g;
    let match;
    while ((match = thinkingRegex.exec(content)) !== null) {
      if (match.index > currentPosition) {
        const textBefore = content.substring(currentPosition, match.index);
        parts.push(this.markdownToHtml(textBefore));
      }
      const thinkingContent = match[1];
      const foldableHtml = `
        <div class="thinking-block">
          <div class="thinking-header" data-fold-state="expanded">
            <div class="thinking-toggle">\u25BC</div>
            <div class="thinking-title">Thinking</div>
          </div>
          <div class="thinking-content">${this.markdownToHtml(thinkingContent)}</div>
        </div>
      `;
      parts.push(foldableHtml);
      currentPosition = match.index + match[0].length;
    }
    if (currentPosition < content.length) {
      const textAfter = content.substring(currentPosition);
      parts.push(this.markdownToHtml(textAfter));
    }
    return parts.join("");
  }
  markdownToHtml(markdown) {
    if (!markdown || markdown.trim() === "")
      return "";
    const tempDiv = document.createElement("div");
    import_obsidian.MarkdownRenderer.renderMarkdown(markdown, tempDiv, "", this);
    return tempDiv.innerHTML;
  }
  /**
   * Escape HTML special characters
   */
  escapeHtml(unsafe) {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  addThinkingToggleListeners(contentEl) {
    const thinkingHeaders = contentEl.querySelectorAll(".thinking-header");
    thinkingHeaders.forEach((header) => {
      header.addEventListener("click", () => {
        const content = header.nextElementSibling;
        const toggleIcon = header.querySelector(".thinking-toggle");
        if (!content || !toggleIcon)
          return;
        const isFolded = header.getAttribute("data-fold-state") === "folded";
        if (isFolded) {
          content.style.display = "block";
          toggleIcon.textContent = "\u25BC";
          header.setAttribute("data-fold-state", "expanded");
        } else {
          content.style.display = "none";
          toggleIcon.textContent = "\u25BA";
          header.setAttribute("data-fold-state", "folded");
        }
      });
    });
  }
  hasThinkingTags(content) {
    const formats = [
      "<think>",
      "&lt;think&gt;",
      "<think ",
      // In case there are attributes
      "\\<think\\>",
      "%3Cthink%3E"
      // URL encoded
    ];
    return formats.some((format) => content.includes(format));
  }
  /**
   * Add toggle all button for thinking blocks
   */
  addToggleAllButton(contentContainer, contentEl) {
    const toggleAllButton = contentContainer.createEl("button", {
      cls: "toggle-all-thinking-button",
      attr: { title: "\u0417\u0433\u043E\u0440\u043D\u0443\u0442\u0438/\u0440\u043E\u0437\u0433\u043E\u0440\u043D\u0443\u0442\u0438 \u0432\u0441\u0456 \u0431\u043B\u043E\u043A\u0438 thinking" }
    });
    toggleAllButton.textContent = "Toggle All Thinking";
    toggleAllButton.addEventListener("click", () => {
      const thinkingContents = contentEl.querySelectorAll(".thinking-content");
      const thinkingToggles = contentEl.querySelectorAll(".thinking-toggle");
      let allHidden = true;
      thinkingContents.forEach((content) => {
        if (content.style.display !== "none") {
          allHidden = false;
        }
      });
      thinkingContents.forEach((content, index) => {
        content.style.display = allHidden ? "block" : "none";
        thinkingToggles[index].textContent = allHidden ? "\u25BC" : "\u25BA";
      });
    });
  }
  renderMessage(message) {
    const isUser = message.role === "user";
    const isFirstInGroup = this.isFirstMessageInGroup(message);
    const isLastInGroup = this.isLastMessageInGroup(message);
    let messageGroup;
    const lastGroup = this.chatContainer.lastElementChild;
    if (isFirstInGroup) {
      messageGroup = this.chatContainer.createDiv({
        cls: `message-group ${isUser ? "user-message-group" : "ollama-message-group"}`
      });
    } else {
      messageGroup = lastGroup;
    }
    const messageEl = messageGroup.createDiv({
      cls: `message ${isUser ? "user-message bubble user-bubble" : "ollama-message bubble ollama-bubble"} ${isLastInGroup ? isUser ? "user-message-tail" : "ollama-message-tail" : ""}`
    });
    const contentContainer = messageEl.createDiv({ cls: "message-content-container" });
    const contentEl = contentContainer.createDiv({
      cls: "message-content"
    });
    if (message.role === "assistant") {
      const decodedContent = this.decodeHtmlEntities(message.content);
      const hasThinkingTags = message.content.includes("<think>") || decodedContent.includes("<think>");
      if (hasThinkingTags) {
        const contentToProcess = hasThinkingTags && !message.content.includes("<thing>") ? decodedContent : message.content;
        const processedContent = this.processThinkingTags(contentToProcess);
        contentEl.innerHTML = processedContent;
        this.addThinkingToggleListeners(contentEl);
      } else {
        import_obsidian.MarkdownRenderer.renderMarkdown(message.content, contentEl, "", this);
      }
    } else {
      message.content.split("\n").forEach((line, index, array) => {
        contentEl.createSpan({ text: line });
        if (index < array.length - 1) {
          contentEl.createEl("br");
        }
      });
    }
    const copyButton = contentContainer.createEl("button", {
      cls: "copy-button",
      attr: { title: "\u0421\u043A\u043E\u043F\u0456\u044E\u0432\u0430\u0442\u0438" }
    });
    (0, import_obsidian.setIcon)(copyButton, "copy");
    copyButton.addEventListener("click", () => {
      let textToCopy = message.content;
      if (message.role === "assistant" && textToCopy.includes("<thinking>")) {
        textToCopy = textToCopy.replace(/<thinking>[\s\S]*?<\/thinking>/g, "");
      }
      navigator.clipboard.writeText(textToCopy);
      copyButton.setText("Copied!");
      setTimeout(() => {
        copyButton.empty();
        (0, import_obsidian.setIcon)(copyButton, "copy");
      }, 2e3);
    });
    if (isLastInGroup) {
      messageEl.createDiv({
        cls: "message-timestamp",
        text: this.formatTime(message.timestamp)
      });
    }
  }
  isFirstMessageInGroup(message) {
    const index = this.messages.indexOf(message);
    if (index === 0)
      return true;
    const prevMessage = this.messages[index - 1];
    return prevMessage.role !== message.role;
  }
  isLastMessageInGroup(message) {
    const index = this.messages.indexOf(message);
    if (index === this.messages.length - 1)
      return true;
    const nextMessage = this.messages[index + 1];
    return nextMessage.role !== message.role;
  }
  formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  decodeHtmlEntities(text) {
    const textArea = document.createElement("textarea");
    textArea.innerHTML = text;
    return textArea.value;
  }
  detectThinkingTags(content) {
    const formats = [
      { name: "standard", regex: /<think>[\s\S]*?<\/think>/g },
      { name: "escaped", regex: /&lt;think&gt;[\s\S]*?&lt;\/think&gt;/g },
      { name: "backslash-escaped", regex: /\\<think\\>[\s\S]*?\\<\/think\\>/g },
      { name: "url-encoded", regex: /%3Cthink%3E[\s\S]*?%3C\/think%3E/g }
    ];
    for (const format of formats) {
      if (format.regex.test(content)) {
        return { hasThinkingTags: true, format: format.name };
      }
    }
    return { hasThinkingTags: false, format: "none" };
  }
  async processWithOllama(content) {
    this.isProcessing = true;
    const loadingMessageEl = this.addLoadingMessage();
    setTimeout(async () => {
      try {
        let prompt = content;
        if (this.plugin.settings.ragEnabled) {
          if (this.plugin.ragService && this.plugin.ragService.findRelevantDocuments("test").length === 0) {
            await this.plugin.ragService.indexDocuments();
          }
          const ragContext = this.plugin.ragService.prepareContext(content);
          if (ragContext) {
            prompt = `${ragContext}

User Query: ${content}

Please respond to the user's query based on the provided context. If the context doesn't contain relevant information, please state that and answer based on your general knowledge.`;
          }
        }
        const data = await this.plugin.apiService.generateResponse(
          this.plugin.settings.modelName,
          prompt
        );
        const decodedResponse = this.decodeHtmlEntities(data.response);
        const finalResponse = decodedResponse.includes("<think>") ? decodedResponse : data.response;
        if (loadingMessageEl && loadingMessageEl.parentNode) {
          loadingMessageEl.parentNode.removeChild(loadingMessageEl);
        }
        this.addMessage("assistant", finalResponse);
        this.initializeThinkingBlocks();
      } catch (error) {
        console.error("Error processing request with Ollama:", error);
        if (loadingMessageEl && loadingMessageEl.parentNode) {
          loadingMessageEl.parentNode.removeChild(loadingMessageEl);
        }
        this.addMessage(
          "assistant",
          "Connection error with Ollama. Please check the settings and ensure the server is running."
        );
      } finally {
        this.isProcessing = false;
      }
    }, 0);
  }
  initializeThinkingBlocks() {
    setTimeout(() => {
      const thinkingHeaders = this.chatContainer.querySelectorAll(".thinking-header");
      thinkingHeaders.forEach((header) => {
        const content = header.nextElementSibling;
        const toggleIcon = header.querySelector(".thinking-toggle");
        if (!content || !toggleIcon)
          return;
        content.style.display = "none";
        toggleIcon.textContent = "\u25BA";
        header.setAttribute("data-fold-state", "folded");
      });
    }, 100);
  }
  addLoadingMessage() {
    const messageGroup = this.chatContainer.createDiv({
      cls: "message-group ollama-message-group"
    });
    const messageEl = messageGroup.createDiv({
      cls: "message ollama-message ollama-message-tail"
    });
    const dotsContainer = messageEl.createDiv({
      cls: "thinking-dots"
    });
    for (let i = 0; i < 3; i++) {
      dotsContainer.createDiv({
        cls: "thinking-dot"
      });
    }
    this.guaranteedScrollToBottom();
    return messageGroup;
  }
  async clearChatMessages() {
    this.messages = [];
    this.chatContainer.empty();
    this.historyLoaded = false;
  }
  async startVoiceRecognition() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm; codecs=pcm" });
      const audioChunks = [];
      mediaRecorder.ondataavailable = (event) => {
        console.log("mediaRecorder.ondataavailable", event.data);
        audioChunks.push(event.data);
      };
      mediaRecorder.onstop = () => {
        console.log("mediaRecorder.onstop");
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        console.log("Sending audioBlob to worker:", audioBlob);
        if (this.speechWorker) {
          this.speechWorker.postMessage({ apiKey: "AIzaSyCm9wPh6ZLy-KsDzr2arMSTQ1i-yTu8nR4", audioBlob });
          console.log("Message posted to worker");
        } else {
          console.error("Worker is not initialized");
        }
        this.speechWorker.onmessage = (event) => {
          const transcript = event.data;
          console.log("Received transcript from worker:", transcript);
          this.inputEl.value = transcript;
        };
        this.speechWorker.onerror = (error) => {
          console.error("Worker error:", error);
        };
      };
      mediaRecorder.start();
      console.log("Recording started");
      setTimeout(() => {
        mediaRecorder.stop();
        console.log("Recording stopped");
      }, 5e3);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  }
};
var OllamaView = _OllamaView;
OllamaView.instance = null;

// settings.ts
var import_obsidian2 = require("obsidian");
var DEFAULT_SETTINGS = {
  modelName: "mistral",
  ollamaServerUrl: "http://localhost:11434",
  logFileSizeLimit: 1024,
  // Default 1MB (1024 KB)
  saveMessageHistory: true,
  ragEnabled: false,
  ragFolderPath: "data",
  contextWindowSize: 5
};
var OllamaSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  getDisplayText() {
    return "Ollama";
  }
  getId() {
    return "ollama-plugin";
  }
  async display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian2.Setting(containerEl).setName("Ollama Server URL").setDesc("IP address and port where Ollama is running (e.g. http://192.168.1.10:11434)").addText((text) => text.setPlaceholder("http://localhost:11434").setValue(this.plugin.settings.ollamaServerUrl).onChange(async (value) => {
      this.plugin.settings.ollamaServerUrl = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("Server Connection").setDesc("Reconnect to local model server and refresh available models").addButton((button) => button.setButtonText("Reconnect").setIcon("refresh-cw").onClick(async () => {
      try {
        new import_obsidian2.Notice("Connecting to Ollama server...");
        const response = await fetch(`${this.plugin.settings.ollamaServerUrl}/api/tags`, {
          method: "GET",
          headers: { "Content-Type": "application/json" }
        });
        if (response.ok) {
          new import_obsidian2.Notice("Successfully connected to Ollama server!");
          containerEl.empty();
          this.display();
        } else {
          new import_obsidian2.Notice("Failed to connect to Ollama server. Check the URL and ensure the server is running.");
        }
      } catch (error) {
        new import_obsidian2.Notice("Connection error. Please check the server URL and your network connection.");
      }
    }));
    let availableModels = [];
    try {
      availableModels = await this.plugin.apiService.getModels();
    } catch (error) {
      console.error("Error fetching available models:", error);
    }
    const selectedModel = availableModels.includes(this.plugin.settings.modelName) ? this.plugin.settings.modelName : availableModels.length > 0 ? availableModels[0] : "";
    const modelSetting = new import_obsidian2.Setting(containerEl).setName("Model Name").setDesc("Select the language model to use");
    const dropdown = modelSetting.addDropdown((dropdown2) => {
      const selectEl = dropdown2.selectEl;
      while (selectEl.firstChild) {
        selectEl.removeChild(selectEl.firstChild);
      }
      availableModels.forEach((model) => {
        dropdown2.addOption(model, model);
      });
      if (availableModels.length === 0) {
        dropdown2.addOption("", "No models available");
      }
      dropdown2.setValue(selectedModel);
      dropdown2.onChange(async (value) => {
        this.plugin.settings.modelName = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian2.Setting(containerEl).setName("Save Message History").setDesc("Save chat message history between sessions").addToggle((toggle) => toggle.setValue(this.plugin.settings.saveMessageHistory).onChange(async (value) => {
      this.plugin.settings.saveMessageHistory = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("Log File Size Limit").setDesc("Maximum size of message history log file in KB (1024 KB = 1 MB)").addSlider((slider) => slider.setLimits(256, 10240, 256).setValue(this.plugin.settings.logFileSizeLimit).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.logFileSizeLimit = value;
      await this.plugin.saveSettings();
    })).addExtraButton((button) => button.setIcon("reset").setTooltip("Reset to default (1024 KB)").onClick(async () => {
      this.plugin.settings.logFileSizeLimit = DEFAULT_SETTINGS.logFileSizeLimit;
      await this.plugin.saveSettings();
      this.display();
    }));
    new import_obsidian2.Setting(containerEl).setName("Clear History").setDesc("Delete all chat history").addButton((button) => button.setButtonText("Clear").onClick(async () => {
      await this.plugin.clearMessageHistory();
      new import_obsidian2.Notice("Chat history cleared.");
    }));
    new import_obsidian2.Setting(containerEl).setName("Enable RAG").setDesc("Use Retrieval Augmented Generation with your notes").addToggle((toggle) => toggle.setValue(this.plugin.settings.ragEnabled).onChange(async (value) => {
      this.plugin.settings.ragEnabled = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("RAG Folder Path").setDesc("Path to the folder containing notes for RAG (relative to vault root)").addText((text) => text.setPlaceholder("data").setValue(this.plugin.settings.ragFolderPath).onChange(async (value) => {
      this.plugin.settings.ragFolderPath = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("Context Window Size").setDesc("Number of relevant documents to include in context").addSlider((slider) => slider.setLimits(1, 10, 1).setValue(this.plugin.settings.contextWindowSize).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.contextWindowSize = value;
      await this.plugin.saveSettings();
    }));
  }
};

// ragService.ts
var RagService = class {
  constructor(plugin) {
    this.documents = [];
    this.isIndexing = false;
    this.plugin = plugin;
  }
  /**
   * Index all markdown files in the specified folder path
   */
  async indexDocuments() {
    var _a, _b;
    if (this.isIndexing)
      return;
    this.isIndexing = true;
    try {
      const folderPath = this.plugin.settings.ragFolderPath;
      const vault = this.plugin.app.vault;
      console.log(`RAG folder path: "${folderPath}"`);
      const allFiles = vault.getFiles();
      console.log(`Total files in vault: ${allFiles.length}`);
      const files = await this.getMarkdownFiles(vault, folderPath);
      console.log(`Found ${files.length} markdown files from "${folderPath}"`);
      console.log(`Indexing ${files.length} markdown files from ${folderPath}`);
      this.documents = [];
      for (const file of files) {
        try {
          const content = await vault.read(file);
          this.documents.push({
            path: file.path,
            content,
            metadata: {
              filename: file.name,
              created: (_a = file.stat) == null ? void 0 : _a.ctime,
              modified: (_b = file.stat) == null ? void 0 : _b.mtime
            }
          });
        } catch (error) {
          console.error(`Error reading file ${file.path}:`, error);
        }
      }
      console.log(`Indexed ${this.documents.length} documents for RAG`);
    } catch (error) {
      console.error("Error indexing documents:", error);
    } finally {
      this.isIndexing = false;
    }
  }
  /**
   * Get all markdown files in the specified folder path
   */
  async getMarkdownFiles(vault, folderPath) {
    const files = [];
    let normalizedFolderPath = folderPath;
    if (normalizedFolderPath && !normalizedFolderPath.endsWith("/")) {
      normalizedFolderPath += "/";
    }
    const isRootPath = !normalizedFolderPath || normalizedFolderPath === "/";
    console.log(`Normalized path: "${normalizedFolderPath}", isRoot: ${isRootPath}`);
    const allFiles = vault.getFiles();
    for (const file of allFiles) {
      if (file.extension === "md") {
        if (isRootPath || file.path.startsWith(normalizedFolderPath)) {
          console.log(`Adding file: ${file.path}`);
          files.push(file);
        } else {
        }
      }
    }
    return files;
  }
  /**
   * Simple search implementation to find relevant documents for a query
   * Later this could be replaced with a more sophisticated vector search
   */
  findRelevantDocuments(query, limit = 5) {
    if (!this.documents.length) {
      return [];
    }
    const scoredDocs = this.documents.map((doc) => {
      const lowerContent = doc.content.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const terms = lowerQuery.split(/\s+/);
      let score = 0;
      for (const term of terms) {
        if (term.length > 2) {
          const regex = new RegExp(term, "gi");
          const matches = lowerContent.match(regex);
          if (matches) {
            score += matches.length;
          }
        }
      }
      return { doc, score };
    });
    return scoredDocs.sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.doc);
  }
  /**
   * Prepare context from relevant documents
   */
  prepareContext(query) {
    if (!this.plugin.settings.ragEnabled || this.documents.length === 0) {
      return "";
    }
    const limit = this.plugin.settings.contextWindowSize;
    const relevantDocs = this.findRelevantDocuments(query, limit);
    if (relevantDocs.length === 0) {
      return "";
    }
    let context = "### Context from your notes:\n\n";
    relevantDocs.forEach((doc, index) => {
      var _a;
      context += `Document ${index + 1} (${(_a = doc.metadata) == null ? void 0 : _a.filename}):
`;
      const maxChars = 1500;
      const content = doc.content.length > maxChars ? doc.content.substring(0, maxChars) + "..." : doc.content;
      context += content + "\n\n";
    });
    context += "### End of context\n\n";
    return context;
  }
};

// apiServices.ts
var ApiService = class {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  /**
   * Set base URL for the API
   */
  setBaseUrl(url) {
    this.baseUrl = url;
  }
  /**
   * Generate response from Ollama
   */
  async generateResponse(model, prompt) {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! Status: ${response.status}, ${errorText}`);
    }
    return await response.json();
  }
  /**
   * Get available models from Ollama
   */
  async getModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data.models)) {
        return data.models.map(
          (model) => typeof model === "object" ? model.name : model
        );
      }
      return [];
    } catch (error) {
      console.error("Error fetching models:", error);
      return [];
    }
  }
};

// main.ts
var OllamaPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.view = null;
    this.documents = [];
    this.embeddings = [];
    // Add debouncing to prevent excessive indexing
    this.indexUpdateTimeout = null;
  }
  async onload() {
    console.log("Ollama Plugin Loaded!");
    await this.loadSettings();
    this.apiService = new ApiService(this.settings.ollamaServerUrl);
    this.ragService = new RagService(this);
    this.registerView(VIEW_TYPE_OLLAMA, (leaf) => {
      this.view = new OllamaView(leaf, this);
      return this.view;
    });
    this.addRibbonIcon("message-square", "\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438 Ollama", () => {
      this.activateView();
    });
    this.addCommand({
      id: "open-ollama-view",
      name: "\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438 Ollama Chat",
      callback: () => {
        this.activateView();
      }
    });
    this.addCommand({
      id: "index-rag-documents",
      name: "\u0406\u043D\u0434\u0435\u043A\u0441\u0443\u0432\u0430\u0442\u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0438 \u0434\u043B\u044F RAG",
      callback: async () => {
        await this.ragService.indexDocuments();
      }
    });
    this.settingTab = new OllamaSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    this.app.workspace.onLayoutReady(() => {
      const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_OLLAMA)[0];
      if (!existingLeaf) {
        this.activateView();
      } else {
        console.log("Ollama view already exists, not creating a new one");
      }
      if (this.settings.ragEnabled) {
        this.ragService.indexDocuments();
      }
    });
    this.registerEvent(
      this.app.vault.on("modify", () => {
        if (this.settings.ragEnabled) {
          this.debounceIndexUpdate();
        }
      })
    );
  }
  // Update API service when settings change
  updateApiService() {
    this.apiService.setBaseUrl(this.settings.ollamaServerUrl);
  }
  debounceIndexUpdate() {
    if (this.indexUpdateTimeout) {
      clearTimeout(this.indexUpdateTimeout);
    }
    this.indexUpdateTimeout = setTimeout(() => {
      this.ragService.indexDocuments();
      this.indexUpdateTimeout = null;
    }, 3e4);
  }
  async activateView() {
    var _a;
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_OLLAMA)[0];
    if (!leaf) {
      console.log("Creating new Ollama view leaf");
      leaf = (_a = workspace.getRightLeaf(false)) != null ? _a : workspace.getLeaf();
      await leaf.setViewState({ type: VIEW_TYPE_OLLAMA, active: true });
    } else {
      console.log("Ollama view leaf already exists");
    }
    workspace.revealLeaf(leaf);
    return leaf;
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.updateApiService();
  }
  getOllamaApiUrl() {
    return this.settings.ollamaServerUrl || DEFAULT_SETTINGS.ollamaServerUrl;
  }
  // Функція для збереження історії повідомлень
  async saveMessageHistory(messages) {
    if (!this.settings.saveMessageHistory)
      return;
    try {
      const basePath = this.app.vault.configDir + "/plugins/obsidian-ollama-duet";
      const logPath = basePath + "/chat_history.json";
      const adapter = this.app.vault.adapter;
      let fileExists = await adapter.exists(logPath);
      let fileSize = 0;
      if (fileExists) {
        const stat = await adapter.stat(logPath);
        fileSize = (stat == null ? void 0 : stat.size) ? stat.size / 1024 : 0;
      }
      if (fileSize > this.settings.logFileSizeLimit) {
        if (fileExists) {
          const backupPath = logPath + ".backup";
          if (await adapter.exists(backupPath)) {
            await adapter.remove(backupPath);
          }
          await adapter.copy(logPath, backupPath);
        }
        await adapter.write(logPath, messages);
      } else {
        if (!fileExists) {
          await adapter.write(logPath, messages);
        } else {
          const existingData = await adapter.read(logPath);
          try {
            const existingMessages = JSON.parse(existingData);
            const newMessages = JSON.parse(messages);
            const merged = JSON.stringify([...existingMessages, ...newMessages]);
            if (merged.length / 1024 > this.settings.logFileSizeLimit) {
              const allMessages = [...existingMessages, ...newMessages];
              let trimmedMessages = allMessages;
              while (JSON.stringify(trimmedMessages).length / 1024 > this.settings.logFileSizeLimit) {
                trimmedMessages = trimmedMessages.slice(1);
              }
              await adapter.write(logPath, JSON.stringify(trimmedMessages));
            } else {
              await adapter.write(logPath, merged);
            }
          } catch (e) {
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
    if (!this.settings.saveMessageHistory)
      return [];
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
        if (this.view) {
          this.view.clearChatMessages();
        }
      }
    } catch (error) {
      console.error("Failed to clear message history:", error);
    }
  }
};
