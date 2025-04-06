// TranslationService.ts
import OllamaPlugin from './main';
import { Notice } from 'obsidian';

const GOOGLE_TRANSLATE_API_URL = 'https://translation.googleapis.com/language/translate/v2';

export class TranslationService {
    private plugin: OllamaPlugin;

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
    }

    /**
     * Translates text using the Google Translate API.
     * @param text The text to translate.
     * @param targetLang The target language code (e.g., 'uk', 'en', 'de').
     * @returns The translated text or null if translation fails.
     */
    async translate(text: string, targetLang: string): Promise<string | null> {
        const apiKey = this.plugin.settings.googleTranslationApiKey;

        if (!this.plugin.settings.enableTranslation) {
            console.warn("Translation feature is disabled in settings.");
            // Optional: new Notice("Translation feature is disabled.");
            return null;
        }

        if (!apiKey) {
            console.error("Google Translation API Key is missing.");
            new Notice("Translation Error: Google Cloud Translation API Key is not configured in settings.");
            return null;
        }

        if (!text) {
            console.warn("Translate called with empty text.");
            return ""; // Return empty string for empty input
        }
        if (!targetLang) {
            console.error("Target language is not set for translation.");
            new Notice("Translation Error: Target language not configured.");
            return null;
        }


        console.log(`[TranslationService] Translating to ${targetLang}...`);

        try {
            const response = await fetch(`${GOOGLE_TRANSLATE_API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    q: text,
                    target: targetLang,
                    format: 'text' // Request plain text translation
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                const errorMsg = data.error?.message || `HTTP error ${response.status}`;
                console.error(`Google Translate API error: ${errorMsg}`, data);
                new Notice(`Translation Error: ${errorMsg}`);
                return null;
            }

            if (data.data?.translations && data.data.translations.length > 0) {
                // Decode HTML entities potentially returned by the API
                const translatedText = this.decodeHtmlEntities(data.data.translations[0].translatedText);
                console.log("[TranslationService] Translation successful.");
                return translatedText;
            } else {
                console.error("Google Translate API returned unexpected response structure:", data);
                new Notice("Translation Error: Unexpected response from API.");
                return null;
            }

        } catch (error: any) {
            console.error("Error calling Google Translate API:", error);
            new Notice(`Translation Error: Failed to fetch. ${error.message}`);
            return null;
        }
    }

    // Helper to decode HTML entities (like &amp;, &lt;, etc.)
    private decodeHtmlEntities(text: string): string {
        if (typeof document !== 'undefined') { // Check if in browser environment
            const textArea = document.createElement("textarea");
            textArea.innerHTML = text;
            return textArea.value;
        } else {
            // Basic fallback for non-browser environments (might not cover all cases)
            return text
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
        }
    }
}