// OllamaService.ts
import OllamaPlugin from './main';
import { Message, OllamaEmbeddingsResponse, OllamaGenerateResponse, OllamaShowResponse } from './types';
import { PromptService } from './PromptService';
import { Notice, requestUrl, RequestUrlParam } from 'obsidian';
import { Chat } from './Chat';

export class OllamaService {
    private plugin: OllamaPlugin;
    private promptService: PromptService;
    private eventHandlers: Record<string, Array<(data: any) => any>> = {}; // Keep event emitter for connection errors

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        if (!plugin.promptService) {
            const errorMsg = "[OllamaService] CRITICAL: PromptService not available on plugin instance during OllamaService construction!";
            plugin.logger.error(errorMsg);
            throw new Error(errorMsg);
        }
        this.promptService = plugin.promptService;
    }

    on(event: string, callback: (data: any) => any): () => void { if (!this.eventHandlers[event]) this.eventHandlers[event] = []; this.eventHandlers[event].push(callback); return () => { this.eventHandlers[event] = this.eventHandlers[event]?.filter(h => h !== callback); if (this.eventHandlers[event]?.length === 0) delete this.eventHandlers[event]; }; }
    emit(event: string, data?: any): void { const h = this.eventHandlers[event]; if (h) h.slice().forEach(handler => { try { handler(data); } catch (e) { console.error(`Error in OllamaService event handler for ${event}:`, e); } }); }

    setBaseUrl(url: string): void {
    }
    /**
     * Sends a raw request body to the Ollama /api/generate endpoint.
     */
    async generateRaw(requestBody: any): Promise<OllamaGenerateResponse> {
        this.plugin.logger.debug("[OllamaService] Sending RAW request to /api/generate:", { model: requestBody.model, temp: requestBody.temperature, system: !!requestBody.system, prompt_len: requestBody.prompt?.length });
        if (!requestBody.model || !requestBody.prompt) {
            throw new Error("generateRaw requires 'model' and 'prompt' in requestBody");
        }
        if (!requestBody.system) {
            delete requestBody.system;
        }
        // --- FIX: Pass stringified body and method to _ollamaFetch ---
        return await this._ollamaFetch<OllamaGenerateResponse>(
            '/api/generate',
            'POST', // Explicitly pass method
            JSON.stringify(requestBody) // Pass the stringified body
        );
        // --- END FIX ---
    }

    /**
     * Generates embeddings for a list of text prompts.
     */
    async generateEmbeddings(prompts: string[], model: string): Promise<number[][] | null> {
        if (!prompts || prompts.length === 0) return [];
        const endpoint = '/api/embeddings';
        this.plugin.logger.debug(`[OllamaService] Generating ${prompts.length} embeddings using model ${model}...`);

        const embeddingsList: number[][] = [];
        try {
            for (const prompt of prompts) {
                const trimmedPrompt = prompt.trim();
                if (!trimmedPrompt) {
                    this.plugin.logger.warn("[OllamaService] Skipping empty prompt for embedding.");
                    continue;
                }
                const requestBody = JSON.stringify({ model: model, prompt: trimmedPrompt });
                try {
                    // --- FIX: Pass stringified body and method to _ollamaFetch ---
                    const embeddingResponse = await this._ollamaFetch<OllamaEmbeddingsResponse>(
                        endpoint,
                        'POST', // Explicitly pass method
                        requestBody // Pass the stringified body
                    );
                    // --- END FIX ---
                    if (embeddingResponse && embeddingResponse.embedding) {
                        embeddingsList.push(embeddingResponse.embedding);
                    } else {
                       this.plugin.logger.warn(`[OllamaService] Invalid structure in embedding response for model ${model}. Prompt (start): "${trimmedPrompt.substring(0, 50)}..."`);
                    }
                } catch (singleError) {
                    this.plugin.logger.error(`[OllamaService] Failed to generate embedding for one prompt using model ${model}. Prompt (start): "${trimmedPrompt.substring(0, 50)}..."`, singleError);
                }
            } // End for loop
            this.plugin.logger.debug(`[OllamaService] Successfully generated ${embeddingsList.length} embeddings (out of ${prompts.length} prompts).`);
            return embeddingsList.length > 0 ? embeddingsList : null;
        } catch (error) {
            this.plugin.logger.error(`[OllamaService] General error during embedding generation for model ${model}:`, error);
            // Connection error event already emitted by _ollamaFetch if applicable
            return null;
        }
    }

    async getModels(forceRefresh: boolean = false): Promise<string[]> {
        // TODO: Add caching with forceRefresh
        const endpoint = '/api/tags'; // Визначаємо тільки шлях кінцевої точки
        const fullUrlForLogging = `${this.plugin.settings.ollamaServerUrl}${endpoint}`; // Для логування
        this.plugin.logger.debug(`[OllamaService] Fetching models from ${fullUrlForLogging}`);
        let modelListResult: string[] = []; // Initialize default

        try {
            // --- ВИПРАВЛЕНО: Передаємо тільки endpoint, а не повний URL ---
            const data = await this._ollamaFetch<{ models: Array<{name: string}> }>(
                endpoint, // Передаємо '/api/tags'
                'GET'     // Передаємо метод
            );
            // --- КІНЕЦЬ ВИПРАВЛЕННЯ ---

            // Explicitly check if data and data.models array exist
            if (data && Array.isArray(data.models)) {
                const modelNames = data.models
                  .map((m) => m?.name) // Get name property
                  .filter((name): name is string => typeof name === 'string' && name.length > 0) // Filter out non-strings/empty
                  .sort();
                this.plugin.logger.debug(`[OllamaService] Found ${modelNames.length} models.`);
                modelListResult = modelNames; // Assign result
            } else {
                // Log if structure is invalid, even if _ollamaFetch didn't throw
                this.plugin.logger.warn("[OllamaService] Invalid response structure received from /api/tags (expected { models: [...] }):", data);
                // modelListResult remains []
            }
        } catch (e) {
            this.plugin.logger.error(`[OllamaService] Failed to fetch models:`, e);
            // modelListResult remains []
            // Error should have been logged and emitted by _ollamaFetch
        }

        return modelListResult; // Single return point
   } // End getModels

    async getModelDetails(modelName: string): Promise<OllamaShowResponse | null> {
        this.plugin.logger.debug(`[OllamaService] Fetching details for model: ${modelName}`);
        const endpoint = '/api/show';
        try {
            // --- FIX: Pass stringified body and method to _ollamaFetch ---
            const data = await this._ollamaFetch<OllamaShowResponse>(
                endpoint,
                'POST', // Explicitly pass method
                JSON.stringify({ name: modelName }) // Pass the stringified body
            );
            // --- END FIX ---
            return data;
        } catch (e) {
            this.plugin.logger.warn(`[OllamaService] Failed to get details for model ${modelName}:`, e);
            return null;
        }
    }


/**
     * Private helper for fetch requests to Ollama API.
     * Now accepts method and optional string body.
     */
    // --- FIX: Changed method signature and implementation ---
    private async _ollamaFetch<T>(
        endpoint: string,
        method: string,
        body?: string
    ): Promise<T> { // Still returns Promise<T>
        const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        try {
            const requestParams: RequestUrlParam = { url, method, headers, body, throw: false };
            const response = await requestUrl(requestParams);

            // Check for non-OK status first
            if (response.status >= 400) {
                let errorText = `Ollama API error! Status: ${response.status} at ${endpoint}`;
                try { errorText += `: ${response.text || response.json?.error || 'No details'}`; } catch { /* ignore */ }
                this.plugin.logger.error(`[OllamaService] ${errorText}`);
                this.emit('connection-error', new Error(errorText));
                throw new Error(errorText); // Throw immediately
            }

            // Handle potentially empty successful responses (e.g., 204 should not happen for GET/POST expecting JSON)
            if (response.status === 204 || !response.text) {
                 // If expecting JSON, an empty response is usually an error
                 const errorMsg = `Ollama API success status (${response.status}) but empty response body at ${endpoint}`;
                 this.plugin.logger.warn(`[OllamaService] ${errorMsg}`);
                 // Decide: throw or return a specific T indicating empty? Let's throw for now.
                 throw new Error(errorMsg);
                // return null as T; // Previous approach - might confuse TS flow analysis
            }

             // Attempt to parse JSON
             try {
                const jsonData = response.json;
                if (jsonData === null || jsonData === undefined) {
                    // Handle cases where response.json itself is null/undefined even with text
                    throw new Error(`Ollama API returned null/undefined JSON at ${endpoint}`);
                }
                return jsonData as T;
             } catch (jsonError) {
                  this.plugin.logger.error(`[OllamaService] Failed to parse JSON response from ${url}. Status: ${response.status}`, jsonError, "Response Text:", response.text);
                  throw new Error(`Failed to parse Ollama JSON response from ${endpoint}`);
             }

        } catch (error: any) {
            // Handle network errors or re-throw API errors
            this.plugin.logger.error(`[OllamaService] Error in _ollamaFetch (${url}):`, error);
            const connectionErrorMsg = `Failed to connect/communicate with Ollama server at ${this.plugin.settings.ollamaServerUrl}. Is it running? (Endpoint: ${endpoint})`;
            // Emit connection error only if it wasn't an API error already emitted
            if (!error.message?.includes('Ollama API error')) {
                this.emit('connection-error', new Error(connectionErrorMsg));
            }
            // Re-throw a consistent error type
            throw new Error(error.message || connectionErrorMsg);
        }
    }

/**
     * Генерує відповідь чату, готуючи промпт та викликаючи generateRaw.
     */
async generateChatResponse(chat: Chat): Promise<Message | null> {
    if (!chat) { this.plugin.logger.error("[OllamaService] generateChatResponse called with null chat."); return null; }

    // Перевірка наявності PromptService (додаткова)
    if (!this.promptService) {
         this.plugin.logger.error("[OllamaService] PromptService is not initialized!");
         new Notice("Error: Prompt service is unavailable.");
         return null;
    }

    const currentSettings = this.plugin.settings;
    const modelName = chat.metadata.modelName || currentSettings.modelName;
    const temperature = chat.metadata.temperature ?? currentSettings.temperature;

    if (!modelName) {
        this.plugin.logger.error("[OllamaService] No model specified in chat metadata or settings.");
        new Notice("Error: No Ollama model selected.");
        return null;
    }

    try {
        const history = chat.getMessages();
        // --- ВИПРАВЛЕНО: Виклик нових методів PromptService ---
        this.plugin.logger.debug("[OllamaService] Getting system prompt from PromptService...");
        const systemPrompt = await this.promptService.getSystemPromptForAPI(chat.metadata);

        this.plugin.logger.debug("[OllamaService] Preparing prompt body from PromptService...");
        const promptBody = await this.promptService.preparePromptBody(history, chat.metadata);
        // --- КІНЕЦЬ ВИПРАВЛЕННЯ ---

        if (promptBody === null || promptBody === undefined) { // Додали перевірку на undefined
             this.plugin.logger.error("[OllamaService] Prompt body generation failed (returned null/undefined).");
             new Notice("Error: Could not generate prompt body.");
             return null;
        }

        // Формуємо тіло запиту
        const requestBody: any = {
            model: modelName,
            prompt: promptBody, // Тут вже є історія + RAG + завдання
            stream: false,
            temperature: temperature,
            options: { num_ctx: currentSettings.contextWindow, },
            // Додаємо system, тільки якщо він існує і не порожній
            ...(systemPrompt && { system: systemPrompt })
        };

        this.plugin.logger.debug(`[OllamaService] Calling generateRaw for chat response: Model:"${modelName}", Temp:${temperature}, System Prompt Provided: ${!!systemPrompt}`);
        this.plugin.logger.debug("[OllamaService] Request body (prompt truncated):", {...requestBody, prompt: promptBody.substring(0, 200) + "..."}); // Логуємо скорочений промпт

        const responseData = await this.generateRaw(requestBody);

        if (responseData && typeof responseData.response === 'string') {
            this.plugin.logger.debug(`[OllamaService] Received response. Length: ${responseData.response.length} chars`);
            const assistantMessage: Message = {
                role: 'assistant',
                content: responseData.response.trim(),
                timestamp: new Date(responseData.created_at || Date.now()) // Використовуємо час відповіді або поточний
            };
            return assistantMessage;
        } else {
            this.plugin.logger.warn("[OllamaService] generateRaw returned unexpected structure or no response.", responseData);
            throw new Error("Received unexpected or empty response from the model."); // Кидаємо помилку
        }

    } catch (error: any) {
        this.plugin.logger.error("[OllamaService] Error during chat response generation cycle:", error);
        let errorMessage = error instanceof Error ? error.message : "Unknown error generating response.";
        // Спроба зробити повідомлення про помилку більш зрозумілим
        if (errorMessage.includes("model not found")) { errorMessage = `Model '${modelName}' not found. Check Ollama server or model name.`; }
        else if (errorMessage.includes('context window')) { errorMessage = `Context window error (${currentSettings.contextWindow} tokens): ${error.message}. Adjust context settings.`; }
        else if (errorMessage.includes("connect") || errorMessage.includes("fetch") || errorMessage.includes("NetworkError") || error.message?.includes('Failed to connect')) { errorMessage = `Connection Error: Failed to reach Ollama at ${currentSettings.ollamaServerUrl}. Is it running?`; }
        // Подія помилки з'єднання генерується в _ollamaFetch
        new Notice(errorMessage); // Показуємо повідомлення користувачу
        return null; // Повертаємо null при помилці
    }
}

}