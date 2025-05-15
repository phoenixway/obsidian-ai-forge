// src/renderers/ToolMessageRenderer.ts
import { App, MarkdownRenderer, setIcon } from "obsidian";
import OllamaPlugin from "../main"; 
import { Message } from "../types"; 
import { OllamaView } from "../OllamaView"; 
import { BaseMessageRenderer } from "./BaseMessageRenderer";
import * as RendererUtils from "../MessageRendererUtils"; 
import { CSS_CLASSES } from "../constants"; 
import { IMessageRenderer } from "./IMessageRenderer";

export class ToolMessageRenderer extends BaseMessageRenderer implements IMessageRenderer {
  constructor(app: App, plugin: OllamaPlugin, message: Message, view: OllamaView) {
    super(app, plugin, message, view);
    if (message.role !== "tool") {
      throw new Error("ToolMessageRenderer can only render messages with role 'tool'.");
    }
  }

  public render(): HTMLElement {
    const messageGroupEl = this.createMessageGroupWrapper([CSS_CLASSES.TOOL_MESSAGE_GROUP || "tool-message-group"]);
    
    // Використовуємо метод addAvatar з BaseMessageRenderer, передаючи isUser = false
    // або спеціальний тип, якщо RendererUtils.renderAvatar його підтримує
    this.addAvatar(messageGroupEl, false); // Або RendererUtils.renderAvatar(this.app, this.plugin, messageGroupEl, false, 'tool');

    const messageWrapperEl = messageGroupEl.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER });
    
    const { messageEl, contentEl } = this.createMessageBubble( // contentContainer не використовується прямо тут, але повертається
        messageWrapperEl,
        [CSS_CLASSES.TOOL_MESSAGE || "tool-message"] 
    );

    this.renderToolSpecificContent(contentEl, this.message.content);

    // Створюємо обгортку для timestamp та кнопок
    const metaActionsWrapper = messageWrapperEl.createDiv({ cls: "message-meta-actions-wrapper" });
    
    // Додаємо timestamp до metaActionsWrapper
    BaseMessageRenderer.addTimestampToElement(metaActionsWrapper, this.message.timestamp, this.view);
    
    // Додаємо блок кнопок (.message-actions-wrapper) до metaActionsWrapper
    // Використовуємо addBaseActionButtons з BaseMessageRenderer, оскільки для Tool повідомлень
    // зазвичай потрібні лише базові кнопки (Копіювати, Видалити).
    // Якщо потрібні специфічні кнопки, створи окремий метод.
    this.addBaseActionButtons(
        metaActionsWrapper, 
        this.message.content, // Контент для копіювання
        this.message          // Повідомлення для контексту (наприклад, для видалення)
    );

    // setTimeout для перевірки згортання, якщо це потрібно для tool-повідомлень
    setTimeout(() => {
      if (messageEl.isConnected && contentEl.closest(`.${CSS_CLASSES.MESSAGE_GROUP}`)) {
        this.view.checkMessageForCollapsing(messageEl);
      }
    }, 70);

    return messageGroupEl;
  }

  protected renderToolSpecificContent(contentEl: HTMLElement, rawContentWithMarkers: string): void {
    contentEl.empty(); 

    const toolHeader = contentEl.createDiv({ cls: CSS_CLASSES.TOOL_RESULT_HEADER || "tool-result-header" });
    const iconSpan = toolHeader.createSpan({ cls: CSS_CLASSES.TOOL_RESULT_ICON || "tool-result-icon" });
    setIcon(iconSpan, "wrench"); // Або інша іконка для інструментів
    toolHeader.createSpan({
      text: `Tool: ${this.message.name || "Executed Tool"}`, // this.message.name - це ім'я інструменту
    });

    const preEl = contentEl.createEl("pre", { cls: CSS_CLASSES.TOOL_RESULT_CONTENT || "tool-result-content" });
    const codeEl = preEl.createEl("code");

    let displayContent = rawContentWithMarkers;
    const toolResultStartMarker = "[TOOL_RESULT]\n";
    const toolResultEndMarker = "\n[/TOOL_RESULT]";
    const toolErrorStartMarker = "[TOOL_ERROR]\n";
    const toolErrorEndMarker = "\n[/TOOL_ERROR]";

    if (displayContent.startsWith(toolResultStartMarker) && displayContent.endsWith(toolResultEndMarker)) {
        displayContent = displayContent.substring(toolResultStartMarker.length, displayContent.length - toolResultEndMarker.length);
        preEl.addClass("tool-execution-success"); // Додатковий клас для успішного виконання
    } else if (displayContent.startsWith(toolErrorStartMarker) && displayContent.endsWith(toolErrorEndMarker)) {
        displayContent = displayContent.substring(toolErrorStartMarker.length, displayContent.length - toolErrorEndMarker.length);
        preEl.addClass("tool-execution-error-display"); 
        toolHeader.addClass("tool-execution-error-header"); // Стилізуємо заголовок теж
    }
    
    codeEl.setText(displayContent.trim());
  }
}