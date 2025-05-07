// src/TranslationService.ts
import OllamaPlugin from './main';
import { Notice } from 'obsidian';
import { TranslationProvider, LANGUAGES } from './settings'; // Імпортуємо типи

const GOOGLE_TRANSLATE_API_URL = 'https://translation.googleapis.com/language/translate/v2';

export class TranslationService {
    private plugin: OllamaPlugin;

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
    }

    /**
     * Головний метод для перекладу тексту. Вибирає провайдера на основі налаштувань.
     * @param text Текст для перекладу.
     * @param targetLang Код цільової мови (e.g., 'uk', 'en'). Якщо не вказано, використовується з налаштувань.
     * @returns Перекладений текст або null у разі помилки/вимкнення.
     */
    async translate(text: string, targetLang?: string): Promise<string | null> {
        const provider = this.plugin.settings.translationProvider;
        const finalTargetLang = targetLang || this.plugin.settings.translationTargetLanguage;

        if (provider === 'none' || !this.plugin.settings.enableTranslation) {
            this.plugin.logger.debug("[TranslationService] Translation disabled or provider is 'none'.");
            return null;
        }

        if (!text || !text.trim()) {
             this.plugin.logger.debug("[TranslationService] Input text is empty.");
             return ""; // Повертаємо порожній рядок для порожнього вводу
        }

        if (!finalTargetLang) {
             this.plugin.logger.error("[TranslationService] Target language is not defined.");
             new Notice("Translation Error: Target language not configured.");
             return null;
        }


        this.plugin.logger.info(`[TranslationService] Requesting translation via '${provider}' to '${finalTargetLang}'.`);

        try {
            switch (provider) {
                case 'google':
                    const apiKey = this.plugin.settings.googleTranslationApiKey;
                    if (!apiKey) {
                        new Notice("Google Translation API Key is not configured.");
                        this.plugin.logger.error("[TranslationService] Google API Key missing.");
                        return null;
                    }
                    return await this._translateWithGoogle(text, finalTargetLang, apiKey);
                case 'ollama':
                     const model = this.plugin.settings.ollamaTranslationModel;
                     if (!model) {
                        new Notice("Ollama translation model is not selected in settings.");
                        this.plugin.logger.error("[TranslationService] Ollama translation model missing.");
                        return null;
                    }
                    return await this._translateWithOllama(text, finalTargetLang, model);
                default:
                    this.plugin.logger.warn(`[TranslationService] Unknown translation provider: ${provider}`);
                    return null;
            }
        } catch (error) {
             this.plugin.logger.error(`[TranslationService] General translation error for provider ${provider}:`, error);
             new Notice(`Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
             return null;
        }
    }

    /**
     * Переклад за допомогою Google Translate API.
     */
    private async _translateWithGoogle(text: string, targetLang: string, apiKey: string): Promise<string | null> {
        if (targetLang === 'English') {
            targetLang = 'en'; // Google API вимагає код мови, а не назву
        }
        this.plugin.logger.debug(`[_translateWithGoogle] Translating to ${targetLang}...`);
        try {
            const response = await fetch(`${GOOGLE_TRANSLATE_API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ q: text, target: targetLang, format: 'text' }),
            });

            const data = await response.json();

            if (!response.ok) {
                const errorMsg = data.error?.message || `HTTP error ${response.status}`;
                throw new Error(`Google API Error: ${errorMsg}`);
            }

            if (data.data?.translations?.[0]?.translatedText) {
                const translatedText = this.decodeHtmlEntities(data.data.translations[0].translatedText);
                this.plugin.logger.debug("[_translateWithGoogle] Translation successful.");
                return translatedText;
            } else {
                this.plugin.logger.error("[_translateWithGoogle] Unexpected response structure:", data);
                throw new Error("Unexpected response structure from Google API.");
            }
        } catch (error) {
            this.plugin.logger.error("[_translateWithGoogle] API call failed:", error);
            // Помилка буде оброблена в головному методі translate
            throw error; // Перекидаємо помилку далі
        }
    }

    /**
     * Переклад за допомогою моделі Ollama.
     */
    private async _translateWithOllama(text: string, targetLang: string, model: string): Promise<string | null> {
        this.plugin.logger.debug(`[_translateWithOllama] Translating to ${targetLang} using model ${model}...`);

        const targetLangName = LANGUAGES[targetLang] || targetLang; // Отримуємо повну назву мови для промпту

        // TODO: Потрібен механізм визначення мови джерела (sourceLang)
        // Наразі припускаємо, що джерело - мова інтерфейсу або англійська
        // const sourceLangName = "English"; // Або визначити динамічно

        // Дуже простий промпт. Можливо, потребує доопрацювання для конкретних моделей.
        const prompt = `Translate the following text to ${targetLangName}. Output ONLY the translated text, without any introduction or explanation.\n\nText:\n"""\n${text}\n"""\n\nTranslated Text:`;

        try {
            const requestBody = {
                model: model,
                prompt: prompt,
                stream: false, // Для перекладу зазвичай не потрібен стрімінг
                options: {
                    temperature: 0.2, // Низька температура для більш точного перекладу
                    num_predict: 1024, // Обмеження довжини відповіді (можна налаштувати)
                    // Можна додати stop tokens, якщо модель додає зайве
                }
            };

            this.plugin.logger.debug("Sending translation request to Ollama:", requestBody);
            // Використовуємо існуючий сервіс Ollama
            const responseData = await this.plugin.ollamaService.generateRaw(requestBody);

            if (responseData && responseData.response) {
                const translatedText = responseData.response.trim();
                // Додаткова обробка відповіді (видалення можливих префіксів/суфіксів), якщо модель їх додає
                 this.plugin.logger.debug(`[_translateWithOllama] Translation successful. Result length: ${translatedText.length}`);
                return translatedText;
            } else {
                this.plugin.logger.warn("[_translateWithOllama] Received empty response from Ollama model.");
                // Повертаємо null, а не кидаємо помилку, щоб відрізнити від проблем з мережею
                return null;
            }
        } catch (error) {
             this.plugin.logger.error(`[_translateWithOllama] Ollama request failed for model ${model}:`, error);
            // Помилка буде оброблена в головному методі translate
            throw error; // Перекидаємо помилку далі
        }
    }

    // Допоміжна функція декодування HTML (без змін)
    private decodeHtmlEntities(text: string): string {
        if (typeof document !== 'undefined') {
            const textArea = document.createElement("textarea");
            textArea.innerHTML = text;
            return textArea.value;
        } else {
            return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        }
    }
}