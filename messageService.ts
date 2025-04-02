import { Notice } from "obsidian";
import OllamaPlugin from "./main";
import { OllamaView, MessageRole, Message } from "./ollamaView";
import { ApiService, OllamaResponse } from "./apiServices";
import { PromptService } from "./promptService";

export class MessageService {
    private plugin: OllamaPlugin;
    private view: OllamaView | null = null;
    private apiService: ApiService;
    private promptService: PromptService;
    private isProcessing: boolean = false;

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        this.apiService = plugin.apiService;
        this.promptService = plugin.promptService;
    }

    public setView(view: OllamaView): void {
        this.view = view;
    }

    public async loadMessageHistory(): Promise<void> {
        if (!this.view) return;
        let historyLoaded = false;
        try {
            const history = await this.plugin.loadMessageHistory();
            if (Array.isArray(history) && history.length > 0) {
                for (const msg of history) {
                    const role = msg.role as MessageRole;
                    // Added more robust check for message structure
                    if (role && typeof msg.content === 'string' && msg.timestamp) {
                        this.view.internalAddMessage(role, msg.content, {
                            saveHistory: false,
                            timestamp: msg.timestamp
                        });
                    } else {
                        console.warn("Skipping message with incomplete/invalid data during history load:", msg); // Translated warning
                    }
                }
                historyLoaded = true;
                setTimeout(() => this.view?.guaranteedScrollToBottom(100, true), 100);
                // Check collapsing after history is loaded (call moved to OllamaView.loadAndRenderHistory)
            }
            if (historyLoaded) {
                // Delay saving slightly to allow rendering
                setTimeout(async () => {
                    await this.view?.saveMessageHistory();
                }, 200);
            }
        } catch (error) {
            console.error("MessageService: Error loading history:", error); // Translated error
        } finally {
            if (this.view && this.view.getMessagesCount() === 0) {
                this.view.showEmptyState();
            } else if (this.view) {
                this.view.hideEmptyState();
            }
        }
    }

    public async sendMessage(content: string): Promise<void> {
        if (this.isProcessing || !content.trim() || !this.view) return;
        await this.processWithOllama(content);
    }

    private async processWithOllama(content: string): Promise<void> {
        if (!this.view) return;

        this.isProcessing = true;
        this.view.setLoadingState(true);
        const loadingMessageEl = this.view.addLoadingIndicator();

        setTimeout(async () => {
            let responseData: OllamaResponse | null = null;
            try {
                // 1. Get history from View
                const history: Message[] = this.view?.getMessages() ?? [];

                // 2. Prepare the full prompt (handles history, RAG, context management)
                const formattedPrompt = await this.promptService.prepareFullPrompt(content, history);

                // 3. Prepare the request body
                const requestBody = {
                    model: this.plugin.settings.modelName,
                    prompt: formattedPrompt,
                    stream: false, // Streaming not implemented yet
                    temperature: this.plugin.settings.temperature,
                    options: {
                        num_ctx: this.plugin.settings.contextWindow,
                    },
                    system: this.promptService.getSystemPrompt() ?? undefined
                };
                if (!requestBody.system) { delete requestBody.system; }

                // 4. Call the API
                responseData = await this.apiService.generateResponse(requestBody);

                // 5. Process the response
                this.view?.removeLoadingIndicator(loadingMessageEl);
                if (responseData && typeof responseData.response === 'string') {
                    this.view?.internalAddMessage("assistant", responseData.response.trim());
                } else {
                    console.warn("Received unexpected response from model:", responseData); // Translated warning
                    this.view?.internalAddMessage("error", "Received an unexpected or empty response from the model."); // Translated error message
                }

            } catch (error: any) { // Handle errors
                console.error("Error processing request with Ollama:", error); // Translated error
                this.view?.removeLoadingIndicator(loadingMessageEl);

                let errorMessage = "An unknown error occurred while interacting with Ollama."; // Translated default
                if (error instanceof Error) {
                    errorMessage = error.message;
                    // Add specific hints
                    if (errorMessage.includes("Model") && errorMessage.includes("not found")) {
                        errorMessage += ` Check the model name "${this.plugin.settings.modelName}" in settings.`; // Translated hint
                    } else if (errorMessage.includes("connect") || errorMessage.includes("fetch") || errorMessage.includes("NetworkError") || errorMessage.includes('Failed to fetch')) {
                        errorMessage += ` Check the Ollama server URL (${this.plugin.settings.ollamaServerUrl}) and ensure the server is running.`; // Translated hint
                    } else if (error.message.includes('context window') || error.message.includes('maximum context length')) {
                        errorMessage = `Context window error (${this.plugin.settings.contextWindow} tokens): ${error.message}. Try reducing 'Model Context Window' or toggle 'Advanced Context Strategy' in settings.`; // Translated hint
                    }
                }
                this.view?.internalAddMessage("error", errorMessage); // Display refined error

            } finally { // Always execute
                this.isProcessing = false;
                this.view?.setLoadingState(false); // Always release loading state
            }
        }, 0); // setTimeout 0 for async execution without blocking UI
    }

    public addSystemMessage(content: string): void {
        if (this.view) {
            // Use English for system messages generated by the plugin itself
            // If the content comes from user settings (like role change), it might be localized already.
            this.view.internalAddMessage("system", content);
        }
    }
}