// src/SummaryModal.ts
import { App, Modal, Setting, ButtonComponent, Notice } from "obsidian";
import OllamaPlugin from "./main"; // Імпортуємо головний клас плагіна

export class SummaryModal extends Modal {
    plugin: OllamaPlugin; // <--- Зберігаємо екземпляр плагіна
    summaryText: string;
    modalTitle: string;
    private summaryContainer: HTMLDivElement; // Зберігаємо посилання для оновлення

    constructor(plugin: OllamaPlugin, title: string, summary: string) { // <--- Змінено конструктор
        super(plugin.app); // Передаємо app з плагіна
        this.plugin = plugin; // Зберігаємо плагін
        this.modalTitle = title;
        this.summaryText = summary;
    }

    async onOpen() { // Зробимо асинхронним для перекладу
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h3", { text: this.modalTitle });

        // Контейнер для тексту сумаризації
        this.summaryContainer = contentEl.createDiv({ cls: "summary-modal-content" });
        this.summaryContainer.setText(this.summaryText);

        // Стилі для контейнера
        this.summaryContainer.style.maxHeight = "60vh";
        this.summaryContainer.style.overflowY = "auto";
        this.summaryContainer.style.whiteSpace = "pre-wrap";
        this.summaryContainer.style.backgroundColor = "var(--background-secondary)";
        this.summaryContainer.style.padding = "10px";
        this.summaryContainer.style.borderRadius = "5px";
        this.summaryContainer.style.border = "1px solid var(--background-modifier-border)";
        this.summaryContainer.style.marginBottom = "15px";
        this.summaryContainer.style.userSelect = "text";

        // Створюємо контейнер для кнопок
        const buttonContainer = new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Copy") // Скорочено
                .setTooltip("Copy summary to clipboard")
                .setIcon("copy") // Додаємо іконку
                .onClick(() => {
                    navigator.clipboard.writeText(this.summaryText).then(() => {
                        new Notice("Summary copied!");
                    }, (err) => {
                        new Notice("Failed to copy summary.");
                        this.plugin.logger.error("Copy summary error:", err);
                    });
                    // Не закриваємо модалку при копіюванні
                    // this.close();
                }));

        // --- ДОДАНО: Кнопка Перекладу ---
        if (this.plugin.settings.enableTranslation && this.plugin.settings.googleTranslationApiKey) {
            buttonContainer.addButton(translateBtn => {
                 translateBtn
                    .setButtonText("Translate")
                    .setTooltip(`Translate to ${this.plugin.settings.translationTargetLanguage}`)
                    .setIcon("languages")
                    .onClick(async () => {
                        const targetLang = this.plugin.settings.translationTargetLanguage;
                         if (!targetLang) {
                              new Notice("Target translation language not set in settings.");
                              return;
                         }

                         // Встановлюємо стан завантаження
                         translateBtn.setButtonText("Translating...");
                         translateBtn.setDisabled(true);
                         translateBtn.setIcon("loader"); // Анімація завантаження

                         try {
                              const translatedSummary = await this.plugin.translationService.translate(this.summaryText, targetLang);
                              if (translatedSummary !== null) {
                                   // Оновлюємо текст в контейнері
                                    this.summaryContainer.setText(translatedSummary);
                                    // Оновлюємо текст, який копіюється
                                    this.summaryText = translatedSummary;
                                    new Notice(`Summary translated to ${targetLang}`);
                              } else {
                                   // Повідомлення про помилку покаже сам translationService
                              }
                         } catch (error) {
                              this.plugin.logger.error("Error translating summary in modal:", error);
                              new Notice("Translation failed.");
                         } finally {
                              // Відновлюємо кнопку
                              translateBtn.setButtonText("Translate");
                              translateBtn.setDisabled(false);
                              translateBtn.setIcon("languages");
                         }
                    });
            });
        }
         // --- КІНЕЦЬ ДОДАНОГО ---


        // Кнопка закриття (завжди остання)
        buttonContainer.addButton(btn => btn
            .setButtonText("Close")
            .onClick(() => {
                this.close();
            }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}