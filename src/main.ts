import {
	Plugin,
	WorkspaceLeaf,
	Notice,
	normalizePath,
	TFile,
	TFolder,
	TAbstractFile,
	DataAdapter,
	debounce,
	SuggestModal,
	FuzzySuggestModal,
	EventRef, // Імпортуємо EventRef
} from "obsidian";
import {
	OllamaView,
	VIEW_TYPE_OLLAMA_PERSONAS,
	Message,
	MessageRole,
} from "./OllamaView";
import {
	OllamaSettingTab,
	DEFAULT_SETTINGS,
	OllamaPluginSettings,
} from "./settings";
import { RagService } from "./ragService";
import { OllamaService } from "./OllamaService";
import { PromptService } from "./PromptService";
import { ChatManager } from "./ChatManager";
import { Chat, ChatMetadata } from "./Chat";
import { RoleInfo } from "./ChatManager";
import { exec, ExecException } from "child_process";
import { TranslationService } from "./TranslationService";
import { PromptModal } from "./PromptModal";
import { ConfirmModal } from "./ConfirmModal";
import { Logger, LogLevel, LoggerSettings } from "./Logger";

// --- КОНСТАНТИ ДЛЯ ЗБЕРЕЖЕННЯ ---
const SESSIONS_INDEX_KEY_V1 = "chatSessionsIndex_v1";
const ACTIVE_SESSION_ID_KEY_V1 = "activeChatSessionId_v1";
export const SESSIONS_INDEX_KEY = "chatIndex_v2";
export const ACTIVE_CHAT_ID_KEY = "activeChatId_v2";
export const CHAT_INDEX_KEY = "chatIndex_v2";
// ----------------------------------

interface RAGDocument {
	id: string;
	content: string;
	metadata: { source: string; path: string };
}
interface Embedding {
	documentId: string;
	vector: number[];
}

export default class OllamaPlugin extends Plugin {
	settings: OllamaPluginSettings;
	settingTab: OllamaSettingTab;
	view: OllamaView | null = null;

	ragService!: RagService;
	ollamaService!: OllamaService;
	promptService!: PromptService;
	chatManager!: ChatManager;
	translationService!: TranslationService;
	logger!: Logger;

	private eventHandlers: Record<string, Array<(data: any) => any>> = {};
	private roleListCache: RoleInfo[] | null = null;
	private roleCacheClearTimeout: NodeJS.Timeout | null = null;
	private indexUpdateTimeout: NodeJS.Timeout | null = null;
	private fileChangeHandlerDebounced: (file: TAbstractFile) => void; // Змінено тип

	private dailyTaskFilePath: string | null = null;
	private taskFileContentCache: string | null = null;
	private taskFileNeedsUpdate: boolean = false;
	private taskCheckInterval: NodeJS.Timeout | null = null;

	// --- Event Emitter Methods (зроблено public) ---
	public on(event: string, callback: (data: any) => any): () => void {
		if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
		this.eventHandlers[event].push(callback);
		return () => {
			this.eventHandlers[event] = this.eventHandlers[event]?.filter(
				(h) => h !== callback
			);
			if (this.eventHandlers[event]?.length === 0) {
				delete this.eventHandlers[event];
			}
		};
	}

	public emit(event: string, data?: any): void {
		// Зроблено public
		const handlers = this.eventHandlers[event];
		// --- ВИПРАВЛЕННЯ: Використовуємо handlers замість h ---
		if (handlers) {
			handlers.slice().forEach((handler) => {
				try {
					handler(data);
				} catch (e) {
					this.logger.error(
						`[OllamaPlugin] Error in event handler for ${event}:`,
						e
					);
				} // Використовуємо логер
			});
		}
	}
	// --------------------------

	public isTaskFileUpdated(): boolean {
		return this.taskFileNeedsUpdate;
	}

	async onload() {
		const initialSettingsData = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		); // Завантажуємо дані для логера

		// --- ТЕПЕР ініціалізуємо Логер ---
		const loggerSettings: LoggerSettings = {
			consoleLogLevel:
				process.env.NODE_ENV === "production"
					? initialSettingsData.consoleLogLevel || "INFO"
					: "DEBUG", // Використовуємо initialSettingsData
			fileLoggingEnabled: initialSettingsData.fileLoggingEnabled,
			fileLogLevel: initialSettingsData.fileLogLevel,
			logCallerInfo: initialSettingsData.logCallerInfo,
			logFilePath: initialSettingsData.logFilePath,
			logFileMaxSizeMB: initialSettingsData.logFileMaxSizeMB,
		};
		// Створюємо екземпляр логера
		this.logger = new Logger(this, loggerSettings);
		this.logger.info("Logger initialized."); // Тепер це безпечно

		await this.loadSettingsAndMigrate();

		this.promptService = new PromptService(this);
		this.ollamaService = new OllamaService(this);
		this.translationService = new TranslationService(this);
		this.ragService = new RagService(this);
		this.chatManager = new ChatManager(this);
		this.logger.info("Services initialized.");

		await this.chatManager.initialize();

		this.logger.updateSettings({
			consoleLogLevel: this.settings.consoleLogLevel,
			fileLoggingEnabled: this.settings.fileLoggingEnabled,
			fileLogLevel: this.settings.fileLogLevel,
			logCallerInfo: this.settings.logCallerInfo,
			logFilePath: this.settings.logFilePath,
			logFileMaxSizeMB: this.settings.logFileMaxSizeMB,
		});

		this.registerView(VIEW_TYPE_OLLAMA_PERSONAS, (leaf) => {
			this.logger.debug("Registering AI Forge view.");
			this.view = new OllamaView(leaf, this);
			return this.view;
		});

		this.ollamaService.on("connection-error", (error) => {
			this.logger.error(
				"[Plugin] Connection error event received:",
				error
			);
			this.emit(
				"ollama-connection-error",
				error.message || "Unknown connection error"
			);
		});

		// Реєстрація обробників подій плагіна
		// --- ВИПРАВЛЕННЯ: Використовуємо this.on і тип message ---
		this.register(
			this.on("ollama-connection-error", (message: string) => {
				this.view?.addMessageToDisplay?.("error", message, new Date());
			})
		);
		this.register(
			this.on(
				"active-chat-changed",
				this.handleActiveChatChangedLocally.bind(this)
			)
		);
		this.register(
			this.on("chat-list-updated", () => {
				this.logger.debug(
					"[Plugin] Event 'chat-list-updated' received."
				);
				// --- ВИПРАВЛЕННЯ: Робимо renderChatListMenu публічним в OllamaView ---
				this.view?.renderChatListMenu?.();
			})
		);
		this.register(
			this.on("settings-updated", () => {
				this.logger.info("[Plugin] Event 'settings-updated' received.");
				this.logger.updateSettings({
					/* ... передаємо об'єкт LoggerSettings ... */
					consoleLogLevel: this.settings.consoleLogLevel,
					fileLoggingEnabled: this.settings.fileLoggingEnabled,
					fileLogLevel: this.settings.fileLogLevel,
					logCallerInfo: this.settings.logCallerInfo,
					logFilePath: this.settings.logFilePath,
					logFileMaxSizeMB: this.settings.logFileMaxSizeMB,
				});
				this.updateDailyTaskFilePath();
				this.loadAndProcessInitialTasks();
				this.updateOllamaServiceConfig();
				this.roleListCache = null;
				this.promptService?.clearRoleCache();
				// --- ВИПРАВЛЕННЯ: Робимо handleSettingsUpdated публічним в OllamaView ---
				this.view?.handleSettingsUpdated?.();
				this.emit("roles-updated"); // Повідомляємо про оновлення ролей В КІНЦІ
			})
		);
		// -------------------------------------------------

		// --- Ribbon & Commands ---
		this.addRibbonIcon("brain-circuit", "Open AI Forge Chat", () => {
			this.activateView();
		});
		this.addCommand({
			id: "open-chat-view",
			name: "Open AI Forge Chat",
			callback: () => {
				this.activateView();
			},
		});
		this.addCommand({
			id: "index-rag-documents",
			name: "AI Forge: Index documents for RAG",
			callback: async () => {
				if (this.settings.ragEnabled)
					await this.ragService.indexDocuments();
				else new Notice("RAG is disabled in settings.");
			},
		});
		this.addCommand({
			id: "clear-active-chat-history",
			name: "AI Forge: Clear Active Chat History",
			callback: async () => {
				await this.clearMessageHistoryWithConfirmation();
			},
		});
		this.addCommand({
			id: "refresh-roles",
			name: "AI Forge: Refresh Roles List",
			callback: async () => {
				await this.listRoleFiles(true);
				this.emit("roles-updated");
				new Notice("Role list refreshed.");
			},
		});
		this.addCommand({
			id: "new-chat",
			name: "AI Forge: New Chat",
			callback: async () => {
				const newChat = await this.chatManager.createNewChat();
				if (newChat) {
					new Notice(`Created new chat: ${newChat.metadata.name}`);
				}
			},
		});
		this.addCommand({
			id: "switch-chat",
			name: "AI Forge: Switch Chat",
			callback: async () => {
				await this.showChatSwitcher();
			},
		});
		this.addCommand({
			id: "rename-active-chat",
			name: "AI Forge: Rename Active Chat",
			callback: async () => {
				await this.renameActiveChat();
			},
		});
		this.addCommand({
			id: "delete-active-chat",
			name: "AI Forge: Delete Active Chat",
			callback: async () => {
				await this.deleteActiveChatWithConfirmation();
			},
		});
		// --------------------------

		this.settingTab = new OllamaSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.app.workspace.onLayoutReady(async () => {
			if (this.settings.ragEnabled) {
				this.logger.info("Layout ready, scheduling initial RAG index.");
				setTimeout(() => {
					this.ragService?.indexDocuments();
				}, 5000);
			}
			const savedActiveId = await this.loadDataKey(ACTIVE_CHAT_ID_KEY);
			if (savedActiveId && this.settings.saveMessageHistory) {
				this.logger.info(
					`Layout ready, restoring active chat ID: ${savedActiveId}`
				);
				await this.chatManager.setActiveChat(savedActiveId);
			} else {
				this.logger.info(
					`Layout ready, no saved active chat ID or history saving disabled.`
				);
			}
		});

		// --- File Watcher Setup ---
		const debouncedRoleClear = debounce(
			() => {
				this.logger.debug(
					"Role/RAG change detected (debounced), clearing cache & emitting."
				);
				this.roleListCache = null;
				this.promptService?.clearRoleCache?.();
				this.emit("roles-updated");
				this.view?.renderRoleList?.(); // Потрібно зробити публічним в OllamaView
			},
			1500,
			true
		);

		// Debounced handler тільки для змін, що потребують затримки (ролі, RAG)
		this.fileChangeHandlerDebounced = debounce(
			(file: TAbstractFile) => {
				if (!file) return;
				this.logger.debug(
					`Debounced file change check for roles/RAG: ${file.path}`
				);
				// Передаємо false для isDeletion, бо це modify або create
				this.handleRoleOrRagFileChange(
					file.path,
					debouncedRoleClear,
					false
				);
			},
			1000,
			true
		); // Затримка 1 секунда

		// --- Окремі обробники подій ---
		const handleModifyEvent = (file: TAbstractFile) => {
			if (file instanceof TFile) {
				// Modify дає TFile
				this.logger.debug(`Modify event: ${file.path}`);
				this.fileChangeHandlerDebounced(file); // Debounced Roles/RAG check
				this.handleTaskFileModify(file); // Миттєва перевірка файлу завдань
			}
		};

		const handleDeleteEvent = (file: TAbstractFile) => {
			this.logger.debug(`Delete event: ${file.path}`);
			// Миттєва обробка видалення для ролей/RAG
			this.handleRoleOrRagFileChange(file.path, debouncedRoleClear, true); // isDeletion = true
			// Миттєва обробка видалення файлу завдань
			if (
				this.settings.enableProductivityFeatures &&
				file.path === this.dailyTaskFilePath
			) {
				this.logger.info(
					`Task file ${this.dailyTaskFilePath} deleted.`
				);
				this.dailyTaskFilePath = null;
				this.taskFileContentCache = null;
				this.taskFileNeedsUpdate = false;
				this.chatManager?.updateTaskState(null);
			}
		};

		const handleRenameEvent = (file: TAbstractFile, oldPath: string) => {
			this.logger.debug(`Rename event: ${oldPath} -> ${file.path}`);
			// Debounced Roles/RAG check для нового шляху
			this.fileChangeHandlerDebounced(file);
			// Миттєва обробка для старого шляху (як видалення)
			this.handleRoleOrRagFileChange(oldPath, debouncedRoleClear, true);
			// Миттєва обробка для файлу завдань
			if (this.settings.enableProductivityFeatures) {
				if (oldPath === this.dailyTaskFilePath) {
					this.logger.info(
						`Task file potentially renamed from ${oldPath}`
					);
					this.updateDailyTaskFilePath();
					this.loadAndProcessInitialTasks();
				} else if (file.path === this.dailyTaskFilePath) {
					this.logger.info(
						`A file was renamed to become the task file: ${file.path}`
					);
					this.taskFileNeedsUpdate = true;
					this.checkAndProcessTaskUpdate();
				}
			}
		};

		const handleCreateEvent = (file: TAbstractFile) => {
			// this.logger.debug(`Create event: ${file.path}`);
			// Debounced Roles/RAG check
			this.fileChangeHandlerDebounced(file);
			// Миттєва обробка для файлу завдань
			if (
				this.settings.enableProductivityFeatures &&
				file.path === this.dailyTaskFilePath
			) {
				this.logger.info(
					`Task file ${this.dailyTaskFilePath} created.`
				);
				this.taskFileNeedsUpdate = true;
				this.checkAndProcessTaskUpdate();
			}
		};

		// Реєструємо слухачів з новими обробниками
		this.registerEvent(this.app.vault.on("modify", handleModifyEvent));
		this.registerEvent(this.app.vault.on("delete", handleDeleteEvent));
		this.registerEvent(this.app.vault.on("rename", handleRenameEvent));
		this.registerEvent(this.app.vault.on("create", handleCreateEvent));

		this.updateDailyTaskFilePath();
		await this.loadAndProcessInitialTasks();
		if (this.settings.enableProductivityFeatures) {
			this.taskCheckInterval = setInterval(
				() => this.checkAndProcessTaskUpdate(),
				5000
			);
			// --- ВИПРАВЛЕННЯ: Приведення типу для registerInterval ---
			this.registerInterval(this.taskCheckInterval as any);
			// ---------------------------------------------------
		}
	}
	// --- Логіка файлу завдань ---
	updateDailyTaskFilePath(): void {
		/* ... як раніше ... */
		const folderPath = this.settings.ragFolderPath?.trim(); // Завдання в папці RAG
		const fileName = this.settings.dailyTaskFileName?.trim();
		const newPath =
			folderPath && fileName
				? normalizePath(`${folderPath}/${fileName}`)
				: null;
		if (newPath !== this.dailyTaskFilePath) {
			this.logger.info(`Daily task file path set to: ${newPath}`);
			this.dailyTaskFilePath = newPath;
			this.taskFileContentCache = null;
			this.taskFileNeedsUpdate = true;
		} else if (!newPath) {
			this.dailyTaskFilePath = null;
			this.logger.info(`Daily task file path is not configured.`);
		}
	}
	handleTaskFileModify(file: TFile): void {
		if (
			this.settings.enableProductivityFeatures &&
			file.path === this.dailyTaskFilePath
		) {
			// --- ВИПРАВЛЕННЯ: trace -> debug ---
			this.logger.debug(
				`Detected modification in task file: ${file.path}`
			);
			this.taskFileNeedsUpdate = true;
		}
	}
	async loadAndProcessInitialTasks(): Promise<void> {
		/* ... як раніше ... */
		if (
			!this.settings.enableProductivityFeatures ||
			!this.dailyTaskFilePath
		) {
			this.taskFileContentCache = null;
			this.chatManager?.updateTaskState(null);
			this.taskFileNeedsUpdate = false;
			return;
		}
		try {
			const fileExists = await this.app.vault.adapter.exists(
				this.dailyTaskFilePath
			);
			if (fileExists) {
				const content = await this.app.vault.adapter.read(
					this.dailyTaskFilePath
				);
				if (
					content !== this.taskFileContentCache ||
					this.taskFileContentCache === null
				) {
					this.logger.info(
						`Loading and processing tasks from ${this.dailyTaskFilePath}`
					);
					this.taskFileContentCache = content;
					const tasks = this.parseTasks(content);
					this.chatManager?.updateTaskState(tasks);
					this.taskFileNeedsUpdate = false;
				} else {
					this.logger.debug(
						`Task file content unchanged, skipping processing.`
					); // trace -> debug
					this.taskFileNeedsUpdate = false;
				}
			} else {
				this.logger.warn(
					`Task file ${this.dailyTaskFilePath} not found.`
				);
				this.taskFileContentCache = null;
				this.chatManager?.updateTaskState(null);
				this.taskFileNeedsUpdate = false;
			}
		} catch (error) {
			this.logger.error(
				`Error loading/processing task file ${this.dailyTaskFilePath}:`,
				error
			);
			this.taskFileContentCache = null;
			this.chatManager?.updateTaskState(null);
			this.taskFileNeedsUpdate = false;
		}
	}
	parseTasks(content: string): {
		urgent: string[];
		regular: string[];
		hasContent: boolean;
	} {
		/* ... як раніше ... */
		const lines = content.split("\n");
		const urgent: string[] = [];
		const regular: string[] = [];
		let hasContent = false;
		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine) continue;
			hasContent = true;
			if (
				trimmedLine.startsWith("- [x]") ||
				trimmedLine.startsWith("- [X]")
			)
				continue;
			if (
				trimmedLine.startsWith("!") ||
				trimmedLine.toLowerCase().includes("[urgent]")
			) {
				urgent.push(
					trimmedLine
						.replace(/^!/, "")
						.replace(/\[urgent\]/i, "")
						.trim()
				);
			} else if (trimmedLine.startsWith("- [ ]")) {
				regular.push(
					trimmedLine.substring(trimmedLine.indexOf("]") + 1).trim()
				);
			} else if (trimmedLine.startsWith("- ")) {
				regular.push(trimmedLine.substring(1).trim());
			} else {
				regular.push(trimmedLine);
			}
		}
		const filteredUrgent = urgent.filter((task) => task.length > 0);
		const filteredRegular = regular.filter((task) => task.length > 0);
		hasContent = filteredUrgent.length > 0 || filteredRegular.length > 0;
		this.logger.debug(
			`Parsed tasks - Urgent: ${filteredUrgent.length}, Regular: ${filteredRegular.length}, HasContent: ${hasContent}`
		);
		return { urgent: filteredUrgent, regular: filteredRegular, hasContent };
	}
	async checkAndProcessTaskUpdate(): Promise<void> {
		/* ... як раніше ... */
		if (this.taskFileNeedsUpdate) {
			this.logger.debug(
				"checkAndProcessTaskUpdate: taskFileNeedsUpdate is true, reloading..."
			);
			await this.loadAndProcessInitialTasks();
		}
	}
	// --- Кінець логіки файлу завдань ---

	// Обробник змін для ролей та RAG (без debounce)
	private handleRoleOrRagFileChange(
		changedPath: string,
		debouncedRoleClear: () => void,
		isDeletion: boolean = false
	) {
		const normPath = normalizePath(changedPath);
		// --- ВИПРАВЛЕННЯ: trace -> debug ---
		this.logger.debug(
			`Handling file change for path: ${normPath}, isDeletion: ${isDeletion}`
		);

		// 1. Перевірка для Ролей
		const userRolesPath = this.settings.userRolesFolderPath
			? normalizePath(this.settings.userRolesFolderPath)
			: null;
		const builtInRolesPath = this.manifest.dir
			? normalizePath(`${this.manifest.dir}/roles`)
			: null;
		let isRoleFile = false;
		if (normPath.toLowerCase().endsWith(".md")) {
			if (userRolesPath && normPath.startsWith(userRolesPath + "/")) {
				isRoleFile = true;
			} else if (
				builtInRolesPath &&
				normPath.startsWith(builtInRolesPath + "/")
			) {
				isRoleFile = true;
			}
		}
		if (isRoleFile) {
			this.logger.debug(`Role file change detected: ${normPath}`);
			debouncedRoleClear(); // Викликаємо debounced для ролей
		}

		// 2. Перевірка для RAG (викликаємо debounce з основного обробника)
		const ragFolderPath = this.settings.ragFolderPath
			? normalizePath(this.settings.ragFolderPath)
			: null;
		if (
			this.settings.ragEnabled &&
			ragFolderPath &&
			normPath.startsWith(ragFolderPath + "/")
		) {
			if (normPath !== this.dailyTaskFilePath) {
				this.logger.debug(
					`RAG file change detected: ${normPath}, isDeletion: ${isDeletion}. Triggering debounced index.`
				);
				// Логіка видалення з індексу має бути всередині ragService.indexDocuments
				// або окремому методі ragService.removeDocument(normPath)
				this.debounceIndexUpdate();
			} else {
				this.logger.debug(
					`Change in task file ${normPath} detected, handled separately, skipping RAG index trigger.`
				); // trace -> debug
			}
		}
	}

	async onunload() {
		this.logger.info("Unloading AI Forge Plugin...");
		this.app.workspace
			.getLeavesOfType(VIEW_TYPE_OLLAMA_PERSONAS)
			.forEach((l) => l.detach());
		this.view = null;

		if (this.indexUpdateTimeout) clearTimeout(this.indexUpdateTimeout);
		if (this.roleCacheClearTimeout)
			clearTimeout(this.roleCacheClearTimeout);
		if (this.taskCheckInterval) clearInterval(this.taskCheckInterval);

		try {
			if (this.chatManager && this.settings.saveMessageHistory) {
				const lastActiveId = this.chatManager.getActiveChatId();
				if (lastActiveId !== undefined && lastActiveId !== null) {
					this.logger.info(
						`Saving activeChatId (${lastActiveId}) on unload.`
					);
					await this.saveDataKey(ACTIVE_CHAT_ID_KEY, lastActiveId);
				} else {
					this.logger.info(
						`No active chat ID found to save on unload.`
					);
					await this.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
				}
			} else {
				this.logger.info(
					`History saving disabled or chatManager missing, not saving active chat ID.`
				);
				await this.saveDataKey(ACTIVE_CHAT_ID_KEY, null);
			}
		} catch (error) {
			this.logger.error("Error saving active chat ID on unload:", error);
		}

		this.promptService?.clearModelDetailsCache?.();
		this.promptService?.clearRoleCache?.();
		this.roleListCache = null;
		this.logger.info("AI Forge Plugin unloaded.");
	}

	updateOllamaServiceConfig() {
		if (this.ollamaService) {
			this.logger.info(
				"Settings changed, potentially updating Ollama service config."
			);
			this.promptService?.clearModelDetailsCache();
		}
	}

	private debounceIndexUpdate() {
		if (this.indexUpdateTimeout) clearTimeout(this.indexUpdateTimeout);
		this.indexUpdateTimeout = setTimeout(async () => {
			this.logger.debug("Debounced RAG index update starting...");
			if (this.settings.ragEnabled && this.ragService) {
				await this.ragService.indexDocuments();
			}
			this.indexUpdateTimeout = null;
		}, 30000);
	}

	// Оновлений метод активації View
	async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const viewType = VIEW_TYPE_OLLAMA_PERSONAS; // Use constant
		const existingLeaves = workspace.getLeavesOfType(viewType);

		this.logger.debug(
			`activateView called. Found ${existingLeaves.length} existing leaves. Open in tab setting: ${this.settings.openChatInTab}`
		);

		if (existingLeaves.length > 0) {
			leaf = existingLeaves[0];
			this.logger.debug(`Found existing view leaf. Revealing it.`);
			// No need to setViewState again if leaf already exists, just reveal
		} else {
			this.logger.debug(`No existing view leaf found. Creating new one.`);
			if (this.settings.openChatInTab) {
				this.logger.debug(`Setting requests view in tab.`);
				leaf = workspace.getLeaf("tab"); // Create new tab leaf
			} else {
				this.logger.debug(
					`Setting requests view in sidebar. Checking right sidebar...`
				);
				leaf = workspace.getRightLeaf(false); // Try to get existing right sidebar leaf
				if (!leaf) {
					// --- This is where the fallback likely happened ---
					this.logger.warn(
						`Right sidebar leaf not found or not open. Per default settings, chat should open here.`
					);
					// Option: Fallback to creating a tab instead, log clearly
					this.logger.warn(
						`Falling back to opening in a new tab as sidebar is not available.`
					);
					leaf = workspace.getLeaf("tab");
					// Option: Try getLeaf(true) - but this might still open in main area
					// leaf = workspace.getLeaf(true);
					// Option: Show Notice and do nothing (Bad UX)
					// new Notice("AI Forge: Please open the right sidebar panel first.");
					// return;
				} else {
					this.logger.debug(`Found existing right sidebar leaf.`);
				}
			}

			// Set state only if we created a new leaf (or got one successfully)
			if (leaf) {
				this.logger.debug(`Setting view state for the leaf.`);
				try {
					await leaf.setViewState({ type: viewType, active: true });
				} catch (e) {
					this.logger.error("Error setting view state:", e);
					new Notice("Error opening AI Forge view.");
					return;
				}
			} else {
				this.logger.error(
					"Failed to get or create leaf for AI Forge view."
				);
				new Notice("Could not open AI Forge view.");
				return; // Exit if no leaf could be determined
			}
		}

		// Reveal the leaf (existing or new)
		if (leaf) {
			workspace.revealLeaf(leaf);
			// Assign this.view reference
			if (leaf.view instanceof OllamaView) {
				this.view = leaf.view;
				this.logger.debug("AI Forge View instance assigned/confirmed.");
			} else {
				this.logger.error(
					"Leaf revealed, but view is not an instance of OllamaView:",
					leaf.view
				);
			}
		}
	}

	// Завантаження та Міграція Налаштувань
	async loadSettingsAndMigrate() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		let migrated = false;

		// --- ВИПРАВЛЕННЯ: Використовуємо type assertion 'as any' ---
		if (
			loadedData &&
			loadedData[SESSIONS_INDEX_KEY_V1] !== undefined &&
			(this.settings as any)[SESSIONS_INDEX_KEY] === undefined
		) {
			this.logger.info("Migrating chat index key v1 -> v2");
			(this.settings as any)[SESSIONS_INDEX_KEY] =
				loadedData[SESSIONS_INDEX_KEY_V1];
			delete (this.settings as any)[SESSIONS_INDEX_KEY_V1];
			migrated = true;
		}
		if (
			loadedData &&
			loadedData[ACTIVE_SESSION_ID_KEY_V1] !== undefined &&
			(this.settings as any)[ACTIVE_CHAT_ID_KEY] === undefined
		) {
			this.logger.info("Migrating active chat id key v1 -> v2");
			(this.settings as any)[ACTIVE_CHAT_ID_KEY] =
				loadedData[ACTIVE_SESSION_ID_KEY_V1];
			delete (this.settings as any)[ACTIVE_SESSION_ID_KEY_V1];
			migrated = true;
		}
		// --- Кінець виправлення ---

		if (migrated) {
			this.logger.info("Saving migrated settings...");
			await this.saveData(this.settings);
		}
	}

	async saveSettings() {
		this.logger.debug("Saving plugin settings...");
		await this.saveData(this.settings);
		this.logger.debug("Settings saved. Emitting 'settings-updated' event.");
		this.emit("settings-updated");
	}

	// Data Helpers
	async saveDataKey(key: string, value: any): Promise<void> {
		/* ... як раніше ... */
		try {
			const data = (await this.loadData()) || {};
			data[key] = value;
			await this.saveData(data);
			this.logger.debug(`Saved data for key: ${key}`);
		} catch (error) {
			this.logger.error(`Error saving data key ${key}:`, error);
		}
	}
	async loadDataKey(key: string): Promise<any> {
		/* ... як раніше ... */
		try {
			const data = (await this.loadData()) || {};
			this.logger.debug(`Loaded data for key: ${key}`);
			return data[key];
		} catch (error) {
			this.logger.error(`Error loading data key ${key}:`, error);
			return undefined;
		}
	}

	// History Persistence
	async clearMessageHistoryWithConfirmation() {
		/* ... як раніше ... */
		this.logger.debug("Clear active chat history command triggered.");
		if (!this.chatManager) {
			this.logger.error("ChatManager not ready for clearMessageHistory.");
			new Notice("Error: Chat Manager not ready.");
			return;
		}
		const activeChat = await this.chatManager.getActiveChat();
		if (activeChat && activeChat.messages.length > 0) {
			new ConfirmModal(
				this.app,
				"Clear History",
				`Clear messages in "${activeChat.metadata.name}"?`,
				async () => {
					this.logger.info(
						`User confirmed clearing history for chat: ${activeChat.metadata.id}`
					);
					await this.chatManager.clearActiveChatMessages();
					new Notice(
						`History cleared for "${activeChat.metadata.name}".`
					);
				}
			).open();
		} else if (activeChat) {
			new Notice("Chat history is already empty.");
		} else {
			new Notice("No active chat to clear.");
		}
	}

	// List Role Files Method (з виправленням path.basename)
	async listRoleFiles(forceRefresh: boolean = false): Promise<RoleInfo[]> {
		/* ... як у попередній відповіді ... */
		if (this.roleListCache && !forceRefresh) {
			this.logger.debug("Returning cached roles.");
			return this.roleListCache;
		} // trace -> debug
		this.logger.debug(
			"Fetching roles list (forceRefresh=" + forceRefresh + ")..."
		);
		const roles: RoleInfo[] = [];
		const addedNamesLowerCase = new Set<string>();
		const adapter = this.app.vault.adapter;
		const pluginDir = this.manifest.dir;
		const builtInRoleName = "Productivity Assistant";
		const builtInRoleFileName = "Productivity_Assistant.md";
		let builtInRolePath: string | null = null;
		if (pluginDir) {
			builtInRolePath = normalizePath(
				`${pluginDir}/roles/${builtInRoleFileName}`
			);
			this.logger.debug(
				`Checking for built-in role at: ${builtInRolePath}`
			);
			try {
				if (await adapter.exists(builtInRolePath)) {
					const stat = await adapter.stat(builtInRolePath);
					if (stat?.type === "file") {
						this.logger.debug(
							`Found built-in role: ${builtInRoleName}`
						);
						roles.push({
							name: builtInRoleName,
							path: builtInRolePath,
							isCustom: false,
						});
						addedNamesLowerCase.add(builtInRoleName.toLowerCase());
					} else {
						this.logger.warn(
							`Built-in role path exists but is not a file: ${builtInRolePath}`
						);
					}
				} else {
					this.logger.warn(
						`Built-in role file NOT FOUND at: ${builtInRolePath}.`
					);
				}
			} catch (error) {
				this.logger.error(
					`Error checking/adding built-in role at ${builtInRolePath}:`,
					error
				);
			}
		} else {
			this.logger.warn(
				"Plugin directory not found, cannot locate built-in roles."
			);
		}
		const userRolesFolderPath = this.settings.userRolesFolderPath
			? normalizePath(this.settings.userRolesFolderPath)
			: null;
		if (userRolesFolderPath && userRolesFolderPath !== "/") {
			this.logger.debug(
				`Processing user roles from: ${userRolesFolderPath}`
			);
			try {
				if (
					(await adapter.exists(userRolesFolderPath)) &&
					(await adapter.stat(userRolesFolderPath))?.type === "folder"
				) {
					const listResult = await adapter.list(userRolesFolderPath);
					for (const filePath of listResult.files) {
						if (
							filePath.toLowerCase().endsWith(".md") &&
							filePath.split("/").length ===
								userRolesFolderPath.split("/").length + 1 &&
							filePath !== builtInRolePath
						) {
							const fileName = filePath.substring(
								filePath.lastIndexOf("/") + 1
							);
							const roleName = fileName.endsWith(".md")
								? fileName.slice(0, -3)
								: fileName;
							if (
								!addedNamesLowerCase.has(roleName.toLowerCase())
							) {
								// this.logger.debug(									`Adding user role: ${roleName} from path: ${filePath}`								);
								roles.push({
									name: roleName,
									path: filePath,
									isCustom: true,
								});
								addedNamesLowerCase.add(roleName.toLowerCase());
							} else {
								this.logger.warn(
									`Skipping user role "${roleName}" from "${filePath}" due to name conflict.`
								);
							}
						}
					}
				} else {
					this.logger.warn(
						`User roles path not found or not a folder: ${userRolesFolderPath}`
					);
				}
			} catch (e) {
				this.logger.error(
					`Error listing user roles in ${userRolesFolderPath}:`,
					e
				);
			}
		} else if (userRolesFolderPath === "/") {
			this.logger.warn(
				"User roles folder path is set to root '/', skipping scan."
			);
		}
		roles.sort((a, b) => a.name.localeCompare(b.name));
		this.roleListCache = roles;
		this.logger.debug(`Found total ${roles.length} roles.`);
		return roles;
	}

	// Execute System Command Method
	async executeSystemCommand(
		command: string
	): Promise<{
		stdout: string;
		stderr: string;
		error: ExecException | null;
	}> {
		/* ... як раніше ... */
		this.logger.info(`Executing system command: ${command}`);
		if (!command?.trim()) {
			return {
				stdout: "",
				stderr: "Empty command.",
				error: new Error("Empty command.") as ExecException,
			};
		}
		//@ts-ignore process is available in Obsidian desktop
		if (typeof process === "undefined" || !process?.versions?.node) {
			this.logger.error(
				"Node.js environment not available. Cannot execute system command."
			);
			new Notice("Cannot execute system command.");
			return {
				stdout: "",
				stderr: "Node.js required.",
				error: new Error("Node.js required.") as ExecException,
			};
		}
		return new Promise((resolve) => {
			exec(command, (error, stdout, stderr) => {
				if (error)
					this.logger.error(`Exec error for "${command}": ${error}`);
				if (stderr)
					this.logger.error(
						`Exec stderr for "${command}": ${stderr}`
					);
				if (stdout)
					this.logger.debug(
						`Exec stdout for "${command}": ${stdout}`
					);
				resolve({
					stdout: stdout.toString(),
					stderr: stderr.toString(),
					error: error,
				});
			});
		});
	}

	// --- Session Management Command Helpers ---
	async showChatSwitcher() {
		new Notice("Switch Chat UI not implemented yet.");
	}

	// У файлі src/main.ts

	async renameActiveChat() {
		const activeChat = await this.chatManager?.getActiveChat();
		if (!activeChat) {
			new Notice("No active chat to rename.");
			return;
		}
		const currentName = activeChat.metadata.name;
		const chatId = activeChat.metadata.id; // Отримуємо ID для логування/перевірки

		new PromptModal(
			this.app,
			"Rename Chat",
			`Enter new name for "${currentName}":`,
			currentName,
			async (newName) => {
				const trimmedName = newName?.trim(); // Обрізаємо та перевіряємо на null
				if (
					trimmedName &&
					trimmedName !== "" &&
					trimmedName !== currentName
				) {
					this.logger.debug(
						`Attempting to rename chat ${chatId} to "${trimmedName}" via updateActiveChatMetadata`
					);

					// --- ВИПРАВЛЕННЯ: Використовуємо updateActiveChatMetadata ---
					const success =
						await this.chatManager.updateActiveChatMetadata({
							name: trimmedName,
						});
					// -----------------------------------------------------

					if (success) {
						// Можливо, Notice тут зайвий, оскільки updateActiveChatMetadata може генерувати події,
						// на які реагує View, АБО saveChat (який викликається з update...) генерує chat-list-updated
						this.logger.info(
							`Chat ${chatId} rename initiated to "${trimmedName}".`
						);
						// new Notice(`Chat renamed to "${trimmedName}".`); // Можна закоментувати/видалити
					} else {
						// updateActiveChatMetadata має сам обробити помилку або повернути false
						this.logger.error(
							`Failed to rename chat ${chatId} using updateActiveChatMetadata.`
						);
						// new Notice("Failed to rename chat."); // Зазвичай не потрібно дублювати
					}
				} else if (newName !== null) {
					// Показуємо сповіщення, тільки якщо користувач щось ввів (а не просто закрив вікно)
					new Notice("Rename cancelled or name unchanged.");
				}
			}
		).open();
	}

	async deleteActiveChatWithConfirmation() {
		/* ... як раніше ... */
		const activeChat = await this.chatManager?.getActiveChat();
		if (!activeChat) {
			new Notice("No active chat.");
			return;
		}
		const chatName = activeChat.metadata.name;
		new ConfirmModal(
			this.app,
			"Delete Chat",
			`Delete chat "${chatName}"?`,
			async () => {
				const success = await this.chatManager.deleteChat(
					activeChat.metadata.id
				);
				if (success) {
					new Notice(`Chat "${chatName}" deleted.`);
				} else {
					new Notice(`Failed to delete chat "${chatName}".`);
				}
			}
		).open();
	}

	// Обробник зміни активного чату
	private async handleActiveChatChangedLocally(data: {
		chatId: string | null;
		chat: Chat | null;
	}) {
		/* ... як раніше ... */
		this.logger.info(
			`Handling 'active-chat-changed' locally. New active ID: ${data.chatId}`
		);
		if (this.settings.saveMessageHistory) {
			await this.saveDataKey(ACTIVE_CHAT_ID_KEY, data.chatId);
			this.logger.debug(`Saved active chat ID: ${data.chatId}`);
		}
	}

	// Пошук імені ролі (з виправленням path.basename)
	findRoleNameByPath(rolePath: string | null | undefined): string {
		/* ... як у попередній відповіді ... */
		if (!rolePath) return "None";
		const cachedRole = this.roleListCache?.find(
			(rl) => rl.path === rolePath
		);
		if (cachedRole) return cachedRole.name;
		try {
			const fileName = rolePath.substring(rolePath.lastIndexOf("/") + 1);
			const roleName = fileName.endsWith(".md")
				? fileName.slice(0, -3)
				: fileName;
			return roleName;
		} catch (e) {
			this.logger.warn(
				`Could not determine role name for path: ${rolePath}`,
				e
			);
			return "Unknown Role";
		}
	}
} // END OF OllamaPlugin CLASS
