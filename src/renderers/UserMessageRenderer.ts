// src/renderers/UserMessageRenderer.ts
import { BaseMessageRenderer } from "./BaseMessageRenderer";
import { CSS_CLASSES } from "../constants";
import { App, setIcon } from "obsidian";
import { Message } from "../types";
import OllamaPlugin from "../main";
import { OllamaView } from "../OllamaView";

// Константи, специфічні для користувача (якщо вони потрібні окремо)
const CSS_CLASS_USER_GROUP = "user-message-group";
const CSS_CLASS_USER_MESSAGE = "user-message";
const CSS_CLASS_REGENERATE_BUTTON = "regenerate-button"; // Повинна існувати в constants.ts або тут

export class UserMessageRenderer extends BaseMessageRenderer {

	constructor(app: App, plugin: OllamaPlugin, message: Message, view: OllamaView) {
		super(app, plugin, message, view);
		if (message.role !== "user") {
			throw new Error("UserMessageRenderer can only render messages with role 'user'.");
		}
	}

	public render(): HTMLElement {
		const messageGroup = this.createMessageGroupWrapper([CSS_CLASS_USER_GROUP]);

		this.addAvatar(messageGroup, true); // true for user

		const messageWrapper = messageGroup.createDiv({ cls: "message-wrapper" });
		messageWrapper.style.order = "1"; // User messages on the right

        // Створюємо бульбашку та контейнери
        const { messageEl, contentEl } = this.createMessageBubble(messageWrapper, [CSS_CLASS_USER_MESSAGE]);

		// Render simple text content for user messages, preserving line breaks
		this.message.content.split("\n").forEach((line, i, arr) => {
			contentEl.appendText(line);
			if (i < arr.length - 1) contentEl.createEl("br");
		});

		// Додаємо базові кнопки (Copy, Delete) та специфічну кнопку Regenerate
		this.addUserActionButtons(messageWrapper);

		// Додаємо мітку часу
        		                                    const metaActionsWrapper = messageEl.createDiv({ cls: "message-meta-actions-wrapper" });

              BaseMessageRenderer.addTimestampToElement(metaActionsWrapper, this.message.timestamp, this.view);

		return messageGroup;
	}

    /**
     * Додає кнопки дій, специфічні для повідомлення користувача (Regenerate, Copy, Delete).
     * @param messageWrapper - Обгортка повідомлення (div.message-wrapper).
     */
    private addUserActionButtons(messageWrapper: HTMLElement): void {
		const buttonsWrapper = messageWrapper.createDiv({ cls: "message-actions-wrapper" });
        const finalContent = this.message.content;

        // Regenerate Button
        const regenerateBtn = buttonsWrapper.createEl("button", {
            cls: CSS_CLASS_REGENERATE_BUTTON,
            attr: { title: "Regenerate response" },
        });
        setIcon(regenerateBtn, "refresh-cw");
        this.view.registerDomEvent(regenerateBtn, "click", e => {
            e.stopPropagation();
            this.view.handleRegenerateClick(this.message); // Call view's handler
        });

        // Copy Button
        const copyBtn = buttonsWrapper.createEl("button", {
            cls: CSS_CLASSES.COPY_BUTTON, // Використовуємо константу
            attr: { "aria-label": "Copy", title: "Copy" },
        });
        setIcon(copyBtn, "copy");
        this.view.registerDomEvent(copyBtn, "click", e => {
            e.stopPropagation();
            this.view.handleCopyClick(finalContent, copyBtn);
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
}