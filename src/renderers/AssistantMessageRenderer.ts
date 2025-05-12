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
            throw new Error("AssistantMessageRenderer can only render messages with role 'assistant'.");
        }
    }

    
      // НОВИЙ СТАТИЧНИЙ МЕТОД для підготовки контенту
      public static prepareDisplayContent(
        originalContent: string, 
        assistantMessage: AssistantMessage, // Для доступу до native tool_calls
        plugin: OllamaPlugin
    ): string {
        const messageTimestampLog = assistantMessage.timestamp.getTime(); // Для логів
        let finalContentToDisplay = originalContent;

        const thinkDetection = RendererUtils.detectThinkingTags(RendererUtils.decodeHtmlEntities(originalContent));
        let contentWithoutThinkTags = thinkDetection.contentWithoutTags;
        
        const hasTextualToolCallTagsInStrippedContent = contentWithoutThinkTags.includes("<tool_call>");
        const hasNativeToolCalls = !!(assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0);

        plugin.logger.debug(`[ARender STATIC PREP][ts:${messageTimestampLog}] Checks: enableToolUse=${plugin.settings.enableToolUse}, hasTextualToolCallTags=${hasTextualToolCallTagsInStrippedContent}, hasNativeToolCalls=${hasNativeToolCalls}.`);

        if (plugin.settings.enableToolUse && (hasTextualToolCallTagsInStrippedContent || hasNativeToolCalls)) {
            plugin.logger.info(`[ARender STATIC PREP][ts:${messageTimestampLog}] Tool call indicators present. Preparing user-friendly display content.`);
            
            let usingToolMessageText = "( ";
            const toolNamesCalled: string[] = [];
            let accompanyingText = contentWithoutThinkTags;

            if (hasNativeToolCalls && assistantMessage.tool_calls) {
                plugin.logger.debug(`[ARender STATIC PREP][ts:${messageTimestampLog}] Processing NATIVE tool_calls. Count: ${assistantMessage.tool_calls.length}`);
                assistantMessage.tool_calls.forEach(tc => toolNamesCalled.push(tc.function.name));
                // accompanyingText вже є contentWithoutThinkTags
            } else if (hasTextualToolCallTagsInStrippedContent) {
                plugin.logger.debug(`[ARender STATIC PREP][ts:${messageTimestampLog}] Processing TEXTUAL tool_call tags from: "${contentWithoutThinkTags.substring(0,150)}..."`);
                const toolCallRegex = /<tool_call>\s*{\s*"name"\s*:\s*"([^"]+)"[\s\S]*?}\s*<\/tool_call>/g;
                let match;
                toolCallRegex.lastIndex = 0;
                while((match = toolCallRegex.exec(contentWithoutThinkTags)) !== null) { // Парсимо з contentWithoutThinkTags
                    if (match[1]) toolNamesCalled.push(match[1]);
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
            }
            usingToolMessageText += ")";
            
            finalContentToDisplay = (accompanyingText && accompanyingText.trim()) 
                                 ? `${usingToolMessageText}\n\n${accompanyingText.trim()}` 
                                 : usingToolMessageText;
        } else {
            finalContentToDisplay = contentWithoutThinkTags;
        }
        plugin.logger.info(`[ARender STATIC PREP][ts:${messageTimestampLog}] Prepared display content: "${finalContentToDisplay}"`);
        return finalContentToDisplay;
    }

    public async render(): Promise<HTMLElement> {
        const messageTimestampLog = this.message.timestamp.getTime();
        this.plugin.logger.debug(`[ARender INSTANCE][ts:${messageTimestampLog}] render() called.`);

        const messageGroup = this.createMessageGroupWrapper([CSS_CLASSES.OLLAMA_GROUP || "ollama-message-group"]);
        RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, false, 'assistant');
        const messageWrapper = messageGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
        messageWrapper.style.order = "2";
        const { messageEl, contentEl } = this.createMessageBubble(
            messageWrapper,
            [CSS_CLASSES.OLLAMA_MESSAGE || "ollama-message"]
        );
        contentEl.addClass(CSS_CLASSES.CONTENT_COLLAPSIBLE || "message-content-collapsible");

        // Використовуємо новий статичний метод для підготовки контенту
        const displayContent = AssistantMessageRenderer.prepareDisplayContent(
            this.message.content || "", 
            this.message as AssistantMessage, 
            this.plugin
        );
        
        try {
            await RendererUtils.renderMarkdownContent(
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

        AssistantMessageRenderer.addAssistantActionButtons(messageEl, contentEl, this.message as AssistantMessage, this.plugin, this.view);
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
         const finalContent = message.content; 

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
        
         const contentContainsTextualToolCall = typeof finalContent === 'string' && finalContent.includes("<tool_call>");

         if ((!message.tool_calls || message.tool_calls.length === 0) && !contentContainsTextualToolCall) {
            const regenerateBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.REGENERATE_BUTTON || "regenerate-button", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { "aria-label": "Regenerate response", title: "Regenerate Response"}});
            setIcon(regenerateBtn, "refresh-cw");
            view.registerDomEvent(regenerateBtn, "click", (e) => { e.stopPropagation(); view.handleRegenerateClick(message); }); 
         }

         const deleteBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.DELETE_MESSAGE_BUTTON || "delete-message-button", CSS_CLASSES.DANGER_OPTION || "danger-option", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { "aria-label": "Delete message", title: "Delete Message" } });
         setIcon(deleteBtn, "trash");
         view.registerDomEvent(deleteBtn, "click", e => { e.stopPropagation(); view.handleDeleteMessageClick(message); });
    }
}