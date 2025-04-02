import { TFile, normalizePath } from "obsidian"; // Додаємо normalizePath
import * as path from 'path';
import OllamaPlugin from "./main";
import { Message } from "./ollamaView";
import { encode } from 'gpt-tokenizer'; // Імпортуємо токенізатор

// Простий лічильник слів (для базової стратегії)
function countWords(text: string): number {
    if (!text) return 0;
    // Більш надійний підрахунок слів, що ігнорує зайві пробіли
    return text.trim().split(/\s+/).filter(Boolean).length;
}

// Функція токенізації (для просунутої стратегії)
function countTokens(text: string): number {
    if (!text) return 0;
    try {
        // Використовуємо encode з бібліотеки gpt-tokenizer
        return encode(text).length;
    } catch (e) {
        console.warn("Помилка токенізації, повертається приблизна оцінка за словами:", e);
        // Повертаємо приблизну оцінку у разі помилки токенізатора
        return Math.ceil(countWords(text) * 1.5); // Збільшуємо коефіцієнт для безпеки
    }
}


export class PromptService {
    private systemPrompt: string | null = null;
    private plugin: OllamaPlugin;
    // Резерв токенів для відповіді моделі та можливих неточностей токенізації
    private readonly RESPONSE_TOKEN_BUFFER = 500;

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
    }

    setSystemPrompt(prompt: string | null): void {
        this.systemPrompt = prompt;
    }

    getSystemPrompt(): string | null {
        return this.systemPrompt;
    }

    // --- Основний метод підготовки ---
    async prepareFullPrompt(
        content: string, // Поточне повідомлення користувача
        history: Message[] // Актуальна історія чату
    ): Promise<string> {
        if (!this.plugin) {
            console.warn("Plugin reference not set in PromptService.");
            return content.trim(); // Повертаємо лише ввід користувача
        }

        // 1. Оновлюємо системний промпт (якщо потрібно)
        // Це робиться перед побудовою контексту, щоб врахувати його розмір
        try {
            const roleDefinition = await this.getRoleDefinition();
            this.setSystemPrompt(roleDefinition); // Встановлюємо актуальний
        } catch (error) {
            console.error("Error getting role definition:", error);
            this.setSystemPrompt(null); // Скидаємо, якщо помилка
        }
        const currentSystemPrompt = this.getSystemPrompt();

        // 2. Отримуємо RAG контекст
        let ragContext: string | null = null;
        if (this.plugin.settings.ragEnabled && this.plugin.ragService) {
            try {
                ragContext = this.plugin.ragService.prepareContext(content);
            } catch (error) {
                console.error("Error processing RAG:", error);
            }
        }
        // Додаємо заголовки та форматування до RAG блоку
        const ragHeader = "## Контекстна інформація з нотаток:\n";
        const ragBlock = ragContext ? `${ragHeader}${ragContext.trim()}\n\n---\n` : "";


        // 3. Вибираємо стратегію і готуємо промпт
        let finalPrompt: string;
        const userInputFormatted = `User: ${content.trim()}`; // Останнє повідомлення користувача

        if (this.plugin.settings.useAdvancedContextStrategy) {
            // --- Просунута стратегія (Токени) ---
            console.log("[Ollama] Using advanced context strategy (tokens).");
            // Ліміт контекстного вікна моделі з налаштувань
            const modelContextLimit = this.plugin.settings.contextWindow;
            // Максимальна кількість токенів для промпту (з буфером для відповіді)
            const maxContextTokens = Math.max(100, modelContextLimit - this.RESPONSE_TOKEN_BUFFER); // Залишаємо мінімум 100 токенів
            let currentTokens = 0;
            let promptParts: string[] = []; // Масив частин промпту (RAG, історія)

            // Рахуємо токени системного промпту (він піде окремо, але враховується в ліміті)
            const systemPromptTokens = currentSystemPrompt ? countTokens(currentSystemPrompt) : 0;
            currentTokens += systemPromptTokens;

            // Рахуємо токени поточного вводу користувача (завжди включається)
            const userInputTokens = countTokens(userInputFormatted);
            currentTokens += userInputTokens;

            // Спочатку пробуємо додати RAG, якщо він влазить
            const ragTokens = countTokens(ragBlock);
            let ragAdded = false;
            if (ragBlock && currentTokens + ragTokens <= maxContextTokens) {
                promptParts.push(ragBlock); // Додаємо RAG на початок масиву
                currentTokens += ragTokens;
                ragAdded = true;
                console.log(`[Ollama] RAG context added (${ragTokens} tokens).`);
            } else if (ragBlock) {
                console.warn(`[Ollama] RAG context (${ragTokens} tokens) too large, skipped. Available: ${maxContextTokens - currentTokens}`);
            }


            // Додаємо історію (з найновіших) доки влазить
            let addedHistoryMessages = 0;
            for (let i = history.length - 1; i >= 0; i--) {
                const msg = history[i];
                // Формуємо рядок повідомлення (можна додати мітки часу, якщо потрібно)
                const formattedMsg = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.trim()}`;
                const messageTokens = countTokens(formattedMsg);

                if (currentTokens + messageTokens <= maxContextTokens) {
                    promptParts.push(formattedMsg); // Додаємо в кінець масиву (буде перевернуто)
                    currentTokens += messageTokens;
                    addedHistoryMessages++;
                } else {
                    console.log(`[Ollama] History trimming: Stopped at message index ${i} (${messageTokens} tokens). Total tokens: ${currentTokens}/${maxContextTokens}`);
                    // --- Місце для потенційної сумаризації ---
                    // Тут можна було б спробувати узагальнити `msg` або групу старих повідомлень.
                    // -------------------------------------------
                    break; // Зупиняємось, коли місце закінчилось
                }
            }

            // Якщо RAG було додано на початку, він вже на своєму місці.
            // Історія додавалася в кінець, тому її треба перевернути.
            // Розділяємо RAG та історію, перевертаємо історію, з'єднуємо.
            let finalPromptParts: string[] = [];
            if (ragAdded) {
                finalPromptParts.push(promptParts.shift()!); // Беремо RAG
                promptParts.reverse(); // Перевертаємо історію
                finalPromptParts = finalPromptParts.concat(promptParts); // Додаємо історію після RAG
            } else {
                promptParts.reverse(); // Просто перевертаємо історію
                finalPromptParts = promptParts;
            }


            finalPromptParts.push(userInputFormatted); // Додаємо поточний ввід в самий кінець
            finalPrompt = finalPromptParts.join("\n\n"); // Збираємо промпт
            console.log(`[Ollama] Final prompt token count (approx. incl system & input): ${currentTokens}. History messages included: ${addedHistoryMessages}.`);

        } else {
            // --- Базова стратегія (Слова) ---
            console.log("[Ollama] Using basic context strategy (words).");
            const systemPromptWordCount = currentSystemPrompt ? countWords(currentSystemPrompt) : 0;
            const userInputWordCount = countWords(userInputFormatted);
            // Приблизний ліміт слів
            const tokenApproximationFactor = 1.0; // Припускаємо 1 слово = 1 токен (дуже грубо)
            const wordLimit = Math.max(100, (this.plugin.settings.contextWindow / tokenApproximationFactor) - systemPromptWordCount - userInputWordCount - 300); // Більший буфер для слів

            let contextParts: string[] = [];
            let currentWordCount = 0;

            // Додаємо RAG
            const ragWords = countWords(ragBlock);
            let ragAdded = false;
            if (ragBlock && currentWordCount + ragWords <= wordLimit) {
                contextParts.push(ragBlock);
                currentWordCount += ragWords;
                ragAdded = true;
                // console.log(`[Ollama] RAG context added (${ragWords} words).`);
            } else if (ragBlock) {
                console.warn(`[Ollama] RAG context (${ragWords} words) too large, skipped. Available: ${wordLimit - currentWordCount}`);
            }

            // Додаємо історію (з найновіших)
            let addedHistoryMessages = 0;
            for (let i = history.length - 1; i >= 0; i--) {
                const msg = history[i];
                const formattedMsg = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.trim()}`;
                const messageWords = countWords(formattedMsg);

                if (currentWordCount + messageWords <= wordLimit) {
                    contextParts.push(formattedMsg); // Додаємо в кінець (буде перевернуто)
                    currentWordCount += messageWords;
                    addedHistoryMessages++;
                } else {
                    // console.log(`[Ollama] History trimming (words): Stopped at message index ${i}. Total words: ${currentWordCount}/${wordLimit}`);
                    break;
                }
            }

            // Перевертаємо та збираємо, як у просунутій стратегії
            let finalPromptParts: string[] = [];
            if (ragAdded) {
                finalPromptParts.push(contextParts.shift()!);
                contextParts.reverse();
                finalPromptParts = finalPromptParts.concat(contextParts);
            } else {
                contextParts.reverse();
                finalPromptParts = contextParts;
            }

            finalPromptParts.push(userInputFormatted);
            finalPrompt = finalPromptParts.join("\n\n");
            // console.log(`[Ollama] Final prompt word count (approx. incl system & input): ${currentWordCount + systemPromptWordCount + userInputWordCount}. History messages included: ${addedHistoryMessages}.`);
        }


        // Повертаємо фінальний промпт (системний промпт буде додано окремо в тіло запиту)
        // console.log("[Ollama] Prepared prompt:", finalPrompt.substring(0, 300) + "..."); // Логуємо початок промпту
        return finalPrompt;
    }


    // --- Методи для роботи з ролями (без змін з попередньої відповіді) ---
    async getDefaultRoleDefinition(): Promise<string | null> {
        if (!this.plugin) return null;
        try {
            const pluginFolder = this.plugin.manifest.dir;
            if (!pluginFolder) { console.error("Cannot determine plugin folder path."); return null; }
            const rolePath = 'default-role.md';
            const fullPath = normalizePath(path.join(pluginFolder, rolePath)); // Використовуємо normalizePath
            let content: string | null = null;
            const adapter = this.plugin.app.vault.adapter;

            if (await adapter.exists(fullPath)) {
                try { content = await adapter.read(fullPath); }
                catch (readError) { console.error(`Error reading default role file at ${fullPath}:`, readError); return null; }
            } else {
                console.log(`Default role file not found at ${fullPath}, creating it.`);
                try {
                    const defaultContent = "# Default AI Role\n\nYou are a helpful assistant.";
                    await adapter.write(fullPath, defaultContent);
                    content = defaultContent;
                } catch (createError) { console.error(`Error creating default role file at ${fullPath}:`, createError); return null; }
            }

            if (content !== null) {
                const currentTime = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }); // Формат часу
                // Додаємо поточну дату та час
                const currentDate = new Date().toLocaleDateString('uk-UA', { year: 'numeric', month: 'long', day: 'numeric' });
                content += `\n\nCurrent date and time: ${currentDate}, ${currentTime}`; // Додано дату
                return content.trim(); // Забираємо зайві пробіли
            }
            return null;
        } catch (error) { console.error("Error handling default role definition:", error); return null; }
    }

    async getCustomRoleDefinition(): Promise<string | null> {
        if (!this.plugin || !this.plugin.settings.customRoleFilePath) return null;
        try {
            const customPath = normalizePath(this.plugin.settings.customRoleFilePath); // Нормалізуємо
            const file = this.plugin.app.vault.getAbstractFileByPath(customPath);
            if (file instanceof TFile) {
                let content = await this.plugin.app.vault.read(file);
                const currentTime = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
                const currentDate = new Date().toLocaleDateString('uk-UA', { year: 'numeric', month: 'long', day: 'numeric' });
                content += `\n\nCurrent date and time: ${currentDate}, ${currentTime}`; // Додано дату
                return content.trim();
            } else { console.warn(`Custom role file not found: ${customPath}`); return null; }
        } catch (error) { console.error("Error reading custom role definition:", error); return null; }
    }

    async getRoleDefinition(): Promise<string | null> {
        if (!this.plugin || !this.plugin.settings.followRole) return null;
        try {
            if (this.plugin.settings.useDefaultRoleDefinition) {
                return await this.getDefaultRoleDefinition();
            } else if (this.plugin.settings.customRoleFilePath) {
                return await this.getCustomRoleDefinition();
            }
            return null;
        } catch (error) { console.error("Error reading role definition:", error); return null; }
    }
}