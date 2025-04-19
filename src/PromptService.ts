// PromptService.ts
import { App, normalizePath, TFile, Notice, FrontMatterCache } from 'obsidian';
import OllamaPlugin from './main';
import { Message, MessageRole } from './OllamaView';
import { ChatMetadata } from './Chat';
import { OllamaGenerateResponse } from './OllamaService';

// --- Інтерфейси (залишаємо як є, або синхронізуємо з RagService) ---
interface DocumentMetadata {
    filename?: string;
    source?: string; // 'source' використовувався раніше, можливо, залишити для сумісності
    path?: string;   // Додано шлях
    created?: number;
    modified?: number;
    'personal-logs'?: boolean; // Додано
    [key: string]: any;
}
interface DocumentVector { // Оновлено для відповідності RagService
    path: string;
    content: string;
    body?: string;
    metadata?: DocumentMetadata;
    score?: number; // Додано score
}
// --------------------------------------------------------------------

interface RoleDefinition {
    systemPrompt: string | null; // Тіло системного промпту ролі
    isProductivityPersona: boolean;
}

export class PromptService {
    private plugin: OllamaPlugin;
    private app: App;
    // Кешування залишається таким же
    private currentSystemPrompt: string | null = null;
    private currentRolePath: string | null = null;
    private roleCache: Record<string, RoleDefinition> = {};
    private modelDetailsCache: Record<string, any> = {}; // Кеш для деталей моделі (якщо використовується)

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
    }


    private _countTokens(text: string): number {
        if (!text) return 0;
        // Груба оцінка: ~4 символи на токен для англійської, може відрізнятися для української
        // Можливо, знадобиться точніший підрахунок залежно від моделі
        return Math.ceil(text.length / 4);
    }
    // --- Cache Clearing (Залишаємо як є) ---
    clearRoleCache(): void { /* ... */ }
    clearModelDetailsCache(): void { /* ... */ }
    // ----------------------------------------

    /**
     * Повертає фінальний системний промпт для API, включаючи інструкції для RAG.
     * @param chatMetadata Метадані поточного чату
     * @returns Рядок системного промпту або null.
     */
    async getSystemPromptForAPI(chatMetadata: ChatMetadata): Promise<string | null> {
        const settings = this.plugin.settings;

        // --- ДОДАЄМО ЛОГИ ДЛЯ ДІАГНОСТИКИ ---
        this.plugin.logger.debug(`[PromptService] getSystemPromptForAPI: Received chatMetadata.selectedRolePath = '${chatMetadata.selectedRolePath}'`);
        this.plugin.logger.debug(`[PromptService] getSystemPromptForAPI: Current settings.selectedRolePath = '${settings.selectedRolePath}'`);
        // --- КІНЕЦЬ ЛОГІВ ---


        // Визначаємо шлях: пріоритет у метаданих чату
        const selectedRolePath = chatMetadata.selectedRolePath !== undefined && chatMetadata.selectedRolePath !== null
            ? chatMetadata.selectedRolePath // Беремо з чату (може бути "")
            : settings.selectedRolePath;    // Або беремо з налаштувань (може бути "")

        // --- ЛОГ ВИЗНАЧЕНОГО ШЛЯХУ ---
        this.plugin.logger.debug(`[PromptService] getSystemPromptForAPI: Determined selectedRolePath = '${selectedRolePath}' before calling getRoleDefinition.`);
        // --- КІНЕЦЬ ЛОГУ ---


        // Перевіряємо, чи взагалі потрібно завантажувати роль
        let roleDefinition: RoleDefinition | null = null;
        if (selectedRolePath && settings.followRole) { // Порожній рядок "" дасть false тут
            this.plugin.logger.debug(`[PromptService] getSystemPromptForAPI: Attempting to load role definition for path: '${selectedRolePath}'`);
            roleDefinition = await this.getRoleDefinition(selectedRolePath);
        } else {
            this.plugin.logger.debug(`[PromptService] getSystemPromptForAPI: No role path ('${selectedRolePath}') or followRole is false ('${settings.followRole}'). Skipping role load.`);
        }


        // --- Базовий системний промпт з ролі (або null) ---
        // --- Базовий системний промпт з ролі (або null) ---
        let roleSystemPrompt = roleDefinition?.systemPrompt || null;
        // --------------------------------------------------

        // --- Інструкції для інтерпретації RAG даних ---
        const ragInstructions = `
--- RAG Data Interpretation Rules ---
1.  You have access to context from various files in the user's knowledge base provided under '### Context from User Notes:'.
2.  Context from files marked with "[Type: Personal Log]" in their header contains personal reflections, activities, or logs. Use this for analysis of personal state, mood, energy, and progress on personal goals.
3.  Assume ANY bullet point item (lines starting with '-', '*', '+') OR any line containing one or more hash tags (#tag) within ANY file's content represents a potential user goal, task, objective, idea, or key point. Use the surrounding text for context.
4.  You can refer to specific files by their names mentioned in the context document headers (e.g., "According to 'My Notes.md'..." or "Document 3 ('project_plan.md') states..."). Use the filename provided in the '--- Document X: filename.md ---' header.
5.  If the user asks about "available data", "all my notes", "summarize my RAG data", or similar general terms, base your answer on the entire provided context ('### Context from User Notes:').
--- End RAG Data Interpretation Rules ---
        `.trim();
        // ---------------------------------------------

        let finalSystemPrompt = "";

        // Додаємо інструкції RAG, якщо RAG увімкнено
        if (settings.ragEnabled && this.plugin.ragService) { // Перевіряємо і наявність сервісу
            finalSystemPrompt += ragInstructions + "\n\n";
        }

        // Додаємо системний промпт ролі (якщо він є)
        if (roleSystemPrompt) {
            finalSystemPrompt += roleSystemPrompt.trim();
        }

        // Опціонально: Додаємо динамічний час/дату для персон продуктивності
        // (Цей блок має йти ПІСЛЯ формування основного тексту промпту)
        if (roleDefinition?.isProductivityPersona && finalSystemPrompt) {
            const now = new Date();
            // TODO: Переконатись, що локаль коректна або передати її з налаштувань
            const formattedDate = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const formattedTime = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            finalSystemPrompt = finalSystemPrompt.replace(/\[Current Time\]/gi, formattedTime);
            finalSystemPrompt = finalSystemPrompt.replace(/\[Current Date\]/gi, formattedDate);
            // Можна додати [Location] аналогічно, якщо плагін має доступ до локації
        }

        // Повертаємо фінальний промпт або null, якщо він порожній
        const trimmedFinalPrompt = finalSystemPrompt.trim();
        console.log(`[PromptService] Final System Prompt Length: ${trimmedFinalPrompt.length} chars`);
        return trimmedFinalPrompt.length > 0 ? trimmedFinalPrompt : null;
    }


    /**
     * Завантажує визначення ролі (системний промпт + тип) з файлу або кешу.
     * (Залишаємо без змін, оскільки логіка завантаження файлу ролі коректна)
     */
    async getRoleDefinition(rolePath: string | null | undefined): Promise<RoleDefinition | null> {
        // ... (код getRoleDefinition залишається без змін) ...
        const normalizedPath = rolePath ? normalizePath(rolePath) : null;

        if (normalizedPath !== this.currentRolePath) {
            console.log(`[PromptService] Role path changed from ${this.currentRolePath} to ${normalizedPath}. Clearing cache for this path.`);
            if (normalizedPath && this.roleCache[normalizedPath]) {
                delete this.roleCache[normalizedPath];
            }
            this.currentRolePath = normalizedPath;
            this.currentSystemPrompt = null; // Важливо скинути
        } else if (normalizedPath && this.roleCache[normalizedPath]) {
            // console.log(`[PromptService] Returning cached role definition for: ${normalizedPath}`);
            this.currentSystemPrompt = this.roleCache[normalizedPath].systemPrompt;
            return this.roleCache[normalizedPath];
        }

        if (!normalizedPath || !this.plugin.settings.followRole) {
            // console.log("[PromptService] No role path or followRole disabled.");
            this.currentSystemPrompt = null;
            return { systemPrompt: null, isProductivityPersona: false };
        }

        console.log(`[PromptService] Loading role definition using metadataCache for: ${normalizedPath}`);
        const file = this.app.vault.getAbstractFileByPath(normalizedPath);

        if (file instanceof TFile) {
            try {
                const fileCache = this.app.metadataCache.getFileCache(file);
                const frontmatter = fileCache?.frontmatter;
                const frontmatterPos = fileCache?.frontmatterPosition;
                const content = await this.app.vault.cachedRead(file);

                // Витягуємо ТІЛЬКИ ТІЛО промпту
                const systemPromptBody = frontmatterPos?.end
                    ? content.substring(frontmatterPos.end.offset).trim()
                    : content.trim();

                const assistantType = frontmatter?.assistant_type?.toLowerCase();
                const isProductivity = assistantType === 'productivity' || frontmatter?.is_planner === true;

                const definition: RoleDefinition = {
                    systemPrompt: systemPromptBody || null, // Тіло промпту
                    isProductivityPersona: isProductivity
                };

                console.log(`[PromptService] Role loaded: ${normalizedPath}. Is Productivity Persona: ${isProductivity}. Prompt body length: ${definition.systemPrompt?.length || 0}`);
                this.roleCache[normalizedPath] = definition;
                this.currentSystemPrompt = definition.systemPrompt;
                return definition;

            } catch (error) {
                console.error(`[PromptService] Error processing role file ${normalizedPath}:`, error);
                new Notice(`Error loading role: ${file.basename}. Check console.`);
                this.currentSystemPrompt = null;
                return null;
            }
        } else {
            console.warn(`[PromptService] Role file not found or not a file: ${normalizedPath}`);
            this.currentSystemPrompt = null;
            return null;
        }
    }

    /**
     * Перевіряє, чи активна зараз роль "продуктивності".
     * (Залишаємо без змін)
     */
    private async _isProductivityPersonaActive(rolePath: string | null | undefined): Promise<boolean> {
        // ... (код _isProductivityPersonaActive залишається без змін) ...
        if (!this.plugin.settings.enableProductivityFeatures) {
            return false;
        }
        const roleDefinition = await this.getRoleDefinition(rolePath);
        return roleDefinition?.isProductivityPersona ?? false;
    }

    /**
     * Готує повний промпт для API, включаючи історію, контекст завдань та RAG.
     */
    async prepareFullPrompt(history: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
        console.log("[PromptService] Preparing full prompt body...");
        const settings = this.plugin.settings;
        const selectedRolePath = chatMetadata.selectedRolePath || settings.selectedRolePath;
        const isProductivityActive = await this._isProductivityPersonaActive(selectedRolePath);
        console.log(`[PromptService] Productivity features active for this request: ${isProductivityActive}`);

        // --- Контекст завдань (якщо активний) ---
        let taskContext = "";
        if (isProductivityActive && this.plugin.chatManager) { // Додано перевірку наявності chatManager
            // ... (логіка отримання taskContext залишається без змін, але переконайтесь, що this.plugin.chatManager існує) ...
            if (this.plugin.chatManager?.filePlanExists) {
                const needsUpdateBefore = this.plugin.isTaskFileUpdated?.(); // Використовуємо ?. для безпеки
                await this.plugin.checkAndProcessTaskUpdate?.();
                const tasksWereUpdated = needsUpdateBefore && !this.plugin.isTaskFileUpdated?.();

                taskContext = tasksWereUpdated
                    ? "\n--- Updated Tasks Context ---\n"
                    : "\n--- Today's Tasks Context ---\n";
                taskContext += `Urgent: ${this.plugin.chatManager.fileUrgentTasks.length > 0 ? this.plugin.chatManager.fileUrgentTasks.join(', ') : "None"}\n`;
                taskContext += `Other: ${this.plugin.chatManager.fileRegularTasks.length > 0 ? this.plugin.chatManager.fileRegularTasks.join(', ') : "None"}\n`;
                taskContext += "--- End Tasks Context ---";
                console.log(`[PromptService] Injecting task context (Updated: ${tasksWereUpdated}).`);
            }
        }
        // -----------------------------------------

        // --- Розрахунок токенів для історії ---
        const approxContextTokens = this._countTokens(taskContext);
        // Залишаємо трохи більше місця для RAG та інших частин
        const maxHistoryTokens = settings.contextWindow - approxContextTokens - (settings.ragEnabled ? 500 : 200); // Збільшено запас для RAG
        console.log(`[PromptService] Max tokens for history processing: ${maxHistoryTokens}`);
        // ---------------------------------------

        // --- Обробка історії (Simple або Advanced) ---
        let processedHistoryString = "";
        if (isProductivityActive && settings.useAdvancedContextStrategy) {
            processedHistoryString = await this._buildAdvancedContext(history, chatMetadata, maxHistoryTokens);
        } else {
            processedHistoryString = this._buildSimpleContext(history, maxHistoryTokens);
        }
        // --------------------------------------------

        // --- Отримання RAG контексту ---
        let ragContext = "";
        if (settings.ragEnabled && this.plugin.ragService) {
            const lastUserMessage = history.findLast(m => m.role === 'user');
            if (lastUserMessage?.content) {
                try {
                    // Викликаємо оновлений prepareContext
                    ragContext = await this.plugin.ragService.prepareContext(lastUserMessage.content);
                    if (ragContext) {
                        console.log(`[PromptService] RAG context added (${this._countTokens(ragContext)} tokens).`);
                    } else {
                        console.log("[PromptService] RAG enabled, but no relevant documents found for the last query.");
                    }
                } catch (error) {
                    console.error("[PromptService] Error getting RAG context:", error);
                    ragContext = "\n[Error retrieving RAG context]\n"; // Повідомляємо про помилку
                }
            } else {
                console.log("[PromptService] RAG enabled, but no last user message found to generate context.");
            }
        }
        // --------------------------------

        // --- Формування фінального тіла промпту ---
        // Порядок: RAG -> Завдання -> Історія
        const finalPromptBody = `${ragContext}${taskContext}\n\n### Conversation History:\n${processedHistoryString}`.trim();
        // ----------------------------------------

        console.log(`[PromptService] Final prompt body length (approx tokens): ${this._countTokens(finalPromptBody)}`);
        return finalPromptBody; // Повертаємо ТІЛЬКИ ТІЛО промпту
    }


    // --- Методи обробки контексту та підсумовування ---
    // (Залишаються без змін, використовують this._countTokens)
    // --- ВИПРАВЛЕННЯ: Повна реалізація _buildSimpleContext ---
    private _buildSimpleContext(history: Message[], maxTokens: number): string {
        let context = "";
        let currentTokens = 0;
        // Проходимо історію з кінця до початку
        for (let i = history.length - 1; i >= 0; i--) {
            const message = history[i];
            const formattedMessage = `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content.trim()}`;
            const messageTokens = this._countTokens(formattedMessage) + 5; // +5 для роздільників/ролі
            if (currentTokens + messageTokens <= maxTokens) {
                // Додаємо повідомлення на початок контексту
                context = formattedMessage + "\n\n" + context;
                currentTokens += messageTokens;
            } else {
                console.log(`[PromptService] Simple context limit reached (${currentTokens}/${maxTokens} tokens).`);
                break; // Зупиняємось, коли ліміт вичерпано
            }
        }
        return context.trim(); // Повертаємо зібраний контекст
    }
    // -------------------------------------------------------

    // --- ВИПРАВЛЕННЯ: Повна реалізація _buildAdvancedContext ---
    private async _buildAdvancedContext(history: Message[], chatMetadata: ChatMetadata, maxTokens: number): Promise<string> {
        console.log("[PromptService] Building advanced context...");
        const settings = this.plugin.settings;
        const processedParts: string[] = [];
        let currentTokens = 0;
        const keepN = Math.min(history.length, settings.keepLastNMessagesBeforeSummary || 3); // Використовуємо налаштування або 3 за замовчуванням
        const messagesToKeep = history.slice(-keepN);
        const messagesToProcess = history.slice(0, -keepN);
        console.log(`[PromptService] Advanced Context: Keeping last ${messagesToKeep.length}, processing ${messagesToProcess.length} older messages.`);

        if (messagesToProcess.length > 0) {
            if (settings.enableSummarization) {
                console.log("[PromptService] Summarization enabled...");
                let remainingMessages = [...messagesToProcess];
                // Обробляємо старі повідомлення чанками (з кінця до початку масиву remainingMessages)
                while (remainingMessages.length > 0) {
                    let chunkTokens = 0;
                    let chunkMessages: Message[] = [];
                    // Набираємо чанк, поки не перевищимо ліміт розміру чанку
                    while (remainingMessages.length > 0 && chunkTokens < (settings.summarizationChunkSize || 1000)) { // Використовуємо налаштування або 1000
                        const msg = remainingMessages[remainingMessages.length - 1]; // Беремо останній
                        const msgText = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.trim()}`;
                        const msgTokens = this._countTokens(msgText) + 5;

                        if (chunkTokens + msgTokens <= (settings.summarizationChunkSize || 1000)) {
                            chunkMessages.unshift(remainingMessages.pop()!); // Додаємо на початок chunkMessages і видаляємо з remaining
                            chunkTokens += msgTokens;
                        } else {
                            break; // Чанк повний
                        }
                    }

                    if (chunkMessages.length > 0) {
                        const chunkCombinedText = chunkMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n\n");
                        const actualChunkTokens = this._countTokens(chunkCombinedText);

                        // Перевіряємо, чи вміщується чанк/його саммарі в загальний ліміт maxTokens
                        if (currentTokens + actualChunkTokens <= maxTokens) {
                            console.log(`[PromptService] Adding chunk (${actualChunkTokens} tokens) directly.`);
                            processedParts.unshift(chunkCombinedText); // Додаємо чанк на початок масиву результатів
                            currentTokens += actualChunkTokens;
                        } else {
                            console.log(`[PromptService] Chunk (${actualChunkTokens} tokens) too large or exceeds maxTokens. Summarizing.`);
                            const summary = await this._summarizeMessages(chunkMessages, chatMetadata); // Отримуємо саммарі
                            if (summary) {
                                const summaryText = `[Summary of previous messages]:\n${summary}`;
                                const summaryTokens = this._countTokens(summaryText) + 10; // Враховуємо токени саммарі
                                if (currentTokens + summaryTokens <= maxTokens) {
                                    console.log(`[PromptService] Adding summary (${summaryTokens} tokens).`);
                                    processedParts.unshift(summaryText); // Додаємо саммарі на початок
                                    currentTokens += summaryTokens;
                                } else {
                                    console.warn(`[PromptService] Summary too large to fit (${summaryTokens} tokens). Skipping.`);
                                    break; // Немає сенсу обробляти далі, якщо навіть саммарі не влазить
                                }
                            } else {
                                console.warn("[PromptService] Summarization failed or returned null. Skipping chunk.");
                                // Можна вирішити не переривати, а просто пропустити цей чанк
                            }
                        }
                    }
                } // end while remainingMessages
            } else { // Якщо самуризація вимкнена
                console.log("[PromptService] Summarization disabled. Including older messages directly if space allows.");
                let olderHistoryString = this._buildSimpleContext(messagesToProcess, maxTokens - currentTokens); // Спробуємо вмістити старі повідомлення
                if (olderHistoryString) {
                    processedParts.unshift(olderHistoryString); // Додаємо на початок
                    currentTokens += this._countTokens(olderHistoryString);
                } else {
                    console.log("[PromptService] Not enough space for older messages without summarization.");
                }
            }
        }

        // Додаємо останні N повідомлень, які ми залишили
        const keepHistoryString = messagesToKeep.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n\n");
        const keepHistoryTokens = this._countTokens(keepHistoryString);
        if (currentTokens + keepHistoryTokens <= maxTokens) {
            processedParts.push(keepHistoryString); // Додаємо в кінець масиву результатів
            currentTokens += keepHistoryTokens;
        } else {
            // Якщо навіть останні N повідомлень не влазять, обрізаємо їх
            console.warn(`[PromptService] Cannot fit all 'keepLastNMessages'. Truncating.`);
            const truncatedKeepHistory = this._buildSimpleContext(messagesToKeep, maxTokens - currentTokens);
            if (truncatedKeepHistory) {
                processedParts.push(truncatedKeepHistory);
                currentTokens += this._countTokens(truncatedKeepHistory);
            }
        }
        console.log(`[PromptService] Advanced context built. Total approx tokens: ${currentTokens}`);
        return processedParts.join("\n\n").trim(); // Повертаємо зібраний рядок
    }
    // --------------------------------------------------------

    // --- ВИПРАВЛЕННЯ: Повна реалізація _summarizeMessages ---
    private async _summarizeMessages(messagesToSummarize: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
        if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0) {
            return null; // Повертаємо null, якщо вимкнено або немає чого сумувати
        }
        console.log(`[PromptService] Summarizing chunk of ${messagesToSummarize.length} messages...`);
        const textToSummarize = messagesToSummarize.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n");

        // Перевіряємо, чи є текст для сумування
        if (!textToSummarize.trim()) {
            console.log("[PromptService] No actual text content in messages to summarize.");
            return null;
        }

        // Використовуємо промпт з налаштувань, замінюючи плейсхолдер
        const summarizationPromptTemplate = this.plugin.settings.summarizationPrompt || "Summarize the following conversation concisely:\n\n{text_to_summarize}";
        const summarizationFullPrompt = summarizationPromptTemplate.replace('{text_to_summarize}', textToSummarize);

        const modelName = chatMetadata.modelName || this.plugin.settings.modelName;
        // Важливо: Контекстне вікно для сумування може бути меншим, ніж основне
        const summarizationContextWindow = Math.min(this.plugin.settings.contextWindow || 4096, 4096); // Наприклад, обмежуємо 4096

        // Формуємо тіло запиту
        const requestBody = {
            model: modelName,
            prompt: summarizationFullPrompt,
            stream: false,
            temperature: 0.3, // Низька температура для більш передбачуваного саммарі
            options: {
                num_ctx: summarizationContextWindow, // Використовуємо окремий ліміт
                // Можна додати stop токени, якщо потрібно
            },
            // Системний промпт для сумаризації
            system: "You are a helpful assistant specializing in concisely summarizing conversation history. Focus on extracting key points and decisions."
        };

        try {
            if (!this.plugin.ollamaService) {
                console.error("[PromptService] OllamaService is not available for summarization.");
                return null; // Повертаємо null, якщо сервіс недоступний
            }
            // Викликаємо метод для сирого запиту
            const responseData: OllamaGenerateResponse = await this.plugin.ollamaService.generateRaw(requestBody);

            // Перевіряємо відповідь
            if (responseData && typeof responseData.response === 'string') {
                const summary = responseData.response.trim();
                console.log(`[PromptService] Summarization successful (${this._countTokens(summary)} tokens).`);
                return summary; // Повертаємо отримане саммарі
            } else {
                console.warn("[PromptService] Summarization request returned unexpected structure:", responseData);
                return null; // Повертаємо null при несподіваній відповіді
            }
        } catch (error) {
            console.error("[PromptService] Error during summarization request:", error);
            return null; // Повертаємо null при помилці запиту
        }
    }
    // -------------------------------------------------

} // End of PromptService class