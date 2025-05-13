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
export function renderAvatar(app, plugin, groupEl, isUser, avatarRoleType) {
    const settings = plugin.settings;
    let avatarTypeToUse;
    let avatarContentToUse;
    let specificIcon = null;
    const defaultAiIcon = "bot";
    if (isUser) {
        avatarTypeToUse = settings.userAvatarType;
        avatarContentToUse = settings.userAvatarContent;
    }
    else {
        avatarTypeToUse = settings.aiAvatarType;
        avatarContentToUse = settings.aiAvatarContent;
        if (avatarTypeToUse === 'icon') { // Тільки якщо AI аватар - іконка, визначаємо специфічну
            switch (avatarRoleType) {
                case 'system':
                    specificIcon = "info";
                    break;
                case 'tool':
                    specificIcon = "wrench"; // <--- ВИПРАВЛЕНО ЗАЙВУ КОМУ
                    break;
                case 'error':
                    specificIcon = "alert-circle";
                    break;
                case 'assistant':
                default:
                    specificIcon = avatarContentToUse || defaultAiIcon;
                    break;
            }
            if (specificIcon) { // Якщо specificIcon визначено, він стає контентом для іконки
                avatarContentToUse = specificIcon;
            }
        }
    }
    // Використовуємо константи, які, як ми очікуємо, є у вашому файлі constants.ts
    const mainAvatarContainerClass = CSS_CLASSES.AVATAR_CONTAINER || "avatar-container";
    const specificAvatarRoleClass = isUser ? (CSS_CLASSES.AVATAR_USER_SPECIFIC || "user-avatar") : (CSS_CLASSES.AVATAR_AI_SPECIFIC || "ai-avatar");
    let avatarEl = groupEl.querySelector(`.${mainAvatarContainerClass.split(" ")[0]}`); // Беремо перший клас, якщо їх декілька
    if (!avatarEl) {
        avatarEl = groupEl.createDiv({ cls: [mainAvatarContainerClass, specificAvatarRoleClass] });
    }
    else {
        avatarEl.className = "";
        avatarEl.classList.add(mainAvatarContainerClass, specificAvatarRoleClass);
    }
    avatarEl.empty();
    try {
        if (avatarTypeToUse === "image" && avatarContentToUse) {
            const imagePath = normalizePath(avatarContentToUse);
            const imageFile = app.vault.getAbstractFileByPath(imagePath);
            if (imageFile instanceof TFile) {
                const imageUrl = app.vault.getResourcePath(imageFile);
                avatarEl.createEl("img", {
                    attr: { src: imageUrl, alt: isUser ? "User Avatar" : (avatarRoleType || "AI") + " Avatar" },
                    cls: CSS_CLASSES.AVATAR_IMAGE || "avatar-image", // Використовуємо константу
                });
                avatarEl.title = `Avatar from: ${imagePath}`;
            }
            else {
                plugin.logger.warn(`Avatar image file not found or not a TFile: ${imagePath}. Using fallback.`);
                throw new Error("Invalid image path or not a file.");
            }
        }
        else if (avatarTypeToUse === "icon" && avatarContentToUse) {
            setIcon(avatarEl.createSpan({ cls: CSS_CLASSES.AVATAR_ICON || "avatar-icon" }), avatarContentToUse); // Використовуємо константу
            avatarEl.title = `Icon: ${avatarContentToUse}`;
        }
        else { // Initials or fallback
            let initials = avatarContentToUse === null || avatarContentToUse === void 0 ? void 0 : avatarContentToUse.substring(0, 2).toUpperCase();
            if (!initials) { // Якщо avatarContentToUse порожній або undefined
                if (isUser) {
                    initials = "U";
                }
                else {
                    // Для AI/system/tool, якщо specificIcon був null (наприклад, тип аватара AI - initials, але контент порожній)
                    initials = avatarRoleType ? avatarRoleType.substring(0, 1).toUpperCase() : "AI";
                    if (initials.length > 2)
                        initials = initials.substring(0, 2); // Обрізаємо, якщо роль довга
                    if (!initials)
                        initials = "AI"; // Останній fallback
                }
            }
            avatarEl.createDiv({ cls: CSS_CLASSES.AVATAR_INITIALS || "avatar-initials", text: initials }); // Використовуємо константу
            avatarEl.title = `Initials: ${initials}`;
        }
    }
    catch (e) {
        plugin.logger.warn(`Failed to render avatar (type: ${avatarTypeToUse}, content: ${avatarContentToUse}, roleType: ${avatarRoleType}):`, e.message);
        const fallbackIcon = isUser ? "user-circle" : (specificIcon || defaultAiIcon);
        avatarEl.empty();
        setIcon(avatarEl.createSpan({ cls: CSS_CLASSES.AVATAR_ICON || "avatar-icon" }), fallbackIcon); // Використовуємо константу
        avatarEl.title = `Fallback Avatar (Icon: ${fallbackIcon})`;
    }
}
// Видалено неправильну функцію RendererUtils
// export function RendererUtils(app: App, plugin: OllamaPlugin, messageGroup: HTMLElement, arg3: boolean) {
//   throw new Error("Function not implemented.");
// }
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWVzc2FnZVJlbmRlcmVyVXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJNZXNzYWdlUmVuZGVyZXJVdGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsOEJBQThCO0FBQzlCLE9BQU8sRUFBTyxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFHeEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQVkxQyxNQUFNLFVBQVUsa0JBQWtCLENBQUMsSUFBWTtJQUMzQyxJQUFJLE9BQU8sUUFBUSxLQUFLLFdBQVcsRUFBRSxDQUFDO1FBQ2xDLE9BQU8sSUFBSTthQUNOLE9BQU8sQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDO2FBQ3RCLE9BQU8sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDO2FBQ3ZCLE9BQU8sQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUNELE1BQU0sRUFBRSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDOUMsRUFBRSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7SUFDcEIsT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDO0FBQ3BCLENBQUM7QUFFRCxNQUFNLFVBQVUsa0JBQWtCLENBQUMsT0FBZTtJQUM5QyxvRkFBb0Y7SUFDcEYsTUFBTSxhQUFhLEdBQUcsNEJBQTRCLENBQUM7SUFDbkQsSUFBSSxrQkFBa0IsR0FBRyxPQUFPLENBQUM7SUFDakMsSUFBSSxlQUFlLEdBQUcsS0FBSyxDQUFDO0lBRTVCLG1HQUFtRztJQUNuRyxJQUFJLGVBQWUsQ0FBQztJQUNwQixHQUFHLENBQUM7UUFDQSxlQUFlLEdBQUcsa0JBQWtCLENBQUM7UUFD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QUFvQjtnQkFDeEQsQ0FBQztZQUNMLENBQUM7WUFDRCxRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUMsR0FBRyxFQUFFLFdBQVcsQ0FBQyxlQUFlLElBQUksaUJBQWlCLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBQyxDQUFDLENBQUMsQ0FBQywyQkFBMkI7WUFDeEgsUUFBUSxDQUFDLEtBQUssR0FBRyxhQUFhLFFBQVEsRUFBRSxDQUFDO1FBQzNDLENBQUM7SUFDSCxDQUFDO0lBQUMsT0FBTyxDQUFNLEVBQUUsQ0FBQztRQUNoQixNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxrQ0FBa0MsZUFBZSxjQUFjLGtCQUFrQixlQUFlLGNBQWMsSUFBSSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNsSixNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLElBQUksYUFBYSxDQUFDLENBQUM7UUFDOUUsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2pCLE9BQU8sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLEVBQUUsR0FBRyxFQUFFLFdBQVcsQ0FBQyxXQUFXLElBQUksYUFBYSxFQUFFLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDLDJCQUEyQjtRQUMxSCxRQUFRLENBQUMsS0FBSyxHQUFHLDBCQUEwQixZQUFZLEdBQUcsQ0FBQztJQUM3RCxDQUFDO0FBQ0wsQ0FBQztBQUVELDZDQUE2QztBQUM3Qyw0R0FBNEc7QUFDNUcsa0RBQWtEO0FBQ2xELElBQUkiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBzcmMvTWVzc2FnZVJlbmRlcmVyVXRpbHMudHNcbmltcG9ydCB7IEFwcCwgTWFya2Rvd25SZW5kZXJlciwgTm90aWNlLCBzZXRJY29uLCBURmlsZSwgbm9ybWFsaXplUGF0aCB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHsgT2xsYW1hVmlldyB9IGZyb20gXCIuL09sbGFtYVZpZXdcIjsgXG5pbXBvcnQgT2xsYW1hUGx1Z2luIGZyb20gXCIuL21haW5cIjsgXG5pbXBvcnQgeyBDU1NfQ0xBU1NFUyB9IGZyb20gXCIuL2NvbnN0YW50c1wiOyBcbmltcG9ydCB7IEF2YXRhclR5cGUgfSBmcm9tIFwiLi9zZXR0aW5nc1wiOyBcblxuXG4vLyBDT0RFX0JMT0NLX0NPUFlfQlVUVE9OINGC0LAgQ09ERV9CTE9DS19MQU5HVUFHRSDRgtC10L/QtdGAINC+0YfRltC60YPRjtGC0YzRgdGPINC3IENTU19DTEFTU0VTXG5cbmV4cG9ydCBpbnRlcmZhY2UgVGhpbmtEZXRlY3Rpb25SZXN1bHQge1xuICAgIGhhc1RoaW5raW5nVGFnczogYm9vbGVhbjtcbiAgICBjb250ZW50V2l0aG91dFRhZ3M6IHN0cmluZzsgXG4gICAgZm9ybWF0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVIdG1sRW50aXRpZXModGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBpZiAodHlwZW9mIGRvY3VtZW50ID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIHJldHVybiB0ZXh0XG4gICAgICAgICAgICAucmVwbGFjZSgvJmFtcDsvZywgXCImXCIpXG4gICAgICAgICAgICAucmVwbGFjZSgvJmx0Oy9nLCBcIjxcIilcbiAgICAgICAgICAgIC5yZXBsYWNlKC8mZ3Q7L2csIFwiPlwiKVxuICAgICAgICAgICAgLnJlcGxhY2UoLyZxdW90Oy9nLCAnXCInKVxuICAgICAgICAgICAgLnJlcGxhY2UoLyYjMzk7L2csIFwiJ1wiKTtcbiAgICB9XG4gICAgY29uc3QgdGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGV4dGFyZWFcIik7XG4gICAgdGEuaW5uZXJIVE1MID0gdGV4dDtcbiAgICByZXR1cm4gdGEudmFsdWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RUaGlua2luZ1RhZ3MoY29udGVudDogc3RyaW5nKTogVGhpbmtEZXRlY3Rpb25SZXN1bHQge1xuICAgIC8vINCm0LXQuSDRgNC10LPRg9C70Y/RgNC90LjQuSDQstC40YDQsNC3INC80LDRlCDQt9C90LDRhdC+0LTQuNGC0Lgg0L3QsNC50LrQvtGA0L7RgtGI0LUg0YHQv9GW0LLQv9Cw0LTRltC90L3RjyDQvNGW0LYgPHRoaW5rPiDRgtCwIDwvdGhpbms+XG4gICAgY29uc3QgdGhpbmtUYWdSZWdleCA9IC88dGhpbms+W1xcc1xcU10qPzxcXC90aGluaz4vZ2k7IFxuICAgIGxldCBjb250ZW50V2l0aG91dFRhZ3MgPSBjb250ZW50O1xuICAgIGxldCBoYXNUaGlua2luZ1RhZ3MgPSBmYWxzZTtcblxuICAgIC8vINCS0LjQtNCw0LvRj9GU0LzQviDQstGB0ZYg0LLRhdC+0LTQttC10L3QvdGPINGW0YLQtdGA0LDRgtC40LLQvdC+LCDRidC+0LEg0LLQv9C+0YDQsNGC0LjRgdGPINC3INC/0L7RgtC10L3RhtGW0LnQvdC+0Y4g0LLQutC70LDQtNC10L3RltGB0YLRjiDQsNCx0L4g0L/RgNC+0LHQu9C10LzQsNC80LggcmVnZXhcbiAgICBsZXQgcHJldmlvdXNDb250ZW50O1xuICAgIGRvIHtcbiAgICAgICAgcHJldmlvdXNDb250ZW50ID0gY29udGVudFdpdGhvdXRUYWdzO1xuICAgICAgICBjb250ZW50V2l0aG91dFRhZ3MgPSBjb250ZW50V2l0aG91dFRhZ3MucmVwbGFjZSh0aGlua1RhZ1JlZ2V4LCAnJyk7XG4gICAgICAgIGlmIChwcmV2aW91c0NvbnRlbnQgIT09IGNvbnRlbnRXaXRob3V0VGFncykge1xuICAgICAgICAgICAgaGFzVGhpbmtpbmdUYWdzID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH0gd2hpbGUgKHByZXZpb3VzQ29udGVudCAhPT0gY29udGVudFdpdGhvdXRUYWdzICYmIGNvbnRlbnRXaXRob3V0VGFncy5pbmNsdWRlcyhcIjx0aGluaz5cIikpOyAvLyDQn9C+0LLRgtC+0YDRjtGU0LzQviwg0LTQvtC60Lgg0ZQg0LfQvNGW0L3QuCDRgtCwINGC0LXQs9C4XG5cbiAgICBjb250ZW50V2l0aG91dFRhZ3MgPSBjb250ZW50V2l0aG91dFRhZ3MudHJpbSgpO1xuICAgIGNvbnN0IGZvcm1hdCA9IC88W2Etel1bXFxzXFxTXSo+L2kudGVzdChjb250ZW50V2l0aG91dFRhZ3MpID8gJ2h0bWwnIDogJ3RleHQnO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgaGFzVGhpbmtpbmdUYWdzLFxuICAgICAgICBjb250ZW50V2l0aG91dFRhZ3M6IGNvbnRlbnRXaXRob3V0VGFncyxcbiAgICAgICAgZm9ybWF0XG4gICAgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1hcmtkb3duVG9IdG1sKFxuICAgIGFwcDogQXBwLFxuICAgIHZpZXc6IGFueSwgXG4gICAgbWFya2Rvd246IHN0cmluZyxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgaWYgKCFtYXJrZG93bj8udHJpbSgpKSByZXR1cm4gXCJcIjtcbiAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IE1hcmtkb3duUmVuZGVyZXIucmVuZGVyKFxuICAgICAgICAgICAgYXBwLFxuICAgICAgICAgICAgbWFya2Rvd24sXG4gICAgICAgICAgICBkaXYsXG4gICAgICAgICAgICBhcHAudmF1bHQuZ2V0Um9vdCgpPy5wYXRoID8/IFwiXCIsIFxuICAgICAgICAgICAgdmlldywgXG4gICAgICAgICk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIk1hcmtkb3duIHJlbmRlcmluZyBlcnJvciwgZmFsbGluZyBiYWNrIHRvIHRleHQ6XCIsIGVycm9yKTtcbiAgICAgICAgZGl2LnRleHRDb250ZW50ID0gbWFya2Rvd247IFxuICAgIH1cbiAgICByZXR1cm4gZGl2LmlubmVySFRNTDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NUaGlua2luZ1RhZ3MoXG4gICAgYXBwOiBBcHAsXG4gICAgdmlldzogYW55LCAvLyBPbGxhbWFWaWV3XG4gICAgY29udGVudDogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCB0aGlua1RhZ1JlZ2V4ID0gLzx0aGluaz4oW1xcc1xcU10qPyk8XFwvdGhpbms+L2c7XG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGxhc3RJbmRleCA9IDA7XG4gICAgbGV0IG1hdGNoO1xuXG4gICAgd2hpbGUgKChtYXRjaCA9IHRoaW5rVGFnUmVnZXguZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKG1hdGNoLmluZGV4ID4gbGFzdEluZGV4KSB7XG4gICAgICAgICAgICBjb25zdCBub3JtYWxUZXh0ID0gY29udGVudC5zdWJzdHJpbmcobGFzdEluZGV4LCBtYXRjaC5pbmRleCk7XG4gICAgICAgICAgICBwYXJ0cy5wdXNoKGF3YWl0IG1hcmtkb3duVG9IdG1sKGFwcCwgdmlldywgbm9ybWFsVGV4dCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGhpbmtDb250ZW50ID0gbWF0Y2hbMV07XG4gICAgICAgIGNvbnN0IHJlbmRlcmVkVGhpbmtDb250ZW50ID0gYXdhaXQgbWFya2Rvd25Ub0h0bWwoYXBwLCB2aWV3LCB0aGlua0NvbnRlbnQpO1xuICAgICAgICAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0LnRgtC1IENTU19DTEFTU0VTINC00LvRjyDRhtC40YUg0LrQu9Cw0YHRltCyLCDRj9C60YnQviDQstC+0L3QuCDQstC40LfQvdCw0YfQtdC90ZYg0LPQu9C+0LHQsNC70YzQvdC+XG4gICAgICAgIGNvbnN0IGhlYWRlckh0bWwgPSBgPGRpdiBjbGFzcz1cIiR7Q1NTX0NMQVNTRVMuVEhJTktJTkdfSEVBREVSIHx8IFwidGhpbmtpbmctaGVhZGVyXCJ9XCIgZGF0YS1mb2xkLXN0YXRlPVwiZm9sZGVkXCI+PGRpdiBjbGFzcz1cIiR7Q1NTX0NMQVNTRVMuVEhJTktJTkdfVE9HR0xFIHx8IFwidGhpbmtpbmctdG9nZ2xlXCJ9XCI+4pa6PC9kaXY+PGRpdiBjbGFzcz1cIiR7Q1NTX0NMQVNTRVMuVEhJTktJTkdfVElUTEUgfHwgXCJ0aGlua2luZy10aXRsZVwifVwiPlRoaW5raW5nPC9kaXY+PC9kaXY+YDtcbiAgICAgICAgY29uc3QgY29udGVudEh0bWwgPSBgPGRpdiBjbGFzcz1cIiR7Q1NTX0NMQVNTRVMuVEhJTktJTkdfQ09OVEVOVCB8fCBcInRoaW5raW5nLWNvbnRlbnRcIn1cIiBzdHlsZT1cImRpc3BsYXk6IG5vbmU7XCI+JHtyZW5kZXJlZFRoaW5rQ29udGVudH08L2Rpdj5gO1xuICAgICAgICBwYXJ0cy5wdXNoKGA8ZGl2IGNsYXNzPVwiJHtDU1NfQ0xBU1NFUy5USElOS0lOR19CTE9DSyB8fCBcInRoaW5raW5nLWJsb2NrXCJ9XCI+JHtoZWFkZXJIdG1sfSR7Y29udGVudEh0bWx9PC9kaXY+YCk7XG5cbiAgICAgICAgbGFzdEluZGV4ID0gdGhpbmtUYWdSZWdleC5sYXN0SW5kZXg7XG4gICAgfVxuXG4gICAgaWYgKGxhc3RJbmRleCA8IGNvbnRlbnQubGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IHJlbWFpbmluZ1RleHQgPSBjb250ZW50LnN1YnN0cmluZyhsYXN0SW5kZXgpO1xuICAgICAgICBwYXJ0cy5wdXNoKGF3YWl0IG1hcmtkb3duVG9IdG1sKGFwcCwgdmlldywgcmVtYWluaW5nVGV4dCkpO1xuICAgIH1cblxuICAgIHJldHVybiBwYXJ0cy5qb2luKFwiXCIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkVGhpbmtpbmdUb2dnbGVMaXN0ZW5lcnMoXG4gICAgdmlldzogT2xsYW1hVmlldywgXG4gICAgY29udGVudEVsOiBIVE1MRWxlbWVudCxcbik6IHZvaWQge1xuICAgIGNvbnN0IGhlYWRlcnMgPSBjb250ZW50RWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oYC4ke0NTU19DTEFTU0VTLlRISU5LSU5HX0hFQURFUiB8fCBcInRoaW5raW5nLWhlYWRlclwifWApO1xuICAgIGhlYWRlcnMuZm9yRWFjaChoZWFkZXIgPT4ge1xuICAgICAgICBpZiAoKGhlYWRlciBhcyBhbnkpLl9saXN0ZW5lckF0dGFjaGVkKSByZXR1cm47XG5cbiAgICAgICAgdmlldy5yZWdpc3RlckRvbUV2ZW50KGhlYWRlciwgXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gaGVhZGVyLm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IHRvZ2dsZSA9IGhlYWRlci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihgLiR7Q1NTX0NMQVNTRVMuVEhJTktJTkdfVE9HR0xFIHx8IFwidGhpbmtpbmctdG9nZ2xlXCJ9YCk7XG4gICAgICAgICAgICBpZiAoIWNvbnRlbnQgfHwgIXRvZ2dsZSkgcmV0dXJuO1xuXG4gICAgICAgICAgICBjb25zdCBpc0ZvbGRlZCA9IGhlYWRlci5nZXRBdHRyaWJ1dGUoXCJkYXRhLWZvbGQtc3RhdGVcIikgPT09IFwiZm9sZGVkXCI7XG4gICAgICAgICAgICBpZiAoaXNGb2xkZWQpIHtcbiAgICAgICAgICAgICAgICBjb250ZW50LnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICAgICAgICAgICAgdG9nZ2xlLnRleHRDb250ZW50ID0gXCLilrxcIjtcbiAgICAgICAgICAgICAgICBoZWFkZXIuc2V0QXR0cmlidXRlKFwiZGF0YS1mb2xkLXN0YXRlXCIsIFwiZXhwYW5kZWRcIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICAgICAgICAgIHRvZ2dsZS50ZXh0Q29udGVudCA9IFwi4pa6XCI7XG4gICAgICAgICAgICAgICAgaGVhZGVyLnNldEF0dHJpYnV0ZShcImRhdGEtZm9sZC1zdGF0ZVwiLCBcImZvbGRlZFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIChoZWFkZXIgYXMgYW55KS5fbGlzdGVuZXJBdHRhY2hlZCA9IHRydWU7IFxuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5oYW5jZUNvZGVCbG9ja3MoY29udGVudEVsOiBIVE1MRWxlbWVudCwgdmlldzogT2xsYW1hVmlldyk6IHZvaWQge1xuICAgIGlmICghdmlldyB8fCAhdmlldy5wbHVnaW4pIHtcbiAgICAgICAgdmlldy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW2VuaGFuY2VDb2RlQmxvY2tzXSBNaXNzaW5nIHZpZXcgb3IgcGx1Z2luIGNvbnRleHQhXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvZGVCbG9ja3MgPSBjb250ZW50RWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCJwcmUgPiBjb2RlXCIpO1xuICAgICAgICBjb2RlQmxvY2tzLmZvckVhY2goKGNvZGVFbGVtZW50KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwcmVFbGVtZW50ID0gY29kZUVsZW1lbnQucGFyZW50RWxlbWVudCBhcyBIVE1MUHJlRWxlbWVudDtcbiAgICAgICAgICAgIGlmICghcHJlRWxlbWVudCkgcmV0dXJuO1xuXG4gICAgICAgICAgICAgaWYgKHByZUVsZW1lbnQucXVlcnlTZWxlY3RvcihgLiR7Q1NTX0NMQVNTRVMuQ09ERV9CTE9DS19DT1BZX0JVVFRPTn1gKSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgcHJlRWxlbWVudC5jbGFzc0xpc3QuYWRkKFwiZW5oYW5jZWRcIik7IC8vINCU0L7QtNCw0LnRgtC1INC80LDRgNC60LXRgNC90LjQuSDQutC70LDRgSwg0YnQvtCxINGD0L3QuNC60L3Rg9GC0Lgg0L/QvtCy0YLQvtGA0L3QvtGXINC+0LHRgNC+0LHQutC4XG5cbiAgICAgICAgICAgIGNvbnN0IGNvcHlCdXR0b24gPSBwcmVFbGVtZW50LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcbiAgICAgICAgICAgICAgICAgY2xzOiBgJHtDU1NfQ0xBU1NFUy5DT0RFX0JMT0NLX0NPUFlfQlVUVE9OfSBjbGlja2FibGUtaWNvbmAsXG4gICAgICAgICAgICAgICAgIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiQ29weSBjb2RlXCIsIHRpdGxlOiBcIkNvcHkgY29kZVwiIH0sXG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzZXRJY29uKGNvcHlCdXR0b24sIFwiY29weVwiKTtcblxuICAgICAgICAgICAgdmlldy5yZWdpc3RlckRvbUV2ZW50KGNvcHlCdXR0b24sIFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICBjb25zdCBjb2RlVG9Db3B5ID0gY29kZUVsZW1lbnQudGV4dENvbnRlbnQgfHwgXCJcIjtcbiAgICAgICAgICAgICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQoY29kZVRvQ29weSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICBzZXRJY29uKGNvcHlCdXR0b24sIFwiY2hlY2tcIik7XG4gICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHNldEljb24oY29weUJ1dHRvbiwgXCJjb3B5XCIpLCAyMDAwKTtcbiAgICAgICAgICAgICAgICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgICAgICAgIHZpZXcucGx1Z2luLmxvZ2dlci5lcnJvcihcIkZhaWxlZCB0byBjb3B5IGNvZGUgYmxvY2s6XCIsIGVycik7XG4gICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiRmFpbGVkIHRvIGNvcHkgY29kZSB0byBjbGlwYm9hcmQuXCIpO1xuICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgbGFuZ3VhZ2UgPSBBcnJheS5mcm9tKGNvZGVFbGVtZW50LmNsYXNzTGlzdCkuZmluZChjbHMgPT4gY2xzLnN0YXJ0c1dpdGgoXCJsYW5ndWFnZS1cIikpPy5yZXBsYWNlKFwibGFuZ3VhZ2UtXCIsIFwiXCIpO1xuICAgICAgICAgICAgaWYgKGxhbmd1YWdlICYmICFwcmVFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoYC4ke0NTU19DTEFTU0VTLkNPREVfQkxPQ0tfTEFOR1VBR0V9YCkpIHsgXG4gICAgICAgICAgICAgICAgcHJlRWxlbWVudC5jcmVhdGVEaXYoe1xuICAgICAgICAgICAgICAgICAgICBjbHM6IENTU19DTEFTU0VTLkNPREVfQkxPQ0tfTEFOR1VBR0UsXG4gICAgICAgICAgICAgICAgICAgIHRleHQ6IGxhbmd1YWdlLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgIHByZUVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSBcInJlbGF0aXZlXCI7IFxuICAgICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgdmlldy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW01lc3NhZ2VSZW5kZXJlclV0aWxzLmVuaGFuY2VDb2RlQmxvY2tzXSBFcnJvciBwcm9jZXNzaW5nIGNvZGUgYmxvY2tzOlwiLCBlcnJvcik7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZml4QnJva2VuVHdlbW9qaUltYWdlcyhjb250ZW50RWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgIHRyeSB7XG4gICAgICAgIGNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yQWxsKCdpbWcuZW1vamlbYWx0XVtzcmMqPVwidHdlbW9qaS5tYXhjZG4uY29tXCJdJykuZm9yRWFjaCgoaW1nOiBIVE1MSW1hZ2VFbGVtZW50KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhbHQgPSBpbWcuZ2V0QXR0cmlidXRlKCdhbHQnKTtcbiAgICAgICAgICAgIGlmIChhbHQgJiYgIWltZy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZml4ZWQnKSkgeyBcbiAgICAgICAgICAgICAgICAgY29uc3QgZW1vamlIZXggPSBhbHQuY29kZVBvaW50QXQoMCk/LnRvU3RyaW5nKDE2KTtcbiAgICAgICAgICAgICAgICAgaWYgKGVtb2ppSGV4KSB7XG4gICAgICAgICAgICAgICAgICAgICBpbWcuc3JjID0gYGh0dHBzOi8vY2RuLmpzZGVsaXZyLm5ldC9naC9qZGVja2VkL3R3ZW1vamlAbGF0ZXN0L2Fzc2V0cy9zdmcvJHtlbW9qaUhleH0uc3ZnYDtcbiAgICAgICAgICAgICAgICAgICAgIGltZy5zZXRBdHRyaWJ1dGUoJ2RhdGEtZml4ZWQnLCAndHJ1ZScpOyBcbiAgICAgICAgICAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4geyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBGYWlsZWQgdG8gbG9hZCBlbW9qaSBmcm9tIGpzZGVsaXZyOiAke2FsdH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW1nLnBhcmVudE5vZGUpIHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGltZy5yZXBsYWNlV2l0aChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShhbHQpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGltZy5wYXJlbnROb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIGltZy5yZXBsYWNlV2l0aChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShhbHQpKTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKFwiW01lc3NhZ2VSZW5kZXJlclV0aWxzLmZpeEJyb2tlblR3ZW1vamlJbWFnZXNdIEVycm9yIGZpeGluZyBUd2Vtb2ppOlwiLCBlcnJvcik7XG4gICAgIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlbmRlck1hcmtkb3duQ29udGVudCggXG4gICAgYXBwOiBBcHAsXG4gICAgdmlldzogT2xsYW1hVmlldyxcbiAgICBwbHVnaW46IE9sbGFtYVBsdWdpbixcbiAgICBjb250YWluZXJFbDogSFRNTEVsZW1lbnQsXG4gICAgbWFya2Rvd25UZXh0OiBzdHJpbmcsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuICAgICAgICBjb25zdCBkZWNvZGVkQ29udGVudCA9IGRlY29kZUh0bWxFbnRpdGllcyhtYXJrZG93blRleHQpO1xuICAgICAgICBjb25zdCB0aGlua2luZ0luZm8gPSBkZXRlY3RUaGlua2luZ1RhZ3MoZGVjb2RlZENvbnRlbnQpO1xuXG4gICAgICAgIGlmICh0aGlua2luZ0luZm8uaGFzVGhpbmtpbmdUYWdzKSB7XG4gICAgICAgICAgICBjb25zdCBwcm9jZXNzZWRIdG1sID0gYXdhaXQgcHJvY2Vzc1RoaW5raW5nVGFncyhhcHAsIHZpZXcsIGRlY29kZWRDb250ZW50KTtcbiAgICAgICAgICAgIGNvbnRhaW5lckVsLmlubmVySFRNTCA9IHByb2Nlc3NlZEh0bWw7XG4gICAgICAgICAgICBhZGRUaGlua2luZ1RvZ2dsZUxpc3RlbmVycyh2aWV3LCBjb250YWluZXJFbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhd2FpdCBNYXJrZG93blJlbmRlcmVyLnJlbmRlcihhcHAsIGRlY29kZWRDb250ZW50LCBjb250YWluZXJFbCwgcGx1Z2luLmFwcC52YXVsdC5nZXRSb290KCk/LnBhdGggPz8gXCJcIiwgdmlldyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGVuaGFuY2VDb2RlQmxvY2tzKGNvbnRhaW5lckVsLCB2aWV3KTtcbiAgICAgICAgaWYgKHBsdWdpbi5zZXR0aW5ncy5maXhCcm9rZW5FbW9qaXMpIHtcbiAgICAgICAgICAgIGZpeEJyb2tlblR3ZW1vamlJbWFnZXMoY29udGFpbmVyRWwpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgcGx1Z2luLmxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgIFwiW01lc3NhZ2VSZW5kZXJlclV0aWxzLnJlbmRlck1hcmtkb3duQ29udGVudF0gRXJyb3IgcmVuZGVyaW5nIGNvbnRlbnQ6XCIsXG4gICAgICAgICAgICBlcnJvciwgXCJDb250ZW50IFByZXZpZXc6XCIsIG1hcmtkb3duVGV4dC5zdWJzdHJpbmcoMCwgMjAwKSxcbiAgICAgICAgKTtcbiAgICAgICAgY29udGFpbmVyRWwuZW1wdHkoKTsgXG4gICAgICAgIGNvbnRhaW5lckVsLnNldFRleHQoYFtFcnJvciByZW5kZXJpbmcgY29udGVudC4gUGxlYXNlIGNoZWNrIGNvbnNvbGUuXWApO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckF2YXRhcihcbiAgICBhcHA6IEFwcCxcbiAgICBwbHVnaW46IE9sbGFtYVBsdWdpbixcbiAgICBncm91cEVsOiBIVE1MRWxlbWVudCxcbiAgICBpc1VzZXI6IGJvb2xlYW4sXG4gICAgYXZhdGFyUm9sZVR5cGU/OiAndXNlcicgfCAnYXNzaXN0YW50JyB8ICdzeXN0ZW0nIHwgJ3Rvb2wnIHwgJ2Vycm9yJyB8IHN0cmluZyBcbik6IHZvaWQge1xuICAgIGNvbnN0IHNldHRpbmdzID0gcGx1Z2luLnNldHRpbmdzO1xuICAgIFxuICAgIGxldCBhdmF0YXJUeXBlVG9Vc2U6IEF2YXRhclR5cGU7XG4gICAgbGV0IGF2YXRhckNvbnRlbnRUb1VzZTogc3RyaW5nO1xuICAgIGxldCBzcGVjaWZpY0ljb246IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGNvbnN0IGRlZmF1bHRBaUljb24gPSBcImJvdFwiOyBcblxuICAgIGlmIChpc1VzZXIpIHtcbiAgICAgICAgYXZhdGFyVHlwZVRvVXNlID0gc2V0dGluZ3MudXNlckF2YXRhclR5cGU7XG4gICAgICAgIGF2YXRhckNvbnRlbnRUb1VzZSA9IHNldHRpbmdzLnVzZXJBdmF0YXJDb250ZW50O1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGF2YXRhclR5cGVUb1VzZSA9IHNldHRpbmdzLmFpQXZhdGFyVHlwZTsgICBcbiAgICAgICAgYXZhdGFyQ29udGVudFRvVXNlID0gc2V0dGluZ3MuYWlBdmF0YXJDb250ZW50OyBcblxuICAgICAgICBpZiAoYXZhdGFyVHlwZVRvVXNlID09PSAnaWNvbicpIHsgLy8g0KLRltC70YzQutC4INGP0LrRidC+IEFJINCw0LLQsNGC0LDRgCAtINGW0LrQvtC90LrQsCwg0LLQuNC30L3QsNGH0LDRlNC80L4g0YHQv9C10YbQuNGE0ZbRh9C90YNcbiAgICAgICAgICAgIHN3aXRjaCAoYXZhdGFyUm9sZVR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdzeXN0ZW0nOlxuICAgICAgICAgICAgICAgICAgICBzcGVjaWZpY0ljb24gPSBcImluZm9cIjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAndG9vbCc6XG4gICAgICAgICAgICAgICAgICAgIHNwZWNpZmljSWNvbiA9IFwid3JlbmNoXCI7IC8vIDwtLS0g0JLQmNCf0KDQkNCS0JvQldCd0J4g0JfQkNCZ0JLQoyDQmtCe0JzQo1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdlcnJvcic6XG4gICAgICAgICAgICAgICAgICAgIHNwZWNpZmljSWNvbiA9IFwiYWxlcnQtY2lyY2xlXCI7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Fzc2lzdGFudCc6IFxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHNwZWNpZmljSWNvbiA9IGF2YXRhckNvbnRlbnRUb1VzZSB8fCBkZWZhdWx0QWlJY29uOyBcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc3BlY2lmaWNJY29uKSB7IC8vINCv0LrRidC+IHNwZWNpZmljSWNvbiDQstC40LfQvdCw0YfQtdC90L4sINCy0ZbQvSDRgdGC0LDRlCDQutC+0L3RgtC10L3RgtC+0Lwg0LTQu9GPINGW0LrQvtC90LrQuFxuICAgICAgICAgICAgICAgIGF2YXRhckNvbnRlbnRUb1VzZSA9IHNwZWNpZmljSWNvbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INC60L7QvdGB0YLQsNC90YLQuCwg0Y/QutGWLCDRj9C6INC80Lgg0L7Rh9GW0LrRg9GU0LzQviwg0ZQg0YMg0LLQsNGI0L7QvNGDINGE0LDQudC70ZYgY29uc3RhbnRzLnRzXG4gICAgY29uc3QgbWFpbkF2YXRhckNvbnRhaW5lckNsYXNzID0gQ1NTX0NMQVNTRVMuQVZBVEFSX0NPTlRBSU5FUiB8fCBcImF2YXRhci1jb250YWluZXJcIjtcbiAgICBjb25zdCBzcGVjaWZpY0F2YXRhclJvbGVDbGFzcyA9IGlzVXNlciA/IChDU1NfQ0xBU1NFUy5BVkFUQVJfVVNFUl9TUEVDSUZJQyB8fCBcInVzZXItYXZhdGFyXCIpIDogKENTU19DTEFTU0VTLkFWQVRBUl9BSV9TUEVDSUZJQyB8fCBcImFpLWF2YXRhclwiKTtcbiAgXG4gICAgbGV0IGF2YXRhckVsID0gZ3JvdXBFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihgLiR7bWFpbkF2YXRhckNvbnRhaW5lckNsYXNzLnNwbGl0KFwiIFwiKVswXX1gKTsgLy8g0JHQtdGA0LXQvNC+INC/0LXRgNGI0LjQuSDQutC70LDRgSwg0Y/QutGJ0L4g0ZfRhSDQtNC10LrRltC70YzQutCwXG4gICAgaWYgKCFhdmF0YXJFbCkge1xuICAgICAgICBhdmF0YXJFbCA9IGdyb3VwRWwuY3JlYXRlRGl2KHsgY2xzOiBbbWFpbkF2YXRhckNvbnRhaW5lckNsYXNzLCBzcGVjaWZpY0F2YXRhclJvbGVDbGFzc10gfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYXZhdGFyRWwuY2xhc3NOYW1lID0gXCJcIjsgXG4gICAgICAgIGF2YXRhckVsLmNsYXNzTGlzdC5hZGQobWFpbkF2YXRhckNvbnRhaW5lckNsYXNzLCBzcGVjaWZpY0F2YXRhclJvbGVDbGFzcyk7XG4gICAgfVxuICAgIGF2YXRhckVsLmVtcHR5KCk7IFxuICBcbiAgICB0cnkge1xuICAgICAgaWYgKGF2YXRhclR5cGVUb1VzZSA9PT0gXCJpbWFnZVwiICYmIGF2YXRhckNvbnRlbnRUb1VzZSkge1xuICAgICAgICBjb25zdCBpbWFnZVBhdGggPSBub3JtYWxpemVQYXRoKGF2YXRhckNvbnRlbnRUb1VzZSk7XG4gICAgICAgIGNvbnN0IGltYWdlRmlsZSA9IGFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoaW1hZ2VQYXRoKTtcbiAgXG4gICAgICAgIGlmIChpbWFnZUZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgIGNvbnN0IGltYWdlVXJsID0gYXBwLnZhdWx0LmdldFJlc291cmNlUGF0aChpbWFnZUZpbGUpO1xuICAgICAgICAgIGF2YXRhckVsLmNyZWF0ZUVsKFwiaW1nXCIsIHtcbiAgICAgICAgICAgIGF0dHI6IHsgc3JjOiBpbWFnZVVybCwgYWx0OiBpc1VzZXIgPyBcIlVzZXIgQXZhdGFyXCIgOiAoYXZhdGFyUm9sZVR5cGUgfHwgXCJBSVwiKSArIFwiIEF2YXRhclwiIH0sXG4gICAgICAgICAgICBjbHM6IENTU19DTEFTU0VTLkFWQVRBUl9JTUFHRSB8fCBcImF2YXRhci1pbWFnZVwiLCAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INC60L7QvdGB0YLQsNC90YLRg1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGF2YXRhckVsLnRpdGxlID0gYEF2YXRhciBmcm9tOiAke2ltYWdlUGF0aH1gO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICBwbHVnaW4ubG9nZ2VyLndhcm4oYEF2YXRhciBpbWFnZSBmaWxlIG5vdCBmb3VuZCBvciBub3QgYSBURmlsZTogJHtpbWFnZVBhdGh9LiBVc2luZyBmYWxsYmFjay5gKTtcbiAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBpbWFnZSBwYXRoIG9yIG5vdCBhIGZpbGUuXCIpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGF2YXRhclR5cGVUb1VzZSA9PT0gXCJpY29uXCIgJiYgYXZhdGFyQ29udGVudFRvVXNlKSB7IFxuICAgICAgICBzZXRJY29uKGF2YXRhckVsLmNyZWF0ZVNwYW4oeyBjbHM6IENTU19DTEFTU0VTLkFWQVRBUl9JQ09OIHx8IFwiYXZhdGFyLWljb25cIiB9KSwgYXZhdGFyQ29udGVudFRvVXNlKTsgLy8g0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviDQutC+0L3RgdGC0LDQvdGC0YNcbiAgICAgICAgYXZhdGFyRWwudGl0bGUgPSBgSWNvbjogJHthdmF0YXJDb250ZW50VG9Vc2V9YDtcbiAgICAgIH0gZWxzZSB7IC8vIEluaXRpYWxzIG9yIGZhbGxiYWNrXG4gICAgICAgIGxldCBpbml0aWFscyA9IGF2YXRhckNvbnRlbnRUb1VzZT8uc3Vic3RyaW5nKDAsIDIpLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIGlmICghaW5pdGlhbHMpIHsgLy8g0K/QutGJ0L4gYXZhdGFyQ29udGVudFRvVXNlINC/0L7RgNC+0LbQvdGW0Lkg0LDQsdC+IHVuZGVmaW5lZFxuICAgICAgICAgICAgaWYgKGlzVXNlcikge1xuICAgICAgICAgICAgICAgIGluaXRpYWxzID0gXCJVXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vINCU0LvRjyBBSS9zeXN0ZW0vdG9vbCwg0Y/QutGJ0L4gc3BlY2lmaWNJY29uINCx0YPQsiBudWxsICjQvdCw0L/RgNC40LrQu9Cw0LQsINGC0LjQvyDQsNCy0LDRgtCw0YDQsCBBSSAtIGluaXRpYWxzLCDQsNC70LUg0LrQvtC90YLQtdC90YIg0L/QvtGA0L7QttC90ZbQuSlcbiAgICAgICAgICAgICAgICBpbml0aWFscyA9IGF2YXRhclJvbGVUeXBlID8gYXZhdGFyUm9sZVR5cGUuc3Vic3RyaW5nKDAsMSkudG9VcHBlckNhc2UoKSA6IFwiQUlcIjtcbiAgICAgICAgICAgICAgICBpZiAoaW5pdGlhbHMubGVuZ3RoID4gMikgaW5pdGlhbHMgPSBpbml0aWFscy5zdWJzdHJpbmcoMCwyKTsgLy8g0J7QsdGA0ZbQt9Cw0ZTQvNC+LCDRj9C60YnQviDRgNC+0LvRjCDQtNC+0LLQs9CwXG4gICAgICAgICAgICAgICAgaWYgKCFpbml0aWFscykgaW5pdGlhbHMgPSBcIkFJXCI7IC8vINCe0YHRgtCw0L3QvdGW0LkgZmFsbGJhY2tcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBhdmF0YXJFbC5jcmVhdGVEaXYoe2NsczogQ1NTX0NMQVNTRVMuQVZBVEFSX0lOSVRJQUxTIHx8IFwiYXZhdGFyLWluaXRpYWxzXCIsIHRleHQ6IGluaXRpYWxzfSk7IC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4g0LrQvtC90YHRgtCw0L3RgtGDXG4gICAgICAgIGF2YXRhckVsLnRpdGxlID0gYEluaXRpYWxzOiAke2luaXRpYWxzfWA7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICBwbHVnaW4ubG9nZ2VyLndhcm4oYEZhaWxlZCB0byByZW5kZXIgYXZhdGFyICh0eXBlOiAke2F2YXRhclR5cGVUb1VzZX0sIGNvbnRlbnQ6ICR7YXZhdGFyQ29udGVudFRvVXNlfSwgcm9sZVR5cGU6ICR7YXZhdGFyUm9sZVR5cGV9KTpgLCBlLm1lc3NhZ2UpO1xuICAgICAgY29uc3QgZmFsbGJhY2tJY29uID0gaXNVc2VyID8gXCJ1c2VyLWNpcmNsZVwiIDogKHNwZWNpZmljSWNvbiB8fCBkZWZhdWx0QWlJY29uKTtcbiAgICAgIGF2YXRhckVsLmVtcHR5KCk7IFxuICAgICAgc2V0SWNvbihhdmF0YXJFbC5jcmVhdGVTcGFuKHsgY2xzOiBDU1NfQ0xBU1NFUy5BVkFUQVJfSUNPTiB8fCBcImF2YXRhci1pY29uXCIgfSksIGZhbGxiYWNrSWNvbik7IC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4g0LrQvtC90YHRgtCw0L3RgtGDXG4gICAgICBhdmF0YXJFbC50aXRsZSA9IGBGYWxsYmFjayBBdmF0YXIgKEljb246ICR7ZmFsbGJhY2tJY29ufSlgO1xuICAgIH1cbn1cblxuLy8g0JLQuNC00LDQu9C10L3QviDQvdC10L/RgNCw0LLQuNC70YzQvdGDINGE0YPQvdC60YbRltGOIFJlbmRlcmVyVXRpbHNcbi8vIGV4cG9ydCBmdW5jdGlvbiBSZW5kZXJlclV0aWxzKGFwcDogQXBwLCBwbHVnaW46IE9sbGFtYVBsdWdpbiwgbWVzc2FnZUdyb3VwOiBIVE1MRWxlbWVudCwgYXJnMzogYm9vbGVhbikge1xuLy8gICB0aHJvdyBuZXcgRXJyb3IoXCJGdW5jdGlvbiBub3QgaW1wbGVtZW50ZWQuXCIpO1xuLy8gfSJdfQ==