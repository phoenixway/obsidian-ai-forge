// promptService.ts
import { Notice, TFile, normalizePath } from "obsidian";
import * as path from 'path'; // Node.js path module for working with paths
import OllamaPlugin from "./main";
import { Message } from "./ollamaView"; // Import Message interface from view
import { encode } from 'gpt-tokenizer'; // Import the tokenizer
import { ApiService, OllamaShowResponse } from "./apiServices"; // Import ApiService and its response types

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
    // Need access to ApiService for summarization and model details
    private apiService: ApiService;
    // Buffer of tokens to reserve for the model's response & potential inaccuracies
    private readonly RESPONSE_TOKEN_BUFFER = 500;
    // Cache for detected model context sizes { modelName: detectedContextSize | null }
    private modelDetailsCache: Record<string, number | null> = {};
    // Cache for role file content { roleFilePath: content | null }
    private roleContentCache: Record<string, string | null> = {};

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        this.apiService = plugin.apiService; // Get ApiService instance from plugin
    }

    setSystemPrompt(prompt: string | null): void {
        this.systemPrompt = prompt;
    }

    getSystemPrompt(): string | null {
        return this.systemPrompt;
    }

    /**
     * Clears the cached model details. Should be called when server URL changes or plugin reloads.
     */
    clearModelDetailsCache(): void {
        this.modelDetailsCache = {};
        console.log("[PromptService] Model details cache cleared."); // English log
    }

    /**
     * Clears the cached role file contents. Should be called when role folder path changes or files are modified.
     */
    clearRoleCache(): void {
        this.roleContentCache = {};
        console.log("[PromptService] Role content cache cleared."); // English log
    }


    /**
     * Determines the effective context limit by checking the model details (if advanced strategy enabled)
     * and comparing with the user's setting. Returns the smaller of the two valid values.
     */
    private async _getEffectiveContextLimit(): Promise<number> {
        const userDefinedContextSize = this.plugin.settings.contextWindow;
        let effectiveContextLimit = userDefinedContextSize; // Default to user setting
        const modelName = this.plugin.settings.modelName;

        // Attempt programmatic detection ONLY if advanced strategy is enabled
        if (this.plugin.settings.useAdvancedContextStrategy && modelName) {
            let detectedSize: number | null = null;

            // Check cache first
            if (this.modelDetailsCache.hasOwnProperty(modelName)) {
                detectedSize = this.modelDetailsCache[modelName];
                // console.log(`[PromptService] Using cached context size for ${modelName}: ${detectedSize}`);
            } else {
                // Not in cache, fetch details
                console.log(`[PromptService] No cache for ${modelName}, fetching details...`); // English log
                try {
                    const details: OllamaShowResponse | null = await this.apiService.getModelDetails(modelName);
                    if (details) {
                        // Try to extract context size from various potential fields
                        let sizeStr: string | undefined = undefined;

                        // 1. Check 'parameters' string (common format)
                        if (details.parameters) {
                            // Regex to find 'num_ctx' followed by numbers
                            const match = details.parameters.match(/num_ctx\s+(\d+)/);
                            if (match && match[1]) {
                                sizeStr = match[1];
                            }
                        }
                        // 2. Check structured details object (alternative format)
                        if (!sizeStr && details.details?.['llm.context_length']) {
                            sizeStr = String(details.details['llm.context_length']);
                        }
                        if (!sizeStr && details.details?.['tokenizer.ggml.context_length']) {
                            sizeStr = String(details.details['tokenizer.ggml.context_length']);
                        }
                        // Add checks for other potential parameter names here if discovered

                        if (sizeStr) {
                            const parsedSize = parseInt(sizeStr, 10);
                            // Validate the parsed size
                            if (!isNaN(parsedSize) && parsedSize > 0) {
                                detectedSize = parsedSize;
                                console.log(`[PromptService] Detected context size for ${modelName}: ${detectedSize}`); // English log
                                this.modelDetailsCache[modelName] = detectedSize; // Cache the valid result
                            } else {
                                console.warn(`[PromptService] Parsed context size for ${modelName} is invalid: ${sizeStr}`); // English warning
                                detectedSize = null;
                            }
                        }

                        if (detectedSize === null) {
                            console.log(`[PromptService] Context size parameter not found in details for ${modelName}. Using user setting.`); // English log
                            this.modelDetailsCache[modelName] = null; // Cache failure (null)
                        }
                    } else {
                        this.modelDetailsCache[modelName] = null; // Cache request failure (null)
                        detectedSize = null;
                    }
                } catch (error) {
                    console.error(`[PromptService] Error fetching model details for ${modelName}:`, error); // English error
                    this.modelDetailsCache[modelName] = null; // Cache error (null)
                    detectedSize = null;
                }
            }

            // Use the SMALLER of the detected size and user setting, if detection was successful
            if (detectedSize !== null && detectedSize > 0) {
                effectiveContextLimit = Math.min(userDefinedContextSize, detectedSize);
                if (effectiveContextLimit < userDefinedContextSize) {
                    console.log(`[PromptService] Using detected context limit (${effectiveContextLimit}) as it's smaller than user setting (${userDefinedContextSize}).`); // English log
                } else {
                    // console.log(`[PromptService] Using user defined context limit (${effectiveContextLimit}) as it's smaller or equal to detected.`); // English log
                }
            } else {
                // console.log(`[PromptService] Using user defined context limit (${effectiveContextLimit}) due to detection failure or model not cached.`); // English log
            }
        } else {
            // console.log(`[PromptService] Using user defined context limit (${effectiveContextLimit}), advanced strategy disabled.`); // English log
        }

        // Ensure the limit is never below a minimum practical value
        return Math.max(100, effectiveContextLimit);
    }


    /**
     * Attempts to summarize a list of messages using the current LLM.
     * Returns the summary text or null if summarization is disabled or fails.
     */
    private async _summarizeMessages(messagesToSummarize: Message[]): Promise<string | null> {
        // Check if summarization is enabled in settings
        if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0) {
            return null;
        }
        console.log(`[Ollama] Attempting to summarize ${messagesToSummarize.length} messages.`); // English log

        // Format messages into a single block for the summarization prompt
        const textToSummarize = messagesToSummarize
            .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.trim()}`)
            .join("\n"); // Use newline as separator

        // Insert the text into the user-defined summarization prompt
        const summarizationFullPrompt = this.plugin.settings.summarizationPrompt
            .replace('{text_to_summarize}', textToSummarize);

        // Prepare request body for summarization call
        const summaryRequestBody = {
            model: this.plugin.settings.modelName, // Use the same model for summarization
            prompt: summarizationFullPrompt,
            stream: false,
            temperature: 0.2, // Use low temperature for more factual summary
            options: {
                num_ctx: this.plugin.settings.contextWindow, // Use the same context window setting
                // Consider adding stop words specific to summarization if needed
            },
            // Explicitly DON'T pass the main system prompt to avoid influencing the summary
            // system: "You are a text summarization assistant." // Optionally add a specific system prompt for summarization
        };

        try {
            // Call the API to generate the summary
            const summaryResponse = await this.apiService.generateResponse(summaryRequestBody);
            const summaryText = summaryResponse?.response?.trim();

            if (summaryText) {
                console.log(`[Ollama] Summarization successful. Original tokens: ${countTokens(textToSummarize)}, Summary tokens: ${countTokens(summaryText)}`); // English log
                return summaryText; // Return the generated summary
            } else {
                console.warn("[Ollama] Summarization failed: Empty response from model."); // English warning
                return null; // Return null if response is empty
            }
        } catch (error) {
            console.error("[Ollama] Summarization API call failed:", error); // English error
            return null; // Return null on error
        }
    }


    /**
     * Prepares the full prompt string to be sent to the LLM's 'prompt' field,
     * handling context management (history, RAG, truncation/summarization)
     * based on plugin settings. The system prompt is handled separately.
     */
    async prepareFullPrompt(
        content: string, // Current user message
        history: Message[] // Full chat history
    ): Promise<string> {
        if (!this.plugin) {
            console.warn("Plugin reference not set in PromptService."); // English warning
            return content.trim();
        }

        // 1. Update system prompt (will be retrieved later by MessageService)
        try {
            const roleContent = await this.getRoleDefinition();
            this.setSystemPrompt(roleContent);
        } catch (error) {
            console.error("Error getting role definition:", error); // English error
            this.setSystemPrompt(null);
        }
        const currentSystemPrompt = this.getSystemPrompt(); // Get it now for token counting

        // 2. Prepare RAG context if enabled
        let ragContext: string | null = null;
        if (this.plugin.settings.ragEnabled && this.plugin.ragService) {
            try { ragContext = this.plugin.ragService.prepareContext(content); }
            catch (error) { console.error("Error processing RAG:", error); } // English error
        }
        const ragHeader = "## Contextual Information from Notes:\n"; // English header
        const ragBlock = ragContext ? `${ragHeader}${ragContext.trim()}\n\n---\n` : "";

        // 3. Determine effective context limit and max prompt tokens
        const effectiveContextLimit = await this._getEffectiveContextLimit();
        // Calculate max tokens allowed specifically for the prompt field (history + RAG + user input)
        // System prompt is sent separately but its tokens still count towards the *total* limit
        const systemPromptTokens = currentSystemPrompt ? countTokens(currentSystemPrompt) : 0;
        const maxPromptTokens = Math.max(100, effectiveContextLimit - systemPromptTokens - this.RESPONSE_TOKEN_BUFFER);

        // 4. Build the prompt based on the selected strategy
        let finalPrompt: string;
        const userInputFormatted = `User: ${content.trim()}`;

        if (this.plugin.settings.useAdvancedContextStrategy) {
            // --- Advanced Strategy (Tokens + Optional Summarization) ---
            console.log(`[Ollama] Using advanced context strategy (Effective Limit: ${effectiveContextLimit} tokens, Max Prompt Field: ${maxPromptTokens} tokens).`); // English log
            let currentPromptTokens = 0; // Tokens count for the 'prompt' field only
            let promptHistoryParts: string[] = []; // For history/summaries

            // Account for user input (always included in the prompt field)
            const userInputTokens = countTokens(userInputFormatted);
            currentPromptTokens += userInputTokens;

            // Try to include RAG context first
            const ragTokens = countTokens(ragBlock);
            let finalRagBlock = "";
            if (ragBlock && currentPromptTokens + ragTokens <= maxPromptTokens) {
                finalRagBlock = ragBlock; // Will be prepended later
                currentPromptTokens += ragTokens;
                // console.log(`[Ollama] RAG context included (${ragTokens} prompt tokens).`); // English log
            } else if (ragBlock) {
                console.warn(`[Ollama] RAG context (${ragTokens} tokens) skipped, not enough space in prompt field. Available: ${maxPromptTokens - currentPromptTokens}`); // English warning
            }

            // Separate history: keep recent, process older
            const keepN = Math.min(history.length, this.plugin.settings.keepLastNMessagesBeforeSummary);
            const messagesToKeep = history.slice(-keepN);
            const messagesToProcess = history.slice(0, -keepN);

            // Add recent messages (verbatim) if they fit
            let keptMessagesTokens = 0;
            const keptMessagesStrings: string[] = [];
            for (let i = messagesToKeep.length - 1; i >= 0; i--) { // Iterate newest first
                const msg = messagesToKeep[i];
                const formattedMsg = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.trim()}`;
                const messageTokens = countTokens(formattedMsg);
                if (currentPromptTokens + messageTokens <= maxPromptTokens) {
                    keptMessagesStrings.push(formattedMsg); // Add to temp array (will reverse)
                    currentPromptTokens += messageTokens;
                    keptMessagesTokens += messageTokens;
                } else {
                    console.warn(`[Ollama] Message intended to be kept verbatim does not fit (index ${history.length - messagesToKeep.length + i}). Context full.`); // English warning
                    break; // Stop adding recent messages
                }
            }
            keptMessagesStrings.reverse(); // Restore chronological order
            // if (keptMessagesStrings.length > 0) console.log(`[Ollama] Kept last ${keptMessagesStrings.length} messages verbatim (${keptMessagesTokens} prompt tokens).`); // English log

            // Process older messages (try to summarize or discard)
            let processedHistoryParts: string[] = []; // Will hold summaries or original chunks
            let currentChunk: HistoryChunk = { messages: [], text: "", tokens: 0 };

            // Iterate older messages from NEWEST to OLDEST to build chunks
            for (let i = messagesToProcess.length - 1; i >= 0; i--) {
                const msg = messagesToProcess[i];
                const formattedMsg = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.trim()}`;
                const messageTokens = countTokens(formattedMsg);

                // If adding this message exceeds chunk size, process the accumulated chunk first
                if (currentChunk.tokens > 0 && currentChunk.tokens + messageTokens > this.plugin.settings.summarizationChunkSize) {
                    currentChunk.messages.reverse(); // Chronological order needed for summarization
                    currentChunk.text = currentChunk.messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n");

                    // Check if the whole chunk fits
                    if (currentPromptTokens + currentChunk.tokens <= maxPromptTokens) {
                        processedHistoryParts.push(currentChunk.text); // Add original chunk
                        currentPromptTokens += currentChunk.tokens;
                    } else if (this.plugin.settings.enableSummarization) { // If chunk doesn't fit, try summarizing
                        const summary = await this._summarizeMessages(currentChunk.messages);
                        if (summary) {
                            const summaryTokens = countTokens(summary);
                            const summaryFormatted = `[Summary of previous messages]:\n${summary}`; // English placeholder
                            if (currentPromptTokens + summaryTokens <= maxPromptTokens) { // Check if summary fits
                                processedHistoryParts.push(summaryFormatted); // Add summary
                                currentPromptTokens += summaryTokens;
                                console.log(`[Ollama] Added summary (${summaryTokens} tokens) instead of chunk (${currentChunk.tokens} tokens).`); // English log
                            } else {
                                console.warn(`[Ollama] Summary (${summaryTokens} tokens) still too large, discarding chunk.`); // English warning
                            }
                        } else {
                            console.warn(`[Ollama] Summarization failed for chunk, discarding.`); // English warning
                        }
                    } else { // Summarization disabled or summary didn't fit
                        console.log(`[Ollama] History chunk skipped (${currentChunk.tokens} tokens), summarization disabled or chunk too large.`); // English log
                    }
                    // Reset chunk
                    currentChunk = { messages: [], text: "", tokens: 0 };
                }

                // Add current message to the (potentially new) chunk
                currentChunk.messages.push(msg);
                currentChunk.tokens += messageTokens;
            }

            // Process the very last accumulated chunk
            if (currentChunk.messages.length > 0) {
                currentChunk.messages.reverse();
                currentChunk.text = currentChunk.messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`).join("\n");
                if (currentPromptTokens + currentChunk.tokens <= maxPromptTokens) {
                    processedHistoryParts.push(currentChunk.text);
                    currentPromptTokens += currentChunk.tokens;
                } else if (this.plugin.settings.enableSummarization) {
                    const summary = await this._summarizeMessages(currentChunk.messages);
                    if (summary) {
                        const summaryTokens = countTokens(summary);
                        const summaryFormatted = `[Summary of previous messages]:\n${summary}`; // English placeholder
                        if (currentPromptTokens + summaryTokens <= maxPromptTokens) {
                            processedHistoryParts.push(summaryFormatted);
                            currentPromptTokens += summaryTokens;
                            console.log(`[Ollama] Added summary (${summaryTokens} tokens) for last chunk (${currentChunk.tokens} tokens).`); // English log
                        } else { console.warn(`[Ollama] Summary (${summaryTokens} tokens) still too large for last chunk.`); } // English warning
                    } else { console.warn(`[Ollama] Summarization failed for last chunk, discarding.`); } // English warning
                } else { console.log(`[Ollama] Last history chunk skipped (${currentChunk.tokens} tokens), summarization disabled or chunk too large.`); } // English log
            }

            // Assemble final prompt: RAG + Processed History (Summaries/Chunks) + Kept History + User Input
            processedHistoryParts.reverse(); // Put oldest processed parts first
            const finalPromptParts = [finalRagBlock, ...processedHistoryParts, ...keptMessagesStrings, userInputFormatted].filter(Boolean); // Filter out empty RAG block
            finalPrompt = finalPromptParts.join("\n\n");
            console.log(`[Ollama] Final prompt field tokens: ${currentPromptTokens}. Total context tokens (incl. system): ${currentPromptTokens + systemPromptTokens}.`); // English log


        } else {
            // --- Basic Strategy (Words) ---
            console.log(`[Ollama] Using basic context strategy (Word Limit Approx based on ${effectiveContextLimit} tokens).`); // English log
            const systemPromptWordCount = currentSystemPrompt ? countWords(currentSystemPrompt) : 0;
            const userInputWordCount = countWords(userInputFormatted);
            // Calculate word limit based on effective token limit
            const tokenApproximationFactor = 1.0; // Very rough estimate
            const wordLimit = Math.max(100, (effectiveContextLimit / tokenApproximationFactor) - systemPromptWordCount - userInputWordCount - 300); // Larger buffer for words

            let contextParts: string[] = []; let currentWordCount = 0;
            const ragWords = countWords(ragBlock); let ragAdded = false;
            if (ragBlock && currentWordCount + ragWords <= wordLimit) { contextParts.push(ragBlock); currentWordCount += ragWords; ragAdded = true; }
            else if (ragBlock) { console.warn(`[Ollama] RAG context (${ragWords} words) skipped.`); } // English warning
            let addedHistoryMessages = 0;
            for (let i = history.length - 1; i >= 0; i--) { // Iterate newest first
                const msg = history[i]; const fmt = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.trim()}`; const words = countWords(fmt);
                if (currentWordCount + words <= wordLimit) { contextParts.push(fmt); currentWordCount += words; addedHistoryMessages++; }
                else { break; } // Stop when limit reached
            }
            // Assemble prompt: RAG + History (reversed) + User Input
            let finalPromptParts: string[] = [];
            if (ragAdded) { finalPromptParts.push(contextParts.shift()!); contextParts.reverse(); finalPromptParts = finalPromptParts.concat(contextParts); }
            else { contextParts.reverse(); finalPromptParts = contextParts; }
            finalPromptParts.push(userInputFormatted);
            finalPrompt = finalPromptParts.join("\n\n");
            console.log(`[Ollama] Final prompt word count (approx): ${currentWordCount + userInputWordCount}. History messages: ${addedHistoryMessages}.`); // English log
        }

        // Return the final prompt string (system prompt is sent separately)
        // console.log("[Ollama] Prepared prompt field:", finalPrompt.substring(0, 500) + "..."); // Log start of prompt
        return finalPrompt;
    }


    // --- Role definition methods ---

    /**
     * Reads the content of the currently selected role file based on settings.
     * Uses a simple cache.
     */
    async getRoleDefinition(): Promise<string | null> {
        if (!this.plugin || !this.plugin.settings.followRole) return null;

        const selectedRolePath = this.plugin.settings.selectedRolePath; // Use the new setting name
        if (!selectedRolePath || selectedRolePath.trim() === "") {
            // console.log("[PromptService] No role selected.");
            return null; // No role selected
        }

        // Check cache first
        if (this.roleContentCache.hasOwnProperty(selectedRolePath)) {
            // console.log(`[PromptService] Returning cached role content for: ${selectedRolePath}`);
            return this.roleContentCache[selectedRolePath];
        }

        console.log(`[PromptService] Reading role file content: ${selectedRolePath}`); // English log
        try {
            const normalizedPath = normalizePath(selectedRolePath); // Ensure path is normalized
            const file = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);

            if (file instanceof TFile) {
                let content = await this.plugin.app.vault.read(file);
                // Append current date and time
                const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); // English format
                const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); // English format
                content += `\n\nCurrent date and time: ${currentDate}, ${currentTime}`;
                const finalContent = content.trim();
                this.roleContentCache[selectedRolePath] = finalContent; // Cache the result
                return finalContent;
            } else {
                console.warn(`[PromptService] Selected role path is not a file or not found: ${selectedRolePath}`); // English warning
                this.roleContentCache[selectedRolePath] = null; // Cache failure (null)
                // Maybe notify user that selected role couldn't be loaded?
                // new Notice(`Failed to load selected role: ${selectedRolePath}`);
                return null;
            }
        } catch (error) {
            console.error(`[PromptService] Error reading selected role file ${selectedRolePath}:`, error); // English error
            this.roleContentCache[selectedRolePath] = null; // Cache error (null)
            new Notice(`Error reading role file: ${selectedRolePath}`); // English notice
            return null;
        }
    }
    // Removed getDefaultRoleDefinition and getCustomRoleDefinition as they are replaced by getRoleDefinition
}