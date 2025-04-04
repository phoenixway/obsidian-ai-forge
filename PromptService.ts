// promptService.ts
import { TFile, normalizePath, Notice } from "obsidian";
import * as path from 'path';
import OllamaPlugin from "./main";
import { Message, MessageRole } from "./OllamaView"; // Import Message types
import { encode } from 'gpt-tokenizer'; // Import the tokenizer
import { OllamaService, OllamaShowResponse } from "./OllamaService"; // Use OllamaService
import { ChatMetadata } from "./Chat"; // Import ChatMetadata

// Helper function: Word counter (for basic strategy)
function countWords(text: string): number {
    if (!text) return 0;
    // More robust word count, ignoring multiple spaces
    return text.trim().split(/\s+/).filter(Boolean).length;
}

// Helper function: Token counter (for advanced strategy)
function countTokens(text: string): number {
    if (!text) return 0;
    try {
        // Use encode from gpt-tokenizer library
        return encode(text).length;
    } catch (e) {
        console.warn("Tokenizer error, falling back to word count estimation:", e); // English warning
        // Fallback estimation in case of tokenizer error
        return Math.ceil(countWords(text) * 1.5); // Increase factor for safety
    }
}

// Interface for representing a chunk of history during processing
interface HistoryChunk {
    messages: Message[];
    text: string; // Pre-formatted chunk text
    tokens: number;
}

export class PromptService {
    private systemPrompt: string | null = null;
    private plugin: OllamaPlugin;
    // Reference to OllamaService needed for summarization calls and model details
    // private ollamaService: OllamaService;
    // Buffer of tokens to reserve for the model's response & potential inaccuracies
    private readonly RESPONSE_TOKEN_BUFFER = 500;
    // Cache for detected model context sizes { modelName: detectedContextSize | null }
    private modelDetailsCache: Record<string, number | null> = {};
    // Cache for role file content { roleFilePath: content | null }
    private roleContentCache: Record<string, string | null> = {};

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        // Get OllamaService instance from the plugin
        // this.ollamaService = plugin.ollamaService;
    }

    setSystemPrompt(prompt: string | null): void { this.systemPrompt = prompt; }
    getSystemPrompt(): string | null { return this.systemPrompt; }
    clearModelDetailsCache(): void { this.modelDetailsCache = {}; console.log("[PromptService] Model details cache cleared."); }
    clearRoleCache(): void { this.roleContentCache = {}; console.log("[PromptService] Role content cache cleared."); }


    /**
     * Determines the effective context limit by checking the model details (if advanced strategy enabled)
     * and comparing with the user's setting. Returns the smaller of the two valid values.
     */
    private async _getEffectiveContextLimit(modelName: string): Promise<number> {
        const userDefinedContextSize = this.plugin.settings.contextWindow;
        let effectiveContextLimit = userDefinedContextSize; // Default to user setting

        if (this.plugin.settings.useAdvancedContextStrategy && modelName) {
            let detectedSize: number | null = null;
            if (this.modelDetailsCache.hasOwnProperty(modelName)) {
                detectedSize = this.modelDetailsCache[modelName];
            } else {
                console.log(`[PromptService] No cache for ${modelName}, fetching details...`);
                try {
                    const details: OllamaShowResponse | null = await this.plugin.ollamaService.getModelDetails(modelName);
                    if (details) {
                        let sizeStr: string | undefined = undefined;
                        if (details.parameters) { const match = details.parameters.match(/num_ctx\s+(\d+)/); if (match?.[1]) sizeStr = match[1]; }
                        if (!sizeStr && details.details?.['llm.context_length']) sizeStr = String(details.details['llm.context_length']);
                        if (!sizeStr && details.details?.['tokenizer.ggml.context_length']) sizeStr = String(details.details['tokenizer.ggml.context_length']);

                        if (sizeStr) {
                            const parsedSize = parseInt(sizeStr, 10);
                            if (!isNaN(parsedSize) && parsedSize > 0) {
                                detectedSize = parsedSize;
                                console.log(`[PromptService] Detected context size for ${modelName}: ${detectedSize}`);
                                this.modelDetailsCache[modelName] = detectedSize;
                            } else { console.warn(`[PromptService] Parsed context size invalid: ${sizeStr}`); detectedSize = null; }
                        }
                        if (detectedSize === null) { console.log(`[PromptService] Context size not found for ${modelName}.`); this.modelDetailsCache[modelName] = null; }
                    } else { this.modelDetailsCache[modelName] = null; }
                } catch (error) { console.error(`[PromptService] Error fetching model details for ${modelName}:`, error); this.modelDetailsCache[modelName] = null; }
            }
            if (detectedSize !== null && detectedSize > 0) {
                effectiveContextLimit = Math.min(userDefinedContextSize, detectedSize);
                // Optional logging comparing limits
                // if (effectiveContextLimit < userDefinedContextSize) { console.log(`[PromptService] Using detected limit (${effectiveContextLimit})`); }
                // else { console.log(`[PromptService] Using user limit (${effectiveContextLimit})`); }
            } else { /* console.log(`[PromptService] Using user limit (${effectiveContextLimit})`); */ }
        }
        return Math.max(100, effectiveContextLimit); // Ensure minimum limit
    }

    private async _summarizeMessages(messagesToSummarize: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
        if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0) return null;
        console.log(`[Ollama] Attempting to summarize ${messagesToSummarize.length} messages.`);

        const textToSummarize = messagesToSummarize.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n");
        const summarizationFullPrompt = this.plugin.settings.summarizationPrompt.replace('{text_to_summarize}', textToSummarize);

        // Готуємо тіло запиту для generateRaw
        const summaryRequestBody = {
            model: chatMetadata.modelName || this.plugin.settings.modelName,
            prompt: summarizationFullPrompt,
            stream: false,
            temperature: 0.2,
            options: { num_ctx: this.plugin.settings.contextWindow, },
            // НЕ передаємо сюди основний системний промпт ролі
        };

        try {
            // Викликаємо новий метод generateRaw
            const summaryResponse = await this.plugin.ollamaService.generateRaw(summaryRequestBody);
            const summaryText = summaryResponse?.response?.trim();

            if (summaryText) { console.log(`[Ollama] Summarization successful.`); return summaryText; }
            else { console.warn("[Ollama] Summarization empty response."); return null; }
        } catch (error) { console.error("[Ollama] Summarization failed:", error); return null; }
    }


    /**
     * Prepares the full prompt string based on history and chat metadata.
     * System prompt is handled separately.
     */
    async prepareFullPrompt(
        history: Message[], // Full message history for the chat
        chatMetadata: ChatMetadata // Metadata of the current chat
    ): Promise<string> {
        if (!this.plugin) { return history.slice(-1)?.[0]?.content || ""; }

        // 1. Get System Prompt content based on the chat's selected role path
        try {
            // This is the only call site within this file
            const roleContent = await this.getRoleDefinition(chatMetadata.selectedRolePath); // <--- Calling with argument
            this.setSystemPrompt(roleContent);
        } catch (error) {
            console.error("Error setting role definition for prompt:", error);
            this.setSystemPrompt(null);
        }
        const currentSystemPrompt = this.getSystemPrompt();

        // 2. Prepare RAG context
        const lastUserMessageContent = history.findLast(m => m.role === 'user')?.content || "";
        let ragContext: string | null = null;
        if (this.plugin.settings.ragEnabled && this.plugin.ragService && lastUserMessageContent) {
            try { ragContext = this.plugin.ragService.prepareContext(lastUserMessageContent); }
            catch (error) { console.error("Error processing RAG:", error); }
        }
        const ragHeader = "## Contextual Information from Notes:\n";
        const ragBlock = ragContext ? `${ragHeader}${ragContext.trim()}\n\n---\n` : "";

        // 3. Determine effective context limit and max prompt tokens
        const modelName = chatMetadata.modelName || this.plugin.settings.modelName;
        const effectiveContextLimit = await this._getEffectiveContextLimit(modelName);
        const systemPromptTokens = currentSystemPrompt ? countTokens(currentSystemPrompt) : 0;
        const maxPromptTokens = Math.max(100, effectiveContextLimit - systemPromptTokens - this.RESPONSE_TOKEN_BUFFER);

        // 4. Build the prompt using the appropriate strategy
        let finalPrompt: string;
        const lastMessage = history.slice(-1)?.[0]; // Get the actual last message
        const userInputFormatted = lastMessage ? `${lastMessage.role === 'user' ? 'User' : 'Assistant'}: ${lastMessage.content.trim()}` : ""; // Format last message
        const historyForContext = history.slice(0, -1); // History *without* the last message

        if (this.plugin.settings.useAdvancedContextStrategy) {
            // --- Advanced Strategy (Tokens + Summarization) ---
            // (Logic remains the same as previous version)
            console.log(`[Ollama] Using advanced context (Effective Limit: ${effectiveContextLimit}, Max Prompt Field: ${maxPromptTokens}).`);
            let currentPromptTokens = 0; let promptHistoryParts: string[] = [];
            const userInputTokens = countTokens(userInputFormatted); currentPromptTokens += userInputTokens;
            const ragTokens = countTokens(ragBlock); let finalRagBlock = "";
            if (ragBlock && currentPromptTokens + ragTokens <= maxPromptTokens) { finalRagBlock = ragBlock; currentPromptTokens += ragTokens; } else if (ragBlock) { console.warn(`[Ollama] RAG skipped (${ragTokens}).`); }
            const keepN = Math.min(historyForContext.length, this.plugin.settings.keepLastNMessagesBeforeSummary); const messagesToKeep = historyForContext.slice(-keepN); const messagesToProcess = historyForContext.slice(0, -keepN);
            let keptMessagesTokens = 0; const keptMessagesStrings: string[] = [];
            for (let i = messagesToKeep.length - 1; i >= 0; i--) { const m = messagesToKeep[i]; const fmt = `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`; const tkns = countTokens(fmt); if (currentPromptTokens + tkns <= maxPromptTokens) { keptMessagesStrings.push(fmt); currentPromptTokens += tkns; keptMessagesTokens += tkns; } else { console.warn(`[Ollama] Keep message doesn't fit.`); break; } } keptMessagesStrings.reverse();
            let processedHistoryParts: string[] = []; let currentChunk: HistoryChunk = { messages: [], text: "", tokens: 0 };
            for (let i = messagesToProcess.length - 1; i >= 0; i--) { const m = messagesToProcess[i]; const fmt = `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`; const tkns = countTokens(fmt); if (currentChunk.tokens > 0 && currentChunk.tokens + tkns > this.plugin.settings.summarizationChunkSize) { currentChunk.messages.reverse(); currentChunk.text = currentChunk.messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n"); if (currentPromptTokens + currentChunk.tokens <= maxPromptTokens) { processedHistoryParts.push(currentChunk.text); currentPromptTokens += currentChunk.tokens; } else if (this.plugin.settings.enableSummarization) { const s = await this._summarizeMessages(currentChunk.messages, chatMetadata); if (s) { const st = countTokens(s); const sf = `[Summary]:\n${s}`; if (currentPromptTokens + st <= maxPromptTokens) { processedHistoryParts.push(sf); currentPromptTokens += st; } else { console.warn(`Summary too large.`); } } else { console.warn(`Summarization failed.`); } } else { console.log(`Chunk skipped.`); } currentChunk = { messages: [], text: "", tokens: 0 }; } currentChunk.messages.push(m); currentChunk.tokens += tkns; }
            if (currentChunk.messages.length > 0) { currentChunk.messages.reverse(); currentChunk.text = currentChunk.messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n"); if (currentPromptTokens + currentChunk.tokens <= maxPromptTokens) { processedHistoryParts.push(currentChunk.text); currentPromptTokens += currentChunk.tokens; } else if (this.plugin.settings.enableSummarization) { const s = await this._summarizeMessages(currentChunk.messages, chatMetadata); if (s) { const st = countTokens(s); const sf = `[Summary]:\n${s}`; if (currentPromptTokens + st <= maxPromptTokens) { processedHistoryParts.push(sf); currentPromptTokens += st; } else { console.warn(`Summary too large.`); } } else { console.warn(`Summarization failed.`); } } else { console.log(`Last chunk skipped.`); } }
            processedHistoryParts.reverse(); const finalPromptParts = [finalRagBlock, ...processedHistoryParts, ...keptMessagesStrings, userInputFormatted].filter(Boolean); finalPrompt = finalPromptParts.join("\n\n");
            console.log(`[Ollama] Final prompt field tokens: ${currentPromptTokens}. Total context (incl sys): ${currentPromptTokens + systemPromptTokens}.`);

        } else {
            // --- Basic Strategy (Words) ---
            console.log(`[Ollama] Using basic context strategy (Word Limit Approx based on ${effectiveContextLimit} tokens).`);
            const systemPromptWordCount = currentSystemPrompt ? countWords(currentSystemPrompt) : 0; const userInputWordCount = countWords(userInputFormatted); const wordLimit = Math.max(100, (effectiveContextLimit / 1.0) - systemPromptWordCount - userInputWordCount - 300);
            let contextParts: string[] = []; let currentWordCount = 0; const ragWords = countWords(ragBlock); let ragAdded = false; if (ragBlock && currentWordCount + ragWords <= wordLimit) { contextParts.push(ragBlock); currentWordCount += ragWords; ragAdded = true; } else if (ragBlock) { console.warn(`[Ollama] RAG context (${ragWords} words) skipped.`); }
            let addedHistoryMessages = 0;
            for (let i = historyForContext.length - 1; i >= 0; i--) { const m = historyForContext[i]; const fmt = `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`; const words = countWords(fmt); if (currentWordCount + words <= wordLimit) { contextParts.push(fmt); currentWordCount += words; addedHistoryMessages++; } else { break; } }
            let finalPromptParts: string[] = []; if (ragAdded) { finalPromptParts.push(contextParts.shift()!); contextParts.reverse(); finalPromptParts = finalPromptParts.concat(contextParts); } else { contextParts.reverse(); finalPromptParts = contextParts; }
            finalPromptParts.push(userInputFormatted); finalPrompt = finalPromptParts.join("\n\n");
            console.log(`[Ollama] Final prompt word count (approx): ${currentWordCount + userInputWordCount}. History messages: ${addedHistoryMessages}.`);
        }

        return finalPrompt;
    }


    // --- Role definition methods ---
    /**
     * Reads the content of the specified role file path. Uses cache.
     */
    async getRoleDefinition(selectedRolePath: string | null | undefined): Promise<string | null> {
        if (!this.plugin || !this.plugin.settings.followRole || !selectedRolePath) {
            return null; // Role functionality disabled or no role selected/passed
        }

        // Check cache first
        if (this.roleContentCache.hasOwnProperty(selectedRolePath)) {
            return this.roleContentCache[selectedRolePath];
        }

        console.log(`[PromptService] Reading role file content: ${selectedRolePath}`);
        try {
            const normalizedPath = normalizePath(selectedRolePath);
            const adapter = this.plugin.app.vault.adapter; // Use adapter for potentially reading outside vault too

            if (!(await adapter.exists(normalizedPath))) {
                console.warn(`Selected role file not found: ${normalizedPath}`);
                this.roleContentCache[selectedRolePath] = null;
                new Notice(`Selected role file not found: ${selectedRolePath}`);
                return null;
            }

            let content = await adapter.read(normalizedPath); // Use adapter read
            // Append current date and time
            const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            content += `\n\nCurrent date and time: ${currentDate}, ${currentTime}`;
            const finalContent = content.trim();
            this.roleContentCache[selectedRolePath] = finalContent; // Cache the result
            return finalContent;

        } catch (error) {
            console.error(`Error reading selected role file ${selectedRolePath}:`, error);
            this.roleContentCache[selectedRolePath] = null; // Cache error
            new Notice(`Error reading role file: ${selectedRolePath}`);
            return null;
        }
    }
}