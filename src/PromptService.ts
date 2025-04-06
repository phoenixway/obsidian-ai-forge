// PromptService.ts
import { App, normalizePath, TFile, Notice, FrontMatterCache } from 'obsidian';
import OllamaPlugin from './main';
import { Message, MessageRole } from './OllamaView';
import { ChatMetadata } from './Chat';
import { OllamaGenerateResponse } from './OllamaService';
// Імпортуємо або визначаємо DocumentVector тут, щоб TS знав тип
// (Краще винести в окремий файл types.ts, якщо використовується в кількох місцях)
interface DocumentVector {
    path: string;
    content: string;
    metadata?: {
        filename?: string; // Змінено на filename згідно ragService
        created?: number;
        modified?: number;
        [key: string]: any; // Дозволяємо інші поля
    };
}


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

    // --- ДОДАНО: Приватний метод для підрахунку токенів ---
    /**
     * Дуже приблизно оцінює кількість токенів у тексті.
     * Замініть на точніший метод, якщо є бібліотека токенізатора.
     */
    private _countTokens(text: string): number {
        if (!text) return 0;
        // Проста евристика: приблизно 4 символи на токен
        return Math.ceil(text.length / 4);
    }
    // ----------------------------------------------------


    clearRoleCache(): void {
        // ... (без змін)
        console.log("[PromptService] Clearing role definition cache.");
        this.roleCache = {};
        this.currentSystemPrompt = null;
        this.currentRolePath = null;
    }

    clearModelDetailsCache(): void {
        // ... (без змін)
        console.log("[PromptService] Clearing model details cache.");
        this.modelDetailsCache = {};
    }

    getSystemPrompt(): string | null {
        // ... (без змін)
        const targetRolePath = this.plugin.settings.selectedRolePath || null;
        if (targetRolePath !== this.currentRolePath) {
            console.warn(`[PromptService] getSystemPrompt role path mismatch. Current: ${this.currentRolePath}, Target: ${targetRolePath}. Reloading.`);
            this.getRoleDefinition(targetRolePath);
        }
        return this.currentSystemPrompt;
    }

    async getRoleDefinition(rolePath: string | null | undefined): Promise<RoleDefinition | null> {
        // ... (без змін, використовує metadataCache) ...
        const normalizedPath = rolePath ? normalizePath(rolePath) : null;
        this.currentRolePath = normalizedPath;
        if (!normalizedPath || !this.plugin.settings.followRole) { /*...*/ return { systemPrompt: null, isProductivityPersona: false }; }
        if (this.roleCache[normalizedPath]) { /*...*/ this.currentSystemPrompt = this.roleCache[normalizedPath].systemPrompt; return this.roleCache[normalizedPath]; }
        console.log(`[PromptService] Loading role definition using metadataCache for: ${normalizedPath}`);
        const file = this.app.vault.getAbstractFileByPath(normalizedPath);
        if (file instanceof TFile) {
            try {
                const fileCache = this.app.metadataCache.getFileCache(file); const frontmatter = fileCache?.frontmatter; const frontmatterPos = fileCache?.frontmatterPosition;
                const content = await this.app.vault.cachedRead(file);
                const systemPromptBody = frontmatterPos?.end ? content.substring(frontmatterPos.end.line + 1).trim() : content.trim();
                const assistantType = frontmatter?.assistant_type?.toLowerCase(); const isProductivity = assistantType === 'productivity' || frontmatter?.is_planner === true;
                const definition: RoleDefinition = { systemPrompt: systemPromptBody || null, isProductivityPersona: isProductivity };
                console.log(`[PromptService] Role loaded. Is Productivity Persona: ${isProductivity}`);
                this.roleCache[normalizedPath] = definition; this.currentSystemPrompt = definition.systemPrompt; return definition;
            } catch (error) { /*...*/ this.currentSystemPrompt = null; return null; }
        } else { /*...*/ this.currentSystemPrompt = null; return null; }
    }

    private async _isProductivityPersonaActive(rolePath: string | null | undefined): Promise<boolean> {
        // ... (без змін) ...
        if (!this.plugin.settings.enableProductivityFeatures) return false;
        const roleDefinition = await this.getRoleDefinition(rolePath);
        return roleDefinition?.isProductivityPersona ?? false;
    }

    async prepareFullPrompt(history: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
        console.log("[PromptService] Preparing full prompt...");
        const settings = this.plugin.settings;
        const selectedRolePath = chatMetadata.selectedRolePath || settings.selectedRolePath;

        const isProductivityActive = await this._isProductivityPersonaActive(selectedRolePath);
        console.log(`[PromptService] Productivity features active for this request: ${isProductivityActive}`);

        // Отримуємо системний промпт (вже має бути в кеші після _isProductivityPersonaActive)
        const systemPrompt = this.currentSystemPrompt;

        let taskContext = "";
        if (isProductivityActive) {
            await this.plugin.checkAndProcessTaskUpdate?.();
            if (this.plugin.chatManager?.filePlanExists) {
                taskContext = "\n--- Today's Tasks Context ---\n";
                taskContext += `Urgent: ${this.plugin.chatManager.fileUrgentTasks.length > 0 ? this.plugin.chatManager.fileUrgentTasks.join(', ') : "None"}\n`;
                taskContext += `Other: ${this.plugin.chatManager.fileRegularTasks.length > 0 ? this.plugin.chatManager.fileRegularTasks.join(', ') : "None"}\n`;
                taskContext += "--- End Tasks Context ---";
                console.log("[PromptService] Injecting task context.");
            }
        }

        let processedHistoryString = "";
        // --- ВИПРАВЛЕНО: Використання this._countTokens ---
        const approxSystemTokens = this._countTokens(systemPrompt || "") + this._countTokens(taskContext);
        const maxContextTokens = settings.contextWindow - approxSystemTokens - 50;

        if (isProductivityActive && settings.useAdvancedContextStrategy) {
            console.log("[PromptService] Using Advanced Context Strategy.");
            processedHistoryString = await this._buildAdvancedContext(history, chatMetadata, maxContextTokens);
        } else {
            console.log("[PromptService] Using Simple Context Strategy.");
            processedHistoryString = this._buildSimpleContext(history, maxContextTokens);
        }

        let ragContext = "";
        if (settings.ragEnabled && this.plugin.ragService) {
            const lastUserMessage = history.findLast(m => m.role === 'user');
            if (lastUserMessage?.content) {
                try {
                    console.log("[PromptService] Calling RAG service...");
                    // --- ВИПРАВЛЕНО: Назва методу та типи ---
                    const ragResult: DocumentVector[] = await this.plugin.ragService.findRelevantDocuments(lastUserMessage.content, 5); // <--- Змінено назву

                    if (ragResult && ragResult.length > 0) {
                        ragContext = "\n--- Relevant Notes Context ---\n";
                        // Явно вказуємо тип DocumentVector для 'r' та використовуємо metadata.filename
                        ragContext += ragResult.map((r: DocumentVector) =>
                            `[${r.metadata?.filename || 'Note'}]:\n${r.content}` // <--- Змінено доступ до метаданих
                        ).join("\n\n");
                        ragContext += "\n--- End Notes Context ---";
                        console.log(`[PromptService] Added RAG context (${ragContext.length} chars).`);
                    } else {
                        console.log("[PromptService] RAG service returned no results.");
                    }
                } catch (error) {
                    console.error("[PromptService] Error calling RAG service:", error);
                    new Notice("Error retrieving RAG context. Check console.");
                }
            } else {
                console.log("[PromptService] Skipping RAG: No last user message found.");
            }
        }

        const finalPrompt = `${ragContext}${taskContext}\n${processedHistoryString}`.trim();
        // --- ВИПРАВЛЕНО: Використання this._countTokens ---
        console.log(`[PromptService] Final prompt length (approx tokens): ${this._countTokens(finalPrompt)}`);

        return finalPrompt;
    }

    private _buildSimpleContext(history: Message[], maxTokens: number): string {
        let context = "";
        let currentTokens = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            const message = history[i];
            const formattedMessage = `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content.trim()}`;
            // --- ВИПРАВЛЕНО: Використання this._countTokens ---
            const messageTokens = this._countTokens(formattedMessage) + 5;

            if (currentTokens + messageTokens <= maxTokens) {
                context = formattedMessage + "\n\n" + context;
                currentTokens += messageTokens;
            } else {
                console.log(`[PromptService] Simple context limit reached (${currentTokens}/${maxTokens} tokens). Stopping at message index ${i}.`);
                break;
            }
        }
        return context.trim();
    }

    private async _buildAdvancedContext(history: Message[], chatMetadata: ChatMetadata, maxTokens: number): Promise<string> {
        console.log("[PromptService] Building advanced context...");
        const settings = this.plugin.settings;
        const processedParts: string[] = [];
        let currentTokens = 0;

        const keepN = Math.min(history.length, settings.keepLastNMessagesBeforeSummary);
        const messagesToKeep = history.slice(-keepN);
        const messagesToProcess = history.slice(0, -keepN);

        console.log(`[PromptService] Advanced Context: Keeping last ${messagesToKeep.length}, processing ${messagesToProcess.length} older messages.`);

        if (messagesToProcess.length > 0) {
            if (settings.enableSummarization) {
                console.log("[PromptService] Summarization enabled, attempting to summarize older messages...");
                let remainingMessages = [...messagesToProcess];
                while (remainingMessages.length > 0) {
                    let chunkTokens = 0;
                    let chunkMessages: Message[] = [];
                    while (remainingMessages.length > 0 && chunkTokens < settings.summarizationChunkSize) {
                        const msg = remainingMessages.pop()!;
                        const msgText = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.trim()}`;
                        // --- ВИПРАВЛЕНО: Використання this._countTokens ---
                        const msgTokens = this._countTokens(msgText) + 5;
                        // --- ВИПРАВЛЕНО: Перевірка з chunkTokens ---
                        if (chunkTokens + msgTokens <= settings.summarizationChunkSize) {
                            chunkMessages.unshift(msg);
                            chunkTokens += msgTokens;
                        } else {
                            remainingMessages.push(msg);
                            break;
                        }
                    }

                    if (chunkMessages.length > 0) {
                        const chunkCombinedText = chunkMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n\n");
                        // --- ВИПРАВЛЕНО: Використання this._countTokens ---
                        const actualChunkTokens = this._countTokens(chunkCombinedText);

                        if (currentTokens + actualChunkTokens <= maxTokens) {
                            console.log(`[PromptService] Adding chunk of ${chunkMessages.length} messages (${actualChunkTokens} tokens) directly.`);
                            processedParts.unshift(chunkCombinedText);
                            currentTokens += actualChunkTokens;
                        } else {
                            console.log(`[PromptService] Chunk (${actualChunkTokens} tokens) too large for remaining context (${maxTokens - currentTokens}). Attempting summarization.`);
                            const summary = await this._summarizeMessages(chunkMessages, chatMetadata);
                            if (summary) {
                                // --- ВИПРАВЛЕНО: Використання this._countTokens ---
                                const summaryTokens = this._countTokens(summary) + 10;
                                const summaryText = `[Summary of previous messages]:\n${summary}`;
                                if (currentTokens + summaryTokens <= maxTokens) {
                                    console.log(`[PromptService] Adding summary (${summaryTokens} tokens).`);
                                    processedParts.unshift(summaryText);
                                    // --- ВИПРАВЛЕНО: Оновлення currentTokens ---
                                    currentTokens += summaryTokens;
                                } else {
                                    console.warn(`[PromptService] Summary (${summaryTokens} tokens) is still too large for remaining context. Skipping this part of history.`);
                                    break;
                                }
                            } else {
                                console.warn("[PromptService] Summarization failed or returned empty for a chunk. Skipping this part of history.");
                                break;
                            }
                        }
                    }
                } // end while

            } else {
                console.log("[PromptService] Summarization disabled. Including older messages directly until limit.");
                let olderHistoryString = this._buildSimpleContext(messagesToProcess, maxTokens - currentTokens);
                if (olderHistoryString) {
                    processedParts.unshift(olderHistoryString);
                    // --- ВИПРАВЛЕНО: Використання this._countTokens ---
                    currentTokens += this._countTokens(olderHistoryString);
                }
            }
        }

        const keepHistoryString = messagesToKeep.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n\n");
        // --- ВИПРАВЛЕНО: Використання this._countTokens ---
        const keepHistoryTokens = this._countTokens(keepHistoryString);

        if (currentTokens + keepHistoryTokens <= maxTokens) {
            processedParts.push(keepHistoryString);
            currentTokens += keepHistoryTokens;
        } else {
            console.warn(`[PromptService] Could not fit all 'keepLastNMessages' (${keepHistoryTokens} tokens) into remaining context (${maxTokens - currentTokens}). Truncating further.`);
            const truncatedKeepHistory = this._buildSimpleContext(messagesToKeep, maxTokens - currentTokens);
            if (truncatedKeepHistory) {
                processedParts.push(truncatedKeepHistory);
                // --- ВИПРАВЛЕНО: Використання this._countTokens ---
                currentTokens += this._countTokens(truncatedKeepHistory);
            }
        }

        console.log(`[PromptService] Advanced context built. Total approx tokens: ${currentTokens}`);
        return processedParts.join("\n\n").trim();
    }


    private async _summarizeMessages(messagesToSummarize: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
        if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0) return null;
        console.log(`[PromptService] Summarizing chunk of ${messagesToSummarize.length} messages...`);
        // ... (решта коду без змін, але використовує this._countTokens)
        const textToSummarize = messagesToSummarize.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n");
        const summarizationFullPrompt = this.plugin.settings.summarizationPrompt.replace('{text_to_summarize}', textToSummarize);
        const modelName = chatMetadata.modelName || this.plugin.settings.modelName;
        const contextWindow = this.plugin.settings.contextWindow;
        const requestBody = { model: modelName, prompt: summarizationFullPrompt, stream: false, temperature: 0.3, options: { num_ctx: contextWindow, }, system: "You are a helpful assistant that summarizes conversation history concisely." };
        try {
            if (!this.plugin.ollamaService) { console.error("[PromptService] OllamaService is not available for summarization."); return null; }
            const responseData: OllamaGenerateResponse = await this.plugin.ollamaService.generateRaw(requestBody);
            if (responseData && typeof responseData.response === 'string') {
                const summary = responseData.response.trim();
                // --- ВИПРАВЛЕНО: Використання this._countTokens ---
                console.log(`[PromptService] Summarization successful (${this._countTokens(summary)} tokens).`); return summary;
            }
            else { console.warn("[PromptService] Summarization request returned unexpected structure:", responseData); return null; }
        } catch (error) { console.error("[PromptService] Error during summarization request:", error); return null; }
    }

} // End of PromptService class