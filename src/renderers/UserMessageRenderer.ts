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
        // Головна обгортка для всього блоку повідомлення користувача (аватар, картки вкладень, бульбашка повідомлення)
		const messageGroup = this.createMessageGroupWrapper([CSS_CLASSES.USER_MESSAGE_GROUP]);

		RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, true, "user");

        // Обгортка для контенту праворуч від аватара (картки + бульбашка)
        const contentAndAttachmentsWrapper = messageGroup.createDiv({cls: "user-content-attachments-wrapper"});
        contentAndAttachmentsWrapper.style.order = "1"; // Розміщуємо праворуч від аватара

        // --- NEW: Контейнер для карток вкладень (файли та зображення) ---
        const attachmentsCardContainer = contentAndAttachmentsWrapper.createDiv({ cls: "message-attachment-cards-container" });
        let hasAttachmentCards = false;

        // Рендеринг карток для прикріплених документів
        if (this.message.attachedDocuments && this.message.attachedDocuments.length > 0) {
            hasAttachmentCards = true;
            this.message.attachedDocuments.forEach(docInfo => {
                const docCard = attachmentsCardContainer.createDiv({ cls: "attachment-card document-card" });
                // Іконка (якщо потрібна всередині картки, а не тільки текст типу)
                // setIcon(docCard.createSpan({ cls: "attachment-card-icon" }), this.getIconForDocument(docInfo));
                
                const nameEl = docCard.createDiv({ cls: "attachment-card-name", text: docInfo.name });
                nameEl.setAttribute("title", docInfo.name); // Повна назва при наведенні

                const metaLine = docCard.createDiv({cls: "attachment-card-meta"});
                if (docInfo.content) {
                    const lineCount = (docInfo.content.match(/\n/g) || []).length + 1;
                    metaLine.createSpan({ cls: "attachment-card-lines", text: `${lineCount} lines` });
                } else {
                    metaLine.createSpan({ cls: "attachment-card-size", text: `${(docInfo.size / 1024).toFixed(1)} KB` });
                }
                
                const typeText = (docInfo.type.split('.').pop() || docInfo.type).toUpperCase();
                docCard.createDiv({ cls: "attachment-card-type", text: typeText });

                // Обробник кліку на картку (можна додати пізніше, наприклад, для відкриття файлу)
                // docCard.addEventListener('click', () => { /* ... */ });
            });
        }

        // Рендеринг карток для прикріплених зображень
        if (this.message.images && this.message.images.length > 0) {
            hasAttachmentCards = true;
            this.message.images.forEach((imageDataUrl, index) => {
                // Спробуємо отримати назву з даних, якщо вона там є, або генеруємо
                const imageName = `Image ${index + 1}`; // TODO: Якщо є можливість, передавати сюди реальну назву файлу зображення
                                                    // Це вимагатиме змін в AttachmentManager та Message для зберігання назв файлів зображень

                const imageCard = attachmentsCardContainer.createDiv({ cls: "attachment-card image-card" });
                // Можна додати мініатюру зображення всередину картки замість іконки/типу
                const imgPreview = imageCard.createEl("img", {attr: {src: imageDataUrl}, cls: "attachment-card-image-preview"});

                const nameEl = imageCard.createDiv({ cls: "attachment-card-name", text: imageName });
                nameEl.setAttribute("title", imageName);

                // Розмір для зображень зазвичай не такий важливий як для документів, але можна додати, якщо є дані
                // const metaLine = imageCard.createDiv({cls: "attachment-card-meta"});
                // metaLine.createSpan({ cls: "attachment-card-size", text: `... KB` }); // Потрібно буде передавати розмір
                
                // imageCard.createDiv({ cls: "attachment-card-type", text: "IMAGE" }); // Або розширення, якщо відоме

                imageCard.addEventListener('click', () => {
                    const newTab = window.open();
                    if (newTab) {
                        newTab.document.write(`
                            <body style="margin: 0; background-color: #222; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
                                <img src="${imageDataUrl}" style="max-width: 95%; max-height: 95vh; display: block; object-fit: contain;">
                            </body>
                        `);
                        newTab.document.title = imageName;
                    } else {
                        new Notice("Could not open image in a new tab. Please check your browser's pop-up settings.");
                    }
                });
            });
        }
        
        // Сховати контейнер карток, якщо він порожній
        if (!hasAttachmentCards) {
            attachmentsCardContainer.addClass("hidden-attachment-cards");
        }
        // --- END NEW: Контейнер для карток ---


		// Контейнер для самої бульбашки повідомлення користувача
        const messageBubbleWrapper = contentAndAttachmentsWrapper.createDiv({cls: "user-message-bubble-wrapper"});
        // Якщо немає тексту від користувача, але є картки, то цю бульбашку можна не створювати або зробити її меншою
        const userTextContent = this.message.content || "";
        if (userTextContent.trim() !== "" || !hasAttachmentCards) { // Показуємо бульбашку, якщо є текст АБО якщо немає карток (щоб не було порожньо)
            const { messageEl, contentEl } = this.createMessageBubble(messageBubbleWrapper, [CSS_CLASSES.USER_MESSAGE]);
            
            if (userTextContent.trim() !== "") {
                MarkdownRenderer.render(this.app, userTextContent, contentEl, this.view.plugin.app.vault.getRoot()?.path ?? "", this.view);
                RendererUtils.fixBrokenTwemojiImages(contentEl);
            } else {
                // Якщо бульбашка створена, але тексту немає (наприклад, тільки вкладення відправлені),
                // можна залишити її порожньою або додати плейсхолдер/зробити її меншою
                // contentEl.setText(" "); // Щоб вона не колапсувала повністю, якщо порожня
                messageEl.addClass("empty-user-text-bubble"); // Для спеціальних стилів, якщо потрібно
            }

            const metaActionsWrapper = messageBubbleWrapper.createDiv({ cls: "message-meta-actions-wrapper" });
            BaseMessageRenderer.addTimestampToElement(metaActionsWrapper, this.message.timestamp, this.view);
            this.addUserActionButtons(metaActionsWrapper); // addUserActionButtons тепер приймає metaActionsWrapper
            
            // Перевірка на згортання основного текстового повідомлення
            setTimeout(() => {
                if (messageGroup.isConnected) {
                    this.view.checkMessageForCollapsing(messageGroup);
                }
            }, 70);
        } else {
            // Якщо є картки, але немає тексту, то не створюємо бульбашку для тексту.
            // Можна додати timestamp та кнопки дій якось інакше, або не додавати, якщо немає основного тексту.
            // Наприклад, можна додати timestamp під картками, якщо це логічно.
            // Для простоти, поки що дії та timestamp пов'язані з текстовою бульбашкою.
            // Альтернатива: створити маленький блок для timestamp/дій під картками.
            const minimalMetaWrapper = contentAndAttachmentsWrapper.createDiv({ cls: "minimal-meta-actions-wrapper" });
            BaseMessageRenderer.addTimestampToElement(minimalMetaWrapper, this.message.timestamp, this.view);
            // Кнопки дій для повідомлення без тексту можуть бути не потрібні, або потрібен інший набір.
            // this.addUserActionButtons(minimalMetaWrapper); // Поки що не додаємо кнопки, якщо немає тексту.
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