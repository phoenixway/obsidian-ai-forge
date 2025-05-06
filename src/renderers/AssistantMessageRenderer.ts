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

	// Метод render залишається методом екземпляра, бо викликає статичні та protected методи
	public async render(): Promise<HTMLElement> {
        this.plugin.logger.debug(`[AssistantMessageRenderer] Starting render for ts: ${this.message.timestamp.getTime()}`);
		const messageGroup = this.createMessageGroupWrapper([CSS_CLASSES.OLLAMA_GROUP]);
		this.addAvatar(messageGroup, false);
		const messageWrapper = messageGroup.createDiv({ cls: "message-wrapper" });
		messageWrapper.style.order = "2";
        const { messageEl, contentEl } = this.createMessageBubble(messageWrapper, [CSS_CLASSES.OLLAMA_MESSAGE]);
        contentEl.addClass(CSS_CLASSES.CONTENT_COLLAPSIBLE);

        try {
            // Викликаємо статичний метод для рендерингу контенту
            await AssistantMessageRenderer.renderAssistantContent(
                contentEl, this.message.content, this.app, this.plugin, this.view
            );
            
        } catch (error) {
             this.plugin.logger.error(`[AssistantMessageRenderer] <<< CAUGHT ERROR in render >>> Calling static renderAssistantContent FAILED:`, error);
             contentEl.setText(`[Error rendering assistant content: ${error instanceof Error ? error.message : String(error)}]`);
             throw error; // Перекидаємо далі
        }

        this.plugin.logger.debug(`[AssistantMessageRenderer] Adding action buttons (static)...`);
        // Викликаємо статичний метод для додавання кнопок
		AssistantMessageRenderer.addAssistantActionButtons(messageWrapper, contentEl, this.message, this.plugin, this.view);

		this.plugin.logger.debug(`[AssistantMessageRenderer] Adding timestamp (static)...`);
        // Викликаємо статичний метод базового класу для мітки часу
		BaseMessageRenderer.addTimestamp(messageEl, this.message.timestamp, this.view);

        
		setTimeout(() => { if (messageEl.isConnected) this.view.checkMessageForCollapsing(messageEl) }, 50);

        this.plugin.logger.debug(`[AssistantMessageRenderer] Finished render for ts: ${this.message.timestamp.getTime()}`);
		return messageGroup;
	}

    
	/**
	 * Статичний метод для рендерингу контенту асистента (Markdown, код, емодзі).
	 * Тепер обережніше видаляє індикатор завантаження.
     * @param contentEl - DOM-елемент для рендерингу.
     * @param markdownText - Текст у форматі Markdown для рендерингу.
     * @param app - Екземпляр App.
     * @param plugin - Екземпляр OllamaPlugin.
     * @param view - Екземпляр OllamaView.
	 */
	public static async renderAssistantContent(
        contentEl: HTMLElement, markdownText: string, app: App, plugin: OllamaPlugin, view: OllamaView
    ): Promise<void> {
		

        // --- ЗМІНЕНО ЛОГІКУ ОЧИЩЕННЯ ---
        const dotsEl = contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
        // Перевіряємо, чи є новий текст і чи існують крапки
        if (markdownText.trim().length > 0 && dotsEl) {
             
             dotsEl.remove(); // Видаляємо тільки крапки
        } else if (!dotsEl && contentEl.hasChildNodes()) {
             // Якщо крапок вже немає (наступні чанки), але є інший контент, очищуємо повністю
             
             contentEl.empty();
        } else if (!dotsEl && !contentEl.hasChildNodes()) {
            // Якщо крапок немає і контенту немає (перший виклик, але крапки зникли з іншої причини?), нічого не робимо з очищенням
            
        } else {
            // Якщо текст порожній (порожній чанк?), не чіпаємо крапки
            
        }
        // --- КІНЕЦЬ ЗМІНИ ---

		let processedMarkdown = markdownText;
		// 1. Decode/Remove Tags (залишаємо)
		try {
			const decoded = RendererUtils.decodeHtmlEntities(markdownText);
			const thinkDetection = RendererUtils.detectThinkingTags(decoded);
			processedMarkdown = thinkDetection.contentWithoutTags;
			if (thinkDetection.hasThinkingTags) {  }
		} catch (e) { plugin.logger.error("[renderAssistantContent STAT] Error decoding/removing tags:", e); }

        // --- Додаємо перевірку, чи є що рендерити після обробки ---
        if (processedMarkdown.trim().length === 0) {
            
            return; // Не викликаємо MarkdownRenderer для порожнього рядка
        }
        // --- Кінець перевірки ---

		// 2. Render Markdown
		
		try {
            // Рендеримо оброблений markdown. Оскільки ми не робили empty() для першого чанка,
            // а видалили тільки dotsEl, MarkdownRenderer додасть новий контент.
            // Для наступних чанків ми робимо empty(), тому MarkdownRenderer перезапише все.
			await MarkdownRenderer.render( app, processedMarkdown, contentEl, plugin.app.vault.getRoot()?.path ?? "", view );
			 
		} catch (error) {
			 plugin.logger.error("[renderAssistantContent STAT] <<< MARKDOWN RENDER FAILED >>>:", error);
			 contentEl.setText(`[Error rendering Markdown: ${error instanceof Error ? error.message : String(error)}]`);
			 throw error;
		}

		// 3. Enhance Code Blocks (залишаємо)
		
		try { RendererUtils.enhanceCodeBlocks(contentEl, view); }
        catch (error) { plugin.logger.error("[renderAssistantContent STAT] Error processing code blocks:", error); }

		// 4. Fix Twemoji (залишаємо)
		if (plugin.settings.fixBrokenEmojis) {
            
			try { RendererUtils.fixBrokenTwemojiImages(contentEl); }
            catch (error) { plugin.logger.error("[renderAssistantContent STAT] Error fixing Twemoji:", error); }
		}

		 
	}

	/**
	 * Статичний метод для додавання кнопок дій асистента.
     * @param messageWrapper - Обгортка повідомлення.
     * @param contentEl - Елемент контенту (для перекладу).
     * @param message - Об'єкт повідомлення (для видалення).
     * @param plugin - Екземпляр OllamaPlugin (для налаштувань).
     * @param view - Екземпляр OllamaView (для обробників подій).
	 */
	public static addAssistantActionButtons(
        messageWrapper: HTMLElement, contentEl: HTMLElement, message: Message, plugin: OllamaPlugin, view: OllamaView
    ): void {
         // Перевіряємо, чи кнопки вже існують
         if (messageWrapper.querySelector(".message-actions-wrapper")) {
             // Можна оновити обробники, якщо треба, але поки що просто виходимо
             
             return;
         }
         
		 const buttonsWrapper = messageWrapper.createDiv({ cls: "message-actions-wrapper" });
		 const finalContent = message.content; // Використовуємо передане повідомлення

		 // Copy Button
		 const copyBtn = buttonsWrapper.createEl("button", { cls: CSS_CLASSES.COPY_BUTTON, attr: { "aria-label": "Copy", title: "Copy" } });
		 setIcon(copyBtn, "copy");
		 view.registerDomEvent(copyBtn, "click", e => { e.stopPropagation(); view.handleCopyClick(finalContent, copyBtn); }); // Використовуємо view

		 // Translate Button
		 if ( plugin.settings.enableTranslation && plugin.settings.googleTranslationApiKey && finalContent.trim() ) { // Використовуємо plugin
			 const translateBtn = buttonsWrapper.createEl("button", { cls: CSS_CLASSES.TRANSLATE_BUTTON, attr: { "aria-label": "Translate", title: "Translate" } });
			 setIcon(translateBtn, "languages");
			 view.registerDomEvent(translateBtn, "click", e => { e.stopPropagation(); if (contentEl.isConnected) { view.handleTranslateClick(finalContent, contentEl, translateBtn); } else { new Notice("Cannot translate: message content element not found."); } }); // Використовуємо view
		 }

		 // Summarize Button
		 if (plugin.settings.summarizationModelName && finalContent.trim()) { // Використовуємо plugin
			 const summarizeBtn = buttonsWrapper.createEl("button", { cls: CSS_CLASSES.SUMMARIZE_BUTTON, attr: { title: "Summarize message" } });
			 setIcon(summarizeBtn, "scroll-text");
			 view.registerDomEvent(summarizeBtn, "click", e => { e.stopPropagation(); view.handleSummarizeClick(finalContent, summarizeBtn); }); // Використовуємо view
		 }

		 // Delete Button
		 const deleteBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.DELETE_MESSAGE_BUTTON, CSS_CLASSES.DANGER_OPTION], attr: { "aria-label": "Delete message", title: "Delete Message" } });
		 setIcon(deleteBtn, "trash");
		 view.registerDomEvent(deleteBtn, "click", e => { e.stopPropagation(); view.handleDeleteMessageClick(message); }); // Використовуємо view та message
	}
    // --- КІНЕЦЬ СТАТИЧНОГО МЕТОДУ ---
}