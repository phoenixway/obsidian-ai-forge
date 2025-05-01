// src/SidebarManager.ts
import { App, setIcon, Menu, Notice, TFolder, normalizePath, debounce, MenuItem } from "obsidian";
import OllamaPlugin from "./main";
import { RoleInfo } from "./ChatManager";
// Важливо: Переконайтесь, що Message експортується з Chat.ts
import { ChatMetadata } from "./Chat";
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import * as RendererUtils from "./MessageRendererUtils";
import { Message } from "./types";

// --- CSS Classes ---
const CSS_ROLE_PANEL = "ollama-role-panel";
const CSS_ROLE_PANEL_HEADER = "ollama-role-panel-header";
const CSS_ROLE_PANEL_LIST = "ollama-role-panel-list";
const CSS_ROLE_PANEL_ITEM = "ollama-role-panel-item";
const CSS_ROLE_PANEL_ITEM_ICON = "ollama-role-panel-item-icon";
const CSS_ROLE_PANEL_ITEM_TEXT = "ollama-role-panel-item-text";
const CSS_ROLE_PANEL_ITEM_ACTIVE = "is-active";
const CSS_ROLE_PANEL_ITEM_CUSTOM = "is-custom";
const CSS_ROLE_PANEL_ITEM_NONE = "ollama-role-panel-item-none";
const CSS_CLASS_MENU_OPTION = "menu-option";
const CSS_SIDEBAR_SECTION_HEADER = "ollama-sidebar-section-header";
const CSS_SIDEBAR_SECTION_CONTENT = "ollama-sidebar-section-content"; // Важливий клас для CSS
const CSS_SIDEBAR_SECTION_ICON = "ollama-sidebar-section-icon";
const CSS_SIDEBAR_HEADER_BUTTON = "ollama-sidebar-header-button";
const CSS_CHAT_ITEM_OPTIONS = "ollama-chat-item-options";
const CSS_CLASS_MENU_SEPARATOR = "menu-separator";
const CSS_CLASSES_DANGER_OPTION = "danger-option";
const CSS_CLASS_CHAT_LIST_ITEM = "ollama-chat-list-item";
const CSS_EXPANDED_CLASS = "is-expanded"; // Важливий клас для CSS
const CSS_CHAT_PANEL_LIST = "ollama-chat-panel-list";
const CSS_CHAT_PANEL_ITEM_NAME = "chat-panel-item-name";
const CSS_CHAT_PANEL_ITEM_DATE = "chat-panel-item-date";
const CSS_CHAT_ITEM_TEXT_WRAPPER = "ollama-chat-item-text-wrapper";
const CSS_SIDEBAR_HEADER_LEFT = "ollama-sidebar-header-left";

// Іконки
const COLLAPSE_ICON = "lucide-folder";
const EXPAND_ICON = "lucide-folder-open";

export class SidebarManager {
  private plugin: OllamaPlugin;
  private app: App;

  // UI Elements
  private containerEl!: HTMLElement;
  private chatPanelHeaderEl!: HTMLElement;
  private chatPanelListEl!: HTMLElement;
  private newChatSidebarButton!: HTMLButtonElement;
  private rolePanelHeaderEl!: HTMLElement;
  private rolePanelListEl!: HTMLElement;

  constructor(plugin: OllamaPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  public createSidebarUI(parentElement: HTMLElement): HTMLElement {
    this.plugin.logger.debug("[SidebarManager] Creating UI...");
    this.containerEl = parentElement.createDiv({ cls: CSS_ROLE_PANEL });

    // --- Секція Чатів ---
    this.chatPanelHeaderEl = this.containerEl.createDiv({
      cls: [CSS_SIDEBAR_SECTION_HEADER, CSS_CLASS_MENU_OPTION],
      attr: { "data-section-type": "chats", "data-collapsed": "false" }, // Починаємо розгорнуто
    });
    const chatHeaderLeft = this.chatPanelHeaderEl.createDiv({ cls: CSS_SIDEBAR_HEADER_LEFT });
    setIcon(chatHeaderLeft.createSpan({ cls: CSS_SIDEBAR_SECTION_ICON }), EXPAND_ICON);
    chatHeaderLeft.createSpan({ cls: "menu-option-text", text: "Chats" });
    this.newChatSidebarButton = this.chatPanelHeaderEl.createEl("button", {
      cls: [CSS_SIDEBAR_HEADER_BUTTON, "clickable-icon"],
      attr: { "aria-label": "New Chat", title: "New Chat" },
    });
    setIcon(this.newChatSidebarButton, "lucide-plus-circle");

    // Створюємо контейнер списку чатів, керування стилями через CSS
    this.chatPanelListEl = this.containerEl.createDiv({
      cls: [CSS_ROLE_PANEL_LIST, CSS_SIDEBAR_SECTION_CONTENT, CSS_EXPANDED_CLASS, CSS_CHAT_PANEL_LIST],
    });

    // Роздільник
    this.containerEl.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });

    // --- Секція Ролей ---
    this.rolePanelHeaderEl = this.containerEl.createDiv({
      cls: [CSS_SIDEBAR_SECTION_HEADER, CSS_CLASS_MENU_OPTION],
      attr: { "data-section-type": "roles", "data-collapsed": "true" }, // Починаємо згорнуто
    });
    const roleHeaderLeft = this.rolePanelHeaderEl.createDiv({ cls: CSS_SIDEBAR_HEADER_LEFT });
    setIcon(roleHeaderLeft.createSpan({ cls: CSS_SIDEBAR_SECTION_ICON }), COLLAPSE_ICON);
    roleHeaderLeft.createSpan({ cls: "menu-option-text", text: "Roles" });

    // Створюємо контейнер списку ролей, керування стилями через CSS
    this.rolePanelListEl = this.containerEl.createDiv({
      cls: [CSS_ROLE_PANEL_LIST, CSS_SIDEBAR_SECTION_CONTENT],
    });

    this.plugin.logger.debug("[SidebarManager] UI Created.");
    this.attachSidebarEventListeners();

    // Оновлюємо вміст початково видимих секцій
    // (CSS вже встановив правильний стан is-expanded/collapsed)
    if (this.isSectionVisible("chats")) {
      this.updateChatList();
    }
    if (this.isSectionVisible("roles")) {
      this.updateRoleList();
    }

    return this.containerEl;
  }

  private attachSidebarEventListeners(): void {
    if (!this.chatPanelHeaderEl || !this.rolePanelHeaderEl || !this.newChatSidebarButton) {
      this.plugin.logger.error("[SidebarManager] Cannot attach listeners: UI elements missing.");
      return;
    }
    this.plugin.registerDomEvent(this.chatPanelHeaderEl, "click", () => this.toggleSection(this.chatPanelHeaderEl));
    this.plugin.registerDomEvent(this.rolePanelHeaderEl, "click", () => this.toggleSection(this.rolePanelHeaderEl));
    this.plugin.registerDomEvent(this.newChatSidebarButton, "click", e => {
      e.stopPropagation();
      this.handleNewChatClick();
    });
    this.plugin.logger.debug("[SidebarManager] Event listeners attached.");
  }

  public isSectionVisible(type: "chats" | "roles"): boolean {
    const headerEl = type === "chats" ? this.chatPanelHeaderEl : this.rolePanelHeaderEl;
    // Перевіряємо наявність headerEl перед доступом до атрибута
    return headerEl?.getAttribute("data-collapsed") === "false";
  }

  public updateChatList = async (): Promise<void> => {
    const container = this.chatPanelListEl;
    if (!container || !this.plugin.chatManager) {
      this.plugin.logger.debug("[SidebarManager.updateChatList] Skipping: Container/Manager missing.");
      return;
    }

    const isVisible = this.isSectionVisible("chats");
    if (!isVisible) {
      this.plugin.logger.debug("[SidebarManager.updateChatList] Section collapsed, updating content only.");
    } else {
      this.plugin.logger.debug("[SidebarManager.updateChatList] Updating chat list content...");
    }

    const currentScrollTop = container.scrollTop;
    container.empty();

    try {
      const chats: ChatMetadata[] = this.plugin.chatManager.listAvailableChats() || [];
      const currentActiveId = this.plugin.chatManager.getActiveChatId();

      if (chats.length === 0) {
        container.createDiv({ cls: "menu-info-text", text: "No saved chats yet." });
      } else {
        chats.forEach(chatMeta => {
          const chatOptionEl = container.createDiv({
            cls: [CSS_ROLE_PANEL_ITEM, CSS_CLASS_MENU_OPTION, CSS_CLASS_CHAT_LIST_ITEM],
          });
          const iconSpan = chatOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
          setIcon(iconSpan, chatMeta.id === currentActiveId ? "check" : "message-square");
          if (chatMeta.id === currentActiveId) chatOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);

          const textWrapper = chatOptionEl.createDiv({ cls: CSS_CHAT_ITEM_TEXT_WRAPPER });
          textWrapper.createDiv({ cls: CSS_CHAT_PANEL_ITEM_NAME, text: chatMeta.name });
          const lastModifiedDate = new Date(chatMeta.lastModified);
          const dateText = !isNaN(lastModifiedDate.getTime())
            ? this.formatRelativeDate(lastModifiedDate)
            : "Invalid date";
          if (dateText === "Invalid date") {
            this.plugin.logger.warn(`[SidebarManager.updateChatList] Invalid date for chat ${chatMeta.id}`);
          }
          textWrapper.createDiv({ cls: CSS_CHAT_PANEL_ITEM_DATE, text: dateText });

          const optionsBtn = chatOptionEl.createEl("button", {
            cls: [CSS_CHAT_ITEM_OPTIONS, "clickable-icon"],
            attr: { "aria-label": "Chat options", title: "More options" },
          });
          setIcon(optionsBtn, "lucide-more-horizontal");

          this.plugin.registerDomEvent(chatOptionEl, "click", async e => {
            if (!(e.target instanceof Element && e.target.closest(`.${CSS_CHAT_ITEM_OPTIONS}`))) {
              if (chatMeta.id !== this.plugin.chatManager?.getActiveChatId()) {
                await this.plugin.chatManager.setActiveChat(chatMeta.id);
              }
            }
          });
          this.plugin.registerDomEvent(optionsBtn, "click", e => {
            e.stopPropagation();
            this.showChatContextMenu(e, chatMeta);
          });
          this.plugin.registerDomEvent(chatOptionEl, "contextmenu", e => {
            this.showChatContextMenu(e, chatMeta);
          });
        });
      }
      this.plugin.logger.debug(`[SidebarManager.updateChatList] Finished rendering ${chats.length} chat items.`);
      // Висота керується CSS, нічого не робимо тут
    } catch (error) {
      this.plugin.logger.error("[SidebarManager.updateChatList] Error rendering:", error);
      container.empty();
      container.createDiv({ text: "Error loading chats.", cls: "menu-error-text" });
      // Висота керується CSS
    } finally {
      requestAnimationFrame(() => {
        if (container?.isConnected) {
          container.scrollTop = currentScrollTop;
        }
      });
    }
  };

  public updateRoleList = async (): Promise<void> => {
    const container = this.rolePanelListEl;
    if (!container || !this.plugin.chatManager) {
      this.plugin.logger.debug("[SidebarManager.updateRoleList] Skipping: Container/Manager missing.");
      return;
    }

    const isVisible = this.isSectionVisible("roles");
    if (!isVisible) {
      this.plugin.logger.debug("[SidebarManager.updateRoleList] Section collapsed, updating content only.");
    } else {
      this.plugin.logger.debug("[SidebarManager.updateRoleList] Updating role list content...");
    }

    const currentScrollTop = container.scrollTop;
    container.empty();

    try {
      const roles = await this.plugin.listRoleFiles(true);
      const activeChat = await this.plugin.chatManager.getActiveChat();
      const currentRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;

      // "None" Option
      const noneOptionEl = container.createDiv({
        cls: [CSS_ROLE_PANEL_ITEM, CSS_ROLE_PANEL_ITEM_NONE, CSS_CLASS_MENU_OPTION],
      });
      const noneIconSpan = noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
      noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: "None" });
      setIcon(noneIconSpan, !currentRolePath ? "check" : "slash");
      if (!currentRolePath) noneOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
      this.plugin.registerDomEvent(noneOptionEl, "click", () => this.handleRolePanelItemClick(null, currentRolePath));

      // Other Roles
      roles.forEach(roleInfo => {
        const roleOptionEl = container.createDiv({ cls: [CSS_ROLE_PANEL_ITEM, CSS_CLASS_MENU_OPTION] });
        const iconSpan = roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
        roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: roleInfo.name });
        if (roleInfo.isCustom) roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_CUSTOM);
        setIcon(iconSpan, roleInfo.path === currentRolePath ? "check" : roleInfo.isCustom ? "user" : "file-text");
        if (roleInfo.path === currentRolePath) roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
        this.plugin.registerDomEvent(roleOptionEl, "click", () =>
          this.handleRolePanelItemClick(roleInfo, currentRolePath)
        );
      });
      this.plugin.logger.debug(`[SidebarManager.updateRoleList] Finished rendering ${roles.length + 1} role items.`);
      // Висота керується CSS
    } catch (error) {
      this.plugin.logger.error("[SidebarManager.updateRoleList] Error rendering:", error);
      container.empty();
      container.createDiv({ text: "Error loading roles.", cls: "menu-error-text" });
      // Висота керується CSS
    } finally {
      requestAnimationFrame(() => {
        if (container?.isConnected) {
          container.scrollTop = currentScrollTop;
        }
      });
    }
  };

  private handleRolePanelItemClick = async (
    roleInfo: RoleInfo | null,
    currentRolePath: string | null | undefined
  ): Promise<void> => {
    const newRolePath = roleInfo?.path ?? "";
    const roleNameForEvent = roleInfo?.name ?? "None";
    const normalizedCurrentRolePath = currentRolePath ?? "";

    if (newRolePath !== normalizedCurrentRolePath) {
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      try {
        if (activeChat) {
          await this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath });
        } else {
          this.plugin.settings.selectedRolePath = newRolePath;
          await this.plugin.saveSettings();
          this.plugin.emit("role-changed", roleNameForEvent);
          this.plugin.promptService?.clearRoleCache?.();
        }
      } catch (error) {
        this.plugin.logger.error(`[SidebarManager] Error setting role to ${newRolePath}:`, error);
        new Notice("Failed to set the role.");
      }
    } else {
      this.plugin.logger.debug(`[SidebarManager] Clicked role is already active.`);
    }
  };

  private async toggleSection(clickedHeaderEl: HTMLElement): Promise<void> {
    const sectionType = clickedHeaderEl.getAttribute("data-section-type") as "chats" | "roles";
    const isCurrentlyCollapsed = clickedHeaderEl.getAttribute("data-collapsed") === "true";
    const iconEl = clickedHeaderEl.querySelector<HTMLElement>(`.${CSS_SIDEBAR_SECTION_ICON}`);

    let contentEl: HTMLElement | null = null;
    let updateFunction: (() => Promise<void>) | null = null; // Функція оновлення вмісту
    let otherHeaderEl: HTMLElement | null = null;
    let otherContentEl: HTMLElement | null = null;
    let otherSectionType: "chats" | "roles" | null = null;

    if (sectionType === "chats") {
      [contentEl, updateFunction, otherHeaderEl, otherContentEl, otherSectionType] = [
        this.chatPanelListEl,
        this.updateChatList,
        this.rolePanelHeaderEl,
        this.rolePanelListEl,
        "roles",
      ];
    } else if (sectionType === "roles") {
      [contentEl, updateFunction, otherHeaderEl, otherContentEl, otherSectionType] = [
        this.rolePanelListEl,
        this.updateRoleList,
        this.chatPanelHeaderEl,
        this.chatPanelListEl,
        "chats",
      ];
    }

    if (!contentEl || !iconEl || !updateFunction || !otherHeaderEl || !otherContentEl || !otherSectionType) {
      this.plugin.logger.error("Sidebar toggle elements missing:", sectionType);
      return;
    }

    if (isCurrentlyCollapsed) {
      // --- Розгортаємо поточну, згортаємо іншу ---
      if (otherHeaderEl.getAttribute("data-collapsed") === "false") {
        const otherIconEl = otherHeaderEl.querySelector<HTMLElement>(`.${CSS_SIDEBAR_SECTION_ICON}`);
        otherHeaderEl.setAttribute("data-collapsed", "true");
        if (otherIconEl) setIcon(otherIconEl, COLLAPSE_ICON);
        otherContentEl.classList.remove(CSS_EXPANDED_CLASS);
        if (otherSectionType === "chats" && this.newChatSidebarButton) this.newChatSidebarButton.hide();
      }

      clickedHeaderEl.setAttribute("data-collapsed", "false");
      setIcon(iconEl, EXPAND_ICON);
      if (sectionType === "chats" && this.newChatSidebarButton) this.newChatSidebarButton.show();

      try {
        // Оновлюємо вміст секції перед додаванням класу
        await updateFunction();
        // Додаємо клас is-expanded, CSS подбає про анімацію та стилі
        requestAnimationFrame(() => {
          if (contentEl?.isConnected && clickedHeaderEl.getAttribute("data-collapsed") === "false") {
            contentEl.classList.add(CSS_EXPANDED_CLASS);
            this.plugin.logger.debug(`Expanding sidebar section: ${sectionType}`);
          }
        });
      } catch (error) {
        this.plugin.logger.error(`Error updating sidebar section ${sectionType}:`, error);
        contentEl.setText(`Error loading ${sectionType}.`);
        requestAnimationFrame(() => {
          if (contentEl?.isConnected && clickedHeaderEl.getAttribute("data-collapsed") === "false") {
            contentEl.classList.add(CSS_EXPANDED_CLASS);
          }
        });
      }
    } else {
      // --- Згортаємо поточну ---
      this.plugin.logger.debug(`Collapsing sidebar section: ${sectionType}`);
      clickedHeaderEl.setAttribute("data-collapsed", "true");
      setIcon(iconEl, COLLAPSE_ICON);
      contentEl.classList.remove(CSS_EXPANDED_CLASS);
      if (sectionType === "chats" && this.newChatSidebarButton) this.newChatSidebarButton.hide();
    }
  }

  // Метод updateSectionHeight ВИДАЛЕНО

  private handleNewChatClick = async (): Promise<void> => {
    this.plugin.logger.debug("[SidebarManager] New Chat button clicked.");
    try {
      const newChat = await this.plugin.chatManager.createNewChat();
      if (newChat) {
        new Notice(`Created new chat: ${newChat.metadata.name}`);
        this.plugin.emit("focus-input-request");
      } else {
        new Notice("Failed to create new chat.");
      }
    } catch (error) {
      this.plugin.logger.error("[SidebarManager] Error creating new chat:", error);
      new Notice("Error creating new chat.");
    }
  };

  //  private showChatContextMenu(event: MouseEvent | PointerEvent, chatMeta: ChatMetadata): void {
  //      event.preventDefault();
  //      const menu = new Menu();

  //      menu.addItem(item => item.setTitle("Clone Chat").setIcon("lucide-copy-plus").onClick(() => this.handleContextMenuClone(chatMeta.id)));
  //      menu.addItem(item => item.setTitle("Rename Chat").setIcon("lucide-pencil").onClick(() => this.handleContextMenuRename(chatMeta.id, chatMeta.name)));
  //      menu.addItem(item => item.setTitle("Export to Note").setIcon("lucide-download").onClick(() => this.exportSpecificChat(chatMeta.id)));
  //      menu.addSeparator();

  //      menu.addItem(item => {
  //          item.setTitle("Clear Messages").setIcon("lucide-trash").onClick(() => this.handleContextMenuClear(chatMeta.id, chatMeta.name));
  //          setTimeout(() => { try { const iel = (item as any)?.el; if (iel instanceof HTMLElement) { iel.addClass(CSS_CLASSES_DANGER_OPTION); } else { this.plugin.logger.warn("item.el issue (Clear)"); } } catch(e) { this.plugin.logger.error("addClass error (Clear):", e); } }, 0);
  //      });
  //      menu.addItem(item => {
  //          item.setTitle("Delete Chat").setIcon("lucide-trash-2").onClick(() => this.handleContextMenuDelete(chatMeta.id, chatMeta.name));
  //           setTimeout(() => { try { const iel = (item as any)?.el; if (iel instanceof HTMLElement) { iel.addClass(CSS_CLASSES_DANGER_OPTION); } else { this.plugin.logger.warn("item.el issue (Delete)"); } } catch(e) { this.plugin.logger.error("addClass error (Delete):", e); } }, 0);
  //      });

  //      menu.showAtMouseEvent(event);
  //  }

  private showChatContextMenu(event: MouseEvent | PointerEvent, chatMeta: ChatMetadata): void {
    event.preventDefault();
    const menu = new Menu();

    menu.addItem(item =>
      item
        .setTitle("Clone Chat")
        .setIcon("lucide-copy-plus")
        .onClick(() => this.handleContextMenuClone(chatMeta.id))
    );

    menu.addItem(item =>
      item
        .setTitle("Rename Chat")
        .setIcon("lucide-pencil")
        .onClick(() => this.handleContextMenuRename(chatMeta.id, chatMeta.name))
    );

    menu.addItem(item =>
      item
        .setTitle("Export to Note")
        .setIcon("lucide-download")
        .onClick(() => this.exportSpecificChat(chatMeta.id))
    );

    menu.addSeparator();

    // Пункт "Clear Messages" - БЕЗ спроби додати клас
    menu.addItem(item => {
      item
        .setTitle("Clear Messages") // Текст залишається
        .setIcon("lucide-trash") // Іконка залишається
        .onClick(() => this.handleContextMenuClear(chatMeta.id, chatMeta.name));
      // ВИДАЛЕНО спробу додати клас CSS_CLASSES_DANGER_OPTION
    });

    // Пункт "Delete Chat" - БЕЗ спроби додати клас
    menu.addItem(item => {
      item
        .setTitle("Delete Chat") // Текст залишається
        .setIcon("lucide-trash-2") // Іконка залишається
        .onClick(() => this.handleContextMenuDelete(chatMeta.id, chatMeta.name));
      // ВИДАЛЕНО спробу додати клас CSS_CLASSES_DANGER_OPTION
    });

    menu.showAtMouseEvent(event);
  }

  private async handleContextMenuClone(chatId: string): Promise<void> {
    this.plugin.logger.info(`[SidebarManager Context] Clone requested for chat ${chatId}`);
    const notice = new Notice("Cloning chat...", 0);
    try {
      const c = await this.plugin.chatManager.cloneChat(chatId);
      if (c) {
        new Notice(`Chat cloned as "${c.metadata.name}"`);
        this.plugin.emit("focus-input-request");
      }
    } catch (e) {
      this.plugin.logger.error(`Clone error:`, e);
    } finally {
      notice.hide();
    }
  }

  private async handleContextMenuRename(chatId: string, currentName: string): Promise<void> {
    this.plugin.logger.info(`[SidebarManager Context] Rename requested for chat ${chatId}`);
    new PromptModal(this.app, "Rename Chat", `New name for "${currentName}":`, currentName, async n => {
      const t = n?.trim();
      if (t && t !== "" && t !== currentName) {
        const s = await this.plugin.chatManager.renameChat(chatId, t);
        new Notice(s ? `Renamed to "${t}"` : `Failed to rename.`);
      } else {
        new Notice(t === currentName ? `Name unchanged.` : `Rename cancelled.`);
      }
      this.plugin.emit("focus-input-request");
    }).open();
  }

  private async exportSpecificChat(chatId: string): Promise<void> {
    this.plugin.logger.info(`[SidebarManager Context] Export requested for chat ${chatId}`);
    const notice = new Notice(`Exporting chat...`, 0);
    try {
      const chat = await this.plugin.chatManager.getChat(chatId);
      if (!chat || chat.messages.length === 0) {
        new Notice("Chat empty/not found.");
        return;
      }
      const md = this.formatChatToMarkdown(chat.messages, chat.metadata);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = chat.metadata.name.replace(/[\\/?:*"<>|]/g, "-");
      const filename = `ollama-chat-${safeName}-${ts}.md`;
      let fPath = this.plugin.settings.chatExportFolderPath?.trim();
      let fFolder: TFolder | null = null;
      if (fPath) {
        fPath = normalizePath(fPath);
        const af = this.app.vault.getAbstractFileByPath(fPath);
        if (!af) {
          try {
            await this.app.vault.createFolder(fPath);
            fFolder = this.app.vault.getAbstractFileByPath(fPath) as TFolder;
            if (fFolder) new Notice(`Created folder: ${fPath}`);
          } catch (err) {
            this.plugin.logger.error("Folder creation error:", err);
            new Notice(`Folder error. Saving to root.`);
            fFolder = this.app.vault.getRoot();
          }
        } else if (af instanceof TFolder) {
          fFolder = af;
        } else {
          new Notice(`Path not folder. Saving to root.`);
          fFolder = this.app.vault.getRoot();
        }
      } else {
        fFolder = this.app.vault.getRoot();
      }
      if (!fFolder) {
        this.plugin.logger.error("Target folder error.");
        new Notice("Export folder error.");
        return;
      }
      const filePath = normalizePath(`${fFolder.path}/${filename}`);
      const file = await this.app.vault.create(filePath, md);
      new Notice(`Exported to ${file.path}`);
    } catch (e) {
      this.plugin.logger.error(`Export error:`, e);
      new Notice("Export failed.");
    } finally {
      notice.hide();
    }
  }

  private async handleContextMenuClear(chatId: string, chatName: string): Promise<void> {
    this.plugin.logger.debug(`[SidebarManager Context] Clear requested for chat ${chatId}`);
    new ConfirmModal(this.app, "Clear Messages", `Clear messages in "${chatName}"?`, async () => {
      const n = new Notice("Clearing...", 0);
      try {
        const s = await this.plugin.chatManager.clearChatMessagesById(chatId);
        new Notice(s ? `Messages cleared.` : `Failed to clear.`);
      } catch (e) {
        this.plugin.logger.error(`Clear error:`, e);
        new Notice("Clear failed.");
      } finally {
        n.hide();
      }
    }).open();
  }

  private async handleContextMenuDelete(chatId: string, chatName: string): Promise<void> {
    this.plugin.logger.debug(`[SidebarManager Context] Delete requested for chat ${chatId}`);
    new ConfirmModal(this.app, "Delete Chat", `Delete chat "${chatName}"?`, async () => {
      const n = new Notice("Deleting...", 0);
      try {
        const s = await this.plugin.chatManager.deleteChat(chatId);
        if (s) new Notice(`Chat deleted.`);
      } catch (e) {
        this.plugin.logger.error(`Delete error:`, e);
        new Notice("Delete failed.");
      } finally {
        n.hide();
      }
    }).open();
  }

  /**
   * Форматує чат у Markdown для експорту.
   */
  private formatChatToMarkdown(messagesToFormat: Message[], metadata: ChatMetadata): string {
    let localLastDate: Date | null = null;
    const exportTimestamp = new Date();

    let markdown = `# AI Forge Chat: ${metadata.name}\n\n`;
    markdown += `* **Chat ID:** ${metadata.id}\n`;
    markdown += `* **Model:** ${metadata.modelName || "Default"}\n`;
    markdown += `* **Role Path:** ${metadata.selectedRolePath || "None"}\n`;
    markdown += `* **Temperature:** ${metadata.temperature ?? this.plugin.settings.temperature}\n`;
    markdown += `* **Created:** ${new Date(metadata.createdAt).toLocaleString()}\n`;
    markdown += `* **Last Modified:** ${new Date(metadata.lastModified).toLocaleString()}\n`;
    markdown += `* **Exported:** ${exportTimestamp.toLocaleString()}\n\n`;
    markdown += `***\n\n`;

    messagesToFormat.forEach(message => {
      if (!message.content?.trim()) return;

      if (localLastDate === null || !this.isSameDay(localLastDate, message.timestamp)) {
        if (localLastDate !== null) markdown += `***\n`;
        markdown += `**${this.formatDateSeparator(message.timestamp)}**\n***\n\n`;
      }
      localLastDate = message.timestamp;

      const time = this.formatTime(message.timestamp);
      let prefix = "";
      let contentPrefix = "";
      let content = message.content.trim();

      if (message.role === "assistant") {
        try {
          content = RendererUtils.decodeHtmlEntities(content);
          if (RendererUtils.detectThinkingTags(content).hasThinkingTags) {
            content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
          }
        } catch (e) {
          this.plugin.logger.warn("Error processing assistant content for export:", e);
        }
        if (!content) return;
      }

      switch (message.role) {
        case "user":
          prefix = `**User (${time}):**\n`;
          break;
        case "assistant":
          prefix = `**Assistant (${time}):**\n`;
          break;
        case "system":
          prefix = `> _[System (${time})]_ \n> `;
          contentPrefix = "> ";
          break;
        case "error":
          prefix = `> [!ERROR] Error (${time}):\n> `;
          contentPrefix = "> ";
          break;
      }
      markdown += prefix;
      if (contentPrefix) {
        markdown +=
          content
            .split("\n")
            .map((line: string) => (line.trim() ? `${contentPrefix}${line}` : contentPrefix.trim()))
            .join(`\n`) + "\n\n";
      } else if (content.includes("```")) {
        content = content.replace(/(\n*\s*)```/g, "\n\n```").replace(/```(\s*\n*)/g, "```\n\n");
        markdown += content.trim() + "\n\n";
      } else {
        markdown +=
          content
            .split("\n")
            .map((line: string) => (line.trim() ? line : ""))
            .join("\n") + "\n\n";
      }
    });
    return markdown.trim();
  }

  private formatTime(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "??:??";
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  private formatDateSeparator(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "Unknown Date";
    const now = new Date();
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (this.isSameDay(date, now)) return "Today";
    if (this.isSameDay(date, y)) return "Yesterday";
    return date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  private formatRelativeDate(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      this.plugin.logger.warn("[formatRelativeDate] Invalid Date");
      return "Invalid date";
    }
    const now = new Date();
    const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
    if (diffSeconds < 5) return "Just now";
    if (diffSeconds < 60) return `${diffSeconds} sec ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    if (!(date1 instanceof Date) || !(date2 instanceof Date) || isNaN(date1.getTime()) || isNaN(date2.getTime()))
      return false;
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  public destroy(): void {
    this.plugin.logger.debug("[SidebarManager] Destroying...");
    this.containerEl?.remove();
  }
}
