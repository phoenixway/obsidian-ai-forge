// src/SidebarManager.ts
import { App, setIcon, Menu, Notice, TFolder, normalizePath, debounce, MenuItem } from "obsidian";
import OllamaPlugin from "./main";
import { RoleInfo } from "./ChatManager";
import { ChatMetadata } from "./Chat"; // Переконайтесь, що Message експортується з Chat.ts чи types.ts
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import * as RendererUtils from "./MessageRendererUtils";
import { Message } from "./types"; // Імпортуємо Message з types.ts
import { OllamaView } from "./OllamaView"; // <-- Імпортуємо OllamaView

// --- CSS Classes ---
const CSS_SIDEBAR_CONTAINER = "ollama-sidebar-container"; // Клас для кореневого елемента
const CSS_ROLE_PANEL = "ollama-role-panel"; // Можна залишити або змінити на ollama-sidebar-section
const CSS_CHAT_PANEL = "ollama-chat-panel"; // Можна залишити або змінити на ollama-sidebar-section
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
const CSS_SIDEBAR_SECTION_CONTENT = "ollama-sidebar-section-content";
const CSS_SIDEBAR_SECTION_ICON = "ollama-sidebar-section-icon";
const CSS_SIDEBAR_HEADER_BUTTON = "ollama-sidebar-header-button";
const CSS_CHAT_ITEM_OPTIONS = "ollama-chat-item-options";
const CSS_CLASS_MENU_SEPARATOR = "menu-separator";
const CSS_CLASSES_DANGER_OPTION = "danger-option";
const CSS_CLASS_CHAT_LIST_ITEM = "ollama-chat-list-item";
const CSS_EXPANDED_CLASS = "is-expanded";
const CSS_CHAT_PANEL_LIST = "ollama-chat-panel-list";
const CSS_CHAT_PANEL_ITEM_NAME = "chat-panel-item-name";
const CSS_CHAT_PANEL_ITEM_DATE = "chat-panel-item-date";
const CSS_CHAT_ITEM_TEXT_WRAPPER = "ollama-chat-item-text-wrapper";
const CSS_SIDEBAR_HEADER_LEFT = "ollama-sidebar-header-left";
const CSS_SIDEBAR_SECTION_CONTENT_HIDDEN = "ollama-sidebar-section-content-hidden"; // Додано

// Іконки
const COLLAPSE_ICON = "lucide-folder";
const EXPAND_ICON = "lucide-folder-open";

export class SidebarManager {
  private plugin: OllamaPlugin;
  private app: App;
  private view: OllamaView; // <-- Додано посилання на View

  // UI Elements
  private containerEl!: HTMLElement; // <-- Перейменовано для ясності
  private chatPanelHeaderEl!: HTMLElement;
  private chatPanelListEl!: HTMLElement;
  private newChatSidebarButton!: HTMLButtonElement;
  private rolePanelHeaderEl!: HTMLElement;
  private rolePanelListEl!: HTMLElement;

  // ЗМІНЕНО КОНСТРУКТОР
  constructor(plugin: OllamaPlugin, app: App, view: OllamaView) {
    this.plugin = plugin;
    this.app = app;
    this.view = view; // Зберігаємо посилання на View
  }

  // ЗМІНЕНО СИГНАТУРУ ТА ДОДАНО RETURN
  public createSidebarUI(parentElement: HTMLElement): HTMLElement {
    this.plugin.logger.debug("[SidebarManager] Creating UI...");
    // Використовуємо CSS_SIDEBAR_CONTAINER для кореневого елемента
    this.containerEl = parentElement.createDiv({ cls: CSS_SIDEBAR_CONTAINER });

    // --- Секція Чатів ---
    const chatPanel = this.containerEl.createDiv({ cls: CSS_CHAT_PANEL }); // Створюємо обгортку для секції
    this.chatPanelHeaderEl = chatPanel.createDiv({
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

    this.chatPanelListEl = chatPanel.createDiv({
      // Додаємо is-expanded одразу, бо починаємо розгорнуто
      cls: [CSS_ROLE_PANEL_LIST, CSS_SIDEBAR_SECTION_CONTENT, CSS_EXPANDED_CLASS, CSS_CHAT_PANEL_LIST],
    });

    // Роздільник (якщо потрібен між секціями)
    // this.containerEl.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });

    // --- Секція Ролей ---
    const rolePanel = this.containerEl.createDiv({ cls: CSS_ROLE_PANEL }); // Створюємо обгортку для секції
    this.rolePanelHeaderEl = rolePanel.createDiv({
      cls: [CSS_SIDEBAR_SECTION_HEADER, CSS_CLASS_MENU_OPTION],
      attr: { "data-section-type": "roles", "data-collapsed": "true" }, // Починаємо згорнуто
    });
    const roleHeaderLeft = this.rolePanelHeaderEl.createDiv({ cls: CSS_SIDEBAR_HEADER_LEFT });
    setIcon(roleHeaderLeft.createSpan({ cls: CSS_SIDEBAR_SECTION_ICON }), COLLAPSE_ICON);
    roleHeaderLeft.createSpan({ cls: "menu-option-text", text: "Roles" });

    // Контейнер для списку ролей, починаємо прихованим (без is-expanded)
    this.rolePanelListEl = rolePanel.createDiv({
      cls: [CSS_ROLE_PANEL_LIST, CSS_SIDEBAR_SECTION_CONTENT], // Додано CSS_SIDEBAR_SECTION_CONTENT_HIDDEN? Ні, керуємо через is-expanded
    });

    this.plugin.logger.debug("[SidebarManager] UI Created.");
    this.attachSidebarEventListeners(); // Додаємо слухачі

    // Оновлюємо вміст початково видимих секцій
    if (this.isSectionVisible("chats")) {
      this.updateChatList();
    }
    // Початково згорнуті секції оновлюються при першому розгортанні в toggleSection

    return this.containerEl; // <-- ПОВЕРТАЄМО КОРЕНЕВИЙ ЕЛЕМЕНТ
  }

  private attachSidebarEventListeners(): void {
    if (!this.chatPanelHeaderEl || !this.rolePanelHeaderEl || !this.newChatSidebarButton) {
      this.plugin.logger.error("[SidebarManager] Cannot attach listeners: UI elements missing.");
      return;
    }
    // ЗМІНЕНО: Використовуємо this.view.registerDomEvent
    this.view.registerDomEvent(this.chatPanelHeaderEl, "click", () => this.toggleSection(this.chatPanelHeaderEl));
    this.view.registerDomEvent(this.rolePanelHeaderEl, "click", () => this.toggleSection(this.rolePanelHeaderEl));
    this.view.registerDomEvent(this.newChatSidebarButton, "click", e => {
      e.stopPropagation(); // Залишаємо, щоб клік по кнопці не згорнув секцію
      this.handleNewChatClick(); // Викликаємо внутрішній обробник
    });
    this.plugin.logger.debug("[SidebarManager] Event listeners attached.");
  }

  public isSectionVisible(type: "chats" | "roles"): boolean {
    const headerEl = type === "chats" ? this.chatPanelHeaderEl : this.rolePanelHeaderEl;
    return headerEl?.getAttribute("data-collapsed") === "false";
  }

  public updateChatList = async (): Promise<void> => {
    const container = this.chatPanelListEl;
    if (!container || !this.plugin.chatManager) {
        this.plugin.logger.debug("[SidebarManager.updateChatList] Skipping: Container/Manager missing.");
        return;
    }

    // Завжди оновлюємо вміст, навіть якщо згорнуто, щоб дані були актуальні при розгортанні
    this.plugin.logger.debug(`[SidebarManager.updateChatList] Updating chat list content (visible: ${this.isSectionVisible("chats")})...`);

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

                // ЗМІНЕНО: Використовуємо this.view.registerDomEvent
                this.view.registerDomEvent(chatOptionEl, "click", async (e: MouseEvent) => { // Додано тип MouseEvent
                    if (!(e.target instanceof Element && e.target.closest(`.${CSS_CHAT_ITEM_OPTIONS}`))) {
                        if (chatMeta.id !== this.plugin.chatManager?.getActiveChatId()) {
                            await this.plugin.chatManager.setActiveChat(chatMeta.id);
                        }
                    }
                });
                // ЗМІНЕНО: Використовуємо this.view.registerDomEvent
                this.view.registerDomEvent(optionsBtn, "click", (e: MouseEvent) => { // Додано тип MouseEvent
                    e.stopPropagation();
                    this.showChatContextMenu(e, chatMeta);
                });
                // ЗМІНЕНО: Використовуємо this.view.registerDomEvent
                this.view.registerDomEvent(chatOptionEl, "contextmenu", (e: MouseEvent) => { // Додано тип MouseEvent
                    this.showChatContextMenu(e, chatMeta);
                });
            });
        }
        this.plugin.logger.debug(`[SidebarManager.updateChatList] Finished rendering ${chats.length} chat items.`);
    } catch (error) {
        this.plugin.logger.error("[SidebarManager.updateChatList] Error rendering:", error);
        container.empty();
        container.createDiv({ text: "Error loading chats.", cls: "menu-error-text" });
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

      // Завжди оновлюємо вміст
      this.plugin.logger.debug(`[SidebarManager.updateRoleList] Updating role list content (visible: ${this.isSectionVisible("roles")})...`);

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
           // ЗМІНЕНО: Використовуємо this.view.registerDomEvent
          this.view.registerDomEvent(noneOptionEl, "click", () => this.handleRolePanelItemClick(null, currentRolePath));

          // Other Roles
          roles.forEach(roleInfo => {
              const roleOptionEl = container.createDiv({ cls: [CSS_ROLE_PANEL_ITEM, CSS_CLASS_MENU_OPTION] });
              const iconSpan = roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
              roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: roleInfo.name });
              if (roleInfo.isCustom) roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_CUSTOM);
              setIcon(iconSpan, roleInfo.path === currentRolePath ? "check" : roleInfo.isCustom ? "user" : "file-text");
              if (roleInfo.path === currentRolePath) roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
              // ЗМІНЕНО: Використовуємо this.view.registerDomEvent
              this.view.registerDomEvent(roleOptionEl, "click", () =>
                  this.handleRolePanelItemClick(roleInfo, currentRolePath)
              );
          });
          this.plugin.logger.debug(`[SidebarManager.updateRoleList] Finished rendering ${roles.length + 1} role items.`);
      } catch (error) {
          this.plugin.logger.error("[SidebarManager.updateRoleList] Error rendering:", error);
          container.empty();
          container.createDiv({ text: "Error loading roles.", cls: "menu-error-text" });
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

    this.plugin.logger.debug(`[SidebarManager] Role item clicked. New path: "${newRolePath}", Current path: "${normalizedCurrentRolePath}"`);

    if (newRolePath !== normalizedCurrentRolePath) {
      const activeChat = await this.plugin.chatManager?.getActiveChat();
      try {
        this.plugin.logger.info(`Setting role to: ${roleNameForEvent}`);
        if (activeChat) {
            this.plugin.logger.debug(`Updating role for active chat ${activeChat.metadata.id}`);
          await this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath });
          // Подія active-chat-changed оновить UI
        } else {
            this.plugin.logger.debug(`Setting global default role.`);
          this.plugin.settings.selectedRolePath = newRolePath;
          await this.plugin.saveSettings(); // Це викличе settings-updated -> roles-updated
          this.plugin.emit("role-changed", roleNameForEvent); // Додатково генеруємо подію зміни ролі
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

  // Метод toggleSection ВИПРАВЛЕНИЙ вище

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
        this.updateChatList, // Зв'язуємо функцію
        this.rolePanelHeaderEl,
        this.rolePanelListEl,
        "roles",
      ];
    } else if (sectionType === "roles") {
      [contentEl, updateFunction, otherHeaderEl, otherContentEl, otherSectionType] = [
        this.rolePanelListEl,
        this.updateRoleList, // Зв'язуємо функцію
        this.chatPanelHeaderEl,
        this.chatPanelListEl,
        "chats",
      ];
    }

    if (!contentEl || !iconEl || !updateFunction || !otherHeaderEl || !otherContentEl || !otherSectionType) {
      this.plugin.logger.error("Sidebar toggle elements missing:", sectionType);
      return;
    }

    // Прив'язуємо контекст this до updateFunction
    const boundUpdateFunction = updateFunction.bind(this);

    if (isCurrentlyCollapsed) {
      // --- Розгортаємо поточну, згортаємо іншу ---
      if (otherHeaderEl.getAttribute("data-collapsed") === "false") {
        const otherIconEl = otherHeaderEl.querySelector<HTMLElement>(`.${CSS_SIDEBAR_SECTION_ICON}`);
        otherHeaderEl.setAttribute("data-collapsed", "true");
        if (otherIconEl) setIcon(otherIconEl, COLLAPSE_ICON);
        otherContentEl.classList.remove(CSS_EXPANDED_CLASS);
        otherContentEl.classList.add(CSS_SIDEBAR_SECTION_CONTENT_HIDDEN); // Додаємо клас для приховування
        if (otherSectionType === "chats" && this.newChatSidebarButton) this.newChatSidebarButton.hide();
      }

      clickedHeaderEl.setAttribute("data-collapsed", "false");
      setIcon(iconEl, EXPAND_ICON);
      contentEl.classList.remove(CSS_SIDEBAR_SECTION_CONTENT_HIDDEN); // Видаляємо клас приховування
      if (sectionType === "chats" && this.newChatSidebarButton) this.newChatSidebarButton.show();

      try {
        // Оновлюємо вміст секції перед додаванням класу
        await boundUpdateFunction(); // Викликаємо прив'язану функцію
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
      contentEl.classList.add(CSS_SIDEBAR_SECTION_CONTENT_HIDDEN); // Додаємо клас для приховування
      if (sectionType === "chats" && this.newChatSidebarButton) this.newChatSidebarButton.hide();
    }
}


  private handleNewChatClick = async (): Promise<void> => {
    this.plugin.logger.debug("[SidebarManager] New Chat button clicked.");
    try {
      const newChat = await this.plugin.chatManager.createNewChat();
      if (newChat) {
        new Notice(`Created new chat: ${newChat.metadata.name}`);
        this.plugin.emit("focus-input-request"); // Посилаємо запит на фокус інпуту
      } else {
        new Notice("Failed to create new chat.");
      }
    } catch (error) {
      this.plugin.logger.error("[SidebarManager] Error creating new chat:", error);
      new Notice("Error creating new chat.");
    }
  };

      // --- ОСНОВНИЙ ВИПРАВЛЕНИЙ МЕТОД ---
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
      // Повідомлення про помилку показується в cloneChat
    } catch (e) {
      this.plugin.logger.error(`Clone error:`, e);
      // Додаткове повідомлення тут не потрібне
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
        // Повідомлення про успіх/невдачу показуються в renameChat
      } else {
        new Notice(t === currentName ? `Name unchanged.` : `Rename cancelled.`);
      }
       this.plugin.emit("focus-input-request"); // Фокусуємо поле вводу після дії
    }).open();
  }

  private async exportSpecificChat(chatId: string): Promise<void> {
    this.plugin.logger.info(`[SidebarManager Context] Export requested for chat ${chatId}`);
    const notice = new Notice(`Exporting chat...`, 0);
    try {
      const chat = await this.plugin.chatManager.getChat(chatId);
      if (!chat || chat.messages.length === 0) {
        new Notice("Chat is empty or not found, nothing to export.");
        return;
      }
      // Використовуємо метод форматування з this
      const md = this.formatChatToMarkdown(chat.messages, chat.metadata);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = chat.metadata.name.replace(/[\\/?:*"<>|]/g, "-");
      const filename = `ollama-chat-${safeName}-${ts}.md`;

      let fPath = this.plugin.settings.chatExportFolderPath?.trim();
      let fFolder: TFolder | null = null;
      // ... (логіка визначення папки як була) ...
       if (fPath) {
        fPath = normalizePath(fPath);
        const af = this.app.vault.getAbstractFileByPath(fPath);
        if (!af) {
          try {
            await this.app.vault.createFolder(fPath);
            fFolder = this.app.vault.getAbstractFileByPath(fPath) as TFolder;
            if (fFolder) new Notice(`Created export folder: ${fPath}`);
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
         new Notice(s ? `Messages cleared for "${chatName}".` : `Failed to clear messages for "${chatName}".`);
         // UI активного чату оновиться через подію, якщо він був активним
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
         // Повідомлення про успіх/невдачу показується в deleteChat
         if (s) {
             // Можна додати додаткове сповіщення, якщо потрібно
             // new Notice(`Chat "${chatName}" deleted.`);
         }
      } catch (e) {
        this.plugin.logger.error(`Delete error:`, e);
        new Notice("Delete failed.");
      } finally {
        n.hide();
      }
    }).open();
  }

  // --- Formatting Helpers ---
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

      // --- Date Separator Logic ---
      if (localLastDate === null || !this.isSameDay(localLastDate, message.timestamp)) {
        if (localLastDate !== null) markdown += `***\n\n`; // Add separator only *between* days
        markdown += `**${this.formatDateSeparator(message.timestamp)}**\n***\n\n`;
        localLastDate = message.timestamp; // Update last date
      }
      // --------------------------

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
        case "user": prefix = `**User (${time}):**\n`; break;
        case "assistant": prefix = `**Assistant (${time}):**\n`; break;
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
        markdown += content.split("\n").map((line: string) => (line.trim() ? `${contentPrefix}${line}` : contentPrefix.trim())).join(`\n`) + "\n\n";
      } else if (content.includes("```")) {
        // Ensure blank lines around code blocks
        content = content.replace(/(\r?\n)*```/g, "\n\n```").replace(/```(\r?\n)*/g, "```\n\n");
        markdown += content.trim() + "\n\n";
      } else {
        // Preserve line breaks within normal messages
        markdown += content.split("\n").map((line: string) => line.trim() ? line : "").join("\n") + "\n\n";
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
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (this.isSameDay(date, now)) return "Today";
    if (this.isSameDay(date, yesterday)) return "Yesterday";

    // Check if the date was within the last week (excluding today and yesterday)
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 1 && diffDays < 7) {
         return date.toLocaleDateString(undefined, { weekday: 'long' }); // e.g., "Monday"
    }

    // Older dates
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }


  private formatRelativeDate(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      this.plugin.logger.warn("[formatRelativeDate] Invalid Date");
      return "Invalid date";
    }
    const now = new Date();
    const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 5) return "Just now";
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;

    // Use a more compact date format for older dates
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    if (!(date1 instanceof Date) || !(date2 instanceof Date) || isNaN(date1.getTime()) || isNaN(date2.getTime())) return false;
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  public destroy(): void {
    this.plugin.logger.debug("[SidebarManager] Destroying...");
    // Видалення кореневого елемента, якщо він існує
    this.containerEl?.remove();
     // Явне видалення слухачів не потрібне, якщо використовується this.view.registerDomEvent
  }
}