// src/SummaryModal.ts
import { App, Modal, Setting, ButtonComponent, Notice } from "obsidian";

export class SummaryModal extends Modal {
    summaryText: string;
    modalTitle: string;

    constructor(app: App, title: string, summary: string) {
        super(app);
        this.modalTitle = title;
        this.summaryText = summary;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty(); // Очищуємо вміст модалки

        contentEl.createEl("h3", { text: this.modalTitle });

        // Контейнер для тексту з можливістю прокрутки
        const summaryContainer = contentEl.createDiv({ cls: "summary-modal-content" });
        summaryContainer.setText(this.summaryText); // Просто показуємо текст

        // Стилі для контейнера (можна винести в CSS)
        summaryContainer.style.maxHeight = "60vh";
        summaryContainer.style.overflowY = "auto";
        summaryContainer.style.whiteSpace = "pre-wrap"; // Зберігаємо переноси рядків
        summaryContainer.style.backgroundColor = "var(--background-secondary)";
        summaryContainer.style.padding = "10px";
        summaryContainer.style.borderRadius = "5px";
        summaryContainer.style.border = "1px solid var(--background-modifier-border)";
        summaryContainer.style.marginBottom = "15px";
        summaryContainer.style.userSelect = "text"; // Дозволяємо виділення тексту

        // Додаємо кнопки
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Copy to Clipboard")
                .setCta() // Робить кнопку більш помітною
                .onClick(() => {
                    navigator.clipboard.writeText(this.summaryText).then(() => {
                        new Notice("Summary copied to clipboard!");
                    }, (err) => {
                        new Notice("Failed to copy summary.");
                        console.error("Copy summary error:", err);
                    });
                    this.close();
                }))
            .addButton(btn => btn
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