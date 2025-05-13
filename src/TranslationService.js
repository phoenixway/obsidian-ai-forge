import { __awaiter } from "tslib";
import { Notice } from 'obsidian';
import { LANGUAGES } from './settings'; // Імпортуємо типи
const GOOGLE_TRANSLATE_API_URL = 'https://translation.googleapis.com/language/translate/v2';
export class TranslationService {
    constructor(plugin) {
        this.plugin = plugin;
    }
    /**
     * Головний метод для перекладу тексту. Вибирає провайдера на основі налаштувань.
     * @param text Текст для перекладу.
     * @param targetLang Код цільової мови (e.g., 'uk', 'en'). Якщо не вказано, використовується з налаштувань.
     * @returns Перекладений текст або null у разі помилки/вимкнення.
     */
    translate(text, targetLang) {
        return __awaiter(this, void 0, void 0, function* () {
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
                        return yield this._translateWithGoogle(text, finalTargetLang, apiKey);
                    case 'ollama':
                        const model = this.plugin.settings.ollamaTranslationModel;
                        if (!model) {
                            new Notice("Ollama translation model is not selected in settings.");
                            this.plugin.logger.error("[TranslationService] Ollama translation model missing.");
                            return null;
                        }
                        return yield this._translateWithOllama(text, finalTargetLang, model);
                    default:
                        this.plugin.logger.warn(`[TranslationService] Unknown translation provider: ${provider}`);
                        return null;
                }
            }
            catch (error) {
                this.plugin.logger.error(`[TranslationService] General translation error for provider ${provider}:`, error);
                new Notice(`Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                return null;
            }
        });
    }
    /**
     * Переклад за допомогою Google Translate API.
     */
    _translateWithGoogle(text, targetLang, apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            if (targetLang === 'English') {
                targetLang = 'en'; // Google API вимагає код мови, а не назву
            }
            this.plugin.logger.debug(`[_translateWithGoogle] Translating to ${targetLang}...`);
            try {
                const response = yield fetch(`${GOOGLE_TRANSLATE_API_URL}?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ q: text, target: targetLang, format: 'text' }),
                });
                const data = yield response.json();
                if (!response.ok) {
                    const errorMsg = ((_a = data.error) === null || _a === void 0 ? void 0 : _a.message) || `HTTP error ${response.status}`;
                    throw new Error(`Google API Error: ${errorMsg}`);
                }
                if ((_d = (_c = (_b = data.data) === null || _b === void 0 ? void 0 : _b.translations) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.translatedText) {
                    const translatedText = this.decodeHtmlEntities(data.data.translations[0].translatedText);
                    this.plugin.logger.debug("[_translateWithGoogle] Translation successful.");
                    return translatedText;
                }
                else {
                    this.plugin.logger.error("[_translateWithGoogle] Unexpected response structure:", data);
                    throw new Error("Unexpected response structure from Google API.");
                }
            }
            catch (error) {
                this.plugin.logger.error("[_translateWithGoogle] API call failed:", error);
                // Помилка буде оброблена в головному методі translate
                throw error; // Перекидаємо помилку далі
            }
        });
    }
    /**
     * Переклад за допомогою моделі Ollama.
     */
    _translateWithOllama(text, targetLang, model) {
        return __awaiter(this, void 0, void 0, function* () {
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
                const responseData = yield this.plugin.ollamaService.generateRaw(requestBody);
                if (responseData && responseData.response) {
                    const translatedText = responseData.response.trim();
                    // Додаткова обробка відповіді (видалення можливих префіксів/суфіксів), якщо модель їх додає
                    this.plugin.logger.debug(`[_translateWithOllama] Translation successful. Result length: ${translatedText.length}`);
                    return translatedText;
                }
                else {
                    this.plugin.logger.warn("[_translateWithOllama] Received empty response from Ollama model.");
                    // Повертаємо null, а не кидаємо помилку, щоб відрізнити від проблем з мережею
                    return null;
                }
            }
            catch (error) {
                this.plugin.logger.error(`[_translateWithOllama] Ollama request failed for model ${model}:`, error);
                // Помилка буде оброблена в головному методі translate
                throw error; // Перекидаємо помилку далі
            }
        });
    }
    // Допоміжна функція декодування HTML (без змін)
    decodeHtmlEntities(text) {
        if (typeof document !== 'undefined') {
            const textArea = document.createElement("textarea");
            textArea.innerHTML = text;
            return textArea.value;
        }
        else {
            return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVHJhbnNsYXRpb25TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiVHJhbnNsYXRpb25TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFFQSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQ2xDLE9BQU8sRUFBdUIsU0FBUyxFQUFFLE1BQU0sWUFBWSxDQUFDLENBQUMsa0JBQWtCO0FBRS9FLE1BQU0sd0JBQXdCLEdBQUcsMERBQTBELENBQUM7QUFFNUYsTUFBTSxPQUFPLGtCQUFrQjtJQUczQixZQUFZLE1BQW9CO1FBQzVCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNHLFNBQVMsQ0FBQyxJQUFZLEVBQUUsVUFBbUI7O1lBQzdDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDO1lBQzFELE1BQU0sZUFBZSxHQUFHLFVBQVUsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyx5QkFBeUIsQ0FBQztZQUVyRixJQUFJLFFBQVEsS0FBSyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO2dCQUNqRSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsa0VBQWtFLENBQUMsQ0FBQztnQkFDN0YsT0FBTyxJQUFJLENBQUM7WUFDaEIsQ0FBQztZQUVELElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxDQUFDLENBQUM7Z0JBQ3RFLE9BQU8sRUFBRSxDQUFDLENBQUMsaURBQWlEO1lBQ2pFLENBQUM7WUFFRCxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JB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b0JBQ0osSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLG1FQUFtRSxDQUFDLENBQUM7b0JBQzdGLDhFQUE4RTtvQkFDOUUsT0FBTyxJQUFJLENBQUM7Z0JBQ2hCLENBQUM7WUFDTCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDWixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsMERBQTBELEtBQUssR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNyRyxzREFBc0Q7Z0JBQ3RELE1BQU0sS0FBSyxDQUFDLENBQUMsMkJBQTJCO1lBQzVDLENBQUM7UUFDTCxDQUFDO0tBQUE7SUFFRCxnREFBZ0Q7SUFDeEMsa0JBQWtCLENBQUMsSUFBWTtRQUNuQyxJQUFJLE9BQU8sUUFBUSxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQ2xDLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDcEQsUUFBUSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7WUFDMUIsT0FBTyxRQUFRLENBQUMsS0FBSyxDQUFDO1FBQzFCLENBQUM7YUFBTSxDQUFDO1lBQ0osT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2xJLENBQUM7SUFDTCxDQUFDO0NBQ0oiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBzcmMvVHJhbnNsYXRpb25TZXJ2aWNlLnRzXG5pbXBvcnQgT2xsYW1hUGx1Z2luIGZyb20gJy4vbWFpbic7XG5pbXBvcnQgeyBOb3RpY2UgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgeyBUcmFuc2xhdGlvblByb3ZpZGVyLCBMQU5HVUFHRVMgfSBmcm9tICcuL3NldHRpbmdzJzsgLy8g0IbQvNC/0L7RgNGC0YPRlNC80L4g0YLQuNC/0LhcblxuY29uc3QgR09PR0xFX1RSQU5TTEFURV9BUElfVVJMID0gJ2h0dHBzOi8vdHJhbnNsYXRpb24uZ29vZ2xlYXBpcy5jb20vbGFuZ3VhZ2UvdHJhbnNsYXRlL3YyJztcblxuZXhwb3J0IGNsYXNzIFRyYW5zbGF0aW9uU2VydmljZSB7XG4gICAgcHJpdmF0ZSBwbHVnaW46IE9sbGFtYVBsdWdpbjtcblxuICAgIGNvbnN0cnVjdG9yKHBsdWdpbjogT2xsYW1hUGx1Z2luKSB7XG4gICAgICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqINCT0L7Qu9C+0LLQvdC40Lkg0LzQtdGC0L7QtCDQtNC70Y8g0L/QtdGA0LXQutC70LDQtNGDINGC0LXQutGB0YLRgy4g0JLQuNCx0LjRgNCw0ZQg0L/RgNC+0LLQsNC50LTQtdGA0LAg0L3QsCDQvtGB0L3QvtCy0ZYg0L3QsNC70LDRiNGC0YPQstCw0L3RjC5cbiAgICAgKiBAcGFyYW0gdGV4dCDQotC10LrRgdGCINC00LvRjyDQv9C10YDQtdC60LvQsNC00YMuXG4gICAgICogQHBhcmFtIHRhcmdldExhbmcg0JrQvtC0INGG0ZbQu9GM0L7QstC+0Zcg0LzQvtCy0LggKGUuZy4sICd1aycsICdlbicpLiDQr9C60YnQviDQvdC1INCy0LrQsNC30LDQvdC+LCDQstC40LrQvtGA0LjRgdGC0L7QstGD0ZTRgtGM0YHRjyDQtyDQvdCw0LvQsNGI0YLRg9Cy0LDQvdGMLlxuICAgICAqIEByZXR1cm5zINCf0LXRgNC10LrQu9Cw0LTQtdC90LjQuSDRgtC10LrRgdGCINCw0LHQviBudWxsINGDINGA0LDQt9GWINC/0L7QvNC40LvQutC4L9Cy0LjQvNC60L3QtdC90L3Rjy5cbiAgICAgKi9cbiAgICBhc3luYyB0cmFuc2xhdGUodGV4dDogc3RyaW5nLCB0YXJnZXRMYW5nPzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MudHJhbnNsYXRpb25Qcm92aWRlcjtcbiAgICAgICAgY29uc3QgZmluYWxUYXJnZXRMYW5nID0gdGFyZ2V0TGFuZyB8fCB0aGlzLnBsdWdpbi5zZXR0aW5ncy50cmFuc2xhdGlvblRhcmdldExhbmd1YWdlO1xuXG4gICAgICAgIGlmIChwcm92aWRlciA9PT0gJ25vbmUnIHx8ICF0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVUcmFuc2xhdGlvbikge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFwiW1RyYW5zbGF0aW9uU2VydmljZV0gVHJhbnNsYXRpb24gZGlzYWJsZWQgb3IgcHJvdmlkZXIgaXMgJ25vbmUnLlwiKTtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0ZXh0IHx8ICF0ZXh0LnRyaW0oKSkge1xuICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIltUcmFuc2xhdGlvblNlcnZpY2VdIElucHV0IHRleHQgaXMgZW1wdHkuXCIpO1xuICAgICAgICAgICAgIHJldHVybiBcIlwiOyAvLyDQn9C+0LLQtdGA0YLQsNGU0LzQviDQv9C+0YDQvtC20L3RltC5INGA0Y/QtNC+0Log0LTQu9GPINC/0L7RgNC+0LbQvdGM0L7Qs9C+INCy0LLQvtC00YNcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZmluYWxUYXJnZXRMYW5nKSB7XG4gICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW1RyYW5zbGF0aW9uU2VydmljZV0gVGFyZ2V0IGxhbmd1YWdlIGlzIG5vdCBkZWZpbmVkLlwiKTtcbiAgICAgICAgICAgICBuZXcgTm90aWNlKFwiVHJhbnNsYXRpb24gRXJyb3I6IFRhcmdldCBsYW5ndWFnZSBub3QgY29uZmlndXJlZC5cIik7XG4gICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5pbmZvKGBbVHJhbnNsYXRpb25TZXJ2aWNlXSBSZXF1ZXN0aW5nIHRyYW5zbGF0aW9uIHZpYSAnJHtwcm92aWRlcn0nIHRvICcke2ZpbmFsVGFyZ2V0TGFuZ30nLmApO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBzd2l0Y2ggKHByb3ZpZGVyKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnZ29vZ2xlJzpcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXBpS2V5ID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MuZ29vZ2xlVHJhbnNsYXRpb25BcGlLZXk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghYXBpS2V5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiR29vZ2xlIFRyYW5zbGF0aW9uIEFQSSBLZXkgaXMgbm90IGNvbmZpZ3VyZWQuXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW1RyYW5zbGF0aW9uU2VydmljZV0gR29vZ2xlIEFQSSBLZXkgbWlzc2luZy5cIik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5fdHJhbnNsYXRlV2l0aEdvb2dsZSh0ZXh0LCBmaW5hbFRhcmdldExhbmcsIGFwaUtleSk7XG4gICAgICAgICAgICAgICAgY2FzZSAnb2xsYW1hJzpcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1vZGVsID0gdGhpcy5wbHVnaW4uc2V0dGluZ3Mub2xsYW1hVHJhbnNsYXRpb25Nb2RlbDtcbiAgICAgICAgICAgICAgICAgICAgIGlmICghbW9kZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJPbGxhbWEgdHJhbnNsYXRpb24gbW9kZWwgaXMgbm90IHNlbGVjdGVkIGluIHNldHRpbmdzLlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIltUcmFuc2xhdGlvblNlcnZpY2VdIE9sbGFtYSB0cmFuc2xhdGlvbiBtb2RlbCBtaXNzaW5nLlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLl90cmFuc2xhdGVXaXRoT2xsYW1hKHRleHQsIGZpbmFsVGFyZ2V0TGFuZywgbW9kZWwpO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbVHJhbnNsYXRpb25TZXJ2aWNlXSBVbmtub3duIHRyYW5zbGF0aW9uIHByb3ZpZGVyOiAke3Byb3ZpZGVyfWApO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoYFtUcmFuc2xhdGlvblNlcnZpY2VdIEdlbmVyYWwgdHJhbnNsYXRpb24gZXJyb3IgZm9yIHByb3ZpZGVyICR7cHJvdmlkZXJ9OmAsIGVycm9yKTtcbiAgICAgICAgICAgICBuZXcgTm90aWNlKGBUcmFuc2xhdGlvbiBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiDQn9C10YDQtdC60LvQsNC0INC30LAg0LTQvtC/0L7QvNC+0LPQvtGOIEdvb2dsZSBUcmFuc2xhdGUgQVBJLlxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgX3RyYW5zbGF0ZVdpdGhHb29nbGUodGV4dDogc3RyaW5nLCB0YXJnZXRMYW5nOiBzdHJpbmcsIGFwaUtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgICAgIGlmICh0YXJnZXRMYW5nID09PSAnRW5nbGlzaCcpIHtcbiAgICAgICAgICAgIHRhcmdldExhbmcgPSAnZW4nOyAvLyBHb29nbGUgQVBJINCy0LjQvNCw0LPQsNGUINC60L7QtCDQvNC+0LLQuCwg0LAg0L3QtSDQvdCw0LfQstGDXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbX3RyYW5zbGF0ZVdpdGhHb29nbGVdIFRyYW5zbGF0aW5nIHRvICR7dGFyZ2V0TGFuZ30uLi5gKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7R09PR0xFX1RSQU5TTEFURV9BUElfVVJMfT9rZXk9JHthcGlLZXl9YCwge1xuICAgICAgICAgICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICAgICAgICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LFxuICAgICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcTogdGV4dCwgdGFyZ2V0OiB0YXJnZXRMYW5nLCBmb3JtYXQ6ICd0ZXh0JyB9KSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXJyb3JNc2cgPSBkYXRhLmVycm9yPy5tZXNzYWdlIHx8IGBIVFRQIGVycm9yICR7cmVzcG9uc2Uuc3RhdHVzfWA7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHb29nbGUgQVBJIEVycm9yOiAke2Vycm9yTXNnfWApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZGF0YS5kYXRhPy50cmFuc2xhdGlvbnM/LlswXT8udHJhbnNsYXRlZFRleHQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0cmFuc2xhdGVkVGV4dCA9IHRoaXMuZGVjb2RlSHRtbEVudGl0aWVzKGRhdGEuZGF0YS50cmFuc2xhdGlvbnNbMF0udHJhbnNsYXRlZFRleHQpO1xuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIltfdHJhbnNsYXRlV2l0aEdvb2dsZV0gVHJhbnNsYXRpb24gc3VjY2Vzc2Z1bC5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRyYW5zbGF0ZWRUZXh0O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbX3RyYW5zbGF0ZVdpdGhHb29nbGVdIFVuZXhwZWN0ZWQgcmVzcG9uc2Ugc3RydWN0dXJlOlwiLCBkYXRhKTtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmV4cGVjdGVkIHJlc3BvbnNlIHN0cnVjdHVyZSBmcm9tIEdvb2dsZSBBUEkuXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW190cmFuc2xhdGVXaXRoR29vZ2xlXSBBUEkgY2FsbCBmYWlsZWQ6XCIsIGVycm9yKTtcbiAgICAgICAgICAgIC8vINCf0L7QvNC40LvQutCwINCx0YPQtNC1INC+0LHRgNC+0LHQu9C10L3QsCDQsiDQs9C+0LvQvtCy0L3QvtC80YMg0LzQtdGC0L7QtNGWIHRyYW5zbGF0ZVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7IC8vINCf0LXRgNC10LrQuNC00LDRlNC80L4g0L/QvtC80LjQu9C60YMg0LTQsNC70ZZcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqINCf0LXRgNC10LrQu9Cw0LQg0LfQsCDQtNC+0L/QvtC80L7Qs9C+0Y4g0LzQvtC00LXQu9GWIE9sbGFtYS5cbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIF90cmFuc2xhdGVXaXRoT2xsYW1hKHRleHQ6IHN0cmluZywgdGFyZ2V0TGFuZzogc3RyaW5nLCBtb2RlbDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW190cmFuc2xhdGVXaXRoT2xsYW1hXSBUcmFuc2xhdGluZyB0byAke3RhcmdldExhbmd9IHVzaW5nIG1vZGVsICR7bW9kZWx9Li4uYCk7XG5cbiAgICAgICAgY29uc3QgdGFyZ2V0TGFuZ05hbWUgPSBMQU5HVUFHRVNbdGFyZ2V0TGFuZ10gfHwgdGFyZ2V0TGFuZzsgLy8g0J7RgtGA0LjQvNGD0ZTQvNC+INC/0L7QstC90YMg0L3QsNC30LLRgyDQvNC+0LLQuCDQtNC70Y8g0L/RgNC+0LzQv9GC0YNcblxuICAgICAgICAvLyBUT0RPOiDQn9C+0YLRgNGW0LHQtdC9INC80LXRhdCw0L3RltC30Lwg0LLQuNC30L3QsNGH0LXQvdC90Y8g0LzQvtCy0Lgg0LTQttC10YDQtdC70LAgKHNvdXJjZUxhbmcpXG4gICAgICAgIC8vINCd0LDRgNCw0LfRliDQv9GA0LjQv9GD0YHQutCw0ZTQvNC+LCDRidC+INC00LbQtdGA0LXQu9C+IC0g0LzQvtCy0LAg0ZbQvdGC0LXRgNGE0LXQudGB0YMg0LDQsdC+INCw0L3Qs9C70ZbQudGB0YzQutCwXG4gICAgICAgIC8vIGNvbnN0IHNvdXJjZUxhbmdOYW1lID0gXCJFbmdsaXNoXCI7IC8vINCQ0LHQviDQstC40LfQvdCw0YfQuNGC0Lgg0LTQuNC90LDQvNGW0YfQvdC+XG5cbiAgICAgICAgLy8g0JTRg9C20LUg0L/RgNC+0YHRgtC40Lkg0L/RgNC+0LzQv9GCLiDQnNC+0LbQu9C40LLQviwg0L/QvtGC0YDQtdCx0YPRlCDQtNC+0L7Qv9GA0LDRhtGO0LLQsNC90L3RjyDQtNC70Y8g0LrQvtC90LrRgNC10YLQvdC40YUg0LzQvtC00LXQu9C10LkuXG4gICAgICAgIGNvbnN0IHByb21wdCA9IGBUcmFuc2xhdGUgdGhlIGZvbGxvd2luZyB0ZXh0IHRvICR7dGFyZ2V0TGFuZ05hbWV9LiBPdXRwdXQgT05MWSB0aGUgdHJhbnNsYXRlZCB0ZXh0LCB3aXRob3V0IGFueSBpbnRyb2R1Y3Rpb24gb3IgZXhwbGFuYXRpb24uXFxuXFxuVGV4dDpcXG5cIlwiXCJcXG4ke3RleHR9XFxuXCJcIlwiXFxuXFxuVHJhbnNsYXRlZCBUZXh0OmA7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlcXVlc3RCb2R5ID0ge1xuICAgICAgICAgICAgICAgIG1vZGVsOiBtb2RlbCxcbiAgICAgICAgICAgICAgICBwcm9tcHQ6IHByb21wdCxcbiAgICAgICAgICAgICAgICBzdHJlYW06IGZhbHNlLCAvLyDQlNC70Y8g0L/QtdGA0LXQutC70LDQtNGDINC30LDQt9Cy0LjRh9Cw0Lkg0L3QtSDQv9C+0YLRgNGW0LHQtdC9INGB0YLRgNGW0LzRltC90LNcbiAgICAgICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgICAgIHRlbXBlcmF0dXJlOiAwLjIsIC8vINCd0LjQt9GM0LrQsCDRgtC10LzQv9C10YDQsNGC0YPRgNCwINC00LvRjyDQsdGW0LvRjNGIINGC0L7Rh9C90L7Qs9C+INC/0LXRgNC10LrQu9Cw0LTRg1xuICAgICAgICAgICAgICAgICAgICBudW1fcHJlZGljdDogMTAyNCwgLy8g0J7QsdC80LXQttC10L3QvdGPINC00L7QstC20LjQvdC4INCy0ZbQtNC/0L7QstGW0LTRliAo0LzQvtC20L3QsCDQvdCw0LvQsNGI0YLRg9Cy0LDRgtC4KVxuICAgICAgICAgICAgICAgICAgICAvLyDQnNC+0LbQvdCwINC00L7QtNCw0YLQuCBzdG9wIHRva2Vucywg0Y/QutGJ0L4g0LzQvtC00LXQu9GMINC00L7QtNCw0ZQg0LfQsNC50LLQtVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIlNlbmRpbmcgdHJhbnNsYXRpb24gcmVxdWVzdCB0byBPbGxhbWE6XCIsIHJlcXVlc3RCb2R5KTtcbiAgICAgICAgICAgIC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4g0ZbRgdC90YPRjtGH0LjQuSDRgdC10YDQstGW0YEgT2xsYW1hXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZURhdGEgPSBhd2FpdCB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdlbmVyYXRlUmF3KHJlcXVlc3RCb2R5KTtcblxuICAgICAgICAgICAgaWYgKHJlc3BvbnNlRGF0YSAmJiByZXNwb25zZURhdGEucmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0cmFuc2xhdGVkVGV4dCA9IHJlc3BvbnNlRGF0YS5yZXNwb25zZS50cmltKCk7XG4gICAgICAgICAgICAgICAgLy8g0JTQvtC00LDRgtC60L7QstCwINC+0LHRgNC+0LHQutCwINCy0ZbQtNC/0L7QstGW0LTRliAo0LLQuNC00LDQu9C10L3QvdGPINC80L7QttC70LjQstC40YUg0L/RgNC10YTRltC60YHRltCyL9GB0YPRhNGW0LrRgdGW0LIpLCDRj9C60YnQviDQvNC+0LTQtdC70Ywg0ZfRhSDQtNC+0LTQsNGUXG4gICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW190cmFuc2xhdGVXaXRoT2xsYW1hXSBUcmFuc2xhdGlvbiBzdWNjZXNzZnVsLiBSZXN1bHQgbGVuZ3RoOiAke3RyYW5zbGF0ZWRUZXh0Lmxlbmd0aH1gKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJhbnNsYXRlZFRleHQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKFwiW190cmFuc2xhdGVXaXRoT2xsYW1hXSBSZWNlaXZlZCBlbXB0eSByZXNwb25zZSBmcm9tIE9sbGFtYSBtb2RlbC5cIik7XG4gICAgICAgICAgICAgICAgLy8g0J/QvtCy0LXRgNGC0LDRlNC80L4gbnVsbCwg0LAg0L3QtSDQutC40LTQsNGU0LzQviDQv9C+0LzQuNC70LrRgywg0YnQvtCxINCy0ZbQtNGA0ZbQt9C90LjRgtC4INCy0ZbQtCDQv9GA0L7QsdC70LXQvCDQtyDQvNC10YDQtdC20LXRjlxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihgW190cmFuc2xhdGVXaXRoT2xsYW1hXSBPbGxhbWEgcmVxdWVzdCBmYWlsZWQgZm9yIG1vZGVsICR7bW9kZWx9OmAsIGVycm9yKTtcbiAgICAgICAgICAgIC8vINCf0L7QvNC40LvQutCwINCx0YPQtNC1INC+0LHRgNC+0LHQu9C10L3QsCDQsiDQs9C+0LvQvtCy0L3QvtC80YMg0LzQtdGC0L7QtNGWIHRyYW5zbGF0ZVxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7IC8vINCf0LXRgNC10LrQuNC00LDRlNC80L4g0L/QvtC80LjQu9C60YMg0LTQsNC70ZZcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vINCU0L7Qv9C+0LzRltC20L3QsCDRhNGD0L3QutGG0ZbRjyDQtNC10LrQvtC00YPQstCw0L3QvdGPIEhUTUwgKNCx0LXQtyDQt9C80ZbQvSlcbiAgICBwcml2YXRlIGRlY29kZUh0bWxFbnRpdGllcyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICBpZiAodHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY29uc3QgdGV4dEFyZWEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGV4dGFyZWFcIik7XG4gICAgICAgICAgICB0ZXh0QXJlYS5pbm5lckhUTUwgPSB0ZXh0O1xuICAgICAgICAgICAgcmV0dXJuIHRleHRBcmVhLnZhbHVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRleHQucmVwbGFjZSgvJmFtcDsvZywgJyYnKS5yZXBsYWNlKC8mbHQ7L2csICc8JykucmVwbGFjZSgvJmd0Oy9nLCAnPicpLnJlcGxhY2UoLyZxdW90Oy9nLCAnXCInKS5yZXBsYWNlKC8mIzM5Oy9nLCBcIidcIik7XG4gICAgICAgIH1cbiAgICB9XG59Il19