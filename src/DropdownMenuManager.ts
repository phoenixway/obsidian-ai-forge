// DropdownMenuManager.ts
import { App, setIcon, Notice, Menu, TFolder, normalizePath } from "obsidian";
import OllamaPlugin from "./main";
import { OllamaView } from "./OllamaView";
import { RoleInfo } from "./ChatManager";
import { ChatMetadata } from "./Chat";
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import { CSS_CLASSES } from "./constants"; // Import CSS_CLASSES

// --- CSS Classes (скопійовано з OllamaView для локального використання) ---
const CSS_CLASS_MENU_DROPDOWN = "menu-dropdown";
const CSS_CLASS_MENU_OPTION = "menu-option";
const CSS_CLASS_MENU_HEADER_ITEM = "menu-header-item";
const CSS_CLASS_SUBMENU_ICON = "submenu-icon";
const CSS_CLASS_SUBMENU_CONTENT = "submenu-content";
const CSS_CLASS_SETTINGS_OPTION = "settings-option";
const CSS_CLASS_MENU_SEPARATOR = "menu-separator";
const CSS_CLASS_CLEAR_CHAT_OPTION = "clear-chat-option";
const CSS_CLASS_EXPORT_CHAT_OPTION = "export-chat-option";
const CSS_CLASS_MODEL_OPTION = "model-option";
const CSS_CLASS_MODEL_LIST_CONTAINER = "model-list-container";
const CSS_CLASS_ROLE_OPTION = "role-option";
const CSS_CLASS_ROLE_LIST_CONTAINER = "role-list-container";
const CSS_CLASS_CHAT_OPTION = "chat-option";
const CSS_CLASS_CHAT_LIST_CONTAINER = "chat-list-container";
const CSS_CLASS_CHAT_LIST_SCROLLABLE = "chat-list-scrollable";
const CSS_CLASS_MENU_HEADER = "menu-header";
const CSS_CLASS_NEW_CHAT_OPTION = "new-chat-option";
const CSS_CLASS_RENAME_CHAT_OPTION = "rename-chat-option";
const CSS_CLASS_DELETE_CHAT_OPTION = "delete-chat-option";
const CSS_CLASS_CLONE_CHAT_OPTION = "clone-chat-option";
const CSS_CLASS_TOGGLE_VIEW_LOCATION = "toggle-view-location-option";
const CSS_CLASS_CHAT_LIST_ITEM = "ollama-chat-list-item"; // Додано

const CHAT_LIST_MAX_HEIGHT = "250px"; // Додано

export class DropdownMenuManager {
  private plugin: OllamaPlugin;
  private app: App;
  private view: OllamaView; // Reference back to the view to call its handlers
  private parentElement: HTMLElement; // The container where the dropdown is appended (inputContainer)

  // --- UI Elements ---
  private menuDropdown!: HTMLElement;
  private modelSubmenuHeader!: HTMLElement;
  private modelSubmenuContent!: HTMLElement;
  private roleSubmenuHeader!: HTMLElement;
  private roleSubmenuContent!: HTMLElement;
  private chatSubmenuHeader!: HTMLElement;
  private chatSubmenuContent!: HTMLElement;
  private newChatOption!: HTMLElement;
  private renameChatOption!: HTMLElement;
  private cloneChatOption!: HTMLElement;
  private clearChatOption!: HTMLElement;
  private exportChatOption!: HTMLElement;
  private deleteChatOption!: HTMLElement;
  private settingsOption!: HTMLElement;
  private toggleViewLocationOption!: HTMLElement;

  // --- Event Listener References for explicit removal ---
  private listeners: { element: HTMLElement | Document; type: string; handler: (e: any) => void }[] = [];

  constructor(plugin: OllamaPlugin, app: App, view: OllamaView, parentElement: HTMLElement) {
    this.plugin = plugin;
    this.app = app;
    this.view = view;
    this.parentElement = parentElement;
  }

  public createMenuUI(): void {
    this.plugin.logger.debug("[DropdownMenuManager] Creating menu UI...");
    this.menuDropdown = this.parentElement.createEl("div", { cls: [CSS_CLASS_MENU_DROPDOWN, "ollama-chat-menu"] });
    this.menuDropdown.style.display = "none";

    // Model Section
    const modelSection = this.createSubmenuSection(
      "Select Model",
      "list-collapse",
      CSS_CLASS_MODEL_LIST_CONTAINER,
      "model-submenu-section"
    );
    this.modelSubmenuHeader = modelSection.header;
    this.modelSubmenuContent = modelSection.content;

    // Role Section
    const roleDropdownSection = this.createSubmenuSection(
      "Select Role",
      "users",
      CSS_CLASS_ROLE_LIST_CONTAINER,
      "role-submenu-section"
    );
    this.roleSubmenuHeader = roleDropdownSection.header;
    this.roleSubmenuContent = roleDropdownSection.content;

    // Chat Section
    const chatDropdownSection = this.createSubmenuSection(
      "Load Chat",
      "messages-square",
      CSS_CLASS_CHAT_LIST_CONTAINER
    );
    this.chatSubmenuHeader = chatDropdownSection.header;
    this.chatSubmenuContent = chatDropdownSection.content;

    // Separator and Actions Header
    this.menuDropdown.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });
    this.menuDropdown.createEl("div", { text: "Actions", cls: CSS_CLASS_MENU_HEADER });

    // New Chat
    this.newChatOption = this.createActionItem("plus-circle", "New Chat", CSS_CLASS_NEW_CHAT_OPTION);
    // Rename Chat
    this.renameChatOption = this.createActionItem("pencil", "Rename Chat", CSS_CLASS_RENAME_CHAT_OPTION);
    // Clone Chat
    this.cloneChatOption = this.createActionItem("copy-plus", "Clone Chat", CSS_CLASS_CLONE_CHAT_OPTION);
    // Export Chat
    this.exportChatOption = this.createActionItem("download", "Export Chat to Note", CSS_CLASS_EXPORT_CHAT_OPTION);

    // Separator
    this.menuDropdown.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });

    // Clear Messages
    this.clearChatOption = this.createActionItem("trash", "Clear Messages", [
      CSS_CLASS_CLEAR_CHAT_OPTION,
      CSS_CLASSES.DANGER_OPTION,
    ]);
    // Delete Chat
    this.deleteChatOption = this.createActionItem("trash-2", "Delete Chat", [
      CSS_CLASS_DELETE_CHAT_OPTION,
      CSS_CLASSES.DANGER_OPTION,
    ]);

    // Separator
    this.menuDropdown.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });

    // Toggle View Location
    this.toggleViewLocationOption = this.menuDropdown.createEl("div", {
      cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_TOGGLE_VIEW_LOCATION}`,
    });
    this.updateToggleViewLocationOption(); // Initial setup

    // Separator
    this.menuDropdown.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });

    // Settings
    this.settingsOption = this.createActionItem("settings", "Settings", CSS_CLASS_SETTINGS_OPTION);

    this.plugin.logger.debug("[DropdownMenuManager] Menu UI created.");
  }

  private createActionItem(icon: string, text: string, cssClass: string | string[]): HTMLElement {
    const itemEl = this.menuDropdown.createEl("div", {
      cls: Array.isArray(cssClass) ? [CSS_CLASS_MENU_OPTION, ...cssClass] : [CSS_CLASS_MENU_OPTION, cssClass],
    });
    setIcon(itemEl.createSpan({ cls: "menu-option-icon" }), icon);
    itemEl.createSpan({ cls: "menu-option-text", text: text });
    return itemEl;
  }

  // Need to add event listeners
  public attachEventListeners(): void {
    this.plugin.logger.debug("[DropdownMenuManager] Attaching event listeners...");
    // --- Null Checks ---
    if (!this.modelSubmenuHeader || !this.modelSubmenuContent)
      console.error("DropdownMenuManager: Model submenu elements missing!");
    if (!this.roleSubmenuHeader || !this.roleSubmenuContent)
      console.error("DropdownMenuManager: Role submenu elements missing!");
    if (!this.chatSubmenuHeader || !this.chatSubmenuContent)
      console.error("DropdownMenuManager: Chat submenu elements missing!");
    if (!this.newChatOption) console.error("DropdownMenuManager: newChatOption missing!");
    if (!this.renameChatOption) console.error("DropdownMenuManager: renameChatOption missing!");
    if (!this.cloneChatOption) console.error("DropdownMenuManager: cloneChatOption missing!");
    if (!this.exportChatOption) console.error("DropdownMenuManager: exportChatOption missing!");
    if (!this.clearChatOption) console.error("DropdownMenuManager: clearChatOption missing!");
    if (!this.deleteChatOption) console.error("DropdownMenuManager: deleteChatOption missing!");
    if (!this.toggleViewLocationOption) console.error("DropdownMenuManager: toggleViewLocationOption missing!");
    if (!this.settingsOption) console.error("DropdownMenuManager: settingsOption missing!");
    // --- End Null Checks ---

    this.registerListener(this.modelSubmenuHeader, "click", () =>
      this.toggleSubmenu(this.modelSubmenuHeader, this.modelSubmenuContent, "models")
    );
    this.registerListener(this.roleSubmenuHeader, "click", () =>
      this.toggleSubmenu(this.roleSubmenuHeader, this.roleSubmenuContent, "roles")
    );
    this.registerListener(this.chatSubmenuHeader, "click", () =>
      this.toggleSubmenu(this.chatSubmenuHeader, this.chatSubmenuContent, "chats")
    );

    // Action items call back to the view's handlers
    this.registerListener(this.newChatOption, "click", this.view.handleNewChatClick);
    this.registerListener(this.renameChatOption, "click", () => this.view.handleRenameChatClick()); // Needs arrow function if method expects specific `this`
    this.registerListener(this.cloneChatOption, "click", this.view.handleCloneChatClick);
    this.registerListener(this.exportChatOption, "click", this.view.handleExportChatClick);
    this.registerListener(this.clearChatOption, "click", this.view.handleClearChatClick);
    this.registerListener(this.deleteChatOption, "click", this.view.handleDeleteChatClick);
    this.registerListener(this.toggleViewLocationOption, "click", this.view.handleToggleViewLocationClick); // Assumes handler is arrow function or bound
    this.registerListener(this.settingsOption, "click", this.view.handleSettingsClick);

    // Document click listener for closing the menu remains in OllamaView as it relates to the view's focus/blur context

    this.plugin.logger.debug("[DropdownMenuManager] Event listeners attached.");
  }

  // Helper to register listener and keep track for removal
  private registerListener(element: HTMLElement | Document, type: string, handler: (e: any) => void) {
    // Bind handler to `this` context of the *view* if it's a view method being called back
    // For handlers internal to this manager, `this` should already be correct if they are arrow functions or bound.
    // We assume view handlers are correctly bound (e.g., arrow functions in the view).
    const boundHandler = handler.bind(this.view); // Bind action handlers to the view instance
    element.addEventListener(type, boundHandler);
    this.listeners.push({ element, type, handler: boundHandler });
  }

  public destroy(): void {
    this.plugin.logger.debug("[DropdownMenuManager] Destroying listeners...");
    // Remove all registered listeners
    this.listeners.forEach(({ element, type, handler }) => {
      element.removeEventListener(type, handler);
    });
    this.listeners = []; // Clear the array
    this.plugin.logger.debug("[DropdownMenuManager] Listeners destroyed.");
  }

  // --- Menu Visibility and State ---

  public isMenuOpen(): boolean {
    return !!this.menuDropdown && this.menuDropdown.style.display === "block";
  }

  public toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.menuDropdown) {
      console.error("[DropdownMenuManager] menuDropdown missing!");
      return;
    }
    const isHidden = this.menuDropdown.style.display === "none";
    if (isHidden) {
      this.plugin.logger.debug("[DropdownMenuManager] Opening menu.");
      this.menuDropdown.style.display = "block";
      this.collapseAllSubmenus(null); // Collapse all when opening main menu
    } else {
      this.plugin.logger.debug("[DropdownMenuManager] Closing menu via toggle.");
      this.closeMenu();
    }
  }

  public closeMenu(): void {
    if (this.menuDropdown) {
      this.plugin.logger.debug("[DropdownMenuManager] Closing menu.");
      this.menuDropdown.style.display = "none";
      this.collapseAllSubmenus(null);
    }
  }

  // Handles clicks outside the menu - Called by OllamaView's document click listener
  public handleDocumentClick(event: MouseEvent, menuButton: HTMLElement | null): void {
    if (
      this.isMenuOpen() &&
      !menuButton?.contains(event.target as Node) &&
      !this.menuDropdown?.contains(event.target as Node)
    ) {
      this.plugin.logger.debug("[DropdownMenuManager] Closing menu due to outside click.");
      this.closeMenu();
    }
  }

  // --- Submenu Logic ---

  // Copied directly from OllamaView, ensure `this` refers to DropdownMenuManager instance
  private createSubmenuSection = (
    title: string,
    icon: string,
    listContainerClass: string,
    sectionClass?: string
  ): { header: HTMLElement; content: HTMLElement; section: HTMLElement } => {
    const section = this.menuDropdown.createDiv();
    if (sectionClass) section.addClass(sectionClass);
    const header = section.createDiv({
      cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MENU_HEADER_ITEM}`,
    });
    setIcon(header.createSpan({ cls: "menu-option-icon" }), icon);
    header.createSpan({ cls: "menu-option-text", text: title });
    setIcon(header.createSpan({ cls: CSS_CLASS_SUBMENU_ICON }), "chevron-right");
    const isChatList = listContainerClass === CSS_CLASS_CHAT_LIST_CONTAINER;
    const content = section.createDiv({
      cls: `${CSS_CLASS_SUBMENU_CONTENT} ${CSS_CLASSES.SUBMENU_CONTENT_HIDDEN} ${listContainerClass} ${
        isChatList ? CSS_CLASS_CHAT_LIST_SCROLLABLE : ""
      }`,
    });
    content.style.maxHeight = "0";
    content.style.overflow = "hidden";
    content.style.transition = "max-height 0.3s ease-out, padding 0.3s ease-out";
    content.style.paddingTop = "0";
    content.style.paddingBottom = "0";
    return { header, content, section };
  };

  // Copied directly from OllamaView, ensure `this` refers to DropdownMenuManager instance
  private async toggleSubmenu(
    headerEl: HTMLElement | null,
    contentEl: HTMLElement | null,
    type: "models" | "roles" | "chats"
  ): Promise<void> {
    if (!headerEl || !contentEl) return;
    const iconEl = headerEl.querySelector(`.${CSS_CLASS_SUBMENU_ICON}`);
    const isHidden =
      contentEl.style.maxHeight === "0px" || contentEl.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);

    if (isHidden) {
      this.collapseAllSubmenus(contentEl); // Collapse others before expanding
    }

    if (isHidden) {
      // --- Expand ---
      if (iconEl instanceof HTMLElement) setIcon(iconEl, "chevron-down");
      contentEl.empty();
      contentEl.createDiv({
        cls: "menu-loading",
        text: `Loading ${type}...`,
      });
      contentEl.classList.remove(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
      contentEl.style.maxHeight = "40px"; // Temp height for loading indicator
      contentEl.style.paddingTop = "5px";
      contentEl.style.paddingBottom = "5px";
      contentEl.style.overflowY = "hidden"; // Reset overflow while loading

      try {
        this.plugin.logger.debug(`[DropdownMenuManager] Toggling submenu open: ${type}`);
        switch (type) {
          case "models":
            await this.renderModelList();
            break;
          case "roles":
            await this.renderRoleList();
            break;
          case "chats":
            await this.renderChatListMenu();
            break;
        }

        // After rendering, calculate required height
        requestAnimationFrame(() => {
          if (!contentEl.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
            this.plugin.logger.trace(`[DropdownMenuManager] Setting submenu height for ${type}`);
            if (type === "chats") {
              contentEl.style.maxHeight = CHAT_LIST_MAX_HEIGHT;
              contentEl.style.overflowY = "auto"; // Enable scroll for chat list
            } else {
              contentEl.style.maxHeight = contentEl.scrollHeight + "px";
              contentEl.style.overflowY = "hidden"; // No scroll needed
            }
          }
        });
      } catch (error) {
        this.plugin.logger.error(`[DropdownMenuManager] Error rendering ${type} list:`, error);
        contentEl.empty();
        contentEl.createDiv({
          cls: "menu-error-text",
          text: `Error loading ${type}.`,
        });
        contentEl.style.maxHeight = "50px"; // Height for error message
        contentEl.style.overflowY = "hidden";
      }
    } else {
      // --- Collapse ---
      this.plugin.logger.debug(`[DropdownMenuManager] Toggling submenu closed: ${type}`);
      contentEl.classList.add(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
      contentEl.style.maxHeight = "0";
      contentEl.style.paddingTop = "0";
      contentEl.style.paddingBottom = "0";
      contentEl.style.overflowY = "hidden"; // Hide scroll on collapse
      if (iconEl instanceof HTMLElement) setIcon(iconEl, "chevron-right");
    }
  }

  // Copied directly from OllamaView, ensure `this` refers to DropdownMenuManager instance
  private collapseAllSubmenus(exceptContent?: HTMLElement | null): void {
    const submenus = [
      { header: this.modelSubmenuHeader, content: this.modelSubmenuContent },
      { header: this.roleSubmenuHeader, content: this.roleSubmenuContent },
      { header: this.chatSubmenuHeader, content: this.chatSubmenuContent },
    ];
    submenus.forEach(submenu => {
      if (submenu.content && submenu.header && submenu.content !== exceptContent) {
        if (!submenu.content.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
          this.plugin.logger.trace(`[DropdownMenuManager] Collapsing submenu.`);
          submenu.content.classList.add(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN);
          submenu.content.style.maxHeight = "0";
          submenu.content.style.paddingTop = "0";
          submenu.content.style.paddingBottom = "0";
          submenu.content.style.overflowY = "hidden";
          const iconEl = submenu.header.querySelector(`.${CSS_CLASS_SUBMENU_ICON}`);
          if (iconEl instanceof HTMLElement) {
            setIcon(iconEl, "chevron-right");
          }
        }
      }
    });
  }

  // --- List Rendering / Update ---

  // Copied and adapted from OllamaView
  public async renderModelList(): Promise<void> {
    const container = this.modelSubmenuContent;
    if (!container) return;
    this.plugin.logger.debug("[DropdownMenuManager] Rendering model list...");
    container.empty();
    const modelIconMap: Record<string, string> = { llama: "box-minimal", mistral: "wind" };
    const defaultIcon = "box";
    try {
      const models = await this.plugin.ollamaService.getModels();
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      const currentModelName = activeChat?.metadata?.modelName || this.plugin.settings.modelName;

      if (models.length === 0) {
        container.createEl("div", { cls: "menu-info-text", text: "No models." });
        return;
      }

      models.forEach(modelName => {
        const optionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_MODEL_OPTION}` });
        const iconSpan = optionEl.createEl("span", { cls: "menu-option-icon" });
        let iconToUse = defaultIcon;
        if (modelName === currentModelName) {
          iconToUse = "check";
          optionEl.addClass("is-selected");
        } else {
          const l = modelName.toLowerCase();
          let f = false;
          for (const k in modelIconMap) {
            if (l.includes(k)) {
              iconToUse = modelIconMap[k];
              f = true;
              break;
            }
          }
          if (!f) iconToUse = defaultIcon;
        }
        try {
          setIcon(iconSpan, iconToUse);
        } catch (e) {
          iconSpan.style.minWidth = "18px";
        }

        optionEl.createEl("span", { cls: "menu-option-text", text: modelName });

        // Click handler now uses plugin.chatManager directly
        this.registerListener(optionEl, "click", async () => {
          this.plugin.logger.debug(`[DropdownMenuManager] Model selected: ${modelName}`);
          const latestChat = await this.plugin.chatManager?.getActiveChat(); // Re-fetch latest state
          const latestModel = latestChat?.metadata?.modelName || this.plugin.settings.modelName;
          if (modelName !== latestModel) {
            if (latestChat) {
              await this.plugin.chatManager.updateActiveChatMetadata({ modelName: modelName });
            } else {
              new Notice("Cannot set model: No active chat."); // Keep Notice
            }
          }
          this.closeMenu(); // Close menu after selection
        });
      });
      // No need to call updateSubmenuHeight here, toggleSubmenu handles it
    } catch (error) {
      this.plugin.logger.error("[DropdownMenuManager] Error rendering model list:", error);
      container.empty();
      container.createEl("div", { cls: "menu-error-text", text: "Error loading models." });
      // No need to call updateSubmenuHeight here, toggleSubmenu handles it
    }
  }

  // Copied and adapted from OllamaView
  public async renderRoleList(): Promise<void> {
    const container = this.roleSubmenuContent;
    if (!container) return;
    this.plugin.logger.debug("[DropdownMenuManager] Rendering role list...");
    container.empty();
    try {
      const roles = await this.plugin.listRoleFiles(true);
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      const currentChatRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;

      // "None" option
      const noRoleOptionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}` });
      const noRoleIconSpan = noRoleOptionEl.createEl("span", { cls: "menu-option-icon" });
      if (!currentChatRolePath) {
        setIcon(noRoleIconSpan, "check");
        noRoleOptionEl.addClass("is-selected");
      } else {
        setIcon(noRoleIconSpan, "slash");
        noRoleIconSpan.style.minWidth = "18px";
      }
      noRoleOptionEl.createEl("span", { cls: "menu-option-text", text: "None" });

      this.registerListener(noRoleOptionEl, "click", async () => {
        this.plugin.logger.debug(`[DropdownMenuManager] Role selected: None`);
        const newRolePath = "";
        const latestChat = await this.plugin.chatManager?.getActiveChat(); // Re-fetch
        const latestRolePath = latestChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;

        if (latestRolePath !== newRolePath) {
          this.plugin.logger.trace(`Current path '${latestRolePath}', new path '${newRolePath}'`);
          if (latestChat) {
            await this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath });
          } else {
            this.plugin.settings.selectedRolePath = newRolePath;
            await this.plugin.saveSettings();
            this.plugin.emit("role-changed", "None"); // Explicitly emit if no chat
            this.plugin.promptService?.clearRoleCache?.();
          }
        }
        this.closeMenu();
      });

      if (roles.length > 0) container.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });

      // Role options
      roles.forEach(roleInfo => {
        const roleOptionEl = container.createDiv({ cls: `${CSS_CLASS_MENU_OPTION} ${CSS_CLASS_ROLE_OPTION}` });
        if (roleInfo.isCustom) roleOptionEl.addClass("is-custom");
        const iconSpan = roleOptionEl.createEl("span", { cls: "menu-option-icon" });
        if (roleInfo.path === currentChatRolePath) {
          setIcon(iconSpan, "check");
          roleOptionEl.addClass("is-selected");
        } else {
          setIcon(iconSpan, roleInfo.isCustom ? "user" : "box");
          iconSpan.style.minWidth = "18px";
        }
        roleOptionEl.createEl("span", { cls: "menu-option-text", text: roleInfo.name });

        this.registerListener(roleOptionEl, "click", async () => {
          this.plugin.logger.debug(`[DropdownMenuManager] Role selected: ${roleInfo.name} (${roleInfo.path})`);
          const newRolePath = roleInfo.path;
          const latestChat = await this.plugin.chatManager?.getActiveChat(); // Re-fetch
          const latestRolePath = latestChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;

          if (latestRolePath !== newRolePath) {
            this.plugin.logger.trace(`Current path '${latestRolePath}', new path '${newRolePath}'`);
            if (latestChat) {
              await this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath });
            } else {
              this.plugin.settings.selectedRolePath = newRolePath;
              await this.plugin.saveSettings();
              this.plugin.emit("role-changed", roleInfo.name); // Explicitly emit if no chat
              this.plugin.promptService?.clearRoleCache?.();
            }
          }
          this.closeMenu();
        });
      });
      // No need to call updateSubmenuHeight here, toggleSubmenu handles it
    } catch (error) {
      this.plugin.logger.error("[DropdownMenuManager] Error rendering role list:", error);
      container.empty();
      container.createEl("div", { cls: "menu-error-text", text: "Error loading roles." });
      // No need to call updateSubmenuHeight here, toggleSubmenu handles it
    }
  }

  // Copied and adapted from OllamaView
  public async renderChatListMenu(): Promise<void> {
    const container = this.chatSubmenuContent;
    if (!container) {
      this.plugin.logger.warn("[DropdownMenuManager] Chat submenu container not found!");
      return;
    }
    this.plugin.logger.debug("[DropdownMenuManager] Rendering chat list...");
    container.empty();
    try {
      const chats = this.plugin.chatManager?.listAvailableChats() || [];
      const currentActiveId = this.plugin.chatManager?.getActiveChatId();

      if (chats.length === 0) {
        container.createEl("div", { cls: "menu-info-text", text: "No saved chats." });
        this.plugin.logger.debug("[DropdownMenuManager] Rendered 'No saved chats.' message.");
        // No need to update height manually
        return;
      }

      this.plugin.logger.debug(`[DropdownMenuManager] Rendering ${chats.length} chats. Active ID: ${currentActiveId}`);
      chats.forEach(chatMeta => {
        const chatOptionEl = container.createDiv({
          // Ensure all necessary classes are here
          cls: [CSS_CLASS_MENU_OPTION, CSS_CLASS_CHAT_LIST_ITEM, CSS_CLASS_CHAT_OPTION],
        });
        const iconSpan = chatOptionEl.createEl("span", { cls: "menu-option-icon" });
        if (chatMeta.id === currentActiveId) {
          setIcon(iconSpan, "check");
          chatOptionEl.addClass("is-selected");
        } else {
          setIcon(iconSpan, "message-square");
        }

        const textSpan = chatOptionEl.createEl("span", { cls: "menu-option-text" });
        textSpan.createEl("div", { cls: "chat-option-name", text: chatMeta.name });

        // Date formatting
        const lastModifiedDate = new Date(chatMeta.lastModified);
        const dateText = !isNaN(lastModifiedDate.getTime())
          ? this.view.formatRelativeDate(lastModifiedDate) // Use view's formatter
          : "Invalid date";
        if (dateText === "Invalid date") {
          this.plugin.logger.warn(`[DropdownMenuManager] Invalid date parsed for chat ${chatMeta.id}`);
        }
        textSpan.createEl("div", { cls: "chat-option-date", text: dateText });

        // Click handler uses plugin.chatManager directly
        this.registerListener(chatOptionEl, "click", async () => {
          this.plugin.logger.debug(`[DropdownMenuManager] Chat selected: ${chatMeta.name} (${chatMeta.id})`);
          const latestActiveId = this.plugin.chatManager?.getActiveChatId(); // Re-fetch
          if (chatMeta.id !== latestActiveId) {
            await this.plugin.chatManager.setActiveChat(chatMeta.id);
          }
          this.closeMenu();
        });
      });
      // No need to call updateSubmenuHeight here, toggleSubmenu handles it
      this.plugin.logger.debug("[DropdownMenuManager] Finished rendering chat list successfully.");
    } catch (error) {
      this.plugin.logger.error("[DropdownMenuManager] Error rendering chat list:", error);
      container.empty();
      container.createEl("div", { cls: "menu-error-text", text: "Error loading chats." });
      // No need to call updateSubmenuHeight here, toggleSubmenu handles it
    }
  }

  // --- UI Updates ---

  // Copied directly from OllamaView
  public updateToggleViewLocationOption(): void {
    if (!this.toggleViewLocationOption) return;
    this.plugin.logger.trace("[DropdownMenuManager] Updating toggle view location option.");
    this.toggleViewLocationOption.empty();
    const iconSpan = this.toggleViewLocationOption.createSpan({ cls: "menu-option-icon" });
    const textSpan = this.toggleViewLocationOption.createSpan({ cls: "menu-option-text" });

    if (this.plugin.settings.openChatInTab) {
      setIcon(iconSpan, "sidebar-right");
      textSpan.setText("Show in Sidebar");
      this.toggleViewLocationOption.title = "Close tab and reopen in sidebar";
    } else {
      setIcon(iconSpan, "layout-list");
      textSpan.setText("Show in Tab");
      this.toggleViewLocationOption.title = "Close sidebar panel and reopen in tab";
    }
  }

  // --- Update Trigger Methods (Called by OllamaView) ---

  public async updateModelListIfVisible(): Promise<void> {
    if (
      this.isMenuOpen() &&
      this.modelSubmenuContent &&
      !this.modelSubmenuContent.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)
    ) {
      this.plugin.logger.debug("[DropdownMenuManager] Model submenu open, refreshing model list.");
      await this.renderModelList();
      this.updateSubmenuHeight(this.modelSubmenuContent); // Recalculate height after render
    }
  }

  public async updateRoleListIfVisible(): Promise<void> {
    if (
      this.isMenuOpen() &&
      this.roleSubmenuContent &&
      !this.roleSubmenuContent.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)
    ) {
      this.plugin.logger.debug("[DropdownMenuManager] Role submenu open, refreshing role list.");
      await this.renderRoleList();
      this.updateSubmenuHeight(this.roleSubmenuContent); // Recalculate height after render
    }
  }

  public async updateChatListIfVisible(): Promise<void> {
    if (
      this.isMenuOpen() &&
      this.chatSubmenuContent &&
      !this.chatSubmenuContent.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)
    ) {
      this.plugin.logger.debug("[DropdownMenuManager] Chat submenu open, refreshing chat list.");
      await this.renderChatListMenu();
      // For chat list, height is handled by CSS max-height and overflow: auto
      // No need to manually set height based on scrollHeight
    }
  }

  // Copied directly from OllamaView
  private updateSubmenuHeight(contentEl: HTMLElement | null): void {
    if (contentEl && !contentEl.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
      // Only update height if the submenu is currently visible/expanded
      requestAnimationFrame(() => {
        // Check again inside rAF in case it was closed quickly
        if (contentEl && !contentEl.classList.contains(CSS_CLASSES.SUBMENU_CONTENT_HIDDEN)) {
          this.plugin.logger.trace("[DropdownMenuManager] Updating submenu height.");
          // Don't set maxHeight for chat list as it uses overflow
          if (!contentEl.classList.contains(CSS_CLASS_CHAT_LIST_CONTAINER)) {
            contentEl.style.maxHeight = contentEl.scrollHeight + "px";
          }
        }
      });
    }
  }
}
