// src/SystemMessageRenderer.ts
import { App, setIcon } from 'obsidian';
import { Message } from './types'; // Або './OllamaView' якщо тип там
import {
    CSS_CLASS_MESSAGE_GROUP,
    CSS_CLASS_SYSTEM_GROUP,
    CSS_CLASS_MESSAGE,
    CSS_CLASS_SYSTEM_MESSAGE,
    CSS_CLASS_CONTENT_CONTAINER,
    CSS_CLASS_SYSTEM_ICON,
    CSS_CLASS_SYSTEM_TEXT,
    CSS_CLASS_TIMESTAMP
} from './OllamaView'; // Імпортуємо константи CSS з OllamaView

// Інтерфейс для функцій форматування, які передаються з OllamaView
interface MessageFormatter {
    formatTime: (date: Date) => string;
}

export class SystemMessageRenderer {
    private app: App;
    private message: Message;
    private formatter: MessageFormatter;
    public element: HTMLElement | null = null; // Зберігатимемо створений елемент

    constructor(app: App, message: Message, formatter: MessageFormatter) {
        if (message.role !== 'system') {
            throw new Error("SystemMessageRenderer can only handle messages with role 'system'.");
        }
        this.app = app;
        this.message = message;
        this.formatter = formatter;
    }

    /**
     * Створює DOM-структуру для системного повідомлення.
     * НЕ додає елемент до DOM чату, просто створює та повертає його.
     * @returns Корневий HTMLElement групи повідомлень.
     */
    render(): HTMLElement {
        const message = this.message; // Для зручності

        // 1. Створюємо головний контейнер групи
        const messageGroup = document.createElement('div');
        messageGroup.classList.add(CSS_CLASS_MESSAGE_GROUP, CSS_CLASS_SYSTEM_GROUP);
        messageGroup.setAttribute("data-timestamp", message.timestamp.getTime().toString());

        // 2. Створюємо обгортку для самого повідомлення (для консистентності структури)
        // У системних повідомлень немає аватара, тому обгортка простіша
        const messageWrapper = messageGroup.createDiv({ cls: "message-wrapper" });
        messageWrapper.style.order = "2"; // Зазвичай системні повідомлення йдуть по центру або зліва

        // 3. Створюємо "бульбашку" повідомлення
        const messageEl = messageWrapper.createDiv({ cls: `${CSS_CLASS_MESSAGE} ${CSS_CLASS_SYSTEM_MESSAGE}` });

        // 4. Контейнер для контенту (іконка + текст)
        const contentContainer = messageEl.createDiv({ cls: CSS_CLASS_CONTENT_CONTAINER });

        // 5. Додаємо іконку
        const iconSpan = contentContainer.createSpan({ cls: CSS_CLASS_SYSTEM_ICON });
        setIcon(iconSpan, "info"); // Або інша іконка для системних повідомлень

        // 6. Додаємо текст повідомлення
        contentContainer.createSpan({
            cls: CSS_CLASS_SYSTEM_TEXT,
            text: message.content,
        });

        // 7. Додаємо мітку часу до бульбашки
        messageEl.createDiv({
            cls: CSS_CLASS_TIMESTAMP,
            text: this.formatter.formatTime(message.timestamp), // Використовуємо переданий форматер
        });

        // 8. Зберігаємо посилання на створений елемент та повертаємо його
        this.element = messageGroup;
        return this.element;
    }

    // Тут можна додати методи-колбеки для специфічних дій системних повідомлень,
    // якщо вони знадобляться в майбутньому. Наприклад:
    // public handleSomeAction(): void {
    //    console.log("System message action for:", this.message.content);
    // }
}