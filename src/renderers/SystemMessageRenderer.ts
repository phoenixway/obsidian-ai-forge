// src/renderers/SystemMessageRenderer.ts
import { App, setIcon } from 'obsidian';
import { Message } from '../types'; // Переконайтесь, що шлях правильний
// Якщо у вас є специфічний тип для системних повідомлень з полем 'type':
// interface SystemMessage extends Message { type?: 'info' | 'warning' | 'error'; role: 'system' }
import { CSS_CLASSES } from '../constants';
import { BaseMessageRenderer } from './BaseMessageRenderer'; // Імпортуємо базовий клас
import OllamaPlugin from '../main';
import { OllamaView } from '../OllamaView';

// Константи, специфічні для системних повідомлень (переконайтесь, що вони є в CSS_CLASSES)
const CSS_CLASS_SYSTEM_GROUP = "system-message-group";
const CSS_CLASS_SYSTEM_MESSAGE = "system-message";
const CSS_CLASS_SYSTEM_ICON = "system-icon";
const CSS_CLASS_SYSTEM_TEXT = "system-message-text";

// Клас тепер успадковує BaseMessageRenderer
export class SystemMessageRenderer extends BaseMessageRenderer {

    // Оновлений конструктор
	constructor(app: App, plugin: OllamaPlugin, message: Message /* | SystemMessage */, view: OllamaView) {
		super(app, plugin, message, view); // Викликаємо конструктор базового класу
		if (message.role !== 'system') {
			throw new Error("SystemMessageRenderer can only render messages with role 'system'.");
		}
        // Немає потреби в this.formatter
	}

    /**
     * Визначає іконку на основі необов'язкової властивості 'type' у повідомленні.
     * За замовчуванням використовує 'info', якщо тип відсутній або не розпізнано.
     */
	private getIconType(): string {
        // Перевіряємо наявність 'type' у об'єкті повідомлення під час виконання
        // Використовуємо 'as any', щоб уникнути помилки компіляції, якщо стандартний тип Message не має 'type'
        const messageType = (this.message as any).type;
		switch (messageType) {
			case 'warning': return 'alert-triangle';
			case 'error': return 'alert-circle';
            // Явно обробляємо 'info' або використовуємо як значення за замовчуванням
            case 'info':
			default: return 'info'; // За замовчуванням для 'info' або невідомого/відсутнього типу
		}
	}

    /**
     * Рендерить елемент групи системного повідомлення.
     */
	render(): HTMLElement {
        // Використовуємо метод базового класу для створення обгортки групи
		const messageGroup = this.createMessageGroupWrapper([CSS_CLASSES.SYSTEM_GROUP]);
        // Аватар для системних повідомлень не потрібен

        // Створюємо "бульбашку" повідомлення - можна без messageWrapper, якщо позиціонування не потрібне,
        // але для консистентності структури можна залишити.
		const messageWrapper = messageGroup.createDiv({ cls: "message-wrapper" });

        // Створюємо основний елемент повідомлення
		const messageEl = messageWrapper.createDiv({ cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.SYSTEM_MESSAGE}` });

        // Створюємо контейнер для іконки та тексту
        const contentContainer = messageEl.createDiv({ cls: CSS_CLASSES.CONTENT_CONTAINER });

        // Додаємо іконку
		const iconSpan = contentContainer.createSpan({ cls: CSS_CLASSES.SYSTEM_ICON });
		setIcon(iconSpan, this.getIconType());

        // Додаємо текстовий контент
		contentContainer.createSpan({
			cls: CSS_CLASSES.SYSTEM_TEXT,
			text: this.message.content, // Беремо контент з protected властивості базового класу
		});

        // Додаємо мітку часу, використовуючи метод базового класу
		BaseMessageRenderer.addTimestamp(messageEl, this.message.timestamp, this.view);
        // Кнопки дій для системних повідомлень не потрібні

		return messageGroup; // Повертаємо створений елемент групи
	}
}