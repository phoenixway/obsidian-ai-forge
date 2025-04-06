// ConfirmModal.ts
import { App, Modal, Setting } from 'obsidian';

export class ConfirmModal extends Modal {
    constructor(
        app: App,
        public title: string,
        public message: string,
        public onConfirm: () => void // Функція, яка виконається при підтвердженні
    ) {
        super(app);
        this.title = title;
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl, titleEl } = this;

        // Встановлюємо заголовок модального вікна
        titleEl.setText(this.title);

        // Додаємо текст повідомлення
        contentEl.createEl('p', { text: this.message });

        // Додаємо кнопки налаштувань (виглядають як стандартні кнопки Obsidian)
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Confirm')
                .setCta() // Робить кнопку більш помітною (call to action)
                .onClick(() => {
                    this.onConfirm(); // Викликаємо передану функцію
                    this.close();     // Закриваємо вікно
                }))
            .addButton(button => button
                .setButtonText('Cancel')
                .onClick(() => {
                    this.close();     // Просто закриваємо вікно
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty(); // Очищуємо вміст при закритті
    }
}