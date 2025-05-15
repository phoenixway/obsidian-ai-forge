// src/renderers/BaseMessageRenderer.ts
import { App, setIcon } from "obsidian";
import { Message } from "../types";
import OllamaPlugin from "../main";
import { OllamaView } from "../OllamaView";
import { CSS_CLASSES } from "../constants";
import * as RendererUtils from "../MessageRendererUtils"; // Переконайся, що шлях правильний
import { IMessageRenderer } from "./IMessageRenderer";

export abstract class BaseMessageRenderer implements IMessageRenderer {
  protected readonly app: App;
  protected readonly plugin: OllamaPlugin;
  protected readonly message: Message;
  protected readonly view: OllamaView;

  constructor(app: App, plugin: OllamaPlugin, message: Message, view: OllamaView) {
    this.app = app;
    this.plugin = plugin;
    this.message = message;
    this.view = view;
  }

  // Метод render тепер має бути реалізований у конкретних класах-нащадках.
  // У цьому методі нащадки спочатку створюватимуть messageGroup, потім messageWrapper,
  // потім messageEl (викликаючи createMessageBubble з messageWrapper),
  // а потім додаватимуть кнопки дій до messageWrapper (викликаючи addBaseActionButtons або специфічний для типу).
  abstract render(): Promise<HTMLElement> | HTMLElement;

  /**
   * Створює зовнішню обгортку для групи повідомлень (.message-group).
   * @param groupClasses Додаткові класи для .message-group.
   * @returns Створений HTMLElement.
   */
  protected createMessageGroupWrapper(groupClasses: string[] = []): HTMLElement {
    const messageGroup = document.createElement("div");
    messageGroup.classList.add(CSS_CLASSES.MESSAGE_GROUP, ...groupClasses);
    messageGroup.setAttribute("data-timestamp", this.message.timestamp.getTime().toString());
    return messageGroup;
  }

  /**
   * Створює та додає елемент мітки часу до вказаного батьківського елемента (зазвичай .message).
   * @param parentElement - Елемент, куди додати мітку часу.
   * @param timestamp - Об'єкт Date для форматування.
   * @param view - Екземпляр OllamaView для доступу до форматера.
   */
  public static addTimestamp(parentElement: HTMLElement, timestamp: Date, view: OllamaView): void {
    if (parentElement.querySelector(`.${CSS_CLASSES.TIMESTAMP}`)) {
      return;
    }
    parentElement.createDiv({
      cls: CSS_CLASSES.TIMESTAMP,
      text: view.formatTime(timestamp),
    });
  }

  /**
   * Допоміжний метод для рендерингу аватара.
   * @param messageGroup Елемент .message-group, куди буде додано аватар.
   * @param isUser Прапорець, чи це повідомлення користувача.
   */
  protected addAvatar(messageGroup: HTMLElement, isUser: boolean): void {
    RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, isUser, this.message.role);
  }

  /**
   * Додає базовий набір кнопок дій (Копіювати, Видалити) до вказаного батьківського елемента.
   * Цей метод призначений для використання в рендерерах, де потрібен лише базовий набір.
   * @param parentElementForActions Елемент (зазвичай .message-wrapper), куди будуть додані кнопки.
   * @param contentToCopy Текст, який буде копіюватися.
   * @param messageForContext Повідомлення, до якого відносяться ці кнопки (для видалення).
   */
  protected addBaseActionButtons(
    parentElementForActions: HTMLElement, 
    contentToCopy: string,
    messageForContext: Message // Явно передаємо повідомлення для контексту видалення
  ): void {
    const messageTimestamp = messageForContext.timestamp.getTime().toString();
    const existingActions = parentElementForActions.querySelector(`.${CSS_CLASSES.MESSAGE_ACTIONS}[data-message-timestamp="${messageTimestamp}"]`);
    
    if (existingActions) {
      return; // Уникаємо дублювання, якщо кнопки вже існують для цього повідомлення
    }

    // Використовуємо CSS_CLASSES.MESSAGE_ACTIONS, якщо визначено, інакше "message-actions-wrapper"
    const actionsWrapperClass = CSS_CLASSES.MESSAGE_ACTIONS || "message-actions-wrapper";
    const buttonsWrapper = parentElementForActions.createDiv({ cls: actionsWrapperClass });
    buttonsWrapper.setAttribute("data-message-timestamp", messageTimestamp);


    const copyButtonClass = CSS_CLASSES.COPY_BUTTON || "copy-button";
    const actionButtonBaseClass = CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button";
    const deleteButtonClass = CSS_CLASSES.DELETE_MESSAGE_BUTTON || "delete-message-button";
    const dangerOptionClass = CSS_CLASSES.DANGER_OPTION || "danger-option";

    // Copy Button
    const copyBtn = buttonsWrapper.createEl("button", { 
      cls: [copyButtonClass, actionButtonBaseClass], 
      attr: { "aria-label": "Copy", title: "Copy" } 
    });
    setIcon(copyBtn, "copy");
    this.view.registerDomEvent(copyBtn, "click", e => { 
      e.stopPropagation(); 
      this.view.handleCopyClick(contentToCopy, copyBtn); 
    });

    // Delete Button
    const deleteBtn = buttonsWrapper.createEl("button", { 
      cls: [deleteButtonClass, dangerOptionClass, actionButtonBaseClass], 
      attr: { "aria-label": "Delete message", title: "Delete Message" } 
    });
    setIcon(deleteBtn, "trash");
    this.view.registerDomEvent(deleteBtn, "click", e => { 
      e.stopPropagation(); 
      this.view.handleDeleteMessageClick(messageForContext); // Використовуємо messageForContext
    });
  }

  /**
   * Створює бульбашку повідомлення (.message) та її внутрішні контейнери для контенту.
   * @param messageWrapperEl Елемент-обгортка (.message-wrapper), куди буде додано .message.
   * @param messageClasses Додаткові класи для .message.
   * @returns Об'єкт з посиланнями на створені елементи: messageEl, contentContainer, contentEl.
   */
  protected createMessageBubble(
    messageWrapperEl: HTMLElement, 
    messageClasses: string[] = []
  ): { messageEl: HTMLElement; contentContainer: HTMLElement; contentEl: HTMLElement; } {
    const messageEl = messageWrapperEl.createDiv({ cls: [CSS_CLASSES.MESSAGE, ...messageClasses] });
    const contentContainer = messageEl.createDiv({ cls: CSS_CLASSES.CONTENT_CONTAINER });
    const contentEl = contentContainer.createDiv({ cls: CSS_CLASSES.CONTENT });
    return { messageEl, contentContainer, contentEl };
  }
}