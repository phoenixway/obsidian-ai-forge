// src/renderers/AssistantMessageRenderer.ts
import { App, Notice, setIcon, MarkdownRenderer } from "obsidian";
import { Message } from "../types";
import OllamaPlugin from "../main";
import { OllamaView } from "../OllamaView";
import { CSS_CLASSES } from "../constants";
import * as RendererUtils from "../MessageRendererUtils";
import { BaseMessageRenderer } from "./BaseMessageRenderer";

// Константи (переконайтесь, що вони є в CSS_CLASSES)
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
        this.plugin.logger.debug(`[AssistantMessageRenderer] Starting render for ts: ${this.message.timestamp.getTime()}`);

		const messageGroup = this.createMessageGroupWrapper([CSS_CLASSES.OLLAMA_GROUP]);
		this.addAvatar(messageGroup, false);
		const messageWrapper = messageGroup.createDiv({ cls: "message-wrapper" });
		messageWrapper.style.order = "2";
        const { messageEl, contentEl } = this.createMessageBubble(messageWrapper, [CSS_CLASSES.OLLAMA_MESSAGE]);
        contentEl.addClass(CSS_CLASSES.CONTENT_COLLAPSIBLE);

        this.plugin.logger.debug(`[AssistantMessageRenderer] Created base structure. Calling renderAssistantContentInternal...`);

        try {
            // Викликаємо внутрішній метод для рендерингу контенту
            await this.renderAssistantContentInternal(contentEl, this.message.content);
            this.plugin.logger.debug(`[AssistantMessageRenderer] renderAssistantContentInternal finished successfully.`);

        } catch (error) {
             this.plugin.logger.error(`[AssistantMessageRenderer] <<< CAUGHT ERROR in render >>> Calling renderAssistantContentInternal FAILED:`, error);
             contentEl.setText(`[Error rendering assistant content: ${error instanceof Error ? error.message : String(error)}]`);
             // Перекидаємо помилку, щоб handleMessageAdded міг її обробити і показати користувачу
             throw error;
        }

        this.plugin.logger.debug(`[AssistantMessageRenderer] Adding action buttons...`);
		this.addAssistantActionButtons(messageWrapper, contentEl); // Додаємо кнопки
		this.addTimestamp(messageEl); // Додаємо мітку часу

        this.plugin.logger.debug(`[AssistantMessageRenderer] Scheduling checkMessageForCollapsing...`);
		setTimeout(() => {
             if (messageEl.isConnected) {
                  this.view.checkMessageForCollapsing(messageEl);
             } else {
                  this.plugin.logger.warn(`[AssistantMessageRenderer] messageEl not connected when trying to check collapsing.`);
             }
        }, 50);

        this.plugin.logger.debug(`[AssistantMessageRenderer] Finished render for ts: ${this.message.timestamp.getTime()}`);
		return messageGroup;
	}

    /**
     * Внутрішній метод для рендерингу контенту асистента (Markdown, код, емодзі).
     */
    private async renderAssistantContentInternal(contentEl: HTMLElement, markdownText: string): Promise<void> {
        this.plugin.logger.debug("[renderAssistantContentInternal] Entering.");
        contentEl.empty();
        let processedMarkdown = markdownText;

        // 1. Декодування/Видалення тегів
        try {
            const decoded = RendererUtils.decodeHtmlEntities(markdownText);
            const thinkDetection = RendererUtils.detectThinkingTags(decoded);
            processedMarkdown = thinkDetection.contentWithoutTags;
            if (thinkDetection.hasThinkingTags) { this.plugin.logger.debug("[renderAssistantContentInternal] Removed <think> tags."); }
        } catch (e) {
            this.plugin.logger.error("[renderAssistantContentInternal] Error during decoding/tag removal:", e);
            processedMarkdown = markdownText; // Fallback
        }

        // 2. Рендеринг Markdown (з окремим try/catch)
        this.plugin.logger.debug("[renderAssistantContentInternal] Starting MarkdownRenderer.render...");
        try {
            await MarkdownRenderer.render(
                this.app,
                processedMarkdown,
                contentEl,
                this.plugin.app.vault.getRoot()?.path ?? "",
                this.view // Передаємо контекст View
            );
             this.plugin.logger.debug("[renderAssistantContentInternal] MarkdownRenderer.render finished successfully.");
        } catch (error) {
             this.plugin.logger.error("[renderAssistantContentInternal] <<< MARKDOWN RENDER FAILED >>>:", error);
             contentEl.setText(`[Error rendering Markdown: ${error instanceof Error ? error.message : String(error)}]`);
             // Кидаємо помилку далі
             throw error;
        }

        // 3. Обробка блоків коду
        this.plugin.logger.debug("[renderAssistantContentInternal] Processing code blocks...");
        try {
            RendererUtils.enhanceCodeBlocks(contentEl, this.view);
        } catch (error) { this.plugin.logger.error("[renderAssistantContentInternal] Error processing code blocks:", error); }

        // 4. Виправлення Twemoji
        if (this.plugin.settings.fixBrokenEmojis) {
            this.plugin.logger.debug("[renderAssistantContentInternal] Fixing Twemoji images...");
            try {
                RendererUtils.fixBrokenTwemojiImages(contentEl);
            } catch (error) { this.plugin.logger.error("[renderAssistantContentInternal] Error fixing Twemoji:", error); }
        }

         this.plugin.logger.debug("[renderAssistantContentInternal] Exiting.");
    }


	/** Додає кнопки дій (Copy, Translate, Summarize, Delete) */
	private addAssistantActionButtons(messageWrapper: HTMLElement, contentEl: HTMLElement): void {
        // ... (код додавання кнопок, як у попередній відповіді) ...
         const buttonsWrapper = messageWrapper.createDiv({ cls: "message-actions-wrapper" });
		const finalContent = this.message.content;

		// Copy Button
		const copyBtn = buttonsWrapper.createEl("button", { cls: CSS_CLASSES.COPY_BUTTON, attr: { "aria-label": "Copy", title: "Copy" } });
		setIcon(copyBtn, "copy");
		this.view.registerDomEvent(copyBtn, "click", e => { e.stopPropagation(); this.view.handleCopyClick(finalContent, copyBtn); });

		// Translate Button
		if ( this.plugin.settings.enableTranslation && this.plugin.settings.googleTranslationApiKey && finalContent.trim() ) {
			const translateBtn = buttonsWrapper.createEl("button", { cls: CSS_CLASSES.TRANSLATE_BUTTON, attr: { "aria-label": "Translate", title: "Translate" } });
			setIcon(translateBtn, "languages");
			this.view.registerDomEvent(translateBtn, "click", e => { e.stopPropagation(); if (contentEl.isConnected) { this.view.handleTranslateClick(finalContent, contentEl, translateBtn); } else { new Notice("Cannot translate: message content element not found."); } });
		}

		// Summarize Button
		if (this.plugin.settings.summarizationModelName && finalContent.trim()) {
			const summarizeBtn = buttonsWrapper.createEl("button", { cls: CSS_CLASSES.SUMMARIZE_BUTTON, attr: { title: "Summarize message" } });
			setIcon(summarizeBtn, "scroll-text");
			this.view.registerDomEvent(summarizeBtn, "click", e => { e.stopPropagation(); this.view.handleSummarizeClick(finalContent, summarizeBtn); });
		}

		// Delete Button
		const deleteBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.DELETE_MESSAGE_BUTTON, CSS_CLASSES.DANGER_OPTION], attr: { "aria-label": "Delete message", title: "Delete Message" } });
		setIcon(deleteBtn, "trash");
		this.view.registerDomEvent(deleteBtn, "click", e => { e.stopPropagation(); this.view.handleDeleteMessageClick(this.message); });
	}
}