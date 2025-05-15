// src/renderers/ToolMessageRenderer.ts
import { App, MarkdownRenderer, setIcon } from "obsidian";
import OllamaPlugin from "../main"; // Адаптуйте шлях, якщо потрібно (напр. "@/main")
import { Message } from "../types"; // Адаптуйте шлях
import { OllamaView } from "../OllamaView"; // Адаптуйте шлях
import { BaseMessageRenderer } from "./BaseMessageRenderer";
import * as RendererUtils from "../MessageRendererUtils"; // Адаптуйте шлях
import { CSS_CLASSES } from "../constants"; // Адаптуйте шлях
import { IMessageRenderer } from "./IMessageRenderer";

export class ToolMessageRenderer extends BaseMessageRenderer implements IMessageRenderer {
  constructor(app: App, plugin: OllamaPlugin, message: Message, view: OllamaView) {
    super(app, plugin, message, view);
  }

  public render(): HTMLElement {
    const messageGroupEl = this.createMessageGroupWrapper([CSS_CLASSES.TOOL_MESSAGE_GROUP || "tool-message-group"]);
    this.addAvatar(messageGroupEl, false); 
    const messageWrapperEl = messageGroupEl.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER });
    const { messageEl, contentContainer, contentEl } = this.createMessageBubble(
        messageWrapperEl,
        [CSS_CLASSES.TOOL_MESSAGE] 
    );

    this.renderToolSpecificContent(contentEl, this.message.content);

    BaseMessageRenderer.addTimestamp(messageEl, this.message.timestamp, this.view);
    this.addBaseActionButtons(messageEl, this.message.content, this.message); // Передаємо оригінальний контент з маркерами, якщо кнопки копіювання мають копіювати саме його
    //fixme

    return messageGroupEl;
  }

    protected renderToolSpecificContent(contentEl: HTMLElement, rawContentWithMarkers: string): void {
    contentEl.empty(); 

    const toolHeader = contentEl.createDiv({ cls: CSS_CLASSES.TOOL_RESULT_HEADER });
    const iconSpan = toolHeader.createSpan({ cls: CSS_CLASSES.TOOL_RESULT_ICON });
    setIcon(iconSpan, "wrench"); 
    toolHeader.createSpan({
      text: `Tool Executed: ${this.message.name || "Unknown Tool"}`, 
    });

    const preEl = contentEl.createEl("pre", { cls: CSS_CLASSES.TOOL_RESULT_CONTENT });
    const codeEl = preEl.createEl("code");

    let displayContent = rawContentWithMarkers;
    const toolResultStartMarker = "[TOOL_RESULT]\n";
    const toolResultEndMarker = "\n[/TOOL_RESULT]";
    const toolErrorStartMarker = "[TOOL_ERROR]\n";
    const toolErrorEndMarker = "\n[/TOOL_ERROR]";

    if (displayContent.startsWith(toolResultStartMarker) && displayContent.endsWith(toolResultEndMarker)) {
        displayContent = displayContent.substring(toolResultStartMarker.length, displayContent.length - toolResultEndMarker.length);
    } else if (displayContent.startsWith(toolErrorStartMarker) && displayContent.endsWith(toolErrorEndMarker)) {
        displayContent = displayContent.substring(toolErrorStartMarker.length, displayContent.length - toolErrorEndMarker.length);
        // Можна додати спеціальну стилізацію для помилок інструменту тут, якщо потрібно
        // Наприклад, додати клас до preEl або codeEl
        preEl.addClass("tool-execution-error-display"); // Приклад класу
    }
    
    codeEl.setText(displayContent.trim());
  }

  // Перевизначаємо addAvatar, якщо потрібна особлива логіка для аватара інструменту.
  // Якщо стандартної логіки з BaseMessageRenderer + RendererUtils.renderAvatar достатньо,
  // цей метод можна не перевизначати (але тоді треба передавати isUser=false).
  // У вашому BaseMessageRenderer `addAvatar` не є абстрактним, тому його можна просто викликати.
  // Для прикладу, якщо RendererUtils.renderAvatar підтримує тип 'tool':
  // protected addAvatar(messageGroup: HTMLElement): void {
  //   RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, false, 'tool');
  // }
  // Якщо ні, то виклик this.addAvatar(messageGroupEl, false); з render() використає реалізацію з BaseMessageRenderer.
}