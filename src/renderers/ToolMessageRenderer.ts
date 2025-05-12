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
    // 1. Створюємо головний контейнер групи повідомлень
    const messageGroupEl = this.createMessageGroupWrapper([CSS_CLASSES.TOOL_MESSAGE_GROUP || "tool-message-group"]); // Додайте TOOL_MESSAGE_GROUP до CSS_CLASSES

    // 2. Додаємо аватар (або іконку інструменту)
    //    Передаємо isUser: false, щоб аватар був зліва, як у асистента/системи.
    //    RendererUtils.renderAvatar має обробити спеціальний тип 'tool', якщо ви його додали,
    //    або відобразить дефолтну іконку для "не-користувача".
    this.addAvatar(messageGroupEl, false); // 'false' означає, що це не повідомлення користувача

    // 3. Створюємо обгортку для самого повідомлення (бульбашки)
    const messageWrapperEl = messageGroupEl.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER });

    // 4. Створюємо структуру бульбашки повідомлення
    const { messageEl, contentContainer, contentEl } = this.createMessageBubble(
        messageWrapperEl,
        [CSS_CLASSES.TOOL_MESSAGE] // Основний клас для стилізації повідомлення інструменту
    );

    // 5. Рендеримо специфічний вміст для повідомлення інструменту
    this.renderToolSpecificContent(contentEl);

    // 6. Додаємо мітку часу
    BaseMessageRenderer.addTimestamp(messageEl, this.message.timestamp, this.view);
    
    // 7. Додаємо базові кнопки дій (наприклад, копіювати)
    // Передаємо this.message.content як текст для копіювання
    this.addBaseActionButtons(messageEl, this.message.content);


    return messageGroupEl;
  }

  protected renderToolSpecificContent(contentEl: HTMLElement): void {
    contentEl.empty(); // Очищуємо на випадок повторного рендерингу

    // Заголовок з назвою інструменту
    const toolHeader = contentEl.createDiv({ cls: CSS_CLASSES.TOOL_RESULT_HEADER });
    const iconSpan = toolHeader.createSpan({ cls: CSS_CLASSES.TOOL_RESULT_ICON });
    setIcon(iconSpan, "wrench"); // Іконка "гайковий ключ" для інструментів
    toolHeader.createSpan({
      text: `Tool Executed: ${this.message.name || "Unknown Tool"}`, // message.name має містити назву інструменту
    });

    // Вміст результату інструменту
    // Використовуємо <pre><code> для збереження форматування, оскільки результат може бути багаторядковим
    // або навіть містити JSON (хоча ми очікуємо рядок від SimpleFileAgent)
    const preEl = contentEl.createEl("pre", { cls: CSS_CLASSES.TOOL_RESULT_CONTENT });
    const codeEl = preEl.createEl("code");
    codeEl.setText(this.message.content); // this.message.content - це результат роботи інструменту

    // Тут не використовуємо MarkdownRenderer, оскільки результат інструменту - це дані,
    // а не Markdown для відображення (хоча це може залежати від конкретного інструменту).
    // Якщо інструмент повертає Markdown, тоді тут потрібно викликати MarkdownRenderer.
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