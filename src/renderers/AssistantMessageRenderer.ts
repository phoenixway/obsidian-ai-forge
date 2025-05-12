// src/renderers/AssistantMessageRenderer.ts
import { App, Notice, setIcon, MarkdownRenderer } from "obsidian";
import { AssistantMessage, Message, ToolCall } from "../types"; // Переконайтеся, що AssistantMessage та ToolCall імпортовані
import OllamaPlugin from "../main"; // Адаптуйте шлях
import { OllamaView } from "../OllamaView"; // Адаптуйте шлях
import { CSS_CLASSES } from "../constants"; // Адаптуйте шлях
import * as RendererUtils from "../MessageRendererUtils"; // Адаптуйте шлях
import { BaseMessageRenderer } from "./BaseMessageRenderer";
import { IMessageRenderer } from "./IMessageRenderer"; // Додано для повноти, якщо BaseMessageRenderer його реалізує

// Константи (переконайтесь, що вони є в CSS_CLASSES)
// Ці константи, якщо вони специфічні для цього рендерера, можна залишити тут,
// але краще їх винести в constants.ts, якщо вони використовуються ще десь.
// const CSS_CLASS_OLLAMA_GROUP = "ollama-message-group"; // Вже має бути в CSS_CLASSES
// const CSS_CLASS_OLLAMA_MESSAGE = "ollama-message"; // Вже має бути в CSS_CLASSES
// const CSS_CLASS_CONTENT_COLLAPSIBLE = "message-content-collapsible"; // Вже має бути в CSS_CLASSES
// const CSS_CLASS_SUMMARIZE_BUTTON = "summarize-button"; // Додайте в CSS_CLASSES
// const CSS_CLASS_TRANSLATE_BUTTON = "translate-button"; // Додайте в CSS_CLASSES


export class AssistantMessageRenderer extends BaseMessageRenderer implements IMessageRenderer {

    // У конструкторі ми очікуємо AssistantMessage, щоб мати доступ до message.tool_calls
    constructor(app: App, plugin: OllamaPlugin, message: AssistantMessage, view: OllamaView) {
        super(app, plugin, message, view); // message тут вже має тип AssistantMessage
        if (message.role !== "assistant") {
            throw new Error("AssistantMessageRenderer can only render messages with role 'assistant'.");
        }
    }

    public async render(): Promise<HTMLElement> {
        const messageGroup = this.createMessageGroupWrapper([CSS_CLASSES.OLLAMA_GROUP || "ollama-message-group"]);
        this.addAvatar(messageGroup, false); // false для аватара асистента/AI

        const messageWrapper = messageGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
        messageWrapper.style.order = "2"; // Аватар зліва

        const { messageEl, contentEl } = this.createMessageBubble(
            messageWrapper, 
            [CSS_CLASSES.OLLAMA_MESSAGE || "ollama-message"]
        );
        contentEl.addClass(CSS_CLASSES.CONTENT_COLLAPSIBLE || "message-content-collapsible");

        // --- ПОЧАТОК ЗМІН: Обробка контенту перед рендерингом ---
        let contentToRender = this.message.content;
        const assistantMessage = this.message as AssistantMessage; // Явно вказуємо тип

        // Перевіряємо, чи це був текстовий fallback (нативні tool_calls відсутні, але текст містить теги)
        // і чи увімкнено використання інструментів
        const hasTextualToolCallTags = contentToRender.includes("<tool_call>");
        const hasNativeToolCalls = assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0;

        if (this.plugin.settings.enableToolUse && hasTextualToolCallTags && !hasNativeToolCalls) {
            this.plugin.logger.debug(`[AssistantMessageRenderer] Message (ts: ${this.message.timestamp.getTime()}) contains textual tool call tags. Preparing display content.`);
            // Видаляємо теги <tool_call>...</tool_call> для відображення,
            // залишаючи лише супровідний текст, якщо він є.
            let strippedContent = contentToRender.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();

            if (strippedContent.startsWith("***")) { // Видаляємо можливий роздільник Markdown
                strippedContent = strippedContent.substring(3).trim();
            }
            if (strippedContent.endsWith("***")) {
                strippedContent = strippedContent.substring(0, strippedContent.length - 3).trim();
            }
            
            // Формуємо повідомлення про використання інструменту
            // Намагаємося витягнути назви інструментів з тегів для більш інформативного повідомлення
            const toolCallRegex = /<tool_call>\s*{\s*"name"\s*:\s*"([^"]+)"[\s\S]*?}\s*<\/tool_call>/g;
            let match;
            const toolNamesCalled: string[] = [];
            // Скидаємо lastIndex для глобального регулярного виразу перед новим використанням
            toolCallRegex.lastIndex = 0; 
            while((match = toolCallRegex.exec(contentToRender)) !== null) {
                if (match[1]) toolNamesCalled.push(match[1]);
            }

            let usingToolMessage = "( ";
            if (toolNamesCalled.length > 0) {
                usingToolMessage += `Using tool${toolNamesCalled.length > 1 ? 's' : ''}: ${toolNamesCalled.join(', ')}... `;
            } else {
                usingToolMessage += "Attempting to use a tool... ";
            }
            usingToolMessage += ")";

            // Якщо після видалення тегів залишився супровідний текст, додаємо його.
            // Інакше, показуємо тільки повідомлення про використання інструменту.
            contentToRender = strippedContent ? `${usingToolMessage}\n\n${strippedContent}` : usingToolMessage;
            
            this.plugin.logger.debug(`[AssistantMessageRenderer] Content to render after stripping tags: "${contentToRender}"`);

        } else if (this.plugin.settings.enableToolUse && hasNativeToolCalls) {
            // Якщо є нативні tool_calls, і є якийсь контент (рідко, але можливо)
            // Можна додати індикатор, що інструменти були викликані
            let usingToolMessage = "( ";
            if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
                 usingToolMessage += `Using tool${assistantMessage.tool_calls.length > 1 ? 's' : ''}: ${assistantMessage.tool_calls.map(tc => tc.function.name).join(', ')}... `;
            } else { // Малоймовірно, оскільки hasNativeToolCalls = true
                usingToolMessage += "Using tools... ";
            }
            usingToolMessage += ")";
            
            contentToRender = contentToRender.trim() ? `${usingToolMessage}\n\n${contentToRender}` : usingToolMessage;
            this.plugin.logger.debug(`[AssistantMessageRenderer] Native tool_calls present. Content to render: "${contentToRender}"`);
        }
        // --- КІНЕЦЬ ЗМІН ---

        try {
            await AssistantMessageRenderer.renderAssistantContent(
                contentEl, 
                contentToRender, // <--- Передаємо оброблений contentToRender
                this.app, 
                this.plugin, 
                this.view
            );
        } catch (error) {
             contentEl.setText(`[Error rendering assistant content: ${error instanceof Error ? error.message : String(error)}]`);
             // Не перекидаємо помилку далі, щоб не зламати рендеринг решти UI повідомлення
             this.plugin.logger.error("[AssistantMessageRenderer] Error in render -> renderAssistantContent:", error);
        }

        AssistantMessageRenderer.addAssistantActionButtons(messageEl, contentEl, this.message as AssistantMessage, this.plugin, this.view);
        BaseMessageRenderer.addTimestamp(messageEl, this.message.timestamp, this.view);
        
        setTimeout(() => { if (messageEl.isConnected && contentEl.closest(`.${CSS_CLASSES.MESSAGE_GROUP}`)) this.view.checkMessageForCollapsing(messageEl); }, 50);

        return messageGroup;
    }

    
    public static async renderAssistantContent(
        contentEl: HTMLElement, markdownText: string, app: App, plugin: OllamaPlugin, view: OllamaView
    ): Promise<void> {
        const dotsEl = contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
        if (markdownText.trim().length > 0 && dotsEl) {
             dotsEl.remove(); 
        } else if (!dotsEl && contentEl.hasChildNodes() && markdownText.trim().length > 0) { // Очищуємо тільки якщо є новий текст
             contentEl.empty();
        } else if (!dotsEl && !contentEl.hasChildNodes()) {
            // Порожньо, нічого не робимо
        }
        
        let processedMarkdown = markdownText;
        try {
            const decoded = RendererUtils.decodeHtmlEntities(markdownText);
            const thinkDetection = RendererUtils.detectThinkingTags(decoded);
            processedMarkdown = thinkDetection.contentWithoutTags;
            // if (thinkDetection.hasThinkingTags) { plugin.logger.debug("[renderAssistantContent STAT] Thinking tags detected and stripped."); }
        } catch (e) { plugin.logger.error("[renderAssistantContent STAT] Error decoding/removing tags:", e); }

        if (processedMarkdown.trim().length === 0 && !contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`)) {
            // plugin.logger.debug("[renderAssistantContent STAT] Processed markdown is empty, skipping MarkdownRenderer call.");
            // Якщо після обробки нічого не залишилося і крапок немає, можна додати крапки знову або залишити порожнім
            if (contentEl.innerHTML.trim() === "") { // Щоб не додавати крапки до вже існуючого контенту (напр. попередніх чанків)
                 const dots = contentEl.createDiv({ cls: CSS_CLASSES.THINKING_DOTS });
                 for (let i = 0; i < 3; i++) dots.createDiv({ cls: CSS_CLASSES.THINKING_DOT });
            }
            return; 
        }
        
        try {
            // Якщо contentEl був очищений, MarkdownRenderer створить новий контент.
            // Якщо видалили тільки крапки, MarkdownRenderer додасть до існуючого контенту (якщо він не порожній).
            // Щоб уникнути дублювання, якщо це не перший чанк, краще завжди робити empty() перед рендером, 
            // АЛЕ це зламає стрімінг, якщо renderAssistantContent викликається для кожного чанка.
            // Поточна логіка передбачає, що renderAssistantContent викликається для ОНОВЛЕННЯ контенту плейсхолдера.
            // Отже, якщо є dotsEl - видаляємо його. Інакше - contentEl.empty().
            // Потім рендеримо processedMarkdown.

            // Спрощена логіка очищення для стрімінгу:
            // Якщо це перший чанк (dotsEl існував), то dotsEl.remove().
            // Для наступних чанків - contentEl.empty() перед рендером.
            // Однак, ваш код передає ВЖЕ НАКОПИЧЕНИЙ markdownText, тому contentEl.empty() тут буде правильним.
            
            if (dotsEl) dotsEl.remove(); // Якщо були крапки, видаляємо
            contentEl.empty(); // Очищаємо перед рендером повного накопиченого тексту

            await MarkdownRenderer.render( app, processedMarkdown, contentEl, plugin.app.vault.getRoot()?.path ?? "", view );
        } catch (error) {
             plugin.logger.error("[renderAssistantContent STAT] <<< MARKDOWN RENDER FAILED >>>:", error);
             contentEl.setText(`[Error rendering Markdown: ${error instanceof Error ? error.message : String(error)}]`);
             // Не перекидаємо помилку, щоб дозволити рендеринг решти UI повідомлення
        }
        
        try { RendererUtils.enhanceCodeBlocks(contentEl, view); }
        catch (error) { plugin.logger.error("[renderAssistantContent STAT] Error processing code blocks:", error); }

        if (plugin.settings.fixBrokenEmojis) {
            try { RendererUtils.fixBrokenTwemojiImages(contentEl); }
            catch (error) { plugin.logger.error("[renderAssistantContent STAT] Error fixing Twemoji:", error); }
        }
    }

    public static addAssistantActionButtons(
        messageElement: HTMLElement, // Змінено з messageWrapper на messageElement для більшої точності
        contentEl: HTMLElement, 
        message: AssistantMessage, // Типізовано як AssistantMessage
        plugin: OllamaPlugin, 
        view: OllamaView
    ): void {
         if (messageElement.querySelector(`.${CSS_CLASSES.MESSAGE_ACTIONS}`)) {
             return;
         }
         
         const buttonsWrapper = messageElement.createDiv({ cls: CSS_CLASSES.MESSAGE_ACTIONS });
         const finalContent = message.content; 

         // Copy Button
         const copyBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.COPY_BUTTON, CSS_CLASSES.MESSAGE_ACTION_BUTTON], attr: { "aria-label": "Copy", title: "Copy" } });
         setIcon(copyBtn, "copy");
         view.registerDomEvent(copyBtn, "click", e => { e.stopPropagation(); view.handleCopyClick(finalContent, copyBtn); });

         // Translate Button
         if ( plugin.settings.enableTranslation && 
              (plugin.settings.translationProvider === 'google' && plugin.settings.googleTranslationApiKey || plugin.settings.translationProvider === 'ollama' && plugin.settings.ollamaTranslationModel) &&
              finalContent && finalContent.trim() 
            ) {
             const translateBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.TRANSLATE_BUTTON, CSS_CLASSES.MESSAGE_ACTION_BUTTON], attr: { "aria-label": "Translate", title: "Translate" } });
             setIcon(translateBtn, "languages");
             view.registerDomEvent(translateBtn, "click", e => { e.stopPropagation(); if (contentEl.isConnected) { view.handleTranslateClick(finalContent, contentEl, translateBtn); } else { new Notice("Cannot translate: message content element not found."); } });
         }

         // Summarize Button
         if (plugin.settings.enableSummarization && plugin.settings.summarizationModelName && finalContent && finalContent.trim()) {
             const summarizeBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.SUMMARIZE_BUTTON, CSS_CLASSES.MESSAGE_ACTION_BUTTON], attr: { title: "Summarize message" } });
             setIcon(summarizeBtn, "scroll-text");
             view.registerDomEvent(summarizeBtn, "click", e => { e.stopPropagation(); view.handleSummarizeClick(finalContent, summarizeBtn); });
         }
        
         // Regenerate Button (Додаємо, якщо це НЕ повідомлення, що вже містить tool_calls, бо для них немає сенсу в регенерації)
         if (!message.tool_calls || message.tool_calls.length === 0) { // Показуємо тільки якщо це НЕ повідомлення з наміром викликати інструменти
            const regenerateBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.REGENERATE_BUTTON || "regenerate-button", CSS_CLASSES.MESSAGE_ACTION_BUTTON], attr: { "aria-label": "Regenerate response", title: "Regenerate Response"}});
            setIcon(regenerateBtn, "refresh-cw");
            // Для регенерації нам потрібне ПОПЕРЕДНЄ повідомлення користувача.
            // Це складно отримати тут напряму. view.handleRegenerateClick має сам його знайти.
            // Поки що передаємо поточне повідомлення асистента, а handleRegenerateClick знайде відповідний запит користувача.
            view.registerDomEvent(regenerateBtn, "click", (e) => { e.stopPropagation(); view.handleRegenerateClick(message); });
         }


         // Delete Button
         const deleteBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.DELETE_MESSAGE_BUTTON, CSS_CLASSES.DANGER_OPTION, CSS_CLASSES.MESSAGE_ACTION_BUTTON], attr: { "aria-label": "Delete message", title: "Delete Message" } });
         setIcon(deleteBtn, "trash");
         view.registerDomEvent(deleteBtn, "click", e => { e.stopPropagation(); view.handleDeleteMessageClick(message); });
    }
}