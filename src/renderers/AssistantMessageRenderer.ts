// src/renderers/AssistantMessageRenderer.ts
import { App, Notice, setIcon, MarkdownRenderer } from "obsidian"; // Додано MarkdownRenderer
import { Message } from "../types";
import OllamaPlugin from "../main";
import { OllamaView } from "../OllamaView";
import { CSS_CLASSES } from "../constants";
import * as RendererUtils from "../MessageRendererUtils";
import { BaseMessageRenderer } from "./BaseMessageRenderer";

const CSS_CLASS_OLLAMA_GROUP = "ollama-message-group";
const CSS_CLASS_OLLAMA_MESSAGE = "ollama-message";
const CSS_CLASS_CONTENT_COLLAPSIBLE = "message-content-collapsible";
const CSS_CLASS_SUMMARIZE_BUTTON = "summarize-button";
const CSS_CLASS_TRANSLATE_BUTTON = "translate-button";

export class AssistantMessageRenderer extends BaseMessageRenderer {

	constructor(app: App, plugin: OllamaPlugin, message: Message, view: OllamaView) {
		super(app, plugin, message, view);
		if (message.role !== "assistant") {
			throw new Error("AssistantMessageRenderer can only render messages with role 'assistant'.");
		}
	}

	public async render(): Promise<HTMLElement> {
        this.plugin.logger.debug(`[AssistantMessageRenderer] Starting render for ts: ${this.message.timestamp.getTime()}`); // ЛОГ 1

		const messageGroup = this.createMessageGroupWrapper([CSS_CLASS_OLLAMA_GROUP]);
		this.addAvatar(messageGroup, false);
		const messageWrapper = messageGroup.createDiv({ cls: "message-wrapper" });
		messageWrapper.style.order = "2";
        const { messageEl, contentEl } = this.createMessageBubble(messageWrapper, [CSS_CLASS_OLLAMA_MESSAGE]);
        contentEl.addClass(CSS_CLASS_CONTENT_COLLAPSIBLE);

        this.plugin.logger.debug(`[AssistantMessageRenderer] Created base structure. Calling renderAssistantContent...`); // ЛОГ 2

        try {
            // Виклик основної логіки рендерингу контенту
            await this.renderAssistantContentInternal(contentEl, this.message.content); // Використовуємо внутрішній метод
            this.plugin.logger.debug(`[AssistantMessageRenderer] renderAssistantContent finished.`); // ЛОГ 3

        } catch (error) {
             this.plugin.logger.error(`[AssistantMessageRenderer] Error during renderAssistantContentInternal:`, error);
             contentEl.setText(`[Error rendering assistant content: ${error instanceof Error ? error.message : String(error)}]`);
             // Кидаємо помилку далі, щоб handleMessageAdded міг її зловити і показати як помилку UI
             throw error;
        }

        // Додаємо кнопки дій
        this.plugin.logger.debug(`[AssistantMessageRenderer] Adding action buttons...`); // ЛОГ 4
		this.addAssistantActionButtons(messageWrapper, contentEl); // Логіка кнопок

        // Додаємо мітку часу
		this.addTimestamp(messageEl);

        // Перевірка на згортання (залишаємо виклик методу View)
        this.plugin.logger.debug(`[AssistantMessageRenderer] Scheduling checkMessageForCollapsing...`); // ЛОГ 5
		setTimeout(() => {
            if (messageEl.isConnected) { // Перевірка перед викликом
                 this.view.checkMessageForCollapsing(messageEl);
            } else {
                 this.plugin.logger.warn(`[AssistantMessageRenderer] messageEl not connected when trying to check collapsing.`);
            }
        }, 50);

        this.plugin.logger.debug(`[AssistantMessageRenderer] Finished render for ts: ${this.message.timestamp.getTime()}`); // ЛОГ 6
		return messageGroup;
	}

    // Переносимо логіку з RendererUtils сюди, щоб додати логування
    private async renderAssistantContentInternal(contentEl: HTMLElement, markdownText: string): Promise<void> {
        this.plugin.logger.debug("[renderAssistantContentInternal] Entering.");
        contentEl.empty(); // Очищуємо контейнер перед рендерингом

        // 1. Декодування HTML сутностей та видалення <think> тегів (якщо є)
        let processedMarkdown = markdownText;
        try {
            const decoded = RendererUtils.decodeHtmlEntities(markdownText);
            const thinkDetection = RendererUtils.detectThinkingTags(decoded);
            if (thinkDetection.hasThinkingTags) {
                this.plugin.logger.debug("[renderAssistantContentInternal] Found <think> tags, removing them.");
                processedMarkdown = thinkDetection.contentWithoutTags.trim();
            } else {
                processedMarkdown = decoded; // Use decoded if no tags
            }
             this.plugin.logger.debug("[renderAssistantContentInternal] HTML entities decoded and <think> tags processed.");
        } catch (e) {
            this.plugin.logger.error("[renderAssistantContentInternal] Error during decoding/tag removal:", e);
             // Продовжуємо з оригінальним текстом у разі помилки тут
             processedMarkdown = markdownText;
        }


        // 2. Рендеринг Markdown
        this.plugin.logger.debug("[renderAssistantContentInternal] Starting MarkdownRenderer.render...");
        try {
            await MarkdownRenderer.render(
                this.app,
                processedMarkdown,
                contentEl,
                this.plugin.app.vault.getRoot()?.path ?? "", // Шлях для рендерингу відносних посилань
                this.view // Передаємо контекст View
            );
            this.plugin.logger.debug("[renderAssistantContentInternal] MarkdownRenderer.render finished.");
        } catch (error) {
             this.plugin.logger.error("[renderAssistantContentInternal] MarkdownRenderer.render FAILED:", error);
             contentEl.setText(`[Error rendering Markdown: ${error instanceof Error ? error.message : String(error)}]`);
             // Кидаємо помилку далі, щоб її зловив викликаючий метод render()
             throw error;
        }

        // 3. Обробка блоків коду (додавання кнопок копіювання та мови)
        this.plugin.logger.debug("[renderAssistantContentInternal] Processing code blocks...");
        try {
            RendererUtils.enhanceCodeBlocks(contentEl, this.view); // Передаємо View для registerDomEvent
            this.plugin.logger.debug("[renderAssistantContentInternal] Code blocks processed.");
        } catch (error) {
             this.plugin.logger.error("[renderAssistantContentInternal] Error processing code blocks:", error);
             // Не кидаємо помилку тут, рендеринг основного контенту вдався
        }


        // 4. Виправлення зламаних Twemoji (якщо потрібно)
        if (this.plugin.settings.fixBrokenEmojis) { // Перевіряємо налаштування
            this.plugin.logger.debug("[renderAssistantContentInternal] Fixing Twemoji images...");
            try {
                RendererUtils.fixBrokenTwemojiImages(contentEl);
                this.plugin.logger.debug("[renderAssistantContentInternal] Twemoji fixed.");
            } catch (error) {
                 this.plugin.logger.error("[renderAssistantContentInternal] Error fixing Twemoji:", error);
            }
        }

         this.plugin.logger.debug("[renderAssistantContentInternal] Exiting.");
    }


	/** Додає кнопки дій (Copy, Translate, Summarize, Delete) */
	private addAssistantActionButtons(messageWrapper: HTMLElement, contentEl: HTMLElement): void {
        // ... (код додавання кнопок залишається таким же, як у попередній відповіді) ...
        // Переконайтесь, що CSS_CLASSES.COPY_BUTTON, CSS_CLASSES.DELETE_MESSAGE_BUTTON,
        // CSS_CLASSES.DANGER_OPTION, CSS_CLASS_TRANSLATE_BUTTON, CSS_CLASS_SUMMARIZE_BUTTON існують
        const buttonsWrapper = messageWrapper.createDiv({ cls: "message-actions-wrapper" });
		const finalContent = this.message.content;

		// Copy Button
		const copyBtn = buttonsWrapper.createEl("button", {
			cls: CSS_CLASSES.COPY_BUTTON,
			attr: { "aria-label": "Copy", title: "Copy" },
		});
		setIcon(copyBtn, "copy");
		this.view.registerDomEvent(copyBtn, "click", e => {
			e.stopPropagation();
			this.view.handleCopyClick(finalContent, copyBtn);
		});

		// Translate Button
		if ( this.plugin.settings.enableTranslation && this.plugin.settings.googleTranslationApiKey && finalContent.trim() ) {
			const translateBtn = buttonsWrapper.createEl("button", {
				cls: CSS_CLASS_TRANSLATE_BUTTON, // Перевірте наявність у constants.ts
				attr: { "aria-label": "Translate", title: "Translate" },
			});
			setIcon(translateBtn, "languages");
			this.view.registerDomEvent(translateBtn, "click", e => {
				e.stopPropagation();
				if (contentEl.isConnected) { this.view.handleTranslateClick(finalContent, contentEl, translateBtn); }
                else { new Notice("Cannot translate: message content element not found."); }
			});
		}

		// Summarize Button
		if (this.plugin.settings.summarizationModelName && finalContent.trim()) {
			const summarizeBtn = buttonsWrapper.createEl("button", {
				cls: CSS_CLASS_SUMMARIZE_BUTTON, // Перевірте наявність у constants.ts
				attr: { title: "Summarize message" },
			});
			setIcon(summarizeBtn, "scroll-text");
			this.view.registerDomEvent(summarizeBtn, "click", e => {
				e.stopPropagation();
				this.view.handleSummarizeClick(finalContent, summarizeBtn);
			});
		}

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

