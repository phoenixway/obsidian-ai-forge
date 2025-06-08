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

        const { messageEl, contentEl } = this.createMessageBubble(messageWrapper, [CSS_CLASSES.USER_MESSAGE]);

        // Рендеринг message.content (оригінальний текст користувача + посилання)
		const userTextContent = this.message.content || "";
		if (userTextContent.trim() !== "") {
            // Використовуємо MarkdownRenderer, оскільки message.content може містити посилання,
            // які ми додали як Markdown
            MarkdownRenderer.render(this.app, userTextContent, contentEl, this.view.plugin.app.vault.getRoot()?.path ?? "", this.view);
            RendererUtils.fixBrokenTwemojiImages(contentEl); // На випадок емодзі в посиланнях/тексті
        }

        // Рендеринг прикріплених зображень (якщо є)
        if (this.message.images && this.message.images.length > 0) {
            // ... (логіка рендерингу зображень залишається такою ж) ...
            const imagesContainer = contentEl.createDiv({ cls: "message-images-container" });
            this.message.images.forEach(imageDataUrl => {
                const imgEl = imagesContainer.createEl("img", {
                    attr: { src: imageDataUrl },
                    cls: "message-attached-image"
                });
                imgEl.addEventListener('click', () => {
                    const newTab = window.open();
                    if (newTab) {
                        newTab.document.write(`
                            <body style="margin: 0; background-color: #222; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
                                <img src="${imageDataUrl}" style="max-width: 95%; max-height: 95vh; display: block; object-fit: contain;">
                            </body>
                        `);
                        newTab.document.title = "Attached Image";
                    } else {
                        new Notice("Could not open image in a new tab. Please check your browser's pop-up settings.");
                    }
                });
            });
            if (userTextContent.trim() !== "") {
                 imagesContainer.style.marginTop = "10px";
            }
        }

        // Рендеринг блоків прикріплених документів
        if (this.message.attachedDocuments && this.message.attachedDocuments.length > 0) {
            const documentsContainer = contentEl.createDiv({ cls: "message-attached-documents-container" });
            // Додаємо відступ, якщо є будь-який інший контент (текст або зображення)
            if (userTextContent.trim() !== "" || (this.message.images && this.message.images.length > 0)) {
                 documentsContainer.style.marginTop = "15px";
            }

            this.message.attachedDocuments.forEach(docInfo => {
                // Блок документа тепер завжди відображається, оскільки вміст не вбудовується в message.content
                const docBlock = documentsContainer.createDiv({ cls: "attached-document-block" });
                
                const docHeader = docBlock.createDiv({ cls: "attached-document-header" });
                
                let iconName = "file";
                if (docInfo.previewType === 'markdown') iconName = "file-text";
                else if (docInfo.previewType === 'text') iconName = "file-code";
                else if (docInfo.type.includes("pdf")) iconName = "file-type-pdf"; // Потрібна відповідна іконка
                
                setIcon(docHeader.createSpan({cls: "attached-document-icon"}), iconName);
                docHeader.createSpan({ cls: "attached-document-name", text: docInfo.name });
                docHeader.createSpan({ cls: "attached-document-size", text: `(${(docInfo.size / 1024).toFixed(1)} KB)` });

                if (docInfo.previewType !== 'generic_file' && docInfo.content) {
                    const docContentWrapper = docBlock.createDiv({ cls: "attached-document-content-wrapper" });
                    const docContentEl = docContentWrapper.createDiv({ cls: "attached-document-content" });
                    
                    const maxPreviewLength = 300; // Цей ліміт тепер лише для візуального прев'ю
                    const needsVisualTruncation = docInfo.content.length > maxPreviewLength;

                    if (docInfo.previewType === 'markdown') {
                        const mdToRender = needsVisualTruncation ? docInfo.content.substring(0, maxPreviewLength) + "\n\n*[... content truncated for preview ...]*" : docInfo.content;
                        MarkdownRenderer.render(this.app, mdToRender, docContentEl, this.view.plugin.app.vault.getRoot()?.path ?? "", this.view);
                    } else if (docInfo.previewType === 'text') {
                        const pre = docContentEl.createEl("pre");
                        pre.setText(needsVisualTruncation ? docInfo.content.substring(0, maxPreviewLength) + "\n\n*[... content truncated for preview ...]*" : docInfo.content);
                    }
                    RendererUtils.fixBrokenTwemojiImages(docContentEl);

                    if (needsVisualTruncation) {
                        docContentEl.addClass("truncated"); // Для CSS, щоб застосувати градієнт, якщо він є
                        const showMoreBtn = docBlock.createEl("button", { cls: "attached-document-show-more", text: "Show Full Content" });
                        showMoreBtn.onClickEvent(async (e) => {
                            e.stopPropagation();
                            if (docContentEl.hasClass("truncated")) { // Стан "згорнуто"
                                docContentEl.empty();
                                if (docInfo.previewType === 'markdown') {
                                    await MarkdownRenderer.render(this.app, docInfo.content!, docContentEl, this.view.plugin.app.vault.getRoot()?.path ?? "", this.view);
                                } else { // 'text'
                                    docContentEl.createEl("pre").setText(docInfo.content!);
                                }
                                RendererUtils.fixBrokenTwemojiImages(docContentEl);
                                docContentEl.removeClass("truncated");
                                docContentEl.style.maxHeight = "none"; // Зняти обмеження висоти
                                showMoreBtn.setText("Show Less");
                            } else { // Стан "розгорнуто"
                                docContentEl.empty();
                                if (docInfo.previewType === 'markdown') {
                                    const previewMd = docInfo.content!.substring(0, maxPreviewLength) + "\n\n*[... content truncated for preview ...]*";
                                    await MarkdownRenderer.render(this.app, previewMd, docContentEl, this.view.plugin.app.vault.getRoot()?.path ?? "", this.view);
                                } else { // 'text'
                                    docContentEl.createEl("pre").setText(docInfo.content!.substring(0, maxPreviewLength) + "\n\n*[... content truncated for preview ...]*");
                                }
                                RendererUtils.fixBrokenTwemojiImages(docContentEl);
                                docContentEl.addClass("truncated");
                                docContentEl.style.maxHeight = ""; // Повернути CSS обмеження, якщо воно є
                                showMoreBtn.setText("Show Full Content");
                            }
                            this.view.guaranteedScrollToBottom(50, false);
                        });
                    }
                } else if (docInfo.previewType === 'generic_file') {
                    const genericInfo = docBlock.createDiv({cls: "attached-document-generic-info"});
                    genericInfo.setText(`This is a ${docInfo.type} file. Its content is not directly sent to the AI unless it's a known text format. You can ask the AI about it based on its name and type.`);
                }
            });
        }
		
		const metaActionsWrapper = messageWrapper.createDiv({ cls: "message-meta-actions-wrapper" });
		BaseMessageRenderer.addTimestampToElement(metaActionsWrapper, this.message.timestamp, this.view);
		this.addUserActionButtons(metaActionsWrapper);

		setTimeout(() => {
			if (messageGroup.isConnected) { // Перевіряємо messageGroup замість contentEl
				this.view.checkMessageForCollapsing(messageGroup);
			}
		}, 70);

		return messageGroup;
	}

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