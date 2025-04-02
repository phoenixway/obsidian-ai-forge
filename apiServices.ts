// import { StateManager, AssistantState } from './stateManager'; // Ймовірно, не потрібен
import { PromptService } from './promptService';
import OllamaPlugin from './main'; // Потрібен тип плагіна
import { OllamaView } from './ollamaView'; // Потрібен тип View

// Інтерфейс для відповіді Ollama (можна винести в types.ts)
export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}


// Інтерфейс для відповіді Ollama /api/generate
export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// Інтерфейс для відповіді Ollama /api/show (ОНОВЛЕНО)
export interface OllamaShowResponse {
  license?: string;
  modelfile?: string;
  parameters?: string; // Рядок з параметрами
  template?: string;
  details?: { // Вкладений об'єкт details
    format?: string;
    family?: string;
    families?: string[] | null;
    parameter_size?: string;
    quantization_level?: string;
    // --- ДОДАНО ІНДЕКСНИЙ ПІДПИС ---
    // Дозволяє details містити будь-які інші рядкові ключі
    [key: string]: any;
    // ----------------------------------
  };
  // Дозволяє інші поля на верхньому рівні
  [key: string]: any;
}


export class ApiService {
  private baseUrl: string;
  // private stateManager: StateManager; // Ймовірно, не потрібен
  // promptService не потрібен напряму, якщо MessageService керує ним
  // private promptService: PromptService;
  private ollamaView: OllamaView | null = null; // Використовуємо конкретний тип
  private eventHandlers: Record<string, Array<(data: any) => any>> = {};
  private plugin: OllamaPlugin; // Додаємо посилання на плагін

  constructor(plugin: OllamaPlugin) { // Отримуємо плагін для доступу до налаштувань
    this.plugin = plugin;
    this.baseUrl = plugin.settings.ollamaServerUrl; // Ініціалізуємо baseUrl
    // this.stateManager = StateManager.getInstance();
    // this.promptService = new PromptService(plugin);
    // this.stateManager.loadStateFromStorage();
  }

  on(event: string, callback: (data: any) => any): () => void {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(callback);
    return () => {
      this.eventHandlers[event] = this.eventHandlers[event].filter(
        handler => handler !== callback
      );
    };
  }

  emit(event: string, data?: any): void {
    const handlers = this.eventHandlers[event];
    if (handlers) {
      // Використовуємо slice для безпечної ітерації, якщо обробник видаляє себе
      handlers.slice().forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.error(`Error in API Service event handler for ${event}:`, e);
        }
      });
    }
  }

  // getPromptService(): PromptService { // Ймовірно, не потрібно
  //   return this.promptService;
  // }

  setOllamaView(view: OllamaView): void {
    this.ollamaView = view;
  }

  // setSystemPrompt(prompt: string | null): void { // Керується через PromptService
  //   this.promptService.setSystemPrompt(prompt);
  // }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  // setPlugin(plugin: any): void { // Встановлюється в конструкторі
  //   this.promptService.setPlugin(plugin);
  // }

  /**
   * Генерує відповідь від Ollama.
   * requestBody тепер містить model, prompt, system, options, stream, temperature.
   */
  async generateResponse(requestBody: any): Promise<OllamaResponse> { // Повертає стандартизований тип
    const apiUrl = `${this.baseUrl}/api/generate`;
    console.log("Sending request to Ollama:", apiUrl, JSON.stringify({ ...requestBody, prompt: requestBody.prompt.substring(0, 100) + "..." })); // Логуємо скорочений промпт

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorText = `HTTP error! Status: ${response.status}`;
        try {
          // Спробуємо прочитати тіло помилки як текст
          const bodyText = await response.text();
          // Спробуємо розпарсити JSON, якщо можливо
          try {
            const errorJson = JSON.parse(bodyText);
            errorText += `: ${errorJson.error || bodyText}`;
          } catch (jsonError) {
            errorText += `: ${bodyText}`; // Якщо не JSON, додаємо як текст
          }

          // Перевіряємо специфічні помилки
          if (bodyText.includes("model not found")) {
            errorText = `Model '${requestBody.model}' not found on the Ollama server.`;
            this.emit('error', new Error(errorText)); // Емітуємо для можливої обробки
          }

        } catch (bodyError) {
          console.error("Could not read error response body:", bodyError);
        }
        console.error("Ollama API Error:", errorText);
        throw new Error(errorText); // Кидаємо помилку далі
      }

      const data: OllamaResponse = await response.json();
      console.log("Received response from Ollama:", { ...data, response: data.response.substring(0, 100) + "..." });

      // Обробка відповіді (напр. HTML entities) тепер може бути в MessageService або View
      // data.response = this.promptService.processModelResponse(data.response);

      // StateManager, ймовірно, не потрібен тут
      // this.stateManager.saveStateToStorage();

      return data; // Повертаємо повну відповідь

    } catch (error: any) {
      // Ловимо помилки fetch (напр., мережеві)
      console.error(`Workspace error calling Ollama API (${apiUrl}):`, error);
      let connectionErrorMsg = `Failed to connect to Ollama server at ${this.baseUrl}. Is it running?`;
      if (error.message.includes('fetch')) { // Додаткова перевірка
        connectionErrorMsg += ` (Fetch error: ${error.message})`;
      }
      this.emit('connection-error', new Error(connectionErrorMsg)); // Емітуємо подію помилки з'єднання
      throw new Error(connectionErrorMsg); // Кидаємо помилку далі для обробки в MessageService
    }
  }

  /**
   * Отримує список доступних моделей з Ollama.
   */
  async getModels(): Promise<string[]> {
    const apiUrl = `${this.baseUrl}/api/tags`;
    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP error fetching models! Status: ${response.status}`, errorText);
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      if (Array.isArray(data.models)) {
        // Сортуємо моделі для зручності
        return data.models
          .map((model: any) => typeof model === 'object' ? model.name : model)
          .sort();
      }
      return [];
    } catch (error: any) {
      console.error(`Error fetching models from ${apiUrl}:`, error);
      // Емітуємо помилку з'єднання, якщо це схоже на неї
      if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
        this.emit('connection-error', new Error(`Failed to fetch models from ${this.baseUrl}. Is it running?`));
      }
      // Не кидаємо помилку далі, просто повертаємо порожній масив, щоб UI налаштувань не ламався
      return [];
    }
  }

  async getModelDetails(modelName: string): Promise<OllamaShowResponse | null> {
    const apiUrl = `${this.baseUrl}/api/show`;
    console.log(`[ApiService] Fetching details for model: ${modelName} from ${apiUrl}`);
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[ApiService] Failed to get details for model ${modelName}. Status: ${response.status}`, errorText);
        // Don't throw an error, just return null, as this is optional info
        return null;
      }

      const data: OllamaShowResponse = await response.json();
      console.log(`[ApiService] Received details for model ${modelName}:`, data);
      return data;

    } catch (error: any) {
      console.error(`[ApiService] Fetch error getting model details for ${modelName}:`, error);
      // Emit connection error only if it looks like a network issue
      if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
        this.emit('connection-error', new Error(`Failed to get model details from ${this.baseUrl}. Is it running?`));
      }
      return null; // Return null on any error
    }
  }



}