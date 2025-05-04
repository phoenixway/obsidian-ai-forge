// src/SidebarManager.ts
import { App, setIcon, Menu, Notice, TFolder, normalizePath, debounce, MenuItem, TAbstractFile } from "obsidian";
import OllamaPlugin from "./main";
import { RoleInfo } from "./ChatManager";
import { ChatMetadata } from "./Chat";
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import * as RendererUtils from "./MessageRendererUtils";
import { Message } from "./types";
import { OllamaView } from "./OllamaView";
import { HierarchyNode, FolderNode, ChatNode } from "./ChatManager";

// --- CSS Classes ---
const CSS_SIDEBAR_CONTAINER = "ollama-sidebar-container";
const CSS_ROLE_PANEL = "ollama-role-panel";
const CSS_CHAT_PANEL = "ollama-chat-panel";
const CSS_ROLE_PANEL_HEADER = "ollama-role-panel-header";
const CSS_ROLE_PANEL_LIST = "ollama-role-panel-list";
const CSS_ROLE_PANEL_ITEM = "ollama-role-panel-item";
const CSS_ROLE_PANEL_ITEM_ICON = "ollama-role-panel-item-icon";
const CSS_ROLE_PANEL_ITEM_TEXT = "ollama-role-panel-item-text";
const CSS_ROLE_PANEL_ITEM_ACTIVE = "is-active"; // Для активних чатів та ролей
const CSS_ROLE_PANEL_ITEM_CUSTOM = "is-custom";
const CSS_ROLE_PANEL_ITEM_NONE = "ollama-role-panel-item-none";

const CSS_CLASS_MENU_OPTION = "menu-option";
const CSS_SIDEBAR_SECTION_HEADER = "ollama-sidebar-section-header";
const CSS_SIDEBAR_SECTION_CONTENT = "ollama-sidebar-section-content";
const CSS_SIDEBAR_SECTION_ICON = "ollama-sidebar-section-icon";
const CSS_SIDEBAR_HEADER_ACTIONS = "ollama-sidebar-header-actions";
const CSS_SIDEBAR_HEADER_BUTTON = "ollama-sidebar-header-button";
const CSS_SIDEBAR_HEADER_LEFT = "ollama-sidebar-header-left";
const CSS_SIDEBAR_SECTION_CONTENT_HIDDEN = "ollama-sidebar-section-content-hidden";
const CSS_EXPANDED_CLASS = "is-expanded";

// Класи для списку чатів/папок
const CSS_CHAT_LIST_CONTAINER = "ollama-chat-list-container";
const CSS_HIERARCHY_ITEM = "ollama-hierarchy-item";
const CSS_FOLDER_ITEM = "ollama-folder-item";
const CSS_CHAT_ITEM = "ollama-chat-item";
const CSS_HIERARCHY_ITEM_CONTENT = "ollama-hierarchy-item-content"; // Ключовий клас для flex
const CSS_HIERARCHY_ITEM_CHILDREN = "ollama-hierarchy-item-children";
const CSS_HIERARCHY_ITEM_COLLAPSED = "is-collapsed";
const CSS_FOLDER_ICON = "ollama-folder-icon"; // Тепер це ЄДИНА іконка для папки/чату на початку
const CSS_HIERARCHY_ITEM_TEXT = "ollama-hierarchy-item-text";
const CSS_CHAT_ITEM_DETAILS = "ollama-chat-item-details";
const CSS_CHAT_ITEM_DATE = "ollama-chat-item-date";
const CSS_HIERARCHY_ITEM_OPTIONS = "ollama-hierarchy-item-options";
const CSS_HIERARCHY_INDENT_PREFIX = "ollama-indent-level-";
const CSS_FOLDER_ACTIVE_ANCESTOR = "is-active-ancestor"; // Клас для папки, що містить активний чат

// Меню та інше
const CSS_CLASS_MENU_SEPARATOR = "menu-separator";

// Іконки
const COLLAPSE_ICON_ROLE = "lucide-folder";
const EXPAND_ICON_ROLE = "lucide-folder-open";
const FOLDER_ICON_CLOSED = "lucide-folder"; // Іконка згорнутої папки
const FOLDER_ICON_OPEN = "lucide-folder-open"; // Іконка розгорнутої папки
const CHAT_ICON = "lucide-message-square"; // Іконка чату
const CHAT_ICON_ACTIVE = "lucide-check"; // Іконка активного чату

export class SidebarManager {
  private plugin: OllamaPlugin;
  private app: App;
  private view: OllamaView;

  private containerEl!: HTMLElement;
  private chatPanelHeaderEl!: HTMLElement;
  private chatPanelListContainerEl!: HTMLElement;
  private newChatSidebarButton!: HTMLElement;
  private newFolderSidebarButton!: HTMLElement;
  private rolePanelHeaderEl!: HTMLElement;
  private rolePanelListEl!: HTMLElement;

  private folderExpansionState: Map<string, boolean> = new Map();

  constructor(plugin: OllamaPlugin, app: App, view: OllamaView) {
    this.plugin = plugin;
    this.app = app;
    this.view = view;
  }

  public createSidebarUI(parentElement: HTMLElement): HTMLElement {
    this.plugin.logger.debug("[SidebarManager] Creating UI...");
    this.containerEl = parentElement.createDiv({ cls: CSS_SIDEBAR_CONTAINER });

    const chatPanel = this.containerEl.createDiv({ cls: CSS_CHAT_PANEL });
    this.chatPanelHeaderEl = chatPanel.createDiv({ cls: [CSS_SIDEBAR_SECTION_HEADER, CSS_CLASS_MENU_OPTION], attr: { "data-section-type": "chats", "data-collapsed": "false" }, });
    const chatHeaderLeft = this.chatPanelHeaderEl.createDiv({ cls: CSS_SIDEBAR_HEADER_LEFT }); setIcon(chatHeaderLeft.createSpan({ cls: CSS_SIDEBAR_SECTION_ICON }), EXPAND_ICON_ROLE); chatHeaderLeft.createSpan({ cls: "menu-option-text", text: "Chats" });
    const headerActions = this.chatPanelHeaderEl.createDiv({ cls: CSS_SIDEBAR_HEADER_ACTIONS });
    this.newFolderSidebarButton = headerActions.createDiv({ cls: [CSS_SIDEBAR_HEADER_BUTTON, "clickable-icon"], attr: { "aria-label": "New Folder", title: "New Folder" }, }); setIcon(this.newFolderSidebarButton, "lucide-folder-plus");
    this.newChatSidebarButton = headerActions.createDiv({ cls: [CSS_SIDEBAR_HEADER_BUTTON, "clickable-icon"], attr: { "aria-label": "New Chat", title: "New Chat" }, }); setIcon(this.newChatSidebarButton, "lucide-plus-circle");
    this.chatPanelListContainerEl = chatPanel.createDiv({ cls: [CSS_CHAT_LIST_CONTAINER, CSS_SIDEBAR_SECTION_CONTENT, CSS_EXPANDED_CLASS], });

    const rolePanel = this.containerEl.createDiv({ cls: CSS_ROLE_PANEL });
    this.rolePanelHeaderEl = rolePanel.createDiv({ cls: [CSS_SIDEBAR_SECTION_HEADER, CSS_CLASS_MENU_OPTION], attr: { "data-section-type": "roles", "data-collapsed": "true" }, });
    const roleHeaderLeft = this.rolePanelHeaderEl.createDiv({ cls: CSS_SIDEBAR_HEADER_LEFT }); setIcon(roleHeaderLeft.createSpan({ cls: CSS_SIDEBAR_SECTION_ICON }), COLLAPSE_ICON_ROLE); roleHeaderLeft.createSpan({ cls: "menu-option-text", text: "Roles" });
    this.rolePanelListEl = rolePanel.createDiv({ cls: [CSS_ROLE_PANEL_LIST, CSS_SIDEBAR_SECTION_CONTENT], });

    this.plugin.logger.debug("[SidebarManager] UI Created.");
    this.attachSidebarEventListeners();
    if (this.isSectionVisible("chats")) { this.updateChatList(); }
    return this.containerEl;
 }

  private attachSidebarEventListeners(): void {
    if (!this.chatPanelHeaderEl || !this.rolePanelHeaderEl || !this.newChatSidebarButton || !this.newFolderSidebarButton) { this.plugin.logger.error("[SidebarManager] Cannot attach listeners: UI elements missing."); return; }
    this.view.registerDomEvent(this.chatPanelHeaderEl, "click", () => this.toggleSection(this.chatPanelHeaderEl));
    this.view.registerDomEvent(this.rolePanelHeaderEl, "click", () => this.toggleSection(this.rolePanelHeaderEl));
    this.view.registerDomEvent(this.newChatSidebarButton, "click", e => { e.stopPropagation(); this.handleNewChatClick(this.plugin.chatManager.chatsFolderPath); });
    this.view.registerDomEvent(this.newFolderSidebarButton, "click", e => { e.stopPropagation(); this.handleNewFolderClick(this.plugin.chatManager.chatsFolderPath); });
    this.plugin.logger.debug("[SidebarManager] Event listeners attached.");
  }

  public isSectionVisible(type: "chats" | "roles"): boolean {
    const headerEl = type === "chats" ? this.chatPanelHeaderEl : this.rolePanelHeaderEl;
    return headerEl?.getAttribute("data-collapsed") === "false";
  }

  public updateChatList = async (): Promise<void> => {
    const container = this.chatPanelListContainerEl;
    if (!container || !this.plugin.chatManager) { this.plugin.logger.debug("[SidebarManager.updateChatList] Skipping: Container/Manager missing."); return; }
    this.plugin.logger.debug(`[SidebarManager.updateChatList] Updating chat list content (visible: ${this.isSectionVisible("chats")})...`);
    const currentScrollTop = container.scrollTop; container.empty();
    try {
        const hierarchy = await this.plugin.chatManager.getChatHierarchy();
        const currentActiveChatId = this.plugin.chatManager.getActiveChatId();
        const activeAncestorPaths = new Set<string>();
        if (currentActiveChatId) {
            const activeChat = await this.plugin.chatManager.getActiveChat();
            if (activeChat?.filePath) {
                let currentPath = activeChat.filePath;
                while (currentPath.includes('/')) {
                    const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
                    if (parentPath === "") { break; } else { const normalizedParentPath = normalizePath(parentPath); activeAncestorPaths.add(normalizedParentPath); currentPath = parentPath; }
                }
                this.plugin.logger.trace("Active ancestor paths:", Array.from(activeAncestorPaths));
            } else if (activeChat) { this.plugin.logger.warn(`Active chat ${currentActiveChatId} has no filePath property.`); }
        }
        if (hierarchy.length === 0) { container.createDiv({ cls: "menu-info-text", text: "No saved chats or folders yet." }); }
        else { hierarchy.forEach(node => this.renderHierarchyNode(node, container, 0, currentActiveChatId, activeAncestorPaths)); }
        this.plugin.logger.debug(`[SidebarManager.updateChatList] Finished rendering hierarchy.`);
    } catch (error) { this.plugin.logger.error("[SidebarManager.updateChatList] Error rendering hierarchy:", error); container.empty(); container.createDiv({ text: "Error loading chat structure.", cls: "menu-error-text" });
    } finally { requestAnimationFrame(() => { if (container?.isConnected) { container.scrollTop = currentScrollTop; } }); }
  };

  
  private renderHierarchyNode(
    node: HierarchyNode,
    parentElement: HTMLElement,
    level: number,
    activeChatId: string | null,
    activeAncestorPaths: Set<string>
): void {
    const itemEl = parentElement.createDiv({ cls: [CSS_HIERARCHY_ITEM, `${CSS_HIERARCHY_INDENT_PREFIX}${level}`] });
    if (node.type === 'folder') { /* ... класи та data-path ... */ }
    else { /* ... класи ... */ }

    const itemContentEl = itemEl.createDiv({ cls: CSS_HIERARCHY_ITEM_CONTENT });

    // --- ТУТ ДОДАЄМО ЛОГУВАННЯ СТРУКТУРИ ---
    try {
        console.log(`--- Rendering Node ---`);
        console.log(`Level: ${level}, Type: ${node.type}`);
        console.log("Item El:", itemEl); // Зовнішній елемент
        console.log("Content El:", itemContentEl); // Внутрішній (має бути flex)

        // Створюємо елементи
        const iconEl = itemContentEl.createSpan({ cls: CSS_FOLDER_ICON });
        if (node.type === 'folder') { setIcon(iconEl, FOLDER_ICON_CLOSED); } // Проста іконка для логу
        else { setIcon(iconEl, CHAT_ICON); }

        const textEl = itemContentEl.createSpan({
             cls: CSS_HIERARCHY_ITEM_TEXT,
             text: node.type === 'folder' ? node.name : node.metadata.name
        });

        // Логуємо дітей після створення
        console.log("Direct children of Content El:", itemContentEl.children);
        console.log("  Child 1 (Icon):", iconEl, iconEl.outerHTML);
        console.log("  Child 2 (Text):", textEl, textEl.outerHTML);

         // ТИМЧАСОВО ПРИБИРАЄМО ІНШІ ЕЛЕМЕНТИ ТА ЛОГІКУ РЕНДЕРУ
         // ... (код для дати, кнопки опцій, контейнера дітей) ...

          // ЗАСТОСУЄМО СТИЛІ НАПРЯМУ для тесту (якщо CSS не працює)
          // itemContentEl.style.display = 'flex';
          // itemContentEl.style.alignItems = 'center';
          // itemContentEl.style.gap = '8px'; // Приклад gap

    } catch (e) {
        console.error("Error during node rendering/logging:", e);
    }
     // --- КІНЕЦЬ ЛОГУВАННЯ ТА СПРОЩЕННЯ ---


    // Обробники подій (залишаємо базові)
    if (node.type === 'folder') {
        this.view.registerDomEvent(itemContentEl, 'click', () => { this.handleToggleFolder(node.path); });
        this.view.registerDomEvent(itemContentEl, 'contextmenu', (e: MouseEvent) => { e.preventDefault(); this.showFolderContextMenu(e, node); });
        itemEl.createDiv({ cls: CSS_HIERARCHY_ITEM_CHILDREN });
    } else {
        this.view.registerDomEvent(itemContentEl, "click", async (e: MouseEvent) => { if (e.target instanceof Element && e.target.closest(`.${CSS_HIERARCHY_ITEM_OPTIONS}`)) { return; } if (node.metadata.id !== activeChatId) { await this.plugin.chatManager.setActiveChat(node.metadata.id); } });
        this.view.registerDomEvent(itemContentEl, "contextmenu", (e: MouseEvent) => { e.preventDefault(); this.showChatContextMenu(e, node.metadata); });
    }
}

  // --- handleToggleFolder без змін ---
  private handleToggleFolder(folderPath: string): void {
    const currentState = this.folderExpansionState.get(folderPath) ?? false;
    const newState = !currentState;
    this.folderExpansionState.set(folderPath, newState);
    this.plugin.logger.debug(`Toggled folder ${folderPath} to ${newState ? 'expanded' : 'collapsed'}`);

    const folderItemEl = this.chatPanelListContainerEl.querySelector<HTMLElement>(`.ollama-folder-item[data-path="${folderPath}"]`);
    if (!folderItemEl) { this.plugin.logger.warn(`Could not find folder element for path: ${folderPath}. Forcing full update.`); this.updateChatList(); return; }

    folderItemEl.classList.toggle(CSS_HIERARCHY_ITEM_COLLAPSED, !newState);

    const folderIconEl = folderItemEl.querySelector<HTMLElement>('.' + CSS_FOLDER_ICON);
    if (folderIconEl) { setIcon(folderIconEl, newState ? FOLDER_ICON_OPEN : FOLDER_ICON_CLOSED); }

    // ВАЖЛИВО: Якщо ви хочете бачити дітей після розгортання в діагностичному режимі,
    // потрібно або повернути рекурсію в renderHierarchyNode, або викликати повне оновлення тут.
    // Для чистоти діагностики макету, краще залишити дітей невидимими.
    // Якщо базовий макет (іконка + текст в рядку) ЗАПРАЦЮЄ, тоді повертайте рекурсію.
    // this.updateChatList(); // Поки що не викликаємо для діагностики
  }

  // --- Решта методів без змін ---
  private showFolderContextMenu(event: MouseEvent | PointerEvent, folderNode: FolderNode): void { event.preventDefault(); event.stopPropagation(); const menu = new Menu(); menu.addItem(item => item.setTitle("New Chat Here").setIcon("lucide-plus-circle").onClick(() => this.handleNewChatClick(folderNode.path))); menu.addItem(item => item.setTitle("New Folder Here").setIcon("lucide-folder-plus").onClick(() => this.handleNewFolderClick(folderNode.path))); menu.addSeparator(); menu.addItem(item => item.setTitle("Rename Folder").setIcon("lucide-pencil").onClick(() => this.handleRenameFolder(folderNode))); menu.addItem(item => { item.setTitle("Delete Folder").setIcon("lucide-trash-2").onClick(() => this.handleDeleteFolder(folderNode)); /* Styling via CSS */ }); menu.showAtMouseEvent(event); }
  public updateRoleList = async (): Promise<void> => { const container = this.rolePanelListEl; if (!container || !this.plugin.chatManager) { this.plugin.logger.debug("[SidebarManager.updateRoleList] Skipping: Container/Manager missing."); return; } this.plugin.logger.debug(`[SidebarManager.updateRoleList] Updating role list content (visible: ${this.isSectionVisible("roles")})...`); const currentScrollTop = container.scrollTop; container.empty(); try { const roles = await this.plugin.listRoleFiles(true); const activeChat = await this.plugin.chatManager.getActiveChat(); const currentRolePath = activeChat?.metadata?.selectedRolePath ?? this.plugin.settings.selectedRolePath; const noneOptionEl = container.createDiv({ cls: [CSS_ROLE_PANEL_ITEM, CSS_ROLE_PANEL_ITEM_NONE, CSS_CLASS_MENU_OPTION] }); const noneIconSpan = noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] }); noneOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: "None" }); setIcon(noneIconSpan, !currentRolePath ? "check" : "slash"); if (!currentRolePath) noneOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE); this.view.registerDomEvent(noneOptionEl, "click", () => this.handleRolePanelItemClick(null, currentRolePath)); roles.forEach(roleInfo => { const roleOptionEl = container.createDiv({ cls: [CSS_ROLE_PANEL_ITEM, CSS_CLASS_MENU_OPTION] }); const iconSpan = roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_ICON, "menu-option-icon"] }); roleOptionEl.createSpan({ cls: [CSS_ROLE_PANEL_ITEM_TEXT, "menu-option-text"], text: roleInfo.name }); if (roleInfo.isCustom) roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_CUSTOM); setIcon(iconSpan, roleInfo.path === currentRolePath ? "check" : roleInfo.isCustom ? "user" : "file-text"); if (roleInfo.path === currentRolePath) roleOptionEl.addClass(CSS_ROLE_PANEL_ITEM_ACTIVE); this.view.registerDomEvent(roleOptionEl, "click", () => this.handleRolePanelItemClick(roleInfo, currentRolePath)); }); this.plugin.logger.debug(`[SidebarManager.updateRoleList] Finished rendering ${roles.length + 1} role items.`); } catch (error) { this.plugin.logger.error("[SidebarManager.updateRoleList] Error rendering:", error); container.empty(); container.createDiv({ text: "Error loading roles.", cls: "menu-error-text" }); } finally { requestAnimationFrame(() => { if (container?.isConnected) { container.scrollTop = currentScrollTop; } }); } };
  private handleRolePanelItemClick = async ( roleInfo: RoleInfo | null, currentRolePath: string | null | undefined ): Promise<void> => { const newRolePath = roleInfo?.path ?? ""; const roleNameForEvent = roleInfo?.name ?? "None"; const normalizedCurrentRolePath = currentRolePath ?? ""; this.plugin.logger.debug(`[SidebarManager] Role item clicked. New path: "${newRolePath}", Current path: "${normalizedCurrentRolePath}"`); if (newRolePath !== normalizedCurrentRolePath) { const activeChat = await this.plugin.chatManager?.getActiveChat(); try { this.plugin.logger.info(`Setting role to: ${roleNameForEvent}`); if (activeChat) { this.plugin.logger.debug(`Updating role for active chat ${activeChat.metadata.id}`); await this.plugin.chatManager.updateActiveChatMetadata({ selectedRolePath: newRolePath || undefined }); } else { this.plugin.logger.debug(`Setting global default role.`); this.plugin.settings.selectedRolePath = newRolePath || undefined; await this.plugin.saveSettings(); this.plugin.emit("role-changed", roleNameForEvent); this.plugin.promptService?.clearRoleCache?.(); } this.updateRoleList(); } catch (error) { this.plugin.logger.error(`[SidebarManager] Error setting role to ${newRolePath}:`, error); new Notice("Failed to set the role."); } } else { this.plugin.logger.debug(`[SidebarManager] Clicked role is already active.`); } };
  private async toggleSection(clickedHeaderEl: HTMLElement): Promise<void> { const sectionType = clickedHeaderEl.getAttribute("data-section-type") as "chats" | "roles"; const isCurrentlyCollapsed = clickedHeaderEl.getAttribute("data-collapsed") === "true"; const iconEl = clickedHeaderEl.querySelector<HTMLElement>(`.${CSS_SIDEBAR_SECTION_ICON}`); const contentEl = sectionType === "chats" ? this.chatPanelListContainerEl : this.rolePanelListEl; const headerActionsEl = clickedHeaderEl.querySelector<HTMLElement>(`.${CSS_SIDEBAR_HEADER_ACTIONS}`); if (!contentEl || !iconEl) { this.plugin.logger.error("Sidebar toggle elements missing:", sectionType); return; } const updateFunction = sectionType === "chats" ? this.updateChatList : this.updateRoleList; const boundUpdateFunction = updateFunction.bind(this); if (isCurrentlyCollapsed) { clickedHeaderEl.setAttribute("data-collapsed", "false"); setIcon(iconEl, EXPAND_ICON_ROLE); contentEl.classList.remove(CSS_SIDEBAR_SECTION_CONTENT_HIDDEN); if (headerActionsEl) headerActionsEl.style.display = ''; try { await boundUpdateFunction(); requestAnimationFrame(() => { if (contentEl?.isConnected && clickedHeaderEl.getAttribute("data-collapsed") === "false") { contentEl.classList.add(CSS_EXPANDED_CLASS); this.plugin.logger.debug(`Expanding sidebar section: ${sectionType}`); } }); } catch (error) { this.plugin.logger.error(`Error updating sidebar section ${sectionType}:`, error); contentEl.setText(`Error loading ${sectionType}.`); requestAnimationFrame(() => { if (contentEl?.isConnected && clickedHeaderEl.getAttribute("data-collapsed") === "false") { contentEl.classList.add(CSS_EXPANDED_CLASS); } }); } } else { this.plugin.logger.debug(`Collapsing sidebar section: ${sectionType}`); clickedHeaderEl.setAttribute("data-collapsed", "true"); setIcon(iconEl, COLLAPSE_ICON_ROLE); contentEl.classList.remove(CSS_EXPANDED_CLASS); contentEl.classList.add(CSS_SIDEBAR_SECTION_CONTENT_HIDDEN); if (headerActionsEl) headerActionsEl.style.display = 'none'; } }
  private handleNewChatClick = async (targetFolderPath?: string): Promise<void> => { const folderPath: string = targetFolderPath ?? this.plugin.chatManager.chatsFolderPath ?? "/"; this.plugin.logger.debug(`[SidebarManager] New Chat button clicked. Target folder: ${folderPath}`); try { const newChat = await this.plugin.chatManager.createNewChat(undefined, folderPath); if (newChat) { new Notice(`Created new chat: ${newChat.metadata.name}`); this.plugin.emit("focus-input-request"); const parentPath = folderPath.substring(0, folderPath.lastIndexOf('/')); if (parentPath && parentPath !== '/') { this.folderExpansionState.set(parentPath, true); } this.updateChatList(); } } catch (error) { this.plugin.logger.error("[SidebarManager] Error creating new chat:", error); new Notice(`Error creating new chat: ${error instanceof Error ? error.message : "Unknown error"}`); } };
  private handleNewFolderClick = async (parentFolderPath?: string): Promise<void> => { const targetParentPath: string = parentFolderPath ?? this.plugin.chatManager.chatsFolderPath ?? "/"; this.plugin.logger.debug(`[SidebarManager] New Folder button clicked. Target parent: ${targetParentPath}`); new PromptModal(this.app, "Create New Folder", "Enter folder name:", "", async newName => { const trimmedName = newName?.trim(); if (!trimmedName) { new Notice("Folder name cannot be empty."); return; } if (/[\\/?:*"<>|]/.test(trimmedName)) { new Notice("Folder name contains invalid characters."); return; } const newFolderPath = normalizePath(targetParentPath === '/' ? trimmedName : `${targetParentPath}/${trimmedName}`); this.plugin.logger.info(`Attempting to create folder: ${newFolderPath}`); try { const success = await this.plugin.chatManager.createFolder(newFolderPath); if (success) { new Notice(`Folder "${trimmedName}" created.`); if (targetParentPath && targetParentPath !== '/') { this.folderExpansionState.set(targetParentPath, true); } this.updateChatList(); } } catch (error) { this.plugin.logger.error(`[SidebarManager] Error creating folder ${newFolderPath}:`, error); new Notice(`Error creating folder: ${error instanceof Error ? error.message : "Unknown error"}`); } }).open(); };
  private handleRenameFolder = async (folderNode: FolderNode): Promise<void> => { this.plugin.logger.debug(`[SidebarManager] Rename requested for folder: ${folderNode.path}`); const currentName = folderNode.name; const parentPath = folderNode.path.substring(0, folderNode.path.lastIndexOf('/')) || "/"; new PromptModal(this.app, "Rename Folder", `New name for "${currentName}":`, currentName, async newName => { const trimmedName = newName?.trim(); if (!trimmedName || trimmedName === currentName) { new Notice(trimmedName === currentName ? "Name unchanged." : "Rename cancelled."); return; } if (/[\\/?:*"<>|]/.test(trimmedName)) { new Notice("Folder name contains invalid characters."); return; } const newFolderPath = normalizePath(parentPath === '/' ? trimmedName : `${parentPath}/${trimmedName}`); this.plugin.logger.info(`Attempting to rename folder ${folderNode.path} to ${newFolderPath}`); try { const exists = await this.app.vault.adapter.exists(newFolderPath); if (exists) { new Notice(`A folder or file named "${trimmedName}" already exists here.`); return; } } catch (e) { this.plugin.logger.warn(`Could not check existence of target rename path ${newFolderPath}:`, e); } try { const success = await this.plugin.chatManager.renameFolder(folderNode.path, newFolderPath); if (success) { new Notice(`Folder renamed to "${trimmedName}".`); if (this.folderExpansionState.has(folderNode.path)) { const wasExpanded = this.folderExpansionState.get(folderNode.path); this.folderExpansionState.delete(folderNode.path); this.folderExpansionState.set(newFolderPath, wasExpanded!); } this.updateChatList(); } } catch (error) { this.plugin.logger.error(`[SidebarManager] Error renaming folder ${folderNode.path} to ${newFolderPath}:`, error); new Notice(`Error renaming folder: ${error instanceof Error ? error.message : "Unknown error"}`); } }).open(); };
  private handleDeleteFolder = async (folderNode: FolderNode): Promise<void> => { this.plugin.logger.debug(`[SidebarManager] Delete requested for folder: ${folderNode.path}`); const folderName = folderNode.name; const folderPath = folderNode.path; if (folderPath === this.plugin.chatManager.chatsFolderPath) { new Notice("Cannot delete the main chat history folder."); return; } new ConfirmModal( this.app, "Delete Folder", `Delete folder "${folderName}" and ALL its contents (subfolders and chats)? This cannot be undone.`, async () => { const notice = new Notice(`Deleting folder "${folderName}"...`, 0); try { const success = await this.plugin.chatManager.deleteFolder(folderPath); if (success) { const keysToDelete = Array.from(this.folderExpansionState.keys()).filter(key => key.startsWith(folderPath)); keysToDelete.forEach(key => this.folderExpansionState.delete(key)); this.updateChatList(); } } catch (error) { this.plugin.logger.error(`[SidebarManager] Error deleting folder ${folderPath}:`, error); new Notice(`Error deleting folder: ${error instanceof Error ? error.message : "Unknown error"}`); } finally { notice.hide(); } } ).open(); };
  private showChatContextMenu(event: MouseEvent | PointerEvent, chatMeta: ChatMetadata): void { event.preventDefault(); event.stopPropagation(); const menu = new Menu(); menu.addItem(item => item.setTitle("Clone Chat").setIcon("lucide-copy-plus").onClick(() => this.handleContextMenuClone(chatMeta.id))); menu.addItem(item => item.setTitle("Rename Chat").setIcon("lucide-pencil").onClick(() => this.handleContextMenuRename(chatMeta.id, chatMeta.name))); menu.addItem(item => item.setTitle("Export to Note").setIcon("lucide-download").onClick(() => this.exportSpecificChat(chatMeta.id))); menu.addSeparator(); menu.addItem(item => { item.setTitle("Clear Messages").setIcon("lucide-trash").onClick(() => this.handleContextMenuClear(chatMeta.id, chatMeta.name)); /* Styling via CSS */ }); menu.addItem(item => { item.setTitle("Delete Chat").setIcon("lucide-trash-2").onClick(() => this.handleContextMenuDelete(chatMeta.id, chatMeta.name)); /* Styling via CSS */ }); menu.showAtMouseEvent(event); }
  private async handleContextMenuClone(chatId: string): Promise<void> { this.plugin.logger.info(`[SidebarManager Context] Clone requested for chat ${chatId}`); const notice = new Notice("Cloning chat...", 0); try { const c = await this.plugin.chatManager.cloneChat(chatId); if (c) { new Notice(`Chat cloned as "${c.metadata.name}"`); this.updateChatList(); this.plugin.emit("focus-input-request"); } } catch (e) { this.plugin.logger.error(`Clone error:`, e); } finally { notice.hide(); } }
  private async handleContextMenuRename(chatId: string, currentName: string): Promise<void> { this.plugin.logger.info(`[SidebarManager Context] Rename requested for chat ${chatId}`); new PromptModal(this.app, "Rename Chat", `New name for "${currentName}":`, currentName, async newName => { const trimmedName = newName?.trim(); if (!trimmedName || trimmedName === currentName) { new Notice(trimmedName === currentName ? `Name unchanged.` : `Rename cancelled.`); } else if (/[\\/?:*"<>|]/.test(trimmedName)) { new Notice("Chat name contains invalid characters."); } else { const success = await this.plugin.chatManager.renameChat(chatId, trimmedName); if (success) { this.updateChatList(); } } this.plugin.emit("focus-input-request"); }).open(); }
  private async exportSpecificChat(chatId: string): Promise<void> { this.plugin.logger.info(`[SidebarManager Context] Export requested for chat ${chatId}`); const notice = new Notice(`Exporting chat...`, 0); try { const chat = await this.plugin.chatManager.getChat(chatId); if (!chat || chat.messages.length === 0) { new Notice("Chat is empty or not found, nothing to export."); notice.hide(); return; } const md = this.formatChatToMarkdown(chat.messages, chat.metadata); const ts = new Date().toISOString().replace(/[:.]/g, "-"); const safeName = chat.metadata.name.replace(/[\\/?:*"<>|]/g, "-"); const filename = `ollama-chat-${safeName}-${ts}.md`; let fPath = this.plugin.settings.chatExportFolderPath?.trim(); let fFolder: TFolder | null = null; if (fPath) { fPath = normalizePath(fPath); const af = this.app.vault.getAbstractFileByPath(fPath); if (!af) { try { await this.app.vault.createFolder(fPath); const newAf = this.app.vault.getAbstractFileByPath(fPath); if (newAf instanceof TFolder) { fFolder = newAf; new Notice(`Created export folder: ${fPath}`); } else { throw new Error("Failed to get created folder."); } } catch (err) { this.plugin.logger.error("Folder creation error during export:", err); new Notice(`Export folder error. Saving to vault root.`); fFolder = this.app.vault.getRoot(); } } else if (af instanceof TFolder) { fFolder = af; } else { new Notice(`Export path is not a folder. Saving to vault root.`); fFolder = this.app.vault.getRoot(); } } else { fFolder = this.app.vault.getRoot(); } if (!fFolder) { this.plugin.logger.error("Target folder for export could not be determined."); new Notice("Export folder error."); notice.hide(); return; } const filePath = normalizePath(`${fFolder.path}/${filename}`); const file = await this.app.vault.create(filePath, md); new Notice(`Chat exported to ${file.path}`); } catch (e) { this.plugin.logger.error(`Chat export error:`, e); new Notice("Chat export failed."); } finally { notice.hide(); } }
  private async handleContextMenuClear(chatId: string, chatName: string): Promise<void> { this.plugin.logger.debug(`[SidebarManager Context] Clear requested for chat ${chatId}`); new ConfirmModal(this.app, "Clear Messages", `Clear all messages in "${chatName}"?`, async () => { const notice = new Notice("Clearing messages...", 0); try { const success = await this.plugin.chatManager.clearChatMessagesById(chatId); } catch (e) { this.plugin.logger.error(`Clear messages error:`, e); new Notice("Failed to clear messages."); } finally { notice.hide(); } }).open(); }
  private async handleContextMenuDelete(chatId: string, chatName: string): Promise<void> { this.plugin.logger.debug(`[SidebarManager Context] Delete requested for chat ${chatId}`); new ConfirmModal(this.app, "Delete Chat", `Delete chat "${chatName}"? This cannot be undone.`, async () => { const notice = new Notice("Deleting chat...", 0); try { const success = await this.plugin.chatManager.deleteChat(chatId); } catch (e) { this.plugin.logger.error(`Delete chat error:`, e); new Notice("Failed to delete chat."); } finally { notice.hide(); } }).open(); }
  private formatChatToMarkdown(messagesToFormat: Message[], metadata: ChatMetadata): string { let localLastDate: Date | null = null; const exportTimestamp = new Date(); let markdown = `# AI Forge Chat: ${metadata.name}\n\n`; markdown += `* **Chat ID:** ${metadata.id}\n`; markdown += `* **Model:** ${metadata.modelName || "Default"}\n`; markdown += `* **Role Path:** ${metadata.selectedRolePath || "None"}\n`; markdown += `* **Temperature:** ${metadata.temperature ?? this.plugin.settings.temperature}\n`; markdown += `* **Created:** ${new Date(metadata.createdAt).toLocaleString()}\n`; markdown += `* **Last Modified:** ${new Date(metadata.lastModified).toLocaleString()}\n`; markdown += `* **Exported:** ${exportTimestamp.toLocaleString()}\n\n`; markdown += `***\n\n`; messagesToFormat.forEach(message => { if (!message || !message.content?.trim() || !message.timestamp) { this.plugin.logger.warn("[formatChatToMarkdown] Skipping invalid message:", message); return; } let messageTimestamp: Date; if (typeof message.timestamp === 'string') { messageTimestamp = new Date(message.timestamp); } else if (message.timestamp instanceof Date) { messageTimestamp = message.timestamp; } else { this.plugin.logger.warn("[formatChatToMarkdown] Invalid timestamp type in message:", message); return; } if (isNaN(messageTimestamp.getTime())) { this.plugin.logger.warn("[formatChatToMarkdown] Invalid timestamp value in message:", message); return; } if (localLastDate === null || !this.isSameDay(localLastDate, messageTimestamp)) { if (localLastDate !== null) markdown += `***\n\n`; markdown += `**${this.formatDateSeparator(messageTimestamp)}**\n***\n\n`; localLastDate = messageTimestamp; } const time = this.formatTime(messageTimestamp); let prefix = ""; let contentPrefix = ""; let content = message.content.trim(); if (message.role === "assistant") { try { content = RendererUtils.decodeHtmlEntities(content); if (RendererUtils.detectThinkingTags(content).hasThinkingTags) { content = content.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim(); content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim(); } } catch (e) { this.plugin.logger.warn("Error processing assistant content for export:", e); } if (!content) return; } switch (message.role) { case "user": prefix = `**User (${time}):**\n`; break; case "assistant": prefix = `**Assistant (${time}):**\n`; break; case "system": prefix = `> _[System (${time})]_ \n> `; contentPrefix = "> "; break; case "error": prefix = `> [!ERROR] Error (${time}):\n> `; contentPrefix = "> "; break; default: this.plugin.logger.warn(`[formatChatToMarkdown] Unknown message role: ${message.role}`); prefix = `**${message.role} (${time}):**\n`; break; } markdown += prefix; if (contentPrefix) { markdown += content.split("\n").map((line: string) => (line.trim() ? `${contentPrefix}${line}` : contentPrefix.trim())).join(`\n`) + "\n\n"; } else if (content.includes("```")) { content = content.replace(/(\r?\n)*```/g, "\n\n```").replace(/```(\r?\n)*/g, "```\n\n").trim(); markdown += content + "\n\n"; } else { markdown += content.split("\n").map((line: string) => line.trim() ? line : "").join("\n") + "\n\n"; } }); return markdown.trim(); }
  private formatTime(date: Date): string { if (!(date instanceof Date) || isNaN(date.getTime())) return "??:??"; return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: false }); }
  private formatDateSeparator(date: Date): string { if (!(date instanceof Date) || isNaN(date.getTime())) return "Unknown Date"; const now = new Date(); const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1); if (this.isSameDay(date, now)) return "Today"; if (this.isSameDay(date, yesterday)) return "Yesterday"; const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const startOfGivenDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()); const diffDays = Math.floor((startOfToday.getTime() - startOfGivenDate.getTime()) / (1000 * 60 * 60 * 24)); if (diffDays > 1 && diffDays < 7) { return date.toLocaleDateString(undefined, { weekday: 'long' }); } return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
  private formatRelativeDate(date: Date): string { if (!(date instanceof Date) || isNaN(date.getTime())) { this.plugin.logger.warn("[formatRelativeDate] Invalid Date received"); return "Invalid date"; } const now = new Date(); const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000); const diffMinutes = Math.floor(diffSeconds / 60); const diffHours = Math.floor(diffMinutes / 60); const diffDays = Math.floor(diffHours / 24); if (diffSeconds < 5) return "Just now"; if (diffSeconds < 60) return `${diffSeconds}s ago`; if (diffMinutes < 60) return `${diffMinutes}m ago`; if (diffHours < 2) return `1h ago`; if (diffHours < 24) return `${diffHours}h ago`; if (diffDays === 1) return "Yesterday"; if (diffDays < 7) return `${diffDays}d ago`; return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined }); }
  private isSameDay(date1: Date, date2: Date): boolean { if (!(date1 instanceof Date) || !(date2 instanceof Date) || isNaN(date1.getTime()) || isNaN(date2.getTime())) return false; return ( date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate() ); }
  public destroy(): void { this.plugin.logger.debug("[SidebarManager] Destroying..."); this.containerEl?.remove(); this.folderExpansionState.clear(); }

} // End of SidebarManager class