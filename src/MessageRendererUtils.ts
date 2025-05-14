// src/MessageRendererUtils.ts
import { App, MarkdownRenderer, Notice, setIcon, TFile, normalizePath } from "obsidian";
import { OllamaView } from "./OllamaView"; 
import OllamaPlugin from "./main"; 
import { CSS_CLASSES } from "./constants"; 
import { AvatarType } from "./settings"; 


// CODE_BLOCK_COPY_BUTTON та CODE_BLOCK_LANGUAGE тепер очікуються з CSS_CLASSES

export interface ThinkDetectionResult {
    hasThinkingTags: boolean;
    contentWithoutTags: string; 
    format: string;
}

export function decodeHtmlEntities(text: string): string {
    if (typeof document === "undefined") {
        return text
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
    }
    const ta = document.createElement("textarea");
    ta.innerHTML = text;
    return ta.value;
}

export function detectThinkingTags(content: string): ThinkDetectionResult {
    // Цей регулярний вираз має знаходити найкоротше співпадіння між <think> та </think>
    const thinkTagRegex = /<think>[\s\S]*?<\/think>/gi; 
    let contentWithoutTags = content;
    let hasThinkingTags = false;

    // Видаляємо всі входження ітеративно, щоб впоратися з потенційною вкладеністю або проблемами regex
    let previousContent;
    do {
        previousContent = contentWithoutTags;
        contentWithoutTags = contentWithoutTags.replace(thinkTagRegex, '');
        if (previousContent !== contentWithoutTags) {
            hasThinkingTags = true;
        }
    } while (previousContent !== contentWithoutTags && contentWithoutTags.includes("<think>")); // Повторюємо, доки є зміни та теги

    contentWithoutTags = contentWithoutTags.trim();
    const format = /<[a-z][\s\S]*>/i.test(contentWithoutTags) ? 'html' : 'text';

    return {
        hasThinkingTags,
        contentWithoutTags: contentWithoutTags,
        format
    };
}

export async function markdownToHtml(
    app: App,
    view: any, 
    markdown: string,
): Promise<string> {
    if (!markdown?.trim()) return "";
    const div = document.createElement("div");
    try {
        await MarkdownRenderer.render(
            app,
            markdown,
            div,
            app.vault.getRoot()?.path ?? "", 
            view, 
        );
    } catch (error) {
        console.error("Markdown rendering error, falling back to text:", error);
        div.textContent = markdown; 
    }
    return div.innerHTML;
}

export async function processThinkingTags(
    app: App,
    view: any, // OllamaView
    content: string,
): Promise<string> {
    const thinkTagRegex = /<think>([\s\S]*?)<\/think>/g;
    const parts: string[] = [];
    let lastIndex = 0;
    let match;

    while ((match = thinkTagRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            const normalText = content.substring(lastIndex, match.index);
            parts.push(await markdownToHtml(app, view, normalText));
        }

        const thinkContent = match[1];
        const renderedThinkContent = await markdownToHtml(app, view, thinkContent);
        // Використовуйте CSS_CLASSES для цих класів, якщо вони визначені глобально
        const headerHtml = `<div class="${CSS_CLASSES.THINKING_HEADER || "thinking-header"}" data-fold-state="folded"><div class="${CSS_CLASSES.THINKING_TOGGLE || "thinking-toggle"}">►</div><div class="${CSS_CLASSES.THINKING_TITLE || "thinking-title"}">Thinking</div></div>`;
        const contentHtml = `<div class="${CSS_CLASSES.THINKING_CONTENT || "thinking-content"}" style="display: none;">${renderedThinkContent}</div>`;
        parts.push(`<div class="${CSS_CLASSES.THINKING_BLOCK || "thinking-block"}">${headerHtml}${contentHtml}</div>`);

        lastIndex = thinkTagRegex.lastIndex;
    }

    if (lastIndex < content.length) {
        const remainingText = content.substring(lastIndex);
        parts.push(await markdownToHtml(app, view, remainingText));
    }

    return parts.join("");
}

export function addThinkingToggleListeners(
    view: OllamaView, 
    contentEl: HTMLElement,
): void {
    const headers = contentEl.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.THINKING_HEADER || "thinking-header"}`);
    headers.forEach(header => {
        if ((header as any)._listenerAttached) return;

        view.registerDomEvent(header, "click", () => {
            const content = header.nextElementSibling as HTMLElement;
            const toggle = header.querySelector<HTMLElement>(`.${CSS_CLASSES.THINKING_TOGGLE || "thinking-toggle"}`);
            if (!content || !toggle) return;

            const isFolded = header.getAttribute("data-fold-state") === "folded";
            if (isFolded) {
                content.style.display = "block";
                toggle.textContent = "▼";
                header.setAttribute("data-fold-state", "expanded");
            } else {
                content.style.display = "none";
                toggle.textContent = "►";
                header.setAttribute("data-fold-state", "folded");
            }
        });
        (header as any)._listenerAttached = true; 
    });
}

export function enhanceCodeBlocks(contentEl: HTMLElement, view: OllamaView): void {
    if (!view || !view.plugin) {
        view.plugin.logger.error("[enhanceCodeBlocks] Missing view or plugin context!");
        return;
    }
    try {
        const codeBlocks = contentEl.querySelectorAll<HTMLElement>("pre > code");
        codeBlocks.forEach((codeElement) => {
            const preElement = codeElement.parentElement as HTMLPreElement;
            if (!preElement) return;

             if (preElement.querySelector(`.${CSS_CLASSES.CODE_BLOCK_COPY_BUTTON}`)) {
                return;
             }
             preElement.classList.add("enhanced"); // Додайте маркерний клас, щоб уникнути повторної обробки

            const copyButton = preElement.createEl("button", {
                 cls: `${CSS_CLASSES.CODE_BLOCK_COPY_BUTTON} clickable-icon`,
                 attr: { "aria-label": "Copy code", title: "Copy code" },
             });
            setIcon(copyButton, "copy");

            view.registerDomEvent(copyButton, "click", (event) => {
                 event.stopPropagation();
                 const codeToCopy = codeElement.textContent || "";
                 navigator.clipboard.writeText(codeToCopy).then(() => {
                     setIcon(copyButton, "check");
                     setTimeout(() => setIcon(copyButton, "copy"), 2000);
                 }).catch(err => {
                     view.plugin.logger.error("Failed to copy code block:", err);
                     new Notice("Failed to copy code to clipboard.");
                 });
             });

            const language = Array.from(codeElement.classList).find(cls => cls.startsWith("language-"))?.replace("language-", "");
            if (language && !preElement.querySelector(`.${CSS_CLASSES.CODE_BLOCK_LANGUAGE}`)) { 
                preElement.createDiv({
                    cls: CSS_CLASSES.CODE_BLOCK_LANGUAGE,
                    text: language,
                });
            }
             preElement.style.position = "relative"; 
        });
    } catch (error) {
         view.plugin.logger.error("[MessageRendererUtils.enhanceCodeBlocks] Error processing code blocks:", error);
    }
}

export function fixBrokenTwemojiImages(contentEl: HTMLElement): void {
     try {
        contentEl.querySelectorAll('img.emoji[alt][src*="twemoji.maxcdn.com"]').forEach((img: HTMLImageElement) => {
            const alt = img.getAttribute('alt');
            if (alt && !img.getAttribute('data-fixed')) { 
                 const emojiHex = alt.codePointAt(0)?.toString(16);
                 if (emojiHex) {
                     img.src = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${emojiHex}.svg`;
                     img.setAttribute('data-fixed', 'true'); 
                     img.onerror = () => { 
                          console.warn(`Failed to load emoji from jsdelivr: ${alt}`);
                         if (img.parentNode) { 
                             img.replaceWith(document.createTextNode(alt));
                         }
                     };
                 } else if (img.parentNode) {
                    img.replaceWith(document.createTextNode(alt));
                 }
            }
        });
     } catch (error) {
          console.error("[MessageRendererUtils.fixBrokenTwemojiImages] Error fixing Twemoji:", error);
     }
}

export async function renderMarkdownContent( 
    app: App,
    view: OllamaView,
    plugin: OllamaPlugin,
    containerEl: HTMLElement,
    markdownText: string,
): Promise<void> {
    try {
        containerEl.empty();
        const decodedContent = decodeHtmlEntities(markdownText);
        const thinkingInfo = detectThinkingTags(decodedContent);

        if (thinkingInfo.hasThinkingTags) {
            const processedHtml = await processThinkingTags(app, view, decodedContent);
            containerEl.innerHTML = processedHtml;
            addThinkingToggleListeners(view, containerEl);
        } else {
            await MarkdownRenderer.render(app, decodedContent, containerEl, plugin.app.vault.getRoot()?.path ?? "", view);
        }
        
        enhanceCodeBlocks(containerEl, view);
        if (plugin.settings.fixBrokenEmojis) {
            fixBrokenTwemojiImages(containerEl);
        }
    } catch (error) {
        plugin.logger.error(
            "[MessageRendererUtils.renderMarkdownContent] Error rendering content:",
            error, "Content Preview:", markdownText.substring(0, 200),
        );
        containerEl.empty(); 
        containerEl.setText(`[Error rendering content. Please check console.]`);
    }
}

export function renderAvatar(
    app: App,
    plugin: OllamaPlugin,
    groupEl: HTMLElement,
    isUser: boolean,
    avatarRoleType?: 'user' | 'assistant' | 'system' | 'tool' | 'error' | 'tool-usage' | string // Додав 'tool-usage' як приклад
): void {
    const settings = plugin.settings;
    
    let avatarTypeToUse: AvatarType;
    let avatarContentToUse: string;
    // specificIcon та defaultAiIcon тут можуть бути не потрібні, якщо логіка зміниться

    if (isUser) {
        avatarTypeToUse = settings.userAvatarType;
        avatarContentToUse = settings.userAvatarContent;
    } else {
        // Визначаємо тип і контент індивідуально для кожної ролі
        switch (avatarRoleType) {
            // case 'tool': // Це для "Tool Executed..."
            // // case 'tool-usage': // Якщо ви використовуєте окремий тип для "Using tool..."
            //     avatarTypeToUse = 'icon'; // Завжди іконка для інструментів
            //     avatarContentToUse = 'settings'; // Або 'cog' - це іконка шестерні в Lucide
            //     break;
            case 'system':
                avatarTypeToUse = 'icon'; 
                avatarContentToUse = 'info';  
                break;
            case 'error':
                avatarTypeToUse = 'icon'; 
                avatarContentToUse = 'alert-triangle'; 
                break;
            case 'assistant':
            default: // Звичайний AI асистент
                avatarTypeToUse = settings.aiAvatarType;   
                avatarContentToUse = settings.aiAvatarContent; 
                if (avatarTypeToUse === 'icon' && !avatarContentToUse) {
                    avatarContentToUse = "bot"; // Fallback іконка для асистента, якщо не вказано
                }
                break;
        }
    }
    
    const mainAvatarContainerClass = CSS_CLASSES.AVATAR_CONTAINER || "avatar-container";
    // Додамо специфічний клас для аватара інструменту для можливої подальшої стилізації
    let specificAvatarRoleClass = isUser ? (CSS_CLASSES.AVATAR_USER_SPECIFIC || "user-avatar") : (CSS_CLASSES.AVATAR_AI_SPECIFIC || "ai-avatar");
    if (!isUser && (avatarRoleType === 'tool' /*|| avatarRoleType === 'tool-usage'*/)) {
                specificAvatarRoleClass = `${specificAvatarRoleClass} ${CSS_CLASSES.AVATAR_TOOL_SPECIFIC || "avatar-tool-specific"}`;

    }
  
    let avatarEl = groupEl.querySelector<HTMLElement>(`.${mainAvatarContainerClass.split(" ")[0]}`); 
    if (!avatarEl) {
        avatarEl = groupEl.createDiv({ cls: [mainAvatarContainerClass, specificAvatarRoleClass].join(' ') });
    } else {
        avatarEl.className = ""; 
        avatarEl.classList.add(...mainAvatarContainerClass.split(' '), ...specificAvatarRoleClass.split(' '));
    }
    avatarEl.empty(); 
  
    try {
      if (avatarTypeToUse === "image" && avatarContentToUse) {
        // ... (код для зображення залишається тим самим)
        const imagePath = normalizePath(avatarContentToUse);
        const imageFile = app.vault.getAbstractFileByPath(imagePath);
  
        if (imageFile instanceof TFile) {
          const imageUrl = app.vault.getResourcePath(imageFile);
          avatarEl.createEl("img", {
            attr: { src: imageUrl, alt: isUser ? "User Avatar" : (avatarRoleType || "AI") + " Avatar" },
            cls: CSS_CLASSES.AVATAR_IMAGE || "avatar-image",
          });
          avatarEl.title = `Avatar from: ${imagePath}`;
        } else {
           plugin.logger.warn(`Avatar image file not found or not a TFile: ${imagePath}. Using fallback.`);
           throw new Error("Invalid image path or not a file.");
        }
      } else if (avatarTypeToUse === "icon" && avatarContentToUse) { 
        setIcon(avatarEl.createSpan({ cls: CSS_CLASSES.AVATAR_ICON || "avatar-icon" }), avatarContentToUse);
        avatarEl.title = `Icon: ${avatarContentToUse}`;
      } else { // Initials or fallback
        // ... (код для ініціалів залишається тим самим)
        let initials = avatarContentToUse?.substring(0, 2).toUpperCase();
        if (!initials) { 
            if (isUser) {
                initials = "U";
            } else {
                initials = avatarRoleType ? avatarRoleType.substring(0,1).toUpperCase() : "AI";
                if (initials.length > 2) initials = initials.substring(0,2); 
                if (!initials) initials = "AI"; 
            }
        }
        avatarEl.createDiv({cls: CSS_CLASSES.AVATAR_INITIALS || "avatar-initials", text: initials}); 
        avatarEl.title = `Initials: ${initials}`;
      }
    } catch (e: any) {
      plugin.logger.warn(`Failed to render avatar (type: ${avatarTypeToUse}, content: ${avatarContentToUse}, roleType: ${avatarRoleType}):`, e.message);
      // Змінюємо fallback іконку для інструментів, якщо основна логіка не спрацювала
      const fallbackIconName = (avatarRoleType === 'tool' /*|| avatarRoleType === 'tool-usage'*/) ? 'settings' 
                             : isUser ? "user-circle" 
                             : "bot"; // Або settings.aiAvatarContent, якщо це іконка
      avatarEl.empty(); 
      setIcon(avatarEl.createSpan({ cls: CSS_CLASSES.AVATAR_ICON || "avatar-icon" }), fallbackIconName);
      avatarEl.title = `Fallback Avatar (Icon: ${fallbackIconName})`;
    }
}

// Видалено неправильну функцію RendererUtils
// export function RendererUtils(app: App, plugin: OllamaPlugin, messageGroup: HTMLElement, arg3: boolean) {
//   throw new Error("Function not implemented.");
// }