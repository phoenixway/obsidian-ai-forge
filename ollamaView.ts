import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  MarkdownRenderer,
  Notice,
  debounce
} from "obsidian";
import OllamaPlugin from "./main";

export const VIEW_TYPE_OLLAMA = "ollama-chat-view";
const CSS_CLASS_CONTAINER = "ollama-container";
const CSS_CLASS_CHAT_CONTAINER = "ollama-chat-container";
const CSS_CLASS_INPUT_CONTAINER = "chat-input-container";
const CSS_CLASS_BUTTONS_CONTAINER = "buttons-container";
const CSS_CLASS_SEND_BUTTON = "send-button";
const CSS_CLASS_VOICE_BUTTON = "voice-button";
const CSS_CLASS_MENU_BUTTON = "menu-button";
const CSS_CLASS_MENU_DROPDOWN = "menu-dropdown";
const CSS_CLASS_MENU_OPTION = "menu-option";
const CSS_CLASS_SETTINGS_OPTION = "settings-option";
const CSS_CLASS_EMPTY_STATE = "ollama-empty-state";
const CSS_CLASS_MESSAGE_GROUP = "message-group";
const CSS_CLASS_USER_GROUP = "user-message-group";
const CSS_CLASS_OLLAMA_GROUP = "ollama-message-group";
const CSS_CLASS_SYSTEM_GROUP = "system-message-group";
const CSS_CLASS_ERROR_GROUP = "error-message-group";
const CSS_CLASS_MESSAGE = "message";
const CSS_CLASS_USER_MESSAGE = "user-message";
const CSS_CLASS_OLLAMA_MESSAGE = "ollama-message";
const CSS_CLASS_SYSTEM_MESSAGE = "system-message";
const CSS_CLASS_ERROR_MESSAGE = "error-message";
const CSS_CLASS_SYSTEM_ICON = "system-icon";
const CSS_CLASS_ERROR_ICON = "error-icon";
const CSS_CLASS_SYSTEM_TEXT = "system-message-text";
const CSS_CLASS_ERROR_TEXT = "error-message-text";
const CSS_CLASS_CONTENT_CONTAINER = "message-content-container";
const CSS_CLASS_CONTENT = "message-content";
const CSS_CLASS_THINKING_DOTS = "thinking-dots";
const CSS_CLASS_THINKING_DOT = "thinking-dot";
const CSS_CLASS_THINKING_BLOCK = "thinking-block";
const CSS_CLASS_THINKING_HEADER = "thinking-header";
const CSS_CLASS_THINKING_TOGGLE = "thinking-toggle";
const CSS_CLASS_THINKING_TITLE = "thinking-title";
const CSS_CLASS_THINKING_CONTENT = "thinking-content";
const CSS_CLASS_TIMESTAMP = "message-timestamp";
const CSS_CLASS_COPY_BUTTON = "copy-button";
const CSS_CLASS_TEXTAREA_EXPANDED = "expanded";
const CSS_CLASS_RECORDING = "recording";
const CSS_CLASS_DISABLED = "disabled";
const CSS_CLASS_MESSAGE_ARRIVING = "message-arriving";
const CSS_CLASS_DATE_SEPARATOR = "chat-date-separator";
const CSS_CLASS_AVATAR = "message-group-avatar";
const CSS_CLASS_AVATAR_USER = "user-avatar";
const CSS_CLASS_AVATAR_AI = "ai-avatar";
const CSS_CLASS_CODE_BLOCK_COPY_BUTTON = "code-block-copy-button";
const CSS_CLASS_NEW_MESSAGE_INDICATOR = "new-message-indicator";
const CSS_CLASS_VISIBLE = "visible";
const CSS_CLASS_MENU_SEPARATOR = "menu-separator";
const CSS_CLASS_CLEAR_CHAT_OPTION = "clear-chat-option";

export type MessageRole = "user" | "assistant" | "system" | "error";

interface Message {
  role: MessageRole;
  content: string;
  timestamp: Date;
}

interface AddMessageOptions {
  saveHistory?: boolean;
  timestamp?: Date | string;
}

export class OllamaView extends ItemView {
  private readonly plugin: OllamaPlugin;
  private chatContainerEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private chatContainer!: HTMLElement;
  private sendButton!: HTMLButtonElement;
  private voiceButton!: HTMLButtonElement;
  private menuButton!: HTMLButtonElement;
  private menuDropdown!: HTMLElement;
  private clearChatOption!: HTMLElement;
  private settingsOption!: HTMLElement;
  private buttonsContainer!: HTMLElement;

  private messages: Message[] = [];
  private isProcessing: boolean = false;
  private scrollTimeout: NodeJS.Timeout | null = null;
  static instance: OllamaView | null = null;

  private speechWorker: Worker | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;

  private messagesPairCount: number = 0;
  private emptyStateEl: HTMLElement | null = null;

  private resizeTimeout: NodeJS.Timeout | null = null;
  private scrollListenerDebounced: () => void;

  private lastMessageDate: Date | null = null;
  private newMessagesIndicatorEl: HTMLElement | null = null;
  private userScrolledUp: boolean = false;

  // Debounced save function
  private debouncedSaveMessageHistory = debounce(this.saveMessageHistory, 300, true);

  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin;

    if (OllamaView.instance && OllamaView.instance !== this) {
      console.warn("Replacing existing OllamaView instance.");
      // Optionally close the previous instance gracefully if needed
      // OllamaView.instance.leaf.detach();
    }
    OllamaView.instance = this;

    if (this.plugin.apiService) {
      this.plugin.apiService.setOllamaView(this);
    }

    this.initSpeechWorker();
    this.scrollListenerDebounced = debounce(this.handleScroll, 150, true);
  }

  public getMessagesCount(): number {
    return this.messages.length;
  }

  public getMessagesPairCount(): number {
    return this.messagesPairCount;
  }

  getViewType(): string { return VIEW_TYPE_OLLAMA; }
  getDisplayText(): string { return "Ollama Chat"; }
  getIcon(): string { return "message-square"; }

  async onOpen(): Promise<void> {
    this.createUIElements();
    this.updateInputPlaceholder(this.plugin.settings.modelName);
    this.attachEventListeners();
    this.autoResizeTextarea();
    this.updateSendButtonState();

    this.lastMessageDate = null;
    await this.loadAndRenderHistory();

    this.inputEl?.focus();
    this.guaranteedScrollToBottom(150, true);
    this.inputEl?.dispatchEvent(new Event('input')); // Trigger initial size calculation
  }

  async onClose(): Promise<void> {
    console.log("OllamaView onClose: Cleaning up resources.");
    if (this.speechWorker) { this.speechWorker.terminate(); this.speechWorker = null; }
    this.stopVoiceRecording(false);
    if (this.audioStream) { this.audioStream.getTracks().forEach(track => track.stop()); this.audioStream = null; }
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    if (OllamaView.instance === this) { OllamaView.instance = null; }
  }

  private createUIElements(): void {
    this.contentEl.empty();
    this.chatContainerEl = this.contentEl.createDiv({ cls: CSS_CLASS_CONTAINER });
    this.chatContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_CHAT_CONTAINER });

    this.newMessagesIndicatorEl = this.chatContainerEl.createDiv({ cls: CSS_CLASS_NEW_MESSAGE_INDICATOR });
    const indicatorIcon = this.newMessagesIndicatorEl.createSpan({ cls: "indicator-icon" });
    setIcon(indicatorIcon, "arrow-down");
    this.newMessagesIndicatorEl.createSpan({ text: " New Messages" });

    const inputContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER });
    this.inputEl = inputContainer.createEl("textarea", { attr: { placeholder: `Text to ${this.plugin.settings.modelName}...` } });
    this.buttonsContainer = inputContainer.createDiv({ cls: CSS_CLASS_BUTTONS_CONTAINER });
    this.sendButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_SEND_BUTTON });
    setIcon(this.sendButton, "send");
    this.voiceButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_VOICE_BUTTON });
    setIcon(this.voiceButton, "microphone");
    this.menuButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_MENU_BUTTON });
    setIcon(this.menuButton, "more-vertical");

    this.menuDropdown = inputContainer.createEl("div", { cls: CSS_CLASS_MENU_DROPDOWN });
    this.menuDropdown.style.display = "none";
    this.clearChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLEAR_CHAT_OPTION}` });
    const clearIcon = this.clearChatOption.createEl("span", { cls: "menu-option-icon" });
    setIcon(clearIcon, "trash-2");
    this.clearChatOption.createEl("span", { cls: "menu-option-text", text: "Clear Chat" });
    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });
    this.settingsOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_SETTINGS_OPTION}` });
    const settingsIcon = this.settingsOption.createEl("span", { cls: "menu-option-icon" });
    setIcon(settingsIcon, "settings");
    this.settingsOption.createEl("span", { cls: "menu-option-text", text: "Settings" });
  }

  private attachEventListeners(): void {
    this.inputEl.addEventListener("keydown", this.handleKeyDown);
    this.inputEl.addEventListener('input', this.handleInputForResize);
    this.sendButton.addEventListener("click", this.handleSendClick);
    this.voiceButton.addEventListener("click", this.handleVoiceClick);
    this.menuButton.addEventListener("click", this.handleMenuClick);
    this.settingsOption.addEventListener("click", this.handleSettingsClick);
    this.clearChatOption.addEventListener("click", this.handleClearChatClick);
    this.registerDomEvent(window, 'resize', this.handleWindowResize);
    this.registerEvent(this.app.workspace.on('resize', this.handleWindowResize));
    this.registerDomEvent(document, 'click', this.handleDocumentClickForMenu);
    this.register(this.plugin.on('model-changed', this.handleModelChange));
    this.registerDomEvent(document, 'visibilitychange', this.handleVisibilityChange);
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange));
    this.registerDomEvent(this.chatContainer, 'scroll', this.scrollListenerDebounced);
    if (this.newMessagesIndicatorEl) {
      this.registerDomEvent(this.newMessagesIndicatorEl, 'click', this.handleNewMessageIndicatorClick);
    }
  }

  private handleKeyDown = (e: KeyboardEvent): void => { if (e.key === "Enter" && !e.shiftKey && !this.isProcessing && !this.sendButton.disabled) { e.preventDefault(); this.sendMessage(); } }
  private handleSendClick = (): void => { if (!this.isProcessing && !this.sendButton.disabled) { this.sendMessage(); } }
  private handleVoiceClick = (): void => { this.toggleVoiceRecognition(); }
  private handleMenuClick = (e: MouseEvent): void => { e.stopPropagation(); const isHidden = this.menuDropdown.style.display === "none"; this.menuDropdown.style.display = isHidden ? "block" : "none"; }
  private handleSettingsClick = async (): Promise<void> => { this.closeMenu(); const setting = (this.app as any).setting; if (setting) { await setting.open(); setting.openTabById("obsidian-ollama-duet"); } else { new Notice("Could not open settings."); } }
  private handleClearChatClick = (): void => { this.closeMenu(); this.clearChatContainer(); new Notice("Chat history cleared."); }
  private handleDocumentClickForMenu = (e: MouseEvent): void => { if (this.menuDropdown.style.display === 'block' && !this.menuButton.contains(e.target as Node) && !this.menuDropdown.contains(e.target as Node)) { this.closeMenu(); } }
  private handleModelChange = (modelName: string): void => { this.updateInputPlaceholder(modelName); if (this.messages.length > 0) { this.plugin.messageService.addSystemMessage(`Model changed to: ${modelName}`); } }
  private handleVisibilityChange = (): void => { if (document.visibilityState === 'visible') { requestAnimationFrame(() => { this.guaranteedScrollToBottom(50); this.adjustTextareaHeight(); }); } }
  private handleActiveLeafChange = (): void => { if (this.app.workspace.getActiveViewOfType(OllamaView) === this) { setTimeout(() => this.guaranteedScrollToBottom(100), 100); this.inputEl?.focus(); } }
  private handleInputForResize = (): void => { if (this.resizeTimeout) clearTimeout(this.resizeTimeout); this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 50); this.updateSendButtonState(); };
  private handleWindowResize = (): void => { if (this.resizeTimeout) clearTimeout(this.resizeTimeout); this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 100); };
  private handleScroll = (): void => { if (!this.chatContainer) return; const scrollThreshold = 150; const isScrolledToBottom = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight < scrollThreshold; if (!isScrolledToBottom) { this.userScrolledUp = true; } else { this.userScrolledUp = false; this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } }
  private handleNewMessageIndicatorClick = (): void => { this.guaranteedScrollToBottom(50, true); this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); }

  private updateInputPlaceholder(modelName: string): void { if (this.inputEl) { this.inputEl.placeholder = `Text to ${modelName}...`; } }
  private closeMenu(): void { if (this.menuDropdown) { this.menuDropdown.style.display = "none"; } }
  private autoResizeTextarea(): void { this.adjustTextareaHeight(); }
  private adjustTextareaHeight = (): void => { requestAnimationFrame(() => { if (!this.inputEl || !this.buttonsContainer) return; const viewHeight = this.contentEl.clientHeight; const maxHeight = Math.max(100, viewHeight * 0.50); this.inputEl.style.height = 'auto'; const scrollHeight = this.inputEl.scrollHeight; const newHeight = Math.min(scrollHeight, maxHeight); this.inputEl.style.height = `${newHeight}px`; this.inputEl.classList.toggle(CSS_CLASS_TEXTAREA_EXPANDED, scrollHeight > maxHeight); }); }
  private updateSendButtonState(): void { if (!this.inputEl || !this.sendButton) return; const isDisabled = this.inputEl.value.trim() === '' || this.isProcessing; this.sendButton.disabled = isDisabled; this.sendButton.classList.toggle(CSS_CLASS_DISABLED, isDisabled); }
  public showEmptyState(): void { if (this.messages.length === 0 && !this.emptyStateEl && this.chatContainer) { this.chatContainer.empty(); this.emptyStateEl = this.chatContainer.createDiv({ cls: CSS_CLASS_EMPTY_STATE }); this.emptyStateEl.createDiv({ cls: "empty-state-message", text: "No messages yet" }); this.emptyStateEl.createDiv({ cls: "empty-state-tip", text: `Type a message or use voice input to chat with ${this.plugin.settings.modelName}` }); } }
  public hideEmptyState(): void { if (this.emptyStateEl) { this.emptyStateEl.remove(); this.emptyStateEl = null; } }

  private async loadAndRenderHistory(): Promise<void> {
    this.lastMessageDate = null; // Reset date tracking before loading
    this.clearChatContainerInternal(); // Clear view state without saving
    try {
      await this.plugin.messageService.loadMessageHistory(); // Service will call internalAddMessage

      if (this.messages.length === 0) {
        this.showEmptyState();
      } else {
        this.hideEmptyState();
        // Note: Saving is handled by MessageService *after* the loop
      }
    } catch (error) {
      console.error("OllamaView: Error during history loading process:", error);
      this.clearChatContainerInternal(); // Ensure clean state on error
      this.showEmptyState();
    }
  }

  async saveMessageHistory(): Promise<void> {
    if (!this.plugin.settings.saveMessageHistory) return;

    const messagesToSave = this.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp.toISOString(),
    }));
    const dataToSave = JSON.stringify(messagesToSave);

    try {
      await this.plugin.saveMessageHistory(dataToSave);
    } catch (error) {
      console.error("OllamaView: Error saving message history:", error);
      new Notice("Failed to save chat history.");
    }
  }

  async sendMessage(): Promise<void> {
    const content = this.inputEl.value.trim();
    if (!content || this.isProcessing || this.sendButton.disabled) return;

    const messageContent = this.inputEl.value;
    this.clearInputField();
    this.setLoadingState(true);
    this.hideEmptyState();

    this.internalAddMessage("user", messageContent);

    try {
      await this.plugin.messageService.sendMessage(content);
    } catch (error) {
      console.error("OllamaView: Error sending message via MessageService:", error);
      this.internalAddMessage("error", "Failed to send message. Please try again.");
      this.setLoadingState(false);
    }
  }

  public internalAddMessage(role: MessageRole, content: string, options: AddMessageOptions = {}): void {
    const { saveHistory = true, timestamp } = options;

    // Determine the timestamp: use provided one (parsing if string), otherwise now
    let messageTimestamp: Date;
    if (timestamp) {
      try {
        messageTimestamp = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
        // Basic validation: Check if the parsed date is valid
        if (isNaN(messageTimestamp.getTime())) {
          console.warn("Invalid timestamp provided, using current time:", timestamp);
          messageTimestamp = new Date();
        }
      } catch (e) {
        console.warn("Error parsing timestamp, using current time:", timestamp, e);
        messageTimestamp = new Date();
      }
    } else {
      messageTimestamp = new Date();
    }


    const message: Message = {
      role,
      content,
      timestamp: messageTimestamp,
    };
    this.messages.push(message);

    if (role === "assistant" && this.messages.length >= 2) {
      const prevMessage = this.messages[this.messages.length - 2];
      if (prevMessage && prevMessage.role === "user") { this.messagesPairCount++; }
    }

    this.renderMessage(message); // Render uses message.timestamp
    this.hideEmptyState();

    if (saveHistory) {
      // Use the debounced save for regular additions
      this.debouncedSaveMessageHistory();
    }

    // Scroll/Indicator Logic
    if (role !== "user" && this.userScrolledUp && this.newMessagesIndicatorEl) {
      this.newMessagesIndicatorEl.classList.add(CSS_CLASS_VISIBLE);
    } else if (!this.userScrolledUp) {
      const forceScroll = role !== "user";
      this.guaranteedScrollToBottom(forceScroll ? 100 : 50, forceScroll);
    }
  }

  renderMessage(message: Message): void {
    const messageIndex = this.messages.indexOf(message);
    if (messageIndex === -1) return;

    const prevMessage = messageIndex > 0 ? this.messages[messageIndex - 1] : null;

    // Use the message's actual timestamp for date separation logic
    const isNewDay = !this.lastMessageDate || !this.isSameDay(this.lastMessageDate, message.timestamp);

    if (isNewDay) {
      // Render separator only if it's truly a new day compared to the *last rendered* date
      this.renderDateSeparator(message.timestamp);
      this.lastMessageDate = message.timestamp; // Update last rendered date
    } else if (messageIndex === 0) {
      // Always set the lastMessageDate for the very first message rendered
      // Prevents showing "Today" separator if history starts > 1 day ago
      this.lastMessageDate = message.timestamp;
    }


    let messageGroup: HTMLElement | null = null;
    let groupClass = CSS_CLASS_MESSAGE_GROUP;
    let messageClass = `${CSS_CLASS_MESSAGE} ${CSS_CLASS_MESSAGE_ARRIVING}`;
    let showAvatar = false;
    let isUser = false;

    const isFirstInGroup = !prevMessage || prevMessage.role !== message.role || isNewDay;


    switch (message.role) {
      case "user":
        groupClass += ` ${CSS_CLASS_USER_GROUP}`;
        messageClass += ` ${CSS_CLASS_USER_MESSAGE}`;
        showAvatar = true;
        isUser = true;
        break;
      case "assistant":
        groupClass += ` ${CSS_CLASS_OLLAMA_GROUP}`;
        messageClass += ` ${CSS_CLASS_OLLAMA_MESSAGE}`;
        showAvatar = true;
        break;
      case "system":
        groupClass += ` ${CSS_CLASS_SYSTEM_GROUP}`;
        messageClass += ` ${CSS_CLASS_SYSTEM_MESSAGE}`;
        break;
      case "error":
        groupClass += ` ${CSS_CLASS_ERROR_GROUP}`;
        messageClass += ` ${CSS_CLASS_ERROR_MESSAGE}`;
        break;
    }

    const lastElement = this.chatContainer.lastElementChild as HTMLElement;
    if (isFirstInGroup || !lastElement || !lastElement.classList.contains(groupClass.split(' ')[1])) {
      messageGroup = this.chatContainer.createDiv({ cls: groupClass });
      if (showAvatar) {
        this.renderAvatar(messageGroup, isUser);
      }
    } else {
      messageGroup = lastElement;
    }

    const messageEl = messageGroup.createDiv({ cls: messageClass });
    const contentContainer = messageEl.createDiv({ cls: CSS_CLASS_CONTENT_CONTAINER });
    const contentEl = contentContainer.createDiv({ cls: CSS_CLASS_CONTENT });

    switch (message.role) {
      case "assistant":
        this.renderAssistantContent(contentEl, message.content);
        break;
      case "user":
        message.content.split("\n").forEach((line, index, array) => {
          contentEl.appendText(line);
          if (index < array.length - 1) { contentEl.createEl("br"); }
        });
        break;
      case "system":
        const sysIcon = contentEl.createSpan({ cls: CSS_CLASS_SYSTEM_ICON });
        setIcon(sysIcon, "info");
        contentEl.createSpan({ cls: CSS_CLASS_SYSTEM_TEXT, text: message.content });
        break;
      case "error":
        const errIcon = contentEl.createSpan({ cls: CSS_CLASS_ERROR_ICON });
        setIcon(errIcon, "alert-triangle");
        contentEl.createSpan({ cls: CSS_CLASS_ERROR_TEXT, text: message.content });
        break;
    }

    if (message.role !== "system") {
      const copyButton = contentContainer.createEl("button", { cls: CSS_CLASS_COPY_BUTTON, attr: { title: "Copy" } });
      setIcon(copyButton, "copy");
      copyButton.addEventListener("click", () => this.handleCopyClick(message.content, copyButton));
    }

    messageEl.createDiv({
      cls: CSS_CLASS_TIMESTAMP,
      text: this.formatTime(message.timestamp), // Format the message's timestamp
    });

    // Remove animation class after a short delay
    setTimeout(() => messageEl.classList.remove(CSS_CLASS_MESSAGE_ARRIVING), 500);
  }


  private renderDateSeparator(date: Date): void { if (!this.chatContainer) return; this.chatContainer.createDiv({ cls: CSS_CLASS_DATE_SEPARATOR, text: this.formatDateSeparator(date) }); }
  private renderAvatar(groupEl: HTMLElement, isUser: boolean): void { const avatarEl = groupEl.createDiv({ cls: `${CSS_CLASS_AVATAR} ${isUser ? CSS_CLASS_AVATAR_USER : CSS_CLASS_AVATAR_AI}` }); avatarEl.textContent = isUser ? "U" : "A"; }
  private renderAssistantContent(containerEl: HTMLElement, content: string): void { const decodedContent = this.decodeHtmlEntities(content); const hasThinking = this.detectThinkingTags(decodedContent); containerEl.empty(); if (hasThinking.hasThinkingTags) { const processedHtml = this.processThinkingTags(decodedContent); containerEl.innerHTML = processedHtml; this.addThinkingToggleListeners(containerEl); this.addCodeBlockCopyButtons(containerEl); } else { MarkdownRenderer.renderMarkdown(content, containerEl, this.plugin.app.vault.getRoot().path, this); this.addCodeBlockCopyButtons(containerEl); } }
  private addCodeBlockCopyButtons(contentEl: HTMLElement): void { const preElements = contentEl.querySelectorAll("pre"); preElements.forEach((pre) => { if (pre.querySelector(`.${CSS_CLASS_CODE_BLOCK_COPY_BUTTON}`)) return; const codeContent = pre.textContent || ""; const copyBtn = pre.createEl("button", { cls: CSS_CLASS_CODE_BLOCK_COPY_BUTTON }); setIcon(copyBtn, "copy"); copyBtn.setAttribute("title", "Copy Code"); copyBtn.addEventListener("click", (e) => { e.stopPropagation(); navigator.clipboard.writeText(codeContent).then(() => { setIcon(copyBtn, "check"); copyBtn.setAttribute("title", "Copied!"); setTimeout(() => { setIcon(copyBtn, "copy"); copyBtn.setAttribute("title", "Copy Code"); }, 1500); }).catch(err => { console.error("Failed to copy code block:", err); new Notice("Failed to copy code."); }); }); }); }
  private handleCopyClick(content: string, buttonEl: HTMLElement): void { let textToCopy = content; if (this.detectThinkingTags(this.decodeHtmlEntities(content)).hasThinkingTags) { textToCopy = this.decodeHtmlEntities(content).replace(/<think>[\s\S]*?<\/think>/g, "").trim(); } navigator.clipboard.writeText(textToCopy).then(() => { setIcon(buttonEl, "check"); buttonEl.setAttribute("title", "Copied!"); setTimeout(() => { setIcon(buttonEl, "copy"); buttonEl.setAttribute("title", "Copy"); }, 2000); }).catch(err => { console.error("Failed to copy text: ", err); new Notice("Failed to copy text."); }); }
  private processThinkingTags(content: string): string { const thinkingRegex = /<think>([\s\S]*?)<\/think>/g; let lastIndex = 0; const parts: string[] = []; let match; while ((match = thinkingRegex.exec(content)) !== null) { if (match.index > lastIndex) { parts.push(this.markdownToHtml(content.substring(lastIndex, match.index))); } const thinkingContent = match[1]; const foldableHtml = `<div class="${CSS_CLASS_THINKING_BLOCK}"><div class="${CSS_CLASS_THINKING_HEADER}" data-fold-state="folded"><div class="${CSS_CLASS_THINKING_TOGGLE}">►</div><div class="${CSS_CLASS_THINKING_TITLE}">Thinking</div></div><div class="${CSS_CLASS_THINKING_CONTENT}" style="display: none;">${this.markdownToHtml(thinkingContent)}</div></div>`; parts.push(foldableHtml); lastIndex = thinkingRegex.lastIndex; } if (lastIndex < content.length) { parts.push(this.markdownToHtml(content.substring(lastIndex))); } return parts.join(""); }
  private markdownToHtml(markdown: string): string { if (!markdown || markdown.trim() === "") return ""; const tempDiv = document.createElement("div"); const contextFilePath = this.app.workspace.getActiveFile()?.path ?? ""; MarkdownRenderer.renderMarkdown(markdown, tempDiv, contextFilePath, this); return tempDiv.innerHTML; }
  private addThinkingToggleListeners(contentEl: HTMLElement): void { const thinkingHeaders = contentEl.querySelectorAll<HTMLElement>(`.${CSS_CLASS_THINKING_HEADER}`); thinkingHeaders.forEach((header) => { header.addEventListener("click", () => { const content = header.nextElementSibling as HTMLElement; const toggleIcon = header.querySelector<HTMLElement>(`.${CSS_CLASS_THINKING_TOGGLE}`); if (!content || !toggleIcon) return; const isFolded = header.getAttribute("data-fold-state") === "folded"; if (isFolded) { content.style.display = "block"; toggleIcon.textContent = "▼"; header.setAttribute("data-fold-state", "expanded"); } else { content.style.display = "none"; toggleIcon.textContent = "►"; header.setAttribute("data-fold-state", "folded"); } }); }); }
  private decodeHtmlEntities(text: string): string { if (typeof document === 'undefined') return text; const textArea = document.createElement("textarea"); textArea.innerHTML = text; return textArea.value; }
  private detectThinkingTags(content: string): { hasThinkingTags: boolean; format: string } { if (/<think>[\s\S]*?<\/think>/gi.test(content)) { return { hasThinkingTags: true, format: "standard" }; } return { hasThinkingTags: false, format: "none" }; }

  private initSpeechWorker(): void { /* ... placeholder ... */ }
  private setupSpeechWorkerHandlers(): void { /* ... placeholder ... */ }
  private insertTranscript(transcript: string): void { /* ... placeholder ... */ }
  private async toggleVoiceRecognition(): Promise<void> { /* ... placeholder ... */ }
  private async startVoiceRecognition(): Promise<void> { /* ... placeholder ... */ }
  private stopVoiceRecording(processAudio: boolean): void { /* ... placeholder ... */ }


  public getChatContainer(): HTMLElement { return this.chatContainer; }

  public clearChatContainer(): void {
    this.clearChatContainerInternal();
    this.saveMessageHistory(); // Save the now-empty state
    this.updateSendButtonState();
    this.showEmptyState(); // Explicitly show empty state after clearing
  }

  private clearChatContainerInternal(): void {
    this.messages = [];
    this.messagesPairCount = 0;
    this.lastMessageDate = null;
    if (this.chatContainer) { this.chatContainer.empty(); }
    this.hideEmptyState(); // Ensure empty state element is removed if present
  }

  public addLoadingIndicator(): HTMLElement { this.hideEmptyState(); const messageGroup = this.chatContainer.createDiv({ cls: `${CSS_CLASS_MESSAGE_GROUP} ${CSS_CLASS_OLLAMA_GROUP}` }); this.renderAvatar(messageGroup, false); const messageEl = messageGroup.createDiv({ cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_OLLAMA_MESSAGE}` }); const dotsContainer = messageEl.createDiv({ cls: CSS_CLASS_THINKING_DOTS }); for (let i = 0; i < 3; i++) { dotsContainer.createDiv({ cls: CSS_CLASS_THINKING_DOT }); } this.guaranteedScrollToBottom(50, true); return messageGroup; }
  public removeLoadingIndicator(loadingEl: HTMLElement | null): void { if (loadingEl && loadingEl.parentNode) { loadingEl.remove(); } }
  public scrollToBottom(): void { this.guaranteedScrollToBottom(50, true); }
  public clearInputField(): void { if (this.inputEl) { this.inputEl.value = ""; this.inputEl.dispatchEvent(new Event('input')); } }
  guaranteedScrollToBottom(delay = 50, forceScroll = false): void { if (this.scrollTimeout) { clearTimeout(this.scrollTimeout); } this.scrollTimeout = setTimeout(() => { requestAnimationFrame(() => { if (this.chatContainer) { const scrollThreshold = 100; const isScrolledUpCheck = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight > scrollThreshold; if (isScrolledUpCheck !== this.userScrolledUp) { this.userScrolledUp = isScrolledUpCheck; if (!this.userScrolledUp) { this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } } if (forceScroll || !this.userScrolledUp || this.isProcessing) { this.chatContainer.scrollTop = this.chatContainer.scrollHeight; if (forceScroll || this.isProcessing) { this.userScrolledUp = false; this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE); } } } }); }, delay); }
  formatTime(date: Date): string { return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }
  formatDateSeparator(date: Date): string { const now = new Date(); const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1); if (this.isSameDay(date, now)) { return "Today"; } else if (this.isSameDay(date, yesterday)) { return "Yesterday"; } else { return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); } }
  isSameDay(date1: Date, date2: Date): boolean { return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate(); }
  public setLoadingState(isLoading: boolean): void { this.isProcessing = isLoading; if (this.inputEl) this.inputEl.disabled = isLoading; this.updateSendButtonState(); if (this.voiceButton) { this.voiceButton.disabled = isLoading; this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } if (this.menuButton) { this.menuButton.disabled = isLoading; this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); } }

  public clearDisplayAndState(): void {
    this.clearChatContainerInternal(); // Clears messages array, resets count/date, empties chat container
    this.showEmptyState(); // Shows the "No messages yet" state
    this.updateSendButtonState(); // Disables send button etc.
    this.inputEl?.focus(); // Focus input field
    console.log("OllamaView: Display and internal state cleared.");
  }

}