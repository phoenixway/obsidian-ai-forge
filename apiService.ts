/**
 * API Service for Ollama
 * Uses browser's native fetch API instead of node-fetch
 */
export class ApiService {
    private baseUrl: string;
  
    constructor(baseUrl: string) {
      this.baseUrl = baseUrl;
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
    async generateResponse(model: string, prompt: string): Promise<OllamaResponse> {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          stream: false,
        }),
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! Status: ${response.status}, ${errorText}`);
      }
  
      return await response.json();
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