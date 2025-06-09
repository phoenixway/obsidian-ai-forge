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

		const messageWrapper = messageGroup.createDiv({ cls: CSS_CLASSES.MESSAGE_WRAPPER });
		messageWrapper.style.order = "1";

        // --- НОВА ОБГОРТКА для всього контенту, ОКРІМ мета-інформації ---
        const contentArea = messageWrapper.createDiv({ cls: "message-content-area" }); 
        // Налаштуємо вирівнювання для цієї обгортки в CSS

        // .message-main-content тепер всередині .content-area
        const mainContentWrapper = contentArea.createDiv({ cls: "message-main-content" });

        const attachmentsCardContainer = mainContentWrapper.createDiv({ cls: "message-attachment-cards-container" });
        let hasAttachmentCards = false;

        // ... (логіка рендерингу .attachment-card для документів, як і раніше)
        if (this.message.attachedDocuments && this.message.attachedDocuments.length > 0) {
            hasAttachmentCards = true;
            this.message.attachedDocuments.forEach(docInfo => {
                const docCard = attachmentsCardContainer.createDiv({ cls: "attachment-card document-card" });
                const nameEl = docCard.createDiv({ cls: "attachment-card-name", text: docInfo.name });
                nameEl.setAttribute("title", docInfo.name);
                const metaLine = docCard.createDiv({cls: "attachment-card-meta"});
                metaLine.createSpan({ cls: "attachment-card-size", text: this.formatFileSize(docInfo.size) });
                let displayType = docInfo.type.split('/').pop() || docInfo.type; 
                if (displayType.includes('.')) { 
                    displayType = displayType.substring(displayType.lastIndexOf('.') + 1);
                }
                displayType = displayType.toUpperCase();
                if (displayType.length > 5 && docInfo.name.includes('.')) { 
                    const nameExt = docInfo.name.split('.').pop()?.toUpperCase();
                    if (nameExt && nameExt.length <= 5) {
                        displayType = nameExt;
                    }
                }
                if (['JSON', 'MARKDOWN', 'MD', 'TEXT', 'TXT', 'TYPESCRIPT', 'TS', 'JAVASCRIPT', 'JS', 'PDF'].includes(displayType)) {
                    if (displayType === 'MARKDOWN') displayType = 'MD';
                    if (displayType === 'TYPESCRIPT') displayType = 'TS';
                    if (displayType === 'JAVASCRIPT') displayType = 'JS';
                    if (displayType === 'TEXT') displayType = 'TXT';
                } else if (displayType.length > 4) { 
                    const nameExt = docInfo.name.split('.').pop()?.toUpperCase();
                    if (nameExt && nameExt.length <= 4) {
                        displayType = nameExt;
                    } else {
                        displayType = displayType.substring(0, 4); 
                    }
                }
                docCard.createDiv({ cls: "attachment-card-type", text: displayType });
            });
        }
        // ... (логіка рендерингу .attachment-card для зображень, як і раніше)
        if (this.message.images && this.message.images.length > 0) {
            hasAttachmentCards = true;
            this.message.images.forEach((imageDataUrl, index) => {
                const imageName = (this.message as any).imageNames?.[index] || `Image ${index + 1}`;
                const imageCard = attachmentsCardContainer.createDiv({ cls: "attachment-card image-card" });
                const imgPreview = imageCard.createEl("img", {attr: {src: imageDataUrl}, cls: "attachment-card-image-preview"});
                const nameEl = imageCard.createDiv({ cls: "attachment-card-name", text: imageName });
                nameEl.setAttribute("title", imageName);
                let imageType = "IMG";
                const fileName = (this.message as any).imageNames?.[index];
                if (fileName && fileName.includes('.')) {
                    const ext = fileName.split('.').pop()?.toUpperCase();
                    if (ext && ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG'].includes(ext)) {
                        imageType = ext;
                    } else if (ext) {
                        imageType = ext.substring(0,4);
                    }
                }
                 imageCard.createDiv({ cls: "attachment-card-type", text: imageType });
                imageCard.addEventListener('click', () => { /* ... відкриття зображення ... */ });
            });
        }
        
        if (!hasAttachmentCards) {
            attachmentsCardContainer.addClass("hidden-attachment-cards");
        }

		// Бульбашка для тексту повідомлення користувача - всередині mainContentWrapper
        const userTextContent = this.message.content || "";
        let messageBubbleActual: HTMLElement | null = null; 

		if (userTextContent.trim() !== "" || (!hasAttachmentCards && !userTextContent.trim())) {
            if(userTextContent.trim() !== "" || !hasAttachmentCards) {
                const { messageEl, contentEl } = this.createMessageBubble(mainContentWrapper, [CSS_CLASSES.USER_MESSAGE]);
                messageBubbleActual = messageEl;
                if (userTextContent.trim() !== "") {
                    MarkdownRenderer.render(this.app, userTextContent, contentEl, this.view.plugin.app.vault.getRoot()?.path ?? "", this.view);
                    RendererUtils.fixBrokenTwemojiImages(contentEl);
                } else {
                    messageEl.addClass("empty-user-text-bubble"); 
                }
            }
        }

        // --- Обгортка для timestamp та кнопок дій - ПІСЛЯ .content-area, всередині .message-wrapper ---
		const metaActionsWrapper = messageWrapper.createDiv({ cls: "message-meta-actions-wrapper" });
		BaseMessageRenderer.addTimestampToElement(metaActionsWrapper, this.message.timestamp, this.view);
		this.addUserActionButtons(metaActionsWrapper);
        
        if (messageBubbleActual && !messageBubbleActual.classList.contains("empty-user-text-bubble")) {
            setTimeout(() => {
                if (messageGroup.isConnected && messageBubbleActual) { 
                    this.view.checkMessageForCollapsing(messageBubbleActual);
                }
            }, 70);
        }
		return messageGroup;
	}

    // ... (formatFileSize залишається)

    // ... (formatFileSize залишається)
    // --- НОВА ДОПОМІЖНА ФУНКЦІЯ ---
    private formatFileSize(bytes: number, decimals = 1): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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