import { StateManager, AssistantState } from './stateManager';
import { PromptService } from './promptService';

export class ApiService {
  private baseUrl: string;
  private stateManager: StateManager;
  private promptService: PromptService;

  constructor(baseUrl: string, plugin?: any) {
    this.baseUrl = baseUrl;
    this.stateManager = StateManager.getInstance();
    this.promptService = new PromptService(plugin);
    // Try to load saved state
    this.stateManager.loadStateFromStorage();
  }

  /**
   * Get the prompt service instance
   */
  getPromptService(): PromptService {
    return this.promptService;
  }

  /**
   * Set system prompt to be used with each request
   */
  setSystemPrompt(prompt: string | null): void {
    this.promptService.setSystemPrompt(prompt);
  }

  /**
   * Set base URL for the API
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * Set plugin reference for prompt service
   */
  setPlugin(plugin: any): void {
    this.promptService.setPlugin(plugin);
  }

  /**
   * Generate response from Ollama
   */
  async generateResponse(
    modelName: string,
    prompt: string,
    isNewConversation: boolean = false
  ): Promise<OllamaResponse> {
    // Let the prompt service prepare the full prompt with all enhancements
    const formattedPrompt = await this.promptService.prepareFullPrompt(prompt, isNewConversation);

    // Prepare the request body
    const requestBody = this.promptService.prepareRequestBody(modelName, formattedPrompt);

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! Status: ${response.status}, ${errorText}`);
    }

    const data = await response.json();

    // Process the model response if needed
    data.response = this.promptService.processModelResponse(data.response);

    // Save state after processing
    this.stateManager.saveStateToStorage();

    return data;
  }

  /**
   * Get available models from Ollama
   */
  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      if (Array.isArray(data.models)) {
        return data.models.map((model: any) =>
          typeof model === 'object' ? model.name : model
        );
      }
      return [];
    } catch (error) {
      console.error("Error fetching models:", error);
      return [];
    }
  }

  /**
   * Reset assistant state to initial values
   */
  resetState(): void {
    const initialState: Partial<AssistantState> = {
      currentPhase: "next goal choosing",
      currentGoal: "Identify if there are any urgent tasks",
      userActivity: "talking with AI",
      hasUrgentTasks: "unknown",
      urgentTasksList: [],
      currentUrgentTask: null,
      planExists: "unknown"
    };
    this.stateManager.updateState(initialState);
    this.stateManager.saveStateToStorage();
  }
}

/**
 * Interface for Ollama Response
 */
export interface OllamaResponse {
  model: string;
  response: string;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}