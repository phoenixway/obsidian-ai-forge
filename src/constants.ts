export const CSS_CLASSES = {
    MESSAGE_GROUP: "message-group",
    SYSTEM_GROUP: "system-message-group",
    MESSAGE: "message",
    SYSTEM_MESSAGE: "system-message",
    OLLAMA_MESSAGE: "ollama-message", // <-- Add/Uncomment
    CONTENT_CONTAINER: "message-content-container",
    CONTENT_COLLAPSIBLE: "message-content-collapsible", // <-- Add/Uncomment
    SYSTEM_ICON: "system-icon",
    SYSTEM_TEXT: "system-message-text",
    TIMESTAMP: "message-timestamp",
    DANGER_OPTION: "danger-option",
    CONTENT: "message-content",
    USER_GROUP: "user-message-group", // Likely needed if not already defined
    OLLAMA_GROUP: "ollama-message-group", // <-- Add/Uncomment
    THINKING_DOTS: "thinking-dots", // Needed by sendMessage placeholder
    THINKING_DOT: "thinking-dot", // Needed by sendMessage placeholder
    USER_MESSAGE: "user-message", // Likely needed if not already defined
    REGENERATE_BUTTON: "regenerate-button", // Likely needed
    COPY_BUTTON: "copy-button", // Likely needed
    DELETE_MESSAGE_BUTTON: "delete-message-button", // Likely needed
    MESSAGE_ARRIVING: "message-arriving",
    VISIBLE: "visible", 
    DISABLED: "disabled",
    ERROR_TEXT: "error-message-text", // Додаємо відсутню константу
    SHOW_MORE_BUTTON: "show-more-button",
    SUBMENU_CONTENT_HIDDEN: "submenu-content-hidden",
    CODE_BLOCK_COPY_BUTTON: "code-block-copy-button",
    CODE_BLOCK_LANGUAGE: "code-block-language",
    AVATAR: "message-group-avatar",

    // Roles/Types
    USER_MESSAGE_GROUP: "user-message-group",
    ERROR_GROUP: "error-message-group",
    ERROR_MESSAGE: "error-message",

    // Content Specific
    CONTENT_COLLAPSED: "message-content-collapsed",
    ERROR_ICON: "error-icon",
    TRANSLATION_CONTAINER: "translation-container",
    TRANSLATION_CONTENT: "translation-content",
    AVATAR_USER: "user-avatar",
    AVATAR_AI: "ai-avatar",

    // Buttons & Actions
    TRANSLATE_BUTTON: "translate-button",
    SUMMARIZE_BUTTON: "summarize-button",
    STOP_BUTTON: "stop-generating-button",
    SCROLL_BOTTOM_BUTTON: "scroll-to-bottom-button",

    // States & Modifiers
    TRANSLATION_PENDING: "translation-pending", // For translate button maybe?
    RECORDING: "recording", // For voice button

    TOOL_MESSAGE: "tool-message", // Клас для повідомлення від інструменту
    TOOL_RESULT_HEADER: "tool-result-header", // Клас для заголовка результату інструменту
    TOOL_RESULT_ICON: "tool-result-icon", // Клас для іконки в заголовку результату
    TOOL_RESULT_CONTENT: "tool-result-content", // Клас для контенту результату інструменту

    TOOL_MESSAGE_GROUP: "tool-message-group", // Клас для обгортки групи повідомлення інструменту
    MESSAGE_WRAPPER: "message-wrapper"      // Клас для внутрішньої обгортки повідомлення (між аватаром та вмістом)
};
export const SCROLL_THRESHOLD = 150;