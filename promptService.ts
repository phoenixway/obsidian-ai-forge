// promptService.ts
import { StateManager } from './stateManager';
import { TFile } from "obsidian";
import * as path from 'path';

export class PromptService {
    private stateManager: StateManager;
    private systemPrompt: string | null = null;
    private plugin: any; // Reference to the plugin for accessing services

    constructor(plugin?: any) {
        this.stateManager = StateManager.getInstance();
        this.plugin = plugin;
    }

    /**
     * Set plugin reference for accessing services
     */
    setPlugin(plugin: any): void {
        this.plugin = plugin;
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
        // const stateHeader = this.stateManager.getStateFormatted();
        // return `${stateHeader}\n\n${userInput}`;
        return userInput;
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

    /**
     * Get default role definition from plugin folder
     */
    async getDefaultRoleDefinition(): Promise<string | null> {
        if (!this.plugin) {
            return null;
        }

        try {
            // Get plugin folder path
            const pluginFolder = this.plugin.manifest.dir;
            const rolePath = path.join(pluginFolder, 'default-role.md');

            const file = this.plugin.app.vault.getAbstractFileByPath(rolePath);

            if (file instanceof TFile) {
                let content = await this.plugin.app.vault.read(file);
                const currentTime = new Date().toLocaleTimeString();
                content += `\nAI time is ${currentTime} now`;
                return content;
            }

            return null;
        } catch (error) {
            console.error("Error reading default role definition:", error);
            return null;
        }
    }

    /**
     * Get custom role definition from specified path
     */
    async getCustomRoleDefinition(): Promise<string | null> {
        if (!this.plugin || !this.plugin.settings.customRoleFilePath) {
            return null;
        }

        try {
            const customPath = this.plugin.settings.customRoleFilePath;
            const file = this.plugin.app.vault.getAbstractFileByPath(customPath);

            if (file instanceof TFile) {
                let content = await this.plugin.app.vault.read(file);
                const currentTime = new Date().toLocaleTimeString();
                content += `\nAI time is ${currentTime} now`;
                return content;
            }

            return null;
        } catch (error) {
            console.error("Error reading custom role definition:", error);
            return null;
        }
    }

    /**
     * Get role definition based on settings
     */
    async getRoleDefinition(): Promise<string | null> {
        if (!this.plugin || !this.plugin.settings.followRole) {
            return null;
        }

        try {
            // Use default role if enabled
            if (this.plugin.settings.useDefaultRoleDefinition) {
                return await this.getDefaultRoleDefinition();
            }
            // Otherwise use custom role path if provided
            else if (this.plugin.settings.customRoleFilePath) {
                return await this.getCustomRoleDefinition();
            }

            return null;
        } catch (error) {
            console.error("Error reading role definition:", error);
            return null;
        }
    }

    /**
     * Prepare a complete prompt with all enhancements (RAG, role definition, etc.)
     */
    async prepareFullPrompt(content: string, isNewConversation: boolean = false): Promise<string> {
        if (!this.plugin) {
            return this.formatPrompt(content, isNewConversation);
        }

        // Get role definition if available
        try {
            const roleDefinition = await this.getRoleDefinition();

            // Set the system prompt if role definition exists
            if (roleDefinition) {
                this.setSystemPrompt(roleDefinition);
            }
        } catch (error) {
            console.error("Error getting role definition:", error);
        }

        // Initialize prompt with user content
        let formattedPrompt = this.formatPrompt(content, isNewConversation);

        // Handle RAG if enabled
        if (this.plugin.settings.ragEnabled && this.plugin.ragService) {
            try {
                // Make sure documents are indexed
                if (this.plugin.ragService.findRelevantDocuments("test").length === 0) {
                    await this.plugin.ragService.indexDocuments();
                }

                // Get context based on the query
                const ragContext = this.plugin.ragService.prepareContext(content);

                // Enhance the prompt with context
                if (ragContext) {
                    formattedPrompt = this.enhanceWithRagContext(formattedPrompt, ragContext);
                }
            } catch (error) {
                console.error("Error processing RAG:", error);
            }
        }

        return formattedPrompt;
    }
}