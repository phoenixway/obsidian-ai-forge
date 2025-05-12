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
        super(app, plugin, message, view); 
        if (message.role !== "assistant") {
            plugin.logger.error("[AssistantMessageRenderer] Constructor error: Message role is not 'assistant'. Received:", message.role);
            throw new Error("AssistantMessageRenderer can only render messages with role 'assistant'.");
        }
    }

    // Статичний метод для підготовки контенту, який може викликатися з різних місць
    public static prepareDisplayContent(
        originalContent: string, 
        assistantMessage: AssistantMessage, // Для доступу до native tool_calls
        plugin: OllamaPlugin // Для логування та доступу до налаштувань
    ): string {
        const messageTimestampLog = assistantMessage.timestamp.getTime();
        let finalContentToDisplay = originalContent; // За замовчуванням

        const thinkDetection = RendererUtils.detectThinkingTags(RendererUtils.decodeHtmlEntities(originalContent));
        let contentWithoutThinkTags = thinkDetection.contentWithoutTags;
        
        const hasTextualToolCallTagsInStrippedContent = contentWithoutThinkTags.includes("<tool_call>");
        const hasNativeToolCalls = !!(assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0);

        plugin.logger.debug(`[ARender STATIC PREP][ts:${messageTimestampLog}] Checks: enableToolUse=${plugin.settings.enableToolUse}, hasTextualToolCallTags=${hasTextualToolCallTagsInStrippedContent}, hasNativeToolCalls=${hasNativeToolCalls}.`);

        if (plugin.settings.enableToolUse && (hasTextualToolCallTagsInStrippedContent || hasNativeToolCalls)) {
            plugin.logger.info(`[ARender STATIC PREP][ts:${messageTimestampLog}] Tool call indicators present. Preparing user-friendly display content.`);
            
            let usingToolMessageText = "( ";
            const toolNamesCalled: string[] = [];
            // Текст, що залишиться ПІСЛЯ видалення <tool_call> тегів з contentWithoutThinkTags
            let accompanyingText = contentWithoutThinkTags; 

            if (hasNativeToolCalls && assistantMessage.tool_calls) { 
                plugin.logger.debug(`[ARender STATIC PREP][ts:${messageTimestampLog}] Processing NATIVE tool_calls. Count: ${assistantMessage.tool_calls.length}`);
                assistantMessage.tool_calls.forEach(tc => toolNamesCalled.push(tc.function.name));
                // accompanyingText тут - це contentWithoutThinkTags.
            } else if (hasTextualToolCallTagsInStrippedContent) { 
                plugin.logger.debug(`[ARender STATIC PREP][ts:${messageTimestampLog}] Processing TEXTUAL tool_call tags from (content without think tags): "${contentWithoutThinkTags.substring(0,150)}..."`);
                
                const toolCallRegex = /<tool_call>\s*{\s*"name"\s*:\s*"([^"]+)"[\s\S]*?}\s*<\/tool_call>/g;
                let match;
                toolCallRegex.lastIndex = 0;
                // Шукаємо імена в contentWithoutThinkTags (вже без <think>)
                while((match = toolCallRegex.exec(contentWithoutThinkTags)) !== null) {
                    if (match[1]) {
                        toolNamesCalled.push(match[1]);
                    }
                }
                plugin.logger.debug(`[ARender STATIC PREP][ts:${messageTimestampLog}] Extracted tool names from textual calls: ${toolNamesCalled.join(', ')}`);
                
                accompanyingText = contentWithoutThinkTags.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
                
                if (accompanyingText.startsWith("***")) { accompanyingText = accompanyingText.substring(3).trim(); }
                if (accompanyingText.endsWith("***")) { accompanyingText = accompanyingText.substring(0, accompanyingText.length - 3).trim(); }
            }

            if (toolNamesCalled.length > 0) {
                usingToolMessageText += `Using tool${toolNamesCalled.length > 1 ? 's' : ''}: ${toolNamesCalled.join(', ')}... `;
            } else { 
                usingToolMessageText += "Attempting to use tool(s)... ";
                plugin.logger.warn(`[ARender STATIC PREP][ts:${messageTimestampLog}] Tool call indicators were present, but no tool names were extracted/available.`);
            }
            usingToolMessageText += ")";
            
            if (accompanyingText && accompanyingText.trim().length > 0) {
                finalContentToDisplay = `${usingToolMessageText}\n\n${accompanyingText.trim()}`;
            } else {
                finalContentToDisplay = usingToolMessageText;
            }
        } else {
            finalContentToDisplay = contentWithoutThinkTags; // Якщо інструменти не використовуються, показуємо текст без <think>
        }
        plugin.logger.info(`[ARender STATIC PREP][ts:${messageTimestampLog}] Prepared display content: "${finalContentToDisplay}"`);
        return finalContentToDisplay;
    }

    public async render(): Promise<HTMLElement> {
        const messageTimestampLog = this.message.timestamp.getTime();
        this.plugin.logger.debug(`[ARender INSTANCE][ts:${messageTimestampLog}] render() called. Original content preview: "${this.message.content?.substring(0, 150)}..."`);

        const messageGroup = this.createMessageGroupWrapper([CSS_CLASSES.OLLAMA_GROUP || "ollama-message-group"]);
        
        RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, false, 'assistant');

        const messageWrapper = messageGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
        messageWrapper.style.order = "2"; 
        const { messageEl, contentEl } = this.createMessageBubble(
            messageWrapper, 
            [CSS_CLASSES.OLLAMA_MESSAGE || "ollama-message"]
        );
        contentEl.addClass(CSS_CLASSES.CONTENT_COLLAPSIBLE || "message-content-collapsible");

        const assistantMessage = this.message as AssistantMessage; 
        
        // Використовуємо статичний метод для підготовки контенту
        const displayContent = AssistantMessageRenderer.prepareDisplayContent(
            this.message.content || "", 
            assistantMessage, 
            this.plugin
        );
        
        this.plugin.logger.debug(`[ARender INSTANCE][ts:${messageTimestampLog}] Content prepared for display by static method: "${displayContent.substring(0,150)}..."`);
        
        try {
            // Передаємо підготовлений displayContent на рендеринг
            await RendererUtils.renderMarkdownContent( // Припускаємо, що цей метод у RendererUtils
                this.app, 
                this.view,
                this.plugin,
                contentEl, 
                displayContent 
            );
        } catch (error) {
             contentEl.setText(`[Error rendering assistant content: ${error instanceof Error ? error.message : String(error)}]`);
             this.plugin.logger.error(`[ARender INSTANCE][ts:${messageTimestampLog}] Error in render -> renderMarkdownContent:`, error);
        }

        AssistantMessageRenderer.addAssistantActionButtons(messageEl, contentEl, assistantMessage, this.plugin, this.view);
        BaseMessageRenderer.addTimestamp(messageEl, this.message.timestamp, this.view);
        
        setTimeout(() => { 
            if (messageEl.isConnected && contentEl.closest(`.${CSS_CLASSES.MESSAGE_GROUP || "message-group"}`)) {
                this.view.checkMessageForCollapsing(messageEl);
            }
        }, 70);

        return messageGroup;
    }      
    
    public static async renderAssistantContent(
        contentEl: HTMLElement, markdownText: string, app: App, plugin: OllamaPlugin, view: OllamaView
    ): Promise<void> {
        
        const dotsEl = contentEl.querySelector(`.${CSS_CLASSES.THINKING_DOTS}`);
        if (dotsEl) { 
            dotsEl.remove();
        }
        contentEl.empty(); 

        let processedMarkdown = markdownText;
        try {
            const decoded = RendererUtils.decodeHtmlEntities(markdownText); 
            const thinkDetection = RendererUtils.detectThinkingTags(decoded);
            processedMarkdown = thinkDetection.contentWithoutTags;
        } catch (e) { plugin.logger.error("[renderAssistantContent STAT] Error decoding/removing tags:", e); }

        if (processedMarkdown.trim().length === 0) {
            if (contentEl.innerHTML.trim() === "") { 
                 const dots = contentEl.createDiv({ cls: CSS_CLASSES.THINKING_DOTS });
                 for (let i = 0; i < 3; i++) dots.createDiv({ cls: CSS_CLASSES.THINKING_DOT });
            }
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
        if (messageElement.querySelector(`.${CSS_CLASSES.MESSAGE_ACTIONS}`)) {
            return;
        }
        
        const buttonsWrapper = messageElement.createDiv({ cls: CSS_CLASSES.MESSAGE_ACTIONS });
        // Для кнопок Копіювати, Перекласти, Сумаризувати використовуємо ОРИГІНАЛЬНИЙ контент повідомлення,
        // оскільки він може містити теги <tool_call> або <think>, які користувач може хотіти скопіювати.
        const originalLlMRawContent = message.content || ""; 

        const copyBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.COPY_BUTTON || "copy-button", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { "aria-label": "Copy", title: "Copy" } });
        setIcon(copyBtn, "copy");
        view.registerDomEvent(copyBtn, "click", e => { e.stopPropagation(); view.handleCopyClick(originalLlMRawContent, copyBtn); });

        if ( plugin.settings.enableTranslation && 
             (plugin.settings.translationProvider === 'google' && plugin.settings.googleTranslationApiKey || 
              plugin.settings.translationProvider === 'ollama' && plugin.settings.ollamaTranslationModel) &&
             originalLlMRawContent && originalLlMRawContent.trim() 
           ) {
            const translateBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.TRANSLATE_BUTTON || "translate-button", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { "aria-label": "Translate", title: "Translate" } });
            setIcon(translateBtn, "languages");
            view.registerDomEvent(translateBtn, "click", e => { e.stopPropagation(); if (contentEl.isConnected) { view.handleTranslateClick(originalLlMRawContent, contentEl, translateBtn); } else { new Notice("Cannot translate: message content element not found."); } });
        }

        if (plugin.settings.enableSummarization && plugin.settings.summarizationModelName && originalLlMRawContent && originalLlMRawContent.trim()) {
            const summarizeBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.SUMMARIZE_BUTTON || "summarize-button", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { title: "Summarize message" } });
            setIcon(summarizeBtn, "scroll-text");
            view.registerDomEvent(summarizeBtn, "click", e => { e.stopPropagation(); view.handleSummarizeClick(originalLlMRawContent, summarizeBtn); });
        }
       
        // Кнопка "Regenerate" не з'являється, якщо це повідомлення з нативними tool_calls 
        // АБО якщо ОРИГІНАЛЬНИЙ контент містить текстові теги <tool_call>
        const originalContentContainsTextualToolCall = typeof originalLlMRawContent === 'string' && originalLlMRawContent.includes("<tool_call>");

        if ((!message.tool_calls || message.tool_calls.length === 0) && !originalContentContainsTextualToolCall) {
           const regenerateBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.REGENERATE_BUTTON || "regenerate-button", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { "aria-label": "Regenerate response", title: "Regenerate Response"}});
           setIcon(regenerateBtn, "refresh-cw");
           // Передаємо саме `message` (яке є AssistantMessage) до handleRegenerateClick
           // handleRegenerateClick має сам знайти попереднє повідомлення користувача
           view.registerDomEvent(regenerateBtn, "click", (e) => { e.stopPropagation(); view.handleRegenerateClick(message); }); 
        }

        const deleteBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.DELETE_MESSAGE_BUTTON || "delete-message-button", CSS_CLASSES.DANGER_OPTION || "danger-option", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { "aria-label": "Delete message", title: "Delete Message" } });
        setIcon(deleteBtn, "trash");
        view.registerDomEvent(deleteBtn, "click", e => { e.stopPropagation(); view.handleDeleteMessageClick(message); });
    }
}