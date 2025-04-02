import { Notice } from "obsidian";
import OllamaPlugin from "./main";
import { OllamaView, MessageRole, Message } from "./ollamaView"; // Додаємо Message
import { ApiService, OllamaResponse } from "./apiServices"; // Імпортуємо ApiService та OllamaResponse
import { PromptService } from "./promptService"; // Імпортуємо PromptService

// Не потрібні ці інтерфейси тут, вони в інших файлах
// export interface RequestOptions { num_ctx?: number; }
// export interface OllamaRequestBody { ... }

export class MessageService {
    private plugin: OllamaPlugin;
    private view: OllamaView | null = null;
    private apiService: ApiService; // Додаємо посилання
    private promptService: PromptService; // Додаємо посилання
    private isProcessing: boolean = false;

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
        // Створюємо або отримуємо сервіси з плагіна
        this.apiService = plugin.apiService;
        this.promptService = plugin.promptService;
    }

    public setView(view: OllamaView): void {
        this.view = view;
    }

    public async loadMessageHistory(): Promise<void> {
        if (!this.view) return;
        let historyLoaded = false;
        try {
            const history = await this.plugin.loadMessageHistory();
            if (Array.isArray(history) && history.length > 0) {
                for (const msg of history) {
                    const role = msg.role as MessageRole;
                    if (role && msg.content && msg.timestamp) {
                        this.view.internalAddMessage(role, msg.content, {
                            saveHistory: false,
                            timestamp: msg.timestamp
                        });
                    } else {
                        console.warn("Пропуск повідомлення з неповними даними під час завантаження історії:", msg);
                    }
                }
                historyLoaded = true;
                // Затримка перед прокруткою для рендерингу
                setTimeout(() => this.view?.guaranteedScrollToBottom(100, true), 100);
            }
            if (historyLoaded) {
                await this.view.saveMessageHistory(); // Зберігаємо раз після завантаження
            }
        } catch (error) {
            console.error("MessageService: Помилка завантаження історії:", error);
        } finally {
            // Переконуємося, що порожній стан відображається правильно
            if (this.view && this.view.getMessagesCount() === 0) {
                this.view.showEmptyState();
            } else if (this.view) {
                this.view.hideEmptyState();
            }
        }
    }

    public async sendMessage(content: string): Promise<void> {
        if (this.isProcessing || !content.trim() || !this.view) return;
        // OllamaView вже додав повідомлення користувача
        await this.processWithOllama(content);
    }

    private async processWithOllama(content: string): Promise<void> {
        if (!this.view) return;

        this.isProcessing = true;
        this.view.setLoadingState(true);
        const loadingMessageEl = this.view.addLoadingIndicator();

        // Використовуємо setTimeout(0) для асинхронного виконання без блокування UI
        setTimeout(async () => {
            let responseData: OllamaResponse | null = null;
            try {
                // 1. Отримуємо історію з View (або з іншого джерела, якщо потрібно)
                // Потрібен метод для отримання історії з View
                const history: Message[] = this.view?.getMessages() ?? []; // Потрібно додати getMessages() в OllamaView

                // 2. Готуємо повний промпт, включаючи історію, RAG, обрізання контексту
                const formattedPrompt = await this.promptService.prepareFullPrompt(content, history);

                // 3. Готуємо тіло запиту
                const requestBody = {
                    model: this.plugin.settings.modelName,
                    prompt: formattedPrompt,
                    stream: false, // Поки що без стрімінгу
                    temperature: this.plugin.settings.temperature,
                    options: {
                        num_ctx: this.plugin.settings.contextWindow, // Використовуємо contextWindow
                    },
                    system: this.promptService.getSystemPrompt() ?? undefined // Додаємо системний промпт, якщо є
                };

                // Видаляємо system, якщо він порожній
                if (!requestBody.system) {
                    delete requestBody.system;
                }

                // 4. Викликаємо API
                responseData = await this.apiService.generateResponse(requestBody);

                // 5. Додаємо відповідь AI у View
                this.view?.removeLoadingIndicator(loadingMessageEl);
                if (responseData && responseData.response) {
                    // Декодування HTML сутностей (якщо потрібно)
                    const textArea = document.createElement("textarea");
                    textArea.innerHTML = responseData.response;
                    const decodedResponse = textArea.value;
                    this.view?.internalAddMessage("assistant", decodedResponse);
                } else {
                    // Якщо відповідь порожня, але помилки не було
                    this.view?.internalAddMessage("error", "Отримано порожню відповідь від моделі.");
                }

            } catch (error: any) {
                console.error("Помилка обробки запиту до Ollama:", error);
                this.view?.removeLoadingIndicator(loadingMessageEl);

                // Формуємо більш детальне повідомлення про помилку
                let errorMessage = "Невідома помилка під час взаємодії з Ollama.";
                if (error instanceof Error) {
                    errorMessage = error.message; // Використовуємо повідомлення з помилки API або Fetch
                    // Додаємо специфічні поради
                    if (errorMessage.includes("Model") && errorMessage.includes("not found")) {
                        errorMessage += ` Перевірте назву моделі "${this.plugin.settings.modelName}" у налаштуваннях.`;
                    } else if (errorMessage.includes("connect") || errorMessage.includes("fetch")) {
                        errorMessage += ` Перевірте URL сервера Ollama (${this.plugin.settings.ollamaServerUrl}) та переконайтеся, що сервер запущено.`;
                    } else if (error.message.includes('context window')) {
                        errorMessage = `Помилка контекстного вікна: ${error.message}. Спробуйте зменшити розмір вікна в налаштуваннях або скоротити історію.`;
                    }
                }

                this.view?.internalAddMessage("error", errorMessage);

            } finally {
                this.isProcessing = false;
                this.view?.setLoadingState(false); // Завжди знімаємо стан завантаження
            }
        }, 0);
    }

    public addSystemMessage(content: string): void {
        if (this.view) {
            this.view.internalAddMessage("system", content);
        }
    }
}