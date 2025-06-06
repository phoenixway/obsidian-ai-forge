import { App, Modal, setIcon, Notice, debounce, Platform } from "obsidian";
import OllamaPlugin from "./main";
import { OllamaView } from "./OllamaView";
import { Logger } from "./Logger";

// --- CSS Constants defined at the module level ---
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
const CSS_ATTACHMENT_LINK_ITEM_REMOVE = "ollama-link-item-remove"; // Shared name for remove buttons
const CSS_ATTACHMENT_EMPTY_LIST = "ollama-attachment-empty-list";
const CSS_ATTACHMENT_EMPTY_ICON = "ollama-attachment-empty-icon";
const CSS_ATTACHMENT_EMPTY_HINT = "ollama-attachment-empty-hint";
// const CSS_ATTACHMENT_PLACEHOLDER = "ollama-attachment-placeholder"; // Not used in provided errors, but keep if needed
// const CSS_ATTACHMENT_PLACEHOLDER_ICON = "ollama-attachment-placeholder-icon"; // Not used in provided errors

const CSS_ATTACHMENT_FILE_INPUT_LABEL = "ollama-attachment-file-input-label";
const CSS_ATTACHMENT_FILE_LIST = "ollama-attachment-file-list";
const CSS_ATTACHMENT_FILE_ITEM = "ollama-attachment-file-item";
const CSS_ATTACHMENT_FILE_ITEM_NAME = "ollama-attachment-file-item-name";
const CSS_ATTACHMENT_FILE_ITEM_SIZE = "ollama-attachment-file-item-size";
const CSS_ATTACHMENT_FILE_ITEM_PREVIEW = "ollama-attachment-file-item-preview";
// CSS_ATTACHMENT_FILE_ITEM_REMOVE is the same as CSS_ATTACHMENT_LINK_ITEM_REMOVE
const CSS_ATTACHMENT_CLEAR_ALL_CONTAINER = "ollama-attachment-clear-all-container";


interface AttachmentLink {
    id: string;
    url: string;
}

interface AttachmentFile {
    id: string;
    file: File; 
    previewUrl?: string; 
}

export class AttachmentManager {
    private plugin: OllamaPlugin;
    private app: App;
    private view: OllamaView;
    private modal: AttachmentModal | null = null;
    private attachmentButtonElement: HTMLElement | null = null;

    private currentLinks: AttachmentLink[] = [];
    private currentImages: AttachmentFile[] = [];
    private currentDocuments: AttachmentFile[] = [];

    constructor(plugin: OllamaPlugin, app: App, view: OllamaView) {
        this.plugin = plugin;
        this.app = app;
        this.view = view;
    }

    public setAttachmentButtonElement(buttonEl: HTMLElement): void {
        this.attachmentButtonElement = buttonEl;
    }

    public toggleVisibility(): void {
        if (this.modal && this.modal.isCurrentlyOpen) {
            this.hide();
        } else {
            this.show();
        }
    }

    public show(): void {
        if (this.modal && this.modal.isCurrentlyOpen) {
            return;
        }
        this.modal = new AttachmentModal(this.app, this.plugin, this, this.attachmentButtonElement);
        this.modal.open();
    }

    public hide(): void {
        if (this.modal && this.modal.isCurrentlyOpen) {
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
                new Notice("Invalid URL format. Please enter a valid URL.", 3000);
                return;
            }
            this.currentLinks.push({ id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, url: trimmedUrl });
            this.modal?.refreshCurrentTabContent(); 
            this.plugin.logger.debug("Added link:", trimmedUrl);
        } else if (this.currentLinks.some(link => link.url === trimmedUrl)) {
             new Notice("This link has already been added.", 3000);
        }
    }

        public removeLink(linkId: string): void {
        this.currentLinks = this.currentLinks.filter(link => link.id !== linkId);
        this.modal?.refreshCurrentTabContent(); 
        this.plugin.logger.debug("Removed link:", linkId);
    }

    public getLinks(): AttachmentLink[] {
        return [...this.currentLinks];
    }

        public clearAllLinks(): void {
        if (this.currentLinks.length > 0) {
            this.currentLinks = [];
            this.modal?.refreshCurrentTabContent(); 
            this.plugin.logger.debug("Cleared all links");
        }
    }

        public addImage(file: File): void {
        const newImage: AttachmentFile = {
            id: `image-${Date.now()}-${file.name}-${Math.random().toString(36).substr(2, 9)}`,
            file: file,
        };
        // Створення URL для попереднього перегляду
        newImage.previewUrl = URL.createObjectURL(file);
        this.currentImages.push(newImage);
        this.modal?.refreshCurrentTabContent(); 
        this.plugin.logger.debug("Added image:", file.name);
    }

    

    public getImages(): AttachmentFile[] {
        return [...this.currentImages];
    }
    public removeImage(imageId: string): void {
        const imageToRemove = this.currentImages.find(img => img.id === imageId);
        if (imageToRemove && imageToRemove.previewUrl) {
            URL.revokeObjectURL(imageToRemove.previewUrl); // Важливо звільнити пам'ять
        }
        this.currentImages = this.currentImages.filter(img => img.id !== imageId);
        this.modal?.refreshCurrentTabContent(); 
        this.plugin.logger.debug("Removed image:", imageId);
    }
    
        public clearAllImages(): void {
        if (this.currentImages.length > 0) {
            this.currentImages.forEach(img => {
                if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
            });
            this.currentImages = [];
            this.modal?.refreshCurrentTabContent(); 
            this.plugin.logger.debug("Cleared all images");
        }
    }

        public addDocument(file: File): void {
        this.currentDocuments.push({
            id: `doc-${Date.now()}-${file.name}-${Math.random().toString(36).substr(2, 9)}`,
            file: file,
        });
        this.modal?.refreshCurrentTabContent(); 
        this.plugin.logger.debug("Added document:", file.name);
    }

        public removeDocument(docId: string): void {
        this.currentDocuments = this.currentDocuments.filter(doc => doc.id !== docId);
        this.modal?.refreshCurrentTabContent(); 
        this.plugin.logger.debug("Removed document:", docId);
    }

    public getDocuments(): AttachmentFile[] {
        return [...this.currentDocuments];
    }

        public clearAllDocuments(): void {
        if (this.currentDocuments.length > 0) {
            this.currentDocuments = [];
            this.modal?.refreshCurrentTabContent(); 
            this.plugin.logger.debug("Cleared all documents");
        }
    }
    
    public getActiveAttachmentsForApi(): { links: string[], images: File[], documents: File[] } {
        return {
            links: this.currentLinks.map(link => link.url),
            images: this.currentImages.map(img => img.file),
            documents: this.currentDocuments.map(doc => doc.file),
        };
    }

    public isVisible(): boolean {
        return !!(this.modal && this.modal.isCurrentlyOpen);
    }
    
    public handleDocumentClick(event: MouseEvent, attachmentButtonTrigger: HTMLElement): void {
        if (this.modal && this.modal.isCurrentlyOpen && this.modal.containerEl) {
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
        this.clearAllImages(); 
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
    
    private imagesTabContentEl!: HTMLElement;
    private documentsTabContentEl!: HTMLElement;
    private linksTabContentEl!: HTMLElement;

    public isCurrentlyOpen: boolean = false;

    constructor(app: App, plugin: OllamaPlugin, manager: AttachmentManager, triggerElement: HTMLElement | null) {
        super(app);
        this.plugin = plugin;
        this.manager = manager;
        this.triggerElement = triggerElement;
        
        // Use constants directly by name
        this.modalEl.addClass(CSS_ATTACHMENT_MANAGER_MODAL);
        this.containerEl.addClass("ollama-attachment-modal-container"); 

        if (this.triggerElement) {
            this.modalEl.style.position = 'absolute'; 
            this.modalEl.style.width = '380px'; 
            this.modalEl.style.maxHeight = '450px'; 
        }
    }

    onOpen() {
        this.isCurrentlyOpen = true; 
        const { contentEl } = this; 
        contentEl.empty();
        contentEl.addClass(CSS_ATTACHMENT_MODAL_CONTENT_WRAPPER); // Use constant

        this.tabsEl = contentEl.createDiv({ cls: CSS_ATTACHMENT_TABS }); // Use constant
        this.contentContainerEl = contentEl.createDiv({ cls: CSS_ATTACHMENT_CONTENT_CONTAINER }); // Use constant

        this.renderTabs();
        this.renderContent(); 

        if (this.triggerElement) {
            this.positionModal();
            window.addEventListener('resize', this.positionModalDebounced);
        }
    }
    
    private positionModal = () => {
        if (!this.triggerElement || !this.isCurrentlyOpen) return;

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
    
    private positionModalDebounced = debounce(this.positionModal, 50, true);

    public refreshCurrentTabContent(): void {
        // Цей метод просто викликає renderContent, який вже знає, яка вкладка активна
        // і передасть правильний, щойно створений контейнер у відповідний метод рендерингу.
        if (this.isCurrentlyOpen && this.contentContainerEl) { // Перевірка, що модалка відкрита і контейнер існує
            this.renderContent();
            this.positionModal(); // Перерахувати позицію, оскільки вміст міг змінити висоту
        }
    }


    private renderTabs(): void {
        this.tabsEl.empty();
        this.createTabButton("Images", "images", "image-file");
        this.createTabButton("Documents", "documents", "file-text");
        this.createTabButton("Links", "links", "link");
    }
    
    private createTabButton(label: string, tabId: 'images' | 'documents' | 'links', iconName: string): void {
        const tabButton = this.tabsEl.createEl('button', {
            cls: [CSS_ATTACHMENT_TAB, `ollama-attachment-tab-${tabId}`], // Use constant
        });
        setIcon(tabButton, iconName);
        tabButton.appendText(label); 
        if (this.activeTab === tabId) {
            tabButton.addClass(CSS_ATTACHMENT_TAB_ACTIVE); // Use constant
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
        this.contentContainerEl.empty(); // Очищаємо весь контейнер вмісту при кожному виклику

        const activeContentEl = this.contentContainerEl.createDiv({
            cls: [CSS_ATTACHMENT_CONTENT, `ollama-attachment-content-${this.activeTab}`, CSS_ATTACHMENT_CONTENT_ACTIVE]
        });

        switch (this.activeTab) {
            case 'images':
                this.renderImagesTabContent(activeContentEl); // Передаємо актуальний контейнер
                break;
            case 'documents':
                this.renderDocumentsTabContent(activeContentEl); // Передаємо актуальний контейнер
                break;
            case 'links':
                this.renderLinksTabContent(activeContentEl); // Передаємо актуальний контейнер
                break;
        }
    }

        public renderImagesTabContent(container: HTMLElement): void {
        // container - це вже очищений і підготовлений div для цієї вкладки
        container.empty(); // Додатково очищаємо, щоб бути впевненим
        container.addClass(CSS_ATTACHMENT_LINKS_CONTAINER); // Можна використовувати спільний клас для базової структури

        this.createFileInputSection(
            container, // Використовуємо переданий контейнер
            "Add Images",
            "image",
            "image/*",
            true,
            this.manager.addImage.bind(this.manager)
        );

        const images = this.manager.getImages();
        this.createFileListDisplay(container, images, this.manager.removeImage.bind(this.manager), true);

        if (images.length > 0) {
            this.createClearAllButton(container, "Clear All Images", this.manager.clearAllImages.bind(this.manager));
        }
        if (this.triggerElement) this.positionModal(); // Оновлюємо позицію модалки
    }


  public renderDocumentsTabContent(container: HTMLElement): void {
        container.empty();
        container.addClass(CSS_ATTACHMENT_LINKS_CONTAINER);

        this.createFileInputSection(
            container,
            "Add Documents",
            "file-plus-2",
            ".pdf,.doc,.docx,.txt,.md,.csv,.json,.jsonl,.epub,.js,.ts,.tsx,.vue",
            true,
            this.manager.addDocument.bind(this.manager)
        );

        const documents = this.manager.getDocuments();
        this.createFileListDisplay(container, documents, this.manager.removeDocument.bind(this.manager), false);

        if (documents.length > 0) {
            this.createClearAllButton(container, "Clear All Documents", this.manager.clearAllDocuments.bind(this.manager));
        }
        if (this.triggerElement) this.positionModal();
    }
    
    
    private createFileInputSection(
        container: HTMLElement,
        buttonText: string,
        buttonIcon: string,
        acceptTypes: string,
        multiple: boolean,
        onFilesSelected: (file: File) => void 
    ): void {
        const inputId = `file-input-${Math.random().toString(36).substr(2, 9)}`;
        const label = container.createEl('label', {
            cls: [CSS_ATTACHMENT_FILE_INPUT_LABEL, "clickable-icon"], // Use constant
            attr: { for: inputId },
        });
        setIcon(label, buttonIcon);
        label.appendText(` ${buttonText}`);
        
        const fileInput = container.createEl('input', {
            type: 'file',
            attr: { id: inputId, accept: acceptTypes, multiple: multiple, style: "display: none;" },
        });

        fileInput.addEventListener('change', (event) => {
            const files = (event.target as HTMLInputElement).files;
            if (files) {
                for (let i = 0; i < files.length; i++) {
                    onFilesSelected(files[i]);
                }
                (event.target as HTMLInputElement).value = '';
            }
        });
    }

    private createFileListDisplay(
        container: HTMLElement,
        files: AttachmentFile[],
        onRemove: (fileId: string) => void,
        showPreview: boolean
    ): void {
        const fileListEl = container.createDiv({ cls: CSS_ATTACHMENT_FILE_LIST }); // Use constant
        if (files.length === 0) {
            const emptyState = fileListEl.createDiv({ cls: CSS_ATTACHMENT_EMPTY_LIST }); // Use constant
            setIcon(emptyState.createSpan({cls: CSS_ATTACHMENT_EMPTY_ICON}), "files"); // Use constant
            emptyState.createEl('p', { text: `No ${showPreview ? 'images' : 'documents'} added yet.` });
        } else {
            files.forEach(item => {
                const fileItemEl = fileListEl.createDiv({ cls: CSS_ATTACHMENT_FILE_ITEM }); // Use constant
                
                if (showPreview && item.previewUrl) {
                    const previewEl = fileItemEl.createDiv({ cls: CSS_ATTACHMENT_FILE_ITEM_PREVIEW }); // Use constant
                    previewEl.createEl('img', { attr: { src: item.previewUrl } });
                } else if (!showPreview) { 
                    setIcon(fileItemEl.createSpan({cls: "ollama-attachment-file-item-doc-icon"}), "file-text");
                }

                const nameSizeWrapper = fileItemEl.createDiv({cls: "ollama-attachment-file-item-details"});
                nameSizeWrapper.createSpan({ cls: CSS_ATTACHMENT_FILE_ITEM_NAME, text: item.file.name, title: item.file.name }); // Use constant
                nameSizeWrapper.createSpan({ cls: CSS_ATTACHMENT_FILE_ITEM_SIZE, text: `(${(item.file.size / 1024).toFixed(1)} KB)` }); // Use constant

                const removeButton = fileItemEl.createEl('button', { cls: CSS_ATTACHMENT_LINK_ITEM_REMOVE }); // Use constant (shared)
                setIcon(removeButton, "x-circle");
                removeButton.title = "Remove file";
                removeButton.onClickEvent(() => onRemove(item.id));
            });
        }
    }
    
    private createClearAllButton(container: HTMLElement, text: string, onClear: () => void): void {
        const clearAllContainer = container.createDiv({cls: CSS_ATTACHMENT_CLEAR_ALL_CONTAINER}); // Use constant
        const clearButton = clearAllContainer.createEl('button', { text: text, cls: "mod-danger" });
        setIcon(clearButton, "trash-2");
        clearButton.onClickEvent(onClear);
    }

     public renderLinksTabContent(container: HTMLElement): void {
        container.empty();
        container.addClass(CSS_ATTACHMENT_LINKS_CONTAINER);

        const inputArea = container.createDiv({ cls: CSS_ATTACHMENT_LINK_INPUT_AREA });
        const linkInputEl = inputArea.createEl('input', {
            type: 'text',
            placeholder: 'Enter URL and press Enter or click Add',
        });
        const addButton = inputArea.createEl('button', { text: 'Add' });
        setIcon(addButton, "plus-circle");

        const addCurrentLink = () => {
            const url = linkInputEl.value;
            if (url) {
                this.manager.addLink(url); // Менеджер викличе відповідний render...TabContent, передавши новий контейнер
                linkInputEl.value = '';
                linkInputEl.focus();
            }
        };
        linkInputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addCurrentLink(); }
        });
        addButton.addEventListener('click', addCurrentLink);

        const linkListEl = container.createDiv({ cls: CSS_ATTACHMENT_LINK_LIST });
        const links = this.manager.getLinks();

        if (links.length === 0) {
            const emptyState = linkListEl.createDiv({ cls: CSS_ATTACHMENT_EMPTY_LIST });
            setIcon(emptyState.createSpan({ cls: CSS_ATTACHMENT_EMPTY_ICON }), "link-2-off");
            emptyState.createEl('p', { text: 'No links added yet.' });
            emptyState.createEl('p', { cls: CSS_ATTACHMENT_EMPTY_HINT, text: 'Paste a URL above and click "Add" or press Enter.' });
        } else {
            links.forEach(link => {
                const linkItemEl = linkListEl.createDiv({ cls: CSS_ATTACHMENT_LINK_ITEM });
                linkItemEl.createSpan({ cls: CSS_ATTACHMENT_LINK_ITEM_TEXT, text: link.url, title: link.url });
                const removeButton = linkItemEl.createEl('button', { cls: CSS_ATTACHMENT_LINK_ITEM_REMOVE });
                setIcon(removeButton, "x-circle");
                removeButton.title = "Remove link";
                removeButton.onClickEvent(() => this.manager.removeLink(link.id)); // Менеджер викличе відповідний render...TabContent
            });
            if (links.length > 0) { // Додаємо кнопку очищення, якщо є посилання
                 this.createClearAllButton(container, "Clear All Links", this.manager.clearAllLinks.bind(this.manager));
            }
        }
        if (this.triggerElement) this.positionModal();
    }
    
    onClose() {
        this.isCurrentlyOpen = false;
        const { contentEl } = this;
        contentEl.empty();
        this.manager.onModalClose(this); 
        if (this.triggerElement) {
            window.removeEventListener('resize', this.positionModalDebounced);
        }
    }
}