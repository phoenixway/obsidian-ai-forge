// PromptService.ts
import { App, normalizePath, TFile, Notice, FrontMatterCache } from 'obsidian';
import OllamaPlugin from './main';
import { Message, MessageRole } from './OllamaView';
import { ChatMetadata } from './Chat';
import { OllamaGenerateResponse } from './OllamaService';

// Інтерфейс для результатів RAG (збігається з DocumentVector у RagService)
interface DocumentMetadata {
    filename?: string;
    source?: string; // Додаємо source як альтернативу
    created?: number;
    modified?: number;
    [key: string]: any;
}
interface DocumentVector {
    path: string;
    content: string;
    metadata?: DocumentMetadata;
    score?: number; // Опціонально
}

// Інтерфейс для визначення ролі
interface RoleDefinition {
    systemPrompt: string | null;
    isProductivityPersona: boolean;
}

export class PromptService {
    private plugin: OllamaPlugin;
    private app: App;
    private currentSystemPrompt: string | null = null;
    private currentRolePath: string | null = null;
    private roleCache: Record<string, RoleDefinition> = {};
    private modelDetailsCache: Record<string, any> = {};

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    // --- Приватний метод для підрахунку токенів ---
    private _countTokens(text: string): number {
        if (!text) return 0;
        return Math.ceil(text.length / 4); // Груба оцінка
    }
    // ---------------------------------------------

    clearRoleCache(): void {
        console.log("[PromptService] Clearing role definition cache.");
        this.roleCache = {};
        this.currentSystemPrompt = null;
        this.currentRolePath = null;
    }

    clearModelDetailsCache(): void {
        console.log("[PromptService] Clearing model details cache.");
        this.modelDetailsCache = {};
    }

    /**
     * Повертає поточний *тіло* системного промпту (без frontmatter).
     * Гарантує, що роль завантажена для поточного шляху.
     * @returns Тіло системного промпту або null.
     */
    async getSystemPromptForAPI(chatMetadata: ChatMetadata): Promise<string | null> {
        const selectedRolePath = chatMetadata.selectedRolePath || this.plugin.settings.selectedRolePath;
        const roleDefinition = await this.getRoleDefinition(selectedRolePath);
        let systemPrompt = roleDefinition?.systemPrompt || null;

        // Опціонально: Додаємо динамічний час/дату для персон продуктивності
        if (roleDefinition?.isProductivityPersona && systemPrompt) {
            const now = new Date();
            const formattedDate = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const formattedTime = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            // Замінюємо плейсхолдери (якщо вони є в промпті ролі)
            systemPrompt = systemPrompt.replace(/\[Current Time\]/gi, formattedTime);
            systemPrompt = systemPrompt.replace(/\[Current Date\]/gi, formattedDate);
            // Можна додати [Location] аналогічно, якщо потрібно
        }

        return systemPrompt;
    }


    async getRoleDefinition(rolePath: string | null | undefined): Promise<RoleDefinition | null> {
        const normalizedPath = rolePath ? normalizePath(rolePath) : null;

        // Оновлюємо лише якщо шлях дійсно змінився, щоб уникнути зайвих перезавантажень
        if (normalizedPath !== this.currentRolePath) {
            console.log(`[PromptService] Role path changed from ${this.currentRolePath} to ${normalizedPath}. Clearing cache for this path.`);
            if (normalizedPath && this.roleCache[normalizedPath]) {
                delete this.roleCache[normalizedPath]; // Видаляємо старий кеш для цього шляху
            }
            this.currentRolePath = normalizedPath; // Встановлюємо новий шлях
            this.currentSystemPrompt = null; // Скидаємо поточний системний промпт
        } else if (normalizedPath && this.roleCache[normalizedPath]) {
            // Шлях не змінився, повертаємо кеш
            // console.log(`[PromptService] Returning cached role definition for: ${normalizedPath}`);
            // Переконуємось, що currentSystemPrompt відповідає кешу
            this.currentSystemPrompt = this.roleCache[normalizedPath].systemPrompt;
            return this.roleCache[normalizedPath];
        }

        // Якщо шлях null або вимкнено followRole
        if (!normalizedPath || !this.plugin.settings.followRole) {
            // console.log("[PromptService] No role path or followRole disabled. Using null system prompt.");
            this.currentSystemPrompt = null;
            // Не кешуємо null-роль, щоб вона могла завантажитись, якщо налаштування зміниться
            return { systemPrompt: null, isProductivityPersona: false };
        }

        // Якщо кешу немає, завантажуємо
        console.log(`[PromptService] Loading role definition using metadataCache for: ${normalizedPath}`);
        const file = this.app.vault.getAbstractFileByPath(normalizedPath);

        if (file instanceof TFile) {
            try {
                const fileCache = this.app.metadataCache.getFileCache(file);
                const frontmatter = fileCache?.frontmatter;
                const frontmatterPos = fileCache?.frontmatterPosition;
                const content = await this.app.vault.cachedRead(file);
                // --- ВИПРАВЛЕНО: Витягуємо ТІЛЬКИ ТІЛО ---
                const systemPromptBody = frontmatterPos?.end
                    ? content.substring(frontmatterPos.end.offset).trim() // Беремо все ПІСЛЯ frontmatter
                    : content.trim();

                const assistantType = frontmatter?.assistant_type?.toLowerCase();
                const isProductivity = assistantType === 'productivity' || frontmatter?.is_planner === true;

                const definition: RoleDefinition = {
                    systemPrompt: systemPromptBody || null, // Тіло промпту
                    isProductivityPersona: isProductivity
                };

                console.log(`[PromptService] Role loaded: ${normalizedPath}. Is Productivity Persona: ${isProductivity}`);
                this.roleCache[normalizedPath] = definition;
                this.currentSystemPrompt = definition.systemPrompt; // Зберігаємо ТІЛО в кеш
                return definition;

            } catch (error) {
                console.error(`[PromptService] Error processing role file ${normalizedPath}:`, error);
                new Notice(`Error loading role: ${file.basename}.`);
                this.currentSystemPrompt = null;
                return null; // Повертаємо null при помилці
            }
        } else {
            console.warn(`[PromptService] Role file not found or not a file: ${normalizedPath}`);
            this.currentSystemPrompt = null;
            // Кешуємо відсутність файлу, щоб не шукати постійно? Можливо.
            // this.roleCache[normalizedPath] = { systemPrompt: null, isProductivityPersona: false };
            return null; // Повертаємо null, якщо файл не знайдено
        }
    }


    private async _isProductivityPersonaActive(rolePath: string | null | undefined): Promise<boolean> {
        if (!this.plugin.settings.enableProductivityFeatures) {
            return false;
        }
        // getRoleDefinition поверне { isProductivityPersona: false } якщо роль не знайдена або не продуктивна
        const roleDefinition = await this.getRoleDefinition(rolePath);
        return roleDefinition?.isProductivityPersona ?? false;
    }


    async prepareFullPrompt(history: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
        console.log("[PromptService] Preparing full prompt...");
        const settings = this.plugin.settings;
        const selectedRolePath = chatMetadata.selectedRolePath || settings.selectedRolePath;

        const isProductivityActive = await this._isProductivityPersonaActive(selectedRolePath);
        console.log(`[PromptService] Productivity features active for this request: ${isProductivityActive}`);

        let taskContext = "";
        let tasksWereUpdated = false;
        if (isProductivityActive) {
            // --- ВИПРАВЛЕНО: Використання гетера ---
            const needsUpdateBefore = this.plugin.isTaskFileUpdated(); // Перевіряємо стан ДО обробки
            await this.plugin.checkAndProcessTaskUpdate?.(); // Запускаємо перевірку/обробку
            // Визначаємо, чи відбулося оновлення (прапорець був true, а тепер false)
            tasksWereUpdated = needsUpdateBefore && !this.plugin.isTaskFileUpdated();
            // -------------------------------------

            if (this.plugin.chatManager?.filePlanExists) {
                taskContext = tasksWereUpdated
                    ? "\n--- Updated Tasks Context ---\n"
                    : "\n--- Today's Tasks Context ---\n";
                taskContext += `Urgent: ${this.plugin.chatManager.fileUrgentTasks.length > 0 ? this.plugin.chatManager.fileUrgentTasks.join(', ') : "None"}\n`;
                taskContext += `Other: ${this.plugin.chatManager.fileRegularTasks.length > 0 ? this.plugin.chatManager.fileRegularTasks.join(', ') : "None"}\n`;
                taskContext += "--- End Tasks Context ---";
                console.log(`[PromptService] Injecting task context (Updated: ${tasksWereUpdated}).`);
            }
        }

        // ... (решта коду prepareFullPrompt: розрахунок токенів, вибір стратегії, RAG, формування finalPrompt) ...
        let processedHistoryString = "";
        const approxContextTokens = this._countTokens(taskContext);
        const maxHistoryTokens = settings.contextWindow - approxContextTokens - 200;

        if (isProductivityActive && settings.useAdvancedContextStrategy) { /*...*/ processedHistoryString = await this._buildAdvancedContext(history, chatMetadata, maxHistoryTokens); }
        else { /*...*/ processedHistoryString = this._buildSimpleContext(history, maxHistoryTokens); }

        let ragContext = "";
        if (settings.ragEnabled && this.plugin.ragService) { /*...*/
            const lastUserMessage = history.findLast(m => m.role === 'user');
            if (lastUserMessage?.content) {
                try {
                    const ragResult: DocumentVector[] = await this.plugin.ragService.findRelevantDocuments(lastUserMessage.content, 5);
                    if (ragResult && ragResult.length > 0) { /*...*/ ragContext = "\n--- Relevant Notes Context ---\n" + ragResult.map((r: DocumentVector) => `[${r.metadata?.filename || r.metadata?.source || 'Note'}]:\n${r.content}`).join("\n\n") + "\n--- End Notes Context ---"; /*...*/ }
                    else { /*...*/ }
                } catch (error) { /*...*/ }
            } else { /*...*/ }
        }

        const finalPrompt = `${ragContext}${taskContext}\n${processedHistoryString}`.trim();
        console.log(`[PromptService] Final prompt body length (approx tokens): ${this._countTokens(finalPrompt)}`);
        return finalPrompt;
    }

    // --- Методи обробки контексту та підсумовування ---
    // (Залишаються без змін, але використовують this._countTokens)
    private _buildSimpleContext(history: Message[], maxTokens: number): string {
        let context = ""; let currentTokens = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            const message = history[i];
            const formattedMessage = `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content.trim()}`;
            const messageTokens = this._countTokens(formattedMessage) + 5; // Використовуємо this._countTokens
            if (currentTokens + messageTokens <= maxTokens) { context = formattedMessage + "\n\n" + context; currentTokens += messageTokens; }
            else { console.log(`[PromptService] Simple context limit reached (${currentTokens}/${maxTokens} tokens).`); break; }
        }
        return context.trim();
    }

    private async _buildAdvancedContext(history: Message[], chatMetadata: ChatMetadata, maxTokens: number): Promise<string> {
        console.log("[PromptService] Building advanced context...");
        const settings = this.plugin.settings; const processedParts: string[] = []; let currentTokens = 0;
        const keepN = Math.min(history.length, settings.keepLastNMessagesBeforeSummary);
        const messagesToKeep = history.slice(-keepN); const messagesToProcess = history.slice(0, -keepN);
        console.log(`[PromptService] Advanced Context: Keeping last ${messagesToKeep.length}, processing ${messagesToProcess.length} older messages.`);
        if (messagesToProcess.length > 0) {
            if (settings.enableSummarization) {
                console.log("[PromptService] Summarization enabled...");
                let remainingMessages = [...messagesToProcess];
                while (remainingMessages.length > 0) {
                    let chunkTokens = 0; let chunkMessages: Message[] = [];
                    while (remainingMessages.length > 0 && chunkTokens < settings.summarizationChunkSize) {
                        const msg = remainingMessages.pop()!; const msgText = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.trim()}`;
                        const msgTokens = this._countTokens(msgText) + 5; // Використовуємо this._countTokens
                        if (chunkTokens + msgTokens <= settings.summarizationChunkSize) { chunkMessages.unshift(msg); chunkTokens += msgTokens; }
                        else { remainingMessages.push(msg); break; }
                    }
                    if (chunkMessages.length > 0) {
                        const chunkCombinedText = chunkMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n\n");
                        const actualChunkTokens = this._countTokens(chunkCombinedText); // Використовуємо this._countTokens
                        if (currentTokens + actualChunkTokens <= maxTokens) {
                            console.log(`[PromptService] Adding chunk (${actualChunkTokens} tokens) directly.`); processedParts.unshift(chunkCombinedText); currentTokens += actualChunkTokens;
                        } else {
                            console.log(`[PromptService] Chunk (${actualChunkTokens} tokens) too large. Summarizing.`);
                            const summary = await this._summarizeMessages(chunkMessages, chatMetadata);
                            if (summary) {
                                const summaryTokens = this._countTokens(summary) + 10; // Використовуємо this._countTokens
                                const summaryText = `[Summary of previous messages]:\n${summary}`;
                                if (currentTokens + summaryTokens <= maxTokens) { console.log(`[PromptService] Adding summary (${summaryTokens} tokens).`); processedParts.unshift(summaryText); currentTokens += summaryTokens; }
                                else { console.warn(`[PromptService] Summary too large. Skipping.`); break; }
                            } else { console.warn("[PromptService] Summarization failed. Skipping."); break; }
                        }
                    }
                } // end while
            } else {
                console.log("[PromptService] Summarization disabled. Including older messages directly.");
                let olderHistoryString = this._buildSimpleContext(messagesToProcess, maxTokens - currentTokens);
                if (olderHistoryString) { processedParts.unshift(olderHistoryString); currentTokens += this._countTokens(olderHistoryString); } // Використовуємо this._countTokens
            }
        }
        const keepHistoryString = messagesToKeep.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n\n");
        const keepHistoryTokens = this._countTokens(keepHistoryString); // Використовуємо this._countTokens
        if (currentTokens + keepHistoryTokens <= maxTokens) { processedParts.push(keepHistoryString); currentTokens += keepHistoryTokens; }
        else {
            console.warn(`[PromptService] Cannot fit all 'keepLastNMessages'. Truncating.`);
            const truncatedKeepHistory = this._buildSimpleContext(messagesToKeep, maxTokens - currentTokens);
            if (truncatedKeepHistory) { processedParts.push(truncatedKeepHistory); currentTokens += this._countTokens(truncatedKeepHistory); } // Використовуємо this._countTokens
        }
        console.log(`[PromptService] Advanced context built. Total approx tokens: ${currentTokens}`);
        return processedParts.join("\n\n").trim();
    }

    private async _summarizeMessages(messagesToSummarize: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
        // ... (код без змін, але внутрішньо використовує this._countTokens через виклик generateRaw) ...
        if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0) return null;
        console.log(`[PromptService] Summarizing chunk of ${messagesToSummarize.length} messages...`);
        const textToSummarize = messagesToSummarize.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n");
        const summarizationFullPrompt = this.plugin.settings.summarizationPrompt.replace('{text_to_summarize}', textToSummarize);
        const modelName = chatMetadata.modelName || this.plugin.settings.modelName;
        const contextWindow = this.plugin.settings.contextWindow;
        const requestBody = { model: modelName, prompt: summarizationFullPrompt, stream: false, temperature: 0.3, options: { num_ctx: contextWindow, }, system: "You are a helpful assistant that summarizes conversation history concisely." };
        try {
            if (!this.plugin.ollamaService) { console.error("[PromptService] OllamaService is not available for summarization."); return null; }
            const responseData: OllamaGenerateResponse = await this.plugin.ollamaService.generateRaw(requestBody);
            if (responseData && typeof responseData.response === 'string') { const summary = responseData.response.trim(); console.log(`[PromptService] Summarization successful (${this._countTokens(summary)} tokens).`); return summary; }
            else { console.warn("[PromptService] Summarization request returned unexpected structure:", responseData); return null; }
        } catch (error) { console.error("[PromptService] Error during summarization request:", error); return null; }
    }

} // End of PromptService class