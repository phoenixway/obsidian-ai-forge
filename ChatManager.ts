// ChatManager.ts
import { App, Notice, DataAdapter, normalizePath, TFolder } from "obsidian"; // Додано TFolder
import OllamaPlugin from "./main";
import { Chat, ChatMetadata, ChatData, ChatConstructorSettings } from "./Chat"; // Import Chat class and types
import { MessageRole, Message } from './OllamaView'; // Needs Message types

// Ключі для зберігання даних плагіна
const SESSIONS_INDEX_KEY = 'chatSessionsIndex_v1'; // Key for storing index in plugin data
const ACTIVE_SESSION_ID_KEY = 'activeChatSessionId_v1'; // Key for storing active ID

// Інтерфейси (залишаються без змін)
interface ChatSessionIndex {
    [id: string]: Omit<ChatMetadata, 'id'>; // Store metadata without repeating ID as key
}
export interface RoleInfo { name: string; path: string; isCustom: boolean; }


export class ChatManager {
    private plugin: OllamaPlugin;
    private app: App;
    private adapter: DataAdapter; // Obsidian Vault Adapter
    private chatsFolderPath: string = "/"; // Шлях до папки чатів В СХОВИЩІ (ініціалізується як корінь)
    private sessionIndex: ChatSessionIndex = {}; // In-memory index of available chats {id: metadata}
    private activeChatId: string | null = null;
    private loadedChats: Record<string, Chat> = {}; // Cache for loaded Chat objects

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.adapter = plugin.app.vault.adapter; // Використовуємо адаптер сховища
        this.updateChatsFolderPath(); // Встановлюємо початковий шлях на основі налаштувань
        console.log(`[ChatManager] Initialized. Base path set to: ${this.chatsFolderPath}`);
    }

    /**
     * Оновлює внутрішній шлях `chatsFolderPath` на основі поточних налаштувань плагіна.
     * Шлях вказує на папку всередині сховища Obsidian.
     */
    updateChatsFolderPath(): void {
        const settingsPath = this.plugin.settings.chatHistoryFolderPath?.trim();
        // Якщо шлях в налаштуваннях вказано і він не порожній
        if (settingsPath) {
            // Нормалізуємо шлях (видаляє зайві слеші, тощо)
            this.chatsFolderPath = normalizePath(settingsPath);
        } else {
            // Якщо шлях не вказано, використовуємо корінь сховища
            this.chatsFolderPath = "/";
        }
        console.log(`[ChatManager] Updated chatsFolderPath to: ${this.chatsFolderPath}`);
    }

    /**
     * Ініціалізує ChatManager: оновлює шлях, перевіряє існування папки,
     * завантажує індекс чатів та ID активного чату.
     */
    async initialize(): Promise<void> {
        console.log("[ChatManager] Initializing...");
        this.updateChatsFolderPath();
        await this.ensureChatsFolderExists();
        // --- ЗМІНЕНО: Тепер loadChatIndex оновлює індекс з файлів ---
        await this.loadChatIndex(true); // true - означає примусове оновлення з файлів

        // Завантажуємо ID останнього активного чату
        this.activeChatId = await this.plugin.loadDataKey(ACTIVE_SESSION_ID_KEY) || null;
        console.log(`[ChatManager] Loaded activeChatId from store: ${this.activeChatId}`);

        // Валідація: перевіряємо, чи існує активний ID в *оновленому* індексі
        if (this.activeChatId && !this.sessionIndex[this.activeChatId]) {
            console.warn(`[ChatManager] Active chat ID ${this.activeChatId} not found in the refreshed index. Resetting.`);
            this.activeChatId = null;
            await this.plugin.saveDataKey(ACTIVE_SESSION_ID_KEY, null);
        } else if (this.activeChatId) {
            console.log(`[ChatManager] Active chat ID ${this.activeChatId} confirmed in the refreshed index.`);
        }

        console.log(`[ChatManager] Initialized. Index has ${Object.keys(this.sessionIndex).length} entries. Final Active ID: ${this.activeChatId}`);
    }

    /**
     * Перевіряє існування папки для історії чатів у сховищі (згідно з `chatsFolderPath`).
     * Якщо папка не існує (і шлях не є коренем), намагається її створити.
     */
    private async ensureChatsFolderExists(): Promise<void> {
        // Не робимо нічого, якщо шлях вказує на корінь сховища
        if (this.chatsFolderPath === "/" || !this.chatsFolderPath) {
            console.log("[ChatManager] Chat history path is vault root, skipping folder creation check.");
            return;
        }
        try {
            // Використовуємо адаптер сховища для перевірки/створення
            if (!(await this.adapter.exists(this.chatsFolderPath))) {
                console.log(`[ChatManager] Chat history folder '${this.chatsFolderPath}' does not exist. Attempting to create...`);
                await this.adapter.mkdir(this.chatsFolderPath);
                console.log(`[ChatManager] Created chat history directory in vault: ${this.chatsFolderPath}`);
            } else {
                // Перевіряємо, чи існуючий шлях є папкою
                const stat = await this.adapter.stat(this.chatsFolderPath);
                if (stat?.type !== 'folder') {
                    console.error(`[ChatManager] Error: Configured chat history path '${this.chatsFolderPath}' exists but is not a folder.`);
                    new Notice(`Error: Chat history path '${this.chatsFolderPath}' is not a folder. Please check settings.`);
                    // В цьому випадку, можливо, варто відмовитись від збереження або повернутись до кореня?
                    // Поки що просто виводимо помилку.
                } else {
                    console.log(`[ChatManager] Chat history directory confirmed in vault: ${this.chatsFolderPath}`);
                }
            }
        } catch (error) {
            console.error(`[ChatManager] Error creating/checking chat history directory ${this.chatsFolderPath}:`, error);
            new Notice(`Error: Could not create chat history directory '${this.chatsFolderPath}'. Please check settings or folder permissions.`);
        }
    }
    /**
     * Завантажує або оновлює індекс чатів.
     * @param forceScanFromFile Якщо true, індекс буде перебудовано шляхом сканування файлів у папці історії.
     * Якщо false (або не вказано), завантажує індекс зі сховища плагіна.
     */
    private async loadChatIndex(forceScanFromFile: boolean = false): Promise<void> {
        if (!forceScanFromFile) {
            // Просто завантажуємо збережений індекс
            const loadedIndex = await this.plugin.loadDataKey(SESSIONS_INDEX_KEY);
            this.sessionIndex = loadedIndex || {};
            console.log(`[ChatManager] Loaded chat index from plugin data with ${Object.keys(this.sessionIndex).length} entries.`);
            return;
        }

        console.log(`[ChatManager] Rebuilding chat index by scanning files in: ${this.chatsFolderPath}`);
        const newIndex: ChatSessionIndex = {};
        let filesScanned = 0;
        let chatsLoaded = 0;

        try {
            // Перевіряємо, чи існує папка історії
            if (!(await this.adapter.exists(this.chatsFolderPath)) && this.chatsFolderPath !== "/") {
                console.warn(`[ChatManager] Chat history folder '${this.chatsFolderPath}' not found during index rebuild. Index will be empty.`);
                this.sessionIndex = {};
                await this.saveChatIndex(); // Зберігаємо порожній індекс
                return;
            }

            // Отримуємо список файлів у папці історії
            const listResult = await this.adapter.list(this.chatsFolderPath);
            const chatFiles = listResult.files.filter(filePath =>
                filePath.toLowerCase().endsWith('.json') && // Тільки .json
                !filePath.includes('/') // Тільки файли безпосередньо в цій папці (не в підпапках)
                // Можливо, треба адаптувати, якщо шлях до папки складний
            );

            filesScanned = chatFiles.length;
            console.log(`[ChatManager] Found ${filesScanned} potential chat files to scan.`);

            // --- Готуємо налаштування один раз ---
            const constructorSettings: ChatConstructorSettings = { ...this.plugin.settings };

            for (const filePath of chatFiles) {
                const fullPath = normalizePath(filePath); // adapter.list може повертати відносні шляхи
                // Спробуємо отримати ID з імені файлу (перед '.json')
                const fileName = fullPath.split('/').pop() || '';
                const chatId = fileName.endsWith('.json') ? fileName.slice(0, -5) : null;

                if (!chatId) {
                    console.warn(`[ChatManager] Could not extract chat ID from file path: ${fullPath}`);
                    continue; // Переходимо до наступного файлу
                }

                try {
                    // Завантажуємо ТІЛЬКИ МЕТАДАНІ для швидкості (якщо можливо)
                    // Поточний Chat.loadFromFile завантажує все, що може бути повільно.
                    // Оптимізація: читаємо файл і парсимо тільки metadata.
                    const jsonContent = await this.adapter.read(fullPath);
                    const data = JSON.parse(jsonContent) as Partial<ChatData>; // Partial, бо нас цікавить тільки metadata

                    if (data?.metadata?.id && data.metadata.id === chatId) {
                        // Перевіряємо, чи ID в метаданих співпадає з ID з імені файлу
                        const metadata = data.metadata;
                        // Додаємо в новий індекс, видаляючи поле id зі значення
                        newIndex[chatId] = {
                            name: metadata.name,
                            modelName: metadata.modelName,
                            selectedRolePath: metadata.selectedRolePath,
                            temperature: metadata.temperature,
                            createdAt: metadata.createdAt,
                            lastModified: metadata.lastModified
                        };
                        chatsLoaded++;
                    } else {
                        console.warn(`[ChatManager] Metadata validation failed for file: ${fullPath}. ID mismatch or missing metadata. ChatID from filename: ${chatId}`, data?.metadata);
                    }
                } catch (e) {
                    console.error(`[ChatManager] Error reading or parsing chat file ${fullPath} during index rebuild:`, e);
                    // Не додаємо цей чат в індекс
                }
            } // end for loop

            console.log(`[ChatManager] Index rebuild complete. Scanned: ${filesScanned}, Successfully loaded metadata for: ${chatsLoaded}`);
            this.sessionIndex = newIndex; // Встановлюємо новий індекс
            await this.saveChatIndex(); // Зберігаємо оновлений індекс

        } catch (error) {
            console.error(`[ChatManager] Critical error during index rebuild process:`, error);
            // У разі помилки, можливо, краще залишити старий індекс?
            // Або встановити порожній? Поки що встановлюємо порожній.
            this.sessionIndex = {};
            await this.saveChatIndex();
            new Notice("Error rebuilding chat index. List might be empty.");
        }
    }


    /** Зберігає поточний індекс чатів у сховище плагіна. */
    private async saveChatIndex(): Promise<void> {
        // console.log(`[ChatManager] Saving chat index with ${Object.keys(this.sessionIndex).length} entries.`);
        await this.plugin.saveDataKey(SESSIONS_INDEX_KEY, this.sessionIndex);
    }

    /**
     * Генерує повний, нормалізований шлях до файлу чату `.json` всередині сховища.
     * @param id Унікальний ідентифікатор чату.
     * @returns Нормалізований шлях до файлу.
     */
    private getChatFilePath(id: string): string {
        const fileName = `${id}.json`;
        // Якщо шлях до папки - корінь, повертаємо тільки ім'я файлу
        if (this.chatsFolderPath === "/" || !this.chatsFolderPath) {
            return normalizePath(fileName); // Нормалізуємо на випадок ID зі слешами (хоча не повинно бути)
        }
        // Інакше, об'єднуємо шлях до папки та ім'я файлу
        return normalizePath(`${this.chatsFolderPath}/${fileName}`);
    }

    /**
     * Створює новий чат: генерує ID, визначає шлях у сховищі, створює об'єкт Chat,
     * зберігає початковий файл, оновлює індекс, кеш та встановлює новий чат як активний.
     * @param name Необов'язкова початкова назва чату.
     * @returns Створений об'єкт Chat або null у разі помилки.
     */
    async createNewChat(name?: string): Promise<Chat | null> {
        console.log("[ChatManager] Attempting to create new chat...");
        try {
            // 1. Генеруємо ID
            const now = new Date();
            const newId = `chat_${now.getTime()}_${Math.random().toString(36).substring(2, 8)}`;

            // 2. Визначаємо повний шлях до файлу у сховищі
            const filePath = this.getChatFilePath(newId);
            console.log(`[ChatManager] New chat ID: ${newId}, Path: ${filePath}`);

            // 3. Готуємо початкові метадані
            const initialMetadata: ChatMetadata = {
                id: newId,
                name: name || `Chat ${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
                modelName: this.plugin.settings.modelName, // Беремо з глобальних налаштувань
                selectedRolePath: this.plugin.settings.selectedRolePath, // Беремо з глобальних налаштувань
                temperature: this.plugin.settings.temperature, // Беремо з глобальних налаштувань
                createdAt: now.toISOString(),
                lastModified: now.toISOString(),
            };

            // 4. Створюємо екземпляр Chat, передаючи шлях явно
            // Використовуємо тип ChatConstructorSettings (може бути = OllamaPluginSettings)
            const constructorSettings: ChatConstructorSettings = { ...this.plugin.settings };
            const newChat = new Chat(this.adapter, constructorSettings, { metadata: initialMetadata, messages: [] }, filePath);

            // 5. Негайне збереження для створення файлу у сховищі
            const saved = await newChat.saveImmediately();
            if (!saved) {
                // Повідомлення про помилку вже буде в Chat._saveToFile
                throw new Error("Failed to save initial chat file.");
            }
            console.log(`[ChatManager] Initial chat file saved for ${newId}`);

            // 6. Оновлення індексу сесій
            this.sessionIndex[newChat.metadata.id] = { ...newChat.metadata };
            delete (this.sessionIndex[newChat.metadata.id] as any).id; // Видаляємо надлишковий ID з значення
            await this.saveChatIndex();
            console.log(`[ChatManager] Chat index updated for ${newId}`);

            // 7. Додавання до кешу завантажених чатів
            this.loadedChats[newChat.metadata.id] = newChat;

            // 8. Встановлення як активний (це також збереже ID активного чату)
            await this.setActiveChat(newChat.metadata.id);

            console.log(`[ChatManager] Successfully created and activated new chat: ${newChat.metadata.name} (ID: ${newChat.metadata.id})`);
            this.plugin.emit('chat-list-updated'); // Повідомляємо UI про новий чат
            return newChat;
        } catch (error) {
            console.error("[ChatManager] Error creating new chat:", error);
            new Notice("Error creating new chat session.");
            return null;
        }
    }

    /**
     * Повертає масив метаданих всіх доступних чатів, відсортований за датою зміни (новіші перші).
     */
    listAvailableChats(): ChatMetadata[] {
        // Повертаємо метадані з індексу, додаючи ID назад
        return Object.entries(this.sessionIndex).map(([id, meta]) => ({
            id,
            ...meta,
        })).sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()); // Сортуємо: новіші перші
    }

    /** Повертає ID поточного активного чату. */
    getActiveChatId(): string | null {
        return this.activeChatId;
    }

    /**
     * Встановлює активний чат за його ID.
     * Зберігає ID активного чату, завантажує дані чату (якщо потрібно),
     * оновлює кеш та викликає подію 'active-chat-changed'.
     * @param id ID чату для активації, або null для скидання активного чату.
     */
    async setActiveChat(id: string | null): Promise<void> {
        console.log(`[ChatManager] Setting active chat to ID: ${id}`);
        // 1. Валідація ID (тільки якщо встановлюємо не null)
        if (id && !this.sessionIndex[id]) {
            console.error(`[ChatManager] Attempted to set active chat to non-existent ID: ${id}. Setting to null.`);
            id = null; // Встановлюємо null, якщо ID не знайдено в індексі
        }

        // 2. Перевірка, чи ID дійсно змінюється
        if (id === this.activeChatId) {
            // console.log(`[ChatManager] Chat ${id} is already active.`);
            // Якщо той самий ID встановлюється знову, переконуємось, що чат завантажений у кеш
            if (id) await this.getChat(id); // Переконуємось, що завантажено
            return; // Не потрібно нічого робити далі
        }

        // 3. Оновлюємо внутрішній стан і зберігаємо ID активного чату
        this.activeChatId = id;
        await this.plugin.saveDataKey(ACTIVE_SESSION_ID_KEY, id);
        console.log(`[ChatManager] Persisted active chat ID: ${id}`);

        // 4. Завантажуємо щойно активований чат у кеш (якщо не null)
        let loadedChat: Chat | null = null;
        if (id) {
            loadedChat = await this.getChat(id); // getChat обробляє завантаження та кешування
            if (!loadedChat) {
                // Якщо завантаження не вдалося (файл відсутній/пошкоджений), скидаємо активний ID
                console.error(`[ChatManager] Failed to load chat data for newly activated ID ${id}. Resetting active chat to null.`);
                // Рекурсивний виклик для коректної обробки встановлення null
                await this.setActiveChat(null);
                return; // Зупиняємо виконання тут
            }
        }

        // 5. Викликаємо подію з chatId та завантаженим об'єктом чату (або null)
        // Слухач у main.ts або OllamaView обробить оновлення UI та стану.
        console.log(`[ChatManager] Emitting 'active-chat-changed' event for ID: ${id}`);
        this.plugin.emit('active-chat-changed', { chatId: id, chat: loadedChat });
    }

    /**
     * Отримує конкретний чат за ID, завантажуючи його з файлу у сховищі, якщо він ще не в кеші.
     * @param id Ідентифікатор чату.
     * @returns Об'єкт Chat або null, якщо чат не знайдено або сталася помилка завантаження.
     */
    async getChat(id: string): Promise<Chat | null> {
        console.log(`[ChatManager] getChat called for ID: ${id}`);
        // 1. Перевірка кешу
        if (this.loadedChats[id]) {
            console.log(`[ChatManager] Returning chat ${id} from cache.`);
            return this.loadedChats[id];
        }
        console.log(`[ChatManager] Chat ${id} not in cache.`);

        // 2. Перевірка індексу
        if (this.sessionIndex[id]) {
            // 3. Визначаємо шлях до файлу у сховищі
            const filePath = this.getChatFilePath(id);
            console.log(`[ChatManager] Attempting to load chat ${id} from vault path: ${filePath}`);

            // 4. Готуємо налаштування для конструктора Chat.loadFromFile
            const constructorSettings: ChatConstructorSettings = { ...this.plugin.settings };

            // 5. Завантаження з файлу
            const chat = await Chat.loadFromFile(filePath, this.adapter, constructorSettings);

            if (chat) {
                // 6. Успішне завантаження: додаємо в кеш
                console.log(`[ChatManager] Successfully loaded chat ${id} from file. Adding to cache.`);
                this.loadedChats[id] = chat;
                return chat;
            } else {
                // 7. Помилка завантаження: видаляємо з індексу, оновлюємо активний ID якщо потрібно
                console.error(`[ChatManager] Failed to load chat ${id} from file ${filePath}. Removing from index.`);
                delete this.sessionIndex[id];
                await this.saveChatIndex();
                if (this.activeChatId === id) {
                    console.warn(`[ChatManager] Resetting activeChatId because the active chat file failed to load.`);
                    await this.setActiveChat(null); // Скидаємо активний чат
                }
                this.plugin.emit('chat-list-updated'); // Повідомляємо UI про зміну списку
                return null;
            }
        }

        // 8. Чат не знайдено в індексі
        console.warn(`[ChatManager] Chat with ID ${id} not found in session index.`);
        return null;
    }

    /**
     * Отримує поточний активний чат. Якщо активний чат не встановлено,
     * намагається завантажити останній змінений чат. Якщо чатів немає, створює новий.
     * @returns Активний об'єкт Chat або null у разі помилки створення/завантаження.
     */
    async getActiveChat(): Promise<Chat | null> {
        console.log(`[ChatManager] getActiveChat called. Current activeChatId: ${this.activeChatId}`);
        if (!this.activeChatId) {
            console.log("[ChatManager] No active chat ID set. Checking available chats...");
            const availableChats = this.listAvailableChats(); // Отримуємо список, відсортований за датою
            if (availableChats.length > 0) {
                const mostRecentId = availableChats[0].id;
                console.log(`[ChatManager] Found ${availableChats.length} available chats. Attempting to set most recent as active: ID ${mostRecentId}`);
                await this.setActiveChat(mostRecentId); // Встановлюємо найновіший як активний
                // Повторно перевіряємо, чи вдалося завантажити чат після setActiveChat
                if (this.activeChatId && this.loadedChats[this.activeChatId]) {
                    return this.loadedChats[this.activeChatId]; // Повертаємо успішно завантажений чат
                } else {
                    console.error(`[ChatManager] Failed to load the most recent chat (ID: ${mostRecentId}) after setting it active. Creating a new chat instead.`);
                    return await this.createNewChat(); // Створюємо новий, якщо завантаження не вдалося
                }
            } else {
                console.log("[ChatManager] No available chats exist. Creating a new one.");
                return await this.createNewChat(); // Створюємо новий, якщо взагалі немає чатів
            }
        }
        // Якщо activeChatId є, спробуємо завантажити його
        console.log(`[ChatManager] Active ID is ${this.activeChatId}. Attempting to get chat object...`);
        return this.getChat(this.activeChatId); // Повертаємо чат за поточним активним ID
    }

    /**
     * Додає повідомлення до поточного активного чату.
     * Обробляє збереження чату (через Chat.addMessage -> debouncedSave).
     * @param role Роль відправника ('user' або 'assistant').
     * @param content Вміст повідомлення.
     * @returns Додане повідомлення або null у разі помилки.
     */
    async addMessageToActiveChat(role: MessageRole, content: string): Promise<Message | null> {
        const activeChat = await this.getActiveChat(); // Переконуємося, що активний чат завантажено
        if (activeChat) {
            // Додавання повідомлення в об'єкт Chat (це викличе debouncedSave)
            const newMessage = activeChat.addMessage(role, content);
            console.log(`[ChatManager] Added ${role} message to active chat ${activeChat.metadata.id}. Timestamp: ${newMessage.timestamp.toISOString()}`);

            // Негайно оновлюємо метадані (lastModified) в індексі
            this.sessionIndex[activeChat.metadata.id] = { ...activeChat.metadata };
            delete (this.sessionIndex[activeChat.metadata.id] as any).id;
            this.saveChatIndex(); // Швидко зберігаємо оновлений індекс

            // Повідомляємо UI про нове повідомлення
            this.plugin.emit('message-added', { chatId: activeChat.metadata.id, message: newMessage });
            return newMessage;
        } else {
            console.error("[ChatManager] Cannot add message, no active chat found or loaded.");
            new Notice("Error: No active chat session to add message to.");
            return null;
        }
    }

    /** Очищує історію повідомлень у поточному активному чаті. */
    async clearActiveChatMessages(): Promise<void> {
        const activeChat = await this.getActiveChat();
        if (activeChat) {
            activeChat.clearMessages(); // clearMessages викликає збереження
            console.log(`[ChatManager] Messages cleared for active chat: ${activeChat.metadata.id}`);
            this.plugin.emit('messages-cleared', activeChat.metadata.id); // Повідомляємо UI
        } else {
            console.warn("[ChatManager] Cannot clear messages, no active chat.");
            new Notice("No active chat to clear.");
        }
    }

    /**
     * Оновлює метадані поточного активного чату.
     * @param updates Об'єкт з полями метаданих для оновлення (крім id, createdAt).
     */
    async updateActiveChatMetadata(updates: Partial<Omit<ChatMetadata, 'id' | 'createdAt'>>): Promise<void> {
        const activeChat = await this.getActiveChat();
        if (activeChat) {
            console.log(`[ChatManager] Updating metadata for active chat ${activeChat.metadata.id}:`, updates);
            activeChat.updateMetadata(updates); // updateMetadata викликає збереження

            // Оновлюємо копію метаданих в індексі
            this.sessionIndex[activeChat.metadata.id] = { ...activeChat.metadata };
            delete (this.sessionIndex[activeChat.metadata.id] as any).id;
            await this.saveChatIndex(); // Зберігаємо оновлений індекс

            // Повідомляємо UI про можливу зміну (наприклад, назви в списку)
            this.plugin.emit('chat-list-updated');
            // Якщо змінилася роль або модель, можливо, треба додаткові події?
            if (updates.modelName) {
                this.plugin.emit('model-changed', updates.modelName);
            }
            // Подію 'role-changed' краще викликати, коли користувач обирає роль у меню,
            // а не тут, щоб уникнути зайвих повідомлень.
        } else {
            console.warn("[ChatManager] Cannot update metadata, no active chat.");
            new Notice("No active chat to update metadata for.");
        }
    }

    /**
     * Видаляє чат за його ID: видаляє файл, оновлює індекс та кеш,
     * встановлює новий активний чат, якщо видалено поточний.
     * @param id Ідентифікатор чату для видалення.
     * @returns true, якщо видалення (або відсутність файлу) пройшло успішно, інакше false.
     */
    async deleteChat(id: string): Promise<boolean> {
        console.log(`[ChatManager] Attempting to delete chat ID: ${id}`);
        // Спочатку отримуємо об'єкт Chat, щоб знати шлях до файлу
        // Не використовуємо кеш тут, щоб переконатися, що ми намагаємося видалити правильний файл
        let chatToDelete: Chat | null = null;
        if (this.sessionIndex[id]) {
            const filePath = this.getChatFilePath(id);
            console.log(`[ChatManager] Found chat ${id} in index. File path: ${filePath}`);
            // Спробуємо завантажити, щоб отримати об'єкт Chat з правильним filePath
            // (можна оптимізувати, якщо Chat.deleteFile зробимо статичним, але так надійніше)
            const constructorSettings: ChatConstructorSettings = { ...this.plugin.settings };
            chatToDelete = await Chat.loadFromFile(filePath, this.adapter, constructorSettings);
            if (!chatToDelete) {
                // Якщо не вдалося завантажити, але є в індексі - можливо, файл вже видалено
                console.warn(`[ChatManager] Chat ${id} found in index but failed to load from file. Assuming deleted.`);
            }
        } else {
            console.warn(`[ChatManager] Cannot delete chat ${id}: Not found in index.`);
            return false; // Не знайдено в індексі
        }

        let deletedFile = false;
        if (chatToDelete) {
            // Видаляємо файл за допомогою методу об'єкта Chat
            deletedFile = await chatToDelete.deleteFile();
        } else {
            // Якщо об'єкт не завантажився, але був в індексі, вважаємо, що файл вже видалено
            deletedFile = true;
        }


        if (deletedFile) {
            console.log(`[ChatManager] File deletion successful (or file already missing) for chat ${id}`);
            // Видаляємо з індексу та кешу
            delete this.sessionIndex[id];
            delete this.loadedChats[id];
            await this.saveChatIndex();
            console.log(`[ChatManager] Removed chat ${id} from index and cache.`);

            // Якщо видалено активний чат, встановлюємо новий активний
            if (this.activeChatId === id) {
                console.log(`[ChatManager] Deleted chat was active. Selecting new active chat...`);
                const available = this.listAvailableChats();
                const nextActiveId = available.length > 0 ? available[0].id : null;
                await this.setActiveChat(nextActiveId); // Встановлюємо найновіший або null
            }

            this.plugin.emit('chat-list-updated'); // Повідомляємо UI
            return true;
        } else {
            // Помилка видалення файлу (повідомлення буде в Chat.deleteFile)
            console.error(`[ChatManager] File deletion failed for chat ${id}`);
            return false;
        }
    }

    /**
     * Перейменовує чат за його ID.
     * Оновлює назву в індексі та в метаданих завантаженого чату (якщо є),
     * і зберігає зміни в файлі чату.
     * @param id Ідентифікатор чату.
     * @param newName Нова назва чату.
     * @returns true, якщо перейменування успішне, інакше false.
     */
    async renameChat(id: string, newName: string): Promise<boolean> {
        const trimmedName = newName.trim();
        if (!trimmedName) { new Notice("Chat name cannot be empty."); return false; }

        if (this.sessionIndex[id]) {
            console.log(`[ChatManager] Renaming chat ${id} to "${trimmedName}"`);
            // 1. Оновлюємо індекс
            this.sessionIndex[id].name = trimmedName;
            this.sessionIndex[id].lastModified = new Date().toISOString();
            await this.saveChatIndex(); // Зберігаємо оновлений індекс

            // 2. Оновлюємо файл .json
            // Завантажуємо об'єкт Chat (з кешу або файлу)
            const chatToRename = await this.getChat(id);
            if (chatToRename) {
                console.log(`[ChatManager] Saving renamed chat ${id} to file: ${chatToRename.filePath}`);
                // Оновлюємо метадані в об'єкті Chat
                chatToRename.metadata.name = trimmedName;
                chatToRename.metadata.lastModified = this.sessionIndex[id].lastModified;
                // Зберігаємо файл негайно
                const saved = await chatToRename.saveImmediately();
                if (!saved) {
                    // Помилка збереження файлу - можливо, варто відкотити зміну в індексі?
                    console.error(`[ChatManager] Failed to save renamed chat file for ${id}. Index might be inconsistent.`);
                    new Notice(`Error saving renamed chat ${trimmedName}.`);
                    // Поки що не відкочуємо індекс, але логуємо помилку.
                    return false; // Повертаємо false через помилку збереження
                }
            } else {
                console.error(`[ChatManager] Failed to load chat ${id} to save rename after updating index.`);
                // Індекс оновлено, але файл - ні. Погана ситуація.
                new Notice(`Error saving renamed chat ${trimmedName}: Could not load chat data.`);
                return false; // Повертаємо false
            }

            console.log(`[ChatManager] Finished renaming chat ${id}`);
            this.plugin.emit('chat-list-updated'); // Повідомляємо UI
            return true;
        }
        console.warn(`[ChatManager] Cannot rename chat ${id}: Not found in index.`);
        new Notice(`Chat with ID ${id} not found.`);
        return false;
    }

} // End of ChatManager class