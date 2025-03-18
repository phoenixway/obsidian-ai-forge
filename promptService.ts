// promptService.ts
import { StateManager } from './stateManager';

export class PromptService {
    private stateManager: StateManager;
    private systemPrompt: string | null = null;

    constructor() {
        this.stateManager = StateManager.getInstance();
    }

    /**
     * Set system prompt to be used with each request
     */
    setSystemPrompt(prompt: string | null): void {
        this.systemPrompt = prompt;
    }

    /**
     * Get system prompt if set
     */
    getSystemPrompt(): string | null {
        return this.systemPrompt;
    }

    /**
     * Format user prompt with necessary context and state information
     */
    formatPrompt(userInput: string, isNewConversation: boolean = false): string {
        // Process user message and update state
        this.stateManager.processUserMessage(userInput);

        // If it's a new conversation, return the prompt without state header
        if (isNewConversation) {
            return userInput;
        }

        // Get formatted state for inclusion in the prompt
        const stateHeader = this.stateManager.getStateFormatted();
        return `${stateHeader}\n\n${userInput}`;
    }

    /**
     * Enhance prompt with RAG context if available
     */
    enhanceWithRagContext(prompt: string, ragContext: string | null): string {
        if (!ragContext) {
            return prompt;
        }

        return `Context information:\n${ragContext}\n\nUser message: ${prompt}`;
    }

    /**
     * Prepare request body for model API call
     */
    prepareRequestBody(modelName: string, prompt: string, temperature: number = 0.2): any {
        const requestBody: any = {
            model: modelName,
            prompt: prompt,
            stream: false,
            temperature: temperature,
        };

        if (this.systemPrompt) {
            requestBody.system = this.systemPrompt;
        }

        return requestBody;
    }

    /**
     * Process response from language model
     */
    processModelResponse(response: string): string {
        // Decode HTML entities if needed
        const textArea = document.createElement("textarea");
        textArea.innerHTML = response;
        const decodedResponse = textArea.value;

        // Return decoded response if it contains thinking tags
        return decodedResponse.includes("<think>") ? decodedResponse : response;
    }
}