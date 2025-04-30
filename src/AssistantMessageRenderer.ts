// src/AssistantMessageRenderer.ts
import { App, Notice, setIcon } from "obsidian";
import { Message, MessageRole } from "./types"; // Assuming types.ts exists
import OllamaPlugin from "./main";
import { OllamaView } from "./OllamaView"; // Needed for registering events/accessing methods
import { CSS_CLASSES } from "./constants";
import * as RendererUtils from "./MessageRendererUtils"; // Import the utils

// Constants needed from OllamaView
const CSS_CLASS_OLLAMA_GROUP = "ollama-message-group";
const CSS_CLASS_OLLAMA_MESSAGE = "ollama-message";
const CSS_CLASS_CONTENT_COLLAPSIBLE = "message-content-collapsible";
const CSS_CLASS_COPY_BUTTON = "copy-button";
const CSS_CLASS_TRANSLATE_BUTTON = "translate-button";
const CSS_CLASS_SUMMARIZE_BUTTON = "summarize-button";
const CSS_CLASS_DELETE_MESSAGE_BUTTON = "delete-message-button";
  

export class AssistantMessageRenderer {
	private readonly app: App;
	private readonly plugin: OllamaPlugin;
	private readonly message: Message;
	private readonly view: OllamaView; // View context is necessary for registering DOM events and calling handlers

	constructor(app: App, plugin: OllamaPlugin, message: Message, view: OllamaView) {
		this.app = app;
		this.plugin = plugin;
		this.message = message;
		this.view = view; // Store the view context

		if (message.role !== "assistant") {
			throw new Error("AssistantMessageRenderer can only render messages with role 'assistant'.");
		}
	}

	/** Renders the complete message group element */
	public async render(): Promise<HTMLElement> {
		const messageGroup = document.createElement("div");
		messageGroup.classList.add(CSS_CLASSES.MESSAGE_GROUP, CSS_CLASS_OLLAMA_GROUP);
		messageGroup.setAttribute("data-timestamp", this.message.timestamp.getTime().toString());

        RendererUtils.renderAvatar(this.app, this.plugin, messageGroup, false); // false for assistant
		const messageWrapper = messageGroup.createDiv({ cls: "message-wrapper" });
		messageWrapper.style.order = "2"; // AI messages on the left

		const messageEl = messageWrapper.createDiv({
			cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASS_OLLAMA_MESSAGE}`,
		});

		const contentContainer = messageEl.createDiv({ cls: CSS_CLASSES.CONTENT_CONTAINER });
		const contentEl = contentContainer.createDiv({
			cls: `${CSS_CLASSES.CONTENT} ${CSS_CLASS_CONTENT_COLLAPSIBLE}`,
		});

		// Render the main content using the utility function
		await RendererUtils.renderAssistantContent(
			this.app,
			this.view,
			this.plugin,
			contentEl,
			this.message.content,
		);

		this.addMessageActionButtons(messageWrapper, contentEl);

		// Add timestamp
		messageEl.createDiv({
			cls: CSS_CLASSES.TIMESTAMP,
			text: this.view.formatTime(this.message.timestamp), // Use view's formatting method
		});

		// Check for collapsing *after* content is rendered and buttons are added
		// Use setTimeout to ensure layout is calculated
		setTimeout(() => this.view.checkMessageForCollapsing(messageEl), 0);

		return messageGroup;
	}

	/** Adds action buttons (Copy, Translate, Summarize, Delete) */
	private addMessageActionButtons(messageWrapper: HTMLElement, contentEl: HTMLElement): void {
		const buttonsWrapper = messageWrapper.createDiv({ cls: "message-actions-wrapper" });
		const finalContent = this.message.content; // Use the full message content
		const finalTimestamp = this.message.timestamp;

		// Copy Button
		const copyBtn = buttonsWrapper.createEl("button", {
			cls: CSS_CLASS_COPY_BUTTON,
			attr: { "aria-label": "Copy", title: "Copy" },
		});
		setIcon(copyBtn, "copy");
		this.view.registerDomEvent(copyBtn, "click", e => {
			e.stopPropagation();
			this.view.handleCopyClick(finalContent, copyBtn); // Call view's handler
		});

		// Translate Button
		if (
			this.plugin.settings.enableTranslation &&
			this.plugin.settings.googleTranslationApiKey &&
			finalContent.trim()
		) {
			const translateBtn = buttonsWrapper.createEl("button", {
				cls: CSS_CLASS_TRANSLATE_BUTTON,
				attr: { "aria-label": "Translate", title: "Translate" },
			});
			setIcon(translateBtn, "languages");
			this.view.registerDomEvent(translateBtn, "click", e => {
				e.stopPropagation();
				if (contentEl.isConnected) {
					this.view.handleTranslateClick(finalContent, contentEl, translateBtn); // Call view's handler
				} else {
					new Notice("Cannot translate: message content element not found.");
				}
			});
		}

		// Summarize Button
		if (this.plugin.settings.summarizationModelName && finalContent.trim()) {
			const summarizeBtn = buttonsWrapper.createEl("button", {
				cls: CSS_CLASS_SUMMARIZE_BUTTON,
				attr: { title: "Summarize message" },
			});
			setIcon(summarizeBtn, "scroll-text");
			this.view.registerDomEvent(summarizeBtn, "click", e => {
				e.stopPropagation();
				this.view.handleSummarizeClick(finalContent, summarizeBtn); // Call view's handler
			});
		}

		// Delete Button
		const deleteBtn = buttonsWrapper.createEl("button", {
			cls: [CSS_CLASS_DELETE_MESSAGE_BUTTON, CSS_CLASSES.DANGER_OPTION],
			attr: { "aria-label": "Delete message", title: "Delete Message" },
		});
		setIcon(deleteBtn, "trash");
		this.view.registerDomEvent(deleteBtn, "click", e => {
			e.stopPropagation();
			this.view.handleDeleteMessageClick(this.message); // Call view's handler
		});
	}
}