// src/renderers/BaseMessageRenderer.ts
import { App, MarkdownRenderer, setIcon } from "obsidian";
import { Message } from "../types";
import OllamaPlugin from "../main";
import { OllamaView } from "../OllamaView"; // Потрібно для контексту та утиліт
import { CSS_CLASSES } from "../constants";
import * as RendererUtils from "../MessageRendererUtils"; // Утиліти рендерингу
import { IMessageRenderer } from "./IMessageRenderer";

export abstract class BaseMessageRenderer implements IMessageRenderer {
	protected readonly app: App;
	protected readonly plugin: OllamaPlugin;
	protected readonly message: Message;
	protected readonly view: OllamaView;

	constructor(app: App, plugin: OllamaPlugin, message: Message, view: OllamaView) {
		this.app = app;
		this.plugin = plugin;
		this.message = message;
		this.view = view; // Зберігаємо контекст View
	}

	// Абстрактний метод, який повинні реалізувати підкласи
	abstract render(): Promise<HTMLElement> | HTMLElement;

	/**
	 * Створює базову обгортку для групи повідомлень (div.message-group).
	 * Встановлює часову мітку як атрибут.
	 * @param groupClasses - Додаткові CSS класи для групи (наприклад, user-message-group).
	 * @returns Створений HTMLElement групи.
	 */
	protected createMessageGroupWrapper(groupClasses: string[] = []): HTMLElement {
		const messageGroup = document.createElement("div");
		messageGroup.classList.add(CSS_CLASSES.MESSAGE_GROUP, ...groupClasses);
		messageGroup.setAttribute("data-timestamp", this.message.timestamp.getTime().toString());
		return messageGroup;
	}

	/**
	 * Створює та додає елемент мітки часу до вказаного батьківського елемента.
	 * @param parentElement - Елемент, куди додати мітку часу (зазвичай сама "бульбашка" повідомлення).
	 */
	protected addTimestamp(parentElement: HTMLElement): void {
		parentElement.createDiv({
			cls: CSS_CLASSES.TIMESTAMP,
			text: this.view.formatTime(this.message.timestamp), // Використовуємо метод форматування з View
		});
	}

	/**
	 * Додає аватар користувача або асистента до групи повідомлень.
	 * @param messageGroup - Елемент групи повідомлень.
	 * @param isUser - Чи це повідомлення користувача (true) чи асистента (false).
	 */
	protected addAvatar(messageGroup: HTMLElement, isUser: boolean): void {
		RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, isUser);
	}

	/**
	 * Додає стандартні кнопки дій (Копіювати, Видалити) до обгортки повідомлення.
	 * Специфічні кнопки (Translate, Summarize, Regenerate) додаються в підкласах.
	 * @param messageWrapper - Обгортка повідомлення (div.message-wrapper).
	 * @param contentToCopy - Текст, який буде скопійовано.
	 */
	protected addBaseActionButtons(messageWrapper: HTMLElement, contentToCopy: string): void {
		const buttonsWrapper = messageWrapper.createDiv({ cls: "message-actions-wrapper" });

		// Copy Button
		const copyBtn = buttonsWrapper.createEl("button", {
			cls: CSS_CLASSES.COPY_BUTTON, // Використовуємо константу
			attr: { "aria-label": "Copy", title: "Copy" },
		});
		setIcon(copyBtn, "copy");
		this.view.registerDomEvent(copyBtn, "click", e => {
			e.stopPropagation();
			// Важливо: Передаємо оригінальний, необроблений контент для копіювання,
			// якщо тільки не потрібно видаляти <think> теги специфічно (це робить Assistant renderer)
			this.view.handleCopyClick(contentToCopy, copyBtn);
		});

		// Delete Button
		const deleteBtn = buttonsWrapper.createEl("button", {
			cls: [CSS_CLASSES.DELETE_MESSAGE_BUTTON, CSS_CLASSES.DANGER_OPTION], // Використовуємо константи
			attr: { "aria-label": "Delete message", title: "Delete Message" },
		});
		setIcon(deleteBtn, "trash");
		this.view.registerDomEvent(deleteBtn, "click", e => {
			e.stopPropagation();
			this.view.handleDeleteMessageClick(this.message);
		});
	}

    /**
     * Створює основну "бульбашку" повідомлення та контейнери для контенту.
     * @param messageWrapper - Обгортка повідомлення (div.message-wrapper).
     * @param messageClasses - Додаткові CSS класи для самої бульбашки повідомлення.
     * @returns Об'єкт з посиланнями на створені елементи: messageEl, contentContainer, contentEl.
     */
    protected createMessageBubble(messageWrapper: HTMLElement, messageClasses: string[] = []): {
        messageEl: HTMLElement;
        contentContainer: HTMLElement;
        contentEl: HTMLElement;
    } {
        const messageEl = messageWrapper.createDiv({
            cls: [CSS_CLASSES.MESSAGE, ...messageClasses],
        });
        const contentContainer = messageEl.createDiv({ cls: CSS_CLASSES.CONTENT_CONTAINER });
        const contentEl = contentContainer.createDiv({ cls: CSS_CLASSES.CONTENT });
        return { messageEl, contentContainer, contentEl };
    }
}