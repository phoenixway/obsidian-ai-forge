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

        // Рендеринг основного текстового контенту
        // Плейсхолдери для документів та посилань вже включені в message.content на етапі sendMessage
		const contentToRender = this.message.content || "";
		if (contentToRender.trim() !== "") {
            RendererUtils.renderMarkdownContent(this.app, this.view, this.plugin, contentEl, contentToRender);
        }

        // Рендеринг прикріплених зображень (якщо є)
        if (this.message.images && this.message.images.length > 0) {
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
            if (contentToRender.trim() !== "") {
                 imagesContainer.style.marginTop = "10px";
            }
        }

        // Рендеринг блоків прикріплених документів (які НЕ були вставлені в основний контент)
        if (this.message.attachedDocuments && this.message.attachedDocuments.length > 0) {
            const documentsContainer = contentEl.createDiv({ cls: "message-attached-documents-container" });
            if (contentToRender.trim() !== "" || (this.message.images && this.message.images.length > 0)) {
                 documentsContainer.style.marginTop = "15px";
            }

            this.message.attachedDocuments.forEach(docInfo => {
                // Відображаємо блок документа, тільки якщо його вміст НЕ було повністю вставлено в prompt
                // Або якщо це generic_file (наприклад, PDF), для якого ми хочемо показати блок
                const wasContentInlinedInPrompt = docInfo.content && (docInfo.previewType === 'text' || docInfo.previewType === 'markdown');
                
                if (!wasContentInlinedInPrompt || docInfo.previewType === 'generic_file') {
                    // Якщо вміст не було вбудовано в промпт, АБО це 'generic_file', то показуємо блок
                    const docBlock = documentsContainer.createDiv({ cls: "attached-document-block" });
                    
                    const docHeader = docBlock.createDiv({ cls: "attached-document-header" });
                    
                    let iconName = "file";
                    if (docInfo.previewType === 'markdown') iconName = "file-text";
                    else if (docInfo.previewType === 'text') iconName = "file-code"; // Або інша іконка для тексту
                    else if (docInfo.type.includes("pdf")) iconName = "file-type-pdf"; // Потрібна іконка pdf
                    // ... додати інші іконки для популярних типів ...
                    setIcon(docHeader.createSpan({cls: "attached-document-icon"}), iconName);
                    docHeader.createSpan({ cls: "attached-document-name", text: docInfo.name });
                    docHeader.createSpan({ cls: "attached-document-size", text: `(${(docInfo.size / 1024).toFixed(1)} KB)` });


                    // Для generic_file, ми можемо не показувати вміст, а лише інформацію
                    if (docInfo.previewType !== 'generic_file' && docInfo.content) {
                        const docContentWrapper = docBlock.createDiv({ cls: "attached-document-content-wrapper" });
                        const docContentEl = docContentWrapper.createDiv({ cls: "attached-document-content" });
                        
                        const maxPreviewLength = 300;
                        const needsTruncation = docInfo.content.length > maxPreviewLength;

                        if (docInfo.previewType === 'markdown') {
                            const mdToRender = needsTruncation ? docInfo.content.substring(0, maxPreviewLength) + "..." : docInfo.content;
                            MarkdownRenderer.render(this.app, mdToRender, docContentEl, this.view.plugin.app.vault.getRoot()?.path ?? "", this.view);
                        } else if (docInfo.previewType === 'text') {
                            const pre = docContentEl.createEl("pre");
                            pre.setText(needsTruncation ? docInfo.content.substring(0, maxPreviewLength) + "..." : docInfo.content);
                        }
                        RendererUtils.fixBrokenTwemojiImages(docContentEl);

                        if (needsTruncation) {
                            docContentEl.addClass("truncated");
                            const showMoreBtn = docBlock.createEl("button", { cls: "attached-document-show-more", text: "Show More" });
                            showMoreBtn.onClickEvent(async (e) => {
                                e.stopPropagation();
                                if (docContentEl.hasClass("truncated")) {
                                    docContentEl.empty();
                                    if (docInfo.previewType === 'markdown') {
                                        await MarkdownRenderer.render(this.app, docInfo.content!, docContentEl, this.view.plugin.app.vault.getRoot()?.path ?? "", this.view);
                                    } else {
                                        docContentEl.createEl("pre").setText(docInfo.content!);
                                    }
                                    RendererUtils.fixBrokenTwemojiImages(docContentEl);
                                    docContentEl.removeClass("truncated");
                                    showMoreBtn.setText("Show Less");
                                } else {
                                    docContentEl.empty();
                                    if (docInfo.previewType === 'markdown') {
                                        const previewMd = docInfo.content!.substring(0, maxPreviewLength) + "...";
                                        await MarkdownRenderer.render(this.app, previewMd, docContentEl, this.view.plugin.app.vault.getRoot()?.path ?? "", this.view);
                                    } else {
                                        docContentEl.createEl("pre").setText(docInfo.content!.substring(0, maxPreviewLength) + "...");
                                    }
                                    RendererUtils.fixBrokenTwemojiImages(docContentEl);
                                    docContentEl.addClass("truncated");
                                    showMoreBtn.setText("Show More");
                                }
                                this.view.guaranteedScrollToBottom(50, false);
                            });
                        }
                    } else if (docInfo.previewType === 'generic_file') {
                        // Можна додати кнопку "Download" або "Open externally"
                        // якщо ми зберігаємо rawFile в AttachedDocumentInfo
                        // Наприклад:
                        // if (docInfo.rawFile) {
                        // const downloadBtn = docBlock.createEl('button', {text: "Download"});
                        // downloadBtn.onClickEvent(() => { /* логіка завантаження */ });
                        // }
                        const genericInfo = docBlock.createDiv({cls: "attached-document-generic-info"});
                        genericInfo.setText(`This is a ${docInfo.type} file. Its content is not displayed directly here.`);
                    }
                }
            });
        }
		
		const metaActionsWrapper = messageWrapper.createDiv({ cls: "message-meta-actions-wrapper" });
		BaseMessageRenderer.addTimestampToElement(metaActionsWrapper, this.message.timestamp, this.view);
		this.addUserActionButtons(metaActionsWrapper);

		setTimeout(() => {
			if (messageGroup.isConnected && contentEl.closest(`.${CSS_CLASSES.MESSAGE_GROUP}`)) {
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