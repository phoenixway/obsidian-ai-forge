// src/renderers/BaseMessageRenderer.ts
import { App, setIcon } from "obsidian";
import { Message } from "../types";
import OllamaPlugin from "../main";
import { OllamaView } from "../OllamaView";
import { CSS_CLASSES } from "../constants";
import * as RendererUtils from "../MessageRendererUtils";
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
		this.view = view;
	}

	abstract render(): Promise<HTMLElement> | HTMLElement;

	protected createMessageGroupWrapper(groupClasses: string[] = []): HTMLElement {
		const messageGroup = document.createElement("div");
		messageGroup.classList.add(CSS_CLASSES.MESSAGE_GROUP, ...groupClasses);
		// Встановлюємо timestamp тут, бо він відомий при створенні
		messageGroup.setAttribute("data-timestamp", this.message.timestamp.getTime().toString());
		return messageGroup;
	}

	// --- ЗРОБЛЕНО СТАТИЧНИМ ---
	/**
	 * Створює та додає елемент мітки часу до вказаного батьківського елемента.
	 * @param parentElement - Елемент, куди додати мітку часу.
	 * @param timestamp - Об'єкт Date для форматування.
	 * @param view - Екземпляр OllamaView для доступу до форматера.
	 */
	public static addTimestamp(parentElement: HTMLElement, timestamp: Date, view: OllamaView): void {
		// Перевіряємо, чи мітка часу вже існує (на випадок повторного виклику)
        if (parentElement.querySelector(`.${CSS_CLASSES.TIMESTAMP}`)) {
            return;
        }
		parentElement.createDiv({
			cls: CSS_CLASSES.TIMESTAMP,
			text: view.formatTime(timestamp), // Використовуємо view для форматування
		});
	}
	// --- КІНЕЦЬ ЗМІНИ ---

	protected addAvatar(messageGroup: HTMLElement, isUser: boolean): void {
		RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, isUser);
	}

	// addBaseActionButtons залишається методом екземпляра, бо залежить від this.message та this.view
    protected addBaseActionButtons(messageWrapper: HTMLElement, contentToCopy: string): void {
		// ... (реалізація як раніше) ...
         const buttonsWrapper = messageWrapper.createDiv({ cls: "message-actions-wrapper" });
         // Copy Button
         const copyBtn = buttonsWrapper.createEl("button", { cls: CSS_CLASSES.COPY_BUTTON, attr: { "aria-label": "Copy", title: "Copy" } });
         setIcon(copyBtn, "copy");
         this.view.registerDomEvent(copyBtn, "click", e => { e.stopPropagation(); this.view.handleCopyClick(contentToCopy, copyBtn); });
         // Delete Button
         const deleteBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.DELETE_MESSAGE_BUTTON, CSS_CLASSES.DANGER_OPTION], attr: { "aria-label": "Delete message", title: "Delete Message" } });
         setIcon(deleteBtn, "trash");
         this.view.registerDomEvent(deleteBtn, "click", e => { e.stopPropagation(); this.view.handleDeleteMessageClick(this.message); });
	}

    protected createMessageBubble(messageWrapper: HTMLElement, messageClasses: string[] = []): { messageEl: HTMLElement; contentContainer: HTMLElement; contentEl: HTMLElement; } {
        // ... (реалізація як раніше) ...
        const messageEl = messageWrapper.createDiv({ cls: [CSS_CLASSES.MESSAGE, ...messageClasses] });
        const contentContainer = messageEl.createDiv({ cls: CSS_CLASSES.CONTENT_CONTAINER });
        const contentEl = contentContainer.createDiv({ cls: CSS_CLASSES.CONTENT });
        return { messageEl, contentContainer, contentEl };
    }
}