import { TFile, normalizePath } from "obsidian";
import * as path from 'path';
import OllamaPlugin from "./main";
import { Message } from "./ollamaView";
import { encode } from 'gpt-tokenizer'; // Import tokenizer
import { ApiService } from "./apiServices"; // Needed for summarization call

// Word counter (for basic strategy)
function countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
}

// Token counter (for advanced strategy)
function countTokens(text: string): number {
    if (!text) return 0;
    try {
        return encode(text).length;
    } catch (e) {
        console.warn("Tokenizer error, falling back to word count estimation:", e); // Translated warning
        return Math.ceil(countWords(text) * 1.5); // Fallback estimation
    }
}

// Interface for history chunk processing
interface HistoryChunk {
    messages: Message[];
    text: string; // Pre-formatted chunk text
    tokens: number;
}

export class PromptService {
    private systemPrompt: string | null = null;
    private plugin: OllamaPlugin;
    private apiService: ApiService; // Dependency for summarization
    private readonly RESPONSE_TOKEN_BUFFER = 500; // Token buffer for model response

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        this.apiService = plugin.apiService; // Get ApiService instance
    }

    setSystemPrompt(prompt: string | null): void { this.systemPrompt = prompt; }
    getSystemPrompt(): string | null { return this.systemPrompt; }

    // --- Helper method for summarization ---
    private async _summarizeMessages(messagesToSummarize: Message[]): Promise<string | null> {
        if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0) {
            return null;
        }
        console.log(`[Ollama] Attempting to summarize ${messagesToSummarize.length} messages.`); // Translated log

        const textToSummarize = messagesToSummarize
            .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.trim()}`)
            .join("\n");

        const summarizationFullPrompt = this.plugin.settings.summarizationPrompt
            .replace('{text_to_summarize}', textToSummarize);

        const summaryRequestBody = {
            model: this.plugin.settings.modelName, // Use the same model for now
            prompt: summarizationFullPrompt,
            stream: false,
            temperature: 0.2, // Low temperature for factual summary
            options: {
                num_ctx: this.plugin.settings.contextWindow,
            },
            // No system prompt for summarization to avoid interference
        };

        try {
            const summaryResponse = await this.apiService.generateResponse(summaryRequestBody);
            const summaryText = summaryResponse?.response?.trim();

            if (summaryText) {
                console.log(`[Ollama] Summarization successful. Original tokens: ${countTokens(textToSummarize)}, Summary tokens: ${countTokens(summaryText)}`); // Translated log
                return summaryText;
            } else {
                console.warn("[Ollama] Summarization failed: Empty response from model."); // Translated warning
                return null;
            }
        } catch (error) {
            console.error("[Ollama] Summarization failed:", error); // Translated error
            return null;
        }
    }


    // --- Main prompt preparation method ---
    async prepareFullPrompt(
        content: string, // Current user message
        history: Message[] // Full chat history
    ): Promise<string> {
        if (!this.plugin) {
            console.warn("Plugin reference not set in PromptService."); // Translated warning
            return content.trim();
        }

        // 1. Update system prompt
        try { const role = await this.getRoleDefinition(); this.setSystemPrompt(role); }
        catch (error) { console.error("Error getting role definition:", error); this.setSystemPrompt(null); } // Translated error
        const currentSystemPrompt = this.getSystemPrompt();

        // 2. Get RAG context
        let ragContext: string | null = null;
        if (this.plugin.settings.ragEnabled && this.plugin.ragService) {
            try { ragContext = this.plugin.ragService.prepareContext(content); }
            catch (error) { console.error("Error processing RAG:", error); } // Translated error
        }
        const ragHeader = "## Contextual Information from Notes:\n"; // Translated header
        const ragBlock = ragContext ? `${ragHeader}${ragContext.trim()}\n\n---\n` : "";


        // 3. Select strategy and prepare prompt
        let finalPrompt: string;
        const userInputFormatted = `User: ${content.trim()}`;

        if (this.plugin.settings.useAdvancedContextStrategy) {
            // --- Advanced Strategy (Tokens + Optional Summarization) ---
            console.log("[Ollama] Using advanced context strategy (tokens)."); // Translated log
            const modelContextLimit = this.plugin.settings.contextWindow;
            const maxContextTokens = Math.max(100, modelContextLimit - this.RESPONSE_TOKEN_BUFFER);
            let currentTokens = 0;
            let promptHistoryParts: string[] = []; // For history/summaries

            const systemPromptTokens = currentSystemPrompt ? countTokens(currentSystemPrompt) : 0;
            currentTokens += systemPromptTokens; // Account for system prompt in limit
            const userInputTokens = countTokens(userInputFormatted);
            currentTokens += userInputTokens; // Account for user input

            // Try to add RAG first if it fits
            const ragTokens = countTokens(ragBlock);
            let finalRagBlock = "";
            if (ragBlock && currentTokens + ragTokens <= maxContextTokens) {
                finalRagBlock = ragBlock;
                currentTokens += ragTokens;
                console.log(`[Ollama] RAG context included (${ragTokens} tokens).`); // Translated log
            } else if (ragBlock) {
                console.warn(`[Ollama] RAG context (${ragTokens} tokens) skipped, not enough space. Available: ${maxContextTokens - currentTokens}`); // Translated warning
            }

            // Separate history into "keep verbatim" and "process/summarize"
            const keepN = Math.min(history.length, this.plugin.settings.keepLastNMessagesBeforeSummary);
            const messagesToKeep = history.slice(-keepN);
            const messagesToProcess = history.slice(0, -keepN);

            // Add the "keep verbatim" messages (newest first check)
            let keptMessagesTokens = 0;
            const keptMessagesStrings: string[] = [];
            for (let i = messagesToKeep.length - 1; i >= 0; i--) {
                const msg = messagesToKeep[i];
                const formattedMsg = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.trim()}`;
                const messageTokens = countTokens(formattedMsg);
                if (currentTokens + messageTokens <= maxContextTokens) {
                    keptMessagesStrings.push(formattedMsg);
                    currentTokens += messageTokens;
                    keptMessagesTokens += messageTokens;
                } else {
                    console.warn(`[Ollama] Even a message intended to be kept does not fit (message index ${history.length - messagesToKeep.length + i}). Consider increasing context window or reducing keepLastNMessages.`); // Translated warning
                    break;
                }
            }
            keptMessagesStrings.reverse(); // Restore chronological order
            if (keptMessagesStrings.length > 0) console.log(`[Ollama] Kept last ${keptMessagesStrings.length} messages verbatim (${keptMessagesTokens} tokens).`); // Translated log

            // Process older messages (messagesToProcess) in chunks
            let processedHistoryParts: string[] = []; // Will hold summaries or original chunks
            let currentChunk: HistoryChunk = { messages: [], text: "", tokens: 0 };

            // Iterate older messages from NEWEST to OLDEST to build chunks
            for (let i = messagesToProcess.length - 1; i >= 0; i--) {
                const msg = messagesToProcess[i];
                const formattedMsg = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.trim()}`;
                const messageTokens = countTokens(formattedMsg);

                // If adding this message exceeds chunk size, process the existing chunk first
                if (currentChunk.tokens > 0 && currentChunk.tokens + messageTokens > this.plugin.settings.summarizationChunkSize) {
                    currentChunk.messages.reverse(); // Chronological order for summarization
                    currentChunk.text = currentChunk.messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n");

                    if (currentTokens + currentChunk.tokens <= maxContextTokens) { // Does the chunk fit as is?
                        processedHistoryParts.push(currentChunk.text);
                        currentTokens += currentChunk.tokens;
                    } else if (this.plugin.settings.enableSummarization) { // Try summarizing
                        const summary = await this._summarizeMessages(currentChunk.messages);
                        if (summary) {
                            const summaryTokens = countTokens(summary);
                            const summaryFormatted = `[Summary of previous messages]:\n${summary}`; // Translated placeholder
                            if (currentTokens + summaryTokens <= maxContextTokens) {
                                processedHistoryParts.push(summaryFormatted);
                                currentTokens += summaryTokens;
                                console.log(`[Ollama] Added summary (${summaryTokens} tokens) instead of chunk (${currentChunk.tokens} tokens).`); // Translated log
                            } else { console.warn(`[Ollama] Summary (${summaryTokens} tokens) still too large, discarding chunk.`); } // Translated warning
                        } else { console.warn(`[Ollama] Summarization failed for chunk, discarding.`); } // Translated warning
                    } else { // Summarization disabled or summary didn't fit
                        console.log(`[Ollama] History chunk skipped (${currentChunk.tokens} tokens), summarization disabled or chunk too large.`); // Translated log
                    }
                    // Reset chunk
                    currentChunk = { messages: [], text: "", tokens: 0 };
                }

                // Add current message to the (potentially new) chunk
                currentChunk.messages.push(msg);
                currentChunk.tokens += messageTokens;
            }

            // Process the very last chunk
            if (currentChunk.messages.length > 0) {
                currentChunk.messages.reverse();
                currentChunk.text = currentChunk.messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n");
                if (currentTokens + currentChunk.tokens <= maxContextTokens) {
                    processedHistoryParts.push(currentChunk.text);
                    currentTokens += currentChunk.tokens;
                } else if (this.plugin.settings.enableSummarization) {
                    const summary = await this._summarizeMessages(currentChunk.messages);
                    if (summary) {
                        const summaryTokens = countTokens(summary);
                        const summaryFormatted = `[Summary of previous messages]:\n${summary}`; // Translated placeholder
                        if (currentTokens + summaryTokens <= maxContextTokens) {
                            processedHistoryParts.push(summaryFormatted);
                            currentTokens += summaryTokens;
                            console.log(`[Ollama] Added summary (${summaryTokens} tokens) for last chunk (${currentChunk.tokens} tokens).`); // Translated log
                        } else { console.warn(`[Ollama] Summary (${summaryTokens} tokens) still too large for last chunk.`); } // Translated warning
                    } else { console.warn(`[Ollama] Summarization failed for last chunk, discarding.`); } // Translated warning
                } else { console.log(`[Ollama] Last history chunk skipped (${currentChunk.tokens} tokens), summarization disabled or chunk too large.`); } // Translated log
            }

            // Assemble final prompt: RAG + Processed History (Summaries/Chunks) + Kept History + User Input
            processedHistoryParts.reverse(); // Put oldest processed parts first
            const finalPromptParts = [finalRagBlock, ...processedHistoryParts, ...keptMessagesStrings, userInputFormatted].filter(Boolean);
            finalPrompt = finalPromptParts.join("\n\n");
            console.log(`[Ollama] Final prompt token count (approx. incl system & input): ${currentTokens}. Processed history parts: ${processedHistoryParts.length}, Kept verbatim: ${keptMessagesStrings.length}.`); // Translated log


        } else {
            // --- Basic Strategy (Words) ---
            console.log("[Ollama] Using basic context strategy (words)."); // Translated log
            const systemPromptWordCount = currentSystemPrompt ? countWords(currentSystemPrompt) : 0;
            const userInputWordCount = countWords(userInputFormatted);
            const tokenApproximationFactor = 1.0; // Rough estimate
            const wordLimit = Math.max(100, (this.plugin.settings.contextWindow / tokenApproximationFactor) - systemPromptWordCount - userInputWordCount - 300); // Larger buffer for words
            let contextParts: string[] = []; let currentWordCount = 0;
            const ragWords = countWords(ragBlock); let ragAdded = false;
            if (ragBlock && currentWordCount + ragWords <= wordLimit) { contextParts.push(ragBlock); currentWordCount += ragWords; ragAdded = true; }
            else if (ragBlock) { console.warn(`[Ollama] RAG context (${ragWords} words) too large, skipped.`); } // Translated warning
            let addedHistoryMessages = 0;
            for (let i = history.length - 1; i >= 0; i--) {
                const msg = history[i]; const formattedMsg = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.trim()}`; const messageWords = countWords(formattedMsg);
                if (currentWordCount + messageWords <= wordLimit) { contextParts.push(formattedMsg); currentWordCount += messageWords; addedHistoryMessages++; }
                else { break; }
            }
            let finalPromptParts: string[] = [];
            if (ragAdded) { finalPromptParts.push(contextParts.shift()!); contextParts.reverse(); finalPromptParts = finalPromptParts.concat(contextParts); }
            else { contextParts.reverse(); finalPromptParts = contextParts; }
            finalPromptParts.push(userInputFormatted); finalPrompt = finalPromptParts.join("\n\n");
            console.log(`[Ollama] Final prompt word count (approx): ${currentWordCount + systemPromptWordCount + userInputWordCount}. History messages included: ${addedHistoryMessages}.`); // Translated log
        }

        return finalPrompt;
    }


    // --- Role definition methods ---
    async getDefaultRoleDefinition(): Promise<string | null> {
        // (Code remains the same, but internal strings/dates translated)
        if (!this.plugin) return null;
        try {
            const pluginFolder = this.plugin.manifest.dir;
            if (!pluginFolder) { console.error("Cannot determine plugin folder path."); return null; }
            const rolePath = 'default-role.md';
            const fullPath = normalizePath(path.join(pluginFolder, rolePath));
            let content: string | null = null;
            const adapter = this.plugin.app.vault.adapter;
            if (await adapter.exists(fullPath)) {
                try { content = await adapter.read(fullPath); }
                catch (readError) { console.error(`Error reading default role file at ${fullPath}:`, readError); return null; }
            } else {
                console.log(`Default role file not found at ${fullPath}, creating it.`); // Translated log
                try {
                    const defaultContent = "# Default AI Role\n\nYou are a helpful assistant."; // Translated default content
                    await adapter.write(fullPath, defaultContent); content = defaultContent;
                } catch (createError) { console.error(`Error creating default role file at ${fullPath}:`, createError); return null; } // Translated error
            }
            if (content !== null) {
                // Use en-US locale for date/time
                const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                content += `\n\nCurrent date and time: ${currentDate}, ${currentTime}`; // Translated format
                return content.trim();
            } return null;
        } catch (error) { console.error("Error handling default role definition:", error); return null; } // Translated error
    }

    async getCustomRoleDefinition(): Promise<string | null> {
        // (Code remains the same, but internal strings/dates translated)
        if (!this.plugin || !this.plugin.settings.customRoleFilePath) return null;
        try {
            const customPath = normalizePath(this.plugin.settings.customRoleFilePath);
            const file = this.plugin.app.vault.getAbstractFileByPath(customPath);
            if (file instanceof TFile) {
                let content = await this.plugin.app.vault.read(file);
                const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                content += `\n\nCurrent date and time: ${currentDate}, ${currentTime}`; // Translated format
                return content.trim();
            } else { console.warn(`Custom role file not found: ${customPath}`); return null; } // Translated warning
        } catch (error) { console.error("Error reading custom role definition:", error); return null; } // Translated error
    }

    async getRoleDefinition(): Promise<string | null> {
        // (Code remains the same)
        if (!this.plugin || !this.plugin.settings.followRole) return null;
        try {
            if (this.plugin.settings.useDefaultRoleDefinition) {
                return await this.getDefaultRoleDefinition();
            } else if (this.plugin.settings.customRoleFilePath) {
                return await this.getCustomRoleDefinition();
            } return null;
        } catch (error) { console.error("Error reading role definition:", error); return null; } // Translated error
    }
}