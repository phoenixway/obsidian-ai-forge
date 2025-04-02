import { Notice } from "obsidian";
import OllamaPlugin from "./main";
import { OllamaView, MessageRole } from "./ollamaView";

export interface RequestOptions { num_ctx?: number; }

export interface OllamaRequestBody {
    model: string;
    prompt: string;
    stream: boolean;
    temperature: number;
    system?: string;
    options?: RequestOptions;
}

export class MessageService {
    private plugin: OllamaPlugin;
    private view: OllamaView | null = null;
    private isProcessing: boolean = false;

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
    }

    public setView(view: OllamaView): void {
        this.view = view;
    }

    public async loadMessageHistory(): Promise<void> {
        if (!this.view) return;

        let historyLoaded = false;
        try {
            const history = await this.plugin.loadMessageHistory(); // Expects array of {role, content, timestamp}

            if (Array.isArray(history) && history.length > 0) {
                // View should already be cleared by OllamaView.loadAndRenderHistory
                for (const msg of history) {
                    const role = msg.role as MessageRole;
                    if (role && msg.content && msg.timestamp) {
                        // Add message to view without triggering individual saves
                        // Pass the original timestamp
                        this.view.internalAddMessage(role, msg.content, {
                            saveHistory: false,
                            timestamp: msg.timestamp // Pass ISO string or Date object
                        });
                    } else {
                        console.warn("Skipping message with missing data during history load:", msg);
                    }
                }
                historyLoaded = true;
                this.view.guaranteedScrollToBottom(100, true);
            }
            // If history was loaded, save the complete state once
            if (historyLoaded) {
                await this.view.saveMessageHistory();
            }
            // View handles showing empty state if history is empty after this process

        } catch (error) {
            console.error("MessageService: Error loading message history:", error);
            // View's loadAndRenderHistory should handle clearing and showing empty state on error
        }
    }

    public async sendMessage(content: string): Promise<void> {
        if (this.isProcessing || !content.trim() || !this.view) return;
        // OllamaView handles adding the user message and clearing the input field

        await this.processWithOllama(content);
    }

    private async processWithOllama(content: string): Promise<void> {
        if (!this.view) return;

        this.isProcessing = true; // Internal flag for MessageService logic
        this.view.setLoadingState(true); // Update View's UI state
        const loadingMessageEl = this.view.addLoadingIndicator();

        // Use setTimeout to allow UI to update before potentially long API call
        setTimeout(async () => {
            try {
                let useSystemPrompt = false;
                const messagesPairCount = this.view?.getMessagesPairCount() ?? 0;
                const messagesCount = this.view?.getMessagesCount() ?? 0; // Includes the user message just added

                // Logic for using system prompt (adjust as needed)
                if (this.plugin.settings.followRole) {
                    const systemPromptInterval = this.plugin.settings.systemPromptInterval || 0;
                    if (systemPromptInterval === 0) { // Always use if interval is 0
                        useSystemPrompt = true;
                    } else if (systemPromptInterval > 0) {
                        // Check based on pairs *before* the current interaction starts
                        // User message was added, assistant response is pending.
                        // If interval is 1, use on every pair.
                        // If interval is 2, use on pairs 0, 2, 4...
                        // messagesPairCount reflects completed pairs.
                        useSystemPrompt = (messagesPairCount % systemPromptInterval) === 0;
                    }
                }

                // Check if it's effectively the start of a conversation for prompt preparation
                // messagesCount will be 1 if only the initial user message exists
                const isNewConversation = messagesCount <= 1;

                const formattedPrompt = await this.plugin.promptService.prepareFullPrompt(
                    content,
                    isNewConversation // Pass context flag to prompt service
                );

                const requestBody: OllamaRequestBody = {
                    model: this.plugin.settings.modelName,
                    prompt: formattedPrompt,
                    stream: false, // Change to true for streaming
                    temperature: this.plugin.settings.temperature || 0.2,
                    options: {
                        num_ctx: this.plugin.settings.contextWindow || 8192,
                    }
                };

                if (useSystemPrompt) {
                    const systemPrompt = this.plugin.promptService.getSystemPrompt();
                    if (systemPrompt) {
                        requestBody.system = systemPrompt;
                        console.log("Using system prompt for this request.");
                    }
                }

                const data = await this.plugin.apiService.generateResponse(requestBody);

                this.view?.removeLoadingIndicator(loadingMessageEl);
                // Add assistant response via the view
                this.view?.internalAddMessage("assistant", data.response);

            } catch (error) {
                console.error("Error processing request with Ollama:", error);
                this.view?.removeLoadingIndicator(loadingMessageEl);
                const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
                // Add error message via the view
                this.view?.internalAddMessage(
                    "error",
                    `Connection error with Ollama: ${errorMessage}. Please check the settings and ensure the server is running.`
                );
            } finally {
                this.isProcessing = false;
                // Update View's UI state via its method
                this.view?.setLoadingState(false);
            }
        }, 0); // End of setTimeout callback
    }

    public addSystemMessage(content: string): void {
        if (this.view) {
            // Add system message via the view, triggering save etc.
            this.view.internalAddMessage("system", content);
        }
    }
}