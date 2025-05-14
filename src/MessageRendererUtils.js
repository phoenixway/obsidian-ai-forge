import { __awaiter } from "tslib";
// src/MessageRendererUtils.ts
import { MarkdownRenderer, Notice, setIcon, TFile, normalizePath } from "obsidian";
import { CSS_CLASSES } from "./constants";
export function decodeHtmlEntities(text) {
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
export function detectThinkingTags(content) {
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
export function markdownToHtml(app, view, markdown) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!(markdown === null || markdown === void 0 ? void 0 : markdown.trim()))
            return "";
        const div = document.createElement("div");
        try {
            yield MarkdownRenderer.render(app, markdown, div, (_b = (_a = app.vault.getRoot()) === null || _a === void 0 ? void 0 : _a.path) !== null && _b !== void 0 ? _b : "", view);
        }
        catch (error) {
            console.error("Markdown rendering error, falling back to text:", error);
            div.textContent = markdown;
        }
        return div.innerHTML;
    });
}
export function processThinkingTags(app, view, // OllamaView
content) {
    return __awaiter(this, void 0, void 0, function* () {
        const thinkTagRegex = /<think>([\s\S]*?)<\/think>/g;
        const parts = [];
        let lastIndex = 0;
        let match;
        while ((match = thinkTagRegex.exec(content)) !== null) {
            if (match.index > lastIndex) {
                const normalText = content.substring(lastIndex, match.index);
                parts.push(yield markdownToHtml(app, view, normalText));
            }
            const thinkContent = match[1];
            const renderedThinkContent = yield markdownToHtml(app, view, thinkContent);
            // Використовуйте CSS_CLASSES для цих класів, якщо вони визначені глобально
            const headerHtml = `<div class="${CSS_CLASSES.THINKING_HEADER || "thinking-header"}" data-fold-state="folded"><div class="${CSS_CLASSES.THINKING_TOGGLE || "thinking-toggle"}">►</div><div class="${CSS_CLASSES.THINKING_TITLE || "thinking-title"}">Thinking</div></div>`;
            const contentHtml = `<div class="${CSS_CLASSES.THINKING_CONTENT || "thinking-content"}" style="display: none;">${renderedThinkContent}</div>`;
            parts.push(`<div class="${CSS_CLASSES.THINKING_BLOCK || "thinking-block"}">${headerHtml}${contentHtml}</div>`);
            lastIndex = thinkTagRegex.lastIndex;
        }
        if (lastIndex < content.length) {
            const remainingText = content.substring(lastIndex);
            parts.push(yield markdownToHtml(app, view, remainingText));
        }
        return parts.join("");
    });
}
export function addThinkingToggleListeners(view, contentEl) {
    const headers = contentEl.querySelectorAll(`.${CSS_CLASSES.THINKING_HEADER || "thinking-header"}`);
    headers.forEach(header => {
        if (header._listenerAttached)
            return;
        view.registerDomEvent(header, "click", () => {
            const content = header.nextElementSibling;
            const toggle = header.querySelector(`.${CSS_CLASSES.THINKING_TOGGLE || "thinking-toggle"}`);
            if (!content || !toggle)
                return;
            const isFolded = header.getAttribute("data-fold-state") === "folded";
            if (isFolded) {
                content.style.display = "block";
                toggle.textContent = "▼";
                header.setAttribute("data-fold-state", "expanded");
            }
            else {
                content.style.display = "none";
                toggle.textContent = "►";
                header.setAttribute("data-fold-state", "folded");
            }
        });
        header._listenerAttached = true;
    });
}
export function enhanceCodeBlocks(contentEl, view) {
    if (!view || !view.plugin) {
        view.plugin.logger.error("[enhanceCodeBlocks] Missing view or plugin context!");
        return;
    }
    try {
        const codeBlocks = contentEl.querySelectorAll("pre > code");
        codeBlocks.forEach((codeElement) => {
            var _a;
            const preElement = codeElement.parentElement;
            if (!preElement)
                return;
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
            const language = (_a = Array.from(codeElement.classList).find(cls => cls.startsWith("language-"))) === null || _a === void 0 ? void 0 : _a.replace("language-", "");
            if (language && !preElement.querySelector(`.${CSS_CLASSES.CODE_BLOCK_LANGUAGE}`)) {
                preElement.createDiv({
                    cls: CSS_CLASSES.CODE_BLOCK_LANGUAGE,
                    text: language,
                });
            }
            preElement.style.position = "relative";
        });
    }
    catch (error) {
        view.plugin.logger.error("[MessageRendererUtils.enhanceCodeBlocks] Error processing code blocks:", error);
    }
}
export function fixBrokenTwemojiImages(contentEl) {
    try {
        contentEl.querySelectorAll('img.emoji[alt][src*="twemoji.maxcdn.com"]').forEach((img) => {
            var _a;
            const alt = img.getAttribute('alt');
            if (alt && !img.getAttribute('data-fixed')) {
                const emojiHex = (_a = alt.codePointAt(0)) === null || _a === void 0 ? void 0 : _a.toString(16);
                if (emojiHex) {
                    img.src = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${emojiHex}.svg`;
                    img.setAttribute('data-fixed', 'true');
                    img.onerror = () => {
                        console.warn(`Failed to load emoji from jsdelivr: ${alt}`);
                        if (img.parentNode) {
                            img.replaceWith(document.createTextNode(alt));
                        }
                    };
                }
                else if (img.parentNode) {
                    img.replaceWith(document.createTextNode(alt));
                }
            }
        });
    }
    catch (error) {
        console.error("[MessageRendererUtils.fixBrokenTwemojiImages] Error fixing Twemoji:", error);
    }
}
export function renderMarkdownContent(app, view, plugin, containerEl, markdownText) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            containerEl.empty();
            const decodedContent = decodeHtmlEntities(markdownText);
            const thinkingInfo = detectThinkingTags(decodedContent);
            if (thinkingInfo.hasThinkingTags) {
                const processedHtml = yield processThinkingTags(app, view, decodedContent);
                containerEl.innerHTML = processedHtml;
                addThinkingToggleListeners(view, containerEl);
            }
            else {
                yield MarkdownRenderer.render(app, decodedContent, containerEl, (_b = (_a = plugin.app.vault.getRoot()) === null || _a === void 0 ? void 0 : _a.path) !== null && _b !== void 0 ? _b : "", view);
            }
            enhanceCodeBlocks(containerEl, view);
            if (plugin.settings.fixBrokenEmojis) {
                fixBrokenTwemojiImages(containerEl);
            }
        }
        catch (error) {
            plugin.logger.error("[MessageRendererUtils.renderMarkdownContent] Error rendering content:", error, "Content Preview:", markdownText.substring(0, 200));
            containerEl.empty();
            containerEl.setText(`[Error rendering content. Please check console.]`);
        }
    });
}
export function renderAvatar(app, plugin, groupEl, isUser, avatarRoleType // Додав 'tool-usage' як приклад
) {
    // if (avatarRoleType === 'tool' || avatarRoleType === 'tool-usage') {
    //     const existingAvatar = groupEl.querySelector<HTMLElement>(`.${CSS_CLASSES.AVATAR_CONTAINER || "avatar-container"}`);
    //     if (existingAvatar) {
    //         existingAvatar.remove();
    //     }
    //     return; // Не рендеримо аватар
    // }
    const settings = plugin.settings;
    let avatarTypeToUse;
    let avatarContentToUse;
    // specificIcon та defaultAiIcon тут можуть бути не потрібні, якщо логіка зміниться
    if (isUser) {
        avatarTypeToUse = settings.userAvatarType;
        avatarContentToUse = settings.userAvatarContent;
    }
    else {
        // Визначаємо тип і контент індивідуально для кожної ролі
        switch (avatarRoleType) {
            // case 'tool': // Це для "Tool Executed..."
            // // case 'tool-usage': // Якщо ви використовуєте окремий тип для "Using tool..."
            //     avatarTypeToUse = 'icon'; // Завжди іконка для інструментів
            //     avatarContentToUse = 'settings'; // Або 'cog' - це іконка шестерні в Lucide
            //     break;
            case 'tool':
                avatarTypeToUse = 'icon';
                avatarContentToUse = 'cog'; // Шестерня
                break;
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
    let avatarEl = groupEl.querySelector(`.${mainAvatarContainerClass.split(" ")[0]}`);
    if (!avatarEl) {
        avatarEl = groupEl.createDiv({ cls: [mainAvatarContainerClass, specificAvatarRoleClass].join(' ') });
    }
    else {
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
            }
            else {
                plugin.logger.warn(`Avatar image file not found or not a TFile: ${imagePath}. Using fallback.`);
                throw new Error("Invalid image path or not a file.");
            }
        }
        else if (avatarTypeToUse === "icon" && avatarContentToUse) {
            setIcon(avatarEl.createSpan({ cls: CSS_CLASSES.AVATAR_ICON || "avatar-icon" }), avatarContentToUse);
            avatarEl.title = `Icon: ${avatarContentToUse}`;
        }
        else { // Initials or fallback
            // ... (код для ініціалів залишається тим самим)
            let initials = avatarContentToUse === null || avatarContentToUse === void 0 ? void 0 : avatarContentToUse.substring(0, 2).toUpperCase();
            if (!initials) {
                if (isUser) {
                    initials = "U";
                }
                else {
                    initials = avatarRoleType ? avatarRoleType.substring(0, 1).toUpperCase() : "AI";
                    if (initials.length > 2)
                        initials = initials.substring(0, 2);
                    if (!initials)
                        initials = "AI";
                }
            }
            avatarEl.createDiv({ cls: CSS_CLASSES.AVATAR_INITIALS || "avatar-initials", text: initials });
            avatarEl.title = `Initials: ${initials}`;
        }
    }
    catch (e) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWVzc2FnZVJlbmRlcmVyVXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJNZXNzYWdlUmVuZGVyZXJVdGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsOEJBQThCO0FBQzlCLE9BQU8sRUFBTyxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFHeEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQVkxQyxNQUFNLFVBQVUsa0JBQWtCLENBQUMsSUFBWTtJQUMzQyxJQUFJLE9BQU8sUUFBUSxLQUFLLFdBQVcsRUFBRSxDQUFDO1FBQ2xDLE9BQU8sSUFBSTthQUNOLE9BQU8sQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDO2FBQ3RCLE9BQU8sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDO2FBQ3ZCLE9BQU8sQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUNELE1BQU0sRUFBRSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDOUMsRUFBRSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7SUFDcEIsT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDO0FBQ3BCLENBQUM7QUFFRCxNQUFNLFVBQVUsa0JBQWtCLENBQUMsT0FBZTtJQUM5QyxvRkFBb0Y7SUFDcEYsTUFBTSxhQUFhLEdBQUcsNEJBQTRCLENBQUM7SUFDbkQsSUFBSSxrQkFBa0IsR0FBRyxPQUFPLENBQUM7SUFDakMsSUFBSSxlQUFlLEdBQUcsS0FBSyxDQUFDO0lBRTVCLG1HQUFtRztJQUNuRyxJQUFJLGVBQWUsQ0FBQztJQUNwQixHQUFHLENBQUM7UUFDQSxlQUFlLEdBQUcsa0JBQWtCLENBQUM7UUFD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QUFFLEdBQUcsRUFBRSxXQUFXLENBQUMsV0FBVyxJQUFJLGFBQWEsRUFBRSxDQUFDLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUNsRyxRQUFRLENBQUMsS0FBSyxHQUFHLDBCQUEwQixnQkFBZ0IsR0FBRyxDQUFDO0lBQ2pFLENBQUM7QUFDTCxDQUFDO0FBRUQsNkNBQTZDO0FBQzdDLDRHQUE0RztBQUM1RyxrREFBa0Q7QUFDbEQsSUFBSSIsInNvdXJjZXNDb250ZW50IjpbIi8vIHNyYy9NZXNzYWdlUmVuZGVyZXJVdGlscy50c1xuaW1wb3J0IHsgQXBwLCBNYXJrZG93blJlbmRlcmVyLCBOb3RpY2UsIHNldEljb24sIFRGaWxlLCBub3JtYWxpemVQYXRoIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBPbGxhbWFWaWV3IH0gZnJvbSBcIi4vT2xsYW1hVmlld1wiOyBcbmltcG9ydCBPbGxhbWFQbHVnaW4gZnJvbSBcIi4vbWFpblwiOyBcbmltcG9ydCB7IENTU19DTEFTU0VTIH0gZnJvbSBcIi4vY29uc3RhbnRzXCI7IFxuaW1wb3J0IHsgQXZhdGFyVHlwZSB9IGZyb20gXCIuL3NldHRpbmdzXCI7IFxuXG5cbi8vIENPREVfQkxPQ0tfQ09QWV9CVVRUT04g0YLQsCBDT0RFX0JMT0NLX0xBTkdVQUdFINGC0LXQv9C10YAg0L7Rh9GW0LrRg9GO0YLRjNGB0Y8g0LcgQ1NTX0NMQVNTRVNcblxuZXhwb3J0IGludGVyZmFjZSBUaGlua0RldGVjdGlvblJlc3VsdCB7XG4gICAgaGFzVGhpbmtpbmdUYWdzOiBib29sZWFuO1xuICAgIGNvbnRlbnRXaXRob3V0VGFnczogc3RyaW5nOyBcbiAgICBmb3JtYXQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUh0bWxFbnRpdGllcyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGlmICh0eXBlb2YgZG9jdW1lbnQgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgcmV0dXJuIHRleHRcbiAgICAgICAgICAgIC5yZXBsYWNlKC8mYW1wOy9nLCBcIiZcIilcbiAgICAgICAgICAgIC5yZXBsYWNlKC8mbHQ7L2csIFwiPFwiKVxuICAgICAgICAgICAgLnJlcGxhY2UoLyZndDsvZywgXCI+XCIpXG4gICAgICAgICAgICAucmVwbGFjZSgvJnF1b3Q7L2csICdcIicpXG4gICAgICAgICAgICAucmVwbGFjZSgvJiMzOTsvZywgXCInXCIpO1xuICAgIH1cbiAgICBjb25zdCB0YSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0ZXh0YXJlYVwiKTtcbiAgICB0YS5pbm5lckhUTUwgPSB0ZXh0O1xuICAgIHJldHVybiB0YS52YWx1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdFRoaW5raW5nVGFncyhjb250ZW50OiBzdHJpbmcpOiBUaGlua0RldGVjdGlvblJlc3VsdCB7XG4gICAgLy8g0KbQtdC5INGA0LXQs9GD0LvRj9GA0L3QuNC5INCy0LjRgNCw0Lcg0LzQsNGUINC30L3QsNGF0L7QtNC40YLQuCDQvdCw0LnQutC+0YDQvtGC0YjQtSDRgdC/0ZbQstC/0LDQtNGW0L3QvdGPINC80ZbQtiA8dGhpbms+INGC0LAgPC90aGluaz5cbiAgICBjb25zdCB0aGlua1RhZ1JlZ2V4ID0gLzx0aGluaz5bXFxzXFxTXSo/PFxcL3RoaW5rPi9naTsgXG4gICAgbGV0IGNvbnRlbnRXaXRob3V0VGFncyA9IGNvbnRlbnQ7XG4gICAgbGV0IGhhc1RoaW5raW5nVGFncyA9IGZhbHNlO1xuXG4gICAgLy8g0JLQuNC00LDQu9GP0ZTQvNC+INCy0YHRliDQstGF0L7QtNC20LXQvdC90Y8g0ZbRgtC10YDQsNGC0LjQstC90L4sINGJ0L7QsSDQstC/0L7RgNCw0YLQuNGB0Y8g0Lcg0L/QvtGC0LXQvdGG0ZbQudC90L7RjiDQstC60LvQsNC00LXQvdGW0YHRgtGOINCw0LHQviDQv9GA0L7QsdC70LXQvNCw0LzQuCByZWdleFxuICAgIGxldCBwcmV2aW91c0NvbnRlbnQ7XG4gICAgZG8ge1xuICAgICAgICBwcmV2aW91c0NvbnRlbnQgPSBjb250ZW50V2l0aG91dFRhZ3M7XG4gICAgICAgIGNvbnRlbnRXaXRob3V0VGFncyA9IGNvbnRlbnRXaXRob3V0VGFncy5yZXBsYWNlKHRoaW5rVGFnUmVnZXgsICcnKTtcbiAgICAgICAgaWYgKHByZXZpb3VzQ29udGVudCAhPT0gY29udGVudFdpdGhvdXRUYWdzKSB7XG4gICAgICAgICAgICBoYXNUaGlua2luZ1RhZ3MgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfSB3aGlsZSAocHJldmlvdXNDb250ZW50ICE9PSBjb250ZW50V2l0aG91dFRhZ3MgJiYgY29udGVudFdpdGhvdXRUYWdzLmluY2x1ZGVzKFwiPHRoaW5rPlwiKSk7IC8vINCf0L7QstGC0L7RgNGO0ZTQvNC+LCDQtNC+0LrQuCDRlCDQt9C80ZbQvdC4INGC0LAg0YLQtdCz0LhcblxuICAgIGNvbnRlbnRXaXRob3V0VGFncyA9IGNvbnRlbnRXaXRob3V0VGFncy50cmltKCk7XG4gICAgY29uc3QgZm9ybWF0ID0gLzxbYS16XVtcXHNcXFNdKj4vaS50ZXN0KGNvbnRlbnRXaXRob3V0VGFncykgPyAnaHRtbCcgOiAndGV4dCc7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBoYXNUaGlua2luZ1RhZ3MsXG4gICAgICAgIGNvbnRlbnRXaXRob3V0VGFnczogY29udGVudFdpdGhvdXRUYWdzLFxuICAgICAgICBmb3JtYXRcbiAgICB9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWFya2Rvd25Ub0h0bWwoXG4gICAgYXBwOiBBcHAsXG4gICAgdmlldzogYW55LCBcbiAgICBtYXJrZG93bjogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBpZiAoIW1hcmtkb3duPy50cmltKCkpIHJldHVybiBcIlwiO1xuICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgTWFya2Rvd25SZW5kZXJlci5yZW5kZXIoXG4gICAgICAgICAgICBhcHAsXG4gICAgICAgICAgICBtYXJrZG93bixcbiAgICAgICAgICAgIGRpdixcbiAgICAgICAgICAgIGFwcC52YXVsdC5nZXRSb290KCk/LnBhdGggPz8gXCJcIiwgXG4gICAgICAgICAgICB2aWV3LCBcbiAgICAgICAgKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiTWFya2Rvd24gcmVuZGVyaW5nIGVycm9yLCBmYWxsaW5nIGJhY2sgdG8gdGV4dDpcIiwgZXJyb3IpO1xuICAgICAgICBkaXYudGV4dENvbnRlbnQgPSBtYXJrZG93bjsgXG4gICAgfVxuICAgIHJldHVybiBkaXYuaW5uZXJIVE1MO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1RoaW5raW5nVGFncyhcbiAgICBhcHA6IEFwcCxcbiAgICB2aWV3OiBhbnksIC8vIE9sbGFtYVZpZXdcbiAgICBjb250ZW50OiBzdHJpbmcsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IHRoaW5rVGFnUmVnZXggPSAvPHRoaW5rPihbXFxzXFxTXSo/KTxcXC90aGluaz4vZztcbiAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBsZXQgbGFzdEluZGV4ID0gMDtcbiAgICBsZXQgbWF0Y2g7XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gdGhpbmtUYWdSZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgICBpZiAobWF0Y2guaW5kZXggPiBsYXN0SW5kZXgpIHtcbiAgICAgICAgICAgIGNvbnN0IG5vcm1hbFRleHQgPSBjb250ZW50LnN1YnN0cmluZyhsYXN0SW5kZXgsIG1hdGNoLmluZGV4KTtcbiAgICAgICAgICAgIHBhcnRzLnB1c2goYXdhaXQgbWFya2Rvd25Ub0h0bWwoYXBwLCB2aWV3LCBub3JtYWxUZXh0KSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0aGlua0NvbnRlbnQgPSBtYXRjaFsxXTtcbiAgICAgICAgY29uc3QgcmVuZGVyZWRUaGlua0NvbnRlbnQgPSBhd2FpdCBtYXJrZG93blRvSHRtbChhcHAsIHZpZXcsIHRoaW5rQ29udGVudCk7XG4gICAgICAgIC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPQudGC0LUgQ1NTX0NMQVNTRVMg0LTQu9GPINGG0LjRhSDQutC70LDRgdGW0LIsINGP0LrRidC+INCy0L7QvdC4INCy0LjQt9C90LDRh9C10L3RliDQs9C70L7QsdCw0LvRjNC90L5cbiAgICAgICAgY29uc3QgaGVhZGVySHRtbCA9IGA8ZGl2IGNsYXNzPVwiJHtDU1NfQ0xBU1NFUy5USElOS0lOR19IRUFERVIgfHwgXCJ0aGlua2luZy1oZWFkZXJcIn1cIiBkYXRhLWZvbGQtc3RhdGU9XCJmb2xkZWRcIj48ZGl2IGNsYXNzPVwiJHtDU1NfQ0xBU1NFUy5USElOS0lOR19UT0dHTEUgfHwgXCJ0aGlua2luZy10b2dnbGVcIn1cIj7ilro8L2Rpdj48ZGl2IGNsYXNzPVwiJHtDU1NfQ0xBU1NFUy5USElOS0lOR19USVRMRSB8fCBcInRoaW5raW5nLXRpdGxlXCJ9XCI+VGhpbmtpbmc8L2Rpdj48L2Rpdj5gO1xuICAgICAgICBjb25zdCBjb250ZW50SHRtbCA9IGA8ZGl2IGNsYXNzPVwiJHtDU1NfQ0xBU1NFUy5USElOS0lOR19DT05URU5UIHx8IFwidGhpbmtpbmctY29udGVudFwifVwiIHN0eWxlPVwiZGlzcGxheTogbm9uZTtcIj4ke3JlbmRlcmVkVGhpbmtDb250ZW50fTwvZGl2PmA7XG4gICAgICAgIHBhcnRzLnB1c2goYDxkaXYgY2xhc3M9XCIke0NTU19DTEFTU0VTLlRISU5LSU5HX0JMT0NLIHx8IFwidGhpbmtpbmctYmxvY2tcIn1cIj4ke2hlYWRlckh0bWx9JHtjb250ZW50SHRtbH08L2Rpdj5gKTtcblxuICAgICAgICBsYXN0SW5kZXggPSB0aGlua1RhZ1JlZ2V4Lmxhc3RJbmRleDtcbiAgICB9XG5cbiAgICBpZiAobGFzdEluZGV4IDwgY29udGVudC5sZW5ndGgpIHtcbiAgICAgICAgY29uc3QgcmVtYWluaW5nVGV4dCA9IGNvbnRlbnQuc3Vic3RyaW5nKGxhc3RJbmRleCk7XG4gICAgICAgIHBhcnRzLnB1c2goYXdhaXQgbWFya2Rvd25Ub0h0bWwoYXBwLCB2aWV3LCByZW1haW5pbmdUZXh0KSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhcnRzLmpvaW4oXCJcIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRUaGlua2luZ1RvZ2dsZUxpc3RlbmVycyhcbiAgICB2aWV3OiBPbGxhbWFWaWV3LCBcbiAgICBjb250ZW50RWw6IEhUTUxFbGVtZW50LFxuKTogdm9pZCB7XG4gICAgY29uc3QgaGVhZGVycyA9IGNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihgLiR7Q1NTX0NMQVNTRVMuVEhJTktJTkdfSEVBREVSIHx8IFwidGhpbmtpbmctaGVhZGVyXCJ9YCk7XG4gICAgaGVhZGVycy5mb3JFYWNoKGhlYWRlciA9PiB7XG4gICAgICAgIGlmICgoaGVhZGVyIGFzIGFueSkuX2xpc3RlbmVyQXR0YWNoZWQpIHJldHVybjtcblxuICAgICAgICB2aWV3LnJlZ2lzdGVyRG9tRXZlbnQoaGVhZGVyLCBcImNsaWNrXCIsICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBoZWFkZXIubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgdG9nZ2xlID0gaGVhZGVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KGAuJHtDU1NfQ0xBU1NFUy5USElOS0lOR19UT0dHTEUgfHwgXCJ0aGlua2luZy10b2dnbGVcIn1gKTtcbiAgICAgICAgICAgIGlmICghY29udGVudCB8fCAhdG9nZ2xlKSByZXR1cm47XG5cbiAgICAgICAgICAgIGNvbnN0IGlzRm9sZGVkID0gaGVhZGVyLmdldEF0dHJpYnV0ZShcImRhdGEtZm9sZC1zdGF0ZVwiKSA9PT0gXCJmb2xkZWRcIjtcbiAgICAgICAgICAgIGlmIChpc0ZvbGRlZCkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgICAgICAgICAgICB0b2dnbGUudGV4dENvbnRlbnQgPSBcIuKWvFwiO1xuICAgICAgICAgICAgICAgIGhlYWRlci5zZXRBdHRyaWJ1dGUoXCJkYXRhLWZvbGQtc3RhdGVcIiwgXCJleHBhbmRlZFwiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29udGVudC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgICAgICAgICAgdG9nZ2xlLnRleHRDb250ZW50ID0gXCLilrpcIjtcbiAgICAgICAgICAgICAgICBoZWFkZXIuc2V0QXR0cmlidXRlKFwiZGF0YS1mb2xkLXN0YXRlXCIsIFwiZm9sZGVkXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgKGhlYWRlciBhcyBhbnkpLl9saXN0ZW5lckF0dGFjaGVkID0gdHJ1ZTsgXG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmhhbmNlQ29kZUJsb2Nrcyhjb250ZW50RWw6IEhUTUxFbGVtZW50LCB2aWV3OiBPbGxhbWFWaWV3KTogdm9pZCB7XG4gICAgaWYgKCF2aWV3IHx8ICF2aWV3LnBsdWdpbikge1xuICAgICAgICB2aWV3LnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbZW5oYW5jZUNvZGVCbG9ja3NdIE1pc3NpbmcgdmlldyBvciBwbHVnaW4gY29udGV4dCFcIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29kZUJsb2NrcyA9IGNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcInByZSA+IGNvZGVcIik7XG4gICAgICAgIGNvZGVCbG9ja3MuZm9yRWFjaCgoY29kZUVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHByZUVsZW1lbnQgPSBjb2RlRWxlbWVudC5wYXJlbnRFbGVtZW50IGFzIEhUTUxQcmVFbGVtZW50O1xuICAgICAgICAgICAgaWYgKCFwcmVFbGVtZW50KSByZXR1cm47XG5cbiAgICAgICAgICAgICBpZiAocHJlRWxlbWVudC5xdWVyeVNlbGVjdG9yKGAuJHtDU1NfQ0xBU1NFUy5DT0RFX0JMT0NLX0NPUFlfQlVUVE9OfWApKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICBwcmVFbGVtZW50LmNsYXNzTGlzdC5hZGQoXCJlbmhhbmNlZFwiKTsgLy8g0JTQvtC00LDQudGC0LUg0LzQsNGA0LrQtdGA0L3QuNC5INC60LvQsNGBLCDRidC+0LEg0YPQvdC40LrQvdGD0YLQuCDQv9C+0LLRgtC+0YDQvdC+0Zcg0L7QsdGA0L7QsdC60LhcblxuICAgICAgICAgICAgY29uc3QgY29weUJ1dHRvbiA9IHByZUVsZW1lbnQuY3JlYXRlRWwoXCJidXR0b25cIiwge1xuICAgICAgICAgICAgICAgICBjbHM6IGAke0NTU19DTEFTU0VTLkNPREVfQkxPQ0tfQ09QWV9CVVRUT059IGNsaWNrYWJsZS1pY29uYCxcbiAgICAgICAgICAgICAgICAgYXR0cjogeyBcImFyaWEtbGFiZWxcIjogXCJDb3B5IGNvZGVcIiwgdGl0bGU6IFwiQ29weSBjb2RlXCIgfSxcbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldEljb24oY29weUJ1dHRvbiwgXCJjb3B5XCIpO1xuXG4gICAgICAgICAgICB2aWV3LnJlZ2lzdGVyRG9tRXZlbnQoY29weUJ1dHRvbiwgXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgIGNvbnN0IGNvZGVUb0NvcHkgPSBjb2RlRWxlbWVudC50ZXh0Q29udGVudCB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChjb2RlVG9Db3B5KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgIHNldEljb24oY29weUJ1dHRvbiwgXCJjaGVja1wiKTtcbiAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gc2V0SWNvbihjb3B5QnV0dG9uLCBcImNvcHlcIiksIDIwMDApO1xuICAgICAgICAgICAgICAgICB9KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgdmlldy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiRmFpbGVkIHRvIGNvcHkgY29kZSBibG9jazpcIiwgZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJGYWlsZWQgdG8gY29weSBjb2RlIHRvIGNsaXBib2FyZC5cIik7XG4gICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBsYW5ndWFnZSA9IEFycmF5LmZyb20oY29kZUVsZW1lbnQuY2xhc3NMaXN0KS5maW5kKGNscyA9PiBjbHMuc3RhcnRzV2l0aChcImxhbmd1YWdlLVwiKSk/LnJlcGxhY2UoXCJsYW5ndWFnZS1cIiwgXCJcIik7XG4gICAgICAgICAgICBpZiAobGFuZ3VhZ2UgJiYgIXByZUVsZW1lbnQucXVlcnlTZWxlY3RvcihgLiR7Q1NTX0NMQVNTRVMuQ09ERV9CTE9DS19MQU5HVUFHRX1gKSkgeyBcbiAgICAgICAgICAgICAgICBwcmVFbGVtZW50LmNyZWF0ZURpdih7XG4gICAgICAgICAgICAgICAgICAgIGNsczogQ1NTX0NMQVNTRVMuQ09ERV9CTE9DS19MQU5HVUFHRSxcbiAgICAgICAgICAgICAgICAgICAgdGV4dDogbGFuZ3VhZ2UsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAgcHJlRWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9IFwicmVsYXRpdmVcIjsgXG4gICAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICB2aWV3LnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbTWVzc2FnZVJlbmRlcmVyVXRpbHMuZW5oYW5jZUNvZGVCbG9ja3NdIEVycm9yIHByb2Nlc3NpbmcgY29kZSBibG9ja3M6XCIsIGVycm9yKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaXhCcm9rZW5Ud2Vtb2ppSW1hZ2VzKGNvbnRlbnRFbDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgICAgdHJ5IHtcbiAgICAgICAgY29udGVudEVsLnF1ZXJ5U2VsZWN0b3JBbGwoJ2ltZy5lbW9qaVthbHRdW3NyYyo9XCJ0d2Vtb2ppLm1heGNkbi5jb21cIl0nKS5mb3JFYWNoKChpbWc6IEhUTUxJbWFnZUVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGFsdCA9IGltZy5nZXRBdHRyaWJ1dGUoJ2FsdCcpO1xuICAgICAgICAgICAgaWYgKGFsdCAmJiAhaW1nLmdldEF0dHJpYnV0ZSgnZGF0YS1maXhlZCcpKSB7IFxuICAgICAgICAgICAgICAgICBjb25zdCBlbW9qaUhleCA9IGFsdC5jb2RlUG9pbnRBdCgwKT8udG9TdHJpbmcoMTYpO1xuICAgICAgICAgICAgICAgICBpZiAoZW1vamlIZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgIGltZy5zcmMgPSBgaHR0cHM6Ly9jZG4uanNkZWxpdnIubmV0L2doL2pkZWNrZWQvdHdlbW9qaUBsYXRlc3QvYXNzZXRzL3N2Zy8ke2Vtb2ppSGV4fS5zdmdgO1xuICAgICAgICAgICAgICAgICAgICAgaW1nLnNldEF0dHJpYnV0ZSgnZGF0YS1maXhlZCcsICd0cnVlJyk7IFxuICAgICAgICAgICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7IFxuICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIGVtb2ppIGZyb20ganNkZWxpdnI6ICR7YWx0fWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbWcucGFyZW50Tm9kZSkgeyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW1nLnJlcGxhY2VXaXRoKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGFsdCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaW1nLnBhcmVudE5vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgaW1nLnJlcGxhY2VXaXRoKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGFsdCkpO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbTWVzc2FnZVJlbmRlcmVyVXRpbHMuZml4QnJva2VuVHdlbW9qaUltYWdlc10gRXJyb3IgZml4aW5nIFR3ZW1vamk6XCIsIGVycm9yKTtcbiAgICAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVuZGVyTWFya2Rvd25Db250ZW50KCBcbiAgICBhcHA6IEFwcCxcbiAgICB2aWV3OiBPbGxhbWFWaWV3LFxuICAgIHBsdWdpbjogT2xsYW1hUGx1Z2luLFxuICAgIGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCxcbiAgICBtYXJrZG93blRleHQ6IHN0cmluZyxcbik6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XG4gICAgICAgIGNvbnN0IGRlY29kZWRDb250ZW50ID0gZGVjb2RlSHRtbEVudGl0aWVzKG1hcmtkb3duVGV4dCk7XG4gICAgICAgIGNvbnN0IHRoaW5raW5nSW5mbyA9IGRldGVjdFRoaW5raW5nVGFncyhkZWNvZGVkQ29udGVudCk7XG5cbiAgICAgICAgaWYgKHRoaW5raW5nSW5mby5oYXNUaGlua2luZ1RhZ3MpIHtcbiAgICAgICAgICAgIGNvbnN0IHByb2Nlc3NlZEh0bWwgPSBhd2FpdCBwcm9jZXNzVGhpbmtpbmdUYWdzKGFwcCwgdmlldywgZGVjb2RlZENvbnRlbnQpO1xuICAgICAgICAgICAgY29udGFpbmVyRWwuaW5uZXJIVE1MID0gcHJvY2Vzc2VkSHRtbDtcbiAgICAgICAgICAgIGFkZFRoaW5raW5nVG9nZ2xlTGlzdGVuZXJzKHZpZXcsIGNvbnRhaW5lckVsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGF3YWl0IE1hcmtkb3duUmVuZGVyZXIucmVuZGVyKGFwcCwgZGVjb2RlZENvbnRlbnQsIGNvbnRhaW5lckVsLCBwbHVnaW4uYXBwLnZhdWx0LmdldFJvb3QoKT8ucGF0aCA/PyBcIlwiLCB2aWV3KTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZW5oYW5jZUNvZGVCbG9ja3MoY29udGFpbmVyRWwsIHZpZXcpO1xuICAgICAgICBpZiAocGx1Z2luLnNldHRpbmdzLmZpeEJyb2tlbkVtb2ppcykge1xuICAgICAgICAgICAgZml4QnJva2VuVHdlbW9qaUltYWdlcyhjb250YWluZXJFbCk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBwbHVnaW4ubG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgXCJbTWVzc2FnZVJlbmRlcmVyVXRpbHMucmVuZGVyTWFya2Rvd25Db250ZW50XSBFcnJvciByZW5kZXJpbmcgY29udGVudDpcIixcbiAgICAgICAgICAgIGVycm9yLCBcIkNvbnRlbnQgUHJldmlldzpcIiwgbWFya2Rvd25UZXh0LnN1YnN0cmluZygwLCAyMDApLFxuICAgICAgICApO1xuICAgICAgICBjb250YWluZXJFbC5lbXB0eSgpOyBcbiAgICAgICAgY29udGFpbmVyRWwuc2V0VGV4dChgW0Vycm9yIHJlbmRlcmluZyBjb250ZW50LiBQbGVhc2UgY2hlY2sgY29uc29sZS5dYCk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQXZhdGFyKFxuICAgIGFwcDogQXBwLFxuICAgIHBsdWdpbjogT2xsYW1hUGx1Z2luLFxuICAgIGdyb3VwRWw6IEhUTUxFbGVtZW50LFxuICAgIGlzVXNlcjogYm9vbGVhbixcbiAgICBhdmF0YXJSb2xlVHlwZT86ICd1c2VyJyB8ICdhc3Npc3RhbnQnIHwgJ3N5c3RlbScgfCAndG9vbCcgfCAnZXJyb3InIHwgJ3Rvb2wtdXNhZ2UnIHwgc3RyaW5nIC8vINCU0L7QtNCw0LIgJ3Rvb2wtdXNhZ2UnINGP0Log0L/RgNC40LrQu9Cw0LRcbik6IHZvaWQge1xuIFxuLy8gaWYgKGF2YXRhclJvbGVUeXBlID09PSAndG9vbCcgfHwgYXZhdGFyUm9sZVR5cGUgPT09ICd0b29sLXVzYWdlJykge1xuLy8gICAgIGNvbnN0IGV4aXN0aW5nQXZhdGFyID0gZ3JvdXBFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihgLiR7Q1NTX0NMQVNTRVMuQVZBVEFSX0NPTlRBSU5FUiB8fCBcImF2YXRhci1jb250YWluZXJcIn1gKTtcbi8vICAgICBpZiAoZXhpc3RpbmdBdmF0YXIpIHtcbi8vICAgICAgICAgZXhpc3RpbmdBdmF0YXIucmVtb3ZlKCk7XG4vLyAgICAgfVxuLy8gICAgIHJldHVybjsgLy8g0J3QtSDRgNC10L3QtNC10YDQuNC80L4g0LDQstCw0YLQsNGAXG4vLyB9XG4gICAgY29uc3Qgc2V0dGluZ3MgPSBwbHVnaW4uc2V0dGluZ3M7XG4gICAgXG4gICAgbGV0IGF2YXRhclR5cGVUb1VzZTogQXZhdGFyVHlwZTtcbiAgICBsZXQgYXZhdGFyQ29udGVudFRvVXNlOiBzdHJpbmc7XG4gICAgLy8gc3BlY2lmaWNJY29uINGC0LAgZGVmYXVsdEFpSWNvbiDRgtGD0YIg0LzQvtC20YPRgtGMINCx0YPRgtC4INC90LUg0L/QvtGC0YDRltCx0L3Rliwg0Y/QutGJ0L4g0LvQvtCz0ZbQutCwINC30LzRltC90LjRgtGM0YHRj1xuXG4gICAgaWYgKGlzVXNlcikge1xuICAgICAgICBhdmF0YXJUeXBlVG9Vc2UgPSBzZXR0aW5ncy51c2VyQXZhdGFyVHlwZTtcbiAgICAgICAgYXZhdGFyQ29udGVudFRvVXNlID0gc2V0dGluZ3MudXNlckF2YXRhckNvbnRlbnQ7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8g0JLQuNC30L3QsNGH0LDRlNC80L4g0YLQuNC/INGWINC60L7QvdGC0LXQvdGCINGW0L3QtNC40LLRltC00YPQsNC70YzQvdC+INC00LvRjyDQutC+0LbQvdC+0Zcg0YDQvtC70ZZcbiAgICAgICAgc3dpdGNoIChhdmF0YXJSb2xlVHlwZSkge1xuICAgICAgICAgICAgLy8gY2FzZSAndG9vbCc6IC8vINCm0LUg0LTQu9GPIFwiVG9vbCBFeGVjdXRlZC4uLlwiXG4gICAgICAgICAgICAvLyAvLyBjYXNlICd0b29sLXVzYWdlJzogLy8g0K/QutGJ0L4g0LLQuCDQstC40LrQvtGA0LjRgdGC0L7QstGD0ZTRgtC1INC+0LrRgNC10LzQuNC5INGC0LjQvyDQtNC70Y8gXCJVc2luZyB0b29sLi4uXCJcbiAgICAgICAgICAgIC8vICAgICBhdmF0YXJUeXBlVG9Vc2UgPSAnaWNvbic7IC8vINCX0LDQstC20LTQuCDRltC60L7QvdC60LAg0LTQu9GPINGW0L3RgdGC0YDRg9C80LXQvdGC0ZbQslxuICAgICAgICAgICAgLy8gICAgIGF2YXRhckNvbnRlbnRUb1VzZSA9ICdzZXR0aW5ncyc7IC8vINCQ0LHQviAnY29nJyAtINGG0LUg0ZbQutC+0L3QutCwINGI0LXRgdGC0LXRgNC90ZYg0LIgTHVjaWRlXG4gICAgICAgICAgICAvLyAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd0b29sJzogXG4gICAgICAgIGF2YXRhclR5cGVUb1VzZSA9ICdpY29uJzsgXG4gICAgICAgIGF2YXRhckNvbnRlbnRUb1VzZSA9ICdjb2cnOyAvLyDQqNC10YHRgtC10YDQvdGPXG4gICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnc3lzdGVtJzpcbiAgICAgICAgICAgICAgICBhdmF0YXJUeXBlVG9Vc2UgPSAnaWNvbic7IFxuICAgICAgICAgICAgICAgIGF2YXRhckNvbnRlbnRUb1VzZSA9ICdpbmZvJzsgIFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnZXJyb3InOlxuICAgICAgICAgICAgICAgIGF2YXRhclR5cGVUb1VzZSA9ICdpY29uJzsgXG4gICAgICAgICAgICAgICAgYXZhdGFyQ29udGVudFRvVXNlID0gJ2FsZXJ0LXRyaWFuZ2xlJzsgXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdhc3Npc3RhbnQnOlxuICAgICAgICAgICAgZGVmYXVsdDogLy8g0JfQstC40YfQsNC50L3QuNC5IEFJINCw0YHQuNGB0YLQtdC90YJcbiAgICAgICAgICAgICAgICBhdmF0YXJUeXBlVG9Vc2UgPSBzZXR0aW5ncy5haUF2YXRhclR5cGU7ICAgXG4gICAgICAgICAgICAgICAgYXZhdGFyQ29udGVudFRvVXNlID0gc2V0dGluZ3MuYWlBdmF0YXJDb250ZW50OyBcbiAgICAgICAgICAgICAgICBpZiAoYXZhdGFyVHlwZVRvVXNlID09PSAnaWNvbicgJiYgIWF2YXRhckNvbnRlbnRUb1VzZSkge1xuICAgICAgICAgICAgICAgICAgICBhdmF0YXJDb250ZW50VG9Vc2UgPSBcImJvdFwiOyAvLyBGYWxsYmFjayDRltC60L7QvdC60LAg0LTQu9GPINCw0YHQuNGB0YLQtdC90YLQsCwg0Y/QutGJ0L4g0L3QtSDQstC60LDQt9Cw0L3QvlxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBjb25zdCBtYWluQXZhdGFyQ29udGFpbmVyQ2xhc3MgPSBDU1NfQ0xBU1NFUy5BVkFUQVJfQ09OVEFJTkVSIHx8IFwiYXZhdGFyLWNvbnRhaW5lclwiO1xuICAgIC8vINCU0L7QtNCw0LzQviDRgdC/0LXRhtC40YTRltGH0L3QuNC5INC60LvQsNGBINC00LvRjyDQsNCy0LDRgtCw0YDQsCDRltC90YHRgtGA0YPQvNC10L3RgtGDINC00LvRjyDQvNC+0LbQu9C40LLQvtGXINC/0L7QtNCw0LvRjNGI0L7RlyDRgdGC0LjQu9GW0LfQsNGG0ZbRl1xuICAgIGxldCBzcGVjaWZpY0F2YXRhclJvbGVDbGFzcyA9IGlzVXNlciA/IChDU1NfQ0xBU1NFUy5BVkFUQVJfVVNFUl9TUEVDSUZJQyB8fCBcInVzZXItYXZhdGFyXCIpIDogKENTU19DTEFTU0VTLkFWQVRBUl9BSV9TUEVDSUZJQyB8fCBcImFpLWF2YXRhclwiKTtcbiAgICBpZiAoIWlzVXNlciAmJiAoYXZhdGFyUm9sZVR5cGUgPT09ICd0b29sJyAvKnx8IGF2YXRhclJvbGVUeXBlID09PSAndG9vbC11c2FnZScqLykpIHtcbiAgICAgICAgICAgICAgICBzcGVjaWZpY0F2YXRhclJvbGVDbGFzcyA9IGAke3NwZWNpZmljQXZhdGFyUm9sZUNsYXNzfSAke0NTU19DTEFTU0VTLkFWQVRBUl9UT09MX1NQRUNJRklDIHx8IFwiYXZhdGFyLXRvb2wtc3BlY2lmaWNcIn1gO1xuXG4gICAgfVxuICBcbiAgICBsZXQgYXZhdGFyRWwgPSBncm91cEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KGAuJHttYWluQXZhdGFyQ29udGFpbmVyQ2xhc3Muc3BsaXQoXCIgXCIpWzBdfWApOyBcbiAgICBpZiAoIWF2YXRhckVsKSB7XG4gICAgICAgIGF2YXRhckVsID0gZ3JvdXBFbC5jcmVhdGVEaXYoeyBjbHM6IFttYWluQXZhdGFyQ29udGFpbmVyQ2xhc3MsIHNwZWNpZmljQXZhdGFyUm9sZUNsYXNzXS5qb2luKCcgJykgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYXZhdGFyRWwuY2xhc3NOYW1lID0gXCJcIjsgXG4gICAgICAgIGF2YXRhckVsLmNsYXNzTGlzdC5hZGQoLi4ubWFpbkF2YXRhckNvbnRhaW5lckNsYXNzLnNwbGl0KCcgJyksIC4uLnNwZWNpZmljQXZhdGFyUm9sZUNsYXNzLnNwbGl0KCcgJykpO1xuICAgIH1cbiAgICBhdmF0YXJFbC5lbXB0eSgpOyBcbiAgXG4gICAgdHJ5IHtcbiAgICAgIGlmIChhdmF0YXJUeXBlVG9Vc2UgPT09IFwiaW1hZ2VcIiAmJiBhdmF0YXJDb250ZW50VG9Vc2UpIHtcbiAgICAgICAgLy8gLi4uICjQutC+0LQg0LTQu9GPINC30L7QsdGA0LDQttC10L3QvdGPINC30LDQu9C40YjQsNGU0YLRjNGB0Y8g0YLQuNC8INGB0LDQvNC40LwpXG4gICAgICAgIGNvbnN0IGltYWdlUGF0aCA9IG5vcm1hbGl6ZVBhdGgoYXZhdGFyQ29udGVudFRvVXNlKTtcbiAgICAgICAgY29uc3QgaW1hZ2VGaWxlID0gYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChpbWFnZVBhdGgpO1xuICBcbiAgICAgICAgaWYgKGltYWdlRmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgY29uc3QgaW1hZ2VVcmwgPSBhcHAudmF1bHQuZ2V0UmVzb3VyY2VQYXRoKGltYWdlRmlsZSk7XG4gICAgICAgICAgYXZhdGFyRWwuY3JlYXRlRWwoXCJpbWdcIiwge1xuICAgICAgICAgICAgYXR0cjogeyBzcmM6IGltYWdlVXJsLCBhbHQ6IGlzVXNlciA/IFwiVXNlciBBdmF0YXJcIiA6IChhdmF0YXJSb2xlVHlwZSB8fCBcIkFJXCIpICsgXCIgQXZhdGFyXCIgfSxcbiAgICAgICAgICAgIGNsczogQ1NTX0NMQVNTRVMuQVZBVEFSX0lNQUdFIHx8IFwiYXZhdGFyLWltYWdlXCIsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgYXZhdGFyRWwudGl0bGUgPSBgQXZhdGFyIGZyb206ICR7aW1hZ2VQYXRofWA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgIHBsdWdpbi5sb2dnZXIud2FybihgQXZhdGFyIGltYWdlIGZpbGUgbm90IGZvdW5kIG9yIG5vdCBhIFRGaWxlOiAke2ltYWdlUGF0aH0uIFVzaW5nIGZhbGxiYWNrLmApO1xuICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIGltYWdlIHBhdGggb3Igbm90IGEgZmlsZS5cIik7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoYXZhdGFyVHlwZVRvVXNlID09PSBcImljb25cIiAmJiBhdmF0YXJDb250ZW50VG9Vc2UpIHsgXG4gICAgICAgIHNldEljb24oYXZhdGFyRWwuY3JlYXRlU3Bhbih7IGNsczogQ1NTX0NMQVNTRVMuQVZBVEFSX0lDT04gfHwgXCJhdmF0YXItaWNvblwiIH0pLCBhdmF0YXJDb250ZW50VG9Vc2UpO1xuICAgICAgICBhdmF0YXJFbC50aXRsZSA9IGBJY29uOiAke2F2YXRhckNvbnRlbnRUb1VzZX1gO1xuICAgICAgfSBlbHNlIHsgLy8gSW5pdGlhbHMgb3IgZmFsbGJhY2tcbiAgICAgICAgLy8gLi4uICjQutC+0LQg0LTQu9GPINGW0L3RltGG0ZbQsNC70ZbQsiDQt9Cw0LvQuNGI0LDRlNGC0YzRgdGPINGC0LjQvCDRgdCw0LzQuNC8KVxuICAgICAgICBsZXQgaW5pdGlhbHMgPSBhdmF0YXJDb250ZW50VG9Vc2U/LnN1YnN0cmluZygwLCAyKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICBpZiAoIWluaXRpYWxzKSB7IFxuICAgICAgICAgICAgaWYgKGlzVXNlcikge1xuICAgICAgICAgICAgICAgIGluaXRpYWxzID0gXCJVXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGluaXRpYWxzID0gYXZhdGFyUm9sZVR5cGUgPyBhdmF0YXJSb2xlVHlwZS5zdWJzdHJpbmcoMCwxKS50b1VwcGVyQ2FzZSgpIDogXCJBSVwiO1xuICAgICAgICAgICAgICAgIGlmIChpbml0aWFscy5sZW5ndGggPiAyKSBpbml0aWFscyA9IGluaXRpYWxzLnN1YnN0cmluZygwLDIpOyBcbiAgICAgICAgICAgICAgICBpZiAoIWluaXRpYWxzKSBpbml0aWFscyA9IFwiQUlcIjsgXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYXZhdGFyRWwuY3JlYXRlRGl2KHtjbHM6IENTU19DTEFTU0VTLkFWQVRBUl9JTklUSUFMUyB8fCBcImF2YXRhci1pbml0aWFsc1wiLCB0ZXh0OiBpbml0aWFsc30pOyBcbiAgICAgICAgYXZhdGFyRWwudGl0bGUgPSBgSW5pdGlhbHM6ICR7aW5pdGlhbHN9YDtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgIHBsdWdpbi5sb2dnZXIud2FybihgRmFpbGVkIHRvIHJlbmRlciBhdmF0YXIgKHR5cGU6ICR7YXZhdGFyVHlwZVRvVXNlfSwgY29udGVudDogJHthdmF0YXJDb250ZW50VG9Vc2V9LCByb2xlVHlwZTogJHthdmF0YXJSb2xlVHlwZX0pOmAsIGUubWVzc2FnZSk7XG4gICAgICAvLyDQl9C80ZbQvdGO0ZTQvNC+IGZhbGxiYWNrINGW0LrQvtC90LrRgyDQtNC70Y8g0ZbQvdGB0YLRgNGD0LzQtdC90YLRltCyLCDRj9C60YnQviDQvtGB0L3QvtCy0L3QsCDQu9C+0LPRltC60LAg0L3QtSDRgdC/0YDQsNGG0Y7QstCw0LvQsFxuICAgICAgY29uc3QgZmFsbGJhY2tJY29uTmFtZSA9IChhdmF0YXJSb2xlVHlwZSA9PT0gJ3Rvb2wnIC8qfHwgYXZhdGFyUm9sZVR5cGUgPT09ICd0b29sLXVzYWdlJyovKSA/ICdzZXR0aW5ncycgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogaXNVc2VyID8gXCJ1c2VyLWNpcmNsZVwiIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IFwiYm90XCI7IC8vINCQ0LHQviBzZXR0aW5ncy5haUF2YXRhckNvbnRlbnQsINGP0LrRidC+INGG0LUg0ZbQutC+0L3QutCwXG4gICAgICBhdmF0YXJFbC5lbXB0eSgpOyBcbiAgICAgIHNldEljb24oYXZhdGFyRWwuY3JlYXRlU3Bhbih7IGNsczogQ1NTX0NMQVNTRVMuQVZBVEFSX0lDT04gfHwgXCJhdmF0YXItaWNvblwiIH0pLCBmYWxsYmFja0ljb25OYW1lKTtcbiAgICAgIGF2YXRhckVsLnRpdGxlID0gYEZhbGxiYWNrIEF2YXRhciAoSWNvbjogJHtmYWxsYmFja0ljb25OYW1lfSlgO1xuICAgIH1cbn1cblxuLy8g0JLQuNC00LDQu9C10L3QviDQvdC10L/RgNCw0LLQuNC70YzQvdGDINGE0YPQvdC60YbRltGOIFJlbmRlcmVyVXRpbHNcbi8vIGV4cG9ydCBmdW5jdGlvbiBSZW5kZXJlclV0aWxzKGFwcDogQXBwLCBwbHVnaW46IE9sbGFtYVBsdWdpbiwgbWVzc2FnZUdyb3VwOiBIVE1MRWxlbWVudCwgYXJnMzogYm9vbGVhbikge1xuLy8gICB0aHJvdyBuZXcgRXJyb3IoXCJGdW5jdGlvbiBub3QgaW1wbGVtZW50ZWQuXCIpO1xuLy8gfSJdfQ==