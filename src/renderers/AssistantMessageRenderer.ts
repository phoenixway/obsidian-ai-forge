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
      throw new Error("AssistantMessageRenderer can only render messages with role 'assistant'.");
    }
  }

  public static prepareDisplayContent(
    originalContent: string,
    assistantMessage: AssistantMessage,
    plugin: OllamaPlugin,
    view: OllamaView
  ): string {
    const messageTimestampLog = assistantMessage.timestamp.getTime();
    let toolUsagePrefix = "→ "; // Наприклад, стрілка або іконка інструменту (див. нижче)
let toolMessageAction = "";
const logger = plugin.logger; // Для зручності
    const ts = assistantMessage.timestamp.getTime();

    const decodedContent = RendererUtils.decodeHtmlEntities(originalContent);

    const thinkDetection = RendererUtils.detectThinkingTags(decodedContent);
    let contentAfterThinkStripping = thinkDetection.contentWithoutTags;

    const hasNativeToolCalls = !!(assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0);
    const hasTextualToolCallTagsInProcessedContent = contentAfterThinkStripping.includes("<tool_call>");

    let finalDisplayContent = contentAfterThinkStripping;
    if (plugin.settings.enableToolUse && (hasNativeToolCalls || hasTextualToolCallTagsInProcessedContent)) {
        
        let toolUsageIndicatorActionText = "";
        const toolNamesExtracted: string[] = [];
        // Текст, що залишиться ПІСЛЯ видалення <tool_call> тегів з contentToProcess (який вже без <think>)
        let accompanyingText = contentAfterThinkStripping; 

        if (hasNativeToolCalls && assistantMessage.tool_calls) {
            assistantMessage.tool_calls.forEach(tc => toolNamesExtracted.push(tc.function.name));
            // Для нативних викликів, `accompanyingText` (який є `contentToProcess`)
            // це текст, що міг бути разом з нативними tool_calls (вже без <think>).
            // Ми не видаляємо з нього нічого додатково на цьому етапі.
        } else if (hasTextualToolCallTagsInProcessedContent) { 
            
            // Використовуємо parseAllTextualToolCalls з OllamaView для отримання імен
            // Важливо, що parseAllTextualToolCalls отримує текст, де ВЖЕ НЕМАЄ <think> тегів
            const parsedTextualCalls = parseAllTextualToolCalls(contentAfterThinkStripping, logger); 
            parsedTextualCalls.forEach(ptc => toolNamesExtracted.push(ptc.name));
            
            // Видаляємо <tool_call> теги з contentToProcess для отримання супровідного тексту
            // Цей replace може бути проблематичним, якщо теги пошкоджені
            accompanyingText = contentAfterThinkStripping.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();

            // Додаткове "грубе" очищення, якщо попереднє не спрацювало ідеально
            // і якщо імена не були витягнуті (що може вказувати на проблеми з тегами)
            if (toolNamesExtracted.length === 0 && (accompanyingText.includes("<tool_call>") || accompanyingText.includes("</tool_call>"))) {
                let tempText = accompanyingText;
                tempText = tempText.replace(/<tool_call>/g, "").replace(/<\/tool_call>/g, "").trim();
                accompanyingText = tempText;
            }
        }

        // Формуємо текст для індикатора
        if (toolNamesExtracted.length > 0) {
            toolUsageIndicatorActionText = `Using tool${toolNamesExtracted.length > 1 ? 's' : ''}: ${toolNamesExtracted.join(', ')}...`;
        } else { 
            toolUsageIndicatorActionText = "Attempting to use tool(s)...";
        }
        
        // Обгортаємо індикатор в span зі спеціальним класом
        const toolUsageIndicatorHTML = `<span class="${CSS_CLASSES.ASSISTANT_TOOL_USAGE_INDICATOR || 'assistant-tool-usage-indicator'}">→ ${toolUsageIndicatorActionText}</span>`;

        // Збираємо фінальний контент для відображення
        if (accompanyingText && accompanyingText.trim().length > 0) {
            finalDisplayContent = `${toolUsageIndicatorHTML}\n\n${accompanyingText.trim()}`;
        } else {
            finalDisplayContent = toolUsageIndicatorHTML;
        }
    }


    return finalDisplayContent;
  }

  public async render(): Promise<HTMLElement> {
    const messageTimestampLog = this.message.timestamp.getTime();

    const messageGroup = this.createMessageGroupWrapper([CSS_CLASSES.OLLAMA_GROUP || "ollama-message-group"]);
    RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, false, "assistant");
    const messageWrapper = messageGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER || "message-wrapper" });
    messageWrapper.style.order = "2";
    const { messageEl, contentEl } = this.createMessageBubble(messageWrapper, [
      CSS_CLASSES.OLLAMA_MESSAGE || "ollama-message",
    ]);
    contentEl.addClass(CSS_CLASSES.CONTENT_COLLAPSIBLE || "message-content-collapsible");

    const assistantMessage = this.message as AssistantMessage;

    const displayContent = AssistantMessageRenderer.prepareDisplayContent(
      this.message.content || "",
      assistantMessage,
      this.plugin,
      this.view
    );

    try {
      await RendererUtils.renderMarkdownContent(this.app, this.view, this.plugin, contentEl, displayContent);
    } catch (error) {
      contentEl.setText(
        `[Error rendering assistant content: ${error instanceof Error ? error.message : String(error)}]`
      );
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

    const copyBtn = buttonsWrapper.createEl("button", {
      cls: [CSS_CLASSES.COPY_BUTTON || "copy-button", CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button"],
      attr: { "aria-label": "Copy", title: "Copy" },
    });
    setIcon(copyBtn, "copy");
    view.registerDomEvent(copyBtn, "click", e => {
      e.stopPropagation();
      view.handleCopyClick(originalLlMRawContent, copyBtn);
    });

    if (
      plugin.settings.enableTranslation &&
      ((plugin.settings.translationProvider === "google" && plugin.settings.googleTranslationApiKey) ||
        (plugin.settings.translationProvider === "ollama" && plugin.settings.ollamaTranslationModel)) &&
      originalLlMRawContent &&
      originalLlMRawContent.trim()
    ) {
      const translateBtn = buttonsWrapper.createEl("button", {
        cls: [
          CSS_CLASSES.TRANSLATE_BUTTON || "translate-button",
          CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button",
        ],
        attr: { "aria-label": "Translate", title: "Translate" },
      });
      setIcon(translateBtn, "languages");
      view.registerDomEvent(translateBtn, "click", e => {
        e.stopPropagation();
        if (contentEl.isConnected) {
          view.handleTranslateClick(originalLlMRawContent, contentEl, translateBtn);
        } else {
          new Notice("Cannot translate: message content element not found.");
        }
      });
    }

    if (
      plugin.settings.enableSummarization &&
      plugin.settings.summarizationModelName &&
      originalLlMRawContent &&
      originalLlMRawContent.trim()
    ) {
      const summarizeBtn = buttonsWrapper.createEl("button", {
        cls: [
          CSS_CLASSES.SUMMARIZE_BUTTON || "summarize-button",
          CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button",
        ],
        attr: { title: "Summarize message" },
      });
      setIcon(summarizeBtn, "scroll-text");
      view.registerDomEvent(summarizeBtn, "click", e => {
        e.stopPropagation();
        view.handleSummarizeClick(originalLlMRawContent, summarizeBtn);
      });
    }

    const originalContentContainsTextualToolCall =
      typeof originalLlMRawContent === "string" && originalLlMRawContent.includes("<tool_call>");

    if ((!message.tool_calls || message.tool_calls.length === 0) && !originalContentContainsTextualToolCall) {
      const regenerateBtn = buttonsWrapper.createEl("button", {
        cls: [
          CSS_CLASSES.REGENERATE_BUTTON || "regenerate-button",
          CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button",
        ],
        attr: { "aria-label": "Regenerate response", title: "Regenerate Response" },
      });
      setIcon(regenerateBtn, "refresh-cw");
      view.registerDomEvent(regenerateBtn, "click", e => {
        e.stopPropagation();
        view.handleRegenerateClick(message);
      });
    }

    const deleteBtn = buttonsWrapper.createEl("button", {
      cls: [
        CSS_CLASSES.DELETE_MESSAGE_BUTTON || "delete-message-button",
        CSS_CLASSES.DANGER_OPTION || "danger-option",
        CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button",
      ],
      attr: { "aria-label": "Delete message", title: "Delete Message" },
    });
    setIcon(deleteBtn, "trash");
    view.registerDomEvent(deleteBtn, "click", e => {
      e.stopPropagation();
      view.handleDeleteMessageClick(message);
    });
  }
}
