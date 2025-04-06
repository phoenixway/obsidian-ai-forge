// OllamaView.ts
import {
  ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer, Notice, debounce, requireApiVersion, normalizePath, Menu, TFolder,
} from "obsidian";
// import { prompt, confirm } from "obsidian";
import OllamaPlugin from "./main"; // Your main plugin class
import { AvatarType } from "./settings"; // Settings types
import { RoleInfo } from "./ChatManager"; // Import RoleInfo type
import { Chat } from "./Chat"; // Import Chat class
import { ChatMetadata } from "./Chat"; // Import ChatMetadata type

// --- Constants ---
export const VIEW_TYPE_OLLAMA = "ollama-chat-view";

// CSS Classes (ensure these match your styles.css)
const CSS_CLASS_CONTAINER = "ollama-container";
const CSS_CLASS_CHAT_CONTAINER = "ollama-chat-container";
const CSS_CLASS_INPUT_CONTAINER = "chat-input-container";
const CSS_CLASS_BUTTONS_CONTAINER = "buttons-container";
const CSS_CLASS_SEND_BUTTON = "send-button";
const CSS_CLASS_VOICE_BUTTON = "voice-button";
const CSS_CLASS_TRANSLATE_INPUT_BUTTON = "translate-input-button";
const CSS_CLASS_TRANSLATING_INPUT = "translating-input";
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
const CSS_CLASS_TRANSLATE_BUTTON = "translate-button";
const CSS_CLASS_TRANSLATION_CONTAINER = "translation-container";
const CSS_CLASS_TRANSLATION_CONTENT = "translation-content";
const CSS_CLASS_TRANSLATION_PENDING = "translation-pending";
const CSS_CLASS_BUTTON_SPACER = "button-spacer";
const CSS_CLASS_TEXTAREA_EXPANDED = "expanded";
const CSS_CLASS_RECORDING = "recording";
const CSS_CLASS_DISABLED = "disabled";
const CSS_CLASS_MESSAGE_ARRIVING = "message-arriving";
const CSS_CLASS_DATE_SEPARATOR = "chat-date-separator";
const CSS_CLASS_AVATAR = "message-group-avatar";
const CSS_CLASS_AVATAR_USER = "user-avatar";
const CSS_CLASS_AVATAR_AI = "ai-avatar";
const CSS_CLASS_CODE_BLOCK_COPY_BUTTON = "code-block-copy-button";
const CSS_CLASS_CODE_BLOCK_LANGUAGE = "code-block-language";
const CSS_CLASS_NEW_MESSAGE_INDICATOR = "new-message-indicator";
const CSS_CLASS_VISIBLE = "visible";
const CSS_CLASS_MENU_SEPARATOR = "menu-separator";
const CSS_CLASS_CLEAR_CHAT_OPTION = "clear-chat-option";
const CSS_CLASS_EXPORT_CHAT_OPTION = "export-chat-option";
const CSS_CLASS_CONTENT_COLLAPSIBLE = "message-content-collapsible";
const CSS_CLASS_CONTENT_COLLAPSED = "message-content-collapsed";
const CSS_CLASS_SHOW_MORE_BUTTON = "show-more-button";
const CSS_CLASS_MODEL_OPTION = "model-option";
const CSS_CLASS_MODEL_LIST_CONTAINER = "model-list-container";
const CSS_CLASS_ROLE_OPTION = "role-option";
const CSS_CLASS_ROLE_LIST_CONTAINER = "role-list-container";
const CSS_CLASS_CHAT_OPTION = "chat-option";
const CSS_CLASS_CHAT_LIST_CONTAINER = "chat-list-container";
const CSS_CLASS_MENU_HEADER = "menu-header";
const CSS_CLASS_NEW_CHAT_OPTION = "new-chat-option";

const CSS_CLASS_RENAME_CHAT_OPTION = "rename-chat-option";
const CSS_CLASS_DELETE_CHAT_OPTION = "delete-chat-option";
const CSS_CLASS_CLONE_CHAT_OPTION = "clone-chat-option";
const CSS_CLASS_DANGER_OPTION = "danger-option";
// --- Message Types ---
export type MessageRole = "user" | "assistant" | "system" | "error";
export interface Message {
  role: MessageRole;
  content: string;
  timestamp: Date; // Use Date objects internally
}
// (Optional) Define LANGUAGES here or import from settings if needed for tooltips
const LANGUAGES: Record<string, string> = { "en": "English", "uk": "Ukrainian", "de": "German", /* ... add more ... */ };


export class OllamaView extends ItemView {
  // --- Properties ---
  private readonly plugin: OllamaPlugin;
  private chatContainerEl!: HTMLElement; // Main container for chat messages and input
  private inputEl!: HTMLTextAreaElement; // Text input area
  private chatContainer!: HTMLElement; // Scrollable div holding message groups
  private sendButton!: HTMLButtonElement; // Send message button
  private voiceButton!: HTMLButtonElement; // Voice input button
  private translateInputButton!: HTMLButtonElement; // Translate input button
  private menuButton!: HTMLButtonElement; // Open menu button
  private menuDropdown!: HTMLElement; // The dropdown menu element
  private modelListContainerEl!: HTMLElement; // Container for model list in menu
  private roleListContainerEl!: HTMLElement; // Container for role list in menu
  private chatListContainerEl!: HTMLElement; // Container for chat list in menu
  private clearChatOption!: HTMLElement; // Menu option: Clear chat
  private exportChatOption!: HTMLElement; // Menu option: Export chat
  private settingsOption!: HTMLElement; // Menu option: Open settings
  private buttonsContainer!: HTMLElement; // Container holding input area buttons
  private newChatOption!: HTMLElement;
  private renameChatOption!: HTMLElement; // <-- Нова властивість
  private cloneChatOption!: HTMLElement;  // <-- Нова властивість
  private deleteChatOption!: HTMLElement;

  // --- State ---
  private isProcessing: boolean = false; // State for send/receive cycle (blocks input)
  private scrollTimeout: NodeJS.Timeout | null = null; // For debouncing scroll logic
  // static instance: OllamaView | null = null; // Consider removing if not strictly needed
  private speechWorker: Worker | null = null; // Placeholder for potential speech worker
  private mediaRecorder: MediaRecorder | null = null; // For voice recording
  private audioStream: MediaStream | null = null; // For voice recording
  private emptyStateEl: HTMLElement | null = null; // Element shown when chat is empty
  private resizeTimeout: NodeJS.Timeout | null = null; // For debouncing textarea resize
  private scrollListenerDebounced: () => void; // Debounced scroll handler
  private currentMessages: Message[] = []; // Local cache of messages being displayed
  private lastRenderedMessageDate: Date | null = null; // Used for rendering date separators
  private newMessagesIndicatorEl: HTMLElement | null = null; // "New Messages" button
  private userScrolledUp: boolean = false; // Tracks if user has scrolled away from bottom

  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin;
    // Consider if singleton pattern (OllamaView.instance) is truly necessary
    // if (OllamaView.instance && OllamaView.instance !== this) { console.warn("Replacing existing OllamaView instance."); }
    // OllamaView.instance = this;

    // Check Obsidian API version if needed
    // if (!requireApiVersion || !requireApiVersion("1.0.0")) { console.warn("Ollama Plugin: Obsidian API version might be outdated."); }

    this.initSpeechWorker(); // Initialize speech worker (if using)
    this.scrollListenerDebounced = debounce(this.handleScroll, 150, true);
    console.log("[OllamaView] Constructed.");
  }

  // --- Getters ---
  public isMenuOpen(): boolean {
    return this.menuDropdown?.style.display === 'block';
  }

  // --- Obsidian View Methods ---
  getViewType(): string { return VIEW_TYPE_OLLAMA; }
  getDisplayText(): string { return "Ollama Chat"; } // Could show active chat name
  getIcon(): string { return "message-square"; } // Obsidian icon ID

  async onOpen(): Promise<void> {
    console.log("[OllamaView] onOpen called.");
    this.createUIElements(); // Build the HTML structure
    this.updateInputPlaceholder(this.plugin.settings.modelName); // Set initial placeholder
    this.attachEventListeners(); // Attach event handlers
    this.autoResizeTextarea(); // Initial resize
    this.updateSendButtonState(); // Initial button state
    try {
      await this.loadAndDisplayActiveChat();
    } catch (error) {
      console.error("[OllamaView] Error during initial chat load:", error);
      this.showEmptyState(); // Show empty state on error
    }

    setTimeout(() => this.inputEl?.focus(), 100);
    this.inputEl?.dispatchEvent(new Event('input')); // Trigger initial height adjustment
  }

  async onClose(): Promise<void> {
    console.log("[OllamaView] onClose: Cleaning up...");
    // Terminate worker, stop recording, clear timeouts, etc.
    if (this.speechWorker) { this.speechWorker.terminate(); this.speechWorker = null; }
    this.stopVoiceRecording(false);
    if (this.audioStream) { this.audioStream.getTracks().forEach(t => t.stop()); this.audioStream = null; }
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    // if (OllamaView.instance === this) { OllamaView.instance = null; } // If using singleton
  }

  // --- UI Creation ---
  private createUIElements(): void {
    this.contentEl.empty(); // Clear previous content
    this.chatContainerEl = this.contentEl.createDiv({ cls: CSS_CLASS_CONTAINER });

    // Scrollable chat area
    this.chatContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_CHAT_CONTAINER });

    // New messages indicator (initially hidden)
    this.newMessagesIndicatorEl = this.chatContainerEl.createDiv({ cls: CSS_CLASS_NEW_MESSAGE_INDICATOR });
    setIcon(this.newMessagesIndicatorEl.createSpan({ cls: "indicator-icon" }), "arrow-down");
    this.newMessagesIndicatorEl.createSpan({ text: " New Messages" });

    // Input area container
    const inputContainer = this.chatContainerEl.createDiv({ cls: CSS_CLASS_INPUT_CONTAINER });
    this.inputEl = inputContainer.createEl("textarea", {
      attr: { placeholder: `Text to ${this.plugin.settings.modelName}...`, rows: 1 }
    });

    // Container for buttons within the input area
    this.buttonsContainer = inputContainer.createDiv({ cls: CSS_CLASS_BUTTONS_CONTAINER });

    // --- Input Area Buttons (Order: Send, Voice, Translate Input, Menu) ---
    this.sendButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_SEND_BUTTON, attr: { 'aria-label': 'Send' } });
    setIcon(this.sendButton, "send");

    this.voiceButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_VOICE_BUTTON, attr: { 'aria-label': 'Voice Input' } });
    setIcon(this.voiceButton, "mic");

    this.translateInputButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_TRANSLATE_INPUT_BUTTON, attr: { 'aria-label': 'Translate input to English' } });
    setIcon(this.translateInputButton, "replace"); // Icon for translate/replace action
    this.translateInputButton.title = "Translate input to English";

    this.menuButton = this.buttonsContainer.createEl("button", { cls: CSS_CLASS_MENU_BUTTON, attr: { 'aria-label': 'Menu' } });
    setIcon(this.menuButton, "more-vertical");
    // --- End Input Area Buttons ---


    // --- Dropdown Menu Structure ---
    this.menuDropdown = inputContainer.createEl("div", { cls: [CSS_CLASS_MENU_DROPDOWN, "ollama-chat-menu"] });
    this.menuDropdown.style.display = "none"; // Initially hidden

    // Section: Model Selection
    this.menuDropdown.createEl("div", { text: "Select Model", cls: CSS_CLASS_MENU_HEADER });
    this.modelListContainerEl = this.menuDropdown.createDiv({ cls: CSS_CLASS_MODEL_LIST_CONTAINER });
    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    // Section: Role Selection
    this.menuDropdown.createEl("div", { text: "Select Role", cls: CSS_CLASS_MENU_HEADER });
    this.roleListContainerEl = this.menuDropdown.createDiv({ cls: CSS_CLASS_ROLE_LIST_CONTAINER });
    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    // Section: Load Chat
    this.menuDropdown.createEl("div", { text: "Load Chat", cls: CSS_CLASS_MENU_HEADER });
    this.chatListContainerEl = this.menuDropdown.createDiv({ cls: CSS_CLASS_CHAT_LIST_CONTAINER });
    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    this.menuDropdown.createEl("div", { text: "Actions", cls: CSS_CLASS_MENU_HEADER }); // Можна додати заголовок
    this.newChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_NEW_CHAT_OPTION}` });
    setIcon(this.newChatOption.createEl("span", { cls: "menu-option-icon" }), "plus-circle"); // Іконка "+"
    this.newChatOption.createEl("span", { cls: "menu-option-text", text: "New Chat" });

    this.renameChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_RENAME_CHAT_OPTION}` });
    setIcon(this.renameChatOption.createEl("span", { cls: "menu-option-icon" }), "pencil");
    this.renameChatOption.createEl("span", { cls: "menu-option-text", text: "Rename Chat" });

    this.cloneChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLONE_CHAT_OPTION}` });
    setIcon(this.cloneChatOption.createEl("span", { cls: "menu-option-icon" }), "copy-plus");
    this.cloneChatOption.createEl("span", { cls: "menu-option-text", text: "Clone Chat" });



    // Section: Actions & Settings
    this.clearChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CLEAR_CHAT_OPTION}` });
    setIcon(this.clearChatOption.createEl("span", { cls: "menu-option-icon" }), "trash-2");
    this.clearChatOption.createEl("span", { cls: "menu-option-text", text: "Clear Chat" });

    this.exportChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_EXPORT_CHAT_OPTION}` });
    setIcon(this.exportChatOption.createEl("span", { cls: "menu-option-icon" }), "download");
    this.exportChatOption.createEl("span", { cls: "menu-option-text", text: "Export to Markdown" });

    this.deleteChatOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_DELETE_CHAT_OPTION} ${CSS_CLASS_DANGER_OPTION}` });
    setIcon(this.deleteChatOption.createEl("span", { cls: "menu-option-icon" }), "trash-2");
    this.deleteChatOption.createEl("span", { cls: "menu-option-text", text: "Delete Chat" });


    this.menuDropdown.createEl('hr', { cls: CSS_CLASS_MENU_SEPARATOR });

    this.settingsOption = this.menuDropdown.createEl("div", { cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_SETTINGS_OPTION}` });
    setIcon(this.settingsOption.createEl("span", { cls: "menu-option-icon" }), "settings");
    this.settingsOption.createEl("span", { cls: "menu-option-text", text: "Settings" });
    // --- End Dropdown Menu Structure ---
  }

  // --- Event Listeners ---
  private attachEventListeners(): void {
    // Input area listeners
    this.inputEl.addEventListener("keydown", this.handleKeyDown);
    this.inputEl.addEventListener('input', this.handleInputForResize);

    // Button listeners
    this.sendButton.addEventListener("click", this.handleSendClick);
    this.voiceButton.addEventListener("click", this.handleVoiceClick);
    this.translateInputButton.addEventListener("click", this.handleTranslateInputClick);
    this.menuButton.addEventListener("click", this.handleMenuClick);

    // Menu option listeners
    this.settingsOption.addEventListener("click", this.handleSettingsClick);
    this.clearChatOption.addEventListener("click", this.handleClearChatClick);
    this.exportChatOption.addEventListener("click", this.handleExportChatClick);
    this.newChatOption.addEventListener("click", this.handleNewChatClick);

    this.renameChatOption.addEventListener("click", this.handleRenameChatClick);
    this.cloneChatOption.addEventListener("click", this.handleCloneChatClick);
    this.deleteChatOption.addEventListener("click", this.handleDeleteChatClick);


    // Window/Workspace listeners (using registerDomEvent/registerEvent for cleanup)
    this.registerDomEvent(window, 'resize', this.handleWindowResize);
    this.registerEvent(this.app.workspace.on('resize', this.handleWindowResize)); // For sidebar changes
    this.registerDomEvent(document, 'click', this.handleDocumentClickForMenu); // Close menu on outside click
    this.registerDomEvent(document, 'visibilitychange', this.handleVisibilityChange); // Handle tab visibility
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange)); // Handle focus/scroll when view becomes active

    // Chat container scroll listener
    this.registerDomEvent(this.chatContainer, 'scroll', this.scrollListenerDebounced);

    // New message indicator listener
    if (this.newMessagesIndicatorEl) {
      this.registerDomEvent(this.newMessagesIndicatorEl, 'click', this.handleNewMessageIndicatorClick);
    }

    // Listen for events from the plugin/ChatManager
    this.register(this.plugin.on('model-changed', this.handleModelChange)); // Updates placeholder
    this.register(this.plugin.on('role-changed', this.handleRoleChange)); // Adds system message (or updates state)
    this.register(this.plugin.on('roles-updated', this.handleRolesUpdated)); // Refreshes role menu if open
    this.register(this.plugin.on('active-chat-changed', this.handleActiveChatChanged)); // Load new chat data when switched
    this.register(this.plugin.on('message-added', this.handleMessageAdded)); // Append new message to display
    this.register(this.plugin.on('messages-cleared', this.handleMessagesCleared)); // Clear view on event
    this.register(this.plugin.on('chat-list-updated', this.handleChatListUpdated)); // Refresh chat list menu if open

  }

  // --- Event Handlers ---

  // Input & Send
  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey && !this.isProcessing && !this.sendButton.disabled) {
      e.preventDefault();
      this.sendMessage();
    }
  }
  private handleSendClick = (): void => {
    if (!this.isProcessing && !this.sendButton.disabled) {
      this.sendMessage();
    }
  }
  private handleInputForResize = (): void => {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    // Debounce height adjustment and button state update
    this.resizeTimeout = setTimeout(() => {
      this.adjustTextareaHeight();
      this.updateSendButtonState(); // Update based on content
    }, 50);
  };

  // Input Area Buttons
  private handleVoiceClick = (): void => { this.toggleVoiceRecognition(); }
  private handleTranslateInputClick = async (): Promise<void> => {
    const currentText = this.inputEl.value;
    const targetLang = 'en'; // Always translate to English

    if (!currentText.trim()) {
      new Notice("Input field is empty, nothing to translate.");
      return;
    }
    if (!this.plugin.settings.enableTranslation) {
      new Notice("Translation feature is disabled in settings.");
      return;
    }
    const apiKey = this.plugin.settings.googleTranslationApiKey;
    if (!apiKey) {
      new Notice("Google Translation API Key not set in settings.");
      return;
    }

    setIcon(this.translateInputButton, "loader");
    this.translateInputButton.disabled = true;
    this.translateInputButton.classList.add(CSS_CLASS_TRANSLATING_INPUT);
    this.translateInputButton.title = "Translating...";

    try {
      console.log(`[OllamaView] Translating input to ${targetLang}...`);
      const translatedText = await this.plugin.translationService.translate(currentText, targetLang);

      if (translatedText !== null) {
        this.inputEl.value = translatedText;
        this.inputEl.dispatchEvent(new Event('input')); // Trigger resize/button update
        this.inputEl.focus();
        const end = translatedText.length;
        this.inputEl.setSelectionRange(end, end);
        console.log("[OllamaView] Input translation successful.");
      } else {
        console.warn("[OllamaView] Input translation failed (service returned null).");
      }
    } catch (error) {
      console.error("Error during input translation:", error);
      new Notice("An unexpected error occurred during input translation.");
    } finally {
      setIcon(this.translateInputButton, "replace");
      this.translateInputButton.disabled = this.isProcessing; // Re-enable unless main process running
      this.translateInputButton.classList.remove(CSS_CLASS_TRANSLATING_INPUT);
      this.translateInputButton.title = "Translate input to English";
    }
  }

  // Menu Handling
  private handleMenuClick = (e: MouseEvent): void => {
    e.stopPropagation();
    const isHidden = !this.isMenuOpen();
    if (isHidden) {
      console.log("[OllamaView] Opening menu, rendering lists...");
      // Render all lists when menu is opened
      Promise.all([
        this.renderModelList(),
        this.renderRoleList(),
        this.renderChatListMenu() // Render chat list
      ]).catch(err => console.error("Error rendering menu lists:", err));
      this.menuDropdown.style.display = "block";
      this.menuDropdown.style.animation = 'menu-fade-in 0.15s ease-out';
    } else {
      this.closeMenu();
    }
  }
  private handleDocumentClickForMenu = (e: MouseEvent): void => {
    // Close menu if clicked outside
    if (this.isMenuOpen() && !this.menuButton.contains(e.target as Node) && !this.menuDropdown.contains(e.target as Node)) {
      this.closeMenu();
    }
  }

  // Menu Actions
  private handleSettingsClick = async (): Promise<void> => {
    this.closeMenu();
    // Use Obsidian's command to open settings to the plugin tab
    (this.app as any).setting?.open?.();
    (this.app as any).setting?.openTabById?.(this.plugin.manifest.id); // Use manifest ID
  }
  private handleClearChatClick = (): void => {
    this.closeMenu();
    // Ask manager to clear active chat messages
    if (this.plugin.chatManager?.getActiveChatId()) {
      // Optional: Add confirmation dialog
      // if (confirm("Are you sure you want to clear all messages in this chat?")) {
      this.plugin.chatManager.clearActiveChatMessages();
      // }
    } else {
      new Notice("No active chat to clear.");
    }
  }

  private handleNewChatClick = async (): Promise<void> => {
    this.closeMenu();
    console.log("[OllamaView] 'New Chat' button clicked.");
    try {
      const newChat = await this.plugin.chatManager.createNewChat();
      if (newChat) {
        // View оновить себе через подію 'active-chat-changed',
        // яку викличе setActiveChat всередині createNewChat
        new Notice(`Created new chat: ${newChat.metadata.name}`);
        this.focusInput(); // Фокус на полі вводу нового чату
      } else {
        new Notice("Failed to create new chat.");
      }
    } catch (error) {
      console.error("Error creating new chat via menu:", error);
      new Notice("Error creating new chat.");
    }
  }

  private handleExportChatClick = async (): Promise<void> => {
    this.closeMenu();
    console.log("[OllamaView] Export to Markdown initiated.");

    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat || activeChat.messages.length === 0) {
      new Notice("Chat is empty, nothing to export.");
      return;
    }

    try {
      const markdownContent = this.formatChatToMarkdown(activeChat.messages);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeChatName = activeChat.metadata.name.replace(/[/\\?%*:|"<>]/g, '-');
      const defaultFileName = `ollama-chat-${safeChatName}-${timestamp}.md`;

      // Determine target folder based on settings
      let targetFolderPath = this.plugin.settings.chatExportFolderPath?.trim();
      let targetFolder: TFolder | null = null; // Use TFolder type

      if (targetFolderPath) {
        targetFolderPath = normalizePath(targetFolderPath);
        const abstractFile = this.app.vault.getAbstractFileByPath(targetFolderPath);
        if (!abstractFile) { // Folder doesn't exist
          try {
            console.log(`[OllamaView] Export folder '${targetFolderPath}' not found, creating...`);
            await this.app.vault.createFolder(targetFolderPath);
            targetFolder = this.app.vault.getAbstractFileByPath(targetFolderPath) as TFolder;
            if (targetFolder) new Notice(`Created export folder: ${targetFolderPath}`);
          } catch (err: any) {
            console.error(`Failed to create export folder ${targetFolderPath}:`, err);
            new Notice(`Error: Could not create export folder. Saving to vault root.`);
            targetFolder = this.app.vault.getRoot();
          }
        } else if (abstractFile instanceof TFolder) { // Folder exists
          targetFolder = abstractFile;
        } else { // Path exists but is not a folder
          console.warn(`Export path ${targetFolderPath} is not a folder. Saving to vault root.`);
          new Notice(`Error: Export path is not a folder. Saving to vault root.`);
          targetFolder = this.app.vault.getRoot();
        }
      } else {
        // Save to vault root if no path specified
        targetFolder = this.app.vault.getRoot();
      }

      if (!targetFolder) { // Final fallback check
        console.error("Could not determine target folder for export. Aborting.");
        new Notice("Error: Could not determine target folder for export.");
        return;
      }

      const filePath = normalizePath(`${targetFolder.path}/${defaultFileName}`);
      const file = await this.app.vault.create(filePath, markdownContent);

      new Notice(`Chat exported successfully to ${file.path}`);
      console.log(`[OllamaView] Chat exported to ${file.path}`);

    } catch (error) {
      console.error("Error exporting chat to Markdown:", error);
      new Notice("Error exporting chat. Check console for details.");
    }
  }

  // Plugin Event Handlers
  private handleModelChange = (modelName: string): void => {
    this.updateInputPlaceholder(modelName);
    // Avoid adding system message if chat is empty initially
    if (this.currentMessages.length > 0) {
      this.addMessageToDisplay("system", `Model changed to: ${modelName}`, new Date());
    } else {
      // Maybe update a status indicator instead? For now, do nothing if empty.
    }
    // Re-render menu if open to update checkmark
    if (this.isMenuOpen()) {
      this.renderModelList();
    }
  }
  private handleRoleChange = (roleName: string): void => {
    const displayRole = roleName || "Default Assistant";
    if (this.currentMessages.length > 0) {
      this.addMessageToDisplay("system", `Role changed to: ${displayRole}`, new Date());
    } else {
      // Show notice only if chat was initially empty
      new Notice(`Role set to: ${displayRole}`);
    }
    // Re-render menu if open to update checkmark
    if (this.isMenuOpen()) {
      this.renderRoleList();
    }
  }
  private handleRolesUpdated = (): void => {
    console.log("[OllamaView] Roles updated event received.");
    if (this.isMenuOpen()) {
      this.renderRoleList(); // Refresh role list if menu is open
    }
  };
  private handleChatListUpdated = (): void => {
    console.log("[OllamaView] Chat list updated event received.");
    if (this.isMenuOpen()) {
      this.renderChatListMenu(); // Refresh chat list if menu is open
    }
  };
  private handleActiveChatChanged = (data: { chatId: string | null, chat: Chat | null }): void => {
    console.log(`[OllamaView] Active chat changed event received. New ID: ${data.chatId}`);
    this.loadAndDisplayActiveChat(); // Load content of the new active chat
    // Re-render menu lists if open to update selections
    if (this.isMenuOpen()) {
      this.renderModelList();
      this.renderRoleList();
      this.renderChatListMenu();
    }
  }
  private handleMessageAdded = (data: { chatId: string, message: Message }): void => {
    // Only add if the message belongs to the currently viewed chat
    if (data.chatId === this.plugin.chatManager?.getActiveChatId()) {
      // console.log("[OllamaView] Message added event received for active chat.");
      this.addMessageToDisplay(data.message.role, data.message.content, data.message.timestamp);
      // Also update chat list menu if open to refresh date
      if (this.isMenuOpen()) { this.renderChatListMenu(); }
    }
  }
  private handleMessagesCleared = (chatId: string): void => {
    if (chatId === this.plugin.chatManager?.getActiveChatId()) {
      console.log("[OllamaView] Messages cleared event received for active chat.");
      this.clearChatContainerInternal(); // Clear visual display
      this.currentMessages = []; // Clear local cache
      this.showEmptyState(); // Show empty message
    }
  }

  // Window/Workspace State Handlers
  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && this.leaf.view === this) {
      // When tab becomes visible again, scroll to bottom and adjust textarea
      requestAnimationFrame(() => {
        this.guaranteedScrollToBottom(50, true); // Force scroll to bottom
        this.adjustTextareaHeight();
        this.inputEl?.focus(); // Re-focus input
      });
    }
  }
  private handleActiveLeafChange = (leaf: WorkspaceLeaf | null): void => {
    // When this view becomes the active leaf
    if (leaf?.view === this) {
      this.inputEl?.focus();
      // Scroll down after a short delay to ensure content is rendered
      setTimeout(() => this.guaranteedScrollToBottom(150, true), 100);
    }
  }
  private handleWindowResize = (): void => {
    // Debounce textarea height adjustment on window resize
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => this.adjustTextareaHeight(), 100);
  };

  // Scroll Handling
  private handleScroll = (): void => {
    if (!this.chatContainer) return;
    const threshold = 150; // Pixels from bottom to consider "at bottom"
    const atBottom = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight < threshold;

    const previousScrolledUp = this.userScrolledUp;
    this.userScrolledUp = !atBottom;

    // If user scrolls back to bottom, hide indicator
    if (previousScrolledUp && atBottom) {
      this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
    }
  }
  private handleNewMessageIndicatorClick = (): void => {
    // Scroll to bottom smoothly and hide indicator
    this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: 'smooth' });
    this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
    this.userScrolledUp = false; // User is now at the bottom
  }

  // --- UI Update Methods ---
  private updateInputPlaceholder(modelName: string): void {
    if (this.inputEl) {
      this.inputEl.placeholder = modelName ? `Text to ${modelName}...` : "Select a model...";
    }
  }
  private closeMenu(): void {
    if (this.menuDropdown) {
      this.menuDropdown.style.display = "none";
    }
  }
  private autoResizeTextarea(): void { this.adjustTextareaHeight(); }
  private adjustTextareaHeight = (): void => {
    // Adjust textarea height based on content, up to a max height
    requestAnimationFrame(() => { // Use rAF for smoother updates
      if (!this.inputEl || !this.buttonsContainer) return;
      const maxHeightPercentage = 0.50; // Max 50% of view height
      const minHeight = 40; // Minimum height in pixels
      const viewHeight = this.contentEl.clientHeight;
      const maxHeight = Math.max(100, viewHeight * maxHeightPercentage); // Calculate max height in pixels

      this.inputEl.style.height = 'auto'; // Temporarily reset height to calculate scrollHeight
      const scrollHeight = this.inputEl.scrollHeight;
      const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight)); // Clamp height

      this.inputEl.style.height = `${newHeight}px`;
      // Add/remove class if textarea reaches max height (for potential styling)
      this.inputEl.classList.toggle(CSS_CLASS_TEXTAREA_EXPANDED, scrollHeight > maxHeight);
    });
  }
  private updateSendButtonState(): void {
    // Enable send button only if input has text and not processing
    if (!this.inputEl || !this.sendButton) return;
    const isDisabled = this.inputEl.value.trim() === '' || this.isProcessing;
    this.sendButton.disabled = isDisabled;
    this.sendButton.classList.toggle(CSS_CLASS_DISABLED, isDisabled);
  }
  public showEmptyState(): void {
    // Show placeholder message if chat is empty
    if (this.currentMessages.length === 0 && !this.emptyStateEl && this.chatContainer) {
      // Ensure container is truly empty first
      this.chatContainer.empty();

      this.emptyStateEl = this.chatContainer.createDiv({ cls: CSS_CLASS_EMPTY_STATE });
      this.emptyStateEl.createDiv({ cls: "empty-state-message", text: "No messages yet" });
      const modelName = this.plugin?.settings?.modelName || "the AI";
      this.emptyStateEl.createDiv({ cls: "empty-state-tip", text: `Type a message or use the menu options to start interacting with ${modelName}.` });
    }
  }
  public hideEmptyState(): void {
    // Remove the empty state message
    if (this.emptyStateEl) {
      this.emptyStateEl.remove();
      this.emptyStateEl = null;
    }
  }

  // --- Message Handling & Rendering ---

  /** Loads the active chat session from ChatManager and displays its messages */
  async loadAndDisplayActiveChat(): Promise<void> {
    console.log("[OllamaView] Loading and displaying active chat...");
    this.clearChatContainerInternal(); // Clear previous content & state
    this.currentMessages = [];
    this.lastRenderedMessageDate = null;

    try {
      const activeChat = await this.plugin.chatManager?.getActiveChat(); // Get current chat data

      if (activeChat && activeChat.messages.length > 0) {
        console.log(`[OllamaView] Active chat '${activeChat.metadata.name}' found with ${activeChat.messages.length} messages.`);
        this.hideEmptyState();
        this.renderMessages(activeChat.messages); // Render the loaded messages
        this.updateInputPlaceholder(activeChat.metadata.modelName || this.plugin.settings.modelName);
        // Check collapsing and scroll after rendering
        this.checkAllMessagesForCollapsing();
        setTimeout(() => { this.guaranteedScrollToBottom(100, true); }, 150); // Scroll after render
      } else if (activeChat) {
        console.log(`[OllamaView] Active chat '${activeChat.metadata.name}' found but is empty.`);
        // Chat exists but is empty
        this.showEmptyState();
        this.updateInputPlaceholder(activeChat.metadata.modelName || this.plugin.settings.modelName);
      } else {
        console.warn("[OllamaView] No active chat found or failed to load.");
        // No active chat found or failed to load
        this.showEmptyState();
        this.updateInputPlaceholder(this.plugin.settings.modelName); // Fallback placeholder
      }
    } catch (error) {
      console.error("[OllamaView] Error getting active chat:", error);
      this.showEmptyState();
      new Notice("Error loading chat history.");
    }
  }

  /** Renders a list of messages to the chat container */
  private renderMessages(messagesToRender: Message[]): void {
    this.clearChatContainerInternal(); // Ensure container is empty first
    this.currentMessages = [...messagesToRender]; // Update local cache
    this.lastRenderedMessageDate = null; // Reset date separator logic

    messagesToRender.forEach(message => {
      this.renderMessageInternal(message, messagesToRender); // Render each message
    });
    console.log(`[OllamaView] Rendered ${messagesToRender.length} messages.`);
  }

  /** Appends a single message to the display */
  addMessageToDisplay(role: MessageRole, content: string, timestamp: Date): void {
    // Avoid adding if container doesn't exist (e.g., during close)
    if (!this.chatContainer) return;

    const newMessage: Message = { role, content, timestamp };
    const currentContext = [...this.currentMessages]; // Capture context *before* adding

    // Render the new message using the captured context
    const messageEl = this.renderMessageInternal(newMessage, [...currentContext, newMessage]);

    // Update local cache AFTER rendering to ensure correct prevMessage context
    this.currentMessages.push(newMessage);

    if (messageEl) {
      this.checkMessageForCollapsing(messageEl); // Check height for collapsing
    }

    // Handle scrolling and new message indicator
    const isUserOrError = role === "user" || role === "error";
    if (!isUserOrError && this.userScrolledUp && this.newMessagesIndicatorEl) {
      this.newMessagesIndicatorEl.classList.add(CSS_CLASS_VISIBLE); // Show indicator
    } else if (!this.userScrolledUp) {
      // Scroll down if user is already at the bottom
      const forceScroll = !isUserOrError; // Force scroll more reliably for AI messages
      // Use slightly longer delay for AI messages to allow rendering
      this.guaranteedScrollToBottom(forceScroll ? 100 : 50, forceScroll);
    }

    this.hideEmptyState(); // Ensure empty state is hidden
  }

  /** Sends the user's input as a message and gets a response */
  async sendMessage(): Promise<void> {
    const content = this.inputEl.value.trim();
    if (!content || this.isProcessing || this.sendButton.disabled) return;

    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat) {
      new Notice("Error: No active chat session found.");
      return;
    }

    const userMessageContent = this.inputEl.value; // Keep original formatting
    this.clearInputField(); // Clear input immediately
    this.setLoadingState(true); // Disable UI, set processing state
    this.hideEmptyState();

    let loadingEl: HTMLElement | null = null; // To hold the loading indicator element

    try {
      // 1. Add user message to ChatManager (triggers 'message-added' event for display)
      const userMessage = await this.plugin.chatManager.addMessageToActiveChat('user', userMessageContent);
      if (!userMessage) throw new Error("Failed to add user message to history.");
      // User message appears via event handler

      // 2. Show loading indicator *after* user message is likely added
      loadingEl = this.addLoadingIndicator();
      this.guaranteedScrollToBottom(50, true); // Scroll to show indicator

      // 3. Call OllamaService to get AI response
      console.log("[OllamaView] Requesting AI response...");
      const assistantMessage = await this.plugin.ollamaService.generateChatResponse(activeChat);
      console.log("[OllamaView] Received response from service.");

      // Remove indicator BEFORE adding assistant message
      if (loadingEl) { this.removeLoadingIndicator(loadingEl); loadingEl = null; }

      // 4. Add assistant message to ChatManager (triggers 'message-added' event)
      if (assistantMessage) {
        await this.plugin.chatManager.addMessageToActiveChat(assistantMessage.role, assistantMessage.content);
        // Assistant message appears via event handler
      } else {
        console.warn("[OllamaView] Service returned null assistant message.");
        // Add error directly to display (as ChatManager won't add a null message)
        this.addMessageToDisplay("error", "Assistant did not provide a response.", new Date());
      }

    } catch (error: any) {
      console.error("[OllamaView] Send/receive cycle error:", error);
      if (loadingEl) { this.removeLoadingIndicator(loadingEl); loadingEl = null; } // Ensure indicator removed on error
      // Add error directly to display
      this.addMessageToDisplay("error", `Error: ${error.message || 'Unknown error.'}`, new Date());
    } finally {
      // Ensure indicator is removed in all cases (if somehow missed)
      if (loadingEl) { this.removeLoadingIndicator(loadingEl); }
      this.setLoadingState(false); // Re-enable UI
      this.focusInput(); // Return focus to input field
    }
  }

  // --- Core Rendering Logic ---

  /** Renders a single message bubble based on the message object and context */
  private renderMessageInternal(message: Message, messageContext: Message[]): HTMLElement | null {
    const messageIndex = messageContext.findIndex(m => m === message);
    if (messageIndex === -1) return null; // Should not happen

    const prevMessage = messageIndex > 0 ? messageContext[messageIndex - 1] : null;
    const isNewDay = !this.lastRenderedMessageDate || !this.isSameDay(this.lastRenderedMessageDate, message.timestamp);

    // --- Date Separator ---
    if (isNewDay) {
      this.renderDateSeparator(message.timestamp);
      this.lastRenderedMessageDate = message.timestamp;
    } else if (messageIndex === 0 && !this.lastRenderedMessageDate) {
      this.lastRenderedMessageDate = message.timestamp; // Set for the very first message
    }

    // --- Grouping Logic ---
    let messageGroup: HTMLElement | null = null;
    let groupClass = CSS_CLASS_MESSAGE_GROUP;
    let messageClass = `${CSS_CLASS_MESSAGE} ${CSS_CLASS_MESSAGE_ARRIVING}`;
    let showAvatar = true;
    let isUser = false;
    const isFirstInGroup = !prevMessage || prevMessage.role !== message.role || isNewDay;

    switch (message.role) {
      case "user": groupClass += ` ${CSS_CLASS_USER_GROUP}`; messageClass += ` ${CSS_CLASS_USER_MESSAGE}`; isUser = true; break;
      case "assistant": groupClass += ` ${CSS_CLASS_OLLAMA_GROUP}`; messageClass += ` ${CSS_CLASS_OLLAMA_MESSAGE}`; break;
      case "system": groupClass += ` ${CSS_CLASS_SYSTEM_GROUP}`; messageClass += ` ${CSS_CLASS_SYSTEM_MESSAGE}`; showAvatar = false; break;
      case "error": groupClass += ` ${CSS_CLASS_ERROR_GROUP}`; messageClass += ` ${CSS_CLASS_ERROR_MESSAGE}`; showAvatar = false; break;
    }

    const lastElement = this.chatContainer.lastElementChild as HTMLElement;
    if (isFirstInGroup || !lastElement || !lastElement.matches(`.${groupClass.split(' ')[1]}`)) {
      messageGroup = this.chatContainer.createDiv({ cls: groupClass });
      if (showAvatar) this.renderAvatar(messageGroup, isUser);
    } else {
      messageGroup = lastElement;
    }

    // --- Element Creation ---
    const messageEl = messageGroup.createDiv({ cls: messageClass });
    const contentContainer = messageEl.createDiv({ cls: CSS_CLASS_CONTENT_CONTAINER });
    const contentEl = contentContainer.createDiv({ cls: CSS_CLASS_CONTENT });

    // --- Render Content ---
    switch (message.role) {
      case "assistant":
      case "user":
        contentEl.addClass(CSS_CLASS_CONTENT_COLLAPSIBLE);
        if (message.role === 'assistant') {
          this.renderAssistantContent(contentEl, message.content);
        } else {
          message.content.split("\n").forEach((line, i, arr) => {
            contentEl.appendText(line);
            if (i < arr.length - 1) contentEl.createEl("br");
          });
        }
        break;
      case "system":
        setIcon(contentEl.createSpan({ cls: CSS_CLASS_SYSTEM_ICON }), "info");
        contentEl.createSpan({ cls: CSS_CLASS_SYSTEM_TEXT, text: message.content });
        break;
      case "error":
        setIcon(contentEl.createSpan({ cls: CSS_CLASS_ERROR_ICON }), "alert-triangle");
        contentEl.createSpan({ cls: CSS_CLASS_ERROR_TEXT, text: message.content });
        break;
    }

    // --- Action Buttons ---
    const buttonsWrapper = contentContainer.createDiv({ cls: 'message-actions-wrapper' });
    if (message.role !== "system" && message.role !== "error") {
      const copyBtn = buttonsWrapper.createEl("button", { cls: CSS_CLASS_COPY_BUTTON, attr: { title: "Copy", 'aria-label': "Copy message content" } });
      setIcon(copyBtn, "copy");
      this.registerDomEvent(copyBtn, "click", (e) => { e.stopPropagation(); this.handleCopyClick(message.content, copyBtn); });
    }
    if (this.plugin.settings.enableTranslation && this.plugin.settings.translationTargetLanguage && (message.role === "user" || message.role === "assistant")) {
      const targetLangName = LANGUAGES[this.plugin.settings.translationTargetLanguage] || this.plugin.settings.translationTargetLanguage;
      const translateBtn = buttonsWrapper.createEl("button", { cls: CSS_CLASS_TRANSLATE_BUTTON, attr: { title: `Translate to ${targetLangName}`, 'aria-label': "Translate message" } });
      setIcon(translateBtn, "languages");
      this.registerDomEvent(translateBtn, "click", (e) => { e.stopPropagation(); this.handleTranslateClick(message.content, contentEl, translateBtn); });
    }

    // --- Timestamp ---
    messageEl.createDiv({ cls: CSS_CLASS_TIMESTAMP, text: this.formatTime(message.timestamp) });

    // --- Animation Cleanup ---
    setTimeout(() => messageEl.classList.remove(CSS_CLASS_MESSAGE_ARRIVING), 500);

    return messageEl;
  }

  // --- Action Button Handlers ---
  private handleCopyClick(content: string, buttonEl: HTMLElement): void {
    let textToCopy = content;
    // Decode HTML and remove <think> tags before copying
    if (this.detectThinkingTags(this.decodeHtmlEntities(content)).hasThinkingTags) {
      textToCopy = this.decodeHtmlEntities(content).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }
    navigator.clipboard.writeText(textToCopy).then(() => {
      setIcon(buttonEl, "check"); buttonEl.setAttribute("title", "Copied!");
      setTimeout(() => { setIcon(buttonEl, "copy"); buttonEl.setAttribute("title", "Copy"); }, 2000);
    }).catch(err => {
      console.error("Copy failed:", err); new Notice("Failed to copy text.");
    });
  }
  private async handleTranslateClick(originalContent: string, contentEl: HTMLElement, buttonEl: HTMLButtonElement): Promise<void> {
    const targetLang = this.plugin.settings.translationTargetLanguage;
    const apiKey = this.plugin.settings.googleTranslationApiKey;
    if (!targetLang || !apiKey) {
      new Notice("Translation not configured. Please check language and API key in settings.");
      return;
    }

    let textToTranslate = originalContent;
    if (this.detectThinkingTags(this.decodeHtmlEntities(originalContent)).hasThinkingTags) {
      textToTranslate = this.decodeHtmlEntities(originalContent).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }
    if (!textToTranslate) return; // Nothing to translate

    // Remove previous translation if exists
    contentEl.querySelector(`.${CSS_CLASS_TRANSLATION_CONTAINER}`)?.remove();

    // Set loading state
    setIcon(buttonEl, "loader"); buttonEl.disabled = true;
    buttonEl.classList.add(CSS_CLASS_TRANSLATION_PENDING); buttonEl.setAttribute("title", "Translating...");

    try {
      const translatedText = await this.plugin.translationService.translate(textToTranslate, targetLang);
      if (translatedText !== null) {
        const translationContainer = contentEl.createDiv({ cls: CSS_CLASS_TRANSLATION_CONTAINER });
        translationContainer.createDiv({ cls: CSS_CLASS_TRANSLATION_CONTENT, text: translatedText });
        const targetLangName = LANGUAGES[targetLang] || targetLang;
        translationContainer.createEl('div', { cls: 'translation-indicator', text: `[Translated to ${targetLangName}]` });
        this.guaranteedScrollToBottom(50, false); // Scroll if needed
      } // Error notice shown by service if null
    } catch (error) {
      console.error("Error during translation click handling:", error);
      new Notice("An unexpected error occurred during translation.");
    } finally {
      // Restore button state
      setIcon(buttonEl, "languages"); buttonEl.disabled = false;
      buttonEl.classList.remove(CSS_CLASS_TRANSLATION_PENDING);
      const targetLangName = LANGUAGES[targetLang] || targetLang;
      buttonEl.setAttribute("title", `Translate to ${targetLangName}`);
    }
  }

  // --- Rendering Helpers ---
  private renderAvatar(groupEl: HTMLElement, isUser: boolean): void {
    const settings = this.plugin.settings;
    const avatarType = isUser ? settings.userAvatarType : settings.aiAvatarType;
    const avatarContent = isUser ? settings.userAvatarContent : settings.aiAvatarContent;
    const avatarClass = isUser ? CSS_CLASS_AVATAR_USER : CSS_CLASS_AVATAR_AI;
    const avatarEl = groupEl.createDiv({ cls: `${CSS_CLASS_AVATAR} ${avatarClass}` });

    if (avatarType === 'initials') {
      avatarEl.textContent = avatarContent || (isUser ? 'U' : 'A');
    } else if (avatarType === 'icon') {
      try {
        setIcon(avatarEl, avatarContent || (isUser ? 'user' : 'bot'));
      } catch (e) {
        console.warn(`Failed to set avatar icon "${avatarContent}". Falling back to initials.`, e);
        avatarEl.textContent = isUser ? 'U' : 'A'; // Fallback
      }
    } else {
      avatarEl.textContent = isUser ? 'U' : 'A'; // Default fallback
    }
  }
  private renderDateSeparator(date: Date): void {
    if (!this.chatContainer) return;
    this.chatContainer.createDiv({ cls: CSS_CLASS_DATE_SEPARATOR, text: this.formatDateSeparator(date) });
  }
  private renderAssistantContent(containerEl: HTMLElement, content: string): void {
    // Decode entities first for tag detection and rendering
    const decodedContent = this.decodeHtmlEntities(content);
    const thinkingInfo = this.detectThinkingTags(decodedContent);

    containerEl.empty(); // Clear previous content

    if (thinkingInfo.hasThinkingTags) {
      // Process content with <think> tags
      const processedHtml = this.processThinkingTags(decodedContent);
      containerEl.innerHTML = processedHtml; // Set innerHTML for complex structure
      this.addThinkingToggleListeners(containerEl); // Add listeners for foldouts
      this.addCodeBlockEnhancements(containerEl); // Enhance code blocks within generated HTML
    } else {
      // Render standard Markdown content
      MarkdownRenderer.renderMarkdown(
        decodedContent, // Use decoded content for rendering
        containerEl,
        this.app.vault.getRoot()?.path ?? "", // Source path context
        this // Component context for links etc.
      );
      this.addCodeBlockEnhancements(containerEl); // Enhance standard code blocks
    }
  }
  private addCodeBlockEnhancements(contentEl: HTMLElement): void {
    contentEl.querySelectorAll("pre").forEach(pre => {
      // Prevent adding button multiple times
      if (pre.querySelector(`.${CSS_CLASS_CODE_BLOCK_COPY_BUTTON}`)) return;

      const code = pre.querySelector("code");
      if (!code) return;

      const codeText = code.textContent || "";

      // Add language identifier badge
      const langClass = Array.from(code.classList).find(cls => cls.startsWith("language-"));
      if (langClass) {
        const lang = langClass.replace("language-", "");
        if (lang) {
          // Check if language badge already exists (added robustness)
          if (!pre.querySelector(`.${CSS_CLASS_CODE_BLOCK_LANGUAGE}`)) {
            pre.createEl("span", { cls: CSS_CLASS_CODE_BLOCK_LANGUAGE, text: lang });
          }
        }
      }

      // Add copy button
      const copyBtn = pre.createEl("button", { cls: CSS_CLASS_CODE_BLOCK_COPY_BUTTON });
      setIcon(copyBtn, "copy");
      copyBtn.setAttribute("title", "Copy Code");
      copyBtn.setAttribute("aria-label", "Copy code block"); // Accessibility

      // Use registerDomEvent for reliable cleanup
      this.registerDomEvent(copyBtn, "click", e => {
        e.stopPropagation();
        navigator.clipboard.writeText(codeText).then(() => {
          setIcon(copyBtn, "check"); copyBtn.setAttribute("title", "Copied!");
          setTimeout(() => { setIcon(copyBtn, "copy"); copyBtn.setAttribute("title", "Copy Code"); }, 1500);
        }).catch(err => {
          console.error("Code block copy failed:", err); new Notice("Failed to copy code.");
        });
      });
    });
  }

  // --- Menu List Rendering ---
  private async renderModelList(): Promise<void> { /* ... (Implementation from previous responses) ... */
    if (!this.modelListContainerEl) return;
    this.modelListContainerEl.empty();
    this.modelListContainerEl.createEl("span", { text: "Loading models..." });
    const modelIconMap: Record<string, string> = { 'llama': 'box-minimal', 'mistral': 'wind', 'mixtral': 'blend', 'codellama': 'code', 'code': 'code', 'phi': 'sigma', 'phi3': 'sigma', 'gemma': 'gem', 'command-r': 'terminal', 'llava': 'image', 'star': 'star', 'wizard': 'wand', 'hermes': 'message-circle', 'dolphin': 'anchor', };
    const defaultIcon = 'box';
    try {
      const models = await this.plugin.ollamaService.getModels();
      this.modelListContainerEl.empty();
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      const currentModelName = activeChat?.metadata?.modelName || this.plugin.settings.modelName;
      if (models.length === 0) { this.modelListContainerEl.createEl("span", { text: "No models available." }); return; }
      models.forEach(modelName => {
        const modelOptionEl = this.modelListContainerEl.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MODEL_OPTION}` });
        const iconSpan = modelOptionEl.createEl("span", { cls: "menu-option-icon" });
        let iconToUse = defaultIcon;
        if (modelName === currentModelName) { iconToUse = "check"; modelOptionEl.addClass("is-selected"); }
        else { const lowerModelName = modelName.toLowerCase(); let foundIcon = false; for (const key in modelIconMap) { if (lowerModelName.includes(key)) { iconToUse = modelIconMap[key]; foundIcon = true; break; } } if (!foundIcon) iconToUse = defaultIcon; }
        try { setIcon(iconSpan, iconToUse); } catch (e) { console.warn(`[OllamaView] Could not set icon '${iconToUse}' for model ${modelName}`); iconSpan.style.minWidth = "18px"; }
        modelOptionEl.createEl("span", { cls: "menu-option-text", text: modelName });
        this.registerDomEvent(modelOptionEl, 'click', async () => {
          const currentActiveChatOnClick = await this.plugin.chatManager?.getActiveChat();
          const currentActiveModelOnClick = currentActiveChatOnClick?.metadata?.modelName || this.plugin.settings.modelName;
          if (modelName !== currentActiveModelOnClick) {
            console.log(`[OllamaView] Model selected via menu for active chat: ${modelName}`);
            if (this.plugin.chatManager && currentActiveChatOnClick) {
              await this.plugin.chatManager.updateActiveChatMetadata({ modelName: modelName });
              // Event emission is handled by ChatManager now or handled by separate model-changed event listener
              // this.plugin.emit('model-changed', modelName); // Already handled?
            } else { console.error("[OllamaView] Cannot update model - no active chat found via ChatManager."); new Notice("Error: Could not find active chat to update model."); }
          }
          this.closeMenu();
        });
      });
    } catch (error) { console.error("Error loading models for menu:", error); this.modelListContainerEl.empty(); this.modelListContainerEl.createEl("span", { text: "Error loading models." }); }
  }
  public async renderRoleList(): Promise<void> { /* ... (Implementation from previous responses - includes updating active chat metadata) ... */
    if (!this.roleListContainerEl) return;
    this.roleListContainerEl.empty();
    const loadingEl = this.roleListContainerEl.createEl("span", { text: "Loading roles..." });
    try {
      const roles = await this.plugin.listRoleFiles(false);
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      const currentChatRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath; // Check chat first
      this.roleListContainerEl.empty();
      // No Role option
      const noRoleOptionEl = this.roleListContainerEl.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}` });
      const noRoleIconSpan = noRoleOptionEl.createEl("span", { cls: "menu-option-icon" });
      if (!currentChatRolePath) { setIcon(noRoleIconSpan, "check"); noRoleOptionEl.addClass("is-selected"); }
      else { setIcon(noRoleIconSpan, "slash"); noRoleIconSpan.style.minWidth = "18px"; }
      noRoleOptionEl.createEl("span", { cls: "menu-option-text", text: "None (Default Assistant)" });
      this.registerDomEvent(noRoleOptionEl, 'click', async () => {
        const currentGlobalRolePath = this.plugin.settings.selectedRolePath; const newRolePath = "";
        if (currentGlobalRolePath !== newRolePath || currentChatRolePath !== newRolePath) {
          this.plugin.settings.selectedRolePath = newRolePath; await this.plugin.saveSettings();
          const currentActiveChatOnClick = await this.plugin.chatManager?.getActiveChat();
          if (currentActiveChatOnClick && currentActiveChatOnClick.metadata.selectedRolePath !== newRolePath) {
            console.log(`[OllamaView] Updating active chat (${currentActiveChatOnClick.metadata.id}) role to None`);
            await this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath });
            this.plugin.promptService?.clearRoleCache?.();
          } else if (!currentActiveChatOnClick) { console.warn("[OllamaView] No active chat found to update role metadata for."); }
          this.plugin.emit('role-changed', "Default Assistant");
        }
        this.closeMenu();
      });
      // Role list population
      if (roles.length === 0) { /* Show info text if no roles */ const infoText = this.plugin.settings.userRolesFolderPath ? "No roles found in specified folders." : "No custom roles found. Add path in settings."; this.roleListContainerEl.createEl("span", { cls: "menu-info-text", text: infoText }); }
      else {
        roles.forEach(roleInfo => {
          const roleOptionEl = this.roleListContainerEl.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}` });
          if (roleInfo.isCustom) roleOptionEl.addClass("is-custom");
          const iconSpan = roleOptionEl.createEl("span", { cls: "menu-option-icon" });
          if (roleInfo.path === currentChatRolePath) { setIcon(iconSpan, "check"); roleOptionEl.addClass("is-selected"); }
          else { setIcon(iconSpan, roleInfo.isCustom ? 'user' : 'box'); iconSpan.style.minWidth = "18px"; }
          roleOptionEl.createEl("span", { cls: "menu-option-text", text: roleInfo.name });
          this.registerDomEvent(roleOptionEl, 'click', async () => {
            const currentGlobalRolePath = this.plugin.settings.selectedRolePath; const newRolePath = roleInfo.path;
            if (newRolePath !== currentGlobalRolePath || newRolePath !== currentChatRolePath) {
              console.log(`[OllamaView] Role selected via menu: ${roleInfo.name} (${newRolePath})`);
              this.plugin.settings.selectedRolePath = newRolePath; await this.plugin.saveSettings();
              const currentActiveChatOnClick = await this.plugin.chatManager?.getActiveChat();
              if (currentActiveChatOnClick && currentActiveChatOnClick.metadata.selectedRolePath !== newRolePath) {
                console.log(`[OllamaView] Updating active chat (${currentActiveChatOnClick.metadata.id}) role to ${roleInfo.name}`);
                await this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath });
                this.plugin.promptService?.clearRoleCache?.();
              } else if (!currentActiveChatOnClick) { console.warn("[OllamaView] No active chat found to update role metadata for."); }
              this.plugin.emit('role-changed', roleInfo.name);
            }
            this.closeMenu();
          });
        });
      }
    } catch (error) { console.error("Error loading roles for menu:", error); this.roleListContainerEl.empty(); this.roleListContainerEl.createEl("span", { text: "Error loading roles." }); }
  }
  private async renderChatListMenu(): Promise<void> { /* ... (Implementation from previous responses) ... */
    if (!this.chatListContainerEl) return;
    this.chatListContainerEl.empty();
    const loadingEl = this.chatListContainerEl.createEl("span", { text: "Loading chats..." });
    try {
      const chats = this.plugin.chatManager?.listAvailableChats() || [];
      const currentActiveId = this.plugin.chatManager?.getActiveChatId();
      this.chatListContainerEl.empty();
      if (chats.length === 0) { this.chatListContainerEl.createEl("span", { text: "No saved chats found." }); return; }
      console.log("[OllamaView] Chats available for menu:", JSON.stringify(chats, null, 2)); // ЛОГ ДЛЯ ПЕРЕВІРКИ
      chats.forEach(chatMeta => {
        const chatOptionEl = this.chatListContainerEl.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_CHAT_OPTION}` });
        const iconSpan = chatOptionEl.createEl("span", { cls: "menu-option-icon" });
        if (chatMeta.id === currentActiveId) { setIcon(iconSpan, "check"); chatOptionEl.addClass("is-selected"); }
        else { setIcon(iconSpan, "message-square"); }
        const textSpan = chatOptionEl.createEl("span", { cls: "menu-option-text" });
        textSpan.createEl('div', { cls: 'chat-option-name', text: chatMeta.name });
        const dateText = this.formatRelativeDate(new Date(chatMeta.lastModified));
        textSpan.createEl('div', { cls: 'chat-option-date', text: dateText });
        this.registerDomEvent(chatOptionEl, 'click', async () => {
          if (chatMeta.id !== this.plugin.chatManager?.getActiveChatId()) {
            console.log(`[OllamaView] Switching to chat via menu: ${chatMeta.name} (${chatMeta.id})`);
            await this.plugin.chatManager.setActiveChat(chatMeta.id);
          }
          this.closeMenu();
        });
      });
    } catch (error) { console.error("Error loading chats for menu:", error); this.chatListContainerEl.empty(); this.chatListContainerEl.createEl("span", { text: "Error loading chats." }); }
  }

  // --- Speech Recognition Placeholders ---
  private initSpeechWorker(): void { /* ... same as before ... */
    // Use try-catch for robustness, especially with Blob URLs and Workers
    try {
      // Optimized Base64 encoding helper function
      const bufferToBase64 = (buffer: ArrayBuffer): string => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      };

      // Worker code as a template literal for better readability
      const workerCode = `
          // Worker Scope
          self.onmessage = async (event) => {
            const { apiKey, audioBlob, languageCode = 'uk-UA' } = event.data;

            if (!apiKey || apiKey.trim() === '') {
              self.postMessage({ error: true, message: 'Google API Key is not configured. Please add it in plugin settings.' });
              return;
            }

            const url = "https://speech.googleapis.com/v1/speech:recognize?key=" + apiKey;

            try {
              const arrayBuffer = await audioBlob.arrayBuffer();

              // Optimized Base64 Conversion (using helper if needed, or direct if worker supports TextDecoder efficiently)
              // Simpler approach: pass buffer directly if API allows, or use efficient base64:
              let base64Audio;
              if (typeof TextDecoder !== 'undefined') { // Browser environment check
                   // Modern approach (often faster if native)
                   const base64String = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                   base64Audio = base64String;

              } else {
                   // Fallback (similar to original, ensure correctness)
                   base64Audio = btoa(
                     new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                   );
              }


              const response = await fetch(url, {
                method: 'POST',
                body: JSON.stringify({
                  config: {
                    encoding: 'WEBM_OPUS', // Ensure this matches MediaRecorder output
                    sampleRateHertz: 48000, // Match sample rate if possible
                    languageCode: languageCode,
                    model: 'latest_long', // Consider other models if needed
                    enableAutomaticPunctuation: true,
                  },
                  audio: { content: base64Audio },
                }),
                headers: { 'Content-Type': 'application/json' },
              });

              const responseData = await response.json();

              if (!response.ok) {
                console.error("Google Speech API Error:", responseData);
                self.postMessage({
                  error: true,
                  message: "Error from Google Speech API: " + (responseData.error?.message || response.statusText || 'Unknown error')
                });
                return;
              }

              if (responseData.results && responseData.results.length > 0) {
                const transcript = responseData.results
                  .map(result => result.alternatives[0].transcript)
                  .join(' ')
                  .trim();
                self.postMessage(transcript); // Send back only the transcript string
              } else {
                 // Handle cases where API returns ok but no results (e.g., silence)
                 self.postMessage({ error: true, message: 'No speech detected or recognized.' });
              }
            } catch (error) {
               console.error("Error in speech worker processing:", error);
               self.postMessage({
                 error: true,
                 message: 'Error processing speech recognition: ' + (error instanceof Error ? error.message : String(error))
               });
            }
          };
        `;

      const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);
      this.speechWorker = new Worker(workerUrl);
      URL.revokeObjectURL(workerUrl); // Revoke URL immediately after worker creation

      this.setupSpeechWorkerHandlers(); // Setup message/error handlers
      console.log("Speech worker initialized.");

    } catch (error) {
      console.error("Failed to initialize speech worker:", error);
      new Notice("Speech recognition feature failed to initialize.");
      this.speechWorker = null; // Ensure worker is null if init fails
    }
  }
  private setupSpeechWorkerHandlers(): void { /* ... same as before ... */
    if (!this.speechWorker) return;

    this.speechWorker.onmessage = (event) => {
      const data = event.data;

      // Check for error object from worker
      if (data && typeof data === 'object' && data.error) {
        console.error("Speech recognition error:", data.message);
        new Notice(`Speech Recognition Error: ${data.message}`);
        this.updateInputPlaceholder(this.plugin.settings.modelName); // Reset placeholder on error
        this.updateSendButtonState(); // Update button state as well
        return;
      }

      // Process valid transcript (should be a string)
      if (typeof data === 'string' && data.trim()) {
        const transcript = data.trim();
        this.insertTranscript(transcript);
      } else if (typeof data !== 'string') {
        console.warn("Received unexpected data format from speech worker:", data);
      }
      // If data is an empty string, do nothing (might happen with short silence)
      this.updateSendButtonState(); // Update button state after processing
    };

    this.speechWorker.onerror = (error) => {
      console.error("Unhandled worker error:", error);
      new Notice("An unexpected error occurred in the speech recognition worker.");
      this.updateInputPlaceholder(this.plugin.settings.modelName); // Reset placeholder
      // Attempt to gracefully stop recording if it was active
      this.stopVoiceRecording(false); // This also updates placeholder and button state
    };
  }
  private insertTranscript(transcript: string): void { /* ... same as before ... */
    if (!this.inputEl) return;

    const currentVal = this.inputEl.value;
    const start = this.inputEl.selectionStart ?? currentVal.length; // Use length if null
    const end = this.inputEl.selectionEnd ?? currentVal.length;

    // Add spacing intelligently
    let textToInsert = transcript;
    const precedingChar = start > 0 ? currentVal[start - 1] : null;
    const followingChar = end < currentVal.length ? currentVal[end] : null;

    if (precedingChar && precedingChar !== ' ' && precedingChar !== '\n') {
      textToInsert = ' ' + textToInsert;
    }
    if (followingChar && followingChar !== ' ' && followingChar !== '\n' && !textToInsert.endsWith(' ')) {
      textToInsert += ' ';
    }


    const newValue = currentVal.substring(0, start) + textToInsert + currentVal.substring(end);
    this.inputEl.value = newValue;

    // Update cursor position
    const newCursorPos = start + textToInsert.length;
    this.inputEl.setSelectionRange(newCursorPos, newCursorPos);

    this.inputEl.focus();
    this.inputEl.dispatchEvent(new Event('input')); // Trigger resize calculation AND send button update
  }
  private async toggleVoiceRecognition(): Promise<void> { /* ... same as before ... */
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.stopVoiceRecording(true); // Stop and process
    } else {
      await this.startVoiceRecognition(); // Start new recording
    }
  }
  private async startVoiceRecognition(): Promise<void> { /* ... same as before ... */
    // Перевірка наявності worker'а для розпізнавання
    if (!this.speechWorker) {
      new Notice("Функція розпізнавання мовлення недоступна (worker не ініціалізовано).");
      console.error("Спроба розпочати розпізнавання голосу без ініціалізованого worker'а.");
      return;
    }
    // Перевірка наявності ключа Google API
    if (!this.plugin.settings.googleApiKey) {
      new Notice("Ключ Google API не налаштовано. Будь ласка, додайте його в налаштуваннях плагіна для використання голосового вводу.");
      return;
    }

    // Disable send button while recording? Maybe not necessary.

    try {
      // Запит доступу до мікрофона
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Визначення опцій для MediaRecorder залежно від підтримки mimeType
      let recorderOptions: MediaRecorderOptions | undefined; // Використовуємо конкретний тип або undefined
      const preferredMimeType = 'audio/webm;codecs=opus'; // Бажаний формат

      if (MediaRecorder.isTypeSupported(preferredMimeType)) {
        console.log(`Використовується підтримуваний mimeType: ${preferredMimeType}`);
        recorderOptions = { mimeType: preferredMimeType }; // Призначаємо об'єкт опцій, якщо підтримується
      } else {
        console.warn(`${preferredMimeType} не підтримується, використовується стандартний браузера.`);
        recorderOptions = undefined; // Явно використовуємо undefined для стандартних налаштувань браузера
      }

      // Створення екземпляру MediaRecorder з визначеними опціями
      this.mediaRecorder = new MediaRecorder(this.audioStream, recorderOptions);

      const audioChunks: Blob[] = []; // Масив для зберігання шматків аудіо

      // --- Оновлення UI для стану запису ---
      this.voiceButton?.classList.add(CSS_CLASS_RECORDING); // Додати клас для стилізації
      setIcon(this.voiceButton, "stop-circle"); // Змінити іконку на "стоп"
      this.inputEl.placeholder = "Recording... Speak now."; // Оновити плейсхолдер (English for consistency)

      // --- Налаштування слухачів подій MediaRecorder ---
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) { audioChunks.push(event.data); }
      };
      this.mediaRecorder.onstop = () => {
        console.log("MediaRecorder stopped.");
        if (this.speechWorker && audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          console.log(`Sending audio blob to worker: type=${audioBlob.type}, size=${audioBlob.size}`);
          this.inputEl.placeholder = "Processing speech..."; // Update placeholder
          this.speechWorker.postMessage({
            apiKey: this.plugin.settings.googleApiKey,
            audioBlob,
            languageCode: this.plugin.settings.speechLanguage || 'uk-UA'
          });
        } else if (audioChunks.length === 0) {
          console.log("No audio data recorded.");
          this.updateInputPlaceholder(this.plugin.settings.modelName); // Restore placeholder if nothing was recorded
          this.updateSendButtonState(); // Ensure button state is correct
        }
      };
      this.mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder Error:", event);
        new Notice("An error occurred during recording.");
        this.stopVoiceRecording(false); // Stop without processing on error
      };

      // --- Старт запису ---
      this.mediaRecorder.start();
      console.log("Recording started. MimeType:", this.mediaRecorder?.mimeType ?? 'default');

    } catch (error) {
      console.error("Error accessing microphone or starting recording:", error);
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        new Notice("Microphone access denied. Please grant permission.");
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        new Notice("Microphone not found. Please ensure it's connected and enabled.");
      } else {
        new Notice("Could not start voice recording.");
      }
      this.stopVoiceRecording(false); // Ensure cleanup even if start failed
    }
  }
  private stopVoiceRecording(processAudio: boolean): void { /* ... same as before ... */
    console.log(`Stopping voice recording. Process audio: ${processAudio}`);
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      // onstop handler will be triggered eventually to process if processAudio is true
      this.mediaRecorder.stop();
    } else if (!processAudio && this.mediaRecorder?.state === 'inactive') {
      // If already stopped and asked not to process, just clean up UI/stream
    }

    // UI Cleanup & Resource Release
    this.voiceButton?.classList.remove(CSS_CLASS_RECORDING);
    setIcon(this.voiceButton, "microphone");
    this.updateInputPlaceholder(this.plugin.settings.modelName);
    this.updateSendButtonState(); // Update button state

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
      console.log("Audio stream tracks stopped.");
    }
    this.mediaRecorder = null;
  }



  // --- Thinking Tag Handling ---
  private processThinkingTags(content: string): string { /* ... (Implementation from previous responses) ... */ const r = /<think>([\s\S]*?)<\/think>/g; let i = 0; const p: string[] = []; let m; while ((m = r.exec(content)) !== null) { if (m.index > i) p.push(this.markdownToHtml(content.substring(i, m.index))); const c = m[1]; const h = `<div class="${CSS_CLASS_THINKING_BLOCK}"><div class="${CSS_CLASS_THINKING_HEADER}" data-fold-state="folded"><div class="${CSS_CLASS_THINKING_TOGGLE}">►</div><div class="${CSS_CLASS_THINKING_TITLE}">Thinking</div></div><div class="${CSS_CLASS_THINKING_CONTENT}" style="display: none;">${this.markdownToHtml(c)}</div></div>`; p.push(h); i = r.lastIndex; } if (i < content.length) p.push(this.markdownToHtml(content.substring(i))); return p.join(""); }
  private markdownToHtml(markdown: string): string { /* ... (Implementation from previous responses) ... */ if (!markdown?.trim()) return ""; const d = document.createElement("div"); MarkdownRenderer.renderMarkdown(markdown, d, this.app.workspace.getActiveFile()?.path ?? "", this); return d.innerHTML; }
  private addThinkingToggleListeners(contentEl: HTMLElement): void { /* ... (Implementation from previous responses) ... */ const h = contentEl.querySelectorAll<HTMLElement>(`.${CSS_CLASS_THINKING_HEADER}`); h.forEach(hdr => { this.registerDomEvent(hdr, "click", () => { const c = hdr.nextElementSibling as HTMLElement; const t = hdr.querySelector<HTMLElement>(`.${CSS_CLASS_THINKING_TOGGLE}`); if (!c || !t) return; const f = hdr.getAttribute("data-fold-state") === "folded"; if (f) { c.style.display = "block"; t.textContent = "▼"; hdr.setAttribute("data-fold-state", "expanded"); } else { c.style.display = "none"; t.textContent = "►"; hdr.setAttribute("data-fold-state", "folded"); } }); }); }
  private decodeHtmlEntities(text: string): string { /* ... (Implementation from previous responses) ... */ if (typeof document === 'undefined') { return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); } const ta = document.createElement("textarea"); ta.innerHTML = text; return ta.value; }
  private detectThinkingTags(content: string): { hasThinkingTags: boolean; format: string } { /* ... (Implementation from previous responses) ... */ return /<think>[\s\S]*?<\/think>/gi.test(content) ? { hasThinkingTags: true, format: "standard" } : { hasThinkingTags: false, format: "none" }; }

  // --- Message Collapsing ---
  private checkMessageForCollapsing(messageEl: HTMLElement): void { /* ... (Implementation from previous responses) ... */ const c = messageEl.querySelector<HTMLElement>(`.${CSS_CLASS_CONTENT_COLLAPSIBLE}`); const h = this.plugin.settings.maxMessageHeight; if (!c || h <= 0) return; requestAnimationFrame(() => { const b = messageEl.querySelector(`.${CSS_CLASS_SHOW_MORE_BUTTON}`); b?.remove(); c.style.maxHeight = ''; c.classList.remove(CSS_CLASS_CONTENT_COLLAPSED); const sh = c.scrollHeight; if (sh > h) { c.style.maxHeight = `${h}px`; c.classList.add(CSS_CLASS_CONTENT_COLLAPSED); const smb = messageEl.createEl('button', { cls: CSS_CLASS_SHOW_MORE_BUTTON, text: 'Show More ▼' }); this.registerDomEvent(smb, 'click', () => this.toggleMessageCollapse(c, smb)); } }); }
  private checkAllMessagesForCollapsing(): void { /* ... (Implementation from previous responses) ... */ this.chatContainer?.querySelectorAll<HTMLElement>(`.${CSS_CLASS_MESSAGE}`).forEach(msgEl => { this.checkMessageForCollapsing(msgEl); }); }
  private toggleMessageCollapse(contentEl: HTMLElement, buttonEl: HTMLButtonElement): void { /* ... (Implementation from previous responses) ... */ const i = contentEl.classList.contains(CSS_CLASS_CONTENT_COLLAPSED); const h = this.plugin.settings.maxMessageHeight; if (i) { contentEl.style.maxHeight = ''; contentEl.classList.remove(CSS_CLASS_CONTENT_COLLAPSED); buttonEl.setText('Show Less ▲'); } else { contentEl.style.maxHeight = `${h}px`; contentEl.classList.add(CSS_CLASS_CONTENT_COLLAPSED); buttonEl.setText('Show More ▼'); } }

  // --- Helpers & Utilities ---
  public getChatContainer(): HTMLElement { return this.chatContainer; }
  private clearChatContainerInternal(): void {
    // Clears the visual display area and resets related state
    this.currentMessages = [];
    this.lastRenderedMessageDate = null;
    if (this.chatContainer) this.chatContainer.empty();
    this.hideEmptyState(); // Ensure empty state is managed correctly
  }
  public clearDisplayAndState(): void {
    // Public method to completely clear the view
    this.clearChatContainerInternal();
    this.showEmptyState();
    this.updateSendButtonState();
    setTimeout(() => this.focusInput(), 50); // Refocus after clear
    console.log("[OllamaView] Display and internal state cleared.");
  }
  public addLoadingIndicator(): HTMLElement {
    // Adds the visual "thinking" dots indicator
    this.hideEmptyState();
    const group = this.chatContainer.createDiv({ cls: `${CSS_CLASS_MESSAGE_GROUP} ${CSS_CLASS_OLLAMA_GROUP}` });
    this.renderAvatar(group, false); // Render AI avatar
    const message = group.createDiv({ cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_OLLAMA_MESSAGE}` });
    const dots = message.createDiv({ cls: CSS_CLASS_THINKING_DOTS });
    for (let i = 0; i < 3; i++) dots.createDiv({ cls: CSS_CLASS_THINKING_DOT });
    this.guaranteedScrollToBottom(50, true); // Scroll to show it
    return group; // Return the group element containing the indicator
  }
  public removeLoadingIndicator(loadingEl: HTMLElement | null): void {
    // Removes the loading indicator element
    if (loadingEl?.parentNode) {
      loadingEl.remove();
    }
  }
  public scrollToBottom(): void { this.guaranteedScrollToBottom(50, true); }
  public clearInputField(): void { if (this.inputEl) { this.inputEl.value = ""; this.inputEl.dispatchEvent(new Event('input')); } } // Trigger resize/button update
  public focusInput(): void { setTimeout(() => { this.inputEl?.focus(); }, 0); } // Use setTimeout to ensure focus happens after potential UI updates

  /** Guarantees scroll to bottom after a delay, respecting user scroll position unless forced */
  guaranteedScrollToBottom(delay = 50, forceScroll = false): void {
    if (this.scrollTimeout) { clearTimeout(this.scrollTimeout); this.scrollTimeout = null; }
    this.scrollTimeout = setTimeout(() => {
      requestAnimationFrame(() => { // Use rAF for smooth browser rendering
        if (this.chatContainer) {
          const threshold = 100; // Threshold to consider "scrolled up"
          const isScrolledUp = this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight > threshold;

          // Update userScrolledUp state if it changed
          if (isScrolledUp !== this.userScrolledUp) {
            this.userScrolledUp = isScrolledUp;
            // Hide indicator immediately if user scrolls down manually
            if (!isScrolledUp) this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
          }

          // Scroll if forced, or if user is not scrolled up, or if AI is processing
          if (forceScroll || !this.userScrolledUp || this.isProcessing) {
            // Use smooth scrolling for a better UX unless processing (instant scroll better then)
            const behavior = this.isProcessing ? 'auto' : 'smooth';
            this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: behavior });
            // If we force scroll, assume user is now at bottom
            if (forceScroll) {
              this.userScrolledUp = false;
              this.newMessagesIndicatorEl?.classList.remove(CSS_CLASS_VISIBLE);
            }
          }
        } else {
          console.warn("[OllamaView] guaranteedScrollToBottom: chatContainer not found.");
        }
      });
      this.scrollTimeout = null;
    }, delay);
  }

  // Formatting Helpers
  formatTime(date: Date): string { return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } // Use locale default time format
  formatDateSeparator(date: Date): string {
    const now = new Date(); const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (this.isSameDay(date, now)) return "Today";
    else if (this.isSameDay(date, yesterday)) return "Yesterday";
    else return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); // Locale default full date
  }
  formatRelativeDate(date: Date): string {
    const now = new Date();
    const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
    const diffDays = Math.floor(diffSeconds / (60 * 60 * 24));
    if (diffDays === 0) {
      const diffHours = Math.floor(diffSeconds / (60 * 60));
      if (diffHours < 1) return "Just now";
      if (diffHours === 1) return "1 hour ago";
      if (diffHours < now.getHours()) return `${diffHours} hours ago`;
      else return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); // e.g., Apr 4
    }
  }
  isSameDay(date1: Date, date2: Date): boolean { return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate(); }

  /** Sets the loading state for the UI (disables/enables input elements) */
  public setLoadingState(isLoading: boolean): void {
    this.isProcessing = isLoading;
    if (this.inputEl) this.inputEl.disabled = isLoading;
    this.updateSendButtonState(); // Send button depends on both text and processing state
    if (this.voiceButton) { this.voiceButton.disabled = isLoading; this.voiceButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); }
    if (this.translateInputButton) { this.translateInputButton.disabled = isLoading; this.translateInputButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); }
    if (this.menuButton) { this.menuButton.disabled = isLoading; this.menuButton.classList.toggle(CSS_CLASS_DISABLED, isLoading); }
  }

  // Formatting function used by export
  private formatChatToMarkdown(messagesToFormat: Message[]): string {
    let localLastDate: Date | null = null;
    const exportTimestamp = new Date();
    let markdown = `# Ollama Chat Export\n` +
      `> Exported on: ${exportTimestamp.toLocaleString(undefined)}\n\n`; // Use locale default date/time

    messagesToFormat.forEach(message => {
      if (localLastDate === null || !this.isSameDay(localLastDate, message.timestamp)) {
        if (localLastDate !== null) markdown += `***\n`; // Separator between days
        markdown += `**${this.formatDateSeparator(message.timestamp)}**\n***\n\n`;
      }
      localLastDate = message.timestamp;

      const time = this.formatTime(message.timestamp);
      let prefix = "";
      let contentPrefix = "";
      switch (message.role) {
        case 'user': prefix = `**User (${time}):**\n`; break;
        case 'assistant': prefix = `**Assistant (${time}):**\n`; break;
        case 'system': prefix = `> _[System (${time})]_ \n> `; contentPrefix = "> "; break; // Quote block
        case 'error': prefix = `> [!ERROR] Error (${time}):\n> `; contentPrefix = "> "; break; // Admonition block
      }
      markdown += prefix;
      let content = message.content.trim();
      if (contentPrefix) {
        markdown += content.split('\n').join(`\n${contentPrefix}`) + "\n\n"; // Add prefix to each line
      } else if (content.includes('```')) {
        // Ensure blank lines around code blocks for proper rendering
        content = content.replace(/(\n*)```/g, "\n\n```").replace(/```(\n*)/g, "```\n\n");
        markdown += content.trim() + "\n\n";
      } else {
        markdown += content + "\n\n";
      }
    });
    return markdown.trim();
  }

  private handleRenameChatClick = async (): Promise<void> => {
    this.closeMenu();
    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat) {
      new Notice("No active chat to rename.");
      return;
    }
    const currentName = activeChat.metadata.name;
    const newName = prompt(`Enter new name for "${currentName}":`, currentName);

    if (newName && newName.trim() !== "" && newName.trim() !== currentName) {
      console.log(`[OllamaView] Renaming chat ${activeChat.metadata.id} to "${newName.trim()}"`);
      const success = await this.plugin.chatManager.renameChat(activeChat.metadata.id, newName.trim());
      if (success) {
        new Notice(`Chat renamed to "${newName.trim()}"`);
        // Оновлення списку чатів у меню відбудеться при наступному відкритті або через подію chat-list-updated
      } else {
        new Notice("Failed to rename chat.");
      }
    } else if (newName !== null) { // prompt не був скасований
      new Notice("Rename cancelled or name unchanged.");
    }
  }

  private handleDeleteChatClick = async (): Promise<void> => {
    this.closeMenu();
    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat) {
      new Notice("No active chat to delete.");
      return;
    }
    const chatName = activeChat.metadata.name;
    if (confirm(`Delete chat "${chatName}"?\nThis action cannot be undone.`)) {
      console.log(`[OllamaView] Deleting chat ${activeChat.metadata.id} ("${chatName}")`);
      const success = await this.plugin.chatManager.deleteChat(activeChat.metadata.id);
      if (success) {
        new Notice(`Chat "${chatName}" deleted.`);
        // Активний чат зміниться автоматично всередині deleteChat,
        // View оновить себе через подію 'active-chat-changed'.
      } else {
        new Notice(`Failed to delete chat "${chatName}".`);
      }
    } else {
      new Notice("Deletion cancelled.");
    }
  }

  private handleCloneChatClick = async (): Promise<void> => {
    this.closeMenu();
    const activeChat = await this.plugin.chatManager?.getActiveChat();
    if (!activeChat) {
      new Notice("No active chat to clone.");
      return;
    }
    const originalName = activeChat.metadata.name;
    console.log(`[OllamaView] Cloning chat ${activeChat.metadata.id} ("${originalName}")`);
    const cloningNotice = new Notice("Cloning chat...", 0); // Повідомлення без автозникання

    try {
      // Викликаємо новий метод в ChatManager
      const clonedChat = await this.plugin.chatManager.cloneChat(activeChat.metadata.id);

      if (clonedChat) {
        cloningNotice.hide(); // Ховаємо повідомлення про клонування
        new Notice(`Chat cloned as "${clonedChat.metadata.name}" and activated.`);
        // View оновить себе через подію 'active-chat-changed',
        // яку викличе setActiveChat всередині cloneChat.
      } else {
        cloningNotice.hide();
        new Notice("Failed to clone chat.");
      }
    } catch (error) {
      cloningNotice.hide();
      console.error("Error cloning chat:", error);
      new Notice("An error occurred while cloning the chat.");
    }
  }

} // END OF OllamaView CLASS