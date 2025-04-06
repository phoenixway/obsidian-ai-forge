// PromptModal.ts
import { App, Modal, Setting, TextComponent } from 'obsidian';

export class PromptModal extends Modal {
    private inputValue: string;

    constructor(
        app: App,
        public title: string,
        public promptText: string,
        public initialValue: string = "",
        public onSubmit: (value: string) => void // Функція, яка приймає введене значення
    ) {
        super(app);
        this.title = title;
        this.promptText = promptText;
        this.inputValue = initialValue; // Початкове значення для поля вводу
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl, titleEl } = this;
        let textInput: TextComponent; // Зберігаємо посилання на поле вводу

        titleEl.setText(this.title);

        // Додаємо текст підказки (якщо є)
        if (this.promptText) {
            contentEl.createEl('p', { text: this.promptText });
        }

        // Додаємо поле для введення тексту
        new Setting(contentEl)
            .setName("New value:") // Назва поля (можна прибрати, якщо текст вище достатній)
            .addText(text => {
                textInput = text; // Зберігаємо посилання
                text.setValue(this.inputValue)
                    .onChange(value => {
                        this.inputValue = value; // Оновлюємо значення при зміні
                    });
                // Дозволяємо відправку по Enter
                text.inputEl.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault(); // Запобігаємо стандартній дії Enter
                        this.submitInput();
                    }
                });
            });

        // Додаємо кнопки
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Submit')
                .setCta()
                .onClick(this.submitInput)) // Викликаємо наш метод відправки
            .addButton(button => button
                .setButtonText('Cancel')
                .onClick(() => {
                    this.close();
                }));

        // Встановлюємо фокус на поле вводу при відкритті
        // Потрібно невелику затримку, щоб поле встигло відрендеритися
        setTimeout(() => {
            textInput?.inputEl?.focus();
            textInput?.inputEl?.select(); // Виділяємо початкове значення
        }, 50);

    }

    // Приватний метод для обробки відправки (щоб уникнути дублювання коду для кнопки та Enter)
    private submitInput = () => {
        // Перевіряємо, чи щось введено (опціонально)
        // if (!this.inputValue?.trim()) {
        //     new Notice("Please enter a value.");
        //     return;
        // }
        this.onSubmit(this.inputValue); // Передаємо значення у callback
        this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}