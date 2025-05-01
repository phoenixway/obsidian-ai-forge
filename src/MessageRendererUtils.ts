// src/MessageRendererUtils.ts
import { App, MarkdownRenderer, Notice, setIcon, TFile,normalizePath } from "obsidian";
import { OllamaView } from "./OllamaView"; // May need view context for registerDomEvent
import OllamaPlugin from "./main"; // For settings, logger
import { CSS_CLASSES } from "./constants"; // Import shared constants

// --- Constants from OllamaView related to rendering ---
const CSS_CLASS_THINKING_BLOCK = "thinking-block";
const CSS_CLASS_THINKING_HEADER = "thinking-header";
const CSS_CLASS_THINKING_TOGGLE = "thinking-toggle";
const CSS_CLASS_THINKING_TITLE = "thinking-title";
const CSS_CLASS_THINKING_CONTENT = "thinking-content";
const CSS_CLASS_CODE_BLOCK_COPY_BUTTON = "code-block-copy-button";
const CSS_CLASS_CODE_BLOCK_LANGUAGE = "code-block-language";

const CSS_CLASS_AVATAR = "message-group-avatar";
const CSS_CLASS_AVATAR_AI = "ai-avatar";
const CSS_CLASS_AVATAR_USER = "user-avatar";

export interface ThinkDetectionResult {
    hasThinkingTags: boolean;
    contentWithoutTags: string; // Додано: Контент БЕЗ тегів <think>
    format: string;
}

/** Decodes HTML entities in a string */
export function decodeHtmlEntities(text: string): string {
	if (typeof document === "undefined") {
		// Fallback for non-browser environments if needed
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
    const thinkTagRegex = /<think>[\s\S]*?<\/think>/gi; // g - global, i - case-insensitive
    const hasThinkingTags = thinkTagRegex.test(content);
    let processedContent = content; // За замовчуванням - оригінальний контент

    if (hasThinkingTags) {
        // Замінюємо всі входження тегу та його вмісту на порожній рядок і обрізаємо пробіли
        processedContent = content.replace(thinkTagRegex, '').trim();
    }

    // Визначаємо формат (спрощено)
    const format = /<[a-z][\s\S]*>/i.test(processedContent) ? 'html' : 'text';

    return {
        hasThinkingTags,
        contentWithoutTags: processedContent, // Повертаємо оброблений (або оригінальний) контент
        format
    };
}

/** Renders Markdown to HTML */
export async function markdownToHtml(
	app: App,
	view: any, // Pass the view instance for context
	markdown: string,
): Promise<string> {
	if (!markdown?.trim()) return "";
	const div = document.createElement("div");
	try {
		// Use the render function available since Obsidian 1.5.x
		await MarkdownRenderer.render(
			app,
			markdown,
			div,
			app.vault.getRoot()?.path ?? "", // sourcePath is required
			view, // Component context is required
		);
	} catch (error) {
		console.error("Markdown rendering error, falling back to text:", error);
		div.textContent = markdown; // Fallback to plain text on error
	}
	return div.innerHTML;
}

/** Processes content with <think> tags into HTML */
export async function processThinkingTags(
	app: App,
	view: any,
	content: string,
): Promise<string> {
	const thinkTagRegex = /<think>([\s\S]*?)<\/think>/g;
	const parts: string[] = [];
	let lastIndex = 0;
	let match;

	while ((match = thinkTagRegex.exec(content)) !== null) {
		// Process text before the tag
		if (match.index > lastIndex) {
			const normalText = content.substring(lastIndex, match.index);
			parts.push(await markdownToHtml(app, view, normalText));
		}

		// Process the <think> block content
		const thinkContent = match[1];
		const renderedThinkContent = await markdownToHtml(app, view, thinkContent);
		const headerHtml = `<div class="${CSS_CLASS_THINKING_HEADER}" data-fold-state="folded"><div class="${CSS_CLASS_THINKING_TOGGLE}">►</div><div class="${CSS_CLASS_THINKING_TITLE}">Thinking</div></div>`;
		const contentHtml = `<div class="${CSS_CLASS_THINKING_CONTENT}" style="display: none;">${renderedThinkContent}</div>`;
		parts.push(`<div class="${CSS_CLASS_THINKING_BLOCK}">${headerHtml}${contentHtml}</div>`);

		lastIndex = thinkTagRegex.lastIndex;
	}

	// Process any remaining text after the last tag
	if (lastIndex < content.length) {
		const remainingText = content.substring(lastIndex);
		parts.push(await markdownToHtml(app, view, remainingText));
	}

	return parts.join("");
}

/** Adds toggle listeners to thinking blocks */
export function addThinkingToggleListeners(
	view: OllamaView, // Need view to register events
	contentEl: HTMLElement,
): void {
	const headers = contentEl.querySelectorAll<HTMLElement>(`.${CSS_CLASS_THINKING_HEADER}`);
	headers.forEach(header => {
		// Check if listener already attached (simple guard)
		if ((header as any)._listenerAttached) return;

		view.registerDomEvent(header, "click", () => {
			const content = header.nextElementSibling as HTMLElement;
			const toggle = header.querySelector<HTMLElement>(`.${CSS_CLASS_THINKING_TOGGLE}`);
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
		(header as any)._listenerAttached = true; // Mark as attached
	});
}

/** Adds copy buttons and language badges to code blocks */
export function addCodeBlockEnhancements(
	view: OllamaView, // Need view to register events
	contentEl: HTMLElement,
): void {
	contentEl.querySelectorAll("pre").forEach(pre => {
		// Prevent adding enhancements multiple times
		if (pre.querySelector(`.${CSS_CLASS_CODE_BLOCK_COPY_BUTTON}`)) return;
		if (pre.classList.contains("enhanced")) return; // Add marker class

		const code = pre.querySelector("code");
		if (!code) return;

		const codeText = code.textContent || "";
		pre.classList.add("enhanced"); // Mark as enhanced

		// Add language identifier badge
		const langClass = Array.from(code.classList).find(cls => cls.startsWith("language-"));
		if (langClass) {
			const lang = langClass.replace("language-", "");
			if (lang && !pre.querySelector(`.${CSS_CLASS_CODE_BLOCK_LANGUAGE}`)) {
				pre.createEl("span", {
					cls: CSS_CLASS_CODE_BLOCK_LANGUAGE,
					text: lang,
				});
			}
		}

		// Add copy button
		const copyBtn = pre.createEl("button", {
			cls: CSS_CLASS_CODE_BLOCK_COPY_BUTTON,
		});
		setIcon(copyBtn, "copy");
		copyBtn.setAttribute("title", "Copy Code");
		copyBtn.setAttribute("aria-label", "Copy code block");

		view.registerDomEvent(copyBtn, "click", e => {
			e.stopPropagation();
			navigator.clipboard
				.writeText(codeText)
				.then(() => {
					setIcon(copyBtn, "check");
					copyBtn.setAttribute("title", "Copied!");
					setTimeout(() => {
						setIcon(copyBtn, "copy");
						copyBtn.setAttribute("title", "Copy Code");
					}, 1500);
				})
				.catch(err => {
					console.error("Code block copy failed:", err);
					new Notice("Failed to copy code.");
				});
		});
	});
}



/** Renders assistant message content (handling Markdown, thinking tags, etc.) */
export async function renderAssistantContent(
	app: App,
	view: OllamaView, // Pass view for context/listeners
	plugin: OllamaPlugin, // Pass plugin for logging
	containerEl: HTMLElement,
	content: string,
): Promise<void> {
	try {
		const decodedContent = decodeHtmlEntities(content);
		const thinkingInfo = detectThinkingTags(decodedContent);

		containerEl.empty(); // Clear previous content

		if (thinkingInfo.hasThinkingTags) {
			const processedHtml = await processThinkingTags(app, view, decodedContent);
			containerEl.innerHTML = processedHtml;
			fixBrokenTwemojiImages(containerEl);
			addThinkingToggleListeners(view, containerEl);
			addCodeBlockEnhancements(view, containerEl);
		} else {
			// Use markdownToHtml which handles MarkdownRenderer.render
			const htmlContent = await markdownToHtml(app, view, decodedContent);
			containerEl.innerHTML = htmlContent;
			fixBrokenTwemojiImages(containerEl);
			addCodeBlockEnhancements(view, containerEl);
		}
	} catch (error) {
		plugin.logger.error(
			"[MessageRendererUtils] Error rendering assistant content:",
			error,
			"Content:",
			content.substring(0, 500),
		);
		// Fallback: display raw decoded content
		containerEl.textContent = decodeHtmlEntities(content);
		fixBrokenTwemojiImages(containerEl); // Still try to fix emojis
	}
}

export function RendererUtils(app: App, plugin: OllamaPlugin, messageGroup: HTMLElement, arg3: boolean) {
  throw new Error("Function not implemented.");
}

export function renderAvatar(
	app: App,
	plugin: OllamaPlugin, // Need plugin for settings
	groupEl: HTMLElement,
	isUser: boolean
  ): void {
	const settings = plugin.settings; // Get settings from plugin
	const avatarType = isUser ? settings.userAvatarType : settings.aiAvatarType;
	const avatarContent = isUser ? settings.userAvatarContent : settings.aiAvatarContent;
	const avatarClass = isUser ? CSS_CLASS_AVATAR_USER : CSS_CLASS_AVATAR_AI;
  
	const avatarEl = groupEl.createDiv({ cls: [CSS_CLASS_AVATAR, avatarClass] });
	avatarEl.empty();
  
	try {
	  if (avatarType === "image" && avatarContent) {
		const imagePath = normalizePath(avatarContent); // Use imported normalizePath
		// -------------------------
		// const imageFile = app.vault.getAbstractFileByPath(imagePath); // Returns TAbstractFile | null
		// const imagePath = app.vault.adapter.normalizePath(avatarContent);
		const imageFile = app.vault.getAbstractFileByPath(imagePath);
  
		// Use instanceof check consistent with Obsidian API (might need TFile type import)
		if (imageFile instanceof TFile) {
		  const imageUrl = app.vault.getResourcePath(imageFile);
		  avatarEl.createEl("img", {
			attr: { src: imageUrl, alt: isUser ? "User Avatar" : "AI Avatar" },
			cls: "ollama-avatar-image",
		  });
		  avatarEl.title = `Avatar from: ${imagePath}`;
		} else {
		   throw new Error("Invalid image path or not a file.");
		}
	  } else if (avatarType === "icon" && avatarContent) {
		setIcon(avatarEl, avatarContent);
	  } else {
		// Initials or fallback
		avatarEl.textContent = avatarContent?.substring(0, 2) || (isUser ? "U" : "AI");
	  }
	} catch (e) {
	  plugin.logger.warn(`Failed to render avatar (type: ${avatarType}, content: ${avatarContent}):`, e);
	  avatarEl.textContent = isUser ? "U" : "AI"; // Fallback
	  avatarEl.title = "Failed to load avatar";
	}


	
  }

  export function enhanceCodeBlocks(contentEl: HTMLElement, view: OllamaView): void {
    // Додамо перевірку на view та view.plugin
    if (!view || !view.plugin) {
        console.error("enhanceCodeBlocks: Missing view or plugin context!");
        return;
    }
    view.plugin.logger.debug("[enhanceCodeBlocks] Enhancing code blocks..."); // ЛОГ ВХОДУ
    try {
        const codeBlocks = contentEl.querySelectorAll<HTMLElement>("pre > code");
        codeBlocks.forEach((codeElement) => {
            const preElement = codeElement.parentElement as HTMLPreElement;
            if (!preElement) return;

             // Уникаємо повторного додавання кнопки
             if (preElement.querySelector(`.${CSS_CLASSES.CODE_BLOCK_COPY_BUTTON}`)) { // Перевірте ім'я константи
                return;
             }

            // --- Додавання кнопки копіювання ---
            const copyButton = preElement.createEl("button", {
                 cls: `${CSS_CLASSES.CODE_BLOCK_COPY_BUTTON} clickable-icon`, // Перевірте імена констант
                 attr: { "aria-label": "Copy code", title: "Copy code" },
             });
            setIcon(copyButton, "copy");

            // Додаємо обробник через view.registerDomEvent для коректного очищення
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

            // --- Додавання назви мови ---
            const language = codeElement.className.replace("language-", "");
            if (language && !preElement.querySelector(`.${CSS_CLASSES.CODE_BLOCK_LANGUAGE}`)) { // Перевірте ім'я константи
                preElement.createDiv({
                    cls: CSS_CLASSES.CODE_BLOCK_LANGUAGE, // Перевірте ім'я константи
                    text: language,
                });
            }

             // Стилізація батьківського pre елемента для позиціонування
             preElement.style.position = "relative"; // Потрібно для абсолютно позиціонованих дочірніх елементів
        });
        view.plugin.logger.debug("[enhanceCodeBlocks] Finished enhancing code blocks."); // ЛОГ ВИХОДУ
    } catch (error) {
         // Логуємо помилку, але не зупиняємо решту рендерингу
         view.plugin.logger.error("[enhanceCodeBlocks] Error processing code blocks:", error);
    }
}

// Додайте аналогічне логування та try/catch до fixBrokenTwemojiImages, якщо вона використовується
export function fixBrokenTwemojiImages(contentEl: HTMLElement): void {
     console.debug("[fixBrokenTwemojiImages] Checking for broken Twemoji...");
     try {
        contentEl.querySelectorAll('img.emoji[alt][src*="twemoji.maxcdn.com"]').forEach((img: HTMLImageElement) => {
            const alt = img.getAttribute('alt');
            if (alt && !img.getAttribute('data-fixed')) { // Перевіряємо, чи ще не виправлено
                // Простий варіант: замінити на текст
                // img.replaceWith(document.createTextNode(alt));

                // Складніший варіант: спробувати завантажити з іншого CDN (наприклад, jsdelivr)
                 const emojiHex = alt.codePointAt(0)?.toString(16);
                 if (emojiHex) {
                     img.src = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${emojiHex}.svg`;
                     img.setAttribute('data-fixed', 'true'); // Позначаємо як виправлене
                     img.onerror = () => { // Якщо і це не спрацювало, замінюємо на текст
                          console.warn(`Failed to load emoji from jsdelivr: ${alt}`);
                         if (img.parentNode) { // Перевірка перед заміною
                             img.replaceWith(document.createTextNode(alt));
                         }
                     };
                 } else if (img.parentNode) {
                    // Якщо не вдалося отримати hex, просто замінюємо на текст
                    img.replaceWith(document.createTextNode(alt));
                 }
            }
        });
        console.debug("[fixBrokenTwemojiImages] Finished checking Twemoji.");
     } catch (error) {
          console.error("[fixBrokenTwemojiImages] Error fixing Twemoji:", error);
     }
}