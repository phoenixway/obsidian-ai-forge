import { StateManager, AssistantState } from './stateManager';

export class ApiService {
  private baseUrl: string;
  private systemPrompt: string | null = null;
  private stateManager: StateManager;

  setSystemPrompt(prompt: string | null): void {
    this.systemPrompt = prompt;
  }

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.stateManager = StateManager.getInstance();
    // Пытаемся загрузить сохраненное состояние
    this.stateManager.loadStateFromStorage();
  }

  /**
   * Set base URL for the API
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * Generate response from Ollama
   */
  async generateResponse(
    modelName: string,
    prompt: string,
    isNewConversation: boolean = false
  ): Promise<OllamaResponse> {
    // Обрабатываем сообщение пользователя и обновляем состояние
    this.stateManager.processUserMessage(prompt);

    // Получаем актуальное состояние для включения в запрос
    const stateHeader = this.stateManager.getStateFormatted();

    // Создаем запрос с включением системного промпта и текущего состояния
    let enhancedPrompt = prompt;

    // Если это не новый разговор, включаем информацию о состоянии в промпт
    if (!isNewConversation) {
      enhancedPrompt = `${stateHeader}\n\n${prompt}`;
    }

    // Создаем тело запроса
    const requestBody: any = {
      model: modelName,
      prompt: enhancedPrompt,
      stream: false,
      temperature: 0.2,
    };

    // Включаем системный промпт в каждый запрос
    if (this.systemPrompt) {
      requestBody.system = this.systemPrompt;
    }

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

    // После получения ответа от модели, сохраняем состояние
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
      hasUrgentTasks: "unknown", // This will now match the expected type
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