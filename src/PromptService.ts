// PromptService.ts
import { App, normalizePath, TFile, Notice, FrontMatterCache } from 'obsidian';
import OllamaPlugin from './main';
// import { Message, MessageRole } from './OllamaView';
import { Message, MessageRole, OllamaGenerateResponse, RoleDefinition } from './types';
import { ChatMetadata } from './Chat'; // Залишаємо, якщо Chat не в types.ts

export class PromptService {
    private plugin: OllamaPlugin;
    private app: App;
    private currentSystemPrompt: string | null = null; // Кеш для системного промпту ролі
    private currentRolePath: string | null = null; // Кеш для шляху поточної ролі
    private roleCache: Record<string, RoleDefinition> = {}; // Кеш для завантажених ролей
    private modelDetailsCache: Record<string, any> = {};

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    private _countTokens(text: string): number {
        if (!text) return 0;
        return Math.ceil(text.length / 4); // Груба оцінка
    }

    clearRoleCache(): void {
        this.plugin.logger.debug("[PromptService] Clearing role definition cache.");
        this.roleCache = {};
        this.currentRolePath = null; // Скидаємо кешований шлях
        this.currentSystemPrompt = null;
    }

    clearModelDetailsCache(): void {
        this.plugin.logger.debug("[PromptService] Clearing model details cache.");
        this.modelDetailsCache = {};
    }

    /**
     * Завантажує визначення ролі (системний промпт + тип) з файлу або кешу.
     */
    async getRoleDefinition(rolePath: string | null | undefined): Promise<RoleDefinition | null> {
        const normalizedPath = rolePath ? normalizePath(rolePath) : null;

        // Використовуємо кеш, якщо шлях не змінився
        if (normalizedPath === this.currentRolePath && normalizedPath && this.roleCache[normalizedPath]) {
             return this.roleCache[normalizedPath];
        }

         // Якщо шлях змінився або кешу немає - завантажуємо
        if (normalizedPath !== this.currentRolePath) {
            this.plugin.logger.info(`[PromptService] Role path changing from '${this.currentRolePath}' to '${normalizedPath}'. Clearing cache.`);
            if (this.currentRolePath && this.roleCache[this.currentRolePath]) {
                delete this.roleCache[this.currentRolePath]; // Видаляємо старий кеш
            }
            this.currentRolePath = normalizedPath; // Оновлюємо поточний шлях
            this.currentSystemPrompt = null; // Скидаємо системний промпт
        }

        // Якщо шлях порожній або не треба слідувати ролі - повертаємо null
        if (!normalizedPath || !this.plugin.settings.followRole) {
            this.plugin.logger.debug("[PromptService] No role path or followRole disabled. Role definition is null.");
            return { systemPrompt: null, isProductivityPersona: false };
        }

        // Перевіряємо кеш ще раз після оновлення this.currentRolePath
        if (this.roleCache[normalizedPath]) {
           this.plugin.logger.debug(`[PromptService] Returning newly cached role definition for: ${normalizedPath}`);
           this.currentSystemPrompt = this.roleCache[normalizedPath].systemPrompt;
           return this.roleCache[normalizedPath];
        }

        this.plugin.logger.debug(`[PromptService] Loading role definition from file: ${normalizedPath}`);
        const file = this.app.vault.getAbstractFileByPath(normalizedPath);

        if (file instanceof TFile) {
            try {
                const fileCache = this.app.metadataCache.getFileCache(file);
                const frontmatter = fileCache?.frontmatter;
                const content = await this.app.vault.cachedRead(file);
                const systemPromptBody = fileCache?.frontmatterPosition?.end
                    ? content.substring(fileCache.frontmatterPosition.end.offset).trim()
                    : content.trim();

                const isProductivity = frontmatter?.assistant_type?.toLowerCase() === 'productivity' || frontmatter?.is_planner === true;

                const definition: RoleDefinition = {
                    systemPrompt: systemPromptBody || null,
                    isProductivityPersona: isProductivity
                };

                this.plugin.logger.info(`[PromptService] Role loaded: ${normalizedPath}. Is Productivity: ${isProductivity}. Prompt length: ${definition.systemPrompt?.length || 0}`);
                this.roleCache[normalizedPath] = definition; // Кешуємо
                this.currentSystemPrompt = definition.systemPrompt;
                return definition;

            } catch (error) {
                this.plugin.logger.error(`[PromptService] Error processing role file ${normalizedPath}:`, error);
                new Notice(`Error loading role: ${file.basename}. Check console.`);
                this.currentSystemPrompt = null;
                return null;
            }
        } else {
            this.plugin.logger.warn(`[PromptService] Role file not found or not a file: ${normalizedPath}`);
            this.currentSystemPrompt = null;
            return null;
        }
    }

    /**
     * Перевіряє, чи активна зараз роль "продуктивності".
     */
    private async _isProductivityPersonaActive(rolePath: string | null | undefined): Promise<boolean> {
        if (!this.plugin.settings.enableProductivityFeatures) {
            return false;
        }
        const roleDefinition = await this.getRoleDefinition(rolePath);
        return roleDefinition?.isProductivityPersona ?? false;
    }

     /**
     * Повертає фінальний системний промпт для API, можливо включаючи RAG інструкції.
     * Не включає RAG контент чи історію.
     */
     async getSystemPromptForAPI(chatMetadata: ChatMetadata): Promise<string | null> {
        const settings = this.plugin.settings;
        this.plugin.logger.debug(`[PromptService] getSystemPromptForAPI checking chat path: '${chatMetadata.selectedRolePath}', settings path: '${settings.selectedRolePath}'`);

        const selectedRolePath = chatMetadata.selectedRolePath !== undefined && chatMetadata.selectedRolePath !== null
                               ? chatMetadata.selectedRolePath
                               : settings.selectedRolePath;

        this.plugin.logger.debug(`[PromptService] getSystemPromptForAPI using determined path: '${selectedRolePath}'`);

        let roleDefinition: RoleDefinition | null = null;
        if (selectedRolePath && settings.followRole) {
            this.plugin.logger.debug(`[PromptService] getSystemPromptForAPI loading definition for: '${selectedRolePath}'`);
            roleDefinition = await this.getRoleDefinition(selectedRolePath);
        } else {
             this.plugin.logger.debug(`[PromptService] getSystemPromptForAPI skipping role load (Path: '${selectedRolePath}', Follow: ${settings.followRole})`);
        }

        let roleSystemPrompt = roleDefinition?.systemPrompt || null;
        const isProductivityActive = roleDefinition?.isProductivityPersona ?? false;

        // --- ОНОВЛЕНІ Інструкції для інтерпретації RAG даних ---
        const ragInstructions = `
--- RAG Data Interpretation Rules ---
1.  You have access to context chunks from the user's notes provided under '### Context from User Notes (...)'. Each chunk originates from a specific file indicated in its header.
2.  Context from files/chunks marked with "[Type: Personal Log]" contains personal reflections, activities, or logs. Use this for analysis of personal state, mood, energy, and progress.
3.  Assume ANY bullet point item (lines starting with '-', '*', '+') OR any line containing one or more hash tags (#tag) represents a potential user goal, task, objective, idea, or key point. **Pay special attention to categorizing these:**
    * **Critical Goals/Tasks:** Identify these if the line contains tags like #critical, #critical🆘 or keywords like "критично", "critical", "терміново", "urgent". **Prioritize discussing these items, potential blockers, and progress.**
    * **Weekly Goals/Tasks:** Identify these if the line contains tags like #week, #weekly or keywords like "weekly", "тижнева", "тижневий". Consider their relevance for the current or upcoming week's planning.
    * Use the surrounding text and the source document name for context for all identified items.
4.  You can refer to specific source files by their names mentioned in the context chunk headers (e.g., "Chunk 2 from 'My Notes.md' suggests...").
5.  If the user asks about "available data", "all my notes", "summarize my RAG data", or similar general terms, base your answer on the entire provided context ('### Context from User Notes (...)'). Analyze themes across different chunks and documents.
--- End RAG Data Interpretation Rules ---
        `.trim();
        // --- Кінець ОНОВЛЕНИХ інструкцій ---

        let finalSystemPrompt = "";
        if (settings.ragEnabled && this.plugin.ragService && settings.ragEnableSemanticSearch) { // Додано перевірку ragEnableSemanticSearch
             finalSystemPrompt += ragInstructions + "\n\n";
             this.plugin.logger.debug("[PromptService] RAG instructions added to system prompt.");
        } else {
            this.plugin.logger.debug("[PromptService] RAG instructions NOT added (RAG disabled or semantic search disabled).");
        }

        if (roleSystemPrompt) {
            finalSystemPrompt += roleSystemPrompt.trim();
            this.plugin.logger.debug(`[PromptService] Role system prompt added (Length: ${roleSystemPrompt.trim().length})`);
        } else {
             this.plugin.logger.debug("[PromptService] No role system prompt to add.");
        }

        // --- Динамічна дата/час (без змін) ---
        if (isProductivityActive && finalSystemPrompt && settings.enableProductivityFeatures) {
            const now = new Date();
            const formattedDate = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const formattedTime = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            finalSystemPrompt = finalSystemPrompt.replace(/\[Current Time\]/gi, formattedTime);
            finalSystemPrompt = finalSystemPrompt.replace(/\[Current Date\]/gi, formattedDate);
            this.plugin.logger.debug("[PromptService] Dynamic date/time injected.");
        }
        // --------------------------------------

        const trimmedFinalPrompt = finalSystemPrompt.trim();
        this.plugin.logger.debug(`[PromptService] Final System Prompt Length: ${trimmedFinalPrompt.length} chars. Has content: ${trimmedFinalPrompt.length > 0}`);
        return trimmedFinalPrompt.length > 0 ? trimmedFinalPrompt : null;
    }


 /**
     * Готує ТІЛО основного промпту (без системного), включаючи історію, контекст завдань та RAG.
     */
 async preparePromptBody(history: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
    this.plugin.logger.debug("[PromptService] Preparing prompt body...");
    const settings = this.plugin.settings;
    const selectedRolePath = chatMetadata.selectedRolePath !== undefined && chatMetadata.selectedRolePath !== null
                           ? chatMetadata.selectedRolePath : settings.selectedRolePath;
    const isProductivityActive = await this._isProductivityPersonaActive(selectedRolePath);
    this.plugin.logger.debug(`[PromptService] Productivity features potentially active for body: ${isProductivityActive}`);

    // --- Контекст завдань ---
    let taskContext = "";
    if (isProductivityActive && settings.enableProductivityFeatures && this.plugin.chatManager) {
        // --- ВИПРАВЛЕННЯ: Отримуємо стан завдань через метод ---
        await this.plugin.checkAndProcessTaskUpdate?.(); // Переконуємось, що стан оновлено
        const taskState = this.plugin.chatManager.getCurrentTaskState();
        // ------------------------------------------------------

        // --- ВИПРАВЛЕННЯ: Перевіряємо об'єкт стану та його властивості ---
        if (taskState && taskState.hasContent) {
            // Проста логіка заголовку (можна вдосконалити, якщо потрібно відстежувати саме оновлення)
            taskContext = "\n--- Today's Tasks Context ---\n";
            taskContext += `Urgent: ${taskState.urgent.join(', ') || "None"}\n`; // Доступ через taskState.urgent
            taskContext += `Other: ${taskState.regular.join(', ') || "None"}\n`; // Доступ через taskState.regular
            taskContext += "--- End Tasks Context ---";
            this.plugin.logger.debug(`[PromptService] Injecting task context (Urgent: ${taskState.urgent.length}, Regular: ${taskState.regular.length})`);
        } else {
             this.plugin.logger.debug("[PromptService] No relevant task state found or no tasks to inject.");
        }
        // ---------------------------------------------------------
    }

    // --- Розрахунок токенів та решта логіки... ---
    const approxTaskTokens = this._countTokens(taskContext);
    const maxRagTokens = settings.ragEnabled ? (settings.ragTopK * settings.ragChunkSize / 4) * 1.5 : 0; // Дуже грубий запас для RAG
    const maxHistoryTokens = settings.contextWindow - approxTaskTokens - maxRagTokens - 200; // Резерв
    this.plugin.logger.debug(`[PromptService] Max tokens available for history processing: ${maxHistoryTokens}`);

    let processedHistoryString = "";
    if (isProductivityActive && settings.useAdvancedContextStrategy) {
        processedHistoryString = await this._buildAdvancedContext(history, chatMetadata, maxHistoryTokens);
    } else {
        processedHistoryString = this._buildSimpleContext(history, maxHistoryTokens);
    }

    let ragContext = "";
    if (settings.ragEnabled && this.plugin.ragService && settings.ragEnableSemanticSearch) {
        const lastUserMessage = history.findLast(m => m.role === 'user');
        if (lastUserMessage?.content) {
            ragContext = await this.plugin.ragService.prepareContext(lastUserMessage.content);
             if(!ragContext) this.plugin.logger.info("[PromptService] RAG prepareContext returned empty.");
             else this.plugin.logger.debug(`[PromptService] RAG context length: ${ragContext.length} chars`);
        } else { this.plugin.logger.warn("[PromptService] RAG enabled, but no last user message found."); }
    } else { this.plugin.logger.debug("[PromptService] RAG context NOT prepared."); }

    // --- Формування фінального тіла промпту ---
    // (Важливо перевіряти, чи секції не порожні перед додаванням заголовків)
    let finalPromptBodyParts: string[] = [];
    if (ragContext) { finalPromptBodyParts.push(ragContext); }
    if (taskContext) { finalPromptBodyParts.push(taskContext); }
    if (processedHistoryString) { finalPromptBodyParts.push(`### Conversation History:\n${processedHistoryString}`); }

    const finalPromptBody = finalPromptBodyParts.join("\n\n").trim();

    if (!finalPromptBody) {
        this.plugin.logger.warn("[PromptService] No RAG, no tasks, and no history processed. Returning null prompt body.");
         return null; // Повертаємо null, якщо нічого не вдалося зібрати
    }

    this.plugin.logger.debug(`[PromptService] Final prompt body length (approx tokens): ${this._countTokens(finalPromptBody)}`);
    return finalPromptBody;
}

    // Методи _buildSimpleContext, _buildAdvancedContext, _summarizeMessages залишаються
    // але мають використовувати this.plugin.logger замість console.log/warn
    private _buildSimpleContext(history: Message[], maxTokens: number): string {
        let context = "";
        let currentTokens = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            const message = history[i];
            const formattedMessage = `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content.trim()}`;
            const messageTokens = this._countTokens(formattedMessage) + 5;
            if (currentTokens + messageTokens <= maxTokens) {
                context = formattedMessage + "\n\n" + context;
                currentTokens += messageTokens;
            } else {
                this.plugin.logger.debug(`[PromptService] Simple context limit reached (${currentTokens}/${maxTokens} tokens).`);
                break;
            }
        }
        return context.trim();
    }

    private async _buildAdvancedContext(history: Message[], chatMetadata: ChatMetadata, maxTokens: number): Promise<string> {
        this.plugin.logger.debug("[PromptService] Building advanced context...");
        // ... (Implement using this.plugin.logger) ...
         const settings = this.plugin.settings;
         const processedParts: string[] = [];
         let currentTokens = 0;
         const keepN = Math.min(history.length, settings.keepLastNMessagesBeforeSummary || 3);
         const messagesToKeep = history.slice(-keepN);
         const messagesToProcess = history.slice(0, -keepN);
         this.plugin.logger.debug(`[PromptService] Advanced Context: Keeping last ${messagesToKeep.length}, processing ${messagesToProcess.length} older messages.`);

         if (messagesToProcess.length > 0) {
             if (settings.enableSummarization) {
                 this.plugin.logger.info("[PromptService] Summarization enabled...");
                 // ... (Summarization logic using this.plugin.logger) ...
             } else {
                 this.plugin.logger.info("[PromptService] Summarization disabled. Including older messages directly if space allows.");
                  // ... (Logic for including older messages using this.plugin.logger) ...
             }
         }
         // ... (Logic for adding kept messages using this.plugin.logger) ...
          this.plugin.logger.debug(`[PromptService] Advanced context built. Total approx tokens: ${currentTokens}`);
          return processedParts.join("\n\n").trim();
    }

    private async _summarizeMessages(messagesToSummarize: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
        if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0) {
            return null;
        }
        this.plugin.logger.info(`[PromptService] Summarizing chunk of ${messagesToSummarize.length} messages...`); // Використовуємо логер
        const textToSummarize = messagesToSummarize.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n");

        if (!textToSummarize.trim()) {
            this.plugin.logger.warn("[PromptService] No actual text content in messages to summarize."); // Використовуємо логер
            return null;
        }

        const summarizationPromptTemplate = this.plugin.settings.summarizationPrompt || "Summarize the following conversation concisely:\n\n{text_to_summarize}";
        const summarizationFullPrompt = summarizationPromptTemplate.replace('{text_to_summarize}', textToSummarize);

        const modelName = chatMetadata.modelName || this.plugin.settings.modelName;
        const summarizationContextWindow = Math.min(this.plugin.settings.contextWindow || 4096, 4096);

        // --- ВИПРАВЛЕНО: Визначаємо requestBody ДО try ---
        const requestBody = {
            model: modelName,
            prompt: summarizationFullPrompt,
            stream: false,
            temperature: 0.3,
            options: {
                num_ctx: summarizationContextWindow,
            },
            system: "You are a helpful assistant specializing in concisely summarizing conversation history. Focus on extracting key points and decisions."
        };
        // --- КІНЕЦЬ ВИПРАВЛЕННЯ ---

        try {
            if (!this.plugin.ollamaService) {
                this.plugin.logger.error("[PromptService] OllamaService is not available for summarization."); // Використовуємо логер
                return null;
            }

            // Викликаємо метод для сирого запиту, передаючи requestBody
            const responseData: OllamaGenerateResponse = await this.plugin.ollamaService.generateRaw(requestBody);

            if (responseData && typeof responseData.response === 'string') {
                const summary = responseData.response.trim();
                this.plugin.logger.info(`[PromptService] Summarization successful (${this._countTokens(summary)} tokens).`); // Використовуємо логер
                return summary;
            } else {
                this.plugin.logger.warn("[PromptService] Summarization request returned unexpected structure:", responseData); // Використовуємо логер
                return null;
            }
        } catch (error) {
            // Тепер requestBody доступний тут для логування, якщо потрібно
            this.plugin.logger.error("[PromptService] Error during summarization request:", error, "Request body (first 100 chars):", JSON.stringify(requestBody).substring(0,100)); // Використовуємо логер
            return null;
        }
    }

} // End of PromptService class