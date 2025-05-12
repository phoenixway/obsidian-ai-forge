// OllamaService.ts

import OllamaPlugin from './main';
// Важливо: Імпортуємо типи, які визначили вище або ті, що вже є у вашому проекті
import {
  OllamaGenerateChunk, // Припустимо, це ваш тип для звичайного чанка відповіді
  OllamaErrorChunk,   // Ваш тип для помилки
  Message,            // Ваш інтерфейс Message
  OllamaEmbeddingsResponse,
  OllamaGenerateResponse,
  OllamaShowResponse,
  // Додамо типи для потоку, якщо їх ще немає:
  ToolCall,
  AssistantMessage // Тип для повідомлення асистента, що може містити tool_calls
} from './types'; // Адаптуйте шлях до ваших типів

import { PromptService } from './PromptService';
import { Chat, ChatMetadata } from './Chat'; // Припускаючи, що ChatMetadata існує
import { IToolFunction } from './agents/IAgent'; // Інтерфейс для визначення інструментів

// Визначимо типи чанків, які буде повертати наш потік
export type StreamChunk =
  | { type: 'content'; response: string; done: boolean; model: string; created_at: string; }
  | { type: 'tool_calls'; calls: ToolCall[]; assistant_message_with_calls: AssistantMessage; model: string; created_at: string; }
  | { type: 'done'; model: string; created_at: string; context?: number[]; total_duration?: number; load_duration?: number; prompt_eval_count?: number; prompt_eval_duration?: number; eval_count?: number; eval_duration?: number; }
  | { type: 'error'; error: string; done: true; };


export class OllamaService {
  private plugin: OllamaPlugin;
  private promptService: PromptService;
  private eventHandlers: Record<string, Array<(data: any) => any>> = {};

  constructor(plugin: OllamaPlugin) {
    this.plugin = plugin;
    if (!plugin.promptService) {
      const errorMsg = "[OllamaService] CRITICAL: PromptService not available on plugin instance during OllamaService construction!";
      this.plugin.logger.error(errorMsg); // Використовуємо логер плагіна
      throw new Error(errorMsg);
    }
    this.promptService = plugin.promptService;
  }

  // --- Event Emitter (залишаємо без змін) ---
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
    if (h) h.slice().forEach(handler => { try { handler(data); } catch (e) { this.plugin.logger.error(`Error in OllamaService event handler for ${event}:`, e); } });
  }
  // ------------------------------------------

  /**
  * Відправляє запит на генерацію відповіді Ollama і повертає асинхронний ітератор для отримання частин відповіді.
  * @param chat Поточний об'єкт чату.
  * @param signal AbortSignal для можливості переривання запиту.
  * @returns Асинхронний ітератор, що видає StreamChunk.
  */
  async* generateChatResponseStream(
    chat: Chat, // Залишаємо chat, оскільки PromptService потребує ChatMetadata
    signal?: AbortSignal
  ): AsyncIterableIterator<StreamChunk> {
    if (!chat) {
      this.plugin.logger.error("[OllamaService] generateChatResponseStream called with null chat object.");
      yield { type: 'error', error: "Chat object is null.", done: true };
      return;
    }
    if (!this.promptService) {
      this.plugin.logger.error("[OllamaService] PromptService is unavailable.");
      yield { type: 'error', error: "Prompt service is unavailable.", done: true };
      return;
    }

    const currentSettings = this.plugin.settings;
    const modelName = chat.metadata.modelName || currentSettings.modelName; // Модель з метаданих чату або дефолтна
    const temperature = chat.metadata.temperature ?? currentSettings.temperature; // Температура з метаданих або дефолтна

    if (!modelName) {
      this.plugin.logger.error("[OllamaService] No Ollama model selected for chat.", chat.metadata);
      yield { type: 'error', error: "No Ollama model selected.", done: true };
      return;
    }

    const url = `${this.plugin.settings.ollamaServerUrl}/api/generate`;
    const headers = { 'Content-Type': 'application/json' };

    try {
      const history = chat.getMessages(); // Отримуємо історію з об'єкта Chat
      const systemPrompt = await this.promptService.getSystemPromptForAPI(chat.metadata);
      const promptBody = await this.promptService.preparePromptBody(history, chat.metadata);

      if (promptBody === null || promptBody === undefined) {
        this.plugin.logger.error("[OllamaService] Could not generate prompt body for chat.", chat.metadata);
        yield { type: 'error', error: "Could not generate prompt body.", done: true };
        return;
      }

      const requestBody: any = {
        model: modelName,
        prompt: promptBody,
        stream: true,
        temperature: temperature,
        options: { num_ctx: currentSettings.contextWindow },
        ...(systemPrompt && { system: systemPrompt })
      };

      if (this.plugin.agentManager && this.plugin.settings.enableToolUse) {
        const agentTools: IToolFunction[] = this.plugin.agentManager.getAllToolDefinitions();
        if (agentTools && agentTools.length > 0) {
          // Перевірка, чи модель може підтримувати інструменти (дуже приблизна)
          // Краще мати список моделей, що підтримують інструменти, або перевіряти можливості моделі іншим шляхом
          const modelDetails = await this.getModelDetails(modelName);
          const seemsToSupportTools = modelDetails?.details?.family?.toLowerCase().includes("llama3") ||
                                   modelDetails?.details?.family?.toLowerCase().includes("mistral") || // Додайте інші відомі сім'ї
                                   (modelDetails?.details?.parameter_size && parseFloat(modelDetails.details.parameter_size.replace('B','')) >= 7);


          if (seemsToSupportTools) {
            requestBody.tools = agentTools.map(tool => ({ type: "function", function: tool }));
            this.plugin.logger.info(`[OllamaService] Tools provided to Ollama for model ${modelName}:`, agentTools.map(t => t.name));
            // requestBody.format = 'json'; // Розкоментуйте, якщо модель цього вимагає для tool_calls. ОБЕРЕЖНО!
          } else {
            this.plugin.logger.info(`[OllamaService] Model ${modelName} might not natively support tool calling (or check failed). Tools not explicitly sent via 'tools' parameter. Relying on prompt-based fallback if implemented.`);
            // Тут може бути логіка для додавання інструкцій для fallback-механізму в systemPrompt або promptBody,
            // якщо ви вирішите його реалізувати.
          }
        }
      }

      this.plugin.logger.debug(`[OllamaService] Sending request to ${url} for model ${modelName}. System prompt length: ${systemPrompt?.length || 0}, Body prompt length: ${promptBody.length}`);
      // this.plugin.logger.debug(`[OllamaService] Request body: ${JSON.stringify(requestBody, null, 2)}`);


      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: signal
      });

      if (!response.ok) {
        let errorText = `Ollama API error! Status: ${response.status}`;
        try {
          const errorJson = await response.json();
          errorText += `: ${errorJson?.error || response.statusText || 'No details'}`;
        } catch (e) {
          errorText += `: ${response.statusText || 'Could not parse error details'}`;
        }
        this.plugin.logger.error(`[OllamaService] API Error: ${errorText}`, requestBody);
        this.emit('connection-error', new Error(errorText));
        yield { type: 'error', error: errorText, done: true };
        return;
      }

      if (!response.body) {
        this.plugin.logger.error("[OllamaService] Response body is null.");
        yield { type: 'error', error: "Response body is null.", done: true };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (signal?.aborted) {
          this.plugin.logger.info("[OllamaService] Stream generation aborted by user signal.");
          reader.cancel("Aborted by user");
          yield { type: 'error', error: "Generation aborted by user.", done: true };
          return;
        }

        if (done) {
          this.plugin.logger.info("[OllamaService] Stream reader marked as done.");
          // Обробка залишку буфера, якщо він не порожній і є валідним JSON
          if (buffer.trim()) {
            try {
                const jsonChunk = JSON.parse(buffer.trim());
                // Це малоймовірно, але якщо останній чанк був не `done:true`
                if (jsonChunk.message && jsonChunk.message.tool_calls && jsonChunk.message.tool_calls.length > 0) {
                    yield { type: 'tool_calls', calls: jsonChunk.message.tool_calls, assistant_message_with_calls: jsonChunk.message, model: jsonChunk.model, created_at: jsonChunk.created_at };
                } else if (typeof jsonChunk.response === 'string') {
                    yield { type: 'content', response: jsonChunk.response, done: jsonChunk.done || false, model: jsonChunk.model, created_at: jsonChunk.created_at };
                } else if (jsonChunk.error) {
                     yield { type: 'error', error: jsonChunk.error, done: true };
                }
                // Якщо тут `done:true`, то це вже мало бути оброблено в циклі нижче
            } catch (e: any) {
                this.plugin.logger.warn(`[OllamaService] Failed to parse final buffer content: "${buffer.trim()}". Error: ${e.message}`);
            }
          }
          break; // Вихід з циклу, коли потік завершено
        }

        buffer += decoder.decode(value, { stream: true });
        let eolIndex;

        while ((eolIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.substring(0, eolIndex).trim();
          buffer = buffer.substring(eolIndex + 1);

          if (line === '') continue;

          try {
            const jsonChunk = JSON.parse(line);
            // this.plugin.logger.debug('[OllamaService] Raw chunk received:', JSON.stringify(jsonChunk));

            if (jsonChunk.error) {
              this.plugin.logger.error(`[OllamaService] Error chunk from Ollama: ${jsonChunk.error}`);
              yield { type: 'error', error: jsonChunk.error, done: true };
              reader.cancel("Error received from Ollama stream");
              return; // Важливо вийти, якщо Ollama повернула помилку
            }

            // Пріоритет для tool_calls
            if (jsonChunk.message && jsonChunk.message.tool_calls && jsonChunk.message.tool_calls.length > 0) {
              this.plugin.logger.info('[OllamaService] Yielding tool_calls chunk:', jsonChunk.message.tool_calls);
              yield {
                type: 'tool_calls',
                calls: jsonChunk.message.tool_calls,
                assistant_message_with_calls: jsonChunk.message as AssistantMessage,
                model: jsonChunk.model,
                created_at: jsonChunk.created_at
              };
              // Після tool_calls модель зазвичай чекає на відповідь, тому done може бути false.
              // Якщо done тут true, це означає, що модель не чекає і завершує хід.
              if (jsonChunk.done === true) {
                this.plugin.logger.info('[OllamaService] Stream finished (done:true received with tool_calls chunk).');
                yield {
                    type: 'done',
                    model: jsonChunk.model,
                    created_at: jsonChunk.created_at,
                    context: jsonChunk.context, // та інші метрики, якщо є
                    total_duration: jsonChunk.total_duration,
                    load_duration: jsonChunk.load_duration,
                    prompt_eval_count: jsonChunk.prompt_eval_count,
                    prompt_eval_duration: jsonChunk.prompt_eval_duration,
                    eval_count: jsonChunk.eval_count,
                    eval_duration: jsonChunk.eval_duration
                };
                return;
              }
            } else if (typeof jsonChunk.response === 'string') { // Текстовий контент
              // this.plugin.logger.debug('[OllamaService] Yielding content chunk.');
              yield {
                type: 'content',
                response: jsonChunk.response,
                done: jsonChunk.done || false, // done може бути true тут, якщо це останній текстовий чанк
                model: jsonChunk.model,
                created_at: jsonChunk.created_at
              };
              if (jsonChunk.done === true) { // Якщо це останній текстовий чанк і done=true
                this.plugin.logger.info('[OllamaService] Stream finished (done:true received with content chunk).');
                 // Не відправляємо окремий 'done' чанк, бо інформація вже в цьому.
                 // Однак, фінальний 'done' чанк від Ollama зазвичай містить більше метрик.
                 // Якщо це не фінальний чанк з метриками, тоді очікуємо його.
                 // Якщо `jsonChunk` вже містить всі метрики, то можна повернути його як `done`
                 // Але зазвичай є окремий фінальний чанк лише з `done:true` та метриками.
              }
            } else if (jsonChunk.done === true) { // Фінальний чанк "done" з метриками
              this.plugin.logger.info('[OllamaService] Stream finished (final done:true chunk with metrics).');
              yield {
                type: 'done',
                model: jsonChunk.model,
                created_at: jsonChunk.created_at,
                context: jsonChunk.context,
                total_duration: jsonChunk.total_duration,
                load_duration: jsonChunk.load_duration,
                prompt_eval_count: jsonChunk.prompt_eval_count,
                prompt_eval_duration: jsonChunk.prompt_eval_duration,
                eval_count: jsonChunk.eval_count,
                eval_duration: jsonChunk.eval_duration
              };
              return; // Завершуємо генератор
            } else if (jsonChunk.message && (jsonChunk.message.content === null || jsonChunk.message.content === "") && !jsonChunk.message.tool_calls) {
                // Це може бути порожнє повідомлення асистента (напр., перед tool_calls або при завершенні)
                // Якщо done false, ігноруємо його, чекаємо на корисні дані або done:true.
                // this.plugin.logger.debug('[OllamaService] Received empty assistant message shell, ignoring.');
            }
            // else {
            //   this.plugin.logger.warn('[OllamaService] Unhandled or unexpected chunk structure:', jsonChunk);
            // }
          } catch (e: any) {
            this.plugin.logger.warn(`[OllamaService] Failed to parse JSON chunk: "${line}". Error: ${e.message}. Skipping chunk.`);
            // Не кидаємо помилку, щоб не перервати весь потік через один пошкоджений чанк,
            // але логуємо її.
          }
        } // кінець while ((eolIndex = buffer.indexOf('\n')) >= 0)
      } // кінець while (true)

    } catch (error: any) {
      if (error.name === 'AbortError') {
        this.plugin.logger.info("[OllamaService] Stream generation aborted by user (caught AbortError).");
        yield { type: 'error', error: "Generation aborted by user.", done: true };
      } else {
        let errorMessage = error instanceof Error ? error.message : "Unknown error generating stream.";
        if (errorMessage.includes("connect") || errorMessage.includes("fetch") || errorMessage.includes("NetworkError") || errorMessage.includes('Failed to fetch')) {
          errorMessage = `Connection Error: Failed to reach Ollama at ${this.plugin.settings.ollamaServerUrl}. Is it running?`;
          this.emit('connection-error', new Error(errorMessage));
        }
        this.plugin.logger.error(`[OllamaService] Error during stream generation: ${errorMessage}`, error);
        yield { type: 'error', error: errorMessage, done: true };
      }
    } finally {
        this.plugin.logger.info("[OllamaService] generateChatResponseStream finished or terminated.");
    }
  }

  // ... (інші ваші методи: generateRaw, generateEmbeddings, getModels, getModelDetails) ...
  // Переконайтеся, що вони адаптовані для використання this.plugin.logger замість console.error/log
  // і this.emit('connection-error', ...) для помилок з'єднання.

  async generateRaw(requestBody: any): Promise<OllamaGenerateResponse> {
    if (!requestBody.model || !requestBody.prompt) {
      this.plugin.logger.error("[OllamaService] generateRaw called without 'model' or 'prompt'.");
      throw new Error("generateRaw requires 'model' and 'prompt' in requestBody");
    }
    requestBody.stream = false;
    if (!requestBody.system) {
      delete requestBody.system;
    }

    const url = `${this.plugin.settings.ollamaServerUrl}/api/generate`;
    const headers = { 'Content-Type': 'application/json' };
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        let errorText = `Ollama API error (generateRaw)! Status: ${response.status}`;
        try {
          const errorJson = await response.json();
          errorText += `: ${errorJson?.error || response.statusText || 'No details'}`;
        } catch (e) { errorText += `: ${response.statusText || 'Could not parse error details'}`; }
        this.plugin.logger.error(`[OllamaService] API Error (generateRaw): ${errorText}`, requestBody);
        this.emit('connection-error', new Error(errorText));
        throw new Error(errorText);
      }
      if (!response.body) {
        this.plugin.logger.error("[OllamaService] Response body is null (generateRaw).");
        throw new Error("Response body is null (generateRaw)");
      }
      return await response.json() as OllamaGenerateResponse;
    } catch (error: any) {
      const connectionErrorMsg = `Failed to connect/communicate with Ollama server at ${this.plugin.settings.ollamaServerUrl}. Is it running? (Endpoint: /api/generate, non-streamed)`;
      if (!error.message?.includes('Ollama API error')) {
        this.plugin.logger.error(`[OllamaService] Connection/Fetch Error (generateRaw): ${connectionErrorMsg}`, error);
        this.emit('connection-error', new Error(connectionErrorMsg));
      }
      throw new Error(error.message || connectionErrorMsg);
    }
  }

  async generateEmbeddings(prompts: string[], model: string): Promise<number[][] | null> {
    if (!prompts || prompts.length === 0) return [];
    const endpoint = '/api/embeddings';
    const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };
    const embeddingsList: number[][] = [];

    try {
      for (const prompt of prompts) {
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) continue;

        const requestBody = JSON.stringify({ model: model, prompt: trimmedPrompt });
        try {
          const response = await fetch(url, { method: 'POST', headers, body: requestBody });
          if (!response.ok) {
            let errorText = `Ollama Embeddings API error! Status: ${response.status}`;
            try { const errJson = await response.json(); errorText += `: ${errJson?.error || 'Details unavailable'}`; } catch {}
            this.plugin.logger.warn(`[OllamaService] Embeddings API Error for prompt "${trimmedPrompt.substring(0,30)}...": ${errorText}`);
            // Продовжуємо з іншими промптами
            continue;
          }
          const embeddingResponse = await response.json() as OllamaEmbeddingsResponse;
          if (embeddingResponse && embeddingResponse.embedding) {
            embeddingsList.push(embeddingResponse.embedding);
          } else {
             this.plugin.logger.warn(`[OllamaService] Valid response but no embedding found for prompt "${trimmedPrompt.substring(0,30)}..."`);
          }
        } catch (singleError: any) {
          this.plugin.logger.error(`[OllamaService] Error generating embedding for prompt "${trimmedPrompt.substring(0,30)}...": ${singleError.message}`, singleError);
          this.emit('connection-error', new Error(singleError.message || 'Embedding generation failed for a prompt'));
          // Продовжуємо
        }
      }
      return embeddingsList.length > 0 ? embeddingsList : null;
    } catch (error: any) {
      // Ця зовнішня помилка малоймовірна, якщо внутрішні обробляються
      this.plugin.logger.error(`[OllamaService] Outer error in generateEmbeddings: ${error.message}`, error);
      return null;
    }
  }

  async getModels(forceRefresh: boolean = false): Promise<string[]> {
    // `forceRefresh` тут не використовується, оскільки ми не кешуємо список моделей в цьому сервісі.
    // Якщо кешування буде додано, тоді `forceRefresh` стане актуальним.
    const endpoint = '/api/tags';
    const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
    let modelListResult: string[] = [];

    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        let errorText = `Ollama Tags API error! Status: ${response.status}`;
        try { const errJson = await response.json(); errorText += `: ${errJson?.error || 'Details unavailable'}`; } catch {}
        this.plugin.logger.error(`[OllamaService] Tags API Error: ${errorText}`);
        this.emit('connection-error', new Error(errorText));
        // Повертаємо порожній масив у випадку помилки API, щоб UI не "завис"
        return [];
      }
      const data = await response.json() as { models: Array<{name: string, modified_at: string, size: number, digest: string, details: object}> }; // Додав більше полів для типу
      if (data && Array.isArray(data.models)) {
        modelListResult = data.models
          .map((m) => m?.name)
          .filter((name): name is string => typeof name === 'string' && name.length > 0)
          .sort();
      } else {
        this.plugin.logger.warn("[OllamaService] Received unexpected data format from /api/tags", data);
      }
    } catch (e: any) {
      const connectionErrorMsg = `Failed to connect or fetch models from Ollama server at ${this.plugin.settings.ollamaServerUrl}. (Endpoint: /api/tags)`;
      if (!e.message?.includes('API error')) { // Avoid duplicate emits
        this.plugin.logger.error(`[OllamaService] Connection/Fetch Error (getModels): ${connectionErrorMsg}`, e);
        this.emit('connection-error', new Error(e.message || connectionErrorMsg));
      }
      // Повертаємо порожній масив, щоб UI міг це обробити
      return [];
    }
    return modelListResult;
  }


  async getModelDetails(modelName: string): Promise<OllamaShowResponse | null> {
    const endpoint = '/api/show';
    const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };
    try {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ name: modelName }) });
      if (!response.ok) {
        let errorText = `Ollama Show API error for model ${modelName}! Status: ${response.status}`;
        try { const errJson = await response.json(); errorText += `: ${errJson?.error || 'Details unavailable'}`; } catch {}
        this.plugin.logger.error(`[OllamaService] Show API Error: ${errorText}`);
        if (response.status !== 404) { // Не емітуємо помилку з'єднання, якщо це просто "модель не знайдено"
            this.emit('connection-error', new Error(errorText));
        }
        return null; // Повертаємо null, якщо модель не знайдено або інша помилка
      }
      const data = await response.json() as OllamaShowResponse;
      return data;
    } catch (e: any) {
      const connectionErrorMsg = `Failed to connect or get details for model ${modelName} from Ollama server at ${this.plugin.settings.ollamaServerUrl}. (Endpoint: /api/show)`;
      if (!e.message?.includes('API error')) {
        this.plugin.logger.error(`[OllamaService] Connection/Fetch Error (getModelDetails): ${connectionErrorMsg}`, e);
        this.emit('connection-error', new Error(e.message || connectionErrorMsg));
      }
      return null;
    }
  }

} // --- End of OllamaService class ---