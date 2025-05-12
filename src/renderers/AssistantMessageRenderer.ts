// src/renderers/AssistantMessageRenderer.ts
import { App, Notice, setIcon, MarkdownRenderer } from "obsidian";
import { AssistantMessage, Message, ToolCall } from "../types"; // Переконайтеся, що типи імпортовані
import OllamaPlugin from "../main"; // Адаптуйте шлях
import { OllamaView } from "../OllamaView"; // Адаптуйте шлях
import { CSS_CLASSES } from "../constants"; // Адаптуйте шлях
import * as RendererUtils from "../MessageRendererUtils"; // Адаптуйте шлях
import { BaseMessageRenderer } from "./BaseMessageRenderer";
import { IMessageRenderer } from "./IMessageRenderer";

export class AssistantMessageRenderer extends BaseMessageRenderer implements IMessageRenderer {

    constructor(app: App, plugin: OllamaPlugin, message: AssistantMessage, view: OllamaView) {
        super(app, plugin, message, view); // message тут вже має тип AssistantMessage, BaseMessageRenderer прийме його
        if (message.role !== "assistant") {
            // Ця перевірка може бути зайвою, якщо TypeScript вже гарантує тип AssistantMessage
            throw new Error("AssistantMessageRenderer can only render messages with role 'assistant'.");
        }
    }

    public async render(): Promise<HTMLElement> {
        const messageGroup = this.createMessageGroupWrapper([CSS_CLASSES.OLLAMA_GROUP || "ollama-message-group"]);
        
        // Додаємо аватар для асистента
        // Якщо ваш RendererUtils.renderAvatar приймає 5-й аргумент для типу ролі:
        // RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, false, 'assistant');
        // Інакше (якщо він приймає лише 4 аргументи):
        this.addAvatar(messageGroup, false); 

        const messageWrapper = messageGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
        messageWrapper.style.order = "2"; 

        const { messageEl, contentEl } = this.createMessageBubble(
            messageWrapper, 
            [CSS_CLASSES.OLLAMA_MESSAGE || "ollama-message"]
        );
        contentEl.addClass(CSS_CLASSES.CONTENT_COLLAPSIBLE || "message-content-collapsible");

        let contentToRender = this.message.content; // Початковий контент
        const assistantMessage = this.message as AssistantMessage; // Впевнені, що це AssistantMessage

        const hasTextualToolCallTags = typeof contentToRender === 'string' && contentToRender.includes("<tool_call>");
        const hasNativeToolCalls = assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0;

        if (this.plugin.settings.enableToolUse && (hasTextualToolCallTags || hasNativeToolCalls) ) {
            this.plugin.logger.debug(`[AssistantMessageRenderer] Message (ts: ${this.message.timestamp.getTime()}) contains tool call indicators. Preparing display content.`);
            
            let usingToolMessage = "( ";
            const toolNamesCalled: string[] = [];

            if (hasNativeToolCalls && assistantMessage.tool_calls) { // Пріоритет нативним, якщо є
                this.plugin.logger.debug(`[AssistantMessageRenderer] Native tool_calls found: ${assistantMessage.tool_calls.length}`);
                assistantMessage.tool_calls.forEach(tc => toolNamesCalled.push(tc.function.name));
                // Для нативних викликів, message.content - це зазвичай текст *перед* викликом, або null.
                // Ми його просто відобразимо як є, додавши повідомлення про інструменти.
            } else if (hasTextualToolCallTags && typeof contentToRender === 'string') { // Текстовий fallback
                this.plugin.logger.debug(`[AssistantMessageRenderer] Textual tool_call tags found.`);
                const toolCallRegex = /<tool_call>\s*{\s*"name"\s*:\s*"([^"]+)"[\s\S]*?}\s*<\/tool_call>/g; // Видалено 's'
                let match;
                // Скидаємо lastIndex для глобального регулярного виразу перед новим використанням
                toolCallRegex.lastIndex = 0; 
                while((match = toolCallRegex.exec(contentToRender)) !== null) {
                    if (match[1]) toolNamesCalled.push(match[1]);
                }
                // Видаляємо теги <tool_call>...</tool_call> для відображення
                contentToRender = contentToRender.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
                if (contentToRender.startsWith("***")) { 
                    contentToRender = contentToRender.substring(3).trim();
                }
                if (contentToRender.endsWith("***")) {
                    contentToRender = contentToRender.substring(0, contentToRender.length - 3).trim();
                }
            }

            if (toolNamesCalled.length > 0) {
                usingToolMessage += `Using tool${toolNamesCalled.length > 1 ? 's' : ''}: ${toolNamesCalled.join(', ')}... `;
            } else if (hasTextualToolCallTags || hasNativeToolCalls) { // Якщо індикатори є, але імена не витягли
                usingToolMessage += "Attempting to use tool(s)... ";
            }
            usingToolMessage += ")";
            
            contentToRender = contentToRender && contentToRender.trim() ? `${usingToolMessage}\n\n${contentToRender}` : usingToolMessage;
            this.plugin.logger.debug(`[AssistantMessageRenderer] Content to render after processing tool indicators: "${contentToRender}"`);
        }
        
        try {
            await AssistantMessageRenderer.renderAssistantContent(
                contentEl, 
                contentToRender || "", // Передаємо порожній рядок, якщо contentToRender став null/undefined
                this.app, 
                this.plugin, 
                this.view
            );
        } catch (error) {
             contentEl.setText(`[Error rendering assistant content: ${error instanceof Error ? error.message : String(error)}]`);
             this.plugin.logger.error("[AssistantMessageRenderer] Error in render -> renderAssistantContent:", error);
        }

        AssistantMessageRenderer.addAssistantActionButtons(messageEl, contentEl, assistantMessage, this.plugin, this.view);
        BaseMessageRenderer.addTimestamp(messageEl, this.message.timestamp, this.view);
        
        setTimeout(() => { 
            if (messageEl.isConnected && contentEl.closest(`.${CSS_CLASSES.MESSAGE_GROUP || "message-group"}`)) {
                this.view.checkMessageForCollapsing(messageEl);
            }
        }, 70); // Збільшив трохи затримку

        return messageGroup;
    }
    
    public static async renderAssistantContent(
        contentEl: HTMLElement, markdownText: string, app: App, plugin: OllamaPlugin, view: OllamaView
    ): Promise<void> {
        
        const dotsEl = contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
        if (dotsEl) { // Якщо крапки ще є, видаляємо їх
            dotsEl.remove();
        }
        // Завжди очищуємо перед рендерингом нового повного контенту,
        // оскільки markdownText - це вже накопичений повний текст для поточного стану.
        contentEl.empty(); 

        let processedMarkdown = markdownText;
        try {
            const decoded = RendererUtils.decodeHtmlEntities(markdownText); // Виконуємо decode завжди
            const thinkDetection = RendererUtils.detectThinkingTags(decoded);
            processedMarkdown = thinkDetection.contentWithoutTags;
            // if (thinkDetection.hasThinkingTags) { plugin.logger.debug("[renderAssistantContent STAT] Thinking tags detected and stripped."); }
        } catch (e) { plugin.logger.error("[renderAssistantContent STAT] Error decoding/removing tags:", e); }

        if (processedMarkdown.trim().length === 0) {
            // plugin.logger.debug("[renderAssistantContent STAT] Processed markdown is empty after stripping tags.");
            // Якщо після обробки нічого не залишилося і це був не порожній вхідний markdownText,
            // можливо, варто показати індикатор очікування, якщо це стрімінг.
            // Оскільки цей метод може викликатися для фінального рендерингу,
            // краще не додавати тут крапки, якщо текст справді порожній.
            // Залишаємо contentEl порожнім.
            return; 
        }
        
        try {
            await MarkdownRenderer.render( app, processedMarkdown, contentEl, plugin.app.vault.getRoot()?.path ?? "", view );
        } catch (error) {
             plugin.logger.error("[renderAssistantContent STAT] <<< MARKDOWN RENDER FAILED >>>:", error);
             contentEl.setText(`[Error rendering Markdown: ${error instanceof Error ? error.message : String(error)}]`);
        }
        
        try { RendererUtils.enhanceCodeBlocks(contentEl, view); }
        catch (error) { plugin.logger.error("[renderAssistantContent STAT] Error processing code blocks:", error); }

        if (plugin.settings.fixBrokenEmojis) {
            try { RendererUtils.fixBrokenTwemojiImages(contentEl); }
            catch (error) { plugin.logger.error("[renderAssistantContent STAT] Error fixing Twemoji:", error); }
        }
    }

    public static addAssistantActionButtons(
        messageElement: HTMLElement, 
        contentEl: HTMLElement, 
        message: AssistantMessage, 
        plugin: OllamaPlugin, 
        view: OllamaView
    ): void {
         // Перевіряємо, чи контейнер для кнопок вже існує
         if (messageElement.querySelector(`.${CSS_CLASSES.MESSAGE_ACTIONS}`)) {
             // Якщо кнопки вже є, можна або вийти, або оновити їх (складніше).
             // Для простоти, поки що виходимо, щоб уникнути дублювання.
             // plugin.logger.trace("[addAssistantActionButtons] Actions wrapper already exists, skipping add.");
             return;
         }
         
         const buttonsWrapper = messageElement.createDiv({ cls: CSS_CLASSES.MESSAGE_ACTIONS });
         const finalContent = message.content; // Використовуємо передане повідомлення

         const copyBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.COPY_BUTTON || "copy-button", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { "aria-label": "Copy", title: "Copy" } });
         setIcon(copyBtn, "copy");
         view.registerDomEvent(copyBtn, "click", e => { e.stopPropagation(); view.handleCopyClick(finalContent || "", copyBtn); });

         if ( plugin.settings.enableTranslation && 
              (plugin.settings.translationProvider === 'google' && plugin.settings.googleTranslationApiKey || 
               plugin.settings.translationProvider === 'ollama' && plugin.settings.ollamaTranslationModel) &&
              finalContent && finalContent.trim() 
            ) {
             const translateBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.TRANSLATE_BUTTON || "translate-button", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { "aria-label": "Translate", title: "Translate" } });
             setIcon(translateBtn, "languages");
             view.registerDomEvent(translateBtn, "click", e => { e.stopPropagation(); if (contentEl.isConnected) { view.handleTranslateClick(finalContent || "", contentEl, translateBtn); } else { new Notice("Cannot translate: message content element not found."); } });
         }

         if (plugin.settings.enableSummarization && plugin.settings.summarizationModelName && finalContent && finalContent.trim()) {
             const summarizeBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.SUMMARIZE_BUTTON || "summarize-button", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { title: "Summarize message" } });
             setIcon(summarizeBtn, "scroll-text");
             view.registerDomEvent(summarizeBtn, "click", e => { e.stopPropagation(); view.handleSummarizeClick(finalContent || "", summarizeBtn); });
         }
        
         // Кнопка регенерації НЕ повинна з'являтися для повідомлень, які САМІ є запитом на виклик інструменту
         // (тобто, якщо assistantMessage.tool_calls заповнене, або якщо isTextualFallbackUsed було true для цього контенту)
         // Поточний message.tool_calls стосується нативних викликів.
         // Якщо це був текстовий виклик, то message.tool_calls буде порожнім.
         // Отже, перевіряємо, чи НЕ є це повідомлення з текстовим викликом (тобто не містить "<tool_call>" тегів).
         const contentContainsTextualToolCall = typeof finalContent === 'string' && finalContent.includes("<tool_call>");

         if ((!message.tool_calls || message.tool_calls.length === 0) && !contentContainsTextualToolCall) {
            const regenerateBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.REGENERATE_BUTTON || "regenerate-button", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { "aria-label": "Regenerate response", title: "Regenerate Response"}});
            setIcon(regenerateBtn, "refresh-cw");
            view.registerDomEvent(regenerateBtn, "click", (e) => { e.stopPropagation(); view.handleRegenerateClick(message); }); // message тут вже AssistantMessage
         }

         const deleteBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.DELETE_MESSAGE_BUTTON || "delete-message-button", CSS_CLASSES.DANGER_OPTION || "danger-option", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { "aria-label": "Delete message", title: "Delete Message" } });
         setIcon(deleteBtn, "trash");
         view.registerDomEvent(deleteBtn, "click", e => { e.stopPropagation(); view.handleDeleteMessageClick(message); });
    }
}