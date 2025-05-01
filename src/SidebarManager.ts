// src/SidebarManager.ts
import { App, setIcon, Menu, Notice, TFolder, normalizePath, debounce, MenuItem } from "obsidian"; // Додано MenuItem
import OllamaPlugin from "./main";
import { RoleInfo } from "./ChatManager";
import { ChatMetadata } from "./Chat"; // Додано Message
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import * as RendererUtils from "./MessageRendererUtils"; // <--- ДОДАНО ІМПОРТ
import { Message } from "./types";

// --- CSS Classes ---
// (Скопійовано з OllamaView.ts та відфільтровано)
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

    // Debounce для оновлення висоти
    private debouncedUpdateChatHeight: () => void;
    private debouncedUpdateRoleHeight: () => void;


    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;

         // Ініціалізуємо debounced функції
        this.debouncedUpdateChatHeight = debounce(() => this.updateSectionHeight(this.chatPanelListEl), 100, true);
        this.debouncedUpdateRoleHeight = debounce(() => this.updateSectionHeight(this.rolePanelListEl), 100, true);
    }

    public createSidebarUI(parentElement: HTMLElement): HTMLElement {
        this.plugin.logger.debug("[SidebarManager] Creating UI...");
        this.containerEl = parentElement.createDiv({ cls: CSS_ROLE_PANEL });

        // --- Секція Чатів ---
        this.chatPanelHeaderEl = this.containerEl.createDiv({
            cls: [CSS_SIDEBAR_SECTION_HEADER, CSS_CLASS_MENU_OPTION],
            attr: { "data-section-type": "chats", "data-collapsed": "false" },
        });
        const chatHeaderLeft = this.chatPanelHeaderEl.createDiv({ cls: CSS_SIDEBAR_HEADER_LEFT });
        setIcon(chatHeaderLeft.createSpan({ cls: CSS_SIDEBAR_SECTION_ICON }), EXPAND_ICON);
        chatHeaderLeft.createSpan({ cls: "menu-option-text", text: "Chats" });
        this.newChatSidebarButton = this.chatPanelHeaderEl.createEl("button", {
            cls: [CSS_SIDEBAR_HEADER_BUTTON, "clickable-icon"],
            attr: { "aria-label": "New Chat", title: "New Chat" },
        });
        setIcon(this.newChatSidebarButton, "lucide-plus-circle");

        this.chatPanelListEl = this.containerEl.createDiv({
            cls: [CSS_ROLE_PANEL_LIST, CSS_SIDEBAR_SECTION_CONTENT, CSS_EXPANDED_CLASS, CSS_CHAT_PANEL_LIST],
        });
        // Початкові стилі для анімації (будуть змінені при першому updateSectionHeight)
        this.chatPanelListEl.style.overflow = 'hidden';
        this.chatPanelListEl.style.transition = 'max-height 0.3s ease-out, padding 0.3s ease-out';
        this.chatPanelListEl.style.maxHeight = '0px'; // Починаємо зі згорнутого для розрахунку висоти
        this.chatPanelListEl.style.paddingTop = '0';
        this.chatPanelListEl.style.paddingBottom = '0';


        // Роздільник
        this.containerEl.createEl("hr", { cls: CSS_CLASS_MENU_SEPARATOR });

        // --- Секція Ролей ---
        this.rolePanelHeaderEl = this.containerEl.createDiv({
            cls: [CSS_SIDEBAR_SECTION_HEADER, CSS_CLASS_MENU_OPTION],
            attr: { "data-section-type": "roles", "data-collapsed": "true" },
        });
        const roleHeaderLeft = this.rolePanelHeaderEl.createDiv({ cls: CSS_SIDEBAR_HEADER_LEFT });
        setIcon(roleHeaderLeft.createSpan({ cls: CSS_SIDEBAR_SECTION_ICON }), COLLAPSE_ICON);
        roleHeaderLeft.createSpan({ cls: "menu-option-text", text: "Roles" });

        this.rolePanelListEl = this.containerEl.createDiv({
            cls: [CSS_ROLE_PANEL_LIST, CSS_SIDEBAR_SECTION_CONTENT],
        });
        this.rolePanelListEl.style.maxHeight = '0px';
        this.rolePanelListEl.style.overflow = 'hidden';
        this.rolePanelListEl.style.transition = 'max-height 0.3s ease-out, padding 0.3s ease-out';
        this.rolePanelListEl.style.paddingTop = '0';
        this.rolePanelListEl.style.paddingBottom = '0';

        this.plugin.logger.debug("[SidebarManager] UI Created.");
        this.attachSidebarEventListeners();

        // Оновлюємо списки (і їх висоту), якщо вони видимі при старті
         this.updateInitialSectionVisibility();


        return this.containerEl;
    }

     /** Ініціалізує видимість та оновлює вміст видимих секцій при першому запуску */
     private updateInitialSectionVisibility() {
         requestAnimationFrame(() => { // Чекаємо на перший рендер
             if (this.isSectionVisible("chats")) {
                 this.plugin.logger.debug("[SidebarManager] Initial update for visible Chats section.");
                 this.updateChatList(); // Оновлення вмісту та висоти
             }
             if (this.isSectionVisible("roles")) {
                 this.plugin.logger.debug("[SidebarManager] Initial update for visible Roles section.");
                 this.updateRoleList(); // Оновлення вмісту та висоти
             }
         });
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
        return headerEl?.getAttribute("data-collapsed") === "false";
    }

    public updateChatList = async (): Promise<void> => {
        const container = this.chatPanelListEl;
        if (!container || !this.plugin.chatManager) {
            this.plugin.logger.debug("[SidebarManager.updateChatList] Skipping update: Container or ChatManager missing.");
            return;
        }
        if (!this.isSectionVisible("chats")) {
             // Навіть якщо секція згорнута, оновлюємо вміст про всяк випадок,
             // але не викликаємо updateSectionHeight
             this.plugin.logger.debug("[SidebarManager.updateChatList] Section collapsed, updating content only.");
         } else {
             this.plugin.logger.debug("[SidebarManager.updateChatList] Updating chat list content and height...");
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
                    if (chatMeta.id === currentActiveId) {
                        setIcon(iconSpan, "check");
                        chatOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
                    } else {
                        setIcon(iconSpan, "message-square");
                    }

                    const textWrapper = chatOptionEl.createDiv({ cls: CSS_CHAT_ITEM_TEXT_WRAPPER });
                    textWrapper.createDiv({ cls: CSS_CHAT_PANEL_ITEM_NAME, text: chatMeta.name });

                    const lastModifiedDate = new Date(chatMeta.lastModified);
                    const dateText = !isNaN(lastModifiedDate.getTime())
                        ? this.formatRelativeDate(lastModifiedDate)
                        : "Invalid date";
                    if (dateText === "Invalid date") { /* log warning */ }
                    textWrapper.createDiv({ cls: CSS_CHAT_PANEL_ITEM_DATE, text: dateText });

                    const optionsBtn = chatOptionEl.createEl("button", {
                        cls: [CSS_CHAT_ITEM_OPTIONS, "clickable-icon"],
                        attr: { "aria-label": "Chat options", title: "More options" },
                    });
                    setIcon(optionsBtn, "lucide-more-horizontal");

                    this.plugin.registerDomEvent(chatOptionEl, "click", async e => {
                        if (!(e.target instanceof Element && e.target.closest(`.${CSS_CHAT_ITEM_OPTIONS}`))) {
                            if (chatMeta.id !== this.plugin.chatManager?.getActiveChatId()) {
                                this.plugin.logger.debug(`[SidebarManager] Chat item clicked: ${chatMeta.id}. Setting active.`);
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
            // Оновлюємо висоту ТІЛЬКИ якщо секція видима
            if (this.isSectionVisible("chats")) {
                this.debouncedUpdateChatHeight(); // Використовуємо debounce
            }
        } catch (error) {
            this.plugin.logger.error("[SidebarManager.updateChatList] Error rendering chat panel list:", error);
            container.empty();
            container.createDiv({ text: "Error loading chats.", cls: "menu-error-text" });
             // Оновлюємо висоту ТІЛЬКИ якщо секція видима (для показу помилки)
            if (this.isSectionVisible("chats")) {
                 this.debouncedUpdateChatHeight(); // Використовуємо debounce
            }
        } finally {
             requestAnimationFrame(() => {
                if (container && container.isConnected) {
                    container.scrollTop = currentScrollTop;
                }
            });
        }
    };

    public updateRoleList = async (): Promise<void> => {
        const container = this.rolePanelListEl;
        if (!container || !this.plugin.chatManager) {
            this.plugin.logger.debug("[SidebarManager.updateRoleList] Skipping update: Container or ChatManager missing.");
            return;
        }
         if (!this.isSectionVisible("roles")) {
             this.plugin.logger.debug("[SidebarManager.updateRoleList] Section collapsed, updating content only.");
         } else {
             this.plugin.logger.debug("[SidebarManager.updateRoleList] Updating role list content and height...");
         }


        const currentScrollTop = container.scrollTop;
        container.empty();

        try {
            const roles = await this.plugin.listRoleFiles(true);
            const activeChat = await this.plugin.chatManager.getActiveChat();
            const currentRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath;

            // "None" Option
            const noneOptionEl = container.createDiv({ cls: [CSS_ROLE_PANEL_ITEM, CSS_ROLE_PANEL_ITEM_NONE, CSS_CLASS_MENU_OPTION] });
            const noneIconSpan = noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
            noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: "None" });
            if (!currentRolePath) {
                noneOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
                setIcon(noneIconSpan, "check");
            } else {
                setIcon(noneIconSpan, "slash");
            }
            this.plugin.registerDomEvent(noneOptionEl, "click", () => this.handleRolePanelItemClick(null, currentRolePath));

            // Other Roles
            roles.forEach(roleInfo => {
                const roleOptionEl = container.createDiv({ cls: [CSS_ROLE_PANEL_ITEM, CSS_CLASS_MENU_OPTION] });
                const iconSpan = roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] });
                roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: roleInfo.name });
                if (roleInfo.isCustom) roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_CUSTOM);
                if (roleInfo.path === currentRolePath) {
                    roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE);
                    setIcon(iconSpan, "check");
                } else {
                    setIcon(iconSpan, roleInfo.isCustom ? "user" : "file-text");
                }
                this.plugin.registerDomEvent(roleOptionEl, "click", () => this.handleRolePanelItemClick(roleInfo, currentRolePath));
            });
            this.plugin.logger.debug(`[SidebarManager.updateRoleList] Finished rendering ${roles.length + 1} role items.`);

            if (this.isSectionVisible("roles")) {
                 this.debouncedUpdateRoleHeight(); // Використовуємо debounce
            }
        } catch (error) {
            this.plugin.logger.error("[SidebarManager.updateRoleList] Error rendering role panel list:", error);
            container.empty();
            container.createDiv({ text: "Error loading roles.", cls: "menu-error-text" });
             if (this.isSectionVisible("roles")) {
                 this.debouncedUpdateRoleHeight(); // Використовуємо debounce
            }
        } finally {
             requestAnimationFrame(() => {
                if (container && container.isConnected) {
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
        let updateFunction: (() => Promise<void>) | null = null;
        let otherHeaderEl: HTMLElement | null = null;
        let otherContentEl: HTMLElement | null = null;
        let otherSectionType: "chats" | "roles" | null = null;
         let debouncedUpdateHeight: (() => void) | null = null; // Додаємо debounce

        if (sectionType === "chats") {
            contentEl = this.chatPanelListEl;
            updateFunction = this.updateChatList;
            otherHeaderEl = this.rolePanelHeaderEl;
            otherContentEl = this.rolePanelListEl;
            otherSectionType = "roles";
            debouncedUpdateHeight = this.debouncedUpdateChatHeight;
        } else if (sectionType === "roles") {
            contentEl = this.rolePanelListEl;
            updateFunction = this.updateRoleList;
            otherHeaderEl = this.chatPanelHeaderEl;
            otherContentEl = this.chatPanelListEl;
            otherSectionType = "chats";
            debouncedUpdateHeight = this.debouncedUpdateRoleHeight;
        }

        if (!contentEl || !iconEl || !updateFunction || !otherHeaderEl || !otherContentEl || !otherSectionType || !debouncedUpdateHeight) {
            this.plugin.logger.error("Could not find all required elements for sidebar accordion toggle:", sectionType);
            return;
        }

        if (isCurrentlyCollapsed) {
            // --- Розгортаємо поточну, згортаємо іншу ---
            if (otherHeaderEl.getAttribute("data-collapsed") === "false") {
                const otherIconEl = otherHeaderEl.querySelector<HTMLElement>(`.${CSS_SIDEBAR_SECTION_ICON}`);
                otherHeaderEl.setAttribute("data-collapsed", "true");
                if (otherIconEl) setIcon(otherIconEl, COLLAPSE_ICON);
                otherContentEl.classList.remove(CSS_EXPANDED_CLASS);
                otherContentEl.style.maxHeight = '0px';
                otherContentEl.style.paddingTop = '0';
                otherContentEl.style.paddingBottom = '0';
                if (otherSectionType === "chats" && this.newChatSidebarButton) this.newChatSidebarButton.hide();
            }

            clickedHeaderEl.setAttribute("data-collapsed", "false");
            setIcon(iconEl, EXPAND_ICON);
            if (sectionType === "chats" && this.newChatSidebarButton) this.newChatSidebarButton.show();

            try {
                 // Спочатку оновлюємо вміст (updateFunction викличе debounce для висоти)
                await updateFunction();
                // Потім додаємо клас і відновлюємо padding для анімації
                requestAnimationFrame(() => {
                    if(contentEl?.isConnected && clickedHeaderEl.getAttribute("data-collapsed") === "false") {
                        contentEl.classList.add(CSS_EXPANDED_CLASS);
                        contentEl.style.paddingTop = '';
                        contentEl.style.paddingBottom = '';
                        // Висота встановиться через debouncedUpdateHeight, викликаний в updateFunction
                        this.plugin.logger.debug(`Expanding sidebar section: ${sectionType}`);
                    }
                });

            } catch (error) {
                 this.plugin.logger.error(`Error updating sidebar section ${sectionType}:`, error);
                 contentEl.setText(`Error loading ${sectionType}.`);
                 contentEl.classList.add(CSS_EXPANDED_CLASS); // Показуємо помилку
                 debouncedUpdateHeight(); // Оновлюємо висоту для помилки
             }

        } else {
            // --- Згортаємо поточну ---
            this.plugin.logger.debug(`Collapsing sidebar section: ${sectionType}`);
            clickedHeaderEl.setAttribute("data-collapsed", "true");
            setIcon(iconEl, COLLAPSE_ICON);
            contentEl.classList.remove(CSS_EXPANDED_CLASS);
            contentEl.style.maxHeight = '0px';
            contentEl.style.paddingTop = '0';
            contentEl.style.paddingBottom = '0';

            if (sectionType === "chats" && this.newChatSidebarButton) {
                this.newChatSidebarButton.hide();
            }
        }
    }

     /** Оновлює maxHeight секції */
     private updateSectionHeight(sectionContentEl: HTMLElement | null) {
        if (sectionContentEl && sectionContentEl.classList.contains(CSS_EXPANDED_CLASS)) {
            requestAnimationFrame(() => {
                if (sectionContentEl?.isConnected && sectionContentEl.classList.contains(CSS_EXPANDED_CLASS)) {
                    const currentScrollHeight = sectionContentEl.scrollHeight;
                    sectionContentEl.style.maxHeight = currentScrollHeight + "px";
                   // this.plugin.logger.trace(`Updated section height to: ${currentScrollHeight}px`);
                }
            });
        }
    }


    private handleNewChatClick = async (): Promise<void> => {
        this.plugin.logger.debug("[SidebarManager] New Chat button clicked.");
        try {
            const newChat = await this.plugin.chatManager.createNewChat();
            if (newChat) {
                new Notice(`Created new chat: ${newChat.metadata.name}`);
                this.plugin.emit('focus-input-request');
            } else {
                new Notice("Failed to create new chat.");
            }
        } catch (error) {
            this.plugin.logger.error("[SidebarManager] Error creating new chat:", error);
            new Notice("Error creating new chat.");
        }
    };

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

         menu.addItem(item => {
             item
                 .setTitle("Clear Messages")
                 .setIcon("lucide-trash")
                 .onClick(() => this.handleContextMenuClear(chatMeta.id, chatMeta.name));
                 (item as any).el.addClass(CSS_CLASSES_DANGER_OPTION); // <--- Повертаємо (item as any)
            //  item.el.addClass(CSS_CLASSES_DANGER_OPTION); // <--- ВИПРАВЛЕНО: dom -> el
         });

         menu.addItem(item => {
             item
                 .setTitle("Delete Chat")
                 .setIcon("lucide-trash-2")
                 .onClick(() => this.handleContextMenuDelete(chatMeta.id, chatMeta.name));
    (item as any).el.addClass(CSS_CLASSES_DANGER_OPTION); // <--- Повертаємо (item as any)         
    });

         menu.showAtMouseEvent(event);
     }

     private async handleContextMenuClone(chatId: string): Promise<void> {
        this.plugin.logger.info(`[SidebarManager Context] Clone requested for chat ${chatId}`);
        const cloningNotice = new Notice("Cloning chat...", 0);
        try {
            const clonedChat = await this.plugin.chatManager.cloneChat(chatId);
            if (clonedChat) {
                new Notice(`Chat cloned as "${clonedChat.metadata.name}" and activated.`);
                 this.plugin.emit('focus-input-request');
            }
        } catch (error) {
            this.plugin.logger.error(`[SidebarManager Context] Error cloning chat ${chatId}:`, error);
        } finally {
            cloningNotice.hide();
        }
    }

    private async handleContextMenuRename(chatId: string, currentName: string): Promise<void> {
        this.plugin.logger.info(`[SidebarManager Context] Rename requested for chat ${chatId}`);
         new PromptModal(
            this.app, "Rename Chat", `Enter new name for "${currentName}":`, currentName,
            async (newName) => {
                const trimmedName = newName?.trim();
                if (trimmedName && trimmedName !== "" && trimmedName !== currentName) {
                    const success = await this.plugin.chatManager.renameChat(chatId, trimmedName);
                    new Notice(success ? `Chat renamed to "${trimmedName}"` : "Failed to rename chat.");
                } else if (trimmedName === currentName) {
                    new Notice("Name unchanged.");
                } else { new Notice("Rename cancelled or invalid name entered."); }
                 this.plugin.emit('focus-input-request');
            }
        ).open();
    }

    private async exportSpecificChat(chatId: string): Promise<void> {
        this.plugin.logger.info(`[SidebarManager Context] Export requested for chat ${chatId}`);
        const exportingNotice = new Notice(`Exporting chat...`, 0);
        try {
            const chat = await this.plugin.chatManager.getChat(chatId);
            if (!chat || chat.messages.length === 0) {
                new Notice("Chat is empty or not found, nothing to export.");
                return;
            }

            const markdownContent = this.formatChatToMarkdown(chat.messages, chat.metadata);
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const safeName = chat.metadata.name.replace(/[\\/?:*"<>|]/g, "-");
            const filename = `ollama-chat-${safeName}-${timestamp}.md`;
            let targetFolderPath = this.plugin.settings.chatExportFolderPath?.trim();
            let targetFolder: TFolder | null = null;

            if (targetFolderPath) {
                targetFolderPath = normalizePath(targetFolderPath);
                const abstractFile = this.app.vault.getAbstractFileByPath(targetFolderPath);
                if (!abstractFile) {
                    try { await this.app.vault.createFolder(targetFolderPath); targetFolder = this.app.vault.getAbstractFileByPath(targetFolderPath) as TFolder; if (targetFolder) new Notice(`Created export folder: ${targetFolderPath}`); }
                    catch (err) { this.plugin.logger.error("Error creating export folder:", err); new Notice(`Error creating export folder. Saving to vault root.`); targetFolder = this.app.vault.getRoot(); }
                } else if (abstractFile instanceof TFolder) { targetFolder = abstractFile; }
                else { new Notice(`Error: Export path is not a folder. Saving to vault root.`); targetFolder = this.app.vault.getRoot(); }
            } else { targetFolder = this.app.vault.getRoot(); }

            if (!targetFolder) { this.plugin.logger.error("[SidebarManager Context] Failed to determine target folder for export."); new Notice("Error determining export folder."); return; }

            const filePath = normalizePath(`${targetFolder.path}/${filename}`);
            const file = await this.app.vault.create(filePath, markdownContent);
            new Notice(`Chat exported to ${file.path}`);
        } catch (error) {
            this.plugin.logger.error(`[SidebarManager Context] Error exporting chat ${chatId}:`, error);
            new Notice("An unexpected error occurred during chat export.");
        } finally {
            exportingNotice.hide();
        }
    }

    private async handleContextMenuClear(chatId: string, chatName: string): Promise<void> {
        this.plugin.logger.debug(`[SidebarManager Context] Clear requested for chat ${chatId} (${chatName})`);
        new ConfirmModal(this.app, "Confirm Clear Messages", `Are you sure you want to clear all messages in chat "${chatName}"?\nThis action cannot be undone.`,
            async () => {
                const clearingNotice = new Notice("Clearing messages...", 0);
                try {
                    const success = await this.plugin.chatManager.clearChatMessagesById(chatId);
                    new Notice(success ? `Messages cleared for chat "${chatName}".` : `Failed to clear messages for chat "${chatName}".`);
                } catch (error) {
                    this.plugin.logger.error(`[SidebarManager Context] Error clearing messages for chat ${chatId}:`, error); new Notice("Error clearing messages.");
                } finally { clearingNotice.hide(); }
            }
        ).open();
    }

    private async handleContextMenuDelete(chatId: string, chatName: string): Promise<void> {
        this.plugin.logger.debug(`[SidebarManager Context] Delete requested for chat ${chatId} (${chatName})`);
        new ConfirmModal(this.app, "Confirm Delete Chat", `Are you sure you want to delete chat "${chatName}"?\nThis action cannot be undone.`,
            async () => {
                const deletingNotice = new Notice("Deleting chat...", 0);
                try {
                    const success = await this.plugin.chatManager.deleteChat(chatId);
                    if (success) new Notice(`Chat "${chatName}" deleted.`);
                } catch (error) {
                    this.plugin.logger.error(`[SidebarManager Context] Error deleting chat ${chatId}:`, error); new Notice("Error deleting chat.");
                } finally { deletingNotice.hide(); }
            }
        ).open();
    }

     /**
      * Форматує чат у Markdown для експорту.
      */
     private formatChatToMarkdown(messagesToFormat: Message[], metadata: ChatMetadata): string {
        let localLastDate: Date | null = null;
        const exportTimestamp = new Date();

        let markdown = `# AI Forge Chat: ${metadata.name}\n\n`;
        markdown += `* **Chat ID:** ${metadata.id}\n`;
        markdown += `* **Model:** ${metadata.modelName || 'Default'}\n`;
        markdown += `* **Role Path:** ${metadata.selectedRolePath || 'None'}\n`;
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
                    // Використовуємо RendererUtils, який тепер імпортовано
                    // <--- ВИПРАВЛЕННЯ ПОМИЛОК ТИПІВ ТУТ ---
                    content = RendererUtils.decodeHtmlEntities(content);
                    if (RendererUtils.detectThinkingTags(content).hasThinkingTags) {
                        content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
                    }
                    // <--- КІНЕЦЬ ВИПРАВЛЕННЯ ---
                } catch (e) {
                     this.plugin.logger.warn("Error processing assistant content for export:", e);
                 }
                if (!content) return;
            }

            switch (message.role) {
                case "user": prefix = `**User (${time}):**\n`; break;
                case "assistant": prefix = `**Assistant (${time}):**\n`; break;
                case "system": prefix = `> _[System (${time})]_ \n> `; contentPrefix = "> "; break;
                case "error": prefix = `> [!ERROR] Error (${time}):\n> `; contentPrefix = "> "; break;
            }
            markdown += prefix;
            if (contentPrefix) {
                markdown += content.split("\n").map(line => (line.trim() ? `${contentPrefix}${line}` : contentPrefix.trim())).join(`\n`) + "\n\n";
            } else if (content.includes("```")) {
                content = content.replace(/(\n*\s*)```/g, "\n\n```").replace(/```(\s*\n*)/g, "```\n\n");
                markdown += content.trim() + "\n\n";
            } else {
                markdown += content.split("\n").map(line => (line.trim() ? line : "")).join("\n") + "\n\n";
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
        else if (this.isSameDay(date, yesterday)) return "Yesterday";
        else return date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    }

    private formatRelativeDate(date: Date): string {
        if (!(date instanceof Date) || isNaN(date.getTime())) { this.plugin.logger.warn("[formatRelativeDate] Invalid Date"); return "Invalid date"; }
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
        return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
    }

    private isSameDay(date1: Date, date2: Date): boolean {
         if (!(date1 instanceof Date) || !(date2 instanceof Date) || isNaN(date1.getTime()) || isNaN(date2.getTime())) return false;
        return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate();
    }

     public destroy(): void {
        this.plugin.logger.debug("[SidebarManager] Destroying...");
        this.containerEl?.remove();
     }
}