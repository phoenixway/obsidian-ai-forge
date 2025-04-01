import {
    setIcon,
    MarkdownRenderer,
    Notice,
} from "obsidian";
import OllamaPlugin from "./main";
import { OllamaView } from "./ollamaView";

// Define message types
export enum MessageType {
    USER = "user",
    ASSISTANT = "assistant",
    ERROR = "error",
    SYSTEM = "system"
}

// Interface for message structure
export interface Message {
    role: MessageType;
    content: string;
    timestamp: Date;
}

// Request options interface
export interface RequestOptions {
    num_ctx?: number;
}

export interface OllamaRequestBody {
    model: string;
    prompt: string;
    stream: boolean;
    temperature: number;
    system?: string;
    options?: RequestOptions;
}

export class MessageService {
    private plugin: OllamaPlugin;
    private view: OllamaView | null = null;
    private messages: Message[] = [];
    private isProcessing: boolean = false;
    private messagesPairCount: number = 0;

    constructor(plugin: OllamaPlugin) {
        this.plugin = plugin;
    }

    // Set the view reference
    public setView(view: OllamaView): void {
        this.view = view;
    }

    // Load message history from storage
    public async loadMessageHistory(): Promise<void> {
        if (!this.view) return;

        try {
            const history = await this.plugin.loadMessageHistory();
            if (Array.isArray(history) && history.length > 0) {
                this.messages = [];
                this.view.clearChatContainer();
                for (const msg of history) {
                    const message = {
                        ...msg,
                        timestamp: new Date(msg.timestamp),
                    };
                    this.messages.push(message);
                    this.renderMessage(message);
                }
                this.view.scrollToBottom();
                this.initializeThinkingBlocks();
            } else {
                this.view.showEmptyState();
            }
        } catch (error) {
            console.error("Error loading message history:", error);
            this.view.showEmptyState();
        }
    }

    // Save message history to storage
    public async saveMessageHistory(): Promise<void> {
        if (this.messages.length === 0) return;

        try {
            const serializedMessages = this.messages.map((msg) => ({
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp.toISOString(),
            }));
            await this.plugin.saveMessageHistory(JSON.stringify(serializedMessages));
        } catch (error) {
            console.error("Error saving message history:", error);
        }
    }

    // Send a message from the user to Ollama
    public async sendMessage(content: string): Promise<void> {
        if (this.isProcessing || !content.trim() || !this.view) return;

        this.view.hideEmptyState();
        this.addMessage(MessageType.USER, content);
        this.view.clearInputField();
        await this.processWithOllama(content);
    }

    // Add a message to the chat and render it
    public addMessage(role: MessageType, content: string): void {

        const message: Message = {
            role,
            content,
            timestamp: new Date(),
        };
        // console.log(`messageService.ts -> Addmessage: 2`);
        this.messages.push(message);
        // console.log(`messageService.ts -> Addmessage: message: ${message}`);
        // console.log(`messageService.ts -> Addmessage: this.messages: ${this.messages}`);

        this.renderMessage(message);

        if (role === MessageType.ASSISTANT && this.messages.length >= 2) {
            if (this.messages[this.messages.length - 2].role === MessageType.USER) {
                this.messagesPairCount++;
            }
        }

        this.saveMessageHistory();

        setTimeout(() => {
            if (this.view) {
                this.view.scrollToBottom();
            }
        }, 100);
    }

    // Reset the chat history
    public clearChatMessages(): void {
        this.messages = [];
        if (this.view) {
            this.view.clearChatContainer();
            this.view.showEmptyState();
        }
    }

    // Render a message in the chat container
    private renderMessage(message: Message): void {
        console.log(`messageService.ts -> renderMessage: this.view: ${this.view}`);
        if (!this.view) return;

        const isUser = message.role === MessageType.USER;
        const isError = message.role === MessageType.ERROR;
        const isSystem = message.role === MessageType.SYSTEM;
        const isFirstInGroup = this.isFirstMessageInGroup(message);
        const isLastInGroup = this.isLastMessageInGroup(message);

        let messageGroup: HTMLElement;
        const lastGroup = this.view.getChatContainer().lastElementChild;

        if (isFirstInGroup) {
            let groupClass = "message-group ";
            if (isUser) {
                groupClass += "user-message-group";
            } else if (isAssistant(message.role)) {
                groupClass += "ollama-message-group";
            } else if (isError) {
                groupClass += "error-message-group";
            } else if (isSystem) {
                groupClass += "system-message-group";
            }

            messageGroup = this.view.createGroupElement(groupClass);
        } else {
            messageGroup = lastGroup as HTMLElement;
        }

        let messageClass = "message ";

        if (isUser) {
            messageClass += "user-message bubble user-bubble";
        } else if (isAssistant(message.role)) {
            messageClass += "ollama-message bubble ollama-bubble";
        } else if (isError) {
            messageClass += "error-message bubble error-bubble";
        } else if (isSystem) {
            messageClass += "system-message bubble system-bubble";
        }

        if (isLastInGroup) {
            if (isUser) {
                messageClass += " user-message-tail";
            } else if (isAssistant(message.role)) {
                messageClass += " ollama-message-tail";
            } else if (isError) {
                messageClass += " error-message-tail";
            } else if (isSystem) {
                messageClass += " system-message-tail";
            }
        }

        const messageEl = this.view.createMessageElement(messageGroup, messageClass);
        const contentContainer = this.view.createContentContainer(messageEl);
        const contentEl = this.view.createContentElement(contentContainer);

        if (isAssistant(message.role)) {
            const decodedContent = this.decodeHtmlEntities(message.content);
            const hasThinkingTags =
                message.content.includes("<think>") ||
                decodedContent.includes("<think>");

            if (hasThinkingTags) {
                const contentToProcess =
                    hasThinkingTags && !message.content.includes("<thing>")
                        ? decodedContent
                        : message.content;

                const processedContent = this.processThinkingTags(contentToProcess);
                contentEl.innerHTML = processedContent;

                this.addThinkingToggleListeners(contentEl);
            } else {
                this.renderMarkdown(message.content, contentEl);
            }
        } else if (isError) {
            // const errorIconSpan = contentEl.createSpan({ cls: "error-icon" });
            // setIcon(errorIconSpan, "alert-triangle");

            // const messageSpan = contentEl.createSpan({
            //     cls: "error-message-text",
            //     text: message.content
            // });
        } else if (isSystem) {
            // const infoIconSpan = contentEl.createSpan({ cls: "system-icon" });
            // setIcon(infoIconSpan, "info");

            // const messageSpan = contentEl.createSpan({
            //     cls: "system-message-text",
            //     text: message.content
            // });
        } else {
            // message.content.split("\n").forEach((line, index, array) => {
            //     contentEl.createSpan({ text: line });
            //     if (index < array.length - 1) {
            //         contentEl.createEl("br");
            //     }
            // });
        }

        // Add copy button for all message types except system
        if (!isSystem) {
            const copyButton = this.createCopyButton(contentContainer, message);
        }

        if (isLastInGroup) {
            messageEl.createDiv({
                cls: "message-timestamp",
                text: this.formatTime(message.timestamp),
            });
        }
    }

    // Create a copy button for the message
    private createCopyButton(container: HTMLElement, message: Message): HTMLElement {
        const copyButton = container.createEl("button", {
            cls: "copy-button",
            attr: { title: "Copy message" },
        });
        setIcon(copyButton, "copy");

        copyButton.addEventListener("click", () => {
            let textToCopy = message.content;
            if (isAssistant(message.role) && textToCopy.includes("<think>")) {
                textToCopy = textToCopy.replace(/<think>[\s\S]*?<\/think>/g, "");
            }

            navigator.clipboard.writeText(textToCopy);

            copyButton.setText("Copied!");
            setTimeout(() => {
                copyButton.empty();
                setIcon(copyButton, "copy");
            }, 2000);
        });

        return copyButton;
    }

    // Process request with Ollama
    private async processWithOllama(content: string): Promise<void> {
        if (!this.view) return;

        this.isProcessing = true;
        const loadingMessageEl = this.view.addLoadingMessage();

        setTimeout(async () => {
            try {
                let useSystemPrompt = false;
                if (this.plugin.settings.followRole) {
                    const systemPromptInterval = this.plugin.settings.systemPromptInterval || 0;

                    if (systemPromptInterval === 0) {
                        useSystemPrompt = true;
                    } else if (systemPromptInterval > 0) {
                        useSystemPrompt = this.messagesPairCount % systemPromptInterval === 0;
                    }
                }

                const isNewConversation = this.messages.length <= 1;

                const formattedPrompt = await this.plugin.promptService.prepareFullPrompt(
                    content,
                    isNewConversation
                );

                const requestBody: OllamaRequestBody = {
                    model: this.plugin.settings.modelName,
                    prompt: formattedPrompt,
                    stream: false,
                    temperature: this.plugin.settings.temperature || 0.2,
                    options: {
                        num_ctx: this.plugin.settings.contextWindow || 8192,
                    }
                };

                if (useSystemPrompt) {
                    const systemPrompt = this.plugin.promptService.getSystemPrompt();
                    if (systemPrompt) {
                        requestBody.system = systemPrompt;
                    }
                }

                const data = await this.plugin.apiService.generateResponse(requestBody);

                this.removeLoadingMessage(loadingMessageEl);
                this.addMessage(MessageType.ASSISTANT, data.response);
                this.initializeThinkingBlocks();
            } catch (error) {
                console.error("Error processing request with Ollama:", error);
                this.removeLoadingMessage(loadingMessageEl);

                const errorMessage = error instanceof Error
                    ? error.message
                    : "Unknown error occurred";

                this.addMessage(
                    MessageType.ERROR,
                    `Connection error with Ollama: ${errorMessage}. Please check the settings and ensure the server is running.`
                );
            } finally {
                this.isProcessing = false;
            }
        }, 0);
    }

    public addSystemMessage(content: string): void {
        this.addMessage(MessageType.SYSTEM, content);
    }

    private removeLoadingMessage(loadingMessageEl: HTMLElement): void {
        if (loadingMessageEl && loadingMessageEl.parentNode) {
            loadingMessageEl.parentNode.removeChild(loadingMessageEl);
        }
    }

    private isFirstMessageInGroup(message: Message): boolean {
        const index = this.messages.indexOf(message);
        if (index === 0) return true;
        const prevMessage = this.messages[index - 1];
        return prevMessage.role !== message.role;
    }

    private isLastMessageInGroup(message: Message): boolean {
        const index = this.messages.indexOf(message);
        if (index === this.messages.length - 1) return true;
        const nextMessage = this.messages[index + 1];
        return nextMessage.role !== message.role;
    }

    private formatTime(date: Date): string {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    private decodeHtmlEntities(text: string): string {
        const textArea = document.createElement("textarea");
        textArea.innerHTML = text;
        return textArea.value;
    }

    private renderMarkdown(content: string, element: HTMLElement): void {
        if (!this.view) return;
        MarkdownRenderer.renderMarkdown(content, element, "", this.view);
    }

    private processThinkingTags(content: string): string {
        if (!content.includes("<think>")) {
            return content;
        }

        const parts = [];
        let currentPosition = 0;
        const thinkingRegex = /<think>([\s\S]*?)<\/think>/g;
        let match;

        while ((match = thinkingRegex.exec(content)) !== null) {
            if (match.index > currentPosition) {
                const textBefore = content.substring(currentPosition, match.index);
                parts.push(this.markdownToHtml(textBefore));
            }

            const thinkingContent = match[1];

            const foldableHtml = `
          <div class="thinking-block">
            <div class="thinking-header" data-fold-state="expanded">
              <div class="thinking-toggle">▼</div>
              <div class="thinking-title">Thinking</div>
            </div>
            <div class="thinking-content">${this.markdownToHtml(
                thinkingContent
            )}</div>
          </div>
        `;

            parts.push(foldableHtml);
            currentPosition = match.index + match[0].length;
        }

        if (currentPosition < content.length) {
            const textAfter = content.substring(currentPosition);
            parts.push(this.markdownToHtml(textAfter));
        }

        return parts.join("");
    }

    private markdownToHtml(markdown: string): string {
        if (!markdown || markdown.trim() === "" || !this.view) return "";

        const tempDiv = document.createElement("div");
        MarkdownRenderer.renderMarkdown(markdown, tempDiv, "", this.view);
        return tempDiv.innerHTML;
    }

    private addThinkingToggleListeners(contentEl: HTMLElement): void {
        const thinkingHeaders = contentEl.querySelectorAll(".thinking-header");

        thinkingHeaders.forEach((header) => {
            header.addEventListener("click", () => {
                const content = header.nextElementSibling as HTMLElement;
                const toggleIcon = header.querySelector(
                    ".thinking-toggle"
                ) as HTMLElement;

                if (!content || !toggleIcon) return;

                const isFolded = header.getAttribute("data-fold-state") === "folded";

                if (isFolded) {
                    content.style.display = "block";
                    toggleIcon.textContent = "▼";
                    header.setAttribute("data-fold-state", "expanded");
                } else {
                    content.style.display = "none";
                    toggleIcon.textContent = "►";
                    header.setAttribute("data-fold-state", "folded");
                }
            });
        });
    }

    private initializeThinkingBlocks(): void {
        if (!this.view) return;

        setTimeout(() => {
            if (!this.view) return;
            const thinkingHeaders =
                this.view.getChatContainer().querySelectorAll(".thinking-header");

            thinkingHeaders.forEach((header) => {
                const content = header.nextElementSibling as HTMLElement;
                const toggleIcon = header.querySelector(
                    ".thinking-toggle"
                ) as HTMLElement;

                if (!content || !toggleIcon) return;

                content.style.display = "none";
                toggleIcon.textContent = "►";
                header.setAttribute("data-fold-state", "folded");
            });
        }, 100);
    }
}

// Helper function to check if a message role is from the assistant
function isAssistant(role: MessageType): boolean {
    return role === MessageType.ASSISTANT;
}