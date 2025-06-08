// src/renderers/UserMessageRenderer.ts
import { BaseMessageRenderer } from "./BaseMessageRenderer";
import { CSS_CLASSES } from "../constants";
import { App, setIcon, Notice } from "obsidian"; // <--- ДОДАЙ Notice ДО ІМПОРТІВ
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

		const contentToRender = this.message.content || "";
		if (contentToRender.includes("\n")) {
			contentToRender.split("\n").forEach((line, i, arr) => {
				contentEl.appendText(line);
				if (i < arr.length - 1) contentEl.createEl("br");
			});
		} else if (contentToRender) {
			contentEl.setText(contentToRender);
		}

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
                        // Виправлення тут: створюємо новий екземпляр Notice
                        new Notice("Could not open image in a new tab. Please check your browser's pop-up settings.");
                    }
                });
            });
            if (contentToRender) {
                 imagesContainer.style.marginTop = "10px";
            }
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