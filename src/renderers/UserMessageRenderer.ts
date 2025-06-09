// src/renderers/UserMessageRenderer.ts
import { BaseMessageRenderer } from "./BaseMessageRenderer";
import { CSS_CLASSES } from "../constants";
import { App, setIcon, Notice, MarkdownRenderer } from "obsidian"; // <--- ДОДАЙ Notice ДО ІМПОРТІВ
import { Message } from "../types";
import OllamaPlugin from "../main";
import { OllamaView } from "../OllamaView";
import * as RendererUtils from "../MessageRendererUtils";

export class UserMessageRenderer extends BaseMessageRenderer {

	constructor(app: App, plugin: OllamaPlugin, message: Message, view: OllamaView) {
		super(app, plugin, message, view);
		if (message.role !== "user") {
			throw new Error("UserMessageRenderer can only render messages with role 'user'.");
		}
	}

				public render(): HTMLElement {
		const messageGroup = this.createMessageGroupWrapper([CSS_CLASSES.USER_MESSAGE_GROUP]);
		RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, true, "user");

        // messageWrapper тепер буде містити все: картки, бульбашку, мета-інформацію
		const messageWrapper = messageGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER });
		messageWrapper.style.order = "1"; // Для користувача все праворуч від аватара

        // --- Контейнер для карток вкладень (файли та зображення) ---
        const attachmentsCardContainer = messageWrapper.createDiv({ cls: "message-attachment-cards-container" });
        let hasAttachmentCards = false;

        // Рендеринг карток для прикріплених документів
        if (this.message.attachedDocuments && this.message.attachedDocuments.length > 0) {
            hasAttachmentCards = true;
            this.message.attachedDocuments.forEach(docInfo => {
                const docCard = attachmentsCardContainer.createDiv({ cls: "attachment-card document-card" });
                
                const nameEl = docCard.createDiv({ cls: "attachment-card-name", text: docInfo.name });
                nameEl.setAttribute("title", docInfo.name);

                const metaLine = docCard.createDiv({cls: "attachment-card-meta"});
                if (docInfo.content && typeof docInfo.content === 'string') { // Перевіряємо, що content - рядок
                    const lineCount = (docInfo.content.match(/\n/g) || []).length + 1;
                    metaLine.createSpan({ cls: "attachment-card-lines", text: `${lineCount} lines` });
                } else {
                    metaLine.createSpan({ cls: "attachment-card-size", text: `${(docInfo.size / 1024).toFixed(1)} KB` });
                }
                
                let typeText = (docInfo.type.split('.').pop() || docInfo.type).toUpperCase();
                // Спрощуємо типи для відображення
                if (typeText.includes('JSON')) typeText = 'JSON';
                else if (typeText.includes('MARKDOWN') || typeText === 'MD') typeText = 'MD';
                else if (typeText.includes('TEXT') || typeText === 'TXT') typeText = 'TXT';
                else if (typeText.includes('TYPESCRIPT') || typeText === 'TS') typeText = 'TS';
                else if (typeText.includes('JAVASCRIPT') || typeText === 'JS') typeText = 'JS';
                
                docCard.createDiv({ cls: "attachment-card-type", text: typeText });
            });
        }

        // Рендеринг карток для прикріплених зображень
        if (this.message.images && this.message.images.length > 0) {
            hasAttachmentCards = true;
            this.message.images.forEach((imageDataUrl, index) => {
                // Спробуємо отримати реальну назву зображення, якщо вона передається
                // Поки що використовуємо AttachmentFile з AttachmentManager як джерело назви
                // Це вимагатиме змін в AttachmentManager, OllamaView->sendMessage, ChatManager, Message type
                // Припустимо, що message.imageNames?: string[] існує і синхронізоване з message.images
                const imageName = (this.message as any).imageNames?.[index] || `Image ${index + 1}`;

                const imageCard = attachmentsCardContainer.createDiv({ cls: "attachment-card image-card" });
                const imgPreview = imageCard.createEl("img", {attr: {src: imageDataUrl}, cls: "attachment-card-image-preview"});

                const nameEl = imageCard.createDiv({ cls: "attachment-card-name", text: imageName });
                nameEl.setAttribute("title", imageName);
                
                imageCard.addEventListener('click', () => {
                    const newTab = window.open();
                    if (newTab) {
                        newTab.document.write(/* ... код для відкриття зображення ... */);
                        newTab.document.title = imageName;
                    } else {
                        new Notice("Could not open image in a new tab.");
                    }
                });
            });
        }
        
        if (!hasAttachmentCards) {
            attachmentsCardContainer.addClass("hidden-attachment-cards");
        }
        // --- END Контейнер для карток ---

		// Бульбашка для тексту повідомлення користувача
        const userTextContent = this.message.content || "";
        let messageBubbleActual: HTMLElement | null = null;

		if (userTextContent.trim() !== "" || !hasAttachmentCards) {
            // Створюємо messageEl (бульбашку) та contentEl всередині messageWrapper
            const { messageEl, contentEl } = this.createMessageBubble(messageWrapper, [CSS_CLASSES.USER_MESSAGE]);
            messageBubbleActual = messageEl; // Зберігаємо посилання на бульбашку

            if (userTextContent.trim() !== "") {
                MarkdownRenderer.render(this.app, userTextContent, contentEl, this.view.plugin.app.vault.getRoot()?.path ?? "", this.view);
                RendererUtils.fixBrokenTwemojiImages(contentEl);
            } else {
                messageEl.addClass("empty-user-text-bubble");
            }
        }

        // Обгортка для timestamp та кнопок дій, розміщується ПІСЛЯ карток та бульбашки, всередині messageWrapper
		const metaActionsWrapper = messageWrapper.createDiv({ cls: "message-meta-actions-wrapper" });
		BaseMessageRenderer.addTimestampToElement(metaActionsWrapper, this.message.timestamp, this.view);
		this.addUserActionButtons(metaActionsWrapper); // Передаємо сюди metaActionsWrapper

        // Перевірка на згортання для бульбашки повідомлення, якщо вона існує
        if (messageBubbleActual) {
            setTimeout(() => {
                if (messageGroup.isConnected && messageBubbleActual) { // Переконуємось, що messageGroup і messageBubbleActual ще в DOM
                    this.view.checkMessageForCollapsing(messageBubbleActual); // Перевіряємо згортання для messageBubbleActual
                }
            }, 70);
        }

		return messageGroup;
	}

    // Допоміжна функція для отримання іконки (поки що проста)
    // private getIconForDocument(docInfo: AttachedDocumentInfo): string {
    //     if (docInfo.previewType === 'markdown') return "file-text";
    //     if (docInfo.previewType === 'text') return "file-code";
    //     if (docInfo.type.includes("pdf")) return "file-type-pdf";
    //     return "file";
    // }

    private addUserActionButtons(parentElementForActionsContainer: HTMLElement): void {
		const messageTimestamp = this.message.timestamp.getTime().toString();
		let actionsWrapperActual = parentElementForActionsContainer.querySelector<HTMLElement>(`.${CSS_CLASSES.MESSAGE_ACTIONS}[data-message-timestamp="${messageTimestamp}"]`);

		if (actionsWrapperActual) {
			return;
		}
		
		actionsWrapperActual = parentElementForActionsContainer.createDiv({ cls: CSS_CLASSES.MESSAGE_ACTIONS });
		actionsWrapperActual.setAttribute("data-message-timestamp", messageTimestamp);
		
        const finalContent = this.message.content || "";

        const regenerateBtn = actionsWrapperActual.createEl("button", {
            cls: [CSS_CLASSES.REGENERATE_BUTTON, CSS_CLASSES.MESSAGE_ACTION_BUTTON],
            attr: { title: "Regenerate response based on this message" },
        });
        setIcon(regenerateBtn, "refresh-cw");
        this.view.registerDomEvent(regenerateBtn, "click", e => {
            e.stopPropagation();
            this.view.handleRegenerateClick(this.message);
        });

        const copyBtn = actionsWrapperActual.createEl("button", {
            cls: [CSS_CLASSES.COPY_BUTTON, CSS_CLASSES.MESSAGE_ACTION_BUTTON], 
            attr: { "aria-label": "Copy", title: "Copy" },
        });
        setIcon(copyBtn, "copy");
        this.view.registerDomEvent(copyBtn, "click", e => {
            e.stopPropagation();
            this.view.handleCopyClick(finalContent, copyBtn);
        });

        const deleteBtn = actionsWrapperActual.createEl("button", {
            cls: [CSS_CLASSES.DELETE_MESSAGE_BUTTON, CSS_CLASSES.DANGER_OPTION, CSS_CLASSES.MESSAGE_ACTION_BUTTON], 
            attr: { "aria-label": "Delete message", title: "Delete Message" },
        });
        setIcon(deleteBtn, "trash");
        this.view.registerDomEvent(deleteBtn, "click", e => {
            e.stopPropagation();
            this.view.handleDeleteMessageClick(this.message);
        });
    }
}