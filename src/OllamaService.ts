// OllamaService.ts
import OllamaPlugin from './main';
// Важливо: Імпортуємо типи, які визначили вище
import { OllamaGenerateChunk, OllamaErrorChunk, OllamaStreamChunk, Message, OllamaEmbeddingsResponse, OllamaGenerateResponse, OllamaShowResponse } from './types';
import { PromptService } from './PromptService';
import { Notice } from 'obsidian';
import { Chat } from './Chat';

export class OllamaService {
    private plugin: OllamaPlugin;
    private promptService: PromptService;
    private eventHandlers: Record<string, Array<(data: any) => any>> = {};

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        if (!plugin.promptService) {
            const errorMsg = "[OllamaService] CRITICAL: PromptService not available on plugin instance during OllamaService construction!";
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
        if (h) h.slice().forEach(handler => { try { handler(data); } catch (e) { console.error(`Error in OllamaService event handler for ${event}:`, e); } });
    }
    // ------------------------------------------

    setBaseUrl(url: string): void {
        // Можливо, цей метод більше не потрібен, якщо URL береться з налаштувань
    }

    /**
     * Відправляє запит на генерацію відповіді Ollama і повертає асинхронний ітератор для отримання частин відповіді.
     * @param chat Поточний об'єкт чату.
     * @param signal AbortSignal для можливості переривання запиту.
     * @returns Асинхронний ітератор, що видає OllamaStreamChunk.
     */
    async* generateChatResponseStream(chat: Chat, signal?: AbortSignal): AsyncIterableIterator<OllamaStreamChunk> {
        if (!chat) {
            yield { error: "Chat object is null." };
            return;
        }
        if (!this.promptService) {
            yield { error: "Prompt service is unavailable." };
            return;
        }

        const currentSettings = this.plugin.settings;
        const modelName = chat.metadata.modelName || currentSettings.modelName;
        const temperature = chat.metadata.temperature ?? currentSettings.temperature;

        if (!modelName) {
            yield { error: "No Ollama model selected." };
            return;
        }

        const url = `${this.plugin.settings.ollamaServerUrl}/api/generate`;
        const headers = { 'Content-Type': 'application/json' };

        try {
            const history = chat.getMessages();
            const systemPrompt = await this.promptService.getSystemPromptForAPI(chat.metadata);

            const promptBody = await this.promptService.preparePromptBody(history, chat.metadata);

            if (promptBody === null || promptBody === undefined) {
                yield { error: "Could not generate prompt body." };
                return;
            }

            const requestBody: any = {
                model: modelName,
                prompt: promptBody,
                stream: true, // <--- ВАЖЛИВО: Вмикаємо стрімінг
                temperature: temperature,
                options: { num_ctx: currentSettings.contextWindow },
                ...(systemPrompt && { system: systemPrompt })
            };


            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
                signal: signal // <--- Передаємо AbortSignal
            });

            if (!response.ok) {
                let errorText = `Ollama API error! Status: ${response.status}`;
                try {
                    const errorJson = await response.json();
                    errorText += `: ${errorJson?.error || response.statusText || 'No details'}`;
                } catch (e) {
                    errorText += `: ${response.statusText || 'Could not parse error details'}`;
                }
                this.emit('connection-error', new Error(errorText)); // Emit connection error (though maybe API error)
                yield { error: errorText };
                return;
            }

            if (!response.body) {
                throw new Error("Response body is null");
            }

            // Обробка потоку
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (signal?.aborted) {
                    reader.cancel("Aborted by user"); // Скасовуємо читання
                    // Не кидаємо помилку, бо це очікувана поведінка
                    // Можна повернути спеціальний chunk або просто завершити ітератор
                     yield { error: "Generation aborted by user.", done: true };
                    return; // Завершуємо генератор
                }

                if (done) {
                    // Обробка залишку буфера, якщо він не порожній і є валідним JSON
                    if (buffer.trim()) {
                         try {
                            const jsonChunk = JSON.parse(buffer.trim());
                            yield jsonChunk as OllamaStreamChunk;
                         } catch (e) {
                         }
                    }
                    break; // Вихід з циклу, коли потік завершено
                }

                buffer += decoder.decode(value, { stream: true });

                // Розділяємо буфер на рядки (Ollama надсилає JSON розділені \n)
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Останній (можливо неповний) рядок залишаємо в буфері

                for (const line of lines) {
                    if (line.trim() === '') continue; // Пропускаємо порожні рядки
                    try {
                        const jsonChunk = JSON.parse(line.trim());
                        yield jsonChunk as OllamaStreamChunk; // Віддаємо розпарсений chunk
                        if (jsonChunk.done) {
                            // Якщо Ollama надіслала done=true, ми маємо завершити читання
                             reader.cancel("Stream finished by Ollama"); // Скасовуємо читання, оскільки Ollama сказала, що все
                             return; // Завершуємо генератор
                        }
                    } catch (e) {
                        // Вирішуємо, чи продовжувати, чи зупинитися при помилці парсингу
                        // Можна віддати помилку: yield { error: `Failed to parse chunk: ${line.trim()}` };
                    }
                }
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                 yield { error: "Generation aborted by user.", done: true }; // Віддаємо помилку переривання
            } else {
                let errorMessage = error instanceof Error ? error.message : "Unknown error generating stream.";
                 // Більш детальні повідомлення про помилки
                if (errorMessage.includes("connect") || errorMessage.includes("fetch") || errorMessage.includes("NetworkError") || errorMessage.includes('Failed to fetch')) {
                    errorMessage = `Connection Error: Failed to reach Ollama at ${this.plugin.settings.ollamaServerUrl}. Is it running?`;
                    this.emit('connection-error', new Error(errorMessage)); // Emit connection error
                }
                 // Повертаємо помилку через ітератор
                yield { error: errorMessage };
            }
        }
    }

    // --- Інші методи (getModels, getModelDetails, generateEmbeddings, generateRaw, _ollamaFetch) ---
    // Важливо: _ollamaFetch ТЕПЕР НЕ ПОТРІБЕН для generateChatResponseStream,
    // але може бути корисним для інших запитів (embeddings, tags, show), якщо вони не потребують стрімінгу.
    // Якщо ви їх не використовуєте або можете адаптувати generateChatResponseStream для них, то _ollamaFetch можна видалити.
    // Залишимо його поки що, але переконайтесь, що generateRaw та інші використовують його коректно (як було в запиті).

    /**
     * Sends a non-streaming request body to the Ollama /api/generate endpoint.
     * (Залишаємо для можливої сумісності або інших потреб)
     */
    async generateRaw(requestBody: any): Promise<OllamaGenerateResponse> {
        if (!requestBody.model || !requestBody.prompt) {
            throw new Error("generateRaw requires 'model' and 'prompt' in requestBody");
        }
        // Переконуємось, що stream=false
        requestBody.stream = false;
        if (!requestBody.system) {
            delete requestBody.system;
        }
        // Використовуємо fetch для однорідності, але без обробки потоку
        const url = `${this.plugin.settings.ollamaServerUrl}/api/generate`;
        const headers = { 'Content-Type': 'application/json' };
        try {
             const response = await fetch(url, {
                 method: 'POST',
                 headers: headers,
                 body: JSON.stringify(requestBody)
                 // Не передаємо signal тут, бо запит не потоковий і не має сенсу його переривати
             });

             if (!response.ok) {
                 let errorText = `Ollama API error! Status: ${response.status}`;
                 try {
                     const errorJson = await response.json();
                     errorText += `: ${errorJson?.error || response.statusText || 'No details'}`;
                 } catch (e) { errorText += `: ${response.statusText || 'Could not parse error details'}`; }
                 this.emit('connection-error', new Error(errorText));
                 throw new Error(errorText);
             }
              if (!response.body) throw new Error("Response body is null");

              return await response.json() as OllamaGenerateResponse; // Просто повертаємо JSON

        } catch (error: any) {
             const connectionErrorMsg = `Failed to connect/communicate with Ollama server at ${this.plugin.settings.ollamaServerUrl}. Is it running? (Endpoint: /api/generate)`;
             if (!error.message?.includes('Ollama API error')) {
                 this.emit('connection-error', new Error(connectionErrorMsg));
             }
             throw new Error(error.message || connectionErrorMsg);
        }
    }

    /**
     * Generates embeddings for a list of text prompts.
     * (Залишаємо без змін, використовує fetch)
     */
    async generateEmbeddings(prompts: string[], model: string): Promise<number[][] | null> {
        if (!prompts || prompts.length === 0) return [];
        const endpoint = '/api/embeddings';
        const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
        const headers = { 'Content-Type': 'application/json' };

        const embeddingsList: number[][] = [];
        try {
            for (const prompt of prompts) {
                const trimmedPrompt = prompt.trim();
                if (!trimmedPrompt) {
                    continue;
                }
                const requestBody = JSON.stringify({ model: model, prompt: trimmedPrompt });
                try {
                    const response = await fetch(url, { method: 'POST', headers, body: requestBody });
                     if (!response.ok) {
                         let errorText = `Ollama Embeddings API error! Status: ${response.status}`;
                         try { const errJson = await response.json(); errorText += `: ${errJson?.error || 'Details unavailable'}`; } catch {}
                         throw new Error(errorText);
                     }
                     const embeddingResponse = await response.json() as OllamaEmbeddingsResponse;

                    if (embeddingResponse && embeddingResponse.embedding) {
                        embeddingsList.push(embeddingResponse.embedding);
                    } else {
                    }
                } catch (singleError: any) {
                     this.emit('connection-error', new Error(singleError.message || 'Embedding generation failed')); // Emit error
                     // Вирішуємо: зупинятися чи продовжувати з іншими промптами? Продовжимо.
                }
            } // End for loop
            return embeddingsList.length > 0 ? embeddingsList : null;
        } catch (error) {
            // Помилка вже емітована, якщо це була помилка з'єднання/API
            return null;
        }
    }

     /**
     * Gets list of available models.
     * (Залишаємо без змін, використовує fetch)
     */
    async getModels(forceRefresh: boolean = false): Promise<string[]> {
        const endpoint = '/api/tags';
        const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
        let modelListResult: string[] = [];

        try {
            const response = await fetch(url, { method: 'GET' });

             if (!response.ok) {
                 let errorText = `Ollama Tags API error! Status: ${response.status}`;
                 try { const errJson = await response.json(); errorText += `: ${errJson?.error || 'Details unavailable'}`; } catch {}
                 this.emit('connection-error', new Error(errorText)); // Emit error
                 throw new Error(errorText);
             }
             const data = await response.json() as { models: Array<{name: string}> };


            if (data && Array.isArray(data.models)) {
                const modelNames = data.models
                  .map((m) => m?.name)
                  .filter((name): name is string => typeof name === 'string' && name.length > 0)
                  .sort();
                modelListResult = modelNames;
            } else {
            }
        } catch (e: any) {
             if (!e.message?.includes('API error')) { // Avoid duplicate emits
                this.emit('connection-error', new Error(e.message || 'Failed to fetch models'));
             }
        }
        return modelListResult;
   }

    /**
     * Gets details for a specific model.
     * (Залишаємо без змін, використовує fetch)
     */
    async getModelDetails(modelName: string): Promise<OllamaShowResponse | null> {
        const endpoint = '/api/show';
        const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
        const headers = { 'Content-Type': 'application/json' };
        try {
             const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ name: modelName }) });

              if (!response.ok) {
                 let errorText = `Ollama Show API error! Status: ${response.status}`;
                 try { const errJson = await response.json(); errorText += `: ${errJson?.error || 'Details unavailable'}`; } catch {}
                 this.emit('connection-error', new Error(errorText));
                 throw new Error(errorText);
              }
             const data = await response.json() as OllamaShowResponse;
            return data;
        } catch (e: any) {
             if (!e.message?.includes('API error')) {
                  this.emit('connection-error', new Error(e.message || `Failed to get details for ${modelName}`));
             }
            return null;
        }
    }

    // _ollamaFetch більше не потрібен, оскільки всі запити тепер використовують fetch напряму.
    // Можна його видалити.

    // ВИДАЛЕНО МЕТОД generateChatResponse (старий, не потоковий)
    // Всі виклики мають тепер використовувати generateChatResponseStream

} // --- End of OllamaService class ---