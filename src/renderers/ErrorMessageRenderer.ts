// src/renderers/ErrorMessageRenderer.ts
import { BaseMessageRenderer } from "./BaseMessageRenderer";
import { CSS_CLASSES } from "../constants";
import { App, setIcon } from "obsidian";
import { Message } from "../types";
import OllamaPlugin from "../main";
import { OllamaView } from "../OllamaView";

// Константи, специфічні для помилок
const CSS_CLASS_ERROR_GROUP = "error-message-group";
const CSS_CLASS_ERROR_MESSAGE = "error-message"; // Клас для самої бульбашки
const CSS_CLASS_ERROR_ICON = "error-icon"; // Клас для іконки всередині
const CSS_CLASS_ERROR_TEXT = "error-message-text"; // Клас для тексту всередині

export class ErrorMessageRenderer extends BaseMessageRenderer {

	constructor(app: App, plugin: OllamaPlugin, message: Message, view: OllamaView) {
		super(app, plugin, message, view);
		if (message.role !== "error") {
			throw new Error("ErrorMessageRenderer can only render messages with role 'error'.");
		}
	}

	/**
	 * Рендерить ОДНУ групу повідомлення про помилку.
	 * Логіка групування та сумаризації керується ззовні (наприклад, OllamaView).
	 */
	public render(): HTMLElement {
		const messageGroup = this.createMessageGroupWrapper([CSS_CLASS_ERROR_GROUP]);
		// Не додаємо аватар для помилок

		const messageWrapper = messageGroup.createDiv({ cls: "message-wrapper" });
        // messageWrapper.style.order = '2'; // Зліва, як асистент? Чи по центру?

        const { messageEl, contentContainer, contentEl } = this.createMessageBubble(messageWrapper, [CSS_CLASS_ERROR_MESSAGE]);
        contentEl.addClass(CSS_CLASS_ERROR_TEXT); // Клас для тексту помилки

		// Додаємо іконку помилки
		setIcon(contentContainer.createSpan({ cls: CSS_CLASS_ERROR_ICON, prepend: true }), "alert-triangle");

		// Встановлюємо текст помилки
		contentEl.setText(this.message.content);

		// Додаємо мітку часу
		BaseMessageRenderer.addTimestamp(messageEl, this.message.timestamp, this.view);
		// Додаємо базові кнопки дій (Copy, Delete) - опціонально для помилок?
		// this.addBaseActionButtons(messageWrapper, this.message.content);
        // Або тільки кнопку Copy?
        this.addErrorActionButtons(messageWrapper);


		return messageGroup;
	}

    /**
     * Додає кнопки дій, специфічні для повідомлення про помилку (наприклад, тільки Copy і Delete).
     * @param messageWrapper - Обгортка повідомлення (div.message-wrapper).
     */
     private addErrorActionButtons(messageWrapper: HTMLElement): void {
		const buttonsWrapper = messageWrapper.createDiv({ cls: "message-actions-wrapper" });
        const finalContent = this.message.content;

        // Copy Button
        const copyBtn = buttonsWrapper.createEl("button", {
            cls: CSS_CLASSES.COPY_BUTTON,
            attr: { "aria-label": "Copy Error", title: "Copy Error" },
        });
        setIcon(copyBtn, "copy");
        this.view.registerDomEvent(copyBtn, "click", e => {
            e.stopPropagation();
            this.view.handleCopyClick(finalContent, copyBtn);
        });

        // Delete Button
        const deleteBtn = buttonsWrapper.createEl("button", {
            cls: [CSS_CLASSES.DELETE_MESSAGE_BUTTON, CSS_CLASSES.DANGER_OPTION],
            attr: { "aria-label": "Delete message", title: "Delete Message" },
        });
        setIcon(deleteBtn, "trash");
        this.view.registerDomEvent(deleteBtn, "click", e => {
            e.stopPropagation();
            this.view.handleDeleteMessageClick(this.message);
        });
    }
}