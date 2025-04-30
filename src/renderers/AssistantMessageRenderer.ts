// src/renderers/AssistantMessageRenderer.ts
import { App, Notice, setIcon } from "obsidian";
import { Message } from "../types"; // Припускаємо, що типи тут
import OllamaPlugin from "../main";
import { OllamaView } from "../OllamaView"; // Потрібно для реєстрації подій/доступу до методів
import { CSS_CLASSES } from "../constants";
import * as RendererUtils from "../MessageRendererUtils"; // Імпортуємо утиліти
import { BaseMessageRenderer } from "./BaseMessageRenderer"; // Імпортуємо базовий клас

// Константи, що використовуються тут (деякі можуть бути вже в CSS_CLASSES)
const CSS_CLASS_OLLAMA_GROUP = "ollama-message-group"; // Вже є в CSS_CLASSES?
const CSS_CLASS_OLLAMA_MESSAGE = "ollama-message"; // Вже є в CSS_CLASSES?
const CSS_CLASS_CONTENT_COLLAPSIBLE = "message-content-collapsible"; // Вже є в CSS_CLASSES?
const CSS_CLASS_SUMMARIZE_BUTTON = "summarize-button"; // Повинна бути в constants.ts
const CSS_CLASS_TRANSLATE_BUTTON = "translate-button"; // Вже є в CSS_CLASSES?

export class AssistantMessageRenderer extends BaseMessageRenderer {

	constructor(app: App, plugin: OllamaPlugin, message: Message, view: OllamaView) {
		super(app, plugin, message, view); // Викликаємо конструктор базового класу
		if (message.role !== "assistant") {
			throw new Error("AssistantMessageRenderer can only render messages with role 'assistant'.");
		}
	}

	/** Рендерить повну групу повідомлення */
	public async render(): Promise<HTMLElement> {
		const messageGroup = this.createMessageGroupWrapper([CSS_CLASS_OLLAMA_GROUP]);

		this.addAvatar(messageGroup, false); // false for assistant

		const messageWrapper = messageGroup.createDiv({ cls: "message-wrapper" });
		messageWrapper.style.order = "2"; // AI messages on the left

        // Створюємо бульбашку та контейнери, додаємо клас для згортання
        const { messageEl, contentEl } = this.createMessageBubble(messageWrapper, [CSS_CLASS_OLLAMA_MESSAGE]);
        contentEl.addClass(CSS_CLASS_CONTENT_COLLAPSIBLE); // Додаємо клас тут

		// Рендеримо основний контент за допомогою утиліти
		await RendererUtils.renderAssistantContent(
			this.app,
			this.view,
			this.plugin,
			contentEl,
			this.message.content // Передаємо повний контент
		);

		// Додаємо кнопки дій, специфічні для асистента
		this.addAssistantActionButtons(messageWrapper, contentEl);

		// Додаємо мітку часу
		this.addTimestamp(messageEl);

		// Перевірка на згортання *після* рендерингу контенту та додавання кнопок
		// Використовуємо setTimeout, щоб гарантувати розрахунок розмірів
		// Важливо: Викликаємо метод view, бо логіка згортання все ще там (або її треба буде перенести)
		setTimeout(() => this.view.checkMessageForCollapsing(messageEl), 50); // Невелика затримка

		return messageGroup;
	}

	/** Додає кнопки дій (Copy, Translate, Summarize, Delete) */
	private addAssistantActionButtons(messageWrapper: HTMLElement, contentEl: HTMLElement): void {
        // Створюємо обгортку для кнопок тут, а не в базовому класі, бо набір кнопок інший
		const buttonsWrapper = messageWrapper.createDiv({ cls: "message-actions-wrapper" });
		const finalContent = this.message.content; // Використовуємо повний контент повідомлення
		// const finalTimestamp = this.message.timestamp; // timestamp не потрібен тут для кнопок

		// Copy Button (з базового класу)
		const copyBtn = buttonsWrapper.createEl("button", {
			cls: CSS_CLASSES.COPY_BUTTON,
			attr: { "aria-label": "Copy", title: "Copy" },
		});
		setIcon(copyBtn, "copy");
		this.view.registerDomEvent(copyBtn, "click", e => {
			e.stopPropagation();
            // Викликаємо обробник з View, він сам розбереться з <think> тегами
			this.view.handleCopyClick(finalContent, copyBtn);
		});

		// Translate Button
		if (
			this.plugin.settings.enableTranslation &&
			this.plugin.settings.googleTranslationApiKey &&
			finalContent.trim() // Перевіряємо, чи є що перекладати
		) {
			const translateBtn = buttonsWrapper.createEl("button", {
				cls: CSS_CLASS_TRANSLATE_BUTTON,
				attr: { "aria-label": "Translate", title: "Translate" },
			});
			setIcon(translateBtn, "languages");
			this.view.registerDomEvent(translateBtn, "click", e => {
				e.stopPropagation();
                // Перевіряємо, чи елемент контенту все ще існує
				if (contentEl.isConnected) {
                    // Передаємо оригінальний контент, обробник View сам видалить <think>
					this.view.handleTranslateClick(finalContent, contentEl, translateBtn);
				} else {
					this.plugin.logger.warn("Translate button clicked, but contentEl is not connected to DOM.");
					new Notice("Cannot translate: message content element not found.");
				}
			});
		}

		// Summarize Button
		if (this.plugin.settings.summarizationModelName && finalContent.trim()) {
			const summarizeBtn = buttonsWrapper.createEl("button", {
				cls: CSS_CLASS_SUMMARIZE_BUTTON,
				attr: { title: "Summarize message" },
			});
			setIcon(summarizeBtn, "scroll-text");
			this.view.registerDomEvent(summarizeBtn, "click", e => {
				e.stopPropagation();
                // Передаємо оригінальний контент, обробник View сам видалить <think>
				this.view.handleSummarizeClick(finalContent, summarizeBtn);
			});
		}

		// Delete Button (з базового класу)
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