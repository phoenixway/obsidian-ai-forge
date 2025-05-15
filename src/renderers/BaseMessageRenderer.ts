// src/renderers/BaseMessageRenderer.ts
import { App, setIcon } from "obsidian";
import { Message } from "../types"; 
import OllamaPlugin from "../main";
import { OllamaView } from "../OllamaView";
import { CSS_CLASSES } from "../constants";
import * as RendererUtils from "../MessageRendererUtils"; 
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

  abstract render(): Promise<HTMLElement> | HTMLElement;

  protected createMessageGroupWrapper(groupClasses: string[] = []): HTMLElement {
    const messageGroup = document.createElement("div");
    messageGroup.classList.add(CSS_CLASSES.MESSAGE_GROUP, ...groupClasses);
    messageGroup.setAttribute("data-timestamp", this.message.timestamp.getTime().toString());
    return messageGroup;
  }

  public static addTimestampToElement(parentElementForTimestamp: HTMLElement, timestamp: Date, view: OllamaView): void {
    let tsEl = parentElementForTimestamp.querySelector<HTMLElement>(`.${CSS_CLASSES.TIMESTAMP}`);
    if (tsEl) {
      tsEl.setText(view.formatTime(timestamp)); 
    } else {
      tsEl = parentElementForTimestamp.createDiv({
        cls: CSS_CLASSES.TIMESTAMP,
        text: view.formatTime(timestamp),
      });
    }
  }
  
  protected addAvatar(messageGroup: HTMLElement, isUser: boolean): void {
    RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, isUser, this.message.role);
  }

  /**
   * Додає набір кнопок дій (Toggle Collapse, Копіювати, Видалити) до .message-actions-wrapper,
   * який має бути створений всередині parentElementForMeta.
   * Кнопка "Toggle Collapse" додається першою і спочатку прихована.
   * @param parentElementForMeta Елемент (зазвичай .message-meta-actions-wrapper), куди буде додано .message-actions-wrapper.
   * @param contentToCopy Текст, який буде копіюватися кнопкою "Copy".
   * @param messageForContext Повідомлення, до якого відносяться ці кнопки.
   * @returns Створений HTMLElement (.message-actions-wrapper).
   */
  protected addBaseActionButtons(
    parentElementForMeta: HTMLElement, 
    contentToCopy: string,
    messageForContext: Message
  ): HTMLElement {
    const messageTimestamp = messageForContext.timestamp.getTime().toString();
    
    let actionsWrapper = parentElementForMeta.querySelector<HTMLElement>(`.${CSS_CLASSES.MESSAGE_ACTIONS}[data-message-timestamp="${messageTimestamp}"]`);
    
    if (actionsWrapper) {
      actionsWrapper.empty(); 
    } else {
      const actionsWrapperClass = CSS_CLASSES.MESSAGE_ACTIONS || "message-actions-wrapper";
      actionsWrapper = parentElementForMeta.createDiv({ cls: actionsWrapperClass });
      actionsWrapper.setAttribute("data-message-timestamp", messageTimestamp);
    }

    // Класи кнопок
    const actionButtonBaseClass = CSS_CLASSES.MESSAGE_ACTION_BUTTON || "message-action-button";
    const toggleCollapseButtonClass = CSS_CLASSES.TOGGLE_COLLAPSE_BUTTON || "toggle-collapse-button";
    const copyButtonClass = CSS_CLASSES.COPY_BUTTON || "copy-button";
    const deleteButtonClass = CSS_CLASSES.DELETE_MESSAGE_BUTTON || "delete-message-button";
    const dangerOptionClass = CSS_CLASSES.DANGER_OPTION || "danger-option";

    // 1. Кнопка "Toggle Collapse" (завжди перша)
    const toggleCollapseBtn = actionsWrapper.createEl("button", {
      cls: [toggleCollapseButtonClass, actionButtonBaseClass],
      attr: { "aria-label": "Toggle content", title: "Toggle content" }
    });
    setIcon(toggleCollapseBtn, "chevrons-up-down"); // Початкова іконка
    toggleCollapseBtn.hide(); // Спочатку прихована, OllamaView.checkMessageForCollapsing її покаже
    
    this.view.registerDomEvent(toggleCollapseBtn, "click", (e) => {
      e.stopPropagation();
      const messageGroup = toggleCollapseBtn.closest<HTMLElement>(`.${CSS_CLASSES.MESSAGE_GROUP}`);
      if (messageGroup) {
        const contentCollapsible = messageGroup.querySelector<HTMLElement>(`.${CSS_CLASSES.CONTENT_COLLAPSIBLE}`);
        if (contentCollapsible) {
          this.view.toggleMessageCollapse(contentCollapsible, toggleCollapseBtn);
        } else {
          console.warn("Could not find .content-collapsible for toggle button in group:", messageGroup);
        }
      } else {
        console.warn("Could not find .message-group for toggle button:", toggleCollapseBtn);
      }
    });

    // 2. Кнопка "Копіювати"
    const copyBtn = actionsWrapper.createEl("button", { 
      cls: [copyButtonClass, actionButtonBaseClass], 
      attr: { "aria-label": "Copy", title: "Copy" } 
    });
    setIcon(copyBtn, "copy");
    this.view.registerDomEvent(copyBtn, "click", e => { 
      e.stopPropagation(); 
      this.view.handleCopyClick(contentToCopy, copyBtn); 
    });

    // 3. Кнопка "Видалити"
    const deleteBtn = actionsWrapper.createEl("button", { 
      cls: [deleteButtonClass, dangerOptionClass, actionButtonBaseClass], 
      attr: { "aria-label": "Delete message", title: "Delete Message" } 
    });
    setIcon(deleteBtn, "trash");
    this.view.registerDomEvent(deleteBtn, "click", e => { 
      e.stopPropagation(); 
      this.view.handleDeleteMessageClick(messageForContext); 
    });
    
    // Інші кнопки (наприклад, Translate, Summarize для AssistantMessageRenderer) 
    // будуть додані після цих базових кнопок, якщо AssistantMessageRenderer викличе super.addBaseActionButtons,
    // а потім додасть свої. Це збереже "Toggle Collapse" першою.

    return actionsWrapper;
  }

  protected createMessageBubble(
    messageWrapperEl: HTMLElement, 
    messageClasses: string[] = []
  ): { messageEl: HTMLElement; contentContainer: HTMLElement; contentEl: HTMLElement; } {
    const messageEl = messageWrapperEl.createDiv({ cls: [CSS_CLASSES.MESSAGE, ...messageClasses] });
    const contentContainer = messageEl.createDiv({ cls: CSS_CLASSES.CONTENT_CONTAINER });
    // Важливо: contentEl тепер має мати клас CSS_CLASSES.CONTENT_COLLAPSIBLE
    const contentEl = contentContainer.createDiv({ cls: [CSS_CLASSES.CONTENT, CSS_CLASSES.CONTENT_COLLAPSIBLE] });
    return { messageEl, contentContainer, contentEl };
  }
}