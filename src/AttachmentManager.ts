import { App, Modal, setIcon, Notice, debounce } from "obsidian"; // ++ Added Notice, debounce
import OllamaPlugin from "./main";
import { OllamaView } from "./OllamaView";
import { Logger } from "./Logger"; 

const CSS_ATTACHMENT_MANAGER_MODAL = "ollama-attachment-manager-modal";
const CSS_ATTACHMENT_MODAL_CONTENT_WRAPPER = "ollama-attachment-modal-content-wrapper";
const CSS_ATTACHMENT_TABS = "ollama-attachment-tabs";
const CSS_ATTACHMENT_TAB = "ollama-attachment-tab";
const CSS_ATTACHMENT_TAB_ACTIVE = "is-active";
const CSS_ATTACHMENT_CONTENT_CONTAINER = "ollama-attachment-content-container";
const CSS_ATTACHMENT_CONTENT = "ollama-attachment-content";
const CSS_ATTACHMENT_CONTENT_ACTIVE = "is-active";

const CSS_ATTACHMENT_LINKS_CONTAINER = "ollama-links-container";
const CSS_ATTACHMENT_LINK_INPUT_AREA = "ollama-link-input-area";
const CSS_ATTACHMENT_LINK_LIST = "ollama-link-list";
const CSS_ATTACHMENT_LINK_ITEM = "ollama-link-item";
const CSS_ATTACHMENT_LINK_ITEM_TEXT = "ollama-link-item-text";
const CSS_ATTACHMENT_LINK_ITEM_REMOVE = "ollama-link-item-remove";
const CSS_ATTACHMENT_EMPTY_LIST = "ollama-attachment-empty-list";
const CSS_ATTACHMENT_EMPTY_ICON = "ollama-attachment-empty-icon";
const CSS_ATTACHMENT_EMPTY_HINT = "ollama-attachment-empty-hint";
const CSS_ATTACHMENT_PLACEHOLDER = "ollama-attachment-placeholder";
const CSS_ATTACHMENT_PLACEHOLDER_ICON = "ollama-attachment-placeholder-icon";
const CSS_ATTACHMENT_CLEAR_ALL_CONTAINER = "ollama-attachment-clear-all-container";


interface AttachmentLink {
    id: string;
    url: string;
}

export class AttachmentManager {
    private plugin: OllamaPlugin;
    private app: App;
    private view: OllamaView;
    private modal: AttachmentModal | null = null;
    private attachmentButtonElement: HTMLElement | null = null;

    private currentLinks: AttachmentLink[] = [];

    constructor(plugin: OllamaPlugin, app: App, view: OllamaView) {
        this.plugin = plugin;
        this.app = app;
        this.view = view;
    }

    public setAttachmentButtonElement(buttonEl: HTMLElement): void {
        this.attachmentButtonElement = buttonEl;
    }

    public toggleVisibility(): void {
        if (this.modal && this.modal.isCurrentlyOpen) { // MODIFIED
            this.hide();
        } else {
            this.show();
        }
    }

    public show(): void {
        if (this.modal && this.modal.isCurrentlyOpen) { // MODIFIED
            return;
        }
        this.modal = new AttachmentModal(this.app, this.plugin, this, this.attachmentButtonElement);
        this.modal.open();
    }

    public hide(): void {
        if (this.modal && this.modal.isCurrentlyOpen) { // MODIFIED
            this.modal.close();
        }
    }

    public addLink(url: string): void {
        const trimmedUrl = url.trim();
        if (trimmedUrl && !this.currentLinks.some(link => link.url === trimmedUrl)) {
            try {
                new URL(trimmedUrl);
            } catch (_) {
                this.plugin.logger.warn("Attempted to add invalid URL:", trimmedUrl);
                new Notice("Invalid URL format. Please enter a valid URL.", 3000); // Notice should be available now
                return;
            }
            this.currentLinks.push({ id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, url: trimmedUrl });
            this.modal?.renderLinksTabContent();
            this.plugin.logger.debug("Added link:", trimmedUrl);
        } else if (this.currentLinks.some(link => link.url === trimmedUrl)) {
             new Notice("This link has already been added.", 3000); // Notice should be available now
        }
    }

    public removeLink(linkId: string): void {
        this.currentLinks = this.currentLinks.filter(link => link.id !== linkId);
        this.modal?.renderLinksTabContent();
        this.plugin.logger.debug("Removed link:", linkId);
    }

    public getLinks(): AttachmentLink[] {
        return [...this.currentLinks];
    }
    
    public getActiveLinksForApi(): string[] {
        return this.currentLinks.map(link => link.url);
    }

    public clearAllLinks(): void {
        if (this.currentLinks.length > 0) {
            this.currentLinks = [];
            this.modal?.renderLinksTabContent();
            this.plugin.logger.debug("Cleared all links");
        }
    }

    public isVisible(): boolean {
        return !!(this.modal && this.modal.isCurrentlyOpen); // MODIFIED
    }
    
    public handleDocumentClick(event: MouseEvent, attachmentButtonTrigger: HTMLElement): void {
        if (this.modal && this.modal.isCurrentlyOpen && this.modal.containerEl) { // MODIFIED
            const targetEl = event.target as Node;
            if (!attachmentButtonTrigger.contains(targetEl) && !this.modal.containerEl.contains(targetEl)) {
                this.hide();
            }
        }
    }
    
    public onModalClose(modalInstance: AttachmentModal): void {
        if (this.modal === modalInstance) {
            this.modal = null;
        }
    }

    public destroy(): void {
        this.hide();
        this.plugin.logger.debug("AttachmentManager destroyed");
    }
}


class AttachmentModal extends Modal {
    private plugin: OllamaPlugin;
    private manager: AttachmentManager;
    private activeTab: 'images' | 'documents' | 'links' = 'links';
    private triggerElement: HTMLElement | null;

    private tabsEl!: HTMLElement;
    private contentContainerEl!: HTMLElement;
    private linksTabContentEl!: HTMLElement; 
    private linkInputEl!: HTMLInputElement;
    private linkListEl!: HTMLElement;
    public isCurrentlyOpen: boolean = false; // ++ NEW PROPERTY

    constructor(app: App, plugin: OllamaPlugin, manager: AttachmentManager, triggerElement: HTMLElement | null) {
        super(app);
        this.plugin = plugin;
        this.manager = manager;
        this.triggerElement = triggerElement;
        
        this.modalEl.addClass(CSS_ATTACHMENT_MANAGER_MODAL);
        this.containerEl.addClass("ollama-attachment-modal-container"); 

        if (this.triggerElement) {
            this.modalEl.style.position = 'absolute'; 
            this.modalEl.style.width = '350px'; 
            this.modalEl.style.maxHeight = '400px'; 
        }
    }

    onOpen() {
        this.isCurrentlyOpen = true; // ++ SET STATE
        const { contentEl } = this; 
        contentEl.empty();
        contentEl.addClass(CSS_ATTACHMENT_MODAL_CONTENT_WRAPPER);

        this.tabsEl = contentEl.createDiv({ cls: CSS_ATTACHMENT_TABS });
        this.contentContainerEl = contentEl.createDiv({ cls: CSS_ATTACHMENT_CONTENT_CONTAINER });

        this.renderTabs();
        this.renderContent();

        if (this.triggerElement) {
            this.positionModal();
            window.addEventListener('resize', this.positionModalDebounced);
        }
    }
    
    private positionModal = () => {
        if (!this.triggerElement || !this.isCurrentlyOpen) return; // MODIFIED to use isCurrentlyOpen

        const triggerRect = this.triggerElement.getBoundingClientRect();
        const modalHeight = this.modalEl.offsetHeight;

        let top = triggerRect.bottom + 5; 
        let left = triggerRect.left;

        if (top + modalHeight > window.innerHeight) {
            top = triggerRect.top - modalHeight - 5; 
        }

        this.modalEl.style.top = `${top}px`;
        this.modalEl.style.left = `${left}px`;
    }
    
    private positionModalDebounced = debounce(this.positionModal, 50, true); // debounce should be available


    private renderTabs(): void {
        this.tabsEl.empty();
        this.createTabButton("Images", "images", "image-file");
        this.createTabButton("Documents", "documents", "file-text");
        this.createTabButton("Links", "links", "link");
    }
    
    private createTabButton(label: string, tabId: 'images' | 'documents' | 'links', iconName: string): void {
        const tabButton = this.tabsEl.createEl('button', {
            cls: [CSS_ATTACHMENT_TAB, `ollama-attachment-tab-${tabId}`],
        });
        setIcon(tabButton, iconName);
        tabButton.appendText(label); 
        if (this.activeTab === tabId) {
            tabButton.addClass(CSS_ATTACHMENT_TAB_ACTIVE);
        }
        tabButton.onClickEvent(() => {
            if (this.activeTab === tabId) return; 
            this.activeTab = tabId;
            this.renderTabs(); 
            this.renderContent(); 
            this.positionModal(); 
        });
    }

    private renderContent(): void {
        this.contentContainerEl.empty();
        
        const activeContentEl = this.contentContainerEl.createDiv({ 
            cls: [CSS_ATTACHMENT_CONTENT, `ollama-attachment-content-${this.activeTab}`, CSS_ATTACHMENT_CONTENT_ACTIVE] 
        });

        switch (this.activeTab) {
            case 'images':
                this.renderPlaceholderContent(activeContentEl, "Image attachments are not yet implemented.", "image-off");
                break;
            case 'documents':
                this.renderPlaceholderContent(activeContentEl, "Document attachments are not yet implemented.", "file-question");
                break;
            case 'links':
                this.linksTabContentEl = activeContentEl; 
                this.renderLinksTabContent();
                break;
        }
    }

    public renderLinksTabContent(): void {
        if (!this.linksTabContentEl || this.activeTab !== 'links') {
            if (this.activeTab === 'links' && this.contentContainerEl) {
                 this.renderContent(); 
            }
            return;
        }
        
        this.linksTabContentEl.empty(); 
        this.linksTabContentEl.addClass(CSS_ATTACHMENT_LINKS_CONTAINER);

        const inputArea = this.linksTabContentEl.createDiv({ cls: CSS_ATTACHMENT_LINK_INPUT_AREA });
        this.linkInputEl = inputArea.createEl('input', {
            type: 'text',
            placeholder: 'Enter URL and press Enter or click Add',
        });
        const addButton = inputArea.createEl('button', { text: 'Add' });
        setIcon(addButton, "plus-circle");

        const addCurrentLink = () => {
            const url = this.linkInputEl.value;
            if (url) {
                this.manager.addLink(url); 
                this.linkInputEl.value = ''; 
                this.linkInputEl.focus();
            }
        };

        this.linkInputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCurrentLink();
            }
        });
        addButton.addEventListener('click', addCurrentLink);

        this.linkListEl = this.linksTabContentEl.createDiv({ cls: CSS_ATTACHMENT_LINK_LIST });
        const links = this.manager.getLinks();

        if (links.length === 0) {
            const emptyState = this.linkListEl.createDiv({cls: CSS_ATTACHMENT_EMPTY_LIST});
            setIcon(emptyState.createSpan({cls: CSS_ATTACHMENT_EMPTY_ICON}), "link-2-off");
            emptyState.createEl('p', { text: 'No links added yet.' });
            emptyState.createEl('p', { cls: CSS_ATTACHMENT_EMPTY_HINT, text: 'Paste a URL above and click "Add" or press Enter.' });

        } else {
            links.forEach(link => {
                const linkItemEl = this.linkListEl.createDiv({ cls: CSS_ATTACHMENT_LINK_ITEM });
                linkItemEl.createSpan({ cls: CSS_ATTACHMENT_LINK_ITEM_TEXT, text: link.url, title: link.url });
                const removeButton = linkItemEl.createEl('button', { cls: CSS_ATTACHMENT_LINK_ITEM_REMOVE });
                setIcon(removeButton, "x-circle");
                removeButton.title = "Remove link";
                removeButton.onClickEvent(() => {
                    this.manager.removeLink(link.id);
                });
            });
            
            const clearAllButtonContainer = this.linksTabContentEl.createDiv({cls: CSS_ATTACHMENT_CLEAR_ALL_CONTAINER});
            const clearAllButton = clearAllButtonContainer.createEl('button', { 
                text: 'Clear All Links',
                cls: "mod-danger" 
            });
            setIcon(clearAllButton, "trash-2"); 
            clearAllButton.onClickEvent(() => {
                this.manager.clearAllLinks();
            });
        }
        if (this.triggerElement) {
             this.positionModal();
        }
    }
    
    private renderPlaceholderContent(container: HTMLElement, text: string, icon: string) {
        container.empty();
        const placeholder = container.createDiv({ cls: CSS_ATTACHMENT_PLACEHOLDER });
        setIcon(placeholder.createSpan({cls: CSS_ATTACHMENT_PLACEHOLDER_ICON}), icon);
        placeholder.createEl('p', { text: text });
    }

    onClose() {
        this.isCurrentlyOpen = false; // ++ SET STATE
        const { contentEl } = this;
        contentEl.empty();
        this.manager.onModalClose(this); 
        if (this.triggerElement) {
            window.removeEventListener('resize', this.positionModalDebounced);
        }
    }
}