import { Notice } from "obsidian";
import OllamaPlugin from "./main";
import { OllamaView, MessageRole, Message } from "./ollamaView"; // Додаємо Message
import { ApiService, OllamaResponse } from "./apiServices"; // Імпортуємо ApiService та OllamaResponse
import { PromptService } from "./promptService"; // Імпортуємо PromptService

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
                    if (role && typeof msg.content === 'string' && msg.timestamp) { // Додано перевірку типу content
                        this.view.internalAddMessage(role, msg.content, {
                            saveHistory: false,
                            timestamp: msg.timestamp
                        });
                    } else {
                        console.warn("Пропуск повідомлення з неповними/неправильними даними під час завантаження історії:", msg);
                    }
                }
                historyLoaded = true;
                // Затримка перед прокруткою для рендерингу
                setTimeout(() => this.view?.guaranteedScrollToBottom(100, true), 100);
                // Перевіряємо згортання після завантаження всієї історії
                //FIXME: uncomment
                // setTimeout(() => this.view?.checkAllMessagesForCollapsing(), 150);
            }
            if (historyLoaded) {
                // Даємо час на рендеринг перед збереженням
                setTimeout(async () => {
                    await this.view?.saveMessageHistory();
                }, 200);
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
                // 1. Отримуємо історію з View
                const history: Message[] = this.view?.getMessages() ?? [];

                // 2. Готуємо повний промпт (з історією та керуванням контекстом)
                const formattedPrompt = await this.promptService.prepareFullPrompt(content, history);

                // 3. Готуємо тіло запиту
                const requestBody = {
                    model: this.plugin.settings.modelName,
                    prompt: formattedPrompt, // Результат роботи PromptService
                    stream: false, // Поки що без стрімінгу
                    temperature: this.plugin.settings.temperature,
                    options: {
                        num_ctx: this.plugin.settings.contextWindow, // Використовуємо contextWindow
                        // Можна додати інші опції Ollama тут, якщо потрібно
                        // stop: ["\nUser:", "\nAssistant:"] // Наприклад, стоп-слова
                    },
                    system: this.promptService.getSystemPrompt() ?? undefined // Додаємо системний промпт, якщо є
                };

                // Видаляємо system, якщо він порожній або null
                if (!requestBody.system) {
                    delete requestBody.system;
                }

                // 4. Викликаємо API
                responseData = await this.apiService.generateResponse(requestBody);

                // 5. Додаємо відповідь AI у View
                this.view?.removeLoadingIndicator(loadingMessageEl);
                if (responseData && typeof responseData.response === 'string') { // Перевіряємо тип відповіді
                    // Декодування HTML сутностей (якщо потрібно, хоча Ollama зазвичай не повертає HTML)
                    // const textArea = document.createElement("textarea");
                    // textArea.innerHTML = responseData.response;
                    // const decodedResponse = textArea.value;
                    // Замість цього просто використовуємо відповідь
                    this.view?.internalAddMessage("assistant", responseData.response.trim());
                } else {
                    // Якщо відповідь порожня або неправильного формату, але помилки не було
                    console.warn("Отримано неочікувану відповідь від моделі:", responseData);
                    this.view?.internalAddMessage("error", "Отримано неочікувану або порожню відповідь від моделі.");
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
                    } else if (errorMessage.includes("connect") || errorMessage.includes("fetch") || errorMessage.includes("NetworkError") || errorMessage.includes('Failed to fetch')) {
                        errorMessage += ` Перевірте URL сервера Ollama (${this.plugin.settings.ollamaServerUrl}) та переконайтеся, що сервер запущено.`;
                    } else if (error.message.includes('context window') || error.message.includes('maximum context length')) {
                        errorMessage = `Помилка контекстного вікна (${this.plugin.settings.contextWindow} токенів): ${error.message}. Спробуйте зменшити 'Контекстне вікно моделі' або увімкнути/вимкнути 'Просунуте керування контекстом' в налаштуваннях.`;
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