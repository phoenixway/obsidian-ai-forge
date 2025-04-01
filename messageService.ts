import { Notice } from "obsidian";
import OllamaPlugin from "./main";
import { OllamaView } from "./ollamaView"; // Припускаємо, що MessageType визначено в ollamaView.ts або імпортовано туди

// --- Видалено імпорти, пов'язані з рендерингом ---
// import { setIcon, MarkdownRenderer } from "obsidian";

// --- Визначення типів (можна перенести в ollamaView.ts або спільний файл) ---
export enum MessageType {
    USER = "user",
    ASSISTANT = "assistant",
    ERROR = "error",
    SYSTEM = "system"
}
export interface RequestOptions { num_ctx?: number; }
export interface OllamaRequestBody { /* ... без змін ... */ }
// --- Кінець визначення типів ---

export class MessageService {
    private plugin: OllamaPlugin;
    private view: OllamaView | null = null;
    // --- Видалено внутрішній стан ---
    // private messages: Message[] = [];
    private isProcessing: boolean = false;
    // private messagesPairCount: number = 0; // Тепер керується в OllamaView

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
    }

    public setView(view: OllamaView): void {
        this.view = view;
    }

    // Load message history and populate the VIEW
    public async loadMessageHistory(): Promise<void> {
        if (!this.view) return;

        try {
            const history = await this.plugin.loadMessageHistory(); // Завантажує масив об'єктів

            // --- Оновлена логіка ---
            if (Array.isArray(history) && history.length > 0) {
                // Очищаємо поточний View перед заповненням
                this.view.clearChatContainer(); // Це очистить і this.view.messages
                // Додаємо повідомлення через View, який сам збереже фінальний стан
                for (const msg of history) {
                    // Перетворюємо збережену роль на MessageType enum або рядок, який розуміє internalAddMessage
                    // Припускаємо, що internalAddMessage приймає 'user' | 'assistant' | 'system' | 'error'
                    const role = msg.role as "user" | "assistant" | "system" | "error"; // Потрібно привести тип
                    if (role) {
                        // Передаємо ТІЛЬКИ роль і контент. Час генерується в internalAddMessage
                        this.view.internalAddMessage(role, msg.content /*, new Date(msg.timestamp)*/); // Передаємо лише роль та контент
                    } else {
                        console.warn("Skipping message with unknown role during history load:", msg);
                    }
                }
                // Прокрутка та ініціалізація блоків тепер мають відбуватись у View після додавання
                this.view.guaranteedScrollToBottom(100, true); // Прокрутка після завантаження
                // this.view.initializeThinkingBlocks(); // Цей метод має бути в OllamaView, якщо потрібен
            } else {
                // Якщо історія порожня, просто показуємо порожній стан (view вже очищено)
                this.view.showEmptyState();
            }
            // Не викликаємо saveMessageHistory тут, бо internalAddMessage викликає його для кожного повідомлення
            // Це може бути неефективно, краще викликати збереження ОДИН раз в кінці циклу в OllamaView
            // TODO: Оптимізувати збереження при завантаженні історії в OllamaView
        } catch (error) {
            console.error("Error loading message history:", error);
            this.view.clearChatContainer(); // Очищаємо у випадку помилки
            this.view.showEmptyState();
        }
    }

    // --- Видалено saveMessageHistory з MessageService ---

    // Send a message from the user to Ollama
    public async sendMessage(content: string): Promise<void> {
        if (this.isProcessing || !content.trim() || !this.view) return;
        // --- Не додаємо повідомлення тут, це робить OllamaView ---
        // this.view.clearInputField(); // Це теж має робити OllamaView перед викликом sendMessage
        // this.view.hideEmptyState(); // І це

        await this.processWithOllama(content);
    }

    // --- Видалено addMessage з MessageService ---
    // --- Видалено renderMessage та пов'язані хелпери з MessageService ---
    // --- Видалено clearChatMessages з MessageService (використовуємо OllamaView.clearChatContainer) ---


    // Process request with Ollama
    private async processWithOllama(content: string): Promise<void> {
        if (!this.view) return;

        // Встановлюємо стан завантаження через View
        this.view.setLoadingState(true);
        const loadingMessageEl = this.view.addLoadingIndicator();

        // Використовуємо setTimeout(..., 0) для негайного повернення контролю UI
        setTimeout(async () => {
            try {
                // --- Логіка визначення системного промпту (залишається) ---
                let useSystemPrompt = false;
                // TODO: messagesPairCount тепер в OllamaView, треба отримати його звідти
                // Потрібно або передати messagesPairCount в processWithOllama,
                // або зробити messagesPairCount публічним геттером в OllamaView.
                // Приклад з геттером (потрібно додати getMessagesPairCount() в OllamaView):
                // const messagesPairCount = this.view?.getMessagesPairCount() ?? 0;
                // if (this.plugin.settings.followRole) {
                //     const systemPromptInterval = this.plugin.settings.systemPromptInterval || 0;
                //     if (systemPromptInterval === 0) { useSystemPrompt = true; }
                //     else if (systemPromptInterval > 0) { useSystemPrompt = messagesPairCount % systemPromptInterval === 0;}
                // }
                // const isNewConversation = (this.view?.getMessagesCount() ?? 0) <= 1; // Потрібен getMessagesCount()

                // --- Припустимо, що логіка useSystemPrompt і isNewConversation реалізована ---
                // const isNewConversation = (this.view?.messages.length ?? 0) <=1; // НЕПРАВИЛЬНО - не маємо доступу до messages
                const isNewConversation = true; // Тимчасова заглушка

                const formattedPrompt = await this.plugin.promptService.prepareFullPrompt(
                    content,
                    isNewConversation
                );
                const requestBody: OllamaRequestBody = { /* ... без змін ... */ };
                if (useSystemPrompt) { /* ... без змін ... */ }
                // --- Кінець логіки системного промпту ---


                const data = await this.plugin.apiService.generateResponse(requestBody);

                this.view?.removeLoadingIndicator(loadingMessageEl);
                // --- Викликаємо метод View для додавання повідомлення ---
                this.view?.internalAddMessage("assistant", data.response);
                // this.initializeThinkingBlocks(); // Має викликатись у View, якщо потрібно

            } catch (error) {
                console.error("Error processing request with Ollama:", error);
                this.view?.removeLoadingIndicator(loadingMessageEl);
                const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
                // --- Викликаємо метод View для додавання помилки ---
                this.view?.internalAddMessage(
                    "error", // Використовуємо рядковий літерал
                    `Connection error with Ollama: ${errorMessage}. Please check the settings and ensure the server is running.`
                );
            } finally {
                // Знімаємо стан завантаження через View
                this.view?.setLoadingState(false);
            }
        }, 0); // setTimeout 0 для асинхронного виконання без блокування UI
    }

    // Додавання системного повідомлення тепер теж через View
    public addSystemMessage(content: string): void {
        if (this.view) {
            this.view.internalAddMessage("system", content); // Використовуємо рядковий літерал
        }
    }

    // --- Видалено приватні хелпери для рендерингу ---

}

// --- Видалено isAssistant ---