// src/SystemMessageRenderer.ts
import { App, setIcon } from 'obsidian';
import { Message } from './types';
import { CSS_CLASSES } from './constants';
import { MessageRenderer } from './interfaces';

interface MessageFormatter {
    formatTime: (date: Date) => string;
}

export class SystemMessageRenderer implements MessageRenderer {
    private app: App;
    private message: Message;
    private formatter: MessageFormatter;
    public element: HTMLElement | null = null;

    constructor(app: App, message: Message, formatter: MessageFormatter) {
        if (message.role !== 'system') {
            throw new Error("SystemMessageRenderer can only handle messages with role 'system'.");
        }
        this.app = app;
        this.message = message;
        this.formatter = formatter;
    }

    private getIconType(): string {
        switch (this.message.type) {
            case 'warning': return 'alert-triangle';
            case 'error': return 'alert-circle';
            default: return 'info';
        }
    }

    render(): HTMLElement {
        const message = this.message;

        const messageGroup = document.createElement('div');
        messageGroup.classList.add(CSS_CLASSES.MESSAGE_GROUP, CSS_CLASSES.SYSTEM_GROUP);
        messageGroup.setAttribute("data-timestamp", message.timestamp.getTime().toString());

        const messageWrapper = messageGroup.createDiv({ cls: "message-wrapper" });
        messageWrapper.style.order = "2";

        const messageEl = messageWrapper.createDiv({ cls: `${CSS_CLASSES.MESSAGE} ${CSS_CLASSES.SYSTEM_MESSAGE}` });

        const contentContainer = messageEl.createDiv({ cls: CSS_CLASSES.CONTENT_CONTAINER });

        const iconSpan = contentContainer.createSpan({ cls: CSS_CLASSES.SYSTEM_ICON });
        setIcon(iconSpan, this.getIconType());

        contentContainer.createSpan({
            cls: CSS_CLASSES.SYSTEM_TEXT,
            text: message.content,
        });

        messageEl.createDiv({
            cls: CSS_CLASSES.TIMESTAMP,
            text: this.formatter.formatTime(message.timestamp),
        });

        this.element = messageGroup;
        return this.element;
    }
}