import { TFile } from "obsidian";
import * as path from 'path'; // Залишаємо для роботи зі шляхами
import OllamaPlugin from "./main"; // Потрібен для доступу до налаштувань
import { Message } from "./ollamaView"; // Імпортуємо тип повідомлення

// Простий лічильник слів
function countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).length;
}

export class PromptService {
    private systemPrompt: string | null = null;
    private plugin: OllamaPlugin; // Змінено тип на конкретний

    // Прибираємо StateManager, якщо він не потрібен саме для формування промпту
    // private stateManager: StateManager;

    constructor(plugin: OllamaPlugin) { // Отримуємо плагін одразу
        this.plugin = plugin;
        // this.stateManager = StateManager.getInstance();
    }

    setSystemPrompt(prompt: string | null): void {
        this.systemPrompt = prompt;
    }

    getSystemPrompt(): string | null {
        return this.systemPrompt;
    }

    // Цей метод тепер стає менш важливим, основна логіка в prepareFullPrompt
    formatPrompt(userInput: string): string {
        // Можливо, додати просте форматування, якщо потрібно
        return userInput.trim();
    }

    // Об'єднаємо логіку RAG сюди
    // enhanceWithRagContext(prompt: string, ragContext: string | null): string { ... }

    // --- Новий метод для підготовки контексту ---
    private buildContext(
        history: Message[],
        ragContext: string | null,
        userInput: string
    ): { fullPrompt: string, contextWordCount: number, systemPromptWordCount: number } {
        let promptParts: string[] = [];
        let systemWordCount = 0;
        let contextWordCount = 0; // Без системного промпту та нового вводу

        // 1. Системний промпт (якщо є) - обробляється окремо в API запиті
        const currentSystemPrompt = this.getSystemPrompt(); // Отримуємо актуальний
        if (currentSystemPrompt) {
            systemWordCount = countWords(currentSystemPrompt);
            // НЕ додаємо його сюди, він піде в `requestBody.system`
        }

        // 2. RAG контекст (якщо є)
        if (ragContext) {
            const ragHeader = "Контекстна інформація з нотаток:\n```\n";
            const ragFooter = "\n```\n\n";
            const fullRagBlock = ragHeader + ragContext + ragFooter;
            promptParts.push(fullRagBlock);
            contextWordCount += countWords(fullRagBlock);
        }

        // 3. Історія повідомлень (з найновіших до найстаріших)
        // Додаємо історію "знизу вверх", щоб потім легше обрізати старі
        const historyStrings: string[] = [];
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            // Форматуємо повідомлення для включення в промпт
            const formattedMsg = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`;
            historyStrings.push(formattedMsg);
            contextWordCount += countWords(formattedMsg);
        }
        // Додаємо історію в зворотньому порядку (новіші перші)
        promptParts = promptParts.concat(historyStrings.reverse());


        // 4. Поточне повідомлення користувача
        const userMsgFormatted = `User: ${userInput}`;
        promptParts.push(userMsgFormatted);
        // Слово поточного повідомлення НЕ враховуємо в contextWordCount для обрізання

        const fullPrompt = promptParts.join("\n\n"); // Роздільник між частинами
        // console.log("Initial context word count (excl. system/user input):", contextWordCount);
        return {
            fullPrompt: fullPrompt, // Промпт без системного, але з RAG та історією
            contextWordCount: contextWordCount, // Слова RAG + Історії
            systemPromptWordCount: systemWordCount // Слова системного промпту
        };
    }


    // --- Основний метод підготовки ---
    async prepareFullPrompt(
        content: string, // Поточне повідомлення користувача
        history: Message[] // Актуальна історія чату
    ): Promise<string> {
        if (!this.plugin) {
            console.warn("Plugin reference not set in PromptService.");
            return this.formatPrompt(content);
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

        // 2. Отримуємо RAG контекст
        let ragContext: string | null = null;
        if (this.plugin.settings.ragEnabled && this.plugin.ragService) {
            try {
                // Переконуємось, що є індекс, ЯКЩО RAG увімкнено
                // Перевірка на порожній індекс може бути неефективною, краще покладатись на те, що він є
                // if (this.plugin.ragService.isIndexEmpty?.()) { // Потрібен метод isIndexEmpty
                //     await this.plugin.ragService.indexDocuments();
                // }
                ragContext = this.plugin.ragService.prepareContext(content); // Готуємо контекст для поточного запиту
            } catch (error) {
                console.error("Error processing RAG:", error);
            }
        }

        // 3. Будуємо початковий контекст (історія + RAG + userInput)
        let { fullPrompt, contextWordCount, systemPromptWordCount } = this.buildContext(history, ragContext, content);
        const userInputWordCount = countWords(content);

        // 4. Перевіряємо та обрізаємо контекст (за словами, приблизно)
        // Припускаємо, що 1 токен ~ 0.75 слова (дуже грубо!)
        const tokenApproximationFactor = 0.75;
        // Ліміт контексту моделі з налаштувань
        const modelContextLimit = this.plugin.settings.contextWindow;
        // Розраховуємо приблизний ліміт у словах
        // Залишаємо трохи місця для відповіді моделі та системного промпту
        const wordLimit = Math.max(100, modelContextLimit / tokenApproximationFactor - systemPromptWordCount - userInputWordCount - 200); // Резерв 200 слів/токенів

        // console.log(`Word Limit: ${wordLimit}, Context Words: ${contextWordCount}, System Words: ${systemPromptWordCount}, Input Words: ${userInputWordCount}`);

        if (contextWordCount > wordLimit) {
            console.warn(`Context too long (${contextWordCount} words > limit ${wordLimit}). Trimming oldest messages/RAG.`);
            // Проста стратегія: обрізаємо початок `fullPrompt`, де знаходяться найстаріші повідомлення / RAG
            let promptLines = fullPrompt.split("\n\n");
            let currentWordCount = contextWordCount; // Починаємо з повного контексту

            // Видаляємо найстаріші частини (з початку масиву), доки не вліземо в ліміт
            // Першим елементом може бути RAG блок
            while (currentWordCount > wordLimit && promptLines.length > 1) { // Залишаємо хоча б останнє повідомлення user
                const lineToRemove = promptLines.shift(); // Видаляємо перший (найстаріший) елемент
                if (lineToRemove) {
                    currentWordCount -= countWords(lineToRemove);
                }
            }
            fullPrompt = promptLines.join("\n\n");
            console.log(`Trimmed context word count: ${currentWordCount}`);
        }

        // Повертаємо фінальний промпт (без системного, він йде окремо)
        // Переконуємось, що останнє повідомлення користувача завжди є
        if (!fullPrompt.includes(`User: ${content.trim()}`)) {
            console.warn("User input was trimmed, re-adding it.");
            fullPrompt += `\n\nUser: ${content.trim()}`; // Додаємо, якщо зникло
        }

        return fullPrompt;
    }

    // --- Методи для роботи з ролями (без змін) ---
    async getDefaultRoleDefinition(): Promise<string | null> {
        if (!this.plugin) return null;
        try {
            const pluginFolder = this.plugin.manifest.dir;
            if (!pluginFolder) {
                console.error("Cannot determine plugin folder path.");
                return null;
            }
            const rolePath = 'default-role.md';
            // Використовуємо normalizePath для коректного шляху
            const fullPath = normalizePath(path.join(pluginFolder, rolePath));

            let content: string | null = null;
            const adapter = this.plugin.app.vault.adapter;

            if (await adapter.exists(fullPath)) {
                try {
                    content = await adapter.read(fullPath);
                } catch (readError) {
                    console.error(`Error reading default role file at ${fullPath}:`, readError);
                    // Не створюємо файл, якщо не можемо прочитати існуючий
                    return null;
                }
            } else {
                // Файл не існує, створюємо
                console.log(`Default role file not found at ${fullPath}, creating it.`);
                try {
                    const defaultContent = "# Default AI Role\n\nYou are a helpful assistant.";
                    await adapter.write(fullPath, defaultContent);
                    content = defaultContent;
                } catch (createError) {
                    console.error(`Error creating default role file at ${fullPath}:`, createError);
                    return null;
                }
            }

            if (content !== null) {
                const currentTime = new Date().toLocaleTimeString('uk-UA'); // Український формат часу
                content += `\n\nПоточний час: ${currentTime}`;
                return content;
            }
            return null;
        } catch (error) {
            console.error("Error handling default role definition:", error);
            return null;
        }
    }

    async getCustomRoleDefinition(): Promise<string | null> {
        if (!this.plugin || !this.plugin.settings.customRoleFilePath) return null;
        try {
            const customPath = normalizePath(this.plugin.settings.customRoleFilePath); // Нормалізуємо шлях
            const file = this.plugin.app.vault.getAbstractFileByPath(customPath);

            if (file instanceof TFile) {
                let content = await this.plugin.app.vault.read(file);
                const currentTime = new Date().toLocaleTimeString('uk-UA');
                content += `\n\nПоточний час: ${currentTime}`;
                return content;
            } else {
                console.warn(`Custom role file not found or is not a file: ${customPath}`);
                return null;
            }
        } catch (error) {
            console.error("Error reading custom role definition:", error);
            return null;
        }
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
        } catch (error) {
            console.error("Error reading role definition:", error);
            return null;
        }
    }

    // Цей метод більше не потрібен тут, його логіка в ApiService
    // processModelResponse(response: string): string { ... }

    // Цей метод теж не потрібен тут, він в ApiService або MessageService
    // prepareRequestBody(modelName: string, prompt: string, temperature: number = 0.2): any { ... }
}

// Потрібно імпортувати normalizePath з obsidian у файлі, де використовується PromptService
// Наприклад, у main.ts: import { ..., normalizePath } from "obsidian";
// Або передавати normalizePath як залежність в PromptService.
// Для простоти, припустимо, що normalizePath імпортовано глобально або в main.ts
declare function normalizePath(path: string): string; // Повідомляємо TS про існування функції