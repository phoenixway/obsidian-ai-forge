// src/renderers/UserMessageRenderer.ts
import { BaseMessageRenderer } from "./BaseMessageRenderer";
import { CSS_CLASSES } from "../constants";
import { App, setIcon } from "obsidian";
import { Message } from "../types";
import OllamaPlugin from "../main";
import { OllamaView } from "../OllamaView";
import * as RendererUtils from "../MessageRendererUtils"; // Додано, якщо потрібен renderAvatar

// Константи, специфічні для користувача, можуть бути в constants.ts
// const CSS_CLASS_USER_GROUP = "user-message-group"; // Вже є в CSS_CLASSES
// const CSS_CLASS_USER_MESSAGE = "user-message"; // Вже є в CSS_CLASSES
// const CSS_CLASS_REGENERATE_BUTTON = "regenerate-button"; // Вже є в CSS_CLASSES

export class UserMessageRenderer extends BaseMessageRenderer {

	constructor(app: App, plugin: OllamaPlugin, message: Message, view: OllamaView) {
		super(app, plugin, message, view);
		if (message.role !== "user") {
			throw new Error("UserMessageRenderer can only render messages with role 'user'.");
		}
	}

	public render(): HTMLElement {
		const messageGroup = this.createMessageGroupWrapper([CSS_CLASSES.USER_MESSAGE_GROUP]);

		// Додаємо аватар користувача
		// Використовуємо this.addAvatar або RendererUtils.renderAvatar безпосередньо
		// this.addAvatar(messageGroup, true); // true for user
		RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, true, "user");

		const messageWrapper = messageGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER });
		messageWrapper.style.order = "1"; // User messages on the right

        // Створюємо бульбашку та контейнери
        const { messageEl, contentEl } = this.createMessageBubble(messageWrapper, [CSS_CLASSES.USER_MESSAGE]);

		// Рендеримо простий текстовий контент для повідомлень користувача, зберігаючи переноси рядків
		const contentToRender = this.message.content || ""; // Переконуємося, що контент існує
		if (contentToRender.includes("\n")) {
			contentToRender.split("\n").forEach((line, i, arr) => {
				contentEl.appendText(line);
				if (i < arr.length - 1) contentEl.createEl("br");
			});
		} else {
			contentEl.setText(contentToRender);
		}
		
		// Створюємо обгортку для timestamp та кнопок
		const metaActionsWrapper = messageWrapper.createDiv({ cls: "message-meta-actions-wrapper" });
		
		// Додаємо timestamp до metaActionsWrapper
		BaseMessageRenderer.addTimestampToElement(metaActionsWrapper, this.message.timestamp, this.view);
		
		// Додаємо кнопки дій до metaActionsWrapper
		this.addUserActionButtons(metaActionsWrapper);

		// setTimeout для перевірки згортання, якщо це потрібно для user-повідомлень
		setTimeout(() => {
			if (messageEl.isConnected && contentEl.closest(`.${CSS_CLASSES.MESSAGE_GROUP}`)) {
				this.view.checkMessageForCollapsing(messageEl);
			}
		}, 70);

		return messageGroup;
	}

    /**
     * Додає кнопки дій, специфічні для повідомлення користувача (Regenerate, Copy, Delete).
     * Кнопки додаються до .message-actions-wrapper, який створюється всередині parentElementForActionsContainer.
     * @param parentElementForActionsContainer - Обгортка, куди буде додано .message-actions-wrapper (це .message-meta-actions-wrapper).
     */
    private addUserActionButtons(parentElementForActionsContainer: HTMLElement): void {
		const messageTimestamp = this.message.timestamp.getTime().toString();
		// Шукаємо вже існуючий .message-actions-wrapper
		let actionsWrapperActual = parentElementForActionsContainer.querySelector<HTMLElement>(`.${CSS_CLASSES.MESSAGE_ACTIONS}[data-message-timestamp="${messageTimestamp}"]`);

		if (actionsWrapperActual) {
			// Якщо існує, очищаємо для оновлення або просто виходимо
			// Поки що просто виходимо, щоб уникнути дублювання
			return;
		}
		
		// Створюємо .message-actions-wrapper
		actionsWrapperActual = parentElementForActionsContainer.createDiv({ cls: CSS_CLASSES.MESSAGE_ACTIONS });
		actionsWrapperActual.setAttribute("data-message-timestamp", messageTimestamp);
		
        const finalContent = this.message.content || "";

        // Regenerate Button (Якщо ця кнопка має бути тільки для відповідей AI, її тут не повинно бути)
        // Припускаю, що "Regenerate response" означає регенерувати ВІДПОВІДЬ на це повідомлення користувача,
        // тому ця кнопка логічна тут.
        const regenerateBtn = actionsWrapperActual.createEl("button", {
            cls: [CSS_CLASSES.REGENERATE_BUTTON, CSS_CLASSES.MESSAGE_ACTION_BUTTON],
            attr: { title: "Regenerate response based on this message" },
        });
        setIcon(regenerateBtn, "refresh-cw");
        this.view.registerDomEvent(regenerateBtn, "click", e => {
            e.stopPropagation();
            this.view.handleRegenerateClick(this.message); // Передаємо поточне повідомлення користувача
        });

        // Copy Button
        const copyBtn = actionsWrapperActual.createEl("button", {
            cls: [CSS_CLASSES.COPY_BUTTON, CSS_CLASSES.MESSAGE_ACTION_BUTTON], 
            attr: { "aria-label": "Copy", title: "Copy" },
        });
        setIcon(copyBtn, "copy");
        this.view.registerDomEvent(copyBtn, "click", e => {
            e.stopPropagation();
            this.view.handleCopyClick(finalContent, copyBtn);
        });

        // Delete Button
        const deleteBtn = actionsWrapperActual.createEl("button", {
            cls: [CSS_CLASSES.DELETE_MESSAGE_BUTTON, CSS_CLASSES.DANGER_OPTION, CSS_CLASSES.MESSAGE_ACTION_BUTTON], 
            attr: { "aria-label": "Delete message", title: "Delete Message" },
        });
        setIcon(deleteBtn, "trash");
        this.view.registerDomEvent(deleteBtn, "click", e => {
            e.stopPropagation();
            this.view.handleDeleteMessageClick(this.message);
        });
    }
}