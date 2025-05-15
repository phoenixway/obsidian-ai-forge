// src/renderers/AssistantMessageRenderer.ts
import { App, Notice, setIcon, MarkdownRenderer } from "obsidian";
import { AssistantMessage, Message, ToolCall } from "../types";
import OllamaPlugin from "../main";
import { OllamaView } from "../OllamaView";
import { CSS_CLASSES } from "../constants";
import * as RendererUtils from "../MessageRendererUtils";
import { BaseMessageRenderer } from "./BaseMessageRenderer";
import { IMessageRenderer } from "./IMessageRenderer";
import { parseAllTextualToolCalls } from "@/utils/toolParser"; // Переконайся, що цей шлях правильний

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
    const logger = plugin.logger;

    const decodedContent = RendererUtils.decodeHtmlEntities(originalContent);
    const thinkDetection = RendererUtils.detectThinkingTags(decodedContent);
    let contentAfterThinkStripping = thinkDetection.contentWithoutTags;

    const hasNativeToolCalls = !!(assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0);
    const hasTextualToolCallTagsInProcessedContent = contentAfterThinkStripping.includes("<tool_call>");

    let finalDisplayContent = contentAfterThinkStripping;

    if (plugin.settings.enableToolUse && (hasNativeToolCalls || hasTextualToolCallTagsInProcessedContent)) {
      let toolUsageIndicatorActionText = "";
      const toolNamesExtracted: string[] = [];
      let accompanyingText = contentAfterThinkStripping;

      if (hasNativeToolCalls && assistantMessage.tool_calls) {
        assistantMessage.tool_calls.forEach(tc => toolNamesExtracted.push(tc.function.name));
      } else if (hasTextualToolCallTagsInProcessedContent) {
        try {
          const parsedTextualCalls = parseAllTextualToolCalls(contentAfterThinkStripping, logger);
          parsedTextualCalls.forEach(ptc => toolNamesExtracted.push(ptc.name));
          accompanyingText = contentAfterThinkStripping.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
          if (toolNamesExtracted.length === 0 && (accompanyingText.includes("<tool_call>") || accompanyingText.includes("</tool_call>"))) {
            accompanyingText = accompanyingText.replace(/<tool_call>/g, "").replace(/<\/tool_call>/g, "").trim();
          }
        } catch (parseError) {
          logger.error("Error parsing textual tool calls in prepareDisplayContent:", parseError);
          // Якщо парсинг не вдався, показуємо вихідний текст без змін (після видалення <think>)
          // або можна додати повідомлення про помилку парсингу
        }
      }

      if (toolNamesExtracted.length > 0) {
        toolUsageIndicatorActionText = `Using tool${toolNamesExtracted.length > 1 ? 's' : ''}: ${toolNamesExtracted.join(', ')}...`;
      } else {
        toolUsageIndicatorActionText = "Attempting to use tool(s)...";
      }
      
      const toolUsageIndicatorHTML = `<span class="${CSS_CLASSES.ASSISTANT_TOOL_USAGE_INDICATOR || 'assistant-tool-usage-indicator'}">→ ${toolUsageIndicatorActionText}</span>`;

      if (accompanyingText && accompanyingText.trim().length > 0) {
        finalDisplayContent = `${toolUsageIndicatorHTML}\n\n${accompanyingText.trim()}`;
      } else {
        finalDisplayContent = toolUsageIndicatorHTML;
      }
    }
    return finalDisplayContent;
  }

  public async render(): Promise<HTMLElement> {
    const messageGroup = this.createMessageGroupWrapper([CSS_CLASSES.OLLAMA_GROUP]);
    RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, false, "assistant");
    
    // Створюємо messageWrapper всередині messageGroup
    const messageWrapper = messageGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER });
    messageWrapper.style.order = "2"; 

    // Створюємо бульбашку .message всередині messageWrapper
    const { messageEl, contentEl } = this.createMessageBubble(messageWrapper, [CSS_CLASSES.OLLAMA_MESSAGE]);
    contentEl.addClass(CSS_CLASSES.CONTENT_COLLAPSIBLE);

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
      contentEl.setText(`[Error rendering assistant content: ${error instanceof Error ? error.message : String(error)}]`);
    }

    // Додаємо кнопки дій до messageWrapper (батьківського для messageEl)
    AssistantMessageRenderer.addAssistantActionButtons(
      messageWrapper,               // Тепер це messageWrapper
      contentEl,                    // contentEl все ще потрібен для handleTranslateClick
      assistantMessage,
      this.plugin,
      this.view
    );

    BaseMessageRenderer.addTimestamp(messageEl, this.message.timestamp, this.view);

    setTimeout(() => {
      if (messageEl.isConnected && contentEl.closest(`.${CSS_CLASSES.MESSAGE_GROUP}`)) {
        this.view.checkMessageForCollapsing(messageEl);
      }
    }, 70);

    return messageGroup;
  }

  public static addAssistantActionButtons(
    parentElementForActions: HTMLElement, // Це має бути messageWrapper
    contentElForTranslationContext: HTMLElement,
    message: AssistantMessage,
    plugin: OllamaPlugin,
    view: OllamaView
  ): void {
    // Перевіряємо, чи кнопки вже існують для цього конкретного повідомлення.
    // Оскільки ми передаємо messageWrapper, який може містити кілька повідомлень,
    // нам потрібен спосіб унікально ідентифікувати кнопки для цього повідомлення.
    // Можна використовувати data-attribute на message-actions-wrapper, що містить timestamp повідомлення.
    const messageTimestamp = message.timestamp.getTime().toString();
    const existingActions = parentElementForActions.querySelector(`.${CSS_CLASSES.MESSAGE_ACTIONS}[data-message-timestamp="${messageTimestamp}"]`);
    
    if (existingActions) {
      // Якщо кнопки для цього повідомлення вже є, нічого не робимо (або оновлюємо, якщо потрібно)
      return;
    }

    const buttonsWrapper = parentElementForActions.createDiv({ cls: CSS_CLASSES.MESSAGE_ACTIONS });
    buttonsWrapper.setAttribute("data-message-timestamp", messageTimestamp); // Додаємо ідентифікатор

    const originalLlMRawContent = message.content || "";

    const copyBtn = buttonsWrapper.createEl("button", {
      cls: [CSS_CLASSES.COPY_BUTTON, CSS_CLASSES.MESSAGE_ACTION_BUTTON],
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
        cls: [CSS_CLASSES.TRANSLATE_BUTTON, CSS_CLASSES.MESSAGE_ACTION_BUTTON],
        attr: { "aria-label": "Translate", title: "Translate" },
      });
      setIcon(translateBtn, "languages");
      view.registerDomEvent(translateBtn, "click", e => {
        e.stopPropagation();
        if (contentElForTranslationContext.isConnected) {
          view.handleTranslateClick(originalLlMRawContent, contentElForTranslationContext, translateBtn);
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
        cls: [CSS_CLASSES.SUMMARIZE_BUTTON, CSS_CLASSES.MESSAGE_ACTION_BUTTON],
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
        cls: [CSS_CLASSES.REGENERATE_BUTTON, CSS_CLASSES.MESSAGE_ACTION_BUTTON],
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
        CSS_CLASSES.DELETE_MESSAGE_BUTTON,
        CSS_CLASSES.DANGER_OPTION,
        CSS_CLASSES.MESSAGE_ACTION_BUTTON,
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