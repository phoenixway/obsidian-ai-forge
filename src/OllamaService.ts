import OllamaPlugin from "./main";

import {
  OllamaEmbeddingsResponse,
  OllamaGenerateResponse,
  OllamaShowResponse,
  ToolCall,
  AssistantMessage,
} from "./types";

import { PromptService } from "./PromptService";
import { Chat } from "./Chat";
import { IToolFunction } from "./agents/IAgent";
import { Logger } from "./Logger";

export type StreamChunk =
  | { type: "content"; response: string; done: boolean; model: string; created_at: string }
  | {
      type: "tool_calls";
      calls: ToolCall[];
      assistant_message_with_calls: AssistantMessage;
      model: string;
      created_at: string;
    }
  | {
      type: "done";
      model: string;
      created_at: string;
      context?: number[];
      total_duration?: number;
      load_duration?: number;
      prompt_eval_count?: number;
      prompt_eval_duration?: number;
      eval_count?: number;
      eval_duration?: number;
    }
  | { type: "error"; error: string; done: true };

export class OllamaService {
  private plugin: OllamaPlugin;
  private promptService: PromptService;
  private eventHandlers: Record<string, Array<(data: any) => any>> = {};
  logger: Logger;

  constructor(plugin: OllamaPlugin) {
    this.plugin = plugin;
    if (!plugin.promptService) {
      const errorMsg =
        "[OllamaService] CRITICAL: PromptService not available on plugin instance during OllamaService construction!";
      throw new Error(errorMsg);
    }
    this.promptService = plugin.promptService;
    this.logger = plugin.logger;
  }

  on(event: string, callback: (data: any) => any): () => void {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(callback);
    return () => {
      this.eventHandlers[event] = this.eventHandlers[event]?.filter(h => h !== callback);
      if (this.eventHandlers[event]?.length === 0) delete this.eventHandlers[event];
    };
  }

  emit(event: string, data?: any): void {
    const h = this.eventHandlers[event];
    if (h)
      h.slice().forEach(handler => {
        try {
          handler(data);
        } catch (e) {}
      });
  }

  /**
   * Відправляє запит на генерацію відповіді Ollama і повертає асинхронний ітератор для отримання частин відповіді.
   * @param chat Поточний об'єкт чату.
   * @param signal AbortSignal для можливості переривання запиту.
   * @returns Асинхронний ітератор, що видає StreamChunk.
   */
  async *generateChatResponseStream(chat: Chat, signal?: AbortSignal): AsyncIterableIterator<StreamChunk> {
    const requestTimestampId = Date.now();
    if (!chat) {
      yield { type: "error", error: "Chat object is null.", done: true };
      return;
    }
    if (!this.promptService) {
      yield { type: "error", error: "Prompt service is unavailable.", done: true };
      return;
    }

    const currentSettings = this.plugin.settings;
    const modelName = chat.metadata.modelName || currentSettings.modelName;
    const temperature = chat.metadata.temperature ?? currentSettings.temperature;

    if (!modelName) {
      yield { type: "error", error: "No Ollama model selected.", done: true };
      return;
    }

    const url = `${this.plugin.settings.ollamaServerUrl}/api/generate`;
    const headers = { "Content-Type": "application/json" };

    try {
      const history = chat.getMessages();
      const systemPrompt = await this.promptService.getSystemPromptForAPI(chat.metadata);
      const promptBody = await this.promptService.preparePromptBody(history, chat.metadata);

      if (promptBody === null || promptBody === undefined) {
        yield { type: "error", error: "Could not generate prompt body.", done: true };
        return;
      }

      const requestBody: any = {
        model: modelName,
        prompt: promptBody,
        stream: true,
        temperature: temperature,
        options: { num_ctx: currentSettings.contextWindow },
        ...(systemPrompt && { system: systemPrompt }),
      };

      if (this.plugin.agentManager && this.plugin.settings.enableToolUse) {
        const agentTools: IToolFunction[] = this.plugin.agentManager.getAllToolDefinitions();
        if (agentTools && agentTools.length > 0) {
          const modelDetails = await this.getModelDetails(modelName);
          const seemsToSupportTools =
            modelDetails?.details?.family?.toLowerCase().includes("llama3") ||
            modelDetails?.details?.family?.toLowerCase().includes("mistral") ||
            (modelDetails?.details?.parameter_size &&
              parseFloat(modelDetails.details.parameter_size.replace("B", "")) >= 7);

          if (seemsToSupportTools) {
            requestBody.tools = agentTools.map(tool => ({ type: "function", function: tool }));
          } else {
          }
        }
      }

      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: signal,
      });

      if (!response.ok) {
        let errorText = `Ollama API error! Status: ${response.status}`;
        try {
          const errorJson = await response.json();
          errorText += `: ${errorJson?.error || response.statusText || "No details"}`;
        } catch (e) {
          errorText += `: ${response.statusText || "Could not parse error details"}`;
        }
        this.emit("connection-error", new Error(errorText));
        yield { type: "error", error: errorText, done: true };
        return;
      }

      if (!response.body) {
        yield { type: "error", error: "Response body is null.", done: true };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let rawResponseAccumulator = "";
      while (true) {
        const { done, value } = await reader.read();

        if (signal?.aborted) {
          reader.cancel("Aborted by user");
          yield { type: "error", error: "Generation aborted by user.", done: true };
          return;
        }
        const decodedChunk = decoder.decode(value, { stream: !done });

        rawResponseAccumulator += decodedChunk;

        if (done) {
          buffer += decodedChunk;

          if (buffer.trim()) {
            try {
              const jsonChunk = JSON.parse(buffer.trim());

              if (jsonChunk.message && jsonChunk.message.tool_calls && jsonChunk.message.tool_calls.length > 0) {
                yield {
                  type: "tool_calls",
                  calls: jsonChunk.message.tool_calls,
                  assistant_message_with_calls: jsonChunk.message,
                  model: jsonChunk.model,
                  created_at: jsonChunk.created_at,
                };
              } else if (typeof jsonChunk.response === "string") {
                yield {
                  type: "content",
                  response: jsonChunk.response,
                  done: jsonChunk.done || false,
                  model: jsonChunk.model,
                  created_at: jsonChunk.created_at,
                };
              } else if (jsonChunk.error) {
                yield { type: "error", error: jsonChunk.error, done: true };
              }
            } catch (e: any) {}
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let eolIndex;

        while ((eolIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.substring(0, eolIndex).trim();
          buffer = buffer.substring(eolIndex + 1);

          if (line === "") continue;

          try {
            const jsonChunk = JSON.parse(line);

            if (jsonChunk.error) {
              yield { type: "error", error: jsonChunk.error, done: true };
              reader.cancel("Error received from Ollama stream");
              return;
            }

            if (jsonChunk.message && jsonChunk.message.tool_calls && jsonChunk.message.tool_calls.length > 0) {
              yield {
                type: "tool_calls",
                calls: jsonChunk.message.tool_calls,
                assistant_message_with_calls: jsonChunk.message as AssistantMessage,
                model: jsonChunk.model,
                created_at: jsonChunk.created_at,
              };

              if (jsonChunk.done === true) {
                yield {
                  type: "done",
                  model: jsonChunk.model,
                  created_at: jsonChunk.created_at,
                  context: jsonChunk.context,
                  total_duration: jsonChunk.total_duration,
                  load_duration: jsonChunk.load_duration,
                  prompt_eval_count: jsonChunk.prompt_eval_count,
                  prompt_eval_duration: jsonChunk.prompt_eval_duration,
                  eval_count: jsonChunk.eval_count,
                  eval_duration: jsonChunk.eval_duration,
                };

                return;
              }
            } else if (typeof jsonChunk.response === "string") {
              yield {
                type: "content",
                response: jsonChunk.response,
                done: jsonChunk.done || false,
                model: jsonChunk.model,
                created_at: jsonChunk.created_at,
              };
              if (jsonChunk.done === true) {
              }
            } else if (jsonChunk.done === true) {
              yield {
                type: "done",
                model: jsonChunk.model,
                created_at: jsonChunk.created_at,
                context: jsonChunk.context,
                total_duration: jsonChunk.total_duration,
                load_duration: jsonChunk.load_duration,
                prompt_eval_count: jsonChunk.prompt_eval_count,
                prompt_eval_duration: jsonChunk.prompt_eval_duration,
                eval_count: jsonChunk.eval_count,
                eval_duration: jsonChunk.eval_duration,
              };
              return;
            } else if (
              jsonChunk.message &&
              (jsonChunk.message.content === null || jsonChunk.message.content === "") &&
              !jsonChunk.message.tool_calls
            ) {
            }
          } catch (e: any) {}
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        yield { type: "error", error: "Generation aborted by user.", done: true };
      } else {
        let errorMessage = error instanceof Error ? error.message : "Unknown error generating stream.";
        if (
          errorMessage.includes("connect") ||
          errorMessage.includes("fetch") ||
          errorMessage.includes("NetworkError") ||
          errorMessage.includes("Failed to fetch")
        ) {
          errorMessage = `Connection Error: Failed to reach Ollama at ${this.plugin.settings.ollamaServerUrl}. Is it running?`;
          this.emit("connection-error", new Error(errorMessage));
        }
        yield { type: "error", error: errorMessage, done: true };
      }
    } finally {
    }
  }

  async generateRaw(requestBody: any): Promise<OllamaGenerateResponse> {
    if (!requestBody.model || !requestBody.prompt) {
      throw new Error("generateRaw requires 'model' and 'prompt' in requestBody");
    }
    requestBody.stream = false;
    if (!requestBody.system) {
      delete requestBody.system;
    }

    const url = `${this.plugin.settings.ollamaServerUrl}/api/generate`;
    const headers = { "Content-Type": "application/json" };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorText = `Ollama API error (generateRaw)! Status: ${response.status}`;
        try {
          const errorJson = await response.json();
          errorText += `: ${errorJson?.error || response.statusText || "No details"}`;
        } catch (e) {
          errorText += `: ${response.statusText || "Could not parse error details"}`;
        }
        this.emit("connection-error", new Error(errorText));
        throw new Error(errorText);
      }
      if (!response.body) {
        throw new Error("Response body is null (generateRaw)");
      }
      return (await response.json()) as OllamaGenerateResponse;
    } catch (error: any) {
      const connectionErrorMsg = `Failed to connect/communicate with Ollama server at ${this.plugin.settings.ollamaServerUrl}. Is it running? (Endpoint: /api/generate, non-streamed)`;
      if (!error.message?.includes("Ollama API error")) {
        this.emit("connection-error", new Error(connectionErrorMsg));
      }
      throw new Error(error.message || connectionErrorMsg);
    }
  }

  async generateEmbeddings(prompts: string[], model: string): Promise<number[][] | null> {
    if (!prompts || prompts.length === 0) return [];
    const endpoint = "/api/embeddings";
    const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
    const headers = { "Content-Type": "application/json" };
    const embeddingsList: number[][] = [];

    try {
      for (const prompt of prompts) {
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) continue;

        const requestBody = JSON.stringify({ model: model, prompt: trimmedPrompt });
        try {
          const response = await fetch(url, { method: "POST", headers, body: requestBody });
          if (!response.ok) {
            let errorText = `Ollama Embeddings API error! Status: ${response.status}`;
            try {
              const errJson = await response.json();
              errorText += `: ${errJson?.error || "Details unavailable"}`;
            } catch {}

            continue;
          }
          const embeddingResponse = (await response.json()) as OllamaEmbeddingsResponse;
          if (embeddingResponse && embeddingResponse.embedding) {
            embeddingsList.push(embeddingResponse.embedding);
          } else {
          }
        } catch (singleError: any) {
          this.emit("connection-error", new Error(singleError.message || "Embedding generation failed for a prompt"));
        }
      }
      return embeddingsList.length > 0 ? embeddingsList : null;
    } catch (error: any) {
      return null;
    }
  }

  async getModels(forceRefresh: boolean = false): Promise<string[]> {
    const endpoint = "/api/tags";
    const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
    let modelListResult: string[] = [];

    try {
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) {
        let errorText = `Ollama Tags API error! Status: ${response.status}`;
        try {
          const errJson = await response.json();
          errorText += `: ${errJson?.error || "Details unavailable"}`;
        } catch {}
        this.emit("connection-error", new Error(errorText));

        return [];
      }
      const data = (await response.json()) as {
        models: Array<{ name: string; modified_at: string; size: number; digest: string; details: object }>;
      };
      if (data && Array.isArray(data.models)) {
        modelListResult = data.models
          .map(m => m?.name)
          .filter((name): name is string => typeof name === "string" && name.length > 0)
          .sort();
      } else {
      }
    } catch (e: any) {
      const connectionErrorMsg = `Failed to connect or fetch models from Ollama server at ${this.plugin.settings.ollamaServerUrl}. (Endpoint: /api/tags)`;
      if (!e.message?.includes("API error")) {
        this.emit("connection-error", new Error(e.message || connectionErrorMsg));
      }

      return [];
    }
    return modelListResult;
  }

  async getModelDetails(modelName: string): Promise<OllamaShowResponse | null> {
    const endpoint = "/api/show";
    const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
    const headers = { "Content-Type": "application/json" };
    try {
      const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ name: modelName }) });
      if (!response.ok) {
        let errorText = `Ollama Show API error for model ${modelName}! Status: ${response.status}`;
        try {
          const errJson = await response.json();
          errorText += `: ${errJson?.error || "Details unavailable"}`;
        } catch {}
        if (response.status !== 404) {
          this.emit("connection-error", new Error(errorText));
        }
        return null;
      }
      const data = (await response.json()) as OllamaShowResponse;
      return data;
    } catch (e: any) {
      const connectionErrorMsg = `Failed to connect or get details for model ${modelName} from Ollama server at ${this.plugin.settings.ollamaServerUrl}. (Endpoint: /api/show)`;
      if (!e.message?.includes("API error")) {
        this.emit("connection-error", new Error(e.message || connectionErrorMsg));
      }
      return null;
    }
  }
}
