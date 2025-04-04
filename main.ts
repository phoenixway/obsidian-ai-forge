// main.ts
import {
  Plugin,
  WorkspaceLeaf,
  Notice,
  normalizePath,
  TFile,
  TFolder,
  DataAdapter, // Потрібен для типів адаптера
  debounce, // Потрібен для debounce
  SuggestModal, // Потенційно для майбутньої реалізації
  FuzzySuggestModal // Потенційно для майбутньої реалізації
} from "obsidian";
import { OllamaView, VIEW_TYPE_OLLAMA, Message, MessageRole } from "./OllamaView";
import { OllamaSettingTab, DEFAULT_SETTINGS, OllamaPluginSettings } from "./settings";
import { RagService } from "./ragService";
import { OllamaService } from "./OllamaService"; // Перейменований ApiService
import { PromptService } from './PromptService';
import { ChatManager } from "./ChatManager"; // Новий клас
import { Chat, ChatMetadata } from "./Chat"; // Імпортуємо Chat та його типи
import { RoleInfo } from "./ChatManager"; // Або звідки ви його імпортували
import { exec, ExecException } from 'child_process';
import * as path from 'path';

// --- КОНСТАНТИ ДЛЯ ЗБЕРЕЖЕННЯ ---
const SESSIONS_INDEX_KEY = 'chatSessionsIndex_v1';
const ACTIVE_SESSION_ID_KEY = 'activeChatSessionId_v1';
// ----------------------------------

// Інтерфейси
interface RAGDocument { id: string; content: string; metadata: { source: string; path: string; }; }
interface Embedding { documentId: string; vector: number[]; }
// RoleInfo вже імпортовано або визначено в ChatManager

export default class OllamaPlugin extends Plugin {
  settings: OllamaPluginSettings;
  settingTab: OllamaSettingTab;
  view: OllamaView | null = null;

  // Сервіси та Менеджер
  ragService!: RagService;
  ollamaService!: OllamaService;
  promptService!: PromptService;
  chatManager!: ChatManager; // Немає this.sessionIndex або this.activeChatId тут

  // Події та кеш
  private eventHandlers: Record<string, Array<(data: any) => any>> = {};
  private roleListCache: RoleInfo[] | null = null;
  private roleCacheClearTimeout: NodeJS.Timeout | null = null;
  private indexUpdateTimeout: NodeJS.Timeout | null = null;

  // RAG data (приклад)
  documents: RAGDocument[] = [];
  embeddings: Embedding[] = [];

  // --- Event Emitter Methods ---
  on(event: string, callback: (data: any) => any): () => void { if (!this.eventHandlers[event]) this.eventHandlers[event] = []; this.eventHandlers[event].push(callback); return () => { this.eventHandlers[event] = this.eventHandlers[event]?.filter(h => h !== callback); if (this.eventHandlers[event]?.length === 0) { delete this.eventHandlers[event]; } }; }
  emit(event: string, data?: any): void { const h = this.eventHandlers[event]; if (h) h.slice().forEach(handler => { try { handler(data); } catch (e) { console.error(`[OllamaPlugin] Error in event handler for ${event}:`, e); } }); }


  async onload() {
    console.log("Loading Ollama Plugin (MVC Arch)...");
    await this.loadSettings();

    // Ініціалізація (порядок може бути важливим)
    this.ollamaService = new OllamaService(this);
    this.promptService = new PromptService(this);
    this.ragService = new RagService(this);
    this.chatManager = new ChatManager(this); // Ініціалізуємо ChatManager

    await this.chatManager.initialize(); // ChatManager завантажує індекс та активний ID

    // Реєстрація View
    this.registerView(VIEW_TYPE_OLLAMA, (leaf) => { console.log("OllamaPlugin: Registering view."); this.view = new OllamaView(leaf, this); /* Removed setOllamaViewRef */ return this.view; });

    // Обробник помилок з'єднання (з OllamaService)
    this.ollamaService.on('connection-error', (error) => { console.error("[OllamaPlugin] Connection error event:", error); this.emit('ollama-connection-error', error.message); if (!this.view) { new Notice(`Failed to connect to Ollama: ${error.message}`); } });

    // --- Реєстрація обробників подій ---
    this.register(this.on('ollama-connection-error', (message) => { this.view?.addMessageToDisplay?.('error', message, new Date()); }));
    this.register(this.on('active-chat-changed', this.handleActiveChatChangedLocally)); // Локальний обробник для оновлення settings
    // Видалено непотрібні проміжні обробники, View слухає напряму
    this.register(this.on('chat-list-updated', () => {
      console.log("[OllamaPlugin] Event 'chat-list-updated' received.");
      // Немає потреби викликати методи View звідси.
      // View оновить своє меню, коли воно буде відкрито наступного разу,
      // або якщо змінився активний чат (через подію 'active-chat-changed').
    }));
    this.register(this.on('settings-updated', () => {
      console.log("[OllamaPlugin] Event 'settings-updated' received.");
      // Немає потреби викликати методи View звідси.
      // View оновить меню при відкритті. Зміна URL/папки ролей обробляється інакше.
    }));
    // this.register(this.on('roles-updated', () => { if (this.view?.isMenuOpen()) { this.view?.renderRoleList(); } }));
    // Ці події обробляються напряму в View
    // this.register(this.on('model-changed', (modelName) => { this.view?.handleModelChange?.(modelName); }));
    // this.register(this.on('role-changed', (roleName) => { this.view?.handleRoleChange?.(roleName); }));
    // this.register(this.on('message-added', (data) => { this.view?.handleMessageAdded?.(data); }));
    // this.register(this.on('messages-cleared', (chatId) => { this.view?.handleMessagesCleared?.(chatId); }));


    // Ribbon & Commands
    this.addRibbonIcon("message-square", "Open Ollama Chat", () => { this.activateView(); });
    this.addCommand({ id: "open-ollama-view", name: "Open Ollama Chat", callback: () => { this.activateView(); }, });
    this.addCommand({ id: "index-rag-documents", name: "Index documents for RAG", callback: async () => { await this.ragService.indexDocuments(); }, });
    this.addCommand({ id: "clear-ollama-history", name: "Clear Active Chat History", callback: async () => { await this.chatManager.clearActiveChatMessages(); }, });
    this.addCommand({ id: "refresh-ollama-roles", name: "Refresh Ollama Roles List", callback: async () => { await this.listRoleFiles(true); this.emit('roles-updated'); new Notice("Role list refreshed."); } });
    this.addCommand({ id: "ollama-new-chat", name: "Ollama: New Chat", callback: async () => { const newChat = await this.chatManager.createNewChat(); if (newChat) { await this.activateView(); new Notice(`Created new chat: ${newChat.metadata.name}`); } } });
    this.addCommand({ id: "ollama-switch-chat", name: "Ollama: Switch Chat", callback: async () => { await this.showChatSwitcher(); } }); // Потребує UI
    this.addCommand({ id: "ollama-rename-chat", name: "Ollama: Rename Active Chat", callback: async () => { await this.renameActiveChat(); } });
    this.addCommand({ id: "ollama-delete-chat", name: "Ollama: Delete Active Chat", callback: async () => { await this.deleteActiveChatWithConfirmation(); } });

    // Settings Tab
    this.settingTab = new OllamaSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    // Layout Ready
    this.app.workspace.onLayoutReady(async () => { if (this.settings.ragEnabled) { setTimeout(() => { this.ragService?.indexDocuments(); }, 5000); } });

    // File Watcher Setup
    const debouncedRoleClear = debounce(() => { console.log("[Ollama] Role change detected, clearing cache & emitting."); this.roleListCache = null; this.emit('roles-updated'); }, 1500, true);
    const fileChangeHandler = (file: TFile | TFolder | null) => { if (!file) return; this.handleFileChange(file.path, debouncedRoleClear); };
    const handleModify = (file: TFile) => fileChangeHandler(file);
    const handleDelete = (file: TFile | TFolder) => fileChangeHandler(file);
    const handleRename = (file: TFile | TFolder, oldPath: string) => { fileChangeHandler(file); this.handleFileChange(oldPath, debouncedRoleClear); };
    const handleCreate = (file: TFile | TFolder) => fileChangeHandler(file);
    this.registerEvent(this.app.vault.on("modify", handleModify)); this.registerEvent(this.app.vault.on("delete", handleDelete)); this.registerEvent(this.app.vault.on("rename", handleRename)); this.registerEvent(this.app.vault.on("create", handleCreate));
  }

  // File Change Handler
  private handleFileChange(changedPath: string, debouncedRoleClear: () => void) { const normPath = normalizePath(changedPath); const userR = this.settings.userRolesFolderPath ? normalizePath(this.settings.userRolesFolderPath) : null; const defaultR = normalizePath(this.manifest.dir + '/roles'); if (((userR && normPath.startsWith(userR + '/')) || normPath.startsWith(defaultR + '/')) && normPath.toLowerCase().endsWith('.md')) { debouncedRoleClear(); } const ragF = this.settings.ragFolderPath ? normalizePath(this.settings.ragFolderPath) : null; if (this.settings.ragEnabled && ragF && normPath.startsWith(ragF + '/')) { this.debounceIndexUpdate(); } }

  onunload() { console.log("Unloading Ollama Plugin..."); this.app.workspace.getLeavesOfType(VIEW_TYPE_OLLAMA).forEach(l => l.detach()); if (this.indexUpdateTimeout) clearTimeout(this.indexUpdateTimeout); if (this.roleCacheClearTimeout) clearTimeout(this.roleCacheClearTimeout); this.promptService?.clearModelDetailsCache?.(); this.promptService?.clearRoleCache?.(); this.roleListCache = null; }

  updateOllamaServiceConfig() { if (this.ollamaService) { console.log("[OllamaPlugin] Settings changed, clearing model cache."); this.promptService?.clearModelDetailsCache(); } }

  private debounceIndexUpdate() { if (this.indexUpdateTimeout) clearTimeout(this.indexUpdateTimeout); this.indexUpdateTimeout = setTimeout(() => { console.log("RAG index update."); this.ragService?.indexDocuments(); this.indexUpdateTimeout = null; }, 30000); }

  async activateView() { const { workspace: e } = this.app; let l: WorkspaceLeaf | null = null; const s = e.getLeavesOfType(VIEW_TYPE_OLLAMA); s.length > 0 ? l = s[0] : (l = e.getRightLeaf(!1) ?? e.getLeaf(!0), l && await l.setViewState({ type: VIEW_TYPE_OLLAMA, active: !0 })); if (l) { e.revealLeaf(l); const v = l.view; if (v instanceof OllamaView) { this.view = v; console.log("View activated."); } else { console.error("View not OllamaView?"); } } else console.error("Failed leaf create."); }

  async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); if ((this.settings as any).customRoleFilePath !== undefined && this.settings.selectedRolePath === undefined) { console.log("[Ollama] Migrating 'customRoleFilePath'->'selectedRolePath'."); this.settings.selectedRolePath = (this.settings as any).customRoleFilePath || ""; } delete (this.settings as any).customRoleFilePath; delete (this.settings as any).useDefaultRoleDefinition; }
  async saveSettings() { delete (this.settings as any).customRoleFilePath; delete (this.settings as any).useDefaultRoleDefinition; await this.saveData(this.settings); this.updateOllamaServiceConfig(); this.roleListCache = null; this.promptService?.clearRoleCache?.(); console.log("OllamaPlugin: Settings saved."); this.emit('settings-updated'); }

  // Data Helpers
  async saveDataKey(key: string, value: any): Promise<void> { const d = await this.loadData() || {}; d[key] = value; await this.saveData(d); }
  async loadDataKey(key: string): Promise<any> { const d = await this.loadData() || {}; return d[key]; }

  // History Persistence (Delegated)
  async clearMessageHistory() { console.log("[OllamaPlugin] Clearing active chat via ChatManager."); if (this.chatManager) { await this.chatManager.clearActiveChatMessages(); } else { console.error("ChatManager not ready."); new Notice("Error: Chat Manager not ready."); } }

  // List Role Files Method
  async listRoleFiles(forceRefresh: boolean = false): Promise<RoleInfo[]> { if (this.roleListCache && !forceRefresh) return this.roleListCache; console.log("[Ollama] Fetching roles..."); const r: RoleInfo[] = []; const a = this.app.vault.adapter; const d = normalizePath(this.manifest.dir + '/roles'); try { if (await a.exists(d) && (await a.stat(d))?.type === 'folder') { const f = await a.list(d); for (const p of f.files) { if (p.toLowerCase().endsWith('.md')) { const fn = path.basename(p); const n = fn.substring(0, fn.length - 3); r.push({ name: n, path: p, isCustom: false }); } } } } catch (e) { console.error("Err list default roles:", e); } const u = this.settings.userRolesFolderPath?.trim(); if (u) { const nd = normalizePath(u); try { if (await a.exists(nd) && (await a.stat(nd))?.type === 'folder') { const f = await a.list(nd); const names = new Set(r.map(x => x.name)); for (const p of f.files) { if (p.toLowerCase().endsWith('.md')) { const fn = path.basename(p); const n = fn.substring(0, fn.length - 3); if (!names.has(n)) { r.push({ name: n, path: p, isCustom: true }); names.add(n); } } } } } catch (e) { console.error("Err list user roles:", e); } } r.sort((a, b) => a.name.localeCompare(b.name)); this.roleListCache = r; console.log(`Found ${r.length} roles.`); return r; }

  // Execute System Command Method
  async executeSystemCommand(command: string): Promise<{ stdout: string; stderr: string; error: ExecException | null }> {
    console.log(`Executing: ${command}`); if (!command?.trim()) { return { stdout: "", stderr: "Empty cmd.", error: new Error("Empty cmd") as ExecException }; }//@ts-ignore
    if (typeof process === 'undefined' || !process?.versions?.node) { console.error("Node.js required."); new Notice("Cannot exec."); return { stdout: "", stderr: "Node.js required.", error: new Error("Node.js required") as ExecException }; } return new Promise(r => { exec(command, (e, o, s) => { if (e) console.error(`Exec error: ${e}`); if (s) console.error(`Exec stderr: ${s}`); if (o) console.log(`Exec stdout: ${o}`); r({ stdout: o.toString(), stderr: s.toString(), error: e }); }); });
  }

  // --- Session Management Command Helpers ---
  async showChatSwitcher() { /* ... */ new Notice("Switch Chat UI not implemented."); }
  async renameActiveChat() { /* ... */ const c = await this.chatManager?.getActiveChat(); if (!c) { new Notice("No active chat."); return; } const o = c.metadata.name; const n = prompt(`Enter new name for "${o}":`, o); if (n && n.trim() !== "" && n !== o) { await this.chatManager.renameChat(c.metadata.id, n); } }
  async deleteActiveChatWithConfirmation() { /* ... */ const c = await this.chatManager?.getActiveChat(); if (!c) { new Notice("No active chat."); return; } if (confirm(`Delete chat "${c.metadata.name}"?`)) { await this.chatManager.deleteChat(c.metadata.id); } }

  // --- Handler for active chat change (Updates global settings) ---
  private async handleActiveChatChangedLocally(data: { chatId: string | null, chat: Chat | null }) {
    console.log(`[OllamaPlugin] Handling active-chat-changed. ID: ${data.chatId}`);
    const chat = data.chat; // Отримуємо об'єкт чату з події

    if (chat) {
      let settingsChanged = false;
      // Синхронізуємо глобальні налаштування з налаштуваннями активного чату
      if (this.settings.modelName !== chat.metadata.modelName) {
        this.settings.modelName = chat.metadata.modelName;
        settingsChanged = true;
        this.emit('model-changed', chat.metadata.modelName);
      }
      if (this.settings.selectedRolePath !== chat.metadata.selectedRolePath) {
        this.settings.selectedRolePath = chat.metadata.selectedRolePath;
        settingsChanged = true;
        const roleName = this.findRoleNameByPath(chat.metadata.selectedRolePath);
        this.emit('role-changed', roleName);
      }
      if (this.settings.temperature !== chat.metadata.temperature) {
        this.settings.temperature = chat.metadata.temperature;
        settingsChanged = true;
      }

      // Зберігаємо глобальні налаштування, якщо вони змінилися
      if (settingsChanged) {
        await this.saveSettings();
        console.log("[OllamaPlugin] Global settings updated to match active chat.");
      }

      // --- ПЕРЕВІРТЕ ЦЕЙ БЛОК ---
      // Оновлюємо системний промпт в PromptService на основі РОЛІ АКТИВНОГО ЧАТУ
      const rolePathToLoad = chat.metadata.selectedRolePath; // Беремо шлях з метаданих чату
      // Викликаємо getRoleDefinition З АРГУМЕНТОМ rolePathToLoad
      const roleContent = await this.promptService.getRoleDefinition(rolePathToLoad);
      this.promptService.setSystemPrompt(roleContent); // Встановлюємо промпт
      // --- КІНЕЦЬ БЛОКУ ПЕРЕВІРКИ ---
      console.log(`[OllamaPlugin] System prompt updated for active chat. Role path: ${rolePathToLoad || 'None'}`);

    } else { // Немає активного чату
      this.promptService.setSystemPrompt(null); // Очищаємо системний промпт
      console.log("[OllamaPlugin] Active chat is null, prompt service reset.");
      // Повертати глобальні налаштування до дефолтних тут, мабуть, не варто
    }
  }


  // Helper to find role name for event emitting
  findRoleNameByPath(rolePath: string): string { if (!rolePath) return "Default Assistant"; const r = this.roleListCache?.find(rl => rl.path === rolePath); if (r) return r.name; try { return path.basename(rolePath, '.md'); } catch { return "Unknown Role"; } }

} // End of OllamaPlugin class