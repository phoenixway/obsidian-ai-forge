// src/ollamaService.ts
import OllamaPlugin from './main';
import { OllamaView } from './OllamaView'; // May not be needed directly anymore
import { PromptService } from './PromptService';
import { Chat } from './Chat'; // Needs Chat object for context
import { Message, MessageRole } from './OllamaView'; // Needs Message types

// API Response Interfaces (can move to types.ts)
export interface OllamaGenerateResponse { /* ... as defined in previous ApiService ... */ model: string; created_at: string; response: string; done: boolean; context?: number[]; total_duration?: number; load_duration?: number; prompt_eval_count?: number; prompt_eval_duration?: number; eval_count?: number; eval_duration?: number; }
export interface OllamaShowResponse { /* ... as defined in previous ApiService ... */ license?: string; modelfile?: string; parameters?: string; template?: string; details?: { [key: string]: any; };[key: string]: any; }

export class OllamaService {
    private plugin: OllamaPlugin;
    private promptService: PromptService;
    // No direct view reference needed now
    // private ollamaView: OllamaView | null = null;
    private eventHandlers: Record<string, Array<(data: any) => any>> = {}; // Keep event emitter for connection errors

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        // PromptService is now a dependency needed by OllamaService
        this.promptService = plugin.promptService;
        // Ensure PromptService also has a reference back if needed for summarization calls
        // (This creates a potential circular dependency - consider passing generateResponse as a callback instead)
        // For now, we assume PromptService gets the ApiService instance if needed.
    }

    // --- Event Emitter for internal errors (like connection) ---
    on(event: string, callback: (data: any) => any): () => void { if (!this.eventHandlers[event]) this.eventHandlers[event] = []; this.eventHandlers[event].push(callback); return () => { this.eventHandlers[event] = this.eventHandlers[event]?.filter(h => h !== callback); if (this.eventHandlers[event]?.length === 0) delete this.eventHandlers[event]; }; }
    emit(event: string, data?: any): void { const h = this.eventHandlers[event]; if (h) h.slice().forEach(handler => { try { handler(data); } catch (e) { console.error(`Error in OllamaService event handler for ${event}:`, e); } }); }
    // --- End Event Emitter ---


    // setOllamaView(view: OllamaView): void { // No longer needed
    //   this.ollamaView = view;
    // }

    setBaseUrl(url: string): void {
        // Base URL is now read from settings dynamically
    }
    // --- NEW: Low-level method for /api/generate ---
    /**
     * Sends a raw request body to the Ollama /api/generate endpoint.
     * @param requestBody The complete request body including model, prompt, options, etc.
     * @returns The parsed OllamaGenerateResponse.
     */
    async generateRaw(requestBody: any): Promise<OllamaGenerateResponse> {
        console.log("[OllamaService] Sending RAW request to /api/generate:", JSON.stringify({ ...requestBody, prompt: requestBody.prompt?.substring(0, 100) + "..." }));
        // Note: generateRaw itself doesn't know about PromptService or Chat objects
        // It relies on the caller to format the prompt and system message correctly.
        if (!requestBody.model || !requestBody.prompt) {
            throw new Error("generateRaw requires 'model' and 'prompt' in requestBody");
        }
        // Remove system if null/undefined before sending
        if (!requestBody.system) {
            delete requestBody.system;
        }
        return await this._ollamaFetch<OllamaGenerateResponse>('/api/generate', {
            method: "POST",
            body: JSON.stringify(requestBody),
        });
    }
    // --- END NEW METHOD ---


    /**
     * Generates a chat response based on the current chat state.
     * Orchestrates prompt preparation and API call using generateRaw.
     */
    async generateChatResponse(chat: Chat): Promise<Message | null> {
        if (!chat) { console.error("[OllamaService] generateChatResponse called with null chat."); return null; }

        const currentSettings = this.plugin.settings;
        const modelName = chat.metadata.modelName || currentSettings.modelName;
        const temperature = chat.metadata.temperature ?? currentSettings.temperature;
        const selectedRolePath = chat.metadata.selectedRolePath || currentSettings.selectedRolePath;

        try {
            const history = chat.getMessages();
            const lastUserMessage = history.findLast(m => m.role === 'user');
            if (!lastUserMessage) { console.warn("[OllamaService] No user message in history for response."); return null; }

            // Prepare prompt (this now also sets the system prompt in PromptService via getRoleDefinition)
            const formattedPrompt = await this.promptService.prepareFullPrompt(history, chat.metadata); // Pass metadata
            const systemPrompt = this.promptService.getSystemPrompt(); // Get the potentially updated system prompt

            // Prepare request body for generateRaw
            const requestBody = {
                model: modelName,
                prompt: formattedPrompt,
                stream: false,
                temperature: temperature,
                options: { num_ctx: currentSettings.contextWindow, },
                system: systemPrompt ?? undefined
            };

            console.log(`[OllamaService] Calling generateRaw for chat response: Model:"${modelName}", Temp:${temperature}`);

            // --- ЗМІНЕНО ТУТ: Використовуємо generateRaw ---
            const responseData = await this.generateRaw(requestBody);
            // -------------------------------------------

            // Process response
            if (responseData && typeof responseData.response === 'string') {
                const assistantMessage: Message = {
                    role: 'assistant',
                    content: responseData.response.trim(),
                    timestamp: new Date(responseData.created_at || Date.now())
                };
                return assistantMessage;
            } else {
                console.warn("[OllamaService] generateRaw returned unexpected structure:", responseData);
                throw new Error("Received unexpected or empty response from the model.");
            }

        } catch (error: any) {
            console.error("[OllamaService] Error during chat response generation cycle:", error);
            // Construct user-friendly error message (refining based on error type)
            let errorMessage = error instanceof Error ? error.message : "Unknown error generating response.";
            if (errorMessage.includes("model not found")) { errorMessage = `Model '${modelName}' not found. Check Ollama server or model name in settings/chat.`; }
            else if (errorMessage.includes('context window')) { errorMessage = `Context window error (${currentSettings.contextWindow} tokens): ${error.message}. Adjust context settings.`; }
            else if (errorMessage.includes("connect") || errorMessage.includes("fetch") || errorMessage.includes("NetworkError")) { errorMessage = `Connection Error: Failed to reach Ollama at ${currentSettings.ollamaServerUrl}. Is it running?`; }
            // Throw refined error for the caller (MessageService/View) to handle
            throw new Error(errorMessage);
        }
    }

    /**
     * Gets available models from Ollama (/api/tags).
     */
    async getModels(): Promise<string[]> { /* ... код без змін ... */ try { const data = await this._ollamaFetch<any>('/api/tags', { method: "GET" }); if (Array.isArray(data?.models)) { return data.models.map((m: any) => typeof m === 'object' ? m.name : m).sort(); } return []; } catch (e) { console.error("Err fetch models:", e); return []; } }

    /**
     * Gets detailed information about a specific model (/api/show).
     */
    async getModelDetails(modelName: string): Promise<OllamaShowResponse | null> { /* ... код без змін ... */ console.log(`Workspaceing details for: ${modelName}`); try { const data = await this._ollamaFetch<OllamaShowResponse>('/api/show', { method: "POST", body: JSON.stringify({ name: modelName }) }); return data; } catch (e) { console.warn(`Fail get details for ${modelName}:`, e); return null; } }


    /**
     * Private helper for fetch requests to Ollama API.
     */
    private async _ollamaFetch<T>(endpoint: string, options: RequestInit): Promise<T> {
        const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
        const headers = { ...options.headers, 'Content-Type': 'application/json' };

        try {
            const response = await fetch(url, { ...options, headers });

            if (!response.ok) {
                let errorText = `Ollama API error! Status: ${response.status} at ${endpoint}`;
                try {
                    const bodyText = await response.text();
                    try { const errorJson = JSON.parse(bodyText); errorText += `: ${errorJson.error || bodyText}`; }
                    catch { errorText += `: ${bodyText}`; }
                } catch { /* Ignore body reading error */ }
                console.error(errorText);
                throw new Error(errorText);
            }

            // Handle cases where response might be empty (e.g., 204 No Content)
            const text = await response.text();
            if (!text) {
                // Or return a specific type indicating no content if necessary
                return null as T;
            }
            return JSON.parse(text) as T; // Assume JSON response

        } catch (error: any) {
            console.error(`Workspace error calling Ollama (${url}):`, error);
            const connectionErrorMsg = `Failed to connect to Ollama server at ${this.plugin.settings.ollamaServerUrl}. Is it running? (Endpoint: ${endpoint})`;
            this.emit('connection-error', new Error(connectionErrorMsg)); // Emit connection error event
            throw new Error(connectionErrorMsg); // Re-throw for caller
        }
    }
}