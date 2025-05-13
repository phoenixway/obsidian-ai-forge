
import { App, Notice, setIcon, MarkdownRenderer } from "obsidian";
import { AssistantMessage, Message, ToolCall } from "../types";
import OllamaPlugin from "../main";
import { OllamaView } from "../OllamaView";
import { CSS_CLASSES } from "../constants";
import * as RendererUtils from "../MessageRendererUtils";
import { BaseMessageRenderer } from "./BaseMessageRenderer";
import { IMessageRenderer } from "./IMessageRenderer";
import { parseAllTextualToolCalls } from "@/utils/toolParser";

export class AssistantMessageRenderer extends BaseMessageRenderer implements IMessageRenderer {

    constructor(app: App, plugin: OllamaPlugin, message: AssistantMessage, view: OllamaView) {
        super(app, plugin, message, view);
        if (message.role !== "assistant") {
            plugin.logger.error("[AssistantMessageRenderer] Constructor error: Message role is not 'assistant'. Received:", message.role);
            throw new Error("AssistantMessageRenderer can only render messages with role 'assistant'.");
        }
    }

    
public static prepareDisplayContent(
    originalContent: string,
    assistantMessage: AssistantMessage,
    plugin: OllamaPlugin,
    view: OllamaView 
): string {
    const ts = assistantMessage.timestamp.getTime();
    plugin.logger.debug(`[PREP][ts:${ts}] === Starting prepareDisplayContent ===`);
    plugin.logger.debug(`[PREP][ts:${ts}] 1. Original content:\n"${originalContent}"`);

    const decodedContent = RendererUtils.decodeHtmlEntities(originalContent);
    plugin.logger.debug(`[PREP][ts:${ts}] 2. Content after decodeHtmlEntities:\n"${decodedContent}"`);

    const thinkDetection = RendererUtils.detectThinkingTags(decodedContent);
    let contentAfterThinkStripping = thinkDetection.contentWithoutTags;
    plugin.logger.debug(`[PREP][ts:${ts}] 3. Content after detectThinkingTags (hasThink: ${thinkDetection.hasThinkingTags}):\n"${contentAfterThinkStripping}"`);

    const hasNativeToolCalls = !!(assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0);
    const hasTextualToolCallTagsInContentAfterThinkStripping = contentAfterThinkStripping.includes("<tool_call>");
    plugin.logger.debug(`[PREP][ts:${ts}] 4. Tool checks: enableToolUse=${plugin.settings.enableToolUse}, hasNativeToolCalls=${hasNativeToolCalls}, hasTextualToolCallTagsInContentAfterThinkStripping=${hasTextualToolCallTagsInContentAfterThinkStripping}`);

    let finalDisplayContent = contentAfterThinkStripping; 

    if (plugin.settings.enableToolUse && (hasNativeToolCalls || hasTextualToolCallTagsInContentAfterThinkStripping)) {
        plugin.logger.info(`[PREP][ts:${ts}] 5. Tool call indicators detected. Formatting for display.`);
        
        let usingToolMessageText = "( ";
        const toolNamesExtracted: string[] = [];
        let accompanyingText = contentAfterThinkStripping; 

        if (hasNativeToolCalls && assistantMessage.tool_calls) {
            plugin.logger.debug(`[PREP][ts:${ts}] 5a. Processing NATIVE tool_calls. Count: ${assistantMessage.tool_calls.length}`);
            assistantMessage.tool_calls.forEach(tc => toolNamesExtracted.push(tc.function.name));
            
        } else if (hasTextualToolCallTagsInContentAfterThinkStripping) { 
            plugin.logger.debug(`[PREP][ts:${ts}] 5b. Processing TEXTUAL tool_call tags from: "${contentAfterThinkStripping.substring(0,150)}..."`);
            
            
            
            const parsedTextualCalls = parseAllTextualToolCalls(contentAfterThinkStripping, plugin.logger); 
            parsedTextualCalls.forEach(ptc => toolNamesExtracted.push(ptc.name));
            plugin.logger.debug(`[PREP][ts:${ts}] 5c. Extracted tool names via parseAllTextualToolCalls: [${toolNamesExtracted.join(', ')}]`);
            
            
            
            accompanyingText = contentAfterThinkStripping.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
            plugin.logger.debug(`[PREP][ts:${ts}] 5d. Accompanying text after initial <tool_call> replace: "${accompanyingText}"`);

            
            if (accompanyingText.includes("<tool_call>") || accompanyingText.includes("</tool_call>")) {
                plugin.logger.warn(`[PREP][ts:${ts}] Accompanying text still contains tool_call tags. Attempting forceful cleanup.`);
                let tempText = accompanyingText;
                
                tempText = tempText.replace(/<tool_call>/g, "").replace(/<\/tool_call>/g, "").trim();
                
                
                
                accompanyingText = tempText;
                plugin.logger.debug(`[PREP][ts:${ts}] 5e. Accompanying text after forceful cleanup: "${accompanyingText}"`);
            }
        }

        if (toolNamesExtracted.length > 0) {
            usingToolMessageText += `Using tool${toolNamesExtracted.length > 1 ? 's' : ''}: ${toolNamesExtracted.join(', ')}... `;
        } else { 
            usingToolMessageText += "Attempting to use tool(s)... ";
            plugin.logger.warn(`[PREP][ts:${ts}] No tool names were extracted, using generic message.`);
        }
        usingToolMessageText += ")";
        
        if (accompanyingText && accompanyingText.trim().length > 0) {
            finalDisplayContent = `${usingToolMessageText}\n\n${accompanyingText.trim()}`;
        } else {
            finalDisplayContent = usingToolMessageText;
        }
    }
    
    
    
    plugin.logger.info(`[PREP][ts:${ts}] === Final content for display ===:\n"${finalDisplayContent}"`);
    return finalDisplayContent;
}

    public async render(): Promise<HTMLElement> {
        const messageTimestampLog = this.message.timestamp.getTime();
        
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
        
        
        const displayContent = AssistantMessageRenderer.prepareDisplayContent(
            this.message.content || "",
            assistantMessage,
            this.plugin,
            this.view 
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

        AssistantMessageRenderer.addAssistantActionButtons(messageEl, contentEl, assistantMessage, this.plugin, this.view);
        BaseMessageRenderer.addTimestamp(messageEl, this.message.timestamp, this.view);
        
        setTimeout(() => { 
            if (messageEl.isConnected && contentEl.closest(`.${CSS_CLASSES.MESSAGE_GROUP || "message-group"}`)) {
                this.view.checkMessageForCollapsing(messageEl);
            }
        }, 70);

        return messageGroup;
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
       
        const originalContentContainsTextualToolCall = typeof originalLlMRawContent === 'string' && originalLlMRawContent.includes("<tool_call>");

        if ((!message.tool_calls || message.tool_calls.length === 0) && !originalContentContainsTextualToolCall) {
           const regenerateBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.REGENERATE_BUTTON || "regenerate-button", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { "aria-label": "Regenerate response", title: "Regenerate Response"}});
           setIcon(regenerateBtn, "refresh-cw");
           view.registerDomEvent(regenerateBtn, "click", (e) => { e.stopPropagation(); view.handleRegenerateClick(message); });
        }

        const deleteBtn = buttonsWrapper.createEl("button", { cls: [CSS_CLASSES.DELETE_MESSAGE_BUTTON || "delete-message-button", CSS_CLASSES.DANGER_OPTION || "danger-option", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"], attr: { "aria-label": "Delete message", title: "Delete Message" } });
        setIcon(deleteBtn, "trash");
        view.registerDomEvent(deleteBtn, "click", e => { e.stopPropagation(); view.handleDeleteMessageClick(message); });
    }
}